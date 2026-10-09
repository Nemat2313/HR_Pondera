'use client';

import React, { useState } from 'react';
import { Globe, MapPin, ArrowRight, Sparkles, Navigation, Layers } from 'lucide-react';

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
  leftPct: number; // percentage on eurasia_map.jpg (0 to 100)
  topPct: number;  // percentage on eurasia_map.jpg (0 to 100)
  corridor: string;
  color: string;
}

const COUNTRY_META: Record<string, CountryMeta> = {
  HINDISTAN: {
    key: 'HINDISTAN',
    displayName: 'Hindistan',
    flag: '🇮🇳',
    leftPct: 53.0,
    topPct: 83.5,
    corridor: 'Güney Asya',
    color: '#F59E0B',
  },
  OZBEKISTAN: {
    key: 'OZBEKISTAN',
    displayName: 'Özbekistan',
    flag: '🇺🇿',
    leftPct: 45.0,
    topPct: 58.5,
    corridor: 'Orta Asya (SNG)',
    color: '#06B6D4',
  },
  AZERBAYCAN: {
    key: 'AZERBAYCAN',
    displayName: 'Azerbaycan',
    flag: '🇦🇿',
    leftPct: 37.0,
    topPct: 62.5,
    corridor: 'Kafkasya & Hazar',
    color: '#10B981',
  },
  RUSYA: {
    key: 'RUSYA',
    displayName: 'Rusya',
    flag: '🇷🇺',
    leftPct: 61.5,
    topPct: 32.0,
    corridor: 'Avrasya / Saha',
    color: '#3B82F6',
  },
  TURKMENISTAN: {
    key: 'TURKMENISTAN',
    displayName: 'Türkmenistan',
    flag: '🇹🇲',
    leftPct: 42.5,
    topPct: 65.5,
    corridor: 'Orta Asya (SNG)',
    color: '#14B8A6',
  },
  TURKIYE: {
    key: 'TURKIYE',
    displayName: 'Türkiye',
    flag: '🇹🇷',
    leftPct: 29.5,
    topPct: 64.5,
    corridor: 'Anadolu Kadrosu',
    color: '#EF4444',
  },
  TACIKISTAN: {
    key: 'TACIKISTAN',
    displayName: 'Tacikistan',
    flag: '🇹🇯',
    leftPct: 49.0,
    topPct: 65.5,
    corridor: 'Orta Asya (SNG)',
    color: '#8B5CF6',
  },
  BANGLADES: {
    key: 'BANGLADES',
    displayName: 'Bangladeş',
    flag: '🇧🇩',
    leftPct: 59.0,
    topPct: 80.5,
    corridor: 'Güney Asya',
    color: '#10B981',
  },
  KIRGIZISTAN: {
    key: 'KIRGIZISTAN',
    displayName: 'Kırgızistan',
    flag: '🇰🇬',
    leftPct: 52.5,
    topPct: 61.5,
    corridor: 'Orta Asya (SNG)',
    color: '#EC4899',
  },
  KAZAKISTAN: {
    key: 'KAZAKISTAN',
    displayName: 'Kazakistan',
    flag: '🇰🇿',
    leftPct: 46.5,
    topPct: 52.5,
    corridor: 'Orta Asya (SNG)',
    color: '#0284C7',
  },
  MOLDOVA: {
    key: 'MOLDOVA',
    displayName: 'Moldova',
    flag: '🇲🇩',
    leftPct: 26.5,
    topPct: 54.5,
    corridor: 'Doğu Avrupa',
    color: '#F97316',
  },
  BELARUS: {
    key: 'BELARUS',
    displayName: 'Belarus',
    flag: '🇧🇾',
    leftPct: 26.0,
    topPct: 46.5,
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

  // Enhance nationalities with coordinates and flags
  const mappedCountries = nationalities
    .map((item) => {
      const meta = COUNTRY_META[item.label] || {
        key: item.label,
        displayName: item.label,
        flag: '🌐',
        leftPct: 50,
        topPct: 50,
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
      label: 'Kafkasya & Hazar (Azerbaycan)',
      count: mappedCountries.filter((c) => c.corridor.includes('Kafkasya')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Anadolu',
      label: 'Türkiye Kadrosu',
      count: mappedCountries.filter((c) => c.corridor.includes('Anadolu')).reduce((s, c) => s + c.count, 0),
    },
    {
      id: 'Avrasya',
      label: 'Rusya Saha Kadrosu',
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
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                Avrasya & Küresel İşgücü Dağılım Haritası
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50">
                12 Kaynak Ülke • {mappedCountries.reduce((s, c) => s + c.count, 0).toLocaleString('tr-TR')} Kişi
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Amerika kıtası elenmiş, Avrasya, Orta Asya, Kafkasya ve Güney Asya odaklı gerçek jeopolitik personel haritası.
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

        {/* Map Container with High-Resolution Geopolitical Map Image & Interactive Pin Overlays */}
        <div className="relative w-full aspect-[16/9] min-h-[380px] max-h-[580px] mt-4 rounded-2xl overflow-hidden border border-slate-800/60 shadow-xl bg-slate-950 select-none">
          {/* Base Real Geopolitical Eurasia Map Image */}
          <img
            src="/images/eurasia_map.jpg"
            alt="Eurasia Geopolitical Map"
            className="w-full h-full object-cover object-center filter brightness-[0.92] contrast-[1.05]"
          />

          {/* Subtle Contrast Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/30 pointer-events-none" />

          {/* Interactive Hotspot Beacons & Country Badges */}
          {mappedCountries.map((country) => {
            const isHovered = hoveredCountryKey === country.key;
            const isTopTier = country.count >= 1000;
            const isMidTier = country.count >= 200 && country.count < 1000;

            return (
              <div
                key={country.key}
                style={{
                  left: `${country.leftPct}%`,
                  top: `${country.topPct}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className={`absolute z-10 transition-all duration-200 cursor-pointer ${
                  isHovered ? 'z-30 scale-110' : ''
                }`}
                onClick={() => onNavigateToPersonnel('nationality', country.label)}
                onMouseEnter={() => setHoveredCountryKey(country.key)}
                onMouseLeave={() => setHoveredCountryKey(null)}
              >
                {/* Pulsing Radar Ring */}
                <span
                  className="absolute -inset-1.5 rounded-full animate-ping opacity-60 pointer-events-none"
                  style={{ backgroundColor: country.color }}
                />

                {/* Beacon Chip */}
                <div
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full shadow-lg border backdrop-blur-md transition-all ${
                    isHovered
                      ? 'bg-white/95 text-slate-900 border-teal-400 ring-2 ring-teal-400/50 scale-105'
                      : 'bg-slate-900/90 text-white border-white/20 hover:border-teal-400/80 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-sm leading-none drop-shadow-sm select-none">
                    {country.flag}
                  </span>
                  <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
                    {country.displayName}:
                  </span>
                  <span
                    className="text-[11px] font-extrabold whitespace-nowrap"
                    style={{ color: isHovered ? '#0f766e' : country.color }}
                  >
                    {country.count.toLocaleString('tr-TR')}
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
                left: `${Math.min(82, Math.max(18, hoveredCountry.leftPct))}%`,
                top: `${Math.min(75, Math.max(20, hoveredCountry.topPct - 8))}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-2xl leading-none">{hoveredCountry.flag}</span>
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                    {hoveredCountry.displayName}
                  </h4>
                  <p className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                    {hoveredCountry.corridor}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Aktif Kadro:</span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {hoveredCountry.count.toLocaleString('tr-TR')} Kişi
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Toplam Payı:</span>
                  <span className="font-bold text-teal-600 dark:text-teal-400">
                    %{hoveredCountry.pct}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2 py-1 rounded-lg text-center flex items-center justify-center gap-1">
                <span>Personel Listesinde Filtrele</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          )}

          {/* Map Bottom Legend */}
          <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-3 text-[11px] text-slate-300 bg-slate-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 select-none">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              Lider Kadro (&gt;2.000)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
              Bölgesel Kadro (500 - 2.000)
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              Uzman Kadro (&lt;500)
            </span>
          </div>

          {/* Top Right Zoom / Focus Tag */}
          <div className="absolute top-3 right-4 flex items-center gap-2 text-[11px] text-slate-300 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
            <Navigation className="w-3.5 h-3.5 text-teal-400" />
            <span>Avrasya / İpek Yolu Koridoru</span>
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
