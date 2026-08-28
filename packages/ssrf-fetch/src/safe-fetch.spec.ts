import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from './safe-fetch';
import * as dnsPin from './dns-pin';

// safe-fetch's own HTTP orchestration (redirects, timeouts, size caps) is tested
// here against a real local server with DNS-pinning mocked to point at it — the
// DNS/IP-blocking logic itself is unit-tested in ip-blocklist.spec.ts.
vi.mock('./dns-pin', async (importOriginal) => {
  const actual = await importOriginal<typeof dnsPin>();
  return { ...actual, resolveAndValidateHostname: vi.fn() };
});

const mockedResolve = vi.mocked(dnsPin.resolveAndValidateHostname);

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello');
      return;
    }
    if (req.url === '/redirect-once') {
      res.writeHead(302, { Location: '/ok' });
      res.end();
      return;
    }
    if (req.url === '/redirect-loop') {
      res.writeHead(302, { Location: '/redirect-loop' });
      res.end();
      return;
    }
    if (req.url === '/big') {
      res.writeHead(200);
      res.end('x'.repeat(2000));
      return;
    }
    if (req.url === '/slow') {
      // never respond — used to exercise the timeout path
      return;
    }
    if (req.url === '/not-found') {
      res.writeHead(404);
      res.end('nope');
      return;
    }
    res.writeHead(200);
    res.end('default');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  mockedResolve.mockReset();
  mockedResolve.mockResolvedValue({ address: '127.0.0.1', family: 4 });
});

describe('safeFetch', () => {
  it('returns the response body/status for a normal 200', async () => {
    const result = await safeFetch(`${baseUrl}/ok`);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('hello');
  });

  it('returns ok:true with the real status code for a non-2xx response (e.g. 404)', async () => {
    const result = await safeFetch(`${baseUrl}/not-found`);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(404);
  });

  it('follows a redirect and re-validates the target', async () => {
    const result = await safeFetch(`${baseUrl}/redirect-once`);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('hello');
    expect(mockedResolve).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRedirects and reports TOO_MANY_REDIRECTS', async () => {
    const result = await safeFetch(`${baseUrl}/redirect-loop`, { maxRedirects: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('TOO_MANY_REDIRECTS');
  });

  it('is blocked when DNS resolution is denied (private/metadata address)', async () => {
    mockedResolve.mockResolvedValueOnce({ blocked: true, reason: 'blocked for test' });
    const result = await safeFetch(`${baseUrl}/ok`);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('SSRF_BLOCKED');
  });

  it('blocks a redirect target that resolves to a private address mid-chain', async () => {
    mockedResolve
      .mockResolvedValueOnce({ address: '127.0.0.1', family: 4 }) // initial hop: allowed
      .mockResolvedValueOnce({ blocked: true, reason: 'redirect target is private' }); // second hop: blocked
    const result = await safeFetch(`${baseUrl}/redirect-once`);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('SSRF_BLOCKED');
  });

  it('enforces the response size cap', async () => {
    const result = await safeFetch(`${baseUrl}/big`, { maxResponseBytes: 500 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('RESPONSE_TOO_LARGE');
  });

  it('enforces the timeout', async () => {
    const result = await safeFetch(`${baseUrl}/slow`, { timeoutMs: 200 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('TIMEOUT');
  }, 2000);

  it('rejects a non-http(s) scheme before any network activity', async () => {
    const result = await safeFetch('ftp://127.0.0.1/file');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_SCHEME');
    expect(mockedResolve).not.toHaveBeenCalled();
  });

  it('rejects unparseable input', async () => {
    const result = await safeFetch('not a url');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_SCHEME');
  });
});
