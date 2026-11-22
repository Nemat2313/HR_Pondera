import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getInnSnilsScreenshotDir } from '@/lib/innSnilsManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuf, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function sanitizeDownloadName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!cleaned) return fallback;
  const fallbackExt = fallback.toLowerCase().endsWith('.jpg') ? '.jpg' : '.png';
  if (/\.(png|jpe?g)$/i.test(cleaned)) {
    return cleaned.replace(/\.(png|jpe?g)$/i, fallbackExt);
  }
  return `${cleaned}${fallbackExt}`;
}

function isAllowedImageFile(file: string): boolean {
  return /\.(png|jpe?g)$/i.test(file);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const file = path.basename(String(searchParams.get('file') || '').trim());
    const download = searchParams.get('download') === '1';
    const customName = String(searchParams.get('name') || '').trim();
    if (!file || !isAllowedImageFile(file)) {
      return NextResponse.json({ success: false, message: 'Geçersiz dosya adı.' }, { status: 400 });
    }
    const fullPath = path.join(getInnSnilsScreenshotDir(), file);
    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ success: false, message: 'Ekran görüntüsü bulunamadı.' }, { status: 404 });
    }
    const bytes = fs.readFileSync(fullPath);
    const isJpeg = (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) || /\.jpe?g$/i.test(file);
    const headers: Record<string, string> = {
      'Content-Type': isJpeg ? 'image/jpeg' : 'image/png',
      'Cache-Control': 'public, max-age=3600',
    };
    if (download) {
      const outName = sanitizeDownloadName(customName, file);
      headers['Content-Disposition'] = `attachment; filename="${outName}"`;
    }
    return new NextResponse(bytes, { status: 200, headers });
  } catch {
    return NextResponse.json({ success: false, message: 'Dosya okunamadı.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const list: Array<{ file: string; name?: string }> = Array.isArray(body?.items) ? body.items : [];
    const dir = getInnSnilsScreenshotDir();
    const entries: Array<{ name: string; data: Buffer }> = [];
    const usedNames = new Set<string>();

    for (const item of list.slice(0, 500)) {
      const safeFile = path.basename(String(item?.file || '').trim());
      if (!safeFile || !isAllowedImageFile(safeFile)) continue;
      const fullPath = path.join(dir, safeFile);
      if (!fs.existsSync(fullPath)) continue;
      let zipName = sanitizeDownloadName(String(item?.name || ''), safeFile);
      if (usedNames.has(zipName)) {
        zipName = zipName.replace(/\.(png|jpe?g)$/i, `_${entries.length + 1}.$1`);
      }
      usedNames.add(zipName);
      entries.push({ name: zipName, data: fs.readFileSync(fullPath) });
    }

    if (entries.length === 0) {
      return NextResponse.json({ success: false, message: 'İndirilecek ekran görüntüsü bulunamadı.' }, { status: 404 });
    }

    const zipBuf = buildZipBuffer(entries);
    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Pondera_INN_SNILS_Skanlar_${today}.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: 'ZIP oluşturulamadı.' }, { status: 500 });
  }
}
