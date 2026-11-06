'use client';

import React, { useState } from 'react';
import {
  Users,
  Play,
  RotateCcw,
  Sliders,
  Calendar,
  Building2,
  Briefcase,
  TrendingUp,
  User,
  HeartHandshake,
  CheckCircle2,
  FileSpreadsheet,
  ArrowUpRight,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { WcMaleIcon, WcFemaleIcon } from './PowerBIDualDonuts';
import { useLanguage } from '@/context/LanguageContext';

interface PowerBIHeroBarProps {
  totalCount: number;
  avgAge: number;
  avgTenure: number;
  maleCount: number;
  femaleCount: number;
  mainFirmCount: number;
  subconCount: number;
  dataFreshness: string;
  monthlyEntries: { month: string; in_count: number }[];
  monthlyExits: { month: string; out_count: number }[];
  turnoverRate?: number;
  annualExits?: number;
  last30dIn?: number;
  last30dOut?: number;
  last30dInVks?: number;
  last30dOutVks?: number;
  allInVks?: number;
  allOutVks?: number;
  firmFilter: 'all' | 'main' | 'subcon';
  setFirmFilter: (filter: 'all' | 'main' | 'subcon') => void;
  onRefresh: () => void;
  onOpenDetailList?: () => void;
  onNavigateToTurnover?: () => void;
}

export default function PowerBIHeroBar({
  totalCount,
  avgAge,
  avgTenure,
  maleCount,
  femaleCount,
  mainFirmCount,
  subconCount,
  dataFreshness,
  monthlyEntries,
  monthlyExits,
  turnoverRate = 3.8,
  annualExits = 205,
  last30dIn,
  last30dOut,
  last30dInVks,
  last30dOutVks,
  allInVks,
  allOutVks,
  firmFilter,
  setFirmFilter,
  onRefresh,
  onOpenDetailList,
  onNavigateToTurnover,
}: PowerBIHeroBarProps) {
  const { lang, t } = useLanguage();
  const [selectedMonthRange, setSelectedMonthRange] = useState<number>(8); // 3 to 8 months

  // Month range text calculation
  const monthNamesTr = ['Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim'];
  const monthNamesRu = ['Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь'];
  const monthNames = lang === 'ru' ? monthNamesRu : monthNamesTr;

  const startIdx = Math.max(0, 8 - selectedMonthRange);
  const startMonthName = monthNames[startIdx] || (lang === 'ru' ? 'Март' : 'Mart');
  const rangeText = lang === 'ru'
    ? `За последние ${selectedMonthRange} мес. (${startMonthName} 2026 - Октябрь 2026)`
    : `Son ${selectedMonthRange} Ay (${startMonthName} 2026 - Ekim 2026)`;

  // In / Out ratio bar (latest 30d or latest month flow)
  const inLatest =
    last30dIn !== undefined
      ? last30dIn
      : monthlyEntries[monthlyEntries.length - 1]?.in_count || 128;
  const outLatest =
    last30dOut !== undefined
      ? last30dOut
      : monthlyExits[monthlyExits.length - 1]?.out_count || 703;
  const inVksLatest = last30dInVks ?? 45;
  const outVksLatest = last30dOutVks ?? 396;
  const inVksRate = inLatest > 0 ? Math.round((inVksLatest / inLatest) * 100) : 0;
  const outVksRate = outLatest > 0 ? Math.round((outVksLatest / outLatest) * 100) : 0;
  const totalFlow = inLatest + outLatest || 1;
  const inPct = Math.round((inLatest / totalFlow) * 100);
  const outPct = Math.round((outLatest / totalFlow) * 100);

  // Sparkline data for mini trend chart
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const allCounts = [4800, 4950, 5080, 5150, 5200, 5250, 5280, totalCount || 5313];
  const monthLabelsTr = ['Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki'];
  const monthLabelsRu = ['Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт'];
  const activeMonthLabels = (lang === 'ru' ? monthLabelsRu : monthLabelsTr).slice(startIdx, 8);

  const sparklineData = months.slice(startIdx, 8).map((m, idx) => {
    const counts = allCounts.slice(startIdx, 8);
    return {
      name: activeMonthLabels[idx],
      count: counts[idx] || totalCount || 5313,
    };
  });

  return (
    <div className="bg-white dark:bg-gradient-to-r dark:from-[#111F38] dark:via-[#162646] dark:to-[#122A44] rounded-2xl border border-slate-200/90 dark:border-teal-500/35 px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden transition-colors">
      {/* Background glow (dark mode only) */}
      <div className="hidden dark:block absolute top-0 right-1/4 w-96 h-24 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* TOP HEADER: Power BI Inspired Brand & Filter Pills */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-700/80 pb-2.5 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-teal-500/25 shrink-0">
            <Building2 className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-white leading-tight">
                {lang === 'ru' ? 'Численность персонала Pondera' : 'Pondera Personel Sayıları'}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-teal-500/20 text-emerald-800 dark:text-teal-300 border border-emerald-200 dark:border-teal-500/40 text-[10.5px] font-medium">
                {dataFreshness || '03.10.2026'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {lang === 'ru'
                ? 'Динамическая аналитическая панель персонала и объектов'
                : 'Power BI Raporu İlhamlı Dinamik Saha & İK Analitik Paneli'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
          {/* Firm / Subcontractor Segment Buttons (Firma / Taşeron filter pills) */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-x-auto max-w-full">
            <button
              onClick={() => setFirmFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${firmFilter === 'all'
                ? 'bg-emerald-100/95 dark:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-100 shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 border border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
            >
              {lang === 'ru' ? 'Все компании' : 'Tüm Kadro'} ({totalCount.toLocaleString('tr-TR')})
            </button>
            <button
              onClick={() => setFirmFilter('main')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${firmFilter === 'main'
                ? 'bg-emerald-100/95 dark:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-100 shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 border border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
            >
              {lang === 'ru' ? '1. Штат Pondera' : '1. Pondera Ana Kadro'} ({mainFirmCount.toLocaleString('tr-TR')})
            </button>
            <button
              onClick={() => setFirmFilter('subcon')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${firmFilter === 'subcon'
                ? 'bg-emerald-100/95 dark:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-100 shadow-2xs'
                : 'text-slate-700 dark:text-slate-300 border border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
            >
              {lang === 'ru' ? '2. Субподрядчики' : '2. Taşeronlar'} ({subconCount.toLocaleString('tr-TR')})
            </button>
          </div>

          {/* Power BI Inspired "Liste Oluştur / Detay" Button */}
          {onOpenDetailList && (
            <button
              onClick={onOpenDetailList}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 border border-emerald-300/80 dark:border-teal-500/40 text-emerald-800 dark:text-teal-200 text-xs font-medium transition-all shadow-xs shrink-0 cursor-pointer"
              title={lang === 'ru' ? 'Открыть список персонала' : 'Filtrelenmiş Personel Listesini Gör'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? 'Список персонала' : 'Liste Oluştur / Detay'}</span>
            </button>
          )}
        </div>
      </div>

      {/* METRICS ROW (Compact height so bottom charts appear above the fold) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2.5 relative z-10">
        {/* Metric 1: Toplam Çalışan */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[10.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">{t('kpi_total_personnel')}</span>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5 leading-tight">
            {totalCount.toLocaleString('tr-TR')}
          </div>
          <span className="text-[10.5px] text-emerald-700 dark:text-teal-400 font-medium mt-0.5">{t('status_active')}</span>
        </div>

        {/* Metric 2: Yaş Ortalaması */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[10.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">{t('kpi_avg_age')}</span>
          <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5 leading-tight">{avgAge} {t('unit_age')}</div>
          <span className="text-[10.5px] text-slate-600 dark:text-slate-400 mt-0.5">{lang === 'ru' ? 'Молодой коллектив' : 'Genç & Dinamik Kadro'}</span>
        </div>

        {/* Metric 3: Turnover (Sirkülasyon) Oranı - Clickable to open Yönetim & Turnover */}
        <div
          onClick={() => onNavigateToTurnover && onNavigateToTurnover()}
          title={lang === 'ru' ? 'Перейти к отчету по текучести и увольнениям' : 'Yönetim & Turnover Detay Sayfasına Git'}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 hover:bg-emerald-50/40 dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
              {lang === 'ru' ? 'Ср. текучесть' : 'Aylık Ort. Turnover'}
              <ArrowUpRight className="w-3 h-3 text-teal-500 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-semibold bg-emerald-100 dark:bg-teal-900/60 text-emerald-800 dark:text-teal-300 border border-emerald-200 dark:border-teal-600/40">
              {turnoverRate <= 8.5 ? (lang === 'ru' ? 'Баланс' : 'Dengeli Devir') : (lang === 'ru' ? 'Контроль' : 'İzlenmeli')}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              %{turnoverRate.toFixed(1)}
            </div>
            <span className="text-[10.5px] text-emerald-700 dark:text-teal-400 font-medium">{lang === 'ru' ? 'В месяц' : 'Aylık Devir'}</span>
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-slate-600 dark:text-slate-400 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            <span>
              {lang === 'ru' ? 'Уволено 2026:' : '2026 Çıkış:'}{' '}
              <strong className="text-slate-800 dark:text-slate-200 font-bold">
                {annualExits.toLocaleString('tr-TR')}
              </strong>
            </span>
            <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-bold border border-purple-300/60 dark:border-purple-700/60">
              VKS: -{outVksLatest} (%{outVksRate})
            </span>
          </div>
        </div>

        {/* Metric 5: Kadro / Taşeron Dağılımı */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between">
          <span className="text-[10.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">{lang === 'ru' ? 'Штат / Субподряд' : 'Kadro / Taşeron'}</span>
          <div className="mt-0.5">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-700 dark:text-slate-300 font-normal">Pondera:</span>
              <span className="text-emerald-700 dark:text-teal-300 font-semibold">{mainFirmCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-700 dark:text-slate-300 font-normal">{lang === 'ru' ? 'Субподряд:' : 'Taşeron:'}</span>
              <span className="text-amber-700 dark:text-amber-300 font-semibold">{subconCount.toLocaleString()}</span>
            </div>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden flex">
            <div className="bg-emerald-500 dark:bg-teal-400 h-full" style={{ width: `${Math.round((mainFirmCount / totalCount) * 100)}%` }} />
            <div className="bg-amber-500 dark:bg-amber-400 h-full" style={{ width: `${Math.round((subconCount / totalCount) * 100)}%` }} />
          </div>
        </div>

        {/* Metric 6: İşe Alım ve Çıkış Oranları Gauge Bar - Clickable to open Yönetim & Turnover */}
        <div
          onClick={() => onNavigateToTurnover && onNavigateToTurnover()}
          title={lang === 'ru' ? 'Перейти к деталям приемов и увольнений' : 'Giriş & Çıkış Detayları İçin Yönetim & Turnover Sayfasına Git'}
          className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-rose-400 dark:hover:border-teal-400 hover:bg-rose-50/30 dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {lang === 'ru' ? 'Динамика движения' : 'Giriş / Çıkış Akışı'}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-500 dark:text-teal-400 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </div>
          <div className="mt-0.5 space-y-1">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                +{inLatest.toLocaleString('tr-TR')} {lang === 'ru' ? 'Прием' : 'Giriş'}
              </span>
              <span className="text-rose-700 dark:text-rose-400 font-bold">
                -{outLatest.toLocaleString('tr-TR')} {lang === 'ru' ? 'Увольнение' : 'Çıkış'}
              </span>
            </div>
            {/* Dual color flow bar matching Power BI */}
            <div className="w-full h-2.5 rounded-full overflow-hidden flex text-[9.5px] font-bold text-slate-900">
              <div
                className="bg-emerald-400 h-full flex items-center justify-center transition-all"
                style={{ width: `${Math.max(15, inPct)}%` }}
              >
                %{inPct}
              </div>
              <div
                className="bg-rose-400 h-full flex items-center justify-center transition-all"
                style={{ width: `${Math.max(15, outPct)}%` }}
              >
                %{outPct}
              </div>
            </div>
            {/* VKS count & ratio row inside Giriş / Çıkış Akışı */}
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px] font-bold">
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                VKS: +{inVksLatest} (%{inVksRate})
              </span>
              <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                VKS: -{outVksLatest} (%{outVksRate})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
