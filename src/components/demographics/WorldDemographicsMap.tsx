'use client';

import React, { useState } from 'react';
import { Globe, MapPin, Users, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

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
  flag: string;
  x: number; // 0 - 1000 SVG coordinates
  y: number; // 0 - 500 SVG coordinates
  corridor: string;
  color: string;
}

const COUNTRY_META: Record<string, CountryMeta> = {
  HINDISTAN: {
    key: 'HINDISTAN',
    displayName: 'Hindistan',
    flag: '🇮🇳',
    x: 690,
    y: 265,
    corridor: 'Güney Asya',
    color: '#F59E0B',
  },
  OZBEKISTAN: {
    key: 'OZBEKISTAN',
    displayName: 'Özbekistan',
    flag: '🇺🇿',
    x: 632,
    y: 198,
    corridor: 'Orta Asya (SNG)',
    color: '#06B6D4',
  },
  AZERBAYCAN: {
    key: 'AZERBAYCAN',
    displayName: 'Azerbaycan',
    flag: '🇦🇿',
    x: 580,
    y: 196,
    corridor: 'Kafkasya & Hazar',
    color: '#10B981',
  },
  RUSYA: {
    key: 'RUSYA',
    displayName: 'Rusya Federasyonu',
    flag: '🇷🇺',
    x: 665,
    y: 138,
    corridor: 'Avrasya / Yerel Saha',
    color: '#3B82F6',
  },
  TURKMENISTAN: {
    key: 'TURKMENISTAN',
    displayName: 'Türkmenistan',
    flag: '🇹🇲',
    x: 618,
    y: 215,
    corridor: 'Orta Asya (SNG)',
    color: '#14B8A6',
  },
  TURKIYE: {
    key: 'TURKIYE',
    displayName: 'Türkiye',
    flag: '🇹🇷',
    x: 546,
    y: 205,
    corridor: 'Anadolu & Merkez',
    color: '#EF4444',
  },
  TACIKISTAN: {
    key: 'TACIKISTAN',
    displayName: 'Tacikistan',
    flag: '🇹🇯',
    x: 652,
    y: 216,
    corridor: 'Orta Asya (SNG)',
    color: '#8B5CF6',
  },
  BANGLADES: {
    key: 'BANGLADES',
    displayName: 'Bangladeş',
    flag: '🇧🇩',
    x: 724,
    y: 260,
    corridor: 'Güney Asya',
    color: '#10B981',
  },
  KIRGIZISTAN: {
    key: 'KIRGIZISTAN',
    displayName: 'Kırgızistan',
    flag: '🇰🇬',
    x: 672,
    y: 200,
    corridor: 'Orta Asya (SNG)',
    color: '#EC4899',
  },
  KAZAKISTAN: {
    key: 'KAZAKISTAN',
    displayName: 'Kazakistan',
    flag: '🇰🇿',
    x: 642,
    y: 172,
    corridor: 'Orta Asya (SNG)',
    color: '#0284C7',
  },
  MOLDOVA: {
    key: 'MOLDOVA',
    displayName: 'Moldova',
    flag: '🇲🇩',
    x: 534,
    y: 176,
    corridor: 'Doğu Avrupa',
    color: '#F97316',
  },
  BELARUS: {
    key: 'BELARUS',
    displayName: 'Belarus',
    flag: '🇧🇾',
    x: 528,
    y: 154,
    corridor: 'Doğu Avrupa',
    color: '#64748B',
  },
};

