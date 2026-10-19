import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    let refDate = new Date('2026-10-18');
    try {
      const freshRow = db.prepare("SELECT value FROM system_info WHERE key = 'data_freshness'").get() as { value?: string } | undefined;
      if (freshRow?.value) {
        const parts = freshRow.value.trim().split('.');
        if (parts.length === 3) {
          const parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          if (!isNaN(parsed.getTime())) {
            refDate = parsed;
          }
        }
      }
    } catch {}

    const today = refDate.toISOString().slice(0, 10);
    const visa45Limit = new Date(refDate.getTime() + 45 * 86400 * 1000).toISOString().slice(0, 10);
    const propusk30Limit = new Date(refDate.getTime() + 30 * 86400 * 1000).toISOString().slice(0, 10);
    const passport180Limit = new Date(refDate.getTime() + 180 * 86400 * 1000).toISOString().slice(0, 10);

    // 1. Visas expiring soon (within next 45 days - renewal must be filed at 30 days)
    const visaExpiring = db
      .prepare(`
        SELECT sira_no, sicil_no, ad_soyad, region, proje_adi, vize_no, vize_bitis_tarihi
        FROM personnel 
        WHERE guncel_durum IN ('Mevcut', 'Is Gezisi', 'İş Gezisi', 'Mazeret Izni', 'Mazeret İzni', 'Suresiz izin', 'Suresiz Izin', 'Süresiz İzin', 'Ucretsiz Izin', 'Ücretsiz İzin', 'Yillik Izin', 'Yıllık İzin') 
          AND vize_bitis_tarihi != '' 
          AND vize_bitis_tarihi >= ? 
          AND vize_bitis_tarihi <= ?
        ORDER BY vize_bitis_tarihi ASC
        LIMIT 8
      `)
      .all(today, visa45Limit);

    // 2. Propusk expiring soon (within next 30 days)
    const propuskExpiring = db
      .prepare(`
        SELECT sira_no, sicil_no, ad_soyad, region, proje_adi, propusk_no, propusk_bitis_tarihi
        FROM personnel 
        WHERE guncel_durum IN ('Mevcut', 'Is Gezisi', 'İş Gezisi', 'Mazeret Izni', 'Mazeret İzni', 'Suresiz izin', 'Suresiz Izin', 'Süresiz İzin', 'Ucretsiz Izin', 'Ücretsiz İzin', 'Yillik Izin', 'Yıllık İzin') 
          AND propusk_bitis_tarihi != '' 
          AND propusk_bitis_tarihi >= ? 
          AND propusk_bitis_tarihi <= ?
        ORDER BY propusk_bitis_tarihi ASC
        LIMIT 5
      `)
      .all(today, propusk30Limit);

    // 3. Passports expiring soon (within 6 months)
    const passportExpiring = db
      .prepare(`
        SELECT sira_no, sicil_no, ad_soyad, region, proje_adi, pasaport_no, pasaport_gecerlilik
        FROM personnel 
        WHERE guncel_durum IN ('Mevcut', 'Is Gezisi', 'İş Gezisi', 'Mazeret Izni', 'Mazeret İzni', 'Suresiz izin', 'Suresiz Izin', 'Süresiz İzin', 'Ucretsiz Izin', 'Ücretsiz İzin', 'Yillik Izin', 'Yıllık İzin') 
          AND pasaport_gecerlilik != '' 
          AND pasaport_gecerlilik >= ? 
          AND pasaport_gecerlilik <= ?
        ORDER BY pasaport_gecerlilik ASC
        LIMIT 5
      `)
      .all(today, passport180Limit);

    const alerts = [
      ...visaExpiring.map((v: any) => ({
        type: 'vize',
        title: 'Vize Bitiş Uyarısı (≤45 Gün)',
        name: v.ad_soyad,
        detail: `${v.region} / ${v.proje_adi} - Bitiş: ${v.vize_bitis_tarihi}`,
        date: v.vize_bitis_tarihi,
        badge: 'Acil (45g)',
      })),
      ...propuskExpiring.map((p: any) => ({
        type: 'propusk',
        title: 'Propusk Süresi Doluyor',
        name: p.ad_soyad,
        detail: `${p.region} - No: ${p.propusk_no} - Bitiş: ${p.propusk_bitis_tarihi}`,
        date: p.propusk_bitis_tarihi,
        badge: 'Önemli',
      })),
      ...passportExpiring.map((pa: any) => ({
        type: 'pasaport',
        title: 'Pasaport Geçerlilik Uyarısı',
        name: pa.ad_soyad,
        detail: `${pa.region} - No: ${pa.pasaport_no} - Bitiş: ${pa.pasaport_gecerlilik}`,
        date: pa.pasaport_gecerlilik,
        badge: 'Bilgi',
      })),
    ];

    return NextResponse.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch {
    return NextResponse.json({ success: false, alerts: [], count: 0 }, { status: 500 });
  }
}
