import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { spawnSync } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ensureMailTables(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gosuslugi_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sicil_no TEXT NOT NULL,
      worker_name TEXT,
      citizenship TEXT,
      notification_type TEXT NOT NULL DEFAULT 'vks_salary',
      period_code TEXT DEFAULT '',
      application_no TEXT NOT NULL,
      gosuslugi_status TEXT NOT NULL DEFAULT 'Отправлено',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      submitted_at TEXT NOT NULL,
      checked_at TEXT DEFAULT '',
      UNIQUE(sicil_no, notification_type, period_code)
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_mail_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      imap_host TEXT NOT NULL DEFAULT 'imap.mail.ru',
      imap_port INTEGER NOT NULL DEFAULT 993,
      email TEXT NOT NULL DEFAULT '',
      app_password TEXT NOT NULL DEFAULT '',
      auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
      last_sync_at TEXT DEFAULT '',
      last_sync_result TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS gosuslugi_mail_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_no TEXT NOT NULL,
      service_title TEXT DEFAULT '',
      gosuslugi_status TEXT NOT NULL,
      status_detail TEXT DEFAULT '',
      email_date TEXT DEFAULT '',
      order_url TEXT DEFAULT '',
      folder_name TEXT DEFAULT '',
      synced_at TEXT NOT NULL,
      UNIQUE(application_no, gosuslugi_status, email_date)
    );
  `);
}

function getStatusPriority(statusStr: string): number {
  const s = String(statusStr || '').toLowerCase().replace(/ё/g, 'е');
  if (
    s.includes('услуга оказана') ||
    s.includes('исполнено') ||
    s.includes('отказ') ||
    s.includes('ошибка') ||
    s.includes('возвращено') ||
    s.includes('прекращено')
  ) {
    return 40;
  }
  if (
    s.includes('зарегистрировано') ||
    s.includes('принято') ||
    s.includes('рассмотрен') ||
    s.includes('обработк')
  ) {
    return 30;
  }
  if (s.includes('отправлено в ведомство') || s.includes('промежуточн')) {
    return 20;
  }
  if (s.includes('сформировано') || s.includes('отправлено') || s.includes('черновик')) {
    return 10;
  }
  return 15;
}

function runPythonMailChecker(payload: {
  imap_host: string;
  imap_port: number;
  email: string;
  app_password: string;
  max_per_folder?: number;
}): any {
  const scriptPath = path.join(process.cwd(), 'scripts', 'gosuslugi_rpa', 'mailru_imap_checker.py');
  const inputJson = JSON.stringify(payload);
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];

  let lastErr = '';
  for (const bin of candidates) {
    try {
      const res = spawnSync(bin, [scriptPath], {
        input: inputJson,
        encoding: 'utf-8',
        timeout: 35000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (res.error) {
        lastErr = res.error.message;
        continue;
      }
      const stdout = String(res.stdout || '').trim();
      if (stdout) {
        const lines = stdout.split(/\r?\n/).filter(Boolean);
        const lastLine = lines[lines.length - 1];
        return JSON.parse(lastLine);
      }
      if (res.stderr) {
        lastErr = String(res.stderr).trim();
      }
    } catch (e: any) {
      lastErr = e?.message || 'Python execution error';
    }
  }

  return {
    success: false,
    message: lastErr || 'Не удалось запустить модуль проверки IMAP Mail.ru.',
  };
}

export async function GET() {
  try {
    const db = getDb();
    ensureMailTables(db);

    const cfgRow = db.prepare('SELECT * FROM gosuslugi_mail_config WHERE id = 1').get() as any;
    const events = db
      .prepare(`
        SELECT
          e.id,
          e.application_no,
          e.service_title,
          e.gosuslugi_status,
          e.status_detail,
          e.email_date,
          e.order_url,
          e.folder_name,
          e.synced_at,
          s.sicil_no,
          s.worker_name,
          s.pdf_filename
        FROM gosuslugi_mail_events e
        LEFT JOIN gosuslugi_submissions s ON s.application_no = e.application_no
        ORDER BY e.id DESC
        LIMIT 150
      `)
      .all();

    return NextResponse.json({
      success: true,
      config: {
        imap_host: cfgRow?.imap_host || 'imap.mail.ru',
        imap_port: Number(cfgRow?.imap_port || 993),
        email: cfgRow?.email || '',
        has_password: Boolean(cfgRow?.app_password && String(cfgRow.app_password).trim().length > 0),
        auto_sync_enabled: cfgRow ? Boolean(cfgRow.auto_sync_enabled) : true,
        last_sync_at: cfgRow?.last_sync_at || '',
        last_sync_result: cfgRow?.last_sync_result || '',
      },
      events,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Mail.ru yapılandırması okunamadı.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    ensureMailTables(db);

    const existing = db.prepare('SELECT * FROM gosuslugi_mail_config WHERE id = 1').get() as any;

    const imapHost = String(body?.imap_host || existing?.imap_host || 'imap.mail.ru').trim();
    const imapPort = Number(body?.imap_port || existing?.imap_port || 993);
    const email = String(body?.email ?? existing?.email ?? '').trim();
    const rawPass = body?.app_password !== undefined ? String(body.app_password).trim() : '';
    const appPassword =
      rawPass && rawPass !== '********' ? rawPass.replace(/\s+/g, '') : existing?.app_password || '';
    const autoSyncEnabled =
      body?.auto_sync_enabled !== undefined
        ? body.auto_sync_enabled
          ? 1
          : 0
        : existing?.auto_sync_enabled ?? 1;

    db.prepare(`
      INSERT INTO gosuslugi_mail_config (id, imap_host, imap_port, email, app_password, auto_sync_enabled, last_sync_at, last_sync_result)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        imap_host = excluded.imap_host,
        imap_port = excluded.imap_port,
        email = excluded.email,
        app_password = excluded.app_password,
        auto_sync_enabled = excluded.auto_sync_enabled
    `).run(
      imapHost,
      imapPort,
      email,
      appPassword,
      autoSyncEnabled,
      existing?.last_sync_at || '',
      existing?.last_sync_result || ''
    );

    return NextResponse.json({
      success: true,
      config: {
        imap_host: imapHost,
        imap_port: imapPort,
        email,
        has_password: Boolean(appPassword),
        auto_sync_enabled: Boolean(autoSyncEnabled),
        last_sync_at: existing?.last_sync_at || '',
        last_sync_result: existing?.last_sync_result || '',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Mail.ru ayarları kaydedilemedi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const db = getDb();
    ensureMailTables(db);

    const existing = db.prepare('SELECT * FROM gosuslugi_mail_config WHERE id = 1').get() as any;

    const imapHost = String(body?.imap_host || existing?.imap_host || 'imap.mail.ru').trim();
    const imapPort = Number(body?.imap_port || existing?.imap_port || 993);
    const email = String(body?.email || existing?.email || '').trim();
    const rawPass = body?.app_password ? String(body.app_password).trim() : '';
    const appPassword =
      rawPass && rawPass !== '********' ? rawPass.replace(/\s+/g, '') : existing?.app_password || '';

    if (!email || !appPassword) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Не указан email Mail.ru или пароль для внешнего приложения (App Password). Откройте настройки Mail.ru в панели ВКС и сохраните данные.',
        },
        { status: 400 }
      );
    }

    // Save credentials if passed directly in POST
    if (body?.email || (rawPass && rawPass !== '********')) {
      db.prepare(`
        INSERT INTO gosuslugi_mail_config (id, imap_host, imap_port, email, app_password, auto_sync_enabled, last_sync_at, last_sync_result)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          imap_host = excluded.imap_host,
          imap_port = excluded.imap_port,
          email = excluded.email,
          app_password = excluded.app_password
      `).run(
        imapHost,
        imapPort,
        email,
        appPassword,
        existing?.auto_sync_enabled ?? 1,
        existing?.last_sync_at || '',
        existing?.last_sync_result || ''
      );
    }

    const result = runPythonMailChecker({
      imap_host: imapHost,
      imap_port: imapPort,
      email,
      app_password: appPassword,
      max_per_folder: Number(body?.max_per_folder || 120),
    });

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (!result || !result.success) {
      const failMsg = result?.message || 'Ошибка синхронизации с Mail.ru IMAP.';
      db.prepare(`
        UPDATE gosuslugi_mail_config
        SET last_sync_at = ?, last_sync_result = ?
        WHERE id = 1
      `).run(nowStr, `Ошибка: ${failMsg}`);

      return NextResponse.json({ success: false, message: failMsg }, { status: 400 });
    }

    const eventsList = Array.isArray(result.events) ? result.events : [];
    const latestByApp = Array.isArray(result.latest_by_application)
      ? result.latest_by_application
      : [];

    const insertEventStmt = db.prepare(`
      INSERT INTO gosuslugi_mail_events (
        application_no, service_title, gosuslugi_status, status_detail,
        email_date, order_url, folder_name, synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(application_no, gosuslugi_status, email_date) DO UPDATE SET
        status_detail = excluded.status_detail,
        order_url = COALESCE(NULLIF(excluded.order_url, ''), gosuslugi_mail_events.order_url),
        folder_name = excluded.folder_name,
        synced_at = excluded.synced_at
    `);

    for (const ev of eventsList) {
      if (!ev?.application_no || !ev?.gosuslugi_status) continue;
      insertEventStmt.run(
        String(ev.application_no).trim(),
        String(ev.service_title || '').trim(),
        String(ev.gosuslugi_status).trim(),
        String(ev.status_detail || '').trim(),
        String(ev.email_date || '').trim(),
        String(ev.order_url || '').trim(),
        String(ev.folder_name || '').trim(),
        nowStr
      );
    }

    // Now update matching rows in gosuslugi_submissions by application_no (or by submitted_at timestamp if application_no is 'ОТПРАВЛЕНО' / empty)
    const findSubStmt = db.prepare(`
      SELECT id, gosuslugi_status
      FROM gosuslugi_submissions
      WHERE application_no = ?
    `);
    const findUnlinkedSubsStmt = db.prepare(`
      SELECT id, sicil_no, worker_name, gosuslugi_status, submitted_at
      FROM gosuslugi_submissions
      WHERE application_no = '' OR application_no = 'ОТПРАВЛЕНО'
    `);
    const updateSubStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET gosuslugi_status = ?,
          status_detail = ?,
          checked_at = ?
      WHERE id = ?
    `);
    const linkAndUpdateSubStmt = db.prepare(`
      UPDATE gosuslugi_submissions
      SET application_no = ?,
          gosuslugi_status = ?,
          status_detail = ?,
          checked_at = ?
      WHERE id = ?
    `);

    const parseFlexibleDateMs = (raw: string): number | null => {
      const s = String(raw || '').trim();
      if (!s) return null;
      // Format 1: DD.MM.YYYY HH:MM (from Gosuslugi email)
      const mRu = s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
      if (mRu) {
        return Date.UTC(
          Number(mRu[3]),
          Number(mRu[2]) - 1,
          Number(mRu[1]),
          Number(mRu[4]),
          Number(mRu[5]),
          0
        );
      }
      // Format 2: YYYY-MM-DD HH:MM:SS (from submitted_at)
      const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (mIso) {
        return Date.UTC(
          Number(mIso[1]),
          Number(mIso[2]) - 1,
          Number(mIso[3]),
          Number(mIso[4]),
          Number(mIso[5]),
          Number(mIso[6] || 0)
        );
      }
      return null;
    };

    let updatedSubmissions = 0;
    for (const item of latestByApp) {
      const appNo = String(item?.application_no || '').trim();
      const newStatus = String(item?.gosuslugi_status || '').trim();
      const newDetail = String(item?.status_detail || '').trim();
      const emailDateStr = String(item?.email_date || '').trim();
      if (!appNo || !newStatus) continue;

      const matchingSubs = findSubStmt.all(appNo) as Array<{ id: number; gosuslugi_status: string }>;
      if (matchingSubs.length > 0) {
        for (const sub of matchingSubs) {
          const curPrio = getStatusPriority(sub.gosuslugi_status);
          const newPrio = getStatusPriority(newStatus);
          if (newPrio >= curPrio) {
            const r = updateSubStmt.run(newStatus, newDetail, nowStr, sub.id);
            if (r.changes > 0) {
              updatedSubmissions += r.changes;
            }
          }
        }
      } else if (emailDateStr) {
        // Fallback: Match fast-submitted rows ('ОТПРАВЛЕНО' / '') by submission timestamp (±4 minutes)
        const emailMs = parseFlexibleDateMs(emailDateStr);
        if (emailMs !== null) {
          const unlinkedRows = findUnlinkedSubsStmt.all() as Array<{
            id: number;
            sicil_no: string;
            worker_name: string;
            gosuslugi_status: string;
            submitted_at: string;
          }>;
          let bestCandidate: { id: number; diffMin: number } | null = null;
          for (const uRow of unlinkedRows) {
            const subMs = parseFlexibleDateMs(uRow.submitted_at);
            if (subMs === null) continue;
            const diffMin = Math.abs(emailMs - subMs) / 60000;
            if (diffMin <= 4.0 && (!bestCandidate || diffMin < bestCandidate.diffMin)) {
              bestCandidate = { id: uRow.id, diffMin };
            }
          }
          if (bestCandidate) {
            const r = linkAndUpdateSubStmt.run(appNo, newStatus, newDetail, nowStr, bestCandidate.id);
            if (r.changes > 0) {
              updatedSubmissions += r.changes;
            }
          }
        }
      }
    }

    const summaryText = `Проверено писем Госуслуг: ${eventsList.length} (заявлений: ${latestByApp.length}, обновлено в таблице: ${updatedSubmissions})`;
    db.prepare(`
      UPDATE gosuslugi_mail_config
      SET last_sync_at = ?, last_sync_result = ?
      WHERE id = 1
    `).run(nowStr, summaryText);

    const storedEvents = db
      .prepare(`
        SELECT
          e.id,
          e.application_no,
          e.service_title,
          e.gosuslugi_status,
          e.status_detail,
          e.email_date,
          e.order_url,
          e.folder_name,
          e.synced_at,
          s.sicil_no,
          s.worker_name,
          s.pdf_filename
        FROM gosuslugi_mail_events e
        LEFT JOIN gosuslugi_submissions s ON s.application_no = e.application_no
        ORDER BY e.id DESC
        LIMIT 150
      `)
      .all();

    return NextResponse.json({
      success: true,
      scannedFolders: result.scanned_folders || ['Входящие', 'Спам'],
      totalEmails: eventsList.length,
      uniqueApplications: latestByApp.length,
      updatedSubmissions,
      lastSyncAt: nowStr,
      summary: summaryText,
      events: storedEvents,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Mail.ru senkronizasyonu sırasında hata oluştu.' },
      { status: 500 }
    );
  }
}
