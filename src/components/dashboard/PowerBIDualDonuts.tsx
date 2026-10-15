'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Briefcase, Globe2, FileSpreadsheet, Users2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface PowerBIDualDonutsProps {
  collarData: { label: string; count: number }[];
  categoryData: { label: string; count: number }[];
  totalCount: number;
  maleCount?: number;
  femaleCount?: number;
  selectedCollar?: string;
  selectedCategory?: string;
  onSelectSlice?: (type: 'collar' | 'category' | 'gender', value: string) => void;
  onOpenDetail?: (type: 'collar' | 'category' | 'gender', value: string) => void;
}

const COLLAR_COLORS = ['#0d9488', '#0284c7', '#64748b']; // Teal, Sky-Blue, Slate
const CATEGORY_COLORS = ['#06b6d4', '#10b981', '#3b82f6', '#f59e0b']; // Cyan, Emerald, Blue, Amber

// Distinct, Larger Professional Male Human Icon (Broad shoulders, collar & tie silhouette)
export function WcMaleIcon({ className = 'w-14 h-14 text-teal-600 dark:text-teal-300' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-label="Erkek Personel İkonu">
      {/* Subtle Halo Circle */}
      <circle cx="32" cy="14" r="9.5" fill="currentColor" />
      {/* Male Hair / Crown Accent */}
      <path
        d="M23 11.5C23 6.8 27 3.5 32 3.5C37 3.5 41 6.8 41 11.5C39.2 9.2 35.8 8 32 8C28.2 8 24.8 9.2 23 11.5Z"
        fill="currentColor"
        fillOpacity="0.85"
      />
      {/* Broad Shoulders & Suit Torso with Tie Cutout */}
      <path
        d="M19 26C15.1 26 12 29.1 12 33V45C12 46.9 13.5 48.5 15.5 48.5C17.2 48.5 18.5 47.2 18.5 45.5V35H20.5V58.5C20.5 60.4 22.1 62 24 62H28C29.9 62 31.5 60.4 31.5 58.5V46.5H32.5V58.5C32.5 60.4 34.1 62 36 62H40C41.9 62 43.5 60.4 43.5 58.5V35H45.5V45.5C45.5 47.2 46.8 48.5 48.5 48.5C50.5 48.5 52 46.9 52 45V33C52 29.1 48.9 26 45 26H37.5L34.2 33.5L35.5 39.5L32 43L28.5 39.5L29.8 33.5L26.5 26H19Z"
        fill="currentColor"
      />
      {/* Executive Tie Detail */}
      <path
        d="M30.2 26H33.8L32.8 31.5L34.3 38.8L32 41.2L29.7 38.8L31.2 31.5L30.2 26Z"
        fill="currentColor"
        fillOpacity="0.45"
      />
    </svg>
  );
}

