'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  Bot,
  FileSpreadsheet,
  Download,
  Upload,
  Play,
  Square,
  Globe,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Terminal,
  Loader2,
  Search,
  Database,
  Trash2,
  Settings2,
  Calendar,
  MapPin,
  Check,
  Edit3,
  Sparkles,
  ShieldCheck,
  Users,
  Activity,
  ShieldAlert,
  UserMinus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  exportGosuslugiDismissalExcel,
  GosuslugiDismissalWorkerRecord,
} from '@/lib/exportGosuslugiDismissalExcel';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface BridgeStatus {
  status: 'online' | 'offline';
  running: boolean;
  mode?: string;
  chrome_ready: boolean;
  total: number;
  processed: number;
  success: number;
  errors: number;
  active_worker_code?: string | null;
  active_worker_name?: string | null;
  waiting_for_manual?: boolean;
  manual_message?: string | null;
  completed_codes?: string[];
  error_codes?: string[];
  logs: Array<{ time: string; text: string }>;
}

export interface DismissalValidationIssue {
  field:
    | 'name'
    | 'birthDate'
    | 'citizenship'
    | 'passport'
    | 'patent'
    | 'dates'
    | 'position';
  ru: string;
  tr: string;
}

export interface DismissalValidationResult {
  isValid: boolean;
  issues: DismissalValidationIssue[];
  fieldErrors: Partial<Record<DismissalValidationIssue['field'], string[]>>;
}

type QueueFilterMode = 'all' | 'ready' | 'invalid' | 'sent';

const CITIZENSHIP_MAP_RU: Record<string, string> = {
  TURKIYE: 'Турция',
  TÜRKİYE: 'Турция',
  OZBEKISTAN: 'Узбекистан',
  ÖZBEKİSTAN: 'Узбекистан',
  TACIKISTAN: 'Таджикистан',
  TACİKİSTAN: 'Таджикистан',
  HINDISTAN: 'Индия',
  HİNDİSTAN: 'Индия',
  AZERBAYCAN: 'Азербайджан',
  KIRGIZISTAN: 'Кыргызстан',
  KAZAKISTAN: 'Казахстан',
  TURKMENISTAN: 'Туркменистан',
  BELARUS: 'Беларусь',
  CIN: 'Китай',
  FILIPINLER: 'Филиппины',
  BANGLADES: 'Бангладеш',
  PAKISTAN: 'Пакистан',
  RUSYA: 'Россия',
};

function parseStrictDateRu(val: string | undefined | null): {
  valid: boolean;
  empty: boolean;
  ts: number;
} {
  const raw = String(val || '').trim();
  if (!raw) return { valid: false, empty: true, ts: 0 };
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (!m) return { valid: false, empty: false, ts: 0 };
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (yyyy < 1930 || yyyy > 2050 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return { valid: false, empty: false, ts: 0 };
  }
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) {
    return { valid: false, empty: false, ts: 0 };
  }
  return { valid: true, empty: false, ts: d.getTime() };
}

export function validateDismissalWorkerRecord(
  w: GosuslugiDismissalWorkerRecord,
  lang: 'ru' | 'tr' = 'ru'
): DismissalValidationResult {
  const issues: DismissalValidationIssue[] = [];
  const addIssue = (field: DismissalValidationIssue['field'], ru: string, tr: string) => {
    issues.push({ field, ru, tr });
  };

  // 1. Name
  if (!w.firstName || !w.firstName.trim()) {
    addIssue('name', 'Не указано Имя', 'Ad (Имя) alanı boş');
  }
  if (!w.lastName || !w.lastName.trim()) {
    addIssue('name', 'Не указана Фамилия (если нет — «Нет»)', 'Soyadı (Фамилия) boş (yoksa «Нет»)');
  }

  // 2. Citizenship
  if (!w.citizenship || !w.citizenship.trim()) {
    addIssue('citizenship', 'Не указано гражданство', 'Uyruk (Гражданство) eksik');
  }

  // 3. Birth Date
  const bDate = parseStrictDateRu(w.birthDate);
  if (bDate.empty) {
    addIssue('birthDate', 'Отсутствует дата рождения', 'Doğum tarihi eksik');
  } else if (!bDate.valid) {
    addIssue('birthDate', `Неверный формат даты рождения (${w.birthDate})`, `Geçersiz doğum tarihi (${w.birthDate})`);
  }

  // 4. Passport
  if (!w.passportNumber || !w.passportNumber.trim()) {
    addIssue('passport', 'Отсутствует номер паспорта', 'Pasaport numarası eksik');
  }
  if (!w.passportIssuedBy || !w.passportIssuedBy.trim()) {
    addIssue('passport', 'Не указано, кем выдан паспорт', 'Pasaportu veren makam eksik');
  }
  const pIssue = parseStrictDateRu(w.passportIssueDate);
  if (pIssue.empty) {
    addIssue('passport', 'Отсутствует дата выдачи паспорта', 'Pasaport veriliş tarihi eksik');
  } else if (!pIssue.valid) {
    addIssue(
      'passport',
      `Некорректная дата выдачи паспорта (${w.passportIssueDate})`,
      `Geçersiz pasaport veriliş tarihi (${w.passportIssueDate})`
    );
  }

  // 5. Patent / RNR
  if (!w.patentSeries || !w.patentSeries.trim()) {
    addIssue('patent', 'Отсутствует серия патента/РНР', 'Patent/Çalışma izni seri no eksik');
  }
  if (!w.patentNumber || !w.patentNumber.trim()) {
    addIssue('patent', 'Отсутствует номер патента/РНР', 'Patent/Çalışma izni numarası eksik');
  }
  if (!w.blankSeries || !w.blankSeries.trim()) {
    addIssue('patent', 'Отсутствует серия бланка (СерийныйНомер1)', 'Бланк seri no (СерийныйНомер1) eksik');
  }
  if (!w.blankNumber || !w.blankNumber.trim()) {
    addIssue('patent', 'Отсутствует номер бланка (СерийныйНомер2)', 'Бланк numarası (СерийныйНомер2) eksik');
  }

  // 6. Dismissal Date & Hire Date
  const dDismiss = parseStrictDateRu(w.dismissalDate);
  const dHire = parseStrictDateRu(w.hireDate);
  if (dDismiss.empty) {
    addIssue('dates', 'Отсутствует дата увольнения (ДатаУволь)', 'İşten çıkış tarihi (ДатаУволь) eksik');
  } else if (!dDismiss.valid) {
    addIssue(
      'dates',
      `Некорректная дата увольнения (${w.dismissalDate})`,
      `Geçersiz işten çıkış tarihi (${w.dismissalDate})`
    );
  }
  if (!dHire.empty && !dHire.valid) {
    addIssue(
      'dates',
      `Некорректная дата приема (${w.hireDate})`,
      `Geçersiz işe giriş tarihi (${w.hireDate})`
    );
  }
  if (dHire.valid && dDismiss.valid && dDismiss.ts < dHire.ts) {
    addIssue(
      'dates',
      `Дата увольнения (${w.dismissalDate}) раньше даты приема (${w.hireDate})`,
      `Çıkış tarihi (${w.dismissalDate}) giriş tarihinden (${w.hireDate}) önce olamaz`
    );
  }

  // 7. Position
  if (!w.position || !w.position.trim()) {
    addIssue('position', 'Не указана должность', 'Görev / Ünvan (Должность) eksik');
  }

  const fieldErrors: Partial<Record<DismissalValidationIssue['field'], string[]>> = {};
  for (const item of issues) {
    const msg = lang === 'ru' ? item.ru : item.tr;
    if (!fieldErrors[item.field]) {
      fieldErrors[item.field] = [];
    }
    fieldErrors[item.field]!.push(msg);
  }

  return {
    isValid: issues.length === 0,
    issues,
    fieldErrors,
  };
}

