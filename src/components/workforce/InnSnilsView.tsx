'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  ShieldCheck,
  Search,
  Upload,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Camera,
  Play,
  Send,
  Mail,
  FileSpreadsheet,
  Loader2,
  X,
  ClipboardList,
  Sparkles,
  UserCheck,
  Globe,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import WindowsTabBar from '@/components/common/WindowsTabBar';

interface InnSnilsRow {
  id: number;
  sicil_no: string;
  ad_soyad: string;
  tam_adi_kiril: string;
  uyruk: string;
  cinsiyet: string;
  dogum_tarihi: string;
  dogum_yeri: string;
  pasaport_no: string;
  pasaport_verilis: string;
  pasaport_veren: string;
  inn_no: string;
  eba_inn: string;
  snils_no: string;
  region: string;
  proje_adi: string;
  ise_giris_tarihi: string;
  cikis_tarihi: string;
  genel_durum: string;
  guncel_durum: string;
  telefon_no: string;
  email: string;
  inn_status: 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'APPLIED_STEP1' | 'APPLIED_STEP2' | 'ERROR';
  verified_inn: string;
  inn_verified_at: string;
  inn_screenshot: string;
  inn_application_no: string;
  inn_application_code: string;
  inn_error: string;
  snils_status: 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'ERROR';
  verified_snils: string;
  snils_verified_at: string;
  snils_screenshot: string;
  snils_error: string;
}

const LOCAL_BRIDGE_URL = 'http://127.0.0.1:8088';

