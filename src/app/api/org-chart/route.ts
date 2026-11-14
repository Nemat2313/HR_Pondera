import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  buildEffectiveRegionSqlCondition,
  resolveEffectiveRegion,
} from '@/lib/regionSiteHelper';
import { formatKnownDateToDdMmYyyy } from '@/lib/dateFormatter';
import {
  getOrgJobLevelsRevision,
  syncAndGetJobTitleLevels,
} from '@/lib/orgJobLevelManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface OrgRawPerson {
  id: number;
  sicil_no: string;
  ad_soyad: string;
  gorevi: string;
  ek_gorev: string;
  departman: string;
  region: string;
  effective_site: string;
  proje_adi: string;
  sorumlu_kisi: string;
  grup_sefi: string;
  endirekt_direkt: string;
  kategori: string;
  uyruk: string;
  firma: string;
  ise_giris_tarihi: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType = headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal = headerScopeVal || searchParams.get('userScopeValue') || 'all';

    const db = getDb();

    const verRow = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM personnel')
      .get() as { cnt: number; maxId: number };
    const stampRow = db
      .prepare("SELECT value FROM system_info WHERE key = 'last_updated'")
      .get() as { value: string } | undefined;
    const jobLevelsRev = getOrgJobLevelsRevision(db);

    const cacheKey = `org_v2:${verRow.cnt}:${verRow.maxId}:${stampRow?.value || ''}:${jobLevelsRev}:${scopeType}:${scopeVal}`;
    const gCache = globalThis as unknown as {
      __ponderaOrgChartCache?: Map<string, any>;
    };
    if (!gCache.__ponderaOrgChartCache) {
      gCache.__ponderaOrgChartCache = new Map();
    }
    const hit = gCache.__ponderaOrgChartCache.get(cacheKey);
    if (hit) {
      return NextResponse.json(hit);
    }

    const jobLevelSync = syncAndGetJobTitleLevels(db);

    const whereConds: string[] = ["genel_durum = 'Mevcut'"];
    const params: any[] = [];

    if (scopeType === 'region' && scopeVal && scopeVal !== 'all') {
      const regCond = buildEffectiveRegionSqlCondition(scopeVal);
      whereConds.push(regCond.sql);
      params.push(...regCond.params);
    } else if (scopeType === 'project' && scopeVal && scopeVal !== 'all') {
      whereConds.push('proje_adi = ?');
      params.push(scopeVal);
    }

    const sql = `
      SELECT
        id,
        COALESCE(sicil_no, '') as sicil_no,
        COALESCE(ad_soyad, '') as ad_soyad,
        COALESCE(gorevi, '') as gorevi,
        COALESCE(rhi_gorevi, '') as ek_gorev,
        COALESCE(departman, '') as departman,
        COALESCE(region, '') as region,
        COALESCE(proje_adi, '') as proje_adi,
        COALESCE(sorumlu_kisi, '') as sorumlu_kisi,
        COALESCE(grup_sefi, '') as grup_sefi,
        COALESCE(endirekt_direkt, '') as endirekt_direkt,
        COALESCE(kategori, '') as kategori,
        COALESCE(uyruk, '') as uyruk,
        COALESCE(firma, '') as firma,
        COALESCE(ise_giris_tarihi, '') as ise_giris_tarihi
      FROM personnel
      WHERE ${whereConds.join(' AND ')}
      ORDER BY id ASC
    `;

    const rawRows = db.prepare(sql).all(...params) as Array<Record<string, any>>;

    const people: OrgRawPerson[] = rawRows.map((r) => ({
      id: Number(r.id),
      sicil_no: String(r.sicil_no || '').trim(),
      ad_soyad: String(r.ad_soyad || '').trim(),
      gorevi: String(r.gorevi || '').trim(),
      ek_gorev: String(r.ek_gorev || '').trim(),
      departman: String(r.departman || '').trim(),
      region: String(r.region || '').trim(),
      effective_site: resolveEffectiveRegion(r.region, r.proje_adi),
      proje_adi: String(r.proje_adi || '').trim(),
      sorumlu_kisi: String(r.sorumlu_kisi || '').trim(),
      grup_sefi: String(r.grup_sefi || '').trim(),
      endirekt_direkt: String(r.endirekt_direkt || '').trim(),
      kategori: String(r.kategori || '').trim(),
      uyruk: String(r.uyruk || '').trim(),
      firma: String(r.firma || '').trim(),
      ise_giris_tarihi: formatKnownDateToDdMmYyyy(r.ise_giris_tarihi, '-'),
    }));

    const payload = {
      success: true,
      totalActive: people.length,
      people,
      jobLevelMap: jobLevelSync.levelMap,
      unconfirmedTitles: jobLevelSync.unconfirmedTitles,
      totalConfiguredTitles: jobLevelSync.items.length,
      jobLevelsRevision: jobLevelSync.revision,
    };

    if (gCache.__ponderaOrgChartCache.size > 15) {
      gCache.__ponderaOrgChartCache.clear();
    }
    gCache.__ponderaOrgChartCache.set(cacheKey, payload);

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { success: false, message: 'Organizasyon şeması verileri alınamadı.' },
      { status: 500 }
    );
  }
}
