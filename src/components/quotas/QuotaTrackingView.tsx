'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  Download,
  Upload,
  Plus,
  Search,
  Bell,
  ShieldCheck,
  UserPlus,
  FileSpreadsheet,
  Layers,
  BookOpen,
  Edit3,
  Trash2,
  RefreshCw,
  Send,
  Clock,
  ArrowRight,
  Globe2,
  Award,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  CriticalQuotaAlertItem,
  QuotaAlertSettings,
  QuotaAllocationRow,
  QuotaCountryRef,
  QuotaIrsCertificateComputed,
  QuotaOccupationRef,
  QuotaProjectMappingRef,
  QuotaRegionRef,
  QuotaWorkerApplicationRow,
} from '@/lib/quotaManager';
import {
  QuotaAllocationModal,
  QuotaAlertSettingsModal,
  QuotaIrsCertificateModal,
  QuotaWorkerIrsModal,
} from './QuotaModals';

interface RegionMatrixRow {
  regionCode: string;
  regionNameTr: string;
  regionNameRu: string;
  projects: string[];
  requestedQty: number;
  submittedQty: number;
  plannedQty: number;
  approvedQty: number;
  legacyIrsQty: number;
  certIrsQty: number;
  totalIrsReceived: number;
  irsTranches: Array<{
    index: number;
    certificateNo: string;
    label: string;
    allocatedQty: number;
    usedQty: number;
    remainingQty: number;
    validUntil: string;
    isCrossYear: boolean;
  }>;
  usedQty: number;
  irsRemainingQty: number;
  unallocatedQuotaReserve: number;
  availableTotal: number;
  recordsCount: number;
}

interface QuotaOverviewData {
  todayIso: string;
  availableYears: number[];
  selectedYear: number | 'all';
  kpis: {
    requestedTotal: number;
    submittedTotal: number;
    plannedTotal: number;
    approvedTotal: number;
    irsReceivedTotal: number;
    unallocatedReserveTotal: number;
    usedTotal: number;
    newUseTotal: number;
    extensionsTotal: number;
    irsRemainingTotal: number;
    availableTotal: number;
    certificatesCount: number;
    workerApplicationsCount: number;
  };
  regionMatrix: RegionMatrixRow[];
  certificates: QuotaIrsCertificateComputed[];
  workerApplications: QuotaWorkerApplicationRow[];
  allocations: QuotaAllocationRow[];
  alertSettings: QuotaAlertSettings;
  criticalAlerts: CriticalQuotaAlertItem[];
  references: {
    regions: QuotaRegionRef[];
    projectMappings: QuotaProjectMappingRef[];
    countries: QuotaCountryRef[];
    occupations: QuotaOccupationRef[];
  };
}

type SubTabId = 'zahid_matrix' | 'certificates' | 'workers' | 'allocations' | 'codes_guide';

