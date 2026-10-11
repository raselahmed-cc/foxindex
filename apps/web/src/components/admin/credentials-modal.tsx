'use client';

import { Button, Modal, useCopy } from '@/components/dash/ui';
import { useToast } from '@/components/dash/toast';

export interface IssuedCredentials {
  name: string;
  email: string;
  password: string;
  /** Staff invites try to email the login; customer accounts never send one. */
  emailSent?: boolean;
  role: string;
}

/** Shows a newly created account's login exactly once, with copy buttons. */
export function CredentialsModal({ creds, onClose }: { creds: IssuedCredentials | null; onClose: () => void }) {
  const copy = useCopy();
  const toast = useToast();
  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
  const all = creds ? `FoxIndex login (${creds.role})\n${loginUrl}\nEmail: ${creds.email}\nPassword: ${creds.password}` : '';

  return (
    <Modal open={creds !== null} onClose={onClose} title={`${creds?.name ?? ''} can sign in now`} width={480} footer={<><Button onClick={() => void copy(all).then(() => toast('Login details copied'))}>Copy all</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      {creds && (
        <>
          <p className="mb-3 text-[13px] text-auth-text2">
            {creds.emailSent === true
              ? 'We emailed these details too. '
              : creds.emailSent === false
                ? 'The invitation email could not be sent, so share these details yourself. '
                : 'Share these details with them securely. '}
            <b className="font-medium text-auth-text">This password is shown only once</b> — they should change it under Settings → Security.
          </p>
          <dl className="grid gap-2">
            {[
              ['Sign-in page', loginUrl],
              ['Email', creds.email],
              ['Password', creds.password],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 rounded-md border border-auth-line bg-auth-bg px-3 py-2">
                <dt className="w-24 flex-shrink-0 text-xs text-auth-text3">{label}</dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-[13px]">{value}</dd>
                <Button size="sm" onClick={() => void copy(value).then(() => toast(`${label} copied`))}>Copy</Button>
              </div>
            ))}
          </dl>
        </>
      )}
    </Modal>
  );
}
