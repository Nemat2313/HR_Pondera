import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  DOC_SCAN_DEFINITIONS,
  EmployeeScanItem,
  TOTAL_DOC_SCAN_COLS,
  normalizeScanHeader,
  resolveDocScanColumnIndex,
} from '@/lib/documentScanDefinitions';
import { WORK_PERMIT_CASE_SQL, WorkPermitCategoryKey } from '@/lib/workPermits';
import { buildEffectiveRegionSqlCondition, resolveEffectiveRegion } from '@/lib/regionSiteHelper';

const EMPTY_MASK = '0'.repeat(TOTAL_DOC_SCAN_COLS);

export function normalizeSicilForScan(raw?: string | number | null): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  const digits = str.replace(/[^0-9]/g, '');
  if (!digits) return str;
  return digits.replace(/^0+/, '') || digits;
}

function countOnes(mask: string): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === '1') c++;
  }
  return c;
}

function normalizeMaskLength(mask: string): string {
  if (mask.length === TOTAL_DOC_SCAN_COLS) return mask;
  if (mask.length > TOTAL_DOC_SCAN_COLS) return mask.slice(0, TOTAL_DOC_SCAN_COLS);
  return mask.padEnd(TOTAL_DOC_SCAN_COLS, '0');
}

function setSystemInfo(db: any, key: string, value: string) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_info (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    db.prepare(
      `INSERT INTO system_info (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  } catch {
    // Ignore read-only environments
  }
}

function getSystemInfo(db: any, key: string, fallback = ''): string {
  try {
    const row = db.prepare(`SELECT value FROM system_info WHERE key = ?`).get(key) as
      | { value?: string }
      | undefined;
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export function ensureDocumentScansTableAndSeed(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personnel_document_scans (
      sicil_no TEXT PRIMARY KEY,
      norm_sicil TEXT NOT NULL,
      mask TEXT NOT NULL,
      uploaded_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_doc_scans_norm_sicil ON personnel_document_scans(norm_sicil);
  `);

  const countRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM personnel_document_scans`)
    .get() as { cnt?: number } | undefined;

  if ((countRow?.cnt || 0) > 0) {
    return;
  }

  const candidatePaths = [
    path.join(process.cwd(), 'data', 'document_scans_seed.json.gz'),
    path.resolve(process.cwd(), '../../data', 'document_scans_seed.json.gz'),
    '/var/www/hr_pondera/data/document_scans_seed.json.gz',
    '/root/HR_Pondera/data/document_scans_seed.json.gz',
  ];

  let seedPath = '';
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      seedPath = p;
      break;
    }
  }
  if (!seedPath) return;

  try {
    const compressed = fs.readFileSync(seedPath);
    const jsonStr = zlib.gunzipSync(compressed).toString('utf-8');
    const parsed = JSON.parse(jsonStr) as {
      sourceFile?: string;
      reportDate?: string;
      headers?: string[];
      rows?: Array<[string, string]>;
    };

    if (!parsed.rows || parsed.rows.length === 0) return;

    // Map seed headers if present
    const headerIndexMap: number[] = (parsed.headers || []).map((h, idx) => {
      const resolved = resolveDocScanColumnIndex(h);
      return resolved !== -1 ? resolved : idx < TOTAL_DOC_SCAN_COLS ? idx : -1;
    });

    const nowIso = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO personnel_document_scans (sicil_no, norm_sicil, mask, uploaded_count, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sicil_no) DO UPDATE SET
        norm_sicil = excluded.norm_sicil,
        mask = excluded.mask,
        uploaded_count = excluded.uploaded_count,
        updated_at = excluded.updated_at
    `);

    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [rawSicil, rawMask] of parsed.rows) {
        const sicil = String(rawSicil || '').trim();
        if (!sicil) continue;
        const normSicil = normalizeSicilForScan(sicil);
        const chars = EMPTY_MASK.split('');
        for (let i = 0; i < rawMask.length; i++) {
          const targetIdx = headerIndexMap[i] !== undefined ? headerIndexMap[i] : i;
          if (targetIdx >= 0 && targetIdx < TOTAL_DOC_SCAN_COLS && rawMask[i] === '1') {
            chars[targetIdx] = '1';
          }
        }
        const finalMask = chars.join('');
        insertStmt.run(sicil, normSicil, finalMask, countOnes(finalMask), nowIso);
      }
      db.exec('COMMIT');
    } catch (txErr) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw txErr;
    }

    setSystemInfo(db, 'doc_scans_source_file', parsed.sourceFile || 'Document_Control - Yeni.xlsx');
    setSystemInfo(db, 'doc_scans_report_date', parsed.reportDate || '06.11.2026');
    setSystemInfo(db, 'doc_scans_updated_at', nowIso);
    setSystemInfo(db, 'doc_scans_total_rows', String(parsed.rows.length));
  } catch {
    // Ignore seed failure on read-only DB
  }
}

