'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bot,
  FileSpreadsheet,
  Download,
  Upload,
  Play,
  Square,
  Globe,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Terminal,
  Loader2,
  Search,
  Database,
  Trash2,
  Settings2,
  Calendar,
  MapPin,
  Copy,
  Check,
  Edit3,
  Sparkles,
  ShieldCheck,
  Users,
  Activity,
  ChevronRight,
  Info,
  HelpCircle,
  Filter,
  ShieldAlert,
  UserPlus,
  UserMinus,
  Clock,
  RefreshCw,
  Mail,
  ExternalLink,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  exportGosuslugiVksExcel,
  GosuslugiVksWorkerRecord,
} from '@/lib/exportGosuslugiVksExcel';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import GosuslugiDismissalPanel from './GosuslugiDismissalPanel';

export interface GosuslugiSubmissionEntry {
  sicil_no?: string;
  worker_name?: string;
  citizenship?: string;
  notification_type?: string;
  period_code?: string;
  application_no: string;
  gosuslugi_status?: string;
  status_detail?: string;
  pdf_filename?: string;
  submitted_at?: string;
  checked_at?: string;
}

interface BridgeStatus {
  status: 'online' | 'offline';
  running: boolean;
  mode?: string;
  chrome_ready: boolean;
  total: number;
  processed: number;
  success: number;
  errors: number;
  active_worker_code?: string | null;
  active_worker_name?: string | null;
  waiting_for_manual?: boolean;
  manual_message?: string | null;
  fatal_error?: string | null;
  completed_codes?: string[];
  error_codes?: string[];
  submissions?: GosuslugiSubmissionEntry[] | Record<string, GosuslugiSubmissionEntry>;
  logs: Array<{ time: string; text: string }>;
}

function doesSubMatchWorker(
  sub: GosuslugiSubmissionEntry | undefined,
  w: GosuslugiVksWorkerRecord
): boolean {
  if (!sub) return false;
  const wCode = String(w.code || w.sicil || '').trim();
  const sCode = String(sub.sicil_no || '').trim();
  if (wCode && sCode && wCode === sCode) {
    return true;
  }
  if (w.applicationNo && sub.application_no && w.applicationNo === sub.application_no) {
    return true;
  }
  if (wCode && sCode && wCode !== sCode) {
    return false;
  }
  const stopWords = new Set(['нет', 'не', 'заполнено', 'отсутствует', 'no', 'none', 'null', '-']);
  const sTokens = String(sub.worker_name || '')
    .toLowerCase()
    .replace(/[^а-яёa-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !stopWords.has(tok));
  const sName = sTokens.join(' ');
  if (sName) {
    const wTokens = [w.lastName, w.firstName]
      .map((p) => String(p || '').toLowerCase().trim())
      .flatMap((p) => p.replace(/[^а-яёa-z0-9\s]/gi, ' ').split(/\s+/))
      .filter((tok) => tok.length >= 2 && !stopWords.has(tok));
    if (wTokens.length > 0 && wTokens.every((tok) => sName.includes(tok))) {
      return true;
    }
  }
  return false;
}

export interface VksValidationIssue {
  field:
    | 'name'
    | 'birthDate'
    | 'citizenship'
    | 'passport'
    | 'inn'
    | 'rnr'
    | 'contract'
    | 'period'
    | 'salary'
    | 'address';
  ru: string;
  tr: string;
}

export interface VksValidationResult {
  isValid: boolean;
  issues: VksValidationIssue[];
  fieldErrors: Partial<Record<VksValidationIssue['field'], string[]>>;
}

type QueueFilterMode = 'all' | 'ready' | 'invalid' | 'sent' | 'error';

const BRIDGE_URLS = ['http://127.0.0.1:8088', 'http://localhost:8088'];

const CITIZENSHIP_MAP_RU: Record<string, string> = {
  TURKIYE: 'Турция',
  TÜRKİYE: 'Турция',
  OZBEKISTAN: 'Узбекистан',
  ÖZBEKİSTAN: 'Узбекистан',
  TACIKISTAN: 'Таджикистан',
  TACİKİSTAN: 'Таджикистан',
  HINDISTAN: 'Индия',
  HİNDİSTAN: 'Индия',
  AZERBAYCAN: 'Азербайджан',
  KIRGIZISTAN: 'Кыргызстан',
  KAZAKISTAN: 'Казахстан',
  TURKMENISTAN: 'Туркменистан',
  BELARUS: 'Беларусь',
  CIN: 'Китай',
  FILIPINLER: 'Филиппины',
  BANGLADES: 'Бангладеш',
  PAKISTAN: 'Пакистан',
  RUSYA: 'Россия',
  INDIA: 'Индия',
  TURKEY: 'Турция',
};

const LATIN_TO_CYRILLIC_PLACES: Array<[RegExp, string]> = [
  [/\bUTTAR\s+PRADESH\b/gi, 'УТТАР ПРАДЕШ'],
  [/\bWEST\s+BENGAL\b/gi, 'ЗАПАДНАЯ БЕНГАЛИЯ'],
  [/\bANDHRA\s+PRADESH\b/gi, 'АНДХРА-ПРАДЕШ'],
  [/\bMADHYA\s+PRADESH\b/gi, 'МАДХЬЯ-ПРАДЕШ'],
  [/\bHIMACHAL\s+PRADESH\b/gi, 'ХИМАЧАЛ-ПРАДЕШ'],
  [/\bARUNACHAL\s+PRADESH\b/gi, 'АРУНАЧАЛ-ПРАДЕШ'],
  [/\bTAMIL\s+NADU\b/gi, 'ТАМИЛНАД'],
  [/\bNEW\s+DELHI\b/gi, 'НЬЮ-ДЕЛИ'],
  [/\bJAMMU\s+AND\s+KASHMIR\b/gi, 'ДЖАММУ И КАШМИР'],
  [/\bKUSHINAGAR\b/gi, 'КУШИНАГАР'],
  [/\bBIHAR\b/gi, 'БИХАР'],
  [/\bPATNA\b/gi, 'ПАТНА'],
  [/\bLUCKNOW\b/gi, 'ЛАКХНАУ'],
  [/\bGORAKHPUR\b/gi, 'ГОРАКХПУР'],
  [/\bDEORIA\b/gi, 'ДЕОРИЯ'],
  [/\bSIWAN\b/gi, 'СИВАН'],
  [/\bGOPALGANJ\b/gi, 'ГОПАЛГАНДЖ'],
  [/\bCHAPRA\b/gi, 'ЧАПРА'],
  [/\bMUZAFFARPUR\b/gi, 'МУЗАФФАРПУР'],
  [/\bDARBHANGA\b/gi, 'ДАРБХАНГА'],
  [/\bMOTIHARI\b/gi, 'МОТИХАРИ'],
  [/\bBETTIAH\b/gi, 'БЕТТИЯ'],
  [/\bAZAMGARH\b/gi, 'АЗАМГАРХ'],
  [/\bJAUNPUR\b/gi, 'ДЖАУНПУР'],
  [/\bGHAZIPUR\b/gi, 'ГАЗИПУР'],
  [/\bBALLIA\b/gi, 'БАЛЛИЯ'],
  [/\bVARANASI\b/gi, 'ВАРАНАСИ'],
  [/\bALLAHABAD\b/gi, 'АЛЛАХАБАД'],
  [/\bPRAYAGRAJ\b/gi, 'ПРАЯГРАДЖ'],
  [/\bKANPUR\b/gi, 'КАНПУР'],
  [/\bAGRA\b/gi, 'АГРА'],
  [/\bMEERUT\b/gi, 'МИРУТ'],
  [/\bBAREILLY\b/gi, 'БАРЕЙЛИ'],
  [/\bMORADABAD\b/gi, 'МОРАДАБАД'],
  [/\bALIGARH\b/gi, 'АЛИГАРХ'],
  [/\bSAHARANPUR\b/gi, 'САХАРАНПУР'],
  [/\bFAIZABAD\b/gi, 'ФАЙЗАБАД'],
  [/\bAYODHYA\b/gi, 'АЙОДХЬЯ'],
  [/\bBASTI\b/gi, 'БАСТИ'],
  [/\bGONDA\b/gi, 'ГОНДА'],
  [/\bBAHRAICH\b/gi, 'БАХРАЙЧ'],
  [/\bSULTANPUR\b/gi, 'СУЛТАНПУР'],
  [/\bKOLKATA\b/gi, 'КОЛКАТА'],
  [/\bCALCUTTA\b/gi, 'КАЛЬКУТТА'],
  [/\bMUMBAI\b/gi, 'МУМБАИ'],
  [/\bDELHI\b/gi, 'ДЕЛИ'],
  [/\bCHENNAI\b/gi, 'ЧЕННАИ'],
  [/\bHYDERABAD\b/gi, 'ХАЙДАРАБАД'],
  [/\bBENGALURU\b/gi, 'БЕНГАЛУРУ'],
  [/\bBANGALORE\b/gi, 'БАНГАЛОР'],
  [/\bAHMEDABAD\b/gi, 'АХМАДАБАД'],
  [/\bJAIPUR\b/gi, 'ДЖАЙПУР'],
  [/\bSURAT\b/gi, 'СУРАТ'],
  [/\bPUNE\b/gi, 'ПУНА'],
  [/\bPUNJAB\b/gi, 'ПЕНДЖАБ'],
  [/\bHARYANA\b/gi, 'ХАРЬЯНА'],
  [/\bRAJASTHAN\b/gi, 'РАДЖАСТХАН'],
  [/\bGUJARAT\b/gi, 'ГУДЖАРАТ'],
  [/\bMAHARASHTRA\b/gi, 'МАХАРАШТРА'],
  [/\bKARNATAKA\b/gi, 'КАРНАТАКА'],
  [/\bKERALA\b/gi, 'КЕРАЛА'],
  [/\bTELANGANA\b/gi, 'ТЕЛАНГАНА'],
  [/\bODISHA\b/gi, 'ОДИША'],
  [/\bASSAM\b/gi, 'АССАМ'],
  [/\bJHARKHAND\b/gi, 'ДЖАРКХАНД'],
  [/\bRANCHI\b/gi, 'РАНЧИ'],
  [/\bJAMSHEDPUR\b/gi, 'ДЖАМШЕДПУР'],
  [/\bDHANBAD\b/gi, 'ДХАНБАД'],
  [/\bBOKARO\b/gi, 'БОКАРО'],
  [/\bHAZARIBAGH\b/gi, 'ХАЗАРИБАГХ'],
  [/\bGIRIDIH\b/gi, 'ГИРИДИХ'],
  [/\bDEOGHAR\b/gi, 'ДЕОГХАР'],
  [/\bCHHATTISGARH\b/gi, 'ЧХАТТИСГАРХ'],
  [/\bUTTARAKHAND\b/gi, 'УТТАРАКХАНД'],
  [/\bINDIA\b/gi, 'ИНДИЯ'],
  [/\bTURKEY\b/gi, 'ТУРЦИЯ'],
  [/\bISTANBUL\b/gi, 'СТАМБУЛ'],
  [/\bANKARA\b/gi, 'АНКАРА'],
  [/\bIZMIR\b/gi, 'ИЗМИР'],
  [/\bANTALYA\b/gi, 'АНТАЛЬЯ'],
  [/\bBURSA\b/gi, 'БУРСА'],
  [/\bADANA\b/gi, 'АДАНА'],
  [/\bKONYA\b/gi, 'КОНЬЯ'],
  [/\bGAZIANTEP\b/gi, 'ГАЗИАНТЕП'],
  [/\bMERSIN\b/gi, 'МЕРСИН'],
  [/\bKAYSERI\b/gi, 'КАЙСЕРИ'],
  [/\bSAMSUN\b/gi, 'САМСУН'],
  [/\bTRABZON\b/gi, 'ТРАБЗОН'],
  [/\bHATAY\b/gi, 'ХАТАЙ'],
];

/**
 * Automatically converts Latin/Turkish characters to Russian Cyrillic and strips characters
 * forbidden by Gosuslugi's Step 6 / Step 7 validators:
 * - 'Место рождения может содержать символы кириллицы, пробел, дефис, запятые, точки, цифры, до 99 символов'
 */
export function sanitizeCyrillicGosuslugiText(
  raw: string | undefined | null,
  fallback = '',
  allowDigitsPunct = true
): string {
  let s = String(raw || '').trim();
  if (!s) return fallback;

  for (const [rx, rep] of LATIN_TO_CYRILLIC_PLACES) {
    s = s.replace(rx, rep);
  }

  if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(s)) {
    const digraphs: Array<[RegExp, string]> = [
      [/SHCH/gi, 'Щ'],
      [/SH/gi, 'Ш'],
      [/CH/gi, 'Ч'],
      [/KH/gi, 'Х'],
      [/TH/gi, 'Т'],
      [/DH/gi, 'Д'],
      [/BH/gi, 'БХ'],
      [/GH/gi, 'ГХ'],
      [/PH/gi, 'Ф'],
      [/ZH/gi, 'Ж'],
      [/YA/gi, 'Я'],
      [/YU/gi, 'Ю'],
      [/YE/gi, 'Е'],
      [/YO/gi, 'Ё'],
      [/TS/gi, 'Ц'],
      [/CK/gi, 'К'],
    ];
    for (const [rx, rep] of digraphs) {
      s = s.replace(rx, rep);
    }

    const charMap: Record<string, string> = {
      A: 'А', B: 'Б', V: 'В', G: 'Г', D: 'Д', E: 'Е', Z: 'З',
      I: 'И', J: 'ДЖ', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О',
      P: 'П', R: 'Р', S: 'С', T: 'Т', U: 'У', F: 'Ф', H: 'Х',
      C: 'К', W: 'В', Q: 'К', X: 'КС', Y: 'Й',
      Ç: 'Ч', Ğ: 'Г', İ: 'И', Ö: 'О', Ş: 'Ш', Ü: 'У',
      a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з',
      i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
      p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х',
      c: 'к', w: 'в', q: 'к', x: 'кс', y: 'й',
      ç: 'ч', ğ: 'г', ı: 'ы', ö: 'о', ş: 'ш', ü: 'у',
    };
    s = s
      .split('')
      .map((ch) => charMap[ch] ?? ch)
      .join('');
  }

  s = s.replace(/[/\\|()[\]{};:]+/g, allowDigitsPunct ? ', ' : ' ');

  if (allowDigitsPunct) {
    s = s.replace(/[^А-Яа-яЁё0-9\s\-,.]/g, '');
    s = s.replace(/\s*,\s*/g, ', ').replace(/(,\s*){2,}/g, ', ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
  } else {
    s = s.replace(/[^А-Яа-яЁё\s\-]/g, '').replace(/^[\s-]+|[\s-]+$/g, '');
  }

  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 99) {
    s = s.slice(0, 99).replace(/[\s,.-]+$/g, '');
  }
  return s || fallback;
}

// Strict DD.MM.YYYY calendar parser & validator
function parseStrictDateRu(val: string | undefined | null): {
  valid: boolean;
  empty: boolean;
  ts: number;
} {
  const raw = String(val || '').trim();
  if (!raw) return { valid: false, empty: true, ts: 0 };
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  if (!m) return { valid: false, empty: false, ts: 0 };
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (yyyy < 1930 || yyyy > 2050 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return { valid: false, empty: false, ts: 0 };
  }
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) {
    return { valid: false, empty: false, ts: 0 };
  }
  return { valid: true, empty: false, ts: d.getTime() };
}

// Format salary amount with mandatory 2 decimal places (kopecks) for Gosuslugi Step 11 ('До копеек')
function formatSalaryWithKopecks(val: any): string {
  let s = String(val ?? '').trim();
  if (!s) return '';
  s = s.replace(/[\s\u00a0₽рРУБруб]/g, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    return num.toFixed(2);
  }
  return s;
}

export interface QuarterMonthSlice {
  monthIdx: 1 | 2 | 3;
  start: string;
  end: string;
  active: boolean;
}

function formatTsToRuDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Computes the 3 calendar months of the quarter corresponding to [periodStart, periodEnd],
 * clamping each month's [start, end] to [periodStart, periodEnd].
 * E.g. for 01.07.2026 - 19.08.2026:
 *   1-месяц: 01.07.2026 - 31.07.2026 (active: true)
 *   2-месяц: 01.08.2026 - 19.08.2026 (active: true)
 *   3-месяц: 01.09.2026 - 30.09.2026 (active: false)
 */
export function computeQuarterMonthSlices(
  periodStartStr: string,
  periodEndStr: string
): QuarterMonthSlice[] {
  const pStart = parseStrictDateRu(periodStartStr);
  const pEnd = parseStrictDateRu(periodEndStr);
  if (!pStart.valid || !pEnd.valid || pEnd.ts < pStart.ts) {
    return [
      { monthIdx: 1, start: periodStartStr || '01.07.2026', end: periodEndStr || '31.07.2026', active: true },
      { monthIdx: 2, start: '01.08.2026', end: '31.08.2026', active: false },
      { monthIdx: 3, start: '01.09.2026', end: '30.09.2026', active: false },
    ];
  }

  const startD = new Date(pStart.ts);
  const baseYear = startD.getUTCFullYear();
  const startMonth0 = startD.getUTCMonth(); // 0..11
  // Align to the start of the calendar quarter (Jan=0, Apr=3, Jul=6, Oct=9)
  const quarterStartMonth0 = Math.floor(startMonth0 / 3) * 3;

  const slices: QuarterMonthSlice[] = [];
  for (let i = 0; i < 3; i++) {
    const m0 = quarterStartMonth0 + i;
    const yr = baseYear + Math.floor(m0 / 12);
    const normM0 = m0 % 12;
    const monthFirstTs = Date.UTC(yr, normM0, 1);
    const monthLastTs = Date.UTC(yr, normM0 + 1, 0); // last day of normM0

    const effStartTs = Math.max(monthFirstTs, pStart.ts);
    const effEndTs = Math.min(monthLastTs, pEnd.ts);
    const isActive = effStartTs <= effEndTs;

    slices.push({
      monthIdx: (i + 1) as 1 | 2 | 3,
      start: isActive ? formatTsToRuDate(effStartTs) : formatTsToRuDate(monthFirstTs),
      end: isActive ? formatTsToRuDate(effEndTs) : formatTsToRuDate(monthLastTs),
      active: isActive,
    });
  }
  return slices;
}

/**
 * If an employee started working within the reporting period (contractStart > globalPeriodStart and contractStart <= globalPeriodEnd),
 * their periodStart is their contractStartDate (e.g. 10.08.2026); otherwise it is globalPeriodStart (e.g. 01.07.2026).
 */
function resolveEffectivePeriodStart(
  globalStart: string,
  globalEnd: string,
  contractStartStr?: string
): string {
  const gStart = parseStrictDateRu(globalStart);
  const gEnd = parseStrictDateRu(globalEnd);
  const cs = parseStrictDateRu(contractStartStr);
  if (cs.valid && gStart.valid && cs.ts > gStart.ts && (!gEnd.valid || cs.ts <= gEnd.ts)) {
    return contractStartStr!.trim();
  }
  return globalStart;
}

/**
 * If an employee exited within the reporting period (exitDate <= globalPeriodEnd and exitDate >= globalPeriodStart),
 * their periodEnd is their exitDate; otherwise it is globalPeriodEnd (e.g. 30.09.2026).
 */
function resolveEffectivePeriodEnd(
  globalStart: string,
  globalEnd: string,
  exitDateStr?: string
): string {
  const gStart = parseStrictDateRu(globalStart);
  const gEnd = parseStrictDateRu(globalEnd);
  const ex = parseStrictDateRu(exitDateStr);
  if (ex.valid && gEnd.valid && ex.ts <= gEnd.ts && (!gStart.valid || ex.ts >= gStart.ts)) {
    return exitDateStr!.trim();
  }
  return globalEnd;
}

function sumMonthlySalaries(m1?: string, m2?: string, m3?: string): string {
  const n1 = Number(formatSalaryWithKopecks(m1) || 0);
  const n2 = Number(formatSalaryWithKopecks(m2) || 0);
  const n3 = Number(formatSalaryWithKopecks(m3) || 0);
  const total = (Number.isNaN(n1) ? 0 : n1) + (Number.isNaN(n2) ? 0 : n2) + (Number.isNaN(n3) ? 0 : n3);
  return total > 0 ? total.toFixed(2) : '';
}

export function buildWorkerMonthlyPeriods(
  w: GosuslugiVksWorkerRecord,
  fallbackStart: string,
  fallbackEnd: string
): Array<{ monthIdx: 1 | 2 | 3; start: string; end: string; amount: string }> {
  const pStart = w.periodStart || fallbackStart;
  const pEnd = w.periodEnd || fallbackEnd;
  const slices = computeQuarterMonthSlices(pStart, pEnd);
  const mAmounts: Record<1 | 2 | 3, string> = {
    1: formatSalaryWithKopecks(w.month1Salary),
    2: formatSalaryWithKopecks(w.month2Salary),
    3: formatSalaryWithKopecks(w.month3Salary),
  };

  const hasAnyMonthly =
    Number(mAmounts[1] || 0) > 0 ||
    Number(mAmounts[2] || 0) > 0 ||
    Number(mAmounts[3] || 0) > 0;

  const result: Array<{ monthIdx: 1 | 2 | 3; start: string; end: string; amount: string }> = [];

  if (hasAnyMonthly) {
    for (const s of slices) {
      const amt = mAmounts[s.monthIdx];
      if (s.active && amt && Number(amt) > 0) {
        result.push({
          monthIdx: s.monthIdx,
          start: s.start,
          end: s.end,
          amount: amt,
        });
      }
    }
    if (result.length > 0) {
      return result;
    }
  }

  // Fallback if 1-месяц / 2-месяц / 3-месяц were not filled separately: split total across active months
  const activeSlices = slices.filter((s) => s.active);
  const totalFormatted = formatSalaryWithKopecks(w.salaryAmount);
  const totalNum = Number(totalFormatted || 0);
  if (activeSlices.length > 0 && totalNum > 0) {
    const perMonth = Math.floor((totalNum / activeSlices.length) * 100) / 100;
    let remainder = Number((totalNum - perMonth * activeSlices.length).toFixed(2));
    return activeSlices.map((s, idx) => {
      const val = idx === activeSlices.length - 1 ? Number((perMonth + remainder).toFixed(2)) : perMonth;
      return {
        monthIdx: s.monthIdx,
        start: s.start,
        end: s.end,
        amount: val.toFixed(2),
      };
    });
  }

  return [];
}

