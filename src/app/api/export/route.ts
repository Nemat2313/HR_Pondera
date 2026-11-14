import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  WORK_PERMIT_CASE_SQL,
  normalizePermitFilterKey,
  buildNormalizedDateSql,
  getDatasetReferenceDates,
} from '@/lib/workPermits';
import { isOfficialSalaryColumn, stripOfficialSalaryFromRaw } from '@/lib/salaryPrivacy';
import { buildEffectiveRegionSqlCondition } from '@/lib/regionSiteHelper';
import {
  ensureInterSiteTransfersSynced,
  NON_TRANSFER_ENTRY_SQL,
  NON_TRANSFER_EXIT_SQL,
} from '@/lib/interSiteTransfers';
import { formatKnownDateToDdMmYyyy, isDateLikeColumnName } from '@/lib/dateFormatter';
import { getZupDatesIndex, matchZupDatesForPersonnelRow } from '@/lib/zupDatesLookup';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function formatDateVal(val: any): string {
  return formatKnownDateToDdMmYyyy(val, '-');
}

const COLUMN_HEADER_MAP: Record<string, string> = {
  sira_no: 'Sıra No',
  sicil_no: 'Sicil No',
  rhi_id: 'Şirket ID',
  saren_no: 'Saren No',
  genel_durum: 'Genel Durum',
  guncel_durum: 'Güncel Durum',
  region: 'Region',
  proje_adi: 'Proje Adı',
  calisma_lokasyon: 'Çalışma Lokasyon Durumu',
  kategori: 'Kategori',
  firma: 'Firma',
  departman: 'Departman',
  uyruk: 'Uyruk',
  adi: 'Adı',
  soyadi: 'Soyadı',
  baba_adi: 'Baba Adı',
  ad_soyad: 'Ad Soyad',
  tam_adi_kiril: 'Tam Adı (Kiril)',
  gorevi: 'Görevi',
  rhi_gorevi: 'Ek Görev',
  sorumlu_kisi: 'Sorumlu Kişi',
  grup_sefi: 'Grup Şefi',
  endirekt_direkt: 'Endirekt / Direkt',
  ise_giris_tarihi: 'İşe Giriş Tarihi',
  santiye_giris_tarihi: 'Şantiye Giriş Tarihi',
  cikis_tarihi: 'Çıkış Tarihi',
  cikis_sebebi: 'Çıkış Sebebi',
  gunduz_gece: 'Gündüz / Gece Durumu',
  propusk_no: 'Propusk No',
  propusk_bitis_tarihi: 'Propusk Bitiş Tarihi',
  cinsiyet: 'Cinsiyet',
  dogum_tarihi: 'Doğum Tarihi',
  pasaport_no: 'Pasaport No',
  pasaport_gecerlilik: 'Pasaport Geçerlilik Tarihi',
  tc_kimlik_no: 'TC Kimlik No',
  dogum_yeri: 'Doğum Yeri',
  migrasyon_no: 'Migrasyon No',
  inn_no: 'INN No',
  vize_no: 'Vize No',
  vize_bitis_tarihi: 'Vize Bitiş Tarihi',
  patent_alis_tarihi: 'Patent Alış Tarihi',
  patent_bitis_tarihi: 'Patent Bitiş Tarihi',
  telefon_no: 'Telefon No',
  email: 'Email',
  kamp_no: 'Kamp No',
  oda_no: 'Oda No',
};

const COLUMN_ALIASES: Record<string, string> = {
  sirket_id: 'rhi_id',
  rhi_id: 'rhi_id',
  rhi_id_1: 'rhi_id',
  rhi_gorevi: 'rhi_gorevi',
  ek_gorev: 'rhi_gorevi',
  calisma_lokasyon_durumu: 'calisma_lokasyon',
  calisma_lokasyonu: 'calisma_lokasyon',
  calisma_lokasyon: 'calisma_lokasyon',
  genel_durumu: 'genel_durum',
  genel_durum: 'genel_durum',
  guncel_durumu: 'guncel_durum',
  guncel_durum: 'guncel_durum',
  ad_soyad: 'ad_soyad',
  adi_soyadi: 'ad_soyad',
  tam_adi_kiril: 'tam_adi_kiril',
  ise_giris_tarihi: 'ise_giris_tarihi',
  santiye_giris_tarihi: 'santiye_giris_tarihi',
  cikis_tarihi: 'cikis_tarihi',
  cikis_sebebi: 'cikis_sebebi',
  gunduz_gece_durumu: 'gunduz_gece',
  gunduz_gece: 'gunduz_gece',
  endirekt_direkt: 'endirekt_direkt',
  yaka: 'endirekt_direkt',
  proje_adi: 'proje_adi',
  proje: 'proje_adi',
  bolge: 'region',
  region: 'region',
};

