import { getDb } from '@/lib/db';
import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';
import { matchesCampRlsScope } from '@/lib/campManager';
import { ensureZupTableAndSeed, normalizeSicilDigits } from '@/lib/zupReconciliation';

export interface HealthHseSummary {
  totalActive: number;
  health29nDone: number;
  health29nPct: number;
  dmsActive: number;
  dmsExpiring30: number;
  dmsExpired: number;
  dmsPct: number;
  hseDone: number;
  hsePct: number;
  bloodTestDone: number;
  xrayDone: number;
  narcologyDone: number;
  vaccineDone: number;
  psychologyDone: number;
  byInsurer: { name: string; count: number }[];
  bySite: {
    site: string;
    total: number;
    health29nPct: number;
    dmsPct: number;
    hsePct: number;
    dmsExpiring: number;
  }[];
  expiringDmsList: {
    sicilNo: string;
    adSoyad: string;
    site: string;
    insurer: string;
    endDate: string;
    daysLeft: number;
  }[];
}

export interface SlaStepMetric {
  key: string;
  labelTr: string;
  labelRu: string;
  sampleCount: number;
  avgDays: number;
  medianDays: number;
  p90Days: number;
  slaTargetDays: number;
  overSlaCount: number;
  overSlaPct: number;
}

export interface SlaSpeedSummary {
  steps: SlaStepMetric[];
  bySite: {
    site: string;
    siteArrivalAvg: number;
    patentAvg: number;
    propuskAvg: number;
    registrationAvg: number;
    sampleCount: number;
  }[];
  delayedRecords: {
    sicilNo: string;
    adSoyad: string;
    site: string;
    stepLabel: string;
    startDate: string;
    endDate: string;
    durationDays: number;
  }[];
}

export interface LegalRiskSummary {
  checkedCount: number;
  regionMismatchCount: number;
  regionMismatchPct: number;
  bySite: {
    site: string;
    checked: number;
    mismatched: number;
    mismatchPct: number;
  }[];
  kppBreakdown: { name: string; count: number }[];
  propuskOriginBreakdown: { name: string; count: number }[];
  mismatchRecords: {
    sicilNo: string;
    adSoyad: string;
    uyruk: string;
    site: string;
    permitType: string;
    permitRegion: string;
    actualJob: string;
    permitJob: string;
  }[];
}

export interface MobilitySummary {
  totalChecked: number;
  topBorders: { name: string; count: number }[];
  monthlyEntries: { month: string; count: number }[];
  currentLocationBreakdown: { name: string; count: number }[];
  onLeaveCount: number;
  transferCount: number;
  transferFlows: { fromSite: string; toSite: string; count: number }[];
}

export interface ShiftSpanSummary {
  dayCount: number;
  nightCount: number;
  dayPct: number;
  nightPct: number;
  directCount: number;
  indirectCount: number;
  passiveCount: number;
  spanOfControlRatio: number;
  bySite: {
    site: string;
    day: number;
    night: number;
    direct: number;
    indirect: number;
    ratio: number;
  }[];
  topGroupLeaders: {
    leader: string;
    site: string;
    teamSize: number;
    directCount: number;
  }[];
}

export interface DataQualityFieldMeta {
  key: string;
  labelTr: string;
  labelRu: string;
}

export interface DataQualitySummary {
  overallScore: number;
  fields: DataQualityFieldMeta[];
  bySite: {
    site: string;
    total: number;
    overallPct: number;
    scores: Record<string, number>;
  }[];
}

export type TaxWorkerGroup = 'VIZELI_KOTA' | 'PATENT' | 'EAES' | 'VKS';

export interface NdflYearlyGroupRow {
  year: number;
  group: TaxWorkerGroup;
  totalCount: number;
  activeCount: number;
  exitedCount: number;
  under183Count: number;
  over183Count: number;
  under183Pct: number;
  avgDaysWorked: number;
  statutoryShortTermRate: number;
  statutoryLongTermRate: number;
  effectiveNdflPct: number;
  excessTaxPoints: number;
}

export interface NdflDurationBucketRow {
  bucket: string;
  VIZELI_KOTA: number;
  PATENT: number;
  EAES: number;
  VKS: number;
}

export interface NdflAtRiskRecord {
  sicilNo: string;
  adSoyad: string;
  uyruk: string;
  site: string;
  group: TaxWorkerGroup;
  hireDate: string;
  dismissalDate: string;
  isActive: boolean;
  daysWorked: number;
  daysTo183: number;
  taxRiskNoteTr: string;
  taxRiskNoteRu: string;
}

export interface NdflTaxAnalysisSummary {
  dataSourceNoteTr: string;
  dataSourceNoteRu: string;
  zupTotalAnalyzed: number;
  ebaHistoricalIncluded: number;
  availableYears: number[];
  yearlyRows: NdflYearlyGroupRow[];
  overallByGroup: {
    group: TaxWorkerGroup;
    labelTr: string;
    labelRu: string;
    totalCount: number;
    exitedCount: number;
    under183Count: number;
    under183Pct: number;
    avgDaysWorked: number;
    effectiveNdflPct: number;
    excessTaxPoints: number;
    shortTermRuleTr: string;
    shortTermRuleRu: string;
  }[];
  durationBuckets: NdflDurationBucketRow[];
  atRiskList: NdflAtRiskRecord[];
}

export interface ReportProposalsPayload {
  referenceDate: string;
  regions: string[];
  totalActiveAnalyzed: number;
  healthHse: HealthHseSummary;
  slaSpeed: SlaSpeedSummary;
  legalRisk: LegalRiskSummary;
  mobility: MobilitySummary;
  shiftSpan: ShiftSpanSummary;
  dataQuality: DataQualitySummary;
  ndflTaxAnalysis: NdflTaxAnalysisSummary;
}

interface RawPersonnelRow {
  sicil_no: string;
  ad_soyad: string;
  tam_adi_kiril: string;
  uyruk: string;
  kategori: string;
  firma: string;
  departman: string;
  gorevi: string;
  sorumlu_kisi: string;
  grup_sefi: string;
  endirekt_direkt: string;
  gunduz_gece: string;
  genel_durum: string;
  guncel_durum: string;
  region: string;
  proje_adi: string;
  ise_giris_tarihi: string;
  santiye_giris_tarihi: string;
  cikis_tarihi: string;
  pasaport_no: string;
  inn_no: string;
  telefon_no: string;
  kamp_no: string;
  propusk_no: string;
  all_data_json: string;
}

