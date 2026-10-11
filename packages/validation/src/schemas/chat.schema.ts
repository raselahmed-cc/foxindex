import { z } from 'zod';

export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const sendChatMessageSchema = z
  .object({
    conversationId: z.uuid(),
    body: z.string().trim().max(4000).default(''),
    attachmentIds: z.array(z.uuid()).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
    /** Client-generated id echoed back so the sender can reconcile its optimistic copy. */
    clientId: z.string().min(1).max(64).optional(),
    /** Staff only: buttons the client can tap to answer. */
    quickReplies: z.array(z.string().trim().min(1).max(40)).max(4).optional(),
    /** Set when the client taps a quick-reply button on message `replyTo`. */
    replyTo: z.uuid().optional(),
  })
  .refine((m) => m.body.length > 0 || m.attachmentIds.length > 0, { message: 'Message is empty', path: ['body'] });
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const typingSchema = z.object({
  conversationId: z.uuid(),
  isTyping: z.boolean(),
});
export type TypingInput = z.infer<typeof typingSchema>;

export const updateChatNoteSchema = z.object({ note: z.string().max(2000) });
export type UpdateChatNoteInput = z.infer<typeof updateChatNoteSchema>;

export const markReadSchema = z.object({
  conversationId: z.uuid(),
});
export type MarkReadInput = z.infer<typeof markReadSchema>;

export const setAvailabilitySchema = z.object({ availability: z.enum(['available', 'away']) });
export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

export const chatToTicketSchema = z.object({ subject: z.string().trim().min(3).max(160).optional() });
export type ChatToTicketInput = z.infer<typeof chatToTicketSchema>;
