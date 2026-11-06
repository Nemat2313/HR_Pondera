'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Scale,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Users,
  Search,
  Download,
  Upload,
  Send,
  Building2,
  Info,
  FileSpreadsheet,
  RefreshCw,
  FileWarning,
  UserX,
  UserCheck,
  BadgeAlert,
  IdCard,
  Hash,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  Filter,
  BarChart3,
  ArrowLeftRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/LanguageContext';

interface ZupMetadata {
  ebaDate: string;
  zupDate: string;
  zupSourceFile: string;
  zupLastUpdated: string;
  isZupOutdated: boolean;
  hasZupPassportColumn?: boolean;
  hasZupInnColumn?: boolean;
  hasZupDepartmentColumn?: boolean;
}

interface ZupDiscrepancyCounts {
  statusExitInReal: number;
  siteTransferPermitCheck?: number;
  missingInZupMainFirm: number;
  missingInZupSubcon: number;
  zupOnlyNoEba: number;
  passportMismatch: number;
  permitStatusMismatch: number;
  innMismatch: number;
  missingInnInEba: number;
  sicilFormatDiff: number;
  birthDateMismatch: number;
  kirilNameDiff: number;
  hireDateDiff: number;
}

interface ZupSummary {
  realActiveTotal: number;
  realActiveMainFirm: number;
  realActiveSubcon: number;
  zupOfficialTotal: number;
  matchedActiveBoth: number;
  matchedActiveMainFirm: number;
  matchedActiveRateAll: number;
  matchedActiveRateMainFirm: number;
  matchedExactSicilCount: number;
  matchedNormSicilCount: number;
  matchedByDocOrInnCount: number;
  realActiveNotInZupTotal: number;
  realActiveNotInZupMainFirm: number;
  realActiveNotInZupSubcon: number;
  realActiveNotInZupRecentHire: number;
  zupActiveButRealExited: number;
  zupTransferPermitCheckCount?: number;
  zupOnlyNotInRealDB: number;
  totalMatchedWithDataDiff: number;
  discrepancyCounts: ZupDiscrepancyCounts;
}

interface ProjectComparison {
  project: string;
  realActive: number;
  inZupOfficial: number;
  missingMainFirm: number;
  missingSubcon: number;
  zupActiveRealExit: number;
  transferCount?: number;
  officialRatePct: number;
}

interface RegionComparison {
  region: string;
  realActive: number;
  inZupOfficial: number;
  missingMainFirm: number;
  missingSubcon: number;
  zupActiveRealExit: number;
  transferCount?: number;
  officialRatePct: number;
  projects?: ProjectComparison[];
}

interface PermitComparison {
  key: string;
  labelTr: string;
  labelRu: string;
  shortTr?: string;
  shortRu?: string;
  zupCount: number;
  zupActiveMatched?: number;
  zupTransferCount?: number;
  zupRealExitedCount?: number;
  realActiveCount: number;
  realOnlyMainCount?: number;
  realOnlySubconCount?: number;
  diff: number;
}

interface AuditRecord {
  id: string;
  category:
    | 'ZUP_ACTIVE_REAL_EXIT'
    | 'SITE_TRANSFER_PERMIT_CHECK'
    | 'REAL_ACTIVE_NO_ZUP_MAIN'
    | 'REAL_ACTIVE_NO_ZUP_SUBCON'
    | 'ZUP_ONLY_NO_EBA'
    | 'DATA_DIFF'
    | 'FULL_MATCH';
  risk: 'Kritik' | 'Orta' | 'Dusuk';
  matchMethod: string;
  diffFlags: string[];
  sicil_no: string;
  zup_tabel_no: string;
  name: string;
  kiril_name: string;
  uyruk: string;
  region: string;
  proje_adi: string;
  firma: string;
  gorev: string;
  zup_position?: string;
  zup_department?: string;
  zup_department_tr?: string;
  zup_department_ru?: string;
  zup_work_state?: string;
  eba_status: string;
  zup_status: string;
  eba_permit: string;
  zup_permit: string;
  zup_tax_status: string;
  eba_passport: string;
  zup_passport: string;
  eba_inn: string;
  zup_inn: string;
  eba_hire_date: string;
  zup_hire_date: string;
  eba_exit_date: string;
  diffDetailsTr: string[];
  diffDetailsRu: string[];
}

interface ZupReconciliationResponse {
  success: boolean;
  metadata: ZupMetadata;
  summary: ZupSummary;
  byRegion: RegionComparison[];
  byPermitStatus: PermitComparison[];
  records: AuditRecord[];
}

type FilterCategory =
  | 'ALL_DIFFS'
  | 'ALL'
  | 'ZUP_ACTIVE_REAL_EXIT'
  | 'SITE_TRANSFER_PERMIT_CHECK'
  | 'REAL_ACTIVE_NO_ZUP_MAIN'
  | 'REAL_ACTIVE_NO_ZUP_SUBCON'
  | 'ZUP_ONLY_NO_EBA'
  | 'PASSPORT_DIFF'
  | 'PERMIT_DIFF'
  | 'INN_DIFF'
  | 'INN_MISSING_EBA'
  | 'SICIL_FORMAT'
  | 'DOB_KIRIL_DIFF'
  | 'FULL_MATCH';

