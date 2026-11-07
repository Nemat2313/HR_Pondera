'use client';

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Plane,
  Train,
  Bus,
  AlertTriangle,
  Building2,
  Award,
  Search,
  BarChart3,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import historicalSeedRaw from '@/data/historicalTicketAnalyticsSeed.json';

interface MonthlyRoutePoint {
  month: string;
  count: number;
  avgRub: number;
  minRub: number;
  maxRub: number;
}

interface RouteTrendItem {
  route: string;
  from: string;
  to: string;
  transport: string;
  count: number;
  pricedCount: number;
  totalRub: number;
  avgRub: number;
  minRub: number;
  maxRub: number;
  lastMonthAvgRub: number;
  momChangePct: number;
  overallChangePct: number;
  monthly: MonthlyRoutePoint[];
}

interface HistoricalSeed {
  sourceLabel: string;
  totalHistoricalRows: number;
  analyzedModernRows: number;
  totalSpendRub: number;
  transportBreakdown: Array<{
    type: string;
    label: string;
    count: number;
    totalRub: number;
    avgRub: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    count: number;
    flightCount: number;
    trainCount: number;
    busCount: number;
    totalRub: number;
    avgRub: number;
  }>;
  bySite: Array<{
    site: string;
    count: number;
    totalRub: number;
    avgRub: number;
  }>;
  byPurpose: Array<{
    purpose: string;
    count: number;
    totalRub: number;
    avgRub: number;
  }>;
  byAgent: Array<{
    agent: string;
    count: number;
    totalRub: number;
    avgRub: number;
  }>;
  byStatus: Array<{
    status: string;
    count: number;
    totalRub: number;
  }>;
  topRoutes: RouteTrendItem[];
}

const historicalSeed = historicalSeedRaw as HistoricalSeed;

export interface AnalyticsTicketInput {
  id: number;
  eba_doc_id?: string;
  transport_type?: string;
  passenger_name: string;
  sicil_no?: string;
  departure_city: string;
  arrival_city: string;
  departure_date: string;
  ticket_price: number;
  currency: string;
  region?: string;
  project_name?: string;
  flight_purpose?: string;
  ticket_agent?: string;
  ticket_status?: string;
  deduct_from_salary?: string;
}

interface TicketAnalyticsViewProps {
  tickets: AnalyticsTicketInput[];
}

function toRubAmount(price: number, currency?: string): number {
  const val = Number(price || 0);
  if (!val || val <= 0) return 0;
  const c = String(currency || 'RUB').toUpperCase();
  if (c === 'RUB') return val;
  if (c === 'USD') return val * 92;
  if (c === 'EUR') return val * 100;
  if (c === 'TRY') return val * 2.7;
  if (c === 'UZS') return val * 0.0072;
  return val;
}

function formatRubCompact(val: number): string {
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ₽`;
  }
  return `${Math.round(val).toLocaleString('tr-TR')} ₽`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = String(ym || '').split('-');
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return ym;
  return `${names[idx]} ${y.slice(2)}`;
}

function extractYearMonth(dateRaw?: string): string {
  const clean = String(dateRaw || '').trim().split(/\s+/)[0] || '';
  const ru = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ru) {
    return `${ru[3]}-${String(Number(ru[2])).padStart(2, '0')}`;
  }
  const iso = clean.match(/^(\d{4})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}`;
  }
  return '';
}

const SITE_BAR_COLORS = [
  '#0d9488',
  '#0284c7',
  '#4f46e5',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#2563eb',
  '#10b981',
  '#ea580c',
  '#6366f1',
  '#64748b',
];

