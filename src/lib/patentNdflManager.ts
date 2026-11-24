import * as XLSX from 'xlsx';
import type { getDb } from '@/lib/db';

type DbLike = ReturnType<typeof getDb>;

export interface PatentNdflRecord {
  id?: number;
  tax_year: number;
  org_name: string;
  tabel_no: string;
  full_name: string;
  citizenship: string;
  is_active: number; // 1 = active, 0 = dismissed
  site_name: string;
  region: string;
  hire_date: string;
  exit_date: string;
  has_notification: number;
  notification_no: string;
  notification_date: string;
  ifns_code: string;
  application_date: string;
  application_status: string;
  ndfl_before_offset: number;
  patent_advances: number;
  patent_offset_used: number;
  patent_advance_balance: number;
  additional_offset_potential: number;
  ndfl_withheld: number;
  discrepancy_amount: number;
  priority_label: string;
  recommended_action: string;
  responsible_person: string;
  manual_status: string;
  notes: string;
  excluded_region_change?: number; // 1 = changed region / used offset elsewhere this year (excluded from plan)
  root_cause?: string;
  source_file: string;
  updated_at?: string;
}

export type PatentRootCause =
  | 'NO_NOTIFICATION'
  | 'REGION_CHANGED'
  | 'LATE_NOTIFICATION_VOZVRAT'
  | 'LOW_NDFL'
  | 'FULL_OFFSET';

export function classifyPatentRootCause(r: {
  has_notification: number;
  excluded_region_change?: number;
  application_status?: string;
  recommended_action?: string;
  notes?: string;
  patent_advances: number;
  ndfl_before_offset: number;
  patent_offset_used: number;
  patent_advance_balance: number;
  additional_offset_potential: number;
  ndfl_withheld: number;
}): PatentRootCause {
  const combinedText = `${r.application_status || ''} ${r.recommended_action || ''} ${r.notes || ''}`.toLowerCase();
  if (
    r.excluded_region_change === 1 ||
    /другой регион|другого агента|другом регионе|смена региона|повторное уведомление|bölge değiş/i.test(combinedText)
  ) {
    return 'REGION_CHANGED';
  }
  if (!r.has_notification) {
    return 'NO_NOTIFICATION';
  }
  if (Number(r.additional_offset_potential || 0) > 0) {
    return 'LATE_NOTIFICATION_VOZVRAT';
  }
  if (
    Number(r.patent_advance_balance || 0) > 0 &&
    Number(r.ndfl_before_offset || 0) > 0 &&
    Number(r.patent_advances || 0) > Number(r.ndfl_before_offset || 0)
  ) {
    return 'LOW_NDFL';
  }
  return 'FULL_OFFSET';
}

export interface PatentNdflDiscrepancy {
  id?: number;
  tax_year: number;
  tabel_no: string;
  full_name: string;
  period_date: string;
  source_doc: string;
  amount_outside_payroll: number;
  offset_amount: number;
  unexplained_amount: number;
  action_note: string;
}

export interface PatentODataConfig {
  odataUrl: string;
  username: string;
  password: string;
  orgFilter: string;
  taxYear: number;
  lastSyncAt: string;
  lastSyncMessage: string;
}

export const PATENT_RATES_2026: Array<{ region: string; siteHint: string; monthlyRub: number }> = [
  { region: 'Москва', siteHint: 'Merkez Ofis', monthlyRub: 8900 },
  { region: 'Московская область', siteHint: 'Moskova Bölgesi', monthlyRub: 8900 },
  { region: 'Санкт-Петербург / Ленинградская обл.', siteHint: 'Ust-Luga / IZP', monthlyRub: 6000 },
  { region: 'Республика Татарстан', siteHint: 'Kazan / Nizhnekamsk', monthlyRub: 7500 },
  { region: 'Амурская область', siteHint: 'Svobodny-AGHK / Amur', monthlyRub: 9600 },
  { region: 'Тюменская область', siteHint: 'Tobolsk / DGP', monthlyRub: 9400 },
  { region: 'Иркутская область', siteHint: 'Irkutsk / Ust-Kut', monthlyRub: 10900 },
  { region: 'Мурманская область', siteHint: 'Murmansk', monthlyRub: 9100 },
  { region: 'Нижегородская область', siteHint: 'Nizhny Novgorod / Kstovo', monthlyRub: 8200 },
];

