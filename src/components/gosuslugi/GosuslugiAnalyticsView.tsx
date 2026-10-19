'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Zap,
  RefreshCw,
  Search,
  Filter,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Send,
  Clock,
  MapPin,
  Globe,
  ShieldCheck,
  BarChart3,
  Download,
  XCircle,
  ExternalLink,
  Layers,
  Users,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ErrorCategoryItem {
  id: string;
  titleTr: string;
  titleRu: string;
  stepLabel: string;
  hintTr: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  percentage: number;
  items: EnrichedSubmission[];
}

interface RegionBreakdownItem {
  region: string;
  targetVks: number;
  sentCount: number;
  pdfCount: number;
  errorCount: number;
  processedCount: number;
  pendingCount: number;
  completionPct: number;
}

interface CitizenshipBreakdownItem {
  citizenship: string;
  sent: number;
  errors: number;
  pdf: number;
  total: number;
}

interface HourlyTimelineItem {
  hourSlot: string;
  sent: number;
  errors: number;
  total: number;
}

interface EnrichedSubmission {
  id: number;
  sicil_no: string;
  worker_name: string;
  ad_soyad_tr: string;
  citizenship: string;
  region: string;
  proje_adi: string;
  departman: string;
  gorevi: string;
  pasaport_no: string;
  rnr_no: string;
  period_code: string;
  application_no: string;
  gosuslugi_status: string;
  status_detail: string;
  pdf_filename: string;
  submitted_at: string;
  checked_at: string;
  state: 'sent' | 'error' | 'other';
  hasPdf: boolean;
  isRegisteredMvd: boolean;
  errorCategoryId: string | null;
  errorCategoryTitle: string | null;
  errorStepLabel: string | null;
}

interface AnalyticsResponse {
  success: boolean;
  moscowTime: string;
  summary: {
    totalTargetVksPersonnel: number;
    totalRecords: number;
    totalSent: number;
    totalPdf: number;
    totalNoPdf: number;
    totalRegisteredMvd: number;
    totalErrors: number;
    remainingTarget: number;
    overallCompletionPct: number;
    successRatePct: number;
    last15mSent: number;
    last15mErrors: number;
    last60mSent: number;
    last60mErrors: number;
  };
  errorCategories: ErrorCategoryItem[];
  regionBreakdown: RegionBreakdownItem[];
  citizenshipBreakdown: CitizenshipBreakdownItem[];
  hourlyTimeline: HourlyTimelineItem[];
  submissions: EnrichedSubmission[];
}

