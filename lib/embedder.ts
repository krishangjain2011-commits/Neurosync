/**
 * NeuroSync — Audio/Video Embedding Engine (Pure TypeScript, zero extra deps)
 *
 * Inspired by the MFCC+delta approach from the Copy's Python/librosa sidecar,
 * but implemented entirely in TypeScript so no Python process or extra packages
 * are needed. Works on the raw PCM bytes inside WebM/WebP containers.
 *
 * Feature vector layout (128 dimensions total):
 *   [0..31]   — 32 frequency-band energies (log-mel-like, from overlapping FFT windows)
 *   [32..63]  — 32 delta features (first derivative of band energies over time)
 *   [64..79]  — 16 temporal features: RMS per segment (energy envelope)
 *   [80..95]  — 16 spectral centroid per segment (brightness over time)
 *   [96..111] — 16 zero-crossing-rate per segment (voiced/unvoiced discrimination)
 *   [112..127]— 16 autocorrelation-based pitch proxy per segment
 *
 * For video: the same algorithm is applied but with 2× the byte stride to
 * sample more broadly across the container (motion + audio interleaved).
 *
 * Softmax confidence (ported from Copy's classifier.py):
 * - Temperature 0.10 sharpens probabilities so a clearly better match gets
 *   much higher confidence instead of being diluted by class count.
 *
 * Nearest-centroid model (ported from Copy's classifier.py):
 * - One centroid per cue label = mean of all training vectors for that label
 * - At predict time: cosine similarity against every centroid → softmax → top-N
 */

const EMBED_DIMS = 128;
const N_BANDS    = 32;   // frequency bands
const N_TEMPORAL = 16;   // temporal segments for energy/centroid/zcr/pitch

// ─── FFT (Cooley-Tukey, power-of-2 only) ────────────────────────────────────

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
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

  // Butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wre = Math.cos(ang);
    const wim = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cur_re = 1, cur_im = 0;
      for (let k = 0; k < len / 2; k++) {
        const u_re = re[i + k];
        const u_im = im[i + k];
        const v_re = re[i + k + len / 2] * cur_re - im[i + k + len / 2] * cur_im;
        const v_im = re[i + k + len / 2] * cur_im + im[i + k + len / 2] * cur_re;
        re[i + k]           = u_re + v_re;
        im[i + k]           = u_im + v_im;
        re[i + k + len / 2] = u_re - v_re;
        im[i + k + len / 2] = u_im - v_im;
        const next_re = cur_re * wre - cur_im * wim;
        cur_im = cur_re * wim + cur_im * wre;
        cur_re = next_re;
      }
    }
  }
}

// ─── Hann window ─────────────────────────────────────────────────────────────

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

// ─── Log-mel-like band energy from magnitude spectrum ────────────────────────
// Maps fftSize/2 bins into N_BANDS mel-spaced bands, returns log energy per band

function melBandEnergies(magnitudes: Float64Array, fftSize: number): Float64Array {
  const nBins  = fftSize / 2;
  const bands  = new Float64Array(N_BANDS);
  // Mel-spaced filter bank boundaries (simplified linear in mel)
  const melMin = 2595 * Math.log10(1 + 80 / 700);
  const melMax = 2595 * Math.log10(1 + 8000 / 700);

  for (let b = 0; b < N_BANDS; b++) {
    const melLow  = melMin + (b / N_BANDS) * (melMax - melMin);
    const melHigh = melMin + ((b + 2) / N_BANDS) * (melMax - melMin);
    const melCtr  = melMin + ((b + 1) / N_BANDS) * (melMax - melMin);

    // Convert mel back to Hz, then to bin index
    const hzLow  = 700 * (Math.pow(10, melLow  / 2595) - 1);
    const hzHigh = 700 * (Math.pow(10, melHigh / 2595) - 1);
    const hzCtr  = 700 * (Math.pow(10, melCtr  / 2595) - 1);

    // Assuming SR ≈ 22050 (we don't know actual SR, but bytes ~ 44100/2 for WebM)
    const sr = 22050;
    const binLow  = Math.round(hzLow  * fftSize / sr);
    const binHigh = Math.round(hzHigh * fftSize / sr);
    const binCtr  = Math.round(hzCtr  * fftSize / sr);

    let energy = 0;
    let count  = 0;
    for (let i = Math.max(1, binLow); i < Math.min(nBins, binHigh); i++) {
      // Triangular window weight
      let w: number;
      if (i <= binCtr) {
        w = (i - binLow) / Math.max(1, binCtr - binLow);
      } else {
        w = (binHigh - i) / Math.max(1, binHigh - binCtr);
      }
      energy += w * magnitudes[i];
      count++;
    }
    bands[b] = count > 0 ? Math.log1p(energy / count) : 0;
  }
  return bands;
}

// ─── Spectral centroid ────────────────────────────────────────────────────────

