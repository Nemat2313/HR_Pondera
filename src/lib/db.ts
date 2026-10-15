import path from 'path';
import fs from 'fs';

// Using Node 22 built-in sqlite DatabaseSync
let dbInstance: any = null;

function ensureUsersTable(db: any) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        scope_type TEXT NOT NULL DEFAULT 'all',
        scope_value TEXT NOT NULL DEFAULT 'all',
        created_at TEXT
      );
    `);

    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any;
    if (!countRow || Number(countRow.cnt) === 0) {
      const insert = db.prepare(`
        INSERT OR IGNORE INTO users (id, name, email, password, role, scope_type, scope_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = '2026-10-08 19:00:00';
      insert.run(1, 'Sistem Yöneticisi (Admin)', 'admin@pondera.com', 'admin123', 'admin', 'all', 'all', now);
      insert.run(2, 'Kazan Şantiye Yönetimi', 'kazan@pondera.com', 'kazan123', 'viewer', 'region', 'Kazan', now);
      insert.run(3, 'Svobodny Şantiye Yönetimi', 'svobodny@pondera.com', 'svobodny123', 'viewer', 'region', 'Svobodny-AGHK', now);
      insert.run(4, 'Ust Luga Şantiye Yönetimi', 'ustluga@pondera.com', 'ustluga123', 'viewer', 'region', 'Ust Luga', now);
      insert.run(5, 'DGP-02 Proje Yönetimi', 'dgp02@pondera.com', 'dgp123', 'viewer', 'project', 'TOBOLSK DGP-2 PROJESİ', now);
    }
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
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
}

