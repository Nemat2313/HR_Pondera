import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getDb } from '@/lib/db';
import { getSmtpConfig, sendCustomExecutiveEmail } from '@/lib/emailNotifier';
import { sendTelegramMessage } from '@/lib/telegramNotifier';
import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';

export interface MvdInvitationRecord {
  id: number;
  invitation_no: string;
  petition_no: string;
  petition_date: string;
  issuing_authority: string;
  birth_date: string;
  birth_place_ru: string;
  gender_ru: string;
  nationality_ru: string;
  nationality_tr: string;
  passport_masked: string;
  passport_last3: string;
  passport_issue_date: string;
  visa_category: string;
  visa_multiplicity: string;
  entry_from: string;
  stay_until: string;
  duration_days: number;
  visa_issuance_place: string;
  purpose_of_entry: string;
  invited_by: string;
  matched_sicil_no: string;
  matched_name: string;
  matched_kiril_name: string;
  matched_passport_full: string;
  matched_status: string;
  matched_region: string;
  matched_project: string;
  match_confidence: 'EXACT' | 'PARTIAL' | 'UNMATCHED' | 'MANUAL';
  match_reason: string;
  candidates_json: string;
  pdf_filename: string;
  pdf_size_bytes: number;
  email_message_id: string;
  email_subject: string;
  email_received_iso: string;
  email_received_display: string;
  notified_email: number;
  notified_telegram: number;
  created_at: string;
  updated_at: string;
}

const NAT_RU_TO_DB: Record<string, { db: string; tr: string }> = {
  ИНДИЯ: { db: 'HINDISTAN', tr: 'Hindistan' },
  'РЕСПУБЛИКА ИНДИЯ': { db: 'HINDISTAN', tr: 'Hindistan' },
  ТУРЦИЯ: { db: 'TURKIYE', tr: 'Türkiye' },
  'ТУРЕЦКАЯ РЕСПУБЛИКА': { db: 'TURKIYE', tr: 'Türkiye' },
  КИТАЙ: { db: 'CIN', tr: 'Çin' },
  КНР: { db: 'CIN', tr: 'Çin' },
  БАНГЛАДЕШ: { db: 'BANGLADES', tr: 'Bangladeş' },
  ПАКИСТАН: { db: 'PAKISTAN', tr: 'Pakistan' },
  ФИЛИППИНЫ: { db: 'FILIPINLER', tr: 'Filipinler' },
  ТУРКМЕНИСТАН: { db: 'TURKMENISTAN', tr: 'Türkmenistan' },
  УЗБЕКИСТАН: { db: 'OZBEKISTAN', tr: 'Özbekistan' },
  ТАДЖИКИСТАН: { db: 'TACIKISTAN', tr: 'Tacikistan' },
  АЗЕРБАЙДЖАН: { db: 'AZERBAYCAN', tr: 'Azerbaycan' },
  КЫРГЫЗСТАН: { db: 'KIRGIZISTAN', tr: 'Kırgızistan' },
  КИРГИЗИЯ: { db: 'KIRGIZISTAN', tr: 'Kırgızistan' },
  КАЗАХСТАН: { db: 'KAZAKISTAN', tr: 'Kazakistan' },
  СЕРБИЯ: { db: 'SIRBISTAN', tr: 'Sırbistan' },
};

export function getInvitationsUploadDir(): string {
  const dir = path.join(process.cwd(), 'uploads', 'invitations');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return dir;
}

export function sanitizeFilenameSegment(val: string): string {
  return String(val || '')
    .trim()
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildInvitationPdfFilename(
  sicilNo: string,
  fullName: string,
  invitationNo: string,
  passportLast3: string
): string {
  const cleanInv = sanitizeFilenameSegment(invitationNo) || 'MVD_INV';
  const cleanSicil = sanitizeFilenameSegment(sicilNo);
  const cleanName = sanitizeFilenameSegment(fullName);
  if (cleanSicil && cleanName) {
    return `${cleanSicil}_${cleanName}_${cleanInv}.pdf`;
  }
  const cleanP3 = sanitizeFilenameSegment(passportLast3) || '000';
  return `ADAY_PASP_${cleanP3}_${cleanInv}.pdf`;
}

export function normalizeAnyDateToDdMmYyyy(val: any): string {
  if (val === null || val === undefined) return '';
  const raw = String(val).trim();
  if (!raw || raw === '-' || raw === '—') return '';

  // Excel serial number (e.g. 36526 -> 01.01.2000, 44116 -> 12.10.2020)
  if (/^\d{5}$/.test(raw)) {
    const serial = parseInt(raw, 10);
    if (serial > 15000 && serial < 65000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      return `${dd}.${mm}.${yyyy}`;
    }
  }

  // DD.MM.YYYY
  const mDot = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (mDot) {
    return `${mDot[1]}.${mDot[2]}.${mDot[3]}`;
  }

  // YYYY-MM-DD
  const mIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) {
    return `${mIso[3]}.${mIso[2]}.${mIso[1]}`;
  }

  // M/D/YYYY or DD/MM/YYYY
  const mSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) {
    const p1 = parseInt(mSlash[1], 10);
    const p2 = parseInt(mSlash[2], 10);
    const yyyy = mSlash[3];
    const mm = String(p1 <= 12 ? p1 : p2).padStart(2, '0');
    const dd = String(p1 <= 12 ? p2 : p1).padStart(2, '0');
    return `${dd}.${mm}.${yyyy}`;
  }

  return raw;
}

