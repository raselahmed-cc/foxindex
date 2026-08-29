import { Module } from '@nestjs/common';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DomainsRepository } from './domains.repository';

@Module({
  controllers: [DomainsController],
  providers: [DomainsService, DomainsRepository],
  exports: [DomainsService],
})
export class DomainsModule {}
