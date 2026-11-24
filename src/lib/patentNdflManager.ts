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
  source_file: string;
  updated_at?: string;
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
      source_file TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tax_year, norm_name)
    );
    CREATE INDEX IF NOT EXISTS idx_patent_ndfl_year ON patent_ndfl_records(tax_year);
    CREATE INDEX IF NOT EXISTS idx_patent_ndfl_notif ON patent_ndfl_records(has_notification);

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

export async function syncPatentNdflFromOData(db: DbLike): Promise<{ success: boolean; synced: number; message: string }> {
  const cfg = getPatentODataConfig(db);
  if (!cfg.odataUrl || !cfg.username || !cfg.password) {
    return { success: false, synced: 0, message: '1C ZUP OData URL, kullanıcı adı ve şifre bilgileri eksik.' };
  }
  const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  const headers = { Authorization: auth, Accept: 'application/json' };
  const base = cfg.odataUrl.replace(/\/+$/, '');
  const yearStart = `${cfg.taxYear}-01-01T00:00:00`;

  try {
    // 1. Test OData connectivity via Catalog_Сотрудники (top 1)
    const testRes = await fetch(`${base}/Catalog_Сотрудники?$top=1&$format=json`, { headers });
    if (!testRes.ok) {
      const msg = `1C OData bağlantısı reddedildi (HTTP ${testRes.status}). URL ve yetkileri kontrol edin.`;
      savePatentODataConfig(db, { lastSyncMessage: msg });
      return { success: false, synced: 0, message: msg };
    }

    // 2. Fetch Patent Advance Payments register + FNS Notifications
    const [advRes, notifRes, empRes] = await Promise.all([
      fetch(`${base}/AccumulationRegister_АвансовыеПлатежиПоНДФЛ?$filter=Period ge datetime'${yearStart}'&$format=json`, { headers }).catch(() => null),
      fetch(`${base}/Document_АвансовыйПлатежПоНДФЛ?$filter=Date ge datetime'${yearStart}'&$format=json`, { headers }).catch(() => null),
      fetch(`${base}/Catalog_Сотрудники?$select=Ref_Key,Code,Description,ФизическоеЛицо_Key&$format=json`, { headers }).catch(() => null),
    ]);

    const empMap = new Map<string, { code: string; name: string }>();
    if (empRes && empRes.ok) {
      const empJson: any = await empRes.json().catch(() => ({}));
      for (const e of empJson?.value || []) {
        if (e.ФизическоеЛицо_Key) {
          empMap.set(String(e.ФизическоеЛицо_Key), { code: String(e.Code || ''), name: String(e.Description || '') });
        }
      }
    }

    const byFiz = new Map<string, { adv: number; used: number; notifNo: string; notifDate: string }>();
    if (advRes && advRes.ok) {
      const advJson: any = await advRes.json().catch(() => ({}));
      for (const row of advJson?.value || []) {
        const fk = String(row.ФизическоеЛицо_Key || '');
        if (!fk) continue;
        const cur = byFiz.get(fk) || { adv: 0, used: 0, notifNo: '', notifDate: '' };
        const amt = toNum(row.Сумма);
        if (String(row.RecordType || '').toLowerCase() === 'expense') cur.used += amt;
        else cur.adv += amt;
        byFiz.set(fk, cur);
      }
    }

    if (notifRes && notifRes.ok) {
      const nJson: any = await notifRes.json().catch(() => ({}));
      for (const row of nJson?.value || []) {
        const fk = String(row.ФизическоеЛицо_Key || '');
        if (!fk) continue;
        const cur = byFiz.get(fk) || { adv: 0, used: 0, notifNo: '', notifDate: '' };
        if (row.НомерУведомления) cur.notifNo = String(row.НомерУведомления);
        if (row.ДатаУведомления) cur.notifDate = String(row.ДатаУведомления).slice(0, 10);
        byFiz.set(fk, cur);
      }
    }

    let synced = 0;
    for (const [fk, vals] of Array.from(byFiz.entries())) {
      const emp = empMap.get(fk);
      if (!emp?.name) continue;
      upsertPatentNdflRecord(db, {
        tax_year: cfg.taxYear,
        org_name: cfg.orgFilter || '1C OData',
        tabel_no: emp.code,
        full_name: emp.name,
        citizenship: '',
        is_active: 1,
        site_name: '',
        region: '',
        hire_date: '',
        exit_date: '',
        has_notification: vals.notifNo ? 1 : 0,
        notification_no: vals.notifNo,
        notification_date: vals.notifDate,
        ifns_code: '',
        application_date: '',
        application_status: '',
        ndfl_before_offset: 0,
        patent_advances: vals.adv,
        patent_offset_used: vals.used,
        patent_advance_balance: Math.max(0, vals.adv - vals.used),
        additional_offset_potential: Math.max(0, vals.adv - vals.used),
        ndfl_withheld: 0,
        discrepancy_amount: 0,
        priority_label: '',
        recommended_action: '',
        responsible_person: '',
        manual_status: '',
        notes: '',
        source_file: '1C ZUP OData',
      });
      synced++;
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const msg = `1C OData senkronizasyonu tamamlandı: ${synced} patentli çalışan güncellendi.`;
    savePatentODataConfig(db, { lastSyncAt: nowStr, lastSyncMessage: msg });
    return { success: true, synced, message: msg };
  } catch (err: any) {
    const msg = `1C OData bağlantı hatası: ${err?.message || String(err)}`;
    savePatentODataConfig(db, { lastSyncMessage: msg });
    return { success: false, synced: 0, message: msg };
  }
}