export default function TicketAnalyticsView({ tickets }: TicketAnalyticsViewProps) {
  const [dataScope, setDataScope] = useState<'combined' | 'live_only'>('combined');
  const [routeSearch, setRouteSearch] = useState('');
  const [selectedRouteKey, setSelectedRouteKey] = useState<string>(
    () => historicalSeed.topRoutes?.[0]?.route || 'DELHI → MOSKOVA'
  );

  // Build live-only dataset when user toggles "Sadece Uygulamadaki Canlı Kayıtlar"
  const liveComputed = useMemo(() => {
    const routeMap = new Map<
      string,
      {
        from: string;
        to: string;
        transport: string;
        count: number;
        prices: number[];
        byMonth: Map<string, number[]>;
      }
    >();
    const siteMap = new Map<string, { count: number; totalRub: number }>();
    const purposeMap = new Map<string, { count: number; totalRub: number }>();
    const transportMap: Record<string, { count: number; totalRub: number }> = {
      flight: { count: 0, totalRub: 0 },
      train: { count: 0, totalRub: 0 },
      bus: { count: 0, totalRub: 0 },
    };

    let totalRub = 0;
    let pricedRows = 0;

    for (const t of tickets) {
      const rub = toRubAmount(t.ticket_price, t.currency);
      const tType =
        t.transport_type === 'bus' ? 'bus' : t.transport_type === 'train' ? 'train' : 'flight';
      transportMap[tType].count++;
      if (rub > 0) {
        transportMap[tType].totalRub += rub;
        totalRub += rub;
        pricedRows++;
      }

      const dep = String(t.departure_city || '').trim().toUpperCase();
      const arr = String(t.arrival_city || '').trim().toUpperCase();
      if (dep && arr) {
        const rk = `${dep} → ${arr}`;
        const cur = routeMap.get(rk) || {
          from: dep,
          to: arr,
          transport: tType,
          count: 0,
          prices: [],
          byMonth: new Map<string, number[]>(),
        };
        cur.count++;
        if (rub > 0) {
          cur.prices.push(rub);
          const ym = extractYearMonth(t.departure_date) || '2026-11';
          const mArr = cur.byMonth.get(ym) || [];
          mArr.push(rub);
          cur.byMonth.set(ym, mArr);
        }
        routeMap.set(rk, cur);
      }

      const rawSite = String(t.project_name || t.region || 'Belirtilmemiş').trim();
      const siteLabel =
        rawSite.toLowerCase() === 'kazan' ? 'Kazan (Merkez)' : rawSite || 'Belirtilmemiş';
      const sEntry = siteMap.get(siteLabel) || { count: 0, totalRub: 0 };
      sEntry.count++;
      sEntry.totalRub += rub;
      siteMap.set(siteLabel, sEntry);

      const purp = String(t.flight_purpose || 'Transfer').trim() || 'Transfer';
      const pEntry = purposeMap.get(purp) || { count: 0, totalRub: 0 };
      pEntry.count++;
      pEntry.totalRub += rub;
      purposeMap.set(purp, pEntry);
    }

    const topRoutes: RouteTrendItem[] = Array.from(routeMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30)
      .map(([route, info]) => {
        const sortedPrices = [...info.prices].sort((a, b) => a - b);
        const sum = sortedPrices.reduce((s, x) => s + x, 0);
        const avg = sortedPrices.length ? Math.round(sum / sortedPrices.length) : 0;
        const min = sortedPrices.length ? Math.round(sortedPrices[0]) : 0;
        const max = sortedPrices.length ? Math.round(sortedPrices[sortedPrices.length - 1]) : 0;
        const monthly = Array.from(info.byMonth.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, arr]) => ({
            month,
            count: arr.length,
            avgRub: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length),
            minRub: Math.round(Math.min(...arr)),
            maxRub: Math.round(Math.max(...arr)),
          }));
        const lastAvg = monthly.length ? monthly[monthly.length - 1].avgRub : avg;
        const prevAvg = monthly.length >= 2 ? monthly[monthly.length - 2].avgRub : lastAvg;
        const firstAvg = monthly.length ? monthly[0].avgRub : lastAvg;
        return {
          route,
          from: info.from,
          to: info.to,
          transport: info.transport,
          count: info.count,
          pricedCount: sortedPrices.length,
          totalRub: Math.round(sum),
          avgRub: avg,
          minRub: min,
          maxRub: max,
          lastMonthAvgRub: lastAvg,
          momChangePct: prevAvg > 0 ? Math.round(((lastAvg - prevAvg) / prevAvg) * 1000) / 10 : 0,
          overallChangePct:
            firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 1000) / 10 : 0,
          monthly,
        };
      });

    return {
      totalRows: tickets.length,
      pricedRows,
      totalSpendRub: Math.round(totalRub),
      transportBreakdown: [
        {
          type: 'flight',
          label: 'Uçak Bileti',
          count: transportMap.flight.count,
          totalRub: Math.round(transportMap.flight.totalRub),
          avgRub: transportMap.flight.count
            ? Math.round(transportMap.flight.totalRub / transportMap.flight.count)
            : 0,
        },
        {
          type: 'train',
          label: 'Tren (RZD)',
          count: transportMap.train.count,
          totalRub: Math.round(transportMap.train.totalRub),
          avgRub: transportMap.train.count
            ? Math.round(transportMap.train.totalRub / transportMap.train.count)
            : 0,
        },
        {
          type: 'bus',
          label: 'Otobüs / Kara Ulaşımı',
          count: transportMap.bus.count,
          totalRub: Math.round(transportMap.bus.totalRub),
          avgRub: transportMap.bus.count
            ? Math.round(transportMap.bus.totalRub / transportMap.bus.count)
            : 0,
        },
      ],
      bySite: Array.from(siteMap.entries())
        .map(([site, v]) => ({
          site,
          count: v.count,
          totalRub: Math.round(v.totalRub),
          avgRub: v.count ? Math.round(v.totalRub / v.count) : 0,
        }))
        .sort((a, b) => b.totalRub - a.totalRub),
      byPurpose: Array.from(purposeMap.entries())
        .map(([purpose, v]) => ({
          purpose,
          count: v.count,
          totalRub: Math.round(v.totalRub),
          avgRub: v.count ? Math.round(v.totalRub / v.count) : 0,
        }))
        .sort((a, b) => b.totalRub - a.totalRub),
      topRoutes,
    };
  }, [tickets]);

  // Merge newly added live non-seeded tickets (e.g. bus or AI-scanned tickets) into combined view
  const activeDataset = useMemo(() => {
    if (dataScope === 'live_only') {
      return {
        label: `Canlı Uygulama Tablosu (${liveComputed.totalRows} Kayıt)`,
        totalHistoricalRows: liveComputed.totalRows,
        analyzedModernRows: liveComputed.pricedRows,
        totalSpendRub: liveComputed.totalSpendRub,
        transportBreakdown: liveComputed.transportBreakdown,
        monthlyTrend: historicalSeed.monthlyTrend,
        bySite: liveComputed.bySite,
        byPurpose: liveComputed.byPurpose,
        byAgent: historicalSeed.byAgent,
        byStatus: historicalSeed.byStatus,
        topRoutes:
          liveComputed.topRoutes.length > 0 ? liveComputed.topRoutes : historicalSeed.topRoutes,
      };
    }

    // Add live non-seed tickets (without eba_doc_id) on top of historical archive
    const extraLive = tickets.filter((t) => !t.eba_doc_id);
    let extraRub = 0;
    let extraFlight = 0;
    let extraTrain = 0;
    let extraBus = 0;
    let extraBusRub = 0;
    for (const et of extraLive) {
      const r = toRubAmount(et.ticket_price, et.currency);
      extraRub += r;
      if (et.transport_type === 'bus') {
        extraBus++;
        extraBusRub += r;
      } else if (et.transport_type === 'train') {
        extraTrain++;
      } else {
        extraFlight++;
      }
    }

    const tb = historicalSeed.transportBreakdown.map((item) => {
      if (item.type === 'flight') {
        return { ...item, count: item.count + extraFlight };
      }
      if (item.type === 'train') {
        return { ...item, count: item.count + extraTrain };
      }
      if (item.type === 'bus') {
        const cnt = item.count + extraBus;
        const tot = item.totalRub + Math.round(extraBusRub);
        return {
          ...item,
          count: cnt,
          totalRub: tot,
          avgRub: cnt > 0 ? Math.round(tot / cnt) : 0,
        };
      }
      return item;
    });

    const normalizedSites = historicalSeed.bySite.map((s) => ({
      ...s,
      site: s.site.toLowerCase() === 'kazan' ? 'Kazan (Merkez)' : s.site,
    }));

    return {
      label: `${historicalSeed.sourceLabel} + Canlı Kayıtlar`,
      totalHistoricalRows: historicalSeed.totalHistoricalRows + extraLive.length,
      analyzedModernRows: historicalSeed.analyzedModernRows + extraLive.length,
      totalSpendRub: historicalSeed.totalSpendRub + Math.round(extraRub),
      transportBreakdown: tb,
      monthlyTrend: historicalSeed.monthlyTrend,
      bySite: normalizedSites,
      byPurpose: historicalSeed.byPurpose,
      byAgent: historicalSeed.byAgent,
      byStatus: historicalSeed.byStatus,
      topRoutes: historicalSeed.topRoutes,
    };
  }, [dataScope, liveComputed, tickets]);

  const filteredRoutes = useMemo(() => {
    const q = routeSearch.trim().toUpperCase();
    if (!q) return activeDataset.topRoutes;
    return activeDataset.topRoutes.filter((r) => r.route.toUpperCase().includes(q));
  }, [activeDataset.topRoutes, routeSearch]);

  const selectedRoute = useMemo(() => {
    return (
      activeDataset.topRoutes.find((r) => r.route === selectedRouteKey) ||
      filteredRoutes[0] ||
      activeDataset.topRoutes[0] ||
      null
    );
  }, [activeDataset.topRoutes, filteredRoutes, selectedRouteKey]);

  const selectedRouteChartData = useMemo(() => {
    if (!selectedRoute) return [];
    return selectedRoute.monthly.map((m) => ({
      ...m,
      monthLabel: formatMonthLabel(m.month),
    }));
  }, [selectedRoute]);

  const overallMonthlyChartData = useMemo(() => {
    return activeDataset.monthlyTrend.map((m) => ({
      ...m,
      monthLabel: formatMonthLabel(m.month),
      totalMillionRub: Math.round((m.totalRub / 1_000_000) * 100) / 100,
    }));
  }, [activeDataset.monthlyTrend]);

  // Waste / Penalty calculation (Cancelled + Changed + Missed)
  const wasteStats = useMemo(() => {
    let wasteCount = 0;
    let wasteRub = 0;
    let totalCount = 0;
    for (const s of activeDataset.byStatus) {
      totalCount += s.count;
      if (s.status !== 'Aktif') {
        wasteCount += s.count;
        wasteRub += s.totalRub;
      }
    }
    const pct =
      activeDataset.totalSpendRub > 0
        ? Math.round((wasteRub / activeDataset.totalSpendRub) * 1000) / 10
        : 0;
    return { wasteCount, wasteRub, pct, totalCount };
  }, [activeDataset.byStatus, activeDataset.totalSpendRub]);

  // Live Ticket Anomaly / Overprice Detector against Pondera Historical Route Benchmarks
  const liveAnomalies = useMemo(() => {
    const benchmarkMap = new Map<string, RouteTrendItem>();
    for (const r of historicalSeed.topRoutes) {
      benchmarkMap.set(`${r.from.toUpperCase()}→${r.to.toUpperCase()}`, r);
    }

    const flagged: Array<{
      ticket: AnalyticsTicketInput;
      rubPrice: number;
      benchmarkAvg: number;
      diffPct: number;
      routeLabel: string;
    }> = [];

    for (const t of tickets) {
      const rub = toRubAmount(t.ticket_price, t.currency);
      if (rub <= 0) continue;
      const dep = String(t.departure_city || '').trim().toUpperCase();
      const arr = String(t.arrival_city || '').trim().toUpperCase();
      const bm = benchmarkMap.get(`${dep}→${arr}`);
      if (bm && bm.avgRub > 0) {
        const diffPct = Math.round(((rub - bm.avgRub) / bm.avgRub) * 100);
        if (diffPct >= 20) {
          flagged.push({
            ticket: t,
            rubPrice: Math.round(rub),
            benchmarkAvg: bm.avgRub,
            diffPct,
            routeLabel: bm.route,
          });
        }
      }
    }

    return flagged.sort((a, b) => b.diffPct - a.diffPct).slice(0, 8);
  }, [tickets]);

  const flightInfo = activeDataset.transportBreakdown.find((x) => x.type === 'flight');
  const trainInfo = activeDataset.transportBreakdown.find((x) => x.type === 'train');
  const busInfo = activeDataset.transportBreakdown.find((x) => x.type === 'bus');

  return (
    <div className="space-y-5">
      {/* HEADER & DATA SCOPE BAR */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white border border-teal-500/30 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6 text-teal-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Pondera Bilet Fiyat & Güzergah Maliyet Analitiği
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold">
                {activeDataset.totalHistoricalRows.toLocaleString('tr-TR')} Bilet Analiz Edildi
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              En çok alınan güzergahların aylık fiyat değişimleri, min–maks fiyat makası, şantiye bazlı ulaşım maliyeti ve pahalı bilet sapma kontrolü
            </p>
          </div>
        </div>

        <div className="flex items-center rounded-xl bg-slate-950/80 p-1 border border-slate-700 text-xs self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setDataScope('combined')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              dataScope === 'combined'
                ? 'bg-teal-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            📚 Tüm Pondera Arşivi + Canlı ({(historicalSeed.totalHistoricalRows).toLocaleString('tr-TR')}+)
          </button>
          <button
            type="button"
            onClick={() => setDataScope('live_only')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              dataScope === 'live_only'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            ⚡ Sadece Canlı Tablo ({tickets.length})
          </button>
        </div>
      </div>

      {/* 4 EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              TOPLAM ULAŞIM HARCAMASI
            </span>
            <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1.5">
            {formatRubCompact(activeDataset.totalSpendRub)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Fiyatlı kayıt: <b>{activeDataset.analyzedModernRows.toLocaleString('tr-TR')}</b> • Ort. bilet:{' '}
            <b>
              {activeDataset.analyzedModernRows > 0
                ? Math.round(
                    activeDataset.totalSpendRub / activeDataset.analyzedModernRows
                  ).toLocaleString('tr-TR')
                : 0}{' '}
              ₽
            </b>
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              UÇAK • TREN • OTOBÜS ORTALAMA
            </span>
            <Plane className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <div>
              <span className="text-[10px] text-sky-600 dark:text-sky-400 font-bold block">
                ✈️ UÇAK ({(flightInfo?.count || 0).toLocaleString('tr-TR')})
              </span>
              <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                {(flightInfo?.avgRub || 0).toLocaleString('tr-TR')} ₽
              </span>
            </div>
            <div className="border-l border-slate-200 dark:border-slate-800 pl-3">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">
                🚆 TREN ({(trainInfo?.count || 0).toLocaleString('tr-TR')})
              </span>
              <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                {(trainInfo?.avgRub || 0).toLocaleString('tr-TR')} ₽
              </span>
            </div>
            {(busInfo?.count || 0) > 0 && (
              <div className="border-l border-slate-200 dark:border-slate-800 pl-3">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">
                  🚌 OTOBÜS ({busInfo?.count})
                </span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {(busInfo?.avgRub || 0).toLocaleString('tr-TR')} ₽
                </span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Kısa mesafede RZD Tren kullanımı bilet başına ~%84 tasarruf sağlıyor
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[200px]">
              SEÇİLİ GÜZERGAH: {selectedRoute?.route || '-'}
            </span>
            {selectedRoute && selectedRoute.momChangePct <= 0 ? (
              <TrendingDown className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingUp className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {(selectedRoute?.avgRub || 0).toLocaleString('tr-TR')} ₽
            </span>
            {selectedRoute && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  selectedRoute.momChangePct <= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                {selectedRoute.momChangePct > 0 ? '+' : ''}
                {selectedRoute.momChangePct}% (Son Ay)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Min: <b>{(selectedRoute?.minRub || 0).toLocaleString('tr-TR')} ₽</b> • Maks:{' '}
            <b>{(selectedRoute?.maxRub || 0).toLocaleString('tr-TR')} ₽</b> ({selectedRoute?.count || 0} bilet)
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              İPTAL / DEĞİŞİKLİK / KAÇIRMA ETKİSİ
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-300 mt-1.5">
            {formatRubCompact(wasteStats.wasteRub)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Toplam harcamanın <b>%{wasteStats.pct}</b>&apos;i ({wasteStats.wasteCount.toLocaleString('tr-TR')} bilet: Cancelled / Changed / Missed)
          </p>
        </div>
      </div>

      {/* SECTION 1: INTERACTIVE ROUTE PRICE EVOLUTION EXPLORER */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>En Çok Alınan Güzergahlara Göre Aylık Bilet Fiyat Değişimi (Min • Ortalama • Maksimum)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Güzergah seçerek yıllar ve aylar içindeki ortalama bilet maliyeti, en ucuz/en pahalı alım makası ve bilet adedi değişimini inceleyin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                placeholder="Güzergah filtrele (Kazan, Moskova...)"
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white w-52 focus:outline-none focus:border-teal-500"
              />
            </div>

            <select
              value={selectedRoute?.route || ''}
              onChange={(e) => setSelectedRouteKey(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-300 dark:border-teal-800 text-xs font-bold text-teal-900 dark:text-teal-200"
            >
              {filteredRoutes.map((r, i) => (
                <option key={r.route} value={r.route}>
                  #{i + 1} {r.route} ({r.count} bilet • Ort. {r.avgRub.toLocaleString('tr-TR')} ₽)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Top-10 Route Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {activeDataset.topRoutes.slice(0, 10).map((r) => {
            const active = selectedRoute?.route === r.route;
            return (
              <button
                key={r.route}
                type="button"
                onClick={() => setSelectedRouteKey(r.route)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                }`}
              >
                {r.transport === 'train' ? (
                  <Train className="w-3 h-3 opacity-80" />
                ) : r.transport === 'bus' ? (
                  <Bus className="w-3 h-3 opacity-80" />
                ) : (
                  <Plane className="w-3 h-3 opacity-80" />
                )}
                <span>{r.route}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {r.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Chart + Route Insight Card */}
        {selectedRoute && (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">
            <div className="xl:col-span-3 h-[330px] p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={selectedRouteChartData} margin={{ top: 10, right: 18, left: 6, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    yAxisId="price"
                    tick={{ fontSize: 11, fill: '#0f766e' }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k ₽`}
                  />
                  <YAxis
                    yAxisId="cnt"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#6366f1' }}
                    tickFormatter={(v) => `${v} ad.`}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name.includes('Adet')) return [`${value} Bilet`, name];
                      return [`${Number(value || 0).toLocaleString('tr-TR')} ₽`, name];
                    }}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar
                    yAxisId="cnt"
                    dataKey="count"
                    name="Aylık Bilet Adedi"
                    fill="#818cf8"
                    fillOpacity={0.35}
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                  />
                  <Area
                    yAxisId="price"
                    type="monotone"
                    dataKey="maxRub"
                    name="Maksimum Fiyat (₽)"
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    fill="#fda4af"
                    fillOpacity={0.12}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="avgRub"
                    name="Ortalama Bilet Fiyatı (₽)"
                    stroke="#0d9488"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#0d9488' }}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="minRub"
                    name="En Uygun / Erken Alım (₽)"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={{ r: 3, fill: '#10b981' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Selected Route Deep Summary */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-teal-50/80 to-slate-50 dark:from-teal-950/30 dark:to-slate-900 border border-teal-200/70 dark:border-teal-900/50 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  GÜZERGAH ÖZET KARNESİ
                </span>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {selectedRoute.route}
                </h4>
                <p className="text-[11px] text-slate-500">
                  Toplam <b>{selectedRoute.count.toLocaleString('tr-TR')}</b> bilet •{' '}
                  <b>{formatRubCompact(selectedRoute.totalRub)}</b> hacim
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/70 dark:border-slate-800">
                  <span className="text-slate-500">Genel Ortalama:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedRoute.avgRub.toLocaleString('tr-TR')} ₽
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/70 dark:border-slate-800">
                  <span className="text-slate-500">Son Ay Ortalaması:</span>
                  <span className="font-bold text-teal-700 dark:text-teal-300">
                    {selectedRoute.lastMonthAvgRub.toLocaleString('tr-TR')} ₽
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-200/70 dark:border-slate-800">
                  <span className="text-slate-500">En Düşük — En Yüksek:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedRoute.minRub.toLocaleString('tr-TR')} – {selectedRoute.maxRub.toLocaleString('tr-TR')} ₽
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500">Fiyat Makası (Son Dakika Farkı):</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {selectedRoute.minRub > 0
                      ? `${Math.round((selectedRoute.maxRub / selectedRoute.minRub) * 10) / 10}x Kat`
                      : '-'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-950/70 border border-teal-200/80 dark:border-teal-800/60 text-[11px] text-slate-600 dark:text-slate-300">
                💡 <b>Analitik Öneri:</b> Bu hatta erken planlama ile ortalama yerine alt dilimden alım yapıldığında bilet başına{' '}
                <b className="text-emerald-600 dark:text-emerald-400">
                  ~{Math.max(0, selectedRoute.avgRub - selectedRoute.minRub).toLocaleString('tr-TR')} ₽
                </b>{' '}
                tasarruf potansiyeli bulunuyor.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: MONTHLY SPEND TREND & SITE-BY-SITE BREAKDOWN (NO LUMPED KAZAN!) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Monthly Overall Volume & Avg Ticket Price */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Aylık Toplam Bilet Harcaması & Ortalama Birim Fiyat Trendi (2024–2026)
            </h3>
            <p className="text-xs text-slate-500">
              Sevk dönemlerindeki pik aylar (Milyon ₽) ve aylık ortalama bilet birim maliyeti (₽)
            </p>
          </div>
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={overallMonthlyChartData} margin={{ top: 8, right: 14, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10.5, fill: '#64748b' }} />
                <YAxis
                  yAxisId="spend"
                  tick={{ fontSize: 10.5, fill: '#0284c7' }}
                  tickFormatter={(v) => `${v}M`}
                />
                <YAxis
                  yAxisId="avg"
                  orientation="right"
                  tick={{ fontSize: 10.5, fill: '#d97706' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name.includes('Harcama')) return [`${value} Milyon ₽`, name];
                    return [`${Number(value || 0).toLocaleString('tr-TR')} ₽`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  yAxisId="spend"
                  dataKey="totalMillionRub"
                  name="Aylık Toplam Harcama (Milyon ₽)"
                  fill="#0ea5e9"
                  fillOpacity={0.75}
                  radius={[5, 5, 0, 0]}
                />
                <Line
                  yAxisId="avg"
                  type="monotone"
                  dataKey="avgRub"
                  name="Aylık Ortalama Bilet Fiyatı (₽)"
                  stroke="#d97706"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Şantiye Bazlı Ulaşım Maliyeti (Kazan Split by Şantiye!) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600" />
                <span>Şantiye Bazlı Ulaşım Maliyeti & Birim Bilet Ortalaması</span>
              </h3>
              <p className="text-xs text-slate-500">
                Kazan projeleri tek tek şantiye kırılımında gösterilir (NHNK mPE-300, Katalizor, Polisterol, SIBUR...)
              </p>
            </div>
          </div>
          <div className="h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeDataset.bySite.slice(0, 11)}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 24, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10.5, fill: '#64748b' }}
                  tickFormatter={(v) => formatRubCompact(v)}
                />
                <YAxis
                  type="category"
                  dataKey="site"
                  width={135}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                />
                <Tooltip
                  formatter={(value: any, _name: string, props: any) => {
                    const p = props?.payload;
                    return [
                      `${Number(value || 0).toLocaleString('tr-TR')} ₽ (${p?.count || 0} bilet • Ort. ${(
                        p?.avgRub || 0
                      ).toLocaleString('tr-TR')} ₽)`,
                      'Şantiye Harcaması',
                    ];
                  }}
                />
                <Bar dataKey="totalRub" name="Toplam Harcama (₽)" radius={[0, 6, 6, 0]}>
                  {activeDataset.bySite.slice(0, 11).map((entry, idx) => (
                    <Cell
                      key={entry.site}
                      fill={SITE_BAR_COLORS[idx % SITE_BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECTION 3: PURPOSE BREAKDOWN + LIVE ANOMALY / OVERPRICED TICKET GUARD */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Flight Purpose & Agency Breakdown */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Seyahat Amacı (Uçuş Tipi) & Acente Kırılımı
          </h3>
          <div className="space-y-2">
            {activeDataset.byPurpose.slice(0, 7).map((p) => {
              const sharePct =
                activeDataset.totalSpendRub > 0
                  ? Math.round((p.totalRub / activeDataset.totalSpendRub) * 1000) / 10
                  : 0;
              return (
                <div key={p.purpose} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {p.purpose}{' '}
                      <span className="text-slate-400 font-normal">
                        ({p.count.toLocaleString('tr-TR')} bilet • Ort. {p.avgRub.toLocaleString('tr-TR')} ₽)
                      </span>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatRubCompact(p.totalRub)} (%{sharePct})
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-sky-500"
                      style={{ width: `${Math.min(100, Math.max(2, sharePct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {activeDataset.byAgent.map((ag) => (
              <div
                key={ag.agent}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 text-xs"
              >
                <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  {ag.agent}
                </div>
                <div className="text-teal-700 dark:text-teal-300 font-bold mt-0.5">
                  {formatRubCompact(ag.totalRub)}
                </div>
                <div className="text-[10.5px] text-slate-500">
                  {ag.count.toLocaleString('tr-TR')} bilet • Ort. {ag.avgRub.toLocaleString('tr-TR')} ₽
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Ticket Price Anomaly Detector */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Canlı Liste Fiyat Sapma Kontrolü (Güzergah Ortalamasını Aşan Biletler)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Uygulamadaki canlı biletleri Pondera geçmiş güzergah ortalaması ile kıyaslar (+%20 üzeri sapmalar)
              </p>
            </div>
          </div>

          {liveAnomalies.length === 0 ? (
            <div className="p-6 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-center space-y-1">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Canlı Bilet Listesinde Güzergah Ortalamasını Aşan Anormal Fiyat Yok
              </div>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                Mevcut biletlerin tamamı geçmiş Pondera güzergah ortalamaları ile uyumlu aralıkta.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10.5px] uppercase text-slate-400">
                    <th className="py-2 pr-2">Yolcu & Şantiye</th>
                    <th className="py-2 px-2">Güzergah</th>
                    <th className="py-2 px-2 text-right">Bilet Fiyatı</th>
                    <th className="py-2 px-2 text-right">Hat Ort.</th>
                    <th className="py-2 pl-2 text-right">Fark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {liveAnomalies.map((item) => (
                    <tr key={item.ticket.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 pr-2">
                        <div className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[165px]">
                          {item.ticket.passenger_name}
                        </div>
                        <div className="text-[10.5px] text-slate-500">
                          {item.ticket.project_name || item.ticket.region || '-'} • {item.ticket.departure_date}
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {item.routeLabel}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-rose-600 dark:text-rose-400">
                        {item.rubPrice.toLocaleString('tr-TR')} ₽
                      </td>
                      <td className="py-2 px-2 text-right text-slate-500">
                        {item.benchmarkAvg.toLocaleString('tr-TR')} ₽
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10.5px]">
                          +%{item.diffPct}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: TOP 30 ROUTES BENCHMARK & PRICE CHANGE TABLE */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              En Çok Bilet Alınan 30 Güzergah Fiyat Kıyaslama & Değişim Tablosu
            </h3>
            <p className="text-xs text-slate-500">
              Herhangi bir satıra tıklayarak yukarıdaki aylık fiyat değişim grafiğini o güzergaha geçirebilirsiniz
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-700 text-[10.5px] uppercase text-slate-500">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Güzergah (Kalkış → Varış)</th>
                <th className="py-2.5 px-3">Ulaşım</th>
                <th className="py-2.5 px-3 text-right">Alınan Bilet</th>
                <th className="py-2.5 px-3 text-right">En Düşük</th>
                <th className="py-2.5 px-3 text-right">Ortalama Fiyat</th>
                <th className="py-2.5 px-3 text-right">En Yüksek</th>
                <th className="py-2.5 px-3 text-right">Son Ay Ort.</th>
                <th className="py-2.5 px-3 text-right">Son Ay Değişim</th>
                <th className="py-2.5 px-3 text-right">Toplam Hacim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredRoutes.map((r, idx) => {
                const isSelected = selectedRoute?.route === r.route;
                return (
                  <tr
                    key={r.route}
                    onClick={() => setSelectedRouteKey(r.route)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-teal-50/80 dark:bg-teal-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                      {r.route}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.transport === 'train' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold text-[10.5px]">
                          🚆 Tren
                        </span>
                      ) : r.transport === 'bus' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold text-[10.5px]">
                          🚌 Otobüs
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-semibold text-[10.5px]">
                          ✈️ Uçak
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {r.count.toLocaleString('tr-TR')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-mono">
                      {r.minRub.toLocaleString('tr-TR')} ₽
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                      {r.avgRub.toLocaleString('tr-TR')} ₽
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400 font-mono">
                      {r.maxRub.toLocaleString('tr-TR')} ₽
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      {r.lastMonthAvgRub.toLocaleString('tr-TR')} ₽
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                          r.momChangePct <= 0
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {r.momChangePct > 0 ? '+' : ''}
                        {r.momChangePct}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {formatRubCompact(r.totalRub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

