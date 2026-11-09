import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import {
  ensureInvitationsTables,
  getInvitationsUploadDir,
  MvdInvitationRecord,
} from '@/lib/invitationManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Standard IEEE 802.3 CRC-32 calculation for ZIP archive entries
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

function crc32Buffer(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(files: { filename: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const usedNames = new Set<string>();

  for (const file of files) {
    let safeName = path.basename(file.filename || 'invitation.pdf');
    if (usedNames.has(safeName)) {
      const ext = path.extname(safeName);
      const base = safeName.slice(0, safeName.length - ext.length);
      let idx = 2;
      while (usedNames.has(`${base}_${idx}${ext}`)) idx++;
      safeName = `${base}_${idx}${ext}`;
    }
    usedNames.add(safeName);

    const nameBuf = Buffer.from(safeName, 'utf-8');
    const dataBuf = file.data;
    const crc = crc32Buffer(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(0, 8); // method 0 (STORE)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size
    localHeader.writeUInt32LE(size, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, dataBuf);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(0, 10); // method 0 (STORE)
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const invNo = String(searchParams.get('invitation_no') || '').trim();
    const inline = searchParams.get('inline') === 'true';

    if (!invNo) {
      return NextResponse.json(
        { success: false, message: 'invitation_no parametresi gerekli.' },
        { status: 400 }
      );
    }

    const db = getDb();
    ensureInvitationsTables(db);
    const row = db
      .prepare('SELECT * FROM mvd_invitations WHERE invitation_no = ?')
      .get(invNo) as MvdInvitationRecord | undefined;

    if (!row || !row.pdf_filename) {
      return NextResponse.json(
        { success: false, message: 'Davetiye PDF kaydı bulunamadı.' },
        { status: 404 }
      );
    }

    const uploadDir = getInvitationsUploadDir();
    const filePath = path.join(uploadDir, path.basename(row.pdf_filename));

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Bu davetiye için PDF dosyası henüz sunucuya indirilmemiş. "Zoho Mail (ikbildirim) Tara" butonuna tıklayarak e-postadaki orijinal PDF ekini çekebilirsiniz.',
        },
        { status: 404 }
      );
    }

    const pdfBytes = fs.readFileSync(filePath);
    const safeFilename = path.basename(row.pdf_filename);

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeFilename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message || 'PDF indirilemedi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawNos: string[] = Array.isArray(body?.invitation_nos) ? body.invitation_nos : [];
    const invNos = Array.from(
      new Set(rawNos.map((s) => String(s || '').trim()).filter(Boolean))
    );

    if (invNos.length === 0) {
      return NextResponse.json(
        { success: false, message: 'İndirilecek davetiye seçilmedi.' },
        { status: 400 }
      );
    }

    const db = getDb();
    ensureInvitationsTables(db);
    const uploadDir = getInvitationsUploadDir();

    const placeholders = invNos.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM mvd_invitations WHERE invitation_no IN (${placeholders})`)
      .all(...invNos) as MvdInvitationRecord[];

    const filesToZip: { filename: string; data: Buffer }[] = [];
    for (const r of rows) {
      if (!r.pdf_filename) continue;
      const fp = path.join(uploadDir, path.basename(r.pdf_filename));
      if (fs.existsSync(fp)) {
        filesToZip.push({
          filename: path.basename(r.pdf_filename),
          data: fs.readFileSync(fp),
        });
      }
    }

    if (filesToZip.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Seçilen davetiyelere ait PDF dosyaları sunucuda bulunamadı. Lütfen önce "Zoho Mail (ikbildirim) Tara" butonuna basın.',
        },
        { status: 404 }
      );
    }

    const zipBuf = buildZipBuffer(filesToZip);
    const dateStr = new Date().toISOString().slice(0, 10);
    const zipFilename = `Pondera_MVD_Davetiyeler_${filesToZip.length}_Adet_${dateStr}.zip`;

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zipBuf.length),
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message || 'Toplu PDF arşivlenirken hata oluştu.' },
      { status: 500 }
    );
  }
}

