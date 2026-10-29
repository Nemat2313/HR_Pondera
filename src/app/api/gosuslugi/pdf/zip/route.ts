import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPdfStorageDir(): string {
  const dir = path.join(process.cwd(), 'data', 'gosuslugi_pdfs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

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

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Builds a valid ZIP buffer using STORE (method 0) and UTF-8 filename flag (0x0800).
 * Since PDF files are already internally compressed with FlateDecode, STORE is instantaneous
 * and avoids double-compression CPU overhead while keeping full compatibility with Windows & EBA.
 */
function buildZipArchive(files: Array<{ name: string; data: Buffer; mtime: Date }>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = file.data;
    const fileCrc = crc32(dataBuf);
    const { dosTime, dosDate } = toDosDateTime(file.mtime);

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (Bit 11 = UTF-8 filename)
    localHeader.writeUInt16LE(0, 8); // Compression method: 0 (STORE)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // Compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuf.copy(localHeader, 30);

    localChunks.push(localHeader, dataBuf);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8); // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(0, 10); // Compression method: 0 (STORE)
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBuf.copy(centralHeader, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBuf.length;
  }

  const centralDirSize = centralChunks.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8); // Total entries on this disk
  eocd.writeUInt16LE(files.length, 10); // Total entries in central directory
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

function collectPdfFiles(
  filterNames?: Set<string>,
  filterAppNos?: Set<string>,
  pdfType: 'receipt' | 'status' | 'all' = 'receipt'
): Array<{ name: string; data: Buffer; mtime: Date }> {
  const storageDir = getPdfStorageDir();
  if (!fs.existsSync(storageDir)) return [];

  const allEntries = fs
    .readdirSync(storageDir)
    .filter((f) => {
      if (!f.toLowerCase().endsWith('.pdf') || f.startsWith('tmp_')) return false;
      const isStatus = f.toUpperCase().includes('_STATUS_A4');
      if (pdfType === 'receipt' && isStatus) return false;
      if (pdfType === 'status' && !isStatus) return false;
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const results: Array<{ name: string; data: Buffer; mtime: Date }> = [];

  for (const fname of allEntries) {
    if ((filterNames && filterNames.size > 0) || (filterAppNos && filterAppNos.size > 0)) {
      const matchedName = filterNames && filterNames.has(fname);
      let matchedApp = false;
      if (!matchedName && filterAppNos && filterAppNos.size > 0) {
        const mApp = fname.match(/([789]\d{8,12})/);
        if (mApp && filterAppNos.has(mApp[1])) matchedApp = true;
      }
      if (!matchedName && !matchedApp) continue;
    }
    const fullPath = path.join(storageDir, fname);
    try {
      const st = fs.statSync(fullPath);
      if (!st.isFile() || st.size === 0) continue;
      const data = fs.readFileSync(fullPath);
      results.push({ name: fname, data, mtime: st.mtime });
    } catch {
      // Skip unreadable file
    }
  }

  return results;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countOnly = searchParams.get('countOnly') === '1';
    const rawType = (searchParams.get('type') || 'receipt').toLowerCase();
    const pdfType: 'receipt' | 'status' | 'all' =
      rawType === 'status' ? 'status' : rawType === 'all' ? 'all' : 'receipt';
    const storageDir = getPdfStorageDir();

    if (countOnly) {
      const allPdfNames = fs.existsSync(storageDir)
        ? fs.readdirSync(storageDir).filter((f) => f.toLowerCase().endsWith('.pdf') && !f.startsWith('tmp_'))
        : [];
      const receiptCount = allPdfNames.filter((f) => !f.toUpperCase().includes('_STATUS_A4')).length;
      const statusCount = allPdfNames.filter((f) => f.toUpperCase().includes('_STATUS_A4')).length;
      const count =
        pdfType === 'status' ? statusCount : pdfType === 'all' ? allPdfNames.length : receiptCount;
      return NextResponse.json({
        success: true,
        count,
        receiptCount,
        statusCount,
      });
    }

    const files = collectPdfFiles(undefined, undefined, pdfType);
    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            pdfType === 'status'
              ? 'Merkezi sunucuda henüz indirilen A4 Statü PDF dosyası bulunamadı.'
              : 'Merkezi sunucuda henüz indirilen Başvuru (Заявка) PDF dosyası bulunamadı.',
        },
        { status: 404 }
      );
    }

    const zipBuffer = buildZipArchive(files);
    const dateTag = new Date().toISOString().slice(0, 10);
    const zipFilename =
      pdfType === 'status'
        ? `Pondera_VKS_Gosuslugi_Status_PDFs_2026-3_${files.length}adet_${dateTag}.zip`
        : `Pondera_VKS_Gosuslugi_PDFs_2026-3_${files.length}adet_${dateTag}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
        'Content-Length': String(zipBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'PDF ZIP arşivi oluşturulamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawType = String(body?.type || 'receipt').toLowerCase();
    const pdfType: 'receipt' | 'status' | 'all' =
      rawType === 'status' ? 'status' : rawType === 'all' ? 'all' : 'receipt';
    const rawNames: string[] = Array.isArray(body?.filenames) ? body.filenames : [];
    const rawAppNos: string[] = Array.isArray(body?.appNos) ? body.appNos : [];

    const filterNames = new Set(
      rawNames.map((n) => path.basename(String(n || '').trim())).filter(Boolean)
    );
    const filterAppNos = new Set(
      rawAppNos.map((a) => String(a || '').trim()).filter(Boolean)
    );

    const files =
      filterNames.size > 0 || filterAppNos.size > 0
        ? collectPdfFiles(filterNames, filterAppNos, pdfType)
        : collectPdfFiles(undefined, undefined, pdfType);

    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            pdfType === 'status'
              ? 'Seçilen kriterlere uygun A4 Statü PDF dosyası bulunamadı.'
              : 'Seçilen kriterlere uygun Başvuru (Заявка) PDF dosyası bulunamadı.',
        },
        { status: 404 }
      );
    }

    const zipBuffer = buildZipArchive(files);
    const dateTag = new Date().toISOString().slice(0, 10);
    const zipFilename =
      pdfType === 'status'
        ? `Pondera_VKS_Gosuslugi_Status_PDFs_2026-3_${files.length}adet_${dateTag}.zip`
        : `Pondera_VKS_Gosuslugi_PDFs_2026-3_${files.length}adet_${dateTag}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
        'Content-Length': String(zipBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'PDF ZIP arşivi oluşturulamadı.' },
      { status: 500 }
    );
  }
}
