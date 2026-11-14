import {
  ensureZupTableAndSeed,
  ZupOfficialRecord,
  normalizeSicilDigits,
  normalizeDigitsOnly,
  normalizeCyrillicName,
  normalizeDateValue,
} from '@/lib/zupReconciliation';
import { formatKnownDateToDdMmYyyy } from '@/lib/dateFormatter';

interface ZupLiteEntry {
  tabelNo: string;
  normSicil: string;
  hireIso: string;
  dismissalIso: string;
  isActive: boolean;
}

export interface ZupDatesMatch {
  zup_hire_date: string;
  zup_dismissal_date: string;
  zup_status: 'active' | 'dismissed' | 'unmatched';
  zup_tabel_no: string;
}

interface CachedZupDatesIndex {
  sig: string;
  byExactSicil: Map<string, ZupLiteEntry[]>;
  byNormSicil: Map<string, ZupLiteEntry[]>;
  byPassport: Map<string, ZupLiteEntry[]>;
  byInn: Map<string, ZupLiteEntry[]>;
  byKirilDob: Map<string, ZupLiteEntry[]>;
  byKirilOnly: Map<string, ZupLiteEntry[]>;
}

function pushMapItem<K, V>(map: Map<K, V[]>, key: K, val: V): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(val);
  } else {
    map.set(key, [val]);
  }
}

function pickBestZupCandidate(
  candidates: ZupLiteEntry[],
  preferActive: boolean
): ZupLiteEntry | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const sorted = [...candidates].sort((a, b) => {
    if (preferActive && a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }
    if (!preferActive && a.isActive !== b.isActive) {
      // For an exited eBA record sharing multiple ZUP rows, prefer the most recent hire_date first
      if (a.hireIso !== b.hireIso) {
        return b.hireIso.localeCompare(a.hireIso);
      }
      return a.dismissalIso ? -1 : 1;
    }
    if (a.hireIso !== b.hireIso) {
      return b.hireIso.localeCompare(a.hireIso);
    }
    return b.dismissalIso.localeCompare(a.dismissalIso);
  });

  return sorted[0];
}

export function getZupDatesIndex(db: any): CachedZupDatesIndex {
  try {
    ensureZupTableAndSeed(db);
  } catch {}

  let cnt = 0;
  let maxId = 0;
  let zupStamp = '';
  try {
    const ver = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM zup_official_personnel')
      .get() as { cnt: number; maxId: number } | undefined;
    cnt = ver?.cnt || 0;
    maxId = ver?.maxId || 0;
    const stampRow = db
      .prepare("SELECT value FROM system_info WHERE key = 'zup_last_updated'")
      .get() as { value: string } | undefined;
    zupStamp = stampRow?.value || '';
  } catch {}

  const sig = `${cnt}:${maxId}:${zupStamp}`;
  const g = globalThis as unknown as { __ponderaZupDatesIndex?: CachedZupDatesIndex };
  if (g.__ponderaZupDatesIndex && g.__ponderaZupDatesIndex.sig === sig) {
    return g.__ponderaZupDatesIndex;
  }

  const byExactSicil = new Map<string, ZupLiteEntry[]>();
  const byNormSicil = new Map<string, ZupLiteEntry[]>();
  const byPassport = new Map<string, ZupLiteEntry[]>();
  const byInn = new Map<string, ZupLiteEntry[]>();
  const byKirilDob = new Map<string, ZupLiteEntry[]>();
  const byKirilOnly = new Map<string, ZupLiteEntry[]>();

  try {
    const rows = db
      .prepare(
        `SELECT
          tabel_no, norm_sicil, fio_kiril, birth_date, hire_date,
          dismissal_date, work_state, inn, doc_series, doc_no
        FROM zup_official_personnel
        ORDER BY row_no ASC`
      )
      .all() as Partial<ZupOfficialRecord>[];

    const hasStateCol = rows.some((r) => Boolean(String(r.work_state || '').trim()));

    for (const r of rows) {
      const tabelNo = String(r.tabel_no || '').trim();
      const normSicil = String(r.norm_sicil || '').trim() || normalizeSicilDigits(tabelNo);
      const hireIso = normalizeDateValue(r.hire_date);
      const dismissalIso = normalizeDateValue(r.dismissal_date);
      const wsLow = String(r.work_state || '').trim().toLowerCase();

      const isDismissed =
        Boolean(dismissalIso) ||
        wsLow.includes('увол') ||
        (hasStateCol && wsLow === '' && Boolean(hireIso));

      // Only officially hired or dismissed records have valid 1C ZUP employment dates
      if (!hireIso && !dismissalIso) continue;

      const entry: ZupLiteEntry = {
        tabelNo,
        normSicil,
        hireIso,
        dismissalIso: isDismissed ? dismissalIso : '',
        isActive: !isDismissed,
      };

      if (tabelNo) pushMapItem(byExactSicil, tabelNo, entry);
      if (normSicil) pushMapItem(byNormSicil, normSicil, entry);

      const passDigits = normalizeDigitsOnly(r.doc_no);
      const fullPassDigits = normalizeDigitsOnly(`${r.doc_series || ''}${r.doc_no || ''}`);
      if (passDigits.length >= 5) pushMapItem(byPassport, passDigits, entry);
      if (fullPassDigits.length >= 6 && fullPassDigits !== passDigits) {
        pushMapItem(byPassport, fullPassDigits, entry);
      }

      const innDigits = normalizeDigitsOnly(r.inn);
      if (innDigits.length >= 10) pushMapItem(byInn, innDigits, entry);

      const kirilNorm = normalizeCyrillicName(r.fio_kiril);
      const dobIso = normalizeDateValue(r.birth_date);
      if (kirilNorm && dobIso) {
        pushMapItem(byKirilDob, `${kirilNorm}|${dobIso}`, entry);
      }
      if (kirilNorm) {
        pushMapItem(byKirilOnly, kirilNorm, entry);
      }
    }
  } catch {}

  const built: CachedZupDatesIndex = {
    sig,
    byExactSicil,
    byNormSicil,
    byPassport,
    byInn,
    byKirilDob,
    byKirilOnly,
  };
  g.__ponderaZupDatesIndex = built;
  return built;
}

