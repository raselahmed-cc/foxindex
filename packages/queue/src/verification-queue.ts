import type { Queue } from 'bullmq';
import type { VerificationJobPayload } from '@foxindex/types';

export const VERIFICATION_JOB_NAME = 'process-domain-verification';

/**
 * No fixed jobId here (unlike submissions): a domain can legitimately be
 * re-verified later (?recheck=true) after a prior verification job has already
 * completed, and BullMQ retains completed job IDs until they age out — reusing
 * domainId as the jobId risks a silent no-op on a legitimate recheck. Whether a
 * new verification job SHOULD be enqueued (e.g. "don't re-verify if already
 * VERIFIED") is a decision the API's domains service makes before calling this,
 * not something the queue layer dedupes.
 */
export async function enqueueVerificationJob(
  queue: Queue<VerificationJobPayload>,
  payload: VerificationJobPayload,
): Promise<void> {
  await queue.add(VERIFICATION_JOB_NAME, payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 7 * 86400 },
  });
}
