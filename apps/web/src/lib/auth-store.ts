/**
 * In-memory only (CLAUDE.md "Frontend rules": no localStorage for auth) — the
 * refresh token lives in an httpOnly cookie the browser manages automatically
 * (see apiClient's `credentials: 'include'`); this module just holds the
 * short-lived access token for attaching to Authorization headers. Resets on
 * a full page reload — restoring it via POST /auth/refresh on app bootstrap
 * is dashboard-layout work, not part of the auth pages themselves.
 */
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}
