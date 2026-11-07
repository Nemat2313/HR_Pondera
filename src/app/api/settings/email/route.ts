import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  getSmtpConfig,
  saveSmtpConfig,
  getEmailReportRules,
  saveEmailReportRules,
  getEmailLogs,
  sendReportEmailById,
  checkAndImportZupAutoFolder,
  getReleaseSummaryDraft,
  saveReleaseSummaryDraft,
  sendReleaseSummaryEmail,
  DEFAULT_RELEASE_SUMMARY_DRAFT,
} from '@/lib/emailNotifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const smtp = getSmtpConfig(db);
    const rules = getEmailReportRules(db);
    const logs = getEmailLogs(20, db);
    const releaseDraft = getReleaseSummaryDraft(db);

    return NextResponse.json({
      success: true,
      smtp: {
        ...smtp,
        hasPassword: Boolean(smtp.pass && smtp.pass.length > 0),
        pass: smtp.pass ? '••••••••' : '',
      },
      rules,
      logs,
      releaseDraft,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'E-posta ayarları okunamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için Sistem Yöneticisi (Admin) yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = await request.json();
    const action = body?.action;

    if (action === 'save_smtp') {
      const saved = saveSmtpConfig(body.smtp || {}, db);
      return NextResponse.json({
        success: true,
        message: 'SMTP mail sunucu ve 1C ZUP otomasyon bağlantı ayarları kaydedildi.',
        smtp: {
          ...saved,
          hasPassword: Boolean(saved.pass && saved.pass.length > 0),
          pass: saved.pass ? '••••••••' : '',
        },
      });
    }

    if (action === 'save_rules') {
      const savedRules = saveEmailReportRules(body.rules || [], db);
      return NextResponse.json({
        success: true,
        message: 'Rapor bazlı To / CC alıcı listeleri ve gönderim saatleri güncellendi.',
        rules: savedRules,
      });
    }

    if (action === 'send_report') {
      const reportId = body.reportId || 'test_connection';
      const overrideTo = Array.isArray(body.to) ? body.to : undefined;
      const overrideCc = Array.isArray(body.cc) ? body.cc : undefined;

      const sendRes = await sendReportEmailById(reportId, {
        to: overrideTo,
        cc: overrideCc,
      });

      return NextResponse.json({
        success: sendRes.ok,
        status: sendRes.status,
        message: sendRes.message,
        rules: getEmailReportRules(db),
        logs: getEmailLogs(20, db),
      });
    }

    if (action === 'save_release_draft') {
      const savedDraft = saveReleaseSummaryDraft(body.releaseDraft || {}, db);
      return NextResponse.json({
        success: true,
        message: 'Yeni sürüm özeti e-posta taslağı kaydedildi.',
        releaseDraft: savedDraft,
      });
    }

    if (action === 'reset_release_draft') {
      const resetDraft = saveReleaseSummaryDraft(DEFAULT_RELEASE_SUMMARY_DRAFT, db);
      return NextResponse.json({
        success: true,
        message: 'Varsayılan Personel Müdürü sürüm özeti şablonu yüklendi.',
        releaseDraft: resetDraft,
      });
    }

    if (action === 'send_release_summary') {
      const isPreviewTest = Boolean(body.isPreviewTest);
      const overrideTo = Array.isArray(body.overrideTo) ? body.overrideTo : undefined;
      const overrideCc = Array.isArray(body.overrideCc) ? body.overrideCc : undefined;
      const sendRes = await sendReleaseSummaryEmail({
        draft: body.releaseDraft,
        overrideTo,
        overrideCc,
        isPreviewTest,
      });
      return NextResponse.json({
        success: sendRes.ok,
        status: sendRes.status,
        message: sendRes.message,
        releaseDraft: sendRes.draft,
        logs: getEmailLogs(20, db),
      });
    }

    if (action === 'check_zup_folder') {
      const syncRes = checkAndImportZupAutoFolder(db);
      return NextResponse.json({
        success: true,
        imported: syncRes.imported,
        message: syncRes.imported
          ? `1C ZUP otomatik klasöründen yeni dosya yüklendi: ${syncRes.fileName} (${syncRes.count} kayıt)`
          : 'Otomatik klasörde henüz yeni bir 1C ZUP Excel dosyası bulunmadı.',
      });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'E-posta ayarları kaydedilirken hata oluştu.' },
      { status: 500 }
    );
  }
}