export interface ParsedScanRow {
  sicil_no: string;
  norm_sicil: string;
  mask: string;
}

export function parseDocumentScansWorksheet(rawRows: any[][]): {
  records: ParsedScanRow[];
  presentColIndices: number[];
  matchedHeaders: string[];
} {
  if (!rawRows || rawRows.length < 2) {
    return { records: [], presentColIndices: [], matchedHeaders: [] };
  }

  let headerRowIdx = -1;
  let bestScore = 0;

  for (let r = 0; r < Math.min(20, rawRows.length); r++) {
    const row = rawRows[r] || [];
    let score = 0;
    for (const cell of row) {
      const h = normalizeScanHeader(String(cell || ''));
      if (!h) continue;
      if (
        h === 'employeeids id' ||
        h === 'employeeid' ||
        h === 'employee id' ||
        h === 'sicil no' ||
        h === 'sicil_no' ||
        h === 'sicil' ||
        h === 'personel no'
      ) {
        score += 5;
      } else if (resolveDocScanColumnIndex(String(cell || '')) !== -1) {
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = r;
    }
  }

  if (headerRowIdx === -1 || bestScore < 4) {
    return { records: [], presentColIndices: [], matchedHeaders: [] };
  }

  const headerRow = rawRows[headerRowIdx] || [];
  let sicilColIdx = -1;
  const colToCanonicalIdx: Array<{ excelCol: number; canonicalIdx: number; title: string }> = [];

  for (let c = 0; c < headerRow.length; c++) {
    const rawH = String(headerRow[c] || '').trim();
    const normH = normalizeScanHeader(rawH);
    if (!normH) continue;

    if (
      sicilColIdx === -1 &&
      (normH === 'employeeids id' ||
        normH === 'employeeid' ||
        normH === 'employee id' ||
        normH === 'sicil no' ||
        normH === 'sicil_no' ||
        normH === 'sicil' ||
        normH === 'personel no' ||
        normH === 'id')
    ) {
      sicilColIdx = c;
      continue;
    }

    const canIdx = resolveDocScanColumnIndex(rawH);
    if (canIdx !== -1) {
      colToCanonicalIdx.push({
        excelCol: c,
        canonicalIdx: canIdx,
        title: DOC_SCAN_DEFINITIONS[canIdx].labelTr,
      });
    }
  }

  if (sicilColIdx === -1) {
    sicilColIdx = 0;
  }

  if (colToCanonicalIdx.length === 0) {
    return { records: [], presentColIndices: [], matchedHeaders: [] };
  }

  const bySicil = new Map<string, ParsedScanRow>();

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;
    const rawSicil = String(row[sicilColIdx] ?? '').trim();
    if (!rawSicil || rawSicil.toLowerCase() === 'toplam' || rawSicil.toLowerCase() === 'total') {
      continue;
    }

    const normSicil = normalizeSicilForScan(rawSicil);
    if (!normSicil) continue;

    const chars = EMPTY_MASK.split('');
    // If duplicate row in same sheet, OR-merge uploaded flags
    const existing = bySicil.get(rawSicil);
    if (existing) {
      for (let i = 0; i < TOTAL_DOC_SCAN_COLS; i++) {
        chars[i] = existing.mask[i];
      }
    }

    for (const mapping of colToCanonicalIdx) {
      const cellVal = String(row[mapping.excelCol] ?? '')
        .trim()
        .toLowerCase();
      const isUploaded =
        cellVal === 'uploaded' ||
        cellVal === 'yuklendi' ||
        cellVal === 'yüklendi' ||
        cellVal === 'var' ||
        cellVal === 'evet' ||
        cellVal === '1' ||
        cellVal === 'true' ||
        cellVal === '+' ||
        cellVal === '✓' ||
        cellVal === '✔';
      if (isUploaded) {
        chars[mapping.canonicalIdx] = '1';
      } else if (!existing) {
        chars[mapping.canonicalIdx] = '0';
      }
    }

    bySicil.set(rawSicil, {
      sicil_no: rawSicil,
      norm_sicil: normSicil,
      mask: chars.join(''),
    });
  }

  const presentColIndices = Array.from(new Set(colToCanonicalIdx.map((m) => m.canonicalIdx))).sort(
    (a, b) => a - b
  );
  const matchedHeaders = presentColIndices.map((idx) => DOC_SCAN_DEFINITIONS[idx].labelTr);

  return {
    records: Array.from(bySicil.values()),
    presentColIndices,
    matchedHeaders,
  };
}

