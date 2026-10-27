import { Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  startVisitorChatSchema,
  updateVisitorChatSchema,
  visitorChatListQuerySchema,
  visitorMessageSchema,
  type StartVisitorChatInput,
  type UpdateVisitorChatInput,
  type VisitorChatListQuery,
  type VisitorMessageInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VisitorChatService } from './visitor-chat.service';

const TOKEN_HEADER = 'x-visitor-token';

/** Public website chat — no account needed. Rate limited per IP. */
@Controller('public/chat')
@UseGuards(RateLimitGuard)
export class PublicVisitorChatController {
  constructor(@Inject(VisitorChatService) private readonly chats: VisitorChatService) {}

  @Post('start')
  @RateLimit({ scope: 'visitor-start', limit: 6, windowSeconds: 3600 })
  start(@Body(new ZodValidationPipe(startVisitorChatSchema)) body: StartVisitorChatInput, @Req() req: Request) {
    return this.chats.start(body, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Get('messages')
  @RateLimit({ scope: 'visitor-read', limit: 120, windowSeconds: 60 })
  thread(@Headers(TOKEN_HEADER) token: string | undefined) {
    return this.chats.visitorThread(token);
  }

  @Post('messages')
  @RateLimit({ scope: 'visitor-send', limit: 20, windowSeconds: 60 })
  send(@Headers(TOKEN_HEADER) token: string | undefined, @Body(new ZodValidationPipe(visitorMessageSchema)) body: VisitorMessageInput) {
    return this.chats.visitorSend(token, body.body);
  }
}

/** Staff inbox for website chats — any manager or admin can answer. */
@Controller('support/visitor-chats')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN)
export class StaffVisitorChatController {
  constructor(@Inject(VisitorChatService) private readonly chats: VisitorChatService) {}

  @Get()
  list(@Query(new ZodValidationPipe(visitorChatListQuerySchema)) query: VisitorChatListQuery) {
    return this.chats.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.chats.staffThread(id);
  }

  @Post(':id/messages')
  reply(@CurrentUser() actor: AuthenticatedRequest['user'], @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(visitorMessageSchema)) body: VisitorMessageInput) {
    return this.chats.staffReply(id, actor, body.body);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedRequest['user'], @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateVisitorChatSchema)) body: UpdateVisitorChatInput) {
    return this.chats.update(id, actor, body);
  }
}
