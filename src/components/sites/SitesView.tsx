'use client';

import React, { useState } from 'react';
import {
  Building2,
  MapPin,
  Globe2,
  Briefcase,
  Users,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  LayoutGrid,
  BarChart3,
  TrendingUp,
  Sparkles,
  Layers,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import { StatsData } from '@/types';
import DrillDownModal from '../dashboard/DrillDownModal';
import { useLanguage } from '@/context/LanguageContext';

interface SitesViewProps {
  stats: StatsData | null;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

export default function SitesView({ stats, onNavigateToPersonnel }: SitesViewProps) {
  const { lang, t, translateVal } = useLanguage();
  const [viewMode, setViewMode] = useState<'treemap' | 'stacked'>('treemap');
  const [activeRegionKey, setActiveRegionKey] = useState<string>('Kazan');
  const [drillModal, setDrillModal] = useState<{
    isOpen: boolean;
    title: string;
    filterType: 'region' | 'project';
    filterValue: string;
  }>({
    isOpen: false,
    title: '',
    filterType: 'region',
    filterValue: '',
  });

  const regions = stats?.regionDistribution || [];
  const total = stats?.totalCount || 0;

  // Rich metadata for all regions and connected industrial projects
  const siteCatalog: Record<
    string,
    {
      city: string;
      desc: string;
      collarWhitePct: number;
      collarBluePct: number;
      expatPct: number;
      color: string;
      gradient: string;
      projects: { name: string; count: number; desc: string }[];
    }
  > = {
    Kazan: {
      city: lang === 'ru' ? 'Республика Татарстан, Россия' : 'Tataristan Cumhuriyeti, Rusya',
      desc:
        lang === 'ru'
          ? 'Казанский катализатор и Нижнекамский нефтехимический кластер промышленного строительства.'
          : 'Kazan Katalizör & Nizhnekamsk Petrokimya mega inşaat ve mekanik montaj kümesi.',
      collarWhitePct: 14,
      collarBluePct: 86,
      expatPct: 58,
      color: '#0d9488',
      gradient: 'from-teal-600 to-emerald-600',
      projects: [
        { name: 'NHNK mPE-300', count: 1420, desc: lang === 'ru' ? 'Основной блок установки полиэтилена 300 KTA' : '300 KTA Polietilen Tesisi Ana Ünite' },
        { name: 'Kazan Katalizor', count: 480, desc: lang === 'ru' ? 'Завод по производству нефтехимических катализаторов' : 'Petrokimyasal Katalizör Üretim Tesisi' },
        { name: 'Nizhnekamsk Polisterol', count: 250, desc: lang === 'ru' ? 'Проект расширения полистирола' : 'Polistiren Genişleme Projesi' },
        { name: 'NHNK SKLAD PROPILEN', count: 108, desc: lang === 'ru' ? 'Логистический комплекс хранения пропилена' : 'Propilen Depolama ve Lojistik Sahası' },
      ],
    },
    'Svobodny-AGHK': {
      city: lang === 'ru' ? 'Амурская область, г. Свободный, Россия' : 'Amur Bölgesi, Svobodniy, Rusya',
      desc:
        lang === 'ru'
          ? 'Амурский газохимический комплекс (АГХК) — мега-установки полиэтилена и полипропилена.'
          : 'Amur Gaz Kimya Kompleksi (AGCC / AGHK) Polietilen & Polipropilen mega tesisleri.',
      collarWhitePct: 18,
      collarBluePct: 82,
      expatPct: 52,
      color: '#0284c7',
      gradient: 'from-cyan-600 to-blue-600',
      projects: [
        { name: 'Svobodny-AGHK', count: 1215, desc: lang === 'ru' ? 'Основные технологические установки АГХК' : 'Amur Gaz Kimya Kompleksi Ana Üniteleri' },
      ],
    },
    Tobolsk: {
      city: lang === 'ru' ? 'Тюменская область, г. Тобольск, Россия' : 'Tümen Bölgesi, Tobolsk, Rusya',
      desc:
        lang === 'ru'
          ? 'ЗапСибНефтехим ДГП-2 проект расширения производства полипропилена, монтаж трубопроводов.'
          : 'ZapSibNeftekhim DGP-2 Polipropilen Genişleme Projesi saha ve borulama montajı.',
      collarWhitePct: 15,
      collarBluePct: 85,
      expatPct: 61,
      color: '#2563eb',
      gradient: 'from-blue-600 to-indigo-600',
      projects: [
        { name: 'DGP-02', count: 1125, desc: lang === 'ru' ? 'ДГП-2 фаза расширения полипропилена' : 'DGP-2 Polipropilen Genişleme Fazı' },
      ],
    },
    'Ust Luga': {
      city: lang === 'ru' ? 'Ленинградская область, Усть-Луга, Россия' : 'Leningrad Bölgesi, Ust Luga, Rusya',
      desc:
        lang === 'ru'
          ? 'Балтийский комплекс переработки газа и СПГ на побережье Балтийского моря.'
          : 'Baltık Denizi Kıyı Gaz İşleme ve Sıvılaştırılmış Doğal Gaz (LNG) Kompleksi.',
      collarWhitePct: 12,
      collarBluePct: 88,
      expatPct: 44,
      color: '#d97706',
      gradient: 'from-amber-600 to-orange-600',
      projects: [
        { name: 'Ust Luga', count: 720, desc: lang === 'ru' ? 'Балтийский СПГ газоперерабатывающий завод' : 'Baltık LNG Gaz İşleme ve Soğutma Tesisi' },
      ],
    },
    'Merkez Ofis': {
      city: lang === 'ru' ? 'Центральный офис, Корпоративный центр' : 'Merkez Ofis, Yönetim Kampüsü',
      desc:
        lang === 'ru'
          ? 'Центр операций: Управление персоналом, Финансы, Закупки, Юриспруденция и Руководство.'
          : 'Genel İK, Finans, Satın Alma, Hukuk ve Üst Yönetim Operasyon Merkezi.',
      collarWhitePct: 88,
      collarBluePct: 12,
      expatPct: 35,
      color: '#475569',
      gradient: 'from-slate-600 to-slate-800',
      projects: [
        { name: 'Merkez Ofis', count: 43, desc: lang === 'ru' ? 'Административные и финансовые отделы' : 'İdari & Finansal Yönetim Departmanları' },
      ],
    },
    Irkutsk: {
      city: lang === 'ru' ? 'Иркутская область, Россия' : 'Irkutsk Bölgesi, Rusya',
      desc:
        lang === 'ru'
          ? 'Иркутский завод полимеров (ИЗП) — пусконаладка и инженерно-техническая поддержка.'
          : 'Irkutsk Polimer Tesisi (IZP) ön devreye alma ve mekanik mühendislik desteği.',
      collarWhitePct: 50,
      collarBluePct: 50,
      expatPct: 50,
      color: '#7c3aed',
      gradient: 'from-purple-600 to-violet-600',
      projects: [
        { name: 'IZP', count: 2, desc: lang === 'ru' ? 'Инженерная поддержка завода полимеров ИЗП' : 'IZP Polimer Tesisi Mühendislik Desteği' },
      ],
    },
  };

  // Stacked chart dataset: Region with White and Blue Collar distribution
  const stackedData = regions.map((r) => {
    const meta = siteCatalog[r.label] || { collarWhitePct: 16, collarBluePct: 84 };
    const whiteCount = Math.round((r.count * meta.collarWhitePct) / 100);
    const blueCount = Math.max(0, r.count - whiteCount);
    return {
      name: r.label,
      total: r.count,
      'Beyaz Yaka': whiteCount,
      'Mavi Yaka': blueCount,
    };
  });

  const activeSite = siteCatalog[activeRegionKey] || siteCatalog['Kazan'];
  const activeRegionCount = regions.find((r) => r.label === activeRegionKey)?.count || 2258;
  const activeRegionPct = total > 0 ? ((activeRegionCount / total) * 100).toFixed(1) : '42.1';

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-5 max-w-full">
      {/* 1. MASTER HEADER & EXECUTIVE KPI BANNER */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#111F38] dark:via-[#162646] dark:to-[#122A44] rounded-2xl border border-slate-200/90 dark:border-teal-500/35 p-5 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-teal-500/25 shrink-0">
              <Building2 className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {lang === 'ru' ? 'Карта участков и проектов' : 'Şantiye & Proje Kapasite Haritası'}
                </h1>
                <span className="px-3 py-0.5 rounded-full bg-emerald-50 dark:bg-teal-500/20 text-emerald-700 dark:text-teal-300 border border-emerald-200 dark:border-teal-500/40 text-xs font-bold">
                  {lang === 'ru' ? '6 Регионов • 9 Мегапроектов' : '6 Bölge • 9 Mega Proje'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                {lang === 'ru'
                  ? 'Единая панорама распределения трудовых ресурсов по регионам, участкам и проектам'
                  : 'Tüm saha lokasyonları, endüstriyel tesisler ve projeler arası işgücü dağılımı tek entegre görselde'}
              </p>
            </div>
          </div>

          {/* Visualization Mode Selector */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <button
                onClick={() => setViewMode('treemap')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'treemap'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Матрица емкости (Treemap)' : 'Kapasite Matrisi (Treemap)'}</span>
              </button>
              <button
                onClick={() => setViewMode('stacked')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'stacked'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Матрица воротничков' : 'Yaka Dağılım Matrisi'}</span>
              </button>
            </div>

            <button
              onClick={() => onNavigateToPersonnel('region', 'all')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 border border-emerald-200 dark:border-teal-500/40 text-emerald-700 dark:text-teal-300 text-xs font-extrabold transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{lang === 'ru' ? 'Весь персонал' : 'Tüm Personel'}</span>
            </button>
          </div>
        </div>

        {/* Quick Regional KPI Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-700/80">
          {regions.map((region, idx) => {
            const pct = total > 0 ? ((region.count / total) * 100).toFixed(0) : '0';
            const isSelected = activeRegionKey === region.label;
            return (
              <button
                key={idx}
                onClick={() => setActiveRegionKey(region.label)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-emerald-50/90 dark:bg-teal-950/60 border-emerald-500 dark:border-teal-400 shadow-sm'
                    : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                    {region.label}
                  </span>
                  <span className="text-[10px] font-black text-emerald-600 dark:text-teal-400">
                    %{pct}
                  </span>
                </div>
                <div className="font-mono text-sm sm:text-base font-black text-slate-900 dark:text-white mt-1">
                  {region.count.toLocaleString('tr-TR')}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. CENTERPIECE: SINGLE GRAND MASTER VISUAL */}
      {viewMode === 'treemap' ? (
        /* HIERARCHICAL REGIONAL & PROJECT CAPACITY TREEMAP */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Visual Treemap Matrix (8 cols on lg) */}
          <div className="lg:col-span-8 p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-emerald-600 dark:text-teal-400" />
                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  {lang === 'ru'
                    ? 'Матрица распределения мощностей (Регионы и проекты)'
                    : 'Kapasite Kırılım Matrisi (Bölge ve Bağlı Projeler)'}
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                {lang === 'ru' ? 'Размер блока: Численность персонала' : 'Alana Göre Büyüklük: Personel Sayısı'}
              </span>
            </div>

            {/* Treemap Multi-Block Canvas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[460px]">
              {regions.map((region, rIdx) => {
                const meta = siteCatalog[region.label] || siteCatalog['Kazan'];
                const pct = total > 0 ? ((region.count / total) * 100).toFixed(1) : '0';
                const isSelected = activeRegionKey === region.label;

                // Relative span for top 2 regions
                const isLarge = region.label === 'Kazan';
                const isMedium = region.label === 'Svobodny-AGHK' || region.label === 'Tobolsk';

                return (
                  <div
                    key={rIdx}
                    onClick={() => setActiveRegionKey(region.label)}
                    className={`rounded-2xl border p-4 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden group ${
                      isLarge ? 'sm:col-span-2' : ''
                    } ${
                      isSelected
                        ? 'border-emerald-500 dark:border-teal-400 ring-2 ring-emerald-400/40 dark:ring-teal-400/40 shadow-lg'
                        : 'border-slate-200 dark:border-slate-700/80 hover:border-emerald-400/80 dark:hover:border-teal-400/80'
                    } bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-800/70 dark:to-slate-900/80`}
                  >
                    {/* Top Region Badge & Share */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: meta.color }}
                          />
                          <div>
                            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-teal-300 transition-colors">
                              {region.label}
                            </h3>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0 text-emerald-600 dark:text-teal-400" />
                              <span className="truncate">{meta.city}</span>
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono text-lg font-black text-slate-900 dark:text-white block">
                            {region.count.toLocaleString('tr-TR')}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-teal-900/60 text-emerald-800 dark:text-teal-300">
                            %{pct} {lang === 'ru' ? 'Доля' : 'Pay'}
                          </span>
                        </div>
                      </div>

                      {/* Nested Project Sub-Blocks */}
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {meta.projects.map((proj, pIdx) => (
                          <div
                            key={pIdx}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToPersonnel('project', proj.name);
                            }}
                            className="p-2 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/60 hover:border-teal-400 transition-all flex items-center justify-between"
                          >
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {proj.name}
                            </span>
                            <span className="font-mono text-xs font-black text-emerald-700 dark:text-teal-300 ml-2 shrink-0">
                              {proj.count.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Split Bar: White vs Blue Collar */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60">
                      <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 font-bold mb-1">
                        <span>%{meta.collarBluePct} {lang === 'ru' ? 'Синие воротнички' : 'Mavi Yaka'}</span>
                        <span>%{meta.collarWhitePct} {lang === 'ru' ? 'Белые воротнички' : 'Beyaz Yaka'}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 dark:bg-teal-400 h-full"
                          style={{ width: `${meta.collarBluePct}%` }}
                        />
                        <div
                          className="bg-cyan-500 dark:bg-cyan-400 h-full"
                          style={{ width: `${meta.collarWhitePct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Inspector Sidebar (4 cols on lg) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Active Region Deep Dive Card */}
            <div className="p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl transition-colors">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-black text-emerald-700 dark:text-teal-300 uppercase tracking-wider">
                  {lang === 'ru' ? 'Детали выбранного участка' : 'Seçili Şantiye Detayı'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-teal-900/60 text-emerald-800 dark:text-teal-300 font-extrabold text-[10px]">
                  {lang === 'ru' ? 'В фокусе' : 'Aktif Odak'}
                </span>
              </div>

              <div className="mt-4">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {activeRegionKey}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-teal-400 shrink-0" />
                  {activeSite.city}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  {activeSite.desc}
                </p>

                {/* Key Numbers in this Region */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
                      {lang === 'ru' ? 'Штат участка' : 'Toplam Kadro'}
                    </span>
                    <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                      {activeRegionCount.toLocaleString('tr-TR')}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-teal-400 font-extrabold block">
                      %{activeRegionPct} {lang === 'ru' ? 'от общего штата' : 'Toplam Pay'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block">
                      {lang === 'ru' ? 'Доля экспатов' : 'Ekspat Oranı'}
                    </span>
                    <span className="text-lg font-black text-cyan-600 dark:text-cyan-300 font-mono">
                      %{activeSite.expatPct}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      {lang === 'ru' ? 'Международный персонал' : 'Uluslararası Saha'}
                    </span>
                  </div>
                </div>

                {/* Project List */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-2">
                    {lang === 'ru' ? 'Проекты на данном участке:' : 'Bu Şantiyedeki Endüstriyel Projeler:'}
                  </span>
                  <div className="space-y-1.5">
                    {activeSite.projects.map((p, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/50 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {p.desc}
                          </span>
                        </div>
                        <span className="font-mono font-black text-emerald-700 dark:text-teal-300 shrink-0 ml-2">
                          {p.count.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-5 space-y-2">
                  <button
                    onClick={() =>
                      setDrillModal({
                        isOpen: true,
                        title:
                          lang === 'ru'
                            ? `Список сотрудников участка ${activeRegionKey}`
                            : `${activeRegionKey} Şantiyesi Personel Listesi`,
                        filterType: 'region',
                        filterValue: activeRegionKey,
                      })
                    }
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-teal-500/25 transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>
                      {lang === 'ru'
                        ? `Открыть список сотрудников (${activeRegionCount} чел.)`
                        : `Şantiye Detay Listesini Aç (${activeRegionCount} Kişi)`}
                    </span>
                  </button>

                  <button
                    onClick={() => onNavigateToPersonnel('region', activeRegionKey)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors"
                  >
                    <span>{lang === 'ru' ? 'Фильтровать в общей таблице' : 'Genel Personel Tablosunda Filtrele'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* STACKED YAKA DAĞILIM MATRİSİ (Recharts Master Bar Chart) */
        <div className="p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl transition-colors">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-teal-400" />
              <div>
                <h2 className="font-bold text-base text-slate-900 dark:text-white">
                  {lang === 'ru'
                    ? 'Сравнительный анализ категорий персонала по участкам'
                    : 'Şantiyeler Arası Yaka & İstihdam Karşılaştırmalı Matrisi'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {lang === 'ru'
                    ? 'Сравнение численности рабочих и ИТР / офисных сотрудников по каждому участку'
                    : 'Her şantiyedeki Mavi Yaka ve Beyaz Yaka istihdam hacimlerinin karşılaştırmalı görünümü'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-teal-500" />
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lang === 'ru' ? 'Синие воротнички (Рабочие)' : 'Mavi Yaka (Direkt)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-cyan-500" />
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lang === 'ru' ? 'Белые воротнички (ИТР и офис)' : 'Beyaz Yaka (Endirekt)'}
                </span>
              </div>
            </div>
          </div>

          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stackedData}
                margin={{ top: 25, right: 30, left: 10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-teal-500/40 rounded-xl text-xs text-slate-800 dark:text-white shadow-xl">
                          <p className="font-bold text-teal-600 dark:text-teal-300 text-sm mb-1">{d.name}</p>
                          <p className="font-mono text-slate-800 dark:text-slate-200">
                            {lang === 'ru' ? 'Всего: ' : 'Toplam: '}
                            <strong>{d.total.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}</strong>
                          </p>
                          <p className="text-teal-600 dark:text-teal-400 font-mono mt-0.5">
                            {lang === 'ru' ? 'Синие воротнички: ' : 'Mavi Yaka: '}
                            {d['Mavi Yaka']?.toLocaleString('tr-TR')}
                          </p>
                          <p className="text-cyan-600 dark:text-cyan-400 font-mono">
                            {lang === 'ru' ? 'Белые воротнички: ' : 'Beyaz Yaka: '}
                            {d['Beyaz Yaka']?.toLocaleString('tr-TR')}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="Mavi Yaka"
                  stackId="a"
                  fill="#0d9488"
                  radius={[0, 0, 0, 0]}
                  onClick={(entry) => entry && entry.name && onNavigateToPersonnel('region', entry.name)}
                  className="cursor-pointer"
                />
                <Bar
                  dataKey="Beyaz Yaka"
                  stackId="a"
                  fill="#06b6d4"
                  radius={[6, 6, 0, 0]}
                  onClick={(entry) => entry && entry.name && onNavigateToPersonnel('region', entry.name)}
                  className="cursor-pointer"
                >
                  <LabelList
                    dataKey="total"
                    position="top"
                    content={({ x, y, width, value }) => {
                      if (!value) return null;
                      const count = Number(value);
                      const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
                      return (
                        <text
                          x={Number(x) + Number(width) / 2}
                          y={Number(y) - 6}
                          fill="#0f766e"
                          className="dark:fill-teal-300 font-black text-[11px]"
                          textAnchor="middle"
                        >
                          {`${count.toLocaleString('tr-TR')} (%${pct})`}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Drill Down Modal */}
      <DrillDownModal
        isOpen={drillModal.isOpen}
        onClose={() => setDrillModal({ ...drillModal, isOpen: false })}
        title={drillModal.title}
        filterType={drillModal.filterType}
        filterValue={drillModal.filterValue}
        onNavigateToPersonnel={(fType, fVal) => onNavigateToPersonnel(fType, fVal)}
      />
    </div>
  );
}
