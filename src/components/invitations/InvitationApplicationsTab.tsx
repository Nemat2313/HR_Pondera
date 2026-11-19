'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Plus,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Edit3,
  Trash2,
  X,
  Loader2,
  UserSearch,
  Save,
  Link2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { InvitationApplicationRecord } from '@/lib/invitationApplicationsManager';

interface AppsSummary {
  total: number;
  arrivedCount: number;
  waitingCount: number;
  overdueCount: number;
  vksCount: number;
  quotaCount: number;
  withSicilCount: number;
  lastFileName: string;
  lastUpdatedAt: string;
}

interface AppsApiResponse {
  success: boolean;
  canEdit: boolean;
  message?: string;
  summary: AppsSummary;
  filterOptions: {
    cities: string[];
    citizenships: string[];
  };
  data: InvitationApplicationRecord[];
}

interface InvitationApplicationsTabProps {
  onSyncedWithMvd?: () => void;
}

export default function InvitationApplicationsTab({
  onSyncedWithMvd,
}: InvitationApplicationsTabProps) {
  const { lang } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [payload, setPayload] = useState<AppsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ARRIVED' | 'WAITING' | 'OVERDUE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'VKS' | 'KOTA'>('ALL');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookingUpSicil, setLookingUpSicil] = useState(false);
  const [form, setForm] = useState({
    id: 0,
    sicil_no: '',
    fio_kiril: '',
    fio_latin: '',
    opis_no: '',
    app_date: '',
    entry_from: '',
    visa_end: '',
    visa_multiplicity: 'МНОГОКРАТНАЯ',
    passport_no: '',
    passport_issue_date: '',
    passport_expiry_date: '',
    birth_date: '',
    gender: 'мужской',
    citizenship: '',
    consulate_city: '',
    destination_city: '',
    ig_category: 'VKS',
    comments: '',
  });

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invitations/applications', { cache: 'no-store' });
      const json = (await res.json()) as AppsApiResponse;
      if (res.ok && json.success) {
        setPayload(json);
      } else {
        setBanner({ type: 'error', text: json.message || 'Başvuru listesi yüklenemedi.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Sunucu bağlantı hatası.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/invitations/applications', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as AppsApiResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Excel yüklenemedi.');
      }
      setPayload((prev) => ({ ...json, canEdit: prev?.canEdit ?? true }));
      setBanner({ type: 'success', text: json.message || 'Excel başarıyla aktarıldı.' });
      onSyncedWithMvd?.();
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Excel yükleme hatası.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRunSync = async () => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await fetch('/api/invitations/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const json = (await res.json()) as AppsApiResponse;
      if (!res.ok || !json.success) throw new Error(json.message || 'Eşleştirme başarısız.');
      setPayload((prev) => ({ ...json, canEdit: prev?.canEdit ?? true }));
      setBanner({ type: 'success', text: json.message || 'Eşleştirme tamamlandı.' });
      onSyncedWithMvd?.();
    } catch (err: unknown) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Hata oluştu.' });
    } finally {
      setSyncing(false);
    }
  };

  const openNewModal = () => {
    setForm({
      id: 0,
      sicil_no: '',
      fio_kiril: '',
      fio_latin: '',
      opis_no: '',
      app_date: new Date().toLocaleDateString('tr-TR'),
      entry_from: '',
      visa_end: '',
      visa_multiplicity: 'МНОГОКРАТНАЯ',
      passport_no: '',
      passport_issue_date: '',
      passport_expiry_date: '',
      birth_date: '',
      gender: 'мужской',
      citizenship: '',
      consulate_city: '',
      destination_city: '',
      ig_category: 'VKS',
      comments: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (row: InvitationApplicationRecord) => {
    setForm({
      id: row.id,
      sicil_no: row.sicil_no || '',
      fio_kiril: row.fio_kiril || '',
      fio_latin: row.fio_latin || '',
      opis_no: row.opis_no || '',
      app_date: row.app_date || '',
      entry_from: row.entry_from || '',
      visa_end: row.visa_end || '',
      visa_multiplicity: row.visa_multiplicity || 'МНОГОКРАТНАЯ',
      passport_no: row.passport_no || '',
      passport_issue_date: row.passport_issue_date || '',
      passport_expiry_date: row.passport_expiry_date || '',
      birth_date: row.birth_date || '',
      gender: row.gender || 'мужской',
      citizenship: row.citizenship || '',
      consulate_city: row.consulate_city || '',
      destination_city: row.destination_city || '',
      ig_category: row.ig_category || 'VKS',
      comments: row.comments || '',
    });
    setModalOpen(true);
  };

  const handleLookupSicil = async () => {
    if (!form.sicil_no.trim()) return;
    setLookingUpSicil(true);
    try {
      const res = await fetch('/api/invitations/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lookup_sicil', sicil_no: form.sicil_no.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.employee) {
        const emp = json.employee;
        setForm((prev) => ({
          ...prev,
          fio_latin: emp.fio_latin || prev.fio_latin,
          fio_kiril: emp.fio_kiril || prev.fio_kiril,
          passport_no: emp.passport_no || prev.passport_no,
          passport_issue_date: emp.passport_issue_date || prev.passport_issue_date,
          passport_expiry_date: emp.passport_expiry_date || prev.passport_expiry_date,
          birth_date: emp.birth_date || prev.birth_date,
          gender: emp.gender || prev.gender,
          citizenship: emp.citizenship || prev.citizenship,
          destination_city: emp.destination_city || prev.destination_city,
        }));
      } else {
        setBanner({ type: 'error', text: json.message || 'Sicil bulunamadı.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Sicil sorgulama hatası.' });
    } finally {
      setLookingUpSicil(false);
    }
  };

  const handleSaveManual = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/invitations/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upsert_manual', ...form }),
      });
      const json = (await res.json()) as AppsApiResponse;
      if (!res.ok || !json.success) throw new Error(json.message || 'Kaydedilemedi.');
      setPayload((prev) => ({ ...json, canEdit: prev?.canEdit ?? true }));
      setBanner({ type: 'success', text: json.message || 'Kaydedildi.' });
      setModalOpen(false);
      onSyncedWithMvd?.();
    } catch (err: unknown) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Kayıt hatası.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRow = async (id: number) => {
    try {
      const res = await fetch('/api/invitations/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const json = (await res.json()) as AppsApiResponse;
      if (res.ok && json.success) {
        setPayload((prev) => ({ ...json, canEdit: prev?.canEdit ?? true }));
        setBanner({ type: 'success', text: json.message || 'Silindi.' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Silme hatası.' });
    }
  };

  const filteredRows = useMemo(() => {
    const list = payload?.data || [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter === 'ARRIVED' && r.status_key !== 'ARRIVED') return false;
      if (statusFilter === 'WAITING' && r.status_key === 'ARRIVED') return false;
      if (statusFilter === 'OVERDUE' && r.status_key !== 'OVERDUE') return false;
      if (categoryFilter === 'VKS' && r.ig_category !== 'VKS') return false;
      if (categoryFilter === 'KOTA' && r.ig_category === 'VKS') return false;
      if (cityFilter !== 'ALL' && r.destination_city !== cityFilter) return false;
      if (!q) return true;
      return (
        r.sicil_no.toLowerCase().includes(q) ||
        r.fio_kiril.toLowerCase().includes(q) ||
        r.fio_latin.toLowerCase().includes(q) ||
        r.passport_no.toLowerCase().includes(q) ||
        r.opis_no.toLowerCase().includes(q) ||
        r.destination_city.toLowerCase().includes(q) ||
        r.matched_invitation_no.toLowerCase().includes(q)
      );
    });
  }, [payload, search, statusFilter, categoryFilter, cityFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter, cityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  );

  const handleExportCleanExcel = () => {
    if (!filteredRows.length) return;
    const exportRows = filteredRows.map((r) => ({
      'Опись №': r.opis_no || '-',
      'Sicil No': r.sicil_no || '-',
      'Ad Soyad (Latin)': r.fio_latin || '-',
      'Ad Soyad (Kiril)': r.fio_kiril || '-',
      'Pasaport No': r.passport_no || '-',
      'Pasaport Veriliş': r.passport_issue_date || '-',
      'Pasaport Bitiş': r.passport_expiry_date || '-',
      'Doğum Tarihi': r.birth_date || '-',
      'Uyruk': r.citizenship || '-',
      'Başvuru Tarihi': r.app_date || '-',
      'Bekleme (Gün)': r.status_key === 'ARRIVED' ? 0 : r.waiting_days ?? '-',
      'Giriş Başlangıç': r.entry_from || '-',
      'Vize Bitiş': r.visa_end || '-',
      'Vize Çokluğu': r.visa_multiplicity || '-',
      'Konsolosluk': r.consulate_city || '-',
      'Hedef Şehir / Şantiye': r.destination_city || '-',
      'Kategori': r.ig_category || '-',
      'Davetiye Durumu':
        r.status_key === 'ARRIVED'
          ? `Geldi (${r.matched_invitation_no})`
          : r.status_key === 'OVERDUE'
            ? `Gecikmiş (${r.waiting_days} gün)`
            : r.waiting_days !== null
              ? `Bekleniyor (${r.waiting_days} gün)`
              : 'Tarih Eksik',
      'Notlar': r.comments || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'Davetiye_Basvurulari');
    XLSX.writeFile(wb, `Pondera_Davetiye_Basvuru_Takibi_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const s = payload?.summary;
  const canEdit = Boolean(payload?.canEdit);

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
              {lang === 'ru'
                ? 'Реестр поданных заявок на приглашения (лист ПРИГЛАШЕНИЯ)'
                : 'Başvurulan Davetiyeler & Bekleme Süresi Takibi (ПРИГЛАШЕНИЯ)'}
            </h2>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              {s?.lastFileName
                ? `Son Excel: ${s.lastFileName} (${s.lastUpdatedAt}) — Tüm gizli kolonlar ve karışık tarih formatları otomatik normalize edilir.`
                : 'Zahid Bey / ortak klasördeki ПРИГЛАШЕНИЯ Excelini yükleyin veya doğrudan buradan yeni başvuru ekleyin.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadExcel}
              className="hidden"
            />

            {canEdit && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{uploading ? 'Aktarılıyor...' : 'Başvuru Excel Yükle (.xlsx)'}</span>
                </button>

                <button
                  type="button"
                  onClick={openNewModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Başvuru Ekle</span>
                </button>

                <button
                  type="button"
                  disabled={syncing}
                  onClick={handleRunSync}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Link2 className={`w-3.5 h-3.5 text-emerald-600 ${syncing ? 'animate-spin' : ''}`} />
                  <span>MVD PDF &amp; Sicil Eşleştir</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleExportCleanExcel}
              disabled={!filteredRows.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Temiz Excel İndir</span>
            </button>
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
            banner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5 KPI Cards */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase text-slate-500">Toplam Başvuru</p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {s.total.toLocaleString('tr-TR')}
            </p>
            <p className="text-[10px] font-semibold text-slate-400">
              VKS: {s.vksCount} • Kota/RNR: {s.quotaCount}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-300/80 dark:border-emerald-800">
            <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
              Davetiyesi Gelen (PDF)
            </p>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
              {s.arrivedCount.toLocaleString('tr-TR')}
            </p>
            <p className="text-[10px] font-semibold text-emerald-700/80 dark:text-emerald-400">
              MVD PDF ile otomatik bağlandı
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-amber-200 dark:border-amber-900/50">
            <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
              MVD&apos;den Beklenen
            </p>
            <p className="text-xl font-black text-amber-600 dark:text-amber-300 mt-0.5">
              {s.waitingCount.toLocaleString('tr-TR')}
            </p>
            <p className="text-[10px] font-semibold text-slate-400">Henüz PDF ulaşmadı</p>
          </div>
          <div className="p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-300/80 dark:border-rose-800">
            <p className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
              Geciken (&gt;30 Gün)
            </p>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
              {s.overdueCount.toLocaleString('tr-TR')}
            </p>
            <p className="text-[10px] font-semibold text-rose-600/80">Kritik takip listesi</p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800">
            <p className="text-[10px] font-bold uppercase text-slate-500">Sicil Eşleşen</p>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-300 mt-0.5">
              {s.withSicilCount.toLocaleString('tr-TR')}
            </p>
            <p className="text-[10px] font-semibold text-slate-400">eBA sicil numarasına bağlı</p>
          </div>
        </div>
      )}

      {/* Filter & Table Card */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50/90 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sicil, ad soyad, pasaport, опись..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 w-56"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">Tüm Durumlar ({payload?.data.length || 0})</option>
              <option value="ARRIVED">Davetiye Geldi ({s?.arrivedCount || 0})</option>
              <option value="WAITING">Bekleniyor ({s?.waitingCount || 0})</option>
              <option value="OVERDUE">Geciken &gt;30 Gün ({s?.overdueCount || 0})</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
            >
              <option value="ALL">Tüm Kategoriler</option>
              <option value="VKS">Sadece VKS</option>
              <option value="KOTA">Sadece Kota / RNR</option>
            </select>

            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 max-w-[180px]"
            >
              <option value="ALL">Tüm Hedef Şehirler</option>
              {(payload?.filterOptions.cities || []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <span className="text-[11px] font-bold text-slate-500">
            Gösterilen: {filteredRows.length.toLocaleString('tr-TR')} kayıt
          </span>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Başvuru listesi yükleniyor...</span>
          </div>
        ) : paginatedRows.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Henüz davetiye başvurusu yüklenmemiş veya filtreye uyan kayıt yok.
            </p>
            <p className="text-xs text-slate-500">
              Yukarıdaki <strong>&quot;Başvuru Excel Yükle (.xlsx)&quot;</strong> butonuyla <code>ПРИГЛАШЕНИЯ</code> Excel dosyasını yükleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Опись / Kaynak</th>
                  <th className="px-3 py-2.5 font-bold">Sicil &amp; Ad Soyad</th>
                  <th className="px-3 py-2.5 font-bold">Pasaport &amp; Doğum</th>
                  <th className="px-3 py-2.5 font-bold">Başvuru &amp; Bekleme</th>
                  <th className="px-3 py-2.5 font-bold">Vize Giriş–Bitiş</th>
                  <th className="px-3 py-2.5 font-bold">Konsolosluk &amp; Hedef</th>
                  <th className="px-3 py-2.5 font-bold">Durum</th>
                  {canEdit && <th className="px-3 py-2.5 font-bold text-right">İşlem</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {row.opis_no || `#${row.row_no || row.id}`}
                      </div>
                      <span
                        className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          row.ig_category === 'VKS'
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {row.ig_category}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {row.sicil_no ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 font-mono text-[10px] font-bold">
                            #{row.sicil_no}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 text-[9.5px] font-bold">
                            Yeni Aday
                          </span>
                        )}
                        <span className="font-extrabold text-slate-900 dark:text-white">
                          {row.fio_latin || row.fio_kiril}
                        </span>
                      </div>
                      {row.fio_kiril && row.fio_latin && (
                        <p className="text-[10.5px] text-slate-500 mt-0.5">{row.fio_kiril}</p>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {row.passport_no || '-'}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Doğum: {row.birth_date || '-'} • Ver: {row.passport_issue_date || '-'}
                      </p>
                    </td>

                    <td className="px-3 py-2">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {row.app_date || '—'}
                      </div>
                      {row.status_key !== 'ARRIVED' && row.waiting_days !== null && (
                        <span
                          className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-extrabold ${
                            row.waiting_days > 30
                              ? 'text-rose-600 dark:text-rose-400'
                              : row.waiting_days > 20
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {row.waiting_days} gündür bekleniyor
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      <div>
                        {row.entry_from || '-'} → {row.visa_end || '-'}
                      </div>
                      <p className="text-[10px] font-sans text-slate-400">{row.visa_multiplicity}</p>
                    </td>

                    <td className="px-3 py-2">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {row.destination_city || '-'}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {row.consulate_city || '-'} • {row.citizenship || '-'}
                      </p>
                    </td>

                    <td className="px-3 py-2">
                      {row.status_key === 'ARRIVED' ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 text-[10px] font-extrabold">
                            <CheckCircle2 className="w-3 h-3" />
                            Davetiye Geldi
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-500">
                              {row.matched_invitation_no}
                            </span>
                            {row.matched_pdf_filename && (
                              <a
                                href={`/api/invitations/pdf?invitationNo=${encodeURIComponent(row.matched_invitation_no)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:underline"
                              >
                                <FileText className="w-3 h-3" />
                                PDF
                              </a>
                            )}
                          </div>
                        </div>
                      ) : row.status_key === 'OVERDUE' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 text-[10px] font-extrabold">
                          <AlertTriangle className="w-3 h-3" />
                          Gecikmiş ({row.waiting_days}g)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 text-[10px] font-extrabold">
                          <Clock className="w-3 h-3" />
                          Bekleniyor
                        </span>
                      )}
                    </td>

                    {canEdit && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-800 cursor-pointer"
                          title="Düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Sayfa başı:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Manual Application Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {form.id ? 'Davetiye Başvurusunu Düzenle' : 'Yeni Davetiye Başvurusu Ekle (Excel Yerine Doğrudan Giriş)'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Sicil No (eBA&apos;dan Otomatik Doldur)
                  </label>
                  <input
                    type="text"
                    value={form.sicil_no}
                    onChange={(e) => setForm({ ...form, sicil_no: e.target.value })}
                    placeholder="Örn: 944658"
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  />
                </div>
                <button
                  type="button"
                  disabled={lookingUpSicil || !form.sicil_no.trim()}
                  onClick={handleLookupSicil}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold cursor-pointer"
                >
                  {lookingUpSicil ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserSearch className="w-3.5 h-3.5" />}
                  <span>Sicil&apos;den Getir</span>
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Ad Soyad (Latin) *
                </label>
                <input
                  type="text"
                  value={form.fio_latin}
                  onChange={(e) => setForm({ ...form, fio_latin: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Ad Soyad (Kiril)
                </label>
                <input
                  type="text"
                  value={form.fio_kiril}
                  onChange={(e) => setForm({ ...form, fio_kiril: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Pasaport No *
                </label>
                <input
                  type="text"
                  value={form.passport_no}
                  onChange={(e) => setForm({ ...form, passport_no: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Doğum Tarihi (GG.AA.YYYY)
                </label>
                <input
                  type="text"
                  value={form.birth_date}
                  onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                  placeholder="01.01.2000"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Pasaport Veriliş Tarihi
                </label>
                <input
                  type="text"
                  value={form.passport_issue_date}
                  onChange={(e) => setForm({ ...form, passport_issue_date: e.target.value })}
                  placeholder="GG.AA.YYYY"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Başvuru Tarihi (Дата принятых)
                </label>
                <input
                  type="text"
                  value={form.app_date}
                  onChange={(e) => setForm({ ...form, app_date: e.target.value })}
                  placeholder="GG.AA.YYYY"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  № Описи (Dosya No)
                </label>
                <input
                  type="text"
                  value={form.opis_no}
                  onChange={(e) => setForm({ ...form, opis_no: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Kategori (VKS / Kota)
                </label>
                <select
                  value={form.ig_category}
                  onChange={(e) => setForm({ ...form, ig_category: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <option value="VKS">VKS</option>
                  <option value="Kota / RNR">Kota / RNR</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Vize Giriş Başlangıç (Въезд с)
                </label>
                <input
                  type="text"
                  value={form.entry_from}
                  onChange={(e) => setForm({ ...form, entry_from: e.target.value })}
                  placeholder="GG.AA.YYYY"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Vize Bitiş Tarihi
                </label>
                <input
                  type="text"
                  value={form.visa_end}
                  onChange={(e) => setForm({ ...form, visa_end: e.target.value })}
                  placeholder="GG.AA.YYYY"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Hedef Şehir / Şantiye
                </label>
                <input
                  type="text"
                  value={form.destination_city}
                  onChange={(e) => setForm({ ...form, destination_city: e.target.value })}
                  placeholder="г. Казань, г. Усть-Луга..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Konsolosluk Şehri
                </label>
                <input
                  type="text"
                  value={form.consulate_city}
                  onChange={(e) => setForm({ ...form, consulate_city: e.target.value })}
                  placeholder="СТАМБУЛ, НЬЮ-ДЕЛИ..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Notlar / Yorum
                </label>
                <input
                  type="text"
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={saving || !form.passport_no.trim() || (!form.fio_latin.trim() && !form.fio_kiril.trim())}
                onClick={handleSaveManual}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Kaydet &amp; Eşleştir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
