import { createMailer, type Mailer } from '@foxindex/auth';

export const MAILER = Symbol('MAILER');

/** True when an SMTP relay is configured. Without one, signup skips the email-code step (manager approval still gates every account). */
export const smtpConfigured = (): boolean => Boolean(process.env.SMTP_HOST?.trim());

/** SMTP config is read directly from process.env (MailDev in dev, a real relay in staging/prod) — not through the zod-validated ApiEnv, since it's optional infrastructure config, not a required boot-time invariant. */
export const mailerProvider = {
  provide: MAILER,
  useFactory: (): Mailer =>
    createMailer({
      host: process.env.SMTP_HOST?.trim() || 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM ?? 'FoxIndex <no-reply@foxindex.dev>',
    }),
};
