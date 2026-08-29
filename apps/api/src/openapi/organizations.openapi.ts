import { z } from 'zod';
import { createOrganizationSchema, updateOrganizationSchema } from '@foxindex/validation';
import { openApiRegistry } from './registry';

const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/organizations',
  summary: 'Create an organization (caller becomes OWNER)',
  tags: ['Organizations'],
  security: [{ session: [] }],
  request: { body: { content: { 'application/json': { schema: createOrganizationSchema } } } },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: organizationSchema } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/organizations',
  summary: "Organizations the current user is a member of",
  tags: ['Organizations'],
  security: [{ session: [] }],
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.array(organizationSchema) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/organizations/{organizationId}',
  summary: 'Get an organization',
  tags: ['Organizations'],
  security: [{ session: [] }],
  request: { params: z.object({ organizationId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: organizationSchema } } },
    404: { description: 'Not found' },
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/organizations/{organizationId}',
  summary: 'Update an organization (OWNER/ADMIN only)',
  tags: ['Organizations'],
  security: [{ session: [] }],
  request: {
    params: z.object({ organizationId: z.uuid() }),
    body: { content: { 'application/json': { schema: updateOrganizationSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: organizationSchema } } },
    403: { description: 'Not an OWNER or ADMIN of this organization' },
  },
});