interface RawZupRow {
  tabel_no: string;
  norm_sicil: string;
  fio_kiril: string;
  hire_date: string;
  dismissal_date?: string;
  work_state?: string;
  tax_status: string;
  permit_category: string;
  citizenship_tr: string;
  citizenship_ru: string;
}

function cleanVal(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === '-' || low === '--' || low === '0' || low === 'nan' || low === 'null' || low === 'yok' || low === 'undefined') {
    return '';
  }
  return s;
}

function parseDateAny(val: unknown): Date | null {
  const s = cleanVal(val);
  if (!s) return null;
  const num = Number(s);
  if (!Number.isNaN(num) && num >= 20000 && num <= 73050) {
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateTr(d: Date | null): string {
  if (!d) return '-';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function diffDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86400000);
}

function medianOf(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10 : s[mid];
}

function p90Of(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor(s.length * 0.9));
  return s[idx];
}

function normalizeText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function matchesPermitRegionWithSite(permitRegionRaw: string, region: string, project: string): boolean {
  const pr = normalizeText(permitRegionRaw);
  if (!pr || pr.includes('muaf') || pr.includes('россия') || pr.includes('rf')) return true;

  const siteStr = normalizeText(`${region} ${project}`);

  const rules: Array<{ siteKeys: string[]; oblastKeys: string[] }> = [
    {
      siteKeys: ['kazan', 'nhnk', 'nizhnekamsk', 'nijnekamsk', 'sibur', 'polisterol', 'propilen', 'katalizor'],
      oblastKeys: ['татарстан', 'tatarstan', 'казан', 'нижнекамск'],
    },
    {
      siteKeys: ['svobodny', 'aghk', 'amur'],
      oblastKeys: ['амур', 'amur', 'свободн'],
    },
    {
      siteKeys: ['tobolsk', 'dgp-02', 'dgp'],
      oblastKeys: ['тюмен', 'tyumen', 'тобольск'],
    },
    {
      siteKeys: ['ust luga', 'ust-luga', 'kingisepp'],
      oblastKeys: ['ленинград', 'leningrad', 'санкт-петербург', 'спб', 'кингисепп'],
    },
    {
      siteKeys: ['irkutsk', 'izp', 'ust-kut'],
      oblastKeys: ['иркутск', 'irkutsk', 'усть-кут'],
    },
    {
      siteKeys: ['murmansk'],
      oblastKeys: ['мурманск', 'murmansk'],
    },
    {
      siteKeys: ['nizhny novgorod', 'nijniy novgorod'],
      oblastKeys: ['нижегород', 'nizhny'],
    },
    {
      siteKeys: ['merkez ofis', 'moskova', 'moscow'],
      oblastKeys: ['москв', 'moscow'],
    },
  ];

  for (const rule of rules) {
    if (rule.siteKeys.some((k) => siteStr.includes(k))) {
      return rule.oblastKeys.some((ok) => pr.includes(ok));
    }
  }
  return true;
}

function classifyTaxGroupFromZup(
  permitCategory: string,
  taxStatus: string,
  citizenshipTr: string
): TaxWorkerGroup | null {
  const pc = String(permitCategory || '').toUpperCase();
  const ts = String(taxStatus || '').toLowerCase();
  const cit = normalizeText(citizenshipTr);

  if (pc === 'VKS' || ts.includes('высококвалифицированный')) return 'VKS';
  if (pc === 'PATENT' || ts.includes('патент')) return 'PATENT';
  if (
    pc === 'EAES' ||
    ts.includes('еаэс') ||
    cit.includes('kirgiz') ||
    cit.includes('kazak') ||
    cit.includes('ermeni') ||
    cit.includes('belarus')
  ) {
    return 'EAES';
  }
  if (pc === 'RESIDENT' || ts === 'резидент' || cit.includes('rusya')) return null;
  if (pc === 'QUOTA_RNR' || ts.includes('нерезидент')) return 'VIZELI_KOTA';
  return null;
}

function classifyTaxGroupFromEba(
  permitRaw: string,
  vizeTypeRaw: string,
  uyrukRaw: string
): TaxWorkerGroup | null {
  const p = String(permitRaw || '').toLowerCase();
  const v = String(vizeTypeRaw || '').toLowerCase();
  const u = normalizeText(uyrukRaw);

  if (u.includes('rusya') || u.includes('russia')) return null;
  if (p.includes('вкс') || p.includes('vks') || v.includes('vks')) return 'VKS';
  if (p.includes('патент') || p.includes('patent')) return 'PATENT';
  if (
    p.includes('еаэс') ||
    p.includes('eaes') ||
    u.includes('kirgiz') ||
    u.includes('kazak') ||
    u.includes('ermeni') ||
    u.includes('belarus')
  ) {
    return 'EAES';
  }
  if (
    p.includes('рнр') ||
    p.includes('kota') ||
    v.includes('kota') ||
    u.includes('hindistan') ||
    u.includes('turkiye') ||
    u.includes('turkmen') ||
    u.includes('banglades') ||
    u.includes('pakistan')
  ) {
    return 'VIZELI_KOTA';
  }
  if (u.includes('ozbek') || u.includes('tacik') || u.includes('azerbaycan')) {
    return 'PATENT';
  }
  return null;
}

