'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardTopbar } from '@/components/dashboard-topbar';
import { Button, Card, CardHeader, EmptyState, ErrorBanner, Field, Input, Select, Skeleton, Switch, Table } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';
import { useUser } from '@/lib/user-context';
import { apiClient } from '@/lib/api-client';
import { errorMessage, useApi } from '@/lib/use-api';
import { PRIORITY, type TicketPriority } from '@/lib/tickets';

interface SlaTarget {
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHours: boolean;
}

interface SupportSettings {
  businessHours: { timezone: string; days: { open: boolean; start: string; end: string }[]; holidays: string[] };
  sla: Record<TicketPriority, SlaTarget>;
  automation: {
    autoAssign: boolean;
    slaWarnPercent: number;
    escalateBreachesToAdmins: boolean;
    waitingReminderHours: number;
    waitingAutoResolveHours: number;
    autoCloseResolvedHours: number;
  };
  csat: { enabled: boolean };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];
const UNITS = [
  { value: 1, label: 'minutes' },
  { value: 60, label: 'hours' },
  { value: 1440, label: 'days' },
];

/** Minutes stored, shown in the largest whole unit. */
function DurationInput({ label, minutes, onChange, disabled }: { label: string; minutes: number; onChange: (m: number) => void; disabled?: boolean }) {
  const initialUnit = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
  const [unit, setUnit] = useState(initialUnit);
  const [text, setText] = useState(String(minutes / initialUnit));
  useEffect(() => {
    const u = minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
    setUnit(u);
    setText(String(minutes / u));
  }, [minutes]);
  return (
    <span className="inline-flex gap-1.5">
      <Input aria-label={`${label} amount`} inputMode="numeric" disabled={disabled} value={text} className="w-18 py-1.5 font-mono text-[13px]" onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '');
        setText(v);
        if (Number(v) > 0) onChange(Number(v) * unit);
      }} />
      <Select aria-label={`${label} unit`} disabled={disabled} value={unit} className="w-auto py-1.5 text-[13px]" onChange={(e) => {
        const u = Number(e.target.value);
        setUnit(u);
        if (Number(text) > 0) onChange(Number(text) * u);
      }}>
        {UNITS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </Select>
    </span>
  );
}

function HoursInput({ label, hours, onChange, disabled, zeroLabel }: { label: string; hours: number; onChange: (h: number) => void; disabled?: boolean; zeroLabel: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Input aria-label={label} inputMode="numeric" disabled={disabled} value={String(hours)} className="w-20 py-1.5 font-mono text-[13px]" onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '') || 0))} />
      <span className="text-[12.5px] text-auth-text3">{hours === 0 ? zeroLabel : `hours${hours >= 24 ? ` (${Math.round((hours / 24) * 10) / 10} days)` : ''}`}</span>
    </span>
  );
}

