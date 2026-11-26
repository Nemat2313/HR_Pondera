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
  dataFreshnessTime?: string;
  zupFreshness?: string;
  zupFreshnessTime?: string;
  monthlyEntries: { month: string; in_count: number }[];
  monthlyExits: { month: string; out_count: number }[];
  turnoverRate?: number;
  annualExits?: number;
  last7dIn?: number;
  last7dOut?: number;
  last7dInVks?: number;
  last7dOutVks?: number;
  last30dIn?: number;
  last30dOut?: number;
  last30dInVks?: number;
  last30dOutVks?: number;
  allInVks?: number;
  allOutVks?: number;
  selectedGender?: string;
  onSelectGender?: (gender: string) => void;
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
  dataFreshnessTime,
  zupFreshness,
  zupFreshnessTime,
  monthlyEntries,
  monthlyExits,
  turnoverRate = 3.8,
  annualExits = 205,
  last7dIn,
  last7dOut,
  last7dInVks,
  last7dOutVks,
  last30dIn,
  last30dOut,
  last30dInVks,
  last30dOutVks,
  allInVks,
  allOutVks,
  selectedGender = 'all',
  onSelectGender,
  firmFilter,
  setFirmFilter,
  onRefresh,
  onOpenDetailList,
  onNavigateToTurnover,
}: PowerBIHeroBarProps) {
  const { lang, t } = useLanguage();
  const [selectedMonthRange, setSelectedMonthRange] = useState<number>(8); // 3 to 8 months

  // Month range text calculation
  const monthNamesTr = ['Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım'];
  const monthNamesRu = ['Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь'];
  const monthNames = lang === 'ru' ? monthNamesRu : monthNamesTr;

  const startIdx = Math.max(0, 9 - selectedMonthRange);
  const startMonthName = monthNames[startIdx] || (lang === 'ru' ? 'Март' : 'Mart');
  const rangeText = lang === 'ru'
    ? `За последние ${selectedMonthRange} мес. (${startMonthName} 2026 - Ноябрь 2026)`
    : `Son ${selectedMonthRange} Ay (${startMonthName} 2026 - Kasım 2026)`;

  // In / Out ratio bar (last 7 days / 1 week flow)
  const inLatest =
    last7dIn !== undefined
      ? last7dIn
      : last30dIn !== undefined
      ? last30dIn
      : monthlyEntries[monthlyEntries.length - 1]?.in_count || 0;
  const outLatest =
    last7dOut !== undefined
      ? last7dOut
      : last30dOut !== undefined
      ? last30dOut
      : monthlyExits[monthlyExits.length - 1]?.out_count || 0;
  const inVksLatest = last7dInVks ?? last30dInVks ?? 0;
  const outVksLatest = last7dOutVks ?? last30dOutVks ?? 0;
  const inVksRate = inLatest > 0 ? Math.round((inVksLatest / inLatest) * 100) : 0;
  const outVksRate = outLatest > 0 ? Math.round((outVksLatest / outLatest) * 100) : 0;
  const totalFlow = inLatest + outLatest || 1;
  const inPct = Math.round((inLatest / totalFlow) * 100);
  const outPct = Math.round((outLatest / totalFlow) * 100);
  const netFlow = inLatest - outLatest;

  // Dual-arc Speedometer geometry (180° semicircle, left = Giriş/Emerald, right = Çıkış/Rose, inner arc = VKS rates)
  const spCx = 90;
  const spCy = 84;
  const outerR = 64;
  const innerR = 47;
  const outerCirc = Math.PI * outerR;
  const innerCirc = Math.PI * innerR;
  const inRatio = Math.min(0.96, Math.max(0.04, inLatest / totalFlow));
  const outRatio = 1 - inRatio;
  const outerGap = 2.5;
  const outerInLen = Math.max(0, inRatio * outerCirc - outerGap / 2);
  const outerOutLen = Math.max(0, outRatio * outerCirc - outerGap / 2);
  const vksHalfCirc = innerCirc * 0.47;
  const innerVksInLen = inVksLatest > 0 ? Math.max(6, (Math.min(100, inVksRate) / 100) * vksHalfCirc) : 0;
  const innerVksOutLen = outVksLatest > 0 ? Math.max(6, (Math.min(100, outVksRate) / 100) * vksHalfCirc) : 0;
  const needleRad = Math.PI * (1 - inRatio);
  const needleTipX = spCx + (outerR + 8) * Math.cos(needleRad);
  const needleTipY = spCy - (outerR + 8) * Math.sin(needleRad);
  const needleBaseR = innerR + 5;
  const perpX = Math.sin(needleRad) * 4.2;
  const perpY = Math.cos(needleRad) * 4.2;
  const needleB1X = spCx + needleBaseR * Math.cos(needleRad) - perpX;
  const needleB1Y = spCy - needleBaseR * Math.sin(needleRad) - perpY;
  const needleB2X = spCx + needleBaseR * Math.cos(needleRad) + perpX;
  const needleB2Y = spCy - needleBaseR * Math.sin(needleRad) + perpY;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const a = Math.PI * (1 - t);
    return {
      x1: spCx + (outerR + 8) * Math.cos(a),
      y1: spCy - (outerR + 8) * Math.sin(a),
      x2: spCx + (outerR + 12) * Math.cos(a),
      y2: spCy - (outerR + 12) * Math.sin(a),
    };
  });

  const malePct = totalCount > 0 ? Math.round((maleCount / totalCount) * 100) : 97;
  const femalePct = totalCount > 0 ? Math.max(femaleCount > 0 ? 1 : 0, Math.round((femaleCount / totalCount) * 100)) : 3;

  // Sparkline data for mini trend chart
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const allCounts = [4800, 4950, 5080, 5150, 5200, 5250, 5280, 5330, totalCount || 5382];
  const monthLabelsTr = ['Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas'];
  const monthLabelsRu = ['Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя'];
  const activeMonthLabels = (lang === 'ru' ? monthLabelsRu : monthLabelsTr).slice(startIdx, 9);

  const sparklineData = months.slice(startIdx, 9).map((m, idx) => {
    const counts = allCounts.slice(startIdx, 9);
    return {
      name: activeMonthLabels[idx],
      count: counts[idx] || totalCount || 5382,
    };
  });

  return (
    <div className="bg-white dark:bg-gradient-to-r dark:from-[#111F38] dark:via-[#162646] dark:to-[#122A44] rounded-2xl border border-slate-200/90 dark:border-teal-500/35 px-3.5 py-2.5 sm:px-4 sm:py-3 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden transition-colors">
      {/* Background glow (dark mode only) */}
      <div className="hidden dark:block absolute top-0 right-1/4 w-96 h-24 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* TOP HEADER: Power BI Inspired Brand & Filter Pills */}
      <div className="-mx-3.5 -mt-2.5 sm:-mx-4 sm:-mt-3 px-3.5 py-2.5 sm:px-4 sm:py-3 mb-2.5 rounded-t-2xl bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 border-b border-emerald-200/70 dark:border-slate-700/80 relative z-10">
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
                eBA: {dataFreshness || '03.10.2026'}
                {dataFreshnessTime ? ` • ${dataFreshnessTime}` : ''}
              </span>
              {zupFreshness && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-[10.5px] font-medium">
                  1C ZUP: {zupFreshness}
                  {zupFreshnessTime ? ` • ${zupFreshnessTime}` : ''}
                </span>
              )}
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

      {/* METRICS ROW: 3 Narrow KPIs + 7d Giriş/Çıkış Speedometer (with inner VKS arc) + Gender Erkek/Kadın */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[0.66fr_0.72fr_0.76fr_2.56fr_2.05fr] gap-2.5 pt-0.5 relative z-10 items-stretch">
        {/* Metric 1: Toplam Çalışan (Narrow Compact) */}
        <div className="px-2.5 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[9.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide truncate">{t('kpi_total_personnel')}</span>
          <div className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5 leading-tight font-mono">
            {totalCount.toLocaleString('tr-TR')}
          </div>
          <span className="text-[10px] text-emerald-700 dark:text-teal-400 font-medium mt-0.5">{t('status_active')}</span>
        </div>

        {/* Metric 2: Yaş Ortalaması (Narrow Compact) */}
        <div className="px-2.5 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[9.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide truncate">{t('kpi_avg_age')}</span>
          <div className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5 leading-tight whitespace-nowrap">{avgAge} {t('unit_age')}</div>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">{lang === 'ru' ? 'Молодой коллектив' : 'Genç & Dinamik'}</span>
        </div>

        {/* Metric 3: Turnover (Sirkülasyon) Oranı (Narrow Compact) */}
        <div
          onClick={() => onNavigateToTurnover && onNavigateToTurnover()}
          title={lang === 'ru' ? 'Перейти к отчету по текучести и увольнениям' : 'Yönetim & Turnover Detay Sayfasına Git'}
          className="px-2.5 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 hover:bg-emerald-50/40 dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9.5px] font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide truncate">
              {lang === 'ru' ? 'Ср. текучесть' : 'Ort. Turnover'}
            </span>
            <ArrowUpRight className="w-3 h-3 text-teal-500 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </div>
          <div className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight font-mono mt-0.5">
            %{turnoverRate.toFixed(1)}
          </div>
          <span className="text-[10px] text-emerald-700 dark:text-teal-400 font-medium mt-0.5">
            {lang === 'ru' ? 'В месяц' : 'Aylık Devir'}
          </span>
        </div>

        {/* Metric 4: Son 1 Hafta Giriş / Çıkış Speedometer Gauge (with Nested VKS Arc Inside) */}
        <div
          onClick={() => onNavigateToTurnover && onNavigateToTurnover()}
          title={lang === 'ru' ? 'Перейти к деталям приемов и увольнений за последнюю неделю' : 'Son 1 Hafta Giriş & Çıkış Detayları İçin Tıklayın'}
          className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 hover:bg-emerald-50/25 dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide truncate">
                {lang === 'ru' ? 'Движение (Посл. 1 нед.)' : 'Giriş / Çıkış (Son 1 Hafta)'}
              </span>
              <span
                className={`px-1.5 py-0 rounded-full text-[9.5px] font-bold font-mono border shrink-0 ${
                  netFlow >= 0
                    ? 'bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700'
                    : 'bg-rose-100/90 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-300/80 dark:border-rose-700'
                }`}
              >
                {netFlow >= 0 ? `+${netFlow}` : netFlow} Net
              </span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-teal-400 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </div>

          <div className="flex items-center justify-between gap-1.5 -mt-0.5">
            {/* Left Flank: Giriş + VKS Giriş */}
            <div className="flex flex-col items-start justify-center min-w-[76px]">
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-extrabold font-mono text-emerald-700 dark:text-emerald-400 leading-none">
                  +{inLatest.toLocaleString('tr-TR')}
                </span>
                <span className="text-[9.5px] font-bold text-emerald-600/90 dark:text-emerald-300">%{inPct}</span>
              </div>
              <span className="text-[9.5px] font-medium text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {lang === 'ru' ? 'Прием' : 'Giriş'}
              </span>
              <span className="mt-1 px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/35 text-[9px] font-bold whitespace-nowrap">
                VKS +{inVksLatest} (%{inVksRate})
              </span>
            </div>

            {/* Center Dual-Arc SVG Speedometer (Outer = Giriş/Çıkış, Inner = VKS Ratios) */}
            <div className="shrink-0 flex flex-col items-center justify-center">
              <svg
                viewBox="0 0 180 96"
                className="w-[144px] sm:w-[154px] h-[76px] overflow-visible"
                aria-label="Giriş Çıkış Speedometer"
              >
                <defs>
                  <linearGradient id="spInGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#34D399" />
                  </linearGradient>
                  <linearGradient id="spOutGrad" x1="100%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#E11D48" />
                    <stop offset="100%" stopColor="#FB7185" />
                  </linearGradient>
                  <linearGradient id="spVksInGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0D9488" />
                    <stop offset="100%" stopColor="#2DD4BF" />
                  </linearGradient>
                  <linearGradient id="spVksOutGrad" x1="100%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#D97706" />
                    <stop offset="100%" stopColor="#F59E0B" />
                  </linearGradient>
                </defs>

                {/* Subtle Speedometer Scale Ticks */}
                {ticks.map((tk, i) => (
                  <line
                    key={i}
                    x1={tk.x1}
                    y1={tk.y1}
                    x2={tk.x2}
                    y2={tk.y2}
                    stroke="currentColor"
                    className="text-slate-300 dark:text-slate-600"
                    strokeWidth={i === 2 ? 1.8 : 1.2}
                    strokeLinecap="round"
                  />
                ))}

                {/* Outer Track */}
                <path
                  d={`M ${spCx - outerR} ${spCy} A ${outerR} ${outerR} 0 0 1 ${spCx + outerR} ${spCy}`}
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-700/70"
                  strokeWidth={11}
                  strokeLinecap="round"
                />

                {/* Outer Arc Left: Giriş (Emerald) */}
                <path
                  d={`M ${spCx - outerR} ${spCy} A ${outerR} ${outerR} 0 0 1 ${spCx + outerR} ${spCy}`}
                  fill="none"
                  stroke="url(#spInGrad)"
                  strokeWidth={11}
                  strokeLinecap="butt"
                  strokeDasharray={`${outerInLen} ${outerCirc}`}
                />

                {/* Outer Arc Right: Çıkış (Rose) */}
                <path
                  d={`M ${spCx + outerR} ${spCy} A ${outerR} ${outerR} 0 0 0 ${spCx - outerR} ${spCy}`}
                  fill="none"
                  stroke="url(#spOutGrad)"
                  strokeWidth={11}
                  strokeLinecap="butt"
                  strokeDasharray={`${outerOutLen} ${outerCirc}`}
                />

                {/* Inner VKS Track (Nested inside Speedometer) */}
                <path
                  d={`M ${spCx - innerR} ${spCy} A ${innerR} ${innerR} 0 0 1 ${spCx + innerR} ${spCy}`}
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200/90 dark:text-slate-700/60"
                  strokeWidth={5.5}
                  strokeLinecap="round"
                />

                {/* Inner VKS Left: VKS Giriş Ratio (Teal) */}
                {innerVksInLen > 0 && (
                  <path
                    d={`M ${spCx - innerR} ${spCy} A ${innerR} ${innerR} 0 0 1 ${spCx + innerR} ${spCy}`}
                    fill="none"
                    stroke="url(#spVksInGrad)"
                    strokeWidth={5.5}
                    strokeLinecap="round"
                    strokeDasharray={`${innerVksInLen} ${innerCirc}`}
                  />
                )}

                {/* Inner VKS Right: VKS Çıkış Ratio (Amber) */}
                {innerVksOutLen > 0 && (
                  <path
                    d={`M ${spCx + innerR} ${spCy} A ${innerR} ${innerR} 0 0 0 ${spCx - innerR} ${spCy}`}
                    fill="none"
                    stroke="url(#spVksOutGrad)"
                    strokeWidth={5.5}
                    strokeLinecap="round"
                    strokeDasharray={`${innerVksOutLen} ${innerCirc}`}
                  />
                )}

                {/* Inner Center VKS Summary Readout (100% unobstructed inside the gauge arch) */}
                <text
                  x={spCx}
                  y={spCy - 21}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[7.5px] font-bold tracking-wider"
                >
                  {lang === 'ru' ? 'ДОЛЯ ВКС' : 'VKS ORANI'}
                </text>
                <text
                  x={spCx}
                  y={spCy - 6}
                  textAnchor="middle"
                  className="fill-slate-800 dark:fill-slate-100 text-[11px] font-extrabold font-mono"
                >
                  <tspan className="fill-teal-700 dark:fill-teal-300">%{inVksRate}</tspan>
                  <tspan className="fill-slate-400"> / </tspan>
                  <tspan className="fill-amber-600 dark:fill-amber-400">%{outVksRate}</tspan>
                </text>

                {/* Precision Rim-Mounted Speedometer Pointer (sits cleanly across the split without covering center text) */}
                <polygon
                  points={`${needleTipX},${needleTipY} ${needleB1X},${needleB1Y} ${needleB2X},${needleB2Y}`}
                  className="fill-slate-900 dark:fill-white stroke-white dark:stroke-slate-900 transition-all duration-500"
                  strokeWidth={1.3}
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Right Flank: Çıkış + VKS Çıkış */}
            <div className="flex flex-col items-end justify-center min-w-[76px] text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-[9.5px] font-bold text-rose-600/90 dark:text-rose-300">%{outPct}</span>
                <span className="text-sm font-extrabold font-mono text-rose-700 dark:text-rose-400 leading-none">
                  -{outLatest.toLocaleString('tr-TR')}
                </span>
              </div>
              <span className="text-[9.5px] font-medium text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {lang === 'ru' ? 'Увольнение' : 'Çıkış'}
              </span>
              <span className="mt-1 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9px] font-bold whitespace-nowrap">
                VKS -{outVksLatest} (%{outVksRate})
              </span>
            </div>
          </div>
        </div>

        {/* Metric 5: Cinsiyet (Erkek & Kadın) Side-by-Side Boxes */}
        <div className="grid grid-cols-2 gap-2 items-stretch">
          {/* ERKEK */}
          <div
            onClick={() => onSelectGender && onSelectGender('Erkek')}
            className={`px-2.5 py-1.5 rounded-xl bg-gradient-to-b from-teal-50/90 via-emerald-50/40 to-teal-100/50 dark:from-teal-950/50 dark:via-slate-900/70 dark:to-teal-950/40 border transition-all cursor-pointer flex items-center gap-2 group shadow-xs ${
              selectedGender === 'Erkek'
                ? 'border-teal-500 ring-2 ring-teal-500/40'
                : selectedGender !== 'all'
                ? 'border-teal-200/50 dark:border-teal-500/20 opacity-45'
                : 'border-teal-200/90 dark:border-teal-500/30 hover:border-teal-400'
            }`}
            title={lang === 'ru' ? 'Фильтр: Мужчины' : 'Erkek Kadroyu Filtrele'}
          >
            <div className="px-1 py-1 rounded-lg bg-white/90 dark:bg-slate-900/80 border border-teal-200/70 dark:border-teal-800/60 shrink-0 group-hover:scale-105 transition-transform flex items-center justify-center">
              <WcMaleIcon className="w-5 h-11" />
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1">
                <span className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                  {lang === 'ru' ? 'Мужчины' : 'Erkek'}
                </span>
                <span className="text-[9.5px] px-1 rounded bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-bold">
                  %{malePct}
                </span>
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5 tracking-tight leading-none">
                {maleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
              </p>
              <span className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {lang === 'ru' ? 'Активный' : 'Aktif Kadro'}
              </span>
            </div>
          </div>

          {/* KADIN */}
          <div
            onClick={() => onSelectGender && onSelectGender('Kadin')}
            className={`px-2.5 py-1.5 rounded-xl bg-gradient-to-b from-violet-50/90 via-purple-50/40 to-violet-100/50 dark:from-violet-950/45 dark:via-slate-900/70 dark:to-violet-950/40 border transition-all cursor-pointer flex items-center gap-2 group shadow-xs ${
              selectedGender === 'Kadin'
                ? 'border-violet-500 ring-2 ring-violet-500/40'
                : selectedGender !== 'all'
                ? 'border-violet-200/50 dark:border-violet-500/20 opacity-45'
                : 'border-violet-200/90 dark:border-violet-500/30 hover:border-violet-400'
            }`}
            title={lang === 'ru' ? 'Фильтр: Женщины' : 'Kadın Kadroyu Filtrele'}
          >
            <div className="px-1 py-1 rounded-lg bg-white/90 dark:bg-slate-900/80 border border-violet-200/70 dark:border-violet-800/60 shrink-0 group-hover:scale-105 transition-transform flex items-center justify-center">
              <WcFemaleIcon className="w-5 h-11" />
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1">
                <span className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                  {lang === 'ru' ? 'Женщины' : 'Kadın'}
                </span>
                <span className="text-[9.5px] px-1 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-bold">
                  %{femalePct}
                </span>
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5 tracking-tight leading-none">
                {femaleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
              </p>
              <span className="text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {lang === 'ru' ? 'Активный' : 'Aktif Kadro'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