// Distinct, Larger Professional Female Human Icon (Styled hair silhouette, tailored dress & waist)
export function WcFemaleIcon({ className = 'w-14 h-14 text-violet-600 dark:text-violet-300' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-label="Kadın Personel İkonu">
      {/* Feminine Hair Silhouette (Flowing shoulder-length contour) */}
      <path
        d="M21 15.5C21 8.6 25.8 4 32 4C38.2 4 43 8.6 43 15.5C43 19.2 44.2 22.4 45.5 24.2C42.2 24.8 39.5 23.6 38.2 21.5C36.5 22.8 34.4 23.5 32 23.5C29.6 23.5 27.5 22.8 25.8 21.5C24.5 23.6 21.8 24.8 18.5 24.2C19.8 22.4 21 19.2 21 15.5Z"
        fill="currentColor"
        fillOpacity="0.4"
      />
      {/* Head */}
      <circle cx="32" cy="14" r="8.8" fill="currentColor" />
      {/* Tailored Shoulders, V-Neckline & Flared Dress Silhouette */}
      <path
        d="M23.5 26C19.8 26 16.6 28.5 15.4 32L11.8 42.8C11.2 44.5 12.1 46.3 13.8 46.8C15.4 47.3 17.1 46.4 17.7 44.8L20.6 35.8H22.4L17.2 50.5C16.8 51.6 17.6 52.8 18.8 52.8H23.5V58.8C23.5 60.6 24.9 62 26.7 62H28.8C30.5 62 31.5 60.6 31.5 58.8V52.8H32.5V58.8C32.5 60.6 33.5 62 35.2 62H37.3C39.1 62 40.5 60.6 40.5 58.8V52.8H45.2C46.4 52.8 47.2 51.6 46.8 50.5L41.6 35.8H43.4L46.3 44.8C46.9 46.4 48.6 47.3 50.2 46.8C51.9 46.3 52.8 44.5 52.2 42.8L48.6 32C47.4 28.5 44.2 26 40.5 26H35.5L32 31.8L28.5 26H23.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function PowerBIDualDonuts({
  collarData,
  categoryData,
  totalCount,
  maleCount = 0,
  femaleCount = 0,
  selectedCollar,
  selectedCategory,
  onSelectSlice,
  onOpenDetail,
}: PowerBIDualDonutsProps) {
  const { lang, translateVal } = useLanguage();

  const formatLabel = (rawLabel: string) => {
    if (lang === 'ru') {
      if (rawLabel.includes('Diğer') || rawLabel.includes('Pasif')) return 'Другие / Пассив';
      if (rawLabel === 'Yerel') return 'Местный';
      if (rawLabel.includes('Mavi Yaka')) return 'Синий воротничок (Рабочие)';
      if (rawLabel.includes('Beyaz Yaka')) return 'Белый воротничок (ИТР)';
    }
    return translateVal(rawLabel);
  };

  const formatShortLabel = (rawLabel: string) => {
    if (lang === 'ru') {
      if (rawLabel.includes('Mavi Yaka')) return 'Синий воротничок';
      if (rawLabel.includes('Beyaz Yaka')) return 'Белый воротничок';
      if (rawLabel.includes('Diğer') || rawLabel.includes('Pasif')) return 'Другие / Пассив';
      if (rawLabel === 'Ekspat') return 'Экспат';
      if (rawLabel === 'SNG') return 'СНГ';
      if (rawLabel === 'Yerel') return 'Местный';
    } else {
      if (rawLabel.includes('Mavi Yaka')) return 'Mavi Yaka';
      if (rawLabel.includes('Beyaz Yaka')) return 'Beyaz Yaka';
      if (rawLabel.includes('Diğer') || rawLabel.includes('Pasif')) return 'Diğer / Pasif';
    }
    return translateVal(rawLabel);
  };

  const blueCollar = collarData.find((c) => c.label.includes('Mavi'))?.count || 0;
  const bluePct = totalCount > 0 ? Math.round((blueCollar / totalCount) * 100) : 80;

  const expat = categoryData.find((c) => c.label === 'Ekspat')?.count || 0;
  const expatPct = totalCount > 0 ? Math.round((expat / totalCount) * 100) : 55;

  const malePct = totalCount > 0 ? Math.round((maleCount / totalCount) * 100) : 97;
  const femalePct = totalCount > 0 ? Math.max(1, Math.round((femaleCount / totalCount) * 100)) : 3;

  // Custom Slice Label: Crisp percentage badge right inside the wider 40px donut ring
  const renderSectorLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.04) return null;

    return (
      <g className="pointer-events-none select-none">
        <rect
          x={x - 18}
          y={y - 10}
          width={36}
          height={20}
          rx={6}
          fill="rgba(15, 23, 42, 0.55)"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1}
        />
        <text
          x={x}
          y={y}
          fill="#ffffff"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-extrabold text-[11px] tracking-tight"
        >
          {`%${(percent * 100).toFixed(0)}`}
        </text>
      </g>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {/* 1. BEYAZ YAKA / MAVİ YAKA (Enlarged Professional Donut Chart) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-teal-500/20 flex items-center justify-center border border-emerald-200/60 dark:border-teal-500/30">
              <Briefcase className="w-4 h-4 text-emerald-600 dark:text-teal-400" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Распределение: Синие / Белые воротнички' : 'Beyaz Yaka / Mavi Yaka Dağılımı'}
            </h3>
          </div>
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('collar', selectedCollar || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-700 dark:text-teal-300 text-[11px] font-bold border border-emerald-200 dark:border-teal-500/30 transition-all cursor-pointer shrink-0"
              title={lang === 'ru' ? 'Открыть детализацию по категориям' : 'Yaka Dağılımı Detayını Aç'}
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
            </button>
          )}
        </div>

        {/* Enlarged Professional Donut Container */}
        <div className="h-64 relative flex items-center justify-center my-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id="collarGrad0" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
                <linearGradient id="collarGrad1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
                <linearGradient id="collarGrad2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>
                <filter id="donutShadowCollar" x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.16" />
                </filter>
              </defs>
              <Pie
                data={collarData}
                cx="50%"
                cy="50%"
                innerRadius={64}
                outerRadius={105}
                cornerRadius={6}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
                label={renderSectorLabel}
                labelLine={false}
                onClick={(entry) => onSelectSlice && onSelectSlice('collar', entry.label)}
                className="cursor-pointer focus:outline-none"
                style={{ filter: 'url(#donutShadowCollar)' }}
              >
                {collarData.map((entry, index) => {
                  const isSelected =
                    selectedCollar &&
                    selectedCollar !== 'all' &&
                    entry.label.toLowerCase().includes(selectedCollar.toLowerCase().replace(' yaka', ''));
                  const isDimmed = selectedCollar && selectedCollar !== 'all' && !isSelected;
                  return (
                    <Cell
                      key={`collar-${index}`}
                      fill={`url(#collarGrad${index % 3})`}
                      opacity={isDimmed ? 0.35 : 1}
                      stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="hover:opacity-90 transition-all duration-300"
                    />
                  );
                })}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const p = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : 0;
                    return (
                      <div className="p-3 bg-slate-900/95 backdrop-blur-md border border-teal-500/40 rounded-xl text-xs text-white shadow-2xl">
                        <p className="font-bold text-teal-300">{formatLabel(d.label)}</p>
                        <p className="font-mono mt-1 text-sm font-extrabold">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}{' '}
                          <span className="text-teal-400">(%{p})</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Clean Circular Center KPI Badge (Fits inside innerRadius=64 without overlapping ring) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-28 h-28 rounded-full bg-slate-50/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 shadow-inner flex flex-col items-center justify-center px-2 text-center">
              <span className="text-2xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                %{bluePct}
              </span>
              <span className="text-[9.5px] text-emerald-600 dark:text-teal-400 font-extrabold uppercase tracking-wider mt-1 leading-tight">
                {lang === 'ru' ? 'Синий воротничок' : 'Mavi Yaka'}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {blueCollar.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'kişi'}
              </span>
            </div>
          </div>
        </div>

        {/* Structured Bottom Legend Cards */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {collarData.map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            const isSelected =
              selectedCollar &&
              selectedCollar !== 'all' &&
              item.label.toLowerCase().includes(selectedCollar.toLowerCase().replace(' yaka', ''));
            return (
              <div
                key={idx}
                onClick={() => onSelectSlice && onSelectSlice('collar', item.label)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-teal-50/80 dark:bg-teal-950/50 border-teal-400 dark:border-teal-500'
                    : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                } ${selectedCollar && selectedCollar !== 'all' && !isSelected ? 'opacity-45' : 'opacity-100'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: COLLAR_COLORS[idx % COLLAR_COLORS.length] }}
                  />
                  <span className="text-slate-600 dark:text-slate-300 text-[10.5px] font-bold truncate">
                    {formatShortLabel(item.label)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-black text-slate-900 dark:text-white font-mono text-xs">
                    {item.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                  </span>
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 font-mono">
                    %{pct}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. EXPAT / SNG / YEREL STATÜSÜ (Enlarged Professional Donut Chart) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/20 flex items-center justify-center border border-cyan-200/60 dark:border-cyan-500/30">
              <Globe2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Статус: Экспат / СНГ / Местный' : 'Expat / SNG / Yerel Statüsü'}
            </h3>
          </div>
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('category', selectedCategory || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold border border-cyan-200 dark:border-cyan-500/30 transition-all cursor-pointer shrink-0"
              title={lang === 'ru' ? 'Открыть детализацию по статусам' : 'Statü Dağılımı Detayını Aç'}
            >
              <FileSpreadsheet className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
            </button>
          )}
        </div>

        {/* Enlarged Professional Donut Container */}
        <div className="h-64 relative flex items-center justify-center my-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                <linearGradient id="catGrad0" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#0891b2" />
                </linearGradient>
                <linearGradient id="catGrad1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="catGrad2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id="catGrad3" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
                <filter id="donutShadowCat" x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.16" />
                </filter>
              </defs>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={64}
                outerRadius={105}
                cornerRadius={6}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
                label={renderSectorLabel}
                labelLine={false}
                onClick={(entry) => onSelectSlice && onSelectSlice('category', entry.label)}
                className="cursor-pointer focus:outline-none"
                style={{ filter: 'url(#donutShadowCat)' }}
              >
                {categoryData.map((entry, index) => {
                  const isSelected =
                    selectedCategory &&
                    selectedCategory !== 'all' &&
                    entry.label.toLowerCase() === selectedCategory.toLowerCase();
                  const isDimmed = selectedCategory && selectedCategory !== 'all' && !isSelected;
                  return (
                    <Cell
                      key={`cat-${index}`}
                      fill={`url(#catGrad${index % 4})`}
                      opacity={isDimmed ? 0.35 : 1}
                      stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="hover:opacity-90 transition-all duration-300"
                    />
                  );
                })}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const p = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : 0;
                    return (
                      <div className="p-3 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-xl text-xs text-white shadow-2xl">
                        <p className="font-bold text-cyan-300">{formatLabel(d.label)}</p>
                        <p className="font-mono mt-1 text-sm font-extrabold">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}{' '}
                          <span className="text-cyan-400">(%{p})</span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Clean Circular Center KPI Badge */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-28 h-28 rounded-full bg-slate-50/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 shadow-inner flex flex-col items-center justify-center px-2 text-center">
              <span className="text-2xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                %{expatPct}
              </span>
              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-extrabold uppercase tracking-wider mt-1 leading-tight">
                {lang === 'ru' ? 'Экспат' : 'Ekspat'}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                {expat.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'kişi'}
              </span>
            </div>
          </div>
        </div>

        {/* Structured Bottom Legend Cards */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          {categoryData.map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            const isSelected =
              selectedCategory &&
              selectedCategory !== 'all' &&
              item.label.toLowerCase() === selectedCategory.toLowerCase();
            return (
              <div
                key={idx}
                onClick={() => onSelectSlice && onSelectSlice('category', item.label)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-cyan-50/80 dark:bg-cyan-950/50 border-cyan-400 dark:border-cyan-500'
                    : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                } ${selectedCategory && selectedCategory !== 'all' && !isSelected ? 'opacity-45' : 'opacity-100'}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                  />
                  <span className="text-slate-600 dark:text-slate-300 text-[10.5px] font-bold truncate">
                    {formatShortLabel(item.label)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-black text-slate-900 dark:text-white font-mono text-xs">
                    {item.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                  </span>
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 font-mono">
                    %{pct}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CİNSİYET DAĞILIMI (ENLARGED DISTINCT MALE & FEMALE AVATAR SILHOUETTES) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-500/20 flex items-center justify-center border border-teal-200/60 dark:border-teal-500/30">
              <Users2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Распределение по полу (Мужчины / Женщины)' : 'Cinsiyet Dağılımı (Erkek / Kadın)'}
            </h3>
          </div>
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('gender', 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-teal-700 dark:text-teal-300 text-[11px] font-bold border border-teal-200 dark:border-teal-500/30 transition-all cursor-pointer shrink-0"
              title={lang === 'ru' ? 'Открыть детализацию по полу' : 'Cinsiyet Detayını Aç'}
            >
              <FileSpreadsheet className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
            </button>
          )}
        </div>

        {/* Center: Side-by-side Enlarged Male & Female Cards */}
        <div className="h-64 flex flex-col justify-center gap-4 my-1">
          <div className="grid grid-cols-2 gap-3.5">
            {/* ERKEK (Male Card with large 56px Male silhouette) */}
            <div
              onClick={() => onSelectSlice && onSelectSlice('gender', 'Erkek')}
              className="p-4 rounded-2xl bg-gradient-to-br from-teal-50/90 via-emerald-50/50 to-white dark:from-teal-950/50 dark:via-slate-900/70 dark:to-slate-900 border border-teal-200/90 dark:border-teal-500/30 hover:border-teal-400 transition-all cursor-pointer flex items-center gap-3.5 group shadow-xs"
            >
              <div className="p-2.5 rounded-2xl bg-teal-100/90 dark:bg-teal-900/70 border border-teal-200/70 dark:border-teal-700/50 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                <WcMaleIcon className="w-14 h-14 text-teal-600 dark:text-teal-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-extrabold text-teal-900 dark:text-teal-300 leading-tight">
                    {lang === 'ru' ? 'Мужской штат' : 'Erkek Kadro'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-200/80 dark:bg-teal-800/90 text-teal-950 dark:text-teal-100 font-black">
                    %{malePct}
                  </span>
                </div>
                <p className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1.5 tracking-tight">
                  {maleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro'}
                </p>
              </div>
            </div>

            {/* KADIN (Female Card with large 56px Female silhouette) */}
            <div
              onClick={() => onSelectSlice && onSelectSlice('gender', 'Kadin')}
              className="p-4 rounded-2xl bg-gradient-to-br from-violet-50/90 via-purple-50/50 to-white dark:from-violet-950/45 dark:via-slate-900/70 dark:to-slate-900 border border-violet-200/90 dark:border-violet-500/30 hover:border-violet-400 transition-all cursor-pointer flex items-center gap-3.5 group shadow-xs"
            >
              <div className="p-2.5 rounded-2xl bg-violet-100/90 dark:bg-violet-900/60 border border-violet-200/70 dark:border-violet-700/50 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                <WcFemaleIcon className="w-14 h-14 text-violet-600 dark:text-violet-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-extrabold text-violet-900 dark:text-violet-300 leading-tight">
                    {lang === 'ru' ? 'Женский штат' : 'Kadın Kadro'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-200/80 dark:bg-violet-800/90 text-violet-950 dark:text-violet-100 font-black">
                    %{femalePct}
                  </span>
                </div>
                <p className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-1.5 tracking-tight">
                  {femaleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro'}
                </p>
              </div>
            </div>
          </div>

          {/* Proportional dual progress bar */}
          <div className="space-y-1.5 px-0.5">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-teal-700 dark:text-teal-300">
                %{malePct} {lang === 'ru' ? 'Мужчины' : 'Erkek'}
              </span>
              <span className="text-violet-700 dark:text-violet-300">
                %{femalePct} {lang === 'ru' ? 'Женщины' : 'Kadın'}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex shadow-inner p-0.5 gap-0.5">
              <div
                className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-l-full transition-all duration-500"
                style={{ width: `${malePct}%` }}
                title={`${lang === 'ru' ? 'Мужчины' : 'Erkek'}: %${malePct}`}
              />
              <div
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full rounded-r-full transition-all duration-500"
                style={{ width: `${femalePct}%` }}
                title={`${lang === 'ru' ? 'Женщины' : 'Kadın'}: %${femalePct}`}
              />
            </div>
          </div>
        </div>

        {/* Bottom summary info */}
        <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
            {lang === 'ru' ? 'Преимущественно полевой / строительный штат' : 'Saha / Şantiye yoğunluklu kadro'}
          </span>
          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 font-mono">
            {maleCount + femaleCount > 0 ? (maleCount / Math.max(1, femaleCount)).toFixed(0) : 32}:1 {lang === 'ru' ? 'Соотношение' : 'Oran'}
          </span>
        </div>
      </div>
    </div>
  );
}
