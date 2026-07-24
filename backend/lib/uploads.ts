import path from "path";
import os from "os";
import multer from "multer";
import { mkdirSync, existsSync } from "fs";
import config from "./config.js";

const UPLOADS_DIR = config.UPLOADS_DIR;

const audioStorage = (multer as any).diskStorage({
  destination: (_req: any, _file: any, cb: Function) => {
    // destination will be computed at request time in routes; multer still
    // calls diskStorage.destination with req available — for safety we use
    // the configured UPLOADS_DIR base; callers can compute child-specific dirs.
    try {
      mkdirSync(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (err) {
      const fallback = path.join(os.tmpdir(), "neurosync-uploads");
      try { mkdirSync(fallback, { recursive: true }); cb(null, fallback); }
      catch { cb(null, os.tmpdir()); }
    }
  },
  filename: (_req: any, file: any, cb: Function) => {
    const ext = path.extname(file.originalname || "audio.webm") || ".webm";
    cb(null, `${Date.now()}${ext}`);
  },
});

export const uploadAudio = (multer as any)({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: Function) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") cb(null, true);
    else cb(new Error("Only audio files are accepted"));
  },
});

export const handwritingStorage = (multer as any).memoryStorage();
export const uploadHandwriting = (multer as any)({
  storage: handwritingStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: Function) => {
    if (file.mimetype?.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

export default { uploadAudio, uploadHandwriting, UPLOADS_DIR };
