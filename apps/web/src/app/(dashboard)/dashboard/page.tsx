'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';
import { useAccount } from '@/lib/account-context';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { BarChart } from '@/components/dash/bar-chart';
import { Button, Card, CardHeader, ErrorBanner, Pill, Skeleton, Stat } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtNumber, relativeTime } from '@/lib/format';
import { URL_STATUS, splitUrl, type SiteRow, type TrackedUrl, type UrlCounts } from '@/lib/tracking';

interface Overview {
  balance: number;
  counts: UrlCounts;
  refundedCredits30d: number;
  series: { day: string; submitted: number; accepted: number }[];
  engines: { engine: string; total: number; ok: number; failed: number; pending: number }[];
  sites: SiteRow[];
  recentUrls: TrackedUrl[];
  recentBatches: { id: string; name: string; urlCount: number; status: string; createdAt: string; counts: { queued: number; submitted: number; indexed: number; failed: number } }[];
}

const ENGINE_NAME: Record<string, string> = { google: 'Google', indexnow: 'Bing, Yandex & others' };
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** One-URL quick submit straight from the home page. */
function QuickSubmit({ onDone, googleEnabled }: { onDone: () => void; googleEnabled: boolean }) {
  const toast = useToast();
  const { refreshCredits } = useAccount();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await apiClient.post('/urls', { urls: [url.trim()], engines: googleEnabled ? ['google', 'indexnow'] : ['indexnow'] });
      toast('Submitted — we’ll keep you posted on its status');
      setUrl('');
      void refreshCredits();
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="flex flex-wrap items-center gap-3.5 rounded-lg bg-[linear-gradient(90deg,rgba(107,140,255,.08),transparent_60%)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="quick-url" className="sr-only">URL to submit</label>
      <input
        id="quick-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a URL to submit it now — https://…"
        className="min-w-0 flex-1 rounded-md border border-auth-line bg-auth-bg px-3 py-2 font-mono text-[13px] text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft"
      />
      <span className="hidden text-[12.5px] whitespace-nowrap text-auth-text3 sm:inline">{googleEnabled ? '1 credit · Google + 5 engines' : 'Free · Bing, Yandex + 3 engines'}</span>
      <Button type="submit" variant="primary" loading={busy} disabled={!url.trim()}>Submit</Button>
    </form>
  );
}

