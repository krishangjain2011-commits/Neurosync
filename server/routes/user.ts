/**
 * User Routes
 * Handles user profile, children profiles, and data management
 */

import express from "express";
import db from "../../db/index.js";
import { authenticate } from "../../lib/auth.js";
import { assertConsent, revokeConsent, eraseChildData } from "../../lib/consent.js";

const router = express.Router();

/**
 * GET /api/me
 * Get current user profile with children
 */
router.get("/me", authenticate, (req, res) => {
  const { userId } = (req as any).sessionUser;
  const user: any = db.prepare(
    "SELECT id, org_id, email, role, display_name, preferred_language FROM users WHERE id = ?"
  ).get(userId);
  
  if (!user) return res.status(404).json({ error: "User not found" });

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

/**
 * POST /api/children
 * Create new child profile
 */
router.post("/children", authenticate, (req, res) => {
  const { sessionUser } = req as any;
  const { onboardingData, consentScope, consentExpiresAt } = req.body;
  
  if (!onboardingData) return res.status(400).json({ error: "onboardingData required" });

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

  db.prepare("INSERT INTO child_access (user_id, child_id, granted_by) VALUES (?,?,?)")
    .run(sessionUser.userId, childId, sessionUser.userId);

  res.json({ childId, consentId });
});

/**
 * PUT /api/children/:id/onboarding
 * Update child onboarding data
 */
router.put("/children/:id/onboarding", authenticate, (req, res) => {
  const childId = parseInt(req.params.id);
  assertConsent(childId);
  
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get((req as any).sessionUser.userId, childId);
  if (!access) return res.status(403).json({ error: "No access to this child" });

  db.prepare("UPDATE children_profiles SET onboarding_data=? WHERE id=?")
    .run(JSON.stringify(req.body.data), childId);
  res.json({ status: "ok" });
});

/**
 * DELETE /api/children/:id/data
 * Right to erasure (DPDP §17)
 */
router.delete("/children/:id/data", authenticate, (req, res) => {
  const childId = parseInt(req.params.id);
  const { sessionUser } = req as any;
  
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(sessionUser.userId, childId);
  if (!access && sessionUser.role !== "district_admin")
    return res.status(403).json({ error: "No access to this child" });

  const result = eraseChildData(childId, sessionUser.userId);
  res.json({ status: "erased", ...result });
});

/**
 * POST /api/children/:id/consent/revoke
 * Revoke consent for child data
 */
router.post("/children/:id/consent/revoke", authenticate, (req, res) => {
  const childId = parseInt(req.params.id);
  const { sessionUser } = req as any;
  
  const child: any = db.prepare("SELECT consent_record_id FROM children_profiles WHERE id=?").get(childId);
  if (!child) return res.status(404).json({ error: "Child not found" });

  revokeConsent(child.consent_record_id, sessionUser.userId, req.body.reason);
  res.json({ status: "revoked" });
});

/**
 * GET /api/children/:id/report
 * Generate comprehensive report for a child
 */
router.get("/children/:id/report", authenticate, (req, res) => {
  const childId = parseInt(req.params.id);
  const { userId } = (req as any).sessionUser;
  
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(userId, childId);
  if (!access) return res.status(403).json({ error: "No access to this child" });

  const child: any = db.prepare(
    "SELECT onboarding_data FROM children_profiles WHERE id=?"
  ).get(childId);
  
  if (!child) return res.status(404).json({ error: "Child not found" });

  const onboarding = child.onboarding_data ? JSON.parse(child.onboarding_data) : {};

  // Get progress data
  const progressData: any[] = db.prepare(
    `SELECT metric_type, value, timestamp FROM progress WHERE child_id=? ORDER BY timestamp DESC LIMIT 100`
  ).all(childId) as any[];

  const progressSummary: Record<string, { latest: number; count: number; avg: number }> = {};
  for (const p of progressData) {
    if (!progressSummary[p.metric_type]) {
      progressSummary[p.metric_type] = { latest: 0, count: 0, avg: 0 };
    }
    progressSummary[p.metric_type].count++;
    progressSummary[p.metric_type].latest = p.value;
    progressSummary[p.metric_type].avg += p.value;
  }

  for (const key in progressSummary) {
    progressSummary[key].avg /= progressSummary[key].count;
  }

  // Get latest diet and routine
  const latestDiet: any = db.prepare(
    "SELECT * FROM diet_plans WHERE child_id=? ORDER BY created_at DESC LIMIT 1"
  ).get(childId);

  const latestRoutine: any = db.prepare(
    "SELECT * FROM therapy_schedules WHERE child_id=? ORDER BY created_at DESC LIMIT 1"
  ).get(childId);

  res.json({
    generatedAt: new Date().toISOString(),
    child: {
      name: onboarding.name || "Unknown",
      age: onboarding.age,
      diagnoses: onboarding.diagnoses || [],
      sensoryTriggers: onboarding.sensoryTriggers || [],
      strengths: onboarding.strengths || [],
      goals: onboarding.goals || [],
    },
    progressSummary,
    recentProgress: progressData.slice(0, 20),
    latestDietPlan: latestDiet,
    latestRoutine: latestRoutine,
  });
});

/**
 * POST /api/children/:id/report/narrative
 * Generate AI narrative for a report
 */
router.post("/children/:id/report/narrative", authenticate, async (req, res) => {
  const childId = parseInt(req.params.id);
  const { userId } = (req as any).sessionUser;
  
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(userId, childId);
  if (!access) return res.status(403).json({ error: "No access to this child" });

  const child: any = db.prepare(
    "SELECT onboarding_data FROM children_profiles WHERE id=?"
  ).get(childId);
  
  if (!child) return res.status(404).json({ error: "Child not found" });

  const onboarding = child.onboarding_data ? JSON.parse(child.onboarding_data) : {};

  // For now, return a basic narrative (AI generation would happen here)
  const narrative = `${onboarding.name || "Child"} is a ${onboarding.age || "young"} child with the following diagnoses: ${(onboarding.diagnoses || []).join(", ") || "None documented"}. They have demonstrated strengths in ${(onboarding.strengths || []).slice(0, 2).join(", ") || "multiple areas"}. Current goals include ${(onboarding.goals || []).slice(0, 2).join(", ") || "ongoing development"}.`;

  res.json({ narrative });
});

/**
 * GET /api/children/:id/shares
 * Get list of users who have access to this child's data
 */
router.get("/children/:id/shares", authenticate, (req, res) => {
  const childId = parseInt(req.params.id);
  const { userId } = (req as any).sessionUser;
  
  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(userId, childId);
  if (!access) return res.status(403).json({ error: "No access to this child" });

  const shares: any[] = db.prepare(
    `SELECT u.id, u.email, u.display_name, ca.role, ca.granted_at
     FROM child_access ca
     JOIN users u ON u.id = ca.user_id
     WHERE ca.child_id=? AND ca.user_id != ?
     ORDER BY ca.granted_at DESC`
  ).all(childId, userId) as any[];

  res.json(shares.map(s => ({
    id: s.id,
    email: s.email,
    display_name: s.display_name,
    role: s.role || "caregiver",
    granted_at: s.granted_at,
  })));
});

/**
 * POST /api/children/:id/share
 * Share child's data with another user
 */
router.post("/children/:id/share", authenticate, async (req, res) => {
  const childId = parseInt(req.params.id);
  const { userId } = (req as any).sessionUser;
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "email required" });

  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(userId, childId);
  if (!access) return res.status(403).json({ error: "No access to this child" });

  const targetUser: any = db.prepare("SELECT id, role FROM users WHERE email=?").get(email);
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  const existing = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(targetUser.id, childId);
  
  if (existing) {
    return res.json({ status: "already_shared", sharedWith: email, role: targetUser.role });
  }

  db.prepare("INSERT INTO child_access (user_id, child_id, granted_by, role) VALUES (?,?,?,?)")
    .run(targetUser.id, childId, userId, targetUser.role || "caregiver");

  res.json({ status: "shared", sharedWith: email, role: targetUser.role });
});

/**
 * DELETE /api/children/:id/share/:userId
 * Revoke access to child's data
 */
router.delete("/children/:id/share/:userId", authenticate, (req, res) => {
  const childId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const { userId } = (req as any).sessionUser;

  const access = db.prepare("SELECT 1 FROM child_access WHERE user_id=? AND child_id=?")
    .get(userId, childId);
  if (!access) return res.status(403).json({ error: "No access to this child" });

  db.prepare("DELETE FROM child_access WHERE user_id=? AND child_id=?")
    .run(targetUserId, childId);

  res.json({ status: "revoked" });
});

export default router;
