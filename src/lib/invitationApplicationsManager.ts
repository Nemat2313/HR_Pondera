import * as XLSX from 'xlsx';
import { getDb } from '@/lib/db';

export interface InvitationApplicationRecord {
  id: number;
  row_no: number;
  batch_row_no: number;
  sicil_no: string;
  fio_kiril: string;
  fio_latin: string;
  opis_no: string;
  app_date: string;
  app_date_iso: string;
  entry_from: string;
  entry_from_iso: string;
  visa_end: string;
  visa_type: string;
  visa_multiplicity: string;
  route_cities: string;
  doc_type: string;
  passport_no: string;
  passport_last3: string;
  passport_issue_date: string;
  passport_expiry_date: string;
  birth_date: string;
  gender: string;
  citizenship: string;
  birth_country: string;
  birth_place: string;
  abroad_country: string;
  abroad_address: string;
  consulate_country: string;
  consulate_city: string;
  stay_country: string;
  destination_city: string;
  ig_category: string;
  comments: string;
  source_type: 'excel' | 'manual';
  matched_invitation_no: string;
  matched_pdf_filename: string;
  matched_received_date: string;
  waiting_days: number | null;
  status_key: 'ARRIVED' | 'WAITING' | 'OVERDUE' | 'NO_DATE';
  created_by: string;
  updated_at: string;
}

export interface NormalizedDatePair {
  display: string; // DD.MM.YYYY
  iso: string; // YYYY-MM-DD
}

export function normalizeMessyDate(rawVal: unknown): NormalizedDatePair {
  if (rawVal === null || rawVal === undefined) return { display: '', iso: '' };

  if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
    const dd = String(rawVal.getUTCDate()).padStart(2, '0');
    const mm = String(rawVal.getUTCMonth() + 1).padStart(2, '0');
    const yy = rawVal.getUTCFullYear();
    return { display: `${dd}.${mm}.${yy}`, iso: `${yy}-${mm}-${dd}` };
  }

  let s = String(rawVal).trim();
  if (!s || s === '-' || s === '—' || s.toLowerCase() === 'нет' || s.toLowerCase() === 'yok') {
    return { display: '', iso: '' };
  }

  // Excel serial number (e.g. 46043 or 46043.0)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 15000 && serial <= 65000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!Number.isNaN(d.getTime())) {
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const yy = d.getUTCFullYear();
        return { display: `${dd}.${mm}.${yy}`, iso: `${yy}-${mm}-${dd}` };
      }
    }
  }

  // Clean typos like "24..11.2025", "24,11,2025", extra spaces
  s = s.replace(/[,/\\-]+/g, '.').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim();

  // YYYY.MM.DD
  const ymd = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (ymd) {
    const yy = Number(ymd[1]);
    const mm = Number(ymd[2]);
    const dd = Number(ymd[3]);
    if (yy >= 1930 && yy <= 2050 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const dStr = String(dd).padStart(2, '0');
      const mStr = String(mm).padStart(2, '0');
      return { display: `${dStr}.${mStr}.${yy}`, iso: `${yy}-${mStr}-${dStr}` };
    }
  }

  // DD.MM.YYYY or D.M.YY
  const dmy = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (dmy) {
    let dd = Number(dmy[1]);
    let mm = Number(dmy[2]);
    let yy = Number(dmy[3]);
    if (yy < 100) yy = yy >= 40 ? 1900 + yy : 2000 + yy;
    // Handle swapped MM.DD.YYYY if month > 12 and day <= 12
    if (mm > 12 && dd <= 12) {
      const tmp = dd;
      dd = mm;
      mm = tmp;
    }
    if (yy >= 1930 && yy <= 2050 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const dStr = String(dd).padStart(2, '0');
      const mStr = String(mm).padStart(2, '0');
      return { display: `${dStr}.${mStr}.${yy}`, iso: `${yy}-${mStr}-${dStr}` };
    }
  }

  return { display: '', iso: '' };
}

