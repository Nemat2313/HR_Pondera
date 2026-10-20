import { getDb } from '@/lib/db';

const DEFAULT_BOT_TOKEN = '8675607954:AAF-jIXICz0y15KV5WuJfVbPyZ0j1Q7dnM4';
const DEFAULT_CHAT_ID = '-5302233059';

export function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  return {
    botToken,
    token: botToken,
    chatId: process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID,
  };
}

export function getMoscowTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const yyyy = map.year || '2026';
  const mm = map.month || '01';
  const dd = map.day || '01';
  const hh = map.hour === '24' ? '00' : map.hour || '00';
  const min = map.minute || '00';
  return {
    dateIso: `${yyyy}-${mm}-${dd}`,
    dateDisplay: `${dd}.${mm}.${yyyy}`,
    timeDisplay: `${hh}:${min}`,
    hour: Number(hh),
    minute: Number(min),
  };
}

export async function sendTelegramMessage(htmlText: string): Promise<{ ok: boolean; error?: string }> {
  const { botToken, chatId } = getTelegramConfig();
  const payload = JSON.stringify({
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  // Russian VPS datacenters block direct 149.154.160.0/20 (api.telegram.org) TCP connections;
  // try the edge HTTPS gateway first (~340ms from Moscow VPS), then fall back to api.telegram.org.
  const endpoints = [
    `https://telegram-api.vercel.app/bot${botToken}/sendMessage`,
    `https://api.telegram.org/bot${botToken}/sendMessage`,
  ];

  let lastError = 'Telegram network error';
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PonderaHR-Bot/2.6',
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (res.ok && data?.ok) {
        return { ok: true };
      }
      lastError = data?.description || `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err?.message || 'Telegram network error';
    }
  }
  return { ok: false, error: lastError };
}

function ensureSystemInfoTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_info (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function getSystemInfoValue(db: any, key: string): string | null {
  ensureSystemInfoTable(db);
  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

function setSystemInfoValue(db: any, key: string, value: string) {
  ensureSystemInfoTable(db);
  db.prepare(`
    INSERT INTO system_info (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function ensureOutboxTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type TEXT NOT NULL DEFAULT 'vks',
      html_text TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      claimed_at_ms INTEGER NOT NULL DEFAULT 0,
      delivered INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function enqueueTelegramOutbox(db: any, reportType: string, htmlText: string) {
  ensureOutboxTable(db);
  db.prepare(`
    INSERT INTO telegram_outbox (report_type, html_text, created_at_ms, claimed_at_ms, delivered)
    VALUES (?, ?, ?, 0, 0)
  `).run(reportType, htmlText, Date.now());
}

export function claimPendingOutboxMessages(
  db: any
): Array<{ id: number; report_type: string; html_text: string; text: string }> {
  ensureOutboxTable(db);
  const nowMs = Date.now();
  const staleClaimCutoff = nowMs - 5 * 1000;
  const rows = db
    .prepare(
      `SELECT id, report_type, html_text
       FROM telegram_outbox
       WHERE delivered = 0 AND claimed_at_ms < ?
       ORDER BY id ASC
       LIMIT 5`
    )
    .all(staleClaimCutoff) as Array<{ id: number; report_type: string; html_text: string }>;

  if (rows.length > 0) {
    const upd = db.prepare(`UPDATE telegram_outbox SET claimed_at_ms = ? WHERE id = ?`);
    for (const r of rows) {
      upd.run(nowMs, r.id);
    }
  }
  return rows.map((r) => ({ ...r, text: r.html_text }));
}

export function markOutboxDelivered(db: any, ids: number[]) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  ensureOutboxTable(db);
  const upd = db.prepare(`UPDATE telegram_outbox SET delivered = 1 WHERE id = ?`);
  for (const id of ids) {
    upd.run(Number(id));
  }
}

interface VksSnapshotState {
  timestampMs: number;
  totalRecords: number;
  totalSent: number;
  totalPdf: number;
  totalNoPdf: number;
  totalErrors: number;
  byKey: Record<string, { state: 'sent' | 'error' | 'other'; hasPdf: boolean; statusText: string }>;
}

function computeCurrentVksState(db: any): VksSnapshotState {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gosuslugi_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sicil_no TEXT NOT NULL,
      worker_name TEXT,
      citizenship TEXT,
      notification_type TEXT NOT NULL DEFAULT 'vks_salary',
      period_code TEXT DEFAULT '',
      application_no TEXT NOT NULL DEFAULT '',
      gosuslugi_status TEXT NOT NULL DEFAULT 'Отправлено',
      status_detail TEXT DEFAULT '',
      pdf_filename TEXT DEFAULT '',
      submitted_at TEXT NOT NULL,
      checked_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT '',
      UNIQUE(sicil_no, notification_type, period_code)
    );
  `);

  const rows = db
    .prepare(
      `SELECT sicil_no, period_code, application_no, gosuslugi_status, pdf_filename
       FROM gosuslugi_submissions
       WHERE LOWER(notification_type) = 'vks_salary'`
    )
    .all() as Array<{
    sicil_no: string;
    period_code: string;
    application_no: string;
    gosuslugi_status: string;
    pdf_filename: string;
  }>;

  let totalSent = 0;
  let totalPdf = 0;
  let totalNoPdf = 0;
  let totalErrors = 0;
  const byKey: VksSnapshotState['byKey'] = {};

  for (const r of rows) {
    const sicil = String(r.sicil_no || '').trim();
    const period = String(r.period_code || '').trim();
    const appNo = String(r.application_no || '').trim();
    const rawStatus = String(r.gosuslugi_status || '').trim();
    const pdf = String(r.pdf_filename || '').trim();
    const key = `${sicil}::${period}`;

    if (!appNo && /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(rawStatus)) {
      continue;
    }

    const isError = /^ошибк/i.test(rawStatus);
    const hasPdf = Boolean(pdf);
    const isSent =
      !isError &&
      (Boolean(appNo) ||
        hasPdf ||
        /отправлен|зарегистрирован|оказан|исполнен|принят|промежуточн|обработк|PDF не скачан/i.test(rawStatus));

    if (isError) {
      totalErrors++;
      byKey[key] = { state: 'error', hasPdf, statusText: rawStatus };
    } else if (isSent) {
      totalSent++;
      if (hasPdf) totalPdf++;
      else totalNoPdf++;
      byKey[key] = { state: 'sent', hasPdf, statusText: rawStatus };
    } else {
      byKey[key] = { state: 'other', hasPdf, statusText: rawStatus };
    }
  }

  return {
    timestampMs: Date.now(),
    totalRecords: totalSent + totalErrors,
    totalSent,
    totalPdf,
    totalNoPdf,
    totalErrors,
    byKey,
  };
}

/**
 * Checks VKS notification progress over the last 15 minutes across all computers.
 * Sends a Telegram summary ONLY if there was at least 1 new submission, error, or PDF update
 * in the last 15 minutes (unless force === true).
 */
export async function checkAndSendVks15MinReport(force = false): Promise<{
  sent: boolean;
  queued?: boolean;
  reason?: string;
  deltaSent?: number;
  deltaErrors?: number;
  deltaPdfs?: number;
  totals?: { totalSent: number; totalPdf: number; totalNoPdf: number; totalErrors: number; totalRecords: number };
}> {
  const db = getDb();
  const current = computeCurrentVksState(db);
  const rawPrev = getSystemInfoValue(db, 'telegram_vks_last_snapshot');

  let prev: VksSnapshotState | null = null;
  if (rawPrev) {
    try {
      prev = JSON.parse(rawPrev);
    } catch {
      prev = null;
    }
  }

  // If no baseline snapshot exists yet and not forced, save current state as baseline
  // unless there were rows updated in the last 15 minutes.
  let deltaSent = 0;
  let deltaErrors = 0;
  let deltaPdfs = 0;
  let statusChangedCount = 0;

  if (prev && prev.byKey) {
    for (const [k, curVal] of Object.entries(current.byKey)) {
      const oldVal = prev.byKey[k];
      if (!oldVal) {
        if (curVal.state === 'sent') deltaSent++;
        if (curVal.state === 'error') deltaErrors++;
        if (curVal.hasPdf) deltaPdfs++;
      } else {
        if (oldVal.state !== 'sent' && curVal.state === 'sent') deltaSent++;
        if (oldVal.state !== 'error' && curVal.state === 'error') deltaErrors++;
        if (!oldVal.hasPdf && curVal.hasPdf) deltaPdfs++;
        if (oldVal.statusText !== curVal.statusText) statusChangedCount++;
      }
    }
  } else {
    // First-time baseline: count rows submitted/checked in the last 15 minutes (in Moscow time)
    const mskCutoff = new Date(Date.now() - 15 * 60 * 1000);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(mskCutoff)) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    const cutoffMsk = `${parts.year}-${parts.month}-${parts.day} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}`;

    const recentRows = db
      .prepare(
        `SELECT application_no, gosuslugi_status, pdf_filename
         FROM gosuslugi_submissions
         WHERE LOWER(notification_type) = 'vks_salary'
           AND (submitted_at >= ? OR checked_at >= ?)`
      )
      .all(cutoffMsk, cutoffMsk) as Array<{
      application_no: string;
      gosuslugi_status: string;
      pdf_filename: string;
    }>;
    for (const r of recentRows) {
      const st = String(r.gosuslugi_status || '').trim();
      if (/^ошибк/i.test(st)) deltaErrors++;
      else deltaSent++;
      if (r.pdf_filename) deltaPdfs++;
    }
  }

  const hasAnyChange =
    deltaSent > 0 ||
    deltaErrors > 0 ||
    deltaPdfs > 0 ||
    statusChangedCount > 0 ||
    (prev !== null &&
      (current.totalSent !== prev.totalSent ||
        current.totalErrors !== prev.totalErrors ||
        current.totalPdf !== prev.totalPdf));

  if (!force && !hasAnyChange) {
    if (!prev) {
      setSystemInfoValue(db, 'telegram_vks_last_snapshot', JSON.stringify(current));
    }
    return {
      sent: false,
      reason: 'Son 15 dakikada VKS bildirimlerinde değişiklik yok.',
      deltaSent: 0,
      deltaErrors: 0,
      deltaPdfs: 0,
      totals: {
        totalSent: current.totalSent,
        totalPdf: current.totalPdf,
        totalNoPdf: current.totalNoPdf,
        totalErrors: current.totalErrors,
        totalRecords: current.totalRecords,
      },
    };
  }

  const msk = getMoscowTimeParts();
  const msg = [
    `🔔 <b>Gosuslugi VKS Bildirim Raporu (15 Dk Özeti)</b>`,
    `🕒 <i>Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay}</i>`,
    ``,
    `⏱ <b>Son 15 Dakikadaki Hareketler:</b>`,
    `• ✅ Gönderilen Bildirim: <b>+${deltaSent}</b>`,
    `• ❌ Oluşan Hata (Ошибка): <b>+${deltaErrors}</b>`,
    `• 📄 İndirilen / Eşleşen PDF: <b>+${deltaPdfs}</b>`,
    ``,
    `📊 <b>Ortak Sunucu Genel Toplam (Tüm Bilgisayarlar):</b>`,
    `• ✅ Toplam Başarılı Gönderim: <b>${current.totalSent}</b>`,
    `  ├ 📄 PDF İndirilen: <b>${current.totalPdf}</b>`,
    `  └ ⚡ PDF Bekleyen (Hızlı Gönderim): <b>${current.totalNoPdf}</b>`,
    `• ⚠️ Toplam Hatalı Kayıt (Ошибка): <b>${current.totalErrors}</b>`,
    `• 📌 <b>Genel Toplam İşlenen Kayıt: ${current.totalRecords}</b>`,
  ].join('\n');

  setSystemInfoValue(db, 'telegram_vks_last_snapshot', JSON.stringify(current));
  const tgRes = await sendTelegramMessage(msg);
  if (!tgRes.ok) {
    enqueueTelegramOutbox(db, 'vks', msg);
  }

  return {
    sent: tgRes.ok,
    queued: !tgRes.ok,
    reason: tgRes.error,
    deltaSent,
    deltaErrors,
    deltaPdfs,
    totals: {
      totalSent: current.totalSent,
      totalPdf: current.totalPdf,
      totalNoPdf: current.totalNoPdf,
      totalErrors: current.totalErrors,
      totalRecords: current.totalRecords,
    },
  };
}

// --- Daily 09:15 Moscow Time Document Expiry (Evrak Süreleri) Report ---

function parseToDate(val: any): Date | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000));
  }
  const str = String(val).trim();
  if (!str || str === '-' || str === 'Yok') return null;

  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        if (!isNaN(d.getTime())) return d;
      } else {
        const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(d.getTime())) return d;
      }
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length === 3) {
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getDaysDiff(dateVal: any, refDate: Date): number | null {
  const d = parseToDate(dateVal);
  if (!d) return null;
  const diffTime = d.getTime() - refDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function categorizeDays(
  days: number | null,
  docType?: string
): 'missing' | 'expired' | 'critical' | 'warning' | 'normal' | 'valid' {
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  if (docType === 'vize') {
    if (days <= 30) return 'critical';
    if (days <= 45) return 'warning';
    if (days <= 60) return 'normal';
    return 'valid';
  }
  if (days <= 15) return 'critical';
  if (days <= 30) return 'warning';
  if (days <= 60) return 'normal';
  return 'valid';
}

export async function sendDailyCompliance915Report(force = false): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const db = getDb();
  const msk = getMoscowTimeParts();

  if (!force) {
    // Only trigger at or after 09:15 Moscow time (between 09:15 and 09:59) once per day
    const isTimeWindow = msk.hour === 9 && msk.minute >= 15;
    if (!isTimeWindow) {
      return { sent: false, reason: `Not 09:15 MSK yet (current MSK: ${msk.timeDisplay})` };
    }
    const lastSentDate = getSystemInfoValue(db, 'telegram_compliance_last_sent_date');
    if (lastSentDate === msk.dateIso) {
      return { sent: false, reason: `Already sent today (${msk.dateIso})` };
    }
  }

  let referenceDateStr = '2026-10-18';
  let referenceDateDisplay = '18.10.2026';
  try {
    const freshVal = getSystemInfoValue(db, 'data_freshness');
    if (freshVal) {
      const parsedFresh = parseToDate(freshVal);
      if (parsedFresh) {
        referenceDateStr = parsedFresh.toISOString().slice(0, 10);
        const dd = String(parsedFresh.getUTCDate()).padStart(2, '0');
        const mm = String(parsedFresh.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = parsedFresh.getUTCFullYear();
        referenceDateDisplay = `${dd}.${mm}.${yyyy}`;
      }
    }
  } catch {}
  const referenceDate = new Date(referenceDateStr);

  const COMPLIANCE_GUNCEL_DURUMLAR = [
    'Mevcut',
    'Is Gezisi',
    'İş Gezisi',
    'Mazeret Izni',
    'Mazeret İzni',
    'Suresiz izin',
    'Suresiz Izin',
    'Süresiz İzin',
    'Süresiz izin',
    'Ucretsiz Izin',
    'Ücretsiz İzin',
    'Yillik Izin',
    'Yıllık İzin',
  ];

  const placeholders = COMPLIANCE_GUNCEL_DURUMLAR.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT
        id, region, uyruk, guncel_durum,
        pasaport_no, pasaport_gecerlilik,
        vize_no, vize_bitis_tarihi,
        propusk_no, propusk_bitis_tarihi,
        patent_alis_tarihi, patent_bitis_tarihi,
        migrasyon_no, all_data_json
      FROM personnel
      WHERE guncel_durum IN (${placeholders})
      ORDER BY id ASC`
    )
    .all(...COMPLIANCE_GUNCEL_DURUMLAR) as any[];

  const docDefinitions = [
    { id: 'pasaport', label: 'Pasaport' },
    { id: 'vize', label: 'Vize' },
    { id: 'propusk', label: 'Propusk (Saha Kartı)' },
    { id: 'patent', label: 'Patent / Çalışma İzni' },
    { id: 'registrasyon', label: 'Registrasyon' },
    { id: 'daktilo', label: 'Daktiloskopiya' },
    { id: 'dms', label: 'Sağlık / DMS Sigorta' },
    { id: 'dil', label: 'Dil Sertifikası' },
  ];

  const docStats: Record<
    string,
    {
      label: string;
      totalChecked: number;
      validCount: number;
      warningCount: number;
      criticalCount: number;
      expiredCount: number;
      missingCount: number;
    }
  > = {};

  for (const d of docDefinitions) {
    docStats[d.id] = {
      label: d.label,
      totalChecked: 0,
      validCount: 0,
      warningCount: 0,
      criticalCount: 0,
      expiredCount: 0,
      missingCount: 0,
    };
  }

  let totalDocsCount = 0;
  let totalExpired = 0;
  let totalCritical = 0;
  let totalWarning = 0;
  let totalMissing = 0;
  let totalValid = 0;

  const regionBreakdown: Record<
    string,
    { region: string; total: number; expired: number; critical: number; missing: number }
  > = {};

  for (const r of rows) {
    let rawJson: any = {};
    if (r.all_data_json) {
      try {
        rawJson = JSON.parse(r.all_data_json);
      } catch {}
    }

    const reg = r.region || 'Bilinmiyor';
    if (!regionBreakdown[reg]) {
      regionBreakdown[reg] = { region: reg, total: 0, expired: 0, critical: 0, missing: 0 };
    }
    regionBreakdown[reg].total++;

    const uyrukUpper = (r.uyruk || '').trim().toUpperCase();
    const regionTrim = (r.region || '').trim();
    const kartTuru = (rawJson['Çalışma Kart Türü'] || '').toUpperCase();

    const isRf =
      uyrukUpper === 'RUSYA' ||
      uyrukUpper === 'BEYAZ RUSYA' ||
      kartTuru === 'MUAF' ||
      kartTuru === 'РФ' ||
      uyrukUpper.includes('RUS');
    const isEaes =
      ['KIRGIZISTAN', 'KAZAKISTAN', 'ERMENISTAN'].includes(uyrukUpper) ||
      kartTuru.includes('ЕАЭС') ||
      kartTuru.includes('EAES');
    const isVks = kartTuru.includes('ВКС') || kartTuru.includes('VKS');
    const isPatent =
      kartTuru.includes('ПАТЕНТ') ||
      kartTuru.includes('PATENT') ||
      (['OZBEKISTAN', 'TACIKISTAN', 'AZERBAYCAN'].includes(uyrukUpper) && !isVks && !isRf);
    const isVnjRvp = ['ВНЖ', 'РВП', 'VNJ', 'RVP'].some((x: string) => kartTuru.includes(x));
    const isQuotaRnr = ['КВОТА', 'KOTA', 'РНР', 'RNR'].some((x: string) => kartTuru.includes(x));

    for (const d of docDefinitions) {
      let isApplicable = false;
      if (d.id === 'pasaport') {
        isApplicable = true;
      } else if (d.id === 'propusk') {
        if (regionTrim !== 'Merkez Ofis' && regionTrim !== 'Moskova' && regionTrim !== 'Ust Luga') {
          isApplicable = true;
        }
      } else if (!isRf) {
        if (d.id === 'registrasyon' || d.id === 'dms' || d.id === 'daktilo') {
          isApplicable = true;
        } else if (d.id === 'patent') {
          if (!isVnjRvp && !isEaes) isApplicable = true;
        } else if (d.id === 'vize') {
          if (!isVnjRvp && !isEaes && !isPatent) {
            if (
              isVks ||
              isQuotaRnr ||
              ['HINDISTAN', 'TURKIYE', 'BANGLADES', 'CIN', 'TURKMENISTAN', 'PAKISTAN'].includes(uyrukUpper)
            ) {
              isApplicable = true;
            }
          }
        } else if (d.id === 'dil') {
          if ((isPatent || isQuotaRnr) && rawJson['Dil Sertifikası Bitiş Tarihi']) {
            isApplicable = true;
          }
        }
      }

      if (!isApplicable) continue;

      let status: 'missing' | 'expired' | 'critical' | 'warning' | 'normal' | 'valid' = 'missing';
      if (d.id === 'pasaport') {
        status = isRf ? 'valid' : categorizeDays(getDaysDiff(r.pasaport_gecerlilik, referenceDate), d.id);
      } else if (d.id === 'vize') {
        status = categorizeDays(getDaysDiff(r.vize_bitis_tarihi, referenceDate), d.id);
      } else if (d.id === 'propusk') {
        status = categorizeDays(getDaysDiff(r.propusk_bitis_tarihi, referenceDate), d.id);
      } else if (d.id === 'patent') {
        const dt = r.patent_bitis_tarihi || rawJson['Çalışma Kartı Bitiş Tarihi'];
        status = categorizeDays(getDaysDiff(dt, referenceDate), d.id);
      } else if (d.id === 'registrasyon') {
        status = categorizeDays(getDaysDiff(rawJson['Registrasyon Bitiş Tarihi'], referenceDate), d.id);
      } else if (d.id === 'dms') {
        status = categorizeDays(getDaysDiff(rawJson['DMS Bitiş Tarihi'], referenceDate), d.id);
      } else if (d.id === 'daktilo') {
        const dt = rawJson['Daktiloskopiya Bitis Tarihi'];
        const hasRec = Boolean(
          rawJson['Daktiloskopiya Seri No'] ||
            rawJson['Daktiloskopiya Alış Tarihi'] ||
            rawJson['Daktiloskopiya Başlangıç Tarihi']
        );
        if (dt) status = categorizeDays(getDaysDiff(dt, referenceDate), d.id);
        else if (hasRec) status = 'valid';
        else status = 'missing';
      } else if (d.id === 'dil') {
        status = categorizeDays(getDaysDiff(rawJson['Dil Sertifikası Bitiş Tarihi'], referenceDate), d.id);
      }

      docStats[d.id].totalChecked++;
      totalDocsCount++;

      if (status === 'expired') {
        docStats[d.id].expiredCount++;
        totalExpired++;
        regionBreakdown[reg].expired++;
      } else if (status === 'critical') {
        docStats[d.id].criticalCount++;
        totalCritical++;
        regionBreakdown[reg].critical++;
      } else if (status === 'warning') {
        docStats[d.id].warningCount++;
        totalWarning++;
      } else if (status === 'normal' || status === 'valid') {
        docStats[d.id].validCount++;
        totalValid++;
      } else {
        docStats[d.id].missingCount++;
        totalMissing++;
        regionBreakdown[reg].missing++;
      }
    }
  }

  const complianceRate = totalDocsCount > 0 ? Math.round((totalValid / totalDocsCount) * 100) : 0;

  const shortLabels: Record<string, string> = {
    pasaport: 'Pasaport',
    vize: 'Vize',
    propusk: 'Propusk',
    patent: 'Patent / İzin',
    registrasyon: 'Registrasyon',
    daktilo: 'Daktiloskopiya',
    dms: 'Sağlık / DMS',
    dil: 'Dil Sertifikası',
  };

  const hdr = `${'Evrak Türü'.padEnd(15)} ${'Top.'.padStart(5)} ${'Geçm'.padStart(5)} ${'Krit'.padStart(5)} ${'Uyar'.padStart(5)} ${'Eksik'.padStart(5)} ${'Geçer'.padStart(6)}`;
  const sep = '-'.repeat(hdr.length);
  const docTableRows = docDefinitions.map((d) => {
    const st = docStats[d.id];
    const name = (shortLabels[d.id] || st.label).slice(0, 15).padEnd(15);
    return `${name} ${String(st.totalChecked).padStart(5)} ${String(st.expiredCount).padStart(5)} ${String(st.criticalCount).padStart(5)} ${String(st.warningCount).padStart(5)} ${String(st.missingCount).padStart(5)} ${String(st.validCount).padStart(6)}`;
  });
  const totalRow = `${'TOPLAM'.padEnd(15)} ${String(totalDocsCount).padStart(5)} ${String(totalExpired).padStart(5)} ${String(totalCritical).padStart(5)} ${String(totalWarning).padStart(5)} ${String(totalMissing).padStart(5)} ${String(totalValid).padStart(6)}`;

  const regHdr = `${'Bölge'.padEnd(16)} ${'Kişi'.padStart(5)} ${'Geçmiş'.padStart(6)} ${'Kritik'.padStart(6)} ${'Eksik'.padStart(6)}`;
  const regSep = '-'.repeat(regHdr.length);
  const topRegionRows = Object.values(regionBreakdown)
    .sort((a, b) => b.expired + b.critical - (a.expired + a.critical))
    .slice(0, 6)
    .map((reg) => {
      const rName = reg.region.slice(0, 16).padEnd(16);
      return `${rName} ${String(reg.total).padStart(5)} ${String(reg.expired).padStart(6)} ${String(reg.critical).padStart(6)} ${String(reg.missing).padStart(6)}`;
    });

  const msg = [
    `📋 <b>HR Pondera — Günlük Evrak Süreleri İstatistik Raporu</b>`,
    `🕘 <i>Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay} (Referans: ${referenceDateDisplay})</i>`,
    ``,
    `👥 <b>Aktif Personel:</b> <b>${rows.length}</b> kişi`,
    `📑 <b>Kontrol Edilen Toplam Evrak:</b> <b>${totalDocsCount}</b> adet`,
    `✅ <b>Genel Evrak Uyum Oranı:</b> <b>%${complianceRate}</b>`,
    ``,
    `📊 <b>Genel Evrak Durum Özeti:</b>`,
    `🔴 Süresi Geçmiş (Expired): <b>${totalExpired}</b>`,
    `🟠 Kritik (0-15 Gün / Vize ≤30g): <b>${totalCritical}</b>`,
    `🟡 Yaklaşan Uyarı (16-30 Gün / Vize ≤45g): <b>${totalWarning}</b>`,
    `⚪ Eksik Evrak (Missing): <b>${totalMissing}</b>`,
    `🟢 Geçerli (Valid): <b>${totalValid}</b>`,
    ``,
    `📂 <b>Evrak Türüne Göre Dağılım (Tablo):</b>`,
    `<pre>${[hdr, sep, ...docTableRows, sep, totalRow].join('\n')}</pre>`,
    ``,
    `🏗 <b>Bölge Bazlı Özet (İlk 6 Bölge):</b>`,
    `<pre>${[regHdr, regSep, ...topRegionRows].join('\n')}</pre>`,
  ].join('\n');

  setSystemInfoValue(db, 'telegram_compliance_last_sent_date', msk.dateIso);
  const tgRes = await sendTelegramMessage(msg);
  if (!tgRes.ok) {
    enqueueTelegramOutbox(db, 'compliance', msg);
  }
  return { sent: tgRes.ok, reason: tgRes.error };
}