export function ensurePatentNdflTables(db: DbLike): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patent_ndfl_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_year INTEGER NOT NULL DEFAULT 2026,
      org_name TEXT DEFAULT '',
      tabel_no TEXT DEFAULT '',
      full_name TEXT NOT NULL,
      norm_name TEXT NOT NULL,
      citizenship TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      site_name TEXT DEFAULT '',
      region TEXT DEFAULT '',
      hire_date TEXT DEFAULT '',
      exit_date TEXT DEFAULT '',
      has_notification INTEGER DEFAULT 0,
      notification_no TEXT DEFAULT '',
      notification_date TEXT DEFAULT '',
      ifns_code TEXT DEFAULT '',
      application_date TEXT DEFAULT '',
      application_status TEXT DEFAULT '',
      ndfl_before_offset REAL DEFAULT 0,
      patent_advances REAL DEFAULT 0,
      patent_offset_used REAL DEFAULT 0,
      patent_advance_balance REAL DEFAULT 0,
      additional_offset_potential REAL DEFAULT 0,
      ndfl_withheld REAL DEFAULT 0,
      discrepancy_amount REAL DEFAULT 0,
      priority_label TEXT DEFAULT '',
      recommended_action TEXT DEFAULT '',
      responsible_person TEXT DEFAULT '',
      manual_status TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      excluded_region_change INTEGER DEFAULT 0,
      source_file TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tax_year, norm_name)
    );
    CREATE INDEX IF NOT EXISTS idx_patent_ndfl_year ON patent_ndfl_records(tax_year);
    CREATE INDEX IF NOT EXISTS idx_patent_ndfl_notif ON patent_ndfl_records(has_notification);

    CREATE TABLE IF NOT EXISTS patent_ndfl_monthly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_year INTEGER NOT NULL DEFAULT 2026,
      norm_name TEXT NOT NULL,
      month_num INTEGER NOT NULL,
      patent_paid REAL DEFAULT 0,
      ndfl_calc REAL DEFAULT 0,
      offset_used REAL DEFAULT 0,
      ndfl_withheld REAL DEFAULT 0,
      UNIQUE(tax_year, norm_name, month_num)
    );

    CREATE TABLE IF NOT EXISTS patent_ndfl_discrepancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_year INTEGER NOT NULL DEFAULT 2026,
      tabel_no TEXT DEFAULT '',
      full_name TEXT DEFAULT '',
      period_date TEXT DEFAULT '',
      source_doc TEXT DEFAULT '',
      amount_outside_payroll REAL DEFAULT 0,
      offset_amount REAL DEFAULT 0,
      unexplained_amount REAL DEFAULT 0,
      action_note TEXT DEFAULT ''
    );
  `);
  try {
    db.exec('ALTER TABLE patent_ndfl_records ADD COLUMN excluded_region_change INTEGER DEFAULT 0');
  } catch {}
}

function normName(s: any): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/\s+/g, ' ');
}

function toNum(v: any): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v ?? '')
    .replace(/\s+/g, '')
    .replace(/₽|руб\.?/gi, '')
    .replace(',', '.')
    .trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function toBoolActive(v: any, exitDate = ''): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true', 'да', 'yes', '1', 'работает', 'mevcut', 'aktif'].includes(s)) return 1;
  if (['false', 'нет', 'no', '0', 'уволен', 'çıkış', 'cikis'].includes(s)) return 0;
  if (exitDate && exitDate.trim().length >= 8) return 0;
  return 1;
}

function findCol(headers: string[], patterns: RegExp[]): number {
  for (const pat of patterns) {
    const idx = headers.findIndex((h) => pat.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function upsertPatentNdflRecord(db: DbLike, rec: PatentNdflRecord): void {
  ensurePatentNdflTables(db);
  const nn = normName(rec.full_name);
  if (!nn) return;

  const advances = Math.max(0, Number(rec.patent_advances || 0));
  const used = Math.max(0, Number(rec.patent_offset_used || 0));
  const ndfl = Math.max(0, Number(rec.ndfl_before_offset || 0));
  const balance = rec.patent_advance_balance > 0 ? rec.patent_advance_balance : Math.max(0, advances - used);
  const maxOffset = Math.min(advances, ndfl > 0 ? ndfl : advances);
  const potential =
    rec.additional_offset_potential > 0
      ? rec.additional_offset_potential
      : Math.max(0, Math.min(balance, Math.max(0, ndfl - used, maxOffset - used)));
  const hasNotif = rec.has_notification || (rec.notification_no && rec.notification_no.trim().length > 0) ? 1 : 0;

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

  db.prepare(`
    INSERT INTO patent_ndfl_records (
      tax_year, org_name, tabel_no, full_name, norm_name, citizenship, is_active,
      site_name, region, hire_date, exit_date,
      has_notification, notification_no, notification_date, ifns_code,
      application_date, application_status,
      ndfl_before_offset, patent_advances, patent_offset_used, patent_advance_balance,
      additional_offset_potential, ndfl_withheld, discrepancy_amount,
      priority_label, recommended_action, responsible_person, manual_status, notes, source_file, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tax_year, norm_name) DO UPDATE SET
      org_name = COALESCE(NULLIF(excluded.org_name, ''), patent_ndfl_records.org_name),
      tabel_no = COALESCE(NULLIF(excluded.tabel_no, ''), patent_ndfl_records.tabel_no),
      citizenship = COALESCE(NULLIF(excluded.citizenship, ''), patent_ndfl_records.citizenship),
      is_active = excluded.is_active,
      site_name = COALESCE(NULLIF(excluded.site_name, ''), patent_ndfl_records.site_name),
      region = COALESCE(NULLIF(excluded.region, ''), patent_ndfl_records.region),
      hire_date = COALESCE(NULLIF(excluded.hire_date, ''), patent_ndfl_records.hire_date),
      exit_date = COALESCE(NULLIF(excluded.exit_date, ''), patent_ndfl_records.exit_date),
      has_notification = MAX(patent_ndfl_records.has_notification, excluded.has_notification),
      notification_no = COALESCE(NULLIF(excluded.notification_no, ''), patent_ndfl_records.notification_no),
      notification_date = COALESCE(NULLIF(excluded.notification_date, ''), patent_ndfl_records.notification_date),
      ifns_code = COALESCE(NULLIF(excluded.ifns_code, ''), patent_ndfl_records.ifns_code),
      application_date = COALESCE(NULLIF(excluded.application_date, ''), patent_ndfl_records.application_date),
      application_status = COALESCE(NULLIF(excluded.application_status, ''), patent_ndfl_records.application_status),
      ndfl_before_offset = CASE WHEN excluded.ndfl_before_offset > 0 THEN excluded.ndfl_before_offset ELSE patent_ndfl_records.ndfl_before_offset END,
      patent_advances = CASE WHEN excluded.patent_advances > 0 THEN excluded.patent_advances ELSE patent_ndfl_records.patent_advances END,
      patent_offset_used = CASE WHEN excluded.patent_offset_used > 0 THEN excluded.patent_offset_used ELSE patent_ndfl_records.patent_offset_used END,
      patent_advance_balance = CASE WHEN excluded.patent_advance_balance > 0 THEN excluded.patent_advance_balance ELSE patent_ndfl_records.patent_advance_balance END,
      additional_offset_potential = CASE WHEN excluded.additional_offset_potential > 0 THEN excluded.additional_offset_potential ELSE patent_ndfl_records.additional_offset_potential END,
      ndfl_withheld = CASE WHEN excluded.ndfl_withheld > 0 THEN excluded.ndfl_withheld ELSE patent_ndfl_records.ndfl_withheld END,
      discrepancy_amount = CASE WHEN excluded.discrepancy_amount > 0 THEN excluded.discrepancy_amount ELSE patent_ndfl_records.discrepancy_amount END,
      priority_label = COALESCE(NULLIF(excluded.priority_label, ''), patent_ndfl_records.priority_label),
      recommended_action = COALESCE(NULLIF(excluded.recommended_action, ''), patent_ndfl_records.recommended_action),
      source_file = COALESCE(NULLIF(excluded.source_file, ''), patent_ndfl_records.source_file),
      updated_at = excluded.updated_at
  `).run(
    rec.tax_year || 2026,
    rec.org_name || '',
    rec.tabel_no || '',
    rec.full_name.trim(),
    nn,
    rec.citizenship || '',
    rec.is_active ? 1 : 0,
    rec.site_name || '',
    rec.region || '',
    rec.hire_date || '',
    rec.exit_date || '',
    hasNotif,
    rec.notification_no || '',
    rec.notification_date || '',
    rec.ifns_code || '',
    rec.application_date || '',
    rec.application_status || '',
    ndfl,
    advances,
    used,
    balance,
    potential,
    Math.max(0, Number(rec.ndfl_withheld || 0)),
    Math.max(0, Number(rec.discrepancy_amount || 0)),
    rec.priority_label || '',
    rec.recommended_action || '',
    rec.responsible_person || '',
    rec.manual_status || '',
    rec.notes || '',
    rec.source_file || '',
    nowStr
  );
}

export function importPatentNdflWorkbook(
  db: DbLike,
  buffer: Buffer,
  fileName: string,
  taxYear = 2026,
  defaultOrg = ''
): { importedRecords: number; importedDiscrepancies: number; detectedSheet: string } {
  ensurePatentNdflTables(db);
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Build quick lookup from Pondera personnel table to enrich site_name / region / citizenship
  const siteByNorm = new Map<string, { site: string; region: string; uyruk: string }>();
  try {
    const pRows = db
      .prepare('SELECT sicil_no, ad_soyad, tam_adi_kiril, proje_adi, region, uyruk FROM personnel')
      .all() as any[];
    for (const p of pRows) {
      const info = {
        site: String(p.proje_adi || '').trim(),
        region: String(p.region || '').trim(),
        uyruk: String(p.uyruk || '').trim(),
      };
      if (p.tam_adi_kiril) siteByNorm.set(normName(p.tam_adi_kiril), info);
      if (p.ad_soyad) siteByNorm.set(normName(p.ad_soyad), info);
      if (p.sicil_no) siteByNorm.set(String(p.sicil_no).trim(), info);
    }
  } catch {}

  let importedRecords = 0;
  let importedDiscrepancies = 0;
  let detectedSheet = '';

  // Prioritize master sheets if multi-sheet MES workbook, otherwise scan first matching sheet
  const preferredOrder = ['Все 710', 'Все 193', 'Срочно — работают 72', 'Движения расхождений'];
  const sheetNames = [
    ...preferredOrder.filter((s) => wb.SheetNames.includes(s)),
    ...wb.SheetNames.filter((s) => !preferredOrder.includes(s)),
  ];

  let mainImported = false;

  for (const sn of sheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    if (matrix.length < 2) continue;

    // Find header row in first 5 rows
    let headerIdx = -1;
    let headers: string[] = [];
    for (let r = 0; r < Math.min(5, matrix.length); r++) {
      const rowStrs = (matrix[r] || []).map((c) => String(c || '').trim());
      if (rowStrs.some((h) => /фио|сотрудник|ad soyad|табельн/i.test(h))) {
        headerIdx = r;
        headers = rowStrs;
        break;
      }
    }
    if (headerIdx < 0) continue;

    // Check if this is the Discrepancies sheet ('Движения расхождений')
    if (/движения расхождений|расхожден/i.test(sn) && headers.some((h) => /погашение вне ведомост|источник/i.test(h))) {
      const iFio = findCol(headers, [/фио/i, /сотрудник/i]);
      const iTab = findCol(headers, [/табельн/i, /sicil/i]);
      const iDate = findCol(headers, [/дата/i]);
      const iSrc = findCol(headers, [/источник/i]);
      const iOut = findCol(headers, [/погашение вне/i]);
      const iOff = findCol(headers, [/зачёт аванс|зачет аванс/i]);
      const iUnexp = findCol(headers, [/не объяснено/i]);
      const iAct = findCol(headers, [/действие/i]);

      db.prepare('DELETE FROM patent_ndfl_discrepancies WHERE tax_year = ?').run(taxYear);
      const ins = db.prepare(`
        INSERT INTO patent_ndfl_discrepancies (
          tax_year, tabel_no, full_name, period_date, source_doc,
          amount_outside_payroll, offset_amount, unexplained_amount, action_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let r = headerIdx + 1; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const fio = String(row[iFio] || '').trim();
        if (!fio) continue;
        ins.run(
          taxYear,
          iTab >= 0 ? String(row[iTab] || '').trim() : '',
          fio,
          iDate >= 0 ? String(row[iDate] || '').trim() : '',
          iSrc >= 0 ? String(row[iSrc] || '').trim() : '',
          iOut >= 0 ? toNum(row[iOut]) : 0,
          iOff >= 0 ? toNum(row[iOff]) : 0,
          iUnexp >= 0 ? toNum(row[iUnexp]) : 0,
          iAct >= 0 ? String(row[iAct] || '').trim() : ''
        );
        importedDiscrepancies++;
      }
      continue;
    }

    // Only import the primary employee sheet per workbook (avoid double-importing sub-tabs like 'Остатки — 528' after 'Все 710')
    if (mainImported) continue;

    const iFio = findCol(headers, [/^фио/i, /сотрудник/i, /ad soyad/i, /kiril/i]);
    if (iFio < 0) continue;

    const iTab = findCol(headers, [/табельн/i, /sicil/i, /^код$/i]);
    const iCit = findCol(headers, [/гражданств/i, /uyruk/i]);
    const iAct = findCol(headers, [/работает/i, /genel durum/i, /статус/i]);
    const iSite = findCol(headers, [/шанти|proje|объект|подразделен|santiye/i]);
    const iReg = findCol(headers, [/регион|region|bölge/i]);
    const iHire = findCol(headers, [/приём|прием|işe giriş/i]);
    const iExit = findCol(headers, [/увольнен|çıkış/i]);
    const iNotifNo = findCol(headers, [/уведомление.*номер|номер уведомл/i]);
    const iNotifDt = findCol(headers, [/уведомление.*дата|дата уведомл/i]);
    const iIfns = findCol(headers, [/код ифнс|ифнс/i]);
    const iAppDt = findCol(headers, [/последнее заявление|дата заявлен/i]);
    const iAppSt = findCol(headers, [/статус заявления/i]);
    const iNdflBefore = findCol(headers, [/ндфл до зач|исчислен.*ндфл|2ндфл|^ндфл$/i]);
    const iAdv = findCol(headers, [/авансы зарегистр|авансы патент|оплата патент|patent.*öde/i]);
    const iUsed = findCol(headers, [/авансы зачтен|зачтено|mahsup edil/i]);
    const iBal = findCol(headers, [/остаток аванс|kalan avans/i]);
    const iPot = findCol(headers, [/возможный доп|потенциал|kalan zachot|fark/i]);
    const iWithheld = findCol(headers, [/ндфл удержан|удержано ндфл/i]);
    const iPrio = findCol(headers, [/приоритет/i]);
    const iRecAct = findCol(headers, [/действие бухгалт/i]);

    db.exec('BEGIN');
    try {
      for (let r = headerIdx + 1; r < matrix.length; r++) {
        const row = matrix[r] || [];
        const fullName = String(row[iFio] || '').trim();
        if (!fullName || /^итого|^всего|^toplam/i.test(fullName)) continue;

        const tabelNo = iTab >= 0 ? String(row[iTab] || '').trim() : '';
        const notifNo = iNotifNo >= 0 ? String(row[iNotifNo] || '').trim() : '';
        const exitDt = iExit >= 0 ? String(row[iExit] || '').trim() : '';
        const enriched = siteByNorm.get(normName(fullName)) || (tabelNo ? siteByNorm.get(tabelNo.split(';')[0].trim()) : undefined);

        const rec: PatentNdflRecord = {
          tax_year: taxYear,
          org_name: defaultOrg || (/мэс/i.test(fileName) ? 'ООО «Монтажэнергострой»' : 'Pondera'),
          tabel_no: tabelNo,
          full_name: fullName,
          citizenship: (iCit >= 0 ? String(row[iCit] || '').trim() : '') || enriched?.uyruk || '',
          is_active: iAct >= 0 ? toBoolActive(row[iAct], exitDt) : exitDt ? 0 : 1,
          site_name: (iSite >= 0 ? String(row[iSite] || '').trim() : '') || enriched?.site || '',
          region: (iReg >= 0 ? String(row[iReg] || '').trim() : '') || enriched?.region || '',
          hire_date: iHire >= 0 ? String(row[iHire] || '').trim() : '',
          exit_date: exitDt,
          has_notification: notifNo ? 1 : 0,
          notification_no: notifNo,
          notification_date: iNotifDt >= 0 ? String(row[iNotifDt] || '').trim() : '',
          ifns_code: iIfns >= 0 ? String(row[iIfns] || '').trim() : '',
          application_date: iAppDt >= 0 ? String(row[iAppDt] || '').trim() : '',
          application_status: iAppSt >= 0 ? String(row[iAppSt] || '').trim() : '',
          ndfl_before_offset: iNdflBefore >= 0 ? toNum(row[iNdflBefore]) : 0,
          patent_advances: iAdv >= 0 ? toNum(row[iAdv]) : 0,
          patent_offset_used: iUsed >= 0 ? toNum(row[iUsed]) : 0,
          patent_advance_balance: iBal >= 0 ? toNum(row[iBal]) : 0,
          additional_offset_potential: iPot >= 0 ? toNum(row[iPot]) : 0,
          ndfl_withheld: iWithheld >= 0 ? toNum(row[iWithheld]) : 0,
          discrepancy_amount: 0,
          priority_label: iPrio >= 0 ? String(row[iPrio] || '').trim() : '',
          recommended_action: iRecAct >= 0 ? String(row[iRecAct] || '').trim() : '',
          responsible_person: '',
          manual_status: '',
          notes: '',
          source_file: fileName,
        };
        upsertPatentNdflRecord(db, rec);
        importedRecords++;
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
    mainImported = true;
    detectedSheet = sn;
  }

  return { importedRecords, importedDiscrepancies, detectedSheet };
}

