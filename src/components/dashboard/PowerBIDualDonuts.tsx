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

const COLLAR_COLORS = ['#0d9488', '#0891b2', '#64748b']; // Teal, Cyan, Slate
const CATEGORY_COLORS = ['#06b6d4', '#10b981', '#0ea5e9', '#f59e0b']; // Cyan, Emerald, Sky, Amber

// Authentic WC Restroom Man Silhouette
export function WcMaleIcon({ className = 'w-10 h-10 text-teal-600 dark:text-teal-400' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Erkek WC İkonu">
      {/* Head */}
      <circle cx="12" cy="4" r="2.5" />
      {/* Torso & Legs (Standard restroom sign silhouette) */}
      <path d="M8.5 7.8C7.67 7.8 7 8.47 7 9.3V14.5C7 15.05 7.45 15.5 8 15.5H9.5V22C9.5 22.55 9.95 23 10.5 23H11.5C12.05 23 12.5 22.55 12.5 22V16.5H11.5V15.5H12.5V16.5H13.5V22C13.5 22.55 13.95 23 14.5 23H15.5C16.05 23 16.5 22.55 16.5 22V15.5H18C18.55 15.5 19 15.05 19 14.5V9.3C19 8.47 18.33 7.8 17.5 7.8H8.5Z" />
    </svg>
  );
}

// Authentic WC Restroom Woman Silhouette (with iconic A-line flared dress, sleek violet palette)
export function WcFemaleIcon({ className = 'w-10 h-10 text-violet-600 dark:text-violet-400' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Kadın WC İkonu">
      {/* Head */}
      <circle cx="12" cy="4" r="2.5" />
      {/* Flared Dress Torso & Legs (Standard restroom sign silhouette) */}
      <path d="M12 7.5C10.5 7.5 9.4 8.6 9.2 10.1L7.2 16.2C7.05 16.7 7.42 17.2 7.95 17.2H9.5V22C9.5 22.55 9.95 23 10.5 23H11.5C12.05 23 12.5 22.55 12.5 22V17.2H13.5V22C13.5 22.55 13.95 23 14.5 23H15.5C16.05 23 16.5 22.55 16.5 22V17.2H18.05C18.58 17.2 18.95 16.7 18.8 16.2L16.8 10.1C16.6 8.6 15.5 7.5 14 7.5H12Z" />
    </svg>
  );
}

