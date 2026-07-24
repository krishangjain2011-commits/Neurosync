import path from "path";
import resolveUploadsDir from "./ensure-uploads.js";

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const PORT = Number(process.env.PORT ?? 3000);
export const UPLOADS_DIR = resolveUploadsDir();
export const ML_SIDECAR_URL = process.env.ML_SIDECAR_URL ?? "http://localhost:8000";
export const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct";
export const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? null;
export const MISTRAL_MODEL = process.env.MISTRAL_MODEL ?? "mistral-small-latest";
export const FFMPEG_PATH = process.env.FFMPEG_PATH ?? null;

export default {
  NODE_ENV,
  PORT,
  UPLOADS_DIR,
  ML_SIDECAR_URL,
  GROQ_VISION_MODEL,
  MISTRAL_API_KEY,
  MISTRAL_MODEL,
  FFMPEG_PATH,
};
