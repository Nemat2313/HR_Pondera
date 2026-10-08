import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50000, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    // Row-Level Security (RLS) Scope
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType = headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal = headerScopeVal || searchParams.get('userScopeValue') || 'all';

    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status') || 'Mevcut';
    let region = searchParams.get('region') || 'all';
    let project = searchParams.get('project') || 'all';
    const department = searchParams.get('department') || 'all';
    const category = searchParams.get('category') || 'all';
    const nationality = searchParams.get('nationality') || 'all';
    const collar = searchParams.get('collar') || 'all';
    const gender = searchParams.get('gender') || 'all';
    const sortBy = searchParams.get('sortBy') || 'sira_no';
    const sortOrder = searchParams.get('sortOrder')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const includeDetails = searchParams.get('includeDetails') === 'true';

    // Strict RLS Overrides
    if (scopeType === 'region' && scopeVal !== 'all') {
      region = scopeVal;
    } else if (scopeType === 'project' && scopeVal !== 'all') {
      project = scopeVal;
    }

    const db = getDb();
    const conditions: string[] = [];
    const params: any[] = [];

    // Status filter
    if (status !== 'all') {
      conditions.push('genel_durum = ?');
      params.push(status);
    }

    // Dropdown filters
    if (region !== 'all') {
      conditions.push('region = ?');
      params.push(region);
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
      conditions.push('uyruk = ?');
      params.push(nationality);
    }
    if (collar !== 'all') {
      conditions.push('endirekt_direkt = ?');
      params.push(collar);
    }
    if (gender !== 'all') {
      conditions.push('cinsiyet = ?');
      params.push(gender);
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
        tc_kimlik_no LIKE ?
      )`);
      const searchPattern = `%${search}%`;
      for (let i = 0; i < 11; i++) {
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
      ise_giris_tarihi: 'ise_giris_tarihi',
      cikis_tarihi: 'cikis_tarihi',
    };
    const orderColumn = allowedSortCols[sortBy] || 'sira_no';

    // Total filtered count
    const countSql = `SELECT COUNT(*) as total FROM personnel ${whereClause}`;
    const countStmt = db.prepare(countSql);
    const countRes = countStmt.get(...params) as { total: number };
    const totalRows = countRes ? countRes.total : 0;
    const totalPages = Math.ceil(totalRows / limit);

    // Fetch records
    const selectCols = includeDetails
      ? `id, sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum, region, proje_adi, calisma_lokasyon, kategori, firma, departman, uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril, gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi, gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no, dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi, patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email, kamp_no, oda_no, all_data_json`
      : `id, sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum, region, proje_adi, calisma_lokasyon, kategori, firma, departman, uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril, gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi, gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no, dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi, patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email, kamp_no, oda_no`;

    const dataSql = `
      SELECT ${selectCols}
      FROM personnel
      ${whereClause}
      ORDER BY ${orderColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const dataStmt = db.prepare(dataSql);
    const rows = dataStmt.all(...params, limit, offset) as any[];

    // Parse all_data_json if requested
    const formattedRows = rows.map((r) => {
      if (r.all_data_json && typeof r.all_data_json === 'string') {
        try {
          r.raw = JSON.parse(r.all_data_json);
        } catch {
          r.raw = {};
        }
        delete r.all_data_json;
      }
      return r;
    });

    return NextResponse.json({
      success: true,
      data: formattedRows,
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
