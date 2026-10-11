export type Currency = 'BDT' | 'USD';

export interface PricedPack {
  id: string;
  name: string;
  credits: number;
  priceBdt: string | null;
  priceUsd: string | null;
}

export interface Quote {
  credits: number;
  currency: Currency;
  packId: string | null;
  packName: string | null;
  rate: number;
  subtotal: number;
  feePercent: number;
  fee: number;
  total: number;
  nextTier: { credits: number; rate: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function packPrice(pack: PricedPack, currency: Currency): number | null {
  const raw = currency === 'BDT' ? pack.priceBdt : pack.priceUsd;
  return raw === null ? null : Number(raw);
}

/**
 * Custom amounts are priced at the per-credit rate of the largest pack whose
 * size the order reaches — buying 3,500 credits gets the 3,000-pack rate.
 * Orders below the smallest pack pay the smallest pack's rate.
 */
export function quote(
  input: { packId?: string; credits?: number; currency: Currency; feePercent: number },
  packs: PricedPack[],
): Quote | null {
  const priced = packs
    .map((p) => ({ pack: p, price: packPrice(p, input.currency) }))
    .filter((p): p is { pack: PricedPack; price: number } => p.price !== null && p.pack.credits > 0)
    .sort((a, b) => a.pack.credits - b.pack.credits);
  if (priced.length === 0) return null;

  let credits: number;
  let subtotal: number;
  let chosen: { pack: PricedPack; price: number } | undefined;

  if (input.packId) {
    chosen = priced.find((p) => p.pack.id === input.packId);
    if (!chosen) return null;
    credits = chosen.pack.credits;
    subtotal = chosen.price;
  } else {
    credits = input.credits ?? 0;
    const tier = [...priced].reverse().find((p) => p.pack.credits <= credits) ?? priced[0];
    subtotal = round2((credits * tier.price) / tier.pack.credits);
  }

  const rate = subtotal / credits;
  const next = priced.find((p) => p.pack.credits > credits && p.price / p.pack.credits < rate - 1e-9);
  const fee = round2((subtotal * input.feePercent) / 100);

  return {
    credits,
    currency: input.currency,
    packId: chosen?.pack.id ?? null,
    packName: chosen?.pack.name ?? null,
    rate: round2(rate * 100) / 100,
    subtotal,
    feePercent: input.feePercent,
    fee,
    total: round2(subtotal + fee),
    nextTier: next ? { credits: next.pack.credits, rate: round2((next.price / next.pack.credits) * 100) / 100 } : null,
  };
}
