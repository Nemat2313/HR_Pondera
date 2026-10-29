import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { createPreActionBackup } from '@/lib/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeVksWorkerFields(w: Record<string, any>): {
  changed: boolean;
  sanitized: Record<string, any>;
} {
  let changed = false;
  const out: Record<string, any> = { ...w };

  // 1. Passport Number: strip trailing DD.MM.YYYY, strip spaces, convert Cyrillic lookalikes before digits to Latin
  const rawPass = String(out.passportNumber ?? out['НомерПаспорта'] ?? '').trim();
  if (rawPass) {
    const cyrToLat: Record<string, string> = {
      А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
      а: 'A', в: 'B', с: 'C', е: 'E', н: 'H', к: 'K', м: 'M', о: 'O', р: 'P', т: 'T', х: 'X', у: 'Y',
    };
    let cleanPass = rawPass
      .replace(/\.0$/, '')
      .replace(/(\d{2}\.\d{2}\.\d{4})$/, '')
      .replace(/\s+/g, '');
    if (/^[АВЕКМНОРСТУХавекмнорстухA-Za-z]{1,3}\d{5,9}$/.test(cleanPass)) {
      cleanPass = cleanPass.replace(/[АВЕКМНОРСТУХавекмнорстух]/g, (ch) => cyrToLat[ch] || ch).toUpperCase();
    }
    if (cleanPass !== rawPass) {
      out.passportNumber = cleanPass;
      if ('НомерПаспорта' in out) out['НомерПаспорта'] = cleanPass;
      changed = true;
    }
  }

  // 2. Blank Series (СерийныйНомер1): convert Latin lookalikes to Cyrillic uppercase
  const rawBlank1 = String(out.blankSeries ?? out['СерийныйНомер1'] ?? '').trim();
  if (rawBlank1) {
    const latToCyr: Record<string, string> = {
      A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
    };
    const cleanBlank1 = /\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(rawBlank1)
      ? 'ВВ'
      : rawBlank1
          .replace(/\s+/g, '')
          .toUpperCase()
          .replace(/[ABCEHKMOPTXY]/g, (ch) => latToCyr[ch] || ch);
    if (cleanBlank1 !== rawBlank1) {
      out.blankSeries = cleanBlank1;
      if ('СерийныйНомер1' in out) out['СерийныйНомер1'] = cleanBlank1;
      changed = true;
    }
  }

  // 3. Blank Number (СерийныйНомер2): strip spaces, clear shifted date strings, pad 6-digit number with leading zero to 7 digits
  const rawBlank2 = String(out.blankNumber ?? out['СерийныйНомер2'] ?? '').trim();
  if (rawBlank2) {
    let cleanBlank2 = rawBlank2.replace(/\.0$/, '').replace(/\s+/g, '');
    if (/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(cleanBlank2)) {
      cleanBlank2 = '';
    } else if (/^\d{5,6}$/.test(cleanBlank2)) {
      cleanBlank2 = cleanBlank2.padStart(7, '0');
    }
    if (cleanBlank2 !== rawBlank2) {
      out.blankNumber = cleanBlank2;
      if ('СерийныйНомер2' in out) out['СерийныйНомер2'] = cleanBlank2;
      changed = true;
    }
  }

  // 3b. Apply verified HR Personel Listesi (25.10.2026) RNR/Blank/Passport fixes for known outdated rows
  const sicilKey = String(out.sicil || out.code || out.sicil_no || '').trim();
  const hrFixes: Record<string, Partial<Record<string, string>>> = {
    '902859': { blankNumber: '0739298' },
    '801083': { blankNumber: '0865819' },
    '900256': { passportNumber: 'U28197652', passportIssueDate: '20.07.2022' },
    '800186': { passportNumber: 'U32980323', passportIssueDate: '05.02.2024' },
    '925968': { blankNumber: '1030253' },
    '932902': { blankNumber: '0922056' },
    '935884': { rnrNumber: '2500578525' },
    '937670': { rnrNumber: '2600164623' },
  };
  if (sicilKey && hrFixes[sicilKey]) {
    const fix = hrFixes[sicilKey];
    for (const [k, v] of Object.entries(fix)) {
      if (v && String(out[k] || '').trim() !== v) {
        out[k] = v;
        if (k === 'blankNumber' && 'СерийныйНомер2' in out) out['СерийныйНомер2'] = v;
        if (k === 'rnrNumber' && 'Номер' in out) out['Номер'] = v;
        if (k === 'passportNumber' && 'НомерПаспорта' in out) out['НомерПаспорта'] = v;
        if (k === 'passportIssueDate' && 'ДатаВыдачи' in out) out['ДатаВыдачи'] = v;
        changed = true;
      }
    }
  }

  // 4. RNR Series & Number: strip spaces and .0
  const rawRnrSeries = String(out.rnrSeries ?? out['Серия'] ?? '').trim();
  if (rawRnrSeries) {
    const cleanRnrSeries = /^[ВB]{2}$/i.test(rawRnrSeries)
      ? '77'
      : rawRnrSeries.replace(/\.0$/, '').replace(/\s+/g, '');
    if (cleanRnrSeries !== rawRnrSeries) {
      out.rnrSeries = cleanRnrSeries;
      if ('Серия' in out) out['Серия'] = cleanRnrSeries;
      changed = true;
    }
  }
  const rawRnrNum = String(out.rnrNumber ?? out['Номер'] ?? '').trim();
  if (rawRnrNum) {
    const cleanRnrNum = rawRnrNum.replace(/\.0$/, '').replace(/\s+/g, '');
    if (cleanRnrNum !== rawRnrNum) {
      out.rnrNumber = cleanRnrNum;
      if ('Номер' in out) out['Номер'] = cleanRnrNum;
      changed = true;
    }
  }

  // 5. INN: strip spaces and .0 if numeric
  const rawInn = String(out.inn ?? out['ИНН'] ?? '').trim();
  if (rawInn) {
    const cleanInnCandidate = rawInn.replace(/\.0$/, '').replace(/\s+/g, '');
    if (/^\d{10,12}$/.test(cleanInnCandidate) && cleanInnCandidate !== rawInn) {
      out.inn = cleanInnCandidate;
      if ('ИНН' in out) out['ИНН'] = cleanInnCandidate;
      changed = true;
    }
  }

  return { changed, sanitized: out };
}

let __masterListAutoHealed = false;

