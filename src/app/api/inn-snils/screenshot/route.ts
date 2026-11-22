import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInnSnilsScreenshotDir } from '@/lib/innSnilsManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const file = path.basename(String(searchParams.get('file') || '').trim());
    if (!file || !file.endsWith('.png')) {
      return NextResponse.json({ success: false, message: 'Geçersiz dosya adı.' }, { status: 400 });
    }
    const fullPath = path.join(getInnSnilsScreenshotDir(), file);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ success: false, message: 'Ekran görüntüsü bulunamadı.' }, { status: 404 });
    }
    const bytes = fs.readFileSync(fullPath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Dosya okunamadı.' }, { status: 500 });
  }
}