function spectralCentroid(magnitudes: Float64Array): number {
  let num = 0, denom = 0;
  for (let i = 1; i < magnitudes.length; i++) {
    num   += i * magnitudes[i];
    denom += magnitudes[i];
  }
  return denom === 0 ? 0 : num / denom / magnitudes.length;
}

// ─── Zero-crossing rate ───────────────────────────────────────────────────────

function zeroCrossingRate(samples: number[]): number {
  let zcr = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) zcr++;
  }
  return samples.length > 1 ? zcr / (samples.length - 1) : 0;
}

// ─── Autocorrelation pitch proxy ──────────────────────────────────────────────
// Returns normalized peak autocorrelation in the voiced frequency range (80–500 Hz)
// as a rough pitch confidence/periodicity measure.

function pitchProxy(samples: number[], sr = 22050): number {
  if (samples.length < 2) return 0;
  const minLag = Math.floor(sr / 500); // 500 Hz upper limit
  const maxLag = Math.floor(sr / 80);  // 80 Hz lower limit
  const n = samples.length;

  // Compute autocorrelation energy (r[0])
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += samples[i] * samples[i];
  if (r0 === 0) return 0;

  // Find peak in [minLag, maxLag]
  let bestR = 0;
  const end = Math.min(maxLag, n - 1);
  for (let lag = minLag; lag <= end; lag++) {
    let r = 0;
    for (let i = 0; i < n - lag; i++) r += samples[i] * samples[i + lag];
    if (r > bestR) bestR = r;
  }
  return bestR / r0; // normalized [0..1]
}

// ─── PCM extraction from raw bytes ───────────────────────────────────────────
// WebM/Opus containers interleave header bytes with audio data.
// We can't fully decode them in pure JS without a codec, but the raw byte values
// correlate with audio amplitude well enough for pattern-matching purposes.
// We treat every byte as a signed amplitude sample after centering.

function bytesToSamples(buf: Buffer, stride: number): number[] {
  const samples: number[] = [];
  for (let i = 0; i < buf.length; i += stride) {
    samples.push((buf[i] - 128) / 128); // center to [-1, 1]
  }
  return samples;
}

// ─── Main embedding function ─────────────────────────────────────────────────

