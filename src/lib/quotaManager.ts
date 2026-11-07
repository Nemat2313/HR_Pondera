import { getDb } from '@/lib/db';
import { sendTelegramMessage, getMoscowTimeParts } from '@/lib/telegramNotifier';
import { renderCorporateEmailShell, sendCustomAlertEmail } from '@/lib/emailNotifier';
import quotaSeedData from '@/data/ponderaQuotaSeed.json';

export interface QuotaRegionRef {
  code: string;
  nameTr: string;
  nameRu: string;
  subjectCode: string;
}

export interface QuotaCountryRef {
  code: string;
  nameTr: string;
  nameRu: string;
}

export interface QuotaOccupationRef {
  code: string;
  nameTr: string;
  nameRu: string;
  displayRuTr: string;
  okz: string;
  codeType: string;
}

export interface QuotaProjectMappingRef {
  mobProject: string;
  quotaProject: string;
  regionCode: string;
}

export interface QuotaAllocationRow {
  id: number;
  record_code: string;
  year: number;
  application_type: string;
  migrakvota_status: string;
  target_date: string;
  region_code: string;
  project_name: string;
  country_code: string;
  country_tr: string;
  country_ru: string;
  occupation_code: string;
  occupation_tr: string;
  occupation_ru: string;
  requested_qty: number;
  approved_qty: number;
  legacy_irs_qty: number;
  opening_new_use: number;
  extensions_use: number;
  irs_doc_no: string;
  notes: string;
  updated_by: string;
  updated_at: string;
  live_worker_new_use?: number;
  live_worker_ext_use?: number;
  total_used_qty?: number;
  available_qty?: number;
}

export interface QuotaIrsLineComputed {
  id: number;
  certificate_id: number;
  certificate_no: string;
  quota_record_code: string;
  country_code: string;
  country_tr: string;
  occupation_code: string;
  occupation_tr: string;
  occupation_ru: string;
  allocated_qty: number;
  used_qty: number;
  remaining_qty: number;
}

export interface QuotaIrsCertificateComputed {
  id: number;
  certificate_no: string;
  tranche_label: string;
  quota_year: number;
  region_code: string;
  project_name: string;
  issue_date: string;
  valid_from: string;
  valid_until: string;
  state_duty_per_person: number;
  status: 'active' | 'planned' | 'expired';
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  lines: QuotaIrsLineComputed[];
  total_allocated_qty: number;
  total_used_qty: number;
  total_remaining_qty: number;
  days_until_expiry: number | null;
  is_cross_year_carryover: boolean;
}

