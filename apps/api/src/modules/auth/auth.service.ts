import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import {
  accountApprovedEmail,
  findLeastLoadedManager,
  generateRefreshToken,
  generateVerificationCode,
  hashPassword,
  hashRefreshToken,
  managerAssignedEmail,
  signAccessToken,
  verificationCodeEmail,
  verifyPassword,
  type Mailer,
} from '@foxindex/auth';
import {
  emailVerificationCodes,
  sessions,
  users,
  type Database,
} from '@foxindex/database';
import {
  DEFAULT_APPROVAL_CREDIT_GRANT,
  EMAIL_VERIFICATION_CODE_TTL_MINUTES,
  JWT_REFRESH_TOKEN_TTL_SECONDS,
} from '@foxindex/config';
import type { ApproveUserInput, LoginInput, RegisterInput, ResendVerificationInput, VerifyEmailInput } from '@foxindex/validation';
import type IORedis from 'ioredis';
import { ErrorCode, UserRole, UserStatus } from '@foxindex/types';
import { AppError, AuthenticationError, NotFoundError, RateLimitedError, ValidationError } from '../../common/errors/app-error';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { DATABASE } from '../../database/database.module';
import { MAILER } from './mailer.provider';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreditsRepository } from '../credits/credits.repository';

/** Wrong codes allowed per issued code before it is burned and a new one is required. */
const MAX_CODE_ATTEMPTS = 5;
/** Failed passwords per account inside the window before sign-in is paused. */
const MAX_LOGIN_FAILURES = 10;
const LOGIN_LOCK_SECONDS = 15 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  async register(input: RegisterInput): Promise<{ email: string }> {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (existing?.status === UserStatus.PENDING_EMAIL) {
      // Signed up before but never verified — point them at the code, don't dead-end.
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'This email is registered but not verified yet. Enter the code we sent, or request a new one.', {
        reason: 'EMAIL_PENDING_VERIFICATION',
      });
    }
    if (existing) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'An account with this email already exists', {
        reason: 'EMAIL_ALREADY_REGISTERED',
      });
    }

    const passwordHash = await hashPassword(input.password);

    const user = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          name: input.name,
          dateOfBirth: input.dateOfBirth,
          email: input.email,
          passwordHash,
          phone: input.phone,
          whatsapp: input.whatsapp,
          city: input.city,
          country: input.country,
          role: UserRole.CLIENT,
          status: UserStatus.PENDING_EMAIL,
        })
        .returning();

      const code = generateVerificationCode();
      await tx.insert(emailVerificationCodes).values({
        userId: created.id,
        code,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MINUTES * 60_000),
      });

      await this.auditLog.record(
        { actorId: created.id, action: 'user.registered', targetType: 'user', targetId: created.id },
        tx,
      );

      const email = verificationCodeEmail(code);
      await this.mailer.send(created.email, email.subject, email.html);

      return created;
    });

    return { email: user.email };
  }

  /**
   * Issue a fresh code (older ones stop working). Always answers the same way
   * so it can't be used to discover which emails have accounts.
   */
  async resendVerification(input: ResendVerificationInput): Promise<{ ok: true; cooldownSeconds: number }> {
    const fresh = await this.redis.set(`auth:resend:${input.email}`, '1', 'EX', RESEND_COOLDOWN_SECONDS, 'NX');
    if (fresh !== 'OK') {
      const ttl = await this.redis.ttl(`auth:resend:${input.email}`);
      throw new RateLimitedError(`Please wait ${Math.max(ttl, 1)} seconds before requesting another code`);
    }
    const user = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (user?.status === UserStatus.PENDING_EMAIL) {
      const code = generateVerificationCode();
      await this.db.transaction(async (tx) => {
        await tx
          .update(emailVerificationCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(emailVerificationCodes.userId, user.id), isNull(emailVerificationCodes.usedAt)));
        await tx.insert(emailVerificationCodes).values({
          userId: user.id,
          code,
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_CODE_TTL_MINUTES * 60_000),
        });
      });
      await this.redis.del(`auth:code-attempts:${input.email}`);
      const email = verificationCodeEmail(code);
      await this.mailer.send(user.email, email.subject, email.html);
    }
    return { ok: true, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<{ status: UserStatus }> {
    const user = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (!user) {
      throw new AuthenticationError('Invalid email or code');
    }
    if (user.status !== UserStatus.PENDING_EMAIL) {
      // Already verified (double submit, or came back later) — report where they stand.
      return { status: user.status as UserStatus };
    }

    const codeRow = await this.db.query.emailVerificationCodes.findFirst({
      where: and(
        eq(emailVerificationCodes.userId, user.id),
        eq(emailVerificationCodes.code, input.code),
        isNull(emailVerificationCodes.usedAt),
        gt(emailVerificationCodes.expiresAt, new Date()),
      ),
      orderBy: desc(emailVerificationCodes.createdAt),
    });

    if (!codeRow) {
      // A 6-digit code is guessable without a cap: burn it after MAX_CODE_ATTEMPTS misses.
      const attemptsKey = `auth:code-attempts:${input.email}`;
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) await this.redis.expire(attemptsKey, EMAIL_VERIFICATION_CODE_TTL_MINUTES * 60);
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await this.db
          .update(emailVerificationCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(emailVerificationCodes.userId, user.id), isNull(emailVerificationCodes.usedAt)));
        await this.redis.del(attemptsKey);
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Too many wrong codes. Request a new code to continue.', {
          reason: 'VERIFICATION_CODE_LOCKED',
        });
      }
      throw new AppError(ErrorCode.VALIDATION_ERROR, `That code isn't right or has expired. ${MAX_CODE_ATTEMPTS - attempts} tries left.`, {
        reason: 'INVALID_VERIFICATION_CODE',
      });
    }
    await this.redis.del(`auth:code-attempts:${input.email}`);

    const manager = await findLeastLoadedManager(this.db);

    await this.db.transaction(async (tx) => {
      await tx.update(emailVerificationCodes).set({ usedAt: new Date() }).where(eq(emailVerificationCodes.id, codeRow.id));
      await tx
        .update(users)
        .set({ status: UserStatus.PENDING_APPROVAL, assignedManagerId: manager?.id, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await this.auditLog.record(
        { actorId: user.id, action: 'user.email_verified', targetType: 'user', targetId: user.id },
        tx,
      );
      if (manager) {
        await this.auditLog.record(
          {
            actorId: user.id,
            action: 'user.manager_assigned',
            targetType: 'user',
            targetId: user.id,
            metadata: { managerId: manager.id },
          },
          tx,
        );
      }
    });

    if (manager) {
      const managerUser = await this.db.query.users.findFirst({ where: eq(users.id, manager.id) });
      if (managerUser) {
        const email = managerAssignedEmail(user.name, user.email);
        await this.mailer.send(managerUser.email, email.subject, email.html);
        // WhatsApp: Phase 1 only has wa.me deep links (CLAUDE.md), which need a
        // human to click them — there is no Meta Cloud API credential to push
        // this automatically yet, so only the email leg is actually delivered.
      }
    }

    return { status: UserStatus.PENDING_APPROVAL };
  }

  async approve(targetUserId: string, actorId: string, input: ApproveUserInput): Promise<void> {
    const target = await this.db.query.users.findFirst({ where: eq(users.id, targetUserId) });
    if (!target) {
      throw new NotFoundError('User');
    }
    if (target.status !== UserStatus.PENDING_APPROVAL) {
      throw new ValidationError(`User is "${target.status}", not pending approval`);
    }

    const grant = input.startingCredit ?? DEFAULT_APPROVAL_CREDIT_GRANT;

    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ status: UserStatus.ACTIVE, updatedAt: new Date() }).where(eq(users.id, target.id));

      if (grant > 0) {
        await this.credits.grant(target.id, grant, 'manual_add', actorId, 'Approval starting credit', tx);
      }

      await this.auditLog.record(
        { actorId, action: 'user.approved', targetType: 'user', targetId: target.id, metadata: { startingCredit: grant } },
        tx,
      );
    });

    const email = accountApprovedEmail(target.name);
    await this.mailer.send(target.email, email.subject, email.html);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
    const failKey = `auth:login-fail:${input.email}`;
    const failures = Number((await this.redis.get(failKey)) ?? 0);
    if (failures >= MAX_LOGIN_FAILURES) {
      const ttl = await this.redis.ttl(failKey);
      throw new AppError(ErrorCode.RATE_LIMITED, `Too many failed sign-in attempts. Try again in ${Math.ceil(Math.max(ttl, 60) / 60)} minutes.`, {
        reason: 'ACCOUNT_TEMPORARILY_LOCKED',
      });
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      const n = await this.redis.incr(failKey);
      if (n === 1) await this.redis.expire(failKey, LOGIN_LOCK_SECONDS);
      throw new AuthenticationError('Invalid email or password');
    }
    await this.redis.del(failKey);

    if (user.status === UserStatus.PENDING_EMAIL) {
      throw new AppError(ErrorCode.AUTHENTICATION_ERROR, 'Please verify your email before signing in', {
        reason: 'EMAIL_NOT_VERIFIED',
      });
    }
    if (user.status === UserStatus.PENDING_APPROVAL) {
      throw new AppError(ErrorCode.AUTHENTICATION_ERROR, 'Your account is awaiting manager approval', {
        reason: 'PENDING_APPROVAL',
      });
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError(ErrorCode.AUTHENTICATION_ERROR, 'Your account has been suspended', {
        reason: 'ACCOUNT_SUSPENDED',
      });
    }

    const { accessToken, refreshToken } = await this.issueTokens(user.id, user.role, user.status, meta);
    await this.auditLog.record({ actorId: user.id, action: 'user.login', targetType: 'user', targetId: user.id, ip: meta.ip });

    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    });
    if (!session) {
      throw new AuthenticationError('Invalid or expired session');
    }

    const user = await this.db.query.users.findFirst({ where: eq(users.id, session.userId) });
    if (!user) {
      throw new AuthenticationError();
    }

    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    const tokens = await this.issueTokens(user.id, user.role, user.status, meta);
    return tokens;
  }

  /** Read-only check used by the marketing site — never rotates the token. */
  async hasSession(refreshToken: string): Promise<boolean> {
    const session = await this.db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, hashRefreshToken(refreshToken)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
      columns: { id: true },
    });
    return Boolean(session);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.refreshTokenHash, tokenHash));
  }

  async findPublicUser(userId: string): Promise<PublicUser> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      throw new NotFoundError('User');
    }
    return toPublicUser(user);
  }

  private async issueTokens(
    userId: string,
    // Drizzle infers a pgEnum column as its own string-literal union, not the
    // nominal @foxindex/types enum, even though the values are identical —
    // accepting the raw union here and casting once avoids repeating an
    // `as UserRole`/`as UserStatus` at every call site.
    role: typeof users.$inferSelect.role,
    status: typeof users.$inferSelect.status,
    meta: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const accessToken = signAccessToken({ sub: userId, role: role as UserRole, status: status as UserStatus }, secret);

    const refreshToken = generateRefreshToken();
    await this.db.insert(sessions).values({
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: new Date(Date.now() + JWT_REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return { accessToken, refreshToken };
  }
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    status: user.status as UserStatus,
  };
}
