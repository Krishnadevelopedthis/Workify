import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DATA_DIR = path.join(process.cwd(), "data");

const globalForDb = globalThis as unknown as { workifyDb?: DatabaseSync };

function open() {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "workify.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      steps TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signature_requests (
      id TEXT PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      signed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sign_owner ON signature_requests(owner_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sign_created ON signature_requests(created_at);
  `);
  return db;
}

// SQLite runs in-process: one shared connection (WAL mode) is the right
// model, so there is no connection pool. Reused across dev hot reloads.
const conn = (globalForDb.workifyDb ??= open());

// Prepared statements are compiled once and reused.
const statements = new Map<string, ReturnType<DatabaseSync["prepare"]>>();
export const db = {
  prepare(sql: string) {
    let s = statements.get(sql);
    if (!s) {
      s = conn.prepare(sql);
      statements.set(sql, s);
    }
    return s;
  },
};
