import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  EBA_REPORT_OPTIONS,
  getEbaSyncConfig,
  getEbaSyncStatus,
  saveEbaSyncConfig,
  startEbaAutoSyncBackground,
} from '@/lib/ebaSyncManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = getEbaSyncConfig();
    const status = getEbaSyncStatus();
    return NextResponse.json({
      success: true,
      config: {
        loginUrl: cfg.loginUrl,
        username: cfg.username,
        hasPassword: Boolean(cfg.password),
        password: cfg.password ? '••••••••' : '',
        reportBtnId: cfg.reportBtnId,
        autoSyncEnabled: cfg.autoSyncEnabled,
        autoSyncTimeMsk: cfg.autoSyncTimeMsk,
      },
      status,
      reportOptions: EBA_REPORT_OPTIONS,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'eBA senkronizasyon durumu okunamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Gözlemci (Viewer) rolünün bu işlem için yetkisi yoktur.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = String(body?.action || '').trim();

    if (action === 'save_config') {
      const saved = saveEbaSyncConfig(body?.config || {});
      return NextResponse.json({
        success: true,
        message: 'eBA bağlantı ve otomatik senkronizasyon ayarları kaydedildi.',
        config: {
          loginUrl: saved.loginUrl,
          username: saved.username,
          hasPassword: Boolean(saved.password),
          password: saved.password ? '••••••••' : '',
          reportBtnId: saved.reportBtnId,
          autoSyncEnabled: saved.autoSyncEnabled,
          autoSyncTimeMsk: saved.autoSyncTimeMsk,
        },
      });
    }

    if (action === 'run_sync') {
      if (body?.config) {
        saveEbaSyncConfig(body.config);
      }
      const triggeredBy = sessionUser?.name || sessionUser?.email || 'Manuel';
      const res = startEbaAutoSyncBackground(triggeredBy);
      return NextResponse.json({
        success: res.started,
        started: res.started,
        message: res.message,
        status: getEbaSyncStatus(),
      });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'eBA senkronizasyon isteği başarısız.' },
      { status: 500 }
    );
  }
}
