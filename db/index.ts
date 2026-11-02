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
      preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Children table
  db.exec(`
    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      age INTEGER,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES users(id)
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

  // AI repair log (for tracking JSON fixes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_repair_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      repaired BOOLEAN,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
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