export default function WorldDemographicsMap({
  nationalities,
  totalEmployees,
  onNavigateToPersonnel,
}: WorldDemographicsMapProps) {
  const [hoveredCountryKey, setHoveredCountryKey] = useState<string | null>(null);
  const [selectedCorridor, setSelectedCorridor] = useState<string>('all');

  const total = totalEmployees || 1;

  // Enhance nationalities with metadata
  const mappedCountries = nationalities
    .map((item) => {
      const meta = COUNTRY_META[item.label] || {
        key: item.label,
        displayName: item.label,
        flag: '🌐',
        x: 550,
        y: 250,
        corridor: 'Diğer',
        color: '#6366F1',
      };
      const pct = Number(((item.count / total) * 100).toFixed(1));
      return {
        ...item,
        ...meta,
        pct,
      };
    })
    .sort((a, b) => b.count - a.count);

  const filteredCountries = selectedCorridor === 'all'
    ? mappedCountries
    : mappedCountries.filter((c) => c.corridor.includes(selectedCorridor));

  const hoveredCountry = mappedCountries.find((c) => c.key === hoveredCountryKey);

  // Top Corridors Aggregation
  const corridors = [
    { id: 'all', label: 'Tüm Uyruklar', count: mappedCountries.reduce((s, c) => s + c.count, 0) },
    {
      id: 'Güney Asya',
      label: 'Güney Asya (Hindistan / Bangladeş)',
      count: mappedCountries.filter((c) => c.corridor.includes('Güney Asya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Orta Asya',
      label: 'Orta Asya (Özbekistan / SNG)',
      count: mappedCountries.filter((c) => c.corridor.includes('Orta Asya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Kafkasya',
      label: 'Kafkasya (Azerbaycan)',
      count: mappedCountries.filter((c) => c.corridor.includes('Kafkasya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Anadolu',
      label: 'Türkiye Kadrosu',
      count: mappedCountries.filter((c) => c.corridor.includes('Anadolu')).reduce((s, c) => s + c.count, 0),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Interactive World Map Canvas */}
      <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card p-6 overflow-hidden relative">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                Küresel İşgücü & Uyruk Haritası
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50">
                12 Kaynak Ülke
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Şantiyelerdeki personelin coğrafi çıkış merkezleri ve bölgesel koridor yoğunlukları.
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
                {c.label} ({c.count.toLocaleString('tr-TR')})
              </button>
            ))}
          </div>
        </div>

        {/* SVG World Map */}
        <div className="relative w-full aspect-[2/1] min-h-[340px] max-h-[500px] mt-4 rounded-2xl bg-gradient-to-b from-slate-50/80 to-slate-100/50 dark:from-[#0B1120] dark:to-[#0F172A] border border-slate-200/60 dark:border-slate-800/80 flex items-center justify-center overflow-hidden">
          {/* Subtle Grid Lines Overlay */}
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, #38bdf8 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <svg
            viewBox="0 0 1000 500"
            className="w-full h-full object-contain pointer-events-auto"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.04))' }}
          >
            <defs>
              <linearGradient id="landGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
              </linearGradient>
            </defs>

            {/* Latitude/Longitude Coordinate Lines */}
            <g className="stroke-slate-200/80 dark:stroke-slate-800/80" strokeWidth="0.5" strokeDasharray="3 3">
              <line x1="0" y1="125" x2="1000" y2="125" />
              <line x1="0" y1="250" x2="1000" y2="250" />
              <line x1="0" y1="375" x2="1000" y2="375" />
              <line x1="250" y1="0" x2="250" y2="500" />
              <line x1="500" y1="0" x2="500" y2="500" />
              <line x1="750" y1="0" x2="750" y2="500" />
            </g>

            {/* Simplified World Continents Path Shapes */}
            <g className="text-slate-400 dark:text-slate-600 fill-[url(#landGradient)] stroke-slate-300/70 dark:stroke-slate-700/60" strokeWidth="0.8">
              {/* North America */}
              <path d="M 120 70 Q 180 60 260 80 Q 290 120 280 180 Q 230 190 200 230 Q 180 250 160 220 Q 140 180 110 160 Q 90 110 120 70 Z" />
              {/* South America */}
              <path d="M 230 250 Q 290 250 320 290 Q 330 350 290 420 Q 260 450 240 430 Q 220 360 210 300 Q 210 270 230 250 Z" />
              {/* Europe */}
              <path d="M 470 110 Q 550 90 590 130 Q 570 170 530 180 Q 480 190 460 160 Q 450 130 470 110 Z" />
              {/* Africa */}
              <path d="M 470 190 Q 560 190 580 260 Q 570 340 520 400 Q 480 390 460 320 Q 440 260 450 210 Q 460 190 470 190 Z" />
              {/* Asia & Eurasia Landmass */}
              <path d="M 580 110 Q 720 70 880 100 Q 900 160 840 210 Q 800 260 740 280 Q 690 290 650 250 Q 610 250 580 200 Q 560 150 580 110 Z" />
              {/* Australia */}
              <path d="M 800 320 Q 880 320 900 360 Q 890 420 830 420 Q 780 390 790 350 Q 790 330 800 320 Z" />
            </g>

            {/* Flight Connection Arcs from Primary Source Countries to Russian Project Hub */}
            <g className="stroke-teal-500/30 dark:stroke-teal-400/25" strokeWidth="1" strokeDasharray="4 4" fill="none">
              {mappedCountries.map((c) => {
                if (c.key === 'RUSYA') return null;
                // Arc towards Russia / Kazan / Moscow coordinates (665, 138)
                const midX = (c.x + 665) / 2;
                const midY = Math.min(c.y, 138) - 25;
                return (
                  <path
                    key={`arc-${c.key}`}
                    d={`M ${c.x} ${c.y} Q ${midX} ${midY} 665 138`}
                    className="opacity-40 hover:opacity-100 transition-opacity"
                  />
                );
              })}
            </g>

            {/* Country Hotspots (Pulsing Radar Beacons) */}
            {mappedCountries.map((country) => {
              const isHovered = hoveredCountryKey === country.key;
              const radius = Math.max(6, Math.min(18, Math.round(6 + (country.count / total) * 24)));

              return (
                <g
                  key={country.key}
                  className="cursor-pointer transition-all duration-200"
                  onClick={() => onNavigateToPersonnel('nationality', country.label)}
                  onMouseEnter={() => setHoveredCountryKey(country.key)}
                  onMouseLeave={() => setHoveredCountryKey(null)}
                >
                  {/* Outer Pulsing Glow */}
                  <circle
                    cx={country.x}
                    cy={country.y}
                    r={radius + 8}
                    fill={country.color}
                    opacity={isHovered ? 0.4 : 0.15}
                    className="animate-pulse"
                  />

                  {/* Main Circle */}
                  <circle
                    cx={country.x}
                    cy={country.y}
                    r={radius}
                    fill={country.color}
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    className="transition-transform duration-150"
                    style={{
                      transformOrigin: `${country.x}px ${country.y}px`,
                      transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                    }}
                  />

                  {/* Core Dot */}
                  <circle
                    cx={country.x}
                    cy={country.y}
                    r={3}
                    fill="#ffffff"
                  />

                  {/* Top-3 Country Name & Count Tag */}
                  {country.count > 500 && (
                    <text
                      x={country.x}
                      y={country.y - radius - 5}
                      textAnchor="middle"
                      className="fill-slate-800 dark:fill-slate-100 font-bold text-[10px] pointer-events-none drop-shadow-sm select-none"
                    >
                      {country.flag} {country.displayName}: {country.count.toLocaleString('tr-TR')}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip Card (Glassmorphism overlay on map) */}
          {hoveredCountry && (
            <div
              className="absolute pointer-events-none z-20 p-3 rounded-2xl bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-xl text-left animate-in fade-in zoom-in-95 duration-150"
              style={{
                left: `${Math.min(80, Math.max(20, (hoveredCountry.x / 1000) * 100))}%`,
                top: `${Math.min(75, Math.max(15, (hoveredCountry.y / 500) * 100 - 15))}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl leading-none">{hoveredCountry.flag}</span>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                    {hoveredCountry.displayName}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {hoveredCountry.corridor}
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Kadro Mevcudu:</span>
                  <p className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {hoveredCountry.count.toLocaleString('tr-TR')}{' '}
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                      (%{hoveredCountry.pct})
                    </span>
                  </p>
                </div>
                <div className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2 py-1 rounded-lg border border-teal-200/50">
                  Filtrele &rarr;
                </div>
              </div>
            </div>
          )}

          {/* Map Bottom Legend / Indicator */}
          <div className="absolute bottom-3 left-4 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-800 select-none">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              Lider Kadro (&gt;2.000 Kişi)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              Bölgesel Kadro (500 - 2.000)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Uzman Kadro (&lt;500)
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Country Cards Grid with Flags, Corridors & Visual Progress Bars */}
      <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Ülkelere Göre Çalışan Dağılımı ve Bayraklar</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredCountries.length} Ülke
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Her kart üzerine tıklayarak ilgili uyruktaki personelin tam listesini görüntüleyebilirsiniz.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Kartlar mevcuttaki personel sayısına göre sıralanmıştır</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCountries.map((item, idx) => {
            const isHovered = hoveredCountryKey === item.key;
            return (
              <div
                key={idx}
                onClick={() => onNavigateToPersonnel('nationality', item.label)}
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
                      <span className="text-2xl leading-none drop-shadow-xs select-none">
                        {item.flag}
                      </span>
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                          {item.displayName}
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                          {item.corridor}
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
                      {item.count.toLocaleString('tr-TR')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Aktif Çalışan
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
                  <span>Personel Listesinde Aç</span>
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