export function ensureInvitationsTables(dbInstance?: any) {
  const db = dbInstance || getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS mvd_invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_no TEXT UNIQUE NOT NULL,
      petition_no TEXT DEFAULT '',
      petition_date TEXT DEFAULT '',
      issuing_authority TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      birth_place_ru TEXT DEFAULT '',
      gender_ru TEXT DEFAULT '',
      nationality_ru TEXT DEFAULT '',
      nationality_tr TEXT DEFAULT '',
      passport_masked TEXT DEFAULT '',
      passport_last3 TEXT DEFAULT '',
      passport_issue_date TEXT DEFAULT '',
      visa_category TEXT DEFAULT '',
      visa_multiplicity TEXT DEFAULT '',
      entry_from TEXT DEFAULT '',
      stay_until TEXT DEFAULT '',
      duration_days INTEGER DEFAULT 90,
      visa_issuance_place TEXT DEFAULT '',
      purpose_of_entry TEXT DEFAULT '',
      invited_by TEXT DEFAULT '',
      matched_sicil_no TEXT DEFAULT '',
      matched_name TEXT DEFAULT '',
      matched_kiril_name TEXT DEFAULT '',
      matched_passport_full TEXT DEFAULT '',
      matched_status TEXT DEFAULT '',
      matched_region TEXT DEFAULT '',
      matched_project TEXT DEFAULT '',
      match_confidence TEXT DEFAULT 'UNMATCHED',
      match_reason TEXT DEFAULT '',
      candidates_json TEXT DEFAULT '[]',
      pdf_filename TEXT DEFAULT '',
      pdf_size_bytes INTEGER DEFAULT 0,
      email_message_id TEXT DEFAULT '',
      email_subject TEXT DEFAULT '',
      email_received_iso TEXT DEFAULT '',
      email_received_display TEXT DEFAULT '',
      notified_email INTEGER DEFAULT 0,
      notified_telegram INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mvd_inv_no ON mvd_invitations(invitation_no);
    CREATE INDEX IF NOT EXISTS idx_mvd_inv_sicil ON mvd_invitations(matched_sicil_no);
    CREATE INDEX IF NOT EXISTS idx_mvd_inv_rec_iso ON mvd_invitations(email_received_iso);
  `);

  // Seed initial real MVD invitation 7726002Y8860086 from screenshot if table is empty
  const cntRow = db.prepare('SELECT COUNT(*) as c FROM mvd_invitations').get() as { c: number };
  if (!cntRow || cntRow.c === 0) {
    const matchRes = matchInvitationAgainstPersonnel(
      {
        passport_last3: '410',
        birth_date: '01.01.2000',
        passport_issue_date: '12.10.2020',
        birth_place_ru: 'РЕСПУБЛИКА ИНДИЯ, ДЖАУНПУР УТТАР ПРАДЕШ',
        nationality_ru: 'ИНДИЯ',
        gender_ru: 'МУЖ',
      },
      db
    );
    const nowStr = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO mvd_invitations (
        invitation_no, petition_no, petition_date, issuing_authority,
        birth_date, birth_place_ru, gender_ru, nationality_ru, nationality_tr,
        passport_masked, passport_last3, passport_issue_date,
        visa_category, visa_multiplicity, entry_from, stay_until, duration_days,
        visa_issuance_place, purpose_of_entry, invited_by,
        matched_sicil_no, matched_name, matched_kiril_name, matched_passport_full,
        matched_status, matched_region, matched_project,
        match_confidence, match_reason, candidates_json,
        pdf_filename, pdf_size_bytes,
        email_message_id, email_subject, email_received_iso, email_received_display,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      '7726002Y8860086',
      '2Y8860086',
      '08.10.2026',
      '770-001 ОТДЕЛ ОФОРМЛЕНИЯ ВИЗ И ПРИГЛАШЕНИЙ УВМ ГУ МВД РОССИИ ПО Г. МОСКВЕ',
      '01.01.2000',
      'РЕСПУБЛИКА ИНДИЯ, ДЖАУНПУР УТТАР ПРАДЕШ',
      'МУЖ',
      'ИНДИЯ',
      'Hindistan',
      '*****410',
      '410',
      '12.10.2020',
      'ОБЫКНОВЕННАЯ РАБОЧАЯ [ОР]',
      'ОДНОКРАТНАЯ [О]',
      '27.10.2026',
      '24.01.2027',
      90,
      'ИНДИЯ, НЬЮ-ДЕЛИ',
      'ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ',
      'ООО "ПОНДЕРА-ИНДУСТРИ"',
      matchRes.matched?.sicil_no || '',
      matchRes.matched?.ad_soyad || '',
      matchRes.matched?.tam_adi_kiril || '',
      matchRes.matched?.pasaport_no || '',
      matchRes.matched?.genel_durum || '',
      matchRes.matched?.region || '',
      matchRes.matched?.proje_adi || '',
      matchRes.confidence,
      matchRes.reason,
      JSON.stringify(matchRes.candidates),
      buildInvitationPdfFilename(
        matchRes.matched?.sicil_no || '',
        matchRes.matched?.ad_soyad || '',
        '7726002Y8860086',
        '410'
      ),
      168857,
      'seed-7726002Y8860086',
      'Переслать: Одобрено ваше ходатайство 2Y8860086 о выдаче приглашения на въезд в РФ',
      '2026-11-07',
      '07.11.2026 22:21',
      nowStr,
      nowStr
    );
  }
}

export interface InvitationCandidateMatch {
  sicil_no: string;
  ad_soyad: string;
  tam_adi_kiril: string;
  uyruk: string;
  dogum_tarihi: string;
  pasaport_no: string;
  pasaport_verilis: string;
  dogum_yeri: string;
  genel_durum: string;
  region: string;
  proje_adi: string;
  score: number;
  reasons: string[];
}

const CYR_TO_LAT_MAP: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'ZH', З: 'Z',
  И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH',
  Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
};

function transliterateCyrillicToLatin(text: string): string {
  return String(text || '')
    .toUpperCase()
    .split('')
    .map((ch) => (ch in CYR_TO_LAT_MAP ? CYR_TO_LAT_MAP[ch] : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchInvitationAgainstPersonnel(
  fields: {
    passport_last3?: string;
    birth_date?: string;
    passport_issue_date?: string;
    birth_place_ru?: string;
    nationality_ru?: string;
    gender_ru?: string;
    purpose_of_entry?: string;
  },
  dbInstance?: any
): {
  confidence: 'EXACT' | 'PARTIAL' | 'UNMATCHED';
  reason: string;
  matched: InvitationCandidateMatch | null;
  candidates: InvitationCandidateMatch[];
} {
  const db = dbInstance || getDb();
  const last3 = String(fields.passport_last3 || '')
    .replace(/[^0-9A-Za-zА-Яа-я]/g, '')
    .toUpperCase();
  const invDob = normalizeAnyDateToDdMmYyyy(fields.birth_date);
  const invPassIssue = normalizeAnyDateToDdMmYyyy(fields.passport_issue_date);
  const invPlaceUpper = String(fields.birth_place_ru || '').toUpperCase();
  const invNatUpper = String(fields.nationality_ru || '').trim().toUpperCase();
  const mappedNat = NAT_RU_TO_DB[invNatUpper]?.db || '';

  // Place tokens (excluding generic words like РЕСПУБЛИКА, ШТАТ, ИНДИЯ, ГОР, ОБЛ)
  const stopWords = new Set([
    'РЕСПУБЛИКА',
    'ИНДИЯ',
    'ТУРЦИЯ',
    'ТУРЕЦКАЯ',
    'ШТАТ',
    'ГОРОД',
    'ОБЛАСТЬ',
    'РАЙОН',
    'УТТАР',
    'ПРАДЕШ',
    'БИХАР',
  ]);
  const specificPlaceTokens = invPlaceUpper
    .split(/[^А-ЯЁA-Z0-9]+/)
    .filter((t) => t.length >= 4 && !stopWords.has(t));
  const statePlaceTokens = invPlaceUpper
    .split(/[^А-ЯЁA-Z0-9]+/)
    .filter((t) => t.length >= 4 && (t === 'УТТАР' || t === 'ПРАДЕШ' || t === 'БИХАР'));

  let rows: any[] = [];
  try {
    if (last3) {
      rows = db
        .prepare(
          `SELECT sicil_no, ad_soyad, tam_adi_kiril, uyruk, dogum_tarihi, pasaport_no, genel_durum, region, proje_adi, all_data_json
           FROM personnel
           WHERE pasaport_no LIKE ? OR all_data_json LIKE ?`
        )
        .all(`%${last3}`, `%${last3}%`) as any[];
    } else if (invDob) {
      rows = db
        .prepare(
          `SELECT sicil_no, ad_soyad, tam_adi_kiril, uyruk, dogum_tarihi, pasaport_no, genel_durum, region, proje_adi, all_data_json
           FROM personnel
           WHERE dogum_tarihi LIKE ?`
        )
        .all(`%${invDob.slice(6, 10)}%`) as any[];
    }
  } catch {
    rows = [];
  }

  const scoredMap = new Map<string, InvitationCandidateMatch>();

  for (const r of rows) {
    let rawJson: Record<string, any> = {};
    if (r.all_data_json) {
      try {
        rawJson = JSON.parse(r.all_data_json);
      } catch {}
    }

    const pSerie = String(rawJson['Pasaport Seri No'] || '').trim();
    const pNumRaw = String(r.pasaport_no || rawJson['Pasaport No'] || '').trim();
    const cleanPNum = pNumRaw.replace(/[^0-9A-Za-zА-Яа-я]/g, '').toUpperCase();
    const fullPassportDisplay = pSerie && !pNumRaw.startsWith(pSerie) ? `${pSerie} ${pNumRaw}` : pNumRaw;

    const pEndsWithLast3 = Boolean(last3 && cleanPNum.endsWith(last3));
    if (last3 && !pEndsWithLast3) {
      continue;
    }

    const rowDob = normalizeAnyDateToDdMmYyyy(r.dogum_tarihi || rawJson['Doğum Tarihi']);
    const rowPassIssue = normalizeAnyDateToDdMmYyyy(rawJson['Pasaport Düzenleme Tarihi']);
    const rowBirthPlace = String(rawJson['Doğum Yeri'] || '').trim();
    const rowBirthPlaceUpper = rowBirthPlace.toUpperCase();
    const rowNatUpper = String(r.uyruk || rawJson['Uyruk'] || '').trim().toUpperCase();

    let score = 0;
    const reasons: string[] = [];

    if (pEndsWithLast3) {
      score += 35;
      reasons.push(`Pasaport Son 3 Hane (*${last3})`);
    }

    if (mappedNat && rowNatUpper === mappedNat) {
      score += 15;
      reasons.push(`Uyruk (${mappedNat})`);
    }

    if (invDob && rowDob === invDob) {
      score += 35;
      reasons.push(`Doğum Tarihi (${invDob})`);
    } else if (invDob && rowDob && invDob.slice(6, 10) === rowDob.slice(6, 10)) {
      score += 8;
      reasons.push(`Doğum Yılı (${invDob.slice(6, 10)})`);
    }

    if (invPassIssue && rowPassIssue === invPassIssue) {
      score += 35;
      reasons.push(`Pasaport Veriliş (${invPassIssue})`);
    }

    if (rowBirthPlaceUpper && specificPlaceTokens.length > 0) {
      const matchedTokens = specificPlaceTokens.filter((t) => rowBirthPlaceUpper.includes(t));
      if (matchedTokens.length > 0) {
        score += 30;
        reasons.push(`Doğum Yeri (${matchedTokens.join(', ')})`);
      } else if (statePlaceTokens.some((t) => rowBirthPlaceUpper.includes(t))) {
        score += 10;
        reasons.push(`Eyalet (${rowBirthPlace})`);
      }
    }

    if (score >= 45) {
      const sicilKey = String(r.sicil_no || '').trim();
      scoredMap.set(sicilKey, {
        sicil_no: sicilKey,
        ad_soyad: String(r.ad_soyad || ''),
        tam_adi_kiril: String(r.tam_adi_kiril || ''),
        uyruk: String(r.uyruk || ''),
        dogum_tarihi: rowDob || String(r.dogum_tarihi || ''),
        pasaport_no: fullPassportDisplay,
        pasaport_verilis: rowPassIssue,
        dogum_yeri: rowBirthPlace,
        genel_durum: String(r.genel_durum || ''),
        region: resolveEffectiveRegion(r.region, r.proje_adi, 'Merkez'),
        proje_adi: String(r.proje_adi || ''),
        score,
        reasons,
      });
    }
  }

  // Also search 1C ZUP Official List (zup_official_personnel)
  try {
    let zupRows: any[] = [];
    if (last3) {
      zupRows = db
        .prepare(
          `SELECT tabel_no, norm_sicil, fio_kiril, gender, birth_date, citizenship_ru, citizenship_tr,
                  doc_series, doc_no, doc_issue_date, doc_issued_by, zup_department, position_ru
           FROM zup_official_personnel
           WHERE doc_no LIKE ?`
        )
        .all(`%${last3}`) as any[];
    } else if (invDob) {
      zupRows = db
        .prepare(
          `SELECT tabel_no, norm_sicil, fio_kiril, gender, birth_date, citizenship_ru, citizenship_tr,
                  doc_series, doc_no, doc_issue_date, doc_issued_by, zup_department, position_ru
           FROM zup_official_personnel
           WHERE birth_date LIKE ?`
        )
        .all(`%${invDob.slice(6, 10)}%`) as any[];
    }

    for (const z of zupRows) {
      const pSerie = String(z.doc_series || '').trim();
      const pNumRaw = String(z.doc_no || '').trim();
      const cleanPNum = pNumRaw.replace(/[^0-9A-Za-zА-Яа-я]/g, '').toUpperCase();
      const pEndsWithLast3 = Boolean(last3 && cleanPNum.endsWith(last3));
      if (last3 && !pEndsWithLast3) continue;

      const zDob = normalizeAnyDateToDdMmYyyy(z.birth_date);
      const zPassIssue = normalizeAnyDateToDdMmYyyy(z.doc_issue_date);
      const zIssuedBy = String(z.doc_issued_by || '').trim();
      const zNatUpper = String(z.citizenship_tr || '').trim().toUpperCase();
      const zCitRuUpper = String(z.citizenship_ru || '').trim().toUpperCase();

      let score = 0;
      const reasons: string[] = [];

      if (pEndsWithLast3) {
        score += 35;
        reasons.push(`1C ZUP Pasaport (*${last3})`);
      }
      if ((mappedNat && zNatUpper === mappedNat) || (invNatUpper && zCitRuUpper === invNatUpper)) {
        score += 15;
        reasons.push(`Uyruk (${zNatUpper || zCitRuUpper})`);
      }
      if (invDob && zDob === invDob) {
        score += 35;
        reasons.push(`Doğum Tarihi (${invDob})`);
      } else if (invDob && zDob && invDob.slice(6, 10) === zDob.slice(6, 10)) {
        score += 8;
        reasons.push(`Doğum Yılı (${invDob.slice(6, 10)})`);
      }
      if (invPassIssue && zPassIssue === invPassIssue) {
        score += 35;
        reasons.push(`1C ZUP Pasaport Veriliş (${zPassIssue})`);
      }
      if (zIssuedBy && specificPlaceTokens.length > 0) {
        const matchedTokens = specificPlaceTokens.filter((t) => zIssuedBy.toUpperCase().includes(t));
        if (matchedTokens.length > 0) {
          score += 25;
          reasons.push(`1C ZUP Veren Makam (${zIssuedBy})`);
        }
      }

      if (score >= 45) {
        const sicilKey = String(z.norm_sicil || z.tabel_no || '').trim();
        const existingCand = scoredMap.get(sicilKey);
        const fullPass = pSerie && !pNumRaw.startsWith(pSerie) ? `${pSerie} ${pNumRaw}` : pNumRaw;
        if (!existingCand || score > existingCand.score) {
          scoredMap.set(sicilKey, {
            sicil_no: sicilKey,
            ad_soyad:
              existingCand?.ad_soyad ||
              transliterateCyrillicToLatin(String(z.fio_kiril || '').replace(/\b\d{5,7}\b/g, '')),
            tam_adi_kiril: String(z.fio_kiril || existingCand?.tam_adi_kiril || '').trim(),
            uyruk: String(z.citizenship_tr || existingCand?.uyruk || z.citizenship_ru || ''),
            dogum_tarihi: zDob || existingCand?.dogum_tarihi || '',
            pasaport_no: fullPass || existingCand?.pasaport_no || '',
            pasaport_verilis: zPassIssue || existingCand?.pasaport_verilis || '',
            dogum_yeri: existingCand?.dogum_yeri || zIssuedBy,
            genel_durum: existingCand ? `${existingCand.genel_durum} • 1C ZUP` : '1C ZUP Resmi Liste',
            region: existingCand?.region || String(z.zup_department || '1C ZUP'),
            proje_adi: existingCand?.proje_adi || String(z.zup_department || '1C ZUP'),
            score,
            reasons,
          });
        } else if (existingCand && !existingCand.genel_durum.includes('1C ZUP')) {
          existingCand.genel_durum = `${existingCand.genel_durum} • 1C ZUP`;
          if (!existingCand.pasaport_verilis && zPassIssue) {
            existingCand.pasaport_verilis = zPassIssue;
          }
        }
      }
    }
  } catch {
    // ignore if zup_official_personnel table not yet initialized
  }

  const scored = Array.from(scoredMap.values());
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, 6);
  const best = topCandidates[0] || null;

  if (best && best.score >= 80) {
    return {
      confidence: 'EXACT',
      reason: best.reasons.join(' + '),
      matched: best,
      candidates: topCandidates,
    };
  }

  if (best && best.score >= 55) {
    // Only auto-assign PARTIAL if DOB or Passport Issue Date or Specific City matched alongside Passport Last 3
    const hasStrongSecondField = best.reasons.some(
      (rs) =>
        rs.startsWith('Doğum Tarihi (') ||
        rs.startsWith('Pasaport Veriliş (') ||
        rs.startsWith('Doğum Yeri (')
    );
    if (hasStrongSecondField) {
      return {
        confidence: 'PARTIAL',
        reason: best.reasons.join(' + '),
        matched: best,
        candidates: topCandidates,
      };
    }
  }

  const isFamilyMember = String(fields.purpose_of_entry || '')
    .toUpperCase()
    .includes('ЧЛЕН СЕМЬИ');

  return {
    confidence: 'UNMATCHED',
    reason: isFamilyMember
      ? `Refakatçi Aile Üyesi / Çocuk davetiyesi (СОПРОВОЖДАЮЩИЙ ЧЛЕН СЕМЬИ — Doğum: ${invDob || '—'}) — Personel siciline manuel bağlanabilir`
      : topCandidates.length > 0
      ? `Pasaport sonu *${last3} olan ${topCandidates.length} kayıt bulundu ancak Doğum Tarihi (${invDob || '—'}) / Veriliş (${invPassIssue || '—'}) farklı — Yeni aday henüz eBA'ya girilmemiş olabilir`
      : `Tüm personel listesinde *${last3} / ${invDob || '—'} kriterine uyan kayıt henüz açılmamış (Yeni Aday)`,
    matched: null,
    candidates: topCandidates,
  };
}

