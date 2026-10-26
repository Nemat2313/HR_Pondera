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
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Send,
  Clock,
  MapPin,
  Globe,
  BarChart3,
  Download,
  XCircle,
  Users,
  Info,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useAuth } from '@/context/AuthContext';
import GosuslugiWaterfallChart from './GosuslugiWaterfallChart';

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

interface HistoryStepItem {
  stepNo: number;
  application_no: string;
  status: string;
  status_key: 'service_rendered' | 'registered_mvd' | 'sent_pending' | 'refused_mvd' | 'error';
  detail: string;
  submitted_at: string;
  event_at: string;
}

interface MasterList3088Item {
  row_index: number;
  computer_no: number;
  sicil_no: string;
  worker_name: string;
  ad_soyad_tr: string;
  citizenship: string;
  region: string;
  proje_adi: string;
  pasaport_no: string;
  rnr_no: string;
  contract_date: string;
  period_code?: string;
  application_no: string;
  gosuslugi_status: string;
  status_key: 'service_rendered' | 'registered_mvd' | 'sent_pending' | 'refused_mvd' | 'error' | 'not_sent';
  status_detail: string;
  refusalHint: string;
  refusalCategoryId?: string | null;
  refusalCategoryTitle?: string | null;
  refusalStepLabel?: string | null;
  errorCategoryId?: string | null;
  errorCategoryTitle?: string | null;
  errorStepLabel?: string | null;
  pdf_filename: string;
  hasPdf: boolean;
  submitted_at: string;
  response_at: string;
  attempt_count: number;
  had_previous_failure: boolean;
  history: HistoryStepItem[];
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
  updated_at?: string;
  response_at?: string;
  attempt_count?: number;
  had_previous_failure?: boolean;
  history?: HistoryStepItem[];
  state: 'sent' | 'error' | 'other';
  hasPdf: boolean;
  isRegisteredMvd: boolean;
  isServiceRendered?: boolean;
  isRefusedMvd?: boolean;
  gosuslugiStatusKey?: 'service_rendered' | 'registered_mvd' | 'refused_mvd' | 'sent_pending' | 'error';
  refusalHint?: string | null;
  refusalCategoryId?: string | null;
  refusalCategoryTitle?: string | null;
  refusalStepLabel?: string | null;
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
    totalServiceRendered?: number;
    totalRegisteredOnly?: number;
    totalRefusedMvd?: number;
    totalSentPendingStatus?: number;
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
  refusalCategories?: ErrorCategoryItem[];
  regionBreakdown: RegionBreakdownItem[];
  citizenshipBreakdown: CitizenshipBreakdownItem[];
  hourlyTimeline: HourlyTimelineItem[];
  submissions: EnrichedSubmission[];
  masterList3088?: MasterList3088Item[];
}

type MainTabType = 'analytics' | 'master3088' | 'refusals' | 'errors';

