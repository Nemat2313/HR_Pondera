import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  ensureZupTableAndSeed,
  ZupOfficialRecord,
  normalizeSicilDigits,
  normalizeDigitsOnly,
  normalizeCyrillicName,
  normalizeDateValue,
  formatZupBranchShort,
  mapZupTaxStatusToPermitCategory,
} from '@/lib/zupReconciliation';
import {
  ensureInterSiteTransfersSynced,
  formatSystemTimestampToMsk,
} from '@/lib/interSiteTransfers';
import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GOSUSLUGI_CITIZENSHIP_RU: Record<string, string> = {
  УЗБЕКИСТАН: 'Узбекистан',
  OZBEKISTAN: 'Узбекистан',
  ÖZBEKİSTAN: 'Узбекистан',
  ТАДЖИКИСТАН: 'Таджикистан',
  TACIKISTAN: 'Таджикистан',
  TACİKİSTAN: 'Таджикистан',
  ИНДИЯ: 'Индия',
  HINDISTAN: 'Индия',
  HİNDİSTAN: 'Индия',
  ТУРЦИЯ: 'Турция',
  TURKIYE: 'Турция',
  TÜRKİYE: 'Турция',
  ТУРКМЕНИСТАН: 'Туркменистан',
  ТУРКМЕНИЯ: 'Туркменистан',
  TURKMENISTAN: 'Туркменистан',
  TÜRKMENİSTAN: 'Туркменистан',
  КЫРГЫЗСТАН: 'Кыргызстан',
  КИРГИЗИЯ: 'Кыргызстан',
  KIRGIZISTAN: 'Кыргызстан',
  KIRGIZİSTAN: 'Кыргызстан',
  КАЗАХСТАН: 'Казахстан',
  KAZAKISTAN: 'Казахстан',
  KAZAKİSTAN: 'Казахстан',
  АЗЕРБАЙДЖАН: 'Азербайджан',
  AZERBAYCAN: 'Азербайджан',
  БАНГЛАДЕШ: 'Бангладеш',
  BANGLADES: 'Бангладеш',
  BANGLADEŞ: 'Бангладеш',
  КИТАЙ: 'Китай',
  CIN: 'Китай',
  ÇİN: 'Китай',
  ФИЛИППИНЫ: 'Филиппины',
  FILIPINLER: 'Филиппины',
  FİLİPİNLER: 'Филиппины',
  ПАКИСТАН: 'Пакистан',
  PAKISTAN: 'Пакистан',
  PAKİSTAN: 'Пакистан',
  МОЛДОВА: 'Молдова',
  'МОЛДОВА, РЕСПУБЛИКА': 'Молдова',
  АРМЕНИЯ: 'Армения',
  ERMENISTAN: 'Армения',
  УКРАИНА: 'Украина',
  UKRAYNA: 'Украина',
  БЕЛАРУСЬ: 'Беларусь',
  BELARUS: 'Беларусь',
  РОССИЯ: 'Россия',
  RUSYA: 'Россия',
};

const PATENT_SERIES_TO_REGION: Record<string, { short: string; full: string }> = {
  '72': { short: 'Тюменская', full: 'Тюменская область' },
  '47': { short: 'Ленинградская', full: 'Ленинградская область' },
  '78': { short: 'Санкт-Петербург', full: 'г. Санкт-Петербург' },
  '77': { short: 'Москва', full: 'г. Москва' },
  '99': { short: 'Москва', full: 'г. Москва' },
  '50': { short: 'Московская', full: 'Московская область' },
  '28': { short: 'Амурская', full: 'Амурская область' },
  '16': { short: 'Татарстан', full: 'Республика Татарстан' },
  '02': { short: 'Башкортостан', full: 'Республика Башкортостан' },
  '52': { short: 'Нижегородская', full: 'Нижегородская область' },
  '23': { short: 'Краснодарский', full: 'Краснодарский край' },
  '66': { short: 'Свердловская', full: 'Свердловская область' },
  '86': { short: 'Ханты-Мансийский', full: 'Ханты-Мансийский автономный округ' },
  '89': { short: 'Ямало-Ненецкий', full: 'Ямало-Ненецкий автономный округ' },
};

function toRuDisplayDate(raw?: unknown): string {
  if (raw === null || raw === undefined) return '';
  const iso = normalizeDateValue(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }
  const s = String(raw).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  return '';
}

function parseIsoTimestampMs(ruDate: string): number {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ruDate);
  if (!m) return 0;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) {
    return 0;
  }
  return d.getTime();
}

function mapZupDepartmentToRegion(zupDept?: string | null): string {
  const low = String(zupDept || '').toLowerCase();
  if (!low) return '';
  if (low.includes('казань') || low.includes('нижнекамск') || low.includes('эп-300') || low.includes('полист')) {
    return 'Kazan';
  }
  if (low.includes('тобольск') || low.includes('дгп')) {
    return 'Tobolsk';
  }
  if (low.includes('усть-луга') || low.includes('кингисепп')) {
    return 'Ust Luga';
  }
  if (low.includes('свободный') || low.includes('агхк')) {
    return 'Svobodny-AGHK';
  }
  if (low.includes('амур')) {
    return 'Amur';
  }
  if (low.includes('основное')) {
    return 'Merkez Ofis';
  }
  return '';
}

