/**
 * Shared salary privacy guard for eBA / HR personnel records.
 * Company policy forbids storing or displaying individual official salary amounts
 * ("Resmi Maaş", "Resmi Maaş Yazılı", etc.) inside the HR application.
 * Whether the eBA Excel is uploaded with salary columns deleted or intact,
 * these columns always appear empty ("-" / "").
 */

function normalizeColumnToken(input?: string | null): string {
  if (!input) return '';
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[_\s/-]+/g, ' ')
    .trim();
}

const EXACT_SALARY_TOKENS = new Set([
  'resmi maas',
  'resmi maas yazili',
  'maas',
  'maas yazili',
  'maas ucret',
  'net maas',
  'brut maas',
  'gercek maas',
  'оклад',
  'зарплата',
  'тарифная ставка',
  'оклад тарифная ставка',
]);

export function isOfficialSalaryColumn(colName?: string | null): boolean {
  const norm = normalizeColumnToken(colName);
  if (!norm) return false;
  if (EXACT_SALARY_TOKENS.has(norm)) return true;
  if (norm.startsWith('resmi maas')) return true;
  if (/\b(maas|maasi|оклад|зарплат)\b/i.test(norm)) return true;
  return false;
}

export function stripOfficialSalaryFromRaw(
  raw?: Record<string, any> | null
): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (isOfficialSalaryColumn(key)) {
      cleaned[key] = '';
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

