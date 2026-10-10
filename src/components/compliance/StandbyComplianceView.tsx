'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Building2,
  FileSpreadsheet,
  Download,
  RotateCcw,
  Search,
  ExternalLink,
  BedDouble,
  User,
  Phone,
  Flame,
} from 'lucide-react';
import { exportToExcel } from '@/lib/exportExcel';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface StandbyItem {
  id: number;
  siraNo: number | string;
  sicilNo: string;
  rhiId: string;
  adSoyad: string;
  gorevi: string;
  departman: string;
  region: string;
  projeAdi: string;
  uyruk: string;
  guncelDurum: string;
  iseGirisTarihi: string;
  santiyeGirisTarihi: string;
  waitingDays: number | null;
  severity: 'critical' | 'warning' | 'normal' | 'unknown';
  kampNo: string;
  odaNo: string;
  telefonNo: string;
}

interface StandbyData {
  referenceDate: string;
  kpis: {
    totalStandby: number;
    criticalCount: number; // > 21 days (> 3 weeks)
    warningCount: number;  // 15 - 21 days
    normalCount: number;   // <= 14 days
    unknownCount: number;
    averageDays: number;
    maxDays: number;
  };
  statusBreakdown: { status: string; count: number }[];
  regionBreakdown: { region: string; total: number; critical: number; warning: number; normal: number }[];
  items: StandbyItem[];
  totalFilteredItems: number;
}

interface StandbyComplianceViewProps {
  onNavigateToPersonnel?: (filterType?: string, filterValue?: string) => void;
}

