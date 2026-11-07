import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  getVksQuarterOverview,
  setVks15MinNotificationEnabled,
  archiveActiveQuarterAndAdvance,
  parseQuarterCodeInfo,
  addVksQuarter,
  switchActiveVksQuarter,
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
    if (sessionUser && (sessionUser.role === 'viewer' || sessionUser.role === 'idari_isler')) {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için yetkiniz bulunmuyor.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = String(body?.action || '').trim();
    const db = getDb();
    const actor = sessionUser?.email || sessionUser?.name || 'admin';

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

    if (action === 'add_quarter') {
      const year = body?.year ? Number(body.year) : undefined;
      const quarter = body?.quarter ? Number(body.quarter) : undefined;
      const quarterCode = body?.quarterCode ? String(body.quarterCode).trim() : undefined;
      const periodStart = body?.periodStart ? String(body.periodStart).trim() : undefined;
      const periodEnd = body?.periodEnd ? String(body.periodEnd).trim() : undefined;
      const makeActive = Boolean(body?.makeActive);

      const { quarterCode: addedCode, overview, alreadyExisted } = addVksQuarter(
        db,
        { year, quarter, quarterCode, periodStart, periodEnd, makeActive },
        actor
      );
      const qInfo = parseQuarterCodeInfo(addedCode);

      return NextResponse.json({
        success: true,
        quarterCode: addedCode,
        alreadyExisted,
        overview,
        message: makeActive
          ? `${qInfo.quarterLabelTr} eklendi ve aktif çalışma dönemi olarak ayarlandı.`
          : alreadyExisted
          ? `${qInfo.quarterLabelTr} dönem bilgileri güncellendi.`
          : `${qInfo.quarterLabelTr} dönem listesine başarıyla eklendi.`,
      });
    }

    if (action === 'activate_quarter') {
      if (sessionUser && sessionUser.role !== 'admin') {
        return NextResponse.json(
          { success: false, message: 'Aktif çalışma dönemini yalnızca Sistem Yöneticisi (Admin) değiştirebilir.' },
          { status: 403 }
        );
      }
      const targetQuarter = String(body?.quarterCode || '').trim();
      if (!targetQuarter) {
        return NextResponse.json(
          { success: false, message: 'Aktif edilecek çeyrek kodu belirtilmedi.' },
          { status: 400 }
        );
      }
      const { archived, overview } = switchActiveVksQuarter(db, targetQuarter, actor);
      return NextResponse.json({
        success: true,
        archived,
        overview,
        message: archived
          ? `${archived.quarter_label} arşivlendi ve aktif çalışma dönemi ${overview.activeLabelTr} olarak ayarlandı.`
          : `Aktif çalışma dönemi ${overview.activeLabelTr} olarak ayarlandı.`,
      });
    }

    if (action === 'archive_and_advance') {
      if (sessionUser && sessionUser.role !== 'admin') {
        return NextResponse.json(
          { success: false, message: 'Çeyrek arşivleme işlemini yalnızca Sistem Yöneticisi (Admin) yapabilir.' },
          { status: 403 }
        );
      }
      const nextQuarter = body?.nextQuarter ? String(body.nextQuarter).trim() : undefined;
      const { archived, overview } = archiveActiveQuarterAndAdvance(db, nextQuarter, actor);
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
      addVksQuarter(db, { quarterCode: info.quarterCode, periodStart: pStart, periodEnd: pEnd }, actor);
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
