import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  deleteInvitationApplication,
  getInvitationApplicationsPayload,
  normalizeMessyDate,
  parseInvitationApplicationsExcel,
  syncApplicationsWithPersonnelAndMvd,
  upsertManualInvitationApplication,
} from '@/lib/invitationApplicationsManager';
import { rematchAllInvitationsInDb } from '@/lib/invitationManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json({ success: false, message: 'Oturum gerekli.' }, { status: 401 });
    }
    const payload = getInvitationApplicationsPayload();
    return NextResponse.json({
      success: true,
      canEdit: sessionUser.role === 'admin' || sessionUser.role === 'user',
      ...payload,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Davetiye başvuru listesi yüklenemedi.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json({ success: false, message: 'Oturum gerekli.' }, { status: 401 });
    }
    if (sessionUser.role === 'viewer' || sessionUser.role === 'idari_isler') {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için düzenleme yetkiniz yoktur.' },
        { status: 403 }
      );
    }

    const actorName = sessionUser.name || sessionUser.email || 'admin';
    const contentType = request.headers.get('content-type') || '';

    // 1. Multipart Excel Upload (ПРИГЛАШЕНИЯ sheet)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, message: 'Lütfen geçerli bir Excel (.xlsx / .xls) dosyası seçin.' },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const res = parseInvitationApplicationsExcel(buffer, file.name, actorName);
      // Immediately rematch all incoming MVD PDFs against newly imported ПРИГЛАШЕНИЯ rows!
      const rematchRes = rematchAllInvitationsInDb(getDb());
      const payload = getInvitationApplicationsPayload();

      return NextResponse.json({
        success: true,
        message: `"${res.sheetName}" sayfasından ${res.importedCount} yeni, ${res.updatedCount} güncellenen başvuru aktarıldı (${rematchRes.matched}/${rematchRes.total} gelen MVD davetiyesi eşleşti).`,
        ...res,
        rematch: rematchRes,
        ...payload,
      });
    }

    // 2. JSON actions: upsert_manual, delete, sync, lookup_sicil
    const body = (await request.json()) as Record<string, any>;
    const action = String(body?.action || '').trim();

    if (action === 'lookup_sicil') {
      const sicil = String(body.sicil_no || '').trim();
      if (!sicil) {
        return NextResponse.json({ success: false, message: 'Sicil No girin.' }, { status: 400 });
      }
      const db = getDb();
      const p = db
        .prepare(
          'SELECT sicil_no, ad_soyad, tam_adi_kiril, uyruk, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, region, proje_adi, all_data_json FROM personnel WHERE sicil_no = ? LIMIT 1'
        )
        .get(sicil) as any;
      if (!p) {
        return NextResponse.json({ success: false, message: 'Bu sicil numarası eBA listesinde bulunamadı.' }, { status: 404 });
      }
      let rawJson: Record<string, unknown> = {};
      if (p.all_data_json) {
        try {
          rawJson = JSON.parse(p.all_data_json);
        } catch {}
      }
      const pSerie = String(rawJson['Pasaport Seri No'] || '').trim();
      const pNo = String(p.pasaport_no || '').trim();
      const fullPass = pSerie && !pNo.startsWith(pSerie) ? `${pSerie}${pNo}` : pNo;

      return NextResponse.json({
        success: true,
        employee: {
          sicil_no: p.sicil_no,
          fio_latin: p.ad_soyad || '',
          fio_kiril: p.tam_adi_kiril || p.ad_soyad || '',
          citizenship: p.uyruk || '',
          gender: String(p.cinsiyet || '').toLowerCase().includes('kadin') ? 'женский' : 'мужской',
          birth_date: normalizeMessyDate(p.dogum_tarihi).display,
          passport_no: fullPass,
          passport_issue_date: normalizeMessyDate(rawJson['Pasaport Düzenleme Tarihi']).display,
          passport_expiry_date: normalizeMessyDate(p.pasaport_gecerlilik).display,
          destination_city: p.proje_adi || p.region || '',
        },
      });
    }

    if (action === 'upsert_manual') {
      upsertManualInvitationApplication(
        {
          id: body.id ? Number(body.id) : undefined,
          sicil_no: body.sicil_no,
          fio_kiril: body.fio_kiril,
          fio_latin: body.fio_latin,
          opis_no: body.opis_no,
          app_date: body.app_date,
          entry_from: body.entry_from,
          visa_end: body.visa_end,
          visa_multiplicity: body.visa_multiplicity,
          passport_no: body.passport_no,
          passport_issue_date: body.passport_issue_date,
          passport_expiry_date: body.passport_expiry_date,
          birth_date: body.birth_date,
          gender: body.gender,
          citizenship: body.citizenship,
          consulate_city: body.consulate_city,
          destination_city: body.destination_city,
          ig_category: body.ig_category,
          comments: body.comments,
        },
        actorName
      );
      rematchAllInvitationsInDb(getDb());
      const payload = getInvitationApplicationsPayload();
      return NextResponse.json({
        success: true,
        message: body.id ? 'Davetiye başvurusu güncellendi.' : 'Yeni davetiye başvurusu eklendi ve gelen davetiyelerle eşleştirildi.',
        ...payload,
      });
    }

    if (action === 'delete') {
      const id = Number(body.id);
      if (!id) {
        return NextResponse.json({ success: false, message: 'Geçersiz kayıt ID.' }, { status: 400 });
      }
      deleteInvitationApplication(id);
      const payload = getInvitationApplicationsPayload();
      return NextResponse.json({
        success: true,
        message: 'Başvuru kaydı silindi.',
        ...payload,
      });
    }

    if (action === 'sync') {
      const syncRes = syncApplicationsWithPersonnelAndMvd(getDb());
      const rematchRes = rematchAllInvitationsInDb(getDb());
      const payload = getInvitationApplicationsPayload();
      return NextResponse.json({
        success: true,
        message: `Eşleştirme tamamlandı (${syncRes.enrichedSicilCount} sicil tamamlandı, ${rematchRes.matched}/${rematchRes.total} gelen MVD davetiyesi bağlandı).`,
        ...payload,
      });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'İşlem başarısız oldu.';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
