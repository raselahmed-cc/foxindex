/** A customer's "Connect Google Search Console" authorization, as the API returns it. */
export interface GoogleConnection {
  id: string;
  email: string;
  status: 'active' | 'revoked';
  lastError: string | null;
  connectedAt: string;
  refreshedAt: string | null;
  /** Search Console properties this account owns (only Owners can submit). */
  owned: string[];
  notOwned: { siteUrl: string; permission: string }[];
}

export interface GoogleConnections {
  available: boolean;
  connections: GoogleConnection[];
}

/** Same rule as the worker: domain properties cover every subdomain; URL-prefix ones cover their prefix. */
export function propertyCovers(siteUrl: string, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.slice('sc-domain:'.length).toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  return url.toLowerCase().startsWith(siteUrl.toLowerCase());
}

/** The active connection that can submit for this domain, if any. */
export function connectionForDomain(data: GoogleConnections | undefined, domain: string): GoogleConnection | null {
  const url = `https://${domain}/`;
  return data?.connections.find((c) => c.status === 'active' && c.owned.some((p) => propertyCovers(p, url) || propertyCovers(p, `https://www.${domain.replace(/^www\./, '')}/`))) ?? null;
}

/** "sc-domain:example.com" → "example.com (all subdomains)", "https://shop.example.com/" → "shop.example.com". */
export function propertyLabel(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return `${siteUrl.slice('sc-domain:'.length)} (whole domain)`;
  return siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
