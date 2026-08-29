import { Global, Module } from '@nestjs/common';
import { SERVICE_NAMES } from '@foxindex/config';
import { createLogger } from '@foxindex/logger';

export const LOGGER = Symbol('LOGGER');

@Global()
@Module({
  providers: [{ provide: LOGGER, useFactory: () => createLogger(SERVICE_NAMES.API) }],
  exports: [LOGGER],
})
export class LoggerModule {}
