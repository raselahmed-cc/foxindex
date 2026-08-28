/**
 * Reference exponential-backoff formula. Providers themselves never retry (see
 * IndexingProvider's doc comment) — this is used directly as the source for
 * BullMQ's job-level `backoff` option in packages/queue, kept here so the retry
 * math lives next to the provider error classifications that decide `retryable`.
 */
export function computeBackoffMs(
  attempt: number,
  base = 1000,
  max = 60000,
  jitter = true,
): number {
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  if (!jitter) return exponential;
  return Math.floor(exponential / 2 + Math.random() * (exponential / 2));
}
