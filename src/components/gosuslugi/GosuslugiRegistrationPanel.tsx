'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  FolderSearch,
  Play,
  Pause,
  Square,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Search,
  RefreshCw,
  Upload,
  Download,
  FileCheck2,
  FileX2,
  Loader2,
  MapPin,
  Settings2,
  Terminal,
  Users,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface BridgeStatus {
  status: 'online' | 'offline';
  running: boolean;
  paused?: boolean;
  mode?: string;
  chrome_ready: boolean;
  total: number;
  processed: number;
  success: number;
  errors: number;
  logs: Array<{ time: string; text: string }>;
}

const REG_QUESTIONS = [
  {
    key: 'q1Action' as const,
    short: '1.Soru',
    excelCol: '1.Soru (Что нужно сделать)',
    tooltip: '1. Soru: Что нужно сделать? (Ne yapılacak? — Kayıt / Kayıttan Düşme)',
    options: ['Поставить иностранца на учёт', 'Снять иностранца с учёта'],
  },
  {
    key: 'q2Whom' as const,
    short: '2.Soru',
    excelCol: '2.Soru (Кого поставить на учёт)',
    tooltip: '2. Soru: Кого хотите поставить на учёт? (Kimi kayıt edeceksiniz?)',
    options: ['Совершеннолетнего иностранца', 'Совершеннолетнего иностранца и его детей'],
  },
  {
    key: 'q3Contract' as const,
    short: '3.Soru',
    excelCol: '3.Soru (Есть трудовой договор)',
    tooltip: '3. Soru: У иностранца или члена его семьи есть трудовой договор в России? (İş sözleşmesi var mı?)',
    options: ['Да', 'Нет'],
  },
  {
    key: 'q4StayDoc' as const,
    short: '4.Soru',
    excelCol: '4.Soru (Документ пребывания)',
    tooltip: '4. Soru: Какой документ подтверждает право пребывания в России? (Kalış belgesi)',
    options: ['Документ не нужен', 'Виза', 'Вид на жительство', 'Разрешение на временное проживание'],
  },
  {
    key: 'q5PrevReg' as const,
    short: '5.Soru',
    excelCol: '5.Soru (Был другой адрес в РФ)',
    tooltip: '5. Soru: У иностранца до этого был другой адрес постановки на учёт в России? (Daha önce RF kaydı var mıydı?)',
    options: ['Да', 'Нет'],
  },
  {
    key: 'q6MigCard' as const,
    short: '6.Soru',
    excelCol: '6.Soru (Есть миграционная карта)',
    tooltip: '6. Soru: У иностранца есть миграционная карта? (Migrasyon kartı var mı?)',
    options: ['Да', 'Нет'],
  },
];

interface RegistrationWorkerRow {
  id: string;
  sicil: string;
  adSoyad: string;
  famRu: string;
  imyaRu: string;
  otchRu: string;
  famLat: string;
  imyaLat: string;
  otchLat: string;
  citizenship: string;
  birthDate: string;
  gender: string;
  passportSeries: string;
  passportNumber: string;
  passportIssued: string;
  passportExpiry: string;
  passportIssuedBy: string;
  mkSeries: string;
  mkNumber: string;
  entryDate: string;
  regStart: string;
  regEnd: string;
  region: string;
  project: string;
  q1Action: string;
  q2Whom: string;
  q3Contract: string;
  q4StayDoc: string;
  q5PrevReg: string;
  q6MigCard: string;
  regAddress: string;
  prevRegAddress: string;
}

interface DocScanEntry {
  passport: string[];
  migration_card: string[];
  contract: string[];
  work_permit: string[];
  company_egrn: string[];
  company_passport: string[];
}

interface GosuslugiRegistrationPanelProps {
  activeBridgeUrl: string;
  bridgeStatus: BridgeStatus;
  onOpenChrome: () => void;
  isLaunchingChrome: boolean;
}

function todayRuDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function addMonthsRuDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function splitPassportSeriesNumber(raw: string): { series: string; number: string } {
  const clean = String(raw || '').trim();
  if (!clean) return { series: '', number: '' };
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return { series: parts[0], number: parts.slice(1).join('') };
  }
  const m = /^([A-Za-zА-Яа-я]{1,3})(\d{5,})$/.exec(clean);
  if (m) return { series: m[1], number: m[2] };
  return { series: '', number: clean };
}

