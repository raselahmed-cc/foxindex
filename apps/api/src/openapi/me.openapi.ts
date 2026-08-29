import { z } from 'zod';
import { openApiRegistry } from './registry';

const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/me',
  summary: 'Current authenticated user',
  tags: ['Auth'],
  security: [{ session: [] }],
  responses: {
    200: {
      description: 'The signed-in user',
      content: { 'application/json': { schema: z.object({ user: sessionUserSchema }) } },
    },
    401: { description: 'Not authenticated' },
  },
});
