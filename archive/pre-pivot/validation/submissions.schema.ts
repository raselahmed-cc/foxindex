import { z } from 'zod';
import { MAX_URLS_PER_SUBMISSION_REQUEST } from '@foxindex/config';
import { UrlSubmissionState } from '@foxindex/types';

/**
 * No domainId — the project itself owns the one IndexNow key every URL in
 * it uses (docs/adr/0013). A batch can list any URLs at all; each is just
 * validated and normalized independently.
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
  since: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
