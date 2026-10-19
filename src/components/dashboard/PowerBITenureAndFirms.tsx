'use client';

import React from 'react';
import { Building2, Calendar, Award, ChevronRight, FileSpreadsheet, ShieldCheck, CheckCircle2, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface PowerBITenureAndFirmsProps {
  topFirms: { name: string; count: number }[];
  tenureBrackets: { label: string; count: number }[];
  totalCount: number;
  onSelectFirm?: (firm: string) => void;
  onOpenFirmDetail?: (firm: string) => void;
  onOpenTenureDetail?: (bracket: string) => void;
}

export default function PowerBITenureAndFirms({
  topFirms,
  tenureBrackets,
  totalCount,
  onSelectFirm,
  onOpenFirmDetail,
  onOpenTenureDetail,
}: PowerBITenureAndFirmsProps) {
  const { lang, translateVal } = useLanguage();
  // Separate Main Firm (Pondera) and Subcontractors
  const mainFirm = topFirms.find((f) => f.name.toUpperCase().includes('PONDERA')) || topFirms[0];
  const subcons = topFirms.filter((f) => f !== mainFirm);

  const mainFirmCount = mainFirm?.count || 4888;
  const mainFirmPct = totalCount > 0 ? ((mainFirmCount / totalCount) * 100).toFixed(1) : '91.1';

  // For tenure vertical histogram
  const maxTenure = Math.max(...tenureBrackets.map((t) => t.count), 1);

  const formatTenureLabel = (lbl: string) => {
    if (lang !== 'ru') return lbl;
    return lbl
      .replace(/0-1 Yıl/i, '0-1 г.')
      .replace(/1-2 Yıl/i, '1-2 г.')
      .replace(/2-3 Yıl/i, '2-3 г.')
      .replace(/3-5 Yıl/i, '3-5 лет')
      .replace(/5\+ Yıl/i, '5+ лет')
      .replace(/Yıl/i, 'лет');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. FIRMA & TAŞERON EKOSİSTEMİ (Partner Ecosystem Cards Grid) */}
      <div className="p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600 dark:text-teal-400" />
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Экосистема компаний и подрядчиков' : 'Firma & Taşeron Ekosistemi'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {onOpenFirmDetail && (
                <button
                  onClick={() => onOpenFirmDetail('all')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-700 dark:text-teal-300 text-[11px] font-bold border border-emerald-200 dark:border-teal-500/30 transition-all cursor-pointer"
                  title={lang === 'ru' ? 'Открыть список персонала компаний' : 'Firma Personel Listesini Gör'}
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
                </button>
              )}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                {topFirms.length} {lang === 'ru' ? 'Компаний' : 'Firma'}
              </span>
            </div>
          </div>

          {/* Featured Primary Firm Card (Pondera Industry) */}
          {mainFirm && (
            <div
              onClick={() => onSelectFirm && onSelectFirm(mainFirm.name)}
              className="p-3 sm:p-3.5 mb-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-teal-500/40 hover:border-emerald-400 transition-all cursor-pointer shadow-xs flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-md shadow-emerald-500/30 shrink-0">
                  PI
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-teal-300 transition-colors">
                      {mainFirm.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-extrabold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      {lang === 'ru' ? 'Основной штат' : 'Ana Kadro'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {lang === 'ru' ? 'Генеральный исполнитель проектных операций' : 'Proje operasyonlarının ana yürütücü kuruluşu'}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono text-base sm:text-lg font-black text-emerald-700 dark:text-teal-300">
                  {mainFirm.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-teal-400 font-bold block">
                  %{mainFirmPct} {lang === 'ru' ? 'Доля' : 'Pay'}
                </span>
              </div>
            </div>
          )}

          {/* Subcontractor Grid Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {subcons.slice(0, 6).map((firm, idx) => {
              const totalPct = totalCount > 0 ? ((firm.count / totalCount) * 100).toFixed(1) : '0';
              // Company Initials
              const initials = firm.name
                .replace(/^(SUB|SUB-CON|SUBCON|OOO)\s*[-–]\s*/i, '')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={idx}
                  onClick={() => onSelectFirm && onSelectFirm(firm.name)}
                  className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 hover:border-teal-400 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {initials}
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-300 truncate">
                      {firm.name}
                    </span>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <span className="font-mono text-xs font-black text-slate-900 dark:text-white">
                      {firm.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                      %{totalPct}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-3">
          <span>{lang === 'ru' ? 'Pondera-Industry — основной работодатель' : 'Pondera-Industry ana istihdam sağlayıcıdır'}</span>
          <span className="text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1 cursor-pointer" onClick={() => onOpenFirmDetail && onOpenFirmDetail('all')}>
            <span>{lang === 'ru' ? 'Все подрядчики' : 'Tüm Taşeronlar'}</span>
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* 2. ŞİRKET İÇİ KIDEM YILI (Vertical Column Frequency Histogram) */}
      <div className="p-5 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-xl flex flex-col justify-between transition-colors">
        <div>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Распределение по стажу работы в компании' : 'Şirket İçi Kıdem Dağılımı (Histogram)'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {onOpenTenureDetail && (
                <button
                  onClick={() => onOpenTenureDetail('all')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold border border-cyan-200 dark:border-cyan-500/30 transition-all cursor-pointer"
                  title={lang === 'ru' ? 'Открыть список персонала по стажу' : 'Kıdem Dağılımı Personel Listesini Gör'}
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>{lang === 'ru' ? 'Детали' : 'Detay Gör'}</span>
                </button>
              )}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                {lang === 'ru' ? 'Ср. 1.8 г.' : 'Ort. 1.8 Yıl'}
              </span>
            </div>
          </div>

          {/* Vertical Histogram Bars Container */}
          <div className="h-44 sm:h-48 pt-4 pb-2 flex items-end justify-between gap-2 sm:gap-4 px-2">
            {tenureBrackets.map((tenure, idx) => {
              // Calculate column height percentage (min 15% for visibility)
              const heightPct = Math.max(12, Math.round((tenure.count / maxTenure) * 100));
              const totalPct = totalCount > 0 ? ((tenure.count / totalCount) * 100).toFixed(1) : '0';

              return (
                <div
                  key={idx}
                  onClick={() => onOpenTenureDetail && onOpenTenureDetail(tenure.label)}
                  className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                >
                  {/* Value and % Pill above column */}
                  <div className="mb-1.5 flex flex-col items-center text-center transition-transform group-hover:-translate-y-1">
                    <span className="text-[10px] sm:text-xs font-black font-mono text-slate-900 dark:text-white">
                      {tenure.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
                    </span>
                    <span className="text-[9px] px-1 py-0.2 rounded font-extrabold bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-200">
                      %{totalPct}
                    </span>
                  </div>

                  {/* Vertical Column with Gradient and Rounded Top */}
                  <div className="w-full max-w-[48px] bg-slate-100 dark:bg-slate-800/80 rounded-t-xl overflow-hidden flex items-end p-0.5 border-t border-x border-slate-200 dark:border-slate-700/60 h-full">
                    <div
                      className="w-full bg-gradient-to-t from-teal-500 via-cyan-400 to-emerald-400 rounded-t-lg transition-all duration-500 group-hover:brightness-110 shadow-md shadow-teal-500/20"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>

                  {/* Bottom Bracket Label */}
                  <div className="mt-2 text-center">
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors whitespace-nowrap block">
                      {formatTenureLabel(tenure.label)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-3">
          <span>
            {lang === 'ru'
              ? 'В связи с фазами стройки 69% найма приходится на 0-1 год'
              : 'Şantiye fazlarına göre işe alımlar 0-1 yılda (%69) kümelenmiştir'}
          </span>
          <span className="text-cyan-600 dark:text-cyan-400 font-semibold cursor-pointer">
            {lang === 'ru' ? 'Кривая опыта →' : 'Tecrübe Eğrisi →'}
          </span>
        </div>
      </div>
    </div>
  );
}
