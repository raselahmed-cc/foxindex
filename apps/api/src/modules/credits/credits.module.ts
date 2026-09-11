import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditsRepository } from './credits.repository';

@Module({
  controllers: [CreditsController],
  // CreditsRepository is exported deliberately — OrganizationsRepository
  // injects it directly (not CreditsService) so the signup-bonus grant can
  // run inside its own db.transaction() (see docs/adr/0011).
  providers: [CreditsService, CreditsRepository],
  exports: [CreditsService, CreditsRepository],
})
export class CreditsModule {}
