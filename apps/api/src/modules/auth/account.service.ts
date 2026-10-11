import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { hashPassword, hashRefreshToken, verifyPassword } from '@foxindex/auth';
import { sessions, sites, users, type Database } from '@foxindex/database';
import {
  DEFAULT_USER_PREFERENCES,
  userPreferencesSchema,
  type ChangePasswordInput,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
  type UserPreferences,
} from '@foxindex/validation';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';

function mergePreferences(stored: unknown): UserPreferences {
  const parsed = userPreferencesSchema.partial().safeParse(stored ?? {});
  const p = parsed.success ? parsed.data : {};
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...p,
    notifications: { ...DEFAULT_USER_PREFERENCES.notifications, ...(p.notifications ?? {}) },
    submission: { ...DEFAULT_USER_PREFERENCES.submission, ...(p.submission ?? {}) },
  };
}

/** Coarse, dependency-free UA summary for the sessions list ("Windows · Chrome"). */
export function describeUserAgent(ua: string | null): { os: string; browser: string; mobile: boolean } {
  const s = ua ?? '';
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iOS' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'macOS' : /Linux/i.test(s) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  return { os, browser, mobile: /Mobile|Android|iPhone/i.test(s) };
}

@Injectable()
export class AccountService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User');

    const manager = user.assignedManagerId
      ? await this.db.query.users.findFirst({
          where: eq(users.id, user.assignedManagerId),
          columns: { id: true, name: true, email: true, whatsapp: true, phone: true, createdAt: true },
        })
      : null;

    const mySites = await this.db.query.sites.findMany({
      where: eq(sites.userId, userId),
      columns: { id: true, domain: true },
      orderBy: desc(sites.createdAt),
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      phone: user.phone,
      whatsapp: user.whatsapp,
      telegram: user.telegram,
      country: user.country,
      city: user.city,
      company: user.company,
      timezone: user.timezone,
      bio: user.bio,
      createdAt: user.createdAt,
      manager: manager
        ? { id: manager.id, name: manager.name, email: manager.email, whatsapp: manager.whatsapp ?? manager.phone }
        : null,
      preferences: mergePreferences(user.preferences),
      sites: mySites,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const [updated] = await this.db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!updated) throw new NotFoundError('User');
    await this.auditLog.record({ actorId: userId, action: 'profile.update', targetType: 'user', targetId: userId, metadata: { fields: Object.keys(input) } });
    return this.getProfile(userId);
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { preferences: true } });
    if (!user) throw new NotFoundError('User');
    const current = mergePreferences(user.preferences);
    const next: UserPreferences = {
      ...current,
      ...input,
      notifications: { ...current.notifications, ...(input.notifications ?? {}) },
      submission: { ...current.submission, ...(input.submission ?? {}) },
    };
    await this.db.update(users).set({ preferences: next, updatedAt: new Date() }).where(eq(users.id, userId));
    return next;
  }

  /** Revokes every other session so a leaked password stops working everywhere else immediately. */
  async changePassword(userId: string, input: ChangePasswordInput, currentRefreshToken?: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User');
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new ValidationError('Current password is incorrect', { reason: 'WRONG_PASSWORD' });
    }
    if (input.currentPassword === input.newPassword) {
      throw new ValidationError('Choose a password you have not used here before', { reason: 'SAME_PASSWORD' });
    }

    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, userId));
      const keep = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), keep ? ne(sessions.refreshTokenHash, keep) : undefined));
      await this.auditLog.record({ actorId: userId, action: 'password.change', targetType: 'user', targetId: userId }, tx);
    });
    return { changed: true };
  }

  async listSessions(userId: string, currentRefreshToken?: string) {
    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
    const rows = await this.db.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
      orderBy: desc(sessions.createdAt),
      limit: 50,
    });
    return rows.map((s) => ({
      id: s.id,
      ...describeUserAgent(s.userAgent),
      ip: maskIp(s.ip),
      lastActiveAt: s.createdAt,
      current: s.refreshTokenHash === currentHash,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const [row] = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (!row) throw new NotFoundError('Session');
    return { revoked: 1 };
  }

  async revokeOtherSessions(userId: string, currentRefreshToken?: string) {
    const keep = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), keep ? ne(sessions.refreshTokenHash, keep) : undefined))
      .returning({ id: sessions.id });
    return { revoked: rows.length };
  }
}

function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  const parts = v4.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.xx.xx`;
  return v4.length > 12 ? `${v4.slice(0, 9)}…` : v4;
}
