import { createSign } from 'node:crypto';

/**
 * Google Indexing API (urlNotifications:publish) with service-account auth.
 * Tokens are minted from a self-signed RS256 JWT — no Google SDK dependency —
 * and cached per account until shortly before expiry.
 *
 * Google only accepts a notification when the service account is an Owner of
 * the URL's Search Console property; otherwise it answers 403, which is
 * reported as `permission_denied` (not retryable for that URL).
 */

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_PUBLISH_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const SCOPE = 'https://www.googleapis.com/auth/indexing';

export interface GoogleServiceAccount {
  /** Stable id used for token caching. */
  id: string;
  clientEmail: string;
  privateKey: string;
}

export type GooglePublishOutcome =
  | { kind: 'ok'; status: number }
  /** This account hit its daily quota — try another account. */
  | { kind: 'quota_exhausted'; status: number; message: string }
  /** The account isn't an owner of the property — retrying won't help. */
  | { kind: 'permission_denied'; status: number; message: string }
  /** Malformed/unsupported URL — retrying won't help. */
  | { kind: 'invalid_url'; status: number; message: string }
  /** Network/5xx/auth hiccup — retry later. */
  | { kind: 'retryable'; status: number | null; message: string };

export interface GoogleIndexingClientOptions {
  tokenUrl?: string;
  publishUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

/** RS256 JWT assertion for the OAuth2 JWT-bearer grant. Exported for tests. */
export function signServiceAccountJwt(sa: Pick<GoogleServiceAccount, 'clientEmail' | 'privateKey'>, audience: string, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: audience, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  // Service-account JSON stores the key with literal "\n" sequences when copied through env/DB.
  const signature = signer.sign(sa.privateKey.replace(/\\n/g, '\n'), 'base64url');
  return `${header}.${claims}.${signature}`;
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; error_description?: string };
    if (typeof parsed.error === 'object' && parsed.error?.message) return parsed.error.message;
    if (parsed.error_description) return parsed.error_description;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON
  }
  return text.slice(0, 300) || `HTTP ${response.status}`;
}

export class GoogleIndexingClient {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();
  private readonly tokenUrl: string;
  private readonly publishUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: GoogleIndexingClientOptions = {}) {
    this.tokenUrl = options.tokenUrl ?? GOOGLE_TOKEN_URL;
    this.publishUrl = options.publishUrl ?? GOOGLE_PUBLISH_URL;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cached OAuth2 access token for the account; refreshed 2 minutes before expiry. */
  async accessToken(sa: GoogleServiceAccount): Promise<string> {
    const cached = this.tokens.get(sa.id);
    if (cached && cached.expiresAt - 120_000 > this.now()) return cached.token;
    const assertion = signServiceAccountJwt(sa, this.tokenUrl, Math.floor(this.now() / 1000));
    const response = await this.request(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!response.ok) throw new GoogleAuthError(response.status, await errorMessage(response));
    const body = (await response.json()) as { access_token: string; expires_in?: number };
    this.tokens.set(sa.id, { token: body.access_token, expiresAt: this.now() + (body.expires_in ?? 3600) * 1000 });
    return body.access_token;
  }

  /** Notify Google that `url` was added or updated. Never throws. */
  async publish(url: string, sa: GoogleServiceAccount): Promise<GooglePublishOutcome> {
    let token: string;
    try {
      token = await this.accessToken(sa);
    } catch (error) {
      if (error instanceof GoogleAuthError && (error.status === 400 || error.status === 401)) {
        // invalid_grant: bad/revoked key — this account can't be used at all.
        return { kind: 'permission_denied', status: error.status, message: `Service account rejected by Google: ${error.message}` };
      }
      return { kind: 'retryable', status: error instanceof GoogleAuthError ? error.status : null, message: error instanceof Error ? error.message : String(error) };
    }

    let response: Response;
    try {
      response = await this.request(this.publishUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
      });
    } catch (error) {
      return { kind: 'retryable', status: null, message: error instanceof Error ? error.message : String(error) };
    }

    if (response.ok) return { kind: 'ok', status: response.status };
    const message = await errorMessage(response);
    if (response.status === 429) return { kind: 'quota_exhausted', status: 429, message };
    if (response.status === 403) {
      // Quota errors are sometimes 403 with a rate-limit reason.
      if (/quota|rate limit/i.test(message)) return { kind: 'quota_exhausted', status: 403, message };
      return { kind: 'permission_denied', status: 403, message };
    }
    if (response.status === 401) {
      this.tokens.delete(sa.id);
      return { kind: 'retryable', status: 401, message };
    }
    if (response.status === 400 || response.status === 404) return { kind: 'invalid_url', status: response.status, message };
    return { kind: 'retryable', status: response.status, message };
  }
}

export class GoogleAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}
