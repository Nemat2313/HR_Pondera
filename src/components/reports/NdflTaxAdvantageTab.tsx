'use client';

import React, { useMemo, useState } from 'react';
import {
  Scale,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Calculator,
  Search,
  Clock,
  ShieldCheck,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useLanguage } from '@/context/LanguageContext';
import { NdflTaxAnalysisSummary, TaxWorkerGroup } from '@/lib/reportProposalsEngine';

interface NdflTaxAdvantageTabProps {
  data: NdflTaxAnalysisSummary;
  onNavigateToPersonnel?: (filter: { type: string; value: string }) => void;
}

export default function NdflTaxAdvantageTab({
  data,
  onNavigateToPersonnel,
}: NdflTaxAdvantageTabProps) {
  const { lang } = useLanguage();
  const [selectedYear, setSelectedYear] = useState<number | 'ALL'>('ALL');
  const [refMonthlyGrossRub, setRefMonthlyGrossRub] = useState<number>(100000);
  const [riskSearch, setRiskSearch] = useState('');
  const [riskGroupFilter, setRiskGroupFilter] = useState<'ALL' | 'VIZELI_KOTA' | 'EAES'>('ALL');

  const yearlyComparisonChart = useMemo(() => {
    return data.availableYears.map((yr) => {
      const findRow = (g: TaxWorkerGroup) =>
        data.yearlyRows.find((r) => r.year === yr && r.group === g);
      const vk = findRow('VIZELI_KOTA');
      const pt = findRow('PATENT');
      const ea = findRow('EAES');
      return {
        year: String(yr),
        VizeliKotaShortPct: vk?.under183Pct || 0,
        PatentShortPct: pt?.under183Pct || 0,
        EaesShortPct: ea?.under183Pct || 0,
        VizeliEffNdfl: vk?.effectiveNdflPct || 13,
        PatentEffNdfl: pt?.effectiveNdflPct || 13,
        EaesEffNdfl: ea?.effectiveNdflPct || 13,
      };
    });
  }, [data]);

  const filteredYearlyRows = useMemo(() => {
    return data.yearlyRows.filter((r) => selectedYear === 'ALL' || r.year === selectedYear);
  }, [data.yearlyRows, selectedYear]);

  // Interactive tax impact simulator (strictly using user-selected reference gross, zero DB salary data!)
  const simulationCards = useMemo(() => {
    return data.overallByGroup
      .filter((g) => g.group !== 'VKS')
      .map((g) => {
        const avgMonths = Math.min(6, Math.max(1, g.avgDaysWorked / 30));
        // Extra 17% NDFL on short-term (<183 day) workers for Vizeli/Kota & EAES; 0% for Patent
        const extraPerShortWorkerRub =
          g.group === 'PATENT' ? 0 : Math.round(refMonthlyGrossRub * avgMonths * 0.17);
        const totalEstimatedExtraRub = extraPerShortWorkerRub * g.under183Count;
        return {
          ...g,
          extraPerShortWorkerRub,
          totalEstimatedExtraRub,
        };
      });
  }, [data.overallByGroup, refMonthlyGrossRub]);

  const filteredRiskList = useMemo(() => {
    const q = riskSearch.trim().toLowerCase();
    return data.atRiskList.filter((r) => {
      if (riskGroupFilter !== 'ALL' && r.group !== riskGroupFilter) return false;
      if (!q) return true;
      return (
        r.adSoyad.toLowerCase().includes(q) ||
        r.sicilNo.toLowerCase().includes(q) ||
        r.site.toLowerCase().includes(q) ||
        r.uyruk.toLowerCase().includes(q)
      );
    });
  }, [data.atRiskList, riskSearch, riskGroupFilter]);

  const cardColor = (grp: TaxWorkerGroup) => {
    if (grp === 'VIZELI_KOTA')
      return 'border-rose-300/80 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/25';
    if (grp === 'PATENT')
      return 'border-emerald-300/80 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25';
    if (grp === 'EAES')
      return 'border-amber-300/80 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/25';
    return 'border-indigo-300/80 dark:border-indigo-800/70 bg-indigo-50/40 dark:bg-indigo-950/25';
  };

  return (
    <div className="space-y-4">
      {/* Executive Legal & Tax Context Banner */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Налоговый анализ НДФЛ (13% vs 30%) и правило 183 дней по данным 1С ЗУП'
                  : '1C ZUP Giriş/Çıkış Sürelerine Göre Rusya Gelir Vergisi (NDFL %13 vs %30) & 183 Gün Avantaj Analizi'}
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {lang === 'ru' ? data.dataSourceNoteRu : data.dataSourceNoteTr}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200">
              1C ZUP: {data.zupTotalAnalyzed.toLocaleString('tr-TR')}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              + eBA Çıkış Geçmişi: {data.ebaHistoricalIncluded.toLocaleString('tr-TR')}
            </span>
          </div>
        </div>

        {/* 4 Worker Type Tax Comparison Cards */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {data.overallByGroup.map((g) => (
            <div
              key={g.group}
              className={`rounded-2xl p-3.5 border flex flex-col justify-between gap-2.5 ${cardColor(g.group)}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {lang === 'ru' ? g.labelRu : g.labelTr}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      g.excessTaxPoints > 0
                        ? 'bg-rose-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    Efektif %{g.effectiveNdflPct}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
                    <p className="text-[9.5px] text-slate-500 font-bold">Kayıt</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {g.totalCount.toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
                    <p className="text-[9.5px] text-slate-500 font-bold">&lt;183 Gün</p>
                    <p
                      className={`text-sm font-black ${
                        g.excessTaxPoints > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      %{g.under183Pct}
                    </p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
                    <p className="text-[9.5px] text-slate-500 font-bold">Ort. Gün</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {g.avgDaysWorked}g
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 text-[10.5px] leading-snug text-slate-700 dark:text-slate-300">
                <p className="font-semibold">
                  {lang === 'ru' ? g.shortTermRuleRu : g.shortTermRuleTr}
                </p>
                {g.excessTaxPoints > 0 && (
                  <p className="mt-1 font-extrabold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    +{g.excessTaxPoints} puan ek NDFL vergi yükü ({g.under183Count} kısa dönem kişi)
                  </p>
                )}
                {g.excessTaxPoints === 0 && (
                  <p className="mt-1 font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    Kısa dönemde +%17 vergi cezası yok
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Tax Cost Simulator (No DB salary used!) */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            <div>
              <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Симулятор переплаты НДФЛ (+17%) при краткосрочной занятости (<183 дн.)'
                  : 'Kısa Dönem (<183 Gün) Ekstra %17 NDFL Vergi Maliyeti Simülatörü'}
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Referans aylık brüt ücreti seçerek hangi işçi türünde ne kadar fazla gelir vergisi oluştuğunu simüle edin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-white/90 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Referans Aylık Brüt:
            </span>
            <input
              type="range"
              min={50000}
              max={250000}
              step={10000}
              value={refMonthlyGrossRub}
              onChange={(e) => setRefMonthlyGrossRub(Number(e.target.value))}
              className="w-28 accent-emerald-600 cursor-pointer"
            />
            <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 min-w-[82px] text-right">
              {refMonthlyGrossRub.toLocaleString('tr-TR')} ₽
            </span>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {simulationCards.map((sim) => (
            <div
              key={sim.group}
              className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {lang === 'ru' ? sim.labelRu : sim.labelTr}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  &lt;183 gün: <strong>{sim.under183Count}</strong> kişi • Kişi başı ek vergi:{' '}
                  <strong>{sim.extraPerShortWorkerRub.toLocaleString('tr-TR')} ₽</strong>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold uppercase text-slate-400">Tahmini Ek NDFL</p>
                <p
                  className={`text-sm font-black ${
                    sim.totalEstimatedExtraRub > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {sim.totalEstimatedExtraRub > 0
                    ? `+${(sim.totalEstimatedExtraRub / 1_000_000).toFixed(2)}M ₽`
                    : '0 ₽ (En Avantajlı)'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Row: Yearly Trend + Duration Buckets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Yıllar Bazında Efektif NDFL Vergi Yükü (%) Karşılaştırması
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              183 günden kısa çalışma oranına göre yıllık gerçekleşen efektif gelir vergisi oranı
            </p>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyComparisonChart} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 35]} unit="%" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip formatter={(val: any) => [`%${val}`, '']} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="VizeliEffNdfl" name="Vizeli / Kota (Efektif %)" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="EaesEffNdfl" name="EAES (Yıl Sonu Riskli %)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="PatentEffNdfl" name="Patentli (Sabit %13)" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-600" />
              Çalışma Süresi Dağılımı (183 Gün Rezidentlik Eşiği)
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              İlk 3 dilim (&lt;183 gün) Nerezident vergi riski bölgesidir; 183+ gün kalıcı %13 bölgesidir
            </p>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.durationBuckets} margin={{ top: 10, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="VIZELI_KOTA" name="Vizeli / Kota" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="PATENT" name="Patentli" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="EAES" name="EAES" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Yearly Breakdown Matrix Table */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
            Yıllar Bazında Detaylı Çalışma Süresi &amp; Vergi Avantaj Matrisi (2024 – 2026)
          </h4>
          <div className="inline-flex rounded-lg p-0.5 bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            {(['ALL', ...data.availableYears] as const).map((yr) => (
              <button
                key={String(yr)}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {yr === 'ALL' ? 'Tüm Yıllar' : yr}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-bold">Yıl</th>
                <th className="px-3 py-2.5 font-bold">Çalışan Statüsü</th>
                <th className="px-3 py-2.5 font-bold text-right">Toplam Kişi</th>
                <th className="px-3 py-2.5 font-bold text-right">&lt;183 Gün (Kısa)</th>
                <th className="px-3 py-2.5 font-bold text-right">≥183 Gün (Rezident)</th>
                <th className="px-3 py-2.5 font-bold text-right">Kısa Dönem %</th>
                <th className="px-3 py-2.5 font-bold text-right">Ort. Süre</th>
                <th className="px-3 py-2.5 font-bold text-right">Efektif NDFL</th>
                <th className="px-4 py-2.5 font-bold">Avantaj Değerlendirmesi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredYearlyRows.map((row) => (
                <tr key={`${row.year}-${row.group}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-2 font-black text-slate-900 dark:text-white">{row.year}</td>
                  <td className="px-3 py-2 font-bold">
                    {row.group === 'VIZELI_KOTA'
                      ? 'Vizeli / Kota (RNR)'
                      : row.group === 'PATENT'
                        ? 'Patentli (SNG)'
                        : row.group === 'EAES'
                          ? 'EAES'
                          : 'VKS (Referans)'}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{row.totalCount.toLocaleString('tr-TR')}</td>
                  <td className="px-3 py-2 text-right font-bold text-rose-600 dark:text-rose-400">
                    {row.under183Count.toLocaleString('tr-TR')}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400">
                    {row.over183Count.toLocaleString('tr-TR')}
                  </td>
                  <td className="px-3 py-2 text-right font-extrabold">%{row.under183Pct}</td>
                  <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                    {row.avgDaysWorked} gün
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        row.excessTaxPoints > 3
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                          : row.excessTaxPoints > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      }`}
                    >
                      %{row.effectiveNdflPct}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {row.group === 'PATENT'
                      ? 'Kısa ve uzun vadede en güvenli %13 (183 gün riski yok)'
                      : row.group === 'VKS'
                        ? '1. günden %13 (yüksek maaş eşiği sebebiyle üst kadro)'
                        : row.excessTaxPoints > 0
                          ? `+%${row.excessTaxPoints} puan ek NDFL maliyeti (6 aydan kısa çalışma yüksek)`
                          : 'Çalışanların çoğu 183 günü aştığı için %13 avantajlı'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Executive Strategic Conclusion Box */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-emerald-50/60 to-white dark:from-indigo-950/40 dark:via-emerald-950/30 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-800/60 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 dark:text-slate-200 space-y-1">
          <p className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            Yönetim Özeti — Hangi İşçi Türü Hangi Sürede Daha Avantajlı?
          </p>
          <p>
            • <strong>6 Aydan Kısa Süreli (&lt;183 Gün) Projeler / Yüksek Devir Hızı Olan Ekipler:</strong>{' '}
            <strong className="text-emerald-700 dark:text-emerald-300">Patentli (SNG)</strong> çalışanlar 1. günden itibaren <strong>daima %13 NDFL</strong> ödediği ve erken ayrılsalar bile %30&apos;a çıkmadığı için açık ara <strong>en avantajlı</strong> seçenektir.
          </p>
          <p>
            • <strong>6 Aydan Uzun Süreli (≥183 Gün) İstikrarlı Kadrolar:</strong>{' '}
            <strong className="text-amber-700 dark:text-amber-300">EAES</strong> çalışanları yıl sonuna kadar 183 günü tamamladığında hem <strong>%13 NDFL</strong> korur hem de patent/kota/vize masrafı doğurmaz.
          </p>
          <p>
            • <strong>Vizeli / Kota (RNR) İşçiler:</strong> 183 günden önce işten ayrıldıklarında <strong>kalıcı %30 NDFL (+17 puan kayıp)</strong> oluştururlar; bu nedenle Vizeli/Kota kadroların minimum <strong>7–12 ay elde tutulması</strong> vergi verimliliği açısından kritiktir.
          </p>
        </div>
      </div>

      {/* At-Risk <183 Day Personnel List */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
            &lt;183 Gün Vergi Riski Taşıyan Vizeli / Kota &amp; EAES Personeller ({filteredRiskList.length})
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={riskSearch}
                onChange={(e) => setRiskSearch(e.target.value)}
                placeholder="Personel, sicil, şantiye..."
                className="pl-7 pr-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-48"
              />
            </div>
            <select
              value={riskGroupFilter}
              onChange={(e) => setRiskGroupFilter(e.target.value as 'ALL' | 'VIZELI_KOTA' | 'EAES')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">Tümü (Vizeli + EAES)</option>
              <option value="VIZELI_KOTA">Sadece Vizeli / Kota</option>
              <option value="EAES">Sadece EAES</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-2 font-bold">Sicil / Ad Soyad</th>
                <th className="px-3 py-2 font-bold">Statü</th>
                <th className="px-3 py-2 font-bold">Şantiye</th>
                <th className="px-3 py-2 font-bold">1C Giriş / Çıkış</th>
                <th className="px-3 py-2 font-bold text-right">Çalışma</th>
                <th className="px-4 py-2 font-bold">NDFL Risk Notu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRiskList.map((r) => (
                <tr key={`${r.sicilNo}-${r.hireDate}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateToPersonnel?.({ type: 'search', value: r.sicilNo })
                      }
                      className="text-left hover:text-emerald-600 cursor-pointer"
                    >
                      <span className="font-extrabold text-slate-900 dark:text-white">{r.adSoyad}</span>
                      <span className="ml-1.5 text-[10px] font-mono text-slate-400">#{r.sicilNo}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.group === 'VIZELI_KOTA'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      }`}
                    >
                      {r.group === 'VIZELI_KOTA' ? 'Vizeli/Kota' : 'EAES'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.site}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                    {r.hireDate} → {r.isActive ? 'Aktif' : r.dismissalDate}
                  </td>
                  <td className="px-3 py-2 text-right font-extrabold text-slate-900 dark:text-white">
                    {r.daysWorked}g
                  </td>
                  <td className="px-4 py-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    {lang === 'ru' ? r.taxRiskNoteRu : r.taxRiskNoteTr}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
