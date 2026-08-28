import { DEFAULT_INDEXNOW_API_BASE_URL } from '@foxindex/config';
import { SubmissionProvider } from '@foxindex/types';
import type { IndexingProvider, SubmissionRequest, SubmissionResult } from '../types';

export interface IndexNowProviderOptions {
  apiBaseUrl?: string;
  timeoutMs?: number;
}

interface IndexNowRequestBody {
  host: string;
  key: string;
  keyLocation?: string;
  urlList: string[];
}

/**
 * IndexNow protocol client (indexnow.org/documentation). POSTs to the shared
 * multi-engine endpoint (api.indexnow.org by default — propagates to Bing,
 * Yandex, Naver, Seznam, Yep in one call). This is the ONLY live submission
 * provider in Phase 1 — Google has no general-purpose instant-indexing API (see
 * docs/architecture.md).
 */
export class IndexNowProvider implements IndexingProvider {
  readonly name = SubmissionProvider.INDEXNOW;

  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: IndexNowProviderOptions = {}) {
    this.apiBaseUrl =
      options.apiBaseUrl ?? process.env.INDEXNOW_API_BASE_URL ?? DEFAULT_INDEXNOW_API_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async submit(request: SubmissionRequest): Promise<SubmissionResult> {
    if (request.credentials.type !== 'INDEXNOW_KEY') {
      return {
        success: false,
        acceptedUrls: [],
        rejectedUrls: request.urls.map((url) => ({
          url,
          reason: 'Wrong credential type for IndexNowProvider',
        })),
        errorCode: 'VALIDATION_ERROR',
        errorMessage: 'IndexNowProvider requires INDEXNOW_KEY credentials',
        retryable: false,
      };
    }

    const body: IndexNowRequestBody = {
      host: request.domainHostname,
      key: request.credentials.indexNowKey,
      keyLocation: request.credentials.keyLocation,
      urlList: request.urls,
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.apiBaseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      return {
        success: false,
        acceptedUrls: [],
        rejectedUrls: request.urls.map((url) => ({ url, reason: 'Network error contacting IndexNow' })),
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }

    const responseText = await response.text().catch(() => undefined);

    // 200 OK / 202 Accepted (pending key validation) — both count as a successful push.
    if (response.status === 200 || response.status === 202) {
      return {
        success: true,
        providerStatusCode: response.status,
        acceptedUrls: [...request.urls],
        rejectedUrls: [],
        providerResponseRaw: responseText,
        retryable: false,
      };
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      return {
        success: false,
        providerStatusCode: response.status,
        acceptedUrls: [],
        rejectedUrls: request.urls.map((url) => ({ url, reason: 'Rate limited by IndexNow' })),
        providerResponseRaw: responseText,
        errorCode: 'RATE_LIMITED',
        errorMessage: 'IndexNow returned 429 Too Many Requests',
        retryable: true,
        retryAfterMs: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined,
      };
    }

    // 400 Bad Request, 403 Forbidden (bad/missing key), 422 Unprocessable Entity
    // (URL doesn't match host/key scope) are all deterministic client errors —
    // retrying without changing the request would just fail again.
    if (response.status === 400 || response.status === 403 || response.status === 422) {
      return {
        success: false,
        providerStatusCode: response.status,
        acceptedUrls: [],
        rejectedUrls: request.urls.map((url) => ({
          url,
          reason: `IndexNow rejected the request (HTTP ${response.status})`,
        })),
        providerResponseRaw: responseText,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: `IndexNow returned HTTP ${response.status}`,
        retryable: false,
      };
    }

    // 5xx or anything unexpected — treat as transient.
    return {
      success: false,
      providerStatusCode: response.status,
      acceptedUrls: [],
      rejectedUrls: request.urls.map((url) => ({
        url,
        reason: `Unexpected IndexNow response (HTTP ${response.status})`,
      })),
      providerResponseRaw: responseText,
      errorCode: 'PROVIDER_ERROR',
      errorMessage: `IndexNow returned unexpected HTTP ${response.status}`,
      retryable: true,
    };
  }
}
