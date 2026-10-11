'use client';

import { useState } from 'react';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, Checkbox, EmptyState, ErrorBanner, Field, Input, Modal, Pill, Select, Skeleton, Table, useCopy } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { useAccount } from '@/lib/account-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import type { ApiKey } from '@/lib/api-types';
import { fmtDate, fmtNumber, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Scope = ApiKey['scopes'][number];

const SCOPES: { value: Scope; label: string; detail: string }[] = [
  { value: 'submit', label: 'Submit URLs', detail: 'POST /urls, /urls/resubmit · spends credits' },
  { value: 'status', label: 'Read status', detail: 'GET /urls, /urls/{id}' },
  { value: 'sites', label: 'Manage sites', detail: 'GET and POST /sites' },
];

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.foxindex.com'}/api/v1`;

const ENDPOINTS = [
  { method: 'POST', path: '/urls', detail: 'Submit up to 1,000 URLs per call · send an Idempotency-Key header to retry safely', cost: '1 credit / URL to Google' },
  { method: 'GET', path: '/urls', detail: 'Your URLs with status per engine · ?status=&siteId=&q=&limit=&offset=', cost: 'free' },
  { method: 'GET', path: '/urls/{id}', detail: 'One URL: status per engine, tries, errors, history', cost: 'free' },
  { method: 'POST', path: '/urls/resubmit', detail: 'Send URLs again by id (e.g. failed ones)', cost: '1 credit / URL to Google' },
  { method: 'GET', path: '/sites', detail: 'Your sites with URL counts', cost: 'free' },
  { method: 'POST', path: '/sites', detail: 'Add a site by domain', cost: 'free' },
];

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-auth-ok-soft text-auth-ok',
  POST: 'bg-auth-accent-soft text-auth-accent',
  DEL: 'bg-auth-bad-soft text-auth-bad',
};

function snippet(lang: 'curl' | 'node' | 'python' | 'php', site: string): string {
  const body = `{"site":"${site}","urls":["https://${site}/new-page"],"engines":["google","bing"]}`;
  switch (lang) {
    case 'curl':
      return `# Submit URLs (1 credit each to Google, other engines free)
curl -X POST ${API_BASE}/urls \\
  -H "Authorization: Bearer $FOXINDEX_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${body}'

# → 202 Accepted
{ "success": true, "data": { "batch": { "id": "…", "urlCount": 1, "creditsCharged": 1, "status": "queued" }, "balance": 4999 } }`;
    case 'node':
      return `const res = await fetch("${API_BASE}/urls", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.FOXINDEX_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${body}),
});
console.log(await res.json());`;
    case 'python':
      return `import os, requests

res = requests.post(
    "${API_BASE}/urls",
    headers={"Authorization": f"Bearer {os.environ['FOXINDEX_KEY']}"},
    json=${body.replace(/"google","bing"/, '"google", "bing"')},
    timeout=30,
)
print(res.json())`;
    case 'php':
      return `<?php
$ch = curl_init("${API_BASE}/urls");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("FOXINDEX_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => '${body}',
]);
echo curl_exec($ch);`;
  }
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span className="inline-flex h-4 w-12.5 items-end gap-0.5 align-middle" aria-hidden="true">
      {values.map((v, i) => (
        <i key={i} className={cn('flex-1 rounded-[1px]', i === values.length - 1 ? 'bg-auth-accent' : 'bg-auth-line2')} style={{ height: `${Math.max(10, (v / max) * 100)}%` }} />
      ))}
    </span>
  );
}

interface FormState {
  name: string;
  scopes: Scope[];
  siteId: string;
  cap: string;
  ips: string;
}

const EMPTY_FORM: FormState = { name: '', scopes: ['submit', 'status'], siteId: '', cap: '', ips: '' };

function KeyModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: ApiKey | null;
  onClose: () => void;
  onSaved: (plaintext: string | null) => void;
}) {
  const { profile } = useAccount();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);

  const openKey = open ? (editing?.id ?? 'new') : null;
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setError(null);
    setForm(
      editing
        ? { name: editing.name, scopes: editing.scopes, siteId: editing.siteId ?? '', cap: editing.monthlyCreditCap ? String(editing.monthlyCreditCap) : '', ips: editing.ipAllowlist.join(', ') }
        : EMPTY_FORM,
    );
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) return setError('Give the key a name.');
    if (form.scopes.length === 0) return setError('Pick at least one scope.');
    const cap = form.cap.replace(/\D/g, '');
    const payload = {
      name: form.name.trim(),
      scopes: form.scopes,
      siteId: form.siteId || null,
      monthlyCreditCap: cap ? Number(cap) : null,
      ipAllowlist: form.ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      if (editing) {
        await apiClient.patch(`/api-keys/${editing.id}`, payload);
        onSaved(null);
      } else {
        const created = await apiClient.post<ApiKey & { plaintext: string }>('/api-keys', payload);
        onSaved(created.plaintext);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const toggleScope = (scope: Scope, on: boolean) =>
    setForm((f) => ({ ...f, scopes: on ? [...f.scopes, scope] : f.scopes.filter((s) => s !== scope) }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit API key' : 'Create API key'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>{editing ? 'Save changes' : 'Create key'}</Button>
        </>
      }
    >
      <Field label="Name" hint="Something you'll recognise in the list and in logs.">
        <Input autoFocus placeholder="e.g. WordPress plugin — techbazar" value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label="Scopes">
        <div className="grid gap-2">
          {SCOPES.map((s) => (
            <div key={s.value} className="rounded-md border border-auth-line px-3 py-2.5">
              <Checkbox checked={form.scopes.includes(s.value)} onChange={(on) => toggleScope(s.value, on)}>
                {s.label}
                <small className="block text-xs text-auth-text3">{s.detail}</small>
              </Checkbox>
            </div>
          ))}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Restrict to site">
          <Select value={form.siteId} onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">All sites</option>
            {profile?.sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
          </Select>
        </Field>
        <Field label="Monthly credit cap" hint="Stops a runaway script from draining your balance.">
          <Input inputMode="numeric" placeholder="No cap" value={form.cap} onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value.replace(/\D/g, '') }))} />
        </Field>
      </div>
      <Field label="IP allow-list (optional)" hint="Comma-separated addresses or CIDR ranges. Leave empty to allow any IP." className="mb-0">
        <Input mono placeholder="203.0.113.10, 198.51.100.0/24" value={form.ips} onChange={(e) => setForm((f) => ({ ...f, ips: e.target.value }))} />
      </Field>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}

