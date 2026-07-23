/**
 * NeuroSync — Auth Layer
 *
 * Issues opaque 32-byte random session tokens stored in the DB.
 * The raw database user ID is NEVER sent to the client.
 * The client stores only the opaque token in localStorage.
 */

import { randomBytes } from "crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

interface FirebaseTokenPayload {
  uid: string;
  email?: string;
  name?: string;
  locale?: string;
}

function getFirebaseServiceAccount(): Record<string, string> | null {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      // ignore invalid JSON
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (clientEmail && privateKey && projectId) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

const firebaseServiceAccount = getFirebaseServiceAccount();
let firebaseEnabled = false;
if (firebaseServiceAccount) {
  try {
    initializeApp({ credential: cert(firebaseServiceAccount) });
    firebaseEnabled = true;
    console.log("[Firebase] Admin authentication configured");
  } catch (err) {
    console.warn("[Firebase] Admin initialization failed", err);
  }
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

export async function verifyFirebaseToken(idToken: string): Promise<FirebaseTokenPayload | null> {
  if (!firebaseEnabled) return null;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email ?? undefined,
      name: decoded.name ?? undefined,
      locale: decoded.locale ?? undefined,
    };
  } catch (err) {
    console.warn("[Firebase] ID token verification failed", err);
    return null;
  }
}

export function isFirebaseAuthEnabled(): boolean {
  return firebaseEnabled;
}

export function getOrCreateLocalUserForFirebase(
  payload: FirebaseTokenPayload,
  opts: {
    preferredLanguage?: string;
    role?: string;
    displayName?: string | null;
    orgId?: number;
  } = {}
): SessionUser | null {
  if (!payload.uid) return null;

  const email = payload.email ?? `firebase:${payload.uid}@firebase.local`;
  let row: any = db
    .prepare(
      `SELECT id, org_id, email, role, display_name, preferred_language, firebase_uid
       FROM users WHERE firebase_uid = ?`
    )
    .get(payload.uid);

  if (!row) {
    row = db
      .prepare(
        `SELECT id, org_id, email, role, display_name, preferred_language, firebase_uid
         FROM users WHERE email = ?`
      )
      .get(email);

    if (row && !row.firebase_uid) {
      db.prepare("UPDATE users SET firebase_uid = ? WHERE id = ?").run(payload.uid, row.id);
      row.firebase_uid = payload.uid;
    }
  }

  if (!row) {
    const targetOrgId = opts.orgId ?? 1;
    const org = db.prepare("SELECT id FROM organizations WHERE id = ?").get(targetOrgId);
    const safeOrgId = org ? targetOrgId : 1;
    const safeRole = opts.role && [
      "parent", "caregiver", "anganwadi_worker",
      "special_educator", "asha_worker"
    ].includes(opts.role)
      ? opts.role
      : "parent";
    const displayName = opts.displayName ?? payload.name ?? null;
    const preferredLanguage = opts.preferredLanguage ?? payload.locale?.slice(0, 2) ?? "en";

    const info = db.prepare(
      "INSERT INTO users (org_id, email, password_hash, role, display_name, preferred_language, firebase_uid, auth_provider) VALUES (?,?,?,?,?,?,?,?)"
    ).run(safeOrgId, email, "", safeRole, displayName, preferredLanguage, payload.uid, "firebase");

    row = db
      .prepare(
        `SELECT id, org_id, email, role, display_name, preferred_language
         FROM users WHERE id = ?`
      )
      .get(info.lastInsertRowid as number);
  }

  return {
    userId: row.id,
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

// ─── Express middleware ──────────────────────────────────────────────────────────────

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

  // Bearer header fallback (for SPA reload from localStorage or Firebase token)
  const auth = req.headers["authorization"] as string | undefined;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return null;
}

export async function authenticate(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let user = resolveToken(token);
  if (!user && firebaseEnabled) {
    const firebasePayload = await verifyFirebaseToken(token);
    if (firebasePayload) {
      user = getOrCreateLocalUserForFirebase(firebasePayload);
    }
  }

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
