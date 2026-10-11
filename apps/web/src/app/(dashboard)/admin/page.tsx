'use client';

import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { BarChart } from '@/components/dash/bar-chart';
import { Card, CardHeader, ErrorBanner, Pill, Skeleton, Stat, Table } from '@/components/dash/ui';
import { useApi } from '@/lib/use-api';
import type { Overview } from '@/lib/api-types';
import { fmtBdtCompact, fmtMoney, fmtNumber, fmtPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function HealthChip({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-auth-surface2 px-2.5 py-1.25 text-[12.5px] text-auth-text2">
      <i className={cn('h-1.75 w-1.75 rounded-full', ok ? 'bg-auth-ok' : warn ? 'bg-auth-warn' : 'bg-auth-bad')} />
      {children}
    </span>
  );
}

function describeAudit(e: Overview['recentAudit'][number]): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  if (e.action === 'payment.approve') return `${m.reference ?? ''} +${fmtNumber(Number(m.credits ?? 0))} credits`;
  if (e.action === 'credits.manual_grant') return `+${fmtNumber(Number(m.amount ?? 0))} credits`;
  if (e.action === 'staff.invite') return `${m.email ?? ''} as ${m.role ?? ''}`;
  if (typeof m.label === 'string') return m.label;
  if (typeof m.reference === 'string') return m.reference;
  return e.targetType;
}

