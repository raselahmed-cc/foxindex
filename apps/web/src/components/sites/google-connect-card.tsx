'use client';

import { useState, type ReactNode } from 'react';
import { Button, Card, Pill, Skeleton } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/use-api';
import { relativeTime } from '@/lib/format';
import { propertyLabel, type GoogleConnections } from '@/lib/google-connect';

/**
 * One-click Google: the customer signs in with the Google account that owns their
 * sites in Search Console and FoxIndex submits + checks their URLs with that access.
 */
export function GoogleConnectCard({ data, onChanged, icon, fallback }: { data: GoogleConnections | undefined; onChanged: () => void; icon: ReactNode; fallback: ReactNode }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  async function connect() {
    setBusy('connect');
    try {
      const { url } = await apiClient.post<{ url: string }>('/google/connect');
      window.location.assign(url);
    } catch (e) {
      toast(errorMessage(e), 'bad');
      setBusy(null);
    }
  }

  async function act(id: string, run: () => Promise<unknown>, message: string) {
    setBusy(id);
    try {
      await run();
      toast(message);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <Skeleton className="h-36" />;
  const connections = data.connections;

  return (
    <Card className="p-4.5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-auth-surface2">{icon}</span>
        <div className="min-w-0 flex-1">
          <b className="block text-[14px] font-medium">Google instant indexing</b>
          <p className="mt-1 text-[13px] text-auth-text2">
            Sign in with the Google account that owns your sites in Search Console. FoxIndex then sends your URLs to Google instantly and shows whether each one is indexed — no files or settings to change.
          </p>
        </div>
        {data.available && (
          <Button variant={connections.length ? 'ghost' : 'primary'} loading={busy === 'connect'} onClick={() => void connect()}>
            {connections.length ? 'Connect another account' : 'Connect Google Search Console'}
          </Button>
        )}
      </div>

      {!data.available && <p className="mt-3 text-[12.5px] text-auth-text3">One-click Google sign-in is being set up by the FoxIndex team.</p>}

      {connections.length > 0 && (
        <div className="mt-4 grid gap-2.5">
          {connections.map((c) => (
            <div key={c.id} className="rounded-lg border border-auth-line bg-auth-bg px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <b className="min-w-0 truncate text-[13.5px] font-medium">{c.email}</b>
                {c.status === 'active' ? <Pill tone="ok">Connected</Pill> : <Pill tone="bad">Access removed</Pill>}
                <span className="ml-auto flex gap-2">
                  <Button size="sm" loading={busy === c.id} onClick={() => void act(c.id, () => apiClient.post(`/google/connections/${c.id}/refresh`), 'Site list updated from Search Console')}>Refresh sites</Button>
                  <Button size="sm" variant="danger" disabled={busy === c.id} onClick={() => window.confirm(`Disconnect ${c.email}? FoxIndex will stop submitting to Google for its sites.`) && void act(c.id, () => apiClient.delete(`/google/connections/${c.id}`), 'Google account disconnected')}>Disconnect</Button>
                </span>
              </div>
              {c.lastError && <p className="mt-1.5 text-[12.5px] text-auth-bad">{c.lastError}</p>}
              {c.owned.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.owned.map((p) => <span key={p} className="rounded-full bg-auth-ok-soft px-2.5 py-0.5 font-mono text-[11.5px] text-auth-ok">{propertyLabel(p)}</span>)}
                </div>
              ) : (
                <p className="mt-1.5 text-[12.5px] text-auth-warn">This account doesn’t own any site in Search Console yet. Add your site in Search Console, then click Refresh sites.</p>
              )}
              {c.notOwned.length > 0 && (
                <p className="mt-1.5 text-[11.5px] text-auth-text3">
                  Not usable (you need Owner access in Search Console): {c.notOwned.map((p) => propertyLabel(p.siteUrl)).join(', ')}
                </p>
              )}
              <p className="mt-1.5 text-[11.5px] text-auth-text3">Connected {relativeTime(c.connectedAt)}{c.refreshedAt ? ` · sites checked ${relativeTime(c.refreshedAt)}` : ''}</p>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setShowFallback((v) => !v)} className="mt-3 text-[12.5px] text-auth-accent" aria-expanded={showFallback}>
        {showFallback ? 'Hide the other option' : 'Prefer not to sign in? Other option'}
      </button>
      {showFallback && <div className="mt-2 border-t border-auth-line pt-3">{fallback}</div>}
    </Card>
  );
}