export default function SupportSettingsPage() {
  const me = useUser();
  const toast = useToast();
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const remote = useApi<SupportSettings>(me.role === 'client' ? null : '/support/settings');
  const [s, setS] = useState<SupportSettings | null>(null);
  const [holiday, setHoliday] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (remote.data) setS(remote.data);
  }, [remote.data]);

  if (me.role === 'client') return <EmptyState title="Not available">Support settings are for the FoxIndex team.</EmptyState>;

  const dirty = s && remote.data && JSON.stringify(s) !== JSON.stringify(remote.data);
  const ro = !isAdmin;

  async function save() {
    if (!s) return;
    setError(null);
    setBusy(true);
    try {
      const saved = await apiClient.put<SupportSettings>('/support/settings', s);
      remote.setData(saved);
      toast('Support settings saved — new tickets use these targets right away');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const r = await apiClient.post<Record<string, number>>('/support/automation/run');
      const total = Object.values(r).reduce((a, b) => a + b, 0);
      toast(total ? `Automation ran: ${Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ')}` : 'Automation ran — nothing needed doing', 'info');
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setRunning(false);
    }
  }

  const setSla = (p: TicketPriority, patch: Partial<SlaTarget>) => s && setS({ ...s, sla: { ...s.sla, [p]: { ...s.sla[p], ...patch } } });
  const setAuto = (patch: Partial<SupportSettings['automation']>) => s && setS({ ...s, automation: { ...s.automation, ...patch } });
  const setDay = (i: number, patch: Partial<SupportSettings['businessHours']['days'][number]>) =>
    s && setS({ ...s, businessHours: { ...s.businessHours, days: s.businessHours.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) } });

  return (
    <>
      <DashboardTopbar
        crumb={<Link href="/tickets" className="hover:text-auth-text2">Tickets</Link>}
        title="Support settings"
        subtitle={isAdmin ? 'Service levels, working hours and automation for every ticket' : 'Read-only — ask an admin to change these'}
        search={false}
        action={
          isAdmin ? (
            <div className="flex gap-2">
              <Button loading={running} onClick={() => void runNow()}>Run automation now</Button>
              <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>Save changes</Button>
            </div>
          ) : undefined
        }
      />

      {remote.error ? (
        <ErrorBanner message="Could not load support settings." onRetry={() => void remote.reload()} />
      ) : !s ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-4">
          {error && <ErrorBanner message={error} />}

          <Card>
            <CardHeader title="Service level targets" subtitle="Applied when a ticket is opened or its priority changes. Waiting on the client pauses the resolution clock." />
            <Table head={['Priority', 'First reply within', 'Resolve within', 'Clock']}>
              {(['urgent', 'high', 'normal', 'low'] as TicketPriority[]).map((p) => (
                <tr key={p}>
                  <td className={PRIORITY[p].className}>{PRIORITY[p].label}</td>
                  <td><DurationInput label={`${PRIORITY[p].label} first reply`} disabled={ro} minutes={s.sla[p].firstResponseMinutes} onChange={(m) => setSla(p, { firstResponseMinutes: m })} /></td>
                  <td><DurationInput label={`${PRIORITY[p].label} resolution`} disabled={ro} minutes={s.sla[p].resolutionMinutes} onChange={(m) => setSla(p, { resolutionMinutes: m })} /></td>
                  <td>
                    <Select aria-label={`${PRIORITY[p].label} clock`} disabled={ro} value={s.sla[p].businessHours ? 'business' : 'calendar'} onChange={(e) => setSla(p, { businessHours: e.target.value === 'business' })} className="w-auto py-1.5 text-[13px]">
                      <option value="business">Business hours</option>
                      <option value="calendar">24/7</option>
                    </Select>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Business hours" subtitle="When the business-hours clock runs" />
              <div className="px-4.5 pt-4 pb-4.5">
                <Field label="Timezone">
                  <Select disabled={ro} value={s.businessHours.timezone} onChange={(e) => setS({ ...s, businessHours: { ...s.businessHours, timezone: e.target.value } })}>
                    {[...new Set([s.businessHours.timezone, ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                  </Select>
                </Field>
                <div className="grid gap-2">
                  {s.businessHours.days.map((d, i) => (
                    <div key={DAYS[i]} className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-3">
                      <Switch showLabel checked={d.open} disabled={ro} onChange={(open) => setDay(i, { open })} label={DAYS[i]} />
                      {d.open ? (
                        <span className="flex items-center gap-2 text-[12.5px] text-auth-text3">
                          <Input type="time" aria-label={`${DAYS[i]} opens`} disabled={ro} value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} className="w-34 py-1.25 text-[13px]" />
                          to
                          <Input type="time" aria-label={`${DAYS[i]} closes`} disabled={ro} value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} className="w-34 py-1.25 text-[13px]" />
                          {d.start >= d.end && <span className="text-auth-bad">Ends before it starts</span>}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-auth-text3">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Field label="Holidays" hint="No business-hours time counts on these dates." className="mb-2">
                    <span className="flex gap-2">
                      <Input type="date" disabled={ro} value={holiday} onChange={(e) => setHoliday(e.target.value)} className="w-44 py-1.25 text-[13px]" />
                      <Button size="sm" disabled={ro || !holiday || s.businessHours.holidays.includes(holiday)} onClick={() => { setS({ ...s, businessHours: { ...s.businessHours, holidays: [...s.businessHours.holidays, holiday].sort() } }); setHoliday(''); }}>Add holiday</Button>
                    </span>
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {s.businessHours.holidays.length === 0 && <span className="text-[12.5px] text-auth-text3">None added.</span>}
                    {s.businessHours.holidays.map((h) => (
                      <span key={h} className="inline-flex items-center gap-1 rounded border border-auth-line px-2 py-0.5 font-mono text-[12px]">
                        {h}
                        {!ro && <button aria-label={`Remove holiday ${h}`} className="text-auth-text3 hover:text-auth-text" onClick={() => setS({ ...s, businessHours: { ...s.businessHours, holidays: s.businessHours.holidays.filter((x) => x !== h) } })}>×</button>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Automation" subtitle="Runs every minute" />
              <div className="grid gap-4 px-4.5 pt-4 pb-4.5">
                <Switch showLabel checked={s.automation.autoAssign} disabled={ro} onChange={(autoAssign) => setAuto({ autoAssign })} label="Assign tickets from clients without a manager to the least busy available manager" />
                <Field label="Warn the assignee when this much of the SLA window is used" className="mb-0">
                  <span className="inline-flex items-center gap-2">
                    <Input inputMode="numeric" disabled={ro} value={String(s.automation.slaWarnPercent)} onChange={(e) => setAuto({ slaWarnPercent: Math.min(95, Number(e.target.value.replace(/\D/g, '') || 0)) })} className="w-18 py-1.5 font-mono text-[13px]" />
                    <span className="text-[12.5px] text-auth-text3">% (50–95)</span>
                  </span>
                </Field>
                <Switch showLabel checked={s.automation.escalateBreachesToAdmins} disabled={ro} onChange={(escalateBreachesToAdmins) => setAuto({ escalateBreachesToAdmins })} label="Notify admins when an SLA is breached" />
                <Field label="Remind the client when we’ve been waiting on them for" className="mb-0">
                  <HoursInput label="Reminder after hours" disabled={ro} hours={s.automation.waitingReminderHours} zeroLabel="never" onChange={(waitingReminderHours) => setAuto({ waitingReminderHours })} />
                </Field>
                <Field label="Mark resolved when the client hasn’t replied for" className="mb-0">
                  <HoursInput label="Auto-resolve after hours" disabled={ro} hours={s.automation.waitingAutoResolveHours} zeroLabel="never" onChange={(waitingAutoResolveHours) => setAuto({ waitingAutoResolveHours })} />
                </Field>
                <Field label="Close resolved tickets after" hint="Closed tickets can’t be reopened — the client opens a new one." className="mb-0">
                  <HoursInput label="Auto-close after hours" disabled={ro} hours={s.automation.autoCloseResolvedHours} zeroLabel="never" onChange={(autoCloseResolvedHours) => setAuto({ autoCloseResolvedHours })} />
                </Field>
                <Switch showLabel checked={s.csat.enabled} disabled={ro} onChange={(enabled) => setS({ ...s, csat: { enabled } })} label="Ask clients to rate resolved tickets" />
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