export default function StandbyComplianceView({ onNavigateToPersonnel }: StandbyComplianceViewProps) {
  const { user } = useAuth();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StandbyData | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchStandby = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterSeverity !== 'all') params.set('severity', filterSeverity);
    if (filterRegion !== 'all') params.set('region', filterRegion);
    if (search.trim()) params.set('search', search.trim());

    if (user) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }

    fetch(`/api/compliance/standby?${params.toString()}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setData(resData);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStandby();
  }, [filterStatus, filterSeverity, filterRegion, search]);

  const handleExportExcel = () => {
    if (!data?.items || data.items.length === 0) return;

    const rows = data.items.map((i) => ({
      'Sicil No': i.sicilNo,
      'RHI ID': i.rhiId,
      'Adı Soyadı': i.adSoyad,
      'Görevi': i.gorevi,
      'Güncel Durumu': i.guncelDurum,
      'Bölge': i.region,
      'Şantiye / Proje': i.projeAdi,
      'Uyruk': i.uyruk,
      'İşe Giriş Tarihi': i.iseGirisTarihi,
      'Şantiye Giriş Tarihi': i.santiyeGirisTarihi,
      'Beklediği Gün (Standby)': i.waitingDays !== null ? i.waitingDays : 'Bilinmiyor',
      'Kritiklik Durumu':
        i.severity === 'critical'
          ? '> 3 Hafta (Kritik Gecikme)'
          : i.severity === 'warning'
          ? '2-3 Hafta (Dikkat)'
          : i.severity === 'normal'
          ? '< 2 Hafta (Normal)'
          : 'Tarih Belirtilmemiş',
      'Kamp No': i.kampNo,
      'Oda No': i.odaNo,
      'Telefon': i.telefonNo,
    }));

    exportToExcel(rows, `Pondera_Evrak_Bekleyenler_Standby_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const items = data?.items || [];
  const totalPages = Math.ceil(items.length / pageSize) || 1;
  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

  const renderSeverityBadge = (severity: string, days: number | null) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            {lang === 'ru' ? `> 3 недель (${days} дн.)` : `🚨 > 3 Hafta (${days} Gün)`}
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            {lang === 'ru' ? `2-3 недели (${days} дн.)` : `⏳ 2-3 Hafta (${days} Gün)`}
          </span>
        );
      case 'normal':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {lang === 'ru' ? `< 2 недель (${days} дн.)` : `✅ < 2 Hafta (${days} Gün)`}
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
            {lang === 'ru' ? 'Дата не указана' : 'Giriş Tarihi Yok'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* TOP BANNER / EXPLANATION CARD */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#111F38] dark:via-[#162646] dark:to-[#122A44] rounded-2xl border border-slate-200 dark:border-cyan-500/30 p-4 sm:p-6 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-1/4 w-96 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none hidden dark:block" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 shrink-0">
              <Hourglass className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {lang === 'ru' ? 'Ожидание документов и простой (Standby)' : 'Evrak Bekleyenler & Standby (Yatan Gün) Takibi'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-[11px] font-bold flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  {lang === 'ru' ? 'Формула: Сегодня - Дата приема' : 'Formül: Rapor Tarihi - İşe Giriş'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/40 text-[11px] font-bold">
                  {lang === 'ru' ? 'База:' : 'Veri Tarihi:'} {data?.referenceDate || '08.10.2026'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-relaxed">
                {lang === 'ru'
                  ? 'Сотрудники, принятые в компанию, но находящиеся в общежитии/на простое в ожидании патента, пропуска или рабочей карты. Задержки свыше 3 недель (>21 дн.) требуют расследования причин.'
                  : 'Şirkete girişi yapılmış ancak çalışma izni (patent), propusk veya çalışma kartı henüz çıkmadığı için sahaya çıkamayıp kampta bekleyen ("yatan") personel. 3 haftayı (>21 Gün) aşan gecikmeler yönetim müdahalesi gerektirir.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{lang === 'ru' ? 'Выгрузить список в Excel' : 'Bekleyenleri Excel İndir'}</span>
            </button>
            <button
              onClick={fetchStandby}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title={lang === 'ru' ? 'Обновить' : 'Yenile'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* KPI 1: Toplam Bekleyen */}
        <div
          onClick={() => setFilterSeverity('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterSeverity === 'all'
              ? 'bg-slate-50 dark:bg-slate-800/70 border-cyan-500 ring-2 ring-cyan-500/20'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-cyan-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
              {lang === 'ru' ? 'Всего в ожидании' : 'Toplam Bekleyen'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 flex items-center justify-center">
              <Hourglass className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400">
              {data?.kpis.totalStandby ?? 0}
            </span>
            <span className="text-xs text-slate-500">kişi</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {lang === 'ru' ? 'Патент, пропуск, карта' : 'Patent, propusk, kart bekleyenler'}
          </p>
        </div>

        {/* KPI 2: > 21 Gün (Kritik / > 3 Hafta) */}
        <div
          onClick={() => setFilterSeverity(filterSeverity === 'critical' ? 'all' : 'critical')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterSeverity === 'critical'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 ring-2 ring-rose-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
              {lang === 'ru' ? 'Критично (> 3 недель)' : '🚨 > 3 Hafta (> 21 Gün)'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 animate-bounce" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {data?.kpis.criticalCount ?? 0}
            </span>
            <span className="text-xs text-rose-500 font-bold">kişi</span>
          </div>
          <p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold mt-1">
            {lang === 'ru' ? 'Срочно выяснить причину' : 'Acil nedenini sorulacak grup'}
          </p>
        </div>

        {/* KPI 3: 15-21 Gün (2-3 Hafta) */}
        <div
          onClick={() => setFilterSeverity(filterSeverity === 'warning' ? 'all' : 'warning')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterSeverity === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
              {lang === 'ru' ? '2-3 недели (15-21 дн.)' : '⏳ 2-3 Hafta (15-21 Gün)'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
              {data?.kpis.warningCount ?? 0}
            </span>
            <span className="text-xs text-amber-600 font-bold">kişi</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {lang === 'ru' ? 'Срок подходит к критическому' : 'Süreci uzayan personeller'}
          </p>
        </div>

        {/* KPI 4: 0-14 Gün (< 2 Hafta) */}
        <div
          onClick={() => setFilterSeverity(filterSeverity === 'normal' ? 'all' : 'normal')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterSeverity === 'normal'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 ring-2 ring-emerald-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              {lang === 'ru' ? '< 2 недель (0-14 дн.)' : '✅ < 2 Hafta (0-14 Gün)'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {data?.kpis.normalCount ?? 0}
            </span>
            <span className="text-xs text-emerald-600 font-bold">kişi</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {lang === 'ru' ? 'В пределах нормы оформления' : 'Olağan başvuru süreci'}
          </p>
        </div>

        {/* KPI 5: Ortalama Bekleme Süresi */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
              {lang === 'ru' ? 'Средний срок ожидания' : 'Ort. Bekleme Süresi'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400">
              {data?.kpis.averageDays ?? 0}
            </span>
            <span className="text-xs text-indigo-600 font-bold">gün</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {lang === 'ru' ? `Макс: ${data?.kpis.maxDays || 0} дн.` : `En uzun: ${data?.kpis.maxDays || 0} gün`}
          </p>
        </div>
      </div>

      {/* TWO COLUMN BREAKDOWN CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Card: Status Breakdown */}
        <div className="lg:col-span-1 p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-600" />
                {lang === 'ru' ? 'Типы ожидания документов' : 'Beklenen Evrak Türleri'}
              </h3>
              <span className="text-xs font-bold text-slate-500">{data?.kpis.totalStandby} Kişi</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {lang === 'ru' ? 'Нажмите для фильтрации таблицы' : 'Tıklayarak tabloyu o statüye göre filtreleyin'}
            </p>

            <div className="space-y-2.5">
              {data?.statusBreakdown.map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => setFilterStatus(filterStatus === s.status ? 'all' : s.status)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    filterStatus === s.status
                      ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-400'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        s.status.includes('Patent')
                          ? 'bg-blue-500'
                          : s.status.includes('Kart')
                          ? 'bg-teal-500'
                          : s.status.includes('Propusk')
                          ? 'bg-amber-500'
                          : 'bg-purple-500'
                      }`}
                    />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{s.status}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-md text-xs font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
                      {s.count}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      %{data.kpis.totalStandby > 0 ? ((s.count / data.kpis.totalStandby) * 100).toFixed(0) : 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {filterStatus !== 'all' && (
            <button
              onClick={() => setFilterStatus('all')}
              className="mt-4 w-full py-1.5 text-center text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline border-t border-slate-100 dark:border-slate-800 pt-3"
            >
              {lang === 'ru' ? 'Сбросить фильтр статуса' : 'Statü Filtresini Temizle'}
            </button>
          )}
        </div>

        {/* Right Card: Region / Site Breakdown with Critical >21d counts */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                {lang === 'ru' ? 'Распределение по участкам и объектам' : 'Şantiye ve Bölge Bazında Bekleyenler'}
              </h3>
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                {data?.kpis.criticalCount} Kişi &gt; 3 Hafta
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {lang === 'ru'
                ? 'На каком объекте больше всего сотрудников простаивает свыше 3 недель?'
                : 'Hangi şantiyede 3 haftadan fazla evrak bekleyen ("yatan") personel yoğunluğu var?'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {data?.regionBreakdown.map((r, idx) => (
                <div
                  key={idx}
                  onClick={() => setFilterRegion(filterRegion === r.region ? 'all' : r.region)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    filterRegion === r.region
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-900 dark:text-white truncate">{r.region}</span>
                    <span className="font-extrabold text-cyan-600 dark:text-cyan-400">{r.total} Kişi</span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-bold">
                      {r.critical} &gt; 3 Hafta
                    </span>
                    <span>•</span>
                    <span className="text-amber-600 font-semibold">{r.warning} (2-3H)</span>
                    <span>•</span>
                    <span className="text-emerald-600 font-semibold">{r.normal} (&lt;2H)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {filterRegion !== 'all' && (
            <button
              onClick={() => setFilterRegion('all')}
              className="mt-4 w-full py-1.5 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline border-t border-slate-100 dark:border-slate-800 pt-3"
            >
              {lang === 'ru' ? 'Сбросить фильтр региона' : 'Bölge Filtresini Temizle'}
            </button>
          )}
        </div>
      </div>

      {/* FILTER BAR & SEARCH */}
      <div className="p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={lang === 'ru' ? 'Поиск по ФИО, табельному, объекту...' : 'Personel ara... (Ad Soyad, Sicil, Şantiye, Görev)'}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity Filter */}
            <select
              value={filterSeverity}
              onChange={(e) => {
                setFilterSeverity(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{lang === 'ru' ? 'Все сроки ожидания' : 'Tüm Bekleme Süreleri'}</option>
              <option value="critical">{lang === 'ru' ? '🚨 Критично (> 3 недель / > 21 дн.)' : '🚨 > 3 Hafta (> 21 Gün - Kritik)'}</option>
              <option value="warning">{lang === 'ru' ? '⏳ 2-3 недели (15-21 дн.)' : '⏳ 2-3 Hafta (15-21 Gün)'}</option>
              <option value="normal">{lang === 'ru' ? '✅ < 2 недель (0-14 дн.)' : '✅ < 2 Hafta (0-14 Gün)'}</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{lang === 'ru' ? 'Все статусы ожидания' : 'Tüm Bekleme Türleri'}</option>
              {data?.statusBreakdown.map((s) => (
                <option key={s.status} value={s.status}>
                  {s.status} ({s.count})
                </option>
              ))}
            </select>

            {/* Region Filter */}
            <select
              value={filterRegion}
              onChange={(e) => {
                setFilterRegion(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{lang === 'ru' ? 'Все регионы' : 'Tüm Bölgeler'}</option>
              {data?.regionBreakdown.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.total})
                </option>
              ))}
            </select>

            {(filterSeverity !== 'all' || filterStatus !== 'all' || filterRegion !== 'all' || search) && (
              <button
                onClick={() => {
                  setFilterSeverity('all');
                  setFilterStatus('all');
                  setFilterRegion('all');
                  setSearch('');
                  setPage(1);
                }}
                className="px-2.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
              >
                {lang === 'ru' ? 'Сброс' : 'Filtreleri Temizle'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* STANDBY PERSONNEL DATA GRID (TABLE) */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-600" />
              {lang === 'ru' ? 'Реестр сотрудников на простое / в ожидании' : 'Evrak Bekleyen & Standby Personel Listesi'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === 'ru' ? 'Найдено сотрудников:' : 'Listelenen toplam'}{' '}
              <span className="font-extrabold text-cyan-600 dark:text-cyan-400">
                {data?.totalFilteredItems?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
              </span>{' '}
              {lang === 'ru' ? 'чел.' : 'personel'}
            </p>
          </div>

          <div className="text-xs text-slate-500">
            {lang === 'ru' ? 'Стр.' : 'Sayfa'} <span className="font-bold text-slate-900 dark:text-white">{page}</span> / {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto relative min-h-[300px]">
          {loading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xs z-20 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {lang === 'ru' ? 'Расчет сроков простоя...' : 'Standby süreleri hesaplanıyor...'}
              </p>
            </div>
          )}

          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Табельный' : 'Sicil'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'ФИО' : 'Adı Soyadı'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Должность' : 'Görevi / Pozisyon'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Статус ожидания' : 'Bekleme Statüsü'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Регион и проект' : 'Bölge & Şantiye'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Гражданство' : 'Uyruk'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Дата приема' : 'İşe Giriş Tarihi'}</th>
                <th className="py-3 px-3.5 text-center">{lang === 'ru' ? 'Дней ожидания' : 'Beklediği Gün'}</th>
                <th className="py-3 px-3.5 text-center">{lang === 'ru' ? 'Критичность' : 'Süre Rozeti'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Камп / Комната' : 'Kamp / Oda'}</th>
                <th className="py-3 px-3.5 text-center">{lang === 'ru' ? 'Профиль' : 'Profil'}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {paginatedItems.length === 0 && !loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400">
                    {lang === 'ru' ? 'Сотрудники по заданным критериям не найдены.' : 'Filtre kriterlerine uygun bekleyen personel bulunamadı.'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-cyan-50/30 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-white font-mono">
                      {item.sicilNo}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-bold text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        {item.adSoyad}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">
                      {item.gorevi}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                        {item.guncelDurum}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="text-slate-900 dark:text-white font-medium">{item.region}</span>
                      <span className="text-slate-500 text-[10px] block">{item.projeAdi}</span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">{item.uyruk}</td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-800 dark:text-slate-200">
                      {item.iseGirisTarihi}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {item.waitingDays !== null ? (
                        <span
                          className={`font-black text-sm ${
                            item.severity === 'critical'
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.severity === 'warning'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {item.waitingDays} {lang === 'ru' ? 'дн.' : 'gün'}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {renderSeverityBadge(item.severity, item.waitingDays)}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 text-[11px]">
                      {item.kampNo !== '-' || item.odaNo !== '-' ? (
                        <span className="inline-flex items-center gap-1">
                          <BedDouble className="w-3 h-3 text-slate-400" />
                          Kamp: {item.kampNo} / Oda: {item.odaNo}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {onNavigateToPersonnel && (
                        <button
                          onClick={() => onNavigateToPersonnel('search', item.sicilNo)}
                          className="p-1 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={lang === 'ru' ? 'Открыть карточку персонала' : 'Personel Kartını Aç'}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Toplam <span className="font-bold text-slate-900 dark:text-white">{data?.totalFilteredItems}</span> personelden{' '}
              <span className="font-bold text-slate-900 dark:text-white">{(page - 1) * pageSize + 1}</span> -{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                {Math.min(page * pageSize, data?.totalFilteredItems || 0)}
              </span>{' '}
              arası gösteriliyor
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {lang === 'ru' ? 'Назад' : 'Önceki'}
              </button>
              <span className="px-2 font-bold text-slate-800 dark:text-slate-200">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {lang === 'ru' ? 'Вперед' : 'Sonraki'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