export default function GosuslugiAnalyticsView() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [reopeningRefused, setReopeningRefused] = useState<string | null>(null);
  const [reopeningError, setReopeningError] = useState<string | null>(null);
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null);
  const [showRefusalFindings, setShowRefusalFindings] = useState<boolean>(false);

  // 4 Equal-Width Window Tabs: 'analytics' | 'master3088' | 'refusals' | 'errors'
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>('analytics');

  // Expanded accordions in Refusal & Error tabs
  const [expandedErrorCatId, setExpandedErrorCatId] = useState<string | null>(null);
  const [expandedRefusalCatId, setExpandedRefusalCatId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Unified filters for "Tüm VKS Listesi" (Tab 2)
  const [masterSearch, setMasterSearch] = useState<string>('');
  const [masterStatusFilter, setMasterStatusFilter] = useState<
    | 'all'
    | 'service_rendered'
    | 'registered_mvd'
    | 'sent_pending'
    | 'refused_mvd'
    | 'error'
    | 'not_sent'
    | 'has_pdf'
    | 'no_pdf'
    | 'resent_with_history'
  >('all');
  const [masterRefusalCatFilter, setMasterRefusalCatFilter] = useState<string>('all');
  const [masterErrorCatFilter, setMasterErrorCatFilter] = useState<string>('all');
  const [masterComputerFilter, setMasterComputerFilter] = useState<string>('all');
  const [masterRegionFilter, setMasterRegionFilter] = useState<string>('all');
  const [masterCitizenshipFilter, setMasterCitizenshipFilter] = useState<string>('all');
  const [masterDateField, setMasterDateField] = useState<'submitted_at' | 'response_at' | 'any'>('any');
  const [masterDateQuick, setMasterDateQuick] = useState<string>('all');
  const [masterDateFrom, setMasterDateFrom] = useState<string>('');
  const [masterDateTo, setMasterDateTo] = useState<string>('');
  const [masterVisibleCount, setMasterVisibleCount] = useState<number>(150);
  const [expandedHistorySicil, setExpandedHistorySicil] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (user?.scope_type && user.scope_type !== 'all' && user.scope_value) {
        params.set('scopeType', user.scope_type);
        params.set('scopeValue', user.scope_value);
      }
      const qs = params.toString();
      const res = await fetch(`/api/gosuslugi/analytics${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
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
  }, [user?.scope_type, user?.scope_value]);

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

  const formatHistorySummaryText = (history?: HistoryStepItem[]) => {
    if (!history || history.length === 0) return 'Henüz başvuru geçmişi yok';
    return history
      .map(
        (h) =>
          `[${h.stepNo}] ${h.event_at || h.submitted_at || '-'} — ${
            h.application_no ? `№ ${h.application_no} • ` : ''
          }${h.status}`
      )
      .join('  ➔  ');
  };

  const masterSummaryCounts = useMemo(() => {
    const list = data?.masterList3088 || [];
    let rendered = 0;
    let registered = 0;
    let pending = 0;
    let refused = 0;
    let error = 0;
    let notSent = 0;
    let hasPdf = 0;
    let noPdf = 0;
    let withHistory = 0;
    for (const m of list) {
      if (m.status_key === 'service_rendered') rendered++;
      else if (m.status_key === 'registered_mvd') registered++;
      else if (m.status_key === 'sent_pending') pending++;
      else if (m.status_key === 'refused_mvd') refused++;
      else if (m.status_key === 'error') error++;
      else notSent++;

      if (m.hasPdf) hasPdf++;
      else if (m.status_key !== 'not_sent' && m.status_key !== 'error') noPdf++;

      if (m.had_previous_failure || m.attempt_count > 1 || (m.history && m.history.length > 1)) {
        withHistory++;
      }
    }
    return {
      total: list.length,
      rendered,
      registered,
      pending,
      refused,
      error,
      notSent,
      hasPdf,
      noPdf,
      withHistory,
    };
  }, [data?.masterList3088]);

  const filteredMaster3088 = useMemo(() => {
    const list = data?.masterList3088 || [];
    if (!list.length) return [];
    const q = masterSearch.trim().toLowerCase();

    return list.filter((item) => {
      if (masterStatusFilter === 'service_rendered' && item.status_key !== 'service_rendered') return false;
      if (masterStatusFilter === 'registered_mvd' && item.status_key !== 'registered_mvd') return false;
      if (masterStatusFilter === 'sent_pending' && item.status_key !== 'sent_pending') return false;
      if (masterStatusFilter === 'refused_mvd' && item.status_key !== 'refused_mvd') return false;
      if (masterStatusFilter === 'error' && item.status_key !== 'error') return false;
      if (masterStatusFilter === 'not_sent' && item.status_key !== 'not_sent') return false;
      if (masterStatusFilter === 'has_pdf' && !item.hasPdf) return false;
      if (
        masterStatusFilter === 'no_pdf' &&
        (item.hasPdf || item.status_key === 'not_sent' || item.status_key === 'error')
      ) {
        return false;
      }
      if (
        masterStatusFilter === 'resent_with_history' &&
        !item.had_previous_failure &&
        item.attempt_count <= 1 &&
        (!item.history || item.history.length <= 1)
      ) {
        return false;
      }

      if (masterRefusalCatFilter !== 'all' && item.refusalCategoryId !== masterRefusalCatFilter) {
        return false;
      }
      if (masterErrorCatFilter !== 'all' && item.errorCategoryId !== masterErrorCatFilter) {
        return false;
      }
      if (masterComputerFilter !== 'all' && String(item.computer_no) !== masterComputerFilter) {
        return false;
      }
      if (masterRegionFilter !== 'all' && item.region !== masterRegionFilter) {
        return false;
      }
      if (masterCitizenshipFilter !== 'all' && item.citizenship !== masterCitizenshipFilter) {
        return false;
      }

      if (masterDateQuick !== 'all' || masterDateFrom || masterDateTo) {
        const candidateTimes: string[] = [];
        if (masterDateField === 'submitted_at') {
          if (item.submitted_at) candidateTimes.push(item.submitted_at);
        } else if (masterDateField === 'response_at') {
          if (item.response_at) candidateTimes.push(item.response_at);
        } else {
          if (item.submitted_at) candidateTimes.push(item.submitted_at);
          if (item.response_at) candidateTimes.push(item.response_at);
          for (const h of item.history || []) {
            if (h.event_at) candidateTimes.push(h.event_at);
            if (h.submitted_at) candidateTimes.push(h.submitted_at);
          }
        }
        if (candidateTimes.length === 0) return false;

        if (masterDateQuick !== 'all') {
          const matchesDay = candidateTimes.some((t) => t.slice(0, 10) === masterDateQuick);
          if (!matchesDay) return false;
        }
        if (masterDateFrom) {
          const normFrom = masterDateFrom.replace('T', ' ');
          const matchesFrom = candidateTimes.some((t) => t >= normFrom);
          if (!matchesFrom) return false;
        }
        if (masterDateTo) {
          const normTo =
            masterDateTo.length === 10
              ? `${masterDateTo} 23:59:59`
              : `${masterDateTo.replace('T', ' ')}:59`;
          const matchesTo = candidateTimes.some((t) => t <= normTo);
          if (!matchesTo) return false;
        }
      }

      if (q) {
        const histText = (item.history || [])
          .map((h) => `${h.application_no} ${h.status} ${h.detail} ${h.event_at}`)
          .join(' ');
        const hay = [
          item.sicil_no,
          item.application_no,
          item.worker_name,
          item.ad_soyad_tr,
          item.pasaport_no,
          item.rnr_no,
          item.region,
          item.proje_adi,
          item.citizenship,
          item.gosuslugi_status,
          item.status_detail,
          item.refusalHint,
          item.refusalCategoryTitle,
          item.errorCategoryTitle,
          `pc ${item.computer_no}`,
          histText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    data?.masterList3088,
    masterSearch,
    masterStatusFilter,
    masterRefusalCatFilter,
    masterErrorCatFilter,
    masterComputerFilter,
    masterRegionFilter,
    masterCitizenshipFilter,
    masterDateField,
    masterDateQuick,
    masterDateFrom,
    masterDateTo,
  ]);

  const exportMasterListToExcel = (customList?: MasterList3088Item[], filePrefix = 'Pondera_VKS_Listesi') => {
    const targetList = customList || filteredMaster3088;
    if (!targetList.length) return;
    const rows = targetList.map((item) => ({
      'Sıra No': item.row_index,
      'Bilgisayar (PC)': `PC ${item.computer_no}`,
      'Sicil No (Код)': item.sicil_no,
      'Ad Soyad (Rusça)': item.worker_name,
      'Ad Soyad (Türkçe)': item.ad_soyad_tr || '-',
      'Uyruk': item.citizenship,
      'Bölge / Şantiye': item.region,
      'Proje': item.proje_adi || '-',
      'Pasaport No': item.pasaport_no || '-',
      'VKS RNR No': item.rnr_no || '-',
      'Sözleşme Tarihi': item.contract_date || '-',
      'Güncel Заявка № (Başvuru No)': item.application_no || 'Henüz Yok',
      'Güncel Gosuslugi Statüsü': item.gosuslugi_status,
      'Statü Grubu':
        item.status_key === 'service_rendered'
          ? 'Onaylandı (Услуга оказана)'
          : item.status_key === 'registered_mvd'
          ? 'МВД Kayıtlı (Заявление зарегистрировано)'
          : item.status_key === 'sent_pending'
          ? 'Gönderildi (Beklemede)'
          : item.status_key === 'refused_mvd'
          ? 'МВД Red (Услуга отказана)'
          : item.status_key === 'error'
          ? 'Hatalı (Ошибка)'
          : 'Henüz Gönderilmedi (Kuyrukta)',
      'Hata / Red Kategorisi': item.refusalCategoryTitle || item.errorCategoryTitle || '-',
      'Gosuslugi Gönderildiği Vakit (MSK)': item.submitted_at || '-',
      'Cevap Geldiği / Son Kontrol Vakti (MSK)': item.response_at || '-',
      'Toplam İşlem / Deneme Adımı': item.history?.length || 0,
      'Önceki Hata/Red Geçmişi Var mı?': item.had_previous_failure ? 'EVET (Tekrar Gönderildi)' : 'Hayır',
      'Başvuru Geçmişi (History) Özeti': formatHistorySummaryText(item.history),
      'PDF Dosyası': item.pdf_filename || '-',
      'Detay / Red Analizi': item.refusalHint || item.status_detail || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'VKS_Listesi');
    XLSX.writeFile(
      wb,
      `${filePrefix}_${targetList.length}_Kayit_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const exportItemsToExcel = (itemsToExport: EnrichedSubmission[], filePrefix = 'Gosuslugi_VKS_Rapor') => {
    if (!itemsToExport.length) return;
    const rows = itemsToExport.map((item, idx) => ({
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
      'Durum Grubu':
        item.state === 'error'
          ? 'Hatalı (Ошибка)'
          : item.isRefusedMvd
          ? 'МВД Red (Услуга отказана)'
          : item.isServiceRendered
          ? 'Onaylandı (Услуга оказана)'
          : item.isRegisteredMvd
          ? 'МВД Kayıtlı (Заявление зарегистрировано)'
          : 'Gönderildi (Beklemede)',
      'Hata / Red Kategorisi': item.refusalCategoryTitle || item.errorCategoryTitle || '-',
      'Gosuslugi Durumu / Hata Detayı': item.gosuslugi_status,
      'Ek Detay / Red Analizi': item.refusalHint || item.status_detail || '-',
      'PDF Dosyası': item.pdf_filename || 'İndirilmedi (Hızlı Gönderim)',
      'Gosuslugi Gönderildiği Vakit (MSK)': item.submitted_at,
      'Cevap Geldiği / Son Kontrol Vakti (MSK)': item.response_at || item.checked_at || '-',
      'Başvuru Geçmişi (History) Özeti': formatHistorySummaryText(item.history),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gosuslugi_VKS_Rapor');
    XLSX.writeFile(
      wb,
      `${filePrefix}_${itemsToExport.length}_Kayit_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const handleReopenRefusedGroup = async (sicilList: string[], label: string) => {
    if (!sicilList.length) return;
    if (
      !window.confirm(
        `«${label}» grubundaki ${sicilList.length} adet «Услуга отказана» (Red) kaydını arşivleyip tekrar gönderim kuyruğuna (Bekleyen) açmak istediğinize emin misiniz?\n\nEski Заявка numaraları arşivlenecek ve bu personeller Gosuslugi robotunda tekrar gönderilebilir (Bekleyen) durumuna geçecektir.`
      )
    ) {
      return;
    }
    setReopeningRefused(label);
    try {
      const res = await fetch('/api/gosuslugi/master-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reopen_refused',
          scope: 'selected',
          sicils: sicilList,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setTelegramFeedback(
          `✅ ${json.reopenedCount || sicilList.length} adet «Услуга отказана» kaydı tekrar gönderim kuyruğuna (Bekleyen) açıldı!`
        );
        fetchAnalytics(false);
      } else {
        setTelegramFeedback(`⚠️ İşlem tamamlanamadı: ${json?.message || ''}`);
      }
    } catch {
      setTelegramFeedback('⚠️ Red kayıtları tekrar gönderime açılırken bağlantı hatası oluştu.');
    } finally {
      setReopeningRefused(null);
      setTimeout(() => setTelegramFeedback(null), 6000);
    }
  };

  const handleReopenErrorGroup = async (sicilList: string[], label: string) => {
    if (!sicilList.length) return;
    if (
      !window.confirm(
        `«${label}» grubundaki ${sicilList.length} adet hatalı (Ошибка) kaydı veri değişikliği yapmadan doğrudan tekrar gönderim kuyruğuna (Bekleyen) açmak istediğinize emin misiniz?\n\nBu personellerin hata durumu temizlenecek ve Gosuslugi robotunda tekrar gönderilebilir (Bekleyen) durumuna geçecektir.`
      )
    ) {
      return;
    }
    setReopeningError(label);
    try {
      const res = await fetch('/api/gosuslugi/master-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry_errors',
          scope: 'selected',
          clearFromDb: true,
          sicils: sicilList,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setTelegramFeedback(
          `✅ ${json.resetCount || sicilList.length} adet hatalı (Ошибка) kayıt tekrar gönderim kuyruğuna (Bekleyen) açıldı!`
        );
        fetchAnalytics(false);
      } else {
        setTelegramFeedback(`⚠️ İşlem tamamlanamadı: ${json?.message || ''}`);
      }
    } catch {
      setTelegramFeedback('⚠️ Hatalı kayıtlar tekrar gönderime açılırken bağlantı hatası oluştu.');
    } finally {
      setReopeningError(null);
      setTimeout(() => setTelegramFeedback(null), 6000);
    }
  };

  const allErrorItems = useMemo(
    () => (data?.submissions || []).filter((item) => item.state === 'error'),
    [data?.submissions]
  );

  const allRefusedItems = useMemo(
    () =>
      (data?.submissions || []).filter(
        (item) => item.isRefusedMvd || item.gosuslugiStatusKey === 'refused_mvd'
      ),
    [data?.submissions]
  );

  const errorTemplateExportUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('computer', 'all');
    params.set('mode', 'only_oshibka');
    if (user?.scope_type && user.scope_type !== 'all' && user.scope_value) {
      params.set('scopeType', user.scope_type);
      params.set('scopeValue', user.scope_value);
    }
    return `/api/gosuslugi/master-list/export-errors?${params.toString()}`;
  }, [user?.scope_type, user?.scope_value]);

  const filteredMasterPdfItems = useMemo(
    () => filteredMaster3088.filter((item) => item.hasPdf && item.pdf_filename),
    [filteredMaster3088]
  );

  const isMasterFiltered =
    masterSearch.trim() !== '' ||
    masterStatusFilter !== 'all' ||
    masterRefusalCatFilter !== 'all' ||
    masterErrorCatFilter !== 'all' ||
    masterComputerFilter !== 'all' ||
    masterRegionFilter !== 'all' ||
    masterCitizenshipFilter !== 'all' ||
    masterDateQuick !== 'all' ||
    masterDateFrom !== '' ||
    masterDateTo !== '';

  const handleDownloadPdfZip = async (onlyFiltered = false) => {
    setDownloadingZip(true);
    try {
      const isScopedUser = Boolean(user?.scope_type && user.scope_type !== 'all' && user.scope_value);
      const allScopedPdfItems = (data?.submissions || []).filter((it) => it.hasPdf && it.pdf_filename);
      const targetItems = onlyFiltered ? filteredMasterPdfItems : allScopedPdfItems;

      if ((onlyFiltered && isMasterFiltered) || isScopedUser) {
        if (targetItems.length === 0) {
          setTelegramFeedback('⚠️ Seçilen kapsama ait PDF dosyası bulunamadı.');
          return;
        }
        const res = await fetch('/api/gosuslugi/pdf/zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filenames: targetItems.map((it) => it.pdf_filename),
            appNos: targetItems.map((it) => it.application_no),
          }),
        });
        if (!res.ok) {
          setTelegramFeedback('⚠️ Seçilen filtreye ait PDF dosyaları sunucuda bulunamadı.');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const scopeLabel = isScopedUser ? `_${user?.scope_value}` : onlyFiltered ? '_Filtreli' : '';
        a.download = `Pondera_VKS_Gosuslugi_PDFs${scopeLabel}_${targetItems.length}adet_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement('a');
        a.href = '/api/gosuslugi/pdf/zip';
        a.download = `Pondera_VKS_Gosuslugi_PDFs_2026-3.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setTelegramFeedback('⚠️ PDF ZIP arşivi indirilirken hata oluştu.');
    } finally {
      setTimeout(() => setDownloadingZip(false), 1200);
    }
  };

  // Navigate to Tab 2 (Tüm VKS Listesi) with specific filters applied
  const jumpToMasterListWithFilter = (opts: {
    status?: typeof masterStatusFilter;
    refusalCat?: string;
    errorCat?: string;
    region?: string;
    citizenship?: string;
  }) => {
    setMasterStatusFilter(opts.status || 'all');
    setMasterRefusalCatFilter(opts.refusalCat || 'all');
    setMasterErrorCatFilter(opts.errorCat || 'all');
    if (opts.region !== undefined) setMasterRegionFilter(opts.region);
    if (opts.citizenship !== undefined) setMasterCitizenshipFilter(opts.citizenship);
    setActiveMainTab('master3088');
  };

  if (loading && !data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Gosuslugi VKS Analitik verileri yükleniyor...
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
    totalServiceRendered: 0,
    totalRegisteredOnly: 0,
    totalRefusedMvd: 0,
    totalSentPendingStatus: 0,
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

  // Chart Data for Donut & Unified Status Breakdown
  const totalVksCount = masterSummaryCounts.total || s.totalTargetVksPersonnel || 1;
  const statusChartRows = [
    {
      id: 'service_rendered',
      label: 'Onaylanan (Услуга оказана)',
      shortLabel: 'Onaylanan',
      value: s.totalServiceRendered ?? 0,
      color: '#10b981', // emerald-500
      dotClass: 'bg-emerald-500',
      pct: Math.round(((s.totalServiceRendered ?? 0) / totalVksCount) * 100),
      filterStatus: 'service_rendered' as const,
      actionType: 'excel_rendered' as const,
    },
    {
      id: 'registered_mvd',
      label: 'МВД Kaydında (Зарегистрировано)',
      shortLabel: 'МВД Kaydında',
      value: s.totalRegisteredOnly ?? 0,
      color: '#0d9488', // teal-600
      dotClass: 'bg-teal-600',
      pct: Math.round(((s.totalRegisteredOnly ?? 0) / totalVksCount) * 100),
      filterStatus: 'registered_mvd' as const,
      actionType: 'none' as const,
    },
    {
      id: 'sent_pending',
      label: 'Yanıt Bekleyen (Отправлено)',
      shortLabel: 'Yanıt Bekleyen',
      value: s.totalSentPendingStatus ?? 0,
      color: '#f59e0b', // amber-500
      dotClass: 'bg-amber-500',
      pct: Math.round(((s.totalSentPendingStatus ?? 0) / totalVksCount) * 100),
      filterStatus: 'sent_pending' as const,
      actionType: 'none' as const,
    },
    {
      id: 'refused_mvd',
      label: 'МВД Red (Услуга отказана)',
      shortLabel: 'МВД Red',
      value: s.totalRefusedMvd ?? 0,
      color: '#ea580c', // orange-600
      dotClass: 'bg-orange-600',
      pct: Math.round(((s.totalRefusedMvd ?? 0) / totalVksCount) * 100),
      filterStatus: 'refused_mvd' as const,
      actionType: 'refused_template' as const,
    },
    {
      id: 'error',
      label: 'Form / Sistem Hatası (Ошибка)',
      shortLabel: 'Hatalı (Ошибка)',
      value: s.totalErrors,
      color: '#e11d48', // rose-600
      dotClass: 'bg-rose-600',
      pct: Math.round((s.totalErrors / totalVksCount) * 100),
      filterStatus: 'error' as const,
      actionType: 'error_template' as const,
    },
    {
      id: 'not_sent',
      label: 'Henüz Gönderilmedi (Kuyrukta)',
      shortLabel: 'Kuyrukta',
      value: masterSummaryCounts.notSent,
      color: '#64748b', // slate-500
      dotClass: 'bg-slate-400',
      pct: Math.round((masterSummaryCounts.notSent / totalVksCount) * 100),
      filterStatus: 'not_sent' as const,
      actionType: 'none' as const,
    },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* COMPACT CLEAN HEADER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:px-5 sm:py-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800">
                <Activity className="w-3 h-3 animate-pulse" />
                Canlı VKS Analitiği
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Moskova Saati: <span className="text-slate-800 dark:text-slate-200 font-normal">{data?.moscowTime || '-'}</span>
              </span>
              {(s.last15mSent > 0 || s.last60mSent > 0) && (
                <span className="text-xs text-slate-600 dark:text-slate-400 hidden sm:inline-flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
                  Son 1 Saat: <span className="text-emerald-700 dark:text-emerald-400 font-normal">+{s.last60mSent} gönderim</span>
                  {s.last15mSent > 0 && <span>(15dk: +{s.last15mSent})</span>}
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-normal text-slate-900 dark:text-white tracking-tight">
              Gosuslugi VKS Bildirim & Analitik Merkezi
            </h1>
          </div>

          {/* Clean Neutral Utility Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl text-xs font-normal border transition-all flex items-center gap-1.5 cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                }`}
              />
              {autoRefresh ? 'Oto-Yenileme (15sn)' : 'Oto-Yenileme Kapalı'}
            </button>

            <button
              onClick={() => fetchAnalytics(false)}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-xl text-xs font-normal bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </button>

            {user?.role !== 'viewer' && (
              <button
                onClick={handleTriggerTelegramNow}
                disabled={sendingTelegram}
                className="px-3 py-1.5 rounded-xl text-xs font-normal bg-sky-600 hover:bg-sky-500 text-white border border-sky-600 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 text-white" />
                {sendingTelegram ? 'Gönderiliyor...' : 'Telegram Raporu'}
              </button>
            )}
          </div>
        </div>

        {telegramFeedback && (
          <div className="mt-3 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-normal">
            {telegramFeedback}
          </div>
        )}

        {/* Slim Overall Progress Bar */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
            <span className="font-normal text-slate-800 dark:text-slate-200">
              Genel Bildirim İlerlemesi:{' '}
              <span className="text-slate-900 dark:text-white font-normal">
                {s.totalSent.toLocaleString('tr-TR')} / {s.totalTargetVksPersonnel.toLocaleString('tr-TR')}
              </span>{' '}
              VKS Personeli
            </span>
            <div className="flex items-center gap-3">
              {estimatedHoursLeft && (
                <span className="text-slate-700 dark:text-slate-300 font-normal">
                  Tahmini Kalan: <span className="font-normal">~{estimatedHoursLeft} saat</span>
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 font-normal border border-emerald-200/60 dark:border-emerald-800/60 text-xs">
                %{s.overallCompletionPct} Tamamlandı
              </span>
            </div>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, s.overallCompletionPct)}%` }}
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
              />
            )}
          </div>
        </div>
      </div>

      {/* WINDOWS MULTI-TAB FORM CONTAINER (4 Equal-Width Tabs Connected to Window Body) */}
      <div>
        {/* Equal-Width Window Tabs Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 px-2 pt-2 bg-slate-200/70 dark:bg-slate-950/80 rounded-t-2xl border border-b-0 border-slate-200/90 dark:border-slate-800">
          {/* Tab 1: Genel Analitik */}
          <button
            type="button"
            onClick={() => setActiveMainTab('analytics')}
            className={`group relative w-full px-3 py-2.5 rounded-t-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer select-none border border-b-0 ${
              activeMainTab === 'analytics'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200/90 dark:border-slate-800 -mb-px z-10 shadow-[0_-2px_8px_rgba(15,23,42,0.04)]'
                : 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-transparent hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <span
              className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl transition-opacity ${
                activeMainTab === 'analytics' ? 'bg-emerald-600 opacity-100' : 'opacity-0'
              }`}
            />
            <BarChart3
              className={`w-4 h-4 shrink-0 ${
                activeMainTab === 'analytics' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
              }`}
            />
            <span className="truncate">Genel Analitik</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs sm:text-[13px] font-normal ${
                activeMainTab === 'analytics'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-950 dark:text-emerald-300 border border-emerald-300/60'
                  : 'bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
              }`}
            >
              %{s.overallCompletionPct}
            </span>
          </button>

          {/* Tab 2: Tüm VKS Listesi */}
          <button
            type="button"
            onClick={() => setActiveMainTab('master3088')}
            className={`group relative w-full px-3 py-2.5 rounded-t-xl text-xs sm:text-sm font-normal flex items-center justify-center gap-2 transition-all cursor-pointer select-none border border-b-0 ${
              activeMainTab === 'master3088'
                ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white border-slate-200/90 dark:border-slate-800 -mb-px z-10 shadow-[0_-2px_8px_rgba(15,23,42,0.04)]'
                : 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-transparent hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <span
              className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl transition-opacity ${
                activeMainTab === 'master3088' ? 'bg-indigo-600 opacity-100' : 'opacity-0'
              }`}
            />
            <Users
              className={`w-4 h-4 shrink-0 ${
                activeMainTab === 'master3088' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'
              }`}
            />
            <span className="truncate">Tüm VKS Listesi</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs sm:text-[13px] font-normal ${
                activeMainTab === 'master3088'
                  ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-950 dark:text-indigo-300 border border-indigo-300/60'
                  : 'bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
              }`}
            >
              {masterSummaryCounts.total.toLocaleString('tr-TR')}
            </span>
          </button>

          {/* Tab 3: МВД Red Analizi */}
          <button
            type="button"
            onClick={() => setActiveMainTab('refusals')}
            className={`group relative w-full px-3 py-2.5 rounded-t-xl text-xs sm:text-sm font-normal flex items-center justify-center gap-2 transition-all cursor-pointer select-none border border-b-0 ${
              activeMainTab === 'refusals'
                ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white border-slate-200/90 dark:border-slate-800 -mb-px z-10 shadow-[0_-2px_8px_rgba(15,23,42,0.04)]'
                : 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-transparent hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <span
              className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl transition-opacity ${
                activeMainTab === 'refusals' ? 'bg-orange-600 opacity-100' : 'opacity-0'
              }`}
            />
            <XCircle
              className={`w-4 h-4 shrink-0 ${
                activeMainTab === 'refusals' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500'
              }`}
            />
            <span className="truncate">МВД Red Analizi</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs sm:text-[13px] font-normal ${
                activeMainTab === 'refusals'
                  ? 'bg-orange-100 dark:bg-orange-950 text-orange-950 dark:text-orange-300 border border-orange-300/60'
                  : 'bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
              }`}
            >
              {s.totalRefusedMvd ?? 0}
            </span>
          </button>

          {/* Tab 4: Hata Analizi */}
          <button
            type="button"
            onClick={() => setActiveMainTab('errors')}
            className={`group relative w-full px-3 py-2.5 rounded-t-xl text-xs sm:text-sm font-normal flex items-center justify-center gap-2 transition-all cursor-pointer select-none border border-b-0 ${
              activeMainTab === 'errors'
                ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white border-slate-200/90 dark:border-slate-800 -mb-px z-10 shadow-[0_-2px_8px_rgba(15,23,42,0.04)]'
                : 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border-transparent hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <span
              className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl transition-opacity ${
                activeMainTab === 'errors' ? 'bg-rose-600 opacity-100' : 'opacity-0'
              }`}
            />
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                activeMainTab === 'errors' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
              }`}
            />
            <span className="truncate">Hata Analizi</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs sm:text-[13px] font-normal ${
                activeMainTab === 'errors'
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-950 dark:text-rose-300 border border-rose-300/60'
                  : 'bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
              }`}
            >
              {s.totalErrors}
            </span>
          </button>
        </div>

        {/* CONNECTED TAB WINDOW CONTENT PANEL */}
        <div className="bg-white dark:bg-slate-900 rounded-b-2xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-6 shadow-xs">
          {/* =====================================================================
              TAB 1: GENEL ANALİTİK (UNIFIED CHART + INLINE DOWNLOADS + REGIONS)
          ===================================================================== */}
          {activeMainTab === 'analytics' && (
            <div className="space-y-6">
              {/* UNIFIED VISUAL STATUS CHART & INLINE EXPORT PANEL */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/50 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-200/70 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm sm:text-base font-normal text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Gosuslugi Portal Resmi Statü Dağılımı & İndirme Merkezi
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-normal">
                      Her statünün yanındaki indirme butonlarıyla ilgili kayıtları doğrudan indirebilir veya satıra tıklayarak listeyi açabilirsiniz
                    </p>
                  </div>

                  {/* Primary Totals & Master Downloads */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-normal">Toplam Liste:</span>
                      <span className="text-sm text-slate-900 dark:text-white font-normal">
                        {masterSummaryCounts.total.toLocaleString('tr-TR')}
                      </span>
                      <button
                        onClick={() => exportMasterListToExcel()}
                        className="ml-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-normal flex items-center gap-1 cursor-pointer transition-colors"
                        title="Tüm VKS Listesini Excel olarak indir"
                      >
                        <Download className="w-3 h-3" />
                        Excel
                      </button>
                    </div>

                    <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-normal">EBA PDF:</span>
                      <span className="text-sm text-teal-700 dark:text-teal-400 font-normal">
                        {s.totalPdf.toLocaleString('tr-TR')}
                      </span>
                      <button
                        onClick={() => handleDownloadPdfZip(false)}
                        disabled={downloadingZip || s.totalPdf === 0}
                        className="ml-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-normal flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                        title="İndirilen tüm PDF makbuzlarını tek ZIP arşivi olarak indir"
                      >
                        <Download className="w-3 h-3" />
                        {downloadingZip ? 'ZIP...' : 'ZIP İndir'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Grid: Left Build-Down Waterfall Chart (5 cols) + Right Interactive Visual Bars (7 cols) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left: Build-Down Waterfall Chart (5 cols) */}
                  <div className="lg:col-span-5">
                    <GosuslugiWaterfallChart
                      total={masterSummaryCounts.total || s.totalTargetVksPersonnel || 3088}
                      serviceRendered={s.totalServiceRendered ?? 0}
                      inProgress={(s.totalRegisteredOnly ?? 0) + (s.totalSentPendingStatus ?? 0)}
                      registeredMvd={s.totalRegisteredOnly ?? 0}
                      sentPending={s.totalSentPendingStatus ?? 0}
                      refusedMvd={s.totalRefusedMvd ?? 0}
                      errors={s.totalErrors ?? 0}
                      notSent={masterSummaryCounts.notSent ?? 0}
                      totalSent={s.totalSent ?? 0}
                      successRatePct={s.successRatePct ?? 99}
                      totalPdf={s.totalPdf ?? 0}
                      totalNoPdf={s.totalNoPdf ?? 0}
                      onSelectStage={(stageKey) => {
                        if (stageKey === 'all') {
                          jumpToMasterListWithFilter({ status: 'all' });
                        } else if (stageKey === 'refused_mvd') {
                          setActiveMainTab('refusals');
                        } else if (stageKey === 'error') {
                          setActiveMainTab('errors');
                        } else {
                          jumpToMasterListWithFilter({ status: stageKey as any });
                        }
                      }}
                    />
                  </div>

                  {/* Right: Horizontal Visual Bars + Contextual Download Buttons Next to Numbers (7 cols) */}
                  <div className="lg:col-span-7 space-y-2.5">
                    {statusChartRows.map((row) => (
                      <div
                        key={row.id}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <button
                            type="button"
                            onClick={() => jumpToMasterListWithFilter({ status: row.filterStatus })}
                            className="flex items-center gap-2 text-left group cursor-pointer"
                          >
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.dotClass}`} />
                            <span className="text-xs sm:text-sm font-normal text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {row.label}
                            </span>
                          </button>

                          {/* Number + Contextual Download & Detail Buttons right next to the number */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm sm:text-base font-normal text-slate-900 dark:text-white">
                              {row.value.toLocaleString('tr-TR')}
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-slate-400 w-9 text-right font-normal">
                              %{row.pct}
                            </span>

                            {row.actionType === 'excel_rendered' && row.value > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const list = (data?.masterList3088 || []).filter(
                                    (m) => m.status_key === 'service_rendered'
                                  );
                                  exportMasterListToExcel(list, 'Pondera_VKS_Onaylananlar');
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-normal bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                                title="Onaylanan (Услуга оказана) kayıtları Excel olarak indir"
                              >
                                <Download className="w-3 h-3" />
                                İndir
                              </button>
                            )}

                            {row.actionType === 'refused_template' && (
                              <div className="flex items-center gap-1.5">
                                <a
                                  href="/api/gosuslugi/master-list/export-errors?mode=refused&computer=all"
                                  download
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-normal bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 no-underline transition-colors"
                                  title="МВД Red (Услуга отказана) kayıtlarını renkli VKS şablonu olarak indir"
                                >
                                  <Download className="w-3 h-3 text-orange-600" />
                                  Şablon İndir
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setActiveMainTab('refusals')}
                                  className="px-2 py-1 rounded-lg text-[11px] font-normal bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800/80 flex items-center gap-1 cursor-pointer"
                                >
                                  Analiz <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            {row.actionType === 'error_template' && (
                              <div className="flex items-center gap-1.5">
                                {user?.role !== 'viewer' && (
                                  <a
                                    href={errorTemplateExportUrl}
                                    download
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-normal bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 no-underline transition-colors"
                                    title="Hatalı (Ошибка) kayıtları renkli VKS şablonu olarak indir"
                                  >
                                    <Download className="w-3 h-3 text-rose-600" />
                                    Şablon İndir
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setActiveMainTab('errors')}
                                  className="px-2 py-1 rounded-lg text-[11px] font-normal bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/80 flex items-center gap-1 cursor-pointer"
                                >
                                  Analiz <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            {row.actionType === 'none' && (
                              <button
                                type="button"
                                onClick={() => jumpToMasterListWithFilter({ status: row.filterStatus })}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                              >
                                Listele <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Horizontal Visual Progress Bar */}
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(row.value > 0 ? 1.5 : 0, Math.min(100, row.pct))}%`,
                              backgroundColor: row.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* REGION BREAKDOWN & HOURLY / CITIZENSHIP ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Region Breakdown (2 cols) */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        Bölge / Şantiye Bazlı Bildirim Durumu
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Şantiyeye tıklayarak Tüm VKS Listesi sekmesinde ilgili bölgeyi filtreleyebilirsiniz
                      </p>
                    </div>
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
                        {data?.regionBreakdown.map((reg) => (
                          <tr
                            key={reg.region}
                            onClick={() => jumpToMasterListWithFilter({ region: reg.region })}
                            className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Hourly Speed & Citizenship Breakdown (1 col) */}
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      Saatlik İşlem & Statü Güncelleme Hızı (MSK)
                    </h3>
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

                  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2.5">
                      <Globe className="w-4 h-4 text-teal-600" />
                      Uyruk Dağılımı
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {data?.citizenshipBreakdown.map((c) => (
                        <button
                          key={c.citizenship}
                          onClick={() => jumpToMasterListWithFilter({ citizenship: c.citizenship })}
                          className="px-2.5 py-1 rounded-lg text-xs border bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <span>{c.citizenship}</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {c.sent}✓
                          </span>
                          {c.errors > 0 && (
                            <span className="font-mono font-bold text-rose-500">{c.errors}✗</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 2: TÜM VKS LİSTESİ (MERGED MASTER LIST + ZAYAVKA DRILL-DOWN)
          ===================================================================== */}
          {activeMainTab === 'master3088' && (
            <div className="space-y-4">
              {/* Header + Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>Tüm VKS Listesi, Заявка № ve Başvuru Geçmişi</span>
                    <span className="font-mono text-xs sm:text-[13px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-0.5 rounded-lg border border-indigo-200/80 dark:border-indigo-800/80">
                      {filteredMaster3088.length.toLocaleString('tr-TR')} / {masterSummaryCounts.total.toLocaleString('tr-TR')}
                    </span>
                  </h2>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 mt-0.5">
                    Personel bazlı başvuru numarası (Заявка №), Gosuslugi statüsü, hata/red teşhisi, PDF makbuzu ve tüm işlem geçmişi
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isMasterFiltered && (
                    <button
                      onClick={() => {
                        setMasterSearch('');
                        setMasterStatusFilter('all');
                        setMasterRefusalCatFilter('all');
                        setMasterErrorCatFilter('all');
                        setMasterComputerFilter('all');
                        setMasterRegionFilter('all');
                        setMasterCitizenshipFilter('all');
                        setMasterDateQuick('all');
                        setMasterDateFrom('');
                        setMasterDateTo('');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      Filtreleri Sıfırla
                    </button>
                  )}

                  {filteredMasterPdfItems.length > 0 && (
                    <button
                      onClick={() => handleDownloadPdfZip(true)}
                      disabled={downloadingZip}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-600" />
                      PDF ZIP İndir ({filteredMasterPdfItems.length})
                    </button>
                  )}

                  <button
                    onClick={() => exportMasterListToExcel()}
                    disabled={filteredMaster3088.length === 0}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Excel İndir ({filteredMaster3088.length})
                  </button>
                </div>
              </div>

              {/* Filter Grid: Search + Status + Error/Refusal Sub-Category + PC + Region + Citizenship */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                <div className="relative min-w-0 lg:col-span-2">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={masterSearch}
                    onChange={(e) => setMasterSearch(e.target.value)}
                    placeholder="Sicil, Заявка №, Ad Soyad, Pasaport, RNR, Hata/Red ara..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <select
                  value={masterStatusFilter}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setMasterStatusFilter(val);
                    if (val !== 'refused_mvd' && val !== 'all') setMasterRefusalCatFilter('all');
                    if (val !== 'error' && val !== 'all') setMasterErrorCatFilter('all');
                  }}
                  className="w-full min-w-0 truncate px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold"
                >
                  <option value="all">Tüm Durumlar ({masterSummaryCounts.total})</option>
                  <option value="service_rendered">✅ Услуга оказана ({masterSummaryCounts.rendered})</option>
                  <option value="registered_mvd">🏛 Зарегистрировано ({masterSummaryCounts.registered})</option>
                  <option value="sent_pending">📤 Отправлено - Bekleyen ({masterSummaryCounts.pending})</option>
                  <option value="refused_mvd">🚫 Услуга отказана - Red ({masterSummaryCounts.refused})</option>
                  <option value="error">❌ Ошибка - Hatalı ({masterSummaryCounts.error})</option>
                  <option value="not_sent">⏳ Henüz Gönderilmedi ({masterSummaryCounts.notSent})</option>
                  <option value="has_pdf">📄 PDF İndirilen ({masterSummaryCounts.hasPdf})</option>
                  <option value="no_pdf">⚡ PDF Bekleyen ({masterSummaryCounts.noPdf})</option>
                  <option value="resent_with_history">🔄 Tekrar Gönderilen ({masterSummaryCounts.withHistory})</option>
                </select>

                <select
                  value={masterComputerFilter}
                  onChange={(e) => setMasterComputerFilter(e.target.value)}
                  className="w-full min-w-0 truncate px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Tüm Bilgisayarlar (PC 1–4)</option>
                  <option value="1">💻 Bilgisayar 1 (PC 1)</option>
                  <option value="2">💻 Bilgisayar 2 (PC 2)</option>
                  <option value="3">💻 Bilgisayar 3 (PC 3)</option>
                  <option value="4">💻 Bilgisayar 4 (PC 4)</option>
                </select>

                <select
                  value={masterRegionFilter}
                  onChange={(e) => setMasterRegionFilter(e.target.value)}
                  className="w-full min-w-0 truncate px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Tüm Bölgeler / Şantiyeler</option>
                  {data?.regionBreakdown.map((r) => (
                    <option key={r.region} value={r.region}>
                      {r.region} ({r.targetVks})
                    </option>
                  ))}
                </select>

                <select
                  value={masterCitizenshipFilter}
                  onChange={(e) => setMasterCitizenshipFilter(e.target.value)}
                  className="w-full min-w-0 truncate px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Tüm Uyruklar</option>
                  {data?.citizenshipBreakdown.map((c) => (
                    <option key={c.citizenship} value={c.citizenship}>
                      {c.citizenship} ({c.total})
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Sub-Category Filter Pill (when navigated from Red or Hata tab) */}
              {(masterRefusalCatFilter !== 'all' || masterErrorCatFilter !== 'all') && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Alt Kırılım Filtresi:</span>
                  {masterRefusalCatFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 font-bold">
                      Red Grubu: {data?.refusalCategories?.find((c) => c.id === masterRefusalCatFilter)?.titleTr || masterRefusalCatFilter}
                      <button
                        onClick={() => setMasterRefusalCatFilter('all')}
                        className="hover:text-orange-950 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {masterErrorCatFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold">
                      Hata Grubu: {data?.errorCategories?.find((c) => c.id === masterErrorCatFilter)?.titleTr || masterErrorCatFilter}
                      <button
                        onClick={() => setMasterErrorCatFilter('all')}
                        className="hover:text-rose-950 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
              )}

              {/* Compact Time Filter Bar */}
              <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={masterDateField}
                    onChange={(e) => setMasterDateField(e.target.value as any)}
                    className="px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold"
                  >
                    <option value="submitted_at">📤 Gönderim Vakti</option>
                    <option value="response_at">🔔 Cevap Vakti</option>
                    <option value="any">🕒 Tüm İşlem Vakitleri</option>
                  </select>

                  {[
                    { id: 'all', label: 'Tüm Günler' },
                    { id: '2026-10-26', label: 'Bugün (26.10)' },
                    { id: '2026-10-25', label: 'Dün (25.10)' },
                    { id: '2026-10-24', label: '24.10' },
                    { id: '2026-10-23', label: '23.10' },
                    { id: '2026-10-22', label: '22.10' },
                    { id: '2026-10-21', label: '21.10' },
                    { id: '2026-10-20', label: '20.10' },
                    { id: '2026-10-19', label: '19.10' },
                  ].map((dBtn) => (
                    <button
                      key={dBtn.id}
                      onClick={() => {
                        setMasterDateQuick(dBtn.id);
                        setMasterDateFrom('');
                        setMasterDateTo('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        masterDateQuick === dBtn.id && !masterDateFrom && !masterDateTo
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600'
                      }`}
                    >
                      {dBtn.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Tarih Aralığı:</span>
                  <input
                    type="datetime-local"
                    value={masterDateFrom}
                    onChange={(e) => {
                      setMasterDateFrom(e.target.value);
                      if (e.target.value) setMasterDateQuick('all');
                    }}
                    className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  />
                  <span className="text-slate-400">—</span>
                  <input
                    type="datetime-local"
                    value={masterDateTo}
                    onChange={(e) => {
                      setMasterDateTo(e.target.value);
                      if (e.target.value) setMasterDateQuick('all');
                    }}
                    className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Unified Master VKS & Zayavka Table */}
              <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 bg-slate-50/90 dark:bg-slate-800/60">
                      <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">Sıra / PC</th>
                      <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">Sicil No</th>
                      <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Personel (Ad Soyad)</th>
                      <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">Pasaport No</th>
                      <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">RNR (Çalışma İzni)</th>
                      <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">Bölge & Uyruk</th>
                      <th className="py-2.5 px-2.5 font-semibold whitespace-nowrap">Заявка № & PDF</th>
                      <th className="py-2.5 px-3 font-semibold">Gosuslugi Statüsü & Teşhis</th>
                      <th className="py-2.5 px-3 font-semibold whitespace-nowrap">Gönderim & Cevap</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[260px]">Başvuru Geçmişi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {filteredMaster3088.slice(0, masterVisibleCount).map((item) => {
                      const isExpandedHist = expandedHistorySicil === item.sicil_no;
                      const histList = item.history || [];
                      return (
                        <tr
                          key={`m3088-${item.row_index}-${item.sicil_no}`}
                          className={`transition-colors align-top ${
                            item.status_key === 'error'
                              ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40'
                              : item.status_key === 'refused_mvd'
                              ? 'bg-orange-50/25 dark:bg-orange-950/15 hover:bg-orange-50/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <div className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              #{item.row_index}
                            </div>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                              PC {item.computer_no}
                            </span>
                          </td>

                          <td className="py-2 px-2.5 font-mono font-medium text-slate-900 dark:text-white whitespace-nowrap">
                            {item.sicil_no}
                          </td>

                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="font-medium text-slate-900 dark:text-white leading-tight">
                              {item.worker_name}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5">
                              {item.ad_soyad_tr || '-'}
                            </div>
                          </td>

                          <td className="py-2 px-2.5 whitespace-nowrap font-mono text-xs text-slate-800 dark:text-slate-200">
                            {item.pasaport_no ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                {item.pasaport_no}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2 px-2.5 whitespace-nowrap font-mono text-xs text-slate-800 dark:text-slate-200">
                            {item.rnr_no ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                {item.rnr_no}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <div className="font-medium text-slate-800 dark:text-slate-200 leading-tight">
                              {item.region}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5">{item.citizenship}</div>
                          </td>

                          <td className="py-2.5 px-2.5 whitespace-nowrap">
                            {item.application_no ? (
                              <div className="space-y-1">
                                <button
                                  onClick={() =>
                                    handleCopyText(item.application_no, `m3088-${item.sicil_no}`)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                                  title="Заявка № kopyala"
                                >
                                  <span>№ {item.application_no}</span>
                                  {copiedId === `m3088-${item.sicil_no}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 opacity-60" />
                                  )}
                                </button>
                                {item.hasPdf && item.pdf_filename ? (
                                  <a
                                    href={`/api/gosuslugi/pdf?filename=${encodeURIComponent(
                                      item.pdf_filename
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10.5px] text-teal-600 dark:text-teal-400 font-semibold hover:underline"
                                  >
                                    <FileText className="w-3 h-3" />
                                    PDF Aç
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                    <Zap className="w-2.5 h-2.5" />
                                    Hızlı Gönderim
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">Henüz Yok</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 max-w-[300px]">
                            {item.status_key === 'service_rendered' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                                <CheckCircle2 className="w-3 h-3" />
                                {item.gosuslugi_status}
                              </span>
                            ) : item.status_key === 'registered_mvd' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-[11px] font-bold">
                                🏛 {item.gosuslugi_status}
                              </span>
                            ) : item.status_key === 'sent_pending' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                                📤 {item.gosuslugi_status}
                              </span>
                            ) : item.status_key === 'refused_mvd' ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800 text-[11px] font-bold">
                                  🚫 {item.gosuslugi_status}
                                </span>
                                {item.refusalHint && (
                                  <div className="text-[10.5px] text-orange-700 dark:text-orange-300 line-clamp-2">
                                    🔍 {item.refusalHint}
                                  </div>
                                )}
                              </div>
                            ) : item.status_key === 'error' ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[11px] font-bold">
                                  ❌ {item.errorStepLabel || 'Ошибка'}
                                </span>
                                <div className="text-[10.5px] font-mono text-rose-700 dark:text-rose-300 line-clamp-2">
                                  {item.gosuslugi_status}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                                ⏳ {item.gosuslugi_status}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                            {item.submitted_at ? (
                              <div className="space-y-0.5">
                                <div className="text-slate-700 dark:text-slate-200">
                                  <span className="text-[10px] font-sans text-slate-400 mr-1">Gön:</span>
                                  {item.submitted_at}
                                </div>
                                <div
                                  className={
                                    item.response_at
                                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                      : 'text-slate-400'
                                  }
                                >
                                  <span className="text-[10px] font-sans text-slate-400 mr-1">Cvp:</span>
                                  {item.response_at || 'Bekleniyor'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            {histList.length === 0 ? (
                              <span className="text-[11px] text-slate-400">Henüz işlem yok</span>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  {item.had_previous_failure && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold">
                                      🔄 {histList.length} Adım
                                    </span>
                                  )}
                                  {histList.slice(0, isExpandedHist ? histList.length : 2).map((h) => {
                                    const stepCls =
                                      h.status_key === 'service_rendered'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                        : h.status_key === 'registered_mvd'
                                        ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800'
                                        : h.status_key === 'refused_mvd'
                                        ? 'bg-orange-50 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800'
                                        : h.status_key === 'error'
                                        ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                        : 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                                    return (
                                      <div
                                        key={`h-${item.sicil_no}-${h.stepNo}`}
                                        className={`px-2 py-0.5 rounded border text-[10.5px] font-medium flex items-center gap-1 ${stepCls}`}
                                      >
                                        <span className="font-bold">#{h.stepNo}</span>
                                        {h.application_no && (
                                          <span className="font-mono font-bold">№{h.application_no}</span>
                                        )}
                                        <span className="truncate max-w-[140px]">
                                          {h.status.replace(/^Ошибка:\s*/i, 'Ошибка')}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  {histList.length > 2 && (
                                    <button
                                      onClick={() =>
                                        setExpandedHistorySicil(isExpandedHist ? null : item.sicil_no)
                                      }
                                      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                    >
                                      {isExpandedHist ? 'Gizle' : `+${histList.length - 2} Adım`}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredMaster3088.length > masterVisibleCount && (
                <div className="pt-2 text-center flex items-center justify-center gap-2">
                  <button
                    onClick={() => setMasterVisibleCount((prev) => prev + 250)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    +250 Kayıt Daha Göster ({masterVisibleCount} / {filteredMaster3088.length})
                  </button>
                  <button
                    onClick={() => setMasterVisibleCount(filteredMaster3088.length)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                  >
                    Tümünü Göster ({filteredMaster3088.length})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 3: МВД RED ANALİZİ («Услуга отказана»)
          ===================================================================== */}
          {activeMainTab === 'refusals' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-orange-600" />
                    МВД Red («Услуга отказана») Nedenleri ve Çözüm Merkezi ({s.totalRefusedMvd ?? 0} Kayıt)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    МВД ЦБДУИГ (ГИСМУ) veritabanı analizine göre gruplanmış red nedenleri, şablon indirme ve tekrar gönderime açma
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRefusalFindings(!showRefusalFindings)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    {showRefusalFindings ? 'Analiz Bulgularını Gizle' : 'МВД Analiz Bulguları'}
                  </button>

                  <button
                    onClick={() =>
                      exportItemsToExcel(allRefusedItems, 'Pondera_VKS_Usluga_Otkazana_Detayli_Rapor')
                    }
                    disabled={!s.totalRefusedMvd}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Detaylı Excel İndir ({s.totalRefusedMvd ?? 0})
                  </button>

                  <a
                    href="/api/gosuslugi/master-list/export-errors?mode=refused&computer=all"
                    download
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-1.5 no-underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Renkli VKS Şablon İndir ({s.totalRefusedMvd ?? 0})
                  </a>
                </div>
              </div>

              {showRefusalFindings && (
                <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
                  <div className="font-bold text-amber-900 dark:text-amber-300">
                    📌 Canlı Veritabanı ve МВД (ЦБДУИГ) Analiz Bulguları:
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-[11.5px] leading-relaxed">
                    <li>
                      <strong>Pasaport Seri ve Numarası Birleşik Yazımı Hata Değildir:</strong> МВД tarafından onaylanan{' '}
                      <strong>{(s.totalServiceRendered ?? 0).toLocaleString('tr-TR')} adet «Услуга оказана»</strong>{' '}
                      başvurunun tamamında <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-slate-800">Серия паспорта</code> boş bırakılmış ve harf+rakam birleşik olarak <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-slate-800">Номер паспорта</code> alanında gönderilmiştir.
                    </li>
                    <li>
                      <strong>21 Ekim Sabahı МВД Sistem Çöküşü (03:27–11:25 MSK):</strong> МВД СМЭВ-3 servisi yanıt vermediği sırada gönderilen başvurular veri hatası olmaksızın otomatik red almıştır; doğrudan tekrar gönderime açılabilir.
                    </li>
                    <li>
                      <strong>Belge & Veri Kontrolleri:</strong> РНР Blank numarasının 7 haneli olması, yenilenmiş pasaportların güncellenmesi ve çeyrek içi maaş dönemlerinde boş ay kalmaması gerekmektedir.
                    </li>
                  </ul>
                </div>
              )}

              {!data?.refusalCategories || data.refusalCategories.length === 0 ? (
                <div className="p-8 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Şu anda aktif «Услуга отказана» (Red) kaydı bulunmuyor!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.refusalCategories.map((cat) => {
                    const isExpanded = expandedRefusalCatId === cat.id;
                    return (
                      <div
                        key={cat.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 overflow-hidden"
                      >
                        <div className="p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800">
                                {cat.stepLabel}
                              </span>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                {cat.titleTr}
                              </h3>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{cat.hintTr}</p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2 shrink-0">
                            <div className="text-right mr-2">
                              <div className="text-base sm:text-lg font-bold text-orange-700 dark:text-orange-400 leading-none">
                                {cat.count} kayıt
                              </div>
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">%{cat.percentage}</div>
                            </div>

                            <button
                              onClick={() =>
                                jumpToMasterListWithFilter({
                                  status: 'refused_mvd',
                                  refusalCat: cat.id,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-orange-400 cursor-pointer"
                            >
                              Listede Gör
                            </button>

                            <button
                              onClick={() =>
                                exportItemsToExcel(cat.items, `Pondera_VKS_Red_${cat.id}`)
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Excel ({cat.count})
                            </button>

                            <a
                              href={`/api/gosuslugi/master-list/export-errors?mode=refused&refusalCategory=${encodeURIComponent(cat.id)}&computer=all`}
                              download
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-1 no-underline"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Şablon İndir
                            </a>

                            {user?.role !== 'viewer' && (
                              <button
                                onClick={() =>
                                  handleReopenRefusedGroup(
                                    cat.items.map((it) => it.sicil_no),
                                    cat.titleTr
                                  )
                                }
                                disabled={reopeningRefused !== null}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 ${
                                    reopeningRefused === cat.titleTr ? 'animate-spin' : ''
                                  }`}
                                />
                                Tekrar Gönderime Aç
                              </button>
                            )}

                            <button
                              onClick={() => setExpandedRefusalCatId(isExpanded ? null : cat.id)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-200/70 dark:bg-slate-700/70 text-slate-800 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                            >
                              {isExpanded ? (
                                <>
                                  Gizle <ChevronUp className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  Kişiler ({cat.count}) <ChevronDown className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3 space-y-2 max-h-80 overflow-y-auto">
                            {cat.items.map((emp) => (
                              <div
                                key={`ref-${emp.sicil_no}-${emp.id}`}
                                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                      #{emp.sicil_no}
                                    </span>
                                    {emp.application_no && (
                                      <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300">
                                        № {emp.application_no}
                                      </span>
                                    )}
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      {emp.worker_name}
                                    </span>
                                    <span className="text-slate-500">({emp.region})</span>
                                  </div>
                                  {emp.refusalHint && (
                                    <div className="text-[11px] text-orange-800 dark:text-orange-300">
                                      🔎 {emp.refusalHint}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 font-mono">
                                  {emp.pasaport_no && <span>Pasp: {emp.pasaport_no}</span>}
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
          )}

          {/* =====================================================================
              TAB 4: HATA ANALİZİ («Ошибка»)
          ===================================================================== */}
          {activeMainTab === 'errors' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Hata Çeşitlerine Göre Kırılım</span>
                    <span className="font-mono text-xs sm:text-[13px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/80 px-2.5 py-0.5 rounded-lg border border-rose-200/80 dark:border-rose-800/80">
                      {s.totalErrors} Hatalı Kayıt
                    </span>
                  </h2>
                  <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 mt-0.5">
                    Zaman aşımı veya eksik/hatalı alan kaynaklı hataları grup bazında indirebilir veya doğrudan tekrar gönderime açabilirsiniz
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      exportItemsToExcel(allErrorItems, 'Pondera_VKS_Tum_Hatalar_Detayli_Rapor')
                    }
                    disabled={allErrorItems.length === 0}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Detaylı Excel İndir ({allErrorItems.length})
                  </button>

                  <a
                    href={errorTemplateExportUrl}
                    download
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 no-underline shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Renkli VKS Şablon İndir ({allErrorItems.length})
                  </a>

                  {user?.role !== 'viewer' && allErrorItems.length > 0 && (
                    <button
                      onClick={() =>
                        handleReopenErrorGroup(
                          allErrorItems.map((it) => it.sicil_no),
                          'Tüm Hatalı Kayıtlar'
                        )
                      }
                      disabled={reopeningError !== null}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${reopeningError !== null ? 'animate-spin' : ''}`}
                      />
                      Tümünü Tekrar Gönderime Aç ({allErrorItems.length})
                    </button>
                  )}
                </div>
              </div>

              {!data?.errorCategories || data.errorCategories.length === 0 ? (
                <div className="p-8 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Şu anda kayıtlı hiçbir hata (Ошибка) bulunmuyor!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.errorCategories.map((cat) => {
                    const isExpanded = expandedErrorCatId === cat.id;
                    return (
                      <div
                        key={cat.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 overflow-hidden"
                      >
                        <div className="p-3.5 sm:p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded border bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800">
                                {cat.stepLabel}
                              </span>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                {cat.titleTr}
                              </h3>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{cat.hintTr}</p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2 shrink-0">
                            <div className="text-right mr-2">
                              <div className="text-base sm:text-lg font-bold text-rose-700 dark:text-rose-400 leading-none">
                                {cat.count} kayıt
                              </div>
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">%{cat.percentage}</div>
                            </div>

                            <button
                              onClick={() =>
                                jumpToMasterListWithFilter({
                                  status: 'error',
                                  errorCat: cat.id,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-rose-400 cursor-pointer"
                            >
                              Listede Gör
                            </button>

                            <button
                              onClick={() =>
                                exportItemsToExcel(cat.items, `Pondera_VKS_Hata_${cat.id}`)
                              }
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Excel ({cat.count})
                            </button>

                            <a
                              href={`/api/gosuslugi/master-list/export-errors?mode=only_oshibka&errorCategory=${encodeURIComponent(cat.id)}&computer=all`}
                              download
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 no-underline shadow-xs"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Şablon İndir
                            </a>

                            {user?.role !== 'viewer' && (
                              <button
                                onClick={() =>
                                  handleReopenErrorGroup(
                                    cat.items.map((it) => it.sicil_no),
                                    cat.titleTr
                                  )
                                }
                                disabled={reopeningError !== null}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 ${
                                    reopeningError === cat.titleTr ? 'animate-spin' : ''
                                  }`}
                                />
                                Tekrar Gönderime Aç
                              </button>
                            )}

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
                                  Kişiler ({cat.count}) <ChevronDown className="w-3.5 h-3.5" />
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
                                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                      #{emp.sicil_no}
                                    </span>
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      {emp.worker_name}
                                    </span>
                                    <span className="text-slate-500">({emp.region})</span>
                                  </div>
                                  <div className="text-[11px] font-mono text-rose-700 dark:text-rose-300">
                                    {emp.gosuslugi_status}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 font-mono">
                                  {emp.pasaport_no && <span>Pasp: {emp.pasaport_no}</span>}
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
          )}
        </div>
      </div>
    </div>
  );
}
