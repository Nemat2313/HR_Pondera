import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { classifyWorkPermitFromRow, buildNormalizedDateSql } from '@/lib/workPermits';

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
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s) || /^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const yyyy = s.slice(6, 10);
    const mm = s.slice(3, 5);
    const dd = s.slice(0, 2);
    return `${yyyy === '2027' ? '2026' : yyyy}-${mm}-${dd}`;
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
  if (ts.includes('РЕЗИДЕНТ') && !ts.includes('НЕРЕЗИДЕНТ')) {
    return 'RESIDENT';
  }
  return 'QUOTA_RNR';
}

export function ensureZupTableAndSeed(db: any): void {
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
      schedule TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_zup_tabel ON zup_official_personnel(tabel_no);
    CREATE INDEX IF NOT EXISTS idx_zup_norm_sicil ON zup_official_personnel(norm_sicil);
  `);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM zup_official_personnel').get() as { c: number };
  const srcRow = db
    .prepare("SELECT value FROM system_info WHERE key = 'zup_source_file'")
    .get() as { value?: string } | undefined;
  const vksCountRow = db
    .prepare("SELECT COUNT(*) as c FROM zup_official_personnel WHERE permit_category = 'VKS'")
    .get() as { c: number };

  const needsReseed =
    !countRow ||
    countRow.c === 0 ||
    (srcRow?.value && srcRow.value.includes('???')) ||
    (countRow.c === 4594 && (!vksCountRow || vksCountRow.c === 0));

  if (!needsReseed) {
    return;
  }

  // Auto-seed from data/zup_official_seed.json.gz if table is empty or had mangled encoding
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
      citizenship_tr: CITIZENSHIP_RU_TO_TR[String(r.citizenship_ru || '').toUpperCase()] || r.citizenship_tr || r.citizenship_ru,
    }));
    if (records.length === 0) return;

    const cleanSource =
      parsed.source_file && !parsed.source_file.includes('???')
        ? parsed.source_file
        : 'Список сотрудников на 29.10.xlsx';

    saveZupRecordsToDb(
      db,
      records,
      parsed.report_date || '29.10.2026',
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
  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM zup_official_personnel').run();
    const stmt = db.prepare(`
      INSERT INTO zup_official_personnel (
        row_no, fio_kiril, gender, birth_date, tabel_no, norm_sicil,
        position_ru, hire_date, tax_status, permit_category,
        citizenship_ru, citizenship_tr, inn, snils,
        doc_no, doc_series, doc_issued_by, doc_dept_code, doc_issue_date, schedule
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        r.schedule || ''
      );
    }

    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    const infoStmt = db.prepare('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)');
    infoStmt.run('zup_data_freshness', reportDate);
    infoStmt.run('zup_source_file', sourceFile);
    infoStmt.run('zup_total_records', String(records.length));
    infoStmt.run('zup_last_updated', new Date().toISOString().slice(0, 19).replace('T', ' '));

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

