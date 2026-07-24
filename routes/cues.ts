import express from "express";
import path from "path";
import { existsSync, mkdirSync, renameSync, unlinkSync, readFileSync } from "fs";
import db from "../db/index.js";
import {
  extractEmbedding,
  computeCentroids,
  predictTopN,
  EMBED_VERSION,
  MATCH_THRESHOLD,
} from "../lib/embedder.js";
import { generateStructured } from "../lib/ai-client.js";
import ml from "../lib/ml-sidecar.js";
import uploads from "../lib/uploads.js";
import { authenticate, requireRole } from "../lib/auth.js";

const router = express.Router();

function parseRouteNumber(params: Record<string, string | string[] | undefined>, key: string): number {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return parseInt(raw as string, 10);
}

function childRecordDir(childId: number): string {
  const dir = path.join(uploads.UPLOADS_DIR, "recordings", String(childId));
  try { mkdirSync(dir, { recursive: true }); } catch { }
  return dir;
}

function repairJson(raw: string, endpoint: string): { result: string; repaired: boolean } {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const original = s;
  const opens: string[] = [];
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  const closes = new Set(["}", "]"]);

  for (const ch of s) {
    if (pairs[ch]) opens.push(pairs[ch]);
    else if (closes.has(ch) && opens[opens.length - 1] === ch) opens.pop();
  }

  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';
  s = s.replace(/,\s*([\]}])/g, "$1");
  while (opens.length) s += opens.pop();

  const repaired = s !== original;
  if (repaired) {
    try {
      db.prepare("INSERT INTO ai_repair_log (endpoint, repaired) VALUES (?,1)").run(endpoint);
    } catch {
      // ignore logging failure
    }
  }

  return { result: s, repaired };
}

router.get("/children/:id/cues", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const cues = db.prepare(
    `SELECT id, label, media_type, media_ref, confirmed_count, created_at, updated_at
     FROM cue_library WHERE child_id=? ORDER BY confirmed_count DESC, created_at DESC`
  ).all(childId);

  res.json(cues);
});

router.get("/children/:id/cues/audio/:filename", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const filename = (Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename)
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(uploads.UPLOADS_DIR, "recordings", String(childId), filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  res.setHeader("Content-Type", "audio/webm");
  res.setHeader("Accept-Ranges", "bytes");
  res.sendFile(filePath);
});

router.post(
  "/children/:id/cues/teach",
  authenticate,
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.is("multipart/form-data") ? (uploads.uploadAudio as any).single("audio")(req, res, next) : next();
  },
  async (req: any, res: express.Response) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const label = (req.body.label ?? "").trim();
    const mediaType = req.body.mediaType ?? "audio";
    if (!label) return res.status(400).json({ error: "label required" });

    const uploadedFile: Express.Multer.File | undefined = req.file;
    const mediaData: string | undefined = req.body.mediaData;
    if (!uploadedFile && !mediaData) {
      return res.status(400).json({ error: "audio file or mediaData (base64) required" });
    }

    let embedding: number[] | null = null;
    let embeddingModel = "js-fallback";

    try {
      if (uploadedFile) {
        const dir = childRecordDir(childId);
        const target = path.join(dir, path.basename(uploadedFile.path));
        try { renameSync(uploadedFile.path, target); uploadedFile.path = target; } catch { }
        embedding = await ml.mlEmbedFile(uploadedFile.path);
        if (embedding) embeddingModel = "python-mfcc";
      }

      if (!embedding && mediaData) {
        embedding = await ml.mlEmbed(mediaData);
        if (embedding) embeddingModel = "python-mfcc";
      }

      if (!embedding) {
        const rawData = mediaData ?? (uploadedFile ? readFileSync(uploadedFile.path).toString("base64") : null);
        if (rawData) {
          embedding = extractEmbedding(rawData, "audio");
          embeddingModel = "js-fallback";
        }
      }
    } catch (err) {
      console.warn(`[teach] embedding error for "${label}":`, err);
    }

    const mediaRef = uploadedFile ? uploadedFile.path : null;
    const info = db.prepare(
      `INSERT INTO cue_library (child_id, label, media_type, media_ref, embedding_vector, created_by_user_id)
       VALUES (?,?,?,?,?,?)`
    ).run(childId, label, mediaType, mediaRef, embedding ? JSON.stringify(embedding) : null, sessionUser.userId);
    const cueId = info.lastInsertRowid as number;

    if (embedding) {
      const allCues: any[] = db.prepare(
        "SELECT label, embedding_vector FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
      ).all(childId) as any[];
      if (allCues.length >= 2) {
        ml.mlRetrain(childId, allCues.map((c: any) => ({ embeddingVector: JSON.parse(c.embedding_vector), meaningId: c.label }))).catch(() => {});
      }
    }

    res.json({ id: cueId, label, embeddingSource: embeddingModel, embedded: !!embedding });
  }
);

