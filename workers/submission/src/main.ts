import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { config } from 'dotenv';

// Local dev reads the repo .env; in containers the variables come from the environment.
config({ path: resolve(__dirname, '../../../.env'), quiet: true });

import { and, inArray, lt, sql } from 'drizzle-orm';
import { DelayedError, Queue, Worker, type Job } from 'bullmq';
import { createDbClient, urlSubmissions } from '@foxindex/database';
import { BATCH_JOB_NAME, createRedisConnection, enqueueBatchJob, QUEUE_NAMES, SWEEP_JOB_NAME, type BatchJobPayload } from '@foxindex/queue';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger, logEvent } from '@foxindex/logger';
import { GoogleIndexingClient, IndexNowProvider } from '@foxindex/providers';
import { msUntilQuotaReset, processBatch, type ProcessorDeps } from './batch-processor';
import { runIndexChecks } from './index-checker';
import { googleOAuthFromEnv } from './google-connections';

const logger = createLogger(SERVICE_NAMES.SUBMISSION_WORKER);

/** Written every 15 s; the container health check fails if it goes stale. */
export const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? resolve(tmpdir(), 'foxindex-worker-heartbeat');
const SWEEP_EVERY_MS = 5 * 60_000;
const NO_ACCOUNTS_RETRY_MS = 30 * 60_000;
/** How often the Google index checker looks for URLs that are due. */
const INDEX_CHECK_EVERY_MS = 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL');
  const redisUrl = requireEnv('REDIS_URL');
  const encryptionKey = requireEnv('ENCRYPTION_KEY');
  if (process.env.NODE_ENV === 'production' && encryptionKey.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters in production');

  const { db, pool } = createDbClient({ connectionString: databaseUrl, ssl: process.env.DATABASE_SSL === 'true' });
  const connection = createRedisConnection(redisUrl);
  connection.on('error', (error: unknown) => {
    const message = (error instanceof AggregateError ? error.errors[0]?.message : undefined) ?? (error instanceof Error ? error.message : String(error));
    logEvent(logger, 'redis.connection_error', 'Redis connection error', { message });
  });

  const indexNowProviders = new Map<string, IndexNowProvider>();
  const deps: ProcessorDeps = {
    db,
    redis: connection,
    encryptionKey,
    logger,
    google: new GoogleIndexingClient(),
    googleOAuth: googleOAuthFromEnv(),
    indexNow: (endpoint) => {
      const key = endpoint ?? 'default';
      if (!indexNowProviders.has(key)) indexNowProviders.set(key, new IndexNowProvider({ apiBaseUrl: endpoint }));
      return indexNowProviders.get(key)!;
    },
  };

  const queue = new Queue(QUEUE_NAMES.SUBMISSION, { connection });

  /** Re-enqueue batches whose rows are pending but whose job vanished (e.g. Redis was down at submit time). */
  async function sweep(): Promise<number> {
    const stuck = await db
      .selectDistinct({ batchId: urlSubmissions.batchId })
      .from(urlSubmissions)
      .where(and(inArray(urlSubmissions.status, ['queued', 'retrying']), lt(urlSubmissions.createdAt, sql`now() - interval '10 minutes'`)))
      .limit(500);
    let requeued = 0;
    for (const { batchId } of stuck) {
      if (!batchId) continue;
      const job = await queue.getJob(batchId);
      if (job) {
        const state = await job.getState();
        if (state !== 'completed' && state !== 'failed') continue;
        await job.remove();
      }
      await enqueueBatchJob(queue, batchId);
      requeued++;
    }
    if (requeued) logEvent(logger, 'sweep.requeued', `Re-enqueued ${requeued} stuck batches`, { requeued });
    return requeued;
  }

  await queue.upsertJobScheduler('sweep', { every: SWEEP_EVERY_MS }, { name: SWEEP_JOB_NAME, opts: { removeOnComplete: true, removeOnFail: 50 } });

  const concurrency = Number(process.env.SUBMISSION_WORKER_CONCURRENCY ?? 4);
  const worker = new Worker<BatchJobPayload>(
    QUEUE_NAMES.SUBMISSION,
    async (job: Job<BatchJobPayload>, token?: string) => {
      if (job.name === SWEEP_JOB_NAME) return { requeued: await sweep() };
      if (job.name !== BATCH_JOB_NAME || job.data?.jobType !== 'BATCH_SUBMISSION') {
        logEvent(logger, 'job.unknown', `Ignoring unknown job ${job.name}`, { jobId: job.id });
        return { ignored: true };
      }

      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const result = await processBatch(deps, job.data.batchId, { finalAttempt });

      if (result.retrying > 0 && !finalAttempt) {
        // Throwing hands the remaining rows to BullMQ's exponential backoff.
        throw new Error(`${result.retrying} URLs need another try`);
      }
      if (result.waitingForQuota > 0) {
        // Waiting on quota isn't a failure — park the job without spending an attempt.
        const delay = result.noGoogleAccounts ? NO_ACCOUNTS_RETRY_MS : msUntilQuotaReset(new Date());
        await job.moveToDelayed(Date.now() + delay, token);
        throw new DelayedError();
      }
      return result;
    },
    { connection, concurrency },
  );

  worker.on('failed', (job, error) => {
    if (error instanceof DelayedError) return;
    logEvent(logger, 'batch.job_failed', `Job ${job?.id} attempt failed`, { jobId: job?.id, attemptsMade: job?.attemptsMade, error: error.message });
  });
  worker.on('error', (error) => logEvent(logger, 'worker.error', 'Worker error', { error: error.message }));

  // Google index checks: one worker at a time (Redis lock), every minute.
  let checking = false;
  async function indexCheckTick(): Promise<void> {
    if (checking) return;
    const locked = await connection.set('lock:index-check', '1', 'PX', INDEX_CHECK_EVERY_MS - 5_000, 'NX').catch(() => null);
    if (locked !== 'OK') return;
    checking = true;
    try {
      const run = await runIndexChecks({ db, redis: connection, encryptionKey, logger, google: deps.google as GoogleIndexingClient, googleOAuth: deps.googleOAuth });
      if (run.checked || run.noAccess) logEvent(logger, 'index_check.run', 'Index checks done', { ...run });
    } catch (error) {
      logEvent(logger, 'index_check.failed', 'Index check run failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      checking = false;
    }
  }
  const indexTimer = setInterval(() => void indexCheckTick(), INDEX_CHECK_EVERY_MS);
  setTimeout(() => void indexCheckTick(), 15_000).unref();

  const beat = () => {
    try {
      writeFileSync(HEARTBEAT_FILE, String(Date.now()));
    } catch {
      // Health checks will catch a persistently unwritable heartbeat.
    }
  };
  beat();
  const heartbeat = setInterval(beat, 15_000);

  logEvent(logger, 'worker.started', 'Submission worker started', { concurrency });

  let stopping = false;
  async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    logEvent(logger, 'worker.shutdown', `Received ${signal}, finishing in-flight jobs`, { signal });
    clearInterval(heartbeat);
    clearInterval(indexTimer);
    const force = setTimeout(() => process.exit(1), 30_000);
    force.unref();
    await worker.close();
    await queue.close();
    await connection.quit();
    await pool.end();
    process.exit(0);
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logEvent(logger, 'worker.startup_failed', 'Submission worker failed to start', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
