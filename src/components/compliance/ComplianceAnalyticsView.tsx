'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  FileX,
  FileCheck2,
  Search,
  Filter,
  Download,
  RotateCcw,
  Building2,
  Globe2,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import * as XLSX from 'xlsx';
import { exportToExcel } from '@/lib/exportExcel';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface ComplianceItem {
  personnelId: number;
  sicilNo: string;
  adSoyad: string;
  gorevi: string;
  departman: string;
  region: string;
  projeAdi: string;
  uyruk: string;
  docType: string;
  docLabel: string;
  docNo: string;
  expiryDate: string;
  remainingDays: number | null;
  status: 'expired' | 'critical' | 'warning' | 'normal' | 'valid' | 'missing';
}

interface DocStat {
  id: string;
  label: string;
  totalChecked: number;
  validCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  expiredCount: number;
  missingCount: number;
}

interface ComplianceAnalyticsViewProps {
  onNavigateToPersonnel?: (filterType?: string, filterValue?: string) => void;
}

export default function ComplianceAnalyticsView({ onNavigateToPersonnel }: ComplianceAnalyticsViewProps) {
  const { user } = useAuth();
  const { lang, t, translateCol, translateVal } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    referenceDate: string;
    totalActivePersonnel: number;
    kpis: {
      totalDocsChecked: number;
      totalValid: number;
      totalWarning: number;
      totalCritical: number;
      totalExpired: number;
      totalMissing: number;
      complianceRate: number;
    };
    docStats: DocStat[];
    regionBreakdown: any[];
    uyrukBreakdown: any[];
    items: ComplianceItem[];
    totalFilteredItems: number;
  } | null>(null);

  // Filters
  const [filterDocType, setFilterDocType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchCompliance = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDocType !== 'all') params.set('docType', filterDocType);
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterRegion !== 'all') params.set('region', filterRegion);
    if (search.trim()) params.set('search', search.trim());

    if (user) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }

    fetch(`/api/compliance?${params.toString()}`)
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
    fetchCompliance();
  }, [filterDocType, filterStatus, filterRegion, search]);

  // Export to Excel
  const handleExportExcel = () => {
    if (!data?.items || data.items.length === 0) return;

    const rows = data.items.map((i) => ({
      'Sicil No': i.sicilNo,
      'Adı Soyadı': i.adSoyad,
      'Görevi': i.gorevi,
      'Departman': i.departman,
      'Bölge': i.region,
      'Proje Adı': i.projeAdi,
      'Uyruk': i.uyruk,
      'Evrak Türü': i.docLabel,
      'Evrak / Belge No': i.docNo,
      'Bitiş Tarihi': i.expiryDate,
      'Kalan Gün': i.remainingDays !== null ? i.remainingDays : 'Belirtilmedi',
      'Durum':
        i.status === 'expired'
          ? 'Süresi Dolmuş'
          : i.status === 'critical'
          ? 'Kritik (0-15 Gün)'
          : i.status === 'warning'
          ? 'Yaklaşan (16-30 Gün)'
          : i.status === 'normal'
          ? '31-60 Gün'
          : i.status === 'valid'
          ? 'Geçerli (>60 Gün)'
          : 'Eksik / Belge Yok',
    }));

    exportToExcel(rows, `Pondera_Evrak_Analitigi_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Pagination for items table
  const items = data?.items || [];
  const totalPages = Math.ceil(items.length / pageSize) || 1;
  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);

  // Status color badge helper
  const renderStatusBadge = (status: string, days: number | null) => {
    switch (status) {
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
            {lang === 'ru' ? `Просрочено (${days} дн.)` : `Süresi Doldu (${days} gün)`}
          </span>
        );
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            {lang === 'ru' ? `Срочно: ${days} дн.` : `Kritik: ${days} Gün Kaldı`}
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
            {lang === 'ru' ? `Истекает (${days} дн.)` : `Yaklaşan (${days} gün)`}
          </span>
        );
      case 'normal':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            {lang === 'ru' ? `31-60 дн. (${days} дн.)` : `31-60 Gün (${days} g)`}
          </span>
        );
      case 'valid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            {lang === 'ru' ? `Действительно (${days} дн.)` : `Geçerli (${days} gün)`}
          </span>
        );
      case 'missing':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
            {lang === 'ru' ? 'Отсутствует' : 'Eksik / Belge Yok'}
          </span>
        );
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-7 space-y-5 sm:space-y-6 max-w-full overflow-hidden">
      {/* TOP HEADER CARD */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#111F38] dark:via-[#162646] dark:to-[#122A44] rounded-2xl border border-slate-200 dark:border-emerald-500/30 p-4 sm:p-6 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative overflow-hidden">
        {/* Glow - dark mode only */}
        <div className="absolute top-0 right-1/4 w-96 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none hidden dark:block" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {t('comp_title')}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40 text-[11px] font-bold">
                  {lang === 'ru' ? 'Инспекция на объектах' : 'Saha Denetim Motoru'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 text-[11px] font-bold">
                  {lang === 'ru' ? 'Базовая дата:' : 'Baz Tarih:'} {data?.referenceDate || '08.10.2026'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
                {t('comp_sub')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>{lang === 'ru' ? 'Скачать отчет Excel' : 'Excel Raporu İndir'}</span>
            </button>
            <button
              onClick={fetchCompliance}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title={lang === 'ru' ? 'Обновить' : 'Yenile'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* KPI 1: Uyum Oranı */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{t('comp_compliance_rate')}</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              %{data?.kpis.complianceRate ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">
            {data?.kpis.totalValid?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} / {data?.kpis.totalDocsChecked?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'документов' : 'evrak'}
          </p>
        </div>

        {/* KPI 2: Süresi Dolmuş */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'expired' ? 'all' : 'expired')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterStatus === 'expired'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{t('comp_expired')}</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {data?.kpis.totalExpired?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'Критично обновить' : 'Kritik yenilenmeli'}</p>
        </div>

        {/* KPI 3: 0-15 Gün Kaldı */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'critical' ? 'all' : 'critical')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterStatus === 'critical'
              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{t('comp_critical_urgent')}</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
              {data?.kpis.totalCritical?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'В обработке' : 'İşlemde olmalı'}</p>
        </div>

        {/* KPI 4: 16-30 Gün Kaldı */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'warning' ? 'all' : 'warning')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterStatus === 'warning'
              ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-500 ring-2 ring-orange-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-orange-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-orange-700 dark:text-orange-400">{t('comp_warning')}</span>
            <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/80 text-orange-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-orange-700 dark:text-orange-400">
              {data?.kpis.totalWarning?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'Истекающие сроки' : 'Yaklaşan belgeler'}</p>
        </div>

        {/* KPI 5: Eksik Evrak */}
        <div
          onClick={() => setFilterStatus(filterStatus === 'missing' ? 'all' : 'missing')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden ${
            filterStatus === 'missing'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400">{t('comp_missing')}</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center">
              <FileX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-700 dark:text-rose-400">
              {data?.kpis.totalMissing?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'Отсутствует' : 'Kayıtsız / Yok'}</p>
        </div>

        {/* KPI 6: Aktif Çalışan */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400">{t('comp_active_workforce')}</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/80 text-teal-600 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-teal-700 dark:text-teal-400">
              {data?.totalActivePersonnel?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{lang === 'ru' ? 'Сотрудников проверено' : 'Taranan personel'}</p>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CHART 1: Evrak Türü Dağılımı (Stacked Bar Chart) */}
        <div className="lg:col-span-2 p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Evrak Türlerine Göre Geçerlilik Dağılımı
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Her bir evrak tipi için Süresi Dolan, Kritik, Yaklaşan, Normal ve Geçerli adetleri
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] flex-wrap">
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> Doldu
              </span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> 0-15g
              </span>
              <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-400" /> 16-30g
              </span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Geçerli
              </span>
              <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-purple-400" /> Eksik
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data?.docStats || []}
                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis
                  dataKey="label"
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
                      return (
                        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl text-xs text-slate-800 dark:text-slate-100 min-w-[220px] animate-in fade-in duration-100 select-none">
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="font-bold text-slate-900 dark:text-white text-xs">{label}</span>
                            <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-200/50 dark:border-teal-800/50">
                              Toplam: {total.toLocaleString('tr-TR')}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {payload.map((entry: any, i: number) => {
                              const val = Number(entry.value) || 0;
                              return (
                                <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-xs shrink-0 shadow-xs"
                                      style={{ backgroundColor: entry.color || entry.fill }}
                                    />
                                    <span className="text-slate-600 dark:text-slate-300 truncate font-medium">
                                      {entry.name}:
                                    </span>
                                  </div>
                                  <span className="font-bold font-mono text-slate-900 dark:text-white shrink-0">
                                    {val.toLocaleString('tr-TR')}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="expiredCount" name="Süresi Doldu" stackId="a" fill="#F43F5E" />
                <Bar dataKey="criticalCount" name="0-15 Gün (Kritik)" stackId="a" fill="#F59E0B" />
                <Bar dataKey="warningCount" name="16-30 Gün (Yaklaşan)" stackId="a" fill="#FB923C" />
                <Bar dataKey="normalCount" name="31-60 Gün" stackId="a" fill="#38BDF8" />
                <Bar dataKey="validCount" name="Geçerli (>60g)" stackId="a" fill="#10B981" />
                <Bar dataKey="missingCount" name="Eksik" stackId="a" fill="#A855F7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: Bölge / Şantiye Risk Dağılımı */}
        <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Bölge Risk Sıralaması
              </h3>
              <span className="text-[10px] text-slate-600 dark:text-slate-400">Kritik Evrak Adedi</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3">
              Hangi şantiyede süresi yaklaşan veya dolan evrak yoğunluğu daha fazla?
            </p>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {data?.regionBreakdown.map((r, idx) => {
                const totalRisk = r.expired + r.critical;
                return (
                  <div
                    key={idx}
                    onClick={() => setFilterRegion(filterRegion === r.region ? 'all' : r.region)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      filterRegion === r.region
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-400'
                        : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate">{r.region}</span>
                      <span className="font-black text-rose-600 dark:text-rose-400">{totalRisk} Riskli</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400">
                      <span className="text-rose-500 font-semibold">{r.expired} Doldu</span>
                      <span>•</span>
                      <span className="text-amber-500 font-semibold">{r.critical} 0-15g</span>
                      <span>•</span>
                      <span className="text-slate-600 dark:text-slate-400">{r.missing} Eksik</span>
                      <span className="ml-auto font-bold text-slate-700 dark:text-slate-300">
                        Toplam {r.total} Kişi
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
            <span>Bölgeye tıklayarak tabloyu filtreleyin</span>
            {filterRegion !== 'all' && (
              <button
                onClick={() => setFilterRegion('all')}
                className="text-rose-600 dark:text-rose-400 font-bold hover:underline"
              >
                Filtreyi Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Personel ara... (Ad, Sicil, Evrak No, Şantiye)"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Document Type Dropdown */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{lang === 'ru' ? 'Все типы документов' : 'Tüm Evrak Tipleri'}</option>
              <option value="pasaport">{lang === 'ru' ? 'Паспорт' : 'Pasaport'}</option>
              <option value="vize">{lang === 'ru' ? 'Виза' : 'Vize'}</option>
              <option value="propusk">{lang === 'ru' ? 'Пропуск на объект' : 'Propusk (Saha Kartı)'}</option>
              <option value="patent">{lang === 'ru' ? 'Патент и разрешение на работу' : 'Patent & Çalışma İzni'}</option>
              <option value="registrasyon">{lang === 'ru' ? 'Регистрация / Миграционная карта' : 'Registrasyon / Migrasyon'}</option>
              <option value="daktilo">{lang === 'ru' ? 'Дактилоскопия (Отпечатки)' : 'Daktiloskopiya (Parmak İzi)'}</option>
              <option value="dms">{lang === 'ru' ? 'Медицина / Полис ДМС' : 'Sağlık / DMS Sigorta'}</option>
              <option value="dil">{lang === 'ru' ? 'Сертификат о знании языка' : 'Dil Sertifikası'}</option>
            </select>

            {/* Status Dropdown */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{lang === 'ru' ? 'Все статусы сроков' : 'Tüm Süre Durumları'}</option>
              <option value="expired">{lang === 'ru' ? '🚨 Просрочено' : '🚨 Süresi Dolmuş'}</option>
              <option value="critical">{lang === 'ru' ? '⚠️ Критично (0-15 дней)' : '⚠️ Kritik (0-15 Gün)'}</option>
              <option value="warning">{lang === 'ru' ? '⏳ Истекает (16-30 дней)' : '⏳ Yaklaşan (16-30 Gün)'}</option>
              <option value="normal">{lang === 'ru' ? '📅 31-60 дней' : '📅 31-60 Gün'}</option>
              <option value="valid">{lang === 'ru' ? '✅ Действительно (>60 дней)' : '✅ Geçerli (>60 Gün)'}</option>
              <option value="missing">{lang === 'ru' ? '❌ Отсутствует документ' : '❌ Eksik / Belge Yok'}</option>
            </select>

            {/* Region Dropdown */}
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{t('filter_all_regions')}</option>
              {data?.regionBreakdown.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.total})
                </option>
              ))}
            </select>

            {(filterDocType !== 'all' || filterStatus !== 'all' || filterRegion !== 'all' || search) && (
              <button
                onClick={() => {
                  setFilterDocType('all');
                  setFilterStatus('all');
                  setFilterRegion('all');
                  setSearch('');
                }}
                className="px-2.5 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
              >
                {t('filter_clear_all')}
              </button>
            )}
          </div>
        </div>

        {/* Filter Quick Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 shrink-0">{lang === 'ru' ? 'Быстрый фильтр:' : 'Hızlı Filtre:'}</span>
          {[
            { id: 'all', label: lang === 'ru' ? 'Все' : 'Tümü' },
            { id: 'expired', label: lang === 'ru' ? '🚨 Просроченные' : '🚨 Süresi Dolanlar' },
            { id: 'critical', label: lang === 'ru' ? '⚠️ 0-15 дней (Срочно)' : '⚠️ 0-15 Gün (Acil)' },
            { id: 'warning', label: lang === 'ru' ? '⏳ 16-30 дней' : '⏳ 16-30 Gün' },
            { id: 'missing', label: lang === 'ru' ? '❌ Без документов' : '❌ Eksik Evraklar' },
            { id: 'valid', label: lang === 'ru' ? '✅ Действующие' : '✅ Geçerliler' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterStatus(pill.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                filterStatus === pill.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* COMPLIANCE DETAIL DATA GRID (TABLE) */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'ru' ? 'Реестр контроля документов' : 'Evrak Denetim Listesi'}
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {lang === 'ru' ? 'Найдено записей:' : 'Kriterlere uyan toplam'}{' '}
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                {data?.totalFilteredItems?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR') ?? 0}
              </span>{' '}
              {lang === 'ru' ? 'документов' : 'evrak kaydı'}
            </p>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {lang === 'ru' ? 'Стр.' : 'Sayfa'} <span className="font-bold text-slate-900 dark:text-white">{page}</span> / {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto relative min-h-[300px]">
          {loading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xs z-20 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{lang === 'ru' ? 'Проверка документов...' : 'Evraklar inceleniyor...'}</p>
            </div>
          )}

          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50/90 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Табельный' : 'Sicil'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'ФИО' : 'Adı Soyadı'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Должность' : 'Görevi / Pozisyon'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Регион и проект' : 'Bölge & Proje'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Гражданство' : 'Uyruk'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Тип документа' : 'Evrak Türü'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? '№ документа' : 'Belge No'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Срок действия' : 'Bitiş Tarihi'}</th>
                <th className="py-3 px-3.5">{lang === 'ru' ? 'Осталось дней' : 'Kalan Gün'}</th>
                <th className="py-3 px-3.5 text-center">{lang === 'ru' ? 'Статус' : 'Durum Rozeti'}</th>
                <th className="py-3 px-3.5 text-center">{t('table_action_col')}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {paginatedItems.length === 0 && !loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400">
                    {lang === 'ru' ? 'Документы по заданным критериям не найдены.' : 'Filtre kriterlerine uygun evrak kaydı bulunamadı.'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-white">
                      {item.sicilNo}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {item.adSoyad}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">
                      {item.gorevi}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="text-slate-900 dark:text-white font-medium">{item.region}</span>
                      <span className="text-slate-500 dark:text-slate-400 text-[10px] block">{item.projeAdi}</span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 dark:text-slate-300">{item.uyruk}</td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-semibold text-slate-900 dark:text-white">{item.docLabel}</span>
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                      {item.docNo}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-900 dark:text-white">
                      {item.expiryDate}
                    </td>
                    <td className="py-2.5 px-3.5 font-bold">
                      {item.remainingDays !== null ? (
                        <span
                          className={
                            item.remainingDays < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.remainingDays <= 15
                              ? 'text-amber-600 dark:text-amber-400'
                              : item.remainingDays <= 30
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {item.remainingDays} {lang === 'ru' ? 'дн.' : 'gün'}
                        </span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {renderStatusBadge(item.status, item.remainingDays)}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {onNavigateToPersonnel && (
                        <button
                          onClick={() => onNavigateToPersonnel('search', item.sicilNo)}
                          className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title={lang === 'ru' ? 'Перейти к карточке сотрудника' : 'Personel Kartına Git'}
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

        {/* PAGINATION FOOTER */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-600 dark:text-slate-400">
            {lang === 'ru'
              ? `Показано ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, items.length)} из ${items.length}`
              : `Toplam ${items.length} kayıt arasından ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, items.length)} gösteriliyor`}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t('table_prev')}
            </button>
            <span className="px-2 font-bold text-slate-800 dark:text-white">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t('table_next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
