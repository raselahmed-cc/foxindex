'use client';

/** Short two-tone chime generated with WebAudio — no asset to load, respects a mute toggle. */
let ctx: AudioContext | null = null;
let lastPlayed = 0;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem('fx-sound') !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem('fx-sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

export function playChime() {
  if (!soundEnabled() || Date.now() - lastPlayed < 1500) return;
  lastPlayed = Date.now();
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  } catch {
    /* audio blocked until the user interacts with the page */
  }
}

export function desktopPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function requestDesktopPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission;
}

/** Only when the tab is hidden — while the user is looking, the in-app UI is enough. */
export function showDesktop(title: string, body: string, opts: { tag?: string; onClick?: () => void } = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body: body.slice(0, 180), tag: opts.tag, icon: '/favicon.ico' });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch {
    /* some browsers require a service worker for notifications */
  }
}