function cleanStr(val: unknown): string {
  return String(val ?? '').replace(/\s+/g, ' ').trim();
}

function cleanPassport(val: unknown): { full: string; last3: string } {
  const full = cleanStr(val).replace(/\s+/g, '').toUpperCase();
  const alnum = full.replace(/[^0-9A-ZА-ЯЁ]/g, '');
  const last3 = alnum.length >= 3 ? alnum.slice(-3) : alnum;
  return { full, last3 };
}

function normalizeCategoryLabel(raw: string): string {
  const low = raw.toLowerCase();
  if (low.includes('вкс') || low.includes('высококвал') || low.includes('vks')) {
    return 'VKS';
  }
  if (!low || low === 'нет' || low === 'yok' || low === '-') {
    return 'Kota / RNR';
  }
  return raw;
}

export function ensureInvitationApplicationsTable(dbInstance?: any): void {
  const gState = globalThis as Record<string, any>;
  if (gState.__ponderaInvAppsEnsured) return;

  const db = dbInstance || getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS invitation_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedup_key TEXT UNIQUE NOT NULL,
      row_no INTEGER DEFAULT 0,
      batch_row_no INTEGER DEFAULT 0,
      sicil_no TEXT DEFAULT '',
      fio_kiril TEXT DEFAULT '',
      fio_latin TEXT DEFAULT '',
      opis_no TEXT DEFAULT '',
      app_date TEXT DEFAULT '',
      app_date_iso TEXT DEFAULT '',
      entry_from TEXT DEFAULT '',
      entry_from_iso TEXT DEFAULT '',
      visa_end TEXT DEFAULT '',
      visa_type TEXT DEFAULT '',
      visa_multiplicity TEXT DEFAULT '',
      route_cities TEXT DEFAULT '',
      doc_type TEXT DEFAULT '',
      passport_no TEXT DEFAULT '',
      passport_last3 TEXT DEFAULT '',
      passport_issue_date TEXT DEFAULT '',
      passport_expiry_date TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      citizenship TEXT DEFAULT '',
      birth_country TEXT DEFAULT '',
      birth_place TEXT DEFAULT '',
      abroad_country TEXT DEFAULT '',
      abroad_address TEXT DEFAULT '',
      consulate_country TEXT DEFAULT '',
      consulate_city TEXT DEFAULT '',
      stay_country TEXT DEFAULT '',
      destination_city TEXT DEFAULT '',
      ig_category TEXT DEFAULT '',
      comments TEXT DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'excel',
      matched_invitation_no TEXT DEFAULT '',
      matched_pdf_filename TEXT DEFAULT '',
      matched_received_date TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_inv_apps_p3 ON invitation_applications(passport_last3);
    CREATE INDEX IF NOT EXISTS idx_inv_apps_sicil ON invitation_applications(sicil_no);
    CREATE INDEX IF NOT EXISTS idx_inv_apps_invno ON invitation_applications(matched_invitation_no);
    CREATE INDEX IF NOT EXISTS idx_inv_apps_dob ON invitation_applications(birth_date);
  `);

  gState.__ponderaInvAppsEnsured = true;
}

export function parseInvitationApplicationsExcel(buffer: Buffer, fileName: string, actorName: string): {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  sheetName: string;
} {
  const db = getDb();
  ensureInvitationApplicationsTable(db);

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes('ПРИГЛАШЕНИЯ') && !s.toUpperCase().includes('СЧС')) ||
    wb.SheetNames.find((s) => s.toUpperCase().includes('INVIT') || s.toUpperCase().includes('DAVET')) ||
    wb.SheetNames[0];

  if (!sheetName) {
    throw new Error('Excel dosyasında geçerli bir ПРИГЛАШЕНИЯ sayfası bulunamadı.');
  }

  const ws = wb.Sheets[sheetName];
  // Reads ALL columns including hidden columns automatically
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][];
  if (rows.length < 2) {
    throw new Error('Excel sayfasında veri satırı bulunamadı.');
  }

  // Locate header row dynamically (usually row 0)
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const joined = rows[r].map((c) => cleanStr(c).toLowerCase()).join('|');
    if (joined.includes('паспорт') || joined.includes('табельн') || joined.includes('фамилия')) {
      headerRowIdx = r;
      break;
    }
  }

  const header = rows[headerRowIdx].map((h) => cleanStr(h).toLowerCase());
  const findCol = (patterns: string[], fallbackIdx: number): number => {
    for (let i = 0; i < header.length; i++) {
      if (patterns.some((p) => header[i].includes(p))) return i;
    }
    return fallbackIdx;
  };

  const cRowNo = 0;
  const cBatchNo = 1;
  const cSicil = findCol(['табельн', 'sicil'], 2);
  const cFioKiril = findCol(['фамилия имя отчество', 'фио'], 3);
  const cOpis = findCol(['описи', 'opis'], 4);
  const cAppDate = findCol(['дата принятых', 'дата подачи', 'başvuru'], 5);
  const cEntryFrom = findCol(['въезд с', 'giriş'], 6);
  const cVisaEnd = findCol(['срок окончания визы', 'vize bitiş'], 7);
  const cVisaType = findCol(['вид визы'], 8);
  const cVisaMult = findCol(['кратность'], 9);
  const cRoute = findCol(['маршрут'], 10);
  const cDocType = findCol(['тип документа'], 11);
  const cPassport = findCol(['паспорт'], 12);
  const cPassIssue = findCol(['дата выдачи паспорта'], 13);
  const cPassExp = findCol(['дата окончания действия паспорта'], 14);
  const cLatLast = findCol(['фамилия лат'], 18);
  const cLatFirst = findCol(['имя лат'], 19);
  const cLatMid = findCol(['отчество лат'], 20);
  const cDob = findCol(['дата рождения'], 21);
  const cGender = findCol(['пол'], 22);
  const cCit = findCol(['гражданство'], 23);
  const cBirthCountry = findCol(['страна рождения'], 24);
  const cBirthPlace = findCol(['место рождения'], 25);
  const cAbroadCountry = 26;
  const cAbroadAddr = findCol(['адрес проживания'], 27);
  const cConsulCountry = 28;
  const cConsulCity = findCol(['адрес получения визы'], 29);
  const cStayCountry = 30;
  const cDestCity = findCol(['адрес предпологаемого', 'адрес предполагаемого', 'пребывания'], 31);
  const cCategory = findCol(['категория иг', 'категория'], 32);
  const cComments = findCol(['комментар'], 33);

  const upsertStmt = db.prepare(`
    INSERT INTO invitation_applications (
      dedup_key, row_no, batch_row_no, sicil_no, fio_kiril, fio_latin, opis_no,
      app_date, app_date_iso, entry_from, entry_from_iso, visa_end, visa_type, visa_multiplicity,
      route_cities, doc_type, passport_no, passport_last3, passport_issue_date, passport_expiry_date,
      birth_date, gender, citizenship, birth_country, birth_place, abroad_country, abroad_address,
      consulate_country, consulate_city, stay_country, destination_city, ig_category, comments,
      source_type, created_by, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      'excel', ?, ?
    )
    ON CONFLICT(dedup_key) DO UPDATE SET
      row_no = excluded.row_no,
      batch_row_no = excluded.batch_row_no,
      sicil_no = CASE WHEN excluded.sicil_no != '' THEN excluded.sicil_no ELSE invitation_applications.sicil_no END,
      fio_kiril = excluded.fio_kiril,
      fio_latin = CASE WHEN excluded.fio_latin != '' THEN excluded.fio_latin ELSE invitation_applications.fio_latin END,
      opis_no = CASE WHEN excluded.opis_no != '' THEN excluded.opis_no ELSE invitation_applications.opis_no END,
      app_date = CASE WHEN excluded.app_date != '' THEN excluded.app_date ELSE invitation_applications.app_date END,
      app_date_iso = CASE WHEN excluded.app_date_iso != '' THEN excluded.app_date_iso ELSE invitation_applications.app_date_iso END,
      entry_from = excluded.entry_from,
      entry_from_iso = excluded.entry_from_iso,
      visa_end = excluded.visa_end,
      visa_type = excluded.visa_type,
      visa_multiplicity = excluded.visa_multiplicity,
      route_cities = excluded.route_cities,
      passport_no = excluded.passport_no,
      passport_last3 = excluded.passport_last3,
      passport_issue_date = excluded.passport_issue_date,
      passport_expiry_date = excluded.passport_expiry_date,
      birth_date = excluded.birth_date,
      citizenship = excluded.citizenship,
      birth_place = excluded.birth_place,
      consulate_city = excluded.consulate_city,
      destination_city = excluded.destination_city,
      ig_category = excluded.ig_category,
      comments = CASE WHEN excluded.comments != '' THEN excluded.comments ELSE invitation_applications.comments END,
      updated_at = excluded.updated_at
  `);

  const existingKeys = new Set<string>(
    (db.prepare('SELECT dedup_key FROM invitation_applications').all() as { dedup_key: string }[]).map(
      (x) => x.dedup_key
    )
  );

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) {
        skippedCount++;
        continue;
      }

      const fioKiril = cleanStr(row[cFioKiril]);
      const { full: passportNo, last3: passportLast3 } = cleanPassport(row[cPassport]);
      if (!fioKiril && !passportNo) {
        skippedCount++;
        continue;
      }

      const sicilNo = cleanStr(row[cSicil]).replace(/\.0$/, '');
      const opisNo = cleanStr(row[cOpis]).replace(/\.0$/, '');
      const appDate = normalizeMessyDate(row[cAppDate]);
      const entryFrom = normalizeMessyDate(row[cEntryFrom]);
      const visaEnd = normalizeMessyDate(row[cVisaEnd]);
      const passIssue = normalizeMessyDate(row[cPassIssue]);
      const passExp = normalizeMessyDate(row[cPassExp]);
      const dob = normalizeMessyDate(row[cDob]);

      const fioLatin = [cleanStr(row[cLatLast]), cleanStr(row[cLatFirst]), cleanStr(row[cLatMid])]
        .filter(Boolean)
        .join(' ');

      const rowNo = Number(row[cRowNo]) || r;
      const batchRowNo = Number(row[cBatchNo]) || 0;

      // Stable dedup key so re-uploading the shared-folder Excel updates existing rows cleanly
      const dedupKey = passportNo
        ? `P:${passportNo}|E:${entryFrom.iso || appDate.iso || rowNo}|O:${opisNo}`
        : `N:${fioKiril.toUpperCase()}|D:${dob.iso}|R:${rowNo}`;

      const isUpdate = existingKeys.has(dedupKey);
      upsertStmt.run(
        dedupKey,
        rowNo,
        batchRowNo,
        sicilNo,
        fioKiril,
        fioLatin,
        opisNo,
        appDate.display,
        appDate.iso,
        entryFrom.display,
        entryFrom.iso,
        visaEnd.display,
        cleanStr(row[cVisaType]),
        cleanStr(row[cVisaMult]),
        cleanStr(row[cRoute]),
        cleanStr(row[cDocType]),
        passportNo,
        passportLast3,
        passIssue.display,
        passExp.display,
        dob.display,
        cleanStr(row[cGender]),
        cleanStr(row[cCit]),
        cleanStr(row[cBirthCountry]),
        cleanStr(row[cBirthPlace]),
        cleanStr(row[cAbroadCountry]),
        cleanStr(row[cAbroadAddr]),
        cleanStr(row[cConsulCountry]),
        cleanStr(row[cConsulCity]),
        cleanStr(row[cStayCountry]),
        cleanStr(row[cDestCity]),
        normalizeCategoryLabel(cleanStr(row[cCategory])),
        cleanStr(row[cComments]),
        actorName,
        nowIso
      );

      if (isUpdate) updatedCount++;
      else {
        importedCount++;
        existingKeys.add(dedupKey);
      }
    }

    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    db.prepare('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)').run(
      'invitations_apps_last_file',
      fileName
    );
    db.prepare('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)').run(
      'invitations_apps_last_updated',
      new Date().toLocaleString('tr-TR')
    );

    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  syncApplicationsWithPersonnelAndMvd(db);

  return { importedCount, updatedCount, skippedCount, sheetName };
}

export function syncApplicationsWithPersonnelAndMvd(dbInstance?: any): {
  enrichedSicilCount: number;
  linkedMvdCount: number;
} {
  const db = dbInstance || getDb();
  ensureInvitationApplicationsTable(db);

  let enrichedSicilCount = 0;
  let linkedMvdCount = 0;

  // 1. Backfill missing sicil_no in invitation_applications by matching full passport_no in personnel
  try {
    const missingSicilApps = db
      .prepare("SELECT id, passport_no FROM invitation_applications WHERE (sicil_no IS NULL OR TRIM(sicil_no) = '') AND passport_no != ''")
      .all() as { id: number; passport_no: string }[];

    if (missingSicilApps.length > 0) {
      const pRows = db
        .prepare("SELECT sicil_no, pasaport_no FROM personnel WHERE pasaport_no IS NOT NULL AND TRIM(pasaport_no) != ''")
        .all() as { sicil_no: string; pasaport_no: string }[];
      const sicilByPassport = new Map<string, string>();
      for (const p of pRows) {
        const cleanP = cleanStr(p.pasaport_no).replace(/\s+/g, '').toUpperCase();
        if (cleanP && p.sicil_no) {
          sicilByPassport.set(cleanP, cleanStr(p.sicil_no));
          const digits = cleanP.replace(/[^0-9]/g, '');
          if (digits.length >= 6 && !sicilByPassport.has(digits)) {
            sicilByPassport.set(digits, cleanStr(p.sicil_no));
          }
        }
      }

      const updSicil = db.prepare('UPDATE invitation_applications SET sicil_no = ? WHERE id = ?');
      for (const app of missingSicilApps) {
        const cp = cleanStr(app.passport_no).replace(/\s+/g, '').toUpperCase();
        const digits = cp.replace(/[^0-9]/g, '');
        const foundSicil = sicilByPassport.get(cp) || (digits.length >= 6 ? sicilByPassport.get(digits) : undefined);
        if (foundSicil) {
          updSicil.run(foundSicil, app.id);
          enrichedSicilCount++;
        }
      }
    }
  } catch {
    // ignore if personnel missing
  }

  // 2. Link incoming MVD invitations (mvd_invitations) to invitation_applications
  try {
    const mvdExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mvd_invitations'")
      .get();
    if (mvdExists) {
      const mvdRows = db
        .prepare(
          'SELECT id, invitation_no, passport_last3, birth_date, passport_issue_date, matched_sicil_no, pdf_filename, email_received_display FROM mvd_invitations'
        )
        .all() as Array<{
        id: number;
        invitation_no: string;
        passport_last3: string;
        birth_date: string;
        passport_issue_date: string;
        matched_sicil_no: string;
        pdf_filename: string;
        email_received_display: string;
      }>;

      const appRows = db
        .prepare(
          'SELECT id, sicil_no, fio_kiril, fio_latin, passport_no, passport_last3, birth_date, passport_issue_date, destination_city, matched_invitation_no FROM invitation_applications ORDER BY id DESC'
        )
        .all() as Array<{
        id: number;
        sicil_no: string;
        fio_kiril: string;
        fio_latin: string;
        passport_no: string;
        passport_last3: string;
        birth_date: string;
        passport_issue_date: string;
        destination_city: string;
        matched_invitation_no: string;
      }>;

      const updAppLink = db.prepare(
        'UPDATE invitation_applications SET matched_invitation_no = ?, matched_pdf_filename = ?, matched_received_date = ? WHERE id = ?'
      );

      for (const mvd of mvdRows) {
        const mP3 = cleanStr(mvd.passport_last3).toUpperCase();
        const mDob = normalizeMessyDate(mvd.birth_date).display;
        const mIssue = normalizeMessyDate(mvd.passport_issue_date).display;
        const mSicil = cleanStr(mvd.matched_sicil_no);

        let bestApp: (typeof appRows)[number] | null = null;
        let bestScore = 0;

        for (const app of appRows) {
          let score = 0;
          if (mSicil && app.sicil_no && mSicil === app.sicil_no) score += 60;
          if (mP3 && app.passport_last3 && mP3 === app.passport_last3.toUpperCase()) score += 40;
          if (mDob && app.birth_date && mDob === app.birth_date) score += 40;
          if (mIssue && app.passport_issue_date && mIssue === app.passport_issue_date) score += 35;

          if (score >= 80 && score > bestScore) {
            bestScore = score;
            bestApp = app;
          }
        }

        if (bestApp) {
          updAppLink.run(
            mvd.invitation_no,
            mvd.pdf_filename || '',
            mvd.email_received_display || '',
            bestApp.id
          );
          linkedMvdCount++;
        }
      }
    }
  } catch {
    // ignore
  }

  return { enrichedSicilCount, linkedMvdCount };
}

export function findApplicationMatchForMvdPdf(
  fields: {
    passport_last3?: string;
    birth_date?: string;
    passport_issue_date?: string;
  },
  dbInstance?: any
): {
  sicil_no: string;
  fio_latin: string;
  fio_kiril: string;
  passport_no: string;
  birth_date: string;
  passport_issue_date: string;
  citizenship: string;
  destination_city: string;
  opis_no: string;
  score: number;
  reasons: string[];
} | null {
  try {
    const db = dbInstance || getDb();
    ensureInvitationApplicationsTable(db);

    const last3 = cleanStr(fields.passport_last3).replace(/[^0-9A-Za-zА-Яа-я]/g, '').toUpperCase();
    const dob = normalizeMessyDate(fields.birth_date).display;
    const issue = normalizeMessyDate(fields.passport_issue_date).display;
    if (!last3) return null;

    const candidates = db
      .prepare('SELECT * FROM invitation_applications WHERE UPPER(passport_last3) = ? ORDER BY id DESC')
      .all(last3) as any[];

    let best: any = null;
    let bestScore = 0;
    let bestReasons: string[] = [];

    for (const c of candidates) {
      let score = 40;
      const reasons = [`Başvuru Listesi Pasaport (*${last3})`];
      if (dob && c.birth_date === dob) {
        score += 45;
        reasons.push(`Doğum Tarihi (${dob})`);
      }
      if (issue && c.passport_issue_date === issue) {
        score += 35;
        reasons.push(`Pasaport Veriliş (${issue})`);
      }
      if (score >= 80 && score > bestScore) {
        bestScore = score;
        best = c;
        bestReasons = reasons;
      }
    }

    if (!best) return null;
    return {
      sicil_no: cleanStr(best.sicil_no),
      fio_latin: cleanStr(best.fio_latin) || cleanStr(best.fio_kiril),
      fio_kiril: cleanStr(best.fio_kiril),
      passport_no: cleanStr(best.passport_no),
      birth_date: cleanStr(best.birth_date),
      passport_issue_date: cleanStr(best.passport_issue_date),
      citizenship: cleanStr(best.citizenship),
      destination_city: cleanStr(best.destination_city),
      opis_no: cleanStr(best.opis_no),
      score: bestScore,
      reasons: bestReasons,
    };
  } catch {
    return null;
  }
}

export function upsertManualInvitationApplication(
  input: {
    id?: number;
    sicil_no?: string;
    fio_kiril: string;
    fio_latin?: string;
    opis_no?: string;
    app_date?: string;
    entry_from?: string;
    visa_end?: string;
    visa_multiplicity?: string;
    passport_no: string;
    passport_issue_date?: string;
    passport_expiry_date?: string;
    birth_date?: string;
    gender?: string;
    citizenship?: string;
    consulate_city?: string;
    destination_city?: string;
    ig_category?: string;
    comments?: string;
  },
  actorName: string
): { id: number } {
  const db = getDb();
  ensureInvitationApplicationsTable(db);

  const { full: passportNo, last3 } = cleanPassport(input.passport_no);
  const fioKiril = cleanStr(input.fio_kiril);
  const fioLatin = cleanStr(input.fio_latin);
  if (!passportNo || (!fioKiril && !fioLatin)) {
    throw new Error('Ad Soyad ve Pasaport No zorunludur.');
  }

  const appDate = normalizeMessyDate(input.app_date);
  const entryFrom = normalizeMessyDate(input.entry_from);
  const visaEnd = normalizeMessyDate(input.visa_end);
  const passIssue = normalizeMessyDate(input.passport_issue_date);
  const passExp = normalizeMessyDate(input.passport_expiry_date);
  const dob = normalizeMessyDate(input.birth_date);
  const nowIso = new Date().toISOString();

  let targetId = Number(input.id) || 0;
  if (targetId > 0) {
    db.prepare(
      `UPDATE invitation_applications SET
         sicil_no = ?, fio_kiril = ?, fio_latin = ?, opis_no = ?,
         app_date = ?, app_date_iso = ?, entry_from = ?, entry_from_iso = ?,
         visa_end = ?, visa_multiplicity = ?, passport_no = ?, passport_last3 = ?,
         passport_issue_date = ?, passport_expiry_date = ?, birth_date = ?,
         gender = ?, citizenship = ?, consulate_city = ?, destination_city = ?,
         ig_category = ?, comments = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      cleanStr(input.sicil_no),
      fioKiril || fioLatin,
      fioLatin,
      cleanStr(input.opis_no),
      appDate.display,
      appDate.iso,
      entryFrom.display,
      entryFrom.iso,
      visaEnd.display,
      cleanStr(input.visa_multiplicity) || 'МНОГОКРАТНАЯ',
      passportNo,
      last3,
      passIssue.display,
      passExp.display,
      dob.display,
      cleanStr(input.gender) || 'мужской',
      cleanStr(input.citizenship),
      cleanStr(input.consulate_city),
      cleanStr(input.destination_city),
      normalizeCategoryLabel(cleanStr(input.ig_category)),
      cleanStr(input.comments),
      nowIso,
      targetId
    );
  } else {
    const dedupKey = `M:${passportNo}|E:${entryFrom.iso || appDate.iso || Date.now()}`;
    const info = db
      .prepare(
        `INSERT INTO invitation_applications (
           dedup_key, sicil_no, fio_kiril, fio_latin, opis_no,
           app_date, app_date_iso, entry_from, entry_from_iso,
           visa_end, visa_type, visa_multiplicity, doc_type,
           passport_no, passport_last3, passport_issue_date, passport_expiry_date,
           birth_date, gender, citizenship, consulate_city, destination_city,
           ig_category, comments, source_type, created_by, updated_at
         ) VALUES (
           ?, ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, 'ОБЫКНОВЕННАЯ РАБОЧАЯ', ?, 'Иностранный паспорт',
           ?, ?, ?, ?,
           ?, ?, ?, ?, ?,
           ?, ?, 'manual', ?, ?
         )`
      )
      .run(
        dedupKey,
        cleanStr(input.sicil_no),
        fioKiril || fioLatin,
        fioLatin,
        cleanStr(input.opis_no),
        appDate.display,
        appDate.iso,
        entryFrom.display,
        entryFrom.iso,
        visaEnd.display,
        cleanStr(input.visa_multiplicity) || 'МНОГОКРАТНАЯ',
        passportNo,
        last3,
        passIssue.display,
        passExp.display,
        dob.display,
        cleanStr(input.gender) || 'мужской',
        cleanStr(input.citizenship),
        cleanStr(input.consulate_city),
        cleanStr(input.destination_city),
        normalizeCategoryLabel(cleanStr(input.ig_category)),
        cleanStr(input.comments),
        actorName,
        nowIso
      );
    targetId = Number(info.lastInsertRowid);
  }

  syncApplicationsWithPersonnelAndMvd(db);
  return { id: targetId };
}