export default function PlatformOverviewPage() {
  const { data, error, loading, reload } = useApi<Overview>('/admin/overview');
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const warnings = data ? data.attention.length + (data.health.aamarpayConfigured ? 0 : 1) : 0;

  return (
    <>
      <DashboardTopbar
        title="Platform overview"
        subtitle={`${today}${data ? ` · ${warnings === 0 ? 'all systems healthy' : `${warnings} item${warnings === 1 ? '' : 's'} need attention`}` : ''}`}
        search={false}
        action={<Link href="/admin/users" className="rounded-md bg-auth-accent px-3.5 py-2 text-[13.5px] font-medium whitespace-nowrap text-white hover:bg-auth-accent2">Add credit to user</Link>}
      />

      {error && <ErrorBanner message="Could not load the overview." onRetry={() => void reload()} />}
      {loading && !data && (
        <div className="grid gap-4">
          <Skeleton className="h-8 w-2/3" />
          <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-72" />
        </div>
      )}

      {data && (
        <>
          <div className="mb-4.5 flex flex-wrap gap-2">
            <HealthChip ok>API online</HealthChip>
            <HealthChip ok={data.health.databaseMs < 200} warn>Postgres {data.health.databaseMs} ms</HealthChip>
            <HealthChip ok={data.health.redisMs < 200} warn>Redis {data.health.redisMs} ms</HealthChip>
            <HealthChip ok={data.health.aamarpayConfigured} warn>{data.health.aamarpayConfigured ? 'aamarPay configured' : 'aamarPay not configured'}</HealthChip>
            <HealthChip ok={data.health.smtpConfigured} warn>{data.health.smtpConfigured ? 'Email delivery on' : 'SMTP not configured'}</HealthChip>
          </div>

          <div className="mb-5.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Revenue · this month"
              value={fmtBdtCompact(data.kpis.revenueBdtMonth)}
              detail={data.kpis.revenueChange === null ? `${fmtNumber(data.kpis.paymentsMonth)} payments` : `${data.kpis.revenueChange >= 0 ? '+' : ''}${fmtPercent(data.kpis.revenueChange, 0)} vs last month`}
              detailTone={data.kpis.revenueChange !== null && data.kpis.revenueChange < 0 ? 'down' : 'up'}
            />
            <Stat
              label="URLs submitted · today"
              value={fmtNumber(data.kpis.urlsToday)}
              detail={data.kpis.urlsToday ? `${fmtPercent(data.kpis.indexedToday / data.kpis.urlsToday, 0)} indexed so far` : 'No submissions yet today'}
            />
            <Stat
              label="Active clients"
              value={fmtNumber(data.kpis.activeClients)}
              detail={`+${fmtNumber(data.kpis.newClientsWeek)} this week · ${fmtNumber(data.kpis.pendingApproval)} pending`}
              detailTone="up"
            />
            <Stat label="Payments · this month" value={fmtNumber(data.kpis.paymentsMonth)} detail={`${fmtMoney(data.kpis.revenueBdtMonth)} collected`} />
          </div>

          <div className="mb-5.5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title="Submissions and revenue · 30 days" />
              <div className="grid gap-6 p-4.5">
                <BarChart
                  title="URLs submitted per day"
                  data={data.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.urls }))}
                  format={(v) => fmtNumber(v)}
                  barClass="bg-auth-accent"
                  height={120}
                />
                <BarChart
                  title="Revenue per day (BDT)"
                  data={data.series.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.revenueBdt }))}
                  format={(v) => fmtMoney(v)}
                  barClass="bg-auth-fox"
                  height={90}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Needs attention" />
              {data.attention.length === 0 && data.health.aamarpayConfigured ? (
                <p className="px-4.5 py-6 text-center text-[13px] text-auth-text3">Nothing needs attention right now.</p>
              ) : (
                <div className="text-[13px]">
                  {!data.health.aamarpayConfigured && (
                    <div className="flex items-center gap-3 border-b border-auth-line px-4.5 py-2.5">
                      <div className="flex-1 text-auth-text2"><b className="font-medium text-auth-text">Online payments are off</b> — set AAMARPAY_STORE_ID and AAMARPAY_SIGNATURE_KEY</div>
                      <Pill tone="warn">Config</Pill>
                    </div>
                  )}
                  {data.attention.map((a) => (
                    <Link key={a.kind} href={a.href} className="flex items-center gap-3 border-b border-auth-line px-4.5 py-2.5 last:border-b-0 hover:bg-white/[0.015]">
                      <div className="flex-1 text-auth-text2"><b className="font-medium text-auth-text">{a.title}</b> {a.detail}</div>
                      <Pill tone={a.severity === 'bad' ? 'bad' : a.severity === 'warn' ? 'warn' : 'info'}>{a.severity === 'info' ? 'Assign' : 'Review'}</Pill>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Managers" right={<Link href="/admin/staff" className="text-[12.5px] text-auth-accent">All</Link>} />
              {data.managers.length === 0 ? (
                <p className="px-4.5 py-6 text-center text-[13px] text-auth-text3">No managers yet.</p>
              ) : (
                <Table head={['Manager', 'Clients', 'Payments to review', 'Status']}>
                  {data.managers.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="font-mono">{fmtNumber(m.clients)}</td>
                      <td className={cn('font-mono', m.pendingPayments > 0 && 'text-auth-warn')}>{fmtNumber(m.pendingPayments)}</td>
                      <td><Pill tone={m.status === 'active' ? 'ok' : 'bad'}>{m.status === 'active' ? 'Active' : 'Suspended'}</Pill></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card>
              <CardHeader title="Latest audit events" right={<Link href="/admin/audit" className="text-[12.5px] text-auth-accent">Audit log</Link>} />
              {data.recentAudit.length === 0 ? (
                <p className="px-4.5 py-6 text-center text-[13px] text-auth-text3">No events yet.</p>
              ) : (
                data.recentAudit.map((e) => (
                  <div key={e.id} className="grid grid-cols-[48px_1fr] items-center gap-3 border-t border-auth-line px-4.5 py-2.5 text-[13px] first:border-t-0">
                    <span className="font-mono text-xs text-auth-text3">{new Date(e.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    <div className="min-w-0 truncate text-auth-text2">
                      <b className="font-medium text-auth-text">{e.action}</b> {describeAudit(e)} <span className="text-xs text-auth-text3">by {e.actorName ?? 'system'}</span>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
