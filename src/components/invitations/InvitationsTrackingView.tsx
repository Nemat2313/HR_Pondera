'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Mail,
  Send,
  FileText,
  CheckCircle2,
  Clock,
  Download,
  Search,
  RefreshCw,
  Upload,
  UserCheck,
  AlertTriangle,
  Link2,
  X,
  Info,
  Calendar,
  MapPin,
  ShieldCheck,
  Eye,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Filter,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface CandidateMatch {
  sicil_no: string;
  ad_soyad: string;
  tam_adi_kiril: string;
  uyruk: string;
  dogum_tarihi: string;
  pasaport_no: string;
  pasaport_verilis: string;
  dogum_yeri: string;
  genel_durum: string;
  region: string;
  proje_adi: string;
  score: number;
  reasons: string[];
}

interface InvitationRow {
  id: number;
  invitation_no: string;
  petition_no: string;
  petition_date: string;
  issuing_authority: string;
  birth_date: string;
  birth_place_ru: string;
  gender_ru: string;
  nationality_ru: string;
  nationality_tr: string;
  passport_masked: string;
  passport_last3: string;
  passport_issue_date: string;
  visa_category: string;
  visa_multiplicity: string;
  entry_from: string;
  stay_until: string;
  duration_days: number;
  visa_issuance_place: string;
  purpose_of_entry: string;
  invited_by: string;
  matched_sicil_no: string;
  matched_name: string;
  matched_kiril_name: string;
  matched_passport_full: string;
  matched_status: string;
  matched_region: string;
  matched_project: string;
  match_confidence: 'EXACT' | 'PARTIAL' | 'UNMATCHED' | 'MANUAL';
  match_reason: string;
  candidates: CandidateMatch[];
  pdf_filename: string;
  pdf_size_bytes: number;
  hasPdfOnDisk: boolean;
  email_received_iso: string;
  email_received_display: string;
  notified_email: number;
  notified_telegram: number;
}

interface SummaryInfo {
  total: number;
  matchedCount: number;
  unmatchedCount: number;
  pdfSavedCount: number;
  lastSyncAt: string;
}

