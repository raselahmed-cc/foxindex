'use client';

import { useState } from 'react';
import { Button, Field, Input, Modal, Select } from '@/components/dash/ui';
import { apiClient } from '@/lib/api-client';
import { errorMessage } from '@/lib/use-api';
import { COUNTRIES } from '@/lib/countries';
import type { IssuedCredentials } from './credentials-modal';

const EMPTY = { name: '', email: '', whatsapp: '', company: '', country: '', city: '', managerId: 'auto', startingCredits: '100', password: '' };

/** Create a ready-to-use customer account (active, email already verified). */
export function AddClientModal({
  open,
  managers,
  onClose,
  onCreated,
}: {
  open: boolean;
  managers: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (creds: IssuedCredentials) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setError(null);
    const whatsapp = form.whatsapp.replace(/[\s()-]/g, '');
    if (form.name.trim().length < 2) return setError('Enter their full name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email.');
    if (!/^\+[1-9]\d{7,14}$/.test(whatsapp)) return setError('WhatsApp number must include the country code, e.g. +8801712345678.');
    if (form.password && form.password.length < 10) return setError('Use at least 10 characters, or leave the password empty to generate one.');
    setBusy(true);
    try {
      const r = await apiClient.post<{ name: string; email: string; password: string }>('/admin/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        whatsapp,
        company: form.company.trim() || undefined,
        country: form.country || undefined,
        city: form.city.trim() || undefined,
        managerId: form.managerId === 'auto' ? undefined : form.managerId === 'none' ? null : form.managerId,
        startingCredits: Number(form.startingCredits || 0),
        password: form.password || undefined,
      });
      setForm(EMPTY);
      onCreated({ name: r.name, email: r.email, password: r.password, role: 'client' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a customer"
      width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>Create account</Button></>}
    >
      <p className="mb-3.5 text-[13px] text-auth-text2">The account is active right away — no email verification or approval step.</p>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Full name"><Input autoFocus value={form.name} onChange={set('name')} maxLength={120} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="WhatsApp number" hint="With country code"><Input inputMode="tel" placeholder="+8801712345678" value={form.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="Company (optional)"><Input value={form.company} onChange={set('company')} maxLength={160} /></Field>
        <Field label="Country (optional)">
          <Select value={form.country} onChange={set('country')}>
            <option value="">Select…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="City (optional)"><Input value={form.city} onChange={set('city')} maxLength={120} /></Field>
        <Field label="Account manager">
          <Select value={form.managerId} onChange={set('managerId')}>
            <option value="auto">Assign automatically (least busy)</option>
            <option value="none">No manager</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Starting credits"><Input mono inputMode="numeric" value={form.startingCredits} onChange={(e) => setForm((f) => ({ ...f, startingCredits: e.target.value.replace(/\D/g, '') }))} /></Field>
      </div>
      <Field label="Password (optional)" hint="Leave empty to generate a strong one. You’ll see it once after creating the account." className="mb-0">
        <Input type="text" autoComplete="new-password" mono value={form.password} onChange={set('password')} />
      </Field>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-auth-bad">{error}</p>}
    </Modal>
  );
}
