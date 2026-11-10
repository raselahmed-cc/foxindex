import { describe, expect, it } from 'vitest';
import { buildGoogleAuthUrl, GOOGLE_CONNECT_SCOPES, pickOwnedProperty, propertyCovers } from './google-oauth';

describe('propertyCovers', () => {
  it('domain properties cover the domain and every subdomain, on any protocol', () => {
    expect(propertyCovers('sc-domain:example.com', 'https://example.com/a')).toBe(true);
    expect(propertyCovers('sc-domain:example.com', 'http://www.example.com/b')).toBe(true);
    expect(propertyCovers('sc-domain:example.com', 'https://shop.example.com/c')).toBe(true);
    expect(propertyCovers('sc-domain:example.com', 'https://notexample.com/')).toBe(false);
    expect(propertyCovers('sc-domain:example.com', 'https://example.com.evil.io/')).toBe(false);
  });

  it('URL-prefix properties cover only their prefix', () => {
    expect(propertyCovers('https://example.com/', 'https://example.com/blog/post')).toBe(true);
    expect(propertyCovers('https://example.com/', 'http://example.com/blog/post')).toBe(false);
    expect(propertyCovers('https://example.com/', 'https://www.example.com/')).toBe(false);
  });
});

describe('pickOwnedProperty', () => {
  it('uses only Owner properties, preferring the domain property', () => {
    const props = [
      { siteUrl: 'https://example.com/', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:other.com', permissionLevel: 'siteFullUser' },
    ];
    expect(pickOwnedProperty(props, 'https://example.com/x')?.siteUrl).toBe('sc-domain:example.com');
    expect(pickOwnedProperty(props, 'https://other.com/x')).toBeNull();
  });
});

describe('buildGoogleAuthUrl', () => {
  it('asks for offline access with exactly the scopes FoxIndex needs', () => {
    const url = new URL(buildGoogleAuthUrl({ clientId: 'cid', redirectUri: 'https://foxindex.net/api/v1/google/oauth/callback' }, 'state123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_CONNECT_SCOPES);
  });
});
