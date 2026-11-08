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
