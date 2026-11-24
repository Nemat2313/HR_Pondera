'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Receipt,
  Upload,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  Globe,
  Save,
  Play,
  BookOpen,
  ShieldAlert,
  Users,
  TrendingUp,
  FileSpreadsheet,
  X,
  RotateCcw,
  Ban,
  FileCode2,
  Printer,
  FileUp,
  ChevronDown,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import WindowsTabBar from '@/components/common/WindowsTabBar';

interface EmployeeMonthRow {
  month: number;
  label: string;
  patent_paid: number;
  ndfl_calc: number;
  offset_used: number;
  ndfl_withheld: number;
  unoffset_gap: number;
  is_notif_month?: boolean;
  is_after_notif?: boolean;
  status_code?: string;
  analysis_note?: string;
}

interface CompanyMonthTotal {
  month: number;
  label: string;
  patent_paid: number;
  ndfl_calc: number;
  offset_used: number;
  ndfl_withheld: number;
  missing_employees: number;
}

interface PatentNdflRow {
  id: number;
  tax_year: number;
  org_name: string;
  tabel_no: string;
  full_name: string;
  citizenship: string;
  is_active: number;
  site_name: string;
  region: string;
  hire_date: string;
  exit_date: string;
  has_notification: number;
  notification_no: string;
  notification_date: string;
  ifns_code: string;
  application_date: string;
  application_status: string;
  ndfl_before_offset: number;
  patent_advances: number;
  patent_offset_used: number;
  patent_advance_balance: number;
  additional_offset_potential: number;
  ndfl_withheld: number;
  priority_label: string;
  recommended_action: string;
  responsible_person: string;
  manual_status: string;
  notes: string;
  excluded_region_change?: number;
  notif_month?: number;
  root_cause?: 'NO_NOTIFICATION' | 'REGION_CHANGED' | 'LATE_NOTIFICATION_VOZVRAT' | 'LOW_NDFL' | 'FULL_OFFSET';
  months?: EmployeeMonthRow[];
  missing_months?: Array<{ month: number; label: string; gap: number; phase?: string }>;
  source_file: string;
}

const CAUSE_META: Record<
  'NO_NOTIFICATION' | 'LATE_NOTIFICATION_VOZVRAT' | 'LOW_NDFL' | 'REGION_CHANGED' | 'FULL_OFFSET',
  { label: string; short: string; cls: string; hint: string }
> = {
  NO_NOTIFICATION: {
    label: 'Acil: ФНС İzni Yok',
    short: 'ФНС İzni Yok',
    cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    hint: 'Muhasebe acil İFNS başvurusu yapmalı / ТКС kontrol etmeli',
  },
  LATE_NOTIFICATION_VOZVRAT: {
    label: 'Gecikmiş İzin → Mahsup / Возврат',
    short: 'Возврат / Ek Mahsup',
    cls: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
    hint: 'Kalan aylarda mahsup edilmezse yıl sonunda ст. 231 НК РФ ile iade istenmeli',
  },
  LOW_NDFL: {
    label: 'НДФЛ Yetersiz (Avans > НДФЛ)',
    short: 'НДФЛ Az',
    cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    hint: 'Muhasebe hatası değil; ст. 227.1 п. 7 gereği НДФЛ üstü avans iade edilmez',
  },
  REGION_CHANGED: {
    label: 'Bölge Değişikliği (Plan Dışı)',
    short: 'Bölge Değişikliği',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
    hint: 'Yılda sadece 1 bölge izni verilir — mahsup planından çıkarıldı',
  },
  FULL_OFFSET: {
    label: 'Tam Mahsup Edildi (%100)',
    short: 'Tam Mahsup',
    cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    hint: 'Sorun yok, avans tamamen mahsup edildi',
  },
};

interface DiscrepancyRow {
  id: number;
  tabel_no: string;
  full_name: string;
  period_date: string;
  source_doc: string;
  amount_outside_payroll: number;
  offset_amount: number;
  unexplained_amount: number;
  action_note: string;
}

function fmtRub(val: number): string {
  return `${Math.round(val || 0).toLocaleString('ru-RU')} ₽`;
}