export default function GosuslugiRegistrationPanel({
  activeBridgeUrl,
  bridgeStatus,
  onOpenChrome,
  isLaunchingChrome,
}: GosuslugiRegistrationPanelProps) {
  const { getAuthHeaders } = useAuth();
  const { lang } = useLanguage();

  const [workers, setWorkers] = useState<RegistrationWorkerRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [docFilter, setDocFilter] = useState<'all' | 'ready' | 'missing'>('all');
  const [copiedSicils, setCopiedSicils] = useState(false);

  const [employeeDocsDir, setEmployeeDocsDir] = useState<string>(() => {
    if (typeof window === 'undefined') return 'C:\\Pondera_Registre\\Dosyalar';
    return localStorage.getItem('pondera_reg_emp_dir') || 'C:\\Pondera_Registre\\Dosyalar';
  });
  const [companyDocsDir, setCompanyDocsDir] = useState<string>(() => {
    if (typeof window === 'undefined') return 'C:\\Pondera_Registre\\Firma';
    return localStorage.getItem('pondera_reg_comp_dir') || 'C:\\Pondera_Registre\\Firma';
  });
  const [regAddress, setRegAddress] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return '188471, обл. Ленинградская, р-н. Кингисеппский, п. Усть-Луга, кв-л. Краколье, соор. 1';
    }
    return (
      localStorage.getItem('pondera_reg_address') ||
      '188471, обл. Ленинградская, р-н. Кингисеппский, п. Усть-Луга, кв-л. Краколье, соор. 1'
    );
  });
  const [prevRegAddress, setPrevRegAddress] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('pondera_reg_prev_address') || '';
  });
  const [defaultRegStart, setDefaultRegStart] = useState<string>(todayRuDate());
  const [defaultRegEnd, setDefaultRegEnd] = useState<string>(addMonthsRuDate(9));
  const [autoSubmit, setAutoSubmit] = useState<boolean>(false);

  const [scanningDocs, setScanningDocs] = useState(false);
  const [docScanMap, setDocScanMap] = useState<Record<string, DocScanEntry>>({});
  const [dirStatus, setDirStatus] = useState<{ empOk?: boolean; compOk?: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [startingRobot, setStartingRobot] = useState(false);

  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('pondera_reg_emp_dir', employeeDocsDir);
      localStorage.setItem('pondera_reg_comp_dir', companyDocsDir);
      localStorage.setItem('pondera_reg_address', regAddress);
      localStorage.setItem('pondera_reg_prev_address', prevRegAddress);
    } catch {}
  }, [employeeDocsDir, companyDocsDir, regAddress, prevRegAddress]);

  const updateWorkerField = <K extends keyof RegistrationWorkerRow>(
    id: string,
    field: K,
    value: RegistrationWorkerRow[K]
  ) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  };

  const loadFromEbaPersonnel = async () => {
    setLoadingList(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/personnel?limit=500&status=Mevcut', {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const json = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      const mapped: RegistrationWorkerRow[] = rows
        .filter((r: any) => {
          const nat = String(r.uyruk || '').toUpperCase();
          return nat && !nat.includes('RUSYA') && !nat.includes('РОССИЯ');
        })
        .map((r: any, idx: number) => {
          const kirilParts = String(r.tam_adi_kiril || '').trim().split(/\s+/);
          const latParts = String(r.ad_soyad || '').trim().split(/\s+/);
          const pass = splitPassportSeriesNumber(r.pasaport_no || '');
          const mk = splitPassportSeriesNumber(r.migrasyon_no || '');
          const isBelarus = String(r.uyruk || '').toUpperCase().includes('BELARUS');
          return {
            id: `eba-${r.id || idx}`,
            sicil: String(r.sicil_no || '').trim(),
            adSoyad: String(r.ad_soyad || r.tam_adi_kiril || '').trim(),
            famRu: kirilParts[0] || '',
            imyaRu: kirilParts[1] || '',
            otchRu: kirilParts.slice(2).join(' ') || '',
            famLat: latParts[0] || '',
            imyaLat: latParts[1] || '',
            otchLat: latParts.slice(2).join(' ') || '',
            citizenship: String(r.uyruk || '').trim(),
            birthDate: String(r.dogum_tarihi || '').trim(),
            gender: String(r.cinsiyet || 'Erkek').toLowerCase().startsWith('k') ? 'Женский' : 'Мужской',
            passportSeries: pass.series,
            passportNumber: pass.number,
            passportIssued: '',
            passportExpiry: String(r.pasaport_gecerlilik || '').trim(),
            passportIssuedBy: '',
            mkSeries: mk.series,
            mkNumber: mk.number,
            entryDate: String(r.ise_giris_tarihi || '').trim(),
            regStart: defaultRegStart,
            regEnd: String(r.vize_bitis_tarihi || r.patent_bitis_tarihi || defaultRegEnd).trim(),
            region: String(r.region || '').trim(),
            project: String(r.proje_adi || '').trim(),
            q1Action: 'Поставить иностранца на учёт',
            q2Whom: 'Совершеннолетнего иностранца',
            q3Contract: 'Да',
            q4StayDoc: r.vize_no ? 'Виза' : 'Документ не нужен',
            q5PrevReg: 'Да',
            q6MigCard: isBelarus ? 'Нет' : 'Да',
            regAddress: '',
            prevRegAddress: '',
          };
        });
      setWorkers(mapped);
      setSelectedIds(new Set());
      setFeedback({
        type: 'success',
        text:
          lang === 'ru'
            ? `Загружено ${mapped.length} иностранных сотрудников из eBA.`
            : `eBA aktif listesinden ${mapped.length} yabancı personel yüklendi.`,
      });
    } catch {
      setFeedback({
        type: 'error',
        text: lang === 'ru' ? 'Не удалось загрузить список из eBA.' : 'eBA personel listesi alınamadı.',
      });
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadFromEbaPersonnel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadTemplate = () => {
    const sourceRows =
      selectedIds.size > 0
        ? workers.filter((w) => selectedIds.has(w.id))
        : workers.slice(0, 5);

    const sheetRows =
      sourceRows.length > 0
        ? sourceRows.map((w) => ({
            Sicil: w.sicil,
            Фамилия: w.famRu,
            Имя: w.imyaRu,
            Отчество: w.otchRu,
            'Фамилия(lat)': w.famLat,
            'Имя(lat)': w.imyaLat,
            'Отчество(lat)': w.otchLat,
            ТекущееГражданство: w.citizenship,
            ДатаРождения: w.birthDate,
            Пол: w.gender,
            СерияПаспорта: w.passportSeries,
            НомерПаспорта: w.passportNumber,
            ДатаВыдачи: w.passportIssued,
            СрокДействия: w.passportExpiry,
            ПаспортКемВыдан: w.passportIssuedBy,
            'Серия(МК)': w.mkSeries,
            'Номер(МК)': w.mkNumber,
            ДатаВъездаВРФ: w.entryDate,
            РегС: w.regStart || defaultRegStart,
            РегПО: w.regEnd || defaultRegEnd,
            '1.Soru (Что нужно сделать)': w.q1Action,
            '2.Soru (Кого поставить на учёт)': w.q2Whom,
            '3.Soru (Есть трудовой договор)': w.q3Contract,
            '4.Soru (Документ пребывания)': w.q4StayDoc,
            '5.Soru (Был другой адрес в РФ)': w.q5PrevReg,
            '6.Soru (Есть миграционная карта)': w.q6MigCard,
            АдресРегистрации: w.regAddress || regAddress,
            АдресРегистрацииСТР: w.prevRegAddress || prevRegAddress || regAddress,
          }))
        : [
            {
              Sicil: '902770',
              Фамилия: 'ИВАНОВ',
              Имя: 'ИВАН',
              Отчество: '',
              'Фамилия(lat)': 'IVANOV',
              'Имя(lat)': 'IVAN',
              'Отчество(lat)': '',
              ТекущееГражданство: 'УЗБЕКИСТАН',
              ДатаРождения: '15.05.1992',
              Пол: 'Мужской',
              СерияПаспорта: 'FA',
              НомерПаспорта: '1234567',
              ДатаВыдачи: '10.01.2022',
              СрокДействия: '10.01.2032',
              ПаспортКемВыдан: 'МВД РЕСПУБЛИКИ УЗБЕКИСТАН',
              'Серия(МК)': '4025',
              'Номер(МК)': '1234567',
              ДатаВъездаВРФ: '01.11.2026',
              РегС: defaultRegStart,
              РегПО: defaultRegEnd,
              '1.Soru (Что нужно сделать)': 'Поставить иностранца на учёт',
              '2.Soru (Кого поставить на учёт)': 'Совершеннолетнего иностранца',
              '3.Soru (Есть трудовой договор)': 'Да',
              '4.Soru (Документ пребывания)': 'Документ не нужен',
              '5.Soru (Был другой адрес в РФ)': 'Да',
              '6.Soru (Есть миграционная карта)': 'Да',
              АдресРегистрации: regAddress,
              АдресРегистрацииСТР: prevRegAddress || regAddress,
            },
          ];

    const legendRows = REG_QUESTIONS.map((q) => ({
      Sütun: q.short,
      'Excel Başlığı': q.excelCol,
      'Gosuslugi Sorusu': q.tooltip,
      'Geçerli Cevaplar': q.options.join(' | '),
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheetRows);
    const ws2 = XLSX.utils.json_to_sheet(legendRows);
    XLSX.utils.book_append_sheet(wb, ws1, 'Регистрация');
    XLSX.utils.book_append_sheet(wb, ws2, 'Sorular_Rehber');
    XLSX.writeFile(wb, `Pondera_Registre_Sablon_${todayRuDate()}.xlsx`);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        const parsed: RegistrationWorkerRow[] = rows
          .filter((r) => String(r['Sicil'] || r['Код'] || r['Фамилия'] || '').trim())
          .map((r, idx) => ({
            id: `xls-${idx}-${Date.now()}`,
            sicil: String(r['Sicil'] || r['Код'] || '').trim(),
            adSoyad: `${r['Фамилия'] || ''} ${r['Имя'] || ''}`.trim() || String(r['ФИО'] || ''),
            famRu: String(r['Фамилия'] || '').trim(),
            imyaRu: String(r['Имя'] || '').trim(),
            otchRu: String(r['Отчество'] || '').trim(),
            famLat: String(r['Фамилия(lat)'] || '').trim(),
            imyaLat: String(r['Имя(lat)'] || '').trim(),
            otchLat: String(r['Отчество(lat)'] || '').trim(),
            citizenship: String(r['ТекущееГражданство'] || r['Гражданство'] || '').trim(),
            birthDate: String(r['ДатаРождения'] || '').trim(),
            gender: String(r['Пол'] || 'Мужской').trim(),
            passportSeries: String(r['СерияПаспорта'] || '').trim(),
            passportNumber: String(r['НомерПаспорта'] || '').trim(),
            passportIssued: String(r['ДатаВыдачи'] || '').trim(),
            passportExpiry: String(r['СрокДействия'] || '').trim(),
            passportIssuedBy: String(r['ПаспортКемВыдан'] || '').trim(),
            mkSeries: String(r['Серия(МК)'] || '').trim(),
            mkNumber: String(r['Номер(МК)'] || '').trim(),
            entryDate: String(r['ДатаВъездаВРФ'] || '').trim(),
            regStart: String(r['РегС'] || defaultRegStart).trim(),
            regEnd: String(r['РегПО'] || defaultRegEnd).trim(),
            region: '',
            project: '',
            q1Action: String(r['1.Soru (Что нужно сделать)'] || r['1.Soru'] || 'Поставить иностранца на учёт').trim(),
            q2Whom: String(r['2.Soru (Кого поставить на учёт)'] || r['2.Soru'] || 'Совершеннолетнего иностранца').trim(),
            q3Contract: String(r['3.Soru (Есть трудовой договор)'] || r['3.Soru'] || 'Да').trim(),
            q4StayDoc: String(r['4.Soru (Документ пребывания)'] || r['4.Soru'] || 'Документ не нужен').trim(),
            q5PrevReg: String(r['5.Soru (Был другой адрес в РФ)'] || r['5.Soru'] || 'Да').trim(),
            q6MigCard: String(r['6.Soru (Есть миграционная карта)'] || r['6.Soru'] || 'Да').trim(),
            regAddress: String(r['АдресРегистрации'] || '').trim(),
            prevRegAddress: String(r['АдресРегистрацииСТР'] || '').trim(),
          }));
        setWorkers(parsed);
        setSelectedIds(new Set(parsed.map((w) => w.id)));
        setFeedback({
          type: 'success',
          text:
            lang === 'ru'
              ? `Из Excel загружено ${parsed.length} записей для регистрации.`
              : `Excel dosyasından ${parsed.length} kayıt yüklendi ve seçildi.`,
        });
      } catch {
        setFeedback({
          type: 'error',
          text: lang === 'ru' ? 'Ошибка чтения Excel файла.' : 'Excel dosyası okunamadı.',
        });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleScanLocalDocs = async () => {
    if (bridgeStatus.status !== 'online') {
      setFeedback({
        type: 'error',
        text: 'Yerel RPA Bridge bağlı değil. Bilgisayarınızdaki Pondera RPA Ajanını başlatın.',
      });
      return;
    }
    const targetList =
      selectedIds.size > 0 ? workers.filter((w) => selectedIds.has(w.id)) : workers.slice(0, 200);
    const sicils = Array.from(new Set(targetList.map((w) => w.sicil).filter(Boolean)));
    if (sicils.length === 0) return;

    setScanningDocs(true);
    setFeedback(null);
    try {
      const res = await fetch(`${activeBridgeUrl}/scan-registration-docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_docs_dir: employeeDocsDir,
          company_docs_dir: companyDocsDir,
          sicils,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setDocScanMap(json.results || {});
        setDirStatus({
          empOk: Boolean(json.employee_dir_exists),
          compOk: Boolean(json.company_dir_exists),
        });
        setFeedback({
          type: 'info',
          text: `${sicils.length} personel için yerel klasör taraması tamamlandı.`,
        });
      } else {
        setFeedback({ type: 'error', text: json?.message || 'Klasör taraması başarısız.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Yerel RPA köprüsüne bağlanılamadı (127.0.0.1:8088).' });
    } finally {
      setScanningDocs(false);
    }
  };

  const handleCopySicilList = () => {
    const target = selectedIds.size > 0 ? workers.filter((w) => selectedIds.has(w.id)) : filteredWorkers;
    const text = target.map((w) => w.sicil).filter(Boolean).join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSicils(true);
      setTimeout(() => setCopiedSicils(false), 2000);
    });
  };

  const handleStartRegistrationRobot = async () => {
    const selected = workers.filter((w) => selectedIds.has(w.id));
    if (selected.length === 0) {
      setFeedback({ type: 'error', text: 'Lütfen en az bir personel seçin.' });
      return;
    }
    setStartingRobot(true);
    setFeedback(null);
    try {
      const records = selected.map((w) => ({
        Sicil: w.sicil,
        Фамилия: w.famRu || w.adSoyad.split(' ')[0] || '',
        Имя: w.imyaRu || w.adSoyad.split(' ')[1] || '',
        Отчество: w.otchRu || '',
        'Фамилия(lat)': w.famLat,
        'Имя(lat)': w.imyaLat,
        'Отчество(lat)': w.otchLat,
        ТекущееГражданство: w.citizenship,
        ДатаРождения: w.birthDate,
        Пол: w.gender,
        СерияПаспорта: w.passportSeries,
        НомерПаспорта: w.passportNumber,
        ДатаВыдачи: w.passportIssued,
        СрокДействия: w.passportExpiry,
        ПаспортКемВыдан: w.passportIssuedBy,
        'Серия(МК)': w.mkSeries,
        'Номер(МК)': w.mkNumber,
        ДатаВъездаВРФ: w.entryDate,
        РегС: w.regStart || defaultRegStart,
        РегПО: w.regEnd || defaultRegEnd,
        Q1_Action: w.q1Action,
        Q2_Whom: w.q2Whom,
        Q3_Contract: w.q3Contract,
        Q4_StayDoc: w.q4StayDoc,
        Q5_PrevReg: w.q5PrevReg,
        Q6_MigCard: w.q6MigCard,
        АдресРегистрации: w.regAddress || regAddress,
        АдресРегистрацииСТР: w.prevRegAddress || prevRegAddress || w.regAddress || regAddress,
      }));
      const res = await fetch(`${activeBridgeUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'registration',
          records,
          config: {
            REG_ADDRESS: regAddress,
            PREV_REG_ADDRESS: prevRegAddress || regAddress,
            EMPLOYEE_DOCS_DIR: employeeDocsDir,
            COMPANY_DOCS_DIR: companyDocsDir,
            AUTO_SUBMIT: autoSubmit,
          },
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setFeedback({
          type: 'success',
          text: `Registre robotu ${records.length} personel için başlatıldı (600380/1).`,
        });
      } else {
        setFeedback({ type: 'error', text: json?.message || 'Robot başlatılamadı.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Yerel RPA Bridge (8088) erişilemiyor.' });
    } finally {
      setStartingRobot(false);
    }
  };

  const handlePauseResume = async () => {
    try {
      await fetch(`${activeBridgeUrl}/${bridgeStatus.paused ? 'resume' : 'pause'}`, { method: 'POST' });
    } catch {}
  };

  const handleStop = async () => {
    try {
      await fetch(`${activeBridgeUrl}/stop`, { method: 'POST' });
    } catch {}
  };

  const countReadyDocs = (sicil: string): number => {
    const d = docScanMap[sicil];
    if (!d) return 0;
    return (
      (d.passport.length > 0 ? 1 : 0) +
      (d.migration_card.length > 0 ? 1 : 0) +
      (d.contract.length > 0 ? 1 : 0) +
      (d.work_permit.length > 0 ? 1 : 0) +
      (d.company_egrn.length > 0 ? 1 : 0) +
      (d.company_passport.length > 0 ? 1 : 0)
    );
  };

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) => {
      if (q) {
        const hay = `${w.sicil} ${w.adSoyad} ${w.famRu} ${w.imyaRu} ${w.citizenship} ${w.project}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (docFilter === 'ready') return countReadyDocs(w.sicil) >= 5;
      if (docFilter === 'missing') return countReadyDocs(w.sicil) < 5;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, search, docFilter, docScanMap]);

  const toggleAll = () => {
    if (selectedIds.size === filteredWorkers.length && filteredWorkers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWorkers.map((w) => w.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-[#13213a] rounded-b-2xl rounded-tr-2xl border border-slate-200 dark:border-slate-600/80 shadow-sm p-4 sm:p-5 space-y-4">
      {/* Header & Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/80">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg text-slate-900 dark:text-white">
              {lang === 'ru'
                ? '4. Миграционный учёт (Регистрация — 600380/1)'
                : '4. Registre — Göç Kaydı (Уведомление о прибытии)'}
            </h2>
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-700">
              Gosuslugi 600380/1
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Her personel için 6 Gosuslugi sorusunu ve adresini hem varsayılan ayardan hem de satır bazında / Excel şablonundan yönetebilirsiniz.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenChrome}
            disabled={isLaunchingChrome}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Chrome Aç</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300/80 dark:border-amber-700 cursor-pointer"
            title="Tüm Gosuslugi soruları ve adres sütunlarıyla hazır Excel şablonunu indir"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Şablon İndir (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => excelInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Excel Yükle (.xlsx)</span>
          </button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />

          <button
            type="button"
            onClick={handleCopySicilList}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Seçili personellerin sicil listesini eBA toplu evrak indirme için kopyala"
          >
            {copiedSicils ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSicils ? 'Kopyalandı!' : 'eBA Sicil Kopyala'}</span>
          </button>

          <button
            type="button"
            onClick={loadFromEbaPersonnel}
            disabled={loadingList}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            <span>eBA Yenile</span>
          </button>
        </div>
      </div>

      {/* Default Folders & Default Addresses Card */}
      <div className="p-3.5 rounded-2xl bg-slate-50/90 dark:bg-[#0E1A2F] border border-slate-200/80 dark:border-slate-700/80 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-100">
            <Settings2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Varsayılan Evrak Klasörleri &amp; Adres Ayarları (Satırda boş olan personeller bunu kullanır)</span>
          </div>
          <button
            type="button"
            onClick={handleScanLocalDocs}
            disabled={scanningDocs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
          >
            {scanningDocs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderSearch className="w-3.5 h-3.5" />}
            <span>Klasörü Tara (6 Evrak Kontrolü)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div>
            <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">
              Personel Evrakları (Dosyalar)
              {dirStatus && (
                <span className={`ml-1.5 ${dirStatus.empOk ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {dirStatus.empOk ? '✓' : '✗'}
                </span>
              )}
            </label>
            <input
              type="text"
              value={employeeDocsDir}
              onChange={(e) => setEmployeeDocsDir(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">
              Şirket Sabit Evrakları (Firma)
              {dirStatus && (
                <span className={`ml-1.5 ${dirStatus.compOk ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {dirStatus.compOk ? '✓' : '✗'}
                </span>
              )}
            </label>
            <input
              type="text"
              value={companyDocsDir}
              onChange={(e) => setCompanyDocsDir(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">
              <MapPin className="w-3 h-3 inline mr-1" />
              Varsayılan Kayıt Adresi
            </label>
            <input
              type="text"
              value={regAddress}
              onChange={(e) => setRegAddress(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">
              Varsayılan Önceki Adres (СТР)
            </label>
            <input
              type="text"
              value={prevRegAddress}
              onChange={(e) => setPrevRegAddress(e.target.value)}
              placeholder="Boşsa Kayıt Adresi kullanılır"
              className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">РегС</label>
              <input
                type="text"
                value={defaultRegStart}
                onChange={(e) => setDefaultRegStart(e.target.value)}
                className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1">РегПО</label>
              <input
                type="text"
                value={defaultRegEnd}
                onChange={(e) => setDefaultRegEnd(e.target.value)}
                className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
          <span>
            Soru başlıklarının (<strong>1.Soru – 6.Soru</strong>) üzerine fare ile gelerek tam Gosuslugi sorusunu görebilir, kişi bazında değiştirebilirsiniz.
          </span>
          <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => setAutoSubmit(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600"
            />
            <span>Son ekranda &laquo;Отправить уведомление&raquo; otomatik basılsın</span>
          </label>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200'
          }`}
        >
          {feedback.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Search + Robot Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sicil, Ad Soyad, Uyruk, Şantiye ara..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-60 text-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
          >
            <option value="all">Tümü ({workers.length})</option>
            <option value="ready">Evrakı Hazır (≥5/6)</option>
            <option value="missing">Eksik Evraklı</option>
          </select>

          <span className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-indigo-500" />
            Seçili: <span className="text-indigo-700 dark:text-indigo-300">{selectedIds.size}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartRegistrationRobot}
            disabled={startingRobot || selectedIds.size === 0 || bridgeStatus.running}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {startingRobot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>Registre Robotunu Başlat ({selectedIds.size})</span>
          </button>

          {bridgeStatus.running && (
            <>
              <button
                type="button"
                onClick={handlePauseResume}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs bg-amber-500 hover:bg-amber-600 text-white cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>{bridgeStatus.paused ? 'Devam Et' : 'Duraklat'}</span>
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Durdur</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Employee Queue + All 6 Gosuslugi Q&A + Per-Row Editable Addresses + 6-Doc Badges */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/80 max-h-[500px] overflow-y-auto">
        <table className="w-full text-left text-[11px] whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-[#0D192E] text-[10.5px] text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="py-2.5 px-2.5 w-8">
                <input
                  type="checkbox"
                  checked={filteredWorkers.length > 0 && selectedIds.size === filteredWorkers.length}
                  onChange={toggleAll}
                  className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-2">Sicil</th>
              <th className="py-2.5 px-2">Ad Soyad / Kiril</th>
              <th className="py-2.5 px-2">Uyruk &amp; Pasaport</th>
              <th className="py-2.5 px-2">РегС — РегПО</th>
              {REG_QUESTIONS.map((q) => (
                <th
                  key={q.key}
                  title={q.tooltip}
                  className="py-2.5 px-1.5 cursor-help border-l border-slate-200/70 dark:border-slate-700/70"
                >
                  <span className="inline-flex items-center gap-0.5 text-indigo-700 dark:text-indigo-300">
                    <span>{q.short}</span>
                    <HelpCircle className="w-3 h-3 opacity-70" />
                  </span>
                </th>
              ))}
              <th className="py-2.5 px-2 border-l border-slate-200/70 dark:border-slate-700/70" title="Boş bırakılırsa üstteki Varsayılan Kayıt Adresi kullanılır">
                Kayıt Adresi (Özel)
              </th>
              <th className="py-2.5 px-2" title="Boş bırakılırsa üstteki Varsayılan Önceki Adres kullanılır">
                Önceki Adres (СТР)
              </th>
              <th className="py-2.5 px-2 border-l border-slate-200/70 dark:border-slate-700/70">6 Evrak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredWorkers.slice(0, 150).map((w) => {
              const d = docScanMap[w.sicil];
              const slots: Array<{ key: keyof DocScanEntry; label: string }> = [
                { key: 'passport', label: 'PAS' },
                { key: 'migration_card', label: 'MIG' },
                { key: 'contract', label: 'TD' },
                { key: 'work_permit', label: 'RNR' },
                { key: 'company_egrn', label: 'EGRN' },
                { key: 'company_passport', label: 'YETK' },
              ];
              return (
                <tr key={w.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                  <td className="py-2 px-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(w.id)}
                      onChange={() => toggleOne(w.id)}
                      className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                  </td>
                  <td className="py-2 px-2 font-mono text-slate-900 dark:text-white">{w.sicil || '—'}</td>
                  <td className="py-2 px-2">
                    <div className="text-slate-900 dark:text-white max-w-[160px] truncate" title={w.adSoyad}>{w.adSoyad}</div>
                    {(w.famRu || w.imyaRu) && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                        {`${w.famRu} ${w.imyaRu}`.trim()}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <div className="text-slate-800 dark:text-slate-200">{w.citizenship || '—'}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {`${w.passportSeries} ${w.passportNumber}`.trim() || '—'}
                    </div>
                  </td>
                  <td className="py-2 px-2 font-mono text-[10.5px] text-slate-700 dark:text-slate-300">
                    {w.regStart || defaultRegStart} — {w.regEnd || defaultRegEnd}
                  </td>

                  {/* 1.Soru .. 6.Soru Per-Person Inline Selectors */}
                  {REG_QUESTIONS.map((q) => (
                    <td key={q.key} className="py-1.5 px-1 border-l border-slate-100 dark:border-slate-800/70">
                      <select
                        value={w[q.key]}
                        title={`${q.tooltip}\nSeçili: ${w[q.key]}`}
                        onChange={(e) => updateWorkerField(w.id, q.key, e.target.value)}
                        className="px-1.5 py-1 text-[10.5px] rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 max-w-[115px] truncate cursor-pointer"
                      >
                        {q.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}

                  {/* Per-Person Custom Registration Address */}
                  <td className="py-1.5 px-1.5 border-l border-slate-100 dark:border-slate-800/70">
                    <input
                      type="text"
                      value={w.regAddress}
                      onChange={(e) => updateWorkerField(w.id, 'regAddress', e.target.value)}
                      placeholder={regAddress.slice(0, 26) + '…'}
                      title={w.regAddress || `Varsayılan: ${regAddress}`}
                      className="w-40 px-2 py-1 text-[10.5px] rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </td>

                  {/* Per-Person Custom Previous Address */}
                  <td className="py-1.5 px-1.5">
                    <input
                      type="text"
                      value={w.prevRegAddress}
                      onChange={(e) => updateWorkerField(w.id, 'prevRegAddress', e.target.value)}
                      placeholder="Varsayılan"
                      title={w.prevRegAddress || `Varsayılan: ${prevRegAddress || regAddress}`}
                      className="w-36 px-2 py-1 text-[10.5px] rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </td>

                  <td className="py-2 px-2 border-l border-slate-100 dark:border-slate-800/70">
                    <div className="flex gap-0.5">
                      {slots.map((s) => {
                        const files = d ? d[s.key] : [];
                        const ok = files.length > 0;
                        return (
                          <span
                            key={s.key}
                            title={ok ? files.join(', ') : `${s.label} bulunamadı`}
                            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9.5px] border ${
                              !d
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                                : ok
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300/70 dark:border-emerald-700'
                                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {!d ? null : ok ? <FileCheck2 className="w-2.5 h-2.5" /> : <FileX2 className="w-2.5 h-2.5" />}
                            {s.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredWorkers.length === 0 && (
              <tr>
                <td colSpan={14} className="py-8 text-center text-slate-500">
                  <FileSpreadsheet className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
                  Kayıt bulunamadı. eBA listesini yenileyin veya Excel yükleyin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Live Bridge Log Tail */}
      {bridgeStatus.logs && bridgeStatus.logs.length > 0 && (
        <div className="p-3 rounded-2xl bg-slate-950 text-emerald-300 font-mono text-[11px] max-h-40 overflow-y-auto space-y-0.5 border border-slate-700">
          <div className="flex items-center gap-1.5 text-slate-400 text-[10px] pb-1 mb-1 border-b border-slate-800">
            <Terminal className="w-3 h-3" />
            <span>Canlı RPA Bridge Logu ({bridgeStatus.status.toUpperCase()})</span>
          </div>
          {bridgeStatus.logs.slice(-15).map((l, i) => (
            <div key={i} className="truncate">
              <span className="text-slate-500 mr-2">[{l.time}]</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
