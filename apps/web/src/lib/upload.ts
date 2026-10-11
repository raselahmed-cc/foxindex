'use client';

import { getAccessToken } from './auth-store';
import type { Attachment } from './api-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const MAX_UPLOAD_MB = 10;
export const ACCEPTED_FILES = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,application/zip';

/** Multipart upload with progress (XHR — fetch has no upload progress events). */
export function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return reject(new Error(`${file.name} is larger than ${MAX_UPLOAD_MB} MB`));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/v1/attachments`);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { success: boolean; data?: Attachment; error?: { message: string } };
        if (body.success && body.data) resolve(body.data);
        else reject(new Error(body.error?.message ?? 'Upload failed'));
      } catch {
        reject(new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
