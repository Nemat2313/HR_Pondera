import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  sendTelegramMessage,
  enqueueTelegramOutbox,
  getMoscowTimeParts,
} from '@/lib/telegramNotifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getMoscowNowIso(): string {
  const mskMs = Date.now() + 3 * 3600 * 1000;
  return new Date(mskMs).toISOString().replace('T', ' ').slice(0, 19);
}

// Mismatched (sicil_no -> wrong application_no) pairs verified from Gosuslugi org audit (28.10.2026)
const BLOCKED_MISMATCHED_APP_BY_SICIL: Record<string, string> = {
  // VKS_197: non-VKS service ('Регистрация автотранспорта')
  '902127': '8324568212',
  // VKS_2754: ACİL (29) — application_no belongs to another worker on Gosuslugi
  '941180': '8286574341',
  '937975': '8294240592',
  '934977': '8310552187',
  '927061': '8311177673',
  '937851': '8290698264',
  '941976': '8287106492',
  '938730': '8287534774',
  '940683': '8291445402',
  '938390': '8291785562',
  '935934': '8304165921',
  '930970': '8304949515',
  '937133': '8291182665',
  '931095': '8306890167',
  '937526': '8292385071',
  '900701': '8303416245',
  '929073': '8306932902',
  '941091': '8306428687',
  '900088': '8303994182',
  '938033': '8316624567',
  '931246': '8291571654',
  '937909': '8291937845',
  '902773': '8317594914',
  '935312': '8316021625',
  '938789': '8291098061',
  '931391': '8291264938',
  '936243': '8307402667',
  '932622': '8305657900',
  '939622': '8288949057',
  '936545': '8305756556',
  // VKS_2754: Numara düzelt (3) — old wrong application_no before replacement
  '933532': '8284206508',
  '937332': '8284083499',
  '941737': '8269035605',
};

