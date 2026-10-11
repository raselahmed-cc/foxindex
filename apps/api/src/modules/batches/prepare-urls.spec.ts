import { describe, expect, it } from 'vitest';
import { belongsToDomain, defaultBatchName, prepareUrls } from './prepare-urls';

describe('prepareUrls', () => {
  it('normalizes, adds https and removes duplicates', () => {
    const r = prepareUrls(['https://Example.com/a', 'example.com/a', 'https://example.com/b#x', '']);
    expect(r.urls.map((u) => u.normalizedUrl)).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(r.skipped.duplicate).toBe(1);
  });

  it('counts invalid lines', () => {
    const r = prepareUrls(['not a url', 'ftp://example.com/x', 'localhost/page']);
    expect(r.urls).toHaveLength(0);
    expect(r.skipped.invalid).toBe(3);
  });

  it('skips other domains when a site is chosen', () => {
    const r = prepareUrls(['https://a.com/1', 'https://www.a.com/2', 'https://blog.a.com/3', 'https://b.com/4'], 'a.com');
    expect(r.urls).toHaveLength(3);
    expect(r.skipped.otherDomain).toBe(1);
  });

  it('groups hosts', () => {
    expect(prepareUrls(['https://a.com/1', 'https://b.com/2', 'https://a.com/3']).hosts).toEqual(['a.com', 'b.com']);
  });
});

describe('belongsToDomain', () => {
  it('matches subdomains but not lookalikes', () => {
    expect(belongsToDomain('shop.a.com', 'a.com')).toBe(true);
    expect(belongsToDomain('nota.com', 'a.com')).toBe(false);
  });
});

describe('defaultBatchName', () => {
  it('names single-site and multi-site batches', () => {
    const d = new Date('2026-10-10T12:00:00Z');
    expect(defaultBatchName(['www.a.com'], d)).toBe('a.com · 10 Oct');
    expect(defaultBatchName(['a.com', 'b.com'], d)).toBe('2 sites · 10 Oct');
  });
});
