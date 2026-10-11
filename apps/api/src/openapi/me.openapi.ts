import { z } from 'zod';
import { UserRole, UserStatus } from '@foxindex/types';
import { openApiRegistry } from './registry';

const publicUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/me',
  summary: 'Current authenticated user',
  tags: ['Auth'],
  security: [{ bearer: [] }],
  responses: {
    200: {
      description: 'The signed-in user',
      content: { 'application/json': { schema: publicUserSchema } },
    },
    401: { description: 'Not authenticated' },
  },
});
