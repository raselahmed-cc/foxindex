'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, Checkbox, Drawer, EmptyState, ErrorBanner, Input, Modal, Pill, Select, Skeleton } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { useAccount } from '@/lib/account-context';
import { fmtDateTime, fmtNumber, relativeTime } from '@/lib/format';
import { ENGINE_LABEL, ENGINE_STATUS_LABEL, URL_STATUS, engineTone, splitUrl, type EngineKey, type SiteRow, type TrackedUrl, type UrlDetail, type UrlPage, type UrlStatus } from '@/lib/tracking';
import { cn } from '@/lib/utils';

const PAGE = 50;
const TONE_BOX: Record<string, string> = {
  ok: 'bg-auth-ok-soft text-auth-ok',
  info: 'bg-auth-accent-soft text-auth-accent',
  warn: 'bg-auth-warn-soft text-auth-warn',
  bad: 'bg-auth-bad-soft text-auth-bad',
  muted: 'bg-auth-surface2 text-auth-text3',
};

function EngineBadges({ url }: { url: TrackedUrl }) {
  return (
    <span className="inline-flex gap-1">
      {(Object.keys(ENGINE_LABEL) as EngineKey[]).map((k) => {
        const e = url.engines[k];
        return (
          <i
            key={k}
            title={`${ENGINE_LABEL[k].name}: ${e ? ENGINE_STATUS_LABEL[e.status] ?? e.status : 'not sent'}`}
            className={cn('flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[10.5px] font-semibold not-italic', TONE_BOX[engineTone(e?.status)])}
          >
            {ENGINE_LABEL[k].short}
          </i>
        );
      })}
    </span>
  );
}

