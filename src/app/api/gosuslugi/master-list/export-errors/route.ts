import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CRC32 Lookup Table for ZIP builder
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipArchive(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = entry.data;
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x5541, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5541, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + size;
  }

  const centralDirSize = centralParts.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function escapeXml(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function colIndexToLetter(colIdx0: number): string {
  let n = colIdx0 + 1;
  let str = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    str = String.fromCharCode(65 + rem) + str;
    n = Math.floor((n - 1) / 26);
  }
  return str;
}

const TEMPLATE_COLUMNS = [
  { key: 'sicil', header: 'Sicil', width: 11 }, // 0
  { key: 'code', header: 'Код', width: 11 }, // 1
  { key: 'lastName', header: 'Фамилия', width: 18 }, // 2
  { key: 'firstName', header: 'Имя', width: 16 }, // 3
  { key: 'middleName', header: 'Отчество', width: 16 }, // 4
  { key: 'birthDate', header: 'ДатаРождения', width: 14 }, // 5
  { key: 'gender', header: 'Пол', width: 11 }, // 6
  { key: 'citizenship', header: 'ТекущееГражданство', width: 18 }, // 7
  { key: 'placeOfBirth', header: 'МестоРождения', width: 20 }, // 8
  { key: 'passportSeries', header: 'СерияПаспорта', width: 13 }, // 9
  { key: 'passportNumber', header: 'НомерПаспорта', width: 16 }, // 10
  { key: 'passportIssueDate', header: 'ДатаВыдачи', width: 14 }, // 11
  { key: 'passportIssuedBy', header: 'ПаспортКемВыдан', width: 22 }, // 12
  { key: 'inn', header: 'ИНН', width: 16 }, // 13
  { key: 'rnrSeries', header: 'Серия', width: 10 }, // 14
  { key: 'rnrNumber', header: 'Номер', width: 15 }, // 15
  { key: 'rnrIssueDate', header: 'ДатаВыдачиВКС', width: 15 }, // 16
  { key: 'blankSeries', header: 'СерийныйНомер1', width: 15 }, // 17
  { key: 'blankNumber', header: 'СерийныйНомер2', width: 15 }, // 18
  { key: 'contractDate', header: 'ДатаЗаключения', width: 15 }, // 19
  { key: 'contractStartDate', header: 'ДатаНачалаДействия', width: 16 }, // 20
  { key: 'contractEndDate', header: 'ДатаОканчанияДействия', width: 18 }, // 21
  { key: 'periodStart', header: 'НачалоПериода', width: 15 }, // 22
  { key: 'periodEnd', header: 'КонецПериода', width: 15 }, // 23
  { key: 'month1Salary', header: '1-месяц', width: 14 }, // 24
  { key: 'month2Salary', header: '2-месяц', width: 14 }, // 25
  { key: 'month3Salary', header: '3-месяц', width: 14 }, // 26
  { key: 'salaryAmount', header: 'РазмерВыплаты', width: 16 }, // 27
  { key: 'position', header: 'Должность', width: 18 }, // 28
  { key: 'workAddress', header: 'АдресРаботы', width: 38 }, // 29
  { key: 'postalCode', header: 'Индекс', width: 11 }, // 30
  { key: 'errorExplanation', header: 'ОписаниеОшибки (Düzeltilecek Alan Açıklaması — Yüklemeden Önce Silebilirsiniz)', width: 72 }, // 31
];

function isValidDateRu(val: string): boolean {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(val || '').trim());
  if (!m) return false;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  return yyyy >= 1930 && yyyy <= 2050 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

