import fs from "fs";
import path from "path";
import config from "./config.js";

export async function mlEmbedFile(filePath: string): Promise<number[] | null> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const boundary   = `----NeuroBoundary${Date.now()}`;
    const filename   = path.basename(filePath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: audio/webm\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${config.ML_SIDECAR_URL}/embed`, {
      method:  "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body:    new Uint8Array(body),
      signal:  AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[mlEmbedFile] sidecar returned ${res.status} for ${filename}`);
      return null;
    }
    const data: any = await res.json();
    return Array.isArray(data.vector) ? data.vector : null;
  } catch (err) {
    console.warn(`[mlEmbedFile] failed for ${filePath}:`, err);
    return null;
  }
}

export async function mlEmbed(base64Data: string): Promise<number[] | null> {
  try {
    const audioBuffer = Buffer.from(base64Data, "base64");
    const boundary = `----NeuroBoundary${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="clip.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${config.ML_SIDECAR_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return Array.isArray(data.vector) ? data.vector : null;
  } catch {
    return null;
  }
}

export async function mlRetrain(childId: number, trainingData: { embeddingVector: number[]; meaningId: string }[]): Promise<boolean> {
  try {
    const res = await fetch(`${config.ML_SIDECAR_URL}/retrain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: String(childId), trainingData }),
      signal: AbortSignal.timeout(120000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default { mlEmbedFile, mlEmbed, mlRetrain };
