'use client';

import React from 'react';
import { Users2, Calendar, FileSpreadsheet, Sparkles, ChevronRight, UserCheck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface AgeBracket {
  label: string;
  group?: string;
  count: number;
  color?: string;
}

interface PowerBIAgeDemographicsProps {
  ageBrackets: AgeBracket[];
  avgAge: number;
  totalCount: number;
  onSelectAgeBracket?: (label: string) => void;
  onOpenDetail?: () => void;
}

export default function PowerBIAgeDemographics({
  ageBrackets,
  avgAge,
  totalCount,
  onSelectAgeBracket,
  onOpenDetail,
}: PowerBIAgeDemographicsProps) {
  const { lang, t } = useLanguage();
  const total = ageBrackets.reduce((s, b) => s + b.count, 0) || totalCount || 1;

  const defaultBrackets: AgeBracket[] = [
    { label: '< 25 Yaş', group: 'Gen Z / Genç Yetenek', count: 922, color: '#8B5CF6' },
    { label: '25 - 34 Yaş', group: 'Y Kuşağı / Dinamik Kadro', count: 2970, color: '#3B82F6' },
    { label: '35 - 44 Yaş', group: 'Deneyimli Saha Gücü', count: 2479, color: '#06B6D4' },
    { label: '45 - 54 Yaş', group: 'Uzman & Usta Kademesi', count: 896, color: '#10B981' },
    { label: '55+ Yaş', group: 'Kıdemli Danışman & Mentor', count: 188, color: '#F59E0B' },
  ];

  const brackets = ageBrackets && ageBrackets.length > 0 ? ageBrackets : defaultBrackets;

  const translateAgeLabel = (label: string) => {
    if (lang === 'tr') return label;
    if (label.includes('< 25')) return '< 25 лет';
    if (label.includes('25 - 34')) return '25 - 34 года';
    if (label.includes('35 - 44')) return '35 - 44 года';
    if (label.includes('45 - 54')) return '45 - 54 года';
    if (label.includes('55+')) return '55+ лет';
    return label;
  };

  const translateGroup = (group?: string) => {
    if (lang === 'tr' || !group) return group || 'Kuşak Grubu';
    if (group.includes('Gen Z') || group.includes('Genç')) return 'Поколение Z / Молодые кадры';
    if (group.includes('Y Kuşağı') || group.includes('Dinamik')) return 'Поколение Y / Основной костяк';
    if (group.includes('Deneyimli')) return 'Опытный производственный состав';
    if (group.includes('Uzman') || group.includes('Usta')) return 'Ведущие специалисты и наставники';
    if (group.includes('Kıdemli') || group.includes('Mentor')) return 'Старшие консультанты и эксперты';
    return group;
  };

  return (
    <div className="p-5 lg:p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden flex flex-col justify-between transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-500/30">
              <Users2 className="w-4 h-4" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              {t('age_title')}
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('age_sub')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Average Age KPI Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 text-xs font-extrabold shadow-2xs">
            <Calendar className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? `Ср. ${avgAge || 34.9} года` : `Ort. ${avgAge || 34.9} Yaş`}</span>
          </div>

          {onOpenDetail && (
            <button
              onClick={onOpenDetail}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-teal-700 dark:text-teal-300 text-[11px] font-bold border border-teal-200 dark:border-teal-500/30 transition-all cursor-pointer"
              title={lang === 'ru' ? 'Смотреть список по возрастам' : 'Yaş Dağılımı Personel Listesini Gör'}
            >
              <FileSpreadsheet className="w-3 h-3 text-teal-600 dark:text-teal-400" />
              <span>{t('btn_see_detail')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Brackets List with Visual Progress Bars */}
      <div className="space-y-3 relative z-10 my-auto">
        {brackets.map((item, idx) => {
          const pct = Number(((item.count / total) * 100).toFixed(1));
          const color = item.color || '#06B6D4';

          return (
            <div
              key={idx}
              onClick={() => onSelectAgeBracket && onSelectAgeBracket(item.label)}
              className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-teal-400/50 dark:hover:border-teal-400/40 bg-slate-50/60 dark:bg-slate-800/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-bold text-slate-800 dark:text-white">
                    {translateAgeLabel(item.label)}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    ({translateGroup(item.group)})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-slate-900 dark:text-white text-xs">
                    {item.count.toLocaleString('tr-TR')} {t('unit_person')}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    %{pct}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200/80 dark:bg-slate-700/60 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
                  style={{
                    width: `${Math.min(100, Math.max(3, pct))}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Insight Note */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>{t('age_sparkle_note')}</span>
        </span>
        <span className="font-bold text-teal-600 dark:text-teal-400 flex items-center gap-0.5">
          <span>{t('age_benchmark')}</span>
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