export default function PowerBIDualDonuts({
  collarData,
  categoryData,
  totalCount,
  maleCount = 5201,
  femaleCount = 162,
  selectedCollar,
  selectedCategory,
  onSelectSlice,
  onOpenDetail,
}: PowerBIDualDonutsProps) {
  const { lang, translateVal } = useLanguage();
  const blueCollar = collarData.find((c) => c.label.includes('Mavi'))?.count || 0;
  const bluePct = totalCount > 0 ? Math.round((blueCollar / totalCount) * 100) : 80;

  const expat = categoryData.find((c) => c.label === 'Ekspat')?.count || 0;
  const expatPct = totalCount > 0 ? Math.round((expat / totalCount) * 100) : 55;

  const malePct = totalCount > 0 ? Math.round((maleCount / totalCount) * 100) : 97;
  const femalePct = totalCount > 0 ? Math.max(1, Math.round((femaleCount / totalCount) * 100)) : 3;

  // Custom Slice Label: Shows percentage and count right on or near the circle sector
  const renderSectorLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value }: any) => {
    const RADIAN = Math.PI / 180;
    // Position label inside the outer rim of each slice
    const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-black text-[11px] select-none pointer-events-none drop-shadow-md"
      >
        {`%${(percent * 100).toFixed(0)}`}
      </text>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* 1. BEYAZ YAKA / MAVİ YAKA (Donut with sector labels) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-emerald-600 dark:text-teal-400" />
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Распределение: Синие / Белые воротнички' : 'Beyaz Yaka / Mavi Yaka Dağılımı'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenDetail && (
              <button
                onClick={() => onOpenDetail('collar', selectedCollar || 'all')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-700 dark:text-teal-300 text-[11px] font-bold border border-emerald-200 dark:border-teal-500/30 transition-all cursor-pointer"
                title={lang === 'ru' ? 'Открыть детализацию по категориям' : 'Yaka Dağılımı Detayını Aç'}
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-teal-400" />
                <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="h-52 relative flex items-center justify-center my-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={collarData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
                label={renderSectorLabel}
                labelLine={false}
                onClick={(entry) => onSelectSlice && onSelectSlice('collar', entry.label)}
                className="cursor-pointer"
              >
                {collarData.map((entry, index) => {
                  const isSelected = selectedCollar && selectedCollar !== 'all' && (
                    entry.label.toLowerCase().includes(selectedCollar.toLowerCase().replace(' yaka', ''))
                  );
                  const isDimmed = selectedCollar && selectedCollar !== 'all' && !isSelected;
                  return (
                    <Cell
                      key={`collar-${index}`}
                      fill={COLLAR_COLORS[index % COLLAR_COLORS.length]}
                      opacity={isDimmed ? 0.35 : 1}
                      stroke={isSelected ? '#ffffff' : 'none'}
                      strokeWidth={isSelected ? 2 : 0}
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
                      <div className="p-2.5 bg-slate-900 border border-teal-500/40 rounded-xl text-xs text-white shadow-xl">
                        <p className="font-bold text-teal-300">{translateVal(d.label)}</p>
                        <p className="font-mono mt-0.5">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'} (%{p})
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center Stat */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black text-slate-900 dark:text-white">%{bluePct}</span>
            <span className="text-[10px] text-emerald-600 dark:text-teal-400 font-bold uppercase tracking-wider">
              {lang === 'ru' ? 'Синий воротничок' : 'Mavi Yaka'}
            </span>
          </div>
        </div>

        {/* Legend pills with exact count & % */}
        <div className="flex items-center justify-center gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-800 flex-wrap">
          {collarData.map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            const isSelected = selectedCollar && selectedCollar !== 'all' && item.label.toLowerCase().includes(selectedCollar.toLowerCase().replace(' yaka', ''));
            return (
              <div
                key={idx}
                onClick={() => onSelectSlice && onSelectSlice('collar', item.label)}
                className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
                  selectedCollar && selectedCollar !== 'all' && !isSelected ? 'opacity-40' : 'opacity-100'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: COLLAR_COLORS[idx % COLLAR_COLORS.length] }}
                />
                <span className="text-slate-600 dark:text-slate-300 text-[11px] font-semibold">{translateVal(item.label)}:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">
                  {item.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} (%{pct})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. EXPAT / SNG / YEREL STATÜSÜ (Donut with sector labels) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Статус: Экспат / СНГ / Местный' : 'Expat / SNG / Yerel Statüsü'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenDetail && (
              <button
                onClick={() => onOpenDetail('category', selectedCategory || 'all')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold border border-cyan-200 dark:border-cyan-500/30 transition-all cursor-pointer"
                title={lang === 'ru' ? 'Открыть детализацию по статусам' : 'Statü Dağılımı Detayını Aç'}
              >
                <FileSpreadsheet className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="h-52 relative flex items-center justify-center my-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
                label={renderSectorLabel}
                labelLine={false}
                onClick={(entry) => onSelectSlice && onSelectSlice('category', entry.label)}
                className="cursor-pointer"
              >
                {categoryData.map((entry, index) => {
                  const isSelected = selectedCategory && selectedCategory !== 'all' && entry.label.toLowerCase() === selectedCategory.toLowerCase();
                  const isDimmed = selectedCategory && selectedCategory !== 'all' && !isSelected;
                  return (
                    <Cell
                      key={`cat-${index}`}
                      fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      opacity={isDimmed ? 0.35 : 1}
                      stroke={isSelected ? '#ffffff' : 'none'}
                      strokeWidth={isSelected ? 2 : 0}
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
                      <div className="p-2.5 bg-slate-900 border border-cyan-500/40 rounded-xl text-xs text-white shadow-xl">
                        <p className="font-bold text-cyan-300">{translateVal(d.label)}</p>
                        <p className="font-mono mt-0.5">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'} (%{p})
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black text-slate-900 dark:text-white">%{expatPct}</span>
            <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-wider">
              {lang === 'ru' ? 'Экспат' : 'Ekspat'}
            </span>
          </div>
        </div>

        {/* Legend pills with exact count & % */}
        <div className="flex items-center justify-center gap-3 text-xs pt-2 border-t border-slate-200 dark:border-slate-800 flex-wrap">
          {categoryData.map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            const isSelected = selectedCategory && selectedCategory !== 'all' && item.label.toLowerCase() === selectedCategory.toLowerCase();
            return (
              <div
                key={idx}
                onClick={() => onSelectSlice && onSelectSlice('category', item.label)}
                className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
                  selectedCategory && selectedCategory !== 'all' && !isSelected ? 'opacity-40' : 'opacity-100'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                />
                <span className="text-slate-600 dark:text-slate-300 text-[11px] font-semibold">{translateVal(item.label)}:</span>
                <span className="font-bold text-slate-900 dark:text-white font-mono text-[11px]">
                  {item.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} (%{pct})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CİNSİYET DAĞILIMI (ENLARGED WC RESTROOM ICONS & REFINED VIOLET PALETTE) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Users2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Распределение по полу (Мужчины / Женщины)' : 'Cinsiyet Dağılımı (Erkek / Kadın)'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenDetail && (
              <button
                onClick={() => onOpenDetail('gender', 'all')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-teal-700 dark:text-teal-300 text-[11px] font-bold border border-teal-200 dark:border-teal-500/30 transition-all cursor-pointer"
                title={lang === 'ru' ? 'Открыть детализацию по полу' : 'Cinsiyet Detayını Aç'}
              >
                <FileSpreadsheet className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Center: Side-by-side WC Silhouettes & KPI counts */}
        <div className="h-52 flex flex-col justify-center gap-3 my-1">
          <div className="grid grid-cols-2 gap-3">
            {/* ERKEK (Male WC Card with enlarged icon) */}
            <div
              onClick={() => onSelectSlice && onSelectSlice('gender', 'Erkek')}
              className="p-3.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-500/30 hover:border-teal-400 transition-all cursor-pointer flex items-center gap-3.5 group shadow-xs"
            >
              <div className="p-2.5 rounded-xl bg-teal-100/90 dark:bg-teal-900/70 shrink-0 group-hover:scale-105 transition-transform">
                <WcMaleIcon className="w-10 h-10 text-teal-600 dark:text-teal-300" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                  {lang === 'ru' ? 'Мужской штат' : 'Erkek Kadro'}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-200/70 dark:bg-teal-800/80 text-teal-950 dark:text-teal-100 font-black">
                    %{malePct}
                  </span>
                </span>
                <p className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {maleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro'}
                </p>
              </div>
            </div>

            {/* KADIN (Female WC Card with enlarged icon & refined violet palette) */}
            <div
              onClick={() => onSelectSlice && onSelectSlice('gender', 'Kadin')}
              className="p-3.5 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-500/30 hover:border-violet-400 transition-all cursor-pointer flex items-center gap-3.5 group shadow-xs"
            >
              <div className="p-2.5 rounded-xl bg-violet-100/90 dark:bg-violet-900/60 shrink-0 group-hover:scale-105 transition-transform">
                <WcFemaleIcon className="w-10 h-10 text-violet-600 dark:text-violet-300" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-violet-800 dark:text-violet-300 flex items-center gap-1.5">
                  {lang === 'ru' ? 'Женский штат' : 'Kadın Kadro'}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-200/70 dark:bg-violet-800/80 text-violet-950 dark:text-violet-100 font-black">
                    %{femalePct}
                  </span>
                </span>
                <p className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {femaleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro'}
                </p>
              </div>
            </div>
          </div>

          {/* Proportional dual progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-teal-700 dark:text-teal-300">
                %{malePct} {lang === 'ru' ? 'Мужчины' : 'Erkek'}
              </span>
              <span className="text-violet-700 dark:text-violet-300">
                %{femalePct} {lang === 'ru' ? 'Женщины' : 'Kadın'}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex shadow-inner">
              <div
                className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-500"
                style={{ width: `${malePct}%` }}
                title={`${lang === 'ru' ? 'Мужчины' : 'Erkek'}: %${malePct}`}
              />
              <div
                className="bg-gradient-to-r from-violet-500 to-indigo-500 h-full transition-all duration-500"
                style={{ width: `${femalePct}%` }}
                title={`${lang === 'ru' ? 'Женщины' : 'Kadın'}: %${femalePct}`}
              />
            </div>
          </div>
        </div>

        {/* Bottom summary info */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
          <span className="text-[11px] text-slate-600 dark:text-slate-400">
            {lang === 'ru' ? 'Преимущественно полевой / строительный штат' : 'Saha / Şantiye yoğunluklu kadro'}
          </span>
          <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 font-mono">
            {maleCount + femaleCount > 0 ? (maleCount / Math.max(1, femaleCount)).toFixed(0) : 32}:1 {lang === 'ru' ? 'Соотношение' : 'Oran'}
          </span>
        </div>
      </div>
    </div>
  );
}