export interface QuotaWorkerApplicationRow {
  id: number;
  certificate_no: string;
  quota_record_code: string;
  sicil_no: string;
  full_name: string;
  passport_no: string;
  country_code: string;
  country_tr: string;
  occupation_code: string;
  occupation_tr: string;
  occupation_ru: string;
  region_code: string;
  project_name: string;
  usage_type: 'new_rnr' | 'visa_extension';
  application_status: 'applied' | 'rnr_approved' | 'visa_issued' | 'arrived' | 'cancelled';
  application_date: string;
  rnr_number: string;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuotaAlertSettings {
  enabled: boolean;
  lowIrsThresholdQty: number;
  lowQuotaThresholdPct: number;
  expiryWarningDays: number;
  notifyTelegram: boolean;
  notifyEmail: boolean;
  recipientEmails: string;
  lastAlertAt: string;
}

export interface CriticalQuotaAlertItem {
  key: string;
  severity: 'critical' | 'warning';
  category: 'irs_low' | 'irs_expiring' | 'quota_low';
  titleTr: string;
  titleRu: string;
  regionCode: string;
  projectName: string;
  certificateNo?: string;
  occupationCode?: string;
  occupationLabel?: string;
  allocated: number;
  used: number;
  remaining: number;
  validUntil?: string;
  daysLeft?: number | null;
}

const seedTyped = quotaSeedData as {
  regions: QuotaRegionRef[];
  projectMappings: QuotaProjectMappingRef[];
  countries: QuotaCountryRef[];
  occupations: QuotaOccupationRef[];
  logRecords: Array<{
    recordCode: string;
    year: number;
    applicationType: string;
    targetDate: string;
    status: string;
    regionCode: string;
    projectName: string;
    countryCode: string;
    countryTr: string;
    countryRu: string;
    occupationCode: string;
    occupationTr: string;
    occupationRu: string;
    requestedQty: number;
    approvedQty: number;
    irsQty: number;
    newUseQty: number;
    extensionsQty: number;
    irsDocNo: string;
    notes: string;
  }>;
};

const COUNTRY_MAP = new Map<string, QuotaCountryRef>(
  (seedTyped.countries || []).map((c) => [String(c.code).padStart(3, '0'), c])
);

const OCCUPATION_MAP = new Map<string, QuotaOccupationRef>(
  (seedTyped.occupations || []).map((o) => [String(o.code).trim(), o])
);

const REGION_MAP = new Map<string, QuotaRegionRef>(
  (seedTyped.regions || []).map((r) => [r.code.toUpperCase(), r])
);

export function getQuotaReferences() {
  return {
    regions: seedTyped.regions || [],
    projectMappings: seedTyped.projectMappings || [],
    countries: seedTyped.countries || [],
    occupations: seedTyped.occupations || [],
  };
}

export function resolveCountryByCodeOrName(inputCode?: string, inputName?: string): {
  code: string;
  nameTr: string;
  nameRu: string;
} {
  const cleanCode = String(inputCode || '').trim();
  if (cleanCode) {
    const padded = /^\d+$/.test(cleanCode) ? cleanCode.padStart(3, '0') : cleanCode;
    const hit = COUNTRY_MAP.get(padded);
    if (hit) return hit;
  }
  const normName = String(inputName || '').trim().toLocaleLowerCase('tr-TR');
  if (normName) {
    for (const c of seedTyped.countries || []) {
      if (
        c.nameTr.toLocaleLowerCase('tr-TR') === normName ||
        c.nameRu.toLowerCase() === normName ||
        (normName.includes('hind') && c.code === '356') ||
        (normName.includes('инди') && c.code === '356') ||
        (normName.includes('türkmen') && c.code === '795') ||
        (normName.includes('turkmen') && c.code === '795') ||
        (normName.includes('туркмен') && c.code === '795') ||
        (normName.includes('türkiye') && c.code === '792') ||
        (normName.includes('turkiye') && c.code === '792') ||
        (normName.includes('турци') && c.code === '792') ||
        (normName.includes('bangla') && c.code === '050') ||
        (normName.includes('endonez') && c.code === '360') ||
        (normName.includes('filipin') && c.code === '608') ||
        (normName.includes('pakist') && c.code === '586') ||
        (normName.includes('nepal') && c.code === '524') ||
        (normName.includes('vietnam') && c.code === '704') ||
        (normName.includes('özbek') && c.code === '860') ||
        (normName.includes('ozbek') && c.code === '860') ||
        (normName.includes('tacik') && c.code === '762')
      ) {
        return c;
      }
    }
  }
  return {
    code: cleanCode ? (/^\d+$/.test(cleanCode) ? cleanCode.padStart(3, '0') : cleanCode) : '',
    nameTr: String(inputName || '').trim(),
    nameRu: '',
  };
}

export function resolveOccupationByCodeOrName(inputCode?: string, inputName?: string): {
  code: string;
  nameTr: string;
  nameRu: string;
} {
  const cleanCode = String(inputCode || '').trim();
  if (cleanCode) {
    const hit = OCCUPATION_MAP.get(cleanCode);
    if (hit) {
      return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
  }
  const norm = String(inputName || '').trim().toLocaleLowerCase('tr-TR');
  if (norm) {
    for (const o of seedTyped.occupations || []) {
      if (
        o.nameTr.toLocaleLowerCase('tr-TR') === norm ||
        o.nameRu.toLowerCase() === norm ||
        o.displayRuTr.toLocaleLowerCase('tr-TR') === norm
      ) {
        return { code: o.code, nameTr: o.nameTr, nameRu: o.nameRu };
      }
    }
    if (norm.includes('montaj') || norm.includes('borucu')) {
      const hit = OCCUPATION_MAP.get('102660');
      if (hit) return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
    if (norm.includes('izolas') || norm.includes('изолир')) {
      const hit = OCCUPATION_MAP.get('101435');
      if (hit) return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
    if (norm.includes('kaynak') || norm.includes('сварщ')) {
      const hit = OCCUPATION_MAP.get('105558');
      if (hit) return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
    if (norm.includes('beton')) {
      const hit = OCCUPATION_MAP.get('100663');
      if (hit) return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
    if (norm.includes('demir') || norm.includes('арматур')) {
      const hit = OCCUPATION_MAP.get('100627');
      if (hit) return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
    if (norm.includes('iskele')) {
      const hit = OCCUPATION_MAP.get('102642');
      if (hit) return { code: hit.code, nameTr: hit.nameTr, nameRu: hit.nameRu };
    }
  }
  return {
    code: cleanCode,
    nameTr: String(inputName || '').trim(),
    nameRu: '',
  };
}

function getTableCols(db: any, tableName: string): Set<string> {
  try {
    return new Set(
      (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
  } catch {
    return new Set();
  }
}

export function ensureQuotaTables(dbArg?: any) {
  const db = dbArg || getDb();
  const gState = globalThis as unknown as {
    __ponderaQuotaTablesEnsured?: boolean;
  };

  if (gState.__ponderaQuotaTablesEnsured) {
    const cols = getTableCols(db, 'quota_worker_applications');
    if (cols.has('certificate_no') && cols.has('occupation_code')) {
      return db;
    }
    gState.__ponderaQuotaTablesEnsured = false;
  }

  try {
    db.exec('PRAGMA busy_timeout = 5000;');
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS quota_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_code TEXT UNIQUE NOT NULL,
      year INTEGER NOT NULL DEFAULT 2026,
      application_type TEXT NOT NULL DEFAULT 'ILK BASVURU',
      migrakvota_status TEXT NOT NULL DEFAULT 'BASVURU YAPILACAK',
      target_date TEXT NOT NULL DEFAULT '',
      region_code TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      country_tr TEXT NOT NULL DEFAULT '',
      country_ru TEXT NOT NULL DEFAULT '',
      occupation_code TEXT NOT NULL DEFAULT '',
      occupation_tr TEXT NOT NULL DEFAULT '',
      occupation_ru TEXT NOT NULL DEFAULT '',
      requested_qty INTEGER NOT NULL DEFAULT 0,
      approved_qty INTEGER NOT NULL DEFAULT 0,
      legacy_irs_qty INTEGER NOT NULL DEFAULT 0,
      opening_new_use INTEGER NOT NULL DEFAULT 0,
      extensions_use INTEGER NOT NULL DEFAULT 0,
      irs_doc_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT 'Sistem',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quota_irs_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_no TEXT UNIQUE NOT NULL,
      tranche_label TEXT NOT NULL DEFAULT 'ИРС(РНП)-1',
      quota_year INTEGER NOT NULL DEFAULT 2026,
      region_code TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL DEFAULT '',
      valid_from TEXT NOT NULL DEFAULT '',
      valid_until TEXT NOT NULL DEFAULT '',
      state_duty_per_person INTEGER NOT NULL DEFAULT 15000,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'Admin',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quota_irs_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_id INTEGER NOT NULL,
      certificate_no TEXT NOT NULL,
      quota_record_code TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      country_tr TEXT NOT NULL DEFAULT '',
      occupation_code TEXT NOT NULL DEFAULT '',
      occupation_tr TEXT NOT NULL DEFAULT '',
      occupation_ru TEXT NOT NULL DEFAULT '',
      allocated_qty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quota_worker_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_no TEXT NOT NULL,
      quota_record_code TEXT NOT NULL DEFAULT '',
      sicil_no TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL,
      passport_no TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      country_tr TEXT NOT NULL DEFAULT '',
      occupation_code TEXT NOT NULL DEFAULT '',
      occupation_tr TEXT NOT NULL DEFAULT '',
      occupation_ru TEXT NOT NULL DEFAULT '',
      region_code TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      usage_type TEXT NOT NULL DEFAULT 'new_rnr',
      application_status TEXT NOT NULL DEFAULT 'applied',
      application_date TEXT NOT NULL DEFAULT '',
      rnr_number TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'Admin',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quota_alert_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      low_irs_threshold_qty INTEGER NOT NULL DEFAULT 15,
      low_quota_threshold_pct INTEGER NOT NULL DEFAULT 15,
      expiry_warning_days INTEGER NOT NULL DEFAULT 30,
      notify_telegram INTEGER NOT NULL DEFAULT 1,
      notify_email INTEGER NOT NULL DEFAULT 1,
      recipient_emails TEXT NOT NULL DEFAULT '',
      last_alert_hash TEXT NOT NULL DEFAULT '',
      last_alert_at TEXT NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO quota_alert_settings (
      id, enabled, low_irs_threshold_qty, low_quota_threshold_pct,
      expiry_warning_days, notify_telegram, notify_email, recipient_emails
    ) VALUES (1, 1, 15, 15, 30, 1, 1, '');

    CREATE INDEX IF NOT EXISTS idx_quota_alloc_year_reg ON quota_allocations(year, region_code);
    CREATE INDEX IF NOT EXISTS idx_quota_alloc_occ ON quota_allocations(occupation_code);
    CREATE INDEX IF NOT EXISTS idx_quota_irs_lines_cert ON quota_irs_lines(certificate_no);
    CREATE INDEX IF NOT EXISTS idx_quota_workers_cert ON quota_worker_applications(certificate_no);
    CREATE INDEX IF NOT EXISTS idx_quota_workers_sicil ON quota_worker_applications(sicil_no);
  `);

  // One-time seed of Pondera's 260 official 2026 & 2027 quota records from Pondera_Kota_Dynamic_Projects_17102026.xlsm
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    const seedFlag = db
      .prepare("SELECT value FROM system_info WHERE key = 'pondera_quota_v2831_seeded'")
      .get() as { value?: string } | undefined;

    if (seedFlag?.value !== '1' && Array.isArray(seedTyped.logRecords)) {
      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO quota_allocations (
          record_code, year, application_type, migrakvota_status, target_date,
          region_code, project_name, country_code, country_tr, country_ru,
          occupation_code, occupation_tr, occupation_ru,
          requested_qty, approved_qty, legacy_irs_qty, opening_new_use, extensions_use,
          irs_doc_no, notes, updated_by, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'Excel Seed (Pondera Kota)', ?
        )
      `);

      db.exec('BEGIN');
      try {
        for (const rec of seedTyped.logRecords) {
          insertStmt.run(
            rec.recordCode,
            Number(rec.year || 2026),
            rec.applicationType || 'ILK BASVURU',
            rec.status || 'BASVURU YAPILACAK',
            rec.targetDate || '',
            String(rec.regionCode || '').toUpperCase(),
            rec.projectName || '',
            rec.countryCode || '',
            rec.countryTr || '',
            rec.countryRu || '',
            rec.occupationCode || '',
            rec.occupationTr || '',
            rec.occupationRu || '',
            Number(rec.requestedQty || 0),
            Number(rec.approvedQty || 0),
            Number(rec.irsQty || 0),
            Number(rec.newUseQty || 0),
            Number(rec.extensionsQty || 0),
            rec.irsDocNo || '',
            rec.notes || '',
            nowIso
          );
        }
        db.prepare(
          "INSERT OR REPLACE INTO system_info (key, value) VALUES ('pondera_quota_v2831_seeded', '1')"
        ).run();
        db.exec('COMMIT');
      } catch {
        try {
          db.exec('ROLLBACK');
        } catch {}
      }
    }
  } catch {}

  const verifiedCols = getTableCols(db, 'quota_worker_applications');
  if (verifiedCols.has('certificate_no')) {
    gState.__ponderaQuotaTablesEnsured = true;
  }

  return db;
}

function computeDaysUntil(dateStr: string, todayIso: string): number | null {
  const clean = String(dateStr || '').trim();
  let iso = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    iso = clean;
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(clean)) {
    const [dd, mm, yyyy] = clean.split('.');
    iso = `${yyyy}-${mm}-${dd}`;
  }
  if (!iso) return null;
  const targetMs = Date.parse(`${iso}T00:00:00Z`);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(targetMs) || Number.isNaN(todayMs)) return null;
  return Math.round((targetMs - todayMs) / 86400000);
}

export function getQuotaAlertSettings(dbArg?: any): QuotaAlertSettings {
  const db = ensureQuotaTables(dbArg);
  const row = db.prepare('SELECT * FROM quota_alert_settings WHERE id = 1').get() as
    | Record<string, any>
    | undefined;
  return {
    enabled: row ? Number(row.enabled) === 1 : true,
    lowIrsThresholdQty: Number(row?.low_irs_threshold_qty ?? 15),
    lowQuotaThresholdPct: Number(row?.low_quota_threshold_pct ?? 15),
    expiryWarningDays: Number(row?.expiry_warning_days ?? 30),
    notifyTelegram: row ? Number(row.notify_telegram) === 1 : true,
    notifyEmail: row ? Number(row.notify_email) === 1 : true,
    recipientEmails: String(row?.recipient_emails || ''),
    lastAlertAt: String(row?.last_alert_at || ''),
  };
}

export function saveQuotaAlertSettings(
  input: Partial<QuotaAlertSettings>,
  dbArg?: any
): QuotaAlertSettings {
  const db = ensureQuotaTables(dbArg);
  const curr = getQuotaAlertSettings(db);
  const next: QuotaAlertSettings = {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : curr.enabled,
    lowIrsThresholdQty:
      input.lowIrsThresholdQty !== undefined
        ? Math.max(1, Number(input.lowIrsThresholdQty) || 15)
        : curr.lowIrsThresholdQty,
    lowQuotaThresholdPct:
      input.lowQuotaThresholdPct !== undefined
        ? Math.min(90, Math.max(1, Number(input.lowQuotaThresholdPct) || 15))
        : curr.lowQuotaThresholdPct,
    expiryWarningDays:
      input.expiryWarningDays !== undefined
        ? Math.max(1, Number(input.expiryWarningDays) || 30)
        : curr.expiryWarningDays,
    notifyTelegram:
      input.notifyTelegram !== undefined ? Boolean(input.notifyTelegram) : curr.notifyTelegram,
    notifyEmail: input.notifyEmail !== undefined ? Boolean(input.notifyEmail) : curr.notifyEmail,
    recipientEmails:
      input.recipientEmails !== undefined
        ? String(input.recipientEmails).trim()
        : curr.recipientEmails,
    lastAlertAt: curr.lastAlertAt,
  };

  db.prepare(`
    UPDATE quota_alert_settings
    SET enabled = ?,
        low_irs_threshold_qty = ?,
        low_quota_threshold_pct = ?,
        expiry_warning_days = ?,
        notify_telegram = ?,
        notify_email = ?,
        recipient_emails = ?
    WHERE id = 1
  `).run(
    next.enabled ? 1 : 0,
    next.lowIrsThresholdQty,
    next.lowQuotaThresholdPct,
    next.expiryWarningDays,
    next.notifyTelegram ? 1 : 0,
    next.notifyEmail ? 1 : 0,
    next.recipientEmails
  );

  return next;
}

export function getQuotaOverviewData(selectedYear?: number | 'all', dbArg?: any) {
  const db = ensureQuotaTables(dbArg);
  const msk = getMoscowTimeParts();
  const todayIso = msk.dateIso;

  const yearRows = db
    .prepare('SELECT DISTINCT year FROM quota_allocations ORDER BY year ASC')
    .all() as Array<{ year: number }>;
  const certYearRows = db
    .prepare('SELECT DISTINCT quota_year AS year FROM quota_irs_certificates ORDER BY quota_year ASC')
    .all() as Array<{ year: number }>;

  const yearSet = new Set<number>([2026, 2027]);
  for (const r of yearRows) if (r.year) yearSet.add(Number(r.year));
  for (const r of certYearRows) if (r.year) yearSet.add(Number(r.year));
  const availableYears = Array.from(yearSet).sort((a, b) => a - b);

  const rawAllocations = (
    selectedYear && selectedYear !== 'all'
      ? db
          .prepare(
            'SELECT * FROM quota_allocations WHERE year = ? ORDER BY region_code ASC, project_name ASC, country_code ASC, occupation_code ASC'
          )
          .all(Number(selectedYear))
      : db
          .prepare(
            'SELECT * FROM quota_allocations ORDER BY year DESC, region_code ASC, project_name ASC, country_code ASC, occupation_code ASC'
          )
          .all()
  ) as QuotaAllocationRow[];

  const rawCertificates = (
    selectedYear && selectedYear !== 'all'
      ? db
          .prepare(
            'SELECT * FROM quota_irs_certificates WHERE quota_year = ? ORDER BY id ASC'
          )
          .all(Number(selectedYear))
      : db.prepare('SELECT * FROM quota_irs_certificates ORDER BY quota_year DESC, id ASC').all()
  ) as Array<Record<string, any>>;

  const rawLines = db
    .prepare('SELECT * FROM quota_irs_lines ORDER BY id ASC')
    .all() as Array<Record<string, any>>;

  const allWorkers = db
    .prepare('SELECT * FROM quota_worker_applications ORDER BY id DESC')
    .all() as QuotaWorkerApplicationRow[];

  const activeWorkers = allWorkers.filter((w) => w.application_status !== 'cancelled');

  // Map worker usage per certificate & occupation (exact COUNTIFS from Zahid Şef's Table 2)
  const certLinesByCertNo = new Map<string, Array<Record<string, any>>>();
  for (const ln of rawLines) {
    const cno = String(ln.certificate_no || '');
    if (!certLinesByCertNo.has(cno)) certLinesByCertNo.set(cno, []);
    certLinesByCertNo.get(cno)!.push(ln);
  }

  const workersByCertNo = new Map<string, QuotaWorkerApplicationRow[]>();
  for (const w of activeWorkers) {
    const cno = String(w.certificate_no || '').trim();
    if (!cno) continue;
    if (!workersByCertNo.has(cno)) workersByCertNo.set(cno, []);
    workersByCertNo.get(cno)!.push(w);
  }

  const certificates: QuotaIrsCertificateComputed[] = rawCertificates.map((c) => {
    const cno = String(c.certificate_no || '').trim();
    const certWorkers = workersByCertNo.get(cno) || [];
    const linesRaw = certLinesByCertNo.get(cno) || [];

    // Count worker consumption per line
    const consumedWorkerIds = new Set<number>();
    const computedLines: QuotaIrsLineComputed[] = linesRaw.map((ln) => {
      const occCode = String(ln.occupation_code || '').trim();
      const occTr = String(ln.occupation_tr || '').trim().toLocaleLowerCase('tr-TR');
      const cntryCode = String(ln.country_code || '').trim();

      const matched = certWorkers.filter((w) => {
        if (consumedWorkerIds.has(w.id)) return false;
        const occMatch =
          (occCode && w.occupation_code === occCode) ||
          (!occCode && occTr && w.occupation_tr.toLocaleLowerCase('tr-TR') === occTr);
        if (!occMatch) return false;
        if (cntryCode && w.country_code && cntryCode !== w.country_code) return false;
        return true;
      });
      for (const mw of matched) consumedWorkerIds.add(mw.id);

      const alloc = Number(ln.allocated_qty || 0);
      const used = matched.length;
      return {
        id: Number(ln.id),
        certificate_id: Number(ln.certificate_id),
        certificate_no: cno,
        quota_record_code: String(ln.quota_record_code || ''),
        country_code: cntryCode,
        country_tr: String(ln.country_tr || ''),
        occupation_code: occCode,
        occupation_tr: String(ln.occupation_tr || ''),
        occupation_ru: String(ln.occupation_ru || ''),
        allocated_qty: alloc,
        used_qty: used,
        remaining_qty: alloc - used,
      };
    });

    const sumAlloc = computedLines.reduce((s, l) => s + l.allocated_qty, 0);
    const totalUsed = certWorkers.length;
    const daysLeft = computeDaysUntil(String(c.valid_until || ''), todayIso);
    const validUntilYear = Number(String(c.valid_until || '').slice(0, 4)) || 0;
    const quotaYearNum = Number(c.quota_year || 2026);

    let effStatus: 'active' | 'planned' | 'expired' =
      c.status === 'planned' ? 'planned' : c.status === 'expired' ? 'expired' : 'active';
    if (effStatus === 'active' && daysLeft !== null && daysLeft < 0) {
      effStatus = 'expired';
    }

    return {
      id: Number(c.id),
      certificate_no: cno,
      tranche_label: String(c.tranche_label || 'ИРС(РНП)'),
      quota_year: quotaYearNum,
      region_code: String(c.region_code || '').toUpperCase(),
      project_name: String(c.project_name || ''),
      issue_date: String(c.issue_date || ''),
      valid_from: String(c.valid_from || ''),
      valid_until: String(c.valid_until || ''),
      state_duty_per_person: Number(c.state_duty_per_person || 15000),
      status: effStatus,
      notes: String(c.notes || ''),
      created_by: String(c.created_by || ''),
      created_at: String(c.created_at || ''),
      updated_at: String(c.updated_at || ''),
      lines: computedLines,
      total_allocated_qty: sumAlloc,
      total_used_qty: totalUsed,
      total_remaining_qty: sumAlloc - totalUsed,
      days_until_expiry: daysLeft,
      is_cross_year_carryover: validUntilYear > quotaYearNum,
    };
  });

  const certYearMap = new Map<string, number>();
  for (const c of certificates) {
    certYearMap.set(c.certificate_no, c.quota_year);
  }
  const allCertYearRowsFull = db
    .prepare('SELECT certificate_no, quota_year FROM quota_irs_certificates')
    .all() as Array<{ certificate_no: string; quota_year: number }>;
  for (const r of allCertYearRowsFull) {
    certYearMap.set(r.certificate_no, Number(r.quota_year));
  }

  const filteredWorkers =
    selectedYear && selectedYear !== 'all'
      ? allWorkers.filter((w) => {
          const cy = certYearMap.get(w.certificate_no);
          if (cy) return cy === Number(selectedYear);
          return w.application_date.startsWith(String(selectedYear));
        })
      : allWorkers;

  // Link live worker applications back to quota_allocations rows
  const usedAllocWorkerIds = new Set<number>();
  const allocations: QuotaAllocationRow[] = rawAllocations.map((a) => {
    const matchingWorkers = activeWorkers.filter((w) => {
      if (usedAllocWorkerIds.has(w.id)) return false;
      if (w.quota_record_code && w.quota_record_code === a.record_code) return true;
      const cy = certYearMap.get(w.certificate_no);
      if (cy && cy !== a.year) return false;
      if (w.region_code && w.region_code.toUpperCase() !== a.region_code.toUpperCase()) return false;
      if (w.occupation_code && a.occupation_code && w.occupation_code !== a.occupation_code) {
        return false;
      }
      if (w.country_code && a.country_code && w.country_code !== a.country_code) {
        return false;
      }
      return Boolean(w.region_code && w.occupation_code);
    });

    for (const mw of matchingWorkers) usedAllocWorkerIds.add(mw.id);

    const liveNew = matchingWorkers.filter((w) => w.usage_type !== 'visa_extension').length;
    const liveExt = matchingWorkers.filter((w) => w.usage_type === 'visa_extension').length;
    const totalUsed =
      Number(a.opening_new_use || 0) + Number(a.extensions_use || 0) + liveNew + liveExt;
    const avail = Number(a.approved_qty || 0) - totalUsed;

    return {
      ...a,
      live_worker_new_use: liveNew,
      live_worker_ext_use: liveExt,
      total_used_qty: totalUsed,
      available_qty: avail,
    };
  });

  // Region Summary Matrix (Zahid Şef's Table 1: Заявлено | Подтверждено | ИРС(РНП)1..n | Kullanılan | Kalan İРС | Saklanan Kota)
  const regionGroups = new Map<
    string,
    {
      regionCode: string;
      regionNameTr: string;
      regionNameRu: string;
      projects: Set<string>;
      requestedQty: number;
      submittedQty: number;
      plannedQty: number;
      approvedQty: number;
      legacyIrsQty: number;
      openingUsedQty: number;
      extensionsQty: number;
      recordsCount: number;
    }
  >();

  for (const a of allocations) {
    const rCode = (a.region_code || 'DIGER').toUpperCase();
    const rRef = REGION_MAP.get(rCode);
    if (!regionGroups.has(rCode)) {
      regionGroups.set(rCode, {
        regionCode: rCode,
        regionNameTr: rRef?.nameTr || rCode,
        regionNameRu: rRef?.nameRu || rCode,
        projects: new Set(),
        requestedQty: 0,
        submittedQty: 0,
        plannedQty: 0,
        approvedQty: 0,
        legacyIrsQty: 0,
        openingUsedQty: 0,
        extensionsQty: 0,
        recordsCount: 0,
      });
    }
    const g = regionGroups.get(rCode)!;
    if (a.project_name) g.projects.add(a.project_name);
    const req = Number(a.requested_qty || 0);
    g.requestedQty += req;
    if (String(a.migrakvota_status || '').toUpperCase().includes('YAPILACAK')) {
      g.plannedQty += req;
    } else {
      g.submittedQty += req;
    }
    g.approvedQty += Number(a.approved_qty || 0);
    g.legacyIrsQty += Number(a.legacy_irs_qty || 0);
    g.openingUsedQty += Number(a.opening_new_use || 0);
    g.extensionsQty += Number(a.extensions_use || 0);
    g.recordsCount += 1;
  }

  for (const c of certificates) {
    const rCode = (c.region_code || 'DIGER').toUpperCase();
    const rRef = REGION_MAP.get(rCode);
    if (!regionGroups.has(rCode)) {
      regionGroups.set(rCode, {
        regionCode: rCode,
        regionNameTr: rRef?.nameTr || rCode,
        regionNameRu: rRef?.nameRu || rCode,
        projects: new Set(),
        requestedQty: 0,
        submittedQty: 0,
        plannedQty: 0,
        approvedQty: 0,
        legacyIrsQty: 0,
        openingUsedQty: 0,
        extensionsQty: 0,
        recordsCount: 0,
      });
    }
    if (c.project_name) regionGroups.get(rCode)!.projects.add(c.project_name);
  }

  const regionMatrix = Array.from(regionGroups.values())
    .map((g) => {
      const regCerts = certificates.filter((c) => c.region_code === g.regionCode);
      const certIrsTotal = regCerts.reduce((s, c) => s + c.total_allocated_qty, 0);
      const certUsedTotal = regCerts.reduce((s, c) => s + c.total_used_qty, 0);
      const totalIrsReceived = g.legacyIrsQty + certIrsTotal;
      const totalUsed = g.openingUsedQty + g.extensionsQty + certUsedTotal;
      const irsRemaining = Math.max(0, totalIrsReceived - totalUsed);
      const unallocatedQuotaReserve = g.approvedQty - totalIrsReceived;
      const availableTotal = g.approvedQty - totalUsed;

      return {
        regionCode: g.regionCode,
        regionNameTr: g.regionNameTr,
        regionNameRu: g.regionNameRu,
        projects: Array.from(g.projects),
        requestedQty: g.requestedQty,
        submittedQty: g.submittedQty,
        plannedQty: g.plannedQty,
        approvedQty: g.approvedQty,
        legacyIrsQty: g.legacyIrsQty,
        certIrsQty: certIrsTotal,
        totalIrsReceived,
        irsTranches: regCerts.map((c, idx) => ({
          index: idx + 1,
          certificateNo: c.certificate_no,
          label: c.tranche_label || `ИРС(РНП)${idx + 1}`,
          allocatedQty: c.total_allocated_qty,
          usedQty: c.total_used_qty,
          remainingQty: c.total_remaining_qty,
          validUntil: c.valid_until,
          isCrossYear: c.is_cross_year_carryover,
        })),
        usedQty: totalUsed,
        irsRemainingQty: irsRemaining,
        unallocatedQuotaReserve,
        availableTotal,
        recordsCount: g.recordsCount,
      };
    })
    .sort((a, b) => b.requestedQty - a.requestedQty);

  const kpis = {
    requestedTotal: regionMatrix.reduce((s, r) => s + r.requestedQty, 0),
    submittedTotal: regionMatrix.reduce((s, r) => s + r.submittedQty, 0),
    plannedTotal: regionMatrix.reduce((s, r) => s + r.plannedQty, 0),
    approvedTotal: regionMatrix.reduce((s, r) => s + r.approvedQty, 0),
    irsReceivedTotal: regionMatrix.reduce((s, r) => s + r.totalIrsReceived, 0),
    unallocatedReserveTotal: regionMatrix.reduce(
      (s, r) => s + Math.max(0, r.unallocatedQuotaReserve),
      0
    ),
    usedTotal: regionMatrix.reduce((s, r) => s + r.usedQty, 0),
    newUseTotal:
      allocations.reduce((s, a) => s + Number(a.opening_new_use || 0), 0) +
      filteredWorkers.filter(
        (w) => w.application_status !== 'cancelled' && w.usage_type !== 'visa_extension'
      ).length,
    extensionsTotal:
      allocations.reduce((s, a) => s + Number(a.extensions_use || 0), 0) +
      filteredWorkers.filter(
        (w) => w.application_status !== 'cancelled' && w.usage_type === 'visa_extension'
      ).length,
    irsRemainingTotal: regionMatrix.reduce((s, r) => s + r.irsRemainingQty, 0),
    availableTotal: regionMatrix.reduce((s, r) => s + r.availableTotal, 0),
    certificatesCount: certificates.length,
    workerApplicationsCount: filteredWorkers.length,
  };

  const alertSettings = getQuotaAlertSettings(db);
  const criticalAlerts = collectCriticalQuotaAlerts(db, alertSettings);

  return {
    todayIso,
    availableYears,
    selectedYear: selectedYear || 'all',
    kpis,
    regionMatrix,
    certificates,
    workerApplications: filteredWorkers,
    allocations,
    alertSettings,
    criticalAlerts,
    references: getQuotaReferences(),
  };
}

export function collectCriticalQuotaAlerts(
  dbArg?: any,
  settingsArg?: QuotaAlertSettings
): CriticalQuotaAlertItem[] {
  const db = ensureQuotaTables(dbArg);
  const settings = settingsArg || getQuotaAlertSettings(db);
  const msk = getMoscowTimeParts();
  const todayIso = msk.dateIso;

  const alerts: CriticalQuotaAlertItem[] = [];

  const certs = db
    .prepare("SELECT * FROM quota_irs_certificates WHERE status = 'active' ORDER BY id ASC")
    .all() as Array<Record<string, any>>;
  const lines = db
    .prepare('SELECT * FROM quota_irs_lines ORDER BY id ASC')
    .all() as Array<Record<string, any>>;
  const activeWorkers = db
    .prepare("SELECT * FROM quota_worker_applications WHERE application_status != 'cancelled'")
    .all() as QuotaWorkerApplicationRow[];

  for (const c of certs) {
    const cno = String(c.certificate_no || '').trim();
    const certLines = lines.filter((l) => String(l.certificate_no || '') === cno);
    const certWorkers = activeWorkers.filter((w) => String(w.certificate_no || '') === cno);
    const daysLeft = computeDaysUntil(String(c.valid_until || ''), todayIso);

    const consumedIds = new Set<number>();
    for (const ln of certLines) {
      const occCode = String(ln.occupation_code || '').trim();
      const cntryCode = String(ln.country_code || '').trim();
      const matched = certWorkers.filter((w) => {
        if (consumedIds.has(w.id)) return false;
        if (occCode && w.occupation_code !== occCode) return false;
        if (cntryCode && w.country_code && w.country_code !== cntryCode) return false;
        return true;
      });
      for (const mw of matched) consumedIds.add(mw.id);

      const alloc = Number(ln.allocated_qty || 0);
      const used = matched.length;
      const rem = alloc - used;

      if (alloc > 0 && rem <= settings.lowIrsThresholdQty) {
        alerts.push({
          key: `irs_line_${cno}_${occCode}_${cntryCode}_${rem}`,
          severity: rem <= 5 ? 'critical' : 'warning',
          category: 'irs_low',
          titleTr: `ИРС № ${cno} — ${ln.occupation_tr || occCode} kontenjanı kritik seviyede (${rem}/${alloc} kaldı)`,
          titleRu: `ИРС № ${cno} — малый остаток по профессии ${ln.occupation_ru || occCode} (ост. ${rem} из ${alloc})`,
          regionCode: String(c.region_code || ''),
          projectName: String(c.project_name || ''),
          certificateNo: cno,
          occupationCode: occCode,
          occupationLabel: `${occCode} • ${ln.occupation_tr || ln.occupation_ru}`,
          allocated: alloc,
          used,
          remaining: rem,
          validUntil: String(c.valid_until || ''),
          daysLeft,
        });
      }
    }

    const totalAlloc = certLines.reduce((s, l) => s + Number(l.allocated_qty || 0), 0);
    const totalRem = totalAlloc - certWorkers.length;
    if (
      daysLeft !== null &&
      daysLeft >= 0 &&
      daysLeft <= settings.expiryWarningDays &&
      totalRem > 0
    ) {
      alerts.push({
        key: `irs_exp_${cno}_${daysLeft}_${totalRem}`,
        severity: daysLeft <= 10 ? 'critical' : 'warning',
        category: 'irs_expiring',
        titleTr: `ИРС № ${cno} geçerlilik bitişine ${daysLeft} gün kaldı (${totalRem} kullanılmamış kontenjan var)`,
        titleRu: `ИРС № ${cno}: истекает через ${daysLeft} дн. (не использовано ${totalRem} мест)`,
        regionCode: String(c.region_code || ''),
        projectName: String(c.project_name || ''),
        certificateNo: cno,
        allocated: totalAlloc,
        used: certWorkers.length,
        remaining: totalRem,
        validUntil: String(c.valid_until || ''),
        daysLeft,
      });
    }
  }

  // Also check active approved quota lines (2026+) that still have >=1 remaining but <= threshold %
  const currentYear = Number(todayIso.slice(0, 4)) || 2026;
  const allocRows = db
    .prepare(
      'SELECT * FROM quota_allocations WHERE year >= ? AND approved_qty >= 20 ORDER BY approved_qty DESC'
    )
    .all(currentYear) as QuotaAllocationRow[];

  for (const a of allocRows) {
    const used = Number(a.opening_new_use || 0) + Number(a.extensions_use || 0);
    const rem = Number(a.approved_qty || 0) - used;
    const pct = a.approved_qty > 0 ? (rem / a.approved_qty) * 100 : 100;
    if (rem > 0 && (rem <= settings.lowIrsThresholdQty || pct <= settings.lowQuotaThresholdPct)) {
      alerts.push({
        key: `quota_low_${a.record_code}_${rem}`,
        severity: rem <= 5 ? 'critical' : 'warning',
        category: 'quota_low',
        titleTr: `${a.region_code} (${a.project_name}) — ${a.country_tr} • ${a.occupation_tr} (${a.occupation_code}) kotası azaldı: ${rem}/${a.approved_qty} kaldı`,
        titleRu: `${a.region_code} (${a.project_name}) — ${a.country_tr} • ${a.occupation_ru || a.occupation_tr}: осталось ${rem} из ${a.approved_qty}`,
        regionCode: a.region_code,
        projectName: a.project_name,
        occupationCode: a.occupation_code,
        occupationLabel: `${a.occupation_code} • ${a.occupation_tr}`,
        allocated: a.approved_qty,
        used,
        remaining: rem,
      });
    }
  }

  return alerts;
}

export async function checkAndSendQuotaAlerts(force = false): Promise<{
  ok: boolean;
  skipped?: boolean;
  alertCount: number;
  telegramSent: boolean;
  emailSent: boolean;
  detail: string;
}> {
  const db = ensureQuotaTables();
  const settings = getQuotaAlertSettings(db);

  if (!force && !settings.enabled) {
    return {
      ok: true,
      skipped: true,
      alertCount: 0,
      telegramSent: false,
      emailSent: false,
      detail: 'Kota bildirimleri kapalı.',
    };
  }

  const alerts = collectCriticalQuotaAlerts(db, settings);
  if (alerts.length === 0) {
    return {
      ok: true,
      skipped: true,
      alertCount: 0,
      telegramSent: false,
      emailSent: false,
      detail: 'Kritik eşik altında kota veya süresi yaklaşan İРС sertifikası bulunmuyor.',
    };
  }

  const fingerprint = alerts
    .map((a) => a.key)
    .sort()
    .join('|');
  const prevRow = db
    .prepare('SELECT last_alert_hash FROM quota_alert_settings WHERE id = 1')
    .get() as { last_alert_hash?: string } | undefined;

  if (!force && prevRow?.last_alert_hash === fingerprint) {
    return {
      ok: true,
      skipped: true,
      alertCount: alerts.length,
      telegramSent: false,
      emailSent: false,
      detail: 'Aynı kritik kota durumu için bildirim daha önce gönderildi.',
    };
  }

  const msk = getMoscowTimeParts();
  const nowDisplay = `${msk.dateDisplay} ${msk.timeDisplay} MSK`;

  let telegramSent = false;
  let emailSent = false;

  if (settings.notifyTelegram) {
    const topItems = alerts.slice(0, 12);
    const tgLines = [
      `⚠️ <b>PONDERA İK — KRİTİK KOTA & ИРС (РНП) AZALDI UYARISI</b>`,
      `🕒 <code>${nowDisplay}</code> | Kritik Kalem: <b>${alerts.length}</b>`,
      `────────────────────────`,
      ...topItems.map((it, idx) => {
        const icon = it.severity === 'critical' ? '🔴' : '🟠';
        const certPart = it.certificateNo ? ` [ИРС № <code>${it.certificateNo}</code>]` : '';
        const expPart =
          it.daysLeft !== undefined && it.daysLeft !== null
            ? ` • Bitiş: ${it.validUntil} (${it.daysLeft}g)`
            : '';
        return `${idx + 1}. ${icon} <b>${it.regionCode}</b> (${it.projectName})${certPart}\n   └ ${it.occupationLabel || 'Genel'}: Kalan <b>${it.remaining}</b> / ${it.allocated}${expPart}`;
      }),
      alerts.length > 12 ? `\n<i>...ve ${alerts.length - 12} kalem daha panelde listeleniyor.</i>` : '',
      `\n🔗 <a href="https://hr.pondera.network">Pondera Kota & ИРС Takip Paneline Git</a>`,
    ]
      .filter(Boolean)
      .join('\n');

    const tgRes = await sendTelegramMessage(tgLines);
    telegramSent = tgRes.ok;
  }

  if (settings.notifyEmail) {
    const rowsHtml = alerts
      .slice(0, 25)
      .map((it) => {
        const badgeBg = it.severity === 'critical' ? '#fee2e2' : '#fef3c7';
        const badgeFg = it.severity === 'critical' ? '#b91c1c' : '#b45309';
        return `
          <tr>
            <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: #0f172a;">
              ${it.regionCode}<div style="font-size: 11px; color: #64748b; font-weight: 400;">${it.projectName}</div>
            </td>
            <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #334155;">
              ${it.certificateNo ? `<strong>ИРС № ${it.certificateNo}</strong><br/>` : ''}
              ${it.occupationLabel || 'Sertifika Süre Uyarısı'}
            </td>
            <td align="center" style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
              ${it.allocated}
            </td>
            <td align="center" style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #0f766e;">
              ${it.used}
            </td>
            <td align="center" style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0;">
              <span style="display: inline-block; padding: 3px 9px; border-radius: 999px; background-color: ${badgeBg}; color: ${badgeFg}; font-size: 12px; font-weight: 700;">
                ${it.remaining} Kaldı
              </span>
            </td>
          </tr>
        `;
      })
      .join('');

    const bodyHtml = `
      <p style="margin: 0 0 14px; font-size: 13px; color: #334155; line-height: 1.6;">
        Aşağıdaki yabancı çalışan kotaları veya <strong>ИРС (РНП)</strong> sertifika kontenjanları belirlenen kritik eşiğin (<strong>≤ ${settings.lowIrsThresholdQty} kişi</strong> / <strong>≤ %${settings.lowQuotaThresholdPct}</strong>) altına düşmüş ya da geçerlilik süresi yaklaşmıştır:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; border-collapse: collapse;">
        <thead>
          <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
            <th align="left" style="padding: 10px 12px; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">Bölge / Proje</th>
            <th align="left" style="padding: 10px 12px; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">ИРС Sertifika / Görev Kodu</th>
            <th align="center" style="padding: 10px 12px; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">Tahsis</th>
            <th align="center" style="padding: 10px 12px; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">Kullanılan</th>
            <th align="center" style="padding: 10px 12px; font-size: 11px; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1;">Kalan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    const html = renderCorporateEmailShell({
      accentHex: '#e11d48',
      headerBgHex: '#1A363E',
      badgeText: `KRİTİK KOTA & ИРС UYARISI • ${nowDisplay}`,
      title: 'Yabancı Çalışan Kota & ИРС (РНП) Kritik Azalma Bildirimi',
      subtitle: `${alerts.length} kalemde kontenjan kritik eşiğin altına indi veya sertifika bitiş tarihi yaklaştı`,
      bodyHtml,
      ctaLabel: 'Kota & ИРС Takip Merkezini Aç →',
    });

    const customTo = settings.recipientEmails
      .split(/[;,]/)
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));

    const mailRes = await sendCustomAlertEmail(
      'daily_compliance',
      `[Pondera Kota Uyarısı] ${alerts.length} Kalemde Kritik Kota / ИРС(РНП) Azaldı (${msk.dateDisplay})`,
      html,
      customTo.length > 0 ? { to: customTo } : undefined
    );
    emailSent = mailRes.ok;
  }

  if (telegramSent || emailSent) {
    db.prepare(
      'UPDATE quota_alert_settings SET last_alert_hash = ?, last_alert_at = ? WHERE id = 1'
    ).run(fingerprint, nowDisplay);
  }

  return {
    ok: true,
    alertCount: alerts.length,
    telegramSent,
    emailSent,
    detail: `Kritik kota uyarısı işlendi (${alerts.length} kalem • TG: ${telegramSent ? 'Gönderildi' : 'Atlandı'}, E-Posta: ${emailSent ? 'Gönderildi' : 'Atlandı'}).`,
  };
}

