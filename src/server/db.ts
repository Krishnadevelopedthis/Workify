import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// WORKIFY_DATA_DIR moves the database and its files elsewhere (tests give each
// worker its own folder, so parallel test files never share one database).
export const DATA_DIR = process.env.WORKIFY_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data");

const globalForDb = globalThis as unknown as { workifyDb?: DatabaseSync };

// Each entry upgrades the schema by one version (stored in PRAGMA user_version).
// Never edit a released migration; append a new one.
const MIGRATIONS: ((db: DatabaseSync) => void)[] = [
  // 1: the original schema.
  (db) =>
    db.exec(`
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
  `),

  // 2: verified emails, admin roles, email outbox, tokens, API, multi-signer
  // signing with an audit trail, monitoring and the Premium waitlist.
  (db) => {
    db.exec(`
    ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
    ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE users ADD COLUMN disabled_at INTEGER;
    ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
    ALTER TABLE contact_messages ADD COLUMN handled_at INTEGER;
    ALTER TABLE contact_messages ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';

    CREATE TABLE auth_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,            -- verify | reset | email-change
      data TEXT,                        -- the new address for email-change
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX idx_tokens_user ON auth_tokens(user_id, purpose);

    CREATE TABLE outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,             -- queued | sent | failed | logged (no SMTP configured)
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );
    CREATE INDEX idx_outbox_status ON outbox(status, created_at);

    CREATE TABLE api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,             -- first characters, shown so keys can be told apart
      key_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER
    );
    CREATE INDEX idx_api_keys_user ON api_keys(user_id);

    CREATE TABLE webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events TEXT NOT NULL,             -- comma-separated event names
      secret TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_status INTEGER,
      last_at INTEGER
    );
    CREATE INDEX idx_webhooks_user ON webhooks(user_id);

    CREATE TABLE api_tasks (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool TEXT NOT NULL,
      status TEXT NOT NULL,             -- queued | processing | done | failed
      result TEXT,                      -- JSON
      error TEXT,
      webhook_url TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX idx_api_tasks_user ON api_tasks(user_id, created_at);

    CREATE TABLE task_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool TEXT NOT NULL,
      source TEXT NOT NULL,             -- web | api
      ok INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX idx_task_stats_at ON task_stats(at);

    CREATE TABLE error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX idx_error_log_at ON error_log(at);

    CREATE TABLE premium_waitlist (
      email TEXT PRIMARY KEY COLLATE NOCASE,
      lang TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE sign_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      data TEXT NOT NULL,               -- JSON: signers, message, ordered, reminderDays
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_sign_templates_user ON sign_templates(user_id);

    -- Signature requests now have several signers and an audit trail.
    CREATE TABLE sign_requests (
      id TEXT PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      manage_hash TEXT NOT NULL UNIQUE, -- hash of the owner's private management link
      file_name TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_email TEXT,
      message TEXT NOT NULL,
      ordered INTEGER NOT NULL,         -- 1: signers sign one after another
      reminder_days INTEGER NOT NULL,   -- 0: no reminders
      status TEXT NOT NULL,             -- pending | completed | declined | cancelled
      lang TEXT NOT NULL,
      document_hash TEXT NOT NULL,      -- SHA-256 of the original PDF
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX idx_sign_requests_owner ON sign_requests(owner_id, created_at);
    CREATE INDEX idx_sign_requests_status ON sign_requests(status, expires_at);

    CREATE TABLE signers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL REFERENCES sign_requests(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,  -- hash of the signer's personal link (for lookups)
      token_enc TEXT,                   -- the same token, encrypted, so emails can repeat the link
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      status TEXT NOT NULL,             -- waiting | ready | viewed | signed | declined
      notified_at INTEGER,
      reminded_at INTEGER,
      viewed_at INTEGER,
      signed_at INTEGER,
      decline_reason TEXT
    );
    CREATE INDEX idx_signers_request ON signers(request_id, position);

    CREATE TABLE sign_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL REFERENCES sign_requests(id) ON DELETE CASCADE,
      signer_id INTEGER REFERENCES signers(id) ON DELETE CASCADE,
      event TEXT NOT NULL,              -- created | sent | viewed | signed | declined | reminded | completed | cancelled
      at INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      detail TEXT
    );
    CREATE INDEX idx_sign_events_request ON sign_events(request_id, at);
  `);
    // Single-signer requests made before this version become finished or
    // pending requests with one signer; their files stay where they are.
    const old = db.prepare("SELECT * FROM signature_requests").all() as {
      id: string; owner_id: number | null; file_name: string; signer_name: string; message: string;
      status: string; created_at: number; signed_at: number | null;
    }[];
    for (const r of old) {
      db.prepare(
        `INSERT INTO sign_requests (id, owner_id, manage_hash, file_name, sender_name, message, ordered, reminder_days,
           status, lang, document_hash, created_at, expires_at, completed_at)
         VALUES (?, ?, ?, ?, '', ?, 0, 0, ?, 'en', '', ?, ?, ?)`,
      ).run(r.id, r.owner_id, `legacy:${r.id}`, r.file_name, r.message, r.status === "signed" ? "completed" : "pending",
        r.created_at, r.created_at + 30 * 86_400_000, r.signed_at);
      db.prepare(
        "INSERT INTO signers (request_id, token_hash, position, name, status, signed_at) VALUES (?, ?, 0, ?, ?, ?)",
      ).run(r.id, `legacy:${r.id}`, r.signer_name, r.status === "signed" ? "signed" : "ready", r.signed_at);
    }
    db.exec("DROP TABLE signature_requests;");
  },
  // v3: visitor counts. Only daily totals are kept, never a row per visit, so
  // there is nothing in here that can be traced back to a person.
  (db) => {
    db.exec(`
      CREATE TABLE page_stats (
        day TEXT NOT NULL,                -- YYYY-MM-DD (UTC)
        path TEXT NOT NULL,               -- a known route only, e.g. "/merge-pdf"
        lang TEXT NOT NULL,
        device TEXT NOT NULL,             -- mobile | tablet | desktop
        referrer TEXT NOT NULL,           -- host only, "" when the visitor came directly
        views INTEGER NOT NULL DEFAULT 0,
        visits INTEGER NOT NULL DEFAULT 0, -- first page of a browser session
        PRIMARY KEY (day, path, lang, device, referrer)
      ) WITHOUT ROWID;
      CREATE INDEX idx_page_stats_day ON page_stats(day);
    `);
  },
  // v4: the developer API was removed. Its keys, webhooks and task records go;
  // task_stats keeps its source column (only "web" is written now).
  (db) => {
    db.exec(`
      DROP TABLE IF EXISTS api_tasks;
      DROP TABLE IF EXISTS webhooks;
      DROP TABLE IF EXISTS api_keys;
      DELETE FROM task_stats WHERE source = 'api';
    `);
  },
];

function open() {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "workify.db"));
  // Wait for locks before anything else: `next build` opens the database from
  // several workers at once, and switching to WAL needs a lock too.
  db.exec("PRAGMA busy_timeout = 15000;");
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
  // Each step takes the write lock first, then reads the version, so two
  // processes starting together never run the same migration twice.
  for (;;) {
    db.exec("BEGIN IMMEDIATE");
    try {
      let version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
      // Databases created before migrations existed already have schema 1.
      if (version === 0 && db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'users'").get()) version = 1;
      if (version >= MIGRATIONS.length) {
        db.exec("COMMIT");
        return db;
      }
      MIGRATIONS[version](db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
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
  /** Runs `fn` in one transaction. */
  transaction<T>(fn: () => T): T {
    conn.exec("BEGIN");
    try {
      const result = fn();
      conn.exec("COMMIT");
      return result;
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  },
  /** Consistent copy of the whole database (used by backups). */
  backupTo(file: string) {
    conn.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  },
};
