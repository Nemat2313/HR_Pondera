'use client';

import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { WorkPermitStat } from '@/types';

interface PowerBIWorkPermitsProps {
  permits: WorkPermitStat[];
  totalCount: number;
  onSelectPermit?: (permitKey: string) => void;
  onOpenDetail?: (permitKey?: string) => void;
}

// Comprehensive metadata for short codes, full descriptions and color branding
const PERMIT_CONFIG: Record<
  string,
  {
    shortTr: string;
    shortRu: string;
    fullTr: string;
    fullRu: string;
    descTr: string;
    descRu: string;
    color: string;
  }
> = {
  VKS: {
    shortTr: 'VKS',
    shortRu: 'ВКС',
    fullTr: 'BKC (Yüksek Nitelikli Uzman)',
    fullRu: 'ВКС (Высококвалифицированный специалист)',
    descTr: 'Yüksek maaş baremine tabi uzman çalışma izni',
    descRu: 'Высококвалифицированные специалисты с РНР',
    color: '#06B6D4',
  },
  PATENT: {
    shortTr: 'Patent',
    shortRu: 'Патент',
    fullTr: 'Патент (Çalışma Patenti)',
    fullRu: 'Патент (Трудовой патент для безвизовых стран)',
    descTr: 'Vizesiz BDT vatandaşları için çalışma patenti',
    descRu: 'Патент на работу для граждан безвизовых стран',
    color: '#3B82F6',
  },
  QUOTA_RNR: {
    shortTr: 'Kota',
    shortRu: 'Квота',
    fullTr: 'Квота / РНР (Standart Çalışma İzni)',
    fullRu: 'Квота / РНР (Стандартное разрешение на работу)',
    descTr: 'Yıllık kota kapsamında standart çalışma izni',
    descRu: 'Стандартное РНР в рамках ежегодной квоты',
    color: '#10B981',
  },
  RF_CITIZEN: {
    shortTr: 'RF',
    shortRu: 'РФ',
    fullTr: 'Граждане РФ (Rusya Vatandaşları)',
    fullRu: 'Граждане РФ (Без разрешения на работу)',
    descTr: 'Rusya Federasyonu vatandaşı, çalışma izni gerekmez',
    descRu: 'Граждане России, разрешение на работу не требуется',
    color: '#8B5CF6',
  },
  OTHER_PENDING: {
    shortTr: 'Diğer',
    shortRu: 'Прочее',
    fullTr: 'İşlemde / Diğer Statüler',
    fullRu: 'В оформлении / Прочие документы',
    descTr: 'Evrak hazırlık veya diğer statüdeki personeller',
    descRu: 'В процессе оформления или иные статусы',
    color: '#64748B',
  },
  EAES: {
    shortTr: 'EAES',
    shortRu: 'ЕАЭС',
    fullTr: 'Граждане ЕАЭС (Avrasya Birliği)',
    fullRu: 'Граждане ЕАЭС (Армения, Беларусь, Казахстан, Киргизия)',
    descTr: 'Avrasya Birliği serbest çalışma hakkı (Muaf)',
    descRu: 'Трудовая деятельность без разрешительных документов',
    color: '#F59E0B',
  },
  VNJ_RVP: {
    shortTr: 'VNJ',
    shortRu: 'ВНЖ',
    fullTr: 'ВНЖ / РВП (Oturma İzni)',
    fullRu: 'ВНЖ / РВП (Вид на жительство / Разрешение на проживание)',
    descTr: 'Rusya ikamet veya geçici oturma izni hamili',
    descRu: 'Постоянное или временное проживание в РФ',
    color: '#EC4899',
  },
};

