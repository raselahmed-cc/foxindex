import type { Tone } from '@/components/dash/ui';
import type { IconName } from '@/components/dash/icons';
import type { Attachment } from './api-types';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_client' | 'resolved' | 'closed';
export type TicketCategory = 'billing' | 'indexing' | 'account' | 'other';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketView = 'open' | 'mine' | 'unassigned' | 'at_risk' | 'breached' | 'waiting' | 'resolved' | 'all';
export type TicketSort = 'activity' | 'due' | 'created' | 'priority';
export type SlaState = 'ok' | 'at_risk' | 'breached' | 'paused';

export interface SlaSummary {
  target: 'first_response' | 'resolution';
  dueAt: string;
  state: SlaState;
}

export interface TicketItem {
  id: string;
  number: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  tags: string[];
  lastMessageAt: string;
  createdAt: string;
  unread: boolean;
  preview: { body: string; senderName: string } | null;
  client?: { id: string; name: string; email: string };
  assignee?: { id: string; name: string } | null;
  sla?: SlaSummary | null;
  csatRating?: number | null;
}

export interface TicketList {
  counts: Partial<Record<TicketView, number>>;
  hasMore: boolean;
  items: TicketItem[];
}

export interface TicketMessage {
  id: string;
  kind: 'message' | 'event';
  body: string;
  internal: boolean;
  senderId: string | null;
  senderName: string;
  senderRole: string;
  createdAt: string;
  meta: Record<string, unknown> | null;
  attachments: Attachment[];
}

export interface TicketDetail {
  id: string;
  number: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  source: 'web' | 'chat' | 'staff' | 'api';
  tags: string[];
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  conversationId: string | null;
  mergedInto: { id: string; number: string } | null;
  site: { id: string; domain: string } | null;
  manager: { id: string; name: string } | null;
  csat: { rating: number; comment: string | null; at: string } | null;
  csatEnabled: boolean;
  sla?: {
    current: SlaSummary | null;
    firstResponseDueAt: string | null;
    resolutionDueAt: string | null;
    paused: boolean;
    firstResponseBreached: boolean;
    resolutionBreached: boolean;
  };
  related?: { id: string; number: string; subject: string; status: TicketStatus; createdAt: string }[];
  expectedReplyBy?: string | null;
  client: { id: string; name: string; email?: string; creditBalanceCached?: number; whatsapp?: string | null; company?: string | null; createdAt?: string };
  messages: TicketMessage[];
}

export interface MacroActions {
  status?: TicketStatus;
  priority?: TicketPriority;
  addTags?: string[];
}

export interface Macro {
  id: string;
  title: string;
  body: string;
  actions: MacroActions;
  shared: boolean;
  usageCount: number;
  createdByName: string | null;
  updatedAt: string;
  canEdit: boolean;
}

export const STATUS: Record<TicketStatus, { tone: Tone; label: string; clientLabel?: string }> = {
  open: { tone: 'warn', label: 'Open' },
  in_progress: { tone: 'info', label: 'In progress' },
  waiting_on_client: { tone: 'muted', label: 'Waiting on client', clientLabel: 'Waiting on you' },
  resolved: { tone: 'ok', label: 'Resolved' },
  closed: { tone: 'muted', label: 'Closed' },
};

export const PRIORITY: Record<TicketPriority, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'text-auth-bad' },
  high: { label: 'High', className: 'text-auth-warn' },
  normal: { label: 'Normal', className: 'text-auth-text2' },
  low: { label: 'Low', className: 'text-auth-text3' },
};

export const CATEGORIES: { value: TicketCategory; label: string; icon: IconName }[] = [
  { value: 'billing', label: 'Billing', icon: 'card' },
  { value: 'indexing', label: 'Indexing', icon: 'upload' },
  { value: 'account', label: 'Account', icon: 'user' },
  { value: 'other', label: 'Other', icon: 'info' },
];

export const STAFF_VIEWS: { value: TicketView; label: string; hint: string }[] = [
  { value: 'open', label: 'All open', hint: 'Every open ticket you can see' },
  { value: 'mine', label: 'Assigned to me', hint: 'Open tickets you own' },
  { value: 'unassigned', label: 'Unassigned', hint: 'Open tickets with no owner' },
  { value: 'at_risk', label: 'SLA at risk', hint: 'Most of the SLA window used' },
  { value: 'breached', label: 'SLA breached', hint: 'Past the first-reply or resolution target' },
  { value: 'waiting', label: 'Waiting on client', hint: 'Clock paused until the client replies' },
  { value: 'resolved', label: 'Resolved & closed', hint: 'Done tickets' },
  { value: 'all', label: 'Everything', hint: 'All tickets' },
];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** "12m", "3h 20m", "2d 4h" — compact durations for SLA badges. */
export function shortDuration(ms: number): string {
  if (Math.abs(ms) > 0 && Math.abs(ms) < 60_000) return '<1m';
  const m = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Badge text + tone for an SLA summary at `now`. */
export function slaBadge(sla: SlaSummary, now: number): { text: string; tone: Tone; title: string } {
  const what = sla.target === 'first_response' ? 'First reply' : 'Resolution';
  const delta = new Date(sla.dueAt).getTime() - now;
  if (sla.state === 'paused') return { text: 'SLA paused', tone: 'muted', title: `${what} clock paused while waiting on the client` };
  if (sla.state === 'breached' || delta <= 0) return { text: `Overdue ${shortDuration(delta)}`, tone: 'bad', title: `${what} target passed` };
  return {
    text: `${sla.target === 'first_response' ? 'Reply' : 'Resolve'} in ${shortDuration(delta)}`,
    tone: sla.state === 'at_risk' ? 'warn' : 'info',
    title: `${what} due ${new Date(sla.dueAt).toLocaleString()}`,
  };
}

/** Fill {{placeholders}} in a macro body with the open ticket's details. */
export function renderMacro(body: string, ctx: { clientName: string; agentName: string; ticketNumber: string; subject: string }): string {
  const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;
  const values: Record<string, string> = {
    'client.name': ctx.clientName,
    'client.firstName': first(ctx.clientName),
    'agent.name': ctx.agentName,
    'agent.firstName': first(ctx.agentName),
    'ticket.number': ctx.ticketNumber,
    'ticket.subject': ctx.subject,
  };
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}

export const MACRO_PLACEHOLDERS = ['{{client.firstName}}', '{{client.name}}', '{{agent.firstName}}', '{{ticket.number}}', '{{ticket.subject}}'];
