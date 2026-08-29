import { Global, Module } from '@nestjs/common';
import { VERIFICATION_QUEUE, verificationQueueProvider } from './verification-queue.provider';

@Global()
@Module({
  providers: [verificationQueueProvider],
  exports: [VERIFICATION_QUEUE],
})
export class QueuesModule {}
