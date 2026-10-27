import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getMoscowNowIso(): string {
  const mskMs = Date.now() + 3 * 3600 * 1000;
  return new Date(mskMs).toISOString().replace('T', ' ').slice(0, 19);
}

function getPdfStorageDir(): string {
  const dir = path.join(process.cwd(), 'data', 'gosuslugi_pdfs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function sanitizePdfFilename(raw: string): string {
  const base = path.basename(String(raw || '').trim());
  const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawFile = searchParams.get('file') || searchParams.get('filename') || '';
    let appNo = searchParams.get('appNo') || searchParams.get('application_no') || '';
    let sicilNo = searchParams.get('sicil') || searchParams.get('sicil_no') || '';
    const forceDownload = searchParams.get('download') === '1';
    const wantScreenshot = searchParams.get('screenshot') === '1';

    if (rawFile) {
      const mBoth = rawFile.match(/^(\d{4,8})_([789]\d{8,12})_/);
      if (mBoth) {
        if (!sicilNo) sicilNo = mBoth[1];
        if (!appNo) appNo = mBoth[2];
      } else {
        const mApp = rawFile.match(/([789]\d{9})/);
        if (mApp && !appNo) appNo = mApp[1];
      }
    }

    const storageDir = getPdfStorageDir();
    let targetFile = rawFile ? sanitizePdfFilename(rawFile) : '';

    if (wantScreenshot && (!targetFile || !fs.existsSync(path.join(storageDir, targetFile))) && (appNo || sicilNo)) {
      try {
        const db = getDb();
        let scRow: any = null;
        if (appNo) {
          scRow = db
            .prepare('SELECT status_pdf_filename FROM gosuslugi_submissions WHERE application_no = ? AND status_pdf_filename != "" LIMIT 1')
            .get(appNo);
        }
        if (!scRow && sicilNo) {
          scRow = db
            .prepare('SELECT status_pdf_filename FROM gosuslugi_submissions WHERE sicil_no = ? AND status_pdf_filename != "" ORDER BY id DESC LIMIT 1')
            .get(sicilNo);
        }
        if (scRow?.status_pdf_filename && fs.existsSync(path.join(storageDir, sanitizePdfFilename(scRow.status_pdf_filename)))) {
          targetFile = sanitizePdfFilename(scRow.status_pdf_filename);
        }
      } catch {}
    }

    if (wantScreenshot && (!targetFile || !fs.existsSync(path.join(storageDir, targetFile))) && (appNo || sicilNo)) {
      const allFiles = fs.readdirSync(storageDir);
      const foundSc = allFiles.find(
        (f) =>
          f.toUpperCase().includes('_STATUS_A4.PDF') &&
          ((appNo && f.includes(appNo)) || (sicilNo && f.startsWith(`${sicilNo}_`)))
      );
      if (foundSc) {
        targetFile = foundSc;
      }
    }

    if (!wantScreenshot && (!targetFile || !fs.existsSync(path.join(storageDir, targetFile))) && (appNo || sicilNo)) {
      try {
        const db = getDb();
        let row: any = null;
        if (appNo) {
          row = db
            .prepare('SELECT pdf_filename FROM gosuslugi_submissions WHERE application_no = ? AND pdf_filename != "" LIMIT 1')
            .get(appNo);
        }
        if (!row && sicilNo) {
          row = db
            .prepare('SELECT pdf_filename FROM gosuslugi_submissions WHERE sicil_no = ? AND pdf_filename != "" ORDER BY id DESC LIMIT 1')
            .get(sicilNo);
        }
        if (row?.pdf_filename) {
          targetFile = sanitizePdfFilename(row.pdf_filename);
        }
      } catch {
        // Ignore DB lookup fallback errors
      }
    }

    // If still not found by exact filename, try prefix match by appNo or sicilNo in directory
    if (!wantScreenshot && (!targetFile || !fs.existsSync(path.join(storageDir, targetFile))) && (appNo || sicilNo)) {
      const allFiles = fs.readdirSync(storageDir);
      const found = allFiles.find(
        (f) =>
          f.toLowerCase().endsWith('.pdf') &&
          !f.toUpperCase().includes('_STATUS_A4.PDF') &&
          ((appNo && f.includes(appNo)) || (sicilNo && f.startsWith(`${sicilNo}_`)))
      );
      if (found) {
        targetFile = found;
      }
    }

    if (wantScreenshot && (!targetFile || !fs.existsSync(path.join(storageDir, targetFile)))) {
      try {
        const db = getDb();
        let subRow: any = null;
        if (appNo) {
          subRow = db
            .prepare('SELECT * FROM gosuslugi_submissions WHERE application_no = ? LIMIT 1')
            .get(appNo);
        }
        if (!subRow && sicilNo) {
          subRow = db
            .prepare('SELECT * FROM gosuslugi_submissions WHERE sicil_no = ? ORDER BY id DESC LIMIT 1')
            .get(sicilNo);
        }
        const dispAppNo = String(subRow?.application_no || appNo || '—');
        const dispSicil = String(subRow?.sicil_no || sicilNo || '—');
        const dispName = String(subRow?.worker_name || '—');
        const dispCitizenship = String(subRow?.citizenship || '—');
        const dispStatus = String(subRow?.gosuslugi_status || '—');
        const dispDetail = String(subRow?.status_detail || 'Уведомления о трудовой деятельности иностранцев');
        const dispSubAt = String(subRow?.submitted_at || '—');
        const dispChkAt = String(subRow?.checked_at || subRow?.updated_at || '—');
        const receiptFile = String(subRow?.pdf_filename || '').trim();
        const isOk = /оказан/i.test(dispStatus);
        const isErr = /ошибк|отказан/i.test(dispStatus);
        const badgeBg = isOk ? '#dcfce7' : isErr ? '#ffe4e6' : '#e0f2fe';
        const badgeText = isOk ? '#166534' : isErr ? '#9f1239' : '#075985';
        const badgeBorder = isOk ? '#86efac' : isErr ? '#fda4af' : '#7dd3fc';

        const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Статус заявления № ${dispAppNo} — Госуслуги ВКС</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
    .toolbar { max-width: 760px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid transparent; }
    .btn-primary { background: #0d6efd; color: #fff; }
    .btn-secondary { background: #fff; color: #1e293b; border-color: #cbd5e1; }
    .sheet { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 14px; border: 1px solid #e2e8f0; padding: 32px 36px; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06); }
    .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 20px; }
    .logo .gos { color: #0066b3; }
    .logo .uslugi { color: #ee2f53; }
    .title { font-size: 20px; font-weight: 700; margin: 0 0 6px; color: #0f172a; }
    .app-no { font-size: 15px; color: #64748b; font-weight: 600; margin-bottom: 20px; }
    .status-box { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 16px 20px; border-radius: 12px; background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeText}; margin-bottom: 24px; }
    .status-label { font-size: 17px; font-weight: 700; }
    .status-date { font-size: 13px; opacity: 0.9; font-weight: 600; }
    .grid { display: grid; grid-template-columns: 200px 1fr; row-gap: 12px; column-gap: 16px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 14px; }
    .lbl { color: #64748b; font-weight: 500; }
    .val { color: #0f172a; font-weight: 600; word-break: break-word; }
    .note { margin-top: 24px; padding: 12px 16px; border-radius: 8px; background: #f8fafc; border: 1px dashed #cbd5e1; font-size: 12px; color: #475569; line-height: 1.5; }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none !important; }
      .sheet { box-shadow: none; border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="window.print()">🖨️ A4 Olarak Yazdır / PDF Kaydet</button>
      <a class="btn btn-secondary" href="https://lk.gosuslugi.ru/orders?q=${encodeURIComponent(dispAppNo)}" target="_blank" rel="noreferrer">🔗 Gosuslugi Portalında Aç (№ ${dispAppNo})</a>
      ${receiptFile ? `<a class="btn btn-secondary" href="/api/gosuslugi/pdf?filename=${encodeURIComponent(receiptFile)}">📄 Başvuru Makbuzu PDF Aç</a>` : ''}
    </div>
  </div>
  <div class="sheet">
    <div class="logo"><span class="gos">гос</span><span class="uslugi">услуги</span> <span style="font-size:13px;font-weight:600;color:#64748b;margin-left:8px;">Pondera HR — Статус заявления ЕПГУ (A4)</span></div>
    <h1 class="title">Уведомления о трудовой деятельности иностранцев</h1>
    <div class="app-no">Заявление № ${dispAppNo}</div>
    <div class="status-box">
      <div class="status-label">${dispStatus}</div>
      <div class="status-date">Дата ответа / проверки: ${dispChkAt}</div>
    </div>
    <div class="grid">
      <div class="lbl">Табельный номер (Sicil No):</div>
      <div class="val">${dispSicil}</div>
      <div class="lbl">Гражданин (ФИО):</div>
      <div class="val">${dispName}</div>
      <div class="lbl">Гражданство:</div>
      <div class="val">${dispCitizenship}</div>
      <div class="lbl">Номер заявления ЕПГУ:</div>
      <div class="val">№ ${dispAppNo}</div>
      <div class="lbl">Дата отправки (Gön):</div>
      <div class="val">${dispSubAt}</div>
      <div class="lbl">Дата статуса / ответа (Cvp):</div>
      <div class="val">${dispChkAt}</div>
      <div class="lbl">Детали из ленты Госуслуг:</div>
      <div class="val">${dispDetail}</div>
    </div>
    <div class="note">
      ℹ️ <b>Bilgi:</b> Bu kart, Gosuslugi (ЕПГУ) API / sipariş akışından alınan doğrulanmış statü kaydını gösterir. Tarayıcıdan doğrudan kırpılmış ekran görüntüsü (<code>_STATUS_A4.pdf</code>) almak için «Tek Tek Statü Ara» penceresinde <b>«Statülerin ekran görüntüsünü (A4) kaydet»</b> seçeneği işaretli olarak sorgulama çalıştırıldığında orijinal ekran görüntüsü PDF'i otomatik olarak bu bağlantıya yüklenir.
    </div>
  </div>
</body>
</html>`;
        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      } catch {}
    }

    if (!targetFile) {
      return NextResponse.json({ success: false, message: 'PDF dosya adı belirtilmedi.' }, { status: 400 });
    }

    const fullPath = path.join(storageDir, targetFile);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json(
        { success: false, message: 'PDF dosyası merkezi sunucuda henüz bulunamadı.' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(fullPath);
    const encodedName = encodeURIComponent(targetFile);
    const disposition = forceDownload ? 'attachment' : 'inline';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'PDF indirilemedi.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawFilename = String(body?.filename || '').trim();
    const pdfBase64 = String(body?.pdf_base64 || '').trim();
    const applicationNo = String(body?.application_no || '').trim();
    const sicilNo = String(body?.sicil_no || '').trim();
    const incomingStatus = String(body?.gosuslugi_status || '').trim();
    const isScreenshot = Boolean(body?.is_screenshot) || rawFilename.toUpperCase().includes('_STATUS_A4');

    if (!rawFilename || !pdfBase64) {
      return NextResponse.json(
        { success: false, message: 'filename ve pdf_base64 zorunludur.' },
        { status: 400 }
      );
    }

    const safeFilename = sanitizePdfFilename(rawFilename);
    const storageDir = getPdfStorageDir();
    const fullPath = path.join(storageDir, safeFilename);

    const base64Clean = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    // Enforce reasonable max size (15 MB per PDF)
    if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz PDF dosya boyutu.' },
        { status: 400 }
      );
    }

    fs.writeFileSync(fullPath, buffer);

    try {
      const db = getDb();
      try {
        db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN status_pdf_filename TEXT DEFAULT '';`);
      } catch {}
      const nowStr = getMoscowNowIso();
      const isFinalOrAdvancedStatus = ['Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению'].includes(incomingStatus);

      let isArchivedApp = false;
      if (applicationNo) {
        try {
          const archRow = db
            .prepare('SELECT id FROM gosuslugi_refused_archive WHERE application_no = ? LIMIT 1')
            .get(applicationNo);
          const activeRow = db
            .prepare('SELECT id FROM gosuslugi_submissions WHERE application_no = ? LIMIT 1')
            .get(applicationNo);
          if (archRow && !activeRow) isArchivedApp = true;
        } catch {}
      }

      if (!isArchivedApp) {
        if (applicationNo) {
          db.prepare(
            `UPDATE gosuslugi_submissions
             SET pdf_filename = CASE
                   WHEN ? = 1 AND pdf_filename IS NOT NULL AND pdf_filename != '' AND pdf_filename NOT LIKE '%_STATUS_A4%' THEN pdf_filename
                   ELSE ?
                 END,
                 status_pdf_filename = CASE
                   WHEN ? = 1 THEN ?
                   ELSE COALESCE(status_pdf_filename, '')
                 END,
                 gosuslugi_status = CASE
                   WHEN ? != '' THEN ?
                   WHEN gosuslugi_status LIKE '%PDF не скачан%' THEN 'Заявление зарегистрировано'
                   ELSE gosuslugi_status
                 END,
                 checked_at = CASE WHEN ? != '' AND (checked_at IS NULL OR checked_at = '') THEN ? ELSE checked_at END,
                 updated_at = ?
             WHERE application_no = ?`
          ).run(
            isScreenshot ? 1 : 0,
            safeFilename,
            isScreenshot ? 1 : 0,
            safeFilename,
            isFinalOrAdvancedStatus ? incomingStatus : '',
            incomingStatus,
            isFinalOrAdvancedStatus ? nowStr : '',
            nowStr,
            nowStr,
            applicationNo
          );
        }
        if (sicilNo) {
          db.prepare(
            `UPDATE gosuslugi_submissions
             SET pdf_filename = CASE
                   WHEN ? = 1 AND pdf_filename IS NOT NULL AND pdf_filename != '' AND pdf_filename NOT LIKE '%_STATUS_A4%' THEN pdf_filename
                   ELSE ?
                 END,
                 status_pdf_filename = CASE
                   WHEN ? = 1 THEN ?
                   ELSE COALESCE(status_pdf_filename, '')
                 END,
                 gosuslugi_status = CASE
                   WHEN ? != '' THEN ?
                   WHEN gosuslugi_status LIKE '%PDF не скачан%' THEN 'Заявление зарегистрировано'
                   ELSE gosuslugi_status
                 END,
                 checked_at = CASE WHEN ? != '' AND (checked_at IS NULL OR checked_at = '') THEN ? ELSE checked_at END,
                 updated_at = ?
             WHERE sicil_no = ?
               AND (application_no = '' OR application_no = ?)
               AND NOT (? != '' AND CAST(? AS INTEGER) < 8300000000 AND submitted_at >= '2026-10-21 21:00:00')`
          ).run(
            isScreenshot ? 1 : 0,
            safeFilename,
            isScreenshot ? 1 : 0,
            safeFilename,
            isFinalOrAdvancedStatus ? incomingStatus : '',
            incomingStatus,
            isFinalOrAdvancedStatus ? nowStr : '',
            nowStr,
            nowStr,
            sicilNo,
            applicationNo,
            applicationNo,
            applicationNo
          );
        }
      }
    } catch {
      // Non-fatal DB update error
    }

    return NextResponse.json({
      success: true,
      filename: safeFilename,
      sizeBytes: buffer.length,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'PDF merkezi sunucuya kaydedilemedi.' },
      { status: 500 }
    );
  }
}
