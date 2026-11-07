import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  getVksQuarterOverview,
  setVks15MinNotificationEnabled,
  archiveActiveQuarterAndAdvance,
  parseQuarterCodeInfo,
} from '@/lib/vksQuarterManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const overview = getVksQuarterOverview(db);
    return NextResponse.json({
      success: true,
      overview,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || 'VKS çeyrek bilgileri alınamadı.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser || sessionUser.role === 'viewer' || sessionUser.role === 'idari_isler') {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için yetkiniz bulunmuyor.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = String(body?.action || '').trim();
    const db = getDb();

    if (action === 'toggle_15min_notifications') {
      const enabled = Boolean(body?.enabled);
      setVks15MinNotificationEnabled(db, enabled);
      const overview = getVksQuarterOverview(db);
      return NextResponse.json({
        success: true,
        notifications15MinEnabled: overview.notifications15MinEnabled,
        overview,
        message: enabled
          ? '15 dakikalık VKS Telegram & E-posta bildirimleri aktif edildi.'
          : '15 dakikalık VKS Telegram & E-posta bildirimleri durduruldu.',
      });
    }

    if (action === 'archive_and_advance') {
      if (sessionUser.role !== 'admin') {
        return NextResponse.json(
          { success: false, message: 'Çeyrek arşivleme işlemini yalnızca Sistem Yöneticisi (Admin) yapabilir.' },
          { status: 403 }
        );
      }
      const nextQuarter = body?.nextQuarter ? String(body.nextQuarter).trim() : undefined;
      const { archived, overview } = archiveActiveQuarterAndAdvance(
        db,
        nextQuarter,
        sessionUser.email || sessionUser.name || 'admin'
      );
      return NextResponse.json({
        success: true,
        archived,
        overview,
        message: `${archived.quarter_label} başarıyla arşivlendi (${archived.master_count} VKS / ${archived.sent_count} gönderim). Yeni aktif dönem: ${overview.activeLabelTr}.`,
      });
    }

    if (action === 'update_active_period') {
      const qCode = String(body?.quarterCode || '').trim();
      const info = parseQuarterCodeInfo(qCode || getVksQuarterOverview(db).activeQuarter);
      const pStart = String(body?.periodStart || info.periodStart).trim();
      const pEnd = String(body?.periodEnd || info.periodEnd).trim();
      db.prepare(`
        INSERT INTO system_info (key, value) VALUES ('vks_active_quarter', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(info.quarterCode);
      db.prepare(`
        INSERT INTO system_info (key, value) VALUES ('vks_active_period_start', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(pStart);
      db.prepare(`
        INSERT INTO system_info (key, value) VALUES ('vks_active_period_end', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(pEnd);
      const overview = getVksQuarterOverview(db);
      return NextResponse.json({
        success: true,
        overview,
      });
    }

    return NextResponse.json(
      { success: false, message: 'Geçersiz işlem (action).' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || 'VKS çeyrek işlemi sırasında hata oluştu.',
      },
      { status: 500 }
    );
  }
}

