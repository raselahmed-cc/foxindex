import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  changePasswordSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@foxindex/validation';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountService) private readonly account: AccountService,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.auth.findPublicUser(user.id);
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.account.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.account.updateProfile(user.id, body);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ) {
    return this.account.updatePreferences(user.id, body);
  }
}

/**
 * Lives under /auth so the browser attaches the refresh cookie (its path is
 * /api/v1/auth) — that's how the current session is recognized and kept.
 */
@Controller('auth')
@UseGuards(AuthGuard)
export class AuthAccountController {
  constructor(@Inject(AccountService) private readonly account: AccountService) {}

  private refreshToken(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.refreshToken;
  }

  @Post('password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Req() req: Request,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.account.changePassword(user.id, body, this.refreshToken(req));
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedRequest['user'], @Req() req: Request) {
    return this.account.listSessions(user.id, this.refreshToken(req));
  }

  @Delete('sessions/others')
  revokeOthers(@CurrentUser() user: AuthenticatedRequest['user'], @Req() req: Request) {
    return this.account.revokeOtherSessions(user.id, this.refreshToken(req));
  }

  @Delete('sessions/:sessionId')
  revoke(@CurrentUser() user: AuthenticatedRequest['user'], @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.account.revokeSession(user.id, sessionId);
  }
}
