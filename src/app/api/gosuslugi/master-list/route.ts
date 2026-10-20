import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  `);
}

function isSentSubmission(sub: any): boolean {
  if (!sub) return false;
  const appNo = String(sub.application_no || '').trim();
  const pdf = String(sub.pdf_filename || '').trim();
  const status = String(sub.gosuslugi_status || '').trim();
  if (appNo !== '' || pdf !== '') return true;
  if (/^ошибк/i.test(status)) return false;
  if (/отправлен|зарегистрирован|оказан|исполнен|принят|промежуточн|обработк|PDF не скачан/i.test(status)) {
    return true;
  }
  return false;
}

function isErrorSubmission(sub: any): boolean {
  if (!sub || isSentSubmission(sub)) return false;
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

  return {
    sicilNo,
    rowKey,
    rowOrder,
    assignedComputer,
    workerObj,
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
        `SELECT sicil_no, application_no, gosuslugi_status, pdf_filename, submitted_at FROM gosuslugi_submissions WHERE LOWER(notification_type) = 'vks_salary' ORDER BY id DESC`
      )
      .all() as Array<any>;

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
        error: number;
        pending: number;
        minRow: number;
        maxRow: number;
      }
    > = {
      1: { computer: 1, total: 0, sent: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
      2: { computer: 2, total: 0, sent: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
      3: { computer: 3, total: 0, sent: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
      4: { computer: 4, total: 0, sent: 0, error: 0, pending: 0, minRow: 0, maxRow: 0 },
    };

    let totalSent = 0;
    let totalError = 0;
    let totalPending = 0;

    const enrichedList: any[] = [];

    for (const m of masterRows) {
      const comp = [1, 2, 3, 4].includes(Number(m.assigned_computer))
        ? Number(m.assigned_computer)
        : 1;
      const sub = subBySicil.get(m.sicil_no);
      const sent = isSentSubmission(sub);
      const errored = isErrorSubmission(sub);

      const rowStatus: 'success' | 'error' | 'pending' = sent
        ? 'success'
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
      if (statusFilter === 'error' && !errored) continue;
      if (statusFilter === 'pending' && (sent || errored)) continue;

      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(m.worker_json || '{}');
      } catch {
        continue;
      }

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
        selected: rowStatus === 'pending' || statusFilter === 'error',
        applicationNo: sub?.application_no || '',
        application_no: sub?.application_no || '',
        gosuslugiStatus: sub?.gosuslugi_status || '',
        gosuslugi_status: sub?.gosuslugi_status || '',
        pdfFilename: sub?.pdf_filename || '',
        pdf_filename: sub?.pdf_filename || '',
        submittedAt: sub?.submitted_at || '',
        updatedAt: m.updated_at || '',
      });
    }

    return NextResponse.json({
      success: true,
      totalMaster: masterRows.length,
      computers: computersSummary,
      summary: {
        total: masterRows.length,
        sent: totalSent,
        error: totalError,
        pending: totalPending,
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

    const clearErrorStmt = db.prepare(`
      DELETE FROM gosuslugi_submissions
      WHERE sicil_no = ? AND application_no = '' AND gosuslugi_status LIKE 'Ошибка%'
    `);

    let inserted = 0;
    let updated = 0;
    let clearedErrors = 0;
    const seenSicilCounts = new Map<string, number>();

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
          // If seeding from raw master Excel and this row was already updated by Zahid bey's Excel or UI edit, keep the updated fields!
          if (mode === 'seed' && existingMatch.source_tag && existingMatch.source_tag !== 'master_excel') {
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

          const mergedWorker: Record<string, any> = {
            ...prevObj,
            ...norm.workerObj,
            // Preserve non-empty fields from prevObj or personnel DB if incoming field is empty
            rnrSeries: norm.workerObj.rnrSeries || prevObj.rnrSeries || dbFallback?.rnrSeries || '',
            rnrNumber: norm.workerObj.rnrNumber || prevObj.rnrNumber || dbFallback?.rnrNumber || '',
            rnrIssueDate: norm.workerObj.rnrIssueDate || prevObj.rnrIssueDate || dbFallback?.rnrIssueDate || '',
            blankSeries: norm.workerObj.blankSeries || prevObj.blankSeries || dbFallback?.blankSeries || '',
            blankNumber: norm.workerObj.blankNumber || prevObj.blankNumber || dbFallback?.blankNumber || '',
            rowOrder: finalRowOrder,
            rowKey: targetRowKey,
            assignedComputer: finalComputer,
          };

          upsertStmt.run(
            targetRowKey,
            norm.sicilNo,
            finalRowOrder,
            finalComputer,
            JSON.stringify(mergedWorker),
            sourceTag,
            nowStr
          );
          updated++;

          if (clearErrorsForUpdated) {
            const delRes = clearErrorStmt.run(norm.sicilNo);
            clearedErrors += Number(delRes.changes || 0);
          }
        } else {
          const finalRowOrder = mode === 'seed' ? norm.rowOrder : ++maxRowOrder;
          const finalComputer =
            forcedComputer > 0 ? forcedComputer : norm.assignedComputer;

          const newWorker = {
            ...norm.workerObj,
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
            norm.sicilNo,
            finalRowOrder,
            finalComputer,
            JSON.stringify(newWorker),
            sourceTag,
            nowStr
          );
          inserted++;

          if (clearErrorsForUpdated) {
            const delRes = clearErrorStmt.run(norm.sicilNo);
            clearedErrors += Number(delRes.changes || 0);
          }
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
             WHERE m.assigned_computer = ? AND s.application_no = '' AND s.gosuslugi_status LIKE 'Ошибка%'`
          )
          .all(computer) as Array<{ sicil_no: string }>;
        targetSicils = compRows.map((r) => r.sicil_no);
      } else {
        const errRows = db
          .prepare(
            `SELECT sicil_no FROM gosuslugi_submissions WHERE application_no = '' AND gosuslugi_status LIKE 'Ошибка%'`
          )
          .all() as Array<{ sicil_no: string }>;
        targetSicils = errRows.map((r) => r.sicil_no);
      }

      const delErrorStmt = db.prepare(`
        DELETE FROM gosuslugi_submissions
        WHERE sicil_no = ? AND application_no = '' AND gosuslugi_status LIKE 'Ошибка%'
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
