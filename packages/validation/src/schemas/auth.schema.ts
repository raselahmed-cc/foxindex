import { z } from 'zod';

/** International number: `+` then 8–15 digits (loose E.164; no parsing dependency). */
export const e164Phone = (what: string) =>
  z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, `${what} must include the country code, e.g. +8801712345678`);

/** Emails are case-insensitive for sign-in; store and compare them lowercased. */
const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

const MIN_AGE = 13;

/**
 * CLAUDE.md "Account lifecycle" signup fields, refined per the signup page
 * design. WhatsApp is required: account managers reach clients there for
 * approval and support (it may equal the mobile number).
 */
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(255),
  dateOfBirth: z.iso.date().refine((d) => {
    const dob = new Date(`${d}T00:00:00Z`);
    const now = new Date();
    const cutoff = Date.UTC(now.getUTCFullYear() - MIN_AGE, now.getUTCMonth(), now.getUTCDate());
    return dob.getUTCFullYear() >= 1900 && dob.getTime() <= cutoff;
  }, `You must be at least ${MIN_AGE} years old`),
  email: emailField,
  phone: e164Phone('Mobile number'),
  whatsapp: e164Phone('WhatsApp number'),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  password: z.string().min(8, 'Use at least 8 characters').max(255),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({
  email: emailField,
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({ email: emailField });
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
  /** false = session cookie that ends when the browser closes. */
  remember: z.boolean().default(true),
});
export type LoginInput = z.infer<typeof loginSchema>;

// preprocess so a request with no body at all (startingCredit is optional,
// clients often send nothing) still parses instead of failing on `undefined`.
export const approveUserSchema = z.preprocess(
  (value) => value ?? {},
  z.object({ startingCredit: z.number().int().min(0).max(100_000).optional() }),
);
export type ApproveUserInput = z.infer<typeof approveUserSchema>;
