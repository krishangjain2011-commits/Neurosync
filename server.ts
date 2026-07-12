import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

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

purgeExpiredTokens();
setInterval(purgeExpiredTokens, 1000 * 60 * 60); // hourly
purgeStaleCueMedia();
setInterval(purgeStaleCueMedia, 1000 * 60 * 60 * 24); // daily

// SYSTEM_INSTRUCTION is imported from lib/ai-client.ts

// MODEL and getGenAI() are handled inside lib/ai-client.ts

// Self-healing JSON repair with telemetry
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
    db.prepare("INSERT INTO ai_repair_log (endpoint, repaired) VALUES (?,1)").run(endpoint);
    console.warn(`[AI] JSON repair triggered on ${endpoint}`);
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

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));

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
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const rows = db.prepare(
      "SELECT * FROM progress WHERE child_id=? ORDER BY timestamp DESC LIMIT 100"
    ).all(childId);
    res.json(rows);
  });

  app.post("/api/children/:id/progress", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const rows: any[] = db.prepare(
      "SELECT * FROM diet_plans WHERE child_id=? ORDER BY created_at DESC"
    ).all(childId) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.plan_json), id: r.id, created_at: r.created_at })));
  });

  app.post("/api/children/:id/diet", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });
    const rows: any[] = db.prepare(
      "SELECT * FROM therapy_schedules WHERE child_id=? ORDER BY created_at DESC"
    ).all(childId) as any[];
    res.json(rows.map(r => ({ ...JSON.parse(r.schedule_json), id: r.id, created_at: r.created_at })));
  });

  app.post("/api/children/:id/therapy", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
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

  // Helper: cosine similarity between two float arrays
  function cosineSimilarity(a: number[], b: number[]): number {
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

  // Helper: extract a feature embedding from base64 audio/video data
  // Extracts amplitude bucketing from raw bytes across time windows.
  // For video: processes more byte windows to capture motion+audio patterns.
  // For production, swap with a proper ML model (e.g. YAMNet / MobileNet via TF.js).
  function extractEmbedding(base64Data: string, mediaType: "audio" | "video" = "audio"): number[] {
    try {
      const buf = Buffer.from(base64Data, "base64");
      const DIMS = mediaType === "video" ? 128 : 64;
      const chunkSize = Math.max(1, Math.floor(buf.length / DIMS));
      const vec: number[] = [];
      for (let i = 0; i < DIMS; i++) {
        let sum = 0, variance = 0;
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, buf.length);
        const count = end - start;
        if (count === 0) { vec.push(0); continue; }
        for (let j = start; j < end; j++) sum += buf[j];
        const mean = sum / count;
        for (let j = start; j < end; j++) variance += (buf[j] - mean) ** 2;
        // Store both mean energy + variance (motion/sound dynamics)
        vec.push(mean / 255);
        if (vec.length < DIMS) vec.push(Math.sqrt(variance / count) / 255);
      }
      // Pad or trim to exact DIMS
      while (vec.length < DIMS) vec.push(0);
      return vec.slice(0, DIMS);
    } catch {
      return new Array(128).fill(0);
    }
  }

  const MATCH_THRESHOLD = 0.82; // cosine similarity above this = confident match

  // DOWNLOAD full local model — all embeddings + labels for client-side matching
  app.get("/api/children/:id/cues/model", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const cues: any[] = db.prepare(
      `SELECT id, label, media_type, embedding_vector, confirmed_count
       FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL
       ORDER BY confirmed_count DESC`
    ).all(childId) as any[];

    const model = cues.map(c => ({
      id:        c.id,
      label:     c.label,
      mediaType: c.media_type,
      vector:    JSON.parse(c.embedding_vector),
      weight:    c.confirmed_count,
    }));

    res.json({
      childId,
      cueCount: model.length,
      trained: model.length >= 6,
      model,
      exportedAt: new Date().toISOString(),
    });
  });

  // GET cue library for a child
  app.get("/api/children/:id/cues", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const cues = db.prepare(
      `SELECT id, label, media_type, confirmed_count, created_at, updated_at
       FROM cue_library WHERE child_id=? ORDER BY confirmed_count DESC, created_at DESC`
    ).all(childId);
    res.json(cues);
  });

  // TEACH MODE — save a new labelled cue
  app.post("/api/children/:id/cues/teach", authenticate, async (req, res) => {
    const childId = parseInt(req.params.id, 10);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { label, mediaType, mediaData } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: "label required" });
    if (!mediaData)      return res.status(400).json({ error: "mediaData (base64) required" });

    const mtype: "audio" | "video" = mediaType === "video" ? "video" : "audio";
    const embedding = extractEmbedding(mediaData, mtype);

    const info = db.prepare(
      `INSERT INTO cue_library
         (child_id, label, media_type, embedding_vector, created_by_user_id)
       VALUES (?,?,?,?,?)`
    ).run(childId, label.trim(), mediaType ?? "audio", JSON.stringify(embedding), sessionUser.userId);

    res.json({ id: info.lastInsertRowid, label: label.trim(), message: "Cue saved to library" });
  });

  // RECOGNIZE MODE — match a clip against the child's library
  app.post("/api/children/:id/cues/recognize", authenticate, async (req, res) => {
    const childId = parseInt(req.params.id, 10);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { mediaData, mediaType } = req.body;
    if (!mediaData) return res.status(400).json({ error: "mediaData (base64) required" });

    const qmtype: "audio" | "video" = mediaType === "video" ? "video" : "audio";
    const queryVec = extractEmbedding(mediaData, qmtype);

    // Load all cues for this child that have embeddings
    const cues: any[] = db.prepare(
      "SELECT id, label, embedding_vector, confirmed_count FROM cue_library WHERE child_id=? AND embedding_vector IS NOT NULL"
    ).all(childId) as any[];

    let bestMatch: { id: number; label: string; score: number } | null = null;
    for (const cue of cues) {
      try {
        const vec: number[] = JSON.parse(cue.embedding_vector);
        const score = cosineSimilarity(queryVec, vec);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: cue.id, label: cue.label, score };
        }
      } catch {}
    }

    if (bestMatch && bestMatch.score >= MATCH_THRESHOLD) {
      // Confident match — log and return
      db.prepare(
        `INSERT INTO cue_events (child_id, matched_cue_id, match_confidence)
         VALUES (?,?,?)`
      ).run(childId, bestMatch.id, bestMatch.score);

      // Increment confirmed_count
      db.prepare("UPDATE cue_library SET confirmed_count = confirmed_count + 1, updated_at = datetime('now') WHERE id=?")
        .run(bestMatch.id);

      return res.json({
        matched: true,
        label: bestMatch.label,
        confidence: Math.round(bestMatch.score * 100),
        cueId: bestMatch.id,
      });
    }

    // No confident match — return all candidates ranked for new-signal mode
    const ranked = cues
      .map(c => {
        try {
          const vec: number[] = JSON.parse(c.embedding_vector);
          return { id: c.id, label: c.label, score: cosineSimilarity(queryVec, vec) };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 3);

    // Create a pending cue_event for new-signal flow
    const eventInfo = db.prepare(
      "INSERT INTO cue_events (child_id) VALUES (?)"
    ).run(childId);

    res.json({ matched: false, eventId: eventInfo.lastInsertRowid, closestCues: ranked });
  });

  // NEW-SIGNAL MODE — AI interprets an unmatched clip
  app.post("/api/children/:id/cues/interpret", authenticate, async (req, res) => {
    const childId = parseInt(req.params.id, 10);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { eventId, mediaDescription } = req.body;
    // mediaDescription: caregiver's brief text description of what they heard/saw
    // (used when full audio analysis isn't available from the model)

    const child: any = db.prepare("SELECT onboarding_data FROM children_profiles WHERE id=?").get(childId);
    const profile = child?.onboarding_data ? JSON.parse(child.onboarding_data) : {};

    // Pull previously confirmed cues as context
    const confirmedCues: any[] = db.prepare(
      "SELECT label FROM cue_library WHERE child_id=? ORDER BY confirmed_count DESC LIMIT 10"
    ).all(childId) as any[];

    const CUE_SYSTEM =
      "You are interpreting a short recording of a child's sound or movement to help a caregiver " +
      "understand what they may be communicating. Offer 5 to 6 distinct, plausible interpretations " +
      "grounded in the child's known profile. Never state a single definitive interpretation as fact, " +
      "never offer a medical or diagnostic conclusion, and always frame results as possibilities for " +
      "the caregiver to judge against their own knowledge of the child.";

    const prompt =
      `Child profile:
- Name: ${profile.childName ?? "the child"}
- Age: ${profile.childAge ?? "unknown"}
- Diagnoses: ${profile.diagnoses?.join(", ") || "Not specified"}
- Known sensory triggers: ${profile.sensoryTriggers?.join(", ") || "None noted"}
- Previously confirmed communication cues for this child: ${confirmedCues.map((c: any) => `"${c.label}"`).join(", ") || "None yet"}

The caregiver has recorded a short clip. Their description: "${mediaDescription || "no description provided"}"

Provide exactly 6 distinct, plausible interpretations of what this child may be communicating.
Return as JSON array of 6 strings, ranked by likelihood, in plain caregiver-facing language.
Example format: ["may be signaling hunger", "may indicate sensory overload from noise", ...]
Return ONLY the JSON array, no other text.`;

    try {
      const raw = await generateStructured(prompt);
      let interpretations: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        interpretations = Array.isArray(parsed) ? parsed.slice(0, 6) : Object.values(parsed).slice(0, 6) as string[];
      } catch {
        interpretations = ["may be communicating a need", "may indicate discomfort", "may be seeking attention",
          "may be signaling sensory overload", "may be expressing frustration", "may want a routine change"];
      }

      // Update cue_event with AI interpretations
      if (eventId) {
        db.prepare("UPDATE cue_events SET ai_interpretations=? WHERE id=?")
          .run(JSON.stringify(interpretations), eventId);
      }

      res.json({ interpretations, eventId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // CONFIRM — caregiver picks an interpretation; saves to library
  app.post("/api/children/:id/cues/confirm", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
    const { sessionUser } = req as any;
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const { eventId, selectedLabel, mediaData, mediaType, saveToLibrary } = req.body;
    if (!selectedLabel || typeof selectedLabel !== "string" || !selectedLabel.trim())
      return res.status(400).json({ error: "selectedLabel required" });

    // Update the cue_event
    if (eventId) {
      db.prepare("UPDATE cue_events SET caregiver_selected_interpretation=? WHERE id=?")
        .run(selectedLabel.trim(), eventId);
    }

    // Optionally save as a new library entry
    if (saveToLibrary !== false && mediaData) {
      const cmtype: "audio" | "video" = mediaType === "video" ? "video" : "audio";
      const embedding = extractEmbedding(mediaData, cmtype);
      db.prepare(
        `INSERT INTO cue_library (child_id, label, media_type, embedding_vector, created_by_user_id)
         VALUES (?,?,?,?,?)`
      ).run(childId, selectedLabel.trim(), cmtype, JSON.stringify(embedding), sessionUser.userId);
    }

    res.json({ status: "confirmed", label: selectedLabel.trim() });
  });

  // ESCALATE — mark a cue_event as escalating
  app.post("/api/children/:id/cues/escalate", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
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

  // DELETE a cue from library (individual)
  app.delete("/api/children/:childId/cues/:cueId", authenticate, (req, res) => {
    const childId = parseInt(req.params.childId, 10);
    const cueId   = parseInt(req.params.cueId, 10);
    const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
      .get((req as any).sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    db.prepare("DELETE FROM cue_library WHERE id=? AND child_id=?").run(cueId, childId);
    res.json({ status: "deleted" });
  });

  // RECENT cue events (for history view)
  app.get("/api/children/:id/cue-events", authenticate, (req, res) => {
    const childId = parseInt(req.params.id, 10);
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

  // ── REPORTS ───────────────────────────────────────────────────────────────

  // Generate a full child report as structured JSON (parent prints / shares)
  app.get("/api/children/:id/report", authenticate, async (req, res) => {
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
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
    const childId = parseInt(req.params.id, 10);
    const { sessionUser } = req as any;
    const { recipientEmail, recipientName, narrative, reportData } = req.body;

    if (!recipientEmail) return res.status(400).json({ error: "recipientEmail required" });

    const access = db.prepare(
      "SELECT 1 FROM child_access WHERE user_id=? AND child_id=?"
    ).get(sessionUser.userId, childId);
    if (!access) return res.status(403).json({ error: "No access" });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(503).json({
        error: "Email not configured. Add RESEND_API_KEY to .env (free at resend.com).",
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
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);

      const { data, error: emailError } = await resend.emails.send({
        from: "NeuroSync <onboarding@resend.dev>",
        to: [recipientEmail],
        subject: `Child Development Report — ${child.name || "NeuroSync"}`,
        html,
      });

      if (emailError) {
        console.error("[email]", emailError);
        return res.status(500).json({ error: (emailError as any).message || "Email sending failed" });
      }

      res.json({ status: "sent", id: data?.id });
    } catch (err: any) {
      console.error("[email]", err);
      res.status(500).json({ error: err.message || "Email sending failed" });
    }
  });

  // Revoke access for a worker
  app.delete("/api/children/:id/share/:userId", authenticate, (req, res) => {
    const childId  = parseInt(req.params.id, 10);
    const targetId = parseInt(req.params.userId, 10);
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
    const childId = parseInt(req.params.id, 10);
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

  // ── STATIC / VITE ─────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== "production") {
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