export function getPatentODataConfig(db: DbLike): PatentODataConfig {
  db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
  const row = db.prepare("SELECT value FROM system_info WHERE key = 'patent_ndfl_odata_json'").get() as { value?: string } | undefined;
  const def: PatentODataConfig = {
    odataUrl: '',
    username: '',
    password: '',
    orgFilter: '',
    taxYear: 2026,
    lastSyncAt: '',
    lastSyncMessage: '',
  };
  if (!row?.value) return def;
  try {
    return { ...def, ...JSON.parse(row.value) };
  } catch {
    return def;
  }
}

export function savePatentODataConfig(db: DbLike, incoming: Partial<PatentODataConfig>): PatentODataConfig {
  const cur = getPatentODataConfig(db);
  const nextPass =
    incoming.password !== undefined && incoming.password !== '' && incoming.password !== '••••••••'
      ? String(incoming.password)
      : cur.password;
  const merged: PatentODataConfig = {
    odataUrl: String(incoming.odataUrl ?? cur.odataUrl).trim().replace(/\/+$/, ''),
    username: String(incoming.username ?? cur.username).trim(),
    password: nextPass,
    orgFilter: String(incoming.orgFilter ?? cur.orgFilter).trim(),
    taxYear: Number(incoming.taxYear ?? cur.taxYear) || 2026,
    lastSyncAt: String(incoming.lastSyncAt ?? cur.lastSyncAt),
    lastSyncMessage: String(incoming.lastSyncMessage ?? cur.lastSyncMessage),
  };
  db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
  db.prepare(
    `INSERT INTO system_info (key, value) VALUES ('patent_ndfl_odata_json', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(merged));
  return merged;
}

export function encodeWindows1251(str: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code >= 0x0410 && code <= 0x044f) {
      bytes.push(code - 0x0410 + 0xc0);
    } else if (code === 0x0401) {
      bytes.push(0xa8); // Ё
    } else if (code === 0x0451) {
      bytes.push(0xb8); // ё
    } else if (code === 0x2116) {
      bytes.push(0xb9); // №
    } else if (code === 0x00ab) {
      bytes.push(0xab); // «
    } else if (code === 0x00bb) {
      bytes.push(0xbb); // »
    } else if (code === 0x2013 || code === 0x2014) {
      bytes.push(0x2d); // -
    } else {
      bytes.push(0x3f); // ?
    }
  }
  return Buffer.from(bytes);
}

function xmlEsc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toRuDateDot(raw: string): string {
  const s = String(raw || '').trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}

export function buildFnsKnd1110055Xml(
  db: DbLike,
  params: {
    taxYear: number;
    kodNO: string;
    appNo: string;
    orgName: string;
    innUl: string;
    kpp: string;
    signerInn: string;
    signerFam: string;
    signerNam: string;
    recordIds?: number[];
  }
): { fileName: string; buffer: Buffer; includedCount: number; skippedMissingInn: number } {
  ensurePatentNdflTables(db);
  const allRows = db
    .prepare('SELECT * FROM patent_ndfl_records WHERE tax_year = ? AND has_notification = 0 AND COALESCE(excluded_region_change, 0) = 0')
    .all(params.taxYear) as any[];

  const targetRows =
    Array.isArray(params.recordIds) && params.recordIds.length > 0
      ? allRows.filter((r) => params.recordIds!.includes(Number(r.id)))
      : allRows;

  // Build personnel lookup for INN, Birth Date, Passport No, Issue Date, Issued By
  const personMap = new Map<
    string,
    { inn: string; bdate: string; passNo: string; passDate: string; passBy: string }
  >();
  try {
    const pRows = db
      .prepare(
        `SELECT p.sicil_no, p.ad_soyad, p.tam_adi_kiril, p.dogum_tarihi, p.pasaport_no, p.inn_no, p.all_data_json,
                v.verified_inn
         FROM personnel p
         LEFT JOIN inn_snils_verifications v ON TRIM(v.sicil_no) = TRIM(p.sicil_no)`
      )
      .all() as any[];
    for (const p of pRows) {
      let passDate = '';
      let passBy = '';
      if (p.all_data_json) {
        try {
          const parsed = JSON.parse(p.all_data_json);
          passDate = String(
            parsed['Pasaport Düzenleme Tarihi'] || parsed['Pasaport Veriliş Tarihi'] || ''
          ).trim();
          passBy = String(parsed['Pasaport Veren Makam'] || '').trim();
        } catch {}
      }
      const info = {
        inn: String(p.verified_inn || p.inn_no || '').replace(/\D/g, ''),
        bdate: toRuDateDot(String(p.dogum_tarihi || '')),
        passNo: String(p.pasaport_no || '').trim(),
        passDate: toRuDateDot(passDate),
        passBy,
      };
      if (p.tam_adi_kiril) personMap.set(normName(p.tam_adi_kiril), info);
      if (p.ad_soyad) personMap.set(normName(p.ad_soyad), info);
      if (p.sicil_no) personMap.set(String(p.sicil_no).trim(), info);
    }
  } catch {}

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const dateDot = `${dd}.${mm}.${yyyy}`;
  const dateCompact = `${yyyy}${mm}${dd}`;
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

  const kodNO = (params.kodNO || '4707').trim();
  const innUl = (params.innUl || '7702424557').trim();
  const kpp = (params.kpp || '470745001').trim();
  const idFile = `SR_ZPRUMNAL_${kodNO}_${kodNO}_${innUl}${kpp}_${dateCompact}_${uuid}`;

  const personXmlNodes: string[] = [];
  let skippedMissingInn = 0;

  for (const r of targetRows) {
    const info =
      personMap.get(normName(r.full_name)) ||
      (r.tabel_no ? personMap.get(String(r.tabel_no).split(';')[0].trim()) : undefined);
    const inn = info?.inn || '';
    const parts = String(r.full_name || '')
      .trim()
      .split(/\s+/);
    const fam = parts[0] || '';
    const nam = parts[1] || '';
    const otch = parts.slice(2).join(' ');
    if (!fam || !nam) continue;
    if (!inn) skippedMissingInn++;

    const innAttr = inn ? ` ИННФЛ="${xmlEsc(inn)}"` : '';
    const bdateAttr = info?.bdate ? ` ДатаРожд="${xmlEsc(info.bdate)}"` : '';
    const otchAttr = otch ? ` Отчество="${xmlEsc(otch)}"` : '';
    const docAttrs = [
      'КодВидДок="10"',
      info?.passNo ? `СерНомДок=" ${xmlEsc(info.passNo)}"` : 'СерНомДок=""',
      info?.passDate ? `ДатаДок="${xmlEsc(info.passDate)}"` : '',
      info?.passBy ? `ВыдДок="${xmlEsc(info.passBy)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');

    personXmlNodes.push(
      `\t\t\t\t<СвНПФЛ${innAttr}${bdateAttr}>\r\n` +
        `\t\t\t\t\t<ФИО Фамилия="${xmlEsc(fam)}" Имя="${xmlEsc(nam)}"${otchAttr}/>\r\n` +
        `\t\t\t\t\t<УдЛичнФЛ ${docAttrs}/>\r\n` +
        `\t\t\t\t</СвНПФЛ>`
    );
  }

  const xml =
    `<?xml version="1.0" encoding="windows-1251"?>\r\n` +
    `<Файл xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ВерсФорм="5.01" ВерсПрог="Pondera HR" ИдФайл="${xmlEsc(idFile)}">\r\n` +
    `\t<Документ КНД="1110055" ДатаДок="${dateDot}" НомЗаяв="${xmlEsc(params.appNo || '1')}" КодНО="${xmlEsc(kodNO)}">\r\n` +
    `\t\t<СвНП>\r\n` +
    `\t\t\t<НПЮЛ НаимОрг="${xmlEsc(params.orgName)}" ИННЮЛ="${xmlEsc(innUl)}" КПП="${xmlEsc(kpp)}"/>\r\n` +
    `\t\t</СвНП>\r\n` +
    `\t\t<Подписант ПрПодп="1" ИННФЛ="${xmlEsc(params.signerInn)}">\r\n` +
    `\t\t\t<ФИО Фамилия="${xmlEsc(params.signerFam)}" Имя="${xmlEsc(params.signerNam)}"/>\r\n` +
    `\t\t</Подписант>\r\n` +
    `\t\t<ЗаявПрвУмНал ГодУмНал="${params.taxYear}">\r\n` +
    `\t\t\t<СвНППртд>\r\n` +
    personXmlNodes.join('\r\n') +
    `\r\n\t\t\t</СвНППртд>\r\n` +
    `\t\t</ЗаявПрвУмНал>\r\n` +
    `\t</Документ>\r\n` +
    `</Файл>\r\n`;

  return {
    fileName: `${idFile}.XML`,
    buffer: encodeWindows1251(xml),
    includedCount: personXmlNodes.length,
    skippedMissingInn,
  };
}

