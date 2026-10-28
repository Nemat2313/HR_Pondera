'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  GitCommit,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Hourglass,
  Layers,
  ArrowDown,
  Info,
} from 'lucide-react';

export interface GosuslugiWaterfallChartProps {
  total: number; // 3.088
  serviceRendered: number; // 2.892
  inProgress: number; // 70 (registered + sentPending)
  registeredMvd?: number;
  sentPending?: number;
  refusedMvd: number; // 11
  errors: number; // 30
  mvdNotFound?: number; // 47 (Данные не найдены в базе МВД)
  notSent: number; // 38
  totalSent: number;
  successRatePct?: number;
  totalPdf?: number;
  totalNoPdf?: number;
  onSelectStage?: (stageId: string) => void;
}

export default function GosuslugiWaterfallChart({
  total,
  serviceRendered,
  inProgress,
  registeredMvd = 68,
  sentPending = 2,
  refusedMvd,
  errors,
  mvdNotFound = 0,
  notSent,
  totalSent,
  successRatePct = 99,
  totalPdf = 0,
  totalNoPdf = 0,
  onSelectStage,
}: GosuslugiWaterfallChartProps) {
  // Mode: 'vertical' (classic stepped bridge waterfall) vs 'horizontal' (build-down horizontal flow)
  const [viewMode, setViewMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const safeTotal = total || 3088;
  const renderedPct = Math.round((serviceRendered / safeTotal) * 100);
  const inProgressPct = Math.round((inProgress / safeTotal) * 100);
  const refusedPct = refusedMvd > 0 ? Math.max(1, Math.round((refusedMvd / safeTotal) * 100)) : 0;
  const errorsPct = errors > 0 ? Math.max(1, Math.round((errors / safeTotal) * 100)) : 0;
  const mvdNotFoundPct = mvdNotFound > 0 ? Math.max(1, Math.round((mvdNotFound / safeTotal) * 100)) : 0;
  const notSentPct = notSent > 0 ? Math.max(1, Math.round((notSent / safeTotal) * 100)) : 0;

  // Stages breakdown for the Waterfall
  const stages = [
    {
      id: 'total',
      label: 'Toplam Havuz',
      shortLabel: 'Toplam',
      subtext: 'Başlangıç',
      count: safeTotal,
      displayCount: safeTotal.toLocaleString('tr-TR'),
      pct: 100,
      type: 'base' as const,
      color: '#475569', // slate-600
      bgClass: 'bg-slate-600',
      badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300',
      icon: Layers,
      description: `Toplam VKS Portföyü: ${safeTotal.toLocaleString('tr-TR')} personel`,
      filterKey: 'all',
    },
    {
      id: 'service_rendered',
      label: 'Onaylanan',
      shortLabel: 'Onaylanan',
      subtext: 'Biten Kadro',
      count: serviceRendered,
      displayCount: `-${serviceRendered.toLocaleString('tr-TR')}`,
      pct: renderedPct,
      type: 'deduction' as const,
      color: '#10b981', // emerald-500
      bgClass: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300',
      icon: CheckCircle2,
      description: `Resmi Onay Alındı (Услуга оказана): ${serviceRendered.toLocaleString('tr-TR')} kişi (%${renderedPct})`,
      filterKey: 'service_rendered',
    },
    {
      id: 'in_progress',
      label: 'Süreçte',
      shortLabel: 'Süreçte',
      subtext: 'Yanıt Bekleyen',
      count: inProgress,
      displayCount: `-${inProgress.toLocaleString('tr-TR')}`,
      pct: inProgressPct,
      type: 'deduction' as const,
      color: '#0284c7', // sky-600
      bgClass: 'bg-sky-600',
      badgeClass: 'bg-sky-50 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 border-sky-300',
      icon: Clock,
      description: `Portaldaki Aktif Süreç: ${inProgress.toLocaleString('tr-TR')} kişi (%${inProgressPct}) — ${registeredMvd} МВД Kaydı + ${sentPending} Yanıt Bekleyen`,
      filterKey: 'registered_mvd',
    },
    {
      id: 'refused_mvd',
      label: 'МВД Red',
      shortLabel: 'Red',
      subtext: 'Reddedilen',
      count: refusedMvd,
      displayCount: `-${refusedMvd.toLocaleString('tr-TR')}`,
      pct: refusedPct,
      type: 'deduction' as const,
      color: '#ea580c', // orange-600
      bgClass: 'bg-orange-600',
      badgeClass: 'bg-orange-50 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 border-orange-300',
      icon: XCircle,
      description: `МВД Reddi (Услуга отказана): ${refusedMvd.toLocaleString('tr-TR')} kişi (%${refusedPct}) — Tekrar Gönderim Şablonu Hazır`,
      filterKey: 'refused_mvd',
    },
    {
      id: 'error',
      label: 'Sistem Hatası',
      shortLabel: 'Hata',
      subtext: 'Aksayan Form',
      count: errors,
      displayCount: `-${errors.toLocaleString('tr-TR')}`,
      pct: errorsPct,
      type: 'deduction' as const,
      color: '#e11d48', // rose-600
      bgClass: 'bg-rose-600',
      badgeClass: 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300',
      icon: AlertTriangle,
      description: `Form / Sistem Hatası (Ошибка): ${errors.toLocaleString('tr-TR')} kişi (%${errorsPct}) — Manuel Revizyon Gerekli`,
      filterKey: 'error',
    },
    {
      id: 'mvd_not_found',
      label: "МВД'de Yok",
      shortLabel: 'MVD Yok',
      subtext: 'Adım 9 Uyarı',
      count: mvdNotFound,
      displayCount: `-${mvdNotFound.toLocaleString('tr-TR')}`,
      pct: mvdNotFoundPct,
      type: 'deduction' as const,
      color: '#f59e0b', // amber-500
      bgClass: 'bg-amber-500',
      badgeClass: 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300',
      icon: AlertTriangle,
      description: `Adım 9 МВД Veritabanında Bulunamadı (Данные не найдены в базе МВД — Gönderilmedi): ${mvdNotFound.toLocaleString('tr-TR')} kişi (%${mvdNotFoundPct})`,
      filterKey: 'mvd_not_found',
    },
    {
      id: 'not_sent',
      label: 'Kuyrukta',
      shortLabel: 'Kuyrukta',
      subtext: 'Gönderilmedi',
      count: notSent,
      displayCount: `${notSent.toLocaleString('tr-TR')}`,
      pct: notSentPct,
      type: 'final' as const,
      color: '#64748b', // slate-500
      bgClass: 'bg-slate-500',
      badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300',
      icon: Hourglass,
      description: `Henüz Gönderilmedi (Kuyrukta Bekleyen): ${notSent.toLocaleString('tr-TR')} kişi (%${notSentPct})`,
      filterKey: 'not_sent',
    },
  ];

  // SVG Scaled Coordinates for Vertical Waterfall (7 columns)
  // Fixed plot: width 436, height 226
  // Baseline y = 185, top y = 25 (height 160)
  const vBars = [
    { ...stages[0], x: 14, width: 41, topY: 25, bottomY: 185, height: 160 },
    { ...stages[1], x: 73, width: 41, topY: 25, bottomY: 117, height: 92 },
    { ...stages[2], x: 132, width: 41, topY: 117, bottomY: 136, height: 19 },
    { ...stages[3], x: 191, width: 41, topY: 136, bottomY: 149, height: 13 },
    { ...stages[4], x: 250, width: 41, topY: 149, bottomY: 161, height: 12 },
    { ...stages[5], x: 309, width: 41, topY: 161, bottomY: 173, height: 12 },
    { ...stages[6], x: 368, width: 41, topY: 173, bottomY: 185, height: 12 },
  ];

  return (
    <div className="w-full flex flex-col justify-between bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs transition-colors">
      {/* HEADER & VIEW TOGGLE */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800 shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
              Build-Down Waterfall Analizi
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              3.088 kaydın aşama aşama eksilme ve tamamlanma akışı
            </p>
          </div>
        </div>

        {/* View Toggle: Dikey Waterfall vs Yatay Akış */}
        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[11px] shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('vertical')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'vertical'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
            title="Dikey basamaklı Waterfall Köprüsü"
          >
            <BarChart3 className="w-3 h-3" />
            <span className="hidden sm:inline">Dikey</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('horizontal')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 cursor-pointer ${
              viewMode === 'horizontal'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
            title="Yatay basamaklı Akış Barı"
          >
            <GitCommit className="w-3 h-3" />
            <span className="hidden sm:inline">Yatay</span>
          </button>
        </div>
      </div>

      {/* CHART BODY */}
      {viewMode === 'vertical' ? (
        /* ==========================================================
           1. VERTICAL BUILD-DOWN WATERFALL CHART (Classic Bridge)
        ========================================================== */
        <div className="relative w-full py-2">
          <svg viewBox="0 0 436 226" className="w-full h-56 select-none overflow-visible">
            {/* Baseline Grid Line */}
            <line
              x1="12"
              y1="185"
              x2="424"
              y2="185"
              stroke="#94a3b8"
              strokeWidth="1.25"
              strokeDasharray="2 2"
              className="opacity-40 dark:opacity-30"
            />

            {/* Connecting Dashed Bridge Lines between steps */}
            {vBars.slice(0, -1).map((bar, idx) => {
              const nextBar = vBars[idx + 1];
              const bridgeY = idx === 0 ? bar.topY : bar.bottomY;
              return (
                <line
                  key={`bridge-${bar.id}`}
                  x1={bar.x + bar.width}
                  y1={bridgeY}
                  x2={nextBar.x}
                  y2={bridgeY}
                  stroke="#94a3b8"
                  strokeWidth="1.25"
                  strokeDasharray="3 3"
                  className="opacity-70 dark:opacity-40"
                />
              );
            })}

            {/* Stepped Floating Waterfall Bars */}
            {vBars.map((bar, idx) => {
              const isHovered = hoveredStage === bar.id;
              return (
                <g
                  key={bar.id}
                  className="cursor-pointer transition-transform duration-200"
                  onMouseEnter={() => setHoveredStage(bar.id)}
                  onMouseLeave={() => setHoveredStage(null)}
                  onClick={() => onSelectStage && onSelectStage(bar.filterKey)}
                >
                  {/* Floating Step Bar */}
                  <rect
                    x={bar.x}
                    y={bar.topY}
                    width={bar.width}
                    height={Math.max(6, bar.height)}
                    rx={5}
                    fill={bar.color}
                    opacity={isHovered ? 1 : 0.9}
                    filter={isHovered ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.18))' : 'none'}
                    className="transition-all duration-200"
                  />

                  {/* Value on Top/Inside Bar */}
                  <text
                    x={bar.x + bar.width / 2}
                    y={bar.topY - 6}
                    textAnchor="middle"
                    className="text-[11px] font-normal fill-slate-900 dark:fill-slate-100"
                  >
                    {bar.displayCount}
                  </text>

                  {/* Stage Label Below Baseline */}
                  <text
                    x={bar.x + bar.width / 2}
                    y={202}
                    textAnchor="middle"
                    className="text-[10.5px] font-normal fill-slate-800 dark:fill-slate-200"
                  >
                    {bar.shortLabel}
                  </text>

                  {/* Percentage Tag Below Label */}
                  <text
                    x={bar.x + bar.width / 2}
                    y={217}
                    textAnchor="middle"
                    className="text-[10px] font-normal fill-slate-600 dark:fill-slate-400"
                  >
                    %{bar.pct}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Interactive Tooltip Callout */}
          <div className="min-h-[26px] mt-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-xs">
            {hoveredStage ? (
              <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="font-medium text-[11.5px]">
                  {stages.find((s) => s.id === hoveredStage)?.description}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full text-slate-500 dark:text-slate-400 text-[11px]">
                <span>Sütunlara tıklayarak listeyi filtreleyebilirsiniz</span>
                <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">
                  {serviceRendered.toLocaleString('tr-TR')} / {safeTotal.toLocaleString('tr-TR')} (%{renderedPct} Bitti)
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==========================================================
           2. HORIZONTAL BUILD-DOWN FLOW CHART (Cascade Tiered Bars)
        ========================================================== */
        <div className="space-y-2 py-2">
          {stages.map((stage) => {
            const isHovered = hoveredStage === stage.id;
            return (
              <div
                key={stage.id}
                onMouseEnter={() => setHoveredStage(stage.id)}
                onMouseLeave={() => setHoveredStage(null)}
                onClick={() => onSelectStage && onSelectStage(stage.filterKey)}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                      {stage.label}
                    </span>
                    <span className="text-[10px] text-slate-600 dark:text-slate-300 font-normal">
                      ({stage.subtext})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 dark:text-slate-100 text-xs font-normal">
                      {stage.displayCount}
                    </span>
                    <span className="text-[11px] text-slate-700 dark:text-slate-300 w-8 text-right font-normal">
                      %{stage.pct}
                    </span>
                  </div>
                </div>

                {/* Horizontal Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(2, Math.min(100, stage.pct))}%`,
                      backgroundColor: stage.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FOOTER SUMMARY PILLS (Preserving key metrics from previous donut) */}
      <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
          <span className="block text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-wide font-normal">
            Gönderilen
          </span>
          <span className="text-xs text-slate-900 dark:text-slate-100 font-normal">
            {totalSent.toLocaleString('tr-TR')}
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
          <span className="block text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-wide font-normal">
            Başarı Oranı
          </span>
          <span className="text-xs text-emerald-800 dark:text-emerald-400 font-normal">
            %{successRatePct}
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
          <span className="block text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-wide font-normal">
            Kalan Kuyruk
          </span>
          <span className="text-xs text-slate-800 dark:text-slate-200 font-normal">
            {notSent.toLocaleString('tr-TR')}
          </span>
        </div>
      </div>
    </div>
  );
}