// Comprehensive Gosuslugi VKS Pre-Flight Validator
export function validateVksWorkerRecord(
  w: GosuslugiVksWorkerRecord,
  lang: 'ru' | 'tr' = 'ru'
): VksValidationResult {
  const issues: VksValidationIssue[] = [];

  const addIssue = (
    field: VksValidationIssue['field'],
    ru: string,
    tr: string
  ) => {
    issues.push({ field, ru, tr });
  };

  // 1. Name (Фамилия / Имя / Отчество — Gosuslugi requires Russian Cyrillic)
  if (!w.firstName || !w.firstName.trim()) {
    addIssue('name', 'Не указано Имя', 'Ad (Имя) alanı boş');
  } else if (/[A-Za-z]/.test(w.firstName)) {
    addIssue('name', 'Имя должно быть на кириллице', 'Ad (Имя) Rusça Kiril harfleriyle olmalı');
  }
  if (!w.lastName || !w.lastName.trim()) {
    addIssue(
      'name',
      'Не указана Фамилия (если нет — укажите «Нет»)',
      'Soyadı (Фамилия) boş (yoksa «Нет» yazın)'
    );
  } else if (/[A-Za-z]/.test(w.lastName)) {
    addIssue('name', 'Фамилия должна быть на кириллице', 'Soyadı (Фамилия) Rusça Kiril harfleriyle olmalı');
  }

  // 2. Citizenship & Birthplace (Место рождения может содержать только кириллицу, пробел, дефис, запятые, точки, цифры, до 99 символов)
  if (!w.citizenship || !w.citizenship.trim()) {
    addIssue('citizenship', 'Не указано гражданство', 'Uyruk (Гражданство) eksik');
  }
  if (!w.placeOfBirth || !w.placeOfBirth.trim()) {
    addIssue('citizenship', 'Не указано место рождения', 'Doğum yeri (Место рождения) eksik');
  } else if (/[A-Za-z]/.test(w.placeOfBirth)) {
    addIssue(
      'citizenship',
      `Место рождения содержит латиницу (${w.placeOfBirth}) — требуется кириллица`,
      `Doğum yeri Latin harfi içeriyor (${w.placeOfBirth}) — Kiril olmalı`
    );
  }

  // 3. Birth Date
  const bDate = parseStrictDateRu(w.birthDate);
  const nowTs = Date.now();
  if (bDate.empty) {
    addIssue('birthDate', 'Отсутствует дата рождения', 'Doğum tarihi eksik');
  } else if (!bDate.valid) {
    addIssue(
      'birthDate',
      `Неверный формат даты рождения (${w.birthDate})`,
      `Geçersiz doğum tarihi (${w.birthDate})`
    );
  } else {
    const minAdultTs = Date.UTC(new Date().getUTCFullYear() - 18, new Date().getUTCMonth(), new Date().getUTCDate());
    if (bDate.ts > minAdultTs) {
      addIssue(
        'birthDate',
        `Недопустимая дата рождения (${w.birthDate} — младше 18 лет или будущая дата)`,
        `Hatalı doğum tarihi (${w.birthDate} — 18 yaş altı veya gelecek tarih)`
      );
    }
  }

  // 4. Passport (Номер, Дата выдачи, Кем выдан)
  const cleanPassNum = String(w.passportNumber || '').trim();
  if (!cleanPassNum) {
    addIssue('passport', 'Отсутствует номер паспорта', 'Pasaport numarası eksik');
  } else if (/\s|\d{2}\.\d{2}\.\d{4}/.test(cleanPassNum) || cleanPassNum.length > 12) {
    addIssue(
      'passport',
      `Некорректный номер паспорта (${cleanPassNum})`,
      `Pasaport numarası hatalı/boşluklu (${cleanPassNum})`
    );
  }
  if (!w.passportIssuedBy || !w.passportIssuedBy.trim()) {
    addIssue('passport', 'Не указано, кем выдан паспорт', 'Pasaportu veren makam eksik');
  } else if (/[A-Za-z]/.test(w.passportIssuedBy)) {
    addIssue(
      'passport',
      `Поле «Кем выдан паспорт» содержит латиницу (${w.passportIssuedBy})`,
      `Pasaportu veren makam Latin harfi içeriyor (${w.passportIssuedBy})`
    );
  }
  const pIssue = parseStrictDateRu(w.passportIssueDate);
  if (pIssue.empty) {
    addIssue('passport', 'Отсутствует дата выдачи паспорта', 'Pasaport veriliş tarihi eksik');
  } else if (!pIssue.valid) {
    addIssue(
      'passport',
      `Некорректная дата выдачи паспорта (${w.passportIssueDate})`,
      `Geçersiz pasaport veriliş tarihi (${w.passportIssueDate})`
    );
  } else {
    if (bDate.valid && pIssue.ts <= bDate.ts) {
      addIssue(
        'passport',
        'Дата выдачи паспорта раньше или равна дате рождения',
        'Pasaport veriliş tarihi doğum tarihinden önce olamaz'
      );
    }
    if (pIssue.ts > nowTs + 86400000) {
      addIssue(
        'passport',
        `Дата выдачи паспорта в будущем (${w.passportIssueDate})`,
        `Pasaport veriliş tarihi gelecekte olamaz (${w.passportIssueDate})`
      );
    }
  }

  // 4b. Foreigner INN (12 digits required by Gosuslugi Step 8)
  const cleanInn = String(w.inn || '').replace(/\s+/g, '');
  if (!cleanInn || !/^\d{12}$/.test(cleanInn)) {
    addIssue(
      'inn',
      `ИНН иностранца должен состоять из 12 цифр (сейчас: «${w.inn || 'пусто'}»)`,
      `ИНН 12 haneli rakam olmalıdır (mevcut: «${w.inn || 'boş'}»)`
    );
  }

  // 5. Work Permit (РНР Серия, Номер, Бланк Серия/Номер, Дата выдачи РНР)
  const cleanRnrSeries = String(w.rnrSeries || '').trim();
  const cleanRnrNum = String(w.rnrNumber || '').trim();
  const cleanBlankNum = String(w.blankNumber || '').trim();
  if (!cleanRnrSeries) {
    addIssue('rnr', 'Отсутствует серия РНР', 'Çalışma izni (РНР) seri no eksik');
  } else if (!/^\d{2}$/.test(cleanRnrSeries)) {
    addIssue(
      'rnr',
      `Серия РНР должна состоять из 2 цифр (${cleanRnrSeries})`,
      `Çalışma izni (РНР) serisi 2 haneli rakam olmalı (${cleanRnrSeries})`
    );
  }
  if (!cleanRnrNum) {
    addIssue('rnr', 'Отсутствует номер РНР', 'Çalışma izni (РНР) numarası eksik');
  } else if (!/^\d{10}$/.test(cleanRnrNum)) {
    addIssue(
      'rnr',
      `Номер РНР должен состоять из 10 цифр (сейчас ${cleanRnrNum.length}: «${cleanRnrNum}»)`,
      `Çalışma izni (РНР) numarası 10 haneli rakam olmalı (mevcut ${cleanRnrNum.length} haneli: «${cleanRnrNum}»)`
    );
  }
  if (!w.blankSeries || !w.blankSeries.trim()) {
    addIssue('rnr', 'Отсутствует серия бланка РНР (напр. ВВ)', 'Бланк seri no (örn. ВВ) eksik');
  }
  if (!cleanBlankNum) {
    addIssue('rnr', 'Отсутствует номер бланка РНР', 'Бланк numarası eksik');
  } else if (!/^\d{7}$/.test(cleanBlankNum)) {
    addIssue(
      'rnr',
      `Номер бланка РНР должен состоять из 7 цифр (сейчас: «${cleanBlankNum}»)`,
      `Бланк numarası 7 haneli rakam olmalı (mevcut: «${cleanBlankNum}»)`
    );
  }
  const rnrIssue = parseStrictDateRu(w.rnrIssueDate);
  if (!rnrIssue.empty && !rnrIssue.valid) {
    addIssue(
      'rnr',
      `Некорректная дата выдачи РНР (${w.rnrIssueDate})`,
      `Geçersiz çalışma izni alış tarihi (${w.rnrIssueDate})`
    );
  }

  // 6. Contract Dates (Дата заключения, Дата начала, Дата окончания) & Chronological Order
  const cDate = parseStrictDateRu(w.contractDate);
  const cStart = parseStrictDateRu(w.contractStartDate);
  const cEnd = parseStrictDateRu(w.contractEndDate);

  if (cDate.empty) {
    addIssue('contract', 'Отсутствует дата заключения договора', 'Sözleşme imza tarihi eksik');
  } else if (!cDate.valid) {
    addIssue(
      'contract',
      `Некорректная дата заключения договора (${w.contractDate})`,
      `Geçersiz sözleşme imza tarihi (${w.contractDate})`
    );
  }

  if (cStart.empty) {
    addIssue('contract', 'Отсутствует дата начала договора', 'Sözleşme başlangıç tarihi eksik');
  } else if (!cStart.valid) {
    addIssue(
      'contract',
      `Некорректная дата начала договора (${w.contractStartDate})`,
      `Geçersiz sözleşme başlangıç tarihi (${w.contractStartDate})`
    );
  }

  // Empty contractEndDate (ДатаОканчанияДействия) is valid and means 'Договор бессрочный' (Indefinite Contract)
  const isIndefiniteEnd =
    cEnd.empty ||
    /^(бессрочн|нет|-|süresiz|suresiz)$/i.test(String(w.contractEndDate || '').trim());
  if (!isIndefiniteEnd && !cEnd.valid) {
    addIssue(
      'contract',
      `Некорректная дата окончания договора (${w.contractEndDate})`,
      `Geçersiz bitiş tarihi (${w.contractEndDate})`
    );
  }

  // Cross-date checks: End date cannot be before Start date, Contract date, or RNR Issue date
  if (cDate.valid && cStart.valid && cStart.ts < cDate.ts) {
    addIssue(
      'contract',
      `Дата начала (${w.contractStartDate}) раньше даты заключения (${w.contractDate})`,
      `Başlangıç tarihi (${w.contractStartDate}) imza tarihinden (${w.contractDate}) önce olamaz`
    );
  }
  if (cStart.valid && cEnd.valid && cEnd.ts <= cStart.ts) {
    addIssue(
      'contract',
      `Дата окончания (${w.contractEndDate}) раньше или равна дате начала (${w.contractStartDate})`,
      `Bitiş tarihi (${w.contractEndDate}) başlangıç tarihinden (${w.contractStartDate}) önce olamaz`
    );
  } else if (cDate.valid && cEnd.valid && cEnd.ts <= cDate.ts) {
    addIssue(
      'contract',
      `Дата окончания (${w.contractEndDate}) раньше даты заключения (${w.contractDate})`,
      `Bitiş tarihi (${w.contractEndDate}) sözleşme tarihinden (${w.contractDate}) önce olamaz`
    );
  }
  if (rnrIssue.valid && cEnd.valid && cEnd.ts <= rnrIssue.ts) {
    addIssue(
      'rnr',
      `Дата окончания (${w.contractEndDate}) раньше даты выдачи РНР (${w.rnrIssueDate})`,
      `Bitiş tarihi (${w.contractEndDate}) kart alış tarihinden (${w.rnrIssueDate}) önce olamaz`
    );
  }

  // 7. Salary Payment Period (НачалоПериода — КонецПериода)
  const pStart = parseStrictDateRu(w.periodStart);
  const pEnd = parseStrictDateRu(w.periodEnd);
  if (pStart.empty || !pStart.valid) {
    addIssue(
      'period',
      `Некорректная дата начала периода ЗП (${w.periodStart || 'пусто'})`,
      `Geçersiz dönem başlangıç tarihi (${w.periodStart || 'boş'})`
    );
  }
  if (pEnd.empty || !pEnd.valid) {
    addIssue(
      'period',
      `Некорректная дата конца периода ЗП (${w.periodEnd || 'пусто'})`,
      `Geçersiz dönem bitiş tarihi (${w.periodEnd || 'boş'})`
    );
  }
  if (pStart.valid && pEnd.valid && pEnd.ts < pStart.ts) {
    addIssue(
      'period',
      `Конец периода ЗП (${w.periodEnd}) раньше начала периода (${w.periodStart})`,
      `Dönem bitiş tarihi (${w.periodEnd}) dönem başlangıcından (${w.periodStart}) önce olamaz`
    );
  }

  // 8. Salary Amount (РазмерВыплаты)
  const cleanSal = String(w.salaryAmount || '')
    .replace(/\s+/g, '')
    .replace(',', '.');
  const salNum = Number(cleanSal);
  if (!cleanSal || Number.isNaN(salNum) || salNum <= 0) {
    addIssue(
      'salary',
      'Не указана или некорректна сумма выплаты ЗП',
      'Maaş tutarı eksik veya geçersiz'
    );
  }

  // 9. Address & 6-digit Postal Code
  if (!w.workAddress || !w.workAddress.trim()) {
    addIssue('address', 'Отсутствует адрес места работы', 'Çalışma adresi eksik');
  }
  const cleanPostal = String(w.postalCode || '').trim();
  if (!/^\d{6}$/.test(cleanPostal)) {
    addIssue(
      'address',
      `Индекс должен состоять ровно из 6 цифр (сейчас: «${cleanPostal || 'пусто'}»)`,
      `Posta kodu (Индекс) 6 haneli rakam olmalıdır (mevcut: «${cleanPostal || 'boş'}»)`
    );
  }

  const fieldErrors: Partial<Record<VksValidationIssue['field'], string[]>> = {};
  for (const item of issues) {
    const msg = lang === 'ru' ? item.ru : item.tr;
    if (!fieldErrors[item.field]) {
      fieldErrors[item.field] = [];
    }
    fieldErrors[item.field]!.push(msg);
  }

  return {
    isValid: issues.length === 0,
    issues,
    fieldErrors,
  };
}

function normalizeSentGosuslugiStatus(rawStatus?: string): string {
  const s = String(rawStatus || '').trim();
  if (!s) return '';
  if (/Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(s)) {
    return '';
  }
  // If a Step 16 post-submission PDF error occurred after Step 15 ('Уведомление отправлено'),
  // the notification WAS sent to Gosuslugi — only the PDF receipt was not downloaded yet.
  if (/GosuslugiVksBot|Step 16|PDF не скачан/i.test(s)) {
    return 'Отправлено (PDF не скачан)';
  }
  return s;
}

function isProgressedGosuslugiStatus(st?: string): boolean {
  const s = String(st || '').trim();
  return /Услуга оказана|Услуга отказана|Промежуточные результаты|Заявление зарегистрировано|Отправлено в ведомство/i.test(s);
}

function pickBetterGosuslugiStatus(existing?: string, incoming?: string): string {
  const normEx = normalizeSentGosuslugiStatus(existing);
  const normIn = normalizeSentGosuslugiStatus(incoming);
  if (isProgressedGosuslugiStatus(normEx) && (!normIn || /^Отправлено(\s*\(PDF не скачан\))?$/i.test(normIn))) {
    return normEx;
  }
  return normIn || normEx;
}

function isWorkerAlreadySentToGosuslugi(w: {
  status?: string;
  applicationNo?: string;
  gosuslugiStatus?: string;
  pdfFilename?: string;
}): boolean {
  const normStatus = normalizeSentGosuslugiStatus(w.gosuslugiStatus);
  if (w.status === 'error' || /^ошибк/i.test(normStatus)) return false;
  if (w.status === 'success') return true;
  if (w.applicationNo && String(w.applicationNo).trim() !== '') return true;
  if (w.pdfFilename && String(w.pdfFilename).trim() !== '') return true;
  if (
    normStatus &&
    /отправлен|зарегистрирован|оказан|исполнен|принят|промежуточн|обработк|PDF не скачан/i.test(
      normStatus
    )
  ) {
    return true;
  }
  return false;
}

