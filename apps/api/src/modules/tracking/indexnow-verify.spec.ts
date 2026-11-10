import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetch = vi.fn();
vi.mock('@foxindex/ssrf-fetch', () => ({ safeFetch: (...args: unknown[]) => safeFetch(...args) }));

const { TrackingService } = await import('./tracking.service');

const KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

function setup(domain = 'example.com') {
  const site = { id: 's1', userId: 'u1', domain, indexnowKey: KEY, indexnowVerifiedAt: null as Date | null };
  const saved: Record<string, unknown>[] = [];
  const db = {
    query: { sites: { findFirst: vi.fn().mockResolvedValue(site) } },
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => ({ where: () => ({ returning: async () => (saved.push(v), [{ ...site, ...v }]) }) }),
    })),
  };
  const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new TrackingService(db as never, {} as never, auditLog as never);
  return { service, saved };
}

const caller = { userId: 'u1' } as never;

describe('TrackingService.verifyIndexNow', () => {
  beforeEach(() => safeFetch.mockReset());

  it('verifies when the key file holds exactly the key', async () => {
    safeFetch.mockResolvedValue({ ok: true, statusCode: 200, body: `${KEY}\n` });
    const { service, saved } = setup();
    const r = await service.verifyIndexNow(caller, 's1');
    expect(r.verified).toBe(true);
    expect(safeFetch).toHaveBeenCalledWith(`https://example.com/${KEY}.txt`, expect.objectContaining({ maxResponseBytes: 4096 }));
    expect(saved[0]).toMatchObject({ indexnowLastError: null });
    expect(saved[0].indexnowVerifiedAt).toBeInstanceOf(Date);
  });

  it('accepts the file on the www host when the bare domain misses it', async () => {
    safeFetch.mockResolvedValueOnce({ ok: false, statusCode: 404, body: 'Not found' }).mockResolvedValueOnce({ ok: true, statusCode: 200, body: KEY });
    const { service } = setup();
    expect((await service.verifyIndexNow(caller, 's1')).verified).toBe(true);
    expect(safeFetch).toHaveBeenLastCalledWith(`https://www.example.com/${KEY}.txt`, expect.anything());
  });

  it('rejects a file with the wrong content and explains why', async () => {
    safeFetch.mockResolvedValue({ ok: true, statusCode: 200, body: '<html>home page</html>' });
    const { service, saved } = setup();
    const r = await service.verifyIndexNow(caller, 's1');
    expect(r.verified).toBe(false);
    expect(r.lastError).toContain("doesn't contain exactly the key");
    expect(saved[0]).toMatchObject({ indexnowVerifiedAt: null });
  });

  it('reports an unreachable site in plain words', async () => {
    safeFetch.mockResolvedValue({ ok: false, error: 'TIMEOUT' });
    const { service } = setup();
    expect((await service.verifyIndexNow(caller, 's1')).lastError).toContain('took too long');
  });
});
