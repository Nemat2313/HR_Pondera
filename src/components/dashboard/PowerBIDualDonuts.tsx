'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
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

// Tall, Full-Stature Modern Male Silhouette matching Pondera HR Emerald/Teal Design (1:7.5 tall proportion)
export function WcMaleIcon({ className = 'w-11 h-28' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 128" fill="none" className={className} aria-label="Erkek Personel İkonu">
      <defs>
        <linearGradient id="ponderaMaleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="50%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      {/* Subtle Ground Shadow Oval */}
      <ellipse cx="24" cy="123" rx="13" ry="3" fill="#0d9488" fillOpacity="0.2" />
      {/* Head */}
      <circle cx="24" cy="12" r="8" fill="url(#ponderaMaleGrad)" />
      {/* Neck */}
      <rect x="21" y="20.5" width="6" height="4.5" rx="2" fill="url(#ponderaMaleGrad)" />
      {/* Tall Athletic Torso, Broad Shoulders, Arms & Long Standing Legs */}
      <path
        d="M12.5 25C8.9 25 6 27.9 6 31.5V62C6 64.2 7.8 66 10 66C12.2 66 14 64.2 14 62V35.5H15.5V117C15.5 119.8 17.7 122 20.5 122C23.3 122 25.5 119.8 25.5 117V72H22.5V117C22.5 119.8 24.7 122 27.5 122C30.3 122 32.5 119.8 32.5 117V35.5H34V62C34 64.2 35.8 66 38 66C40.2 66 42 64.2 42 62V31.5C42 27.9 39.1 25 35.5 25H12.5Z"
        fill="url(#ponderaMaleGrad)"
      />
      {/* Leg Separation Gap */}
      <rect x="23" y="68" width="2" height="54" rx="1" fill="#f0fdfa" className="dark:fill-slate-900" />
      {/* Executive Collar & Tie Accent */}
      <path d="M19.5 25L24 33L28.5 25H19.5Z" fill="#ffffff" fillOpacity="0.85" />
      <path d="M23 30L25 30L25.8 44L24 47L22.2 44L23 30Z" fill="#042f2e" fillOpacity="0.35" />
    </svg>
  );
}

