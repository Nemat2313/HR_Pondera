'use client';

import React, { useState } from 'react';
import { Globe, MapPin, ArrowRight, Sparkles, Navigation, Layers } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface CountryStat {
  label: string;
  count: number;
}

interface WorldDemographicsMapProps {
  nationalities: CountryStat[];
  totalEmployees: number;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

interface CountryMeta {
  key: string;
  displayName: string;
  flagCode: string; // ISO 3166-1 2-letter code for local SVG flags
  anchorX: number;  // Coğrafi gerçek merkez koordinatı (%)
  anchorY: number;
  badgeX: number;   // Açılmış, çakışmayan rozet konumu (%)
  badgeY: number;
  corridor: string;
  color: string;
}

const COUNTRY_META: Record<string, CountryMeta> = {
  HINDISTAN: {
    key: 'HINDISTAN',
    displayName: 'Hindistan',
    flagCode: 'in',
    anchorX: 53.0,
    anchorY: 85.0, // Hindistan yarımadasının tam merkezi
    badgeX: 47.0,
    badgeY: 91.5,
    corridor: 'Güney Asya',
    color: '#F59E0B',
  },
  OZBEKISTAN: {
    key: 'OZBEKISTAN',
    displayName: 'Özbekistan',
    flagCode: 'uz',
    anchorX: 43.8,
    anchorY: 62.0, // Özbekistan sınırlarının tam merkezi
    badgeX: 37.5,
    badgeY: 54.5,
    corridor: 'Orta Asya (SNG)',
    color: '#06B6D4',
  },
  AZERBAYCAN: {
    key: 'AZERBAYCAN',
    displayName: 'Azerbaycan',
    flagCode: 'az',
    anchorX: 36.8,
    anchorY: 63.2,
    badgeX: 33.5,
    badgeY: 71.5,
    corridor: 'Kafkasya & Hazar',
    color: '#10B981',
  },
  RUSYA: {
    key: 'RUSYA',
    displayName: 'Rusya',
    flagCode: 'ru',
    anchorX: 62.0,
    anchorY: 34.0,
    badgeX: 63.5,
    badgeY: 28.0,
    corridor: 'Avrasya / Saha',
    color: '#3B82F6',
  },
  TURKMENISTAN: {
    key: 'TURKMENISTAN',
    displayName: 'Türkmenistan',
    flagCode: 'tm',
    anchorX: 42.0,
    anchorY: 67.0,
    badgeX: 41.5,
    badgeY: 77.0,
    corridor: 'Orta Asya (SNG)',
    color: '#14B8A6',
  },
  TURKIYE: {
    key: 'TURKIYE',
    displayName: 'Türkiye',
    flagCode: 'tr',
    anchorX: 29.5,
    anchorY: 64.5,
    badgeX: 23.0,
    badgeY: 67.5,
    corridor: 'Anadolu Kadrosu',
    color: '#EF4444',
  },
  TACIKISTAN: {
    key: 'TACIKISTAN',
    displayName: 'Tacikistan',
    flagCode: 'tj',
    anchorX: 48.8,
    anchorY: 67.5,
    badgeX: 55.0,
    badgeY: 72.0,
    corridor: 'Orta Asya (SNG)',
    color: '#8B5CF6',
  },
  BANGLADES: {
    key: 'BANGLADES',
    displayName: 'Bangladeş',
    flagCode: 'bd',
    anchorX: 58.8,
    anchorY: 81.2,
    badgeX: 66.5,
    badgeY: 81.5,
    corridor: 'Güney Asya',
    color: '#10B981',
  },
  KIRGIZISTAN: {
    key: 'KIRGIZISTAN',
    displayName: 'Kırgızistan',
    flagCode: 'kg',
    anchorX: 51.5,
    anchorY: 64.0, // Kırgızistan dağlık bölgesinin tam merkezi
    badgeX: 62.0,
    badgeY: 60.5,
    corridor: 'Orta Asya (SNG)',
    color: '#EC4899',
  },
  KAZAKISTAN: {
    key: 'KAZAKISTAN',
    displayName: 'Kazakistan',
    flagCode: 'kz',
    anchorX: 46.8,
    anchorY: 53.2,
    badgeX: 46.8,
    badgeY: 45.0,
    corridor: 'Orta Asya (SNG)',
    color: '#0284C7',
  },
  MOLDOVA: {
    key: 'MOLDOVA',
    displayName: 'Moldova',
    flagCode: 'md',
    anchorX: 27.0,
    anchorY: 54.5,
    badgeX: 20.0,
    badgeY: 55.5,
    corridor: 'Doğu Avrupa',
    color: '#F97316',
  },
  BELARUS: {
    key: 'BELARUS',
    displayName: 'Belarus',
    flagCode: 'by',
    anchorX: 26.0,
    anchorY: 46.5,
    badgeX: 19.5,
    badgeY: 43.5,
    corridor: 'Doğu Avrupa',
    color: '#64748B',
  },
};

export default function WorldDemographicsMap({
  nationalities,
  totalEmployees,
  onNavigateToPersonnel,
}: WorldDemographicsMapProps) {
  const { lang, translateVal } = useLanguage();
  const [hoveredCountryKey, setHoveredCountryKey] = useState<string | null>(null);
  const [selectedCorridor, setSelectedCorridor] = useState<string>('all');

  const total = totalEmployees || 1;

  const getCorridorName = (corr: string) => {
    if (lang !== 'ru') return corr;
    if (corr.includes('Güney Asya')) return 'Южная Азия';
    if (corr.includes('Orta Asya')) return 'Центральная Азия (СНГ)';
    if (corr.includes('Kafkasya')) return 'Кавказ и Каспий';
    if (corr.includes('Avrasya')) return 'Евразия / Строительство';
    if (corr.includes('Anadolu')) return 'Штат из Турции';
    if (corr.includes('Doğu Avrupa')) return 'Восточная Европа';
    if (corr.includes('Güneydoğu Asya')) return 'Юго-Восточная Азия';
    if (corr.includes('Kuzey Afrika')) return 'Северная Африка';
    if (corr.includes('Balkanlar')) return 'Балканы и ЕС';
    return corr;
  };

  // Enhance nationalities with coordinates, leader lines and SVG flags
  const mappedCountries = nationalities
    .map((item) => {
      const meta = COUNTRY_META[item.label] || {
        key: item.label,
        displayName: item.label,
        flagCode: 'tr',
        anchorX: 50,
        anchorY: 50,
        badgeX: 50,
        badgeY: 50,
        corridor: 'Diğer',
        color: '#6366F1',
      };
      const pct = Number(((item.count / total) * 100).toFixed(1));
      return {
        ...item,
        ...meta,
        displayName: lang === 'ru' ? translateVal(meta.displayName) : meta.displayName,
        displayCorridor: getCorridorName(meta.corridor),
        pct,
      };
    })
    .sort((a, b) => b.count - a.count);

  const filteredCountries =
    selectedCorridor === 'all'
      ? mappedCountries
      : mappedCountries.filter((c) => c.corridor.includes(selectedCorridor));

  const hoveredCountry = mappedCountries.find((c) => c.key === hoveredCountryKey);

  // Top Corridors Aggregation
  const corridors = [
    {
      id: 'all',
      label: lang === 'ru' ? 'Все национальности' : 'Tüm Uyruklar',
      count: mappedCountries.reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Güney Asya',
      label: lang === 'ru' ? 'Южная Азия (Индия / Бангладеш)' : 'Güney Asya (Hindistan / Bangladeş)',
      count: mappedCountries.filter((c) => c.corridor.includes('Güney Asya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Orta Asya',
      label: lang === 'ru' ? 'Центральная Азия (Узбекистан / СНГ)' : 'Orta Asya (Özbekistan / SNG)',
      count: mappedCountries.filter((c) => c.corridor.includes('Orta Asya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Kafkasya',
      label: lang === 'ru' ? 'Кавказ и Каспий (Азербайджан)' : 'Kafkasya & Hazar (Azerbaycan)',
      count: mappedCountries.filter((c) => c.corridor.includes('Kafkasya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Anadolu',
      label: lang === 'ru' ? 'Штат из Турции' : 'Türkiye Kadrosu',
      count: mappedCountries.filter((c) => c.corridor.includes('Anadolu')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Avrasya',
      label: lang === 'ru' ? 'Россия (Строительный штат)' : 'Rusya Saha Kadrosu',
      count: mappedCountries.filter((c) => c.corridor.includes('Avrasya')).reduce((s, c) => s + c.count, 0),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Real Geopolitical Eurasia & World Map Canvas */}
      <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card p-6 overflow-hidden relative">
        {/* Header Bar with Corridor Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-xs">
                <Globe className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                {lang === 'ru'
                  ? 'Интерактивная карта распределения персонала по Евразии'
                  : 'Avrasya & Küresel İşgücü Dağılım Haritası'}
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50">
                {lang === 'ru'
                  ? `12 стран • ${mappedCountries.reduce((s, c) => s + c.count, 0).toLocaleString('ru-RU')} чел.`
                  : `12 Kaynak Ülke • ${mappedCountries.reduce((s, c) => s + c.count, 0).toLocaleString('tr-TR')} Kişi`}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {lang === 'ru'
                ? 'Реальные векторные флаги, точные географические координаты и соединительные линии.'
                : 'Gerçek vektör bayraklar, merkezlenmiş ülke koordinatları ve bağlantı çizgileriyle ayrıştırılmış ferah harita.'}
            </p>
          </div>

          {/* Corridor Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 dark:bg-slate-800/70 p-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/60">
            {corridors.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCorridor(c.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  selectedCorridor === c.id
                    ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {c.label} ({c.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')})
              </button>
            ))}
          </div>
        </div>

        {/* Map Container: Brightened Modern Cartographic Canvas */}
        <div className="relative w-full aspect-[16/9] min-h-[400px] max-h-[620px] mt-4 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-slate-900 select-none">
          {/* Base Real Geopolitical Eurasia Map Image - Brightened & High Clarity */}
          <img
            src="/images/eurasia_map.jpg"
            alt="Eurasia Geopolitical Map"
            className="w-full h-full object-cover object-center filter brightness-[1.38] contrast-[1.08] saturate-[1.12]"
          />

          {/* Subtle Ambient Atmosphere Glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-sky-950/15 pointer-events-none" />

          {/* SVG LEADER LINES OVERLAY (Haritadaki merkez noktalardan rozetlere uzanan şık çizgiler) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="mapLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="0.3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {mappedCountries.map((c) => {
              const isHovered = hoveredCountryKey === c.key;
              const hasOffset = Math.hypot(c.badgeX - c.anchorX, c.badgeY - c.anchorY) > 1.2;

              return (
                <g key={`leader-line-${c.key}`}>
                  {/* Coğrafi Ülke Merkezindeki Radar Noktası */}
                  <circle
                    cx={c.anchorX}
                    cy={c.anchorY}
                    r={isHovered ? 1.3 : 0.85}
                    fill={c.color}
                    className="transition-all duration-200"
                  />
                  <circle
                    cx={c.anchorX}
                    cy={c.anchorY}
                    r={isHovered ? 2.4 : 1.6}
                    fill="none"
                    stroke={c.color}
                    strokeWidth="0.25"
                    opacity={isHovered ? 0.95 : 0.55}
                    className="animate-ping"
                    style={{ transformOrigin: `${c.anchorX}% ${c.anchorY}%` }}
                  />

                  {/* Bağlantı Çizgisi (Leader Line) */}
                  {hasOffset && (
                    <>
                      {/* Arka plan parlama çizgisi */}
                      <line
                        x1={c.anchorX}
                        y1={c.anchorY}
                        x2={c.badgeX}
                        y2={c.badgeY}
                        stroke={c.color}
                        strokeWidth={isHovered ? 0.7 : 0.35}
                        opacity={isHovered ? 0.6 : 0.28}
                        filter="url(#mapLineGlow)"
                      />
                      {/* Ön plan kesikli şık hat */}
                      <line
                        x1={c.anchorX}
                        y1={c.anchorY}
                        x2={c.badgeX}
                        y2={c.badgeY}
                        stroke={c.color}
                        strokeWidth={isHovered ? 0.45 : 0.26}
                        strokeDasharray={isHovered ? 'none' : '0.8 0.6'}
                        opacity={isHovered ? 1 : 0.75}
                      />
                      {/* Rozet bağlantı noktası */}
                      <circle
                        cx={c.badgeX}
                        cy={c.badgeY}
                        r={isHovered ? 0.6 : 0.4}
                        fill={c.color}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* INTERACTIVE CALLOUT BADGES (Gerçek SVG Bayraklar + Ayrıştırılmış Rozetler) */}
          {mappedCountries.map((country) => {
            const isHovered = hoveredCountryKey === country.key;

            return (
              <div
                key={country.key}
                style={{
                  left: `${country.badgeX}%`,
                  top: `${country.badgeY}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className={`absolute z-20 transition-all duration-200 cursor-pointer select-none ${
                  isHovered ? 'z-30 scale-108' : ''
                }`}
                onClick={() => onNavigateToPersonnel('nationality', country.displayName || country.label)}
                onMouseEnter={() => setHoveredCountryKey(country.key)}
                onMouseLeave={() => setHoveredCountryKey(null)}
              >
                {/* Modern High-Contrast Rozet Çipi */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-lg border backdrop-blur-md transition-all ${
                    isHovered
                      ? 'bg-white text-slate-900 border-teal-500 ring-2 ring-teal-400/50 shadow-2xl scale-105'
                      : 'bg-white/95 text-slate-900 border-slate-300/80 hover:border-teal-400 hover:bg-white dark:bg-slate-900/90 dark:text-white dark:border-white/20 dark:hover:border-teal-400/80 dark:hover:bg-slate-900'
                  }`}
                >
                  {/* Gerçek Vektör Ülke Bayrağı (Windows/Web/Mobil Her Cihazda Renkli Görünür) */}
                  <img
                    src={`/flags/${country.flagCode}.svg`}
                    alt={country.displayName}
                    className="w-4 h-2.5 object-cover rounded-2xs shadow-2xs shrink-0 border border-slate-200/60"
                  />
                  <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
                    {country.displayName}:
                  </span>
                  <span
                    className="text-[11px] font-extrabold whitespace-nowrap"
                    style={{ color: isHovered ? '#0f766e' : country.color }}
                  >
                    {country.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Interactive Glassmorphism Tooltip on Hover */}
          {hoveredCountry && (
            <div
              className="absolute pointer-events-none z-40 p-3.5 rounded-2xl bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-2xl text-left animate-in fade-in zoom-in-95 duration-150 min-w-[220px]"
              style={{
                left: `${Math.min(82, Math.max(18, hoveredCountry.badgeX))}%`,
                top: `${Math.min(75, Math.max(20, hoveredCountry.badgeY - 8))}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <img
                  src={`/flags/${hoveredCountry.flagCode}.svg`}
                  alt={hoveredCountry.displayName}
                  className="w-6 h-4 object-cover rounded-xs shadow-xs border border-slate-200"
                />
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                    {hoveredCountry.displayName}
                  </h4>
                  <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                    {hoveredCountry.displayCorridor}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'ru' ? 'Активный штат:' : 'Aktif Kadro:'}
                  </span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {hoveredCountry.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {lang === 'ru' ? 'Доля в штате:' : 'Toplam Payı:'}
                  </span>
                  <span className="font-bold text-teal-600 dark:text-teal-400">
                    %{hoveredCountry.pct}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2 py-1 rounded-lg text-center flex items-center justify-center gap-1">
                <span>{lang === 'ru' ? 'Фильтровать в списке персонала' : 'Personel Listesinde Filtrele'}</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          )}

          {/* Map Bottom Legend */}
          <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-3 text-[11px] text-slate-800 dark:text-slate-200 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-white/10 shadow-sm select-none">
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              {lang === 'ru' ? 'Лидирующий персонал (>2.000)' : 'Lider Kadro (>2.000)'}
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              {lang === 'ru' ? 'Региональный персонал (500 - 2.000)' : 'Bölgesel Kadro (500 - 2.000)'}
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              {lang === 'ru' ? 'Специалисты (<500)' : 'Uzman Kadro (<500)'}
            </span>
          </div>

          {/* Top Right Zoom / Focus Tag */}
          <div className="absolute top-3 right-4 flex items-center gap-2 text-[11px] text-slate-800 dark:text-slate-200 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-white/10 shadow-sm">
            <Navigation className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="font-semibold">
              {lang === 'ru' ? 'Евразийский и Шелковый коридор' : 'Avrasya & İpek Yolu Koridoru'}
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Country Cards Grid with Real Vector Flags, Corridors & Visual Progress Bars */}
      <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>{lang === 'ru' ? 'Распределение сотрудников по странам и флаги' : 'Ülkelere Göre Çalışan Dağılımı ve Bayraklar'}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredCountries.length} {lang === 'ru' ? 'стран' : 'Ülke'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === 'ru'
                ? 'Нажмите на любую карточку, чтобы открыть полный список сотрудников соответствующего гражданства.'
                : 'Her kart üzerine tıklayarak ilgili uyruktaki personelin tam listesini görüntüleyebilirsiniz.'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {lang === 'ru' ? 'Карточки отсортированы по численности персонала' : 'Kartlar mevcuttaki personel sayısına göre sıralanmıştır'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCountries.map((item, idx) => {
            const isHovered = hoveredCountryKey === item.key;
            return (
              <div
                key={idx}
                onClick={() => onNavigateToPersonnel('nationality', item.displayName || item.label)}
                onMouseEnter={() => setHoveredCountryKey(item.key)}
                onMouseLeave={() => setHoveredCountryKey(null)}
                className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  isHovered
                    ? 'border-teal-500 dark:border-teal-400 bg-teal-50/40 dark:bg-teal-950/20 shadow-md scale-[1.02]'
                    : 'border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                <div>
                  {/* Card Header: Flag + Country Name + Share Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={`/flags/${item.flagCode}.svg`}
                        alt={item.displayName}
                        className="w-7 h-5 object-cover rounded-xs shadow-xs shrink-0 border border-slate-200/60"
                      />
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                          {item.displayName}
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                          {item.displayCorridor}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        item.count >= 1000
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300/40 dark:border-amber-700/50'
                          : 'bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      %{item.pct}
                    </span>
                  </div>

                  {/* Big Number Headcount */}
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      {item.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {lang === 'ru' ? 'Активный штат' : 'Aktif Çalışan'}
                    </span>
                  </div>

                  {/* Relative Share Progress Bar */}
                  <div className="mt-2.5 w-full bg-slate-200/70 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(3, item.pct))}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-200/50 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-teal-600 dark:text-teal-400 font-semibold group">
                  <span>{lang === 'ru' ? 'Открыть в списке персонала' : 'Personel Listesinde Aç'}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
