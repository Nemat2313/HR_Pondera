'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileCheck2,
  FileWarning,
  Upload,
  Download,
  RotateCcw,
  Search,
  Building2,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderCheck,
  Sparkles,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  ALL35_INDICES,
  CORE14_INDICES,
  CORE8_INDICES,
  DOC_SCAN_DEFINITIONS,
  DOC_SCAN_GROUPS,
  DocScanGroupKey,
  EmployeeScanItem,
  getStatutoryRequiredIndices,
} from '@/lib/documentScanDefinitions';

interface DocumentScanControlViewProps {
  onNavigateToPersonnel?: (filterType?: string, filterValue?: string) => void;
  onLoadedMeta?: (totalMatchedActive: number, missingActiveCount: number) => void;
}

type EvalScopeMode = 'statutory' | 'core8' | 'all35';
type WorkforceScopeMode = 'active' | 'active_pending' | 'all_report';
type FirmFilterMode = 'all' | 'main' | 'subcon';
type MatrixColsMode = 'core14' | 'core8' | 'all35';
type TierFilterKey =
  | 'all'
  | 'any_missing'
  | 'complete'
  | 'missing_1_2'
  | 'missing_3_4'
  | 'missing_5_plus'
  | 'critical_identity'
  | 'critical_contract'
  | 'not_in_report';

const DONUT_COLORS = {
  complete: '#10b981',
  missing_1_2: '#38bdf8',
  missing_3_4: '#f59e0b',
  missing_5_plus: '#f43f5e',
  not_in_report: '#94a3b8',
};

