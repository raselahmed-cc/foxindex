import type { ReactNode } from 'react';

function Svg({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { className?: string };

export const Icon = {
  chart: (p: P) => <Svg {...p}><path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" /></Svg>,
  clock: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></Svg>,
  tag: (p: P) => <Svg {...p}><path d="M2.5 2.5h5l6 6-5 5-6-6v-5z" /><circle cx="5.5" cy="5.5" r="1" /></Svg>,
  merge: (p: P) => <Svg {...p}><path d="M4 2v4c0 2 1.5 3 4 3s4 1 4 3v2M12 2v2M4 14v-2" /><path d="M10 12.5l2 2 2-2" /></Svg>,
  download: (p: P) => <Svg {...p}><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" /></Svg>,
  star: (p: P) => <Svg {...p}><path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5L8 2z" /></Svg>,
  eye: (p: P) => <Svg {...p}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></Svg>,
  macro: (p: P) => <Svg {...p}><path d="M3 3h10v7H8l-3 3v-3H3V3z" /><path d="M6 6.5h4" /></Svg>,
  grid: (p: P) => <Svg {...p}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></Svg>,
  upload: (p: P) => <Svg {...p}><path d="M8 13V3M4 7l4-4 4 4" /></Svg>,
  list: (p: P) => <Svg {...p}><path d="M3 4h10M3 8h10M3 12h7" /></Svg>,
  globe: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></Svg>,
  ticket: (p: P) => <Svg {...p}><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M5 7h6M5 10h4" /></Svg>,
  chat: (p: P) => <Svg {...p}><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 3v-3H3a1 1 0 01-1-1V4a1 1 0 011-1z" /></Svg>,
  card: (p: P) => <Svg {...p}><rect x="2" y="4" width="12" height="9" rx="1.5" /><path d="M2 7h12" /></Svg>,
  key: (p: P) => <Svg {...p}><path d="M9 3l4 4-4 4M13 7H3" /></Svg>,
  gear: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></Svg>,
  user: (p: P) => <Svg {...p}><circle cx="8" cy="6" r="3" /><path d="M2 14c1-3 3-4 6-4s5 1 6 4" /></Svg>,
  users: (p: P) => <Svg {...p}><circle cx="5.5" cy="6" r="2.5" /><circle cx="11" cy="7" r="2" /><path d="M1.5 13c.5-2.5 2-3.5 4-3.5s3.5 1 4 3.5M9.5 13c.3-1.5 1-2.3 2-2.3s1.8.8 2 2.3" /></Svg>,
  check: (p: P) => <Svg {...p}><path d="M3 8l3 3 7-7" /></Svg>,
  bolt: (p: P) => <Svg {...p}><path d="M9 2L3 9h5l-1 5 6-7H8l1-5z" /></Svg>,
  coin: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 5v6M6.5 6.5h2.2a1.2 1.2 0 010 2.4H6.8" /></Svg>,
  lock: (p: P) => <Svg {...p}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 016 0v2" /></Svg>,
  shield: (p: P) => <Svg {...p}><path d="M8 2l5 2v4c0 3.3-2.1 5.7-5 6.5-2.9-.8-5-3.2-5-6.5V4l5-2z" /></Svg>,
  bell: (p: P) => <Svg {...p}><path d="M4 11V7a4 4 0 018 0v4l1 1H3l1-1zM6.5 13.5a1.5 1.5 0 003 0" /></Svg>,
  copy: (p: P) => <Svg {...p}><rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" /></Svg>,
  arrowRight: (p: P) => <Svg {...p}><path d="M2 8h11M9 4l4 4-4 4" /></Svg>,
  info: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="6" /><path d="M8 5v4M8 11h.01" /></Svg>,
  monitor: (p: P) => <Svg {...p}><rect x="2" y="3" width="12" height="8" rx="1.5" /><path d="M5 14h6" /></Svg>,
  phone: (p: P) => <Svg {...p}><rect x="4" y="1.5" width="8" height="13" rx="1.5" /><path d="M7 12.5h2" /></Svg>,
  clip: (p: P) => <Svg {...p}><path d="M10 5L5.5 9.5a1.5 1.5 0 002 2L12 7a3 3 0 00-4-4L4 7a4.5 4.5 0 006 6" /></Svg>,
  drag: (p: P) => <Svg {...p}><path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" strokeWidth="2.2" strokeLinecap="round" /></Svg>,
  whatsapp: ({ className = 'h-4 w-4' }: P) => (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 1a7 7 0 00-6 10.5L1 15l3.6-1A7 7 0 108 1zm0 12.7a5.7 5.7 0 01-2.9-.8l-.2-.1-2.1.6.6-2-.1-.2A5.7 5.7 0 118 13.7zm3.1-4.2c-.2-.1-1-.5-1.2-.6-.2-.1-.3-.1-.4.1l-.5.7c-.1.1-.2.1-.4 0a4.6 4.6 0 01-2.3-2c-.2-.3.2-.3.5-.9.1-.1 0-.2 0-.3l-.5-1.3c-.1-.3-.3-.3-.4-.3h-.3a.7.7 0 00-.5.2 2 2 0 00-.6 1.5c0 .9.6 1.7.7 1.8.1.1 1.3 2 3.1 2.7 1.2.5 1.6.5 2.2.4.4-.1 1-.4 1.2-.9.1-.4.1-.8.1-.9l-.4-.2z" />
    </svg>
  ),
  google: ({ className = 'h-4 w-4' }: P) => (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.3 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4-13.6-9.7l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  ),
};

export type IconName = keyof typeof Icon;