export function saveDocumentScansToDb(
  db: any,
  records: ParsedScanRow[],
  presentColIndices: number[],
  mode: 'upsert' | 'replace',
  fileName: string,
  reportDate: string
): { totalInDb: number; insertedCount: number; updatedCount: number } {
  ensureDocumentScansTableAndSeed(db);

  const nowIso = new Date().toISOString();
  let insertedCount = 0;
  let updatedCount = 0;

  const existingMap = new Map<string, { sicil_no: string; mask: string }>();
  if (mode === 'upsert') {
    const existingRows = db
      .prepare(`SELECT sicil_no, norm_sicil, mask FROM personnel_document_scans`)
      .all() as Array<{ sicil_no: string; norm_sicil: string; mask: string }>;
    for (const er of existingRows) {
      existingMap.set(er.sicil_no, { sicil_no: er.sicil_no, mask: normalizeMaskLength(er.mask) });
      if (!existingMap.has(er.norm_sicil)) {
        existingMap.set(er.norm_sicil, { sicil_no: er.sicil_no, mask: normalizeMaskLength(er.mask) });
      }
    }
  }

  const upsertStmt = db.prepare(`
    INSERT INTO personnel_document_scans (sicil_no, norm_sicil, mask, uploaded_count, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(sicil_no) DO UPDATE SET
      norm_sicil = excluded.norm_sicil,
      mask = excluded.mask,
      uploaded_count = excluded.uploaded_count,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    if (mode === 'replace') {
      db.exec(`DELETE FROM personnel_document_scans`);
    }

    for (const rec of records) {
      if (mode === 'replace') {
        const finalMask = normalizeMaskLength(rec.mask);
        upsertStmt.run(rec.sicil_no, rec.norm_sicil, finalMask, countOnes(finalMask), nowIso);
        insertedCount++;
      } else {
        const prev = existingMap.get(rec.sicil_no) || existingMap.get(rec.norm_sicil);
        const targetSicil = prev ? prev.sicil_no : rec.sicil_no;
        const chars = (prev ? prev.mask : EMPTY_MASK).split('');
        for (const colIdx of presentColIndices) {
          chars[colIdx] = rec.mask[colIdx] === '1' ? '1' : '0';
        }
        const mergedMask = chars.join('');
        upsertStmt.run(targetSicil, rec.norm_sicil, mergedMask, countOnes(mergedMask), nowIso);
        if (prev) updatedCount++;
        else insertedCount++;
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM personnel_document_scans`)
    .get() as { cnt?: number } | undefined;
  const totalInDb = totalRow?.cnt || 0;

  setSystemInfo(db, 'doc_scans_source_file', fileName || 'Document_Control.xlsx');
  setSystemInfo(db, 'doc_scans_report_date', reportDate);
  setSystemInfo(db, 'doc_scans_updated_at', nowIso);
  setSystemInfo(db, 'doc_scans_total_rows', String(totalInDb));

  return { totalInDb, insertedCount, updatedCount };
}

