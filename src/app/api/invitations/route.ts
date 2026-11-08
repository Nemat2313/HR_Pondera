import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import {
  ensureInvitationsTables,
  getInvitationsUploadDir,
  manuallyLinkInvitationToEmployee,
  MvdInvitationRecord,
  parseAndSaveUploadedInvitationPdf,
  rematchAllInvitationsInDb,
  sendDailyInvitationsSummaryNotification,
  syncZohoInvitationsFromImap,
} from '@/lib/invitationManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const autoSync = searchParams.get('autoSync') === 'true';

    const db = getDb();
    ensureInvitationsTables(db);

    const lastSyncRow = db
      .prepare('SELECT value FROM system_info WHERE key = ?')
      .get('invitations_last_imap_sync') as { value?: string } | undefined;

    // Auto-sync on first visit if never synced from Zoho IMAP yet or if requested
    if (autoSync || !lastSyncRow?.value) {
      try {
        syncZohoInvitationsFromImap(50, db);
      } catch {}
    }

    const rows = db
      .prepare('SELECT * FROM mvd_invitations ORDER BY id DESC')
      .all() as MvdInvitationRecord[];

    const uploadDir = getInvitationsUploadDir();
    const enriched = rows.map((r) => {
      let candidates = [];
      try {
        candidates = JSON.parse(r.candidates_json || '[]');
      } catch {}
      const hasPdfOnDisk = Boolean(
        r.pdf_filename && fs.existsSync(path.join(uploadDir, path.basename(r.pdf_filename)))
      );
      return {
        ...r,
        candidates,
        hasPdfOnDisk,
      };
    });

    const total = enriched.length;
    const matchedCount = enriched.filter((r) => Boolean(r.matched_sicil_no)).length;
    const unmatchedCount = total - matchedCount;
    const pdfSavedCount = enriched.filter((r) => r.hasPdfOnDisk).length;

    const updatedSyncRow = db
      .prepare('SELECT value FROM system_info WHERE key = ?')
      .get('invitations_last_imap_sync') as { value?: string } | undefined;

    return NextResponse.json({
      success: true,
      summary: {
        total,
        matchedCount,
        unmatchedCount,
        pdfSavedCount,
        lastSyncAt: updatedSyncRow?.value || '',
      },
      data: enriched,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message || 'Davetiye listesi okunamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'sync_imap');
    const db = getDb();
    ensureInvitationsTables(db);

    if (action === 'sync_imap') {
      const maxMessages = Number(body?.maxMessages || 80);
      const res = syncZohoInvitationsFromImap(maxMessages, db);
      return NextResponse.json(res);
    }

    if (action === 'upload_pdf') {
      const fileName = String(body?.fileName || 'Invitation.pdf');
      const pdfBase64 = String(body?.pdfBase64 || '');
      if (!pdfBase64) {
        return NextResponse.json(
          { success: false, message: 'PDF dosyası (base64) gönderilmedi.' },
          { status: 400 }
        );
      }
      const res = parseAndSaveUploadedInvitationPdf(fileName, pdfBase64, db);
      return NextResponse.json(res);
    }

    if (action === 'rematch_all') {
      const res = rematchAllInvitationsInDb(db);
      return NextResponse.json({
        success: true,
        message: `${res.total} davetiye 35.000 kişilik personel listesinde yeniden tarandı (${res.matched} sicil eşleşti).`,
        ...res,
      });
    }

    if (action === 'manual_link') {
      const invitationNo = String(body?.invitation_no || '').trim();
      const sicilNo = String(body?.sicil_no || '').trim();
      if (!invitationNo || !sicilNo) {
        return NextResponse.json(
          { success: false, message: 'Davetiye numarası ve Sicil No gereklidir.' },
          { status: 400 }
        );
      }
      const res = manuallyLinkInvitationToEmployee(invitationNo, sicilNo, db);
      return NextResponse.json(res);
    }

    if (action === 'send_daily_notification') {
      const onlyYesterday = Boolean(body?.onlyUnnotifiedOrYesterday);
      const res = await sendDailyInvitationsSummaryNotification({
        onlyUnnotifiedOrYesterday: onlyYesterday,
        dbInstance: db,
      });
      return NextResponse.json({
        success: res.ok,
        ...res,
      });
    }

    return NextResponse.json(
      { success: false, message: `Bilinmeyen işlem: ${action}` },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message || 'Davetiye işlemi başarısız.' },
      { status: 500 }
    );
  }
}
