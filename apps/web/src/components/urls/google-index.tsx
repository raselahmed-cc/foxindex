'use client';

import { Pill, type Tone } from '@/components/dash/ui';
import { fmtDateTime, relativeTime } from '@/lib/format';
import type { GoogleIndex } from '@/lib/tracking';

const LABEL: Record<string, { tone: Tone; label: string }> = {
  indexed: { tone: 'ok', label: 'Indexed' },
  crawled_not_indexed: { tone: 'warn', label: 'Crawled, not indexed' },
  not_indexed: { tone: 'warn', label: 'Not indexed' },
  unknown: { tone: 'muted', label: 'Can’t check' },
};

function nextCheckText(g: GoogleIndex): string {
  if (!g.nextCheckAt) return 'Not checked';
  const ms = new Date(g.nextCheckAt).getTime() - Date.now();
  if (ms <= 2 * 60_000) return 'Checking now…';
  const h = Math.round(ms / 3_600_000);
  return h < 1 ? 'Check within the hour' : h < 48 ? `Check in ~${h} h` : `Check in ~${Math.round(h / 24)} days`;
}

/** Compact "On Google" cell: Google's verdict, or when the next check happens. */
export function GoogleIndexBadge({ google }: { google: GoogleIndex }) {
  const s = google.status ? LABEL[google.status] : null;
  if (!s) return <span className="text-xs text-auth-text3">{nextCheckText(google)}</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Pill tone={s.tone}>{s.label}</Pill>
      {google.status === 'indexed' && google.lastCrawledAt && <span className="text-[11px] text-auth-text3">crawled {relativeTime(google.lastCrawledAt)}</span>}
      {google.status !== 'indexed' && google.status !== 'unknown' && google.nextCheckAt && <span className="text-[11px] text-auth-text3">{nextCheckText(google)}</span>}
    </span>
  );
}

/** Full detail for the URL drawer. */
export function GoogleIndexDetail({ google, checking, onCheck }: { google: GoogleIndex; checking: boolean; onCheck: () => void }) {
  const s = google.status ? LABEL[google.status] : null;
  return (
    <div className="rounded-md border border-auth-line px-3 py-2.5 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <b className="font-medium">Google index</b>
        {s ? <Pill tone={s.tone}>{s.label}</Pill> : <span className="text-xs text-auth-text3">{nextCheckText(google)}</span>}
      </div>
      {google.coverage && <p className="mt-1 text-xs text-auth-text2">Google says: “{google.coverage}”</p>}
      {google.note && <p className="mt-1 text-xs text-auth-warn">{google.note}</p>}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-auth-text3">
        {google.lastCrawledAt && (<><dt>Last crawled</dt><dd>{fmtDateTime(google.lastCrawledAt)}</dd></>)}
        {google.checkedAt && (<><dt>Last checked</dt><dd>{fmtDateTime(google.checkedAt)}</dd></>)}
        {google.nextCheckAt && (<><dt>Next check</dt><dd>{fmtDateTime(google.nextCheckAt)}</dd></>)}
      </dl>
      <button type="button" disabled={checking} onClick={onCheck} className="mt-2 text-xs font-medium text-auth-accent disabled:opacity-60">
        {checking ? 'Asking Google…' : 'Check now · free'}
      </button>
    </div>
  );
}
