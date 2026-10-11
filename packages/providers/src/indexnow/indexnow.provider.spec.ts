import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmissionProvider } from '@foxindex/types';
import { IndexNowProvider } from './indexnow.provider';
import type { SubmissionRequest } from '../types';

function jsonResponse(status: number, headers: Record<string, string> = {}, body = ''): Response {
  return new Response(body, { status, headers });
}

const baseRequest: SubmissionRequest = {
  domainHostname: 'example.com',
  urls: ['https://example.com/page-1', 'https://example.com/page-2'],
  credentials: { type: 'INDEXNOW_KEY', indexNowKey: 'a'.repeat(32) },
};

describe('IndexNowProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has the INDEXNOW provider name', () => {
    expect(new IndexNowProvider().name).toBe(SubmissionProvider.INDEXNOW);
  });

  it('sends the correct request shape to the configured endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    await provider.submit(baseRequest);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mock.test/indexnow');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      host: 'example.com',
      key: 'a'.repeat(32),
      keyLocation: undefined,
      urlList: baseRequest.urls,
    });
  });

  it.each([200, 202])('treats HTTP %i as success', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status));
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    const result = await provider.submit(baseRequest);

    expect(result.success).toBe(true);
    expect(result.acceptedUrls).toEqual(baseRequest.urls);
    expect(result.rejectedUrls).toEqual([]);
    expect(result.retryable).toBe(false);
  });

  it.each([400, 403, 422])('treats HTTP %i as a non-retryable VALIDATION_ERROR', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse(status));
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    const result = await provider.submit(baseRequest);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION_ERROR');
    expect(result.retryable).toBe(false);
  });

  it('treats HTTP 429 as a retryable RATE_LIMITED error and parses Retry-After', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { 'retry-after': '30' }));
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    const result = await provider.submit(baseRequest);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
    expect(result.retryAfterMs).toBe(30_000);
  });

  it('treats HTTP 5xx as a retryable PROVIDER_ERROR', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503));
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    const result = await provider.submit(baseRequest);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('PROVIDER_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('treats a thrown network error as a retryable NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    const result = await provider.submit(baseRequest);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NETWORK_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('rejects a request with the wrong credential type before calling fetch', async () => {
    const provider = new IndexNowProvider({ apiBaseUrl: 'https://mock.test/indexnow' });
    const result = await provider.submit({
      ...baseRequest,
      credentials: { type: 'OAUTH_TOKEN' } as never,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION_ERROR');
    expect(result.retryable).toBe(false);
  });
});
