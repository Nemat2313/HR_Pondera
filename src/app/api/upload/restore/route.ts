import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { resetDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    const dbGzPath = path.join(process.cwd(), 'pondera_hr.db.gz');

    if (!fs.existsSync(dbGzPath)) {
      return NextResponse.json(
        { success: false, message: 'Yedek ana veritabanı arşivi bulunamadı.' },
        { status: 404 }
      );
    }

    const compressed = fs.readFileSync(dbGzPath);
    const decompressed = zlib.gunzipSync(compressed);
    fs.writeFileSync(dbPath, decompressed);

    resetDb();

    return NextResponse.json({
      success: true,
      message: '3.616 personellik ana şirket veritabanı başarıyla geri yüklendi.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: `Geri yükleme sırasında bir hata oluştu: ${String(err?.message || '')}` },
      { status: 500 }
    );
  }
}
