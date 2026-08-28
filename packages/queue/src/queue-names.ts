/**
 * All 7 workload queues named in the constitution are declared here so every
 * app/worker references the same string constants — but only SUBMISSION and
 * VERIFICATION get an actual BullMQ Queue+Worker instantiated in Phase 1 (no idle
 * Redis connections for the rest). See workers/crawler|sitemap|diagnostics'
 * README stubs for what each is reserved for.
 */
export const QUEUE_NAMES = {
  SUBMISSION: 'submission',
  VERIFICATION: 'verification',
  CRAWLER: 'crawler',
  SITEMAP: 'sitemap',
  DIAGNOSTICS: 'diagnostics',
  WEBHOOK: 'webhook',
  NOTIFICATION: 'notification',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
