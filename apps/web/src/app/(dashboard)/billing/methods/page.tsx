'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, EmptyState, ErrorBanner, Field, Input, Modal, Pill, Select, Skeleton } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { MethodLogo } from '@/components/billing/purchase';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { CARD_FIELD_STYLE, loadPayPalSdk, type PayPalCardFields } from '@/lib/paypal-sdk';
import type { SavedMethod } from '@/lib/api-types';
import { cn } from '@/lib/utils';

interface PayPalConfig {
  enabled: boolean;
  clientId: string | null;
  sandbox: boolean;
}

const WALLET_TYPES = [
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'bank', label: 'Bank account' },
] as const;
type WalletType = (typeof WALLET_TYPES)[number]['value'];

function logoKey(m: SavedMethod): { type: string; network: string | null } {
  if (m.type === 'card') return { type: 'card', network: null };
  if (m.type === 'paypal') return { type: 'gateway', network: 'paypal' };
  return { type: m.type, network: m.type === 'bank' ? null : m.type };
}

function AddCardModal({ config, onClose, onSaved }: { config: PayPalConfig; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const fields = useRef<PayPalCardFields | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!config.clientId) return;
    loadPayPalSdk(config.clientId)
      .then(async (paypal) => {
        if (cancelled) return;
        const cardFields = paypal.CardFields({
          style: CARD_FIELD_STYLE,
          createVaultSetupToken: async () => (await apiClient.post<{ setupTokenId: string }>('/billing/paypal/vault', { kind: 'card' })).setupTokenId,
          onApprove: async ({ vaultSetupToken }) => {
            try {
              await apiClient.post('/billing/paypal/vault/confirm', { setupTokenId: vaultSetupToken });
              toast('Card saved');
              onSaved();
            } catch (e) {
              setError(errorMessage(e));
              setState('ready');
            }
          },
          onError: (e) => {
            setError(e instanceof Error && e.message ? e.message : 'PayPal could not check that card. Check the details and try again.');
            setState('ready');
          },
        });
        if (!cardFields.isEligible()) throw new Error('Card saving is not enabled on this PayPal account yet.');
        await Promise.all([
          cardFields.NameField({ placeholder: 'Name on card' }).render('#pp-card-name'),
          cardFields.NumberField({ placeholder: 'Card number' }).render('#pp-card-number'),
          cardFields.ExpiryField({ placeholder: 'MM / YY' }).render('#pp-card-expiry'),
          cardFields.CVVField({ placeholder: 'CVV' }).render('#pp-card-cvv'),
        ]);
        fields.current = cardFields;
        if (!cancelled) setState('ready');
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [config.clientId, onSaved, toast]);

  async function save() {
    if (!fields.current) return;
    setError(null);
    setState('saving');
    try {
      await fields.current.submit();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Check the card details and try again.');
      setState('ready');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a card"
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={state === 'saving'} disabled={state !== 'ready'} onClick={() => void save()}>Save card</Button>
        </>
      }
    >
      <p className="mb-3.5 text-[13px] text-auth-text2">
        Your card is stored securely by PayPal. FoxIndex never sees the full number — only the brand and last 4 digits.
        {config.sandbox && <span className="mt-1 block text-auth-warn">Test mode — use a PayPal sandbox test card.</span>}
      </p>
      {state === 'loading' && <Skeleton className="h-44" />}
      <div className={cn('grid gap-2', state === 'loading' && 'hidden')}>
        <div id="pp-card-name" className="min-h-11" />
        <div id="pp-card-number" className="min-h-11" />
        <div className="grid grid-cols-2 gap-2">
          <div id="pp-card-expiry" className="min-h-11" />
          <div id="pp-card-cvv" className="min-h-11" />
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-auth-bad">{error}</p>}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-auth-text3"><Icon.lock className="h-3.25 w-3.25" /> Secured by PayPal</p>
    </Modal>
  );
}

function AddWalletModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ type: 'bkash' as WalletType, accountNumber: '', label: '', bankName: '', accountName: '', isDefault: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bank = form.type === 'bank';

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiClient.post('/billing/saved-methods', {
        type: form.type,
        accountNumber: form.accountNumber.trim(),
        label: form.label.trim() || undefined,
        bankName: bank ? form.bankName.trim() || undefined : undefined,
        accountName: bank ? form.accountName.trim() || undefined : undefined,
        isDefault: form.isDefault,
      });
      toast('Payment details saved');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a wallet or bank account"
      width={460}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={form.accountNumber.trim().length < 4} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <p className="mb-3.5 text-[13px] text-auth-text2">Saved here, it’s filled in for you when you pay by bKash, Nagad, Rocket or bank transfer, so your manager can match the payment faster.</p>
      <Field label="Type">
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as WalletType })}>
          {WALLET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>
      <Field label={bank ? 'Account number' : 'Wallet number'}>
        <Input mono inputMode={bank ? 'text' : 'tel'} placeholder={bank ? 'e.g. 1501 2034 5678 901' : 'e.g. 01XXXXXXXXX'} maxLength={40} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
      </Field>
      {bank && (
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Bank name"><Input maxLength={80} placeholder="e.g. BRAC Bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></Field>
          <Field label="Account name"><Input maxLength={80} placeholder="Name on the account" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} /></Field>
        </div>
      )}
      <Field label={<>Nickname <span className="text-auth-text3">(optional)</span></>}>
        <Input maxLength={60} placeholder="e.g. Office bKash" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="accent-auth-accent" />
        Make this my default
      </label>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

