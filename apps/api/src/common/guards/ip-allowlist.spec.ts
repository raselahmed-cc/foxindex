import { describe, expect, it } from 'vitest';
import { ipAllowed } from './ip-allowlist';

describe('ipAllowed', () => {
  it('matches exact IPv4 and IPv4-mapped IPv6', () => {
    expect(ipAllowed('203.0.113.10', ['203.0.113.10'])).toBe(true);
    expect(ipAllowed('::ffff:203.0.113.10', ['203.0.113.10'])).toBe(true);
  });
  it('matches CIDR ranges', () => {
    expect(ipAllowed('198.51.100.77', ['198.51.100.0/24'])).toBe(true);
    expect(ipAllowed('198.51.101.1', ['198.51.100.0/24'])).toBe(false);
  });
  it('rejects garbage', () => {
    expect(ipAllowed('not-an-ip', ['0.0.0.0/0'])).toBe(false);
  });
});
