'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FoxLogo } from '@/components/fox-logo';
import { ReviewSpotlight } from '@/components/marketing/customer-reviews';
import { COUNTRIES } from '@/lib/countries';
import { apiClient, ApiError } from '@/lib/api-client';

const DIAL_CODES = [
  { flag: '🇧🇩', code: '+880', label: 'Bangladesh' },
  { flag: '🇲🇾', code: '+60', label: 'Malaysia' },
  { flag: '🇮🇳', code: '+91', label: 'India' },
  { flag: '🇵🇰', code: '+92', label: 'Pakistan' },
  { flag: '🇳🇵', code: '+977', label: 'Nepal' },
  { flag: '🇦🇪', code: '+971', label: 'United Arab Emirates' },
  { flag: '🇸🇦', code: '+966', label: 'Saudi Arabia' },
  { flag: '🇸🇬', code: '+65', label: 'Singapore' },
  { flag: '🇮🇩', code: '+62', label: 'Indonesia' },
  { flag: '🇺🇸', code: '+1', label: 'United States / Canada' },
  { flag: '🇬🇧', code: '+44', label: 'United Kingdom' },
  { flag: '🇦🇺', code: '+61', label: 'Australia' },
];

const PERKS = [
  { bold: 'Google + 5 more search engines', rest: 'from a single submission' },
  { bold: 'A real account manager', rest: 'on live chat and WhatsApp' },
  { bold: 'Pay with bKash, Nagad, cards or crypto', rest: '— credits never expire' },
];

const FIELD =
  'w-full rounded-md border border-auth-line bg-auth-bg2 px-3 py-2.5 text-auth-text outline-none placeholder:text-auth-text3 focus:border-auth-accent focus:ring-3 focus:ring-auth-accent-soft';

function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

/** Dial code + national number → +E.164. Drops the trunk "0" people type locally (e.g. 01712… in Bangladesh). */
function toE164(dial: string, national: string): string {
  return `${dial}${national.replace(/\D/g, '').replace(/^0+/, '')}`;
}
const isE164 = (v: string) => /^\+[1-9]\d{7,14}$/.test(v);

/** Latest date of birth that is at least 13 years ago (matches the API rule). */
function maxDob(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return d.toISOString().slice(0, 10);
}

