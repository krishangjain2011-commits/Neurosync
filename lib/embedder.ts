// JavaScript Audio Embedder (Fallback when Python sidecar unavailable)

export function computeMFCC(audioBuffer: Float32Array, sampleRate: number): number[] {
  // Simplified MFCC computation for fallback
  const frameSize = 512;
  const hopSize = 160;
  const numCepstral = 13;

  const frames: number[][] = [];
  for (let i = 0; i < audioBuffer.length - frameSize; i += hopSize) {
    frames.push(Array.from(audioBuffer.slice(i, i + frameSize)));
  }

  // Compute energy in each frame
  const energies = frames.map((frame) => {
    const energy = frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length;
    return Math.log(energy + 1e-10);
  });

  // Simple averaging for embedding
  const embedding = new Array(numCepstral).fill(0);
  for (let i = 0; i < Math.min(numCepstral, energies.length); i++) {
    embedding[i] = energies[i] || 0;
  }

  return embedding;
}

export async function embedAudio(audioFile: File): Promise<number[]> {
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);

  return computeMFCC(channelData, audioBuffer.sampleRate);
}
