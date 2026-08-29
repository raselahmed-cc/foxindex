import * as http from 'node:http';
import * as https from 'node:https';
import { setDefaultAutoSelectFamily } from 'node:net';
import { isDnsValidationFailure, resolveAndValidateHostname } from './dns-pin';

/**
 * Node >=20's Happy Eyeballs (autoSelectFamily) races multiple resolved
 * addresses and, when active, calls a custom `lookup` option with a different
 * callback shape (an array of {address, family}) than the classic single
 * (err, address, family) tuple this module relies on for connection pinning —
 * since every request here has already been resolved to exactly one
 * validated address, there's nothing to race. This is process-global (not
 * per-request — `autoSelectFamily` isn't part of http.RequestOptions' type,
 * and setting Node's default is the documented way to control it), which is
 * safe: nothing else in these worker/API processes needs Happy Eyeballs.
 */
setDefaultAutoSelectFamily(false);

export type SafeFetchErrorCode =
  | 'SSRF_BLOCKED'
  | 'TIMEOUT'
  | 'DNS_ERROR'
  | 'TOO_MANY_REDIRECTS'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_SCHEME'
  | 'NETWORK_ERROR';

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  ok: boolean;
  statusCode?: number;
  body?: string;
  finalUrl?: string;
  error?: SafeFetchErrorCode;
  blockedReason?: string;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const USER_AGENT = 'FoxIndex-VerificationBot/1.0 (+https://foxindex.dev/bot)';

type RequestOutcome =
  | { statusCode: number; headers: http.IncomingHttpHeaders; body: string }
  | { error: SafeFetchErrorCode; message: string };

function performPinnedRequest(
  targetUrl: URL,
  pinnedAddress: string,
  pinnedFamily: number,
  method: string,
  headers: Record<string, string>,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<RequestOutcome> {
  return new Promise((resolve) => {
    const transport = targetUrl.protocol === 'https:' ? https : http;
    let settled = false;
    const settle = (outcome: RequestOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method,
        headers: { 'User-Agent': USER_AGENT, ...headers },
        timeout: timeoutMs,
        // Force the TCP connection to the address already validated by
        // resolveAndValidateHostname, instead of letting Node re-resolve DNS at
        // connect time — this is what closes the DNS-rebinding gap.
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress, pinnedFamily);
        },
      },
      (res) => {
        let received = 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxResponseBytes) {
            res.destroy();
            req.destroy();
            settle({ error: 'RESPONSE_TOO_LARGE', message: `Response exceeded ${maxResponseBytes} bytes` });
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          settle({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });

        res.on('error', (err) => {
          settle({ error: 'NETWORK_ERROR', message: err.message });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      settle({ error: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms` });
    });

    req.on('error', (err) => {
      settle({ error: 'NETWORK_ERROR', message: err.message });
    });

    req.end();
  });
}

/**
 * An SSRF-safe HTTP(S) fetch for outbound requests to user-supplied URLs/hostnames
 * (constitution §16). Used by the domain-verification worker's key-file check today;
 * Phase 2 crawler/diagnostic workers will reuse it directly, which is why this is a
 * standalone package rather than folded into packages/providers.
 *
 * Never follows redirects automatically — each hop is re-validated from scratch
 * (scheme + DNS + IP-range) exactly like the original request, so a redirect can't
 * be used to reach internal infrastructure after an initial public-looking URL
 * passed validation.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    method = 'GET',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    headers = {},
  } = options;

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'INVALID_SCHEME', blockedReason: `Not a valid URL: ${rawUrl}` };
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
      return {
        ok: false,
        error: 'INVALID_SCHEME',
        blockedReason: `Unsupported scheme: ${currentUrl.protocol}`,
      };
    }

    const resolution = await resolveAndValidateHostname(currentUrl.hostname);
    if (isDnsValidationFailure(resolution)) {
      const isDnsFailure = resolution.reason.startsWith('DNS resolution failed');
      return {
        ok: false,
        error: isDnsFailure ? 'DNS_ERROR' : 'SSRF_BLOCKED',
        blockedReason: resolution.reason,
      };
    }

    const outcome = await performPinnedRequest(
      currentUrl,
      resolution.address,
      resolution.family,
      method,
      headers,
      timeoutMs,
      maxResponseBytes,
    );

    if ('error' in outcome) {
      return { ok: false, error: outcome.error, blockedReason: outcome.message };
    }

    const isRedirect = outcome.statusCode >= 300 && outcome.statusCode < 400;
    const location = outcome.headers.location;
    if (isRedirect && location) {
      if (hop === maxRedirects) {
        return {
          ok: false,
          error: 'TOO_MANY_REDIRECTS',
          blockedReason: `Exceeded ${maxRedirects} redirects`,
        };
      }
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        return { ok: false, error: 'NETWORK_ERROR', blockedReason: 'Invalid redirect Location header' };
      }
      continue;
    }

    return {
      ok: true,
      statusCode: outcome.statusCode,
      body: outcome.body,
      finalUrl: currentUrl.toString(),
    };
  }

  return { ok: false, error: 'TOO_MANY_REDIRECTS', blockedReason: `Exceeded ${maxRedirects} redirects` };
}