export function matchZupDatesForPersonnelRow(
  idx: CachedZupDatesIndex,
  row: {
    sicil_no?: string | null;
    genel_durum?: string | null;
    pasaport_no?: string | null;
    inn_no?: string | null;
    tam_adi_kiril?: string | null;
    dogum_tarihi?: string | null;
    ise_giris_tarihi?: string | null;
  }
): ZupDatesMatch {
  const preferActive = row.genel_durum === 'Mevcut';
  const exactSicil = String(row.sicil_no || '').trim();
  const normSicil = normalizeSicilDigits(exactSicil);

  // 1. Direct Sicil / Tabel match
  let matched =
    (exactSicil ? pickBestZupCandidate(idx.byExactSicil.get(exactSicil) || [], preferActive) : null) ||
    (normSicil ? pickBestZupCandidate(idx.byNormSicil.get(normSicil) || [], preferActive) : null);

  let matchedBySicil = Boolean(matched);

  // 2. Fallback identity match (Passport -> INN -> Kiril+DOB -> Kiril)
  if (!matched) {
    const passDigits = normalizeDigitsOnly(row.pasaport_no);
    const innDigits = normalizeDigitsOnly(row.inn_no);
    const kirilNorm = normalizeCyrillicName(row.tam_adi_kiril);
    const dobIso = normalizeDateValue(row.dogum_tarihi);

    matched =
      (passDigits.length >= 5 ? pickBestZupCandidate(idx.byPassport.get(passDigits) || [], preferActive) : null) ||
      (innDigits.length >= 10 ? pickBestZupCandidate(idx.byInn.get(innDigits) || [], preferActive) : null) ||
      (kirilNorm && dobIso
        ? pickBestZupCandidate(idx.byKirilDob.get(`${kirilNorm}|${dobIso}`) || [], preferActive)
        : null) ||
      (kirilNorm ? pickBestZupCandidate(idx.byKirilOnly.get(kirilNorm) || [], preferActive) : null);
  }

  if (!matched) {
    return {
      zup_hire_date: '-',
      zup_dismissal_date: '-',
      zup_status: 'unmatched',
      zup_tabel_no: '-',
    };
  }

  // If matched only via identity fallback (different sicil), do not attach an old closed ZUP contract
  // whose official dismissal predates the employee's current eBA hire date by > 7 days.
  if (!matchedBySicil && matched.dismissalIso) {
    const ebaHireIso = normalizeDateValue(row.ise_giris_tarihi);
    if (ebaHireIso && matched.dismissalIso < ebaHireIso) {
      return {
        zup_hire_date: '-',
        zup_dismissal_date: '-',
        zup_status: 'unmatched',
        zup_tabel_no: '-',
      };
    }
  }

  const hireFormatted = matched.hireIso ? formatKnownDateToDdMmYyyy(matched.hireIso, '-') : '-';
  // Official exit date is ONLY shown if officially dismissed in 1C ZUP; otherwise '-'
  const dismissalFormatted =
    !matched.isActive && matched.dismissalIso
      ? formatKnownDateToDdMmYyyy(matched.dismissalIso, '-')
      : '-';

  return {
    zup_hire_date: hireFormatted,
    zup_dismissal_date: dismissalFormatted,
    zup_status: matched.isActive ? 'active' : 'dismissed',
    zup_tabel_no: matched.tabelNo || '-',
  };
}
