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
      <div className="-mx-5 -mt-5 lg:-mx-6 lg:-mt-6 px-5 py-3.5 lg:px-6 lg:py-4 mb-4 rounded-t-2xl bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#131F38] flex items-center justify-between border-b border-emerald-200/70 dark:border-slate-800 relative z-10">
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

      {/* Vertical Bar Chart (X-Axis = Age Groups, Y-Axis = Personnel Count) */}
      <div className="relative z-10 my-auto pt-2">
        {(() => {
          const maxCount = Math.max(1, ...brackets.map((b) => b.count || 0));
          return (
            <div className="flex flex-col">
              {/* Chart Plot Area */}
              <div className="relative h-56 sm:h-60 flex items-end justify-around gap-2 sm:gap-3 px-2 pt-8 pb-1 border-b border-slate-200 dark:border-slate-700/80">
                {/* Subtle horizontal gridlines */}
                <div className="absolute inset-x-0 top-8 bottom-1 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3].map((line) => (
                    <div
                      key={line}
                      className="w-full border-t border-dashed border-slate-200/70 dark:border-slate-800/80"
                    />
                  ))}
                </div>

                {brackets.map((item, idx) => {
                  const pct = Number(((item.count / total) * 100).toFixed(1));
                  const barHeightPct = Math.max(8, Math.round((item.count / maxCount) * 100));
                  const color = item.color || '#06B6D4';
                  const shortAge = item.label.replace(/\s*Yaş/i, '').trim();

                  return (
                    <div
                      key={idx}
                      onClick={() => onSelectAgeBracket && onSelectAgeBracket(item.label)}
                      title={`${translateAgeLabel(item.label)} (${translateGroup(item.group)}): ${item.count.toLocaleString('tr-TR')} (%${pct})`}
                      className="flex-1 h-full flex flex-col items-center justify-end group cursor-pointer relative z-10 max-w-[72px]"
                    >
                      {/* Top Value & Pct Label */}
                      <div className="mb-1.5 text-center transition-transform group-hover:-translate-y-0.5">
                        <div className="text-[11px] font-mono font-extrabold text-slate-900 dark:text-white leading-none">
                          {item.count.toLocaleString('tr-TR')}
                        </div>
                        <div
                          className="text-[9.5px] font-bold mt-0.5 px-1.5 py-0.2 rounded-full inline-block"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          %{pct}
                        </div>
                      </div>

                      {/* Vertical Column */}
                      <div
                        className="w-full max-w-[44px] rounded-t-xl transition-all duration-500 group-hover:brightness-110 group-hover:shadow-md relative overflow-hidden"
                        style={{
                          height: `${barHeightPct}%`,
                          background: `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`,
                          boxShadow: `0 4px 14px -4px ${color}55`,
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-1.5 bg-white/30" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-Axis Labels (Age Groups) */}
              <div className="flex items-start justify-around gap-2 sm:gap-3 px-2 pt-2">
                {brackets.map((item, idx) => {
                  const color = item.color || '#06B6D4';
                  const shortAge = translateAgeLabel(item.label)
                    .replace(/\s*(Yaş|лет)/gi, '')
                    .trim();
                  return (
                    <div
                      key={idx}
                      onClick={() => onSelectAgeBracket && onSelectAgeBracket(item.label)}
                      className="flex-1 text-center cursor-pointer max-w-[72px]"
                    >
                      <div className="inline-flex items-center gap-1 justify-center">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          {shortAge}
                        </span>
                      </div>
                      <div className="text-[9.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {translateGroup(item.group)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
