import { z } from 'zod';
import { openApiRegistry } from './registry';

const conversationSchema = z.object({
  id: z.uuid(),
  peer: z.object({ id: z.uuid(), name: z.string(), whatsapp: z.string().nullable() }),
  createdAt: z.string(),
});

const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  senderId: z.uuid(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/chat/conversations',
  summary: "List the signed-in user's chat conversations — a client's one conversation with their manager, or a manager's one per assigned client",
  tags: ['Chat'],
  security: [{ bearer: [] }],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(conversationSchema) } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/chat/conversations/{conversationId}/messages',
  summary: 'Message history for a conversation — real-time send/typing/read happens over the /chat Socket.io namespace, not REST',
  tags: ['Chat'],
  security: [{ bearer: [] }],
  request: { params: z.object({ conversationId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(messageSchema) } } },
    403: { description: 'Not a participant in this conversation' },
    404: { description: 'Conversation not found' },
  },
});
