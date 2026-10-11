'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Avatar, Button, Card, Checkbox, ErrorBanner, Field, Input, Modal, Pill, Select, Skeleton, Switch } from '@/components/dash/ui';
import { Icon } from '@/components/dash/icons';
import { useToast } from '@/components/dash/toast';
import { useAccount } from '@/lib/account-context';
import { apiClient } from '@/lib/api-client';
import { COUNTRIES } from '@/lib/countries';
import { errorMessage, useApi } from '@/lib/use-api';
import type { NotificationEvent, Preferences, Profile, Session } from '@/lib/api-types';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'defaults', label: 'Submission defaults', icon: 'upload', clientOnly: true },
  { id: 'manager', label: 'Account manager', icon: 'chat', clientOnly: true },
  { id: 'danger', label: 'Danger zone', icon: 'info' },
] as const;

const TIMEZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'];

const EVENTS: { key: NotificationEvent; label: string; detail: string }[] = [
  { key: 'batchIndexed', label: 'Batch fully indexed', detail: 'All URLs in a submission confirmed on Google' },
  { key: 'urlFailed', label: 'URL failed after 3 tries', detail: 'Includes the reason and refund' },
  { key: 'lowBalance', label: 'Low credit balance', detail: 'When balance drops below your threshold' },
  { key: 'managerReplied', label: 'Manager replied', detail: "Chat and ticket replies while you're offline" },
  { key: 'paymentConfirmed', label: 'Payment confirmed', detail: 'Credits added, receipt attached' },
  { key: 'weeklySummary', label: 'Weekly summary', detail: 'Every Monday 09:00 in your time zone' },
];

function Section({ id, title, subtitle, children, footer, danger }: { id: string; title: string; subtitle: string; children: ReactNode; footer?: ReactNode; danger?: boolean }) {
  return (
    <section id={id} className="mb-4 scroll-mt-5">
      <Card className={cn(danger && 'border-auth-bad/35')}>
        <div className="border-b border-auth-line px-4.5 py-3.25">
          <h3 className={cn('text-[14.5px] font-semibold', danger && 'text-auth-bad')}>{title}</h3>
          <p className="mt-0.5 text-[12.5px] text-auth-text3">{subtitle}</p>
        </div>
        <div className="p-4.5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-auth-line px-4.5 py-3">{footer}</div>}
      </Card>
    </section>
  );
}

