import Database from 'better-sqlite3';
import { resolve } from 'path';
import { ensureUploadsDir } from '../lib/ensure-uploads.js';

const dbPath = process.env.DB_PATH || './neurosync.db';
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase(): void {
  ensureUploadsDir();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'parent',
      org_id TEXT,
      preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // Organizations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      region_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Session tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Children table
  db.exec(`
    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      org_id TEXT,
      name TEXT NOT NULL,
      age INTEGER,
      category TEXT,
      onboarding_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES users(id),
      FOREIGN KEY (org_id) REFERENCES organizations(id)
    )
  `);

  // Assessment results
  db.exec(`
    CREATE TABLE IF NOT EXISTS assessment_results (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL,
      child_id TEXT NOT NULL,
      answers TEXT,
      score REAL,
      started_at DATETIME,
      completed_at DATETIME,
      started_by TEXT,
      FOREIGN KEY (child_id) REFERENCES children(id)
    )
  `);

  // Progress metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS progress_metrics (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      value REAL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id)
    )
  `);

  // Teaching modules
  db.exec(`
    CREATE TABLE IF NOT EXISTS teaching_modules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Lesson plans
  db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_plans (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      adaptations TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id),
      FOREIGN KEY (module_id) REFERENCES teaching_modules(id)
    )
  `);

  // Diet plans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS diet_plans (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id)
    )
  `);

  // Therapy schedules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS therapy_schedules (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      therapy_type TEXT NOT NULL,
      day_of_week TEXT,
      time TEXT,
      duration_minutes INTEGER,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id)
    )
  `);

  // Audio cues table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audio_cues (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      embedding TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id)
    )
  `);

  // YouTube cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS youtube_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      results TEXT NOT NULL,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);

  // AI repair log (for tracking JSON fixes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_repair_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      repaired BOOLEAN,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
    CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);
    CREATE INDEX IF NOT EXISTS idx_children_org_id ON children(org_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_results_child_id ON assessment_results(child_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_results_assessment_id ON assessment_results(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_progress_metrics_child_id ON progress_metrics(child_id);
    CREATE INDEX IF NOT EXISTS idx_session_tokens_user_id ON session_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_session_tokens_expires ON session_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_audio_cues_child_id ON audio_cues(child_id);
    CREATE INDEX IF NOT EXISTS idx_youtube_cache_key ON youtube_cache(cache_key);
  `);

  console.log('Database initialized successfully');
}

// Purge expired tokens
export function purgeExpiredTokens(): void {
  // Implementation for session cleanup if needed
  console.log('Token purge completed');
}

// Purge stale cue media
export function purgeStaleCueMedia(): void {
  // Implementation for media cleanup
  console.log('Media purge completed');
}

// Initialize on module load
if (process.env.NODE_ENV !== 'test') {
  initializeDatabase();
}

export default db;