// Tall, Full-Stature Modern Female Silhouette matching Pondera HR Violet/Indigo Design (1:7.5 tall proportion)
export function WcFemaleIcon({ className = 'w-11 h-28' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 128" fill="none" className={className} aria-label="Kadın Personel İkonu">
      <defs>
        <linearGradient id="ponderaFemaleGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* Subtle Ground Shadow Oval */}
      <ellipse cx="24" cy="123" rx="12" ry="3" fill="#8b5cf6" fillOpacity="0.2" />
      {/* Graceful Hair Contour */}
      <path
        d="M15.5 13C15.5 7.5 19.3 3.5 24 3.5C28.7 3.5 32.5 7.5 32.5 13C32.5 17.5 34 21 35.5 23C32.5 23.5 30 22 28.8 19.8C27.3 20.8 25.7 21.2 24 21.2C22.3 21.2 20.7 20.8 19.2 19.8C18 22 15.5 23.5 12.5 23C14 21 15.5 17.5 15.5 13Z"
        fill="url(#ponderaFemaleGrad)"
        fillOpacity="0.45"
      />
      {/* Head */}
      <circle cx="24" cy="12" r="7.6" fill="url(#ponderaFemaleGrad)" />
      {/* Neck */}
      <rect x="21.5" y="20" width="5" height="4.5" rx="2" fill="url(#ponderaFemaleGrad)" />
      {/* Tall Slender Frame, Tapered Waist, A-Line Dress & Long Slender Legs */}
      <path
        d="M15.5 25C12.4 25 9.8 27.1 9 30.1L5.2 56.5C4.8 58.5 6.1 60.4 8.1 60.8C10.1 61.1 11.9 59.8 12.3 57.8L15.8 34.5H17.2L15.8 46L10.5 82.5C10.2 84.3 11.6 86 13.5 86H17.2V117.5C17.2 120 19.1 122 21.4 122C23.5 122 23.5 120 23.5 117.5V86H24.5V117.5C24.5 120 24.5 122 26.6 122C28.9 122 30.8 120 30.8 117.5V86H34.5C36.4 86 37.8 84.3 37.5 82.5L32.2 46L30.8 34.5H32.2L35.7 57.8C36.1 59.8 37.9 61.1 39.9 60.8C41.9 60.4 43.2 58.5 42.8 56.5L39 30.1C38.2 27.1 35.6 25 32.5 25H15.5Z"
        fill="url(#ponderaFemaleGrad)"
      />
      {/* V-Neck Collar Detail */}
      <path d="M20 25L24 31.5L28 25H20Z" fill="#ffffff" fillOpacity="0.85" />
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

  // Custom External Callout Line & Label Renderer (no redundant % inside slices)
  const createExternalCalloutRenderer = (colors: string[]) => {
    const CalloutLabel = (props: any) => {
      const { cx, cy, midAngle, outerRadius, percent, index, payload } = props;
      const RADIAN = Math.PI / 180;
      const sin = Math.sin(-RADIAN * midAngle);
      const cos = Math.cos(-RADIAN * midAngle);

      const sliceColor = colors[index % colors.length];
      const pctText = `%${(percent * 100).toFixed(0)}`;
      const countText = `${(payload.count || 0).toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} ${
        lang === 'ru' ? 'чел.' : 'kişi'
      }`;
      const titleText = formatShortLabel(payload.label || '');

      // External callout line coordinates
      const sx = cx + (outerRadius + 2) * cos;
      const sy = cy + (outerRadius + 2) * sin;
      const mx = cx + (outerRadius + 14) * cos;
      const my = cy + (outerRadius + 14) * sin;
      const ex = mx + (cos >= 0 ? 10 : -10);
      const ey = my;
      const textAnchor = cos >= 0 ? 'start' : 'end';
      const textX = ex + (cos >= 0 ? 5 : -5);

      return (
        <g className="pointer-events-none select-none">
          {/* Callout Leader Line */}
          <polyline
            points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
            stroke={sliceColor}
            strokeWidth={1.75}
            fill="none"
          />
          {/* Anchor dot on slice edge */}
          <circle cx={sx} cy={sy} r={2.5} fill={sliceColor} />
          {/* End dot at label */}
          <circle cx={ex} cy={ey} r={2} fill={sliceColor} />

          {/* External Label Line 1: Category Name */}
          <text
            x={textX}
            y={ey - 6}
            textAnchor={textAnchor}
            dominantBaseline="central"
            className="fill-slate-700 dark:fill-slate-200 font-medium text-xs"
          >
            {titleText}
          </text>

          {/* External Label Line 2: Count & Percentage */}
          <text
            x={textX}
            y={ey + 8}
            textAnchor={textAnchor}
            dominantBaseline="central"
            fill={sliceColor}
            className="font-medium text-xs"
          >
            {`${countText} (${pctText})`}
          </text>
        </g>
      );
    };
    return CalloutLabel;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {/* 1. BEYAZ YAKA / MAVİ YAKA (Thick Donut Wheel with External Callout Lines) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-teal-500/20 flex items-center justify-center border border-emerald-200/60 dark:border-teal-500/30">
              <Briefcase className="w-4 h-4 text-emerald-600 dark:text-teal-400" />
            </div>
            <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Распределение: Синие / Белые воротнички' : 'Beyaz Yaka / Mavi Yaka Dağılımı'}
            </h3>
          </div>
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('collar', selectedCollar || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-800 dark:text-teal-200 text-xs font-medium border border-emerald-300/80 dark:border-teal-500/30 transition-all cursor-pointer shrink-0"
              title={lang === 'ru' ? 'Открыть детализацию по категориям' : 'Yaka Dağılımı Detayını Aç'}
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
            </button>
          )}
        </div>

        {/* Full-Height Donut Container with External Callouts */}
        <div className="h-72 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 18, right: 28, bottom: 18, left: 28 }}>
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
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.14" />
                </filter>
              </defs>
              <Pie
                data={collarData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={90}
                cornerRadius={5}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
                label={createExternalCalloutRenderer(COLLAR_COLORS)}
                labelLine={false}
                isAnimationActive={false}
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
            </PieChart>
          </ResponsiveContainer>

          {/* Clean Center KPI Badge inside innerRadius=48 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-slate-50/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 shadow-inner flex flex-col items-center justify-center px-1 text-center">
              <span className="text-xl font-bold text-slate-800 dark:text-white leading-none tracking-tight">
                %{bluePct}
              </span>
              <span className="text-[9px] text-emerald-700 dark:text-teal-400 font-medium uppercase tracking-wider mt-1 leading-tight">
                {lang === 'ru' ? 'Синий вор.' : 'Mavi Yaka'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. EXPAT / SNG / YEREL STATÜSÜ (Donut with External Callout Lines, No Tooltip, No Bottom Legend) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-500/20 flex items-center justify-center border border-cyan-200/60 dark:border-cyan-500/30">
              <Globe2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Статус: Экспат / СНГ / Местный' : 'Expat / SNG / Yerel Statüsü'}
            </h3>
          </div>
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('category', selectedCategory || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-800 dark:text-cyan-300 text-xs font-medium border border-cyan-300/80 dark:border-cyan-500/30 transition-all cursor-pointer shrink-0"
              title={lang === 'ru' ? 'Открыть детализацию по статусам' : 'Statü Dağılımı Detayını Aç'}
            >
              <FileSpreadsheet className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
            </button>
          )}
        </div>

        {/* Full-Height Donut Container with External Callouts */}
        <div className="h-72 relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 18, right: 28, bottom: 18, left: 28 }}>
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
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.14" />
                </filter>
              </defs>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={90}
                cornerRadius={5}
                paddingAngle={3}
                dataKey="count"
                nameKey="label"
                label={createExternalCalloutRenderer(CATEGORY_COLORS)}
                labelLine={false}
                isAnimationActive={false}
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
            </PieChart>
          </ResponsiveContainer>

          {/* Clean Center KPI Badge inside innerRadius=48 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-slate-50/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 shadow-inner flex flex-col items-center justify-center px-1 text-center">
              <span className="text-xl font-bold text-slate-800 dark:text-white leading-none tracking-tight">
                %{expatPct}
              </span>
              <span className="text-[9px] text-cyan-700 dark:text-cyan-400 font-medium uppercase tracking-wider mt-1 leading-tight">
                {lang === 'ru' ? 'Экспат' : 'Ekspat'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CİNSİYET DAĞILIMI (TALL STANDING HUMAN FIGURES MATCHING APP DESIGN) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-500/20 flex items-center justify-center border border-teal-200/60 dark:border-teal-500/30">
              <Users2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Распределение по полу (Мужчины / Женщины)' : 'Cinsiyet Dağılımı (Erkek / Kadın)'}
            </h3>
          </div>
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail('gender', 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-teal-800 dark:text-teal-200 text-xs font-medium border border-teal-300/80 dark:border-teal-500/30 transition-all cursor-pointer shrink-0"
              title={lang === 'ru' ? 'Открыть детализацию по полу' : 'Cinsiyet Detayını Aç'}
            >
              <FileSpreadsheet className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
            </button>
          )}
        </div>

        {/* Center: Side-by-side Tall Human Silhouettes & KPI counts */}
        <div className="h-72 flex flex-col justify-between py-2">
          <div className="grid grid-cols-2 gap-3.5 flex-1 items-stretch">
            {/* ERKEK (Tall Full-Body Male Figure Card) */}
            <div
              onClick={() => onSelectSlice && onSelectSlice('gender', 'Erkek')}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-teal-50/80 via-emerald-50/40 to-teal-100/50 dark:from-teal-950/50 dark:via-slate-900/70 dark:to-teal-950/40 border border-teal-200/90 dark:border-teal-500/30 hover:border-teal-400 transition-all cursor-pointer flex items-center gap-3 group shadow-xs"
            >
              <div className="px-2 py-2 rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-teal-200/70 dark:border-teal-800/60 shrink-0 group-hover:scale-105 transition-transform shadow-xs flex items-center justify-center">
                <WcMaleIcon className="w-11 h-28" />
              </div>
              <div className="min-w-0 flex flex-col justify-center">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-tight">
                  {lang === 'ru' ? 'Мужской штат' : 'Erkek Kadro'}
                </span>
                <span className="inline-flex w-fit mt-1 text-[11px] px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-700 font-medium">
                  %{malePct}
                </span>
                <p className="text-2xl font-bold text-slate-800 dark:text-white font-mono mt-1.5 tracking-tight leading-none">
                  {maleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro'}
                </p>
              </div>
            </div>

            {/* KADIN (Tall Full-Body Female Figure Card) */}
            <div
              onClick={() => onSelectSlice && onSelectSlice('gender', 'Kadin')}
              className="p-3.5 rounded-2xl bg-gradient-to-b from-violet-50/80 via-purple-50/40 to-violet-100/50 dark:from-violet-950/45 dark:via-slate-900/70 dark:to-violet-950/40 border border-violet-200/90 dark:border-violet-500/30 hover:border-violet-400 transition-all cursor-pointer flex items-center gap-3 group shadow-xs"
            >
              <div className="px-2 py-2 rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-violet-200/70 dark:border-violet-800/60 shrink-0 group-hover:scale-105 transition-transform shadow-xs flex items-center justify-center">
                <WcFemaleIcon className="w-11 h-28" />
              </div>
              <div className="min-w-0 flex flex-col justify-center">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-tight">
                  {lang === 'ru' ? 'Женский штат' : 'Kadın Kadro'}
                </span>
                <span className="inline-flex w-fit mt-1 text-[11px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-700 font-medium">
                  %{femalePct}
                </span>
                <p className="text-2xl font-bold text-slate-800 dark:text-white font-mono mt-1.5 tracking-tight leading-none">
                  {femaleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  {lang === 'ru' ? 'Активный штат' : 'Aktif Kadro'}
                </p>
              </div>
            </div>
          </div>

          {/* Proportional dual progress bar & ratio footer */}
          <div className="space-y-2 pt-3">
            <div className="space-y-1 px-0.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-teal-800 dark:text-teal-300">
                  %{malePct} {lang === 'ru' ? 'Мужчины' : 'Erkek'}
                </span>
                <span className="text-purple-800 dark:text-purple-300">
                  %{femalePct} {lang === 'ru' ? 'Женщины' : 'Kadın'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex shadow-inner p-0.5 gap-0.5">
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

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-normal text-slate-600 dark:text-slate-400">
                {lang === 'ru' ? 'Преимущественно полевой / строительный штат' : 'Saha / Şantiye yoğunluklu kadro'}
              </span>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 font-mono">
                {maleCount + femaleCount > 0 ? (maleCount / Math.max(1, femaleCount)).toFixed(0) : 32}:1 {lang === 'ru' ? 'Соотношение' : 'Oran'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
