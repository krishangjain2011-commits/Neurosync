import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve and ensure a writable uploads directory.
 * Uses UPLOADS_DIR env var if present, otherwise falls back to ./uploads next to the repo.
 * If creation fails (EACCES on ephemeral hosts), falls back to os.tmpdir()/neurosync-uploads.
 */
export function resolveUploadsDir(): string {
  const requested = process.env.UPLOADS_DIR ?? path.join(__dirname, "..", "uploads");
  try {
    mkdirSync(requested, { recursive: true });
    process.env.UPLOADS_DIR = requested;
    return requested;
  } catch (err: any) {
    console.warn(`[env] Cannot create uploads dir ${requested}: ${err.message}. Falling back to tmpdir`);
    const fallback = path.join(os.tmpdir(), "neurosync-uploads");
    try {
      mkdirSync(fallback, { recursive: true });
      process.env.UPLOADS_DIR = fallback;
      return fallback;
    } catch (err2: any) {
      console.error(`[env] Cannot create fallback uploads dir ${fallback}: ${err2.message}. Using os.tmpdir()`);
      process.env.UPLOADS_DIR = os.tmpdir();
      return os.tmpdir();
    }
  }
}

export default resolveUploadsDir;
