import { Global, Module } from '@nestjs/common';
import { VERIFICATION_QUEUE, verificationQueueProvider } from './verification-queue.provider';
import { SUBMISSION_QUEUE, submissionQueueProvider } from './submission-queue.provider';

@Global()
@Module({
  providers: [verificationQueueProvider, submissionQueueProvider],
  exports: [VERIFICATION_QUEUE, SUBMISSION_QUEUE],
})
export class QueuesModule {}
