import { z } from 'zod';
import { MAX_URLS_PER_BATCH } from './batches.schema';

export const URL_STATUSES = ['indexed', 'submitted', 'queued', 'failed'] as const;
export type UrlStatus = (typeof URL_STATUSES)[number];

export const urlListQuerySchema = z.object({
  status: z.enum(URL_STATUSES).optional(),
  siteId: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export type UrlListQuery = z.infer<typeof urlListQuerySchema>;

/** Engines accepted by the public API. Anything other than "google" goes out via IndexNow. */
export const PUBLIC_ENGINES = ['google', 'bing', 'yandex', 'naver', 'seznam', 'yep', 'indexnow', 'others'] as const;

/** POST /urls — the public API's submit call (also usable from the dashboard). */
export const publicSubmitSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(2048)).min(1).max(Math.min(1000, MAX_URLS_PER_BATCH)),
  /** Optional domain the URLs belong to; URLs on other domains are skipped. */
  site: z.string().trim().toLowerCase().max(253).optional(),
  engines: z.array(z.enum(PUBLIC_ENGINES)).min(1).default(['google', 'indexnow']),
  name: z.string().trim().max(120).optional(),
  priority: z.boolean().default(false),
});
export type PublicSubmitInput = z.infer<typeof publicSubmitSchema>;

export const resubmitUrlsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(1000),
  engines: z
    .object({ google: z.boolean(), others: z.boolean() })
    .refine((e) => e.google || e.others, { message: 'Pick at least one place to submit' })
    .default({ google: true, others: true }),
});
export type ResubmitUrlsInput = z.infer<typeof resubmitUrlsSchema>;

/** Bare hostname: "example.com", "shop.example.co.uk". Scheme/path/port are stripped before validation. */
export const createSiteSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, ''))
    .pipe(z.string().regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a domain like example.com')),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