const REVERSE_HEADER_MAP: Record<string, string> = {};
for (const [k, v] of Object.entries(COLUMN_HEADER_MAP)) {
  REVERSE_HEADER_MAP[v] = k;
  REVERSE_HEADER_MAP[toSnakeCase(v)] = k;
}

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

function isDateField(key: string, header: string): boolean {
  const s = toSnakeCase(key);
  if (DATE_FIELDS.has(key) || DATE_FIELDS.has(s)) return true;
  return isDateLikeColumnName(header, key);
}

function resolveCellValue(
  row: any,
  parsedJson: Record<string, any>,
  colKey: string
): { val: any; header: string } {
  const snake = toSnakeCase(colKey);
  const mappedSnake = COLUMN_ALIASES[snake] || snake;
  const mappedKeyFromHeader = REVERSE_HEADER_MAP[colKey] || REVERSE_HEADER_MAP[snake];

  // Determine cleanest header label
  let headerName = COLUMN_HEADER_MAP[colKey] || COLUMN_HEADER_MAP[mappedSnake] || colKey;
  if (!headerName || headerName.includes('_')) {
    headerName = colKey;
  }

  // 1. Direct row key
  if (row[colKey] !== undefined && row[colKey] !== null && String(row[colKey]).trim() !== '') {
    return { val: row[colKey], header: headerName };
  }
  // 2. Mapped snake column in SQL row
  if (row[mappedSnake] !== undefined && row[mappedSnake] !== null && String(row[mappedSnake]).trim() !== '') {
    return { val: row[mappedSnake], header: headerName };
  }
  // 3. Reverse header mapped key in SQL row
  if (
    mappedKeyFromHeader &&
    row[mappedKeyFromHeader] !== undefined &&
    row[mappedKeyFromHeader] !== null &&
    String(row[mappedKeyFromHeader]).trim() !== ''
  ) {
    return { val: row[mappedKeyFromHeader], header: headerName };
  }
  // 4. Exact key in parsed JSON
  if (parsedJson[colKey] !== undefined && parsedJson[colKey] !== null && String(parsedJson[colKey]).trim() !== '') {
    return { val: parsedJson[colKey], header: headerName };
  }
  // 5. Header name in parsed JSON
  if (headerName && parsedJson[headerName] !== undefined && parsedJson[headerName] !== null && String(parsedJson[headerName]).trim() !== '') {
    return { val: parsedJson[headerName], header: headerName };
  }
  // 6. Case-insensitive / snake-case search in parsed JSON
  const lowerKey = colKey.toLowerCase();
  for (const [jk, jv] of Object.entries(parsedJson)) {
    if (jk.toLowerCase() === lowerKey || toSnakeCase(jk) === snake) {
      if (jv !== undefined && jv !== null && String(jv).trim() !== '') {
        return { val: jv, header: headerName };
      }
    }
  }

  return { val: null, header: headerName };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

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
    const movementType = searchParams.get('movementType') || '';
    const period = searchParams.get('period') || '';
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
    ensureInterSiteTransfersSynced(db);
    const conditions: string[] = [];
    const params: any[] = [];
    const inDateExpr = buildNormalizedDateSql('ise_giris_tarihi');
    const outDateExpr = buildNormalizedDateSql('cikis_tarihi');

    // Status or Movement/Period filter (excludes inter-site transfers from entries & exits; supports separate 'transfer')
    if (movementType === 'entry' || movementType === 'exit' || movementType === 'transfer') {
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
    } else if (status !== 'all') {
      conditions.push('genel_durum = ?');
      params.push(status);
    }

    // Dropdown filters
    if (region !== 'all') {
      const regCond = buildEffectiveRegionSqlCondition(region);
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

    const selectCols = `id, sira_no, sicil_no, rhi_id, saren_no, genel_durum, guncel_durum, region, proje_adi, calisma_lokasyon, kategori, firma, departman, uyruk, adi, soyadi, baba_adi, ad_soyad, tam_adi_kiril, gorevi, rhi_gorevi, sorumlu_kisi, grup_sefi, endirekt_direkt, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi, cikis_sebebi, gunduz_gece, propusk_no, propusk_bitis_tarihi, cinsiyet, dogum_tarihi, pasaport_no, pasaport_gecerlilik, tc_kimlik_no, dogum_yeri, migrasyon_no, inn_no, vize_no, vize_bitis_tarihi, patent_alis_tarihi, patent_bitis_tarihi, telefon_no, email, kamp_no, oda_no, all_data_json`;

    const dataSql = `
      SELECT ${selectCols}
      FROM personnel
      ${whereClause}
      ORDER BY ${orderColumn} ${sortOrder}
      LIMIT 50000
    `;

    const dataStmt = db.prepare(dataSql);
    const rows = dataStmt.all(...params) as any[];

    let transferMetaById = new Map<
      number,
      { from_site: string; to_site: string; original_hire_date: string; transfer_date: string }
    >();
    if (movementType === 'transfer' && rows.length > 0) {
      const rowIds = rows.map((r) => Number(r.id)).filter((n) => !isNaN(n));
      if (rowIds.length > 0) {
        const placeholders = rowIds.map(() => '?').join(',');
        const trRows = db
          .prepare(
            `SELECT personnel_id, from_site, to_site, original_hire_date, transfer_date
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
    // Parse requested custom columns if provided
    const requestedCols = customColsParam
      ? customColsParam.split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    const excelRows = rows.map((r) => {
      let parsedJson: Record<string, any> = {};
      if (r.all_data_json) {
        try {
          const rawObj =
            typeof r.all_data_json === 'string' ? JSON.parse(r.all_data_json) : r.all_data_json;
          parsedJson = stripOfficialSalaryFromRaw(rawObj);
        } catch {
          parsedJson = {};
        }
      }

      const rowObj: Record<string, any> = {};
      const trMeta = transferMetaById.get(Number(r.id));
      if (trMeta) {
        rowObj['Eski Şantiye'] = trMeta.from_site || '-';
        rowObj['Yeni Şantiye'] = trMeta.to_site || r.region || '-';
        rowObj['Şantiye Transfer Tarihi'] = formatDateVal(trMeta.transfer_date || r.ise_giris_tarihi);
        rowObj['İlk Sözleşme Tarihi'] = formatDateVal(trMeta.original_hire_date);
      }

      const zupMatch = matchZupDatesForPersonnelRow(zupIndex, r);

      if (requestedCols.length > 0) {
        for (const colKey of requestedCols) {
          if (isOfficialSalaryColumn(colKey)) {
            continue;
          }
          const { val, header } = resolveCellValue(r, parsedJson, colKey);
          if (isOfficialSalaryColumn(header)) {
            continue;
          }
          rowObj[header] = isDateField(colKey, header)
            ? formatDateVal(val)
            : val !== undefined && val !== null && String(val).trim() !== ''
            ? val
            : '-';
        }
      } else {
        // Standard full columns
        for (const [colKey, headerName] of Object.entries(COLUMN_HEADER_MAP)) {
          if (isOfficialSalaryColumn(colKey) || isOfficialSalaryColumn(headerName)) {
            continue;
          }
          const { val } = resolveCellValue(r, parsedJson, colKey);
          rowObj[headerName] = isDateField(colKey, headerName)
            ? formatDateVal(val)
            : val !== undefined && val !== null && String(val).trim() !== ''
            ? val
            : '-';

          if (colKey === 'cikis_tarihi') {
            rowObj['1C ZUP Giriş Tarihi'] = zupMatch.zup_hire_date;
            rowObj['1C ZUP Çıkış Tarihi'] = zupMatch.zup_dismissal_date;
          }
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