router.get("/children/:id/cues/model", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const cues: any[] = db.prepare(
    `SELECT id, label, media_type, embedding_vector, confirmed_count
     FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL
     ORDER BY confirmed_count DESC`
  ).all(childId) as any[];

  const examples = cues.map((c: any) => ({ label: c.label as string, vector: JSON.parse(c.embedding_vector) as number[] }));
  const centroids = computeCentroids(examples);
  const model = cues.map((c: any) => ({
    id: c.id,
    label: c.label,
    mediaType: c.media_type,
    vector: JSON.parse(c.embedding_vector),
    weight: c.confirmed_count,
  }));

  res.json({
    childId,
    cueCount: model.length,
    trained: model.length >= 6,
    model,
    centroids,
    embedVersion: EMBED_VERSION,
    matchThreshold: MATCH_THRESHOLD,
    exportedAt: new Date().toISOString(),
  });
});

router.post(
  "/children/:id/cues/record",
  authenticate,
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.is("multipart/form-data") ? (uploads.uploadAudio as any).single("audio")(req, res, next) : next();
  },
  async (req: any, res: express.Response) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const uploadedFile: Express.Multer.File | undefined = req.file;
    const mediaData: string | undefined = req.body.mediaData;
    if (!uploadedFile && !mediaData) return res.status(400).json({ error: "audio file or mediaData (base64) required" });

    const mediaRef = uploadedFile ? uploadedFile.path : null;
    const durationMs = req.body.audioDurationMs ? Number(req.body.audioDurationMs) : null;

    const eventInfo = db.prepare("INSERT INTO cue_events (child_id, media_ref, audio_duration_ms) VALUES (?,?,?)")
      .run(childId, mediaRef, durationMs);
    const eventId = eventInfo.lastInsertRowid as number;

    res.json({ recordingEventId: eventId, status: "recorded", mediaRef });

    setImmediate(async () => {
      try {
        let embedding: number[] | null = null;
        let embeddingModel = "js-fallback";
        if (uploadedFile) {
          embedding = await ml.mlEmbedFile(uploadedFile.path);
          if (embedding) embeddingModel = "python-mfcc";
        }
        if (!embedding && mediaData) {
          embedding = await ml.mlEmbed(mediaData);
          if (embedding) embeddingModel = "python-mfcc";
          else embedding = extractEmbedding(mediaData, "audio");
        }
        if (embedding && embedding.length > 0) {
          db.prepare("UPDATE cue_events SET embedding_vector=?, embedding_model=? WHERE id=?")
            .run(JSON.stringify(embedding), embeddingModel, eventId);
          console.log(`[record] ${embeddingModel} embedding stored for event ${eventId}`);
        }
      } catch (err) {
        console.error(`[record] async embed failed event ${eventId}:`, err);
      }
    });
  }
);

