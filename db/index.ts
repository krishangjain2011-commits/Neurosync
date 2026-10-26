/**
 * NeuroSync — Database Access Layer
 *
 * All SQLite-specific syntax is confined to this file so the rest of the
 * application never calls better-sqlite3 directly. Swapping in a Postgres
 * adapter requires changes only here.
 */

import Database from "better-sqlite3";
import path from "path";
import { existsSync, mkdirSync, unlinkSync } from "fs";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "neurosync.db");
const FALLBACK_DB_PATH = path.join(process.cwd(), "tmp", "neurosync.db");

function ensureDirectory(pathToCheck: string): void {
  const dir = path.dirname(pathToCheck);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function resolveDatabasePath(requestedPath: string, fallbackPath: string): string {
  try {
    ensureDirectory(requestedPath);
    return requestedPath;
  } catch (err: any) {
    console.warn(
      `[env] Cannot create database directory for ${requestedPath}: ${err.message}. Falling back to ${fallbackPath}`
    );
    ensureDirectory(fallbackPath);
    return fallbackPath;
  }
}

const RESOLVED_DB_PATH = resolveDatabasePath(DB_PATH, FALLBACK_DB_PATH);

let dbInstance: Database.Database;
try {
  dbInstance = new Database(RESOLVED_DB_PATH);
} catch (err: any) {
  const fallbackPath = FALLBACK_DB_PATH;
  console.warn(
    `[env] Cannot open database at ${RESOLVED_DB_PATH}: ${err.message}. Falling back to ${fallbackPath}`
  );
  ensureDirectory(fallbackPath);
  dbInstance = new Database(fallbackPath);
}

export const db = dbInstance;

export function purgeStaleCueMedia(): void {
  // Fetch paths before nullifying so we can delete from disk
  const stale: any[] = db.prepare(`
    SELECT media_ref FROM cue_events
    WHERE  media_ref IS NOT NULL
      AND  created_at <= datetime('now', '-30 days')
  `).all() as any[];

  if (stale.length > 0) {
    for (const row of stale) {
      try {
        if (existsSync(row.media_ref)) unlinkSync(row.media_ref);
      } catch {
        // ignore - file may already be gone
      }
    }

    db.prepare(`
      UPDATE cue_events
      SET    media_ref = NULL
      WHERE  media_ref IS NOT NULL
        AND  created_at <= datetime('now', '-30 days')
    `).run();
  }
}

// Performance & integrity
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ─── Schema ─────────────────────────────────────────────────────────────────
// Create all tables first

db.exec(`
  -- Tenants / organisations
  CREATE TABLE IF NOT EXISTS organizations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'family'
                CHECK(type IN ('family','anganwadi','school','phc','ngo','district_admin')),
    region_code TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Users (all roles live in one table, scoped by org)
  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email            TEXT    NOT NULL UNIQUE,
    password_hash    TEXT    NOT NULL,
    role             TEXT    NOT NULL DEFAULT 'parent'
                     CHECK(role IN ('parent','caregiver','anganwadi_worker',
                                    'special_educator','asha_worker','district_admin')),
    display_name     TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'en',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE        INDEX IF NOT EXISTS idx_users_org   ON users(org_id);

  -- Opaque session tokens (replaces in-memory express-session store for auth)
  CREATE TABLE IF NOT EXISTS session_tokens (
    token         TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at    DATETIME NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_session_token_user ON session_tokens(user_id);

  -- Consent records (DPDP-aligned)
  CREATE TABLE IF NOT EXISTS consent_records (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    consenting_parent_user_id INTEGER NOT NULL REFERENCES users(id),
    consent_scope           TEXT    NOT NULL, -- JSON
    consent_given_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    consent_expires_at      DATETIME,
    revoked_at              DATETIME
  );

  -- Consent audit log (append-only)
  CREATE TABLE IF NOT EXISTS consent_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    consent_id  INTEGER NOT NULL REFERENCES consent_records(id),
    action      TEXT    NOT NULL CHECK(action IN ('granted','renewed','revoked')),
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes       TEXT
  );

  -- Children profiles (keyed by child, not user)
  CREATE TABLE IF NOT EXISTS children_profiles (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id           INTEGER NOT NULL REFERENCES organizations(id),
    added_by_user_id INTEGER NOT NULL REFERENCES users(id),
    consent_record_id INTEGER REFERENCES consent_records(id),
    onboarding_data  TEXT,   -- JSON
    external_ref     TEXT,   -- JSON: { udid, abha_id } — consent-gated, optional
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_children_org ON children_profiles(org_id);

  -- Many-to-many: which users can co-manage which children
  CREATE TABLE IF NOT EXISTS child_access (
    user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    child_id   INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    granted_by INTEGER NOT NULL REFERENCES users(id),
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, child_id)
  );

  -- Progress metrics
  CREATE TABLE IF NOT EXISTS progress (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id           INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    metric_type        TEXT    NOT NULL,
    value              INTEGER NOT NULL,
    timestamp          DATETIME DEFAULT CURRENT_TIMESTAMP,
    recorded_by_user_id INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_progress_child ON progress(child_id);
  CREATE INDEX IF NOT EXISTS idx_progress_ts    ON progress(timestamp);

  -- Therapy schedules
  CREATE TABLE IF NOT EXISTS therapy_schedules (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id          INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    schedule_json     TEXT    NOT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_therapy_child ON therapy_schedules(child_id);

  -- Diet plans
  CREATE TABLE IF NOT EXISTS diet_plans (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id          INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    plan_json         TEXT    NOT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_diet_child ON diet_plans(child_id);

  -- JSON repair telemetry (for AI output quality monitoring)
  CREATE TABLE IF NOT EXISTS ai_repair_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint   TEXT    NOT NULL,
    repaired   INTEGER NOT NULL DEFAULT 0, -- 1 = repair was needed
    ts         DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ── Personalized Cue Interpreter ────────────────────────────────────────────

  -- Per-child cue library (each entry is one child's unique signal + its meaning)
  CREATE TABLE IF NOT EXISTS cue_library (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id            INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    label               TEXT    NOT NULL,             -- caregiver's own words
    media_type          TEXT    NOT NULL DEFAULT 'audio'
                        CHECK(media_type IN ('audio','video')),
    media_ref           TEXT,                         -- path to stored clip (consent-gated)
    embedding_vector    TEXT,                         -- JSON float array for cosine matching
    confirmed_count     INTEGER NOT NULL DEFAULT 1,   -- confirmed correct matches
    created_by_user_id  INTEGER NOT NULL REFERENCES users(id),
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cue_library_child ON cue_library(child_id);

  -- Log of every interpret event (matched or unmatched)
  CREATE TABLE IF NOT EXISTS cue_events (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id                        INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    media_ref                       TEXT,             -- short-lived; auto-deleted after 30 days
    matched_cue_id                  INTEGER REFERENCES cue_library(id),
    match_confidence                REAL,
    ai_interpretations              TEXT,             -- JSON array of 5-6 candidates
    caregiver_selected_interpretation TEXT,
    escalated                       INTEGER NOT NULL DEFAULT 0,  -- boolean
    escalated_at                    DATETIME,
    created_at                      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_cue_events_child ON cue_events(child_id);
  CREATE INDEX IF NOT EXISTS idx_cue_events_created ON cue_events(created_at);

  -- ── Handwriting Interpreter ──────────────────────────────────────────────────

  CREATE TABLE IF NOT EXISTS handwriting_samples (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id                  INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
    image_ref                 TEXT,             -- storage path, nullable (can be discarded post-processing)
    retain_image              INTEGER NOT NULL DEFAULT 0, -- 1 = caregiver opted to keep image
    raw_transcription         TEXT,             -- literal best-effort reading
    interpreted_text          TEXT,             -- AI corrected version
    flagged_patterns          TEXT,             -- JSON: {b_d_reversals, phonetic_substitutions, spacing_irregular}
    caregiver_confirmed_text  TEXT,             -- caregiver correction / confirmation
    created_by_user_id        INTEGER NOT NULL REFERENCES users(id),
    created_at                DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_hw_child    ON handwriting_samples(child_id);
  CREATE INDEX IF NOT EXISTS idx_hw_created  ON handwriting_samples(created_at);

  -- ── Shared Cue Pool (opt-in, prototype) ─────────────────────────────────────
  -- Only embedding vectors + caregiver-confirmed labels are stored here.
  -- Raw audio is never pooled. Families opt in via a separate consent toggle.

  CREATE TABLE IF NOT EXISTS shared_cue_pool (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding_vector TEXT    NOT NULL,   -- JSON float array (never raw audio)
    confirmed_label  TEXT    NOT NULL,   -- caregiver-confirmed meaning
    child_id         INTEGER REFERENCES children_profiles(id) ON DELETE SET NULL,
    contributed_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_shared_pool_label ON shared_cue_pool(confirmed_label);

  -- Cluster centroids — computed periodically by /api/admin/shared-pool/recluster
  CREATE TABLE IF NOT EXISTS shared_cue_clusters (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id   TEXT    NOT NULL UNIQUE,  -- e.g. "cluster_0"
    centroid     TEXT    NOT NULL,         -- JSON float array
    top_labels   TEXT    NOT NULL,         -- JSON array of {label, count}
    member_count INTEGER NOT NULL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ── YouTube thumbnail cache ──────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS youtube_cache (
    cache_key   TEXT    PRIMARY KEY,   -- sha256(subject+topic+difficulty)
    results     TEXT    NOT NULL,      -- JSON array of video objects
    fetched_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Bootstrap default organization ───────────────────────────────────────
// Ensure organization 1 exists for user registration
const defaultOrg = db.prepare("SELECT id FROM organizations WHERE id = 1").get();
if (!defaultOrg) {
  db.prepare(
    "INSERT INTO organizations (id, name, type, region_code) VALUES (?,?,?,?)"
  ).run(1, "Default Organization", "family", null);
}

export default db;