function UrlDrawer({ id, onClose, onResubmit }: { id: string | null; onClose: () => void; onResubmit: (ids: string[]) => void }) {
  const detail = useApi<UrlDetail>(id ? `/urls/${id}` : null);
  const d = detail.data;
  return (
    <Drawer open={id !== null} onClose={onClose} title="URL details" subtitle={d ? d.site.domain : undefined} footer={d ? <><a href={d.url} target="_blank" rel="noreferrer" className="text-[13px] text-auth-accent">Open page ↗</a><Button variant="primary" onClick={() => onResubmit([d.id])}>Resubmit</Button></> : undefined}>
      {detail.error ? (
        <ErrorBanner message="Could not load this URL." onRetry={() => void detail.reload()} />
      ) : !d ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-5">
          <div>
            <p className="font-mono text-[12.5px] break-all">{d.url}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-auth-text3">
              <Pill tone={URL_STATUS[d.status].tone}>{URL_STATUS[d.status].label}</Pill>
              First submitted {fmtDateTime(d.createdAt)}
            </div>
          </div>
          <section>
            <h4 className="mb-2 text-xs font-medium text-auth-text3">Engines</h4>
            <div className="grid gap-2">
              {(Object.keys(ENGINE_LABEL) as EngineKey[]).map((k) => {
                const e = d.engines[k];
                return (
                  <div key={k} className="rounded-md border border-auth-line px-3 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <b className="font-medium">{ENGINE_LABEL[k].name}</b>
                      {e ? <Pill tone={engineTone(e.status)}>{ENGINE_STATUS_LABEL[e.status] ?? e.status}</Pill> : <span className="text-xs text-auth-text3">Not sent</span>}
                    </div>
                    {e && (
                      <p className="mt-1 text-xs text-auth-text3">
                        {e.submittedAt ? `Accepted ${fmtDateTime(e.submittedAt)}` : `Updated ${relativeTime(e.updatedAt)}`} · {e.attempts} {e.attempts === 1 ? 'try' : 'tries'}
                      </p>
                    )}
                    {e?.error && <p className="mt-1 text-xs text-auth-bad">{e.error}</p>}
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <h4 className="mb-2 text-xs font-medium text-auth-text3">History</h4>
            <ol className="grid gap-2">
              {d.history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 border-b border-auth-line pb-2 text-[12.5px] last:border-b-0">
                  <span className="min-w-0">
                    <b className="font-medium">{h.engine === 'google' ? 'Google' : 'IndexNow'}</b> · {ENGINE_STATUS_LABEL[h.status] ?? h.status}
                    {h.batch && <span className="block truncate text-auth-text3">{h.batch.name}</span>}
                    {h.error && <span className="block text-auth-bad">{h.error}</span>}
                  </span>
                  <span className="flex-shrink-0 text-right text-auth-text3">
                    {fmtDateTime(h.createdAt)}
                    {h.creditCost > 0 && <span className="block">{h.creditCost} credit{h.creditCost === 1 ? '' : 's'}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Drawer>
  );
}

function ResubmitModal({ ids, onClose, onDone }: { ids: string[] | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { credits, refreshCredits } = useAccount();
  const [google, setGoogle] = useState(true);
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const n = ids?.length ?? 0;
  async function submit() {
    if (!ids) return;
    setBusy(true);
    try {
      const r = await apiClient.post<{ batch: { urlCount: number; creditsCharged: number } }>('/urls/resubmit', { ids, engines: { google, others } });
      toast(`Resubmitted ${fmtNumber(r.batch.urlCount)} URL${r.batch.urlCount === 1 ? '' : 's'}${r.batch.creditsCharged ? ` · ${fmtNumber(r.batch.creditsCharged)} credits` : ''}`);
      void refreshCredits();
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={ids !== null}
      onClose={onClose}
      title={`Resubmit ${fmtNumber(n)} URL${n === 1 ? '' : 's'}`}
      width={440}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!google && !others} onClick={() => void submit()}>Resubmit{google ? ` · about ${fmtNumber(n)} credits` : ' · free'}</Button></>}
    >
      <p className="mb-3 text-[13px] text-auth-text2">A new batch is created. Google costs 1 credit per URL; Bing, Yandex and the other IndexNow engines are free. Already-indexed URLs are skipped.</p>
      <div className="grid gap-2">
        <Checkbox checked={google} onChange={setGoogle}>Google</Checkbox>
        <Checkbox checked={others} onChange={setOthers}>Bing, Yandex, Naver, Seznam &amp; Yep</Checkbox>
      </div>
      {credits && <p className="mt-3 text-xs text-auth-text3">Balance: {fmtNumber(credits.balance)} credits</p>}
    </Modal>
  );
}

function toCsv(rows: TrackedUrl[]): string {
  const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const head = ['URL', 'Site', 'Status', 'Google', 'IndexNow', 'Last activity', 'Last error'];
  const lines = rows.map((r) =>
    [r.url, r.site.domain, URL_STATUS[r.status].label, r.engines.google?.status ?? '', r.engines.indexnow?.status ?? '', r.lastActivityAt, r.engines.google?.error ?? r.engines.indexnow?.error ?? ''].map((v) => cell(String(v))).join(','),
  );
  return [head.map(cell).join(','), ...lines].join('\r\n');
}

function UrlsInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<UrlStatus | 'all'>('all');
  const [siteId, setSiteId] = useState(params.get('site') ?? '');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [resubmitIds, setResubmitIds] = useState<string[] | null>(null);
  const sites = useApi<SiteRow[]>('/sites');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    setOffset(0);
    setSelected(new Set());
  }, [status, siteId, debounced]);

  const path = useMemo(() => {
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (status !== 'all') qs.set('status', status);
    if (siteId) qs.set('siteId', siteId);
    if (debounced) qs.set('q', debounced);
    return `/urls?${qs.toString()}`;
  }, [status, siteId, debounced, offset]);
  const page = useApi<UrlPage>(path);
  const rows = useMemo(() => page.data?.items ?? [], [page.data]);
  const counts = page.data?.counts;

  // Keep queued rows fresh while the worker is sending them.
  const { reload } = page;
  useEffect(() => {
    if (!rows.some((r) => r.status === 'queued')) return;
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [rows, reload]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const blob = new Blob([String.fromCharCode(0xfeff) + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `urls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const FILTERS: { id: UrlStatus | 'all'; label: string; dot?: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'indexed', label: 'Indexed', dot: 'bg-auth-ok' },
    { id: 'submitted', label: 'Submitted', dot: 'bg-auth-accent' },
    { id: 'queued', label: 'Queued', dot: 'bg-auth-warn' },
    { id: 'failed', label: 'Failed', dot: 'bg-auth-bad' },
  ];

  return (
    <>
      <DashboardTopbar
        title="All URLs"
        subtitle={counts ? `${fmtNumber(counts.all)} URLs · ${fmtNumber(counts.submitted + counts.indexed)} accepted · ${fmtNumber(counts.queued)} queued · ${fmtNumber(counts.failed)} failed` : 'Every URL you have submitted'}
        search={false}
        action={
          <div className="flex gap-2">
            <Button onClick={exportCsv} disabled={rows.length === 0}>Export page</Button>
            <Link href="/submit" className="rounded-md bg-auth-accent px-3.5 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-auth-accent2">Submit URLs</Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatus(f.id)}
            aria-pressed={status === f.id}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm', status === f.id ? 'border-transparent bg-auth-accent-soft text-auth-text' : 'border-auth-line bg-auth-surface text-auth-text2')}
          >
            {f.dot && <i className={cn('h-1.5 w-1.5 rounded-full', f.dot)} />}
            {f.label}
            <span className="font-mono text-xs text-auth-text3">{fmtNumber(counts ? counts[f.id] : 0)}</span>
          </button>
        ))}
        <span className="flex-1" />
        <Select aria-label="Site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-auto py-1.5 text-sm">
          <option value="">All sites</option>
          {sites.data?.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
        </Select>
        <Input aria-label="Search URLs" placeholder="Search URLs" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 py-1.5 text-sm" />
      </div>

      <Card>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 border-b border-auth-line bg-auth-accent-soft px-4.5 py-2.5 text-[13.5px]">
            <b className="font-medium">{selected.size} selected</b>
            <button className="text-auth-accent" onClick={() => setSelected(new Set())}>Clear</button>
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => setResubmitIds([...selected])}>Resubmit {selected.size}</Button>
          </div>
        )}
        {page.error ? (
          <div className="p-4"><ErrorBanner message="Could not load your URLs." onRetry={() => void reload()} /></div>
        ) : !page.data ? (
          <div className="grid gap-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={status === 'all' && !debounced && !siteId ? 'No URLs yet' : 'Nothing matches'} action={<Link href="/submit" className="rounded-md bg-auth-accent px-3.5 py-2 text-sm font-medium text-white">Submit URLs</Link>}>
            {status === 'all' && !debounced && !siteId ? 'Submit your first URLs and track them here.' : 'Try another filter or search.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px] whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-auth-text3">
                  <th className="border-b border-auth-line py-2.5 pr-0 pl-3.5">
                    <input type="checkbox" aria-label="Select all on this page" checked={rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} className="h-3.5 w-3.5 accent-auth-accent" />
                  </th>
                  {['URL', 'Engines', 'Status', 'Last activity', ''].map((h) => <th key={h} className="border-b border-auth-line px-3.5 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const { host, rest } = splitUrl(r.url);
                  const err = r.engines.google?.error ?? r.engines.indexnow?.error;
                  return (
                    <tr key={r.id} className={selected.has(r.id) ? 'bg-auth-accent-soft/60' : 'hover:bg-white/[0.015]'}>
                      <td className="border-b border-auth-line py-2.5 pr-0 pl-3.5">
                        <input type="checkbox" aria-label={`Select ${r.url}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-3.5 w-3.5 accent-auth-accent" />
                      </td>
                      <td className="max-w-[420px] border-b border-auth-line px-3.5 py-2.5 font-mono text-[12.5px]">
                        <span className="block overflow-hidden text-ellipsis"><span className="text-auth-text3">{host}</span>{rest}</span>
                        {r.status === 'failed' && err && <span className="mt-0.5 block overflow-hidden font-sans text-xs text-ellipsis text-auth-bad" title={err}>{err}</span>}
                      </td>
                      <td className="border-b border-auth-line px-3.5 py-2.5"><EngineBadges url={r} /></td>
                      <td className="border-b border-auth-line px-3.5 py-2.5"><Pill tone={URL_STATUS[r.status].tone}>{URL_STATUS[r.status].label}</Pill></td>
                      <td className="border-b border-auth-line px-3.5 py-2.5 text-auth-text3" title={fmtDateTime(r.lastActivityAt)}>{relativeTime(r.lastActivityAt)}</td>
                      <td className="border-b border-auth-line px-3.5 py-2.5 text-[12.5px]">
                        {r.status === 'failed' && <button className="mr-3 text-auth-accent" onClick={() => setResubmitIds([r.id])}>Resubmit</button>}
                        <button className="text-auth-text2 hover:text-auth-text" onClick={() => setOpenId(r.id)}>Details</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {page.data && rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-auth-line px-4.5 py-3 text-[13px] text-auth-text3">
            <span>
              Showing {fmtNumber(offset + 1)}–{fmtNumber(offset + rows.length)}
              {counts ? ` of ${fmtNumber(status === 'all' ? counts.all : counts[status])}` : ''}
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>Previous</Button>
              <Button size="sm" disabled={!page.data.hasMore} onClick={() => setOffset((o) => o + PAGE)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <UrlDrawer id={openId} onClose={() => setOpenId(null)} onResubmit={(ids) => { setOpenId(null); setResubmitIds(ids); }} />
      <ResubmitModal ids={resubmitIds} onClose={() => setResubmitIds(null)} onDone={() => { setResubmitIds(null); setSelected(new Set()); void reload(); }} />
    </>
  );
}

export default function AllUrlsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-auth-text3">Loading…</div>}>
      <UrlsInner />
    </Suspense>
  );
}