export default function GosuslugiVksView() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [serviceTab, setServiceTab] = useState<'vks' | 'hiring' | 'dismissal'>('vks');

  const [activeBridgeUrl, setActiveBridgeUrl] = useState(BRIDGE_URLS[0]);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    status: 'offline',
    running: false,
    chrome_ready: false,
    total: 0,
    processed: 0,
    success: 0,
    errors: 0,
    active_worker_code: null,
    active_worker_name: null,
    waiting_for_manual: false,
    manual_message: null,
    completed_codes: [],
    error_codes: [],
    logs: [],
  });

  // Global PAD Form Configuration (matching 933532 PDF & HR Manager's Tobolsk form)
  const [periodStart, setPeriodStart] = useState('01.07.2026');
  const [periodEnd, setPeriodEnd] = useState('30.09.2026');
  const [periodCode, setPeriodCode] = useState('2026-3');
  const [workAddress, setWorkAddress] = useState(
    '626150, обл. Тюменская, г. Тобольск, тер. Восточный промышленный район, кв-л. 5-й'
  );
  const [postalCode, setPostalCode] = useState('626150');
  const [ufmsDept] = useState('ОТДЕЛ ВНЕШНЕЙ ТРУДОВОЙ МИГРАЦИИ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ');
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showAgentGuide, setShowAgentGuide] = useState(false);
  const [showRobotWidget, setShowRobotWidget] = useState(false);

  const [workers, setWorkers] = useState<GosuslugiVksWorkerRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueFilter, setQueueFilter] = useState<QueueFilterMode>('all');
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isLaunchingChrome, setIsLaunchingChrome] = useState(false);
  const [isStartingRobot, setIsStartingRobot] = useState(false);
  const [isCheckingStatuses, setIsCheckingStatuses] = useState(false);
  const [savedSubmissions, setSavedSubmissions] = useState<Record<string, GosuslugiSubmissionEntry>>({});
  const syncedAppsRef = useRef<Set<string>>(new Set());
  const uploadedPdfsRef = useRef<Set<string>>(new Set());
  const archivedAppsRef = useRef<Set<string>>(new Set());

  // Central Backend Master VKS List (3,088 records & 4-Computer Queue Partitioning)
  const [masterSummary, setMasterSummary] = useState<{
    totalMaster: number;
    computers: Record<
      number,
      {
        total: number;
        sent: number;
        error: number;
        pending: number;
        minRow: number;
        maxRow: number;
      }
    >;
  } | null>(null);
  const [activeComputerFilter, setActiveComputerFilter] = useState<'all' | '1' | '2' | '3' | '4'>('all');
  const [isLoadingMaster, setIsLoadingMaster] = useState(false);
  const [isSplittingMaster, setIsSplittingMaster] = useState(false);
  const [isRetryingErrors, setIsRetryingErrors] = useState(false);

  // Mail.ru IMAP Background Status Checker State
  const [showMailRuModal, setShowMailRuModal] = useState(false);
  const [mailRuEmail, setMailRuEmail] = useState('');
  const [mailRuPassword, setMailRuPassword] = useState('');
  const [mailRuHasPassword, setMailRuHasPassword] = useState(false);
  const [mailRuAutoSync, setMailRuAutoSync] = useState(true);
  const [mailRuLastSyncAt, setMailRuLastSyncAt] = useState('');
  const [mailRuLastResult, setMailRuLastResult] = useState('');
  const [mailRuEvents, setMailRuEvents] = useState<
    Array<{
      id: number;
      application_no: string;
      service_title?: string;
      gosuslugi_status: string;
      status_detail?: string;
      email_date?: string;
      order_url?: string;
      folder_name?: string;
      synced_at?: string;
      sicil_no?: string;
      worker_name?: string;
    }>
  >([]);
  const [isSyncingMailRu, setIsSyncingMailRu] = useState(false);

  const [toastMsg, setToastMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 5500);
  };

  const refreshSavedSubmissionsFromDb = async (): Promise<Record<string, GosuslugiSubmissionEntry>> => {
    try {
      const res = await fetch('/api/gosuslugi/submissions?type=VKS_SALARY');
      if (!res.ok) return savedSubmissions;
      const json = await res.json();
      if (Array.isArray(json.archivedAppNos)) {
        archivedAppsRef.current = new Set(json.archivedAppNos.map((a: any) => String(a || '').trim()).filter(Boolean));
      }
      if (json.success && Array.isArray(json.data)) {
        const bySicil: Record<string, GosuslugiSubmissionEntry> = {};
        for (const rawRow of json.data as GosuslugiSubmissionEntry[]) {
          const row = {
            ...rawRow,
            gosuslugi_status: normalizeSentGosuslugiStatus(rawRow.gosuslugi_status),
          };
          if (row.sicil_no) {
            const key = String(row.sicil_no).trim();
            const existing = bySicil[key];
            const exNum = existing?.application_no && /^\d+$/.test(existing.application_no) ? Number(existing.application_no) : 0;
            const rowNum = row.application_no && /^\d+$/.test(row.application_no) ? Number(row.application_no) : 0;
            if (!existing || rowNum > exNum || (!existing.application_no && row.application_no)) {
              bySicil[key] = row;
            }
          }
          if (row.application_no) {
            bySicil[`app:${row.application_no}`] = row;
            syncedAppsRef.current.add(`${row.application_no}:${row.gosuslugi_status || ''}`);
          }
        }
        setSavedSubmissions(bySicil);
        setWorkers((prev) =>
          prev.map((w) => {
            const codeKey = String(w.code || w.sicil || '').trim();
            const subByCode = codeKey ? bySicil[codeKey] : undefined;
            const subByApp =
              w.applicationNo && !archivedAppsRef.current.has(w.applicationNo)
                ? bySicil[`app:${w.applicationNo}`]
                : undefined;
            const matchedSub =
              (doesSubMatchWorker(subByCode, w) ? subByCode : undefined) || subByApp;
            if (!matchedSub) {
              if (
                w.status === 'error' ||
                (w.applicationNo && archivedAppsRef.current.has(w.applicationNo)) ||
                /^ошибк|отказан|зарегистрирован|промежуточн/i.test(w.gosuslugiStatus || '')
              ) {
                return {
                  ...w,
                  applicationNo: '',
                  gosuslugiStatus: undefined,
                  pdfFilename: undefined,
                  status: 'pending',
                  selected: true,
                };
              }
              return w;
            }
            const nextAppNo = matchedSub.application_no || '';
            const nextGosStatus = normalizeSentGosuslugiStatus(
              matchedSub.gosuslugi_status || w.gosuslugiStatus || 'Отправлено'
            );
            const nextPdf = matchedSub.pdf_filename || '';
            const alreadySent = isWorkerAlreadySentToGosuslugi({
              status: w.status === 'success' ? 'success' : undefined,
              applicationNo: nextAppNo,
              gosuslugiStatus: nextGosStatus,
              pdfFilename: nextPdf,
            });
            const isErr = !alreadySent && /^ошибк/i.test(nextGosStatus);
            return {
              ...w,
              applicationNo: nextAppNo,
              gosuslugiStatus: nextGosStatus,
              pdfFilename: nextPdf,
              status: alreadySent ? 'success' : isErr ? 'error' : 'pending',
              // Uncheck already-sent workers so their Zayavka is not accidentally re-submitted!
              selected: alreadySent ? false : w.selected,
            };
          })
        );
        return bySicil;
      }
    } catch {
      // Silent fallback
    }
    return savedSubmissions;
  };

  const refreshMasterListSummary = async () => {
    try {
      const res = await fetch('/api/gosuslugi/master-list?summaryOnly=1');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.computers) {
        setMasterSummary({
          totalMaster: json.totalMaster || 0,
          computers: json.computers,
        });
      }
    } catch {
      // Silent fallback
    }
  };

  // Load saved Gosuslugi application numbers and Mail.ru config from Pondera HR DB,
  // and poll every 15 seconds so multiple computers see newly submitted applications in real time
  useEffect(() => {
    let initialComp: 'all' | '1' | '2' | '3' | '4' = 'all';
    try {
      const savedComp = localStorage.getItem('pondera_vks_computer_filter_v1');
      if (savedComp && ['all', '1', '2', '3', '4'].includes(savedComp)) {
        initialComp = savedComp as 'all' | '1' | '2' | '3' | '4';
        setActiveComputerFilter(initialComp);
      }
      localStorage.removeItem('pondera_vks_active_workers_v1');
    } catch {
      // Ignore localStorage quota/parse issues
    }
    handleLoadFromMasterList(initialComp, 'all', true);
    refreshMasterListSummary();
    fetch('/api/gosuslugi/mail-sync')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success) {
          if (json.config) {
            setMailRuEmail(json.config.email || '');
            setMailRuHasPassword(Boolean(json.config.has_password));
            setMailRuAutoSync(Boolean(json.config.auto_sync_enabled));
            setMailRuLastSyncAt(json.config.last_sync_at || '');
            setMailRuLastResult(json.config.last_sync_result || '');
          }
          if (Array.isArray(json.events)) {
            setMailRuEvents(json.events);
          }
        }
      })
      .catch(() => {});

    const multiPcSyncTimer = setInterval(() => {
      refreshSavedSubmissionsFromDb();
      refreshMasterListSummary();
    }, 15000);
    return () => clearInterval(multiPcSyncTimer);
  }, []);

  const handleSyncMailRu = async (silent = false) => {
    if (!mailRuEmail && !mailRuHasPassword) {
      if (!silent) setShowMailRuModal(true);
      return;
    }
    setIsSyncingMailRu(true);
    try {
      const res = await fetch('/api/gosuslugi/mail-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: mailRuEmail,
          app_password: mailRuPassword || undefined,
          auto_sync_enabled: mailRuAutoSync,
        }),
      });
      const json = await res.json();
      if (json.success) {
        if (mailRuPassword) {
          setMailRuHasPassword(true);
          setMailRuPassword('');
        }
        setMailRuLastSyncAt(json.lastSyncAt || '');
        setMailRuLastResult(json.summary || '');
        if (Array.isArray(json.events)) {
          setMailRuEvents(json.events);
        }
        await refreshSavedSubmissionsFromDb();
        if (!silent) {
          showNotice(
            'success',
            lang === 'ru'
              ? `Почта Mail.ru проверена (Входящие + Спам): найдено заявлений — ${json.uniqueApplications}, обновлено статусов — ${json.updatedSubmissions}!`
              : `Mail.ru (Gelen Kutusu + Spam) kontrol edildi: ${json.uniqueApplications} başvuru bulundu, ${json.updatedSubmissions} kayıt güncellendi!`
          );
        }
      } else if (!silent) {
        showNotice('error', json.message || 'Mail.ru bağlantı hatası.');
      }
    } catch {
      if (!silent) {
        showNotice(
          'error',
          lang === 'ru'
            ? 'Ошибка подключения к сервису синхронизации Mail.ru.'
            : 'Mail.ru senkronizasyon servisine bağlanılamadı.'
        );
      }
    } finally {
      setIsSyncingMailRu(false);
    }
  };

  // Persist active computer filter in localStorage so browser refresh (F5) remembers which PC tab is active
  useEffect(() => {
    try {
      localStorage.setItem('pondera_vks_computer_filter_v1', activeComputerFilter);
    } catch {
      // Ignore storage quota warnings
    }
  }, [activeComputerFilter]);

  // Automatic background Mail.ru check every 3 minutes when configured and enabled
  useEffect(() => {
    if (!mailRuHasPassword || !mailRuAutoSync) return;
    const timer = setInterval(() => {
      handleSyncMailRu(true);
    }, 180000);
    return () => clearInterval(timer);
  }, [mailRuHasPassword, mailRuAutoSync, mailRuEmail]);

  const handleLinkMailApplicationToWorker = async (
    appNo: string,
    gosStatus: string,
    workerId: string
  ) => {
    const targetW = workers.find((w) => w.id === workerId);
    if (!targetW || !appNo) return;
    const fullWorkerName = [targetW.lastName, targetW.firstName, targetW.middleName]
      .filter((p) => p && p.trim().toLowerCase() !== 'нет')
      .join(' ')
      .trim();
    try {
      await fetch('/api/gosuslugi/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [
            {
              sicil_no: targetW.sicil || targetW.code,
              worker_name: fullWorkerName || `${targetW.lastName} ${targetW.firstName}`.trim(),
              citizenship: targetW.citizenship,
              notification_type: 'vks_salary',
              period_code: periodCode,
              application_no: appNo,
              gosuslugi_status: gosStatus || 'Заявление зарегистрировано',
            },
          ],
        }),
      });
      await refreshSavedSubmissionsFromDb();
      const syncRes = await fetch('/api/gosuslugi/mail-sync');
      if (syncRes.ok) {
        const sj = await syncRes.json();
        if (Array.isArray(sj.events)) setMailRuEvents(sj.events);
      }
      showNotice(
        'success',
        lang === 'ru'
          ? `Заявление № ${appNo} привязано к сотруднику ${fullWorkerName} (${targetW.sicil})!`
          : `Başvuru № ${appNo}, ${fullWorkerName} (${targetW.sicil}) personeline bağlandı!`
      );
    } catch {
      showNotice('error', 'Привязка не удалась.');
    }
  };

  // Format YYYY-MM-DD or Excel serial date to DD.MM.YYYY
  const formatDateRu = (val: any): string => {
    if (!val && val !== 0) return '';
    const numVal = typeof val === 'number' ? val : /^\d{5}$/.test(String(val).trim()) ? Number(val) : NaN;
    if (!Number.isNaN(numVal) && numVal > 10000 && numVal < 80000) {
      const utcDays = Math.floor(numVal - 25569);
      const d = new Date(utcDays * 86400 * 1000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.slice(0, 10).split('-');
      return `${d}.${m}.${y}`;
    }
    return str;
  };

  // Compute live validation map for all loaded rows
  const validationMap = useMemo(() => {
    const map: Record<string, VksValidationResult> = {};
    for (const w of workers) {
      map[w.id] = validateVksWorkerRecord(w, lang === 'ru' ? 'ru' : 'tr');
    }
    return map;
  }, [workers, lang]);

  // Apply initial validation when loading rows from Excel or DB:
  // All unsent rows (including re-queued / errored rows) -> selected: true; Already-sent rows -> selected: false
  const applyInitialValidationSelection = (
    list: GosuslugiVksWorkerRecord[],
    customSubmissions?: Record<string, GosuslugiSubmissionEntry>,
    _selectErroredRows: boolean = true
  ) => {
    const subsMap = customSubmissions || savedSubmissions;
    let validCnt = 0;
    let invalidCnt = 0;
    const processed = list.map((w) => {
      const codeKey = String(w.code || w.sicil || '').trim();
      const candidateSub: GosuslugiSubmissionEntry | undefined =
        (codeKey ? subsMap[codeKey] : undefined) ||
        (w.applicationNo ? subsMap[`app:${w.applicationNo}`] : undefined);
      const savedSub = doesSubMatchWorker(candidateSub, w) ? candidateSub : undefined;
      const nextAppNo = w.applicationNo || savedSub?.application_no;
      const nextGosStatus = normalizeSentGosuslugiStatus(
        w.gosuslugiStatus || savedSub?.gosuslugi_status || (savedSub ? 'Отправлено' : '')
      );
      const nextPdf = w.pdfFilename || savedSub?.pdf_filename;
      const alreadySent = isWorkerAlreadySentToGosuslugi({
        status: w.status === 'success' ? 'success' : undefined,
        applicationNo: nextAppNo,
        gosuslugiStatus: nextGosStatus,
        pdfFilename: nextPdf,
      });
      const isErr =
        !alreadySent && (w.status === 'error' || /^ошибк/i.test(nextGosStatus));

      const enriched: GosuslugiVksWorkerRecord = savedSub
        ? {
            ...w,
            applicationNo: nextAppNo,
            gosuslugiStatus: nextGosStatus || 'Отправлено',
            pdfFilename: nextPdf,
            status: alreadySent ? 'success' : isErr ? 'error' : w.status,
          }
        : w;

      const v = validateVksWorkerRecord(enriched, lang === 'ru' ? 'ru' : 'tr');
      if (v.isValid) {
        validCnt++;
      } else {
        invalidCnt++;
      }
      // Always select all unsent/re-queued rows (selected: !alreadySent) so retrying errors is never blocked!
      return { ...enriched, selected: !alreadySent };
    });
    return { processed, validCnt, invalidCnt };
  };

  // Poll local RPA Bridge status (http://127.0.0.1:8088/health)
  useEffect(() => {
    let isMounted = true;
    const checkBridge = async () => {
      for (const url of BRIDGE_URLS) {
        try {
          const res = await fetch(`${url}/health`, { method: 'GET' });
          if (res.ok) {
            const data: BridgeStatus = await res.json();
            if (isMounted) {
              setActiveBridgeUrl(url);
              setBridgeStatus(data);

              // Sync any newly registered applications or updated statuses from RPA bridge to Pondera DB
              const validBridgeSubs =
                data.submissions && Object.keys(data.submissions).length > 0
                  ? Object.values(data.submissions)
                      .map((s) => ({
                        ...s,
                        gosuslugi_status: normalizeSentGosuslugiStatus(s.gosuslugi_status),
                      }))
                      .filter((s) => {
                        const appNo = String(s.application_no || '').trim();
                        const st = String(s.gosuslugi_status || '').trim();
                        const pdfFn = String(s.pdf_filename || '').trim();
                        const subAt = String(s.submitted_at || '').trim();
                        if (appNo && archivedAppsRef.current.has(appNo)) return false;
                        if (/^829[567]\d{6}$/.test(appNo) && /отказан/i.test(st)) return false;
                        if (/^ошибк/i.test(st)) return false;
                        if (
                          !pdfFn &&
                          (st === 'Отправлено (PDF не скачан)' || st === 'Отправлено') &&
                          subAt !== '' &&
                          subAt < '2026-10-26 10:15:00' &&
                          (!/^\d{10}$/.test(appNo) || Number(appNo) < 8320000000)
                        ) {
                          return false;
                        }
                        return true;
                      })
                      .sort((a, b) => {
                        const na = /^\d+$/.test(String(a.application_no || '')) ? Number(a.application_no) : 0;
                        const nb = /^\d+$/.test(String(b.application_no || '')) ? Number(b.application_no) : 0;
                        return nb - na;
                      })
                  : [];

              if (validBridgeSubs.length > 0) {
                const subValues = validBridgeSubs;
                const unsynced = subValues.filter((s) => {
                  const keyId = s.application_no || s.sicil_no || '';
                  if (!keyId) return false;
                  const sig = `${keyId}:${s.gosuslugi_status || ''}:${s.pdf_filename || ''}`;
                  if (syncedAppsRef.current.has(sig)) return false;
                  syncedAppsRef.current.add(sig);
                  return true;
                });

                if (unsynced.length > 0) {
                  setSavedSubmissions((prev) => {
                    const next = { ...prev };
                    for (const s of unsynced) {
                      if (s.sicil_no) {
                        const k = String(s.sicil_no);
                        const ex = next[k];
                        const exN = ex?.application_no && /^\d+$/.test(ex.application_no) ? Number(ex.application_no) : 0;
                        const sN = s.application_no && /^\d+$/.test(s.application_no) ? Number(s.application_no) : 0;
                        if (!ex || sN >= exN) {
                          next[k] = s;
                        }
                      }
                      if (s.application_no) next[`app:${s.application_no}`] = s;
                    }
                    return next;
                  });
                  fetch('/api/gosuslugi/submissions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ records: unsynced }),
                  }).catch(() => {});
                }

                // Also sync any downloaded PDF receipts to central server storage so other PCs can download them
                for (const s of subValues) {
                  if (s.pdf_filename && !uploadedPdfsRef.current.has(s.pdf_filename)) {
                    uploadedPdfsRef.current.add(s.pdf_filename);
                    fetch(`${url}/pdf-base64?file=${encodeURIComponent(s.pdf_filename)}`)
                      .then((r) => (r.ok ? r.json() : null))
                      .then((pdfJson) => {
                        if (pdfJson?.success && pdfJson.pdf_base64) {
                          return fetch('/api/gosuslugi/pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              filename: pdfJson.filename || s.pdf_filename,
                              pdf_base64: pdfJson.pdf_base64,
                              application_no: s.application_no || '',
                              sicil_no: s.sicil_no || '',
                            }),
                          });
                        }
                        return null;
                      })
                      .catch(() => {});
                  }
                }
              }

              setWorkers((prev) =>
                prev.map((w) => {
                  const codeKey = w.code || w.sicil;
                  let nextW = w;
                  const isErrored = Boolean(
                    data.running &&
                      (!data.mode || data.mode === 'vks') &&
                      data.error_codes &&
                      codeKey &&
                      data.error_codes.includes(codeKey)
                  );

                  if (validBridgeSubs.length > 0) {
                    const matchedSub = validBridgeSubs.find((s) =>
                      doesSubMatchWorker(s, w)
                    );
                    if (matchedSub) {
                      const wAppNum = w.applicationNo && /^\d+$/.test(w.applicationNo) ? Number(w.applicationNo) : 0;
                      const mAppNum = matchedSub.application_no && /^\d+$/.test(matchedSub.application_no) ? Number(matchedSub.application_no) : 0;
                      if (wAppNum > 0 && mAppNum > 0 && mAppNum < wAppNum) {
                        return nextW;
                      }
                      const nextAppNo =
                        mAppNum >= wAppNum
                          ? matchedSub.application_no || w.applicationNo
                          : w.applicationNo;
                      const nextGosStatus =
                        mAppNum > wAppNum
                          ? matchedSub.gosuslugi_status || 'Отправлено'
                          : pickBetterGosuslugiStatus(w.gosuslugiStatus, matchedSub.gosuslugi_status) ||
                            (isErrored ? '' : 'Отправлено');
                      const nextPdf = matchedSub.pdf_filename || w.pdfFilename;
                      const alreadySent = isWorkerAlreadySentToGosuslugi({
                        applicationNo: nextAppNo,
                        gosuslugiStatus: nextGosStatus,
                        pdfFilename: nextPdf,
                      });
                      const isSubErr =
                        !alreadySent &&
                        (isErrored ||
                          (!nextAppNo && /^ошибк/i.test(String(nextGosStatus || '').trim())));
                      if (
                        nextAppNo !== w.applicationNo ||
                        nextGosStatus !== w.gosuslugiStatus ||
                        nextPdf !== w.pdfFilename ||
                        ((alreadySent || isSubErr) && w.selected)
                      ) {
                        nextW = {
                          ...nextW,
                          applicationNo: nextAppNo,
                          gosuslugiStatus: nextGosStatus,
                          pdfFilename: nextPdf,
                          status: isSubErr ? 'error' : 'success',
                          // Automatically uncheck checkbox once notification has been sent OR errored (errors are retried separately at the end)!
                          selected: alreadySent || isSubErr ? false : nextW.selected,
                        };
                      }
                    }
                  }

                  const isNowSent = isWorkerAlreadySentToGosuslugi(nextW);
                  if (isNowSent) {
                    return nextW.status === 'success' && !nextW.selected
                      ? nextW
                      : { ...nextW, status: 'success', selected: false };
                  }
                  if (data.completed_codes && codeKey && data.completed_codes.includes(codeKey)) {
                    return nextW.status === 'success' && !nextW.selected
                      ? nextW
                      : { ...nextW, status: 'success', selected: false };
                  }
                  if (isErrored) {
                    return nextW.status === 'error' && !nextW.selected
                      ? nextW
                      : { ...nextW, status: 'error', selected: false };
                  }
                  const isCurrent =
                    data.running &&
                    ((data.active_worker_code && codeKey === data.active_worker_code) ||
                      (data.active_worker_name &&
                        `${w.lastName} ${w.firstName}`
                          .toLowerCase()
                          .includes(data.active_worker_name.toLowerCase())));
                  if (isCurrent) {
                    return nextW.status === 'processing' ? nextW : { ...nextW, status: 'processing' };
                  }
                  if (!data.running && nextW.status === 'processing') {
                    return { ...nextW, status: 'pending' };
                  }
                  return nextW;
                })
              );
            }
            return;
          }
        } catch {
          // Try next local URL
        }
      }
      if (isMounted) {
        setBridgeStatus((prev) => ({ ...prev, status: 'offline', running: false }));
      }
    };

    checkBridge();
    const interval = setInterval(checkBridge, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Ensure page starts at the top when opening Gosuslugi view
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // Auto-scroll ONLY inside the terminal log box (never scroll the main page window!)
  const lastLogSig =
    bridgeStatus.logs.length > 0
      ? `${bridgeStatus.logs.length}:${bridgeStatus.logs[bridgeStatus.logs.length - 1]?.time}:${bridgeStatus.logs[bridgeStatus.logs.length - 1]?.text}`
      : '';
  useEffect(() => {
    const container = terminalEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [lastLogSig]);

  // Load VKS specialists directly from Pondera HR SQLite database
  const handleLoadFromDatabase = async () => {
    setIsLoadingDb(true);
    try {
      const params = new URLSearchParams({
        permit: 'VKS',
        status: 'all',
        includeDetails: 'true',
        limit: '50000',
      });
      if (user) {
        params.set('userScopeType', user.scope_type);
        params.set('userScopeValue', user.scope_value);
      }

      const res = await fetch(`/api/personnel?${params.toString()}`);
      const json = await res.json();

      if (!json.success || !json.data || json.data.length === 0) {
        showNotice(
          'info',
          lang === 'ru'
            ? 'В базе не найдено активных специалистов ВКС. Попробуйте загрузить Excel.'
            : 'Veritabanında aktif VKS uzmanı bulunamadı. Excel yüklemeyi deneyin.'
        );
        return;
      }

      const pStartParsed = parseStrictDateRu(periodStart);
      const rawMapped: GosuslugiVksWorkerRecord[] = [];

      json.data.forEach((emp: any, idx: number) => {
        const raw = emp.raw || {};
        const exitDateRu = formatDateRu(
          raw['Resmi Çıkış Tarihi'] || raw['Çıkış Tarihi'] || emp.cikis_tarihi
        );
        const exitParsed = parseStrictDateRu(exitDateRu);
        // Skip employees who exited BEFORE the start of the reporting quarter (e.g. before 01.07.2026)
        if (exitParsed.valid && pStartParsed.valid && exitParsed.ts < pStartParsed.ts) {
          return;
        }
        // If employee is not Mevcut and has no valid exitDate in/after the quarter, skip
        const genelDurum = String(emp.genel_durum || raw['Genel Durumu'] || 'Mevcut').trim();
        if (genelDurum !== 'Mevcut' && !exitParsed.valid) {
          return;
        }

        const sicil = String(emp.sicil_no || raw['Sicil No'] || '');
        const lastNameRu = String(raw['Soyadı (Kiril)'] || emp.soyadi || '').trim();
        const firstNameRu = String(raw['Adı (Kiril)'] || emp.adi || '').trim();
        const middleNameRu = String(raw['Baba Adı (Kiril)'] || emp.baba_adi || 'НЕТ').trim();
        const rawNat = String(emp.uyruk || raw['Uyruk'] || 'TURKIYE').toUpperCase();
        const citizenshipRu = CITIZENSHIP_MAP_RU[rawNat] || rawNat;
        const genderRaw = String(emp.cinsiyet || raw['Cinsiyet'] || 'Erkek');
        const genderRu =
          genderRaw.toLowerCase().startsWith('k') || genderRaw.toLowerCase().startsWith('ж')
            ? 'Женский'
            : 'Мужской';

        // Employees hired within Q3 get their contractStartDate as periodStart; exited employees get exitDate as periodEnd
        const contractStartRu = formatDateRu(raw['İş Sözleşmesi Giriş Tarihi'] || emp.ise_giris_tarihi);
        const workerPeriodStart = resolveEffectivePeriodStart(periodStart, periodEnd, contractStartRu);
        const workerPeriodEnd = resolveEffectivePeriodEnd(workerPeriodStart, periodEnd, exitDateRu);
        const slices = computeQuarterMonthSlices(workerPeriodStart, workerPeriodEnd);
        const monthlyBase = formatSalaryWithKopecks(raw['Resmi Maaş'] || '217400.00');
        const m1 = slices[0]?.active ? monthlyBase : '';
        const m2 = slices[1]?.active ? monthlyBase : '';
        const m3 = slices[2]?.active ? monthlyBase : '';
        const totalSalary = sumMonthlySalaries(m1, m2, m3) || monthlyBase;

        rawMapped.push({
          id: `db-vks-${emp.id || idx}`,
          selected: true,
          status: 'pending',
          sicil,
          code: sicil,
          lastName: lastNameRu,
          firstName: firstNameRu,
          middleName: middleNameRu,
          birthDate: formatDateRu(emp.dogum_tarihi || raw['Doğum Tarihi']),
          gender: genderRu,
          citizenship: citizenshipRu,
          placeOfBirth: String(raw['Doğum Yeri'] || citizenshipRu),
          passportSeries: String(raw['Pasaport Seri No'] || ''),
          passportNumber: String(emp.pasaport_no || raw['Pasaport No'] || ''),
          passportIssueDate: formatDateRu(raw['Pasaport Düzenleme Tarihi']),
          passportIssuedBy: String(raw['Pasaportu Veren Makam (Kiril)'] || ''),
          inn: String(emp.inn_no || raw['INN No'] || ''),
          rnrSeries: String(raw['Çalışma Kart Seri No'] || ''),
          rnrNumber: String(raw['Çalışma Kart No'] || ''),
          rnrIssueDate: formatDateRu(
            raw['Çalışma Kart Alış Tarihi'] || raw['Çalışma Kart Başlangıç Tarihi']
          ),
          blankSeries: String(raw['Patent Form Seri No'] || ''),
          blankNumber: String(raw['Patent Form No'] || ''),
          contractDate: formatDateRu(raw['İş Sözleşmesi İmza Tarihi'] || emp.ise_giris_tarihi),
          contractStartDate: formatDateRu(raw['İş Sözleşmesi Giriş Tarihi'] || emp.ise_giris_tarihi),
          contractEndDate: formatDateRu(raw['Çalışma Kart Bitiş Tarihi']),
          workAddress,
          postalCode,
          periodStart: workerPeriodStart,
          periodEnd: workerPeriodEnd,
          exitDate: exitDateRu || undefined,
          month1Salary: m1,
          month2Salary: m2,
          month3Salary: m3,
          salaryAmount: totalSalary,
          position: String(raw['Resmi Görevi'] || raw['Çalışma Kart Görevi'] || 'СПЕЦИАЛИСТ'),
        });
      });

      const { processed, validCnt, invalidCnt } = applyInitialValidationSelection(rawMapped);
      setWorkers(processed);
      setQueueFilter('all');

      if (invalidCnt > 0) {
        showNotice(
          'info',
          lang === 'ru'
            ? `Загружено ${processed.length} ВКС: ${validCnt} готовы к отправке, ${invalidCnt} заблокированы из-за неполных/ошибочных данных.`
            : `${processed.length} VKS yüklendi: ${validCnt} satır işleme hazır, ${invalidCnt} satır eksik/hatalı veri nedeniyle düzeltilene kadar bloke edildi.`
        );
      } else {
        showNotice(
          'success',
          lang === 'ru'
            ? `Загружено ${processed.length} специалистов ВКС — все данные корректны!`
            : `${processed.length} VKS uzmanı yüklendi — tüm veriler eksiksiz ve geçerli!`
        );
      }
    } catch {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Ошибка при загрузке ВКС из базы данных.'
          : 'Veritabanından VKS yüklenirken hata oluştu.'
      );
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Load directly from Central Backend Master VKS List (3,088 records partitioned across 4 Computers)
  const handleLoadFromMasterList = async (
    computerFilter: 'all' | '1' | '2' | '3' | '4' = 'all',
    statusFilter: 'all' | 'pending' | 'error' = 'all',
    silent: boolean = false
  ) => {
    setIsLoadingMaster(true);
    setActiveComputerFilter(computerFilter);
    try {
      const freshSubs = await refreshSavedSubmissionsFromDb();
      const res = await fetch(
        `/api/gosuslugi/master-list?computer=${computerFilter}&status=${statusFilter}`
      );
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
        if (!silent) {
          showNotice(
            'info',
            lang === 'ru'
              ? 'В центральном списке ВКС нет записей по выбранному фильтру.'
              : 'Merkezi VKS listesinde seçili filtreye uygun kayıt bulunamadı.'
          );
        }
        return;
      }

      if (json.computers) {
        setMasterSummary({
          totalMaster: json.totalMaster || 0,
          computers: json.computers,
        });
      }

      const rawMapped: GosuslugiVksWorkerRecord[] = json.data.map((item: any, idx: number) => {
        const wRec = item.worker || item || {};
        const sicilVal = String(
          item.sicil_no || item.sicil || wRec.Sicil || wRec.Код || idx + 1
        ).trim();
        const rowPStart =
          formatDateRu(item.periodStart || wRec.НачалоПериода) || periodStart;
        const rowPEnd =
          formatDateRu(item.periodEnd || wRec.КонецПериода) || periodEnd;
        const m1 = formatSalaryWithKopecks(item.month1Salary || wRec['1-месяц'] || '');
        const m2 = formatSalaryWithKopecks(item.month2Salary || wRec['2-месяц'] || '');
        const m3 = formatSalaryWithKopecks(item.month3Salary || wRec['3-месяц'] || '');
        const totSal =
          sumMonthlySalaries(m1, m2, m3) ||
          formatSalaryWithKopecks(item.salaryAmount || wRec.РазмерВыплаты || '');

        return {
          id: `master-vks-${item.row_order || item.rowOrder || idx + 1}-${sicilVal}`,
          selected: true,
          status:
            item.status === 'success'
              ? 'success'
              : item.status === 'error'
              ? 'error'
              : 'pending',
          sicil: sicilVal,
          code: String(item.code || wRec.Код || sicilVal).trim(),
          lastName: String(item.lastName || wRec.Фамилия || 'Нет').trim(),
          firstName: String(item.firstName || wRec.Имя || '').trim(),
          middleName: String(item.middleName || wRec.Отчество || 'НЕТ').trim(),
          birthDate: formatDateRu(item.birthDate || wRec.ДатаРождения),
          gender: String(item.gender || wRec.Пол || 'Мужской').trim(),
          citizenship: String(item.citizenship || wRec.ТекущееГражданство || 'Турция').trim(),
          placeOfBirth: String(
            item.placeOfBirth || wRec.МестоРождения || item.citizenship || wRec.ТекущееГражданство || 'Турция'
          ).trim(),
          passportSeries: String(item.passportSeries || wRec.СерияПаспорта || '').trim(),
          passportNumber: String(item.passportNumber || wRec.НомерПаспорта || '').trim(),
          passportIssueDate: formatDateRu(item.passportIssueDate || wRec.ДатаВыдачи),
          passportIssuedBy: String(item.passportIssuedBy || wRec.ПаспортКемВыдан || 'МВД').trim(),
          inn: String(item.inn || wRec.ИНН || '').trim(),
          rnrSeries: String(item.rnrSeries || wRec.Серия || '').trim(),
          rnrNumber: String(item.rnrNumber || wRec.Номер || '').trim(),
          rnrIssueDate: formatDateRu(item.rnrIssueDate || wRec.ДатаВыдачиВКС),
          blankSeries: String(item.blankSeries || wRec.СерийныйНомер1 || '').trim(),
          blankNumber: String(item.blankNumber || wRec.СерийныйНомер2 || '').trim(),
          contractDate: formatDateRu(item.contractDate || wRec.ДатаЗаключения),
          contractStartDate:
            formatDateRu(item.contractStartDate || wRec.ДатаНачалаДействия) ||
            formatDateRu(item.contractDate || wRec.ДатаЗаключения),
          contractEndDate: formatDateRu(item.contractEndDate || wRec.ДатаОканчанияДействия),
          periodStart: rowPStart,
          periodEnd: rowPEnd,
          month1Salary: m1,
          month2Salary: m2,
          month3Salary: m3,
          salaryAmount: totSal,
          position: String(item.position || wRec.Должность || 'СПЕЦИАЛИСТ').trim(),
          workAddress: String(item.workAddress || wRec.АдресРаботы || workAddress).trim(),
          postalCode: String(item.postalCode || wRec.Индекс || postalCode).trim(),
          applicationNo: item.application_no || item.applicationNo || undefined,
          gosuslugiStatus: item.gosuslugi_status || item.gosuslugiStatus || undefined,
          pdfFilename: item.pdf_filename || item.pdfFilename || undefined,
        };
      });

      const { processed, validCnt, invalidCnt } = applyInitialValidationSelection(
        rawMapped,
        freshSubs,
        statusFilter === 'error'
      );
      setWorkers(processed);
      setQueueFilter(statusFilter === 'error' ? 'error' : 'all');

      const sentInSlice = processed.filter((w) => isWorkerAlreadySentToGosuslugi(w)).length;
      const errInSlice = processed.filter((w) => w.status === 'error').length;
      const readyUnsent = processed.filter((w) => w.selected).length;

      const pcLabel =
        computerFilter === 'all'
          ? lang === 'ru'
            ? 'Все 4 ПК (Общий список)'
            : 'Tüm Liste (4 Bilgisayar)'
          : `Bilgisayar ${computerFilter}`;

      if (!silent) {
        showNotice(
          'success',
          statusFilter === 'error'
            ? lang === 'ru'
              ? `${pcLabel}: в очередь загружено ${processed.length} записей с ошибкой (Ошибка) — отмечено для повторной отправки: ${readyUnsent} (требуют правки данных: ${invalidCnt}).`
              : `${pcLabel}: Hata (Ошибка) veren ${processed.length} kayıt tabloya yüklendi ve tekrar gönderim için seçildi (${readyUnsent} hazır seçili, ${invalidCnt} veri düzeltmesi bekliyor)!`
            : lang === 'ru'
            ? `${pcLabel}: загружено ${processed.length} ВКС (Отправлено: ${sentInSlice}, Готовы к отправке: ${readyUnsent}, Ошибки ГУ: ${errInSlice}, Пропуски данных: ${invalidCnt}).`
            : `${pcLabel}: ${processed.length} VKS yüklendi (Gönderilmiş: ${sentInSlice}, Gönderime Hazır Seçili: ${readyUnsent}, Gosuslugi Hatası: ${errInSlice}, Eksik Veri: ${invalidCnt}).`
        );
      }
    } catch {
      if (!silent) {
        showNotice(
          'error',
          lang === 'ru'
            ? 'Ошибка загрузки центрального списка ВКС.'
            : 'Merkezi VKS listesi yüklenirken hata oluştu.'
        );
      }
    } finally {
      setIsLoadingMaster(false);
    }
  };

  // Partition 3,088 records across 4 Computers (transfer last 500 or 600 from PC 1 -> PC 3 and PC 2 -> PC 4, or equal 4-way split)
  const handleSplit4Computers = async (
    strategy: 'tail_transfer' | 'equal_4',
    tailCount: number = 600
  ) => {
    setIsSplittingMaster(true);
    try {
      const res = await fetch('/api/gosuslugi/master-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'split_4_computers',
          strategy,
          tailCount,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshMasterListSummary();
        if (workers.length > 0) {
          await handleLoadFromMasterList(activeComputerFilter, 'all');
        }
        showNotice('success', json.message || '4 bilgisayar kuyruk dağılımı güncellendi!');
      } else {
        showNotice('error', json.message || 'Dağıtım güncellenemedi.');
      }
    } catch {
      showNotice('error', 'Sunucu bağlantı hatası.');
    } finally {
      setIsSplittingMaster(false);
    }
  };

  // Reset 'Ошибка' records and load them directly into the queue table checked & ready to re-send,
  // or reset a single worker's 'Ошибка' status when clicked on a single row
  const handleRetryErrors = async (
    scope: 'all' | 'computer' | 'selected',
    singleWorker?: GosuslugiVksWorkerRecord
  ) => {
    setIsRetryingErrors(true);
    try {
      if (!singleWorker) {
        const compErrCount =
          activeComputerFilter !== 'all' && masterSummary?.computers?.[Number(activeComputerFilter)]
            ? masterSummary.computers[Number(activeComputerFilter)].error
            : -1;
        const targetCompFilter =
          activeComputerFilter !== 'all' && compErrCount === 0 ? 'all' : activeComputerFilter;

        await fetch('/api/gosuslugi/master-list', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'retry_errors',
            scope: targetCompFilter === 'all' ? 'all' : 'computer',
            computer: targetCompFilter !== 'all' ? Number(targetCompFilter) : 0,
            clearFromDb: true,
          }),
        });
        await refreshSavedSubmissionsFromDb();
        await refreshMasterListSummary();
        await handleLoadFromMasterList(targetCompFilter, 'pending', true);
        setQueueFilter('ready');
        showNotice(
          'success',
          lang === 'ru'
            ? 'Записи со статусом «Ошибка» возвращены в очередь и отмечены галочкой для повторной отправки!'
            : 'Hata (Ошибка) veren kayıtlar sıfırlanarak aktif tikli (seçili) olarak tekrar gönderim kuyruğuna alındı!'
        );
        return;
      }

      const sicilsToReset = [String(singleWorker.sicil || singleWorker.code).trim()];

      const res = await fetch('/api/gosuslugi/master-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry_errors',
          scope: 'selected',
          clearFromDb: true,
          sicils: sicilsToReset,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshSavedSubmissionsFromDb();
        await refreshMasterListSummary();
        const resetSet = new Set(sicilsToReset);
        setWorkers((prev) =>
          prev.map((w) => {
            const codeKey = String(w.sicil || w.code).trim();
            if (w.status === 'error' && resetSet.has(codeKey)) {
              return {
                ...w,
                status: 'pending',
                gosuslugiStatus: undefined,
                selected: true,
              };
            }
            return w;
          })
        );
        showNotice(
          'success',
          json.message || 'Hatalı (Ошибка) kayıt tekrar gönderim için sıraya alındı!'
        );
      } else {
        showNotice('error', json.message || 'Hatalı kayıt sıfırlanamadı.');
      }
    } catch {
      showNotice('error', 'Sunucu bağlantı hatası.');
    } finally {
      setIsRetryingErrors(false);
    }
  };

  // Reopen 'Услуга отказана' (Refused) records and load them directly into the queue table checked & ready to re-send
  const handleReopenRefused = async (scope: 'all' | 'computer' = 'all') => {
    setIsRetryingErrors(true);
    try {
      const res = await fetch('/api/gosuslugi/master-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reopen_refused',
          scope,
          computer: activeComputerFilter !== 'all' ? Number(activeComputerFilter) : 0,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await refreshSavedSubmissionsFromDb();
        await refreshMasterListSummary();
        await handleLoadFromMasterList(activeComputerFilter, 'pending', true);
        setQueueFilter('ready');
        showNotice(
          'success',
          json.message ||
            `${json.reopenedCount || 0} Red (Услуга отказана) kaydı tekrar gönderime açıldı ve kuyruğa seçili olarak yüklendi!`
        );
      } else {
        showNotice('error', json.message || 'Red kayıtları tekrar gönderime açılamadı.');
      }
    } catch {
      showNotice('error', 'Sunucu bağlantı hatası.');
    } finally {
      setIsRetryingErrors(false);
    }
  };

  // Persist a single edited worker row to the central master list & clear its error status if it had 'Ошибка'
  const saveWorkerRowToMasterList = async (w: GosuslugiVksWorkerRecord) => {
    try {
      const payloadRecs = buildPayloadRecords([w]);
      await fetch('/api/gosuslugi/master-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: payloadRecs,
          mode: 'merge',
          clearErrorsForUpdated: true,
          sourceTag: 'ui_inline_edit',
        }),
      });
      await refreshSavedSubmissionsFromDb();
      await refreshMasterListSummary();
    } catch {
      // Silent background sync
    }
  };

  // Upload & Parse Excel File (supports both 34-column HR Master Excel 'Отчет ВКС 3 квартал 2026 - Latest' and 28-column template)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        // Automatically prefer 'latest' or 'Sheet1', or the sheet with the most rows
        let sheetName = wb.SheetNames[0];
        if (wb.SheetNames.includes('latest')) {
          sheetName = 'latest';
        } else if (wb.SheetNames.includes('Sheet1')) {
          sheetName = 'Sheet1';
        } else {
          let maxLen = 0;
          for (const sn of wb.SheetNames) {
            const rowsTest = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
            if (rowsTest.length > maxLen) {
              maxLen = rowsTest.length;
              sheetName = sn;
            }
          }
        }

        const ws = wb.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length <= 1) {
          showNotice(
            'error',
            lang === 'ru'
              ? 'Файл Excel пуст или содержит только заголовки.'
              : 'Excel dosyası boş veya sadece başlık içeriyor.'
          );
          return;
        }

        const header = data[0].map((h: any) => String(h || '').trim());
        const rows = data.slice(1);

        const findCol = (candidates: string[], fallbackIdx: number, startFrom: number = 0): number => {
          for (const c of candidates) {
            const idx = header.findIndex(
              (h, i) => i >= startFrom && h.toLowerCase() === c.toLowerCase()
            );
            if (idx !== -1) return idx;
          }
          return fallbackIdx;
        };

        // Support both 34-column HR Master Excel ('Табельный номер', duplicate 'Серия'/'Номер', 'Июль'/'август'/'сентябрь')
        // and 28/32-column PAD template Excel (with or without leading '#' / '№ п/п' column)
        const isHrMasterFormat = header.some(
          (h) => h.toLowerCase() === 'табельный номер' || h.toLowerCase() === 'серия бланка'
        );
        const hasLeadingRowNum =
          header[0] === '#' ||
          header[0] === '№' ||
          header[0]?.toLowerCase().includes('п/п') ||
          header[0]?.toLowerCase() === 'sıra';
        const hasDupTabNum =
          header[1]?.toLowerCase() === 'табельный номер' &&
          header[2]?.toLowerCase() === 'табельный номер';
        const baseShift = hasLeadingRowNum || hasDupTabNum ? 1 : 0;

        const idxSicil = findCol(
          ['Табельный номер', 'Sicil', 'Sicil No', 'Табельный', 'Код', 'Code'],
          hasLeadingRowNum || isHrMasterFormat ? 1 : 0
        );
        const idxCode = findCol(
          ['Код', 'Code', 'Табельный номер', 'Sicil', 'Sicil No'],
          hasDupTabNum ? 2 : idxSicil
        );
        const idxLastName = findCol(['Фамилия', 'Soyadı (Kiril)', 'Soyadı'], 2 + baseShift);
        const idxFirstName = findCol(['Имя', 'Adı (Kiril)', 'Adı'], 3 + baseShift);
        const idxMiddleName = findCol(['Отчество', 'Baba Adı (Kiril)', 'Baba Adı'], 4 + baseShift);
        const idxBirthDate = findCol(
          ['ДатаРождения', 'Дата рождения', 'Doğum Tarihi'],
          5 + baseShift
        );
        const idxGender = findCol(['Пол', 'Cinsiyet'], 6 + baseShift);
        const idxCitizenship = findCol(
          ['ТекущееГражданство', 'Гражданство', 'Uyruk'],
          7 + baseShift
        );
        const idxPlaceOfBirth = findCol(
          ['МестоРождения', 'Место рождения', 'Doğum Yeri'],
          8 + baseShift
        );

        // In 34-col HR Master Excel, 'Серия' and 'Номер' appear twice: first for Passport, second for RNR
        const idxPassSeries = findCol(
          ['СерияПаспорта', 'Pasaport Seri No', 'Серия'],
          9 + baseShift
        );
        const idxPassNumber = findCol(
          ['НомерПаспорта', 'Pasaport No', 'Номер'],
          10 + baseShift
        );
        const idxPassIssueDate = findCol(
          ['ДатаВыдачи', 'Pasaport Düzenleme Tarihi'],
          11 + baseShift
        );
        const idxPassIssuedBy = findCol(
          ['ПаспортКемВыдан', 'КемВыдан', 'Pasaportu Veren Makam (Kiril)'],
          12 + baseShift
        );
        const idxInn = findCol(['ИНН', 'INN No', 'INN'], 13 + baseShift);

        const rnrSearchStart = Math.max(idxPassNumber + 1, 13 + baseShift);
        const idxRnrSeries = findCol(
          ['Серия', 'Çalışma Kart Seri No'],
          14 + baseShift,
          rnrSearchStart
        );
        const idxRnrNumber = findCol(
          ['Номер', 'Çalışma Kart No'],
          15 + baseShift,
          rnrSearchStart
        );
        const idxRnrIssueDate = findCol(
          ['ДатаВыдачиВКС', 'Çalışma Kart Alış Tarihi'],
          isHrMasterFormat ? -1 : 16 + baseShift
        );
        const idxBlank1 = findCol(
          ['СерийныйНомер1', 'Серия бланка', 'Patent Form Seri No'],
          17 + baseShift
        );
        const idxBlank2 = findCol(
          ['СерийныйНомер2', 'Номер бланка', 'Patent Form No'],
          18 + baseShift
        );
        const idxContractDate = findCol(
          ['ДатаЗаключения', 'ДатаПриема', 'İş Sözleşmesi İmza Tarihi'],
          (isHrMasterFormat ? 19 : 19) + baseShift
        );
        const idxContractStart = findCol(
          ['ДатаНачалаДействия', 'ДатаНачала действия', 'İş Sözleşmesi Giriş Tarihi'],
          20 + baseShift
        );
        const idxContractEnd = findCol(
          [
            'ДатаОканчанияДействия',
            'ДатаОканчания действия',
            'ДатаОкончанияДействия',
            'ДатаОкончания действия',
            'Çalışma Kart Bitiş Tarihi',
          ],
          21 + baseShift
        );
        const idxPeriodStart = findCol(['НачалоПериода'], 22 + baseShift);
        const idxPeriodEnd = findCol(['КонецПериода'], 23 + baseShift);
        const idxMonth1 = findCol(
          ['1-месяц', '1 месяц', 'Месяц 1', '1. Ay', 'Month1', 'Июль'],
          -1
        );
        const idxMonth2 = findCol(
          ['2-месяц', '2 месяц', 'Месяц 2', '2. Ay', 'Month2', 'август'],
          -1
        );
        const idxMonth3 = findCol(
          ['3-месяц', '3 месяц', 'Месяц 3', '3. Ay', 'Month3', 'сентябрь'],
          -1
        );
        const idxExitDate = findCol(['ДатаУвольнения', 'Resmi Çıkış Tarihi', 'Çıkış Tarihi'], -1);
        const hasMonthlyCols = idxMonth1 !== -1 || idxMonth2 !== -1 || idxMonth3 !== -1;
        const idxSalary = findCol(
          ['РазмерВыплаты', 'Resmi Maaş', 'Сумма', 'Toplam'],
          isHrMasterFormat ? 31 : hasMonthlyCols ? 27 : 24
        );
        const idxPosition = findCol(
          ['Должность', 'Resmi Görevi', 'Görevi'],
          isHrMasterFormat ? 32 : hasMonthlyCols ? 28 : 25
        );
        const idxWorkAddr = findCol(
          ['АдресРаботы', 'Фактический адрес работы иностранца'],
          isHrMasterFormat ? 33 : hasMonthlyCols ? 29 : 26
        );
        const idxPostal = findCol(['Индекс'], isHrMasterFormat ? -1 : hasMonthlyCols ? 30 : 27);

        const getVal = (r: any[], colIdx: number) => {
          if (colIdx < 0 || colIdx >= r.length) return '';
          const v = r[colIdx];
          return v !== undefined && v !== null ? String(v).trim() : '';
        };

        // Always fetch latest savedSubmissions from central server BEFORE mapping Excel rows
        // so previously sent ('Отправлено') and errored ('Ошибка') statuses are 100% preserved!
        const freshSubs = await refreshSavedSubmissionsFromDb();

        const rawMapped: GosuslugiVksWorkerRecord[] = [];
        rows.forEach((r, idx) => {
          if (!r || r.length === 0) return;
          const lName = getVal(r, idxLastName);
          const fName = getVal(r, idxFirstName);
          const sicilCell = getVal(r, idxSicil).replace(/\.0$/, '');
          if (!lName && !fName && !sicilCell) return;

          const sicilVal = sicilCell || String(idx + 1);
          const codeVal = getVal(r, idxCode).replace(/\.0$/, '') || sicilVal;
          const citVal = getVal(r, idxCitizenship) || 'Турция';

          const contractStartCell =
            formatDateRu(r[idxContractStart]) || formatDateRu(r[idxContractDate]);
          const rawPeriodStartCell = formatDateRu(r[idxPeriodStart]) || periodStart;
          const rowPeriodStart = resolveEffectivePeriodStart(
            rawPeriodStartCell,
            periodEnd,
            contractStartCell
          );
          const exitDateVal = idxExitDate !== -1 ? formatDateRu(r[idxExitDate]) : '';
          const rawPeriodEndCell = formatDateRu(r[idxPeriodEnd]);
          const rowPeriodEnd = rawPeriodEndCell
            ? resolveEffectivePeriodEnd(rowPeriodStart, rawPeriodEndCell, exitDateVal)
            : resolveEffectivePeriodEnd(rowPeriodStart, periodEnd, exitDateVal);

          let m1 = idxMonth1 !== -1 ? formatSalaryWithKopecks(getVal(r, idxMonth1)) : '';
          let m2 = idxMonth2 !== -1 ? formatSalaryWithKopecks(getVal(r, idxMonth2)) : '';
          let m3 = idxMonth3 !== -1 ? formatSalaryWithKopecks(getVal(r, idxMonth3)) : '';
          const rawTotalCell = formatSalaryWithKopecks(getVal(r, idxSalary));

          if (!m1 && !m2 && !m3 && rawTotalCell && Number(rawTotalCell) > 0) {
            const slices = computeQuarterMonthSlices(rowPeriodStart, rowPeriodEnd);
            const activeSlices = slices.filter((s) => s.active);
            if (activeSlices.length > 0) {
              const totalNum = Number(rawTotalCell);
              const perM = Math.floor((totalNum / activeSlices.length) * 100) / 100;
              const rem = Number((totalNum - perM * activeSlices.length).toFixed(2));
              activeSlices.forEach((s, aIdx) => {
                const amtStr = (aIdx === activeSlices.length - 1 ? perM + rem : perM).toFixed(2);
                if (s.monthIdx === 1) m1 = amtStr;
                if (s.monthIdx === 2) m2 = amtStr;
                if (s.monthIdx === 3) m3 = amtStr;
              });
            }
          }

          const computedSum = sumMonthlySalaries(m1, m2, m3);
          const finalTotal = computedSum || rawTotalCell;

          const mappedCit =
            CITIZENSHIP_MAP_RU[citVal.toUpperCase()] ||
            sanitizeCyrillicGosuslugiText(citVal, 'Турция', false);

          const rawAddr = getVal(r, idxWorkAddr) || workAddress;
          const addrMatch = rawAddr.match(/\b(\d{6})\b/);
          const rowPostal =
            getVal(r, idxPostal) || (addrMatch ? addrMatch[1] : '') || postalCode;

          // Normalize Latin B -> Cyrillic В in blank series
          const rawBlank1 = getVal(r, idxBlank1)
            .replace(/\s+/g, '')
            .toUpperCase()
            .replace(/B/g, 'В')
            .replace(/A/g, 'А');

          let cleanBlank2 = getVal(r, idxBlank2).replace(/\.0$/, '').replace(/\s+/g, '');
          if (/^\d{5,6}$/.test(cleanBlank2)) {
            cleanBlank2 = cleanBlank2.padStart(7, '0');
          }

          const cyrToLatPass: Record<string, string> = {
            А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
            а: 'A', в: 'B', с: 'C', е: 'E', н: 'H', к: 'K', м: 'M', о: 'O', р: 'P', т: 'T', х: 'X', у: 'Y',
          };
          let cleanPassNum = getVal(r, idxPassNumber)
            .replace(/\.0$/, '')
            .replace(/(\d{2}\.\d{2}\.\d{4})$/, '')
            .replace(/\s+/g, '');
          if (/^[АВЕКМНОРСТУХавекмнорстухA-Za-z]{1,3}\d{5,9}$/.test(cleanPassNum)) {
            cleanPassNum = cleanPassNum
              .replace(/[АВЕКМНОРСТУХавекмнорстух]/g, (ch) => cyrToLatPass[ch] || ch)
              .toUpperCase();
          }

          let cleanInnVal = getVal(r, idxInn).replace(/\.0$/, '').trim();
          const cleanInnDigits = cleanInnVal.replace(/\s+/g, '');
          if (/^\d{10,12}$/.test(cleanInnDigits)) {
            cleanInnVal = cleanInnDigits;
          }

          rawMapped.push({
            id: `excel-vks-${idx}`,
            selected: true,
            status: 'pending',
            sicil: sicilVal,
            code: codeVal,
            lastName: sanitizeCyrillicGosuslugiText(lName, 'Нет', false),
            firstName: sanitizeCyrillicGosuslugiText(fName, '', false),
            middleName: sanitizeCyrillicGosuslugiText(
              getVal(r, idxMiddleName) || 'НЕТ',
              'НЕТ',
              false
            ),
            birthDate: formatDateRu(r[idxBirthDate]),
            gender: getVal(r, idxGender) || 'Мужской',
            citizenship: mappedCit,
            placeOfBirth: sanitizeCyrillicGosuslugiText(
              getVal(r, idxPlaceOfBirth) || mappedCit,
              mappedCit,
              true
            ),
            passportSeries: getVal(r, idxPassSeries).replace(/\.0$/, ''),
            passportNumber: cleanPassNum,
            passportIssueDate: formatDateRu(r[idxPassIssueDate]),
            passportIssuedBy: sanitizeCyrillicGosuslugiText(
              getVal(r, idxPassIssuedBy),
              'МВД',
              true
            ),
            inn: cleanInnVal,
            rnrSeries: getVal(r, idxRnrSeries).replace(/\.0$/, '').replace(/\s+/g, ''),
            rnrNumber: getVal(r, idxRnrNumber).replace(/\.0$/, '').replace(/\s+/g, ''),
            rnrIssueDate: formatDateRu(r[idxRnrIssueDate]),
            blankSeries: rawBlank1,
            blankNumber: cleanBlank2,
            contractDate: formatDateRu(r[idxContractDate]),
            contractStartDate:
              formatDateRu(r[idxContractStart]) || formatDateRu(r[idxContractDate]),
            contractEndDate: formatDateRu(r[idxContractEnd]),
            periodStart: rowPeriodStart,
            periodEnd: rowPeriodEnd,
            exitDate: exitDateVal || undefined,
            month1Salary: m1,
            month2Salary: m2,
            month3Salary: m3,
            salaryAmount: finalTotal,
            position: getVal(r, idxPosition) || 'СПЕЦИАЛИСТ',
            workAddress: rawAddr,
            postalCode: rowPostal,
          });
        });

        // 1) First sync uploaded rows into the 3,088 Central Master List and clear 'Ошибка' / 'Услуга отказана' statuses for updated sicils
        const payloadForMaster = buildPayloadRecords(rawMapped);
        let updatedMasterCnt = 0;
        let clearedErrorsCnt = 0;
        let reopenedRefusedCnt = 0;
        try {
          const masterRes = await fetch('/api/gosuslugi/master-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              records: payloadForMaster,
              mode: 'merge',
              clearErrorsForUpdated: true,
              sourceTag: `excel_${file.name}`,
            }),
          });
          if (masterRes.ok) {
            const mJson = await masterRes.json();
            updatedMasterCnt = Number(mJson.updated || 0) + Number(mJson.inserted || 0);
            clearedErrorsCnt = Number(mJson.clearedErrors || 0);
            reopenedRefusedCnt = Number(mJson.reopenedRefused || 0);
          }
        } catch {}

        // 2) Re-fetch submissions after clearing 'Ошибка' / 'Услуга отказана' so edited rows are unlocked!
        const freshSubsAfterMerge = await refreshSavedSubmissionsFromDb();
        await refreshMasterListSummary();

        const { processed, validCnt, invalidCnt } = applyInitialValidationSelection(
          rawMapped,
          freshSubsAfterMerge,
          true
        );

        // If user already had the larger central list loaded on screen (e.g. 772 or 3088 rows) and uploaded a smaller fixed subset,
        // update matching sicils inside the loaded list AND keep them selected; otherwise display the uploaded list directly.
        if (workers.length > processed.length && processed.length < 600) {
          const updatedBySicil = new Map<string, GosuslugiVksWorkerRecord>();
          for (const pRow of processed) {
            updatedBySicil.set(String(pRow.sicil || pRow.code).trim(), pRow);
          }
          setWorkers((prev) =>
            prev.map((existingW) => {
              const k = String(existingW.sicil || existingW.code).trim();
              const replacement = updatedBySicil.get(k);
              if (!replacement) return existingW;
              return {
                ...replacement,
                id: existingW.id,
              };
            })
          );
        } else {
          setWorkers(processed);
          setQueueFilter('all');
        }

        const alreadySentCnt = processed.filter((w) => isWorkerAlreadySentToGosuslugi(w)).length;
        const readyUnsentCnt = processed.filter((w) => w.selected).length;
        const unlockedExtraText =
          reopenedRefusedCnt > 0
            ? lang === 'ru'
              ? `, разблокировано Отказов: ${reopenedRefusedCnt}`
              : `, ${reopenedRefusedCnt} Услуга отказана tekrar gönderime açıldı`
            : '';

        if (invalidCnt > 0) {
          showNotice(
            'info',
            lang === 'ru'
              ? `Обновлено в базе (3088): ${updatedMasterCnt || processed.length} стр. (снято Ошибка: ${clearedErrorsCnt}${unlockedExtraText}). Готовы к отправке: ${readyUnsentCnt}, ещё требуют правки: ${invalidCnt}.`
              : `Merkezi 3.088 listede ${updatedMasterCnt || processed.length} kayıt güncellendi (${clearedErrorsCnt} Ошибка temizlendi${unlockedExtraText}). ${readyUnsentCnt} kayıt gönderime hazır seçildi, ${invalidCnt} kayıtta hala eksik veri var.`
          );
        } else {
          showNotice(
            'success',
            lang === 'ru'
              ? `В центральном списке (3088) успешно обновлено ${updatedMasterCnt || processed.length} записей (снято Ошибка: ${clearedErrorsCnt}${unlockedExtraText}) — ${readyUnsentCnt} готовы к отправке!`
              : `Merkezi 3.088 kişilik listede ${updatedMasterCnt || processed.length} kayıt başarıyla güncellendi (${clearedErrorsCnt} Ошибка statüsü sıfırlandı${unlockedExtraText}, ${readyUnsentCnt} kayıt gönderime hazır seçildi)!`
          );
        }
      } catch {
        showNotice(
          'error',
          lang === 'ru' ? 'Ошибка чтения файла Excel.' : 'Excel dosyası okunurken bir hata oluştu.'
        );
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Apply global Period / Address to all loaded rows and re-validate selection
  const handleApplyGlobalParamsToRows = () => {
    setWorkers((prev) =>
      prev.map((w) => {
        // Preserve exitDate if worker exited before global periodEnd (30.09.2026)
        const nextPeriodEnd = resolveEffectivePeriodEnd(periodStart, periodEnd, w.exitDate);
        const updated = {
          ...w,
          periodStart,
          periodEnd: nextPeriodEnd,
          workAddress,
          postalCode,
        };
        const alreadySent = isWorkerAlreadySentToGosuslugi(updated);
        return {
          ...updated,
          selected: !alreadySent ? w.selected || true : false,
        };
      })
    );
    showNotice(
      'success',
      lang === 'ru'
        ? 'Период выплаты (с учётом дат увольнения) и адрес работы применены ко всем строкам списка!'
        : 'Ödeme dönemi (çıkışlı personellerin çıkış tarihi korunarak) ve çalışma adresi tüm satırlara uygulandı!'
    );
  };

  // Update a single field in a row
  const handleUpdateWorkerField = (
    id: string,
    field: keyof GosuslugiVksWorkerRecord,
    val: string
  ) => {
    setWorkers((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const updated: GosuslugiVksWorkerRecord = { ...w, [field]: val };
        if (field === 'month1Salary' || field === 'month2Salary' || field === 'month3Salary') {
          const newSum = sumMonthlySalaries(
            updated.month1Salary,
            updated.month2Salary,
            updated.month3Salary
          );
          if (newSum) {
            updated.salaryAmount = newSum;
          }
        }
        const alreadySent = isWorkerAlreadySentToGosuslugi(updated);
        return {
          ...updated,
          selected: alreadySent ? false : true,
        };
      })
    );
  };

  const getSample933532Record = (): GosuslugiVksWorkerRecord => ({
    id: 'sample-933532',
    selected: true,
    status: 'pending',
    sicil: '933532',
    code: '933532',
    lastName: 'Нет',
    firstName: 'АБДУЛ РАШИД',
    middleName: 'НЕТ',
    birthDate: '12.02.1982',
    gender: 'Мужской',
    citizenship: 'Индия',
    placeOfBirth: 'Лаксмипур, Бихар',
    passportSeries: '',
    passportNumber: 'S2074432',
    passportIssueDate: '27.07.2018',
    passportIssuedBy: 'ПАТНА',
    inn: '',
    rnrSeries: '77',
    rnrNumber: '2500379969',
    rnrIssueDate: '28.07.2025',
    blankSeries: 'ВВ',
    blankNumber: '0924102',
    contractDate: '16.06.2025',
    contractStartDate: '28.07.2025',
    contractEndDate: '19.08.2026',
    periodStart: '01.07.2026',
    periodEnd: '19.08.2026',
    exitDate: '19.08.2026',
    month1Salary: '410000.00',
    month2Salary: '254655.12',
    month3Salary: '',
    salaryAmount: '664655.12',
    position: 'СПЕЦИАЛИСТ',
    workAddress:
      '626150, обл. Тюменская, г. Тобольск, тер. Восточный промышленный район, кв-л. 5-й',
    postalCode: '626150',
  });

  const handleLoadSample933532 = () => {
    setWorkers([getSample933532Record()]);
    setQueueFilter('all');
    showNotice(
      'success',
      lang === 'ru'
        ? 'Тестовая запись 933532 (АБДУЛ РАШИД — Индия) загружена в список!'
        : '933532 (АБДУЛ РАШИД — Hindistan) test verisi listeye yüklendi!'
    );
  };

  const handleExportExcel = () => {
    if (workers.length === 0) {
      exportGosuslugiVksExcel([getSample933532Record()]);
      showNotice(
        'info',
        lang === 'ru'
          ? 'Скачан шаблон Excel с тестовой записью 933532 (АБДУЛ РАШИД).'
          : '933532 (АБДУЛ РАШИД) verilerini içeren örnek VKS Excel şablonu indirildi.'
      );
      return;
    }
    exportGosuslugiVksExcel(workers);
    showNotice(
      'success',
      lang === 'ru' ? 'Список ВКС выгружен в Excel!' : 'VKS listesi Excel olarak indirildi!'
    );
  };

  // Toggle select all — toggles all rows that have NOT been sent yet!
  const handleToggleSelectAll = () => {
    const unsentRows = workers.filter((w) => !isWorkerAlreadySentToGosuslugi(w));
    const allUnsentSelected = unsentRows.length > 0 && unsentRows.every((w) => w.selected);
    setWorkers((prev) =>
      prev.map((w) => {
        if (isWorkerAlreadySentToGosuslugi(w)) {
          return { ...w, selected: false };
        }
        return { ...w, selected: !allUnsentSelected };
      })
    );
  };

  // Toggle selection on any row without blocking
  const handleToggleWorker = (id: string) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, selected: !w.selected } : w)));
  };

  const handleOpenChrome = async () => {
    setIsLaunchingChrome(true);
    try {
      const res = await fetch(`${activeBridgeUrl}/open-chrome`, { method: 'POST' });
      if (res.ok) {
        showNotice(
          'success',
          lang === 'ru'
            ? 'Google Chrome запущен в режиме отладки (порт 9222)! Войдите в Госуслуги.'
            : 'Google Chrome hata ayıklama modunda (Port 9222) açıldı! Gosuslugi hesabınıza giriş yapın.'
        );
      } else {
        showNotice('error', 'Chrome başlatılamadı.');
      }
    } catch {
      setShowAgentGuide(true);
      showNotice(
        'error',
        lang === 'ru'
          ? 'Локальный RPA агент (порт 8088) не запущен! Скачайте пакет агента и запустите START_PONDERA_RPA_BRIDGE.bat'
          : 'Yerel RPA Ajanı (Port 8088) açık değil! Ajan paketini indirip START_PONDERA_RPA_BRIDGE.bat dosyasını çalıştırın.'
      );
    } finally {
      setIsLaunchingChrome(false);
    }
  };

  const buildPayloadRecords = (list: GosuslugiVksWorkerRecord[]) =>
    list.map((w) => {
      const monthlyPeriods = buildWorkerMonthlyPeriods(w, periodStart, periodEnd);
      const cleanCit = sanitizeCyrillicGosuslugiText(w.citizenship, 'Турция', false);
      return {
        Sicil: w.sicil,
        Код: w.code || w.sicil,
        Фамилия: sanitizeCyrillicGosuslugiText(w.lastName, 'Нет', false),
        Имя: sanitizeCyrillicGosuslugiText(w.firstName, 'Нет', false),
        Отчество: sanitizeCyrillicGosuslugiText(w.middleName || 'НЕТ', 'НЕТ', false),
        ДатаРождения: w.birthDate,
        Пол: w.gender,
        ТекущееГражданство: cleanCit,
        МестоРождения: sanitizeCyrillicGosuslugiText(w.placeOfBirth || cleanCit, cleanCit, true),
        СерияПаспорта: w.passportSeries,
        НомерПаспорта: w.passportNumber,
        ДатаВыдачи: w.passportIssueDate,
        ПаспортКемВыдан: sanitizeCyrillicGosuslugiText(w.passportIssuedBy, 'МВД', true),
        ИНН: w.inn,
        Серия: w.rnrSeries,
        Номер: w.rnrNumber,
        ДатаВыдачиВКС: w.rnrIssueDate,
        СерийныйНомер1: w.blankSeries,
        СерийныйНомер2: w.blankNumber,
        ДатаЗаключения: w.contractDate,
        ДатаНачалаДействия: w.contractStartDate,
        ДатаОканчанияДействия: w.contractEndDate,
        НачалоПериода: w.periodStart || periodStart,
        КонецПериода: w.periodEnd || periodEnd,
        ПериодКод: periodCode,
        '1-месяц': formatSalaryWithKopecks(w.month1Salary),
        '2-месяц': formatSalaryWithKopecks(w.month2Salary),
        '3-месяц': formatSalaryWithKopecks(w.month3Salary),
        РазмерВыплаты: formatSalaryWithKopecks(w.salaryAmount),
        ПериодыВыплаты: monthlyPeriods,
        Должность: w.position,
        АдресРаботы: w.workAddress || workAddress,
        Индекс: w.postalCode || postalCode,
      };
    });

  const handleSaveQueueJson = () => {
    const validSelected = workers.filter((w) => w.selected && !isWorkerAlreadySentToGosuslugi(w));
    const recordsToSave = buildPayloadRecords(validSelected);
    if (recordsToSave.length === 0) {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Нет выбранных строк для выгрузки в очередь!'
          : 'Kuyruğa aktarılacak seçili satır bulunamadı!'
      );
      return;
    }
    const blob = new Blob([JSON.stringify(recordsToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'active_vks_queue.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice(
      'success',
      lang === 'ru'
        ? `Очередь active_vks_queue.json (${recordsToSave.length} чел.) скачана!`
        : `active_vks_queue.json kuyruk dosyası (${recordsToSave.length} kişi) indirildi!`
    );
  };

  const handleStartRobot = async (
    limit: number = 0,
    singleWorker?: GosuslugiVksWorkerRecord,
    skipPdfDownload: boolean = false
  ) => {
    if (bridgeStatus.status !== 'online') {
      setShowAgentGuide(true);
      showNotice(
        'error',
        lang === 'ru'
          ? 'Локальный RPA агент не запущен! Скачайте агент и дважды нажмите START_PONDERA_RPA_BRIDGE.bat'
          : 'Yerel RPA Ajanı çalışmıyor! Lütfen ajan paketini indirip START_PONDERA_RPA_BRIDGE.bat dosyasına çift tıklayın.'
      );
      return;
    }

    setIsStartingRobot(true);
    try {
      const candidates = singleWorker
        ? [singleWorker]
        : workers.filter((w) => w.selected && !isWorkerAlreadySentToGosuslugi(w));
      const recordsToSend = limit > 0 ? candidates.slice(0, limit) : candidates;

      if (recordsToSend.length === 0) {
        showNotice(
          'error',
          lang === 'ru'
            ? 'Нет выбранных сотрудников для отправки!'
            : 'Gönderim için seçili personel yok!'
        );
        return;
      }

      const erroredSicilsToReset = recordsToSend
        .filter((r) => r.status === 'error' || /^ошибк/i.test(r.gosuslugiStatus || ''))
        .map((r) => String(r.sicil || r.code || '').trim())
        .filter(Boolean);
      if (erroredSicilsToReset.length > 0) {
        try {
          await fetch('/api/gosuslugi/master-list', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'retry_errors',
              scope: 'selected',
              clearFromDb: true,
              sicils: erroredSicilsToReset,
            }),
          });
        } catch {}
      }

      const targetIds = new Set(recordsToSend.map((r) => r.id));
      setWorkers((prev) =>
        prev.map((w) =>
          targetIds.has(w.id)
            ? { ...w, status: 'pending', gosuslugiStatus: undefined, applicationNo: undefined }
            : w
        )
      );

      const payload = {
        mode: 'vks',
        limit: limit > 0 ? limit : 0,
        sheet: 'Sheet1',
        records: buildPayloadRecords(recordsToSend),
        config: {
          WORK_ADDRESS: workAddress,
          WORK_POSTAL_CODE: postalCode,
          UFMS_DEPARTMENT: ufmsDept,
          PERIOD_START: periodStart,
          PERIOD_END: periodEnd,
          PERIOD_CODE: periodCode,
          SKIP_STEP16_PDF: skipPdfDownload,
          RETRY_ERRORS: true,
        },
      };

      const res = await fetch(`${activeBridgeUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showNotice(
          'success',
          skipPdfDownload
            ? lang === 'ru'
              ? `Запущена быстрая отправка без PDF (${recordsToSend.length} чел.)! № заявления фиксируется сразу, PDF можно скачать позже.`
              : `PDF'siz Hızlı Gönderim (${recordsToSend.length} kişi) başlatıldı! Başvuru No formdan/mailden alınır, PDF sonradan indirilebilir.`
            : lang === 'ru'
            ? `Запущена отправка уведомлений ВКС (${recordsToSend.length} чел.) в Госуслуги!`
            : `Gosuslugi VKS bildirimi (${recordsToSend.length} kişi) başlatıldı!`
        );
      } else {
        const err = await res.json();
        showNotice('error', err.error || 'Robot başlatılamadı.');
      }
    } catch {
      showNotice('error', 'RPA Bridge bağlantı hatası.');
    } finally {
      setIsStartingRobot(false);
    }
  };

  const handleStopRobot = async () => {
    try {
      const res = await fetch(`${activeBridgeUrl}/stop`, { method: 'POST' });
      if (res.ok) {
        showNotice('info', lang === 'ru' ? 'Робот остановлен.' : 'Robot durduruldu.');
      }
    } catch {
      showNotice('error', 'Durdurma komutu gönderilemedi.');
    }
  };

  const handleManualContinue = async () => {
    try {
      const res = await fetch(`${activeBridgeUrl}/manual-continue`, { method: 'POST' });
      if (res.ok) {
        showNotice(
          'success',
          lang === 'ru'
            ? 'Сигнал продолжения отправлен роботу!'
            : 'Devam et sinyali robota gönderildi!'
        );
      }
    } catch {
      showNotice('error', 'Сигнал продолжения не отправлен.');
    }
  };

  // Second Button (Item 5): Scan downloaded PDFs & Query Gosuslugi statuses by application_no (№ Заявления)
  const handleCheckGosuslugiStatuses = async (statusOnly = false) => {
    if (bridgeStatus.status !== 'online') {
      setShowAgentGuide(true);
      showNotice(
        'error',
        lang === 'ru'
          ? 'Локальный RPA агент не запущен! Скачайте обновлённый агент и запустите START_PONDERA_RPA_BRIDGE.bat'
          : 'Yerel RPA Ajanı çalışmıyor! Lütfen güncel ajan paketini indirip START_PONDERA_RPA_BRIDGE.bat dosyasını çalıştırın.'
      );
      return;
    }

    setIsCheckingStatuses(true);
    try {
      if (statusOnly) {
        const res = await fetch(`${activeBridgeUrl}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'check_status_fast',
          }),
        });
        if (res.ok) {
          showNotice(
            'success',
            lang === 'ru'
              ? 'Запущена быстрая JSON-проверка 1200 заявлений Госуслуг (без скачивания PDF)...'
              : "Gosuslugi JSON üzerinden 1.200 başvurunun hızlı statü kontrolü (PDF'siz) başlatıldı..."
          );
        } else {
          const err = await res.json();
          showNotice('error', err.error || 'Hızlı statü kontrolü başlatılamadı.');
        }
        return;
      }

      // 1. First scan ~/Downloads on the bridge for any existing PDFs (<Sicil>_<AppNo>_... or <AppNo>_...)
      let scannedList: GosuslugiSubmissionEntry[] = [];
      try {
        const scanRes = await fetch(`${activeBridgeUrl}/scan-pdfs`, { method: 'POST' });
        if (scanRes.ok) {
          const scanJson = await scanRes.json();
          if (scanJson.submissions) {
            scannedList = Object.values(scanJson.submissions);
          }
        }
      } catch {
        // Ignore scan error
      }

      // 2. Merge with workers that have applicationNo and savedSubmissions from DB
      const appMap = new Map<string, GosuslugiSubmissionEntry>();
      for (const s of Object.values(savedSubmissions)) {
        if (s.application_no) {
          appMap.set(s.application_no, s);
        }
      }
      for (const s of scannedList) {
        if (s.application_no) {
          appMap.set(s.application_no, { ...(appMap.get(s.application_no) || {}), ...s });
        }
      }
      for (const w of workers) {
        const key = w.applicationNo || `sicil:${w.sicil || w.code || w.id}`;
        const fullWorkerName = [w.lastName, w.firstName, w.middleName]
          .filter((p) => p && p.trim().toLowerCase() !== 'нет')
          .join(' ')
          .trim();
        appMap.set(key, {
          sicil_no: w.sicil || w.code,
          worker_name: fullWorkerName || `${w.lastName} ${w.firstName}`.trim(),
          citizenship: w.citizenship,
          notification_type: 'VKS_SALARY',
          period_code: periodCode,
          application_no: w.applicationNo || '',
          gosuslugi_status: w.gosuslugiStatus || 'Отправлено',
          pdf_filename: w.pdfFilename || '',
        });
      }

      const recordsToCheck = Array.from(appMap.values());
      const withAppNo = recordsToCheck.filter((r) => Boolean(r.application_no));
      if (withAppNo.length > 0) {
        // Persist scanned PDF application numbers to Pondera DB immediately
        fetch('/api/gosuslugi/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: withAppNo }),
        }).catch(() => {});
      }

      // 3. Launch the standalone Gosuslugi Status Checker script on the bridge
      const res = await fetch(`${activeBridgeUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'check_status',
          records: recordsToCheck,
        }),
      });

      if (res.ok) {
        showNotice(
          'success',
          lang === 'ru'
            ? `Запущена массовая проверка статусов в «Заявления» (lk.gosuslugi.ru/orders) без поштучного поиска...`
            : `Gosuslugi «Заявления» (lk.gosuslugi.ru/orders) üzerinden toplu başvuru durum sorgulama başlatıldı...`
        );
      } else {
        const err = await res.json();
        showNotice('error', err.error || 'Durum sorgulama başlatılamadı.');
      }
    } catch {
      showNotice(
        'error',
        lang === 'ru'
          ? 'Ошибка запуска проверки статусов Госуслуг.'
          : 'Gosuslugi durum sorgulama başlatılırken hata oluştu.'
      );
    } finally {
      setIsCheckingStatuses(false);
    }
  };

  const isOnline = bridgeStatus.status === 'online';
  const isRunning = bridgeStatus.running;
  const isWaitingManual = Boolean(bridgeStatus.waiting_for_manual && isRunning);

  // Validation & Queue Statistics
  const validWorkers = workers.filter((w) => !isWorkerAlreadySentToGosuslugi(w));
  const invalidWorkers = workers.filter(
    (w) => !isWorkerAlreadySentToGosuslugi(w) && !validationMap[w.id]?.isValid
  );
  const selectedValidCount = workers.filter(
    (w) => w.selected && !isWorkerAlreadySentToGosuslugi(w)
  ).length;
  const validCount = selectedValidCount;
  const invalidCount = invalidWorkers.length;
  const completedCount =
    workers.filter((w) => w.status === 'success').length || bridgeStatus.success;
  const errorCount = workers.filter((w) => w.status === 'error').length || bridgeStatus.errors;

  // Filtered rows by tab ('all' | 'ready' | 'invalid' | 'sent' | 'error') + search query
  const filteredWorkers = workers.filter((w) => {
    const isRowValid = validationMap[w.id]?.isValid ?? true;
    const isSentRow = w.status === 'success' || isWorkerAlreadySentToGosuslugi(w);
    if (queueFilter === 'ready' && (isSentRow || !w.selected)) return false;
    if (queueFilter === 'invalid' && (isSentRow || isRowValid)) return false;
    if (queueFilter === 'sent' && !isSentRow) return false;
    if (queueFilter === 'error' && w.status !== 'error') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.lastName.toLowerCase().includes(q) ||
      w.firstName.toLowerCase().includes(q) ||
      w.code.toLowerCase().includes(q) ||
      w.sicil.toLowerCase().includes(q) ||
      w.passportNumber.toLowerCase().includes(q) ||
      w.inn.toLowerCase().includes(q) ||
      w.rnrNumber.toLowerCase().includes(q) ||
      (w.applicationNo && w.applicationNo.toLowerCase().includes(q))
    );
  });

  // Find active row index for step banner
  const activeWorkerObj = workers.find((w) => {
    const codeKey = w.code || w.sicil;
    return (
      w.status === 'processing' ||
      (isRunning &&
        ((bridgeStatus.active_worker_code && codeKey === bridgeStatus.active_worker_code) ||
          (bridgeStatus.active_worker_name &&
            `${w.lastName} ${w.firstName}`
              .toLowerCase()
              .includes(bridgeStatus.active_worker_name.toLowerCase()))))
    );
  });

  const descriptionTooltipText =
    lang === 'ru'
      ? 'Полная замена Power Automate Desktop (PAD). Загрузите список ВКС из Excel или базы Pondera HR и отслеживайте заполнение каждой строки на Госуслугах в реальном времени.'
      : 'Power Automate Desktop (PAD) yerine doğrudan tarayıcı otomasyonu. Excel yükleyin veya veritabanından VKS uzmanlarını çekin; hangi satırın Gosuslugi üzerinde işlendiğini canlı takip edin.';

  return (
    <div className="p-3 sm:p-5 lg:p-6 space-y-4 max-w-[1600px] mx-auto [overflow-anchor:none]">
      {/* Animations for RPA Assistant */}
      <style>{`
        @keyframes rpaBotRoam {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          25% { transform: translate(-6px, -7px) rotate(-1.5deg); }
          50% { transform: translate(0px, -11px) rotate(0deg); }
          75% { transform: translate(6px, -6px) rotate(1.5deg); }
        }
        @keyframes rpaWaveArm {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-22deg); }
          50% { transform: rotate(8deg); }
          75% { transform: rotate(-18deg); }
        }
        @keyframes rpaEyeScan {
          0%, 100% { transform: translateX(0px); }
          30% { transform: translateX(-2.5px); }
          70% { transform: translateX(2.5px); }
        }
        @keyframes rpaEyeBlink {
          0%, 46%, 50%, 96%, 100% { transform: scaleY(1); }
          48%, 98% { transform: scaleY(0.15); }
        }
        @keyframes rpaThrusterPulse {
          0%, 100% { transform: scaleX(0.9) scaleY(1); opacity: 0.7; }
          50% { transform: scaleX(1.18) scaleY(1.25); opacity: 1; }
        }
        @keyframes rpaAntennaPing {
          0% { transform: scale(0.9); opacity: 0.9; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        .rpa-bot-roam {
          animation: rpaBotRoam 4.2s ease-in-out infinite;
        }
        .rpa-wave-arm {
          transform-origin: 68px 54px;
          animation: rpaWaveArm 2.2s ease-in-out infinite;
        }
        .rpa-eye-scan {
          animation: rpaEyeScan 3.4s ease-in-out infinite;
        }
        .rpa-eye-blink {
          transform-origin: 48px 34px;
          animation: rpaEyeBlink 4.5s ease-in-out infinite;
        }
        .rpa-thruster-pulse {
          transform-origin: 48px 84px;
          animation: rpaThrusterPulse 1.3s ease-in-out infinite;
        }
        .rpa-antenna-ping {
          transform-origin: 48px 10px;
          animation: rpaAntennaPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>

      {/* PAGE-CONNECTED TAB BAR + TOP HEADER SECTION */}
      <div>
        {/* WINDOWS MULTI-TAB FORM HEADER (3 EQUAL-WIDTH TABS) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 px-1 pt-1 bg-slate-200/80 dark:bg-slate-900/90 rounded-t-2xl border border-b-0 border-slate-300/80 dark:border-slate-800">
          {/* Tab 1: VKS Salary Notification */}
          <button
            type="button"
            onClick={() => setServiceTab('vks')}
            className={`group relative h-11 px-4 rounded-t-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
              serviceTab === 'vks'
                ? 'bg-white dark:bg-[#111F38] text-slate-950 dark:text-white border-t-2 border-x border-t-indigo-600 dark:border-t-indigo-400 border-x-slate-300/80 dark:border-x-slate-700 shadow-xs -mb-px z-10'
                : 'bg-slate-100/90 dark:bg-slate-800/50 text-slate-800 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Bot
                className={`w-4 h-4 shrink-0 ${
                  serviceTab === 'vks'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-600'
                }`}
              />
              <span className="truncate">
                {lang === 'ru' ? '1. ВКС — Выплата ЗП' : '1. VKS Maaş Bildirimi'}
              </span>
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-md font-medium shrink-0 ${
                serviceTab === 'vks'
                  ? 'bg-indigo-50 dark:bg-indigo-950/90 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80'
                  : 'bg-slate-200/90 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              600585/1
            </span>
          </button>

          {/* Tab 2: Hiring Notification */}
          <button
            type="button"
            onClick={() => setServiceTab('hiring')}
            className={`group relative h-11 px-4 rounded-t-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
              serviceTab === 'hiring'
                ? 'bg-white dark:bg-[#111F38] text-slate-950 dark:text-white border-t-2 border-x border-t-indigo-600 dark:border-t-indigo-400 border-x-slate-300/80 dark:border-x-slate-700 shadow-xs -mb-px z-10'
                : 'bg-slate-100/90 dark:bg-slate-800/50 text-slate-800 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <UserPlus
                className={`w-4 h-4 shrink-0 ${
                  serviceTab === 'hiring'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-600'
                }`}
              />
              <span className="truncate">
                {lang === 'ru' ? '2. Прием на работу' : '2. İşe Alım Bildirimi'}
              </span>
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-md font-medium shrink-0 ${
                serviceTab === 'hiring'
                  ? 'bg-amber-50 dark:bg-amber-950/90 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80'
                  : 'bg-slate-200/90 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              {lang === 'ru' ? 'В работе' : 'İşlemde'}
            </span>
          </button>

          {/* Tab 3: Dismissal Notification */}
          <button
            type="button"
            onClick={() => setServiceTab('dismissal')}
            className={`group relative h-11 px-4 rounded-t-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
              serviceTab === 'dismissal'
                ? 'bg-white dark:bg-[#111F38] text-slate-950 dark:text-white border-t-2 border-x border-t-indigo-600 dark:border-t-indigo-400 border-x-slate-300/80 dark:border-x-slate-700 shadow-xs -mb-px z-10'
                : 'bg-slate-100/90 dark:bg-slate-800/50 text-slate-800 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <UserMinus
                className={`w-4 h-4 shrink-0 ${
                  serviceTab === 'dismissal'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-600'
                }`}
              />
              <span className="truncate">
                {lang === 'ru' ? '3. Увольнение (МВД)' : '3. İşten Çıkış Bildirimi'}
              </span>
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-md font-medium shrink-0 ${
                serviceTab === 'dismissal'
                  ? 'bg-indigo-50 dark:bg-indigo-950/90 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80'
                  : 'bg-slate-200/90 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              600585/1
            </span>
          </button>
        </div>

        {/* TAB 2: HIRING NOTIFICATION (CONNECTED TO TAB BAR) */}
        {serviceTab === 'hiring' && (
          <div className="p-12 bg-white dark:bg-[#111F38] rounded-b-2xl border border-slate-300/80 dark:border-slate-800 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <div className="max-w-lg mx-auto space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800">
                {lang === 'ru' ? 'Модуль в процессе настройки' : 'Modül Hazırlanıyor (İşlemde)'}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Уведомление МВД о заключении трудового договора (Прием на работу)'
                  : 'Gosuslugi MVD İşe Alım Bildirimi (Sözleşme İmzalama)'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ru'
                  ? 'Автоматическое заполнение формы Госуслуг 600585/1 («О заключении трудового договора с иностранным гражданином») в данный момент находится в разработке. Используйте вкладки «1. ВКС — Выплата ЗП» или «3. Увольнение».'
                  : 'Yabancı personelin işe giriş / iş sözleşmesi bildirimi (Gosuslugi 600585/1 — О заключении трудового договора) otomasyon modülü şu anda işlemde. Aktif bildirimler için «1. VKS Maaş Bildirimi» veya «3. İşten Çıkış Bildirimi» sekmelerini kullanabilirsiniz.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* TAB 3: DISMISSAL NOTIFICATION (PORTED FROM POWERISE WITH FULL PONDERA HR CONTROLS) */}
      {serviceTab === 'dismissal' && (
        <div className="-mt-4">
          <GosuslugiDismissalPanel
            activeBridgeUrl={activeBridgeUrl}
            bridgeStatus={bridgeStatus}
            onOpenChrome={handleOpenChrome}
            isLaunchingChrome={isLaunchingChrome}
            onShowAgentGuide={() => setShowAgentGuide(true)}
          />
        </div>
      )}

      {/* TAB 1: VKS SALARY NOTIFICATION */}
      {serviceTab === 'vks' && (
        <>
      {/* Hidden Excel File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* COMPACT TOP HEADER BAR (CONNECTED DIRECTLY TO TAB BAR ABOVE) */}
      <div className="-mt-4 bg-white dark:bg-[#111F38] rounded-b-2xl border border-slate-300/80 dark:border-slate-800 px-4 py-3 text-slate-900 dark:text-white shadow-xs relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Icon + Title + Hover Tooltip + Status Badges */}
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div
              className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white dark:bg-white/95 border border-slate-200/90 dark:border-slate-300 shadow-2xs select-none"
              title="Госуслуги (ЕПГУ 600585/1)"
            >
              <img
                src="/gosuslugi-logo.png"
                alt="госуслуги"
                className="h-4 w-auto object-contain block"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-slate-950 dark:text-white">
                {lang === 'ru'
                  ? 'Уведомление МВД о выплате ЗП ВКС'
                  : 'VKS Maaş Bildirimi (МВД)'}
              </h1>

              {/* Hover Tooltip Icon for Description */}
              <div className="relative group inline-flex items-center">
                <button
                  type="button"
                  className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300/80 dark:border-slate-700 flex items-center justify-center transition cursor-help"
                  aria-label="Info"
                >
                  <Info className="w-3 h-3" />
                </button>
                <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute left-0 top-7 z-50 w-80 sm:w-96 p-3 rounded-xl bg-slate-900 text-white text-xs leading-relaxed shadow-xl border border-slate-700">
                  <div className="font-semibold text-indigo-400 mb-1 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    <span>Pondera Playwright RPA (Форма ЕПГУ 600585/1)</span>
                  </div>
                  {descriptionTooltipText}
                </div>
              </div>

              {/* Single Live Agent Status Pill */}
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {lang === 'ru' ? 'RPA Онлайн (8088)' : 'RPA Aktif (8088)'}
                </span>
              ) : (
                <button
                  onClick={() => setShowAgentGuide(!showAgentGuide)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-500/15 border border-amber-300/90 dark:border-amber-500/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100 cursor-pointer transition"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>{lang === 'ru' ? 'Агент выкл. (8088)' : 'Ajan Kapalı (8088)'}</span>
                  <HelpCircle className="w-3 h-3 opacity-75" />
                </button>
              )}

              {bridgeStatus.chrome_ready && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-500/15 border border-blue-300 dark:border-blue-500/30 text-blue-800 dark:text-blue-300">
                  <Globe className="w-3 h-3" />
                  Chrome (9222)
                </span>
              )}
            </div>
          </div>

          {/* Right: Clean Consolidated Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
              title="Yeni VKS listesi veya düzeltilmiş şablon Excel dosyasını yükle"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Загрузить Excel' : 'Excel Yükle'}</span>
            </button>

            <button
              onClick={handleLoadFromDatabase}
              disabled={isLoadingDb}
              className="h-8 px-2.5 rounded-lg border border-slate-300/90 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              {isLoadingDb ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-700" />
              ) : (
                <Database className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              )}
              <span>{lang === 'ru' ? 'Из базы' : 'Sistemden Çek'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="h-8 px-2.5 rounded-lg border border-slate-300/90 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Download className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />
              <span>{lang === 'ru' ? 'Экспорт' : 'Excel İndir'}</span>
            </button>

            <a
              href={`/api/gosuslugi/master-list/export-errors?computer=${activeComputerFilter}`}
              download
              title="Hatalı (Ошибка / Eksik Veri) kayıtları şablon formatında indir"
              className="h-8 px-2.5 rounded-lg border border-slate-300/90 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-800 dark:text-slate-100 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition no-underline"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>{lang === 'ru' ? 'Шаблон Ошибок' : 'Hatalı Şablon'}</span>
            </a>

            <a
              href={`/api/gosuslugi/master-list/export-errors?mode=refused&computer=${activeComputerFilter}`}
              download
              title="Услуга отказана (МВД Red) alan kayıtları şablon formatında indir"
              className="h-8 px-2.5 rounded-lg border border-slate-300/90 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-orange-50 dark:hover:bg-orange-950/40 text-slate-800 dark:text-slate-100 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition no-underline"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span>{lang === 'ru' ? 'Шаблон Отказов' : 'Red Şablon'}</span>
            </a>

            <a
              href="/api/gosuslugi/pdf/zip"
              download="Pondera_VKS_Gosuslugi_PDFs_2026-3.zip"
              title="İndirilen tüm VKS bildirim PDF'lerini tek ZIP arşivi olarak indir"
              className="h-8 px-2.5 rounded-lg border border-slate-300/90 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition no-underline"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{lang === 'ru' ? 'PDF (ZIP)' : 'PDF ZIP'}</span>
            </a>

            <button
              onClick={() => setShowMailRuModal(true)}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
              title="Mail.ru üzerinden otomatik başvuru durumu kontrolü"
            >
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Mail.ru</span>
              {mailRuHasPassword && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setShowConfigPanel(!showConfigPanel)}
              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition ${
                showConfigPanel
                  ? 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Параметры' : 'Ayarlar'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible PAD Form Parameters (Period, Address, Postal Code, PDF Period Code) */}
        {showConfigPanel && (
          <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50/90 dark:bg-slate-900/70 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {lang === 'ru' ? 'Начало периода (di17_start)' : 'Dönem Başlangıcı (НачалоПериода)'}
              </label>
              <input
                type="text"
                value={periodStart}
                onChange={(e) => {
                  const val = e.target.value;
                  setPeriodStart(val);
                  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(val.trim());
                  if (m) {
                    const mm = Number(m[2]);
                    const yyyy = Number(m[3]);
                    if (mm >= 1 && mm <= 12) {
                      setPeriodCode(`${yyyy}-${Math.floor((mm - 1) / 3) + 1}`);
                    }
                  }
                }}
                placeholder="01.07.2026"
                className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {lang === 'ru' ? 'Конец периода (di17_end)' : 'Dönem Bitişi (КонецПериода)'}
              </label>
              <input
                type="text"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                placeholder="30.09.2026"
                className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                {lang === 'ru' ? 'Период для имени PDF' : 'PDF Dosya Adı Dönemi'}
              </label>
              <input
                type="text"
                value={periodCode}
                onChange={(e) => setPeriodCode(e.target.value)}
                placeholder="2026-3"
                title="<GosuslugiNo>_<ФИО>_<Период>.pdf"
                className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                {lang === 'ru' ? 'Почтовый индекс (#index)' : 'Posta Kodu (Индекс)'}
              </label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="626150"
                className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={handleApplyGlobalParamsToRows}
                className="w-full h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer transition"
              >
                {lang === 'ru' ? 'Применить ко всем строкам' : 'Tüm Satırlara Uygula'}
              </button>
            </div>

            <div className="md:col-span-5 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {lang === 'ru'
                    ? 'Адрес места работы (Month1End в PAD)'
                    : 'Çalışma Yeri Adresi (PAD Month1End değişkeni)'}
                </label>
                <input
                  type="text"
                  value={workAddress}
                  onChange={(e) => setWorkAddress(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div className="md:w-88 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-800 dark:text-emerald-300">
                <div className="font-bold">
                  {lang === 'ru'
                    ? 'Формат PDF (с табельным № для EBA):'
                    : 'İndirilen PDF Formatı (EBA Sicil No ile):'}
                </div>
                <div className="font-mono font-bold truncate">
                  {`<Sicil>_<GosuslugiNo>_<Ad Soyad>_${periodCode || '2026-3'}.pdf`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FATAL STOP BANNER (E.G. INSUFFICIENT PERMISSIONS ON GOSUSLUGI ACCOUNT - IMAGE 3) */}
        {bridgeStatus.fatal_error && (
          <div className="mt-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/75 border-2 border-rose-500 dark:border-rose-500/80 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-900 dark:text-rose-200">
                  {lang === 'ru'
                    ? 'РОБОТ ОСТАНОВЛЕН: НЕДОСТАТОЧНО ПОЛНОМОЧИЙ НА ГОСУСЛУГАХ'
                    : 'ROBOT DURDURULDU: GOSUSLUGİ HESABINDA GÖNDERİM YETKİSİ YOK'}
                </div>
                <div className="text-xs text-rose-800 dark:text-rose-200 mt-0.5 font-medium">
                  {bridgeStatus.fatal_error}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HUMAN-IN-THE-LOOP: MANUAL INTERVENTION BANNER WHEN GOSUSLUGI SHOWS RED VALIDATION ERROR OR DISABLED CONTINUE */}
        {isWaitingManual && (
          <div className="mt-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 border-2 border-amber-400 dark:border-amber-500/70 flex flex-wrap items-center justify-between gap-3 shadow-sm animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  {lang === 'ru'
                    ? 'ПАУЗА РОБОТА: ТРЕБУЕТСЯ РУЧНАЯ ПРАВКА В БРАУЗЕРЕ CHROME (ГОСУСЛУГИ)'
                    : 'ROBOT DURAKLATILDI: GOSUSLUGİ EKRANINDA MANUEL DÜZELTME BEKLENİYOR'}
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                  {bridgeStatus.manual_message ||
                    (lang === 'ru'
                      ? 'На странице Госуслуг кнопка «Продолжить» неактивна (серая) или есть красное поле. Исправьте поле в открытом окне Chrome — робот автоматически продолжит!'
                      : 'Gosuslugi sayfasında «Продолжить» butonu pasif (gri) veya kırmızı uyarı var. Açık Chrome penceresinde ilgili alanı düzeltin; buton mavi olunca robot otomatik devam edecektir!')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleManualContinue}
                className="h-9 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {lang === 'ru'
                    ? 'Исправлено в Chrome — Продолжить'
                    : "Chrome'da Düzelttim — Devam Et"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Active Row Progress Banner (Real-Time Row Indicator) */}
        {(isRunning || activeWorkerObj || bridgeStatus.processed > 0) && (
          <div className="mt-3 p-3 rounded-xl bg-teal-50/90 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-500/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {isRunning ? (
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="text-[10.5px] uppercase tracking-wider font-extrabold text-teal-700 dark:text-teal-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {isRunning
                    ? lang === 'ru'
                      ? 'СЕЙЧАС ОБРАБАТЫВАЕТСЯ СТРОКА НА ГОСУСЛУГАХ:'
                      : 'ŞU ANDA GOSUSLUGİ ÜZERİNDE İŞLENEN SATIR:'
                    : lang === 'ru'
                    ? 'СТАТУС ПАКЕТНОЙ ОТПРАВКИ:'
                    : 'TOPLU GÖNDERİM DURUMU:'}
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {activeWorkerObj ? (
                    <>
                      {activeWorkerObj.lastName} {activeWorkerObj.firstName}{' '}
                      {activeWorkerObj.middleName}{' '}
                      <span className="text-teal-700 dark:text-teal-300 font-mono text-xs font-semibold">
                        (Sicil/Код: {activeWorkerObj.code || activeWorkerObj.sicil} • ИНН:{' '}
                        {activeWorkerObj.inn || '—'} • Выплата: {activeWorkerObj.salaryAmount} ₽)
                      </span>
                    </>
                  ) : bridgeStatus.active_worker_name ? (
                    <>
                      {bridgeStatus.active_worker_name}{' '}
                      <span className="text-teal-700 dark:text-teal-300 font-mono text-xs font-semibold">
                        (Код: {bridgeStatus.active_worker_code})
                      </span>
                    </>
                  ) : (
                    <span>
                      {lang === 'ru'
                        ? `Обработано ${bridgeStatus.processed} из ${bridgeStatus.total || validCount}`
                        : `Toplam ${bridgeStatus.total || validCount} kayıttan ${bridgeStatus.processed} tanesi işlendi`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 text-xs font-mono">
              <div className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <span className="text-slate-500">{lang === 'ru' ? 'Прогресс: ' : 'İlerleme: '}</span>
                <strong className="text-slate-900 dark:text-white">
                  {bridgeStatus.processed} / {bridgeStatus.total || selectedValidCount}
                </strong>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
                <span>{lang === 'ru' ? 'Успешно: ' : 'Başarılı: '}</span>
                <strong>{bridgeStatus.success}</strong>
              </div>
              {bridgeStatus.errors > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-rose-100/80 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-300">
                  <span>{lang === 'ru' ? 'Ошибок: ' : 'Hatalı: '}</span>
                  <strong>{bridgeStatus.errors}</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification Banner */}
      {toastMsg && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-sm transition-all ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-200'
              : toastMsg.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200'
              : 'bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800/80 text-teal-800 dark:text-teal-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{toastMsg.text}</span>
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="px-2 py-0.5 rounded-lg text-[11px] hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* CENTRAL BACKEND MASTER LIST & 4-COMPUTER QUEUE PARTITIONING PANEL */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 text-indigo-900 dark:text-indigo-200 text-xs font-semibold">
              <Database className="w-3.5 h-3.5" />
              {lang === 'ru'
                ? `Серверная очередь ВКС (${masterSummary?.totalMaster || 0})`
                : `Merkezi VKS Kuyruğu (${masterSummary?.totalMaster || 0})`}
            </span>
            <span className="text-[11.5px] text-slate-700 dark:text-slate-300 font-normal">
              {lang === 'ru'
                ? 'Распределение на 4 ПК • Защита от дублей'
                : '4 Bilgisayar Dağılımı • Mükerrer Korumalı'}
            </span>
          </div>

          {/* Clean Partitioning & Retry Controls (No Duplicate Download/Upload Buttons) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleSplit4Computers('tail_transfer', 600)}
              disabled={isSplittingMaster}
              className="h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
              title="1. ve 2. bilgisayarların listelerinin sonundan 600'er kişiyi 3. ve 4. bilgisayarlara aktarır"
            >
              <Zap className="w-3 h-3 text-amber-500" />
              <span>{lang === 'ru' ? 'По 600 -> ПК 3-4' : '600 Aktar (PC 3-4)'}</span>
            </button>
            <button
              onClick={() => handleSplit4Computers('tail_transfer', 500)}
              disabled={isSplittingMaster}
              className="h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
              title="1. ve 2. bilgisayarların listelerinin sonundan 500'er kişiyi 3. ve 4. bilgisayarlara aktarır"
            >
              <Zap className="w-3 h-3 text-teal-600" />
              <span>{lang === 'ru' ? 'По 500 -> ПК 3-4' : '500 Aktar (PC 3-4)'}</span>
            </button>
            <button
              onClick={() => handleSplit4Computers('equal_4', 600)}
              disabled={isSplittingMaster}
              className="h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
              title="Kalan gönderilmemiş tüm başvuruları 4 bilgisayara eşit böler"
            >
              <Users className="w-3 h-3 text-indigo-600" />
              <span>{lang === 'ru' ? 'Поровну (4 ПК)' : '4 PC Eşit Böl'}</span>
            </button>
            <button
              onClick={() =>
                handleRetryErrors(activeComputerFilter === 'all' ? 'all' : 'computer')
              }
              disabled={isRetryingErrors}
              className="h-7 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 border border-rose-300/90 dark:border-rose-400/40 text-rose-800 dark:text-rose-200 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
              title="Hata (Ошибка) veren kayıtların hata statüsünü sıfırlayıp tekrar gönderim kuyruğuna alır"
            >
              <RefreshCw className={`w-3 h-3 ${isRetryingErrors ? 'animate-spin' : ''}`} />
              <span>{lang === 'ru' ? 'Повторить ошибки' : 'Hatalıları Sıraya Al'}</span>
            </button>
            <button
              onClick={() =>
                handleReopenRefused(activeComputerFilter === 'all' ? 'all' : 'computer')
              }
              disabled={isRetryingErrors}
              className="h-7 px-2.5 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/20 dark:hover:bg-orange-500/30 border border-orange-300/90 dark:border-orange-400/40 text-orange-800 dark:text-orange-200 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
              title="Red (Услуга отказана) alan kayıtları tekrar gönderim kuyruğuna alır"
            >
              <RefreshCw className={`w-3 h-3 ${isRetryingErrors ? 'animate-spin' : ''}`} />
              <span>{lang === 'ru' ? 'Повторить отказы' : 'Redleri Sıraya Al'}</span>
            </button>
          </div>
        </div>

        {/* 5 Computer Queue Buttons (All + PC 1, PC 2, PC 3, PC 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <button
            onClick={() => handleLoadFromMasterList('all', 'all')}
            disabled={isLoadingMaster}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              activeComputerFilter === 'all' && workers.length > 0
                ? 'bg-indigo-50/90 dark:bg-indigo-600/25 border-indigo-400 ring-1 ring-indigo-400/50'
                : 'bg-slate-50/90 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border-slate-300/90 dark:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs sm:text-[13px] font-medium text-slate-950 dark:text-white">
                {lang === 'ru' ? '🌐 Весь список' : '🌐 Tüm Liste'}
              </span>
              {isLoadingMaster && activeComputerFilter === 'all' && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
              )}
            </div>
            <div className="text-[12.5px] text-slate-800 dark:text-slate-200 mt-1.5 flex items-center justify-between font-normal">
              <span className="text-slate-900 dark:text-slate-100">Top: {masterSummary?.totalMaster || '—'}</span>
              <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                ✓{' '}
                {masterSummary
                  ? Object.values(masterSummary.computers).reduce((a, b) => a + b.sent, 0)
                  : '—'}
              </span>
              <span className="text-amber-800 dark:text-amber-300 font-medium">
                ⏳{' '}
                {masterSummary
                  ? Object.values(masterSummary.computers).reduce((a, b) => a + b.pending, 0)
                  : '—'}
              </span>
              <span className="text-rose-800 dark:text-rose-300 font-medium">
                ⚠{' '}
                {masterSummary
                  ? Object.values(masterSummary.computers).reduce((a, b) => a + b.error, 0)
                  : '—'}
              </span>
            </div>
          </button>

          {([1, 2, 3, 4] as const).map((pcNum) => {
            const pcStat = masterSummary?.computers?.[pcNum];
            const pcStr = String(pcNum) as '1' | '2' | '3' | '4';
            const isSelectedPc = activeComputerFilter === pcStr && workers.length > 0;
            const rangeText =
              pcStat && pcStat.minRow > 0 ? `${pcStat.minRow}–${pcStat.maxRow}` : '—';
            return (
              <div
                key={pcNum}
                className={`p-2.5 rounded-xl border transition flex flex-col justify-between ${
                  isSelectedPc
                    ? 'bg-indigo-50/90 dark:bg-indigo-600/25 border-indigo-400 ring-1 ring-indigo-400/50'
                    : 'bg-slate-50/90 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border-slate-300/90 dark:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => handleLoadFromMasterList(pcStr, 'all')}
                    disabled={isLoadingMaster}
                    className="text-xs sm:text-[13px] font-medium text-slate-950 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer text-left flex-1 truncate"
                  >
                    💻 PC {pcNum}{' '}
                    <span className="text-[11.5px] text-slate-700 dark:text-slate-300">({rangeText})</span>
                  </button>
                  {pcStat && pcStat.error > 0 && (
                    <button
                      onClick={() => handleLoadFromMasterList(pcStr, 'error')}
                      className="px-2 py-0.5 rounded bg-rose-100 hover:bg-rose-200 dark:bg-rose-500/30 dark:hover:bg-rose-500/50 border border-rose-300 dark:border-rose-400/40 text-rose-800 dark:text-rose-200 text-[11px] font-medium cursor-pointer"
                      title={`PC ${pcNum} üzerindeki ${pcStat.error} hatalı kaydı göster`}
                    >
                      ⚠ {pcStat.error}
                    </button>
                  )}
                </div>
                <div
                  onClick={() => handleLoadFromMasterList(pcStr, 'all')}
                  className="text-[12.5px] text-slate-800 dark:text-slate-200 mt-1.5 flex items-center justify-between font-normal cursor-pointer"
                >
                  <span className="text-slate-900 dark:text-slate-100">Top: {pcStat?.total ?? '—'}</span>
                  <span className="text-emerald-800 dark:text-emerald-300 font-medium">✓ {pcStat?.sent ?? 0}</span>
                  <span className="text-amber-800 dark:text-amber-300 font-medium">⏳ {pcStat?.pending ?? 0}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unified Control Bar: Search, Single Status Filter Strip & Robot Launch Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#131C31] p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ru'
                  ? 'Поиск по ФИО, табельному, ИНН...'
                  : 'Ad Soyad, Sicil, Pasaport, INN ara...'
              }
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          {/* Single Unified Filter & Count Tabs (No Duplicate KPI Cards Above) */}
          {workers.length > 0 && (
            <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 text-xs font-medium gap-1">
              <button
                onClick={() => setQueueFilter('all')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                  queueFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white'
                }`}
              >
                {lang === 'ru' ? `Все (${workers.length})` : `Tümü (${workers.length})`}
              </button>
              <button
                onClick={() => setQueueFilter('ready')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition inline-flex items-center gap-1 ${
                  queueFilter === 'ready'
                    ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                    : 'text-indigo-800 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>
                  {lang === 'ru' ? `Готовы (${selectedValidCount})` : `Hazır (${selectedValidCount})`}
                </span>
              </button>
              <button
                onClick={() => setQueueFilter('sent')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition inline-flex items-center gap-1 ${
                  queueFilter === 'sent'
                    ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                    : 'text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>
                  {lang === 'ru' ? `Отправлено (${completedCount})` : `Gönderilen (${completedCount})`}
                </span>
              </button>
              <button
                onClick={() => setQueueFilter('error')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition inline-flex items-center gap-1 ${
                  queueFilter === 'error'
                    ? 'bg-rose-600 text-white shadow-2xs font-semibold'
                    : errorCount > 0
                    ? 'text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                <span>
                  {lang === 'ru' ? `Ошибки (${errorCount})` : `Hata (${errorCount})`}
                </span>
              </button>
              <button
                onClick={() => setQueueFilter('invalid')}
                className={`px-2.5 py-1 rounded-lg cursor-pointer transition inline-flex items-center gap-1 ${
                  queueFilter === 'invalid'
                    ? 'bg-amber-600 text-white shadow-2xs font-semibold'
                    : invalidCount > 0
                    ? 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>
                  {lang === 'ru' ? `Пропуски (${invalidCount})` : `Eksik Veri (${invalidCount})`}
                </span>
              </button>
            </div>
          )}

          {workers.length > 0 && (
            <button
              onClick={() => {
                setWorkers([]);
                setQueueFilter('all');
              }}
              className="h-9 px-2.5 rounded-xl border border-slate-300/80 dark:border-slate-700 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs inline-flex items-center gap-1 cursor-pointer transition"
              title={lang === 'ru' ? 'Очистить список' : 'Listeyi Temizle'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Clean Streamlined Robot Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={handleOpenChrome}
            disabled={isLaunchingChrome}
            className="h-9 px-3 rounded-xl border border-slate-300/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>
              {bridgeStatus.chrome_ready
                ? lang === 'ru'
                  ? 'Chrome Готов'
                  : 'Chrome Hazır'
                : lang === 'ru'
                ? '1. Открыть Chrome'
                : '1. Chrome Aç'}
            </span>
          </button>

          {isRunning ? (
            <button
              onClick={handleStopRobot}
              className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>{lang === 'ru' ? 'Стоп' : 'Durdur'}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleStartRobot(1)}
                disabled={isStartingRobot || selectedValidCount === 0}
                className="h-9 px-3 rounded-xl border border-slate-300/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Тест (1)' : 'Test (1 Satır)'}</span>
              </button>

              <button
                onClick={() => handleStartRobot(0, undefined, false)}
                disabled={isStartingRobot || selectedValidCount === 0}
                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40 transition"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {lang === 'ru'
                    ? `2. Отправить (${selectedValidCount})`
                    : `2. Gönder (${selectedValidCount})`}
                </span>
              </button>

              <button
                onClick={() => handleStartRobot(0, undefined, true)}
                disabled={isStartingRobot || selectedValidCount === 0}
                title="PDF beklemeksizin hızlı gönderim"
                className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-40 transition"
              >
                <Zap className="w-3.5 h-3.5 fill-white" />
                <span>
                  {lang === 'ru'
                    ? `Быстро без PDF (${selectedValidCount})`
                    : `Hızlı Gönder (${selectedValidCount})`}
                </span>
              </button>

              <button
                onClick={() => handleCheckGosuslugiStatuses(true)}
                disabled={isCheckingStatuses}
                title="PDF indirmeden Gosuslugi JSON üzerinden statüleri hızlıca sorgula"
                className="h-9 px-3 rounded-xl border border-slate-300/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>{lang === 'ru' ? 'Быстрый статус' : 'Hızlı Statü'}</span>
              </button>

              <button
                onClick={() => handleCheckGosuslugiStatuses(false)}
                disabled={isCheckingStatuses}
                title="Gosuslugi durumlarını sorgula ve PDF makbuzlarını indir"
                className="h-9 px-3 rounded-xl border border-slate-300/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${
                    isCheckingStatuses ? 'animate-spin' : ''
                  }`}
                />
                <span>{lang === 'ru' ? '3. PDF и Статус' : '3. PDF & Statü'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main VKS Queue Table */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131C31] overflow-hidden shadow-xs">
        {workers.length === 0 ? (
          <div className="p-10 sm:p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-teal-950/60 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div className="max-w-xl space-y-1">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Список уведомлений ВКС пока пуст'
                  : 'VKS Bildirim Listesi Henüz Boş'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'ru'
                  ? 'Загрузите файл Excel (GosUsluga_ ЗП.xlsx), чтобы сформировать список, или подтяните специалистов ВКС напрямую из базы данных Pondera HR. Система автоматически проверит даты и обязательные поля перед отправкой.'
                  : 'Listeyi oluşturmak için Excel dosyanızı (GosUsluga_ ЗП.xlsx) yükleyin veya doğrudan Pondera HR veritabanındaki VKS uzmanlarını çekin. Sistem eksik verileri ve hatalı tarihleri otomatik analiz eder.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-xs transition"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {lang === 'ru'
                    ? 'Загрузить Excel (GosUsluga_ ЗП.xlsx)'
                    : 'Excel Yükle (GosUsluga_ ЗП.xlsx)'}
                </span>
              </button>
              <button
                onClick={handleLoadSample933532}
                className="h-9 px-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition"
              >
                <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>
                  {lang === 'ru'
                    ? 'Загрузить тест: 933532 Абдул Рашид (PDF)'
                    : 'Örnek Test Yükle: 933532 Абдул Рашид (PDF)'}
                </span>
              </button>
              <button
                onClick={handleLoadFromDatabase}
                disabled={isLoadingDb}
                className="h-9 px-4 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-bold text-xs inline-flex items-center gap-2 cursor-pointer transition"
              >
                <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>
                  {lang === 'ru'
                    ? 'Загрузить специалистов ВКС из базы'
                    : 'Veritabanından VKS Uzmanlarını Yükle'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[540px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 border-b border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-semibold uppercase text-[11px] tracking-wider whitespace-nowrap">
                <tr>
                  <th className="py-2.5 px-2.5 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={
                        workers.some((w) => !isWorkerAlreadySentToGosuslugi(w)) &&
                        workers
                          .filter((w) => !isWorkerAlreadySentToGosuslugi(w))
                          .every((w) => w.selected)
                      }
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-600 accent-emerald-600 cursor-pointer"
                      title={
                        lang === 'ru'
                          ? 'Выбрать все неотправленные строки'
                          : 'Henüz gönderilmemiş tüm satırları seç/kaldır'
                      }
                    />
                  </th>
                  <th className="py-2.5 px-2 w-9 text-center font-semibold">№</th>
                  <th className="py-2.5 px-2.5 min-w-[205px]">Статус ГУ / № Заявления</th>
                  <th className="py-2.5 px-2.5">Код / Sicil</th>
                  <th className="py-2.5 px-2.5 min-w-[210px]">ФИО (Кириллица)</th>
                  <th className="py-2.5 px-2.5 min-w-[125px]">Гражданство / Д.Р.</th>
                  <th className="py-2.5 px-2.5 min-w-[175px]">Паспорт (Серия № / Выдан)</th>
                  <th className="py-2.5 px-2.5">ИНН</th>
                  <th className="py-2.5 px-2.5 min-w-[165px]">Разрешение ВКС (РНР / Бланк)</th>
                  <th className="py-2.5 px-3 min-w-[185px]">Договор (Закл. / Начало / Конец)</th>
                  <th className="py-2.5 px-2.5 min-w-[155px]">Период ЗП / Индекс</th>
                  <th className="py-2.5 px-2.5 min-w-[215px]">Выплаты (1–3 мес. / Всего ₽)</th>
                  <th className="py-2.5 px-2.5 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/90 dark:divide-slate-800/80 text-[12px] font-normal text-slate-900 dark:text-slate-100">
                {filteredWorkers.map((w, idx) => {
                  const codeKey = w.code || w.sicil;
                  const rowVal = validationMap[w.id] || {
                    isValid: true,
                    issues: [],
                    fieldErrors: {},
                  };
                  const isRowValid = rowVal.isValid;
                  const fErr = rowVal.fieldErrors;

                  const isProcessing =
                    w.status === 'processing' ||
                    (isRunning &&
                      ((bridgeStatus.active_worker_code &&
                        codeKey === bridgeStatus.active_worker_code) ||
                        (bridgeStatus.active_worker_name &&
                          `${w.lastName} ${w.firstName}`
                            .toLowerCase()
                            .includes(bridgeStatus.active_worker_name.toLowerCase()))));

                  const isEditing = editingRowId === w.id;

                  return (
                    <tr
                      key={w.id}
                      className={`transition-colors align-top ${
                        isProcessing
                          ? 'bg-teal-50/90 dark:bg-teal-950/50 border-l-4 border-l-emerald-500 font-semibold'
                          : !isRowValid
                          ? 'bg-rose-50/60 dark:bg-rose-950/25 border-l-4 border-l-rose-500'
                          : w.status === 'success' || isWorkerAlreadySentToGosuslugi(w)
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                          : w.status === 'error'
                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={w.selected}
                          onChange={() => handleToggleWorker(w.id)}
                          className="rounded border-slate-300 dark:border-slate-600 accent-emerald-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600 dark:text-slate-400 font-normal whitespace-nowrap">
                        {idx + 1}
                      </td>

                      {/* Status & Application Number Column (Max 3 lines) */}
                      <td
                        className="py-2.5 px-2.5 min-w-[205px] max-w-[245px]"
                        title={
                          !isRowValid
                            ? rowVal.issues.map((iss) => (lang === 'ru' ? iss.ru : iss.tr)).join('\n')
                            : w.pdfFilename || undefined
                        }
                      >
                        {isProcessing && isWaitingManual ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500 text-white shadow-xs animate-pulse whitespace-nowrap">
                            <AlertCircle className="w-3 h-3" />
                            {lang === 'ru' ? 'Ручная правка...' : 'Manuel Düzeltme...'}
                          </span>
                        ) : isProcessing ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-600 text-white shadow-xs animate-pulse whitespace-nowrap">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {lang === 'ru' ? 'Заполняется...' : 'İşleniyor...'}
                          </span>
                        ) : w.status === 'success' || w.applicationNo || isWorkerAlreadySentToGosuslugi(w) ? (
                          <div className="space-y-0.5 leading-tight">
                            {w.gosuslugiStatus &&
                            /отказан|возврат|не оказан/i.test(w.gosuslugiStatus) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-rose-100 dark:bg-rose-500/25 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200 whitespace-nowrap">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {w.gosuslugiStatus}
                              </span>
                            ) : !w.pdfFilename ||
                              (w.gosuslugiStatus && /PDF не скачан/i.test(w.gosuslugiStatus)) ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-sky-100 dark:bg-sky-500/20 border border-sky-300 dark:border-sky-500/40 text-sky-900 dark:text-sky-200 whitespace-nowrap"
                                title={
                                  lang === 'ru'
                                    ? 'Заявление отправлено в Госуслуги, но PDF-квитанция ещё не скачана. Нажмите «3. Проверить статусы ГУ», чтобы скачать PDF.'
                                    : "Bildirim Gosuslugi'ye gönderildi ancak PDF henüz alınmadı. PDF'i indirmek için «3. Başvuru Durumlarını Sorgula» butonunu kullanabilirsiniz."
                                }
                              >
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                {lang === 'ru'
                                  ? 'Отправлено (PDF не скачан)'
                                  : 'Gönderildi (PDF Alınamadı)'}
                              </span>
                            ) : w.gosuslugiStatus &&
                              /промежуточн|обработк|зарегистрирован/i.test(w.gosuslugiStatus) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 whitespace-nowrap">
                                <RefreshCw className="w-3 h-3 shrink-0" />
                                {w.gosuslugiStatus}
                              </span>
                            ) : w.gosuslugiStatus &&
                              /оказан|исполнен|принят/i.test(w.gosuslugiStatus) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-100 dark:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                {w.gosuslugiStatus}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                {w.gosuslugiStatus || (lang === 'ru' ? 'Отправлено' : 'Gönderildi')}
                              </span>
                            )}
                            {w.applicationNo && (
                              <div className="text-[11px] font-medium text-indigo-900 dark:text-indigo-300 truncate">
                                № {w.applicationNo}
                              </div>
                            )}
                            {w.pdfFilename && (
                              <a
                                href={`/api/gosuslugi/pdf?file=${encodeURIComponent(
                                  w.pdfFilename
                                )}&appNo=${encodeURIComponent(
                                  w.applicationNo || ''
                                )}&sicil=${encodeURIComponent(w.sicil || w.code || '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-800 dark:text-teal-300 hover:underline truncate max-w-[220px]"
                                title={
                                  lang === 'ru'
                                    ? `Скачать PDF с сервера: ${w.pdfFilename}`
                                    : `PDF'i sunucudan indir: ${w.pdfFilename}`
                                }
                              >
                                <Download className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">PDF: {w.pdfFilename}</span>
                              </a>
                            )}
                          </div>
                        ) : w.status === 'error' ? (
                          <div className="space-y-0.5 leading-tight">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300 whitespace-nowrap">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {lang === 'ru' ? 'Ошибка ЕПГУ (Готов к повтору)' : 'Gosuslugi Hatası (Tekrar Gönderime Hazır)'}
                            </span>
                            {w.gosuslugiStatus && (
                              <div
                                className="text-[9.5px] text-rose-600 dark:text-rose-300 truncate max-w-[225px]"
                                title={w.gosuslugiStatus}
                              >
                                {w.gosuslugiStatus}
                              </div>
                            )}
                          </div>
                        ) : !isRowValid ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-100 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 whitespace-nowrap">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {lang === 'ru'
                                ? `Готов (предупр.: ${rowVal.issues.length})`
                                : `Gönderime Hazır (Uyarı: ${rowVal.issues.length})`}
                            </span>
                            <ul className="text-[10px] leading-tight text-amber-800 dark:text-amber-300 space-y-0.5 pl-0.5">
                              {rowVal.issues.slice(0, 2).map((iss, iIdx) => (
                                <li key={iIdx} className="flex items-center gap-1 truncate max-w-[220px]">
                                  <span className="text-amber-600 font-bold shrink-0">•</span>
                                  <span className="truncate">
                                    {lang === 'ru' ? iss.ru : iss.tr}
                                    {iIdx === 1 && rowVal.issues.length > 2
                                      ? ` (+${rowVal.issues.length - 2})`
                                      : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" />
                            {lang === 'ru' ? 'Готов к отправке' : 'İşleme Hazır'}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-2.5 text-teal-800 dark:text-teal-300 font-medium whitespace-nowrap">
                        {w.code || w.sicil}
                      </td>

                      {/* Full Name & Position (Max 3 lines) */}
                      <td className="py-2.5 px-2.5 font-medium text-slate-950 dark:text-white min-w-[210px] max-w-[250px]">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[150px]">
                            <input
                              value={w.lastName}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'lastName', e.target.value)
                              }
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.name
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                              placeholder="Фамилия (или Нет)"
                            />
                            <input
                              value={w.firstName}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'firstName', e.target.value)
                              }
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.name
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                              placeholder="Имя"
                            />
                            <input
                              value={w.middleName}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'middleName', e.target.value)
                              }
                              className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                              placeholder="Отчество (или НЕТ)"
                            />
                          </div>
                        ) : (
                          <div className="flex items-start gap-1">
                            {isProcessing && (
                              <ChevronRight className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            )}
                            <span
                              className={`line-clamp-2 leading-snug ${
                                fErr.name ? 'text-rose-600 dark:text-rose-400' : ''
                              }`}
                              title={`${w.lastName || '—'} ${w.firstName || '—'} ${w.middleName || ''}`}
                            >
                              {w.lastName || '—'} {w.firstName || '—'}{' '}
                              <span className="text-slate-400 font-normal">{w.middleName}</span>
                            </span>
                          </div>
                        )}
                        <div
                          className="text-[10.5px] text-slate-700 dark:text-slate-300 font-normal mt-0.5 truncate max-w-[235px]"
                          title={w.position}
                        >
                          {w.position}
                        </div>
                      </td>

                      {/* Citizenship, Place of Birth & BirthDate (2 lines) */}
                      <td className="py-2.5 px-2.5 min-w-[125px] whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[130px]">
                            <input
                              value={w.citizenship}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'citizenship', e.target.value)
                              }
                              placeholder="Гражданство"
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.citizenship
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                            <input
                              value={w.placeOfBirth}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'placeOfBirth', e.target.value)
                              }
                              placeholder="Место рождения"
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.citizenship
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                            <input
                              value={w.birthDate}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'birthDate', e.target.value)
                              }
                              placeholder="ДД.ММ.ГГГГ"
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.birthDate
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                          </div>
                        ) : (
                          <>
                            <div
                              className={`font-medium truncate max-w-[140px] ${
                                fErr.citizenship
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                              title={w.citizenship}
                            >
                              {w.citizenship || '—'}
                            </div>
                            <div
                              className={`text-[11px] whitespace-nowrap ${
                                fErr.birthDate
                                  ? 'text-rose-600 dark:text-rose-400 font-medium underline decoration-wavy'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {w.birthDate || (lang === 'ru' ? 'Нет Д.Р.' : 'D.T. Yok')}
                            </div>
                          </>
                        )}
                      </td>

                      {/* Passport (2 lines) */}
                      <td className="py-2.5 px-2.5 min-w-[175px] whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[145px]">
                            <div className="flex gap-1">
                              <input
                                value={w.passportSeries}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'passportSeries', e.target.value)
                                }
                                placeholder="Серия"
                                className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                              />
                              <input
                                value={w.passportNumber}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'passportNumber', e.target.value)
                                }
                                placeholder="Номер паспорта"
                                className={`flex-1 px-1.5 py-0.5 rounded border text-xs ${
                                  fErr.passport && !w.passportNumber
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                            </div>
                            <input
                              value={w.passportIssueDate}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'passportIssueDate', e.target.value)
                              }
                              placeholder="Дата выдачи (ДД.ММ.ГГГГ)"
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.passport
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                            <input
                              value={w.passportIssuedBy}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'passportIssuedBy', e.target.value)
                              }
                              placeholder="Кем выдан"
                              className={`w-full px-1.5 py-0.5 rounded border text-xs ${
                                fErr.passport && !w.passportIssuedBy
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                          </div>
                        ) : (
                          <>
                            <div
                              className={`font-medium whitespace-nowrap ${
                                fErr.passport
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {w.passportSeries} {w.passportNumber || '—'}
                            </div>
                            <div
                              className={`text-[10.5px] truncate max-w-[180px] font-normal ${
                                fErr.passport ? 'text-rose-600 font-medium' : 'text-slate-700 dark:text-slate-300'
                              }`}
                              title={`${w.passportIssueDate} ${w.passportIssuedBy}`}
                            >
                              {w.passportIssueDate || '—'} • {w.passportIssuedBy || '—'}
                            </div>
                          </>
                        )}
                      </td>

                      {/* INN (1 line) */}
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            value={w.inn}
                            onChange={(e) => handleUpdateWorkerField(w.id, 'inn', e.target.value)}
                            placeholder="12-значный ИНН"
                            className={`w-28 px-1.5 py-0.5 rounded border text-xs ${
                              fErr.inn
                                ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                            }`}
                          />
                        ) : (
                          <span
                            className={
                              fErr.inn
                                ? 'text-rose-600 dark:text-rose-400 font-medium underline decoration-wavy'
                                : 'text-slate-900 dark:text-slate-100 font-normal'
                            }
                            title={fErr.inn ? fErr.inn.join('; ') : w.inn}
                          >
                            {w.inn || 'Нет ИНН'}
                          </span>
                        )}
                      </td>

                      {/* RNR & Blank (2 lines, widened) */}
                      <td className="py-2.5 px-2.5 min-w-[165px] whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[155px]">
                            <div className="flex gap-1">
                              <input
                                value={w.rnrSeries}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'rnrSeries', e.target.value)
                                }
                                placeholder="Сер. РНР (77)"
                                className={`w-14 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.rnr && !w.rnrSeries
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                              <input
                                value={w.rnrNumber}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'rnrNumber', e.target.value)
                                }
                                placeholder="Номер РНР"
                                className={`flex-1 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.rnr && !w.rnrNumber
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                            </div>
                            <div className="flex gap-1">
                              <input
                                value={w.blankSeries}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'blankSeries', e.target.value)
                                }
                                placeholder="Бланк (ВВ)"
                                className={`w-14 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.rnr && !w.blankSeries
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                              <input
                                value={w.blankNumber}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'blankNumber', e.target.value)
                                }
                                placeholder="№ бланка"
                                className={`flex-1 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.rnr && !w.blankNumber
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                            </div>
                            <input
                              value={w.rnrIssueDate}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'rnrIssueDate', e.target.value)
                              }
                              placeholder="Дата выдачи РНР"
                              className="w-full px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[10.5px]"
                            />
                          </div>
                        ) : (
                          <>
                            <div
                              className={`font-medium whitespace-nowrap ${
                                fErr.rnr
                                  ? 'text-rose-600 dark:text-rose-400 font-medium'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              РНР: {w.rnrSeries || '—'} {w.rnrNumber || '—'}
                            </div>
                            <div
                              className={`text-[10.5px] whitespace-nowrap font-normal ${
                                fErr.rnr ? 'text-rose-600 font-medium' : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              Бланк: {w.blankSeries || '—'} {w.blankNumber || '—'}
                            </div>
                          </>
                        )}
                      </td>

                      {/* Contract Dates: Widened column, strictly 3 lines (Закл / С / По) instead of 6 lines */}
                      <td className="py-2.5 px-3 min-w-[185px] whitespace-nowrap text-[10.5px] text-slate-600 dark:text-slate-400">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[155px]">
                            <div className="flex items-center gap-1">
                              <span className="w-10 text-[9.5px] text-slate-400">Закл:</span>
                              <input
                                value={w.contractDate}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'contractDate', e.target.value)
                                }
                                placeholder="ДД.ММ.ГГГГ"
                                className={`flex-1 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.contract
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="w-10 text-[9.5px] text-slate-400">Нач:</span>
                              <input
                                value={w.contractStartDate}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'contractStartDate', e.target.value)
                                }
                                placeholder="ДД.ММ.ГГГГ"
                                className={`flex-1 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.contract
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="w-10 text-[9.5px] text-slate-400">Кон:</span>
                              <input
                                value={w.contractEndDate}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'contractEndDate', e.target.value)
                                }
                                placeholder="ДД.ММ.ГГГГ"
                                className={`flex-1 px-1 py-0.5 rounded border text-[10.5px] ${
                                  fErr.contract
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                }`}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`leading-snug space-y-0.5 font-normal ${
                              fErr.contract ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                            }`}
                          >
                            <div className="whitespace-nowrap">
                              Закл.:{' '}
                              <span className="text-slate-900 dark:text-slate-100 font-medium">
                                {w.contractDate || '—'}
                              </span>
                            </div>
                            <div className="whitespace-nowrap">
                              С: <span className="text-slate-800 dark:text-slate-200">{w.contractStartDate || '—'}</span>
                            </div>
                            <div className="whitespace-nowrap">
                              По:{' '}
                              <span
                                className={
                                  fErr.contract
                                    ? 'underline decoration-wavy text-rose-600 dark:text-rose-400 font-medium'
                                    : !w.contractEndDate
                                    ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                    : 'text-slate-800 dark:text-slate-200'
                                }
                              >
                                {w.contractEndDate ||
                                  (lang === 'ru' ? 'Бессрочный ✓' : 'Бессрочный (Süresiz) ✓')}
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Salary Period & Postal Code (2 lines) */}
                      <td className="py-2.5 px-2.5 min-w-[155px] text-[10.5px] whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[115px]">
                            <input
                              value={w.periodStart}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'periodStart', e.target.value)
                              }
                              placeholder="Начало периода"
                              className={`w-full px-1 py-0.5 rounded border text-[10px] ${
                                fErr.period
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                            <input
                              value={w.periodEnd}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'periodEnd', e.target.value)
                              }
                              placeholder="Конец периода"
                              className={`w-full px-1 py-0.5 rounded border text-[10px] ${
                                fErr.period
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                            <input
                              value={w.postalCode}
                              onChange={(e) =>
                                handleUpdateWorkerField(w.id, 'postalCode', e.target.value)
                              }
                              placeholder="Индекс (6 цифр)"
                              className={`w-full px-1 py-0.5 rounded border text-[10px] ${
                                fErr.address
                                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            />
                          </div>
                        ) : (
                          <>
                            <div
                              className={`font-medium text-slate-900 dark:text-slate-100 ${
                                fErr.period ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                              }`}
                            >
                              {w.periodStart} — {w.periodEnd}
                            </div>
                            {w.exitDate && (
                              <div className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                {lang === 'ru' ? `Уволен: ${w.exitDate}` : `Çıkış: ${w.exitDate}`}
                              </div>
                            )}
                            <div
                              className={`text-[10.5px] font-normal ${
                                fErr.address
                                  ? 'text-rose-600 dark:text-rose-400 font-medium'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              Индекс: {w.postalCode || '—'}
                            </div>
                          </>
                        )}
                      </td>

                      {/* Salary Amount (Monthly 1-месяц, 2-месяц, 3-месяц + Total) */}
                      <td className="py-2 px-2.5 font-normal text-emerald-800 dark:text-emerald-300 whitespace-nowrap min-w-[215px]">
                        {isEditing ? (
                          <div className="flex flex-col gap-1 min-w-[185px]">
                            <div className="flex items-center gap-1">
                              <span className="w-11 text-[9.5px] text-slate-500 dark:text-slate-400 font-normal">1-мес:</span>
                              <input
                                value={w.month1Salary || ''}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'month1Salary', e.target.value)
                                }
                                placeholder="0.00"
                                className="flex-1 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-[10.5px]"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="w-11 text-[9.5px] text-slate-500 dark:text-slate-400 font-normal">2-мес:</span>
                              <input
                                value={w.month2Salary || ''}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'month2Salary', e.target.value)
                                }
                                placeholder="0.00"
                                className="flex-1 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-[10.5px]"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="w-11 text-[9.5px] text-slate-500 dark:text-slate-400 font-normal">3-мес:</span>
                              <input
                                value={w.month3Salary || ''}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'month3Salary', e.target.value)
                                }
                                placeholder="0.00"
                                className="flex-1 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-[10.5px]"
                              />
                            </div>
                            <div className="flex items-center gap-1 pt-0.5 border-t border-slate-200 dark:border-slate-700">
                              <span className="w-11 text-[9.5px] text-emerald-700 dark:text-emerald-400 font-medium">Всего:</span>
                              <input
                                value={w.salaryAmount}
                                onChange={(e) =>
                                  handleUpdateWorkerField(w.id, 'salaryAmount', e.target.value)
                                }
                                className={`flex-1 px-1.5 py-0.5 rounded border text-[10.5px] ${
                                  fErr.salary
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700'
                                    : 'border-emerald-500 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 font-medium'
                                }`}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5 leading-tight">
                            {buildWorkerMonthlyPeriods(w, periodStart, periodEnd).map((mp) => (
                              <div
                                key={mp.monthIdx}
                                className="text-[10.5px] font-normal text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"
                              >
                                <span className="text-slate-500 dark:text-slate-400">
                                  {mp.monthIdx}-мес ({mp.start.slice(0, 5)}–{mp.end.slice(0, 5)}):
                                </span>
                                <span className="font-normal text-slate-900 dark:text-slate-100">
                                  {Number(mp.amount).toLocaleString('ru-RU', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}{' '}
                                  ₽
                                </span>
                              </div>
                            ))}
                            <div
                              className={`text-[11.5px] pt-0.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 ${
                                fErr.salary ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                              }`}
                            >
                              <span className="text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-300 font-medium">
                                {lang === 'ru' ? 'Итого:' : 'Toplam:'}
                              </span>
                              <span className="font-medium text-emerald-800 dark:text-emerald-300">
                                {w.salaryAmount
                                  ? `${Number(
                                      String(w.salaryAmount).replace(',', '.')
                                    ).toLocaleString('ru-RU', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })} ₽`
                                  : '0,00 ₽'}
                              </span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Row Actions: Edit, Reset Error, or Send Single Row */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEditingRowId(null);
                                saveWorkerRowToMasterList(w);
                                showNotice(
                                  'success',
                                  lang === 'ru'
                                    ? `Изменения сотрудника ${w.sicil} сохранены в центральный список на сервере!`
                                    : `${w.sicil} personelinin düzeltilen verileri merkezi sunucu listesine kaydedildi!`
                                );
                              } else {
                                setEditingRowId(w.id);
                              }
                            }}
                            className={`p-1.5 rounded-lg border cursor-pointer transition ${
                              isEditing
                                ? 'border-emerald-500 bg-emerald-600 text-white'
                                : !isRowValid
                                ? 'border-rose-300 dark:border-rose-700 bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-200 hover:bg-rose-200'
                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                            title={
                              isEditing
                                ? lang === 'ru'
                                  ? 'Готово (сохранить строку на сервере и сбросить ошибку)'
                                  : 'Düzenlemeyi Tamamla & Merkezi Sunucuya Kaydet'
                                : lang === 'ru'
                                ? 'Редактировать поля строки'
                                : 'Satırdaki Hataları Düzenle'
                            }
                          >
                            {isEditing ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Edit3 className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {w.status === 'error' && (
                            <button
                              onClick={() => handleRetryErrors('selected', w)}
                              disabled={isRetryingErrors}
                              className="px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-sans font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer transition"
                              title={
                                lang === 'ru'
                                  ? 'Сбросить статус Ошибка и вернуть в очередь'
                                  : 'Hata (Ошибка) statüsünü sıfırla ve tekrar sıraya al'
                              }
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>{lang === 'ru' ? 'Сброс' : 'Sıraya Al'}</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleStartRobot(1, w)}
                            disabled={isRunning}
                            className="px-2.5 py-1 rounded-lg border font-sans font-bold text-[10.5px] inline-flex items-center gap-1 transition bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 cursor-pointer disabled:opacity-50"
                            title={
                              lang === 'ru'
                                ? 'Отправить только эту строку в Госуслуги'
                                : "Sadece bu satırı Gosuslugi'ye gönder"
                            }
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{lang === 'ru' ? 'Старт' : 'Başlat'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Offline Helper Banner + 1-Click Agent ZIP Download for HR Managers */}
      {!isOnline && (
        <div className="p-3.5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200/90 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                {lang === 'ru' ? (
                  <>
                    <strong>Локальный агент Госуслуг не запущен на этом ПК.</strong> Скачайте архив
                    агента и дважды нажмите{' '}
                    <code className="bg-amber-100/90 dark:bg-black/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-mono text-amber-900 dark:text-amber-300 font-semibold">
                      START_PONDERA_RPA_BRIDGE.bat
                    </code>
                  </>
                ) : (
                  <>
                    <strong>Bu bilgisayarda Gosuslugi Yerel Ajanı açık değil.</strong> Ajan paketini
                    indirip klasöre çıkarın ve{' '}
                    <code className="bg-amber-100/90 dark:bg-black/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-mono text-amber-900 dark:text-amber-300 font-semibold">
                      START_PONDERA_RPA_BRIDGE.bat
                    </code>{' '}
                    dosyasına çift tıklayın.
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/Pondera_Gosuslugi_Agent.zip"
                download="Pondera_Gosuslugi_Agent.zip"
                className="h-8 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] inline-flex items-center gap-1.5 shadow-2xs transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {lang === 'ru'
                    ? 'Скачать Агент для ПК (.zip)'
                    : 'Bilgisayar İçin RPA Ajanını İndir (.zip)'}
                </span>
              </a>

              <button
                onClick={() => setShowAgentGuide(!showAgentGuide)}
                className="h-8 px-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/40 hover:bg-amber-100/60 text-amber-900 dark:text-amber-100 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Как запустить?' : 'Nasıl Çalıştırılır?'}</span>
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    'cd c:\\Users\\nemat\\HR_Pondera\\scripts\\gosuslugi_rpa && START_PONDERA_RPA_BRIDGE.bat'
                  );
                  setCopiedCmd(true);
                  setTimeout(() => setCopiedCmd(false), 2500);
                }}
                className="h-8 px-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-900/40 hover:bg-amber-100/60 text-amber-900 dark:text-amber-100 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer transition"
                title={lang === 'ru' ? 'Скопировать команду' : 'Komutu Kopyala'}
              >
                {copiedCmd ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {showAgentGuide && (
            <div className="pt-2.5 border-t border-amber-200/80 dark:border-amber-800/60 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-800/50">
                <strong className="block text-amber-900 dark:text-amber-300 mb-0.5">
                  {lang === 'ru'
                    ? 'Шаг 1: Скачайте и распакуйте'
                    : 'Adım 1: İndirin ve Klasöre Çıkarın'}
                </strong>
                <span className="text-slate-600 dark:text-slate-300">
                  {lang === 'ru'
                    ? 'Скачайте Pondera_Gosuslugi_Agent.zip на рабочий стол. Если запускаете впервые — дважды нажмите 0_INSTALL_FIRST_TIME.bat.'
                    : 'Pondera_Gosuslugi_Agent.zip dosyasını masaüstüne çıkarın. İlk kez kuruyorsanız 0_INSTALL_FIRST_TIME.bat dosyasına çift tıklayın.'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-800/50">
                <strong className="block text-amber-900 dark:text-amber-300 mb-0.5">
                  {lang === 'ru'
                    ? 'Шаг 2: Дважды нажмите батник'
                    : 'Adım 2: Çift Tıklayıp Açık Bırakın'}
                </strong>
                <span className="text-slate-600 dark:text-slate-300">
                  {lang === 'ru'
                    ? 'Дважды нажмите START_PONDERA_RPA_BRIDGE.bat. Откроется окно моста, а здесь на сайте статус станет зеленым «RPA Агент Онлайн».'
                    : 'START_PONDERA_RPA_BRIDGE.bat dosyasına çift tıklayın. Pencere açık kaldığı sürece bu ekranda yeşil "RPA Ajanı Aktif" yazacaktır.'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-800/50">
                <strong className="block text-amber-900 dark:text-amber-300 mb-0.5">
                  {lang === 'ru'
                    ? 'Шаг 3: Войдите в Госуслуги и отправьте'
                    : 'Adım 3: Gosuslugi Girişi & Gönderim'}
                </strong>
                <span className="text-slate-600 dark:text-slate-300">
                  {lang === 'ru'
                    ? 'Нажмите «1. Открыть Chrome», войдите в свой аккаунт Госуслуг (с ЭЦП/Рутокен) и нажмите «2. Отправить в Госуслуги»!'
                    : '"1. Chrome Aç" butonuna basıp kendi E-İmza/Rutoken\'ınızla Gosuslugi\'ye girin ve "2. Gönder" butonuna basın!'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Execution Log Panel */}
      <div className="rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono">
          <div className="flex items-center gap-2 font-sans font-bold text-slate-700 dark:text-slate-200">
            <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {lang === 'ru'
                ? 'Журнал выполнения робота Госуслуг (Live Log — Шаги 1–16 из 11.docx)'
                : 'Gosuslugi Robotu Canlı İşlem Günlüğü (Live Log — 11.docx Adım 1–16)'}
            </span>
          </div>
          {isRunning && (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>
                {lang === 'ru' ? 'Заполнение формы ЕПГУ...' : 'Gosuslugi formu dolduruluyor...'}
              </span>
            </div>
          )}
        </div>

        <div className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto space-y-1 bg-slate-50/50 dark:bg-slate-950/70">
          {bridgeStatus.logs.length === 0 ? (
            <div className="text-slate-400 dark:text-slate-500 italic">
              {lang === 'ru'
                ? 'Журнал пуст. Загрузите Excel-файл ВКС или список из базы и нажмите «Отправить в Госуслуги».'
                : 'Günlük boş. VKS Excel dosyasını yükleyin veya veritabanından çekip "Gosuslugi\'ye Gönder" butonuna tıklayın.'}
            </div>
          ) : (
            bridgeStatus.logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2 leading-snug">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">[{log.time}]</span>
                <span
                  className={
                    log.text.includes('SUCCESS')
                      ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                      : log.text.includes('Error') || log.text.includes('ERROR')
                      ? 'text-rose-600 dark:text-rose-400 font-bold'
                      : log.text.includes('Starting Gosuslugi VKS')
                      ? 'text-teal-700 dark:text-teal-300 font-bold'
                      : 'text-slate-700 dark:text-slate-300'
                  }
                >
                  {log.text}
                </span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
        </>
      )}

      {/* FLOATING AI/RPA ASSISTANT ROBOT COMPANION (Zero Layout Space, Bottom-Right Like Website AI Chatbot Launchers) */}
      <div className="fixed bottom-5 right-6 z-40 flex flex-col items-end pointer-events-none select-none">
        {/* Interactive Popup Card when Robot is Clicked */}
        {showRobotWidget && (
          <div className="mb-3 w-72 sm:w-80 rounded-2xl bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-md border border-emerald-200/90 dark:border-emerald-500/40 shadow-2xl p-3.5 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {lang === 'ru' ? 'Робот-ассистент Госуслуги' : 'Gosuslugi RPA Robot Asistanı'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowRobotWidget(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1.5 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  {lang === 'ru' ? 'Мост RPA (8088):' : 'RPA Köprüsü (8088):'}
                </span>
                <span className={`font-bold ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isOnline
                    ? lang === 'ru' ? '● Активен' : '● Aktif (Bağlı)'
                    : lang === 'ru' ? '○ Офлайн' : '○ Kapalı'}
                </span>
              </div>

              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  {lang === 'ru' ? 'Браузер Chrome (9222):' : 'Chrome Oturumu (9222):'}
                </span>
                <span className={`font-bold ${bridgeStatus.chrome_ready ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {bridgeStatus.chrome_ready
                    ? lang === 'ru' ? '● Готов' : '● Hazır'
                    : lang === 'ru' ? '○ Не открыт' : '○ Açık Değil'}
                </span>
              </div>

              <div className="px-2.5 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 text-slate-700 dark:text-slate-200 leading-snug">
                {isRunning ? (
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    ⚡ {bridgeStatus.active_worker_name || (lang === 'ru' ? 'Заполнение формы ЕПГУ...' : 'Gosuslugi formu dolduruluyor...')}
                  </span>
                ) : bridgeStatus.logs.length > 0 ? (
                  <span className="font-mono text-[10px] line-clamp-2">
                    {bridgeStatus.logs[bridgeStatus.logs.length - 1]?.text}
                  </span>
                ) : (
                  <span>
                    {lang === 'ru'
                      ? 'Робот готов автоматически заполнять формы МВД (ВКС ЗП и Увольнение) на портале Госуслуг.'
                      : 'Robot; Gosuslugi MVD (VKS Maaş ve İşten Çıkış) formlarını otomatik doldurmaya hazır.'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleOpenChrome}
                  disabled={isLaunchingChrome}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {lang === 'ru' ? '1. Открыть Chrome' : '1. Chrome Aç (9222)'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAgentGuide(true);
                    setShowRobotWidget(false);
                  }}
                  className="py-1.5 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px] transition cursor-pointer"
                >
                  {lang === 'ru' ? 'Инструкция' : 'Kurulum'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Robot Launcher + Speech Bubble */}
        <div className="flex items-center gap-2.5 pointer-events-auto group">
          {/* Speech Bubble Pill */}
          <button
            type="button"
            onClick={() => setShowRobotWidget((prev) => !prev)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-emerald-200/90 dark:border-emerald-500/40 shadow-lg text-[11px] font-bold text-slate-800 dark:text-slate-100 hover:border-emerald-400 transition-all cursor-pointer"
          >
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-500 animate-ping' : isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>
              {isRunning
                ? lang === 'ru' ? 'Робот заполняет ЕПГУ...' : 'Robot Formu Dolduruyor...'
                : isOnline
                ? lang === 'ru' ? 'RPA Робот Готов' : 'RPA Robotu Hazır'
                : lang === 'ru' ? 'RPA Робот' : 'Gosuslugi RPA Robotu'}
            </span>
          </button>

          {/* 3D-Style Animated Roaming/Floating AI Robot Avatar */}
          <button
            type="button"
            onClick={() => setShowRobotWidget((prev) => !prev)}
            title={lang === 'ru' ? 'Открыть ассистента Робота Госуслуг' : 'Gosuslugi RPA Robot Asistanını Aç'}
            className="relative w-16 h-16 sm:w-18 sm:h-18 flex items-center justify-center cursor-pointer focus:outline-none rpa-bot-roam"
          >
            {/* Ambient Glow Behind Robot */}
            <span className="absolute inset-1 rounded-full bg-gradient-to-tr from-emerald-500/25 via-sky-500/20 to-teal-400/25 blur-md group-hover:scale-110 transition-transform" />

            <svg
              viewBox="0 0 96 96"
              fill="none"
              className="w-full h-full drop-shadow-[0_8px_16px_rgba(16,185,129,0.32)]"
              aria-label="Floating Gosuslugi RPA Robot"
            >
              <defs>
                <linearGradient id="botShell3D" x1="20" y1="14" x2="76" y2="74" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="55%" stopColor="#e0f2fe" />
                  <stop offset="100%" stopColor="#a7f3d0" />
                </linearGradient>
                <linearGradient id="botAccentGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0066B3" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="botVisorGrad" x1="28" y1="24" x2="68" y2="44" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#1e293b" />
                </linearGradient>
              </defs>

              {/* Hover Jet Thruster Glow Ring at Bottom */}
              <ellipse
                cx="48"
                cy="86"
                rx="16"
                ry="4"
                fill="#10b981"
                fillOpacity="0.45"
                className="rpa-thruster-pulse"
              />
              <ellipse
                cx="48"
                cy="84"
                rx="9"
                ry="2.5"
                fill="#38bdf8"
                className="rpa-thruster-pulse"
              />

              {/* Antenna Radar Ping */}
              <circle cx="48" cy="10" r="4.5" fill="#10b981" className="rpa-antenna-ping" />
              <line x1="48" y1="11" x2="48" y2="19" stroke="#0066B3" strokeWidth="3" strokeLinecap="round" />
              <circle cx="48" cy="10" r="3.5" fill="#0066B3" />
              <circle cx="47" cy="9" r="1.2" fill="#ffffff" />

              {/* Left Floating Arm */}
              <g>
                <rect
                  x="13"
                  y="49"
                  width="9"
                  height="18"
                  rx="4.5"
                  transform="rotate(14 13 49)"
                  fill="url(#botShell3D)"
                  stroke="#0284c7"
                  strokeWidth="1.5"
                />
                <circle cx="15" cy="66" r="3.2" fill="#0066B3" />
              </g>

              {/* Right Waving Arm (Animated) */}
              <g className="rpa-wave-arm">
                <rect
                  x="73"
                  y="42"
                  width="9"
                  height="19"
                  rx="4.5"
                  transform="rotate(-28 73 42)"
                  fill="url(#botShell3D)"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                <circle cx="71" cy="40" r="3.5" fill="#10b981" />
              </g>

              {/* Robot Floating Torso / Body */}
              <path
                d="M31 50C31 46.6863 33.6863 44 37 44H59C62.3137 44 65 46.6863 65 50V63C65 71.2843 58.2843 78 50 78H46C37.7157 78 31 71.2843 31 63V50Z"
                fill="url(#botShell3D)"
                stroke="url(#botAccentGrad)"
                strokeWidth="2"
              />

              {/* Chest Core Badge (Gosuslugi Blue & Red + Pondera Emerald Ring) */}
              <rect x="38" y="52" width="20" height="12" rx="6" fill="#0f172a" />
              <circle cx="44" cy="58" r="2.8" fill="#38bdf8" />
              <circle cx="52" cy="58" r="2.8" fill="#fb7185" />
              <path d="M40 69H56" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />

              {/* Side Head Headphones / Ears */}
              <rect x="18" y="27" width="5" height="13" rx="2.5" fill="#0066B3" />
              <rect x="73" y="27" width="5" height="13" rx="2.5" fill="#EE2F53" />

              {/* Robot 3D Glossy Head */}
              <rect
                x="22"
                y="18"
                width="52"
                height="30"
                rx="14"
                fill="url(#botShell3D)"
                stroke="url(#botAccentGrad)"
                strokeWidth="2.2"
              />
              {/* Head Gloss Highlight */}
              <path
                d="M32 22H64"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeOpacity="0.9"
              />

              {/* Cyber Face Visor Screen */}
              <rect x="28" y="24" width="40" height="18" rx="9" fill="url(#botVisorGrad)" />

              {/* Animated Scanning & Blinking Eyes + Happy Cyber Smile */}
              <g className="rpa-eye-scan">
                <g className="rpa-eye-blink">
                  {/* Left Glowing Eye */}
                  <circle cx="39" cy="32.5" r="4.2" fill="#38bdf8" />
                  <circle cx="37.8" cy="31.2" r="1.4" fill="#ffffff" />
                  {/* Right Glowing Eye */}
                  <circle cx="57" cy="32.5" r="4.2" fill="#34d399" />
                  <circle cx="55.8" cy="31.2" r="1.4" fill="#ffffff" />
                </g>
                {/* Friendly Robot Smile Arc */}
                <path
                  d="M44 37.5C45.3 39.2 50.7 39.2 52 37.5"
                  stroke="#a7f3d0"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </g>
            </svg>
          </button>
        </div>
      </div>

      {/* MAIL.RU IMAP AUTO-STATUS MODAL */}
      {showMailRuModal && (
        <div className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#111F38] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    {lang === 'ru'
                      ? 'Фоновая проверка статусов Госуслуг через Почту Mail.ru (IMAP)'
                      : 'Mail.ru Üzerinden Arka Planda Otomatik Başvuru (Zayavka) Durum Kontrolü'}
                  </h3>
                  <p className="text-[11px] text-blue-100">
                    {lang === 'ru'
                      ? 'Автоматически проверяет папки «Входящие» и «Спам» по № заявления без входа в Госуслуги'
                      : 'Tarayıcı veya Mail.ru açmadan «Входящие» (Gelen Kutusu) ve «Спам» (Spam) klasörlerini tarar'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMailRuModal(false)}
                className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold cursor-pointer transition"
              >
                {lang === 'ru' ? 'Закрыть ✕' : 'Kapat ✕'}
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Info Alert on how to create Mail.ru App Password */}
              <div className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
                <div className="font-extrabold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>
                    {lang === 'ru'
                      ? 'Как подключить почту Захид бея (Mail.ru) за 20 секунд:'
                      : 'Zahid Bey’in Mail.ru Adresi 20 Saniyede Nasıl Bağlanır?'}
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11.5px] text-slate-600 dark:text-slate-300">
                  <li>
                    {lang === 'ru'
                      ? 'В почте Mail.ru откройте: Настройки (⚙️) → Все настройки → Безопасность → Пароли для внешних приложений.'
                      : 'Mail.ru hesabında: Настройки (Ayarlar ⚙️) → Все настройки → Безопасность (Güvenlik) → Пароли для внешних приложений bölümüne girin.'}
                  </li>
                  <li>
                    {lang === 'ru'
                      ? 'Нажмите «Добавить», введите название (например, Pondera HR) и скопируйте сгенерированный 16-значный пароль.'
                      : '«Добавить» (Ekle) butonuna basıp (örn. Pondera HR) oluşturulan 16 haneli uygulama şifresini kopyalayın.'}
                  </li>
                  <li>
                    {lang === 'ru'
                      ? 'Система автоматически читает письма от Госуслуг как во «Входящих», так и в папке «Спам», сопоставляя № заявления (например, № 8281910041) со списком сотрудников.'
                      : 'Sistem hem «Входящие» (Gelen Kutusu) hem de «Спам» (Spam) klasöründeki Gosuslugi maillerini arka planda okur ve № 8281910041 gibi başvuru numaralarını personellerle otomatik eşleştirir.'}
                  </li>
                </ol>
              </div>

              {/* Credentials Form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900/70 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {lang === 'ru' ? 'Адрес почты Mail.ru' : 'Mail.ru E-posta Adresi'}
                  </label>
                  <input
                    type="email"
                    value={mailRuEmail}
                    onChange={(e) => setMailRuEmail(e.target.value)}
                    placeholder="user@mail.ru"
                    className="w-full h-9 px-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {lang === 'ru'
                      ? 'Пароль для внешнего приложения (IMAP)'
                      : 'Uygulama Şifresi (Пароль внешнего прил.)'}
                  </label>
                  <input
                    type="password"
                    value={mailRuPassword}
                    onChange={(e) => setMailRuPassword(e.target.value)}
                    placeholder={
                      mailRuHasPassword
                        ? lang === 'ru'
                          ? '•••••••• (сохранён в базе)'
                          : '•••••••• (veritabanında kayıtlı)'
                        : lang === 'ru'
                        ? 'Введите 16-значный пароль приложения'
                        : '16 haneli uygulama şifresini girin'
                    }
                    className="w-full h-9 px-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div className="flex flex-col justify-end gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mailRuAutoSync}
                      onChange={async (e) => {
                        const nextVal = e.target.checked;
                        setMailRuAutoSync(nextVal);
                        await fetch('/api/gosuslugi/mail-sync', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: mailRuEmail,
                            app_password: mailRuPassword || undefined,
                            auto_sync_enabled: nextVal,
                          }),
                        }).catch(() => {});
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      {lang === 'ru'
                        ? 'Авто-проверка каждые 3 мин.'
                        : 'Her 3 dk’da bir otomatik kontrol et'}
                    </span>
                  </label>

                  <button
                    onClick={() => handleSyncMailRu(false)}
                    disabled={isSyncingMailRu}
                    className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition shadow-xs"
                  >
                    {isSyncingMailRu ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>
                      {lang === 'ru'
                        ? 'Сохранить и проверить почту сейчас'
                        : 'Kaydet ve Şimdi Mailleri Kontrol Et'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Last sync summary */}
              {(mailRuLastSyncAt || mailRuLastResult) && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 text-xs">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    {mailRuLastResult}
                  </span>
                  {mailRuLastSyncAt && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {lang === 'ru' ? 'Последняя проверка:' : 'Son kontrol:'} {mailRuLastSyncAt}
                    </span>
                  )}
                </div>
              )}

              {/* Table of Gosuslugi Emails parsed from Mail.ru (INBOX + Spam) */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    {lang === 'ru'
                      ? `Уведомления Госуслуг из почты Mail.ru (${mailRuEvents.length})`
                      : `Mail.ru'дан Çekilen Gosuslugi Bildirimleri (${mailRuEvents.length})`}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {lang === 'ru' ? 'Папки: Входящие + Спам' : 'Klasörler: Gelen Kutusu + Spam'}
                  </span>
                </div>

                {mailRuEvents.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'ru'
                      ? 'Пока нет загруженных писем. Введите адрес Mail.ru и пароль приложения выше, затем нажмите «Сохранить и проверить почту сейчас».'
                      : 'Henüz çekilen e-posta yok. Yukarıya Mail.ru adresini ve uygulama şifresini girip «Kaydet ve Şimdi Mailleri Kontrol Et» butonuna tıklayın.'}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950/60 text-[11px] text-slate-500 uppercase sticky top-0">
                        <tr>
                          <th className="py-2 px-3">№ Заявления</th>
                          <th className="py-2 px-3">{lang === 'ru' ? 'Статус в письме' : 'Maildeki Statü'}</th>
                          <th className="py-2 px-3">{lang === 'ru' ? 'Дата и время' : 'Tarih & Saat'}</th>
                          <th className="py-2 px-3">{lang === 'ru' ? 'Папка' : 'Klasör'}</th>
                          <th className="py-2 px-3">{lang === 'ru' ? 'Сотрудник (ВКС)' : 'Personel (VKS)'}</th>
                          <th className="py-2 px-3 text-right">{lang === 'ru' ? 'Ссылка' : 'Bağlantı'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                        {mailRuEvents.map((ev) => {
                          const stLow = (ev.gosuslugi_status || '').toLowerCase();
                          const isPositive =
                            stLow.includes('оказана') ||
                            stLow.includes('зарегистрировано') ||
                            stLow.includes('принято');
                          const isNegative = stLow.includes('отказ') || stLow.includes('ошибка');
                          return (
                            <tr
                              key={ev.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                            >
                              <td className="py-2 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                № {ev.application_no}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                    isNegative
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                      : isPositive
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                                  }`}
                                >
                                  {ev.gosuslugi_status}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                {ev.email_date || ev.synced_at || '—'}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10.5px] font-semibold ${
                                    ev.folder_name === 'Спам'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                  }`}
                                >
                                  {ev.folder_name || 'Входящие'}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                {ev.worker_name ? (
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {ev.worker_name}{' '}
                                    {ev.sicil_no ? (
                                      <span className="text-[10.5px] font-mono text-slate-500">
                                        ({ev.sicil_no})
                                      </span>
                                    ) : null}
                                  </span>
                                ) : workers.length > 0 ? (
                                  <select
                                    defaultValue=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleLinkMailApplicationToWorker(
                                          ev.application_no,
                                          ev.gosuslugi_status,
                                          e.target.value
                                        );
                                      }
                                    }}
                                    className="h-7 px-2 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300"
                                  >
                                    <option value="">
                                      {lang === 'ru'
                                        ? '+ Привязать к сотруднику...'
                                        : '+ Personele bağla...'}
                                    </option>
                                    {workers.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.sicil} — {w.lastName} {w.firstName}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-slate-400 italic">
                                    {lang === 'ru' ? 'Не привязано' : 'Eşleşmedi'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {ev.order_url ? (
                                  <a
                                    href={ev.order_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    <span>{lang === 'ru' ? 'Открыть' : 'Aç'}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
