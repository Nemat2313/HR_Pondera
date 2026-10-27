import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    if ((!targetFile || !fs.existsSync(path.join(storageDir, targetFile))) && (appNo || sicilNo)) {
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
    if ((!targetFile || !fs.existsSync(path.join(storageDir, targetFile))) && (appNo || sicilNo)) {
      const allFiles = fs.readdirSync(storageDir);
      const found = allFiles.find(
        (f) =>
          f.toLowerCase().endsWith('.pdf') &&
          ((appNo && f.includes(appNo)) || (sicilNo && f.startsWith(`${sicilNo}_`)))
      );
      if (found) {
        targetFile = found;
      }
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
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const isFinalOrAdvancedStatus = ['Услуга оказана', 'Услуга отказана', 'Промежуточные результаты по заявлению'].includes(incomingStatus);

      let isArchivedApp = false;
      if (applicationNo) {
        try {
          const archRow = db
            .prepare('SELECT id FROM gosuslugi_refused_archive WHERE application_no = ? LIMIT 1')
            .get(applicationNo);
          if (archRow) isArchivedApp = true;
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
                 gosuslugi_status = CASE
                   WHEN ? != '' THEN ?
                   WHEN gosuslugi_status LIKE '%PDF не скачан%' THEN 'Заявление зарегистрировано'
                   ELSE gosuslugi_status
                 END,
                 checked_at = CASE WHEN ? != '' THEN ? ELSE checked_at END,
                 updated_at = ?
             WHERE application_no = ?`
          ).run(
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
             SET pdf_filename = ?,
                 gosuslugi_status = CASE
                   WHEN ? != '' THEN ?
                   WHEN gosuslugi_status LIKE '%PDF не скачан%' THEN 'Заявление зарегистрировано'
                   ELSE gosuslugi_status
                 END,
                 checked_at = CASE WHEN ? != '' THEN ? ELSE checked_at END,
                 updated_at = ?
             WHERE sicil_no = ?
               AND (application_no = '' OR application_no = ?)
               AND NOT (? != '' AND CAST(? AS INTEGER) < 8300000000 AND submitted_at >= '2026-10-21 21:00:00')
               AND (pdf_filename IS NULL OR pdf_filename = "" OR pdf_filename = ?)`
          ).run(
            safeFilename,
            isFinalOrAdvancedStatus ? incomingStatus : '',
            incomingStatus,
            isFinalOrAdvancedStatus ? nowStr : '',
            nowStr,
            nowStr,
            sicilNo,
            applicationNo,
            applicationNo,
            applicationNo,
            safeFilename
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
