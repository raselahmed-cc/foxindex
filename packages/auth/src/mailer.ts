import nodemailer from 'nodemailer';

export interface MailerOptions {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>;
}

/** SMTP transport — MailDev in dev, a real relay in staging/prod (env-swap only). */
export function createMailer(options: MailerOptions): Mailer {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.port === 465,
    auth: options.user ? { user: options.user, pass: options.pass } : undefined,
  });

  return {
    async send(to, subject, html) {
      await transport.sendMail({ from: options.from, to, subject, html });
    },
  };
}