export function deleteInvitationApplication(id: number): void {
  const db = getDb();
  ensureInvitationApplicationsTable(db);
  db.prepare('DELETE FROM invitation_applications WHERE id = ?').run(id);
}

export function getInvitationApplicationsPayload() {
  const db = getDb();
  ensureInvitationApplicationsTable(db);

  const rawRows = db
    .prepare("SELECT * FROM invitation_applications ORDER BY COALESCE(NULLIF(app_date_iso, ''), NULLIF(entry_from_iso, ''), updated_at) DESC, id DESC")
    .all() as any[];

  const todayMs = Date.now();
  const citiesSet = new Set<string>();
  const citizenshipSet = new Set<string>();

  let arrivedCount = 0;
  let waitingCount = 0;
  let overdueCount = 0;
  let vksCount = 0;
  let quotaCount = 0;
  let withSicilCount = 0;

  const data: InvitationApplicationRecord[] = rawRows.map((r) => {
    const hasArrived = Boolean(cleanStr(r.matched_invitation_no));
    let waitingDays: number | null = null;
    if (r.app_date_iso) {
      const appMs = Date.parse(`${r.app_date_iso}T00:00:00Z`);
      if (!Number.isNaN(appMs)) {
        waitingDays = Math.max(0, Math.floor((todayMs - appMs) / 86400000));
      }
    }

    let statusKey: InvitationApplicationRecord['status_key'] = 'NO_DATE';
    if (hasArrived) {
      statusKey = 'ARRIVED';
      arrivedCount++;
    } else if (waitingDays !== null) {
      if (waitingDays > 30) {
        statusKey = 'OVERDUE';
        overdueCount++;
      } else {
        statusKey = 'WAITING';
      }
      waitingCount++;
    } else {
      waitingCount++;
      statusKey = 'NO_DATE';
    }

    if (r.ig_category === 'VKS') vksCount++;
    else quotaCount++;
    if (cleanStr(r.sicil_no)) withSicilCount++;
    if (cleanStr(r.destination_city)) citiesSet.add(cleanStr(r.destination_city));
    if (cleanStr(r.citizenship)) citizenshipSet.add(cleanStr(r.citizenship));

    return {
      ...r,
      waiting_days: waitingDays,
      status_key: statusKey,
    };
  });

  const lastFileRow = db
    .prepare("SELECT value FROM system_info WHERE key = 'invitations_apps_last_file'")
    .get() as { value?: string } | undefined;
  const lastUpdRow = db
    .prepare("SELECT value FROM system_info WHERE key = 'invitations_apps_last_updated'")
    .get() as { value?: string } | undefined;

  return {
    summary: {
      total: data.length,
      arrivedCount,
      waitingCount,
      overdueCount,
      vksCount,
      quotaCount,
      withSicilCount,
      lastFileName: lastFileRow?.value || '',
      lastUpdatedAt: lastUpdRow?.value || '',
    },
    filterOptions: {
      cities: Array.from(citiesSet).sort((a, b) => a.localeCompare(b, 'ru')),
      citizenships: Array.from(citizenshipSet).sort((a, b) => a.localeCompare(b, 'ru')),
    },
    data,
  };
}
