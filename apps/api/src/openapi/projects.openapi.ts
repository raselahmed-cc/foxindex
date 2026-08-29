import { z } from 'zod';
import { createProjectSchema, updateProjectSchema } from '@foxindex/validation';
import { openApiRegistry } from './registry';

const projectSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/organizations/{organizationId}/projects',
  summary: 'Create a project (OWNER/ADMIN/MANAGER only)',
  tags: ['Projects'],
  security: [{ session: [] }],
  request: {
    params: z.object({ organizationId: z.uuid() }),
    body: { content: { 'application/json': { schema: createProjectSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: projectSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/organizations/{organizationId}/projects',
  summary: 'List projects in an organization',
  tags: ['Projects'],
  security: [{ session: [] }],
  request: { params: z.object({ organizationId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(projectSchema) } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}',
  summary: 'Get a project',
  tags: ['Projects'],
  security: [{ session: [] }],
  request: { params: z.object({ projectId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: projectSchema } } },
    404: { description: 'Not found' },
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/projects/{projectId}',
  summary: 'Update a project (OWNER/ADMIN/MANAGER only)',
  tags: ['Projects'],
  security: [{ session: [] }],
  request: {
    params: z.object({ projectId: z.uuid() }),
    body: { content: { 'application/json': { schema: updateProjectSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: projectSchema } } },
    403: { description: 'Not an OWNER, ADMIN, or MANAGER of this organization' },
  },
});
