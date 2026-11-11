import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { classifyWorkPermitFromRow, buildNormalizedDateSql } from '@/lib/workPermits';
import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';
import { formatSystemTimestampToMsk, getCurrentMskTimestamp } from '@/lib/interSiteTransfers';

export interface ZupOfficialRecord {
  id?: number;
  row_no: number;
  fio_kiril: string;
  gender: string;
  birth_date: string;
  tabel_no: string;
  norm_sicil: string;
  position_ru: string;
  hire_date: string;
  tax_status: string;
  permit_category: string;
  citizenship_ru: string;
  citizenship_tr: string;
  inn: string;
  snils: string;
  doc_no: string;
  doc_series: string;
  doc_issued_by: string;
  doc_dept_code: string;
  doc_issue_date: string;
  schedule: string;
  zup_department?: string;
  work_state?: string;
  insured_status?: string;
}

export function extractZupReportDate(
  fileName: string,
  rawRows?: any[][],
  fallback?: string
): string {
  const defaultFallback =
    fallback ||
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
  const cleanName = String(fileName || '').replace(/\.[^.]+$/, '');
  // Match DD.MM.YYYY, DD_MM_YYYY, DD MM YYYY, or typo DD MM 206 -> 2026
  const mFull = cleanName.match(/(\d{2})[\s._-]+(\d{2})[\s._-]+(20\d{2}|20\d)/);
  if (mFull) {
    const dd = mFull[1];
    const mm = mFull[2];
    const rawYr = mFull[3];
    const yyyy = rawYr === '206' ? '2026' : rawYr.length === 3 ? `202${rawYr[2]}` : rawYr;
    return `${dd}.${mm}.${yyyy}`;
  }
  const mShort = cleanName.match(/(\d{2})[._-](\d{2})(?!\d)/);
  if (mShort) {
    return `${mShort[1]}.${mShort[2]}.2026`;
  }
  if (rawRows && rawRows.length > 0) {
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const line = (rawRows[i] || []).map((c) => String(c || '')).join(' ');
      const mHeader = line.match(/(\d{2})\.(\d{2})\.(20\d{2})/);
      if (mHeader) {
        return `${mHeader[1]}.${mHeader[2]}.${mHeader[3]}`;
      }
      const mSlashHeader = line.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
      if (mSlashHeader) {
        const p1 = parseInt(mSlashHeader[1], 10);
        const p2 = parseInt(mSlashHeader[2], 10);
        const yyyy = mSlashHeader[3];
        const mm = String(p1 <= 12 ? p1 : p2).padStart(2, '0');
        const dd = String(p1 <= 12 ? p2 : p1).padStart(2, '0');
        return `${dd}.${mm}.${yyyy}`;
      }
    }
  }
  return defaultFallback;
}

export function formatZupBranchShort(rawDept?: string | null, lang: 'tr' | 'ru' = 'tr'): string {
  const s = String(rawDept || '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low.includes('основное подразделение')) {
    return lang === 'ru' ? 'Основное (Офис)' : 'Merkez (Основное)';
  }
  if (low.includes('казань')) {
    return lang === 'ru' ? 'ОП г. Казань' : 'Kazan (ОП)';
  }
  if (low.includes('тобольск')) {
    return lang === 'ru' ? 'ОП Тобольск / ДГП-2' : 'Tobolsk / DGP-2 (ОП)';
  }
  if (low.includes('эп-300') || low.includes('эп 300')) {
    return lang === 'ru' ? 'ОП Нижнекамск / ЭП-300' : 'Nijnekamsk / EP-300 (ОП)';
  }
  if (low.includes('полистерол') || low.includes('полистирол')) {
    return lang === 'ru' ? 'ОП Нижнекамск / Полистерол' : 'Nijnekamsk / Polisterol (ОП)';
  }
  if (low.includes('нижнекамск')) {
    return lang === 'ru' ? 'ОП г. Нижнекамск' : 'Nijnekamsk (ОП)';
  }
  if (low.includes('усть-луга') || low.includes('кингисепп')) {
    return lang === 'ru' ? 'ОП Усть-Луга' : 'Ust-Luga (ОП)';
  }
  if (low.includes('свободный') || low.includes('агхк')) {
    return lang === 'ru' ? 'ОП Свободный (АГХК)' : 'Svobodniy / AGHK (ОП)';
  }
  return s.replace(/^Обособленное подразделение\s*/i, 'ОП ').trim();
}

const CITIZENSHIP_RU_TO_TR: Record<string, string> = {
  РОССИЯ: 'RUSYA',
  ТАДЖИКИСТАН: 'TACIKISTAN',
  ТУРЦИЯ: 'TURKIYE',
  КИРГИЗИЯ: 'KIRGIZISTAN',
  КЫРГЫЗСТАН: 'KIRGIZISTAN',
  УЗБЕКИСТАН: 'OZBEKISTAN',
  АЗЕРБАЙДЖАН: 'AZERBAYCAN',
  ТУРКМЕНИЯ: 'TURKMENISTAN',
  ТУРКМЕНИСТАН: 'TURKMENISTAN',
  ИНДИЯ: 'HINDISTAN',
  КАЗАХСТАН: 'KAZAKISTAN',
  БАНГЛАДЕШ: 'BANGLADES',
  БЕЛАРУСЬ: 'BELARUS',
  'МОЛДОВА, РЕСПУБЛИКА': 'MOLDOVA',
  МОЛДОВА: 'MOLDOVA',
};

export function normalizeSicilDigits(s?: string | null): string {
  if (!s) return '';
  const digits = String(s).trim().replace(/[^0-9]/g, '');
  return digits.replace(/^0+/, '') || digits;
}

export function normalizeDigitsOnly(s?: string | null): string {
  if (!s) return '';
  return String(s).replace(/[^0-9]/g, '');
}

export function normalizeCyrillicName(s?: string | null): string {
  if (!s) return '';
  return String(s)
    .trim()
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/\s+/g, ' ');
}

export function normalizeDateValue(raw?: any): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d{5}(\.0)?$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 10000 && serial < 65000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      const d = new Date(utcMs);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy === 2027 ? 2026 : yyyy}-${mm}-${dd}`;
    }
  }
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const yyyy = s.slice(6, 10);
    const mm = s.slice(3, 5);
    const dd = s.slice(0, 2);
    return `${yyyy === '2027' ? '2026' : yyyy}-${mm}-${dd}`;
  }
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) {
    const p1 = parseInt(mSlash[1], 10);
    const p2 = parseInt(mSlash[2], 10);
    const yyyy = mSlash[3] === '2027' ? '2026' : mSlash[3];
    // 172.20.250.32 1C RDP server uses US M/D/YYYY format (e.g. 8/26/2020, 11/8/2026)
    const mm = String(p1 <= 12 ? p1 : p2).padStart(2, '0');
    const dd = String(p1 <= 12 ? p2 : p1).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10);
    return iso.startsWith('2027-') ? `2026-${iso.slice(5)}` : iso;
  }
  return s;
}

export function formatIsoToDisplay(iso?: string | null): string {
  if (!iso) return '—';
  const norm = normalizeDateValue(iso);
  if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    const [y, m, d] = norm.split('-');
    return `${d}.${m}.${y}`;
  }
  return norm || '—';
}

export function mapZupTaxStatusToPermitCategory(taxStatus?: string | null): string {
  const ts = String(taxStatus || '').toUpperCase();
  if (ts.includes('ВЫСОКОКВАЛИФИЦИРОВАН') || ts.includes('ВКС') || ts.includes('VKS')) {
    return 'VKS';
  }
  if (ts.includes('ПАТЕНТ') || ts.includes('PATENT')) {
    return 'PATENT';
  }
  if (ts.includes('ЕАЭС') || ts.includes('EAES')) {
    return 'EAES';
  }
  if (
    ts.includes('РЕЗИДЕНТ') &&
    !ts.includes('НЕРЕЗИДЕНТ') &&
    !ts.includes('НЕ ЯВЛЯЮЩ')
  ) {
    return 'RESIDENT';
  }
  return 'QUOTA_RNR';
}

function ensureZupSchemaColumns(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS zup_official_personnel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_no INTEGER,
      fio_kiril TEXT,
      gender TEXT,
      birth_date TEXT,
      tabel_no TEXT,
      norm_sicil TEXT,
      position_ru TEXT,
      hire_date TEXT,
      tax_status TEXT,
      permit_category TEXT,
      citizenship_ru TEXT,
      citizenship_tr TEXT,
      inn TEXT,
      snils TEXT,
      doc_no TEXT,
      doc_series TEXT,
      doc_issued_by TEXT,
      doc_dept_code TEXT,
      doc_issue_date TEXT,
      schedule TEXT,
      zup_department TEXT DEFAULT '',
      work_state TEXT DEFAULT '',
      insured_status TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_zup_tabel ON zup_official_personnel(tabel_no);
    CREATE INDEX IF NOT EXISTS idx_zup_norm_sicil ON zup_official_personnel(norm_sicil);
  `);

  const existingCols = new Set(
    (db.prepare('PRAGMA table_info(zup_official_personnel)').all() as { name: string }[]).map((c) => c.name)
  );
  if (!existingCols.has('zup_department')) {
    db.exec("ALTER TABLE zup_official_personnel ADD COLUMN zup_department TEXT DEFAULT '';");
  }
  if (!existingCols.has('work_state')) {
    db.exec("ALTER TABLE zup_official_personnel ADD COLUMN work_state TEXT DEFAULT '';");
  }
  if (!existingCols.has('insured_status')) {
    db.exec("ALTER TABLE zup_official_personnel ADD COLUMN insured_status TEXT DEFAULT '';");
  }
}

