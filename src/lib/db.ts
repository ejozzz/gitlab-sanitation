// lib/db.ts
import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'sanitation.db');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// Create database connection
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ----------  initialise tables  ----------
function initializeDatabase() {
  // 1.  USERS
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT UNIQUE NOT NULL,
      password_hash   TEXT        NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2.  USER_PROJECTS  (encrypted, per-user)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_projects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      name              TEXT NOT NULL,
      gitlab_host       TEXT NOT NULL,
      project_id        TEXT NOT NULL,
      token_ciphertext  TEXT NOT NULL,
      token_nonce       TEXT NOT NULL,
      token_tag         TEXT NOT NULL,
      is_active         BOOLEAN DEFAULT FALSE,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3.  USER_SESSIONS
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at  DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 4.  PROJECTS  (global list, same shape as old JSON)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      gitlab_url   TEXT NOT NULL,
      projectId    TEXT NOT NULL,
      access_token TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 5.  CONFIG  (single-row key/value store)
  db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

  console.log('✔ Database initialised');
}

initializeDatabase();

// ----------  exports  ----------
export { db, closeDatabase };

/* keep the helper you already had */
export function closeDatabase() {
  db.close();
}

/* default export so `import db from '@/lib/db'` keeps working */
export default db;