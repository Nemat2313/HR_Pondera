import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  WORK_PERMIT_CASE_SQL,
  normalizePermitFilterKey,
  buildNormalizedDateSql,
  getDatasetReferenceDates,
} from '@/lib/workPermits';
import { stripOfficialSalaryFromRaw } from '@/lib/salaryPrivacy';
import { buildEffectiveRegionSqlCondition, resolveEffectiveRegion } from '@/lib/regionSiteHelper';
import {
  ensureInterSiteTransfersSynced,
  NON_TRANSFER_ENTRY_SQL,
  NON_TRANSFER_EXIT_SQL,
} from '@/lib/interSiteTransfers';
import { formatKnownDateToDdMmYyyy, normalizeRawRecordDates } from '@/lib/dateFormatter';
import { getZupDatesIndex, matchZupDatesForPersonnelRow } from '@/lib/zupDatesLookup';
import { syncAndGetJobTitleLevels } from '@/lib/orgJobLevelManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50000, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    // Row-Level Security (RLS) Scope (verified session cookie takes precedence over client headers)
    const sessionUser = getSessionUserFromRequest(request);
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType =
      sessionUser?.scope_type || headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal =
      sessionUser?.scope_value || headerScopeVal || searchParams.get('userScopeValue') || 'all';

    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || 'Mevcut';
    let region = searchParams.get('region') || 'all';
    let project = searchParams.get('project') || 'all';
    const department = searchParams.get('department') || 'all';
    const category = searchParams.get('category') || 'all';
    const nationality = searchParams.get('nationality') || 'all';
    const collar = searchParams.get('collar') || 'all';
    const gender = searchParams.get('gender') || 'all';
    const permit = searchParams.get('permit') || 'all';
    const title = searchParams.get('title') || 'all';
    const firm = searchParams.get('firm') || 'all';
    const movementType = searchParams.get('movementType') || ''; // 'entry' | 'exit'
    const period = searchParams.get('period') || ''; // '1d' | '3d' | '7d' | '30d' | 'all'
    const sortBy = searchParams.get('sortBy') || 'sira_no';
    const sortOrder = searchParams.get('sortOrder')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const includeDetails = searchParams.get('includeDetails') === 'true';
    const idParam = searchParams.get('id')?.trim() || '';

    // Strict RLS Overrides
    if (scopeType === 'region' && scopeVal !== 'all') {
      region = scopeVal;
    } else if (scopeType === 'project' && scopeVal !== 'all') {
      project = scopeVal;
    }

    const db = getDb();
    ensureInterSiteTransfersSynced(db);
    const conditions: string[] = [];
    const params: any[] = [];

    // Safe nationality mapping to exact SQLite database values (stored as uppercase ASCII)
    const nationalityMap: Record<string, string> = {
      // Turkish names -> DB value
      ÖZBEKİSTAN: 'OZBEKISTAN',
      ÖZBEKISTAN: 'OZBEKISTAN',
      OZBEKİSTAN: 'OZBEKISTAN',
      OZBEKISTAN: 'OZBEKISTAN',
      HİNDİSTAN: 'HINDISTAN',
      HINDISTAN: 'HINDISTAN',
      AZERBAYCAN: 'AZERBAYCAN',
      RUSYA: 'RUSYA',
      TÜRKMENİSTAN: 'TURKMENISTAN',
      TURKMENISTAN: 'TURKMENISTAN',
      TÜRKİYE: 'TURKIYE',
      TURKIYE: 'TURKIYE',
      TACİKİSTAN: 'TACIKISTAN',
      TACIKISTAN: 'TACIKISTAN',
      BANGLADEŞ: 'BANGLADES',
      BANGLADES: 'BANGLADES',
      KIRGIZİSTAN: 'KIRGIZISTAN',
      KIRGIZISTAN: 'KIRGIZISTAN',
      KAZAKİSTAN: 'KAZAKISTAN',
      KAZAKISTAN: 'KAZAKISTAN',
      MOLDOVA: 'MOLDOVA',
      BELARUS: 'BELARUS',
      FİLİPİNLER: 'FILIPINLER',
      FILIPINLER: 'FILIPINLER',
      ÇİN: 'CIN',
      CIN: 'CIN',
      PAKİSTAN: 'PAKISTAN',
      PAKISTAN: 'PAKISTAN',
      UKRAYNA: 'UKRAYNA',
      // Russian names -> DB value
      УЗБЕКИСТАН: 'OZBEKISTAN',
      ИНДИЯ: 'HINDISTAN',
      АЗЕРБАЙДЖАН: 'AZERBAYCAN',
      РОССИЯ: 'RUSYA',
      ТУРКМЕНИСТАН: 'TURKMENISTAN',
      ТУРЦИЯ: 'TURKIYE',
      ТАДЖИКИСТАН: 'TACIKISTAN',
      БАНГЛАДЕШ: 'BANGLADES',
      КЫРГЫЗСТАН: 'KIRGIZISTAN',
      КАЗАХСТАН: 'KAZAKISTAN',
      МОЛДОВА: 'MOLDOVA',
      БЕЛАРУСЬ: 'BELARUS',
      ФИЛИППИНЫ: 'FILIPINLER',
      КИТАЙ: 'CIN',
      ПАКИСТАН: 'PAKISTAN',
      УКРАИНА: 'UKRAYNA',
    };

    const regionMap: Record<string, string> = {
      МОСКВА: 'Merkez Ofis',
      MOSKOVA: 'Merkez Ofis',
      'MERKEZ OFİS': 'Merkez Ofis',
      'MERKEZ OFIS': 'Merkez Ofis',
      'ГЛАВНЫЙ ОФИС': 'Merkez Ofis',
      АМУР: 'Amur',
      AMUR: 'Amur',
      'АМУР АГХК': 'Amur-AGHK',
      'AMUR AGHK': 'Amur-AGHK',
      ТОБОЛЬСК: 'Tobolsk',
      TOBOLSK: 'Tobolsk',
      НОРИЛЬСК: 'Murmansk',
      МУРМАНСК: 'Murmansk',
      MURMANSK: 'Murmansk',
      'УСТЬ-ЛУГА': 'Ust Luga',
      'УСТЬ ЛУГА': 'Ust Luga',
      'UST-LUGA': 'Ust Luga',
      'UST LUGA': 'Ust Luga',
      КАЗАНЬ: 'Kazan',
      KAZAN: 'Kazan',
      СВОБОДНЫЙ: 'Svobodny-AGHK',
      'СВОБОДНЫЙ АГХК': 'Svobodny-AGHK',
      'SVOBODNY-AGHK': 'Svobodny-AGHK',
      ИРКУТСК: 'Irkutsk',
      IRKUTSK: 'Irkutsk',
      УДОКАН: 'Udokan',
      UDOKAN: 'Udokan',
    };

    const dismissalCandidate = searchParams.get('dismissalCandidate') === 'true';
    const inDateExpr = buildNormalizedDateSql('ise_giris_tarihi');
    const outDateExpr = buildNormalizedDateSql('cikis_tarihi');

    // Movement & Period filter (for Management & Turnover view — excludes inter-site transfers from both entries and exits, and exposes transfers separately)
    if (idParam && /^\d+$/.test(idParam)) {
      conditions.push('id = ?');
      params.push(Number(idParam));
    } else if (movementType === 'entry' || movementType === 'exit' || movementType === 'transfer') {
      const { inRefDate, outRefDate } = getDatasetReferenceDates(db);
      const daysMap: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7, '30d': 30 };
      const days = daysMap[period];

      if (movementType === 'transfer') {
        const maxTrRow = db
          .prepare(
            `SELECT MAX(transfer_date) as d FROM inter_site_transfers WHERE transfer_date >= '2020-01-01'`
          )
          .get() as { d: string | null } | undefined;
        const baseRef = inRefDate >= outRefDate ? inRefDate : outRefDate;
        const trRefDate = maxTrRow?.d && maxTrRow.d > baseRef ? maxTrRow.d : baseRef;
        if (days) {
          conditions.push(
            `id IN (SELECT personnel_id FROM inter_site_transfers WHERE is_primary_record = 1 AND transfer_date >= date(?, '-${days} days') AND transfer_date <= ?)`
          );
          params.push(trRefDate, trRefDate);
        } else {
          conditions.push(
            `id IN (SELECT personnel_id FROM inter_site_transfers WHERE is_primary_record = 1 AND transfer_date IS NOT NULL)`
          );
        }
      } else {
        const refDate = movementType === 'entry' ? inRefDate : outRefDate;
        const dateColExpr = movementType === 'entry' ? inDateExpr : outDateExpr;
        if (movementType === 'entry') {
          conditions.push(NON_TRANSFER_ENTRY_SQL);
        } else {
          conditions.push(NON_TRANSFER_EXIT_SQL);
        }
        if (days) {
          conditions.push(`(${dateColExpr}) >= date(?, '-${days} days') AND (${dateColExpr}) <= ?`);
          params.push(refDate, refDate);
        } else if (movementType === 'exit') {
          conditions.push(`(genel_durum = 'Cikis' OR (${outDateExpr}) IS NOT NULL)`);
        } else {
          conditions.push(`(${inDateExpr}) IS NOT NULL`);
        }
      }
    } else if (dismissalCandidate) {
      conditions.push(`(
        genel_durum = 'Cikis'
        OR (cikis_tarihi IS NOT NULL AND cikis_tarihi != '')
        OR (json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') IS NOT NULL AND json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') != '')
      )`);
      conditions.push(`uyruk NOT IN ('RUSYA', 'BELARUS')`);
      conditions.push(`(
        cikis_tarihi LIKE '2026-%'
        OR cikis_tarihi LIKE '%.2026'
        OR (cikis_tarihi >= '46000' AND cikis_tarihi <= '47000')
        OR json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') LIKE '2026-%'
        OR json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') LIKE '%.2026'
        OR (json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') >= '46000' AND json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') <= '47000')
      )`);
    } else if (status !== 'all' && !(search && status === 'Mevcut')) {
      if (status === 'Sevke Hazır' || status === 'Sevke Hazir') {
        conditions.push('(genel_durum = ? OR genel_durum LIKE ?)');
        params.push('Sevke Hazır', 'Sevke Haz%');
      } else if (status === 'Ayrılan' || status === 'Cikis' || status === 'Çıkış') {
        conditions.push('genel_durum = ?');
        params.push('Cikis');
      } else {
        conditions.push('genel_durum = ?');
        params.push(status);
      }
    }

    // Dropdown filters
    if (region !== 'all') {
      const cleanReg = region.trim();
      const resolvedReg = regionMap[cleanReg.toUpperCase()] || cleanReg;
      const regCond = buildEffectiveRegionSqlCondition(resolvedReg);
      conditions.push(regCond.sql);
      params.push(...regCond.params);
    }
    if (project !== 'all') {
      conditions.push('proje_adi = ?');
      params.push(project);
    }
    if (department !== 'all') {
      conditions.push('departman = ?');
      params.push(department);
    }
    if (category !== 'all') {
      conditions.push('kategori = ?');
      params.push(category);
    }
    if (nationality !== 'all') {
      const cleanNat = nationality.trim();
      const resolvedNat = nationalityMap[cleanNat.toUpperCase()] || cleanNat;
      conditions.push('(uyruk = ? OR uyruk = ? OR uyruk LIKE ?)');
      params.push(resolvedNat, cleanNat, `%${resolvedNat}%`);
    }
    if (collar !== 'all') {
      conditions.push('endirekt_direkt = ?');
      params.push(collar);
    }
    if (gender !== 'all') {
      conditions.push('cinsiyet = ?');
      params.push(gender);
    }
    if (permit !== 'all') {
      if (permit.toUpperCase() === 'NON_VKS') {
        conditions.push(`(${WORK_PERMIT_CASE_SQL}) != 'VKS'`);
      } else {
        const canonicalPermit = normalizePermitFilterKey(permit);
        if (canonicalPermit) {
          conditions.push(`(${WORK_PERMIT_CASE_SQL}) = ?`);
          params.push(canonicalPermit);
        }
      }
    }
    if (title !== 'all') {
      const lvlMatch = title.trim().match(/^L([1-8])\b/i);
      if (lvlMatch) {
        syncAndGetJobTitleLevels(db);
        const targetLvl = `L${lvlMatch[1]}`;
        conditions.push(
          `LOWER(TRIM(COALESCE(gorevi, ''))) IN (SELECT normalized_title FROM org_job_title_levels WHERE level = ?)`
        );
        params.push(targetLvl);
      } else {
        conditions.push(`TRIM(COALESCE(gorevi, '')) = ?`);
        params.push(title.trim());
      }
    }
    if (firm !== 'all') {
      conditions.push(`TRIM(COALESCE(resmi_firma, '')) = ?`);
      params.push(firm.trim());
    }

    // Global Search
    if (search) {
      conditions.push(`(
        ad_soyad LIKE ? OR
        adi LIKE ? OR
        soyadi LIKE ? OR
        sicil_no LIKE ? OR
        rhi_id LIKE ? OR
        saren_no LIKE ? OR
        gorevi LIKE ? OR
        departman LIKE ? OR
        proje_adi LIKE ? OR
        pasaport_no LIKE ? OR
        tc_kimlik_no LIKE ? OR
        json_extract(all_data_json, '$."Adı Soyadı Kiril"') LIKE ?
      )`);
      const searchPattern = `%${search}%`;
      for (let i = 0; i < 12; i++) {
        params.push(searchPattern);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Safe sorting column mapping
    const allowedSortCols: Record<string, string> = {
      sira_no: 'sira_no',
      sicil_no: 'sicil_no',
      rhi_id: 'rhi_id',
      saren_no: 'saren_no',
      ad_soyad: 'ad_soyad',
      genel_durum: 'genel_durum',
      region: 'region',
      proje_adi: 'proje_adi',
      departman: 'departman',
      kategori: 'kategori',
      uyruk: 'uyruk',
      gorevi: 'gorevi',
      endirekt_direkt: 'endirekt_direkt',
      ise_giris_tarihi: `(${inDateExpr})`,
      cikis_tarihi: `(${outDateExpr})`,
    };
    const defaultSortCol =
      movementType === 'exit'
        ? `(${outDateExpr})`
        : movementType === 'entry' || movementType === 'transfer'
        ? `COALESCE((${inDateExpr}), (${outDateExpr}))`
        : 'sira_no';
    const orderColumn =
      movementType && !searchParams.get('sortBy')
        ? defaultSortCol
        : allowedSortCols[sortBy] || 'sira_no';
    const effectiveSortOrder =
      movementType && !searchParams.get('sortOrder') ? 'DESC' : sortOrder;

    // Total filtered count
    const countSql = `SELECT COUNT(*) as total FROM personnel ${whereClause}`;
    const countStmt = db.prepare(countSql);
    const countRes = countStmt.get(...params) as { total: number };
    const totalRows = countRes ? countRes.total : 0;
    const totalPages = Math.ceil(totalRows / limit);

    // Fetch records
    const selectCols = includeDetails
      ? `id, sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum, region, proje_adi, calisma_lokasyon, kategori, firma, departman, uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril, gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi, gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no, dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi, patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email, kamp_no, oda_no, (${WORK_PERMIT_CASE_SQL}) as permit_type, all_data_json`
      : `id, sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum, region, proje_adi, calisma_lokasyon, kategori, firma, departman, uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril, gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi, gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no, dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi, patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email, kamp_no, oda_no, (${WORK_PERMIT_CASE_SQL}) as permit_type`;

    const dataSql = `
      SELECT ${selectCols}
      FROM personnel
      ${whereClause}
      ORDER BY ${orderColumn} ${effectiveSortOrder}
      LIMIT ? OFFSET ?
    `;

    const dataStmt = db.prepare(dataSql);
    const rows = dataStmt.all(...params, limit, offset) as any[];

    // Enrich transfer metadata when viewing inter-site transfers
    let transferMetaById = new Map<
      number,
      {
        from_site: string;
        to_site: string;
        original_hire_date: string;
        transfer_direction: string;
        transfer_date: string;
      }
    >();
    if (movementType === 'transfer' && rows.length > 0) {
      const rowIds = rows.map((r) => Number(r.id)).filter((n) => !isNaN(n));
      if (rowIds.length > 0) {
        const placeholders = rowIds.map(() => '?').join(',');
        const trRows = db
          .prepare(
            `SELECT personnel_id, from_site, to_site, original_hire_date, transfer_direction, transfer_date
             FROM inter_site_transfers
             WHERE personnel_id IN (${placeholders})`
          )
          .all(...rowIds) as any[];
        for (const tr of trRows) {
          transferMetaById.set(Number(tr.personnel_id), tr);
        }
      }
    }

    const zupIndex = getZupDatesIndex(db);
    const topDateCols = [
      'ise_giris_tarihi',
      'santiye_giris_tarihi',
      'cikis_tarihi',
      'propusk_bitis_tarihi',
      'dogum_tarihi',
      'pasaport_gecerlilik',
      'vize_bitis_tarihi',
      'patent_alis_tarihi',
      'patent_bitis_tarihi',
    ] as const;

    // Parse all_data_json if requested (stripping any official salary fields per privacy policy)
    const formattedRows = rows.map((r) => {
      r.region = resolveEffectiveRegion(r.region, r.proje_adi, r.region);
      const zupMatch = matchZupDatesForPersonnelRow(zupIndex, r);
      r.zup_hire_date = zupMatch.zup_hire_date;
      r.zup_dismissal_date = zupMatch.zup_dismissal_date;
      r.zup_status = zupMatch.zup_status;
      r.zup_tabel_no = zupMatch.zup_tabel_no;

      const trMeta = transferMetaById.get(Number(r.id));
      if (trMeta) {
        r.transfer_from_site = trMeta.from_site || '';
        r.transfer_to_site = trMeta.to_site || r.region || '';
        r.original_hire_date = trMeta.original_hire_date
          ? formatKnownDateToDdMmYyyy(trMeta.original_hire_date, '')
          : '';
        r.transfer_direction = trMeta.transfer_direction || '';
        if (!r.ise_giris_tarihi && trMeta.transfer_date) {
          r.ise_giris_tarihi = trMeta.transfer_date;
        }
      }

      for (const df of topDateCols) {
        if (r[df]) {
          r[df] = formatKnownDateToDdMmYyyy(r[df], String(r[df]));
        }
      }

      if (r.all_data_json && typeof r.all_data_json === 'string') {
        try {
          r.raw = normalizeRawRecordDates(stripOfficialSalaryFromRaw(JSON.parse(r.all_data_json)));
        } catch {
          r.raw = {};
        }
        delete r.all_data_json;
      }
      return r;
    });

    let dataFreshness = '';
    try {
      const dfRow = db.prepare("SELECT value FROM system_info WHERE key = 'data_freshness'").get() as { value: string } | undefined;
      if (dfRow?.value) dataFreshness = dfRow.value;
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      data: formattedRows,
      dataFreshness,
      pagination: {
        page,
        limit,
        totalRows,
        totalPages,
      },
      rls: {
        active: scopeType !== 'all',
        type: scopeType,
        value: scopeVal,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Personel listesi yüklenirken bir sorun oluştu.' },
      { status: 500 }
    );
  }
}