export function parseZupWorksheetRows(rawRows: any[][]): ZupOfficialRecord[] {
  if (!rawRows || rawRows.length < 2) return [];

  // Find header row (usually row 0, containing 'Сотрудник' or 'Табельный')
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowStr = (rawRows[i] || []).map((c) => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('сотрудник') || rowStr.includes('табельн') || rowStr.includes('sicil')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (rawRows[headerRowIdx] || []).map((h) =>
    String(h || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  );

  const findCol = (candidates: string[], fallbackIdx: number) => {
    for (const cand of candidates) {
      const idx = headers.findIndex((h) => h === cand || h.includes(cand));
      if (idx !== -1) return idx;
    }
    return fallbackIdx;
  };

  const idxNo = findCol(['№', 'nomer', 'sira'], 0);
  const idxFio = findCol(['сотрудник', 'фио', 'tam adı', 'ad soyad'], 1);
  const idxGender = findCol(['пол', 'cinsiyet'], 2);
  const idxDob = findCol(['дата рождения', 'doğum tarihi'], 3);
  const idxTabel = findCol(['табельный номер', 'табельный', 'sicil no'], 4);
  const idxPos = findCol(['должность', 'görevi'], 5);
  const idxHire = findCol(['дата приема', 'işe giriş'], 6);
  const idxTax = findCol(['статус налогоплательщика', 'çalışma kart türü'], 7);
  const idxCit = findCol(['страна гражданства', 'гражданство', 'uyruk'], 8);
  const idxInn = findCol(['инн', 'inn'], 9);
  const idxSnils = findCol(['снилс', 'cnils', 'snils'], 10);
  const idxDocNo = findCol(['удостоверение.номер', 'номер паспорта', 'pasaport no'], 11);
  const idxDocSer = findCol(['удостоверение.серия', 'серия паспорта', 'pasaport seri'], 12);
  const idxDocBy = findCol(['удостоверение.кем выдан', 'кем выдан'], 13);
  const idxDocCode = findCol(['удостоверение.код подразделения', 'код подразделения'], 14);
  const idxDocDate = findCol(['удостоверение.дата выдачи', 'дата выдачи'], 15);
  const idxSched = findCol(['график работы', 'график'], 16);

  const records: ZupOfficialRecord[] = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !Array.isArray(r)) continue;
    const fio = String(r[idxFio] ?? '').trim().replace(/\s+/g, ' ');
    const tabel = String(r[idxTabel] ?? '').trim();
    if (!fio && !tabel) continue;

    const taxStatus = String(r[idxTax] ?? '').trim();
    const citRu = String(r[idxCit] ?? '').trim().toUpperCase();
    const citTr = CITIZENSHIP_RU_TO_TR[citRu] || citRu;

    records.push({
      row_no: Number(r[idxNo]) || records.length + 1,
      fio_kiril: fio,
      gender: String(r[idxGender] ?? '').trim(),
      birth_date: normalizeDateValue(r[idxDob]),
      tabel_no: tabel,
      norm_sicil: normalizeSicilDigits(tabel),
      position_ru: String(r[idxPos] ?? '').trim(),
      hire_date: normalizeDateValue(r[idxHire]),
      tax_status: taxStatus,
      permit_category: mapZupTaxStatusToPermitCategory(taxStatus),
      citizenship_ru: citRu,
      citizenship_tr: citTr,
      inn: normalizeDigitsOnly(String(r[idxInn] ?? '')),
      snils: String(r[idxSnils] ?? '').trim(),
      doc_no: String(r[idxDocNo] ?? '').trim(),
      doc_series: String(r[idxDocSer] ?? '').trim(),
      doc_issued_by: String(r[idxDocBy] ?? '').trim(),
      doc_dept_code: String(r[idxDocCode] ?? '').trim(),
      doc_issue_date: normalizeDateValue(r[idxDocDate]),
      schedule: String(r[idxSched] ?? '').trim(),
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
      "SELECT key, value FROM system_info WHERE key IN ('data_freshness', 'source_file', 'zup_data_freshness', 'zup_source_file', 'zup_last_updated')"
    )
    .all() as { key: string; value: string }[];
  const sysMap: Record<string, string> = {};
  for (const r of sysRows) {
    sysMap[r.key] = r.value;
  }

  const ebaDate = sysMap['data_freshness'] || '31.10.2026';
  const zupDate = sysMap['zup_data_freshness'] || '29.10.2026';
  const rawZupSource = sysMap['zup_source_file'] || 'Список сотрудников на 29.10.xlsx';
  const zupSourceFile = rawZupSource.includes('???')
    ? 'Список сотрудников на 29.10.xlsx'
    : rawZupSource;
  const zupLastUpdated = sysMap['zup_last_updated'] || '';

  const cacheKey = `${pVer.cnt}:${pVer.maxId}:${zVer.cnt}:${zVer.maxId}:${ebaDate}:${zupDate}`;
  const gCache = globalThis as unknown as {
    __ponderaZupReconciliationCache?: { key: string; data: any };
  };
  if (gCache.__ponderaZupReconciliationCache?.key === cacheKey) {
    return gCache.__ponderaZupReconciliationCache.data;
  }

  const zupRows = (
    db.prepare('SELECT * FROM zup_official_personnel ORDER BY row_no ASC').all() as ZupOfficialRecord[]
  ).map((r) => ({
    ...r,
    permit_category: mapZupTaxStatusToPermitCategory(r.tax_status),
    citizenship_tr:
      CITIZENSHIP_RU_TO_TR[String(r.citizenship_ru || '').toUpperCase()] ||
      r.citizenship_tr ||
      r.citizenship_ru,
  }));

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
        uyruk: zr.citizenship_tr || zr.citizenship_ru,
        region: '1C ZUP Kaydı',
        proje_adi: 'eBA Kaydı Yok',
        firma: 'PONDERA (1C ZUP)',
        gorev: zr.position_ru,
        eba_status: 'Kaydı Yok',
        zup_status: '1C ZUP Aktif',
        eba_permit: '—',
        zup_permit: zr.permit_category,
        zup_tax_status: zr.tax_status,
        eba_passport: '—',
        zup_passport: `${zr.doc_series ? zr.doc_series + ' ' : ''}${zr.doc_no}`.trim(),
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
      uyruk: matchedEba.uyruk || zr.citizenship_tr,
      region: matchedEba.region || 'Belirtilmemiş',
      proje_adi: matchedEba.proje_adi || 'Belirtilmemiş',
      firma: matchedEba.firma || 'PONDERA',
      gorev: matchedEba.gorevi || zr.position_ru,
      zup_position: zr.position_ru,
      eba_status: isInterSiteTransfer && !isEbaActive ? `Şantiye Transferi (${exitReasonStr || 'Transfer'})` : matchedEba.genel_durum,
      zup_status: '1C ZUP Aktif',
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
    const reg = r.region || 'Diğer';
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
    const isMainFirm = String(r.firma || '').toUpperCase().includes('PONDERA');
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
        const isAfter29Oct = hireIso >= '2026-10-29';
        if (isAfter29Oct) {
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
            ? isAfter29Oct
              ? ['RECENT_HIRE_AFTER_ZUP', 'MISSING_IN_ZUP_MAIN']
              : ['MISSING_IN_ZUP_MAIN']
            : ['SUBCON_NOT_IN_ZUP'],
          sicil_no: r.sicil_no || '—',
          zup_tabel_no: '—',
          name: r.ad_soyad || '—',
          kiril_name: r.tam_adi_kiril || '—',
          uyruk: r.uyruk || '—',
          region: r.region || '—',
          proje_adi: r.proje_adi || '—',
          firma: r.firma || '—',
          gorev: r.gorevi || '—',
          zup_position: '—',
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
                isAfter29Oct
                  ? `Pondera Ana Kadroda aktif (Giriş: ${formatIsoToDisplay(hireIso)} — 29.10 ZUP listesinden sonra işe girmiş).`
                  : `Pondera Ana Kadroda (${r.firma}) sahada aktif görünüyor ancak 1C ZUP resmi listesinde kaydı yok!`,
              ]
            : [`Taşeron firma (${r.firma || 'Taşeron'}) personeli — Pondera 1C ZUP bordrosu dışında.`],
          diffDetailsRu: isMainFirm
            ? [
                isAfter29Oct
                  ? `Основной штат Pondera (Принят: ${formatIsoToDisplay(hireIso)} — после выгрузки ЗУП от 29.10).`
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

  const result = {
    success: true,
    metadata: {
      ebaDate,
      zupDate,
      zupSourceFile,
      zupLastUpdated,
      isZupOutdated: zupDate.trim() !== ebaDate.trim(),
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
