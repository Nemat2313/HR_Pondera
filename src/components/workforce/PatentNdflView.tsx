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
  label_ru?: string;
  receipt_1c_entered?: number;
  receipt_1c_items?: Array<{ number: string; date: string; opDate: string; amount: number; comment: string }>;
  patent_paid: number;
  ndfl_calc: number;
  offset_used: number;
  ndfl_withheld: number;
  unoffset_gap: number;
  is_notif_month?: boolean;
  is_after_notif?: boolean;
  status_code?: string;
  analysis_note?: string;
  analysis_note_ru?: string;
}

type RootCauseKey =
  | 'NO_NOTIFICATION'
  | 'LATE_NOTIFICATION'
  | 'LATE_RECEIPT_ENTRY'
  | 'DISMISSED_UNRECOVERED'
  | 'REGION_CHANGED'
  | 'LOW_NDFL'
  | 'FULL_OFFSET';

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
  root_cause?: RootCauseKey;
  has_late_1c_entry?: boolean;
  avg_monthly_ndfl?: number;
  expected_remaining_ndfl?: number;
  payroll_absorbable?: number;
  guaranteed_vozvrat?: number;
  months?: EmployeeMonthRow[];
  missing_months?: Array<{ month: number; label: string; label_ru?: string; gap: number; phase?: string }>;
  missing_receipt_months?: Array<{ month: number; label: string; label_ru?: string }>;
  receipts?: Array<{ number: string; date: string; opDate: string; amount: number; comment: string; months: number[] }>;
  patent_info?: { patent_no: string; patent_start: string; patent_end: string; payment_day: number } | null;
  source_file: string;
}

const CAUSE_META: Record<
  RootCauseKey,
  {
    group: 'A' | 'B' | 'OK';
    label: string;
    labelRu: string;
    short: string;
    shortRu: string;
    cls: string;
    barCls: string;
    hint: string;
    hintRu: string;
  }
