/**
 * Authentication Routes
 * Handles user registration, login, logout, and session management
 */

import express from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import db from "../../db/index.js";
import { createToken, revokeToken, authenticate } from "../../lib/auth.js";

const router = express.Router();

// Auth rate limiting — brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: "Too many requests — please try again in 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper to set token cookie
function setTokenCookie(res: express.Response, token: string): void {
  res.setHeader("Set-Cookie",
    `neurosync_token=${token}; HttpOnly; SameSite=${process.env.NODE_ENV === "production" ? "None; Secure" : "Lax"}; Path=/; Max-Age=${60 * 60 * 24 * 7}`
  );
}

function clearTokenCookie(res: express.Response): void {
  res.setHeader("Set-Cookie", "neurosync_token=; HttpOnly; Path=/; Max-Age=0");
}

/**
 * POST /api/guest-login
 * Auto-creates or retrieves user based on email + use case
 */
router.post("/guest-login", authLimiter, async (req, res) => {
  const { email, displayName, preferredLanguage, role, useCase } = req.body;
  
  if (!email || !displayName)
    return res.status(400).json({ error: "email and displayName required" });

  if (!email.includes("@"))
    return res.status(400).json({ error: "Invalid email address" });

  const targetOrgId = 1;
  const org = db.prepare("SELECT id FROM organizations WHERE id = ?").get(targetOrgId);
  if (!org) return res.status(400).json({ error: "Organization not found" });

  const safeRole = role && ["parent", "caregiver", "anganwadi_worker", "special_educator", "asha_worker"].includes(role)
    ? role : "parent";

  try {
    const guestPassword = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const hash = await bcrypt.hash(guestPassword, 12);

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      const token = createToken(user.id);
      setTokenCookie(res, token);
      return res.json({ token, email: user.email, role: user.role, displayName: user.display_name });
    }

    const info = db.prepare(
      "INSERT INTO users (org_id, email, password_hash, role, display_name, preferred_language) VALUES (?,?,?,?,?,?)"
    ).run(targetOrgId, email, hash, safeRole, displayName ?? null, preferredLanguage ?? "en");

    const userId = info.lastInsertRowid as number;
    const token = createToken(userId);
    setTokenCookie(res, token);
    
    res.json({ token, email, role: safeRole, displayName, useCase });
  } catch (err: any) {
    if (err.code === "SQLITE_CONSTRAINT")
      return res.status(400).json({ error: "Email already registered" });
    console.error("[guest-login]", err);
    res.status(500).json({ error: "Sign in failed" });
  }
});

/**
 * POST /api/login
 * Login with email and password
 */
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: "Invalid credentials" });

  const token = createToken(user.id);
  setTokenCookie(res, token);
  res.json({ token, email: user.email, role: user.role, displayName: user.display_name });
});

/**
 * POST /api/logout
 * Revoke session token
 */
router.post("/logout", authenticate, (req, res) => {
  revokeToken((req as any).sessionToken);
  clearTokenCookie(res);
  res.json({ status: "ok" });
});

export default router;
