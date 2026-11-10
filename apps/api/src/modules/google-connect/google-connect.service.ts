import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import type IORedis from 'ioredis';
import { googleConnections, type Database } from '@foxindex/database';
import {
  buildGoogleAuthUrl,
  decryptSecret,
  encryptSecret,
  exchangeGoogleCode,
  GoogleOAuthError,
  isOwner,
  listGscProperties,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  type GoogleOAuthConfig,
  type GscProperty,
} from '@foxindex/providers';
import { ErrorCode } from '@foxindex/types';
import { AppError, NotFoundError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { AuditLogService } from '../audit-logs/audit-log.service';

const STATE_TTL_S = 10 * 60;
const stateKey = (state: string) => `gconnect:state:${state}`;

/**
 * "Connect Google Search Console". The customer signs in with the Google account
 * that owns their sites; FoxIndex keeps an encrypted refresh token and submits /
 * inspects URLs on those properties for them — no verification on FoxIndex's side.
 */
@Injectable()
export class GoogleConnectService {
  private readonly logger = new Logger(GoogleConnectService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  oauth(): GoogleOAuthConfig | null {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri: this.redirectUri() };
  }

  /** Must match an "Authorized redirect URI" on the Google OAuth client exactly. */
  redirectUri(): string {
    return `${this.config.getOrThrow<string>('API_PUBLIC_URL')}/api/v1/google/oauth/callback`;
  }

  private key(): string {
    return this.config.getOrThrow<string>('ENCRYPTION_KEY');
  }

  private webUrl(path: string): string {
    return `${process.env.CORS_ORIGIN ?? 'http://localhost:3000'}${path}`;
  }

  private toDto(r: typeof googleConnections.$inferSelect) {
    const props = (r.properties as GscProperty[]) ?? [];
    return {
      id: r.id,
      email: r.googleEmail,
      status: r.status as 'active' | 'revoked',
      lastError: r.lastError,
      connectedAt: r.connectedAt,
      refreshedAt: r.propertiesRefreshedAt,
      // Only Owner properties can use the Indexing API.
      owned: props.filter(isOwner).map((p) => p.siteUrl),
      notOwned: props.filter((p) => !isOwner(p)).map((p) => ({ siteUrl: p.siteUrl, permission: p.permissionLevel })),
    };
  }

  async list(userId: string) {
    const rows = await this.db.select().from(googleConnections).where(eq(googleConnections.userId, userId)).orderBy(googleConnections.connectedAt);
    return { available: this.oauth() !== null, connections: rows.map((r) => this.toDto(r)) };
  }

  async start(userId: string) {
    const cfg = this.oauth();
    if (!cfg) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Connecting Google isn’t available yet', { reason: 'GOOGLE_CONNECT_NOT_CONFIGURED' });
    const state = randomBytes(24).toString('base64url');
    await this.redis.set(stateKey(state), userId, 'EX', STATE_TTL_S);
    return { url: buildGoogleAuthUrl(cfg, state) };
  }

  /** Google redirects the browser here. Returns where to send the browser next. */
  async callback(input: { state?: string; code?: string; error?: string }): Promise<string> {
    const fail = (reason: string) => this.webUrl(`/sites?google=error&reason=${encodeURIComponent(reason)}`);
    if (!input.state) return fail('missing_state');
    const userId = await this.redis.getdel(stateKey(input.state));
    if (!userId) return fail('expired');
    if (input.error) return fail(input.error === 'access_denied' ? 'denied' : 'google_error');
    const cfg = this.oauth();
    if (!cfg || !input.code) return fail('google_error');

    try {
      const t = await exchangeGoogleCode(cfg, input.code);
      if (!t.refreshToken) return fail('no_offline_access');
      if (!t.scopes.includes('https://www.googleapis.com/auth/indexing')) return fail('missing_permission');
      const properties = await listGscProperties(t.accessToken);
      const email = t.email ?? 'Google account';
      const values = {
        refreshTokenEncrypted: encryptSecret(t.refreshToken, this.key()),
        properties,
        status: 'active',
        lastError: null,
        propertiesRefreshedAt: new Date(),
        updatedAt: new Date(),
      };
      const [row] = await this.db
        .insert(googleConnections)
        .values({ userId, googleEmail: email, ...values })
        .onConflictDoUpdate({ target: [googleConnections.userId, googleConnections.googleEmail], set: values })
        .returning();
      const owned = properties.filter(isOwner).length;
      await this.auditLog.record({ actorId: userId, action: 'google.connect', targetType: 'google_connection', targetId: row.id, metadata: { email, owned } });
      return this.webUrl(`/sites?google=connected&owned=${owned}`);
    } catch (error) {
      this.logger.warn(`Google connect failed: ${(error as Error).message}`);
      return fail(error instanceof GoogleOAuthError && error.status === 403 ? 'search_console_off' : 'google_error');
    }
  }

  private async load(userId: string, id: string) {
    const row = await this.db.query.googleConnections.findFirst({ where: and(eq(googleConnections.id, id), eq(googleConnections.userId, userId)) });
    if (!row) throw new NotFoundError('Google connection');
    return row;
  }

  /** Re-read which sites the account owns (after the customer adds a site in Search Console). */
  async refresh(userId: string, id: string) {
    const row = await this.load(userId, id);
    const cfg = this.oauth();
    if (!cfg) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Connecting Google isn’t available yet', { reason: 'GOOGLE_CONNECT_NOT_CONFIGURED' });
    try {
      const { accessToken } = await refreshGoogleAccessToken(cfg, decryptSecret(row.refreshTokenEncrypted, this.key()));
      const properties = await listGscProperties(accessToken);
      const [updated] = await this.db
        .update(googleConnections)
        .set({ properties, status: 'active', lastError: null, propertiesRefreshedAt: new Date(), updatedAt: new Date() })
        .where(eq(googleConnections.id, id))
        .returning();
      return this.toDto(updated);
    } catch (error) {
      const revoked = error instanceof GoogleOAuthError && error.code === 'invalid_grant';
      const [updated] = await this.db
        .update(googleConnections)
        .set({ status: revoked ? 'revoked' : row.status, lastError: revoked ? 'Google access was removed — connect Google again.' : 'Couldn’t reach Google — try again in a minute.', updatedAt: new Date() })
        .where(eq(googleConnections.id, id))
        .returning();
      return this.toDto(updated);
    }
  }

  async disconnect(userId: string, id: string) {
    const row = await this.load(userId, id);
    try {
      await revokeGoogleToken(decryptSecret(row.refreshTokenEncrypted, this.key()));
    } catch {
      /* best effort — the token is deleted either way */
    }
    await this.db.delete(googleConnections).where(eq(googleConnections.id, id));
    await this.auditLog.record({ actorId: userId, action: 'google.disconnect', targetType: 'google_connection', targetId: id, metadata: { email: row.googleEmail } });
    return { id };
  }
}
