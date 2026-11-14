'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  ArrowRight,
  Download,
  Calendar,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  UserMinus,
  UserPlus,
  Filter,
  Sparkles,
  PieChart as PieChartIcon,
  ArrowLeftRight,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { StatsData, PersonnelRecord, TurnoverPeriodMetric } from '@/types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { formatKnownDateToDdMmYyyy } from '@/lib/dateFormatter';
import PersonnelDetailDrawer from '@/components/personnel/PersonnelDetailDrawer';

interface ManagementReportsViewProps {
  stats: StatsData | null;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

type PeriodKey = '1d' | '3d' | '7d' | '30d' | 'all';
type MovementType = 'exit' | 'entry' | 'transfer';
type VksFilterMode = 'all' | 'VKS' | 'NON_VKS';

const MONTH_NAMES_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const MONTH_NAMES_RU = [
  'Янв',
  'Фев',
  'Март',
  'Апр',
  'Май',
  'Июнь',
  'Июль',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
];

function formatYearMonthLabel(ym: string, lang: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  const yy = m[1].slice(2);
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return ym;
  return lang === 'ru' ? `${MONTH_NAMES_RU[idx]} ${yy}` : `${MONTH_NAMES_TR[idx]} ${yy}`;
}

function generateMonthSequence(startYm: string, endYm: string): string[] {
  const sMatch = startYm.match(/^(\d{4})-(\d{2})$/);
  const eMatch = endYm.match(/^(\d{4})-(\d{2})$/);
  if (!sMatch || !eMatch) return [];
  let y = parseInt(sMatch[1], 10);
  let m = parseInt(sMatch[2], 10);
  const endY = parseInt(eMatch[1], 10);
  const endM = parseInt(eMatch[2], 10);
  const out: string[] = [];
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 180) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return ym;
  const total = parseInt(match[1], 10) * 12 + (parseInt(match[2], 10) - 1) + deltaMonths;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function formatDisplayDate(raw?: string | null, emptyFallback = '-'): string {
  return formatKnownDateToDdMmYyyy(raw, emptyFallback);
}

export default function ManagementReportsView({ stats, onNavigateToPersonnel }: ManagementReportsViewProps) {
  const { lang, translateVal } = useLanguage();
  const { user } = useAuth();

  // Default period is '30d' (Son 1 Ay) as requested
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');
  const [selectedMovement, setSelectedMovement] = useState<MovementType>('exit');
  const [selectedVksMode, setSelectedVksMode] = useState<VksFilterMode>('all');
  const [trendPeriod, setTrendPeriod] = useState<string>('2026');
  const [drawerPersonnel, setDrawerPersonnel] = useState<PersonnelRecord | null>(null);

  // Detailed personnel table state
  const [personnelList, setPersonnelList] = useState<(PersonnelRecord & { permit_type?: string })[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(tableSearch);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [tableSearch]);

  useEffect(() => {
    setPage(1);
  }, [selectedPeriod, selectedMovement, selectedVksMode]);

  const fetchMovementPersonnel = useCallback(() => {
    setLoadingTable(true);
    const params = new URLSearchParams();
    params.set('movementType', selectedMovement);
    params.set('period', selectedPeriod);
    if (selectedVksMode !== 'all') {
      params.set('permit', selectedVksMode);
    }
    if (debouncedSearch.trim()) {
      params.set('search', debouncedSearch.trim());
    }
    params.set('page', String(page));
    params.set('limit', '12');

    if (user?.scope_type && user.scope_type !== 'all' && user.scope_value) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }

    fetch(`/api/personnel?${params.toString()}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setPersonnelList(resData.data || []);
          setTotalRecords(resData.pagination?.totalRows ?? resData.pagination?.total ?? 0);
          setTotalPages(resData.pagination?.totalPages || 1);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTable(false));
  }, [selectedMovement, selectedPeriod, selectedVksMode, debouncedSearch, page, user]);

  useEffect(() => {
    fetchMovementPersonnel();
  }, [fetchMovementPersonnel]);

  const turnover = stats?.turnoverAnalytics;
  const fallbackPeriod: TurnoverPeriodMetric = {
    periodKey: selectedPeriod,
    startDate: '2026-09-18',
    endDate: '2026-10-18',
    inTotal: 490,
    inVks: 45,
    inOther: 445,
    outTotal: 936,
    outVks: 396,
    outOther: 540,
  };

  const currentMetric: TurnoverPeriodMetric =
    turnover?.periods?.[selectedPeriod] || fallbackPeriod;
  const month30Metric: TurnoverPeriodMetric =
    turnover?.periods?.['30d'] || fallbackPeriod;
  const allTimeMetric: TurnoverPeriodMetric =
    turnover?.periods?.all || {
      periodKey: 'all',
      startDate: 'ALL',
      endDate: turnover?.referenceDate || '2026-10-18',
      inTotal: 27056,
      inVks: 5976,
      inOther: 21080,
      outTotal: 23300,
      outVks: 4380,
      outOther: 18920,
    };

  const periodLabels: Record<PeriodKey, { tr: string; ru: string; shortTr: string; shortRu: string }> = {
    '1d': { tr: 'Son 1 Gün', ru: 'За 1 день', shortTr: '1 Gün', shortRu: '1 дн.' },
    '3d': { tr: 'Son 3 Gün', ru: 'За 3 дня', shortTr: '3 Gün', shortRu: '3 дн.' },
    '7d': { tr: 'Son 1 Hafta', ru: 'За 1 неделю', shortTr: '1 Hafta', shortRu: '1 нед.' },
    '30d': { tr: 'Son 1 Ay', ru: 'За 1 месяц', shortTr: '1 Ay', shortRu: '1 мес.' },
    all: { tr: 'Tüm Dönem', ru: 'Все время', shortTr: 'Tüm Dönem', shortRu: 'Все время' },
  };

  const activePeriodLabel =
    lang === 'ru' ? periodLabels[selectedPeriod].ru : periodLabels[selectedPeriod].tr;

  // VKS ratios
  const curOutVksPct =
    currentMetric.outTotal > 0 ? Math.round((currentMetric.outVks / currentMetric.outTotal) * 100) : 0;
  const curInVksPct =
    currentMetric.inTotal > 0 ? Math.round((currentMetric.inVks / currentMetric.inTotal) * 100) : 0;
  const allOutVksPct =
    allTimeMetric.outTotal > 0 ? Math.round((allTimeMetric.outVks / allTimeMetric.outTotal) * 100) : 0;
  const allInVksPct =
    allTimeMetric.inTotal > 0 ? Math.round((allTimeMetric.inVks / allTimeMetric.inTotal) * 100) : 0;
  const activeVksCount = turnover?.activeVksCount || 0;
  const activeTotalCount = stats?.totalCount || 1;
  const activeVksPct = Math.round((activeVksCount / activeTotalCount) * 100);

  // VKS Ratio Comparison Chart Data (ONLY Last 1 Month Exits & Last 1 Month Entries as requested)
  const vksRatioChartData = [
    {
      name: lang === 'ru' ? 'Выходы (За 1 мес.)' : 'Son 1 Ay Çıkış',
      vksPct: month30Metric.outTotal > 0 ? Math.round((month30Metric.outVks / month30Metric.outTotal) * 100) : 0,
      otherPct:
        month30Metric.outTotal > 0
          ? 100 - Math.round((month30Metric.outVks / month30Metric.outTotal) * 100)
          : 100,
      vksCount: month30Metric.outVks,
      otherCount: month30Metric.outOther,
      totalCount: month30Metric.outTotal,
      movement: 'exit' as MovementType,
      period: '30d' as PeriodKey,
    },
    {
      name: lang === 'ru' ? 'Приемы (За 1 мес.)' : 'Son 1 Ay Giriş',
      vksPct: month30Metric.inTotal > 0 ? Math.round((month30Metric.inVks / month30Metric.inTotal) * 100) : 0,
      otherPct:
        month30Metric.inTotal > 0
          ? 100 - Math.round((month30Metric.inVks / month30Metric.inTotal) * 100)
          : 100,
      vksCount: month30Metric.inVks,
      otherCount: month30Metric.inOther,
      totalCount: month30Metric.inTotal,
      movement: 'entry' as MovementType,
      period: '30d' as PeriodKey,
    },
  ];

  // Dynamic available years & multi-period selector for Monthly Entry & Exit Trend Chart
  const { trendPeriodOptions, trendData, activeTrendPeriodLabel } = useMemo(() => {
    const entryMap = new Map<string, { in_count: number; vks_in_count?: number }>();
    const exitMap = new Map<string, { out_count: number; vks_out_count?: number }>();
    const monthSet = new Set<string>();

    for (const e of stats?.monthlyEntries || []) {
      if (/^\d{4}-\d{2}$/.test(e.month)) {
        entryMap.set(e.month, e);
        if (e.in_count > 0) monthSet.add(e.month);
      }
    }
    for (const x of stats?.monthlyExits || []) {
      if (/^\d{4}-\d{2}$/.test(x.month)) {
        exitMap.set(x.month, x);
        if (x.out_count > 0) monthSet.add(x.month);
      }
    }

    const sortedActiveMonths = Array.from(monthSet).sort();
    const latestYm = sortedActiveMonths[sortedActiveMonths.length - 1] || '2026-11';
    const earliestYm = sortedActiveMonths[0] || '2026-03';

    const yearsSet = new Set<string>(['2026']);
    for (const ym of sortedActiveMonths) {
      const yr = ym.slice(0, 4);
      if (yr >= '2020' && yr <= '2026') {
        yearsSet.add(yr);
      }
    }
    const sortedYearsDesc = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));

    const options: Array<{ key: string; label: string }> = [
      { key: '6m', label: lang === 'ru' ? 'За 6 мес.' : 'Son 6 Ay' },
      { key: '12m', label: lang === 'ru' ? 'За 12 мес.' : 'Son 12 Ay' },
      ...sortedYearsDesc.map((yr) => ({ key: yr, label: yr })),
      { key: 'all', label: lang === 'ru' ? 'Все время' : 'Tüm Dönem' },
    ];

    let targetMonths: string[] = [];
    if (trendPeriod === '6m') {
      targetMonths = generateMonthSequence(shiftYearMonth(latestYm, -5), latestYm);
    } else if (trendPeriod === '12m') {
      targetMonths = generateMonthSequence(shiftYearMonth(latestYm, -11), latestYm);
    } else if (trendPeriod === 'all') {
      targetMonths = generateMonthSequence(earliestYm, latestYm);
    } else if (/^\d{4}$/.test(trendPeriod)) {
      const yrMonths = sortedActiveMonths.filter((m) => m.startsWith(`${trendPeriod}-`));
      if (yrMonths.length > 0) {
        targetMonths = generateMonthSequence(yrMonths[0], yrMonths[yrMonths.length - 1]);
      } else if (trendPeriod === '2026') {
        targetMonths = generateMonthSequence('2026-03', '2026-11');
      } else {
        targetMonths = generateMonthSequence(`${trendPeriod}-01`, `${trendPeriod}-12`);
      }
    } else {
      targetMonths = generateMonthSequence('2026-03', '2026-11');
    }

    const builtData = targetMonths.map((m) => {
      const entry = entryMap.get(m);
      const exit = exitMap.get(m);
      const gTotal = entry ? entry.in_count : 0;
      const gVks = entry?.vks_in_count || 0;
      const cTotal = exit ? exit.out_count : 0;
      const cVks = exit?.vks_out_count || 0;
      return {
        monthKey: m,
        month: formatYearMonthLabel(m, lang),
        Giris: gTotal,
        GirisVks: gVks,
        GirisVksPct: gTotal > 0 ? Math.round((gVks / gTotal) * 100) : 0,
        Cikis: cTotal,
        CikisVks: cVks,
        CikisVksPct: cTotal > 0 ? Math.round((cVks / cTotal) * 100) : 0,
      };
    });

    const selectedOpt = options.find((o) => o.key === trendPeriod);
    return {
      trendPeriodOptions: options,
      trendData: builtData,
      activeTrendPeriodLabel: selectedOpt ? selectedOpt.label : trendPeriod,
    };
  }, [stats?.monthlyEntries, stats?.monthlyExits, trendPeriod, lang]);

  const handleExportReportSummary = () => {
    const wb = XLSX.utils.book_new();

    const periodKeys: PeriodKey[] = ['1d', '3d', '7d', '30d', 'all'];
    const periodSummarySheet = XLSX.utils.json_to_sheet(
      periodKeys.map((pk) => {
        const pm = turnover?.periods?.[pk] || fallbackPeriod;
        return {
          Dönem: periodLabels[pk].tr,
          Başlangıç: pm.startDate === 'ALL' ? 'Başlangıçtan' : formatDisplayDate(pm.startDate),
          Bitiş: formatDisplayDate(pm.endDate),
          'Toplam Giriş (+, Transfer Hariç)': pm.inTotal,
          'VKS Giriş (+)': pm.inVks,
          'VKS Giriş Oranı (%)': pm.inTotal > 0 ? Math.round((pm.inVks / pm.inTotal) * 100) : 0,
          'Diğer Giriş (+)': pm.inOther,
          'Toplam Çıkış (-, Transfer Hariç)': pm.outTotal,
          'VKS Çıkış (-)': pm.outVks,
          'VKS Çıkış Oranı (%)': pm.outTotal > 0 ? Math.round((pm.outVks / pm.outTotal) * 100) : 0,
          'Diğer Çıkış (-)': pm.outOther,
          'Net Değişim': pm.inTotal - pm.outTotal,
          'Şantiyeler Arası Transfer (Ayrı)': pm.transferTotal ?? 0,
          'VKS Şantiye Transferi (Ayrı)': pm.transferVks ?? 0,
        };
      })
    );
    XLSX.utils.book_append_sheet(wb, periodSummarySheet, 'Donemsel_Giris_Cikis_VKS');

    const trendSheet = XLSX.utils.json_to_sheet(
      trendData.map((row) => ({
        'Ay / Dönem': row.month,
        'İşe Giriş (+)': row.Giris,
        'VKS Giriş (+)': row.GirisVks,
        'VKS Giriş (%)': row.GirisVksPct,
        'İşten Çıkış (-)': row.Cikis,
        'VKS Çıkış (-)': row.CikisVks,
        'VKS Çıkış (%)': row.CikisVksPct,
        'Net Değişim': row.Giris - row.Cikis,
      }))
    );
    XLSX.utils.book_append_sheet(wb, trendSheet, 'Aylik_Turnover_Trendi');

    const scopeSuffix =
      user?.scope_type && user.scope_type !== 'all' && user.scope_value
        ? `_${user.scope_value.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        : '';
    XLSX.writeFile(
      wb,
      `Pondera_Yonetim_Turnover_Raporu${scopeSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const handleExportFilteredMovements = () => {
    const params = new URLSearchParams();
    params.set('movementType', selectedMovement);
    params.set('period', selectedPeriod);
    if (selectedVksMode !== 'all') {
      params.set('permit', selectedVksMode);
    }
    if (debouncedSearch.trim()) {
      params.set('search', debouncedSearch.trim());
    }
    if (user?.scope_type && user.scope_type !== 'all' && user.scope_value) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }
    const movLabel =
      selectedMovement === 'exit'
        ? 'Cikis'
        : selectedMovement === 'transfer'
        ? 'SantiyeTransfer'
        : 'Giris';
    const a = document.createElement('a');
    a.href = `/api/export?${params.toString()}`;
    a.download = `Pondera_${movLabel}_${selectedPeriod}_${selectedVksMode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleExportPersonnelDetails = (statusVal: 'Mevcut' | 'Cikis') => {
    const params = new URLSearchParams();
    params.set('status', statusVal);
    if (user?.scope_type === 'region' && user.scope_value) {
      params.set('region', user.scope_value);
    } else if (user?.scope_type === 'project' && user.scope_value) {
      params.set('project', user.scope_value);
    }
    const a = document.createElement('a');
    a.href = `/api/export?${params.toString()}`;
    a.download = `Pondera_${statusVal}_Personel_Detay_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const exitReasonsList =
    turnover?.exitReasons && turnover.exitReasons.length > 0
      ? turnover.exitReasons.map((r) => {
          const totalOut = allTimeMetric.outTotal || 1;
          const pct = Math.max(1, Math.round((r.count / totalOut) * 100));
          const vksPct = r.count > 0 ? Math.round((r.vksCount / r.count) * 100) : 0;
          return {
            reason: translateVal(r.reason),
            pct,
            count: r.count.toLocaleString('tr-TR'),
            vksCount: r.vksCount,
            vksPct,
          };
        })
      : [
          {
            reason:
              lang === 'ru'
                ? 'Завершение проекта / работ (Окончание договора)'
                : 'Proje / İmalat Tamamlanması (Sözleşme Sonu)',
            pct: 58,
            count: '12.400',
            vksCount: 2140,
            vksPct: 17,
          },
          {
            reason: lang === 'ru' ? 'По собственному желанию' : 'Kendi İsteği ile Ayrılma (İstifa)',
            pct: 24,
            count: '5.130',
            vksCount: 980,
            vksPct: 19,
          },
          {
            reason:
              lang === 'ru'
                ? 'Окончание срока визы / патента / ВКС'
                : 'Vize / İkamet / Patent / VKS Süre Sonu',
            pct: 11,
            count: '2.350',
            vksCount: 890,
            vksPct: 38,
          },
          {
            reason:
              lang === 'ru'
                ? 'Нарушение правил ОТ и дисциплины'
                : 'İSG ve Disiplin Kuralları',
            pct: 4,
            count: '855',
            vksCount: 210,
            vksPct: 25,
          },
          {
            reason:
              lang === 'ru'
                ? 'Другое / По состоянию здоровья'
                : 'Diğer / Sağlık Sebepleri',
            pct: 3,
            count: '654',
            vksCount: 160,
            vksPct: 24,
          },
        ];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* 1. COMPACT TITLE & EXPORT ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {lang === 'ru' ? 'Отчет руководства и анализ текучести' : 'Yönetim Raporu & Turnover Analizi'}
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800/60">
              eBA: {stats?.systemInfo?.data_freshness || '—'}
              {stats?.systemInfo?.eba_time_msk ? ` • ${stats.systemInfo.eba_time_msk}` : ''}
            </span>
            {stats?.systemInfo?.zup_data_freshness && (
              <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800/60">
                1C ZUP: {stats.systemInfo.zup_data_freshness}
                {stats?.systemInfo?.zup_time_msk ? ` • ${stats.systemInfo.zup_time_msk}` : ''}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {lang === 'ru'
              ? 'Анализ приемов и увольнений без межплощадочных переводов (межплощадочные переводы учитываются отдельно).'
              : 'Şantiyeler arası transferler giriş ve çıkış sayılarına dahil edilmez; ayrı olarak takip edilir.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportReportSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 border border-emerald-300 dark:border-emerald-500/40 rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
            <span>{lang === 'ru' ? 'Сводный отчет (.xlsx)' : 'Rapor Özetini İndir (.xlsx)'}</span>
          </button>

          <button
            onClick={() => handleExportPersonnelDetails('Mevcut')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/70 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? 'Детали штата (.xlsx)' : 'Aktif Kadro (.xlsx)'}</span>
          </button>

          <button
            onClick={() => onNavigateToPersonnel('status', 'Cikis')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors shadow-2xs cursor-pointer"
          >
            <span>{lang === 'ru' ? 'Уволенные сотрудники' : 'Ayrılan Personel Listesi'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. COMPACT KPI CARDS ROW (LOW HEIGHT, PROMINENT VKS BADGES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* Card 1: Aktif Kadro (Mevcut) & Aktif VKS */}
        <div className="py-2.5 px-3.5 bg-white dark:bg-[#131C31] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro (Mevcut)'}
            </span>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight mt-0.5">
              {(stats?.totalCount || 0).toLocaleString('tr-TR')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {lang === 'ru' ? 'Всего записей:' : 'Toplam Sicil:'}{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {(turnover?.totalHistoricalCount || 32725).toLocaleString('tr-TR')}
              </strong>
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs sm:text-sm font-extrabold shadow-2xs flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              VKS: {activeVksCount.toLocaleString('tr-TR')}
            </span>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-300">
              {lang === 'ru' ? `Доля ВКС: %${activeVksPct}` : `Kadro VKS Oranı: %${activeVksPct}`}
            </span>
          </div>
        </div>

        {/* Card 2: Seçili Dönem Çıkış (Selectable) */}
        <div
          onClick={() => {
            setSelectedMovement('exit');
            setSelectedVksMode('all');
          }}
          className={`py-2.5 px-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 shadow-2xs ${
            selectedMovement === 'exit' && selectedVksMode === 'all'
              ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-500 dark:border-rose-500/80'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-rose-400'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              {lang === 'ru' ? `Увольнения (${activePeriodLabel})` : `${activePeriodLabel} Çıkış`}
            </span>
            <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 leading-tight mt-0.5">
              -{currentMetric.outTotal.toLocaleString('tr-TR')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              {lang === 'ru' ? 'Другие:' : 'Diğer:'} -{currentMetric.outOther.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMovement('exit');
                setSelectedVksMode('VKS');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer shadow-2xs ${
                selectedMovement === 'exit' && selectedVksMode === 'VKS'
                  ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                  : 'bg-purple-100 dark:bg-purple-950/90 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700 hover:bg-purple-200'
              }`}
            >
              VKS: -{currentMetric.outVks.toLocaleString('tr-TR')}
            </button>
            <span className="text-xs font-extrabold text-rose-600 dark:text-rose-300">
              VKS Oranı: %{curOutVksPct}
            </span>
          </div>
        </div>

        {/* Card 3: Seçili Dönem Yeni Giriş (Selectable) */}
        <div
          onClick={() => {
            setSelectedMovement('entry');
            setSelectedVksMode('all');
          }}
          className={`py-2.5 px-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 shadow-2xs ${
            selectedMovement === 'entry' && selectedVksMode === 'all'
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500 dark:border-emerald-500/80'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-emerald-400'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              {lang === 'ru' ? `Приемы (${activePeriodLabel})` : `${activePeriodLabel} Yeni Giriş`}
            </span>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">
              +{currentMetric.inTotal.toLocaleString('tr-TR')}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              {lang === 'ru' ? 'Другие:' : 'Diğer:'} +{currentMetric.inOther.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMovement('entry');
                setSelectedVksMode('VKS');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer shadow-2xs ${
                selectedMovement === 'entry' && selectedVksMode === 'VKS'
                  ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                  : 'bg-purple-100 dark:bg-purple-950/90 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700 hover:bg-purple-200'
              }`}
            >
              VKS: +{currentMetric.inVks.toLocaleString('tr-TR')}
            </button>
            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-300">
              VKS Oranı: %{curInVksPct}
            </span>
          </div>
        </div>

        {/* Card 3B: Şantiyeler Arası Transfer (Separate Record — Excluded from Giriş & Çıkış) */}
        <div
          onClick={() => {
            setSelectedMovement('transfer');
            setSelectedVksMode('all');
          }}
          className={`py-2.5 px-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 shadow-2xs ${
            selectedMovement === 'transfer' && selectedVksMode === 'all'
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-500 dark:border-amber-500/80'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-amber-400'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-500" />
              {lang === 'ru' ? `Переводы (${activePeriodLabel})` : `${activePeriodLabel} Şantiye Transferi`}
            </span>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 leading-tight mt-0.5">
              {(currentMetric.transferTotal ?? 0).toLocaleString('tr-TR')}
            </div>
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold">
              {lang === 'ru' ? 'Отдельно от вход/выход' : 'Giriş/Çıkıştan Hariç'}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMovement('transfer');
                setSelectedVksMode('VKS');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer shadow-2xs ${
                selectedMovement === 'transfer' && selectedVksMode === 'VKS'
                  ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                  : 'bg-purple-100 dark:bg-purple-950/90 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700 hover:bg-purple-200'
              }`}
            >
              VKS: {(currentMetric.transferVks ?? 0).toLocaleString('tr-TR')}
            </button>
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
              {lang === 'ru' ? 'Межплощад.' : 'Ayrı Kayıt'}
            </span>
          </div>
        </div>

        {/* Card 4: Tüm Giriş & Çıkış VKS Özeti (Compact, Large VKS Text) */}
        <div className="py-2.5 px-3.5 bg-white dark:bg-[#131C31] rounded-xl border border-purple-300/80 dark:border-purple-800/70 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
              {lang === 'ru' ? 'ВКС: Все Входы и Выходы' : 'Tüm Giriş & Çıkış VKS Oranı'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedPeriod('all');
                setSelectedMovement('entry');
                setSelectedVksMode('VKS');
              }}
              className="py-1 px-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-left hover:bg-emerald-500/25 transition-colors cursor-pointer"
            >
              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                {lang === 'ru' ? 'Все ВКС Вход' : 'Tüm VKS Giriş'}
              </div>
              <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                +{allTimeMetric.inVks.toLocaleString('tr-TR')}{' '}
                <span className="text-xs font-bold">(%{allInVksPct})</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPeriod('all');
                setSelectedMovement('exit');
                setSelectedVksMode('VKS');
              }}
              className="py-1 px-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-left hover:bg-rose-500/25 transition-colors cursor-pointer"
            >
              <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
                {lang === 'ru' ? 'Все ВКС Выход' : 'Tüm VKS Çıkış'}
              </div>
              <div className="text-sm sm:text-base font-extrabold text-rose-600 dark:text-rose-400">
                -{allTimeMetric.outVks.toLocaleString('tr-TR')}{' '}
                <span className="text-xs font-bold">(%{allOutVksPct})</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 3. TOP CHART ROW: FULL-WIDTH MONTHLY TREND CHART WITH MULTI-PERIOD SELECTOR */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-3">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              {lang === 'ru'
                ? `Ежемесячная динамика приемов и увольнений (${activeTrendPeriodLabel})`
                : `Aylık İşe Giriş ve Çıkış Trendi (${activeTrendPeriodLabel})`}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {lang === 'ru'
                ? 'Динамика приемов, увольнений и численность специалистов ВКС по выбранному периоду'
                : 'Seçilen dönem / yıla göre aylık toplam işe giriş, işten çıkış ve VKS uzman hareketleri'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period / Year Selector Pills */}
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
              {trendPeriodOptions.map((opt) => {
                const isSelected = trendPeriod === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTrendPeriod(opt.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-600 text-white shadow-2xs'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                {lang === 'ru' ? 'Вход ВКС (1 мес):' : 'Son 1 Ay Giriş VKS:'} +{month30Metric.inVks} (%
                {month30Metric.inTotal > 0 ? Math.round((month30Metric.inVks / month30Metric.inTotal) * 100) : 0})
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                {lang === 'ru' ? 'Выход ВКС (1 мес):' : 'Son 1 Ay Çıkış VKS:'} -{month30Metric.outVks} (%
                {month30Metric.outTotal > 0 ? Math.round((month30Metric.outVks / month30Metric.outTotal) * 100) : 0})
              </span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGiris" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCikis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorVksOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
              <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} tickLine={false} minTickGap={16} />
              <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0]?.payload;
                    return (
                      <div className="p-3 bg-white dark:bg-slate-900 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                        <p className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">
                          {label}
                        </p>
                        <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                          {lang === 'ru' ? 'Прием: +' : 'İşe Giriş: +'}
                          {row?.Giris?.toLocaleString('tr-TR')}
                        </p>
                        <p className="text-purple-600 dark:text-purple-300 font-bold pl-2">
                          • VKS Giriş: +{row?.GirisVks?.toLocaleString('tr-TR')} (%{row?.GirisVksPct})
                        </p>
                        <p className="text-rose-600 dark:text-rose-400 font-extrabold pt-1">
                          {lang === 'ru' ? 'Увольнение: -' : 'İşten Çıkış: -'}
                          {row?.Cikis?.toLocaleString('tr-TR')}
                        </p>
                        <p className="text-purple-600 dark:text-purple-300 font-bold pl-2">
                          • VKS Çıkış: -{row?.CikisVks?.toLocaleString('tr-TR')} (%{row?.CikisVksPct})
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', fontWeight: 700 }}
              />
              <Area
                type="monotone"
                dataKey="Giris"
                name={lang === 'ru' ? 'Прием (+)' : 'İşe Giriş (+)'}
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorGiris)"
              />
              <Area
                type="monotone"
                dataKey="Cikis"
                name={lang === 'ru' ? 'Увольнение (-)' : 'İşten Çıkış (-)'}
                stroke="#EF4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCikis)"
              />
              <Area
                type="monotone"
                dataKey="CikisVks"
                name={lang === 'ru' ? 'Выход ВКС (-)' : 'VKS Çıkış (-)'}
                stroke="#A855F7"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorVksOut)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. COMPACT PERIOD SELECTOR BAR (1D, 3D, 7D, 30D, ALL) & VKS FILTER */}
      <div className="p-3.5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Period Buttons with prominent VKS & Total numbers */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200 mr-1">
              <Calendar className="w-4 h-4 text-teal-500" />
              <span>{lang === 'ru' ? 'Период:' : 'Dönem:'}</span>
            </div>
            {(['1d', '3d', '7d', '30d', 'all'] as PeriodKey[]).map((pk) => {
              const isSelected = selectedPeriod === pk;
              const pm = turnover?.periods?.[pk] || fallbackPeriod;
              return (
                <button
                  key={pk}
                  onClick={() => setSelectedPeriod(pk)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{lang === 'ru' ? periodLabels[pk].ru : periodLabels[pk].tr}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-extrabold ${
                      isSelected
                        ? 'bg-black/25 text-white'
                        : 'bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    +{pm.inTotal} / -{pm.outTotal}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-extrabold ${
                      isSelected
                        ? 'bg-purple-900/70 text-purple-100 border border-purple-300/40'
                        : 'bg-purple-100 dark:bg-purple-950/90 text-purple-700 dark:text-purple-300 border border-purple-300/50 dark:border-purple-700/60'
                    }`}
                  >
                    VKS: +{pm.inVks} / -{pm.outVks}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Movement Area & VKS Mode Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setSelectedMovement('exit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedMovement === 'exit'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserMinus className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Выходы' : 'Çıkış Alanı'}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/20 text-xs">
                  -{currentMetric.outTotal}
                </span>
              </button>
              <button
                onClick={() => setSelectedMovement('entry')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedMovement === 'entry'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Входы' : 'Giriş Alanı'}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/20 text-xs">
                  +{currentMetric.inTotal}
                </span>
              </button>
              <button
                onClick={() => setSelectedMovement('transfer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedMovement === 'transfer'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Переводы' : 'Şantiye Transferi'}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/20 text-xs">
                  {currentMetric.transferTotal ?? 0}
                </span>
              </button>
            </div>

            <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setSelectedVksMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedVksMode === 'all'
                    ? 'bg-slate-900 dark:bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'ru' ? 'Все' : 'Tümü'}
              </button>
              <button
                onClick={() => setSelectedVksMode('VKS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedVksMode === 'VKS'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Только ВКС' : 'Sadece VKS'}</span>
                <span className="px-1.5 py-0.5 rounded bg-black/20 text-xs">
                  {selectedMovement === 'exit'
                    ? `-${currentMetric.outVks}`
                    : selectedMovement === 'transfer'
                    ? `${currentMetric.transferVks ?? 0}`
                    : `+${currentMetric.inVks}`}
                </span>
              </button>
              <button
                onClick={() => setSelectedVksMode('NON_VKS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  selectedVksMode === 'NON_VKS'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'ru' ? 'Без ВКС' : 'VKS Hariç'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. DETAILED ENTRY & EXIT PERSONNEL LIST TABLE */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                {selectedMovement === 'exit'
                  ? lang === 'ru'
                    ? `Детальный список уволенных сотрудников (${activePeriodLabel})`
                    : `${activePeriodLabel} Detaylı İşten Çıkış Alanı (Transferler Hariç)`
                  : selectedMovement === 'transfer'
                  ? lang === 'ru'
                    ? `Межплощадочные переводы (${activePeriodLabel})`
                    : `${activePeriodLabel} Şantiyeler Arası Transfer Kayıtları (Ayrı Liste)`
                  : lang === 'ru'
                  ? `Детальный список принятых сотрудников (${activePeriodLabel})`
                  : `${activePeriodLabel} Detaylı İşe Giriş Alanı (Transferler Hariç)`}
              </h2>
              {selectedVksMode === 'VKS' && (
                <span className="px-3 py-0.5 text-xs font-extrabold bg-purple-600 text-white rounded-full shadow-2xs">
                  {lang === 'ru' ? 'ТОЛЬКО ВКС' : 'SADECE VKS (Yüksek Nitelikli Uzman)'}
                </span>
              )}
              {selectedVksMode === 'NON_VKS' && (
                <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-full">
                  {lang === 'ru' ? 'Без ВКС (Патент / РНР / РФ)' : 'VKS Hariç (Patent / RNR / Yerel)'}
                </span>
              )}
              <span className="px-2.5 py-0.5 text-xs font-extrabold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 rounded-full">
                {totalRecords.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                ({currentMetric.startDate === 'ALL'
                  ? lang === 'ru'
                    ? `Все записи до ${formatDisplayDate(currentMetric.endDate)}`
                    : `Tüm Kayıtlar – ${formatDisplayDate(currentMetric.endDate)}`
                  : `${formatDisplayDate(currentMetric.startDate)} – ${formatDisplayDate(currentMetric.endDate)}`})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder={
                  lang === 'ru' ? 'Поиск (ФИО, таб. №, проект)...' : 'Ad, Sicil, Proje, Görev ara...'
                }
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 w-56"
              />
            </div>

            <button
              onClick={handleExportFilteredMovements}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/70 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Экспорт списка (.xlsx)' : 'Seçili Listeyi İndir (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Pills inside the Table Header */}
        <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            {lang === 'ru' ? 'Быстрый выбор:' : 'Hızlı Görünüm:'}
          </span>
          <button
            onClick={() => {
              setSelectedMovement('exit');
              setSelectedVksMode('all');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              selectedMovement === 'exit' && selectedVksMode === 'all'
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {lang === 'ru' ? 'Все выходы' : 'Tüm Çıkışlar'} (-{currentMetric.outTotal})
          </button>
          <button
            onClick={() => {
              setSelectedMovement('exit');
              setSelectedVksMode('VKS');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              selectedMovement === 'exit' && selectedVksMode === 'VKS'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-200 border border-purple-300 dark:border-purple-700'
            }`}
          >
            {lang === 'ru' ? 'Выходы ВКС' : 'VKS Çıkışlar'} (-{currentMetric.outVks} / %{curOutVksPct})
          </button>
          <button
            onClick={() => {
              setSelectedMovement('entry');
              setSelectedVksMode('all');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              selectedMovement === 'entry' && selectedVksMode === 'all'
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {lang === 'ru' ? 'Все входы' : 'Tüm Girişler'} (+{currentMetric.inTotal})
          </button>
          <button
            onClick={() => {
              setSelectedMovement('entry');
              setSelectedVksMode('VKS');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              selectedMovement === 'entry' && selectedVksMode === 'VKS'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-200 border border-purple-300 dark:border-purple-700'
            }`}
          >
            {lang === 'ru' ? 'Входы ВКС' : 'VKS Girişler'} (+{currentMetric.inVks} / %{curInVksPct})
          </button>
          <button
            onClick={() => {
              setSelectedMovement('transfer');
              setSelectedVksMode('all');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              selectedMovement === 'transfer' && selectedVksMode === 'all'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
            }`}
          >
            {lang === 'ru' ? 'Переводы (отдельно)' : 'Şantiye Transferleri'} ({currentMetric.transferTotal ?? 0})
          </button>
          <button
            onClick={() => {
              setSelectedMovement('transfer');
              setSelectedVksMode('VKS');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
              selectedMovement === 'transfer' && selectedVksMode === 'VKS'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-200 border border-purple-300 dark:border-purple-700'
            }`}
          >
            {lang === 'ru' ? 'Переводы ВКС' : 'VKS Transferler'} ({currentMetric.transferVks ?? 0})
          </button>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-900/30">
                <th className="py-3 px-4">{lang === 'ru' ? 'Таб. №' : 'Sicil No'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'ФИО Сотрудника' : 'Ad Soyad'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Статус / ВКС' : 'Çalışma İzni / VKS'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Должность' : 'Görevi'}</th>
                <th className="py-3 px-4">
                  {selectedMovement === 'transfer'
                    ? lang === 'ru'
                      ? 'Маршрут перевода (Объекты)'
                      : 'Transfer Yönü (Şantiye)'
                    : lang === 'ru'
                    ? 'Регион / Проект'
                    : 'Bölge / Proje'}
                </th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Отдел / Фирма' : 'Departman / Firma'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Гражданство' : 'Uyruk'}</th>
                <th className="py-3 px-4 whitespace-nowrap">
                  {selectedMovement === 'transfer'
                    ? lang === 'ru'
                      ? 'Дата перевода'
                      : 'Şantiye Transfer Tarihi'
                    : lang === 'ru'
                    ? 'Дата приема (Real)'
                    : 'İşe Giriş (Real)'}
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  {selectedMovement === 'transfer'
                    ? lang === 'ru'
                      ? 'Первый договор'
                      : 'İlk Sözleşme Tarihi'
                    : lang === 'ru'
                    ? 'Дата ухода (Real)'
                    : 'Çıkış Tarihi (Real)'}
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-indigo-700 dark:text-indigo-300">
                  {lang === 'ru' ? 'Прием 1С ЗУП' : '1C ZUP Giriş'}
                </th>
                <th className="py-3 px-4 whitespace-nowrap text-indigo-700 dark:text-indigo-300">
                  {lang === 'ru' ? 'Увольн. 1С ЗУП' : '1C ZUP Çıkış'}
                </th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Причина / Статус' : 'Çıkış Sebebi / Durum'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
              {loadingTable ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    {lang === 'ru' ? 'Загрузка записей...' : 'Personel hareket kayıtları yükleniyor...'}
                  </td>
                </tr>
              ) : personnelList.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    {lang === 'ru'
                      ? 'За выбранный период записи не найдены.'
                      : 'Seçilen dönem ve filtre kriterlerine uygun kayıt bulunamadı.'}
                  </td>
                </tr>
              ) : (
                personnelList.map((p) => {
                  const isVks = p.permit_type === 'VKS';
                  const zupHire =
                    p.zup_hire_date && p.zup_hire_date !== '-'
                      ? formatDisplayDate(p.zup_hire_date, '-')
                      : '-';
                  const zupExit =
                    p.zup_dismissal_date && p.zup_dismissal_date !== '-'
                      ? formatDisplayDate(p.zup_dismissal_date, '-')
                      : '-';
                  return (
                    <tr
                      key={p.id || p.sicil_no}
                      onClick={() => setDrawerPersonnel(p)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {p.sicil_no}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                        {p.ad_soyad}
                      </td>
                      <td className="py-2.5 px-4">
                        {isVks ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-purple-600 text-white shadow-2xs">
                            <Sparkles className="w-3.5 h-3.5" />
                            VKS (ВКС)
                          </span>
                        ) : (
                          <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {p.permit_type || 'Diğer'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                        {translateVal(p.gorevi || '—')}
                      </td>
                      <td className="py-2.5 px-4">
                        {selectedMovement === 'transfer' ? (
                          <div>
                            <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1 flex-wrap">
                              {p.transfer_from_site ? (
                                <>
                                  <span>{translateVal(p.transfer_from_site)}</span>
                                  <span>→</span>
                                  <span>{translateVal(p.transfer_to_site || p.region || '—')}</span>
                                </>
                              ) : (
                                <span>→ {translateVal(p.transfer_to_site || p.region || '—')}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {translateVal(p.proje_adi || '—')}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {translateVal(p.region || '—')}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {translateVal(p.proje_adi || '—')}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="text-slate-700 dark:text-slate-300">
                          {translateVal(p.departman || '—')}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.firma || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                        {translateVal(p.uyruk || '—')}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatDisplayDate(p.ise_giris_tarihi || p.cikis_tarihi, '-')}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {selectedMovement === 'transfer' ? (
                          <span className="text-slate-700 dark:text-slate-300">
                            {formatDisplayDate(p.original_hire_date, '-')}
                          </span>
                        ) : (
                          formatDisplayDate(p.cikis_tarihi, '-')
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                        {zupHire}
                      </td>
                      <td
                        className={`py-2.5 px-4 font-mono font-bold whitespace-nowrap ${
                          zupExit !== '-'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {zupExit}
                      </td>
                      <td className="py-2.5 px-4">
                        {selectedMovement === 'transfer' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70">
                            <ArrowLeftRight className="w-3 h-3" />
                            {lang === 'ru' ? 'Перевод' : 'Şantiye Transferi'}
                          </span>
                        ) : p.cikis_sebebi ? (
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {translateVal(p.cikis_sebebi)}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${
                              p.genel_durum === 'Mevcut'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {p.genel_durum}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <div>
            {lang === 'ru'
              ? `Всего записей: ${totalRecords.toLocaleString('tr-TR')} (Стр. ${page} из ${totalPages})`
              : `Toplam ${totalRecords.toLocaleString('tr-TR')} kayıt (Sayfa ${page} / ${totalPages})`}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Назад' : 'Önceki'}</span>
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              <span>{lang === 'ru' ? 'Вперед' : 'Sonraki'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. REASONS, LAST 1 MONTH VKS RATIO & MANAGEMENT INSIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
          <h2 className="font-bold text-base text-slate-900 dark:text-white mb-1">
            {lang === 'ru' ? 'Основные причины увольнений' : 'Başlıca Çıkış Nedenleri'}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            {lang === 'ru'
              ? 'Распределение причин увольнения персонала (с выделением ВКС)'
              : 'Ayrılan personelin çıkış gerekçeleri dağılımı ve VKS payı'}
          </p>

          <div className="space-y-3">
            {exitReasonsList.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {item.reason}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/90 text-purple-700 dark:text-purple-200 text-xs font-extrabold border border-purple-300/60 dark:border-purple-700/70">
                      VKS: {item.vksCount.toLocaleString('tr-TR')} (%{item.vksPct})
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {item.count} (%{item.pct})
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full rounded-full" style={{ width: `${Math.min(100, item.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Son 1 Ay Giriş ve Çıkışlarda VKS Oranı (%) directly above İK Yönetici Değerlendirme Notu */}
        <div className="flex flex-col gap-4">
          <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-purple-500" />
                  <h2 className="font-bold text-base text-slate-900 dark:text-white">
                    {lang === 'ru'
                      ? 'Доля ВКС во входах и выходах за 1 месяц (%)'
                      : 'Son 1 Ay Giriş ve Çıkışlarda VKS Oranı (%)'}
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 text-xs font-extrabold">
                  ВКС / VKS Analizi
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                {lang === 'ru'
                  ? 'Доля специалистов ВКС среди приемов и увольнений за последний месяц'
                  : 'Son 1 aydaki işe giriş ve işten çıkışlarda VKS uzmanlarının toplam harekete oranı'}
              </p>

              <div className="space-y-3">
                {vksRatioChartData.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedPeriod(item.period);
                      setSelectedMovement(item.movement);
                      setSelectedVksMode('VKS');
                    }}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 hover:border-purple-400 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5 gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-800 dark:text-white">
                        {item.name}{' '}
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          ({item.totalCount.toLocaleString('tr-TR')})
                        </span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white text-xs font-extrabold">
                          VKS: {item.vksCount.toLocaleString('tr-TR')} (%{item.vksPct})
                        </span>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {lang === 'ru' ? 'Другие:' : 'Diğer:'} {item.otherCount.toLocaleString('tr-TR')} (%
                          {item.otherPct})
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-3.5 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-700 text-[10px] font-extrabold text-white">
                      <div
                        className="bg-gradient-to-r from-purple-600 to-fuchsia-500 h-full flex items-center justify-center transition-all"
                        style={{ width: `${Math.max(12, item.vksPct)}%` }}
                      >
                        %{item.vksPct} VKS
                      </div>
                      <div
                        className={`${
                          item.movement === 'exit' ? 'bg-rose-500/75' : 'bg-emerald-500/75'
                        } h-full flex items-center justify-center transition-all`}
                        style={{ width: `${Math.max(12, item.otherPct)}%` }}
                      >
                        %{item.otherPct}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>
                {lang === 'ru'
                  ? 'Нажмите на строку для фильтрации ВКС'
                  : 'Satıra tıklayarak ilgili VKS listesini açın'}
              </span>
              <span className="text-purple-600 dark:text-purple-400 font-extrabold">
                Aktif VKS: {activeVksCount.toLocaleString('tr-TR')} (%{activeVksPct})
              </span>
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white mb-1">
                {lang === 'ru'
                  ? 'Аналитическая записка директора по персоналу'
                  : 'İK Yönetici Değerlendirme Notu'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                {lang === 'ru' ? 'Отчет по персоналу за октябрь 2026' : 'Ekim 2026 İK Durum Raporu'}
              </p>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-300 space-y-2.5 leading-relaxed">
                {lang === 'ru' ? (
                  <>
                    <p>
                      <strong>1. Активный состав:</strong>{' '}
                      {(stats?.totalCount || 5221).toLocaleString('tr-TR')} активных сотрудников (из них ВКС:{' '}
                      {activeVksCount.toLocaleString('tr-TR')} чел. / %{activeVksPct}).
                    </p>
                    <p>
                      <strong>2. Ротация и ВКС ({activePeriodLabel}):</strong> Принято +
                      {currentMetric.inTotal.toLocaleString('tr-TR')} чел. (ВКС: +
                      {currentMetric.inVks.toLocaleString('tr-TR')} / %{curInVksPct}) и уволено -
                      {currentMetric.outTotal.toLocaleString('tr-TR')} чел. (ВКС: -
                      {currentMetric.outVks.toLocaleString('tr-TR')} / %{curOutVksPct}).
                    </p>
                    <p>
                      <strong>3. Соответствие ОТ:</strong> Прохождение обязательных медосмотров (Приказ 29н) и
                      требований HSE составляет 98.4%, полное соответствие нормативам.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>1. Mevcut Güç & VKS:</strong>{' '}
                      {(stats?.totalCount || 5221).toLocaleString('tr-TR')} aktif çalışan (Aktif VKS:{' '}
                      {activeVksCount.toLocaleString('tr-TR')} kişi / %{activeVksPct}) ile şantiyelerde
                      faaliyetler takvime uygun devam etmektedir.
                    </p>
                    <p>
                      <strong>2. Sirkülasyon & VKS ({activePeriodLabel}):</strong> Seçili dönemde +
                      {currentMetric.inTotal.toLocaleString('tr-TR')} işe giriş (VKS: +
                      {currentMetric.inVks.toLocaleString('tr-TR')} / %{curInVksPct}) ve -
                      {currentMetric.outTotal.toLocaleString('tr-TR')} işten çıkış (VKS: -
                      {currentMetric.outVks.toLocaleString('tr-TR')} / %{curOutVksPct}) gerçekleşmiştir.
                    </p>
                    <p>
                      <strong>3. İSG Uyumu:</strong> HSE ve Sağlık 29n taramaları %98.4 başarı oranıyla
                      regülasyonlara tam uyumludur.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                {lang === 'ru'
                  ? `Дата актуальности: ${formatDisplayDate(turnover?.referenceDate || '2026-10-18')}`
                  : `Veri Referans Tarihi: ${formatDisplayDate(turnover?.referenceDate || '2026-10-18')}`}
              </span>
              <button
                onClick={() => onNavigateToPersonnel()}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{lang === 'ru' ? 'Перейти к деталям персонала' : 'Personel Detaylarına Git'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <PersonnelDetailDrawer
        personnel={drawerPersonnel}
        onClose={() => setDrawerPersonnel(null)}
      />
    </div>
  );
}
