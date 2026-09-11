import { z } from 'zod';
import { MAX_URLS_PER_SUBMISSION_REQUEST } from '@foxindex/config';
import { UrlSubmissionState } from '@foxindex/types';

/**
 * No domainId — each URL's own hostname resolves (or auto-creates) its
 * domain, so a single batch can freely span multiple domains. See
 * docs/adr/0012-auto-create-domain-on-submit.md.
 */
export const submitUrlsSchema = z.object({
  urls: z
    .array(z.url())
    .min(1, 'At least one URL is required')
    .max(
      MAX_URLS_PER_SUBMISSION_REQUEST,
      `A single request can submit at most ${MAX_URLS_PER_SUBMISSION_REQUEST} URLs`,
    ),
});
export type SubmitUrlsInput = z.infer<typeof submitUrlsSchema>;

export const listSubmissionsQuerySchema = z.object({
  state: z.enum(UrlSubmissionState).optional(),
  domainId: z.uuid().optional(),
  since: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