function normalizeEmptyToNet(val?: string | null): string {
  const v = String(val || '').trim();
  if (
    !v ||
    ['-', '—', '–', 'нет', 'не указано', 'не заполнено', 'yok', 'none', 'null'].includes(
      v.toLowerCase()
    )
  ) {
    return 'Нет';
  }
  return v;
}

function cleanOptionalPart(val?: string | null): string {
  const n = normalizeEmptyToNet(val);
  return n === 'Нет' ? '' : n;
}

function splitCyrillicFullName(
  zupFio: string,
  ebaLast?: string,
  ebaFirst?: string,
  ebaMiddle?: string
): { lastName: string; firstName: string; middleName: string } {
  const cleanZup = String(zupFio || '')
    .replace(/\b\d{5,8}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const eLast = cleanOptionalPart(ebaLast);
  const eFirst = cleanOptionalPart(ebaFirst);
  const eMid = cleanOptionalPart(ebaMiddle);

  if (!cleanZup) {
    return {
      lastName: normalizeEmptyToNet(eLast),
      firstName: eFirst,
      middleName: normalizeEmptyToNet(eMid),
    };
  }

  // If eBA has explicit surname/given-name/patronymic fields whose Cyrillic tokens match 1C ZUP,
  // respect eBA's passport field boundaries (e.g. Indian passports with empty Фамилия and 2-word Имя like 'ПРАДИП КУМАР')
  if (eFirst) {
    const normFull = normalizeCyrillicName(cleanZup);
    const normEbaCombined = normalizeCyrillicName(
      [eLast, eFirst, eMid].filter(Boolean).join(' ')
    );
    if (normFull === normEbaCombined) {
      return {
        lastName: normalizeEmptyToNet(eLast),
        firstName: eFirst,
        middleName: normalizeEmptyToNet(eMid),
      };
    }
  }

  const parts = cleanZup.split(' ').filter(Boolean);
  if (parts.length === 1) {
    if (eLast && eFirst) {
      return {
        lastName: normalizeEmptyToNet(eLast),
        firstName: eFirst,
        middleName: normalizeEmptyToNet(eMid),
      };
    }
    return { lastName: 'Нет', firstName: parts[0], middleName: 'Нет' };
  }

  // If eBA explicitly recorded NO surname (eLast === '') while having a given name (eFirst !== ''),
  // keep all 1C ZUP name words in firstName and set lastName = 'Нет'
  if (!eLast && eFirst) {
    return {
      lastName: 'Нет',
      firstName: cleanZup,
      middleName: normalizeEmptyToNet(eMid),
    };
  }

  if (parts.length === 2) {
    return {
      lastName: normalizeEmptyToNet(parts[0]),
      firstName: parts[1],
      middleName: normalizeEmptyToNet(eMid),
    };
  }

  return {
    lastName: normalizeEmptyToNet(parts[0]),
    firstName: parts[1],
    middleName: normalizeEmptyToNet(parts.slice(2).join(' ')),
  };
}

function extractPatentAndBlank(raw: Record<string, any>): {
  patentSeries: string;
  patentNumber: string;
  patentIssueDate: string;
  blankSeries: string;
  blankNumber: string;
} {
  let patentSeries = String(raw['Çalışma Kart Seri No'] || '').trim();
  let patentNumber = String(raw['Çalışma Kart No'] || '').trim();

  if (!patentSeries && patentNumber) {
    const mSplit = patentNumber.match(/^(\d{2})\s*(?:№|N|#|-)?\s*(\d{8,12})$/i);
    if (mSplit) {
      patentSeries = mSplit[1];
      patentNumber = mSplit[2];
    }
  }

  const patentIssueDate = toRuDisplayDate(
    raw['Çalışma Kart Alış Tarihi'] || raw['Çalışma Kart Başlangıç Tarihi']
  );

  let blankSeries = String(raw['Patent Form Seri No'] || '').trim();
  let blankNumber = String(raw['Patent Form No'] || '').trim();
  if (!blankSeries && blankNumber) {
    const mBlank = blankNumber.match(/^([А-ЯЁA-Z]{2})\s*(\d{6,8})$/i);
    if (mBlank) {
      blankSeries = mBlank[1].toUpperCase();
      blankNumber = mBlank[2];
    }
  }

  return {
    patentSeries,
    patentNumber,
    patentIssueDate,
    blankSeries,
    blankNumber,
  };
}

function inferVoluntaryResignation(zupReason?: string, ebaReason?: string): string {
  const zLow = String(zupReason || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (zLow) {
    if (zLow.includes('п. 3 ч. 1 ст. 77') || zLow.includes('ст. 80') || zLow.includes('собственн') || zLow.includes('инициативе работника')) {
      return 'Да';
    }
    if (
      zLow.includes('ст. 81') ||
      zLow.includes('ст. 83') ||
      zLow.includes('п. 1 ч. 1 ст. 77') ||
      zLow.includes('п. 2 ч. 1 ст. 77') ||
      zLow.includes('соглашен') ||
      zLow.includes('истечен')
    ) {
      return 'Нет';
    }
  }
  const combined = `${zLow} ${ebaReason || ''}`.toLowerCase();
  if (!combined.trim()) return 'Да';
  if (
    combined.includes('дисциплин') ||
    combined.includes('прогул') ||
    combined.includes('инициативе работодателя') ||
    combined.includes('сокращ') ||
    combined.includes('fesih') ||
    combined.includes('disiplin') ||
    combined.includes('işveren')
  ) {
    return 'Нет';
  }
  return 'Да';
}

export async function GET(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'hiring' ? 'hiring' : 'dismissal';
    const metaOnly = searchParams.get('metaOnly') === 'true';

    let scopeRegion = 'all';
    let scopeProject = 'all';
    if (sessionUser.scope_type === 'region' && sessionUser.scope_value !== 'all') {
      scopeRegion = sessionUser.scope_value;
    } else if (sessionUser.scope_type === 'project' && sessionUser.scope_value !== 'all') {
      scopeProject = sessionUser.scope_value;
    }

    const db = getDb();
    ensureZupTableAndSeed(db);

    const sysRows = db
      .prepare(
        "SELECT key, value FROM system_info WHERE key IN ('data_freshness', 'last_updated', 'eba_updated_at_msk', 'zup_data_freshness', 'zup_source_file', 'zup_last_updated', 'zup_updated_at_msk')"
      )
      .all() as { key: string; value: string }[];
    const sysMap: Record<string, string> = {};
    for (const r of sysRows) {
      sysMap[r.key] = r.value;
    }

    const ebaDate = sysMap['data_freshness'] || '12.11.2026';
    const zupDate = sysMap['zup_data_freshness'] || '12.11.2026';
    const ebaTs = formatSystemTimestampToMsk(
      sysMap['last_updated'],
      ebaDate,
      sysMap['eba_updated_at_msk']
    );
    const zupTs = formatSystemTimestampToMsk(
      sysMap['zup_last_updated'],
      zupDate,
      sysMap['zup_updated_at_msk']
    );

    const zupStats = db
      .prepare(
        `SELECT
          COUNT(*) as totalCnt,
          SUM(CASE WHEN LOWER(COALESCE(work_state, '')) LIKE '%увол%' OR TRIM(COALESCE(dismissal_date, '')) != '' OR (TRIM(COALESCE(work_state, '')) = '' AND TRIM(COALESCE(hire_date, '')) != '') THEN 1 ELSE 0 END) as dismissedCnt,
          SUM(CASE WHEN TRIM(COALESCE(dismissal_date, '')) != '' THEN 1 ELSE 0 END) as withDismissDateCnt
        FROM zup_official_personnel`
      )
      .get() as { totalCnt: number; dismissedCnt: number; withDismissDateCnt: number };

    const hasZupDismissalDateColumn = (zupStats?.withDismissDateCnt || 0) > 0;

    if (metaOnly) {
      return NextResponse.json({
        success: true,
        metadata: {
          mode,
          zupDate: zupTs.date,
          zupTime: zupTs.time,
          zupFullTimestamp: zupTs.full,
          zupSourceFile: sysMap['zup_source_file'] || 'Personel_List.xlsx',
          ebaDate: ebaTs.date,
          ebaTime: ebaTs.time,
          ebaFullTimestamp: ebaTs.full,
          hasZupDismissalDateColumn,
          zupTotalRecords: zupStats?.totalCnt || 0,
          zupDismissedRecords: zupStats?.dismissedCnt || 0,
        },
      });
    }

    ensureInterSiteTransfersSynced(db);

    const allZupRows = db
      .prepare('SELECT * FROM zup_official_personnel ORDER BY row_no ASC')
      .all() as ZupOfficialRecord[];
    const hasStateCol = allZupRows.some((r) => Boolean(String(r.work_state || '').trim()));

    // Load nightly detected 'Работа -> Увольнение' transition dates
    const transitionMap = new Map<string, string>();
    try {
      const tRows = db
        .prepare('SELECT norm_key, detected_exit_date FROM zup_dismissal_transitions')
        .all() as { norm_key: string; detected_exit_date: string }[];
      for (const tr of tRows) {
        if (tr.norm_key && tr.detected_exit_date) {
          transitionMap.set(tr.norm_key, tr.detected_exit_date);
        }
      }
    } catch {}

    // Load inter-site transfers map
    const transferDirByEmpId = new Map<number, string>();
    try {
      const istRows = db
        .prepare('SELECT personnel_id, transfer_direction FROM inter_site_transfers')
        .all() as { personnel_id: number; transfer_direction: string }[];
      for (const ist of istRows) {
        transferDirByEmpId.set(ist.personnel_id, ist.transfer_direction);
      }
    } catch {}

    // Load Gosuslugi RPA submission history
    const submissionMap = new Map<
      string,
      { appNo: string; status: string; submittedAt: string }
    >();
    try {
      const subExists = db
        .prepare(
          "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='gosuslugi_submissions'"
        )
        .get() as { c: number } | undefined;
      if (subExists && subExists.c > 0) {
        const subRows = db
          .prepare(
            'SELECT sicil_no, application_no, gosuslugi_status, submitted_at FROM gosuslugi_submissions WHERE notification_type = ? ORDER BY id DESC'
          )
          .all(mode) as {
          sicil_no: string;
          application_no: string;
          gosuslugi_status: string;
          submitted_at: string;
        }[];
        for (const sr of subRows) {
          const exact = String(sr.sicil_no || '').trim();
          const norm = normalizeSicilDigits(exact);
          const val = {
            appNo: String(sr.application_no || ''),
            status: String(sr.gosuslugi_status || 'Отправлено'),
            submittedAt: String(sr.submitted_at || ''),
          };
          if (exact && !submissionMap.has(exact)) submissionMap.set(exact, val);
          if (norm && !submissionMap.has(norm)) submissionMap.set(norm, val);
        }
      }
    } catch {}

    // Load eBA personnel for document enrichment
    const ebaRows = db
      .prepare(
        `SELECT
          id, sicil_no, genel_durum, ad_soyad, soyadi, adi, baba_adi, tam_adi_kiril,
          uyruk, gorevi, rhi_gorevi, departman, proje_adi, region,
          ise_giris_tarihi, cikis_tarihi, cikis_sebebi, dogum_tarihi,
          pasaport_no, inn_no, cinsiyet, all_data_json
        FROM personnel`
      )
      .all() as any[];

    const preferExited = mode === 'dismissal';
    const ebaByExactSicil = new Map<string, any>();
    const ebaByNormSicil = new Map<string, any>();
    const ebaByPassport = new Map<string, any>();
    const ebaByInn = new Map<string, any>();
    const ebaByKirilDob = new Map<string, any>();
    const ebaByKirilOnly = new Map<string, any>();
    const ebaActivePersonKeys = new Set<string>();

    const shouldReplaceEbaIndex = (existing: any, candidate: any): boolean => {
      if (!existing) return true;
      const candPreferred = preferExited
        ? candidate.genel_durum !== 'Mevcut'
        : candidate.genel_durum === 'Mevcut';
      const existPreferred = preferExited
        ? existing.genel_durum !== 'Mevcut'
        : existing.genel_durum === 'Mevcut';
      if (candPreferred && !existPreferred) return true;
      if (!candPreferred && existPreferred) return false;
      const candExit = normalizeDateValue(candidate.cikis_tarihi || candidate.ise_giris_tarihi);
      const existExit = normalizeDateValue(existing.cikis_tarihi || existing.ise_giris_tarihi);
      return candExit >= existExit;
    };

    for (const r of ebaRows) {
      const exactSicil = String(r.sicil_no || '').trim();
      const normSicil = normalizeSicilDigits(exactSicil);
      const passDigits = normalizeDigitsOnly(r.pasaport_no);
      const innDigits = normalizeDigitsOnly(r.inn_no);
      const kirilNorm = normalizeCyrillicName(r.tam_adi_kiril);
      const dobIso = normalizeDateValue(r.dogum_tarihi);

      if (r.genel_durum === 'Mevcut') {
        if (passDigits.length >= 5) ebaActivePersonKeys.add(`P:${passDigits}`);
        if (innDigits.length >= 10) ebaActivePersonKeys.add(`I:${innDigits}`);
        if (kirilNorm && dobIso) ebaActivePersonKeys.add(`K:${kirilNorm}|${dobIso}`);
      }

      if (exactSicil && shouldReplaceEbaIndex(ebaByExactSicil.get(exactSicil), r)) {
        ebaByExactSicil.set(exactSicil, r);
      }
      if (normSicil && shouldReplaceEbaIndex(ebaByNormSicil.get(normSicil), r)) {
        ebaByNormSicil.set(normSicil, r);
      }
      if (passDigits.length >= 5 && shouldReplaceEbaIndex(ebaByPassport.get(passDigits), r)) {
        ebaByPassport.set(passDigits, r);
      }
      if (innDigits.length >= 10 && shouldReplaceEbaIndex(ebaByInn.get(innDigits), r)) {
        ebaByInn.set(innDigits, r);
      }
      if (kirilNorm && dobIso) {
        const kdKey = `${kirilNorm}|${dobIso}`;
        if (shouldReplaceEbaIndex(ebaByKirilDob.get(kdKey), r)) {
          ebaByKirilDob.set(kdKey, r);
        }
      }
      if (kirilNorm && shouldReplaceEbaIndex(ebaByKirilOnly.get(kirilNorm), r)) {
        ebaByKirilOnly.set(kirilNorm, r);
      }
    }

    // Build 1C ZUP Active Person Key Set (to exclude inter-site transfers / rehired active employees from dismissals)
    const zupActivePersonKeys = new Set<string>();
    const zupDismissedPersonKeys = new Set<string>();

    for (const zr of allZupRows) {
      const ws = String(zr.work_state || '').trim().toLowerCase();
      const hasDismissDate = Boolean(String(zr.dismissal_date || '').trim());
      const hasHire = Boolean(String(zr.hire_date || '').trim());
      const isDismissed =
        ws.includes('увол') || hasDismissDate || (hasStateCol && ws === '' && hasHire);
      const isActive = hasStateCol
        ? ws !== '' && !ws.includes('увол') && !ws.includes('кандидат')
        : hasHire && !hasDismissDate;

      const normSicil = zr.norm_sicil || normalizeSicilDigits(zr.tabel_no);
      const passDigits = normalizeDigitsOnly(zr.doc_no);
      const fullPassDigits = normalizeDigitsOnly(`${zr.doc_series || ''}${zr.doc_no || ''}`);
      const innDigits = normalizeDigitsOnly(zr.inn);
      const kirilNorm = normalizeCyrillicName(zr.fio_kiril);
      const dobIso = normalizeDateValue(zr.birth_date);

      const targetSet = isActive
        ? zupActivePersonKeys
        : isDismissed
        ? zupDismissedPersonKeys
        : null;

      if (targetSet) {
        if (normSicil) targetSet.add(`S:${normSicil}`);
        if (passDigits.length >= 5) targetSet.add(`P:${passDigits}`);
        if (fullPassDigits.length >= 6) targetSet.add(`P:${fullPassDigits}`);
        if (innDigits.length >= 10) targetSet.add(`I:${innDigits}`);
        if (kirilNorm && dobIso) targetSet.add(`K:${kirilNorm}|${dobIso}`);
      }
    }

    let excludedTransfersCount = 0;
    let ebaEnrichedCount = 0;
    let directZupDismissDateCount = 0;
    let maxRefTs = parseIsoTimestampMs(zupTs.date) || Date.now();

    const dedupMap = new Map<string, any>();

    for (const zr of allZupRows) {
      const ws = String(zr.work_state || '').trim().toLowerCase();
      const zDismissIso = normalizeDateValue(zr.dismissal_date);
      const zHireIso = normalizeDateValue(zr.hire_date);
      const isDismissedRow =
        ws.includes('увол') ||
        Boolean(zDismissIso) ||
        (hasStateCol && ws === '' && Boolean(zHireIso));
      const isActiveRow = hasStateCol
        ? ws !== '' && !ws.includes('увол') && !ws.includes('кандидат')
        : Boolean(zHireIso) && !zDismissIso;

      if (mode === 'dismissal' && !isDismissedRow) continue;
      if (mode === 'hiring' && !isActiveRow) continue;

      const rawTabel = String(zr.tabel_no || '').trim();
      const cleanSicil = rawTabel.replace(/\.+$/, '').trim();
      const normSicil = zr.norm_sicil || normalizeSicilDigits(rawTabel);
      const passDigits = normalizeDigitsOnly(zr.doc_no);
      const fullPassDigits = normalizeDigitsOnly(`${zr.doc_series || ''}${zr.doc_no || ''}`);
      const innDigits = normalizeDigitsOnly(zr.inn);
      const kirilNorm = normalizeCyrillicName(zr.fio_kiril);
      const dobIso = normalizeDateValue(zr.birth_date);

      // Match eBA record for document enrichment
      const matchedEba =
        (rawTabel && ebaByExactSicil.get(rawTabel)) ||
        (cleanSicil && ebaByExactSicil.get(cleanSicil)) ||
        (normSicil && ebaByNormSicil.get(normSicil)) ||
        (passDigits.length >= 5 && ebaByPassport.get(passDigits)) ||
        (fullPassDigits.length >= 6 && ebaByPassport.get(fullPassDigits)) ||
        (innDigits.length >= 10 && ebaByInn.get(innDigits)) ||
        (kirilNorm && dobIso && ebaByKirilDob.get(`${kirilNorm}|${dobIso}`)) ||
        (kirilNorm && ebaByKirilOnly.get(kirilNorm)) ||
        null;

      let rawEba: Record<string, any> = {};
      if (matchedEba?.all_data_json) {
        try {
          rawEba = JSON.parse(matchedEba.all_data_json);
        } catch {}
      }

      // Skip RF / Belarus citizens (exempt from MVD 600585/1 notifications)
      const zCitUpper = String(zr.citizenship_ru || '').trim().toUpperCase();
      const ebaNatUpper = String(matchedEba?.uyruk || rawEba['Uyruk'] || '').trim().toUpperCase();
      const ebaCardType = String(rawEba['Çalışma Kart Türü'] || '').trim().toUpperCase();
      const insuredLow = String(zr.insured_status || '').toLowerCase();

      if (
        zCitUpper === 'РОССИЯ' ||
        zCitUpper === 'БЕЛАРУСЬ' ||
        ebaNatUpper === 'RUSYA' ||
        ebaNatUpper === 'BELARUS' ||
        ebaCardType === 'РФ' ||
        (!zCitUpper && !ebaNatUpper && insuredLow.startsWith('граждане рф'))
      ) {
        continue;
      }

      // Inter-site transfer & active re-hire protection (Zahid Bey's rule)
      if (mode === 'dismissal') {
        const activeInZupElsewhere =
          (normSicil && zupActivePersonKeys.has(`S:${normSicil}`)) ||
          (passDigits.length >= 5 && zupActivePersonKeys.has(`P:${passDigits}`)) ||
          (fullPassDigits.length >= 6 && zupActivePersonKeys.has(`P:${fullPassDigits}`)) ||
          (innDigits.length >= 10 && zupActivePersonKeys.has(`I:${innDigits}`)) ||
          (kirilNorm && dobIso && zupActivePersonKeys.has(`K:${kirilNorm}|${dobIso}`));

        const ebaTransferDir = matchedEba ? transferDirByEmpId.get(matchedEba.id) : undefined;
        const isEbaTransferExit =
          ebaTransferDir === 'EXIT' ||
          ebaTransferDir === 'BOTH' ||
          String(matchedEba?.cikis_sebebi || '').toLowerCase().includes('transfer');

        if (activeInZupElsewhere || isEbaTransferExit) {
          excludedTransfersCount++;
          continue;
        }
      } else if (mode === 'hiring') {
        const ebaTransferDir = matchedEba ? transferDirByEmpId.get(matchedEba.id) : undefined;
        const hadOldZupRow =
          (passDigits.length >= 5 && zupDismissedPersonKeys.has(`P:${passDigits}`)) ||
          (fullPassDigits.length >= 6 && zupDismissedPersonKeys.has(`P:${fullPassDigits}`)) ||
          (innDigits.length >= 10 && zupDismissedPersonKeys.has(`I:${innDigits}`)) ||
          (kirilNorm && dobIso && zupDismissedPersonKeys.has(`K:${kirilNorm}|${dobIso}`));

        if (ebaTransferDir === 'ENTRY' || ebaTransferDir === 'BOTH' || hadOldZupRow) {
          excludedTransfersCount++;
          continue;
        }
      }

      // Apply RLS Region / Project Scope
      const effRegion = matchedEba
        ? resolveEffectiveRegion(matchedEba.region, matchedEba.proje_adi)
        : mapZupDepartmentToRegion(zr.zup_department);
      const effProject = String(
        matchedEba?.proje_adi || rawEba['Proje Adı'] || formatZupBranchShort(zr.zup_department, 'tr') || ''
      ).trim();

      if (scopeRegion !== 'all' && effRegion.toLowerCase() !== scopeRegion.toLowerCase()) {
        continue;
      }
      if (scopeProject !== 'all' && effProject.toLowerCase() !== scopeProject.toLowerCase()) {
        continue;
      }

      // Resolve official Hire Date & Dismissal Date
      const hireDateRu =
        toRuDisplayDate(zr.hire_date) ||
        toRuDisplayDate(
          rawEba['İş Sözleşmesi Giriş Tarihi'] ||
            rawEba['İş Sözleşmesi İmza Tarihi'] ||
            matchedEba?.ise_giris_tarihi
        );

      let dismissalDateRu = '';
      let dismissalDateSource: '1C_ZUP' | '1C_ZUP_TRANSITION' | 'EBA_FALLBACK' = '1C_ZUP';

      if (mode === 'dismissal') {
        const transIso =
          (normSicil && transitionMap.get(`S:${normSicil}`)) ||
          (kirilNorm && dobIso && transitionMap.get(`N:${kirilNorm}|${dobIso}`)) ||
          '';

        if (zDismissIso) {
          dismissalDateRu = toRuDisplayDate(zDismissIso);
          dismissalDateSource = '1C_ZUP';
        } else if (transIso) {
          dismissalDateRu = toRuDisplayDate(transIso);
          dismissalDateSource = '1C_ZUP_TRANSITION';
        } else {
          const ebaExitIso = normalizeDateValue(
            rawEba['Resmi Çıkış Tarihi'] || matchedEba?.cikis_tarihi || rawEba['Çıkış Tarihi']
          );
          // Filter historical 2021-2025 'Увольнение' rows when 1C ZUP doesn't yet export 'Дата увольнения'
          if (!ebaExitIso || !ebaExitIso.startsWith('2026-')) {
            continue;
          }
          // Guard against active eBA employee without exit date
          if (
            matchedEba?.genel_durum === 'Mevcut' &&
            !rawEba['Resmi Çıkış Tarihi'] &&
            !matchedEba?.cikis_tarihi
          ) {
            continue;
          }
          dismissalDateRu = toRuDisplayDate(ebaExitIso);
          dismissalDateSource = 'EBA_FALLBACK';
        }

        if (zDismissIso && !zDismissIso.startsWith('2026-')) {
          continue;
        }
      } else {
        if (!zHireIso || !zHireIso.startsWith('2026-')) {
          continue;
        }
      }

      // Split Cyrillic Name (1C ZUP Primary + eBA Cyrillic boundary assistance)
      const splitName = splitCyrillicFullName(
        zr.fio_kiril,
        rawEba['Soyadı (Kiril)'] || matchedEba?.soyadi,
        rawEba['Adı (Kiril)'] || matchedEba?.adi,
        rawEba['Baba Adı (Kiril)'] || matchedEba?.baba_adi
      );

      const birthDateRu =
        toRuDisplayDate(zr.birth_date) ||
        toRuDisplayDate(matchedEba?.dogum_tarihi || rawEba['Doğum Tarihi']);

      const genderRaw = String(zr.gender || matchedEba?.cinsiyet || rawEba['Cinsiyet'] || 'Мужской');
      const genderRu =
        genderRaw.toLowerCase().startsWith('ж') || genderRaw.toLowerCase().startsWith('k')
          ? 'Женский'
          : 'Мужской';

      const citizenshipRu =
        GOSUSLUGI_CITIZENSHIP_RU[zCitUpper] ||
        GOSUSLUGI_CITIZENSHIP_RU[ebaNatUpper] ||
        zr.citizenship_ru ||
        'Узбекистан';

      // Passport: 1C ZUP Primary -> eBA Fallback
      const passportSeries = String(zr.doc_series || rawEba['Pasaport Seri No'] || '').trim();
      const passportNumber = String(
        zr.doc_no || matchedEba?.pasaport_no || rawEba['Pasaport No'] || ''
      ).trim();
      const passportIssueDate =
        toRuDisplayDate(zr.doc_issue_date) || toRuDisplayDate(rawEba['Pasaport Düzenleme Tarihi']);
      const passportIssuedBy = String(
        zr.doc_issued_by || rawEba['Pasaportu Veren Makam (Kiril)'] || ''
      ).trim();

      // Patent / RNR & Blank: eBA Enrichment
      const patentInfo = extractPatentAndBlank(rawEba);

      // Official Position: 1C ZUP Primary ('Должность') -> eBA Fallback
      const positionRu = String(
        zr.position_ru ||
          rawEba['Resmi Görevi'] ||
          rawEba['Çalışma Kart Görevi'] ||
          matchedEba?.rhi_gorevi ||
          matchedEba?.gorevi ||
          'Монтажник'
      ).trim();

      // Patent Region inference from explicit eBA field or Patent Series
      const seriesReg = PATENT_SERIES_TO_REGION[patentInfo.patentSeries];
      const patentRegion = String(
        rawEba['РегионПатента'] ||
          rawEba['Patent Bölgesi (Kısa)'] ||
          rawEba['Patent Bölgesi'] ||
          seriesReg?.short ||
          ''
      ).trim();
      const patentRegionFull = String(
        rawEba['РегионПатентаПолный'] ||
          rawEba['Patent Bölgesi (Tam Adı)'] ||
          seriesReg?.full ||
          ''
      ).trim();
      const workAddress = String(rawEba['АдресРаботы'] || rawEba['Çalışma Adresi'] || '').trim();
      const ufmsDepartment = String(rawEba['ПодразделениеМВД'] || rawEba['MVD Birimi'] || '').trim();

      // Already Notified Detection (Pondera RPA Submissions DB + eBA Notification Columns)
      const finalSicil = cleanSicil || String(matchedEba?.sicil_no || '').trim();
      const dbSub =
        (finalSicil && submissionMap.get(finalSicil)) ||
        (normSicil && submissionMap.get(normSicil)) ||
        undefined;

      const excelNotifDoc = toRuDisplayDate(
        mode === 'dismissal'
          ? rawEba['Resmi Çıkış Bildirgesi']
          : rawEba['Resmi Giriş Bildirgesi'] || rawEba['İşe Giriş Bildirim Tarihi']
      );
      const excelNfsDate = toRuDisplayDate(rawEba['NFS den Bildirimin Alındığı Tarih']);

      const isNotifiedInExcel =
        Boolean(excelNotifDoc && excelNotifDoc !== '-' && excelNotifDoc !== '0') ||
        (mode === 'dismissal' &&
          Boolean(excelNfsDate && excelNfsDate !== '-' && excelNfsDate !== '0'));

      const alreadyNotified = Boolean(dbSub) || isNotifiedInExcel;
      let notificationInfo = '';
      if (dbSub) {
        notificationInfo = `Gosuslugi № ${dbSub.appNo} (${dbSub.status})`;
      } else if (excelNotifDoc && excelNfsDate && mode === 'dismissal') {
        notificationInfo = `Bildirge: ${excelNotifDoc} • NFS: ${excelNfsDate}`;
      } else if (excelNotifDoc) {
        notificationInfo = `Resmi Bildirge: ${excelNotifDoc}`;
      } else if (excelNfsDate && mode === 'dismissal') {
        notificationInfo = `NFS Alındı: ${excelNfsDate}`;
      }

      const permitCategory =
        zr.permit_category || mapZupTaxStatusToPermitCategory(zr.tax_status);
      const exitReason = String(
        zr.dismissal_reason || matchedEba?.cikis_sebebi || rawEba['Çıkış Sebebi'] || ''
      ).trim();

      const eventTs = parseIsoTimestampMs(mode === 'dismissal' ? dismissalDateRu : hireDateRu);
      if (eventTs > 0 && eventTs <= Date.now() + 86400000 && eventTs > maxRefTs) {
        maxRefTs = eventTs;
      }

      const dedupKey =
        (passDigits.length >= 5 && `P:${passDigits}`) ||
        (normSicil && `S:${normSicil}`) ||
        `R:${zr.row_no}`;

      const existing = dedupMap.get(dedupKey);
      if (existing && (existing._eventTs || 0) > eventTs) {
        continue;
      }

      if (matchedEba) ebaEnrichedCount++;
      if (dismissalDateSource === '1C_ZUP') directZupDismissDateCount++;

      dedupMap.set(dedupKey, {
        _eventTs: eventTs,
        id: `zup-${mode}-${zr.row_no || finalSicil}`,
        selected: !alreadyNotified,
        status: dbSub ? 'success' : 'pending',
        sicil: finalSicil,
        code: finalSicil,
        lastName: splitName.lastName,
        firstName: splitName.firstName,
        middleName: splitName.middleName,
        birthDate: birthDateRu,
        gender: genderRu,
        hireDate: hireDateRu,
        dismissalDate: dismissalDateRu,
        citizenship: citizenshipRu,
        passportSeries,
        passportNumber,
        passportIssueDate,
        passportIssuedBy,
        patentSeries: patentInfo.patentSeries,
        patentNumber: patentInfo.patentNumber,
        patentIssueDate: patentInfo.patentIssueDate,
        blankSeries: patentInfo.blankSeries,
        blankNumber: patentInfo.blankNumber,
        position: positionRu,
        voluntaryResignation: inferVoluntaryResignation(
          zr.dismissal_reason,
          matchedEba?.cikis_sebebi || rawEba['Çıkış Sebebi']
        ),
        patentRegion,
        patentRegionFull,
        workAddress,
        ufmsDepartment,
        alreadyNotified,
        notificationInfo,
        applicationNo: dbSub?.appNo,
        gosuslugiStatus: dbSub?.status,
        exitReason,
        projectName: effProject,
        zupDepartment: formatZupBranchShort(zr.zup_department, 'ru') || zr.zup_department || '',
        permitCategory,
        dismissalDateSource,
        ebaMatched: Boolean(matchedEba),
        inn: String(zr.inn || matchedEba?.inn_no || '').trim(),
        snils: String(zr.snils || '').trim(),
        contractNo: String(zr.contract_no || rawEba['İş Sözleşmesi No'] || '').trim(),
        contractDate:
          toRuDisplayDate(zr.contract_date) ||
          toRuDisplayDate(rawEba['İş Sözleşmesi İmza Tarihi']) ||
          hireDateRu,
      });
    }

    const records = Array.from(dedupMap.values())
      .sort((a, b) => (b._eventTs || 0) - (a._eventTs || 0))
      .map(({ _eventTs, ...rest }) => rest);

    const refDateObj = new Date(maxRefTs);
    const referenceDateLabel =
      zupTs.date ||
      `${String(refDateObj.getUTCDate()).padStart(2, '0')}.${String(
        refDateObj.getUTCMonth() + 1
      ).padStart(2, '0')}.${refDateObj.getUTCFullYear()}`;

    return NextResponse.json({
      success: true,
      metadata: {
        mode,
        referenceDateLabel,
        referenceDateTs: maxRefTs,
        zupDate: zupTs.date,
        zupTime: zupTs.time,
        zupFullTimestamp: zupTs.full,
        zupSourceFile: sysMap['zup_source_file'] || 'Personel_List.xlsx',
        ebaDate: ebaTs.date,
        ebaTime: ebaTs.time,
        ebaFullTimestamp: ebaTs.full,
        hasZupDismissalDateColumn,
        directZupDismissDateCount,
        totalCandidates: records.length,
        ebaEnrichedCount,
        excludedTransfersCount,
      },
      data: records,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to load 1C ZUP notification candidates' },
      { status: 500 }
    );
  }
}
