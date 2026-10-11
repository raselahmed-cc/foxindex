import { z } from 'zod';
import { createProjectSchema, updateProjectSchema } from '@foxindex/validation';
import { openApiRegistry } from './registry';

const projectSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  name: z.string(),
  slug: z.string(),
  indexnowKey: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/projects',
  summary: 'Create a project — generates its IndexNow key',
  tags: ['Projects'],
  security: [{ session: [] }],
  request: {
    body: { content: { 'application/json': { schema: createProjectSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: projectSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects',
  summary: "List the signed-in user's own projects",
  tags: ['Projects'],
  security: [{ session: [] }],
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
  summary: 'Update a project (owner only)',
  tags: ['Projects'],
  security: [{ session: [] }],
  request: {
    params: z.object({ projectId: z.uuid() }),
    body: { content: { 'application/json': { schema: updateProjectSchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: projectSchema } } },
    403: { description: 'Not this project’s owner' },
  },
});
