'use client';

import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ShieldCheck, FileSpreadsheet, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { WorkPermitStat } from '@/types';

interface PowerBIWorkPermitsProps {
  permits: WorkPermitStat[];
  totalCount: number;
  onSelectPermit?: (permitKey: string) => void;
  onOpenDetail?: (permitKey?: string) => void;
}

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

export default function PowerBIWorkPermits({
  permits,
  totalCount,
  onSelectPermit,
  onOpenDetail,
}: PowerBIWorkPermitsProps) {
  const { lang, t } = useLanguage();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<WorkPermitStat | null>(null);
  const [viewMode, setViewMode] = useState<'bars' | 'donut'>('bars');

  const data = permits && permits.length > 0 ? permits : DEFAULT_PERMIT_DATA;
  const grandTotal = totalCount > 0 ? totalCount : data.reduce((acc, d) => acc + d.count, 0) || 5364;

  // Active display item in center of donut
  const activeCenterItem = hoveredItem || (selectedKey ? data.find((d) => d.key === selectedKey) : null);

  // Custom sector label inside slice for donut
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.08) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col justify-between relative z-10">
        {/* Header - Clean single line */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3 relative z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-cyan-50 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
              {t('permits_title')}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {/* View Switcher: Bars vs Donut */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('bars')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'bars'
                    ? 'bg-white dark:bg-cyan-600 text-cyan-700 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={lang === 'ru' ? 'Вид полосами (горизонтальный)' : 'Çubuk Grafik Görünümü'}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('permits_view_bars')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('donut')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  viewMode === 'donut'
                    ? 'bg-white dark:bg-cyan-600 text-cyan-700 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={lang === 'ru' ? 'Круговой вид (пончик)' : 'Halka Grafik Görünümü'}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('permits_view_donut')}</span>
              </button>
            </div>

            {onOpenDetail && (
              <button
                onClick={() => onOpenDetail(selectedKey || undefined)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-xs font-bold border border-cyan-200 dark:border-cyan-500/40 transition-all cursor-pointer shadow-2xs"
                title={lang === 'ru' ? 'Открыть список персонала' : 'Çalışma İzni Detay Listesi'}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span className="hidden sm:inline">{lang === 'ru' ? 'Детали' : 'Detay'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Proportional Segmented Ribbon Strip */}
        <div className="mb-3.5">
          <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 shadow-inner">
            {data.map((item) => (
              <div
                key={`ribbon-${item.key}`}
                onClick={() => handleSliceClick(item)}
                style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                className={`h-full transition-all duration-300 cursor-pointer hover:brightness-110 ${
                  selectedKey && selectedKey !== item.key ? 'opacity-35' : 'opacity-100'
                }`}
                title={`${lang === 'ru' ? item.nameRu : item.name}: ${item.count.toLocaleString()} (%${item.percentage})`}
              />
            ))}
          </div>
        </div>

        {/* VIEW 1: HORIZONTAL BARS MATRIX (Default - No duplicate donut) */}
        {viewMode === 'bars' ? (
          <div className="flex-1 flex flex-col justify-around gap-2.5 py-1">
            {data.map((item) => {
              const isSelected = selectedKey === item.key;
              const isDimmed = selectedKey && !isSelected;
              return (
                <div
                  key={item.key}
                  onClick={() => handleSliceClick(item)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-500 ring-2 ring-cyan-500/30 shadow-xs'
                      : isDimmed
                      ? 'opacity-40 hover:opacity-80 border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-800/40'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700/80 hover:border-cyan-400 dark:hover:border-cyan-500/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {lang === 'ru' ? item.nameRu : item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                        {item.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                      </span>
                      <span
                        className="px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold text-white shadow-2xs"
                        style={{ backgroundColor: item.color }}
                      >
                        %{item.percentage}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700/70 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(3, item.percentage))}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* VIEW 2: DONUT CHART (Enlarged to fill space cleanly) */
          <div className="flex-1 flex flex-col justify-between">
            <div className="h-60 relative flex items-center justify-center my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={98}
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
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as WorkPermitStat;
                        const pct = ((d.count / grandTotal) * 100).toFixed(1);
                        return (
                          <div className="p-2.5 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-xl text-xs text-white shadow-xl max-w-[240px]">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                              <p className="font-bold text-cyan-300 truncate">
                                {lang === 'ru' ? d.nameRu : d.name}
                              </p>
                            </div>
                            <p className="font-mono text-white text-sm font-black">
                              {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'kişi'}
                              <span className="text-cyan-400 font-bold ml-1.5">(%{pct})</span>
                            </p>
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
                  <>
                    <span className="text-2xl font-black font-mono text-slate-900 dark:text-white drop-shadow-xs">
                      %{activeCenterItem.percentage}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 max-w-[95px] text-center truncate">
                      {activeCenterItem.key}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xl font-black font-mono text-slate-900 dark:text-white drop-shadow-xs">
                      {grandTotal.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-teal-400">
                      {t('permits_registered_total')}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Compact Breakdown List below Donut */}
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {data.slice(0, 6).map((item) => (
                <div
                  key={item.key}
                  onClick={() => handleSliceClick(item)}
                  className={`flex items-center justify-between p-1.5 px-2 rounded-lg text-xs cursor-pointer transition-all ${
                    selectedKey === item.key
                      ? 'bg-cyan-500/20 border border-cyan-500/50'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {lang === 'ru' ? item.nameRu : item.name}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] font-bold text-slate-900 dark:text-white shrink-0 ml-1">
                    %{item.percentage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

