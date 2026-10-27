'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, Drawer, EmptyState, ErrorBanner, Field, Input, Pill, Select, Skeleton, type Tone } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { useAccount } from '@/lib/account-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const MAX_URLS = 10_000;

interface Batch {
  id: string;
  name: string;
  source: string;
  engines: string[];
  urlCount: number;
  skippedCount: number;
  creditsCharged: number;
  priority: boolean;
  createdAt: string;
  status: 'queued' | 'in_progress' | 'done' | 'failed';
  counts: { queued: number; submitted: number; indexed: number; failed: number };
}

interface BatchDetail extends Batch {
  urls: { url: string; statuses: string[]; lastError: string | null; indexedAt: string | null }[];
}

interface CreateResult {
  batch: Batch;
  skipped: { invalid: number; duplicate: number; otherDomain: number; alreadyIndexed: number };
  balance: number | null;
}

const BATCH_STATUS: Record<Batch['status'], { tone: Tone; label: string }> = {
  queued: { tone: 'muted', label: 'Queued' },
  in_progress: { tone: 'info', label: 'In progress' },
  done: { tone: 'ok', label: 'Done' },
  failed: { tone: 'bad', label: 'Failed' },
};

interface LineInfo {
  empty: boolean;
  valid: boolean;
  duplicateOfLine: number | null;
  host: string | null;
}

/** Mirrors the server's rules closely enough for live feedback; the server is authoritative. */
function parseLines(raw: string): LineInfo[] {
  const seen = new Map<string, number>();
  return raw.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return { empty: true, valid: false, duplicateOfLine: null, host: null };
    let host: string | null = null;
    let valid = false;
    if (!/\s/.test(trimmed)) {
      try {
        const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
        host = url.hostname.toLowerCase();
        valid = host.includes('.') && /^https?:$/.test(url.protocol);
      } catch {
        valid = false;
      }
    }
    const key = trimmed.replace(/^https?:\/\//i, '').replace(/#.*$/, '').toLowerCase();
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    return { empty: false, valid, duplicateOfLine: valid && first !== undefined ? first + 1 : null, host };
  });
}

