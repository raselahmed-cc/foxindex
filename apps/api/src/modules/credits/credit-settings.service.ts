import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { appSettings, type Database } from '@foxindex/database';
import { creditSettingsSchema, DEFAULT_CREDIT_SETTINGS, type CreditSettings } from '@foxindex/validation';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';

const KEY = 'credits';
const CACHE_MS = 30_000;

/**
 * Credit policy (price per URL, staff adjustment limits). Read on every batch
 * submit, so cached per replica for 30 s like the support settings.
 */
@Injectable()
export class CreditSettingsService {
  private cache: { value: CreditSettings; at: number } | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async get(): Promise<CreditSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
    // Merge over defaults so settings saved before a new field existed stay valid.
    const parsed = creditSettingsSchema.safeParse({ ...DEFAULT_CREDIT_SETTINGS, ...((row?.value ?? {}) as Partial<CreditSettings>) });
    const value = parsed.success ? parsed.data : DEFAULT_CREDIT_SETTINGS;
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(actorId: string, value: CreditSettings): Promise<CreditSettings> {
    const before = await this.get();
    await this.db
      .insert(appSettings)
      .values({ key: KEY, value, updatedBy: actorId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
    await this.auditLog.record({ actorId, action: 'credits.settings_update', targetType: 'app_settings', metadata: { before, after: value } });
    this.cache = { value, at: Date.now() };
    return value;
  }
}
