import type { Queue } from 'bullmq';

/**
 * One job per submission batch (web, CSV, sitemap or public API). The worker
 * loads the batch's queued `url_submissions` rows and pushes them to each
 * engine; per-URL state lives in Postgres, not in the job.
 */
export const BATCH_JOB_NAME = 'process-batch';
/** Repeatable housekeeping job that re-enqueues batches whose job was lost. */
export const SWEEP_JOB_NAME = 'sweep-stuck-batches';
export const BATCH_JOB_ATTEMPTS = 6;

export interface BatchJobPayload {
  jobType: 'BATCH_SUBMISSION';
  batchId: string;
}

/**
 * jobId = batchId makes enqueueing idempotent: while a job for the batch is
 * waiting/active/delayed, a second add is a no-op. Completed jobs are removed
 * so a later sweep can re-add the same id if rows are still pending.
 */
export async function enqueueBatchJob(queue: Queue, batchId: string, options: { priority?: boolean; delayMs?: number } = {}): Promise<void> {
  const payload: BatchJobPayload = { jobType: 'BATCH_SUBMISSION', batchId };
  await queue.add(BATCH_JOB_NAME, payload, {
    jobId: batchId,
    attempts: BATCH_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 30_000 },
    priority: options.priority ? 1 : 5,
    delay: options.delayMs,
    removeOnComplete: true,
    removeOnFail: { age: 7 * 86_400 },
  });
}