function ProfileSection({ profile }: { profile: Profile }) {
  const { setProfile } = useAccount();
  const toast = useToast();
  const initial = () => ({
    name: profile.name,
    dateOfBirth: profile.dateOfBirth ?? '',
    whatsapp: profile.whatsapp ?? profile.phone ?? '',
    telegram: profile.telegram ?? '',
    country: profile.country ?? '',
    city: profile.city ?? '',
    company: profile.company ?? '',
    timezone: profile.timezone ?? 'Asia/Dhaka',
  });
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial());
  const set = (k: keyof ReturnType<typeof initial>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setError(null);
    if (form.name.trim().length < 2) return setError('Name must be at least 2 characters.');
    const whatsapp = form.whatsapp.replace(/[\s()-]/g, '');
    if (!whatsapp && profile.role === 'client') return setError('Add your WhatsApp number — your manager uses it to reach you.');
    if (whatsapp && !/^\+[1-9]\d{7,14}$/.test(whatsapp)) return setError('WhatsApp number must include the country code, e.g. +8801712345678.');
    setSaving(true);
    try {
      const updated = await apiClient.patch<Profile>('/me/profile', {
        name: form.name.trim(),
        dateOfBirth: form.dateOfBirth || null,
        whatsapp: whatsapp || undefined,
        telegram: form.telegram.trim() || null,
        country: form.country || null,
        city: form.city.trim() || null,
        company: form.company.trim() || null,
        timezone: form.timezone || null,
      });
      setProfile(updated);
      toast('Profile saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      id="profile"
      title="Profile"
      subtitle={profile.role === 'client' ? 'How you appear to your manager and on receipts.' : 'How you appear to clients and other staff.'}
      footer={
        <>
          <Button disabled={!dirty || saving} onClick={() => setForm(initial())}>Discard</Button>
          <Button variant="primary" disabled={!dirty} loading={saving} onClick={() => void save()}>Save changes</Button>
        </>
      }
    >
      <div className="mb-4.5 flex items-center gap-4">
        <Avatar name={form.name || profile.name} size={56} tone={profile.role === 'manager' ? 'fox' : 'accent'} />
        <div className="text-[12.5px] text-auth-text3">
          <b className="block text-sm font-medium text-auth-text">{profile.name}</b>
          Member since {new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </div>
      </div>
      <div className="grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Full name"><Input value={form.name} onChange={set('name')} maxLength={120} autoComplete="name" /></Field>
        <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} /></Field>
        <Field label="Email" right={<Pill tone="ok" className="py-0.25">Verified</Pill>} hint={<>Changing email requires re-verification — <Link href="/chat" className="text-auth-accent">ask your manager</Link>.</>}>
          <Input value={profile.email} readOnly />
        </Field>
        <Field label="WhatsApp number" hint="With country code. Used for WhatsApp alerts and by your manager.">
          <Input value={form.whatsapp} onChange={set('whatsapp')} inputMode="tel" placeholder="+880 1712 345 678" autoComplete="tel" maxLength={32} />
        </Field>
        <Field label="Country">
          <Select value={form.country} onChange={set('country')}>
            <option value="">Select…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="City"><Input value={form.city} onChange={set('city')} maxLength={80} /></Field>
        <Field label="Company (optional)" hint="Shown on receipts."><Input value={form.company} onChange={set('company')} maxLength={160} /></Field>
        <Field label="Time zone">
          <Select value={form.timezone} onChange={set('timezone')}>
            {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Telegram (optional)" className="sm:col-span-2"><Input value={form.telegram} onChange={set('telegram')} placeholder="@username" maxLength={64} /></Field>
      </div>
      {error && <p role="alert" className="text-[12.5px] text-auth-bad">{error}</p>}
    </Section>
  );
}

function SecuritySection() {
  const toast = useToast();
  const sessions = useApi<Session[]>('/auth/sessions');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function changePassword() {
    setPwError(null);
    if (pw.next.length < 8) return setPwError('New password must be at least 8 characters.');
    if (pw.next !== pw.confirm) return setPwError("The new passwords don't match.");
    setPwBusy(true);
    try {
      await apiClient.post('/auth/password', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      toast('Password updated — other devices were signed out');
      void sessions.reload();
    } catch (e) {
      setPwError(errorMessage(e));
    } finally {
      setPwBusy(false);
    }
  }

  async function revoke(id?: string) {
    try {
      const res = await apiClient.delete<{ revoked: number }>(id ? `/auth/sessions/${id}` : '/auth/sessions/others');
      toast(id ? 'Device signed out' : `Signed out of ${res.revoked} other device${res.revoked === 1 ? '' : 's'}`);
      void sessions.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  }

  return (
    <Section id="security" title="Security" subtitle="Password, two-factor, and where you're logged in.">
      <div className="grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Current password" className="sm:col-span-1">
          <Input type="password" autoComplete="current-password" placeholder="••••••••" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="New password"><Input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} /></Field>
        <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} /></Field>
      </div>
      {pwError && <p role="alert" className="mb-2 text-[12.5px] text-auth-bad">{pwError}</p>}
      <Button loading={pwBusy} disabled={!pw.current || !pw.next} onClick={() => void changePassword()}>Update password</Button>

      <div className="mt-5 flex items-center gap-3.5 rounded-lg border border-auth-line bg-auth-bg2 p-3.5">
        <Pill tone="warn">Off</Pill>
        <div className="flex-1 text-[13.5px]">
          <b className="block font-medium">Two-factor authentication</b>
          <small className="text-[12.5px] text-auth-text3">Authenticator-app codes at sign-in. Rolling out soon.</small>
        </div>
        <Button size="sm" disabled>Turn on</Button>
      </div>

      <div className="mt-5.5 mb-1.5 flex items-center justify-between text-[13.5px] font-medium">
        Active sessions
        {(sessions.data?.length ?? 0) > 1 && <Button variant="link" className="text-[12.5px] text-auth-bad!" onClick={() => void revoke()}>Log out of all other devices</Button>}
      </div>
      {sessions.error && <ErrorBanner message="Could not load sessions." onRetry={() => void sessions.reload()} />}
      {sessions.loading && !sessions.data && <Skeleton className="h-12" />}
      {sessions.data?.map((s) => (
        <div key={s.id} className="flex items-center gap-3 border-t border-auth-line py-2.75 text-[13.5px] first-of-type:border-t-0">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-auth-surface2 text-auth-text2">
            {s.mobile ? <Icon.phone className="h-3.75 w-3.75" /> : <Icon.monitor className="h-3.75 w-3.75" />}
          </span>
          <div className="min-w-0 flex-1">
            {s.os} · {s.browser}
            {s.current && <Pill tone="ok" className="ml-1.5 py-0.25">This device</Pill>}
            <small className="block text-xs text-auth-text3">{[s.ip, s.current ? 'now' : `signed in ${relativeTime(s.lastActiveAt)}`].filter(Boolean).join(' · ')}</small>
          </div>
          {!s.current && <Button variant="link" className="text-[12.5px] text-auth-bad!" onClick={() => void revoke(s.id)}>Log out</Button>}
        </div>
      ))}
    </Section>
  );
}

function usePreferences() {
  const { profile, setProfile } = useAccount();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = async (patch: Partial<Preferences>, message: string) => {
    if (!profile) return;
    setSaving(true);
    try {
      const prefs = await apiClient.patch<Preferences>('/me/preferences', patch);
      setProfile({ ...profile, preferences: prefs });
      toast(message);
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setSaving(false);
    }
  };
  return { saving, save };
}

function NotificationsSection({ profile }: { profile: Profile }) {
  const { saving, save } = usePreferences();
  const [prefs, setPrefs] = useState(profile.preferences);
  useEffect(() => setPrefs(profile.preferences), [profile.preferences]);
  const whatsapp = profile.whatsapp ?? profile.phone;

  const toggle = (event: NotificationEvent, channel: 'inApp' | 'email' | 'whatsapp', on: boolean) =>
    setPrefs((p) => ({ ...p, notifications: { ...p.notifications, [event]: { ...p.notifications[event], [channel]: on } } }));

  return (
    <Section
      id="notifications"
      title="Notifications"
      subtitle={whatsapp ? `Pick a channel per event. WhatsApp goes to ${whatsapp}.` : 'Pick a channel per event. Add a WhatsApp number in Profile to get WhatsApp alerts.'}
      footer={
        <Button variant="primary" loading={saving} onClick={() => void save({ notifications: prefs.notifications, lowBalanceThreshold: prefs.lowBalanceThreshold, quietHours: prefs.quietHours }, 'Notification settings saved')}>
          Save notifications
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-[13px]">
          <thead>
            <tr className="text-xs text-auth-text3">
              <th className="pb-2 text-left font-normal">Event</th>
              <th className="w-17.5 pb-2 font-normal">In-app</th>
              <th className="w-17.5 pb-2 font-normal">Email</th>
              <th className="w-20 pb-2 font-normal"><span className="inline-flex items-center gap-1"><Icon.whatsapp className="h-3 w-3" />WhatsApp</span></th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((ev) => (
              <tr key={ev.key} className="border-t border-auth-line">
                <td className="py-2.5">
                  {ev.label}
                  <small className="block text-xs text-auth-text3">{ev.detail}</small>
                </td>
                {(['inApp', 'email', 'whatsapp'] as const).map((ch) => (
                  <td key={ch} className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`${ev.label} via ${ch}`}
                      className="h-3.75 w-3.75 accent-auth-accent"
                      checked={prefs.notifications[ev.key][ch]}
                      disabled={ch === 'whatsapp' && !whatsapp}
                      onChange={(e) => toggle(ev.key, ch, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4.5 grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Low-balance threshold" hint="Credits. Alert fires once until you top up." className="mb-0">
          <Input mono inputMode="numeric" value={String(prefs.lowBalanceThreshold)} onChange={(e) => setPrefs((p) => ({ ...p, lowBalanceThreshold: Number(e.target.value.replace(/\D/g, '') || 0) }))} />
        </Field>
        <Field label="Quiet hours (WhatsApp)" className="mb-0">
          <Select value={prefs.quietHours} onChange={(e) => setPrefs((p) => ({ ...p, quietHours: e.target.value as Preferences['quietHours'] }))}>
            <option value="22:00-08:00">22:00 – 08:00</option>
            <option value="none">None</option>
          </Select>
        </Field>
      </div>
    </Section>
  );
}

function DefaultsSection({ profile }: { profile: Profile }) {
  const { saving, save } = usePreferences();
  const [sub, setSub] = useState(profile.preferences.submission);
  useEffect(() => setSub(profile.preferences.submission), [profile.preferences.submission]);
  const opt = (key: keyof Omit<typeof sub, 'defaultSiteId' | 'dailySpendLimit'>, label: string, detail: string) => (
    <div className="flex items-center justify-between gap-3.5 border-t border-auth-line py-3 text-[13.5px] first:border-t-0 first:pt-1">
      <div>
        {label}
        <small className="block text-[12.5px] text-auth-text3">{detail}</small>
      </div>
      <Switch label={label} checked={sub[key]} onChange={(v) => setSub((s) => ({ ...s, [key]: v }))} />
    </div>
  );
  return (
    <Section
      id="defaults"
      title="Submission defaults"
      subtitle="Pre-filled every time you submit. You can still change them per batch."
      footer={<Button variant="primary" loading={saving} onClick={() => void save({ submission: sub }, 'Submission defaults saved')}>Save defaults</Button>}
    >
      {opt('google', 'Send to Google', '1 credit per URL')}
      {opt('indexnow', 'Send to Bing, Yandex & other engines', 'Bing, Yandex, Naver, Seznam, Yep · free')}
      {opt('recheckUntilIndexed', 'Keep checking until indexed', 'Re-check at 6h, 24h, 72h · up to 3 resubmits')}
      {opt('priorityQueue', 'Priority queue', '+1 credit per URL')}
      {opt('skipAlreadyIndexed', 'Skip URLs already indexed', 'Saves credits when re-importing a sitemap')}
      <div className="mt-3.5 grid gap-x-3.5 sm:grid-cols-2">
        <Field label="Default site" className="mb-0">
          <Select value={sub.defaultSiteId ?? ''} onChange={(e) => setSub((s) => ({ ...s, defaultSiteId: e.target.value || null }))}>
            <option value="">Last used</option>
            {profile.sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
          </Select>
        </Field>
        <Field label="Daily spend limit" hint="Credits per day across web and API. Protects against mistakes." className="mb-0">
          <Input mono inputMode="numeric" placeholder="No limit" value={sub.dailySpendLimit ? String(sub.dailySpendLimit) : ''} onChange={(e) => setSub((s) => ({ ...s, dailySpendLimit: Number(e.target.value.replace(/\D/g, '')) || null }))} />
        </Field>
      </div>
    </Section>
  );
}

function ManagerSection({ profile }: { profile: Profile }) {
  const m = profile.manager;
  const wa = m?.whatsapp?.replace(/\D/g, '');
  return (
    <Section id="manager" title="Account manager" subtitle="Assigned when your account was approved.">
      {m ? (
        <>
          <div className="flex flex-wrap items-center gap-3.5">
            <Avatar name={m.name} tone="fox" size={44} />
            <div className="min-w-0 flex-1">
              <b className="block font-medium">{m.name}</b>
              <small className="text-[12.5px] text-auth-text3">{m.email}</small>
            </div>
            <Link href="/chat" className="rounded-md border border-auth-line2 px-3.5 py-2 text-[13.5px] font-medium hover:bg-auth-surface2">Open chat</Link>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="rounded-md border border-auth-line2 px-3.5 py-2 text-[13.5px] font-medium text-auth-ok hover:bg-auth-surface2">WhatsApp</a>
            )}
          </div>
          <p className="mt-3.5 text-[12.5px] text-auth-text3">
            Want a different manager or a language preference? <Link href="/chat" className="text-auth-accent">Request a change</Link> — an admin will review it.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-auth-text3">A manager is assigned as soon as your account is approved.</p>
      )}
    </Section>
  );
}

function DangerSection({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ack, setAck] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const [ledger, payments, keys] = await Promise.all([
        apiClient.get('/credits/ledger?limit=100'),
        profile.role === 'client' ? apiClient.get('/billing/payments') : Promise.resolve([]),
        apiClient.get('/api-keys').catch(() => null),
      ]);
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, ledger, payments, apiKeys: keys }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `foxindex-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Export downloaded');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Section id="danger" title="Danger zone" subtitle="These can't be undone." danger>
      <div className="flex items-center justify-between gap-3.5 py-1 text-[13.5px]">
        <div>
          Export all my data
          <small className="block text-[12.5px] text-auth-text3">Profile, credit ledger, payments and API keys as JSON</small>
        </div>
        <Button size="sm" loading={exporting} onClick={() => void exportData()}>Export</Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3.5 border-t border-auth-line pt-3 text-[13.5px]">
        <div>
          Delete account
          <small className="block text-[12.5px] text-auth-text3">Unused credits are not refundable. Your manager confirms by WhatsApp first.</small>
        </div>
        <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>Delete account</Button>
      </div>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Request account deletion"
        width={460}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Link
              href="/chat"
              aria-disabled={!ack}
              className={cn('rounded-md bg-auth-bad-soft px-3.5 py-2 text-[13.5px] font-medium text-auth-bad', !ack && 'pointer-events-none opacity-50')}
            >
              Continue in chat
            </Link>
          </>
        }
      >
        <p className="mb-3.5 text-[13.5px] text-auth-text2">
          For your protection, deletion is confirmed by your account manager. Continue in chat and they&apos;ll verify it&apos;s you, then remove your account and data.
        </p>
        <Checkbox checked={ack} onChange={setAck}>I understand unused credits will not be refunded.</Checkbox>
      </Modal>
    </Section>
  );
}

export default function SettingsPage() {
  const { profile } = useAccount();
  const [active, setActive] = useState('profile');
  const isClient = profile?.role === 'client';
  const sections = SECTIONS.filter((s) => !('clientOnly' in s) || isClient);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [profile, sections]);

  return (
    <>
      <DashboardTopbar title="Settings" subtitle="Profile, security, notifications and defaults for new submissions" search={false} />
      <div className="grid items-start gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="flex gap-1.5 overflow-x-auto p-1.5 lg:sticky lg:top-5 lg:block">
          {sections.map((s) => {
            const IconCmp = Icon[s.icon];
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn('flex items-center gap-2.25 rounded-md px-3 py-2.25 text-[13.5px] whitespace-nowrap', active === s.id ? 'bg-auth-accent-soft text-auth-text' : 'text-auth-text2 hover:text-auth-text')}
              >
                <IconCmp className="h-3.75 w-3.75 opacity-75" />
                {s.label}
              </a>
            );
          })}
        </Card>

        <div className="min-w-0">
          {!profile ? (
            <div className="grid gap-4"><Skeleton className="h-80" /><Skeleton className="h-60" /></div>
          ) : (
            <>
              <ProfileSection key={profile.id + profile.name} profile={profile} />
              <SecuritySection />
              <NotificationsSection profile={profile} />
              {isClient && <DefaultsSection profile={profile} />}
              {isClient && <ManagerSection profile={profile} />}
              <DangerSection profile={profile} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
