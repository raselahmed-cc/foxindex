import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDbClient } from '@foxindex/database';
import { createMailer } from './mailer';

const { db } = createDbClient({
  connectionString: process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex',
});

const mailer = createMailer({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM ?? 'FoxIndex <no-reply@foxindex.dev>',
});

/**
 * Phase 1 capabilities only: email/password, sessions, email verification,
 * password reset (constitution §19). OAuth/OIDC/SAML/SCIM/MFA are Phase 2+.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Better Auth only trusts its own baseURL's origin by default — the web
  // app calls it cross-origin (different port), so that origin must be
  // listed explicitly or every request gets rejected as "Invalid origin"
  // regardless of CORS headers, which is a separate check Better Auth does
  // on top of CORS, not instead of it.
  trustedOrigins: [process.env.CORS_ORIGIN ?? 'http://localhost:3000'],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await mailer.send(
        user.email,
        'Reset your FoxIndex password',
        `<p>Reset your password: <a href="${url}">${url}</a></p>`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await mailer.send(
        user.email,
        'Verify your FoxIndex email',
        `<p>Verify your email: <a href="${url}">${url}</a></p>`,
      );
    },
  },
});