interface GosuslugiDismissalPanelProps {
  activeBridgeUrl: string;
  bridgeStatus: BridgeStatus;
  onOpenChrome: () => Promise<void>;
  isLaunchingChrome: boolean;
  onShowAgentGuide: () => void;
}

export default function GosuslugiDismissalPanel({
  activeBridgeUrl,
  bridgeStatus,
  onOpenChrome,
  isLaunchingChrome,
  onShowAgentGuide,
}: GosuslugiDismissalPanelProps) {
  const { user } = useAuth();
  const { lang } = useLanguage();

  // Dismissal Default Form Configuration (from Powerise gosuslugi_dismissal_robot.py)
  const [patentRegion, setPatentRegion] = useState('Ленинградская');
  const [patentRegionFull, setPatentRegionFull] = useState('Ленинградская область');
  const [workAddress, setWorkAddress] = useState(
    '188471, Ленинградская обл, Кингисеппский р-н, поселок Усть-Луга'
  );
  const [ufmsDept, setUfmsDept] = useState(
    'ОПВМ ОМВД России по Кингисеппскому району Ленинградской области'
  );
  const [okvedCode, setOkvedCode] = useState('42.99');
  const [okvedText, setOkvedText] = useState('Строительство прочих инженерных сооружений, не');
  const [defaultVoluntary, setDefaultVoluntary] = useState('Да');
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const [workers, setWorkers] = useState<GosuslugiDismissalWorkerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueFilter, setQueueFilter] = useState<QueueFilterMode>('all');
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isStartingRobot, setIsStartingRobot] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  const formatDateRu = (val: any): string => {
    if (!val && val !== 0) return '';
    if (typeof val === 'number' && val > 20000 && val < 80000) {
      const utcDays = Math.floor(val - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.slice(0, 10).split('-');
      return `${d}.${m}.${y}`;
    }
    return str;
  };

  // Sync live status from bridgeStatus
  const syncedWorkers = useMemo(() => {
    return workers.map((w) => {
      const codeKey = w.code || w.sicil;
      if (bridgeStatus.completed_codes && codeKey && bridgeStatus.completed_codes.includes(codeKey)) {
        return { ...w, status: 'success' as const };
      }
      if (bridgeStatus.error_codes && codeKey && bridgeStatus.error_codes.includes(codeKey)) {
        return { ...w, status: 'error' as const };
      }
      const isCurrent =
        bridgeStatus.running &&
        bridgeStatus.mode === 'dismissal' &&
        ((bridgeStatus.active_worker_code && codeKey === bridgeStatus.active_worker_code) ||
          (bridgeStatus.active_worker_name &&
            `${w.lastName} ${w.firstName}`
              .toLowerCase()
              .includes(bridgeStatus.active_worker_name.toLowerCase())));
      if (isCurrent) {
        return { ...w, status: 'processing' as const };
      }
      return w;
    });
  }, [workers, bridgeStatus]);

  const validationMap = useMemo(() => {
    const map: Record<string, DismissalValidationResult> = {};
    for (const w of syncedWorkers) {
      map[w.id] = validateDismissalWorkerRecord(w, lang === 'ru' ? 'ru' : 'tr');
    }
    return map;
  }, [syncedWorkers, lang]);

  const applyInitialValidationSelection = (list: GosuslugiDismissalWorkerRecord[]) => {
    let validCnt = 0;
    let invalidCnt = 0;
    const processed = list.map((w) => {
      const v = validateDismissalWorkerRecord(w, lang === 'ru' ? 'ru' : 'tr');
      if (v.isValid) {
        validCnt++;
        return { ...w, selected: true };
      } else {
        invalidCnt++;
        return { ...w, selected: false };
      }
    });
    return { processed, validCnt, invalidCnt };
  };

  // Load dismissed employees from Pondera HR SQLite Database
  const handleLoadFromDatabase = async () => {
    setIsLoadingDb(true);
    try {
      const params = new URLSearchParams({
        status: 'Ayrılan',
        includeDetails: 'true',
        limit: '500',
      });
      if (user) {
        params.set('userScopeType', user.scope_type);
        params.set('userScopeValue', user.scope_value);
      }

      const res = await fetch(`/api/personnel?${params.toString()}`);
      const json = await res.json();

      if (!json.success || !json.data || json.data.length === 0) {
        showNotice(
          'info',
          lang === 'ru'
            ? 'В базе не найдено уволенных сотрудников. Попробуйте загрузить Excel.'
            : 'Veritabanında işten ayrılan personel bulunamadı. Excel yüklemeyi deneyin.'
        );
        return;
      }

      const rawMapped: GosuslugiDismissalWorkerRecord[] = json.data.map((emp: any, idx: number) => {
        const raw = emp.raw || {};
        const sicil = String(emp.sicil_no || raw['Sicil No'] || '');
        const lastNameRu = String(raw['Soyadı (Kiril)'] || emp.soyadi || '').trim();
        const firstNameRu = String(raw['Adı (Kiril)'] || emp.adi || '').trim();
        const middleNameRu = String(raw['Baba Adı (Kiril)'] || emp.baba_adi || '').trim();
        const rawNat = String(emp.uyruk || raw['Uyruk'] || 'OZBEKISTAN').toUpperCase();
        const citizenshipRu = CITIZENSHIP_MAP_RU[rawNat] || rawNat;
        const genderRaw = String(emp.cinsiyet || raw['Cinsiyet'] || 'Erkek');
        const genderRu =
          genderRaw.toLowerCase().startsWith('k') || genderRaw.toLowerCase().startsWith('ж')
            ? 'Женский'
            : 'Мужской';

        return {
          id: `db-dis-${emp.id || idx}`,
          selected: true,
          status: 'pending',
          sicil,
          code: sicil,
          lastName: lastNameRu,
          firstName: firstNameRu,
          middleName: middleNameRu,
          birthDate: formatDateRu(emp.dogum_tarihi || raw['Doğum Tarihi']),
          gender: genderRu,
          hireDate: formatDateRu(emp.ise_giris_tarihi || raw['İşe Giriş Tarihi']),
          dismissalDate: formatDateRu(emp.isten_cikis_tarihi || raw['İşten Çıkış Tarihi']),
          citizenship: citizenshipRu,
          passportSeries: String(raw['Pasaport Seri No'] || ''),
          passportNumber: String(emp.pasaport_no || raw['Pasaport No'] || ''),
          passportIssueDate: formatDateRu(raw['Pasaport Düzenleme Tarihi']),
          passportIssuedBy: String(raw['Pasaportu Veren Makam (Kiril)'] || ''),
          patentSeries: String(raw['Çalışma Kart Seri No'] || ''),
          patentNumber: String(raw['Çalışma Kart No'] || ''),
          patentIssueDate: formatDateRu(
            raw['Çalışma Kart Alış Tarihi'] || raw['Çalışma Kart Başlangıç Tarihi']
          ),
          blankSeries: String(raw['Patent Form Seri No'] || ''),
          blankNumber: String(raw['Patent Form No'] || ''),
          position: String(raw['Resmi Görevi'] || raw['Çalışma Kart Görevi'] || emp.unvan || 'Монтажник'),
          voluntaryResignation: defaultVoluntary,
        };
      });

      const { processed, validCnt, invalidCnt } = applyInitialValidationSelection(rawMapped);
      setWorkers(processed);
      setQueueFilter('all');

      if (invalidCnt > 0) {
        showNotice(
          'info',
          lang === 'ru'
            ? `Загружено ${processed.length} уволенных: ${validCnt} готовы к отправке, ${invalidCnt} заблокированы из-за неполных данных.`
            : `${processed.length} işten çıkan personel yüklendi: ${validCnt} satır hazır, ${invalidCnt} satır eksik veri nedeniyle bloke edildi.`
        );
      } else {
        showNotice(
          'success',
          lang === 'ru'
            ? `Загружено ${processed.length} уволенных сотрудников — все данные корректны!`
            : `${processed.length} işten çıkan personel yüklendi — tüm veriler geçerli!`
        );
      }
    } catch {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Ошибка при загрузке уволенных из базы данных.'
          : 'Veritabanından işten çıkanlar yüklenirken hata oluştu.'
      );
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Upload & Parse Excel File (Powerise 21-column format)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const sheetName = wb.SheetNames.includes('Лист2')
          ? 'Лист2'
          : wb.SheetNames.includes('Sheet1')
          ? 'Sheet1'
          : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length <= 1) {
          showNotice(
            'error',
            lang === 'ru'
              ? 'Файл Excel пуст или содержит только заголовки.'
              : 'Excel dosyası boş veya sadece başlık içeriyor.'
          );
          return;
        }

        const header = data[0].map((h: any) => String(h || '').trim());
        const rows = data.slice(1);

        const findCol = (candidates: string[], fallbackIdx: number): number => {
          for (const c of candidates) {
            const idx = header.findIndex((h) => h.toLowerCase() === c.toLowerCase());
            if (idx !== -1) return idx;
          }
          return fallbackIdx;
        };

        const idxSicil = findCol(['Sicil', 'Sicil No', 'Табельный'], 0);
        const idxCode = findCol(['Код', 'Code', 'Sicil'], 1);
        const idxLastName = findCol(['Фамилия', 'Soyadı (Kiril)', 'Soyadı'], 2);
        const idxFirstName = findCol(['Имя', 'Adı (Kiril)', 'Adı'], 3);
        const idxMiddleName = findCol(['Отчество', 'Baba Adı (Kiril)', 'Baba Adı'], 4);
        const idxBirthDate = findCol(['ДатаРождения', 'Дата рождения', 'Doğum Tarihi'], 5);
        const idxGender = findCol(['Пол', 'Cinsiyet'], 6);
        const idxHireDate = findCol(['ДатаПриема', 'Дата приема', 'İşe Giriş Tarihi'], 7);
        const idxDismissDate = findCol(['ДатаУволь', 'Дата увольнения', 'İşten Çıkış Tarihi'], 8);
        const idxCitizenship = findCol(['ТекущееГражданство', 'Гражданство', 'Uyruk'], 9);
        const idxPassSeries = findCol(['СерияПаспорта', 'Pasaport Seri No'], 10);
        const idxPassNumber = findCol(['НомерПаспорта', 'Pasaport No'], 11);
        const idxPassIssueDate = findCol(['ДатаВыдачи', 'Pasaport Düzenleme Tarihi'], 12);
        const idxPassIssuedBy = findCol(['ПаспортКемВыдан', 'Pasaportu Veren Makam (Kiril)'], 13);
        const idxPatentSeries = findCol(['Серия', 'Çalışma Kart Seri No'], 14);
        const idxPatentNumber = findCol(['Номер', 'Çalışma Kart No'], 15);
        const idxPatentIssueDate = findCol(['ДатаВыдачиВКС', 'Çalışma Kart Alış Tarihi'], 16);
        const idxBlank1 = findCol(['СерийныйНомер1', 'Patent Form Seri No'], 17);
        const idxBlank2 = findCol(['СерийныйНомер2', 'Patent Form No'], 18);
        const idxPosition = findCol(['Должность', 'Resmi Görevi', 'Görevi'], 19);
        const idxVoluntary = findCol(['УвПоСобствЖел'], 20);

        const getVal = (r: any[], colIdx: number) => {
          if (colIdx < 0 || colIdx >= r.length) return '';
          const v = r[colIdx];
          return v !== undefined && v !== null ? String(v).trim() : '';
        };

        const rawMapped: GosuslugiDismissalWorkerRecord[] = [];
        rows.forEach((r, idx) => {
          if (!r || r.length === 0) return;
          const lName = getVal(r, idxLastName);
          const fName = getVal(r, idxFirstName);
          const sicilCell = getVal(r, idxSicil);
          if (!lName && !fName && !sicilCell) return;

          const sicilVal = sicilCell || String(idx + 1);
          const codeVal = getVal(r, idxCode) || sicilVal;
          const citVal = getVal(r, idxCitizenship) || 'Узбекистан';

          rawMapped.push({
            id: `excel-dis-${idx}`,
            selected: true,
            status: 'pending',
            sicil: sicilVal,
            code: codeVal,
            lastName: lName,
            firstName: fName,
            middleName: getVal(r, idxMiddleName),
            birthDate: formatDateRu(r[idxBirthDate]),
            gender: getVal(r, idxGender) || 'Мужской',
            hireDate: formatDateRu(r[idxHireDate]),
            dismissalDate: formatDateRu(r[idxDismissDate]),
            citizenship: CITIZENSHIP_MAP_RU[citVal.toUpperCase()] || citVal,
            passportSeries: getVal(r, idxPassSeries),
            passportNumber: getVal(r, idxPassNumber),
            passportIssueDate: formatDateRu(r[idxPassIssueDate]),
            passportIssuedBy: getVal(r, idxPassIssuedBy),
            patentSeries: getVal(r, idxPatentSeries),
            patentNumber: getVal(r, idxPatentNumber),
            patentIssueDate: formatDateRu(r[idxPatentIssueDate]),
            blankSeries: getVal(r, idxBlank1),
            blankNumber: getVal(r, idxBlank2),
            position: getVal(r, idxPosition) || 'Монтажник',
            voluntaryResignation: getVal(r, idxVoluntary) || defaultVoluntary,
          });
        });

        const { processed, validCnt, invalidCnt } = applyInitialValidationSelection(rawMapped);
        setWorkers(processed);
        setQueueFilter('all');

        if (invalidCnt > 0) {
          showNotice(
            'info',
            lang === 'ru'
              ? `Импортировано ${processed.length} строк из Excel (${sheetName}): ${validCnt} готовы, ${invalidCnt} содержат ошибки/пропуски.`
              : `Excel'den (${sheetName}) ${processed.length} satır yüklendi: ${validCnt} satır hazır, ${invalidCnt} satırda eksik/hatalı veri var.`
          );
        } else {
          showNotice(
            'success',
            lang === 'ru'
              ? `Импортировано ${processed.length} записей увольнения из Excel (${sheetName}) — все данные корректны!`
              : `Excel (${sheetName}) dosyasından ${processed.length} işten çıkış kaydı yüklendi — tüm veriler geçerli!`
          );
        }
      } catch {
        showNotice(
          'error',
          lang === 'ru' ? 'Ошибка чтения файла Excel.' : 'Excel dosyası okunurken hata oluştu.'
        );
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const getSampleDismissalRecord = (): GosuslugiDismissalWorkerRecord => ({
    id: 'sample-dis-1',
    selected: true,
    status: 'pending',
    sicil: '482556',
    code: '482556',
    lastName: 'ИБРАГИМОВ',
    firstName: 'РУСТАМ',
    middleName: 'АЛИШЕРОВИЧ',
    birthDate: '14.05.1991',
    gender: 'Мужской',
    hireDate: '10.03.2026',
    dismissalDate: '15.10.2026',
    citizenship: 'Узбекистан',
    passportSeries: 'FA',
    passportNumber: '4829103',
    passportIssueDate: '12.08.2021',
    passportIssuedBy: 'МВД РЕСПУБЛИКИ УЗБЕКИСТАН',
    patentSeries: '47',
    patentNumber: '2600148291',
    patentIssueDate: '01.03.2026',
    blankSeries: 'АА',
    blankNumber: '1948201',
    position: 'Монтажник',
    voluntaryResignation: 'Да',
  });

  const handleLoadSample = () => {
    setWorkers([getSampleDismissalRecord()]);
    setQueueFilter('all');
    showNotice(
      'success',
      lang === 'ru'
        ? 'Тестовая запись на увольнение (ИБРАГИМОВ РУСТАМ) загружена!'
        : 'Örnek işten çıkış kaydı (ИБРАГИМОВ РУСТАМ) listeye yüklendi!'
    );
  };

  const handleExportExcel = () => {
    if (workers.length === 0) {
      exportGosuslugiDismissalExcel([getSampleDismissalRecord()]);
      showNotice(
        'info',
        lang === 'ru'
          ? 'Скачан шаблон Excel для увольнений (GosUsluga_uvolneniya).'
          : 'Örnek işten çıkış Excel şablonu indirildi.'
      );
      return;
    }
    exportGosuslugiDismissalExcel(workers);
    showNotice(
      'success',
      lang === 'ru' ? 'Список увольнений выгружен в Excel!' : 'İşten çıkış listesi Excel olarak indirildi!'
    );
  };

  const handleUpdateWorkerField = (
    id: string,
    field: keyof GosuslugiDismissalWorkerRecord,
    val: string
  ) => {
    setWorkers((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const wasValid = validateDismissalWorkerRecord(w, lang === 'ru' ? 'ru' : 'tr').isValid;
        const updated = { ...w, [field]: val };
        const nowValid = validateDismissalWorkerRecord(updated, lang === 'ru' ? 'ru' : 'tr').isValid;
        return {
          ...updated,
          selected: !nowValid ? false : !wasValid && nowValid ? true : updated.selected,
        };
      })
    );
  };

  const handleToggleSelectAll = () => {
    const validRows = syncedWorkers.filter((w) => validationMap[w.id]?.isValid);
    const allValidSelected = validRows.length > 0 && validRows.every((w) => w.selected);
    setWorkers((prev) =>
      prev.map((w) => {
        if (!validationMap[w.id]?.isValid) return { ...w, selected: false };
        return { ...w, selected: !allValidSelected };
      })
    );
  };

  const handleToggleWorker = (id: string) => {
    const v = validationMap[id];
    if (v && !v.isValid) {
      setEditingRowId(id);
      showNotice(
        'error',
        lang === 'ru'
          ? `Строка содержит ошибки (${v.issues.map((i) => i.ru).join('; ')})! Исправьте выделенные поля перед выбором.`
          : `Bu satırda eksik/hatalı veri var (${v.issues.map((i) => i.tr).join('; ')})! İşleme almak için önce hatalı alanları düzeltin.`
      );
      return;
    }
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, selected: !w.selected } : w)));
  };

  const buildPayloadRecords = (list: GosuslugiDismissalWorkerRecord[]) =>
    list.map((w) => ({
      Sicil: w.sicil,
      Код: w.code || w.sicil,
      Фамилия: w.lastName,
      Имя: w.firstName,
      Отчество: w.middleName,
      ДатаРождения: w.birthDate,
      Пол: w.gender,
      ДатаПриема: w.hireDate,
      ДатаУволь: w.dismissalDate,
      ТекущееГражданство: w.citizenship,
      СерияПаспорта: w.passportSeries,
      НомерПаспорта: w.passportNumber,
      ДатаВыдачи: w.passportIssueDate,
      ПаспортКемВыдан: w.passportIssuedBy,
      Серия: w.patentSeries,
      Номер: w.patentNumber,
      ДатаВыдачиВКС: w.patentIssueDate,
      СерийныйНомер1: w.blankSeries,
      СерийныйНомер2: w.blankNumber,
      Должность: w.position,
      УвПоСобствЖел: w.voluntaryResignation || defaultVoluntary,
      АдресРаботы: workAddress,
    }));

  const handleStartRobot = async (limit: number = 0, singleWorker?: GosuslugiDismissalWorkerRecord) => {
    if (singleWorker) {
      const singleVal = validationMap[singleWorker.id];
      if (singleVal && !singleVal.isValid) {
        setEditingRowId(singleWorker.id);
        showNotice(
          'error',
          lang === 'ru'
            ? `Невозможно запустить: строка содержит ошибки (${singleVal.issues.map((i) => i.ru).join('; ')})!`
            : `Başlatılamaz: bu satırda hatalı/eksik veri var (${singleVal.issues.map((i) => i.tr).join('; ')})!`
        );
        return;
      }
    }

    const targetWorkers = singleWorker
      ? [singleWorker]
      : syncedWorkers.filter((w) => w.selected && validationMap[w.id]?.isValid);

    if (targetWorkers.length === 0) {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Выберите хотя бы одного сотрудника без ошибок для отправки уведомления об увольнении!'
          : 'İşten çıkış bildirimi göndermek için hatasız en az bir personel seçin!'
      );
      return;
    }

    setIsStartingRobot(true);
    try {
      const payloadRecords = buildPayloadRecords(targetWorkers);
      const res = await fetch(`${activeBridgeUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'dismissal',
          limit: limit > 0 ? limit : payloadRecords.length,
          sheet: 'Sheet1',
          records: payloadRecords,
          config: {
            PATENT_REGION: patentRegion,
            PATENT_REGION_FULL: patentRegionFull,
            WORK_ADDRESS: workAddress,
            UFMS_DEPARTMENT: ufmsDept,
            OKVED_CODE: okvedCode,
            OKVED_TEXT: okvedText,
          },
        }),
      });

      if (res.ok) {
        showNotice(
          'success',
          lang === 'ru'
            ? `Робот Госуслуги (Увольнение / 600585/1) запущен для ${payloadRecords.length} чел.!`
            : `Gosuslugi İşten Çıkış Robotu (600585/1) ${payloadRecords.length} kişi için başlatıldı!`
        );
      } else {
        const err = await res.json().catch(() => ({}));
        showNotice('error', err.error || 'Robot başlatılamadı.');
      }
    } catch {
      onShowAgentGuide();
      showNotice(
        'error',
        lang === 'ru'
          ? 'Не удалось подключиться к локальному RPA мосту (порт 8088)!'
          : 'Yerel RPA Köprüsüne (Port 8088) bağlanılamadı!'
      );
    } finally {
      setIsStartingRobot(false);
    }
  };

  const handleStopRobot = async () => {
    try {
      await fetch(`${activeBridgeUrl}/stop`, { method: 'POST' });
      showNotice(
        'info',
        lang === 'ru' ? 'Робот остановлен пользователем.' : 'Robot kullanıcı tarafından durduruldu.'
      );
    } catch {
      // ignore
    }
  };

  const validWorkersCount = syncedWorkers.filter((w) => validationMap[w.id]?.isValid).length;
  const invalidWorkersCount = syncedWorkers.length - validWorkersCount;
  const selectedValidCount = syncedWorkers.filter(
    (w) => w.selected && validationMap[w.id]?.isValid
  ).length;
  const sentCount = syncedWorkers.filter((w) => w.status === 'success').length;

  const filteredWorkers = syncedWorkers.filter((w) => {
    const v = validationMap[w.id];
    if (queueFilter === 'ready' && !v?.isValid) return false;
    if (queueFilter === 'invalid' && v?.isValid) return false;
    if (queueFilter === 'sent' && w.status !== 'success') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.sicil.toLowerCase().includes(q) ||
      w.lastName.toLowerCase().includes(q) ||
      w.firstName.toLowerCase().includes(q) ||
      w.passportNumber.toLowerCase().includes(q) ||
      w.patentNumber.toLowerCase().includes(q) ||
      w.citizenship.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-lg animate-in fade-in duration-200 ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
              : toastMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
              : 'bg-cyan-50 dark:bg-cyan-950/70 border-cyan-300 dark:border-cyan-700 text-cyan-900 dark:text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-bold">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : toastMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Action & Configuration Bar */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#131F38]/95 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Load Dismissed from DB */}
            <button
              onClick={handleLoadFromDatabase}
              disabled={isLoadingDb}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoadingDb ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>
                {lang === 'ru' ? 'Загрузить уволенных из БД' : "DB'den İşten Çıkanları Yükle"}
              </span>
            </button>

            {/* Upload Excel */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Импорт Excel (Увольнения)' : 'Excel Yükle (Çıkış)'}</span>
            </button>

            {/* Export Excel */}
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Экспорт / Шаблон Excel' : 'Excel İndir / Şablon'}</span>
            </button>

            {/* Sample Record */}
            <button
              onClick={handleLoadSample}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-bold transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Тестовая запись' : 'Örnek Kayıt'}</span>
            </button>

            {/* Toggle Config Panel */}
            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                showConfigPanel
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>
                {lang === 'ru' ? 'Параметры МВД / Регион' : 'MVD / Bölge Ayarları'}
              </span>
            </button>
          </div>

          {/* Right: Start / Stop Robot Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenChrome}
              disabled={isLaunchingChrome}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/70 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-xs font-bold transition-all cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? '1. Открыть Chrome (9222)' : '1. Chrome Aç (9222)'}</span>
            </button>

            {bridgeStatus.running ? (
              <button
                onClick={handleStopRobot}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Остановить робот' : 'Robotu Durdur'}</span>
              </button>
            ) : (
              <button
                onClick={() => handleStartRobot(0)}
                disabled={isStartingRobot || selectedValidCount === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {isStartingRobot ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>
                  {lang === 'ru'
                    ? `2. Запустить робот (${selectedValidCount} чел.)`
                    : `2. Robotu Başlat (${selectedValidCount} Kişi)`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Dismissal Form Settings (Powerise 600585/1 Parameters) */}
        {showConfigPanel && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs animate-in fade-in duration-150">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'ru' ? 'Регион патента (кратко)' : 'Patent Bölgesi (Kısa)'}
              </label>
              <input
                type="text"
                value={patentRegion}
                onChange={(e) => setPatentRegion(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'ru' ? 'Регион патента (полное название)' : 'Patent Bölgesi (Tam Adı)'}
              </label>
              <input
                type="text"
                value={patentRegionFull}
                onChange={(e) => setPatentRegionFull(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'ru' ? 'Код ОКВЭД' : 'OKVED Kodu'}
              </label>
              <input
                type="text"
                value={okvedCode}
                onChange={(e) => setOkvedCode(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'ru' ? 'Адрес места работы (WORK_ADDRESS)' : 'Çalışma Adresi (WORK_ADDRESS)'}
              </label>
              <input
                type="text"
                value={workAddress}
                onChange={(e) => setWorkAddress(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                {lang === 'ru' ? 'Подразделение МВД (UFMS)' : 'MVD Birimi (UFMS)'}
              </label>
              <input
                type="text"
                value={ufmsDept}
                onChange={(e) => setUfmsDept(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
              />
            </div>
          </div>
        )}

        {/* Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setQueueFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                queueFilter === 'all'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ru' ? 'Все' : 'Tümü'} ({syncedWorkers.length})
            </button>
            <button
              onClick={() => setQueueFilter('ready')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                queueFilter === 'ready'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {lang === 'ru' ? 'Готовы к отправке' : 'Gönderime Hazır'} ({validWorkersCount})
              </span>
            </button>
            <button
              onClick={() => setQueueFilter('invalid')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                queueFilter === 'invalid'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>
                {lang === 'ru' ? 'С ошибками (Блок)' : 'Eksik / Hatalı (Bloke)'} ({invalidWorkersCount})
              </span>
            </button>
            <button
              onClick={() => setQueueFilter('sent')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                queueFilter === 'sent'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300'
              }`}
            >
              {lang === 'ru' ? 'Отправлено' : 'Gönderildi'} ({sentCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  lang === 'ru'
                    ? 'Поиск по ФИО, Таб. №, Паспорту...'
                    : 'Ad, Sicil, Pasaport ara...'
                }
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>
            {workers.length > 0 && (
              <button
                onClick={() => setWorkers([])}
                className="p-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/60 cursor-pointer"
                title={lang === 'ru' ? 'Очистить список' : 'Listeyi Temizle'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Workers Table */}
      <div className="bg-white dark:bg-[#131F38]/95 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-3">
                  <input
                    type="checkbox"
                    checked={validWorkersCount > 0 && selectedValidCount === validWorkersCount}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Статус / Проверка' : 'Durum / Kontrol'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Таб. №' : 'Sicil'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'ФИО (Кириллица)' : 'Ad Soyad (Kiril)'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Дата рожд. / Пол' : 'Doğum / Cinsiyet'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Гражданство' : 'Uyruk'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Паспорт (Серия/№/Дата/Кем)' : 'Pasaport Bilgileri'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Патент и Бланк' : 'Patent & Blank No'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Дата приема / увольнения' : 'Giriş / Çıkış Tarihi'}</th>
                <th className="py-3 px-3">{lang === 'ru' ? 'Должность / Собств. жел.' : 'Görev / İstifa'}</th>
                <th className="py-3 px-3 text-right">{lang === 'ru' ? 'Действия' : 'İşlem'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <UserMinus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
                      {lang === 'ru'
                        ? 'Список уведомлений о расторжении ТД пуст'
                        : 'İşten çıkış bildirimi listesi boş'}
                    </p>
                    <p className="text-xs mt-1">
                      {lang === 'ru'
                        ? 'Нажмите «Загрузить уволенных из БД», «Импорт Excel» или «Тестовая запись».'
                        : '«DB\'den İşten Çıkanları Yükle», «Excel Yükle» veya «Örnek Kayıt» butonunu kullanın.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((w) => {
                  const v = validationMap[w.id];
                  const isEditing = editingRowId === w.id;
                  return (
                    <React.Fragment key={w.id}>
                      <tr
                        className={`transition-colors ${
                          w.status === 'processing'
                            ? 'bg-cyan-50/80 dark:bg-cyan-950/40'
                            : w.status === 'success'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/25'
                            : !v?.isValid
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={w.selected && !!v?.isValid}
                            onChange={() => handleToggleWorker(w.id)}
                            className="rounded border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          {w.status === 'processing' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {lang === 'ru' ? 'В процессе...' : 'İşleniyor...'}
                            </span>
                          ) : w.status === 'success' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              {lang === 'ru' ? 'Отправлено' : 'Gönderildi'}
                            </span>
                          ) : v?.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              {lang === 'ru' ? 'Готов к МВД' : 'MVD Hazır'}
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                <AlertTriangle className="w-3 h-3" />
                                {lang === 'ru'
                                  ? `Блок: ${v?.issues.length} ош.`
                                  : `Bloke: ${v?.issues.length} hata`}
                              </span>
                              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium max-w-[180px] truncate" title={v?.issues.map((i) => (lang === 'ru' ? i.ru : i.tr)).join(', ')}>
                                {v?.issues[0] ? (lang === 'ru' ? v.issues[0].ru : v.issues[0].tr) : ''}
                              </p>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          {w.sicil}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {w.lastName} {w.firstName}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {w.middleName || '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono text-slate-900 dark:text-slate-200">{w.birthDate || '—'}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{w.gender}</div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {w.citizenship}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-bold text-slate-900 dark:text-white">
                            {w.passportSeries} {w.passportNumber || '—'}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                            {w.passportIssueDate} • {w.passportIssuedBy}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-bold text-teal-700 dark:text-teal-300">
                            {w.patentSeries || '—'} № {w.patentNumber || '—'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            Бланк: {w.blankSeries || '—'} {w.blankNumber || '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <div className="text-slate-600 dark:text-slate-400 text-[10.5px]">
                            Прием: {w.hireDate || '—'}
                          </div>
                          <div className="font-bold text-rose-600 dark:text-rose-400">
                            Увольн.: {w.dismissalDate || '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                            {w.position}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Собств. жел.: <strong>{w.voluntaryResignation}</strong>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setEditingRowId(isEditing ? null : w.id)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                              title={lang === 'ru' ? 'Редактировать строку' : 'Satırı Düzenle'}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleStartRobot(1, w)}
                              disabled={bridgeStatus.running || !v?.isValid}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 disabled:opacity-40 cursor-pointer"
                              title={lang === 'ru' ? 'Отправить только этого сотрудника' : 'Sadece bu personeli gönder'}
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline Row Editor */}
                      {isEditing && (
                        <tr className="bg-slate-50/95 dark:bg-slate-900/95">
                          <td colSpan={11} className="p-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Фамилия</label>
                                <input
                                  type="text"
                                  value={w.lastName}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'lastName', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Имя</label>
                                <input
                                  type="text"
                                  value={w.firstName}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'firstName', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Отчество</label>
                                <input
                                  type="text"
                                  value={w.middleName}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'middleName', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ДатаРождения</label>
                                <input
                                  type="text"
                                  value={w.birthDate}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'birthDate', e.target.value)}
                                  placeholder="ДД.ММ.ГГГГ"
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Гражданство</label>
                                <input
                                  type="text"
                                  value={w.citizenship}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'citizenship', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">СерияПаспорта</label>
                                <input
                                  type="text"
                                  value={w.passportSeries}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'passportSeries', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">НомерПаспорта</label>
                                <input
                                  type="text"
                                  value={w.passportNumber}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'passportNumber', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ДатаВыдачи паспорта</label>
                                <input
                                  type="text"
                                  value={w.passportIssueDate}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'passportIssueDate', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ПаспортКемВыдан</label>
                                <input
                                  type="text"
                                  value={w.passportIssuedBy}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'passportIssuedBy', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Серия Патента</label>
                                <input
                                  type="text"
                                  value={w.patentSeries}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'patentSeries', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Номер Патента</label>
                                <input
                                  type="text"
                                  value={w.patentNumber}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'patentNumber', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">СерийныйНомер1 (Бланк)</label>
                                <input
                                  type="text"
                                  value={w.blankSeries}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'blankSeries', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">СерийныйНомер2 (№ Бланка)</label>
                                <input
                                  type="text"
                                  value={w.blankNumber}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'blankNumber', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ДатаПриема</label>
                                <input
                                  type="text"
                                  value={w.hireDate}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'hireDate', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">ДатаУволь</label>
                                <input
                                  type="text"
                                  value={w.dismissalDate}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'dismissalDate', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Должность</label>
                                <input
                                  type="text"
                                  value={w.position}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'position', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">УвПоСобствЖел</label>
                                <select
                                  value={w.voluntaryResignation}
                                  onChange={(e) => handleUpdateWorkerField(w.id, 'voluntaryResignation', e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                >
                                  <option value="Да">Да</option>
                                  <option value="Нет">Нет</option>
                                </select>
                              </div>
                              <div className="flex items-end">
                                <button
                                  onClick={() => setEditingRowId(null)}
                                  className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer flex items-center justify-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{lang === 'ru' ? 'Готово' : 'Tamam'}</span>
                                </button>
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
      </div>

      {/* Live Playwright Robot Terminal */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 font-mono font-bold">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>
              {lang === 'ru'
                ? 'Журнал выполнения RPA (Увольнение — Госуслуги 600585/1)'
                : 'Canlı RPA Robot Günlüğü (İşten Çıkış — Gosuslugi 600585/1)'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {lang === 'ru' ? 'Успешно:' : 'Başarılı:'} <strong className="text-emerald-400">{bridgeStatus.success}</strong> •{' '}
            {lang === 'ru' ? 'Ошибок:' : 'Hata:'} <strong className="text-rose-400">{bridgeStatus.errors}</strong>
          </span>
        </div>
        <div className="p-4 h-44 overflow-y-auto font-mono text-[11px] space-y-1 text-slate-300">
          {bridgeStatus.logs.length === 0 ? (
            <p className="text-slate-500">
              {lang === 'ru'
                ? 'Ожидание запуска робота (Увольнение)...'
                : 'İşten çıkış robotunun başlatılması bekleniyor...'}
            </p>
          ) : (
            bridgeStatus.logs.map((l, idx) => (
              <div key={idx} className="leading-relaxed">
                <span className="text-slate-500 mr-2">[{l.time}]</span>
                <span
                  className={
                    l.text.includes('SUCCESS')
                      ? 'text-emerald-400 font-bold'
                      : l.text.includes('ERROR') || l.text.includes('Ошибка')
                      ? 'text-rose-400 font-bold'
                      : l.text.includes('Step')
                      ? 'text-cyan-300'
                      : 'text-slate-200'
                  }
                >
                  {l.text}
                </span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
