import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  computeZupVsRealReconciliation,
  extractZupReportDate,
  parseZupWorksheetRows,
  saveZupRecordsToDb,
} from '@/lib/zupReconciliation';
import { sendZupVsRealTelegramReport } from '@/lib/telegramNotifier';
import {
  checkAndImportZupAutoFolder,
  sendReportEmailById,
  triggerOnUploadEmailReports,
} from '@/lib/emailNotifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    checkAndImportZupAutoFolder(db);
    const data = computeZupVsRealReconciliation(db);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || '1C ZUP karşılaştırma verileri hesaplanırken hata oluştu.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Gözlemci (Viewer) rolünün işlem yetkisi yoktur.' },
        { status: 403 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      if (body?.action === 'send_telegram') {
        const tgRes = await sendZupVsRealTelegramReport(true);
        const mailRes = await sendReportEmailById('zup_vs_real');
        return NextResponse.json({
          success: tgRes.sent || mailRes.ok,
          sent: tgRes.sent,
          emailStatus: mailRes.status,
          message: tgRes.sent
            ? '1C ZUP & eBA Real fark özeti Telegram grubuna ve tanımlı e-posta alıcılarına başarıyla gönderildi.'
            : `Rapor e-posta/Telegram gönderim kuyruğuna alındı (${mailRes.message}).`,
        });
      }
      if (body?.action === 'send_email') {
        const mailRes = await sendReportEmailById('zup_vs_real');
        return NextResponse.json({
          success: mailRes.ok,
          status: mailRes.status,
          message: mailRes.message,
        });
      }
      return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const explicitDate = ((formData.get('reportDate') as string) || '').trim();

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'Lütfen 1C ZUP personel listesi (.xlsx / .xls) dosyasını seçin.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json(
        { success: false, message: 'Excel dosyasında çalışma sayfası bulunamadı.' },
        { status: 400 }
      );
    }

    const ws = wb.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    const parsedRecords = parseZupWorksheetRows(rawRows);

    if (parsedRecords.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            '1C ZUP formatında geçerli personel satırı bulunamadı (Сотрудник / Табельный номер sütunlarını kontrol edin).',
        },
        { status: 400 }
      );
    }

    const reportDate = explicitDate || extractZupReportDate(file.name, rawRows, '06.11.2026');
    const db = getDb();
    saveZupRecordsToDb(db, parsedRecords, reportDate, file.name);
    await triggerOnUploadEmailReports('zup');

    const updatedData = computeZupVsRealReconciliation(db);
    return NextResponse.json({
      ...updatedData,
      uploadedCount: parsedRecords.length,
      reportDate,
      uploadMessage: `1C ZUP Resmi Personel Listesi (${parsedRecords.length.toLocaleString('tr-TR')} kayıt - ${reportDate}) başarıyla yüklendi ve karşılaştırıldı.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || '1C ZUP dosyası işlenirken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
