import { z } from 'zod';
import { createDomainSchema } from '@foxindex/validation';
import { DomainVerificationStatus } from '@foxindex/types';
import { openApiRegistry } from './registry';

const domainSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  hostname: z.string(),
  indexnowKey: z.string(),
  keyFileUrl: z.url(),
  verificationStatus: z.enum(DomainVerificationStatus),
  verifiedAt: z.string().nullable(),
});

const domainVerificationSchema = z.object({
  id: z.uuid(),
  method: z.string(),
  status: z.string(),
  checkedUrl: z.string(),
  httpStatusCode: z.number().nullable(),
  failureReason: z.string().nullable(),
  attemptedAt: z.string(),
});

const projectIdParam = z.object({ projectId: z.uuid() });
const domainIdParams = z.object({ projectId: z.uuid(), domainId: z.uuid() });

openApiRegistry.registerPath({
  method: 'post',
  path: '/projects/{projectId}/domains',
  summary: 'Add a domain (generates an IndexNow key + key-file URL)',
  tags: ['Domains'],
  security: [{ session: [] }],
  request: {
    params: projectIdParam,
    body: { content: { 'application/json': { schema: createDomainSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: domainSchema } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}/domains',
  summary: 'List domains in a project',
  tags: ['Domains'],
  security: [{ session: [] }],
  request: { params: projectIdParam },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.array(domainSchema) } } },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}/domains/{domainId}',
  summary: 'Get a domain',
  tags: ['Domains'],
  security: [{ session: [] }],
  request: { params: domainIdParams },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: domainSchema } } },
    404: { description: 'Not found' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/projects/{projectId}/domains/{domainId}/verify',
  summary: 'Request (or re-request) domain verification',
  description:
    'Enqueues an async verification job that checks the IndexNow key file over SSRF-safe HTTP. Returns immediately — poll GET .../verifications for the result.',
  tags: ['Domains'],
  security: [{ session: [] }],
  request: {
    params: domainIdParams,
    query: z.object({ recheck: z.coerce.boolean().optional() }),
  },
  responses: {
    202: {
      description: 'Verification enqueued (or already verified and recheck was not requested)',
      content: { 'application/json': { schema: z.object({ enqueued: z.boolean() }) } },
    },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}/domains/{domainId}/verifications',
  summary: 'Domain verification attempt history',
  tags: ['Domains'],
  security: [{ session: [] }],
  request: { params: domainIdParams },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.array(domainVerificationSchema) } },
    },
  },
});
