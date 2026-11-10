'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { desktopPermission, requestDesktopPermission } from '@/lib/notifier';

const KEY = 'fx-notify-prompt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Browser alerts only work once the person allows them, so ask once — with a
 * clear reason — instead of hiding the switch on the chat page. "Not now" waits a week.
 */
export function NotifyPrompt({ isClient }: { isClient: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(desktopPermission() === 'default' && !snoozed());
  }, []);

  if (!show) return null;

  function snooze() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div role="region" aria-label="Chat alerts" className="mt-3 mb-1 flex flex-wrap items-center gap-3 rounded-[10px] border border-auth-accent/35 bg-auth-accent-soft px-4 py-3 text-[13.5px] md:mt-4">
      <Icon.bell className="h-4 w-4 flex-shrink-0 text-auth-accent" />
      <span className="min-w-0 flex-1">
        <b className="font-medium">Get alerts for new chat messages</b>
        <span className="block text-[12.5px] text-auth-text2">
          {isClient ? 'Know the moment your account manager replies' : 'Know the moment a client or website visitor writes'}, even when FoxIndex is in another tab.
        </span>
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={snooze}>Not now</Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            void requestDesktopPermission().finally(() => setShow(false));
          }}
        >
          Turn on alerts
        </Button>
      </div>
    </div>
  );
}
