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
  Clock,
  ArrowRight,
  Globe2,
  X,
  Save,
  Filter,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/context/AuthContext';
import type {
  CriticalQuotaAlertItem,
  QuotaAlertSettings,
  QuotaAllocationRow,
  QuotaCountryRef,
  QuotaIrsCertificateComputed,
  QuotaOccupationRef,
  QuotaProjectMappingRef,
  QuotaRegionRef,
  QuotaSourceFileRow,
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
  esasQty: number;
  artirmaQty: number;
  azaltmaQty: number;
  requestedQty: number;
  submittedQty: number;
  plannedQty: number;
  approvedQty: number;
  inReviewQty: number;
  legacyIrsQty: number;
  certIrsQty: number;
  irs1Qty: number;
  irs2Qty: number;
  irs3Qty: number;
  irsOtherQty: number;
  totalIrsReceived: number;
  carryoverIrsQty: number;
  regionNote: string;
  irsTranches: Array<{
    index: number;
    certificateNo: string;
    trancheCode: string;
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
    esasTotal: number;
    artirmaTotal: number;
    azaltmaTotal: number;
    requestedTotal: number;
    submittedTotal: number;
    plannedTotal: number;
    approvedTotal: number;
    inReviewTotal: number;
    irs1Total: number;
    irs2Total: number;
    irs3Total: number;
    irsOtherTotal: number;
    irsReceivedTotal: number;
    unallocatedReserveTotal: number;
    carryoverIrsTotal: number;
    usedTotal: number;
    newUseTotal: number;
    extensionsTotal: number;
    irsRemainingTotal: number;
    availableTotal: number;
    certificatesCount: number;
    workerApplicationsCount: number;
    sourceFilesCount: number;
  };
  regionMatrix: RegionMatrixRow[];
  sourceFiles: QuotaSourceFileRow[];
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

type SubTabId = 'region_irs' | 'ozet_pivot' | 'certificates' | 'workers' | 'files_veri' | 'codes_guide';

function fmtSigned(n: number): string {
  if (n > 0) return `+${n.toLocaleString('tr-TR')}`;
  return n.toLocaleString('tr-TR');
}

function fmtNum(n: number): string {
  return (Number(n) || 0).toLocaleString('tr-TR');
}

export function QuotaTrackingView() {
  const { user, showPermissionDenied } = useAuth();
  const isViewer = user?.role === 'viewer';

  const [data, setData] = useState<QuotaOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [activeTab, setActiveTab] = useState<SubTabId>('region_irs');

  // Global Filters
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [fileCodeFilter, setFileCodeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pivotMode, setPivotMode] = useState<'country' | 'region'>('country');

  // Code reference search
  const [codeSearch, setCodeSearch] = useState<string>('');
  const [codeSection, setCodeSection] = useState<'occupations' | 'countries' | 'projects'>(
    'occupations'
  );

  // Modals state
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [certDefaultRegion, setCertDefaultRegion] = useState<string | undefined>(undefined);
  const [editingCert, setEditingCert] = useState<QuotaIrsCertificateComputed | null>(null);
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [workerModalCertNo, setWorkerModalCertNo] = useState<string | undefined>(undefined);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState<QuotaAllocationRow | null>(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);

  // Quick Region IRS & Note Editor Modal (for Ust-Luga / Regional IRS1..IRS3 updates)
  const [quickIrsTarget, setQuickIrsTarget] = useState<{
    regionCode: string;
    regionNameTr: string;
    approvedQty: number;
    irs1Qty: number;
    irs2Qty: number;
    irs3Qty: number;
    validUntil: string;
    noteText: string;
  } | null>(null);
  const [savingQuickIrs, setSavingQuickIrs] = useState(false);

  // Toast / banner feedback
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const guardWrite = useCallback(
    (labelTr: string, labelRu?: string): boolean => {
      if (isViewer) {
        showPermissionDenied({
          actionLabelTr: labelTr,
          actionLabelRu: labelRu || labelTr,
        });
        return false;
      }
      return true;
    },
    [isViewer, showPermissionDenied]
  );

  const showNotice = useCallback((text: string, type: 'ok' | 'err' = 'ok') => {
    setBannerMsg({ type, text });
    setTimeout(() => {
      setBannerMsg((prev) => (prev?.text === text ? null : prev));
    }, 6500);
  }, []);

  const fetchOverview = useCallback(
    async (yr = selectedYear) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/quotas?year=${encodeURIComponent(yr)}`);
        const json = await res.json();
        if (json?.success) {
          setData(json);
        }
      } catch {
        showNotice('Kota verileri yüklenirken bağlantı hatası oluştu.', 'err');
      } finally {
        setLoading(false);
      }
    },
    [selectedYear, showNotice]
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

  const filteredRegionMatrix = useMemo(() => {
    if (!data) return [];
    return data.regionMatrix.filter((r) => {
      if (regionFilter !== 'ALL' && r.regionCode !== regionFilter) return false;
      return true;
    });
  }, [data, regionFilter]);

  const filteredAllocations = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return data.allocations.filter((a) => {
      if (regionFilter !== 'ALL' && a.region_code !== regionFilter) return false;
      if (countryFilter !== 'ALL' && a.country_code !== countryFilter) return false;
      if (fileCodeFilter !== 'ALL' && (a.file_code || '') !== fileCodeFilter) return false;
      if (statusFilter === 'APPROVED' && !a.migrakvota_status.toLocaleLowerCase('tr-TR').includes('onay')) {
        return false;
      }
      if (statusFilter === 'IN_REVIEW' && !a.migrakvota_status.toLocaleLowerCase('tr-TR').includes('inceleme')) {
        return false;
      }
      if (!q) return true;
      return (
        a.record_code.toLowerCase().includes(q) ||
        (a.file_code || '').toLowerCase().includes(q) ||
        (a.source_filename || '').toLowerCase().includes(q) ||
        a.region_code.toLowerCase().includes(q) ||
        a.project_name.toLocaleLowerCase('tr-TR').includes(q) ||
        a.occupation_code.includes(q) ||
        a.occupation_tr.toLocaleLowerCase('tr-TR').includes(q) ||
        a.occupation_ru.toLowerCase().includes(q) ||
        a.country_tr.toLocaleLowerCase('tr-TR').includes(q) ||
        a.country_code.includes(q)
      );
    });
  }, [data, regionFilter, countryFilter, fileCodeFilter, statusFilter, searchQuery]);

  const filteredCertificates = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return data.certificates.filter((c) => {
      if (regionFilter !== 'ALL' && c.region_code !== regionFilter) return false;
      if (!q) return true;
      return (
        c.certificate_no.toLowerCase().includes(q) ||
        c.tranche_code.toLowerCase().includes(q) ||
        c.tranche_label.toLocaleLowerCase('tr-TR').includes(q) ||
        c.region_code.toLowerCase().includes(q) ||
        c.project_name.toLocaleLowerCase('tr-TR').includes(q) ||
        c.notes.toLocaleLowerCase('tr-TR').includes(q) ||
        c.lines.some(
          (l) =>
            l.occupation_code.includes(q) ||
            l.occupation_tr.toLocaleLowerCase('tr-TR').includes(q)
        )
      );
    });
  }, [data, regionFilter, searchQuery]);

  const filteredWorkers = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return data.workerApplications.filter((w) => {
      if (regionFilter !== 'ALL' && w.region_code && w.region_code !== regionFilter) return false;
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
  }, [data, regionFilter, countryFilter, searchQuery]);

  const filteredSourceFiles = useMemo(() => {
    if (!data) return [];
    return (data.sourceFiles || []).filter((sf) => {
      if (regionFilter !== 'ALL' && sf.region_code !== regionFilter) return false;
      if (statusFilter === 'APPROVED' && !sf.status_text.toLocaleLowerCase('tr-TR').includes('onay')) {
        return false;
      }
      if (statusFilter === 'IN_REVIEW' && !sf.status_text.toLocaleLowerCase('tr-TR').includes('inceleme')) {
        return false;
      }
      return true;
    });
  }, [data, regionFilter, statusFilter]);

  // Dynamic KPI computation respecting region/country/status filters
  const activeKpis = useMemo(() => {
    if (!data) {
      return {
        esasTotal: 0,
        artirmaTotal: 0,
        azaltmaTotal: 0,
        requestedTotal: 0,
        approvedTotal: 0,
        inReviewTotal: 0,
        irs1Total: 0,
        irs2Total: 0,
        irs3Total: 0,
        irsReceivedTotal: 0,
        unallocatedReserveTotal: 0,
        carryoverIrsTotal: 0,
        usedTotal: 0,
        newUseTotal: 0,
        extensionsTotal: 0,
        irsRemainingTotal: 0,
      };
    }
    if (
      regionFilter === 'ALL' &&
      countryFilter === 'ALL' &&
      statusFilter === 'ALL' &&
      fileCodeFilter === 'ALL' &&
      !searchQuery.trim()
    ) {
      return data.kpis;
    }

    let esasTotal = 0;
    let artirmaTotal = 0;
    let azaltmaTotal = 0;
    let requestedTotal = 0;
    let approvedTotal = 0;

    for (const a of filteredAllocations) {
      const req = Number(a.requested_qty || 0);
      const app = Number(a.approved_qty || 0);
      const t = a.application_type.toLocaleLowerCase('tr-TR');
      if (t.includes('azalt') || req < 0) azaltmaTotal += req;
      else if (t.includes('artır') || t.includes('artir') || t.includes('корр')) artirmaTotal += req;
      else esasTotal += req;
      requestedTotal += req;
      approvedTotal += app;
    }

    const inReviewTotal = requestedTotal - approvedTotal;
    const irs1Total = filteredCertificates
      .filter((c) => c.tranche_code === 'IRS1')
      .reduce((s, c) => s + c.total_allocated_qty, 0);
    const irs2Total = filteredCertificates
      .filter((c) => c.tranche_code === 'IRS2')
      .reduce((s, c) => s + c.total_allocated_qty, 0);
    const irs3Total = filteredCertificates
      .filter((c) => c.tranche_code === 'IRS3')
      .reduce((s, c) => s + c.total_allocated_qty, 0);
    const irsReceivedTotal = filteredCertificates.reduce((s, c) => s + c.total_allocated_qty, 0);
    const carryoverIrsTotal = filteredCertificates
      .filter((c) => c.is_cross_year_carryover && c.status !== 'expired')
      .reduce((s, c) => s + Math.max(0, c.total_remaining_qty), 0);

    const activeWrk = filteredWorkers.filter((w) => w.application_status !== 'cancelled');
    const newUseTotal = activeWrk.filter((w) => w.usage_type !== 'visa_extension').length;
    const extensionsTotal = activeWrk.filter((w) => w.usage_type === 'visa_extension').length;
    const usedTotal = newUseTotal + extensionsTotal;
    const irsRemainingTotal = Math.max(0, irsReceivedTotal - usedTotal);
    const unallocatedReserveTotal = approvedTotal - irsReceivedTotal;

    return {
      esasTotal,
      artirmaTotal,
      azaltmaTotal,
      requestedTotal,
      approvedTotal,
      inReviewTotal,
      irs1Total,
      irs2Total,
      irs3Total,
      irsReceivedTotal,
      unallocatedReserveTotal,
      carryoverIrsTotal,
      usedTotal,
      newUseTotal,
      extensionsTotal,
      irsRemainingTotal,
    };
  }, [
    data,
    regionFilter,
    countryFilter,
    statusFilter,
    fileCodeFilter,
    searchQuery,
    filteredAllocations,
    filteredCertificates,
    filteredWorkers,
  ]);

  // Pivot Matrix computation matching Zahid Bey's Özet sheet (Ülke × Görev and Bölge × Görev)
  const pivotTable = useMemo(() => {
    const occMap = new Map<string, { code: string; tr: string; ru: string; total: number }>();
    const rowMap = new Map<
      string,
      { key: string; labelTr: string; labelRu: string; cells: Record<string, number>; total: number }
    >();

    for (const a of filteredAllocations) {
      const occCode = a.occupation_code || 'DIGER';
      if (!occMap.has(occCode)) {
        occMap.set(occCode, {
          code: occCode,
          tr: a.occupation_tr || occCode,
          ru: a.occupation_ru || '',
          total: 0,
        });
      }
      const qty = Number(a.requested_qty || 0);
      occMap.get(occCode)!.total += qty;

      const rKey =
        pivotMode === 'country'
          ? a.country_code || a.country_tr || 'DIGER'
          : a.region_code || 'DIGER';
      const rTr =
        pivotMode === 'country'
          ? a.country_tr || rKey
          : data?.regionMatrix.find((rm) => rm.regionCode === rKey)?.regionNameTr || rKey;
      const rRu =
        pivotMode === 'country'
          ? a.country_ru || ''
          : data?.regionMatrix.find((rm) => rm.regionCode === rKey)?.regionNameRu || '';

      if (!rowMap.has(rKey)) {
        rowMap.set(rKey, { key: rKey, labelTr: rTr, labelRu: rRu, cells: {}, total: 0 });
      }
      const row = rowMap.get(rKey)!;
      row.cells[occCode] = (row.cells[occCode] || 0) + qty;
      row.total += qty;
    }

    const columns = Array.from(occMap.values()).sort((a, b) => b.total - a.total);
    const rows = Array.from(rowMap.values()).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    return { columns, rows, grandTotal };
  }, [filteredAllocations, pivotMode, data?.regionMatrix]);

  // Multi-sheet Kota_2026-2027.xlsx uploader & parser
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!guardWrite('Kota Excel Dosyası Yükleme', 'Загрузка Excel квот')) return;

    setUploadingExcel(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });

      const findSheet = (candidates: string[]) =>
        wb.SheetNames.find((sn) =>
          candidates.some((c) => sn.toLocaleLowerCase('tr-TR') === c.toLocaleLowerCase('tr-TR'))
        );

      const veriSheetName = findSheet(['Veri']);
      const dosyalarSheetName = findSheet(['Dosyalar']);
      const irsSheetName = findSheet(['IRS', 'İRS']);

      if (veriSheetName || irsSheetName) {
        const sourceFiles: Array<Record<string, any>> = [];
        if (dosyalarSheetName) {
          const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[dosyalarSheetName], {
            header: 1,
            defval: '',
          });
          for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0] || !/^\d{2}-D\d+/i.test(String(r[0]).trim())) continue;
            const dtVal = r[6];
            const fillDate =
              dtVal instanceof Date
                ? `${String(dtVal.getDate()).padStart(2, '0')}.${String(dtVal.getMonth() + 1).padStart(2, '0')}.${dtVal.getFullYear()}`
                : String(dtVal || '').trim();
            sourceFiles.push({
              fileCode: String(r[0]).trim(),
              year: Number(r[1] || 2026),
              sourceFilename: String(r[2] || '').trim(),
              regionLabel: String(r[3] || '').trim(),
              applicationType: String(r[4] || '').trim(),
              status: String(r[5] || '').trim(),
              fillDate,
              countriesSummary: String(r[7] || '').trim(),
              rowCount: Number(r[8] || 0),
              netEffect: Number(r[9] || 0),
              rawTotal: Number(r[10] || 0),
            });
          }
        }

        const veriRows: Array<Record<string, any>> = [];
        if (veriSheetName) {
          const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[veriSheetName], {
            header: 1,
            defval: '',
          });
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0] || !r[1] || Number.isNaN(Number(r[1]))) continue;
            veriRows.push({
              fileCode: String(r[0]).trim(),
              year: Number(r[1]),
              countryTr: String(r[2] || '').trim(),
              occupationTr: String(r[3] || '').trim(),
              region: String(r[4] || '').trim(),
              status: String(r[5] || '').trim(),
              applicationType: String(r[6] || '').trim(),
              netQty: Number(r[7] || 0),
              countryRu: String(r[8] || '').trim(),
              occupationRu: String(r[9] || '').trim(),
              occupationCode: String(r[10] || '').trim(),
              sourceRow: Number(r[11] || 0),
              rawQty: Number(r[12] || 0),
            });
          }
        }

        const irsRows: Array<Record<string, any>> = [];
        if (irsSheetName) {
          const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[irsSheetName], {
            header: 1,
            defval: '',
          });
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r) continue;
            // Support column offset (either col A or col B has Bolge)
            const hasLeadingBlank = !r[0] && r[1];
            const base = hasLeadingBlank ? 1 : 0;
            const reg = String(r[base] || '').trim();
            if (!reg || reg.toLocaleLowerCase('tr-TR') === 'bolge' || reg.toLocaleLowerCase('tr-TR') === 'toplam') {
              continue;
            }
            irsRows.push({
              quotaYear: 2026,
              region: reg,
              approvedQuota: Number(r[base + 1] || 0),
              irs1: Number(r[base + 2] || 0),
              irs2: Number(r[base + 3] || 0),
              irs3: Number(r[base + 4] || 0),
              noteText: String(r[base + 6] || '').trim(),
            });
          }
        }

        const res = await fetch('/api/quotas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_kota_workbook',
            sourceFiles,
            veriRows,
            irsRows,
            replaceExisting: veriRows.length > 0,
          }),
        });
        const json = await res.json();
        if (json?.success) {
          showNotice(json.message, 'ok');
          fetchOverview(selectedYear);
        } else {
          showNotice(json?.message || 'Kota Excel yüklenemedi.', 'err');
        }
        return;
      }

      // Fallback: flat sheet import
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const flat = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });
      const mapped = flat
        .map((r) => ({
          year: Number(r['Yıl'] || r['YIL'] || r['year'] || 2026),
          region_code: String(r['Bölge'] || r['BOLGE'] || r['region_code'] || ''),
          country_tr: String(r['Ülke'] || r['ULKE'] || r['country_tr'] || ''),
          occupation_code: String(r['ОКПДТР kodu'] || r['GOREV_KODU'] || r['occupation_code'] || ''),
          occupation_tr: String(r['Görev'] || r['GOREV'] || r['occupation_tr'] || ''),
          application_type: String(r['Başvuru tipi'] || r['application_type'] || 'Esas başvuru'),
          migrakvota_status: String(r['Statü'] || r['migrakvota_status'] || 'Onaylı (emir taslağında)'),
          requested_qty: Number(r['Net etki (+/−)'] ?? r['requested_qty'] ?? 0),
        }))
        .filter((r) => r.region_code && r.requested_qty !== 0);

      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_excel_rows', rows: mapped }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice(json.message, 'ok');
        fetchOverview(selectedYear);
      } else {
        showNotice(json?.message || 'Excel satırları aktarılamadı.', 'err');
      }
    } catch {
      showNotice('Excel dosyası okunurken hata oluştu.', 'err');
    } finally {
      setUploadingExcel(false);
    }
  };

  // Multi-sheet Excel Export matching Zahid Bey's Kota_2026-2027.xlsx structure
  const handleExportWorkbook = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const regRows = filteredRegionMatrix.map((r) => ({
      Bölge: r.regionNameTr,
      'Bölge (Rusça)': r.regionNameRu,
      'Esas Başvuru': r.esasQty,
      'Artırma Düzeltmesi (+)': r.artirmaQty,
      'Azaltma Düzeltmesi (−)': r.azaltmaQty,
      'Net Toplam': r.requestedQty,
      'Onaylı Kota': r.approvedQty,
      İncelemede: r.inReviewQty,
      IRS1: r.irs1Qty || '',
      IRS2: r.irs2Qty || '',
      IRS3: r.irs3Qty || '',
      'Toplam Alınan İRS': r.totalIrsReceived,
      'Kalan Kota (Onaylı - İRS)': r.unallocatedQuotaReserve,
      'İRS İçi İşçi Alımı (РНР)': r.usedQty,
      'Kalan İRS Kontenjanı': r.irsRemainingQty,
      'Sonraki Yıla Devreden İRS': r.carryoverIrsQty,
      Açıklama: r.regionNote,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regRows), 'Bolge_ve_IRS_Ozeti');

    const veriExport = filteredAllocations.map((a) => ({
      'Dosya No': a.file_code || a.record_code,
      Yıl: a.year,
      Ülke: a.country_tr,
      Görev: a.occupation_tr,
      Bölge: a.region_code,
      Statü: a.migrakvota_status,
      'Başvuru tipi': a.application_type,
      'Net etki (+/−)': a.requested_qty,
      'Onaylı Kota': a.approved_qty,
      'Ülke (Rusça)': a.country_ru,
      'Görev (Rusça)': a.occupation_ru,
      'ОКПДТР kodu': a.occupation_code,
      'Kaynak Dosya': a.source_filename || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veriExport), 'Veri');

    if (filteredSourceFiles.length > 0) {
      const dosExport = filteredSourceFiles.map((sf) => ({
        'Dosya No': sf.file_code,
        Yıl: sf.year,
        'Orijinal dosya adı': sf.source_filename,
        Bölge: sf.region_label,
        'Başvuru tipi': sf.application_type,
        Statü: sf.status_text,
        'Doldurma tarihi': sf.fill_date,
        Ülkeler: sf.countries_summary,
        'Satır sayısı': sf.row_count,
        'Net etki (+/−)': sf.net_effect,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dosExport), 'Dosyalar');
    }

    if (filteredWorkers.length > 0) {
      const wrkExport = filteredWorkers.map((w) => ({
        'İRS Sertifika No': w.certificate_no,
        'Sicil No': w.sicil_no,
        'Ad Soyad': w.full_name,
        Pasaport: w.passport_no,
        Ülke: w.country_tr,
        'ОКПДТР Kodu': w.occupation_code,
        Görev: w.occupation_tr,
        Bölge: w.region_code,
        'Kullanım Türü': w.usage_type === 'visa_extension' ? 'Vize Uzatma' : 'Yeni РНР İşçi Alımı',
        Durum: w.application_status,
        'Başvuru Tarihi': w.application_date,
        'РНР No': w.rnr_number,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wrkExport), 'Isci_Alimi_RNR');
    }

    XLSX.writeFile(wb, `Pondera_Kota_ve_IRS_${selectedYear === 'all' ? '2026_2027' : selectedYear}.xlsx`);
  };

  const handleSaveQuickRegionIrs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIrsTarget) return;
    setSavingQuickIrs(true);
    try {
      const yr = selectedYear === 'all' ? 2026 : Number(selectedYear) || 2026;
      const res = await fetch('/api/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'quick_save_region_irs',
          quotaYear: yr,
          regionCode: quickIrsTarget.regionCode,
          irs1Qty: quickIrsTarget.irs1Qty,
          irs2Qty: quickIrsTarget.irs2Qty,
          irs3Qty: quickIrsTarget.irs3Qty,
          validUntil: quickIrsTarget.validUntil,
          noteText: quickIrsTarget.noteText,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        showNotice(json.message, 'ok');
        setQuickIrsTarget(null);
        fetchOverview(selectedYear);
      } else {
        showNotice(json?.message || 'İRS dilimleri kaydedilemedi.', 'err');
      }
    } catch {
      showNotice('Sunucu bağlantı hatası.', 'err');
    } finally {
      setSavingQuickIrs(false);
    }
  };

  const handleDeleteCertificate = async (certNo: string) => {
    if (!guardWrite('İRS Sertifikası Silme', 'Удаление сертификата ИРС')) return;
    if (!window.confirm(`ИРС № ${certNo} sertifikasını silmek istediğinize emin misiniz?`)) return;
    const res = await fetch('/api/quotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_irs_certificate', certificateNo: certNo }),
    });
    const json = await res.json();
    if (json?.success) {
      showNotice(json.message, 'ok');
      fetchOverview(selectedYear);
    }
  };

  const handleUpdateWorkerStatus = async (id: number, applicationStatus: string) => {
    if (!guardWrite('İşçi РНР Durumu Güncelleme', 'Обновление статуса РНР')) return;
    const res = await fetch('/api/quotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_worker_application', id, applicationStatus }),
    });
    const json = await res.json();
    if (json?.success) {
      fetchOverview(selectedYear);
    }
  };

  const handleDeleteWorker = async (id: number) => {
    if (!guardWrite('İşçi РНР Kaydı Silme', 'Удаление записи РНР')) return;
    if (!window.confirm('Bu çalışan kota başvurusunu silip İRS kontenjanını iade etmek istiyor musunuz?')) {
      return;
    }
    const res = await fetch('/api/quotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_worker_application', id }),
    });
    const json = await res.json();
    if (json?.success) {
      showNotice(json.message, 'ok');
      fetchOverview(selectedYear);
    }
  };

  const handleDeleteAllocation = async (recCode: string) => {
    if (!guardWrite('Kota Başvuru Satırı Silme', 'Удаление строки квоты')) return;
    if (!window.confirm(`${recCode} kota satırını silmek istediğinize emin misiniz?`)) return;
    const res = await fetch('/api/quotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_allocation', recordCode: recCode }),
    });
    const json = await res.json();
    if (json?.success) {
      showNotice(json.message, 'ok');
      fetchOverview(selectedYear);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5">
      {/* Hidden Excel File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm"
        onChange={handleExcelUpload}
        className="hidden"
      />

      {/* TOP HEADER & YEAR SWITCHER + ACTION BUTTONS */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Yabancı Çalışan Kota & Parçalı İRS (РНП) Takip Merkezi
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  Kota_2026-2027 • Canlı
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                1) Yıllık Kota Başvurusu & Düzeltmeler (+/−) <ArrowRight className="inline w-3 h-3 mx-0.5" /> 2) Bakanlık Onayı <ArrowRight className="inline w-3 h-3 mx-0.5" /> 3) Onaylı Kotadan Parçalı İRS (IRS1, IRS2, IRS3) Çekimi <ArrowRight className="inline w-3 h-3 mx-0.5" /> 4) İşçi Alımı (РНР) & Sonraki Yıla Devir
              </p>
            </div>
          </div>

          {/* Year Selector + Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Year Pills */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
              {[
                { id: '2026', label: '2026 Kotaları' },
                { id: '2027', label: '2027 Kotaları' },
                { id: 'all', label: '2026 + 2027 (Tümü)' },
              ].map((yOpt) => (
                <button
                  key={yOpt.id}
                  type="button"
                  onClick={() => {
                    setSelectedYear(yOpt.id);
                    setFileCodeFilter('ALL');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedYear === yOpt.id
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {yOpt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={uploadingExcel}
              onClick={() => {
                if (!guardWrite('Kota_2026-2027 Excel Yükleme', 'Загрузка Excel квот')) return;
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-300 dark:border-indigo-500/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 text-xs font-semibold cursor-pointer transition-all"
            >
              {uploadingExcel ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-700 dark:text-indigo-300" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
              )}
              <span>Kota Excel Yükle (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleExportWorkbook}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 text-xs font-semibold cursor-pointer transition-all"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
              <span>Rapor İndir (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!guardWrite('Yeni Parçalı İRS (РНП) Ekleme', 'Добавление сертификата ИРС')) return;
                setEditingCert(null);
                setCertDefaultRegion(regionFilter !== 'ALL' ? regionFilter : 'LENINGRADSKAYA');
                setCertModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Parçalı İRS Ekle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!guardWrite('İRS Üzerinden İşçi Alımı (РНР) Kaydı', 'Привязка работника к ИРС')) return;
                setWorkerModalCertNo(filteredCertificates[0]?.certificate_no);
                setWorkerModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-cyan-300 dark:border-cyan-500/40 bg-cyan-100/85 hover:bg-cyan-200/80 dark:bg-cyan-500/20 dark:hover:bg-cyan-500/30 text-cyan-950 dark:text-cyan-100 text-xs font-semibold cursor-pointer transition-all"
            >
              <UserPlus className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-300" />
              <span>+ İşçi Alımı (РНР)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!guardWrite('Bakanlık Kota Başvurusu Ekleme', 'Добавление заявки на квоту')) return;
                setEditingAlloc(null);
                setAllocModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>+ Kota Satırı</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!guardWrite('Kritik Kota Alarm Ayarları', 'Настройки оповещений квот')) return;
                setAlertModalOpen(true);
              }}
              className="p-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
              title="Kritik Kota & İRS Alarm Ayarları"
            >
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Banner Notice */}
        {bannerMsg && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between border ${
              bannerMsg.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            <span>{bannerMsg.text}</span>
            <button
              type="button"
              onClick={() => setBannerMsg(null)}
              className="p-1 hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 6 LIFECYCLE KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Card 1: Net Kota Başvurusu */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              1. NET KOTA BAŞVURUSU
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {fmtNum(activeKpis.requestedTotal)}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-slate-600 dark:text-slate-400">
              <span>Esas: {fmtNum(activeKpis.esasTotal)}</span>
              <span>•</span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {fmtSigned(activeKpis.artirmaTotal)}
              </span>
              {activeKpis.azaltmaTotal !== 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 dark:text-rose-400">
                    {fmtSigned(activeKpis.azaltmaTotal)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Card 2: Onaylanan Kota vs İncelemede */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              2. ONAYLI KOTA (EMİRDE)
            </div>
            <div className="text-xl font-bold text-emerald-900 dark:text-emerald-200 mt-1">
              {fmtNum(activeKpis.approvedTotal)}
            </div>
            <div className="mt-1.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-300">
              ⏳ İncelemede: {fmtSigned(activeKpis.inReviewTotal)} kişi
            </div>
          </div>

          {/* Card 3: Parçalı Alınan İRS */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800/60">
            <div className="text-[11px] font-semibold text-teal-800 dark:text-teal-300">
              3. ALINAN PARÇALI İRS
            </div>
            <div className="text-xl font-bold text-teal-900 dark:text-teal-200 mt-1">
              {fmtNum(activeKpis.irsReceivedTotal)}
            </div>
            <div className="mt-1.5 text-[10px] text-teal-700 dark:text-teal-300/90">
              IRS1: {fmtNum(activeKpis.irs1Total)} • IRS2: {fmtNum(activeKpis.irs2Total)} • IRS3:{' '}
              {fmtNum(activeKpis.irs3Total)}
            </div>
          </div>

          {/* Card 4: Kalan Onaylı Kota (Onaylı - İRS) */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60">
            <div className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">
              4. KALAN ONAYLI KOTA
            </div>
            <div className="text-xl font-bold text-indigo-900 dark:text-indigo-200 mt-1">
              {fmtNum(activeKpis.unallocatedReserveTotal)}
            </div>
            <div className="mt-1.5 text-[10px] text-indigo-700 dark:text-indigo-300/90">
              Onaylı ({fmtNum(activeKpis.approvedTotal)}) − İRS ({fmtNum(activeKpis.irsReceivedTotal)})
            </div>
          </div>

          {/* Card 5: İRS İçi İşçi Alımı (РНР) */}
          <div className="p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200/80 dark:border-cyan-800/60">
            <div className="text-[11px] font-semibold text-cyan-800 dark:text-cyan-300">
              5. İRS İŞÇİ ALIMI (РНР)
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold text-cyan-900 dark:text-cyan-200">
                {fmtNum(activeKpis.usedTotal)}
              </span>
              <span className="text-[11px] text-cyan-700 dark:text-cyan-400">
                / Boş İRS: {fmtNum(activeKpis.irsRemainingTotal)}
              </span>
            </div>
            <div className="mt-1.5 text-[10px] text-cyan-700 dark:text-cyan-300/90">
              Yeni РНР: {fmtNum(activeKpis.newUseTotal)} • Uzatma: {fmtNum(activeKpis.extensionsTotal)}
            </div>
          </div>

          {/* Card 6: Sonraki Yıla Devreden İRS */}
          <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              6. SONRAKİ YILA DEVİR İRS
            </div>
            <div className="text-xl font-bold text-amber-900 dark:text-amber-200 mt-1">
              {fmtNum(activeKpis.carryoverIrsTotal)}
            </div>
            <div className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-300/90">
              Yıl sonu yanmadan devreden İRS bakiyesi
            </div>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtreler:</span>
          </div>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Tüm Bölgeler (Субъекты РФ)</option>
            {(data?.regionMatrix || []).map((rm) => (
              <option key={rm.regionCode} value={rm.regionCode}>
                {rm.regionNameTr} ({fmtNum(rm.requestedQty)})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Tüm Statüler (Onaylı + İncelemede)</option>
            <option value="APPROVED">Sadece Onaylı (Emir Taslağında)</option>
            <option value="IN_REVIEW">Sadece İncelemede (На рассмотрении)</option>
          </select>

          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="ALL">Tüm Ülkeler (ОКСМ)</option>
            {references.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameTr} ({c.code})
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Bölge, görev, ОКПДТР kodu, dosya no (26-D1), İRS veya çalışan ara..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {(regionFilter !== 'ALL' ||
            statusFilter !== 'ALL' ||
            countryFilter !== 'ALL' ||
            fileCodeFilter !== 'ALL' ||
            searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setRegionFilter('ALL');
                setStatusFilter('ALL');
                setCountryFilter('ALL');
                setFileCodeFilter('ALL');
                setSearchQuery('');
              }}
              className="px-2.5 py-1.5 rounded-xl text-xs bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer"
            >
              Filtreyi Temizle
            </button>
          )}
        </div>
      </div>

      {/* SUB-TABS NAVIGATION */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-[#111827] p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
        {[
          {
            id: 'region_irs' as SubTabId,
            label: '1. Bölge, Statü & Parçalı İRS Özeti',
            badge: `${filteredRegionMatrix.length} Bölge`,
            icon: Building2,
          },
          {
            id: 'ozet_pivot' as SubTabId,
            label: '2. Özet Matris (Ülke & Bölge × Görev)',
            badge: fmtNum(pivotTable.grandTotal),
            icon: Globe2,
          },
          {
            id: 'certificates' as SubTabId,
            label: '3. İRS Sertifikaları & Yıl Devri',
            badge: `${filteredCertificates.length} Dilim`,
            icon: ShieldCheck,
          },
          {
            id: 'workers' as SubTabId,
            label: '4. İRS İşçi Alımı (РНР)',
            badge: `${filteredWorkers.length} Kişi`,
            icon: UserPlus,
          },
          {
            id: 'files_veri' as SubTabId,
            label: '5. Kaynak Dosyalar (26-D / 27-D) & Veri',
            badge: `${filteredAllocations.length} Satır`,
            icon: Layers,
          },
          {
            id: 'codes_guide' as SubTabId,
            label: '6. ОКПДТР / ОКСМ Rehberi',
            badge: 'Sözlük',
            icon: BookOpen,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* LOADING STATE */}
      {loading ? (
        <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-xs text-slate-500">
          Kota ve parçalı İRS verileri yükleniyor...
        </div>
      ) : (
        <>
          {/* ========================================================================
              TAB 1: BÖLGE, STATÜ & PARÇALI İRS ÖZETİ (Bölge-Statü + IRS Sheet)
              ======================================================================== */}
          {activeTab === 'region_irs' && (
            <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Bölge Bazlı Kota Onay Durumu & Parçalı İRS (IRS1 / IRS2 / IRS3) Dağılımı
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Onaylanan kota tavanından yıl içinde parçalı alınan İRS dilimleri, kalan onaylı kota ve bölge açıklamaları (Örn: Ust-Luga İRS girişi için satırdaki Düzenle butonuna tıklayın).
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-3">Bölge / Şantiye</th>
                      <th className="py-3 px-2.5 text-right">Esas</th>
                      <th className="py-3 px-2.5 text-right">Artırma (+)</th>
                      <th className="py-3 px-2.5 text-right">Azaltma (−)</th>
                      <th className="py-3 px-2.5 text-right">Net Toplam</th>
                      <th className="py-3 px-2.5 text-right bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                        Onaylı Kota
                      </th>
                      <th className="py-3 px-2.5 text-right text-amber-700 dark:text-amber-300">
                        İncelemede
                      </th>
                      <th className="py-3 px-2 text-right bg-teal-50/50 dark:bg-teal-950/20">IRS1</th>
                      <th className="py-3 px-2 text-right bg-teal-50/50 dark:bg-teal-950/20">IRS2</th>
                      <th className="py-3 px-2 text-right bg-teal-50/50 dark:bg-teal-950/20">IRS3</th>
                      <th className="py-3 px-2.5 text-right bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300">
                        Alınan İRS
                      </th>
                      <th className="py-3 px-2.5 text-right bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300">
                        Kalan Kota
                      </th>
                      <th className="py-3 px-2.5 text-right">İşçi Alımı (РНР)</th>
                      <th className="py-3 px-3">Açıklama / Durum Notu</th>
                      <th className="py-3 px-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRegionMatrix.map((r) => (
                      <tr
                        key={r.regionCode}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {r.regionNameTr}
                          </div>
                          <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                            {r.regionNameRu}
                          </div>
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                          {r.esasQty ? fmtNum(r.esasQty) : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">
                          {r.artirmaQty ? fmtSigned(r.artirmaQty) : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                          {r.azaltmaQty ? fmtSigned(r.azaltmaQty) : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {fmtNum(r.requestedQty)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono font-bold bg-emerald-50/40 dark:bg-emerald-950/15 text-emerald-800 dark:text-emerald-300">
                          {fmtNum(r.approvedQty)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono text-amber-700 dark:text-amber-300">
                          {r.inReviewQty !== 0 ? fmtSigned(r.inReviewQty) : '0'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono bg-teal-50/30 dark:bg-teal-950/10 text-teal-800 dark:text-teal-300">
                          {r.irs1Qty ? fmtNum(r.irs1Qty) : '—'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono bg-teal-50/30 dark:bg-teal-950/10 text-teal-800 dark:text-teal-300">
                          {r.irs2Qty ? fmtNum(r.irs2Qty) : '—'}
                        </td>
                        <td className="py-3 px-2 text-right font-mono bg-teal-50/30 dark:bg-teal-950/10 text-teal-800 dark:text-teal-300">
                          {r.irs3Qty ? fmtNum(r.irs3Qty) : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono font-bold bg-teal-50/50 dark:bg-teal-950/25 text-teal-900 dark:text-teal-200">
                          {r.totalIrsReceived ? fmtNum(r.totalIrsReceived) : '—'}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono font-bold bg-indigo-50/40 dark:bg-indigo-950/15 text-indigo-800 dark:text-indigo-300">
                          {fmtNum(r.unallocatedQuotaReserve)}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono">
                          {r.usedQty > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 font-semibold">
                              {fmtNum(r.usedQty)} / {fmtNum(r.totalIrsReceived)}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[260px]">
                          {r.regionNote ? (
                            <span className="inline-block px-2 py-1 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 text-[11px] text-amber-900 dark:text-amber-200">
                              {r.regionNote}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                !guardWrite(
                                  `${r.regionNameTr} Parçalı İRS ve Açıklama Düzenleme`,
                                  'Редактирование ИРС по региону'
                                )
                              ) {
                                return;
                              }
                              setQuickIrsTarget({
                                regionCode: r.regionCode,
                                regionNameTr: r.regionNameTr,
                                approvedQty: r.approvedQty,
                                irs1Qty: r.irs1Qty,
                                irs2Qty: r.irs2Qty,
                                irs3Qty: r.irs3Qty,
                                validUntil:
                                  r.irsTranches[0]?.validUntil ||
                                  `${(selectedYear === 'all' ? 2026 : Number(selectedYear)) + 1}-05-31`,
                                noteText: r.regionNote || '',
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 text-[11px] font-semibold cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>İRS / Not Düzenle</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-t-2 border-slate-300 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                      <td className="py-3 px-3">TOPLAM ({filteredRegionMatrix.length} Bölge)</td>
                      <td className="py-3 px-2.5 text-right font-mono">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.esasQty, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">
                        {fmtSigned(filteredRegionMatrix.reduce((s, r) => s + r.artirmaQty, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                        {fmtSigned(filteredRegionMatrix.reduce((s, r) => s + r.azaltmaQty, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.requestedQty, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-emerald-800 dark:text-emerald-300">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.approvedQty, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-amber-700 dark:text-amber-300">
                        {fmtSigned(filteredRegionMatrix.reduce((s, r) => s + r.inReviewQty, 0))}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-teal-800 dark:text-teal-300">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.irs1Qty, 0))}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-teal-800 dark:text-teal-300">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.irs2Qty, 0))}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-teal-800 dark:text-teal-300">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.irs3Qty, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-teal-900 dark:text-teal-200">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.totalIrsReceived, 0))}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-indigo-800 dark:text-indigo-300">
                        {fmtNum(
                          filteredRegionMatrix.reduce((s, r) => s + r.unallocatedQuotaReserve, 0)
                        )}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono">
                        {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.usedQty, 0))}
                      </td>
                      <td colSpan={2} className="py-3 px-3 text-right text-[11px] text-slate-500">
                        Sonraki Yıla Devreden İRS:{' '}
                        <strong className="text-amber-700 dark:text-amber-300">
                          {fmtNum(filteredRegionMatrix.reduce((s, r) => s + r.carryoverIrsQty, 0))}
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================
              TAB 2: ÖZET MATRİS (ÜLKE × GÖREV & BÖLGE × GÖREV — Özet Sheet)
              ======================================================================== */}
          {activeTab === 'ozet_pivot' && (
            <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Özet Çapraz Matris — {pivotMode === 'country' ? 'Ülke × Görev (Страна × Профессия)' : 'Bölge × Görev (Регион × Профессия)'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Seçili yıl, bölge ve statü filtrelerine göre net yabancı işçi kota dağılımı (Toplam: {fmtNum(pivotTable.grandTotal)} kişi).
                  </p>
                </div>

                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPivotMode('country')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      pivotMode === 'country'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Ülke × Görev
                  </button>
                  <button
                    type="button"
                    onClick={() => setPivotMode('region')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      pivotMode === 'region'
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Bölge × Görev
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      <th className="py-3 px-3 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10">
                        {pivotMode === 'country' ? 'Ülke (ОКСМ)' : 'Bölge (Субъект РФ)'}
                      </th>
                      {pivotTable.columns.map((col) => (
                        <th key={col.code} className="py-2.5 px-2.5 text-right min-w-[115px]">
                          <div className="leading-tight">{col.tr}</div>
                          <div className="text-[9.5px] font-mono font-normal text-slate-500">
                            {col.code}
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-3 text-right bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300">
                        Toplam
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pivotTable.rows.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 sticky left-0 bg-white dark:bg-[#111827] z-10">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {row.labelTr}
                          </div>
                          {row.labelRu && (
                            <div className="text-[10px] text-slate-500">{row.labelRu}</div>
                          )}
                        </td>
                        {pivotTable.columns.map((col) => {
                          const v = row.cells[col.code] || 0;
                          return (
                            <td
                              key={col.code}
                              className={`py-2.5 px-2.5 text-right font-mono ${
                                v < 0
                                  ? 'text-rose-600 font-semibold'
                                  : v > 0
                                  ? 'text-slate-800 dark:text-slate-200'
                                  : 'text-slate-300 dark:text-slate-700'
                              }`}
                            >
                              {v !== 0 ? fmtNum(v) : '0'}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-right font-mono font-bold bg-teal-50/40 dark:bg-teal-950/15 text-teal-900 dark:text-teal-200">
                          {fmtNum(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800/90 border-t-2 border-slate-300 dark:border-slate-700 font-bold">
                      <td className="py-3 px-3 sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                        GENEL TOPLAM
                      </td>
                      {pivotTable.columns.map((col) => (
                        <td key={col.code} className="py-3 px-2.5 text-right font-mono">
                          {fmtNum(col.total)}
                        </td>
                      ))}
                      <td className="py-3 px-3 text-right font-mono text-teal-800 dark:text-teal-300">
                        {fmtNum(pivotTable.grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================
              TAB 3: İRS SERTİFİKALARI & SONRAKİ YILA DEVİR
              ======================================================================== */}
          {activeTab === 'certificates' && (
            <div className="space-y-4">
              {filteredCertificates.length === 0 ? (
                <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-xs text-slate-500">
                  Seçili yıl/bölge için tanımlanmış parçalı İRS sertifikası bulunmuyor. Üstteki &ldquo;+ Parçalı İRS Ekle&rdquo; butonu ile yeni dilim açabilirsiniz.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredCertificates.map((cert) => {
                    const usedPct =
                      cert.total_allocated_qty > 0
                        ? Math.min(100, Math.round((cert.total_used_qty / cert.total_allocated_qty) * 100))
                        : 0;
                    return (
                      <div
                        key={cert.certificate_no}
                        className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold text-xs">
                                {cert.tranche_code}
                              </span>
                              <span className="font-bold text-sm text-slate-900 dark:text-white">
                                № {cert.certificate_no}
                              </span>
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                • {cert.region_code} ({cert.project_name})
                              </span>
                              {cert.is_cross_year_carryover && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10.5px] font-semibold">
                                  🔄 {cert.quota_year} → {cert.valid_until.slice(0, 4)} Yıl Devri
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                              <span>
                                <Calendar className="inline w-3 h-3 mr-1" />
                                Geçerlilik: {cert.valid_from || '—'} → {cert.valid_until || '—'}
                              </span>
                              {cert.days_until_expiry !== null && (
                                <span className="font-medium text-teal-700 dark:text-teal-400">
                                  ({cert.days_until_expiry} gün)
                                </span>
                              )}
                              {cert.notes && <span>• Not: {cert.notes}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (!guardWrite('İRS Üzerinden İşçi Alımı Ekleme', 'Привязка работника к ИРС')) {
                                  return;
                                }
                                setWorkerModalCertNo(cert.certificate_no);
                                setWorkerModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-[11px] font-semibold cursor-pointer"
                            >
                              + İşçi Bağla
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!guardWrite('İRS Sertifikası Düzenleme', 'Редактирование ИРС')) return;
                                setEditingCert(cert);
                                setCertModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                              title="Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCertificate(cert.certificate_no)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-600 dark:text-slate-400">
                              Tahsis: <strong>{fmtNum(cert.total_allocated_qty)}</strong> • Kullanılan (РНР):{' '}
                              <strong className="text-cyan-700 dark:text-cyan-400">
                                {fmtNum(cert.total_used_qty)}
                              </strong>
                            </span>
                            <span className="font-bold text-teal-700 dark:text-teal-300">
                              Kalan İRS: {fmtNum(cert.total_remaining_qty)} ({100 - usedPct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all"
                              style={{ width: `${Math.max(usedPct, cert.total_used_qty > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                        </div>

                        {/* Occupation Lines */}
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-2 max-h-44 overflow-y-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-slate-400">
                                <th className="text-left py-1">ОКПДТР Görev</th>
                                <th className="text-right py-1">Tahsis</th>
                                <th className="text-right py-1">Kullanılan</th>
                                <th className="text-right py-1">Kalan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                              {cert.lines.map((ln) => (
                                <tr key={ln.id}>
                                  <td className="py-1 text-slate-700 dark:text-slate-300">
                                    <span className="font-mono text-slate-400 mr-1.5">
                                      {ln.occupation_code}
                                    </span>
                                    {ln.occupation_tr}
                                  </td>
                                  <td className="py-1 text-right font-mono">{fmtNum(ln.allocated_qty)}</td>
                                  <td className="py-1 text-right font-mono text-cyan-700 dark:text-cyan-400">
                                    {fmtNum(ln.used_qty)}
                                  </td>
                                  <td className="py-1 text-right font-mono font-semibold text-teal-700 dark:text-teal-300">
                                    {fmtNum(ln.remaining_qty)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================
              TAB 4: İRS İŞÇİ ALIMI (РНР) LİSTESİ
              ======================================================================== */}
          {activeTab === 'workers' && (
            <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Parçalı İRS Sertifikaları Üzerinden İşçi Alımı (РНР) & Vize Uzatma Kayıtları
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    İRS kontenjanından düşülen çalışan/aday başvuruları; iptal edilen kayıtlar otomatik olarak İRS bakiyesine geri eklenir.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!guardWrite('İRS İşçi Alımı (РНР) Ekleme', 'Привязка работника к ИРС')) return;
                    setWorkerModalCertNo(filteredCertificates[0]?.certificate_no);
                    setWorkerModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                >
                  + Yeni İşçi Alımı (РНР) Bağla
                </button>
              </div>

              {filteredWorkers.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Henüz İRS sertifikalarına bağlanmış bireysel çalışan (РНР) kaydı bulunmuyor.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        <th className="py-3 px-3">İRS Sertifika</th>
                        <th className="py-3 px-3">Sicil / Ad Soyad</th>
                        <th className="py-3 px-3">Pasaport / Ülke</th>
                        <th className="py-3 px-3">Görev (ОКПДТР)</th>
                        <th className="py-3 px-3">Bölge / Şantiye</th>
                        <th className="py-3 px-3">Tür</th>
                        <th className="py-3 px-3">Başvuru Durumu</th>
                        <th className="py-3 px-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredWorkers.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono font-semibold text-teal-700 dark:text-teal-300">
                            {w.certificate_no}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {w.full_name}
                            </div>
                            {w.sicil_no && (
                              <div className="text-[10.5px] font-mono text-slate-500">
                                Sicil: {w.sicil_no}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono">{w.passport_no || '—'}</div>
                            <div className="text-[10.5px] text-slate-500">{w.country_tr}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-slate-500 mr-1">{w.occupation_code}</span>
                            {w.occupation_tr}
                          </td>
                          <td className="py-2.5 px-3">
                            <div>{w.region_code}</div>
                            <div className="text-[10.5px] text-slate-500">{w.project_name}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {w.usage_type === 'visa_extension' ? 'Vize Uzatma' : 'Yeni РНР'}
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={w.application_status}
                              onChange={(e) => handleUpdateWorkerStatus(w.id, e.target.value)}
                              className="px-2 py-1 rounded-lg text-[11px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                            >
                              <option value="applied">Başvuruldu</option>
                              <option value="rnr_approved">РНР Onaylandı</option>
                              <option value="visa_issued">Vize Basıldı</option>
                              <option value="arrived">Sahaya Geldi</option>
                              <option value="cancelled">İptal (Kontenjan İade)</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteWorker(w.id)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================
              TAB 5: KAYNAK DOSYALAR (26-D1..27-D7) & TÜM SATIRLAR (Veri — 297 Satır)
              ======================================================================== */}
          {activeTab === 'files_veri' && (
            <div className="space-y-5">
              {/* Dosyalar Table */}
              {filteredSourceFiles.length > 0 && (
                <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Resmi Bakanlık Başvuru Dosyaları (`Dosyalar` — {filteredSourceFiles.length} Dosya)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Bir dosya satırına tıklayarak aşağıdaki `Veri` tablosunu o dosyaya göre filtreleyebilirsiniz.
                      </p>
                    </div>
                    {fileCodeFilter !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setFileCodeFilter('ALL')}
                        className="px-3 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-xs font-semibold cursor-pointer"
                      >
                        Seçili Dosya: {fileCodeFilter} (Tümünü Göster)
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          <th className="py-2.5 px-3">Dosya No</th>
                          <th className="py-2.5 px-2">Yıl</th>
                          <th className="py-2.5 px-3">Bölge</th>
                          <th className="py-2.5 px-3">Başvuru Tipi</th>
                          <th className="py-2.5 px-3">Statü</th>
                          <th className="py-2.5 px-2.5">Tarih</th>
                          <th className="py-2.5 px-3">Orijinal Dosya Adı</th>
                          <th className="py-2.5 px-2 text-right">Satır</th>
                          <th className="py-2.5 px-3 text-right">Net Etki (+/−)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredSourceFiles.map((sf) => {
                          const selected = fileCodeFilter === sf.file_code;
                          const isApproved = sf.status_text.toLocaleLowerCase('tr-TR').includes('onay');
                          return (
                            <tr
                              key={sf.file_code}
                              onClick={() =>
                                setFileCodeFilter(selected ? 'ALL' : sf.file_code)
                              }
                              className={`cursor-pointer transition-colors ${
                                selected
                                  ? 'bg-teal-50 dark:bg-teal-950/40'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2 px-3 font-mono font-bold text-teal-700 dark:text-teal-300">
                                {sf.file_code}
                              </td>
                              <td className="py-2 px-2 font-mono">{sf.year}</td>
                              <td className="py-2 px-3 font-semibold">{sf.region_label}</td>
                              <td className="py-2 px-3">{sf.application_type}</td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                                    isApproved
                                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                  }`}
                                >
                                  {sf.status_text}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 font-mono text-[11px]">{sf.fill_date}</td>
                              <td className="py-2 px-3 text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[300px]">
                                {sf.source_filename}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{sf.row_count}</td>
                              <td
                                className={`py-2 px-3 text-right font-mono font-bold ${
                                  sf.net_effect < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {fmtSigned(sf.net_effect)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Veri Rows Table */}
              <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Detaylı Kota Satırları (`Veri` — {filteredAllocations.length} Satır • Net Toplam:{' '}
                    {fmtNum(filteredAllocations.reduce((s, a) => s + Number(a.requested_qty || 0), 0))})
                  </h3>
                </div>
                <div className="overflow-x-auto max-h-[540px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        <th className="py-2.5 px-3">Dosya / Kod</th>
                        <th className="py-2.5 px-2">Yıl</th>
                        <th className="py-2.5 px-3">Bölge</th>
                        <th className="py-2.5 px-3">Ülke (ОКСМ)</th>
                        <th className="py-2.5 px-3">Görev & ОКПДТР</th>
                        <th className="py-2.5 px-3">Başvuru Tipi</th>
                        <th className="py-2.5 px-3">Statü</th>
                        <th className="py-2.5 px-3 text-right">Net Etki (+/−)</th>
                        <th className="py-2.5 px-3 text-right">Onaylı</th>
                        <th className="py-2.5 px-2.5 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredAllocations.map((a) => {
                        const isApproved = a.migrakvota_status
                          .toLocaleLowerCase('tr-TR')
                          .includes('onay');
                        return (
                          <tr
                            key={a.record_code}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2 px-3 font-mono">
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {a.file_code || a.record_code}
                              </span>
                            </td>
                            <td className="py-2 px-2 font-mono">{a.year}</td>
                            <td className="py-2 px-3 font-semibold">{a.region_code}</td>
                            <td className="py-2 px-3">
                              <div>{a.country_tr}</div>
                              <div className="text-[10px] text-slate-400">{a.country_ru}</div>
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-medium text-slate-900 dark:text-white">
                                <span className="font-mono text-teal-700 dark:text-teal-400 mr-1.5">
                                  {a.occupation_code}
                                </span>
                                {a.occupation_tr}
                              </div>
                              <div className="text-[10px] text-slate-400">{a.occupation_ru}</div>
                            </td>
                            <td className="py-2 px-3">{a.application_type}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                                  isApproved
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                {a.migrakvota_status}
                              </span>
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-mono font-bold ${
                                a.requested_qty < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {fmtSigned(a.requested_qty)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                              {a.approved_qty !== 0 ? fmtNum(a.approved_qty) : '0'}
                            </td>
                            <td className="py-2 px-2.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!guardWrite('Kota Satırı Düzenleme', 'Редактирование квоты')) return;
                                  setEditingAlloc(a);
                                  setAllocModalOpen(true);
                                }}
                                className="p-1 text-slate-500 hover:text-teal-600 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAllocation(a.record_code)}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================
              TAB 6: ОКПДТР & ОКСМ RESMİ KOD REHBERİ
              ======================================================================== */}
          {activeTab === 'codes_guide' && (
            <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  {[
                    { id: 'occupations' as const, label: `Görev Kodları — ОКПДТР (${references.occupations.length})` },
                    { id: 'countries' as const, label: `Ülke Kodları — ОКСМ (${references.countries.length})` },
                    { id: 'projects' as const, label: `Şantiye → Bölge Eşleşmeleri (${references.projectMappings.length})` },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCodeSection(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                        codeSection === s.id ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  placeholder="Kod veya meslek/ülke ara..."
                  className="px-3 py-1.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 w-64"
                />
              </div>

              {codeSection === 'occupations' && (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                        <th className="py-2 px-3">ОКПДТР Kodu</th>
                        <th className="py-2 px-3">Görev (Türkçe)</th>
                        <th className="py-2 px-3">Профессия (Rusça Resmi Adı)</th>
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
                          <tr key={o.code}>
                            <td className="py-2 px-3 font-mono font-bold text-teal-700 dark:text-teal-300">
                              {o.code}
                            </td>
                            <td className="py-2 px-3 font-medium">{o.nameTr}</td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{o.nameRu}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {codeSection === 'countries' && (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                        <th className="py-2 px-3">ОКСМ Kodu</th>
                        <th className="py-2 px-3">Ülke (Türkçe)</th>
                        <th className="py-2 px-3">Страна (Rusça)</th>
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
                          <tr key={c.code}>
                            <td className="py-2 px-3 font-mono font-bold text-teal-700 dark:text-teal-300">
                              {c.code}
                            </td>
                            <td className="py-2 px-3 font-medium">{c.nameTr}</td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{c.nameRu}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {codeSection === 'projects' && (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                        <th className="py-2 px-3">Saha / eBA Projesi</th>
                        <th className="py-2 px-3">Kota Grubu</th>
                        <th className="py-2 px-3">Bölge Kodu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {references.projectMappings.map((pm, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-medium">{pm.mobProject}</td>
                          <td className="py-2 px-3">{pm.quotaProject}</td>
                          <td className="py-2 px-3 font-mono text-teal-700 dark:text-teal-300">
                            {pm.regionCode}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* QUICK REGION IRS & NOTE MODAL (e.g. Ust-Luga IRS1/IRS2/IRS3 + Açıklama) */}
      {quickIrsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-[#1A363E] to-teal-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  {quickIrsTarget.regionNameTr} — Parçalı İRS & Açıklama Güncelle
                </h3>
                <p className="text-[11px] text-emerald-200">
                  Onaylı Kota Tavanı: {fmtNum(quickIrsTarget.approvedQty)} kişi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickIrsTarget(null)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickRegionIrs} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    IRS1 Kontenjanı
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={quickIrsTarget.irs1Qty}
                    onChange={(e) =>
                      setQuickIrsTarget({ ...quickIrsTarget, irs1Qty: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    IRS2 Kontenjanı
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={quickIrsTarget.irs2Qty}
                    onChange={(e) =>
                      setQuickIrsTarget({ ...quickIrsTarget, irs2Qty: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    IRS3 Kontenjanı
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={quickIrsTarget.irs3Qty}
                    onChange={(e) =>
                      setQuickIrsTarget({ ...quickIrsTarget, irs3Qty: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 flex items-center justify-between text-xs">
                <span>
                  Toplam Alınan İRS:{' '}
                  <strong>
                    {fmtNum(
                      quickIrsTarget.irs1Qty + quickIrsTarget.irs2Qty + quickIrsTarget.irs3Qty
                    )}
                  </strong>
                </span>
                <span>
                  Kalan Onaylı Kota:{' '}
                  <strong className="text-indigo-700 dark:text-indigo-300">
                    {fmtNum(
                      quickIrsTarget.approvedQty -
                        (quickIrsTarget.irs1Qty + quickIrsTarget.irs2Qty + quickIrsTarget.irs3Qty)
                    )}
                  </strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  İRS Geçerlilik Bitiş Tarihi (Sonraki Yıla Devir İçin)
                </label>
                <input
                  type="date"
                  value={quickIrsTarget.validUntil}
                  onChange={(e) =>
                    setQuickIrsTarget({ ...quickIrsTarget, validUntil: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bölge Açıklaması / Not (`IRS` Sayfası Notu)
                </label>
                <input
                  type="text"
                  value={quickIrsTarget.noteText}
                  onChange={(e) =>
                    setQuickIrsTarget({ ...quickIrsTarget, noteText: e.target.value })
                  }
                  placeholder="Örn: Kalan kota aktive edilebilir / Ust-Luga İRS eklendi"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setQuickIrsTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={savingQuickIrs}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingQuickIrs ? 'Kaydediliyor...' : 'Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXISTING MODALS */}
      <QuotaIrsCertificateModal
        open={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        onSaved={(msg) => {
          showNotice(msg, 'ok');
          fetchOverview(selectedYear);
        }}
        initialCert={editingCert}
        defaultYear={selectedYear === 'all' ? 2026 : Number(selectedYear) || 2026}
        defaultRegionCode={certDefaultRegion}
        references={references}
      />

      <QuotaWorkerIrsModal
        open={workerModalOpen}
        onClose={() => setWorkerModalOpen(false)}
        onSaved={(msg) => {
          showNotice(msg, 'ok');
          fetchOverview(selectedYear);
        }}
        certificates={data?.certificates || []}
        preselectedCertNo={workerModalCertNo}
        references={references}
      />

      <QuotaAllocationModal
        open={allocModalOpen}
        onClose={() => setAllocModalOpen(false)}
        onSaved={(msg) => {
          showNotice(msg, 'ok');
          fetchOverview(selectedYear);
        }}
        initialRow={editingAlloc}
        defaultYear={selectedYear === 'all' ? 2026 : Number(selectedYear) || 2026}
        references={references}
      />

      {data?.alertSettings && (
        <QuotaAlertSettingsModal
          open={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
          settings={data.alertSettings}
          criticalCount={data.criticalAlerts?.length || 0}
          onSaved={(msg) => {
            showNotice(msg, 'ok');
            fetchOverview(selectedYear);
          }}
        />
      )}
    </div>
  );
}

export default QuotaTrackingView;
