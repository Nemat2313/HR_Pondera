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
  inn_applied_by: string;
  inn_applied_at: string;
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
      inn_applied_by TEXT DEFAULT '',
      inn_applied_at TEXT DEFAULT '',
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

  // Safe schema evolution for existing production DBs
  try {
    db.exec("ALTER TABLE inn_snils_verifications ADD COLUMN inn_applied_by TEXT DEFAULT ''");
  } catch {}
  try {
    db.exec("ALTER TABLE inn_snils_verifications ADD COLUMN inn_applied_at TEXT DEFAULT ''");
  } catch {}

  // Auto-heal rows that had a valid FNS application number (e.g. 6358237) but were accidentally
  // downgraded back to NOT_FOUND during a direct INN re-check before FNS issued the INN
  try {
    db.exec(`
      UPDATE inn_snils_verifications
      SET inn_status = 'APPLIED_STEP2', inn_error = ''
      WHERE inn_status IN ('NOT_FOUND', 'PENDING', 'ERROR')
        AND COALESCE(TRIM(inn_application_no), '') != ''
        AND COALESCE(TRIM(verified_inn), '') = ''
    `);
  } catch {}

  // Backfill inn_applied_at from updated_at for existing applied records missing an application timestamp
  try {
    db.exec(`
      UPDATE inn_snils_verifications
      SET inn_applied_at = updated_at
      WHERE inn_status IN ('APPLIED_STEP1', 'APPLIED_STEP2')
        AND COALESCE(TRIM(inn_applied_at), '') = ''
        AND COALESCE(TRIM(updated_at), '') != ''
    `);
  } catch {}
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
  const buf = Buffer.from(cleanB64, 'base64');
  const isJpeg = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
  const ext = isJpeg ? 'jpg' : 'png';
  const filename = `${safeSicil}_${kind}_${stamp}.${ext}`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, buf);
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
    const initialStatus = input.inn_status || 'PENDING';
    const isAppliedInit = initialStatus === 'APPLIED_STEP1' || initialStatus === 'APPLIED_STEP2';
    db.prepare(
      `INSERT INTO inn_snils_verifications (
        sicil_no, ad_soyad, tam_adi_kiril,
        inn_status, verified_inn, inn_verified_at, inn_screenshot, inn_application_no, inn_application_code,
        inn_applied_by, inn_applied_at, inn_error,
        snils_status, verified_snils, snils_verified_at, snils_screenshot, snils_error,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sicil,
      input.ad_soyad || '',
      input.tam_adi_kiril || '',
      initialStatus,
      input.verified_inn || '',
      input.inn_verified_at || '',
      input.inn_screenshot || '',
      input.inn_application_no || '',
      input.inn_application_code || '',
      input.inn_applied_by || '',
      isAppliedInit ? input.inn_applied_at || nowStr : input.inn_applied_at || '',
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

  // Protect APPLIED_STEP1 / APPLIED_STEP2 / VERIFIED from being downgraded to NOT_FOUND / PENDING / ERROR
  // when checking whether the INN has been issued yet.
  const prevStatus = existing.inn_status;
  let effectiveInnStatus = input.inn_status || '';
  let effectiveInnError = input.inn_error !== undefined ? input.inn_error : existing.inn_error || '';
  let effectiveScreenshot = input.inn_screenshot || '';

  const isPrevApplied = prevStatus === 'APPLIED_STEP1' || prevStatus === 'APPLIED_STEP2';
  const isIncomingDowngrade =
    effectiveInnStatus === 'NOT_FOUND' || effectiveInnStatus === 'PENDING' || effectiveInnStatus === 'ERROR';

  if (prevStatus === 'VERIFIED' && isIncomingDowngrade) {
    effectiveInnStatus = 'VERIFIED';
    effectiveInnError = '';
    effectiveScreenshot = '';
  } else if (isPrevApplied && isIncomingDowngrade) {
    // Keep APPLIED_STEP1 / APPLIED_STEP2 intact so the worker stays in "INN Bekleniyor" state
    effectiveInnStatus = prevStatus;
    effectiveInnError = '';
    effectiveScreenshot = '';
  } else if (prevStatus === 'APPLIED_STEP2' && effectiveInnStatus === 'APPLIED_STEP1') {
    effectiveInnStatus = 'APPLIED_STEP2';
  }

  const nextStatusFinal = effectiveInnStatus || prevStatus;
  const isNowApplied = nextStatusFinal === 'APPLIED_STEP1' || nextStatusFinal === 'APPLIED_STEP2';
  const effectiveAppliedAt =
    existing.inn_applied_at ||
    input.inn_applied_at ||
    (isNowApplied ? nowStr : '');
  const effectiveAppliedBy =
    input.inn_applied_by ||
    existing.inn_applied_by ||
    '';

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
      inn_applied_by = COALESCE(NULLIF(?, ''), inn_applied_by),
      inn_applied_at = COALESCE(NULLIF(?, ''), inn_applied_at),
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
    effectiveInnStatus,
    input.verified_inn || '',
    input.inn_verified_at || '',
    effectiveScreenshot,
    input.inn_application_no || '',
    input.inn_application_code || '',
    effectiveAppliedBy,
    effectiveAppliedAt,
    effectiveInnError,
    input.snils_status || '',
    input.verified_snils || '',
    input.snils_verified_at || '',
    input.snils_screenshot || '',
    input.snils_error !== undefined ? input.snils_error : existing.snils_error || '',
    nowStr,
    sicil
  );
}
