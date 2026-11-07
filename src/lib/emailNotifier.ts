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
import { resolveEffectiveRegion } from './regionSiteHelper';
import {
  ensureVksQuarterlyArchiveAndState,
  isVks15MinNotificationEnabled,
} from './vksQuarterManager';

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

const fmtNum = (n: number | string | undefined | null): string => {
  const num = Number(n ?? 0);
  if (isNaN(num)) return String(n ?? '0');
  return num.toLocaleString('tr-TR');
};

const LEGACY_PLACEHOLDER_EMAILS = new Set([
  'ik@pondera.ru',
  'saha.koordinasyon@pondera.ru',
  'bordro.zup@pondera.ru',
  'vks.operasyon@pondera.ru',
  'yonetim@pondera.ru',
  'info@pondera.ru',
  'baris@pondera.ru',
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
    toEmails: ['zahid.rahimov@pondera.ru', 'nemat2313@gmail.com'],
    ccEmails: ['ikbildirim@pondera.ru'],
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
    toEmails: ['zahid.rahimov@pondera.ru', 'nemat2313@gmail.com'],
    ccEmails: ['ikbildirim@pondera.ru'],
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
    toEmails: ['zahid.rahimov@pondera.ru', 'nemat2313@gmail.com'],
    ccEmails: ['ikbildirim@pondera.ru'],
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
    toEmails: ['zahid.rahimov@pondera.ru', 'nemat2313@gmail.com'],
    ccEmails: ['ikbildirim@pondera.ru'],
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
  const defaultTo =
    smtp.user && !LEGACY_PLACEHOLDER_EMAILS.has(smtp.user.toLowerCase())
      ? smtp.user.toLowerCase()
      : 'ikbildirim@pondera.ru';

  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get('email_report_rules') as
    | { value?: string }
    | undefined;
  if (!row?.value) {
    return DEFAULT_REPORT_RULES;
  }
  try {
    const saved = JSON.parse(row.value) as EmailReportRule[];
    if (!Array.isArray(saved)) {
      return DEFAULT_REPORT_RULES;
    }
    return DEFAULT_REPORT_RULES.map((def) => {
      const found = saved.find((s) => s.id === def.id);
      if (!found) return def;
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
    return DEFAULT_REPORT_RULES;
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
        if (lastLine.length >= 4 && lastLine[3] === '-') return;
        const code = parseInt(lastLine.slice(0, 3), 10);
        buffer = '';

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
        `SELECT id, region, proje_adi, uyruk, guncel_durum, pasaport_gecerlilik, vize_bitis_tarihi, propusk_bitis_tarihi, patent_bitis_tarihi, all_data_json
         FROM personnel WHERE guncel_durum IN (${placeholders}) ORDER BY id ASC`
      )
      .all(...activeStatuses) as any[];
  } catch {
    rows = [];
  }

  const docDefinitions = [
    { id: 'pasaport', label: 'Pasaport' },
    { id: 'vize', label: 'Vize' },
    { id: 'propusk', label: 'Propusk (Saha Giriş Kartı)' },
    { id: 'patent', label: 'Patent / Çalışma İzni' },
    { id: 'registrasyon', label: 'Registrasyon (İkamet Kaydı)' },
    { id: 'daktilo', label: 'Daktiloskopiya (Parmak İzi)' },
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
    { region: string; total: number; expired: number; critical: number; warning: number; missing: number; valid: number }
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
    const reg = resolveEffectiveRegion(r.region, r.proje_adi, 'Diğer');
    if (!regionBreakdown[reg]) {
      regionBreakdown[reg] = {
        region: reg,
        total: 0,
        expired: 0,
        critical: 0,
        warning: 0,
        missing: 0,
        valid: 0,
      };
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
        regionBreakdown[reg].warning++;
      } else if (status === 'valid') {
        docStats[d.id].validCount++;
        totalValid++;
        regionBreakdown[reg].valid++;
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
    topRegions: Object.values(regionBreakdown).sort(
      (a, b) => b.expired + b.critical - (a.expired + a.critical)
    ),
  };
}

function computeGosuslugiVksEmailSummary(db: any) {
  let totalSent = 0;
  let totalPdf = 0;
  let totalNoPdf = 0;
  let totalStatusPdf = 0;
  let totalNoStatusPdf = 0;
  let totalErrors = 0;
  let totalRendered = 0;
  let totalRegistered = 0;
  let totalRefused = 0;
  let totalPending = 0;

  const statusPdfByAppNo = new Map<string, string>();
  const statusPdfBySicil = new Map<string, string>();
  try {
    const pdfDir = path.join(process.cwd(), 'data', 'gosuslugi_pdfs');
    if (fs.existsSync(pdfDir)) {
      const files = fs.readdirSync(pdfDir);
      for (const f of files) {
        if (!f.toUpperCase().includes('_STATUS_A4.PDF')) continue;
        const mApp = f.match(/([789]\d{9})/);
        if (mApp) statusPdfByAppNo.set(mApp[1], f);
        const mSic = f.match(/^(\d{4,8})_/);
        if (mSic) statusPdfBySicil.set(mSic[1], f);
      }
    }
  } catch {}

  try {
    const rawRows = db
      .prepare(
        `SELECT sicil_no, application_no, gosuslugi_status, pdf_filename, status_pdf_filename
         FROM gosuslugi_submissions
         WHERE LOWER(notification_type) = 'vks_salary'
         ORDER BY CASE WHEN gosuslugi_status LIKE '%оказана%' THEN 0 WHEN application_no != '' THEN 1 ELSE 2 END ASC, submitted_at DESC, id DESC`
      )
      .all() as any[];

    const doesPdfMatchApp = (fn: string, targetApp: string) => {
      if (!fn) return false;
      if (!targetApp) return true;
      if (fn.includes(targetApp)) return true;
      const m = fn.match(/([789]\d{9})/);
      if (m && m[1] !== targetApp) return false;
      return true;
    };

    const seen = new Set<string>();
    for (const r of rawRows) {
      const sicil = String(r.sicil_no || '').trim();
      if (!sicil || seen.has(sicil)) continue;
      seen.add(sicil);

      const appNo = String(r.application_no || '').trim();
      const rawStatus = String(r.gosuslugi_status || '').trim();
      if (
        !appNo &&
        /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(
          rawStatus
        )
      ) {
        continue;
      }

      const rawPdf = String(r.pdf_filename || '').trim();
      const pdf =
        !rawPdf.toUpperCase().includes('_STATUS_A4') && doesPdfMatchApp(rawPdf, appNo) ? rawPdf : '';
      const statusPdf =
        [
          String(r.status_pdf_filename || '').trim(),
          appNo ? statusPdfByAppNo.get(appNo) || '' : '',
          sicil ? statusPdfBySicil.get(sicil) || '' : '',
          rawPdf.toUpperCase().includes('_STATUS_A4') ? rawPdf : '',
        ].find((cand) => Boolean(cand) && doesPdfMatchApp(cand, appNo)) || '';

      const isError = /^ошибк/i.test(rawStatus);
      const hasPdf = Boolean(pdf);
      const hasStatusPdf = Boolean(statusPdf);
      const isSent =
        !isError &&
        (Boolean(appNo) ||
          hasPdf ||
          hasStatusPdf ||
          /отправлен|зарегистрирован|оказан|исполнен|отказан|принят|промежуточн|обработк|PDF не скачан/i.test(
            rawStatus
          ));

      if (isError) {
        totalErrors++;
      } else if (isSent) {
        totalSent++;
        if (hasPdf) totalPdf++;
        else totalNoPdf++;
        if (hasStatusPdf) totalStatusPdf++;
        else totalNoStatusPdf++;

        if (/оказан|исполнен/i.test(rawStatus)) totalRendered++;
        else if (/отказан|отказ/i.test(rawStatus)) totalRefused++;
        else if (/зарегистрирован|отправлено в ведомство|принят|промежуточн/i.test(rawStatus)) {
          totalRegistered++;
        } else {
          totalPending++;
        }
      }
    }
  } catch {}

  return {
    totalRecords: totalSent + totalErrors,
    totalSent,
    totalPdf,
    totalNoPdf,
    totalStatusPdf,
    totalNoStatusPdf,
    totalErrors,
    totalRendered,
    totalRegistered,
    totalRefused,
    totalPending,
  };
}

/**
 * Outlook-Desktop, Gmail & Zoho Mail compatible corporate HTML shell.
 * Uses table-based layout and solid bgcolor attributes so headers and KPI cards
 * never break or render white-on-white in Microsoft Outlook.
 */
export function renderCorporateEmailShell(opts: {
  accentHex: string;
  headerBgHex: string;
  badgeText: string;
  title: string;
  subtitle: string;
  bodyHtml: string;
  ctaLabel?: string;
}): string {
  const cta = opts.ctaLabel || 'Canlı İK Yönetim Paneline Git →';
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #eef2f6; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef2f6" style="background-color: #eef2f6; padding: 24px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="740" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width: 740px; width: 100%; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 14px; overflow: hidden;">
          <!-- Top Accent Bar -->
          <tr>
            <td bgcolor="${opts.accentHex}" height="5" style="background-color: ${opts.accentHex}; font-size: 1px; line-height: 1px;">&nbsp;</td>
          </tr>
          <!-- Corporate Header -->
          <tr>
            <td bgcolor="${opts.headerBgHex}" style="background-color: ${opts.headerBgHex}; padding: 22px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <span style="display: inline-block; padding: 3px 10px; background-color: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; color: #e2e8f0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase;">
                      ${opts.badgeText}
                    </span>
                    <h1 style="margin: 10px 0 6px; font-size: 19px; line-height: 1.35; font-weight: 700; color: #ffffff;">
                      ${opts.title}
                    </h1>
                    <p style="margin: 0; font-size: 12.5px; color: #cbd5e1; line-height: 1.45;">
                      ${opts.subtitle}
                    </p>
                  </td>
                  <td align="right" valign="top" width="150" style="padding-left: 14px;">
                    <img src="https://hr.pondera.network/pondera-logo-white.png" alt="PONDERA INDUSTRY" width="136" style="display: block; border: 0; max-width: 136px; height: auto;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Body -->
          <tr>
            <td style="padding: 24px 28px; color: #1e293b; font-size: 13px; line-height: 1.55;">
              ${opts.bodyHtml}

              <!-- CTA Bar -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 22px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
                <tr>
                  <td align="left" valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="${opts.headerBgHex}" style="background-color: ${opts.headerBgHex}; border-radius: 8px;">
                          <a href="https://hr.pondera.network" target="_blank" style="display: inline-block; padding: 10px 20px; color: #ffffff; font-size: 12.5px; font-weight: 700; text-decoration: none;">
                            ${cta}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle" style="font-size: 11.5px; color: #64748b;">
                    <strong>hr.pondera.network</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 28px; font-size: 11px; color: #64748b; line-height: 1.5;">
              <strong>Pondera Industry • HR TeamHub Otomatik Bildirim Merkezi</strong><br />
              Gönderici: <a href="mailto:ikbildirim@pondera.ru" style="color: #475569; text-decoration: none;">ikbildirim@pondera.ru</a> • Bu rapor Telegram İK Bildirim Kanalı ile eşzamanlı olarak oluşturulmuştur.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderKpiGrid4(
  cards: Array<{
    label: string;
    value: string;
    sub: string;
    bgHex: string;
    borderHex: string;
    valueHex: string;
  }>
): string {
  const tds = cards
    .map(
      (c, idx) => `
      <td width="25%" valign="top" style="padding-left: ${idx === 0 ? '0' : '5px'}; padding-right: ${
        idx === cards.length - 1 ? '0' : '5px'
      };">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${
          c.bgHex
        }" style="background-color: ${c.bgHex}; border: 1px solid ${
        c.borderHex
      }; border-radius: 10px;">
          <tr>
            <td style="padding: 12px 12px;">
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #475569; margin-bottom: 4px;">
                ${c.label}
              </div>
              <div style="font-size: 20px; font-weight: 800; color: ${c.valueHex}; line-height: 1.2;">
                ${c.value}
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.3;">
                ${c.sub}
              </div>
            </td>
          </tr>
        </table>
      </td>`
    )
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;"><tr>${tds}</tr></table>`;
}

function renderProgressBar(pct: number, fillHex = '#059669'): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const rem = 100 - clamped;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 3px;">
      <tr>
        ${
          clamped > 0
            ? `<td width="${clamped}%" bgcolor="${fillHex}" height="5" style="background-color: ${fillHex}; border-radius: 3px; font-size: 1px; line-height: 1px;">&nbsp;</td>`
            : ''
        }
        ${
          rem > 0
            ? `<td width="${rem}%" bgcolor="#e2e8f0" height="5" style="background-color: #e2e8f0; border-radius: 3px; font-size: 1px; line-height: 1px;">&nbsp;</td>`
            : ''
        }
      </tr>
    </table>
  `;
}

export function buildReportEmailHtml(
  reportId: EmailReportRule['id'] | 'test_connection',
  dbInstance?: any
): { subject: string; html: string } {
  const db = dbInstance || getDb();
  const msk = getMoscowClock();
  const recon = computeZupVsRealReconciliation(db);
  const s = recon.summary;
  const dc = s.discrepancyCounts;

  if (reportId === 'test_connection') {
    const comp = computeLiveComplianceSummary(db);
    const g = computeGosuslugiVksEmailSummary(db);
    const subject = `✅ [Pondera İK] Telegram + Kurumsal Mail Eşzamanlı Bildirim Sistemi Aktif (${msk.dateDisplay})`;

    const kpiHtml = renderKpiGrid4([
      {
        label: 'AKTİF SAHA KADROSU',
        value: `${fmtNum(s.realActiveTotal)}`,
        sub: `Ana: ${fmtNum(s.realActiveMainFirm)} | Taşeron: ${fmtNum(s.realActiveSubcon)}`,
        bgHex: '#f8fafc',
        borderHex: '#cbd5e1',
        valueHex: '#0f172a',
      },
      {
        label: 'EVRAK UYUM ORANI',
        value: `%${comp.complianceRate}`,
        sub: `${fmtNum(comp.totalValid)} / ${fmtNum(comp.totalDocsCount)} Geçerli`,
        bgHex: '#ecfdf5',
        borderHex: '#a7f3d0',
        valueHex: '#047857',
      },
      {
        label: '1C ZUP RESMİ ORAN',
        value: `%${s.matchedActiveRateMainFirm}`,
        sub: `${fmtNum(s.matchedActiveBoth)} Eşleşen Aktif`,
        bgHex: '#eef2ff',
        borderHex: '#c7d2fe',
        valueHex: '#3730a3',
      },
      {
        label: 'GOSUSLUGI VKS',
        value: `${fmtNum(g.totalSent)}`,
        sub: `Оказана: ${fmtNum(g.totalRendered)} | PDF: ${fmtNum(g.totalPdf)}`,
        bgHex: '#eff6ff',
        borderHex: '#bfdbfe',
        valueHex: '#1d4ed8',
      },
    ]);

    const bodyHtml = `
      ${kpiHtml}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fdf4" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; margin-bottom: 18px;">
        <tr>
          <td style="padding: 14px 16px; color: #14532d; font-size: 13px;">
            <strong>✅ Kurumsal E-Posta &amp; Telegram Çift Kanal Otomasyonu Devrede</strong><br />
            Telegram İK grubuna düşen tüm periyodik ve anlık bildirimler artık aynı anda <strong>ikbildirim@pondera.ru</strong> üzerinden ilgili yöneticilere kurumsal tablo formatında da iletilmektedir.
          </td>
        </tr>
      </table>

      <h3 style="margin: 0 0 8px; font-size: 14px; color: #0f172a;">📅 Otomatik Gönderim Takvimi (Moskova Saati — MSK)</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12.5px;">
        <thead>
          <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
            <th align="left" style="padding: 9px 12px; border: 1px solid #cbd5e1;">Rapor Adı</th>
            <th align="left" style="padding: 9px 12px; border: 1px solid #cbd5e1;">Periyot &amp; Saat</th>
            <th align="left" style="padding: 9px 12px; border: 1px solid #cbd5e1;">Kanal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>1. Günlük Evrak Süreleri &amp; Eksik Evrak Raporu</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">Her Gün • <strong>09:15 MSK</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #047857;"><strong>Telegram + E-Posta</strong></td>
          </tr>
          <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>2. 1C ZUP (Resmi) ↔ eBA (Real) Kadro &amp; Fark Raporu</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">Her Gün • <strong>09:20 MSK</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #047857;"><strong>Telegram + E-Posta</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>3. Gosuslugi VKS Başvuru &amp; МВД Durum Özeti</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">15 Dk Hareket Varsa &amp; <strong>09:30 MSK</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #047857;"><strong>Telegram + E-Posta</strong></td>
          </tr>
          <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>4. Yönetim &amp; Kadro Turnover Analiz Özeti</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">Hafta İçi • <strong>10:00 MSK</strong></td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #1d4ed8;"><strong>Kurumsal E-Posta</strong></td>
          </tr>
        </tbody>
      </table>
    `;

    return {
      subject,
      html: renderCorporateEmailShell({
        accentHex: '#10b981',
        headerBgHex: '#0f172a',
        badgeText: 'PONDERA HR TEAMHUB • SİSTEM DOĞRULAMA & GENEL ÖZET',
        title: 'Kurumsal E-Posta & Telegram Eşzamanlı Bildirim Merkezi',
        subtitle: `Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay} • Sunucu: hr.pondera.network`,
        bodyHtml,
      }),
    };
  }

  // --- REPORT 2: 1C ZUP (Official) vs eBA (Real) Reconciliation ---
  if (reportId === 'zup_vs_real') {
    const meta = recon.metadata;
    const subject = `⚖️ [Pondera İK] 1C ZUP (Resmi) & eBA (Real) Karşılaştırma ve Fark Raporu (${meta.zupDate} ↔ ${meta.ebaDate})`;

    const kpiHtml = renderKpiGrid4([
      {
        label: 'EBA REAL AKTİF',
        value: fmtNum(s.realActiveTotal),
        sub: `Ana: ${fmtNum(s.realActiveMainFirm)} | Taşeron: ${fmtNum(s.realActiveSubcon)}`,
        bgHex: '#f8fafc',
        borderHex: '#cbd5e1',
        valueHex: '#0f172a',
      },
      {
        label: '1C ZUP RESMİ KADRO',
        value: fmtNum(s.zupOfficialTotal),
        sub: `Liste: ${meta.zupDate}`,
        bgHex: '#eef2ff',
        borderHex: '#c7d2fe',
        valueHex: '#312e81',
      },
      {
        label: 'RESMİDE ÇALIŞAN',
        value: fmtNum(s.matchedActiveBoth),
        sub: `Ana Kadro: %${s.matchedActiveRateMainFirm} | Genel: %${s.matchedActiveRateAll}`,
        bgHex: '#ecfdf5',
        borderHex: '#a7f3d0',
        valueHex: '#047857',
      },
      {
        label: 'ZUP AKTİF / REAL ÇIKIŞ',
        value: fmtNum(s.zupActiveButRealExited),
        sub: `Transfer (İç Geçiş): ${fmtNum(s.zupTransferPermitCheckCount || 0)}`,
        bgHex: '#fff1f2',
        borderHex: '#fecdd3',
        valueHex: '#be123c',
      },
    ]);

    const dateBannerHtml = meta.isZupOutdated
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffbeb" style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; margin-bottom: 18px;">
           <tr><td style="padding: 11px 15px; color: #92400e; font-size: 12.5px;">⚠️ <strong>Liste Güncellik Uyarısı:</strong> Real eBA listesi <strong>${meta.ebaDate}</strong>, 1C ZUP resmi listesi <strong>${meta.zupDate}</strong> tarihlidir.</td></tr>
         </table>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0fdf4" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; margin-bottom: 18px;">
           <tr><td style="padding: 10px 15px; color: #166534; font-size: 12.5px;">✅ <strong>Tam Eşzamanlı Veri:</strong> 1C ZUP Resmi Liste (<strong>${meta.zupDate}</strong>) ↔ eBA Real Liste (<strong>${meta.ebaDate}</strong>)</td></tr>
         </table>`;

    const permitRowsHtml = (recon.byPermitStatus || [])
      .map((p: any, idx: number) => {
        const diffNum = Number(p.diff || 0);
        const diffStr = diffNum > 0 ? `+${fmtNum(diffNum)}` : fmtNum(diffNum);
        const diffColor = diffNum === 0 ? '#059669' : '#b45309';
        const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        return `
        <tr bgcolor="${rowBg}" style="background-color: ${rowBg};">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${p.labelTr || p.shortTr}</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(p.zupCount)}</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${fmtNum(p.realActiveCount)}</td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: ${diffColor};"><strong>${diffStr}</strong></td>
        </tr>`;
      })
      .join('');

    const regionRowsHtml = (recon.byRegion || [])
      .filter((r: any) => r.realActive > 0 || r.zupActiveRealExit > 0)
      .map((r: any, idx: number) => {
        const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        return `
        <tr bgcolor="${rowBg}" style="background-color: ${rowBg};">
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${r.region}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${fmtNum(r.realActive)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #047857;">
            <strong>${fmtNum(r.inZupOfficial)}</strong> <span style="font-size: 11px; color: #059669;">(%${r.officialRatePct})</span>
            ${renderProgressBar(Number(r.officialRatePct || 0), '#10b981')}
          </td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #b45309;">${fmtNum(r.missingMainFirm)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #4338ca;">${fmtNum(r.transferCount || 0)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #be123c;"><strong>${fmtNum(r.zupActiveRealExit)}</strong></td>
        </tr>`;
      })
      .join('');

    const bodyHtml = `
      ${dateBannerHtml}
      ${kpiHtml}

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">📊 1. Genel Kadro Mutabakatı &amp; Kritik Sapmalar</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 12.5px; border: 1px solid #cbd5e1;">
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>eBA Real Aktif Kadro (${meta.ebaDate})</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(s.realActiveTotal)} Kişi</strong> (Ana Kadro: ${fmtNum(s.realActiveMainFirm)} | Taşeron: ${fmtNum(s.realActiveSubcon)})</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>1C ZUP Resmi Kadro (${meta.zupDate})</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(s.zupOfficialTotal)} Kişi</strong></td>
        </tr>
        <tr bgcolor="#f0fdf4" style="background-color: #f0fdf4;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #bbf7d0; color: #14532d;"><strong>✅ Hem Real'de Aktif Hem Resmide Çalışan</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #bbf7d0; color: #14532d;"><strong>${fmtNum(s.matchedActiveBoth)} Kişi</strong> (Ana Kadro: <strong>%${s.matchedActiveRateMainFirm}</strong> | Genel: <strong>%${s.matchedActiveRateAll}</strong>)</td>
        </tr>
        <tr bgcolor="#eef2ff" style="background-color: #eef2ff;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #c7d2fe; color: #312e81;"><strong>🔄 Şirket İçi Şantiye Transferi (ZUP Aktif)</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #c7d2fe; color: #312e81;"><strong>${fmtNum(s.zupTransferPermitCheckCount || 0)} Kişi</strong> (İzin bölgesi kontrolü)</td>
        </tr>
        <tr bgcolor="#fff1f2" style="background-color: #fff1f2;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #fecdd3; color: #9f1239;"><strong>🔴 1C ZUP'ta Aktif / Real'de ÇIKIŞ Yapılmış</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #fecdd3; color: #be123c;"><strong>${fmtNum(s.zupActiveButRealExited)} Kişi</strong> (Sahadan ayrılmış, resmi çıkışı düşülecek)</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #92400e;"><strong>🟠 Real Ana Kadroda Aktif / 1C ZUP'ta Yok</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #b45309;"><strong>${fmtNum(s.realActiveNotInZupMainFirm)} Kişi</strong> (${fmtNum(s.realActiveNotInZupRecentHire)} yeni giriş)</td>
        </tr>
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>🟡 Real Taşeronda Aktif / 1C ZUP Dışı</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(s.realActiveNotInZupSubcon)} Kişi</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px;"><strong>🟣 Sadece 1C ZUP'ta Var / eBA'da Kaydı Yok</strong></td>
          <td align="right" style="padding: 8px 12px;"><strong>${fmtNum(s.zupOnlyNotInRealDB)} Kişi</strong></td>
        </tr>
      </table>

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">🪪 2. Statü / Çalışma İzni Bazlı 1C ZUP vs eBA Real Dağılımı</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 12px; border: 1px solid #cbd5e1;">
        <thead>
          <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
            <th align="left" style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; color: #334155;">Statü / İzin Türü</th>
            <th align="right" style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; color: #334155;">1C ZUP</th>
            <th align="right" style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; color: #334155;">eBA Real</th>
            <th align="right" style="padding: 8px 12px; border-bottom: 2px solid #cbd5e1; color: #334155;">Fark</th>
          </tr>
        </thead>
        <tbody>${permitRowsHtml}</tbody>
      </table>

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">🏗 3. Şantiye / Bölge Bazlı Resmi (1C ZUP) Çalışma Oranları</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 12px; border: 1px solid #cbd5e1;">
        <thead>
          <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
            <th align="left" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Şantiye / Bölge</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Real Aktif</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Resmide (ZUP)</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Ana Eksik</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Transfer</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Gerçek Çıkış</th>
          </tr>
        </thead>
        <tbody>${regionRowsHtml}</tbody>
      </table>

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">🔍 4. Eşleşen Personellerde Veri &amp; Kimlik Farkları</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0;">🛂 Pasaport Numarası Farklı</td>
          <td align="right" style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(dc.passportMismatch)} kişi</strong></td>
          <td style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0;">🪪 Çalışma Statüsü (VKS/Patent/RNR) Farklı</td>
          <td align="right" style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(dc.permitStatusMismatch)} kişi</strong></td>
        </tr>
        <tr>
          <td style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0;">🧾 İNN Numarası Farklı / eBA Boş</td>
          <td align="right" style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(dc.innMismatch)} / ${fmtNum(dc.missingInnInEba)}</strong></td>
          <td style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0;">🔢 Sicil No Format Farkı (Nokta/Harf eki)</td>
          <td align="right" style="padding: 7px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(dc.sicilFormatDiff)} kişi</strong></td>
        </tr>
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 7px 12px;">🎂 Doğum Tarihi Farklı</td>
          <td align="right" style="padding: 7px 12px;"><strong>${fmtNum(dc.birthDateMismatch)} kişi</strong></td>
          <td style="padding: 7px 12px; border-left: 1px solid #e2e8f0;">🔤 Kiril Ad Soyad Yazım Farkı</td>
          <td align="right" style="padding: 7px 12px;"><strong>${fmtNum(dc.kirilNameDiff)} kişi</strong></td>
        </tr>
      </table>
    `;

    return {
      subject,
      html: renderCorporateEmailShell({
        accentHex: '#6366f1',
        headerBgHex: '#1e1b4b',
        badgeText: 'PONDERA İK • RESMİ (1C ZUP) ↔ REAL (eBA) MUTABAKAT RAPORU',
        title: '⚖️ 1C ZUP (Resmi) & eBA (Real) Karşılaştırma ve Fark Raporu',
        subtitle: `Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay} • ZUP Liste: ${meta.zupDate} • eBA Liste: ${meta.ebaDate}`,
        bodyHtml,
        ctaLabel: 'Resmi & Real Karşılaştırma Modülünü Aç →',
      }),
    };
  }

  // --- REPORT 1: Daily Document Expiry & Compliance ---
  if (reportId === 'daily_compliance') {
    const comp = computeLiveComplianceSummary(db);
    const subject = `📋 [Pondera İK] Günlük Evrak Süreleri İstatistik Raporu (${msk.dateDisplay} — Uyum: %${comp.complianceRate})`;

    const kpiHtml = renderKpiGrid4([
      {
        label: 'AKTİF PERSONEL',
        value: fmtNum(comp.activePersonnelCount),
        sub: `Referans: ${comp.referenceDateDisplay}`,
        bgHex: '#f8fafc',
        borderHex: '#cbd5e1',
        valueHex: '#0f172a',
      },
      {
        label: 'KONTROL EDİLEN EVRAK',
        value: fmtNum(comp.totalDocsCount),
        sub: '8 Yasal Evrak Türü',
        bgHex: '#f8fafc',
        borderHex: '#cbd5e1',
        valueHex: '#0f172a',
      },
      {
        label: 'GENEL UYUM ORANI',
        value: `%${comp.complianceRate}`,
        sub: `${fmtNum(comp.totalValid)} Geçerli Evrak`,
        bgHex: '#ecfdf5',
        borderHex: '#a7f3d0',
        valueHex: '#047857',
      },
      {
        label: 'GEÇMİŞ + KRİTİK',
        value: fmtNum(comp.totalExpired + comp.totalCritical),
        sub: `${fmtNum(comp.totalExpired)} Geçmiş | ${fmtNum(comp.totalCritical)} Kritik`,
        bgHex: '#fef2f2',
        borderHex: '#fecaca',
        valueHex: '#b91c1c',
      },
    ]);

    const statusSummaryBar = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 20px; font-size: 12px;">
        <tr>
          <td style="padding: 10px 14px;">
            🔴 Süresi Geçmiş: <strong style="color: #dc2626;">${fmtNum(comp.totalExpired)}</strong> &nbsp;•&nbsp;
            🟠 Kritik (≤15g / Vize ≤30g): <strong style="color: #ea580c;">${fmtNum(comp.totalCritical)}</strong> &nbsp;•&nbsp;
            🟡 Yaklaşan Uyarı: <strong style="color: #ca8a04;">${fmtNum(comp.totalWarning)}</strong> &nbsp;•&nbsp;
            ⚪ Eksik Evrak: <strong style="color: #475569;">${fmtNum(comp.totalMissing)}</strong> &nbsp;•&nbsp;
            🟢 Geçerli: <strong style="color: #059669;">${fmtNum(comp.totalValid)}</strong>
          </td>
        </tr>
      </table>
    `;

    const docRowsHtml = comp.docList
      .map((d, idx) => {
        const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        const rate = d.totalChecked > 0 ? Math.round((d.validCount / d.totalChecked) * 100) : 0;
        return `
        <tr bgcolor="${rowBg}" style="background-color: ${rowBg};">
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${d.label}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${fmtNum(d.totalChecked)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626;"><strong>${fmtNum(d.expiredCount)}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #ea580c;"><strong>${fmtNum(d.criticalCount)}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #ca8a04;">${fmtNum(d.warningCount)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${fmtNum(d.missingCount)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #059669;"><strong>${fmtNum(d.validCount)}</strong> <span style="font-size: 11px;">(%${rate})</span></td>
        </tr>`;
      })
      .join('');

    const regRowsHtml = comp.topRegions
      .map((r, idx) => {
        const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        return `
        <tr bgcolor="${rowBg}" style="background-color: ${rowBg};">
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${r.region}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(r.total)}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626;"><strong>${fmtNum(r.expired)}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #ea580c;"><strong>${fmtNum(r.critical)}</strong></td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #ca8a04;">${fmtNum(r.warning)}</td>
          <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b;">${fmtNum(r.missing)}</td>
        </tr>`;
      })
      .join('');

    const bodyHtml = `
      ${kpiHtml}
      ${statusSummaryBar}

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">📂 1. Evrak Türüne Göre Dağılım Tablosu</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 12px; border: 1px solid #cbd5e1;">
        <thead>
          <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
            <th align="left" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Evrak Türü</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Toplam</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #b91c1c;">Geçmiş</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #c2410c;">Kritik</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #a16207;">Uyarı</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #475569;">Eksik</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #047857;">Geçerli</th>
          </tr>
        </thead>
        <tbody>
          ${docRowsHtml}
          <tr bgcolor="#e2e8f0" style="background-color: #e2e8f0; font-weight: 700;">
            <td style="padding: 9px 10px; border-top: 2px solid #94a3b8;"><strong>TOPLAM</strong></td>
            <td align="right" style="padding: 9px 10px; border-top: 2px solid #94a3b8;"><strong>${fmtNum(comp.totalDocsCount)}</strong></td>
            <td align="right" style="padding: 9px 10px; border-top: 2px solid #94a3b8; color: #b91c1c;"><strong>${fmtNum(comp.totalExpired)}</strong></td>
            <td align="right" style="padding: 9px 10px; border-top: 2px solid #94a3b8; color: #c2410c;"><strong>${fmtNum(comp.totalCritical)}</strong></td>
            <td align="right" style="padding: 9px 10px; border-top: 2px solid #94a3b8; color: #a16207;"><strong>${fmtNum(comp.totalWarning)}</strong></td>
            <td align="right" style="padding: 9px 10px; border-top: 2px solid #94a3b8; color: #334155;"><strong>${fmtNum(comp.totalMissing)}</strong></td>
            <td align="right" style="padding: 9px 10px; border-top: 2px solid #94a3b8; color: #047857;"><strong>${fmtNum(comp.totalValid)} (%${comp.complianceRate})</strong></td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">🏗 2. Şantiye / Bölge Bazlı Evrak Özeti</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
        <thead>
          <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
            <th align="left" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Şantiye / Bölge</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Aktif Kişi</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #b91c1c;">Süresi Geçmiş</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #c2410c;">Kritik</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #a16207;">Uyarı</th>
            <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #475569;">Eksik</th>
          </tr>
        </thead>
        <tbody>${regRowsHtml}</tbody>
      </table>
    `;

    return {
      subject,
      html: renderCorporateEmailShell({
        accentHex: '#10b981',
        headerBgHex: '#064e3b',
        badgeText: 'PONDERA İK • GÜNLÜK EVRAK GEÇERLİLİK & SÜRE ANALİTİĞİ',
        title: '📋 Günlük Evrak Süreleri İstatistik Raporu',
        subtitle: `Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay} • Veri Referansı: ${comp.referenceDateDisplay} • Aktif Kadro: ${fmtNum(comp.activePersonnelCount)} Kişi`,
        bodyHtml,
        ctaLabel: 'Evrak & Süre Analitiği Tablosunu Aç →',
      }),
    };
  }

  // --- REPORT 3: Gosuslugi VKS & MVD Status ---
  if (reportId === 'vks_gosuslugi') {
    const g = computeGosuslugiVksEmailSummary(db);
    const vksPermit = (recon.byPermitStatus || []).find((p: any) => p.key === 'VKS');
    const subject = `🔔 [Pondera VKS / Gosuslugi] МВД Başvuru & Dekont Durum Raporu (${msk.dateDisplay} — ${fmtNum(g.totalSent)} Gönderim)`;

    const kpiHtml = renderKpiGrid4([
      {
        label: 'BAŞARILI GÖNDERİM',
        value: fmtNum(g.totalSent),
        sub: `Toplam Kayıt: ${fmtNum(g.totalRecords)}`,
        bgHex: '#eff6ff',
        borderHex: '#bfdbfe',
        valueHex: '#1e3a8a',
      },
      {
        label: 'УСЛУГА ОКАЗАНА',
        value: fmtNum(g.totalRendered),
        sub: 'МВД Tamamlanan',
        bgHex: '#ecfdf5',
        borderHex: '#a7f3d0',
        valueHex: '#047857',
      },
      {
        label: 'ЗАРЕГИСТРИРОВАНО',
        value: fmtNum(g.totalRegistered),
        sub: `Bekleyen: ${fmtNum(g.totalPending)}`,
        bgHex: '#eef2ff',
        borderHex: '#c7d2fe',
        valueHex: '#3730a3',
      },
      {
        label: 'ARŞİV PDF DEKONT',
        value: `${fmtNum(g.totalPdf)} / ${fmtNum(g.totalStatusPdf)}`,
        sub: 'Başvuru / Statü A4 PDF',
        bgHex: '#f8fafc',
        borderHex: '#cbd5e1',
        valueHex: '#0f172a',
      },
    ]);

    const bodyHtml = `
      ${kpiHtml}

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">🏛 1. Gosuslugi / МВД Başvuru Durumları (JSON Statü)</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin-bottom: 20px; font-size: 12.5px; border: 1px solid #cbd5e1;">
        <tr bgcolor="#f0fdf4" style="background-color: #f0fdf4;">
          <td style="padding: 9px 12px; border-bottom: 1px solid #bbf7d0; color: #14532d;"><strong>🟢 Услуга оказана (МВД Onaylandı / Tamamlanan)</strong></td>
          <td align="right" style="padding: 9px 12px; border-bottom: 1px solid #bbf7d0; color: #14532d;"><strong>${fmtNum(g.totalRendered)}</strong></td>
        </tr>
        <tr>
          <td style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; color: #1e40af;"><strong>🔵 Заявление зарегистрировано (МВД Kayıtlı / İncelemede)</strong></td>
          <td align="right" style="padding: 9px 12px; border-bottom: 1px solid #e2e8f0; color: #1d4ed8;"><strong>${fmtNum(g.totalRegistered)}</strong></td>
        </tr>
        <tr bgcolor="#fff1f2" style="background-color: #fff1f2;">
          <td style="padding: 9px 12px; border-bottom: 1px solid #fecdd3; color: #9f1239;"><strong>🔴 Услуга отказана (МВД Red)</strong></td>
          <td align="right" style="padding: 9px 12px; border-bottom: 1px solid #fecdd3; color: #be123c;"><strong>${fmtNum(g.totalRefused)}</strong></td>
        </tr>
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 9px 12px;"><strong>📤 Отправлено (Bekleyen — Kuyrukta / МВД Yanıtı Bekleniyor)</strong></td>
          <td align="right" style="padding: 9px 12px;"><strong>${fmtNum(g.totalPending)}</strong></td>
        </tr>
      </table>

      <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">📊 2. Ortak Sunucu Genel Toplam &amp; PDF Arşiv Durumu (Tüm Bilgisayarlar)</h3>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12.5px; border: 1px solid #cbd5e1;">
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>✅ Toplam Başarılı Gönderim</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(g.totalSent)}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; padding-left: 24px;">├ 📄 Başvuru (Заявка) PDF İndirilen</td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #047857;"><strong>${fmtNum(g.totalPdf)}</strong></td>
        </tr>
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; padding-left: 24px;">├ ⚡ Başvuru PDF Bekleyen (Hızlı Gönderim)</td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${fmtNum(g.totalNoPdf)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; padding-left: 24px;">├ 📸 Statü PDF (A4) İndirilen</td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #1d4ed8;"><strong>${fmtNum(g.totalStatusPdf)}</strong></td>
        </tr>
        <tr bgcolor="#f8fafc" style="background-color: #f8fafc;">
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; padding-left: 24px;">└ ⏳ Statü PDF Bekleyen</td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${fmtNum(g.totalNoStatusPdf)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #b45309;"><strong>⚠️ Toplam Hatalı Kayıt (Ошибка)</strong></td>
          <td align="right" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #b45309;"><strong>${fmtNum(g.totalErrors)}</strong></td>
        </tr>
        <tr bgcolor="#e2e8f0" style="background-color: #e2e8f0;">
          <td style="padding: 9px 12px; border-top: 2px solid #94a3b8;"><strong>📌 Genel Toplam İşlenen Kayıt (Aktif Saha VKS: ${fmtNum(vksPermit?.realActiveCount || 0)})</strong></td>
          <td align="right" style="padding: 9px 12px; border-top: 2px solid #94a3b8;"><strong>${fmtNum(g.totalRecords)}</strong></td>
        </tr>
      </table>
    `;

    return {
      subject,
      html: renderCorporateEmailShell({
        accentHex: '#3b82f6',
        headerBgHex: '#1e3a8a',
        badgeText: 'PONDERA İK • GOSUSLUGI ВКС & МВД YASAL BİLDİRİM MERKEZİ',
        title: '🔔 Gosuslugi VKS Bildirim & МВД Durum Raporu',
        subtitle: `Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay} • Ortak Sunucu (Tüm Bilgisayarlar)`,
        bodyHtml,
        ctaLabel: 'Gosuslugi VKS Bildirim Panelini Aç →',
      }),
    };
  }

  // --- REPORT 4: Management & Turnover Summary ---
  const vksRow = (recon.byPermitStatus || []).find((p: any) => p.key === 'VKS');
  const vksCount = vksRow?.realActiveCount || 0;
  const vksPct = s.realActiveTotal > 0 ? ((vksCount / s.realActiveTotal) * 100).toFixed(1) : '0.0';
  const regionSummaryHtml = (recon.byRegion || [])
    .filter((r: any) => r.realActive > 0)
    .map((r: any, idx: number) => {
      const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      return `
      <tr bgcolor="${rowBg}" style="background-color: ${rowBg};">
        <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${r.region}</strong></td>
        <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;"><strong>${fmtNum(r.realActive)}</strong></td>
        <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #059669;">${fmtNum(r.inZupOfficial)} (%${r.officialRatePct})</td>
        <td align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #4338ca;">${fmtNum(r.transferCount || 0)}</td>
      </tr>`;
    })
    .join('');

  const subject = `📊 [Pondera İK] Yönetim & Kadro Turnover Özeti (${msk.dateDisplay} — Aktif: ${fmtNum(s.realActiveTotal)})`;
  const kpiHtml = renderKpiGrid4([
    {
      label: 'TOPLAM AKTİF KADRO',
      value: fmtNum(s.realActiveTotal),
      sub: `Liste: ${recon.metadata.ebaDate}`,
      bgHex: '#f8fafc',
      borderHex: '#cbd5e1',
      valueHex: '#0f172a',
    },
    {
      label: 'PONDERA ANA KADRO',
      value: fmtNum(s.realActiveMainFirm),
      sub: `Taşeron: ${fmtNum(s.realActiveSubcon)}`,
      bgHex: '#ecfdf5',
      borderHex: '#a7f3d0',
      valueHex: '#047857',
    },
    {
      label: 'VKS UZMAN KADROSU',
      value: fmtNum(vksCount),
      sub: `Genel Oran: %${vksPct}`,
      bgHex: '#eff6ff',
      borderHex: '#bfdbfe',
      valueHex: '#1d4ed8',
    },
    {
      label: 'ŞANTİYE TRANSFERİ',
      value: fmtNum(s.zupTransferPermitCheckCount || 0),
      sub: 'Turnover Çıkış Hariç',
      bgHex: '#eef2ff',
      borderHex: '#c7d2fe',
      valueHex: '#3730a3',
    },
  ]);

  const bodyHtml = `
    ${kpiHtml}
    <h3 style="margin: 0 0 8px; font-size: 14.5px; color: #0f172a;">🏗 Şantiye / Bölge Bazlı Aktif Kadro Dağılımı</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-size: 12px; border: 1px solid #cbd5e1;">
      <thead>
        <tr bgcolor="#f1f5f9" style="background-color: #f1f5f9;">
          <th align="left" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Şantiye / Bölge</th>
          <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">Aktif Personel</th>
          <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">1C ZUP Resmi</th>
          <th align="right" style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1; color: #334155;">İç Transfer</th>
        </tr>
      </thead>
      <tbody>${regionSummaryHtml}</tbody>
    </table>
  `;

  return {
    subject,
    html: renderCorporateEmailShell({
      accentHex: '#0ea5e9',
      headerBgHex: '#0f172a',
      badgeText: 'PONDERA İK • YÖNETİM & TURNOVER ANALİZ ÖZETİ',
      title: '📊 Yönetim & Kadro Analiz Raporu (Şantiye Transferleri Hariç)',
      subtitle: `Moskova Saati: ${msk.dateDisplay} ${msk.timeDisplay} • Aktif Saha Kadrosu: ${fmtNum(s.realActiveTotal)} Kişi`,
      bodyHtml,
      ctaLabel: 'Yönetim & Turnover Raporlarını Aç →',
    }),
  };
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

  if (rule && !overrideRecipients?.to) {
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

export async function sendCustomAlertEmail(
  ruleId: EmailReportRule['id'],
  subject: string,
  htmlBody: string,
  overrideRecipients?: { to?: string[]; cc?: string[] }
): Promise<{ ok: boolean; skipped?: boolean; detail: string }> {
  try {
    const db = getDb();
    const smtp = getSmtpConfig(db);
    if (!smtp.enabled || !smtp.pass) {
      return { ok: false, skipped: true, detail: 'SMTP aktif değil.' };
    }
    const rules = getEmailReportRules(db);
    const rule = rules.find((r) => r.id === ruleId);
    if (rule && !rule.enabled && !overrideRecipients?.to) {
      return { ok: false, skipped: true, detail: `${ruleId} e-posta kuralı pasif.` };
    }

    const toList =
      overrideRecipients?.to && overrideRecipients.to.length > 0
        ? overrideRecipients.to
        : rule?.toEmails && rule.toEmails.length > 0
        ? rule.toEmails
        : [smtp.user || 'ikbildirim@pondera.ru'];
    const ccList =
      overrideRecipients?.cc !== undefined ? overrideRecipients.cc : rule?.ccEmails || [];

    const res = await sendRawSmtpMail(smtp, toList, ccList, subject, htmlBody);
    logEmailDelivery(db, `${ruleId}_alert`, subject, toList, ccList, res.ok ? 'SENT' : 'ERROR', res.detail);
    return { ok: res.ok, detail: res.detail };
  } catch (err: any) {
    return { ok: false, detail: err?.message || 'E-posta uyarısı gönderilemedi.' };
  }
}

export async function runScheduledEmailReports(force = false): Promise<{
  checkedAtMsk: string;
  triggered: Array<{ id: string; ok: boolean; status: string; message: string }>;
}> {
  const db = getDb();
  ensureVksQuarterlyArchiveAndState(db);
  const msk = getMoscowClock();
  const smtp = getSmtpConfig(db);
  const triggered: Array<{ id: string; ok: boolean; status: string; message: string }> = [];

  if (!smtp.enabled || !smtp.pass) {
    return { checkedAtMsk: `${msk.dateDisplay} ${msk.timeDisplay}`, triggered };
  }

  const rules = getEmailReportRules(db);
  const currentMinutes = msk.hour * 60 + msk.minute;
  const vksReportingActive = isVks15MinNotificationEnabled(db);

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!force && rule.frequency === 'on_upload') continue;
    if (!force && rule.id === 'vks_gosuslugi' && !vksReportingActive) continue;

    if (!force) {
      if (rule.frequency === 'weekdays' && (msk.weekday === 0 || msk.weekday === 6)) {
        continue;
      }
      if (rule.frequency === 'weekly' && msk.weekday !== 1) {
        continue;
      }

      const [hhStr, mmStr] = String(rule.scheduleTime || '09:15').split(':');
      const schedMinutes = (parseInt(hhStr || '9', 10) || 9) * 60 + (parseInt(mmStr || '15', 10) || 0);

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
