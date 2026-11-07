import { createPreActionBackup } from '@/lib/backup';
import { invalidateGosuslugiAnalyticsCache } from '@/lib/gosuslugiPdfCache';

export interface QuarterPeriodInfo {
  quarterCode: string;
  year: number;
  quarter: number;
  quarterLabelTr: string;
  quarterLabelRu: string;
  shortLabelTr: string;
  shortLabelRu: string;
  periodStart: string;
  periodEnd: string;
  periodEndIso: string;
  nextQuarterCode: string;
}

export interface QuarterArchiveRecord {
  quarter_code: string;
  quarter_label: string;
  period_start: string;
  period_end: string;
  master_count: number;
  sent_count: number;
  completed_count: number;
  refused_count: number;
  error_count: number;
  archived_at: string;
  archived_by: string;
}

export interface VksQuarterItem {
  quarter_code: string;
  year: number;
  quarter: number;
  quarter_label: string;
  quarter_label_ru: string;
  short_label_tr: string;
  short_label_ru: string;
  period_start: string;
  period_end: string;
  period_end_iso: string;
  has_ended: boolean;
  is_active: boolean;
  is_archived: boolean;
  status: 'active' | 'archived' | 'planned';
  master_count: number;
  sent_count: number;
  completed_count: number;
  refused_count: number;
  error_count: number;
}

export interface VksQuarterOverview {
  activeQuarter: string;
  defaultQuarter: string;
  defaultLabelTr: string;
  defaultLabelRu: string;
  activeLabelTr: string;
  activeLabelRu: string;
  shortLabelTr: string;
  shortLabelRu: string;
  periodStart: string;
  periodEnd: string;
  nextQuarterCode: string;
  suggestedNextQuarterCode: string;
  notifications15MinEnabled: boolean;
  activeMasterCount: number;
  activeSentCount: number;
  todayMoscowIso: string;
  archives: QuarterArchiveRecord[];
  quarters: VksQuarterItem[];
}

export function periodEndRuToIso(periodEnd: string, fallbackYear = 2026, fallbackQuarter = 4): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(periodEnd || '').trim());
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const defaultEnds: Record<number, string> = {
    1: `${fallbackYear}-03-31`,
    2: `${fallbackYear}-06-30`,
    3: `${fallbackYear}-09-30`,
    4: `${fallbackYear}-12-31`,
  };
  return defaultEnds[fallbackQuarter] || `${fallbackYear}-12-31`;
}

export function getTodayMoscowIso(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const yr = parts.find((p) => p.type === 'year')?.value;
    const mo = parts.find((p) => p.type === 'month')?.value;
    const da = parts.find((p) => p.type === 'day')?.value;
    if (yr && mo && da) {
      return `${yr}-${mo}-${da}`;
    }
  } catch {}
  const msk = new Date(now.getTime() + 3 * 3600 * 1000);
  return msk.toISOString().slice(0, 10);
}

export function parseQuarterCodeInfo(rawCode?: string | null): QuarterPeriodInfo {
  const cleaned = String(rawCode || '2026-4').trim();
  const match = /^(\d{4})[-_Q]+([1-4])$/i.exec(cleaned) || /^(\d{4})-([1-4])$/.exec(cleaned);
  const year = match ? Number(match[1]) : 2026;
  const quarter = match ? Number(match[2]) : 4;

  const ranges: Record<number, { start: string; end: string; endIso: string }> = {
    1: { start: `01.01.${year}`, end: `31.03.${year}`, endIso: `${year}-03-31` },
    2: { start: `01.04.${year}`, end: `30.06.${year}`, endIso: `${year}-06-30` },
    3: { start: `01.07.${year}`, end: `30.09.${year}`, endIso: `${year}-09-30` },
    4: { start: `01.10.${year}`, end: `31.12.${year}`, endIso: `${year}-12-31` },
  };

  const range = ranges[quarter] || ranges[4];
  const nextYear = quarter === 4 ? year + 1 : year;
  const nextQ = quarter === 4 ? 1 : quarter + 1;
  const quarterCode = `${year}-${quarter}`;

  return {
    quarterCode,
    year,
    quarter,
    quarterLabelTr: `${year} ${quarter}. Çeyrek (${range.start} – ${range.end})`,
    quarterLabelRu: `${quarter} Квартал ${year} (${range.start} – ${range.end})`,
    shortLabelTr: `${year} ${quarter}. Çeyrek`,
    shortLabelRu: `${quarter} Кв. ${year}`,
    periodStart: range.start,
    periodEnd: range.end,
    periodEndIso: range.endIso,
    nextQuarterCode: `${nextYear}-${nextQ}`,
  };
}

