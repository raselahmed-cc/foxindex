import { normalizeUrl } from '@foxindex/validation';

export interface PreparedUrl {
  url: string;
  normalizedUrl: string;
  host: string;
}

export interface PreparedBatch {
  urls: PreparedUrl[];
  hosts: string[];
  skipped: { invalid: number; duplicate: number; otherDomain: number };
}

/** "example.com" or "www.example.com" both count as on site "example.com". */
export function belongsToDomain(host: string, domain: string): boolean {
  const h = host.replace(/^www\./, '');
  const d = domain.replace(/^www\./, '');
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Lines → normalized, de-duplicated URLs. Bare hosts get https://. When a
 * site domain is given, URLs on other domains are skipped rather than
 * silently submitted under the wrong site.
 */
export function prepareUrls(lines: string[], siteDomain?: string): PreparedBatch {
  const seen = new Set<string>();
  const urls: PreparedUrl[] = [];
  const skipped = { invalid: 0, duplicate: 0, otherDomain: 0 };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/\s/.test(line)) {
      skipped.invalid++;
      continue;
    }
    let normalized: string;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(line) ? line : `https://${line}`;
    try {
      normalized = normalizeUrl(withScheme).normalizedUrl;
    } catch {
      skipped.invalid++;
      continue;
    }
    const host = new URL(normalized).hostname;
    if (!host.includes('.')) {
      skipped.invalid++;
      continue;
    }
    if (siteDomain && !belongsToDomain(host, siteDomain)) {
      skipped.otherDomain++;
      continue;
    }
    if (seen.has(normalized)) {
      skipped.duplicate++;
      continue;
    }
    seen.add(normalized);
    // Store the URL with its scheme so engines get an absolute URL; `host` is the
    // site key, so www.example.com and example.com land on one site.
    urls.push({ url: withScheme, normalizedUrl: normalized, host: host.replace(/^www\./, '') });
  }

  return { urls, hosts: [...new Set(urls.map((u) => u.host))], skipped };
}

/** "techbazar.com.bd · 10 Oct" / "3 sites · 10 Oct" */
export function defaultBatchName(hosts: string[], now = new Date()): string {
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const label = hosts.length === 1 ? hosts[0].replace(/^www\./, '') : `${hosts.length} sites`;
  return `${label} · ${date}`;
}
