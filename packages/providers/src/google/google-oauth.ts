/**
 * "Connect Google Search Console": the customer signs in with the Google account
 * that owns their sites and lets FoxIndex submit and inspect URLs on their behalf.
 * Google only accepts Indexing API calls from an Owner of the property, so the
 * customer's own authorization replaces adding our service account as an Owner.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const GSC_SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';

export const GOOGLE_CONNECT_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/indexing',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** A Search Console property and the connected account's access to it. */
export interface GscProperty {
  siteUrl: string;
  permissionLevel: string;
}

export class GoogleOAuthError extends Error {
  constructor(
    readonly status: number,
    /** Google's error code, e.g. "invalid_grant" when access was revoked. */
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

async function readError(res: Response): Promise<{ code: string | null; message: string }> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { error?: string | { message?: string; status?: string }; error_description?: string };
    if (typeof j.error === 'string') return { code: j.error, message: j.error_description ?? j.error };
    if (j.error && typeof j.error === 'object') return { code: j.error.status ?? null, message: j.error.message ?? `HTTP ${res.status}` };
  } catch {
    /* not JSON */
  }
  return { code: null, message: text.slice(0, 200) || `HTTP ${res.status}` };
}

/** Where to send the customer to approve access. `state` must be unguessable and tied to their session. */
export function buildGoogleAuthUrl(cfg: Pick<GoogleOAuthConfig, 'clientId' | 'redirectUri'>, state: string, loginHint?: string): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', GOOGLE_CONNECT_SCOPES.join(' '));
  // Offline + consent: always get a refresh token, so submissions keep working when they're away.
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  if (loginHint) u.searchParams.set('login_hint', loginHint);
  return u.toString();
}

/** Email claim from Google's ID token (already delivered over TLS from Google's token endpoint). */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode(cfg: GoogleOAuthConfig, code: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const e = await readError(res);
    throw new GoogleOAuthError(res.status, e.code, e.message);
  }
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresIn: body.expires_in ?? 3600,
    scopes: (body.scope ?? '').split(' ').filter(Boolean),
    email: emailFromIdToken(body.id_token),
  };
}

export async function refreshGoogleAccessToken(cfg: Pick<GoogleOAuthConfig, 'clientId' | 'clientSecret'>, refreshToken: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const e = await readError(res);
    throw new GoogleOAuthError(res.status, e.code, e.message);
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

/** Every Search Console property the connected account can see. */
export async function listGscProperties(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GscProperty[]> {
  const res = await fetchImpl(GSC_SITES_URL, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const e = await readError(res);
    throw new GoogleOAuthError(res.status, e.code, e.message);
  }
  const body = (await res.json()) as { siteEntry?: GscProperty[] };
  return (body.siteEntry ?? []).map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }));
}

export async function revokeGoogleToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}

/** Only Owners can use the Indexing API for a property. */
export const isOwner = (p: GscProperty) => p.permissionLevel === 'siteOwner';

/** Does this property cover the URL? Domain properties cover every subdomain and protocol. */
export function propertyCovers(siteUrl: string, url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.slice('sc-domain:'.length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  return url.toLowerCase().startsWith(siteUrl.toLowerCase());
}

/** The owned property to use for a URL — a domain property first, then the longest matching URL prefix. */
export function pickOwnedProperty(properties: GscProperty[], url: string): GscProperty | null {
  const covering = properties.filter((p) => isOwner(p) && propertyCovers(p.siteUrl, url));
  covering.sort((a, b) => Number(b.siteUrl.startsWith('sc-domain:')) - Number(a.siteUrl.startsWith('sc-domain:')) || b.siteUrl.length - a.siteUrl.length);
  return covering[0] ?? null;
}
