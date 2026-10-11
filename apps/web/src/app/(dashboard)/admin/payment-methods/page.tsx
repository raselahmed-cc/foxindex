'use client';

import { useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, Checkbox, ErrorBanner, Field, Input, Modal, Pill, Select, Skeleton, Stat, Switch, Table, Textarea } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { MethodLogo } from '@/components/billing/purchase';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import type { AdminMethod, AdminPack, GatewayStatus } from '@/lib/api-types';
import { fmtBdtCompact, fmtMoney, fmtNumber, fmtPercent, relativeTime } from '@/lib/format';

const METHOD_TYPES = ['bkash', 'nagad', 'rocket', 'bank', 'crypto', 'card', 'gateway'] as const;

type MethodForm = Omit<AdminMethod, 'id' | 'sortOrder'> & { sortOrder: number };
const EMPTY_METHOD: MethodForm = {
  type: 'bank', label: '', accountNumber: '', accountName: '', bankName: '', branch: '', network: '', instructions: '',
  isManual: true, gateway: null, isActive: true, sortOrder: 100, feePercent: 0,
};

function MethodModal({ method, open, onClose, onSaved }: { method: AdminMethod | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<MethodForm>(EMPTY_METHOD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (method?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm(method ? { ...method, sortOrder: method.sortOrder ?? 100 } : EMPTY_METHOD);
  }
  const set = <K extends keyof MethodForm>(k: K, v: MethodForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: 'label' | 'accountNumber' | 'accountName' | 'bankName' | 'branch' | 'network' | 'instructions') => ({
    value: form[k] ?? '',
    onChange: (e: { target: { value: string } }) => set(k, e.target.value),
  });

  async function save() {
    if (!form.label.trim()) return setError('Give the method a label.');
    setBusy(true);
    setError(null);
    const nullable = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const payload = {
      type: form.type,
      label: form.label.trim(),
      accountNumber: nullable(form.accountNumber),
      accountName: nullable(form.accountName),
      bankName: nullable(form.bankName),
      branch: nullable(form.branch),
      network: nullable(form.network),
      instructions: nullable(form.instructions),
      isManual: form.isManual,
      gateway: form.isManual ? null : 'aamarpay',
      feePercent: Number(form.feePercent) || 0,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 100,
    };
    try {
      if (method) await apiClient.patch(`/admin/billing/methods/${method.id}`, payload);
      else await apiClient.post('/admin/billing/methods', payload);
      toast(method ? 'Payment method updated' : 'Payment method added');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={method ? `Edit ${method.label}` : 'Add payment method'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Label"><Input {...text('label')} maxLength={80} placeholder="e.g. Bank transfer" /></Field>
        <Field label="Type">
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            {METHOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <Checkbox className="mb-3.5" checked={!form.isManual} onChange={(v) => set('isManual', !v)}>
        Online through aamarPay (credits added automatically after verification)
      </Checkbox>
      {form.isManual ? (
        <div className="grid gap-x-3.5 sm:grid-cols-2">
          <Field label="Account number"><Input mono {...text('accountNumber')} /></Field>
          <Field label="Account name"><Input {...text('accountName')} /></Field>
          <Field label="Bank"><Input {...text('bankName')} /></Field>
          <Field label="Branch"><Input {...text('branch')} /></Field>
        </div>
      ) : (
        <Field label="Network shown to clients" hint="bkash, nagad, rocket — controls the logo."><Input {...text('network')} /></Field>
      )}
      <Field label="Instructions shown to clients"><Textarea {...text('instructions')} maxLength={500} className="min-h-16" /></Field>
      <div className="grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Fee %" hint="Added on top of the price."><Input mono inputMode="decimal" value={String(form.feePercent)} onChange={(e) => set('feePercent', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} /></Field>
        <Field label="Sort order" hint="Lower shows first."><Input mono inputMode="numeric" value={String(form.sortOrder)} onChange={(e) => set('sortOrder', Number(e.target.value.replace(/\D/g, '')) || 0)} /></Field>
      </div>
      {error && <p role="alert" className="text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

type PackForm = { name: string; credits: string; priceBdt: string; priceUsd: string; isFeatured: boolean };

function PackModal({ pack, open, onClose, onSaved }: { pack: AdminPack | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<PackForm>({ name: '', credits: '', priceBdt: '', priceUsd: '', isFeatured: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (pack?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm(pack ? { name: pack.name, credits: String(pack.credits), priceBdt: String(pack.priceBdt), priceUsd: String(pack.priceUsd), isFeatured: pack.isFeatured } : { name: '', credits: '', priceBdt: '', priceUsd: '', isFeatured: false });
  }

  async function save() {
    const credits = Number(form.credits);
    if (!form.name.trim() || !credits) return setError('Name and credits are required.');
    setBusy(true);
    setError(null);
    const payload = { name: form.name.trim(), credits, priceBdt: Number(form.priceBdt) || 0, priceUsd: Number(form.priceUsd) || 0, isFeatured: form.isFeatured };
    try {
      if (pack) await apiClient.patch(`/admin/billing/packs/${pack.id}`, payload);
      else await apiClient.post('/admin/billing/packs', { ...payload, isActive: true });
      toast(pack ? 'Pack updated' : 'Pack added');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rate = Number(form.priceBdt) / (Number(form.credits) || 1);
  return (
    <Modal open={open} onClose={onClose} title={pack ? `Edit ${pack.name}` : 'Add credit pack'} width={460} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} /></Field>
        <Field label="Credits"><Input mono inputMode="numeric" value={form.credits} onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value.replace(/\D/g, '') }))} /></Field>
        <Field label="Price (BDT)" hint={form.credits && form.priceBdt ? `৳${rate.toFixed(2)} per URL` : undefined}><Input mono inputMode="decimal" value={form.priceBdt} onChange={(e) => setForm((f) => ({ ...f, priceBdt: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
        <Field label="Price (USD)"><Input mono inputMode="decimal" value={form.priceUsd} onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value.replace(/[^\d.]/g, '') }))} /></Field>
      </div>
      <Checkbox checked={form.isFeatured} onChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}>Mark as “Most popular”</Checkbox>
      <p className="mt-3 text-xs text-auth-text3">Custom amounts are priced at the rate of the largest pack a client reaches.</p>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

export default function PaymentMethodsPage() {
  const toast = useToast();
  const methods = useApi<AdminMethod[]>('/admin/billing/methods');
  const packs = useApi<AdminPack[]>('/admin/billing/packs');
  const gateways = useApi<GatewayStatus[]>('/admin/billing/gateways');
  const stats = useApi<{ collectedBdtThisMonth: number; approvedThisMonth: number; pendingReview: number; pendingOverThreeHours: number }>('/admin/payments/stats');
  const [methodModal, setMethodModal] = useState<{ open: boolean; method: AdminMethod | null }>({ open: false, method: null });
  const [packModal, setPackModal] = useState<{ open: boolean; pack: AdminPack | null }>({ open: false, pack: null });
  const aamarpay = gateways.data?.[0];

  async function toggleMethod(m: AdminMethod, isActive: boolean) {
    methods.setData((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, isActive } : x)));
    try {
      await apiClient.patch(`/admin/billing/methods/${m.id}`, { isActive });
      toast(`${m.label} ${isActive ? 'enabled' : 'hidden from clients'}`, 'info');
    } catch (e) {
      toast(errorMessage(e), 'bad');
      void methods.reload();
    }
  }

  async function togglePack(p: AdminPack, isActive: boolean) {
    packs.setData((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, isActive } : x)));
    try {
      await apiClient.patch(`/admin/billing/packs/${p.id}`, { isActive });
      toast(`${p.name} ${isActive ? 'visible' : 'hidden'}`, 'info');
    } catch (e) {
      toast(errorMessage(e), 'bad');
      void packs.reload();
    }
  }

  return (
    <>
      <DashboardTopbar title="Payment methods" subtitle="Gateways, manual methods, packs and approval rules" search={false} action={<Button variant="primary" onClick={() => setMethodModal({ open: true, method: null })}>Add method</Button>} />

      <div className="mb-5.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Collected · this month" value={stats.data ? fmtBdtCompact(stats.data.collectedBdtThisMonth) : '—'} detail={`${fmtNumber(stats.data?.approvedThisMonth)} payments`} detailTone="up" />
        <Stat label="aamarPay success rate" value={fmtPercent(aamarpay?.successRate ?? null)} detail={`${fmtNumber(aamarpay?.abandonedToday ?? 0)} abandoned checkouts today`} />
        <Stat label="Manual payments pending" value={fmtNumber(stats.data?.pendingReview)} detail={stats.data?.pendingOverThreeHours ? `${stats.data.pendingOverThreeHours} over 3 hours` : 'none overdue'} detailTone={stats.data?.pendingOverThreeHours ? 'warn' : undefined} />
        <Stat label="Active methods" value={fmtNumber(methods.data?.filter((m) => m.isActive).length)} detail={`of ${fmtNumber(methods.data?.length)} configured`} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Gateways" right={<span className="text-[12.5px] text-auth-text3">Secrets live in server environment variables, never in the database</span>} />
        {gateways.error ? <div className="p-4"><ErrorBanner message="Could not load gateway status." onRetry={() => void gateways.reload()} /></div> : (
          <Table head={['Gateway', 'Covers', 'Mode', 'Last success', 'Status']}>
            {(gateways.data ?? []).map((g) => (
              <tr key={g.id}>
                <td>
                  <b className="font-medium">{g.name}</b>
                  <div className="text-xs text-auth-text3">{g.storeId ? `store ${g.storeId}` : 'not configured'}</div>
                </td>
                <td className="text-auth-text3">{g.covers}</td>
                <td>{g.mode === 'live' ? <Pill tone="ok">Live</Pill> : g.mode === 'sandbox' ? <Pill tone="warn">Sandbox</Pill> : <Pill tone="muted">Off</Pill>}</td>
                <td className="text-auth-text3">{g.lastSuccessAt ? relativeTime(g.lastSuccessAt) : '—'}</td>
                <td className="max-w-[340px] text-[12.5px] text-auth-text3">
                  {g.configured ? 'Payments are verified server-to-server before credits are added.' : <>Set <code className="font-mono text-auth-text2">AAMARPAY_STORE_ID</code>, <code className="font-mono text-auth-text2">AAMARPAY_SIGNATURE_KEY</code> and <code className="font-mono text-auth-text2">AAMARPAY_SANDBOX</code> on the API, then restart.</>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader title="Payment methods" right={<span className="text-[12.5px] text-auth-text3">What clients see on Buy credits</span>} />
        {methods.error ? <div className="p-4"><ErrorBanner message="Could not load methods." onRetry={() => void methods.reload()} /></div> : methods.loading && !methods.data ? <Skeleton className="m-4 h-24" /> : (
          <Table head={['Method', 'Account', 'Instructions', 'Fee', 'Approver', 'Enabled', '']}>
            {(methods.data ?? []).map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="flex items-center gap-2.5"><MethodLogo method={m} small /><b className="font-medium">{m.label}</b></div>
                </td>
                <td className="font-mono text-[12.5px]">
                  {m.isManual ? m.accountNumber ?? '—' : 'via aamarPay'}
                  {m.isManual && (m.bankName || m.accountName) && <div className="font-sans text-xs text-auth-text3">{[m.accountName, m.bankName, m.branch].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="max-w-[240px] text-[12.5px] text-auth-text3">{m.instructions ?? '—'}</td>
                <td className="font-mono">{m.feePercent ? `${m.feePercent}%` : '0'}</td>
                <td className="text-[12.5px] whitespace-nowrap text-auth-text3">{m.isManual ? 'Manager · admin over ৳10k' : 'Automatic'}</td>
                <td><Switch label={`Enable ${m.label}`} checked={m.isActive} onChange={(v) => void toggleMethod(m, v)} /></td>
                <td className="text-right"><Button variant="link" onClick={() => setMethodModal({ open: true, method: m })}>Edit</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Credit packs & pricing" right={<Button size="sm" onClick={() => setPackModal({ open: true, pack: null })}>Add pack</Button>} />
          {packs.error ? <div className="p-4"><ErrorBanner message="Could not load packs." onRetry={() => void packs.reload()} /></div> : (
            <Table head={['Pack', 'Credits', 'BDT', 'USD', 'Per URL', 'Sold 30d', 'Visible', '']}>
              {(packs.data ?? []).map((p) => (
                <tr key={p.id} className={p.isActive ? undefined : 'opacity-55'}>
                  <td className="whitespace-nowrap">{p.name}{p.isFeatured && <Pill tone="info" className="ml-1.5">Most popular</Pill>}</td>
                  <td className="font-mono">{fmtNumber(p.credits)}</td>
                  <td className="font-mono whitespace-nowrap">{fmtMoney(p.priceBdt)}</td>
                  <td className="font-mono">{fmtMoney(p.priceUsd, 'USD')}</td>
                  <td className="font-mono">৳{(p.priceBdt / p.credits).toFixed(2)}</td>
                  <td className="font-mono">{fmtNumber(p.sold30d)}</td>
                  <td><Switch label={`Show ${p.name}`} checked={Boolean(p.isActive)} onChange={(v) => void togglePack(p, v)} /></td>
                  <td className="text-right"><Button variant="link" onClick={() => setPackModal({ open: true, pack: p })}>Edit</Button></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Approval rules" right={<Pill tone="muted" dot={false}>Enforced by the API</Pill>} />
          <ul className="grid gap-0 px-4.5 py-2 text-[13px]">
            {[
              'Managers approve manual payments for their own clients only',
              'Payments over ৳10,000 need an admin or superadmin',
              'A transaction ID can only ever be used once',
              'Gateway payments are verified server-to-server before crediting',
              'Every approval and rejection is written to the audit log',
            ].map((r) => (
              <li key={r} className="flex items-start gap-2.5 border-t border-auth-line py-2.5 first:border-t-0">
                <span className="mt-0.5 text-auth-ok">✓</span>
                {r}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <MethodModal open={methodModal.open} method={methodModal.method} onClose={() => setMethodModal({ open: false, method: null })} onSaved={() => { setMethodModal({ open: false, method: null }); void methods.reload(); }} />
      <PackModal open={packModal.open} pack={packModal.pack} onClose={() => setPackModal({ open: false, pack: null })} onSaved={() => { setPackModal({ open: false, pack: null }); void packs.reload(); }} />
    </>
  );
}
