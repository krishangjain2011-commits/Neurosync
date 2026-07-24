import "./lib/load-env.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

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
// ── Audio file storage (multer) ───────────────────────────────────────────────
// Recordings are now handled by the extracted cues router and shared helpers.
// The server root keeps only handwriting upload handling.

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

// Mount extracted routes
import cuesRouter from "./routes/cues.js";

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

  // Firebase authentication has been removed.
  // Use local email/password login and registration instead.

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

    const prompt =
      `${HW_SYSTEM_PROMPT}

Child context:
- Name: ${profile.childName ?? "the child"}
- Age: ${profile.childAge ?? "unknown"}
- Diagnoses: ${profile.diagnoses?.join(", ") || "Not specified"}
${profile.otherDetails ? `- Additional notes: ${profile.otherDetails}` : ""}

Analyze the handwriting in this image and return ONLY valid JSON in this exact structure:
{
  "raw_transcription": "exact literal reading of what is written, character by character",
  "interpreted_text": "your best guess at what the child intended to write, with corrections",
  "flagged_patterns": {
    "b_d_reversals": 0,
    "p_q_reversals": 0,
    "other_reversals": [],
    "phonetic_substitutions": [],
    "spacing_irregular": false,
    "sizing_inconsistent": false,
    "observations": "one sentence of supportive, non-diagnostic observations"
  }
}

Do not include any extra fields, markdown, bullet points, or explanation.
If you cannot read the handwriting, return empty strings for text fields, empty arrays for lists, and false for booleans.
`;

    try {
      const mistralKey = process.env.MISTRAL_API_KEY;
      if (!mistralKey) {
        return res.status(503).json({
          error: "Handwriting analysis requires a Mistral API key (MISTRAL_API_KEY in .env).",
          code: "MISTRAL_KEY_MISSING",
        });
      }

      // Detect mime type from data-URL prefix or default to jpeg
      const mimeMatch = imageData.match(/^data:(image\/[a-z]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const base64Clean = imageData.replace(/^data:image\/[a-z]+;base64,/, "");
      const imageUrl = `data:${mimeType};base64,${base64Clean}`;
      const modelName = process.env.MISTRAL_MODEL ?? "mistral-small-latest";

      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mistralKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          temperature: 0.0,
          max_tokens: 1024,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("[handwriting] Mistral call failed:", response.status, errorBody);
        return res.status(503).json({
          error: "Mistral handwriting analysis failed.",
          status: response.status,
          details: errorBody,
        });
      }

      const completion = await response.json();
      let rawMessage = completion.choices?.[0]?.message?.content ?? "";
      let raw = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage);
      const { result: repaired } = repairJson(raw, "/api/handwriting");

      let parsed: any = {};
      try {
        parsed = JSON.parse(repaired);
      } catch (err) {
        console.error("[handwriting] JSON parse failed after structured response:", err, repaired);
        return res.status(502).json({
          error: "Vision service returned malformed JSON despite structured format.",
          raw: repaired,
        });
      }

      const normalized = {
        raw_transcription: String(parsed.raw_transcription ?? parsed.rawTranscription ?? ""),
        interpreted_text: String(parsed.interpreted_text ?? parsed.interpretedText ?? ""),
        flagged_patterns: {
          b_d_reversals: Number(parsed.flagged_patterns?.b_d_reversals ?? parsed.flaggedPatterns?.b_d_reversals ?? 0) || 0,
          p_q_reversals: Number(parsed.flagged_patterns?.p_q_reversals ?? parsed.flaggedPatterns?.p_q_reversals ?? 0) || 0,
          other_reversals: Array.isArray(parsed.flagged_patterns?.other_reversals)
            ? parsed.flagged_patterns.other_reversals.map(String)
            : Array.isArray(parsed.flaggedPatterns?.other_reversals)
              ? parsed.flaggedPatterns.other_reversals.map(String)
              : [],
          phonetic_substitutions: Array.isArray(parsed.flagged_patterns?.phonetic_substitutions)
            ? parsed.flagged_patterns.phonetic_substitutions.map(String)
            : Array.isArray(parsed.flaggedPatterns?.phonetic_substitutions)
              ? parsed.flaggedPatterns.phonetic_substitutions.map(String)
              : [],
          spacing_irregular: Boolean(parsed.flagged_patterns?.spacing_irregular ?? parsed.flaggedPatterns?.spacing_irregular ?? false),
          sizing_inconsistent: Boolean(parsed.flagged_patterns?.sizing_inconsistent ?? parsed.flaggedPatterns?.sizing_inconsistent ?? false),
          observations: String(parsed.flagged_patterns?.observations ?? parsed.flaggedPatterns?.observations ?? ""),
        },
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

  // Mount API sub-routers (extracted)
  app.use("/api", cuesRouter);

  // ── STATIC / VITE ─────────────────────────────────────────────────────────

  const viteRoot = path.join(__dirname, "frontend");

  if (process.env.NODE_ENV !== "production") {
    // Dynamic import so vite is never loaded in production builds
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: viteRoot,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const possibleDistDirs = [
      path.join(viteRoot, "dist"),
      path.join(__dirname, "dist"),
      path.join(__dirname, "..", "dist"),
      path.join(process.cwd(), "dist"),
      path.join(process.cwd(), "src", "dist"),
      path.join(__dirname, "..", "src", "dist"),
      path.join(__dirname, "..", "..", "dist"),
    ];

    const clientDist = possibleDistDirs.find((dir) => existsSync(dir));
    if (clientDist) {
      app.use(express.static(clientDist));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(clientDist, "index.html"));
      });
      return;
    }

    console.warn("[build] Could not find dist directory. Checked:", possibleDistDirs);
    console.warn("[build] Falling back to Vite middleware for frontend assets in production.");

    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: viteRoot,
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