// Fallback data in case permits array is empty initially
const DEFAULT_PERMIT_DATA: WorkPermitStat[] = [
  { key: 'VKS', name: 'ВКС (Yüksek Nitelikli Uzman)', nameRu: 'ВКС (Высококвалифицированный специалист)', count: 2049, percentage: 38.2, color: '#06B6D4' },
  { key: 'PATENT', name: 'Патент (Çalışma Patenti)', nameRu: 'Патент (Трудовой патент)', count: 1590, percentage: 29.6, color: '#3B82F6' },
  { key: 'QUOTA_RNR', name: 'Квота / РНР (Standart İzin)', nameRu: 'Квота / РНР (Разрешение на работу)', count: 814, percentage: 15.2, color: '#10B981' },
  { key: 'RF_CITIZEN', name: 'Граждане РФ (İzin Gerekmez)', nameRu: 'Граждане РФ (Без разрешения)', count: 383, percentage: 7.1, color: '#8B5CF6' },
  { key: 'OTHER_PENDING', name: 'İşlemde / Diğer', nameRu: 'В оформлении / Прочее', count: 397, percentage: 7.4, color: '#64748B' },
  { key: 'EAES', name: 'Граждане ЕАЭС (Serbest Dolaşım)', nameRu: 'Граждане ЕАЭС (Без разрешения)', count: 102, percentage: 1.9, color: '#F59E0B' },
  { key: 'VNJ_RVP', name: 'ВНЖ / РВП (Oturma İzni)', nameRu: 'ВНЖ / РВП (Вид на жительство)', count: 29, percentage: 0.5, color: '#EC4899' },
];

function getShortCode(key: string, lang: 'tr' | 'ru'): string {
  const cfg = PERMIT_CONFIG[key];
  if (cfg) return lang === 'ru' ? cfg.shortRu : cfg.shortTr;
  return key;
}

