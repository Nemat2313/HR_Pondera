import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  getDocumentScansDataset,
  parseDocumentScansWorksheet,
  saveDocumentScansToDb,
} from '@/lib/documentScansServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType = headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal = headerScopeVal || searchParams.get('userScopeValue') || 'all';

    const db = getDb();
    const payload = getDocumentScansDataset(db, scopeType, scopeVal);
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || 'eBA Evrak Skan verileri yüklenirken hata oluştu.',
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
        { success: false, message: 'Gözlemci (Viewer) rolünün dosya yükleme yetkisi yoktur.' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const multiFiles = formData.getAll('files').filter((f): f is File => f instanceof File);
    const singleFile = formData.get('file');
    const files: File[] =
      multiFiles.length > 0
        ? multiFiles
        : singleFile instanceof File
        ? [singleFile]
        : [];

    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Lütfen eBA Document_Control (.xlsx / .xls) dosyasını seçin.',
        },
        { status: 400 }
      );
    }

    const rawMode = String(formData.get('mode') || 'upsert')
      .trim()
      .toLowerCase();
    const mode: 'upsert' | 'replace' = rawMode === 'replace' ? 'replace' : 'upsert';

    const now = new Date();
    const defaultDate = `${String(now.getDate()).padStart(2, '0')}.${String(
      now.getMonth() + 1
    ).padStart(2, '0')}.${now.getFullYear()}`;
    const reportDate = String(formData.get('reportDate') || '').trim() || defaultDate;

    const db = getDb();
    let totalParsedRows = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let finalDbTotal = 0;
    const fileNames: string[] = [];

    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx];
      fileNames.push(f.name);
      const buffer = Buffer.from(await f.arrayBuffer());
      const wb = XLSX.read(buffer, { type: 'buffer' });

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        const parsed = parseDocumentScansWorksheet(rawRows);
        if (parsed.records.length === 0) continue;

        // If mode === 'replace', only the very first valid sheet clears the table; subsequent files/sheets upsert into it!
        const effectiveMode: 'upsert' | 'replace' =
          mode === 'replace' && totalParsedRows === 0 ? 'replace' : 'upsert';

        const label =
          files.length > 1 ? `${files[0].name} (+${files.length - 1} dosya)` : f.name;
        const res = saveDocumentScansToDb(
          db,
          parsed.records,
          parsed.presentColIndices,
          effectiveMode,
          label,
          reportDate
        );

        totalParsedRows += parsed.records.length;
        totalInserted += res.insertedCount;
        totalUpdated += res.updatedCount;
        finalDbTotal = res.totalInDb;
      }
    }

    if (totalParsedRows === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Seçilen Excel dosyasında geçerli eBA Evrak Skan sütunları (EmployeeIds ID, Pasaport, Migrasyon Kart vb.) bulunamadı.',
        },
        { status: 400 }
      );
    }

    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType =
      headerScopeType || String(formData.get('userScopeType') || '') || 'all';
    const scopeVal =
      headerScopeVal || String(formData.get('userScopeValue') || '') || 'all';

    const dataset = getDocumentScansDataset(db, scopeType, scopeVal);

    return NextResponse.json({
      ...dataset,
      uploadSummary: {
        filesProcessed: files.length,
        rowsParsed: totalParsedRows,
        insertedCount: totalInserted,
        updatedCount: totalUpdated,
        totalInDb: finalDbTotal,
        mode,
      },
      message:
        mode === 'replace'
          ? `${totalParsedRows.toLocaleString('tr-TR')} sicil kaydı ile tüm eBA Evrak Skan listesi yenilendi.`
          : `${totalParsedRows.toLocaleString('tr-TR')} sicil kaydı işlendi (${totalInserted.toLocaleString('tr-TR')} yeni, ${totalUpdated.toLocaleString('tr-TR')} güncellendi — toplam ${finalDbTotal.toLocaleString('tr-TR')} kayıt).`,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || 'Excel dosyası işlenirken beklenmeyen bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}

