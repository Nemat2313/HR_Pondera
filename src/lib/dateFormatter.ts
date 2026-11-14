/**
 * Universal Pondera HR Date Formatter
 * Normalizes Excel serial numbers (including pre-1982 birth dates like 27525 -> 10.05.1975
 * and future document expiry dates like 47368 -> 07.09.2029), ISO dates (YYYY-MM-DD),
 * slash dates (M/D/YYYY or DD/MM/YYYY), and timestamps into clean `dd.mm.yyyy` format.
 */

function normalizeAsciiKey(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[_\s/-]+/g, ' ')
    .trim();
}

const NON_DATE_GUARD_WORDS = [
  'sicil',
  'tabel',
  'sira no',
  'saren',
  'rhi id',
  'sirket id',
  'rencons id',
  'vize id',
  'pasaport no',
  'pasaport seri',
  'propusk no',
  'migrasyon no',
  'migrasyon seri',
  'inn no',
  'cnils',
  'snils',
  'tc kimlik',
  'tin no',
  'vize no',
  'vize seri',
  'calisma kart no',
  'calisma kart seri',
  'patent form no',
  'patent form seri',
  'daktiloskopiya seri',
  'daktiloskopiya form seri',
  'sozlesmesi numarasi',
  'is sozlesmesi no',
  'emri no',
  'dop sog no',
  'referans no',
  'barkod no',
  'dms seri',
  'dms kart no',
  'kamp no',
  'oda no',
  'blok no',
  'yatak no',
  'telefon',
  'acil durum tel',
  'puan',
  'sure artisi',
  'uzama suresi',
  'kalkis saati',
  'varis saati',
  'kodpozdravleniya',
  'sibur kpp',
];

const DATE_INDICATOR_PATTERNS = [
  'tarih',
  'date',
  'dogum tarihi',
  'birth',
  'hire',
  'dismissal',
  'expiry',
  'gecerlilik',
  'duzenleme',
  'yenileme basvuru',
  'yenileme alis',
  'tercume gonderim',
  'tercume gelis',
  'daktilo bitis',
  'daktilo basvuru',
  'daktilo alis',
  'daktilo yenileme',
  'daktilo baslangic',
  'gosusluga basvuru',
  'biometri basvuru',
  'nfs bildirim alis',
  'nfs gonderim',
  'is sozlesmesi imza',
  'is sozlesmesi giris',
  'hse egitime giris',
  'dil sertifikasi gelis',
  'dil sertifikasi bitis',
  'dil sertifikasi baslangic',
  'saglik 29n rapor',
  'bildirgesi',
  'дата',
  'срок',
  'рожд',
  'выдач',
  'прием',
  'увольн',
];

export function isDateLikeColumnName(colName?: string | null, altKey?: string | null): boolean {
  const combined = `${normalizeAsciiKey(colName)} | ${normalizeAsciiKey(altKey)}`;
  if (!combined.replace('|', '').trim()) return false;

  // Explicit date words always win (e.g. "İş Sözleşmesi İmza Tarihi" has both "sozlesme" and "tarih")
  if (
    combined.includes('tarih') ||
    combined.includes('date') ||
    combined.includes('дата') ||
    combined.includes('gecerlilik')
  ) {
    return true;
  }

  for (const guard of NON_DATE_GUARD_WORDS) {
    if (combined.includes(guard)) {
      return false;
    }
  }

  for (const pat of DATE_INDICATOR_PATTERNS) {
    if (combined.includes(pat)) {
      return true;
    }
  }

  return false;
}

function excelSerialToDdMmYyyy(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const days = Math.floor(serial);
  // 10000 = 18.05.1927, 73050 = 31.12.2099 (covers all birth dates like 27525 and long-term passports like 47368)
  if (days < 10000 || days > 73050) return null;
  const utcMs = Date.UTC(1899, 11, 30) + days * 86400000;
  const d = new Date(utcMs);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  if (yyyy < 1925 || yyyy > 2099) return null;
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Formats a known date value (when caller already knows the field is a date) into `dd.mm.yyyy`.
 */
export function formatKnownDateToDdMmYyyy(val: unknown, emptyFallback = '-'): string {
  if (val === null || val === undefined) return emptyFallback;
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return emptyFallback;

  // 1. Excel serial number (e.g. 27525, 43716, 46273, 47368, 43716.0)
  if (/^\d{5}(\.0+)?$/.test(trimmed)) {
    const converted = excelSerialToDdMmYyyy(Number(trimmed));
    if (converted) return converted;
  }

  // 2. ISO format YYYY-MM-DD (with optional time suffix)
  const mIso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (mIso) {
    const yyyy = mIso[1];
    const mm = mIso[2].padStart(2, '0');
    const dd = mIso[3].padStart(2, '0');
    return `${dd}.${mm}.${yyyy}`;
  }

  // 3. Dot format D.M.YYYY or DD.MM.YYYY (with optional 00:00:00 suffix)
  const mDot = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (mDot) {
    const dd = mDot[1].padStart(2, '0');
    const mm = mDot[2].padStart(2, '0');
    const yyyy = mDot[3];
    return `${dd}.${mm}.${yyyy}`;
  }

  // 4. Slash format M/D/YYYY or DD/MM/YYYY
  const mSlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+.*)?$/);
  if (mSlash) {
    const p1 = parseInt(mSlash[1], 10);
    const p2 = parseInt(mSlash[2], 10);
    const yyyy = mSlash[3];
    if (p1 > 12 && p2 <= 12) {
      return `${String(p1).padStart(2, '0')}.${String(p2).padStart(2, '0')}.${yyyy}`;
    }
    if (p2 > 12 && p1 <= 12) {
      return `${String(p2).padStart(2, '0')}.${String(p1).padStart(2, '0')}.${yyyy}`;
    }
    return `${String(p1).padStart(2, '0')}.${String(p2).padStart(2, '0')}.${yyyy}`;
  }

  return trimmed;
}

/**
 * Formats any table/drawer cell value, converting dates to `dd.mm.yyyy` while keeping
 * non-date numeric codes (Sicil No, Pasaport No, Oda No, etc.) intact.
 */
export function formatCellByColumn(
  val: unknown,
  colName?: string | null,
  altKey?: string | null,
  emptyFallback = '-'
): string {
  if (val === null || val === undefined) return emptyFallback;
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return emptyFallback;

  const dateCol = isDateLikeColumnName(colName, altKey);
  if (dateCol) {
    return formatKnownDateToDdMmYyyy(trimmed, emptyFallback);
  }

  // Even if column name wasn't matched as date, unambiguous ISO YYYY-MM-DD strings are always formatted cleanly
  const mIso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00:00.*)?$/);
  if (mIso) {
    return `${mIso[3]}.${mIso[2]}.${mIso[1]}`;
  }

  return trimmed;
}

/**
 * Normalizes all date-like entries inside a parsed `all_data_json` (`raw`) object to `dd.mm.yyyy`.
 */
export function normalizeRawRecordDates(raw?: Record<string, any> | null): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined || String(v).trim() === '') {
      out[k] = v;
      continue;
    }
    if (isDateLikeColumnName(k)) {
      out[k] = formatKnownDateToDdMmYyyy(v, String(v));
    } else {
      const s = String(v).trim();
      const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00:00.*)?$/);
      out[k] = mIso ? `${mIso[3]}.${mIso[2]}.${mIso[1]}` : v;
    }
  }
  return out;
}
