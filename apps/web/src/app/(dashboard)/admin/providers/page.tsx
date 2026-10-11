'use client';

import { useEffect, useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, Checkbox, ErrorBanner, Field, Input, Modal, Pill, Select, Skeleton, Stat, Switch, Table, Textarea, type Tone } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import type { Provider, ServiceAccount } from '@/lib/api-types';
import { fmtNumber, fmtPercent, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const KINDS: Provider['kind'][] = ['google_indexing', 'indexnow', 'external_api', 'search_console_sitemap'];

function QuotaBar({ used, quota }: { used: number; quota: number | null }) {
  if (!quota) return <span className="text-xs text-auth-text3">Unlimited</span>;
  const pct = Math.min(100, (used / quota) * 100);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-block h-1.5 w-17.5 overflow-hidden rounded-full bg-auth-surface2">
        <i className={cn('block h-full', pct >= 95 ? 'bg-auth-bad' : pct >= 85 ? 'bg-auth-warn' : 'bg-auth-accent')} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs text-auth-text3">{fmtNumber(used)} / {fmtNumber(quota)}</span>
    </span>
  );
}

interface ProviderForm {
  label: string;
  kind: Provider['kind'];
  submitEndpoint: string;
  statusEndpoint: string;
  apiKey: string;
  dailyQuota: string;
  priority: string;
  costUsd: string;
  creditCost: string;
  requestTemplate: string;
  description: string;
  retriesOnly: boolean;
  autoPauseAfterErrors: boolean;
}

const EMPTY: ProviderForm = {
  label: '', kind: 'external_api', submitEndpoint: '', statusEndpoint: '', apiKey: '', dailyQuota: '', priority: '50', costUsd: '', creditCost: '1',
  requestTemplate: '{ "urls": {{urls}}, "key": "{{api_key}}" }', description: '', retriesOnly: true, autoPauseAfterErrors: true,
};