export default function InvitationsTrackingView() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState<InvitationRow[]>([]);
  const [summary, setSummary] = useState<SummaryInfo>({
    total: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    pdfSavedCount: 0,
    lastSyncAt: '',
  });
  const [loading, setLoading] = useState(true);
  const [syncingImap, setSyncingImap] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  // Collapsible top explanation (hidden by default)
  const [showInfo, setShowInfo] = useState(false);

  // Table Filters
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'MATCHED' | 'UNMATCHED'>('ALL');
  const [nationalityFilter, setNationalityFilter] = useState<string>('ALL');
  const [purposeFilter, setPurposeFilter] = useState<'ALL' | 'WORK' | 'FAMILY'>('ALL');
  const [mailDateFilter, setMailDateFilter] = useState<string>('ALL');

  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null
  );

  // Manual Sicil Link Modal state
  const [linkingRow, setLinkingRow] = useState<InvitationRow | null>(null);
  const [manualSicilInput, setManualSicilInput] = useState('');
  const [linkingBusy, setLinkingBusy] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const fetchInvitations = async (autoSync = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invitations${autoSync ? '?autoSync=true' : ''}`);
      const json = await res.json();
      if (json?.success) {
        setRows(Array.isArray(json.data) ? json.data : []);
        if (json.summary) setSummary(json.summary);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations(false);
  }, []);

  const handleSyncZohoImap = async () => {
    setSyncingImap(true);
    setBanner(null);
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_imap', maxMessages: 80 }),
      });
      const json = await res.json();
      if (json?.success) {
        setBanner({ type: 'success', text: json.message });
        await fetchInvitations(false);
      } else {
        setBanner({
          type: 'error',
          text: json?.message || 'Zoho Mail posta kutusu taranamadı.',
        });
      }
    } catch {
      setBanner({ type: 'error', text: 'Zoho IMAP senkronizasyonu sırasında bağlantı hatası.' });
    } finally {
      setSyncingImap(false);
    }
  };

  const handleUploadPdfFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPdf(true);
    setBanner(null);

    let okCount = 0;
    let lastMsg = '';
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Read error'));
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/invitations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload_pdf',
            fileName: file.name,
            pdfBase64: base64,
          }),
        });
        const json = await res.json();
        if (json?.success) {
          okCount++;
          lastMsg = json.message;
        } else {
          lastMsg = json?.message || 'PDF yüklenemedi.';
        }
      } catch {
        // ignore single file failure
      }
    }

    if (pdfInputRef.current) pdfInputRef.current.value = '';
    setUploadingPdf(false);
    if (okCount > 0) {
      setBanner({
        type: 'success',
        text:
          files.length === 1
            ? lastMsg
            : `${okCount}/${files.length} adet davetiye PDF dosyası başarıyla okundu ve kaydedildi.`,
      });
      await fetchInvitations(false);
    } else {
      setBanner({ type: 'error', text: lastMsg || 'PDF davetiye okunamadı.' });
    }
  };

  const handleRematchAll = async () => {
    setRematching(true);
    setBanner(null);
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rematch_all' }),
      });
      const json = await res.json();
      if (json?.success) {
        setBanner({ type: 'success', text: json.message });
        await fetchInvitations(false);
      }
    } catch {
      setBanner({ type: 'error', text: 'Yeniden eşleştirme sırasında hata oluştu.' });
    } finally {
      setRematching(false);
    }
  };

  const handleSendDailyReport = async () => {
    setSendingReport(true);
    setBanner(null);
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_daily_notification', onlyUnnotifiedOrYesterday: false }),
      });
      const json = await res.json();
      if (json?.success) {
        setBanner({
          type: 'success',
          text: `Gelen davetiyeler özeti (${json.count} kayıt) E-posta ve Telegram ile gönderildi! (${json.message})`,
        });
        await fetchInvitations(false);
      } else {
        setBanner({
          type: 'error',
          text: json?.message || 'Bildirim gönderilemedi.',
        });
      }
    } catch {
      setBanner({ type: 'error', text: 'Bildirim gönderimi sırasında hata oluştu.' });
    } finally {
      setSendingReport(false);
    }
  };

  const handleManualLinkSubmit = async (sicilToLink: string) => {
    if (!linkingRow || !sicilToLink.trim()) return;
    setLinkingBusy(true);
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'manual_link',
          invitation_no: linkingRow.invitation_no,
          sicil_no: sicilToLink.trim(),
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setBanner({ type: 'success', text: json.message });
        setLinkingRow(null);
        setManualSicilInput('');
        await fetchInvitations(false);
      } else {
        setBanner({ type: 'error', text: json?.message || 'Sicil bağlanamadı.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Sicil bağlama hatası.' });
    } finally {
      setLinkingBusy(false);
    }
  };

  // Distinct filter options
  const nationalityOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.nationality_tr) set.add(r.nationality_tr);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [rows]);

  const mailDateOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.email_received_iso) set.add(r.email_received_iso);
    });
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterMode === 'MATCHED' && !r.matched_sicil_no) return false;
      if (filterMode === 'UNMATCHED' && r.matched_sicil_no) return false;
      if (nationalityFilter !== 'ALL' && r.nationality_tr !== nationalityFilter) return false;
      if (purposeFilter === 'FAMILY' && !String(r.purpose_of_entry || '').toUpperCase().includes('ЧЛЕН СЕМЬИ')) {
        return false;
      }
      if (purposeFilter === 'WORK' && String(r.purpose_of_entry || '').toUpperCase().includes('ЧЛЕН СЕМЬИ')) {
        return false;
      }
      if (mailDateFilter !== 'ALL' && r.email_received_iso !== mailDateFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.invitation_no.toLowerCase().includes(q) ||
        r.petition_no.toLowerCase().includes(q) ||
        r.matched_sicil_no.toLowerCase().includes(q) ||
        r.matched_name.toLowerCase().includes(q) ||
        r.matched_kiril_name.toLowerCase().includes(q) ||
        r.passport_masked.toLowerCase().includes(q) ||
        r.passport_last3.toLowerCase().includes(q) ||
        r.birth_date.toLowerCase().includes(q) ||
        r.birth_place_ru.toLowerCase().includes(q) ||
        r.nationality_tr.toLowerCase().includes(q) ||
        r.visa_issuance_place.toLowerCase().includes(q) ||
        r.pdf_filename.toLowerCase().includes(q)
      );
    });
  }, [rows, filterMode, nationalityFilter, purposeFilter, mailDateFilter, search]);

  const hasActiveFilters =
    filterMode !== 'ALL' ||
    nationalityFilter !== 'ALL' ||
    purposeFilter !== 'ALL' ||
    mailDateFilter !== 'ALL' ||
    Boolean(search.trim());

  const handleExportExcel = () => {
    const exportData = filtered.map((item, idx) => ({
      'Sıra No': idx + 1,
      'Mail Tarihi': item.email_received_display || item.email_received_iso || '—',
      'Davetiye No (Номер приглашения)': item.invitation_no,
      'Başvuru No (Ходатайство)': item.petition_no || '—',
      'Başvuru Tarihi': item.petition_date || '—',
      'Eşleşen Sicil No': item.matched_sicil_no || 'Bekleniyor (Yeni Aday)',
      'Ad Soyad (Latin)': item.matched_name || '—',
      'Ad Soyad (Kiril)': item.matched_kiril_name || '—',
      'Personel Durumu': item.matched_status || '—',
      'Bölge / Şantiye': item.matched_region || item.matched_project || '—',
      'Eşleşme Açıklaması': item.match_reason || '—',
      'Maskeli Pasaport No': item.passport_masked || `*****${item.passport_last3}`,
      'Pasaport Son 3 Hane': item.passport_last3 || '—',
      'Tam Pasaport No': item.matched_passport_full || '—',
      'Pasaport Veriliş Tarihi': item.passport_issue_date || '—',
      'Doğum Tarihi': item.birth_date || '—',
      'Doğum Yeri (Kiril)': item.birth_place_ru || '—',
      'Uyruk (TR)': item.nationality_tr || '—',
      'Uyruk (RU)': item.nationality_ru || '—',
      'Cinsiyet': item.gender_ru || 'МУЖ',
      'Vize Kategorisi': item.visa_category || 'ОБЫКНОВЕННАЯ РАБОЧАЯ [ОР]',
      'Vize Giriş Hakkı': item.visa_multiplicity || 'ОДНОКРАТНАЯ [О]',
      'Giriş Tarihi (Въезд с)': item.entry_from || '—',
      'Kalış Bitiş (Пребывание по)': item.stay_until || '—',
      'Süre (Gün)': item.duration_days || 90,
      'Vize Veriliş Yeri (Konsolosluk)': item.visa_issuance_place || '—',
      'Geliş Amacı (Цель поездки)': item.purpose_of_entry || 'ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ',
      'Veren Makam': item.issuing_authority || 'УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ',
      'Arşiv PDF Dosya Adı': item.pdf_filename || '—',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MVD_Davetiye_Listesi');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Pondera_MVD_Davetiye_Listesi_${dateStr}.xlsx`);
  };

  const formatKb = (bytes: number) => {
    if (!bytes || bytes <= 0) return '165 KB';
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-4 font-normal max-w-[1440px] mx-auto">
      {/* Hidden PDF Upload Input */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        onChange={handleUploadPdfFiles}
        className="hidden"
      />

      {/* Top Header Banner (Compact with collapsible explanation) */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-sky-50/90 via-white to-indigo-50/60 dark:from-slate-900 dark:via-sky-950/80 dark:to-slate-900 border border-sky-200/80 dark:border-slate-800 text-slate-900 dark:text-white shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-400/30 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-normal tracking-tight text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Учет электронных приглашений МВД (Авто-Почта & PDF Архив)'
                  : 'Davetiye Takip (MVD Elektronik Giriş Davetiyeleri & PDF Arşivi)'}
              </h1>
              <span className="px-2.5 py-0.5 text-[10.5px] rounded-full bg-emerald-100 dark:bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-400/30">
                {lang === 'ru' ? 'ikbildirim@pondera.ru • Активно' : 'ikbildirim@pondera.ru • Canlı'}
              </span>
              <button
                type="button"
                onClick={() => setShowInfo((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-100/80 hover:bg-sky-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-slate-700 text-[11px] transition cursor-pointer"
              >
                <Info className="w-3 h-3" />
                <span>{showInfo ? 'Açıklamayı Gizle' : 'Nasıl Çalışır?'}</span>
                {showInfo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncingImap}
              onClick={handleSyncZohoImap}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-300 dark:border-sky-500/40 bg-sky-100/90 hover:bg-sky-200/80 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 text-sky-950 dark:text-sky-100 text-xs font-semibold transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-sky-700 dark:text-sky-300 ${syncingImap ? 'animate-spin' : ''}`}
              />
              <span>
                {syncingImap
                  ? 'Posta Kutusu Taranıyor...'
                  : lang === 'ru'
                  ? 'Проверить почту (ikbildirim)'
                  : 'Zoho Mail (ikbildirim) Tara'}
              </span>
            </button>

            <button
              type="button"
              disabled={uploadingPdf}
              onClick={() => pdfInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-300 dark:border-indigo-500/40 bg-indigo-100/90 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 text-xs font-semibold transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
              <span>
                {uploadingPdf
                  ? 'PDF Okunuyor...'
                  : lang === 'ru'
                  ? 'Загрузить PDF приглашения'
                  : 'Davetiye PDF Yükle (.pdf)'}
              </span>
            </button>

            <button
              type="button"
              disabled={rematching}
              onClick={handleRematchAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/90 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 text-xs font-semibold transition-all cursor-pointer shadow-2xs disabled:opacity-60"
              title="Yeni eBA Excel yüklendiğinde tüm davetiyeleri tüm personel listesinde tekrar eşleştirir"
            >
              <UserCheck
                className={`w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300 ${rematching ? 'animate-spin' : ''}`}
              />
              <span>
                {lang === 'ru' ? 'Сверить со всеми сотрудниками' : 'Tüm Personelde Eşleştir'}
              </span>
            </button>

            <button
              type="button"
              disabled={sendingReport}
              onClick={handleSendDailyReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-100/90 hover:bg-amber-200/80 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-950 dark:text-amber-100 text-xs font-semibold transition-all cursor-pointer shadow-2xs disabled:opacity-60"
              title="Her sabah 09:10'da otomatik gönderilen davetiye özetini şimdi E-posta ve Telegram ile gönderir"
            >
              <Send className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
              <span>
                {sendingReport
                  ? 'Gönderiliyor...'
                  : lang === 'ru'
                  ? 'Отправить сводку (Почта + TG)'
                  : 'Özeti Mail & TG Gönder'}
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible Explanation (Hidden unless user clicks "Nasıl Çalışır?") */}
        {showInfo && (
          <div className="p-3.5 rounded-2xl bg-sky-50/80 dark:bg-white/5 border border-sky-200/70 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 space-y-2">
            <p className="leading-relaxed">
              {lang === 'ru'
                ? 'Автоматическое получение электронных приглашений МВД из почты ikbildirim@pondera.ru, сверка со всем списком сотрудников (по последним 3 цифрам паспорта, дате/месту рождения и дате выдачи паспорта), переименование PDF по табельному номеру и ФИО, а также ежедневная утренняя рассылка.'
                : 'invitation@pondera.ru adresinden ikbildirim@pondera.ru posta kutusuna yönlendirilen MVD elektronik davetiyelerini (PDF) otomatik çeker; pasaport son 3 hanesi (*410), doğum tarihi, doğum yeri (Kiril) ve pasaport veriliş tarihinden tüm personel listemizde eşleştirip PDF dosyasını {Sicil}_{Ad_Soyad}.pdf olarak sunucuda arşivler.'}
            </p>
            <div className="leading-relaxed pt-1 border-t border-sky-200/60 dark:border-white/10">
              <strong>Eşleştirme Yöntemi & Sunucu Arşivi:</strong> MVD elektronik davetiyelerinde gizlilik gereği ad-soyad yer almaz;{' '}
              <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300">
                01.01.2000, РЕСПУБЛИКА ИНДИЯ, ДЖАУНПУР УТТАР ПРАДЕШ
              </code>{' '}
              ifadesindeki <strong>ДЖАУНПУР УТТАР ПРАДЕШ</strong> (Jaunpur, Uttar Pradesh) personelin{' '}
              <strong>Doğum Yeri</strong> bilgisidir. Tüm personel veritabanımızda da çalışanların Kiril{' '}
              <strong>Doğum Yeri</strong>, <strong>Doğum Tarihi</strong>,{' '}
              <strong>Pasaport Son 3 Hanesi (*410)</strong> ve{' '}
              <strong>Pasaport Veriliş Tarihi (12.10.2020)</strong> kayıtlı olduğu için sistem bu 4 alanı çapraz karşılaştırarak sicili otomatik bulur. Her PDF (~165 KB) sunucu diskinde hiç yük oluşturmadan{' '}
              <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300">
                {'{Sicil_No}_{Ad_Soyad}_{Davetiye_No}.pdf'}
              </code>{' '}
              adıyla saklanır ve her sabah <strong>09:10&apos;da</strong> dün gelen davetiyelerin listesi otomatik e-posta & Telegram olarak paylaşılır.
            </div>
          </div>
        )}

        {banner && (
          <div
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center justify-between border ${
              banner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : banner.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                : 'bg-sky-50 dark:bg-sky-950/70 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800'
            }`}
          >
            <span>{banner.text}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-[11px] underline ml-3 cursor-pointer"
            >
              Kapat
            </button>
          </div>
        )}
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => setFilterMode('ALL')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-2xs space-y-1 ${
            filterMode === 'ALL'
              ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-400 dark:border-sky-600'
              : 'bg-white dark:bg-[#131C31] border-slate-200 dark:border-slate-800 hover:border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Всего приглашений МВД' : 'Toplam Gelen MVD Davetiyesi'}</span>
            <FileText className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white">
            {summary.total} <span className="text-xs text-slate-400">Adet PDF</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Sunucuda Arşivli PDF: <strong>{summary.pdfSavedCount}</strong> (~{summary.total * 165} KB)
          </div>
        </div>

        <div
          onClick={() => setFilterMode('MATCHED')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-2xs space-y-1 ${
            filterMode === 'MATCHED'
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600'
              : 'bg-white dark:bg-[#131C31] border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Сопоставлено с таб. №' : 'Sicil & Ad Soyad Eşleşen'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400">
            {summary.matchedCount} <span className="text-xs text-slate-400">Personel</span>
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
            PDF adı otomatik {'{Sicil}_{Ad_Soyad}.pdf'} yapıldı
          </div>
        </div>

        <div
          onClick={() => setFilterMode('UNMATCHED')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-2xs space-y-1 ${
            filterMode === 'UNMATCHED'
              ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600'
              : 'bg-white dark:bg-[#131C31] border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Новые кандидаты (Ждут таб. №)' : 'Yeni Aday (eBA Sicili Bekleyen)'}</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl text-amber-600 dark:text-amber-400">
            {summary.unmatchedCount} <span className="text-xs text-slate-400">Aday</span>
          </div>
          <div className="text-[11px] text-amber-700 dark:text-amber-300">
            eBA&apos;ya girildiğinde veya manuel seçimle sicile bağlanır
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Ежедневная рассылка' : 'Sabah Otomatik Mail & TG Bildirimi'}</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-lg text-indigo-600 dark:text-indigo-400 font-semibold">
            Her Sabah 09:10 (MSK)
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {summary.lastSyncAt
              ? `Son Mail Tarama: ${new Date(summary.lastSyncAt).toLocaleString('tr-TR')}`
              : 'Her 15 dk otomatik Zoho IMAP kontrolü'}
          </div>
        </div>
      </div>

      {/* Main MVD Invitations Table Card */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3.5">
        {/* Table Title + Filters + Search + Excel Export */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {lang === 'ru'
                ? 'Реестр электронных приглашений МВД РФ'
                : 'MVD Elektronik Giriş Davetiyeleri Tablosu'}
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              {filtered.length} Kayıt
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterMode('ALL');
                  setNationalityFilter('ALL');
                  setPurposeFilter('ALL');
                  setMailDateFilter('ALL');
                  setSearch('');
                }}
                className="text-[11px] px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as 'ALL' | 'MATCHED' | 'UNMATCHED')}
                className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Tüm Durumlar ({rows.length})</option>
                <option value="MATCHED">Sicil Eşleşenler ({summary.matchedCount})</option>
                <option value="UNMATCHED">Bekleyen Adaylar ({summary.unmatchedCount})</option>
              </select>
            </div>

            {/* Nationality Filter */}
            <select
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Tüm Uyruklar</option>
              {nationalityOptions.map((nat) => (
                <option key={nat} value={nat}>
                  {nat}
                </option>
              ))}
            </select>

            {/* Purpose Filter */}
            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value as 'ALL' | 'WORK' | 'FAMILY')}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Tüm Geliş Amaçları</option>
              <option value="WORK">Çalışma (Трудовая)</option>
              <option value="FAMILY">Aile Üyesi (Член семьи)</option>
            </select>

            {/* Mail Date Filter */}
            <select
              value={mailDateFilter}
              onChange={(e) => setMailDateFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Tüm Mail Tarihleri</option>
              {mailDateOptions.map((dt) => (
                <option key={dt} value={dt}>
                  Mail: {dt.split('-').reverse().join('.')}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative min-w-[230px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === 'ru'
                    ? 'Поиск: № приглашения, *410, ФИО...'
                    : 'Davetiye no, *410, sicil, isim, şehir...'
                }
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-sky-500"
              />
            </div>

            {/* Excel Export Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer shadow-2xs disabled:opacity-50"
              title="Tablodaki davetiye listesini Excel (.xlsx) olarak indir"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel İndir (.xlsx)</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/90 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-normal whitespace-nowrap">Mail Tarihi</th>
                <th className="py-2.5 px-3 font-normal whitespace-nowrap">Davetiye & Başvuru (Ходатайство)</th>
                <th className="py-2.5 px-3 font-normal">Eşleşen Personel (Tüm Personel)</th>
                <th className="py-2.5 px-3 font-normal whitespace-nowrap">Pasaport (*Son 3) & Veriliş</th>
                <th className="py-2.5 px-3 font-normal">Doğum Tarihi & Doğum Yeri (Kiril)</th>
                <th className="py-2.5 px-3 font-normal whitespace-nowrap">Uyruk & Cinsiyet</th>
                <th className="py-2.5 px-3 font-normal whitespace-nowrap">Vize & Giriş-Çıkış Dönemi</th>
                <th className="py-2.5 px-3 font-normal">Konsolosluk & Geliş Amacı</th>
                <th className="py-2.5 px-3 text-right font-normal whitespace-nowrap">Arşiv PDF Dosyası</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                    Davetiyeler yükleniyor...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                    Arama veya filtre kriterine uygun MVD davetiyesi bulunamadı.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const candidateCount = item.candidates?.length || 0;
                  const isFamily = String(item.purpose_of_entry || '')
                    .toUpperCase()
                    .includes('ЧЛЕН СЕМЬИ');

                  return (
                    <tr
                      key={item.invitation_no}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors align-middle"
                    >
                      {/* 1. Separate Mail Date Column (max 2 lines) */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-800 dark:text-slate-200 leading-tight">
                          {item.email_received_display
                            ? item.email_received_display.split(' ')[0]
                            : item.email_received_iso}
                        </div>
                        <div className="text-[10.5px] text-slate-400 leading-tight">
                          {item.email_received_display?.split(' ')[1] || 'ikbildirim'}
                        </div>
                      </td>

                      {/* 2. Invitation No & Petition No (max 2 lines) */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-300 leading-tight">
                          № {item.invitation_no}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                          Ходатайство: <span className="font-mono">{item.petition_no || '—'}</span>
                          {item.petition_date ? ` (${item.petition_date})` : ''}
                        </div>
                      </td>

                      {/* 3. Matched Employee from All Personnel (strictly max 3 lines) */}
                      <td className="py-2 px-3 max-w-[250px]">
                        {item.matched_sicil_no ? (
                          <div className="leading-tight space-y-0.5" title={item.match_reason}>
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-mono text-[10.5px] font-semibold shrink-0">
                                #{item.matched_sicil_no}
                              </span>
                              <span className="text-slate-900 dark:text-white font-semibold truncate">
                                {item.matched_name}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setLinkingRow(item);
                                  setManualSicilInput(item.matched_sicil_no);
                                }}
                                className="text-[10px] text-sky-600 dark:text-sky-400 underline cursor-pointer shrink-0 ml-auto"
                              >
                                Değiştir
                              </button>
                            </div>
                            {item.matched_kiril_name && (
                              <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                {item.matched_kiril_name}
                              </div>
                            )}
                            <div className="text-[10.5px] text-indigo-600 dark:text-indigo-400 truncate">
                              {item.matched_region} • {item.matched_status}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] border ${
                                isFamily
                                  ? 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-500/30'
                                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                              }`}
                            >
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>{isFamily ? 'Aile Üyesi' : 'Yeni Aday'}</span>
                            </span>

                            {/* Compact "2 Aday" button with rich hover explanation popover */}
                            <div className="relative group inline-block">
                              <button
                                type="button"
                                onClick={() => {
                                  setLinkingRow(item);
                                  setManualSicilInput('');
                                }}
                                title={`${item.match_reason} — Sicil bağlamak veya adayları görmek için tıklayın`}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 text-[11px] font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition cursor-pointer"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>{candidateCount > 0 ? `${candidateCount} Aday` : 'Sicil Bağla'}</span>
                              </button>

                              {/* Hover Popover Card */}
                              <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-0 bottom-full mb-1.5 z-40 w-72 p-2.5 rounded-xl bg-slate-900 text-white text-[11px] leading-snug shadow-xl border border-slate-700">
                                <div className="font-semibold text-amber-300 mb-1">
                                  Eşleşme & Sicil Bağlama Bilgisi:
                                </div>
                                <div className="text-slate-200">{item.match_reason}</div>
                                <div className="text-sky-300 mt-1.5 pt-1 border-t border-slate-700/80">
                                  🖱️ Tıklayarak {candidateCount} olası adayı inceleyebilir veya sicil numarasıyla personele bağlayabilirsiniz.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 4. Passport Masked (*410) & Issue Date (max 2-3 lines) */}
                      <td className="py-2 px-3 whitespace-nowrap leading-tight">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.2 rounded">
                            {item.passport_masked || `*****${item.passport_last3}`}
                          </span>
                          {item.matched_passport_full && (
                            <span className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-mono">
                              ({item.matched_passport_full})
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Veriliş: <strong>{item.passport_issue_date || '—'}</strong>
                        </div>
                      </td>

                      {/* 5. Date of Birth & Place of Birth (Cyrillic, max 3 lines wrap) */}
                      <td className="py-2 px-3 max-w-[220px] leading-tight">
                        <div className="text-slate-900 dark:text-white font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>{item.birth_date || '—'}</span>
                        </div>
                        <div
                          className="text-[10.5px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2 break-words"
                          title={item.birth_place_ru}
                        >
                          {item.birth_place_ru || '—'}
                        </div>
                      </td>

                      {/* 6. Nationality & Gender (max 2 lines) */}
                      <td className="py-2 px-3 whitespace-nowrap leading-tight">
                        <div className="text-slate-900 dark:text-white font-medium">
                          {item.nationality_tr}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.nationality_ru} • <strong>{item.gender_ru || 'МУЖ'}</strong>
                        </div>
                      </td>

                      {/* 7. Visa Category, Multiplicity & Entry/Stay Dates (max 3 lines) */}
                      <td className="py-2 px-3 whitespace-nowrap leading-tight">
                        <div className="text-[10.5px] text-indigo-700 dark:text-indigo-300 font-medium">
                          {item.visa_category || 'ОБЫКНОВЕННАЯ РАБОЧАЯ [ОР]'}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          {item.visa_multiplicity || 'ОДНОКРАТНАЯ [О]'} •{' '}
                          <strong>{item.duration_days || 90} Gün</strong>
                        </div>
                        <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-medium">
                          {item.entry_from || '—'} → {item.stay_until || '—'}
                        </div>
                      </td>

                      {/* 8. Consulate & Purpose of Entry (max 3 lines wrap) */}
                      <td className="py-2 px-3 max-w-[190px] leading-tight">
                        <div className="text-slate-800 dark:text-slate-200 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="truncate" title={item.visa_issuance_place}>
                            {item.visa_issuance_place || '—'}
                          </span>
                        </div>
                        <div
                          className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
                          title={item.purpose_of_entry}
                        >
                          {item.purpose_of_entry || 'ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ'}
                        </div>
                        <div
                          className="text-[9.5px] text-slate-400 truncate"
                          title={item.issuing_authority}
                        >
                          {item.issuing_authority || 'УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ'}
                        </div>
                      </td>

                      {/* 9. PDF Filename & Download / Preview (max 2 lines) */}
                      <td className="py-2 px-3 text-right whitespace-nowrap leading-tight">
                        <div className="space-y-1 flex flex-col items-end">
                          <div
                            className="font-mono text-[10px] text-slate-600 dark:text-slate-300 max-w-[195px] truncate"
                            title={item.pdf_filename}
                          >
                            {item.pdf_filename}
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={`/api/invitations/pdf?invitation_no=${encodeURIComponent(item.invitation_no)}&inline=true`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10.5px] hover:bg-slate-200 transition"
                              title="PDF Davetiyeyi Yeni Sekmede Gör"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Gör</span>
                            </a>
                            <a
                              href={`/api/invitations/pdf?invitation_no=${encodeURIComponent(item.invitation_no)}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/70 text-[10.5px] font-medium hover:bg-sky-100 transition"
                              title="PDF Davetiyeyi İndir"
                            >
                              <Download className="w-3 h-3" />
                              <span>İndir ({formatKb(item.pdf_size_bytes)})</span>
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal to Link Employee Sicil or Pick from All Personnel Candidates */}
      {linkingRow && (
        <div
          onClick={() => setLinkingRow(null)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-slate-900 dark:text-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-semibold">
                  Davetiye № {linkingRow.invitation_no} — Personel Sicili Bağla
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pasaport: <strong>{linkingRow.passport_masked}</strong> (Veriliş:{' '}
                  {linkingRow.passport_issue_date || '—'}) • Doğum:{' '}
                  <strong>{linkingRow.birth_date || '—'}</strong> ({linkingRow.birth_place_ru})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkingRow(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Direct Sicil Input */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-xs text-slate-700 dark:text-slate-300">
                Personel Sicil Numarası Girerek Bağla (PDF adı otomatik{' '}
                <code>{'{Sicil}_{Ad_Soyad}.pdf'}</code> olur):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualSicilInput}
                  onChange={(e) => setManualSicilInput(e.target.value)}
                  placeholder="Örn: 932397"
                  className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
                <button
                  type="button"
                  disabled={linkingBusy || !manualSicilInput.trim()}
                  onClick={() => handleManualLinkSubmit(manualSicilInput)}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {linkingBusy ? 'Bağlanıyor...' : 'Sicili Bağla'}
                </button>
              </div>
            </div>

            {/* Candidate Suggestions with Same Passport Last 3 Digits */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Tüm Personel Listesinde Pasaport Sonu <code>*{linkingRow.passport_last3}</code> Olan Adaylar:
              </div>
              {Array.isArray(linkingRow.candidates) && linkingRow.candidates.length > 0 ? (
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                  {linkingRow.candidates.map((cand) => (
                    <div
                      key={cand.sicil_no}
                      className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          #{cand.sicil_no} — {cand.ad_soyad}{' '}
                          <span className="text-[11px] text-slate-500">({cand.genel_durum})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Pasaport: <strong>{cand.pasaport_no}</strong> (Veriliş:{' '}
                          {cand.pasaport_verilis || '—'}) • Doğum: <strong>{cand.dogum_tarihi}</strong> •{' '}
                          {cand.dogum_yeri || cand.uyruk}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleManualLinkSubmit(cand.sicil_no)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium shrink-0 cursor-pointer"
                      >
                        Seç & Bağla
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs text-slate-500">
                  Tüm personel listesinde bu pasaport son 3 hanesine sahip kayıt bulunamadı. Aday eBA&apos;ya eklendiğinde otomatik eşleşecektir.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
