/**
 * Workload queues named in the constitution are declared here so every
 * app/worker references the same string constants — but only SUBMISSION
 * gets an actual BullMQ Queue+Worker instantiated (no idle Redis
 * connections for the rest). VERIFICATION was removed entirely (docs/adr/0013
 * — no more per-domain verification; a project's IndexNow key is generated
 * and used directly). See workers/crawler|sitemap|diagnostics' README stubs
 * for what each remaining name is reserved for.
 */
export const QUEUE_NAMES = {
  SUBMISSION: 'submission',
  CRAWLER: 'crawler',
  SITEMAP: 'sitemap',
  DIAGNOSTICS: 'diagnostics',
  WEBHOOK: 'webhook',
  NOTIFICATION: 'notification',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
