import { describe, expect, it } from 'vitest';
import { InvalidUrlError, normalizeHostname, normalizeUrl } from './url-normalization';

describe('normalizeUrl', () => {
  it('lowercases the hostname', () => {
    expect(normalizeUrl('https://Example.COM/page').normalizedUrl).toBe(
      'https://example.com/page',
    );
  });

  it('strips default ports', () => {
    expect(normalizeUrl('https://example.com:443/page').normalizedUrl).toBe(
      'https://example.com/page',
    );
    expect(normalizeUrl('http://example.com:80/page').normalizedUrl).toBe(
      'http://example.com/page',
    );
  });

  it('keeps non-default ports', () => {
    expect(normalizeUrl('https://example.com:8443/page').normalizedUrl).toBe(
      'https://example.com:8443/page',
    );
  });

  it('strips the fragment', () => {
    expect(normalizeUrl('https://example.com/page#section-2').normalizedUrl).toBe(
      'https://example.com/page',
    );
  });

  it('strips embedded credentials', () => {
    expect(normalizeUrl('https://user:pass@example.com/page').normalizedUrl).toBe(
      'https://example.com/page',
    );
  });

  it('punycode-encodes internationalized hostnames', () => {
    expect(normalizeUrl('https://münchen.de/').normalizedUrl).toBe('https://xn--mnchen-3ya.de/');
  });

  it('sorts query params by key then value', () => {
    expect(normalizeUrl('https://example.com/page?b=2&a=2&a=1').normalizedUrl).toBe(
      'https://example.com/page?a=1&a=2&b=2',
    );
  });

  it('represents an empty path as "/"', () => {
    expect(normalizeUrl('https://example.com').normalizedUrl).toBe('https://example.com/');
  });

  it('does NOT collapse a trailing slash on a non-root path', () => {
    expect(normalizeUrl('https://example.com/page/').normalizedUrl).toBe(
      'https://example.com/page/',
    );
    expect(normalizeUrl('https://example.com/page').normalizedUrl).toBe(
      'https://example.com/page',
    );
  });

  it('hashes two differently-formatted equivalent URLs identically', () => {
    const a = normalizeUrl('HTTPS://Example.com:443/page?b=2&a=1#top');
    const b = normalizeUrl('https://example.com/page?a=1&b=2');
    expect(a.normalizedUrl).toBe(b.normalizedUrl);
    expect(a.normalizedUrlHash).toBe(b.normalizedUrlHash);
  });

  it('hashes two genuinely different URLs differently', () => {
    const a = normalizeUrl('https://example.com/page-a');
    const b = normalizeUrl('https://example.com/page-b');
    expect(a.normalizedUrlHash).not.toBe(b.normalizedUrlHash);
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => normalizeUrl('ftp://example.com/file')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(InvalidUrlError);
    expect(() => normalizeUrl('file:///etc/passwd')).toThrow(InvalidUrlError);
  });

  it('rejects unparseable input', () => {
    expect(() => normalizeUrl('not a url')).toThrow(InvalidUrlError);
  });
});

describe('normalizeHostname', () => {
  it('lowercases and strips a trailing dot', () => {
    expect(normalizeHostname('Example.COM.')).toBe('example.com');
  });

  it('punycode-encodes an internationalized hostname', () => {
    expect(normalizeHostname('münchen.de')).toBe('xn--mnchen-3ya.de');
  });

  it('rejects a value containing a path', () => {
    expect(() => normalizeHostname('example.com/page')).toThrow(InvalidUrlError);
  });

  it('rejects a value containing credentials', () => {
    expect(() => normalizeHostname('user:pass@example.com')).toThrow(InvalidUrlError);
  });
});
