import type { Provider } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { createQueue, QUEUE_NAMES } from '@foxindex/queue';
import type { SubmissionJobPayload } from '@foxindex/types';
import { REDIS_CONNECTION } from '../redis/redis.module';

export const SUBMISSION_QUEUE = Symbol('SUBMISSION_QUEUE');

export const submissionQueueProvider: Provider = {
  provide: SUBMISSION_QUEUE,
  inject: [REDIS_CONNECTION],
  useFactory: (redis: IORedis): Queue<SubmissionJobPayload> => createQueue(QUEUE_NAMES.SUBMISSION, redis),
};
