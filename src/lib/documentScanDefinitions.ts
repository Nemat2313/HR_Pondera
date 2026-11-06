import { WorkPermitCategoryKey } from '@/lib/workPermits';

export type DocScanGroupKey =
  | 'identity_migration'
  | 'work_permit'
  | 'medical_biometric'
  | 'hr_contract'
  | 'exit_archive';

export interface DocScanDefinition {
  index: number;
  key: string;
  excelHeader: string;
  aliases: string[];
  labelTr: string;
  labelRu: string;
  shortTr: string;
  shortRu: string;
  group: DocScanGroupKey;
  isCore8: boolean;
  isCore14: boolean;
}

export const DOC_SCAN_GROUPS: Record<
  DocScanGroupKey,
  { labelTr: string; labelRu: string; color: string }
> = {
  identity_migration: {
    labelTr: 'Kimlik & Göçmenlik',
    labelRu: 'Личность и миграция',
    color: '#06b6d4',
  },
  work_permit: {
    labelTr: 'Çalışma İzni & Sertifika',
    labelRu: 'Разрешения и патенты',
    color: '#3b82f6',
  },
  medical_biometric: {
    labelTr: 'Sağlık & Parmak İzi',
    labelRu: 'Медицина и дактилоскопия',
    color: '#10b981',
  },
  hr_contract: {
    labelTr: 'İşe Giriş & Sözleşmeler',
    labelRu: 'Кадры и договоры',
    color: '#8b5cf6',
  },
  exit_archive: {
    labelTr: 'Çıkış & Arşiv Belgeleri',
    labelRu: 'Увольнение и архив',
    color: '#64748b',
  },
};

