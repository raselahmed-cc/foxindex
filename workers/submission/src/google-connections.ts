import { and, eq, inArray } from 'drizzle-orm';
import { googleConnections, type Database } from '@foxindex/database';
import { decryptSecret, GoogleOAuthError, pickOwnedProperty, refreshGoogleAccessToken, type GscProperty } from '@foxindex/providers';

/**
 * Customers' "Connect Google Search Console" authorizations, as the worker uses them:
 * pick the connection that owns a URL's property, and keep a short-lived access
 * token per connection (refreshed from the encrypted refresh token).
 */

export interface GoogleOAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface Connection {
  id: string;
  userId: string;
  properties: GscProperty[];
  refreshTokenEncrypted: string;
}

export function googleOAuthFromEnv(): GoogleOAuthClient | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Indexing API calls through customer connections all count against FoxIndex's Cloud project. */
export const connectDailyQuota = () => Number(process.env.GOOGLE_CONNECT_DAILY_QUOTA ?? 200);

export async function loadConnections(db: Database, userIds: string[]): Promise<Map<string, Connection[]>> {
  const byUser = new Map<string, Connection[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({ id: googleConnections.id, userId: googleConnections.userId, properties: googleConnections.properties, refreshTokenEncrypted: googleConnections.refreshTokenEncrypted })
    .from(googleConnections)
    .where(and(inArray(googleConnections.userId, [...new Set(userIds)]), eq(googleConnections.status, 'active')));
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push({ ...r, properties: (r.properties as GscProperty[]) ?? [] });
    byUser.set(r.userId, list);
  }
  return byUser;
}

/** The customer's connection that owns `url` (and which property), if any. */
export function connectionFor(conns: Connection[] | undefined, url: string): { conn: Connection; property: string } | null {
  for (const conn of conns ?? []) {
    const p = pickOwnedProperty(conn.properties, url);
    if (p) return { conn, property: p.siteUrl };
  }
  return null;
}

/** Per-run token cache. A revoked authorization marks the connection so the customer sees it. */
export class ConnectionTokens {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();
  private readonly dead = new Set<string>();

  constructor(
    private readonly db: Database,
    private readonly oauth: GoogleOAuthClient | null,
    private readonly encryptionKey: string,
  ) {}

  /** null = this connection can't be used right now (not configured, revoked or Google unreachable). */
  async token(conn: Connection): Promise<string | null> {
    if (!this.oauth || this.dead.has(conn.id)) return null;
    const hit = this.cache.get(conn.id);
    if (hit && hit.expiresAt - 120_000 > Date.now()) return hit.token;
    try {
      const refreshToken = decryptSecret(conn.refreshTokenEncrypted, this.encryptionKey);
      const t = await refreshGoogleAccessToken(this.oauth, refreshToken);
      this.cache.set(conn.id, { token: t.accessToken, expiresAt: Date.now() + t.expiresIn * 1000 });
      return t.accessToken;
    } catch (error) {
      this.dead.add(conn.id);
      if (error instanceof GoogleOAuthError && error.code === 'invalid_grant') {
        await this.db
          .update(googleConnections)
          .set({ status: 'revoked', lastError: 'Google access was removed — connect Google again on the Sites page.', updatedAt: new Date() })
          .where(eq(googleConnections.id, conn.id));
      }
      return null;
    }
  }

  forget(conn: Connection) {
    this.cache.delete(conn.id);
  }
}
