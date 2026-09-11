import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './organizations.repository';

@Module({
  // CreditsModule: OrganizationsRepository grants the signup-bonus credit
  // balance inside the same transaction that creates the org (docs/adr/0011).
  imports: [CreditsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
