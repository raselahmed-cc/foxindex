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
export const GOOGLE_INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
/** One token covers submitting (Indexing API) and checking index status (URL Inspection). */
const SCOPE = 'https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters.readonly';

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

/** Search Console's verdict for one URL (same as its URL Inspection tool). */
export type GoogleInspectOutcome =
  | {
      kind: 'ok';
      /** PASS = on Google; NEUTRAL/FAIL = not indexed. */
      verdict: string;
      /** Google's wording, e.g. "Submitted and indexed", "Crawled - currently not indexed". */
      coverageState: string | null;
      lastCrawlTime: string | null;
      raw: unknown;
    }
  | { kind: 'quota_exhausted'; status: number; message: string }
  /** Not an owner of this property (or the URL isn't in it) — try another property/account. */
  | { kind: 'permission_denied'; status: number; message: string }
  | { kind: 'invalid_url'; status: number; message: string }
  | { kind: 'retryable'; status: number | null; message: string };

export interface GoogleIndexingClientOptions {
  tokenUrl?: string;
  publishUrl?: string;
  inspectUrl?: string;
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
  private readonly inspectUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: GoogleIndexingClientOptions = {}) {
    this.tokenUrl = options.tokenUrl ?? GOOGLE_TOKEN_URL;
    this.publishUrl = options.publishUrl ?? GOOGLE_PUBLISH_URL;
    this.inspectUrl = options.inspectUrl ?? GOOGLE_INSPECT_URL;
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

  /** Service-account token, or the outcome to report when the account can't be used. */
  private async tokenFor(sa: GoogleServiceAccount): Promise<{ token: string } | { kind: 'permission_denied' | 'retryable'; status: number | null; message: string }> {
    try {
      return { token: await this.accessToken(sa) };
    } catch (error) {
      if (error instanceof GoogleAuthError && (error.status === 400 || error.status === 401)) {
        // invalid_grant: bad/revoked key — this account can't be used at all.
        return { kind: 'permission_denied', status: error.status, message: `Service account rejected by Google: ${error.message}` };
      }
      return { kind: 'retryable', status: error instanceof GoogleAuthError ? error.status : null, message: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Notify Google that `url` was added or updated, as a service account. Never throws. */
  async publish(url: string, sa: GoogleServiceAccount): Promise<GooglePublishOutcome> {
    const t = await this.tokenFor(sa);
    if (!('token' in t)) return t as GooglePublishOutcome;
    return this.publishWithToken(url, t.token, () => this.tokens.delete(sa.id));
  }

  /**
   * Same, with an access token from a customer's "Connect Google" sign-in (they own the
   * property). `onUnauthorized` lets the caller drop a stale token. Never throws.
   */
  async publishWithToken(url: string, token: string, onUnauthorized?: () => void): Promise<GooglePublishOutcome> {
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
      onUnauthorized?.();
      return { kind: 'retryable', status: 401, message };
    }
    if (response.status === 400 || response.status === 404) return { kind: 'invalid_url', status: response.status, message };
    return { kind: 'retryable', status: response.status, message };
  }

  /**
   * Ask Search Console whether `url` is on Google, as a service account. `siteUrl` is the
   * property it owns: "sc-domain:example.com" or "https://example.com/". Never throws.
   */
  async inspect(url: string, siteUrl: string, sa: GoogleServiceAccount): Promise<GoogleInspectOutcome> {
    const t = await this.tokenFor(sa);
    if (!('token' in t)) return t as GoogleInspectOutcome;
    return this.inspectWithToken(url, siteUrl, t.token, () => this.tokens.delete(sa.id));
  }

  /** Same, with a customer's "Connect Google" access token. Never throws. */
  async inspectWithToken(url: string, siteUrl: string, token: string, onUnauthorized?: () => void): Promise<GoogleInspectOutcome> {
    let response: Response;
    try {
      response = await this.request(this.inspectUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: 'en-US' }),
      });
    } catch (error) {
      return { kind: 'retryable', status: null, message: error instanceof Error ? error.message : String(error) };
    }

    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string; lastCrawlTime?: string } };
      };
      const r = body.inspectionResult?.indexStatusResult ?? {};
      return { kind: 'ok', verdict: r.verdict ?? 'VERDICT_UNSPECIFIED', coverageState: r.coverageState ?? null, lastCrawlTime: r.lastCrawlTime ?? null, raw: body };
    }
    const message = await errorMessage(response);
    if (response.status === 429 || /quota|rate limit/i.test(message)) return { kind: 'quota_exhausted', status: response.status, message };
    if (response.status === 403) return { kind: 'permission_denied', status: 403, message };
    if (response.status === 401) {
      onUnauthorized?.();
      return { kind: 'retryable', status: 401, message };
    }
    // 400 is also what Google answers when the URL isn't inside the property — try the next property.
    if (response.status === 400 && /property|not part of|siteUrl/i.test(message)) return { kind: 'permission_denied', status: 400, message };
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