export function getDocumentScansDataset(
  db: any,
  scopeType = 'all',
  scopeVal = 'all'
): {
  success: true;
  meta: {
    sourceFile: string;
    reportDate: string;
    updatedAt: string;
    ebaFreshness: string;
    totalScanRowsInDb: number;
    matchedScanRows: number;
    unmatchedScanRows: number;
  };
  employees: EmployeeScanItem[];
} {
  ensureDocumentScansTableAndSeed(db);

  const scanRows = db
    .prepare(`SELECT sicil_no, norm_sicil, mask FROM personnel_document_scans`)
    .all() as Array<{ sicil_no: string; norm_sicil: string; mask: string }>;

  const exactScanMap = new Map<string, string>();
  const normScanMap = new Map<string, string>();
  for (const s of scanRows) {
    const cleanMask = normalizeMaskLength(s.mask);
    exactScanMap.set(String(s.sicil_no).trim(), cleanMask);
    if (s.norm_sicil) {
      normScanMap.set(String(s.norm_sicil).trim(), cleanMask);
    }
  }

  const rlsConditions: string[] = [];
  const rlsParams: any[] = [];
  if (scopeType === 'region' && scopeVal && scopeVal !== 'all') {
    const regCond = buildEffectiveRegionSqlCondition(scopeVal);
    rlsConditions.push(regCond.sql);
    rlsParams.push(...regCond.params);
  } else if (scopeType === 'project' && scopeVal && scopeVal !== 'all') {
    rlsConditions.push('proje_adi = ?');
    rlsParams.push(scopeVal);
  }

  const rlsWhere = rlsConditions.length > 0 ? `WHERE ${rlsConditions.join(' AND ')}` : '';

  const personnelRows = db
    .prepare(
      `SELECT
        id,
        sicil_no,
        ad_soyad,
        tam_adi_kiril,
        gorevi,
        departman,
        firma,
        region,
        proje_adi,
        uyruk,
        genel_durum,
        guncel_durum,
        ise_giris_tarihi,
        (${WORK_PERMIT_CASE_SQL}) AS permit_category
      FROM personnel
      ${rlsWhere}
      ORDER BY id ASC`
    )
    .all(...rlsParams) as Array<{
    id: number;
    sicil_no: string;
    ad_soyad: string;
    tam_adi_kiril: string;
    gorevi: string;
    departman: string;
    firma: string;
    region: string;
    proje_adi: string;
    uyruk: string;
    genel_durum: string;
    guncel_durum: string;
    ise_giris_tarihi: string;
    permit_category: WorkPermitCategoryKey;
  }>;

  const matchedScanKeys = new Set<string>();
  const employees: EmployeeScanItem[] = [];

  for (const p of personnelRows) {
    const rawSicil = String(p.sicil_no || '').trim();
    const normSicil = normalizeSicilForScan(rawSicil);

    let mask = exactScanMap.get(rawSicil);
    let inScanReport = false;
    if (mask !== undefined) {
      inScanReport = true;
      matchedScanKeys.add(normSicil || rawSicil);
    } else if (normSicil && normScanMap.has(normSicil)) {
      mask = normScanMap.get(normSicil);
      inScanReport = true;
      matchedScanKeys.add(normSicil);
    }

    const gdLow = String(p.genel_durum || '').toLowerCase();
    const isActiveOrPending =
      gdLow.includes('mevcut') || gdLow.includes('bekleniyor') || gdLow.includes('sevke');

    // Keep all active/pending personnel AND any exited personnel who exist in the eBA scan report
    if (!isActiveOrPending && !inScanReport) {
      continue;
    }

    const firmaStr = String(p.firma || '').trim();
    const isMainFirm = firmaStr.toUpperCase().includes('PONDERA');

    employees.push({
      id: p.id,
      sicilNo: rawSicil,
      adSoyad: String(p.ad_soyad || '').trim() || rawSicil,
      fioKiril: String(p.tam_adi_kiril || '').trim(),
      gorevi: String(p.gorevi || '').trim() || '-',
      departman: String(p.departman || '').trim() || '-',
      firma: firmaStr || 'Diğer',
      isMainFirm,
      region: resolveEffectiveRegion(p.region, p.proje_adi, 'Diğer'),
      projeAdi: String(p.proje_adi || '').trim() || 'Genel',
      uyruk: String(p.uyruk || '').trim().toUpperCase() || 'BELIRTILMEMIS',
      genelDurum: String(p.genel_durum || '').trim() || 'Mevcut',
      guncelDurum: String(p.guncel_durum || '').trim() || 'Mevcut',
      iseGirisTarihi: String(p.ise_giris_tarihi || '').trim() || '-',
      permitCategory: (p.permit_category || 'OTHER_PENDING') as WorkPermitCategoryKey,
      inScanReport,
      mask: mask || EMPTY_MASK,
    });
  }

  // If unscoped ('all'), also attach unmatched eBA scan rows so 100% of Excel rows can be inspected if needed
  let unmatchedCount = 0;
  let syntheticId = -1;
  for (const s of scanRows) {
    const rawSicil = String(s.sicil_no || '').trim();
    const normSicil = String(s.norm_sicil || '').trim() || rawSicil;
    if (!matchedScanKeys.has(normSicil) && !matchedScanKeys.has(rawSicil)) {
      unmatchedCount++;
      if (scopeType === 'all' || !scopeType) {
        employees.push({
          id: syntheticId--,
          sicilNo: rawSicil,
          adSoyad: `eBA Kaydı (#${rawSicil})`,
          fioKiril: '',
          gorevi: '-',
          departman: '-',
          firma: 'eBA Arşiv (Ana Listede Eşleşmedi)',
          isMainFirm: true,
          region: 'Eşleşmeyen (Yeni / Arşiv)',
          projeAdi: 'Ana Personel Listesinde Yok',
          uyruk: 'BELIRTILMEMIS',
          genelDurum: 'eBA Sadece',
          guncelDurum: 'eBA Sadece',
          iseGirisTarihi: '-',
          permitCategory: 'OTHER_PENDING',
          inScanReport: true,
          mask: normalizeMaskLength(s.mask),
        });
      }
    }
  }

  const todayDisplay = (() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  })();

  return {
    success: true,
    meta: {
      sourceFile: getSystemInfo(db, 'doc_scans_source_file', 'Document_Control - Yeni.xlsx'),
      reportDate: getSystemInfo(db, 'doc_scans_report_date', '06.11.2026'),
      updatedAt: getSystemInfo(db, 'doc_scans_updated_at', new Date().toISOString()),
      ebaFreshness: getSystemInfo(db, 'data_freshness', todayDisplay),
      totalScanRowsInDb: scanRows.length,
      matchedScanRows: scanRows.length - unmatchedCount,
      unmatchedScanRows: unmatchedCount,
    },
    employees,
  };
}
