import { describe, expect, it } from 'vitest';
import { quote, type PricedPack } from './pricing';

const packs: PricedPack[] = [
  { id: 'starter', name: 'Starter', credits: 500, priceBdt: '990.00', priceUsd: '8.50' },
  { id: 'agency', name: 'Agency', credits: 3000, priceBdt: '4290.00', priceUsd: '36.00' },
  { id: 'api', name: 'API', credits: 10000, priceBdt: '10900.00', priceUsd: '92.00' },
];

describe('quote', () => {
  it('prices a pack at its exact price', () => {
    const q = quote({ packId: 'agency', currency: 'BDT', feePercent: 0 }, packs)!;
    expect(q.total).toBe(4290);
    expect(q.credits).toBe(3000);
  });
  it('prices a custom amount at the largest reached tier', () => {
    const q = quote({ credits: 3500, currency: 'BDT', feePercent: 0 }, packs)!;
    expect(q.subtotal).toBe(5005);
    expect(q.nextTier?.credits).toBe(10000);
  });
  it('uses the smallest pack rate below the first tier', () => {
    const q = quote({ credits: 100, currency: 'BDT', feePercent: 0 }, packs)!;
    expect(q.subtotal).toBe(198);
  });
  it('adds the method fee on top', () => {
    const q = quote({ packId: 'starter', currency: 'BDT', feePercent: 2.5 }, packs)!;
    expect(q.fee).toBe(24.75);
    expect(q.total).toBe(1014.75);
  });
  it('returns null for an unknown pack', () => {
    expect(quote({ packId: 'nope', currency: 'BDT', feePercent: 0 }, packs)).toBeNull();
  });
});