const PERMIT_LABELS: Record<string, { tr: string; ru: string; badgeClass: string }> = {
  VKS: {
    tr: 'VKS (Yüksek Uzman)',
    ru: 'ВКС',
    badgeClass:
      'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  },
  PATENT: {
    tr: 'Patent',
    ru: 'Патент',
    badgeClass:
      'bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  QUOTA_RNR: {
    tr: 'Kota / RNR',
    ru: 'Квота / РНР',
    badgeClass:
      'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  RF_CITIZEN: {
    tr: 'RF Vatandaşı',
    ru: 'Гражданин РФ',
    badgeClass:
      'bg-violet-50 dark:bg-violet-950/70 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  },
  EAES: {
    tr: 'EAES (Muaf)',
    ru: 'ЕАЭС',
    badgeClass:
      'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  VNJ_RVP: {
    tr: 'VNJ / RVP',
    ru: 'ВНЖ / РВП',
    badgeClass:
      'bg-pink-50 dark:bg-pink-950/70 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  },
  OTHER_PENDING: {
    tr: 'İşlemde / Diğer',
    ru: 'В оформлении',
    badgeClass:
      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  },
};

export default function DocumentScanControlView({
  onNavigateToPersonnel,
  onLoadedMeta,
}: DocumentScanControlViewProps) {
  const { user, showPermissionDenied } = useAuth();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{
    sourceFile: string;
    reportDate: string;
    updatedAt: string;
    ebaFreshness: string;
    totalScanRowsInDb: number;
    matchedScanRows: number;
    unmatchedScanRows: number;
  } | null>(null);
  const [rawEmployees, setRawEmployees] = useState<EmployeeScanItem[]>([]);

  // Evaluation & Filter states
  const [evalScope, setEvalScope] = useState<EvalScopeMode>('statutory');
  const [workforceScope, setWorkforceScope] = useState<WorkforceScopeMode>('active');
  const [firmFilter, setFirmFilter] = useState<FirmFilterMode>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedPermit, setSelectedPermit] = useState<string>('all');
  const [selectedMissingDocIdx, setSelectedMissingDocIdx] = useState<number>(-1);
  const [tierFilter, setTierFilter] = useState<TierFilterKey>('all');
  const [docChartGroup, setDocChartGroup] = useState<'core' | DocScanGroupKey | 'all'>('core');
  const [matrixColsMode, setMatrixColsMode] = useState<MatrixColsMode>('core14');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({ Kazan: true });
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  // Upload panel state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'upsert' | 'replace'>('upsert');
  const [uploading, setUploading] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Controlled chart entry animation trigger (animates smoothly on mount & scope switch without hover flicker)
  const [animWave, setAnimWave] = useState(0);
  const [pieAnimActive, setPieAnimActive] = useState(true);

  const triggerChartAnim = () => {
    setAnimWave((w) => w + 1);
    setPieAnimActive(true);
  };

  useEffect(() => {
    setPieAnimActive(true);
    const timer = setTimeout(() => setPieAnimActive(false), 1100);
    return () => clearTimeout(timer);
  }, [animWave, evalScope, workforceScope, firmFilter, selectedRegion, selectedProject]);

  const fetchScans = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (user) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }

    fetch(`/api/compliance/scans?${params.toString()}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setMeta(resData.meta);
          setRawEmployees(resData.employees || []);
          triggerChartAnim();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchScans();
  }, [user?.scope_type, user?.scope_value]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [
    evalScope,
    workforceScope,
    firmFilter,
    selectedRegion,
    selectedProject,
    selectedPermit,
    selectedMissingDocIdx,
    tierFilter,
    search,
  ]);

  // Enrich each employee with evaluation metrics according to evalScope
  const evaluatedEmployees = useMemo(() => {
    return rawEmployees.map((emp) => {
      const reqIndices =
        evalScope === 'statutory'
          ? getStatutoryRequiredIndices(emp.uyruk, emp.permitCategory)
          : evalScope === 'core8'
          ? CORE8_INDICES
          : ALL35_INDICES;

      const reqSet = new Set<number>(reqIndices);
      let uploadedReqCount = 0;
      const missingIndices: number[] = [];

      if (emp.inScanReport) {
        for (const idx of reqIndices) {
          if (emp.mask[idx] === '1') {
            uploadedReqCount++;
          } else {
            missingIndices.push(idx);
          }
        }
      } else {
        for (const idx of reqIndices) {
          missingIndices.push(idx);
        }
      }

      const reqTotal = reqIndices.length || 1;
      const missingCount = emp.inScanReport ? missingIndices.length : reqTotal;
      const completionPct = emp.inScanReport
        ? Math.round((uploadedReqCount / reqTotal) * 100)
        : 0;

      // Critical identity/migration missing check: Pasaport(0), Migrasyon(1), İkametgah(3), RNR(4), Patent(19), Vize(6)
      const hasCriticalIdentityMissing =
        emp.inScanReport &&
        missingIndices.some((i) => i === 0 || i === 1 || i === 3 || i === 4 || i === 6 || i === 19);

      // Critical contract/medical missing check: Sözleşme PDF(9), Alım Emri(11), 29N(14), Parmak İzi(29)
      const hasCriticalContractMissing =
        emp.inScanReport &&
        missingIndices.some((i) => i === 9 || i === 11 || i === 14 || i === 29);

      let tier: 'complete' | 'missing_1_2' | 'missing_3_4' | 'missing_5_plus' | 'not_in_report';
      if (!emp.inScanReport) {
        tier = 'not_in_report';
      } else if (missingCount === 0) {
        tier = 'complete';
      } else if (missingCount <= 2) {
        tier = 'missing_1_2';
      } else if (missingCount <= 4) {
        tier = 'missing_3_4';
      } else {
        tier = 'missing_5_plus';
      }

      return {
        ...emp,
        reqIndices,
        reqSet,
        reqTotal,
        uploadedReqCount,
        missingIndices,
        missingCount,
        completionPct,
        hasCriticalIdentityMissing,
        hasCriticalContractMissing,
        tier,
      };
    });
  }, [rawEmployees, evalScope]);

  // Notify parent tab badge with active matched count & missing count
  useEffect(() => {
    if (!onLoadedMeta || evaluatedEmployees.length === 0) return;
    const activeMatched = evaluatedEmployees.filter(
      (e) => e.genelDurum.toLowerCase().includes('mevcut') && e.inScanReport
    );
    const missingActive = activeMatched.filter((e) => e.missingCount > 0);
    onLoadedMeta(activeMatched.length, missingActive.length);
  }, [evaluatedEmployees, onLoadedMeta]);

  // Step 1: Workforce & Firm base pool (used for Region/Site breakdowns & KPIs)
  const scopedPool = useMemo(() => {
    return evaluatedEmployees.filter((emp) => {
      const gd = emp.genelDurum.toLowerCase();
      if (workforceScope === 'active') {
        if (!gd.includes('mevcut')) return false;
      } else if (workforceScope === 'active_pending') {
        if (!gd.includes('mevcut') && !gd.includes('bekleniyor') && !gd.includes('sevke')) {
          return false;
        }
      } else {
        // all_report: everyone who is in the eBA scan report
        if (!emp.inScanReport) return false;
      }

      if (firmFilter === 'main' && !emp.isMainFirm) return false;
      if (firmFilter === 'subcon' && emp.isMainFirm) return false;

      return true;
    });
  }, [evaluatedEmployees, workforceScope, firmFilter]);

  // Counts for Firm toggle pills (within workforceScope)
  const firmCounts = useMemo(() => {
    let all = 0;
    let main = 0;
    let subcon = 0;
    for (const emp of evaluatedEmployees) {
      const gd = emp.genelDurum.toLowerCase();
      if (workforceScope === 'active' && !gd.includes('mevcut')) continue;
      if (
        workforceScope === 'active_pending' &&
        !gd.includes('mevcut') &&
        !gd.includes('bekleniyor') &&
        !gd.includes('sevke')
      ) {
        continue;
      }
      if (workforceScope === 'all_report' && !emp.inScanReport) continue;
      all++;
      if (emp.isMainFirm) main++;
      else subcon++;
    }
    return { all, main, subcon };
  }, [evaluatedEmployees, workforceScope]);

  // Step 2: Pool filtered by Region / Project / Permit (used for KPIs, Donut, and Doc Type chart)
  const locationFilteredPool = useMemo(() => {
    return scopedPool.filter((emp) => {
      if (selectedRegion !== 'all' && emp.region !== selectedRegion) return false;
      if (selectedProject !== 'all' && emp.projeAdi !== selectedProject) return false;
      if (selectedPermit !== 'all' && emp.permitCategory !== selectedPermit) return false;
      return true;
    });
  }, [scopedPool, selectedRegion, selectedProject, selectedPermit]);

  // KPI Metrics
  const kpis = useMemo(() => {
    let totalPool = 0;
    let inReportCount = 0;
    let notInReportCount = 0;
    let completeCount = 0;
    let anyMissingCount = 0;
    let missing12 = 0;
    let missing34 = 0;
    let missing5Plus = 0;
    let criticalIdentityCount = 0;
    let criticalContractCount = 0;
    let totalReqDocs = 0;
    let totalUploadedDocs = 0;

    for (const e of locationFilteredPool) {
      totalPool++;
      if (!e.inScanReport) {
        notInReportCount++;
        continue;
      }
      inReportCount++;
      totalReqDocs += e.reqTotal;
      totalUploadedDocs += e.uploadedReqCount;

      if (e.missingCount === 0) {
        completeCount++;
      } else {
        anyMissingCount++;
        if (e.missingCount <= 2) missing12++;
        else if (e.missingCount <= 4) missing34++;
        else missing5Plus++;
      }

      if (e.hasCriticalIdentityMissing) criticalIdentityCount++;
      if (e.hasCriticalContractMissing) criticalContractCount++;
    }

    const overallCompletionPct =
      totalReqDocs > 0 ? Math.round((totalUploadedDocs / totalReqDocs) * 1000) / 10 : 0;

    return {
      totalPool,
      inReportCount,
      notInReportCount,
      completeCount,
      anyMissingCount,
      missing12,
      missing34,
      missing5Plus,
      criticalIdentityCount,
      criticalContractCount,
      totalReqDocs,
      totalUploadedDocs,
      overallCompletionPct,
    };
  }, [locationFilteredPool]);

  // Donut Chart Data
  const donutData = useMemo(() => {
    const items = [
      {
        key: 'complete' as TierFilterKey,
        name: lang === 'ru' ? 'Полный комплект (100%)' : 'Tam Eksiksiz (%100)',
        short: lang === 'ru' ? 'Полный' : 'Eksiksiz',
        count: kpis.completeCount,
        color: DONUT_COLORS.complete,
      },
      {
        key: 'missing_1_2' as TierFilterKey,
        name: lang === 'ru' ? 'Не хватает 1–2 сканов' : '1–2 Evrak Eksik',
        short: lang === 'ru' ? '1–2 нет' : '1–2 Eksik',
        count: kpis.missing12,
        color: DONUT_COLORS.missing_1_2,
      },
      {
        key: 'missing_3_4' as TierFilterKey,
        name: lang === 'ru' ? 'Не хватает 3–4 сканов' : '3–4 Evrak Eksik',
        short: lang === 'ru' ? '3–4 нет' : '3–4 Eksik',
        count: kpis.missing34,
        color: DONUT_COLORS.missing_3_4,
      },
      {
        key: 'missing_5_plus' as TierFilterKey,
        name: lang === 'ru' ? 'Не хватает 5+ сканов' : '5+ Evrak Eksik',
        short: lang === 'ru' ? '5+ нет' : '5+ Eksik',
        count: kpis.missing5Plus,
        color: DONUT_COLORS.missing_5_plus,
      },
    ];
    if (kpis.notInReportCount > 0) {
      items.push({
        key: 'not_in_report' as TierFilterKey,
        name: lang === 'ru' ? 'Нет в выгрузке eBA' : 'eBA Raporunda Yok',
        short: lang === 'ru' ? 'Нет в eBA' : 'Raporda Yok',
        count: kpis.notInReportCount,
        color: DONUT_COLORS.not_in_report,
      });
    }
    return items.filter((d) => d.count > 0);
  }, [kpis, lang]);

  // Region & Sub-Site Breakdown (from scopedPool so clicking a region highlights without hiding other regions)
  const regionBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        region: string;
        total: number;
        inReport: number;
        notInReport: number;
        complete: number;
        partialMissing: number;
        heavyMissing: number;
        missingAny: number;
        reqDocs: number;
        upDocs: number;
        projects: Map<
          string,
          {
            projeAdi: string;
            total: number;
            inReport: number;
            notInReport: number;
            complete: number;
            missingAny: number;
            reqDocs: number;
            upDocs: number;
          }
        >;
      }
    >();

    for (const e of scopedPool) {
      if (selectedPermit !== 'all' && e.permitCategory !== selectedPermit) continue;

      let regObj = map.get(e.region);
      if (!regObj) {
        regObj = {
          region: e.region,
          total: 0,
          inReport: 0,
          notInReport: 0,
          complete: 0,
          partialMissing: 0,
          heavyMissing: 0,
          missingAny: 0,
          reqDocs: 0,
          upDocs: 0,
          projects: new Map(),
        };
        map.set(e.region, regObj);
      }

      regObj.total++;
      if (!e.inScanReport) {
        regObj.notInReport++;
      } else {
        regObj.inReport++;
        regObj.reqDocs += e.reqTotal;
        regObj.upDocs += e.uploadedReqCount;
        if (e.missingCount === 0) {
          regObj.complete++;
        } else {
          regObj.missingAny++;
          if (e.missingCount <= 3) regObj.partialMissing++;
          else regObj.heavyMissing++;
        }
      }

      let projObj = regObj.projects.get(e.projeAdi);
      if (!projObj) {
        projObj = {
          projeAdi: e.projeAdi,
          total: 0,
          inReport: 0,
          notInReport: 0,
          complete: 0,
          missingAny: 0,
          reqDocs: 0,
          upDocs: 0,
        };
        regObj.projects.set(e.projeAdi, projObj);
      }
      projObj.total++;
      if (!e.inScanReport) {
        projObj.notInReport++;
      } else {
        projObj.inReport++;
        projObj.reqDocs += e.reqTotal;
        projObj.upDocs += e.uploadedReqCount;
        if (e.missingCount === 0) projObj.complete++;
        else projObj.missingAny++;
      }
    }

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        completionPct: r.reqDocs > 0 ? Math.round((r.upDocs / r.reqDocs) * 100) : 0,
        projectsList: Array.from(r.projects.values())
          .map((p) => ({
            ...p,
            completionPct: p.reqDocs > 0 ? Math.round((p.upDocs / p.reqDocs) * 100) : 0,
          }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [scopedPool, selectedPermit]);

  // Document Type Breakdown (across all 35 columns)
  const docTypeStats = useMemo(() => {
    const inReportPool = locationFilteredPool.filter((e) => e.inScanReport);
    return DOC_SCAN_DEFINITIONS.map((def) => {
      let applicableCount = 0;
      let uploadedApplicable = 0;
      let missingApplicable = 0;
      let rawUploadedAll = 0;

      for (const e of inReportPool) {
        const isUp = e.mask[def.index] === '1';
        if (isUp) rawUploadedAll++;

        const isApplicable =
          evalScope === 'statutory'
            ? e.reqSet.has(def.index)
            : evalScope === 'core8'
            ? def.isCore8
            : true;

        if (isApplicable) {
          applicableCount++;
          if (isUp) uploadedApplicable++;
          else missingApplicable++;
        }
      }

      // If a non-statutory archive doc is viewed under 'all' or group tab, show raw counts over inReportPool
      const denom = applicableCount > 0 ? applicableCount : inReportPool.length;
      const uploaded = applicableCount > 0 ? uploadedApplicable : rawUploadedAll;
      const missing =
        applicableCount > 0 ? missingApplicable : Math.max(0, inReportPool.length - rawUploadedAll);
      const pct = denom > 0 ? Math.round((uploaded / denom) * 100) : 0;

      return {
        ...def,
        label: lang === 'ru' ? def.shortRu : def.shortTr,
        fullLabel: lang === 'ru' ? def.labelRu : def.labelTr,
        applicableCount,
        uploaded,
        missing,
        rawUploadedAll,
        pct,
      };
    });
  }, [locationFilteredPool, evalScope, lang]);

  const filteredDocChartData = useMemo(() => {
    if (docChartGroup === 'core') {
      return docTypeStats.filter((d) => d.isCore14);
    }
    if (docChartGroup === 'all') {
      return docTypeStats;
    }
    return docTypeStats.filter((d) => d.group === docChartGroup);
  }, [docTypeStats, docChartGroup]);

  // Final filtered employee list for the detailed matrix table
  const finalFilteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locationFilteredPool
      .filter((e) => {
        if (tierFilter === 'any_missing' && (!e.inScanReport || e.missingCount === 0)) return false;
        if (tierFilter === 'complete' && (!e.inScanReport || e.missingCount !== 0)) return false;
        if (tierFilter === 'missing_1_2' && e.tier !== 'missing_1_2') return false;
        if (tierFilter === 'missing_3_4' && e.tier !== 'missing_3_4') return false;
        if (tierFilter === 'missing_5_plus' && e.tier !== 'missing_5_plus') return false;
        if (tierFilter === 'critical_identity' && !e.hasCriticalIdentityMissing) return false;
        if (tierFilter === 'critical_contract' && !e.hasCriticalContractMissing) return false;
        if (tierFilter === 'not_in_report' && e.inScanReport) return false;

        if (selectedMissingDocIdx !== -1) {
          if (!e.inScanReport) return false;
          if (e.mask[selectedMissingDocIdx] === '1') return false;
          // In statutory mode, if selected doc is part of statutory checks, ensure it's actually required for this employee
          if (
            evalScope === 'statutory' &&
            CORE14_INDICES.includes(selectedMissingDocIdx) &&
            selectedMissingDocIdx !== 7 && // Fotoğraf is optional in statutory, allow raw missing filter
            !e.reqSet.has(selectedMissingDocIdx)
          ) {
            return false;
          }
        }

        if (q) {
          const hay = `${e.sicilNo} ${e.adSoyad} ${e.fioKiril} ${e.gorevi} ${e.projeAdi} ${e.uyruk}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.inScanReport !== b.inScanReport) return a.inScanReport ? -1 : 1;
        if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
        return a.sicilNo.localeCompare(b.sicilNo);
      });
  }, [locationFilteredPool, tierFilter, selectedMissingDocIdx, evalScope, search]);

  // Visible columns in the matrix table
  const visibleDocDefs = useMemo(() => {
    const indices =
      matrixColsMode === 'core8'
        ? CORE8_INDICES
        : matrixColsMode === 'all35'
        ? ALL35_INDICES
        : CORE14_INDICES;
    return indices.map((i) => DOC_SCAN_DEFINITIONS[i]);
  }, [matrixColsMode]);

  // Available projects for dropdown
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of scopedPool) {
      if (selectedRegion === 'all' || e.region === selectedRegion) {
        set.add(e.projeAdi);
      }
    }
    return Array.from(set).sort();
  }, [scopedPool, selectedRegion]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(finalFilteredEmployees.length / pageSize));
  const paginatedEmployees = finalFilteredEmployees.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // Multi-file or single-file Excel upload handler
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadBanner(null);

    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('files', f));
      fd.append('mode', uploadMode);
      if (user) {
        fd.append('userScopeType', user.scope_type);
        fd.append('userScopeValue', user.scope_value);
      }

      const res = await fetch('/api/compliance/scans', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMeta(json.meta);
        setRawEmployees(json.employees || []);
        setUploadBanner({
          ok: true,
          text: json.message || 'eBA Evrak Skan listesi başarıyla güncellendi.',
        });
        triggerChartAnim();
      } else {
        setUploadBanner({
          ok: false,
          text: json.message || 'Dosya yüklenemedi.',
        });
      }
    } catch {
      setUploadBanner({
        ok: false,
        text: 'Sunucu bağlantısı sırasında hata oluştu.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Multi-Sheet Professional Excel Export
  const handleExportWorkbook = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Region & Site Summary
    const summaryRows: any[] = [];
    for (const r of regionBreakdown) {
      summaryRows.push({
        'Bölge / Şantiye Seviyesi': `BÖLGE: ${r.region}`,
        'Toplam Kadro': r.total,
        'eBA Raporunda Olan': r.inReport,
        'eBA Raporunda Olmayan': r.notInReport,
        'Tam Eksiksiz (%100)': r.complete,
        'Eksik Skanı Olan': r.missingAny,
        'Skan Doluluk Oranı (%)': `%${r.completionPct}`,
      });
      for (const p of r.projectsList) {
        summaryRows.push({
          'Bölge / Şantiye Seviyesi': `   ↳ ${p.projeAdi}`,
          'Toplam Kadro': p.total,
          'eBA Raporunda Olan': p.inReport,
          'eBA Raporunda Olmayan': p.notInReport,
          'Tam Eksiksiz (%100)': p.complete,
          'Eksik Skanı Olan': p.missingAny,
          'Skan Doluluk Oranı (%)': `%${p.completionPct}`,
        });
      }
    }
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, '1_Bolge_Santiye_Ozet');

    // Sheet 2: Document Type Breakdown
    const docRows = docTypeStats.map((d) => ({
      'Evrak Sütunu (eBA)': d.excelHeader,
      'Kategori': DOC_SCAN_GROUPS[d.group].labelTr,
      'Zorunlu Kapsam Kişi': d.applicableCount,
      'Yüklenen (Uploaded)': d.uploaded,
      'Eksik (-)': d.missing,
      'Doluluk Oranı (%)': `%${d.pct}`,
      'Ham Toplam Uploaded (Tüm Rapor)': d.rawUploadedAll,
    }));
    const wsDocs = XLSX.utils.json_to_sheet(docRows);
    XLSX.utils.book_append_sheet(wb, wsDocs, '2_Evrak_Turu_Analizi');

    // Sheet 3: Detailed Filtered Employee Matrix
    const detailRows = finalFilteredEmployees.map((e) => {
      const missingNames = e.inScanReport
        ? e.missingIndices.map((idx) => DOC_SCAN_DEFINITIONS[idx].shortTr).join(', ')
        : 'eBA Skan Raporunda Kayıt Yok';

      const base: Record<string, any> = {
        'Sicil No': e.sicilNo,
        'Adı Soyadı': e.adSoyad,
        'Kiril Tam Adı': e.fioKiril,
        'Bölge': e.region,
        'Şantiye / Proje': e.projeAdi,
        'Firma': e.firma,
        'Departman': e.departman,
        'Görevi': e.gorevi,
        'Uyruk': e.uyruk,
        'Çalışma İzni Statüsü': PERMIT_LABELS[e.permitCategory]?.tr || e.permitCategory,
        'Genel Durum': e.genelDurum,
        'Güncel Durum': e.guncelDurum,
        'eBA Raporunda': e.inScanReport ? 'Evet' : 'YOK',
        'Zorunlu Evrak Sayısı': e.reqTotal,
        'Yüklenen Skan': e.inScanReport ? e.uploadedReqCount : 0,
        'Eksik Skan Sayısı': e.missingCount,
        'Tamamlanma (%)': `%${e.completionPct}`,
        'Eksik Evrak Listesi': missingNames || 'Tam Eksiksiz',
      };

      for (const def of visibleDocDefs) {
        if (!e.inScanReport) {
          base[def.excelHeader] = 'RAPORDA YOK';
        } else if (e.mask[def.index] === '1') {
          base[def.excelHeader] = 'Uploaded';
        } else if (evalScope === 'statutory' && !e.reqSet.has(def.index)) {
          base[def.excelHeader] = 'Muaf';
        } else {
          base[def.excelHeader] = 'EKSİK (-)';
        }
      }
      return base;
    });
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, '3_Personel_Skan_Detay');

    XLSX.writeFile(
      wb,
      `Pondera_eBA_Evrak_Skan_Analitigi_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  const resetAllFilters = () => {
    setSelectedRegion('all');
    setSelectedProject('all');
    setSelectedPermit('all');
    setSelectedMissingDocIdx(-1);
    setTierFilter('all');
    setFirmFilter('all');
    setSearch('');
    triggerChartAnim();
  };

  const hasActiveFilters =
    selectedRegion !== 'all' ||
    selectedProject !== 'all' ||
    selectedPermit !== 'all' ||
    selectedMissingDocIdx !== -1 ||
    tierFilter !== 'all' ||
    firmFilter !== 'all' ||
    search.trim() !== '';

  if (loading && rawEmployees.length === 0) {
    return (
      <div className="p-10 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {lang === 'ru'
            ? 'Загрузка аналитики сканов документов eBA...'
            : 'eBA Evrak Skan & Şantiye Analitiği Hazırlanıyor...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      {/* HERO HEADER CARD */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#111C35] dark:via-[#152445] dark:to-[#132944] rounded-2xl border border-slate-200 dark:border-indigo-500/30 p-4 sm:p-6 shadow-sm dark:shadow-2xl relative overflow-hidden">
        <div className="absolute -top-10 right-1/4 w-96 h-36 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none hidden dark:block" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
              <FolderCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {lang === 'ru'
                    ? 'Контроль сканов документов в архиве eBA'
                    : 'eBA Evrak Skan & Dijital Arşiv Kontrolü'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 text-[11px] font-bold">
                  {meta?.totalScanRowsInDb?.toLocaleString('tr-TR') || '5.174'} eBA Sicil
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 text-[11px] font-bold">
                  35 Evrak Sütunu
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-3xl">
                {lang === 'ru'
                  ? `Сверка выгрузки сканов eBA (${meta?.sourceFile || 'Document_Control.xlsx'}) с реальными объектами и регионами по табельному номеру.`
                  : `eBA dijital arşiv raporu (${meta?.sourceFile || 'Document_Control - Yeni.xlsx'}) sicil numaraları üzerinden canlı saha kadrosu ile eşleştirilerek bölge ve şantiye bazında eksik skanlar analiz edilir.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (user?.role === 'viewer') {
                  showPermissionDenied({
                    actionLabelTr: 'eBA Skan Raporu Excel Yükleme',
                    actionLabelRu: 'Загрузка Excel сканов eBA',
                  });
                  return;
                }
                setIsUploadOpen((v) => !v);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-indigo-300 dark:border-indigo-500/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <Upload className="w-4 h-4 text-indigo-700 dark:text-indigo-300" />
              <span>{lang === 'ru' ? 'Загрузить Excel (eBA)' : 'eBA Excel Yükle'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportWorkbook}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
              <span>{lang === 'ru' ? 'Скачать Excel (3 листа)' : 'Eksik Skan Raporu İndir (.xlsx)'}</span>
            </button>

            <button
              type="button"
              onClick={fetchScans}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title={lang === 'ru' ? 'Обновить' : 'Yenile'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* INLINE MULTI-FILE UPLOAD DRAWER (500-Row eBA Batch Friendly!) */}
        {isUploadOpen && (
          <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-700/80 relative z-10 animate-in slide-in-from-top-2 duration-200">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-indigo-200/80 dark:border-indigo-500/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {lang === 'ru'
                      ? 'Загрузка отчета Document_Control из eBA (поддержка пакетов по 500 строк)'
                      : 'eBA Document_Control Excel Yükleme (500\'lük Parçalı veya Tek Birleşik Dosya)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {lang === 'ru'
                    ? 'Можно выбрать сразу несколько файлов .xlsx (по 500 записей) — система автоматически объединит их по табельному номеру.'
                    : 'eBA\'dan 500\'er satır halinde indirdiğiniz birden fazla Excel dosyasını tek seferde çoklu seçebilirsiniz; sistem sicil numarasına göre otomatik birleştirir.'}
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setUploadMode('upsert')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                      uploadMode === 'upsert'
                        ? 'bg-indigo-100 dark:bg-indigo-500/25 text-indigo-950 dark:text-indigo-100 border-indigo-400'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {lang === 'ru'
                      ? '🔄 Объединить / Обновить (для пакетов по 500)'
                      : '🔄 Mevcut Listeye Birleştir / Güncelle (Önerilen)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('replace')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                      uploadMode === 'replace'
                        ? 'bg-amber-100 dark:bg-amber-500/25 text-amber-950 dark:text-amber-100 border-amber-400'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {lang === 'ru'
                      ? '♻️ Полностью заменить весь список'
                      : '♻️ Tüm Listeyi Sıfırdan Yenile (Tam Dosya)'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-500/50 bg-indigo-100 hover:bg-indigo-200/80 dark:bg-indigo-500/25 dark:hover:bg-indigo-500/35 text-indigo-950 dark:text-indigo-100 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {uploading
                      ? lang === 'ru'
                        ? 'Обработка...'
                        : 'Yükleniyor...'
                      : lang === 'ru'
                      ? 'Выбрать файл(ы) .xlsx'
                      : 'Excel Dosya(larını) Seç'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {uploadBanner && (
          <div
            className={`mt-3 px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              uploadBanner.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
            }`}
          >
            <span>{uploadBanner.text}</span>
            <button
              type="button"
              onClick={() => setUploadBanner(null)}
              className="ml-2 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* EVALUATION MODE & WORKFORCE SCOPE BAR */}
      <div className="p-3.5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Evaluation Rule Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            {lang === 'ru' ? 'Критерий проверки:' : 'Analiz Kriteri:'}
          </span>
          <button
            type="button"
            onClick={() => setEvalScope('statutory')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              evalScope === 'statutory'
                ? 'bg-indigo-100/90 dark:bg-indigo-500/25 text-indigo-950 dark:text-indigo-100 border-indigo-300 dark:border-indigo-500/50 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'ru'
              ? '⚖️ Обязательные по статусу (ВКС / Патент / РФ)'
              : '⚖️ Akıllı Yasal Zorunlu Evraklar (Uyruk & İzine Göre)'}
          </button>
          <button
            type="button"
            onClick={() => setEvalScope('core8')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              evalScope === 'core8'
                ? 'bg-cyan-100/90 dark:bg-cyan-500/25 text-cyan-950 dark:text-cyan-100 border-cyan-300 dark:border-cyan-500/50 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'ru' ? '📋 Первые 8 колонок eBA' : '📋 İlk 8 Ana Göç Sütunu'}
          </button>
          <button
            type="button"
            onClick={() => setEvalScope('all35')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              evalScope === 'all35'
                ? 'bg-emerald-100/90 dark:bg-emerald-500/25 text-emerald-950 dark:text-emerald-100 border-emerald-300 dark:border-emerald-500/50 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {lang === 'ru' ? '🗂️ Все 35 колонок eBA' : '🗂️ Tüm 35 eBA Sütunu'}
          </button>
        </div>

        {/* Workforce & Firm Scope */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setWorkforceScope('active')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                workforceScope === 'active'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? 'Активный штат' : 'Aktif Mevcut'}
            </button>
            <button
              type="button"
              onClick={() => setWorkforceScope('active_pending')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                workforceScope === 'active_pending'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? '+ Ожидающие' : '+ Bekleyenler'}
            </button>
            <button
              type="button"
              onClick={() => setWorkforceScope('all_report')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                workforceScope === 'all_report'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? 'Весь отчет eBA' : 'Tüm eBA Raporu'}
            </button>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFirmFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                firmFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? `Все (${firmCounts.all})` : `Tümü (${firmCounts.all})`}
            </button>
            <button
              type="button"
              onClick={() => setFirmFilter('main')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                firmFilter === 'main'
                  ? 'bg-teal-100 dark:bg-teal-500/25 text-teal-950 dark:text-teal-200 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Pondera ({firmCounts.main})
            </button>
            <button
              type="button"
              onClick={() => setFirmFilter('subcon')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                firmFilter === 'subcon'
                  ? 'bg-amber-100 dark:bg-amber-500/25 text-amber-950 dark:text-amber-200 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'ru' ? `Субподряд (${firmCounts.subcon})` : `Taşeron (${firmCounts.subcon})`}
            </button>
          </div>
        </div>
      </div>

      {/* 6 INTERACTIVE KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* KPI 1: Overall Scan Completion % */}
        <div
          onClick={() => setTierFilter('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
            tierFilter === 'all'
              ? 'bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-400 ring-1 ring-indigo-400/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-indigo-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {lang === 'ru' ? 'Заполненность сканов' : 'Skan Doluluk Oranı'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            %{kpis.overallCompletionPct}
          </div>
          <div className="mt-1.5 w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, kpis.overallCompletionPct)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {kpis.totalUploadedDocs.toLocaleString('tr-TR')} / {kpis.totalReqDocs.toLocaleString('tr-TR')}{' '}
            {lang === 'ru' ? 'сканов' : 'zorunlu skan'}
          </p>
        </div>

        {/* KPI 2: 100% Complete */}
        <div
          onClick={() => setTierFilter(tierFilter === 'complete' ? 'all' : 'complete')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
            tierFilter === 'complete'
              ? 'bg-emerald-50 dark:bg-emerald-950/45 border-emerald-500 ring-2 ring-emerald-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              {lang === 'ru' ? 'Полный архив (100%)' : 'Tam Eksiksiz (%100)'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {kpis.completeCount.toLocaleString('tr-TR')}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'ru' ? 'Все обязат. сканы загружены' : 'Tüm zorunlu skanları tam'}
          </p>
        </div>

        {/* KPI 3: Missing >= 1 Scan */}
        <div
          onClick={() => setTierFilter(tierFilter === 'any_missing' ? 'all' : 'any_missing')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
            tierFilter === 'any_missing'
              ? 'bg-rose-50 dark:bg-rose-950/45 border-rose-500 ring-2 ring-rose-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
              {lang === 'ru' ? 'Есть пропуски сканов' : 'Eksik Skanı Olan'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center">
              <FileWarning className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {kpis.anyMissingCount.toLocaleString('tr-TR')}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'ru' ? 'Минимум 1 обязат. документ' : 'En az 1 zorunlu evrakı eksik'}
          </p>
        </div>

        {/* KPI 4: Critical Identity / Migration Missing */}
        <div
          onClick={() =>
            setTierFilter(tierFilter === 'critical_identity' ? 'all' : 'critical_identity')
          }
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
            tierFilter === 'critical_identity'
              ? 'bg-amber-50 dark:bg-amber-950/45 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
              {lang === 'ru' ? 'Паспорт / Мигр. / РНР' : 'Kimlik & İzin Eksik'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-400 font-mono">
            {kpis.criticalIdentityCount.toLocaleString('tr-TR')}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'ru' ? 'Паспорт, Рег., Мигр., РНР/Патент' : 'Pasaport, İkamet, RNR/Patent'}
          </p>
        </div>

        {/* KPI 5: Critical Contract / 29N / Parmak İzi Missing */}
        <div
          onClick={() =>
            setTierFilter(tierFilter === 'critical_contract' ? 'all' : 'critical_contract')
          }
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
            tierFilter === 'critical_contract'
              ? 'bg-purple-50 dark:bg-purple-950/45 border-purple-500 ring-2 ring-purple-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-purple-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-700 dark:text-purple-400">
              {lang === 'ru' ? 'ТД / Приказ / 29Н' : 'Sözleşme & 29N Eksik'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/80 text-purple-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-purple-700 dark:text-purple-400 font-mono">
            {kpis.criticalContractCount.toLocaleString('tr-TR')}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'ru' ? 'Трудовой дог., Приказ, 29Н, Дакт.' : 'Sözleşme PDF, Emir, 29N, Parmak İzi'}
          </p>
        </div>

        {/* KPI 6: Not in eBA Scan Export */}
        <div
          onClick={() => setTierFilter(tierFilter === 'not_in_report' ? 'all' : 'not_in_report')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
            tierFilter === 'not_in_report'
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-500 ring-2 ring-slate-500/30'
              : 'bg-white dark:bg-[#131C31] border-slate-200/80 dark:border-slate-800 hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              {lang === 'ru' ? 'Нет в отчете eBA' : 'eBA Raporunda Yok'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-700 dark:text-slate-200 font-mono">
            {kpis.notInReportCount.toLocaleString('tr-TR')}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'ru' ? 'Активные без карточки в отчете' : 'Aktif olup raporda çıkmayan'}
          </p>
        </div>
      </div>

      {/* ACTIVE FILTERS PILL BAR */}
      {hasActiveFilters && (
        <div className="px-4 py-2.5 bg-indigo-50/70 dark:bg-[#131F38] border border-indigo-200 dark:border-indigo-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              {lang === 'ru' ? 'Активные фильтры:' : 'Aktif Filtreler:'}
            </span>
            {selectedRegion !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 font-semibold text-slate-800 dark:text-slate-100">
                Bölge: {selectedRegion}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRegion('all');
                    setSelectedProject('all');
                  }}
                  className="hover:text-rose-500 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {selectedProject !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-cyan-200 dark:border-cyan-700 font-semibold text-slate-800 dark:text-slate-100">
                Şantiye: {selectedProject}
                <button
                  type="button"
                  onClick={() => setSelectedProject('all')}
                  className="hover:text-rose-500 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {selectedMissingDocIdx !== -1 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-700 font-bold text-rose-800 dark:text-rose-200">
                Eksik Evrak: {DOC_SCAN_DEFINITIONS[selectedMissingDocIdx]?.labelTr}
                <button
                  type="button"
                  onClick={() => setSelectedMissingDocIdx(-1)}
                  className="hover:text-rose-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {tierFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 font-bold text-amber-900 dark:text-amber-200">
                Durum: {tierFilter}
                <button
                  type="button"
                  onClick={() => setTierFilter('all')}
                  className="hover:text-rose-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={resetAllFilters}
            className="px-3 py-1 rounded-lg bg-rose-100/90 hover:bg-rose-200/80 dark:bg-rose-500/20 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 font-bold text-[11px] cursor-pointer"
          >
            {lang === 'ru' ? 'Сбросить все' : 'Filtreleri Temizle'}
          </button>
        </div>
      )}

      {/* CHARTS ROW 1: Animated Donut + Animated Region Bar + Expandable Şantiye Tree */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 1. ANIMATED DONUT CHART (4 cols) */}
        <div className="lg:col-span-4 p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              {lang === 'ru' ? 'Структура полноты архива' : 'Personel Arşiv Tamamlanma Dağılımı'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === 'ru'
                ? 'Нажмите на сегмент для фильтрации списка'
                : 'Dilime tıklayarak aşağıdaki personel listesini filtreleyin'}
            </p>
          </div>

          <div className="h-64 relative flex items-center justify-center my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  key={`scan-donut-${animWave}-${evalScope}`}
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={92}
                  cornerRadius={5}
                  paddingAngle={2.5}
                  dataKey="count"
                  nameKey="name"
                  isAnimationActive={pieAnimActive}
                  animationBegin={50}
                  animationDuration={880}
                  animationEasing="ease-out"
                  onClick={(entry: any) => {
                    if (entry?.key) {
                      setTierFilter(tierFilter === entry.key ? 'all' : entry.key);
                    }
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  {donutData.map((d) => {
                    const isSelected = tierFilter === d.key;
                    const isDimmed = tierFilter !== 'all' && !isSelected;
                    return (
                      <Cell
                        key={d.key}
                        fill={d.color}
                        opacity={isDimmed ? 0.35 : 1}
                        stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)'}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    const pct =
                      kpis.totalPool > 0 ? Math.round((item.count / kpis.totalPool) * 100) : 0;
                    return (
                      <div className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl text-xs">
                        <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                        <div className="font-mono font-black mt-0.5" style={{ color: item.color }}>
                          {item.count.toLocaleString('tr-TR')} kişi (%{pct})
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center KPI Badge */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-24 h-24 rounded-full bg-slate-50/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700 shadow-inner flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
                <span className="text-xl font-black text-slate-900 dark:text-white font-mono leading-none">
                  %{kpis.overallCompletionPct}
                </span>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mt-1">
                  {lang === 'ru' ? 'Готовность' : 'Genel Doluluk'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Legend Pills */}
          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {donutData.map((d) => {
              const pct = kpis.totalPool > 0 ? Math.round((d.count / kpis.totalPool) * 100) : 0;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setTierFilter(tierFilter === d.key ? 'all' : d.key)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] border transition-all cursor-pointer ${
                    tierFilter === d.key
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 font-bold'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate text-slate-700 dark:text-slate-200">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="truncate">{d.short}</span>
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white ml-1">
                    {d.count.toLocaleString('tr-TR')} <span className="text-[10px] opacity-70">(%{pct})</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. REGION STACKED BAR + EXPANDABLE ŞANTİYE / SITE MATRIX (8 cols) */}
        <div className="lg:col-span-8 p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                {lang === 'ru'
                  ? 'Анализ сканов по регионам и строительным площадкам'
                  : 'Bölge ve Şantiye Bazlı Evrak Skan Karşılaştırması'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'ru'
                  ? 'Сравнение регионов и раскрытие подплощадок (Казань, Свободный, Тобольск, Усть-Луга)'
                  : 'Hangi bölge ve şantiyede eksik skan yoğunluğu var? Bölgeye tıklayarak şantiye kırılımını filtreleyin.'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-bold flex-wrap">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Eksiksiz
              </span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> 1–3 Eksik
              </span>
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> 4+ Eksik
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-400" /> Raporda Yok
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            {/* Animated Stacked Bar Chart by Region */}
            <div className="xl:col-span-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  key={`region-bar-${animWave}-${evalScope}`}
                  data={regionBreakdown}
                  margin={{ top: 10, right: 10, left: -18, bottom: 18 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="region"
                    angle={-14}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 10.5, fill: '#64748b', fontWeight: 600 }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload;
                      return (
                        <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl text-xs space-y-1 min-w-[200px]">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="font-bold text-slate-900 dark:text-white">{label}</span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[10px]">
                              Doluluk: %{row?.completionPct}
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-emerald-600 font-semibold">Tam Eksiksiz:</span>
                            <span className="font-mono font-bold">{row?.complete}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-amber-600 font-semibold">1–3 Evrak Eksik:</span>
                            <span className="font-mono font-bold">{row?.partialMissing}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-rose-600 font-semibold">4+ Evrak Eksik:</span>
                            <span className="font-mono font-bold">{row?.heavyMissing}</span>
                          </div>
                          {row?.notInReport > 0 && (
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-500 font-semibold">eBA Raporunda Yok:</span>
                              <span className="font-mono font-bold">{row?.notInReport}</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="complete"
                    name="Eksiksiz"
                    stackId="reg"
                    fill="#10b981"
                    animationDuration={850}
                    onClick={(d: any) => {
                      if (d?.region) {
                        setSelectedProject('all');
                        setSelectedRegion(selectedRegion === d.region ? 'all' : d.region);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <Bar
                    dataKey="partialMissing"
                    name="1-3 Eksik"
                    stackId="reg"
                    fill="#f59e0b"
                    animationDuration={850}
                    onClick={(d: any) => {
                      if (d?.region) {
                        setSelectedProject('all');
                        setSelectedRegion(selectedRegion === d.region ? 'all' : d.region);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <Bar
                    dataKey="heavyMissing"
                    name="4+ Eksik"
                    stackId="reg"
                    fill="#f43f5e"
                    animationDuration={850}
                    onClick={(d: any) => {
                      if (d?.region) {
                        setSelectedProject('all');
                        setSelectedRegion(selectedRegion === d.region ? 'all' : d.region);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <Bar
                    dataKey="notInReport"
                    name="Raporda Yok"
                    stackId="reg"
                    fill="#94a3b8"
                    radius={[4, 4, 0, 0]}
                    animationDuration={850}
                    onClick={(d: any) => {
                      if (d?.region) {
                        setSelectedProject('all');
                        setSelectedRegion(selectedRegion === d.region ? 'all' : d.region);
                      }
                    }}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Expandable Bölge -> Şantiye / Proje Drilldown List */}
            <div className="xl:col-span-6 space-y-2 max-h-72 overflow-y-auto pr-1">
              {regionBreakdown.map((r) => {
                const hasMultiSites = r.projectsList.length > 1;
                const isExpanded = !!expandedRegions[r.region];
                const isRegSelected = selectedRegion === r.region && selectedProject === 'all';

                return (
                  <div key={r.region} className="space-y-1.5">
                    <div
                      onClick={() => {
                        setSelectedProject('all');
                        setSelectedRegion(isRegSelected ? 'all' : r.region);
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isRegSelected
                          ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-400'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {r.region}
                          </span>
                          {hasMultiSites && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRegions((prev) => ({
                                  ...prev,
                                  [r.region]: !prev[r.region],
                                }));
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-800 dark:text-cyan-300 border border-cyan-500/30 text-[10px] font-bold cursor-pointer"
                            >
                              <Layers className="w-2.5 h-2.5" />
                              <span>
                                {isExpanded ? 'Kapat ▴' : `${r.projectsList.length} Şantiye ▾`}
                              </span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-mono font-bold text-[10px]">
                            %{r.completionPct} Skan
                          </span>
                          <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-xs">
                            {r.missingAny} Eksik
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-700"
                          style={{ width: `${r.completionPct}%` }}
                        />
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span>
                          Tam: <strong className="text-emerald-600 dark:text-emerald-400">{r.complete}</strong> •
                          Eksik: <strong className="text-rose-600 dark:text-rose-400">{r.missingAny}</strong>
                          {r.notInReport > 0 && ` • Raporda Yok: ${r.notInReport}`}
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {r.total} Kişi
                        </span>
                      </div>
                    </div>

                    {hasMultiSites && isExpanded && (
                      <div className="ml-3 pl-2.5 border-l-2 border-cyan-500/40 space-y-1">
                        {r.projectsList.map((p) => {
                          const isProjSelected = selectedProject === p.projeAdi;
                          return (
                            <div
                              key={p.projeAdi}
                              onClick={() => {
                                setSelectedRegion(r.region);
                                setSelectedProject(isProjSelected ? 'all' : p.projeAdi);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                isProjSelected
                                  ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-400 font-bold'
                                  : 'bg-white dark:bg-slate-900/70 border-slate-200/70 dark:border-slate-800 hover:border-cyan-400/60'
                              }`}
                            >
                              <span className="truncate text-slate-800 dark:text-slate-200">
                                {p.projeAdi}
                              </span>
                              <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  %{p.completionPct}
                                </span>
                                <span className="text-rose-600 dark:text-rose-400 font-bold">
                                  {p.missingAny} eksik
                                </span>
                                <span className="text-slate-500">({p.total})</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS ROW 2: DOCUMENT TYPE UPLOADED vs MISSING INTERACTIVE CHART */}
      <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              {lang === 'ru'
                ? 'Загруженные и отсутствующие сканы по типам документов'
                : 'Evrak Türlerine Göre Yüklenen (Uploaded) ve Eksik (-) Skan Analizi'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {lang === 'ru'
                ? 'Нажмите на столбец любого документа, чтобы показать сотрудников без этого скана'
                : 'Herhangi bir evrak çubuğuna tıklayarak o evrak skanı eksik olan personelleri aşağıda anında listeleyin'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'core', tr: 'Ana 14 Evrak', ru: 'Основные 14' },
                { id: 'identity_migration', tr: 'Kimlik & Göç', ru: 'Миграция' },
                { id: 'work_permit', tr: 'Çalışma İzni', ru: 'Разрешения' },
                { id: 'medical_biometric', tr: 'Sağlık & Parmak İzi', ru: 'Медицина' },
                { id: 'hr_contract', tr: 'Sözleşme & İK', ru: 'Договоры' },
                { id: 'exit_archive', tr: 'Çıkış & Arşiv', ru: 'Архив' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDocChartGroup(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  docChartGroup === tab.id
                    ? 'bg-indigo-100 dark:bg-indigo-500/25 text-indigo-950 dark:text-indigo-100 border-indigo-300 dark:border-indigo-500/50'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'ru' ? tab.ru : tab.tr}
              </button>
            ))}
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              key={`doc-bar-${animWave}-${docChartGroup}-${evalScope}`}
              data={filteredDocChartData}
              margin={{ top: 8, right: 12, left: -16, bottom: 28 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="label"
                angle={-22}
                textAnchor="end"
                interval={0}
                tick={{ fontSize: 10.5, fill: '#64748b', fontWeight: 600 }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip
                cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload;
                  return (
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl text-xs space-y-1.5 min-w-[215px]">
                      <div className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1">
                        {item.fullLabel}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-600 font-semibold">Uploaded (Yüklü):</span>
                        <span className="font-mono font-bold">
                          {item.uploaded.toLocaleString('tr-TR')} (%{item.pct})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-600 font-semibold">Eksik (-):</span>
                        <span className="font-mono font-bold">
                          {item.missing.toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <div className="text-[10px] text-indigo-600 dark:text-indigo-400 pt-0.5 font-semibold">
                        Tıklayın → Bu evrakı eksik personelleri filtrele
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="uploaded"
                name="Uploaded (Yüklü)"
                stackId="doc"
                fill="#10b981"
                animationDuration={850}
                onClick={(d: any) => {
                  if (typeof d?.index === 'number') {
                    setSelectedMissingDocIdx(selectedMissingDocIdx === d.index ? -1 : d.index);
                  }
                }}
                className="cursor-pointer"
              />
              <Bar
                dataKey="missing"
                name="Eksik (-)"
                stackId="doc"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                animationDuration={850}
                onClick={(d: any) => {
                  if (typeof d?.index === 'number') {
                    setSelectedMissingDocIdx(selectedMissingDocIdx === d.index ? -1 : d.index);
                  }
                }}
                className="cursor-pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DETAILED EMPLOYEE SCAN MATRIX TABLE */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>
                  {lang === 'ru'
                    ? 'Детальная матрица сканов по сотрудникам'
                    : 'Personel Bazlı Evrak Skan Matrisi & Eksik Detay Listesi'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/90 text-indigo-800 dark:text-indigo-300 text-xs font-mono font-extrabold">
                  {finalFilteredEmployees.length.toLocaleString('tr-TR')} Kişi
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {lang === 'ru'
                  ? 'Нажмите на любую строку, чтобы раскрыть карточку всех 35 документов eBA'
                  : 'Satıra tıklayarak personelin tüm 35 eBA evrak skan kartını kategorili olarak açabilirsiniz'}
              </p>
            </div>

            {/* Matrix Column Count Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 self-start">
              <button
                type="button"
                onClick={() => setMatrixColsMode('core14')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  matrixColsMode === 'core14'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                14 Ana Sütun
              </button>
              <button
                type="button"
                onClick={() => setMatrixColsMode('core8')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  matrixColsMode === 'core8'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                İlk 8 Sütun
              </button>
              <button
                type="button"
                onClick={() => setMatrixColsMode('all35')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  matrixColsMode === 'all35'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Tüm 35 Sütun
              </button>
            </div>
          </div>

          {/* Search & Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === 'ru'
                    ? 'Поиск по таб. №, ФИО, должности, проекту...'
                    : 'Sicil No, Ad Soyad, Kiril Ad, Görev veya Şantiye ara...'
                }
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setSelectedProject('all');
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <option value="all">{lang === 'ru' ? 'Все регионы' : 'Tüm Bölgeler'}</option>
              {regionBreakdown.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.total})
                </option>
              ))}
            </select>

            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <option value="all">{lang === 'ru' ? 'Все площадки' : 'Tüm Şantiyeler / Projeler'}</option>
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={selectedMissingDocIdx}
              onChange={(e) => setSelectedMissingDocIdx(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <option value={-1}>
                {lang === 'ru' ? 'Фильтр: Отсутствующий скан (Все)' : 'Eksik Evrak Filtresi (Tümü)'}
              </option>
              {DOC_SCAN_DEFINITIONS.map((d) => (
                <option key={d.index} value={d.index}>
                  Eksik: {d.labelTr}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 text-[10.5px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                <th className="py-3 px-3 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 min-w-[230px]">
                  {lang === 'ru' ? 'Сотрудник / Таб. №' : 'Personel & Sicil No'}
                </th>
                <th className="py-3 px-3 min-w-[165px]">
                  {lang === 'ru' ? 'Регион / Площадка' : 'Bölge & Şantiye'}
                </th>
                <th className="py-3 px-2.5 min-w-[125px]">
                  {lang === 'ru' ? 'Гражданство / Статус' : 'Uyruk & İzin'}
                </th>
                <th className="py-3 px-2.5 min-w-[130px]">
                  {lang === 'ru' ? 'Полнота' : 'Skan Durumu'}
                </th>
                {visibleDocDefs.map((def) => (
                  <th
                    key={def.index}
                    onClick={() =>
                      setSelectedMissingDocIdx(selectedMissingDocIdx === def.index ? -1 : def.index)
                    }
                    className={`py-2.5 px-1.5 text-center min-w-[64px] cursor-pointer transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/50 ${
                      selectedMissingDocIdx === def.index
                        ? 'bg-rose-100/80 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                        : ''
                    }`}
                    title={`${def.labelTr} — Eksikleri filtrelemek için tıklayın`}
                  >
                    <div className="leading-tight text-[10px]">
                      {lang === 'ru' ? def.shortRu : def.shortTr}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + visibleDocDefs.length}
                    className="py-12 text-center text-slate-500 dark:text-slate-400 font-medium"
                  >
                    {lang === 'ru'
                      ? 'По выбранным фильтрам сотрудники не найдены.'
                      : 'Seçili filtrelere uygun personel kaydı bulunamadı.'}
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const rowKey = `${emp.sicilNo}-${emp.id}`;
                  const isExpanded = expandedEmployeeId === rowKey;
                  const permitMeta =
                    PERMIT_LABELS[emp.permitCategory] || PERMIT_LABELS.OTHER_PENDING;

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => setExpandedEmployeeId(isExpanded ? null : rowKey)}
                        className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        {/* Employee + Sicil */}
                        <td className="py-2.5 px-3 sticky left-0 bg-white dark:bg-[#131C31] z-10 border-r border-slate-100 dark:border-slate-800/70">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                {emp.adSoyad}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  #{emp.sicilNo}
                                </span>
                                <span>•</span>
                                <span className="truncate max-w-[130px]">{emp.gorevi}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Region & Project */}
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-800 dark:text-slate-100 text-[11.5px]">
                            {emp.region}
                          </div>
                          <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                            {emp.projeAdi}
                          </div>
                        </td>

                        {/* Citizenship & Permit */}
                        <td className="py-2.5 px-2.5">
                          <div className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                            {emp.uyruk}
                          </div>
                          <span
                            className={`inline-block mt-0.5 px-2 py-0.5 rounded-md border text-[9.5px] font-bold ${permitMeta.badgeClass}`}
                          >
                            {lang === 'ru' ? permitMeta.ru : permitMeta.tr}
                          </span>
                        </td>

                        {/* Completion Progress */}
                        <td className="py-2.5 px-2.5">
                          {!emp.inScanReport ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[10px] font-bold">
                              eBA Raporunda Yok
                            </span>
                          ) : emp.missingCount === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[10.5px] font-bold font-mono">
                              <CheckCircle2 className="w-3 h-3" />
                              {emp.uploadedReqCount}/{emp.reqTotal} (%100)
                            </span>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between text-[10.5px] font-mono font-bold">
                                <span className="text-rose-600 dark:text-rose-400">
                                  {emp.missingCount} Eksik
                                </span>
                                <span className="text-slate-600 dark:text-slate-400">
                                  {emp.uploadedReqCount}/{emp.reqTotal}
                                </span>
                              </div>
                              <div className="mt-1 w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    emp.completionPct >= 75
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${emp.completionPct}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Per-Document Matrix Cells */}
                        {visibleDocDefs.map((def) => {
                          if (!emp.inScanReport) {
                            return (
                              <td key={def.index} className="py-2 px-1.5 text-center">
                                <span className="text-[10px] text-slate-400 font-mono">?</span>
                              </td>
                            );
                          }

                          const isUploaded = emp.mask[def.index] === '1';
                          const isRequired =
                            evalScope === 'statutory'
                              ? emp.reqSet.has(def.index)
                              : evalScope === 'core8'
                              ? def.isCore8
                              : true;

                          if (isUploaded) {
                            return (
                              <td key={def.index} className="py-2 px-1.5 text-center">
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
                                  title={`${def.labelTr}: Uploaded`}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            );
                          }

                          if (!isRequired) {
                            return (
                              <td key={def.index} className="py-2 px-1.5 text-center">
                                <span
                                  className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9.5px] font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/50"
                                  title={`${def.labelTr}: Bu statü için zorunlu değil (Muaf)`}
                                >
                                  —
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td key={def.index} className="py-2 px-1.5 text-center">
                              <span
                                className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-950/90 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/90"
                                title={`${def.labelTr}: EKSİK (-)`}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </span>
                            </td>
                          );
                        })}
                      </tr>

                      {/* EXPANDED 35-DOCUMENT ARCHIVE CARD */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-900/80">
                          <td colSpan={4 + visibleDocDefs.length} className="p-4">
                            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-500/30 bg-white dark:bg-[#11192C] p-4 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                                <div>
                                  <div className="text-xs font-black text-slate-900 dark:text-white">
                                    {emp.adSoyad}{' '}
                                    {emp.fioKiril && (
                                      <span className="font-normal text-slate-500">
                                        ({emp.fioKiril})
                                      </span>
                                    )}{' '}
                                    — <span className="text-indigo-600 dark:text-indigo-400">#{emp.sicilNo}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Firma: <strong>{emp.firma}</strong> • Departman:{' '}
                                    <strong>{emp.departman}</strong> • İşe Giriş:{' '}
                                    <strong>{emp.iseGirisTarihi}</strong> • Durum:{' '}
                                    <strong>{emp.guncelDurum}</strong>
                                  </div>
                                </div>

                                {onNavigateToPersonnel && emp.id > 0 && (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      onNavigateToPersonnel('search', emp.sicilNo);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-500/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 text-indigo-950 dark:text-indigo-100 text-[11px] font-bold cursor-pointer self-start"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Personel Kartına Git</span>
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                                {(Object.keys(DOC_SCAN_GROUPS) as DocScanGroupKey[]).map((gKey) => {
                                  const gInfo = DOC_SCAN_GROUPS[gKey];
                                  const defs = DOC_SCAN_DEFINITIONS.filter((d) => d.group === gKey);
                                  return (
                                    <div
                                      key={gKey}
                                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                                    >
                                      <div
                                        className="text-[10.5px] font-extrabold uppercase tracking-wide pb-1 border-b border-slate-200/70 dark:border-slate-800"
                                        style={{ color: gInfo.color }}
                                      >
                                        {lang === 'ru' ? gInfo.labelRu : gInfo.labelTr}
                                      </div>
                                      <div className="space-y-1">
                                        {defs.map((d) => {
                                          const up = emp.inScanReport && emp.mask[d.index] === '1';
                                          const req = emp.reqSet.has(d.index);
                                          return (
                                            <div
                                              key={d.index}
                                              className="flex items-center justify-between text-[11px] gap-1"
                                            >
                                              <span className="truncate text-slate-700 dark:text-slate-300">
                                                {lang === 'ru' ? d.shortRu : d.labelTr}
                                              </span>
                                              {up ? (
                                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[9.5px] shrink-0">
                                                  Uploaded
                                                </span>
                                              ) : req ? (
                                                <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-bold text-[9.5px] shrink-0">
                                                  EKSİK
                                                </span>
                                              ) : (
                                                <span className="text-[9.5px] text-slate-400 shrink-0">
                                                  —
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3.5 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Toplam <strong>{finalFilteredEmployees.length.toLocaleString('tr-TR')}</strong> kayıttan{' '}
            <strong>
              {finalFilteredEmployees.length === 0 ? 0 : (page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, finalFilteredEmployees.length)}
            </strong>{' '}
            arası gösteriliyor
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold disabled:opacity-40 cursor-pointer"
            >
              Önceki
            </button>
            <span className="px-3 py-1.5 font-mono font-bold text-slate-900 dark:text-white">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold disabled:opacity-40 cursor-pointer"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

