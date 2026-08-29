import { describe, expect, it } from 'vitest';
import { generateIndexNowKey, indexNowKeyFileUrl } from './generate-key';

describe('generateIndexNowKey', () => {
  it('generates a 32-char lowercase hex string', () => {
    const key = generateIndexNowKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates distinct keys across calls', () => {
    const a = generateIndexNowKey();
    const b = generateIndexNowKey();
    expect(a).not.toBe(b);
  });
});

describe('indexNowKeyFileUrl', () => {
  it('builds the expected key-file URL', () => {
    expect(indexNowKeyFileUrl('example.com', 'abc123')).toBe('https://example.com/abc123.txt');
  });
});