function ensureTables(db: any) {
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
    CREATE INDEX IF NOT EXISTS idx_vks_master_sicil ON gosuslugi_vks_master_list(sicil_no);
    CREATE INDEX IF NOT EXISTS idx_vks_master_order ON gosuslugi_vks_master_list(row_order);
    CREATE INDEX IF NOT EXISTS idx_vks_master_comp ON gosuslugi_vks_master_list(assigned_computer);

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
    CREATE INDEX IF NOT EXISTS idx_refused_arch_appno ON gosuslugi_refused_archive(application_no);
    CREATE INDEX IF NOT EXISTS idx_refused_arch_sicil ON gosuslugi_refused_archive(sicil_no);
  `);
  try {
    db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN status_pdf_filename TEXT DEFAULT '';`);
  } catch {}

  if (!__masterListAutoHealed) {
    __masterListAutoHealed = true;
    try {
      const rows = db
        .prepare('SELECT row_key, sicil_no, worker_json FROM gosuslugi_vks_master_list')
        .all() as Array<{ row_key: string; sicil_no: string; worker_json: string }>;
      const updStmt = db.prepare(
        'UPDATE gosuslugi_vks_master_list SET worker_json = ? WHERE row_key = ?'
      );
      const delFixedErrStmt = db.prepare(`
        DELETE FROM gosuslugi_submissions
        WHERE sicil_no = ?
          AND application_no = ''
          AND (gosuslugi_status LIKE 'Ошибка%' OR gosuslugi_status LIKE 'ошибка%')
      `);
      db.exec('BEGIN');
      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.worker_json || '{}');
          const { changed, sanitized } = sanitizeVksWorkerFields(parsed);
          if (changed) {
            updStmt.run(JSON.stringify(sanitized), r.row_key);
            delFixedErrStmt.run(r.sicil_no);
          }
        } catch {}
      }
      db.exec('COMMIT');
    } catch {
      try {
        db.exec('ROLLBACK');
      } catch {}
    }
  }
}

function isSentSubmission(sub: any): boolean {
  if (!sub) return false;
  const status = String(sub.gosuslugi_status || '').trim();
  if (/^ошибк|не найден[ыо]?\s+в\s+базе\s+мвд/i.test(status)) return false;
  const appNo = String(sub.application_no || '').trim();
  const pdf = String(sub.pdf_filename || '').trim();
  if (appNo !== '' || pdf !== '') return true;
  if (/отправлен|зарегистрирован|оказан|исполнен|принят|промежуточн|обработк|PDF не скачан/i.test(status)) {
    return true;
  }
  return false;
}

function isMvdNotFoundSubmission(sub: any): boolean {
  if (!sub || isSentSubmission(sub)) return false;
  const status = String(sub.gosuslugi_status || '').trim();
  return /не найден[ыо]?\s+в\s+базе\s+мвд/i.test(status);
}

function isErrorSubmission(sub: any): boolean {
  if (!sub || isSentSubmission(sub) || isMvdNotFoundSubmission(sub)) return false;
  const status = String(sub.gosuslugi_status || '').trim();
  return /^ошибк/i.test(status);
}

