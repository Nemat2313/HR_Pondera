'use client';

import React from 'react';
import { Award, Briefcase, ChevronRight, TrendingUp, FileSpreadsheet, Crown, ChevronDown } from 'lucide-react';

interface PowerBITitlePyramidProps {
  pyramidData: { title: string; count: number }[];
  totalCount: number;
  selectedTitle?: string;
  onSelectTitle?: (title: string) => void;
  onOpenDetail?: (title: string) => void;
}

export default function PowerBITitlePyramid({
  pyramidData,
  totalCount,
  selectedTitle,
  onSelectTitle,
  onOpenDetail,
}: PowerBITitlePyramidProps) {
  // Tier geometry configuration: width expands progressively from Apex (L1) to Base (L7)
  const tierWidths = [
    'w-[92%] sm:w-[42%]', // L1 Üst Yönetim
    'w-[94%] sm:w-[50%]', // L2 Şef
    'w-[96%] sm:w-[60%]', // L3 Mühendis
    'w-[97%] sm:w-[70%]', // L4 Uzman
    'w-[98%] sm:w-[80%]', // L5 Formen
    'w-[99%] sm:w-[90%]', // L6 Usta / Montajcı
    'w-full',             // L7 Saha Personeli
  ];

  const tierAccents = [
    { badge: 'L1', bg: 'from-amber-500/20 to-emerald-500/20', border: 'border-amber-400/50 dark:border-amber-400/30', text: 'text-amber-700 dark:text-amber-300' },
    { badge: 'L2', bg: 'from-teal-500/20 to-cyan-500/20', border: 'border-teal-400/50 dark:border-teal-400/30', text: 'text-teal-700 dark:text-teal-300' },
    { badge: 'L3', bg: 'from-cyan-500/20 to-blue-500/20', border: 'border-cyan-400/50 dark:border-cyan-400/30', text: 'text-cyan-700 dark:text-cyan-300' },
    { badge: 'L4', bg: 'from-emerald-500/20 to-teal-500/20', border: 'border-emerald-400/50 dark:border-emerald-400/30', text: 'text-emerald-700 dark:text-emerald-300' },
    { badge: 'L5', bg: 'from-teal-500/20 to-emerald-500/20', border: 'border-teal-400/50 dark:border-teal-400/30', text: 'text-teal-700 dark:text-teal-300' },
    { badge: 'L6', bg: 'from-cyan-500/20 to-teal-500/20', border: 'border-cyan-400/50 dark:border-cyan-400/30', text: 'text-cyan-700 dark:text-cyan-300' },
    { badge: 'L7', bg: 'from-emerald-500/20 to-teal-600/20', border: 'border-emerald-500/50 dark:border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300' },
  ];

  return (
    <div className="p-5 lg:p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden flex flex-col justify-between transition-colors">
      {/* Glow background (dark mode only) */}
      <div className="hidden dark:block absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-teal-500/20 text-emerald-600 dark:text-teal-400 border border-emerald-200 dark:border-teal-500/30">
              <Award className="w-4 h-4" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Hiyerarşik Teşkilat Piramidi (Organization Funnel)
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Yönetim zirvesinden saha icrasına doğru 7 kademeli piramidal dağılım
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail(selectedTitle || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-700 dark:text-teal-300 text-[11px] font-bold border border-emerald-200 dark:border-teal-500/30 transition-all cursor-pointer"
              title="Ünvan Kademesi Personel Listesini Gör"
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-teal-400" />
              <span>Detay Gör</span>
            </button>
          )}
        </div>
      </div>

      {/* Apex Indicator Tag */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 font-extrabold uppercase tracking-wider mb-2">
        <Crown className="w-3.5 h-3.5" />
        <span>Yönetim Kademesi (Zirve)</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </div>

      {/* Tiered Pyramid / Funnel Visual Representation */}
      <div className="space-y-1.5 relative z-10 my-1 flex flex-col items-center w-full">
        {pyramidData.map((item, idx) => {
          const totalPct = totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : '0';
          const cleanTitle = item.title.replace(/^\d+\.\s*/, '');
          const isSelected = selectedTitle && selectedTitle !== 'all' && cleanTitle.toLowerCase() === selectedTitle.toLowerCase();
          const isDimmed = selectedTitle && selectedTitle !== 'all' && !isSelected;
          const tierStyle = tierAccents[idx % tierAccents.length];
          const tierWidth = tierWidths[idx] || 'w-full';

          return (
            <div
              key={idx}
              onClick={() => onSelectTitle && onSelectTitle(item.title)}
              className={`transition-all duration-300 cursor-pointer ${tierWidth} ${
                isDimmed ? 'opacity-35 hover:opacity-75' : 'opacity-100'
              }`}
            >
              <div
                className={`p-2 sm:p-2.5 rounded-xl border bg-gradient-to-r ${tierStyle.bg} ${tierStyle.border} ${
                  isSelected
                    ? 'ring-2 ring-emerald-400 dark:ring-teal-400 shadow-md shadow-emerald-500/25'
                    : 'hover:border-emerald-400 dark:hover:border-teal-400'
                } flex items-center justify-between gap-2 transition-all backdrop-blur-xs`}
              >
                {/* Left Badge + Title */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 bg-white/80 dark:bg-slate-900/80 ${tierStyle.text} border border-current/20`}
                  >
                    {tierStyle.badge}
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {cleanTitle}
                  </span>
                </div>

                {/* Right Count + Percentage */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-black font-mono text-slate-900 dark:text-white">
                    {item.count.toLocaleString('tr-TR')}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold bg-white/70 dark:bg-slate-900/60 ${tierStyle.text}`}
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
        <span>Saha personeli ve usta kadrosu piramidin ana tabanını (%89.1) oluşturur</span>
        <span className="text-emerald-600 dark:text-teal-400 font-semibold flex items-center gap-1">
          <span>7 Kademeli Teşkilat</span>
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