function MethodRow({ m, onDefault, onRemove, busy }: { m: SavedMethod; onDefault: () => void; onRemove: () => void; busy: boolean }) {
  const title = m.label ?? m.display;
  const detail =
    m.type === 'card'
      ? `Expires ${m.expiry ? m.expiry.split('-').reverse().join('/') : '—'} · saved with PayPal`
      : m.type === 'paypal'
        ? `${m.display} · PayPal account`
        : m.type === 'bank'
          ? [m.bankName, m.accountName, m.display].filter(Boolean).join(' · ')
          : m.display;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-auth-line px-4.5 py-3.5 last:border-b-0">
      <MethodLogo method={logoKey(m)} />
      <div className="min-w-0 flex-1">
        <b className="flex items-center gap-2 text-[13.5px] font-medium">
          {title}
          {m.isDefault && <Pill tone="info">Default</Pill>}
        </b>
        <span className="block truncate font-mono text-[12px] text-auth-text3">{detail}</span>
      </div>
      <div className="flex gap-2">
        {!m.isDefault && <Button size="sm" disabled={busy} onClick={onDefault}>Make default</Button>}
        <Button size="sm" variant="danger" disabled={busy} onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}

function PaymentMethodsInner() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const list = useApi<SavedMethod[]>('/billing/saved-methods');
  const config = useApi<PayPalConfig>('/billing/paypal/config');
  const [modal, setModal] = useState<'card' | 'wallet' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [confirm, setConfirm] = useState<SavedMethod | null>(null);
  const handled = useRef(false);
  const { reload } = list;

  // Back from PayPal after approving a PayPal account to save.
  useEffect(() => {
    if (handled.current) return;
    const vault = params.get('vault');
    if (!vault) return;
    handled.current = true;
    const token = params.get('approval_token_id');
    router.replace('/billing/methods');
    if (vault === 'cancel' || !token) {
      toast('PayPal was not connected', 'info');
      return;
    }
    apiClient
      .post('/billing/paypal/vault/confirm', { setupTokenId: token })
      .then(() => {
        toast('PayPal account connected');
        void reload();
      })
      .catch((e) => toast(errorMessage(e), 'bad'));
  }, [params, router, toast, reload]);

  async function connectPayPal() {
    setConnecting(true);
    try {
      const res = await apiClient.post<{ approveUrl: string | null }>('/billing/paypal/vault', { kind: 'paypal' });
      if (!res.approveUrl) throw new Error('PayPal did not start the connection. Please try again.');
      window.location.assign(res.approveUrl);
    } catch (e) {
      toast(errorMessage(e), 'bad');
      setConnecting(false);
    }
  }

  async function act(id: string, run: () => Promise<unknown>, message: string) {
    setBusy(id);
    try {
      await run();
      toast(message);
      await reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  }

  const rows = list.data ?? [];
  const vaulted = rows.filter((m) => m.provider === 'paypal');
  const manual = rows.filter((m) => m.provider !== 'paypal');
  const paypalOn = config.data?.enabled === true;

  const section = (title: string, subtitle: string, items: SavedMethod[], actions: React.ReactNode, empty: string) => (
    <Card>
      <CardHeader title={title} subtitle={subtitle} right={actions} />
      {!list.data ? (
        <div className="p-4.5"><Skeleton className="h-14" /></div>
      ) : items.length === 0 ? (
        <p className="px-4.5 py-5 text-[13px] text-auth-text3">{empty}</p>
      ) : (
        items.map((m) => (
          <MethodRow
            key={m.id}
            m={m}
            busy={busy === m.id}
            onDefault={() => void act(m.id, () => apiClient.patch(`/billing/saved-methods/${m.id}`, { isDefault: true }), 'Default payment method updated')}
            onRemove={() => setConfirm(m)}
          />
        ))
      )}
    </Card>
  );

  return (
    <>
      <DashboardTopbar
        title="Payment methods"
        crumb={<><Link href="/billing" className="hover:text-auth-text2">Credits &amp; billing</Link> / Payment methods</>}
        search={false}
        action={<Link href="/billing/buy" className="rounded-md bg-auth-accent px-3.5 py-2 text-[13.5px] font-medium whitespace-nowrap text-white hover:bg-auth-accent2">Buy credits</Link>}
      />
      {list.error && <ErrorBanner message="Could not load your payment methods." onRetry={() => void reload()} />}
      <div className="grid max-w-[920px] gap-4">
        {section(
          'Cards and PayPal',
          paypalOn ? 'Saved securely with PayPal — pay for credits in one click (charged in USD)' : 'Available once PayPal is switched on for FoxIndex',
          vaulted,
          <div className="flex gap-2">
            <Button size="sm" disabled={!paypalOn} onClick={() => setModal('card')}>Add card</Button>
            <Button size="sm" disabled={!paypalOn} loading={connecting} onClick={() => void connectPayPal()}>Connect PayPal</Button>
          </div>,
          paypalOn ? 'No saved cards or PayPal accounts yet. You can also save one while paying with PayPal.' : 'Card and PayPal saving isn’t available yet.',
        )}
        {section(
          'Mobile wallets and bank accounts',
          'Filled in for you when you pay by bKash, Nagad, Rocket or bank transfer',
          manual,
          <Button size="sm" onClick={() => setModal('wallet')}>Add wallet or bank</Button>,
          'Nothing saved yet.',
        )}
        {list.data && rows.length === 0 && !list.error && (
          <EmptyState title="Save a payment method to top up faster">Saved methods appear as one-click options when you buy credits.</EmptyState>
        )}
        <p className="flex items-start gap-2 text-xs text-auth-text3">
          <Icon.lock className="mt-0.5 h-3.25 w-3.25 flex-shrink-0" />
          FoxIndex never stores card numbers. Cards and PayPal accounts are kept by PayPal; we keep only a reference and the last 4 digits.
        </p>
      </div>

      {modal === 'card' && config.data && <AddCardModal config={config.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); }} />}
      {modal === 'wallet' && <AddWalletModal onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); }} />}
      {confirm && (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title="Remove payment method?"
          width={420}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Keep it</Button>
              <Button
                variant="danger"
                loading={busy === confirm.id}
                onClick={() => {
                  const m = confirm;
                  void act(m.id, () => apiClient.delete(`/billing/saved-methods/${m.id}`), 'Payment method removed').then(() => setConfirm(null));
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="text-[13.5px] text-auth-text2">
            {confirm.label ?? confirm.display} will be removed{confirm.provider === 'paypal' ? ' from FoxIndex and from PayPal’s vault' : ''}. Past payments aren’t affected.
          </p>
        </Modal>
      )}
    </>
  );
}

export default function PaymentMethodsPage() {
  return (
    <Suspense>
      <PaymentMethodsInner />
    </Suspense>
  );
}