function runPythonInvitationHelper(payload: Record<string, any>): any {
  const scriptPath = path.join(process.cwd(), 'scripts', 'gosuslugi_rpa', 'zoho_invitation_sync.py');
  const inputJson = JSON.stringify(payload);
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];

  let lastErr = '';
  for (const bin of candidates) {
    try {
      const res = spawnSync(bin, [scriptPath], {
        input: inputJson,
        encoding: 'utf-8',
        timeout: 45000,
        maxBuffer: 25 * 1024 * 1024,
      });
      if (res.error) {
        lastErr = res.error.message;
        continue;
      }
      const stdout = String(res.stdout || '').trim();
      if (stdout) {
        const lines = stdout.split(/\r?\n/).filter(Boolean);
        return JSON.parse(lines[lines.length - 1]);
      }
      if (res.stderr) {
        lastErr = String(res.stderr).trim();
      }
    } catch (e: any) {
      lastErr = e?.message || 'Python helper error';
    }
  }

  return {
    success: false,
    message: lastErr || 'Python davetiye okuyucu çalıştırılamadı.',
  };
}

export function upsertParsedInvitationToDb(
  item: {
    message_id?: string;
    subject?: string;
    email_received_iso?: string;
    email_received_display?: string;
    pdf_base64?: string;
    pdf_size_bytes?: number;
    fields: Record<string, any>;
  },
  dbInstance?: any
): { saved: boolean; invitation_no: string; matched_sicil_no: string; pdf_filename: string } {
  const db = dbInstance || getDb();
  ensureInvitationsTables(db);

  const f = item.fields || {};
  const invitationNo =
    String(f.invitation_no || f.petition_no || '').trim().toUpperCase() ||
    `INV-${Date.now().toString().slice(-8)}`;
  const petitionNo = String(f.petition_no || invitationNo.slice(-9)).trim().toUpperCase();
  const natRu = String(f.nationality_ru || '').trim().toUpperCase();
  const natTr = NAT_RU_TO_DB[natRu]?.tr || natRu || 'Bilinmiyor';
  const last3 = String(f.passport_last3 || '').trim();

  // Check if record already exists and was manually linked
  const existing = db
    .prepare('SELECT * FROM mvd_invitations WHERE invitation_no = ?')
    .get(invitationNo) as MvdInvitationRecord | undefined;

  const matchRes = matchInvitationAgainstPersonnel(
    {
      passport_last3: last3,
      birth_date: f.birth_date,
      passport_issue_date: f.passport_issue_date,
      birth_place_ru: f.birth_place_ru,
      nationality_ru: natRu,
      gender_ru: f.gender_ru,
      purpose_of_entry: f.purpose_of_entry,
    },
    db
  );

  const keepManual = existing && existing.match_confidence === 'MANUAL' && existing.matched_sicil_no;
  const finalSicil = keepManual ? existing!.matched_sicil_no : matchRes.matched?.sicil_no || '';
  const finalName = keepManual ? existing!.matched_name : matchRes.matched?.ad_soyad || '';
  const finalKiril = keepManual ? existing!.matched_kiril_name : matchRes.matched?.tam_adi_kiril || '';
  const finalPassFull = keepManual ? existing!.matched_passport_full : matchRes.matched?.pasaport_no || '';
  const finalStatus = keepManual ? existing!.matched_status : matchRes.matched?.genel_durum || '';
  const finalRegion = keepManual ? existing!.matched_region : matchRes.matched?.region || '';
  const finalProject = keepManual ? existing!.matched_project : matchRes.matched?.proje_adi || '';
  const finalConf = keepManual ? 'MANUAL' : matchRes.confidence;
  const finalReason = keepManual ? existing!.match_reason : matchRes.reason;

  const targetPdfFilename = buildInvitationPdfFilename(finalSicil, finalName, invitationNo, last3);
  const uploadDir = getInvitationsUploadDir();

  // Save PDF bytes to uploads/invitations/{targetPdfFilename}
  let sizeBytes = Number(item.pdf_size_bytes || existing?.pdf_size_bytes || 0);
  if (item.pdf_base64) {
    try {
      const buf = Buffer.from(item.pdf_base64, 'base64');
      sizeBytes = buf.length;
      const targetPath = path.join(uploadDir, targetPdfFilename);
      fs.writeFileSync(targetPath, buf);

      // Remove old filename if renamed
      if (existing?.pdf_filename && existing.pdf_filename !== targetPdfFilename) {
        const oldPath = path.join(uploadDir, existing.pdf_filename);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch {}
        }
      }
    } catch {}
  } else if (existing?.pdf_filename && existing.pdf_filename !== targetPdfFilename) {
    // Rename existing PDF on disk if employee matched
    const oldPath = path.join(uploadDir, existing.pdf_filename);
    const newPath = path.join(uploadDir, targetPdfFilename);
    if (fs.existsSync(oldPath)) {
      try {
        fs.renameSync(oldPath, newPath);
      } catch {}
    }
  }

  const nowStr = new Date().toISOString();
  const recIso =
    item.email_received_iso ||
    existing?.email_received_iso ||
    new Date().toISOString().slice(0, 10);
  const recDisplay =
    item.email_received_display ||
    existing?.email_received_display ||
    new Date().toLocaleDateString('tr-TR');

  db.prepare(`
    INSERT INTO mvd_invitations (
      invitation_no, petition_no, petition_date, issuing_authority,
      birth_date, birth_place_ru, gender_ru, nationality_ru, nationality_tr,
      passport_masked, passport_last3, passport_issue_date,
      visa_category, visa_multiplicity, entry_from, stay_until, duration_days,
      visa_issuance_place, purpose_of_entry, invited_by,
      matched_sicil_no, matched_name, matched_kiril_name, matched_passport_full,
      matched_status, matched_region, matched_project,
      match_confidence, match_reason, candidates_json,
      pdf_filename, pdf_size_bytes,
      email_message_id, email_subject, email_received_iso, email_received_display,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
    ON CONFLICT(invitation_no) DO UPDATE SET
      petition_no = CASE WHEN excluded.petition_no != '' THEN excluded.petition_no ELSE mvd_invitations.petition_no END,
      petition_date = CASE WHEN excluded.petition_date != '' THEN excluded.petition_date ELSE mvd_invitations.petition_date END,
      issuing_authority = CASE WHEN excluded.issuing_authority != '' THEN excluded.issuing_authority ELSE mvd_invitations.issuing_authority END,
      birth_date = CASE WHEN excluded.birth_date != '' THEN excluded.birth_date ELSE mvd_invitations.birth_date END,
      birth_place_ru = CASE WHEN excluded.birth_place_ru != '' THEN excluded.birth_place_ru ELSE mvd_invitations.birth_place_ru END,
      gender_ru = CASE WHEN excluded.gender_ru != '' THEN excluded.gender_ru ELSE mvd_invitations.gender_ru END,
      nationality_ru = CASE WHEN excluded.nationality_ru != '' THEN excluded.nationality_ru ELSE mvd_invitations.nationality_ru END,
      nationality_tr = CASE WHEN excluded.nationality_tr != '' THEN excluded.nationality_tr ELSE mvd_invitations.nationality_tr END,
      passport_masked = CASE WHEN excluded.passport_masked != '' THEN excluded.passport_masked ELSE mvd_invitations.passport_masked END,
      passport_last3 = CASE WHEN excluded.passport_last3 != '' THEN excluded.passport_last3 ELSE mvd_invitations.passport_last3 END,
      passport_issue_date = CASE WHEN excluded.passport_issue_date != '' THEN excluded.passport_issue_date ELSE mvd_invitations.passport_issue_date END,
      visa_category = CASE WHEN excluded.visa_category != '' THEN excluded.visa_category ELSE mvd_invitations.visa_category END,
      visa_multiplicity = CASE WHEN excluded.visa_multiplicity != '' THEN excluded.visa_multiplicity ELSE mvd_invitations.visa_multiplicity END,
      entry_from = CASE WHEN excluded.entry_from != '' THEN excluded.entry_from ELSE mvd_invitations.entry_from END,
      stay_until = CASE WHEN excluded.stay_until != '' THEN excluded.stay_until ELSE mvd_invitations.stay_until END,
      duration_days = excluded.duration_days,
      visa_issuance_place = CASE WHEN excluded.visa_issuance_place != '' THEN excluded.visa_issuance_place ELSE mvd_invitations.visa_issuance_place END,
      purpose_of_entry = CASE WHEN excluded.purpose_of_entry != '' THEN excluded.purpose_of_entry ELSE mvd_invitations.purpose_of_entry END,
      matched_sicil_no = excluded.matched_sicil_no,
      matched_name = excluded.matched_name,
      matched_kiril_name = excluded.matched_kiril_name,
      matched_passport_full = excluded.matched_passport_full,
      matched_status = excluded.matched_status,
      matched_region = excluded.matched_region,
      matched_project = excluded.matched_project,
      match_confidence = excluded.match_confidence,
      match_reason = excluded.match_reason,
      candidates_json = excluded.candidates_json,
      pdf_filename = excluded.pdf_filename,
      pdf_size_bytes = CASE WHEN excluded.pdf_size_bytes > 0 THEN excluded.pdf_size_bytes ELSE mvd_invitations.pdf_size_bytes END,
      email_message_id = CASE WHEN excluded.email_message_id != '' THEN excluded.email_message_id ELSE mvd_invitations.email_message_id END,
      email_subject = CASE WHEN excluded.email_subject != '' THEN excluded.email_subject ELSE mvd_invitations.email_subject END,
      email_received_iso = excluded.email_received_iso,
      email_received_display = excluded.email_received_display,
      updated_at = excluded.updated_at
  `).run(
    invitationNo,
    petitionNo,
    String(f.petition_date || existing?.petition_date || ''),
    String(f.issuing_authority || existing?.issuing_authority || ''),
    String(f.birth_date || existing?.birth_date || ''),
    String(f.birth_place_ru || existing?.birth_place_ru || ''),
    String(f.gender_ru || existing?.gender_ru || ''),
    natRu,
    natTr,
    String(f.passport_masked || (last3 ? `*****${last3}` : '')),
    last3,
    String(f.passport_issue_date || existing?.passport_issue_date || ''),
    String(f.visa_category || existing?.visa_category || 'ОБЫКНОВЕННАЯ РАБОЧАЯ [ОР]'),
    String(f.visa_multiplicity || existing?.visa_multiplicity || 'ОДНОКРАТНАЯ [О]'),
    String(f.entry_from || existing?.entry_from || ''),
    String(f.stay_until || existing?.stay_until || ''),
    parseInt(String(f.duration_days || existing?.duration_days || '90'), 10) || 90,
    String(f.visa_issuance_place || existing?.visa_issuance_place || ''),
    String(f.purpose_of_entry || existing?.purpose_of_entry || 'ТРУДОВАЯ ДЕЯТЕЛЬНОСТЬ'),
    String(f.invited_by || existing?.invited_by || 'ООО "ПОНДЕРА-ИНДУСТРИ"'),
    finalSicil,
    finalName,
    finalKiril,
    finalPassFull,
    finalStatus,
    finalRegion,
    finalProject,
    finalConf,
    finalReason,
    JSON.stringify(matchRes.candidates),
    targetPdfFilename,
    sizeBytes,
    String(item.message_id || existing?.email_message_id || ''),
    String(item.subject || existing?.email_subject || ''),
    recIso,
    recDisplay,
    existing?.created_at || nowStr,
    nowStr
  );

  return {
    saved: true,
    invitation_no: invitationNo,
    matched_sicil_no: finalSicil,
    pdf_filename: targetPdfFilename,
  };
}