function ensureSystemInfo(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_info (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function getSysVal(db: any, key: string): string | null {
  ensureSystemInfo(db);
  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
}

function setSysVal(db: any, key: string, value: string) {
  ensureSystemInfo(db);
  db.prepare(`
    INSERT INTO system_info (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function ensureBaseAndArchiveTables(db: any) {
  ensureSystemInfo(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS gosuslugi_vks_master_list (
      row_key TEXT PRIMARY KEY,
      sicil_no TEXT NOT NULL,
      row_order INTEGER NOT NULL DEFAULT 0,
      assigned_computer INTEGER NOT NULL DEFAULT 1,
      worker_json TEXT NOT NULL,
      source_tag TEXT DEFAULT 'master_excel',
      updated_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sicil_no TEXT NOT NULL,
      worker_name TEXT,
      citizenship TEXT,
      notification_type TEXT NOT NULL DEFAULT 'vks_salary',
      period_code TEXT DEFAULT '',
      application_no TEXT NOT NULL DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT 'Отправлено',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      status_pdf_filename TEXT DEFAULT '',
      submitted_at TEXT NOT NULL,
      checked_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      UNIQUE(sicil_no, notification_type, period_code)
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_refused_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sicil_no TEXT NOT NULL,
      worker_name TEXT,
      citizenship TEXT,
      notification_type TEXT NOT NULL DEFAULT 'vks_salary',
      period_code TEXT DEFAULT '',
      application_no TEXT NOT NULL DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT 'Услуга отказана',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      submitted_at TEXT DEFAULT '',
      archived_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_submission_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sicil_no TEXT NOT NULL,
      worker_name TEXT DEFAULT '',
      application_no TEXT DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT '',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      submitted_at TEXT DEFAULT '',
      event_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_quarters (
      quarter_code TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      quarter_label_tr TEXT NOT NULL,
      quarter_label_ru TEXT NOT NULL,
      short_label_tr TEXT NOT NULL,
      short_label_ru TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      period_end_iso TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT DEFAULT 'system'
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_quarter_archives (
      quarter_code TEXT PRIMARY KEY,
      quarter_label TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      master_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      refused_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT NOT NULL,
      archived_by TEXT DEFAULT 'system'
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_vks_master_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_quarter TEXT NOT NULL,
      row_key TEXT NOT NULL,
      sicil_no TEXT NOT NULL,
      row_order INTEGER NOT NULL DEFAULT 0,
      assigned_computer INTEGER NOT NULL DEFAULT 1,
      worker_json TEXT NOT NULL,
      source_tag TEXT DEFAULT 'master_excel',
      updated_at TEXT DEFAULT '',
      UNIQUE(archive_quarter, row_key)
    );
    CREATE INDEX IF NOT EXISTS idx_vks_master_arch_q ON gosuslugi_vks_master_archive(archive_quarter, row_order);
    CREATE INDEX IF NOT EXISTS idx_vks_master_arch_sicil ON gosuslugi_vks_master_archive(archive_quarter, sicil_no);

    CREATE TABLE IF NOT EXISTS gosuslugi_submissions_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_quarter TEXT NOT NULL,
      sicil_no TEXT NOT NULL,
      worker_name TEXT DEFAULT '',
      citizenship TEXT DEFAULT '',
      notification_type TEXT NOT NULL DEFAULT 'vks_salary',
      period_code TEXT DEFAULT '',
      application_no TEXT NOT NULL DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT 'Отправлено',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      status_pdf_filename TEXT DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT '',
      checked_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_gos_sub_arch_q ON gosuslugi_submissions_archive(archive_quarter);
    CREATE INDEX IF NOT EXISTS idx_gos_sub_arch_sicil ON gosuslugi_submissions_archive(archive_quarter, sicil_no);
    CREATE INDEX IF NOT EXISTS idx_gos_sub_arch_appno ON gosuslugi_submissions_archive(application_no);

    CREATE TABLE IF NOT EXISTS gosuslugi_refused_quarter_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_quarter TEXT NOT NULL,
      sicil_no TEXT NOT NULL,
      worker_name TEXT DEFAULT '',
      citizenship TEXT DEFAULT '',
      notification_type TEXT NOT NULL DEFAULT 'vks_salary',
      period_code TEXT DEFAULT '',
      application_no TEXT NOT NULL DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT 'Услуга отказана',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      submitted_at TEXT DEFAULT '',
      archived_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_ref_q_arch ON gosuslugi_refused_quarter_archive(archive_quarter, sicil_no);

    CREATE TABLE IF NOT EXISTS gosuslugi_history_quarter_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_quarter TEXT NOT NULL,
      sicil_no TEXT NOT NULL,
      worker_name TEXT DEFAULT '',
      application_no TEXT DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT '',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      submitted_at TEXT DEFAULT '',
      event_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_hist_q_arch ON gosuslugi_history_quarter_archive(archive_quarter, sicil_no);
  `);

  try {
    db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN updated_at TEXT DEFAULT '';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN status_pdf_filename TEXT DEFAULT '';`);
  } catch {}
}

function upsertQuarterCatalogRow(
  db: any,
  quarterCode: string,
  customPeriodStart?: string,
  customPeriodEnd?: string,
  actor = 'system'
) {
  const info = parseQuarterCodeInfo(quarterCode);
  const pStart = (customPeriodStart || info.periodStart).trim();
  const pEnd = (customPeriodEnd || info.periodEnd).trim();
  const pEndIso = periodEndRuToIso(pEnd, info.year, info.quarter);
  const labelTr = `${info.year} ${info.quarter}. Çeyrek (${pStart} – ${pEnd})`;
  const labelRu = `${info.quarter} Квартал ${info.year} (${pStart} – ${pEnd})`;
  const nowMsk = new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  db.prepare(`
    INSERT INTO gosuslugi_quarters (
      quarter_code, year, quarter, quarter_label_tr, quarter_label_ru,
      short_label_tr, short_label_ru, period_start, period_end, period_end_iso,
      created_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(quarter_code) DO UPDATE SET
      quarter_label_tr = excluded.quarter_label_tr,
      quarter_label_ru = excluded.quarter_label_ru,
      short_label_tr = excluded.short_label_tr,
      short_label_ru = excluded.short_label_ru,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      period_end_iso = excluded.period_end_iso
  `).run(
    info.quarterCode,
    info.year,
    info.quarter,
    labelTr,
    labelRu,
    info.shortLabelTr,
    info.shortLabelRu,
    pStart,
    pEnd,
    pEndIso,
    nowMsk,
    actor
  );
}

function summarizeSubmissionsForArchive(rows: Array<{
  sicil_no: string;
  application_no: string;
  gosuslugi_status: string;
  pdf_filename?: string;
  status_pdf_filename?: string;
}>) {
  const seen = new Set<string>();
  let sent = 0;
  let completed = 0;
  let refused = 0;
  let errors = 0;

  for (const r of rows) {
    const s = String(r.sicil_no || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);

    const appNo = String(r.application_no || '').trim();
    const st = String(r.gosuslugi_status || '').trim();
    if (
      !appNo &&
      /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(
        st
      )
    ) {
      continue;
    }
    const isErr = /^ошибк/i.test(st);
    const isMvdNotFound = !isErr && !appNo && /не найден[ыо]?\s+в\s+базе\s+мвд/i.test(st);
    if (isErr || isMvdNotFound) {
      errors++;
      continue;
    }
    const isSent =
      Boolean(appNo) ||
      Boolean(r.pdf_filename) ||
      Boolean(r.status_pdf_filename) ||
      /отправлен|зарегистрирован|оказан|исполнен|отказан|принят|промежуточн|обработк|PDF не скачан/i.test(st);
    if (isSent) {
      sent++;
      if (/оказан|исполнен/i.test(st)) completed++;
      else if (/отказан/i.test(st)) refused++;
    }
  }

  return { sent, completed, refused, errors };
}

function performQuarterArchiveTx(
  db: any,
  fromQuarterCode: string,
  toQuarterCode: string,
  actor: string
): QuarterArchiveRecord {
  const fromInfo = parseQuarterCodeInfo(fromQuarterCode);
  const toInfo = parseQuarterCodeInfo(toQuarterCode);
  const nowMsk = new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  const existingTargetRow = db
    .prepare('SELECT period_start, period_end FROM gosuslugi_quarters WHERE quarter_code = ?')
    .get(toInfo.quarterCode) as { period_start?: string; period_end?: string } | undefined;
  const targetStart = existingTargetRow?.period_start || toInfo.periodStart;
  const targetEnd = existingTargetRow?.period_end || toInfo.periodEnd;

  const masterRows = db
    .prepare(
      `SELECT row_key, sicil_no, row_order, assigned_computer, worker_json, source_tag, updated_at
       FROM gosuslugi_vks_master_list
       ORDER BY row_order ASC, row_key ASC`
    )
    .all() as Array<{
    row_key: string;
    sicil_no: string;
    row_order: number;
    assigned_computer: number;
    worker_json: string;
    source_tag: string;
    updated_at: string;
  }>;

  const subRows = db
    .prepare(
      `SELECT sicil_no, worker_name, citizenship, notification_type, period_code,
              application_no, gosuslugi_status, status_detail, pdf_filename, status_pdf_filename,
              submitted_at, checked_at, updated_at
       FROM gosuslugi_submissions
       WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'
       ORDER BY
         CASE WHEN gosuslugi_status LIKE '%оказана%' THEN 0 WHEN application_no != '' THEN 1 ELSE 2 END ASC,
         submitted_at DESC,
         id DESC`
    )
    .all() as Array<{
    sicil_no: string;
    worker_name: string;
    citizenship: string;
    notification_type: string;
    period_code: string;
    application_no: string;
    gosuslugi_status: string;
    status_detail: string;
    pdf_filename: string;
    status_pdf_filename: string;
    submitted_at: string;
    checked_at: string;
    updated_at: string;
  }>;

  const stats = summarizeSubmissionsForArchive(subRows);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`DELETE FROM gosuslugi_vks_master_archive WHERE archive_quarter = ?`).run(fromInfo.quarterCode);
    const insMaster = db.prepare(`
      INSERT INTO gosuslugi_vks_master_archive (
        archive_quarter, row_key, sicil_no, row_order, assigned_computer, worker_json, source_tag, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of masterRows) {
      insMaster.run(
        fromInfo.quarterCode,
        m.row_key,
        m.sicil_no,
        m.row_order,
        m.assigned_computer,
        m.worker_json,
        m.source_tag || 'master_excel',
        m.updated_at || ''
      );
    }

    db.prepare(`DELETE FROM gosuslugi_submissions_archive WHERE archive_quarter = ?`).run(fromInfo.quarterCode);
    const insSub = db.prepare(`
      INSERT INTO gosuslugi_submissions_archive (
        archive_quarter, sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, status_pdf_filename,
        submitted_at, checked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of subRows) {
      insSub.run(
        fromInfo.quarterCode,
        s.sicil_no,
        s.worker_name || '',
        s.citizenship || '',
        s.notification_type || 'vks_salary',
        s.period_code || fromInfo.quarterCode,
        s.application_no || '',
        s.gosuslugi_status || 'Отправлено',
        s.status_detail || '',
        s.pdf_filename || '',
        s.status_pdf_filename || '',
        s.submitted_at || '',
        s.checked_at || '',
        s.updated_at || ''
      );
    }

    db.prepare(`DELETE FROM gosuslugi_refused_quarter_archive WHERE archive_quarter = ?`).run(fromInfo.quarterCode);
    db.prepare(`
      INSERT INTO gosuslugi_refused_quarter_archive (
        archive_quarter, sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
      )
      SELECT ?, sicil_no, COALESCE(worker_name, ''), COALESCE(citizenship, ''),
             COALESCE(notification_type, 'vks_salary'), COALESCE(NULLIF(period_code, ''), ?),
             COALESCE(application_no, ''), COALESCE(gosuslugi_status, 'Услуга отказана'),
             COALESCE(status_detail, ''), COALESCE(pdf_filename, ''),
             COALESCE(submitted_at, ''), COALESCE(archived_at, '')
      FROM gosuslugi_refused_archive
      WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'
    `).run(fromInfo.quarterCode, fromInfo.quarterCode);

    db.prepare(`DELETE FROM gosuslugi_history_quarter_archive WHERE archive_quarter = ?`).run(fromInfo.quarterCode);
    db.prepare(`
      INSERT INTO gosuslugi_history_quarter_archive (
        archive_quarter, sicil_no, worker_name, application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, event_at
      )
      SELECT ?, sicil_no, COALESCE(worker_name, ''), COALESCE(application_no, ''),
             COALESCE(gosuslugi_status, ''), COALESCE(status_detail, ''),
             COALESCE(pdf_filename, ''), COALESCE(submitted_at, ''), COALESCE(event_at, '')
      FROM gosuslugi_submission_history
    `).run(fromInfo.quarterCode);

    db.prepare(`
      INSERT INTO gosuslugi_quarter_archives (
        quarter_code, quarter_label, period_start, period_end,
        master_count, sent_count, completed_count, refused_count, error_count,
        archived_at, archived_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(quarter_code) DO UPDATE SET
        quarter_label = excluded.quarter_label,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        master_count = excluded.master_count,
        sent_count = excluded.sent_count,
        completed_count = excluded.completed_count,
        refused_count = excluded.refused_count,
        error_count = excluded.error_count,
        archived_at = excluded.archived_at,
        archived_by = excluded.archived_by
    `).run(
      fromInfo.quarterCode,
      fromInfo.quarterLabelTr,
      fromInfo.periodStart,
      fromInfo.periodEnd,
      masterRows.length,
      stats.sent,
      stats.completed,
      stats.refused,
      stats.errors,
      nowMsk,
      actor
    );

    upsertQuarterCatalogRow(db, fromInfo.quarterCode, fromInfo.periodStart, fromInfo.periodEnd, actor);
    upsertQuarterCatalogRow(db, toInfo.quarterCode, targetStart, targetEnd, actor);

    // Clear active VKS salary tables so the new quarter starts with a clean slate
    db.prepare(`DELETE FROM gosuslugi_vks_master_list`).run();
    db.prepare(
      `DELETE FROM gosuslugi_submissions WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'`
    ).run();
    db.prepare(
      `DELETE FROM gosuslugi_refused_archive WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'`
    ).run();
    db.prepare(`DELETE FROM gosuslugi_submission_history`).run();

    // Clear any queued 15-min VKS outbox items and reset snapshot
    try {
      db.prepare(`UPDATE telegram_outbox SET delivered = 1 WHERE report_type = 'vks' AND delivered = 0`).run();
    } catch {}
    setSysVal(db, 'telegram_vks_last_snapshot', '');

    // Advance active quarter metadata & pause 15-min VKS notifications until next reporting window
    setSysVal(db, 'vks_active_quarter', toInfo.quarterCode);
    setSysVal(db, 'vks_active_period_start', targetStart);
    setSysVal(db, 'vks_active_period_end', targetEnd);
    setSysVal(db, 'vks_15min_notifications_enabled', '0');

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }

  invalidateGosuslugiAnalyticsCache();

  return {
    quarter_code: fromInfo.quarterCode,
    quarter_label: fromInfo.quarterLabelTr,
    period_start: fromInfo.periodStart,
    period_end: fromInfo.periodEnd,
    master_count: masterRows.length,
    sent_count: stats.sent,
    completed_count: stats.completed,
    refused_count: stats.refused,
    error_count: stats.errors,
    archived_at: nowMsk,
    archived_by: actor,
  };
}

function seedQuarterCatalogIfNeeded(db: any): void {
  const archives = db
    .prepare('SELECT quarter_code, period_start, period_end FROM gosuslugi_quarter_archives')
    .all() as Array<{ quarter_code: string; period_start: string; period_end: string }>;

  for (const arch of archives) {
    const existing = db
      .prepare('SELECT quarter_code FROM gosuslugi_quarters WHERE quarter_code = ?')
      .get(arch.quarter_code);
    if (!existing) {
      upsertQuarterCatalogRow(db, arch.quarter_code, arch.period_start, arch.period_end, 'seed');
    }
  }

  const rawActive = getSysVal(db, 'vks_active_quarter') || '2026-4';
  const activeInfo = parseQuarterCodeInfo(rawActive);
  const existingActive = db
    .prepare('SELECT quarter_code FROM gosuslugi_quarters WHERE quarter_code = ?')
    .get(activeInfo.quarterCode);
  if (!existingActive) {
    const pStart = getSysVal(db, 'vks_active_period_start') || activeInfo.periodStart;
    const pEnd = getSysVal(db, 'vks_active_period_end') || activeInfo.periodEnd;
    upsertQuarterCatalogRow(db, activeInfo.quarterCode, pStart, pEnd, 'seed');
  }

  const existingQ3 = db
    .prepare('SELECT quarter_code FROM gosuslugi_quarters WHERE quarter_code = ?')
    .get('2026-3');
  if (!existingQ3) {
    upsertQuarterCatalogRow(db, '2026-3', undefined, undefined, 'seed');
  }
}

/**
 * Ensures quarterly archive tables exist and performs the one-time automatic
 * 2026 Q3 ('2026-3') -> 2026 Q4 ('2026-4') archive + 15-min notification stop.
 */
export function ensureVksQuarterlyArchiveAndState(db: any): void {
  const gState = globalThis as unknown as { __ponderaVksQuarterEnsured?: boolean };
  ensureBaseAndArchiveTables(db);

  if (!gState.__ponderaVksQuarterEnsured) {
    const migrated = getSysVal(db, 'vks_q3_2026_archived_to_q4_v1');
    if (migrated !== '1') {
      const existingMasterCnt = (
        db.prepare('SELECT COUNT(*) AS cnt FROM gosuslugi_vks_master_list').get() as { cnt: number }
      ).cnt;
      const existingSubCnt = (
        db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM gosuslugi_submissions
             WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'`
          )
          .get() as { cnt: number }
      ).cnt;

      if (existingMasterCnt > 0 || existingSubCnt > 0) {
        try {
          createPreActionBackup(
            'vks_q3_2026_archive',
            `VKS 2026 3. Çeyrek Otomatik Arşivleme (${existingMasterCnt} Ana Liste / ${existingSubCnt} Başvuru)`,
            `Автоархивация ВКС 3 Кв. 2026 (${existingMasterCnt} записей)`
          );
        } catch {}
        performQuarterArchiveTx(db, '2026-3', '2026-4', 'auto_migration_v2.8.26');
      } else {
        const q4 = parseQuarterCodeInfo('2026-4');
        setSysVal(db, 'vks_active_quarter', q4.quarterCode);
        setSysVal(db, 'vks_active_period_start', q4.periodStart);
        setSysVal(db, 'vks_active_period_end', q4.periodEnd);
        setSysVal(db, 'vks_15min_notifications_enabled', '0');
        try {
          db.prepare(`UPDATE telegram_outbox SET delivered = 1 WHERE report_type = 'vks' AND delivered = 0`).run();
        } catch {}
      }

      setSysVal(db, 'vks_q3_2026_archived_to_q4_v1', '1');
    }

    seedQuarterCatalogIfNeeded(db);
    gState.__ponderaVksQuarterEnsured = true;
  } else {
    seedQuarterCatalogIfNeeded(db);
  }
}

export function isVks15MinNotificationEnabled(db: any): boolean {
  ensureVksQuarterlyArchiveAndState(db);
  return getSysVal(db, 'vks_15min_notifications_enabled') === '1';
}

export function setVks15MinNotificationEnabled(db: any, enabled: boolean): boolean {
  ensureVksQuarterlyArchiveAndState(db);
  setSysVal(db, 'vks_15min_notifications_enabled', enabled ? '1' : '0');
  if (!enabled) {
    try {
      db.prepare(`UPDATE telegram_outbox SET delivered = 1 WHERE report_type = 'vks' AND delivered = 0`).run();
    } catch {}
  }
  return enabled;
}

export function getVksQuarterOverview(db: any, nowOverride?: Date): VksQuarterOverview {
  ensureVksQuarterlyArchiveAndState(db);
  const todayMoscowIso = getTodayMoscowIso(nowOverride);
  const rawActive = getSysVal(db, 'vks_active_quarter') || '2026-4';
  const info = parseQuarterCodeInfo(rawActive);
  const periodStart = getSysVal(db, 'vks_active_period_start') || info.periodStart;
  const periodEnd = getSysVal(db, 'vks_active_period_end') || info.periodEnd;
  const notifications15MinEnabled = getSysVal(db, 'vks_15min_notifications_enabled') === '1';

  const activeMasterCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM gosuslugi_vks_master_list').get() as { cnt: number }
  ).cnt;

  if (activeMasterCount === 0) {
    const cleaned = db
      .prepare(
        `DELETE FROM gosuslugi_submissions
         WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'`
      )
      .run();
    if (cleaned.changes > 0) {
      db.prepare(`DELETE FROM gosuslugi_submission_history`).run();
      invalidateGosuslugiAnalyticsCache();
    }
  }

  const activeSubRows = db
    .prepare(
      `SELECT sicil_no, application_no, gosuslugi_status, pdf_filename, status_pdf_filename
       FROM gosuslugi_submissions
       WHERE LOWER(COALESCE(notification_type, 'vks_salary')) = 'vks_salary'`
    )
    .all() as Array<{
    sicil_no: string;
    application_no: string;
    gosuslugi_status: string;
    pdf_filename?: string;
    status_pdf_filename?: string;
  }>;
  const activeStats = summarizeSubmissionsForArchive(activeSubRows);
  const activeSentCount = activeStats.sent;

  const archives = db
    .prepare(
      `SELECT quarter_code, quarter_label, period_start, period_end,
              master_count, sent_count, completed_count, refused_count, error_count,
              archived_at, archived_by
       FROM gosuslugi_quarter_archives
       ORDER BY quarter_code DESC`
    )
    .all() as QuarterArchiveRecord[];
  const archiveByCode = new Map<string, QuarterArchiveRecord>();
  for (const a of archives) {
    archiveByCode.set(a.quarter_code, a);
  }

  const catalogRows = db
    .prepare(
      `SELECT quarter_code, year, quarter, quarter_label_tr, quarter_label_ru,
              short_label_tr, short_label_ru, period_start, period_end, period_end_iso
       FROM gosuslugi_quarters
       ORDER BY year DESC, quarter DESC`
    )
    .all() as Array<{
    quarter_code: string;
    year: number;
    quarter: number;
    quarter_label_tr: string;
    quarter_label_ru: string;
    short_label_tr: string;
    short_label_ru: string;
    period_start: string;
    period_end: string;
    period_end_iso: string;
  }>;

  const quarters: VksQuarterItem[] = catalogRows.map((row) => {
    const isActive = row.quarter_code === info.quarterCode;
    const arch = archiveByCode.get(row.quarter_code);
    const isArchived = !isActive && Boolean(arch);
    const pStart = isActive ? periodStart : arch?.period_start || row.period_start;
    const pEnd = isActive ? periodEnd : arch?.period_end || row.period_end;
    const pEndIso = periodEndRuToIso(pEnd, row.year, row.quarter);
    const hasEnded = todayMoscowIso > pEndIso;

    return {
      quarter_code: row.quarter_code,
      year: row.year,
      quarter: row.quarter,
      quarter_label: `${row.year} ${row.quarter}. Çeyrek (${pStart} – ${pEnd})`,
      quarter_label_ru: `${row.quarter} Квартал ${row.year} (${pStart} – ${pEnd})`,
      short_label_tr: row.short_label_tr,
      short_label_ru: row.short_label_ru,
      period_start: pStart,
      period_end: pEnd,
      period_end_iso: pEndIso,
      has_ended: hasEnded,
      is_active: isActive,
      is_archived: isArchived,
      status: isActive ? 'active' : isArchived ? 'archived' : 'planned',
      master_count: isActive ? activeMasterCount : arch?.master_count || 0,
      sent_count: isActive ? activeSentCount : arch?.sent_count || 0,
      completed_count: isActive ? activeStats.completed : arch?.completed_count || 0,
      refused_count: isActive ? activeStats.refused : arch?.refused_count || 0,
      error_count: isActive ? activeStats.errors : arch?.error_count || 0,
    };
  });

  // Sort strictly descending by year then quarter
  quarters.sort((a, b) => b.year - a.year || b.quarter - a.quarter);

  // Rule: Until a quarter's last day passes (todayMoscowIso > period_end_iso),
  // default to the most recently ended quarter (e.g. 2026-3 until 31.12.2026 passes,
  // then automatically 2026-4 starting 01.01.2027, then 2027-1 starting 01.04.2027).
  const latestEndedQuarter = quarters.find((q) => q.has_ended);
  const defaultItem =
    latestEndedQuarter ||
    quarters.find((q) => q.is_active) ||
    quarters[0] || {
      quarter_code: info.quarterCode,
      quarter_label: `${info.year} ${info.quarter}. Çeyrek (${periodStart} – ${periodEnd})`,
      quarter_label_ru: `${info.quarter} Квартал ${info.year} (${periodStart} – ${periodEnd})`,
    };

  const highestQuarter = quarters[0] ? parseQuarterCodeInfo(quarters[0].quarter_code) : info;

  return {
    activeQuarter: info.quarterCode,
    defaultQuarter: defaultItem.quarter_code,
    defaultLabelTr: defaultItem.quarter_label,
    defaultLabelRu: defaultItem.quarter_label_ru,
    activeLabelTr: `${info.year} ${info.quarter}. Çeyrek (${periodStart} – ${periodEnd})`,
    activeLabelRu: `${info.quarter} Квартал ${info.year} (${periodStart} – ${periodEnd})`,
    shortLabelTr: info.shortLabelTr,
    shortLabelRu: info.shortLabelRu,
    periodStart,
    periodEnd,
    nextQuarterCode: info.nextQuarterCode,
    suggestedNextQuarterCode: highestQuarter.nextQuarterCode,
    notifications15MinEnabled,
    activeMasterCount,
    activeSentCount,
    todayMoscowIso,
    archives,
    quarters,
  };
}

export function resolveRequestedVksQuarter(
  requestedQuarter: string | null | undefined,
  overview: VksQuarterOverview
): string {
  const cleaned = String(requestedQuarter || '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'default') {
    return overview.defaultQuarter;
  }
  if (cleaned.toLowerCase() === 'active') {
    return overview.activeQuarter;
  }
  return parseQuarterCodeInfo(cleaned).quarterCode;
}

export function addVksQuarter(
  db: any,
  input: {
    year?: number;
    quarter?: number;
    quarterCode?: string;
    periodStart?: string;
    periodEnd?: string;
    makeActive?: boolean;
  },
  actor = 'admin'
): { quarterCode: string; overview: VksQuarterOverview; alreadyExisted: boolean } {
  ensureVksQuarterlyArchiveAndState(db);

  let targetCode = String(input.quarterCode || '').trim();
  if (!targetCode && input.year && input.quarter) {
    const yr = Number(input.year);
    const q = Number(input.quarter);
    if (!Number.isInteger(yr) || yr < 2024 || yr > 2035) {
      throw new Error('Geçerli bir yıl giriniz (2024 – 2035).');
    }
    if (![1, 2, 3, 4].includes(q)) {
      throw new Error('Geçerli bir çeyrek seçiniz (1 – 4).');
    }
    targetCode = `${yr}-${q}`;
  }

  const parsed = parseQuarterCodeInfo(targetCode);
  const existing = db
    .prepare('SELECT quarter_code FROM gosuslugi_quarters WHERE quarter_code = ?')
    .get(parsed.quarterCode);

  const pStart = String(input.periodStart || parsed.periodStart).trim();
  const pEnd = String(input.periodEnd || parsed.periodEnd).trim();
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(pStart) || !/^\d{2}\.\d{2}\.\d{4}$/.test(pEnd)) {
    throw new Error('Dönem başlangıç ve bitiş tarihleri GG.AA.YYYY formatında olmalıdır.');
  }

  upsertQuarterCatalogRow(db, parsed.quarterCode, pStart, pEnd, actor);

  if (input.makeActive) {
    const switched = switchActiveVksQuarter(db, parsed.quarterCode, actor);
    return {
      quarterCode: parsed.quarterCode,
      overview: switched.overview,
      alreadyExisted: Boolean(existing),
    };
  }

  invalidateGosuslugiAnalyticsCache();
  return {
    quarterCode: parsed.quarterCode,
    overview: getVksQuarterOverview(db),
    alreadyExisted: Boolean(existing),
  };
}

export function switchActiveVksQuarter(
  db: any,
  targetQuarterCode: string,
  actor = 'admin'
): { archived?: QuarterArchiveRecord; overview: VksQuarterOverview } {
  ensureVksQuarterlyArchiveAndState(db);
  const currentOverview = getVksQuarterOverview(db);
  const targetInfo = parseQuarterCodeInfo(targetQuarterCode);

  if (targetInfo.quarterCode === currentOverview.activeQuarter) {
    return { overview: currentOverview };
  }

  const existingArchive = db
    .prepare('SELECT master_count, sent_count FROM gosuslugi_quarter_archives WHERE quarter_code = ?')
    .get(targetInfo.quarterCode) as { master_count?: number; sent_count?: number } | undefined;
  if (existingArchive && ((existingArchive.master_count || 0) > 0 || (existingArchive.sent_count || 0) > 0)) {
    throw new Error(
      `${targetInfo.shortLabelTr} dönemi tamamlanmış arşiv verisi içerdiği için tekrar boş aktif kuyruğa alınamaz; arşiv görünümünden inceleyebilirsiniz.`
    );
  }

  // Ensure target is in catalog
  const existingCatalog = db
    .prepare('SELECT period_start, period_end FROM gosuslugi_quarters WHERE quarter_code = ?')
    .get(targetInfo.quarterCode) as { period_start?: string; period_end?: string } | undefined;
  const targetStart = existingCatalog?.period_start || targetInfo.periodStart;
  const targetEnd = existingCatalog?.period_end || targetInfo.periodEnd;
  upsertQuarterCatalogRow(db, targetInfo.quarterCode, targetStart, targetEnd, actor);

  // If current active quarter has data, archive it safely; if empty, just switch pointers cleanly
  if (currentOverview.activeMasterCount > 0 || currentOverview.activeSentCount > 0) {
    try {
      createPreActionBackup(
        `vks_archive_${currentOverview.activeQuarter}`,
        `VKS Dönem Arşivleme (${currentOverview.activeQuarter} ➔ ${targetInfo.quarterCode})`,
        `Архивация квартала ВКС (${currentOverview.activeQuarter} ➔ ${targetInfo.quarterCode})`
      );
    } catch {}
    const archived = performQuarterArchiveTx(db, currentOverview.activeQuarter, targetInfo.quarterCode, actor);
    return { archived, overview: getVksQuarterOverview(db) };
  }

  setSysVal(db, 'vks_active_quarter', targetInfo.quarterCode);
  setSysVal(db, 'vks_active_period_start', targetStart);
  setSysVal(db, 'vks_active_period_end', targetEnd);
  setSysVal(db, 'vks_15min_notifications_enabled', '0');
  invalidateGosuslugiAnalyticsCache();

  return { overview: getVksQuarterOverview(db) };
}

export function archiveActiveQuarterAndAdvance(
  db: any,
  nextQuarterOverride?: string,
  actor = 'admin'
): { archived: QuarterArchiveRecord; overview: VksQuarterOverview } {
  ensureVksQuarterlyArchiveAndState(db);
  const currentOverview = getVksQuarterOverview(db);
  const targetNext = nextQuarterOverride
    ? parseQuarterCodeInfo(nextQuarterOverride).quarterCode
    : currentOverview.nextQuarterCode;

  if (targetNext === currentOverview.activeQuarter) {
    throw new Error('Yeni çeyrek kodu mevcut aktif dönemle aynı olamaz.');
  }

  try {
    createPreActionBackup(
      `vks_archive_${currentOverview.activeQuarter}`,
      `VKS Dönem Arşivleme (${currentOverview.activeQuarter} ➔ ${targetNext})`,
      `Архивация квартала ВКС (${currentOverview.activeQuarter} ➔ ${targetNext})`
    );
  } catch {}

  const archived = performQuarterArchiveTx(db, currentOverview.activeQuarter, targetNext, actor);
  const overview = getVksQuarterOverview(db);
  return { archived, overview };
}

export function getAllArchivedGosuslugiAppNos(db: any): string[] {
  ensureVksQuarterlyArchiveAndState(db);
  const rows = db
    .prepare(
      `SELECT DISTINCT application_no FROM gosuslugi_refused_archive WHERE application_no != ''
       UNION
       SELECT DISTINCT application_no FROM gosuslugi_submissions_archive WHERE application_no != ''`
    )
    .all() as Array<{ application_no: string }>;
  return rows.map((r) => r.application_no);
}
