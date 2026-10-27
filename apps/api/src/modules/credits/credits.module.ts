import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsRepository } from './credits.repository';
import { CreditSettingsService } from './credit-settings.service';
import { CreditsAdminController } from './credits-admin.controller';
import { CreditsAdminService } from './credits-admin.service';

@Module({
  controllers: [CreditsController, CreditsAdminController],
  // CreditsRepository is exported deliberately — the signup-bonus grant
  // (packages/auth's Better Auth `databaseHooks.user.create.after`) and the
  // admin module's grant-credits endpoint both inject it directly (not
  // CreditsService) so the grant can run inside its own db.transaction()
  // (see docs/adr/0011).
  providers: [CreditsService, CreditsRepository, CreditSettingsService, CreditsAdminService],
  exports: [CreditsService, CreditsRepository, CreditSettingsService, CreditsAdminService],
})
export class CreditsModule {}
