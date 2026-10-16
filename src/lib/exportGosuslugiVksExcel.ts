import * as XLSX from 'xlsx';

export interface GosuslugiVksWorkerRecord {
  id: string;
  selected: boolean;
  status: 'pending' | 'processing' | 'success' | 'error';
  statusNote?: string;
  sicil: string;
  code: string;
  lastName: string; // Фамилия
  firstName: string; // Имя
  middleName: string; // Отчество
  birthDate: string; // ДатаРождения (DD.MM.YYYY)
  gender: string; // Пол (Мужской / Женский)
  citizenship: string; // ТекущееГражданство
  placeOfBirth: string; // МестоРождения (si13_pob)
  passportSeries: string; // СерияПаспорта
  passportNumber: string; // НомерПаспорта
  passportIssueDate: string; // ДатаВыдачи
  passportIssuedBy: string; // ПаспортКемВыдан
  inn: string; // ИНН
  rnrSeries: string; // Серия (Разрешение на работу ВКС)
  rnrNumber: string; // Номер (Разрешение на работу ВКС)
  rnrIssueDate: string; // ДатаВыдачиВКС
  blankSeries: string; // СерийныйНомер1 (s15_dict_2_seriaBlank)
  blankNumber: string; // СерийныйНомер2 (s15_dict_2_numberBlank)
  contractDate: string; // ДатаЗаключения (di16_2)
  contractStartDate: string; // ДатаНачалаДействия (c_startDate)
  contractEndDate: string; // ДатаОканчанияДействия (c_endDate)
  workAddress: string; // АдресРаботы (Month1End)
  postalCode: string; // Индекс (Month2End = 626150)
  periodStart: string; // НачалоПериода (di17_start)
  periodEnd: string; // КонецПериода (di17_end)
  salaryAmount: string; // РазмерВыплаты (si17_paid)
  position: string; // Должность
  applicationNo?: string; // № Заявления Госуслуги (напр. 8255536023)
  gosuslugiStatus?: string; // Статус на Госуслугах (Услуга оказана / Услуга отказана / В обработке / Отправлено)
  pdfFilename?: string; // Имя скачанного PDF-файла
}

export const GOSUSLUGI_VKS_EXCEL_COLUMNS = [
  'Sicil',
  'Код',
  'Фамилия',
  'Имя',
  'Отчество',
  'ДатаРождения',
  'Пол',
  'ТекущееГражданство',
  'МестоРождения',
  'СерияПаспорта',
  'НомерПаспорта',
  'ДатаВыдачи',
  'ПаспортКемВыдан',
  'ИНН',
  'Серия',
  'Номер',
  'ДатаВыдачиВКС',
  'СерийныйНомер1',
  'СерийныйНомер2',
  'ДатаЗаключения',
  'ДатаНачалаДействия',
  'ДатаОканчанияДействия',
  'НачалоПериода',
  'КонецПериода',
  'РазмерВыплаты',
  'Должность',
  'АдресРаботы',
  'Индекс',
  'НомерЗаявления',
  'СтатусГосуслуги',
];

export function exportGosuslugiVksExcel(records: GosuslugiVksWorkerRecord[], filename?: string) {
  const rows = records.map((r) => [
    r.sicil || '',
    r.code || r.sicil || '',
    r.lastName || '',
    r.firstName || '',
    r.middleName || '',
    r.birthDate || '',
    r.gender || 'Мужской',
    r.citizenship || 'Турция',
    r.placeOfBirth || r.citizenship || '',
    r.passportSeries || '',
    r.passportNumber || '',
    r.passportIssueDate || '',
    r.passportIssuedBy || '',
    r.inn || '',
    r.rnrSeries || '',
    r.rnrNumber || '',
    r.rnrIssueDate || '',
    r.blankSeries || '',
    r.blankNumber || '',
    r.contractDate || '',
    r.contractStartDate || '',
    r.contractEndDate || '',
    r.periodStart || '',
    r.periodEnd || '',
    r.salaryAmount || '',
    r.position || 'СПЕЦИАЛИСТ',
    r.workAddress || '',
    r.postalCode || '626150',
    r.applicationNo || '',
    r.gosuslugiStatus || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([GOSUSLUGI_VKS_EXCEL_COLUMNS, ...rows]);

  ws['!cols'] = [
    { wch: 10 }, // Sicil
    { wch: 10 }, // Код
    { wch: 18 }, // Фамилия
    { wch: 16 }, // Имя
    { wch: 18 }, // Отчество
    { wch: 14 }, // ДатаРождения
    { wch: 10 }, // Пол
    { wch: 18 }, // ТекущееГражданство
    { wch: 20 }, // МестоРождения
    { wch: 12 }, // СерияПаспорта
    { wch: 14 }, // НомерПаспорта
    { wch: 14 }, // ДатаВыдачи
    { wch: 24 }, // ПаспортКемВыдан
    { wch: 15 }, // ИНН
    { wch: 10 }, // Серия
    { wch: 14 }, // Номер
    { wch: 14 }, // ДатаВыдачиВКС
    { wch: 14 }, // СерийныйНомер1
    { wch: 14 }, // СерийныйНомер2
    { wch: 15 }, // ДатаЗаключения
    { wch: 16 }, // ДатаНачалаДействия
    { wch: 18 }, // ДатаОканчанияДействия
    { wch: 15 }, // НачалоПериода
    { wch: 15 }, // КонецПериода
    { wch: 16 }, // РазмерВыплаты
    { wch: 18 }, // Должность
    { wch: 35 }, // АдресРаботы
    { wch: 10 }, // Индекс
    { wch: 16 }, // НомерЗаявления
    { wch: 18 }, // СтатусГосуслуги
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const finalName = filename || `GosUsluga_VKS_ZP_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, finalName);
}
