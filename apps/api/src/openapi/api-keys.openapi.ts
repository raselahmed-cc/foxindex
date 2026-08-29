import { z } from 'zod';
import { createApiKeySchema } from '@foxindex/validation';
import { ApiKeyScope } from '@foxindex/types';
import { openApiRegistry } from './registry';

const apiKeySchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  projectId: z.uuid().nullable(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.enum(ApiKeyScope)),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});

const organizationIdParam = z.object({ organizationId: z.uuid() });

openApiRegistry.registerPath({
  method: 'post',
  path: '/organizations/{organizationId}/api-keys',
  summary: 'Create an API key (OWNER/ADMIN only) — plaintext shown once',
  tags: ['API Keys'],
  security: [{ session: [] }],
  request: {
    params: organizationIdParam,
    body: { content: { 'application/json': { schema: createApiKeySchema } } },
  },
  responses: {
    201: {
      description: 'Created — `plaintext` is the only time the full key is ever returned',
      content: {
        'application/json': { schema: apiKeySchema.extend({ plaintext: z.string() }) },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/organizations/{organizationId}/api-keys',
  summary: 'List API keys (OWNER/ADMIN only) — never includes the key hash',
  tags: ['API Keys'],
  security: [{ session: [] }],
  request: { params: organizationIdParam },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(apiKeySchema) } } },
  },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/organizations/{organizationId}/api-keys/{keyId}',
  summary: 'Revoke an API key (OWNER/ADMIN only)',
  tags: ['API Keys'],
  security: [{ session: [] }],
  request: { params: z.object({ organizationId: z.uuid(), keyId: z.uuid() }) },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiKeySchema } } },
    404: { description: 'Not found' },
  },
});
