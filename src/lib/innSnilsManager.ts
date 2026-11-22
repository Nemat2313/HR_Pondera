import fs from 'fs';
import path from 'path';
import type { getDb } from '@/lib/db';

type DbLike = ReturnType<typeof getDb>;

export interface InnSnilsVerificationRecord {
  id?: number;
  sicil_no: string;
  ad_soyad: string;
  tam_adi_kiril: string;
  inn_status: 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'APPLIED_STEP1' | 'APPLIED_STEP2' | 'ERROR';
  verified_inn: string;
  inn_verified_at: string;
  inn_screenshot: string;
  inn_application_no: string;
  inn_application_code: string;
  inn_error: string;
  snils_status: 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'ERROR';
  verified_snils: string;
  snils_verified_at: string;
  snils_screenshot: string;
  snils_error: string;
  updated_at: string;
}

export function getInnSnilsScreenshotDir(): string {
  const dir = path.join(process.cwd(), 'uploads', 'inn_snils_screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function ensureInnSnilsTable(db: DbLike): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inn_snils_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sicil_no TEXT NOT NULL UNIQUE,
      ad_soyad TEXT DEFAULT '',
      tam_adi_kiril TEXT DEFAULT '',
      inn_status TEXT DEFAULT 'PENDING',
      verified_inn TEXT DEFAULT '',
      inn_verified_at TEXT DEFAULT '',
      inn_screenshot TEXT DEFAULT '',
      inn_application_no TEXT DEFAULT '',
      inn_application_code TEXT DEFAULT '',
      inn_error TEXT DEFAULT '',
      snils_status TEXT DEFAULT 'PENDING',
      verified_snils TEXT DEFAULT '',
      snils_verified_at TEXT DEFAULT '',
      snils_screenshot TEXT DEFAULT '',
      snils_error TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_inn_snils_sicil ON inn_snils_verifications(sicil_no);
  `);
}

export function saveInnSnilsScreenshotBase64(
  sicilNo: string,
  kind: 'inn' | 'snils' | 'zayavka1' | 'zayavka2',
  base64Data: string
): string {
  const cleanB64 = String(base64Data || '')
    .replace(/^data:image\/[a-z]+;base64,/i, '')
    .trim();
  if (!cleanB64) return '';
  const dir = getInnSnilsScreenshotDir();
  const safeSicil = String(sicilNo || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const filename = `${safeSicil}_${kind}_${stamp}.png`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, Buffer.from(cleanB64, 'base64'));
  return filename;
}

export function upsertInnSnilsVerification(
  db: DbLike,
  input: Partial<InnSnilsVerificationRecord> & { sicil_no: string }
): void {
  ensureInnSnilsTable(db);
  const sicil = String(input.sicil_no || '').trim();
  if (!sicil) return;

  const existing = db
    .prepare('SELECT * FROM inn_snils_verifications WHERE sicil_no = ?')
    .get(sicil) as InnSnilsVerificationRecord | undefined;

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (!existing) {
    db.prepare(
      `INSERT INTO inn_snils_verifications (
        sicil_no, ad_soyad, tam_adi_kiril,
        inn_status, verified_inn, inn_verified_at, inn_screenshot, inn_application_no, inn_application_code, inn_error,
        snils_status, verified_snils, snils_verified_at, snils_screenshot, snils_error,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sicil,
      input.ad_soyad || '',
      input.tam_adi_kiril || '',
      input.inn_status || 'PENDING',
      input.verified_inn || '',
      input.inn_verified_at || '',
      input.inn_screenshot || '',
      input.inn_application_no || '',
      input.inn_application_code || '',
      input.inn_error || '',
      input.snils_status || 'PENDING',
      input.verified_snils || '',
      input.snils_verified_at || '',
      input.snils_screenshot || '',
      input.snils_error || '',
      nowStr
    );
    return;
  }

  db.prepare(
    `UPDATE inn_snils_verifications SET
      ad_soyad = COALESCE(NULLIF(?, ''), ad_soyad),
      tam_adi_kiril = COALESCE(NULLIF(?, ''), tam_adi_kiril),
      inn_status = COALESCE(NULLIF(?, ''), inn_status),
      verified_inn = COALESCE(NULLIF(?, ''), verified_inn),
      inn_verified_at = COALESCE(NULLIF(?, ''), inn_verified_at),
      inn_screenshot = COALESCE(NULLIF(?, ''), inn_screenshot),
      inn_application_no = COALESCE(NULLIF(?, ''), inn_application_no),
      inn_application_code = COALESCE(NULLIF(?, ''), inn_application_code),
      inn_error = ?,
      snils_status = COALESCE(NULLIF(?, ''), snils_status),
      verified_snils = COALESCE(NULLIF(?, ''), verified_snils),
      snils_verified_at = COALESCE(NULLIF(?, ''), snils_verified_at),
      snils_screenshot = COALESCE(NULLIF(?, ''), snils_screenshot),
      snils_error = ?,
      updated_at = ?
    WHERE sicil_no = ?`
  ).run(
    input.ad_soyad || '',
    input.tam_adi_kiril || '',
    input.inn_status || '',
    input.verified_inn || '',
    input.inn_verified_at || '',
    input.inn_screenshot || '',
    input.inn_application_no || '',
    input.inn_application_code || '',
    input.inn_error !== undefined ? input.inn_error : existing.inn_error || '',
    input.snils_status || '',
    input.verified_snils || '',
    input.snils_verified_at || '',
    input.snils_screenshot || '',
    input.snils_error !== undefined ? input.snils_error : existing.snils_error || '',
    nowStr,
    sicil
  );
}