export default function ApiKeysPage() {
  const { profile } = useAccount();
  const { data, error, loading, reload } = useApi<{ keys: ApiKey[]; monthlyRequests: number; rateLimitPerMinute: number }>('/api-keys');
  const toast = useToast();
  const copy = useCopy();
  const [modal, setModal] = useState<{ open: boolean; editing: ApiKey | null }>({ open: false, editing: null });
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [lang, setLang] = useState<'curl' | 'node' | 'python' | 'php'>('curl');

  const keys = data?.keys ?? [];
  const active = keys.filter((k) => !k.revokedAt);
  const exampleSite = profile?.sites[0]?.domain ?? 'example.com';

  async function confirmRevoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await apiClient.delete(`/api-keys/${revoking.id}`);
      toast(`Revoked “${revoking.name}”`);
      setRevoking(null);
      void reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setRevokeBusy(false);
    }
  }

  return (
    <>
      <DashboardTopbar
        title="API keys"
        subtitle="Submit and check URLs from your own tools · same credits, same engines"
        search={false}
        action={
          <>
            <a href="#endpoints" className="hidden rounded-md border border-auth-line2 px-3.5 py-2 text-[13.5px] font-medium hover:bg-auth-surface2 sm:inline-block">API docs</a>
            <Button variant="primary" onClick={() => setModal({ open: true, editing: null })}>Create key</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          {newKey && (
            <div className="rounded-[10px] border border-auth-ok/35 bg-[linear-gradient(120deg,rgba(53,208,181,.10),transparent_60%)] p-4.5">
              <b className="mb-1.5 block font-medium text-auth-ok">New key created — copy it now</b>
              <p className="mb-3 text-[13px] text-auth-text2">For security we only show the full key once. If you lose it, revoke it and create another.</p>
              <div className="flex items-center gap-2 rounded-md border border-auth-line bg-auth-bg px-3 py-2.5 font-mono text-[13px]">
                <span className="min-w-0 flex-1 truncate" data-testid="new-api-key">{newKey}</span>
                <Button size="sm" onClick={async () => toast((await copy(newKey)) ? 'Key copied' : 'Copy failed', 'info')}>Copy</Button>
                <Button size="sm" variant="primary" onClick={() => setNewKey(null)}>I&apos;ve saved it</Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader title="Your keys" right={<span className="text-[12.5px] text-auth-text3">{active.length} active · {keys.length - active.length} revoked</span>} />
            {error ? (
              <div className="p-4"><ErrorBanner message="Could not load your API keys." onRetry={() => void reload()} /></div>
            ) : loading && !data ? (
              <div className="grid gap-2 p-4.5"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            ) : keys.length === 0 ? (
              <EmptyState title="No API keys yet" action={<Button variant="primary" onClick={() => setModal({ open: true, editing: null })}>Create your first key</Button>}>
                Keys let your scripts, CMS plugins and automations submit URLs with your credits.
              </EmptyState>
            ) : (
              <Table head={['Name', 'Key', 'Scopes', 'Requests · 7d', 'Last used', '']}>
                {keys.map((k) => (
                  <tr key={k.id} className={cn(k.revokedAt && 'opacity-50')}>
                    <td>
                      <b className="block font-medium whitespace-nowrap">{k.name}</b>
                      <small className="block text-xs whitespace-nowrap text-auth-text3">
                        {k.revokedAt
                          ? `Revoked ${fmtDate(k.revokedAt)}`
                          : [
                              `Created ${fmtDate(k.createdAt)}`,
                              k.siteDomain ? `restricted to ${k.siteDomain}` : 'all sites',
                              k.ipAllowlist.length ? 'IP allow-list on' : null,
                              k.monthlyCreditCap ? `cap ${fmtNumber(k.monthlyCreditCap)}/mo` : null,
                            ].filter(Boolean).join(' · ')}
                      </small>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2 font-mono text-[12.5px] whitespace-nowrap text-auth-text2">
                        {k.keyPrefix}…{k.keyLast4}
                        {!k.revokedAt && (
                          <button
                            aria-label="Copy key prefix"
                            className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-auth-line text-auth-text3 hover:text-auth-text"
                            onClick={async () => toast((await copy(`${k.keyPrefix}…${k.keyLast4}`)) ? 'Key prefix copied' : 'Copy failed', 'info')}
                          >
                            <Icon.copy className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex gap-1">
                        {k.scopes.map((s) => (
                          <i key={s} className="rounded-full bg-auth-surface2 px-1.75 py-0.5 font-mono text-[11px] text-auth-text2 not-italic">{s}</i>
                        ))}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {k.revokedAt ? <span className="font-mono text-auth-text3">—</span> : <><Sparkline values={k.usage7d} /> <span className="font-mono text-[12.5px] text-auth-text3">{fmtNumber(k.requests7d)}</span></>}
                    </td>
                    <td className="whitespace-nowrap text-auth-text3">{relativeTime(k.lastUsedAt)}</td>
                    <td className="text-right whitespace-nowrap">
                      {k.revokedAt ? (
                        <Pill tone="bad">Revoked</Pill>
                      ) : (
                        <>
                          <Button variant="link" onClick={() => setModal({ open: true, editing: k })}>Edit</Button>
                          <Button variant="link" className="ml-3 text-auth-bad!" onClick={() => setRevoking(k)}>Revoke</Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Webhooks" right={<Pill tone="muted" dot={false}>Coming soon</Pill>} />
            <p className="px-4.5 py-4 text-[13px] text-auth-text3">
              Get a POST to your server when a URL is indexed or fails. Until then, poll <span className="font-mono text-auth-text2">GET /v1/urls/&#123;id&#125;</span> — it&apos;s free.
            </p>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader title="Usage · this month" />
            <div className="grid grid-cols-3 gap-3 p-4.5">
              {[
                [fmtNumber(data?.monthlyRequests ?? 0), 'API requests'],
                [fmtNumber(active.length), 'active keys'],
                [fmtNumber(data?.rateLimitPerMinute ?? 600), 'requests / min'],
              ].map(([v, l]) => (
                <div key={l}>
                  <b className="block font-mono text-[22px] leading-none font-semibold tracking-tight">{v}</b>
                  <span className="mt-1.25 block text-xs text-auth-text3">{l}</span>
                </div>
              ))}
            </div>
            <div className="mx-4.5 mb-4.5">
              <div className="mb-1.5 flex justify-between text-[12.5px] text-auth-text3"><span>Rate limit · {fmtNumber(data?.rateLimitPerMinute ?? 600)} requests / min</span><span>per account</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-auth-surface2"><i className="block h-full rounded-full bg-auth-accent" style={{ width: '4%' }} /></div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Quick start" />
            <div className="p-4.5">
              <div className="overflow-hidden rounded-lg border border-auth-line bg-auth-bg">
                <div className="flex items-center gap-0.5 border-b border-auth-line px-2 py-1.5">
                  {(['curl', 'node', 'python', 'php'] as const).map((l) => (
                    <button key={l} onClick={() => setLang(l)} className={cn('rounded-[5px] px-2.5 py-1.25 text-[12.5px] capitalize', lang === l ? 'bg-auth-surface2 text-auth-text' : 'text-auth-text3')}>
                      {l === 'php' ? 'PHP' : l === 'curl' ? 'curl' : l}
                    </button>
                  ))}
                  <button
                    className="ml-auto rounded-[5px] border border-auth-line px-2 py-1 text-xs text-auth-text3 hover:text-auth-text"
                    onClick={async () => toast((await copy(snippet(lang, exampleSite))) ? 'Snippet copied' : 'Copy failed', 'info')}
                  >
                    Copy
                  </button>
                </div>
                <pre className="overflow-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-auth-text2">{snippet(lang, exampleSite)}</pre>
              </div>
            </div>
          </Card>

          <Card>
            <div id="endpoints" />
            <CardHeader title="Endpoints" right={<Pill tone="info" dot={false}>Public API · beta</Pill>} />
            <div className="grid gap-px bg-auth-line">
              {ENDPOINTS.map((e) => (
                <div key={e.method + e.path} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 bg-auth-surface px-4.5 py-2.5 text-[13px]">
                  <span className={cn('rounded py-0.5 text-center font-mono text-[11px] font-semibold', METHOD_TONE[e.method])}>{e.method}</span>
                  <span className="min-w-0 font-mono text-[12.5px]">
                    {e.path}
                    <small className="block font-sans text-xs text-auth-text3">{e.detail}</small>
                  </span>
                  <span className="text-[11.5px] whitespace-nowrap text-auth-text3">{e.cost}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <KeyModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
        onSaved={(plaintext) => {
          setModal({ open: false, editing: null });
          if (plaintext) setNewKey(plaintext);
          toast(plaintext ? 'API key created' : 'API key updated');
          void reload();
        }}
      />

      <Modal
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title="Revoke API key?"
        width={440}
        footer={
          <>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="danger" loading={revokeBusy} onClick={() => void confirmRevoke()}>Revoke key</Button>
          </>
        }
      >
        <p className="text-[13.5px] text-auth-text2">
          Anything using <b className="text-auth-text">{revoking?.name}</b> ({revoking?.keyPrefix}…{revoking?.keyLast4}) will start getting 401 errors immediately. This can&apos;t be undone.
        </p>
      </Modal>
    </>
  );
}
