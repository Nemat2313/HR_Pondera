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
      UNIQUE(sicil_no, notification_type, period_code)
    );
    UPDATE gosuslugi_submissions
    SET gosuslugi_status = 'Отправлено (PDF не скачан)'
    WHERE gosuslugi_status LIKE '%GosuslugiVksBot%' OR gosuslugi_status LIKE '%Step 16%';
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

    return NextResponse.json({
      success: true,
      data: rows,
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

    const stmt = db.prepare(`
      INSERT INTO gosuslugi_submissions (
        sicil_no, worker_name, citizenship, notification_type, period_code,
        application_no, gosuslugi_status, status_detail, pdf_filename, submitted_at, checked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sicil_no, notification_type, period_code) DO UPDATE SET
        worker_name = COALESCE(NULLIF(excluded.worker_name, ''), gosuslugi_submissions.worker_name),
        citizenship = COALESCE(NULLIF(excluded.citizenship, ''), gosuslugi_submissions.citizenship),
        application_no = CASE
          WHEN excluded.application_no != '' THEN excluded.application_no
          ELSE gosuslugi_submissions.application_no
        END,
        gosuslugi_status = COALESCE(NULLIF(excluded.gosuslugi_status, ''), gosuslugi_submissions.gosuslugi_status),
        status_detail = COALESCE(NULLIF(excluded.status_detail, ''), gosuslugi_submissions.status_detail),
        pdf_filename = COALESCE(NULLIF(excluded.pdf_filename, ''), gosuslugi_submissions.pdf_filename),
        checked_at = CASE
          WHEN excluded.checked_at != '' THEN excluded.checked_at
          ELSE gosuslugi_submissions.checked_at
        END
    `);

    let upserted = 0;
    let skippedCollisions = 0;
    for (const item of items) {
      const sicil = String(item.sicil_no || item.sicil || item.code || '').trim();
      const appNo = String(item.application_no || item.applicationNo || '').trim();
      const rawStatus = String(item.gosuslugi_status || item.gosuslugiStatus || 'Отправлено').trim();
      const normalizedStatus = /GosuslugiVksBot|Step 16/i.test(rawStatus)
        ? 'Отправлено (PDF не скачан)'
        : rawStatus;

      if (!sicil && !appNo) continue;

      // Prevent linking the same Gosuslugi application_no to two different workers across multiple computers
      if (appNo && sicil) {
        const existingOwner = checkCollisionStmt.get(appNo, sicil) as { sicil_no: string; worker_name: string } | undefined;
        if (existingOwner) {
          skippedCollisions++;
          continue;
        }
      }

      stmt.run(
        sicil,
        String(item.worker_name || item.workerName || '').trim(),
        String(item.citizenship || '').trim(),
        String(item.notification_type || item.notificationType || 'vks_salary').trim().toLowerCase(),
        String(item.period_code || item.periodCode || '').trim(),
        appNo,
        normalizedStatus,
        String(item.status_detail || item.statusDetail || '').trim(),
        String(item.pdf_filename || item.pdfFilename || '').trim(),
        String(item.submitted_at || item.submittedAt || nowStr).trim(),
        String(item.checked_at || item.checkedAt || '').trim()
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
      SET gosuslugi_status = ?,
          status_detail = COALESCE(NULLIF(?, ''), status_detail),
          checked_at = ?
      WHERE application_no = ?
    `);

    const bySicilStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET gosuslugi_status = ?,
          status_detail = COALESCE(NULLIF(?, ''), status_detail),
          application_no = COALESCE(NULLIF(?, ''), application_no),
          checked_at = ?
      WHERE sicil_no = ?
    `);

    let updated = 0;
    for (const u of updates) {
      const appNo = String(u.application_no || u.applicationNo || '').trim();
      const sicil = String(u.sicil_no || u.sicil || u.code || '').trim();
      const status = String(u.gosuslugi_status || u.gosuslugiStatus || '').trim();
      const detail = String(u.status_detail || u.statusDetail || '').trim();
      if (!status) continue;

      if (appNo) {
        const res = byAppNoStmt.run(status, detail, nowStr, appNo);
        if (res.changes > 0) {
          updated += res.changes;
          continue;
        }
      }
      if (sicil) {
        const res = bySicilStmt.run(status, detail, appNo, nowStr, sicil);
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