function overlapDaysInYear(start: Date, end: Date, year: number): number {
  const yStart = Date.UTC(year, 0, 1);
  const yEnd = Date.UTC(year, 11, 31);
  const s = Math.max(start.getTime(), yStart);
  const e = Math.min(end.getTime(), yEnd);
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

export function getReportProposalsPayload(options?: {
  region?: string;
  scopeType?: string;
  scopeValue?: string;
}): ReportProposalsPayload {
  const db = getDb();
  const scopeType = options?.scopeType || 'all';
  const scopeValue = options?.scopeValue || 'all';
  const filterRegion = String(options?.region || 'all').trim();

  // Reference date from system_info
  let refDate = new Date();
  let refDateLabel = formatDateTr(refDate);
  try {
    const sysRow = db
      .prepare("SELECT value FROM system_info WHERE key = 'data_freshness'")
      .get() as { value?: string } | undefined;
    if (sysRow?.value) {
      const parsed = parseDateAny(sysRow.value);
      if (parsed) {
        refDate = parsed;
        refDateLabel = formatDateTr(parsed);
      }
    }
  } catch {
    // keep now
  }

  const allPersonnel = db
    .prepare(
      `SELECT sicil_no, ad_soyad, tam_adi_kiril, uyruk, kategori, firma, departman, gorevi,
              sorumlu_kisi, grup_sefi, endirekt_direkt, gunduz_gece, genel_durum, guncel_durum,
              region, proje_adi, ise_giris_tarihi, santiye_giris_tarihi, cikis_tarihi,
              pasaport_no, inn_no, telefon_no, kamp_no, propusk_no, all_data_json
       FROM personnel`
    )
    .all() as unknown as RawPersonnelRow[];

  // Scope filter first
  const scopedAll = allPersonnel.filter((r) =>
    matchesCampRlsScope(r.region, r.proje_adi, scopeType, scopeValue)
  );

  // Collect available effective regions
  const regionSet = new Set<string>();
  for (const r of scopedAll) {
    if (r.genel_durum === 'Mevcut' || r.genel_durum === 'Patentsiz Calisiyor') {
      regionSet.add(resolveEffectiveRegion(r.region, r.proje_adi, 'Diğer'));
    }
  }
  const regions = Array.from(regionSet).sort((a, b) => a.localeCompare(b, 'tr'));

  const matchesFilterRegion = (r: RawPersonnelRow): boolean => {
    if (filterRegion === 'all') return true;
    const eff = resolveEffectiveRegion(r.region, r.proje_adi, 'Diğer');
    return (
      eff.toLowerCase() === filterRegion.toLowerCase() ||
      String(r.region || '').trim().toLowerCase() === filterRegion.toLowerCase()
    );
  };

  const activeRows = scopedAll.filter(
    (r) =>
      (r.genel_durum === 'Mevcut' || r.genel_durum === 'Patentsiz Calisiyor') &&
      matchesFilterRegion(r)
  );

  // ==================== TAB 1: HEALTH / HSE / DMS ====================
  let health29nDone = 0;
  let dmsActive = 0;
  let dmsExpiring30 = 0;
  let dmsExpired = 0;
  let hseDone = 0;
  let bloodTestDone = 0;
  let xrayDone = 0;
  let narcologyDone = 0;
  let vaccineDone = 0;
  let psychologyDone = 0;

  const insurerMap = new Map<string, number>();
  const healthBySiteMap = new Map<
    string,
    { total: number; h29n: number; dms: number; hse: number; dmsExpiring: number }
  >();
  const expiringDmsList: HealthHseSummary['expiringDmsList'] = [];

  // ==================== TAB 2: SLA & SPEED ====================
  const slaConfigs: Array<{
    key: string;
    labelTr: string;
    labelRu: string;
    startKey: string;
    endKey: string;
    target: number;
    maxValidDays: number;
  }> = [
    {
      key: 'site_arrival',
      labelTr: 'İşe Giriş → Şantiye Varış',
      labelRu: 'Прием → Прибытие на объект',
      startKey: 'İşe Giriş Tarihi',
      endKey: 'Şantiye Giriş Tarihi',
      target: 7,
      maxValidDays: 120,
    },
    {
      key: 'patent',
      labelTr: 'Patent Başvuru → Alış',
      labelRu: 'Патент: Подача → Получение',
      startKey: 'Patent Başvuru Tarihi',
      endKey: 'Patent Alış Tarihi',
      target: 20,
      maxValidDays: 180,
    },
    {
      key: 'propusk',
      labelTr: 'Propusk Başvuru → Alınış',
      labelRu: 'Пропуск: Подача → Выдача',
      startKey: 'Propusk Başvuru Tarihi',
      endKey: 'Propusk AlınışTarihi',
      target: 14,
      maxValidDays: 180,
    },
    {
      key: 'propusk_fsb',
      labelTr: 'FSB Propusk Başvuru → Alınış',
      labelRu: 'ФСБ Пропуск: Подача → Выдача',
      startKey: 'Propusk Başvuru Tarihi FSB',
      endKey: 'Propusk Alınış Tarihi FSB',
      target: 35,
      maxValidDays: 240,
    },
    {
      key: 'registration',
      labelTr: 'Registrasyon Dosyalama → Alış',
      labelRu: 'Регистрация: Подача → Получение',
      startKey: 'Registrasyon Dosyalama Tarihi',
      endKey: 'Registrasyon Alış Tarihi',
      target: 5,
      maxValidDays: 90,
    },
    {
      key: 'translation',
      labelTr: 'Pasaport Tercüme Gönderim → Geliş',
      labelRu: 'Перевод паспорта: Отпр. → Получ.',
      startKey: 'Pasaport Tercüme Gönderim Tarihi',
      endKey: 'Pasaport Tercüme Geliş Tarihi',
      target: 3,
      maxValidDays: 45,
    },
    {
      key: 'fingerprint',
      labelTr: 'Daktiloskopiya Başvuru → Alış',
      labelRu: 'Дактилоскопия: Подача → Получ.',
      startKey: 'Daktiloskopiya Başvuru Tarihi',
      endKey: 'Daktiloskopiya Alış Tarihi',
      target: 14,
      maxValidDays: 180,
    },
  ];
  const slaBuckets = new Map<string, number[]>();
  for (const cfg of slaConfigs) slaBuckets.set(cfg.key, []);
  const slaBySite = new Map<
    string,
    { arrival: number[]; patent: number[]; propusk: number[]; reg: number[] }
  >();
  const delayedRecords: SlaSpeedSummary['delayedRecords'] = [];

  // ==================== TAB 3: LEGAL REGION & KPP RISK ====================
  let legalChecked = 0;
  let regionMismatchCount = 0;
  const legalBySite = new Map<string, { checked: number; mismatched: number }>();
  const kppMap = new Map<string, number>();
  const propuskOriginMap = new Map<string, number>();
  const mismatchRecords: LegalRiskSummary['mismatchRecords'] = [];

  // ==================== TAB 4: MOBILITY & BORDERS ====================
  const borderMap = new Map<string, number>();
  const monthlyEntryMap = new Map<string, number>();
  const locationMap = new Map<string, number>();
  const transferFlowMap = new Map<string, number>();
  let onLeaveCount = 0;
  let transferCount = 0;

  // ==================== TAB 5: SHIFT & SPAN OF CONTROL ====================
  let dayCount = 0;
  let nightCount = 0;
  let directCount = 0;
  let indirectCount = 0;
  let passiveCount = 0;
  const shiftBySite = new Map<
    string,
    { day: number; night: number; direct: number; indirect: number }
  >();
  const leaderMap = new Map<string, { leader: string; site: string; teamSize: number; directCount: number }>();

  // ==================== TAB 6: DATA QUALITY HEATMAP ====================
  const dqFields: DataQualityFieldMeta[] = [
    { key: 'pasaport', labelTr: 'Pasaport', labelRu: 'Паспорт' },
    { key: 'inn', labelTr: 'İNN', labelRu: 'ИНН' },
    { key: 'snils', labelTr: 'SNİLS', labelRu: 'СНИЛС' },
    { key: 'telefon', labelTr: 'Telefon', labelRu: 'Телефон' },
    { key: 'dms', labelTr: 'DMS', labelRu: 'ДМС' },
    { key: 'h29n', labelTr: 'Sağlık 29n', labelRu: 'Мед. 29н' },
    { key: 'reg', labelTr: 'Registrasyon', labelRu: 'Регистр.' },
    { key: 'propusk', labelTr: 'Propusk', labelRu: 'Пропуск' },
    { key: 'kamp', labelTr: 'Kamp No', labelRu: 'Городок' },
    { key: 'hse', labelTr: 'HSE Eğitim', labelRu: 'ОТ/ТБ' },
  ];
  const dqBySite = new Map<string, { total: number; counts: Record<string, number> }>();

  // Single fast pass over all activeRows
  for (const r of activeRows) {
    const site = resolveEffectiveRegion(r.region, r.proje_adi, 'Diğer');
    let j: Record<string, unknown> = {};
    if (r.all_data_json) {
      try {
        j = JSON.parse(r.all_data_json) as Record<string, unknown>;
      } catch {
        j = {};
      }
    }

    // --- Tab 1 Health / DMS / HSE ---
    if (!healthBySiteMap.has(site)) {
      healthBySiteMap.set(site, { total: 0, h29n: 0, dms: 0, hse: 0, dmsExpiring: 0 });
    }
    const hs = healthBySiteMap.get(site)!;
    hs.total++;

    const has29n = Boolean(cleanVal(j['Sağlık 29n Rapor Alış Tarihi']) || cleanVal(j['Sağlık 29n Sonucu']) || cleanVal(j['Sağlık 29n Giriş Tarihi']));
    if (has29n) {
      health29nDone++;
      hs.h29n++;
    }

    const dmsEndStr = cleanVal(j['DMS Bitiş Tarihi']);
    const dmsInsurer = cleanVal(j['DMS Veren Firma']);
    const dmsNo = cleanVal(j['DMS Kart  No'] ?? j['DMS Kart No']);
    const dmsEndDate = parseDateAny(dmsEndStr);
    const hasDms = Boolean(dmsEndStr || dmsInsurer || dmsNo);
    if (hasDms) {
      dmsActive++;
      hs.dms++;
      if (dmsInsurer) {
        const cleanIns = dmsInsurer.slice(0, 38);
        insurerMap.set(cleanIns, (insurerMap.get(cleanIns) || 0) + 1);
      }
      if (dmsEndDate) {
        const dl = diffDays(refDate, dmsEndDate);
        if (dl !== null) {
          if (dl < 0) {
            dmsExpired++;
            hs.dmsExpiring++;
          } else if (dl <= 30) {
            dmsExpiring30++;
            hs.dmsExpiring++;
          }
          if (dl >= -15 && dl <= 60 && expiringDmsList.length < 150) {
            expiringDmsList.push({
              sicilNo: r.sicil_no,
              adSoyad: r.ad_soyad,
              site,
              insurer: dmsInsurer || '-',
              endDate: formatDateTr(dmsEndDate),
              daysLeft: dl,
            });
          }
        }
      }
    }

    const hasHse = Boolean(cleanVal(j['HSE Eğitim Tarihi']) || cleanVal(j['HSE Eğitime Giriş Tarihi']));
    if (hasHse) {
      hseDone++;
      hs.hse++;
    }
    if (cleanVal(j['Kan Test Tarihi'])) bloodTestDone++;
    if (cleanVal(j['Röntgen Tarihi'])) xrayDone++;
    if (cleanVal(j['Narkoloji']) || cleanVal(j['Narkoloji Idrar Test Tarihi'])) narcologyDone++;
    if (cleanVal(j['Aşıdan Geçtiği Tarih']) || cleanVal(j['Aşı Rapor Tarihi'])) vaccineDone++;
    if (cleanVal(j['Psikoloji Testi Geçtiği Tarih']) || cleanVal(j['Psikoloji Testi Alındığı Tarih'])) psychologyDone++;

    // --- Tab 2 SLA ---
    if (!slaBySite.has(site)) {
      slaBySite.set(site, { arrival: [], patent: [], propusk: [], reg: [] });
    }
    const ss = slaBySite.get(site)!;
    for (const cfg of slaConfigs) {
      const sd = parseDateAny(j[cfg.startKey]);
      const ed = parseDateAny(j[cfg.endKey]);
      const d = diffDays(sd, ed);
      if (d !== null && d >= 0 && d <= cfg.maxValidDays) {
        slaBuckets.get(cfg.key)!.push(d);
        if (cfg.key === 'site_arrival') ss.arrival.push(d);
        else if (cfg.key === 'patent') ss.patent.push(d);
        else if (cfg.key === 'propusk') ss.propusk.push(d);
        else if (cfg.key === 'registration') ss.reg.push(d);
        if (d > cfg.target * 2 && delayedRecords.length < 120) {
          delayedRecords.push({
            sicilNo: r.sicil_no,
            adSoyad: r.ad_soyad,
            site,
            stepLabel: cfg.labelTr,
            startDate: formatDateTr(sd),
            endDate: formatDateTr(ed),
            durationDays: d,
          });
        }
      }
    }

    // --- Tab 3 Legal Region & KPP ---
    const permitRegion = cleanVal(j['Çalışma Kart Bölgesi']);
    const permitType = cleanVal(j['Çalışma Kart Türü']);
    const permitJob = cleanVal(j['Çalışma Kart Görevi']);
    if (permitRegion) {
      legalChecked++;
      if (!legalBySite.has(site)) legalBySite.set(site, { checked: 0, mismatched: 0 });
      const ls = legalBySite.get(site)!;
      ls.checked++;
      const ok = matchesPermitRegionWithSite(permitRegion, r.region, r.proje_adi);
      if (!ok) {
        regionMismatchCount++;
        ls.mismatched++;
        if (mismatchRecords.length < 200) {
          mismatchRecords.push({
            sicilNo: r.sicil_no,
            adSoyad: r.ad_soyad,
            uyruk: r.uyruk,
            site,
            permitType: permitType || '-',
            permitRegion,
            actualJob: r.gorevi || '-',
            permitJob: permitJob || '-',
          });
        }
      }
    }
    const kppRaw = cleanVal(j['Sibur KPP']);
    if (kppRaw) {
      for (const token of kppRaw.split(/[,;/]+/)) {
        const cleanTok = token.trim().toUpperCase();
        if (cleanTok && cleanTok.length <= 24) {
          kppMap.set(cleanTok, (kppMap.get(cleanTok) || 0) + 1);
        }
      }
    }
    const originRaw = cleanVal(j['Propusk Origin']);
    if (originRaw) {
      propuskOriginMap.set(originRaw, (propuskOriginMap.get(originRaw) || 0) + 1);
    }

    // --- Tab 4 Mobility ---
    const border = cleanVal(j['Sınır Kapısı']);
    if (border) {
      borderMap.set(border.toUpperCase(), (borderMap.get(border.toUpperCase()) || 0) + 1);
    }
    const migDate = parseDateAny(j['Migrasyon Giriş Tarihi']);
    if (migDate) {
      const ym = `${migDate.getUTCFullYear()}-${String(migDate.getUTCMonth() + 1).padStart(2, '0')}`;
      if (migDate.getUTCFullYear() >= 2024) {
        monthlyEntryMap.set(ym, (monthlyEntryMap.get(ym) || 0) + 1);
      }
    }
    const curLoc = cleanVal(j['Mevcut Bulunduğu Yer']);
    if (curLoc) {
      locationMap.set(curLoc.toUpperCase(), (locationMap.get(curLoc.toUpperCase()) || 0) + 1);
    }
    if (normalizeText(r.guncel_durum).includes('izin') || cleanVal(j['İzine Gidiş Tarihi'])) {
      if (normalizeText(r.guncel_durum).includes('izin')) onLeaveCount++;
    }
    const trTop = cleanVal(j['Personelin Transfer Olduğu TOP']);
    if (trTop) {
      transferCount++;
      const fKey = `${trTop}|||${site}`;
      transferFlowMap.set(fKey, (transferFlowMap.get(fKey) || 0) + 1);
    }

    // --- Tab 5 Shift & Span ---
    const sh = normalizeText(r.gunduz_gece || String(j['Gündüz / Gece Durumu'] || ''));
    const isNight = sh.includes('gece') || sh.includes('ноч');
    const isDay = sh.includes('gunduz') || sh.includes('днев') || !isNight;
    if (isNight) nightCount++;
    else if (isDay) dayCount++;

    const ed = normalizeText(r.endirekt_direkt || String(j['Endirekt / Direkt'] || ''));
    const isDirect = ed === 'direkt';
    const isIndirect = ed === 'endirekt';
    if (isDirect) directCount++;
    else if (isIndirect) indirectCount++;
    else passiveCount++;

    if (!shiftBySite.has(site)) {
      shiftBySite.set(site, { day: 0, night: 0, direct: 0, indirect: 0 });
    }
    const sbs = shiftBySite.get(site)!;
    if (isNight) sbs.night++;
    else sbs.day++;
    if (isDirect) sbs.direct++;
    else if (isIndirect) sbs.indirect++;

    const leader = cleanVal(r.grup_sefi || r.sorumlu_kisi);
    if (leader && !/^(izin|cikis|yok|-)$/i.test(leader)) {
      const lKey = `${leader}|||${site}`;
      if (!leaderMap.has(lKey)) {
        leaderMap.set(lKey, { leader, site, teamSize: 0, directCount: 0 });
      }
      const lm = leaderMap.get(lKey)!;
      lm.teamSize++;
      if (isDirect) lm.directCount++;
    }

    // --- Tab 6 Data Quality ---
    if (!dqBySite.has(site)) {
      dqBySite.set(site, { total: 0, counts: {} });
    }
    const dq = dqBySite.get(site)!;
    dq.total++;
    const checks: Record<string, boolean> = {
      pasaport: Boolean(cleanVal(r.pasaport_no || j['Pasaport No'])),
      inn: Boolean(cleanVal(r.inn_no || j['INN No'])),
      snils: Boolean(cleanVal(j['CNILS No'])),
      telefon: Boolean(cleanVal(r.telefon_no || j['Telefon No'])),
      dms: hasDms,
      h29n: has29n,
      reg: Boolean(cleanVal(j['Registrasyon Bitiş Tarihi'] || j['Registrasyon Alış Tarihi'])),
      propusk: Boolean(cleanVal(r.propusk_no || j['Propusk No'] || j['Propusk Bitiş Tarihi'])),
      kamp: Boolean(cleanVal(r.kamp_no || j['Kamp No'])),
      hse: hasHse,
    };
    for (const f of dqFields) {
      if (checks[f.key]) dq.counts[f.key] = (dq.counts[f.key] || 0) + 1;
    }
  }

  const totalActive = activeRows.length;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  // Finalize Tab 1
  const healthHse: HealthHseSummary = {
    totalActive,
    health29nDone,
    health29nPct: pct(health29nDone, totalActive),
    dmsActive,
    dmsExpiring30,
    dmsExpired,
    dmsPct: pct(dmsActive, totalActive),
    hseDone,
    hsePct: pct(hseDone, totalActive),
    bloodTestDone,
    xrayDone,
    narcologyDone,
    vaccineDone,
    psychologyDone,
    byInsurer: Array.from(insurerMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    bySite: Array.from(healthBySiteMap.entries())
      .map(([site, v]) => ({
        site,
        total: v.total,
        health29nPct: pct(v.h29n, v.total),
        dmsPct: pct(v.dms, v.total),
        hsePct: pct(v.hse, v.total),
        dmsExpiring: v.dmsExpiring,
      }))
      .sort((a, b) => b.total - a.total),
    expiringDmsList: expiringDmsList.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 80),
  };

  // Finalize Tab 2
  const avgOf = (arr: number[]) =>
    arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : 0;

  const slaSpeed: SlaSpeedSummary = {
    steps: slaConfigs.map((cfg) => {
      const arr = slaBuckets.get(cfg.key) || [];
      const over = arr.filter((x) => x > cfg.target).length;
      return {
        key: cfg.key,
        labelTr: cfg.labelTr,
        labelRu: cfg.labelRu,
        sampleCount: arr.length,
        avgDays: avgOf(arr),
        medianDays: medianOf(arr),
        p90Days: p90Of(arr),
        slaTargetDays: cfg.target,
        overSlaCount: over,
        overSlaPct: pct(over, arr.length),
      };
    }),
    bySite: Array.from(slaBySite.entries())
      .map(([site, v]) => ({
        site,
        siteArrivalAvg: avgOf(v.arrival),
        patentAvg: avgOf(v.patent),
        propuskAvg: avgOf(v.propusk),
        registrationAvg: avgOf(v.reg),
        sampleCount: v.arrival.length + v.patent.length,
      }))
      .filter((x) => x.sampleCount > 0)
      .sort((a, b) => b.sampleCount - a.sampleCount)
      .slice(0, 12),
    delayedRecords: delayedRecords.sort((a, b) => b.durationDays - a.durationDays).slice(0, 80),
  };

  // Finalize Tab 3
  const legalRisk: LegalRiskSummary = {
    checkedCount: legalChecked,
    regionMismatchCount,
    regionMismatchPct: pct(regionMismatchCount, legalChecked),
    bySite: Array.from(legalBySite.entries())
      .map(([site, v]) => ({
        site,
        checked: v.checked,
        mismatched: v.mismatched,
        mismatchPct: pct(v.mismatched, v.checked),
      }))
      .sort((a, b) => b.mismatched - a.mismatched),
    kppBreakdown: Array.from(kppMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    propuskOriginBreakdown: Array.from(propuskOriginMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    mismatchRecords: mismatchRecords.slice(0, 120),
  };

  // Finalize Tab 4
  const mobility: MobilitySummary = {
    totalChecked: totalActive,
    topBorders: Array.from(borderMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    monthlyEntries: Array.from(monthlyEntryMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-18),
    currentLocationBreakdown: Array.from(locationMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    onLeaveCount,
    transferCount,
    transferFlows: Array.from(transferFlowMap.entries())
      .map(([k, count]) => {
        const [fromSite, toSite] = k.split('|||');
        return { fromSite, toSite, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
  };

  // Finalize Tab 5
  const shiftTotal = dayCount + nightCount;
  const shiftSpan: ShiftSpanSummary = {
    dayCount,
    nightCount,
    dayPct: pct(dayCount, shiftTotal),
    nightPct: pct(nightCount, shiftTotal),
    directCount,
    indirectCount,
    passiveCount,
    spanOfControlRatio:
      indirectCount > 0 ? Math.round((directCount / indirectCount) * 10) / 10 : 0,
    bySite: Array.from(shiftBySite.entries())
      .map(([site, v]) => ({
        site,
        day: v.day,
        night: v.night,
        direct: v.direct,
        indirect: v.indirect,
        ratio: v.indirect > 0 ? Math.round((v.direct / v.indirect) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.day + b.night - (a.day + a.night)),
    topGroupLeaders: Array.from(leaderMap.values())
      .sort((a, b) => b.teamSize - a.teamSize)
      .slice(0, 15),
  };

  // Finalize Tab 6
  const dqSiteRows = Array.from(dqBySite.entries())
    .map(([site, v]) => {
      const scores: Record<string, number> = {};
      let sum = 0;
      for (const f of dqFields) {
        const val = pct(v.counts[f.key] || 0, v.total);
        scores[f.key] = val;
        sum += val;
      }
      return {
        site,
        total: v.total,
        overallPct: Math.round((sum / dqFields.length) * 10) / 10,
        scores,
      };
    })
    .sort((a, b) => b.total - a.total);

  const overallDqScore =
    dqSiteRows.length > 0
      ? Math.round(
          (dqSiteRows.reduce((s, r) => s + r.overallPct * r.total, 0) / Math.max(1, totalActive)) *
            10
        ) / 10
      : 0;

  const dataQuality: DataQualitySummary = {
    overallScore: overallDqScore,
    fields: dqFields,
    bySite: dqSiteRows,
  };

  // ==================== TAB 7: ZAHID BEY — 1C ZUP NDFL & 183-DAY TAX ADVANTAGE ====================
  try {
    ensureZupTableAndSeed(db);
  } catch {
    // ignore
  }

  let zupRows: RawZupRow[] = [];
  try {
    zupRows = db
      .prepare(
        `SELECT tabel_no, norm_sicil, fio_kiril, hire_date, dismissal_date, work_state,
                tax_status, permit_category, citizenship_tr, citizenship_ru
         FROM zup_official_personnel`
      )
      .all() as unknown as RawZupRow[];
  } catch {
    try {
      zupRows = db
        .prepare(
          `SELECT tabel_no, norm_sicil, fio_kiril, hire_date,
                  tax_status, permit_category, citizenship_tr, citizenship_ru
           FROM zup_official_personnel`
        )
        .all() as unknown as RawZupRow[];
    } catch {
      zupRows = [];
    }
  }

  // Index eBA personnel by normSicil for site/region & fallback exit dates
  const ebaByNormSicil = new Map<string, RawPersonnelRow>();
  for (const p of scopedAll) {
    const ns = normalizeSicilDigits(p.sicil_no);
    if (ns && !ebaByNormSicil.has(ns)) {
      ebaByNormSicil.set(ns, p);
    }
  }

  interface TaxTenureEntity {
    sicilNo: string;
    adSoyad: string;
    uyruk: string;
    site: string;
    group: TaxWorkerGroup;
    hireDate: Date;
    endDate: Date;
    isActive: boolean;
    totalTenureDays: number;
    fromZup: boolean;
  }

  const taxEntities: TaxTenureEntity[] = [];
  const seenSicilInZup = new Set<string>();

  for (const zr of zupRows) {
    const ns = normalizeSicilDigits(zr.norm_sicil || zr.tabel_no);
    const matchedEba = ns ? ebaByNormSicil.get(ns) : undefined;
    if (matchedEba && !matchesFilterRegion(matchedEba)) continue;
    if (!matchedEba && filterRegion !== 'all') continue;

    const group = classifyTaxGroupFromZup(zr.permit_category, zr.tax_status, zr.citizenship_tr);
    if (!group) continue;

    const hireDate = parseDateAny(zr.hire_date) || (matchedEba ? parseDateAny(matchedEba.ise_giris_tarihi) : null);
    if (!hireDate) continue;

    const zupDismiss = parseDateAny(zr.dismissal_date);
    const ebaExit = matchedEba && matchedEba.genel_durum === 'Cikis' ? parseDateAny(matchedEba.cikis_tarihi) : null;
    const isDismissed =
      Boolean(zupDismiss) ||
      String(zr.work_state || '').toLowerCase().includes('увольн') ||
      Boolean(ebaExit);

    const endDate = zupDismiss || ebaExit || refDate;
    const totalTenureDays = Math.max(1, diffDays(hireDate, endDate) ?? 1);
    const site = matchedEba
      ? resolveEffectiveRegion(matchedEba.region, matchedEba.proje_adi, 'Diğer')
      : '1C ZUP (Genel)';

    if (ns) seenSicilInZup.add(ns);

    taxEntities.push({
      sicilNo: matchedEba?.sicil_no || zr.tabel_no || '-',
      adSoyad: matchedEba?.ad_soyad || zr.fio_kiril || '-',
      uyruk: matchedEba?.uyruk || zr.citizenship_tr || zr.citizenship_ru || '-',
      site,
      group,
      hireDate,
      endDate,
      isActive: !isDismissed,
      totalTenureDays,
      fromZup: true,
    });
  }

  // Also include historical exited eBA records (2023-2026) not present in ZUP active snapshot
  // so multi-year exited tenure analysis reflects true short-term turnover!
  let ebaHistoricalIncluded = 0;
  for (const p of scopedAll) {
    if (p.genel_durum !== 'Cikis') continue;
    if (!matchesFilterRegion(p)) continue;
    const ns = normalizeSicilDigits(p.sicil_no);
    if (ns && seenSicilInZup.has(ns)) continue;

    const hireDate = parseDateAny(p.ise_giris_tarihi);
    const exitDate = parseDateAny(p.cikis_tarihi);
    if (!hireDate || !exitDate) continue;
    if (exitDate.getUTCFullYear() < 2023) continue;

    let permitCol = '';
    let vizeCol = '';
    if (p.all_data_json && (p.all_data_json.includes('Çalışma Kart Türü') || p.all_data_json.includes('Vize Türü'))) {
      try {
        const j = JSON.parse(p.all_data_json) as Record<string, unknown>;
        permitCol = cleanVal(j['Çalışma Kart Türü']);
        vizeCol = cleanVal(j['Vize Türü']);
      } catch {
        // ignore
      }
    }
    const group = classifyTaxGroupFromEba(permitCol, vizeCol, p.uyruk);
    if (!group) continue;

    const totalTenureDays = Math.max(1, diffDays(hireDate, exitDate) ?? 1);
    if (totalTenureDays > 3650) continue;

    ebaHistoricalIncluded++;
    taxEntities.push({
      sicilNo: p.sicil_no,
      adSoyad: p.ad_soyad,
      uyruk: p.uyruk,
      site: resolveEffectiveRegion(p.region, p.proje_adi, 'Diğer'),
      group,
      hireDate,
      endDate: exitDate,
      isActive: false,
      totalTenureDays,
      fromZup: false,
    });
  }

  const targetYears = [2024, 2025, 2026];
  const groupsOrder: TaxWorkerGroup[] = ['VIZELI_KOTA', 'PATENT', 'EAES', 'VKS'];

  const groupMeta: Record<
    TaxWorkerGroup,
    {
      labelTr: string;
      labelRu: string;
      shortRate: number;
      longRate: number;
      shortRuleTr: string;
      shortRuleRu: string;
    }
  > = {
    VIZELI_KOTA: {
      labelTr: 'Vizeli / Kota (RNR)',
      labelRu: 'Визовые / Квота (РНР)',
      shortRate: 30,
      longRate: 13,
      shortRuleTr: '<183 gün: Kalıcı %30 NDFL (+17 puan kayıp); ≥183 gün: %13',
      shortRuleRu: '<183 дн.: НДФЛ 30% (+17 п.п. потерь); ≥183 дн.: 13%',
    },
    PATENT: {
      labelTr: 'Patentli (SNG)',
      labelRu: 'Патент (СНГ)',
      shortRate: 13,
      longRate: 13,
      shortRuleTr: '1. günden itibaren daima %13 NDFL (183 gün cezası YOK + avans mahsubu)',
      shortRuleRu: 'С 1-го дня всегда НДФЛ 13% (нет штрафа за <183 дн. + зачет аванса)',
    },
    EAES: {
      labelTr: 'EAES (Kırgız/Kazak/Erm./Bel.)',
      labelRu: 'ЕАЭС (КР/РК/РА/РБ)',
      shortRate: 30,
      longRate: 13,
      shortRuleTr: 'Başta %13; ancak yıl sonu <183 gün kalıp ayrılırsa %30 ek tahakkuk riski!',
      shortRuleRu: 'Сначала 13%; но если на конец года <183 дн. — перерасчет по 30%!',
    },
    VKS: {
      labelTr: 'VKS (Yüksek Nitelikli)',
      labelRu: 'ВКС (Высококвал. спец.)',
      shortRate: 13,
      longRate: 13,
      shortRuleTr: '1. günden itibaren daima %13 NDFL (asgari VKS maaş şartı gerekir)',
      shortRuleRu: 'С 1-го дня всегда НДФЛ 13% (требуется порог оклада ВКС)',
    },
  };

  const yearlyRows: NdflYearlyGroupRow[] = [];
  for (const yr of targetYears) {
    for (const grp of groupsOrder) {
      const inYear = taxEntities.filter(
        (e) => e.group === grp && overlapDaysInYear(e.hireDate, e.endDate, yr) > 0
      );
      let activeCount = 0;
      let exitedCount = 0;
      let under183Count = 0;
      let over183Count = 0;
      let sumDays = 0;

      for (const e of inYear) {
        const yDays = overlapDaysInYear(e.hireDate, e.endDate, yr);
        sumDays += yDays;
        // For resident status: either >=183 days in that year OR total continuous tenure >= 183 days
        // (for EAES calendar-year residency rule, strictly >= 183 days in the calendar year if exited that year)
        const isStillWorkingAtYearEnd = e.isActive && yr === refDate.getUTCFullYear();
        const reached183 =
          grp === 'EAES'
            ? yDays >= 183 || (isStillWorkingAtYearEnd && e.totalTenureDays >= 183)
            : yDays >= 183 || e.totalTenureDays >= 183;

        if (e.isActive && yr === refDate.getUTCFullYear()) activeCount++;
        else exitedCount++;

        if (reached183) over183Count++;
        else under183Count++;
      }

      const totalCount = inYear.length;
      const under183Pct = pct(under183Count, totalCount);
      const meta = groupMeta[grp];
      const effectiveNdflPct =
        totalCount > 0
          ? Math.round(
              (((under183Count * meta.shortRate + over183Count * meta.longRate) / totalCount) * 10)
            ) / 10
          : meta.longRate;

      yearlyRows.push({
        year: yr,
        group: grp,
        totalCount,
        activeCount,
        exitedCount,
        under183Count,
        over183Count,
        under183Pct,
        avgDaysWorked: totalCount > 0 ? Math.round(sumDays / totalCount) : 0,
        statutoryShortTermRate: meta.shortRate,
        statutoryLongTermRate: meta.longRate,
        effectiveNdflPct,
        excessTaxPoints: Math.round((effectiveNdflPct - 13) * 10) / 10,
      });
    }
  }

  // Overall group summary across all analyzed records
  const overallByGroup = groupsOrder.map((grp) => {
    const list = taxEntities.filter((e) => e.group === grp);
    const totalCount = list.length;
    const exitedCount = list.filter((e) => !e.isActive).length;
    const under183Count = list.filter((e) => e.totalTenureDays < 183).length;
    const over183Count = totalCount - under183Count;
    const avgDaysWorked =
      totalCount > 0
        ? Math.round(list.reduce((s, e) => s + e.totalTenureDays, 0) / totalCount)
        : 0;
    const meta = groupMeta[grp];
    const effectiveNdflPct =
      totalCount > 0
        ? Math.round(
            (((under183Count * meta.shortRate + over183Count * meta.longRate) / totalCount) * 10)
          ) / 10
        : meta.longRate;

    return {
      group: grp,
      labelTr: meta.labelTr,
      labelRu: meta.labelRu,
      totalCount,
      exitedCount,
      under183Count,
      under183Pct: pct(under183Count, totalCount),
      avgDaysWorked,
      effectiveNdflPct,
      excessTaxPoints: Math.round((effectiveNdflPct - 13) * 10) / 10,
      shortTermRuleTr: meta.shortRuleTr,
      shortTermRuleRu: meta.shortRuleRu,
    };
  });

  // Duration buckets histogram
  const bucketDefs = [
    { label: '0–60 Gün', min: 0, max: 60 },
    { label: '61–120 Gün', min: 61, max: 120 },
    { label: '121–182 Gün', min: 121, max: 182 },
    { label: '183–365 Gün', min: 183, max: 365 },
    { label: '365+ Gün', min: 366, max: 99999 },
  ];
  const durationBuckets: NdflDurationBucketRow[] = bucketDefs.map((b) => {
    const row: NdflDurationBucketRow = {
      bucket: b.label,
      VIZELI_KOTA: 0,
      PATENT: 0,
      EAES: 0,
      VKS: 0,
    };
    for (const e of taxEntities) {
      if (e.totalTenureDays >= b.min && e.totalTenureDays <= b.max) {
        row[e.group]++;
      }
    }
    return row;
  });

  // High-priority <183-day tax risk list (Vizeli/Kota & EAES currently <183 days or recently exited <183 days)
  const atRiskList: NdflAtRiskRecord[] = taxEntities
    .filter(
      (e) =>
        (e.group === 'VIZELI_KOTA' || e.group === 'EAES') &&
        e.totalTenureDays < 183 &&
        e.endDate.getUTCFullYear() >= 2025
    )
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.totalTenureDays - a.totalTenureDays;
    })
    .slice(0, 120)
    .map((e) => ({
      sicilNo: e.sicilNo,
      adSoyad: e.adSoyad,
      uyruk: e.uyruk,
      site: e.site,
      group: e.group,
      hireDate: formatDateTr(e.hireDate),
      dismissalDate: e.isActive ? '-' : formatDateTr(e.endDate),
      isActive: e.isActive,
      daysWorked: e.totalTenureDays,
      daysTo183: Math.max(0, 183 - e.totalTenureDays),
      taxRiskNoteTr: e.isActive
        ? e.group === 'VIZELI_KOTA'
          ? `Şu an %30 NDFL — Rezidentliğe ${Math.max(0, 183 - e.totalTenureDays)} gün kaldı`
          : `EAES %13 kesiliyor — Yıl sonu 183 gün için ${Math.max(0, 183 - e.totalTenureDays)} gün gerekli`
        : e.group === 'VIZELI_KOTA'
          ? `183 günden erken ayrıldı (${e.totalTenureDays}g) → Kalıcı %30 NDFL kaybı`
          : `EAES <183 gün ayrıldı (${e.totalTenureDays}g) → Yıl sonu %30 yeniden hesaplama riski`,
      taxRiskNoteRu: e.isActive
        ? e.group === 'VIZELI_KOTA'
          ? `Сейчас НДФЛ 30% — до резидентства ${Math.max(0, 183 - e.totalTenureDays)} дн.`
          : `ЕАЭС 13% — нужно еще ${Math.max(0, 183 - e.totalTenureDays)} дн. до 183`
        : e.group === 'VIZELI_KOTA'
          ? `Уволен <183 дн. (${e.totalTenureDays} дн.) → Потеря по НДФЛ 30%`
          : `ЕАЭС уволен <183 дн. (${e.totalTenureDays} дн.) → Риск перерасчета 30%`,
    }));

  const ndflTaxAnalysis: NdflTaxAnalysisSummary = {
    dataSourceNoteTr:
      '1C ZUP resmi işe giriş/çıkış kayıtları ve eBA geçmiş çıkış tarihleri birlikte analiz edilmiştir. Rusya Vergi Kanunu (НК РФ ст. 224) yasal oranları (%13 vs %30) esas alınır; bireysel maaş verisi kullanılmaz.',
    dataSourceNoteRu:
      'Анализ построен по датам приема/увольнения из 1С ЗУП и истории увольнений eBA по ставкам НК РФ ст. 224 (13% vs 30%) без использования персональных зарплат.',
    zupTotalAnalyzed: taxEntities.filter((e) => e.fromZup).length,
    ebaHistoricalIncluded,
    availableYears: targetYears,
    yearlyRows,
    overallByGroup,
    durationBuckets,
    atRiskList,
  };

  return {
    referenceDate: refDateLabel,
    regions,
    totalActiveAnalyzed: totalActive,
    healthHse,
    slaSpeed,
    legalRisk,
    mobility,
    shiftSpan,
    dataQuality,
    ndflTaxAnalysis,
  };
}
