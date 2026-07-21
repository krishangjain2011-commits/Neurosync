import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load .env manually (tsx doesn't auto-load dotenv)
const envFile = path.join(__dirname, ".env");
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
  console.log("[env] Loaded .env from", envFile);
}

import db from "./db/index.js";
import {
  createToken, revokeToken, authenticate, requireRole,
  purgeExpiredTokens,
} from "./lib/auth.js";
import { assertConsent, revokeConsent, eraseChildData } from "./lib/consent.js";
import { translateToEnglish, translateFromEnglish } from "./lib/language-bridge.js";
import {
  generateText, generateStructured, streamChat,
  getActiveProvider, SYSTEM_INSTRUCTION,
} from "./lib/ai-client.js";
import { purgeStaleCueMedia } from "./db/index.js";
import {
  extractEmbedding, cosineSimilarity, computeCentroids,
  predictTopN, EMBED_VERSION, MATCH_THRESHOLD,
} from "./lib/embedder.js";

// ── ML Sidecar client ─────────────────────────────────────────────────────────
// Calls the Python FastAPI sidecar (ml/main.py) for real MFCC embeddings.
// Falls back gracefully if the sidecar isn't running.

const ML_SIDECAR_URL = process.env.ML_SIDECAR_URL ?? "http://localhost:8000";

// ── Audio file storage (multer) ───────────────────────────────────────────────
// Recordings are saved to uploads/recordings/<childId>/ on the server.
// They are referenced in cue_events.media_ref and cue_library.media_ref.
// purgeStaleCueMedia() hard-deletes files after 30 days (DPDP §8).

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(__dirname, "uploads");
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct";

const audioStorage = (multer as any).diskStorage({
  destination: (req: express.Request, _file: any, cb: Function) => {
    const childId = req.params.id ?? req.params.childId ?? "unknown";
    const dir = path.join(UPLOADS_DIR, "recordings", String(childId));
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req: express.Request, file: any, cb: Function) => {
    const ext = path.extname(file.originalname || "audio.webm") || ".webm";
    cb(null, `${Date.now()}${ext}`);
  },
});

const uploadAudio = (multer as any)({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req: express.Request, file: any, cb: Function) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are accepted"));
    }
  },
});

const handwritingStorage = (multer as any).memoryStorage();
const uploadHandwriting = (multer as any)({
  storage: handwritingStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: express.Request, file: any, cb: Function) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are accepted"));
    }
  },
});

/**
 * Embed an audio file that is already on disk by streaming it to the ML sidecar.
 * Falls back to JS embedder on base64 data when the file path is not available.
 */