function PhoneField({
  id,
  label,
  hint,
  dial,
  onDial,
  value,
  onValue,
  error,
  placeholder = 'Enter phone number',
}: {
  id: string;
  label: string;
  placeholder?: string;
  hint?: ReactNode;
  dial: string;
  onDial: (v: string) => void;
  value: string;
  onValue: (v: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] text-auth-text2">
        {label}
      </label>
      <div className="flex gap-2">
        <select aria-label={`${label} country code`} value={dial} onChange={(e) => onDial(e.target.value)} className={`${FIELD.replace('w-full ', '')} w-[118px] flex-shrink-0 px-2`}>
          {DIAL_CODES.map((d) => (
            <option key={d.label} value={d.code}>
              {d.flag} {d.code}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          required
          autoComplete="tel-national"
          inputMode="tel"
          placeholder={placeholder}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${id}-hint` : undefined}
          onChange={(e) => onValue(e.target.value)}
          className={`${FIELD} min-w-0 ${error ? 'border-auth-bad' : ''}`}
        />
      </div>
      {(hint || error) && (
        <p id={`${id}-hint`} className={`mt-1.5 text-xs ${error ? 'text-auth-bad' : 'text-auth-text3'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [dialCode, setDialCode] = useState(DIAL_CODES[0].code);
  const [phone, setPhone] = useState('');
  const [waSame, setWaSame] = useState(true);
  const [waDial, setWaDial] = useState(DIAL_CODES[0].code);
  const [waPhone, setWaPhone] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ phone?: string; whatsapp?: string }>({});
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);
  const normalizedEmail = email.trim().toLowerCase();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setReason(null);

    const fullPhone = toE164(dialCode, phone);
    const fullWhatsapp = waSame ? fullPhone : toE164(waDial, waPhone);
    const errs = {
      phone: isE164(fullPhone) ? undefined : 'Enter a valid mobile number',
      whatsapp: waSame ? undefined : !waPhone.trim() ? 'WhatsApp number is required' : isE164(fullWhatsapp) ? undefined : 'Enter a valid WhatsApp number',
    };
    setFieldErrors(errs);
    if (errs.phone || errs.whatsapp) return;

    setLoading(true);
    try {
      const r = await apiClient.post<{ verification: 'sent' | 'failed' | 'skipped' }>('/auth/register', { name, dateOfBirth, email: normalizedEmail, phone: fullPhone, whatsapp: fullWhatsapp, city, country, password });
      const next = new URLSearchParams({ email: normalizedEmail });
      // skipped = no email step on this server (straight to approval); failed = account exists, resend the code.
      if (r.verification === 'skipped') next.set('done', '1');
      if (r.verification === 'failed') next.set('mail', 'failed');
      router.push(`/verify-email?${next.toString()}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setReason((e.details as { reason?: string } | undefined)?.reason ?? null);
      } else {
        setError('Could not create your account');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-auth-bg text-auth-text md:grid-cols-[1.1fr_1fr]">
      {/* Left: brand + value proposition */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-auth-line bg-auth-bg2 p-11 md:flex">
        <div className="pointer-events-none absolute -right-52 -bottom-72 h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(242,140,59,.10),transparent_70%)]" />

        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <FoxLogo className="h-7 w-7" />
          FoxIndex
        </Link>

        <div>
          <h1 className="mb-3.5 max-w-[16ch] text-4xl leading-[1.12] font-semibold tracking-tight text-balance">Start indexing in about ten minutes.</h1>
          <p className="max-w-[44ch] text-base text-auth-text2">
            Create your account, confirm your email, and a manager approves you — usually within a few hours. Your first 100 credits are free.
          </p>

          <div className="mt-7 grid max-w-[520px] gap-3">
            {PERKS.map((perk) => (
              <div key={perk.bold} className="flex gap-3 text-sm text-auth-text2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-auth-ok-soft text-[11px] text-auth-ok">✓</span>
                <div>
                  <b className="font-medium text-auth-text">{perk.bold}</b> {perk.rest}
                </div>
              </div>
            ))}
          </div>

          <ReviewSpotlight className="mt-8 max-w-[520px]" />
        </div>

        <div className="flex gap-4.5 text-[13px] text-auth-text3">
          <span>© 2026 FoxIndex</span>
          <a href="#" className="hover:text-auth-text">Status</a>
          <a href="#" className="hover:text-auth-text">Privacy</a>
          <a href="#" className="hover:text-auth-text">Help</a>
        </div>
      </aside>

      {/* Right: form */}
      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[460px]">
          <Link href="/" className="mb-7 flex items-center gap-2.5 text-[17px] font-semibold tracking-tight md:hidden">
            <FoxLogo className="h-7 w-7" />
            FoxIndex
          </Link>

          <div className="mb-2 flex justify-between text-[12.5px] text-auth-text3">
            <b className="font-medium text-auth-text">Your details</b>
            <span>Verify email</span>
            <span>Manager approval</span>
          </div>
          <div className="mb-6.5 flex gap-1.5">
            <span className="h-[3px] flex-1 rounded-sm bg-auth-accent" />
            <span className="h-[3px] flex-1 rounded-sm bg-auth-line2" />
            <span className="h-[3px] flex-1 rounded-sm bg-auth-line2" />
          </div>

          <h2 className="mb-1.5 text-[26px] font-semibold tracking-tight">Create your account</h2>
          <p className="mb-6.5 text-auth-text2">We&apos;ll send a 6-digit code to your email next.</p>

          {error && (
            <div role="alert" className="mb-4.5 rounded-md border border-auth-bad/30 bg-auth-bad-soft px-3 py-2.5 text-[13.5px] text-auth-bad">
              {error}
              {reason === 'EMAIL_ALREADY_REGISTERED' && (
                <>
                  {' '}
                  <Link href="/login" className="underline">Log in instead</Link>, or use a different email.
                </>
              )}
              {reason === 'EMAIL_PENDING_VERIFICATION' && (
                <>
                  {' '}
                  <Link href={`/verify-email?email=${encodeURIComponent(normalizedEmail)}`} className="underline">Verify your email</Link>
                </>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-[13px] text-auth-text2">Full name</label>
                <input id="name" required minLength={2} autoComplete="name" placeholder="Enter your full name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="dob" className="mb-1.5 block text-[13px] text-auth-text2">Date of birth</label>
                <input id="dob" type="date" required min="1900-01-01" max={maxDob()} autoComplete="bday" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={FIELD} />
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="email" className="mb-1.5 block text-[13px] text-auth-text2">Email</label>
              <input id="email" type="email" required autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
            </div>

            <div className="mb-4 grid gap-3">
              <PhoneField id="phone" label="Mobile number" placeholder="Enter mobile number" dial={dialCode} onDial={setDialCode} value={phone} onValue={setPhone} error={fieldErrors.phone} />
              <label className="flex items-center gap-2 text-[13px] text-auth-text2">
                <input type="checkbox" checked={waSame} onChange={(e) => setWaSame(e.target.checked)} className="h-4 w-4 accent-auth-accent" />
                My WhatsApp number is the same as my mobile number
              </label>
              {waSame ? (
                <p className="-mt-1.5 text-xs text-auth-text3">Your manager contacts you on WhatsApp for approval and support.</p>
              ) : (
                <PhoneField
                  id="whatsapp"
                  label="WhatsApp number"
                  placeholder="Enter WhatsApp number"
                  hint="Your manager contacts you here for approval and support."
                  dial={waDial}
                  onDial={setWaDial}
                  value={waPhone}
                  onValue={setWaPhone}
                  error={fieldErrors.whatsapp}
                />
              )}
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="country" className="mb-1.5 block text-[13px] text-auth-text2">Country</label>
                <select id="country" required value={country} onChange={(e) => setCountry(e.target.value)} className={FIELD}>
                  <option value="" disabled>Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="city" className="mb-1.5 block text-[13px] text-auth-text2">City</label>
                <input id="city" required autoComplete="address-level2" placeholder="Enter your city" value={city} onChange={(e) => setCity(e.target.value)} className={FIELD} />
              </div>
            </div>

            <div className="mb-4.5">
              <label htmlFor="password" className="mb-1.5 block text-[13px] text-auth-text2">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Create a password (min. 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD} pr-14`}
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
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-[3px] flex-1 rounded-sm ${i < strength ? 'bg-auth-ok' : 'bg-auth-line2'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-auth-text3">Use 8+ characters with a number or symbol.</p>
            </div>

            <label className="mb-5.5 flex items-start gap-2.5 text-[13.5px] leading-snug text-auth-text2">
              <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-auth-accent" />
              <span>
                I agree to the <a href="#" className="text-auth-accent">Terms of Service</a> and <a href="#" className="text-auth-accent">Privacy Policy</a>, and understand my account is reviewed before activation.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreed}
              className="w-full rounded-md bg-auth-accent py-3 text-[15px] font-medium text-white transition-colors hover:bg-auth-accent2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? 'Creating account…' : 'Continue to email verification'}
            </button>
          </form>

          <p className="mt-6.5 text-center text-sm text-auth-text2">
            Already have an account? <Link href="/login" className="text-auth-accent">Log in</Link>
          </p>

          <div className="mt-8 rounded-[10px] border border-auth-line p-3.5 text-[13px] text-auth-text2">
            <b className="mb-1.5 block font-medium text-auth-text">What happens next</b>
            <ol className="grid list-decimal gap-0.5 pl-4.5">
              <li>Enter the code we email you</li>
              <li>A manager reviews your details (a few hours, often faster)</li>
              <li>You get 100 free credits and can connect your first site</li>
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}
