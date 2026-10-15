'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Terminal,
  Loader2,
  Search,
  Database,
  Trash2,
  Settings2,
  Calendar,
  MapPin,
  Copy,
  Check,
  Edit3,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  exportGosuslugiVksExcel,
  GosuslugiVksWorkerRecord,
} from '@/lib/exportGosuslugiVksExcel';
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
  completed_codes?: string[];
  error_codes?: string[];
  logs: Array<{ time: string; text: string }>;
}

const BRIDGE_URLS = ['http://127.0.0.1:8088', 'http://localhost:8088'];

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

export default function GosuslugiVksView() {
  const { user } = useAuth();
  const { lang } = useLanguage();

  const [activeBridgeUrl, setActiveBridgeUrl] = useState(BRIDGE_URLS[0]);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    status: 'offline',
    running: false,
    chrome_ready: false,
    total: 0,
    processed: 0,
    success: 0,
    errors: 0,
    active_worker_code: null,
    active_worker_name: null,
    completed_codes: [],
    error_codes: [],
    logs: [],
  });

  // Global PAD Form Configuration (matching 11.docx variables)
  const [periodStart, setPeriodStart] = useState('01.07.2026');
  const [periodEnd, setPeriodEnd] = useState('30.09.2026');
  const [workAddress, setWorkAddress] = useState(
    'Тюменская область, г. Тобольск, территория «Восточный промышленный район», квартал 9, дом 1/1'
  );
  const [postalCode, setPostalCode] = useState('626150');
  const [ufmsDept, setUfmsDept] = useState(
    'ОПВМ ОМВД России по Кингисеппскому району Ленинградской области'
  );
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  const [workers, setWorkers] = useState<GosuslugiVksWorkerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isLaunchingChrome, setIsLaunchingChrome] = useState(false);
  const [isStartingRobot, setIsStartingRobot] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement>(null);

  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  // Format YYYY-MM-DD or Excel serial date to DD.MM.YYYY
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

  // Poll local RPA Bridge status (http://127.0.0.1:8088/health)
  useEffect(() => {
    let isMounted = true;
    const checkBridge = async () => {
      for (const url of BRIDGE_URLS) {
        try {
          const res = await fetch(`${url}/health`, { method: 'GET' });
          if (res.ok) {
            const data: BridgeStatus = await res.json();
            if (isMounted) {
              setActiveBridgeUrl(url);
              setBridgeStatus(data);

              setWorkers((prev) =>
                prev.map((w) => {
                  const codeKey = w.code || w.sicil;
                  if (data.completed_codes && codeKey && data.completed_codes.includes(codeKey)) {
                    return w.status === 'success' ? w : { ...w, status: 'success' };
                  }
                  if (data.error_codes && codeKey && data.error_codes.includes(codeKey)) {
                    return w.status === 'error' ? w : { ...w, status: 'error' };
                  }
                  const isCurrent =
                    data.running &&
                    ((data.active_worker_code && codeKey === data.active_worker_code) ||
                      (data.active_worker_name &&
                        `${w.lastName} ${w.firstName}`
                          .toLowerCase()
                          .includes(data.active_worker_name.toLowerCase())));
                  if (isCurrent) {
                    return w.status === 'processing' ? w : { ...w, status: 'processing' };
                  }
                  if (!data.running && w.status === 'processing') {
                    return { ...w, status: 'pending' };
                  }
                  return w;
                })
              );
            }
            return;
          }
        } catch {
          // Try next local URL
        }
      }
      if (isMounted) {
        setBridgeStatus((prev) => ({ ...prev, status: 'offline', running: false }));
      }
    };

    checkBridge();
    const interval = setInterval(checkBridge, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll live log
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bridgeStatus.logs]);

  // Auto-scroll to currently processing row in table
  useEffect(() => {
    if (bridgeStatus.running && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [bridgeStatus.active_worker_code, bridgeStatus.active_worker_name]);

  // Load VKS specialists directly from Pondera HR SQLite database
  const handleLoadFromDatabase = async () => {
    setIsLoadingDb(true);
    try {
      const params = new URLSearchParams({
        permit: 'VKS',
        status: 'Mevcut',
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
            ? 'В базе не найдено активных специалистов ВКС. Попробуйте загрузить Excel.'
            : 'Veritabanında aktif VKS uzmanı bulunamadı. Excel yüklemeyi deneyin.'
        );
        return;
      }

      const mapped: GosuslugiVksWorkerRecord[] = json.data.map((emp: any, idx: number) => {
        const raw = emp.raw || {};
        const sicil = String(emp.sicil_no || raw['Sicil No'] || '');
        const lastNameRu = String(raw['Soyadı (Kiril)'] || emp.soyadi || '').trim();
        const firstNameRu = String(raw['Adı (Kiril)'] || emp.adi || '').trim();
        const middleNameRu = String(raw['Baba Adı (Kiril)'] || emp.baba_adi || 'НЕТ').trim();
        const rawNat = String(emp.uyruk || raw['Uyruk'] || 'TURKIYE').toUpperCase();
        const citizenshipRu = CITIZENSHIP_MAP_RU[rawNat] || rawNat;
        const genderRaw = String(emp.cinsiyet || raw['Cinsiyet'] || 'Erkek');
        const genderRu =
          genderRaw.toLowerCase().startsWith('k') || genderRaw.toLowerCase().startsWith('ж')
            ? 'Женский'
            : 'Мужской';

        const salaryRaw = String(raw['Resmi Maaş'] || '217400').replace('.0', '');

        return {
          id: `db-vks-${emp.id || idx}`,
          selected: true,
          status: 'pending',
          sicil,
          code: sicil,
          lastName: lastNameRu,
          firstName: firstNameRu,
          middleName: middleNameRu,
          birthDate: formatDateRu(emp.dogum_tarihi || raw['Doğum Tarihi']),
          gender: genderRu,
          citizenship: citizenshipRu,
          placeOfBirth: String(raw['Doğum Yeri'] || citizenshipRu),
          passportSeries: String(raw['Pasaport Seri No'] || ''),
          passportNumber: String(emp.pasaport_no || raw['Pasaport No'] || ''),
          passportIssueDate: formatDateRu(raw['Pasaport Düzenleme Tarihi']),
          passportIssuedBy: String(raw['Pasaportu Veren Makam (Kiril)'] || ''),
          inn: String(emp.inn_no || raw['INN No'] || ''),
          rnrSeries: String(raw['Çalışma Kart Seri No'] || ''),
          rnrNumber: String(raw['Çalışma Kart No'] || ''),
          rnrIssueDate: formatDateRu(raw['Çalışma Kart Alış Tarihi'] || raw['Çalışma Kart Başlangıç Tarihi']),
          blankSeries: String(raw['Patent Form Seri No'] || ''),
          blankNumber: String(raw['Patent Form No'] || ''),
          contractDate: formatDateRu(raw['İş Sözleşmesi İmza Tarihi'] || emp.ise_giris_tarihi),
          contractStartDate: formatDateRu(raw['İş Sözleşmesi Giriş Tarihi'] || emp.ise_giris_tarihi),
          contractEndDate: formatDateRu(raw['Çalışma Kart Bitiş Tarihi']),
          workAddress,
          postalCode,
          periodStart,
          periodEnd,
          salaryAmount: salaryRaw,
          position: String(raw['Resmi Görevi'] || raw['Çalışma Kart Görevi'] || 'СПЕЦИАЛИСТ'),
        };
      });

      setWorkers(mapped);
      showNotice(
        'success',
        lang === 'ru'
          ? `Загружено ${mapped.length} специалистов ВКС из базы Pondera HR!`
          : `Pondera HR veritabanından ${mapped.length} VKS uzmanı listeye yüklendi!`
      );
    } catch {
      showNotice(
        'error',
        lang === 'ru' ? 'Ошибка при загрузке ВКС из базы данных.' : 'Veritabanından VKS yüklenirken hata oluştu.'
      );
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Upload & Parse Excel File (matching 11.docx PAD columns)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length <= 1) {
          showNotice(
            'error',
            lang === 'ru' ? 'Файл Excel пуст или содержит только заголовки.' : 'Excel dosyası boş veya sadece başlık içeriyor.'
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
        const idxCitizenship = findCol(['ТекущееГражданство', 'Гражданство', 'Uyruk'], 7);
        const idxPlaceOfBirth = findCol(['МестоРождения', 'Место рождения', 'Doğum Yeri'], 8);
        const idxPassSeries = findCol(['СерияПаспорта', 'Pasaport Seri No'], 9);
        const idxPassNumber = findCol(['НомерПаспорта', 'Pasaport No'], 10);
        const idxPassIssueDate = findCol(['ДатаВыдачи', 'Pasaport Düzenleme Tarihi'], 11);
        const idxPassIssuedBy = findCol(['ПаспортКемВыдан', 'Pasaportu Veren Makam (Kiril)'], 12);
        const idxInn = findCol(['ИНН', 'INN No', 'INN'], 13);
        const idxRnrSeries = findCol(['Серия', 'Çalışma Kart Seri No'], 14);
        const idxRnrNumber = findCol(['Номер', 'Çalışma Kart No'], 15);
        const idxRnrIssueDate = findCol(['ДатаВыдачиВКС', 'Çalışma Kart Alış Tarihi'], 16);
        const idxBlank1 = findCol(['СерийныйНомер1', 'Patent Form Seri No'], 17);
        const idxBlank2 = findCol(['СерийныйНомер2', 'Patent Form No'], 18);
        const idxContractDate = findCol(['ДатаЗаключения', 'ДатаПриема', 'İş Sözleşmesi İmza Tarihi'], 19);
        const idxContractStart = findCol(['ДатаНачалаДействия', 'İş Sözleşmesi Giriş Tarihi'], 20);
        const idxContractEnd = findCol(['ДатаОканчанияДействия', 'ДатаОкончанияДействия', 'Çalışma Kart Bitiş Tarihi'], 21);
        const idxPeriodStart = findCol(['НачалоПериода'], 22);
        const idxPeriodEnd = findCol(['КонецПериода'], 23);
        const idxSalary = findCol(['РазмерВыплаты', 'Resmi Maaş', 'Сумма'], 24);
        const idxPosition = findCol(['Должность', 'Resmi Görevi', 'Görevi'], 25);
        const idxWorkAddr = findCol(['АдресРаботы'], 26);
        const idxPostal = findCol(['Индекс'], 27);

        const getVal = (r: any[], colIdx: number) => {
          if (colIdx < 0 || colIdx >= r.length) return '';
          const v = r[colIdx];
          return v !== undefined && v !== null ? String(v).trim() : '';
        };

        const mapped: GosuslugiVksWorkerRecord[] = [];
        rows.forEach((r, idx) => {
          if (!r || r.length === 0) return;
          const lName = getVal(r, idxLastName);
          const fName = getVal(r, idxFirstName);
          if (!lName && !fName) return;

          const sicilVal = getVal(r, idxSicil) || String(idx + 1);
          const codeVal = getVal(r, idxCode) || sicilVal;
          const citVal = getVal(r, idxCitizenship) || 'Турция';

          mapped.push({
            id: `excel-vks-${idx}`,
            selected: true,
            status: 'pending',
            sicil: sicilVal,
            code: codeVal,
            lastName: lName,
            firstName: fName,
            middleName: getVal(r, idxMiddleName) || 'НЕТ',
            birthDate: formatDateRu(r[idxBirthDate]),
            gender: getVal(r, idxGender) || 'Мужской',
            citizenship: CITIZENSHIP_MAP_RU[citVal.toUpperCase()] || citVal,
            placeOfBirth: getVal(r, idxPlaceOfBirth) || citVal,
            passportSeries: getVal(r, idxPassSeries),
            passportNumber: getVal(r, idxPassNumber),
            passportIssueDate: formatDateRu(r[idxPassIssueDate]),
            passportIssuedBy: getVal(r, idxPassIssuedBy),
            inn: getVal(r, idxInn),
            rnrSeries: getVal(r, idxRnrSeries),
            rnrNumber: getVal(r, idxRnrNumber),
            rnrIssueDate: formatDateRu(r[idxRnrIssueDate]),
            blankSeries: getVal(r, idxBlank1),
            blankNumber: getVal(r, idxBlank2),
            contractDate: formatDateRu(r[idxContractDate]),
            contractStartDate: formatDateRu(r[idxContractStart]) || formatDateRu(r[idxContractDate]),
            contractEndDate: formatDateRu(r[idxContractEnd]),
            periodStart: formatDateRu(r[idxPeriodStart]) || periodStart,
            periodEnd: formatDateRu(r[idxPeriodEnd]) || periodEnd,
            salaryAmount: getVal(r, idxSalary) || '250000',
            position: getVal(r, idxPosition) || 'СПЕЦИАЛИСТ',
            workAddress: getVal(r, idxWorkAddr) || workAddress,
            postalCode: getVal(r, idxPostal) || postalCode,
          });
        });

        setWorkers(mapped);
        showNotice(
          'success',
          lang === 'ru'
            ? `Импортировано ${mapped.length} записей ВКС из Excel (${sheetName})!`
            : `Excel (${sheetName}) dosyasından ${mapped.length} VKS kaydı başarıyla yüklendi!`
        );
      } catch {
        showNotice(
          'error',
          lang === 'ru' ? 'Ошибка чтения файла Excel.' : 'Excel dosyası okunurken bir hata oluştu.'
        );
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Apply global Period / Address to all loaded rows
  const handleApplyGlobalParamsToRows = () => {
    setWorkers((prev) =>
      prev.map((w) => ({
        ...w,
        periodStart,
        periodEnd,
        workAddress,
        postalCode,
      }))
    );
    showNotice(
      'success',
      lang === 'ru'
        ? 'Период выплаты и адрес работы применены ко всем строкам списка!'
        : 'Ödeme dönemi ve çalışma adresi listedeki tüm satırlara uygulandı!'
    );
  };

  const handleUpdateWorkerField = (id: string, field: keyof GosuslugiVksWorkerRecord, val: string) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: val } : w)));
  };

  const handleExportExcel = () => {
    if (workers.length === 0) {
      // Export empty template if no rows
      exportGosuslugiVksExcel([
        {
          id: 'sample-1',
          selected: true,
          status: 'pending',
          sicil: '903397',
          code: '903397',
          lastName: 'ГУНГОР',
          firstName: 'ЖАНЕР',
          middleName: 'НЕТ',
          birthDate: '04.09.1977',
          gender: 'Мужской',
          citizenship: 'Турция',
          placeOfBirth: 'Турция',
          passportSeries: 'U',
          passportNumber: '20487306',
          passportIssueDate: '24.07.2018',
          passportIssuedBy: 'ЕНИМАХАЛЛЕ',
          inn: '280707318838',
          rnrSeries: '77',
          rnrNumber: '2400258429',
          rnrIssueDate: '30.05.2024',
          blankSeries: 'ВВ',
          blankNumber: '0739288',
          contractDate: '08.05.2024',
          contractStartDate: '17.06.2024',
          contractEndDate: '02.06.2027',
          periodStart,
          periodEnd,
          salaryAmount: '250000',
          position: 'СПЕЦИАЛИСТ',
          workAddress,
          postalCode,
        },
      ]);
      showNotice(
        'info',
        lang === 'ru'
          ? 'Скачан шаблон Excel для уведомлений ВКС (GosUsluga_VKS_ZP.xlsx).'
          : 'Örnek VKS Excel şablonu (GosUsluga_VKS_ZP.xlsx) indirildi.'
      );
      return;
    }
    exportGosuslugiVksExcel(workers);
    showNotice(
      'success',
      lang === 'ru' ? 'Список ВКС выгружен в Excel!' : 'VKS listesi Excel olarak indirildi!'
    );
  };

  const handleToggleSelectAll = () => {
    const allSelected = workers.length > 0 && workers.every((w) => w.selected);
    setWorkers((prev) => prev.map((w) => ({ ...w, selected: !allSelected })));
  };

  const handleToggleWorker = (id: string) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, selected: !w.selected } : w)));
  };

  const handleOpenChrome = async () => {
    setIsLaunchingChrome(true);
    try {
      const res = await fetch(`${activeBridgeUrl}/open-chrome`, { method: 'POST' });
      if (res.ok) {
        showNotice(
          'success',
          lang === 'ru'
            ? 'Google Chrome запущен в режиме отладки (порт 9222)! Войдите в Госуслуги.'
            : 'Google Chrome hata ayıklama modunda (Port 9222) açıldı! Gosuslugi hesabınıza giriş yapın.'
        );
      } else {
        showNotice('error', 'Chrome başlatılamadı.');
      }
    } catch {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Локальный RPA агент (порт 8088) не запущен! Запустите START_PONDERA_RPA_BRIDGE.bat'
          : 'Yerel RPA Ajanı (Port 8088) açık değil! START_PONDERA_RPA_BRIDGE.bat dosyasını çalıştırın.'
      );
    } finally {
      setIsLaunchingChrome(false);
    }
  };

  const buildPayloadRecords = (list: GosuslugiVksWorkerRecord[]) =>
    list.map((w) => ({
      Sicil: w.sicil,
      Код: w.code || w.sicil,
      Фамилия: w.lastName,
      Имя: w.firstName,
      Отчество: w.middleName,
      ДатаРождения: w.birthDate,
      Пол: w.gender,
      ТекущееГражданство: w.citizenship,
      МестоРождения: w.placeOfBirth || w.citizenship,
      СерияПаспорта: w.passportSeries,
      НомерПаспорта: w.passportNumber,
      ДатаВыдачи: w.passportIssueDate,
      ПаспортКемВыдан: w.passportIssuedBy,
      ИНН: w.inn,
      Серия: w.rnrSeries,
      Номер: w.rnrNumber,
      ДатаВыдачиВКС: w.rnrIssueDate,
      СерийныйНомер1: w.blankSeries,
      СерийныйНомер2: w.blankNumber,
      ДатаЗаключения: w.contractDate,
      ДатаНачалаДействия: w.contractStartDate,
      ДатаОканчанияДействия: w.contractEndDate,
      НачалоПериода: w.periodStart || periodStart,
      КонецПериода: w.periodEnd || periodEnd,
      РазмерВыплаты: w.salaryAmount,
      Должность: w.position,
      АдресРаботы: w.workAddress || workAddress,
      Индекс: w.postalCode || postalCode,
    }));

  const handleSaveQueueJson = () => {
    const selected = workers.filter((w) => w.selected);
    const recordsToSave = buildPayloadRecords(selected.length > 0 ? selected : workers);
    const blob = new Blob([JSON.stringify(recordsToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'active_vks_queue.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice(
      'success',
      lang === 'ru'
        ? 'Очередь active_vks_queue.json скачана!'
        : 'active_vks_queue.json kuyruk dosyası indirildi!'
    );
  };

  const handleStartRobot = async (limit: number = 0, singleWorker?: GosuslugiVksWorkerRecord) => {
    if (bridgeStatus.status !== 'online') {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Локальный RPA агент не запущен! Запустите scripts\\gosuslugi_rpa\\START_PONDERA_RPA_BRIDGE.bat'
          : 'Yerel RPA Ajanı çalışmıyor! Lütfen scripts\\gosuslugi_rpa\\START_PONDERA_RPA_BRIDGE.bat dosyasını başlatın.'
      );
      return;
    }

    setIsStartingRobot(true);
    try {
      const selected = singleWorker ? [singleWorker] : workers.filter((w) => w.selected);
      const recordsToSend = limit > 0 ? selected.slice(0, limit) : selected;

      if (recordsToSend.length === 0) {
        showNotice('error', lang === 'ru' ? 'Выберите хотя бы 1 сотрудника!' : 'En az 1 personel seçin!');
        return;
      }

      // Reset row statuses for selected items
      const targetIds = new Set(recordsToSend.map((r) => r.id));
      setWorkers((prev) =>
        prev.map((w) => (targetIds.has(w.id) ? { ...w, status: 'pending' } : w))
      );

      const payload = {
        mode: 'vks',
        limit: limit > 0 ? limit : 0,
        sheet: 'Sheet1',
        records: buildPayloadRecords(recordsToSend),
        config: {
          WORK_ADDRESS: workAddress,
          WORK_POSTAL_CODE: postalCode,
          UFMS_DEPARTMENT: ufmsDept,
          PERIOD_START: periodStart,
          PERIOD_END: periodEnd,
        },
      };

      const res = await fetch(`${activeBridgeUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showNotice(
          'success',
          lang === 'ru'
            ? `Запущена отправка уведомлений ВКС (${recordsToSend.length} чел.) в Госуслуги!`
            : `Gosuslugi VKS bildirimi (${recordsToSend.length} kişi) başlatıldı!`
        );
      } else {
        const err = await res.json();
        showNotice('error', err.error || 'Robot başlatılamadı.');
      }
    } catch {
      showNotice('error', 'RPA Bridge bağlantı hatası.');
    } finally {
      setIsStartingRobot(false);
    }
  };

  const handleStopRobot = async () => {
    try {
      const res = await fetch(`${activeBridgeUrl}/stop`, { method: 'POST' });
      if (res.ok) {
        showNotice('info', lang === 'ru' ? 'Робот остановлен.' : 'Robot durduruldu.');
      }
    } catch {
      showNotice('error', 'Durdurma komutu gönderilemedi.');
    }
  };

  const isOnline = bridgeStatus.status === 'online';
  const isRunning = bridgeStatus.running;
  const selectedCount = workers.filter((w) => w.selected).length;

  const filteredWorkers = workers.filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.lastName.toLowerCase().includes(q) ||
      w.firstName.toLowerCase().includes(q) ||
      w.code.toLowerCase().includes(q) ||
      w.sicil.toLowerCase().includes(q) ||
      w.passportNumber.toLowerCase().includes(q) ||
      w.inn.toLowerCase().includes(q) ||
      w.rnrNumber.toLowerCase().includes(q)
    );
  });

  // Find active row index for step banner
  const activeWorkerObj = workers.find((w) => {
    const codeKey = w.code || w.sicil;
    return (
      w.status === 'processing' ||
      (isRunning &&
        ((bridgeStatus.active_worker_code && codeKey === bridgeStatus.active_worker_code) ||
          (bridgeStatus.active_worker_name &&
            `${w.lastName} ${w.firstName}`
              .toLowerCase()
              .includes(bridgeStatus.active_worker_name.toLowerCase()))))
    );
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Hidden Excel File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* Toast Notification Banner */}
      {toastMsg && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between shadow-lg transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
              : toastMsg.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300'
              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-[11px] underline opacity-75 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="rounded-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 p-5 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-cyan-400 border border-cyan-500/30 bg-cyan-500/10">
              <Bot className="w-3.5 h-3.5" />
              Pondera Playwright RPA (PAD Замена)
            </span>

            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {lang === 'ru' ? 'RPA Агент Онлайн (Порт 8088)' : 'RPA Ajanı Aktif (Port 8088)'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-amber-500/30 text-amber-400 bg-amber-500/10">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {lang === 'ru' ? 'Агент не запущен (Порт 8088)' : 'Ajan Kapalı (Port 8088)'}
              </span>
            )}

            {bridgeStatus.chrome_ready && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-400">
                <Globe className="w-3 h-3" />
                Chrome CDP (9222) Готов
              </span>
            )}
          </div>

          <span className="text-xs text-slate-400 font-mono">
            Госуслуги ЕПГУ • Форма 600585/1 (Выплата ЗП ВКС)
          </span>
        </div>

        <div className="mt-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              {lang === 'ru'
                ? 'Уведомление МВД о выплате зарплаты ВКС (Госуслуги)'
                : 'Gosuslugi VKS Maaş & Çalışma Bildirimi Otomasyonu (МВД РФ)'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {lang === 'ru'
                ? 'Полная замена Power Automate Desktop (PAD). Загрузите список ВКС из Excel или базы Pondera HR и отслеживайте заполнение каждой строки на Госуслугах в реальном времени.'
                : 'Power Automate Desktop (PAD) yerine doğrudan tarayıcı otomasyonu. Excel yükleyin veya veritabanından VKS uzmanlarını çekin; hangi satırın Gosuslugi üzerinde işlendiğini canlı takip edin.'}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer transition"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Загрузить Excel (ВКС)' : 'Excel Yükle (VKS)'}</span>
            </button>

            <button
              onClick={handleLoadFromDatabase}
              disabled={isLoadingDb}
              className="h-9 px-3.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              {isLoadingDb ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>{lang === 'ru' ? 'Загрузить ВКС из базы' : 'Sistemden VKS Çek'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="h-9 px-3 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-800 text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{workers.length > 0 ? (lang === 'ru' ? 'Экспорт Excel' : 'Excel İndir') : (lang === 'ru' ? 'Шаблон Excel' : 'Örnek Şablon')}</span>
            </button>

            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className={`h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
                showConfigPanel
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                  : 'border-slate-700 bg-slate-800/90 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Параметры формы' : 'Form Ayarları'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible PAD Form Parameters (Period, Address, Postal Code) */}
        {showConfigPanel && (
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900/60 p-3.5 rounded-xl">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-cyan-400" />
                {lang === 'ru' ? 'Начало периода (di17_start)' : 'Dönem Başlangıcı (НачалоПериода)'}
              </label>
              <input
                type="text"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                placeholder="01.07.2026"
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-cyan-400" />
                {lang === 'ru' ? 'Конец периода (di17_end)' : 'Dönem Bitişi (КонецПериода)'}
              </label>
              <input
                type="text"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                placeholder="30.09.2026"
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" />
                {lang === 'ru' ? 'Почтовый индекс (#index)' : 'Posta Kodu (Индекс)'}
              </label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="626150"
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={handleApplyGlobalParamsToRows}
                className="w-full h-8 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer transition"
              >
                {lang === 'ru' ? 'Применить ко всем строкам' : 'Tüm Satırlara Uygula'}
              </button>
            </div>

            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                {lang === 'ru'
                  ? 'Адрес места работы (Month1End в PAD)'
                  : 'Çalışma Yeri Adresi (PAD Month1End değişkeni)'}
              </label>
              <input
                type="text"
                value={workAddress}
                onChange={(e) => setWorkAddress(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
          </div>
        )}

        {/* Active Row Progress Banner (Real-Time Row Indicator) */}
        {(isRunning || activeWorkerObj || bridgeStatus.processed > 0) && (
          <div className="mt-4 p-3.5 rounded-xl bg-cyan-950/50 border border-cyan-500/40 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isRunning ? (
                <div className="w-9 h-9 rounded-xl bg-cyan-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-cyan-500/30 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-cyan-400">
                  {isRunning
                    ? lang === 'ru'
                      ? 'СЕЙЧАС ОБРАБАТЫВАЕТСЯ СТРОКА НА ГОСУСЛУГАХ:'
                      : 'ŞU ANDA GOSUSLUGİ ÜZERİNDE İŞLENEN SATIR:'
                    : lang === 'ru'
                    ? 'СТАТУС ПАКЕТНОЙ ОТПРАВКИ:'
                    : 'TOPLU GÖNDERİM DURUMU:'}
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white">
                  {activeWorkerObj ? (
                    <>
                      {activeWorkerObj.lastName} {activeWorkerObj.firstName} {activeWorkerObj.middleName}{' '}
                      <span className="text-cyan-300 font-mono text-xs">
                        (Sicil/Код: {activeWorkerObj.code || activeWorkerObj.sicil} • ИНН: {activeWorkerObj.inn || '—'} • Выплата: {activeWorkerObj.salaryAmount} ₽)
                      </span>
                    </>
                  ) : bridgeStatus.active_worker_name ? (
                    <>
                      {bridgeStatus.active_worker_name}{' '}
                      <span className="text-cyan-300 font-mono text-xs">
                        (Код: {bridgeStatus.active_worker_code})
                      </span>
                    </>
                  ) : (
                    <span>
                      {lang === 'ru'
                        ? `Обработано ${bridgeStatus.processed} из ${bridgeStatus.total || workers.length}`
                        : `Toplam ${bridgeStatus.total || workers.length} kayıttan ${bridgeStatus.processed} tanesi işlendi`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400">{lang === 'ru' ? 'Прогресс: ' : 'İlerleme: '}</span>
                <strong className="text-white">
                  {bridgeStatus.processed} / {bridgeStatus.total || selectedCount}
                </strong>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
                <span>{lang === 'ru' ? 'Успешно: ' : 'Başarılı: '}</span>
                <strong>{bridgeStatus.success}</strong>
              </div>
              {bridgeStatus.errors > 0 && (
                <div className="px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-500/30 text-rose-300">
                  <span>{lang === 'ru' ? 'Ошибок: ' : 'Hatalı: '}</span>
                  <strong>{bridgeStatus.errors}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control Bar: Search & Robot Launch Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#0F172A] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ru'
                  ? 'Поиск по ФИО, табельному, паспорту, ИНН, РНР...'
                  : 'Ad Soyad, Sicil, Pasaport, INN veya RNR ara...'
              }
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
            />
          </div>

          {workers.length > 0 && (
            <>
              <button
                onClick={handleSaveQueueJson}
                className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-cyan-500" />
                <span>JSON Kuyruk</span>
              </button>

              <button
                onClick={() => setWorkers([])}
                className="h-9 px-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs inline-flex items-center gap-1 cursor-pointer"
                title={lang === 'ru' ? 'Очистить список' : 'Listeyi Temizle'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Chrome & Robot Start/Stop Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenChrome}
            disabled={isLaunchingChrome}
            className="h-9 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-500" />
            <span>
              {bridgeStatus.chrome_ready
                ? lang === 'ru'
                  ? 'Chrome Готов (9222)'
                  : 'Chrome Hazır (9222)'
                : lang === 'ru'
                ? '1. Открыть Chrome (Госуслуги)'
                : '1. Chrome Aç (Gosuslugi)'}
            </span>
          </button>

          {isRunning ? (
            <button
              onClick={handleStopRobot}
              className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>{lang === 'ru' ? 'Остановить робота' : 'Robotu Durdur'}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleStartRobot(1)}
                disabled={isStartingRobot || workers.length === 0}
                className="h-9 px-3.5 rounded-xl border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{lang === 'ru' ? 'Тест (1 строка)' : 'Test Et (1 Satır)'}</span>
              </button>

              <button
                onClick={() => handleStartRobot(0)}
                disabled={isStartingRobot || workers.length === 0}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-40 transition"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {lang === 'ru'
                    ? `2. Отправить в Госуслуги (${selectedCount})`
                    : `2. Seçilenleri Gosuslugi'ye Gönder (${selectedCount})`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main VKS Queue Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] overflow-hidden shadow-xs">
        {workers.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <div className="max-w-lg space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Список уведомлений ВКС пока пуст'
                  : 'VKS Bildirim Listesi Henüz Boş'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'ru'
                  ? 'Загрузите файл Excel (GosUsluga_ ЗП.xlsx), чтобы сформировать список, или подтяните специалистов ВКС напрямую из базы данных Pondera HR. При запуске робота активная строка будет подсвечиваться в таблице.'
                  : 'Listeyi oluşturmak için Excel dosyanızı (GosUsluga_ ЗП.xlsx) yükleyin veya doğrudan Pondera HR veritabanındaki VKS uzmanlarını listeye çekin. Gönderim başladığında hangi satırda işlem yapıldığı tabloda canlı olarak vurgulanır.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Upload className="w-4 h-4" />
                <span>{lang === 'ru' ? 'Загрузить Excel (GosUsluga_ ЗП.xlsx)' : 'Excel Yükle (GosUsluga_ ЗП.xlsx)'}</span>
              </button>
              <button
                onClick={handleLoadFromDatabase}
                disabled={isLoadingDb}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Database className="w-4 h-4" />
                <span>{lang === 'ru' ? 'Загрузить специалистов ВКС из базы' : 'Veritabanından VKS Uzmanlarını Yükle'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[460px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10.5px] tracking-wider">
                <tr>
                  <th className="p-2.5 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={workers.length > 0 && workers.every((w) => w.selected)}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-400 cursor-pointer"
                    />
                  </th>
                  <th className="p-2.5 w-10 text-center">№</th>
                  <th className="p-2.5">Статус Госуслуги</th>
                  <th className="p-2.5">Код / Sicil</th>
                  <th className="p-2.5">ФИО (Кириллица)</th>
                  <th className="p-2.5">Гражданство / Д.Р.</th>
                  <th className="p-2.5">Паспорт (Серия № / Выдан)</th>
                  <th className="p-2.5">ИНН</th>
                  <th className="p-2.5">Разрешение ВКС (РНР / Бланк)</th>
                  <th className="p-2.5">Договор (Закл. / Начало / Конец)</th>
                  <th className="p-2.5">Период ЗП</th>
                  <th className="p-2.5">Размер выплаты (₽)</th>
                  <th className="p-2.5 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono text-[11.5px]">
                {filteredWorkers.map((w, idx) => {
                  const codeKey = w.code || w.sicil;
                  const isProcessing =
                    w.status === 'processing' ||
                    (isRunning &&
                      ((bridgeStatus.active_worker_code && codeKey === bridgeStatus.active_worker_code) ||
                        (bridgeStatus.active_worker_name &&
                          `${w.lastName} ${w.firstName}`
                            .toLowerCase()
                            .includes(bridgeStatus.active_worker_name.toLowerCase()))));

                  const isEditing = editingRowId === w.id;

                  return (
                    <tr
                      key={w.id}
                      ref={isProcessing ? activeRowRef : null}
                      className={`transition-colors ${
                        isProcessing
                          ? 'bg-cyan-500/20 dark:bg-cyan-500/25 border-l-4 border-l-cyan-500 font-semibold animate-pulse'
                          : w.status === 'success'
                          ? 'bg-emerald-500/10 dark:bg-emerald-950/25'
                          : w.status === 'error'
                          ? 'bg-rose-500/10 dark:bg-rose-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={w.selected}
                          onChange={() => handleToggleWorker(w.id)}
                          className="rounded border-slate-400 cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>

                      {/* Status Column */}
                      <td className="p-2.5 whitespace-nowrap">
                        {isProcessing ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {lang === 'ru' ? 'Заполняется...' : 'İşleniyor...'}
                          </span>
                        ) : w.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            {lang === 'ru' ? 'Отправлено' : 'Gönderildi'}
                          </span>
                        ) : w.status === 'error' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-600 dark:text-rose-400">
                            <AlertCircle className="w-3 h-3" />
                            {lang === 'ru' ? 'Ошибка' : 'Hata'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            {lang === 'ru' ? 'В очереди' : 'Sırada'}
                          </span>
                        )}
                      </td>

                      <td className="p-2.5 text-cyan-600 dark:text-cyan-400 font-bold whitespace-nowrap">
                        {w.code || w.sicil}
                      </td>

                      {/* Full Name */}
                      <td className="p-2.5 font-sans font-bold text-slate-900 dark:text-white">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input
                              value={w.lastName}
                              onChange={(e) => handleUpdateWorkerField(w.id, 'lastName', e.target.value)}
                              className="w-24 px-1.5 py-0.5 rounded border border-slate-600 bg-slate-900 text-white text-xs"
                              placeholder="Фамилия"
                            />
                            <input
                              value={w.firstName}
                              onChange={(e) => handleUpdateWorkerField(w.id, 'firstName', e.target.value)}
                              className="w-20 px-1.5 py-0.5 rounded border border-slate-600 bg-slate-900 text-white text-xs"
                              placeholder="Имя"
                            />
                          </div>
                        ) : (
                          <div>
                            {w.lastName} {w.firstName}{' '}
                            <span className="text-slate-400 font-normal">{w.middleName}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-normal">{w.position}</div>
                      </td>

                      {/* Citizenship & BirthDate */}
                      <td className="p-2.5 font-sans">
                        <div className="font-semibold text-slate-700 dark:text-slate-200">{w.citizenship}</div>
                        <div className="text-[10.5px] text-slate-400 font-mono">{w.birthDate}</div>
                      </td>

                      {/* Passport */}
                      <td className="p-2.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {w.passportSeries} {w.passportNumber}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]" title={`${w.passportIssueDate} ${w.passportIssuedBy}`}>
                          {w.passportIssueDate} • {w.passportIssuedBy || '—'}
                        </div>
                      </td>

                      {/* INN */}
                      <td className="p-2.5">
                        {isEditing ? (
                          <input
                            value={w.inn}
                            onChange={(e) => handleUpdateWorkerField(w.id, 'inn', e.target.value)}
                            className="w-28 px-1.5 py-0.5 rounded border border-slate-600 bg-slate-900 text-white text-xs font-mono"
                          />
                        ) : (
                          <span className={w.inn ? 'text-slate-800 dark:text-slate-200' : 'text-amber-500 font-bold'}>
                            {w.inn || 'Нет ИНН'}
                          </span>
                        )}
                      </td>

                      {/* RNR & Blank */}
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          РНР: {w.rnrSeries} {w.rnrNumber}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Бланк: {w.blankSeries} {w.blankNumber}
                        </div>
                      </td>

                      {/* Contract Dates */}
                      <td className="p-2.5 text-[10.5px]">
                        <div>Закл: <span className="text-slate-800 dark:text-slate-200">{w.contractDate || '—'}</span></div>
                        <div>С: {w.contractStartDate || '—'} По: {w.contractEndDate || '—'}</div>
                      </td>

                      {/* Salary Period */}
                      <td className="p-2.5 text-[10.5px] whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <input
                              value={w.periodStart}
                              onChange={(e) => handleUpdateWorkerField(w.id, 'periodStart', e.target.value)}
                              className="w-24 px-1 py-0.5 rounded border border-slate-600 bg-slate-900 text-white text-[10px]"
                            />
                            <input
                              value={w.periodEnd}
                              onChange={(e) => handleUpdateWorkerField(w.id, 'periodEnd', e.target.value)}
                              className="w-24 px-1 py-0.5 rounded border border-slate-600 bg-slate-900 text-white text-[10px]"
                            />
                          </div>
                        ) : (
                          <>
                            <div>{w.periodStart}</div>
                            <div className="text-slate-400">{w.periodEnd}</div>
                          </>
                        )}
                      </td>

                      {/* Salary Amount */}
                      <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            value={w.salaryAmount}
                            onChange={(e) => handleUpdateWorkerField(w.id, 'salaryAmount', e.target.value)}
                            className="w-24 px-1.5 py-0.5 rounded border border-emerald-500 bg-slate-900 text-emerald-300 text-xs font-mono"
                          />
                        ) : (
                          `${Number(w.salaryAmount || 0).toLocaleString('ru-RU')} ₽`
                        )}
                      </td>

                      {/* Row Actions: Edit or Send Single Row */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setEditingRowId(isEditing ? null : w.id)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                            title={lang === 'ru' ? 'Редактировать строку' : 'Satırı Düzenle'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStartRobot(1, w)}
                            disabled={isRunning}
                            className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-600 dark:text-cyan-300 font-sans font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                            title={lang === 'ru' ? 'Отправить только эту строку в Госуслуги' : 'Sadece bu satırı Gosuslugi\'ye gönder'}
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{lang === 'ru' ? 'Старт' : 'Başlat'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Offline Helper Banner */}
      {!isOnline && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              {lang === 'ru' ? (
                <>
                  Для прямой отправки из браузера запустите локальный мост RPA (без Power Automate Desktop):{' '}
                  <code className="bg-black/30 px-2 py-0.5 rounded font-mono text-amber-300">
                    scripts\gosuslugi_rpa\START_PONDERA_RPA_BRIDGE.bat
                  </code>
                </>
              ) : (
                <>
                  Power Automate Desktop olmadan tek tıkla Gosuslugi gönderimi için yerel RPA köprüsünü çalıştırın:{' '}
                  <code className="bg-black/30 px-2 py-0.5 rounded font-mono text-amber-300">
                    scripts\gosuslugi_rpa\START_PONDERA_RPA_BRIDGE.bat
                  </code>
                </>
              )}
            </span>
          </div>

          <button
            onClick={() => {
              navigator.clipboard.writeText(
                'cd c:\\Users\\nemat\\HR_Pondera\\scripts\\gosuslugi_rpa && START_PONDERA_RPA_BRIDGE.bat'
              );
              setCopiedCmd(true);
              setTimeout(() => setCopiedCmd(false), 2500);
            }}
            className="h-7 px-3 rounded-lg border border-amber-500/40 bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCmd ? (lang === 'ru' ? 'Скопировано' : 'Kopyalandı') : (lang === 'ru' ? 'Копировать команду' : 'Komutu Kopyala')}</span>
          </button>
        </div>
      )}

      {/* Live Terminal Log Panel */}
      <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-lg">
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {lang === 'ru'
                ? 'Журнал выполнения робота Госуслуг (Live Log — Шаги 1–16 из 11.docx)'
                : 'Gosuslugi Robotu Canlı İşlem Günlüğü (Live Log — 11.docx Adım 1–16)'}
            </span>
          </div>
          {isRunning && (
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{lang === 'ru' ? 'Заполнение формы ЕПГУ...' : 'Gosuslugi formu dolduruluyor...'}</span>
            </div>
          )}
        </div>

        <div className="p-3 font-mono text-[11px] text-slate-300 max-h-44 overflow-y-auto space-y-1 bg-slate-950">
          {bridgeStatus.logs.length === 0 ? (
            <div className="text-slate-500 italic">
              {lang === 'ru'
                ? 'Журнал пуст. Загрузите Excel-файл ВКС или список из базы и нажмите «Отправить в Госуслуги».'
                : 'Günlük boş. VKS Excel dosyasını yükleyin veya veritabanından çekip "Gosuslugi\'ye Gönder" butonuna tıklayın.'}
            </div>
          ) : (
            bridgeStatus.logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2 leading-snug">
                <span className="text-slate-500 shrink-0">[{log.time}]</span>
                <span
                  className={
                    log.text.includes('SUCCESS')
                      ? 'text-emerald-400 font-bold'
                      : log.text.includes('Error') || log.text.includes('ERROR')
                      ? 'text-rose-400 font-bold'
                      : log.text.includes('Starting Gosuslugi VKS')
                      ? 'text-cyan-300 font-bold'
                      : 'text-slate-300'
                  }
                >
                  {log.text}
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
