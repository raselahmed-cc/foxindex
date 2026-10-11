import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  bulkUpdateTicketsSchema,
  createTicketSchema,
  mergeTicketSchema,
  replyTicketSchema,
  ticketCsatSchema,
  ticketGrantCreditsSchema,
  ticketListQuerySchema,
  updateTicketSchema,
  type BulkUpdateTicketsInput,
  type CreateTicketInput,
  type MergeTicketInput,
  type ReplyTicketInput,
  type TicketCsatInput,
  type TicketGrantCreditsInput,
  type TicketListQuery,
  type UpdateTicketInput,
} from '@foxindex/validation';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TicketsService } from './tickets.service';

type Actor = AuthenticatedRequest['user'];

/**
 * Visibility is enforced in TicketsService: clients see their own, managers
 * their clients', admins all. Static routes are declared before `:id`.
 */
@Controller('tickets')
@UseGuards(AuthGuard)
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(ticketListQuerySchema)) query: TicketListQuery) {
    return this.tickets.list(actor, query);
  }

  @Post()
  create(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicketInput) {
    return this.tickets.create(actor, body);
  }

  @Get('tags')
  tags(@CurrentUser() actor: Actor) {
    return this.tickets.tags(actor);
  }

  @Get('export')
  async export(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(ticketListQuerySchema)) query: TicketListQuery, @Res() res: Response) {
    const csv = await this.tickets.exportCsv(actor, query);
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`)
      .setHeader('Cache-Control', 'no-store')
      // BOM so Excel opens UTF-8 (Bangla names) correctly.
      .send(String.fromCharCode(0xfeff) + csv);
  }

  @Post('bulk')
  bulk(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(bulkUpdateTicketsSchema)) body: BulkUpdateTicketsInput) {
    return this.tickets.bulkUpdate(actor, body);
  }

  @Get(':id')
  get(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.get(id, actor);
  }

  @Post(':id/messages')
  reply(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(replyTicketSchema)) body: ReplyTicketInput) {
    return this.tickets.reply(id, actor, body);
  }

  @Patch(':id')
  update(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateTicketSchema)) body: UpdateTicketInput) {
    return this.tickets.update(id, actor, body);
  }

  @Post(':id/merge')
  merge(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(mergeTicketSchema)) body: MergeTicketInput) {
    return this.tickets.merge(id, actor, body);
  }

  @Post(':id/csat')
  rate(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(ticketCsatSchema)) body: TicketCsatInput) {
    return this.tickets.rate(id, actor, body);
  }

  @Post(':id/credits')
  grant(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(ticketGrantCreditsSchema)) body: TicketGrantCreditsInput) {
    return this.tickets.grantCredits(id, actor, body);
  }
}
