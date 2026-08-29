import { z } from 'zod';
import { openApiRegistry } from './registry';

openApiRegistry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Liveness check — process is up, no dependencies checked',
  tags: ['Health'],
  responses: {
    200: {
      description: 'Process is up',
      content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/health/ready',
  summary: 'Readiness check — database and Redis connectivity',
  tags: ['Health'],
  responses: {
    200: {
      description: 'Ready to receive traffic',
      content: {
        'application/json': {
          schema: z.object({ status: z.literal('ok'), database: z.boolean(), redis: z.boolean() }),
        },
      },
    },
    503: { description: 'Not ready — database or Redis is unreachable' },
  },
});
