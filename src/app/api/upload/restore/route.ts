import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { resetDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Veritabanı geri yükleme işlemi için yönetici (Admin) yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    const dbGzPath = path.join(process.cwd(), 'pondera_hr.db.gz');

    if (!fs.existsSync(dbGzPath)) {
      return NextResponse.json(
        { success: false, message: 'Yedek ana veritabanı arşivi bulunamadı.' },
        { status: 404 }
      );
    }

    resetDb();

    for (const suffix of ['-wal', '-shm']) {
      const walPath = dbPath + suffix;
      if (fs.existsSync(walPath)) {
        try {
          fs.unlinkSync(walPath);
        } catch {}
      }
    }

    const compressed = fs.readFileSync(dbGzPath);
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(dbPath, decompressed);

    resetDb();

    return NextResponse.json({
      success: true,
      message: '5.313 personellik ana şirket veritabanı başarıyla geri yüklendi.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: `Geri yükleme sırasında bir hata oluştu: ${String(err?.message || '')}` },
      { status: 500 }
    );
  }
}
