'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, Skeleton, useCopy } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { useAccount } from '@/lib/account-context';
import { errorMessage, useApi } from '@/lib/use-api';
import { fmtDate, fmtNumber, relativeTime } from '@/lib/format';
import type { SiteRow } from '@/lib/tracking';

interface GoogleSetup {
  enabled: boolean;
  serviceAccountEmails: string[];
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.3 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4-13.6-9.7l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Google only accepts Indexing API calls from an Owner of the Search Console property. */
function GoogleAccessCard({ setup }: { setup: GoogleSetup | undefined }) {
  const copy = useCopy();
  const toast = useToast();
  if (!setup) return <Skeleton className="h-36" />;
  return (
    <Card className="p-4.5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-auth-surface2"><GoogleIcon className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <b className="block text-[14px] font-medium">Let FoxIndex submit to Google</b>
          {setup.enabled ? (
            <>
              <p className="mt-1 text-[13px] text-auth-text2">
                Google only accepts submissions from an owner of your site in Search Console. Add {setup.serviceAccountEmails.length === 1 ? 'this address' : 'these addresses'} once per site:
              </p>
              <div className="mt-2.5 grid gap-1.5">
                {setup.serviceAccountEmails.map((email) => (
                  <div key={email} className="flex items-center gap-2 rounded-md border border-auth-line bg-auth-bg px-3 py-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{email}</code>
                    <Button size="sm" onClick={() => void copy(email).then(() => toast('Copied'))}><Icon.copy className="h-3.5 w-3.5" /> Copy</Button>
                  </div>
                ))}
              </div>
              <ol className="mt-3 grid list-decimal gap-0.5 pl-4.5 text-[12.5px] text-auth-text2">
                <li>Open <a href="https://search.google.com/search-console/users" target="_blank" rel="noreferrer" className="text-auth-accent">Search Console → Settings → Users and permissions</a> for your site.</li>
                <li>Choose <b className="font-medium">Add user</b>, paste the address and set permission to <b className="font-medium">Owner</b>.</li>
                <li>That’s it — Google submissions for that site start working right away. Without it they fail and the credit is refunded.</li>
              </ol>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-auth-text2">Google submission is being set up by the FoxIndex team. Until then, URLs still go to Bing, Yandex, Naver, Seznam and Yep for free.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function SiteCard({ site, onRemove }: { site: SiteRow; onRemove: () => void }) {
  const c = site.counts;
  const accepted = c.submitted + c.indexed;
  return (
    <div className="flex flex-col rounded-[10px] border border-auth-line bg-auth-surface">
      <div className="flex items-center gap-3 border-b border-auth-line px-4.5 py-4">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-auth-surface2 text-sm font-semibold text-auth-text2 uppercase">{site.domain[0]}</span>
        <div className="min-w-0">
          <b className="block truncate font-mono text-sm font-medium">{site.domain}</b>
          <small className="text-[12.5px] text-auth-text3">Added {fmtDate(site.createdAt)} · {fmtNumber(c.total)} URLs</small>
        </div>
        {c.total === 0 && (
          <button onClick={onRemove} className="ml-auto rounded-md border border-auth-line2 px-2.5 py-1.5 text-xs text-auth-bad hover:bg-auth-surface2">Remove</button>
        )}
      </div>
      <div className="grid grid-cols-4 border-b border-auth-line">
        {[
          { n: fmtNumber(accepted), l: 'accepted' },
          { n: fmtNumber(c.queued), l: 'queued' },
          { n: fmtNumber(c.failed), l: 'failed' },
          { n: c.total ? `${Math.round((accepted / c.total) * 100)}%` : '—', l: 'success' },
        ].map((stat, i) => (
          <div key={stat.l} className={`px-4.5 py-3 ${i < 3 ? 'border-r border-auth-line' : ''}`}>
            <b className="block font-mono text-xl font-semibold tracking-tight">{stat.n}</b>
            <span className="text-xs text-auth-text3">{stat.l}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2.5 px-4.5 py-3 text-xs text-auth-text3">
        <span>{site.lastActivityAt ? `Last submission ${relativeTime(site.lastActivityAt)}` : 'Nothing submitted yet'}</span>
        <span className="flex gap-3">
          <Link href={`/submit?site=${site.id}`} className="text-auth-accent">Submit URLs</Link>
          {c.total > 0 && <Link href={`/urls?site=${site.id}`} className="text-auth-accent">View URLs →</Link>}
        </span>
      </div>
    </div>
  );
}

export default function SitesPage() {
  const toast = useToast();
  const { refreshProfile } = useAccount();
  const sites = useApi<SiteRow[]>('/sites');
  const setup = useApi<GoogleSetup>('/sites/google-setup');
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      const s = await apiClient.post<{ domain: string }>('/sites', { domain });
      toast(`${s.domain} added`);
      setDomain('');
      setAdding(false);
      void sites.reload();
      void refreshProfile();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(site: SiteRow) {
    if (!window.confirm(`Remove ${site.domain}?`)) return;
    try {
      await apiClient.delete(`/sites/${site.id}`);
      toast(`${site.domain} removed`, 'info');
      void sites.reload();
      void refreshProfile();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  const list = sites.data ?? [];

  return (
    <>
      <DashboardTopbar
        title="Sites"
        subtitle={sites.data ? `${list.length} site${list.length === 1 ? '' : 's'} · sites are created automatically when you submit URLs` : 'Your domains'}
        search={false}
        action={<Button variant="primary" onClick={() => setAdding(true)}>Add a site</Button>}
      />

      <div className="grid gap-4">
        <GoogleAccessCard setup={setup.data} />

        {sites.error ? (
          <ErrorBanner message="Could not load your sites." onRetry={() => void sites.reload()} />
        ) : !sites.data ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        ) : list.length === 0 ? (
          <Card>
            <EmptyState title="No sites yet" action={<Link href="/submit" className="rounded-md bg-auth-accent px-3.5 py-2 text-sm font-medium text-white">Submit URLs</Link>}>
              Adding a site is optional — submit any URL and its site appears here with its stats.
            </EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {list.map((site) => <SiteCard key={site.id} site={site} onRemove={() => void remove(site)} />)}
          </div>
        )}
      </div>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a site"
        width={440}
        footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!domain.trim()} onClick={() => void add()}>Add site</Button></>}
      >
        <Field label="Domain" hint="Optional — sites are also created automatically when you submit URLs." error={error}>
          <Input autoFocus mono placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && domain.trim() && void add()} />
        </Field>
      </Modal>
    </>
  );
}
