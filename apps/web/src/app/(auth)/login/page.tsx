'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, ApiError } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth-store';
import { FoxLogo } from '@/components/fox-logo';

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; email: string; role: string; status: string };
}

const FEED_ROWS = [
  { url: 'techbazar.com.bd/laptops/lenovo-ideapad-slim-5', pill: 'ok' as const, label: 'Indexed', time: '2h 14m' },
  { url: 'dhakafoodie.net/best-biryani-mirpur', pill: 'ok' as const, label: 'Indexed', time: '3h 40m' },
  { url: 'hostpro.io/blog/nginx-vs-litespeed', pill: 'info' as const, label: 'Submitted', time: '12m' },
  { url: 'shopnear.my/product/wireless-earbuds-x3', pill: 'warn' as const, label: 'Queued', time: 'now' },
];

const PILL_CLASSES = {
  ok: 'bg-auth-ok-soft text-auth-ok',
  info: 'bg-auth-accent-soft text-auth-accent',
  warn: 'bg-auth-warn-soft text-auth-warn',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiClient.post<LoginResponse>('/auth/login', { email: normalizedEmail, password, remember });
      setAccessToken(result.accessToken);
      router.push('/');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { message: e.message, reason: (e.details as { reason?: string } | undefined)?.reason }
          : { message: 'Could not sign in. Check your connection and try again.' },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-auth-bg text-auth-text md:grid-cols-[1.1fr_1fr]">
      {/* Left: brand + illustrative activity feed (example data, not a live account) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-auth-line bg-auth-bg2 p-11 md:flex">
        <div className="pointer-events-none absolute -right-52 -bottom-72 h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(242,140,59,.10),transparent_70%)]" />

        <a href="#" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <FoxLogo className="h-7 w-7" />
          FoxIndex
        </a>

        <div>
          <h1 className="mb-3.5 max-w-[16ch] text-4xl leading-[1.12] font-semibold tracking-tight text-balance">
            Your pages, in Google by morning.
          </h1>
          <p className="max-w-[44ch] text-base text-auth-text2">
            Submit URLs once. FoxIndex pushes them to Google, Bing, Yandex and the other major engines, then keeps checking until
            each one is live.
          </p>

          <div className="mt-8 max-w-[560px] overflow-hidden rounded-2xl border border-auth-line bg-auth-bg shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between border-b border-auth-line px-4 py-2.5 text-[13px] text-auth-text2">
              <span>Submissions · example activity</span>
              <span className="flex items-center gap-1.5 text-auth-ok">
                <span className="h-1.5 w-1.5 animate-[auth-pulse_2s_infinite] rounded-full bg-auth-ok shadow-[0_0_0_4px_var(--color-auth-ok-soft)]" />
                Live
              </span>
            </div>
            {FEED_ROWS.map((row) => (
              <div
                key={row.url}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3.5 border-b border-auth-line px-4 py-2.5 font-mono text-[12.5px] last:border-b-0"
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{row.url}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium before:h-1.5 before:w-1.5 before:rounded-full before:bg-current ${PILL_CLASSES[row.pill]}`}>
                  {row.label}
                </span>
                <span className="text-xs text-auth-text3">{row.time}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 flex gap-6 text-[13px] text-auth-text3">
            <div>
              <b className="block text-[22px] font-semibold tracking-tight text-auth-text">1,284</b>
              submitted today
            </div>
            <div>
              <b className="block text-[22px] font-semibold tracking-tight text-auth-text">91%</b>
              indexed in 24h
            </div>
            <div>
              <b className="block text-[22px] font-semibold tracking-tight text-auth-text">6</b>
              search engines
            </div>
          </div>
        </div>

        <div className="flex gap-4.5 text-[13px] text-auth-text3">
          <span>© 2026 FoxIndex</span>
          <a href="#" className="hover:text-auth-text">
            Status
          </a>
          <a href="#" className="hover:text-auth-text">
            Privacy
          </a>
          <a href="#" className="hover:text-auth-text">
            Help
          </a>
        </div>
      </aside>

      {/* Right: form */}
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[400px]">
          <a href="#" className="mb-7 flex items-center gap-2.5 text-[17px] font-semibold tracking-tight md:hidden">
            <FoxLogo className="h-7 w-7" />
            FoxIndex
          </a>

          <h2 className="mb-1.5 text-[26px] font-semibold tracking-tight">Welcome back</h2>
          <p className="mb-7 text-auth-text2">Log in to submit URLs and check what&apos;s indexed.</p>

          {error?.reason === 'PENDING_APPROVAL' ? (
            <div role="status" className="mb-4.5 rounded-md border border-auth-warn/30 bg-auth-warn-soft px-3 py-2.5 text-[13.5px] text-auth-warn">
              <b className="block font-medium">Your account is awaiting approval</b>
              Your email is verified and an account manager is reviewing your details — usually within a few hours on working days. We&apos;ll email you when
              you&apos;re approved.
            </div>
          ) : error?.reason === 'EMAIL_NOT_VERIFIED' ? (
            <div role="alert" className="mb-4.5 rounded-md border border-auth-warn/30 bg-auth-warn-soft px-3 py-2.5 text-[13.5px] text-auth-warn">
              <b className="block font-medium">Verify your email first</b>
              Enter the 6-digit code we emailed you.{' '}
              <Link href={`/verify-email?email=${encodeURIComponent(normalizedEmail)}`} className="underline">
                Verify now or get a new code
              </Link>
            </div>
          ) : error ? (
            <div role="alert" className="mb-4.5 rounded-md border border-auth-bad/30 bg-auth-bad-soft px-3 py-2.5 text-[13.5px] text-auth-bad">
              {error.message}
              {error.reason === 'ACCOUNT_SUSPENDED' && (
                <>
                  {' '}
                  <a href="mailto:support@foxindex.dev" className="underline">Contact support</a>
                </>
              )}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="mb-4">
              <label htmlFor="email" className="mb-1.5 block text-[13px] text-auth-text2">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-auth-line bg-auth-bg2 px-3 py-2.5 text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft"
              />
            </div>

            <div className="mb-1">
              <div className="mb-1.5 flex justify-between text-[13px] text-auth-text2">
                <label htmlFor="password">Password</label>
                <span className="cursor-not-allowed text-auth-text3" title="Password reset isn't built yet">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-auth-line bg-auth-bg2 px-3 py-2.5 pr-14 text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 px-1.5 py-1 text-[12.5px] text-auth-text3 hover:text-auth-text"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <label className="my-4 flex items-center gap-2 text-sm text-auth-text2">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-auth-accent" />
              Keep me logged in on this device
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-auth-accent py-3 text-[15px] font-medium text-white transition-colors hover:bg-auth-accent2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <div className="my-5.5 flex items-center gap-3 text-[12.5px] text-auth-text3">
            <span className="h-px flex-1 bg-auth-line" />
            or
            <span className="h-px flex-1 bg-auth-line" />
          </div>

          <button
            type="button"
            disabled
            title="Coming soon"
            className="flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-md border border-auth-line2 py-2.5 text-sm font-medium opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6C12.3 13.5 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.3 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4-13.6-9.7l-7.8 6C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google — coming soon
          </button>

          <p className="mt-6.5 text-center text-sm text-auth-text2">
            New to FoxIndex?{' '}
            <Link href="/signup" className="text-auth-accent">
              Create an account
            </Link>
          </p>

          <div className="mt-8 flex items-center gap-3 rounded-[10px] border border-auth-line p-3.5 text-[13px] text-auth-text2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-auth-fox to-auth-warn text-xs font-semibold text-[#1a1208]">
              FI
            </span>
            <div>
              <b className="block font-medium text-auth-text">Locked out or waiting on approval?</b>
              Your account manager can help once you&apos;re assigned one.
            </div>
            <a href="mailto:support@foxindex.dev" className="ml-auto shrink-0 whitespace-nowrap text-auth-ok">
              Contact support
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
