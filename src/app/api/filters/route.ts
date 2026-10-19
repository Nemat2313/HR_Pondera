import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();

    // Distinct regions
    const regions = db
      .prepare(`SELECT DISTINCT region FROM personnel WHERE region != '' ORDER BY region ASC`)
      .all()
      .map((r: any) => r.region);

    // Distinct projects
    const projects = db
      .prepare(`SELECT DISTINCT proje_adi FROM personnel WHERE proje_adi != '' ORDER BY proje_adi ASC`)
      .all()
      .map((r: any) => r.proje_adi);

    // Distinct departments
    const departments = db
      .prepare(`SELECT DISTINCT departman FROM personnel WHERE departman != '' ORDER BY departman ASC`)
      .all()
      .map((r: any) => r.departman);

    // Distinct categories
    const categories = db
      .prepare(`SELECT DISTINCT kategori FROM personnel WHERE kategori != '' ORDER BY kategori ASC`)
      .all()
      .map((r: any) => r.kategori);

    // Distinct nationalities
    const nationalities = db
      .prepare(`SELECT DISTINCT uyruk FROM personnel WHERE uyruk != '' ORDER BY uyruk ASC`)
      .all()
      .map((r: any) => r.uyruk);

    // Distinct statuses
    const statuses = db
      .prepare(`SELECT DISTINCT genel_durum FROM personnel WHERE genel_durum != '' ORDER BY genel_durum ASC`)
      .all()
      .map((r: any) => r.genel_durum);

    return NextResponse.json({
      success: true,
      regions,
      projects,
      departments,
      categories,
      nationalities,
      statuses,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Filtre seçenekleri alınamadı.' },
      { status: 500 }
    );
  }
}