function diagnoseWorkerErrors(
  w: Record<string, any>,
  gosStatus: string
): {
  hasDataError: boolean;
  hasGosuslugiError: boolean;
  redCols: Set<number>;
  amberCols: Set<number>;
  explanations: string[];
} {
  const redCols = new Set<number>();
  const amberCols = new Set<number>();
  const explanations: string[] = [];

  const val = (k: string, alt?: string) =>
    String(w[k] ?? (alt ? w[alt] : '') ?? '').trim();

  const lastName = val('lastName', 'Фамилия');
  const firstName = val('firstName', 'Имя');
  const birthDate = val('birthDate', 'ДатаРождения');
  const citizenship = val('citizenship', 'ТекущееГражданство');
  const placeOfBirth = val('placeOfBirth', 'МестоРождения');
  const passNum = val('passportNumber', 'НомерПаспорта');
  const passDate = val('passportIssueDate', 'ДатаВыдачи');
  const passBy = val('passportIssuedBy', 'ПаспортКемВыдан');
  const inn = val('inn', 'ИНН');
  const rnrSeries = val('rnrSeries', 'Серия');
  const rnrNum = val('rnrNumber', 'Номер');
  const rnrDate = val('rnrIssueDate', 'ДатаВыдачиВКС');
  const blankSeries = val('blankSeries', 'СерийныйНомер1');
  const blankNum = val('blankNumber', 'СерийныйНомер2');
  const contractDate = val('contractDate', 'ДатаЗаключения');
  const contractStart = val('contractStartDate', 'ДатаНачалаДействия');
  const contractEnd = val('contractEndDate', 'ДатаОканчанияДействия');
  const periodStart = val('periodStart', 'НачалоПериода');
  const periodEnd = val('periodEnd', 'КонецПериода');
  const salaryAmount = val('salaryAmount', 'РазмерВыплаты');
  const workAddr = val('workAddress', 'АдресРаботы');
  const postalCode = val('postalCode', 'Индекс');

  // 1. Name
  if (!lastName || /[A-Za-z]/.test(lastName)) {
    redCols.add(2);
    explanations.push(`[Фамилия] Soyadı eksik veya Latin harfi içeriyor ("${lastName || 'Boş'}").`);
  }
  if (!firstName || /[A-Za-z]/.test(firstName)) {
    redCols.add(3);
    explanations.push(`[Имя] Ad eksik veya Latin harfi içeriyor ("${firstName || 'Boş'}").`);
  }

  // 2. BirthDate & PlaceOfBirth
  if (!isValidDateRu(birthDate)) {
    redCols.add(5);
    explanations.push(`[ДатаРождения] Doğum tarihi GG.AA.YYYY formatında olmalı ("${birthDate || 'Boş'}").`);
  }
  if (!citizenship) {
    redCols.add(7);
    explanations.push(`[ТекущееГражданство] Uyruk eksik.`);
  }
  if (!placeOfBirth || /[A-Za-z]/.test(placeOfBirth)) {
    redCols.add(8);
    explanations.push(`[МестоРождения] Doğum yeri eksik veya Latin harfi içeriyor ("${placeOfBirth || 'Boş'}").`);
  }

  // 3. Passport
  if (!passNum || /\s|\d{2}\.\d{2}\.\d{4}/.test(passNum) || passNum.length > 12) {
    redCols.add(10);
    explanations.push(
      `[НомерПаспорта] Pasaport numarası hatalı/boşluklu ("${passNum || 'Boş'}") — boşluksuz ve tarihsiz olmalı.`
    );
  }
  if (!isValidDateRu(passDate)) {
    redCols.add(11);
    explanations.push(`[ДатаВыдачи] Pasaport veriliş tarihi hatalı ("${passDate || 'Boş'}").`);
  }
  if (!passBy || /[A-Za-z]/.test(passBy)) {
    redCols.add(12);
    explanations.push(`[ПаспортКемВыдан] Pasaportu veren makam Rusça Kiril olmalı ("${passBy || 'Boş'}").`);
  }

  // 4. INN (12 digits required by Gosuslugi Step 8)
  const cleanInn = inn.replace(/\s+/g, '');
  if (!/^\d{12}$/.test(cleanInn)) {
    redCols.add(13);
    explanations.push(
      `[ИНН] 12 haneli rakam olmalıdır (Mevcut: "${inn || 'Boş'}"). Geçerli 12 haneli ИНН girin.`
    );
  }

  // 5. Work Permit (РНР)
  if (!/^\d{2}$/.test(rnrSeries)) {
    redCols.add(14);
    explanations.push(`[Серия РНР] Çalışma izni serisi 2 haneli rakam olmalı (örn. 77, mevcut: "${rnrSeries || 'Boş'}").`);
  }
  if (!/^\d{10}$/.test(rnrNum)) {
    redCols.add(15);
    explanations.push(
      `[Номер РНР] Çalışma izni numarası 10 haneli rakam olmalıdır (Mevcut ${rnrNum.length} haneli: "${rnrNum || 'Boş'}").`
    );
  }
  if (!isValidDateRu(rnrDate)) {
    redCols.add(16);
    explanations.push(`[ДатаВыдачиВКС] Çalışma izni veriliş tarihi hatalı ("${rnrDate || 'Boş'}").`);
  }
  if (!/^[А-ЯЁA-Z]{2}$/i.test(blankSeries)) {
    redCols.add(17);
    explanations.push(
      `[СерийныйНомер1] Blank serisi 2 Kiril harfi olmalı (örn. ВВ, mevcut: "${blankSeries || 'Boş'}").`
    );
  }
  if (!/^\d{7}$/.test(blankNum)) {
    redCols.add(18);
    const suggested = /^\d{5,6}$/.test(blankNum) ? ` -> "${blankNum.padStart(7, '0')}"` : '';
    explanations.push(
      `[СерийныйНомер2] Blank numarası 7 haneli rakam olmalıdır (Mevcut: "${blankNum || 'Boş'}"${suggested}).`
    );
  }

  // 6. Contract Dates
  if (!isValidDateRu(contractDate)) {
    redCols.add(19);
    explanations.push(`[ДатаЗаключения] Sözleşme tarihi hatalı ("${contractDate || 'Boş'}").`);
  }
  if (!isValidDateRu(contractStart)) {
    redCols.add(20);
    explanations.push(`[ДатаНачалаДействия] Sözleşme başlangıç tarihi hatalı ("${contractStart || 'Boş'}").`);
  }
  if (
    contractEnd &&
    !/^(бессрочн|нет|-|süresiz|suresiz)$/i.test(contractEnd) &&
    !isValidDateRu(contractEnd)
  ) {
    redCols.add(21);
    explanations.push(`[ДатаОканчанияДействия] Sözleşme bitiş tarihi hatalı ("${contractEnd}").`);
  }

  // 7. Period & Salary
  if (!isValidDateRu(periodStart)) {
    redCols.add(22);
    explanations.push(`[НачалоПериода] Dönem başlangıç tarihi hatalı ("${periodStart || 'Boş'}").`);
  }
  if (!isValidDateRu(periodEnd)) {
    redCols.add(23);
    explanations.push(`[КонецПериода] Dönem bitiş tarihi hatalı ("${periodEnd || 'Boş'}").`);
  }
  const salNum = Number(salaryAmount.replace(/\s+/g, '').replace(',', '.'));
  if (!salaryAmount || Number.isNaN(salNum) || salNum <= 0) {
    redCols.add(27);
    explanations.push(`[РазмерВыплаты] Maaş tutarı eksik veya 0 ("${salaryAmount || 'Boş'}").`);
  }

  // 8. Work Address & Postal Code
  if (!workAddr) {
    redCols.add(29);
    explanations.push(`[АдресРаботы] Çalışma adresi eksik.`);
  }
  if (!/^\d{6}$/.test(postalCode)) {
    redCols.add(30);
    explanations.push(`[Индекс] Posta kodu 6 haneli rakam olmalı (Mevcut: "${postalCode || 'Boş'}").`);
  }

  const hasDataError = redCols.size > 0;
  const st = String(gosStatus || '').trim();
  const hasGosuslugiError = /^ошибк/i.test(st);

  // Also map Gosuslugi step-specific error messages if not already caught by field rules
  if (hasGosuslugiError) {
    if (/Паспортные данные|Шаг 7/i.test(st)) {
      if (!redCols.has(10) && !redCols.has(11) && !redCols.has(12)) {
        redCols.add(10);
      }
      explanations.push(`[Gosuslugi Шаг 7 — Паспорт] ${st}`);
    } else if (/ИНН иностранца|Шаг 8|#series/i.test(st)) {
      if (!redCols.has(13)) {
        amberCols.add(13);
      }
      if (!hasDataError) {
        explanations.push(
          `[Gosuslugi Шаг 8 — ИНН] Gosuslugi ИНН adımında yanıt gecikmesi yaşandı (${st.slice(0, 90)}). ИНН doğruysa değişiklik yapmadan tekrar yükleyip gönderebilirsiniz.`
        );
      }
    } else if (/Разрешение на работу ВКС|Шаг 9/i.test(st)) {
      if (!redCols.has(14) && !redCols.has(15) && !redCols.has(17) && !redCols.has(18)) {
        redCols.add(15);
        redCols.add(18);
      }
      explanations.push(`[Gosuslugi Шаг 9 — РНР ВКС] ${st}`);
    } else if (/Договор и Адрес работы|Шаг 10|Проверьте адрес/i.test(st)) {
      if (!redCols.has(29)) {
        amberCols.add(29);
        amberCols.add(30);
      }
      explanations.push(
        `[Gosuslugi Шаг 10 — Адрес работы] Çalışma adresi seçimi (${st}). Adreste kat/ofis detayı varsa yeni robotta otomatik temizlenir.`
      );
    } else if (/Подразделение МВД|Шаг 12/i.test(st)) {
      if (!hasDataError) {
        explanations.push(
          `[Gosuslugi Шаг 12 — Подразделение МВД] Veri hatası yok! МВД listesi 3 denemede açılmadığı için atlandı (Yeni versiyonda 6 denemeye çıkarıldı, tekrar yükleyip gönderebilirsiniz).`
        );
      }
    } else if (/lastNameRu|di16_1|di17_start|Timeout/i.test(st)) {
      if (!hasDataError) {
        explanations.push(
          `[Gosuslugi Yavaşlık / Timeout] Veri hatası yok! Sayfa geçişi yavaş sürdüğü için zaman aşımı oluştu (Yeni versiyonda akıllı bekleme eklendi, tekrar yükleyip gönderebilirsiniz).`
        );
      }
    } else {
      explanations.push(`[Gosuslugi] ${st}`);
    }
  }

  return {
    hasDataError,
    hasGosuslugiError,
    redCols,
    amberCols,
    explanations,
  };
}

