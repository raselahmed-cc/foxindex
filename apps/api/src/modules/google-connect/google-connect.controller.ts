import { Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoogleConnectService } from './google-connect.service';

type Actor = AuthenticatedRequest['user'];

/** A client's own Google Search Console connections. */
@Controller('google')
@UseGuards(AuthGuard, RolesGuard, RateLimitGuard)
@Roles(UserRole.CLIENT)
export class GoogleConnectController {
  constructor(@Inject(GoogleConnectService) private readonly google: GoogleConnectService) {}

  @Get('connections')
  list(@CurrentUser() actor: Actor) {
    return this.google.list(actor.id);
  }

  @Post('connect')
  @RateLimit({ scope: 'google-connect', limit: 20, windowSeconds: 3600 })
  start(@CurrentUser() actor: Actor) {
    return this.google.start(actor.id);
  }

  @Post('connections/:id/refresh')
  @RateLimit({ scope: 'google-connect-refresh', limit: 30, windowSeconds: 3600 })
  refresh(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.google.refresh(actor.id, id);
  }

  @Delete('connections/:id')
  disconnect(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.google.disconnect(actor.id, id);
  }
}

/**
 * Google sends the browser here after the customer approves (or cancels). No login
 * header on a redirect — the one-time `state` ties it to the customer who started it.
 */
@Controller('google/oauth')
export class GoogleOAuthCallbackController {
  constructor(@Inject(GoogleConnectService) private readonly google: GoogleConnectService) {}

  @Get('callback')
  async callback(@Query('state') state: string | undefined, @Query('code') code: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    res.redirect(303, await this.google.callback({ state, code, error }));
  }
}
