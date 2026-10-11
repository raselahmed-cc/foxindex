import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsRepository } from './credits.repository';

@Module({
  controllers: [CreditsController],
  // CreditsRepository is exported deliberately — the signup-bonus grant
  // (packages/auth's Better Auth `databaseHooks.user.create.after`) and the
  // admin module's grant-credits endpoint both inject it directly (not
  // CreditsService) so the grant can run inside its own db.transaction()
  // (see docs/adr/0011).
  providers: [CreditsService, CreditsRepository],
  exports: [CreditsService, CreditsRepository],
})
export class CreditsModule {}
