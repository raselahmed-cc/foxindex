import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { apiKeys } from '@foxindex/database';
import type { ApiKeyScope } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';

export interface CreateApiKeyRow {
  organizationId: string;
  projectId?: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  createdByUserId: string;
  expiresAt?: Date;
}

@Injectable()
export class ApiKeysRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: CreateApiKeyRow) {
    const [row] = await this.db.insert(apiKeys).values(input).returning();
    return row;
  }

  findAllForOrganization(organizationId: string) {
    return this.db.query.apiKeys.findMany({ where: eq(apiKeys.organizationId, organizationId) });
  }

  findByIdForOrganization(organizationId: string, keyId: string) {
    return this.db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)),
    });
  }

  /** Only a key that is neither revoked nor past its expiry authenticates. */
  findActiveByHash(keyHash: string) {
    return this.db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
      ),
    });
  }

  async revoke(keyId: string) {
    const [row] = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, keyId))
      .returning();
    return row;
  }

  /** Fire-and-forget from the guard — never blocks the request on this write. */
  async touchLastUsed(keyId: string): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
  }
}
