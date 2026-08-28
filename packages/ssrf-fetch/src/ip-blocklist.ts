import ipaddr from 'ipaddr.js';

/**
 * Test-only escape hatch for the Playwright E2E fixture's local key-file server.
 * Read once from process.env at module load — never derived from user input, and
 * never set outside a test environment (see infrastructure/docker's E2E compose
 * override, the only place this is wired to "true").
 */
const TEST_ESCAPE_HATCH = process.env.SSRF_FETCH_ALLOW_PRIVATE === 'true';

/**
 * Default-deny address check: true only for the public "unicast" range. Everything
 * ipaddr.js classifies as loopback, private (RFC1918), link-local (which covers the
 * 169.254.169.254 cloud metadata address), unique-local, carrier-grade NAT (RFC6598,
 * 100.64.0.0/10), multicast, or reserved is blocked — and so is anything it doesn't
 * recognize at all, since this allowlists "unicast" rather than blocklisting known-bad
 * ranges. ipaddr.process() also normalizes IPv4-mapped IPv6 addresses (::ffff:127.0.0.1)
 * back to IPv4 first, closing a classic SSRF-filter bypass.
 */
export function isPublicUnicastAddress(ip: string): boolean {
  if (TEST_ESCAPE_HATCH) return true;
  try {
    const addr = ipaddr.process(ip);
    return addr.range() === 'unicast';
  } catch {
    return false;
  }
}
