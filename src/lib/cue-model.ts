/**
 * NeuroSync — Local Cue Model (v2 — Nearest-Centroid + Softmax)
 *
 * Each child's trained model is stored exclusively in the browser's IndexedDB.
 * No model data is ever sent to a third-party server.
 *
 * Matching algorithm (ported from Copy's PrototypeClassifier):
 *   1. Compute one centroid per label = mean of all training vectors for that label
 *   2. Cosine similarity between query and every centroid
 *   3. Temperature-scaled softmax (T=0.10) → interpretable probability confidence
 *   4. Top result above MATCH_THRESHOLD is returned as a confident match
 *
 * This gives more accurate results than per-vector comparison because:
 *   - Multiple recordings of the same cue average out noise
 *   - Softmax sharpens the decision boundary (vs raw cosine which dilutes confidence)
 */

const DB_NAME    = "neurosync_cue_models_v2";  // v2 — new store, avoids stale v1 data
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
  childId:      number;
  cueCount:     number;
  trained:      boolean;
  cues:         CueVector[];
  centroids:    Record<string, number[]>; // label → centroid vector (pre-computed)
  embedVersion: string;
  savedAt:      number;
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

// ── Client-side embedding (mirrors server lib/embedder.ts) ───────────────────
// Frequency-domain embedding using FFT + mel bands + temporal features.
// Kept in sync with server — same 128-dim layout so local and server matching
// produce consistent results.

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wre = Math.cos(ang), wim = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i+k], ui = im[i+k];
        const vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
        const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr;
        re[i+k]=ur+vr; im[i+k]=ui+vi;
        re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const nr=cr*wre-ci*wim; ci=cr*wim+ci*wre; cr=nr;
      }
    }
  }
}

function melBandEnergies(magnitudes: Float64Array, fftSize: number, nBands = 32): Float64Array {
  const nBins = fftSize / 2;
  const bands = new Float64Array(nBands);
  const melMin = 2595 * Math.log10(1 + 80 / 700);
  const melMax = 2595 * Math.log10(1 + 8000 / 700);
  const sr = 22050;
  for (let b = 0; b < nBands; b++) {
    const melLow  = melMin + (b / nBands) * (melMax - melMin);
    const melHigh = melMin + ((b+2) / nBands) * (melMax - melMin);
    const melCtr  = melMin + ((b+1) / nBands) * (melMax - melMin);
    const hzLow   = 700 * (Math.pow(10, melLow/2595) - 1);
    const hzHigh  = 700 * (Math.pow(10, melHigh/2595) - 1);
    const hzCtr   = 700 * (Math.pow(10, melCtr/2595) - 1);
    const bLow    = Math.round(hzLow  * fftSize / sr);
    const bHigh   = Math.round(hzHigh * fftSize / sr);
    const bCtr    = Math.round(hzCtr  * fftSize / sr);
    let energy = 0, count = 0;
    for (let i = Math.max(1, bLow); i < Math.min(nBins, bHigh); i++) {
      const w = i <= bCtr
        ? (i - bLow) / Math.max(1, bCtr - bLow)
        : (bHigh - i) / Math.max(1, bHigh - bCtr);
      energy += w * magnitudes[i]; count++;
    }
    bands[b] = count > 0 ? Math.log1p(energy / count) : 0;
  }
  return bands;
}

function spectralCentroid(mags: Float64Array): number {
  let num = 0, den = 0;
  for (let i = 1; i < mags.length; i++) { num += i * mags[i]; den += mags[i]; }
  return den === 0 ? 0 : num / den / mags.length;
}

function zcr(samples: number[]): number {
  let z = 0;
  for (let i = 1; i < samples.length; i++) if ((samples[i] >= 0) !== (samples[i-1] >= 0)) z++;
  return samples.length > 1 ? z / (samples.length - 1) : 0;
}

function pitchProxy(samples: number[]): number {
  const sr = 22050;
  const minLag = Math.floor(sr / 500), maxLag = Math.floor(sr / 80);
  let r0 = 0;
  for (const s of samples) r0 += s * s;
  if (r0 === 0) return 0;
  let bestR = 0;
  for (let lag = minLag; lag <= Math.min(maxLag, samples.length - 1); lag++) {
    let r = 0;
    for (let i = 0; i < samples.length - lag; i++) r += samples[i] * samples[i + lag];
    if (r > bestR) bestR = r;
  }
  return bestR / r0;
}