function suggestName(hosts: string[]): string {
  if (hosts.length === 0) return '';
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${hosts.length === 1 ? hosts[0].replace(/^www\./, '') : `${hosts.length} sites`} · ${date}`;
}

function BatchDrawer({ batchId, onClose, onRenamed }: { batchId: string | null; onClose: () => void; onRenamed: (id: string, name: string) => void }) {
  const toast = useToast();
  const detail = useApi<BatchDetail>(batchId ? `/batches/${batchId}` : null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (detail.data) setName(detail.data.name);
  }, [detail.data]);

  if (!batchId) return null;
  const b = detail.data;

  async function rename() {
    if (!b || !name.trim() || name.trim() === b.name) return;
    setSaving(true);
    try {
      await apiClient.patch(`/batches/${b.id}`, { name: name.trim() });
      onRenamed(b.id, name.trim());
      detail.setData({ ...b, name: name.trim() });
      toast('Batch renamed');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={b?.name ?? 'Batch'} subtitle={b ? `${fmtDateTime(b.createdAt)} · ${fmtNumber(b.urlCount)} URLs` : undefined}>
      {detail.error && <ErrorBanner message="Could not load this batch." onRetry={() => void detail.reload()} />}
      {!b && !detail.error && <Skeleton className="h-40" />}
      {b && (
        <>
          <Field label="Batch name">
            <div className="flex gap-2">
              <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void rename()} />
              <Button loading={saving} disabled={!name.trim() || name.trim() === b.name} onClick={() => void rename()}>Rename</Button>
            </div>
          </Field>
          <div className="mb-4 grid grid-cols-4 gap-2 text-center">
            {([
              ['Queued', b.counts.queued, ''],
              ['Submitted', b.counts.submitted, 'text-auth-accent'],
              ['Indexed', b.counts.indexed, 'text-auth-ok'],
              ['Failed', b.counts.failed, 'text-auth-bad'],
            ] as const).map(([label, n, cls]) => (
              <div key={label} className="rounded-lg border border-auth-line bg-auth-bg2 py-2.5">
                <b className={cn('block font-mono text-lg', cls)}>{fmtNumber(n)}</b>
                <span className="text-xs text-auth-text3">{label}</span>
              </div>
            ))}
          </div>
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-auth-text3">Sent to</dt>
            <dd className="text-right">{b.engines.map((e) => (e === 'google' ? 'Google' : 'Bing, Yandex & others')).join(' + ')}</dd>
            <dt className="text-auth-text3">Credits charged</dt>
            <dd className="text-right font-mono">{fmtNumber(b.creditsCharged)}</dd>
            <dt className="text-auth-text3">Skipped</dt>
            <dd className="text-right font-mono">{fmtNumber(b.skippedCount)}</dd>
            <dt className="text-auth-text3">Source</dt>
            <dd className="text-right capitalize">{b.source}{b.priority ? ' · priority' : ''}</dd>
          </dl>
          <h4 className="mb-2 text-sm font-medium">URLs</h4>
          <div className="overflow-hidden rounded-lg border border-auth-line">
            {b.urls.map((u) => {
              const status = u.indexedAt || u.statuses.includes('indexed')
                ? 'Indexed'
                : u.statuses.includes('submitted')
                  ? 'Submitted'
                  : u.statuses.every((s) => s === 'failed' || s === 'rejected')
                    ? 'Failed'
                    : 'Queued';
              return (
                <div key={u.url} className="flex items-center gap-3 border-b border-auth-line px-3 py-2 text-[12.5px] last:border-b-0">
                  <span className="min-w-0 flex-1 truncate font-mono" title={u.url}>{u.url}</span>
                  <Pill tone={status === 'Indexed' ? 'ok' : status === 'Submitted' ? 'info' : status === 'Failed' ? 'bad' : 'muted'}>{status}</Pill>
                </div>
              );
            })}
          </div>
          {b.urlCount > b.urls.length && <p className="mt-2 text-xs text-auth-text3">Showing the first {b.urls.length} of {fmtNumber(b.urlCount)} URLs.</p>}
        </>
      )}
    </Drawer>
  );
}

export default function SubmitUrlsPage() {
  const toast = useToast();
  const { credits, profile, refreshCredits, refreshProfile } = useAccount();
  const [tab, setTab] = useState<'paste' | 'csv' | 'sitemap'>('paste');
  const [siteId, setSiteId] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const pricing = useApi<{ creditsPerUrl: number }>('/credits/pricing');
  const [keepChecking, setKeepChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CreateResult | null>(null);
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const batches = useApi<Batch[]>('/batches?limit=8');
  const prefsApplied = useRef(false);

  useEffect(() => {
    if (!profile || prefsApplied.current) return;
    prefsApplied.current = true;
    const s = profile.preferences.submission;
    setKeepChecking(s.recheckUntilIndexed);
    // A "Submit URLs" link from a site card (?site=…) wins over the saved default.
    const linked = new URLSearchParams(window.location.search).get('site');
    const preferred = linked ?? s.defaultSiteId;
    if (preferred && profile.sites.some((x) => x.id === preferred)) setSiteId(preferred);
  }, [profile]);

  const lines = useMemo(() => parseLines(text), [text]);
  const nonEmpty = lines.filter((l) => !l.empty);
  const readyLines = lines.filter((l) => l.valid && l.duplicateOfLine === null);
  const duplicateLines = lines.filter((l) => l.duplicateOfLine !== null);
  const invalidLines = lines.filter((l) => !l.empty && !l.valid);
  const hosts = [...new Set(readyLines.map((l) => l.host).filter((h): h is string => Boolean(h)))];
  const readyCount = readyLines.length;
  const suggested = suggestName(hosts);
  const shownName = nameTouched ? name : name || suggested;

  // Every accepted URL costs the same, whichever engines it reaches; the server is authoritative.
  const perUrl = pricing.data?.creditsPerUrl ?? 1;
  const totalCost = readyCount * perUrl;
  const balanceAfter = (credits?.balance ?? 0) - totalCost;
  const tooMany = readyCount > MAX_URLS;
  const canSubmit = readyCount > 0 && !tooMany && balanceAfter >= 0 && !submitting;

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast('File is larger than 5 MB', 'bad');
      return;
    }
    const content = await file.text();
    // One URL per line; for CSV take the first column and drop a header row.
    const rows = content
      .split(/\r?\n/)
      .map((row) => row.split(',')[0]?.replace(/^"|"$/g, '').trim() ?? '')
      .filter((v, i) => v && !(i === 0 && !/[./]/.test(v)));
    setText(rows.join('\n'));
    setFileName(file.name);
    if (!nameTouched) {
      setName(file.name.replace(/\.(csv|txt)$/i, ''));
      setNameTouched(true);
    }
    setTab('paste');
    toast(`Loaded ${fmtNumber(rows.length)} lines from ${file.name}`, 'info');
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiClient.post<CreateResult>('/batches', {
        name: shownName.trim() || undefined,
        urls: text.split('\n').map((l) => l.trim()).filter(Boolean),
        siteId: siteId || undefined,
        source: fileName ? 'csv' : 'paste',
        recheckUntilIndexed: keepChecking,
        notifyWhenDone: true,
      });
      setLastResult(res);
      setText('');
      setName('');
      setNameTouched(false);
      setFileName(null);
      batches.setData((prev) => [res.batch, ...(prev ?? [])].slice(0, 8));
      void refreshCredits();
      void refreshProfile();
      toast(`“${res.batch.name}” submitted — ${fmtNumber(res.batch.urlCount)} URLs`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const skippedParts = lastResult
    ? [
        lastResult.skipped.duplicate && `${lastResult.skipped.duplicate} duplicate`,
        lastResult.skipped.invalid && `${lastResult.skipped.invalid} invalid`,
        lastResult.skipped.alreadyIndexed && `${lastResult.skipped.alreadyIndexed} already indexed`,
        lastResult.skipped.otherDomain && `${lastResult.skipped.otherDomain} on other domains`,
      ].filter(Boolean)
    : [];

  return (
    <>
      <DashboardTopbar title="Submit URLs" subtitle="One URL per line. Duplicates and already-indexed pages are skipped and never charged." />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {lastResult && (
            <div role="status" className="rounded-[10px] border border-auth-ok/35 bg-[linear-gradient(120deg,rgba(53,208,181,.10),transparent_60%)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="font-medium text-auth-ok">“{lastResult.batch.name}” is queued</b>
                <Button size="sm" onClick={() => setOpenBatch(lastResult.batch.id)}>View batch</Button>
              </div>
              <p className="mt-1 text-[13px] text-auth-text2">
                {fmtNumber(lastResult.batch.urlCount)} URLs accepted · {fmtNumber(lastResult.batch.creditsCharged)} credits charged
                {skippedParts.length > 0 && ` · skipped ${skippedParts.join(', ')}`}
              </p>
            </div>
          )}

          <Card>
            <div role="tablist" className="flex gap-0.5 border-b border-auth-line px-4.5">
              {([
                { id: 'paste', label: 'Paste URLs' },
                { id: 'csv', label: 'Upload CSV' },
                { id: 'sitemap', label: 'From sitemap' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn('-mb-px border-b-2 px-3 py-3 text-[13.5px]', tab === t.id ? 'border-auth-accent text-auth-text' : 'border-transparent text-auth-text3')}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4.5">
              <div className="grid gap-x-3.5 md:grid-cols-2">
                <Field label="Batch name" hint={!nameTouched && suggested ? 'Suggested from your URLs — type to change it.' : 'Shown in your batch history and ledger.'}>
                  <Input
                    placeholder="e.g. Laptop category pages — October"
                    value={shownName}
                    maxLength={120}
                    onChange={(e) => {
                      setNameTouched(true);
                      setName(e.target.value);
                    }}
                  />
                </Field>
                <Field label={<>Site <span className="text-auth-text3">(optional)</span></>} right={<Link href="/sites" className="text-[13px] text-auth-accent">+ Add a site</Link>}>
                  <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                    <option value="">No site — detect from the URLs</option>
                    {profile?.sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
                  </Select>
                </Field>
              </div>

              {tab === 'paste' && (
                <div>
                  <div className="mb-1.5 flex justify-between text-[13px] text-auth-text2">
                    <label htmlFor="urls-input">URLs{fileName && <span className="text-auth-text3"> · from {fileName}</span>}</label>
                    <span className="text-auth-text3">
                      {fmtNumber(nonEmpty.length)} lines · {fmtNumber(readyCount)} new
                      {duplicateLines.length > 0 && ` · ${duplicateLines.length} duplicate`}
                      {invalidLines.length > 0 && ` · ${invalidLines.length} invalid`}
                    </span>
                  </div>
                  <div className="relative">
                    <div aria-hidden className="absolute top-px bottom-px left-0 w-11 overflow-hidden rounded-l-md border-r border-auth-line bg-auth-bg2 py-3 text-center font-mono text-xs leading-[1.75] text-auth-text3 select-none">
                      {lines.slice(0, 2000).map((l, i) => (
                        <div key={i} className={l.duplicateOfLine ? 'text-auth-warn' : !l.empty && !l.valid ? 'text-auth-bad' : undefined}>
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    <textarea
                      id="urls-input"
                      spellCheck={false}
                      wrap="off"
                      value={text}
                      placeholder={'https://example.com/new-page\nhttps://example.com/blog/post'}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-75 w-full resize-y overflow-x-auto rounded-md border border-auth-line bg-auth-bg py-3 pr-3.5 pl-13.5 font-mono text-[13px] leading-[1.75] whitespace-pre text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft"
                    />
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2 text-[12.5px]">
                    {readyCount > 0 && <Pill tone="ok">{fmtNumber(readyCount)} ready to submit</Pill>}
                    {tooMany && <Pill tone="bad">Max {fmtNumber(MAX_URLS)} URLs per batch</Pill>}
                    {duplicateLines.slice(0, 3).map((l) => (
                      <Pill key={`dup-${lines.indexOf(l)}`} tone="warn">Line {lines.indexOf(l) + 1} duplicates line {l.duplicateOfLine}</Pill>
                    ))}
                    {invalidLines.slice(0, 3).map((l) => (
                      <Pill key={`bad-${lines.indexOf(l)}`} tone="bad">Line {lines.indexOf(l) + 1} isn&apos;t a valid URL</Pill>
                    ))}
                    {duplicateLines.length + invalidLines.length > 6 && <Pill tone="muted">…and more</Pill>}
                    {hosts.length === 1 && <Pill tone="muted">All on {hosts[0]}</Pill>}
                    {hosts.length > 1 && <Pill tone="muted">{hosts.length} domains</Pill>}
                  </div>
                </div>
              )}

              {tab === 'csv' && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) void handleFile(f);
                  }}
                  className="w-full rounded-lg border border-dashed border-auth-line2 p-7 text-center text-[13.5px] text-auth-text3 hover:border-auth-accent"
                >
                  <b className="mb-1 block font-medium text-auth-text">Drop a .csv or .txt file here, or click to choose</b>
                  Up to {fmtNumber(MAX_URLS)} URLs · the first column is used and a header row is skipped
                  <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
                </button>
              )}

              {tab === 'sitemap' && (
                <EmptyState title="Sitemap import is coming soon">For now, copy the URLs from your sitemap and paste them in the Paste URLs tab.</EmptyState>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent batches" right={<Link href="/urls" className="text-[12.5px] text-auth-text3 hover:text-auth-text2">All URLs →</Link>} />
            {batches.error ? (
              <div className="p-4"><ErrorBanner message="Could not load your batches." onRetry={() => void batches.reload()} /></div>
            ) : batches.loading && !batches.data ? (
              <div className="grid gap-2 p-4.5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            ) : (batches.data ?? []).length === 0 ? (
              <p className="px-4.5 py-6 text-center text-[13px] text-auth-text3">Your submitted batches will appear here, each with its own name.</p>
            ) : (
              <div className="text-[13px]">
                {(batches.data ?? []).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setOpenBatch(b.id)}
                    className="flex w-full items-center justify-between gap-2.5 border-b border-auth-line px-4.5 py-2.5 text-left text-auth-text2 last:border-b-0 hover:bg-white/[0.015]"
                  >
                    <div className="min-w-0">
                      <b className="block truncate font-medium text-auth-text">{b.name}</b>
                      <div className="text-auth-text3">
                        {fmtDateTime(b.createdAt)} · {fmtNumber(b.urlCount)} URLs
                        {b.counts.indexed > 0 && <> · <span className="text-auth-ok">{fmtNumber(b.counts.indexed)} indexed</span></>}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2.5">
                      <Pill tone={BATCH_STATUS[b.status].tone}>{BATCH_STATUS[b.status].label}</Pill>
                      <span className="hidden w-20 text-right text-auth-text3 sm:inline">{fmtNumber(b.creditsCharged)} credits</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-5">
          <Card>
            <CardHeader title="Cost" right={<Pill tone="ok">{fmtNumber(readyCount)} URLs</Pill>} />
            <div className="flex flex-col gap-2.5 p-4.5 text-[13.5px]">
              {[
                { label: `${fmtNumber(readyCount)} URLs × ${fmtNumber(perUrl)} credit${perUrl === 1 ? '' : 's'}`, value: totalCost },
                { label: `${duplicateLines.length} duplicate, ${invalidLines.length} invalid skipped`, value: 0 },
              ].map((r) => (
                <div key={r.label} className="flex justify-between text-auth-text2">
                  <span>{r.label}</span>
                  <span className="font-mono text-auth-text">{fmtNumber(r.value)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-auth-line pt-3 text-[15px] font-semibold">
                <span>Total credits</span>
                <span className="font-mono">{fmtNumber(totalCost)}</span>
              </div>
              <div className={cn('flex items-center justify-between rounded-md px-3 py-2.5 text-[13px]', balanceAfter < 0 ? 'bg-auth-bad-soft text-auth-bad' : 'bg-auth-ok-soft text-auth-ok')}>
                <span>{balanceAfter < 0 ? 'Not enough credits' : 'Balance after'}</span>
                <b className="font-mono">{fmtNumber(balanceAfter)}</b>
              </div>
              {balanceAfter < 0 && (
                <Link href="/billing/buy" className="text-center text-[12.5px] text-auth-accent">Buy {fmtNumber(-balanceAfter)}+ credits →</Link>
              )}
              {error && <p role="alert" className="text-[12.5px] text-auth-bad">{error}</p>}
              <Button variant="primary" size="lg" className="mt-1" disabled={!canSubmit} loading={submitting} onClick={() => void submit()}>
                Submit {fmtNumber(readyCount)} URL{readyCount === 1 ? '' : 's'}
              </Button>
              <p className="text-[12.5px] leading-snug text-auth-text3">
                Each URL goes to Google, Bing, Yandex, Naver, Seznam and Yep. Credits for URLs that can’t be submitted are refunded automatically. Submissions start within 60 seconds.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <BatchDrawer
        batchId={openBatch}
        onClose={() => setOpenBatch(null)}
        onRenamed={(id, newName) => batches.setData((prev) => (prev ?? []).map((b) => (b.id === id ? { ...b, name: newName } : b)))}
      />
    </>
  );
}
