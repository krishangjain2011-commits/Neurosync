/**
 * NeuroSync — Auth Layer
 *
 * Issues opaque 32-byte random session tokens stored in the DB.
 * The raw database user ID is NEVER sent to the client.
 * The client stores only the opaque token in localStorage.
 */

import { randomBytes } from "crypto";
import db from "../db/index.js";

const TOKEN_TTL_DAYS = 7;

export interface SessionUser {
  userId: number;
  orgId: number;
  role: string;
  email: string;
  displayName: string | null;
  preferredLanguage: string;
}

/** Create a new opaque token for a user, persist it, return the token string. */
export function createToken(userId: number): string {
  const token = randomBytes(32).toString("hex"); // 64-char hex, unguessable
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  db.prepare(
    "INSERT INTO session_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, expiresAt);

  return token;
}

/** Validate a token, return the session user or null. */
export function resolveToken(token: string): SessionUser | null {
  if (!token || token.length !== 64) return null;

  const row = db
    .prepare(
      `SELECT st.user_id, st.expires_at,
              u.org_id, u.role, u.email, u.display_name, u.preferred_language
       FROM   session_tokens st
       JOIN   users u ON u.id = st.user_id
       WHERE  st.token = ?
         AND  st.expires_at > datetime('now')`
    )
    .get(token) as any;

  if (!row) return null;

  return {
    userId: row.user_id,
    orgId: row.org_id,
    role: row.role,
    email: row.email,
    displayName: row.display_name,
    preferredLanguage: row.preferred_language,
  };
}

/** Revoke a specific token (logout). */
export function revokeToken(token: string): void {
  db.prepare("DELETE FROM session_tokens WHERE token = ?").run(token);
}

/** Revoke all tokens for a user (password change / account wipe). */
export function revokeAllUserTokens(userId: number): void {
  db.prepare("DELETE FROM session_tokens WHERE user_id = ?").run(userId);
}

/** Purge expired tokens (run at startup + periodically). */
export function purgeExpiredTokens(): void {
  const info = db
    .prepare("DELETE FROM session_tokens WHERE expires_at <= datetime('now')")
    .run();
  if (info.changes > 0) {
    console.log(`[auth] Purged ${info.changes} expired session tokens.`);
  }
}

// ─── Express middleware ──────────────────────────────────────────────────────

export type AuthedRequest = {
  sessionUser: SessionUser;
  sessionToken: string;
} & import("express").Request;

/**
 * Extracts token from:
 *   1. Cookie: neurosync_token
 *   2. Header: Authorization: Bearer <token>
 */
function extractToken(req: import("express").Request): string | null {
  // Cookie first
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)neurosync_token=([a-f0-9]{64})/);
  if (match) return match[1];

  // Bearer header fallback (for SPA reload from localStorage)
  const auth = req.headers["authorization"] as string | undefined;
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t.length === 64) return t;
  }

  return null;
}

export function authenticate(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = resolveToken(token);
  if (!user) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }
  (req as any).sessionUser = user;
  (req as any).sessionToken = token;
  next();
}

/** Role guard factory — use after authenticate. */
export function requireRole(...roles: string[]) {
  return (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction
  ): void => {
    const user: SessionUser = (req as any).sessionUser;
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden — insufficient role" });
      return;
    }
    next();
  };
}
