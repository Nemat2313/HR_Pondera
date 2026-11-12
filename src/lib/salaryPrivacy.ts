/**
 * Shared salary privacy guard across the entire HR application.
 * Company policy strictly forbids storing, exporting, or displaying ANY salary values
 * OR even empty salary columns ("Resmi Maaş", "Resmi Maaş Yazılı", "Оклад", "РазмерВыплаты", etc.)
 * anywhere in tables, detail drawers, column pickers, or Excel exports.
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
  'maasi',
  'maas yazili',
  'maas ucret',
  'net maas',
  'brut maas',
  'gercek maas',
  'eski resmi maas',
  'ucret',
  'aylik ucret',
  'salary',
  'salary amount',
  'salaryamount',
  'month1salary',
  'month2salary',
  'month3salary',
  'month 1 salary',
  'month 2 salary',
  'month 3 salary',
  'оклад',
  'зарплата',
  'заработная плата',
  'тарифная ставка',
  'оклад тарифная ставка',
  'размервыплаты',
  'размер выплаты',
  'сумма выплаты',
  'выплаты',
  '1 месяц',
  '2 месяц',
  '3 месяц',
]);

export function isOfficialSalaryColumn(colName?: string | null): boolean {
  const norm = normalizeColumnToken(colName);
  if (!norm) return false;
  // Never match boolean ticket deduction flag
  if (norm === 'deduct from salary') return false;
  if (EXACT_SALARY_TOKENS.has(norm)) return true;
  if (norm.startsWith('resmi maas') || norm.startsWith('eski resmi maas')) return true;
  if (/\b(maas|maasi|оклад|зарплат|размервыплат)\b/i.test(norm)) return true;
  if (norm.includes('размер выплат') || norm.includes('сумма выплат') || norm.includes('тарифная ставка')) {
    return true;
  }
  return false;
}

export function stripOfficialSalaryFromRaw(
  raw?: Record<string, any> | null
): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (isOfficialSalaryColumn(key)) {
      continue;
    }
    cleaned[key] = val;
  }
  return cleaned;
}