export function ensureZupTableAndSeed(db: any): void {
  ensureZupSchemaColumns(db);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM zup_official_personnel').get() as { c: number };
  const validTabelRow = db
    .prepare("SELECT COUNT(*) as c FROM zup_official_personnel WHERE TRIM(COALESCE(tabel_no, '')) != ''")
    .get() as { c: number };
  const deptCountRow = db
    .prepare("SELECT COUNT(*) as c FROM zup_official_personnel WHERE TRIM(COALESCE(zup_department, '')) != ''")
    .get() as { c: number };
  const srcRow = db
    .prepare("SELECT value FROM system_info WHERE key = 'zup_source_file'")
    .get() as { value?: string } | undefined;
  const vksCountRow = db
    .prepare("SELECT COUNT(*) as c FROM zup_official_personnel WHERE permit_category = 'VKS'")
    .get() as { c: number };

  const needsReseed =
    !countRow ||
    countRow.c === 0 ||
    !validTabelRow ||
    validTabelRow.c === 0 ||
    (srcRow?.value && srcRow.value.includes('???')) ||
    (countRow.c === 4594 && (!vksCountRow || vksCountRow.c === 0)) ||
    (srcRow?.value === 'Список сотрудников на 29.10.xlsx' && (!deptCountRow || deptCountRow.c === 0));

  if (!needsReseed) {
    return;
  }

  // Auto-seed from data/zup_official_seed.json.gz if table is empty, broken, or older seed
  try {
    const seedPath = path.join(process.cwd(), 'data', 'zup_official_seed.json.gz');
    if (!fs.existsSync(seedPath)) return;
    const compressed = fs.readFileSync(seedPath);
    const jsonStr = zlib.gunzipSync(compressed).toString('utf-8');
    const parsed = JSON.parse(jsonStr) as {
      report_date?: string;
      source_file?: string;
      records?: ZupOfficialRecord[];
    };
    const records = (parsed.records || []).map((r) => ({
      ...r,
      permit_category: mapZupTaxStatusToPermitCategory(r.tax_status),
      citizenship_tr:
        CITIZENSHIP_RU_TO_TR[String(r.citizenship_ru || '').toUpperCase()] ||
        r.citizenship_tr ||
        r.citizenship_ru ||
        '',
    }));
    if (records.length === 0) return;

    const cleanSource =
      parsed.source_file && !parsed.source_file.includes('???')
        ? parsed.source_file
        : 'Список сотрудников 06.11.2026.xlsx';

    saveZupRecordsToDb(
      db,
      records,
      parsed.report_date || '06.11.2026',
      cleanSource
    );
  } catch {}
}

