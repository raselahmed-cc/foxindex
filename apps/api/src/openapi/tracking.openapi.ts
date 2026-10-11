import { z } from 'zod';
import { createSiteSchema, publicSubmitSchema, resubmitUrlsSchema, urlListQuerySchema, URL_STATUSES } from '@foxindex/validation';
import { openApiRegistry } from './registry';

const engineState = z.object({
  status: z.enum(['queued', 'retrying', 'submitted', 'indexed', 'not_indexed', 'failed', 'rejected']),
  attempts: z.number().int(),
  error: z.string().nullable(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
});

const trackedUrl = z.object({
  id: z.uuid(),
  url: z.string(),
  site: z.object({ id: z.uuid(), domain: z.string() }),
  status: z.enum(URL_STATUSES),
  createdAt: z.string(),
  indexedAt: z.string().nullable(),
  lastActivityAt: z.string(),
  engines: z.object({ google: engineState.optional(), indexnow: engineState.optional() }),
});

const batchResult = z.object({
  batch: z.object({ id: z.uuid(), name: z.string(), urlCount: z.number().int(), creditsCharged: z.number().int(), status: z.string() }),
  skipped: z.object({ invalid: z.number(), duplicate: z.number(), otherDomain: z.number(), alreadyIndexed: z.number() }),
  balance: z.number().int().nullable(),
});

const errors = {
  400: { description: 'Validation error — `error.details.reason` is one of NO_VALID_URLS, INSUFFICIENT_CREDITS, API_KEY_MONTHLY_CAP, DAILY_LIMIT, ALL_ALREADY_INDEXED' },
  401: { description: 'Missing, invalid or revoked API key' },
  403: { description: 'The key lacks the needed scope, or is not allowed from this IP' },
  429: { description: 'Rate limited' },
};

openApiRegistry.registerPath({
  method: 'post',
  path: '/urls',
  summary: 'Submit URLs (creates one batch). Google costs 1 credit per URL; IndexNow engines are free.',
  description: 'Send an `Idempotency-Key` header to make retries safe — a repeated key returns the original result. Scope: `submit`.',
  tags: ['Public API'],
  security: [{ apiKey: [] }],
  request: { body: { content: { 'application/json': { schema: publicSubmitSchema } } } },
  responses: { 202: { description: 'Accepted — URLs are queued and sent in the background', content: { 'application/json': { schema: batchResult } } }, ...errors },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/urls',
  summary: 'List your URLs with status per engine. Scope: `status`.',
  tags: ['Public API'],
  security: [{ apiKey: [] }],
  request: { query: urlListQuerySchema },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.object({ items: z.array(trackedUrl), hasMore: z.boolean(), counts: z.record(z.string(), z.number()) }) } },
    },
    ...errors,
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/urls/{id}',
  summary: 'One URL with its full submission history. Scope: `status`.',
  tags: ['Public API'],
  security: [{ apiKey: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: { 200: { description: 'OK', content: { 'application/json': { schema: trackedUrl } } }, 404: { description: 'Not found' }, ...errors },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/urls/resubmit',
  summary: 'Send URLs again by id. Scope: `submit`.',
  tags: ['Public API'],
  security: [{ apiKey: [] }],
  request: { body: { content: { 'application/json': { schema: resubmitUrlsSchema } } } },
  responses: { 202: { description: 'Accepted', content: { 'application/json': { schema: batchResult } } }, ...errors },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/sites',
  summary: 'Your sites with URL counts. Scope: `sites`.',
  tags: ['Public API'],
  security: [{ apiKey: [] }],
  responses: { 200: { description: 'OK' }, ...errors },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/sites',
  summary: 'Add a site by domain. Scope: `sites`.',
  tags: ['Public API'],
  security: [{ apiKey: [] }],
  request: { body: { content: { 'application/json': { schema: createSiteSchema } } } },
  responses: { 201: { description: 'Created' }, ...errors },
});