export default function OfficialVsRealView() {
  const { lang } = useLanguage();
  const [data, setData] = useState<ZupReconciliationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [sendingTelegram, setSendingTelegram] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [selectedFilter, setSelectedFilter] = useState<FilterCategory>('ALL_DIFFS');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [selectedPermitKey, setSelectedPermitKey] = useState<string>('ALL');
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({ Kazan: false });
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [showOutdatedModal, setShowOutdatedModal] = useState<boolean>(false);
  const pageSize = 25;
  const tableSectionRef = useRef<HTMLDivElement | null>(null);

  const scrollToTable = () => {
    setTimeout(() => {
      tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchReconciliation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/zup', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success) {
        setData(json);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReconciliation();
  }, []);

  const handleUploadZupExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setBannerMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/zup', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (json?.success) {
        setData(json);
        const countNum = Number(json.uploadedCount ?? json.summary?.zupOfficialTotal ?? 0);
        const repDate = json.reportDate || json.metadata?.zupDate || '';
        setBannerMessage({
          type: 'success',
          text:
            lang === 'ru'
              ? `Список 1С ЗУП успешно загружен (${countNum.toLocaleString('ru-RU')} сотр., дата: ${repDate}). Сверка обновлена!`
              : `1C ZUP resmi personel listesi başarıyla yüklendi (${countNum.toLocaleString('tr-TR')} personel, Tarih: ${repDate}). Karşılaştırma güncellendi!`,
        });
      } else {
        setBannerMessage({
          type: 'error',
          text: json?.message || (lang === 'ru' ? 'Ошибка загрузки файла 1С ЗУП' : '1C ZUP dosyası yüklenemedi.'),
        });
      }
    } catch {
      setBannerMessage({
        type: 'error',
        text: lang === 'ru' ? 'Ошибка соединения при загрузке файла' : 'Dosya yüklenirken bağlantı hatası oluştu.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSendTelegramSummary = async () => {
    setSendingTelegram(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/zup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_telegram' }),
      });
      const json = await res.json();
      if (json?.success) {
        setBannerMessage({
          type: 'success',
          text:
            lang === 'ru'
              ? 'Сводка расхождений 1С ЗУП vs eBA Real успешно отправлена в группу Telegram!'
              : '1C ZUP (Resmi) vs eBA (Real) fark özeti raporu Telegram grubuna başarıyla gönderildi!',
        });
      } else {
        setBannerMessage({
          type: 'error',
          text:
            json?.message ||
            (lang === 'ru' ? 'Не удалось отправить сообщение в Telegram' : 'Telegram mesajı gönderilemedi.'),
        });
      }
    } catch {
      setBannerMessage({
        type: 'error',
        text: lang === 'ru' ? 'Ошибка при отправке в Telegram' : 'Telegram gönderimi sırasında hata oluştu.',
      });
    } finally {
      setSendingTelegram(false);
    }
  };

  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    const q = search.trim().toLowerCase();

    return data.records.filter((r) => {
      if (selectedRegion !== 'ALL' && r.region !== selectedRegion) {
        return false;
      }
      if (selectedProject !== 'ALL' && r.proje_adi !== selectedProject) {
        return false;
      }
      if (selectedPermitKey !== 'ALL') {
        const ebaNorm = r.eba_permit === 'RF_CITIZEN' || r.eba_permit === 'VNJ_RVP' ? 'RESIDENT' : r.eba_permit;
        if (r.zup_permit !== selectedPermitKey && ebaNorm !== selectedPermitKey) {
          return false;
        }
      }

      switch (selectedFilter) {
        case 'ALL_DIFFS':
          if (r.category === 'FULL_MATCH') return false;
          break;
        case 'ZUP_ACTIVE_REAL_EXIT':
          if (r.category !== 'ZUP_ACTIVE_REAL_EXIT') return false;
          break;
        case 'SITE_TRANSFER_PERMIT_CHECK':
          if (r.category !== 'SITE_TRANSFER_PERMIT_CHECK' && !r.diffFlags.includes('SITE_TRANSFER_PERMIT_CHECK'))
            return false;
          break;
        case 'REAL_ACTIVE_NO_ZUP_MAIN':
          if (r.category !== 'REAL_ACTIVE_NO_ZUP_MAIN') return false;
          break;
        case 'REAL_ACTIVE_NO_ZUP_SUBCON':
          if (r.category !== 'REAL_ACTIVE_NO_ZUP_SUBCON') return false;
          break;
        case 'ZUP_ONLY_NO_EBA':
          if (r.category !== 'ZUP_ONLY_NO_EBA') return false;
          break;
        case 'PASSPORT_DIFF':
          if (!r.diffFlags.includes('PASSPORT_DIFF')) return false;
          break;
        case 'PERMIT_DIFF':
          if (!r.diffFlags.includes('PERMIT_DIFF')) return false;
          break;
        case 'INN_DIFF':
          if (!r.diffFlags.includes('INN_DIFF')) return false;
          break;
        case 'INN_MISSING_EBA':
          if (!r.diffFlags.includes('INN_MISSING_EBA')) return false;
          break;
        case 'SICIL_FORMAT':
          if (!r.diffFlags.includes('SICIL_FORMAT')) return false;
          break;
        case 'DOB_KIRIL_DIFF':
          if (!r.diffFlags.includes('DOB_DIFF') && !r.diffFlags.includes('KIRIL_NAME_DIFF')) return false;
          break;
        case 'FULL_MATCH':
          if (r.category !== 'FULL_MATCH') return false;
          break;
        case 'ALL':
        default:
          break;
      }

      if (q) {
        const hay = `${r.sicil_no} ${r.zup_tabel_no} ${r.name} ${r.kiril_name} ${r.uyruk} ${r.region} ${r.proje_adi} ${r.firma} ${r.zup_department || ''} ${r.zup_department_tr || ''} ${r.eba_passport} ${r.zup_passport} ${r.eba_inn} ${r.zup_inn}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [data, selectedFilter, selectedRegion, selectedProject, selectedPermitKey, search]);

  useEffect(() => {
    setPage(1);
  }, [selectedFilter, selectedRegion, selectedProject, selectedPermitKey, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page]);

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Executive Summary
    const s = data.summary;
    const summaryRows = [
      {
        Metrik: 'eBA Real Veri Tarihi',
        Deger: data.metadata.ebaDate,
        Aciklama: 'Canlı eBA sistemindeki son personel listesi tarihi',
      },
      {
        Metrik: '1C ZUP Resmi Liste Tarihi',
        Deger: data.metadata.zupDate,
        Aciklama: data.metadata.isZupOutdated
          ? 'UYARI: 1C ZUP listesi eBA tarihinden eskidir, güncellenmesi gerekir'
          : 'Güncel',
      },
      {
        Metrik: 'Real (eBA) Aktif Toplam Kadro',
        Deger: s.realActiveTotal,
        Aciklama: `Pondera Ana Kadro: ${s.realActiveMainFirm} | Taşeron: ${s.realActiveSubcon}`,
      },
      {
        Metrik: '1C ZUP Resmi Aktif Kadro',
        Deger: s.zupOfficialTotal,
        Aciklama: data.metadata.zupSourceFile,
      },
      {
        Metrik: 'Hem Realde Aktif Hem Resmide (1C ZUP) Çalışan',
        Deger: s.matchedActiveBoth,
        Aciklama: `Ana Kadroda Resmi Oran: %${s.matchedActiveRateMainFirm} | Tüm Sahada: %${s.matchedActiveRateAll}`,
      },
      {
        Metrik: '1C ZUPta Aktif Görünüp Realde (eBA) ÇIKIŞ Yapılmış',
        Deger: s.zupActiveButRealExited,
        Aciklama: 'Kritik: Sahadan ayrılmış ancak 1C ZUP resmi çıkışı düşülmemiş personel',
      },
      {
        Metrik: 'Realde (Pondera Ana Kadro) Aktif Olup 1C ZUPta Olmayan',
        Deger: s.realActiveNotInZupMainFirm,
        Aciklama: `${data.metadata.zupDate.slice(0, 5)} sonrası yeni işe giren: ${s.realActiveNotInZupRecentHire}`,
      },
      {
        Metrik: 'Realde (Taşeron) Aktif Olup 1C ZUPta Olmayan',
        Deger: s.realActiveNotInZupSubcon,
        Aciklama: 'Taşeron firma bordrosundaki personeller',
      },
      {
        Metrik: 'Sadece 1C ZUPta Kaydı Olup eBAda Hiç Olmayan',
        Deger: s.zupOnlyNotInRealDB,
        Aciklama: 'eBA veritabanında sicil/isim kaydı bulunmayanlar',
      },
      {
        Metrik: 'Pasaport Numarası Uyuşmazlığı',
        Deger: s.discrepancyCounts.passportMismatch,
        Aciklama: '1C ZUP ve eBA pasaport numaraları farklı olanlar',
      },
      {
        Metrik: 'Çalışma / Vergi Statüsü Farkı (VKS / Patent / RNR)',
        Deger: s.discrepancyCounts.permitStatusMismatch,
        Aciklama: '1C ZUP statüsü ile eBA izin türü farklı olanlar',
      },
      {
        Metrik: 'İNN Numarası Farklı Olanlar',
        Deger: s.discrepancyCounts.innMismatch,
        Aciklama: '1C ZUP ve eBA İNN numarası uyuşmayanlar',
      },
      {
        Metrik: '1C ZUPta İNN Var / eBAda İNN Eksik',
        Deger: s.discrepancyCounts.missingInnInEba,
        Aciklama: '1C ZUPtan eBAya aktarılması gereken İNN numaraları',
      },
      {
        Metrik: 'Sicil No Format Farkı (Nokta / Harf Eki)',
        Deger: s.discrepancyCounts.sicilFormatDiff,
        Aciklama: 'Örn: 922844. veya 911615а gibi sicil yazım farkları',
      },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), '1_Genel_Mutabakat');

    // Sheet 2: ZUP Active but Real Exited
    const exitedInReal = data.records
      .filter((r) => r.category === 'ZUP_ACTIVE_REAL_EXIT')
      .map((r) => ({
        'eBA Sicil No': r.sicil_no,
        '1C ZUP Tabel No': r.zup_tabel_no,
        'Ad Soyad': r.name,
        'Kiril İsim (1C ZUP)': r.kiril_name,
        Uyruk: r.uyruk,
        Bölge: r.region,
        Proje: r.proje_adi,
        '1C Resmi Şube (Подразделение)': r.zup_department_tr || r.zup_department || '—',
        '1C Durum (Состояние)': r.zup_work_state || 'Работа',
        Firma: r.firma,
        'eBA Durum': r.eba_status,
        'eBA Çıkış Tarihi': r.eba_exit_date,
        '1C ZUP Statü': r.zup_tax_status,
        'Pasaport (eBA)': r.eba_passport,
        'Pasaport (ZUP)': r.zup_passport,
        'Tespit Edilen Fark': r.diffDetailsTr.join(' | '),
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exitedInReal), '2_ZUP_Aktif_Real_Cikis');

    // Sheet 3: Real Main Firm Active but Missing in ZUP
    const missingMain = data.records
      .filter((r) => r.category === 'REAL_ACTIVE_NO_ZUP_MAIN')
      .map((r) => ({
        'eBA Sicil No': r.sicil_no,
        'Ad Soyad': r.name,
        'Kiril İsim': r.kiril_name,
        Uyruk: r.uyruk,
        Bölge: r.region,
        Proje: r.proje_adi,
        Firma: r.firma,
        Görevi: r.gorev,
        'eBA İzin Türü': r.eba_permit,
        'eBA İşe Giriş': r.eba_hire_date,
        Pasaport: r.eba_passport,
        İNN: r.eba_inn,
        Açıklama: r.diffDetailsTr.join(' | '),
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(missingMain), '3_AnaKadro_ZUP_Eksik');

    // Sheet 4: Data Discrepancies (Passport, Permit, INN, DOB)
    const dataDiffs = data.records
      .filter(
        (r) =>
          r.diffFlags.includes('PASSPORT_DIFF') ||
          r.diffFlags.includes('PERMIT_DIFF') ||
          r.diffFlags.includes('INN_DIFF') ||
          r.diffFlags.includes('DOB_DIFF') ||
          r.category === 'ZUP_ONLY_NO_EBA'
      )
      .map((r) => ({
        'eBA Sicil': r.sicil_no,
        'ZUP Tabel No': r.zup_tabel_no,
        'Ad Soyad': r.name,
        'Kiril İsim': r.kiril_name,
        Bölge: r.region,
        'eBA Statü': r.eba_permit,
        'ZUP Statü': r.zup_permit,
        'eBA Pasaport': r.eba_passport,
        'ZUP Pasaport': r.zup_passport,
        'eBA İNN': r.eba_inn,
        'ZUP İNN': r.zup_inn,
        'Uyuşmazlık Detayı': r.diffDetailsTr.join(' | '),
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataDiffs), '4_Veri_Uyusmazliklari');

    // Sheet 5: Region Summary
    const regRows = data.byRegion.map((r) => ({
      Bölge: r.region,
      'Real (eBA) Aktif': r.realActive,
      'Resmide (1C ZUP) Çalışan': r.inZupOfficial,
      'Resmi Çalışma Oranı (%)': `%${r.officialRatePct}`,
      'Pondera Ana Kadro ZUP Eksik': r.missingMainFirm,
      'Taşeron (ZUP Dışı)': r.missingSubcon,
      'ZUP Aktif / Real Çıkış': r.zupActiveRealExit,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regRows), '5_Bolge_Bazli_Mutabakat');

    XLSX.writeFile(
      wb,
      `Pondera_1C_ZUP_vs_eBA_Real_Karsilastirma_${data.metadata.zupDate}_vs_${data.metadata.ebaDate}.xlsx`
    );
  };

  if (loading && !data) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
        <div className="p-8 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3 text-slate-600 dark:text-slate-300 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
          <span>
            {lang === 'ru'
              ? 'Выполняется перекрестная сверка базы 1С ЗУП (Официальная) и eBA (Реальная)...'
              : '1C ZUP (Resmi) ve eBA (Real) personel veritabanları çapraz karşılaştırılıyor...'}
          </span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { metadata, summary, byRegion, byPermitStatus } = data;
  const dc = summary.discrepancyCounts;

  const filterCards: {
    id: FilterCategory;
    titleTr: string;
    titleRu: string;
    subTr: string;
    subRu: string;
    count: number;
    tone: 'rose' | 'amber' | 'indigo' | 'cyan' | 'emerald' | 'slate';
  }[] = [
    {
      id: 'ZUP_ACTIVE_REAL_EXIT',
      titleTr: "1C ZUP'ta Aktif / Real'de Çıkış",
      titleRu: 'В 1С ЗУП Активен / В eBA Уволен',
      subTr: 'Transfer hariç gerçek çıkış (Resmi düşülmeli)',
      subRu: 'Уволен на объекте (кроме перевода)',
      count: dc.statusExitInReal,
      tone: 'rose',
    },
    {
      id: 'SITE_TRANSFER_PERMIT_CHECK',
      titleTr: 'Şirket İçi Şantiye Transferi',
      titleRu: 'Перевод между объектами',
      subTr: 'ZUP çıkış gerekmez, izin bölgesi kontrolü',
      subRu: 'Проверка региона разрешения на работу',
      count: dc.siteTransferPermitCheck ?? summary.zupTransferPermitCheckCount ?? 0,
      tone: 'indigo',
    },
    {
      id: 'REAL_ACTIVE_NO_ZUP_MAIN',
      titleTr: "Pondera Ana Kadro / ZUP'ta Yok",
      titleRu: 'Основной штат Pondera / Нет в ЗУП',
      subTr: `${summary.realActiveNotInZupRecentHire} kişi ${metadata.zupDate.slice(0, 5)} sonrası yeni giriş`,
      subRu: `${summary.realActiveNotInZupRecentHire} чел. приняты после ${metadata.zupDate.slice(0, 5)}`,
      count: dc.missingInZupMainFirm,
      tone: 'rose',
    },
    {
      id: 'ZUP_ONLY_NO_EBA',
      titleTr: "Sadece 1C ZUP'ta Var (eBA Yok)",
      titleRu: 'Только в 1С ЗУП (Нет в eBA)',
      subTr: "eBA sisteminde hiç kaydı bulunmayanlar",
      subRu: 'Отсутствуют в базе данных eBA',
      count: dc.zupOnlyNoEba,
      tone: 'rose',
    },
    {
      id: 'PASSPORT_DIFF',
      titleTr: 'Pasaport Numarası Farklı',
      titleRu: 'Расхождение № паспорта',
      subTr:
        metadata.hasZupPassportColumn === false
          ? 'Mevcut ZUP raporunda Pasaport sütunu yok'
          : 'ZUP ve eBA pasaport no uyuşmayanlar',
      subRu:
        metadata.hasZupPassportColumn === false
          ? 'В текущей выгрузке ЗУП нет столбца Паспорт'
          : 'Номера паспортов в ЗУП и eBA не совпадают',
      count: dc.passportMismatch,
      tone: 'amber',
    },
    {
      id: 'PERMIT_DIFF',
      titleTr: 'Çalışma / Vergi Statüsü Farklı',
      titleRu: 'Разный статус (ВКС/Патент/РНР)',
      subTr: 'VKS, Patent, RNR veya Rezident farkı',
      subRu: 'Несовпадение статуса налогоплательщика',
      count: dc.permitStatusMismatch,
      tone: 'amber',
    },
    {
      id: 'INN_DIFF',
      titleTr: 'İNN Numarası Uyuşmazlığı',
      titleRu: 'Несовпадение ИНН',
      subTr:
        metadata.hasZupInnColumn === false
          ? 'Mevcut ZUP raporunda İNN sütunu yok'
          : `+${dc.missingInnInEba} kişide eBA İNN alanı boş`,
      subRu:
        metadata.hasZupInnColumn === false
          ? 'В текущей выгрузке ЗУП нет столбца ИНН'
          : `+у ${dc.missingInnInEba} чел. пустой ИНН в eBA`,
      count: dc.innMismatch,
      tone: 'amber',
    },
    {
      id: 'SICIL_FORMAT',
      titleTr: 'Sicil No Yazım / Format Farkı',
      titleRu: 'Формат табельного номера',
      subTr: 'Nokta veya harf eki farkı (922844. / 911615а)',
      subRu: 'Точка или буква в таб. номере ЗУП',
      count: dc.sicilFormatDiff,
      tone: 'indigo',
    },
    {
      id: 'DOB_KIRIL_DIFF',
      titleTr: 'Doğum Tarihi / Kiril İsim Farkı',
      titleRu: 'Дата рождения / ФИО (кир.)',
      subTr: `${dc.birthDateMismatch} doğum tarihi • ${dc.kirilNameDiff} Kiril yazım`,
      subRu: `${dc.birthDateMismatch} дат рожд. • ${dc.kirilNameDiff} ФИО`,
      count: dc.birthDateMismatch + dc.kirilNameDiff,
      tone: 'cyan',
    },
    {
      id: 'REAL_ACTIVE_NO_ZUP_SUBCON',
      titleTr: 'Taşeron Kadro (1C ZUP Dışı)',
      titleRu: 'Субподрядчики (Вне 1С ЗУП)',
      subTr: 'Alt işveren bünyesinde çalışan aktif kadro',
      subRu: 'Сотрудники субподрядных организаций',
      count: dc.missingInZupSubcon,
      tone: 'slate',
    },
    {
      id: 'FULL_MATCH',
      titleTr: '%100 Tam Uyumlu Personel',
      titleRu: '100% Полное совпадение',
      subTr: 'Sicil, durum ve kimlik verileri tam eşleşen',
      subRu: 'Все реквизиты полностью совпадают',
      count: summary.matchedActiveBoth - summary.totalMatchedWithDataDiff,
      tone: 'emerald',
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-5 font-normal max-w-[1440px] mx-auto">
      {/* COMPACT TOP HEADER (MAX 2-3 LINES), COLLAPSIBLE EXPLANATION & ANIMATED WARNING POPUP TRIGGER */}
      <div className="px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-white to-slate-50 dark:from-[#0F172A] dark:via-[#131C31] dark:to-indigo-950/70 border border-indigo-200/80 dark:border-indigo-900/60 text-slate-900 dark:text-white shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Compact Icon + Single-Line Title + Collapsible Info Toggle */}
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="text-base sm:text-lg font-normal tracking-tight text-slate-900 dark:text-white truncate">
                {lang === 'ru'
                  ? 'Сверка 1С ЗУП (Офиц.) и eBA (Реал)'
                  : '1C ZUP (Resmi) & eBA (Real) Karşılaştırma'}
              </h1>
              <span className="px-2 py-0.5 text-[10.5px] rounded-full bg-indigo-100 dark:bg-indigo-500/25 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/30 whitespace-nowrap">
                {lang === 'ru' ? 'Перекрестный аудит' : 'Çapraz Denetim'}
              </span>
              <button
                type="button"
                onClick={() => setShowExplanation((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] transition-all cursor-pointer whitespace-nowrap"
              >
                <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{lang === 'ru' ? 'Описание и метод' : 'Açıklama & Nasıl Çalışır?'}</span>
                {showExplanation ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>
            </div>
          </div>

          {/* Right: Animated Outdated Warning Button + Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Animated Warning Trigger (Opens Popup Modal on Click) */}
            {metadata.isZupOutdated && (
              <button
                type="button"
                onClick={() => setShowOutdatedModal(true)}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/90 hover:bg-amber-200/80 dark:bg-amber-950/90 dark:hover:bg-amber-900/80 border border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-200 text-xs transition-all cursor-pointer shadow-2xs ring-2 ring-amber-400/40 animate-pulse"
                title={
                  lang === 'ru'
                    ? 'Нажмите для просмотра деталей предупреждения об актуальности списка 1С ЗУП'
                    : 'Uyarı detayını görmek için tıklayın'
                }
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600 dark:bg-amber-400" />
                </span>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
                <span className="whitespace-nowrap">
                  {lang === 'ru'
                    ? `Обновить ЗУП (${metadata.zupDate})`
                    : `Liste Güncelleme Uyarısı (${metadata.zupDate})`}
                </span>
              </button>
            )}

            {/* Hidden file input for 1C ZUP Excel Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadZupExcel}
              className="hidden"
            />

            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 disabled:opacity-60 text-indigo-950 dark:text-indigo-100 font-semibold text-xs transition-all cursor-pointer shadow-2xs whitespace-nowrap"
            >
              {uploading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-700 dark:text-indigo-300" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
              )}
              <span>
                {uploading
                  ? lang === 'ru'
                    ? 'Загрузка...'
                    : 'Yükleniyor...'
                  : lang === 'ru'
                  ? 'Загрузить 1С ЗУП (.xlsx)'
                  : '1C ZUP Listesi Yükle (.xlsx)'}
              </span>
            </button>

            <button
              type="button"
              disabled={sendingTelegram}
              onClick={handleSendTelegramSummary}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-300 dark:border-sky-500/40 bg-sky-100/85 hover:bg-sky-200/80 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 disabled:opacity-60 text-sky-950 dark:text-sky-100 font-semibold text-xs transition-all cursor-pointer shadow-2xs whitespace-nowrap"
              title={
                lang === 'ru'
                  ? 'Отправить сводку расхождений в группу Telegram'
                  : 'Fark özetini Telegram grubuna gönder'
              }
            >
              {sendingTelegram ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-700 dark:text-sky-300" />
              ) : (
                <Send className="w-3.5 h-3.5 text-sky-700 dark:text-sky-300" />
              )}
              <span>{lang === 'ru' ? 'В Telegram' : 'Telegram’a Gönder'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 font-semibold text-xs transition-all cursor-pointer shadow-2xs whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
              <span>{lang === 'ru' ? 'Excel отчет' : 'Rapor İndir (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Explanation Panel (Closed by Default) */}
        {showExplanation && (
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-slate-900/80 border border-indigo-200/70 dark:border-indigo-900/60 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-indigo-700 dark:text-indigo-300">
                {lang === 'ru'
                  ? 'Как работает сверка 1С ЗУП (Официальная база) и eBA (Реальная база)?'
                  : '1C ZUP (Resmi Bordro) ve eBA (Real Saha) Çapraz Karşılaştırma Sistemi Nasıl Çalışır?'}
              </span>
              <button
                type="button"
                onClick={() => setShowExplanation(false)}
                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
              >
                {lang === 'ru' ? 'Скрыть ✕' : 'Kapat ✕'}
              </button>
            </div>
            <p className="leading-relaxed text-[11.5px]">
              {lang === 'ru'
                ? '1) На первом шаге определяется, сколько из текущих активных сотрудников eBA официально трудоустроены в 1С ЗУП. 2) Выявляются критические расхождения: сотрудники, уволенные на площадке (в eBA статус "Çıkış"), но продолжающие числиться активными в 1С ЗУП, а также сотрудники основного штата Pondera без записи в 1С ЗУП. 3) На последнем шаге проверяются несовпадения в паспортах, ИНН, налоговых статусах (ВКС/Патент/РНР), датах рождения и формате табельных номеров. В дальнейшем загрузка из 1С ЗУП будет автоматизирована через API.'
                : '1) İlk adımda sahada (eBA Real) aktif çalışan personelin kaçının 1C ZUP resmi bordrosunda kayıtlı olduğu analiz edilir. 2) Sahadan çıkış yaptığı halde 1C ZUP resmi sistemde hala aktif görünenler ile Pondera ana kadroda olup 1C ZUP kaydı bulunmayanlar tespit edilir. 3) Son adımda eşleşen personellerin pasaport no, İNN, çalışma/vergi statüsü (VKS/Patent/RNR), doğum tarihi ve sicil formatı farkları listelenir. Günlük eksik evrak raporunu takiben fark özeti Telegram grubuna otomatik iletilir.'}
            </p>
          </div>
        )}

        {/* Status / Notification Feedback Banner */}
        {bannerMessage && (
          <div
            className={`px-3.5 py-2 rounded-xl text-xs flex items-center justify-between border ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : bannerMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-[11px] underline ml-4 cursor-pointer"
            >
              {lang === 'ru' ? 'Закрыть' : 'Kapat'}
            </button>
          </div>
        )}
      </div>

      {/* POPUP MODAL FOR OUTDATED 1C ZUP LIST WARNING */}
      {showOutdatedModal && (
        <div
          onClick={() => setShowOutdatedModal(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#131C31] border border-amber-300 dark:border-amber-700/80 shadow-2xl p-5 space-y-4 text-slate-900 dark:text-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base text-slate-900 dark:text-white">
                    {lang === 'ru'
                      ? 'Требуется обновление списка 1С ЗУП'
                      : '1C ZUP Resmi Liste Güncelleme Uyarısı'}
                  </h3>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">
                    {lang === 'ru' ? 'Разница в датах выгрузки баз данных' : 'Veri Tarihleri Arasında Fark Tespit Edildi'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOutdatedModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">
                  {lang === 'ru' ? 'Текущий список 1С ЗУП (Офиц.):' : 'Mevcut 1C ZUP Resmi Liste Tarihi:'}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-400/40">
                  {metadata.zupDate} ({summary.zupOfficialTotal.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">
                  {lang === 'ru' ? 'Реальная база eBA (Актив):' : 'Canlı eBA (Real) Liste Tarihi:'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-400/40">
                  {metadata.ebaDate} ({summary.realActiveTotal.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'})
                </span>
              </div>
              <div className="pt-1 border-t border-amber-200/70 dark:border-amber-800/60 text-[11px] text-slate-600 dark:text-slate-300">
                {lang === 'ru' ? 'Файл источника:' : 'Yüklü ZUP Dosyası:'}{' '}
                <span className="text-slate-900 dark:text-white">{metadata.zupSourceFile}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ru'
                ? `В системе загружен список eBA от ${metadata.ebaDate}, тогда как официальная выгрузка из 1С ЗУП датирована ${metadata.zupDate}. Для 100% точной сверки недавно принятых и уволенных сотрудников рекомендуется загрузить свежий Excel-файл из 1С ЗУП.`
                : `Sistemde şu an ${metadata.ebaDate} tarihli Real eBA personel listesi yüklüdür; ancak 1C ZUP resmi personel listesi ${metadata.zupDate} tarihlidir. Son günlerdeki işe giriş ve çıkışların tam mutabakatı için güncel 1C ZUP Excel listesinin yüklenmesi gerekmektedir.`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowOutdatedModal(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
                <span>
                  {lang === 'ru' ? 'Загрузить новый список 1С ЗУП' : 'Yeni 1C ZUP Listesi Yükle (.xlsx)'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowOutdatedModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs cursor-pointer transition-all"
              >
                {lang === 'ru' ? 'Понятно' : 'Anladım / Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ADIM 1: MEVCUT ÇALIŞANLARIN KAÇI RESMİDE (1C ZUP) ÇALIŞIYOR?
      ===================================================================== */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px]">
              {lang === 'ru' ? 'ШАГ 1' : '1. ANALİZ ADIMI'}
            </span>
            <h2 className="text-sm sm:text-base text-slate-900 dark:text-white">
              {lang === 'ru'
                ? 'Общая сверка штата: сколько из текущих сотрудников работают официально в 1С ЗУП?'
                : 'Genel Kadro Mutabakatı: Mevcut Çalışanların Kaçı Resmide (1C ZUP) Çalışıyor?'}
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? `Источник ЗУП: ${metadata.zupSourceFile} (${metadata.zupDate}) ↔ База eBA (${metadata.ebaDate})`
              : `1C ZUP Kaynak: ${metadata.zupSourceFile} (${metadata.zupDate}) ↔ Real eBA (${metadata.ebaDate})`}
          </span>
        </div>

        {/* 5 Executive Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Real Active */}
          <div
            onClick={() => setSelectedFilter('ALL')}
            className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer shadow-2xs space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{lang === 'ru' ? 'РЕАЛЬНЫЙ АКТИВ (eBA)' : 'REAL (eBA) AKTİF KADRO'}</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                {metadata.ebaDate}
              </span>
            </div>
            <div className="text-2xl text-slate-900 dark:text-white">
              {summary.realActiveTotal.toLocaleString('tr-TR')}
              <span className="text-xs text-slate-400 ml-1">{lang === 'ru' ? 'чел.' : 'Kişi'}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <span className="text-emerald-600 dark:text-emerald-400">
                Pondera: {summary.realActiveMainFirm.toLocaleString('tr-TR')}
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                {lang === 'ru' ? 'Субподряд' : 'Taşeron'}: {summary.realActiveSubcon.toLocaleString('tr-TR')}
              </span>
            </div>
          </div>

          {/* Card 2: 1C ZUP Official Total */}
          <div
            onClick={() => setSelectedFilter('ALL')}
            className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer shadow-2xs space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{lang === 'ru' ? 'ОФИЦИАЛЬНЫЙ ШТАТ (1С ЗУП)' : '1C ZUP RESMİ KADRO'}</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px]">
                {metadata.zupDate}
              </span>
            </div>
            <div className="text-2xl text-indigo-600 dark:text-indigo-400">
              {summary.zupOfficialTotal.toLocaleString('tr-TR')}
              <span className="text-xs text-slate-400 ml-1">{lang === 'ru' ? 'чел.' : 'Kişi'}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <span>
                {lang === 'ru' ? 'Актив в обоих:' : 'Aktif Eşleşen:'}{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-normal">
                  {summary.matchedActiveBoth.toLocaleString('tr-TR')}
                </strong>
              </span>
              <span>
                {lang === 'ru' ? 'Уволен в eBA:' : 'eBA Çıkışlı:'}{' '}
                <strong className="text-rose-600 dark:text-rose-400 font-normal">
                  {summary.zupActiveButRealExited}
                </strong>
              </span>
            </div>
          </div>

          {/* Card 3: Active in BOTH (How many active employees work officially) */}
          <div
            onClick={() => setSelectedFilter('FULL_MATCH')}
            className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 hover:border-emerald-400 transition-all cursor-pointer shadow-2xs space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
              <span>{lang === 'ru' ? 'РАБОТАЮТ ОФИЦИАЛЬНО (В ОБОИХ)' : 'MEVCUTTAN RESMİDE ÇALIŞAN'}</span>
              <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl text-emerald-700 dark:text-emerald-300">
                {summary.matchedActiveBoth.toLocaleString('tr-TR')}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[11px]">
                %{summary.matchedActiveRateMainFirm} Pondera
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-emerald-200/70 dark:bg-emerald-950 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, summary.matchedActiveRateMainFirm)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-emerald-800/90 dark:text-emerald-300/90">
              <span>
                {lang === 'ru'
                  ? `Осн. штат: %${summary.matchedActiveRateMainFirm}`
                  : `Ana Kadro Resmi: %${summary.matchedActiveRateMainFirm}`}
              </span>
              <span>
                {lang === 'ru'
                  ? `Весь штат: %${summary.matchedActiveRateAll}`
                  : `Tüm Saha: %${summary.matchedActiveRateAll}`}
              </span>
            </div>
          </div>

          {/* Card 4: Active in 1C ZUP but EXITED in Real eBA (Transfers Excluded) */}
          <div
            onClick={() => {
              setSelectedFilter('ZUP_ACTIVE_REAL_EXIT');
              scrollToTable();
            }}
            className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 hover:border-rose-400 transition-all cursor-pointer shadow-2xs space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px] text-rose-800 dark:text-rose-300">
              <span>{lang === 'ru' ? 'В ЗУП АКТИВЕН / В eBA УВОЛЕН' : "ZUP'TA AKTİF / REAL'DE ÇIKIŞ"}</span>
              <UserX className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl text-rose-600 dark:text-rose-400">
                {summary.zupActiveButRealExited.toLocaleString('tr-TR')}
              </span>
              <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10.5px]">
                {lang === 'ru' ? 'Без переводов' : 'Transfer Hariç Çıkış'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10.5px] pt-1 border-t border-rose-200/60 dark:border-rose-800/60">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFilter('SITE_TRANSFER_PERMIT_CHECK');
                  scrollToTable();
                }}
                className="text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer"
              >
                {lang === 'ru' ? 'Перевод объекта:' : 'Şantiye Transferi:'}{' '}
                <strong>{summary.zupTransferPermitCheckCount ?? 0}</strong>
              </button>
              <span className="text-rose-700 dark:text-rose-300">
                {lang === 'ru' ? 'Уволен:' : 'Gerçek Çıkış:'} <strong>{summary.zupActiveButRealExited}</strong>
              </span>
            </div>
          </div>

          {/* Card 5: Active in Real eBA but NOT in 1C ZUP */}
          <div
            onClick={() => {
              setSelectedFilter('REAL_ACTIVE_NO_ZUP_MAIN');
              scrollToTable();
            }}
            className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 hover:border-amber-400 transition-all cursor-pointer shadow-2xs space-y-1.5"
          >
            <div className="flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300">
              <span>{lang === 'ru' ? 'АКТИВ В eBA / НЕТ В 1С ЗУП' : "REAL'DE AKTİF / ZUP'TA YOK"}</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl text-amber-700 dark:text-amber-300">
                {summary.realActiveNotInZupTotal.toLocaleString('tr-TR')}
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-300">
                ({lang === 'ru' ? 'Pondera:' : 'Ana Kadro:'} {summary.realActiveNotInZupMainFirm})
              </span>
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-amber-800/90 dark:text-amber-300/90 pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
              <span>
                {lang === 'ru' ? 'Pondera без ЗУП:' : 'Pondera Eksik:'}{' '}
                <strong>{summary.realActiveNotInZupMainFirm}</strong>
              </span>
              <span>
                {lang === 'ru' ? 'Субподряд:' : 'Taşeron:'}{' '}
                <strong>{summary.realActiveNotInZupSubcon}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* =====================================================================
            ADIM 1.2: MEVCUT KADROLAR VE ÇIKIŞLILAR YAN YANA GÖRSEL KARŞILAŞTIRMA GRAFİĞİ
            (Üzerine tıklayınca alttaki tabloda filtreler ve listeler)
        ===================================================================== */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[10.5px] inline-flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                {lang === 'ru' ? 'ГРАФИК СВЕРКИ' : 'GÖRSEL MUTABAKAT GRAFİĞİ'}
              </span>
              <h3 className="text-xs sm:text-sm text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Сравнение текущего штата, переводов и уволенных (1С ЗУП vs eBA Real) — нажмите на сегмент для фильтрации таблицы'
                  : 'Resmi (1C ZUP) ve Real (eBA) Mevcut Kadrolar, Şantiye Transferleri & Çıkışlılar Yan Yana Karşılaştırma Grafiği'}
              </h3>
            </div>
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
              {lang === 'ru'
                ? '💡 Нажмите на любой столбец или статус для вывода списка в таблице ниже'
                : '💡 Grafik üzerindeki barlara veya sayılara tıkladığınızda alttaki tabloda ilgili kişiler listelenir'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 6 Cols: Side-by-Side Stacked & Grouped Bar Comparison of Workforce Status */}
            <div className="lg:col-span-6 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-500" />
                  <span>
                    {lang === 'ru'
                      ? '1. Сопоставление численности и статуса работы (1С ЗУП ↔ eBA Real)'
                      : '1. Toplam Personel ve Çalışma Durumu Yan Yana Dağılımı (1C ZUP ↔ eBA Real)'}
                  </span>
                </div>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  ZUP: <strong>{summary.zupOfficialTotal.toLocaleString('tr-TR')}</strong> | Real:{' '}
                  <strong>{summary.realActiveTotal.toLocaleString('tr-TR')}</strong>
                </span>
              </div>

              {/* Visual Side-by-Side Comparison Bars (1C ZUP vs eBA Real) */}
              <div className="space-y-3">
                {/* Bar 1: 1C ZUP Official Total Breakdown */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-indigo-700 dark:text-indigo-300">
                      {lang === 'ru' ? 'Официальный штат 1С ЗУП' : '1C ZUP Resmi Bordro Kadrosu'}
                    </span>
                    <span className="text-slate-900 dark:text-white text-xs">
                      Toplam: <strong>{summary.zupOfficialTotal.toLocaleString('tr-TR')} Kişi</strong>
                    </span>
                  </div>
                  <div className="h-8 w-full rounded-xl bg-slate-200/70 dark:bg-slate-800 overflow-hidden flex p-0.5 gap-0.5">
                    {/* Segment A: Active Matched in Both */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPermitKey('ALL');
                        setSelectedFilter('FULL_MATCH');
                        scrollToTable();
                      }}
                      style={{
                        width: `${Math.max(
                          12,
                          Math.round(
                            ((summary.matchedActiveBoth - (summary.zupTransferPermitCheckCount || 0)) /
                              Math.max(summary.zupOfficialTotal, 1)) *
                              100
                          )
                        )}%`,
                      }}
                      className="h-full rounded-l-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10.5px] flex items-center justify-center gap-1 px-2 transition-all cursor-pointer truncate"
                      title="Hem Real'de Mevcut Hem 1C ZUP'ta Resmi Çalışan (Tıkla & Listele)"
                    >
                      <span>
                        Mevcut Eşleşen:{' '}
                        {(summary.matchedActiveBoth - (summary.zupTransferPermitCheckCount || 0)).toLocaleString(
                          'tr-TR'
                        )}
                      </span>
                    </button>
                    {/* Segment B: Inter-Site Transfer (Active in ZUP, Transfer in eBA) */}
                    {(summary.zupTransferPermitCheckCount || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPermitKey('ALL');
                          setSelectedFilter('SITE_TRANSFER_PERMIT_CHECK');
                          scrollToTable();
                        }}
                        style={{
                          width: `${Math.max(
                            8,
                            Math.round(
                              ((summary.zupTransferPermitCheckCount || 0) /
                                Math.max(summary.zupOfficialTotal, 1)) *
                                100
                            )
                          )}%`,
                        }}
                        className="h-full bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] flex items-center justify-center px-1.5 transition-all cursor-pointer truncate"
                        title="Şirket İçi Şantiye Transferi — Resmi çıkış gerekmez, izin bölgesi kontrol edilmeli (Tıkla & Listele)"
                      >
                        <span>Transfer: {summary.zupTransferPermitCheckCount}</span>
                      </button>
                    )}
                    {/* Segment C: Genuine Exits in Real eBA but Still Active in ZUP */}
                    {summary.zupActiveButRealExited > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPermitKey('ALL');
                          setSelectedFilter('ZUP_ACTIVE_REAL_EXIT');
                          scrollToTable();
                        }}
                        style={{
                          width: `${Math.max(
                            7,
                            Math.round(
                              (summary.zupActiveButRealExited / Math.max(summary.zupOfficialTotal, 1)) * 100
                            )
                          )}%`,
                        }}
                        className="h-full rounded-r-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] flex items-center justify-center px-1.5 transition-all cursor-pointer truncate"
                        title="Real'de Çıkış Yapılmış / 1C ZUP'ta Hala Aktif (Tıkla & Listele)"
                      >
                        <span>Çıkış: {summary.zupActiveButRealExited}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Bar 2: eBA Real Active Workforce Breakdown */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {lang === 'ru' ? 'Реальный активный штат (eBA Real)' : 'eBA Real Saha Mevcut Kadrosu'}
                    </span>
                    <span className="text-slate-900 dark:text-white text-xs">
                      Toplam: <strong>{summary.realActiveTotal.toLocaleString('tr-TR')} Kişi</strong>
                    </span>
                  </div>
                  <div className="h-8 w-full rounded-xl bg-slate-200/70 dark:bg-slate-800 overflow-hidden flex p-0.5 gap-0.5">
                    {/* Segment A: Active & in ZUP */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPermitKey('ALL');
                        setSelectedFilter('FULL_MATCH');
                        scrollToTable();
                      }}
                      style={{
                        width: `${Math.max(
                          15,
                          Math.round((summary.matchedActiveBoth / Math.max(summary.realActiveTotal, 1)) * 100)
                        )}%`,
                      }}
                      className="h-full rounded-l-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10.5px] flex items-center justify-center gap-1 px-2 transition-all cursor-pointer truncate"
                      title="Mevcut Kadrodan 1C ZUP Resmi Bordroda Çalışanlar (Tıkla & Listele)"
                    >
                      <span>Resmide Çalışan: {summary.matchedActiveBoth.toLocaleString('tr-TR')}</span>
                    </button>
                    {/* Segment B: Pondera Main Firm Missing in ZUP */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPermitKey('ALL');
                        setSelectedFilter('REAL_ACTIVE_NO_ZUP_MAIN');
                        scrollToTable();
                      }}
                      style={{
                        width: `${Math.max(
                          10,
                          Math.round(
                            (summary.realActiveNotInZupMainFirm / Math.max(summary.realActiveTotal, 1)) * 100
                          )
                        )}%`,
                      }}
                      className="h-full bg-amber-500 hover:bg-amber-600 text-white text-[10px] flex items-center justify-center px-1.5 transition-all cursor-pointer truncate"
                      title="Pondera Ana Kadroda Aktif Olup 1C ZUP'ta Kaydı Olmayanlar (Tıkla & Listele)"
                    >
                      <span>Ana Kadro Eksik: {summary.realActiveNotInZupMainFirm}</span>
                    </button>
                    {/* Segment C: Subcontractor Active (Outside ZUP) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPermitKey('ALL');
                        setSelectedFilter('REAL_ACTIVE_NO_ZUP_SUBCON');
                        scrollToTable();
                      }}
                      style={{
                        width: `${Math.max(
                          10,
                          Math.round((summary.realActiveNotInZupSubcon / Math.max(summary.realActiveTotal, 1)) * 100)
                        )}%`,
                      }}
                      className="h-full rounded-r-lg bg-slate-500 hover:bg-slate-600 text-white text-[10px] flex items-center justify-center px-1.5 transition-all cursor-pointer truncate"
                      title="Taşeron Firma Bordrosunda Çalışanlar (Tıkla & Listele)"
                    >
                      <span>Taşeron: {summary.realActiveNotInZupSubcon}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive Status Breakdown Grid (6 Clickable Status Pills with Exact Counts) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPermitKey('ALL');
                    setSelectedFilter('FULL_MATCH');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedFilter === 'FULL_MATCH'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-[#131C31] border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400'
                  }`}
                >
                  <div className="text-[10.5px] opacity-85">Mevcut & Resmide Aktif</div>
                  <div className="text-base mt-0.5 flex items-baseline justify-between">
                    <span>{summary.matchedActiveBoth.toLocaleString('tr-TR')}</span>
                    <span className="text-[10px] opacity-80">%{summary.matchedActiveRateMainFirm}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPermitKey('ALL');
                    setSelectedFilter('SITE_TRANSFER_PERMIT_CHECK');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedFilter === 'SITE_TRANSFER_PERMIT_CHECK'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-[#131C31] border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-400'
                  }`}
                >
                  <div className="text-[10.5px] opacity-85">Şantiye Transferi (ZUP Aktif)</div>
                  <div className="text-base mt-0.5 flex items-baseline justify-between">
                    <span>{(summary.zupTransferPermitCheckCount || 0).toLocaleString('tr-TR')}</span>
                    <span className="text-[10px] opacity-80">İzin Kontrolü</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPermitKey('ALL');
                    setSelectedFilter('ZUP_ACTIVE_REAL_EXIT');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedFilter === 'ZUP_ACTIVE_REAL_EXIT'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white dark:bg-[#131C31] border-rose-200 dark:border-rose-900/60 hover:border-rose-400'
                  }`}
                >
                  <div className="text-[10.5px] opacity-85">ZUP Aktif / Real Çıkışlı</div>
                  <div className="text-base mt-0.5 flex items-baseline justify-between">
                    <span>{summary.zupActiveButRealExited.toLocaleString('tr-TR')}</span>
                    <span className="text-[10px] opacity-80">Resmi Düşülecek</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPermitKey('ALL');
                    setSelectedFilter('REAL_ACTIVE_NO_ZUP_MAIN');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedFilter === 'REAL_ACTIVE_NO_ZUP_MAIN'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white dark:bg-[#131C31] border-amber-200 dark:border-amber-900/60 hover:border-amber-400'
                  }`}
                >
                  <div className="text-[10.5px] opacity-85">Ana Kadro / ZUP Eksik</div>
                  <div className="text-base mt-0.5 flex items-baseline justify-between">
                    <span>{summary.realActiveNotInZupMainFirm.toLocaleString('tr-TR')}</span>
                    <span className="text-[10px] opacity-80">Pondera</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPermitKey('ALL');
                    setSelectedFilter('REAL_ACTIVE_NO_ZUP_SUBCON');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedFilter === 'REAL_ACTIVE_NO_ZUP_SUBCON'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white dark:bg-[#131C31] border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="text-[10.5px] opacity-85">Taşeron Aktif (ZUP Dışı)</div>
                  <div className="text-base mt-0.5 flex items-baseline justify-between">
                    <span>{summary.realActiveNotInZupSubcon.toLocaleString('tr-TR')}</span>
                    <span className="text-[10px] opacity-80">Alt İşveren</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPermitKey('ALL');
                    setSelectedFilter('ZUP_ONLY_NO_EBA');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedFilter === 'ZUP_ONLY_NO_EBA'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white dark:bg-[#131C31] border-purple-200 dark:border-purple-900/60 hover:border-purple-400'
                  }`}
                >
                  <div className="text-[10.5px] opacity-85">Sadece ZUP&apos;ta Var</div>
                  <div className="text-base mt-0.5 flex items-baseline justify-between">
                    <span>{summary.zupOnlyNotInRealDB.toLocaleString('tr-TR')}</span>
                    <span className="text-[10px] opacity-80">eBA Kaydı Yok</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Right 6 Cols: Interactive Recharts Side-by-Side BarChart by Work Permit Status & Active/Exit Breakdown */}
            <div className="lg:col-span-6 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-800 dark:text-slate-200">
                  {lang === 'ru'
                    ? '2. Разбивка по статусам разрешения на работу (ВКС, Патент, РНР, Резидент, ЕАЭС)'
                    : '2. Çalışma Durumu / İzin Statüsüne Göre Resmi vs Real Yan Yana Kırılım Grafiği'}
                </div>
                {selectedPermitKey !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedPermitKey('ALL')}
                    className="px-2.5 py-0.5 rounded-lg border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 text-indigo-950 dark:bg-indigo-500/25 dark:text-indigo-100 font-semibold text-[10.5px] cursor-pointer"
                  >
                    Statü Filtresi: {selectedPermitKey} ✕
                  </button>
                )}
              </div>

              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={byPermitStatus.map((ps) => ({
                      key: ps.key,
                      name:
                        ps.key === 'VKS'
                          ? 'VKS (BKC)'
                          : ps.key === 'PATENT'
                          ? 'Patent'
                          : ps.key === 'RNR_QUOTA'
                          ? 'Kota / RNR'
                          : ps.key === 'RESIDENT'
                          ? 'Rezident / RF'
                          : 'EAES',
                      zupCount: ps.zupCount,
                      realActiveCount: ps.realActiveCount,
                      zupTransferCount: ps.zupTransferCount || 0,
                      zupRealExitedCount: ps.zupRealExitedCount || 0,
                    }))}
                    margin={{ top: 18, right: 12, left: -10, bottom: 4 }}
                    onClick={(state) => {
                      const payload = state?.activePayload?.[0]?.payload;
                      if (payload?.key) {
                        setSelectedPermitKey((prev) => (prev === payload.key ? 'ALL' : payload.key));
                        setSelectedFilter('ALL');
                        scrollToTable();
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        color: '#f8fafc',
                        fontSize: '11px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar
                      dataKey="zupCount"
                      name={lang === 'ru' ? '1С ЗУП (Офиц.)' : '1C ZUP (Resmi)'}
                      fill="#6366f1"
                      radius={[6, 6, 0, 0]}
                      className="cursor-pointer"
                    >
                      <LabelList dataKey="zupCount" position="top" style={{ fontSize: '10px', fill: '#6366f1' }} />
                    </Bar>
                    <Bar
                      dataKey="realActiveCount"
                      name={lang === 'ru' ? 'eBA Real (Актив)' : 'eBA Real (Mevcut)'}
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      className="cursor-pointer"
                    >
                      <LabelList
                        dataKey="realActiveCount"
                        position="top"
                        style={{ fontSize: '10px', fill: '#10b981' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Quick clickable permit status chips with Transfer & Exit counts */}
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {byPermitStatus.map((ps) => {
                  const isPermitSelected = selectedPermitKey === ps.key;
                  const shortLabel =
                    ps.key === 'VKS'
                      ? 'VKS'
                      : ps.key === 'PATENT'
                      ? 'Patent'
                      : ps.key === 'RNR_QUOTA'
                      ? 'Kota/RNR'
                      : ps.key === 'RESIDENT'
                      ? 'Rezident'
                      : 'EAES';
                  return (
                    <button
                      key={ps.key}
                      type="button"
                      onClick={() => {
                        setSelectedPermitKey(isPermitSelected ? 'ALL' : ps.key);
                        setSelectedFilter('ALL');
                        scrollToTable();
                      }}
                      className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isPermitSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-[#131C31] border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                      }`}
                    >
                      <div className="text-[10.5px] truncate">{shortLabel}</div>
                      <div className="text-[10px] opacity-85">
                        ZUP:{ps.zupCount} / Real:{ps.realActiveCount}
                      </div>
                      <div className="text-[9.5px] opacity-75">
                        Trf:{ps.zupTransferCount || 0} • Çık:{ps.zupRealExitedCount || 0}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ADIM 2: BÖLGE BAZLI RESMİ ÇALIŞMA ORANI (ŞANTİYE AÇ/KAPA) & İZİN STATÜSÜ
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 7 Cols: Regional Official Coverage Breakdown with Expandable Multi-Site (Kazan) */}
        <div className="lg:col-span-7 p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[10.5px]">
                {lang === 'ru' ? 'ШАГ 2.1' : '2.1 BÖLGE & ŞANTİYE ANALİZİ'}
              </span>
              <h3 className="text-xs sm:text-sm text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Доля официально оформленных (1С ЗУП) по регионам и объектам'
                  : 'Bölge ve Şantiye Kırılımında Mevcut Personelin Resmi (1C ZUP) Çalışma Oranı'}
              </h3>
            </div>
            {(selectedRegion !== 'ALL' || selectedProject !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRegion('ALL');
                  setSelectedProject('ALL');
                }}
                className="text-[11px] px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
              >
                {lang === 'ru'
                  ? `Фильтр: ${selectedProject !== 'ALL' ? selectedProject : selectedRegion} (Сбросить)`
                  : `Filtre: ${selectedProject !== 'ALL' ? selectedProject : selectedRegion} (Tümünü Gör)`}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3 font-normal">{lang === 'ru' ? 'Регион / Объект' : 'Bölge / Şantiye'}</th>
                  <th className="py-2 px-2 text-right font-normal">{lang === 'ru' ? 'Реал Актив' : 'Real Aktif'}</th>
                  <th className="py-2 px-2 text-right font-normal">{lang === 'ru' ? 'В 1С ЗУП' : 'Resmide (ZUP)'}</th>
                  <th className="py-2 px-3 font-normal w-36">{lang === 'ru' ? '% Офиц.' : 'Resmi Oran'}</th>
                  <th className="py-2 px-2 text-right font-normal">
                    {lang === 'ru' ? 'Pondera Нет в ЗУП' : 'Ana Kadro Eksik'}
                  </th>
                  <th className="py-2 pl-2 text-right font-normal">
                    {lang === 'ru' ? 'Перевод / Уволен' : 'Transfer / Çıkış'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {byRegion.map((reg) => {
                  const isSelected = selectedRegion === reg.region && selectedProject === 'ALL';
                  const hasMultipleProjects = Array.isArray(reg.projects) && reg.projects.length > 1;
                  const isExpanded = !!expandedRegions[reg.region];

                  return (
                    <React.Fragment key={reg.region}>
                      <tr
                        onClick={() => {
                          setSelectedProject('ALL');
                          setSelectedRegion(isSelected ? 'ALL' : reg.region);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 pr-3 text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span className="truncate">{reg.region}</span>
                            {hasMultipleProjects && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRegions((prev) => ({
                                    ...prev,
                                    [reg.region]: !prev[reg.region],
                                  }));
                                }}
                                className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25 text-[10px] transition-colors cursor-pointer"
                                title="Şantiye kırılımını Aç / Kapat"
                              >
                                <Layers className="w-2.5 h-2.5" />
                                <span>
                                  {isExpanded
                                    ? lang === 'ru'
                                      ? 'Скрыть'
                                      : 'Şantiyeleri Kapat'
                                    : lang === 'ru'
                                    ? `${reg.projects?.length} объекта`
                                    : `${reg.projects?.length} Şantiye Aç`}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-2.5 h-2.5" />
                                ) : (
                                  <ChevronDown className="w-2.5 h-2.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-200">
                          {reg.realActive.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-2 text-right text-emerald-600 dark:text-emerald-400">
                          {reg.inZupOfficial.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  reg.officialRatePct >= 90
                                    ? 'bg-emerald-500'
                                    : reg.officialRatePct >= 75
                                    ? 'bg-indigo-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, reg.officialRatePct)}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-700 dark:text-slate-300 w-9 text-right">
                              %{reg.officialRatePct}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {reg.missingMainFirm > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300 text-[11px]">
                              {reg.missingMainFirm}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {(reg.transferCount || 0) > 0 && (
                              <span
                                className="px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10.5px]"
                                title="Şirket İçi Şantiye Transferi"
                              >
                                Trf:{reg.transferCount}
                              </span>
                            )}
                            {reg.zupActiveRealExit > 0 ? (
                              <span
                                className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10.5px]"
                                title="Gerçek Çıkış (ZUP Aktif)"
                              >
                                Çık:{reg.zupActiveRealExit}
                              </span>
                            ) : (
                              (reg.transferCount || 0) === 0 && <span className="text-slate-400">0</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Sub-rows for Multi-Project Regions (e.g. Kazan's 4 Sites) */}
                      {hasMultipleProjects &&
                        isExpanded &&
                        reg.projects?.map((proj) => {
                          const isProjSelected = selectedProject === proj.project;
                          return (
                            <tr
                              key={`${reg.region}-${proj.project}`}
                              onClick={() => {
                                setSelectedRegion(reg.region);
                                setSelectedProject(isProjSelected ? 'ALL' : proj.project);
                                scrollToTable();
                              }}
                              className={`cursor-pointer transition-colors text-[11px] ${
                                isProjSelected
                                  ? 'bg-indigo-100/70 dark:bg-indigo-900/40'
                                  : 'bg-slate-50/70 dark:bg-slate-900/40 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <td className="py-2 pl-6 pr-3 text-slate-700 dark:text-slate-300">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                  <span className="truncate">{proj.project}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right text-slate-600 dark:text-slate-300">
                                {proj.realActive.toLocaleString('tr-TR')}
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-600 dark:text-emerald-400">
                                {proj.inZupOfficial.toLocaleString('tr-TR')}
                              </td>
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-indigo-500"
                                      style={{ width: `${Math.min(100, proj.officialRatePct)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10.5px] text-slate-600 dark:text-slate-400 w-9 text-right">
                                    %{proj.officialRatePct}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right">
                                {proj.missingMainFirm > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300 text-[10px]">
                                    {proj.missingMainFirm}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>
                              <td className="py-2 pl-2 text-right">
                                <div className="inline-flex items-center justify-end gap-1">
                                  {(proj.transferCount || 0) > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px]">
                                      Trf:{proj.transferCount}
                                    </span>
                                  )}
                                  {proj.zupActiveRealExit > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px]">
                                      Çık:{proj.zupActiveRealExit}
                                    </span>
                                  ) : (
                                    (proj.transferCount || 0) === 0 && <span className="text-slate-400">0</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 5 Cols: Work Permit / Tax Status Comparison (VKS, Patent, RNR, Resident, EAES) */}
        <div className="lg:col-span-5 p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[10.5px]">
                {lang === 'ru' ? 'ШАГ 2.2' : '2.2 STATÜ ANALİZİ'}
              </span>
              <h3 className="text-xs sm:text-sm text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Сравнение по статусам (ВКС, Патент, РНР, Резидент, ЕАЭС)'
                  : 'Yasal Statü Karşılaştırması (1C ZUP Vergi Statüsü vs eBA Real)'}
              </h3>
            </div>
          </div>

          <div className="space-y-2.5">
            {byPermitStatus.map((ps) => {
              const maxVal = Math.max(ps.zupCount, ps.realActiveCount, 1);
              const zupPct = Math.round((ps.zupCount / maxVal) * 100);
              const realPct = Math.round((ps.realActiveCount / maxVal) * 100);
              const isSelectedPermit = selectedPermitKey === ps.key;

              return (
                <div
                  key={ps.key}
                  onClick={() => {
                    setSelectedPermitKey(isSelectedPermit ? 'ALL' : ps.key);
                    setSelectedFilter('ALL');
                    scrollToTable();
                  }}
                  className={`p-2.5 rounded-2xl border space-y-1.5 cursor-pointer transition-all ${
                    isSelectedPermit
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-400/50'
                      : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-900 dark:text-white">
                      {lang === 'ru' ? ps.labelRu : ps.labelTr}
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-indigo-600 dark:text-indigo-300">
                        1C ZUP: <strong>{ps.zupCount.toLocaleString('tr-TR')}</strong>
                      </span>
                      <span className="text-slate-400">|</span>
                      <span className="text-emerald-600 dark:text-emerald-400">
                        eBA Real: <strong>{ps.realActiveCount.toLocaleString('tr-TR')}</strong>
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] ${
                          ps.diff === 0
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            : ps.diff > 0
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {ps.diff > 0 ? `+${ps.diff}` : ps.diff}
                      </span>
                    </div>
                  </div>

                  {/* Dual Comparison Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9.5px] text-indigo-600 dark:text-indigo-400 w-12">1C ZUP</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${zupPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 w-12">eBA Real</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${realPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =====================================================================
          ADIM 3: VERİLERDEKİ FARKLAR (ALAN BAZLI ÇAPRAZ DENETİM KARTLARI)
      ===================================================================== */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px]">
              {lang === 'ru' ? 'ШАГ 3' : '3. ANALİZ ADIMI'}
            </span>
            <h2 className="text-sm sm:text-base text-slate-900 dark:text-white">
              {lang === 'ru'
                ? 'Детальная диагностика расхождений в данных (Нажмите на карточку для фильтрации списка)'
                : 'Verilerdeki Farklar & Uyuşmazlık Dağılımı (Listeyi filtrelemek için karta tıklayın)'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedFilter('ALL_DIFFS')}
              className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all ${
                selectedFilter === 'ALL_DIFFS'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[#131C31] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {lang === 'ru' ? 'Все расхождения' : 'Tüm Farkları Göster'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all ${
                selectedFilter === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[#131C31] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              {lang === 'ru' ? 'Весь список' : 'Tüm Kayıtlar'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {filterCards.map((fc) => {
            const active = selectedFilter === fc.id;
            const toneStyles: Record<string, string> = {
              rose: active
                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                : 'bg-white dark:bg-[#131C31] border-rose-200 dark:border-rose-900/60 hover:border-rose-400',
              amber: active
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-white dark:bg-[#131C31] border-amber-200 dark:border-amber-900/60 hover:border-amber-400',
              indigo: active
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-[#131C31] border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-400',
              cyan: active
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                : 'bg-white dark:bg-[#131C31] border-cyan-200 dark:border-cyan-900/60 hover:border-cyan-400',
              emerald: active
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white dark:bg-[#131C31] border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-400',
              slate: active
                ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                : 'bg-white dark:bg-[#131C31] border-slate-200 dark:border-slate-800 hover:border-slate-400',
            };

            const badgeTone: Record<string, string> = {
              rose: 'text-rose-600 dark:text-rose-400',
              amber: 'text-amber-600 dark:text-amber-400',
              indigo: 'text-indigo-600 dark:text-indigo-400',
              cyan: 'text-cyan-600 dark:text-cyan-400',
              emerald: 'text-emerald-600 dark:text-emerald-400',
              slate: 'text-slate-700 dark:text-slate-300',
            };

            return (
              <button
                key={fc.id}
                type="button"
                onClick={() => setSelectedFilter(fc.id)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${toneStyles[fc.tone]}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`text-[11.5px] leading-snug ${
                      active ? 'text-white' : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {lang === 'ru' ? fc.titleRu : fc.titleTr}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 pt-1">
                  <span
                    className={`text-xl ${
                      active ? 'text-white' : badgeTone[fc.tone]
                    }`}
                  >
                    {fc.count.toLocaleString('tr-TR')}
                  </span>
                  <span
                    className={`text-[10px] truncate ${
                      active ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {lang === 'ru' ? fc.subRu : fc.subTr}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          ADIM 4: DETAYLI ÇAPRAZ DENETİM VE FARK TABLOSU
      ===================================================================== */}
      <div
        ref={tableSectionRef}
        className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm text-slate-900 dark:text-white">
              {lang === 'ru'
                ? 'Реестр расхождений и сверки персонала (1С ЗУП ↔ eBA Real)'
                : '1C ZUP (Resmi) ↔ eBA (Real) Personel Fark ve Denetim Listesi'}
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {filteredRecords.length.toLocaleString('tr-TR')} {lang === 'ru' ? 'записей' : 'Kayıt'}
            </span>
            {selectedProject !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedProject('ALL')}
                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 text-indigo-950 dark:bg-indigo-500/25 dark:text-indigo-100 cursor-pointer"
              >
                Şantiye: {selectedProject} ✕
              </button>
            )}
            {selectedPermitKey !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedPermitKey('ALL')}
                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-teal-300 dark:border-teal-500/40 bg-teal-100/85 text-teal-950 dark:bg-teal-500/25 dark:text-teal-100 cursor-pointer"
              >
                Statü: {selectedPermitKey} ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Region Filter Select */}
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              <option value="ALL">{lang === 'ru' ? 'Все регионы' : 'Tüm Bölgeler / Şantiyeler'}</option>
              {byRegion.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.realActive})
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === 'ru'
                    ? 'Поиск: ФИО, Таб. №, Паспорт, ИНН...'
                    : 'Ad Soyad, Kiril, Sicil, Pasaport, İNN ara...'
                }
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-indigo-500 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/90 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'Таб. № (eBA / ЗУП)' : 'Sicil (eBA / ZUP)'}</th>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'ФИО и Гражданство' : 'Ad Soyad & Kiril İsim'}</th>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'Объект и Компания' : 'Bölge / Firma / Görev'}</th>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'Статус (eBA vs ЗУП)' : 'Durum (eBA vs 1C ZUP)'}</th>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'Разрешение (eBA vs ЗУП)' : 'İzin Statüsü (eBA vs ZUP)'}</th>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'Паспорт и ИНН' : 'Pasaport & İNN'}</th>
                <th className="py-2.5 px-3 font-normal">{lang === 'ru' ? 'Выявленные расхождения' : 'Tespit Edilen Fark Detayı'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    {lang === 'ru'
                      ? 'По выбранным критериям записей не найдено.'
                      : 'Seçilen filtre kriterlerine uygun personel kaydı bulunamadı.'}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((row) => {
                  const hasSicilDiff = row.diffFlags.includes('SICIL_FORMAT');
                  const hasPassDiff = row.diffFlags.includes('PASSPORT_DIFF');
                  const hasPermitDiff = row.diffFlags.includes('PERMIT_DIFF');
                  const hasInnDiff =
                    row.diffFlags.includes('INN_DIFF') || row.diffFlags.includes('INN_MISSING_EBA');

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors align-top"
                    >
                      {/* Sicil No */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-slate-900 dark:text-white">
                          eBA: <span className="font-mono">{row.sicil_no}</span>
                        </div>
                        <div
                          className={`text-[11px] font-mono ${
                            hasSicilDiff
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          ZUP: {row.zup_tabel_no}
                        </div>
                      </td>

                      {/* Name & Kiril Name */}
                      <td className="py-2.5 px-3">
                        <div className="text-slate-900 dark:text-white">{row.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {row.kiril_name}
                        </div>
                        <div className="text-[10.5px] text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {row.uyruk}
                        </div>
                      </td>

                      {/* Region / Project / Firma */}
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 dark:text-slate-200">{row.region}</div>
                        {(row.zup_department_tr || row.zup_department_ru) && (
                          <div className="text-[10.5px] text-indigo-600 dark:text-indigo-400 truncate max-w-[195px]">
                            1C: {lang === 'ru' ? row.zup_department_ru : row.zup_department_tr}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                          {row.firma}
                        </div>
                        <div className="text-[10.5px] text-slate-400 truncate max-w-[180px]">
                          {row.gorev}
                        </div>
                      </td>

                      {/* Employment Status (eBA vs 1C ZUP) */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] border w-fit ${
                              row.eba_status === 'Mevcut' || row.eba_status === 'Mevcut (Aktif)'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            eBA: {row.eba_status}
                            {row.eba_exit_date && row.eba_exit_date !== '—' ? ` (${row.eba_exit_date})` : ''}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] border w-fit ${
                              row.zup_status.includes('Aktif')
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            ZUP: {row.zup_status}
                          </span>
                        </div>
                      </td>

                      {/* Permit Status (eBA vs 1C ZUP) */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-[11px] text-slate-800 dark:text-slate-200">
                          eBA: <span className="font-mono">{row.eba_permit}</span>
                        </div>
                        <div
                          className={`text-[11px] ${
                            hasPermitDiff
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          ZUP: <span className="font-mono">{row.zup_permit}</span>
                        </div>
                      </td>

                      {/* Passport & INN */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                        <div
                          className={
                            hasPassDiff
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          Pasp: {row.eba_passport} / {row.zup_passport}
                        </div>
                        <div
                          className={
                            hasInnDiff
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          İNN: {row.eba_inn} / {row.zup_inn}
                        </div>
                      </td>

                      {/* Discrepancy Details */}
                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="space-y-1">
                          {(lang === 'ru' ? row.diffDetailsRu : row.diffDetailsTr).map((msg, i) => (
                            <div
                              key={i}
                              className={`text-[11px] leading-snug px-2 py-0.5 rounded border ${
                                row.risk === 'Kritik'
                                  ? 'bg-rose-50/80 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200/70 dark:border-rose-800/60'
                                  : row.risk === 'Orta'
                                  ? 'bg-amber-50/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/60'
                                  : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200/70 dark:border-slate-700/60'
                              }`}
                            >
                              {msg}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <div>
            {lang === 'ru'
              ? `Показано ${(page - 1) * pageSize + (paginatedRecords.length ? 1 : 0)}–${
                  (page - 1) * pageSize + paginatedRecords.length
                } из ${filteredRecords.length}`
              : `Toplam ${filteredRecords.length.toLocaleString('tr-TR')} kayıttan ${
                  (page - 1) * pageSize + (paginatedRecords.length ? 1 : 0)
                }–${(page - 1) * pageSize + paginatedRecords.length} arası gösteriliyor`}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
