// ML Sidecar Communication
import { AIResponse } from './types/index.js';

// Constants
const ML_SIDECAR_TIMEOUT = 30000; // 30 seconds

interface MLSidecarResponse {
  status?: string;
  error?: string;
  embedding?: number[];
  result?: any;
}

interface EmbedAudioRequest {
  audioPath: string;
}

interface EmbedAudioResponse {
  embedding: number[];
  audioPath: string;
}

/**
 * Call ML Sidecar with timeout protection
 */
export async function callMLSidecar<T = MLSidecarResponse>(
  endpoint: string,
  data: Record<string, any>
): Promise<T | null> {
  const baseUrl = process.env.ML_SIDECAR_URL || 'http://localhost:8000';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ML_SIDECAR_TIMEOUT);

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`ML Sidecar error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(`ML Sidecar timeout after ${ML_SIDECAR_TIMEOUT}ms`, error);
      } else {
        console.error('ML Sidecar unavailable:', error.message);
      }
    } else {
      console.error('ML Sidecar unavailable:', error);
    }
    return null;
  }
}

/**
 * Embed audio file using ML sidecar
 */
export async function embedAudio(audioPath: string): Promise<number[] | null> {
  try {
    const request: EmbedAudioRequest = { audioPath };
    const result = await callMLSidecar<EmbedAudioResponse>('/embed', request);

    if (result && Array.isArray(result.embedding)) {
      return result.embedding;
    }

    return null;
  } catch (error) {
    console.error('Audio embedding failed:', error);
    return null;
  }
}
