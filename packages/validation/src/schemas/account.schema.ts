import { z } from 'zod';
import { e164Phone } from './auth.schema';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  dateOfBirth: z.iso.date().nullable().optional(),
  phone: optionalText(32),
  /** Required on the account — can be changed but not cleared. */
  whatsapp: e164Phone('WhatsApp number').optional(),
  telegram: optionalText(64),
  country: optionalText(80),
  city: optionalText(80),
  company: optionalText(160),
  timezone: optionalText(64),
  bio: optionalText(500),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

const channels = z.object({ inApp: z.boolean(), email: z.boolean(), whatsapp: z.boolean() });

export const NOTIFICATION_EVENTS = [
  'batchIndexed',
  'urlFailed',
  'lowBalance',
  'managerReplied',
  'paymentConfirmed',
  'weeklySummary',
] as const;

export const userPreferencesSchema = z.object({
  notifications: z.record(z.enum(NOTIFICATION_EVENTS), channels),
  lowBalanceThreshold: z.number().int().min(0).max(1_000_000),
  quietHours: z.enum(['22:00-08:00', 'none']),
  submission: z.object({
    google: z.boolean(),
    indexnow: z.boolean(),
    recheckUntilIndexed: z.boolean(),
    priorityQueue: z.boolean(),
    skipAlreadyIndexed: z.boolean(),
    defaultSiteId: z.uuid().nullable(),
    dailySpendLimit: z.number().int().positive().nullable(),
  }),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const updatePreferencesSchema = userPreferencesSchema.partial();
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  notifications: {
    batchIndexed: { inApp: true, email: true, whatsapp: true },
    urlFailed: { inApp: true, email: true, whatsapp: false },
    lowBalance: { inApp: true, email: true, whatsapp: true },
    managerReplied: { inApp: true, email: true, whatsapp: true },
    paymentConfirmed: { inApp: true, email: true, whatsapp: false },
    weeklySummary: { inApp: false, email: true, whatsapp: false },
  },
  lowBalanceThreshold: 200,
  quietHours: '22:00-08:00',
  submission: {
    google: true,
    indexnow: true,
    recheckUntilIndexed: true,
    priorityQueue: false,
    skipAlreadyIndexed: true,
    defaultSiteId: null,
    dailySpendLimit: null,
  },
};
