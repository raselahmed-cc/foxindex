import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

import { Worker, type Job } from 'bullmq';
import { createDbClient } from '@foxindex/database';
import { createRedisConnection, QUEUE_NAMES } from '@foxindex/queue';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger, logEvent } from '@foxindex/logger';
import type { VerificationJobPayload } from '@foxindex/types';
import { processDomainVerification } from './processors/process-domain-verification';
import { createDrizzleVerificationRepository } from './processors/verification-repository';

const logger = createLogger(SERVICE_NAMES.VERIFICATION_WORKER);

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error('DATABASE_URL and REDIS_URL must be set');
}

const { db, pool } = createDbClient({ connectionString: databaseUrl });
const repository = createDrizzleVerificationRepository(db);

const connection = createRedisConnection(redisUrl);
connection.on('error', (error: unknown) => {
  const message =
    (error instanceof AggregateError ? error.errors[0]?.message : undefined) ??
    (error instanceof Error ? error.message : String(error));
  logEvent(logger, 'redis.connection_error', 'Redis connection error', { message });
});

const concurrency = Number(process.env.VERIFICATION_WORKER_CONCURRENCY ?? 5);

const worker = new Worker<VerificationJobPayload>(
  QUEUE_NAMES.VERIFICATION,
  async (job: Job<VerificationJobPayload>) => {
    await processDomainVerification(repository, logger, job.data, job.id ?? 'unknown');
  },
  { connection, concurrency },
);

worker.on('completed', (job) => {
  logEvent(logger, 'verification.job_completed', `Job ${job.id} completed`, {
    jobId: job.id,
    domainId: job.data.domainId,
  });
});

worker.on('failed', async (job, error) => {
  logEvent(logger, 'verification.job_failed', `Job ${job?.id} failed`, {
    jobId: job?.id,
    domainId: job?.data.domainId,
    attemptsMade: job?.attemptsMade,
    error: error.message,
  });

  // Once BullMQ has genuinely given up (not just this attempt, all of them),
  // reflect that in Postgres — otherwise a domain whose retries were all
  // exhausted on transient errors stays stuck at PENDING forever with no
  // record the worker ever stopped trying.
  const maxAttempts = job?.opts.attempts ?? 1;
  if (job && job.attemptsMade >= maxAttempts) {
    await repository.markDomainFailed(job.data.domainId);
  }
});

logEvent(logger, 'worker.started', 'Verification worker started', { concurrency });

async function shutdown(signal: string): Promise<void> {
  logEvent(logger, 'worker.shutdown', `Received ${signal}, shutting down gracefully`, { signal });
  await worker.close();
  await connection.quit();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
