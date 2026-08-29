import { z } from 'zod';
import { openApiRegistry } from './registry';

const urlSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  domainId: z.uuid(),
  rawUrl: z.string(),
  normalizedUrl: z.string(),
  createdAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}/urls',
  summary: 'List known URLs in a project (read-only — created only via submission)',
  tags: ['URLs'],
  security: [{ session: [] }],
  request: { params: z.object({ projectId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(urlSchema) } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/urls/{urlId}',
  summary: 'Get a URL',
  tags: ['URLs'],
  security: [{ session: [] }],
  request: { params: z.object({ urlId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: urlSchema } } },
    404: { description: 'Not found' },
  },
});
