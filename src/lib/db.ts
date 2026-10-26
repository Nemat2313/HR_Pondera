import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Using Node 22 built-in sqlite DatabaseSync
let dbInstance: any = null;

const DEFAULT_ADMIN_SCRYPT_HASH =
  'scrypt$5f0c1797ae937ffa6cf761787321859e$787cfeb5fdb0e92a1998e7368e4608fe317db38e36f60182f5ffe41e2ea0f2e89fcae63e40337ce4b17ae750190e99a588fb7d18dfea147c62e97d65311e5b34';

const INITIAL_ADMIN_HASH =
  (process.env.ADMIN_PASSWORD_HASH || '').trim() || DEFAULT_ADMIN_SCRYPT_HASH;

function hashPlainIfNeeded(pw: string): string {
  if (!pw || pw.startsWith('scrypt$')) return pw;
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function ensureUsersTable(db: any) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        scope_type TEXT NOT NULL DEFAULT 'all',
        scope_value TEXT NOT NULL DEFAULT 'all',
        created_at TEXT
      );
    `);

    // Remove legacy demo accounts
    db.exec(`
      DELETE FROM users WHERE email IN (
        'kazan@pondera.com',
        'svobodny@pondera.com',
        'ustluga@pondera.com',
        'dgp02@pondera.com'
      );
    `);

    const upsertAdmin = db.prepare(`
      INSERT INTO users (id, name, email, password, role, scope_type, scope_value, created_at)
      VALUES (1, 'Sistem Yöneticisi (Admin)', 'admin@pondera.com', ?, 'admin', 'all', 'all', '2026-10-08 19:00:00')
      ON CONFLICT(email) DO UPDATE SET
        password = CASE WHEN users.password IS NULL OR users.password = '' OR users.password NOT LIKE 'scrypt$%' THEN excluded.password ELSE users.password END,
        role = 'admin',
        scope_type = 'all',
        scope_value = 'all'
    `);
    upsertAdmin.run(INITIAL_ADMIN_HASH);

    // Automatically upgrade any existing plaintext user passwords in SQLite to salted scrypt hashes
    const allUsers = db.prepare('SELECT id, password FROM users').all() as Array<{ id: number; password: string }>;
    const updPw = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    for (const u of allUsers) {
      if (u.password && !String(u.password).startsWith('scrypt$')) {
        updPw.run(hashPlainIfNeeded(String(u.password)), u.id);
      }
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS gosuslugi_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sicil_no TEXT NOT NULL,
        worker_name TEXT,
        citizenship TEXT,
        notification_type TEXT NOT NULL DEFAULT 'vks_salary',
        period_code TEXT DEFAULT '',
        application_no TEXT NOT NULL,
        gosuslugi_status TEXT NOT NULL DEFAULT 'Отправлено',
        status_detail TEXT DEFAULT '',
        pdf_filename TEXT DEFAULT '',
        submitted_at TEXT NOT NULL,
        checked_at TEXT DEFAULT '',
        UNIQUE(sicil_no, notification_type, period_code)
      );

      CREATE TABLE IF NOT EXISTS gosuslugi_mail_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        imap_host TEXT NOT NULL DEFAULT 'imap.mail.ru',
        imap_port INTEGER NOT NULL DEFAULT 993,
        email TEXT NOT NULL DEFAULT '',
        app_password TEXT NOT NULL DEFAULT '',
        auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
        last_sync_at TEXT DEFAULT '',
        last_sync_result TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS gosuslugi_mail_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_no TEXT NOT NULL,
        service_title TEXT DEFAULT '',
        gosuslugi_status TEXT NOT NULL,
        status_detail TEXT DEFAULT '',
        email_date TEXT DEFAULT '',
        order_url TEXT DEFAULT '',
        folder_name TEXT DEFAULT '',
        synced_at TEXT NOT NULL,
        UNIQUE(application_no, gosuslugi_status, email_date)
      );

      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -16000;

      CREATE INDEX IF NOT EXISTS idx_personnel_sicil ON personnel(sicil_no);
      CREATE INDEX IF NOT EXISTS idx_personnel_durum ON personnel(genel_durum);
      CREATE INDEX IF NOT EXISTS idx_personnel_region ON personnel(region);
      CREATE INDEX IF NOT EXISTS idx_personnel_proje ON personnel(proje_adi);
      CREATE INDEX IF NOT EXISTS idx_personnel_dept ON personnel(departman);
      CREATE INDEX IF NOT EXISTS idx_personnel_uyruk ON personnel(uyruk);
      CREATE INDEX IF NOT EXISTS idx_personnel_sira ON personnel(sira_no);
      CREATE INDEX IF NOT EXISTS idx_gos_subs_sicil ON gosuslugi_submissions(sicil_no);
      CREATE INDEX IF NOT EXISTS idx_gos_subs_type ON gosuslugi_submissions(notification_type);
      CREATE INDEX IF NOT EXISTS idx_gos_subs_appno ON gosuslugi_submissions(application_no);
      CREATE INDEX IF NOT EXISTS idx_gos_subs_subat ON gosuslugi_submissions(submitted_at);
    `);
  } catch {
    // Ignore if database is opened in read-only filesystem
  }
}

export function getDb() {
  if (!dbInstance) {
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    const dbGzPath = path.join(process.cwd(), 'pondera_hr.db.gz');

    // Auto-extract compressed database if raw .db is missing
    if (!fs.existsSync(dbPath) && fs.existsSync(dbGzPath)) {
      const zlib = require('zlib');
      const compressedData = fs.readFileSync(dbGzPath);
      const decompressedData = zlib.gunzipSync(compressedData);
      fs.writeFileSync(dbPath, decompressedData);
    }

    // Dynamically require to avoid client-side bundling issues
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(dbPath);
    ensureUsersTable(dbInstance);
  }
  return dbInstance;
}

export function resetDb() {
  if (dbInstance) {
    try {
      dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {}
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
}

