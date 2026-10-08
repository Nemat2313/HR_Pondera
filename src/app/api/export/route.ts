import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDateVal(val: any): string {
  if (val === undefined || val === null || String(val).trim() === '') return '-';
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}.${month}.${year}`;
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return str;
}

const COLUMN_HEADER_MAP: Record<string, string> = {
  sira_no: 'Sıra No',
  sicil_no: 'Sicil No',
  rhi_id: 'RHI ID',
  saren_no: 'Saren No',
  genel_durum: 'Genel Durum',
  guncel_durum: 'Güncel Durum',
  region: 'Bölge',
  proje_adi: 'Proje Adı',
  calisma_lokasyon: 'Çalışma Lokasyonu',
  kategori: 'Kategori',
  firma: 'Firma / Taşeron',
  departman: 'Departman',
  uyruk: 'Uyruk',
  adi: 'Adı',
  soyadi: 'Soyadı',
  baba_adi: 'Baba Adı',
  ad_soyad: 'Ad Soyad',
  tam_adi_kiril: 'Tam Adı (Kiril)',
  gorevi: 'Görevi',
  rhi_gorevi: 'RHI Görevi',
  sorumlu_kisi: 'Sorumlu Kişi',
  grup_sefi: 'Grup Şefi',
  endirekt_direkt: 'Yaka (Direkt/Endirekt)',
  ise_giris_tarihi: 'İşe Giriş Tarihi',
  santiye_giris_tarihi: 'Şantiye Giriş Tarihi',
  cikis_tarihi: 'Çıkış Tarihi',
  cikis_sebebi: 'Çıkış Sebebi',
  gunduz_gece: 'Gündüz / Gece',
  propusk_no: 'Propusk No',
  propusk_bitis_tarihi: 'Propusk Bitiş Tarihi',
  cinsiyet: 'Cinsiyet',
  dogum_tarihi: 'Doğum Tarihi',
  pasaport_no: 'Pasaport No',
  pasaport_gecerlilik: 'Pasaport Geçerlilik',
  tc_kimlik_no: 'TC Kimlik No',
  dogum_yeri: 'Doğum Yeri',
  migrasyon_no: 'Migrasyon No',
  inn_no: 'INN No',
  vize_no: 'Vize No',
  vize_bitis_tarihi: 'Vize Bitiş Tarihi',
  patent_alis_tarihi: 'Patent Alış Tarihi',
  patent_bitis_tarihi: 'Patent Bitiş Tarihi',
  telefon_no: 'Telefon No',
  email: 'E-Posta',
  kamp_no: 'Kamp No',
  oda_no: 'Oda No',
};

const DATE_FIELDS = new Set([
  'ise_giris_tarihi',
  'santiye_giris_tarihi',
  'cikis_tarihi',
  'propusk_bitis_tarihi',
  'dogum_tarihi',
  'pasaport_gecerlilik',
  'vize_bitis_tarihi',
  'patent_alis_tarihi',
  'patent_bitis_tarihi',
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

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
    const customColsParam = searchParams.get('columns')?.trim() || '';

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

    const selectCols = `sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum, region, proje_adi, calisma_lokasyon, kategori, firma, departman, uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril, gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi, gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no, dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi, patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email, kamp_no, oda_no`;

    const dataSql = `
      SELECT ${selectCols}
      FROM personnel
      ${whereClause}
      ORDER BY ${orderColumn} ${sortOrder}
      LIMIT 50000
    `;

    const dataStmt = db.prepare(dataSql);
    const rows = dataStmt.all(...params) as any[];

    // Parse requested custom columns if provided
    const requestedCols = customColsParam
      ? customColsParam.split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    const excelRows = rows.map((r) => {
      const rowObj: Record<string, any> = {};

      if (requestedCols.length > 0) {
        for (const colKey of requestedCols) {
          const rawVal = r[colKey];
          const headerName = COLUMN_HEADER_MAP[colKey] || colKey;
          rowObj[headerName] = DATE_FIELDS.has(colKey)
            ? formatDateVal(rawVal)
            : (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '' ? rawVal : '-');
        }
      } else {
        // Standard full columns
        for (const [colKey, headerName] of Object.entries(COLUMN_HEADER_MAP)) {
          const rawVal = r[colKey];
          rowObj[headerName] = DATE_FIELDS.has(colKey)
            ? formatDateVal(rawVal)
            : (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '' ? rawVal : '-');
        }
      }

      return rowObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Auto-fit column widths
    if (excelRows.length > 0) {
      worksheet['!cols'] = Object.keys(excelRows[0]).map((key) => ({
        wch: Math.max(key.length + 4, 15),
      }));
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Personel Listesi');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Pondera_Personel_Listesi_${dateStr}.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Excel dosyası oluşturulurken hata meydana geldi.' },
      { status: 500 }
    );
  }
}
