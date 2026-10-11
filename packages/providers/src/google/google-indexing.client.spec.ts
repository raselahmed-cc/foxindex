import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GoogleIndexingClient, signServiceAccountJwt } from './google-indexing.client';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const sa = { id: 'sa-1', clientEmail: 'bot@project.iam.gserviceaccount.com', privateKey: pem };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(publishResponses: Response[], tokenResponse: Response = json(200, { access_token: 'tok', expires_in: 3600 })) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('token')) return tokenResponse.clone();
    return publishResponses.shift() ?? json(500, {});
  }) as unknown as typeof fetch;
  return { c: new GoogleIndexingClient({ fetchImpl, tokenUrl: 'https://token', publishUrl: 'https://publish' }), calls };
}

describe('signServiceAccountJwt', () => {
  it('produces a verifiable RS256 assertion with the indexing scope', () => {
    const jwt = signServiceAccountJwt(sa, 'https://token', 1_700_000_000);
    const [h, c, s] = jwt.split('.');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${h}.${c}`);
    expect(verifier.verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: sa.clientEmail, aud: 'https://token', scope: 'https://www.googleapis.com/auth/indexing', exp: 1_700_003_600 });
  });

  it('accepts keys whose newlines were escaped', () => {
    expect(() => signServiceAccountJwt({ ...sa, privateKey: pem.replace(/\n/g, '\\n') }, 'a', 1)).not.toThrow();
  });
});

describe('GoogleIndexingClient.publish', () => {
  it('reports success and caches the token', async () => {
    const { c, calls } = client([json(200, {}), json(200, {})]);
    expect(await c.publish('https://a.com/1', sa)).toEqual({ kind: 'ok', status: 200 });
    await c.publish('https://a.com/2', sa);
    expect(calls.filter((u) => u.includes('token'))).toHaveLength(1);
  });

  it('classifies quota, permission, bad URL and server errors', async () => {
    const { c } = client([
      json(429, { error: { message: 'Quota exceeded' } }),
      json(403, { error: { message: 'Permission denied. Failed to verify the URL ownership.' } }),
      json(403, { error: { message: 'Rate Limit Exceeded' } }),
      json(400, { error: { message: 'Invalid URL' } }),
      json(503, { error: { message: 'Backend unavailable' } }),
    ]);
    expect((await c.publish('u', sa)).kind).toBe('quota_exhausted');
    expect(await c.publish('u', sa)).toMatchObject({ kind: 'permission_denied', message: expect.stringContaining('ownership') });
    expect((await c.publish('u', sa)).kind).toBe('quota_exhausted');
    expect((await c.publish('u', sa)).kind).toBe('invalid_url');
    expect((await c.publish('u', sa)).kind).toBe('retryable');
  });

  it('treats a rejected service account as unusable', async () => {
    const { c } = client([], json(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }));
    expect(await c.publish('u', sa)).toMatchObject({ kind: 'permission_denied', message: expect.stringContaining('Invalid JWT Signature') });
  });
});
