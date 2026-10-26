import "./lib/load-env.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import multer from "multer";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import db from "./db/index.js";
import { authenticate, requireRole, purgeExpiredTokens } from "./lib/auth.js";
import { translateToEnglish, translateFromEnglish } from "./lib/language-bridge.js";
import { generateText, getActiveProvider } from "./lib/ai-client.js";
import { purgeStaleCueMedia } from "./db/index.js";

// ── ROUTE IMPORTS (modular) ────────────────────────────────────────────────
import authRouter from "./server/routes/auth.js";
import userRouter from "./server/routes/user.js";
import aiRouter from "./server/routes/ai.js";
import cuesRouter from "./routes/cues.js";

// ── SHARED UTILITIES ────────────────────────────────────────────────────────

/**
 * Self-healing JSON repair with telemetry
 */
export function repairJson(raw: string, endpoint: string): { result: string; repaired: boolean } {
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

/**
 * Parse numeric route parameter
 */
export function parseRouteNumber(params: Record<string, string | string[] | undefined>, key: string): number {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return parseInt(raw, 10);
}

// ── MULTER: HANDWRITING UPLOADS ────────────────────────────────────────────

const handwritingStorage = (multer as any).memoryStorage();
export const uploadHandwriting = (multer as any)({
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

// ── BACKGROUND MAINTENANCE ─────────────────────────────────────────────────

purgeExpiredTokens();
setInterval(purgeExpiredTokens, 1000 * 60 * 60); // hourly
purgeStaleCueMedia();
setInterval(purgeStaleCueMedia, 1000 * 60 * 60 * 24); // daily

// ── SERVER ─────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: false, limit: "20mb" }));

  // Disable keep-alive to reduce TIME_WAIT sockets
  app.use((req, res, next) => {
    res.set("Connection", "close");
    next();
  });

  // ── HEALTH CHECK (unauthenticated) ─────────────────────────────────────

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // ── MODULAR ROUTE MOUNTING ────────────────────────────────────────────

  app.use("/api", authRouter);        // /api/guest-login, /api/login, /api/logout
  app.use("/api", userRouter);        // /api/me, /api/children, /api/children/:id/*
  app.use("/api", aiRouter);          // /api/gemini/stream, /api/gemini/structured, /api/gemini/emergency
  app.use("/api", cuesRouter);        // /api/cues/* (handwriting, progress, diet, therapy, reports, etc)

  // ── ORGANIZATIONS ───────────────────────────────────────────────────────

  app.post("/api/organizations", async (req, res) => {
    const { name, type, regionCode } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const info = db.prepare(
      "INSERT INTO organizations (name, type, region_code) VALUES (?,?,?)"
    ).run(name, type ?? "family", regionCode ?? null);
    res.json({ id: info.lastInsertRowid, name, type: type ?? "family" });
  });

  // ── DISTRICT ADMIN — AGGREGATE INSIGHTS ────────────────────────────────

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

  // ── YOUTUBE SEARCH ─────────────────────────────────────────────────────

  app.get("/api/lesson/videos", authenticate, async (req, res) => {
    const subject    = String(req.query.subject   ?? "").trim().slice(0, 80);
    const topic      = String(req.query.topic     ?? "").trim().slice(0, 120);
    const difficulty = String(req.query.difficulty ?? "").trim().slice(0, 40);

    if (!subject) return res.status(400).json({ error: "subject required" });

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.json({ videos: [], cached: false, reason: "no_api_key" });
    }

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

      db.prepare(
        "INSERT OR REPLACE INTO youtube_cache (cache_key, results, fetched_at) VALUES (?,?,datetime('now'))"
      ).run(cacheKey, JSON.stringify(videos));

      res.json({ videos, cached: false });
    } catch (err: any) {
      console.warn("[youtube] search failed:", err.message);
      res.json({ videos: [], cached: false, reason: "fetch_failed" });
    }
  });

  // ── EMAIL & ADMIN ENDPOINTS ────────────────────────────────────────────

  /**
   * POST /api/admin/send-local-csv
   * Send local CSV export to admin email
   */
  app.post("/api/admin/send-local-csv", authenticate, async (req, res) => {
    const { csv, subject, note } = req.body;
    if (!csv) return res.status(400).json({ error: "csv required" });

    const adminEmail = process.env.ADMIN_REPORT_EMAIL;
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
    const smtpSecure = process.env.SMTP_SECURE === "true";
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!adminEmail || !smtpHost || !smtpPort || !smtpUser || !smtpPass) {
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
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `NeuroSync <${smtpUser}>`,
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

  // ── STATIC / VITE ─────────────────────────────────────────────────────────

  const viteRoot = path.join(__dirname, "frontend");

  if (process.env.NODE_ENV !== "production") {
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

  // ── CENTRAL ERROR HANDLER ──────────────────────────────────────────────

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || 500;
    console.error(`[error] ${status}:`, err.message);
    res.status(status).json({ error: err.message || "Internal server error" });
  });

  // ── START SERVER ───────────────────────────────────────────────────────

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
