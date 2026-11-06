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

  const zupBars = [
    {
      name: lang === 'ru' ? 'В обоих (Штат)' : 'Resmi + Saha Aktif',
      count: z.matchedActiveBoth,
      color: '#10b981',
    },
    {
      name: lang === 'ru' ? 'Только на площадке' : 'Sadece Saha / Hazırlık',
      count: z.realOnlyNotInZup,
      color: '#06b6d4',
    },
    {
      name: lang === 'ru' ? 'В 1С (Уволен с объекта)' : 'ZUP Aktif • Sahadan Çıktı',
      count: z.zupActiveButRealExited,
      color: '#f43f5e',
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
    <div className="p-3.5 sm:p-4 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-indigo-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors flex-1">
      {/* Header with Mode Switcher */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
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

          {/* Animated Horizontal Comparison Bars */}
          <div className="space-y-1.5 py-2">
            {zupBars.map((b, i) => {
              const denom = Math.max(1, z.realActive);
              const pct = Math.min(100, Math.max(2, Math.round((b.count / denom) * 100)));
              return (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {b.name}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {b.count.toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                </div>
              );
            })}
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

