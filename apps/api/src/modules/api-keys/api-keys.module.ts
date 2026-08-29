import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysRepository } from './api-keys.repository';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeysRepository],
  // ApiKeysRepository is needed outside this module too: ApiKeyGuard (used by
  // SessionOrApiKeyGuard on the submissions endpoint) depends on it directly.
  exports: [ApiKeysService, ApiKeysRepository],
})
export class ApiKeysModule {}
