import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { resolveRequestRlsScope } from '@/lib/auth';
import { EFFECTIVE_REGION_SQL, buildEffectiveRegionSqlCondition } from '@/lib/regionSiteHelper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { scopeType, scopeVal } = resolveRequestRlsScope(request);

    const rlsConds: string[] = [];
    const rlsParams: any[] = [];
    if (scopeType === 'region' && scopeVal && scopeVal !== 'all') {
      const c = buildEffectiveRegionSqlCondition(scopeVal);
      rlsConds.push(c.sql);
      rlsParams.push(...c.params);
    } else if (scopeType === 'project' && scopeVal && scopeVal !== 'all') {
      rlsConds.push('proje_adi = ?');
      rlsParams.push(scopeVal);
    }
    const rlsAnd = rlsConds.length > 0 ? ` AND ${rlsConds.join(' AND ')}` : '';

    // Distinct regions (with Kazan split into individual sites)
    const regions = db
      .prepare(
        `SELECT DISTINCT (${EFFECTIVE_REGION_SQL}) AS eff_region
         FROM personnel
         WHERE COALESCE(TRIM(region), '') != ''${rlsAnd}
         ORDER BY eff_region ASC`
      )
      .all(...rlsParams)
      .map((r: any) => r.eff_region);

    // Distinct projects
    const projects = db
      .prepare(`SELECT DISTINCT proje_adi FROM personnel WHERE proje_adi != ''${rlsAnd} ORDER BY proje_adi ASC`)
      .all(...rlsParams)
      .map((r: any) => r.proje_adi);

    // Distinct departments
    const departments = db
      .prepare(`SELECT DISTINCT departman FROM personnel WHERE departman != ''${rlsAnd} ORDER BY departman ASC`)
      .all(...rlsParams)
      .map((r: any) => r.departman);

    // Distinct categories
    const categories = db
      .prepare(`SELECT DISTINCT kategori FROM personnel WHERE kategori != ''${rlsAnd} ORDER BY kategori ASC`)
      .all(...rlsParams)
      .map((r: any) => r.kategori);

    // Distinct nationalities
    const nationalities = db
      .prepare(`SELECT DISTINCT uyruk FROM personnel WHERE uyruk != ''${rlsAnd} ORDER BY uyruk ASC`)
      .all(...rlsParams)
      .map((r: any) => r.uyruk);

    // Distinct statuses
    const statuses = db
      .prepare(`SELECT DISTINCT genel_durum FROM personnel WHERE genel_durum != ''${rlsAnd} ORDER BY genel_durum ASC`)
      .all(...rlsParams)
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
