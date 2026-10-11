import { z } from 'zod';
import { API_KEY_SCOPES, createApiKeySchema, updateApiKeySchema } from '@foxindex/validation';
import { openApiRegistry } from './registry';

const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  keyLast4: z.string(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  siteId: z.uuid().nullable(),
  monthlyCreditCap: z.number().int().nullable(),
  ipAllowlist: z.array(z.string()),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api-keys',
  summary: 'Create an API key — the plaintext key is returned once',
  tags: ['API keys'],
  security: [{ bearer: [] }],
  request: { body: { content: { 'application/json': { schema: createApiKeySchema } } } },
  responses: { 201: { description: 'Created', content: { 'application/json': { schema: apiKeySchema.extend({ plaintext: z.string() }) } } } },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api-keys',
  summary: 'List your API keys (never includes the key itself)',
  tags: ['API keys'],
  security: [{ bearer: [] }],
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ keys: z.array(apiKeySchema) }) } } } },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api-keys/{keyId}',
  summary: 'Change a key’s name, scopes, site, monthly cap or IP allowlist',
  tags: ['API keys'],
  security: [{ bearer: [] }],
  request: { params: z.object({ keyId: z.uuid() }), body: { content: { 'application/json': { schema: updateApiKeySchema } } } },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: apiKeySchema } } } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/api-keys/{keyId}',
  summary: 'Revoke an API key',
  tags: ['API keys'],
  security: [{ bearer: [] }],
  request: { params: z.object({ keyId: z.uuid() }) },
  responses: { 200: { description: 'Revoked' } },
});