function normalizeIncomingWorker(raw: any, fallbackOrder: number): {
  sicilNo: string;
  rowKey: string;
  rowOrder: number;
  assignedComputer: number;
  workerObj: Record<string, any>;
} | null {
  if (!raw || typeof raw !== 'object') return null;

  const sicilNo = String(
    raw.sicil || raw.code || raw.sicil_no || raw.Sicil || raw['Код'] || raw['Табельный номер'] || ''
  ).trim();
  if (!sicilNo) return null;

  const rowOrder = Number(raw.rowOrder || raw.row_order || fallbackOrder) || fallbackOrder;
  const rowKey = String(raw.rowKey || raw.row_key || sicilNo).trim();
  const assignedComputer =
    Number(raw.assignedComputer || raw.assigned_computer) ||
    (rowOrder <= 944 ? 1 : rowOrder <= 1544 ? 3 : rowOrder <= 2488 ? 2 : 4);

  const workerObj: Record<string, any> = {
    id: raw.id || `master-vks-${rowKey}`,
    sicil: sicilNo,
    code: String(raw.code || raw['Код'] || sicilNo).trim(),
    rowOrder,
    rowKey,
    assignedComputer,
    lastName: String(raw.lastName ?? raw['Фамилия'] ?? 'Нет').trim(),
    firstName: String(raw.firstName ?? raw['Имя'] ?? '').trim(),
    middleName: String(raw.middleName ?? raw['Отчество'] ?? 'НЕТ').trim() || 'НЕТ',
    birthDate: String(raw.birthDate ?? raw['ДатаРождения'] ?? raw['Дата рождения'] ?? '').trim(),
    gender: String(raw.gender ?? raw['Пол'] ?? 'Мужской').trim() || 'Мужской',
    citizenship: String(raw.citizenship ?? raw['ТекущееГражданство'] ?? 'Турция').trim() || 'Турция',
    placeOfBirth: String(raw.placeOfBirth ?? raw['МестоРождения'] ?? '').trim(),
    passportSeries: String(raw.passportSeries ?? raw['СерияПаспорта'] ?? '').trim(),
    passportNumber: String(raw.passportNumber ?? raw['НомерПаспорта'] ?? '').trim(),
    passportIssueDate: String(raw.passportIssueDate ?? raw['ДатаВыдачи'] ?? '').trim(),
    passportIssuedBy: String(raw.passportIssuedBy ?? raw['ПаспортКемВыдан'] ?? raw['КемВыдан'] ?? '').trim(),
    inn: String(raw.inn ?? raw['ИНН'] ?? '').trim(),
    rnrSeries: String(raw.rnrSeries ?? raw['Серия'] ?? '').trim(),
    rnrNumber: String(raw.rnrNumber ?? raw['Номер'] ?? '').trim(),
    rnrIssueDate: String(raw.rnrIssueDate ?? raw['ДатаВыдачиВКС'] ?? '').trim(),
    blankSeries: String(raw.blankSeries ?? raw['СерийныйНомер1'] ?? raw['Серия бланка'] ?? '').trim(),
    blankNumber: String(raw.blankNumber ?? raw['СерийныйНомер2'] ?? raw['Номер бланка'] ?? '').trim(),
    contractDate: String(raw.contractDate ?? raw['ДатаЗаключения'] ?? '').trim(),
    contractStartDate: String(raw.contractStartDate ?? raw['ДатаНачалаДействия'] ?? raw['ДатаНачала действия'] ?? '').trim(),
    contractEndDate: String(raw.contractEndDate ?? raw['ДатаОканчанияДействия'] ?? raw['ДатаОканчания действия'] ?? '').trim(),
    periodStart: String(raw.periodStart ?? raw['НачалоПериода'] ?? '01.07.2026').trim() || '01.07.2026',
    periodEnd: String(raw.periodEnd ?? raw['КонецПериода'] ?? '30.09.2026').trim() || '30.09.2026',
    month1Salary: String(raw.month1Salary ?? raw['1-месяц'] ?? raw['Июль'] ?? '').trim(),
    month2Salary: String(raw.month2Salary ?? raw['2-месяц'] ?? raw['август'] ?? '').trim(),
    month3Salary: String(raw.month3Salary ?? raw['3-месяц'] ?? raw['сентябрь'] ?? '').trim(),
    salaryAmount: String(raw.salaryAmount ?? raw['РазмерВыплаты'] ?? '').trim(),
    position: String(raw.position ?? raw['Должность'] ?? 'СПЕЦИАЛИСТ').trim() || 'СПЕЦИАЛИСТ',
    workAddress: String(
      raw.workAddress ?? raw['АдресРаботы'] ?? raw['Фактический адрес работы иностранца'] ?? ''
    ).trim(),
    postalCode: String(raw.postalCode ?? raw['Индекс'] ?? '').trim(),
    ufmsDepartment: String(
      raw.ufmsDepartment ??
        raw['Подразделение МВД'] ??
        'ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ'
    ).trim(),
  };

  const { sanitized } = sanitizeVksWorkerFields(workerObj);

  return {
    sicilNo,
    rowKey,
    rowOrder,
    assignedComputer,
    workerObj: sanitized,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const computerFilter = searchParams.get('computer') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const summaryOnly = searchParams.get('summaryOnly') === '1';

    const db = getDb();
    ensureTables(db);

    const masterRows = summaryOnly
      ? (db
          .prepare(
            'SELECT row_key, sicil_no, row_order, assigned_computer FROM gosuslugi_vks_master_list ORDER BY row_order ASC, row_key ASC'
          )
          .all() as Array<{
          row_key: string;
          sicil_no: string;
          row_order: number;
          assigned_computer: number;
          worker_json?: string;
          source_tag?: string;
          updated_at?: string;
        }>)
      : (db
          .prepare('SELECT * FROM gosuslugi_vks_master_list ORDER BY row_order ASC, row_key ASC')
          .all() as Array<{
          row_key: string;
          sicil_no: string;
          row_order: number;
          assigned_computer: number;
          worker_json: string;
          source_tag: string;
          updated_at: string;
        }>);

    const subRows = db
      .prepare(
        `SELECT sicil_no, application_no, gosuslugi_status, pdf_filename, status_pdf_filename, submitted_at, checked_at FROM gosuslugi_submissions WHERE LOWER(notification_type) = 'vks_salary' ORDER BY id DESC`
      )
      .all() as Array<any>;

    const statusPdfByAppNo = new Map<string, string>();
    const statusPdfBySicil = new Map<string, string>();
    try {
      const pdfDir = path.join(process.cwd(), 'data', 'gosuslugi_pdfs');
      if (fs.existsSync(pdfDir)) {
        const files = fs.readdirSync(pdfDir);
        for (const f of files) {
          if (!f.toUpperCase().includes('_STATUS_A4.PDF')) continue;
          const mApp = f.match(/([789]\d{9})/);
          if (mApp) statusPdfByAppNo.set(mApp[1], f);
          const mSic = f.match(/^(\d{4,8})_/);
          if (mSic) statusPdfBySicil.set(mSic[1], f);
        }
      }
    } catch {}

    const subBySicil = new Map<string, any>();
    for (const s of subRows) {
      const sic = String(s.sicil_no || '').trim();
      if (!sic) continue;
      const existing = subBySicil.get(sic);
      if (!existing || (isSentSubmission(s) && !isSentSubmission(existing))) {
        subBySicil.set(sic, s);
      }
    }

    const computersSummary: Record<
      number,
      {
        computer: number;
        total: number;
        sent: number;
        refused: number;
        error: number;
        pending: number;
        minRow: number;
        maxRow: number;
      }
    > = {
      1: { computer: 1, total: 0, sent: 0, refused: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
      2: { computer: 2, total: 0, sent: 0, refused: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
      3: { computer: 3, total: 0, sent: 0, refused: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
      4: { computer: 4, total: 0, sent: 0, refused: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
    };

    let totalSent = 0;
    let totalRefused = 0;
    let totalError = 0;
    let totalPending = 0;
    let totalPdf = 0;
    let totalStatusPdf = 0;

    const enrichedList: any[] = [];

    for (const m of masterRows) {
      const comp = [1, 2, 3, 4].includes(Number(m.assigned_computer))
        ? Number(m.assigned_computer)
        : 1;
      const sub = subBySicil.get(m.sicil_no);
      const sent = isSentSubmission(sub);
      const mvdNotFound = isMvdNotFoundSubmission(sub);
      const errored = isErrorSubmission(sub);
      const refused = Boolean(sub && !errored && !mvdNotFound && /отказан/i.test(String(sub.gosuslugi_status || '')));

      const appNoVal = String(sub?.application_no || '').trim();
      const rawPdfVal = String(sub?.pdf_filename || '').trim();
      const cleanReceiptPdf = rawPdfVal.toUpperCase().includes('_STATUS_A4') ? '' : rawPdfVal;
      const cleanStatusPdf =
        String(sub?.status_pdf_filename || '').trim() ||
        (appNoVal && statusPdfByAppNo.get(appNoVal)) ||
        (m.sicil_no && statusPdfBySicil.get(m.sicil_no)) ||
        (rawPdfVal.toUpperCase().includes('_STATUS_A4') ? rawPdfVal : '');

      const rowStatus: 'success' | 'error' | 'mvd_not_found' | 'pending' = sent
        ? 'success'
        : mvdNotFound
        ? 'mvd_not_found'
        : errored
        ? 'error'
        : 'pending';

      const compStat = computersSummary[comp];
      compStat.total++;
      if (compStat.minRow === 0 || m.row_order < compStat.minRow) compStat.minRow = m.row_order;
      if (m.row_order > compStat.maxRow) compStat.maxRow = m.row_order;

      if (sent) {
        totalSent++;
        compStat.sent++;
        if (cleanReceiptPdf) totalPdf++;
        if (cleanStatusPdf) totalStatusPdf++;
        if (refused) {
          totalRefused++;
          compStat.refused++;
        }
      } else if (errored) {
        totalError++;
        compStat.error++;
      } else {
        totalPending++;
        compStat.pending++;
      }

      if (summaryOnly) continue;
      if (computerFilter !== 'all' && String(comp) !== String(computerFilter)) {
        continue;
      }
      if (statusFilter === 'sent' && !sent) continue;
      if (statusFilter === 'refused' && !refused) continue;
      if (statusFilter === 'mvd_not_found' && !mvdNotFound) continue;
      if (statusFilter === 'error' && !errored) continue;
      if (statusFilter === 'pending' && (sent || errored || mvdNotFound)) continue;

      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(m.worker_json || '{}');
      } catch {
        continue;
      }

      const hasValidRnrAndBlank =
        /^\d{2,4}$/.test(String(parsed.rnrSeries || '').trim()) &&
        /^\d{6,12}$/.test(String(parsed.rnrNumber || '').trim()) &&
        /^[А-ЯЁA-Z]{2}$/i.test(String(parsed.blankSeries || '').trim()) &&
        /^\d{6,7}$/.test(String(parsed.blankNumber || '').trim());

      enrichedList.push({
        ...parsed,
        id: parsed.id || `master-vks-${m.row_key}`,
        sicil: m.sicil_no,
        sicil_no: m.sicil_no,
        code: parsed.code || m.sicil_no,
        rowOrder: m.row_order,
        row_order: m.row_order,
        rowKey: m.row_key,
        assignedComputer: comp,
        assigned_computer: comp,
        status: rowStatus,
        selected: hasValidRnrAndBlank && (rowStatus === 'pending' || rowStatus === 'error'),
        applicationNo: appNoVal,
        application_no: appNoVal,
        gosuslugiStatus: sub?.gosuslugi_status || '',
        gosuslugi_status: sub?.gosuslugi_status || '',
        pdfFilename: cleanReceiptPdf,
        pdf_filename: cleanReceiptPdf,
        statusPdfFilename: cleanStatusPdf,
        status_pdf_filename: cleanStatusPdf,
        submittedAt: sub?.submitted_at || '',
        submitted_at: sub?.submitted_at || '',
        checkedAt: sub?.checked_at || '',
        checked_at: sub?.checked_at || '',
        updatedAt: m.updated_at || '',
      });
    }

    const archivedRows = db
      .prepare(`SELECT DISTINCT application_no FROM gosuslugi_refused_archive WHERE application_no != ''`)
      .all() as Array<{ application_no: string }>;

    return NextResponse.json({
      success: true,
      totalMaster: masterRows.length,
      computers: computersSummary,
      archivedAppNos: archivedRows.map((r) => r.application_no),
      summary: {
        total: masterRows.length,
        sent: totalSent,
        refused: totalRefused,
        error: totalError,
        pending: totalPending,
        totalPdf,
        totalStatusPdf,
        computers: computersSummary,
      },
      data: enrichedList,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Merkezi VKS ana listesi alınamadı.',
        detail: String(err?.message || ''),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawRecords = Array.isArray(body?.records)
      ? body.records
      : Array.isArray(body?.items)
      ? body.items
      : [];
    const mode = String(body?.mode || 'merge').trim(); // 'seed' | 'merge'
    const sourceTag = String(body?.sourceTag || 'excel_upload').trim();
    const clearErrorsForUpdated = Boolean(body?.clearErrorsForUpdated);
    const forcedComputer = Number(body?.assignedComputer) || 0;

    if (rawRecords.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kaydedilecek VKS satırı bulunamadı.' },
        { status: 400 }
      );
    }

    if (rawRecords.length > 5) {
      createPreActionBackup(
        'vks_master_upload',
        `VKS Liste / Şablon Yükleme Öncesi (${rawRecords.length} Kayıt)`,
        `Перед загрузкой списка ВКС (${rawRecords.length} зап.)`
      );
    }

    const db = getDb();
    ensureTables(db);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const existingRows = db
      .prepare('SELECT row_key, sicil_no, row_order, assigned_computer, worker_json, source_tag FROM gosuslugi_vks_master_list')
      .all() as Array<{
      row_key: string;
      sicil_no: string;
      row_order: number;
      assigned_computer: number;
      worker_json: string;
      source_tag: string;
    }>;

    // Also load RNR fallback from `personnel` table on server (cached in memory) in case any Excel row has empty RNR/Blank
    type RnrFallbackEntry = {
      rnrSeries: string;
      rnrNumber: string;
      rnrIssueDate: string;
      blankSeries: string;
      blankNumber: string;
    };
    const gRnrCache = globalThis as unknown as {
      __ponderaPersonnelRnrCache?: { key: string; map: Map<string, RnrFallbackEntry> };
    };
    let personnelRnrMap = new Map<string, RnrFallbackEntry>();
    try {
      const pVer = db
        .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM personnel')
        .get() as { cnt: number; maxId: number };
      const rnrCacheKey = `${pVer.cnt}:${pVer.maxId}`;
      if (!gRnrCache.__ponderaPersonnelRnrCache || gRnrCache.__ponderaPersonnelRnrCache.key !== rnrCacheKey) {
        const builtMap = new Map<string, RnrFallbackEntry>();
        const pRows = db
          .prepare('SELECT sicil_no, all_data_json FROM personnel WHERE sicil_no IS NOT NULL AND sicil_no != ""')
          .all() as Array<{ sicil_no: string; all_data_json: string }>;
        const latinToCyr: Record<string, string> = {
          A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
        };
        const toCyrBlank = (s: string) =>
          s
            .toUpperCase()
            .replace(/[ABCEHKMOPTXY]/g, (ch) => latinToCyr[ch] || ch);
        for (const pr of pRows) {
          if (!pr.all_data_json) continue;
          try {
            const raw = JSON.parse(pr.all_data_json);
            builtMap.set(String(pr.sicil_no).trim(), {
              rnrSeries: String(raw['Çalışma Kart Seri No'] || '').trim(),
              rnrNumber: String(raw['Çalışma Kart No'] || '').trim(),
              rnrIssueDate: String(
                raw['Çalışma Kart Alış Tarihi'] || raw['Çalışma Kart Başlangıç Tarihi'] || ''
              ).trim(),
              blankSeries: toCyrBlank(String(raw['Patent Form Seri No'] || '').trim()),
              blankNumber: String(raw['Patent Form No'] || '').trim(),
            });
          } catch {}
        }
        gRnrCache.__ponderaPersonnelRnrCache = { key: rnrCacheKey, map: builtMap };
      }
      personnelRnrMap = gRnrCache.__ponderaPersonnelRnrCache.map;
    } catch {}

    const existingByKey = new Map<string, (typeof existingRows)[0]>();
    const existingBySicil = new Map<string, Array<(typeof existingRows)[0]>>();
    let maxRowOrder = 0;

    for (const r of existingRows) {
      existingByKey.set(r.row_key, r);
      const arr = existingBySicil.get(r.sicil_no) || [];
      arr.push(r);
      existingBySicil.set(r.sicil_no, arr);
      if (r.row_order > maxRowOrder) maxRowOrder = r.row_order;
    }

    const upsertStmt = db.prepare(`
      INSERT INTO gosuslugi_vks_master_list (
        row_key, sicil_no, row_order, assigned_computer, worker_json, source_tag, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(row_key) DO UPDATE SET
        sicil_no = excluded.sicil_no,
        row_order = excluded.row_order,
        assigned_computer = excluded.assigned_computer,
        worker_json = excluded.worker_json,
        source_tag = excluded.source_tag,
        updated_at = excluded.updated_at
    `);

    const isSubsetRequeueUpload =
      Boolean(body?.reopenNonOkazana) ||
      (clearErrorsForUpdated && sourceTag !== 'ui_inline_edit' && rawRecords.length > 0 && rawRecords.length < 1500);

    const checkSubBySicilStmt = db.prepare(`
      SELECT id, application_no, gosuslugi_status
      FROM gosuslugi_submissions
      WHERE sicil_no = ?
      ORDER BY id DESC
      LIMIT 1
    `);

    const archiveNonOkazanaBySicilStmt = db.prepare(`
      INSERT INTO gosuslugi_refused_archive (
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
      )
      SELECT
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, ?
      FROM gosuslugi_submissions
      WHERE sicil_no = ? AND gosuslugi_status != 'Услуга оказана'
    `);

    const clearNonOkazanaBySicilStmt = db.prepare(`
      DELETE FROM gosuslugi_submissions
      WHERE sicil_no = ? AND gosuslugi_status != 'Услуга оказана'
    `);

    const clearErrorStmt = db.prepare(`
      DELETE FROM gosuslugi_submissions
      WHERE sicil_no = ? AND (gosuslugi_status LIKE 'Ошибка%' OR gosuslugi_status LIKE 'ошибка%' OR gosuslugi_status LIKE '%ошибк%')
    `);

    const archiveRefusedBySicilStmt = db.prepare(`
      INSERT INTO gosuslugi_refused_archive (
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
      )
      SELECT
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, ?
      FROM gosuslugi_submissions
      WHERE sicil_no = ? AND (gosuslugi_status LIKE '%отказан%' OR (application_no != '' AND (gosuslugi_status LIKE 'Ошибка%' OR gosuslugi_status LIKE 'ошибка%')))
    `);

    const clearRefusedBySicilStmt = db.prepare(`
      DELETE FROM gosuslugi_submissions
      WHERE sicil_no = ? AND gosuslugi_status LIKE '%отказан%'
    `);

    let inserted = 0;
    let updated = 0;
    let clearedErrors = 0;
    let reopenedRefused = 0;
    let reopenedPending = 0;
    let skippedOkazana = 0;
    const seenSicilCounts = new Map<string, number>();

    const processStatusResetForSicil = (sicilKey: string) => {
      if (!clearErrorsForUpdated) return;
      const curSub = checkSubBySicilStmt.get(sicilKey) as
        | { id: number; application_no: string; gosuslugi_status: string }
        | undefined;
      if (!curSub) return;
      const st = String(curSub.gosuslugi_status || '').trim();
      if (st === 'Услуга оказана') {
        skippedOkazana++;
        return;
      }
      if (isSubsetRequeueUpload) {
        archiveNonOkazanaBySicilStmt.run(nowStr, sicilKey);
        const delRes = clearNonOkazanaBySicilStmt.run(sicilKey);
        const changes = Number(delRes.changes || 0);
        if (/отказан/i.test(st)) {
          reopenedRefused += changes;
        } else if (/ошибк/i.test(st)) {
          clearedErrors += changes;
        } else {
          reopenedPending += changes;
        }
      } else {
        archiveRefusedBySicilStmt.run(nowStr, sicilKey);
        const delRes = clearErrorStmt.run(sicilKey);
        clearedErrors += Number(delRes.changes || 0);
        const refRes = clearRefusedBySicilStmt.run(sicilKey);
        reopenedRefused += Number(refRes.changes || 0);
      }
    };

    db.exec('BEGIN');
    try {
      rawRecords.forEach((raw: any, idx: number) => {
        const norm = normalizeIncomingWorker(raw, maxRowOrder + idx + 1);
        if (!norm) return;

        const countForSicil = (seenSicilCounts.get(norm.sicilNo) || 0) + 1;
        seenSicilCounts.set(norm.sicilNo, countForSicil);

        let targetRowKey = norm.rowKey;
        let existingMatch = existingByKey.get(targetRowKey);

        if (!existingMatch) {
          const sicilMatches = existingBySicil.get(norm.sicilNo) || [];
          if (sicilMatches.length > 0) {
            existingMatch = sicilMatches[Math.min(countForSicil - 1, sicilMatches.length - 1)];
            targetRowKey = existingMatch.row_key;
          } else if (countForSicil > 1) {
            targetRowKey = `${norm.sicilNo}_${countForSicil}`;
          } else {
            targetRowKey = norm.sicilNo;
          }
        }

        const dbFallback = personnelRnrMap.get(norm.sicilNo);

        if (existingMatch) {
          // Never let a background RPA bridge queue sync or raw seed overwrite an existing row in the central master list!
          if (
            sourceTag === 'rpa_bridge_queue' ||
            (mode === 'seed' && existingMatch.source_tag && existingMatch.source_tag !== 'master_excel')
          ) {
            return;
          }

          let prevObj: Record<string, any> = {};
          try {
            prevObj = JSON.parse(existingMatch.worker_json);
          } catch {}

          const finalRowOrder = mode === 'seed' ? norm.rowOrder : existingMatch.row_order || norm.rowOrder;
          const finalComputer =
            forcedComputer > 0
              ? forcedComputer
              : existingMatch.assigned_computer || norm.assignedComputer;

          const isPrevCorrupted =
            prevObj.lastName === norm.sicilNo ||
            /^\d{4}-\d{2}-\d{2}/.test(String(prevObj.passportNumber || '')) ||
            /^\d{4}-\d{2}-\d{2}/.test(String(prevObj.blankSeries || ''));
          const safePrev = isPrevCorrupted ? {} : prevObj;

          const mergedWorker: Record<string, any> = {
            ...safePrev,
            ...norm.workerObj,
            sicil: targetRowKey,
            // Preserve non-empty fields from safePrev or personnel DB if incoming field is empty
            inn: norm.workerObj.inn || safePrev.inn || '',
            passportSeries: norm.workerObj.passportSeries || safePrev.passportSeries || '',
            passportNumber: norm.workerObj.passportNumber || safePrev.passportNumber || '',
            passportIssueDate: norm.workerObj.passportIssueDate || safePrev.passportIssueDate || '',
            passportIssuedBy: norm.workerObj.passportIssuedBy || safePrev.passportIssuedBy || '',
            rnrSeries: norm.workerObj.rnrSeries || safePrev.rnrSeries || dbFallback?.rnrSeries || '',
            rnrNumber: norm.workerObj.rnrNumber || safePrev.rnrNumber || dbFallback?.rnrNumber || '',
            rnrIssueDate: norm.workerObj.rnrIssueDate || safePrev.rnrIssueDate || dbFallback?.rnrIssueDate || '',
            blankSeries: norm.workerObj.blankSeries || safePrev.blankSeries || dbFallback?.blankSeries || '',
            blankNumber: norm.workerObj.blankNumber || safePrev.blankNumber || dbFallback?.blankNumber || '',
            contractDate: norm.workerObj.contractDate || safePrev.contractDate || '',
            contractStartDate: norm.workerObj.contractStartDate || safePrev.contractStartDate || '',
            contractEndDate: norm.workerObj.contractEndDate || safePrev.contractEndDate || '',
            rowOrder: finalRowOrder,
            rowKey: targetRowKey,
            assignedComputer: finalComputer,
          };

          upsertStmt.run(
            targetRowKey,
            targetRowKey,
            finalRowOrder,
            finalComputer,
            JSON.stringify(mergedWorker),
            sourceTag,
            nowStr
          );
          updated++;

          processStatusResetForSicil(targetRowKey);
        } else {
          const finalRowOrder = mode === 'seed' ? norm.rowOrder : ++maxRowOrder;
          const finalComputer =
            forcedComputer > 0 ? forcedComputer : norm.assignedComputer;

          const newWorker = {
            ...norm.workerObj,
            sicil: targetRowKey,
            rnrSeries: norm.workerObj.rnrSeries || dbFallback?.rnrSeries || '',
            rnrNumber: norm.workerObj.rnrNumber || dbFallback?.rnrNumber || '',
            rnrIssueDate: norm.workerObj.rnrIssueDate || dbFallback?.rnrIssueDate || '',
            blankSeries: norm.workerObj.blankSeries || dbFallback?.blankSeries || '',
            blankNumber: norm.workerObj.blankNumber || dbFallback?.blankNumber || '',
            rowOrder: finalRowOrder,
            rowKey: targetRowKey,
            assignedComputer: finalComputer,
          };

          upsertStmt.run(
            targetRowKey,
            targetRowKey,
            finalRowOrder,
            finalComputer,
            JSON.stringify(newWorker),
            sourceTag,
            nowStr
          );
          inserted++;

          processStatusResetForSicil(norm.sicilNo);
        }
      });
      db.exec('COMMIT');
    } catch (txErr) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw txErr;
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      clearedErrors,
      reopenedRefused,
      reopenedPending,
      skippedOkazana,
      readyToQueue: (updated + inserted) - skippedOkazana,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Merkezi VKS listesi güncellenemedi.',
        detail: String(err?.message || ''),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || '').trim();

    if (action === 'retry_errors' || action === 'reopen_refused' || action === 'reopen_registered') {
      const labelMap: Record<string, { tr: string; ru: string }> = {
        retry_errors: {
          tr: 'Toplu Hatalı (Ошибка) Kayıtları Tekrar Kuyruğa Alma Öncesi',
          ru: 'Перед возвратом ошибочных записей в очередь',
        },
        reopen_refused: {
          tr: 'Toplu Red (Услуга отказана) Kayıtları Tekrar Gönderime Açma Öncesi',
          ru: 'Перед повторным открытием отклонённых записей',
        },
        reopen_registered: {
          tr: 'Bekleyen (Заявление зарегистрировано) Kayıtları Tekrar Gönderime Açma Öncesi',
          ru: 'Перед повторным открытием ожидающих заявлений',
        },
      };
      createPreActionBackup(
        action,
        labelMap[action]?.tr || `İşlem Öncesi (${action})`,
        labelMap[action]?.ru || `Перед операцией (${action})`
      );
    }

    const db = getDb();
    ensureTables(db);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (action === 'split_4_computers') {
      const strategy = String(body?.strategy || 'tail_transfer').trim(); // 'tail_transfer' | 'equal_4' | 'custom_range'
      const tailCount = Math.max(50, Math.min(1200, Number(body?.tailCount) || 600));

      const masterRows = db
        .prepare('SELECT row_key, sicil_no, row_order, assigned_computer, worker_json FROM gosuslugi_vks_master_list ORDER BY row_order ASC')
        .all() as Array<{
        row_key: string;
        sicil_no: string;
        row_order: number;
        assigned_computer: number;
        worker_json: string;
      }>;

      const subRows = db
        .prepare(`SELECT sicil_no, application_no, gosuslugi_status, pdf_filename FROM gosuslugi_submissions WHERE LOWER(notification_type) = 'vks_salary'`)
        .all() as Array<any>;
      const sentSicils = new Set<string>();
      for (const s of subRows) {
        if (isSentSubmission(s)) {
          sentSicils.add(String(s.sicil_no || '').trim());
        }
      }

      const updateCompStmt = db.prepare(`
        UPDATE gosuslugi_vks_master_list
        SET assigned_computer = ?, updated_at = ?
        WHERE row_key = ?
      `);

      let changed = 0;

      db.exec('BEGIN');
      try {
        if (strategy === 'custom_range') {
          const startRow = Number(body?.startRow) || 1;
          const endRow = Number(body?.endRow) || 3088;
          const targetComp = [1, 2, 3, 4].includes(Number(body?.targetComputer))
            ? Number(body?.targetComputer)
            : 3;
          for (const m of masterRows) {
            if (m.row_order >= startRow && m.row_order <= endRow) {
              updateCompStmt.run(targetComp, nowStr, m.row_key);
              changed++;
            }
          }
        } else if (strategy === 'equal_4') {
          const unsentRows = masterRows.filter((m) => !sentSicils.has(m.sicil_no));
          const perComp = Math.ceil(unsentRows.length / 4);
          unsentRows.forEach((m, idx) => {
            const comp = Math.min(4, Math.floor(idx / perComp) + 1);
            updateCompStmt.run(comp, nowStr, m.row_key);
            changed++;
          });
        } else {
          // Default 'tail_transfer':
          // First half (1..1544): keep front on Computer 1, move last `tailCount` unsent rows from the end of Half 1 to Computer 3.
          // Second half (1545..end): keep front on Computer 2, move last `tailCount` unsent rows from the end of Half 2 to Computer 4.
          const halfPoint = Math.ceil(masterRows.length / 2); // 1544
          const half1 = masterRows.filter((m) => m.row_order <= halfPoint);
          const half2 = masterRows.filter((m) => m.row_order > halfPoint);

          // Assign Half 1 defaults to PC 1, then last `tailCount` unsent from end of Half 1 to PC 3
          const half1UnsentFromEnd = [...half1]
            .reverse()
            .filter((m) => !sentSicils.has(m.sicil_no))
            .slice(0, tailCount);
          const pc3Keys = new Set(half1UnsentFromEnd.map((m) => m.row_key));

          for (const m of half1) {
            const target = pc3Keys.has(m.row_key) ? 3 : 1;
            updateCompStmt.run(target, nowStr, m.row_key);
            changed++;
          }

          // Assign Half 2 defaults to PC 2, then last `tailCount` unsent from end of Half 2 to PC 4
          const half2UnsentFromEnd = [...half2]
            .reverse()
            .filter((m) => !sentSicils.has(m.sicil_no))
            .slice(0, tailCount);
          const pc4Keys = new Set(half2UnsentFromEnd.map((m) => m.row_key));

          for (const m of half2) {
            const target = pc4Keys.has(m.row_key) ? 4 : 2;
            updateCompStmt.run(target, nowStr, m.row_key);
            changed++;
          }
        }
        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        strategy,
        changed,
        message:
          strategy === 'equal_4'
            ? `Kalan gönderilmemiş kayıtlar 4 bilgisayara eşit bölündü (${changed} satır güncellendi)!`
            : `1. ve 2. bilgisayarların sonundan ${tailCount}'er kayıt 3. ve 4. bilgisayarlara aktarıldı!`,
      });
    }

    if (action === 'retry_errors') {
      const scope = String(body?.scope || 'all').trim(); // 'all' | 'computer' | 'selected'
      const computer = Number(body?.computer) || 0;
      const clearFromDb = Boolean(body?.clearFromDb);
      const rawSicilList = Array.isArray(body?.sicils)
        ? body.sicils
        : Array.isArray(body?.sicilNos)
        ? body.sicilNos
        : [];
      const sicilNos: string[] = rawSicilList
        .map((s: any) => String(s || '').trim())
        .filter(Boolean);
      const targetComputer = Number(body?.targetComputer) || 0;

      let targetSicils: string[] = [];

      if (scope === 'selected' && sicilNos.length > 0) {
        targetSicils = sicilNos;
      } else if (scope === 'computer' && [1, 2, 3, 4].includes(computer)) {
        const compRows = db
          .prepare(
            `SELECT m.sicil_no FROM gosuslugi_vks_master_list m
             INNER JOIN gosuslugi_submissions s ON s.sicil_no = m.sicil_no
             WHERE m.assigned_computer = ? AND (s.gosuslugi_status LIKE 'Ошибка%' OR s.gosuslugi_status LIKE 'ошибка%')`
          )
          .all(computer) as Array<{ sicil_no: string }>;
        targetSicils = compRows.map((r) => r.sicil_no);
      } else {
        const errRows = db
          .prepare(
            `SELECT sicil_no FROM gosuslugi_submissions WHERE gosuslugi_status LIKE 'Ошибка%' OR gosuslugi_status LIKE 'ошибка%'`
          )
          .all() as Array<{ sicil_no: string }>;
        targetSicils = errRows.map((r) => r.sicil_no);
      }

      const archiveErrorAppNoStmt = db.prepare(`
        INSERT INTO gosuslugi_refused_archive (
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
        )
        SELECT
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, ?
        FROM gosuslugi_submissions
        WHERE sicil_no = ? AND (gosuslugi_status LIKE 'Ошибка%' OR gosuslugi_status LIKE 'ошибка%')
      `);

      const delErrorStmt = db.prepare(`
        DELETE FROM gosuslugi_submissions
        WHERE sicil_no = ? AND (gosuslugi_status LIKE 'Ошибка%' OR gosuslugi_status LIKE 'ошибка%')
      `);

      const reassignCompStmt = db.prepare(`
        UPDATE gosuslugi_vks_master_list
        SET assigned_computer = ?, updated_at = ?
        WHERE sicil_no = ?
      `);

      let resetCount = 0;
      db.exec('BEGIN');
      try {
        for (const sic of targetSicils) {
          if (clearFromDb) {
            archiveErrorAppNoStmt.run(nowStr, sic);
            const res = delErrorStmt.run(sic);
            resetCount += Number(res.changes || 0);
          } else {
            resetCount++;
          }
          if ([1, 2, 3, 4].includes(targetComputer)) {
            reassignCompStmt.run(targetComputer, nowStr, sic);
          }
        }
        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        resetCount,
        sicils: targetSicils,
        message: `${resetCount} hatalı (Ошибка) kayıt tekrar gönderim kuyruğuna alındı!`,
      });
    }

    if (action === 'reopen_refused') {
      const scope = String(body?.scope || 'all').trim(); // 'all' | 'computer' | 'selected'
      const computer = Number(body?.computer) || 0;
      const rawSicilList = Array.isArray(body?.sicils)
        ? body.sicils
        : Array.isArray(body?.sicilNos)
        ? body.sicilNos
        : [];
      const sicilNos: string[] = rawSicilList
        .map((s: any) => String(s || '').trim())
        .filter(Boolean);
      const targetComputer = Number(body?.targetComputer) || 0;

      let targetSicils: string[] = [];

      if (scope === 'selected' && sicilNos.length > 0) {
        targetSicils = sicilNos;
      } else if (scope === 'computer' && [1, 2, 3, 4].includes(computer)) {
        const compRows = db
          .prepare(
            `SELECT m.sicil_no FROM gosuslugi_vks_master_list m
             INNER JOIN gosuslugi_submissions s ON s.sicil_no = m.sicil_no
             WHERE m.assigned_computer = ? AND s.gosuslugi_status LIKE '%отказан%'`
          )
          .all(computer) as Array<{ sicil_no: string }>;
        targetSicils = compRows.map((r) => r.sicil_no);
      } else {
        const refRows = db
          .prepare(
            `SELECT sicil_no FROM gosuslugi_submissions WHERE gosuslugi_status LIKE '%отказан%'`
          )
          .all() as Array<{ sicil_no: string }>;
        targetSicils = refRows.map((r) => r.sicil_no);
      }

      const archiveRefusedStmt = db.prepare(`
        INSERT INTO gosuslugi_refused_archive (
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
        )
        SELECT
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, ?
        FROM gosuslugi_submissions
        WHERE sicil_no = ? AND gosuslugi_status LIKE '%отказан%'
      `);

      const delRefusedStmt = db.prepare(`
        DELETE FROM gosuslugi_submissions
        WHERE sicil_no = ? AND gosuslugi_status LIKE '%отказан%'
      `);

      const reassignCompStmt = db.prepare(`
        UPDATE gosuslugi_vks_master_list
        SET assigned_computer = ?, updated_at = ?
        WHERE sicil_no = ?
      `);

      let reopenedCount = 0;
      db.exec('BEGIN');
      try {
        for (const sic of targetSicils) {
          archiveRefusedStmt.run(nowStr, sic);
          const res = delRefusedStmt.run(sic);
          reopenedCount += Number(res.changes || 0);
          if ([1, 2, 3, 4].includes(targetComputer)) {
            reassignCompStmt.run(targetComputer, nowStr, sic);
          }
        }
        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        reopenedCount,
        sicils: targetSicils,
        message: `${reopenedCount} adet «Услуга отказана» (Red) kaydı arşivlenerek tekrar gönderim kuyruğuna (Bekleyen) açıldı!`,
      });
    }

    if (action === 'reopen_registered') {
      const scope = String(body?.scope || 'older_than_date').trim(); // 'selected' | 'older_than_date' | 'all'
      const cutoffDate = String(body?.cutoffDate || '2026-10-23').trim(); // e.g. '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24'
      const rawSicilList = Array.isArray(body?.sicils)
        ? body.sicils
        : Array.isArray(body?.sicilNos)
        ? body.sicilNos
        : [];
      const sicilNos: string[] = rawSicilList
        .map((s: any) => String(s || '').trim())
        .filter(Boolean);
      const targetComputer = Number(body?.targetComputer) || 0;

      let targetSicils: string[] = [];

      if (scope === 'selected' && sicilNos.length > 0) {
        targetSicils = sicilNos;
      } else if (scope === 'all') {
        const regRows = db
          .prepare(
            `SELECT sicil_no FROM gosuslugi_submissions
             WHERE gosuslugi_status IN ('Заявление зарегистрировано', 'Промежуточные результаты по заявлению', 'Отправлено в ведомство')`
          )
          .all() as Array<{ sicil_no: string }>;
        targetSicils = regRows.map((r) => r.sicil_no);
      } else {
        const cutoffTimestamp = `${cutoffDate.slice(0, 10)} 23:59:59`;
        const regRows = db
          .prepare(
            `SELECT sicil_no FROM gosuslugi_submissions
             WHERE gosuslugi_status IN ('Заявление зарегистрировано', 'Промежуточные результаты по заявлению', 'Отправлено в ведомство')
               AND submitted_at <= ?`
          )
          .all(cutoffTimestamp) as Array<{ sicil_no: string }>;
        targetSicils = regRows.map((r) => r.sicil_no);
      }

      const archiveRegisteredStmt = db.prepare(`
        INSERT INTO gosuslugi_refused_archive (
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
        )
        SELECT
          sicil_no, worker_name, citizenship, notification_type, period_code,
          application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, ?
        FROM gosuslugi_submissions
        WHERE sicil_no = ?
          AND gosuslugi_status IN ('Заявление зарегистрировано', 'Промежуточные результаты по заявлению', 'Отправлено в ведомство')
      `);

      const delRegisteredStmt = db.prepare(`
        DELETE FROM gosuslugi_submissions
        WHERE sicil_no = ?
          AND gosuslugi_status IN ('Заявление зарегистрировано', 'Промежуточные результаты по заявлению', 'Отправлено в ведомство')
      `);

      const reassignCompStmt = db.prepare(`
        UPDATE gosuslugi_vks_master_list
        SET assigned_computer = ?, updated_at = ?
        WHERE sicil_no = ?
      `);

      let reopenedCount = 0;
      db.exec('BEGIN');
      try {
        for (const sic of targetSicils) {
          archiveRegisteredStmt.run(nowStr, sic);
          const res = delRegisteredStmt.run(sic);
          reopenedCount += Number(res.changes || 0);
          if ([1, 2, 3, 4].includes(targetComputer)) {
            reassignCompStmt.run(targetComputer, nowStr, sic);
          }
        }
        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        reopenedCount,
        sicils: targetSicils,
        message: `${reopenedCount} adet uzun süredir yanıt bekleyen («Заявление зарегистрировано») başvuru arşivlenerek tekrar gönderim kuyruğuna (Bekleyen) açıldı!`,
      });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem (action).' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Kuyruk işlemi tamamlanamadı.',
        detail: String(err?.message || ''),
      },
      { status: 500 }
    );
  }
}
