import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isPublicUnicastAddress', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SSRF_FETCH_ALLOW_PRIVATE;
  });

  it('blocks loopback (127.0.0.1, ::1)', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('127.0.0.1')).toBe(false);
    expect(isPublicUnicastAddress('::1')).toBe(false);
  });

  it('blocks the cloud metadata address (169.254.169.254, link-local)', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('169.254.169.254')).toBe(false);
  });

  it('blocks RFC1918 private ranges', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('10.0.0.5')).toBe(false);
    expect(isPublicUnicastAddress('172.16.0.5')).toBe(false);
    expect(isPublicUnicastAddress('192.168.1.5')).toBe(false);
  });

  it('blocks carrier-grade NAT (100.64.0.0/10)', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('100.64.0.1')).toBe(false);
  });

  it('blocks IPv6 unique-local (fc00::/7)', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('fc00::1')).toBe(false);
  });

  it('blocks an IPv4-mapped-IPv6 loopback address (classic filter bypass)', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('::ffff:127.0.0.1')).toBe(false);
  });

  it('allows a genuinely public address', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('8.8.8.8')).toBe(true);
  });

  it('rejects unparseable input', async () => {
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('not-an-ip')).toBe(false);
  });

  it('SSRF_FETCH_ALLOW_PRIVATE, set before module load, bypasses the check', async () => {
    process.env.SSRF_FETCH_ALLOW_PRIVATE = 'true';
    const { isPublicUnicastAddress } = await import('./ip-blocklist');
    expect(isPublicUnicastAddress('127.0.0.1')).toBe(true);
  });

  afterEach(() => {
    delete process.env.SSRF_FETCH_ALLOW_PRIVATE;
  });
});
