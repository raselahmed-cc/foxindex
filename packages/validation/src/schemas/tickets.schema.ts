import { z } from 'zod';

export const TICKET_CATEGORIES = ['billing', 'indexing', 'account', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
/** Clients may not self-select "urgent" — staff escalate to it. */
export const CLIENT_TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;
export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_on_client', 'resolved', 'closed'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, 'Tags use letters, numbers, spaces, - and _');
const tagList = z.array(tag).max(10);

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  category: z.enum(TICKET_CATEGORIES).default('other'),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
  siteId: z.uuid().nullable().optional(),
  body: z.string().trim().min(1).max(10_000),
  attachmentIds: z.array(z.uuid()).max(5).default([]),
  /** Staff only: open the ticket on behalf of this client. */
  clientId: z.uuid().optional(),
  tags: tagList.optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const replyTicketSchema = z
  .object({
    body: z.string().trim().max(10_000).default(''),
    attachmentIds: z.array(z.uuid()).max(5).default([]),
    /** Staff only — never shown to the client. */
    internal: z.boolean().default(false),
    resolve: z.boolean().default(false),
    /** Staff only — the macro whose text this reply came from; its actions are applied after sending. */
    macroId: z.uuid().optional(),
  })
  .refine((r) => r.body.length > 0 || r.attachmentIds.length > 0, { message: 'Reply is empty', path: ['body'] });
export type ReplyTicketInput = z.infer<typeof replyTicketSchema>;

export const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  /** null unassigns (admins only). */
  assignedManagerId: z.uuid().nullable().optional(),
  tags: tagList.optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const bulkUpdateTicketsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignedManagerId: z.uuid().nullable().optional(),
    addTags: tagList.optional(),
    removeTags: tagList.optional(),
  })
  .refine((b) => b.status || b.priority || b.assignedManagerId !== undefined || b.addTags?.length || b.removeTags?.length, { message: 'Choose a change to apply' });
export type BulkUpdateTicketsInput = z.infer<typeof bulkUpdateTicketsSchema>;

export const mergeTicketSchema = z.object({ targetId: z.uuid() });
export type MergeTicketInput = z.infer<typeof mergeTicketSchema>;

export const ticketCsatSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type TicketCsatInput = z.infer<typeof ticketCsatSchema>;

export const TICKET_VIEWS = ['open', 'mine', 'unassigned', 'at_risk', 'breached', 'waiting', 'resolved', 'all'] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

export const ticketListQuerySchema = z.object({
  view: z.enum(TICKET_VIEWS).default('open'),
  q: z.string().trim().max(120).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  tag: tag.optional(),
  assigneeId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  sort: z.enum(['activity', 'due', 'created', 'priority']).default('activity'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

export const ticketReportQuerySchema = z.object({
  days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), 'Use 7, 30 or 90').default(30),
});
export type TicketReportQuery = z.infer<typeof ticketReportQuerySchema>;

export const ticketGrantCreditsSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
  note: z.string().trim().max(300).optional(),
});
export type TicketGrantCreditsInput = z.infer<typeof ticketGrantCreditsSchema>;

// ── Macros ──────────────────────────────────────────────────────────────

export const macroActionsSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  addTags: tagList.optional(),
});
export type MacroActions = z.infer<typeof macroActionsSchema>;

export const upsertMacroSchema = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(1).max(5000),
  actions: macroActionsSchema.default({}),
  /** Admins only — shared macros are visible to every agent. */
  shared: z.boolean().default(false),
});
export type UpsertMacroInput = z.infer<typeof upsertMacroSchema>;

// ── Support settings (SLA, business hours, automation) ─────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const slaTargetSchema = z.object({
  firstResponseMinutes: z.number().int().min(5).max(60 * 24 * 30),
  resolutionMinutes: z.number().int().min(15).max(60 * 24 * 90),
  /** false = the clock runs 24/7 (typical for urgent). */
  businessHours: z.boolean(),
});
export type SlaTarget = z.infer<typeof slaTargetSchema>;

export const businessHoursSchema = z
  .object({
    timezone: z.string().min(1).max(64),
    /** Index 0 = Sunday … 6 = Saturday. */
    days: z
      .array(z.object({ open: z.boolean(), start: hhmm, end: hhmm }))
      .length(7)
      .refine((days) => days.every((d) => !d.open || d.start < d.end), 'Each open day must end after it starts'),
    /** ISO dates (YYYY-MM-DD) in the support timezone when the team is off. */
    holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60),
  })
  .refine((b) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: b.timezone });
      return true;
    } catch {
      return false;
    }
  }, { message: 'Unknown timezone', path: ['timezone'] });
export type BusinessHours = z.infer<typeof businessHoursSchema>;

export const supportSettingsSchema = z.object({
  businessHours: businessHoursSchema,
  sla: z.object({ low: slaTargetSchema, normal: slaTargetSchema, high: slaTargetSchema, urgent: slaTargetSchema }),
  automation: z.object({
    /** Assign tickets from clients without a manager to the least-loaded available manager. */
    autoAssign: z.boolean(),
    /** Notify the assignee when this share of an SLA window has elapsed. */
    slaWarnPercent: z.number().int().min(50).max(95),
    /** Email admins when an SLA is breached. */
    escalateBreachesToAdmins: z.boolean(),
    /** 0 disables. */
    waitingReminderHours: z.number().int().min(0).max(24 * 30),
    waitingAutoResolveHours: z.number().int().min(0).max(24 * 60),
    autoCloseResolvedHours: z.number().int().min(0).max(24 * 90),
  }),
  csat: z.object({ enabled: z.boolean() }),
});
export type SupportSettings = z.infer<typeof supportSettingsSchema>;

const weekday = { open: true, start: '09:00', end: '18:00' };
const offDay = { open: false, start: '09:00', end: '18:00' };

/** Sunday–Thursday 09:00–18:00 Dhaka — the Bangladesh working week. */
export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  businessHours: { timezone: 'Asia/Dhaka', days: [weekday, weekday, weekday, weekday, weekday, offDay, offDay], holidays: [] },
  sla: {
    low: { firstResponseMinutes: 8 * 60, resolutionMinutes: 5 * 9 * 60, businessHours: true },
    normal: { firstResponseMinutes: 4 * 60, resolutionMinutes: 2 * 9 * 60, businessHours: true },
    high: { firstResponseMinutes: 60, resolutionMinutes: 9 * 60, businessHours: true },
    urgent: { firstResponseMinutes: 30, resolutionMinutes: 4 * 60, businessHours: false },
  },
  automation: {
    autoAssign: true,
    slaWarnPercent: 80,
    escalateBreachesToAdmins: true,
    waitingReminderHours: 48,
    waitingAutoResolveHours: 7 * 24,
    autoCloseResolvedHours: 7 * 24,
  },
  csat: { enabled: true },
};

/** Staff collision presence on a ticket (socket event `ticket:viewing`). */
export const ticketViewingSchema = z.object({
  ticketId: z.uuid(),
  state: z.enum(['viewing', 'replying', 'left']),
});
export type TicketViewingInput = z.infer<typeof ticketViewingSchema>;
