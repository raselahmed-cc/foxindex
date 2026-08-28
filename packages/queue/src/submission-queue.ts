import type { Queue } from 'bullmq';
import type { SubmissionJobPayload } from '@foxindex/types';

export const SUBMISSION_JOB_NAME = 'process-submission';

/**
 * jobId = urlSubmissionId gives BullMQ-level dedupe on top of the API's Redis
 * idempotency cache: a retried "create submission" request that somehow reaches
 * the enqueue step twice for the same url_submissions row can't produce two jobs.
 */
export async function enqueueSubmissionJob(
  queue: Queue<SubmissionJobPayload>,
  payload: SubmissionJobPayload,
): Promise<void> {
  await queue.add(SUBMISSION_JOB_NAME, payload, {
    jobId: payload.urlSubmissionId,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 7 * 86400 },
  });
}
