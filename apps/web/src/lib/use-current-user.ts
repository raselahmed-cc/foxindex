'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from './api-client';
import { getAccessToken, setAccessToken } from './auth-store';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

// Module-level, not per-component: POST /auth/refresh rotates the refresh
// token (the old one is revoked server-side), so it isn't safe to call
// twice concurrently with the same cookie — the loser gets a 401. React's
// StrictMode double-invokes effects in dev, which would otherwise fire two
// real refresh requests on every mount. Sharing one in-flight promise across
// both invocations makes bootstrap idempotent; clearing it once settled
// means a genuinely later call (e.g. after logout/login) still runs fresh.
let bootstrapPromise: Promise<CurrentUser> | null = null;

function bootstrapSession(): Promise<CurrentUser> {
  bootstrapPromise ??= (async () => {
    try {
      if (!getAccessToken()) {
        const { accessToken } = await apiClient.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(accessToken);
      }
      return await apiClient.get<CurrentUser>('/me');
    } finally {
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

/**
 * Restores a session on mount: if the in-memory access token is gone (a full
 * page reload — it's never persisted, per CLAUDE.md "no localStorage for
 * auth"), silently exchanges the httpOnly refresh cookie for a new one via
 * POST /auth/refresh, then loads the current user from GET /me. Redirects to
 * /login on any failure (no valid refresh cookie, expired session, etc).
 */
export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    bootstrapSession()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { user, loading };
}
