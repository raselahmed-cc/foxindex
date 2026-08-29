import type { Provider } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import { createQueue, QUEUE_NAMES } from '@foxindex/queue';
import type { VerificationJobPayload } from '@foxindex/types';
import { REDIS_CONNECTION } from '../redis/redis.module';

export const VERIFICATION_QUEUE = Symbol('VERIFICATION_QUEUE');

export const verificationQueueProvider: Provider = {
  provide: VERIFICATION_QUEUE,
  inject: [REDIS_CONNECTION],
  useFactory: (redis: IORedis): Queue<VerificationJobPayload> =>
    createQueue(QUEUE_NAMES.VERIFICATION, redis),
};
