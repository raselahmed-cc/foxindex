'use client';

import { createContext, useContext, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-w-0 rounded-[10px] border border-auth-line bg-auth-surface', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, right, className }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 border-b border-auth-line px-4.5 py-3.25', className)}>
      <div className="min-w-0">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-auth-text3">{subtitle}</p>}
      </div>
      {right && <div className="flex min-w-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

const TONE: Record<Tone, string> = {
  ok: 'bg-auth-ok-soft text-auth-ok',
  info: 'bg-auth-accent-soft text-auth-accent',
  warn: 'bg-auth-warn-soft text-auth-warn',
  bad: 'bg-auth-bad-soft text-auth-bad',
  muted: 'bg-auth-surface2 text-auth-text2',
};

export function Pill({ tone = 'muted', children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.25 py-0.75 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'fox' | 'danger' | 'link';

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-auth-accent text-white hover:bg-auth-accent2',
  ghost: 'border border-auth-line2 text-auth-text hover:bg-auth-surface2',
  fox: 'bg-auth-fox-soft text-auth-fox hover:bg-auth-fox/20',
  danger: 'bg-auth-bad-soft text-auth-bad hover:bg-auth-bad/20',
  link: 'px-0! py-0! text-auth-accent hover:underline',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' ? 'px-2.5 py-1.25 text-[12.5px]' : size === 'lg' ? 'px-4 py-3 text-[14.5px]' : 'px-3.5 py-2 text-[13.5px]',
        BUTTON[variant],
        className,
      )}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, disabled, label, showLabel }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string; showLabel?: boolean }) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-auth-accent' : 'bg-auth-line2',
      )}
    >
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-4.5' : 'left-0.5')} />
    </button>
  );
  if (!showLabel) return control;
  // Visible text doubles as the accessible name; clicking it toggles the switch.
  return (
    <label className={cn('inline-flex items-start gap-2.5 text-[13px] leading-5 text-auth-text2', !disabled && 'cursor-pointer')}>
      {control}
      <span>{label}</span>
    </label>
  );
}

export function Avatar({ name, tone = 'accent', size = 32, className }: { name: string; tone?: 'accent' | 'fox' | 'violet' | 'muted'; size?: number; className?: string }) {
  const bg =
    tone === 'fox'
      ? 'bg-gradient-to-br from-auth-fox to-auth-warn text-[#1a1208]'
      : tone === 'violet'
        ? 'bg-gradient-to-br from-[#8B6BFF] to-[#D06BFF] text-white'
        : tone === 'muted'
          ? 'bg-auth-surface2 text-auth-text3'
          : 'bg-gradient-to-br from-auth-accent to-[#9B6BFF] text-white';
  return (
    <span
      className={cn('inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold', bg, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}

/** Lets Input/Select/Textarea pick up the id (and hint id) of the Field they sit in, so labels are properly associated. */
const FieldContext = createContext<{ id: string; describedBy?: string } | null>(null);

export function Field({ label, hint, error, right, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; right?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const hintId = error || hint ? `${id}-hint` : undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy: hintId }}>
      <div className={cn('mb-3.5', className)}>
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px] text-auth-text2">
          <label htmlFor={id}>{label}</label>
          {right}
        </div>
        {children}
        {error ? (
          <p id={hintId} className="mt-1.5 text-[12.5px] text-auth-bad">{error}</p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-[12.5px] text-auth-text3">{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldProps(id?: string, describedBy?: string) {
  const field = useContext(FieldContext);
  return { id: id ?? field?.id, 'aria-describedby': describedBy ?? field?.describedBy };
}

const INPUT =
  'w-full rounded-md border border-auth-line bg-auth-bg2 px-3 py-2.25 text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft disabled:opacity-60 read-only:bg-auth-surface read-only:text-auth-text3';

export function Input({ className, mono, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...useFieldProps(id, props['aria-describedby'])} className={cn(INPUT, mono && 'font-mono text-[12.5px]', className)} {...props} />;
}

export function Textarea({ className, mono, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea {...useFieldProps(id, props['aria-describedby'])} className={cn(INPUT, 'resize-y', mono && 'font-mono text-[12.5px]', className)} {...props} />;
}

export function Select({ className, children, id, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldProps = useFieldProps(id, props['aria-describedby']);
  return (
    <select {...fieldProps} className={cn(INPUT, 'appearance-none bg-[length:10px] bg-[right_14px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236C7789' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ checked, onChange, children, className }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-[13px]', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.75 w-3.75 flex-shrink-0 accent-auth-accent" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [onClose, open]);
}

export function Modal({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const id = useId();
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="fixed top-1/2 left-1/2 z-61 flex max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-auth-line bg-auth-surface shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-auth-line px-5 py-4">
          <h3 id={id} className="text-base font-semibold">{title}</h3>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="overflow-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-auth-line px-5 py-3.5">{footer}</div>}
      </div>
    </>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/50" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className="fixed top-0 right-0 bottom-0 z-61 flex w-[480px] max-w-full flex-col border-l border-auth-line bg-auth-surface shadow-[-30px_0_60px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-auth-line px-5.5 py-4">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle && <div className="text-[12.5px] text-auth-text3">{subtitle}</div>}
          </div>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 overflow-auto p-5.5">{children}</div>
        {footer && <div className="flex items-center justify-between gap-2.5 border-t border-auth-line px-5.5 py-3.5">{footer}</div>}
      </aside>
    </>
  );
}

export function Stat({ label, value, detail, detailTone, right }: { label: ReactNode; value: ReactNode; detail?: ReactNode; detailTone?: 'up' | 'down' | 'warn'; right?: ReactNode }) {
  return (
    <Card className="p-4.5">
      <div className="flex justify-between text-[12.5px] text-auth-text3">
        <span>{label}</span>
        {right}
      </div>
      <div className="mt-2 mb-1.5 font-mono text-[28px] leading-[1.1] font-semibold tracking-tight">{value}</div>
      {detail && (
        <div className={cn('text-[12.5px]', detailTone === 'up' ? 'text-auth-ok' : detailTone === 'down' ? 'text-auth-bad' : detailTone === 'warn' ? 'text-auth-warn' : 'text-auth-text3')}>
          {detail}
        </div>
      )}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-auth-surface2', className)} />;
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-[13.5px] text-auth-text3">
      <b className="text-[15px] font-medium text-auth-text">{title}</b>
      {children}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-auth-bad/35 bg-auth-bad-soft px-4 py-3 text-[13px] text-auth-bad">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-md border border-auth-line bg-auth-bg2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('rounded px-2.5 py-1.25 text-[12.5px] whitespace-nowrap', value === o.value ? 'bg-auth-surface2 text-auth-text' : 'text-auth-text3 hover:text-auth-text2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13.5px]', className)}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="border-b border-auth-line px-4.5 py-2.5 text-left text-xs font-medium whitespace-nowrap text-auth-text3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-auth-line [&_td]:px-4.5 [&_td]:py-2.75 [&_td]:align-middle [&_tr:hover_td]:bg-white/[0.015] [&_tr:last-child_td]:border-b-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function useCopy() {
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
}