async function fetchODataPaged(
  base: string,
  entityPath: string,
  headers: Record<string, string>,
  maxPages = 25
): Promise<any[]> {
  const all: any[] = [];
  const sep = entityPath.includes('?') ? '&' : '?';
  for (let page = 0; page < maxPages; page++) {
    const url = `${base}/${entityPath}${sep}$top=1000&$skip=${page * 1000}&$format=json`;
    const res = await fetch(url, { headers }).catch(() => null);
    if (!res || !res.ok) break;
    const json: any = await res.json().catch(() => null);
    const rows = Array.isArray(json?.value) ? json.value : [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

export async function syncPatentNdflFromOData(db: DbLike): Promise<{ success: boolean; synced: number; message: string }> {
  const cfg = getPatentODataConfig(db);
  if (!cfg.odataUrl || !cfg.username || !cfg.password) {
    return { success: false, synced: 0, message: '1C ZUP OData URL, kullanıcı adı ve şifre bilgileri eksik.' };
  }
  const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  const headers = { Authorization: auth, Accept: 'application/json' };
  const base = cfg.odataUrl.replace(/\/+$/, '');
  const year = cfg.taxYear || 2026;
  const yearStart = `${year}-01-01T00:00:00`;
  const yearEnd = `${year + 1}-01-01T00:00:00`;

  try {
    // 1. Fetch OData service document to verify auth & discover exact 1C:ZUP 3.1 entity names
    const svcRes = await fetch(`${base}/?$format=json`, { headers });
    if (!svcRes.ok) {
      const msg = `1C OData bağlantısı reddedildi (HTTP ${svcRes.status}). URL ve yetkileri kontrol edin.`;
      savePatentODataConfig(db, { lastSyncMessage: msg });
      return { success: false, synced: 0, message: msg };
    }
    const svcJson: any = await svcRes.json().catch(() => ({}));
    const entityNames: string[] = (svcJson?.value || []).map((v: any) => String(v?.name || v?.url || ''));
    const hasEntity = (name: string) => entityNames.includes(name);
    const findEntity = (re: RegExp) => entityNames.find((n) => re.test(n)) || '';

    // 2. Fetch Employees (Catalog_Сотрудники)
    const empRows = await fetchODataPaged(
      base,
      'Catalog_Сотрудники?$select=Ref_Key,Code,Description,ФизическоеЛицо_Key,ВАрхиве',
      headers,
      15
    );
    const empByFiz = new Map<string, { code: string; name: string; active: boolean }>();
    const fizByEmpRef = new Map<string, string>();
    for (const e of empRows) {
      const fk = String(e.ФизическоеЛицо_Key || '').trim();
      const ref = String(e.Ref_Key || '').trim();
      const code = String(e.Code || '').trim();
      const desc = String(e.Description || '').trim();
      const active = !Boolean(e.ВАрхиве);
      if (ref && fk) fizByEmpRef.set(ref, fk);
      if (!fk || !desc) continue;
      const prev = empByFiz.get(fk);
      if (!prev || (active && !prev.active)) {
        empByFiz.set(fk, {
          code: prev?.code && prev.code !== code ? `${prev.code}; ${code}` : code,
          name: desc,
          active: active || Boolean(prev?.active),
        });
      }
    }

    type Agg = {
      adv: number;
      used: number;
      ndflCalc: number;
      ndflWithheld: number;
      notifNo: string;
      notifDate: string;
      ifns: string;
      appDate: string;
      appStatus: string;
    };
    const byFiz = new Map<string, Agg>();
    const ensureAgg = (fk: string): Agg => {
      let cur = byFiz.get(fk);
      if (!cur) {
        cur = {
          adv: 0,
          used: 0,
          ndflCalc: 0,
          ndflWithheld: 0,
          notifNo: '',
          notifDate: '',
          ifns: '',
          appDate: '',
          appStatus: '',
        };
        byFiz.set(fk, cur);
      }
      return cur;
    };

    // 3. FNS Notifications (InformationRegister_РеквизитыУведомленияИФНСНаЗачетАвансовыхПлатежей)
    const notifEntity =
      (hasEntity('InformationRegister_РеквизитыУведомленияИФНСНаЗачетАвансовыхПлатежей')
        ? 'InformationRegister_РеквизитыУведомленияИФНСНаЗачетАвансовыхПлатежей'
        : findEntity(/InformationRegister_.*Уведомлени.*Аванс/i)) || '';
    let notifCount = 0;
    if (notifEntity) {
      const nRows = await fetchODataPaged(base, `${notifEntity}?$filter=Год eq ${year}`, headers, 5);
      for (const row of nRows) {
        const fk = String(row.ФизическоеЛицо_Key || '').trim();
        if (!fk) continue;
        const cur = ensureAgg(fk);
        cur.notifNo = String(row.НомерУведомления || row.Номер || cur.notifNo || '').trim();
        const dtRaw = String(row.ДатаУведомления || row.Дата || '');
        if (dtRaw && !dtRaw.startsWith('0001')) cur.notifDate = dtRaw.slice(0, 10);
        cur.ifns = String(row.КодНалоговогоОргана || row.КодИФНС || cur.ifns || '').trim();
        notifCount++;
      }
    }

    // 4. FNS Applications (Document_ЗаявлениеОПодтвержденииПраваНаЗачетАвансовПоНДФЛ + _Сотрудники)
    const appDocEntity = hasEntity('Document_ЗаявлениеОПодтвержденииПраваНаЗачетАвансовПоНДФЛ')
      ? 'Document_ЗаявлениеОПодтвержденииПраваНаЗачетАвансовПоНДФЛ'
      : '';
    const appEmpEntity = hasEntity('Document_ЗаявлениеОПодтвержденииПраваНаЗачетАвансовПоНДФЛ_Сотрудники')
      ? 'Document_ЗаявлениеОПодтвержденииПраваНаЗачетАвансовПоНДФЛ_Сотрудники'
      : '';
    let appCount = 0;
    if (appDocEntity && appEmpEntity) {
      const docs = await fetchODataPaged(base, `${appDocEntity}?$filter=НалоговыйПериод eq ${year}`, headers, 2);
      const docDateByRef = new Map<string, string>();
      for (const d of docs) {
        if (d.Ref_Key && !d.DeletionMark) {
          docDateByRef.set(String(d.Ref_Key), String(d.Date || '').slice(0, 10));
        }
      }
      if (docDateByRef.size > 0) {
        const appRows = await fetchODataPaged(base, appEmpEntity, headers, 5);
        for (const r of appRows) {
          const docDt = docDateByRef.get(String(r.Ref_Key || ''));
          if (!docDt) continue;
          const fk =
            String(r.ФизическоеЛицо_Key || '').trim() ||
            fizByEmpRef.get(String(r.Сотрудник_Key || '').trim()) ||
            '';
          if (!fk) continue;
          const cur = ensureAgg(fk);
          if (!cur.appDate || docDt > cur.appDate) cur.appDate = docDt;
          cur.appStatus = 'Включён в заявление 1С';
          appCount++;
        }
      }
    }

    // 5. Registered Patent Advances (Document_АвансовыйПлатежПоНДФЛ or AccumulationRegister_*Аванс*НДФЛ*_RecordType)
    const advDocEntity = hasEntity('Document_АвансовыйПлатежПоНДФЛ')
      ? 'Document_АвансовыйПлатежПоНДФЛ'
      : findEntity(/^Document_АвансовыйПлатежПоНДФЛ/i);
    let advDocCount = 0;
    if (advDocEntity) {
      const aDocs = await fetchODataPaged(
        base,
        `${advDocEntity}?$filter=Date ge datetime'${yearStart}' and Date lt datetime'${yearEnd}'`,
        headers,
        10
      );
      for (const d of aDocs) {
        if (d.DeletionMark || d.Posted === false) continue;
        const fk =
          String(d.ФизическоеЛицо_Key || '').trim() ||
          fizByEmpRef.get(String(d.Сотрудник_Key || '').trim()) ||
          '';
        if (!fk) continue;
        const cur = ensureAgg(fk);
        cur.adv += toNum(d.Сумма || d.СуммаПлатежа || d.СуммаАвансовогоПлатежа);
        advDocCount++;
      }
    }

    // 6. AccumulationRegister_РасчетыНалогоплательщиковСБюджетомПоНДФЛ_RecordType (Offset Used, Calculated & Withheld NDFL)
    const ndflRegEntity =
      (hasEntity('AccumulationRegister_РасчетыНалогоплательщиковСБюджетомПоНДФЛ_RecordType')
        ? 'AccumulationRegister_РасчетыНалогоплательщиковСБюджетомПоНДФЛ_RecordType'
        : findEntity(/AccumulationRegister_РасчетыНалогоплательщиковСБюджетомПоНДФЛ/i)) || '';
    if (ndflRegEntity) {
      const regRows = await fetchODataPaged(
        base,
        `${ndflRegEntity}?$filter=Active eq true and Period ge datetime'${yearStart}' and Period lt datetime'${yearEnd}'`,
        headers,
        35
      );
      for (const row of regRows) {
        const fk = String(row.ФизическоеЛицо_Key || '').trim();
        if (!fk || !byFiz.has(fk)) continue;
        const cur = byFiz.get(fk)!;
        const recType = String(row.RecordType || '').toLowerCase();
        const amt = toNum(row.Сумма);
        const isAdvanceOffset = Boolean(row.ЗачтеноАвансов) || /аванс|патент/i.test(String(row.ВидСтроки || row.СпособЗачета || ''));
        if (recType === 'receipt') {
          cur.ndflCalc += amt;
        } else if (recType === 'expense') {
          if (isAdvanceOffset) cur.used += amt;
          else cur.ndflWithheld += amt;
        }
        if (row.СуммаЗачтенногоАванса) cur.used += toNum(row.СуммаЗачтенногоАванса);
      }
    }

    let synced = 0;
    db.exec('BEGIN');
    try {
      for (const [fk, vals] of Array.from(byFiz.entries())) {
        const emp = empByFiz.get(fk);
        if (!emp?.name) continue;
        const balance = Math.max(0, vals.adv - vals.used);
        const potential = Math.max(0, Math.min(balance, Math.max(0, vals.ndflCalc - vals.used)));
        upsertPatentNdflRecord(db, {
          tax_year: year,
          org_name: cfg.orgFilter || '1C OData',
          tabel_no: emp.code,
          full_name: emp.name,
          citizenship: '',
          is_active: emp.active ? 1 : 0,
          site_name: '',
          region: '',
          hire_date: '',
          exit_date: '',
          has_notification: vals.notifNo ? 1 : 0,
          notification_no: vals.notifNo,
          notification_date: vals.notifDate,
          ifns_code: vals.ifns,
          application_date: vals.appDate,
          application_status: vals.appStatus,
          ndfl_before_offset: vals.ndflCalc,
          patent_advances: vals.adv,
          patent_offset_used: vals.used,
          patent_advance_balance: balance,
          additional_offset_potential: potential,
          ndfl_withheld: vals.ndflWithheld,
          discrepancy_amount: 0,
          priority_label: '',
          recommended_action: '',
          responsible_person: '',
          manual_status: '',
          notes: '',
          source_file: '1C:Fresh OData',
        });
        synced++;
      }
      db.exec('COMMIT');
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw e;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const msg = `1C OData senkronizasyonu tamamlandı: ${synced} patentli çalışan güncellendi (Bildirim: ${notifCount}, Başvuru: ${appCount}, Avans Belgesi: ${advDocCount}).`;
    savePatentODataConfig(db, { lastSyncAt: nowStr, lastSyncMessage: msg });
    return { success: true, synced, message: msg };
  } catch (err: any) {
    const msg = `1C OData bağlantı hatası: ${err?.message || String(err)}`;
    savePatentODataConfig(db, { lastSyncMessage: msg });
    return { success: false, synced: 0, message: msg };
  }
}
