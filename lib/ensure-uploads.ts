// Ensure uploads directory exists

import { promises as fs } from 'fs';

export async function ensureUploadsDir(): Promise<void> {
  try {
    await fs.mkdir(process.env.UPLOADS_DIR || './uploads', { recursive: true });
    console.log('Uploads directory ready');
  } catch (error) {
    console.error('Failed to ensure uploads directory:', error);
  }
}
