import net from 'net';
import tls from 'tls';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getDb } from './db';
import { classifyWorkPermitFromRow } from './workPermits';
import {
  computeZupVsRealReconciliation,
  extractZupReportDate,
  parseZupWorksheetRows,
  saveZupRecordsToDb,
} from './zupReconciliation';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  zupApiToken: string;
  zupAutoFolder: string;
  imapHost?: string;
  imapPort?: number;
  updatedAt?: string;
}

export interface EmailReportRule {
  id: 'daily_compliance' | 'zup_vs_real' | 'vks_gosuslugi' | 'turnover_summary';
  titleTr: string;
  titleRu: string;
  descriptionTr: string;
  descriptionRu: string;
  enabled: boolean;
  frequency: 'daily' | 'weekdays' | 'weekly' | 'on_upload';
  scheduleTime: string; // HH:mm (Moscow time)
  toEmails: string[];
  ccEmails: string[];
  attachSummaryTable: boolean;
  lastSentAt?: string | null;
  lastStatus?: string | null;
}

export interface EmailLogEntry {
  id: number;
  report_id: string;
  subject: string;
  to_list: string;
  cc_list: string;
  status: 'SENT' | 'QUEUED' | 'ERROR';
  detail: string;
  created_at: string;
}

function getMoscowClock(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
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
  const wkMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = wkMap[map.weekday || 'Mon'] ?? 1;

  return {
    dateIso: `${yyyy}-${mm}-${dd}`,
    dateDisplay: `${dd}.${mm}.${yyyy}`,
    timeDisplay: `${hh}:${min}`,
    hour: Number(hh),
    minute: Number(min),
    weekday,
  };
}

const LEGACY_PLACEHOLDER_EMAILS = new Set([
  'ik@pondera.ru',
  'saha.koordinasyon@pondera.ru',
  'bordro.zup@pondera.ru',
  'vks.operasyon@pondera.ru',
  'yonetim@pondera.ru',
  'info@pondera.ru',
]);

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  enabled: false,
  host: 'smtppro.zoho.com',
  port: 465,
  secure: true,
  user: 'ikbildirim@pondera.ru',
  pass: '',
  fromName: 'Pondera İK Bildirim Sistemi',
  fromEmail: 'ikbildirim@pondera.ru',
  zupApiToken: 'PONDERA-ZUP-SYNC-2026-SECRET',
  zupAutoFolder: '/var/www/hr_pondera/uploads/zup_auto',
  imapHost: 'imappro.zoho.com',
  imapPort: 993,
};

