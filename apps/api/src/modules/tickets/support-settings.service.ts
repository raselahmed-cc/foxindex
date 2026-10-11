import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { appSettings, type Database } from '@foxindex/database';
import { DEFAULT_SUPPORT_SETTINGS, supportSettingsSchema, type SupportSettings } from '@foxindex/validation';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';

const KEY = 'support';
const CACHE_MS = 30_000;

/**
 * SLA policy, business hours and automation thresholds. Read on every ticket
 * mutation, so cached per replica for 30 s; a save refreshes the local copy
 * and other replicas converge within the cache window.
 */
@Injectable()
export class SupportSettingsService {
  private cache: { value: SupportSettings; at: number } | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async get(): Promise<SupportSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) });
    // Merge over defaults so settings saved before a new field existed stay valid.
    const parsed = supportSettingsSchema.safeParse(deepMerge(DEFAULT_SUPPORT_SETTINGS, (row?.value ?? {}) as Partial<SupportSettings>));
    const value = parsed.success ? parsed.data : DEFAULT_SUPPORT_SETTINGS;
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(actorId: string, value: SupportSettings): Promise<SupportSettings> {
    await this.db
      .insert(appSettings)
      .values({ key: KEY, value, updatedBy: actorId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
    await this.auditLog.record({ actorId, action: 'support.settings.update', targetType: 'app_settings', metadata: { key: KEY } });
    this.cache = { value, at: Date.now() };
    return value;
  }
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || typeof base !== 'object' || base === null || Array.isArray(base)) {
    return (patch ?? base) as T;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  return out as T;
}
