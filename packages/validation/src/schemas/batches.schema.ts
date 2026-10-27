import { z } from 'zod';

export const MAX_URLS_PER_BATCH = 10_000;

export const createBatchSchema = z.object({
  /** Empty → the server names it after the domain and date. */
  name: z.string().trim().max(120).optional(),
  urls: z.array(z.string().trim().max(2048)).min(1).max(MAX_URLS_PER_BATCH),
  /** When set, URLs on other domains are skipped instead of submitted. */
  siteId: z.uuid().optional(),
  source: z.enum(['paste', 'csv', 'sitemap', 'api']).default('paste'),
  /** Optional routing for API callers; the price per URL is the same either way. Default: every available engine. */
  engines: z
    .object({ google: z.boolean(), others: z.boolean() })
    .refine((e) => e.google || e.others, { message: 'Pick at least one place to submit' })
    .default({ google: true, others: true }),
  priority: z.boolean().default(false),
  recheckUntilIndexed: z.boolean().default(true),
  notifyWhenDone: z.boolean().default(true),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const renameBatchSchema = z.object({ name: z.string().trim().min(1).max(120) });
export type RenameBatchInput = z.infer<typeof renameBatchSchema>;

export const batchListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.iso.datetime().optional(),
  q: z.string().trim().max(120).optional(),
});
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;