export default function PowerBIWorkPermits({
  permits,
  totalCount,
  onSelectPermit,
  onOpenDetail,
}: PowerBIWorkPermitsProps) {
  const { lang, t } = useLanguage();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<WorkPermitStat | null>(null);

  const data = permits && permits.length > 0 ? permits : DEFAULT_PERMIT_DATA;
  const grandTotal = totalCount > 0 ? totalCount : data.reduce((acc, d) => acc + d.count, 0) || 5364;

  // Active display item in center of donut
  const activeCenterItem = hoveredItem || (selectedKey ? data.find((d) => d.key === selectedKey) : null);

  // Custom slice label directly on the pie chart
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, index } = props;
    const item = data[index];
    if (!item) return null;

    const shortCode = getShortCode(item.key, lang);
    const RADIAN = Math.PI / 180;

    // For slices with >= 6% share: display abbreviation + percentage inside the donut slice
    if (percent >= 0.06) {
      const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);

      return (
        <g className="select-none pointer-events-none drop-shadow-md">
          <text
            x={x}
            y={y - 7}
            fill="#ffffff"
            textAnchor="middle"
            dominantBaseline="central"
            className="font-black text-[11px] tracking-tight"
          >
            {shortCode}
          </text>
          <text
            x={x}
            y={y + 8}
            fill="#ffffff"
            textAnchor="middle"
            dominantBaseline="central"
            className="font-bold text-[10px] opacity-95 font-mono"
          >
            %{item.percentage}
          </text>
        </g>
      );
    }

    // For small slices (< 6%), show outer callout label with leader line
    const rInside = outerRadius + 2;
    const rOutside = outerRadius + 12;
    const rText = outerRadius + 16;

    const x1 = cx + rInside * Math.cos(-midAngle * RADIAN);
    const y1 = cy + rInside * Math.sin(-midAngle * RADIAN);
    const x2 = cx + rOutside * Math.cos(-midAngle * RADIAN);
    const y2 = cy + rOutside * Math.sin(-midAngle * RADIAN);
    const xText = cx + rText * Math.cos(-midAngle * RADIAN);
    const yText = cy + rText * Math.sin(-midAngle * RADIAN);
    const isRight = xText >= cx;

    return (
      <g className="select-none pointer-events-none">
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={item.color}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.85}
        />
        <circle cx={x2} cy={y2} r={2} fill={item.color} />
        <text
          x={xText}
          y={yText}
          fill={item.color}
          textAnchor={isRight ? 'start' : 'end'}
          dominantBaseline="central"
          className="font-black text-[10.5px]"
        >
          {shortCode}{' '}
          <tspan className="font-mono text-slate-700 dark:text-slate-200 font-bold text-[10px]">
            %{item.percentage}
          </tspan>
        </text>
      </g>
    );
  };

  const handleSliceClick = (entry: WorkPermitStat) => {
    const nextKey = selectedKey === entry.key ? null : entry.key;
    setSelectedKey(nextKey);
    if (onSelectPermit) {
      onSelectPermit(entry.key);
    }
  };

  return (
    <div className="p-4 sm:p-5 lg:p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden transition-colors h-full flex flex-col justify-between">
      {/* Background ambient glow */}
      <div className="hidden dark:block absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="hidden dark:block absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header - Clean single line, won't truncate */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-2 relative z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
            {t('permits_title')}
          </h3>
        </div>

        {onOpenDetail && (
          <button
            onClick={() => onOpenDetail(selectedKey || undefined)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-xs font-bold border border-cyan-200 dark:border-cyan-500/40 transition-all cursor-pointer shadow-2xs shrink-0"
            title={lang === 'ru' ? 'Открыть список персонала' : 'Çalışma İzni Detay Listesi'}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
          </button>
        )}
      </div>

      {/* DONUT PIE CHART STAGE (380px Height - Matches Decomposition Tree exactly) */}
      <div className="h-[380px] w-full relative flex items-center justify-center my-auto z-10">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={114}
              paddingAngle={2.5}
              dataKey="count"
              nameKey="name"
              label={renderCustomLabel}
              labelLine={false}
              onClick={(entry) => handleSliceClick(entry)}
              onMouseEnter={(_, index) => setHoveredItem(data[index])}
              onMouseLeave={() => setHoveredItem(null)}
              className="cursor-pointer"
            >
              {data.map((entry) => {
                const isSelected = selectedKey === entry.key;
                const isDimmed = selectedKey && !isSelected;
                return (
                  <Cell
                    key={`permit-cell-${entry.key}`}
                    fill={entry.color}
                    opacity={isDimmed ? 0.35 : 1}
                    stroke={isSelected ? '#ffffff' : 'none'}
                    strokeWidth={isSelected ? 2.5 : 0}
                    className="hover:opacity-90 transition-all duration-200"
                  />
                );
              })}
            </Pie>

            {/* Hover Tooltip with Full Legal Description */}
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as WorkPermitStat;
                  const cfg = PERMIT_CONFIG[d.key];
                  const fullName = cfg
                    ? lang === 'ru'
                      ? cfg.fullRu
                      : cfg.fullTr
                    : lang === 'ru'
                    ? d.nameRu
                    : d.name;
                  const shortCode = cfg ? (lang === 'ru' ? cfg.shortRu : cfg.shortTr) : d.key;
                  const desc = cfg ? (lang === 'ru' ? cfg.descRu : cfg.descTr) : '';
                  const pct = ((d.count / grandTotal) * 100).toFixed(1);

                  return (
                    <div className="p-3 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-xl text-xs text-white shadow-2xl max-w-[280px] pointer-events-none z-50">
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-slate-800">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className="font-bold text-cyan-300 truncate text-[11px]">
                            {shortCode}
                          </span>
                        </div>
                        <span
                          className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0 text-white shadow-2xs"
                          style={{ backgroundColor: d.color }}
                        >
                          %{pct}
                        </span>
                      </div>
                      <p className="font-bold text-white text-xs mb-1 leading-snug">
                        {fullName}
                      </p>
                      {desc && (
                        <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                          {desc}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-400">
                          {lang === 'ru' ? 'Численность:' : 'Personel Sayısı:'}
                        </span>
                        <span className="font-mono text-cyan-300 font-bold">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}{' '}
                          {lang === 'ru' ? 'чел.' : 'kişi'}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center Metric Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {activeCenterItem ? (
            <div className="flex flex-col items-center justify-center text-center px-2 animate-in fade-in duration-200">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-black text-white shadow-xs mb-1"
                style={{ backgroundColor: activeCenterItem.color }}
              >
                {getShortCode(activeCenterItem.key, lang)}
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white drop-shadow-xs">
                %{activeCenterItem.percentage}
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-cyan-300">
                {activeCenterItem.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}{' '}
                {lang === 'ru' ? 'чел.' : 'kişi'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center px-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-white drop-shadow-xs">
                {grandTotal.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400 max-w-[110px] leading-tight mt-0.5">
                {t('permits_registered_total')}
              </span>
              <span className="text-[9px] text-slate-600 dark:text-slate-400 mt-1 font-semibold">
                {data.length} {lang === 'ru' ? 'Категорий' : 'Kategori'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
