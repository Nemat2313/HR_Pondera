import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  createPreActionBackup,
  getPreActionBackupDir,
  listPreActionBackups,
  restorePreActionBackup,
} from '@/lib/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const downloadId = searchParams.get('download') || '';

    if (downloadId) {
      const sessionUser = getSessionUserFromRequest(request);
      if (sessionUser && sessionUser.role !== 'admin') {
        return NextResponse.json(
          { success: false, message: 'Yedek indirme işlemi için yönetici (Admin) yetkisi gereklidir.' },
          { status: 403 }
        );
      }

      const safeFile = path.basename(downloadId);
      const dir = getPreActionBackupDir();
      const filePath = path.join(dir, safeFile);

      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { success: false, message: 'İndirilecek yedek dosyası bulunamadı.' },
          { status: 404 }
        );
      }

      const buffer = fs.readFileSync(filePath);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': `attachment; filename="${safeFile}"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    const backups = listPreActionBackups();
    return NextResponse.json({
      success: true,
      backups,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: `Yedek listesi alınamadı: ${String(err?.message || '')}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Veritabanı yedekleme / geri yükleme işlemi için yönetici (Admin) yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const action = String(body?.action || 'restore').trim();

    if (action === 'create_manual') {
      const labelTr = String(body?.labelTr || 'Manuel İşlem Öncesi Koruma Yedeği').trim();
      const labelRu = String(body?.labelRu || 'Ручная защитная копия перед операцией').trim();
      const created = createPreActionBackup('manual', labelTr, labelRu);
      if (!created) {
        return NextResponse.json(
          { success: false, message: 'Koruma yedeği oluşturulamadı.' },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        message: `İşlem öncesi koruma yedeği başarıyla alındı (${created.sizeMB} MB).`,
        backup: created,
        backups: listPreActionBackups(),
      });
    }

    const backupId = body?.backupId ? String(body.backupId).trim() : undefined;
    const res = restorePreActionBackup(backupId);

    if (!res.success) {
      return NextResponse.json(
        { success: false, message: res.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: res.message,
      restoredMeta: res.restoredMeta || null,
      backups: listPreActionBackups(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: `Geri yükleme sırasında bir hata oluştu: ${String(err?.message || '')}` },
      { status: 500 }
    );
  }
}
