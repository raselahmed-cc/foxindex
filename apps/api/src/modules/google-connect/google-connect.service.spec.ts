import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Providers from '@foxindex/providers';

const exchangeGoogleCode = vi.fn();
const listGscProperties = vi.fn();
vi.mock('@foxindex/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof Providers>()),
  exchangeGoogleCode: (...a: unknown[]) => exchangeGoogleCode(...a),
  listGscProperties: (...a: unknown[]) => listGscProperties(...a),
}));

const { GoogleConnectService } = await import('./google-connect.service');

const KEY = 'test-encryption-key-0123456789abcdef';

function setup() {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret';
  process.env.CORS_ORIGIN = 'https://foxindex.net';
  const store = new Map<string, string>();
  const redis = {
    set: vi.fn(async (k: string, v: string) => (store.set(k, v), 'OK')),
    getdel: vi.fn(async (k: string) => {
      const v = store.get(k) ?? null;
      store.delete(k);
      return v;
    }),
  };
  const saved: Record<string, unknown>[] = [];
  const db = {
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => ({ onConflictDoUpdate: () => ({ returning: async () => (saved.push(v), [{ id: 'conn1', ...v }]) }) }),
    })),
  };
  const config = { getOrThrow: (k: string) => (k === 'ENCRYPTION_KEY' ? KEY : 'https://foxindex.net') };
  const auditLog = { record: vi.fn() };
  const service = new GoogleConnectService(db as never, redis as never, config as never, auditLog as never);
  return { service, saved, redis };
}

describe('GoogleConnectService', () => {
  beforeEach(() => {
    exchangeGoogleCode.mockReset();
    listGscProperties.mockReset();
  });

  it('builds the sign-in link with a one-time state tied to the customer', async () => {
    const { service, redis } = setup();
    const { url } = await service.start('user-1');
    const state = new URL(url).searchParams.get('state')!;
    expect(new URL(url).searchParams.get('redirect_uri')).toBe('https://foxindex.net/api/v1/google/oauth/callback');
    expect(redis.set).toHaveBeenCalledWith(`gconnect:state:${state}`, 'user-1', 'EX', 600);
  });

  it('saves the connection (token encrypted) and reports how many sites are owned', async () => {
    const { service, saved } = setup();
    const { url } = await service.start('user-1');
    const state = new URL(url).searchParams.get('state')!;
    exchangeGoogleCode.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt-secret', expiresIn: 3600, scopes: ['https://www.googleapis.com/auth/indexing'], email: 'owner@example.com' });
    listGscProperties.mockResolvedValue([
      { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
      { siteUrl: 'https://other.com/', permissionLevel: 'siteRestrictedUser' },
    ]);
    const next = await service.callback({ state, code: 'abc' });
    expect(next).toBe('https://foxindex.net/sites?google=connected&owned=1');
    expect(saved[0]).toMatchObject({ userId: 'user-1', googleEmail: 'owner@example.com', status: 'active' });
    expect(String(saved[0].refreshTokenEncrypted)).not.toContain('rt-secret');
  });

  it('rejects a reused or unknown state', async () => {
    const { service } = setup();
    const { url } = await service.start('user-1');
    const state = new URL(url).searchParams.get('state')!;
    exchangeGoogleCode.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, scopes: ['https://www.googleapis.com/auth/indexing'], email: 'a@b.c' });
    listGscProperties.mockResolvedValue([]);
    await service.callback({ state, code: 'abc' });
    expect(await service.callback({ state, code: 'abc' })).toContain('google=error&reason=expired');
    expect(await service.callback({ state: 'made-up', code: 'abc' })).toContain('reason=expired');
  });

  it('explains a cancelled sign-in and a missing Indexing permission', async () => {
    const { service } = setup();
    let state = new URL((await service.start('u')).url).searchParams.get('state')!;
    expect(await service.callback({ state, error: 'access_denied' })).toContain('reason=denied');

    state = new URL((await service.start('u')).url).searchParams.get('state')!;
    exchangeGoogleCode.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, scopes: ['openid', 'email'], email: 'a@b.c' });
    expect(await service.callback({ state, code: 'abc' })).toContain('reason=missing_permission');
  });
});
