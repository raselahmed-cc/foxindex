import { z } from 'zod';

export const startVisitorChatSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  /** Optional WhatsApp/phone so staff can follow up outside the website. */
  phone: z.string().trim().max(32).optional(),
  message: z.string().trim().min(1, 'Write a message').max(2000),
  /** Page the chat was opened from (path + hash only). */
  page: z.string().trim().max(200).optional(),
  /** Hidden honeypot field — real browsers leave it empty, naive bots fill it. */
  website: z.string().max(0).optional(),
});
export type StartVisitorChatInput = z.infer<typeof startVisitorChatSchema>;

export const visitorMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type VisitorMessageInput = z.infer<typeof visitorMessageSchema>;

export const visitorChatListQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
});
export type VisitorChatListQuery = z.infer<typeof visitorChatListQuerySchema>;

export const updateVisitorChatSchema = z
  .object({
    status: z.enum(['open', 'closed']).optional(),
    /** Staff member taking the chat; null releases it back to the pool. */
    assignedTo: z.uuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.assignedTo !== undefined, { message: 'Nothing to change' });
export type UpdateVisitorChatInput = z.infer<typeof updateVisitorChatSchema>;