export default function DashboardOverviewPage() {
  const user = useUser();
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const data = useApi<Overview>('/overview');
  const googleSetup = useApi<{ enabled: boolean }>('/sites/google-setup');
  const o = data.data;
  const accepted = o ? o.counts.submitted + o.counts.indexed : 0;

  return (
    <>
      <DashboardTopbar
        title={`${greeting()}, ${firstName}`}
        subtitle={today}
        action={<Link href="/submit" className="rounded-md bg-auth-accent px-3.5 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-auth-accent2">Submit URLs</Link>}
      />
      <div className="flex flex-col gap-5.5">
        <QuickSubmit onDone={() => void data.reload()} googleEnabled={googleSetup.data?.enabled ?? false} />

        {data.error ? (
          <ErrorBanner message="Could not load your overview." onRetry={() => void data.reload()} />
        ) : !o ? (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="URLs tracked" value={fmtNumber(o.counts.all)} detail={`${fmtNumber(o.sites.length)} site${o.sites.length === 1 ? '' : 's'}`} />
              <Stat
                label="Accepted by engines"
                value={fmtNumber(accepted)}
                detail={o.counts.all ? `${Math.round((accepted / o.counts.all) * 100)}% of submitted URLs` : 'Nothing submitted yet'}
                detailTone={o.counts.all && accepted / o.counts.all >= 0.9 ? 'up' : undefined}
              />
              <Stat label="Queued" value={fmtNumber(o.counts.queued)} detail={o.counts.queued ? 'Being sent now' : 'Nothing waiting'} />
              <Stat
                label="Failed · refunded"
                value={fmtNumber(o.counts.failed)}
                detail={o.refundedCredits30d ? `${fmtNumber(o.refundedCredits30d)} credits refunded (30 days)` : 'Failed Google submissions are refunded'}
                detailTone={o.counts.failed ? 'down' : undefined}
                right={o.counts.failed ? <Link href="/urls" className="text-auth-accent">Review</Link> : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
              <Card className="p-4.5">
                <BarChart title="URLs submitted per day" data={o.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.submitted }))} format={(v) => fmtNumber(v)} highlightLast="bg-auth-fox" />
              </Card>
              <Card>
                <CardHeader title="Accepted by engine" subtitle="Last 30 days" />
                <div className="flex flex-col gap-3.5 px-4.5 pb-4.5">
                  {o.engines.length === 0 ? (
                    <p className="text-[13px] text-auth-text3">No submissions in the last 30 days.</p>
                  ) : (
                    o.engines.map((e) => {
                      const done = e.ok + e.failed;
                      const pct = done ? Math.round((e.ok / done) * 100) : null;
                      return (
                        <div key={e.engine} className="grid grid-cols-[minmax(0,1fr)_120px_44px] items-center gap-3 text-sm">
                          <span className="truncate">{ENGINE_NAME[e.engine] ?? e.engine}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-auth-surface2">
                            <span className="block h-full rounded-full bg-auth-ok" style={{ width: `${pct ?? 0}%` }} />
                          </div>
                          <span className="text-right font-mono text-[12.5px] text-auth-text2">{pct === null ? '—' : `${pct}%`}</span>
                        </div>
                      );
                    })
                  )}
                  <p className="text-xs text-auth-text3">Share of finished submissions each engine accepted. Google needs FoxIndex added as an owner in Search Console — <Link href="/sites" className="text-auth-accent">see Sites</Link>.</p>
                </div>
              </Card>
            </div>

            {o.sites.length > 0 && (
              <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
                {o.sites.map((site) => (
                  <Link key={site.id} href={`/urls?site=${site.id}`} className="flex flex-col gap-2.5 rounded-[10px] border border-auth-line bg-auth-surface p-4.5 hover:border-auth-line2">
                    <b className="truncate font-mono text-[13px] font-medium">{site.domain}</b>
                    <div className="flex gap-4 text-[12.5px] text-auth-text3">
                      <span><b className="font-mono font-medium text-auth-text">{fmtNumber(site.counts.submitted + site.counts.indexed)}</b> accepted</span>
                      <span><b className="font-mono font-medium text-auth-text">{fmtNumber(site.counts.queued)}</b> queued</span>
                      <span><b className="font-mono font-medium text-auth-text">{fmtNumber(site.counts.failed)}</b> failed</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <Card>
              <CardHeader title="Recent URLs" right={<Link href="/urls" className="rounded-md border border-auth-line2 px-2.5 py-1 text-[12.5px] hover:bg-auth-surface2">View all</Link>} />
              {o.recentUrls.length === 0 ? (
                <p className="px-4.5 pb-4.5 text-[13px] text-auth-text3">Nothing yet — paste a URL above or <Link href="/submit" className="text-auth-accent">submit a batch</Link>.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13.5px]">
                    <thead>
                      <tr>{['URL', 'Status', 'Last activity'].map((h) => <th key={h} className="border-b border-auth-line px-4.5 py-2.5 text-left text-xs font-medium text-auth-text3">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {o.recentUrls.map((r) => {
                        const { host, rest } = splitUrl(r.url);
                        return (
                          <tr key={r.id} className="hover:bg-white/[0.015]">
                            <td className="max-w-115 overflow-hidden border-b border-auth-line px-4.5 py-2.5 font-mono text-[12.5px] text-ellipsis whitespace-nowrap"><span className="text-auth-text3">{host}</span>{rest}</td>
                            <td className="border-b border-auth-line px-4.5 py-2.5"><Pill tone={URL_STATUS[r.status].tone}>{URL_STATUS[r.status].label}</Pill></td>
                            <td className="border-b border-auth-line px-4.5 py-2.5 whitespace-nowrap text-auth-text3">{relativeTime(r.lastActivityAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
