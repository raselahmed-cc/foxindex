'use client';

import { useState } from 'react';
import { Button, Pill, useCopy } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/use-api';
import { relativeTime } from '@/lib/format';
import type { SiteIndexNow } from '@/lib/tracking';

/** Save the key as <key>.txt containing only the key — exactly what IndexNow expects. */
function downloadKeyFile(key: string) {
  const url = URL.createObjectURL(new Blob([key], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${key}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Per-site IndexNow ownership check. Bing, Yandex, Naver, Seznam and Yep only act
 * on URLs from a site that hosts its key file, so this sits on every site card.
 */
export function IndexNowSetup({ siteId, domain, indexnow, onChanged }: { siteId: string; domain: string; indexnow: SiteIndexNow; onChanged: () => void }) {
  const toast = useToast();
  const copy = useCopy();
  const [checking, setChecking] = useState(false);
  const verified = Boolean(indexnow.verifiedAt);
  // Collapsed by default: with many sites, open setup steps would bury the stats.
  const [open, setOpen] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const r = await apiClient.post<{ verified: boolean; lastError: string | null }>(`/sites/${siteId}/indexnow/verify`);
      toast(r.verified ? `IndexNow verified for ${domain}` : 'Key file not found yet — see the details below', r.verified ? 'ok' : 'bad');
      if (r.verified) setOpen(false);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="border-b border-auth-line px-4.5 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[13px] font-medium">IndexNow</b>
        <span className="text-xs text-auth-text3">Bing, Yandex, Naver, Seznam, Yep</span>
        <span className="ml-auto flex items-center gap-2">
          {verified ? <Pill tone="ok">Verified</Pill> : <Pill tone="warn">Set up needed</Pill>}
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-auth-accent" aria-expanded={open}>
            {open ? 'Hide' : verified ? 'Details' : 'Set up'}
          </button>
        </span>
      </div>

      {open && (
        <div className="mt-3 text-[12.5px] text-auth-text2">
          {!verified && <p className="mb-2.5">These engines only accept URLs from a site that proves it’s yours. Put this small file on your site once:</p>}
          <ol className="grid min-w-0 list-decimal gap-2 pl-4.5">
            <li>
              <span className="mr-2">Download the key file</span>
              <Button size="sm" onClick={() => downloadKeyFile(indexnow.key)}><Icon.download className="h-3.5 w-3.5" /> {indexnow.key.slice(0, 8)}….txt</Button>
            </li>
            <li className="min-w-0">
              Upload it to the root of your site so it opens at:
              <div className="mt-1.5 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border border-auth-line bg-auth-bg px-2.5 py-1.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{indexnow.keyFileUrl}</code>
                <Button size="sm" className="flex-shrink-0" aria-label="Copy address" onClick={() => void copy(indexnow.keyFileUrl).then(() => toast('Copied'))}><Icon.copy className="h-3.5 w-3.5" /></Button>
              </div>
              <span className="mt-1 block text-[11.5px] text-auth-text3">WordPress: upload it with your host’s file manager or an FTP app into the same folder as wp-config.php.</span>
            </li>
            <li>
              <span className="mr-2">Check it</span>
              <Button size="sm" variant={verified ? 'ghost' : 'primary'} loading={checking} onClick={() => void check()}>{verified ? 'Check again' : 'Check now'}</Button>
            </li>
          </ol>
          {indexnow.lastError && !verified && <p role="alert" className="mt-2.5 rounded-md bg-auth-bad-soft px-2.5 py-2 text-auth-bad">{indexnow.lastError}</p>}
          {indexnow.checkedAt && <p className="mt-2 text-[11.5px] text-auth-text3">Last checked {relativeTime(indexnow.checkedAt)}{verified && indexnow.verifiedAt ? ` · verified ${relativeTime(indexnow.verifiedAt)}` : ''}</p>}
        </div>
      )}
    </div>
  );
}