const DEFAULT_REPORT_RULES: EmailReportRule[] = [
  {
    id: 'daily_compliance',
    titleTr: '1. Günlük Eksik Evrak & Süre Analitiği Raporu',
    titleRu: '1. Ежедневный отчет по истекающим и недостающим документам',
    descriptionTr:
      'Pasaport, Vize, Patent, Registrasyon, DMS ve Propusk süresi dolan veya 15 gün içinde dolacak personellerin şantiye bazlı günlük raporu (Telegram ile eşzamanlı).',
    descriptionRu:
      'Ежедневная сводка по сотрудникам с истекшими или критическими сроками паспортов, виз, патентов и пропусков по участкам.',
    enabled: true,
    frequency: 'daily',
    scheduleTime: '09:15',
    toEmails: ['ikbildirim@pondera.ru'],
    ccEmails: [],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
  {
    id: 'zup_vs_real',
    titleTr: '2. 1C ZUP (Resmi) vs eBA (Real) Kadro & Veri Fark Özeti Raporu',
    titleRu: '2. Сводка расхождений 1С ЗУП (Офиц.) и eBA (Реал)',
    descriptionTr:
      'Mevcut çalışanların kaçının 1C ZUP resmi bordroda çalıştığı, gerçek çıkışlı olup ZUP’ta aktif kalanlar, şantiye transferleri ve pasaport/İNN/statü farkları (Telegram ile eşzamanlı).',
    descriptionRu:
      'Сверка численности 1С ЗУП и eBA Real: уволенные на площадке, переводы между объектами и расхождения паспортов/ИНН/статусов.',
    enabled: true,
    frequency: 'daily',
    scheduleTime: '09:20',
    toEmails: ['ikbildirim@pondera.ru'],
    ccEmails: [],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
  {
    id: 'vks_gosuslugi',
    titleTr: '3. VKS (Yüksek Nitelikli Uzman) Gosuslugi & MVD Bildirim Raporu',
    titleRu: '3. Отчет по уведомлениям ВКС (Госуслуги / МВД)',
    descriptionTr:
      '15 dakikalık Gosuslugi VKS başvuru hareketleri, MVD bulunamadı uyarıları ve günlük yasal MVD / Gosuslugi bildirim özeti (Telegram ile eşzamanlı).',
    descriptionRu:
      'Контроль подачи уведомлений в МВД через Госуслуги по специалистам ВКС (синхронно с Telegram).',
    enabled: true,
    frequency: 'daily',
    scheduleTime: '09:30',
    toEmails: ['ikbildirim@pondera.ru'],
    ccEmails: [],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
  {
    id: 'turnover_summary',
    titleTr: '4. Yönetim & Turnover (Giriş / Çıkış & VKS Oranı) Raporu',
    titleRu: '4. Управленческий отчет по текучести кадров (Прием / Увольнение / ВКС)',
    descriptionTr:
      'Şirket içi şantiye transferleri hariç gerçek işten çıkışlar, aktif kadro, VKS uzman oranları ve şantiye kırılımlı yönetim özeti.',
    descriptionRu:
      'Отчет для руководства по численности, внутренним переводам и доле специалистов ВКС.',
    enabled: true,
    frequency: 'weekdays',
    scheduleTime: '10:00',
    toEmails: ['ikbildirim@pondera.ru'],
    ccEmails: [],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
];

function ensureEmailTables(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_info (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS email_delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      to_list TEXT NOT NULL,
      cc_list TEXT DEFAULT '',
      status TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
}

function getSysInfo(db: any, key: string): string | null {
  ensureEmailTables(db);
  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
}

function setSysInfo(db: any, key: string, value: string) {
  ensureEmailTables(db);
  db.prepare(`
    INSERT INTO system_info (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getSmtpConfig(dbInstance?: any): SmtpConfig {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get('email_smtp_config') as
    | { value?: string }
    | undefined;
  if (!row?.value) {
    return { ...DEFAULT_SMTP_CONFIG };
  }
  try {
    const parsed = JSON.parse(row.value);
    return {
      ...DEFAULT_SMTP_CONFIG,
      ...parsed,
      port: Number(parsed.port) || 465,
    };
  } catch {
    return { ...DEFAULT_SMTP_CONFIG };
  }
}

function normalizeSecretPassInput(incoming: string | undefined, existing: string): string {
  if (incoming === undefined) return existing;
  const trimmed = String(incoming).trim();
  if (!trimmed) return existing;
  if (/^[•*]+$/.test(trimmed)) return existing;
  // Handle accidental paste right next to masked bullets
  if (trimmed.includes('••••')) {
    const stripped = trimmed.replace(/•+/g, '').trim();
    return stripped || existing;
  }
  return trimmed;
}

export function saveSmtpConfig(config: Partial<SmtpConfig>, dbInstance?: any): SmtpConfig {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  const current = getSmtpConfig(db);
  const nextUser = (config.user ?? current.user ?? DEFAULT_SMTP_CONFIG.user).trim();
  const rawFromEmail = (config.fromEmail ?? current.fromEmail ?? nextUser).trim();
  const nextHost = (config.host ?? current.host ?? DEFAULT_SMTP_CONFIG.host).trim();

  // Zoho Mail strictly enforces From === authenticated user unless alias is verified
  const safeFromEmail =
    nextHost.toLowerCase().includes('zoho') || !rawFromEmail || rawFromEmail === 'info@pondera.ru'
      ? nextUser
      : rawFromEmail;

  const merged: SmtpConfig = {
    ...current,
    ...config,
    host: nextHost,
    user: nextUser,
    fromEmail: safeFromEmail,
    pass: normalizeSecretPassInput(config.pass, current.pass),
    port: Number(config.port ?? current.port) || 465,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO system_info (key, value) VALUES ('email_smtp_config', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(merged));

  return merged;
}

function sanitizeRecipientList(list: string[], fallbackEmail?: string): string[] {
  const cleaned = (Array.isArray(list) ? list : [])
    .map((e) => String(e || '').trim().toLowerCase())
    .filter((e) => e.includes('@') && !LEGACY_PLACEHOLDER_EMAILS.has(e));
  const unique = Array.from(new Set(cleaned));
  if (unique.length === 0 && fallbackEmail) {
    return [fallbackEmail.toLowerCase()];
  }
  return unique;
}

export function getEmailReportRules(dbInstance?: any): EmailReportRule[] {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  const smtp = getSmtpConfig(db);
  const defaultTo = (smtp.user && !LEGACY_PLACEHOLDER_EMAILS.has(smtp.user.toLowerCase()))
    ? smtp.user.toLowerCase()
    : 'ikbildirim@pondera.ru';

  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get('email_report_rules') as
    | { value?: string }
    | undefined;
  if (!row?.value) {
    return DEFAULT_REPORT_RULES.map((r) => ({ ...r, toEmails: [defaultTo] }));
  }
  try {
    const saved = JSON.parse(row.value) as EmailReportRule[];
    if (!Array.isArray(saved)) {
      return DEFAULT_REPORT_RULES.map((r) => ({ ...r, toEmails: [defaultTo] }));
    }
    return DEFAULT_REPORT_RULES.map((def) => {
      const found = saved.find((s) => s.id === def.id);
      if (!found) return { ...def, toEmails: [defaultTo] };
      const cleanTo = sanitizeRecipientList(found.toEmails, defaultTo);
      const cleanCc = sanitizeRecipientList(found.ccEmails);
      return {
        ...def,
        ...found,
        titleTr: def.titleTr,
        titleRu: def.titleRu,
        descriptionTr: def.descriptionTr,
        descriptionRu: def.descriptionRu,
        toEmails: cleanTo,
        ccEmails: cleanCc,
      };
    });
  } catch {
    return DEFAULT_REPORT_RULES.map((r) => ({ ...r, toEmails: [defaultTo] }));
  }
}

export function saveEmailReportRules(rules: EmailReportRule[], dbInstance?: any): EmailReportRule[] {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  db.prepare(`
    INSERT INTO system_info (key, value) VALUES ('email_report_rules', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(rules));
  return getEmailReportRules(db);
}

export function getEmailLogs(limit = 25, dbInstance?: any): EmailLogEntry[] {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  return db
    .prepare('SELECT * FROM email_delivery_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as EmailLogEntry[];
}

function logEmailDelivery(
  db: any,
  reportId: string,
  subject: string,
  toList: string[],
  ccList: string[],
  status: 'SENT' | 'QUEUED' | 'ERROR',
  detail: string
) {
  ensureEmailTables(db);
  const msk = getMoscowClock();
  db.prepare(`
    INSERT INTO email_delivery_logs (report_id, subject, to_list, cc_list, status, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    reportId,
    subject,
    toList.join(', '),
    ccList.join(', '),
    status,
    detail,
    `${msk.dateDisplay} ${msk.timeDisplay} MSK`
  );
}

/**
 * Zero-dependency RFC-compliant SMTP over SSL/TLS client.
 * Sends RCPT TO sequentially one recipient at a time so multi-recipient To + CC lists
 * never pipeline-collide, and supports Zoho custom-domain auto-fallback.
 */
function attemptSmtpSendSingleHost(
  host: string,
  config: SmtpConfig,
  to: string[],
  cc: string[],
  subject: string,
  htmlBody: string
): Promise<{ ok: boolean; detail: string; code?: number }> {
  const recipients = Array.from(new Set([...to, ...cc].map((e) => e.trim()).filter(Boolean)));
  if (recipients.length === 0) {
    return Promise.resolve({ ok: false, detail: 'Alıcı (To / CC) adresi tanımlanmamış.' });
  }

  const senderEmail = (
    host.toLowerCase().includes('zoho')
      ? config.user
      : config.fromEmail || config.user
  ).trim();

  return new Promise((resolve) => {
    const timeoutMs = 15000;
    let settled = false;
    const finish = (
      ok: boolean,
      detail: string,
      socket?: net.Socket | tls.TLSSocket,
      code?: number
    ) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {}
      resolve({ ok, detail, code });
    };

    const onConnect = (socket: net.Socket | tls.TLSSocket) => {
      let step = 0;
      let buffer = '';
      let rcptIndex = 0;
      let acceptedCount = 0;
      const rejectedRecipients: string[] = [];

      const sendLine = (line: string) => {
        socket.write(line + '\r\n');
      };

      socket.setTimeout(timeoutMs, () => {
        finish(false, `SMTP bağlantı zaman aşımı (${host}:${config.port})`, socket);
      });

      socket.on('error', (err) => {
        finish(false, `SMTP bağlantı hatası (${host}): ${err.message}`, socket);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!buffer.endsWith('\r\n')) return;
        const lines = buffer.replace(/\r\n$/, '').split('\r\n');
        const lastLine = lines[lines.length - 1] || '';
        // Multi-line SMTP response continues if 4th char is '-'
        if (lastLine.length >= 4 && lastLine[3] === '-') return;
        const code = parseInt(lastLine.slice(0, 3), 10);
        buffer = '';

        // Step 6 handles per-recipient RCPT TO responses individually
        if (step === 6) {
          const currentRcpt = recipients[rcptIndex];
          if (code >= 200 && code < 300) {
            acceptedCount++;
          } else {
            rejectedRecipients.push(`${currentRcpt} (${code})`);
          }
          rcptIndex++;
          if (rcptIndex < recipients.length) {
            sendLine(`RCPT TO:<${recipients[rcptIndex]}>`);
            return;
          }
          if (acceptedCount === 0) {
            finish(
              false,
              `Hiçbir alıcı adresi sunucu tarafından kabul edilmedi: ${rejectedRecipients.join(', ')}`,
              socket,
              code
            );
            return;
          }
          step = 7;
          sendLine(`DATA`);
          return;
        }

        if (code >= 400) {
          finish(false, `SMTP Sunucu Yanıtı (${host} -> ${code}): ${lastLine}`, socket, code);
          return;
        }

        if (step === 0 && code === 220) {
          step = 1;
          sendLine(`EHLO hr.pondera.network`);
        } else if (step === 1 && code === 250) {
          step = 2;
          sendLine(`AUTH LOGIN`);
        } else if (step === 2 && code === 334) {
          step = 3;
          sendLine(Buffer.from(config.user.trim(), 'utf8').toString('base64'));
        } else if (step === 3 && code === 334) {
          step = 4;
          sendLine(Buffer.from(config.pass, 'utf8').toString('base64'));
        } else if (step === 4 && code === 235) {
          step = 5;
          sendLine(`MAIL FROM:<${senderEmail}>`);
        } else if (step === 5 && code === 250) {
          step = 6;
          rcptIndex = 0;
          sendLine(`RCPT TO:<${recipients[0]}>`);
        } else if (step === 7 && code === 354) {
          step = 8;
          const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
          const encodedFromName = `=?UTF-8?B?${Buffer.from(
            config.fromName || 'Pondera İK Bildirim Sistemi',
            'utf8'
          ).toString('base64')}?=`;
          const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2, 9)}@pondera.ru>`;
          const headers = [
            `From: ${encodedFromName} <${senderEmail}>`,
            `To: ${to.join(', ')}`,
            ...(cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
            `Subject: ${encodedSubject}`,
            `Message-ID: ${msgId}`,
            `Date: ${new Date().toUTCString()}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=UTF-8`,
            `Content-Transfer-Encoding: base64`,
            ``,
            Buffer.from(htmlBody, 'utf8')
              .toString('base64')
              .replace(/(.{76})/g, '$1\r\n'),
            `.`,
          ].join('\r\n');
          sendLine(headers);
        } else if (step === 8 && code === 250) {
          step = 9;
          sendLine(`QUIT`);
          const rejectSuffix =
            rejectedRecipients.length > 0
              ? ` (Atlanan alıcı: ${rejectedRecipients.join(', ')})`
              : '';
          finish(
            true,
            `E-posta başarıyla gönderildi (${acceptedCount} alıcı, ${host})${rejectSuffix}.`,
            socket,
            250
          );
        }
      });
    };

    try {
      if (config.secure || config.port === 465) {
        const tlsSocket = tls.connect(
          {
            host,
            port: config.port,
            servername: host,
            rejectUnauthorized: false,
          },
          () => onConnect(tlsSocket)
        );
        tlsSocket.on('error', (err) =>
          finish(false, `TLS Bağlantı Hatası (${host}): ${err.message}`, tlsSocket)
        );
      } else {
        const netSocket = net.createConnection({ host, port: config.port }, () =>
          onConnect(netSocket)
        );
        netSocket.on('error', (err) =>
          finish(false, `TCP Bağlantı Hatası (${host}): ${err.message}`, netSocket)
        );
      }
    } catch (err: any) {
      finish(false, err?.message || 'SMTP başlatılamadı.');
    }
  });
}

async function sendRawSmtpMail(
  config: SmtpConfig,
  to: string[],
  cc: string[],
  subject: string,
  htmlBody: string
): Promise<{ ok: boolean; detail: string }> {
  if (!config.host || !config.user || !config.pass) {
    return {
      ok: false,
      detail: 'SMTP sunucu veya şifre bilgisi henüz tanımlanmadı.',
    };
  }

  const primaryHost = config.host.trim();
  const firstAttempt = await attemptSmtpSendSingleHost(primaryHost, config, to, cc, subject, htmlBody);
  if (firstAttempt.ok) {
    return { ok: true, detail: firstAttempt.detail };
  }

  // Automatic Zoho custom-domain fallback (smtp.zoho.com <-> smtppro.zoho.com)
  const lowerHost = primaryHost.toLowerCase();
  if (lowerHost === 'smtp.zoho.com' || lowerHost === 'mail.zoho.com') {
    const retryPro = await attemptSmtpSendSingleHost(
      'smtppro.zoho.com',
      { ...config, port: 465, secure: true },
      to,
      cc,
      subject,
      htmlBody
    );
    if (retryPro.ok) return { ok: true, detail: retryPro.detail };
  } else if (lowerHost === 'smtppro.zoho.com') {
    const retryStd = await attemptSmtpSendSingleHost(
      'smtp.zoho.com',
      { ...config, port: 465, secure: true },
      to,
      cc,
      subject,
      htmlBody
    );
    if (retryStd.ok) return { ok: true, detail: retryStd.detail };
  }

  return { ok: false, detail: firstAttempt.detail };
}

function parseExcelOrStrDate(val: any): Date | null {
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
      const d =
        parts[0].length === 4
          ? new Date(`${parts[0]}-${parts[1]}-${parts[2]}`)
          : new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      if (!isNaN(d.getTime())) return d;
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

function computeLiveComplianceSummary(db: any) {
  let referenceDateStr = '2026-11-06';
  let referenceDateDisplay = '06.11.2026';
  try {
    const freshVal = getSysInfo(db, 'data_freshness');
    if (freshVal) {
      const parsedFresh = parseExcelOrStrDate(freshVal);
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

  const activeStatuses = [
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
  const placeholders = activeStatuses.map(() => '?').join(', ');
  let rows: any[] = [];
  try {
    rows = db
      .prepare(
        `SELECT id, region, uyruk, guncel_durum, pasaport_gecerlilik, vize_bitis_tarihi, propusk_bitis_tarihi, patent_bitis_tarihi, all_data_json
         FROM personnel WHERE guncel_durum IN (${placeholders}) ORDER BY id ASC`
      )
      .all(...activeStatuses) as any[];
  } catch {
    rows = [];
  }

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

  const getDaysDiff = (dateVal: any): number | null => {
    const d = parseExcelOrStrDate(dateVal);
    if (!d) return null;
    return Math.ceil((d.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const catDays = (days: number | null, docType?: string) => {
    if (days === null) return 'missing';
    if (days < 0) return 'expired';
    if (docType === 'vize') {
      if (days <= 30) return 'critical';
      if (days <= 45) return 'warning';
      return 'valid';
    }
    if (days <= 15) return 'critical';
    if (days <= 30) return 'warning';
    return 'valid';
  };

  for (const r of rows) {
    let rawJson: any = {};
    if (r.all_data_json) {
      try {
        rawJson = JSON.parse(r.all_data_json);
      } catch {}
    }
    const reg = r.region || 'Diğer';
    if (!regionBreakdown[reg]) {
      regionBreakdown[reg] = { region: reg, total: 0, expired: 0, critical: 0, missing: 0 };
    }
    regionBreakdown[reg].total++;

    const uyrukUpper = (r.uyruk || '').trim().toUpperCase();
    const regionTrim = (r.region || '').trim();
    const kartTuru = (rawJson['Çalışma Kart Türü'] || '').toUpperCase();
    const permitCategory = classifyWorkPermitFromRow(r.uyruk, rawJson);

    const isRf =
      uyrukUpper === 'RUSYA' ||
      uyrukUpper === 'BEYAZ RUSYA' ||
      kartTuru === 'MUAF' ||
      kartTuru === 'РФ' ||
      uyrukUpper.includes('RUS') ||
      permitCategory === 'RF_CITIZEN';
    const isEaes =
      ['KIRGIZISTAN', 'KAZAKISTAN', 'ERMENISTAN'].includes(uyrukUpper) ||
      kartTuru.includes('ЕАЭС') ||
      kartTuru.includes('EAES') ||
      permitCategory === 'EAES';
    const isVks = permitCategory === 'VKS';
    const isPatent =
      permitCategory === 'PATENT' ||
      (['OZBEKISTAN', 'TACIKISTAN', 'AZERBAYCAN'].includes(uyrukUpper) && !isVks && !isRf);
    const isVnjRvp = permitCategory === 'VNJ_RVP';
    const isQuotaRnr = permitCategory === 'QUOTA_RNR';

    for (const d of docDefinitions) {
      let isApplicable = false;
      if (d.id === 'pasaport') isApplicable = true;
      else if (d.id === 'propusk') {
        if (regionTrim !== 'Merkez Ofis' && regionTrim !== 'Moskova' && regionTrim !== 'Ust Luga') {
          isApplicable = true;
        }
      } else if (!isRf) {
        if (d.id === 'registrasyon' || d.id === 'dms' || d.id === 'daktilo') isApplicable = true;
        else if (d.id === 'patent' && !isVnjRvp && !isEaes) isApplicable = true;
        else if (d.id === 'vize' && !isVnjRvp && !isEaes && !isPatent) {
          if (
            isVks ||
            isQuotaRnr ||
            ['HINDISTAN', 'TURKIYE', 'BANGLADES', 'CIN', 'TURKMENISTAN', 'PAKISTAN'].includes(uyrukUpper)
          ) {
            isApplicable = true;
          }
        } else if (d.id === 'dil' && (isPatent || isQuotaRnr) && rawJson['Dil Sertifikası Bitiş Tarihi']) {
          isApplicable = true;
        }
      }
      if (!isApplicable) continue;

      let status: 'missing' | 'expired' | 'critical' | 'warning' | 'valid' = 'missing';
      if (d.id === 'pasaport') {
        status = isRf ? 'valid' : catDays(getDaysDiff(r.pasaport_gecerlilik), d.id);
      } else if (d.id === 'vize') {
        status = catDays(getDaysDiff(r.vize_bitis_tarihi), d.id);
      } else if (d.id === 'propusk') {
        status = catDays(getDaysDiff(r.propusk_bitis_tarihi), d.id);
      } else if (d.id === 'patent') {
        const dt =
          r.patent_bitis_tarihi ||
          rawJson['Çalışma Kart Bitiş Tarihi'] ||
          rawJson['Çalışma Kartı Bitiş Tarihi'];
        status = catDays(getDaysDiff(dt), d.id);
      } else if (d.id === 'registrasyon') {
        status = catDays(getDaysDiff(rawJson['Registrasyon Bitiş Tarihi']), d.id);
      } else if (d.id === 'dms') {
        status = catDays(getDaysDiff(rawJson['DMS Bitiş Tarihi']), d.id);
      } else if (d.id === 'daktilo') {
        const dt = rawJson['Daktiloskopiya Bitis Tarihi'];
        const hasRec = Boolean(
          rawJson['Daktiloskopiya Seri No'] ||
            rawJson['Daktiloskopiya Alış Tarihi'] ||
            rawJson['Daktiloskopiya Başlangıç Tarihi']
        );
        if (dt) status = catDays(getDaysDiff(dt), d.id);
        else if (hasRec) status = 'valid';
        else status = 'missing';
      } else if (d.id === 'dil') {
        status = catDays(getDaysDiff(rawJson['Dil Sertifikası Bitiş Tarihi']), d.id);
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
      } else if (status === 'valid') {
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
  return {
    activePersonnelCount: rows.length,
    referenceDateDisplay,
    totalDocsCount,
    totalExpired,
    totalCritical,
    totalWarning,
    totalMissing,
    totalValid,
    complianceRate,
    docList: docDefinitions.map((d) => docStats[d.id]),
    topRegions: Object.values(regionBreakdown)
      .sort((a, b) => b.expired + b.critical - (a.expired + a.critical))
      .slice(0, 8),
  };
}

function computeGosuslugiVksEmailSummary(db: any) {
  let totalRendered = 0;
  let totalRegistered = 0;
  let totalRefused = 0;
  let totalPending = 0;
  let totalErrors = 0;
  let totalPdf = 0;
  let totalStatusPdf = 0;
  try {
    const rawRows = db
      .prepare(
        `SELECT sicil_no, application_no, gosuslugi_status, pdf_filename, status_pdf_filename
         FROM gosuslugi_submissions
         WHERE LOWER(notification_type) = 'vks_salary'
         ORDER BY CASE WHEN gosuslugi_status LIKE '%оказана%' THEN 0 WHEN application_no != '' THEN 1 ELSE 2 END ASC, submitted_at DESC, id DESC`
      )
      .all() as any[];
    const seen = new Set<string>();
    for (const r of rawRows) {
      const s = String(r.sicil_no || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      const st = String(r.gosuslugi_status || '').trim();
      const appNo = String(r.application_no || '').trim();
      if (!appNo && /Browser has been closed|Target page/i.test(st)) continue;
      if (/^ошибк/i.test(st)) {
        totalErrors++;
        continue;
      }
      if (r.pdf_filename && !String(r.pdf_filename).toUpperCase().includes('_STATUS_A4')) totalPdf++;
      if (r.status_pdf_filename || String(r.pdf_filename || '').toUpperCase().includes('_STATUS_A4')) {
        totalStatusPdf++;
      }
      if (/оказан|исполнен/i.test(st)) totalRendered++;
      else if (/отказан|отказ/i.test(st)) totalRefused++;
      else if (/зарегистрирован|отправлено в ведомство|принят|промежуточн/i.test(st)) totalRegistered++;
      else if (appNo || /отправлен/i.test(st)) totalPending++;
    }
  } catch {}

  const totalSent = totalRendered + totalRegistered + totalRefused + totalPending;
  return {
    totalSent,
    totalRendered,
    totalRegistered,
    totalRefused,
    totalPending,
    totalErrors,
    totalPdf,
    totalStatusPdf,
  };
}

export function buildReportEmailHtml(
  reportId: EmailReportRule['id'] | 'test_connection',
  dbInstance?: any
): { subject: string; html: string } {
  const db = dbInstance || getDb();
  const msk = getMoscowClock();

  if (reportId === 'test_connection') {
    const smtp = getSmtpConfig(db);
    return {
      subject: `✅ [Pondera HR TeamHub] Kurumsal E-Posta (Zoho Mail) Bağlantı Testi (${msk.dateDisplay})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
          <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 18px;">Pondera HR TeamHub — Çift Kanallı (Telegram + Mail) Bildirim Sistemi</h2>
            <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">Tarih: ${msk.dateDisplay} ${msk.timeDisplay} (MSK) • Gönderici: ${smtp.user} • Sunucu: hr.pondera.network</p>
          </div>
          <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
            <p>Merhaba,</p>
            <p>Bu e-posta <strong>Pondera HR TeamHub (hr.pondera.network)</strong> üzerindeki <strong>Zoho Kurumsal E-Posta Bildirim Motoru (${smtp.user})</strong> tarafından canlı bağlantı doğrulaması amacıyla gönderilmiştir.</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px 16px; border-radius: 10px; color: #166534; font-size: 13px;">
              ✅ <strong>Telegram + Kurumsal E-Posta Eşzamanlı Bildirim Aktif:</strong>
              <ul style="margin: 8px 0 0; padding-left: 18px;">
                <li>Günlük Evrak Süreleri &amp; Eksik Evrak Raporu (09:15 MSK)</li>
                <li>1C ZUP (Resmi) ↔ eBA (Real) Kadro &amp; Veri Fark Raporu (09:20 MSK)</li>
                <li>Gosuslugi VKS 15 Dakika Özeti, MVD Uyarıları &amp; Günlük Raporu (09:30 MSK)</li>
                <li>Yönetim &amp; Turnover Kadro Özeti Raporu (10:00 MSK)</li>
              </ul>
            </div>
          </div>
        </div>
      `,
    };
  }

  const recon = computeZupVsRealReconciliation(db);
  const s = recon.summary;
  const dc = s.discrepancyCounts;

  if (reportId === 'zup_vs_real') {
    const subject = `⚖️ [Pondera İK] 1C ZUP (Resmi) vs eBA (Real) Personel Karşılaştırma Özeti (${recon.metadata.zupDate} ↔ ${recon.metadata.ebaDate})`;
    const regionRowsHtml = recon.byRegion
      .filter((r: any) => r.realActive > 0 || r.zupActiveRealExit > 0)
      .map(
        (r: any) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${r.region}</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${r.realActive}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #059669;"><strong>${r.inZupOfficial}</strong> (%${r.officialRatePct})</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #d97706;">${r.missingMainFirm}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #4f46e5;">${r.transferCount || 0}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #e11d48;"><strong>${r.zupActiveRealExit}</strong></td>
        </tr>
      `
      )
      .join('');

    const permitRowsHtml = (recon.byPermitStatus || [])
      .map(
        (p: any) => `
        <tr>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${p.shortTr || p.labelTr}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${p.zupCount}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${p.realActiveCount}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${
            p.diff === 0 ? '#059669' : '#b45309'
          };"><strong>${p.diff > 0 ? `+${p.diff}` : p.diff}</strong></td>
        </tr>
      `
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 740px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(90deg, #1e1b4b, #312e81); color: #ffffff; padding: 20px 24px;">
          <h2 style="margin: 0; font-size: 18px;">⚖️ 1C ZUP (Resmi) ↔ eBA (Real) Çapraz Denetim Raporu</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #c7d2fe;">
            1C ZUP Liste Tarihi: <strong>${recon.metadata.zupDate}</strong> | eBA Real Tarihi: <strong>${recon.metadata.ebaDate}</strong> | Moskova Saati: ${msk.timeDisplay}
          </p>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.55;">
          <h3 style="margin-top: 0; color: #0f172a; font-size: 15px;">1. Genel Kadro Mutabakatı</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px;">
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Real (eBA) Aktif Kadro</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${s.realActiveTotal} Kişi</strong> (Pondera: ${s.realActiveMainFirm} | Taşeron: ${s.realActiveSubcon})</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>1C ZUP Resmi Aktif Kadro</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${s.zupOfficialTotal} Kişi</strong></td>
            </tr>
            <tr style="background: #f0fdf4;">
              <td style="padding: 8px 12px; border: 1px solid #bbf7d0;"><strong>Mevcuttan Resmide (1C ZUP) Çalışan</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #bbf7d0; color: #166534;"><strong>${s.matchedActiveBoth} Kişi</strong> (Pondera Ana Kadro: <strong>%${s.matchedActiveRateMainFirm}</strong>)</td>
            </tr>
            <tr style="background: #eef2ff;">
              <td style="padding: 8px 12px; border: 1px solid #c7d2fe;"><strong>Şirket İçi Şantiye Transferi (ZUP Aktif)</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #c7d2fe; color: #3730a3;"><strong>${s.zupTransferPermitCheckCount || 0} Kişi</strong> (Resmi çıkış gerekmez, çalışma izni bölgesi kontrol edilmeli)</td>
            </tr>
            <tr style="background: #fff1f2;">
              <td style="padding: 8px 12px; border: 1px solid #fecdd3;"><strong>1C ZUP'ta Aktif / Real'de Gerçek Çıkışlı</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #fecdd3; color: #be123c;"><strong>${s.zupActiveButRealExited} Kişi</strong> (Acil 1C ZUP resmi çıkışı düşülmeli)</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Pondera Ana Kadro Aktif / 1C ZUP'ta Eksik</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #b45309;"><strong>${s.realActiveNotInZupMainFirm} Kişi</strong> (${s.realActiveNotInZupRecentHire} kişi ${recon.metadata.zupDate.slice(0, 5)} sonrası yeni giriş)</td>
            </tr>
          </table>

          <h3 style="color: #0f172a; font-size: 15px;">2. Çalışma / Vergi Statüsü Dağılımı</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1;">Statü / İzin Türü</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">1C ZUP</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">eBA Real</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Fark</th>
              </tr>
            </thead>
            <tbody>${permitRowsHtml}</tbody>
          </table>

          <h3 style="color: #0f172a; font-size: 15px;">3. Bölge Bazlı Resmi Çalışma Oranları</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Bölge</th>
                <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Real Aktif</th>
                <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Resmide (ZUP)</th>
                <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Ana Kadro Eksik</th>
                <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Şantiye Transferi</th>
                <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Gerçek Çıkış</th>
              </tr>
            </thead>
            <tbody>${regionRowsHtml}</tbody>
          </table>

          <h3 style="color: #0f172a; font-size: 15px;">4. Sicil &amp; Kimlik Veri Farkları</h3>
          <ul style="padding-left: 18px; margin: 6px 0 16px;">
            <li>Pasaport No Uyuşmazlığı: <strong>${dc.passportMismatch} kişi</strong></li>
            <li>Çalışma / Vergi Statüsü Farkı (VKS/Patent/RNR): <strong>${dc.permitStatusMismatch} kişi</strong></li>
            <li>İNN Numarası Farklı: <strong>${dc.innMismatch} kişi</strong> (eBA İNN Eksik: <strong>${dc.missingInnInEba} kişi</strong>)</li>
            <li>Sicil No Format Farkı (Nokta/Harf eki): <strong>${dc.sicilFormatDiff} kişi</strong></li>
            <li>Doğum Tarihi Farkı: <strong>${dc.birthDateMismatch} kişi</strong></li>
          </ul>

          <p style="font-size: 12px; color: #64748b; margin-top: 16px;">
            Detaylı interaktif grafik ve Excel raporu için: <a href="https://hr.pondera.network" style="color: #4f46e5;">https://hr.pondera.network</a> (Resmi &amp; Real Karşılaştırma Modülü)
          </p>
        </div>
      </div>
    `;
    return { subject, html };
  }

  if (reportId === 'daily_compliance') {
    const comp = computeLiveComplianceSummary(db);
    const subject = `📋 [Pondera İK] Günlük Evrak Süreleri & Eksik Evrak Raporu (${msk.dateDisplay} — Uyum: %${comp.complianceRate})`;
    const docRowsHtml = comp.docList
      .map(
        (d) => `
        <tr>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${d.label}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${d.totalChecked}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;"><strong>${d.expiredCount}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #ea580c;"><strong>${d.criticalCount}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #ca8a04;">${d.warningCount}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">${d.missingCount}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #059669;"><strong>${d.validCount}</strong></td>
        </tr>
      `
      )
      .join('');

    const regRowsHtml = comp.topRegions
      .map(
        (r) => `
        <tr>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${r.region}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${r.total}</td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;"><strong>${r.expired}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #ea580c;"><strong>${r.critical}</strong></td>
          <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #64748b;">${r.missing}</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 740px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: #065f46; color: #ffffff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 18px;">📋 Günlük Evrak Geçerlilik &amp; Süre Analitiği Raporu</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #a7f3d0;">
            Tarih: ${msk.dateDisplay} ${msk.timeDisplay} (MSK) • Veri Referansı: ${comp.referenceDateDisplay} • Aktif Personel: <strong>${comp.activePersonnelCount}</strong> Kişi
          </p>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.6;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px;">
            <tr style="background: #f0fdf4;">
              <td style="padding: 8px 12px; border: 1px solid #bbf7d0;"><strong>Kontrol Edilen Toplam Evrak / Uyum Oranı</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #bbf7d0; color: #166534;"><strong>${comp.totalDocsCount} Evrak — %${comp.complianceRate} Geçerli (${comp.totalValid})</strong></td>
            </tr>
            <tr style="background: #fef2f2;">
              <td style="padding: 8px 12px; border: 1px solid #fecaca;"><strong>Süresi Geçmiş / Kritik (≤15 Gün, Vize ≤30 Gün)</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #fecaca; color: #b91c1c;"><strong>${comp.totalExpired} Süresi Geçmiş</strong> • <strong>${comp.totalCritical} Kritik</strong> • ${comp.totalWarning} Yaklaşan • ${comp.totalMissing} Eksik</td>
            </tr>
          </table>

          <h3 style="color: #0f172a; font-size: 15px; margin-bottom: 8px;">1. Evrak Türüne Göre Dağılım</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1;">Evrak Türü</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Toplam</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Geçmiş</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Kritik</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Uyarı</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Eksik</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Geçerli</th>
              </tr>
            </thead>
            <tbody>${docRowsHtml}</tbody>
          </table>

          <h3 style="color: #0f172a; font-size: 15px; margin-bottom: 8px;">2. Bölge Bazlı Özet</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1;">Bölge</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Personel</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Süresi Geçmiş</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Kritik</th>
                <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Eksik</th>
              </tr>
            </thead>
            <tbody>${regRowsHtml}</tbody>
          </table>

          <p style="font-size: 12px; color: #64748b; margin-top: 12px;">
            Kişi bazlı listeler ve Excel çıktısı için: <a href="https://hr.pondera.network" style="color: #059669;">https://hr.pondera.network</a> (Evrak &amp; Süre Analitiği)
          </p>
        </div>
      </div>
    `;
    return { subject, html };
  }

  if (reportId === 'vks_gosuslugi') {
    const g = computeGosuslugiVksEmailSummary(db);
    const vksPermit = (recon.byPermitStatus || []).find((p: any) => p.key === 'VKS');
    const subject = `🛂 [Pondera İK] VKS (BKC) Gosuslugi & MVD Yasal Bildirim Raporu (${msk.dateDisplay})`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: #1e3a8a; color: #ffffff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 18px;">🛂 VKS (ВКС) Gosuslugi &amp; МВД Yasal Bildirim Raporu</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #bfdbfe;">Tarih: ${msk.dateDisplay} ${msk.timeDisplay} (MSK) • Aktif Saha VKS Uzmanı: ${vksPermit?.realActiveCount || 0} Kişi</p>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.6;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
            <tr style="background: #f0fdf4;">
              <td style="padding: 8px 12px; border: 1px solid #bbf7d0;"><strong>🟢 Услуга оказана (МВД Tamamlanan)</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #bbf7d0; color: #166534;"><strong>${g.totalRendered} Başvuru</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>🔵 Заявление зарегистрировано (Kayıtlı)</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #1d4ed8;"><strong>${g.totalRegistered} Başvuru</strong></td>
            </tr>
            <tr style="background: #fef2f2;">
              <td style="padding: 8px 12px; border: 1px solid #fecaca;"><strong>🔴 Услуга отказана (МВД Red)</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #fecaca; color: #b91c1c;"><strong>${g.totalRefused} Başvuru</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>📤 Отправлено (МВД Yanıtı Bekleyen)</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${g.totalPending} Başvuru</strong></td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>📄 Toplam Başarılı Gönderim &amp; Arşiv PDF</strong></td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${g.totalSent} Gönderim</strong> (Başvuru PDF: ${g.totalPdf} | Statü A4 PDF: ${g.totalStatusPdf} | Hata: ${g.totalErrors})</td>
            </tr>
          </table>
          <p style="font-size: 12px; color: #64748b;">
            Detaylı VKS bildirim takibi ve PDF dekont arşivi için: <a href="https://hr.pondera.network" style="color: #2563eb;">https://hr.pondera.network</a>
          </p>
        </div>
      </div>
    `;
    return { subject, html };
  }

  const vksRow = (recon.byPermitStatus || []).find((p: any) => p.key === 'VKS');
  const vksCount = vksRow?.realActiveCount || 0;
  const vksPct = s.realActiveTotal > 0 ? ((vksCount / s.realActiveTotal) * 100).toFixed(1) : '0.0';
  const regionSummaryHtml = (recon.byRegion || [])
    .filter((r: any) => r.realActive > 0)
    .map(
      (r: any) => `
      <tr>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${r.region}</strong></td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;"><strong>${r.realActive}</strong></td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #059669;">${r.inZupOfficial} (%${r.officialRatePct})</td>
        <td style="padding: 7px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #4f46e5;">${r.transferCount || 0}</td>
      </tr>
    `
    )
    .join('');

  const subject = `📊 [Pondera İK] Yönetim & Kadro Turnover Özeti (${msk.dateDisplay} — Aktif: ${s.realActiveTotal})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; background: #ffffff;">
      <div style="background: #0f172a; color: #ffffff; padding: 18px 24px;">
        <h2 style="margin: 0; font-size: 18px;">📊 Yönetim &amp; Kadro Analiz Özeti (Transferler Hariç)</h2>
        <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">Tarih: ${msk.dateDisplay} ${msk.timeDisplay} (MSK) • Aktif Kadro: ${s.realActiveTotal} Kişi</p>
      </div>
      <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.6;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
          <tr style="background: #f8fafc;">
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Toplam Aktif Saha Kadrosu</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>${s.realActiveTotal} Kişi</strong> (Pondera Ana Kadro: ${s.realActiveMainFirm} | Taşeron: ${s.realActiveSubcon})</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>VKS (Yüksek Nitelikli Uzman) Kadrosu</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #1d4ed8;"><strong>${vksCount} Kişi</strong> (Genel Kadroda %${vksPct})</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Şirket İçi Şantiye Transferleri</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #4f46e5;"><strong>${s.zupTransferPermitCheckCount || 0} Kişi</strong> (Turnover çıkış hesabından arındırılmıştır)</td>
          </tr>
        </table>
        <h3 style="color: #0f172a; font-size: 15px; margin-bottom: 8px;">Bölge Bazlı Aktif Kadro Dağılımı</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1;">Bölge</th>
              <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Aktif Personel</th>
              <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">1C ZUP Resmi</th>
              <th style="padding: 7px 10px; border-bottom: 2px solid #cbd5e1; text-align: right;">Transfer</th>
            </tr>
          </thead>
          <tbody>${regionSummaryHtml}</tbody>
        </table>
        <p style="font-size: 12px; color: #64748b;">
          Yönetim &amp; Turnover grafikleri için: <a href="https://hr.pondera.network" style="color: #0f172a;">https://hr.pondera.network</a>
        </p>
      </div>
    </div>
  `;
  return { subject, html };
}

export async function sendReportEmailById(
  reportId: EmailReportRule['id'] | 'test_connection',
  overrideRecipients?: { to?: string[]; cc?: string[] }
): Promise<{ ok: boolean; status: 'SENT' | 'QUEUED' | 'ERROR'; message: string }> {
  const db = getDb();
  const smtp = getSmtpConfig(db);
  const rules = getEmailReportRules(db);
  const rule = rules.find((r) => r.id === reportId);

  const defaultRecipient = smtp.user || 'ikbildirim@pondera.ru';
  const toList =
    overrideRecipients?.to && overrideRecipients.to.length > 0
      ? overrideRecipients.to
      : rule?.toEmails && rule.toEmails.length > 0
      ? rule.toEmails
      : [defaultRecipient];
  const ccList =
    overrideRecipients?.cc !== undefined ? overrideRecipients.cc : rule?.ccEmails || [];

  const { subject, html } = buildReportEmailHtml(reportId, db);

  if (!smtp.enabled || !smtp.pass) {
    const detail = !smtp.pass
      ? 'SMTP şifresi henüz tanımlanmadığı için e-posta gönderim kuyruğuna (Outbox) kaydedildi.'
      : 'E-posta gönderimi pasif durumda olduğu için kuyruğa kaydedildi.';
    logEmailDelivery(db, reportId, subject, toList, ccList, 'QUEUED', detail);

    if (rule) {
      const msk = getMoscowClock();
      const updated = rules.map((r) =>
        r.id === reportId
          ? {
              ...r,
              lastSentAt: `${msk.dateDisplay} ${msk.timeDisplay}`,
              lastStatus: 'Kuyruğa Alındı (SMTP Bekleniyor)',
            }
          : r
      );
      saveEmailReportRules(updated, db);
    }

    return { ok: true, status: 'QUEUED', message: detail };
  }

  const res = await sendRawSmtpMail(smtp, toList, ccList, subject, html);
  const status = res.ok ? 'SENT' : 'ERROR';
  logEmailDelivery(db, reportId, subject, toList, ccList, status, res.detail);

  if (rule) {
    const msk = getMoscowClock();
    const updated = rules.map((r) =>
      r.id === reportId
        ? {
            ...r,
            lastSentAt: `${msk.dateDisplay} ${msk.timeDisplay}`,
            lastStatus: res.ok ? 'Başarıyla Gönderildi' : `Hata: ${res.detail}`,
          }
        : r
    );
    saveEmailReportRules(updated, db);
  }

  return { ok: res.ok, status, message: res.detail };
}

/**
 * Sends event-driven alerts (e.g. 15-min VKS Gosuslugi activity, MVD Not Found alert)
 * to the recipients configured on the matching EmailReportRule alongside Telegram.
 */
export async function sendCustomAlertEmail(
  ruleId: EmailReportRule['id'],
  subject: string,
  htmlBody: string
): Promise<{ ok: boolean; skipped?: boolean; detail: string }> {
  try {
    const db = getDb();
    const smtp = getSmtpConfig(db);
    if (!smtp.enabled || !smtp.pass) {
      return { ok: false, skipped: true, detail: 'SMTP aktif değil.' };
    }
    const rules = getEmailReportRules(db);
    const rule = rules.find((r) => r.id === ruleId);
    if (rule && !rule.enabled) {
      return { ok: false, skipped: true, detail: `${ruleId} e-posta kuralı pasif.` };
    }

    const toList =
      rule?.toEmails && rule.toEmails.length > 0
        ? rule.toEmails
        : [smtp.user || 'ikbildirim@pondera.ru'];
    const ccList = rule?.ccEmails || [];

    const res = await sendRawSmtpMail(smtp, toList, ccList, subject, htmlBody);
    logEmailDelivery(db, `${ruleId}_alert`, subject, toList, ccList, res.ok ? 'SENT' : 'ERROR', res.detail);
    return { ok: res.ok, detail: res.detail };
  } catch (err: any) {
    return { ok: false, detail: err?.message || 'E-posta uyarısı gönderilemedi.' };
  }
}

/**
 * Evaluates all enabled scheduled email rules against current Moscow time (MSK)
 * and sends each due report once per day. Called automatically by /api/telegram/cron.
 */
export async function runScheduledEmailReports(force = false): Promise<{
  checkedAtMsk: string;
  triggered: Array<{ id: string; ok: boolean; status: string; message: string }>;
}> {
  const db = getDb();
  const msk = getMoscowClock();
  const smtp = getSmtpConfig(db);
  const triggered: Array<{ id: string; ok: boolean; status: string; message: string }> = [];

  if (!smtp.enabled || !smtp.pass) {
    return { checkedAtMsk: `${msk.dateDisplay} ${msk.timeDisplay}`, triggered };
  }

  const rules = getEmailReportRules(db);
  const currentMinutes = msk.hour * 60 + msk.minute;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!force && rule.frequency === 'on_upload') continue;

    if (!force) {
      if (rule.frequency === 'weekdays' && (msk.weekday === 0 || msk.weekday === 6)) {
        continue;
      }
      if (rule.frequency === 'weekly' && msk.weekday !== 1) {
        continue;
      }

      const [hhStr, mmStr] = String(rule.scheduleTime || '09:15').split(':');
      const schedMinutes = (parseInt(hhStr || '9', 10) || 9) * 60 + (parseInt(mmStr || '15', 10) || 0);

      // Trigger within a 2-hour window starting at scheduleTime
      if (currentMinutes < schedMinutes || currentMinutes > schedMinutes + 120) {
        continue;
      }

      const sentKey = `email_sched_sent_${rule.id}`;
      if (getSysInfo(db, sentKey) === msk.dateIso) {
        continue;
      }

      const attemptsKey = `email_sched_attempts_${rule.id}_${msk.dateIso}`;
      const prevAttempts = parseInt(getSysInfo(db, attemptsKey) || '0', 10) || 0;
      if (prevAttempts >= 2) {
        continue;
      }
      setSysInfo(db, attemptsKey, String(prevAttempts + 1));
      setSysInfo(db, sentKey, msk.dateIso);

      const res = await sendReportEmailById(rule.id);
      if (!res.ok) {
        // Allow at most one retry later in the window if first attempt failed
        setSysInfo(db, sentKey, '');
      }
      triggered.push({ id: rule.id, ok: res.ok, status: res.status, message: res.message });
    } else {
      const res = await sendReportEmailById(rule.id);
      triggered.push({ id: rule.id, ok: res.ok, status: res.status, message: res.message });
    }
  }

  return { checkedAtMsk: `${msk.dateDisplay} ${msk.timeDisplay}`, triggered };
}

/**
 * Triggers any enabled rules configured with frequency === 'on_upload'
 */
export async function triggerOnUploadEmailReports(
  source: 'eba' | 'zup'
): Promise<Array<{ id: string; ok: boolean; status: string }>> {
  const results: Array<{ id: string; ok: boolean; status: string }> = [];
  try {
    const db = getDb();
    const smtp = getSmtpConfig(db);
    if (!smtp.enabled || !smtp.pass) return results;
    const rules = getEmailReportRules(db);
    for (const rule of rules) {
      if (!rule.enabled || rule.frequency !== 'on_upload') continue;
      if (source === 'zup' && rule.id !== 'zup_vs_real') continue;
      const res = await sendReportEmailById(rule.id);
      results.push({ id: rule.id, ok: res.ok, status: res.status });
    }
  } catch {}
  return results;
}

/**
 * Checks if 1C ZUP scheduled task dropped a newer Excel file in the configured auto-sync directory
 */
export function checkAndImportZupAutoFolder(dbInstance?: any): {
  imported: boolean;
  fileName?: string;
  count?: number;
} {
  try {
    const db = dbInstance || getDb();
    const smtp = getSmtpConfig(db);
    const folder = smtp.zupAutoFolder || path.join(process.cwd(), 'uploads', 'zup_auto');
    if (!fs.existsSync(folder)) return { imported: false };

    const files = fs
      .readdirSync(folder)
      .filter((f) => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'))
      .map((f) => {
        const fullPath = path.join(folder, f);
        const stat = fs.statSync(fullPath);
        return { name: f, fullPath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (files.length === 0) return { imported: false };
    const latest = files[0];

    const lastImportedRow = db
      .prepare('SELECT value FROM system_info WHERE key = ?')
      .get('zup_auto_last_imported_mtime') as { value?: string } | undefined;
    if (lastImportedRow?.value === `${latest.name}_${Math.floor(latest.mtimeMs)}`) {
      return { imported: false };
    }

    const buf = fs.readFileSync(latest.fullPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return { imported: false };
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '' }) as any[][];
    const parsed = parseZupWorksheetRows(rawRows);
    if (parsed.length === 0) return { imported: false };

    const reportDate = extractZupReportDate(
      latest.name,
      rawRows,
      new Date().toLocaleDateString('tr-TR')
    );

    saveZupRecordsToDb(db, parsed, reportDate, latest.name);
    db.prepare(`
      INSERT INTO system_info (key, value) VALUES ('zup_auto_last_imported_mtime', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(`${latest.name}_${Math.floor(latest.mtimeMs)}`);

    return { imported: true, fileName: latest.name, count: parsed.length };
  } catch {
    return { imported: false };
  }
}
