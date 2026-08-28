import { Queue, type QueueOptions } from 'bullmq';
import type IORedis from 'ioredis';

export function createQueue<T = unknown>(
  name: string,
  connection: IORedis,
  options: Partial<QueueOptions> = {},
): Queue<T> {
  return new Queue<T>(name, { connection, ...options });
}