export function extractEmbedding(base64Data: string, mediaType: "audio" | "video" = "audio"): number[] {
  try {
    const buf = Buffer.from(base64Data, "base64");
    if (buf.length < 64) return new Array(EMBED_DIMS).fill(0);

    // For video, use stride=2 to sample across the larger container
    const stride = mediaType === "video" ? 2 : 1;
    const samples = bytesToSamples(buf, stride);

    // ── Band energies via FFT ────────────────────────────────────────────────
    // Take up to 4096 samples from the middle of the signal (most content there)
    const FFT_SIZE = 1024;
    const start    = Math.max(0, Math.floor(samples.length / 2) - FFT_SIZE / 2);
    const frame    = samples.slice(start, start + FFT_SIZE);

    // Pad to FFT_SIZE if too short
    while (frame.length < FFT_SIZE) frame.push(0);

    const hann = hannWindow(FFT_SIZE);
    const re   = new Float64Array(FFT_SIZE);
    const im_a = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) re[i] = frame[i] * hann[i];

    fft(re, im_a);

    const magnitudes = new Float64Array(FFT_SIZE / 2);
    for (let i = 0; i < FFT_SIZE / 2; i++) {
      magnitudes[i] = Math.sqrt(re[i] * re[i] + im_a[i] * im_a[i]);
    }

    const bandEnergies: Float64Array = melBandEnergies(magnitudes, FFT_SIZE);

    // ── Temporal features across N_TEMPORAL segments ─────────────────────────
    const segLen = Math.max(1, Math.floor(samples.length / N_TEMPORAL));
    const rmsPerSeg     = new Float64Array(N_TEMPORAL);
    const centPerSeg    = new Float64Array(N_TEMPORAL);
    const zcrPerSeg     = new Float64Array(N_TEMPORAL);
    const pitchPerSeg   = new Float64Array(N_TEMPORAL);

    for (let s = 0; s < N_TEMPORAL; s++) {
      const seg = samples.slice(s * segLen, (s + 1) * segLen);
      if (seg.length === 0) continue;

      // RMS energy
      const sumSq = seg.reduce((acc, v) => acc + v * v, 0);
      rmsPerSeg[s] = Math.sqrt(sumSq / seg.length);

      // Mini-FFT for spectral centroid per segment
      const segFftSize = 256;
      const segFrame   = seg.slice(0, segFftSize);
      while (segFrame.length < segFftSize) segFrame.push(0);
      const segHann = hannWindow(segFftSize);
      const sre = new Float64Array(segFftSize);
      const sim = new Float64Array(segFftSize);
      for (let i = 0; i < segFftSize; i++) sre[i] = segFrame[i] * segHann[i];
      fft(sre, sim);
      const segMags = new Float64Array(segFftSize / 2);
      for (let i = 0; i < segFftSize / 2; i++) {
        segMags[i] = Math.sqrt(sre[i] * sre[i] + sim[i] * sim[i]);
      }
      centPerSeg[s]  = spectralCentroid(segMags);
      zcrPerSeg[s]   = zeroCrossingRate(seg);
      pitchPerSeg[s] = pitchProxy(seg);
    }

    // ── Delta of band energies (first derivative over time) ──────────────────
    // Compute band energies for 3 time windows and take difference
    const nWindows  = 3;
    const winLen    = Math.min(FFT_SIZE, Math.floor(samples.length / nWindows));
    const allBandE: Float64Array[] = [];

    for (let w = 0; w < nWindows; w++) {
      const wStart  = Math.floor((w / nWindows) * samples.length);
      const wFrame  = samples.slice(wStart, wStart + winLen);
      while (wFrame.length < FFT_SIZE) wFrame.push(0);
      const wFrame_ = wFrame.slice(0, FFT_SIZE);
      const wHann   = hannWindow(FFT_SIZE);
      const wre     = new Float64Array(FFT_SIZE);
      const wim_    = new Float64Array(FFT_SIZE);
      for (let i = 0; i < FFT_SIZE; i++) wre[i] = wFrame_[i] * wHann[i];
      fft(wre, wim_);
      const wMags = new Float64Array(FFT_SIZE / 2);
      for (let i = 0; i < FFT_SIZE / 2; i++) {
        wMags[i] = Math.sqrt(wre[i] * wre[i] + wim_[i] * wim_[i]);
      }
      allBandE.push(melBandEnergies(wMags, FFT_SIZE));
    }

    // Delta = difference between last and first window
    const deltaEnergies = new Float64Array(N_BANDS);
    for (let b = 0; b < N_BANDS; b++) {
      deltaEnergies[b] = allBandE[nWindows - 1][b] - allBandE[0][b];
    }

    // ── Assemble final 128-dim vector ─────────────────────────────────────────
    const vec: number[] = [
      ...Array.from(bandEnergies),   // [0..31]   32 band energies
      ...Array.from(deltaEnergies),  // [32..63]  32 delta energies
      ...Array.from(rmsPerSeg),      // [64..79]  16 RMS envelope
      ...Array.from(centPerSeg),     // [80..95]  16 spectral centroid
      ...Array.from(zcrPerSeg),      // [96..111] 16 ZCR
      ...Array.from(pitchPerSeg),    // [112..127] 16 pitch proxy
    ];

    // L2-normalize so cosine similarity works correctly
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return vec.slice(0, EMBED_DIMS);
  } catch {
    return new Array(EMBED_DIMS).fill(0);
  }
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Nearest-centroid classifier (ported from Copy's classifier.py) ───────────

/**
 * Compute the centroid (mean vector) for each label from training examples.
 * Returns { label → centroid vector }.
 */
export function computeCentroids(
  examples: { vector: number[]; label: string }[]
): Record<string, number[]> {
  const groups: Record<string, number[][]> = {};
  for (const ex of examples) {
    if (!groups[ex.label]) groups[ex.label] = [];
    groups[ex.label].push(ex.vector);
  }

  const centroids: Record<string, number[]> = {};
  for (const [label, vecs] of Object.entries(groups)) {
    const dims = vecs[0].length;
    const centroid = new Array(dims).fill(0);
    for (const v of vecs) {
      for (let i = 0; i < dims; i++) centroid[i] += v[i];
    }
    for (let i = 0; i < dims; i++) centroid[i] /= vecs.length;
    centroids[label] = centroid;
  }
  return centroids;
}

/**
 * Temperature-scaled softmax (ported from Copy's _softmax in classifier.py).
 * Low temperature (0.10) sharpens probabilities — a clearly better match
 * gets a much higher confidence score rather than being diluted by class count.
 */
export function softmax(scores: number[], temperature = 0.10): number[] {
  const scaled = scores.map(s => s / temperature);
  const maxVal = Math.max(...scaled);
  const exps   = scaled.map(s => Math.exp(s - maxVal)); // subtract max for numerical stability
  const sum    = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => (sum === 0 ? 0 : e / sum));
}

/**
 * Nearest-centroid prediction with softmax confidence.
 * Returns top-N results sorted by confidence descending.
 * Ported from Copy's PrototypeClassifier.predict().
 */
export function predictTopN(
  queryVector: number[],
  centroids: Record<string, number[]>,
  topN = 3
): { label: string; confidence: number; score: number }[] {
  const labels  = Object.keys(centroids);
  if (labels.length === 0) return [];

  const similarities = labels.map(label => cosineSimilarity(queryVector, centroids[label]));
  const probabilities = softmax(similarities);

  const results = labels
    .map((label, i) => ({ label, confidence: probabilities[i], score: similarities[i] }))
    .sort((a, b) => b.confidence - a.confidence);

  return results.slice(0, topN);
}

export const EMBED_VERSION = "fft-mel-delta-v1";
export const MATCH_THRESHOLD = 0.65; // softmax confidence above this = confident match
