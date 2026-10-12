import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import {
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
  type LoginInput,
  type RegisterInput,
  type ResendVerificationInput,
  type VerifyEmailInput,
} from '@foxindex/validation';
import { JWT_REFRESH_TOKEN_TTL_SECONDS } from '@foxindex/config';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthenticationError } from '../../common/errors/app-error';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_NAME = 'refreshToken';

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  // Scoped to the auth routes only — refresh/logout are the only readers,
  // so the browser never attaches this cookie to any other request.
  path: '/api/v1/auth',
  maxAge: JWT_REFRESH_TOKEN_TTL_SECONDS * 1000,
};

/** Set when the user unticked "Keep me logged in": refreshes keep the cookie session-only. */
const SESSION_ONLY_COOKIE = 'sessionOnly';
const SESSION_COOKIE_OPTIONS: CookieOptions = { ...REFRESH_COOKIE_OPTIONS, maxAge: undefined };

function setRefreshCookie(res: Response, token: string, sessionOnly: boolean) {
  if (sessionOnly) {
    res.cookie(REFRESH_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
    res.cookie(SESSION_ONLY_COOKIE, '1', SESSION_COOKIE_OPTIONS);
  } else {
    res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
    res.clearCookie(SESSION_ONLY_COOKIE, SESSION_COOKIE_OPTIONS);
  }
}

/** Unauthenticated routes are rate-limited per IP (RateLimitGuard falls back to req.ip). */
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ scope: 'auth-register', limit: 20, windowSeconds: 3600 })
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post('verify-email')
  @UseGuards(RateLimitGuard)
  @RateLimit({ scope: 'auth-verify', limit: 30, windowSeconds: 900 })
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    return this.auth.verifyEmail(body);
  }

  @Post('resend-verification')
  @UseGuards(RateLimitGuard)
  @RateLimit({ scope: 'auth-resend', limit: 10, windowSeconds: 3600 })
  resendVerification(@Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput) {
    return this.auth.resendVerification(body);
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ scope: 'auth-login', limit: 60, windowSeconds: 900 })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, { userAgent: req.headers['user-agent'], ip: req.ip });
    setRefreshCookie(res, result.refreshToken, !body.remember);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (!token) {
      throw new AuthenticationError('No refresh token');
    }
    const result = await this.auth.refresh(token, { userAgent: req.headers['user-agent'], ip: req.ip });
    setRefreshCookie(res, result.refreshToken, (req.cookies as Record<string, string> | undefined)?.[SESSION_ONLY_COOKIE] === '1');
    return { accessToken: result.accessToken };
  }

  /** Is this browser signed in? (httpOnly cookie, so the page can't tell by itself.) */
  @Get('session')
  async session(@Req() req: Request) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    return { signedIn: token ? await this.auth.hasSession(token) : false };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    if (token) {
      await this.auth.logout(token);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    res.clearCookie(SESSION_ONLY_COOKIE, SESSION_COOKIE_OPTIONS);
  }
}