function buildStyledXlsxBuffer(
  rowsData: Array<{
    values: string[];
    redCols: Set<number>;
    amberCols: Set<number>;
  }>
): Buffer {
  // Styles:
  // s="0": Default
  // s="1": Header (Dark Blue/Indigo fill #1E293B, White Bold font)
  // s="2": Normal Data Cell (Thin border, dark slate text)
  // s="3": RED FAULTY CELL (#FECACA bright red/pink fill, #991B1B bold dark-red text, medium red border)
  // s="4": AMBER WARNING CELL (#FDE68A amber fill, #92400E bold amber text, thin border)
  // s="5": LAST COLUMN EXPLANATION HEADER (#B45309 amber/orange fill, White Bold font)
  // s="6": LAST COLUMN EXPLANATION CELL (#FEF3C7 soft yellow fill, #78350F text, wrapText=0)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF991B1B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF78350F"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFECACA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFDE68A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB45309"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="medium"><color rgb="FFDC2626"/></left>
      <right style="medium"><color rgb="FFDC2626"/></right>
      <top style="medium"><color rgb="FFDC2626"/></top>
      <bottom style="medium"><color rgb="FFDC2626"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="2" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="3" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const colsXml = TEMPLATE_COLUMNS.map(
    (c, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${c.width}" customWidth="1"/>`
  ).join('');

  const lastColIdx = TEMPLATE_COLUMNS.length - 1;

  // Build Row 1 (Header)
  const headerCellsXml = TEMPLATE_COLUMNS.map((c, idx) => {
    const ref = `${colIndexToLetter(idx)}1`;
    const styleId = idx === lastColIdx ? 5 : 1;
    return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(c.header)}</t></is></c>`;
  }).join('');

  const dataRowsXml = rowsData
    .map((row, rIdx) => {
      const excelRowNum = rIdx + 2;
      const cellsXml = row.values
        .map((val, cIdx) => {
          const ref = `${colIndexToLetter(cIdx)}${excelRowNum}`;
          let styleId = 2;
          if (cIdx === lastColIdx) {
            styleId = 6;
          } else if (row.redCols.has(cIdx)) {
            styleId = 3;
          } else if (row.amberCols.has(cIdx)) {
            styleId = 4;
          }
          return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
        })
        .join('');
      return `<row r="${excelRowNum}" ht="20" customHeight="1">${cellsXml}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>
    <row r="1" ht="26" customHeight="1">${headerCellsXml}</row>
    ${dataRowsXml}
  </sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRelsXml, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRelsXml, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
  ]);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const computerFilter = searchParams.get('computer') || 'all';
    const mode = searchParams.get('mode') || 'all_errors'; // 'all_errors' | 'only_oshibka' | 'only_data_errors'

    const db = getDb();

    const masterRows = db
      .prepare('SELECT row_key, sicil_no, row_order, assigned_computer, worker_json FROM gosuslugi_vks_master_list ORDER BY row_order ASC')
      .all() as Array<{
      row_key: string;
      sicil_no: string;
      row_order: number;
      assigned_computer: number;
      worker_json: string;
    }>;

    const subRows = db
      .prepare(
        `SELECT sicil_no, application_no, gosuslugi_status, pdf_filename FROM gosuslugi_submissions WHERE LOWER(notification_type) = 'vks_salary' ORDER BY id DESC`
      )
      .all() as Array<{
      sicil_no: string;
      application_no: string;
      gosuslugi_status: string;
      pdf_filename: string;
    }>;

    const subBySicil = new Map<string, (typeof subRows)[0]>();
    for (const s of subRows) {
      const sic = String(s.sicil_no || '').trim();
      if (!sic) continue;
      const ex = subBySicil.get(sic);
      if (!ex || (!ex.application_no && s.application_no)) {
        subBySicil.set(sic, s);
      }
    }

    const exportRows: Array<{
      values: string[];
      redCols: Set<number>;
      amberCols: Set<number>;
      sortPriority: number;
    }> = [];

    for (const m of masterRows) {
      if (computerFilter !== 'all' && String(m.assigned_computer) !== String(computerFilter)) {
        continue;
      }

      const sub = subBySicil.get(m.sicil_no);
      const isSent = Boolean(
        sub &&
          (String(sub.application_no || '').trim() !== '' ||
            String(sub.pdf_filename || '').trim() !== '' ||
            (/отправлен|зарегистрирован|оказан|исполнен|принят|промежуточн/i.test(
              String(sub.gosuslugi_status || '')
            ) &&
              !/^ошибк/i.test(String(sub.gosuslugi_status || ''))))
      );
      if (isSent) continue;

      let w: Record<string, any> = {};
      try {
        w = JSON.parse(m.worker_json || '{}');
      } catch {
        continue;
      }

      const gosStatus = String(sub?.gosuslugi_status || '').trim();
      const diag = diagnoseWorkerErrors(w, gosStatus);

      if (mode === 'only_oshibka' && !diag.hasGosuslugiError) continue;
      if (mode === 'only_data_errors' && !diag.hasDataError) continue;
      if (!diag.hasGosuslugiError && !diag.hasDataError) continue;

      const getField = (k: string, alt?: string, def = '') =>
        String(w[k] ?? (alt ? w[alt] : '') ?? def).trim();

      const explanationText = diag.explanations.join(' | ');

      const rowValues: string[] = [
        m.sicil_no, // 0: Sicil
        getField('code', 'Код', m.sicil_no), // 1: Код
        getField('lastName', 'Фамилия', 'Нет'), // 2: Фамилия
        getField('firstName', 'Имя'), // 3: Имя
        getField('middleName', 'Отчество', 'НЕТ'), // 4: Отчество
        getField('birthDate', 'ДатаРождения'), // 5: ДатаРождения
        getField('gender', 'Пол', 'Мужской'), // 6: Пол
        getField('citizenship', 'ТекущееГражданство', 'Турция'), // 7: ТекущееГражданство
        getField('placeOfBirth', 'МестоРождения'), // 8: МестоРождения
        getField('passportSeries', 'СерияПаспорта'), // 9: СерияПаспорта
        getField('passportNumber', 'НомерПаспорта'), // 10: НомерПаспорта
        getField('passportIssueDate', 'ДатаВыдачи'), // 11: ДатаВыдачи
        getField('passportIssuedBy', 'ПаспортКемВыдан', 'МВД'), // 12: ПаспортКемВыдан
        getField('inn', 'ИНН'), // 13: ИНН
        getField('rnrSeries', 'Серия'), // 14: Серия
        getField('rnrNumber', 'Номер'), // 15: Номер
        getField('rnrIssueDate', 'ДатаВыдачиВКС'), // 16: ДатаВыдачиВКС
        getField('blankSeries', 'СерийныйНомер1'), // 17: СерийныйНомер1
        getField('blankNumber', 'СерийныйНомер2'), // 18: СерийныйНомер2
        getField('contractDate', 'ДатаЗаключения'), // 19: ДатаЗаключения
        getField('contractStartDate', 'ДатаНачалаДействия'), // 20: ДатаНачалаДействия
        getField('contractEndDate', 'ДатаОканчанияДействия'), // 21: ДатаОканчанияДействия
        getField('periodStart', 'НачалоПериода', '01.07.2026'), // 22: НачалоПериода
        getField('periodEnd', 'КонецПериода', '30.09.2026'), // 23: КонецПериода
        getField('month1Salary', '1-месяц'), // 24: 1-месяц
        getField('month2Salary', '2-месяц'), // 25: 2-месяц
        getField('month3Salary', '3-месяц'), // 26: 3-месяц
        getField('salaryAmount', 'РазмерВыплаты'), // 27: РазмерВыплаты
        getField('position', 'Должность', 'СПЕЦИАЛИСТ'), // 28: Должность
        getField('workAddress', 'АдресРаботы'), // 29: АдресРаботы
        getField('postalCode', 'Индекс', '626150'), // 30: Индекс
        explanationText, // 31: ОписаниеОшибки
      ];

      // Put rows with red cell data errors first so the user sees all red cells at the very top of the Excel sheet!
      const sortPriority = diag.hasDataError ? 0 : 1;

      exportRows.push({
        values: rowValues,
        redCols: diag.redCols,
        amberCols: diag.amberCols,
        sortPriority,
      });
    }

    exportRows.sort((a, b) => a.sortPriority - b.sortPriority);

    const xlsxBuffer = buildStyledXlsxBuffer(exportRows);
    const dateTag = new Date().toISOString().slice(0, 10);
    const fileName = `Pondera_VKS_Hatali_Kayitlar_Sablon_${exportRows.length}_Kayit_${dateTag}.xlsx`;

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Hatalı kayıtlar şablonu oluşturulamadı.',
        detail: String(err?.message || ''),
      },
      { status: 500 }
    );
  }
}
