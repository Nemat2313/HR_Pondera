import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFERENCE_DATE_STR = '2026-10-08';
const REFERENCE_DATE = new Date(REFERENCE_DATE_STR);

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

function formatDateDisplay(val: any): string {
  if (!val) return '-';
  const d = parseToDate(val);
  if (!d) return String(val).trim() || '-';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterRegion = searchParams.get('region') || 'all';
    const filterProject = searchParams.get('project') || 'all';
    const filterStatus = searchParams.get('status') || 'all'; // e.g. Patent Bekliyor
    const filterSeverity = searchParams.get('severity') || 'all'; // 'critical' | 'warning' | 'normal' | 'unknown'
    const filterSearch = searchParams.get('search')?.trim().toLowerCase() || '';

    // RLS Scope
    const headerScopeType = request.headers.get('x-user-scope-type');
    const headerScopeVal = request.headers.get('x-user-scope-value');
    const scopeType = headerScopeType || searchParams.get('userScopeType') || 'all';
    const scopeVal = headerScopeVal || searchParams.get('userScopeValue') || 'all';

    const db = getDb();

    // Query system info for data freshness date
    let refDate = REFERENCE_DATE;
    let refDateStr = REFERENCE_DATE_STR;
    try {
      const row = db.prepare("SELECT value FROM system_info WHERE key = 'data_freshness'").get() as any;
      if (row?.value) {
        const parsed = parseToDate(row.value);
        if (parsed) {
          refDate = parsed;
          refDateStr = formatDateDisplay(row.value);
        }
      }
    } catch {}

    const STANDBY_STATUSES = [
      'Patent Bekliyor',
      'Calisma Kart Bekliyor',
      'Propusk Bekliyor',
      'Propusk Calismiyor',
    ];

    const placeholders = STANDBY_STATUSES.map(() => '?').join(', ');
    const conditions: string[] = [`guncel_durum IN (${placeholders})`];
    const params: any[] = [...STANDBY_STATUSES];

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

    if (filterStatus !== 'all') {
      conditions.push('guncel_durum = ?');
      params.push(filterStatus);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const query = db.prepare(`
      SELECT 
        id, sira_no, sicil_no, rhi_id, ad_soyad, gorevi, departman, region, proje_adi, uyruk,
        genel_durum, guncel_durum, ise_giris_tarihi, santiye_giris_tarihi,
        kamp_no, oda_no, telefon_no,
        all_data_json
      FROM personnel
      ${whereClause}
      ORDER BY id ASC
    `);

    const rows = query.all(...params) as any[];

    // Metrics aggregators
    let criticalCount = 0; // > 21 days (> 3 weeks)
    let warningCount = 0;  // 15 - 21 days (2 - 3 weeks)
    let normalCount = 0;   // <= 14 days (0 - 2 weeks)
    let unknownCount = 0;  // no entry date available
    let totalDaysSum = 0;
    let daysCount = 0;
    let maxDays = 0;

    const statusCounts: Record<string, number> = {};
    STANDBY_STATUSES.forEach((s) => (statusCounts[s] = 0));

    const regionCounts: Record<string, { region: string; total: number; critical: number; warning: number; normal: number }> = {};

    const items = rows.map((r: any) => {
      // Calculate waiting days: today - ise_giris_tarihi (or santiye_giris_tarihi)
      const entryDateRaw = r.ise_giris_tarihi || r.santiye_giris_tarihi;
      const parsedEntryDate = parseToDate(entryDateRaw);

      let waitingDays: number | null = null;
      let severity: 'critical' | 'warning' | 'normal' | 'unknown' = 'unknown';

      if (parsedEntryDate) {
        const diffMs = refDate.getTime() - parsedEntryDate.getTime();
        waitingDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        totalDaysSum += waitingDays;
        daysCount++;
        if (waitingDays > maxDays) maxDays = waitingDays;

        if (waitingDays > 21) {
          severity = 'critical';
          criticalCount++;
        } else if (waitingDays >= 15) {
          severity = 'warning';
          warningCount++;
        } else {
          severity = 'normal';
          normalCount++;
        }
      } else {
        unknownCount++;
      }

      // Status breakdown
      const gDurum = r.guncel_durum || 'Diğer';
      statusCounts[gDurum] = (statusCounts[gDurum] || 0) + 1;

      // Region breakdown
      const reg = r.region || 'Merkez';
      if (!regionCounts[reg]) {
        regionCounts[reg] = { region: reg, total: 0, critical: 0, warning: 0, normal: 0 };
      }
      regionCounts[reg].total++;
      if (severity === 'critical') regionCounts[reg].critical++;
      else if (severity === 'warning') regionCounts[reg].warning++;
      else if (severity === 'normal') regionCounts[reg].normal++;

      return {
        id: r.id,
        siraNo: r.sira_no || '-',
        sicilNo: r.sicil_no || '-',
        rhiId: r.rhi_id || '-',
        adSoyad: r.ad_soyad || '-',
        gorevi: r.gorevi || '-',
        departman: r.departman || '-',
        region: r.region || '-',
        projeAdi: r.proje_adi || '-',
        uyruk: r.uyruk || '-',
        guncelDurum: r.guncel_durum,
        iseGirisTarihi: formatDateDisplay(r.ise_giris_tarihi),
        santiyeGirisTarihi: formatDateDisplay(r.santiye_giris_tarihi),
        waitingDays,
        severity,
        kampNo: r.kamp_no || '-',
        odaNo: r.oda_no || '-',
        telefonNo: r.telefon_no || '-',
      };
    });

    // Apply severity filter
    let filteredItems = items;
    if (filterSeverity !== 'all') {
      filteredItems = filteredItems.filter((i: any) => i.severity === filterSeverity);
    }
    if (filterSearch) {
      filteredItems = filteredItems.filter(
        (i: any) =>
          i.adSoyad.toLowerCase().includes(filterSearch) ||
          i.sicilNo.toLowerCase().includes(filterSearch) ||
          i.region.toLowerCase().includes(filterSearch) ||
          i.projeAdi.toLowerCase().includes(filterSearch) ||
          i.gorevi.toLowerCase().includes(filterSearch)
      );
    }

    // Sort: critical first, then warning, then normal, then unknown; within group sort by waitingDays desc
    const severityOrder: Record<string, number> = {
      critical: 1,
      warning: 2,
      normal: 3,
      unknown: 4,
    };
    filteredItems.sort((a: any, b: any) => {
      const orderA = severityOrder[a.severity] || 99;
      const orderB = severityOrder[b.severity] || 99;
      if (orderA !== orderB) return orderA - orderB;
      if (a.waitingDays !== null && b.waitingDays !== null) {
        return b.waitingDays - a.waitingDays; // longest waiting first
      }
      return 0;
    });

    const averageDays = daysCount > 0 ? Math.round(totalDaysSum / daysCount) : 0;

    return NextResponse.json({
      success: true,
      referenceDate: refDateStr,
      kpis: {
        totalStandby: rows.length,
        criticalCount, // > 21 days (> 3 weeks)
        warningCount,  // 15 - 21 days (2-3 weeks)
        normalCount,   // <= 14 days (< 2 weeks)
        unknownCount,  // No date
        averageDays,
        maxDays,
      },
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      regionBreakdown: Object.values(regionCounts).sort((a, b) => b.critical - a.critical || b.total - a.total),
      items: filteredItems,
      totalFilteredItems: filteredItems.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: `Bekleme analizi oluşturulurken hata oluştu: ${String(err?.message || '')}` },
      { status: 500 }
    );
  }
}