router.post("/children/:id/cues/predict", authenticate, async (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const { sessionUser } = req as any;
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const { recordingEventId } = req.body;
  if (!recordingEventId) return res.status(400).json({ error: "recordingEventId required" });

  const event: any = db.prepare("SELECT id, embedding_vector, embedding_model FROM cue_events WHERE id=? AND child_id=?").get(recordingEventId, childId);
  if (!event) return res.status(404).json({ error: "Recording event not found" });
  if (!event.embedding_vector) return res.status(422).json({ error: "Embedding not ready yet — retry in a moment.", status: "pending" });

  const cues: any[] = db.prepare("SELECT id, label, embedding_vector, confirmed_count FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL").all(childId) as any[];
  if (cues.length === 0) return res.json({ matched: false, eventId: recordingEventId, closestCues: [] });

  const queryVec: number[] = JSON.parse(event.embedding_vector);
  const RAW_COSINE_THRESHOLD = 0.40;
  const examples = cues.map((c: any) => ({ label: c.label, vector: JSON.parse(c.embedding_vector) as number[], id: c.id, weight: c.confirmed_count as number }));
  const centroids = computeCentroids(examples.map(e => ({ label: e.label, vector: e.vector })) as any);
  const topResults = predictTopN(queryVec, centroids, 3);

  const isMatch = topResults.length > 0 && (
    topResults[0].confidence >= MATCH_THRESHOLD ||
    topResults[0].score >= RAW_COSINE_THRESHOLD
  );

  if (isMatch) {
    const best = topResults[0];
    const bestCue = cues.filter((c: any) => c.label === best.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
    db.prepare("UPDATE cue_events SET matched_cue_id=?, match_confidence=? WHERE id=?").run(bestCue.id, best.score, recordingEventId);
    db.prepare("UPDATE cue_library SET confirmed_count = confirmed_count + 1, updated_at = datetime('now') WHERE id=?").run(bestCue.id);
    const displayConfidence = Math.round(Math.max(best.confidence, best.score) * 100);
    return res.json({ matched: true, label: best.label, confidence: displayConfidence, score: Math.round(best.score * 100), cueId: bestCue.id, eventId: recordingEventId, source: event.embedding_model ?? "unknown" });
  }

  const ranked = topResults.map(r => {
    const cue = cues.filter((c: any) => c.label === r.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
    return { id: cue?.id, label: r.label, score: r.score, confidence: r.confidence };
  });

  res.json({ matched: false, eventId: recordingEventId, closestCues: ranked });
});

router.post(
  "/children/:id/cues/recognize",
  authenticate,
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.is("multipart/form-data") ? (uploads.uploadAudio as any).single("audio")(req, res, next) : next();
  },
  async (req: any, res: express.Response) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const uploadedFile: Express.Multer.File | undefined = req.file;
    const mediaData: string | undefined = req.body.mediaData;
    const mediaType: string = req.body.mediaType ?? "audio";
    if (!uploadedFile && !mediaData) return res.status(400).json({ error: "audio file or mediaData (base64) required" });

    const mediaRef = uploadedFile ? uploadedFile.path : null;
    const cues: any[] = db.prepare("SELECT id, label, embedding_vector, confirmed_count FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL").all(childId) as any[];
    if (cues.length === 0) {
      const evInfo = db.prepare("INSERT INTO cue_events (child_id, media_ref) VALUES (?,?)").run(childId, mediaRef);
      return res.json({ matched: false, eventId: evInfo.lastInsertRowid, closestCues: [] });
    }

    let queryVec: number[] | null = null;
    let embModel = "js-fallback";

    if (uploadedFile) {
      queryVec = await ml.mlEmbedFile(uploadedFile.path);
      if (queryVec) embModel = "python-mfcc";
    }
    if (!queryVec && mediaData) {
      queryVec = await ml.mlEmbed(mediaData);
      if (queryVec) embModel = "python-mfcc";
    }
    if (!queryVec) {
      try {
        let raw = mediaData;
        if (!raw && uploadedFile && existsSync(uploadedFile.path)) raw = readFileSync(uploadedFile.path).toString("base64");
        if (raw) { queryVec = extractEmbedding(raw, "audio"); embModel = "js-fallback"; }
      } catch (err) {
        console.warn("[recognize] JS fallback failed:", err);
      }
    }
    if (!queryVec || queryVec.length === 0) return res.status(422).json({ error: "Could not extract audio embedding. Try a longer recording (5–10 seconds)." });

    const RAW_COSINE_THRESHOLD = 0.40;
    const examples = cues.map((c: any) => ({ label: c.label, vector: JSON.parse(c.embedding_vector) as number[], id: c.id, weight: c.confirmed_count as number }));
    const centroids = computeCentroids(examples.map(e => ({ label: e.label, vector: e.vector })) as any);
    const topResults = predictTopN(queryVec, centroids, 3);

    const isMatch = topResults.length > 0 && (
      topResults[0].confidence >= MATCH_THRESHOLD ||
      topResults[0].score >= RAW_COSINE_THRESHOLD
    );

    if (isMatch) {
      const best = topResults[0];
      const bestCue = cues.filter((c: any) => c.label === best.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
      db.prepare("INSERT INTO cue_events (child_id, media_ref, matched_cue_id, match_confidence, embedding_vector, embedding_model) VALUES (?,?,?,?,?,?)")
        .run(childId, mediaRef, bestCue.id, best.score, JSON.stringify(queryVec), embModel);
      db.prepare("UPDATE cue_library SET confirmed_count = confirmed_count + 1, updated_at = datetime('now') WHERE id=?").run(bestCue.id);
      const displayConfidence = Math.round(Math.max(best.confidence, best.score) * 100);
      return res.json({ matched: true, label: best.label, confidence: displayConfidence, score: Math.round(best.score * 100), cueId: bestCue.id, source: embModel });
    }

    const ranked = topResults.map(r => {
      const cue = cues.filter((c: any) => c.label === r.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
      return { id: cue?.id, label: r.label, score: r.score, confidence: r.confidence };
    });
    const evInfo = db.prepare("INSERT INTO cue_events (child_id, media_ref, embedding_vector, embedding_model) VALUES (?,?,?,?)")
      .run(childId, mediaRef, JSON.stringify(queryVec), embModel);
    res.json({ matched: false, eventId: evInfo.lastInsertRowid, closestCues: ranked });
  }
);

router.post("/children/:id/cues/interpret", authenticate, async (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const { sessionUser } = req as any;
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const { eventId, mediaDescription } = req.body;
  const child: any = db.prepare("SELECT onboarding_data FROM children_profiles WHERE id=?").get(childId);
  const profile = child?.onboarding_data ? JSON.parse(child.onboarding_data) : {};

  const confirmedCues: any[] = db.prepare("SELECT label FROM cue_library WHERE child_id=? ORDER BY confirmed_count DESC LIMIT 10").all(childId) as any[];
  const prompt =
    `Child profile:
- Name: ${profile.childName ?? "the child"}
- Age: ${profile.childAge ?? "unknown"}
- Diagnoses: ${profile.diagnoses?.join(", ") || "Not specified"}
- Known sensory triggers: ${profile.sensoryTriggers?.join(", ") || "None noted"}
- Previously confirmed communication cues: ${confirmedCues.map((c: any) => `"${c.label}"`).join(", ") || "None yet"}
${profile.otherDetails ? `- Additional caregiver notes: ${profile.otherDetails}` : ""}
- Audio context: this clip did not match any saved cue and is currently unknown.
${mediaDescription ? `- Caregiver's description: ${mediaDescription}` : "- Caregiver's description: none provided."}

You are NeuroSync, an empathetic AI caregiving assistant.
A caregiver heard an unfamiliar sound or vocalisation from a child with neurodevelopmental needs.
Based on the child's profile, sensory triggers, existing confirmed cues, and any available description, suggest exactly 6 different, plausible interpretations for what the child may be communicating.
Use plain, everyday language and keep each answer short.
Do not claim certainty. Do not offer medical diagnoses or clinical conclusions.
If the sound is unknown, focus on likely needs, feelings, or environmental causes rather than precise labels.
Return ONLY a JSON array with 6 strings.`;

  try {
    let interpretations: string[] = [];
    try {
      const raw = await generateStructured(prompt);
      const { result: repaired } = repairJson(raw, "/api/cues/interpret");
      const parsed = JSON.parse(repaired);
      interpretations = Array.isArray(parsed) ? parsed.slice(0, 6) : Object.values(parsed).slice(0, 6) as string[];
    } catch {
      interpretations = [
        "may be communicating a need",
        "may indicate discomfort",
        "may be seeking attention",
        "may be signaling sensory overload",
        "may be expressing frustration",
        "may want a routine change",
      ];
    }

    if (eventId) {
      db.prepare("UPDATE cue_events SET ai_interpretations=? WHERE id=?").run(JSON.stringify(interpretations), eventId);
    }

    res.json({ interpretations, eventId: eventId ?? null });
  } catch (err: any) {
    console.error("[interpret]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/children/:id/cues/confirm",
  authenticate,
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.is("multipart/form-data") ? (uploads.uploadAudio as any).single("audio")(req, res, next) : next();
  },
  async (req: any, res: express.Response) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { eventId, selectedLabel, mediaData, mediaType, saveToLibrary } = req.body;
    if (!selectedLabel?.trim()) return res.status(400).json({ error: "selectedLabel required" });

    const uploadedFile: Express.Multer.File | undefined = req.file;
    const mediaRef = uploadedFile ? uploadedFile.path : null;

    if (eventId) db.prepare("UPDATE cue_events SET caregiver_selected_interpretation=? WHERE id=?").run(selectedLabel.trim(), eventId);

    if (saveToLibrary !== false && (uploadedFile || mediaData)) {
      let embedding: number[] | null = null;
      let embeddingModel = "js-fallback";
      try {
        if (uploadedFile) { embedding = await ml.mlEmbedFile(uploadedFile.path); if (embedding) embeddingModel = "python-mfcc"; }
        if (!embedding && mediaData) { embedding = await ml.mlEmbed(mediaData); if (embedding) embeddingModel = "python-mfcc"; }
        if (!embedding) {
          const rawData = mediaData ?? (uploadedFile ? readFileSync(uploadedFile.path).toString("base64") : null);
          if (rawData) embedding = extractEmbedding(rawData, mediaType === "video" ? "video" : "audio");
        }
      } catch (err) {
        console.warn(`[confirm] embedding error:`, err);
      }

      const libInfo = db.prepare(
        `INSERT INTO cue_library (child_id, label, media_type, media_ref, embedding_vector, created_by_user_id)
         VALUES (?,?,?,?,?,?)`
      ).run(childId, selectedLabel.trim(), mediaType ?? "audio", mediaRef, embedding ? JSON.stringify(embedding) : null, sessionUser.userId);
      const cueId = libInfo.lastInsertRowid as number;

      if (embedding) {
        const allCues: any[] = db.prepare("SELECT label, embedding_vector FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL").all(childId) as any[];
        if (allCues.length >= 2) {
          ml.mlRetrain(childId, allCues.map((c: any) => ({ embeddingVector: JSON.parse(c.embedding_vector), meaningId: c.label }))).catch(() => {});
        }
      }
    }

    res.json({ status: "confirmed", label: selectedLabel.trim() });
  }
);

router.post("/children/:id/cues/escalate", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const { eventId } = req.body;
  if (eventId) {
    db.prepare("UPDATE cue_events SET escalated=1, escalated_at=datetime('now') WHERE id=?").run(eventId);
  }
  res.json({ status: "escalated" });
});

router.delete("/children/:childId/cues/:cueId", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "childId");
  const cueId = parseRouteNumber(req.params, "cueId");
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const cue: any = db.prepare("SELECT media_ref FROM cue_library WHERE id=? AND child_id=?").get(cueId, childId);
  if (cue?.media_ref) {
    try { if (existsSync(cue.media_ref)) unlinkSync(cue.media_ref); } catch {}
  }

  db.prepare("UPDATE cue_events SET matched_cue_id=NULL WHERE matched_cue_id=?").run(cueId);
  db.prepare("DELETE FROM cue_library WHERE id=? AND child_id=?").run(cueId, childId);
  res.json({ status: "deleted" });
});

router.post("/children/:id/cues/reembed", authenticate, async (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const { sessionUser } = req as any;
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const cues: any[] = db.prepare("SELECT id, label, media_ref, embedding_vector FROM cue_library WHERE child_id=?").all(childId) as any[];
  let reembedded = 0, skipped = 0, failed = 0;

  for (const cue of cues) {
    try {
      let newVec: number[] | null = null;
      if (cue.media_ref && existsSync(cue.media_ref)) {
        newVec = await ml.mlEmbedFile(cue.media_ref);
      }
      if (newVec && newVec.length > 0) {
        db.prepare("UPDATE cue_library SET embedding_vector=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify(newVec), cue.id);
        reembedded++;
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.error(`[reembed] cue ${cue.id} failed:`, err);
    }
  }

  if (reembedded > 0) {
    const allCues: any[] = db.prepare("SELECT label, embedding_vector FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL").all(childId) as any[];
    if (allCues.length >= 2) {
      await ml.mlRetrain(childId, allCues.map((c: any) => ({ embeddingVector: JSON.parse(c.embedding_vector), meaningId: c.label })));
    }
  }

  res.json({ reembedded, skipped, failed, total: cues.length });
});

router.get("/children/:id/cue-events", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const events = db.prepare(
    `SELECT ce.id, ce.matched_cue_id, ce.match_confidence,
            ce.ai_interpretations, ce.caregiver_selected_interpretation,
            ce.escalated, ce.created_at,
            cl.label as matched_label
     FROM   cue_events ce
     LEFT JOIN cue_library cl ON cl.id = ce.matched_cue_id
     WHERE  ce.child_id = ?
     ORDER  BY ce.created_at DESC LIMIT 30`
  ).all(childId);

  res.json(events);
});

router.post("/children/:id/cues/contribute-pool", authenticate, (req, res) => {
  const childId = parseRouteNumber(req.params, "id");
  const { sessionUser } = req as any;
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?").get(sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access" });

  const { embeddingVector, confirmedLabel } = req.body;
  if (!Array.isArray(embeddingVector) || !confirmedLabel?.trim()) {
    return res.status(400).json({ error: "embeddingVector (array) and confirmedLabel required" });
  }

  db.prepare("INSERT INTO shared_cue_pool (embedding_vector, confirmed_label, child_id) VALUES (?,?,?)")
    .run(JSON.stringify(embeddingVector), confirmedLabel.trim(), childId);
  res.json({ status: "contributed" });
});

router.post("/admin/shared-pool/recluster", authenticate, requireRole("district_admin"), async (req, res) => {
  const rows: any[] = db.prepare(
    "SELECT id, embedding_vector, confirmed_label FROM shared_cue_pool"
  ).all() as any[];

  if (rows.length < 10) {
    return res.json({ status: "skipped", reason: "insufficient_data", count: rows.length });
  }

  const K = Math.min(20, Math.floor(rows.length / 5));
  const vectors = rows.map((r: any) => JSON.parse(r.embedding_vector) as number[]);
  const labels  = rows.map((r: any) => r.confirmed_label as string);
  const dims    = vectors[0].length;

  const centroids: number[][] = [vectors[Math.floor(Math.random() * vectors.length)]];
  while (centroids.length < K) {
    const dists = vectors.map(v => {
      const minDist = Math.min(...centroids.map(c => {
        let d = 0;
        for (let i = 0; i < dims; i++) d += (v[i] - c[i]) ** 2;
        return d;
      }));
      return minDist;
    });
    const total = dists.reduce((s, d) => s + d, 0);
    let rnd = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < dists.length; i++) { rnd -= dists[i]; if (rnd <= 0) { chosen = i; break; } }
    centroids.push(vectors[chosen]);
  }

  let assignments = new Array(vectors.length).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let best = 0, bestDot = -Infinity;
      for (let k = 0; k < K; k++) {
        let dot = 0, magA = 0, magB = 0;
        for (let d = 0; d < dims; d++) {
          dot  += vectors[i][d] * centroids[k][d];
          magA += vectors[i][d] ** 2;
          magB += centroids[k][d] ** 2;
        }
        const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
        if (sim > bestDot) { bestDot = sim; best = k; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    for (let k = 0; k < K; k++) {
      const members = vectors.filter((_, i) => assignments[i] === k);
      if (members.length === 0) continue;
      const newC = new Array(dims).fill(0);
      for (const v of members) for (let d = 0; d < dims; d++) newC[d] += v[d];
      for (let d = 0; d < dims; d++) newC[d] /= members.length;
      centroids[k] = newC;
    }
    if (!changed) break;
  }

  db.prepare("DELETE FROM shared_cue_clusters").run();
  const insertCluster = db.prepare(
    "INSERT INTO shared_cue_clusters (cluster_id, centroid, top_labels, member_count) VALUES (?,?,?,?)"
  );
  let saved = 0;
  for (let k = 0; k < K; k++) {
    const memberLabels = labels.filter((_, i) => assignments[i] === k);
    if (memberLabels.length === 0) continue;
    const freq: Record<string, number> = {};
    for (const l of memberLabels) freq[l] = (freq[l] ?? 0) + 1;
    const topLabels = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));
    insertCluster.run(`cluster_${k}`, JSON.stringify(centroids[k]), JSON.stringify(topLabels), memberLabels.length);
    saved++;
  }

  res.json({ status: "ok", clusters: saved, totalVectors: rows.length });
});

export default router;