export function syncZohoInvitationsFromImap(
  maxMessages = 80,
  dbInstance?: any
): {
  success: boolean;
  message: string;
  scannedEmails: number;
  foundInvitations: number;
  matchedCount: number;
  savedItems: Array<{ invitation_no: string; matched_sicil_no: string; pdf_filename: string }>;
} {
  const db = dbInstance || getDb();
  ensureInvitationsTables(db);
  const smtp = getSmtpConfig(db);

  if (!smtp.user || !smtp.pass) {
    return {
      success: false,
      message: 'Zoho e-posta (ikbildirim@pondera.ru) şifresi henüz tanımlı değil.',
      scannedEmails: 0,
      foundInvitations: 0,
      matchedCount: 0,
      savedItems: [],
    };
  }

  const pyRes = runPythonInvitationHelper({
    action: 'sync_imap',
    imap_host: smtp.imapHost || 'imappro.zoho.com',
    imap_port: smtp.imapPort || 993,
    email: smtp.user,
    password: smtp.pass,
    max_messages: maxMessages,
  });

  if (!pyRes?.success) {
    return {
      success: false,
      message: pyRes?.message || 'Zoho IMAP posta kutusu taranamadı.',
      scannedEmails: 0,
      foundInvitations: 0,
      matchedCount: 0,
      savedItems: [],
    };
  }

  const items = Array.isArray(pyRes.items) ? pyRes.items : [];
  const savedItems: Array<{ invitation_no: string; matched_sicil_no: string; pdf_filename: string }> = [];
  let matchedCount = 0;

  for (const item of items) {
    const res = upsertParsedInvitationToDb(item, db);
    if (res.saved) {
      savedItems.push(res);
      if (res.matched_sicil_no) matchedCount++;
    }
  }

  db.prepare(`
    INSERT INTO system_info (key, value) VALUES ('invitations_last_imap_sync', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(new Date().toISOString());

  return {
    success: true,
    message: `${pyRes.scanned_emails || 0} e-posta tarandı, ${savedItems.length} MVD davetiyesi (PDF) kaydedildi (${matchedCount} sicil eşleşti).`,
    scannedEmails: Number(pyRes.scanned_emails || 0),
    foundInvitations: savedItems.length,
    matchedCount,
    savedItems,
  };
}

export function parseAndSaveUploadedInvitationPdf(
  fileName: string,
  pdfBase64: string,
  dbInstance?: any
): {
  success: boolean;
  message: string;
  invitation_no?: string;
  matched_sicil_no?: string;
  pdf_filename?: string;
} {
  const db = dbInstance || getDb();
  ensureInvitationsTables(db);

  const cleanB64 = pdfBase64.replace(/^data:application\/pdf;base64,/i, '').trim();
  const pyRes = runPythonInvitationHelper({
    action: 'parse_pdf',
    pdf_base64: cleanB64,
    subject: fileName,
  });

  if (!pyRes?.success || !pyRes.fields) {
    return {
      success: false,
      message: pyRes?.message || 'PDF davetiye içeriği ayrıştırılamadı.',
    };
  }

  const saved = upsertParsedInvitationToDb(
    {
      subject: `Manuel PDF Yükleme: ${fileName}`,
      pdf_base64: cleanB64,
      pdf_size_bytes: pyRes.pdf_size_bytes,
      fields: pyRes.fields,
    },
    db
  );

  return {
    success: true,
    message: `Davetiye (${saved.invitation_no}) başarıyla kaydedildi -> ${saved.pdf_filename}`,
    invitation_no: saved.invitation_no,
    matched_sicil_no: saved.matched_sicil_no,
    pdf_filename: saved.pdf_filename,
  };
}

export function rematchAllInvitationsInDb(dbInstance?: any): {
  total: number;
  matched: number;
} {
  const db = dbInstance || getDb();
  ensureInvitationsTables(db);
  const rows = db.prepare('SELECT * FROM mvd_invitations ORDER BY id DESC').all() as MvdInvitationRecord[];
  let matched = 0;

  for (const r of rows) {
    if (r.match_confidence === 'MANUAL' && r.matched_sicil_no) {
      matched++;
      continue;
    }
    const res = upsertParsedInvitationToDb(
      {
        message_id: r.email_message_id,
        subject: r.email_subject,
        email_received_iso: r.email_received_iso,
        email_received_display: r.email_received_display,
        pdf_size_bytes: r.pdf_size_bytes,
        fields: {
          invitation_no: r.invitation_no,
          petition_no: r.petition_no,
          petition_date: r.petition_date,
          issuing_authority: r.issuing_authority,
          birth_date: r.birth_date,
          birth_place_ru: r.birth_place_ru,
          gender_ru: r.gender_ru,
          nationality_ru: r.nationality_ru,
          passport_masked: r.passport_masked,
          passport_last3: r.passport_last3,
          passport_issue_date: r.passport_issue_date,
          visa_category: r.visa_category,
          visa_multiplicity: r.visa_multiplicity,
          entry_from: r.entry_from,
          stay_until: r.stay_until,
          duration_days: r.duration_days,
          visa_issuance_place: r.visa_issuance_place,
          purpose_of_entry: r.purpose_of_entry,
          invited_by: r.invited_by,
        },
      },
      db
    );
    if (res.matched_sicil_no) matched++;
  }

  return { total: rows.length, matched };
}

export function manuallyLinkInvitationToEmployee(
  invitationNo: string,
  sicilNo: string,
  dbInstance?: any
): { success: boolean; message: string; record?: MvdInvitationRecord } {
  const db = dbInstance || getDb();
  ensureInvitationsTables(db);

  const inv = db
    .prepare('SELECT * FROM mvd_invitations WHERE invitation_no = ?')
    .get(invitationNo) as MvdInvitationRecord | undefined;
  if (!inv) {
    return { success: false, message: 'Davetiye kaydı bulunamadı.' };
  }

  let emp = db
    .prepare(
      'SELECT sicil_no, ad_soyad, tam_adi_kiril, pasaport_no, genel_durum, region, proje_adi FROM personnel WHERE sicil_no = ? LIMIT 1'
    )
    .get(String(sicilNo).trim()) as any;
  if (!emp) {
    try {
      const zEmp = db
        .prepare(
          'SELECT norm_sicil, tabel_no, fio_kiril, doc_series, doc_no, zup_department FROM zup_official_personnel WHERE norm_sicil = ? OR tabel_no = ? LIMIT 1'
        )
        .get(String(sicilNo).trim(), String(sicilNo).trim()) as any;
      if (zEmp) {
        const cleanKiril = String(zEmp.fio_kiril || '').replace(/\b\d{5,7}\b/g, '').trim();
        emp = {
          sicil_no: String(zEmp.norm_sicil || zEmp.tabel_no || sicilNo).trim(),
          ad_soyad: transliterateCyrillicToLatin(cleanKiril),
          tam_adi_kiril: cleanKiril,
          pasaport_no: `${zEmp.doc_series || ''} ${zEmp.doc_no || ''}`.trim(),
          genel_durum: '1C ZUP Resmi Liste',
          region: String(zEmp.zup_department || '1C ZUP'),
          proje_adi: String(zEmp.zup_department || '1C ZUP'),
        };
      }
    } catch {}
  }
  if (!emp) {
    return {
      success: false,
      message: `Sicil No (${sicilNo}) tüm personel ve 1C ZUP listesinde bulunamadı.`,
    };
  }

  const newFilename = buildInvitationPdfFilename(
    emp.sicil_no,
    emp.ad_soyad,
    inv.invitation_no,
    inv.passport_last3
  );
  const uploadDir = getInvitationsUploadDir();
  if (inv.pdf_filename && inv.pdf_filename !== newFilename) {
    const oldPath = path.join(uploadDir, inv.pdf_filename);
    const newPath = path.join(uploadDir, newFilename);
    if (fs.existsSync(oldPath)) {
      try {
        fs.renameSync(oldPath, newPath);
      } catch {}
    }
  }

  const effReg = resolveEffectiveRegion(emp.region, emp.proje_adi, 'Merkez');
  db.prepare(`
    UPDATE mvd_invitations
    SET matched_sicil_no = ?,
        matched_name = ?,
        matched_kiril_name = ?,
        matched_passport_full = ?,
        matched_status = ?,
        matched_region = ?,
        matched_project = ?,
        match_confidence = 'MANUAL',
        match_reason = 'İK Uzmanı Tarafından Sicil Bağlandı',
        pdf_filename = ?,
        updated_at = ?
    WHERE invitation_no = ?
  `).run(
    emp.sicil_no,
    emp.ad_soyad || '',
    emp.tam_adi_kiril || '',
    emp.pasaport_no || '',
    emp.genel_durum || '',
    effReg,
    emp.proje_adi || '',
    newFilename,
    new Date().toISOString(),
    invitationNo
  );

  const updated = db
    .prepare('SELECT * FROM mvd_invitations WHERE invitation_no = ?')
    .get(invitationNo) as MvdInvitationRecord;
  return {
    success: true,
    message: `Davetiye ${invitationNo} -> #${emp.sicil_no} ${emp.ad_soyad} (${newFilename}) olarak bağlandı.`,
    record: updated,
  };
}

