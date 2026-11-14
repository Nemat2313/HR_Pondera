'use client';

import React from 'react';
import { Award, ChevronRight, FileSpreadsheet, Crown, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface PowerBITitlePyramidProps {
  pyramidData: { title: string; count: number }[];
  totalCount: number;
  selectedTitle?: string;
  onSelectTitle?: (title: string) => void;
  onOpenDetail?: (title: string) => void;
}

const RU_LEVEL_TITLES: Record<number, string> = {
  1: 'Председатель правления',
  2: 'CEO / COO и Ген. директор',
  3: 'Директора и координаторы',
  4: 'Директора проектов и отделов',
  5: 'Начальники групп и участков',
  6: 'Инженеры, специалисты и служащие',
  7: 'Формены и ответственные',
  8: 'Бригадиры, мастера и рабочие',
};

export default function PowerBITitlePyramid({
  pyramidData,
  totalCount,
  selectedTitle,
  onSelectTitle,
  onOpenDetail,
}: PowerBITitlePyramidProps) {
  // 8-tier progressive funnel geometry from Apex (L1) to Base (L8)
  const tierWidths = [
    'w-[92%] sm:w-[44%]', // L1 Başkan
    'w-[93%] sm:w-[52%]', // L2 CEO / Genel Müdür
    'w-[94%] sm:w-[60%]', // L3 Direktör
    'w-[95%] sm:w-[68%]', // L4 Müdür & Şantiye Şefi
    'w-[96%] sm:w-[76%]', // L5 Grup & Kısım Şefi
    'w-[98%] sm:w-[84%]', // L6 Mühendis & Uzman
    'w-[99%] sm:w-[92%]', // L7 Formen & Sorumlu
    'w-full',             // L8 Saha Ekip & İşçi
  ];

  const tierAccents = [
    {
      badge: 'L1',
      bg: 'from-amber-500/20 to-yellow-500/15',
      border: 'border-amber-400/60 dark:border-amber-400/40',
      text: 'text-amber-800 dark:text-amber-300',
    },
    {
      badge: 'L2',
      bg: 'from-purple-500/20 to-fuchsia-500/15',
      border: 'border-purple-400/60 dark:border-purple-400/40',
      text: 'text-purple-800 dark:text-purple-300',
    },
    {
      badge: 'L3',
      bg: 'from-indigo-500/20 to-violet-500/15',
      border: 'border-indigo-400/60 dark:border-indigo-400/40',
      text: 'text-indigo-800 dark:text-indigo-300',
    },
    {
      badge: 'L4',
      bg: 'from-blue-500/20 to-sky-500/15',
      border: 'border-blue-400/60 dark:border-blue-400/40',
      text: 'text-blue-800 dark:text-blue-300',
    },
    {
      badge: 'L5',
      bg: 'from-emerald-500/20 to-teal-500/15',
      border: 'border-emerald-400/60 dark:border-emerald-400/40',
      text: 'text-emerald-800 dark:text-emerald-300',
    },
    {
      badge: 'L6',
      bg: 'from-sky-500/20 to-cyan-500/15',
      border: 'border-sky-400/60 dark:border-sky-400/40',
      text: 'text-sky-800 dark:text-sky-300',
    },
    {
      badge: 'L7',
      bg: 'from-orange-500/20 to-amber-500/15',
      border: 'border-orange-400/60 dark:border-orange-400/40',
      text: 'text-orange-800 dark:text-orange-300',
    },
    {
      badge: 'L8',
      bg: 'from-teal-500/20 to-emerald-600/20',
      border: 'border-teal-500/50 dark:border-teal-500/35',
      text: 'text-teal-800 dark:text-teal-300',
    },
  ];

  const { lang, t } = useLanguage();

  const formatDisplayTitle = (rawTitle: string, idx: number) => {
    const clean = rawTitle.replace(/^\d+\.\s*/, '');
    if (lang === 'ru') {
      const ruDesc = RU_LEVEL_TITLES[idx + 1];
      return ruDesc ? `L${idx + 1} • ${ruDesc}` : clean;
    }
    return clean;
  };

  return (
    <div className="p-5 lg:p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden flex flex-col justify-between transition-colors">
      <div className="hidden dark:block absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-teal-500/20 text-emerald-600 dark:text-teal-400 border border-emerald-200 dark:border-teal-500/30">
              <Award className="w-4 h-4" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              {t('funnel_title')}
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('funnel_sub')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail(selectedTitle || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-700 dark:text-teal-300 text-[11px] font-bold border border-emerald-200 dark:border-teal-500/30 transition-all cursor-pointer"
              title={lang === 'ru' ? 'Смотреть список должностей' : 'Ünvan Kademesi Personel Listesini Gör'}
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-teal-400" />
              <span>{t('btn_see_detail')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Apex Indicator Tag */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 font-extrabold uppercase tracking-wider mb-2">
        <Crown className="w-3.5 h-3.5" />
        <span>{t('funnel_peak')}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </div>

      {/* 8-Tiered Pyramid / Funnel Visual Representation */}
      <div className="space-y-1.5 relative z-10 my-1 flex flex-col items-center w-full">
        {pyramidData.map((item, idx) => {
          const totalPct = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : '0';
          const cleanTitle = item.title.replace(/^\d+\.\s*/, '');
          const isSelected =
            selectedTitle &&
            selectedTitle !== 'all' &&
            cleanTitle.toLowerCase() === selectedTitle.toLowerCase();
          const isDimmed = selectedTitle && selectedTitle !== 'all' && !isSelected;
          const tierStyle = tierAccents[idx % tierAccents.length];
          const tierWidth = tierWidths[idx] || 'w-full';
          const displayLabel = formatDisplayTitle(item.title, idx).replace(/^L\d+\s*•\s*/i, '');

          return (
            <div
              key={idx}
              onClick={() => onSelectTitle && onSelectTitle(item.title)}
              className={`transition-all duration-300 cursor-pointer ${tierWidth} ${
                isDimmed ? 'opacity-35 hover:opacity-75' : 'opacity-100'
              }`}
            >
              <div
                className={`px-2.5 py-2 rounded-xl border bg-gradient-to-r ${tierStyle.bg} ${tierStyle.border} ${
                  isSelected
                    ? 'ring-2 ring-emerald-400 dark:ring-teal-400 shadow-md shadow-emerald-500/25'
                    : 'hover:border-emerald-400 dark:hover:border-teal-400'
                } flex items-center justify-between gap-2 transition-all backdrop-blur-xs`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 bg-white/85 dark:bg-slate-900/85 ${tierStyle.text} border border-current/20`}
                  >
                    {tierStyle.badge}
                  </span>
                  <span className="text-xs text-slate-800 dark:text-slate-100 truncate">
                    {displayLabel}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-slate-900 dark:text-white">
                    {item.count.toLocaleString('tr-TR')}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md bg-white/75 dark:bg-slate-900/65 ${tierStyle.text}`}
                  >
                    %{totalPct}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between relative z-10 mt-2">
        <span>{t('funnel_note')}</span>
        <span className="text-emerald-600 dark:text-teal-400 flex items-center gap-1">
          <span>{t('funnel_tag')}</span>
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