export default function InnSnilsView() {
  const { user, getAuthHeaders } = useAuth();
  const { lang } = useLanguage();

  const [activeTab, setActiveTab] = useState<'verify' | 'apply'>('verify');
  const [items, setItems] = useState<InnSnilsRow[]>([]);
  const [summary, setSummary] = useState({ innVerified: 0, innNotFound: 0, innApplied: 0, snilsVerified: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'inn_missing' | 'inn_verified' | 'inn_not_found' | 'snils_verified' | 'unverified'
  >('all');
  const [includeExits, setIncludeExits] = useState(false);
  const [sicilFilterList, setSicilFilterList] = useState<string>('');
  const [showSicilModal, setShowSicilModal] = useState(false);
  const [sicilPasteText, setSicilPasteText] = useState('');
  const [selectedSicils, setSelectedSicils] = useState<Set<string>>(new Set());

  const [runningApiCheck, setRunningApiCheck] = useState(false);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [lightboxFile, setLightboxFile] = useState<string | null>(null);

  // INN Zayavka 1 & 2 config
  const [applicantFam, setApplicantFam] = useState('АХМЕДОВ');
  const [applicantNam, setApplicantNam] = useState('НЕМАТ');
  const [contactEmail, setContactEmail] = useState('ikbildirim@pondera.ru');
  const [contactPhone, setContactPhone] = useState('+79000000000');
  const [regAddress, setRegAddress] = useState(
    '188471, обл. Ленинградская, р-н. Кингисеппский, п. Усть-Луга, кв-л. Краколье, соор. 1'
  );
  const [regDate, setRegDate] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  });
  const [ifnsCode, setIfnsCode] = useState('4707');
  const [zayavka2Links, setZayavka2Links] = useState('');
  const [autoSubmitZ1, setAutoSubmitZ1] = useState(false);

  const sicilExcelRef = useRef<HTMLInputElement>(null);

  const fetchData = async (overrideSicils?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (includeExits) params.set('includeExits', 'true');
      const sParam = overrideSicils !== undefined ? overrideSicils : sicilFilterList;
      if (sParam.trim()) params.set('sicils', sParam.trim());
      params.set('limit', '1000');
      const res = await fetch(`/api/inn-snils?${params.toString()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      if (json?.success) {
        setItems(json.items || []);
        if (json.summary) setSummary(json.summary);
      }
    } catch {
      setFeedback({ type: 'error', text: 'INN/SNILS personel listesi yüklenemedi.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeExits, sicilFilterList, user?.id, user?.scope_type, user?.scope_value]);

  useEffect(() => {
    const pingBridge = async () => {
      try {
        const res = await fetch(`${LOCAL_BRIDGE_URL}/status`, { cache: 'no-store' });
        setBridgeOnline(res.ok);
      } catch {
        setBridgeOnline(false);
      }
    };
    pingBridge();
    const t = setInterval(pingBridge, 8000);
    return () => clearInterval(t);
  }, []);

  const handleUploadSicilExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
        const extracted: string[] = [];
        for (const row of rows) {
          for (const cell of row) {
            const val = String(cell || '').trim();
            if (/^\d{4,9}$/.test(val)) {
              extracted.push(val);
              break;
            }
          }
        }
        const unique = Array.from(new Set(extracted));
        if (unique.length === 0) {
          setFeedback({ type: 'error', text: 'Excel dosyasında geçerli Sicil numarası bulunamadı.' });
          return;
        }
        const joined = unique.join(',');
        setSicilFilterList(joined);
        setSelectedSicils(new Set(unique));
        setFeedback({
          type: 'success',
          text: `Excel'den ${unique.length} sicil yüklendi ve tablo filtrelendi.`,
        });
      } catch {
        setFeedback({ type: 'error', text: 'Sicil Excel dosyası okunamadı.' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleApplyPastedSicils = () => {
    const list = Array.from(
      new Set(
        sicilPasteText
          .split(/[\s,;|\n\r]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    setSicilFilterList(list.join(','));
    setSelectedSicils(new Set(list));
    setShowSicilModal(false);
    setFeedback({
      type: 'info',
      text: `${list.length} sicil için liste filtrelendi.`,
    });
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (activeTab === 'apply') {
        if (r.inn_status === 'VERIFIED') return false;
      }
      if (q) {
        const hay = `${r.sicil_no} ${r.ad_soyad} ${r.tam_adi_kiril} ${r.inn_no} ${r.snils_no} ${r.proje_adi} ${r.region} ${r.pasaport_no}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === 'inn_missing') return !r.inn_no && r.inn_status !== 'VERIFIED';
      if (statusFilter === 'inn_verified') return r.inn_status === 'VERIFIED';
      if (statusFilter === 'inn_not_found') return r.inn_status === 'NOT_FOUND';
      if (statusFilter === 'snils_verified') return r.snils_status === 'VERIFIED';
      if (statusFilter === 'unverified') return r.inn_status !== 'VERIFIED' || r.snils_status !== 'VERIFIED';
      return true;
    });
  }, [items, search, statusFilter, activeTab]);

  const toggleAll = () => {
    if (selectedSicils.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedSicils(new Set());
    } else {
      setSelectedSicils(new Set(filteredItems.map((i) => i.sicil_no)));
    }
  };

  const toggleOne = (sicil: string) => {
    setSelectedSicils((prev) => {
      const next = new Set(prev);
      if (next.has(sicil)) next.delete(sicil);
      else next.add(sicil);
      return next;
    });
  };

  const getSelectedRows = () => items.filter((i) => selectedSicils.has(i.sicil_no));

  const handleDirectFnsInnCheck = async () => {
    const chosen = getSelectedRows().filter((r) => r.inn_status !== 'VERIFIED');
    if (chosen.length === 0) {
      setFeedback({
        type: 'info',
        text: 'Seçili personellerin tümü zaten doğrulanmış veya hiç personel seçilmedi.',
      });
      return;
    }
    setRunningApiCheck(true);
    setFeedback({ type: 'info', text: `${chosen.length} personel için FNS (nalog.ru) INN sorgusu yapılıyor...` });
    try {
      const res = await fetch('/api/inn-snils', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'verify_inn_direct', workers: chosen }),
      });
      const json = await res.json();
      if (json?.success) {
        const foundCnt = (json.results || []).filter((x: any) => x.status === 'VERIFIED').length;
        const notFoundCnt = (json.results || []).filter((x: any) => x.status === 'NOT_FOUND').length;
        setFeedback({
          type: 'success',
          text: `FNS sorgusu tamamlandı: ${foundCnt} INN bulundu, ${notFoundCnt} bulunamadı (Заявка 1'e hazır).`,
        });
        fetchData();
      } else {
        setFeedback({ type: 'error', text: json?.message || 'FNS sorgusu başarısız oldu.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'FNS sunucu bağlantısı başarısız.' });
    } finally {
      setRunningApiCheck(false);
    }
  };

  const handleLaunchLocalRobot = async (
    task: 'inn_check' | 'snils_check' | 'inn_zayavka_1' | 'inn_zayavka_2'
  ) => {
    if (!bridgeOnline) {
      setFeedback({
        type: 'error',
        text: 'Yerel RPA Bridge (127.0.0.1:8088) bağlı değil. Bilgisayarınızdaki Pondera RPA Ajanını başlatın.',
      });
      return;
    }
    const chosen = getSelectedRows();
    if (task !== 'inn_zayavka_2' && chosen.length === 0) {
      setFeedback({ type: 'error', text: 'Lütfen en az bir personel seçin.' });
      return;
    }
    if (task === 'inn_zayavka_2' && !zayavka2Links.trim()) {
      setFeedback({ type: 'error', text: 'Lütfen mailden gelen service.nalog.ru/zpufl linklerini yapıştırın.' });
      return;
    }

    const records = (chosen.length > 0 ? chosen : items).map((r) => {
      const parts = String(r.tam_adi_kiril || r.ad_soyad || '')
        .trim()
        .split(/\s+/);
      return {
        sicil_no: r.sicil_no,
        ad_soyad: r.ad_soyad,
        tam_adi_kiril: r.tam_adi_kiril,
        fam: parts[0] || '',
        nam: parts[1] || '',
        otch: parts.slice(2).join(' ') || '',
        cinsiyet: r.cinsiyet,
        dogum_tarihi: r.dogum_tarihi,
        dogum_yeri: r.dogum_yeri,
        uyruk: r.uyruk,
        pasaport_no: r.pasaport_no,
        pasaport_verilis: r.pasaport_verilis,
        pasaport_veren: r.pasaport_veren,
        snils_no: r.snils_no,
      };
    });

    try {
      const res = await fetch(`${LOCAL_BRIDGE_URL}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: task,
          records,
          config: {
            REG_ADDRESS: regAddress,
            CONTACT_EMAIL: contactEmail,
            CONTACT_PHONE: contactPhone,
            REG_DATE: regDate,
            APPLICANT_FAM: applicantFam,
            APPLICANT_NAM: applicantNam,
            IFNS_CODE: ifnsCode,
            AUTO_SUBMIT: autoSubmitZ1,
            EMAIL_LINKS: zayavka2Links
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean),
          },
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setFeedback({
          type: 'success',
          text:
            task === 'snils_check'
              ? `SNILS kontrol robotu ${records.length} kişi için açıldı. Chrome'da reCAPTCHA'yı elle onaylayıp Devam Et'e basın; ekran görüntüsü otomatik kaydedilecek.`
              : `${task} robotu ${records.length} kayıt için başlatıldı; sonuçlar ve ekran görüntüleri otomatik sunucuya kaydedilecektir.`,
        });
      } else {
        setFeedback({ type: 'error', text: json?.message || 'Robot başlatılamadı.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Yerel RPA Bridge ile iletişim kurulamadı.' });
    }
  };

  const handleExportExcel = () => {
    const rows = filteredItems.map((r) => ({
      'Sicil No': r.sicil_no,
      'Ad Soyad': r.ad_soyad,
      'Kiril Ad Soyad': r.tam_adi_kiril,
      Şantiye: r.proje_adi || r.region,
      Durum: r.genel_durum,
      'İşe Giriş': r.ise_giris_tarihi,
      Çıkış: r.cikis_tarihi,
      'INN No': r.verified_inn || r.inn_no,
      'INN Durumu': r.inn_status,
      'INN Doğrulama Tarihi': r.inn_verified_at,
      'INN Başvuru No': r.inn_application_no,
      'SNILS No': r.verified_snils || r.snils_no,
      'SNILS Durumu': r.snils_status,
      'SNILS Doğrulama Tarihi': r.snils_verified_at,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'INN_SNILS');
    XLSX.writeFile(wb, `Pondera_INN_SNILS_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="pondera-3d-page p-3 sm:p-5 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* 3D Slanted Left-Aligned Equal-Width Ribbon Tabs */}
      <div>
        <WindowsTabBar
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'verify' | 'apply')}
          tabs={[
            {
              id: 'verify',
              label: lang === 'ru' ? '1. Проверка ИНН/СНИЛС' : '1. INN & SNILS Kontrol',
              badge: items.length,
              icon: <ShieldCheck className="w-3.5 h-3.5" />,
            },
            {
              id: 'apply',
              label: lang === 'ru' ? '2. Заявка ИНН (1 & 2)' : '2. INN Başvuru (Zayavka)',
              badge: summary.innNotFound,
              icon: <Send className="w-3.5 h-3.5" />,
            },
          ]}
          rightSlot={
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border ${
                bridgeOnline
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${bridgeOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>{bridgeOnline ? 'RPA Köprüsü Aktif (8088)' : 'RPA Köprüsü Kapalı'}</span>
            </span>
          }
        />

        {/* Main Panel Container */}
        <div className="rounded-b-2xl rounded-tr-2xl border border-slate-200 dark:border-slate-600/80 p-4 sm:p-5 space-y-4">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300">Doğrulanmış INN</p>
                <p className="text-xl text-emerald-600 dark:text-emerald-400 mt-0.5">{summary.innVerified}</p>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-500 opacity-80" />
            </div>
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300">INN Bulunamadı (Başvuru Adayı)</p>
                <p className="text-xl text-amber-600 dark:text-amber-400 mt-0.5">{summary.innNotFound}</p>
              </div>
              <AlertTriangle className="w-6 h-6 text-amber-500 opacity-80" />
            </div>
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300">INN Başvurusu Yapılan</p>
                <p className="text-xl text-indigo-600 dark:text-indigo-400 mt-0.5">{summary.innApplied}</p>
              </div>
              <Send className="w-6 h-6 text-indigo-500 opacity-80" />
            </div>
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300">Doğrulanmış SNILS</p>
                <p className="text-xl text-sky-600 dark:text-sky-400 mt-0.5">{summary.snilsVerified}</p>
              </div>
              <UserCheck className="w-6 h-6 text-sky-500 opacity-80" />
            </div>
          </div>

          {/* Feedback Banner */}
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

          {/* TAB 2 EXTRA CONFIG: INN Zayavka 1 & 2 Controls */}
          {activeTab === 'apply' && (
            <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-700/60 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>FNS (service.nalog.ru/zpufl) — INN Başvuru Ayarları (Заявка 1 &amp; Заявка 2)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleLaunchLocalRobot('inn_zayavka_1')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>1. Заявка 1 Başlat ({selectedSicils.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLaunchLocalRobot('inn_zayavka_2')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>2. Заявка 2 Başlat (Mail Linkleri)</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Başvuran Soyad (Kiril)</label>
                  <input
                    type="text"
                    value={applicantFam}
                    onChange={(e) => setApplicantFam(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Başvuran Ad (Kiril)</label>
                  <input
                    type="text"
                    value={applicantNam}
                    onChange={(e) => setApplicantNam(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Dönüş E-Posta</label>
                  <input
                    type="text"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">IFNS Kodu</label>
                  <input
                    type="text"
                    value={ifnsCode}
                    onChange={(e) => setIfnsCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Kayıt Tarihi</label>
                  <input
                    type="text"
                    value={regDate}
                    onChange={(e) => setRegDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">Varsayılan Kayıt Adresi (АдресРФ)</label>
                  <input
                    type="text"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">
                    Заявка 2 Onay Linkleri (Mailden gelen service.nalog.ru/zpufl/... linklerini her satıra 1 adet yapıştırın)
                  </label>
                  <textarea
                    rows={2}
                    value={zayavka2Links}
                    onChange={(e) => setZayavka2Links(e.target.value)}
                    placeholder="https://service.nalog.ru/zpufl/..."
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#0b1426]"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSubmitZ1}
                  onChange={(e) => setAutoSubmitZ1(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Заявка 1 formunda &laquo;Отправить&raquo; otomatik basılsın (kapalıysa gönderim öncesi kontrol için duraklar)</span>
              </label>
            </div>
          )}

          {/* Toolbar: Search, Filters, Sicil List Upload, Verify Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Sicil, Ad Soyad, INN, SNILS, Şantiye..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 w-60"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
              >
                <option value="all">Tümü ({items.length})</option>
                <option value="inn_missing">INN Eksik</option>
                <option value="inn_verified">INN Doğrulanmış</option>
                <option value="inn_not_found">INN Bulunamadı</option>
                <option value="snils_verified">SNILS Doğrulanmış</option>
                <option value="unverified">Henüz Doğrulanmamış</option>
              </select>

              <button
                type="button"
                onClick={() => sicilExcelRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Sicil Excel Yükle</span>
              </button>
              <input ref={sicilExcelRef} type="file" accept=".xlsx,.xls" onChange={handleUploadSicilExcel} className="hidden" />

              <button
                type="button"
                onClick={() => setShowSicilModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 cursor-pointer"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Sicil Yapıştır</span>
              </button>

              {sicilFilterList && (
                <button
                  type="button"
                  onClick={() => {
                    setSicilFilterList('');
                    setSicilPasteText('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Sicil Filtresini Temizle</span>
                </button>
              )}

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeExits}
                  onChange={(e) => setIncludeExits(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Çıkışlılar Dahil</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'verify' && (
                <>
                  <button
                    type="button"
                    onClick={handleDirectFnsInnCheck}
                    disabled={runningApiCheck || selectedSicils.size === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 cursor-pointer"
                  >
                    {runningApiCheck ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Hızlı INN Kontrol ({selectedSicils.size})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLaunchLocalRobot('inn_check')}
                    disabled={selectedSicils.size === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
                    title="Gerçek Chrome penceresinde service.nalog.ru/inn.do üzerinden sorgular ve resmi ekran görüntüsünü sunucuya arşivler"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>nalog.ru Ekran Görüntüsü Al ({selectedSicils.size})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLaunchLocalRobot('snils_check')}
                    disabled={selectedSicils.size === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 cursor-pointer"
                    title="Chrome'da SNILS formunu doldurur; operatör reCAPTCHA'yı elle onaylayınca sonuç + ekran görüntüsü kaydedilir"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>SNILS Kontrol (Manuel CAPTCHA)</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() => fetchData()}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 cursor-pointer"
                title="Yenile"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[540px] overflow-y-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-[#0D192E] text-[11px] text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={filteredItems.length > 0 && selectedSicils.size === filteredItems.length}
                      onChange={toggleAll}
                      className="rounded border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 px-2.5">Sicil</th>
                  <th className="py-2.5 px-2.5">Ad Soyad / Kiril</th>
                  <th className="py-2.5 px-2.5">Doğum &amp; Pasaport (FNS Verisi)</th>
                  <th className="py-2.5 px-2.5">Şantiye / Proje</th>
                  <th className="py-2.5 px-2.5">Giriş / Çıkış / Durum</th>
                  <th className="py-2.5 px-2.5">INN No &amp; Doğrulama</th>
                  <th className="py-2.5 px-2.5">SNILS No &amp; Doğrulama</th>
                  <th className="py-2.5 px-2.5">Ekran Görüntüsü</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredItems.slice(0, 200).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={selectedSicils.has(r.sicil_no)}
                        onChange={() => toggleOne(r.sicil_no)}
                        className="rounded border-slate-300 cursor-pointer"
                      />
                    </td>
                    <td className="py-2 px-2.5 font-mono text-slate-900 dark:text-white">{r.sicil_no}</td>
                    <td className="py-2 px-2.5">
                      <div className="text-slate-900 dark:text-white">{r.ad_soyad}</div>
                      {r.tam_adi_kiril ? (
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">{r.tam_adi_kiril}</div>
                      ) : (
                        <div className="text-[10px] text-rose-500">Kiril Ad Soyad Eksik!</div>
                      )}
                    </td>
                    <td className="py-2 px-2.5">
                      <div className={`font-mono text-[11px] ${r.pasaport_no ? 'text-slate-900 dark:text-white' : 'text-rose-500'}`}>
                        {r.pasaport_no || 'Pasaport Eksik!'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        D.T: <span className={r.dogum_tarihi ? '' : 'text-rose-500'}>{r.dogum_tarihi || 'Eksik'}</span>
                        {' • '}Ver: {r.pasaport_verilis || '—'}
                      </div>
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="text-slate-800 dark:text-slate-200">{r.proje_adi || r.region || '—'}</div>
                      <div className="text-[10px] text-slate-500">{r.uyruk}</div>
                    </td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${
                          r.genel_durum === 'Mevcut'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {r.genel_durum}
                      </span>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        {r.ise_giris_tarihi || '—'} {r.cikis_tarihi ? `→ ${r.cikis_tarihi}` : ''}
                      </div>
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="font-mono text-slate-900 dark:text-white">{r.verified_inn || r.inn_no || '—'}</div>
                      {r.inn_status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Doğrulandı ({r.inn_verified_at?.slice(0, 10) || 'OK'})
                        </span>
                      ) : r.inn_status === 'NOT_FOUND' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          Bulunamadı (Заявка 1)
                        </span>
                      ) : r.inn_status === 'APPLIED_STEP1' || r.inn_status === 'APPLIED_STEP2' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400">
                          <Send className="w-3 h-3" />
                          {r.inn_status === 'APPLIED_STEP2'
                            ? `Başvuru Tamam (${r.inn_application_no || 'OK'})`
                            : 'Заявка 1 Gönderildi'}
                        </span>
                      ) : r.inn_status === 'ERROR' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-500" title={r.inn_error}>
                          <XCircle className="w-3 h-3" />
                          Hata
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Kontrol Bekliyor</span>
                      )}
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="font-mono text-slate-900 dark:text-white">{r.verified_snils || r.snils_no || '—'}</div>
                      {r.snils_status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Doğrulandı ({r.snils_verified_at?.slice(0, 10) || 'OK'})
                        </span>
                      ) : r.snils_status === 'NOT_FOUND' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-500">
                          <XCircle className="w-3 h-3" />
                          Eşleşmedi
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Kontrol Bekliyor</span>
                      )}
                    </td>
                    <td className="py-2 px-2.5">
                      <div className="flex items-center gap-1.5">
                        {r.inn_screenshot && (
                          <button
                            type="button"
                            onClick={() => setLightboxFile(r.inn_screenshot)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>INN</span>
                          </button>
                        )}
                        {r.snils_screenshot && (
                          <button
                            type="button"
                            onClick={() => setLightboxFile(r.snils_screenshot)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 cursor-pointer"
                          >
                            <Camera className="w-3 h-3" />
                            <span>SNILS</span>
                          </button>
                        )}
                        {!r.inn_screenshot && !r.snils_screenshot && (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      <FileSpreadsheet className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
                      Gösterilecek kayıt bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sicil Paste Modal */}
      {showSicilModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#13213a] rounded-2xl border border-slate-200 dark:border-slate-600 max-w-md w-full p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-slate-900 dark:text-white">Sicil Listesi ile Personel Getir</h3>
              <button type="button" onClick={() => setShowSicilModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Excel&apos;den kopyaladığınız sicil numaralarını alt alta veya virgülle ayırarak yapıştırın:
            </p>
            <textarea
              rows={6}
              value={sicilPasteText}
              onChange={(e) => setSicilPasteText(e.target.value)}
              placeholder={"902770\n903161\n800127"}
              className="w-full p-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-[#0b1426] text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSicilModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleApplyPastedSicils}
                className="px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                Personelleri Getir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Lightbox Modal */}
      {lightboxFile && (
        <div
          onClick={() => setLightboxFile(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#13213a] rounded-2xl border border-slate-300 dark:border-slate-600 max-w-4xl w-full p-4 space-y-3 shadow-2xl cursor-default"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-700 dark:text-slate-200">{lightboxFile}</span>
              <button type="button" onClick={() => setLightboxFile(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={`/api/inn-snils/screenshot?file=${encodeURIComponent(lightboxFile)}`}
              alt={lightboxFile}
              className="w-full max-h-[75vh] object-contain rounded-xl border border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>
      )}
    </div>
  );
}