export default function GosuslugiAnalyticsView() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null);

  // Filters for Zayavka / Submission table
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'sent' | 'error' | 'no_pdf' | 'has_pdf' | 'registered_mvd'
  >('all');
  const [selectedErrorCat, setSelectedErrorCat] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedCitizenship, setSelectedCitizenship] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedErrorCatId, setExpandedErrorCatId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(100);

  const fetchAnalytics = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await fetch('/api/gosuslugi/analytics', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success) {
        setData(json);
      }
    } catch {
      // Ignore network hiccup during background refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(false);
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchAnalytics(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchAnalytics]);

  const handleCopyText = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleTriggerTelegramNow = async () => {
    setSendingTelegram(true);
    setTelegramFeedback(null);
    try {
      const res = await fetch('/api/telegram/cron?test=vks', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success) {
        setTelegramFeedback('Telegram raporu kuyruğa eklendi / gönderildi.');
      } else {
        setTelegramFeedback('Rapor tetiklenemedi.');
      }
    } catch {
      setTelegramFeedback('Bağlantı hatası oluştu.');
    } finally {
      setSendingTelegram(false);
      setTimeout(() => setTelegramFeedback(null), 4000);
    }
  };

  const filteredSubmissions = useMemo(() => {
    if (!data?.submissions) return [];
    const q = searchQuery.trim().toLowerCase();

    return data.submissions.filter((item) => {
      if (statusFilter === 'sent' && item.state !== 'sent') return false;
      if (statusFilter === 'error' && item.state !== 'error') return false;
      if (statusFilter === 'no_pdf' && (item.state !== 'sent' || item.hasPdf)) return false;
      if (statusFilter === 'has_pdf' && !item.hasPdf) return false;
      if (statusFilter === 'registered_mvd' && !item.isRegisteredMvd) return false;

      if (selectedErrorCat !== 'all' && item.errorCategoryId !== selectedErrorCat) {
        return false;
      }
      if (selectedRegion !== 'all' && item.region !== selectedRegion) {
        return false;
      }
      if (selectedCitizenship !== 'all' && item.citizenship !== selectedCitizenship) {
        return false;
      }

      if (q) {
        const hay = [
          item.application_no,
          item.sicil_no,
          item.worker_name,
          item.ad_soyad_tr,
          item.region,
          item.proje_adi,
          item.citizenship,
          item.pasaport_no,
          item.rnr_no,
          item.gosuslugi_status,
          item.status_detail,
          item.errorCategoryTitle,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    data?.submissions,
    statusFilter,
    selectedErrorCat,
    selectedRegion,
    selectedCitizenship,
    searchQuery,
  ]);

  const handleExportExcel = () => {
    if (!filteredSubmissions.length) return;
    const rows = filteredSubmissions.map((item, idx) => ({
      'Sıra': idx + 1,
      'Sicil No': item.sicil_no,
      'Заявка № (Başvuru No)': item.application_no || '-',
      'Ad Soyad (Rusça)': item.worker_name,
      'Ad Soyad (Türkçe)': item.ad_soyad_tr,
      'Uyruk': item.citizenship,
      'Bölge / Şantiye': item.region,
      'Proje': item.proje_adi,
      'Pasaport No': item.pasaport_no,
      'VKS RNR No': item.rnr_no,
      'Dönem': item.period_code,
      'Durum Grubu': item.state === 'error' ? 'Hatalı (Ошибка)' : 'Başarılı Gönderim',
      'Hata Kategorisi': item.errorCategoryTitle || '-',
      'Gosuslugi Durumu / Hata Detayı': item.gosuslugi_status,
      'Ek Detay': item.status_detail || '-',
      'PDF Dosyası': item.pdf_filename || 'İndirilmedi (Hızlı Gönderim)',
      'Gönderim Zamanı (MSK)': item.submitted_at,
      'Son Kontrol Zamanı': item.checked_at || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gosuslugi_VKS_Rapor');
    XLSX.writeFile(
      wb,
      `Gosuslugi_VKS_Analitik_Rapor_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  if (loading && !data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Gosuslugi VKS Analitik Raporu yükleniyor...
        </p>
      </div>
    );
  }

  const s = data?.summary || {
    totalTargetVksPersonnel: 0,
    totalRecords: 0,
    totalSent: 0,
    totalPdf: 0,
    totalNoPdf: 0,
    totalRegisteredMvd: 0,
    totalErrors: 0,
    remainingTarget: 0,
    overallCompletionPct: 0,
    successRatePct: 0,
    last15mSent: 0,
    last15mErrors: 0,
    last60mSent: 0,
    last60mErrors: 0,
  };

  const estimatedHoursLeft =
    s.last60mSent > 0 && s.remainingTarget > 0
      ? (s.remainingTarget / s.last60mSent).toFixed(1)
      : null;

  return (
    <div className="p-3 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Top Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                Canlı VKS Bildirim İstatistikleri
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Moskova Saati: <strong className="text-slate-700 dark:text-slate-200">{data?.moscowTime || '-'}</strong>
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Gosuslugi VKS Bildirim & Hata Analitik Merkezi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tüm bilgisayarlardan ortak sunucuya iletilen canlı bildirimler, hata çeşitleri ve Заявка № kırılımı
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                }`}
              />
              {autoRefresh ? 'Oto-Yenileme (15 sn)' : 'Oto-Yenileme Kapalı'}
            </button>

            <button
              onClick={() => fetchAnalytics(false)}
              disabled={refreshing}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </button>

            <button
              onClick={handleTriggerTelegramNow}
              disabled={sendingTelegram}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingTelegram ? 'Gönderiliyor...' : "Telegram'a Rapor Gönder"}
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Excel İndir ({filteredSubmissions.length})
            </button>
          </div>
        </div>

        {telegramFeedback && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-xs text-sky-700 dark:text-sky-300 font-medium">
            {telegramFeedback}
          </div>
        )}

        {/* Overall Progress Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Genel VKS Bildirim İlerlemesi ({s.totalSent.toLocaleString('tr-TR')} /{' '}
              {s.totalTargetVksPersonnel.toLocaleString('tr-TR')} Aktif VKS Personeli)
            </span>
            <div className="flex items-center gap-3">
              {estimatedHoursLeft && (
                <span className="text-slate-500 dark:text-slate-400">
                  Tahmini Kalan Süre: <strong>~{estimatedHoursLeft} saat</strong> ({s.last60mSent}/saat hızla)
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
                %{s.overallCompletionPct} Tamamlandı
              </span>
            </div>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
              style={{ width: `${Math.min(100, s.overallCompletionPct)}%` }}
              title={`Başarılı: ${s.totalSent}`}
            />
            {s.totalErrors > 0 && s.totalTargetVksPersonnel > 0 && (
              <div
                className="h-full bg-rose-500 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100 - s.overallCompletionPct,
                    Math.max(1, Math.round((s.totalErrors / s.totalTargetVksPersonnel) * 100))
                  )}%`,
                }}
                title={`Hatalı: ${s.totalErrors}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* 6 KPI Cards (Mobile 2-col, Desktop 6-col) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Card 1: Total Processed */}
        <button
          onClick={() => {
            setStatusFilter('all');
            setSelectedErrorCat('all');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'all' && selectedErrorCat === 'all'
              ? 'bg-slate-900 text-white dark:bg-slate-800 border-slate-900 dark:border-emerald-500/60 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">Toplam İşlenen</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold mt-1">
            {s.totalRecords.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] mt-1 opacity-75">
            Kalan Hedef: <strong>{s.remainingTarget.toLocaleString('tr-TR')}</strong>
          </div>
        </button>

        {/* Card 2: Total Sent */}
        <button
          onClick={() => {
            setStatusFilter('sent');
            setSelectedErrorCat('all');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'sent'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">Başarılı Gönderim</span>
            <CheckCircle2
              className={`w-4 h-4 ${statusFilter === 'sent' ? 'text-white' : 'text-emerald-500'}`}
            />
          </div>
          <div className="text-2xl font-extrabold mt-1">
            {s.totalSent.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] mt-1 opacity-80">
            Başarı Oranı: <strong>%{s.successRatePct}</strong>
          </div>
        </button>

        {/* Card 3: Fast Mode (No PDF yet) */}
        <button
          onClick={() => {
            setStatusFilter('no_pdf');
            setSelectedErrorCat('all');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'no_pdf'
              ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">Hızlı Gönderim (PDF Bekleyen)</span>
            <Zap
              className={`w-4 h-4 ${statusFilter === 'no_pdf' ? 'text-white' : 'text-amber-500'}`}
            />
          </div>
          <div className="text-2xl font-extrabold mt-1">
            {s.totalNoPdf.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] mt-1 opacity-80">
            PDF İndirilen: <strong>{s.totalPdf}</strong>
          </div>
        </button>

        {/* Card 4: PDF Downloaded / MVD Registered */}
        <button
          onClick={() => {
            setStatusFilter('has_pdf');
            setSelectedErrorCat('all');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'has_pdf'
              ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-teal-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">PDF İndirilen / МВД</span>
            <FileText
              className={`w-4 h-4 ${statusFilter === 'has_pdf' ? 'text-white' : 'text-teal-500'}`}
            />
          </div>
          <div className="text-2xl font-extrabold mt-1">
            {s.totalPdf.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] mt-1 opacity-80">
            МВД Kayıtlı: <strong>{s.totalRegisteredMvd}</strong>
          </div>
        </button>

        {/* Card 5: Total Errors */}
        <button
          onClick={() => {
            setStatusFilter('error');
          }}
          className={`text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'error'
              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-900/60 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium opacity-80">Hatalı Kayıt (Ошибка)</span>
            <AlertTriangle
              className={`w-4 h-4 ${statusFilter === 'error' ? 'text-white' : 'text-rose-500'}`}
            />
          </div>
          <div
            className={`text-2xl font-extrabold mt-1 ${
              statusFilter === 'error' ? 'text-white' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {s.totalErrors.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] mt-1 opacity-80">
            {data?.errorCategories.length || 0} farklı hata türü
          </div>
        </button>

        {/* Card 6: Last 15m & 60m Speed */}
        <div className="p-3.5 rounded-2xl border bg-gradient-to-br from-indigo-50/90 to-sky-50/90 dark:from-indigo-950/40 dark:to-sky-950/40 border-indigo-200/70 dark:border-indigo-800/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">
              Son 15 Dk / 1 Saat
            </span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
              +{s.last15mSent}
            </span>
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              +{s.last15mErrors} hata
            </span>
            <span className="text-[10px] text-slate-500">(15dk)</span>
          </div>
          <div className="text-[11px] mt-1 text-slate-600 dark:text-slate-300">
            Son 1 Saat: <strong>+{s.last60mSent} gönderim</strong> / {s.last60mErrors} hata
          </div>
        </div>
      </div>

      {/* SECTION 1: Error Breakdown by Type (Hata Çeşitlerine Göre Detaylı Kırılım) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Hata Çeşitlerine Göre Kırılım ({s.totalErrors} Hatalı Kayıt)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bir hata türüne tıklayarak o hatayı alan personelleri ve detaylarını görebilir veya aşağıdaki listeyi filtreleyebilirsiniz
            </p>
          </div>
          {selectedErrorCat !== 'all' && (
            <button
              onClick={() => {
                setSelectedErrorCat('all');
                setStatusFilter('all');
              }}
              className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              Hata Filtresini Temizle
            </button>
          )}
        </div>

        {!data?.errorCategories || data.errorCategories.length === 0 ? (
          <div className="p-6 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Şu anda kayıtlı hiçbir hata (Ошибка) bulunmuyor!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.errorCategories.map((cat) => {
              const isExpanded = expandedErrorCatId === cat.id;
              const isSelected = selectedErrorCat === cat.id;
              const badgeColors =
                cat.severity === 'high'
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  : cat.severity === 'medium'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800';

              return (
                <div
                  key={cat.id}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    isSelected
                      ? 'border-rose-500 dark:border-rose-500 bg-rose-50/30 dark:bg-rose-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColors}`}
                        >
                          {cat.stepLabel}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {cat.titleTr}
                        </h3>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                          ({cat.titleRu})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{cat.hintTr}</p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <div className="text-right mr-2">
                        <div className="text-lg font-extrabold text-rose-600 dark:text-rose-400 leading-none">
                          {cat.count} kayıt
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Hataların %{cat.percentage}&apos;i
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (isSelected) {
                            setSelectedErrorCat('all');
                            setStatusFilter('all');
                          } else {
                            setSelectedErrorCat(cat.id);
                            setStatusFilter('error');
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-400'
                        }`}
                      >
                        {isSelected ? 'Filtrelendi ✓' : 'Tabloda Filtrele'}
                      </button>

                      <button
                        onClick={() => setExpandedErrorCatId(isExpanded ? null : cat.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200/70 dark:bg-slate-700/70 text-slate-800 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            Gizle <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            Kişileri Gör ({cat.count}) <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3 space-y-2 max-h-80 overflow-y-auto">
                      {cat.items.map((emp) => (
                        <div
                          key={`${emp.sicil_no}-${emp.id}`}
                          className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                Sicil: {emp.sicil_no}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">
                                {emp.worker_name}
                              </span>
                              {emp.ad_soyad_tr && (
                                <span className="text-slate-500">({emp.ad_soyad_tr})</span>
                              )}
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                                {emp.region}
                              </span>
                              <span className="text-slate-500">{emp.citizenship}</span>
                            </div>
                            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono break-all">
                              {emp.gosuslugi_status}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500">
                            {emp.pasaport_no && <span>Pasaport: {emp.pasaport_no}</span>}
                            {emp.rnr_no && <span>RNR: {emp.rnr_no}</span>}
                            <span>{emp.submitted_at}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Region (Şantiye) Breakdown & Hourly Speed Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Region Breakdown (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" />
                Bölge / Şantiye Bazlı VKS Bildirim Durumu
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Şantiyeye tıklayarak aşağıdaki başvuru listesini o bölgeye göre filtreleyebilirsiniz
              </p>
            </div>
            {selectedRegion !== 'all' && (
              <button
                onClick={() => setSelectedRegion('all')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Tüm Bölgeler
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-2 font-semibold">Bölge / Şantiye</th>
                  <th className="py-2 px-2 text-right font-semibold">Hedef VKS</th>
                  <th className="py-2 px-2 text-right font-semibold text-emerald-600">Gönderilen</th>
                  <th className="py-2 px-2 text-right font-semibold text-rose-600">Hatalı</th>
                  <th className="py-2 px-2 text-right font-semibold">Kalan</th>
                  <th className="py-2 pl-2 text-right font-semibold">İlerleme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {data?.regionBreakdown.map((reg) => {
                  const isSel = selectedRegion === reg.region;
                  return (
                    <tr
                      key={reg.region}
                      onClick={() => setSelectedRegion(isSel ? 'all' : reg.region)}
                      className={`cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 font-semibold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-2.5 pr-2 font-medium text-slate-900 dark:text-white">
                        {reg.region}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono">{reg.targetVks}</td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {reg.sentCount}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {reg.errorCount}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-500">
                        {reg.pendingCount}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${reg.completionPct}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-[11px] w-9 text-right">
                            %{reg.completionPct}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hourly Timeline & Citizenship Breakdown (1 col) */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              Saatlik Gönderim Hızı (Moskova Saati)
            </h2>
            {!data?.hourlyTimeline || data.hourlyTimeline.length === 0 ? (
              <p className="text-xs text-slate-500">Henüz saatlik veri yok.</p>
            ) : (
              <div className="space-y-2">
                {data.hourlyTimeline.map((h) => {
                  const maxVal = Math.max(...data.hourlyTimeline.map((x) => x.total), 1);
                  const sentPct = Math.round((h.sent / maxVal) * 100);
                  const errPct = Math.round((h.errors / maxVal) * 100);
                  return (
                    <div key={h.hourSlot} className="text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {h.hourSlot}
                        </span>
                        <span className="font-mono text-[11px]">
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            +{h.sent} başarılı
                          </strong>
                          {h.errors > 0 && (
                            <span className="text-rose-500 ml-1.5">+{h.errors} hata</span>
                          )}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${sentPct}%` }}
                        />
                        {h.errors > 0 && (
                          <div
                            className="h-full bg-rose-500"
                            style={{ width: `${errPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2.5">
              <Globe className="w-4 h-4 text-teal-500" />
              Uyruk Bazlı İşlenen Kayıtlar
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {data?.citizenshipBreakdown.map((c) => {
                const isSel = selectedCitizenship === c.citizenship;
                return (
                  <button
                    key={c.citizenship}
                    onClick={() => setSelectedCitizenship(isSel ? 'all' : c.citizenship)}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isSel
                        ? 'bg-teal-600 text-white border-teal-600 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span>{c.citizenship}</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {c.sent}✓
                    </span>
                    {c.errors > 0 && (
                      <span className="font-mono font-bold text-rose-500">{c.errors}✗</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Drill-down to Individual Заявка № (Application No) & Worker Records */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Заявка № ve Personel Bazlı Detaylı Kayıt Kırılımı ({filteredSubmissions.length} Kayıt)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Başvuru numarası (Заявка №), sicil no, personel adı, şantiye ve tam hata/durum mesajı bazında en alt kırılım
            </p>
          </div>

          {/* Search & Dropdown Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Заявка №, Sicil, İsim, Pasaport, Hata ara..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={selectedErrorCat}
              onChange={(e) => {
                setSelectedErrorCat(e.target.value);
                if (e.target.value !== 'all') setStatusFilter('error');
              }}
              className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            >
              <option value="all">Tüm Hata Çeşitleri</option>
              {data?.errorCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.stepLabel} — {cat.titleTr} ({cat.count})
                </option>
              ))}
            </select>

            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            >
              <option value="all">Tüm Bölgeler</option>
              {data?.regionBreakdown.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.sentCount}✓ / {r.errorCount}✗)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Quick Tabs */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            { id: 'all', label: `Tümü (${s.totalRecords})` },
            { id: 'sent', label: `✅ Başarılı (${s.totalSent})` },
            { id: 'error', label: `❌ Hatalı (${s.totalErrors})` },
            { id: 'no_pdf', label: `⚡ PDF Bekleyen (${s.totalNoPdf})` },
            { id: 'has_pdf', label: `📄 PDF İndirilen (${s.totalPdf})` },
            { id: 'registered_mvd', label: `🏛 МВД Kayıtlı (${s.totalRegisteredMvd})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id as any);
                if (tab.id !== 'error' && tab.id !== 'all') {
                  setSelectedErrorCat('all');
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mobile Cards View (< md) */}
        <div className="grid grid-cols-1 gap-2.5 md:hidden">
          {filteredSubmissions.slice(0, visibleCount).map((item) => (
            <div
              key={`${item.id}-${item.sicil_no}`}
              className={`p-3.5 rounded-xl border space-y-2 ${
                item.state === 'error'
                  ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/20 dark:bg-rose-950/15'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white">
                      #{item.sicil_no}
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {item.worker_name}
                    </span>
                  </div>
                  {item.ad_soyad_tr && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{item.ad_soyad_tr}</div>
                  )}
                </div>

                {item.application_no ? (
                  <button
                    onClick={() => handleCopyText(item.application_no, `m-${item.id}`)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    <span>№ {item.application_no}</span>
                    {copiedId === `m-${item.id}` ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[11px] font-bold">
                    Заявка Yok
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-medium">
                  {item.region}
                </span>
                <span>{item.citizenship}</span>
                {item.pasaport_no && <span>• Pasaport: {item.pasaport_no}</span>}
                {item.period_code && <span>• Dönem: {item.period_code}</span>}
              </div>

              {item.errorCategoryTitle && (
                <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  ⚠️ {item.errorCategoryTitle}
                </div>
              )}

              <div
                className={`text-[11px] font-mono break-all p-2 rounded-lg ${
                  item.state === 'error'
                    ? 'bg-rose-100/60 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                }`}
              >
                {item.gosuslugi_status}
                {item.status_detail && (
                  <div className="mt-1 text-[10px] opacity-80">{item.status_detail}</div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Gönderim: {item.submitted_at}</span>
                {item.hasPdf && (
                  <a
                    href={`/api/gosuslugi/pdf?filename=${encodeURIComponent(item.pdf_filename)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"
                  >
                    PDF Aç <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/50">
                <th className="py-2.5 px-3 font-semibold">Sicil No</th>
                <th className="py-2.5 px-3 font-semibold">Personel (Rusça / Türkçe)</th>
                <th className="py-2.5 px-3 font-semibold">Bölge & Uyruk</th>
                <th className="py-2.5 px-3 font-semibold">Заявка № (Başvuru No)</th>
                <th className="py-2.5 px-3 font-semibold">Durum / Hata Çeşidi & Detayı</th>
                <th className="py-2.5 px-3 font-semibold">PDF</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gönderim Zamanı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredSubmissions.slice(0, visibleCount).map((item) => (
                <tr
                  key={`${item.id}-${item.sicil_no}`}
                  className={`transition-colors ${
                    item.state === 'error'
                      ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/50 dark:hover:bg-rose-950/25'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {item.sicil_no}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {item.worker_name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.ad_soyad_tr || '-'}
                      {item.pasaport_no ? ` • Pasaport: ${item.pasaport_no}` : ''}
                      {item.rnr_no ? ` • RNR: ${item.rnr_no}` : ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-semibold text-indigo-700 dark:text-indigo-300">
                      {item.region}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.citizenship}</div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {item.application_no ? (
                      <button
                        onClick={() => handleCopyText(item.application_no, `d-${item.id}`)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-mono font-bold flex items-center gap-1.5 hover:bg-emerald-100 cursor-pointer"
                        title="Kopyalamak için tıklayın"
                      >
                        <span>{item.application_no}</span>
                        {copiedId === `d-${item.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 opacity-60" />
                        )}
                      </button>
                    ) : (
                      <span className="text-slate-400 font-mono">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 max-w-md">
                    {item.state === 'error' ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[10px] font-bold">
                          {item.errorStepLabel || 'Hata'} — {item.errorCategoryTitle}
                        </span>
                        <div className="text-[11px] font-mono text-rose-700 dark:text-rose-300 break-all">
                          {item.gosuslugi_status}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                            item.isRegisteredMvd
                              ? 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {item.gosuslugi_status}
                        </span>
                        {item.status_detail && (
                          <div className="text-[11px] text-slate-500">{item.status_detail}</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {item.hasPdf ? (
                      <a
                        href={`/api/gosuslugi/pdf?filename=${encodeURIComponent(item.pdf_filename)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold hover:bg-teal-100"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        PDF Aç
                      </a>
                    ) : item.state === 'sent' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        <Zap className="w-3 h-3" />
                        Hızlı Gönderim
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    <div>{item.submitted_at}</div>
                    {item.period_code && (
                      <div className="text-[10px] text-slate-400">{item.period_code}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredSubmissions.length > visibleCount && (
          <div className="pt-2 text-center">
            <button
              onClick={() => setVisibleCount((prev) => prev + 150)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Daha Fazla Göster ({visibleCount} / {filteredSubmissions.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
