import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

import { Worker, type Job } from 'bullmq';
import { createDbClient } from '@foxindex/database';
import { createRedisConnection, QUEUE_NAMES } from '@foxindex/queue';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger, logEvent } from '@foxindex/logger';
import { IndexNowProvider, ProviderRouter } from '@foxindex/providers';
import { SubmissionFailureReason, UrlSubmissionState, type SubmissionJobPayload } from '@foxindex/types';
import { processSubmission } from './processors/process-submission';
import { createDrizzleSubmissionRepository } from './processors/submission-repository';

const logger = createLogger(SERVICE_NAMES.SUBMISSION_WORKER);

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error('DATABASE_URL and REDIS_URL must be set');
}

const { db, pool } = createDbClient({ connectionString: databaseUrl });
const repository = createDrizzleSubmissionRepository(db);

const providerRouter = new ProviderRouter();
providerRouter.register(new IndexNowProvider());

const connection = createRedisConnection(redisUrl);
connection.on('error', (error: unknown) => {
  const message =
    (error instanceof AggregateError ? error.errors[0]?.message : undefined) ??
    (error instanceof Error ? error.message : String(error));
  logEvent(logger, 'redis.connection_error', 'Redis connection error', { message });
});

const concurrency = Number(process.env.SUBMISSION_WORKER_CONCURRENCY ?? 5);

const worker = new Worker<SubmissionJobPayload>(
  QUEUE_NAMES.SUBMISSION,
  async (job: Job<SubmissionJobPayload>) => {
    await processSubmission(repository, providerRouter, logger, job.data, job.id ?? 'unknown', job.attemptsMade + 1);
  },
  { connection, concurrency },
);

worker.on('completed', (job) => {
  logEvent(logger, 'submission.job_completed', `Job ${job.id} completed`, {
    jobId: job.id,
    urlSubmissionId: job.data.urlSubmissionId,
  });
});

worker.on('failed', async (job, error) => {
  logEvent(logger, 'submission.job_failed', `Job ${job?.id} failed`, {
    jobId: job?.id,
    urlSubmissionId: job?.data.urlSubmissionId,
    attemptsMade: job?.attemptsMade,
    error: error.message,
  });

  const maxAttempts = job?.opts.attempts ?? 1;
  if (job && job.attemptsMade >= maxAttempts) {
    await repository.updateSubmission(job.data.urlSubmissionId, {
      state: UrlSubmissionState.FAILED,
      failureReason: SubmissionFailureReason.NETWORK_ERROR,
      failureDetail: `Exhausted ${maxAttempts} attempts: ${error.message}`,
    });
  }
});

logEvent(logger, 'worker.started', 'Submission worker started', { concurrency });

async function shutdown(signal: string): Promise<void> {
  logEvent(logger, 'worker.shutdown', `Received ${signal}, shutting down gracefully`, { signal });
  await worker.close();
  await connection.quit();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