export const DOC_SCAN_DEFINITIONS: DocScanDefinition[] = [
  {
    index: 0,
    key: 'pasaport',
    excelHeader: 'Pasaport',
    aliases: ['pasaport', 'passport', 'паспорт'],
    labelTr: 'Pasaport',
    labelRu: 'Паспорт',
    shortTr: 'Pasaport',
    shortRu: 'Паспорт',
    group: 'identity_migration',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 1,
    key: 'migrasyon_kart',
    excelHeader: 'Migrasyon Kart',
    aliases: ['migrasyon kart', 'migrasyon karti', 'migration card', 'миграционная карта'],
    labelTr: 'Migrasyon Kartı',
    labelRu: 'Миграционная карта',
    shortTr: 'Migrasyon',
    shortRu: 'Мигр. карта',
    group: 'identity_migration',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 2,
    key: 'dms',
    excelHeader: 'DMS',
    aliases: ['dms', 'saglik sigortasi', 'дмс'],
    labelTr: 'DMS Sağlık Sigortası',
    labelRu: 'Полис ДМС',
    shortTr: 'DMS',
    shortRu: 'ДМС',
    group: 'medical_biometric',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 3,
    key: 'ikametgah',
    excelHeader: 'İkametgah',
    aliases: ['ikametgah', 'registrasyon', 'registration', 'регистрация'],
    labelTr: 'İkametgah (Registrasyon)',
    labelRu: 'Регистрация (Мигр. учет)',
    shortTr: 'İkametgah',
    shortRu: 'Регистрация',
    group: 'identity_migration',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 4,
    key: 'calisma_karti_rnr',
    excelHeader: 'Çalışma Kartı (RNR)',
    aliases: ['calisma karti (rnr)', 'calisma karti rnr', 'calisma karti', 'rnr', 'рнр'],
    labelTr: 'Çalışma Kartı (RNR)',
    labelRu: 'Разрешение на работу (РНР)',
    shortTr: 'RNR Kart',
    shortRu: 'РНР',
    group: 'work_permit',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 5,
    key: 'pasaport_cevirisi',
    excelHeader: 'Pasaport Çevirisi',
    aliases: ['pasaport cevirisi', 'pasaport tercume', 'перевод паспорта'],
    labelTr: 'Pasaport Çevirisi',
    labelRu: 'Перевод паспорта',
    shortTr: 'Pas. Çeviri',
    shortRu: 'Перевод пасп.',
    group: 'identity_migration',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 6,
    key: 'vize',
    excelHeader: 'Vize',
    aliases: ['vize', 'visa', 'виза'],
    labelTr: 'Vize',
    labelRu: 'Виза',
    shortTr: 'Vize',
    shortRu: 'Виза',
    group: 'identity_migration',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 7,
    key: 'fotograf',
    excelHeader: 'Fotoğraf',
    aliases: ['fotograf', 'foto', 'photo', 'фотография', 'фото'],
    labelTr: 'Fotoğraf',
    labelRu: 'Фотография',
    shortTr: 'Fotoğraf',
    shortRu: 'Фото',
    group: 'identity_migration',
    isCore8: true,
    isCore14: true,
  },
  {
    index: 8,
    key: 'is_sozlesmesi_word',
    excelHeader: 'İş Sözleşmesi WORD',
    aliases: ['is sozlesmesi word', 'sozlesme word'],
    labelTr: 'İş Sözleşmesi (WORD)',
    labelRu: 'Трудовой договор (WORD)',
    shortTr: 'Sözl. WORD',
    shortRu: 'ТД Word',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 9,
    key: 'is_sozlesmesi_pdf',
    excelHeader: 'İş Sözleşmesi PDF',
    aliases: ['is sozlesmesi pdf', 'sozlesme pdf', 'трудовой договор pdf'],
    labelTr: 'İş Sözleşmesi (PDF)',
    labelRu: 'Трудовой договор (PDF)',
    shortTr: 'Sözl. PDF',
    shortRu: 'ТД PDF',
    group: 'hr_contract',
    isCore8: false,
    isCore14: true,
  },
  {
    index: 10,
    key: 'isten_ayrilma_emri',
    excelHeader: 'İşten Ayrılma Emri',
    aliases: ['isten ayrilma emri', 'cikis emri', 'приказ об увольнении'],
    labelTr: 'İşten Ayrılma Emri',
    labelRu: 'Приказ об увольнении',
    shortTr: 'Ayrılma Emri',
    shortRu: 'Приказ увольн.',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 11,
    key: 'ise_alim_emri',
    excelHeader: 'İşe Alım Emri',
    aliases: ['ise alim emri', 'ise giris emri', 'приказ о приеме'],
    labelTr: 'İşe Alım Emri (Prikaz)',
    labelRu: 'Приказ о приеме',
    shortTr: 'Alım Emri',
    shortRu: 'Приказ приема',
    group: 'hr_contract',
    isCore8: false,
    isCore14: true,
  },
  {
    index: 12,
    key: 'izin_emri',
    excelHeader: 'İzin Emri',
    aliases: ['izin emri', 'приказ на отпуск'],
    labelTr: 'İzin Emri',
    labelRu: 'Приказ на отпуск',
    shortTr: 'İzin Emri',
    shortRu: 'Отпуск',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 13,
    key: 'ek_sozlesme_dop',
    excelHeader: 'Ek Sözleşme -Dop',
    aliases: ['ek sozlesme -dop', 'ek sozlesme dop', 'ek sozlesme', 'доп соглашение'],
    labelTr: 'Ek Sözleşme (Dop)',
    labelRu: 'Доп. соглашение',
    shortTr: 'Ek Sözl.',
    shortRu: 'Доп. согл.',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 14,
    key: 'med_29n',
    excelHeader: '29N',
    aliases: ['29n', '29 n', '29н'],
    labelTr: '29N Sağlık Raporu',
    labelRu: 'Медосмотр (29Н)',
    shortTr: '29N Sağlık',
    shortRu: '29Н Мед.',
    group: 'medical_biometric',
    isCore8: false,
    isCore14: true,
  },
  {
    index: 15,
    key: 'covid_test',
    excelHeader: 'Covid Test Sonucu',
    aliases: ['covid test sonucu', 'covid test', 'covid'],
    labelTr: 'Covid Test Sonucu',
    labelRu: 'Результат теста COVID',
    shortTr: 'Covid',
    shortRu: 'COVID',
    group: 'medical_biometric',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 16,
    key: 'psikoloji_test',
    excelHeader: 'Psikokoji Test Sonucu',
    aliases: ['psikokoji test sonucu', 'psikoloji test sonucu', 'psikoloji testi'],
    labelTr: 'Psikoloji Test Sonucu',
    labelRu: 'Психиатрическое освид.',
    shortTr: 'Psikoloji',
    shortRu: 'Псих. освид.',
    group: 'medical_biometric',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 17,
    key: 'td_elektron',
    excelHeader: 'TD Elektron',
    aliases: ['td elektron', 'etk'],
    labelTr: 'TD Elektron',
    labelRu: 'Электронная ТК',
    shortTr: 'TD Elektron',
    shortRu: 'ЭТК',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 18,
    key: 'transfer_emri',
    excelHeader: 'Transfer Emri',
    aliases: ['transfer emri', 'приказ о переводе'],
    labelTr: 'Transfer Emri',
    labelRu: 'Приказ о переводе',
    shortTr: 'Transfer',
    shortRu: 'Перевод',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 19,
    key: 'patent',
    excelHeader: 'Patent',
    aliases: ['patent', 'патент'],
    labelTr: 'Patent Belgesi',
    labelRu: 'Патент на работу',
    shortTr: 'Patent',
    shortRu: 'Патент',
    group: 'work_permit',
    isCore8: false,
    isCore14: true,
  },
  {
    index: 20,
    key: 'patent_ceki',
    excelHeader: 'Patent Çeki',
    aliases: ['patent ceki', 'patent odeme ceki', 'чеки патента'],
    labelTr: 'Patent Ödeme Çeki',
    labelRu: 'Чеки оплаты патента',
    shortTr: 'Patent Çeki',
    shortRu: 'Чеки пат.',
    group: 'work_permit',
    isCore8: false,
    isCore14: true,
  },
  {
    index: 21,
    key: 'rus_dil_sertifikasi',
    excelHeader: 'Rus Dil Sertifikası',
    aliases: ['rus dil sertifikasi', 'rusca dil sertifikasi', 'dil sertifikasi'],
    labelTr: 'Rus Dil Sertifikası',
    labelRu: 'Сертификат русского языка',
    shortTr: 'Dil Sert.',
    shortRu: 'Сертиф. яз.',
    group: 'work_permit',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 22,
    key: 'diploma',
    excelHeader: 'Diploma',
    aliases: ['diploma', 'диплом'],
    labelTr: 'Diploma',
    labelRu: 'Диплом об образовании',
    shortTr: 'Diploma',
    shortRu: 'Диплом',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 23,
    key: 'propusk',
    excelHeader: 'Propusk',
    aliases: ['propusk', 'пропуск'],
    labelTr: 'Propusk (Saha Kartı)',
    labelRu: 'Пропуск на объект',
    shortTr: 'Propusk',
    shortRu: 'Пропуск',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 24,
    key: 'diger_dokumanlar',
    excelHeader: 'Diğer Dokümanlar',
    aliases: ['diger dokumanlar', 'diger belgeler'],
    labelTr: 'Diğer Dokümanlar',
    labelRu: 'Прочие документы',
    shortTr: 'Diğer',
    shortRu: 'Прочие',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 25,
    key: 'td_elektron_beyan',
    excelHeader: 'TD Elektron -Beyan',
    aliases: ['td elektron -beyan', 'td elektron beyan'],
    labelTr: 'TD Elektron Beyanı',
    labelRu: 'Заявление о ведении ЭТК',
    shortTr: 'TD Beyan',
    shortRu: 'Заявл. ЭТК',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 26,
    key: 'kabul_bildirimi',
    excelHeader: 'Kabul Bildirimi',
    aliases: ['kabul bildirimi', 'mvd kabul bildirimi', 'уведомление о приеме'],
    labelTr: 'Kabul Bildirimi (MVD)',
    labelRu: 'Уведомление МВД о приеме',
    shortTr: 'Kabul Bild.',
    shortRu: 'Увед. МВД',
    group: 'work_permit',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 27,
    key: 'veri_isleme_rizasi',
    excelHeader: 'Veri İşleme Rızası',
    aliases: ['veri isleme rizasi', 'kvkk', 'согласие на обработку пдн'],
    labelTr: 'Veri İşleme Rızası',
    labelRu: 'Согласие на обработку ПДн',
    shortTr: 'Veri Rızası',
    shortRu: 'Согл. ПДн',
    group: 'hr_contract',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 28,
    key: 'eski_arsiv',
    excelHeader: 'Eski Arsiv',
    aliases: ['eski arsiv', 'arsiv'],
    labelTr: 'Eski Arşiv',
    labelRu: 'Старый архив',
    shortTr: 'Eski Arşiv',
    shortRu: 'Архив',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 29,
    key: 'parmak_izi',
    excelHeader: 'Parmak İzi',
    aliases: ['parmak izi', 'daktiloskopiya', 'yesil kart', 'дактилоскопия'],
    labelTr: 'Parmak İzi (Yeşil Kart)',
    labelRu: 'Дактилоскопия (Зеленая карта)',
    shortTr: 'Parmak İzi',
    shortRu: 'Дактилоск.',
    group: 'medical_biometric',
    isCore8: false,
    isCore14: true,
  },
  {
    index: 30,
    key: 'raspiska',
    excelHeader: 'Raspiska',
    aliases: ['raspiska', 'расписка'],
    labelTr: 'Raspiska',
    labelRu: 'Расписка',
    shortTr: 'Raspiska',
    shortRu: 'Расписка',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 31,
    key: 'ibraname',
    excelHeader: 'Ibraname',
    aliases: ['ibraname'],
    labelTr: 'İbraname',
    labelRu: 'Обходной / Ибранаме',
    shortTr: 'İbraname',
    shortRu: 'Ибранаме',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 32,
    key: 'imza_ornegi',
    excelHeader: 'Imza Ornegi',
    aliases: ['imza ornegi'],
    labelTr: 'İmza Örneği',
    labelRu: 'Образец подписи',
    shortTr: 'İmza Örn.',
    shortRu: 'Подпись',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 33,
    key: 'fesih_bildirimi',
    excelHeader: 'Fesih Bildirimi',
    aliases: ['fesih bildirimi'],
    labelTr: 'Fesih Bildirimi',
    labelRu: 'Уведомление о расторжении',
    shortTr: 'Fesih Bild.',
    shortRu: 'Расторж.',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
  {
    index: 34,
    key: 'cikis_bildirgesi',
    excelHeader: 'Cıkış Bildirgesi',
    aliases: ['cikis bildirgesi', 'mvd cikis bildirgesi'],
    labelTr: 'Çıkış Bildirgesi (MVD)',
    labelRu: 'Уведомление МВД об увольнении',
    shortTr: 'Çıkış Bild.',
    shortRu: 'Увед. увольн.',
    group: 'exit_archive',
    isCore8: false,
    isCore14: false,
  },
];

export const TOTAL_DOC_SCAN_COLS = DOC_SCAN_DEFINITIONS.length; // 35

const KEY_TO_INDEX: Record<string, number> = Object.fromEntries(
  DOC_SCAN_DEFINITIONS.map((d) => [d.key, d.index])
);

export function normalizeScanHeader(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

export function resolveDocScanColumnIndex(rawHeader: string): number {
  const norm = normalizeScanHeader(rawHeader);
  if (!norm) return -1;
  for (const def of DOC_SCAN_DEFINITIONS) {
    if (normalizeScanHeader(def.excelHeader) === norm) return def.index;
    if (def.aliases.some((a) => normalizeScanHeader(a) === norm)) return def.index;
  }
  return -1;
}

const VISA_FREE_CIS_COUNTRIES = new Set([
  'OZBEKISTAN',
  'TACIKISTAN',
  'AZERBAYCAN',
  'MOLDOVA',
  'UKRAYNA',
  'KIRGIZISTAN',
  'KAZAKISTAN',
  'BELARUS',
  'ERMENISTAN',
  'RUSYA',
]);

/**
 * Returns the indices (0..34) of statutory required eBA scans for a given employee
 * based on citizenship (uyruk) and RF work permit category.
 */
export function getStatutoryRequiredIndices(
  uyrukRaw?: string | null,
  permitCategory?: WorkPermitCategoryKey | string | null
): number[] {
  const u = String(uyrukRaw || '').trim().toUpperCase();
  const p = String(permitCategory || 'OTHER_PENDING').trim().toUpperCase();

  let keys: string[];

  if (u === 'RUSYA' || p === 'RF_CITIZEN') {
    keys = ['pasaport', 'is_sozlesmesi_pdf', 'ise_alim_emri', 'med_29n'];
  } else if (
    p === 'EAES' ||
    u === 'KIRGIZISTAN' ||
    u === 'KAZAKISTAN' ||
    u === 'BELARUS' ||
    u === 'ERMENISTAN'
  ) {
    keys = [
      'pasaport',
      'pasaport_cevirisi',
      'migrasyon_kart',
      'ikametgah',
      'dms',
      'parmak_izi',
      'med_29n',
      'is_sozlesmesi_pdf',
      'ise_alim_emri',
    ];
  } else if (p === 'VNJ_RVP') {
    keys = [
      'pasaport',
      'pasaport_cevirisi',
      'ikametgah',
      'med_29n',
      'is_sozlesmesi_pdf',
      'ise_alim_emri',
    ];
  } else if (
    p === 'PATENT' ||
    (p === 'OTHER_PENDING' &&
      (u === 'OZBEKISTAN' || u === 'TACIKISTAN' || u === 'AZERBAYCAN' || u === 'MOLDOVA'))
  ) {
    keys = [
      'pasaport',
      'pasaport_cevirisi',
      'migrasyon_kart',
      'ikametgah',
      'dms',
      'patent',
      'patent_ceki',
      'rus_dil_sertifikasi',
      'parmak_izi',
      'med_29n',
      'is_sozlesmesi_pdf',
      'ise_alim_emri',
    ];
  } else if (p === 'VKS') {
    const isVisaFree = VISA_FREE_CIS_COUNTRIES.has(u);
    keys = [
      'pasaport',
      'pasaport_cevirisi',
      'migrasyon_kart',
      'ikametgah',
      'dms',
      'calisma_karti_rnr',
      ...(isVisaFree ? [] : ['vize']),
      'parmak_izi',
      'med_29n',
      'is_sozlesmesi_pdf',
      'ise_alim_emri',
    ];
  } else {
    // QUOTA_RNR or Visa OTHER_PENDING (e.g., HINDISTAN, TURKMENISTAN, TURKIYE, BANGLADES)
    const isVisaFree = VISA_FREE_CIS_COUNTRIES.has(u);
    keys = [
      'pasaport',
      'pasaport_cevirisi',
      'migrasyon_kart',
      'ikametgah',
      'dms',
      'calisma_karti_rnr',
      ...(isVisaFree ? [] : ['vize']),
      'parmak_izi',
      'med_29n',
      'is_sozlesmesi_pdf',
      'ise_alim_emri',
    ];
  }

  return keys.map((k) => KEY_TO_INDEX[k]).filter((idx) => idx !== undefined);
}

export const CORE8_INDICES: number[] = DOC_SCAN_DEFINITIONS.filter((d) => d.isCore8).map(
  (d) => d.index
);
export const CORE14_INDICES: number[] = DOC_SCAN_DEFINITIONS.filter((d) => d.isCore14).map(
  (d) => d.index
);
export const ALL35_INDICES: number[] = DOC_SCAN_DEFINITIONS.map((d) => d.index);

export interface EmployeeScanItem {
  id: number;
  sicilNo: string;
  adSoyad: string;
  fioKiril: string;
  gorevi: string;
  departman: string;
  firma: string;
  isMainFirm: boolean;
  region: string;
  projeAdi: string;
  uyruk: string;
  genelDurum: string;
  guncelDurum: string;
  iseGirisTarihi: string;
  permitCategory: WorkPermitCategoryKey;
  inScanReport: boolean;
  mask: string; // 35-char '0' / '1' string
}

