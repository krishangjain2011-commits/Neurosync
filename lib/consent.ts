/**
 * NeuroSync — Consent Enforcement (DPDP Act 2023 aligned)
 *
 * Every write that touches child data MUST call assertConsent() first.
 * If no valid, non-expired, non-revoked consent exists, the operation
 * is rejected with 403.
 */

import db from "../db/index.js";
import type { SessionUser } from "./auth.js";

export interface ConsentRecord {
  id: number;
  consentingParentUserId: number;
  consentScope: Record<string, unknown>;
  consentGivenAt: string;
  consentExpiresAt: string | null;
  revokedAt: string | null;
}

/** Returns the active consent record for a child, or null if none exists. */
export function getActiveConsent(childId: number): ConsentRecord | null {
  const row = db
    .prepare(
      `SELECT cr.*
       FROM   consent_records cr
       JOIN   children_profiles cp ON cp.consent_record_id = cr.id
       WHERE  cp.id = ?
         AND  cr.revoked_at IS NULL
         AND (cr.consent_expires_at IS NULL OR cr.consent_expires_at > datetime('now'))`
    )
    .get(childId) as any;

  if (!row) return null;
  return {
    id: row.id,
    consentingParentUserId: row.consenting_parent_user_id,
    consentScope: JSON.parse(row.consent_scope || "{}"),
    consentGivenAt: row.consent_given_at,
    consentExpiresAt: row.consent_expires_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Throws a 403-style error object if consent is missing or expired.
 * Call before any write to progress, therapy_schedules, diet_plans,
 * or children_profiles.
 */
export function assertConsent(childId: number): void {
  const consent = getActiveConsent(childId);
  if (!consent) {
    const err: any = new Error(
      "No active consent record for this child. " +
        "Please obtain and record parental consent before adding data."
    );
    err.status = 403;
    err.code = "CONSENT_REQUIRED";
    throw err;
  }
}

/** Create a consent record and link it to the child profile. */
export function grantConsent(
  childId: number,
  parentUserId: number,
  scope: Record<string, unknown>,
  expiresAt?: string
): number {
  const info = db
    .prepare(
      `INSERT INTO consent_records
         (consenting_parent_user_id, consent_scope, consent_expires_at)
       VALUES (?, ?, ?)`
    )
    .run(parentUserId, JSON.stringify(scope), expiresAt ?? null);

  const consentId = info.lastInsertRowid as number;

  db.prepare(
    "UPDATE children_profiles SET consent_record_id = ? WHERE id = ?"
  ).run(consentId, childId);

  // Audit log
  db.prepare(
    `INSERT INTO consent_audit_log (consent_id, action, actor_user_id)
     VALUES (?, 'granted', ?)`
  ).run(consentId, parentUserId);

  return consentId;
}

/** Revoke consent (right to erasure trigger, DPDP §12). */
export function revokeConsent(
  consentId: number,
  actorUserId: number,
  notes?: string
): void {
  db.prepare(
    "UPDATE consent_records SET revoked_at = datetime('now') WHERE id = ?"
  ).run(consentId);

  db.prepare(
    `INSERT INTO consent_audit_log (consent_id, action, actor_user_id, notes)
     VALUES (?, 'revoked', ?, ?)`
  ).run(consentId, actorUserId, notes ?? null);
}

/** Hard-delete all data for a child (right to erasure, DPDP §17). */
export function eraseChildData(
  childId: number,
  actorUserId: number
): { deleted: number } {
  // Log intent first (audit trail must survive even an erasure)
  const cr = db
    .prepare(
      "SELECT consent_record_id FROM children_profiles WHERE id = ?"
    )
    .get(childId) as any;

  if (cr?.consent_record_id) {
    revokeConsent(cr.consent_record_id, actorUserId, "Data erasure request");
  }

  // Cascade deletes handle related rows via FK ON DELETE CASCADE
  const info = db
    .prepare("DELETE FROM children_profiles WHERE id = ?")
    .run(childId);

  return { deleted: info.changes };
}
