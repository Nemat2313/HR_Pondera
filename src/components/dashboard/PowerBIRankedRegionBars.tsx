'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList } from 'recharts';
import { MapPin, Globe2, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface PowerBIRankedRegionBarsProps {
  regionData: { label: string; count: number }[];
  nationalityData: { label: string; count: number }[];
  totalCount?: number;
  selectedRegion: string;
  selectedNationality?: string;
  onSelectRegion: (region: string) => void;
  onSelectNationality: (nat: string) => void;
  onOpenRegionDetail?: (region: string) => void;
  onOpenNationalityDetail?: (nat: string) => void;
}

const TEAL_GRADIENT = ['#0d9488', '#0e7490', '#0284c7', '#0369a1', '#1d4ed8', '#4338ca'];

export default function PowerBIRankedRegionBars({
  regionData,
  nationalityData,
  totalCount = 5363,
  selectedRegion,
  selectedNationality,
  onSelectRegion,
  onSelectNationality,
  onOpenRegionDetail,
  onOpenNationalityDetail,
}: PowerBIRankedRegionBarsProps) {
  const { lang, translateVal } = useLanguage();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. BÖLGELERE GÖRE SIRALI ÇALIŞAN SAYILARI (Değerler ve Oranlar Barların Üzerinde) */}
      <div className="p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white">
              {lang === 'ru' ? 'Распределение сотрудников по регионам' : 'Bölgelere Göre Çalışan Dağılımı'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {onOpenRegionDetail && (
              <button
                onClick={() => onOpenRegionDetail(selectedRegion !== 'all' ? selectedRegion : 'all')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-teal-700 dark:text-teal-300 text-[11px] font-bold border border-teal-200 dark:border-teal-500/30 transition-all cursor-pointer"
                title={lang === 'ru' ? 'Открыть список персонала по регионам' : 'Bölge Personel Listesini Gör'}
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
              </button>
            )}
            {selectedRegion !== 'all' && (
              <button
                onClick={() => onSelectRegion('all')}
                className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
              >
                {lang === 'ru' ? 'Очистить' : 'Temizle'}
              </button>
            )}
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionData} margin={{ top: 25, right: 15, left: -20, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                interval={0}
                angle={-15}
                textAnchor="end"
              />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const p = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : '0';
                    return (
                      <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-teal-500/40 rounded-xl text-xs text-slate-800 dark:text-white shadow-xl">
                        <p className="font-bold text-teal-600 dark:text-teal-300">{d.label}</p>
                        <p className="font-mono mt-0.5 text-slate-900 dark:text-slate-200">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Personel'} (%{p})
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="count"
                radius={[6, 6, 0, 0]}
                onClick={(entry) => entry && entry.label && onSelectRegion(entry.label)}
                className="cursor-pointer"
              >
                <LabelList
                  dataKey="count"
                  position="top"
                  content={({ x, y, width, value }) => {
                    if (value === undefined || value === null) return null;
                    const count = Number(value);
                    const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(0) : '0';
                    return (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={Number(y) - 6}
                        fill="#0f766e"
                        className="dark:fill-teal-300 font-extrabold text-[10px]"
                        textAnchor="middle"
                      >
                        {`${count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} (%${pct})`}
                      </text>
                    );
                  }}
                />
                {regionData.map((entry, index) => (
                  <Cell
                    key={`reg-${index}`}
                    fill={
                      selectedRegion === entry.label
                        ? '#0d9488'
                        : selectedRegion !== 'all'
                        ? '#94a3b8'
                        : TEAL_GRADIENT[index % TEAL_GRADIENT.length]
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>{lang === 'ru' ? 'Казань и Свободный — крупнейшие стройплощадки' : 'Kazan ve Svobodny en büyük şantiyelerdir'}</span>
          <span className="text-teal-600 dark:text-teal-400 font-semibold">
            {regionData.length} {lang === 'ru' ? 'активных регионов' : 'Aktif Bölge'}
          </span>
        </div>
      </div>

      {/* 2. UYRUK DAĞILIMI (Değerler ve Oranlar Barların Sağında) */}
      <div className="p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-teal-600 dark:text-cyan-400" />
            <h3 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white">
              {lang === 'ru' ? 'Рейтинг гражданств (Страны)' : 'Uyruk Sıralaması (Ülkeler)'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {onOpenNationalityDetail && (
              <button
                onClick={() => onOpenNationalityDetail(selectedNationality || 'all')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-teal-700 dark:text-cyan-300 text-[11px] font-bold border border-teal-200 dark:border-cyan-500/30 transition-all cursor-pointer"
                title={lang === 'ru' ? 'Открыть список персонала по гражданствам' : 'Uyruk Personel Listesini Gör'}
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
              </button>
            )}
            {selectedNationality && selectedNationality !== 'all' && (
              <button
                onClick={() => onSelectNationality('all')}
                className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                {lang === 'ru' ? 'Очистить' : 'Temizle'}
              </button>
            )}
            <span className="text-[10px] text-teal-600 dark:text-cyan-400 font-semibold">
              {nationalityData.length} {lang === 'ru' ? 'стран' : 'Ülke'}
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={nationalityData.slice(0, 7).map((d) => ({ ...d, displayLabel: translateVal(d.label) }))}
              margin={{ top: 5, right: 90, left: 75, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} horizontal={false} />
              <XAxis type="number" stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis
                type="category"
                dataKey="displayLabel"
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                width={75}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    const p = totalCount > 0 ? ((d.count / totalCount) * 100).toFixed(1) : '0';
                    return (
                      <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-cyan-500/40 rounded-xl text-xs text-slate-800 dark:text-white shadow-xl">
                        <p className="font-bold text-teal-600 dark:text-cyan-300">{d.displayLabel || translateVal(d.label)}</p>
                        <p className="font-mono mt-0.5 text-slate-900 dark:text-slate-200">
                          {d.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'} (%{p})
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="count"
                radius={[0, 6, 6, 0]}
                onClick={(entry) => entry && entry.label && onSelectNationality(entry.label)}
                className="cursor-pointer"
              >
                <LabelList
                  dataKey="count"
                  position="right"
                  content={({ x, y, width, height, value }) => {
                    if (value === undefined || value === null) return null;
                    const count = Number(value);
                    const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(0) : '0';
                    return (
                      <text
                        x={Number(x) + Number(width) + 8}
                        y={Number(y) + Number(height) / 2 + 3}
                        fill="#0e7490"
                        className="dark:fill-cyan-300 font-extrabold text-[10px]"
                        textAnchor="start"
                      >
                        {`${count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} (%${pct})`}
                      </text>
                    );
                  }}
                />
                {nationalityData.slice(0, 7).map((entry, index) => {
                  const isSelected = selectedNationality === entry.label;
                  const isDimmed = selectedNationality && selectedNationality !== 'all' && !isSelected;
                  return (
                    <Cell
                      key={`nat-${index}`}
                      fill={
                        isSelected
                          ? '#06b6d4'
                          : isDimmed
                          ? '#94a3b8'
                          : TEAL_GRADIENT[index % TEAL_GRADIENT.length]
                      }
                      opacity={isDimmed ? 0.35 : 1}
                      className="hover:opacity-80 transition-opacity"
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>{lang === 'ru' ? 'Индия и Узбекистан составляют 64% всего штата' : "Hindistan ve Özbekistan kadronun %64'ünü oluşturur"}</span>
          <span className="text-teal-600 dark:text-cyan-400 font-semibold">{lang === 'ru' ? 'Все страны →' : 'Tüm Ülkeler →'}</span>
        </div>
      </div>
    </div>
  );
}