> = {
  REGION_CHANGED: {
    group: 'A',
    label: 'Bölge Değişikliği (Plan Dışı)',
    labelRu: 'Смена региона (вне плана зачёта)',
    short: 'Bölge Değişikliği',
    shortRu: 'Смена региона',
    cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
    barCls: 'bg-slate-500',
    hint: 'Yılda sadece 1 bölge izni verilir — mahsup planından çıkarıldı',
    hintRu: 'Уведомление ФНС выдаётся на 1 регион в год — исключено из плана',
  },
  LOW_NDFL: {
    group: 'A',
    label: 'НДФЛ Yetersiz (Avans > НДФЛ)',
    labelRu: 'Недостаточно НДФЛ (аванс > НДФЛ)',
    short: 'НДФЛ Yetersiz',
    shortRu: 'Мало НДФЛ',
    cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    barCls: 'bg-amber-500',
    hint: 'Muhasebe hatası değil; ст. 227.1 п. 7 gereği НДФЛ üstü avans iade edilmez',
    hintRu: 'Не ошибка бухгалтерии: по п. 7 ст. 227.1 НК РФ превышение аванса не возвращается',
  },
  NO_NOTIFICATION: {
    group: 'B',
    label: 'Acil: ФНС İzni Alınmamış',
    labelRu: 'Срочно: нет уведомления ФНС',
    short: 'ФНС İzni Yok',
    shortRu: 'Нет увед. ФНС',
    cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    barCls: 'bg-rose-500',
    hint: 'Muhasebe acil İFNS başvurusu yapmalı / ТКС kontrol etmeli',
    hintRu: 'Бухгалтерии срочно подать КНД 1110055 в ИФНС / проверить ТКС',
  },
  LATE_NOTIFICATION: {
    group: 'B',
    label: 'ФНС İzni Geç Alınmış',
    labelRu: 'Уведомление ФНС получено поздно',
    short: 'Geç ФНС İzni',
    shortRu: 'Позднее увед.',
    cls: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
    barCls: 'bg-indigo-500',
    hint: 'İzin öncesi aylarda kesilen НДФЛ kalan aylarda mahsup veya Возврат (ст. 231) edilmeli',
    hintRu: 'НДФЛ до уведомления подлежит зачёту до конца года или возврату по ст. 231 НК РФ',
  },
  LATE_RECEIPT_ENTRY: {
    group: 'B',
    label: 'Fişler 1C\'ye Geç Girilmiş',
    labelRu: 'Чеки внесены в 1С с опозданием',
    short: 'Geç 1C Fiş Girişi',
    shortRu: 'Поздний ввод чеков',
    cls: 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700',
    barCls: 'bg-orange-500',
    hint: 'İzin varken fişler 1C\'ye geç işlendiği için mahsup kaçırılmış — kalan aylarda/Возврат ile alınmalı',
    hintRu: 'Уведомление было, но чеки ввели в 1С позже — оформить дозачёт или возврат по ст. 231',
  },
  DISMISSED_UNRECOVERED: {
    group: 'B',
    label: 'Çıkışlı — İade Alınmadan Gönderilmiş',
    labelRu: 'Уволен без возврата НДФЛ (потеря)',
    short: 'Çıkışlı (İade Edilemez)',
    shortRu: 'Уволен (невозвр.)',
    cls: 'bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-300 dark:border-fuchsia-700',
    barCls: 'bg-fuchsia-500',
    hint: 'Çıkış öncesi Возврат yapılmadan gönderilmiş — işveren üzerinden geri alınamaz',
    hintRu: 'Сотрудник уволен без возврата по ст. 231 — возврат через работодателя невозможен',
  },
  FULL_OFFSET: {
    group: 'OK',
    label: 'Tam Mahsup Edildi (%100)',
    labelRu: 'Полностью зачтено (100%)',
    short: 'Tam Mahsup',
    shortRu: 'Полный зачёт',
    cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    barCls: 'bg-emerald-500',
    hint: 'Sorun yok, avans tamamen mahsup edildi',
    hintRu: 'Без замечаний, аванс полностью зачтён',
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
  const isRu = lang === 'ru';
  const L = (tr: string, ru: string) => (isRu ? ru : tr);

  const [activeTab, setActiveTab] = useState<'overview' | 'reconciliation' | 'notifications' | 'vozvrat' | 'import_odata'>('overview');
  const [vozvratOnlyGuaranteed, setVozvratOnlyGuaranteed] = useState(true);
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
      LATE_NOTIFICATION: 0,
      LATE_RECEIPT_ENTRY: 0,
      DISMISSED_UNRECOVERED: 0,
      REGION_CHANGED: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    },
    causeRub: {
      NO_NOTIFICATION: 0,
      LATE_NOTIFICATION: 0,
      LATE_RECEIPT_ENTRY: 0,
      DISMISSED_UNRECOVERED: 0,
      REGION_CHANGED: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    },
    groupA: { count: 0, rub: 0 },
    groupB: { count: 0, rub: 0 },
    vozvratForecast: {
      remainingMonths: 1,
      activeEligibleCount: 0,
      activeEligibleRub: 0,
      payrollAbsorbableRub: 0,
      guaranteedVozvratCount: 0,
      guaranteedVozvratRub: 0,
      dismissedLostCount: 0,
      dismissedLostRub: 0,
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
  const [causeFilter, setCauseFilter] = useState<'all' | RootCauseKey>('all');
  const [bandFilter, setBandFilter] = useState<'all' | '100' | '80_99' | '50_79' | '1_49' | '0'>('all');
  const [visibleCount, setVisibleCount] = useState(150);

  // OData config
  const [odataUrl, setOdataUrl] = useState('');
  const [odataUser, setOdataUser] = useState('');
  const [odataPass, setOdataPass] = useState('');
  const [odataOrg, setOdataOrg] = useState('');
  const [odataLastSync, setOdataLastSync] = useState('');
  const [odataBusy, setOdataBusy] = useState(false);

  // Direct 1C OData Receipt Creation (Document_АвансовыйПлатежИностранцаПоНДФЛ)
  const [newRcEmp, setNewRcEmp] = useState<string | null>(null);
  const [newRcAmount, setNewRcAmount] = useState('24000');
  const [newRcOpDate, setNewRcOpDate] = useState(new Date().toISOString().slice(0, 10));
  const [newRcComment, setNewRcComment] = useState('август-сентябрь-октябрь');
  const [newRcBusy, setNewRcBusy] = useState(false);
  const [lastCreated1cDoc, setLastCreated1cDoc] = useState<{ refKey: string; number: string; fullName: string } | null>(null);

  const handleCreate1cReceipt = async (fullName: string) => {
    setNewRcBusy(true);
    try {
      const res = await fetch('/api/patent-ndfl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          action: 'create_1c_receipt',
          fullName,
          taxYear,
          amount: Number(newRcAmount) || 0,
          opDate: newRcOpDate,
          comment: newRcComment,
          postDoc: true,
        }),
      });
      const data = await res.json();
      setFeedback({ type: data?.success ? 'success' : 'error', text: data?.message || '1C fiş oluşturma sonucu' });
      if (data?.success && data?.refKey) {
        setLastCreated1cDoc({ refKey: data.refKey, number: data.number || '', fullName });
        setNewRcEmp(null);
      }
    } catch {
      setFeedback({ type: 'error', text: '1C fiş gönderme hatası.' });
    } finally {
      setNewRcBusy(false);
    }
  };

  const handleDelete1cReceipt = async (refKey: string) => {
    setNewRcBusy(true);
    try {
      const res = await fetch('/api/patent-ndfl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'delete_1c_receipt', refKey }),
      });
      const data = await res.json();
      setFeedback({ type: data?.success ? 'info' : 'error', text: data?.message || '1C fiş silme sonucu' });
      if (data?.success) setLastCreated1cDoc(null);
    } catch {
      setFeedback({ type: 'error', text: '1C fiş silme hatası.' });
    } finally {
      setNewRcBusy(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifPdfInputRef = useRef<HTMLInputElement>(null);
  const bulkReceiptInputRef = useRef<HTMLInputElement>(null);

  // Bulk Patent Receipt Scan (PDF/ZIP -> AI OCR -> Bulk Push to 1C as Draft/Posted)
  interface ScannedReceiptItem {
    id: string;
    page: number;
    source_chunk: string;
    full_name: string;
    raw_name: string;
    matched_in_1c: boolean;
    tabel_no: string;
    inn: string;
    op_date: string;
    amount: number;
    kbk: string;
    kbk_ok: boolean;
    suip: string;
    is_duplicate: boolean;
    suggested_comment: string;
    selected: boolean;
    push_status?: 'idle' | 'pushing' | 'posted' | 'draft' | 'error';
    push_message?: string;
    ref_key?: string;
    doc_number?: string;
    receipt_file_id?: string;
    receipt_file_url?: string;
    attached_in_1c?: boolean;
    attach_message?: string;
  }
  const [scannedReceipts, setScannedReceipts] = useState<ScannedReceiptItem[]>([]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [bulkPushBusy, setBulkPushBusy] = useState(false);

  const handleBulkReceiptUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setScanBusy(true);
    setScanError('');
    setScanModalOpen(true);
    setScannedReceipts([]);
    try {
      const allItems: ScannedReceiptItem[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('mode', 'scan_receipts');
        fd.append('taxYear', String(taxYear));
        fd.append('file', f);
        const res = await fetch('/api/patent-ndfl', {
          method: 'POST',
          headers: { ...getAuthHeaders() },
          body: fd,
        });
        const data = await res.json();
        if (data?.success && Array.isArray(data.receipts)) {
          allItems.push(...data.receipts);
        } else {
          const msg = data?.message || `${f.name} okunamadı.`;
          setScanError(msg);
          setFeedback({ type: 'error', text: msg });
        }
      }
      setScannedReceipts(allItems);
      if (allItems.length > 0) {
        setFeedback({
          type: 'success',
          text: L(
            `${allItems.length} patent ödeme fişi AI OCR ile okundu. Kontrol edip 1C'ye gönderebilirsiniz.`,
            `Распознано чеков по патентам (AI OCR): ${allItems.length}. Проверьте и отправьте в 1С.`
          ),
        });
      }
    } catch {
      setFeedback({ type: 'error', text: L('Fiş tarama hatası.', 'Ошибка распознавания чеков.') });
    } finally {
      setScanBusy(false);
      if (bulkReceiptInputRef.current) bulkReceiptInputRef.current.value = '';
    }
  };

  const handleBulkPushTo1c = async () => {
    const targets = scannedReceipts.filter((r) => r.selected && r.push_status !== 'posted' && r.push_status !== 'draft');
    if (targets.length === 0) return;
    setBulkPushBusy(true);
    let okCount = 0;
    let draftCount = 0;
    let errCount = 0;
    for (const item of targets) {
      setScannedReceipts((prev) => prev.map((x) => (x.id === item.id ? { ...x, push_status: 'pushing' } : x)));
      try {
        const res = await fetch('/api/patent-ndfl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            action: 'create_1c_receipt',
            fullName: item.full_name,
            taxYear,
            amount: Number(item.amount) || 0,
            opDate: item.op_date,
            comment: item.suggested_comment,
            postDoc: true,
            receiptFileId: item.receipt_file_id || undefined,
          }),
        });
        const data = await res.json();
        if (data?.success) {
          if (data.posted) okCount++;
          else draftCount++;
          setScannedReceipts((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    push_status: data.posted ? 'posted' : 'draft',
                    push_message: data.message,
                    ref_key: data.refKey,
                    doc_number: data.number,
                    attached_in_1c: Boolean(data.attachedIn1C),
                    attach_message: data.attachMessage || '',
                  }
                : x
            )
          );
        } else {
          errCount++;
          setScannedReceipts((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, push_status: 'error', push_message: data?.message || 'Hata' } : x))
          );
        }
      } catch {
        errCount++;
        setScannedReceipts((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, push_status: 'error', push_message: 'Ağ hatası' } : x))
        );
      }
    }
    setBulkPushBusy(false);
    setFeedback({
      type: errCount === 0 ? 'success' : 'info',
      text: L(
        `1C aktarımı tamamlandı: ${okCount} onaylı (Проведён), ${draftCount} taslak (Черновик), ${errCount} hata.`,
        `Отправка в 1С завершена: проведено ${okCount}, черновиков ${draftCount}, ошибок ${errCount}.`
      ),
    });
  };

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
      if (activeTab === 'vozvrat') {
        if (!r.is_active || Number(r.additional_offset_potential || 0) <= 0 || r.root_cause === 'REGION_CHANGED') return false;
        if (vozvratOnlyGuaranteed && Number(r.guaranteed_vozvrat || 0) <= 0) return false;
      } else {
        if (activeFilter === 'active' && !r.is_active) return false;
        if (activeFilter === 'dismissed' && r.is_active) return false;
      }
      if (activeTab === 'reconciliation') {
        if (causeFilter !== 'all' && r.root_cause !== causeFilter) return false;
        if (bandFilter !== 'all') {
          const adv = Number(r.patent_advances || 0);
          const used = Number(r.patent_offset_used || 0);
          const pct = adv > 0 ? (used / adv) * 100 : 0;
          if (bandFilter === '100' && pct < 99.5) return false;
          if (bandFilter === '80_99' && !(pct >= 80 && pct < 99.5)) return false;
          if (bandFilter === '50_79' && !(pct >= 50 && pct < 80)) return false;
          if (bandFilter === '1_49' && !(pct > 0 && pct < 50)) return false;
          if (bandFilter === '0' && pct > 0) return false;
        }
        if (notifFilter === 'no_notif' && r.has_notification) return false;
        if (notifFilter === 'with_notif' && !r.has_notification) return false;
        if (notifFilter === 'has_potential' && Number(r.additional_offset_potential || 0) <= 0) return false;
        if (notifFilter === 'zero_offset' && !(Number(r.patent_advances || 0) > 0 && Number(r.patent_offset_used || 0) === 0)) return false;
      }
      if (q) {
        const hay = `${r.tabel_no} ${r.full_name} ${r.citizenship} ${r.site_name} ${r.notification_no} ${r.ifns_code} ${r.priority_label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, activeFilter, notifFilter, causeFilter, bandFilter, activeTab, vozvratOnlyGuaranteed]);

  const handlePrintVozvratKit = () => {
    const targets = filteredRecords.filter((r) => r.is_active && Number(r.additional_offset_potential || 0) > 0);
    if (targets.length === 0) {
      setFeedback({ type: 'error', text: L('Yazdırılacak aktif Возврат adayı bulunamadı.', 'Нет активных сотрудников для печати комплекта на возврат.') });
      return;
    }
    const todayDot = new Date().toLocaleDateString('ru-RU');
    const pages = targets
      .map((r) => {
        const amt = vozvratOnlyGuaranteed ? Number(r.guaranteed_vozvrat || 0) : Number(r.additional_offset_potential || 0);
        return `
        <div class="page">
          <div class="header-right">
            <div>Генеральному директору ${xmlOrgName}</div>
            <div>${xmlDirectorDative}</div>
            <div style="margin-top:8px;">от <strong>${r.full_name}</strong></div>
            <div>Табельный №: ${r.tabel_no || '__________'}</div>
          </div>
          <h2>ЗАЯВЛЕНИЕ<br/><span style="font-size:12px;font-weight:400;">о возврате излишне удержанного НДФЛ (в порядке ст. 231 НК РФ)</span></h2>
          <p>В соответствии со статьей 231 Налогового кодекса Российской Федерации и на основании Уведомления ИФНС № <strong>${r.notification_no || '_______'}</strong> от <strong>${r.notification_date || '__________'}</strong> (Код ИФНС: ${r.ifns_code || xmlKodNO}) прошу произвести возврат излишне удержанной за ${taxYear} год суммы налога на доходы физических лиц (НДФЛ) в размере <strong>${Math.round(amt).toLocaleString('ru-RU')} руб. 00 коп.</strong> в связи с уплатой мною фиксированных авансовых платежей по патенту.</p>
          <p>Денежные средства прошу перечислить в безналичном порядке на мой банковский счет по следующим реквизитам (выплата наличными не допускается согласно п. 1 ст. 231 НК РФ):</p>
          <table class="req">
            <tr><td>Получатель (ФИО):</td><td>${r.full_name}</td></tr>
            <tr><td>Наименование банка:</td><td>________________________________________________</td></tr>
            <tr><td>БИК банка:</td><td>______________________</td></tr>
            <tr><td>Расчетный счет (20 знаков):</td><td>________________________________________________</td></tr>
            <tr><td>Корреспондентский счет:</td><td>________________________________________________</td></tr>
          </table>
          <p style="font-size:11px;color:#444;">Приложение: копии квитанций об уплате фиксированных авансовых платежей по патенту за ${taxYear} год.</p>
          <div class="sig">
            <span>Дата: «____» ____________ ${taxYear} г.</span>
            <span>Подпись: _______________ / ${r.full_name} /</span>
          </div>
          <hr style="margin:26px 0;border:none;border-top:1px dashed #999;" />
          <div style="font-size:11.5px;">
            <div style="text-align:center;font-weight:700;margin-bottom:8px;">УВЕДОМЛЕНИЕ РАБОТОДАТЕЛЯ О ФАКТЕ ИЗЛИШНЕГО УДЕРЖАНИЯ НДФЛ (п. 1 ст. 231 НК РФ)</div>
            <p>${xmlOrgName} (ИНН ${xmlInnUl}, КПП ${xmlKpp}) настоящим уведомляет работника <strong>${r.full_name}</strong> о факте излишнего удержания НДФЛ за ${taxYear} налоговый период в сумме <strong>${Math.round(amt).toLocaleString('ru-RU')} руб. 00 коп.</strong> Просим представить заявление на возврат с указанием банковских реквизитов.</p>
            <div class="sig" style="margin-top:14px;">
              <span>Дата вручения: ${todayDot}</span>
              <span>Ознакомлен(а): _______________ / ${r.full_name} /</span>
            </div>
          </div>
        </div>`;
      })
      .join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Возврат НДФЛ — Комплект документов (${taxYear})</title><style>
      body{font-family:"Times New Roman",serif;font-size:13px;line-height:1.45;color:#111;margin:0;padding:0}
      .page{padding:24px 36px;page-break-after:always}
      .header-right{width:54%;margin-left:auto;text-align:left;margin-bottom:18px;font-size:12.5px}
      h2{text-align:center;font-size:15px;margin:14px 0}
      p{text-indent:28px;text-align:justify;margin:8px 0}
      table.req{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
      table.req td{border:1px solid #999;padding:5px 8px}
      .sig{display:flex;justify-content:space-between;margin-top:24px;font-size:12.5px}
      @media print{.page{page-break-after:always}}
    </style></head><body>${pages}<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const handleExportVozvratReestr = () => {
    const rows = filteredRecords.map((r) => ({
      'Табельный № / Sicil': r.tabel_no,
      'ФИО / Ad Soyad': r.full_name,
      'Дата приема / İşe Giriş': r.hire_date || '',
      'Уведомление ФНС №': r.notification_no || '',
      'Дата уведомления': r.notification_date || '',
      'Код ИФНС': r.ifns_code || '',
      'Оплачено патента (₽)': r.patent_advances,
      'Зачтено (₽)': r.patent_offset_used,
      'Общий потенциал (₽)': r.additional_offset_potential,
      'Средний НДФЛ/мес (₽)': r.avg_monthly_ndfl || 0,
      'Прогноз НДФЛ до конца года (₽)': r.expected_remaining_ndfl || 0,
      'Зачтётся в зарплате (₽)': r.payroll_absorbable || 0,
      'ОБЯЗАТЕЛЬНЫЙ ВОЗВРАТ ст. 231 (₽)': r.guaranteed_vozvrat || 0,
      'Причина / Kök Neden': isRu ? CAUSE_META[r.root_cause || 'LATE_NOTIFICATION']?.labelRu : CAUSE_META[r.root_cause || 'LATE_NOTIFICATION']?.label,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Reestr_Vozvrat_${taxYear}`);
    XLSX.writeFile(wb, `Reestr_Vozvrat_NDFL_st231_${taxYear}.xlsx`);
  };

  const analytics = useMemo(() => {
    const IFNS_REGION_NAMES: Record<string, { tr: string; ru: string }> = {
      '47': { tr: '47 · Leningrad Obl.', ru: '47 · Ленинградская обл.' },
      '78': { tr: '78 · St. Petersburg', ru: '78 · Санкт-Петербург' },
      '77': { tr: '77 · Moskova', ru: '77 · Москва' },
      '50': { tr: '50 · Moskova Obl.', ru: '50 · Московская обл.' },
      '16': { tr: '16 · Tatarstan', ru: '16 · Татарстан' },
      '28': { tr: '28 · Amur Obl.', ru: '28 · Амурская обл.' },
      '72': { tr: '72 · Tyumen Obl.', ru: '72 · Тюменская обл.' },
      '38': { tr: '38 · İrkutsk Obl.', ru: '38 · Иркутская обл.' },
      '51': { tr: '51 · Murmansk Obl.', ru: '51 · Мурманская обл.' },
      '52': { tr: '52 · Nijniy Novgorod', ru: '52 · Нижегородская обл.' },
    };
    const byCit = new Map<string, { name: string; count: number; advances: number; used: number; potential: number; noNotif: number }>();
    const bySite = new Map<string, { name: string; count: number; advances: number; used: number; potential: number; noNotif: number }>();
    const byRegion = new Map<string, { code: string; name: string; count: number; advances: number; used: number; potential: number }>();
    for (const r of records) {
      const cit = (r.citizenship || 'Belirtilmemiş').trim();
      const site = (r.site_name || r.region || r.org_name || 'Genel').trim();
      const ifnsPref = String(r.ifns_code || '').trim().slice(0, 2);
      const regMeta = IFNS_REGION_NAMES[ifnsPref];
      const regKey = ifnsPref || 'NONE';
      const regLabel = regMeta
        ? isRu
          ? regMeta.ru
          : regMeta.tr
        : ifnsPref
        ? `${ifnsPref} · İFNS ${r.ifns_code}`
        : r.region || (isRu ? 'Без ИФНС' : 'Bildirimsiz');

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

      const rc = byRegion.get(regKey) || { code: ifnsPref, name: regLabel, count: 0, advances: 0, used: 0, potential: 0 };
      rc.count++;
      rc.advances += Number(r.patent_advances || 0);
      rc.used += Number(r.patent_offset_used || 0);
      rc.potential += Number(r.additional_offset_potential || 0);
      byRegion.set(regKey, rc);
    }
    return {
      byCit: Array.from(byCit.values()).sort((a, b) => b.count - a.count).slice(0, 8),
      bySite: Array.from(bySite.values()).sort((a, b) => b.potential - a.potential || b.count - a.count).slice(0, 12),
      byRegion: Array.from(byRegion.values()).sort((a, b) => b.advances - a.advances).slice(0, 10),
    };
  }, [records, isRu]);

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
          '1C Fiş Girişi (₽)': m.receipt_1c_entered || 0,
          '1C Fiş Detayı': (m.receipt_1c_items || []).map((rc) => `${rc.date}: ${rc.amount}₽${rc.comment ? ` (${rc.comment})` : ''}`).join(' | '),
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
              label: L('1. Patent İade Özeti', '1. Сводка возврата патентов'),
              badge: summary.totalEmployees,
              icon: <TrendingUp className="w-3.5 h-3.5" />,
            },
            {
              id: 'reconciliation',
              label: L('2. Kişi Bazlı Detay', '2. Детализация по сотрудникам'),
              badge: summary.totalEmployees,
              icon: <Receipt className="w-3.5 h-3.5" />,
            },
            {
              id: 'notifications',
              label: L('3. ФНС Bildirim Takip', '3. Уведомления ФНС'),
              badge: summary.noNotifTotal,
              icon: <ShieldAlert className="w-3.5 h-3.5" />,
            },
            {
              id: 'vozvrat',
              label: L('4. Возврат НДФЛ (İade Dosyası)', '4. Возврат НДФЛ (ст. 231 НК РФ)'),
              badge: summary.vozvratForecast?.guaranteedVozvratCount || summary.vozvratActiveCount || 0,
              icon: <RotateCcw className="w-3.5 h-3.5" />,
            },
            {
              id: 'import_odata',
              label: L('5. 1C OData & Mevzuat', '5. 1С OData и Регламент'),
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
                onClick={() => bulkReceiptInputRef.current?.click()}
                disabled={scanBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>{scanBusy ? L('Fişler Okunuyor...', 'Чтение чеков...') : L('Fiş Yükle (PDF / ZIP → 1C)', 'Загрузить чеки (PDF / ZIP → 1С)')}</span>
              </button>
              <input
                ref={bulkReceiptInputRef}
                type="file"
                multiple
                accept=".pdf,.zip,.jpg,.jpeg,.png"
                onChange={(e) => handleBulkReceiptUpload(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? L('Yükleniyor...', 'Загрузка...') : L('1C / МЭС Excel Yükle', 'Загрузить Excel 1С / МЭС')}</span>
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
              <p className="text-[11px] text-slate-500 dark:text-slate-300">{L(`Toplam Ödenen Patent (${taxYear})`, `Всего оплачено по патентам (${taxYear})`)}</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5 font-mono">{fmtRub(summary.totalAdvances)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{summary.totalEmployees} {L('patentli personel', 'сотр. с патентом')}</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-emerald-950/20">
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{L('Vergiden Mahsup Edilen (Зачтено)', 'Зачтено в счёт НДФЛ')}</p>
              <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">{fmtRub(summary.totalOffsetUsed)}</p>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">{L('Mahsup Oranı', 'Доля зачёта')}: %{summary.offsetPct}</p>
            </div>
            <div className="p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/30 dark:bg-amber-950/20">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">{L('Mahsup Edilmeyen Kalan', 'Незачтённый остаток аванса')}</p>
              <p className="text-lg font-semibold text-amber-600 dark:text-amber-400 mt-0.5 font-mono">{fmtRub(summary.totalBalance)}</p>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                {L('Çalışan/Mevzuat', 'Сотрудник/закон')}: {fmtRub(summary.groupA?.rub || 0)}
              </p>
            </div>
            <div
              onClick={() => {
                setVozvratOnlyGuaranteed(true);
                setActiveTab('vozvrat');
              }}
              className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/40 dark:bg-indigo-950/30 cursor-pointer hover:ring-1 hover:ring-indigo-400 transition"
            >
              <p className="text-[11px] text-indigo-800 dark:text-indigo-300">{L('Kesin Возврат (ст. 231 НК РФ)', 'Обязательный возврат (ст. 231)')}</p>
              <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 font-mono">
                {fmtRub(summary.vozvratForecast?.guaranteedVozvratRub || 0)}
              </p>
              <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                {summary.vozvratForecast?.guaranteedVozvratCount || 0} {L('aktif kişi', 'акт. сотр.')} · {L('Toplam aktif', 'Всего акт.')}: {fmtRub(summary.activePotential)}
              </p>
            </div>
            <div
              onClick={() => setActiveTab('notifications')}
              className="p-3.5 rounded-2xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/30 cursor-pointer hover:ring-1 hover:ring-rose-400 transition"
            >
              <p className="text-[11px] text-rose-800 dark:text-rose-300">{L('ФНС İzni Eksik / Çıkışlı Kayıp', 'Нет увед. ФНС / Потери уволенных')}</p>
              <p className="text-lg font-semibold text-rose-600 dark:text-rose-400 mt-0.5 font-mono">{summary.noNotifTotal}</p>
              <p className="text-[10px] text-rose-700/80 dark:text-rose-300/80 mt-0.5">
                {L('Çıkışlı kayıp', 'Уволены без возвр.')}: {summary.vozvratDismissedCount} ({fmtRub(summary.vozvratDismissedRub)})
              </p>
            </div>
          </div>

          {/* TAB 1: PATENT IADE OZETI (CHARTS + TWO-GROUP ROOT CAUSE + DRILL-DOWN) */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {summary.totalEmployees === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-indigo-500 opacity-70" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {L(`${taxYear} yılı için henüz Patent & НДФЛ verisi yüklenmemiş`, `Нет данных по патентам и НДФЛ за ${taxYear} год`)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                    {L(
                      'Sağ üstteki 1C / МЭС Excel Yükle butonuyla verileri yükleyebilir veya 5. 1C OData sekmesinden canlı çekebilirsiniz.',
                      'Загрузите отчёт 1С Excel сверху справа или подключите 1С OData на вкладке 5.'
                    )}
                  </p>
                </div>
              ) : (
                <>
                  {/* ROW 1: DONUT CHART + TWO-GROUP ROOT-CAUSE BAR CHARTS (CLICKABLE DRILL-DOWN TO TAB 2) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Speedometer Gauge Card */}
                    <div className="lg:col-span-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-2.5">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {L(`Genel Patent Mahsup Hız Göstergesi (${taxYear})`, `Индикатор зачёта патентов (${taxYear})`)}
                        </h3>
                        <p className="text-[10.5px] text-slate-500">
                          {L('Ödenen patentin vergiden mahsup gerçekleşme oranı', 'Фактическая доля зачёта оплаченных патентов')}
                        </p>
                      </div>
                      {(() => {
                        const pct = Math.max(0, Math.min(100, Number(summary.offsetPct || 0)));
                        // Needle angle: -90 deg (0%) to +90 deg (100%)
                        const needleDeg = -90 + (pct / 100) * 180;
                        const gaugeColor = pct >= 80 ? '#10b981' : pct >= 55 ? '#f59e0b' : '#f43f5e';
                        // Semi-circle path radius = 92, center = (140, 128), circumference/2 = pi * 92 = 289.03
                        const semiLen = Math.PI * 92;
                        const activeLen = (pct / 100) * semiLen;
                        return (
                          <div className="flex flex-col items-center">
                            <svg viewBox="0 0 280 156" className="w-full max-w-[270px] h-auto overflow-visible">
                              <defs>
                                <linearGradient id="speedoGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#f43f5e" />
                                  <stop offset="50%" stopColor="#f59e0b" />
                                  <stop offset="100%" stopColor="#10b981" />
                                </linearGradient>
                              </defs>
                              {/* Background Track */}
                              <path
                                d="M 48 128 A 92 92 0 0 1 232 128"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="18"
                                strokeLinecap="round"
                                className="text-slate-200 dark:text-slate-800"
                              />
                              {/* Active Colored Arc */}
                              <path
                                d="M 48 128 A 92 92 0 0 1 232 128"
                                fill="none"
                                stroke="url(#speedoGrad)"
                                strokeWidth="18"
                                strokeLinecap="round"
                                strokeDasharray={`${activeLen} ${semiLen}`}
                              />
                              {/* Scale Labels */}
                              <text x="36" y="146" fontSize="10" className="fill-slate-400 font-mono" textAnchor="middle">0%</text>
                              <text x="70" y="54" fontSize="9.5" className="fill-slate-400 font-mono" textAnchor="middle">25%</text>
                              <text x="140" y="24" fontSize="9.5" className="fill-slate-400 font-mono" textAnchor="middle">50%</text>
                              <text x="210" y="54" fontSize="9.5" className="fill-slate-400 font-mono" textAnchor="middle">75%</text>
                              <text x="244" y="146" fontSize="10" className="fill-slate-400 font-mono" textAnchor="middle">100%</text>
                              {/* Needle */}
                              <g transform={`translate(140, 128) rotate(${needleDeg})`}>
                                <polygon points="-4,6 0,-74 4,6" fill={gaugeColor} />
                                <circle cx="0" cy="0" r="8" fill={gaugeColor} />
                                <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
                              </g>
                              {/* Center Readout */}
                              <text x="140" y="106" fontSize="24" fontWeight="700" textAnchor="middle" fill={gaugeColor} className="font-mono">
                                %{summary.offsetPct}
                              </text>
                              <text x="140" y="152" fontSize="10" textAnchor="middle" className="fill-slate-500 dark:fill-slate-400">
                                {L('Mahsup Oranı', 'Доля зачёта')} ({fmtRub(summary.totalOffsetUsed)})
                              </text>
                            </svg>

                            <div className="w-full grid grid-cols-3 gap-1.5 text-center pt-1 text-[10px]">
                              <div className="p-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30">
                                <div className="text-slate-500">{L('Mahsup', 'Зачтено')}</div>
                                <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmtRub(summary.totalOffsetUsed)}</div>
                              </div>
                              <div className="p-1.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30">
                                <div className="text-slate-500">{L('Muh./İK', 'Бух./Кадры')}</div>
                                <div className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{fmtRub(summary.groupB?.rub || 0)}</div>
                              </div>
                              <div className="p-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30">
                                <div className="text-slate-500">{L('Çalışan', 'Сотрудник')}</div>
                                <div className="font-mono font-semibold text-amber-600 dark:text-amber-400">{fmtRub(summary.groupA?.rub || 0)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => {
                          setCauseFilter('FULL_OFFSET');
                          setActiveFilter('all');
                          setActiveTab('reconciliation');
                        }}
                        className="w-full px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200 flex items-center justify-between cursor-pointer hover:opacity-90"
                      >
                        <span>✓ {L('Tam Mahsup (%100)', 'Полный зачёт (100%)')}: <strong>{summary.causeCounts?.FULL_OFFSET || 0}</strong> {L('kişi', 'чел.')}</span>
                        <span className="font-mono font-semibold">{fmtRub(summary.causeRub?.FULL_OFFSET || 0)} →</span>
                      </button>
                    </div>

                    {/* Two-Group Horizontal Bar Charts (Click to drill down into Tab 2) */}
                    <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* GROUP A: Employee / Law Caused */}
                      <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/20 dark:bg-amber-950/10 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                              {L('A. Çalışan / Mevzuat Kaynaklı (Muhasebe Dışı)', 'А. Причины сотрудника / закона (вне контроля бухгалтерии)')}
                            </h3>
                            <p className="text-[10.5px] text-slate-500">
                              {L('Tıklayarak Kişi Bazlı Detay listesine gidin', 'Нажмите для перехода к списку сотрудников')}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
                            {fmtRub(summary.groupA?.rub || 0)}
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {(['LOW_NDFL', 'REGION_CHANGED'] as const).map((ck) => {
                            const meta = CAUSE_META[ck];
                            const cnt = summary.causeCounts?.[ck] || 0;
                            const rub = summary.causeRub?.[ck] || 0;
                            const maxRub = Math.max(1, summary.totalBalance, summary.groupA?.rub || 1);
                            const pct = Math.min(100, Math.round((rub / maxRub) * 100));
                            return (
                              <button
                                key={ck}
                                type="button"
                                onClick={() => {
                                  setCauseFilter(ck);
                                  setActiveFilter('all');
                                  setNotifFilter('all');
                                  setActiveTab('reconciliation');
                                }}
                                className="w-full text-left p-2.5 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 hover:border-amber-400 transition cursor-pointer space-y-1.5"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">{isRu ? meta.labelRu : meta.label}</span>
                                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                                    {cnt} {L('kişi', 'чел.')} · {fmtRub(rub)}
                                  </span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div style={{ width: `${Math.max(rub > 0 ? 4 : 0, pct)}%` }} className={`h-full ${meta.barCls}`} />
                                </div>
                                <p className="text-[10px] text-slate-500 leading-tight">{isRu ? meta.hintRu : meta.hint}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* GROUP B: Accounting / HR Caused (Actionable & Refundable) */}
                      <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                              {L('B. Muhasebe / İK Kaynaklı (Aksiyon & İade)', 'Б. Причины бухгалтерии / кадров (требует действий)')}
                            </h3>
                            <p className="text-[10.5px] text-slate-500">
                              {L('Barlara tıklayarak sorumlu kişileri açın', 'Нажмите на строку для детализации')}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                            {fmtRub(summary.groupB?.rub || 0)}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {(['LATE_RECEIPT_ENTRY', 'LATE_NOTIFICATION', 'DISMISSED_UNRECOVERED', 'NO_NOTIFICATION'] as const).map((ck) => {
                            const meta = CAUSE_META[ck];
                            const cnt = summary.causeCounts?.[ck] || 0;
                            const rub = summary.causeRub?.[ck] || 0;
                            const maxRub = Math.max(1, summary.groupB?.rub || 1);
                            const pct = Math.min(100, Math.round((rub / maxRub) * 100));
                            return (
                              <button
                                key={ck}
                                type="button"
                                onClick={() => {
                                  setCauseFilter(ck);
                                  setActiveFilter('all');
                                  setNotifFilter('all');
                                  setActiveTab(ck === 'NO_NOTIFICATION' ? 'notifications' : 'reconciliation');
                                }}
                                className="w-full text-left p-2 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition cursor-pointer space-y-1"
                              >
                                <div className="flex items-center justify-between text-[11px] gap-2">
                                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{isRu ? meta.labelRu : meta.label}</span>
                                  <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                                    {cnt} {L('kişi', 'чел.')} · {fmtRub(rub)}
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div style={{ width: `${Math.max(rub > 0 ? 4 : 0, pct)}%` }} className={`h-full ${meta.barCls}`} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ROW 2: PROJECT / SITE OFFSET % + PATENT REGION (IFNS) VERTICAL BAR CHART */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-7 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            <span>
                              {L(
                                `Proje / Şantiye Bazlı Mahsup Oranı (${taxYear})`,
                                `Доля зачёта по проектам / объектам (${taxYear})`
                              )}
                            </span>
                          </h3>
                          <p className="text-[10.5px] text-slate-500">
                            {L('Tıklayarak o şantiyenin personellerine gidin', 'Нажмите для детализации по объекту')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 text-[10px] text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> ≥%80</span>
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> %50–79</span>
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500" /> &lt;%50</span>
                          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-400" /> {L('Potansiyel', 'Потенциал')}</span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {analytics.bySite.map((s) => {
                          const pct = s.advances > 0 ? Math.round((s.used / s.advances) * 1000) / 10 : 0;
                          const potPct = s.advances > 0 ? Math.min(100 - pct, Math.round((s.potential / s.advances) * 1000) / 10) : 0;
                          const barCls = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                          const badgeCls =
                            pct >= 80
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                              : pct >= 50
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                              : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700';
                          return (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => {
                                setSearch(s.name === 'Genel' ? '' : s.name);
                                setCauseFilter('all');
                                setBandFilter('all');
                                setActiveFilter('all');
                                setActiveTab('reconciliation');
                              }}
                              className="w-full text-left p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 transition cursor-pointer space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-semibold text-slate-900 dark:text-white truncate">{s.name}</span>
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0">({s.count})</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${badgeCls}`}>
                                    %{pct}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] font-mono shrink-0">
                                  <span className="text-slate-600 dark:text-slate-300">{fmtRub(s.advances)}</span>
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{fmtRub(s.used)}</span>
                                </div>
                              </div>
                              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                                <div style={{ width: `${Math.min(100, pct)}%` }} className={`h-full ${barCls}`} />
                                {potPct > 0 && <div style={{ width: `${potPct}%` }} className="h-full bg-indigo-400/90" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Patent Region (IFNS) Vertical Bar Chart */}
                    <div className="lg:col-span-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {L(`Patent Bölgesi (İFNS) Bazlı Dağılım (${taxYear})`, `Распределение по регионам патента / ИФНС (${taxYear})`)}
                        </h3>
                        <p className="text-[10.5px] text-slate-500">
                          {L('İFNS bölge koduna göre ödenen patent ve mahsup %', 'Оплачено патентов и доля зачёта по коду региона ИФНС')}
                        </p>
                      </div>
                      {(() => {
                        const maxAdv = Math.max(1, ...analytics.byRegion.map((r) => r.advances));
                        return (
                          <div className="flex items-end justify-around gap-3 h-44 pt-4 pb-2 px-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800">
                            {analytics.byRegion.map((rg) => {
                              const pct = rg.advances > 0 ? Math.round((rg.used / rg.advances) * 1000) / 10 : 0;
                              const hAdv = Math.max(14, Math.round((rg.advances / maxAdv) * 100));
                              const hUsed = Math.max(rg.used > 0 ? 10 : 0, Math.round((rg.used / maxAdv) * 100));
                              return (
                                <button
                                  key={rg.code || rg.name}
                                  type="button"
                                  onClick={() => {
                                    setSearch(rg.code || '');
                                    setCauseFilter('all');
                                    setBandFilter('all');
                                    setActiveTab('reconciliation');
                                  }}
                                  className="flex flex-col items-center h-full justify-end gap-1 flex-1 max-w-[110px] cursor-pointer group"
                                  title={`${rg.name} (${rg.count} ${L('kişi', 'чел.')}) · ${L('Avans', 'Аванс')}: ${fmtRub(rg.advances)} · ${L('Mahsup', 'Зачтено')}: ${fmtRub(rg.used)} (%${pct})`}
                                >
                                  <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">%{pct}</span>
                                  <div className="flex items-end gap-1.5 h-28 w-full justify-center">
                                    <div style={{ height: `${hAdv}%` }} className="w-5 rounded-t bg-sky-500/80 group-hover:bg-sky-500 transition" />
                                    <div style={{ height: `${hUsed}%` }} className="w-5 rounded-t bg-emerald-500/90 group-hover:bg-emerald-500 transition" />
                                  </div>
                                  <span className="text-[10px] text-slate-700 dark:text-slate-300 font-medium truncate w-full text-center">
                                    {rg.name}
                                  </span>
                                  <span className="text-[9.5px] font-mono text-slate-500">
                                    {rg.count} {L('kişi', 'чел.')}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/80" /> {L('Ödenen Patent', 'Оплачено патент')}</span>
                        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> {L('Mahsup Edilen', 'Зачтено')}</span>
                      </div>
                    </div>
                  </div>

                  {/* 5-Band Offset Rate Distribution Table + Citizenship Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {L('Kişi Bazlı Mahsup Oranı Dağılımı (Tıklayarak Filtrele)', 'Распределение сотрудников по доле зачёта (нажмите для фильтра)')}
                        </h3>
                        <span className="text-[10.5px] text-slate-500">
                          {L('Genel ortalama', 'Средний зачёт')}: <strong>%{summary.offsetPct}</strong>
                        </span>
                      </div>
                      {(() => {
                        const bands: Array<{
                          key: '100' | '80_99' | '50_79' | '1_49' | '0';
                          label: string;
                          labelRu: string;
                          cls: string;
                          count: number;
                          adv: number;
                          used: number;
                        }> = [
                          { key: '100', label: '%100 (Tam)', labelRu: '100% (Полный)', cls: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300', count: 0, adv: 0, used: 0 },
                          { key: '80_99', label: '%80 – %99', labelRu: '80% – 99%', cls: 'bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300', count: 0, adv: 0, used: 0 },
                          { key: '50_79', label: '%50 – %79', labelRu: '50% – 79%', cls: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300', count: 0, adv: 0, used: 0 },
                          { key: '1_49', label: '%1 – %49', labelRu: '1% – 49%', cls: 'bg-orange-100 dark:bg-orange-950/70 text-orange-800 dark:text-orange-300', count: 0, adv: 0, used: 0 },
                          { key: '0', label: '%0 (Mahsup Yok)', labelRu: '0% (Нет зачёта)', cls: 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300', count: 0, adv: 0, used: 0 },
                        ];
                        for (const r of records) {
                          const adv = Number(r.patent_advances || 0);
                          const used = Number(r.patent_offset_used || 0);
                          const pct = adv > 0 ? (used / adv) * 100 : 0;
                          const idx = pct >= 99.5 ? 0 : pct >= 80 ? 1 : pct >= 50 ? 2 : pct > 0 ? 3 : 4;
                          bands[idx].count++;
                          bands[idx].adv += adv;
                          bands[idx].used += used;
                        }
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-[10.5px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                  <th className="py-2 pr-2">{L('Mahsup Oranı', 'Доля зачёта')}</th>
                                  <th className="py-2 px-2 text-right">{L('Kişi Sayısı', 'Сотрудников')}</th>
                                  <th className="py-2 px-2 text-right">{L('Ödenen Patent', 'Оплачено патент')}</th>
                                  <th className="py-2 px-2 text-right text-emerald-600">{L('Mahsup Edilen', 'Зачтено')}</th>
                                  <th className="py-2 pl-2 text-right text-amber-600">{L('Kalan Bakiye', 'Остаток')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {bands.map((b) => (
                                  <tr
                                    key={b.key}
                                    onClick={() => {
                                      setBandFilter(b.key);
                                      setCauseFilter('all');
                                      setActiveFilter('all');
                                      setSearch('');
                                      setActiveTab('reconciliation');
                                    }}
                                    className="hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 cursor-pointer transition"
                                  >
                                    <td className="py-2 pr-2">
                                      <span className={`px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] ${b.cls}`}>
                                        {isRu ? b.labelRu : b.label}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono font-semibold">{b.count} {L('kişi', 'чел.')}</td>
                                    <td className="py-2 px-2 text-right font-mono">{fmtRub(b.adv)}</td>
                                    <td className="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmtRub(b.used)}</td>
                                    <td className="py-2 pl-2 text-right font-mono text-amber-600 dark:text-amber-400">{fmtRub(Math.max(0, b.adv - b.used))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{L('Uyruk Bazlı Dağılım', 'Распределение по гражданству')}</span>
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
                        <span>
                          {L(
                            'Yıl Sonu Fazla Kesilen НДФЛ İade Dosyası (Возврат НДФЛ — ст. 231 НК РФ)',
                            'Возврат излишне удержанного НДФЛ (ст. 231 НК РФ, ЕНС / КНД 1112542 / 6-НДФЛ)'
                          )}
                        </span>
                      </h3>
                      <p className="text-[11px] text-indigo-900/80 dark:text-indigo-200/80 mt-0.5">
                        {L(
                          `Kalan ${summary.vozvratForecast?.remainingMonths ?? 1} ay için çalışanın aylık ortalama НДФЛ'sine göre yıl sonuna kadar bordrodan mahsup edilemeyeceği KESİN olan aktif çalışanlar ayrıştırılır. Çıkışlılar işveren üzerinden iade edilemediği için bu listeden otomatik çıkarılmıştır.`,
                          `На основе среднего НДФЛ/мес и оставшихся ${summary.vozvratForecast?.remainingMonths ?? 1} мес. выделены активные сотрудники, чей остаток гарантированно не зачтётся до конца года. Уволенные исключены (возврат через работодателя невозможен).`
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePrintVozvratKit}
                        disabled={filteredRecords.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{L(`İade Dilekçesi + Bildirim Yazdır (${filteredRecords.length})`, `Печать комплекта возврата (${filteredRecords.length})`)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportVozvratReestr}
                        disabled={filteredRecords.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{L('Реестр на возврат (Excel)', 'Реестр на возврат (Excel)')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Forecast KPI Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800">
                      <div className="text-[10.5px] text-slate-500">{L('Aktif Toplam İade Potansiyeli', 'Общий потенциал (активные)')}</div>
                      <div className="text-base font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                        {fmtRub(summary.vozvratForecast?.activeEligibleRub || 0)}
                      </div>
                      <div className="text-[10px] text-slate-500">{summary.vozvratForecast?.activeEligibleCount || 0} {L('aktif çalışan', 'акт. сотр.')}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                      <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300">{L('Kalan Bordrodan Mahsup Edilebilir', 'Зачтётся в оставшихся месяцах')}</div>
                      <div className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {fmtRub(summary.vozvratForecast?.payrollAbsorbableRub || 0)}
                      </div>
                      <div className="text-[10px] text-slate-500">{L('Aylık ort. НДФЛ tahmini', 'Прогноз по среднему НДФЛ')}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700">
                      <div className="text-[10.5px] text-rose-700 dark:text-rose-300 font-semibold">{L('KESİN Возврат Gerekli (ст. 231)', 'ОБЯЗАТЕЛЬНЫЙ ВОЗВРАТ (ст. 231)')}</div>
                      <div className="text-base font-mono font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                        {fmtRub(summary.vozvratForecast?.guaranteedVozvratRub || 0)}
                      </div>
                      <div className="text-[10px] text-rose-700/80 dark:text-rose-300/80">
                        {summary.vozvratForecast?.guaranteedVozvratCount || 0} {L('kişi — dilekçe ile iade şart', 'чел. — оформить возврат')}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700">
                      <div className="text-[10.5px] text-slate-600 dark:text-slate-300">{L('Çıkışlı — Geri Alınamaz (Plan Dışı)', 'Уволены — возврат невозможен')}</div>
                      <div className="text-base font-mono font-bold text-fuchsia-600 dark:text-fuchsia-400 mt-0.5">
                        {fmtRub(summary.vozvratForecast?.dismissedLostRub || 0)}
                      </div>
                      <div className="text-[10px] text-slate-500">{summary.vozvratForecast?.dismissedLostCount || 0} {L('çıkışlı (3-НДФЛ)', 'уволенных (только 3-НДФЛ)')}</div>
                    </div>
                  </div>

                  {/* Official 4-Step 2026 FNS / ЕНС / 6-НДФЛ Procedure */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">{L('1. Yazılı Bildirim (10 iş günü)', '1. Уведомление работника (10 дней)')}</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                        {L(
                          'İşveren п. 1 ст. 231 НК РФ gereği fazla kesilen НДФЛ tutarını 10 iş günü içinde çalışana yazılı bildirir.',
                          'Работодатель письменно уведомляет сотрудника об излишне удержанном НДФЛ в течение 10 рабочих дней (п. 1 ст. 231 НК РФ).'
                        )}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">{L('2. Dilekçe + Banka Hesabı', '2. Заявление + реквизиты банка')}</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                        {L(
                          'Çalışan Заявление на возврат НДФЛ + banka hesap (р/с, БИК) bilgilerini verir. Nakit ödeme kesinlikle yasaktır.',
                          'Работник подаёт заявление на возврат НДФЛ с банковскими реквизитами (наличными возвращать запрещено).'
                        )}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">{L('3. 3 Ay İçinde İade & ЕНС (КНД 1112542)', '3. Возврат за 3 мес. и ЕНС (КНД 1112542)')}</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                        {L(
                          '1C\'de «Перерасчет НДФЛ» + «Возврат НДФЛ» yapılır; çalışanın hesabına ödenir, şirketin diğer НДФЛ ödemelerinden düşülür veya ЕНС fazlalığı КНД 1112542 ile İFNS\'den istenir.',
                          'В 1С проводятся «Перерасчёт НДФЛ» и «Возврат НДФЛ», деньги перечисляются на счёт работника за счёт текущих удержаний НДФЛ или возвращаются с ЕНС по форме КНД 1112542.'
                        )}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-800/60">
                      <strong className="text-indigo-700 dark:text-indigo-300">{L('4. 6-НДФЛ (Satır 030 & 190)', '4. Отражение в 6-НДФЛ (стр. 030 и 190)')}</strong>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                        {L(
                          'İade yapılan çeyrekte 6-НДФЛ Bölüm 1 (satır 030–036) ve Bölüm 2 (satır 190)\'da bildirilir; satır 160 azaltılmaz, tutar satır 180\'den 190\'a taşınır.',
                          'Отражается в 6-НДФЛ за квартал возврата: Раздел 1 (стр. 030–036) и Раздел 2 (стр. 190); стр. 160 не уменьшается, сумма переносится из стр. 180 в 190.'
                        )}
                      </p>
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
                      placeholder={L('Sicil, Ad Soyad, Bildirim No, İFNS...', 'Таб. №, ФИО, № увед., ИФНС...')}
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600 w-60"
                    />
                  </div>
                  {activeTab === 'vozvrat' ? (
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vozvratOnlyGuaranteed}
                        onChange={(e) => setVozvratOnlyGuaranteed(e.target.checked)}
                      />
                      <span>{L('Sadece Kesin Возврат Gerekli Olanlar', 'Только обязательный возврат (ст. 231)')}</span>
                    </label>
                  ) : (
                    <select
                      value={activeFilter}
                      onChange={(e) => setActiveFilter(e.target.value as any)}
                      className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                    >
                      <option value="all">{L('Tümü (Aktif + Çıkışlı)', 'Все (активные + уволенные)')}</option>
                      <option value="active">{L('Sadece Aktif Çalışanlar', 'Только активные')}</option>
                      <option value="dismissed">{L('Sadece Çıkışlılar', 'Только уволенные')}</option>
                    </select>
                  )}
                  {activeTab === 'reconciliation' && (
                    <>
                      <select
                        value={causeFilter}
                        onChange={(e) => setCauseFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 text-xs rounded-xl border border-indigo-300 dark:border-indigo-700"
                      >
                        <option value="all">{L('Tüm Kök Nedenler', 'Все причины')}</option>
                        <option value="LATE_RECEIPT_ENTRY">{L('B. Fişler 1C\'ye Geç Girilmiş', 'Б. Чеки внесены в 1С поздно')}</option>
                        <option value="LATE_NOTIFICATION">{L('B. ФНС İzni Geç Alınmış', 'Б. Уведомление получено поздно')}</option>
                        <option value="NO_NOTIFICATION">{L('B. ФНС İzni Alınmamış', 'Б. Нет уведомления ФНС')}</option>
                        <option value="DISMISSED_UNRECOVERED">{L('B. Çıkışlı (İade Edilemez)', 'Б. Уволен без возврата')}</option>
                        <option value="LOW_NDFL">{L('A. НДФЛ Yetersiz (Avans > НДФЛ)', 'А. Недостаточно НДФЛ')}</option>
                        <option value="REGION_CHANGED">{L('A. Bölge Değişikliği (Plan Dışı)', 'А. Смена региона (вне плана)')}</option>
                        <option value="FULL_OFFSET">{L('✓ Tam Mahsup (%100)', '✓ Полный зачёт (100%)')}</option>
                      </select>
                      <select
                        value={bandFilter}
                        onChange={(e) => setBandFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      >
                        <option value="all">{L('Tüm Mahsup Oranları', 'Все доли зачёта')}</option>
                        <option value="100">{L('%100 (Tam)', '100% (Полный)')}</option>
                        <option value="80_99">%80 – %99</option>
                        <option value="50_79">%50 – %79</option>
                        <option value="1_49">%1 – %49</option>
                        <option value="0">{L('%0 (Mahsup Yok)', '0% (Нет зачёта)')}</option>
                      </select>
                      <select
                        value={notifFilter}
                        onChange={(e) => setNotifFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      >
                        <option value="all">{L('Tüm Kayıtlar', 'Все записи')}</option>
                        <option value="has_potential">{L('Ek Mahsup Potansiyeli Olanlar', 'С потенциалом дозачёта')}</option>
                        <option value="zero_offset">{L('Avans Var ama Mahsup = 0', 'Есть аванс, но зачёт = 0')}</option>
                        <option value="with_notif">{L('ФНС Bildirimi Var', 'Есть уведомление ФНС')}</option>
                        <option value="no_notif">{L('ФНС Bildirimi Yok', 'Нет уведомления ФНС')}</option>
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

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[700px] overflow-y-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-[#0D192E] text-[11px] text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-2.5">{L('Sicil / Tabel', 'Таб. №')}</th>
                      <th className="py-2.5 px-2.5">{L('Ad Soyad (ФИО)', 'ФИО')}</th>
                      <th className="py-2.5 px-2.5">{L('İşe Giriş / Çıkış', 'Приём / Увольнение')}</th>
                      <th className="py-2.5 px-2.5">{L('ФНС Bildirim', 'Уведомление ФНС')}</th>
                      <th className="py-2.5 px-2.5 text-right">{L('Patent Avansı', 'Аванс патент')}</th>
                      <th className="py-2.5 px-2.5 text-right">{L('Mahsup Edilen', 'Зачтено')}</th>
                      <th className="py-2.5 px-2.5 text-right">{activeTab === 'vozvrat' ? L('Ort. НДФЛ / Ay', 'Средн. НДФЛ/мес') : L('Kalan Avans', 'Остаток')}</th>
                      <th className="py-2.5 px-2.5 text-right">{activeTab === 'vozvrat' ? L('Kesin Возврат', 'Обяз. возврат') : L('Ek Potansiyel', 'Потенциал')}</th>
                      <th className="py-2.5 px-2.5">{L('Eksik Mahsup Ayları', 'Месяцы недозачёта')}</th>
                      <th className="py-2.5 px-2.5">{L('Kök Neden / Plan', 'Причина / Статус')}</th>
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
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] border w-fit ${
                                r.is_active
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                  : 'bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-300 dark:border-fuchsia-700'
                              }`}
                            >
                              {r.is_active ? L('Aktif', 'Активен') : L('Çıkışlı', 'Уволен')}
                            </span>
                            {(r.hire_date || r.exit_date) && (
                              <span className="text-[9.5px] font-mono text-slate-500">
                                {r.hire_date ? `${L('Giriş', 'Приём')}: ${r.hire_date}` : ''}
                                {r.exit_date ? ` · ${L('Çıkış', 'Увол.')}: ${r.exit_date}` : ''}
                              </span>
                            )}
                          </div>
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
                          {activeTab === 'vozvrat' ? fmtRub(r.avg_monthly_ndfl || 0) : fmtRub(r.patent_advance_balance)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {activeTab === 'vozvrat' ? (
                            <span className={Number(r.guaranteed_vozvrat || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                              {fmtRub(r.guaranteed_vozvrat || 0)}
                            </span>
                          ) : (
                            fmtRub(r.additional_offset_potential)
                          )}
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
                            <span className={`px-2 py-0.5 rounded-md text-[10px] border ${cMeta.cls}`} title={isRu ? cMeta.hintRu : cMeta.hint}>
                              {isRu ? cMeta.shortRu : cMeta.short}
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
                                    {r.patent_info && (
                                      <span>
                                        <strong>Patent:</strong>{' '}
                                        {r.patent_info.patent_no || 'Kayıtlı'}
                                        {r.patent_info.patent_start ? ` (${r.patent_info.patent_start} – ${r.patent_info.patent_end || '?'})` : r.patent_info.patent_end ? ` (Bitiş: ${r.patent_info.patent_end})` : ''}
                                        {r.patent_info.payment_day > 0 && (
                                          <strong className="ml-1 text-indigo-600 dark:text-indigo-400">
                                            · Ödeme Günü: Her ayın {r.patent_info.payment_day}&apos;i
                                          </strong>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setNewRcEmp(newRcEmp === r.full_name ? null : r.full_name)}
                                      className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                                    >
                                      + {L("1C'ye Fiş Gir (OData)", 'Внести чек в 1С (OData)')}
                                    </button>
                                    {lastCreated1cDoc && lastCreated1cDoc.fullName === r.full_name && (
                                      <button
                                        type="button"
                                        disabled={newRcBusy}
                                        onClick={() => handleDelete1cReceipt(lastCreated1cDoc.refKey)}
                                        className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
                                      >
                                        {L(`Son Fişi Sil (№ ${lastCreated1cDoc.number})`, `Удалить чек (№ ${lastCreated1cDoc.number})`)}
                                      </button>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] border ${cMeta.cls}`}>
                                      {isRu ? cMeta.labelRu : cMeta.label}
                                    </span>
                                  </div>
                                </div>

                                {newRcEmp === r.full_name && (
                                  <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-700 flex flex-wrap items-end gap-2 text-[11px]">
                                    <div>
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-300">{L('Tutar (₽)', 'Сумма (₽)')}</label>
                                      <input
                                        type="number"
                                        value={newRcAmount}
                                        onChange={(e) => setNewRcAmount(e.target.value)}
                                        className="w-28 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-xs"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-300">{L('Ödeme Tarihi (Дата операции)', 'Дата операции')}</label>
                                      <input
                                        type="date"
                                        value={newRcOpDate}
                                        onChange={(e) => setNewRcOpDate(e.target.value)}
                                        className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-xs"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-[180px]">
                                      <label className="block text-[10px] text-slate-600 dark:text-slate-300">{L('Комментарий (Aylar)', 'Комментарий (месяцы)')}</label>
                                      <input
                                        type="text"
                                        value={newRcComment}
                                        onChange={(e) => setNewRcComment(e.target.value)}
                                        placeholder="август-сентябрь-октябрь"
                                        className="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      disabled={newRcBusy}
                                      onClick={() => handleCreate1cReceipt(r.full_name)}
                                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                                    >
                                      {newRcBusy ? L('Gönderiliyor...', 'Отправка...') : L("1C'ye Yaz & Onayla", 'Записать и провести в 1С')}
                                    </button>
                                  </div>
                                )}

                                {r.missing_receipt_months && r.missing_receipt_months.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                                    <span className="px-2 py-0.5 rounded-md bg-amber-100/90 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-[10px]">
                                      ⚠ Fişi 1C&apos;ye girilmemiş aylar:{' '}
                                      <strong>{r.missing_receipt_months.map((x) => x.label).join(', ')}</strong> (ödendiyse fiş yüklenmeli)
                                    </span>
                                  </div>
                                )}

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
                                  <div className="overflow-x-auto max-h-[440px] overflow-y-auto rounded-xl border border-indigo-200 dark:border-indigo-800/70 shadow-sm bg-white dark:bg-slate-900">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-indigo-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 sticky top-0 z-[5] border-b border-indigo-200 dark:border-slate-700">
                                        <tr>
                                          <th className="py-1.5 px-2.5">{L(`Ay (${taxYear})`, `Месяц (${taxYear})`)}</th>
                                          <th className="py-1.5 px-2.5 text-right text-sky-700 dark:text-sky-300">{L('1C Fiş Girişi (Tarih)', 'Ввод чеков в 1С (дата)')}</th>
                                          <th className="py-1.5 px-2.5 text-right">{L('Aylık Patent', 'Патент/мес')}</th>
                                          <th className="py-1.5 px-2.5 text-right">{L('Hesaplanan НДФЛ', 'Начислено НДФЛ')}</th>
                                          <th className="py-1.5 px-2.5 text-right text-emerald-600">{L('Mahsup Edilen', 'Зачтено')}</th>
                                          <th className="py-1.5 px-2.5 text-right">{L('Kesilen НДФЛ', 'Удержано НДФЛ')}</th>
                                          <th className="py-1.5 px-2.5 text-right text-amber-600">{L('Aylık Eksik Mahsup', 'Недозачёт/мес')}</th>
                                          <th className="py-1.5 px-2.5">{L('Aylık Analiz', 'Анализ по месяцу')}</th>
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
                                              <td
                                                className="py-1.5 px-2.5 text-right font-mono whitespace-nowrap"
                                                title={
                                                  em.receipt_1c_items && em.receipt_1c_items.length > 0
                                                    ? em.receipt_1c_items
                                                        .map(
                                                          (rc) =>
                                                            `1C Giriş: ${rc.date} · Ödeme: ${rc.opDate} · ${fmtRub(rc.amount)}${rc.comment ? ` (${rc.comment})` : ''} [№ ${rc.number}]`
                                                        )
                                                        .join('\n')
                                                    : 'Bu ayda 1C\'ye patent fişi girilmedi'
                                                }
                                              >
                                                {em.receipt_1c_entered && em.receipt_1c_entered > 0 ? (
                                                  <div className="inline-flex flex-col items-end">
                                                    <span className="font-semibold text-sky-700 dark:text-sky-300">
                                                      {fmtRub(em.receipt_1c_entered)}
                                                    </span>
                                                    <span className="text-[9px] font-sans text-slate-500 dark:text-slate-400">
                                                      {(em.receipt_1c_items || []).length} fiş
                                                      {em.receipt_1c_items && em.receipt_1c_items[0]?.comment
                                                        ? ` · ${em.receipt_1c_items.map((x) => x.comment).filter(Boolean).join(', ').slice(0, 26)}`
                                                        : ''}
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className="text-slate-400">—</span>
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono">
                                                {em.patent_paid > 0 ? (
                                                  fmtRub(em.patent_paid)
                                                ) : em.ndfl_calc > 0 ? (
                                                  <span className="inline-flex items-center gap-1 text-slate-400">
                                                    <span>0 ₽</span>
                                                    <span className="px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[9px] font-sans">
                                                      Fiş yok
                                                    </span>
                                                  </span>
                                                ) : (
                                                  '0 ₽'
                                                )}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono">{fmtRub(em.ndfl_calc)}</td>
                                              <td className="py-1.5 px-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                                {fmtRub(em.offset_used)}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono">{fmtRub(em.ndfl_withheld)}</td>
                                              <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                                                {em.unoffset_gap > 0 ? fmtRub(em.unoffset_gap) : '—'}
                                              </td>
                                              <td className={`py-1.5 px-2.5 text-[10.5px] ${noteCls}`}>
                                                {(isRu ? em.analysis_note_ru : em.analysis_note) || '—'}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 font-semibold border-t border-slate-300 dark:border-slate-700">
                                        {(() => {
                                          const sum1cEntered = empMonths.reduce((s, m) => s + (m.receipt_1c_entered || 0), 0);
                                          const sumPatent = empMonths.reduce((s, m) => s + m.patent_paid, 0);
                                          const sumNdfl = empMonths.reduce((s, m) => s + m.ndfl_calc, 0);
                                          const sumOffset = empMonths.reduce((s, m) => s + m.offset_used, 0);
                                          const sumWithheld = empMonths.reduce((s, m) => s + m.ndfl_withheld, 0);
                                          const lowNdflExcess = Math.max(0, r.patent_advance_balance - r.additional_offset_potential);
                                          return (
                                            <tr>
                                              <td className="py-2 px-2.5 font-mono">TOPLAM ({taxYear})</td>
                                              <td className="py-2 px-2.5 text-right font-mono text-sky-700 dark:text-sky-300">
                                                {fmtRub(sum1cEntered)}
                                              </td>
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
                  <span>{L('1C ZUP Canlı OData Bağlantısı (StandardODATA)', 'Подключение 1С:ЗУП OData (StandardODATA)')}</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {L(
                    '1C:ЗУП salt-okunur (read-only) OData erişimi tanımlandığında patent avansları, fişler, işe giriş/çıkış tarihleri, НДФЛ mahsupları ve ФНС bildirimleri tek tıkla otomatik çekilir.',
                    'При подключении 1С:ЗУП OData (только чтение) авансы по патентам, чеки, даты приёма/увольнения, зачёты НДФЛ и уведомления ФНС загружаются автоматически в 1 клик.'
                  )}
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
                      <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">{L('Kullanıcı Adı', 'Логин 1С')}</label>
                      <input
                        type="text"
                        value={odataUser}
                        onChange={(e) => setOdataUser(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">{L('Şifre', 'Пароль')}</label>
                      <input
                        type="password"
                        value={odataPass}
                        onChange={(e) => setOdataPass(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">{L('Organizasyon Filtresi (Opsiyonel)', 'Организация (опционально)')}</label>
                    <input
                      type="text"
                      value={odataOrg}
                      onChange={(e) => setOdataOrg(e.target.value)}
                      placeholder="ООО «МОНТАЖЭНЕРГОСТРОЙ»"
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  {odataLastSync && (
                    <div className="text-[11px] text-slate-500">{L('Son OData senkronizasyonu', 'Последняя синхронизация')}: <strong>{odataLastSync}</strong></div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveOData}
                      disabled={odataBusy}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{L('Ayarları Kaydet', 'Сохранить настройки')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSyncOData}
                      disabled={odataBusy || !odataUrl}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{L("1C OData'dan Çek", 'Загрузить из 1С OData')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-700/70 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <h3 className="font-semibold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-indigo-500" />
                    <span>
                      {L(
                        'МЭС Resmi Mahsup İş Akışı & Zorunlu Dilekçe Kuralları (Ульяна Москалец, 24.11.2026)',
                        'Официальный регламент зачёта НДФЛ по патенту в ООО «МЭС» (Ульяна Москалец, 24.11.2026)'
                      )}
                    </span>
                  </h3>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11.5px]">
                    <li>
                      <strong>{L('Çalışandan Dilekçe Alınması (Zorunlu!):', 'Сбор заявления от работника (обязательно!):')}</strong>{' '}
                      {L(
                        'Yabancı çalışandan serbest formda «Заявление об уменьшении НДФЛ» alınmalıdır. Muhasebe notu: Bu dilekçeler bugüne kadar muhasebeye hiç iletilmemiştir! 3. sekmeden toplu dilekçe yazdırılıp işe girişte/patent alımında imzalatılmalıdır.',
                        'Необходимо получить от работника заявление в свободной форме об уменьшении НДФЛ. Примечание бухгалтерии: ранее такие заявления в бухгалтерию ни разу не поступали — используйте печать бланков на вкладке 3.'
                      )}
                    </li>
                    <li>
                      <strong>{L('İFNS Başvurusu (КНД 1110055 + PDF Liste):', 'Подача заявления в ИФНС (КНД 1110055 + список PDF):')}</strong>{' '}
                      {L(
                        'İşe alınan patentli çalışanların listesiyle İFNS\'ye XML başvuru gönderilir (3. sekmeden tek tıkla üretilir).',
                        'В ИФНС направляется XML-заявление КНД 1110055 со списком принятых сотрудников (формируется в 1 клик на вкладке 3).'
                      )}
                    </li>
                    <li>
                      <strong>{L('ФНС Bildiriminin Alınması (Уведомление — 10 iş günü):', 'Получение Уведомления от ФНС (срок — 10 рабочих дней):')}</strong>{' '}
                      {L(
                        'Vergi dairesi yasal olarak 10 iş günü içinde bildirim göndermelidir (bazen gecikebilir). Gelen PDF 3. sekmeden sisteme otomatik okutulur.',
                        'Налоговая инспекция обязана направить уведомление в течение 10 рабочих дней (возможны задержки). Полученный PDF загружается на вкладке 3.'
                      )}
                    </li>
                    <li>
                      <strong>{L('Ödeme Fişlerinin Her Ay Düzenli 1C\'ye Girilmesi:', 'Ежемесячный своевременный ввод чеков в 1С:ЗУП:')}</strong>{' '}
                      {L(
                        'Fiş taramaları ve listeleri her ay düzenli iletilip 1C\'ye (Авансовый платеж по НДФЛ) zamanında işlenmelidir. Düzensiz gelen listeler yüzünden fişler aylarca geç girilmekte ve o aylarda НДФЛ mahsup edilemeden kesilmektedir.',
                        'Чеки и списки оплат должны передаваться регулярно каждый месяц для своевременного ввода в 1С. Задержки с вводом чеков приводят к удержанию НДФЛ без зачёта и необходимости возврата в конце года.'
                      )}
                    </li>
                  </ol>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-500" />
                    <span>{L('Rusya Patent НДФЛ Mahsup Mevzuatı (НК РФ ст. 227.1 ve ст. 231)', 'Законодательство РФ по зачёту и возврату НДФЛ (ст. 227.1 и ст. 231 НК РФ)')}</span>
                  </h3>
                  <ul className="list-disc pl-4 space-y-1.5 text-[11.5px]">
                    <li>
                      <strong>{L('Mahsup Kuralı:', 'Правило зачёта:')}</strong>{' '}
                      {L(
                        'Yıl içinde ödenen sabit patent avansları, çalışanın aynı yıl hesaplanan НДФЛ vergisinden düşülür (min(Avans, НДФЛ)). НДФЛ\'yi aşan avans iade edilmez (п. 7 ст. 227.1).',
                        'Фиксированные авансы по патенту уменьшают НДФЛ за тот же налоговый период (min(Аванс, НДФЛ)). Превышение аванса над НДФЛ не возвращается (п. 7 ст. 227.1 НК РФ).'
                      )}
                    </li>
                    <li>
                      <strong>{L('Geriye Dönük Mahsup:', 'Ретроспективный зачёт:')}</strong>{' '}
                      {L(
                        'Уведомление ФНС yıl ortasında gelse dahi mahsup sadece bildirim tarihinden değil yıl başından (Ocak) itibaren geriye dönük uygulanır.',
                        'Даже если уведомление получено в середине года, зачёт применяется с начала налогового периода (с января).'
                      )}
                    </li>
                    <li>
                      <strong>{L('Yıl Geçişli Fişler & Bölge Kuralı:', 'Переходящие чеки и смена региона:')}</strong>{' '}
                      {L(
                        'Aralık ayında 3 aylık ödenen fişler eski/yeni yıl olarak bölünür. Bir çalışana yılda sadece 1 bölge için Уведомление verilir.',
                        'Чеки, оплаченные в декабре за несколько месяцев, распределяются по годам. В течение года уведомление выдаётся только по одному региону.'
                      )}
                    </li>
                    <li>
                      <strong>{L('Yıl Sonu İade (ст. 231 НК РФ):', 'Возврат в конце года (ст. 231 НК РФ):')}</strong>{' '}
                      {L(
                        'Kalan aylarda mahsup edilemeyen tutarlar çalışanın banka hesabına iade edilir, 6-НДФЛ (satır 030 & 190)\'da gösterilir ve ЕНС / КНД 1112542 üzerinden kapatılır.',
                        'Незачтённый к концу года НДФЛ возвращается на банковский счёт работника, отражается в 6-НДФЛ (стр. 030 и 190) и зачитывается/возвращается через ЕНС (КНД 1112542).'
                      )}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BULK PATENT RECEIPT OCR & 1C PUSH MODAL */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-6xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {L("Toplu Patent Ödeme Fişi AI OCR → 1C'ye Aktarım (Taslak / Onaylı)", 'Массовое распознавание чеков (AI OCR) → отправка в 1С')}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {L(
                    "ZIP / PDF içindeki tüm banka fişleri otomatik okunur. Dönem kilidi varsa 1C'ye Taslak (Черновик) olarak kaydedilir, muhasebe 1C'de tek tıkla «Провести» yapabilir.",
                    'Все чеки из ZIP/PDF распознаются автоматически. При наличии даты запрета сохраняются в 1С как черновики для быстрого проведения бухгалтером.'
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setScanModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {scanBusy ? (
                <div className="py-12 text-center space-y-2">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {L('PDF / ZIP sayfaları parçalanıp Gemini Vision AI OCR ile okunuyor (35 sayfa ~20-35 sn)...', 'Разбивка PDF/ZIP и распознавание чеков через AI OCR...')}
                  </p>
                </div>
              ) : scannedReceipts.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <div className="text-xs text-slate-500">{L('Okunan patent fişi bulunamadı.', 'Чеки не найдены.')}</div>
                  {scanError && (
                    <div className="max-w-xl mx-auto p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-700 dark:text-rose-300">
                      {scanError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={scannedReceipts.every((r) => r.selected)}
                            onChange={(e) => setScannedReceipts((prev) => prev.map((x) => ({ ...x, selected: e.target.checked })))}
                          />
                        </th>
                        <th className="py-2 px-2">{L('Sayfa', 'Стр.')}</th>
                        <th className="py-2 px-2">{L('Ad Soyad (ФИО)', 'ФИО плательщика')}</th>
                        <th className="py-2 px-2">{L('Ödeme Tarihi', 'Дата операции')}</th>
                        <th className="py-2 px-2 text-right">{L('Tutar (₽)', 'Сумма (₽)')}</th>
                        <th className="py-2 px-2">{L('Комментарий (Aylar)', 'Комментарий (месяцы)')}</th>
                        <th className="py-2 px-2">{L('Kontrol (1C / КБК)', 'Проверка')}</th>
                        <th className="py-2 px-2">{L('1C Durumu', 'Статус 1С')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {scannedReceipts.map((item) => (
                        <tr key={item.id} className={item.is_duplicate ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}>
                          <td className="py-1.5 px-2">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) =>
                                setScannedReceipts((prev) => prev.map((x) => (x.id === item.id ? { ...x, selected: e.target.checked } : x)))
                              }
                            />
                          </td>
                          <td className="py-1.5 px-2 font-mono text-slate-500 whitespace-nowrap">
                            {item.receipt_file_url ? (
                              <a
                                href={item.receipt_file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                                title={L('Parçalanmış fiş PDF sayfasını aç', 'Открыть страницу чека')}
                              >
                                📎 #{item.page}
                              </a>
                            ) : (
                              <>#{item.page}</>
                            )}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={item.full_name}
                              onChange={(e) =>
                                setScannedReceipts((prev) => prev.map((x) => (x.id === item.id ? { ...x, full_name: e.target.value } : x)))
                              }
                              className="w-56 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                            />
                            {item.inn && <div className="text-[9.5px] font-mono text-slate-500">ИНН: {item.inn}</div>}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="date"
                              value={item.op_date}
                              onChange={(e) =>
                                setScannedReceipts((prev) => prev.map((x) => (x.id === item.id ? { ...x, op_date: e.target.value } : x)))
                              }
                              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <input
                              type="number"
                              value={item.amount}
                              onChange={(e) =>
                                setScannedReceipts((prev) => prev.map((x) => (x.id === item.id ? { ...x, amount: Number(e.target.value) || 0 } : x)))
                              }
                              className="w-24 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-right"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              value={item.suggested_comment}
                              onChange={(e) =>
                                setScannedReceipts((prev) => prev.map((x) => (x.id === item.id ? { ...x, suggested_comment: e.target.value } : x)))
                              }
                              className="w-40 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              <span className={`px-1.5 py-0.5 rounded text-[9.5px] ${item.matched_in_1c ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                {item.matched_in_1c ? '✓ 1C' : '? Yeni'}
                              </span>
                              {!item.kbk_ok && (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-rose-100 text-rose-700" title={`КБК: ${item.kbk}`}>
                                  ⚠ КБК
                                </span>
                              )}
                              {item.is_duplicate && (
                                <span className="px-1.5 py-0.5 rounded text-[9.5px] bg-amber-200 text-amber-900">
                                  {L('Mükerrer?', 'Дубль?')}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 whitespace-nowrap">
                            {item.push_status === 'pushing' && <span className="text-indigo-500">⏳ ...</span>}
                            {item.push_status === 'posted' && (
                              <span className="text-emerald-600 font-semibold">
                                ✓ Проведён ({item.doc_number})
                                {item.attached_in_1c && <span className="ml-1 px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px]">📎 1C eki</span>}
                              </span>
                            )}
                            {item.push_status === 'draft' && (
                              <span className="text-sky-600 font-semibold" title={item.attach_message || item.push_message}>
                                📝 Taslak ({item.doc_number})
                                {item.attached_in_1c && <span className="ml-1 px-1 py-0.5 rounded bg-sky-100 text-sky-700 text-[9px]">📎 1C eki</span>}
                              </span>
                            )}
                            {item.push_status === 'error' && <span className="text-rose-600" title={item.push_message}>✗ Hata</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950/60">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {L('Seçili', 'Выбрано')}: <strong>{scannedReceipts.filter((r) => r.selected).length}</strong> / {scannedReceipts.length} ·{' '}
                {L('Toplam Tutar', 'Итого')}:{' '}
                <strong className="font-mono">
                  {fmtRub(scannedReceipts.filter((r) => r.selected).reduce((s, r) => s + Number(r.amount || 0), 0))}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScanModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs border border-slate-300 dark:border-slate-600 cursor-pointer"
                >
                  {L('Kapat', 'Закрыть')}
                </button>
                <button
                  type="button"
                  disabled={bulkPushBusy || scanBusy || scannedReceipts.filter((r) => r.selected).length === 0}
                  onClick={handleBulkPushTo1c}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {bulkPushBusy
                      ? L("1C'ye Gönderiliyor...", 'Отправка в 1С...')
                      : L("Seçilenleri 1C'ye Gönder (Taslak / Onaylı)", 'Отправить выбранные в 1С (Черновик / Провести)')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
