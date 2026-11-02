// ML Sidecar Communication

export async function callMLSidecar(endpoint: string, data: any): Promise<any> {
  const baseUrl = process.env.ML_SIDECAR_URL || 'http://localhost:8000';
  
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`ML Sidecar error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('ML Sidecar unavailable, using fallback', error);
    return null;
  }
}

export async function embedAudio(audioPath: string): Promise<number[] | null> {
  try {
    const result = await callMLSidecar('/embed', { audioPath });
    return result?.embedding || null;
  } catch (error) {
    console.error('Audio embedding failed', error);
    return null;
  }
}
