export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

export function fmtMoney(amount: number, currency: string = 'BDT'): string {
  const symbol = currency === 'BDT' ? '৳' : currency === 'USD' ? '$' : `${currency} `;
  const digits = currency === 'BDT' && Number.isInteger(amount) ? 0 : 2;
  return `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
}

/** Compact BDT for KPI tiles: ৳ 2.84L (lakh) / ৳ 1.2Cr (crore). */
export function fmtBdtCompact(amount: number): string {
  if (amount >= 1e7) return `৳ ${(amount / 1e7).toFixed(2)}Cr`;
  if (amount >= 1e5) return `৳ ${(amount / 1e5).toFixed(2)}L`;
  return fmtMoney(Math.round(amount));
}

export function fmtPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

const DAY = 86_400_000;

export function relativeTime(iso: string | Date | null | undefined): string {
  if (!iso) return 'Never';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2 * DAY) return 'Yesterday';
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Today 14:52" / "Yesterday 09:10" / "10 Sep 16:04". */
export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getTime() - DAY);
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
