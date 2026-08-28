import { createHash } from 'node:crypto';

export interface NormalizedUrl {
  normalizedUrl: string;
  normalizedUrlHash: string;
}

export class InvalidUrlError extends Error {
  constructor(
    public readonly rawValue: string,
    cause?: unknown,
  ) {
    super(`Invalid or unsupported URL: ${rawValue}`);
    this.name = 'InvalidUrlError';
    if (cause) this.cause = cause;
  }
}

const DEFAULT_PORT_BY_PROTOCOL: Record<string, string> = { 'http:': '80', 'https:': '443' };

/**
 * Deterministic URL normalization backing the (project_id, normalized_url_hash)
 * uniqueness constraint (constitution §10) — two differently-formatted URLs that
 * point at the same resource must normalize (and therefore hash) identically.
 *
 * Normalizes: scheme restricted to http/https, hostname lowercased + punycode via
 * the WHATWG URL parser, default ports stripped, credentials stripped (never
 * meaningful for a public indexable page), fragment removed, query params sorted
 * by key then value, empty path represented as "/".
 *
 * Deliberately NOT collapsed: trailing slashes on non-root paths, since "/page/"
 * and "/page" can be genuinely distinct resources on a real server — collapsing
 * them risks silently merging two different pages' submission history.
 */
export function normalizeUrl(rawUrl: string): NormalizedUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (cause) {
    throw new InvalidUrlError(rawUrl, cause);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidUrlError(rawUrl);
  }

  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';

  if (parsed.port === DEFAULT_PORT_BY_PROTOCOL[parsed.protocol]) {
    parsed.port = '';
  }

  const sortedParams = new URLSearchParams(
    [...parsed.searchParams.entries()].sort(([aKey, aVal], [bKey, bVal]) =>
      aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey),
    ),
  );
  parsed.search = sortedParams.toString();

  if (parsed.pathname === '') {
    parsed.pathname = '/';
  }

  const normalizedUrl = parsed.toString();
  const normalizedUrlHash = createHash('sha256').update(normalizedUrl).digest('hex');

  return { normalizedUrl, normalizedUrlHash };
}

/**
 * Normalizes a bare hostname (no scheme/path) for domain records: trimmed,
 * lowercased, punycode-encoded, trailing dot removed. Rejects anything that
 * isn't a plain hostname (a path, query string, credentials, etc).
 */
export function normalizeHostname(rawHostname: string): string {
  const trimmed = rawHostname.trim().toLowerCase().replace(/\.$/, '');
  let parsed: URL;
  try {
    parsed = new URL(`https://${trimmed}`);
  } catch (cause) {
    throw new InvalidUrlError(rawHostname, cause);
  }
  if (
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== ''
  ) {
    throw new InvalidUrlError(rawHostname);
  }
  return parsed.hostname;
}

/** True if `url`'s normalized hostname matches `hostname` exactly. */
export function urlBelongsToHostname(normalizedUrl: string, hostname: string): boolean {
  return new URL(normalizedUrl).hostname === hostname;
}
