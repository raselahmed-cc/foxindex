import { z } from 'zod';
import { submitUrlsSchema } from '@foxindex/validation';
import { SubmissionFailureReason, UrlSubmissionState } from '@foxindex/types';
import { openApiRegistry } from './registry';

const acceptedSubmissionSchema = z.object({
  id: z.uuid(),
  urlId: z.uuid(),
  normalizedUrl: z.string(),
  hostname: z.string(),
  state: z.enum(UrlSubmissionState),
});

const rejectedUrlSchema = z.object({
  url: z.string(),
  reason: z.enum(SubmissionFailureReason),
  message: z.string(),
});

const projectIdParam = z.object({ projectId: z.uuid() });

openApiRegistry.registerPath({
  method: 'post',
  path: '/projects/{projectId}/submissions',
  summary: 'Submit URLs for IndexNow discovery (async — 202, poll status)',
  description:
    "Validates and normalizes each URL. Every URL in the batch submits under the project's own single IndexNow key, regardless of hostname — IndexNow itself rejects a URL whose host doesn't actually serve that key. Rejects a URL only if it can't be parsed or the project owner is out of credits (no row created for those), then enqueues one job per accepted URL. Supports an Idempotency-Key header to make retries safe.",
  tags: ['Submissions'],
  security: [{ session: [] }, { apiKey: [] }],
  request: {
    params: projectIdParam,
    body: { content: { 'application/json': { schema: submitUrlsSchema } } },
  },
  responses: {
    202: {
      description: 'Accepted — per-URL accepted/rejected breakdown',
      content: {
        'application/json': {
          schema: z.object({
            submissions: z.array(acceptedSubmissionSchema),
            rejected: z.array(rejectedUrlSchema),
          }),
        },
      },
    },
    429: { description: 'Rate limited, or a request with this Idempotency-Key is already in flight' },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}/submissions',
  summary: 'List submissions in a project',
  tags: ['Submissions'],
  security: [{ session: [] }],
  request: {
    params: projectIdParam,
    query: z.object({
      state: z.enum(UrlSubmissionState).optional(),
      since: z.string().optional(),
      limit: z.coerce.number().optional(),
    }),
  },
  responses: {
    200: { description: 'OK' },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/projects/{projectId}/submissions/{submissionId}',
  summary: 'Get a submission, including its full attempt history',
  tags: ['Submissions'],
  security: [{ session: [] }],
  request: { params: z.object({ projectId: z.uuid(), submissionId: z.uuid() }) },
  responses: {
    200: { description: 'OK' },
    404: { description: 'Not found' },
  },
});
