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

          {/* 3D Glassmorphic Venn / Overlap Diagram: 1C ZUP (Resmi) ↔ eBA Real (Saha) */}
          <div className="flex-1 flex flex-col justify-between py-2 gap-2.5">
            <div className="flex-1 relative rounded-2xl bg-gradient-to-b from-slate-50/90 via-white to-slate-50/70 dark:from-slate-900/70 dark:via-slate-900/40 dark:to-slate-950/70 border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col items-center justify-center overflow-hidden">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  {lang === 'ru' ? 'Сверка: Официальный (1С) ↔ Фактический (eBA)' : 'Resmi (1C ZUP) ↔ Real (eBA) Kesişim Özeti'}
                </span>
              </div>

              <svg viewBox="0 0 360 218" className="w-full max-w-[440px] h-auto drop-shadow-sm select-none my-auto">
                <defs>
                  <radialGradient id="zupSphere3D" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.92" />
                    <stop offset="55%" stopColor="#6366f1" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#312e81" stopOpacity="0.9" />
                  </radialGradient>
                  <radialGradient id="ebaSphere3D" cx="65%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#5eead4" stopOpacity="0.92" />
                    <stop offset="55%" stopColor="#0d9488" stopOpacity="0.82" />
                    <stop offset="100%" stopColor="#134e4a" stopOpacity="0.9" />
                  </radialGradient>
                  <linearGradient id="overlapLens3D" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#34d399" stopOpacity="0.96" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.96" />
                  </linearGradient>
                  <filter id="soft3dShadow" x="-15%" y="-15%" width="130%" height="135%">
                    <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.24" />
                  </filter>
                  <clipPath id="leftCircleClip">
                    <circle cx="126" cy="109" r="94" />
                  </clipPath>
                </defs>

                {/* Left 3D Sphere: 1C ZUP Resmi */}
                <g filter="url(#soft3dShadow)">
                  <circle cx="126" cy="109" r="94" fill="url(#zupSphere3D)" />
                  <ellipse cx="96" cy="64" rx="40" ry="20" fill="white" fillOpacity="0.22" transform="rotate(-22 96 64)" />
                </g>

                {/* Right 3D Sphere: eBA Real Saha */}
                <g filter="url(#soft3dShadow)">
                  <circle cx="234" cy="109" r="94" fill="url(#ebaSphere3D)" />
                  <ellipse cx="264" cy="64" rx="40" ry="20" fill="white" fillOpacity="0.22" transform="rotate(22 264 64)" />
                </g>

                {/* Center Overlap Lens (wide 80-unit intersection for big count) */}
                <g clipPath="url(#leftCircleClip)">
                  <circle cx="234" cy="109" r="94" fill="url(#overlapLens3D)" />
                </g>
                <circle cx="126" cy="109" r="94" fill="none" stroke="white" strokeOpacity="0.38" strokeWidth="1.4" />
                <circle cx="234" cy="109" r="94" fill="none" stroke="white" strokeOpacity="0.38" strokeWidth="1.4" />

                {/* Left Only Text (Sadece ZUP + Çıkışlı) */}
                <text x="74" y="88" textAnchor="middle" fill="white" fontSize="10.5" fontWeight="700" opacity="0.95">
                  {lang === 'ru' ? 'Только 1С' : 'Sadece ZUP'}
                </text>
                <text x="74" y="114" textAnchor="middle" fill="white" fontSize="19" fontWeight="900" fontFamily="monospace">
                  {(zupOnlyNoEba + z.zupActiveButRealExited).toLocaleString('tr-TR')}
                </text>
                <text x="74" y="133" textAnchor="middle" fill="#e0e7ff" fontSize="9.5" fontWeight="600">
                  1C ZUP
                </text>

                {/* Center Match Text (Her İkisinde - Largest) */}
                <text x="180" y="84" textAnchor="middle" fill="white" fontSize="11" fontWeight="800">
                  {lang === 'ru' ? 'Совпадение' : 'Tam Eşleşme'}
                </text>
                <text x="180" y="113" textAnchor="middle" fill="white" fontSize="24" fontWeight="900" fontFamily="monospace">
                  {z.matchedActiveBoth.toLocaleString('tr-TR')}
                </text>
                <rect x="148" y="123" width="64" height="20" rx="10" fill="white" fillOpacity="0.24" />
                <text x="180" y="137" textAnchor="middle" fill="white" fontSize="11" fontWeight="900" fontFamily="monospace">
                  %{z.officialMatchPct}
                </text>

                {/* Right Only Text (Sadece eBA) */}
                <text x="286" y="88" textAnchor="middle" fill="white" fontSize="10.5" fontWeight="700" opacity="0.95">
                  {lang === 'ru' ? 'Только eBA' : 'Sadece eBA'}
                </text>
                <text x="286" y="114" textAnchor="middle" fill="white" fontSize="19" fontWeight="900" fontFamily="monospace">
                  {z.realOnlyNotInZup.toLocaleString('tr-TR')}
                </text>
                <text x="286" y="133" textAnchor="middle" fill="#ccfbf1" fontSize="9.5" fontWeight="600">
                  eBA Real
                </text>
              </svg>
            </div>

            {/* 3 Compact Summary Breakdown Pills */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="px-2 py-1.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-700/50">
                <div className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                  {lang === 'ru' ? 'В обоих' : 'Ortak Aktif'}
                </div>
                <div className="text-xs font-black font-mono text-emerald-900 dark:text-white">
                  {z.matchedActiveBoth.toLocaleString('tr-TR')}
                </div>
              </div>
              <div className="px-2 py-1.5 rounded-xl bg-cyan-50/90 dark:bg-cyan-950/50 border border-cyan-200/80 dark:border-cyan-700/50">
                <div className="text-[9.5px] font-semibold text-cyan-700 dark:text-cyan-300 truncate">
                  {lang === 'ru' ? 'Только eBA' : "Sadece eBA"}
                </div>
                <div className="text-xs font-black font-mono text-cyan-900 dark:text-white">
                  {z.realOnlyNotInZup.toLocaleString('tr-TR')}
                </div>
              </div>
              <div className="px-2 py-1.5 rounded-xl bg-purple-50/90 dark:bg-purple-950/50 border border-purple-200/80 dark:border-purple-700/50">
                <div className="text-[9.5px] font-semibold text-purple-700 dark:text-purple-300 truncate">
                  {lang === 'ru' ? 'Только 1С' : "Sadece ZUP"}
                </div>
                <div className="text-xs font-black font-mono text-purple-900 dark:text-white">
                  {zupOnlyNoEba.toLocaleString('tr-TR')}
                </div>
              </div>
            </div>

            {/* Prominent CTA to Official vs Real Comparison Page */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigateToOfficialReal) onNavigateToOfficialReal();
              }}
              className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>
                {lang === 'ru'
                  ? 'Открыть детальную сверку (1С ЗУП ↔ eBA)'
                  : 'Detaylı Resmi ↔ Real Karşılaştırma Sayfasına Git'}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
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