export async function sendDailyInvitationsSummaryNotification(options?: {
  onlyUnnotifiedOrYesterday?: boolean;
  toEmails?: string[];
  ccEmails?: string[];
  dbInstance?: any;
}): Promise<{
  ok: boolean;
  emailSent: boolean;
  telegramSent: boolean;
  count: number;
  message: string;
}> {
  const db = options?.dbInstance || getDb();
  ensureInvitationsTables(db);

  // Sync latest Zoho IMAP emails before sending notification
  try {
    syncZohoInvitationsFromImap(50, db);
  } catch {}

  let rows: MvdInvitationRecord[] = [];
  if (options?.onlyUnnotifiedOrYesterday) {
    const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
    rows = db
      .prepare(
        `SELECT * FROM mvd_invitations
         WHERE notified_email = 0 OR email_received_iso >= ?
         ORDER BY id DESC`
      )
      .all(yesterday) as MvdInvitationRecord[];
  } else {
    rows = db
      .prepare('SELECT * FROM mvd_invitations ORDER BY id DESC LIMIT 40')
      .all() as MvdInvitationRecord[];
  }

  if (rows.length === 0) {
    return {
      ok: true,
      emailSent: false,
      telegramSent: false,
      count: 0,
      message: 'Bildirilecek yeni MVD davetiyesi bulunmadı.',
    };
  }

  const matchedCount = rows.filter((r) => Boolean(r.matched_sicil_no)).length;
  const unmatchedCount = rows.length - matchedCount;

  const highlights = rows.map((r, idx) => {
    const empLabel = r.matched_sicil_no
      ? `#${r.matched_sicil_no} ${r.matched_name} (${r.matched_region || 'Merkez'})`
      : `Yeni Aday — Sicil Bekliyor (${r.nationality_tr})`;
    return {
      title: `${idx + 1}. Davetiye No: ${r.invitation_no} (Hodataystvo: ${r.petition_no || '—'}) — ${empLabel}`,
      description: `Pasaport: ${r.passport_masked} (Veriliş: ${r.passport_issue_date || '—'}) • Doğum: ${r.birth_date || '—'} (${r.birth_place_ru || '—'}) • Uyruk/Cinsiyet: ${r.nationality_tr} / ${r.gender_ru || '—'} • Vize: ${r.visa_category} (${r.entry_from || '—'} – ${r.stay_until || '—'} • ${r.duration_days} Gün) • Konsolosluk: ${r.visa_issuance_place || '—'} • Dosya: ${r.pdf_filename}`,
    };
  });

  const emailRes = await sendCustomExecutiveEmail({
    to: options?.toEmails && options.toEmails.length > 0
      ? options.toEmails
      : ['zahid.rahimov@pondera.ru', 'nemat2313@gmail.com'],
    cc: options?.ccEmails !== undefined ? options.ccEmails : ['ikbildirim@pondera.ru'],
    subject: `[Pondera İK] Gelen MVD Elektronik Giriş Davetiyeleri Raporu (${rows.length} Davetiye)`,
    badgeText: 'PONDERA İK • MVD ELEKTRONİK DAVETİYE (ПРИГЛАШЕНИЕ) TAKİP SİSTEMİ',
    title: `📩 Gelen MVD Elektronik Giriş Davetiyeleri Özeti (${rows.length} Adet)`,
    greeting: 'Sayın İK Yönetimi,',
    intro: `Zoho Mail (ikbildirim@pondera.ru) posta kutusuna ulaşan MVD elektronik vize giriş davetiyeleri (PDF) otomatik olarak taranmış, tüm personel veritabanımızla karşılaştırılmış ve sunucu arşivine kaydedilmiştir. Toplam ${rows.length} davetiyenin ${matchedCount} adedi mevcut/beklenen personel sicili ile eşleşmiş, ${unmatchedCount} adedi ise yeni aday olarak kaydedilmiştir:`,
    highlights,
    closingNote:
      'Tüm davetiye PDF dosyalarını {Sicil_No}_{Ad_Soyad}.pdf formatında indirmek ve detayları incelemek için https://hr.pondera.network adresindeki "Davetiye Takip" sayfasını ziyaret edebilirsiniz.',
  });

  const tgLines = [
    `📩 <b>PONDERA İK — MVD ELEKTRONİK DAVETİYE RAPORU</b>`,
    `Toplam Gelen: <b>${rows.length} Davetiye</b> | Sicil Eşleşen: <b>${matchedCount}</b> | Yeni Aday: <b>${unmatchedCount}</b>`,
    ``,
    ...rows.slice(0, 12).map((r, i) => {
      const who = r.matched_sicil_no
        ? `<b>#${r.matched_sicil_no} ${r.matched_name}</b>`
        : `<i>Yeni Aday (${r.nationality_tr})</i>`;
      return `${i + 1}) <code>${r.invitation_no}</code> — ${who}\n   • Pasp: <code>${r.passport_masked}</code> (${r.passport_issue_date || '—'}) | Doğum: ${r.birth_date || '—'}\n   • Doğum Yeri: ${r.birth_place_ru || '—'}\n   • Vize: ${r.entry_from || '—'} → ${r.stay_until || '—'} (${r.duration_days}g) | ${r.visa_issuance_place || '—'}\n   • PDF: <code>${r.pdf_filename}</code>`;
    }),
    ``,
    `🔗 <a href="https://hr.pondera.network">Davetiye Takip Sayfasını Aç (hr.pondera.network)</a>`,
  ];

  const tgRes = await sendTelegramMessage(tgLines.join('\n'));

  if (emailRes.ok || tgRes.ok) {
    const upd = db.prepare(
      'UPDATE mvd_invitations SET notified_email = 1, notified_telegram = 1 WHERE id = ?'
    );
    for (const r of rows) {
      upd.run(r.id);
    }
  }

  return {
    ok: emailRes.ok || tgRes.ok,
    emailSent: emailRes.ok,
    telegramSent: tgRes.ok,
    count: rows.length,
    message: `E-posta: ${emailRes.ok ? 'Gönderildi' : emailRes.message} | Telegram: ${tgRes.ok ? 'Gönderildi' : tgRes.error || 'Hata'}`,
  };
}

