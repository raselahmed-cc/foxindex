import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Object storage behind one small interface. Local disk is used in
 * development and single-node installs; swap `LocalDiskStorage` for an
 * S3/R2 implementation in production without touching callers.
 */
export interface ObjectStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  stream(key: string): Promise<{ stream: Readable; size: number }>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class LocalDiskStorage implements ObjectStorage {
  private readonly root = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));

  /** Keys are server-generated, but still refuse anything that escapes the upload root. */
  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }

  async stream(key: string): Promise<{ stream: Readable; size: number }> {
    const path = this.pathFor(key);
    const info = await stat(path);
    return { stream: createReadStream(path), size: info.size };
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
