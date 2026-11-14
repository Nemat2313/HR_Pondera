'use client';

import React, { useState } from 'react';
import { Scale, Calendar, ArrowUpRight, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { useLanguage } from '@/context/LanguageContext';

export interface ZupHubSummary {
  zupTotal: number;
  realActive: number;
  matchedActiveBoth: number;
  realOnlyNotInZup: number;
  zupActiveButRealExited: number;
  transferPermitCheckCount: number;
  officialMatchPct: number;
}

interface PowerBIHubCompanionCardProps {
  zup?: ZupHubSummary | null;
  tenureBrackets: { label: string; count: number }[];
  avgTenure: number;
  totalCount: number;
  onNavigateToOfficialReal?: () => void;
  onOpenTenureDetail?: () => void;
}

const TENURE_COLORS = ['#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#f59e0b'];

export default function PowerBIHubCompanionCard({
  zup,
  tenureBrackets,
  avgTenure,
  totalCount,
  onNavigateToOfficialReal,
  onOpenTenureDetail,
}: PowerBIHubCompanionCardProps) {
  const { lang } = useLanguage();
  const [mode, setMode] = useState<'zup' | 'tenure'>('zup');

  const z = zup || {
    zupTotal: 4560,
    realActive: totalCount || 5366,
    matchedActiveBoth: 4525,
    realOnlyNotInZup: 841,
    zupActiveButRealExited: 35,
    transferPermitCheckCount: 23,
    officialMatchPct: 84.3,
  };

  const zupOnlyNoEba = Math.max(0, z.zupTotal - z.matchedActiveBoth - z.zupActiveButRealExited);
  const unionTotal = Math.max(1, z.matchedActiveBoth + z.realOnlyNotInZup + zupOnlyNoEba + z.zupActiveButRealExited);

  const verticalRows = [
    {
      id: 'both',
      label: lang === 'ru' ? '1. В обоих (Актив)' : '1. Her İkisinde Mevcut',
      zupCount: z.matchedActiveBoth,
      ebaCount: z.matchedActiveBoth,
      zupColor: 'bg-emerald-500',
      ebaColor: 'bg-emerald-500',
      badgeClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50',
      minH: 88,
    },
    {
      id: 'eba_only',
      label: lang === 'ru' ? '2. Только в eBA' : "2. Sadece eBA'da Var",
      zupCount: 0,
      ebaCount: z.realOnlyNotInZup,
      zupColor: 'bg-slate-200/70 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700',
      ebaColor: 'bg-cyan-500',
      badgeClass: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-700/50',
      minH: 46,
    },
    {
      id: 'zup_only',
      label: lang === 'ru' ? '3. Только в 1С ЗУП' : "3. Sadece ZUP'ta Var",
      zupCount: zupOnlyNoEba,
      ebaCount: 0,
      zupColor: 'bg-purple-500',
      ebaColor: 'bg-slate-200/70 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700',
      ebaColorText: '',
      badgeClass: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700/50',
      minH: 38,
    },
    {
      id: 'zup_exit',
      label: lang === 'ru' ? '4. В ЗУП / Уволен' : '4. ZUP Aktif • Çıkışlı',
      zupCount: z.zupActiveButRealExited,
      ebaCount: 0,
      zupColor: 'bg-rose-500',
      ebaColor: 'bg-rose-100/70 dark:bg-rose-950/40 border border-dashed border-rose-300 dark:border-rose-700/60',
      badgeClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700/50',
      minH: 34,
    },
  ];

  const tenureData = (tenureBrackets || []).map((t, i) => ({
    label:
      lang === 'ru'
        ? t.label
            .replace(/Yıl/gi, 'г.')
            .replace(/Ay/gi, 'мес.')
        : t.label,
    count: t.count,
    color: TENURE_COLORS[i % TENURE_COLORS.length],
  }));

  return (
    <div className="p-3.5 sm:p-4 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-indigo-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors flex-1 h-full">
      {/* Header with Mode Switcher (Green-to-white gradient) */}
      <div className="-mx-3.5 -mt-3.5 sm:-mx-4 sm:-mt-4 px-3.5 py-2.5 sm:px-4 sm:py-3 mb-2.5 rounded-t-2xl bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#131F38] flex items-center justify-between gap-2 border-b border-emerald-200/70 dark:border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center border border-indigo-200/60 dark:border-indigo-500/30 shrink-0">
            {mode === 'zup' ? (
              <Scale className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            )}
          </div>
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setMode('zup')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                mode === 'zup'
                  ? 'bg-white dark:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? '1C ЗУП Сверка' : '1C ZUP Mutabakat'}
            </button>
            <button
              type="button"
              onClick={() => setMode('tenure')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                mode === 'tenure'
                  ? 'bg-white dark:bg-teal-500/30 text-teal-950 dark:text-teal-100 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? 'Стаж' : 'Kıdem Yılı'}
            </button>
          </div>
        </div>

        {mode === 'zup' ? (
          <button
            type="button"
            onClick={() => onNavigateToOfficialReal && onNavigateToOfficialReal()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 text-[11px] font-semibold border border-indigo-300 dark:border-indigo-500/40 transition-all cursor-pointer shrink-0"
          >
            <span>{lang === 'ru' ? 'В 1С ЗУП' : '1C ZUP Aç'}</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenTenureDetail && onOpenTenureDetail()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 text-teal-900 dark:text-teal-200 text-[11px] font-semibold border border-teal-300/80 dark:border-teal-500/30 transition-all cursor-pointer shrink-0"
          >
            <span>Ort. {avgTenure} Yıl</span>
          </button>
        )}
      </div>

      {mode === 'zup' ? (
        <div
          onClick={() => onNavigateToOfficialReal && onNavigateToOfficialReal()}
          className="flex-1 flex flex-col justify-between pt-2.5 cursor-pointer group"
        >
          {/* Top KPI Strip */}
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-gradient-to-r from-indigo-50/80 via-cyan-50/50 to-emerald-50/60 dark:from-indigo-950/45 dark:via-slate-900/70 dark:to-emerald-950/35 border border-indigo-200/70 dark:border-indigo-500/25">
            <div>
              <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 block">
                {lang === 'ru' ? 'Официальный штат 1С ЗУП' : '1C ZUP Resmi Bordro'}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black font-mono text-indigo-700 dark:text-indigo-300">
                  {z.zupTotal.toLocaleString('tr-TR')}
                </span>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  / {z.realActive.toLocaleString('tr-TR')} saha
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-700 text-xs font-black font-mono">
                <CheckCircle2 className="w-3 h-3" />%{z.officialMatchPct}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                {lang === 'ru' ? 'Офиц. охват' : 'Resmi Eşleşme'}
              </span>
            </div>
          </div>

          {/* Vertical 2-Track Axis: 1C ZUP (Left) ↔ eBA Real (Right) */}
          <div className="flex-1 flex flex-col justify-between py-2.5 gap-2">
            {/* Column Track Headers */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-[10.5px] font-bold">
              <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                <span>{lang === 'ru' ? '1С ЗУП' : '1C ZUP'}</span>
                <span className="ml-auto font-mono text-slate-900 dark:text-white">{z.zupTotal.toLocaleString('tr-TR')}</span>
              </div>
              <span className="text-[9.5px] text-slate-400 font-semibold px-1">↔</span>
              <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
                <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                <span>{lang === 'ru' ? 'eBA Real' : 'eBA Real'}</span>
                <span className="ml-auto font-mono text-slate-900 dark:text-white">{z.realActive.toLocaleString('tr-TR')}</span>
              </div>
            </div>

            {/* 4 Vertical Proportional Rows */}
            <div className="flex-1 flex flex-col justify-between gap-2">
              {verticalRows.map((row) => {
                const segMax = Math.max(row.zupCount, row.ebaCount);
                const sharePct = Math.round((segMax / unionTotal) * 100);
                const barH = Math.max(row.minH, Math.min(115, Math.round((segMax / unionTotal) * 155)));
                return (
                  <div
                    key={row.id}
                    className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${row.badgeClass}`}>
                        {row.label}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                        %{sharePct}
                      </span>
                    </div>

                    <div className="grid grid-cols-[1fr_10px_1fr] items-end gap-1.5" style={{ minHeight: `${barH}px` }}>
                      {/* Left: 1C ZUP Vertical Block */}
                      <div className="h-full flex flex-col justify-end">
                        <div
                          className={`w-full rounded-lg ${row.zupColor} flex items-center justify-center px-2 transition-all duration-700 shadow-2xs`}
                          style={{ height: `${row.zupCount > 0 ? barH : Math.max(26, Math.round(barH * 0.65))}px` }}
                        >
                          <span
                            className={`font-mono text-xs font-black ${
                              row.zupCount > 0 ? 'text-white' : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {row.zupCount > 0 ? row.zupCount.toLocaleString('tr-TR') : '0'}
                          </span>
                        </div>
                      </div>

                      {/* Center Vertical Axis Divider */}
                      <div className="h-full flex flex-col items-center justify-center">
                        <div className="w-0.5 h-full bg-slate-300/80 dark:bg-slate-700 rounded-full relative">
                          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-400" />
                        </div>
                      </div>

                      {/* Right: eBA Real Vertical Block */}
                      <div className="h-full flex flex-col justify-end">
                        <div
                          className={`w-full rounded-lg ${row.ebaColor} flex items-center justify-center px-2 transition-all duration-700 shadow-2xs`}
                          style={{ height: `${row.ebaCount > 0 ? barH : Math.max(26, Math.round(barH * 0.65))}px` }}
                        >
                          <span
                            className={`font-mono text-xs font-black ${
                              row.ebaCount > 0
                                ? 'text-white'
                                : row.id === 'zup_exit'
                                ? 'text-rose-600 dark:text-rose-300 text-[10px]'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {row.ebaCount > 0
                              ? row.ebaCount.toLocaleString('tr-TR')
                              : row.id === 'zup_exit'
                              ? lang === 'ru'
                                ? 'Уволен'
                                : 'Çıkışlı'
                              : '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Actionable Alert Chips */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10.5px]">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold">
              <AlertTriangle className="w-3 h-3" />
              {z.zupActiveButRealExited} {lang === 'ru' ? 'к увольнению' : 'Çıkış Bekleyen'}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
              <Layers className="w-3 h-3" />
              {z.transferPermitCheckCount} {lang === 'ru' ? 'перевод ОП' : 'Şube Farkı'}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between pt-2">
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tenureData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 9.5, fill: '#64748b' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(20,184,166,0.08)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-xs">
                        <span className="font-bold">{item.label}: </span>
                        <span className="font-mono font-black">{item.count.toLocaleString('tr-TR')}</span>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} animationDuration={800}>
                  {tenureData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Распределение по стажу в компании' : 'Şirket içi çalışma süresi kırılımı'}</span>
            <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
              {totalCount.toLocaleString('tr-TR')} kişi
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