export function QuotaTrackingView() {
  const [data, setData] = useState<QuotaOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [activeTab, setActiveTab] = useState<SubTabId>('zahid_matrix');

  // Global Filters
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Selected certificate in Zahid Şef's 3-table view
  const [selectedCertNo, setSelectedCertNo] = useState<string>('2600030066');

  // Code reference search
  const [codeSearch, setCodeSearch] = useState<string>('');
  const [codeSection, setCodeSection] = useState<'occupations' | 'countries' | 'projects'>(
    'occupations'
  );

  // Modals state
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<QuotaIrsCertificateComputed | null>(null);
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [workerModalCertNo, setWorkerModalCertNo] = useState<string | undefined>(undefined);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState<QuotaAllocationRow | null>(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  // Toast / banner feedback
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [sendingAlertNow, setSendingAlertNow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showNotice = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setBannerMsg({ type, text });
    setTimeout(() => {
      setBannerMsg((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  }, []);

  const fetchOverview = useCallback(
    async (yr = selectedYear) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/quotas?year=${encodeURIComponent(yr)}`);
        const json = await res.json();
        if (json?.success) {
          setData(json);
          if (
            json.certificates?.length > 0 &&
            !json.certificates.some(
              (c: QuotaIrsCertificateComputed) => c.certificate_no === selectedCertNo
            )
          ) {
            setSelectedCertNo(json.certificates[0].certificate_no);
          }
        }
      } catch {
        showNotice('Kota verileri yüklenirken bağlantı hatası oluştu.', 'err');
      } finally {
        setLoading(false);
      }
    },
    [selectedYear, selectedCertNo, showNotice]
  );

  useEffect(() => {
    fetchOverview(selectedYear);
  }, [selectedYear, fetchOverview]);

  const references = useMemo(
    () =>
      data?.references || {
        regions: [],
        projectMappings: [],
        countries: [],
        occupations: [],
      },
    [data]
  );

  const availableProjects = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const a of data.allocations) {
      if (regionFilter !== 'ALL' && a.region_code !== regionFilter) continue;
      if (a.project_name) set.add(a.project_name);
    }
    for (const c of data.certificates) {
      if (regionFilter !== 'ALL' && c.region_code !== regionFilter) continue;
      if (c.project_name) set.add(c.project_name);
    }
    return Array.from(set).sort();
  }, [data, regionFilter]);

  const filteredRegionMatrix = useMemo(() => {
    if (!data) return [];
    return data.regionMatrix.filter((r) => {
      if (regionFilter !== 'ALL' && r.regionCode !== regionFilter) return false;
      if (projectFilter !== 'ALL' && !r.projects.includes(projectFilter)) return false;
      return true;
    });
  }, [data, regionFilter, projectFilter]);

  const filteredCertificates = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return data.certificates.filter((c) => {
      if (regionFilter !== 'ALL' && c.region_code !== regionFilter) return false;
      if (projectFilter !== 'ALL' && c.project_name !== projectFilter) return false;
      if (!q) return true;
      return (
        c.certificate_no.toLowerCase().includes(q) ||
        c.tranche_label.toLocaleLowerCase('tr-TR').includes(q) ||
        c.region_code.toLowerCase().includes(q) ||
        c.project_name.toLocaleLowerCase('tr-TR').includes(q) ||
        c.lines.some(
          (l) =>
            l.occupation_code.includes(q) ||
            l.occupation_tr.toLocaleLowerCase('tr-TR').includes(q)
        )
      );
    });
  }, [data, regionFilter, projectFilter, searchQuery]);

  const activeCertificateForMatrix = useMemo(() => {
    if (!data || data.certificates.length === 0) return null;
    const pool = filteredCertificates.length > 0 ? filteredCertificates : data.certificates;
    return pool.find((c) => c.certificate_no === selectedCertNo) || pool[0] || null;
  }, [data, filteredCertificates, selectedCertNo]);

  const filteredWorkers = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return data.workerApplications.filter((w) => {
      if (regionFilter !== 'ALL' && w.region_code && w.region_code !== regionFilter) return false;
      if (projectFilter !== 'ALL' && w.project_name && w.project_name !== projectFilter) {
        return false;
      }
      if (countryFilter !== 'ALL' && w.country_code !== countryFilter) return false;
      if (!q) return true;
      return (
        w.full_name.toLocaleLowerCase('tr-TR').includes(q) ||
        w.sicil_no.toLowerCase().includes(q) ||
        w.certificate_no.toLowerCase().includes(q) ||
        w.occupation_code.includes(q) ||
        w.occupation_tr.toLocaleLowerCase('tr-TR').includes(q) ||
        w.passport_no.toLowerCase().includes(q)
      );
    });
  }, [data, regionFilter, projectFilter, countryFilter, searchQuery]);

  const matrixWorkers = useMemo(() => {
    if (!activeCertificateForMatrix) return filteredWorkers;
    return filteredWorkers.filter(
      (w) => w.certificate_no === activeCertificateForMatrix.certificate_no
    );
  }, [filteredWorkers, activeCertificateForMatrix]);

  const filteredAllocations = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return data.allocations.filter((a) => {
      if (regionFilter !== 'ALL' && a.region_code !== regionFilter) return false;
      if (projectFilter !== 'ALL' && a.project_name !== projectFilter) return false;
      if (countryFilter !== 'ALL' && a.country_code !== countryFilter) return false;
      if (statusFilter !== 'ALL' && a.migrakvota_status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.record_code.toLowerCase().includes(q) ||
        a.region_code.toLowerCase().includes(q) ||
        a.project_name.toLocaleLowerCase('tr-TR').includes(q) ||
        a.occupation_code.includes(q) ||
        a.occupation_tr.toLocaleLowerCase('tr-TR').includes(q) ||
        a.occupation_ru.toLowerCase().includes(q) ||
        a.country_tr.toLocaleLowerCase('tr-TR').includes(q) ||
        a.country_code.includes(q)
      );
    });
  }, [data, regionFilter, projectFilter, countryFilter, statusFilter, searchQuery]);

  const filteredKpis = useMemo(() => {
    if (!data) {
      return {
        requestedTotal: 0,
        submittedTotal: 0,
        plannedTotal: 0,
        approvedTotal: 0,
        irsReceivedTotal: 0,
        unallocatedReserveTotal: 0,
        usedTotal: 0,
        newUseTotal: 0,
        extensionsTotal: 0,
        irsRemainingTotal: 0,
        availableTotal: 0,
      };
    }
    if (regionFilter === 'ALL' && projectFilter === 'ALL' && countryFilter === 'ALL') {
      return data.kpis;
    }
    const requestedTotal = filteredAllocations.reduce((s, a) => s + Number(a.requested_qty || 0), 0);
    const plannedTotal = filteredAllocations
      .filter((a) => String(a.migrakvota_status || '').includes('YAPILACAK'))
      .reduce((s, a) => s + Number(a.requested_qty || 0), 0);
    const submittedTotal = requestedTotal - plannedTotal;
    const approvedTotal = filteredAllocations.reduce((s, a) => s + Number(a.approved_qty || 0), 0);
    const legacyIrs = filteredAllocations.reduce((s, a) => s + Number(a.legacy_irs_qty || 0), 0);
    const certIrs = filteredCertificates.reduce((s, c) => s + Number(c.total_allocated_qty || 0), 0);
    const irsReceivedTotal = legacyIrs + certIrs;
    const newUseTotal =
      filteredAllocations.reduce((s, a) => s + Number(a.opening_new_use || 0), 0) +
      filteredWorkers.filter(
        (w) => w.application_status !== 'cancelled' && w.usage_type !== 'visa_extension'
      ).length;
    const extensionsTotal =
      filteredAllocations.reduce((s, a) => s + Number(a.extensions_use || 0), 0) +
      filteredWorkers.filter(
        (w) => w.application_status !== 'cancelled' && w.usage_type === 'visa_extension'
      ).length;
    const usedTotal = newUseTotal + extensionsTotal;
    const irsRemainingTotal = Math.max(0, irsReceivedTotal - usedTotal);
    const unallocatedReserveTotal = Math.max(0, approvedTotal - irsReceivedTotal);
    const availableTotal = approvedTotal - usedTotal;

    return {
      requestedTotal,
      submittedTotal,
      plannedTotal,
      approvedTotal,
      irsReceivedTotal,
      unallocatedReserveTotal,
      usedTotal,
      newUseTotal,
      extensionsTotal,
      irsRemainingTotal,
      availableTotal,
    };
  }, [data, regionFilter, projectFilter, countryFilter, filteredAllocations, filteredCertificates, filteredWorkers]);

  const handleWorkerStatusChange = async (id: number, nextStatus: string) => {
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_worker_application',
          id,
          application_status: nextStatus,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice('Çalışan İРС başvuru durumu güncellendi.');
        fetchOverview();
      }
    } catch {
      showNotice('Durum güncellenemedi.', 'err');
    }
  };

  const handleDeleteWorker = async (id: number, name: string) => {
    if (!window.confirm(`${name} isimli çalışanın İРС başvurusunu silmek istediğinize emin misiniz?`)) {
      return;
    }
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_worker_application', id }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice('Çalışan başvurusu silindi ve sertifika kontenjanı iade edildi.');
        fetchOverview();
      }
    } catch {
      showNotice('Silme işlemi başarısız.', 'err');
    }
  };

  const handleDeleteCertificate = async (cert: QuotaIrsCertificateComputed) => {
    if (
      !window.confirm(
        `№ ${cert.certificate_no} (${cert.tranche_label}) sertifikasını silmek istediğinize emin misiniz?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_irs_certificate',
          id: cert.id,
          certificateNo: cert.certificate_no,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice(`ИРС № ${cert.certificate_no} sertifikası silindi.`);
        fetchOverview();
      }
    } catch {
      showNotice('Sertifika silinemedi.', 'err');
    }
  };

  const handleDeleteAllocation = async (row: QuotaAllocationRow) => {
    if (
      !window.confirm(
        `${row.record_code} (${row.region_code} - ${row.occupation_tr}) kota kaydını silmek istediğinize emin misiniz?`
      )
    ) {
      return;
    }
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_allocation', id: row.id }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice(`${row.record_code} kota kaydı silindi.`);
        fetchOverview();
      }
    } catch {
      showNotice('Kayıt silinemedi.', 'err');
    }
  };

  const handleTriggerAlertNow = async () => {
    setSendingAlertNow(true);
    try {
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_test_alert' }),
      });
      const json = await res.json();
      showNotice(
        json?.message || 'Kritik kota bildirimi Telegram ve E-Posta kanallarına iletildi.',
        json?.success ? 'ok' : 'err'
      );
      fetchOverview();
    } catch {
      showNotice('Bildirim gönderilirken hata oluştu.', 'err');
    } finally {
      setSendingAlertNow(false);
    }
  };

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Zahid Şef Bölge & İРС Matrisi
    const matrixRows = filteredRegionMatrix.map((r) => ({
      'Bölge (Субъект РФ)': r.regionCode,
      'Bölge Adı (RU)': r.regionNameRu,
      Projeler: r.projects.join(', '),
      'Заявлено (Başvurulan Kota)': r.requestedQty,
      'Gönderilen (Отправлено)': r.submittedQty,
      'Planlanan (Не отправлена)': r.plannedQty,
      'Подтверждено (Onaylanan Kota)': r.approvedQty,
      'ИРС(РНП)1': r.irsTranches[0]?.allocatedQty || 0,
      'ИРС(РНП)1 No': r.irsTranches[0]?.certificateNo || '',
      'ИРС(РНП)2': r.irsTranches[1]?.allocatedQty || 0,
      'ИРС(РНП)3': r.irsTranches[2]?.allocatedQty || 0,
      'Toplam Alınan İРС': r.totalIrsReceived,
      'Kullanılan Kota': r.usedQty,
      'Kalan İРС Kontenjanı': r.irsRemainingQty,
      'Sonraya Saklanan Kota (Onaylanan - İРС)': r.unallocatedQuotaReserve,
      'Toplam Kalan Kota': r.availableTotal,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(matrixRows),
      '1_Bolge_IRS_Matrisi'
    );

    // Sheet 2: Sertifika İçi Görev Kodu Dağılımı
    const certLinesRows: Array<Record<string, any>> = [];
    for (const c of filteredCertificates) {
      for (const ln of c.lines) {
        certLinesRows.push({
          'ИРС (РНП) No': c.certificate_no,
          Dilim: c.tranche_label,
          'Kota Yılı': c.quota_year,
          Bölge: c.region_code,
          Proje: c.project_name,
          'Geçerlilik Başlangıç': c.valid_from,
          'Geçerlilik Bitiş': c.valid_until,
          'Dönem Kaydırma': c.is_cross_year_carryover ? 'EVET (Sonraki Yıla Aktarıldı)' : 'HAYIR',
          'ОКПДТР 2025 Görev Kodu': ln.occupation_code,
          'Görev (TR)': ln.occupation_tr,
          'Görev (RU)': ln.occupation_ru,
          'ОКСМ Ülke Kodu': ln.country_code || 'GENEL',
          'İРС Kontenjan': ln.allocated_qty,
          'Kullanıldı (COUNTIFS)': ln.used_qty,
          'Kalan İРС': ln.remaining_qty,
        });
      }
    }
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(certLinesRows),
      '2_IRS_Gorev_Dagilimi'
    );

    // Sheet 3: Çalışan İРС Başvuruları
    const workerRows = filteredWorkers.map((w) => ({
      Sicil: w.sicil_no,
      FIO: w.full_name,
      Pasaport: w.passport_no,
      'Ülke Kodu (ОКСМ)': w.country_code,
      Ülke: w.country_tr,
      'Görev Kodu (ОКПДТР)': w.occupation_code,
      Görev: w.occupation_tr,
      Bölge: w.region_code,
      Proje: w.project_name,
      IRS: w.certificate_no,
      Tür: w.usage_type === 'visa_extension' ? 'Vize Uzatımı' : 'Yeni РНР Başvurusu',
      Durum: w.application_status,
      Tarih: w.application_date,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(workerRows),
      '3_Calisan_IRS_Basvurulari'
    );

    // Sheet 4: Bakanlık Kota LOG
    const logRows = filteredAllocations.map((a) => ({
      'Kayıt Kodu': a.record_code,
      Yıl: a.year,
      'Başvuru Türü': a.application_type,
      Durum: a.migrakvota_status,
      Bölge: a.region_code,
      Proje: a.project_name,
      'Ülke Kodu (ОКСМ)': a.country_code,
      Ülke: a.country_tr,
      'Görev Kodu (ОКПДТР 2025)': a.occupation_code,
      'Görev (TR)': a.occupation_tr,
      'Görev (RU)': a.occupation_ru,
      'Başvurulan (Заявлено)': a.requested_qty,
      'Onaylanan (Подтверждено)': a.approved_qty,
      'Alınan İРС': a.legacy_irs_qty,
      'Yeni Kullanım': (a.opening_new_use || 0) + (a.live_worker_new_use || 0),
      'Vize Uzatımı': (a.extensions_use || 0) + (a.live_worker_ext_use || 0),
      'Kalan Kota': a.available_qty,
      Not: a.notes,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(logRows),
      '4_Bakanlik_Kota_LOG'
    );

    XLSX.writeFile(wb, `Pondera_Kota_ve_IRS_Takip_${selectedYear}_${data.todayIso}.xlsx`);
  };

  const handleImportExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const targetSheetName =
        wb.SheetNames.find(
          (n) =>
            n.toUpperCase().includes('LOG') ||
            n.toUpperCase().includes('BAKANLIK') ||
            n.toUpperCase().includes('KOTA')
        ) || wb.SheetNames[0];
      const ws = wb.Sheets[targetSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (!rows.length) {
        showNotice('Excel dosyasında aktarılacak satır bulunamadı.', 'err');
        return;
      }

      const normalized = rows.map((r) => ({
        record_code: r['Kayıt Kodu'] || r['Kayıt ID'] || r['record_code'] || '',
        year: Number(r['Yıl'] || r['YIL'] || r['year'] || selectedYear || 2026),
        application_type:
          r['Başvuru Türü'] || r['TÜR (İlk / Korek.)'] || r['application_type'] || 'ILK BASVURU',
        migrakvota_status:
          r['Durum'] || r['DURUM'] || r['migrakvota_status'] || 'TAMAMLANDI',
        region_code: r['Bölge'] || r['BÖLGE'] || r['region_code'] || 'TATARISTAN',
        project_name: r['Proje'] || r['PROJE'] || r['project_name'] || '',
        country_code: String(
          r['Ülke Kodu (ОКСМ)'] || r['ÜLKE KODU'] || r['country_code'] || '356'
        ),
        country_tr: r['Ülke'] || r['ÜLKE (TR)'] || '',
        occupation_code: String(
          r['Görev Kodu (ОКПДТР 2025)'] || r['GÖREV KODU'] || r['occupation_code'] || '102660'
        ),
        occupation_tr: r['Görev (TR)'] || r['GÖREV (TR)'] || '',
        requested_qty: Number(
          r['Başvurulan (Заявлено)'] || r['BAŞVURULAN'] || r['requested_qty'] || 0
        ),
        approved_qty: Number(
          r['Onaylanan (Подтверждено)'] || r['ONAYLANAN'] || r['approved_qty'] || 0
        ),
        legacy_irs_qty: Number(r['Alınan İРС'] || r['İРС ALINAN'] || r['legacy_irs_qty'] || 0),
        opening_new_use: Number(
          r['Yeni Kullanım'] || r['YENİ KULLANIM'] || r['opening_new_use'] || 0
        ),
        extensions_use: Number(
          r['Vize Uzatımı'] || r['UZATIMLAR'] || r['extensions_use'] || 0
        ),
        notes: r['Not'] || r['KOMENT'] || r['notes'] || '',
      }));

      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_excel_rows', rows: normalized }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice(json.message);
        fetchOverview();
      } else {
        showNotice(json?.message || 'Excel aktarımı başarısız.', 'err');
      }
    } catch {
      showNotice('Excel dosyası okunamadı.', 'err');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Hero Header & Primary Actions */}
      <div className="bg-gradient-to-r from-[#1A363E] via-[#1E444E] to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-teal-800/40">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-200 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>
                Минтруд РФ (migrakvota.gov.ru) • МВД ИРС (РНП) • ОКПДТР 2025 & ОКСМ Resmi Kod Sistemi
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              Çalışma Kotaları & ИРС (РНП) Sertifika Takip Merkezi
            </h2>
            <p className="text-xs sm:text-sm text-slate-200/90 max-w-4xl">
              Onaylanan kotaları tek seferde harcamak yerine ihtiyaç oldukça parçalı{' '}
              <strong className="text-emerald-300">ИРС (РНП) sertifikalarına</strong> (Örn:{' '}
              <span className="underline decoration-emerald-400">№ 2600030066 — 160 Kişi</span>)
              dönüştürün, geçerlilik süresini bir sonraki yılın ilk çeyreğine kaydırın ve her yeni
              çalışan başvurusunu sertifika numarası üzerinden anlık takip edin.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setWorkerModalCertNo(activeCertificateForMatrix?.certificate_no);
                setWorkerModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs shadow-lg shadow-emerald-950/30 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Çalışan İРС Başvurusu Gir</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingCert(null);
                setCertModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium transition cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-teal-300" />
              <span>+ ИРС (РНП) Sertifikası Tanımla</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingAlloc(null);
                setAllocModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-sky-300" />
              <span>+ Kota Başvurusu</span>
            </button>

            <button
              type="button"
              onClick={() => setAlertModalOpen(true)}
              className="relative inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-medium transition cursor-pointer"
            >
              <Bell className="w-4 h-4 text-amber-300" />
              <span>Bildirim Ayarları</span>
              {(data?.criticalAlerts?.length || 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                  {data?.criticalAlerts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Bar inside Hero */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Year pills */}
            <div className="inline-flex items-center bg-slate-950/40 p-1 rounded-xl border border-white/10">
              {['2026', '2027', 'all'].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    selectedYear === yr
                      ? 'bg-teal-500 text-slate-950 font-semibold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {yr === 'all' ? 'Tüm Yıllar (2026+2027)' : `${yr} Kotası`}
                </button>
              ))}
            </div>

            {/* Region Filter */}
            <select
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setProjectFilter('ALL');
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-950/40 border border-white/15 text-xs text-white"
            >
              <option value="ALL" className="text-slate-900">
                Tüm Bölgeler (8 Субъект РФ)
              </option>
              {references.regions.map((r) => (
                <option key={r.code} value={r.code} className="text-slate-900">
                  {r.code} — {r.nameRu}
                </option>
              ))}
            </select>

            {/* Project Filter */}
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950/40 border border-white/15 text-xs text-white"
            >
              <option value="ALL" className="text-slate-900">
                Tüm Şantiyeler / Projeler
              </option>
              {availableProjects.map((p) => (
                <option key={p} value={p} className="text-slate-900">
                  {p}
                </option>
              ))}
            </select>

            {/* Country Filter */}
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950/40 border border-white/15 text-xs text-white"
            >
              <option value="ALL" className="text-slate-900">
                Tüm Ülkeler (ОКСМ)
              </option>
              <option value="356" className="text-slate-900">
                356 — HİNDİSTAN (ИНДИЯ)
              </option>
              <option value="795" className="text-slate-900">
                795 — TÜRKMENİSTAN (ТУРКМЕНИЯ)
              </option>
              <option value="792" className="text-slate-900">
                792 — TÜRKİYE (ТУРЦИЯ)
              </option>
              <option value="050" className="text-slate-900">
                050 — BANGLADEŞ
              </option>
              <option value="360" className="text-slate-900">
                360 — ENDONEZYA
              </option>
              <option value="608" className="text-slate-900">
                608 — FİLİPİNLER
              </option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-300 absolute left-3 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="İРС No, Görev Kodu (102660), FIO, Sicil ara..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/40 border border-white/15 text-xs text-white placeholder:text-slate-400 w-60"
              />
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white border border-white/15 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel İndir</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls"
              onChange={handleImportExcelFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white border border-white/15 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Excel Yükle</span>
            </button>

            <button
              type="button"
              onClick={() => fetchOverview()}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMsg && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
            bannerMsg.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-[11px] underline cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {/* 6 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <div className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>1. Başvurulan Kota (Заявлено)</span>
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">
            {filteredKpis.requestedTotal.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Gönderilen:{' '}
            <strong className="text-slate-700 dark:text-slate-200">
              {filteredKpis.submittedTotal.toLocaleString('tr-TR')}
            </strong>{' '}
            • Planlanan: {filteredKpis.plannedTotal.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-teal-200/80 dark:border-teal-900/60 shadow-xs">
          <div className="flex items-center justify-between text-xs text-teal-700 dark:text-teal-300">
            <span>2. Onaylanan Kota (Подтверждено)</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-teal-700 dark:text-teal-300 mt-1.5">
            {filteredKpis.approvedTotal.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Минтруд РФ Приказ Onay Oranı:{' '}
            <strong>
              {filteredKpis.submittedTotal > 0
                ? `%${Math.round((filteredKpis.approvedTotal / filteredKpis.submittedTotal) * 100)}`
                : '%0'}
            </strong>
          </div>
        </div>

        <div className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-xs">
          <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300">
            <span>3. Alınan ИРС (РНП) Dilimleri</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 mt-1.5">
            {filteredKpis.irsReceivedTotal.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Aktif Sertifika: <strong>{data?.certificates.length || 0} Adet</strong> (Harca tabi
            dilim)
          </div>
        </div>

        <div className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
            <span>4. Sonraya Saklanan Kota</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-300 mt-1.5">
            {filteredKpis.unallocatedReserveTotal.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Onaylanan − Alınan İРС (Sonraki dilimler için yedek)
          </div>
        </div>

        <div className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-sky-200/80 dark:border-sky-900/60 shadow-xs">
          <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-300">
            <span>5. Kullanılan Kota (Toplam)</span>
            <Briefcase className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-sky-700 dark:text-sky-300 mt-1.5">
            {filteredKpis.usedTotal.toLocaleString('tr-TR')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Yeni РНР: <strong>{filteredKpis.newUseTotal.toLocaleString('tr-TR')}</strong> • Vize
            Uzatımı: <strong>{filteredKpis.extensionsTotal.toLocaleString('tr-TR')}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 shadow-xs">
          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
            <span>6. Kalan Boş İРС / Kota</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
            {filteredKpis.irsRemainingTotal.toLocaleString('tr-TR')}{' '}
            <span className="text-xs font-normal text-slate-500">
              / {filteredKpis.availableTotal.toLocaleString('tr-TR')}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Hazır İРС Kalan: <strong>{filteredKpis.irsRemainingTotal}</strong> • Toplam Kalan:{' '}
            <strong>{filteredKpis.availableTotal.toLocaleString('tr-TR')}</strong>
          </div>
        </div>
      </div>

      {/* Critical Low-Quota Banner (Only shown when items breach threshold) */}
      {data && data.criticalAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-800/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Kritik Kota & ИРС Kontenjan Azaldı Uyarısı ({data.criticalAlerts.length} Kalem Eşik
                Altında)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.criticalAlerts.slice(0, 5).map((al) => (
                  <span
                    key={al.key}
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium border ${
                      al.severity === 'critical'
                        ? 'bg-rose-100 dark:bg-rose-950/70 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                        : 'bg-amber-100 dark:bg-amber-900/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    {al.titleTr}
                  </span>
                ))}
                {data.criticalAlerts.length > 5 && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 self-center">
                    +{data.criticalAlerts.length - 5} diğer kalem
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={sendingAlertNow}
              onClick={handleTriggerAlertNow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingAlertNow ? 'Gönderiliyor...' : 'Telegram & E-Posta Gönder'}</span>
            </button>
            <button
              type="button"
              onClick={() => setAlertModalOpen(true)}
              className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 cursor-pointer"
            >
              Eşikleri Ayarla
            </button>
          </div>
        </div>
      )}

      {/* 5 Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#131C31] p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        {[
          {
            id: 'zahid_matrix' as SubTabId,
            label: '1. Zahid Şef 3’lü Kota & ИРС (РНП) Takip Tablosu',
            icon: Layers,
            badge: '3 Tablo Birlikte',
          },
          {
            id: 'certificates' as SubTabId,
            label: '2. ИРС (РНП) Sertifikaları & Dönem Kaydırma',
            icon: ShieldCheck,
            badge: `${filteredCertificates.length} Sertifika`,
          },
          {
            id: 'workers' as SubTabId,
            label: '3. Çalışan İРС Başvuruları',
            icon: UserPlus,
            badge: `${filteredWorkers.length} Kişi`,
          },
          {
            id: 'allocations' as SubTabId,
            label: '4. Bakanlık Kota Kayıtları (migrakvota.gov.ru)',
            icon: FileSpreadsheet,
            badge: `${filteredAllocations.length} Kayıt`,
          },
          {
            id: 'codes_guide' as SubTabId,
            label: '5. ОКПДТР 2025 Görev & ОКСМ Ülke Kodları Rehberi',
            icon: BookOpen,
            badge: '211 Görev • 239 Ülke',
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                active
                  ? 'bg-[#1A363E] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                  active
                    ? 'bg-teal-400/20 text-teal-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* ==========================================================================
          TAB 1: ZAHİD ŞEF 3'LÜ KOTA & ИРС (РНП) MATRİSİ (3 LINKED TABLES)
          ========================================================================== */}
      {activeTab === 'zahid_matrix' && (
        <div className="space-y-5">
          {/* TABLE 1: ÜST KOTA HAVUZU & PARÇALI ИРС(РНП) DİLİMLERİ */}
          <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-[11px] font-bold">
                    1. TABLO
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Üst Kota Havuzu & Parçalı ИРС (РНП) Sertifika Dilimleri (Заявлено → Подтверждено
                    → ИРС(РНП)1..n)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Onaylanan kota (Örn: Murmansk 2.000 başvuru → 1.351 onay) tek seferde harcanmaz;
                  ihtiyaç oldukça parçalı <strong>ИРС(РНП)</strong> sertifikası alınır, kalan kota
                  sonraki dönemler veya gelecek yılın ilk çeyreği için saklanır.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingCert(null);
                  setCertModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Yeni ИРС(РНП) Dilimi Ekle
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1A363E] text-white">
                    <th className="py-2.5 px-3 font-semibold">Bölge (Субъект РФ) / Proje</th>
                    <th className="py-2.5 px-3 text-right font-semibold">
                      <div>Заявлено</div>
                      <div className="text-[10px] font-normal text-teal-200">
                        Отправлено к рассмотрению
                      </div>
                    </th>
                    <th className="py-2.5 px-3 text-right font-semibold">
                      <div>Подтверждено</div>
                      <div className="text-[10px] font-normal text-teal-200">
                        Включена в приказ
                      </div>
                    </th>
                    <th className="py-2.5 px-3 text-center font-semibold">ИРС(РНП)1</th>
                    <th className="py-2.5 px-3 text-center font-semibold">ИРС(РНП)2</th>
                    <th className="py-2.5 px-3 text-center font-semibold">ИРС(РНП)3</th>
                    <th className="py-2.5 px-3 text-center font-semibold">ИРС(РНП)4+ / Mevcut</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Kullanılan Kota</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Kalan İРС</th>
                    <th className="py-2.5 px-3 text-right font-semibold">
                      <div>Saklanan / Kalan Kota</div>
                      <div className="text-[10px] font-normal text-amber-200">
                        Onaylanan − ∑ИРС
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRegionMatrix.map((r) => {
                    const t1 = r.irsTranches[0];
                    const t2 = r.irsTranches[1];
                    const t3 = r.irsTranches[2];
                    const restCertQty = r.irsTranches
                      .slice(3)
                      .reduce((s, x) => s + x.allocatedQty, 0);
                    return (
                      <tr
                        key={r.regionCode}
                        className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {r.regionCode}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {r.projects.join(', ') || r.regionNameRu}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                          <div>{r.requestedQty.toLocaleString('tr-TR')}</div>
                          {r.plannedQty > 0 && (
                            <div className="text-[10px] text-amber-600">
                              ({r.submittedQty} gönderildi + {r.plannedQty} plan)
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-teal-700 dark:text-teal-300">
                          {r.approvedQty.toLocaleString('tr-TR')}
                        </td>

                        {[t1, t2, t3].map((tr, idx) => (
                          <td key={idx} className="py-2.5 px-3 text-center">
                            {tr ? (
                              <button
                                type="button"
                                onClick={() => setSelectedCertNo(tr.certificateNo)}
                                className={`inline-flex flex-col items-center px-2.5 py-1 rounded-xl border text-[11px] transition cursor-pointer ${
                                  selectedCertNo === tr.certificateNo
                                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                    : 'bg-teal-50/70 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 hover:bg-teal-100'
                                }`}
                              >
                                <span className="font-bold">{tr.allocatedQty}</span>
                                <span className="text-[10px] opacity-85">№ {tr.certificateNo}</span>
                                {tr.isCrossYear && (
                                  <span className="text-[9px] px-1 rounded bg-amber-400/30 text-amber-900 dark:text-amber-200 font-semibold">
                                    → {tr.validUntil.slice(0, 4)} Q1
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">—</span>
                            )}
                          </td>
                        ))}

                        <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-300">
                          {restCertQty + r.legacyIrsQty > 0 ? (
                            <span className="font-medium">
                              {(restCertQty + r.legacyIrsQty).toLocaleString('tr-TR')}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right font-semibold text-sky-700 dark:text-sky-300">
                          {r.usedQty.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {r.irsRemainingQty.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-200/70 dark:border-amber-800/60">
                            {r.unallocatedQuotaReserve.toLocaleString('tr-TR')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLE 2 & TABLE 3 SIDE BY SIDE (OR STACKED ON SMALL SCREENS) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* TABLE 2: SEÇİLİ ИРС(РНП) SERTİFİKASI GÖREV KODU DAĞILIMI (COUNTIFS) */}
            <div className="xl:col-span-5 bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-[11px] font-bold">
                      2. TABLO
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Görev Kodu Bazlı İРС Kullanımı (COUNTIFS)
                    </h3>
                  </div>

                  {activeCertificateForMatrix && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCert(activeCertificateForMatrix);
                        setCertModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Sertifikayı Düzenle
                    </button>
                  )}
                </div>

                {/* Certificate Selector Bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={activeCertificateForMatrix?.certificate_no || ''}
                    onChange={(e) => setSelectedCertNo(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    {(data?.certificates || []).map((c) => (
                      <option key={c.certificate_no} value={c.certificate_no}>
                        ИРС № {c.certificate_no} ({c.tranche_label}) — {c.region_code} /{' '}
                        {c.project_name} ({c.total_allocated_qty} Kişi)
                      </option>
                    ))}
                  </select>
                </div>

                {activeCertificateForMatrix && (
                  <div className="p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Sertifika No:</span>{' '}
                      <strong className="text-teal-800 dark:text-teal-200">
                        № {activeCertificateForMatrix.certificate_no}
                      </strong>{' '}
                      • <span className="text-slate-500">Geçerlilik:</span>{' '}
                      <strong>
                        {activeCertificateForMatrix.valid_from} →{' '}
                        {activeCertificateForMatrix.valid_until}
                      </strong>
                    </div>
                    {activeCertificateForMatrix.is_cross_year_carryover && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-semibold">
                        2027 Q1 Dönem Kaydırma Aktif
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#1A363E] text-white">
                      <th className="py-2.5 px-3 font-semibold">Görev (ОКПДТР 2025 Kodu)</th>
                      <th className="py-2.5 px-3 text-right font-semibold">IRS</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Kullanıldı</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Kalan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(activeCertificateForMatrix?.lines || []).map((ln) => (
                      <tr
                        key={ln.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-mono mr-1.5">
                              {ln.occupation_code}
                            </span>
                            {ln.occupation_tr}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {ln.occupation_ru}
                            {ln.country_code ? ` • Ülke: ${ln.country_code} (${ln.country_tr})` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {ln.allocated_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-sky-700 dark:text-sky-300">
                          {ln.used_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-lg font-bold ${
                              ln.remaining_qty <= 10
                                ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {ln.remaining_qty}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {activeCertificateForMatrix && (
                    <tfoot>
                      <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                        <td className="py-2.5 px-3">Total (Toplam Sertifika Kontenjanı)</td>
                        <td className="py-2.5 px-3 text-right">
                          {activeCertificateForMatrix.total_allocated_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right text-sky-700 dark:text-sky-300">
                          {activeCertificateForMatrix.total_used_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-300">
                          {activeCertificateForMatrix.total_remaining_qty}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* TABLE 3: ÇALIŞAN / ADAY ИРС BAŞVURU LİSTESİ & HIZLI GİRİŞ */}
            <div className="xl:col-span-7 bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                      3. TABLO
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Yeni Çalışan / Aday ИРС Başvuruları (Sicil • FIO • Görev • Proje • IRS No)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Bu tabloya eklenen her çalışan, yazılan <strong>IRS (РНП)</strong> numarasının
                    ilgili görev kontenjanından otomatik düşer.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setWorkerModalCertNo(activeCertificateForMatrix?.certificate_no);
                    setWorkerModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    + № {activeCertificateForMatrix?.certificate_no || 'İРС'} ile Çalışan Ekle
                  </span>
                </button>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#1A363E] text-white">
                      <th className="py-2.5 px-3 font-semibold">Sicil</th>
                      <th className="py-2.5 px-3 font-semibold">FIO (Ad Soyad)</th>
                      <th className="py-2.5 px-3 font-semibold">Görev (ОКПДТР)</th>
                      <th className="py-2.5 px-3 font-semibold">Proje</th>
                      <th className="py-2.5 px-3 font-semibold">IRS (РНП No)</th>
                      <th className="py-2.5 px-3 font-semibold">Durum</th>
                      <th className="py-2.5 px-3 text-right font-semibold">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {matrixWorkers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-8 text-center text-xs text-slate-400 dark:text-slate-500"
                        >
                          Bu ИРС sertifikasına kayıtlı çalışan başvurusu bulunmuyor. Sağ üstteki
                          butonla yeni çalışan ekleyebilirsiniz.
                        </td>
                      </tr>
                    ) : (
                      matrixWorkers.map((w) => (
                        <tr
                          key={w.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                            {w.sicil_no || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                            <div>{w.full_name}</div>
                            {w.passport_no && (
                              <div className="text-[10px] text-slate-400">
                                Pasaport: {w.passport_no} • Ülke: {w.country_code}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-mono mr-1">
                              {w.occupation_code}
                            </span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {w.occupation_tr}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                            {w.project_name || w.region_code || '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 font-mono font-semibold">
                              {w.certificate_no}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={w.application_status}
                              onChange={(e) => handleWorkerStatusChange(w.id, e.target.value)}
                              className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-800 dark:text-slate-200"
                            >
                              <option value="applied">İРС Başvuruldu</option>
                              <option value="rnr_approved">РНР Onaylandı</option>
                              <option value="visa_issued">Vize Çıktı</option>
                              <option value="arrived">Sahaya Geldi</option>
                              <option value="cancelled">İptal (Kontenjan İade)</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteWorker(w.id, w.full_name)}
                              className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 2: ИРС (РНП) SERTİFİKALARI & DÖNEM KAYDIRMA KARTLARI
          ========================================================================== */}
      {activeTab === 'certificates' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Kayıtlı ИРС (РНП) Kurumsal Çalıştırma İzin Sertifikaları
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Yıl sonunda alınan ИРС (РНП) sertifikaları 1 yıla kadar geçerli olduğu için kalan
                kotaları bir sonraki yılın ilk çeyreğine (Örn: 2027 Q1) kaydırarak kullanmanızı
                sağlar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingCert(null);
                setCertModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Yeni ИРС (РНП) Sertifikası Tanımla
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCertificates.map((cert) => (
              <div
                key={cert.id}
                className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-teal-600 text-white text-xs font-mono font-bold">
                        № {cert.certificate_no}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                        {cert.tranche_label}
                      </span>
                      {cert.is_cross_year_carryover && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300/70 text-[11px] font-semibold">
                          {cert.quota_year} Kotası → {cert.valid_until.slice(0, 4)} Dönem Kaydırma
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-2">
                      {cert.region_code} — {cert.project_name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Geçerlilik: <strong>{cert.valid_from}</strong> →{' '}
                      <strong>{cert.valid_until}</strong>
                      {cert.days_until_expiry !== null && (
                        <span> ({cert.days_until_expiry} gün kaldı)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setWorkerModalCertNo(cert.certificate_no);
                        setWorkerModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                    >
                      + Çalışan Ekle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCert(cert);
                        setCertModalOpen(true);
                      }}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Düzenle"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCertificate(cert)}
                      className="p-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Summary numbers */}
                <div className="grid grid-cols-4 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-center">
                  <div>
                    <div className="text-[11px] text-slate-500">Sertifika İРС</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">
                      {cert.total_allocated_qty}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Kullanılan</div>
                    <div className="text-base font-bold text-sky-600 dark:text-sky-400">
                      {cert.total_used_qty}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Kalan Boş</div>
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {cert.total_remaining_qty}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">МВД Harcı</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                      {(cert.total_allocated_qty * cert.state_duty_per_person).toLocaleString(
                        'tr-TR'
                      )}{' '}
                      ₽
                    </div>
                  </div>
                </div>

                {/* Per occupation lines */}
                <div className="space-y-1.5">
                  {cert.lines.map((ln) => {
                    const pct =
                      ln.allocated_qty > 0
                        ? Math.min(100, Math.round((ln.used_qty / ln.allocated_qty) * 100))
                        : 0;
                    return (
                      <div key={ln.id} className="text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span>
                            <strong className="font-mono text-teal-700 dark:text-teal-300">
                              {ln.occupation_code}
                            </strong>{' '}
                            — {ln.occupation_tr}
                          </span>
                          <span>
                            Kullanılan: <strong>{ln.used_qty}</strong> / {ln.allocated_qty} • Kalan:{' '}
                            <strong className="text-emerald-600 dark:text-emerald-400">
                              {ln.remaining_qty}
                            </strong>
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-teal-600 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {cert.notes && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Not: {cert.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 3: TÜM ÇALIŞAN ИРС BAŞVURULARI TABLOSU
          ========================================================================== */}
      {activeTab === 'workers' && (
        <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tüm Çalışan / Aday ИРС (РНП) Başvuruları ({filteredWorkers.length} Kayıt)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Her çalışan başvurusu seçilen ИРС numarasının ilgili ОКПДТР 2025 görev kodundan
                düşülür.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWorkerModalCertNo(activeCertificateForMatrix?.certificate_no);
                setWorkerModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> + Yeni Çalışan İРС Başvurusu Ekle
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#1A363E] text-white">
                  <th className="py-2.5 px-3 font-semibold">Sicil No</th>
                  <th className="py-2.5 px-3 font-semibold">FIO (Ad Soyad)</th>
                  <th className="py-2.5 px-3 font-semibold">Pasaport No</th>
                  <th className="py-2.5 px-3 font-semibold">Ülke (ОКСМ)</th>
                  <th className="py-2.5 px-3 font-semibold">Görev Kodu (ОКПДТР 2025)</th>
                  <th className="py-2.5 px-3 font-semibold">Bölge / Proje</th>
                  <th className="py-2.5 px-3 font-semibold">ИРС (РНП) No</th>
                  <th className="py-2.5 px-3 font-semibold">Durum</th>
                  <th className="py-2.5 px-3 text-right font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredWorkers.map((w) => (
                  <tr
                    key={w.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-2.5 px-3 font-mono">{w.sicil_no || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {w.full_name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                      {w.passport_no || '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono text-slate-500">{w.country_code}</span>{' '}
                      {w.country_tr}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-mono mr-1">
                        {w.occupation_code}
                      </span>
                      {w.occupation_tr}
                    </td>
                    <td className="py-2.5 px-3">
                      {w.region_code} / {w.project_name}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-teal-700 dark:text-teal-300">
                      № {w.certificate_no}
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={w.application_status}
                        onChange={(e) => handleWorkerStatusChange(w.id, e.target.value)}
                        className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                      >
                        <option value="applied">İРС Başvuruldu</option>
                        <option value="rnr_approved">РНР Onaylandı</option>
                        <option value="visa_issued">Vize Çıktı</option>
                        <option value="arrived">Sahaya Geldi</option>
                        <option value="cancelled">İptal</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteWorker(w.id, w.full_name)}
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 4: BAKANLIK KOTA KAYITLARI (migrakvota.gov.ru — 260 KAYIT)
          ========================================================================== */}
      {activeTab === 'allocations' && (
        <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Bakanlık Kota Başvuru & Onay Kayıtları (АИК «Миграционные квоты» —{' '}
                {filteredAllocations.length} Kayıt)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pondera_Kota_Dynamic_Projects_17102026.xlsm dosyasındaki tüm 2026 ve 2027 resmi
                görev ve ülke kodlu kayıtlar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Tüm Durumlar</option>
                <option value="TAMAMLANDI">TAMAMLANDI (Утверждена / Приказ)</option>
                <option value="BASVURU YAPILDI">BAŞVURU YAPILDI (Отправлена)</option>
                <option value="BASVURU YAPILACAK">BAŞVURU YAPILACAK (Не отправлена)</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setEditingAlloc(null);
                  setAllocModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> + Yeni Kota Kaydı Ekle
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#1A363E] text-white">
                  <th className="py-2.5 px-3 font-semibold">Kayıt Kodu</th>
                  <th className="py-2.5 px-3 font-semibold">Yıl / Tür</th>
                  <th className="py-2.5 px-3 font-semibold">Durum (migrakvota)</th>
                  <th className="py-2.5 px-3 font-semibold">Bölge / Proje</th>
                  <th className="py-2.5 px-3 font-semibold">Ülke (ОКСМ)</th>
                  <th className="py-2.5 px-3 font-semibold">Görev (ОКПДТР 2025)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Başvurulan</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Onaylanan</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Alınan İРС</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Kullanılan</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Kalan</th>
                  <th className="py-2.5 px-3 text-right font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAllocations.map((a) => (
                  <tr
                    key={a.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-2 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {a.record_code}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-bold">{a.year}</span> •{' '}
                      <span className="text-[11px] text-slate-500">{a.application_type}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          a.migrakvota_status === 'TAMAMLANDI'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : a.migrakvota_status === 'BASVURU YAPILDI'
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {a.migrakvota_status}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {a.region_code}
                      </div>
                      <div className="text-[10px] text-slate-500">{a.project_name}</div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-mono text-teal-700 dark:text-teal-300 font-semibold">
                        {a.country_code}
                      </span>{' '}
                      — {a.country_tr}
                    </td>
                    <td className="py-2 px-3">
                      <div>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-mono mr-1">
                          {a.occupation_code}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {a.occupation_tr}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">
                        {a.occupation_ru}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{a.requested_qty}</td>
                    <td className="py-2 px-3 text-right font-bold text-teal-700 dark:text-teal-300">
                      {a.approved_qty}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-indigo-600 dark:text-indigo-300">
                      {a.legacy_irs_qty}
                    </td>
                    <td className="py-2 px-3 text-right text-sky-700 dark:text-sky-300">
                      {a.total_used_qty || 0}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {a.available_qty ?? a.approved_qty}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAlloc(a);
                            setAllocModalOpen(true);
                          }}
                          className="p-1 text-slate-500 hover:text-teal-600 cursor-pointer"
                          title="Düzenle"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAllocation(a)}
                          className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 5: ОКПДТР 2025 GÖREV & ОКСМ ÜLKE KOD REHBERİ + RUSYA MEVZUAT ÖZETİ
          ========================================================================== */}
      {activeTab === 'codes_guide' && (
        <div className="space-y-5">
          {/* 4-Step Russian Quota & ИРС Legal Process Guide */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            {[
              {
                step: '1. ADIM • Работа в России (trudvsem.ru)',
                title: 'Açık İş İlanı Zorunluluğu',
                desc: 'Kota başvurusundan önce ilgili görev kodu (ОКПДТР 2025) için yerel işgücü piyasasında en az 30 gün açık ilan bulundurulur.',
              },
              {
                step: '2. ADIM • АИК «Миграционные квоты»',
                title: 'migrakvota.gov.ru Kota Başvurusu & Приказ',
                desc: 'Bölge (Субъект РФ), Ülke (ОКСМ 3 haneli kod) ve Görev (ОКПДТР 6 haneli kod) bazında Основная заявка veya Корректировка квоты yapılır.',
              },
              {
                step: '3. ADIM • МВД РФ — ИРС (РНП) Sertifikası',
                title: 'Parçalı Kurumsal Çekim İzni & Dönem Kaydırma',
                desc: 'Onaylanan kotanın tamamına aynı anda harç ödenmez. İhtiyaç oldukça parçalı ИРС(РНП) sertifikası (Örn: № 2600030066 — 160 kişi) alınır; yıl sonunda alınan sertifika gelecek yılın ilk çeyreğinde de geçerlidir.',
              },
              {
                step: '4. ADIM • РНР & Vize Davetiyesi',
                title: 'Sertifika No Üzerinden Kişisel Çalışma İzni',
                desc: 'Her yeni çalışan başvurusu aktif ИРС(РНП) sertifika numarası ve sertifikadaki ОКПДТР görev kodu üzerinden yapılarak bakiyeden düşülür.',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#131C31] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-1.5"
              >
                <div className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
                  {item.step}
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Official Codes Lookup Table */}
          <div className="bg-white dark:bg-[#131C31] rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCodeSection('occupations')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    codeSection === 'occupations'
                      ? 'bg-[#1A363E] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  ОКПДТР 2025 Görev Kodları ({references.occupations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCodeSection('countries')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    codeSection === 'countries'
                      ? 'bg-[#1A363E] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  ОКСМ Ülke Kodları ({references.countries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCodeSection('projects')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    codeSection === 'projects'
                      ? 'bg-[#1A363E] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  MOB MAP Şantiye ↔ Bölge Eşleşmeleri ({references.projectMappings.length})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  placeholder="Kod veya Türkçe / Rusça görev & ülke ara..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs w-64 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {codeSection === 'occupations' && (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#1A363E] text-white">
                    <tr>
                      <th className="py-2 px-3 font-semibold">ОКПДТР 2025 Kodu</th>
                      <th className="py-2 px-3 font-semibold">Türkçe Görev Adı</th>
                      <th className="py-2 px-3 font-semibold">Rusça Resmi Adı (Профессия / Должность)</th>
                      <th className="py-2 px-3 font-semibold">ОКЗ Kodu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {references.occupations
                      .filter((o) => {
                        const q = codeSearch.trim().toLocaleLowerCase('tr-TR');
                        if (!q) return true;
                        return (
                          o.code.includes(q) ||
                          o.nameTr.toLocaleLowerCase('tr-TR').includes(q) ||
                          o.nameRu.toLowerCase().includes(q)
                        );
                      })
                      .map((o) => (
                        <tr key={o.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-bold text-teal-700 dark:text-teal-300">
                            {o.code}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                            {o.nameTr}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                            {o.nameRu}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-500">{o.okz}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {codeSection === 'countries' && (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#1A363E] text-white">
                    <tr>
                      <th className="py-2 px-3 font-semibold">ОКСМ 3 Haneli Kod</th>
                      <th className="py-2 px-3 font-semibold">Ülke Adı (TR)</th>
                      <th className="py-2 px-3 font-semibold">Ülke Adı (RU)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {references.countries
                      .filter((c) => {
                        const q = codeSearch.trim().toLocaleLowerCase('tr-TR');
                        if (!q) return true;
                        return (
                          c.code.includes(q) ||
                          c.nameTr.toLocaleLowerCase('tr-TR').includes(q) ||
                          c.nameRu.toLowerCase().includes(q)
                        );
                      })
                      .map((c) => (
                        <tr key={c.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-bold text-teal-700 dark:text-teal-300">
                            {c.code}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                            {c.nameTr}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                            {c.nameRu}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {codeSection === 'projects' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#1A363E] text-white">
                    <tr>
                      <th className="py-2 px-3 font-semibold">MOB Saha / Proje Kodu</th>
                      <th className="py-2 px-3 font-semibold">Kota Tablosu Proje Adı</th>
                      <th className="py-2 px-3 font-semibold">Rusya Federasyonu Bölgesi (Субъект РФ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {references.projectMappings.map((pm, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                          {pm.mobProject}
                        </td>
                        <td className="py-2 px-3 text-teal-700 dark:text-teal-300 font-medium">
                          {pm.quotaProject}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold">{pm.regionCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODALS */}
      <QuotaIrsCertificateModal
        open={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        initialCert={editingCert}
        defaultYear={selectedYear === 'all' ? 2026 : Number(selectedYear)}
        references={references}
        onSaved={(msg) => {
          showNotice(msg);
          fetchOverview();
        }}
      />

      <QuotaWorkerIrsModal
        open={workerModalOpen}
        onClose={() => setWorkerModalOpen(false)}
        certificates={data?.certificates || []}
        preselectedCertNo={workerModalCertNo}
        references={references}
        onSaved={(msg) => {
          showNotice(msg);
          fetchOverview();
        }}
      />

      <QuotaAllocationModal
        open={allocModalOpen}
        onClose={() => setAllocModalOpen(false)}
        initialRow={editingAlloc}
        defaultYear={selectedYear === 'all' ? 2027 : Number(selectedYear)}
        references={references}
        onSaved={(msg) => {
          showNotice(msg);
          fetchOverview();
        }}
      />

      {data && (
        <QuotaAlertSettingsModal
          open={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
          settings={data.alertSettings}
          criticalCount={data.criticalAlerts.length}
          onSaved={(msg) => {
            showNotice(msg);
            fetchOverview();
          }}
        />
      )}
    </div>
  );
}

export default QuotaTrackingView;

