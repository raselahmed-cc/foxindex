'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { BarChart } from '@/components/dash/bar-chart';
import { Card, CardHeader, EmptyState, ErrorBanner, Pill, Segmented, Skeleton, Stat, Table } from '@/components/dash/ui';
import { Stars } from '@/components/tickets/parts';
import { useUser } from '@/lib/user-context';
import { useApi } from '@/lib/use-api';
import { fmtNumber } from '@/lib/format';
import { PRIORITY, cap, shortDuration, type TicketPriority } from '@/lib/tickets';

interface Report {
  days: number;
  timezone: string;
  totals: {
    created: number;
    resolved: number;
    backlog: number;
    unassigned: number;
    breachedNow: number;
    medianFirstResponseMinutes: number | null;
    medianResolutionMinutes: number | null;
    firstResponseSlaPercent: number | null;
    resolutionSlaPercent: number | null;
    csatAverage: number | null;
    csatResponses: number;
    csatPositivePercent: number | null;
  };
  series: { day: string; created: number; resolved: number }[];
  categories: { category: string; count: number }[];
  priorities: { priority: string; count: number; breached: number }[];
  csatDistribution: { rating: number; count: number }[];
  tags: { tag: string; count: number }[];
  agents: {
    id: string;
    name: string;
    availability: string;
    open: number;
    resolved: number;
    medianFirstResponseMinutes: number | null;
    breaches: number;
    csatAverage: number | null;
    csatResponses: number;
  }[];
}

