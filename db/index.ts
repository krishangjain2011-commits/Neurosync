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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "..", "neurosync.db");

export const db = new Database(DB_PATH);

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
`);

// ─── Safe migrations ─────────────────────────────────────────────────────────

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return cols.some((c) => c.name === column);
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

// Ensure at least one default org exists
const orgCount = (db.prepare("SELECT COUNT(*) as n FROM organizations").get() as any).n;
if (orgCount === 0) {
  db.prepare("INSERT INTO organizations (name, type) VALUES ('Default Family', 'family')").run();
}

/**
 * Retention policy: nullify media_ref on cue_events older than 30 days.
 * Raw clips must not persist — only embeddings + labels in cue_library are kept.
 */
export function purgeStaleCueMedia(): void {
  const info = db.prepare(`
    UPDATE cue_events
    SET    media_ref = NULL
    WHERE  media_ref IS NOT NULL
      AND  created_at <= datetime('now', '-30 days')
  `).run();
  if (info.changes > 0) {
    console.log(`[DB] Purged media_ref from ${info.changes} stale cue_events.`);
  }
}

export default db;
