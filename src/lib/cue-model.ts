/**
 * NeuroSync — Local Cue Model
 *
 * Each child's trained model is stored exclusively in the browser's IndexedDB.
 * No model data is ever sent to a third-party server.
 * The server only stores embeddings temporarily; the canonical model lives here.
 */

const DB_NAME    = "neurosync_cue_models";
const STORE_NAME = "models";
const DB_VERSION = 1;

export interface CueVector {
  id: number;
  label: string;
  mediaType: "audio" | "video";
  vector: number[];
  weight: number;   // confirmed_count — heavier weight = more trusted
}

export interface LocalModel {
  childId: number;
  cueCount: number;
  trained: boolean; // true when cueCount >= 6
  cues: CueVector[];
  savedAt: number;  // timestamp
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "childId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveLocalModel(model: LocalModel): Promise<void> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ ...model, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadLocalModel(childId: number): Promise<LocalModel | null> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.get(childId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteLocalModel(childId: number): Promise<void> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(childId);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Feature extraction (client-side, mirrors server logic) ───────────────────

export function extractVideoEmbedding(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement
): number[] {
  const W = 16, H = 16; // 16x16 thumbnail = 256 pixel values
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Array(256).fill(0);
  ctx.drawImage(videoElement, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const vec: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    // Greyscale: 0.299R + 0.587G + 0.114B, normalised
    vec.push((0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) / 255);
  }
  return vec; // 256-dim
}

export function extractBlobEmbedding(blob: Blob): Promise<number[]> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const buf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      const DIMS = 128;
      const chunkSize = Math.max(1, Math.floor(bytes.length / DIMS));
      const vec: number[] = [];
      for (let i = 0; i < DIMS; i++) {
        let sum = 0, variance = 0;
        const start = i * chunkSize;
        const end   = Math.min(start + chunkSize, bytes.length);
        const count = end - start || 1;
        for (let j = start; j < end; j++) sum += bytes[j];
        const mean = sum / count;
        for (let j = start; j < end; j++) variance += (bytes[j] - mean) ** 2;
        vec.push(mean / 255);
        if (vec.length < DIMS) vec.push(Math.sqrt(variance / count) / 255);
      }
      while (vec.length < DIMS) vec.push(0);
      resolve(vec.slice(0, DIMS));
    };
    reader.readAsArrayBuffer(blob);
  });
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

export function cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < len; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Local matching (runs entirely in browser) ─────────────────────────────────

export const MATCH_THRESHOLD = 0.80;
export const MIN_CUES_FOR_TRAINING = 6;

export interface MatchResult {
  matched: boolean;
  label?: string;
  confidence?: number;
  cueId?: number;
}

export function matchAgainstLocalModel(
  queryVec: number[],
  model: LocalModel
): MatchResult {
  if (!model.trained || model.cues.length < MIN_CUES_FOR_TRAINING) {
    return { matched: false };
  }

  let best: { cue: CueVector; score: number } | null = null;
  for (const cue of model.cues) {
    const score = cosineSim(queryVec, cue.vector);
    // Weight: confirmed cues count more
    const weighted = score * (1 + 0.05 * Math.min(cue.weight - 1, 10));
    if (!best || weighted > best.score) {
      best = { cue, score: weighted };
    }
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    return {
      matched:    true,
      label:      best.cue.label,
      confidence: Math.round(best.score * 100),
      cueId:      best.cue.id,
    };
  }
  return { matched: false };
}