let __audit2810Reconciled = false;
function reconcileAudit2810(db: any) {
  if (__audit2810Reconciled) return;
  try {
    db.exec('BEGIN');
    // 1. Remove wrong application_no assignments for ACİL (29) + 902127 so they re-enter the pending queue
    const delSubStmt = db.prepare(
      `DELETE FROM gosuslugi_submissions WHERE sicil_no = ? AND application_no = ?`
    );
    const delHistStmt = db.prepare(
      `DELETE FROM gosuslugi_submission_history WHERE sicil_no = ? AND application_no = ?`
    );
    for (const [sicil, wrongApp] of Object.entries(BLOCKED_MISMATCHED_APP_BY_SICIL)) {
      if (sicil === '933532' || sicil === '937332' || sicil === '941737') continue;
      delSubStmt.run(sicil, wrongApp);
      delHistStmt.run(sicil, wrongApp);
    }

    // 2. Fix the 3 'Numara düzelt (3)' workers who have accepted notifications under a different application_no
    const fixAppStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET application_no = ?,
          gosuslugi_status = 'Услуга оказана',
          pdf_filename = CASE WHEN pdf_filename LIKE '%' || ? || '%' THEN pdf_filename ELSE '' END
      WHERE sicil_no = ? AND (application_no = ? OR application_no = '')
    `);
    fixAppStmt.run('8284260476', '8284260476', '933532', '8284206508');
    fixAppStmt.run('8291445402', '8291445402', '937332', '8284083499');
    fixAppStmt.run('8291785562', '8291785562', '941737', '8269035605');

    // 3. Fix VKS_197 statuses: 939777 (8334527775) -> Ошибка отправки заявления в ведомство, 932472 (8316358380) -> Заявление зарегистрировано
    db.prepare(`
      UPDATE gosuslugi_submissions
      SET gosuslugi_status = 'Ошибка отправки заявления в ведомство',
          status_detail = 'Не найден документ РНР 77 2600039400 с бланком: ВВ 1039374. Проверьте корректность данных или обратитесь в подразделение выдачи документа.',
          checked_at = '2026-10-27 16:34:00'
      WHERE sicil_no = '939777' AND application_no = '8334527775'
    `).run();

    db.prepare(`
      UPDATE gosuslugi_submissions
      SET gosuslugi_status = 'Заявление зарегистрировано',
          status_detail = 'Заявление принято ведомством',
          checked_at = '2026-10-24 11:43:00'
      WHERE sicil_no = '932472' AND application_no = '8316358380' AND gosuslugi_status = 'Услуга отказана'
    `).run();
    db.prepare(`DELETE FROM gosuslugi_refused_archive WHERE application_no = '8316358380'`).run();

    // 4. Clean sicil prefixes from worker_name in gosuslugi_submissions and gosuslugi_submission_history
    const dirtyNames = db
      .prepare(`SELECT id, worker_name FROM gosuslugi_submissions WHERE worker_name GLOB '[0-9]*'`)
      .all() as Array<{ id: number; worker_name: string }>;
    if (dirtyNames.length > 0) {
      const updNameStmt = db.prepare(`UPDATE gosuslugi_submissions SET worker_name = ? WHERE id = ?`);
      for (const row of dirtyNames) {
        const cleaned = String(row.worker_name || '').replace(/^\d+[а-яА-Яa-zA-Z]?\s+/, '').trim();
        if (cleaned && cleaned !== row.worker_name) {
          updNameStmt.run(cleaned, row.id);
        }
      }
    }
    const dirtyHistNames = db
      .prepare(`SELECT id, worker_name FROM gosuslugi_submission_history WHERE worker_name GLOB '[0-9]*'`)
      .all() as Array<{ id: number; worker_name: string }>;
    if (dirtyHistNames.length > 0) {
      const updHistNameStmt = db.prepare(`UPDATE gosuslugi_submission_history SET worker_name = ? WHERE id = ?`);
      for (const row of dirtyHistNames) {
        const cleaned = String(row.worker_name || '').replace(/^\d+[а-яА-Яa-zA-Z]?\s+/, '').trim();
        if (cleaned && cleaned !== row.worker_name) {
          updHistNameStmt.run(cleaned, row.id);
        }
      }
    }

    db.exec('COMMIT');
    __audit2810Reconciled = true;
  } catch {
    try {
      db.exec('ROLLBACK');
    } catch {}
  }
}

let __submissionsTimestampsHealed = false;
function healSubmissionTimestamps(db: any) {
  if (__submissionsTimestampsHealed) return;
  try {
    db.prepare(`
      UPDATE gosuslugi_submissions
      SET submitted_at = '2026-10-22 09:19:00',
          checked_at = '2026-10-23 15:50:00'
      WHERE application_no = '8303204675'
    `).run();

    const rows = db
      .prepare(
        `SELECT id, sicil_no, application_no, submitted_at, checked_at
         FROM gosuslugi_submissions`
      )
      .all() as Array<{
      id: number;
      sicil_no: string;
      application_no: string;
      submitted_at: string;
      checked_at: string;
    }>;

    const isBadSubAt = (appNo: string, subAt: string): boolean => {
      if (!subAt) return true;
      if (
        subAt.startsWith('2026-10-26 23:50') ||
        subAt.startsWith('2026-10-26 17:42') ||
        subAt.startsWith('2026-10-26 15:18') ||
        subAt.startsWith('2026-10-26 14:46')
      ) {
        return true;
      }
      if (/^\d{10}$/.test(appNo)) {
        const num = Number(appNo);
        if (num < 8300000000 && subAt >= '2026-10-21 12:00:00') return true;
        if (num < 8315000000 && subAt >= '2026-10-24 12:00:00') return true;
        if (num < 8322000000 && subAt >= '2026-10-26 00:00:00') return true;
      }
      return false;
    };

    const anchors: Array<{ appNum: number; subAt: string; ms: number }> = [];
    for (const r of rows) {
      if (/^\d{10}$/.test(r.application_no) && !isBadSubAt(r.application_no, r.submitted_at)) {
        const ms = Date.parse(r.submitted_at.replace(' ', 'T') + 'Z');
        if (!Number.isNaN(ms)) {
          anchors.push({ appNum: Number(r.application_no), subAt: r.submitted_at, ms });
        }
      }
    }
    anchors.sort((a, b) => a.appNum - b.appNum);

    if (anchors.length > 10) {
      const updSubStmt = db.prepare(
        `UPDATE gosuslugi_submissions SET submitted_at = ?, checked_at = ? WHERE id = ?`
      );
      db.exec('BEGIN');
      try {
        for (const r of rows) {
          let newSub = r.submitted_at;
          let newChk = r.checked_at;
          let changed = false;

          if (/^\d{10}$/.test(r.application_no) && isBadSubAt(r.application_no, r.submitted_at)) {
            const targetNum = Number(r.application_no);
            let lo = 0;
            let hi = anchors.length - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (anchors[mid].appNum < targetNum) lo = mid + 1;
              else hi = mid - 1;
            }
            if (lo <= 0) {
              newSub = anchors[0].subAt;
            } else if (lo >= anchors.length) {
              newSub = anchors[anchors.length - 1].subAt;
            } else {
              const prevA = anchors[lo - 1];
              const nextA = anchors[lo];
              if (nextA.ms >= prevA.ms && nextA.appNum > prevA.appNum) {
                const ratio = (targetNum - prevA.appNum) / (nextA.appNum - prevA.appNum);
                const interpMs = Math.round(prevA.ms + (nextA.ms - prevA.ms) * ratio);
                newSub = new Date(interpMs).toISOString().replace('T', ' ').slice(0, 19);
              } else {
                newSub = prevA.subAt;
              }
            }
            changed = newSub !== r.submitted_at;
          }

          if (newChk && newSub && newChk < newSub) {
            newChk = r.application_no ? newSub : '';
            changed = true;
          }

          if (changed) {
            updSubStmt.run(newSub, newChk, r.id);
          }
        }
        db.exec('COMMIT');
        __submissionsTimestampsHealed = true;
      } catch {
        try {
          db.exec('ROLLBACK');
        } catch {}
      }
    }
  } catch {}
}

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
  try {
    db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN status_pdf_filename TEXT DEFAULT '';`);
  } catch {}
  db.exec(`
    UPDATE gosuslugi_submissions
    SET gosuslugi_status = 'Отправлено (PDF не скачан)'
    WHERE gosuslugi_status LIKE '%GosuslugiVksBot%' OR gosuslugi_status LIKE '%Step 16%';

    UPDATE gosuslugi_submissions
    SET gosuslugi_status = 'Данные не найдены в базе МВД'
    WHERE application_no = ''
      AND (gosuslugi_status LIKE '%Данные не найдены в базе МВД%' OR gosuslugi_status LIKE '%не найдены в базе МВД%');

    UPDATE gosuslugi_submissions
    SET gosuslugi_status = 'Ошибка отправки заявления в ведомство'
    WHERE gosuslugi_status != 'Услуга оказана'
      AND (
        status_detail LIKE '%Ошибка отправки заявления%'
        OR application_no IN (
          SELECT DISTINCT application_no FROM gosuslugi_submission_history
          WHERE application_no != ''
            AND (status_detail LIKE '%Ошибка отправки заявления%' OR gosuslugi_status LIKE '%Ошибка отправки заявления%')
        )
      );

    UPDATE gosuslugi_submissions
    SET gosuslugi_status = 'Ошибка получения заявления ведомством'
    WHERE gosuslugi_status != 'Услуга оказана'
      AND (
        status_detail LIKE '%Ошибка получения заявления%'
        OR application_no IN (
          SELECT DISTINCT application_no FROM gosuslugi_submission_history
          WHERE application_no != ''
            AND (status_detail LIKE '%Ошибка получения заявления%' OR gosuslugi_status LIKE '%Ошибка получения заявления%')
        )
      );

    DELETE FROM gosuslugi_submission_history
    WHERE gosuslugi_status = 'vks_salary'
       OR (
         application_no != ''
         AND id NOT IN (
           SELECT MAX(id)
           FROM gosuslugi_submission_history
           WHERE application_no != '' AND gosuslugi_status != 'vks_salary'
           GROUP BY sicil_no, application_no
         )
       );

    UPDATE gosuslugi_submission_history
    SET gosuslugi_status = (
      SELECT s.gosuslugi_status
      FROM gosuslugi_submissions s
      WHERE s.sicil_no = gosuslugi_submission_history.sicil_no
        AND s.application_no = gosuslugi_submission_history.application_no
      LIMIT 1
    ),
    submitted_at = COALESCE(
      NULLIF(
        (
          SELECT s.submitted_at
          FROM gosuslugi_submissions s
          WHERE s.sicil_no = gosuslugi_submission_history.sicil_no
            AND s.application_no = gosuslugi_submission_history.application_no
          LIMIT 1
        ),
        ''
      ),
      gosuslugi_submission_history.submitted_at
    )
    WHERE application_no != ''
      AND EXISTS (
        SELECT 1
        FROM gosuslugi_submissions s
        WHERE s.sicil_no = gosuslugi_submission_history.sicil_no
          AND s.application_no = gosuslugi_submission_history.application_no
      );

    UPDATE gosuslugi_submissions
    SET checked_at = ''
    WHERE application_no = ''
      AND checked_at != ''
      AND submitted_at != ''
      AND checked_at < submitted_at;

    UPDATE gosuslugi_submissions
    SET checked_at = submitted_at
    WHERE application_no != ''
      AND checked_at != ''
      AND submitted_at != ''
      AND checked_at < submitted_at
      AND SUBSTR(checked_at, 1, 10) = SUBSTR(submitted_at, 1, 10);

    DELETE FROM gosuslugi_submissions
    WHERE application_no = ''
      AND (
        gosuslugi_status LIKE '%Target page, context or browser has been closed%'
        OR gosuslugi_status LIKE '%Browser has been closed%'
        OR gosuslugi_status LIKE '%Context or browser has been closed%'
        OR gosuslugi_status LIKE '%epgu-cf-ui-long-button:has-text(%'
      );

    DELETE FROM gosuslugi_refused_archive
    WHERE application_no != ''
      AND application_no IN (
        SELECT application_no FROM gosuslugi_submissions
        WHERE application_no != ''
          AND gosuslugi_status NOT LIKE '%отказан%'
      );
  `);
  healSubmissionTimestamps(db);
  reconcileAudit2810(db);
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

    const nowStr = getMoscowNowIso();

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
      SELECT MAX(archived_at) AS max_archived_at,
             MAX(submitted_at) AS max_submitted_at,
             MAX(CASE WHEN LENGTH(application_no) = 10 THEN application_no ELSE '' END) AS max_archived_app_no
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
      SELECT id, application_no, gosuslugi_status
      FROM gosuslugi_submission_history
      WHERE sicil_no = ?
      ORDER BY id DESC
      LIMIT 1
    `);

    const checkHistoryByAppStmt = db.prepare(`
      SELECT id, gosuslugi_status
      FROM gosuslugi_submission_history
      WHERE sicil_no = ? AND application_no = ? AND application_no != ''
      ORDER BY id DESC
      LIMIT 1
    `);

    const updateHistoryByIdStmt = db.prepare(`
      UPDATE gosuslugi_submission_history
      SET worker_name = COALESCE(NULLIF(?, ''), worker_name),
          gosuslugi_status = ?,
          status_detail = COALESCE(NULLIF(?, ''), status_detail),
          pdf_filename = COALESCE(NULLIF(?, ''), pdf_filename),
          event_at = ?
      WHERE id = ?
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
        if (hAppNo) {
          const existingForApp = checkHistoryByAppStmt.get(hSicil, hAppNo) as
            | { id: number; gosuslugi_status: string }
            | undefined;
          if (existingForApp) {
            if (existingForApp.gosuslugi_status !== hStatus) {
              updateHistoryByIdStmt.run(hWorker, hStatus, hDetail, hPdf, hEventAt, existingForApp.id);
            }
            return;
          }
        }
        const lastH = checkLastHistoryStmt.get(hSicil) as
          | { id: number; application_no: string; gosuslugi_status: string }
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
            AND (
              excluded.gosuslugi_status IN ('Отправлено', 'Отправлено (PDF не скачан)', 'В обработке', 'Данные не найдены в базе МВД')
              OR (
                excluded.gosuslugi_status LIKE 'Ошибка%'
                AND excluded.gosuslugi_status NOT LIKE 'Ошибка отправки заявления%'
                AND excluded.gosuslugi_status NOT LIKE 'Ошибка получения заявления%'
              )
            )
          THEN 'Услуга оказана'
          WHEN (
              excluded.gosuslugi_status LIKE 'Ошибка%'
              OR excluded.gosuslugi_status = 'Данные не найдены в базе МВД'
            )
            AND excluded.gosuslugi_status NOT LIKE 'Ошибка отправки заявления%'
            AND excluded.gosuslugi_status NOT LIKE 'Ошибка получения заявления%'
            AND gosuslugi_submissions.application_no != ''
            AND gosuslugi_submissions.gosuslugi_status NOT LIKE 'Ошибка%'
          THEN gosuslugi_submissions.gosuslugi_status
          WHEN excluded.gosuslugi_status IN ('Отправлено', 'Отправлено (PDF не скачан)', 'В обработке')
            AND (
              gosuslugi_submissions.gosuslugi_status IN ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению', 'Отправлено в ведомство', 'Заявление зарегистрировано')
              OR gosuslugi_submissions.gosuslugi_status LIKE 'Ошибка отправки заявления%'
              OR gosuslugi_submissions.gosuslugi_status LIKE 'Ошибка получения заявления%'
            )
          THEN gosuslugi_submissions.gosuslugi_status
          WHEN excluded.gosuslugi_status IN ('Заявление зарегистрировано', 'Отправлено в ведомство')
            AND (
              gosuslugi_submissions.gosuslugi_status IN ('Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению')
              OR gosuslugi_submissions.gosuslugi_status LIKE 'Ошибка отправки заявления%'
              OR gosuslugi_submissions.gosuslugi_status LIKE 'Ошибка получения заявления%'
            )
          THEN gosuslugi_submissions.gosuslugi_status
          WHEN excluded.gosuslugi_status = 'Промежуточные результаты по заявлению'
            AND gosuslugi_submissions.gosuslugi_status IN ('Услуга оказана', 'Услуга отказана')
          THEN gosuslugi_submissions.gosuslugi_status
          ELSE COALESCE(NULLIF(excluded.gosuslugi_status, ''), gosuslugi_submissions.gosuslugi_status)
        END,
        status_detail = CASE
          WHEN gosuslugi_submissions.gosuslugi_status = 'Услуга оказана'
            AND excluded.gosuslugi_status != 'Услуга оказана'
            AND excluded.gosuslugi_status != 'Услуга отказана'
            AND excluded.gosuslugi_status NOT LIKE 'Ошибка отправки заявления%'
            AND excluded.gosuslugi_status NOT LIKE 'Ошибка получения заявления%'
          THEN gosuslugi_submissions.status_detail
          ELSE COALESCE(NULLIF(excluded.status_detail, ''), gosuslugi_submissions.status_detail)
        END,
        pdf_filename = COALESCE(NULLIF(excluded.pdf_filename, ''), gosuslugi_submissions.pdf_filename),
        submitted_at = CASE
          WHEN excluded.submitted_at != ''
            AND (
              gosuslugi_submissions.submitted_at = ''
              OR gosuslugi_submissions.gosuslugi_status LIKE 'Ошибка%'
              OR gosuslugi_submissions.gosuslugi_status = 'Данные не найдены в базе МВД'
              OR excluded.application_no != gosuslugi_submissions.application_no
              OR (excluded.application_no = gosuslugi_submissions.application_no AND excluded.submitted_at < gosuslugi_submissions.submitted_at)
            )
          THEN excluded.submitted_at
          ELSE gosuslugi_submissions.submitted_at
        END,
        checked_at = CASE
          WHEN excluded.checked_at != '' THEN excluded.checked_at
          WHEN excluded.application_no = '' AND excluded.submitted_at > gosuslugi_submissions.checked_at THEN ''
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
    const newlyMvdNotFoundAlerts: Array<{
      sicil: string;
      workerName: string;
      citizenship: string;
    }> = [];
    for (const item of items) {
      const sicil = String(item.sicil_no || item.sicil || item.code || '').trim();
      const appNo = String(item.application_no || item.applicationNo || '').trim();
      const rawStatus = String(item.gosuslugi_status || item.gosuslugiStatus || 'Отправлено').trim();
      if (!appNo && /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(rawStatus)) {
        continue;
      }
      const normalizedStatus = /GosuslugiVksBot|Step 16/i.test(rawStatus)
        ? 'Отправлено (PDF не скачан)'
        : /ошибка отправки заявления/i.test(rawStatus)
        ? 'Ошибка отправки заявления в ведомство'
        : /ошибка получения заявления/i.test(rawStatus)
        ? 'Ошибка получения заявления ведомством'
        : /не найден[ыо]?\s+в\s+базе\s+мвд/i.test(rawStatus)
        ? 'Данные не найдены в базе МВД'
        : rawStatus;

      if (!sicil && !appNo) continue;

      const forceCorrection = Boolean(item.force_status_correction || item.forceStatusCorrection);
      const rawPdfCheck = String(item.pdf_filename || item.pdfFilename || '').trim();
      const rawIncomingSubAt = String(item.submitted_at || item.submittedAt || '').trim();
      // Only skip legacy pre-fix unsent draft records from before 2026-10-26 10:15:00 (< 8320000000);
      // accept all genuine Fast-Mode ('Быстрая отправка без PDF' -> 'Отправлено (PDF не скачан)') submissions!
      const isLegacyUnsentDraft =
        !forceCorrection &&
        (normalizedStatus === 'Отправлено (PDF не скачан)' || normalizedStatus === 'Отправлено') &&
        !rawPdfCheck &&
        rawIncomingSubAt !== '' &&
        rawIncomingSubAt < '2026-10-26 10:15:00' &&
        (!/^\d{10}$/.test(appNo) || Number(appNo) < 8320000000);
      if (isLegacyUnsentDraft) {
        continue;
      }

      const adminForceOverride = Boolean(item.admin_force_override || item.adminForceOverride);

      const notifType = String(item.notification_type || item.notificationType || 'vks_salary').trim().toLowerCase();
      const periodCode = String(item.period_code || item.periodCode || '2026-3').trim() || '2026-3';
      const workerName = String(item.worker_name || item.workerName || '')
        .replace(/^\d+[а-яА-Яa-zA-Z]?\s+/, '')
        .trim();
      const citizenship = String(item.citizenship || '').trim();
      const statusDetail = String(item.status_detail || item.statusDetail || '').trim();

      if (appNo === '8324568212' || (sicil && appNo && BLOCKED_MISMATCHED_APP_BY_SICIL[sicil] === appNo)) {
        continue;
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

      const isUpdatingCurrentActiveApp = Boolean(
        existingRow && appNo && String(existingRow.application_no || '').trim() === appNo
      );

      // 1. Skip old refused/re-opened/errored application_no that was explicitly archived for re-sending
      // (unless it is the currently active application_no in gosuslugi_submissions, or МВД approved it as 'Услуга оказана', or adminForceOverride is set)
      if (
        !adminForceOverride &&
        !isUpdatingCurrentActiveApp &&
        appNo &&
        normalizedStatus !== 'Услуга оказана' &&
        checkArchivedRefusalStmt.get(appNo)
      ) {
        continue;
      }

      // 1b. Skip old errored/refused/stale-registered record from a PC's local bridge state if this sicil was already archived/re-opened,
      // EXCEPT when updating the currently active application_no, or when appNo is a newer 10-digit Gosuslugi application number (> max_archived_app_no) or 'Услуга оказана'.
      if (!adminForceOverride && !isUpdatingCurrentActiveApp && sicil && normalizedStatus !== 'Услуга оказана') {
        const archInfo = checkArchivedSicilStmt.get(sicil) as
          | { max_archived_at?: string; max_submitted_at?: string; max_archived_app_no?: string }
          | undefined;
        const isNewerValidAppNo =
          /^\d{10}$/.test(appNo) &&
          Number(appNo) >= 8300000000 &&
          (!archInfo?.max_archived_app_no || appNo > archInfo.max_archived_app_no);
        if (archInfo?.max_archived_at && !isNewerValidAppNo) {
          if (
            !rawIncomingSubAt ||
            rawIncomingSubAt <= archInfo.max_archived_at ||
            (archInfo.max_submitted_at && rawIncomingSubAt <= archInfo.max_submitted_at)
          ) {
            continue;
          }
        }
      }

      const isOfficialPortalErrorOrRefusal =
        normalizedStatus === 'Ошибка отправки заявления в ведомство' ||
        normalizedStatus === 'Ошибка получения заявления ведомством' ||
        normalizedStatus === 'Услуга отказана';

      // Reject non-VKS migration arrival/departure ('прибытии и убытии'), work permit ('разрешение на работу'), or vehicle registration orders
      if (
        appNo === '8316972551' ||
        appNo === '8324568212' ||
        /уведомления о прибытии|прибытии и убытии|разрешение на работу иг|регистрация автотранспорта/i.test(statusDetail)
      ) {
        continue;
      }
      let pdfFilename = String(item.pdf_filename || item.pdfFilename || '').trim();
      const isKnownBatchOverwriteSubAt =
        rawIncomingSubAt.startsWith('2026-10-26 23:50') ||
        rawIncomingSubAt.startsWith('2026-10-26 17:42') ||
        rawIncomingSubAt.startsWith('2026-10-26 15:18') ||
        rawIncomingSubAt.startsWith('2026-10-26 14:46');
      const effectiveIncomingSubAt =
        isKnownBatchOverwriteSubAt && /^\d{10}$/.test(appNo) && Number(appNo) < 8324000000
          ? ''
          : rawIncomingSubAt;
      const submittedAt = String(effectiveIncomingSubAt || existingRow?.submitted_at || nowStr).trim();
      const checkedAt = String(item.checked_at || item.checkedAt || '').trim();

      // Prevent linking the same Gosuslugi application_no to two different workers across multiple computers
      if (appNo && sicil) {
        const existingOwner = checkCollisionStmt.get(appNo, sicil) as { sicil_no: string; worker_name: string } | undefined;
        if (existingOwner) {
          skippedCollisions++;
          continue;
        }
      }

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

        const isIntermediateIncoming =
          normalizedStatus === 'Заявление зарегистрировано' ||
          normalizedStatus === 'Отправлено в ведомство' ||
          normalizedStatus === 'Промежуточные результаты по заявлению' ||
          normalizedStatus === 'Отправлено' ||
          normalizedStatus === 'Отправлено (PDF не скачан)' ||
          normalizedStatus === 'В обработке';

        const isExistingFalseOkazana =
          exStatus === 'Услуга оказана' &&
          (existingRow.status_detail.startsWith('Заявление зарегистрировано') ||
            existingRow.status_detail.startsWith('Ошибка'));

        const isSameAppOfficialCorrection =
          Boolean(item.admin_force_override) ||
          (Boolean(appNo) && appNo === exAppNo && isOfficialPortalErrorOrRefusal) ||
          (forceCorrection && (!isIntermediateIncoming || exStatus !== 'Услуга оказана' || isExistingFalseOkazana));

        // 2b. Once a worker's notification has genuinely reached 'Услуга оказана', do not let another computer's cached/intermediate status downgrade it,
        // EXCEPT when correcting the exact same application_no with an official Gosuslugi portal error/refusal or fixing a mismatched status_detail
        if (exStatus === 'Услуга оказана' && normalizedStatus !== 'Услуга оказана' && !isSameAppOfficialCorrection) {
          continue;
        }

        // 3. Never downgrade to an older (smaller integer) Gosuslugi application_no (unless forceCorrection is set)
        if (!forceCorrection && /^\d{8,14}$/.test(exAppNo) && /^\d{8,14}$/.test(appNo)) {
          if (Number(appNo) < Number(exAppNo)) {
            continue;
          }
        }

        // 4. If worker was submitted/re-submitted on or after 2026-10-21 21:00:00 and has NO application_no yet,
        // do not let stale local ledgers attach a pre-outage (< 8300000000) application_no unless forceCorrection or 'Услуга оказана'
        if (
          !forceCorrection &&
          !exAppNo &&
          exSubAt >= '2026-10-21 21:00:00' &&
          /^\d{10}$/.test(appNo) &&
          Number(appNo) < 8300000000 &&
          normalizedStatus !== 'Услуга оказана'
        ) {
          continue;
        }

        // 5. Never let a stale refusal checked BEFORE the row's submitted_at overwrite a newer re-submission
        if (!forceCorrection && checkedAt && exSubAt && checkedAt < exSubAt && /отказан/i.test(normalizedStatus)) {
          continue;
        }

        // 6. If incoming has a strictly NEWER (larger integer) application_no than existingRow,
        // or if existingRow is a local 'Ошибка' (without exAppNo or with a different appNo) and incoming is a valid sent submission,
        // or if isSameAppOfficialCorrection is true, supersede existingRow completely
        const isExistingOfficialPortalError =
          exStatus.startsWith('Ошибка отправки заявления') ||
          exStatus.startsWith('Ошибка получения заявления');
        if (
          isSameAppOfficialCorrection ||
          (/^\d{8,14}$/.test(exAppNo) && /^\d{8,14}$/.test(appNo) && Number(appNo) > Number(exAppNo)) ||
          (!exAppNo && /^\d{8,14}$/.test(appNo) && !/^ошибк/i.test(normalizedStatus)) ||
          (
            (/^ошибк/i.test(exStatus) || exStatus === 'Данные не найдены в базе МВД') &&
            !/^ошибк/i.test(normalizedStatus) &&
            (!isExistingOfficialPortalError || (Boolean(appNo) && appNo !== exAppNo)) &&
            (Boolean(appNo) || submittedAt >= exSubAt)
          )
        ) {
          if (
            !isSameAppOfficialCorrection &&
            (/отказан/i.test(exStatus) || /^ошибк/i.test(exStatus)) &&
            exAppNo &&
            !checkArchivedRefusalStmt.get(exAppNo)
          ) {
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
          const validNewPdf =
            item.clear_pdf_filename
              ? ''
              : pdfFilename && (!appNo || pdfFilename.includes(appNo))
              ? pdfFilename
              : isSameAppOfficialCorrection
              ? existingRow.pdf_filename
              : '';
          const preservedSubAt =
            adminForceOverride && effectiveIncomingSubAt
              ? effectiveIncomingSubAt
              : appNo && appNo === exAppNo && exSubAt
              ? effectiveIncomingSubAt && effectiveIncomingSubAt < exSubAt
                ? effectiveIncomingSubAt
                : exSubAt
              : effectiveIncomingSubAt || exSubAt || nowStr;
          const preservedChkAt =
            item.clear_checked_at
              ? ''
              : checkedAt || (adminForceOverride ? existingRow.checked_at : nowStr);
          forceUpdateSupersedingStmt.run(
            workerName,
            citizenship,
            appNo,
            normalizedStatus,
            statusDetail || existingRow.status_detail,
            validNewPdf,
            preservedSubAt,
            preservedChkAt,
            nowStr,
            existingRow.id
          );
          const supStatusPdf = String(
            item.status_pdf_filename ||
              item.statusPdfFilename ||
              (validNewPdf.toUpperCase().includes('_STATUS_A4') ? validNewPdf : '')
          ).trim();
          if (supStatusPdf) {
            try {
              db.prepare(`UPDATE gosuslugi_submissions SET status_pdf_filename = ? WHERE id = ?`).run(
                supStatusPdf,
                existingRow.id
              );
            } catch {}
          }
          if (
            normalizedStatus === 'Данные не найдены в базе МВД' &&
            exStatus !== 'Данные не найдены в базе МВД'
          ) {
            newlyMvdNotFoundAlerts.push({
              sicil,
              workerName: workerName || existingRow.worker_name || '—',
              citizenship: citizenship || existingRow.citizenship || '—',
            });
          }
          logHistoryIfChanged(
            sicil,
            workerName || existingRow.worker_name,
            appNo,
            normalizedStatus,
            statusDetail,
            validNewPdf,
            preservedSubAt,
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
      const incomingStatusPdf = String(
        item.status_pdf_filename ||
          item.statusPdfFilename ||
          (pdfFilename.toUpperCase().includes('_STATUS_A4') ? pdfFilename : '')
      ).trim();
      if (incomingStatusPdf && sicil) {
        try {
          db.prepare(
            `UPDATE gosuslugi_submissions SET status_pdf_filename = ? WHERE sicil_no = ? AND notification_type = ? AND period_code = ?`
          ).run(incomingStatusPdf, sicil, notifType, periodCode);
        } catch {}
      }
      const savedAfter = getExistingBySicilStmt.get(sicil, notifType, periodCode) as
        | {
            application_no: string;
            gosuslugi_status: string;
            status_detail: string;
            pdf_filename: string;
            submitted_at: string;
            checked_at: string;
          }
        | undefined;
      const finalSavedStatus = savedAfter?.gosuslugi_status || normalizedStatus;
      const finalSavedAppNo = savedAfter?.application_no || appNo || existingRow?.application_no || '';
      if (
        finalSavedStatus === 'Данные не найдены в базе МВД' &&
        existingRow?.gosuslugi_status !== 'Данные не найдены в базе МВД'
      ) {
        newlyMvdNotFoundAlerts.push({
          sicil,
          workerName: workerName || existingRow?.worker_name || '—',
          citizenship: citizenship || existingRow?.citizenship || '—',
        });
      }
      logHistoryIfChanged(
        sicil,
        workerName || existingRow?.worker_name || '',
        finalSavedAppNo,
        finalSavedStatus,
        savedAfter?.status_detail || statusDetail,
        savedAfter?.pdf_filename || pdfFilename,
        savedAfter?.submitted_at || submittedAt,
        checkedAt || submittedAt || nowStr
      );
      upserted++;
    }

    if (newlyMvdNotFoundAlerts.length > 0) {
      const msk = getMoscowTimeParts();
      const lines = newlyMvdNotFoundAlerts
        .slice(0, 15)
        .map(
          (w, idx) =>
            `${idx + 1}. <b>${w.workerName}</b> — Сицил: <code>${w.sicil}</code> (${w.citizenship})`
        )
        .join('\n');
      const alertHtml = [
        `⚠️ <b>ГОСУСЛУГИ ВКС — Данные не найдены в базе МВД</b>`,
        `🕒 <b>Время (МСК):</b> ${msk.dateDisplay} ${msk.timeDisplay}`,
        ``,
        lines,
        ``,
        `📋 <b>Статус:</b> Данные не найдены в базе МВД (МВД может отказать)`,
        `⚡ <i>Заявление не отправлено и выделено в вкладку «MVD Bulunamadı». Робот без остановки продолжает отправку следующих сотрудников.</i>`,
      ].join('\n');

      try {
        const tgRes = await sendTelegramMessage(alertHtml);
        if (!tgRes.ok) {
          enqueueTelegramOutbox(db, 'mvd_not_found', alertHtml);
        }
      } catch {
        enqueueTelegramOutbox(db, 'mvd_not_found', alertHtml);
      }
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

    const nowStr = getMoscowNowIso();

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
      SELECT MAX(archived_at) AS max_archived_at,
             MAX(submitted_at) AS max_submitted_at,
             MAX(CASE WHEN LENGTH(application_no) = 10 THEN application_no ELSE '' END) AS max_archived_app_no
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
      if (appNo === '8324568212' || (sicil && appNo && BLOCKED_MISMATCHED_APP_BY_SICIL[sicil] === appNo)) continue;
      if (/^829[567]\d{6}$/.test(appNo) && /отказан/i.test(status)) continue;

      if (appNo) {
        const res = byAppNoStmt.run(status, status, detail, nowStr, appNo);
        if (res.changes > 0) {
          updated += res.changes;
          continue;
        }
      }
      if (appNo && checkArchivedRefusalStmt.get(appNo)) continue;
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
    const shouldArchive = searchParams.get('archive') === '1';

    if (!appNo && !sicil) {
      return NextResponse.json({ success: false, message: 'Silinecek parametre belirtilmedi.' }, { status: 400 });
    }

    const db = getDb();
    ensureTable(db);
    const nowStr = getMoscowNowIso();

    let deleted = 0;
    if (appNo) {
      if (shouldArchive) {
        db.prepare(`
          INSERT INTO gosuslugi_refused_archive (
            sicil_no, worker_name, citizenship, notification_type, period_code,
            application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, archived_at
          )
          SELECT sicil_no, worker_name, citizenship, notification_type, period_code,
                 application_no, 'Услуга отказана', 'Неверная услуга (архивировано)', pdf_filename, submitted_at, ?
          FROM gosuslugi_submissions WHERE application_no = ?
        `).run(nowStr, appNo);
      }
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
