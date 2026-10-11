'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'bad' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'bad' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-[13.5px] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)] ${
              t.tone === 'bad'
                ? 'border-auth-bad/40 bg-[#2a151a] text-auth-bad'
                : t.tone === 'info'
                  ? 'border-auth-line2 bg-auth-surface2 text-auth-text'
                  : 'border-auth-ok/40 bg-[#10241f] text-auth-ok'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
