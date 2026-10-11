import { z } from 'zod';
import { assignManagerSchema, grantCreditsSchema } from '@foxindex/validation';
import { UserRole, UserStatus } from '@foxindex/types';
import { openApiRegistry } from './registry';

const adminUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
  assignedManagerId: z.uuid().nullable(),
  creditBalanceCached: z.number().int(),
  createdAt: z.string(),
});

const managerSchema = z.object({ id: z.uuid(), name: z.string(), email: z.string() });

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/users',
  summary: 'List users — a manager sees only their assigned clients; admin/superadmin see everyone',
  tags: ['Admin'],
  security: [{ bearer: [] }],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(adminUserSchema) } } },
    403: { description: 'Not a manager, admin, or superadmin' },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/admin/managers',
  summary: 'List active managers, for the assign-manager picker (Admin/Superadmin only)',
  tags: ['Admin'],
  security: [{ bearer: [] }],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(managerSchema) } } },
    403: { description: 'Not an admin or superadmin' },
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/admin/users/{userId}/assign-manager',
  summary: "Reassign a user's manager (Admin/Superadmin only)",
  tags: ['Admin'],
  security: [{ bearer: [] }],
  request: {
    params: z.object({ userId: z.uuid() }),
    body: { content: { 'application/json': { schema: assignManagerSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: adminUserSchema } } },
    403: { description: 'Not an admin or superadmin' },
    404: { description: 'User or manager not found' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/users/{userId}/approve',
  summary: 'Approve a pending_approval user — manager (own clients only), admin, or superadmin',
  tags: ['Admin'],
  security: [{ bearer: [] }],
  request: {
    params: z.object({ userId: z.uuid() }),
    body: { content: { 'application/json': { schema: z.object({ startingCredit: z.number().int().min(0).optional() }) } } },
  },
  responses: {
    200: { description: 'OK' },
    403: { description: "Not this user's manager, and not admin/superadmin" },
    404: { description: 'User not found' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/admin/users/{userId}/credits/grant',
  summary: "Grant credits to a user's balance — manager (own clients only), admin, or superadmin",
  tags: ['Admin'],
  security: [{ bearer: [] }],
  request: {
    params: z.object({ userId: z.uuid() }),
    body: { content: { 'application/json': { schema: grantCreditsSchema } } },
  },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.object({ userId: z.string(), balance: z.number().int() }) } },
    },
    403: { description: "Not this user's manager, and not admin/superadmin" },
    404: { description: 'User not found' },
  },
});
