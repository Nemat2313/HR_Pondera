import * as XLSX from 'xlsx';

export interface GosuslugiDismissalWorkerRecord {
  id: string;
  selected: boolean;
  status: 'pending' | 'processing' | 'success' | 'error';
  statusNote?: string;
  sicil: string;
  code: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  gender: string;
  hireDate: string;
  dismissalDate: string;
  citizenship: string;
  passportSeries: string;
  passportNumber: string;
  passportIssueDate: string;
  passportIssuedBy: string;
  patentSeries: string;
  patentNumber: string;
  patentIssueDate: string;
  blankSeries: string;
  blankNumber: string;
  position: string;
  voluntaryResignation: string; // "Да" or "Нет"
  patentRegion?: string;
  patentRegionFull?: string;
  workAddress?: string;
  ufmsDepartment?: string;
  alreadyNotified?: boolean;
  notificationInfo?: string;
  applicationNo?: string;
  gosuslugiStatus?: string;
  exitReason?: string;
  projectName?: string;
  zupDepartment?: string;
  permitCategory?: string;
  dismissalDateSource?: '1C_ZUP' | '1C_ZUP_TRANSITION' | 'EBA_FALLBACK' | 'EXCEL';
  ebaMatched?: boolean;
  inn?: string;
  snils?: string;
  contractNo?: string;
  contractDate?: string;
}

export const GOSUSLUGI_DISMISSAL_EXCEL_COLUMNS = [
  'Sicil',
  'Код',
  'Фамилия',
  'Имя',
  'Отчество',
  'ДатаРождения',
  'Пол',
  'ДатаПриема',
  'ДатаУволь',
  'ТекущееГражданство',
  'СерияПаспорта',
  'НомерПаспорта',
  'ДатаВыдачи',
  'ПаспортКемВыдан',
  'Серия',
  'Номер',
  'ДатаВыдачиВКС',
  'СерийныйНомер1',
  'СерийныйНомер2',
  'Должность',
  'УвПоСобствЖел',
  'РегионПатента',
  'РегионПатентаПолный',
  'АдресРаботы',
  'ПодразделениеМВД',
];

export interface DismissalExcelDefaults {
  patentRegion?: string;
  patentRegionFull?: string;
  workAddress?: string;
  ufmsDepartment?: string;
}

export function exportGosuslugiDismissalExcel(
  records: GosuslugiDismissalWorkerRecord[],
  filename?: string,
  defaults?: DismissalExcelDefaults
) {
  const rows = records.map((r) => [
    r.sicil || '',
    r.code || r.sicil || '',
    (r.lastName || '').trim() || 'Нет',
    r.firstName || '',
    (r.middleName || '').trim() || 'Нет',
    r.birthDate || '',
    r.gender || 'Мужской',
    r.hireDate || '',
    r.dismissalDate || '',
    r.citizenship || 'Узбекистан',
    r.passportSeries || '',
    r.passportNumber || '',
    r.passportIssueDate || '',
    r.passportIssuedBy || '',
    r.patentSeries || '',
    r.patentNumber || '',
    r.patentIssueDate || '',
    r.blankSeries || '',
    r.blankNumber || '',
    r.position || '',
    r.voluntaryResignation || 'Да',
    (r.patentRegion || '').trim() || defaults?.patentRegion || '',
    (r.patentRegionFull || '').trim() || defaults?.patentRegionFull || '',
    (r.workAddress || '').trim() || defaults?.workAddress || '',
    (r.ufmsDepartment || '').trim() || defaults?.ufmsDepartment || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([GOSUSLUGI_DISMISSAL_EXCEL_COLUMNS, ...rows]);

  ws['!cols'] = [
    { wch: 10 }, // Sicil
    { wch: 12 }, // Код
    { wch: 18 }, // Фамилия
    { wch: 16 }, // Имя
    { wch: 20 }, // Отчество
    { wch: 14 }, // ДатаРождения
    { wch: 10 }, // Пол
    { wch: 14 }, // ДатаПриема
    { wch: 14 }, // ДатаУволь
    { wch: 20 }, // ТекущееГражданство
    { wch: 14 }, // СерияПаспорта
    { wch: 16 }, // НомерПаспорта
    { wch: 14 }, // ДатаВыдачи
    { wch: 25 }, // ПаспортКемВыдан
    { wch: 10 }, // Серия
    { wch: 14 }, // Номер
    { wch: 14 }, // ДатаВыдачиВКС
    { wch: 16 }, // СерийныйНомер1
    { wch: 16 }, // СерийныйНомер2
    { wch: 22 }, // Должность
    { wch: 16 }, // УвПоСобствЖел
    { wch: 18 }, // РегионПатента
    { wch: 24 }, // РегионПатентаПолный
    { wch: 48 }, // АдресРаботы
    { wch: 48 }, // ПодразделениеМВД
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const finalName =
    filename || `GosUsluga_uvolneniya_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, finalName);
}
