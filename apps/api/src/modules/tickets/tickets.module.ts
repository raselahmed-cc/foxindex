import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { MacrosService } from './macros.service';
import { SupportController } from './support.controller';
import { SupportSettingsService } from './support-settings.service';
import { TicketAutomationService } from './ticket-automation.service';
import { TicketReportsService } from './ticket-reports.service';
import { TicketsController } from './tickets.controller';
import { TicketsGateway } from './tickets.gateway';
import { TicketsService } from './tickets.service';

@Module({
  imports: [CreditsModule],
  controllers: [TicketsController, SupportController],
  providers: [TicketsService, SupportSettingsService, MacrosService, TicketReportsService, TicketAutomationService, TicketsGateway],
  exports: [TicketsService, SupportSettingsService],
})
export class TicketsModule {}