async function mlEmbedFile(filePath: string): Promise<number[] | null> {
  try {
    const fileBuffer = readFileSync(filePath);
    const boundary   = `----NeuroBoundary${Date.now()}`;
    const filename   = path.basename(filePath);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: audio/webm\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${ML_SIDECAR_URL}/embed`, {
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

async function mlEmbed(base64Data: string): Promise<number[] | null> {
  try {
    // Convert base64 to Buffer, then to a Blob-compatible form for the multipart request
    const audioBuffer = Buffer.from(base64Data, "base64");
    const boundary = `----NeuroBoundary${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="clip.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${ML_SIDECAR_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return Array.isArray(data.vector) ? data.vector : null;
  } catch {
    return null; // sidecar not running — caller will fall back
  }
}

async function mlRetrain(childId: number, trainingData: { embeddingVector: number[]; meaningId: string }[]): Promise<boolean> {
  try {
    const res = await fetch(`${ML_SIDECAR_URL}/retrain`, {
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

async function mlPredict(childId: number, vector: number[], meanings: { id: string; title: string }[]): Promise<{ topMeaningId: string; topConfidence: number; alternatives: any[] } | null> {
  try {
    const res = await fetch(`${ML_SIDECAR_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: String(childId), embeddingVector: vector, meanings }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

purgeExpiredTokens();
setInterval(purgeExpiredTokens, 1000 * 60 * 60); // hourly
purgeStaleCueMedia();
setInterval(purgeStaleCueMedia, 1000 * 60 * 60 * 24); // daily

// SYSTEM_INSTRUCTION is imported from lib/ai-client.ts

// MODEL and getGenAI() are handled inside lib/ai-client.ts

// Parse handwriting analysis from markdown if JSON fails
function parseHandwritingFromMarkdown(text: string): any {
  // Split into lines and categorize by type
  const lines: string[] = [];
  const textLines = text.split('\n');
  
  let inAnalysisSection = false;
  let inTranscriptionSection = false;
  
  for (const line of textLines) {
    const trimmed = line.trim();
    
    // Skip empty lines, headers, section markers
    if (!trimmed || trimmed.startsWith('#') || trimmed.match(/^[*_-]{3,}$/) || trimmed.startsWith('**')) {
      continue;
    }
    
    // Detect section markers (these indicate analysis, not transcription)
    if (trimmed.match(/^(analysis|pattern|observation|note|comment|metadata):/i)) {
      inAnalysisSection = true;
      inTranscriptionSection = false;
      continue;
    }
    
    // Detect if this looks like actual handwritten content section
    if (trimmed.match(/^(transcription|written|handwritten|text|reading|what was written|actual content)/i)) {
      inTranscriptionSection = true;
      inAnalysisSection = false;
      continue;
    }
    
    // Skip lines that are clearly analysis/explanation
    if (trimmed.match(/^(the|this|this image|the handwriting|the child|the student|appears|shows|looks|seems|appears to be|likely|probably|may|might)/i)
        || trimmed.match(/caregiver|diagnostic|analysis|observe|characterize|exhibit/i)) {
      continue;
    }
    
    // Extract actual content from list items
    let content = trimmed
      .replace(/^[-•*+]\s+/, '')  // Remove list markers
      .replace(/^\d+[\d.)\s:-]*/, '')  // Remove numbered list markers
      .replace(/^(?:line|word|text|item|note)[\s\d.:-]*/i, '')  // Remove line/word labels
      .replace(/^["']([^"']+)["'].*/, '$1')  // Extract quoted text
      .replace(/^-\s+/, '')  // Remove dashes
      .trim();
    
    // Quality checks for actual handwritten content
    const hasLetters = /[a-zA-Z]/.test(content);
    const hasWords = /\w{2,}/.test(content);
    const isNotMetadata = !content.match(/^[*_\-`#]/) && !content.includes('**');
    const isReasonableLength = content.length > 0 && content.length < 500;
    const notAnalysisContent = !content.match(/reversal|phonetic|spacing|sizing|pattern|observed|appears|shows/i);
    
    if (hasLetters && hasWords && isNotMetadata && isReasonableLength && notAnalysisContent) {
      lines.push(content);
      console.log(`[handwriting-parser] Found content: "${content.substring(0, 60)}"`);
    }
  }
  
  console.log(`[handwriting-parser] Extracted ${lines.length} content lines from markdown`);
  
  // If we found content lines, use them; otherwise fall back to generic message
  const rawTranscription = lines.length > 0 
    ? lines.slice(0, 8).join(' ').substring(0, 500)
    : "No transcription extracted";
    
  const interpretedText = lines.length > 0
    ? lines.slice(0, 5).join(' ').substring(0, 500)
    : "Unable to interpret";

  console.log(`[handwriting-parser] Final extraction - Raw: "${rawTranscription.substring(0, 100)}"`);

  return {
    raw_transcription: rawTranscription,
    interpreted_text: interpretedText,
    b_d_reversals: text.match(/\b[bd].*?[bd]|reversal|swap|confusion/i) ? 1 : 0,
    p_q_reversals: text.match(/\b[pq].*?[pq]/i) ? 1 : 0,
    other_reversals: [],
    phonetic_substitutions: [],
    spacing_irregular: text.match(/spacing|irregular|space|scatter|inconsistent spacing/i) ? true : false,
    sizing_inconsistent: text.match(/sizing|inconsistent|size|vary|varied size/i) ? true : false,
    observations: lines.length > 0 ? `${lines.length} lines extracted` : "Unable to extract text"
  };
}

// Self-healing JSON repair with telemetry
function repairJson(raw: string, endpoint: string): { result: string; repaired: boolean } {
  let s = raw.trim();
  
  // Remove markdown code blocks if present
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  
  const original = s;
  const opens: string[] = [];
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  const closes = new Set(["}", "]"]);
  
  for (const ch of s) {
    if (pairs[ch]) opens.push(pairs[ch]);
    else if (closes.has(ch) && opens[opens.length - 1] === ch) opens.pop();
  }
  
  // Fix common JSON issues
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';
  s = s.replace(/,\s*([\]}])/g, "$1");
  while (opens.length) s += opens.pop();
  
  const repaired = s !== original;
  if (repaired) {
    db.prepare("INSERT INTO ai_repair_log (endpoint, repaired) VALUES (?,1)").run(endpoint);
    console.warn(`[JSON] Repair on ${endpoint}`);
  }
  return { result: s, repaired };
}

// Cookie helper
function setTokenCookie(res: express.Response, token: string): void {
  res.setHeader("Set-Cookie",
    `neurosync_token=${token}; HttpOnly; SameSite=${process.env.NODE_ENV === "production" ? "None; Secure" : "Lax"}; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  );
}

function clearTokenCookie(res: express.Response): void {
  res.setHeader("Set-Cookie", "neurosync_token=; HttpOnly; Path=/; Max-Age=0");
}

function parseRouteNumber(params: Record<string, string | string[] | undefined>, key: string): number {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return parseInt(raw, 10);
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: false, limit: "20mb" }));

  // ── HEALTH CHECK (unauthenticated — used by Render) ───────────────────────
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Auth rate limiting — brute-force protection
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    message: { error: "Too many requests — please try again in 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ── AUTH ROUTES ────────────────────────────────────────────────────────────

  app.post("/api/register", authLimiter, async (req, res) => {
    const { email, password, displayName, role, orgId, preferredLanguage } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    // Resolve org: use provided orgId or fall back to default org 1
    const targetOrgId = orgId ?? 1;
    const org = db.prepare("SELECT id FROM organizations WHERE id = ?").get(targetOrgId);
    if (!org) return res.status(400).json({ error: "Organization not found" });

    const safeRole = role && ["parent","caregiver","anganwadi_worker","special_educator","asha_worker"].includes(role)
      ? role : "parent";

    try {
      const hash = await bcrypt.hash(password, 12);
      const info = db.prepare(
        "INSERT INTO users (org_id, email, password_hash, role, display_name, preferred_language) VALUES (?,?,?,?,?,?)"
      ).run(targetOrgId, email, hash, safeRole, displayName ?? null, preferredLanguage ?? "en");

      const userId = info.lastInsertRowid as number;
      const token  = createToken(userId);
      setTokenCookie(res, token);
      res.json({ token, email, role: safeRole, displayName: displayName ?? null });
    } catch (err: any) {
      if (err.code === "SQLITE_CONSTRAINT")
        return res.status(400).json({ error: "Email already registered" });
      console.error("[register]", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/login", authLimiter, async (req, res) => {
    const { email, password } = req.body;
    const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: "Invalid credentials" });

    const token = createToken(user.id);
    setTokenCookie(res, token);
    res.json({ token, email: user.email, role: user.role, displayName: user.display_name });
  });

  app.post("/api/logout", authenticate, (req, res) => {
    revokeToken((req as any).sessionToken);
    clearTokenCookie(res);
    res.json({ status: "ok" });
  });

  app.get("/api/me", authenticate, (req, res) => {
    const { userId } = (req as any).sessionUser;
    const user: any = db.prepare(
      "SELECT id, org_id, email, role, display_name, preferred_language FROM users WHERE id = ?"
    ).get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Return children accessible to this user
    const children = db.prepare(
      `SELECT cp.id, cp.onboarding_data, cp.created_at
       FROM children_profiles cp
       JOIN child_access ca ON ca.child_id = cp.id
       WHERE ca.user_id = ?`
    ).all(userId);

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
      preferredLanguage: user.preferred_language,
      children: children.map((c: any) => ({
        ...c,
        onboarding_data: c.onboarding_data ? JSON.parse(c.onboarding_data) : null,
      })),
    });
  });

  // ── CHILDREN PROFILES ─────────────────────────────────────────────────────

  app.post("/api/children", authenticate, (req, res) => {
    const { sessionUser } = req as any;
    const { onboardingData, consentScope, consentExpiresAt } = req.body;
    if (!onboardingData) return res.status(400).json({ error: "onboardingData required" });

    // Create consent record first
    const consentId = db.prepare(
      "INSERT INTO consent_records (consenting_parent_user_id, consent_scope, consent_expires_at) VALUES (?,?,?)"
    ).run(
      sessionUser.userId,
      JSON.stringify(consentScope ?? { purposes: ["caregiving"], dataTypes: ["behavioral","dietary","routines"] }),
      consentExpiresAt ?? null
    ).lastInsertRowid as number;

    db.prepare("INSERT INTO consent_audit_log (consent_id, action, actor_user_id) VALUES (?,'granted',?)")
      .run(consentId, sessionUser.userId);

    const childId = db.prepare(
      "INSERT INTO children_profiles (org_id, added_by_user_id, consent_record_id, onboarding_data) VALUES (?,?,?,?)"
    ).run(sessionUser.orgId, sessionUser.userId, consentId, JSON.stringify(onboardingData))
      .lastInsertRowid as number;

    // Grant access to the creator
    db.prepare("INSERT INTO child_access (user_id, child_id, granted_by) VALUES (?,?,?)")
      .run(sessionUser.userId, childId, sessionUser.userId);

    res.json({ childId, consentId });
  });

  app.put("/api/children/:id/onboarding", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    assertConsent(childId);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access to this child" });

    db.prepare("UPDATE children_profiles SET onboarding_data=? WHERE id=?")
      .run(JSON.stringify(req.body.data), childId);
    res.json({ status: "ok" });
  });

  // Right to erasure (DPDP §17)
  app.delete("/api/children/:id/data", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access && sessionUser.role !== "district_admin")
      return res.status(403).json({ error: "No access to this child" });

    const result = eraseChildData(childId, sessionUser.userId);
    res.json({ status: "erased", ...result });
  });

  // ── PROGRESS ──────────────────────────────────────────────────────────────

  app.get("/api/children/:id/progress", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const rows = db.prepare(
      "SELECT * FROM progress WHERE child_id=? ORDER BY timestamp DESC LIMIT 100"
    ).all(childId);
    res.json(rows);
  });

  app.post("/api/children/:id/progress", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    assertConsent(childId);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { metric_type, value } = req.body;
    if (!metric_type || typeof value !== "number")
      return res.status(400).json({ error: "metric_type and numeric value required" });

    const info = db.prepare(
      "INSERT INTO progress (child_id, metric_type, value, recorded_by_user_id) VALUES (?,?,?,?)"
    ).run(childId, metric_type, value, sessionUser.userId);
    res.json({ id: info.lastInsertRowid });
  });

  // ── DIET PLANS ────────────────────────────────────────────────────────────

  app.get("/api/children/:id/diet", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const rows: any[] = db.prepare(
      "SELECT * FROM diet_plans WHERE child_id=? ORDER BY created_at DESC"
    ).all(childId) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.plan_json), id: r.id, created_at: r.created_at })));
  });

  app.post("/api/children/:id/diet", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    assertConsent(childId);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { plan } = req.body;
    if (!plan) return res.status(400).json({ error: "plan required" });
    db.prepare(
      "INSERT INTO diet_plans (child_id, plan_json, created_by_user_id) VALUES (?,?,?)"
    ).run(childId, JSON.stringify(plan), sessionUser.userId);
    res.json({ status: "ok" });
  });

  // ── THERAPY SCHEDULES ─────────────────────────────────────────────────────

  app.get("/api/children/:id/therapy", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const rows: any[] = db.prepare(
      "SELECT * FROM therapy_schedules WHERE child_id=? ORDER BY created_at DESC"
    ).all(childId) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.schedule_json), id: r.id, created_at: r.created_at })));
  });

  app.post("/api/children/:id/therapy", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    assertConsent(childId);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { schedule } = req.body;
    if (!schedule) return res.status(400).json({ error: "schedule required" });
    db.prepare(
      "INSERT INTO therapy_schedules (child_id, schedule_json, created_by_user_id) VALUES (?,?,?)"
    ).run(childId, JSON.stringify(schedule), sessionUser.userId);
    res.json({ status: "ok" });
  });

  // ── CONSENT MANAGEMENT ────────────────────────────────────────────────────

  app.post("/api/children/:id/consent/revoke", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const child: any = db.prepare("SELECT consent_record_id FROM children_profiles WHERE id=?").get(childId);
    if (!child) return res.status(404).json({ error: "Child not found" });

    revokeConsent(child.consent_record_id, sessionUser.userId, req.body.reason);
    res.json({ status: "revoked" });
  });

  // ── DISTRICT ADMIN — AGGREGATE INSIGHTS ──────────────────────────────────
  // De-identified by construction: aggregated at SQL level, zero identifiable fields returned.

  app.get("/api/insights/overview", authenticate, requireRole("district_admin"), (req, res) => {
    const { orgId } = (req as any).sessionUser;

    const totalChildren = (db.prepare(
      "SELECT COUNT(*) as n FROM children_profiles WHERE org_id=?"
    ).get(orgId) as any).n;

    const byRegion = db.prepare(`
      SELECT o.region_code, COUNT(cp.id) as child_count
      FROM   children_profiles cp
      JOIN   organizations o ON o.id = cp.org_id
      WHERE  o.id = ?
      GROUP  BY o.region_code
    `).all(orgId);

    const topMetrics = db.prepare(`
      SELECT   p.metric_type,
               AVG(p.value)  as avg_value,
               COUNT(*)      as data_points
      FROM     progress p
      JOIN     children_profiles cp ON cp.id = p.child_id
      WHERE    cp.org_id = ?
      GROUP BY p.metric_type
      ORDER BY data_points DESC
      LIMIT    10
    `).all(orgId);

    const adoptionByModule = db.prepare(`
      SELECT 'diet'     as module, COUNT(*) as uses FROM diet_plans      dp JOIN children_profiles cp ON cp.id=dp.child_id WHERE cp.org_id=?
      UNION ALL
      SELECT 'therapy'  as module, COUNT(*) as uses FROM therapy_schedules ts JOIN children_profiles cp ON cp.id=ts.child_id WHERE cp.org_id=?
    `).all(orgId, orgId);

    res.json({ totalChildren, byRegion, topMetrics, adoptionByModule });
  });

  app.get("/api/insights/diagnosis-breakdown", authenticate, requireRole("district_admin"), (req, res) => {
    // Count diagnosis categories from JSON blobs — de-identified aggregate only
    const children: any[] = db.prepare(
      "SELECT onboarding_data FROM children_profiles WHERE org_id=? AND onboarding_data IS NOT NULL"
    ).all((req as any).sessionUser.orgId) as any[];

    const counts: Record<string, number> = {};
    for (const c of children) {
      try {
        const d = JSON.parse(c.onboarding_data);
        for (const dx of (d.diagnoses || [])) {
          counts[dx] = (counts[dx] ?? 0) + 1;
        }
      } catch {}
    }
    res.json({ diagnosisCounts: counts });
  });

  app.get("/api/insights/trigger-heatmap", authenticate, requireRole("district_admin"), (req, res) => {
    const children: any[] = db.prepare(
      "SELECT onboarding_data FROM children_profiles WHERE org_id=? AND onboarding_data IS NOT NULL"
    ).all((req as any).sessionUser.orgId) as any[];

    const counts: Record<string, number> = {};
    for (const c of children) {
      try {
        const d = JSON.parse(c.onboarding_data);
        for (const t of (d.sensoryTriggers || [])) {
          counts[t] = (counts[t] ?? 0) + 1;
        }
      } catch {}
    }
    res.json({ triggerCounts: counts });
  });

  // ── AI: STREAMING CHAT ────────────────────────────────────────────────────

  app.post("/api/gemini/stream", authenticate, async (req, res) => {
    const { messages, context } = req.body;
    if (!messages?.length) return res.status(400).json({ error: "messages required" });

    const { preferredLanguage } = (req as any).sessionUser;

    try {
      // Translate last user message if non-English
      const msgs = [...messages];
      const lastIdx = msgs.length - 1;
      msgs[lastIdx] = {
        ...msgs[lastIdx],
        content: await translateToEnglish(msgs[lastIdx].content, preferredLanguage),
      };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const contextStr = context ? JSON.stringify(context) : undefined;
      for await (const chunk of streamChat(msgs, contextStr)) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      console.error("[ai/stream]", err);
      if (!res.headersSent) res.status(500).json({ error: err.message || "Stream failed" });
    }
  });

  // ── AI: STRUCTURED JSON ───────────────────────────────────────────────────

  app.post("/api/gemini/structured", authenticate, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt required" });
    const { preferredLanguage } = (req as any).sessionUser;

    try {
      const translatedPrompt = await translateToEnglish(prompt, preferredLanguage);
      const raw = await generateStructured(translatedPrompt);
      const { result: repaired } = repairJson(raw, "/api/gemini/structured");

      try {
        res.json(JSON.parse(repaired));
      } catch {
        res.status(422).json({ error: "Model returned unparseable JSON", raw });
      }
    } catch (err: any) {
      console.error("[ai/structured]", err);
      res.status(500).json({ error: err.message || "Structured generation failed" });
    }
  });

  // ── AI: EMERGENCY ─────────────────────────────────────────────────────────

  app.post("/api/gemini/emergency", authenticate, async (req, res) => {
    const { lat, lng, concern } = req.body;
    if (!concern) return res.status(400).json({ error: "concern required" });
    const { preferredLanguage } = (req as any).sessionUser;

    try {
      const locationCtx = lat && lng ? `The caregiver is at coordinates: ${lat}, ${lng}. ` : "";
      const englishConcern = await translateToEnglish(concern, preferredLanguage);
      const prompt =
        `${locationCtx}A caregiver in India needs urgent support for a child with neurodevelopmental needs. ` +
        `Concern: "${englishConcern}". ` +
        `Provide: 1) Immediate calm-down steps (numbered list), ` +
        `2) When to seek emergency medical help, ` +
        `3) Key Indian emergency helplines (112 Police/Ambulance, 108 Ambulance, ` +
        `CHILDLINE 1098, Vandrevala Foundation 1860-2662-345, iCall 9152987821, ` +
        `NIMHANS 080-4611-0007), ` +
        `4) Advice on reaching a pediatric or developmental specialist in India. ` +
        `Keep under 400 words, structured.`;

      const english = await generateText(prompt);
      const text = await translateFromEnglish(english, preferredLanguage);
      res.json({ text });
    } catch (err: any) {
      console.error("[ai/emergency]", err);
      res.status(500).json({ error: err.message || "Emergency query failed" });
    }
  });

  // ── CUE INTERPRETER ────────────────────────────────────────────────────────
  // DOWNLOAD full local model — all embeddings + labels for on-device IndexedDB matching
  app.get("/api/children/:id/cues/model", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const cues: any[] = db.prepare(
      `SELECT id, label, media_type, embedding_vector, confirmed_count
       FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL
       ORDER BY confirmed_count DESC`
    ).all(childId) as any[];

    const examples = cues.map((c: any) => ({
      label:  c.label as string,
      vector: JSON.parse(c.embedding_vector) as number[],
    }));
    const centroids = computeCentroids(examples);

    const model = cues.map((c: any) => ({
      id:        c.id,
      label:     c.label,
      mediaType: c.media_type,
      vector:    JSON.parse(c.embedding_vector),
      weight:    c.confirmed_count,
    }));

    res.json({
      childId,
      cueCount:     model.length,
      trained:      model.length >= 6,
      model,
      centroids,        // pre-computed centroids for faster on-device IndexedDB matching
      embedVersion:     EMBED_VERSION,
      matchThreshold:   MATCH_THRESHOLD,
      exportedAt:       new Date().toISOString(),
    });
  });

  // GET cue library for a child
  app.get("/api/children/:id/cues", authenticate, (req, res) => {
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

  // SERVE stored audio clips — GET /api/children/:id/cues/audio/:filename
  app.get("/api/children/:id/cues/audio/:filename", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access  = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const filename = (Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename).replace(/[^a-zA-Z0-9._-]/g, "");
    const filePath = path.join(UPLOADS_DIR, "recordings", String(childId), filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.setHeader("Content-Type", "audio/webm");
    res.setHeader("Accept-Ranges", "bytes");
    res.sendFile(filePath);
  });

  // ── TEACH MODE — multipart file OR base64 body ───────────────────────────────
  app.post("/api/children/:id/cues/teach",
    authenticate,
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.is("multipart/form-data") ? uploadAudio.single("audio")(req, res, next) : next();
    },
    async (req: any, res: express.Response) => {
      const childId = parseRouteNumber(req.params, "id");
      const { sessionUser } = req as any;
      const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
        .get(sessionUser.userId, childId);
      if (!access) return res.status(403).json({ error: "No access" });

      const label    = (req.body.label ?? "").trim();
      const mediaType = req.body.mediaType ?? "audio";
      if (!label) return res.status(400).json({ error: "label required" });

      const uploadedFile: Express.Multer.File | undefined = req.file;
      const mediaData: string | undefined = req.body.mediaData;
      if (!uploadedFile && !mediaData) {
        return res.status(400).json({ error: "audio file or mediaData (base64) required" });
      }

      // ── Embed SYNCHRONOUSLY before responding ─────────────────────────────
      // On ephemeral hosts (Render free tier) the file may not survive
      // past the current request if we defer to setImmediate.
      let embedding: number[] | null = null;
      let embeddingModel = "js-fallback";
      try {
        if (uploadedFile) {
          embedding = await mlEmbedFile(uploadedFile.path);
          if (embedding) embeddingModel = "python-mfcc";
        }
        if (!embedding && mediaData) {
          embedding = await mlEmbed(mediaData);
          if (embedding) embeddingModel = "python-mfcc";
        }
        // JS fallback — always produces a vector even without the sidecar
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

      console.log(`[teach] cue ${cueId} "${label}" via ${embeddingModel}, dims=${embedding?.length ?? 0}`);

      // Retrain sidecar if we have enough cues
      if (embedding) {
        const allCues: any[] = db.prepare(
          "SELECT label, embedding_vector FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
        ).all(childId) as any[];
        if (allCues.length >= 2) {
          mlRetrain(childId, allCues.map((c: any) => ({
            embeddingVector: JSON.parse(c.embedding_vector), meaningId: c.label,
          }))).catch(() => {}); // non-blocking, best-effort
        }
      }

      res.json({ id: cueId, label, embeddingSource: embeddingModel, embedded: !!embedding });
    }
  );

  // ── RECORD MODE (two-step, step 1) — save audio, fire async embed ───────────
  app.post("/api/children/:id/cues/record",
    authenticate,
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.is("multipart/form-data") ? uploadAudio.single("audio")(req, res, next) : next();
    },
    async (req: any, res: express.Response) => {
      const childId = parseRouteNumber(req.params, "id");
      const { sessionUser } = req as any;
      const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
        .get(sessionUser.userId, childId);
      if (!access) return res.status(403).json({ error: "No access" });

      const uploadedFile: Express.Multer.File | undefined = req.file;
      const mediaData: string | undefined = req.body.mediaData;
      if (!uploadedFile && !mediaData) {
        return res.status(400).json({ error: "audio file or mediaData (base64) required" });
      }

      const mediaRef   = uploadedFile ? uploadedFile.path : null;
      const durationMs = req.body.audioDurationMs ? Number(req.body.audioDurationMs) : null;

      const eventInfo = db.prepare(
        "INSERT INTO cue_events (child_id, media_ref, audio_duration_ms) VALUES (?,?,?)"
      ).run(childId, mediaRef, durationMs);
      const eventId = eventInfo.lastInsertRowid as number;

      res.json({ recordingEventId: eventId, status: "recorded", mediaRef });

      setImmediate(async () => {
        try {
          let embedding: number[] | null = null;
          let embeddingModel = "js-fallback";
          if (uploadedFile) {
            embedding = await mlEmbedFile(uploadedFile.path);
            if (embedding) embeddingModel = "python-mfcc";
          }
          if (!embedding && mediaData) {
            embedding = await mlEmbed(mediaData);
            if (embedding) embeddingModel = "python-mfcc";
            else embedding = extractEmbedding(mediaData, "audio");
          }
          if (embedding && embedding.length > 0) {
            db.prepare("UPDATE cue_events SET embedding_vector=?, embedding_model=? WHERE id=?")
              .run(JSON.stringify(embedding), embeddingModel, eventId);
            console.log(`[record] ${embeddingModel} embedding stored for event ${eventId}`);
          }
        } catch (err) { console.error(`[record] async embed failed event ${eventId}:`, err); }
      });
    }
  );

  // ── PREDICT MODE (two-step, step 2) — match stored embedding ─────────────────
  app.post("/api/children/:id/cues/predict", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { recordingEventId } = req.body;
    if (!recordingEventId) return res.status(400).json({ error: "recordingEventId required" });

    const event: any = db.prepare(
      "SELECT id, embedding_vector, embedding_model FROM cue_events WHERE id=? AND child_id=?"
    ).get(recordingEventId, childId);
    if (!event) return res.status(404).json({ error: "Recording event not found" });
    if (!event.embedding_vector) {
      return res.status(422).json({ error: "Embedding not ready yet — retry in a moment.", status: "pending" });
    }

    const cues: any[] = db.prepare(
      "SELECT id, label, embedding_vector, confirmed_count FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
    ).all(childId) as any[];
    if (cues.length === 0) return res.json({ matched: false, eventId: recordingEventId, closestCues: [] });

    const queryVec: number[] = JSON.parse(event.embedding_vector);
    const RAW_COSINE_THRESHOLD = 0.40;
    const examples  = cues.map((c: any) => ({ label: c.label, vector: JSON.parse(c.embedding_vector) as number[], id: c.id, weight: c.confirmed_count as number }));
    const centroids  = computeCentroids(examples);
    const topResults = predictTopN(queryVec, centroids, 3);

    const isMatch = topResults.length > 0 && (
      topResults[0].confidence >= MATCH_THRESHOLD ||
      topResults[0].score     >= RAW_COSINE_THRESHOLD
    );

    if (isMatch) {
      const best    = topResults[0];
      const bestCue = cues.filter((c: any) => c.label === best.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
      db.prepare("UPDATE cue_events SET matched_cue_id=?, match_confidence=? WHERE id=?")
        .run(bestCue.id, best.score, recordingEventId);
      db.prepare("UPDATE cue_library SET confirmed_count = confirmed_count + 1, updated_at = datetime('now') WHERE id=?")
        .run(bestCue.id);
      const displayConfidence = Math.round(Math.max(best.confidence, best.score) * 100);
      return res.json({ matched: true, label: best.label, confidence: displayConfidence, score: Math.round(best.score * 100), cueId: bestCue.id, eventId: recordingEventId, source: event.embedding_model ?? "unknown" });
    }

    const ranked = topResults.map(r => {
      const cue = cues.filter((c: any) => c.label === r.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
      return { id: cue?.id, label: r.label, score: r.score, confidence: r.confidence };
    });
    res.json({ matched: false, eventId: recordingEventId, closestCues: ranked });
  });

  // ── RECOGNIZE MODE — multipart file OR base64, synchronous single-step ───────
  // Saves audio to disk, embeds inline (Python sidecar or JS fallback),
  // matches against library, returns result immediately.
  app.post("/api/children/:id/cues/recognize",
    authenticate,
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.is("multipart/form-data") ? uploadAudio.single("audio")(req, res, next) : next();
    },
    async (req: any, res: express.Response) => {
      const childId = parseRouteNumber(req.params, "id");
      const { sessionUser } = req as any;
      const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
        .get(sessionUser.userId, childId);
      if (!access) return res.status(403).json({ error: "No access" });

      const uploadedFile: Express.Multer.File | undefined = req.file;
      const mediaData: string | undefined = req.body.mediaData;
      const mediaType: string = req.body.mediaType ?? "audio";

      if (!uploadedFile && !mediaData) {
        return res.status(400).json({ error: "audio file or mediaData (base64) required" });
      }

      const mediaRef = uploadedFile ? uploadedFile.path : null;

      const cues: any[] = db.prepare(
        "SELECT id, label, embedding_vector, confirmed_count FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
      ).all(childId) as any[];

      if (cues.length === 0) {
        const evInfo = db.prepare(
          "INSERT INTO cue_events (child_id, media_ref) VALUES (?,?)"
        ).run(childId, mediaRef);
        return res.json({ matched: false, eventId: evInfo.lastInsertRowid, closestCues: [] });
      }

      // Embed synchronously — try sidecar first, then guaranteed JS fallback
      let queryVec: number[] | null = null;
      let embModel = "js-fallback";

      if (uploadedFile) {
        queryVec = await mlEmbedFile(uploadedFile.path);
        if (queryVec) embModel = "python-mfcc";
      }
      if (!queryVec && mediaData) {
        queryVec = await mlEmbed(mediaData);
        if (queryVec) embModel = "python-mfcc";
      }
      // JS fallback — works from either the uploaded file or base64 mediaData.
      // This is the guaranteed path on Render (no Python sidecar available).
      if (!queryVec) {
        try {
          let raw = mediaData;
          if (!raw && uploadedFile && existsSync(uploadedFile.path)) {
            raw = readFileSync(uploadedFile.path).toString("base64");
          }
          if (raw) {
            queryVec = extractEmbedding(raw, "audio");
            embModel = "js-fallback";
            console.log(`[recognize] JS fallback embedder, dims=${queryVec.length}`);
          }
        } catch (err) {
          console.warn("[recognize] JS fallback failed:", err);
        }
      }
      if (!queryVec || queryVec.length === 0) {
        return res.status(422).json({ error: "Could not extract audio embedding. Try a longer recording (5–10 seconds)." });
      }

      // Nearest-centroid + softmax matching
      // Dual criteria: pass if softmax confidence OR raw cosine similarity is above threshold
      const RAW_COSINE_THRESHOLD = 0.40; // raw cosine fallback threshold
      const examples  = cues.map((c: any) => ({ label: c.label, vector: JSON.parse(c.embedding_vector) as number[], id: c.id, weight: c.confirmed_count as number }));
      const centroids  = computeCentroids(examples);
      const topResults = predictTopN(queryVec, centroids, 3);

      const isMatch = topResults.length > 0 && (
        topResults[0].confidence >= MATCH_THRESHOLD ||
        topResults[0].score     >= RAW_COSINE_THRESHOLD
      );

      console.log(`[recognize] source=${embModel} top=${topResults[0]?.label} conf=${topResults[0]?.confidence?.toFixed(3)} cosine=${topResults[0]?.score?.toFixed(3)} matched=${isMatch}`);

      // Dimension mismatch warning — JS fallback (128-dim) vs Python sidecar (124-dim)
      const queryDims = queryVec.length;
      const libDims   = cues[0] ? JSON.parse(cues[0].embedding_vector).length : queryDims;
      if (queryDims !== libDims) {
        console.warn(`[recognize] DIMENSION MISMATCH: query=${queryDims} vs library=${libDims}. Re-teach cues with sidecar running for best accuracy.`);
      }

      if (isMatch) {
        const best    = topResults[0];
        const bestCue = cues.filter((c: any) => c.label === best.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
        db.prepare(
          "INSERT INTO cue_events (child_id, media_ref, matched_cue_id, match_confidence, embedding_vector, embedding_model) VALUES (?,?,?,?,?,?)"
        ).run(childId, mediaRef, bestCue.id, best.score, JSON.stringify(queryVec), embModel);
        db.prepare("UPDATE cue_library SET confirmed_count = confirmed_count + 1, updated_at = datetime('now') WHERE id=?")
          .run(bestCue.id);
        // Report confidence as the higher of the two scores for display
        const displayConfidence = Math.round(Math.max(best.confidence, best.score) * 100);
        return res.json({ matched: true, label: best.label, confidence: displayConfidence, score: Math.round(best.score * 100), cueId: bestCue.id, source: embModel });
      }

      const ranked = topResults.map(r => {
        const cue = cues.filter((c: any) => c.label === r.label).sort((a: any, b: any) => b.confirmed_count - a.confirmed_count)[0];
        return { id: cue?.id, label: r.label, score: r.score, confidence: r.confidence };
      });
      const evInfo = db.prepare(
        "INSERT INTO cue_events (child_id, media_ref, embedding_vector, embedding_model) VALUES (?,?,?,?)"
      ).run(childId, mediaRef, JSON.stringify(queryVec), embModel);
      res.json({ matched: false, eventId: evInfo.lastInsertRowid, closestCues: ranked });
    }
  );

  // NEW-SIGNAL MODE — AI interprets an unmatched clip using text-only AI (Groq)
  // No Gemini, no multimodal — uses generateStructured() with child profile context.
  app.post("/api/children/:id/cues/interpret", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { eventId, mediaDescription } = req.body;

    const child: any = db.prepare("SELECT onboarding_data FROM children_profiles WHERE id=?").get(childId);
    const profile = child?.onboarding_data ? JSON.parse(child.onboarding_data) : {};

    const confirmedCues: any[] = db.prepare(
      "SELECT label FROM cue_library WHERE child_id=? ORDER BY confirmed_count DESC LIMIT 10"
    ).all(childId) as any[];

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
Return ONLY a JSON array with 6 strings.
Example: ["may be signaling hunger", "may be feeling overwhelmed by noise", ...]`;

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
        db.prepare("UPDATE cue_events SET ai_interpretations=? WHERE id=?")
          .run(JSON.stringify(interpretations), eventId);
      }

      res.json({ interpretations, eventId: eventId ?? null });
    } catch (err: any) {
      console.error("[interpret]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // CONFIRM — caregiver picks a label; saves to library with synchronous embedding
  app.post("/api/children/:id/cues/confirm",
    authenticate,
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      req.is("multipart/form-data") ? uploadAudio.single("audio")(req, res, next) : next();
    },
    async (req: any, res: express.Response) => {
      const childId = parseRouteNumber(req.params, "id");
      const { sessionUser } = req as any;
      const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
        .get(sessionUser.userId, childId);
      if (!access) return res.status(403).json({ error: "No access" });

      const { eventId, selectedLabel, mediaData, mediaType, saveToLibrary } = req.body;
      if (!selectedLabel?.trim()) return res.status(400).json({ error: "selectedLabel required" });

      const uploadedFile: Express.Multer.File | undefined = req.file;
      const mediaRef = uploadedFile ? uploadedFile.path : null;

      if (eventId) {
        db.prepare("UPDATE cue_events SET caregiver_selected_interpretation=? WHERE id=?")
          .run(selectedLabel.trim(), eventId);
      }

      if (saveToLibrary !== false && (uploadedFile || mediaData)) {
        // Embed synchronously — same reason as teach route (ephemeral disk on Render)
        let embedding: number[] | null = null;
        let embeddingModel = "js-fallback";
        try {
          if (uploadedFile) { embedding = await mlEmbedFile(uploadedFile.path); if (embedding) embeddingModel = "python-mfcc"; }
          if (!embedding && mediaData) { embedding = await mlEmbed(mediaData); if (embedding) embeddingModel = "python-mfcc"; }
          if (!embedding) {
            const rawData = mediaData ?? (uploadedFile ? readFileSync(uploadedFile.path).toString("base64") : null);
            if (rawData) embedding = extractEmbedding(rawData, mediaType === "video" ? "video" : "audio");
          }
        } catch (err) { console.warn(`[confirm] embedding error:`, err); }

        const libInfo = db.prepare(
          `INSERT INTO cue_library (child_id, label, media_type, media_ref, embedding_vector, created_by_user_id)
           VALUES (?,?,?,?,?,?)`
        ).run(childId, selectedLabel.trim(), mediaType ?? "audio", mediaRef, embedding ? JSON.stringify(embedding) : null, sessionUser.userId);
        const cueId = libInfo.lastInsertRowid as number;
        console.log(`[confirm] cue ${cueId} "${selectedLabel.trim()}" via ${embeddingModel}`);

        if (embedding) {
          const allCues: any[] = db.prepare(
            "SELECT label, embedding_vector FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
          ).all(childId) as any[];
          if (allCues.length >= 2) {
            mlRetrain(childId, allCues.map((c: any) => ({ embeddingVector: JSON.parse(c.embedding_vector), meaningId: c.label })))
              .catch(() => {}); // non-blocking
          }
        }
      }

      res.json({ status: "confirmed", label: selectedLabel.trim() });
    }
  );

  // ESCALATE — mark a cue_event as escalating
  app.post("/api/children/:id/cues/escalate", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { eventId } = req.body;
    if (eventId) {
      db.prepare("UPDATE cue_events SET escalated=1, escalated_at=datetime('now') WHERE id=?")
        .run(eventId);
    }
    res.json({ status: "escalated" });
  });

  // DELETE a cue from library — also removes stored audio file from disk
  app.delete("/api/children/:childId/cues/:cueId", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "childId");
    const cueId   = parseRouteNumber(req.params, "cueId");
    const access  = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const cue: any = db.prepare("SELECT media_ref FROM cue_library WHERE id=? AND child_id=?")
      .get(cueId, childId);
    if (cue?.media_ref) {
      try { if (existsSync(cue.media_ref)) unlinkSync(cue.media_ref); } catch {}
    }

    // Null out matched_cue_id on any cue_events that reference this cue.
    // The FK has no ON DELETE action so we must clear the reference first,
    // otherwise SQLite throws "FOREIGN KEY constraint failed".
    db.prepare("UPDATE cue_events SET matched_cue_id=NULL WHERE matched_cue_id=?").run(cueId);

    db.prepare("DELETE FROM cue_library WHERE id=? AND child_id=?").run(cueId, childId);
    res.json({ status: "deleted" });
  });

  // RE-EMBED — re-run Python MFCC embedding on all stored cue files for a child.
  // Fixes dimension mismatches when cues were originally embedded via JS fallback.
  app.post("/api/children/:id/cues/reembed", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const cues: any[] = db.prepare(
      "SELECT id, label, media_ref, embedding_vector FROM cue_library WHERE child_id=?"
    ).all(childId) as any[];

    let reembedded = 0, skipped = 0, failed = 0;

    for (const cue of cues) {
      try {
        let newVec: number[] | null = null;
        if (cue.media_ref && existsSync(cue.media_ref)) {
          newVec = await mlEmbedFile(cue.media_ref);
        }
        if (newVec && newVec.length > 0) {
          db.prepare("UPDATE cue_library SET embedding_vector=?, updated_at=datetime('now') WHERE id=?")
            .run(JSON.stringify(newVec), cue.id);
          reembedded++;
          console.log(`[reembed] cue ${cue.id} "${cue.label}" → ${newVec.length}-dim python-mfcc`);
        } else {
          skipped++;
          console.warn(`[reembed] cue ${cue.id} "${cue.label}" — no file or sidecar unavailable`);
        }
      } catch (err) {
        failed++;
        console.error(`[reembed] cue ${cue.id} failed:`, err);
      }
    }

    // Retrain after re-embedding
    if (reembedded > 0) {
      const allCues: any[] = db.prepare(
        "SELECT label, embedding_vector FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
      ).all(childId) as any[];
      if (allCues.length >= 2) {
        await mlRetrain(childId, allCues.map((c: any) => ({
          embeddingVector: JSON.parse(c.embedding_vector), meaningId: c.label,
        })));
      }
    }

    res.json({ reembedded, skipped, failed, total: cues.length });
  });

  // RECENT cue events (for history view)
  app.get("/api/children/:id/cue-events", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
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

  // ── ORGANIZATIONS ─────────────────────────────────────────────────────────

  app.post("/api/organizations", async (req, res) => {
    const { name, type, regionCode } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const info = db.prepare(
      "INSERT INTO organizations (name, type, region_code) VALUES (?,?,?)"
    ).run(name, type ?? "family", regionCode ?? null);
    res.json({ id: info.lastInsertRowid, name, type: type ?? "family" });
  });

  // ── HANDWRITING INTERPRETER ───────────────────────────────────────────────

  const HW_SYSTEM_PROMPT =
    "You are reading a photo of a child's handwriting for a caregiver. " +
    "The child may have dyslexia, so their writing may include letter reversals (e.g. b/d, p/q), " +
    "phonetic spelling, or irregular spacing. " +
    "Return TWO readings and a pattern analysis. " +
    "Never state a diagnosis or severity assessment — only describe what you observe in this sample. " +
    "Frame all output as supportive interpretation, and encourage the caregiver to share pattern " +
    "trends with a learning specialist or educational therapist rather than relying on this as a " +
    "clinical assessment.";

  // POST /api/children/:id/handwriting — analyze an uploaded handwriting image
  app.post("/api/children/:id/handwriting", authenticate, uploadHandwriting.single("image"), async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;

    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access to this child" });

    const rawBody = req.body ?? {};
    const imageDataFromBody = typeof rawBody.imageData === "string" ? rawBody.imageData : null;
    const retainImage = rawBody.retainImage === true || rawBody.retainImage === "true" || rawBody.retainImage === 1;
    const imageData = imageDataFromBody ?? (req.file ? `data:${req.file.mimetype || "image/jpeg"};base64,${req.file.buffer.toString("base64")}` : null);

    if (!imageData) return res.status(400).json({ error: "image file required" });

    const child: any = db.prepare("SELECT onboarding_data FROM children_profiles WHERE id=?").get(childId);
    const profile = child?.onboarding_data ? JSON.parse(child.onboarding_data) : {};

    const systemPrompt = `You are a handwriting transcription assistant. Output ONLY valid JSON. Do NOT include any markdown, analysis text, thinking, or explanations. Output ONLY the JSON object, nothing before or after.`;
    
    const prompt =
      `CRITICAL: Look at the handwriting in the image and output ONLY JSON. Do not explain, analyze, or add text outside the JSON.

Transcribe exactly what is written. Output:
{
  "raw_transcription": "EXACT words written in the image",
  "interpreted_text": "corrected spelling of what was written",
  "b_d_reversals": 0,
  "p_q_reversals": 0,
  "other_reversals": [],
  "phonetic_substitutions": [],
  "spacing_irregular": false,
  "sizing_inconsistent": false,
  "observations": "brief note"
}

OUTPUT ONLY THE JSON OBJECT. NO OTHER TEXT.`;

    try {
      // Use Groq vision (meta-llama/llama-4-scout-17b-16e-instruct) — same API key, no Gemini needed.
      // Accepts base64-encoded images up to 4 MB via the image_url content part.
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return res.status(503).json({
          error: "Handwriting analysis requires a Groq API key (GROQ_API_KEY in .env).",
          code: "GROQ_KEY_MISSING",
        });
      }

      // Detect mime type from data-URL prefix or default to jpeg
      const mimeMatch = imageData.match(/^data:(image\/[a-z]+);base64,/);
      const mimeType  = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const base64Clean = imageData.replace(/^data:image\/[a-z]+;base64,/, "");

      const { Groq: GroqClient } = await import("groq-sdk");
      const client = new GroqClient({ apiKey: groqKey });

      let completion;
      const candidateModels = [
        GROQ_VISION_MODEL,
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "llama-4-scout-17b-16e-instruct",
        "llama-4-maverick-17b-128e-instruct",
      ];
      let lastErr: any = null;
      let visionFailed = false;
      
      for (const modelName of candidateModels) {
        try {
          completion = await client.chat.completions.create({
            model: modelName,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: systemPrompt + "\n" + prompt },
                  {
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${base64Clean}` },
                  },
                ] as any,
              },
            ],
            temperature: 0.0,
            max_tokens: 1024,
          });
          console.log(`[handwriting] Used model: ${modelName}`);
          break;
        } catch (err: any) {
          lastErr = err;
          const code = err?.error?.error?.code || err?.code || err?.status;
          console.warn(`[handwriting] Model ${modelName} not available (${code})`);
          if (code === "model_not_found" || code === 404 || code === "model_decommissioned" || code === 401 || code === 403) {
            visionFailed = true;
            continue;
          }
          throw err;
        }
      }

      // If all vision models fail, fall back to text-based analysis via standard LLM
      if (!completion && visionFailed) {
        console.warn("[handwriting] All vision models failed, using text fallback analysis");
        try {
          completion = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "user",
                content: systemPrompt + "\n" + `You are analyzing a handwriting image. Since vision models are unavailable, please provide a placeholder analysis:\n\n${prompt}`,
              },
            ],
            temperature: 0.0,
            max_tokens: 512,
          });
          console.log(`[handwriting] Used fallback model: llama-3.3-70b-versatile`);
        } catch (fallbackErr: any) {
          console.error("[handwriting] Fallback also failed:", fallbackErr);
          return res.status(503).json({
            error: "Handwriting analysis temporarily unavailable. Vision models are not accessible on this account.",
            code: "VISION_UNAVAILABLE",
            help: "Please contact Groq support to enable vision model access for your account.",
          });
        }
      }

      if (!completion) {
        console.error("[handwriting] Groq call failed:", lastErr);
        return res.status(503).json({
          error: "Vision model not available. Update GROQ_VISION_MODEL or use a Groq account with vision access.",
          reason: lastErr?.error?.error?.message || lastErr?.message || "Unknown error",
        });
      }

      let rawMessage = completion.choices[0]?.message?.content ?? "";
      let raw = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage);
      
      console.log(`[handwriting-raw] First 200 chars: ${raw.substring(0, 200)}`);
      
      // AGGRESSIVE tag stripping (multiple passes to ensure complete removal)
      raw = raw.replace(/<think[\s\S]*?<\/think>/gi, "").trim();
      raw = raw.replace(/<thinking[\s\S]*?<\/thinking>/gi, "").trim();
      raw = raw.replace(/^<think>[\s\S]*?<\/think>$/gm, "").trim();
      raw = raw.replace(/^<thinking>[\s\S]*?<\/thinking>$/gm, "").trim();
      
      // Also remove any stray <think> or <thinking> blocks not properly closed
      raw = raw.replace(/<think\b[^>]*>[\s\S]*?(?=(?:<\/think>|$))/gi, "").trim();
      raw = raw.replace(/<thinking\b[^>]*>[\s\S]*?(?=(?:<\/thinking>|$))/gi, "").trim();
      
      console.log(`[handwriting-after-strip] First 200 chars: ${raw.substring(0, 200)}`);
      
      // Find JSON object by locating first { and last }
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      
      let parsed: any = null;
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        // Extract and parse JSON
        const jsonStr = raw.substring(firstBrace, lastBrace + 1);
        const { result: repaired } = repairJson(jsonStr, "/api/handwriting");
        try {
          parsed = JSON.parse(repaired);
          console.log(`[handwriting] Successfully parsed JSON from response`);
        } catch (err) {
          console.warn("[handwriting] JSON parse failed, using fallback");
        }
      }
      
      // If JSON extraction/parsing failed, parse markdown response
      if (!parsed) {
        console.warn("[handwriting] No JSON found, parsing markdown response");
        parsed = parseHandwritingFromMarkdown(raw);
        console.log(`[handwriting] Parsed from markdown: transcription="${parsed.raw_transcription.substring(0, 50)}..."`);
      }

      // Handle both nested (flagged_patterns object) and flattened (direct fields) response formats
      const getFlaggedPatterns = () => {
        if (parsed.flagged_patterns) {
          // Nested format
          return {
            b_d_reversals: Number(parsed.flagged_patterns.b_d_reversals ?? 0) || 0,
            p_q_reversals: Number(parsed.flagged_patterns.p_q_reversals ?? 0) || 0,
            other_reversals: Array.isArray(parsed.flagged_patterns.other_reversals) ? parsed.flagged_patterns.other_reversals.map(String) : [],
            phonetic_substitutions: Array.isArray(parsed.flagged_patterns.phonetic_substitutions) ? parsed.flagged_patterns.phonetic_substitutions.map(String) : [],
            spacing_irregular: Boolean(parsed.flagged_patterns.spacing_irregular ?? false),
            sizing_inconsistent: Boolean(parsed.flagged_patterns.sizing_inconsistent ?? false),
            observations: String(parsed.flagged_patterns.observations ?? ""),
          };
        } else {
          // Flattened format (new prompt)
          return {
            b_d_reversals: Number(parsed.b_d_reversals ?? 0) || 0,
            p_q_reversals: Number(parsed.p_q_reversals ?? 0) || 0,
            other_reversals: Array.isArray(parsed.other_reversals) ? parsed.other_reversals.map(String) : [],
            phonetic_substitutions: Array.isArray(parsed.phonetic_substitutions) ? parsed.phonetic_substitutions.map(String) : [],
            spacing_irregular: Boolean(parsed.spacing_irregular ?? false),
            sizing_inconsistent: Boolean(parsed.sizing_inconsistent ?? false),
            observations: String(parsed.observations ?? ""),
          };
        }
      };

      const normalized = {
        raw_transcription: String(parsed.raw_transcription ?? parsed.rawTranscription ?? ""),
        interpreted_text: String(parsed.interpreted_text ?? parsed.interpretedText ?? ""),
        flagged_patterns: getFlaggedPatterns(),
      };

      const flaggedPatterns = normalized.flagged_patterns;
      const reversalCount =
        (flaggedPatterns.b_d_reversals ?? 0) +
        (flaggedPatterns.p_q_reversals ?? 0) +
        (flaggedPatterns.other_reversals?.length ?? 0);
      const phoneticCount = flaggedPatterns.phonetic_substitutions?.length ?? 0;

      // Save sample (image_ref only if caregiver opted in)
      const info = db.prepare(`
        INSERT INTO handwriting_samples
          (child_id, image_ref, retain_image, raw_transcription, interpreted_text, flagged_patterns, created_by_user_id)
        VALUES (?,?,?,?,?,?,?)
      `).run(
        childId,
        retainImage ? `hw_${childId}_${Date.now()}` : null,
        retainImage ? 1 : 0,
        parsed.raw_transcription ?? "",
        parsed.interpreted_text ?? "",
        JSON.stringify(flaggedPatterns),
        sessionUser.userId,
      );
      const sampleId = info.lastInsertRowid as number;

      // Write pattern counts into progress table so they appear on Progress Tracker
      if (reversalCount > 0) {
        db.prepare("INSERT INTO progress (child_id, metric_type, value, recorded_by_user_id) VALUES (?,?,?,?)")
          .run(childId, "handwriting_reversal_count", reversalCount, sessionUser.userId);
      }
      if (phoneticCount > 0) {
        db.prepare("INSERT INTO progress (child_id, metric_type, value, recorded_by_user_id) VALUES (?,?,?,?)")
          .run(childId, "handwriting_phonetic_count", phoneticCount, sessionUser.userId);
      }

      res.json({
        id: sampleId,
        sampleId,
        rawTranscription: parsed.raw_transcription,
        interpretedText:  parsed.interpreted_text,
        flaggedPatterns,
        reversalCount,
        phoneticCount,
      });
    } catch (err: any) {
      console.error("[handwriting]", err);
      res.status(500).json({ error: err.message || "Handwriting analysis failed" });
    }
  });

  // PATCH /api/children/:id/handwriting/:sampleId — caregiver confirms/corrects
  app.patch("/api/children/:id/handwriting/:sampleId", authenticate, (req, res) => {
    const childId  = parseRouteNumber(req.params, "id");
    const sampleId = parseRouteNumber(req.params, "sampleId");
    const { sessionUser } = req as any;

    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { confirmedText } = req.body;
    if (!confirmedText?.trim()) return res.status(400).json({ error: "confirmedText required" });

    db.prepare("UPDATE handwriting_samples SET caregiver_confirmed_text=? WHERE id=? AND child_id=?")
      .run(confirmedText.trim(), sampleId, childId);

    res.json({ status: "confirmed" });
  });

  // GET /api/children/:id/handwriting — list past samples
  app.get("/api/children/:id/handwriting", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const samples = db.prepare(`
      SELECT id, raw_transcription, interpreted_text, flagged_patterns,
             caregiver_confirmed_text, retain_image, created_at
      FROM   handwriting_samples
      WHERE  child_id = ?
      ORDER  BY created_at DESC
      LIMIT  30
    `).all(childId);

    res.json(samples.map((s: any) => ({
      ...s,
      flagged_patterns: s.flagged_patterns ? JSON.parse(s.flagged_patterns) : {},
    })));
  });

  // DELETE /api/children/:id/handwriting/:sampleId — individual erasure
  app.delete("/api/children/:id/handwriting/:sampleId", authenticate, (req, res) => {
    const childId  = parseRouteNumber(req.params, "id");
    const sampleId = parseRouteNumber(req.params, "sampleId");
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    db.prepare("DELETE FROM handwriting_samples WHERE id=? AND child_id=?").run(sampleId, childId);
    res.json({ status: "deleted" });
  });

  // ── REPORTS ───────────────────────────────────────────────────────────────

  // Generate a full child report as structured JSON (parent prints / shares)
  app.get("/api/children/:id/report", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;

    // Check access
    const access = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access to this child" });

    // Gather all data
    const child: any = db.prepare(
      "SELECT * FROM children_profiles WHERE id=?"
    ).get(childId);
    if (!child) return res.status(404).json({ error: "Child not found" });

    const profile = child.onboarding_data ? JSON.parse(child.onboarding_data) : {};
    const progress: any[] = db.prepare(
      "SELECT metric_type, value, timestamp FROM progress WHERE child_id=? ORDER BY timestamp DESC LIMIT 30"
    ).all(childId) as any[];
    const latestDiet: any = db.prepare(
      "SELECT plan_json, created_at FROM diet_plans WHERE child_id=? ORDER BY created_at DESC LIMIT 1"
    ).get(childId);
    const latestTherapy: any = db.prepare(
      "SELECT schedule_json, created_at FROM therapy_schedules WHERE child_id=? ORDER BY created_at DESC LIMIT 1"
    ).get(childId);

    // Aggregate progress by metric
    const progressSummary: Record<string, { latest: number; count: number; avg: number }> = {};
    for (const row of progress) {
      if (!progressSummary[row.metric_type]) {
        progressSummary[row.metric_type] = { latest: row.value, count: 0, avg: 0 };
      }
      progressSummary[row.metric_type].count++;
      progressSummary[row.metric_type].avg += row.value;
    }
    for (const key of Object.keys(progressSummary)) {
      progressSummary[key].avg = Math.round(
        progressSummary[key].avg / progressSummary[key].count
      );
    }

    res.json({
      generatedAt: new Date().toISOString(),
      child: {
        name: profile.childName ?? "Child",
        age: profile.childAge,
        diagnoses: profile.diagnoses ?? [],
        sensoryTriggers: profile.sensoryTriggers ?? [],
        strengths: profile.strengths ?? [],
        goals: profile.goals ?? [],
      },
      progressSummary,
      recentProgress: progress.slice(0, 10),
      latestDietPlan: latestDiet
        ? { ...JSON.parse(latestDiet.plan_json), savedAt: latestDiet.created_at }
        : null,
      latestRoutine: latestTherapy
        ? { ...JSON.parse(latestTherapy.schedule_json), savedAt: latestTherapy.created_at }
        : null,
    });
  });

  // AI-generated narrative report summary
  app.post("/api/children/:id/report/narrative", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;

    const access = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const child: any = db.prepare("SELECT * FROM children_profiles WHERE id=?").get(childId);
    const profile = child?.onboarding_data ? JSON.parse(child.onboarding_data) : {};
    const progress: any[] = db.prepare(
      "SELECT metric_type, AVG(value) as avg_val, COUNT(*) as entries FROM progress WHERE child_id=? GROUP BY metric_type"
    ).all(childId) as any[];

    const prompt =
      `Write a concise, professional child development progress report for sharing with an Anganwadi worker, ` +
      `special educator, or pediatrician. The report is for a child named ${profile.childName ?? "the child"} ` +
      `(age: ${profile.childAge ?? "unknown"}). ` +
      `Diagnoses: ${profile.diagnoses?.join(", ") || "Not specified"}. ` +
      `Sensory triggers: ${profile.sensoryTriggers?.join(", ") || "None noted"}. ` +
      `Strengths: ${profile.strengths?.join(", ") || "Not recorded"}. ` +
      `Caregiver goals: ${profile.goals?.join(", ") || "Not specified"}. ` +
      `Progress metrics logged by caregiver: ${progress.map(p =>
        `${p.metric_type} — avg ${Math.round(p.avg_val)} (${p.entries} entries)`
      ).join("; ") || "No metrics logged yet"}. ` +
      `Write 3-4 short paragraphs: (1) child overview, (2) observed strengths & progress, ` +
      `(3) areas needing support, (4) recommendations for the institution. ` +
      `Tone: professional, empathetic, factual. Do NOT include any diagnosis claims — ` +
      `only describe observed behaviours and caregiver-reported data.`;

    try {
      const text = await generateText(prompt);
      res.json({ narrative: text });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Share child access with another user (worker) by email
  app.post("/api/children/:id/share", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    // Only the child's creator or a parent can share
    const ownerAccess = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!ownerAccess) return res.status(403).json({ error: "No access to share" });

    // Find target user
    const target: any = db.prepare("SELECT id, role FROM users WHERE email=?").get(email);
    if (!target) {
      return res.status(404).json({
        error: "No NeuroSync account found for that email. Ask the worker to register first.",
      });
    }

    // Already has access?
    const existing = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(target.id, childId);
    if (existing) return res.json({ status: "already_shared", role: target.role });

    db.prepare(
      "INSERT INTO child_access (user_id, child_id, granted_by) VALUES (?,?,?)"
    ).run(target.id, childId, sessionUser.userId);

    res.json({ status: "shared", sharedWith: email, role: target.role });
  });

  // Email report to a recipient
  app.post("/api/children/:id/report/email", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const { recipientEmail, recipientName, narrative, reportData } = req.body;

    if (!recipientEmail) return res.status(400).json({ error: "recipientEmail required" });

    const access = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(503).json({
        error: "Email not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env.",
        code: "EMAIL_NOT_CONFIGURED",
      });
    }

    // Build email HTML from report data
    const child = reportData?.child ?? {};
    const senderUser: any = db.prepare("SELECT display_name, email FROM users WHERE id=?").get(sessionUser.userId);
    const senderName = senderUser?.display_name || senderUser?.email || "A NeuroSync caregiver";

    const tagsHtml = (arr: string[], color: string) =>
      arr.map(t => `<span style="display:inline-block;background:${color}22;color:${color};padding:2px 8px;border-radius:999px;font-size:12px;margin:2px;font-weight:600">${t}</span>`).join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:Georgia,serif;color:#2C1F14">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#8B5CF6,#D97706);border-radius:16px;padding:28px 32px;margin-bottom:24px;text-align:center">
      <div style="font-size:40px;margin-bottom:8px">🧠</div>
      <h1 style="margin:0;color:white;font-size:22px;font-weight:700">Child Development Report</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">Shared via NeuroSync AI Caretaker</p>
    </div>

    <!-- Sender note -->
    <div style="background:#F3EEFF;border:1px solid #E8DCCF;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <p style="margin:0;font-size:14px;line-height:1.6">
        <strong>${senderName}</strong> has shared a progress report for
        <strong>${child.name || "their child"}</strong> with you through NeuroSync.
        ${recipientName ? `<br>This report is prepared for: <strong>${recipientName}</strong>.` : ""}
      </p>
    </div>

    <!-- Child profile -->
    <div style="background:white;border:1px solid #E8DCCF;border-radius:12px;padding:20px 24px;margin-bottom:16px">
      <h2 style="margin:0 0 14px;font-size:16px;color:#8B5CF6;border-bottom:1px solid #E8DCCF;padding-bottom:8px">👶 Child Profile</h2>
      <table style="width:100%;font-size:13px">
        <tr><td style="padding:4px 0;color:#6B4F38;width:140px"><strong>Name</strong></td><td>${child.name || "—"}</td></tr>
        <tr><td style="padding:4px 0;color:#6B4F38"><strong>Age</strong></td><td>${child.age ? child.age + " years" : "Not specified"}</td></tr>
      </table>
      ${child.diagnoses?.length ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#6D28D9;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Diagnoses / Conditions</div>${tagsHtml(child.diagnoses, "#8B5CF6")}</div>` : ""}
      ${child.sensoryTriggers?.length ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Sensory Triggers</div>${tagsHtml(child.sensoryTriggers, "#DC2626")}</div>` : ""}
      ${child.strengths?.length ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#2E8B57;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Strengths</div>${tagsHtml(child.strengths, "#2E8B57")}</div>` : ""}
      ${child.goals?.length ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Caregiver Goals</div>${tagsHtml(child.goals, "#2563EB")}</div>` : ""}
    </div>

    ${narrative ? `
    <!-- AI Narrative -->
    <div style="background:white;border:1px solid #E8DCCF;border-left:4px solid #2E8B57;border-radius:12px;padding:20px 24px;margin-bottom:16px">
      <h2 style="margin:0 0 14px;font-size:16px;color:#2E8B57">✨ Professional Summary</h2>
      <div style="font-size:14px;line-height:1.8;white-space:pre-wrap">${narrative}</div>
    </div>` : ""}

    <!-- Disclaimer -->
    <div style="background:#FFF8EC;border:1px solid #E8DCCF;border-radius:10px;padding:14px 18px;margin-bottom:20px">
      <p style="margin:0;font-size:12px;color:#6B4F38;line-height:1.6">
        ⚕️ <strong>Important:</strong> This report is based on caregiver-logged observations.
        It is <strong>not a clinical diagnosis</strong>. Please use this as supplementary information
        alongside professional assessment. Generated by NeuroSync AI Caretaker on ${new Date().toLocaleDateString("en-IN")}.
      </p>
    </div>

    <!-- Footer -->
    <p style="text-align:center;font-size:11px;color:#A08468;margin:0">
      NeuroSync · AI Digital Caretaker for Autism, ADHD &amp; Dyslexia<br>
      This email was sent by a caregiver using the NeuroSync platform.
    </p>
  </div>
</body>
</html>`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `NeuroSync <${smtpUser}>`,
        to: recipientEmail,
        subject: `NeuroSync report for ${child.name || "your child"}`,
        html,
      });

      res.json({ status: "sent" });
    } catch (err: any) {
      console.error("[report-email]", err);
      res.status(500).json({ error: err.message || "Report email failed" });
    }
  });

  app.post("/api/admin/send-local-csv", authenticate, async (req, res) => {
    const { csv, subject, note } = req.body;
    if (!csv) return res.status(400).json({ error: "csv required" });

    const adminEmail = process.env.ADMIN_REPORT_EMAIL;
    const smtpHostAdmin = process.env.SMTP_HOST;
    const smtpPortAdmin = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const smtpSecureAdmin = process.env.SMTP_SECURE === "true";
    const smtpUserAdmin = process.env.SMTP_USER;
    const smtpPassAdmin = process.env.SMTP_PASS;

    if (!adminEmail || !smtpHostAdmin || !smtpPortAdmin || !smtpUserAdmin || !smtpPassAdmin) {
      return res.status(503).json({
        error: "Admin report email or SMTP configuration is not set.",
        code: "ADMIN_REPORT_NOT_CONFIGURED",
      });
    }

    const senderUser: any = db.prepare("SELECT display_name, email FROM users WHERE id=?").get((req as any).sessionUser.userId);
    const senderName = senderUser?.display_name || senderUser?.email || "NeuroSync caregiver";
    const subjectLine = subject || `NeuroSync device export from ${senderName}`;
    const text = `Auto-sent device-local NeuroSync data from ${senderName} (${senderUser?.email}).${note ? `\n\nNote: ${note}` : ""}`;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHostAdmin,
        port: smtpPortAdmin,
        secure: smtpSecureAdmin,
        auth: { user: smtpUserAdmin, pass: smtpPassAdmin },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `NeuroSync <${smtpUserAdmin}>`,
        to: adminEmail,
        subject: subjectLine,
        text,
        attachments: [
          {
            filename: `neurosync-export-${new Date().toISOString().slice(0, 10)}.csv`,
            content: csv,
            contentType: "text/csv; charset=utf-8",
          },
        ],
      });

      res.json({ status: "sent" });
    } catch (err: any) {
      console.error("[admin-csv-email]", err);
      res.status(500).json({ error: err.message || "CSV email failed" });
    }
  });

  // Revoke access for a worker
  app.delete("/api/children/:id/share/:userId", authenticate, (req, res) => {
    const childId  = parseRouteNumber(req.params, "id");
    const targetId = parseRouteNumber(req.params, "userId");
    const { sessionUser } = req as any;

    const ownerAccess = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!ownerAccess) return res.status(403).json({ error: "No access" });

    // Don't let parent revoke their own access
    if (targetId === sessionUser.userId)
      return res.status(400).json({ error: "Cannot revoke your own access" });

    db.prepare(
      "DELETE FROM child_access WHERE user_id=? AND child_id=?"
    ).run(targetId, childId);
    res.json({ status: "revoked" });
  });

  // List who has access to a child
  app.get("/api/children/:id/shares", authenticate, (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;

    const ownerAccess = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!ownerAccess) return res.status(403).json({ error: "No access" });

    const shares = db.prepare(
      `SELECT u.id, u.email, u.display_name, u.role, ca.granted_at
       FROM child_access ca JOIN users u ON u.id = ca.user_id
       WHERE ca.child_id = ? ORDER BY ca.granted_at ASC`
    ).all(childId);
    res.json(shares);
  });

  // ── SHARED POOL — check clusters for unmatched clip ───────────────────────
  // Called after a caregiver confirms a label. Contributions are always on —
  // only the embedding vector + confirmed label are stored, never raw audio.
  app.post("/api/children/:id/cues/contribute-pool", authenticate, async (req, res) => {
    const childId = parseRouteNumber(req.params, "id");
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { embeddingVector, confirmedLabel } = req.body;
    if (!Array.isArray(embeddingVector) || !confirmedLabel?.trim()) {
      return res.status(400).json({ error: "embeddingVector (array) and confirmedLabel required" });
    }

    db.prepare(
      "INSERT INTO shared_cue_pool (embedding_vector, confirmed_label, child_id) VALUES (?,?,?)"
    ).run(JSON.stringify(embeddingVector), confirmedLabel.trim(), childId);

    res.json({ status: "contributed" });
  });

  // ── SHARED POOL — check clusters for unmatched clip ───────────────────────
  // Returns top 3 shared-cluster suggestions for a given embedding vector.
  // Clearly marked as "other families" — not the child's own cues.

  app.post("/api/shared-pool/match", authenticate, (req, res) => {
    const { embeddingVector } = req.body;
    if (!Array.isArray(embeddingVector)) {
      return res.status(400).json({ error: "embeddingVector required" });
    }

    const clusters: any[] = db.prepare(
      "SELECT cluster_id, centroid, top_labels, member_count FROM shared_cue_clusters ORDER BY member_count DESC"
    ).all() as any[];

    if (clusters.length === 0) {
      return res.json({ matches: [] });
    }

    // Cosine similarity against each cluster centroid
    const scored = clusters.map((c: any) => {
      const centroid: number[] = JSON.parse(c.centroid);
      const query: number[]    = embeddingVector as number[];
      const len = Math.min(centroid.length, query.length);
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < len; i++) {
        dot  += query[i] * centroid[i];
        magA += query[i] * query[i];
        magB += centroid[i] * centroid[i];
      }
      const denom = Math.sqrt(magA) * Math.sqrt(magB);
      const score = denom === 0 ? 0 : dot / denom;
      const topLabels: { label: string; count: number }[] = JSON.parse(c.top_labels);
      return { clusterId: c.cluster_id, score, topLabel: topLabels[0]?.label ?? "unknown", memberCount: c.member_count };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter(r => r.score > 0.25); // only surface reasonably similar clusters

    res.json({ matches: scored });
  });

  // ── SHARED POOL — admin re-cluster (run periodically, not per-request) ────
  // POST /api/admin/shared-pool/recluster
  // Runs simple k-means over all pooled embeddings.
  // Requires district_admin role to prevent abuse.

  app.post("/api/admin/shared-pool/recluster", authenticate, requireRole("district_admin"), async (req, res) => {
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

    // Initialize centroids using k-means++ seeding
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

    // Run k-means for up to 50 iterations
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
      // Update centroids
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

    // Summarize top labels per cluster and persist
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

  // ── YOUTUBE SEARCH — server-side only (key never sent to client) ──────────
  // GET /api/lesson/videos?subject=Math&topic=counting&difficulty=Elementary
  // Results cached for 24h per subject+topic+difficulty combination.

  app.get("/api/lesson/videos", authenticate, async (req, res) => {
    const subject    = String(req.query.subject   ?? "").trim().slice(0, 80);
    const topic      = String(req.query.topic     ?? "").trim().slice(0, 120);
    const difficulty = String(req.query.difficulty ?? "").trim().slice(0, 40);

    if (!subject) return res.status(400).json({ error: "subject required" });

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      // Return empty rather than an error — lesson plan should still render
      return res.json({ videos: [], cached: false, reason: "no_api_key" });
    }

    // Cache key: hash of subject+topic+difficulty
    const cacheKey = Buffer.from(`${subject}|${topic}|${difficulty}`).toString("base64");
    const cached: any = db.prepare(
      "SELECT results, fetched_at FROM youtube_cache WHERE cache_key=?"
    ).get(cacheKey);

    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return res.json({ videos: JSON.parse(cached.results), cached: true });
      }
    }

    // Build search query
    const q = encodeURIComponent(
      `${topic || subject} ${difficulty} learning ${subject} kids educational`
    );

    try {
      const ytRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=2&safeSearch=strict&q=${q}&key=${apiKey}`,
        { signal: AbortSignal.timeout(8000) }
      );

      if (!ytRes.ok) {
        console.warn(`[youtube] API returned ${ytRes.status}`);
        return res.json({ videos: [], cached: false, reason: `api_error_${ytRes.status}` });
      }

      const data: any = await ytRes.json();
      const videos = (data.items ?? []).map((item: any) => ({
        videoId:      item.id?.videoId,
        title:        item.snippet?.title,
        channelTitle: item.snippet?.channelTitle,
        thumbnail:    item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
        watchUrl:     `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      })).filter((v: any) => v.videoId);

      // Upsert cache
      db.prepare(
        "INSERT OR REPLACE INTO youtube_cache (cache_key, results, fetched_at) VALUES (?,?,datetime('now'))"
      ).run(cacheKey, JSON.stringify(videos));

      res.json({ videos, cached: false });
    } catch (err: any) {
      console.warn("[youtube] search failed:", err.message);
      // Non-fatal — lesson still renders without video cards
      res.json({ videos: [], cached: false, reason: "fetch_failed" });
    }
  });

  // ── STATIC / VITE ─────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== "production") {
    // Dynamic import so vite is never loaded in production builds
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  // Central error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || 500;
    console.error(`[error] ${status}:`, err.message);
    res.status(status).json({ error: err.message || "Internal server error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    let provider = "not configured";
    try { provider = getActiveProvider(); } catch {}
    console.log(`\n🧠 NeuroSync server → http://localhost:${PORT}`);
    console.log(`   AI provider: ${provider}`);
    console.log(`   Bhashini: ${process.env.BHASHINI_API_KEY ? "enabled" : "disabled (English only)"}\n`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
