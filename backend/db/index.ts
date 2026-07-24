/**
 * NeuroSync — Database Access Layer
 *
 * All SQLite-specific syntax is confined to this file so the rest of the
 * application never calls better-sqlite3 directly. Swapping in a Postgres
 * adapter requires changes only here.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, unlinkSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "neurosync.db");
const FALLBACK_DB_PATH = path.join("/tmp", "neurosync.db");

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

// Performance & integrity
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ─── Schema ─────────────────────────────────────────────────────────────────

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

// ─── Safe migrations ─────────────────────────────────────────────────────────

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return cols.some((c) => c.name === column);
}

// v3: cue_events — add columns for two-step prediction flow
if (!columnExists("cue_events", "embedding_vector")) {
  db.exec(`ALTER TABLE cue_events ADD COLUMN embedding_vector TEXT`);
  console.log("[DB] cue_events: added embedding_vector");
}
if (!columnExists("cue_events", "embedding_model")) {
  db.exec(`ALTER TABLE cue_events ADD COLUMN embedding_model TEXT`);
  console.log("[DB] cue_events: added embedding_model");
}
if (!columnExists("cue_events", "audio_duration_ms")) {
  db.exec(`ALTER TABLE cue_events ADD COLUMN audio_duration_ms INTEGER`);
  console.log("[DB] cue_events: added audio_duration_ms");
}
// cue_library — ensure media_ref exists (may be absent on older installs)
if (!columnExists("cue_library", "media_ref")) {
  db.exec(`ALTER TABLE cue_library ADD COLUMN media_ref TEXT`);
  console.log("[DB] cue_library: added media_ref");
}

// v1 → v2: users table restructure
if (!columnExists("users", "org_id")) {
  console.log("[DB] Migrating users table to v2 schema…");
  // Rename old table, recreate, migrate rows into a default org
  db.exec(`
    ALTER TABLE users RENAME TO users_v1;
    INSERT OR IGNORE INTO organizations (id, name, type) VALUES (1, 'Default Family', 'family');
  `);
  // The new users table was already created above by CREATE TABLE IF NOT EXISTS
  // Migrate old rows
  const old = db.prepare("SELECT * FROM users_v1").all() as any[];
  const ins = db.prepare(
    "INSERT OR IGNORE INTO users (id, org_id, email, password_hash, role, display_name) VALUES (?,1,?,?,?,?)"
  );
  for (const u of old) {
    ins.run(u.id, u.email, u.password || u.password_hash || "", "parent", u.email);
  }
  console.log(`[DB] Migrated ${old.length} users.`);
}

// v4: shared pool consent flag on users — default ON (all users contribute anonymised embeddings)
if (!columnExists("users", "shared_pool_consent")) {
  db.exec(`ALTER TABLE users ADD COLUMN shared_pool_consent INTEGER NOT NULL DEFAULT 1`);
  console.log("[DB] users: added shared_pool_consent (default ON)");
}
// Ensure existing users also have it enabled
db.exec(`UPDATE users SET shared_pool_consent = 1 WHERE shared_pool_consent = 0`);

// v5: rebuild cue_events so matched_cue_id has ON DELETE SET NULL.
// SQLite cannot alter FK constraints — only way is to recreate the table.
// We detect whether the fix is needed by checking the CREATE TABLE SQL stored in sqlite_master.
{
  const tblInfo: any = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='cue_events'"
  ).get();
  const needsRebuild = tblInfo?.sql && !tblInfo.sql.includes("ON DELETE SET NULL");
  if (needsRebuild) {
    console.log("[DB] Rebuilding cue_events to add ON DELETE SET NULL on matched_cue_id…");
    db.exec(`
      PRAGMA foreign_keys = OFF;

      ALTER TABLE cue_events RENAME TO cue_events_old;

      CREATE TABLE cue_events (
        id                              INTEGER PRIMARY KEY AUTOINCREMENT,
        child_id                        INTEGER NOT NULL REFERENCES children_profiles(id) ON DELETE CASCADE,
        media_ref                       TEXT,
        matched_cue_id                  INTEGER REFERENCES cue_library(id) ON DELETE SET NULL,
        match_confidence                REAL,
        ai_interpretations              TEXT,
        caregiver_selected_interpretation TEXT,
        escalated                       INTEGER NOT NULL DEFAULT 0,
        escalated_at                    DATETIME,
        created_at                      DATETIME DEFAULT CURRENT_TIMESTAMP,
        embedding_vector                TEXT,
        embedding_model                 TEXT,
        audio_duration_ms               INTEGER
      );

      INSERT INTO cue_events
        SELECT id, child_id, media_ref, matched_cue_id, match_confidence,
               ai_interpretations, caregiver_selected_interpretation,
               escalated, escalated_at, created_at,
               embedding_vector, embedding_model, audio_duration_ms
        FROM cue_events_old;

      DROP TABLE cue_events_old;

      CREATE INDEX IF NOT EXISTS idx_cue_events_child   ON cue_events(child_id);
      CREATE INDEX IF NOT EXISTS idx_cue_events_created ON cue_events(created_at);

      PRAGMA foreign_keys = ON;
    `);
    console.log("[DB] cue_events rebuild complete — ON DELETE SET NULL is now active.");
  }
}

// Ensure at least one default org exists
const orgCount = (db.prepare("SELECT COUNT(*) as n FROM organizations").get() as any).n;
if (orgCount === 0) {
  db.prepare("INSERT INTO organizations (name, type) VALUES ('Default Family', 'family')").run();
}

/**
 * Retention policy: nullify media_ref on cue_events older than 30 days.
 * Also deletes the actual file from disk if it still exists.
 * Raw clips must not persist — only embeddings + labels in cue_library are kept.
 */
export function purgeStaleCueMedia(): void {
  // Fetch paths before nullifying so we can delete from disk
  const stale: any[] = db.prepare(`
    SELECT media_ref FROM cue_events
    WHERE  media_ref IS NOT NULL
      AND  created_at <= datetime('now', '-30 days')
  `).all() as any[];

  if (stale.length > 0) {
    // Delete files from disk
    for (const row of stale) {
      try {
        if (existsSync(row.media_ref)) unlinkSync(row.media_ref);
      } catch { /* ignore — file may already be gone */ }
    }

    const info = db.prepare(`
      UPDATE cue_events
      SET    media_ref = NULL
      WHERE  media_ref IS NOT NULL
        AND  created_at <= datetime('now', '-30 days')
    `).run();
    console.log(`[DB] Purged media_ref + files from ${info.changes} stale cue_events.`);
  }
}

export default db;
