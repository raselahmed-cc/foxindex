import { Global, Module } from '@nestjs/common';
import { SUBMISSION_QUEUE, submissionQueueProvider } from './submission-queue.provider';

@Global()
@Module({
  providers: [submissionQueueProvider],
  exports: [SUBMISSION_QUEUE],
})
export class QueuesModule {}