export function saveZupRecordsToDb(
  db: any,
  records: ZupOfficialRecord[],
  reportDate: string,
  sourceFile: string
): void {
  ensureZupSchemaColumns(db);
  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM zup_official_personnel').run();
    const stmt = db.prepare(`
      INSERT INTO zup_official_personnel (
        row_no, fio_kiril, gender, birth_date, tabel_no, norm_sicil,
        position_ru, hire_date, tax_status, permit_category,
        citizenship_ru, citizenship_tr, inn, snils,
        doc_no, doc_series, doc_issued_by, doc_dept_code, doc_issue_date, schedule,
        zup_department, work_state, insured_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of records) {
      stmt.run(
        r.row_no || 0,
        r.fio_kiril || '',
        r.gender || '',
        r.birth_date || '',
        r.tabel_no || '',
        r.norm_sicil || '',
        r.position_ru || '',
        r.hire_date || '',
        r.tax_status || '',
        r.permit_category || '',
        r.citizenship_ru || '',
        r.citizenship_tr || '',
        r.inn || '',
        r.snils || '',
        r.doc_no || '',
        r.doc_series || '',
        r.doc_issued_by || '',
        r.doc_dept_code || '',
        r.doc_issue_date || '',
        r.schedule || '',
        r.zup_department || '',
        r.work_state || '',
        r.insured_status || ''
      );
    }

    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    const mskTs = getCurrentMskTimestamp();
    const infoStmt = db.prepare('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)');
    infoStmt.run('zup_data_freshness', reportDate);
    infoStmt.run('zup_source_file', sourceFile);
    infoStmt.run('zup_total_records', String(records.length));
    infoStmt.run('zup_last_updated', new Date().toISOString());
    infoStmt.run('zup_updated_at_msk', mskTs.full);

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    throw err;
  }

  const gCache = globalThis as unknown as { __ponderaZupReconciliationCache?: any };
  gCache.__ponderaZupReconciliationCache = null;
}

function parseCombined1CDocumentString(rawDoc: string): {
  doc_series: string;
  doc_no: string;
  doc_issue_date: string;
  doc_issued_by: string;
} {
  const s = String(rawDoc || '').trim().replace(/\s+/g, ' ');
  if (!s) {
    return { doc_series: '', doc_no: '', doc_issue_date: '', doc_issued_by: '' };
  }

  let doc_issue_date = '';
  const mDate = s.match(/(?:от\s*)?(\d{2}\.\d{2}\.\d{4})/i);
  if (mDate) {
    doc_issue_date = normalizeDateValue(mDate[1]);
  }

  let doc_issued_by = '';
  const mBy = s.match(/выдан[оа]?\s*:?\s*(.+?)(?:\s+код\s+подразделения|\s+\d{2}\.\d{2}\.\d{4}|$)/i);
  if (mBy) {
    doc_issued_by = mBy[1].trim();
  }

  // Strip trailing "от DD.MM.YYYY..." and leading document type names
  const head = s
    .replace(/\s+от\s+\d{2}\.\d{2}\.\d{4}.*$/i, '')
    .replace(/\s+выдан.*$/i, '')
    .replace(
      /^(паспорт иностранного гражданина|паспорт гражданина рф|паспорт гражданина|иностранный паспорт|паспорт|вид на жительство|разрешение на временное проживание|удостоверение личности)\s*[:,]?\s*/i,
      ''
    )
    .trim();

  const mSerNo = head.match(/серия\s*([^\s№,]+)\s*(?:№|номер)?\s*([^\s,]+)/i);
  if (mSerNo) {
    return {
      doc_series: mSerNo[1].trim(),
      doc_no: mSerNo[2].trim(),
      doc_issue_date,
      doc_issued_by,
    };
  }

  const mRfPass = head.match(/^(\d{2}\s?\d{2})\s+(?:№\s*)?(\d{6})$/);
  if (mRfPass) {
    return {
      doc_series: mRfPass[1].trim(),
      doc_no: mRfPass[2].trim(),
      doc_issue_date,
      doc_issued_by,
    };
  }

  const mSplit = head.match(/^([A-Za-zА-Яа-я0-9-]{1,6})\s*(?:№\s*)?([A-Za-z0-9]{5,15})$/);
  if (mSplit) {
    return {
      doc_series: mSplit[1].trim(),
      doc_no: mSplit[2].trim(),
      doc_issue_date,
      doc_issued_by,
    };
  }

  const cleaned = head.replace(/^№\s*/, '').trim();
  return {
    doc_series: '',
    doc_no: cleaned,
    doc_issue_date,
    doc_issued_by,
  };
}

export function parseZupWorksheetRows(rawRows: any[][]): ZupOfficialRecord[] {
  if (!rawRows || rawRows.length < 2) return [];

  // Score candidate header rows across top 40 rows (handles both flat row-0 exports and 1C ZUP 'Штатные сотрудники' reports with metadata/filter rows)
  let headerRowIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < Math.min(40, rawRows.length); i++) {
    const cells = (rawRows[i] || []).map((c) =>
      String(c || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    );
    let score = 0;
    for (const h of cells) {
      if (!h || h.length > 55) continue;
      if (h === 'сотрудник' || h === 'фио' || h === 'физическое лицо' || h === 'tam adı' || h === 'ad soyad') {
        score += 4;
      }
      if (h === 'табельный номер' || h === 'табельный' || h === 'таб. №' || h === 'sicil no') {
        score += 4;
      }
      if (h === 'должность' || h === 'görevi') {
        score += 2;
      }
      if (h.includes('дата приема') || h.includes('дата приёма') || h.includes('işe giriş')) {
        score += 2;
      }
      if (h.includes('статус налогоплательщика') || h.includes('çalışma kart')) {
        score += 2;
      }
      if (h === 'дата рождения' || h === 'doğum tarihi') {
        score += 1;
      }
      if (h === 'состояние' || h.includes('статус застрахованного')) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = i;
    }
  }

  if (headerRowIdx === -1 || bestScore < 4) {
    return [];
  }

  const headers = (rawRows[headerRowIdx] || []).map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  );

  const findCol = (candidates: string[], excludeSubstrings: string[] = []): number => {
    for (const cand of candidates) {
      const exactIdx = headers.findIndex(
        (h) => h === cand && !excludeSubstrings.some((ex) => h.includes(ex))
      );
      if (exactIdx !== -1) return exactIdx;
    }
    for (const cand of candidates) {
      const subIdx = headers.findIndex(
        (h) =>
          h.length > 0 &&
          h.length <= 55 &&
          h.includes(cand) &&
          !excludeSubstrings.some((ex) => h.includes(ex))
      );
      if (subIdx !== -1) return subIdx;
    }
    return -1;
  };

  const cellStr = (row: any[], idx: number): string =>
    idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : '';

  const cellRaw = (row: any[], idx: number): any =>
    idx >= 0 && idx < row.length ? row[idx] : undefined;

  const idxNo = findCol(['№', 'п/п', 'nomer', 'sira']);
  const idxFio = findCol(
    ['сотрудник', 'фио', 'физическое лицо', 'tam adı', 'ad soyad'],
    ['всего сотрудников', 'работающие сотрудники']
  );
  const idxGender = findCol(['пол', 'cinsiyet'], ['полис', 'неполн', 'дополн']);
  const idxDob = findCol(['дата рождения', 'doğum tarihi'], ['дней до']);
  const idxTabel = findCol(['табельный номер', 'табельный', 'таб. №', 'таб. номер', 'sicil no']);
  const idxPos = findCol(['должность', 'позиция штатного', 'görevi']);
  const idxHire = findCol(['дата приема', 'дата приёма', 'işe giriş']);
  const idxTax = findCol(['статус налогоплательщика', 'çalışma kart türü']);
  const idxCit = findCol(['страна гражданства', 'гражданство', 'uyruk']);
  const idxInn = findCol(['инн', 'inn'], ['иностран']);
  const idxSnils = findCol(['снилс', 'страховой номер', 'cnils', 'snils']);
  const idxDocNo = findCol(['удостоверение.номер', 'документ.номер', 'номер паспорта', 'pasaport no']);
  const idxDocSer = findCol(['удостоверение.серия', 'документ.серия', 'серия паспорта', 'pasaport seri']);
  const idxDocCombined = findCol(
    [
      'документ, удостоверяющий личность',
      'документ удостоверяющий личность',
      'удостоверение личности',
      'паспортные данные',
      'паспорт',
    ],
    ['номер', 'серия', 'кем выдан', 'код подразделения', 'дата выдачи']
  );
  const idxDocBy = findCol(['удостоверение.кем выдан', 'документ.кем выдан', 'кем выдан']);
  const idxDocCode = findCol(['удостоверение.код подразделения', 'документ.код подразделения', 'код подразделения']);
  const idxDocDate = findCol(['удостоверение.дата выдачи', 'документ.дата выдачи', 'дата выдачи']);
  const idxSched = findCol(['график работы', 'график']);
  const idxDept = findCol(
    ['подразделение', 'обособленное подразделение', 'departman', 'şube'],
    ['код подразделения']
  );
  const idxState = findCol(['состояние', 'durum']);
  const idxInsured = findCol(['статус застрахованного лица', 'статус застрахованного']);

  if (idxFio === -1 && idxTabel === -1) {
    return [];
  }

  const records: ZupOfficialRecord[] = [];
  let currentGroupDepartment = '';

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !Array.isArray(r)) continue;

    const col0 = String(r[0] ?? '').trim().replace(/\s+/g, ' ');
    const fio = cellStr(r, idxFio).replace(/\s+/g, ' ');
    const tabel = cellStr(r, idxTabel);

    const col0Low = col0.toLowerCase();
    const fioLow = fio.toLowerCase();

    // Ignore summary / footer rows ('Итого', 'Всего сотрудников: ...')
    if (
      !tabel &&
      (col0Low.startsWith('итого') ||
        col0Low.startsWith('всего') ||
        fioLow.startsWith('итого') ||
        fioLow.startsWith('всего'))
    ) {
      continue;
    }

    // Track 1C ZUP 'Подразделение' group header rows (where Col 0 holds the branch name and FIO/Tabel are empty)
    if (col0 && !/^\d+([.,]\d+)?$/.test(col0) && (!fio || fio === col0) && !tabel) {
      currentGroupDepartment = col0;
      continue;
    }

    if (!fio && !tabel) continue;
    if (fioLow === 'сотрудник' || tabel.toLowerCase().includes('табельн')) continue;

    const taxStatus = cellStr(r, idxTax);
    const insuredStatus = cellStr(r, idxInsured);
    let citRu = cellStr(r, idxCit).toUpperCase();
    if (!citRu && insuredStatus.toLowerCase().startsWith('граждане рф')) {
      citRu = 'РОССИЯ';
    }
    const citTr = CITIZENSHIP_RU_TO_TR[citRu] || citRu;

    let docNo = cellStr(r, idxDocNo);
    let docSeries = cellStr(r, idxDocSer);
    let docIssuedBy = cellStr(r, idxDocBy);
    let docIssueDate = normalizeDateValue(cellRaw(r, idxDocDate));

    if (!docNo && idxDocCombined >= 0) {
      const parsedDoc = parseCombined1CDocumentString(cellStr(r, idxDocCombined));
      docNo = parsedDoc.doc_no;
      docSeries = docSeries || parsedDoc.doc_series;
      docIssuedBy = docIssuedBy || parsedDoc.doc_issued_by;
      docIssueDate = docIssueDate || parsedDoc.doc_issue_date;
    }

    const rowDept = cellStr(r, idxDept) || currentGroupDepartment;
    const workState = cellStr(r, idxState);

    records.push({
      row_no: records.length + 1,
      fio_kiril: fio,
      gender: cellStr(r, idxGender),
      birth_date: normalizeDateValue(cellRaw(r, idxDob)),
      tabel_no: tabel,
      norm_sicil: normalizeSicilDigits(tabel),
      position_ru: cellStr(r, idxPos),
      hire_date: normalizeDateValue(cellRaw(r, idxHire)),
      tax_status: taxStatus,
      permit_category: mapZupTaxStatusToPermitCategory(taxStatus),
      citizenship_ru: citRu,
      citizenship_tr: citTr,
      inn: normalizeDigitsOnly(cellStr(r, idxInn)),
      snils: cellStr(r, idxSnils),
      doc_no: docNo,
      doc_series: docSeries,
      doc_issued_by: docIssuedBy,
      doc_dept_code: cellStr(r, idxDocCode),
      doc_issue_date: docIssueDate,
      schedule: cellStr(r, idxSched),
      zup_department: rowDept,
      work_state: workState,
      insured_status: insuredStatus,
    });
  }

  return records;
}

export function computeZupVsRealReconciliation(db: any) {
  ensureZupTableAndSeed(db);

  // Check cache keyed by personnel count/maxId + zup count/maxId
  const pVer = db
    .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM personnel')
    .get() as { cnt: number; maxId: number };
  const zVer = db
    .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM zup_official_personnel')
    .get() as { cnt: number; maxId: number };

  const sysRows = db
    .prepare(
      "SELECT key, value FROM system_info WHERE key IN ('data_freshness', 'source_file', 'last_updated', 'eba_updated_at_msk', 'zup_data_freshness', 'zup_source_file', 'zup_last_updated', 'zup_updated_at_msk')"
    )
    .all() as { key: string; value: string }[];
  const sysMap: Record<string, string> = {};
  for (const r of sysRows) {
    sysMap[r.key] = r.value;
  }

  const ebaDate = sysMap['data_freshness'] || '03.11.2026';
  const zupDate = sysMap['zup_data_freshness'] || '06.11.2026';
  const rawZupSource = sysMap['zup_source_file'] || 'Список сотрудников 06.11.2026.xlsx';
  const zupSourceFile = rawZupSource.includes('???')
    ? 'Список сотрудников 06.11.2026.xlsx'
    : rawZupSource;
  const zupLastUpdated = sysMap['zup_last_updated'] || '';
  const ebaTs = formatSystemTimestampToMsk(sysMap['last_updated'], ebaDate, sysMap['eba_updated_at_msk']);
  const zupTs = formatSystemTimestampToMsk(zupLastUpdated, zupDate, sysMap['zup_updated_at_msk']);
  const zupCutoffIso = normalizeDateValue(zupDate) || '2026-11-06';
  const zupShortDate = zupDate.slice(0, 5);

  const cacheKey = `${pVer.cnt}:${pVer.maxId}:${zVer.cnt}:${zVer.maxId}:${ebaDate}:${ebaTs.time}:${zupDate}:${zupTs.time}:${zupLastUpdated}`;
  const gCache = globalThis as unknown as {
    __ponderaZupReconciliationCache?: { key: string; data: any };
  };
  if (gCache.__ponderaZupReconciliationCache?.key === cacheKey) {
    return gCache.__ponderaZupReconciliationCache.data;
  }

  const allZupRows = (
    db.prepare('SELECT * FROM zup_official_personnel ORDER BY row_no ASC').all() as ZupOfficialRecord[]
  ).map((r) => ({
    ...r,
    permit_category: mapZupTaxStatusToPermitCategory(r.tax_status),
    citizenship_tr:
      CITIZENSHIP_RU_TO_TR[String(r.citizenship_ru || '').toUpperCase()] ||
      r.citizenship_tr ||
      r.citizenship_ru,
  }));

  // Keep only active employees for the 1C ZUP vs eBA Real active payroll reconciliation,
  // while zup_official_personnel retains pre-hire candidates & exited rows for Invitation matching
  const hasStateColumn = allZupRows.some((r) => Boolean(String(r.work_state || '').trim()));
  const hasHireColumn = allZupRows.some((r) => Boolean(String(r.hire_date || '').trim()));
  const zupRows = hasStateColumn
    ? allZupRows.filter((r) => {
        const ws = String(r.work_state || '').trim().toLowerCase();
        return ws !== '' && !ws.includes('увол');
      })
    : hasHireColumn
      ? allZupRows.filter((r) => Boolean(String(r.hire_date || '').trim()))
      : allZupRows;

  const ebaRows = db
    .prepare(
      `SELECT
        id, sicil_no, genel_durum, guncel_durum, ad_soyad, tam_adi_kiril,
        uyruk, gorevi, departman, proje_adi, region, firma,
        ise_giris_tarihi, cikis_tarihi, cikis_sebebi, dogum_tarihi,
        pasaport_no, inn_no, cinsiyet, all_data_json
      FROM personnel`
    )
    .all() as any[];

  // Index eBA rows for fast multi-stage matching (prefer 'Mevcut' when duplicate keys exist)
  const ebaByExactSicil = new Map<string, any>();
  const ebaByNormSicil = new Map<string, any>();
  const ebaByPassport = new Map<string, any>();
  const ebaByInn = new Map<string, any>();
  const ebaByKirilName = new Map<string, any>();

  // Active-only indexes to detect when a transferred employee has a newer 'Mevcut' record under a new sicil
  const ebaActiveByPassport = new Map<string, any>();
  const ebaActiveByInn = new Map<string, any>();
  const ebaActiveByKirilName = new Map<string, any>();

  for (const r of ebaRows) {
    const exactSicil = String(r.sicil_no || '').trim();
    const normSicil = normalizeSicilDigits(exactSicil);
    const isActive = r.genel_durum === 'Mevcut';

    if (exactSicil && (!ebaByExactSicil.has(exactSicil) || isActive)) {
      ebaByExactSicil.set(exactSicil, r);
    }
    if (normSicil && (!ebaByNormSicil.has(normSicil) || isActive)) {
      ebaByNormSicil.set(normSicil, r);
    }
    const passDigits = normalizeDigitsOnly(r.pasaport_no);
    if (passDigits.length >= 5) {
      if (!ebaByPassport.has(passDigits) || isActive) {
        ebaByPassport.set(passDigits, r);
      }
      if (isActive) {
        ebaActiveByPassport.set(passDigits, r);
      }
    }
    const innDigits = normalizeDigitsOnly(r.inn_no);
    if (innDigits.length >= 10) {
      if (!ebaByInn.has(innDigits) || isActive) {
        ebaByInn.set(innDigits, r);
      }
      if (isActive) {
        ebaActiveByInn.set(innDigits, r);
      }
    }
    const kirilNorm = normalizeCyrillicName(r.tam_adi_kiril);
    if (kirilNorm) {
      if (!ebaByKirilName.has(kirilNorm) || isActive) {
        ebaByKirilName.set(kirilNorm, r);
      }
      if (isActive) {
        ebaActiveByKirilName.set(kirilNorm, r);
      }
    }
  }

  const matchedEbaIds = new Set<number>();
  const auditRecords: any[] = [];

  let matchedExactSicilCount = 0;
  let matchedNormSicilCount = 0;
  let matchedByDocOrInnCount = 0;
  let matchedActiveBoth = 0;
  let zupActiveButRealExited = 0;
  let zupTransferPermitCheckCount = 0;
  let zupOnlyNotInRealDB = 0;

  // Permit-level breakdown counters for interactive comparison chart
  const zupPermitActiveMatched: Record<string, number> = { VKS: 0, PATENT: 0, QUOTA_RNR: 0, RESIDENT: 0, EAES: 0 };
  const zupPermitTransfer: Record<string, number> = { VKS: 0, PATENT: 0, QUOTA_RNR: 0, RESIDENT: 0, EAES: 0 };
  const zupPermitRealExited: Record<string, number> = { VKS: 0, PATENT: 0, QUOTA_RNR: 0, RESIDENT: 0, EAES: 0 };

  // Field-level discrepancy counters among matched employees
  let diffSicilFormatCount = 0;
  let diffPassportCount = 0;
  let diffPermitStatusCount = 0;
  let diffInnCount = 0;
  let missingInnInEbaCount = 0;
  let diffBirthDateCount = 0;
  let diffKirilNameCount = 0;
  let diffHireDateCount = 0;
  let totalMatchedWithDataDiff = 0;

  for (const zr of zupRows) {
    const zTabel = String(zr.tabel_no || '').trim();
    const zNormSicil = zr.norm_sicil || normalizeSicilDigits(zTabel);
    const zPassDigits = normalizeDigitsOnly(zr.doc_no);
    const zFullPassDigits = normalizeDigitsOnly(`${zr.doc_series || ''}${zr.doc_no || ''}`);
    const zInnDigits = normalizeDigitsOnly(zr.inn);
    const zKirilNorm = normalizeCyrillicName(zr.fio_kiril);

    let matchedEba: any = null;
    let matchMethod: 'EXACT_SICIL' | 'NORM_SICIL' | 'PASSPORT' | 'INN' | 'KIRIL_NAME' | 'NONE' = 'NONE';
    let transferredFromOldRow: any = null;

    if (zTabel && ebaByExactSicil.has(zTabel)) {
      matchedEba = ebaByExactSicil.get(zTabel);
      matchMethod = 'EXACT_SICIL';
      matchedExactSicilCount++;
    } else if (zNormSicil && ebaByNormSicil.has(zNormSicil)) {
      matchedEba = ebaByNormSicil.get(zNormSicil);
      matchMethod = 'NORM_SICIL';
      matchedNormSicilCount++;
    } else if (zPassDigits.length >= 5 && ebaByPassport.has(zPassDigits)) {
      matchedEba = ebaByPassport.get(zPassDigits);
      matchMethod = 'PASSPORT';
      matchedByDocOrInnCount++;
    } else if (zFullPassDigits.length >= 6 && ebaByPassport.has(zFullPassDigits)) {
      matchedEba = ebaByPassport.get(zFullPassDigits);
      matchMethod = 'PASSPORT';
      matchedByDocOrInnCount++;
    } else if (zInnDigits.length >= 10 && ebaByInn.has(zInnDigits)) {
      matchedEba = ebaByInn.get(zInnDigits);
      matchMethod = 'INN';
      matchedByDocOrInnCount++;
    } else if (zKirilNorm && ebaByKirilName.has(zKirilNorm)) {
      matchedEba = ebaByKirilName.get(zKirilNorm);
      matchMethod = 'KIRIL_NAME';
      matchedByDocOrInnCount++;
    }

    // If matched by sicil to an exited row, check if the employee was transferred and has a newer 'Mevcut' row
    if (matchedEba && matchedEba.genel_durum !== 'Mevcut') {
      const altActive =
        (zPassDigits.length >= 5 && ebaActiveByPassport.get(zPassDigits)) ||
        (zFullPassDigits.length >= 6 && ebaActiveByPassport.get(zFullPassDigits)) ||
        (zInnDigits.length >= 10 && ebaActiveByInn.get(zInnDigits)) ||
        (zKirilNorm && ebaActiveByKirilName.get(zKirilNorm)) ||
        null;
      if (altActive && altActive.id !== matchedEba.id) {
        transferredFromOldRow = matchedEba;
        matchedEba = altActive;
      }
    }

    const zPermitBucket = zr.permit_category || 'QUOTA_RNR';

    if (!matchedEba) {
      zupOnlyNotInRealDB++;
      const zupDeptTr = formatZupBranchShort(zr.zup_department, 'tr');
      const zupDeptRu = formatZupBranchShort(zr.zup_department, 'ru');
      const zupActiveLabel =
        zr.work_state && zr.work_state !== 'Работа'
          ? `1C ZUP Aktif (${zr.work_state})`
          : '1C ZUP Aktif';
      auditRecords.push({
        id: `zup-only-${zr.row_no}`,
        category: 'ZUP_ONLY_NO_EBA',
        risk: 'Kritik',
        matchMethod: 'NONE',
        diffFlags: ['NO_EBA_RECORD'],
        sicil_no: zr.tabel_no,
        zup_tabel_no: zr.tabel_no,
        name: zr.fio_kiril,
        kiril_name: zr.fio_kiril,
        uyruk: zr.citizenship_tr || zr.citizenship_ru || '—',
        region: zupDeptTr || '1C ZUP Kaydı',
        proje_adi: 'eBA Kaydı Yok',
        firma: 'PONDERA (1C ZUP)',
        gorev: zr.position_ru,
        zup_department: zr.zup_department || '',
        zup_department_tr: zupDeptTr,
        zup_department_ru: zupDeptRu,
        zup_work_state: zr.work_state || '',
        eba_status: 'Kaydı Yok',
        zup_status: zupActiveLabel,
        eba_permit: '—',
        zup_permit: zr.permit_category,
        zup_tax_status: zr.tax_status,
        eba_passport: '—',
        zup_passport: `${zr.doc_series ? zr.doc_series + ' ' : ''}${zr.doc_no}`.trim() || '—',
        eba_inn: '—',
        zup_inn: zr.inn || '—',
        eba_hire_date: '—',
        zup_hire_date: formatIsoToDisplay(zr.hire_date),
        eba_exit_date: '—',
        diffDetailsTr: ['1C ZUP resmi bordroda aktif ancak eBA Real sistemde hiç sicil kaydı bulunmuyor.'],
        diffDetailsRu: ['Числится в 1С ЗУП, но полностью отсутствует в базе eBA Real.'],
      });
      continue;
    }

    matchedEbaIds.add(matchedEba.id);
    if (transferredFromOldRow) {
      matchedEbaIds.add(transferredFromOldRow.id);
    }

    let rawJson: Record<string, any> = {};
    if (matchedEba.all_data_json) {
      try {
        rawJson = JSON.parse(matchedEba.all_data_json);
      } catch {}
    }

    const ebaPermit = classifyWorkPermitFromRow(matchedEba.uyruk, rawJson);
    const ebaSicil = String(matchedEba.sicil_no || '').trim();
    const ebaPassDigits = normalizeDigitsOnly(matchedEba.pasaport_no);
    const ebaInnDigits = normalizeDigitsOnly(matchedEba.inn_no);
    const ebaDobIso = normalizeDateValue(matchedEba.dogum_tarihi);
    const ebaHireIso = normalizeDateValue(matchedEba.ise_giris_tarihi);
    const ebaExitIso = normalizeDateValue(matchedEba.cikis_tarihi);
    const ebaKirilNorm = normalizeCyrillicName(matchedEba.tam_adi_kiril);

    const diffFlags: string[] = [];
    const diffDetailsTr: string[] = [];
    const diffDetailsRu: string[] = [];

    const isEbaActive = matchedEba.genel_durum === 'Mevcut';
    const exitReasonStr = String(matchedEba.cikis_sebebi || '').trim();
    const isInterSiteTransfer =
      Boolean(transferredFromOldRow) ||
      (!isEbaActive && exitReasonStr.toLowerCase().includes('transfer'));

    if (isEbaActive) {
      matchedActiveBoth++;
      if (transferredFromOldRow) {
        zupTransferPermitCheckCount++;
        zupPermitTransfer[zPermitBucket] = (zupPermitTransfer[zPermitBucket] || 0) + 1;
        diffFlags.push('SITE_TRANSFER_PERMIT_CHECK');
        diffDetailsTr.push(
          `Şantiye Transferi (${transferredFromOldRow.region}/${transferredFromOldRow.proje_adi} → ${matchedEba.region}/${matchedEba.proje_adi}): Resmi 1C ZUP çıkışına gerek yok; çalışma izni/patent bölge geçerliliği kontrol edilmeli.`
        );
        diffDetailsRu.push(
          `Перевод между участками (${transferredFromOldRow.region} → ${matchedEba.region}): увольнение в 1С ЗУП не требуется; проверьте регион действия разрешения/патента.`
        );
      } else {
        zupPermitActiveMatched[zPermitBucket] = (zupPermitActiveMatched[zPermitBucket] || 0) + 1;
      }
    } else if (isInterSiteTransfer) {
      // Inter-site transfer: NOT a real company exit! Counted as official & transfer-active
      matchedActiveBoth++;
      zupTransferPermitCheckCount++;
      zupPermitTransfer[zPermitBucket] = (zupPermitTransfer[zPermitBucket] || 0) + 1;
      diffFlags.push('SITE_TRANSFER_PERMIT_CHECK');
      const exitStr = formatIsoToDisplay(ebaExitIso);
      diffDetailsTr.push(
        `Şirket İçi Şantiye Transferi (${matchedEba.region} - ${exitReasonStr || 'Transfer'}, ${exitStr}): 1C ZUP'ta çıkış işlemine gerek yoktur; yalnızca yeni şantiye bölgesine göre Çalışma İzni / Patent kontrol edilmelidir.`
      );
      diffDetailsRu.push(
        `Внутренний перевод между объектами (${matchedEba.region} - ${exitReasonStr || 'Transfer'}, ${exitStr}): увольнение в 1С ЗУП не требуется; необходим только контроль региона разрешения на работу / патента.`
      );
    } else {
      zupActiveButRealExited++;
      zupPermitRealExited[zPermitBucket] = (zupPermitRealExited[zPermitBucket] || 0) + 1;
      diffFlags.push('STATUS_EXIT');
      const exitStr = formatIsoToDisplay(ebaExitIso);
      diffDetailsTr.push(
        `Real (eBA) sistemde ÇIKIŞ (${exitStr}${exitReasonStr ? ' - ' + exitReasonStr : ''}), 1C ZUP'ta hala AKTİF!`
      );
      diffDetailsRu.push(
        `В eBA Real статус УВОЛЕН (${exitStr}${exitReasonStr ? ' - ' + exitReasonStr : ''}), но в 1С ЗУП все еще АКТИВЕН!`
      );
    }

    // 1. Sicil format or value difference
    if (zTabel !== ebaSicil) {
      diffSicilFormatCount++;
      diffFlags.push('SICIL_FORMAT');
      diffDetailsTr.push(`Sicil No Farkı: ZUP [${zTabel}] ≠ eBA [${ebaSicil}]`);
      diffDetailsRu.push(`Таб. № отличается: ЗУП [${zTabel}] ≠ eBA [${ebaSicil}]`);
    }

    // 2. Passport number difference
    if (
      zPassDigits &&
      ebaPassDigits &&
      !ebaPassDigits.includes(zPassDigits) &&
      !zPassDigits.includes(ebaPassDigits)
    ) {
      diffPassportCount++;
      diffFlags.push('PASSPORT_DIFF');
      const zPassDisp = `${zr.doc_series ? zr.doc_series + ' ' : ''}${zr.doc_no}`.trim();
      diffDetailsTr.push(`Pasaport No Farklı: ZUP [${zPassDisp}] ≠ eBA [${matchedEba.pasaport_no}]`);
      diffDetailsRu.push(`Паспорт отличается: ЗУП [${zPassDisp}] ≠ eBA [${matchedEba.pasaport_no}]`);
    }

    // 3. Work Permit / Taxpayer Status discrepancy
    const ebaNormPermit = ebaPermit === 'RF_CITIZEN' || ebaPermit === 'VNJ_RVP' ? 'RESIDENT' : ebaPermit;
    if (zr.permit_category && ebaNormPermit !== zr.permit_category && ebaPermit !== 'OTHER_PENDING') {
      diffPermitStatusCount++;
      diffFlags.push('PERMIT_DIFF');
      diffDetailsTr.push(`Statü Farkı: ZUP [${zr.permit_category}] ≠ eBA [${ebaPermit}]`);
      diffDetailsRu.push(`Статус отличается: ЗУП [${zr.permit_category}] ≠ eBA [${ebaPermit}]`);
    }

    // 4. INN difference or missing in eBA
    if (zInnDigits && ebaInnDigits && zInnDigits !== ebaInnDigits) {
      diffInnCount++;
      diffFlags.push('INN_DIFF');
      diffDetailsTr.push(`İNN Farklı: ZUP [${zr.inn}] ≠ eBA [${matchedEba.inn_no}]`);
      diffDetailsRu.push(`ИНН отличается: ЗУП [${zr.inn}] ≠ eBA [${matchedEba.inn_no}]`);
    } else if (zInnDigits && !ebaInnDigits) {
      missingInnInEbaCount++;
      diffFlags.push('INN_MISSING_EBA');
      diffDetailsTr.push(`eBA'da İNN Boş (1C ZUP İNN: ${zr.inn})`);
      diffDetailsRu.push(`В eBA не указан ИНН (в ЗУП: ${zr.inn})`);
    }

    // 5. Birth date difference
    if (zr.birth_date && ebaDobIso && zr.birth_date !== ebaDobIso) {
      diffBirthDateCount++;
      diffFlags.push('DOB_DIFF');
      diffDetailsTr.push(
        `Doğum Tarihi Farklı: ZUP [${formatIsoToDisplay(zr.birth_date)}] ≠ eBA [${formatIsoToDisplay(ebaDobIso)}]`
      );
      diffDetailsRu.push(
        `Дата рождения: ЗУП [${formatIsoToDisplay(zr.birth_date)}] ≠ eBA [${formatIsoToDisplay(ebaDobIso)}]`
      );
    }

    // 6. Kiril Name difference
    if (zKirilNorm && ebaKirilNorm && zKirilNorm !== ebaKirilNorm) {
      diffKirilNameCount++;
      diffFlags.push('KIRIL_NAME_DIFF');
      diffDetailsTr.push(`Kiril İsim Yazım Farkı: ZUP [${zr.fio_kiril}] ≠ eBA [${matchedEba.tam_adi_kiril}]`);
      diffDetailsRu.push(`ФИО (кир.): ЗУП [${zr.fio_kiril}] ≠ eBA [${matchedEba.tam_adi_kiril}]`);
    }

    // 7. Hire Date difference
    if (zr.hire_date && ebaHireIso && zr.hire_date !== ebaHireIso) {
      diffHireDateCount++;
    }

    if (diffFlags.length > 0 && (isEbaActive || isInterSiteTransfer)) {
      totalMatchedWithDataDiff++;
    }

    const category = isInterSiteTransfer
      ? 'SITE_TRANSFER_PERMIT_CHECK'
      : !isEbaActive
      ? 'ZUP_ACTIVE_REAL_EXIT'
      : diffFlags.length > 0
      ? 'DATA_DIFF'
      : 'FULL_MATCH';

    const risk =
      !isEbaActive && !isInterSiteTransfer
        ? 'Kritik'
        : isInterSiteTransfer ||
          diffFlags.includes('PASSPORT_DIFF') ||
          diffFlags.includes('PERMIT_DIFF') ||
          diffFlags.includes('INN_DIFF')
        ? 'Orta'
        : 'Dusuk';

    const zupDeptTr = formatZupBranchShort(zr.zup_department, 'tr');
    const zupDeptRu = formatZupBranchShort(zr.zup_department, 'ru');
    const zupActiveLabel =
      zr.work_state && zr.work_state !== 'Работа'
        ? `1C ZUP Aktif (${zr.work_state})`
        : '1C ZUP Aktif';

    auditRecords.push({
      id: `matched-${matchedEba.id}-${zr.row_no}`,
      category,
      risk,
      matchMethod,
      diffFlags,
      sicil_no: ebaSicil || zr.tabel_no,
      zup_tabel_no: zr.tabel_no,
      name: matchedEba.ad_soyad || zr.fio_kiril,
      kiril_name: zr.fio_kiril || matchedEba.tam_adi_kiril || '',
      uyruk: matchedEba.uyruk || zr.citizenship_tr || '—',
      region: resolveEffectiveRegion(matchedEba.region, matchedEba.proje_adi, 'Belirtilmemiş'),
      proje_adi: matchedEba.proje_adi || 'Belirtilmemiş',
      firma: matchedEba.firma || 'PONDERA',
      gorev: matchedEba.gorevi || zr.position_ru,
      zup_position: zr.position_ru,
      zup_department: zr.zup_department || '',
      zup_department_tr: zupDeptTr,
      zup_department_ru: zupDeptRu,
      zup_work_state: zr.work_state || '',
      eba_status: isInterSiteTransfer && !isEbaActive ? `Şantiye Transferi (${exitReasonStr || 'Transfer'})` : matchedEba.genel_durum,
      zup_status: zupActiveLabel,
      eba_permit: ebaPermit,
      zup_permit: zr.permit_category,
      zup_tax_status: zr.tax_status,
      eba_passport: matchedEba.pasaport_no || '—',
      zup_passport: `${zr.doc_series ? zr.doc_series + ' ' : ''}${zr.doc_no}`.trim() || '—',
      eba_inn: matchedEba.inn_no || '—',
      zup_inn: zr.inn || '—',
      eba_hire_date: formatIsoToDisplay(ebaHireIso),
      zup_hire_date: formatIsoToDisplay(zr.hire_date),
      eba_exit_date: formatIsoToDisplay(ebaExitIso),
      diffDetailsTr:
        diffDetailsTr.length > 0
          ? diffDetailsTr
          : ['1C ZUP resmi kaydı ile eBA Real saha kaydı %100 uyumlu.'],
      diffDetailsRu:
        diffDetailsRu.length > 0
          ? diffDetailsRu
          : ['Запись 1С ЗУП и eBA Real полностью совпадают.'],
    });
  }

  // Now check eBA Active ('Mevcut') employees that are NOT in 1C ZUP
  let realActiveTotal = 0;
  let realActiveMainFirm = 0;
  let realActiveSubcon = 0;
  let realActiveNotInZupTotal = 0;
  let realActiveNotInZupMainFirm = 0;
  let realActiveNotInZupSubcon = 0;
  let realActiveNotInZupRecentHire = 0;

  interface SiteBucket {
    project: string;
    realActive: number;
    inZupOfficial: number;
    missingMainFirm: number;
    missingSubcon: number;
    zupActiveRealExit: number;
    transferCount: number;
  }

  const regionStatsMap: Record<
    string,
    {
      region: string;
      realActive: number;
      inZupOfficial: number;
      missingMainFirm: number;
      missingSubcon: number;
      zupActiveRealExit: number;
      transferCount: number;
      projectsMap: Record<string, SiteBucket>;
    }
  > = {};

  for (const r of ebaRows) {
    const reg = resolveEffectiveRegion(r.region, r.proje_adi, 'Diğer');
    const prj = r.proje_adi || reg;
    if (!regionStatsMap[reg]) {
      regionStatsMap[reg] = {
        region: reg,
        realActive: 0,
        inZupOfficial: 0,
        missingMainFirm: 0,
        missingSubcon: 0,
        zupActiveRealExit: 0,
        transferCount: 0,
        projectsMap: {},
      };
    }
    if (!regionStatsMap[reg].projectsMap[prj]) {
      regionStatsMap[reg].projectsMap[prj] = {
        project: prj,
        realActive: 0,
        inZupOfficial: 0,
        missingMainFirm: 0,
        missingSubcon: 0,
        zupActiveRealExit: 0,
        transferCount: 0,
      };
    }
    const pBucket = regionStatsMap[reg].projectsMap[prj];

    const isMatched = matchedEbaIds.has(r.id);
    // Pondera bünyesinde taşeron ayrımı yoktur; tüm aktif personel Pondera kadrosu olarak değerlendirilir
    const isMainFirm = true;
    const isTransferRow =
      r.genel_durum !== 'Mevcut' &&
      String(r.cikis_sebebi || '').toLowerCase().includes('transfer');

    if (r.genel_durum === 'Mevcut') {
      realActiveTotal++;
      regionStatsMap[reg].realActive++;
      pBucket.realActive++;
      if (isMainFirm) {
        realActiveMainFirm++;
      } else {
        realActiveSubcon++;
      }

      if (isMatched) {
        regionStatsMap[reg].inZupOfficial++;
        pBucket.inZupOfficial++;
      } else {
        realActiveNotInZupTotal++;
        const hireIso = normalizeDateValue(r.ise_giris_tarihi);
        const isAfterZupDate = Boolean(hireIso && hireIso >= zupCutoffIso);
        if (isAfterZupDate) {
          realActiveNotInZupRecentHire++;
        }
        if (isMainFirm) {
          realActiveNotInZupMainFirm++;
          regionStatsMap[reg].missingMainFirm++;
          pBucket.missingMainFirm++;
        } else {
          realActiveNotInZupSubcon++;
          regionStatsMap[reg].missingSubcon++;
          pBucket.missingSubcon++;
        }

        let rawJson: Record<string, any> = {};
        if (r.all_data_json) {
          try {
            rawJson = JSON.parse(r.all_data_json);
          } catch {}
        }
        const ebaPermit = classifyWorkPermitFromRow(r.uyruk, rawJson);

        auditRecords.push({
          id: `real-only-${r.id}`,
          category: isMainFirm ? 'REAL_ACTIVE_NO_ZUP_MAIN' : 'REAL_ACTIVE_NO_ZUP_SUBCON',
          risk: isMainFirm ? 'Kritik' : 'Orta',
          matchMethod: 'NONE',
          diffFlags: isMainFirm
            ? isAfterZupDate
              ? ['RECENT_HIRE_AFTER_ZUP', 'MISSING_IN_ZUP_MAIN']
              : ['MISSING_IN_ZUP_MAIN']
            : ['SUBCON_NOT_IN_ZUP'],
          sicil_no: r.sicil_no || '—',
          zup_tabel_no: '—',
          name: r.ad_soyad || '—',
          kiril_name: r.tam_adi_kiril || '—',
          uyruk: r.uyruk || '—',
          region: resolveEffectiveRegion(r.region, r.proje_adi, '—'),
          proje_adi: r.proje_adi || '—',
          firma: r.firma || '—',
          gorev: r.gorevi || '—',
          zup_position: '—',
          zup_department: '',
          zup_department_tr: '',
          zup_department_ru: '',
          zup_work_state: '',
          eba_status: 'Mevcut (Aktif)',
          zup_status: '1C ZUP Kaydı Yok',
          eba_permit: ebaPermit,
          zup_permit: '—',
          zup_tax_status: '—',
          eba_passport: r.pasaport_no || '—',
          zup_passport: '—',
          eba_inn: r.inn_no || '—',
          zup_inn: '—',
          eba_hire_date: formatIsoToDisplay(hireIso),
          zup_hire_date: '—',
          eba_exit_date: '—',
          diffDetailsTr: isMainFirm
            ? [
                isAfterZupDate
                  ? `Pondera Ana Kadroda aktif (Giriş: ${formatIsoToDisplay(hireIso)} — ${zupShortDate} ZUP listesinden sonra işe girmiş).`
                  : `Pondera Ana Kadroda (${r.firma}) sahada aktif görünüyor ancak 1C ZUP resmi listesinde kaydı yok!`,
              ]
            : [`Taşeron firma (${r.firma || 'Taşeron'}) personeli — Pondera 1C ZUP bordrosu dışında.`],
          diffDetailsRu: isMainFirm
            ? [
                isAfterZupDate
                  ? `Основной штат Pondera (Принят: ${formatIsoToDisplay(hireIso)} — после выгрузки ЗУП от ${zupShortDate}).`
                  : `В основном штате Pondera (${r.firma}) активен в eBA, но отсутствует в 1С ЗУП!`,
              ]
            : [`Сотрудник субподрядчика (${r.firma || 'Субподряд'}) — вне штата 1С ЗУП Pondera.`],
        });
      }
    } else if (isMatched) {
      if (isTransferRow) {
        regionStatsMap[reg].transferCount++;
        pBucket.transferCount++;
      } else {
        regionStatsMap[reg].zupActiveRealExit++;
        pBucket.zupActiveRealExit++;
      }
    }
  }

  // Sort regions by realActive descending, including expandable projects array
  const byRegion = Object.values(regionStatsMap)
    .filter((r) => r.realActive > 0 || r.zupActiveRealExit > 0 || r.transferCount > 0)
    .map((r) => {
      const projects = Object.values(r.projectsMap)
        .filter((p) => p.realActive > 0 || p.zupActiveRealExit > 0 || p.transferCount > 0)
        .map((p) => ({
          ...p,
          officialRatePct: p.realActive > 0 ? Math.round((p.inZupOfficial / p.realActive) * 100) : 0,
        }))
        .sort((a, b) => b.realActive - a.realActive);

      return {
        region: r.region,
        realActive: r.realActive,
        inZupOfficial: r.inZupOfficial,
        missingMainFirm: r.missingMainFirm,
        missingSubcon: r.missingSubcon,
        zupActiveRealExit: r.zupActiveRealExit,
        transferCount: r.transferCount,
        officialRatePct: r.realActive > 0 ? Math.round((r.inZupOfficial / r.realActive) * 100) : 0,
        projects,
      };
    })
    .sort((a, b) => b.realActive - a.realActive);

  // Permit category comparison (1C ZUP vs eBA Real Active)
  const zupPermitCounts: Record<string, number> = {
    VKS: 0,
    PATENT: 0,
    QUOTA_RNR: 0,
    RESIDENT: 0,
    EAES: 0,
  };
  for (const zr of zupRows) {
    const cat = zr.permit_category || 'QUOTA_RNR';
    zupPermitCounts[cat] = (zupPermitCounts[cat] || 0) + 1;
  }

  const ebaActivePermitCounts: Record<string, number> = {
    VKS: 0,
    PATENT: 0,
    QUOTA_RNR: 0,
    RESIDENT: 0,
    EAES: 0,
  };
  const ebaRealOnlyMainPermitCounts: Record<string, number> = {
    VKS: 0,
    PATENT: 0,
    QUOTA_RNR: 0,
    RESIDENT: 0,
    EAES: 0,
  };
  const ebaRealOnlySubconPermitCounts: Record<string, number> = {
    VKS: 0,
    PATENT: 0,
    QUOTA_RNR: 0,
    RESIDENT: 0,
    EAES: 0,
  };

  for (const r of ebaRows) {
    if (r.genel_durum !== 'Mevcut') continue;
    let rawJson: Record<string, any> = {};
    if (r.all_data_json) {
      try {
        rawJson = JSON.parse(r.all_data_json);
      } catch {}
    }
    const p = classifyWorkPermitFromRow(r.uyruk, rawJson);
    const bucket = p === 'RF_CITIZEN' || p === 'VNJ_RVP' ? 'RESIDENT' : p === 'OTHER_PENDING' ? 'QUOTA_RNR' : p;
    ebaActivePermitCounts[bucket] = (ebaActivePermitCounts[bucket] || 0) + 1;
    if (!matchedEbaIds.has(r.id)) {
      const isMainFirm = String(r.firma || '').toUpperCase().includes('PONDERA');
      if (isMainFirm) {
        ebaRealOnlyMainPermitCounts[bucket] = (ebaRealOnlyMainPermitCounts[bucket] || 0) + 1;
      } else {
        ebaRealOnlySubconPermitCounts[bucket] = (ebaRealOnlySubconPermitCounts[bucket] || 0) + 1;
      }
    }
  }

  const permitLabels: Record<string, { tr: string; ru: string; shortTr: string; shortRu: string }> = {
    VKS: { tr: 'VKS (Yüksek Nitelikli Uzman)', ru: 'ВКС (Высококвалиф. специалист)', shortTr: 'VKS (ВКС)', shortRu: 'ВКС' },
    PATENT: { tr: 'Patent (Çalışma Patenti)', ru: 'Патент (Трудовой патент)', shortTr: 'Patent', shortRu: 'Патент' },
    QUOTA_RNR: { tr: 'Kota / RNR (Standart İzin)', ru: 'Квота / РНР (Нерезидент)', shortTr: 'Kota / RNR', shortRu: 'Квота / РНР' },
    RESIDENT: { tr: 'Rezident (RF Vatandaşı / VNJ)', ru: 'Резидент (Граждане РФ / ВНЖ)', shortTr: 'Rezident / RF', shortRu: 'Резидент РФ' },
    EAES: { tr: 'EAES (Avrasya Birliği)', ru: 'ЕАЭС (Граждане ЕАЭС)', shortTr: 'EAES (ЕАЭС)', shortRu: 'ЕАЭС' },
  };

  const byPermitStatus = ['VKS', 'PATENT', 'QUOTA_RNR', 'RESIDENT', 'EAES'].map((key) => ({
    key,
    labelTr: permitLabels[key].tr,
    labelRu: permitLabels[key].ru,
    shortTr: permitLabels[key].shortTr,
    shortRu: permitLabels[key].shortRu,
    zupCount: zupPermitCounts[key] || 0,
    zupActiveMatched: zupPermitActiveMatched[key] || 0,
    zupTransferCount: zupPermitTransfer[key] || 0,
    zupRealExitedCount: zupPermitRealExited[key] || 0,
    realActiveCount: ebaActivePermitCounts[key] || 0,
    realOnlyMainCount: ebaRealOnlyMainPermitCounts[key] || 0,
    realOnlySubconCount: ebaRealOnlySubconPermitCounts[key] || 0,
    diff: (ebaActivePermitCounts[key] || 0) - (zupPermitCounts[key] || 0),
  }));

  const matchedActiveMainFirm = Math.max(0, realActiveMainFirm - realActiveNotInZupMainFirm);
  const matchedActiveRateAll =
    realActiveTotal > 0 ? Number(((matchedActiveBoth / realActiveTotal) * 100).toFixed(1)) : 0;
  const matchedActiveRateMainFirm =
    realActiveMainFirm > 0 ? Number(((matchedActiveMainFirm / realActiveMainFirm) * 100).toFixed(1)) : 0;

  const ebaIso = normalizeDateValue(ebaDate);
  const zupIso = normalizeDateValue(zupDate);
  const hasZupPassportColumn = zupRows.some((r) => Boolean(r.doc_no));
  const hasZupInnColumn = zupRows.some((r) => Boolean(r.inn));
  const hasZupDepartmentColumn = zupRows.some((r) => Boolean(r.zup_department));

  const result = {
    success: true,
    metadata: {
      ebaDate,
      ebaTime: ebaTs.time,
      ebaDateTime: ebaTs.full,
      zupDate,
      zupTime: zupTs.time,
      zupDateTime: zupTs.full,
      zupSourceFile,
      zupLastUpdated,
      isZupOutdated: Boolean(
        ebaIso && zupIso ? zupIso < ebaIso : zupDate.trim() !== ebaDate.trim()
      ),
      hasZupPassportColumn,
      hasZupInnColumn,
      hasZupDepartmentColumn,
      zupTotalRecordsInDb: allZupRows.length,
    },
    summary: {
      realActiveTotal,
      realActiveMainFirm,
      realActiveSubcon,
      zupOfficialTotal: zupRows.length,
      matchedActiveBoth,
      matchedActiveMainFirm,
      matchedActiveRateAll,
      matchedActiveRateMainFirm,
      matchedExactSicilCount,
      matchedNormSicilCount,
      matchedByDocOrInnCount,
      realActiveNotInZupTotal,
      realActiveNotInZupMainFirm,
      realActiveNotInZupSubcon,
      realActiveNotInZupRecentHire,
      zupActiveButRealExited,
      zupTransferPermitCheckCount,
      zupOnlyNotInRealDB,
      totalMatchedWithDataDiff,
      discrepancyCounts: {
        statusExitInReal: zupActiveButRealExited,
        siteTransferPermitCheck: zupTransferPermitCheckCount,
        missingInZupMainFirm: realActiveNotInZupMainFirm,
        missingInZupSubcon: realActiveNotInZupSubcon,
        zupOnlyNoEba: zupOnlyNotInRealDB,
        passportMismatch: diffPassportCount,
        permitStatusMismatch: diffPermitStatusCount,
        innMismatch: diffInnCount,
        missingInnInEba: missingInnInEbaCount,
        sicilFormatDiff: diffSicilFormatCount,
        birthDateMismatch: diffBirthDateCount,
        kirilNameDiff: diffKirilNameCount,
        hireDateDiff: diffHireDateCount,
      },
    },
    byRegion,
    byPermitStatus,
    records: auditRecords,
  };

  gCache.__ponderaZupReconciliationCache = { key: cacheKey, data: result };
  return result;
}
