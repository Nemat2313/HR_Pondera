import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Baseline reference date for the dashboard
const REFERENCE_DATE_STR = '2026-10-08';
const REFERENCE_DATE = new Date(REFERENCE_DATE_STR);

// Helper to parse date from string or Excel serial number
function parseToDate(val: any): Date | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }
  const str = String(val).trim();
  if (!str || str === '-' || str === 'Yok') return null;

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        if (!isNaN(d.getTime())) return d;
      } else {
        const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(d.getTime())) return d;
      }
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Format date to DD.MM.YYYY
function formatDateDisplay(val: any): string {
  if (!val) return '-';
  const d = parseToDate(val);
  if (!d) return String(val).trim() || '-';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

// Helper to calculate difference in days
function getDaysDiff(dateVal: any): number | null {
  const d = parseToDate(dateVal);
  if (!d) return null;
  const diffTime = d.getTime() - REFERENCE_DATE.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Categorize days into status bracket
function categorizeDays(days: number | null): 'missing' | 'expired' | 'critical' | 'warning' | 'normal' | 'valid' {
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  if (days <= 15) return 'critical';
  if (days <= 30) return 'warning';
  if (days <= 60) return 'normal';
  return 'valid';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterRegion = searchParams.get('region') || 'all';
    const filterProject = searchParams.get('project') || 'all';
    const filterDocType = searchParams.get('docType') || 'all';
    const filterStatus = searchParams.get('status') || 'all';
    const filterGuncelDurum = searchParams.get('guncelDurum') || 'all';
    const filterSearch = searchParams.get('search')?.trim().toLowerCase() || '';

    // RLS Scope
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType = headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal = headerScopeVal || searchParams.get('userScopeValue') || 'all';

    const db = getDb();

    // Query personnel according to HR Director's specification:
    // Evrak süre kontrolü ekli resimdeki güncel durumlulara göre (Mevcut, İş Gezisi, Mazeret İzni, Süresiz İzin, Ücretsiz İzin, Yıllık İzin)
    const COMPLIANCE_GUNCEL_DURUMLAR = [
      'Mevcut',
      'Is Gezisi',
      'İş Gezisi',
      'Mazeret Izni',
      'Mazeret İzni',
      'Suresiz izin',
      'Suresiz Izin',
      'Süresiz İzin',
      'Süresiz izin',
      'Ucretsiz Izin',
      'Ücretsiz İzin',
      'Yillik Izin',
      'Yıllık İzin',
    ];

    const conditions: string[] = [];
    const params: any[] = [];

    if (filterGuncelDurum !== 'all') {
      conditions.push('guncel_durum = ?');
      params.push(filterGuncelDurum);
    } else {
      const placeholders = COMPLIANCE_GUNCEL_DURUMLAR.map(() => '?').join(', ');
      conditions.push(`guncel_durum IN (${placeholders})`);
      params.push(...COMPLIANCE_GUNCEL_DURUMLAR);
    }

    if (scopeType === 'region' && scopeVal !== 'all') {
      conditions.push('region = ?');
      params.push(scopeVal);
    } else if (scopeType === 'project' && scopeVal !== 'all') {
      conditions.push('proje_adi = ?');
      params.push(scopeVal);
    } else {
      if (filterRegion !== 'all') {
        conditions.push('region = ?');
        params.push(filterRegion);
      }
      if (filterProject !== 'all') {
        conditions.push('proje_adi = ?');
        params.push(filterProject);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const query = db.prepare(`
      SELECT 
        id, sira_no, sicil_no, rhi_id, ad_soyad, gorevi, departman, region, proje_adi, uyruk, genel_durum, guncel_durum,
        pasaport_no, pasaport_gecerlilik,
        vize_no, vize_bitis_tarihi,
        propusk_no, propusk_bitis_tarihi,
        patent_alis_tarihi, patent_bitis_tarihi,
        migrasyon_no, inn_no, tc_kimlik_no,
        all_data_json
      FROM personnel
      ${whereClause}
      ORDER BY id ASC
    `);

    const rows = query.all(...params) as any[];

    // Document definitions to analyze
    const docDefinitions = [
      { id: 'pasaport', label: 'Pasaport', dateKey: 'pasaport_gecerlilik', noKey: 'pasaport_no' },
      { id: 'vize', label: 'Vize', dateKey: 'vize_bitis_tarihi', noKey: 'vize_no' },
      { id: 'propusk', label: 'Propusk (Saha Kartı)', dateKey: 'propusk_bitis_tarihi', noKey: 'propusk_no' },
      { id: 'patent', label: 'Patent / Çalışma İzni', dateKey: 'patent_bitis_tarihi', noKey: 'patent_alis_tarihi' },
      { id: 'registrasyon', label: 'Registrasyon / Migrasyon', jsonDateKey: 'Registrasyon Bitiş Tarihi', noKey: 'migrasyon_no' },
      { id: 'daktilo', label: 'Daktiloskopiya (Parmak İzi)', jsonDateKey: 'Daktiloskopiya Bitis Tarihi', jsonNoKey: 'Daktiloskopiya Alış Tarihi' },
      { id: 'dms', label: 'Sağlık / DMS Sigorta', jsonDateKey: 'DMS Bitiş Tarihi', jsonNoKey: 'DMS Başvuru Tarihi' },
      { id: 'dil', label: 'Rusça Dil Sertifikası', jsonDateKey: 'Dil Sertifikası Bitiş Tarihi', jsonNoKey: 'Dil Sertifikası Geliş Tarihi' },
    ];

    // Aggregations
    const docStats: Record<string, {
      id: string;
      label: string;
      totalChecked: number;
      validCount: number;
      normalCount: number; // 31-60 gün
      warningCount: number; // 16-30 gün
      criticalCount: number; // 0-15 gün
      expiredCount: number;
      missingCount: number;
    }> = {};

    docDefinitions.forEach((d) => {
      docStats[d.id] = {
        id: d.id,
        label: d.label,
        totalChecked: 0,
        validCount: 0,
        normalCount: 0,
        warningCount: 0,
        criticalCount: 0,
        expiredCount: 0,
        missingCount: 0,
      };
    });

    // Detailed compliance items for grid
    const complianceItems: any[] = [];
    let totalDocsCount = 0;
    let totalExpired = 0;
    let totalCritical = 0;
    let totalWarning = 0;
    let totalMissing = 0;
    let totalValid = 0;

    // Region & Uyruk breakdown counters
    const regionBreakdown: Record<string, { region: string; total: number; expired: number; critical: number; missing: number; compliant: number }> = {};
    const uyrukBreakdown: Record<string, { uyruk: string; total: number; expired: number; critical: number; missing: number }> = {};

    for (const r of rows) {
      let rawJson: any = {};
      if (r.all_data_json) {
        try {
          rawJson = JSON.parse(r.all_data_json);
        } catch {}
      }

      // Region breakdown tracker
      const reg = r.region || 'Bilinmiyor';
      if (!regionBreakdown[reg]) {
        regionBreakdown[reg] = { region: reg, total: 0, expired: 0, critical: 0, missing: 0, compliant: 0 };
      }
      regionBreakdown[reg].total++;

      // Uyruk breakdown tracker
      const u = r.uyruk || 'Diğer';
      if (!uyrukBreakdown[u]) {
        uyrukBreakdown[u] = { uyruk: u, total: 0, expired: 0, critical: 0, missing: 0 };
      }
      uyrukBreakdown[u].total++;

      const uyrukUpper = (r.uyruk || '').trim().toUpperCase();
      const regionTrim = (r.region || '').trim();
      const kartTuru = (rawJson['Çalışma Kart Türü'] || '').toUpperCase();

      const isRf = uyrukUpper === 'RUSYA' || uyrukUpper === 'BEYAZ RUSYA' || kartTuru === 'MUAF' || kartTuru === 'РФ' || uyrukUpper.includes('RUS');
      const isEaes = ['KIRGIZISTAN', 'KAZAKISTAN', 'ERMENISTAN'].includes(uyrukUpper) || kartTuru.includes('ЕАЭС') || kartTuru.includes('EAES');
      const isVks = kartTuru.includes('ВКС') || kartTuru.includes('VKS');
      const isPatent = kartTuru.includes('ПАТЕНТ') || kartTuru.includes('PATENT') || (['OZBEKISTAN', 'TACIKISTAN', 'AZERBAYCAN'].includes(uyrukUpper) && !isVks && !isRf);
      const isVnjRvp = ['ВНЖ', 'РВП', 'VNJ', 'RVP'].some((x: string) => kartTuru.includes(x));
      const isQuotaRnr = ['КВОТА', 'KOTA', 'РНР', 'RNR'].some((x: string) => kartTuru.includes(x));

      for (const d of docDefinitions) {
        // Determine whether this document type is legally required for this individual
        let isApplicable = false;

        if (d.id === 'pasaport') {
          isApplicable = true;
        } else if (d.id === 'propusk') {
          // Required on physical construction sites (excluding Moscow / Central Office and Ust Luga where propusk isn't tracked in this system)
          if (regionTrim !== 'Merkez Ofis' && regionTrim !== 'Moskova' && regionTrim !== 'Ust Luga') {
            isApplicable = true;
          }
        } else if (!isRf) {
          if (d.id === 'registrasyon' || d.id === 'dms' || d.id === 'daktilo') {
            isApplicable = true;
          } else if (d.id === 'patent') {
            // Patent or Work Permit Card (VKS / Quota / Patent)
            if (!isVnjRvp && !isEaes) {
              isApplicable = true;
            }
          } else if (d.id === 'vize') {
            // Visas are required for visa countries (Turkey, India, Bangladesh, China, Turkmenistan, etc. or VKS / Quota)
            if (!isVnjRvp && !isEaes && !isPatent) {
              if (isVks || isQuotaRnr || ['HINDISTAN', 'TURKIYE', 'BANGLADES', 'CIN', 'TURKMENISTAN', 'PAKISTAN'].includes(uyrukUpper)) {
                isApplicable = true;
              }
            }
          } else if (d.id === 'dil') {
            // Dil sertifikası: Only applicable for Patent or Quota workers who have a certificate record
            if ((isPatent || isQuotaRnr) && rawJson['Dil Sertifikası Bitiş Tarihi']) {
              isApplicable = true;
            }
          }
        }

        if (!isApplicable) {
          continue; // Muaf / Kanunen zorunlu değil
        }

        // Document date, number and status resolution
        let dateVal: any = null;
        let docNo: any = null;
        let days: number | null = null;
        let status: 'missing' | 'expired' | 'critical' | 'warning' | 'normal' | 'valid' = 'missing';
        let expiryDateDisplay: string = '-';

        if (d.id === 'pasaport') {
          docNo = r.pasaport_no || '-';
          if (isRf) {
            // Russian internal passport is lifelong in the system
            status = 'valid';
            days = null;
            expiryDateDisplay = 'Süresiz (Бессрочно)';
          } else {
            dateVal = r.pasaport_gecerlilik;
            days = getDaysDiff(dateVal);
            status = categorizeDays(days);
            expiryDateDisplay = formatDateDisplay(dateVal);
          }
        } else if (d.id === 'vize') {
          docNo = r.vize_no || '-';
          dateVal = r.vize_bitis_tarihi;
          days = getDaysDiff(dateVal);
          status = categorizeDays(days);
          expiryDateDisplay = formatDateDisplay(dateVal);
        } else if (d.id === 'propusk') {
          docNo = r.propusk_no || '-';
          dateVal = r.propusk_bitis_tarihi;
          days = getDaysDiff(dateVal);
          status = categorizeDays(days);
          expiryDateDisplay = formatDateDisplay(dateVal);
        } else if (d.id === 'patent') {
          docNo = r.patent_alis_tarihi || rawJson['Çalışma Kart No'] || rawJson['Patent No'] || '-';
          dateVal = r.patent_bitis_tarihi || rawJson['Çalışma Kartı Bitiş Tarihi'];
          days = getDaysDiff(dateVal);
          status = categorizeDays(days);
          expiryDateDisplay = formatDateDisplay(dateVal);
        } else if (d.id === 'registrasyon') {
          docNo = r.migrasyon_no || rawJson['Registrasyon No'] || '-';
          dateVal = rawJson['Registrasyon Bitiş Tarihi'];
          days = getDaysDiff(dateVal);
          status = categorizeDays(days);
          expiryDateDisplay = formatDateDisplay(dateVal);
        } else if (d.id === 'dms') {
          docNo = rawJson['DMS Poliçe No'] || rawJson['DMS Başvuru Tarihi'] || '-';
          dateVal = rawJson['DMS Bitiş Tarihi'];
          days = getDaysDiff(dateVal);
          status = categorizeDays(days);
          expiryDateDisplay = formatDateDisplay(dateVal);
        } else if (d.id === 'daktilo') {
          docNo = rawJson['Daktiloskopiya Seri No'] || rawJson['Daktiloskopiya Form Seri No'] || rawJson['Daktiloskopiya Alış Tarihi'] || '-';
          dateVal = rawJson['Daktiloskopiya Bitis Tarihi'];
          const hasRecord = Boolean(rawJson['Daktiloskopiya Seri No'] || rawJson['Daktiloskopiya Alış Tarihi'] || rawJson['Daktiloskopiya Başlangıç Tarihi']);
          if (dateVal) {
            days = getDaysDiff(dateVal);
            status = categorizeDays(days);
            expiryDateDisplay = formatDateDisplay(dateVal);
          } else if (hasRecord) {
            status = 'valid';
            days = null;
            expiryDateDisplay = 'Süresiz (Бессрочно)';
          } else {
            status = 'missing';
            expiryDateDisplay = '-';
          }
        } else if (d.id === 'dil') {
          docNo = rawJson['Dil Sertifikası Referans No'] || rawJson['Dil Sertifikası Barkod No'] || '-';
          dateVal = rawJson['Dil Sertifikası Bitiş Tarihi'];
          days = getDaysDiff(dateVal);
          status = categorizeDays(days);
          expiryDateDisplay = formatDateDisplay(dateVal);
        }

        docStats[d.id].totalChecked++;
        totalDocsCount++;

        if (status === 'expired') {
          docStats[d.id].expiredCount++;
          totalExpired++;
          regionBreakdown[reg].expired++;
          uyrukBreakdown[u].expired++;
        } else if (status === 'critical') {
          docStats[d.id].criticalCount++;
          totalCritical++;
          regionBreakdown[reg].critical++;
          uyrukBreakdown[u].critical++;
        } else if (status === 'warning') {
          docStats[d.id].warningCount++;
          totalWarning++;
        } else if (status === 'normal') {
          docStats[d.id].normalCount++;
          totalValid++;
          regionBreakdown[reg].compliant++;
        } else if (status === 'valid') {
          docStats[d.id].validCount++;
          totalValid++;
          regionBreakdown[reg].compliant++;
        } else {
          docStats[d.id].missingCount++;
          totalMissing++;
          regionBreakdown[reg].missing++;
          uyrukBreakdown[u].missing++;
        }

        // Add to item list if expired, critical, warning, or missing, or if requested
        complianceItems.push({
          personnelId: r.id,
          sicilNo: r.sicil_no || '-',
          adSoyad: r.ad_soyad || '-',
          gorevi: r.gorevi || '-',
          departman: r.departman || '-',
          region: r.region || '-',
          projeAdi: r.proje_adi || '-',
          uyruk: r.uyruk || '-',
          guncelDurum: r.guncel_durum || 'Mevcut',
          docType: d.id,
          docLabel: d.label,
          docNo: docNo || '-',
          expiryDate: expiryDateDisplay,
          remainingDays: days,
          status, // 'expired' | 'critical' | 'warning' | 'normal' | 'valid' | 'missing'
        });
      }
    }

    // Filter items according to request params
    let filteredItems = complianceItems;
    if (filterDocType !== 'all') {
      filteredItems = filteredItems.filter((i) => i.docType === filterDocType);
    }
    if (filterStatus !== 'all') {
      filteredItems = filteredItems.filter((i) => i.status === filterStatus);
    }
    if (filterSearch) {
      filteredItems = filteredItems.filter(
        (i) =>
          i.adSoyad.toLowerCase().includes(filterSearch) ||
          i.sicilNo.toLowerCase().includes(filterSearch) ||
          i.docLabel.toLowerCase().includes(filterSearch) ||
          i.region.toLowerCase().includes(filterSearch) ||
          i.projeAdi.toLowerCase().includes(filterSearch)
      );
    }

    // Sort: expired first, then critical, then warning, then missing, then valid
    const statusOrder: Record<string, number> = {
      expired: 1,
      critical: 2,
      warning: 3,
      missing: 4,
      normal: 5,
      valid: 6,
    };
    filteredItems.sort((a, b) => {
      const diff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      if (diff !== 0) return diff;
      if (a.remainingDays !== null && b.remainingDays !== null) {
        return a.remainingDays - b.remainingDays;
      }
      return 0;
    });

    const complianceRate = totalDocsCount > 0 ? Math.round((totalValid / totalDocsCount) * 100) : 0;

    return NextResponse.json({
      success: true,
      referenceDate: REFERENCE_DATE_STR,
      totalActivePersonnel: rows.length,
      kpis: {
        totalDocsChecked: totalDocsCount,
        totalValid,
        totalWarning, // 16-30 gün
        totalCritical, // 0-15 gün
        totalExpired,
        totalMissing,
        complianceRate, // %
      },
      docStats: Object.values(docStats),
      regionBreakdown: Object.values(regionBreakdown).sort((a, b) => b.expired + b.critical - (a.expired + a.critical)),
      uyrukBreakdown: Object.values(uyrukBreakdown).sort((a, b) => b.total - a.total).slice(0, 8),
      items: filteredItems, // Unlimited - full list for export and client pagination
      totalFilteredItems: filteredItems.length,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Evrak analizi verisi oluşturulurken bir hata oluştu.' },
      { status: 500 }
    );
  }
}
