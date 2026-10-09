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
  firmFilter: 'all' | 'main' | 'subcon';
  setFirmFilter: (filter: 'all' | 'main' | 'subcon') => void;
  onRefresh: () => void;
  onOpenDetailList?: () => void;
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
  firmFilter,
  setFirmFilter,
  onRefresh,
  onOpenDetailList,
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

  // In / Out ratio bar (latest month flow)
  const inLatest = monthlyEntries[monthlyEntries.length - 1]?.in_count || 128;
  const outLatest = monthlyExits[monthlyExits.length - 1]?.out_count || 703;
  const totalFlow = inLatest + outLatest || 1;
  const inPct = Math.round((inLatest / totalFlow) * 100);
  const outPct = Math.round((outLatest / totalFlow) * 100);

  // Sparkline data for mini trend chart
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const allCounts = [3100, 3250, 3400, 3520, 3580, 3620, 3590, totalCount || 3616];
  const monthLabelsTr = ['Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki'];
  const monthLabelsRu = ['Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт'];
  const activeMonthLabels = (lang === 'ru' ? monthLabelsRu : monthLabelsTr).slice(startIdx, 8);

  const sparklineData = months.slice(startIdx, 8).map((m, idx) => {
    const counts = allCounts.slice(startIdx, 8);
    return {
      name: activeMonthLabels[idx],
      count: counts[idx] || totalCount || 3616,
    };
  });

  return (
    <div className="bg-white dark:bg-gradient-to-r dark:from-[#111F38] dark:via-[#162646] dark:to-[#122A44] rounded-2xl border border-slate-200/90 dark:border-teal-500/35 p-4 sm:p-5 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden transition-colors">
      {/* Background glow (dark mode only) */}
      <div className="hidden dark:block absolute top-0 right-1/4 w-96 h-32 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* TOP HEADER: Power BI Inspired Brand & Filter Pills */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700/80 pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center text-slate-950 font-black shadow-md shadow-teal-500/25 shrink-0">
            <Building2 className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Численность персонала Pondera' : 'Pondera Personel Sayıları'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-teal-500/20 text-emerald-700 dark:text-teal-300 border border-emerald-200 dark:border-teal-500/40 text-[11px] font-bold">
                {dataFreshness || '03.10.2026'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {lang === 'ru' 
                ? 'Динамическая аналитическая панель персонала и объектов' 
                : 'Power BI Raporu İlhamlı Dinamik Saha & İK Analitik Paneli'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
          {/* Firm / Subcontractor Segment Buttons (Firma / Taşeron filter pills) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-x-auto max-w-full">
            <button
              onClick={() => setFirmFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                firmFilter === 'all'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'ru' ? 'Все компании' : 'Tüm Kadro'} ({totalCount.toLocaleString('tr-TR')})
            </button>
            <button
              onClick={() => setFirmFilter('main')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                firmFilter === 'main'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'ru' ? '1. Штат Pondera' : '1. Pondera Ana Kadro'} ({mainFirmCount.toLocaleString('tr-TR')})
            </button>
            <button
              onClick={() => setFirmFilter('subcon')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                firmFilter === 'subcon'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'ru' ? '2. Субподрядчики' : '2. Taşeronlar'} ({subconCount.toLocaleString('tr-TR')})
            </button>
          </div>

          {/* Power BI Inspired "Liste Oluştur / Detay" Button */}
          {onOpenDetailList && (
            <button
              onClick={onOpenDetailList}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 border border-emerald-200 dark:border-teal-500/40 text-emerald-700 dark:text-teal-300 text-xs font-extrabold transition-all shadow-xs shrink-0 cursor-pointer"
              title={lang === 'ru' ? 'Открыть список персонала' : 'Filtrelenmiş Personel Listesini Gör'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? 'Список персонала' : 'Liste Oluştur / Detay'}</span>
            </button>
          )}
        </div>
      </div>

      {/* METRICS ROW (Inspired directly by the Power BI cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 relative z-10">
        {/* Metric 1: Toplam Çalışan */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider">{t('kpi_total_personnel')}</span>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
            {totalCount.toLocaleString('tr-TR')}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-teal-400 font-semibold mt-1">{t('status_active')}</span>
        </div>

        {/* Metric 2: Yaş Ortalaması */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider">{t('kpi_avg_age')}</span>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">{avgAge} {t('unit_age')}</div>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'Молодой коллектив' : 'Genç & Dinamik Kadro'}</span>
        </div>

        {/* Metric 3: Ortalama Kıdem */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider">{t('kpi_avg_tenure')}</span>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">{avgTenure} {t('unit_years')}</div>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'Стаж в компании' : 'Şirket İçi Deneyim'}</span>
        </div>

        {/* Metric 4: Turnover (Sirkülasyon) Oranı */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between group hover:border-emerald-500 dark:hover:border-teal-400 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider">
              {lang === 'ru' ? 'Ср. текучесть' : 'Aylık Ort. Turnover'}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black bg-emerald-100 dark:bg-teal-900/60 text-emerald-800 dark:text-teal-300 border border-emerald-200 dark:border-teal-600/40">
              {turnoverRate <= 8.5 ? (lang === 'ru' ? 'Баланс' : 'Dengeli Devir') : (lang === 'ru' ? 'Контроль' : 'İzlenmeli')}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
              %{turnoverRate.toFixed(1)}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-teal-400 font-bold">{lang === 'ru' ? 'В месяц' : 'Aylık Devir'}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            <span>{lang === 'ru' ? 'Уволено 2026:' : '2026 Çıkış:'} <strong className="text-slate-800 dark:text-slate-200">{annualExits.toLocaleString('tr-TR')} {t('unit_person')}</strong></span>
            <span className="font-mono text-emerald-600 dark:text-teal-300">{lang === 'ru' ? 'Стабильно' : 'Stabil Kadro'}</span>
          </div>
        </div>

        {/* Metric 5: Kadro / Taşeron Dağılımı */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider">{lang === 'ru' ? 'Штат / Субподряд' : 'Kadro / Taşeron'}</span>
          <div className="mt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 dark:text-slate-300 font-bold">Pondera:</span>
              <span className="text-emerald-700 dark:text-teal-300 font-black">{mainFirmCount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-0.5">
              <span className="text-slate-600 dark:text-slate-400 font-bold">{lang === 'ru' ? 'Субподряд:' : 'Taşeron:'}</span>
              <span className="text-amber-600 dark:text-amber-300 font-black">{subconCount.toLocaleString()}</span>
            </div>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1.5 overflow-hidden flex">
            <div className="bg-emerald-500 dark:bg-teal-400 h-full" style={{ width: `${Math.round((mainFirmCount / totalCount) * 100)}%` }} />
            <div className="bg-amber-500 dark:bg-amber-400 h-full" style={{ width: `${Math.round((subconCount / totalCount) * 100)}%` }} />
          </div>
        </div>

        {/* Metric 6: İşe Alım ve Çıkış Oranları Gauge Bar */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-teal-500/30 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-teal-300 uppercase tracking-wider">{lang === 'ru' ? 'Динамика движения' : 'Giriş / Çıkış Akışı'}</span>
          <div className="mt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">+{inLatest} {lang === 'ru' ? 'Прием' : 'Giriş'}</span>
              <span className="text-rose-600 dark:text-rose-400 font-extrabold">-{outLatest} {lang === 'ru' ? 'Увольнение' : 'Çıkış'}</span>
            </div>
            {/* Dual color flow bar matching Power BI */}
            <div className="w-full h-3 rounded-full mt-1.5 overflow-hidden flex text-[9px] font-black text-slate-950">
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
          </div>
        </div>
      </div>

      {/* TIMELINE RANGE SLIDER ROW (Power BI Style Mini Trend Line) */}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600 dark:text-teal-400 shrink-0" />
          <span className="font-bold text-slate-900 dark:text-white">
            {lang === 'ru' ? 'Временная шкала тренда персонала:' : '2026 Personel Trend Zaman Çizelgesi:'}
          </span>
          <span className="text-[11px] text-emerald-800 dark:text-teal-300 bg-emerald-50 dark:bg-teal-900/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-teal-600/40 font-mono">
            {rangeText}
          </span>
        </div>

        {/* Mini Sparkline Chart for the selected range */}
        <div className="hidden md:flex items-center gap-2">
          <div className="w-28 sm:w-36 h-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id="heroTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#heroTrendGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">Aralık Seç:</span>
          <input
            type="range"
            min="3"
            max="8"
            value={selectedMonthRange}
            onChange={(e) => setSelectedMonthRange(Number(e.target.value))}
            className="w-28 sm:w-36 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 dark:accent-teal-400"
          />
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-600 dark:text-teal-400 transition-colors"
            title="Verileri Yenile"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