export default function PatentNdflView() {
  const { getAuthHeaders } = useAuth();
  const { lang } = useLanguage();

  const [activeTab, setActiveTab] = useState<'overview' | 'notifications' | 'reconciliation' | 'vozvrat' | 'import_odata'>('overview');
  const [taxYear, setTaxYear] = useState<number>(2026);
  const [records, setRecords] = useState<PatentNdflRow[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<CompanyMonthTotal[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyRow[]>([]);
  const [patentRates, setPatentRates] = useState<Array<{ region: string; siteHint: string; monthlyRub: number }>>([]);
  const [summary, setSummary] = useState({
    totalEmployees: 0,
    withNotifTotal: 0,
    noNotifTotal: 0,
    noNotifActive: 0,
    noNotifDismissed: 0,
    noNotifNoApp: 0,
    totalAdvances: 0,
    totalOffsetUsed: 0,
    totalBalance: 0,
    totalPotential: 0,
    activePotential: 0,
    activePotentialCount: 0,
    offsetPct: 0,
    discrepancyCount: 0,
    totalDiscrepancy: 0,
    causeCounts: {
      NO_NOTIFICATION: 0,
      REGION_CHANGED: 0,
      LATE_NOTIFICATION_VOZVRAT: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    },
    causeRub: {
      NO_NOTIFICATION: 0,
      REGION_CHANGED: 0,
      LATE_NOTIFICATION_VOZVRAT: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    },
    vozvratActiveRub: 0,
    vozvratActiveCount: 0,
    vozvratDismissedRub: 0,
    vozvratDismissedCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'dismissed'>('all');
  const [notifFilter, setNotifFilter] = useState<'all' | 'no_notif' | 'with_notif' | 'has_potential' | 'zero_offset'>('all');
  const [causeFilter, setCauseFilter] = useState<
    'all' | 'NO_NOTIFICATION' | 'LATE_NOTIFICATION_VOZVRAT' | 'LOW_NDFL' | 'REGION_CHANGED' | 'FULL_OFFSET'
  >('all');
  const [visibleCount, setVisibleCount] = useState(150);

  // OData config
  const [odataUrl, setOdataUrl] = useState('');
  const [odataUser, setOdataUser] = useState('');
  const [odataPass, setOdataPass] = useState('');
  const [odataOrg, setOdataOrg] = useState('');
  const [odataLastSync, setOdataLastSync] = useState('');
  const [odataBusy, setOdataBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifPdfInputRef = useRef<HTMLInputElement>(null);

  // Official FNS XML (КНД 1110055) & Employee Statement (Заявление) company metadata
  const [xmlOrgName, setXmlOrgName] = useState('Общество с ограниченной ответственностью "МОНТАЖЭНЕРГОСТРОЙ"');
  const [xmlDirectorDative, setXmlDirectorDative] = useState('Акчаму Месуту');
  const [xmlInnUl, setXmlInnUl] = useState('7702424557');
  const [xmlKpp, setXmlKpp] = useState('470745001');
  const [xmlKodNO, setXmlKodNO] = useState('4707');
  const [xmlAppNo, setXmlAppNo] = useState('14');
  const [xmlSignerInn, setXmlSignerInn] = useState('526005515667');
  const [xmlSignerFam, setXmlSignerFam] = useState('Акчам');
  const [xmlSignerNam, setXmlSignerNam] = useState('Месут');
  const [xmlBusy, setXmlBusy] = useState(false);

  const handleGenerateFnsXml = async () => {
    setXmlBusy(true);
    setFeedback(null);
    try {
      const targetIds = filteredRecords.filter((r) => !r.has_notification && r.root_cause !== 'REGION_CHANGED').map((r) => r.id);
      const res = await fetch('/api/patent-ndfl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'generate_fns_xml',
          taxYear,
          kodNO: xmlKodNO,
          appNo: xmlAppNo,
          orgName: xmlOrgName,
          innUl: xmlInnUl,
          kpp: xmlKpp,
          signerInn: xmlSignerInn,
          signerFam: xmlSignerFam,
          signerNam: xmlSignerNam,
          recordIds: targetIds.length > 0 ? targetIds : undefined,
        }),
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: 'ФНС XML (КНД 1110055) oluşturulamadı.' });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const fnMatch = /filename="([^"]+)"/.exec(cd);
      const fname = fnMatch?.[1] || `SR_ZPRUMNAL_${xmlKodNO}_${taxYear}.XML`;
      const included = res.headers.get('X-Included-Count') || String(targetIds.length);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'success',
        text: `Resmi ФНС XML (КНД 1110055, windows-1251) indirildi: ${fname} (${included} çalışan).`,
      });
    } catch {
      setFeedback({ type: 'error', text: 'XML oluşturma sırasında hata oluştu.' });
    } finally {
      setXmlBusy(false);
    }
  };

  const handlePrintStatements = () => {
    const targets = filteredRecords.filter((r) => !r.has_notification && r.root_cause !== 'REGION_CHANGED');
    if (targets.length === 0) {
      setFeedback({ type: 'info', text: 'Dilekçe üretilecek bildirimsiz çalışan bulunamadı.' });
      return;
    }
    const esc = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const pages = targets
      .map(
        (r) => `
      <div class="page">
        <div class="header">
          <div>Генеральному директору</div>
          <div>${esc(xmlOrgName)}</div>
          <div>${esc(xmlDirectorDative)}</div>
          <div style="margin-top:8px;">От <strong>${esc(r.full_name)}</strong></div>
          ${r.tabel_no ? `<div style="font-size:11px;color:#555;">(Таб. № ${esc(r.tabel_no)})</div>` : ''}
        </div>
        <h2>Заявление</h2>
        <p class="body">
          Прошу уменьшить НДФЛ, удерживаемый из моего дохода за <strong>${taxYear}</strong> год,
          на суммы уплачиваемых мною фиксированных авансовых платежей на основании предоставленных
          квитанций об оплате патента за период его действия в <strong>${taxYear}</strong> году.
        </p>
        <div class="footer">
          <div>Дата: «____» ______________ ${taxYear} г.</div>
          <div>Подпись: ___________________ / ${esc(r.full_name)} /</div>
        </div>
      </div>`
      )
      .join('\n');

    const w = window.open('', '_blank');
    if (!w) {
      setFeedback({ type: 'error', text: 'Tarayıcı açılır pencereyi (popup) engelledi.' });
      return;
    }
    w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Заявления на уменьшение НДФЛ (${taxYear})</title>
      <style>
        body { font-family: "Times New Roman", serif; margin: 0; color: #111; }
        .page { width: 210mm; min-height: 280mm; padding: 25mm 20mm; box-sizing: border-box; page-break-after: always; }
        .header { width: 52%; margin-left: auto; font-size: 14pt; line-height: 1.45; }
        h2 { text-align: center; margin: 38mm 0 12mm; font-size: 16pt; font-weight: bold; }
        .body { font-size: 14pt; line-height: 1.75; text-indent: 12mm; text-align: justify; }
        .footer { display: flex; justify-content: space-between; margin-top: 32mm; font-size: 13pt; }
        @media print { .no-print { display: none; } }
      </style></head><body>
      <div class="no-print" style="padding:10px 16px;background:#1e293b;color:#fff;font-family:sans-serif;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
        <span>Toplu Çalışan Dilekçesi (${targets.length} sayfa — her çalışan 1 A4)</span>
        <button onclick="window.print()" style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">Yazdır / PDF Kaydet</button>
      </div>
      ${pages}
      </body></html>`);
    w.document.close();
  };

  const handleUploadNotifPdfs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setXmlBusy(true);
    setFeedback(null);
    let ok = 0;
    const errs: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('mode', 'notification_pdf');
        fd.append('taxYear', String(taxYear));
        const res = await fetch('/api/patent-ndfl', {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: fd,
        });
        const data = await res.json();
        if (data?.success) ok++;
        else errs.push(data?.message || `${file.name} okunamadı`);
      }
      setFeedback({
        type: ok > 0 ? 'success' : 'error',
        text: `${ok}/${files.length} Уведомление ИФНС PDF okunup işlendi.${errs.length ? ` Uyarı: ${errs.slice(0, 2).join(' | ')}` : ''}`,
      });
      await fetchData();
    } catch {
      setFeedback({ type: 'error', text: 'PDF bildirim yükleme hatası.' });
    } finally {
      setXmlBusy(false);
      if (notifPdfInputRef.current) notifPdfInputRef.current.value = '';
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/patent-ndfl?year=${taxYear}`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (data?.success) {
        setRecords(data.records || []);
        setMonthlyTotals(data.monthlyTotals || []);
        setDiscrepancies(data.discrepancies || []);
        setPatentRates(data.patentRates2026 || []);
        if (data.summary) setSummary(data.summary);
        if (data.odataConfig) {
          setOdataUrl(data.odataConfig.odataUrl || '');
          setOdataUser(data.odataConfig.username || '');
          setOdataPass(data.odataConfig.password || '');
          setOdataOrg(data.odataConfig.orgFilter || '');
          setOdataLastSync(data.odataConfig.lastSyncAt || '');
        }
      }
    } catch {
      setFeedback({ type: 'error', text: 'Patent & НДФЛ verileri yüklenemedi.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [taxYear]);

  const handleExcelUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setFeedback(null);
    let totalImp = 0;
    let totalDisc = 0;
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('taxYear', String(taxYear));
        const res = await fetch('/api/patent-ndfl', {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: fd,
        });
        const data = await res.json();
        if (data?.success) {
          totalImp += Number(data.importedRecords || 0);
          totalDisc += Number(data.importedDiscrepancies || 0);
        } else {
          errors.push(data?.message || `${file.name} yüklenemedi.`);
        }
      }
      if (errors.length > 0 && totalImp === 0) {
        setFeedback({ type: 'error', text: errors.join(' | ') });
      } else {
        setFeedback({
          type: errors.length > 0 ? 'info' : 'success',
          text: `${files.length} dosya işlendi: ${totalImp} çalışan kaydı${totalDisc ? ` ve ${totalDisc} uyuşmazlık` : ''} güncellendi.${errors.length > 0 ? ` Uyarı: ${errors.join(' | ')}` : ''}`,
        });
      }
      await fetchData();
    } catch {
      setFeedback({ type: 'error', text: 'Dosya yükleme sırasında bağlantı hatası oluştu.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveOData = async () => {
    setOdataBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/patent-ndfl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'save_odata_config',
          config: { odataUrl, username: odataUser, password: odataPass, orgFilter: odataOrg, taxYear },
        }),
      });
      const data = await res.json();
      setFeedback({ type: data?.success ? 'success' : 'error', text: data?.message || 'İşlem tamamlandı.' });
    } catch {
      setFeedback({ type: 'error', text: 'OData ayarları kaydedilemedi.' });
    } finally {
      setOdataBusy(false);
    }
  };

  const handleSyncOData = async () => {
    setOdataBusy(true);
    setFeedback({ type: 'info', text: '1C ZUP OData sunucusundan patent avansları ve bildirimler çekiliyor...' });
    try {
      const res = await fetch('/api/patent-ndfl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'sync_odata',
          config: { odataUrl, username: odataUser, password: odataPass, orgFilter: odataOrg, taxYear },
        }),
      });
      const data = await res.json();
      setFeedback({ type: data?.success ? 'success' : 'error', text: data?.message || 'OData senkronizasyonu tamamlandı.' });
      if (data?.success) await fetchData();
    } catch {
      setFeedback({ type: 'error', text: '1C OData senkronizasyon hatası.' });
    } finally {
      setOdataBusy(false);
    }
  };

  const handleToggleRegionExcluded = async (row: PatentNdflRow) => {
    try {
      const nextExcluded = row.excluded_region_change ? 0 : 1;
      const res = await fetch('/api/patent-ndfl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'toggle_region_excluded', id: row.id, excluded: nextExcluded }),
      });
      const data = await res.json();
      if (data?.success) {
        setFeedback({ type: 'info', text: data.message });
        await fetchData();
      }
    } catch {
      setFeedback({ type: 'error', text: 'Durum güncellenemedi.' });
    }
  };

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (activeTab === 'notifications' && (r.has_notification || r.root_cause === 'REGION_CHANGED')) return false;
      if (activeTab === 'vozvrat' && r.root_cause !== 'LATE_NOTIFICATION_VOZVRAT') return false;
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'dismissed' && r.is_active) return false;
      if (causeFilter !== 'all' && r.root_cause !== causeFilter) return false;
      if (notifFilter === 'no_notif' && r.has_notification) return false;
      if (notifFilter === 'with_notif' && !r.has_notification) return false;
      if (notifFilter === 'has_potential' && Number(r.additional_offset_potential || 0) <= 0) return false;
      if (notifFilter === 'zero_offset' && !(Number(r.patent_advances || 0) > 0 && Number(r.patent_offset_used || 0) === 0)) return false;
      if (q) {
        const hay = `${r.tabel_no} ${r.full_name} ${r.citizenship} ${r.site_name} ${r.notification_no} ${r.ifns_code} ${r.priority_label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, activeFilter, notifFilter, causeFilter, activeTab]);

  const analytics = useMemo(() => {
    const byCit = new Map<string, { name: string; count: number; advances: number; used: number; potential: number; noNotif: number }>();
    const bySite = new Map<string, { name: string; count: number; advances: number; used: number; potential: number; noNotif: number }>();
    for (const r of records) {
      const cit = (r.citizenship || 'Belirtilmemiş').trim();
      const site = (r.site_name || r.region || r.org_name || 'Genel').trim();
      for (const [map, key] of [
        [byCit, cit],
        [bySite, site],
      ] as const) {
        const cur = map.get(key) || { name: key, count: 0, advances: 0, used: 0, potential: 0, noNotif: 0 };
        cur.count++;
        cur.advances += Number(r.patent_advances || 0);
        cur.used += Number(r.patent_offset_used || 0);
        cur.potential += Number(r.additional_offset_potential || 0);
        if (!r.has_notification) cur.noNotif++;
        map.set(key, cur);
      }
    }
    return {
      byCit: Array.from(byCit.values()).sort((a, b) => b.count - a.count).slice(0, 8),
      bySite: Array.from(bySite.values()).sort((a, b) => b.potential - a.potential || b.count - a.count).slice(0, 12),
    };
  }, [records]);

  const handleExportExcel = () => {
    const rows = filteredRecords.map((r) => ({
      'Sicil / Tabel No': r.tabel_no,
      'Ad Soyad (ФИО)': r.full_name,
      Uyruk: r.citizenship,
      Durum: r.is_active ? 'Aktif' : 'Çıkışlı',
      'Şantiye / Proje': r.site_name || r.region,
      'ФНС Bildirim Var mı': r.has_notification ? 'Evet' : 'Hayır',
      'Bildirim No': r.notification_no,
      'Bildirim Tarihi': r.notification_date,
      'İFNS Kodu': r.ifns_code,
      'Son Başvuru (1C)': r.application_date,
      'Patent Avansı (₽)': r.patent_advances,
      'Hesaplanan НДФЛ (₽)': r.ndfl_before_offset,
      'Mahsup Edilen (₽)': r.patent_offset_used,
      'Kalan Avans (₽)': r.patent_advance_balance,
      'Ek Mahsup Potansiyeli (₽)': r.additional_offset_potential,
      'Eksik Mahsup Ayları': (r.missing_months || []).map((m) => `${m.label} (${m.gap}₽)`).join(', '),
      'Kök Neden': CAUSE_META[r.root_cause || 'FULL_OFFSET']?.label || '',
      'Öncelik / Aksiyon': r.priority_label || r.recommended_action,
    }));

    const monthlyDetailRows: any[] = [];
    for (const r of filteredRecords) {
      for (const m of r.months || []) {
        monthlyDetailRows.push({
          'Sicil / Tabel No': r.tabel_no,
          'Ad Soyad (ФИО)': r.full_name,
          Durum: r.is_active ? 'Aktif' : 'Çıkışlı',
          'Bildirim No': r.notification_no || 'YOK',
          'Bildirim Tarihi': r.notification_date || '',
          Ay: `${String(m.month).padStart(2, '0')} - ${m.label}`,
          'İzin Dönemi': m.is_notif_month ? 'Уведомление Alındı' : m.is_after_notif ? 'İzin Sonrası (Mahsup Dönemi)' : 'İzin Öncesi / İzinsiz',
          'Ödenen Patent (₽)': m.patent_paid,
          'Hesaplanan НДФЛ (₽)': m.ndfl_calc,
          'Mahsup Edilen (₽)': m.offset_used,
          'Kesilen НДФЛ (₽)': m.ndfl_withheld,
          'Aylık Eksik Mahsup (₽)': m.unoffset_gap,
          'Aylık Analiz': m.analysis_note || '',
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Kisi_Ozet_${taxYear}`);
    if (monthlyDetailRows.length > 0) {
      const wsM = XLSX.utils.json_to_sheet(monthlyDetailRows);
      XLSX.utils.book_append_sheet(wb, wsM, `Aylik_Detay_${taxYear}`);
    }
    XLSX.writeFile(wb, `Pondera_SNG_Patent_NDFL_Aylik_${taxYear}.xlsx`);
  };

  return (
    <div className="pondera-3d-page p-3 sm:p-5 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div>
        <WindowsTabBar
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as any)}
          tabs={[
            {
              id: 'overview',
              label: lang === 'ru' ? '1. Сводка и Потенциал' : '1. Finansal Özet & Analitik',
              badge: summary.totalEmployees,
              icon: <TrendingUp className="w-3.5 h-3.5" />,
            },
            {
              id: 'notifications',
              label: lang === 'ru' ? '2. Без уведомления ФНС' : '2. ФНС Bildirim Takip',
              badge: summary.noNotifTotal,
              icon: <ShieldAlert className="w-3.5 h-3.5" />,
            },
            {
              id: 'reconciliation',
              label: lang === 'ru' ? '3. Сверка и причины' : '3. Kişi Bazlı Mahsup & Nedenler',
              badge: summary.totalEmployees,
              icon: <Receipt className="w-3.5 h-3.5" />,
            },
            {
              id: 'vozvrat',
              label: lang === 'ru' ? '4. Возврат НДФЛ (ст. 231)' : '4. Возврат НДФЛ (Yıl Sonu İade)',
              badge: (summary.vozvratActiveCount || 0) + (summary.vozvratDismissedCount || 0),
              icon: <RotateCcw className="w-3.5 h-3.5" />,
            },
            {
              id: 'import_odata',
              label: lang === 'ru' ? '5. 1С OData и Нормы' : '5. 1C OData & Mevzuat',
              icon: <Globe className="w-3.5 h-3.5" />,
            },
          ]}
          rightSlot={
            <div className="flex items-center gap-2">
              <select
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
              >
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
                <option value={2025}>2025</option>
              </select>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Yükleniyor...' : '1C / МЭС Excel Yükle'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls"
                onChange={(e) => handleExcelUpload(e.target.files)}
                className="hidden"
              />
            </div>
          }
        />

        <div className="rounded-b-2xl rounded-tr-2xl border border-slate-200 dark:border-slate-600/80 p-4 sm:p-5 space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
                  : 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200'
              }`}
            >
              <span>{feedback.text}</span>
              <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
              <p className="text-[11px] text-slate-500 dark:text-slate-300">Kayıtlı Patent Avansı ({taxYear})</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5 font-mono">{fmtRub(summary.totalAdvances)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{summary.totalEmployees} patentli personel</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-emerald-950/20">
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Mahsup Edilen (Зачтено)</p>
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">{fmtRub(summary.totalOffsetUsed)}</p>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">Mahsup Oranı: %{summary.offsetPct}</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/30 dark:bg-amber-950/20">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">Kullanılmayan Avans Bakiyesi</p>
              <p className="text-lg font-semibold text-amber-600 dark:text-amber-400 mt-0.5 font-mono">{fmtRub(summary.totalBalance)}</p>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">İncelenmesi gereken bakiye</p>
            </div>
            <div
              onClick={() => {
                setNotifFilter('has_potential');
                setActiveTab('reconciliation');
              }}
              className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/40 dark:bg-indigo-950/30 cursor-pointer hover:ring-1 hover:ring-indigo-400 transition"
            >
              <p className="text-[11px] text-indigo-800 dark:text-indigo-300">Ek Mahsup Potansiyeli</p>
              <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 font-mono">{fmtRub(summary.totalPotential)}</p>
              <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                Aktiflerde: {fmtRub(summary.activePotential)} ({summary.activePotentialCount} kişi)
              </p>
            </div>
            <div
              onClick={() => setActiveTab('notifications')}
              className="p-3.5 rounded-2xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/30 cursor-pointer hover:ring-1 hover:ring-rose-400 transition"
            >
              <p className="text-[11px] text-rose-800 dark:text-rose-300">ФНС Bildirimi Eksik</p>
              <p className="text-lg font-semibold text-rose-600 dark:text-rose-400 mt-0.5 font-mono">{summary.noNotifTotal}</p>
              <p className="text-[10px] text-rose-700/80 dark:text-rose-300/80 mt-0.5">
                Aktif: {summary.noNotifActive} · Çıkışlı: {summary.noNotifDismissed} · Başvurusuz: {summary.noNotifNoApp}
              </p>
            </div>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {summary.totalEmployees === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-indigo-500 opacity-70" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {taxYear} yılı için henüz Patent &amp; НДФЛ verisi yüklenmemiş
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                    Sağ üstteki <strong>1C / МЭС Excel Yükle</strong> butonuyla 1C ZUP patent/2-НДФЛ dökümünü (veya МЭС 193 &amp; 710 raporlarını) yükleyebilir ya da <strong>4. 1C OData</strong> sekmesinden canlı bağlantı kurabilirsiniz.
                  </p>
                </div>
              ) : (
                <>
                  {/* Overall Offset Progress Bar */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        Genel Patent Avansı Mahsup Gerçekleşme Oranı ({taxYear})
                      </span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        %{summary.offsetPct} ({fmtRub(summary.totalOffsetUsed)} / {fmtRub(summary.totalAdvances)})
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                      <div
                        style={{ width: `${Math.min(100, summary.offsetPct)}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Mahsup Edilen: ${fmtRub(summary.totalOffsetUsed)}`}
                      />
                      <div
                        style={{
                          width: `${
                            summary.totalAdvances > 0
                              ? Math.min(100 - summary.offsetPct, (summary.totalPotential / summary.totalAdvances) * 100)
                              : 0
                          }%`,
                        }}
                        className="bg-indigo-500 h-full"
                        title={`Ek Mahsup Potansiyeli: ${fmtRub(summary.totalPotential)}`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Mahsup Edilen
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Ek Mahsup Potansiyeli
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" /> Mahsup Dışı / Fazla Avans
                      </span>
                    </div>
                  </div>

                  {/* Root-Cause Analysis Breakdown (5 Clickable Cards) */}
                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Mahsup Edilmeme Nedenleri (Kök Neden Analizi — Tıklayarak Filtrele)
                      </h3>
                      <span className="text-[10.5px] text-slate-500">
                        Bölge değiştirenler yılda 1 izin kuralı gereği mahsup planından otomatik çıkarılır
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                      {(
                        ['NO_NOTIFICATION', 'LATE_NOTIFICATION_VOZVRAT', 'LOW_NDFL', 'REGION_CHANGED', 'FULL_OFFSET'] as const
                      ).map((ck) => {
                        const meta = CAUSE_META[ck];
                        const cnt = summary.causeCounts?.[ck] || 0;
                        const rub = summary.causeRub?.[ck] || 0;
                        return (
                          <button
                            key={ck}
                            type="button"
                            onClick={() => {
                              setCauseFilter(ck);
                              setNotifFilter('all');
                              setActiveTab(ck === 'LATE_NOTIFICATION_VOZVRAT' ? 'vozvrat' : 'reconciliation');
                            }}
                            className={`p-3 rounded-xl border text-left cursor-pointer hover:opacity-90 transition ${meta.cls}`}
                          >
                            <div className="text-[11px] font-semibold">{meta.short}</div>
                            <div className="text-lg font-mono font-bold mt-0.5">{cnt} kişi</div>
                            <div className="text-[10.5px] font-mono opacity-90">{fmtRub(rub)}</div>
                            <div className="text-[9.5px] opacity-80 mt-1 leading-tight">{meta.hint}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 12-Month Company Patent vs 2-NDFL vs Offset Breakdown */}
                  {monthlyTotals.some((m) => m.patent_paid > 0 || m.offset_used > 0 || m.ndfl_calc > 0) && (
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-indigo-500" />
                          <span>Aylar Bazında Patent Avansı, 2-НДФЛ ve Mahsup Karşılaştırması ({taxYear})</span>
                        </h3>
                        <span className="text-[10.5px] text-slate-500">
                          Sıfır mahsup veya eksik mahsup yaşanan aylar kırmızı/turuncu vurgulanır
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                          <thead className="text-[10.5px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="py-1.5 pr-2">Ay</th>
                              <th className="py-1.5 px-2 text-right">Ödenen Patent (₽)</th>
                              <th className="py-1.5 px-2 text-right">Hesaplanan НДФЛ (₽)</th>
                              <th className="py-1.5 px-2 text-right text-emerald-600">Mahsup Edilen (₽)</th>
                              <th className="py-1.5 px-2 text-right">Mahsup %</th>
                              <th className="py-1.5 pl-2 text-right text-amber-600">Eksik Mahsuplu Kişi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {monthlyTotals
                              .filter((m) => m.patent_paid > 0 || m.offset_used > 0 || m.ndfl_calc > 0)
                              .map((m) => {
                                const pct = m.patent_paid > 0 ? Math.round((m.offset_used / m.patent_paid) * 100) : 0;
                                const isZeroAnomaly = m.patent_paid > 0 && m.offset_used === 0;
                                return (
                                  <tr
                                    key={m.month}
                                    className={isZeroAnomaly ? 'bg-rose-50/70 dark:bg-rose-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}
                                  >
                                    <td className="py-1.5 pr-2 font-semibold">
                                      {String(m.month).padStart(2, '0')} · {m.label}
                                      {isZeroAnomaly && (
                                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9.5px] bg-rose-100 dark:bg-rose-900/70 text-rose-700 dark:text-rose-200">
                                          Mahsup = 0!
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-mono">{fmtRub(m.patent_paid)}</td>
                                    <td className="py-1.5 px-2 text-right font-mono">{fmtRub(m.ndfl_calc)}</td>
                                    <td className="py-1.5 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                      {fmtRub(m.offset_used)}
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-mono">%{pct}</td>
                                    <td className="py-1.5 pl-2 text-right font-mono text-amber-600 dark:text-amber-400">
                                      {m.missing_employees} kişi
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Site / Org Breakdown & Citizenship Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Şantiye / Organizasyon Bazlı Patent Mahsup Analizi
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-[10.5px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="py-2 pr-2">Şantiye / Birim</th>
                              <th className="py-2 px-2 text-right">Kişi</th>
                              <th className="py-2 px-2 text-right">Avans</th>
                              <th className="py-2 px-2 text-right text-emerald-600">Mahsup</th>
                              <th className="py-2 px-2 text-right text-indigo-600">Ek Potansiyel</th>
                              <th className="py-2 pl-2 text-right text-rose-600">Bildirimsiz</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {analytics.bySite.map((s) => (
                              <tr key={s.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="py-2 pr-2 font-medium text-slate-800 dark:text-slate-200">{s.name}</td>
                                <td className="py-2 px-2 text-right font-mono">{s.count}</td>
                                <td className="py-2 px-2 text-right font-mono">{fmtRub(s.advances)}</td>
                                <td className="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtRub(s.used)}</td>
                                <td className="py-2 px-2 text-right font-mono text-indigo-600 dark:text-indigo-400">{fmtRub(s.potential)}</td>
                                <td className="py-2 pl-2 text-right font-mono text-rose-600 dark:text-rose-400">{s.noNotif}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Uyruk Bazlı Dağılım</span>
                      </h3>
                      <div className="space-y-2">
                        {analytics.byCit.map((c) => (
                          <div key={c.name} className="flex items-center justify-between text-xs gap-2">
                            <span className="truncate text-slate-700 dark:text-slate-300">{c.name}</span>
                            <div className="flex items-center gap-2 font-mono shrink-0">
                              <span className="text-slate-900 dark:text-white">{c.count} kişi</span>
                              {c.potential > 0 && <span className="text-indigo-600 dark:text-indigo-400">{fmtRub(c.potential)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 2026 Regional Patent Rates Reference */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  2026 Bölgesel Aylık Sabit Patent Avans Tarifeleri (Referans)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {patentRates.map((r) => (
                    <div key={r.region} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                      <div className="text-[11px] font-medium text-slate-800 dark:text-slate-100 truncate" title={r.region}>{r.region}</div>
                      <div className="text-[10px] text-slate-500 truncate">{r.siteHint}</div>
                      <div className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 mt-1">{fmtRub(r.monthlyRub)} / ay</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2, 3 & 4: NOTIFICATIONS, RECONCILIATION & VOZVRAT TABLE */}
          {(activeTab === 'notifications' || activeTab === 'reconciliation' || activeTab === 'vozvrat') && (
            <div className="space-y-3">
              {activeTab === 'notifications' && (
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-700/70 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">
                        ФНС Başvuru &amp; Bildirim Otomasyon Araçları (КНД 1110055 XML · Dilekçe · КНД 1125023 PDF)
                      </h3>
                      <p className="text-[11px] text-indigo-900/80 dark:text-indigo-200/80">
                        Aşağıdaki bildirimsiz {filteredRecords.length} çalışan için tek tıkla resmi ФНС XML oluşturun, toplu çalışan dilekçesi yazdırın veya gelen İFNS PDF bildirimlerini otomatik işleyin.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateFnsXml}
                        disabled={xmlBusy || filteredRecords.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>ФНС XML İndir (КНД 1110055)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePrintStatements}
                        disabled={filteredRecords.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Toplu Dilekçe Yazdır ({filteredRecords.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => notifPdfInputRef.current?.click()}
                        disabled={xmlBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer disabled:opacity-50"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        <span>Уведомление PDF Yükle</span>
                      </button>
                      <input
                        ref={notifPdfInputRef}
                        type="file"
                        multiple
                        accept=".pdf"
                        onChange={(e) => handleUploadNotifPdfs(e.target.files)}
                        className="hidden"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">Organizasyon (НаимОрг)</label>
                      <input
                        type="text"
                        value={xmlOrgName}
                        onChange={(e) => setXmlOrgName(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">ИННЮЛ</label>
                      <input
                        type="text"
                        value={xmlInnUl}
                        onChange={(e) => setXmlInnUl(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">КПП</label>
                      <input
                        type="text"
                        value={xmlKpp}
                        onChange={(e) => setXmlKpp(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">КодНО / №</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={xmlKodNO}
                          onChange={(e) => setXmlKodNO(e.target.value)}
                          className="w-1/2 px-1.5 py-1 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                          title="Код ИФНС"
                        />
                        <input
                          type="text"
                          value={xmlAppNo}
                          onChange={(e) => setXmlAppNo(e.target.value)}
                          className="w-1/2 px-1.5 py-1 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                          title="НомЗаяв"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">İmzalayan (Директор)</label>
                      <input
                        type="text"
                        value={`${xmlSignerFam} ${xmlSignerNam}`}
                        onChange={(e) => {
                          const p = e.target.value.trim().split(/\s+/);
                          setXmlSignerFam(p[0] || '');
                          setXmlSignerNam(p.slice(1).join(' ') || '');
                        }}
                        className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">Dilekçe Hitap</label>
                      <input
                        type="text"
                        value={xmlDirectorDative}
                        onChange={(e) => setXmlDirectorDative(e.target.value)}
                        className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'vozvrat' && (
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-700/70 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Yıl Sonu Fazla Kesilen НДФЛ İadesi (Возврат НДФЛ — ст. 231 НК РФ)</span>
                      </h3>
                      <p className="text-[11px] text-indigo-900/80 dark:text-indigo-200/80 mt-0.5">
                        ФНС izni geç geldiği için önceki aylarda kesilen ve yıl sonuna kadar yeni НДФЛ&apos;den mahsup edilemeyen tutarlar, muhasebe tarafından çalışanın banka hesabına iade edilip İFNS/ЕНС üzerinden geri alınmalıdır.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-mono">
                      <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300">
                        Aktif İade Adayı: <strong>{summary.vozvratActiveCount}</strong> ({fmtRub(summary.vozvratActiveRub)})
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300">
                        Çıkışlı İade Adayı: <strong>{summary.vozvratDismissedCount}</strong> ({fmtRub(summary.vozvratDismissedRub)})
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">1. Bildirim (10 iş günü)</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">İşveren, fazla kesilen НДФЛ tutarını çalışana yazılı bildirir.</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">2. Dilekçe + Banka IBAN</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">Çalışan <em>Заявление на возврат НДФЛ</em> ve banka hesap bilgilerini verir (nakit yasak).</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">3. İade &amp; ЕНС Mahsubu</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">İşveren 3 ay içinde banka hesabına öder; diğer çalışanların НДФЛ&apos;sinden düşer veya İFNS&apos;den iade alır.</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">4. 6-НДФЛ &amp; Çıkışlılar</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">6-НДФЛ (satır 190)&apos;a işlenir. Ulaşılamayan çıkışlılar yıl bitiminde İFNS&apos;ye 3-НДФЛ ile başvurabilir.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Sicil, Ad Soyad, Bildirim No, İFNS..."
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 w-60"
                    />
                  </div>
                  <select
                    value={activeFilter}
                    onChange={(e) => setActiveFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  >
                    <option value="all">Tümü (Aktif + Çıkışlı)</option>
                    <option value="active">Sadece Aktif Çalışanlar</option>
                    <option value="dismissed">Sadece Çıkışlılar</option>
                  </select>
                  {activeTab === 'reconciliation' && (
                    <>
                      <select
                        value={causeFilter}
                        onChange={(e) => setCauseFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 text-xs rounded-xl border border-indigo-300 dark:border-indigo-700"
                      >
                        <option value="all">Tüm Kök Nedenler</option>
                        <option value="NO_NOTIFICATION">Acil: ФНС İzni Yok</option>
                        <option value="LATE_NOTIFICATION_VOZVRAT">Gecikmiş İzin / Возврат</option>
                        <option value="LOW_NDFL">НДФЛ Yetersiz (Avans &gt; НДФЛ)</option>
                        <option value="REGION_CHANGED">Bölge Değişikliği (Plan Dışı)</option>
                        <option value="FULL_OFFSET">Tam Mahsup (%100)</option>
                      </select>
                      <select
                        value={notifFilter}
                        onChange={(e) => setNotifFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      >
                        <option value="all">Tüm Kayıtlar</option>
                        <option value="has_potential">Ek Mahsup Potansiyeli Olanlar</option>
                        <option value="zero_offset">Avans Var ama Mahsup = 0</option>
                        <option value="with_notif">ФНС Bildirimi Var</option>
                        <option value="no_notif">ФНС Bildirimi Yok</option>
                      </select>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel ({filteredRecords.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={fetchData}
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[520px] overflow-y-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-[#0D192E] text-[11px] text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-2.5">Sicil / Tabel</th>
                      <th className="py-2.5 px-2.5">Ad Soyad (ФИО)</th>
                      <th className="py-2.5 px-2.5">Durum</th>
                      <th className="py-2.5 px-2.5">ФНС Bildirim / Başvuru</th>
                      <th className="py-2.5 px-2.5 text-right">Patent Avansı</th>
                      <th className="py-2.5 px-2.5 text-right">Mahsup Edilen</th>
                      <th className="py-2.5 px-2.5 text-right">Kalan Avans</th>
                      <th className="py-2.5 px-2.5 text-right">Ek Potansiyel</th>
                      <th className="py-2.5 px-2.5">Eksik Mahsup Ayları</th>
                      <th className="py-2.5 px-2.5">Kök Neden / Plan Durumu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredRecords.slice(0, visibleCount).map((r) => {
                      const cMeta = CAUSE_META[r.root_cause || 'FULL_OFFSET'];
                      const isExpanded = expandedRowId === r.id;
                      const empMonths = r.months || [];
                      const missingMonths = r.missing_months || [];
                      return (
                      <React.Fragment key={r.id}>
                      <tr
                        onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                        className={`cursor-pointer ${
                          r.root_cause === 'REGION_CHANGED'
                            ? 'opacity-65 bg-slate-50/70 dark:bg-slate-900/40'
                            : isExpanded
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/40'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 px-2.5 font-mono">
                          <span className="inline-flex items-center gap-1">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            {r.tabel_no || '—'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="font-medium text-slate-900 dark:text-white">{r.full_name}</div>
                          <div className="text-[10px] text-slate-500">
                            {r.citizenship || '—'} {r.site_name ? `• ${r.site_name}` : ''}
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] border ${
                              r.is_active
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {r.is_active ? 'Aktif' : 'Çıkışlı'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5">
                          {r.has_notification ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />№ {r.notification_no} ({r.notification_date || 'OK'})
                              </span>
                              {r.ifns_code && <div className="text-[10px] text-slate-500">İFNS: {r.ifns_code}</div>}
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10.5px] text-rose-600 dark:text-rose-400">
                                <AlertTriangle className="w-3 h-3" />
                                Bildirim Yok
                              </span>
                              <div className="text-[10px] text-slate-500 max-w-[200px] truncate" title={r.application_status}>
                                {r.application_date ? `Başvuru: ${r.application_date}` : r.application_status || '1C başvurusu bulunamadı'}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono">{fmtRub(r.patent_advances)}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {fmtRub(r.patent_offset_used)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-amber-600 dark:text-amber-400">
                          {fmtRub(r.patent_advance_balance)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {fmtRub(r.additional_offset_potential)}
                        </td>
                        <td className="py-2 px-2.5">
                          {missingMonths.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[185px]">
                              {missingMonths.slice(0, 6).map((mm) => (
                                <span
                                  key={mm.month}
                                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono border ${
                                    mm.phase === 'post_notif' || mm.phase === 'no_notif'
                                      ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-300/80 dark:border-rose-700/70'
                                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300/70 dark:border-amber-700/70'
                                  }`}
                                  title={`${mm.label}: ${fmtRub(mm.gap)} eksik mahsup (${mm.phase === 'post_notif' ? 'İzin varken mahsup edilmedi' : mm.phase === 'pre_notif' ? 'İzin öncesi dönem' : 'ФНС izni yok'})`}
                                >
                                  {mm.label}
                                </span>
                              ))}
                              {missingMonths.length > 6 && (
                                <span className="text-[9.5px] text-slate-500">+{missingMonths.length - 6}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">
                              {empMonths.length > 0 ? 'Eksik ay yok' : 'Aylık veri yok'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] border ${cMeta.cls}`} title={cMeta.hint}>
                              {cMeta.short}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleRegionExcluded(r)}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                              title={
                                r.excluded_region_change
                                  ? 'Bölge değişikliği işaretini kaldır (mahsup planına geri al)'
                                  : 'Bölge Değişikliği olarak işaretle (mahsup planından çıkar)'
                              }
                            >
                              <Ban className="w-3 h-3" />
                            </button>
                          </div>
                          {(r.priority_label || r.recommended_action) && (
                            <div
                              className="text-[10px] text-slate-500 max-w-[230px] truncate mt-0.5"
                              title={r.recommended_action || r.priority_label}
                            >
                              {r.priority_label || r.recommended_action}
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-[#0B1528]">
                          <td colSpan={10} className="p-3 sm:p-4">
                            <div className="space-y-2.5 whitespace-normal">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pb-2 border-b border-slate-200 dark:border-slate-700">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="font-semibold text-slate-900 dark:text-white">{r.full_name}</span>
                                  <span>
                                    <strong>Уведомление ФНС:</strong>{' '}
                                    {r.has_notification
                                      ? `№ ${r.notification_no} (${r.notification_date || 'OK'})${r.ifns_code ? ` · İFNS ${r.ifns_code}` : ''}`
                                      : 'YOK (Alınmamış)'}
                                  </span>
                                  {r.application_date && (
                                    <span>
                                      <strong>1C Başvuru:</strong> {r.application_date}
                                    </span>
                                  )}
                                </div>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] border ${cMeta.cls}`}>
                                  {cMeta.label}
                                </span>
                              </div>

                              {empMonths.length === 0 ? (
                                <p className="text-[11px] text-slate-500">
                                  Bu çalışan için henüz aylık (Ocak–Aralık) kırılım verisi yok — <strong>5. 1C OData</strong> sekmesinden <em>1C OData&apos;dan Çek</em> butonuna basıldığında tüm aylık Patent &amp; 2-НДФЛ detayları otomatik dolar.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600 dark:text-slate-400">
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-950/70 border-l-2 border-emerald-500 inline-block" />
                                      Уведомление Alındı &amp; Mahsup Dönemi (Bu aydan itibaren mahsup zorunlu)
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-950/60 border border-amber-300 inline-block" />
                                      İzin Öncesi Kesilen НДФЛ (Geriye dönük mahsup / Возврат)
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="w-3 h-3 rounded-sm bg-rose-100 dark:bg-rose-950/60 border-l-2 border-rose-500 inline-block" />
                                      İzin Varken Mahsup Yapılmadı!
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11px] border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                                        <tr>
                                          <th className="py-1.5 px-2.5">Ay ({taxYear})</th>
                                          <th className="py-1.5 px-2.5 text-right">Ödenen Patent</th>
                                          <th className="py-1.5 px-2.5 text-right">Hesaplanan НДФЛ</th>
                                          <th className="py-1.5 px-2.5 text-right text-emerald-600">Mahsup Edilen</th>
                                          <th className="py-1.5 px-2.5 text-right">Kesilen НДФЛ</th>
                                          <th className="py-1.5 px-2.5 text-right text-amber-600">Aylık Eksik Mahsup</th>
                                          <th className="py-1.5 px-2.5">Aylık Analiz</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                                        {empMonths.map((em) => {
                                          const sc = em.status_code || '';
                                          const rowCls =
                                            sc === 'post_notif_missed' || sc === 'partial_missed'
                                              ? 'bg-rose-50/80 dark:bg-rose-950/35 border-l-4 border-l-rose-500'
                                              : sc === 'no_notif'
                                              ? 'bg-rose-50/50 dark:bg-rose-950/25'
                                              : em.is_notif_month
                                              ? 'bg-emerald-50/80 dark:bg-emerald-950/35 border-l-4 border-l-emerald-500'
                                              : em.is_after_notif
                                              ? 'bg-emerald-50/35 dark:bg-emerald-950/15 border-l-4 border-l-emerald-400/70'
                                              : sc === 'pre_notif_missed'
                                              ? 'bg-amber-50/70 dark:bg-amber-950/25'
                                              : '';
                                          const noteCls =
                                            sc === 'post_notif_missed' || sc === 'partial_missed' || sc === 'no_notif'
                                              ? 'text-rose-700 dark:text-rose-300 font-medium'
                                              : sc === 'pre_notif_missed'
                                              ? 'text-amber-800 dark:text-amber-300'
                                              : sc === 'full_offset' || sc === 'retro_offset'
                                              ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                                              : 'text-slate-600 dark:text-slate-300';
                                          return (
                                            <tr key={em.month} className={rowCls}>
                                              <td className="py-1.5 px-2.5 font-semibold font-mono whitespace-nowrap">
                                                <span>{String(em.month).padStart(2, '0')} · {em.label}</span>
                                                {em.is_notif_month && (
                                                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-sans font-semibold">
                                                    ✓ İzin Alındı ({r.notification_date || 'OK'})
                                                  </span>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono">{fmtRub(em.patent_paid)}</td>
                                              <td className="py-1.5 px-2.5 text-right font-mono">{fmtRub(em.ndfl_calc)}</td>
                                              <td className="py-1.5 px-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                                {fmtRub(em.offset_used)}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono">{fmtRub(em.ndfl_withheld)}</td>
                                              <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                                                {em.unoffset_gap > 0 ? fmtRub(em.unoffset_gap) : '—'}
                                              </td>
                                              <td className={`py-1.5 px-2.5 text-[10.5px] ${noteCls}`}>
                                                {em.analysis_note || '—'}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 font-semibold border-t border-slate-300 dark:border-slate-700">
                                        {(() => {
                                          const sumPatent = empMonths.reduce((s, m) => s + m.patent_paid, 0);
                                          const sumNdfl = empMonths.reduce((s, m) => s + m.ndfl_calc, 0);
                                          const sumOffset = empMonths.reduce((s, m) => s + m.offset_used, 0);
                                          const sumWithheld = empMonths.reduce((s, m) => s + m.ndfl_withheld, 0);
                                          const lowNdflExcess = Math.max(0, r.patent_advance_balance - r.additional_offset_potential);
                                          return (
                                            <tr>
                                              <td className="py-2 px-2.5 font-mono">TOPLAM ({taxYear})</td>
                                              <td className="py-2 px-2.5 text-right font-mono">{fmtRub(sumPatent)}</td>
                                              <td className="py-2 px-2.5 text-right font-mono">{fmtRub(sumNdfl)}</td>
                                              <td className="py-2 px-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                                {fmtRub(sumOffset)}
                                              </td>
                                              <td className="py-2 px-2.5 text-right font-mono">{fmtRub(sumWithheld)}</td>
                                              <td className="py-2 px-2.5 text-right font-mono text-indigo-600 dark:text-indigo-400">
                                                {r.additional_offset_potential > 0 ? fmtRub(r.additional_offset_potential) : '—'}
                                              </td>
                                              <td className="py-2 px-2.5 text-[10.5px] font-normal text-slate-700 dark:text-slate-200">
                                                Kalan Avans: <strong>{fmtRub(r.patent_advance_balance)}</strong>
                                                {r.additional_offset_potential > 0 && (
                                                  <> · Ek Mahsup / Возврат: <strong className="text-indigo-600 dark:text-indigo-400">{fmtRub(r.additional_offset_potential)}</strong></>
                                                )}
                                                {lowNdflExcess > 0 && (
                                                  <> · НДФЛ Yetersiz Kalan: <strong className="text-amber-600 dark:text-amber-400">{fmtRub(lowNdflExcess)}</strong></>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })()}
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500">
                          Gösterilecek kayıt bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {visibleCount < filteredRecords.length && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + 200)}
                    className="px-3 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 cursor-pointer"
                  >
                    +200 Daha Göster ({filteredRecords.length - visibleCount} kaldı)
                  </button>
                </div>
              )}

              {/* Register Discrepancies Sub-table */}
              {activeTab === 'reconciliation' && discrepancies.length > 0 && (
                <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 space-y-2">
                  <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>1C İşten Çıkış Register Uyuşmazlıkları ({discrepancies.length} kayıt · {fmtRub(summary.totalDiscrepancy)})</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10.5px] text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800">
                        <tr>
                          <th className="py-1.5 pr-2">Tabel</th>
                          <th className="py-1.5 px-2">ФИО</th>
                          <th className="py-1.5 px-2">Tarih</th>
                          <th className="py-1.5 px-2">Kaynak Belge</th>
                          <th className="py-1.5 px-2 text-right">Açıklanamayan Fark</th>
                          <th className="py-1.5 pl-2">Önerilen Aksiyon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200/60 dark:divide-amber-900/60">
                        {discrepancies.map((d) => (
                          <tr key={d.id}>
                            <td className="py-1.5 pr-2 font-mono">{d.tabel_no}</td>
                            <td className="py-1.5 px-2 font-medium">{d.full_name}</td>
                            <td className="py-1.5 px-2 font-mono">{d.period_date}</td>
                            <td className="py-1.5 px-2 text-[11px]">{d.source_doc}</td>
                            <td className="py-1.5 px-2 text-right font-mono font-semibold text-rose-600">{fmtRub(d.unexplained_amount)}</td>
                            <td className="py-1.5 pl-2 text-[11px]">{d.action_note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 1C ODATA + LEGAL GUIDE */}
          {activeTab === 'import_odata' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-700/70 space-y-3">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-500" />
                  <span>1C ZUP Canlı OData Bağlantısı (StandardODATA)</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  1C:ЗУП salt-okunur (read-only) OData erişimi tanımlandığında patent avansları, НДФЛ mahsupları ve ФНС bildirimleri tek tıkla otomatik çekilir.
                </p>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">1C OData Base URL</label>
                    <input
                      type="text"
                      value={odataUrl}
                      onChange={(e) => setOdataUrl(e.target.value)}
                      placeholder="https://1c.company.ru/zup/odata/standard.odata"
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Kullanıcı Adı</label>
                      <input
                        type="text"
                        value={odataUser}
                        onChange={(e) => setOdataUser(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Şifre</label>
                      <input
                        type="password"
                        value={odataPass}
                        onChange={(e) => setOdataPass(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Organizasyon Filtresi (Opsiyonel)</label>
                    <input
                      type="text"
                      value={odataOrg}
                      onChange={(e) => setOdataOrg(e.target.value)}
                      placeholder="ООО «Пондера Индастри»"
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  {odataLastSync && (
                    <div className="text-[11px] text-slate-500">Son OData senkronizasyonu: <strong>{odataLastSync}</strong></div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveOData}
                      disabled={odataBusy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Ayarları Kaydet</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncOData}
                      disabled={odataBusy || !odataUrl}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>1C OData&apos;dan Çek</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-emerald-500" />
                  <span>Rusya Patent НДФЛ Mahsup Mevzuatı (НК РФ ст. 227.1)</span>
                </h3>
                <ul className="list-disc pl-4 space-y-1.5 text-[11.5px]">
                  <li><strong>Mahsup Kuralı:</strong> Yıl içinde ödenen sabit patent avansları, çalışanın aynı yıl hesaplanan НДФЛ vergisinden düşülür (ikisinin küçüğü kadar: <code>min(Avans, НДФЛ)</code>).</li>
                  <li><strong>ФНС Bildirimi (Уведомление):</strong> İşveren mahsup yapabilmek için İFNS&apos;ye başvurur; ФНС&apos;nin yasal yanıt süresi <strong>10 iş günüdür</strong>.</li>
                  <li><strong>Geriye Dönük Mahsup:</strong> Bildirim yıl ortasında gelse dahi, ФНС açıklamasına göre mahsup sadece bildirim tarihinden değil <strong>yıl başından (Ocak) itibaren</strong> geriye dönük uygulanabilir.</li>
                  <li><strong>Yıl Geçişli Fişler &amp; КБК Kontrolü:</strong> Aralık ayında 3 aylık ödenen fişler eski/yeni yıl olarak bölünmeli; fişte <strong>КБК ЕНП</strong> yerine patent avans КБК&apos;sı olduğu doğrulanmalıdır.</li>
                  <li><strong>Yıl Sonu Kuralı (ФНС № БС-4-11/3920@):</strong> Başvuru ilgili yılda yapılıp bildirim ertesi yıl gelirse önceki yıl için düzeltme/iade yapılabilir.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