const mins = (m: number | null) => (m === null ? '—' : shortDuration(m * 60_000));
const pct = (p: number | null) => (p === null ? '—' : `${p}%`);
const slaTone = (p: number | null): 'up' | 'down' | 'warn' | undefined => (p === null ? undefined : p >= 95 ? 'up' : p >= 85 ? 'warn' : 'down');
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** One horizontal bar per row — a single series, so one hue, value labelled in text ink. */
function HBars({ rows, label }: { rows: { key: string; label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="grid gap-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-auth-text2">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-r-[4px] bg-auth-surface2">
            <span className="block h-full rounded-r-[4px] bg-auth-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono text-auth-text">{fmtNumber(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TicketReportsPage() {
  const me = useUser();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const report = useApi<Report>(me.role === 'client' ? null : `/support/reports?days=${days}`);

  if (me.role === 'client') return <EmptyState title="Not available">Support reports are for the FoxIndex team.</EmptyState>;
  const r = report.data;
  const t = r?.totals;

  return (
    <>
      <DashboardTopbar
        crumb={<Link href="/tickets" className="hover:text-auth-text2">Tickets</Link>}
        title="Support reports"
        subtitle={me.role === 'manager' ? 'Your clients and assigned tickets' : `All teams · days in ${r?.timezone ?? 'support time'}`}
        search={false}
        action={<Segmented value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}
      />

      {report.error ? (
        <ErrorBanner message="Could not load reports." onRetry={() => void report.reload()} />
      ) : !r || !t ? (
        <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="First-reply SLA met" value={pct(t.firstResponseSlaPercent)} detail={`Median first reply ${mins(t.medianFirstResponseMinutes)}`} detailTone={slaTone(t.firstResponseSlaPercent)} />
            <Stat label="Resolution SLA met" value={pct(t.resolutionSlaPercent)} detail={`Median time to resolve ${mins(t.medianResolutionMinutes)}`} detailTone={slaTone(t.resolutionSlaPercent)} />
            <Stat
              label="Customer satisfaction"
              value={t.csatAverage === null ? '—' : `${t.csatAverage}/5`}
              detail={t.csatResponses ? `${pct(t.csatPositivePercent)} rated 4–5 · ${fmtNumber(t.csatResponses)} ratings` : 'No ratings yet'}
              detailTone={t.csatPositivePercent === null ? undefined : t.csatPositivePercent >= 80 ? 'up' : t.csatPositivePercent >= 60 ? 'warn' : 'down'}
            />
            <Stat
              label="Open backlog"
              value={fmtNumber(t.backlog)}
              detail={`${fmtNumber(t.breachedNow)} breached now${t.unassigned ? ` · ${fmtNumber(t.unassigned)} unassigned` : ''}`}
              detailTone={t.breachedNow ? 'down' : undefined}
              right={t.breachedNow ? <Link href="/tickets" className="text-auth-accent">Triage</Link> : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-4.5">
              <BarChart title={`Tickets opened · ${fmtNumber(t.created)}`} data={r.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.created }))} format={(v) => fmtNumber(v)} />
            </Card>
            <Card className="p-4.5">
              <BarChart title={`Tickets resolved · ${fmtNumber(t.resolved)}`} data={r.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.resolved }))} format={(v) => fmtNumber(v)} barClass="bg-auth-ok" />
            </Card>
          </div>

          <Card>
            <CardHeader title="Team performance" subtitle={`Last ${r.days} days · open is current`} />
            {r.agents.length === 0 ? (
              <p className="px-4.5 pb-4.5 text-[13px] text-auth-text3">No assigned tickets in this period.</p>
            ) : (
              <Table head={['Agent', 'Open now', 'Resolved', 'Median first reply', 'SLA breaches', 'Satisfaction']}>
                {r.agents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <b className="font-medium">{a.name}</b>
                        {a.availability === 'away' && <Pill tone="muted">Away</Pill>}
                      </span>
                    </td>
                    <td className="font-mono">{fmtNumber(a.open)}</td>
                    <td className="font-mono">{fmtNumber(a.resolved)}</td>
                    <td className="font-mono">{mins(a.medianFirstResponseMinutes)}</td>
                    <td className={a.breaches ? 'font-mono text-auth-bad' : 'font-mono'}>{fmtNumber(a.breaches)}</td>
                    <td>{a.csatAverage === null ? <span className="text-auth-text3">—</span> : <span className="inline-flex items-center gap-1.5"><Stars value={Math.round(a.csatAverage)} size="sm" /><span className="font-mono text-[12.5px]">{a.csatAverage}</span><span className="text-[11.5px] text-auth-text3">({a.csatResponses})</span></span>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="By category" subtitle="Tickets opened" />
              <div className="px-4.5 pb-4.5">
                {r.categories.length ? <HBars label="Tickets by category" rows={r.categories.map((c) => ({ key: c.category, label: cap(c.category), value: c.count }))} /> : <p className="text-[13px] text-auth-text3">No tickets yet.</p>}
              </div>
            </Card>
            <Card>
              <CardHeader title="By priority" subtitle="Opened · with an SLA breach" />
              <div className="px-4.5 pb-4.5">
                {r.priorities.length ? (
                  <Table head={['Priority', 'Opened', 'Breached']}>
                    {(['urgent', 'high', 'normal', 'low'] as TicketPriority[])
                      .map((p) => r.priorities.find((x) => x.priority === p))
                      .filter((x): x is Report['priorities'][number] => Boolean(x))
                      .map((p) => (
                        <tr key={p.priority}>
                          <td className={PRIORITY[p.priority as TicketPriority]?.className}>{PRIORITY[p.priority as TicketPriority]?.label ?? p.priority}</td>
                          <td className="font-mono">{fmtNumber(p.count)}</td>
                          <td className={p.breached ? 'font-mono text-auth-bad' : 'font-mono'}>{fmtNumber(p.breached)}</td>
                        </tr>
                      ))}
                  </Table>
                ) : (
                  <p className="text-[13px] text-auth-text3">No tickets yet.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Satisfaction ratings" subtitle={`${fmtNumber(t.csatResponses)} responses`} />
              <div className="px-4.5 pb-4.5">
                <HBars label="Ratings distribution" rows={[...r.csatDistribution].reverse().map((d) => ({ key: String(d.rating), label: `${d.rating} star${d.rating > 1 ? 's' : ''}`, value: d.count }))} />
              </div>
            </Card>
          </div>

          {r.tags.length > 0 && (
            <Card>
              <CardHeader title="Top tags" subtitle="On tickets opened in this period" />
              <div className="flex flex-wrap gap-2 px-4.5 pb-4.5">
                {r.tags.map((x) => (
                  <Link key={x.tag} href="/tickets" className="rounded-md border border-auth-line px-2.5 py-1 text-[12.5px] hover:border-auth-line2">
                    {x.tag} <span className="font-mono text-auth-text3">{fmtNumber(x.count)}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
