'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  HeartPulse,
  Gauge,
  ShieldAlert,
  PlaneLanding,
  SunMoon,
  Grid3X3,
  Scale,
  Download,
  RefreshCw,
  Loader2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Users,
  ArrowRight,
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
  AreaChart,
  Area,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/LanguageContext';
import { ReportProposalsPayload } from '@/lib/reportProposalsEngine';
import NdflTaxAdvantageTab from './NdflTaxAdvantageTab';

export type ProposalTabId =
  | 'health'
  | 'sla'
  | 'legal'
  | 'mobility'
  | 'shift'
  | 'quality'
  | 'ndfl';

interface ReportProposalsViewProps {
  initialTab?: ProposalTabId;
  onNavigateToPersonnel?: (filter: { type: string; value: string }) => void;
}

interface ProposalsApiResponse extends ReportProposalsPayload {
  success: boolean;
  message?: string;
}

export default function ReportProposalsView({
  initialTab = 'health',
  onNavigateToPersonnel,
}: ReportProposalsViewProps) {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<ProposalTabId>(initialTab);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [data, setData] = useState<ProposalsApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (selectedRegion !== 'all') params.set('region', selectedRegion);
      const res = await fetch(`/api/report-proposals?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as ProposalsApiResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Rapor verileri alınamadı.');
      }
      setData(json);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Veri yükleme hatası.');
    } finally {
      setLoading(false);
    }
  }, [selectedRegion]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleExportActiveTab = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (activeTab === 'health') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.healthHse.bySite),
        '1_Santiye_Saglik_HSE'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.healthHse.expiringDmsList),
        '2_Yaklasan_DMS_Bitis'
      );
    } else if (activeTab === 'sla') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.slaSpeed.steps),
        '1_Evrak_SLA_Ozeti'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.slaSpeed.delayedRecords),
        '2_Geciken_Kayitlar'
      );
    } else if (activeTab === 'legal') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.legalRisk.bySite),
        '1_Santiye_Bolge_Riski'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.legalRisk.mismatchRecords),
        '2_Bolge_Uyusmazliklari'
      );
    } else if (activeTab === 'mobility') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.mobility.topBorders),
        '1_Sinir_Kapilari'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.mobility.transferFlows),
        '2_Transfer_Akislari'
      );
    } else if (activeTab === 'shift') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.shiftSpan.bySite),
        '1_Vardiya_Direkt_Endirekt'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.shiftSpan.topGroupLeaders),
        '2_Grup_Sefi_Ekipler'
      );
    } else if (activeTab === 'quality') {
      const flatDq = data.dataQuality.bySite.map((r) => ({
        Şantiye: r.site,
        'Aktif Personel': r.total,
        'Genel Skor (%)': r.overallPct,
        ...r.scores,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flatDq), 'Veri_Kalitesi_Skoru');
    } else if (activeTab === 'ndfl') {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.ndflTaxAnalysis.yearlyRows),
        '1_Yillik_NDFL_Analizi'
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(data.ndflTaxAnalysis.atRiskList),
        '2_183_Gun_Riskli_Liste'
      );
    }

    XLSX.writeFile(wb, `Pondera_Yeni_Rapor_Teklifi_${activeTab}_${dateStamp}.xlsx`);
  };

  const tabs: Array<{
    id: ProposalTabId;
    num: string;
    icon: React.ComponentType<{ className?: string }>;
    tr: string;
    ru: string;
    badge?: string;
    highlight?: boolean;
  }> = [
    { id: 'health', num: '1', icon: HeartPulse, tr: 'Sağlık, İSG & DMS', ru: 'Здоровье, ОТ и ДМС' },
    { id: 'sla', num: '2', icon: Gauge, tr: 'Evrak Süreç Hızı (SLA)', ru: 'Скорость док. (SLA)' },
    {
      id: 'legal',
      num: '3',
      icon: ShieldAlert,
      tr: 'Bölge & KPP Risk Radarı',
      ru: 'Риски регионов и КПП',
      badge: data ? String(data.legalRisk.regionMismatchCount) : undefined,
    },
    { id: 'mobility', num: '4', icon: PlaneLanding, tr: 'Sınır & Hareketlilik', ru: 'Граница и мобильность' },
    { id: 'shift', num: '5', icon: SunMoon, tr: 'Vardiya & Yönetim Oranı', ru: 'Смены и структура' },
    {
      id: 'quality',
      num: '6',
      icon: Grid3X3,
      tr: 'Veri Kalitesi Karnesi',
      ru: 'Качество данных eBA',
      badge: data ? `%${data.dataQuality.overallScore}` : undefined,
    },
    {
      id: 'ndfl',
      num: '7',
      icon: Scale,
      tr: '1C ZUP Vergi (NDFL) & 183g',
      ru: 'НДФЛ 13/30% (183 дн.)',
      badge: 'Zahid Bey',
      highlight: true,
    },
  ];

  const heatColor = (pct: number) => {
    if (pct >= 85) return 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border-emerald-400/40';
    if (pct >= 60) return 'bg-teal-500/15 text-teal-900 dark:text-teal-200 border-teal-400/30';
    if (pct >= 35) return 'bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-400/40';
    return 'bg-rose-500/20 text-rose-900 dark:text-rose-200 border-rose-400/40';
  };

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {lang === 'ru'
                    ? 'Предложения новых аналитических отчетов (7 модулей)'
                    : 'Yeni Rapor Teklifleri — 198 eBA & 1C ZUP İleri Analitik Vitrini'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-700/60">
                  7 Sekme • Canlı Veri
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {lang === 'ru'
                  ? 'Оцените каждый отчет с руководством для последующего размещения в нужных разделах системы'
                  : 'Her sekmeyi canlı verilerle inceleyip hangi raporun hangi ana modüle yerleştirileceğine birlikte karar verin'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="text-xs font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-white dark:bg-slate-900">
                    {lang === 'ru' ? 'Все участки' : 'Tüm Şantiyeler'}
                  </option>
                  {data.regions.map((reg) => (
                    <option key={reg} value={reg} className="bg-white dark:bg-slate-900">
                      {reg}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportActiveTab}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={fetchProposals}
              disabled={loading}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 7-Tab Navigation Strip */}
        <div className="px-3 py-2 bg-slate-50/80 dark:bg-slate-900/60 flex flex-wrap items-center gap-1.5">
          {tabs.map((tb) => {
            const Icon = tb.icon;
            const isActive = activeTab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setActiveTab(tb.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  isActive
                    ? tb.highlight
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : tb.highlight
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 border-indigo-300/70 dark:border-indigo-700/60 hover:border-indigo-500'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                }`}
              >
                <span className="opacity-70 text-[10px] font-black">{tb.num}.</span>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'ru' ? tb.ru : tb.tr}</span>
                {tb.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {tb.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {loading && !data ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          <p className="text-xs font-semibold text-slate-500">
            198 eBA kolonu ve 1C ZUP kayıtları analiz ediliyor...
          </p>
        </div>
      ) : data ? (
        <>
          {/* ==================== TAB 1: HEALTH / HSE / DMS ==================== */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {[
                  {
                    label: 'Sağlık 29n Tam',
                    val: data.healthHse.health29nDone.toLocaleString('tr-TR'),
                    sub: `%${data.healthHse.health29nPct} aktif kadro`,
                    cls: 'text-emerald-700 dark:text-emerald-300',
                  },
                  {
                    label: 'DMS Poliçe Kayıtlı',
                    val: data.healthHse.dmsActive.toLocaleString('tr-TR'),
                    sub: `%${data.healthHse.dmsPct} kapsam`,
                    cls: 'text-teal-700 dark:text-teal-300',
                  },
                  {
                    label: 'DMS Süresi Kritik',
                    val: `${data.healthHse.dmsExpired} + ${data.healthHse.dmsExpiring30}`,
                    sub: 'Dolmuş + 30 gün içi',
                    cls: 'text-rose-600 dark:text-rose-400',
                  },
                  {
                    label: 'Kan / Röntgen / Nark.',
                    val: data.healthHse.bloodTestDone.toLocaleString('tr-TR'),
                    sub: `Narkoloji: ${data.healthHse.narcologyDone.toLocaleString('tr-TR')}`,
                    cls: 'text-indigo-700 dark:text-indigo-300',
                  },
                  {
                    label: 'Aşı & Psikoloji Testi',
                    val: data.healthHse.vaccineDone.toLocaleString('tr-TR'),
                    sub: `Psikoloji: ${data.healthHse.psychologyDone.toLocaleString('tr-TR')}`,
                    cls: 'text-sky-700 dark:text-sky-300',
                  },
                  {
                    label: 'HSE Eğitimi Kayıtlı',
                    val: data.healthHse.hseDone.toLocaleString('tr-TR'),
                    sub: `%${data.healthHse.hsePct} kayıtlı`,
                    cls: 'text-amber-600 dark:text-amber-300',
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xs"
                  >
                    <p className="text-[10px] font-bold uppercase text-slate-500">{k.label}</p>
                    <p className={`text-lg font-black mt-0.5 ${k.cls}`}>{k.val}</p>
                    <p className="text-[10px] font-semibold text-slate-400">{k.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Şantiye Bazlı Sağlık 29n, DMS Sigorta &amp; HSE Kapsama Oranları (%)
                    </h3>
                  </div>
                  <div className="p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.healthHse.bySite.slice(0, 10)} margin={{ top: 8, right: 12, left: -12, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis dataKey="site" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={54} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="dmsPct" name="DMS %" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="health29nPct" name="Sağlık 29n %" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="hsePct" name="HSE %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      DMS Sigorta Şirketi Dağılımı
                    </h3>
                  </div>
                  <div className="p-4 space-y-2.5 max-h-72 overflow-y-auto">
                    {data.healthHse.byInsurer.map((ins) => {
                      const maxC = Math.max(1, data.healthHse.byInsurer[0]?.count || 1);
                      return (
                        <div key={ins.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className="truncate text-slate-800 dark:text-slate-100 pr-2">{ins.name}</span>
                            <span className="shrink-0 text-emerald-700 dark:text-emerald-400">
                              {ins.count.toLocaleString('tr-TR')}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                              style={{ width: `${(ins.count / maxC) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    Yaklaşan / Yeni Dolmuş DMS Sağlık Sigortası Poliçeleri ({data.healthHse.expiringDmsList.length})
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2 font-bold">Sicil / Ad Soyad</th>
                        <th className="px-3 py-2 font-bold">Şantiye</th>
                        <th className="px-3 py-2 font-bold">Sigorta Firması</th>
                        <th className="px-3 py-2 font-bold">Bitiş Tarihi</th>
                        <th className="px-4 py-2 font-bold text-right">Kalan Gün</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.healthHse.expiringDmsList.map((row) => (
                        <tr key={row.sicilNo} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-2 font-bold text-slate-900 dark:text-white">
                            {row.adSoyad}{' '}
                            <span className="text-[10px] font-mono text-slate-400">#{row.sicilNo}</span>
                          </td>
                          <td className="px-3 py-2">{row.site}</td>
                          <td className="px-3 py-2 text-slate-500">{row.insurer}</td>
                          <td className="px-3 py-2 font-mono">{row.endDate}</td>
                          <td className="px-4 py-2 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                row.daysLeft < 0
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                  : row.daysLeft <= 15
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                    : 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
                              }`}
                            >
                              {row.daysLeft < 0 ? `${Math.abs(row.daysLeft)}g geçti` : `${row.daysLeft} gün`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: SLA & SPEED ==================== */}
          {activeTab === 'sla' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Evrak &amp; Mobilizasyon Süreç Hızı (Ortalama vs Medyan vs Hedef SLA Gün)
                    </h3>
                  </div>
                  <div className="p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.slaSpeed.steps} layout="vertical" margin={{ top: 6, right: 18, left: 10, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis type="number" unit="g" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis type="category" dataKey="labelTr" width={165} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="avgDays" name="Ortalama Gün" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="medianDays" name="Medyan Gün" fill="#10b981" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="slaTargetDays" name="Hedef SLA" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Süreç Adımı SLA Aşım Özeti
                    </h3>
                  </div>
                  <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                    {data.slaSpeed.steps.map((st) => (
                      <div
                        key={st.key}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {lang === 'ru' ? st.labelRu : st.labelTr}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {st.sampleCount.toLocaleString('tr-TR')} kayıt • P90: {st.p90Days} gün • Hedef: ≤{st.slaTargetDays}g
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                            {st.avgDays}g
                          </span>
                          <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                            %{st.overSlaPct} SLA aşımı
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    Şantiye Bazlı Ortalama Evrak Bekleme Süreleri (Gün)
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Şantiye</th>
                        <th className="px-3 py-2.5 font-bold text-right">Şantiye Varış</th>
                        <th className="px-3 py-2.5 font-bold text-right">Patent</th>
                        <th className="px-3 py-2.5 font-bold text-right">Propusk</th>
                        <th className="px-4 py-2.5 font-bold text-right">Registrasyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.slaSpeed.bySite.map((s) => (
                        <tr key={s.site} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-2 font-extrabold text-slate-900 dark:text-white">{s.site}</td>
                          <td className="px-3 py-2 text-right font-bold">{s.siteArrivalAvg}g</td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-600 dark:text-indigo-400">{s.patentAvg}g</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-600 dark:text-amber-400">{s.propuskAvg}g</td>
                          <td className="px-4 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400">{s.registrationAvg}g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: LEGAL REGION & KPP RISK ==================== */}
          {activeTab === 'legal' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase text-slate-500">Denetlenen Çalışma Kartı</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {data.legalRisk.checkedCount.toLocaleString('tr-TR')}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/35 border border-rose-300/80 dark:border-rose-800">
                  <p className="text-[11px] font-bold uppercase text-rose-700 dark:text-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Farklı Bölge İzniyle Çalışan (Risk)
                  </p>
                  <p className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">
                    {data.legalRisk.regionMismatchCount.toLocaleString('tr-TR')}{' '}
                    <span className="text-xs font-bold">(%{data.legalRisk.regionMismatchPct})</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-300/80 dark:border-emerald-800">
                  <p className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Bölge Uyum Oranı
                  </p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                    %{(100 - data.legalRisk.regionMismatchPct).toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Şantiye Bazlı Bölge Uyuşmazlık Dağılımı
                    </h3>
                  </div>
                  <div className="p-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.legalRisk.bySite.slice(0, 10)} margin={{ top: 8, right: 12, left: -12, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis dataKey="site" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={54} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Bar dataKey="mismatched" name="Uyuşmayan Kart" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Sibur KPP Kapı Geçiş Yetkileri &amp; Propusk Kaynak Dağılımı
                    </h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400">Sibur KPP Kapıları</p>
                      {data.legalRisk.kppBreakdown.map((k) => (
                        <div key={k.name} className="flex justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{k.name}</span>
                          <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{k.count}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-extrabold uppercase text-slate-400">Propusk Origin</p>
                      {data.legalRisk.propuskOriginBreakdown.map((k) => (
                        <div key={k.name} className="flex justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{k.name}</span>
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-400">{k.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    Çalışma Kartı Bölgesi ile Fiili Şantiyesi Uyuşmayan Personeller ({data.legalRisk.mismatchRecords.length})
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2 font-bold">Sicil / Ad Soyad</th>
                        <th className="px-3 py-2 font-bold">Fiili Şantiye</th>
                        <th className="px-3 py-2 font-bold">Kart Türü</th>
                        <th className="px-3 py-2 font-bold text-rose-600">Çalışma Kartı Bölgesi</th>
                        <th className="px-4 py-2 font-bold">Fiili Görev</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.legalRisk.mismatchRecords.map((m) => (
                        <tr key={m.sicilNo} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-2 font-bold">
                            <button
                              type="button"
                              onClick={() => onNavigateToPersonnel?.({ type: 'search', value: m.sicilNo })}
                              className="hover:text-emerald-600 cursor-pointer text-left"
                            >
                              {m.adSoyad} <span className="text-[10px] font-mono text-slate-400">#{m.sicilNo}</span>
                            </button>
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">{m.site}</td>
                          <td className="px-3 py-2">{m.permitType}</td>
                          <td className="px-3 py-2 font-bold text-rose-600 dark:text-rose-400">{m.permitRegion}</td>
                          <td className="px-4 py-2 text-slate-500">{m.actualJob}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 4: MOBILITY & BORDERS ==================== */}
          {activeTab === 'mobility' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      En Çok Kullanılan Sınır Kapıları / Havalimanları (Top 12)
                    </h3>
                  </div>
                  <div className="p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.mobility.topBorders} layout="vertical" margin={{ top: 6, right: 16, left: 10, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Giriş Sayısı" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Aylık Migrasyon Ülkeye Giriş Trendi (Son 18 Ay)
                    </h3>
                  </div>
                  <div className="p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.mobility.monthlyEntries} margin={{ top: 10, right: 16, left: -12, bottom: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" name="Giriş" stroke="#10b981" fill="#10b981" fillOpacity={0.22} strokeWidth={2.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Mevcut Bulunduğu Yer Dağılımı (İzinde: {data.mobility.onLeaveCount})
                    </h3>
                  </div>
                  <div className="p-4 space-y-2">
                    {data.mobility.currentLocationBreakdown.map((loc) => (
                      <div key={loc.name} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{loc.name}</span>
                        <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                          {loc.count.toLocaleString('tr-TR')} kişi
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Şantiyeler Arası Transfer Akışları ({data.mobility.transferCount} Transfer Kaydı)
                    </h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                    {data.mobility.transferFlows.map((fl) => (
                      <div
                        key={`${fl.fromSite}-${fl.toSite}`}
                        className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800"
                      >
                        <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <span>{fl.fromSite}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 dark:text-emerald-400">{fl.toSite}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200 font-extrabold">
                          {fl.count} kişi
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 5: SHIFT & SPAN OF CONTROL ==================== */}
          {activeTab === 'shift' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Gündüz Vardiyası</p>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-300 mt-0.5">
                    {data.shiftSpan.dayCount.toLocaleString('tr-TR')}{' '}
                    <span className="text-xs">(%{data.shiftSpan.dayPct})</span>
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Gece Vardiyası</p>
                  <p className="text-xl font-black text-indigo-600 dark:text-indigo-300 mt-0.5">
                    {data.shiftSpan.nightCount.toLocaleString('tr-TR')}{' '}
                    <span className="text-xs">(%{data.shiftSpan.nightPct})</span>
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Direkt / Endirekt</p>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {data.shiftSpan.directCount.toLocaleString('tr-TR')} /{' '}
                    {data.shiftSpan.indirectCount.toLocaleString('tr-TR')}
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-300/70 dark:border-emerald-800">
                  <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                    Span of Control Oranı
                  </p>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    1 : {data.shiftSpan.spanOfControlRatio}
                  </p>
                  <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400">
                    1 Endirekt başına Direkt işçi
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Şantiye Bazlı Gündüz vs Gece Vardiya Dengesi
                    </h3>
                  </div>
                  <div className="p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.shiftSpan.bySite.slice(0, 10)} margin={{ top: 8, right: 12, left: -12, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis dataKey="site" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={54} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="day" name="Gündüz" stackId="s" fill="#f59e0b" />
                        <Bar dataKey="night" name="Gece" stackId="s" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-600" />
                      En Büyük Saha Ekipleri (Grup Şefi / Sorumlu Kişi)
                    </h3>
                  </div>
                  <div className="p-3 space-y-1.5 max-h-72 overflow-y-auto">
                    {data.shiftSpan.topGroupLeaders.map((gl, idx) => (
                      <div
                        key={`${gl.leader}-${gl.site}`}
                        className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-extrabold text-slate-900 dark:text-white">
                            {idx + 1}. {gl.leader}
                          </span>
                          <p className="text-[10px] text-slate-500 truncate">{gl.site}</p>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-extrabold">
                          {gl.teamSize} kişi
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 6: DATA QUALITY HEATMAP ==================== */}
          {activeTab === 'quality' && (
            <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    eBA 198 Kolon Veri Kalitesi &amp; Şantiye Bazlı Doluluk Isı Haritası (Genel Skor: %{data.dataQuality.overallScore})
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Yeşil (≥%85) • Turkuaz (%60–84) • Sarı (%35–59) • Kırmızı (&lt;%35 eksik veri önceliği)
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Şantiye (Aktif)</th>
                      <th className="px-2.5 py-2.5 font-bold text-center">Genel</th>
                      {data.dataQuality.fields.map((f) => (
                        <th key={f.key} className="px-2 py-2.5 font-bold text-center">
                          {lang === 'ru' ? f.labelRu : f.labelTr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.dataQuality.bySite.map((row) => (
                      <tr key={row.site} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-2 font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                          {row.site}{' '}
                          <span className="text-[10px] font-semibold text-slate-400">({row.total})</span>
                        </td>
                        <td className="px-2 py-2 text-center font-black text-slate-900 dark:text-white">
                          %{row.overallPct}
                        </td>
                        {data.dataQuality.fields.map((f) => {
                          const val = row.scores[f.key] ?? 0;
                          return (
                            <td key={f.key} className="px-1.5 py-1.5 text-center">
                              <span
                                className={`inline-block min-w-[46px] px-1.5 py-0.5 rounded-md border text-[10.5px] font-extrabold ${heatColor(val)}`}
                              >
                                %{val}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== TAB 7: ZAHID BEY NDFL TAX ADVANTAGE ==================== */}
          {activeTab === 'ndfl' && (
            <NdflTaxAdvantageTab
              data={data.ndflTaxAnalysis}
              onNavigateToPersonnel={onNavigateToPersonnel}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
