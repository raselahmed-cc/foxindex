import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { chatToTicketSchema, setAvailabilitySchema, updateChatNoteSchema, type ChatToTicketInput, type SetAvailabilityInput, type UpdateChatNoteInput } from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ValidationError } from '../../common/errors/app-error';
import { ADMINS_ROOM, conversationRoom, RealtimeService } from '../../common/realtime/realtime.service';
import { ChatService } from './chat.service';

type Actor = AuthenticatedRequest['user'];

const listQuerySchema = z.object({ scope: z.enum(['mine', 'all']).default('mine') });
const urlStatusSchema = z.object({ urls: z.array(z.string().max(2048)).min(1).max(20) });

@Controller('chat')
@UseGuards(AuthGuard, RolesGuard)
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  /** scope=all is the supervisor view (admins only); everyone else gets their own conversations. */
  @Get('conversations')
  listConversations(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    const canSupervise = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN;
    return this.chat.listConversations(actor, canSupervise ? query.scope : 'mine');
  }

  @Get('conversations/:conversationId/messages')
  getMessages(@Param('conversationId', ParseUUIDPipe) conversationId: string, @CurrentUser() actor: Actor, @Query('before') before?: string) {
    const cursor = before ? new Date(before) : undefined;
    if (cursor && Number.isNaN(cursor.getTime())) throw new ValidationError('Invalid "before" cursor');
    return this.chat.getMessages(conversationId, actor, cursor);
  }

  @Post('conversations/:conversationId/url-status')
  urlStatus(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(urlStatusSchema)) body: z.infer<typeof urlStatusSchema>,
  ) {
    return this.chat.urlStatus(conversationId, actor, body.urls);
  }

  @Patch('conversations/:conversationId/note')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  updateNote(@Param('conversationId', ParseUUIDPipe) conversationId: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(updateChatNoteSchema)) body: UpdateChatNoteInput) {
    return this.chat.updateNote(conversationId, actor, body.note);
  }

  @Post('conversations/:conversationId/ticket')
  async toTicket(@Param('conversationId', ParseUUIDPipe) conversationId: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(chatToTicketSchema)) body: ChatToTicketInput) {
    const result = await this.chat.toTicket(conversationId, actor, body.subject);
    this.realtime.emitToRooms([conversationRoom(conversationId), ADMINS_ROOM], 'message:new', result.message);
    return result.ticket;
  }

  @Get('availability')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  availability(@CurrentUser() actor: Actor) {
    return this.chat.getAvailability(actor.id);
  }

  @Patch('availability')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  setAvailability(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(setAvailabilitySchema)) body: SetAvailabilityInput) {
    return this.chat.setAvailability(actor, body.availability);
  }

  @Get('stats')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
  stats(@CurrentUser() actor: Actor) {
    return this.chat.stats(actor);
  }
}
