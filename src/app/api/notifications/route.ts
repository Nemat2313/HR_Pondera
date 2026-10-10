import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const today = '2026-10-02'; // Reference dataset date

    // 1. Visas expiring soon (within next 45 days)
    const visaExpiring = db
      .prepare(`
        SELECT sira_no, sicil_no, ad_soyad, region, proje_adi, vize_no, vize_bitis_tarihi
        FROM personnel 
        WHERE guncel_durum IN ('Mevcut', 'Is Gezisi', 'Mazeret Izni', 'Suresiz izin', 'Suresiz Izin', 'Ucretsiz Izin', 'Yillik Izin') 
          AND vize_bitis_tarihi != '' 
          AND vize_bitis_tarihi >= ? 
          AND vize_bitis_tarihi <= '2026-11-30'
        ORDER BY vize_bitis_tarihi ASC
        LIMIT 5
      `)
      .all(today);

    // 2. Propusk expiring soon
    const propuskExpiring = db
      .prepare(`
        SELECT sira_no, sicil_no, ad_soyad, region, proje_adi, propusk_no, propusk_bitis_tarihi
        FROM personnel 
        WHERE guncel_durum IN ('Mevcut', 'Is Gezisi', 'Mazeret Izni', 'Suresiz izin', 'Suresiz Izin', 'Ucretsiz Izin', 'Yillik Izin') 
          AND propusk_bitis_tarihi != '' 
          AND propusk_bitis_tarihi >= ? 
          AND propusk_bitis_tarihi <= '2026-11-30'
        ORDER BY propusk_bitis_tarihi ASC
        LIMIT 5
      `)
      .all(today);

    // 3. Passports expiring soon (within 6 months)
    const passportExpiring = db
      .prepare(`
        SELECT sira_no, sicil_no, ad_soyad, region, proje_adi, pasaport_no, pasaport_gecerlilik
        FROM personnel 
        WHERE guncel_durum IN ('Mevcut', 'Is Gezisi', 'Mazeret Izni', 'Suresiz izin', 'Suresiz Izin', 'Ucretsiz Izin', 'Yillik Izin') 
          AND pasaport_gecerlilik != '' 
          AND pasaport_gecerlilik >= ? 
          AND pasaport_gecerlilik <= '2027-04-01'
        ORDER BY pasaport_gecerlilik ASC
        LIMIT 5
      `)
      .all(today);

    const alerts = [
      ...visaExpiring.map((v: any) => ({
        type: 'vize',
        title: 'Vize Bitiş Uyarısı',
        name: v.ad_soyad,
        detail: `${v.region} / ${v.proje_adi} - Bitiş: ${v.vize_bitis_tarihi}`,
        date: v.vize_bitis_tarihi,
        badge: 'Acil',
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
