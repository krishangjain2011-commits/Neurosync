// File Upload Management

import { promises as fs } from 'fs';
import { join } from 'path';

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'image/jpeg', 'image/png'];

export async function ensureUploadsDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
  }
}

export function validateFileUpload(
  filename: string,
  mimetype: string,
  size: number
): { valid: boolean; error?: string } {
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File too large' };
  }

  if (!ALLOWED_TYPES.includes(mimetype)) {
    return { valid: false, error: 'File type not allowed' };
  }

  return { valid: true };
}

export async function saveUploadedFile(
  filename: string,
  data: Buffer
): Promise<string> {
  const filepath = join(UPLOADS_DIR, filename);
  await fs.writeFile(filepath, data);
  return filepath;
}

export async function deleteUploadedFile(filename: string): Promise<void> {
  const filepath = join(UPLOADS_DIR, filename);
  try {
    await fs.unlink(filepath);
  } catch (error) {
    console.error('Failed to delete file:', error);
  }
}