export function extractBlobEmbedding(blob: Blob): Promise<number[]> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const buf    = new Uint8Array(reader.result as ArrayBuffer);
        const DIMS   = 128;
        const N_BANDS = 32;
        const N_SEG  = 16;
        const stride = blob.type.startsWith("video") ? 2 : 1;

        // Convert bytes to centered samples [-1, 1]
        const samples: number[] = [];
        for (let i = 0; i < buf.length; i += stride) samples.push((buf[i] - 128) / 128);

        if (samples.length < 64) { resolve(new Array(DIMS).fill(0)); return; }

        // Band energies via FFT
        const FFT_SIZE = 1024;
        const start    = Math.max(0, Math.floor(samples.length / 2) - FFT_SIZE / 2);
        const frame    = samples.slice(start, start + FFT_SIZE);
        while (frame.length < FFT_SIZE) frame.push(0);
        const hann = hannWindow(FFT_SIZE);
        const re   = new Float64Array(FFT_SIZE);
        const im   = new Float64Array(FFT_SIZE);
        for (let i = 0; i < FFT_SIZE; i++) re[i] = frame[i] * hann[i];
        fftInPlace(re, im);
        const mags = new Float64Array(FFT_SIZE / 2);
        for (let i = 0; i < FFT_SIZE / 2; i++) mags[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
        const bandE = melBandEnergies(mags, FFT_SIZE, N_BANDS);

        // Delta energies (3-window first derivative)
        const nW = 3, wLen = Math.min(FFT_SIZE, Math.floor(samples.length / nW));
        const allE: Float64Array[] = [];
        for (let w = 0; w < nW; w++) {
          const ws = Math.floor((w / nW) * samples.length);
          const wf = samples.slice(ws, ws + wLen);
          while (wf.length < FFT_SIZE) wf.push(0);
          const wf_ = wf.slice(0, FFT_SIZE);
          const wh  = hannWindow(FFT_SIZE);
          const wre = new Float64Array(FFT_SIZE); const wim = new Float64Array(FFT_SIZE);
          for (let i = 0; i < FFT_SIZE; i++) wre[i] = wf_[i] * wh[i];
          fftInPlace(wre, wim);
          const wm = new Float64Array(FFT_SIZE / 2);
          for (let i = 0; i < FFT_SIZE / 2; i++) wm[i] = Math.sqrt(wre[i]*wre[i] + wim[i]*wim[i]);
          allE.push(melBandEnergies(wm, FFT_SIZE, N_BANDS));
        }
        const deltaE = new Float64Array(N_BANDS);
        for (let b = 0; b < N_BANDS; b++) deltaE[b] = allE[nW-1][b] - allE[0][b];

        // Temporal features
        const segLen = Math.max(1, Math.floor(samples.length / N_SEG));
        const rmsArr = new Float64Array(N_SEG);
        const cntArr = new Float64Array(N_SEG);
        const zcrArr = new Float64Array(N_SEG);
        const pitArr = new Float64Array(N_SEG);
        for (let s = 0; s < N_SEG; s++) {
          const seg = samples.slice(s * segLen, (s + 1) * segLen);
          if (!seg.length) continue;
          rmsArr[s] = Math.sqrt(seg.reduce((a, v) => a + v*v, 0) / seg.length);
          const segF = seg.slice(0, 256); while (segF.length < 256) segF.push(0);
          const sh = hannWindow(256);
          const sr_ = new Float64Array(256); const si = new Float64Array(256);
          for (let i = 0; i < 256; i++) sr_[i] = segF[i] * sh[i];
          fftInPlace(sr_, si);
          const sm = new Float64Array(128);
          for (let i = 0; i < 128; i++) sm[i] = Math.sqrt(sr_[i]*sr_[i] + si[i]*si[i]);
          cntArr[s] = spectralCentroid(sm);
          zcrArr[s] = zcr(seg);
          pitArr[s] = pitchProxy(seg);
        }

        // Assemble + L2-normalize
        const vec = [
          ...Array.from(bandE),   // 32
          ...Array.from(deltaE),  // 32
          ...Array.from(rmsArr),  // 16
          ...Array.from(cntArr),  // 16
          ...Array.from(zcrArr),  // 16
          ...Array.from(pitArr),  // 16
        ];
        const norm = Math.sqrt(vec.reduce((s, v) => s + v*v, 0));
        if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;

        resolve(vec.slice(0, DIMS));
      } catch {
        resolve(new Array(128).fill(0));
      }
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

// ── Temperature-scaled softmax (ported from Copy's classifier.py) ─────────────

function softmax(scores: number[], temperature = 0.10): number[] {
  const scaled = scores.map(s => s / temperature);
  const maxVal = Math.max(...scaled);
  const exps   = scaled.map(s => Math.exp(s - maxVal));
  const sum    = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => sum === 0 ? 0 : e / sum);
}

// ── Nearest-centroid + softmax local matching ─────────────────────────────────

export const MATCH_THRESHOLD    = 0.65;  // softmax confidence threshold
export const MIN_CUES_FOR_TRAINING = 6;

export interface MatchResult {
  matched:    boolean;
  label?:     string;
  confidence?: number; // softmax probability [0..100]
  score?:     number;  // raw cosine similarity [0..100]
  cueId?:     number;
}

export function matchAgainstLocalModel(queryVec: number[], model: LocalModel): MatchResult {
  if (!model.trained || model.cueCount < MIN_CUES_FOR_TRAINING) return { matched: false };

  // Use pre-computed centroids from server if available, else compute on-the-fly
  let centroids = model.centroids ?? {};
  if (Object.keys(centroids).length === 0) {
    // Fallback: compute centroids from raw cue vectors
    const groups: Record<string, number[][]> = {};
    for (const cue of model.cues) {
      if (!groups[cue.label]) groups[cue.label] = [];
      groups[cue.label].push(cue.vector);
    }
    for (const [label, vecs] of Object.entries(groups)) {
      const dims = vecs[0].length;
      const c = new Array(dims).fill(0);
      for (const v of vecs) for (let i = 0; i < dims; i++) c[i] += v[i];
      for (let i = 0; i < dims; i++) c[i] /= vecs.length;
      centroids[label] = c;
    }
  }

  const labels      = Object.keys(centroids);
  if (labels.length === 0) return { matched: false };

  const similarities  = labels.map(l => cosineSim(queryVec, centroids[l]));
  const probabilities = softmax(similarities);

  let bestIdx = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[bestIdx]) bestIdx = i;
  }

  const bestLabel = labels[bestIdx];
  const bestConf  = probabilities[bestIdx];
  const bestScore = similarities[bestIdx];

  if (bestConf >= MATCH_THRESHOLD) {
    // Find the highest-confirmed cue with this label
    const labelCues = model.cues.filter(c => c.label === bestLabel);
    const bestCue   = labelCues.sort((a, b) => b.weight - a.weight)[0];
    return {
      matched:    true,
      label:      bestLabel,
      confidence: Math.round(bestConf * 100),
      score:      Math.round(bestScore * 100),
      cueId:      bestCue?.id,
    };
  }

  return { matched: false };
}
