import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ensureTable(db: any) {
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_sub_hist_sicil ON gosuslugi_submission_history(sicil_no);
    CREATE INDEX IF NOT EXISTS idx_sub_hist_appno ON gosuslugi_submission_history(application_no);
  `);
  try {
    db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN updated_at TEXT DEFAULT '';`);
  } catch {}
  db.exec(`
    UPDATE gosuslugi_submissions
    SET gosuslugi_status = 'Отправлено (PDF не скачан)'
    WHERE gosuslugi_status LIKE '%GosuslugiVksBot%' OR gosuslugi_status LIKE '%Step 16%';
    DELETE FROM gosuslugi_submissions
    WHERE application_no = ''
      AND (
        gosuslugi_status LIKE '%Target page, context or browser has been closed%'
        OR gosuslugi_status LIKE '%Browser has been closed%'
        OR gosuslugi_status LIKE '%Context or browser has been closed%'
        OR gosuslugi_status LIKE '%epgu-cf-ui-long-button:has-text(%'
      );
  `);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const notificationType = searchParams.get('type') || '';
    const periodCode = searchParams.get('periodCode') || '';
    const sicilNo = searchParams.get('sicil') || '';

    const db = getDb();
    ensureTable(db);

    const conditions: string[] = [];
    const params: any[] = [];

    if (notificationType) {
      conditions.push('LOWER(notification_type) = LOWER(?)');
      params.push(notificationType);
    }
    if (periodCode) {
      conditions.push('(period_code = ? OR period_code = "")');
      params.push(periodCode);
    }
    if (sicilNo) {
      conditions.push('sicil_no = ?');
      params.push(sicilNo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM gosuslugi_submissions ${whereClause} ORDER BY submitted_at DESC, id DESC`)
      .all(...params);

    const archivedRows = db
      .prepare(`SELECT DISTINCT application_no FROM gosuslugi_refused_archive WHERE application_no != ''`)
      .all() as Array<{ application_no: string }>;

    return NextResponse.json({
      success: true,
      data: rows,
      archivedAppNos: archivedRows.map((r) => r.application_no),
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Gosuslugi başvuru kayıtları alınamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.records)
      ? body.records
      : Array.isArray(body?.items)
      ? body.items
      : body
      ? [body]
      : [];

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: 'Kayıt verisi bulunamadı.' }, { status: 400 });
    }

    const db = getDb();
    ensureTable(db);

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const checkCollisionStmt = db.prepare(`
      SELECT sicil_no, worker_name
      FROM gosuslugi_submissions
      WHERE application_no = ? AND sicil_no != '' AND sicil_no != ?
      LIMIT 1
    `);

    const checkArchivedRefusalStmt = db.prepare(`
      SELECT id FROM gosuslugi_refused_archive
      WHERE application_no = ? AND application_no != ''
      LIMIT 1
    `);

    const checkArchivedSicilStmt = db.prepare(`
      SELECT MAX(archived_at) AS max_archived_at, MAX(submitted_at) AS max_submitted_at
      FROM gosuslugi_refused_archive
      WHERE sicil_no = ?
    `);

    const getExistingBySicilStmt = db.prepare(`
      SELECT id, sicil_no, worker_name, citizenship, notification_type, period_code,
             application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, checked_at
      FROM gosuslugi_submissions
      WHERE sicil_no = ? AND notification_type = ? AND period_code = ?
      LIMIT 1
    `);

    const archiveSingleRowStmt = db.prepare(`
      INSERT INTO gosuslugi_refused_archive (
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const checkLastHistoryStmt = db.prepare(`
      SELECT application_no, gosuslugi_status
      FROM gosuslugi_submission_history
      WHERE sicil_no = ?
      ORDER BY id DESC
      LIMIT 1
    `);

    const insertHistoryStmt = db.prepare(`
      INSERT INTO gosuslugi_submission_history (
        sicil_no, worker_name, application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, event_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const logHistoryIfChanged = (
      hSicil: string,
      hWorker: string,
      hAppNo: string,
      hStatus: string,
      hDetail: string,
      hPdf: string,
      hSubAt: string,
      hEventAt: string
    ) => {
      if (!hSicil || !hStatus) return;
      try {
        const lastH = checkLastHistoryStmt.get(hSicil) as
          | { application_no: string; gosuslugi_status: string }
          | undefined;
        if (!lastH || lastH.application_no !== hAppNo || lastH.gosuslugi_status !== hStatus) {
          insertHistoryStmt.run(hSicil, hWorker, hAppNo, hStatus, hDetail, hPdf, hSubAt, hEventAt);
        }
      } catch {}
    };

    const forceUpdateSupersedingStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET worker_name = COALESCE(NULLIF(?, ''), worker_name),
          citizenship = COALESCE(NULLIF(?, ''), citizenship),
          application_no = ?,
          gosuslugi_status = ?,
          status_detail = ?,
          pdf_filename = ?,
          submitted_at = ?,
          checked_at = ?,
          updated_at = ?
      WHERE id = ?
    `);

    const stmt = db.prepare(`
      INSERT INTO gosuslugi_submissions (
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, checked_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sicil_no, notification_type, period_code) DO UPDATE SET
        worker_name = COALESCE(NULLIF(excluded.worker_name, ''), gosuslugi_submissions.worker_name),
        citizenship = COALESCE(NULLIF(excluded.citizenship, ''), gosuslugi_submissions.citizenship),
        application_no = CASE
          WHEN excluded.application_no != '' THEN excluded.application_no
          ELSE gosuslugi_submissions.application_no
        END,
        gosuslugi_status = CASE
          WHEN gosuslugi_submissions.gosuslugi_status = 'Услуга оказана'
          THEN 'Услуга оказана'
          WHEN excluded.gosuslugi_status LIKE 'Ошибка%'
            AND gosuslugi_submissions.application_no != ''
            AND gosuslugi_submissions.gosuslugi_status NOT LIKE 'Ошибка%'
          THEN gosuslugi_submissions.gosuslugi_status
          WHEN excluded.gosuslugi_status IN ('Отправлено', 'Отправлено (PDF не скачан)', 'В обработке')
            AND gosuslugi_submissions.gosuslugi_status IN ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению', 'Отправлено в ведомство', 'Заявление зарегистрировано')
          THEN gosuslugi_submissions.gosuslugi_status
          WHEN excluded.gosuslugi_status IN ('Заявление зарегистрировано', 'Отправлено в ведомство')
            AND gosuslugi_submissions.gosuslugi_status IN ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению')
          THEN gosuslugi_submissions.gosuslugi_status
          WHEN excluded.gosuslugi_status = 'Промежуточные результаты по заявлению'
            AND gosuslugi_submissions.gosuslugi_status IN ('Услуга оказана', 'Услуга отказана')
          THEN gosuslugi_submissions.gosuslugi_status
          ELSE COALESCE(NULLIF(excluded.gosuslugi_status, ''), gosuslugi_submissions.gosuslugi_status)
        END,
        status_detail = COALESCE(NULLIF(excluded.status_detail, ''), gosuslugi_submissions.status_detail),
        pdf_filename = COALESCE(NULLIF(excluded.pdf_filename, ''), gosuslugi_submissions.pdf_filename),
        checked_at = CASE
          WHEN excluded.checked_at != '' THEN excluded.checked_at
          ELSE gosuslugi_submissions.checked_at
        END,
        updated_at = CASE
          WHEN gosuslugi_submissions.application_no != excluded.application_no
            OR gosuslugi_submissions.gosuslugi_status != excluded.gosuslugi_status
            OR gosuslugi_submissions.pdf_filename != excluded.pdf_filename
            OR gosuslugi_submissions.updated_at = ''
          THEN excluded.updated_at
          ELSE gosuslugi_submissions.updated_at
        END
    `);

    let upserted = 0;
    let skippedCollisions = 0;
    for (const item of items) {
      const sicil = String(item.sicil_no || item.sicil || item.code || '').trim();
      const appNo = String(item.application_no || item.applicationNo || '').trim();
      const rawStatus = String(item.gosuslugi_status || item.gosuslugiStatus || 'Отправлено').trim();
      if (!appNo && /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(rawStatus)) {
        continue;
      }
      const normalizedStatus = /GosuslugiVksBot|Step 16/i.test(rawStatus)
        ? 'Отправлено (PDF не скачан)'
        : rawStatus;

      if (!sicil && !appNo) continue;

      // 1. Skip old refused application_no that was explicitly archived/re-opened for re-sending
      if (appNo && checkArchivedRefusalStmt.get(appNo)) {
        continue;
      }

      // 1b. Skip old errored/refused record from a PC's local bridge state if this sicil was already archived/re-opened
      if (sicil && (/^ошибк/i.test(normalizedStatus) || /отказан/i.test(normalizedStatus))) {
        const archInfo = checkArchivedSicilStmt.get(sicil) as
          | { max_archived_at?: string; max_submitted_at?: string }
          | undefined;
        const rawIncomingSubAt = String(item.submitted_at || item.submittedAt || '').trim();
        if (archInfo?.max_archived_at) {
          if (
            !rawIncomingSubAt ||
            rawIncomingSubAt <= archInfo.max_archived_at ||
            (archInfo.max_submitted_at && rawIncomingSubAt <= archInfo.max_submitted_at)
          ) {
            continue;
          }
        }
      }

      // 2. Skip Oct 21 morning MVD outage refusals (8295xxxxxx - 8297xxxxxx) that were already re-submitted
      if (/^829[567]\d{6}$/.test(appNo) && /отказан/i.test(normalizedStatus)) {
        continue;
      }

      const notifType = String(item.notification_type || item.notificationType || 'vks_salary').trim().toLowerCase();
      const periodCode = String(item.period_code || item.periodCode || '2026-3').trim() || '2026-3';
      const workerName = String(item.worker_name || item.workerName || '').trim();
      const citizenship = String(item.citizenship || '').trim();
      const statusDetail = String(item.status_detail || item.statusDetail || '').trim();

      // Reject non-VKS migration arrival/departure ('прибытии и убытии') or work permit ('разрешение на работу') orders
      if (/уведомления о прибытии|прибытии и убытии|разрешение на работу иг/i.test(statusDetail)) {
        continue;
      }
      let pdfFilename = String(item.pdf_filename || item.pdfFilename || '').trim();
      const submittedAt = String(item.submitted_at || item.submittedAt || nowStr).trim();
      const checkedAt = String(item.checked_at || item.checkedAt || '').trim();

      // Prevent linking the same Gosuslugi application_no to two different workers across multiple computers
      if (appNo && sicil) {
        const existingOwner = checkCollisionStmt.get(appNo, sicil) as { sicil_no: string; worker_name: string } | undefined;
        if (existingOwner) {
          skippedCollisions++;
          continue;
        }
      }

      const existingRow = sicil
        ? (getExistingBySicilStmt.get(sicil, notifType, periodCode) as
            | {
                id: number;
                sicil_no: string;
                worker_name: string;
                citizenship: string;
                notification_type: string;
                period_code: string;
                application_no: string;
                gosuslugi_status: string;
                status_detail: string;
                pdf_filename: string;
                submitted_at: string;
                checked_at: string;
              }
            | undefined)
        : undefined;

      if (existingRow) {
        const exAppNo = String(existingRow.application_no || '').trim();
        const exStatus = String(existingRow.gosuslugi_status || '').trim();
        const exSubAt = String(existingRow.submitted_at || '').trim();

        // Ensure existingRow's prior state is recorded in history before any change
        logHistoryIfChanged(
          existingRow.sicil_no,
          existingRow.worker_name,
          exAppNo,
          exStatus,
          existingRow.status_detail,
          existingRow.pdf_filename,
          exSubAt,
          existingRow.checked_at || exSubAt || nowStr
        );

        // 2b. Once a worker's notification has reached 'Услуга оказана', NEVER let any other computer's cached/intermediate status downgrade it
        if (exStatus === 'Услуга оказана' && normalizedStatus !== 'Услуга оказана') {
          continue;
        }

        // 3. Never downgrade to an older (smaller integer) Gosuslugi application_no
        if (/^\d{8,14}$/.test(exAppNo) && /^\d{8,14}$/.test(appNo)) {
          if (Number(appNo) < Number(exAppNo)) {
            continue;
          }
        }

        // 4. If worker was submitted/re-submitted on or after 2026-10-21 21:00:00, its Gosuslugi application_no must be >= 8300000000.
        // Do not let stale local ledgers or old PDFs attach a pre-outage (< 8300000000) application_no unless it is already 'Услуга оказана'.
        if (
          exSubAt >= '2026-10-21 21:00:00' &&
          /^\d{10}$/.test(appNo) &&
          Number(appNo) < 8300000000 &&
          normalizedStatus !== 'Услуга оказана'
        ) {
          continue;
        }

        // 5. Never let a stale refusal checked BEFORE the row's submitted_at overwrite a newer re-submission
        if (checkedAt && exSubAt && checkedAt < exSubAt && /отказан/i.test(normalizedStatus)) {
          continue;
        }

        // 6. If incoming has a strictly NEWER (larger integer) application_no than existingRow, supersede existingRow completely
        if (/^\d{8,14}$/.test(exAppNo) && /^\d{8,14}$/.test(appNo) && Number(appNo) > Number(exAppNo)) {
          if (/отказан/i.test(exStatus) && !checkArchivedRefusalStmt.get(exAppNo)) {
            archiveSingleRowStmt.run(
              existingRow.sicil_no,
              existingRow.worker_name,
              existingRow.citizenship,
              existingRow.notification_type,
              existingRow.period_code,
              exAppNo,
              exStatus,
              existingRow.status_detail,
              existingRow.pdf_filename,
              exSubAt,
              nowStr
            );
          }
          const validNewPdf = pdfFilename && pdfFilename.includes(appNo) ? pdfFilename : '';
          forceUpdateSupersedingStmt.run(
            workerName,
            citizenship,
            appNo,
            normalizedStatus,
            statusDetail,
            validNewPdf,
            submittedAt > exSubAt ? submittedAt : exSubAt,
            checkedAt || nowStr,
            nowStr,
            existingRow.id
          );
          logHistoryIfChanged(
            sicil,
            workerName || existingRow.worker_name,
            appNo,
            normalizedStatus,
            statusDetail,
            validNewPdf,
            submittedAt > exSubAt ? submittedAt : exSubAt,
            checkedAt || nowStr
          );
          upserted++;
          continue;
        }

        // 7. If existingRow is 'Услуга отказана' and a fresh re-submission arrives (empty appNo, fresh submittedAt > exSubAt, no checkedAt)
        if (
          /отказан/i.test(exStatus) &&
          !appNo &&
          !checkedAt &&
          ['Отправлено', 'Отправлено (PDF не скачан)', 'Заявление зарегистрировано'].includes(normalizedStatus) &&
          submittedAt > exSubAt
        ) {
          if (exAppNo && !checkArchivedRefusalStmt.get(exAppNo)) {
            archiveSingleRowStmt.run(
              existingRow.sicil_no,
              existingRow.worker_name,
              existingRow.citizenship,
              existingRow.notification_type,
              existingRow.period_code,
              exAppNo,
              exStatus,
              existingRow.status_detail,
              existingRow.pdf_filename,
              exSubAt,
              nowStr
            );
          }
          forceUpdateSupersedingStmt.run(
            workerName,
            citizenship,
            '',
            normalizedStatus,
            '',
            '',
            submittedAt,
            '',
            nowStr,
            existingRow.id
          );
          logHistoryIfChanged(
            sicil,
            workerName || existingRow.worker_name,
            '',
            normalizedStatus,
            '',
            '',
            submittedAt,
            submittedAt || nowStr
          );
          upserted++;
          continue;
        }

        // Ensure pdfFilename does not carry an old application_no different from the row's application_no
        const effectiveAppNo = appNo || exAppNo;
        if (pdfFilename && effectiveAppNo) {
          const pdfAppMatch = pdfFilename.match(/([789]\d{9})/);
          if (pdfAppMatch && pdfAppMatch[1] !== effectiveAppNo) {
            pdfFilename = '';
          }
        }
      }

      stmt.run(
        sicil,
        workerName,
        citizenship,
        notifType,
        periodCode,
        appNo,
        normalizedStatus,
        statusDetail,
        pdfFilename,
        submittedAt,
        checkedAt,
        nowStr
      );
      logHistoryIfChanged(
        sicil,
        workerName || existingRow?.worker_name || '',
        appNo || existingRow?.application_no || '',
        normalizedStatus,
        statusDetail,
        pdfFilename,
        submittedAt,
        checkedAt || submittedAt || nowStr
      );
      upserted++;
    }

    return NextResponse.json({
      success: true,
      upserted,
      skippedCollisions,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Gosuslugi başvuru numarası kaydedilemedi.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : body ? [body] : [];

    const db = getDb();
    ensureTable(db);

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const byAppNoStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET gosuslugi_status = CASE
            WHEN gosuslugi_status = 'Услуга оказана' THEN 'Услуга оказана'
            WHEN ? IN ('Отправлено', 'Отправлено (PDF не скачан)', 'В обработке', 'Заявление зарегистрировано', 'Отправлено в ведомство')
              AND gosuslugi_status IN ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению')
            THEN gosuslugi_status
            ELSE ?
          END,
          status_detail = COALESCE(NULLIF(?, ''), status_detail),
          checked_at = ?
      WHERE application_no = ?
    `);

    const bySicilStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET gosuslugi_status = CASE
            WHEN gosuslugi_status = 'Услуга оказана' THEN 'Услуга оказана'
            WHEN ? IN ('Отправлено', 'Отправлено (PDF не скачан)', 'В обработке', 'Заявление зарегистрировано', 'Отправлено в ведомство')
              AND gosuslugi_status IN ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению')
            THEN gosuslugi_status
            ELSE ?
          END,
          status_detail = COALESCE(NULLIF(?, ''), status_detail),
          application_no = COALESCE(NULLIF(?, ''), application_no),
          checked_at = ?
      WHERE sicil_no = ?
        AND (
          application_no = ''
          OR ? = ''
          OR CAST(? AS INTEGER) >= CAST(application_no AS INTEGER)
        )
    `);

    const checkArchivedRefusalStmt = db.prepare(`
      SELECT id FROM gosuslugi_refused_archive
      WHERE application_no = ? AND application_no != ''
      LIMIT 1
    `);

    const checkArchivedSicilStmt = db.prepare(`
      SELECT MAX(archived_at) AS max_archived_at, MAX(submitted_at) AS max_submitted_at
      FROM gosuslugi_refused_archive
      WHERE sicil_no = ?
    `);

    let updated = 0;
    for (const u of updates) {
      const appNo = String(u.application_no || u.applicationNo || '').trim();
      const sicil = String(u.sicil_no || u.sicil || u.code || '').trim();
      const status = String(u.gosuslugi_status || u.gosuslugiStatus || '').trim();
      const detail = String(u.status_detail || u.statusDetail || '').trim();
      if (!status) continue;
      if (appNo && checkArchivedRefusalStmt.get(appNo)) continue;
      if (/^829[567]\d{6}$/.test(appNo) && /отказан/i.test(status)) continue;

      if (appNo) {
        const res = byAppNoStmt.run(status, status, detail, nowStr, appNo);
        if (res.changes > 0) {
          updated += res.changes;
          continue;
        }
      }
      if (sicil) {
        const res = bySicilStmt.run(status, status, detail, appNo, nowStr, sicil, appNo, appNo);
        updated += res.changes;
      }
    }

    return NextResponse.json({
      success: true,
      updated,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Gosuslugi başvuru durumu güncellenemedi.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const appNo = searchParams.get('applicationNo') || '';
    const sicil = searchParams.get('sicil') || '';

    if (!appNo && !sicil) {
      return NextResponse.json({ success: false, message: 'Silinecek parametre belirtilmedi.' }, { status: 400 });
    }

    const db = getDb();
    ensureTable(db);

    let deleted = 0;
    if (appNo) {
      const res = db.prepare('DELETE FROM gosuslugi_submissions WHERE application_no = ?').run(appNo);
      deleted += res.changes;
    }
    if (sicil) {
      const res = db.prepare('DELETE FROM gosuslugi_submissions WHERE sicil_no = ?').run(sicil);
      deleted += res.changes;
    }

    return NextResponse.json({ success: true, deleted });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kayıt silinemedi.' },
      { status: 500 }
    );
  }
}
