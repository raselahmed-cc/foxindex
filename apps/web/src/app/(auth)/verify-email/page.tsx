'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FoxLogo } from '@/components/fox-logo';
import { apiClient, ApiError } from '@/lib/api-client';

const FIELD =
  'w-full rounded-md border border-auth-line bg-auth-bg2 px-3 py-2.5 text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft';

function Steps({ step }: { step: 2 | 3 }) {
  return (
    <>
      <div className="mb-2 flex justify-between text-[12.5px] text-auth-text3">
        <span>Your details</span>
        <b className={step === 2 ? 'font-medium text-auth-text' : 'font-normal'}>Verify email</b>
        <b className={step === 3 ? 'font-medium text-auth-text' : 'font-normal'}>Manager approval</b>
      </div>
      <div className="mb-6.5 flex gap-1.5">
        <span className="h-[3px] flex-1 rounded-sm bg-auth-accent" />
        <span className="h-[3px] flex-1 rounded-sm bg-auth-accent" />
        <span className={`h-[3px] flex-1 rounded-sm ${step === 3 ? 'bg-auth-accent' : 'bg-auth-line2'}`} />
      </div>
    </>
  );
}

function VerifyEmailForm() {
  const params = useSearchParams();
  const initialEmail = params.get('email') ?? '';
  const mailFailed = params.get('mail') === 'failed';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mailError] = useState(mailFailed);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // done=1: this server has no email step, so signup went straight to manager approval.
  const [verified, setVerified] = useState<null | 'pending_approval' | 'active'>(params.get('done') === '1' ? 'pending_approval' : null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const normalizedEmail = email.trim().toLowerCase();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const r = await apiClient.post<{ status: string }>('/auth/verify-email', { email: normalizedEmail, code });
      setVerified(r.status === 'active' ? 'active' : 'pending_approval');
    } catch (e) {
      const reason = e instanceof ApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      setError(e instanceof ApiError ? e.message : 'Could not verify your email');
      if (reason === 'VERIFICATION_CODE_LOCKED') setCode('');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const r = await apiClient.post<{ cooldownSeconds: number }>('/auth/resend-verification', { email: normalizedEmail });
      setCooldown(r.cooldownSeconds);
      setCode('');
      setNotice(`If ${normalizedEmail} has an unverified account, a new code is on its way. Earlier codes no longer work.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send a new code');
      const m = e instanceof ApiError ? /(\d+) seconds/.exec(e.message) : null;
      if (m) setCooldown(Number(m[1]));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-auth-bg px-6 py-10 text-auth-text">
      <div className="w-full max-w-[440px]">
        <Link href="/login" className="mb-8 flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <FoxLogo className="h-7 w-7" />
          FoxIndex
        </Link>

        {verified ? (
          <>
            <Steps step={3} />
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-auth-ok-soft text-lg text-auth-ok" aria-hidden="true">✓</div>
            <h1 className="mb-1.5 text-[26px] font-semibold tracking-tight">{params.get('done') === '1' ? 'Account created' : 'Email verified'}</h1>
            {verified === 'active' ? (
              <p className="mb-6.5 text-auth-text2">Your account is already active. You can log in now.</p>
            ) : (
              <>
                <p className="mb-5 text-auth-text2">
                  Your account is now with an account manager for approval — usually within a few hours on working days. We&apos;ll email you, and your manager may
                  message you on WhatsApp.
                </p>
                <div className="mb-6.5 rounded-[10px] border border-auth-line p-3.5 text-[13px] text-auth-text2">
                  <b className="mb-1 block font-medium text-auth-text">While you wait</b>
                  Logging in shows “awaiting approval” until your manager approves you. Once approved you get 100 free credits.
                </div>
              </>
            )}
            <Link href="/login" className="block w-full rounded-md bg-auth-accent py-3 text-center text-[15px] font-medium text-white hover:bg-auth-accent2">
              Go to log in
            </Link>
          </>
        ) : (
          <>
            <Steps step={2} />
            <h1 className="mb-1.5 text-[26px] font-semibold tracking-tight">Check your email</h1>
            <p className="mb-6.5 text-auth-text2">
              {initialEmail ? (
                <>
                  We sent a 6-digit code to <b className="font-medium text-auth-text">{initialEmail}</b>. It expires in 15 minutes.
                </>
              ) : (
                'Enter the email you signed up with and the 6-digit code we sent you.'
              )}
            </p>

            {mailError && !error && !notice && (
              <div role="status" className="mb-4.5 rounded-md border border-auth-warn/30 bg-auth-warn-soft px-3 py-2.5 text-[13.5px] text-auth-warn">
                Your account was created, but we couldn&apos;t send the code just now. Use <b className="font-medium">send a new code</b> below in a minute.
              </div>
            )}
            {error && (
              <div role="alert" className="mb-4.5 rounded-md border border-auth-bad/30 bg-auth-bad-soft px-3 py-2.5 text-[13.5px] text-auth-bad">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="mb-4.5 rounded-md border border-auth-ok/30 bg-auth-ok-soft px-3 py-2.5 text-[13.5px] text-auth-ok">
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col">
              {!initialEmail && (
                <div className="mb-4">
                  <label htmlFor="email" className="mb-1.5 block text-[13px] text-auth-text2">Email</label>
                  <input id="email" type="email" required autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
                </div>
              )}
              <div className="mb-5">
                <label htmlFor="code" className="mb-1.5 block text-[13px] text-auth-text2">Verification code</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`${FIELD} text-center font-mono text-xl tracking-[0.5em] placeholder:font-sans placeholder:text-base placeholder:tracking-normal`}
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6 || !normalizedEmail}
                className="w-full rounded-md bg-auth-accent py-3 text-[15px] font-medium text-white transition-colors hover:bg-auth-accent2 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {loading ? 'Verifying…' : 'Verify email'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-auth-text2">
              Didn&apos;t get it? Check spam, or{' '}
              <button type="button" onClick={() => void resend()} disabled={resending || cooldown > 0 || !normalizedEmail} className="text-auth-accent disabled:cursor-not-allowed disabled:text-auth-text3">
                {resending ? 'sending…' : cooldown > 0 ? `send a new code in ${cooldown}s` : 'send a new code'}
              </button>
              .
            </p>
            <p className="mt-2 text-center text-[13px] text-auth-text3">
              Wrong email? <Link href="/signup" className="text-auth-accent">Start again</Link> with a different address.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
