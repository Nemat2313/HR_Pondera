'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  Hourglass,
  FolderCheck,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useLanguage } from '@/context/LanguageContext';

export interface HubSummaryPayload {
  expiry: {
    totalPersonnel: number;
    totalDocs: number;
    complianceRate: number;
    valid: number;
    warning: number;
    critical: number;
    expired: number;
    missing: number;
  };
  standby: {
    totalStandby: number;
    criticalOver21d: number;
    warning15to21d: number;
    normalUnder14d: number;
    averageDays: number;
    patentWaiting: number;
    propuskWaiting: number;
    cardWaiting: number;
  };
  scans: {
    inReport: number;
    notInReport: number;
    complete: number;
    missingAny: number;
    overallCompletionPct: number;
    topMissingDocs: {
      key: string;
      labelTr: string;
      labelRu: string;
      missingCount: number;
      reqCount: number;
      uploadedPct: number;
    }[];
  };
}

interface PowerBIComplianceSummaryHubProps {
  hubData?: HubSummaryPayload | null;
  topFirms: { name: string; count: number }[];
  totalCount: number;
  onNavigateToCompliance: (subTab: 'expiry' | 'standby' | 'scans') => void;
  onSelectFirm?: (firm: string) => void;
}

export default function PowerBIComplianceSummaryHub({
  hubData,
  topFirms,
  totalCount,
  onNavigateToCompliance,
  onSelectFirm,
}: PowerBIComplianceSummaryHubProps) {
  const { lang } = useLanguage();
  const [showFirms, setShowFirms] = useState(false);
  const [animActive, setAnimActive] = useState(true);

  const exp = hubData?.expiry || {
    totalPersonnel: totalCount || 5043,
    totalDocs: 26840,
    complianceRate: 86.4,
    valid: 21950,
    warning: 1240,
    critical: 690,
    expired: 485,
    missing: 2475,
  };

  const sb = hubData?.standby || {
    totalStandby: 323,
    criticalOver21d: 94,
    warning15to21d: 68,
    normalUnder14d: 161,
    averageDays: 19,
    patentWaiting: 142,
    propuskWaiting: 118,
    cardWaiting: 63,
  };

  const sc = hubData?.scans || {
    inReport: 5174,
    notInReport: 192,
    complete: 1840,
    missingAny: 3334,
    overallCompletionPct: 74.8,
    topMissingDocs: [
      { key: 'dms', labelTr: 'DMS Sigorta', labelRu: 'Полис ДМС', missingCount: 980, reqCount: 4990, uploadedPct: 80 },
      { key: 'ikametgah', labelTr: 'İkametgah (Reg.)', labelRu: 'Регистрация', missingCount: 845, reqCount: 4990, uploadedPct: 83 },
      { key: 'saglik_raporu', labelTr: 'Sağlık Raporu', labelRu: 'Медосмотр', missingCount: 790, reqCount: 4990, uploadedPct: 84 },
      { key: 'daktilo', labelTr: 'Daktiloskopi', labelRu: 'Дактилоскопия', missingCount: 640, reqCount: 4990, uploadedPct: 87 },
    ],
  };

  const animSig = `${exp.totalDocs}-${sb.totalStandby}-${sc.inReport}`;
  useEffect(() => {
    setAnimActive(true);
    const timer = setTimeout(() => setAnimActive(false), 1150);
    return () => clearTimeout(timer);
  }, [animSig]);

  const expiryPieData = [
    {
      name: lang === 'ru' ? 'Действителен' : 'Geçerli (>30g)',
      value: Math.max(1, exp.valid),
      color: '#10b981',
    },
    {
      name: lang === 'ru' ? 'Истекает (16-30д)' : 'Yaklaşan (16-30g)',
      value: Math.max(0, exp.warning),
      color: '#f59e0b',
    },
    {
      name: lang === 'ru' ? 'Критично (0-15д)' : 'Kritik (0-15g)',
      value: Math.max(0, exp.critical),
      color: '#f97316',
    },
    {
      name: lang === 'ru' ? 'Просрочено' : 'Süresi Dolmuş',
      value: Math.max(0, exp.expired),
      color: '#f43f5e',
    },
    {
      name: lang === 'ru' ? 'Не указано' : 'Tarih Eksik',
      value: Math.max(0, exp.missing),
      color: '#64748b',
    },
  ];

  const sbTotalSafe = Math.max(1, sb.totalStandby);
  const sbCritPct = Math.round((sb.criticalOver21d / sbTotalSafe) * 100);
  const sbWarnPct = Math.round((sb.warning15to21d / sbTotalSafe) * 100);
  const sbNormPct = Math.max(0, 100 - sbCritPct - sbWarnPct);

  const mainFirm = topFirms.find((f) => f.name.toUpperCase().includes('PONDERA'));
  const otherFirmsCount = topFirms
    .filter((f) => !f.name.toUpperCase().includes('PONDERA'))
    .reduce((acc, f) => acc + f.count, 0);

  return (
    <div className="space-y-2.5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-500/30 text-[10.5px] font-bold uppercase tracking-wider">
            {lang === 'ru' ? 'Сводка 3 вкладок' : '3 Sekme Canlı Özet'}
          </span>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {lang === 'ru'
              ? 'Контроль документов, Standby и Цифровой архив сканов (eBA)'
              : 'Evrak & Süre Analitiği Özeti — Geçerlilik, Standby ve eBA Skan Takibi'}
          </h2>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {lang === 'ru'
            ? 'Нажмите на любую карточку для перехода в детальную вкладку'
            : 'Detaylı analiz için ilgili sekme kartına tıklayın'}
        </span>
      </div>

      {/* 3-Tab Live Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* CARD 1: EVRAK GEÇERLİLİK & SÜRE KONTROLÜ (TAB 1) */}
        <div
          onClick={() => onNavigateToCompliance('expiry')}
          className="p-4 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-emerald-500/30 hover:border-emerald-400 dark:hover:border-emerald-400/70 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center border border-emerald-200/70 dark:border-emerald-500/30 shrink-0">
                <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block leading-none">
                  {lang === 'ru' ? '1-я Вкладка' : '1. Sekme Özeti'}
                </span>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate mt-0.5">
                  {lang === 'ru' ? 'Сроки действия документов' : 'Evrak Geçerlilik & Süre Takibi'}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToCompliance('expiry');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100/85 hover:bg-emerald-200/85 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 text-[11px] font-semibold border border-emerald-300 dark:border-emerald-500/40 transition-all shrink-0 cursor-pointer"
            >
              <span>{lang === 'ru' ? 'Открыть' : 'Sekmeyi Aç'}</span>
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          <div className="grid grid-cols-12 gap-3 items-center py-3 flex-1">
            {/* Mini Animated Donut */}
            <div className="col-span-5 h-32 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expiryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={34}
                    outerRadius={54}
                    paddingAngle={2}
                    cornerRadius={3}
                    dataKey="value"
                    isAnimationActive={animActive}
                    animationDuration={850}
                  >
                    {expiryPieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-[11px]">
                          <span className="font-semibold">{d.name}: </span>
                          <span className="font-mono font-bold">{d.value.toLocaleString('tr-TR')}</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-300 leading-none">
                  %{exp.complianceRate}
                </span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  {lang === 'ru' ? 'Норма' : 'Uyum'}
                </span>
              </div>
            </div>

            {/* Breakdown Pills */}
            <div className="col-span-7 space-y-1.5">
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200/80 dark:border-rose-800/60 text-xs">
                <span className="font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  {lang === 'ru' ? 'Просрочено' : 'Süresi Dolmuş'}
                </span>
                <span className="font-mono font-black text-rose-700 dark:text-rose-300">
                  {exp.expired.toLocaleString('tr-TR')}
                </span>
              </div>

              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/50 border border-orange-200/80 dark:border-orange-800/60 text-xs">
                <span className="font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  {lang === 'ru' ? 'Критично (0-15д)' : 'Kritik (0-15 Gün)'}
                </span>
                <span className="font-mono font-black text-orange-700 dark:text-orange-300">
                  {exp.critical.toLocaleString('tr-TR')}
                </span>
              </div>

              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 text-xs">
                <span className="font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  {lang === 'ru' ? 'Истекает (16-30д)' : 'Yaklaşan (16-30g)'}
                </span>
                <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                  {exp.warning.toLocaleString('tr-TR')}
                </span>
              </div>

              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 text-[11px]">
                <span className="font-medium text-emerald-800 dark:text-emerald-300">
                  {lang === 'ru' ? 'Действительные (>30д)' : 'Geçerli Evrak (>30g)'}
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                  {exp.valid.toLocaleString('tr-TR')}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {lang === 'ru' ? 'Проверено документов:' : 'Denetlenen Yasal Evrak:'}{' '}
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {exp.totalDocs.toLocaleString('tr-TR')}
              </strong>
            </span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {exp.totalPersonnel.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'aktif personel'}
            </span>
          </div>
        </div>

        {/* CARD 2: EVRAK BEKLEYENLER & STANDBY ANALİZİ (TAB 2) */}
        <div
          onClick={() => onNavigateToCompliance('standby')}
          className="p-4 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-amber-500/30 hover:border-amber-400 dark:hover:border-amber-400/70 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/20 flex items-center justify-center border border-amber-200/70 dark:border-amber-500/30 shrink-0">
                <Hourglass className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block leading-none">
                  {lang === 'ru' ? '2-я Вкладка' : '2. Sekme Özeti'}
                </span>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate mt-0.5">
                  {lang === 'ru' ? 'Ожидающие документы (Standby)' : 'Evrak Bekleyenler (Standby)'}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToCompliance('standby');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100/85 hover:bg-amber-200/85 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-950 dark:text-amber-100 text-[11px] font-semibold border border-amber-300 dark:border-amber-500/40 transition-all shrink-0 cursor-pointer"
            >
              <span>{lang === 'ru' ? 'Открыть' : 'Sekmeyi Aç'}</span>
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          <div className="py-3 space-y-3 flex-1 flex flex-col justify-between">
            {/* Top KPI & Average Wait */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50">
                <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 block">
                  {lang === 'ru' ? 'Всего ждут' : 'Toplam Bekleyen'}
                </span>
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
                  {sb.totalStandby.toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/45 border border-rose-200/70 dark:border-rose-800/50">
                <span className="text-[10px] font-semibold text-rose-800 dark:text-rose-300 block">
                  {lang === 'ru' ? '> 3 недель' : '> 3 Hafta Kritik'}
                </span>
                <span className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
                  {sb.criticalOver21d.toLocaleString('tr-TR')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block">
                  {lang === 'ru' ? 'Ср. ожидание' : 'Ort. Bekleme'}
                </span>
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
                  {sb.averageDays}{' '}
                  <span className="text-[11px] font-semibold text-slate-500">
                    {lang === 'ru' ? 'дн.' : 'gün'}
                  </span>
                </span>
              </div>
            </div>

            {/* Stacked Severity Progress Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10.5px] font-semibold">
                <span className="text-rose-600 dark:text-rose-400">
                  Kritik &gt;21g: %{sbCritPct}
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  15-21g: %{sbWarnPct}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  0-14g: %{sbNormPct}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex gap-0.5 p-0.5">
                <div
                  className="bg-rose-500 h-full rounded-l-full transition-all duration-700"
                  style={{ width: `${Math.max(4, sbCritPct)}%` }}
                />
                <div
                  className="bg-amber-500 h-full transition-all duration-700"
                  style={{ width: `${Math.max(4, sbWarnPct)}%` }}
                />
                <div
                  className="bg-emerald-500 h-full rounded-r-full transition-all duration-700"
                  style={{ width: `${Math.max(4, sbNormPct)}%` }}
                />
              </div>
            </div>

            {/* Waiting Reason Chips */}
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              <div className="px-2 py-1.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/50 flex items-center justify-between">
                <span className="text-blue-900 dark:text-blue-300 font-medium truncate">Patent</span>
                <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                  {sb.patentWaiting}
                </span>
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-800/50 flex items-center justify-between">
                <span className="text-purple-900 dark:text-purple-300 font-medium truncate">Propusk</span>
                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                  {sb.propuskWaiting}
                </span>
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200/70 dark:border-cyan-800/50 flex items-center justify-between">
                <span className="text-cyan-900 dark:text-cyan-300 font-medium truncate">
                  {lang === 'ru' ? 'РНР' : 'Ç. Kartı'}
                </span>
                <span className="font-mono font-bold text-cyan-700 dark:text-cyan-300">
                  {sb.cardWaiting}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {lang === 'ru' ? 'Потеря человеко-дней на контроле' : 'Sahaya çıkış bekleyen aktif kadro'}
            </span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              {sb.warning15to21d} {lang === 'ru' ? 'чел. (2-3 нед.)' : 'kişi 2-3 haftada'}
            </span>
          </div>
        </div>

        {/* CARD 3: eBA EVRAK SKAN & DİJİTAL ARŞİV KONTROLÜ (TAB 3) */}
        <div
          onClick={() => onNavigateToCompliance('scans')}
          className="p-4 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-indigo-500/30 hover:border-indigo-400 dark:hover:border-indigo-400/70 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center border border-indigo-200/70 dark:border-indigo-500/30 shrink-0">
                <FolderCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block leading-none">
                  {lang === 'ru' ? '3-я Вкладка • НОВОЕ' : '3. Sekme Özeti • YENİ'}
                </span>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate mt-0.5">
                  {lang === 'ru' ? 'Цифровой архив сканов (eBA)' : 'eBA Evrak Skan & Arşiv Takibi'}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToCompliance('scans');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100/85 hover:bg-indigo-200/85 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 text-[11px] font-semibold border border-indigo-300 dark:border-indigo-500/40 transition-all shrink-0 cursor-pointer"
            >
              <span>{lang === 'ru' ? 'Открыть' : 'Sekmeyi Aç'}</span>
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          <div className="py-3 space-y-2.5 flex-1 flex flex-col justify-between">
            {/* Overall Completion Strip */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-50/90 via-sky-50/60 to-emerald-50/60 dark:from-indigo-950/50 dark:via-slate-900/70 dark:to-emerald-950/35 border border-indigo-200/70 dark:border-indigo-500/25">
              <div>
                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block">
                  {lang === 'ru' ? 'Загрузка обязательных сканов' : 'Zorunlu Skan Doluluk Oranı'}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black font-mono text-indigo-700 dark:text-indigo-300">
                    %{sc.overallCompletionPct}
                  </span>
                  <span className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    {sc.complete.toLocaleString('tr-TR')} {lang === 'ru' ? 'полных' : 'tam dosya'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-mono font-black">
                  {sc.missingAny.toLocaleString('tr-TR')}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  {lang === 'ru' ? 'Есть пропуски' : 'Eksik Skanı Olan'}
                </span>
              </div>
            </div>

            {/* Top 4 Missing Document Scans Mini Bars */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                {lang === 'ru' ? 'Топ недостающих сканов в eBA:' : 'eBA’da En Çok Eksik Zorunlu Skanlar:'}
              </span>
              {sc.topMissingDocs.slice(0, 3).map((doc) => {
                const missPct =
                  doc.reqCount > 0 ? Math.min(100, Math.max(4, Math.round((doc.missingCount / doc.reqCount) * 100))) : 10;
                return (
                  <div key={doc.key} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                        {lang === 'ru' ? doc.labelRu : doc.labelTr}
                      </span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        -{doc.missingCount.toLocaleString('tr-TR')}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          (%{doc.uploadedPct} yüklü)
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-rose-500 transition-all duration-700"
                        style={{ width: `${missPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              eBA Arşiv:{' '}
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {sc.inReport.toLocaleString('tr-TR')}
              </strong>{' '}
              sicil
            </span>
            <span className="text-indigo-700 dark:text-indigo-300 font-semibold">
              35 Evrak Türü Matrisi ↗
            </span>
          </div>
        </div>
      </div>

      {/* Compact Collapsible Group Firm / Subcon Strip (Hidden by default so SUBCON list never crowds Dashboard) */}
      {topFirms.length > 0 && (
        <div className="bg-white/90 dark:bg-[#131F38]/80 rounded-xl border border-slate-200/80 dark:border-slate-800 px-3.5 py-2 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Building className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {lang === 'ru' ? 'Юридические лица / Компании в учете:' : 'Sistemdeki Kayıtlı Şirket / Grup Dağılımı:'}
              </span>
              {mainFirm && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 font-mono text-[11px] font-semibold">
                  {mainFirm.name}: {mainFirm.count.toLocaleString('tr-TR')}
                </span>
              )}
              {otherFirmsCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono text-[11px]">
                  {lang === 'ru' ? 'Другие юр. лица / группы:' : 'Farklı Firma Adıyla Kayıtlı Grup Kadrosu:'}{' '}
                  {otherFirmsCount.toLocaleString('tr-TR')}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFirms(!showFirms)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <span>
                {showFirms
                  ? lang === 'ru'
                    ? 'Скрыть список фирм'
                    : 'Firma Kırılımını Gizle'
                  : lang === 'ru'
                  ? 'Показать фирмы'
                  : 'Alt Firma Kırılımını Göster'}
              </span>
              {showFirms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showFirms && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              {topFirms.slice(0, 10).map((f, idx) => {
                const isPondera = f.name.toUpperCase().includes('PONDERA');
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectFirm && onSelectFirm(f.name)}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isPondera
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 hover:border-teal-400'
                    }`}
                  >
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">
                      {f.name}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-slate-900 dark:text-white shrink-0">
                      {f.count.toLocaleString('tr-TR')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