function ProviderFormCard({ editing, onDone }: { editing: Provider | null; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<ProviderForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setForm(
      editing
        ? {
            label: editing.label, kind: editing.kind, submitEndpoint: editing.submitEndpoint ?? '', statusEndpoint: editing.statusEndpoint ?? '', apiKey: '',
            dailyQuota: editing.kind === 'google_indexing' || !editing.dailyQuota ? '' : String(editing.dailyQuota), priority: String(editing.priority),
            costUsd: String(editing.costUsd || ''), creditCost: String(editing.creditCost), requestTemplate: editing.requestTemplate ?? '', description: editing.description ?? '',
            retriesOnly: editing.retriesOnly, autoPauseAfterErrors: editing.autoPauseAfterErrors,
          }
        : EMPTY,
    );
  }, [editing]);

  const set = <K extends keyof ProviderForm>(k: K, v: ProviderForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const external = form.kind === 'external_api';

  async function save() {
    setError(null);
    if (!form.label.trim()) return setError('Name is required.');
    if (external && !/^https?:\/\//.test(form.submitEndpoint)) return setError('Submit endpoint must be an http(s) URL.');
    const payload = {
      kind: form.kind,
      label: form.label.trim(),
      priority: Number(form.priority) || 0,
      description: form.description.trim() || undefined,
      submitEndpoint: form.submitEndpoint.trim() || undefined,
      statusEndpoint: form.statusEndpoint.trim() || undefined,
      apiKey: form.apiKey || undefined,
      dailyQuota: form.dailyQuota ? Number(form.dailyQuota) : null,
      costUsd: Number(form.costUsd) || 0,
      creditCost: Number(form.creditCost) || 0,
      requestTemplate: external ? form.requestTemplate : undefined,
      retriesOnly: form.retriesOnly,
      autoPauseAfterErrors: form.autoPauseAfterErrors,
    };
    setBusy(true);
    try {
      if (editing) await apiClient.patch(`/admin/providers/${editing.id}`, payload);
      else await apiClient.post('/admin/providers', { ...payload, isActive: false });
      toast(editing ? 'Provider updated' : 'Provider added — it starts disabled, test it then switch it on');
      setForm(EMPTY);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={editing ? `Edit ${editing.label}` : 'Add provider'} right={editing && <Button size="sm" onClick={onDone}>Cancel</Button>} />
      <div className="p-4.5">
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Name"><Input placeholder="e.g. SpeedyIndex" value={form.label} onChange={(e) => set('label', e.target.value)} maxLength={80} /></Field>
          <Field label="Type">
            <Select value={form.kind} disabled={Boolean(editing)} onChange={(e) => set('kind', e.target.value as Provider['kind'])}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description"><Input value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={200} placeholder="Shown in the routing table" /></Field>
        {external && (
          <>
            <Field label="Submit endpoint"><Input mono placeholder="https://api.provider.com/v1/submit" value={form.submitEndpoint} onChange={(e) => set('submitEndpoint', e.target.value)} /></Field>
            <Field label="Status endpoint (optional)"><Input mono placeholder="https://api.provider.com/v1/status/{id}" value={form.statusEndpoint} onChange={(e) => set('statusEndpoint', e.target.value)} /></Field>
            <Field label="API key" right={<span className="text-xs text-auth-text3">encrypted at rest</span>} hint={editing?.hasApiKey ? 'A key is stored. Leave empty to keep it, or paste a new one to rotate.' : undefined}>
              <Input type="password" autoComplete="off" placeholder="••••••••••••" value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} />
            </Field>
          </>
        )}
        <div className="grid gap-x-3 sm:grid-cols-2">
          {form.kind !== 'google_indexing' && (
            <Field label="Daily quota"><Input mono inputMode="numeric" placeholder="empty = unlimited" value={form.dailyQuota} onChange={(e) => set('dailyQuota', e.target.value.replace(/\D/g, ''))} /></Field>
          )}
          <Field label="Priority" hint="Lower runs first"><Input mono inputMode="numeric" value={form.priority} onChange={(e) => set('priority', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Our cost / URL (USD)"><Input mono inputMode="decimal" placeholder="0.004" value={form.costUsd} onChange={(e) => set('costUsd', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Credits charged to client"><Input mono inputMode="numeric" value={form.creditCost} onChange={(e) => set('creditCost', e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
        {external && (
          <Field label="Request template" hint="Placeholders: {{urls}}, {{url}}, {{api_key}}, {{site}}">
            <Textarea mono className="min-h-22" value={form.requestTemplate} onChange={(e) => set('requestTemplate', e.target.value)} maxLength={4000} />
          </Field>
        )}
        <div className="grid gap-2">
          <Checkbox checked={form.retriesOnly} onChange={(v) => set('retriesOnly', v)}>Use only for retries, never first submission</Checkbox>
          <Checkbox checked={form.autoPauseAfterErrors} onChange={(v) => set('autoPauseAfterErrors', v)}>Pause automatically after 20 consecutive errors</Checkbox>
        </div>
        {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
        <div className="mt-3.5 flex justify-end">
          <Button variant="primary" loading={busy} onClick={() => void save()}>{editing ? 'Save provider' : 'Add provider'}</Button>
        </div>
      </div>
    </Card>
  );
}

function AddServiceAccountModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [keyJson, setKeyJson] = useState('');
  const [quota, setQuota] = useState('200');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post('/admin/service-accounts', { keyJson, dailyQuota: Number(quota) || 200 });
      toast('Service account added — its private key is stored encrypted');
      setKeyJson('');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Google service account" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={keyJson.length < 20} onClick={() => void save()}>Add account</Button></>}>
      <Field label="Key file (JSON)" hint="Google Cloud → IAM → Service accounts → Keys → Add key → JSON. Add the account as an owner in Search Console.">
        <Textarea mono className="min-h-40 text-[11.5px]" placeholder='{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }' value={keyJson} onChange={(e) => setKeyJson(e.target.value)} />
      </Field>
      <Field label="Daily quota" hint="Google's default is 200 publish requests per day per project." className="mb-0">
        <Input mono inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

const HEALTH: Record<ServiceAccount['health'], { tone: Tone; label: string }> = {
  healthy: { tone: 'ok', label: 'Healthy' },
  near_quota: { tone: 'warn', label: 'Near quota' },
  errors: { tone: 'bad', label: 'Errors' },
  paused: { tone: 'muted', label: 'Paused' },
};

export default function ProvidersPage() {
  const toast = useToast();
  const providers = useApi<Provider[]>('/admin/providers');
  const accounts = useApi<ServiceAccount[]>('/admin/service-accounts');
  const [order, setOrder] = useState<Provider[]>([]);
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [addAccount, setAddAccount] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    if (providers.data) {
      setOrder(providers.data);
      setDirtyOrder(false);
    }
  }, [providers.data]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirtyOrder(true);
  };

  async function saveOrder() {
    setSavingOrder(true);
    try {
      const updated = await apiClient.put<Provider[]>('/admin/providers/order', { ids: order.map((p) => p.id) });
      providers.setData(updated);
      toast('Routing order saved — applies to the next submission');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setSavingOrder(false);
    }
  }

  async function toggleProvider(p: Provider, isActive: boolean) {
    setOrder((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive } : x)));
    try {
      await apiClient.patch(`/admin/providers/${p.id}`, { isActive });
      toast(`${p.label} ${isActive ? 'enabled' : 'disabled — queued work drains safely'}`, 'info');
    } catch (e) {
      toast(errorMessage(e), 'bad');
      void providers.reload();
    }
  }

  async function removeProvider(p: Provider) {
    if (!window.confirm(`Remove ${p.label}? Providers with submission history are disabled instead of deleted.`)) return;
    try {
      const res = await apiClient.delete<{ deleted: boolean }>(`/admin/providers/${p.id}`);
      toast(res.deleted ? `${p.label} removed` : `${p.label} has history, so it was disabled instead`, 'info');
      void providers.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  async function toggleAccount(a: ServiceAccount) {
    try {
      await apiClient.patch(`/admin/service-accounts/${a.id}`, { isActive: !a.isActive });
      void accounts.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  const list = order;
  const google = list.find((p) => p.kind === 'google_indexing');
  const activeAccounts = (accounts.data ?? []).filter((a) => a.isActive);
  const nearQuota = (accounts.data ?? []).filter((a) => a.health === 'near_quota').length;
  const total7d = list.reduce((s, p) => s + p.submissions7d, 0);

  return (
    <>
      <DashboardTopbar title="Indexing providers" subtitle="Superadmin only · changes apply to the next submission" search={false} action={<Button variant="primary" onClick={() => { setEditing(null); document.getElementById('provider-form')?.scrollIntoView({ behavior: 'smooth' }); }}>Add provider</Button>} />

      <div className="mb-5.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="URLs routed · 7 days" value={fmtNumber(total7d)} detail={`across ${list.filter((p) => p.isActive).length} active providers`} />
        <Stat label="Google service accounts" value={`${activeAccounts.length} / ${accounts.data?.length ?? 0}`} detail={nearQuota ? `${nearQuota} near daily quota` : 'quotas reset daily'} detailTone={nearQuota ? 'warn' : undefined} />
        <Stat label="Google quota today" value={google?.dailyQuota ? fmtPercent(google.usedToday / google.dailyQuota, 0) : '—'} detail={google ? `${fmtNumber(google.usedToday)} of ${fmtNumber(google.dailyQuota)}` : 'No Google provider'} />
        <Stat label="Avg success · 7 days" value={fmtPercent(total7d ? list.reduce((s, p) => s + (p.successRate7d ?? 0) * p.submissions7d, 0) / total7d : null)} />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Routing order"
          subtitle="Drag rows (or use the arrows) — each URL tries providers top to bottom until one accepts"
          right={dirtyOrder && (
            <>
              <Button size="sm" onClick={() => { setOrder(providers.data ?? []); setDirtyOrder(false); }}>Reset</Button>
              <Button size="sm" variant="primary" loading={savingOrder} onClick={() => void saveOrder()}>Save order</Button>
            </>
          )}
        />
        {providers.error ? <div className="p-4"><ErrorBanner message="Could not load providers." onRetry={() => void providers.reload()} /></div> : providers.loading && !providers.data ? <Skeleton className="m-4 h-32" /> : (
          <Table head={['#', 'Provider', 'Type', "Today's quota", 'Success 7d', 'Our cost', 'Client cost', 'Status', '']}>
            {list.map((p, i) => (
              <tr
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = list.findIndex((x) => x.id === dragId);
                  move(from, i);
                  setDragId(null);
                }}
                className={cn(!p.isActive && 'opacity-55', dragId === p.id && 'opacity-40')}
              >
                <td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-auth-text3">
                    <Icon.drag className="h-3.5 w-3.5 cursor-grab" />
                    <span className="font-mono text-xs">{i + 1}</span>
                    <span className="ml-1 flex flex-col">
                      <button aria-label={`Move ${p.label} up`} className="text-[10px] leading-none hover:text-auth-text disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
                      <button aria-label={`Move ${p.label} down`} className="text-[10px] leading-none hover:text-auth-text disabled:opacity-30" disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>▼</button>
                    </span>
                  </span>
                </td>
                <td>
                  <b className="font-medium">{p.label}</b>
                  {p.description && <div className="max-w-[300px] truncate text-xs text-auth-text3">{p.description}</div>}
                </td>
                <td className="font-mono text-xs text-auth-text3">{p.kind}</td>
                <td><QuotaBar used={p.usedToday} quota={p.dailyQuota} /></td>
                <td className="font-mono">{fmtPercent(p.successRate7d, 0)}</td>
                <td className="font-mono">${p.costUsd}</td>
                <td className="font-mono">{p.creditCost ? `${p.creditCost} cr` : '0'}</td>
                <td><Switch label={`Enable ${p.label}`} checked={p.isActive} onChange={(v) => void toggleProvider(p, v)} /></td>
                <td className="text-right whitespace-nowrap">
                  <Button variant="link" onClick={() => { setEditing(p); document.getElementById('provider-form')?.scrollIntoView({ behavior: 'smooth' }); }}>Edit</Button>
                  {p.kind === 'external_api' && <Button variant="link" className="ml-3 text-auth-bad!" onClick={() => void removeProvider(p)}>Remove</Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="border-t border-auth-line px-4.5 py-3 text-[12.5px] text-auth-text3">
          Rules: retries skip the provider that failed · external providers are only used for first submission when marked so · disabling drains the queue safely.
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Google service accounts" right={<Button size="sm" variant="primary" onClick={() => setAddAccount(true)}>Add service account</Button>} />
          {accounts.error ? <div className="p-4"><ErrorBanner message="Could not load service accounts." onRetry={() => void accounts.reload()} /></div> : (accounts.data ?? []).length === 0 ? (
            <p className="px-4.5 py-6 text-center text-[13px] text-auth-text3">No service accounts yet. Add one to start submitting to the Google Indexing API.</p>
          ) : (
            <Table head={['Account', 'Project', 'Used today', 'Errors 24h', 'Last used', 'Status', '']}>
              {(accounts.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="max-w-[220px] truncate font-mono text-[12.5px]" title={a.clientEmail}>{a.clientEmail}</td>
                  <td className="text-auth-text3">{a.gcpProjectId}</td>
                  <td><QuotaBar used={a.usedToday} quota={a.dailyQuota} /></td>
                  <td className={cn('font-mono', a.errors24h > 0 && 'text-auth-bad')}>{a.errors24h}</td>
                  <td className="whitespace-nowrap text-auth-text3">{relativeTime(a.lastUsedAt)}</td>
                  <td><Pill tone={HEALTH[a.health].tone}>{HEALTH[a.health].label}</Pill></td>
                  <td className="text-right"><Button variant="link" onClick={() => void toggleAccount(a)}>{a.isActive ? 'Pause' : 'Resume'}</Button></td>
                </tr>
              ))}
            </Table>
          )}
          <div className="border-t border-auth-line px-4.5 py-2.5 text-[12.5px] text-auth-text3">Private keys are encrypted with AES-256-GCM and never returned by the API.</div>
        </Card>

        <div id="provider-form" className="scroll-mt-5">
          <ProviderFormCard editing={editing} onDone={() => { setEditing(null); void providers.reload(); }} />
        </div>
      </div>

      <AddServiceAccountModal open={addAccount} onClose={() => setAddAccount(false)} onSaved={() => { setAddAccount(false); void accounts.reload(); void providers.reload(); }} />
    </>
  );
}
