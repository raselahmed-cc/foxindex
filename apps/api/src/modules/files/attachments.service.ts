import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { attachments, type Database, type Transaction } from '@foxindex/database';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { OBJECT_STORAGE, type ObjectStorage } from './storage.service';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const URL_TTL_SECONDS = 60 * 60;

/** Allowed types, verified by magic bytes where the format has one — the browser-supplied mimetype is never trusted. */
const ALLOWED: Record<string, { ext: string; magic?: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/gif': { ext: 'gif', magic: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  'text/plain': { ext: 'txt' },
  'text/csv': { ext: 'csv' },
  'application/zip': { ext: 'zip', magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
};

export type OwnerType = 'chat_message' | 'ticket_message';

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  isImage: boolean;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function safeFileName(name: string): string {
  const printable = [...name].map((c) => (c.charCodeAt(0) < 32 ? '_' : c)).join('');
  const cleaned = printable.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120);
  return cleaned || 'file';
}

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private sign(id: string, exp: number): string {
    return createHmac('sha256', this.config.getOrThrow<string>('ENCRYPTION_KEY')).update(`att:${id}:${exp}`).digest('base64url');
  }

  /** Short-lived signed URL — lets <img> and download links work without the bearer token. */
  signedUrl(id: string): string {
    const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
    const base = this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001';
    return `${base}/api/v1/attachments/${id}/download?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  verify(id: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(id, exp));
    const given = Buffer.from(sig ?? '');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async upload(uploaderId: string, file: UploadedFile): Promise<AttachmentDto> {
    if (!file || !file.buffer?.length) throw new ValidationError('No file received');
    if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError('Files can be at most 10 MB', { reason: 'FILE_TOO_LARGE' });
    const type = ALLOWED[file.mimetype];
    if (!type) throw new ValidationError('That file type is not allowed. Use images, PDF, TXT, CSV or ZIP.', { reason: 'FILE_TYPE' });
    if (type.magic && !type.magic(file.buffer)) {
      throw new ValidationError('The file content does not match its type', { reason: 'FILE_TYPE_MISMATCH' });
    }

    // Per-user throttle: 50 uploads per hour is far above normal support use.
    const [{ n }] = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(attachments)
      .where(and(eq(attachments.uploaderId, uploaderId), gt(attachments.createdAt, sql`now() - interval '1 hour'`)));
    if (Number(n) >= 50) throw new ValidationError('Upload limit reached — try again later', { reason: 'UPLOAD_RATE' });

    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(16).toString('hex')}.${type.ext}`;
    await this.storage.put(key, file.buffer);
    const [row] = await this.db
      .insert(attachments)
      .values({ uploaderId, fileName: safeFileName(file.originalname), mimeType: file.mimetype, size: file.size, storageKey: key })
      .returning();
    return this.toDto(row);
  }

  toDto(row: typeof attachments.$inferSelect): AttachmentDto {
    return { id: row.id, fileName: row.fileName, mimeType: row.mimeType, size: row.size, url: this.signedUrl(row.id), isImage: row.mimeType.startsWith('image/') };
  }

  /** Links the uploader's own unlinked uploads (from the last day) to a message, inside the caller's transaction. */
  async link(tx: Database | Transaction, uploaderId: string, ids: string[], ownerType: OwnerType, ownerId: string) {
    if (ids.length === 0) return [];
    const rows = await tx
      .update(attachments)
      .set({ ownerType, ownerId })
      .where(
        and(
          inArray(attachments.id, ids),
          eq(attachments.uploaderId, uploaderId),
          isNull(attachments.ownerId),
          gt(attachments.createdAt, sql`now() - interval '1 day'`),
        ),
      )
      .returning();
    if (rows.length !== new Set(ids).size) {
      throw new ValidationError('One of the attachments is missing or already used — upload it again', { reason: 'ATTACHMENT_INVALID' });
    }
    return rows.map((r) => this.toDto(r));
  }

  async forOwners(ownerType: OwnerType, ownerIds: string[]): Promise<Map<string, AttachmentDto[]>> {
    const map = new Map<string, AttachmentDto[]>();
    if (ownerIds.length === 0) return map;
    const rows = await this.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.ownerType, ownerType), inArray(attachments.ownerId, ownerIds)));
    for (const r of rows) {
      const list = map.get(r.ownerId!) ?? [];
      list.push(this.toDto(r));
      map.set(r.ownerId!, list);
    }
    return map;
  }

  async open(id: string) {
    const row = await this.db.query.attachments.findFirst({ where: eq(attachments.id, id) });
    if (!row || !row.ownerId) throw new NotFoundError('File');
    const { stream, size } = await this.storage.stream(row.storageKey);
    return { row, stream, size };
  }
}
