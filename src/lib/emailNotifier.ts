import net from 'net';
import tls from 'tls';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getDb } from './db';
import {
  computeZupVsRealReconciliation,
  extractZupReportDate,
  parseZupWorksheetRows,
  saveZupRecordsToDb,
} from './zupReconciliation';
import { getMoscowTimeParts } from './telegramNotifier';

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

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  enabled: false,
  host: 'mail.pondera.ru',
  port: 465,
  secure: true,
  user: 'info@pondera.ru',
  pass: '',
  fromName: 'Pondera HR TeamHub Bildirim Sistemi',
  fromEmail: 'info@pondera.ru',
  zupApiToken: 'PONDERA-ZUP-SYNC-2026-SECRET',
  zupAutoFolder: '/var/www/hr_pondera/uploads/zup_auto',
};

const DEFAULT_REPORT_RULES: EmailReportRule[] = [
  {
    id: 'daily_compliance',
    titleTr: '1. Günlük Eksik Evrak & Süre Analitiği Raporu',
    titleRu: '1. Ежедневный отчет по истекающим и недостающим документам',
    descriptionTr:
      'Pasaport, Vize, Patent, Registrasyon, DMS ve Propusk süresi dolan veya 15 gün içinde dolacak personellerin şantiye bazlı günlük raporu.',
    descriptionRu:
      'Ежедневная сводка по сотрудникам с истекшими или критическими сроками паспортов, виз, патентов и пропусков по участкам.',
    enabled: true,
    frequency: 'daily',
    scheduleTime: '09:15',
    toEmails: ['ik@pondera.ru', 'saha.koordinasyon@pondera.ru'],
    ccEmails: ['yonetim@pondera.ru'],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
  {
    id: 'zup_vs_real',
    titleTr: '2. 1C ZUP (Resmi) vs eBA (Real) Kadro & Veri Fark Özeti Raporu',
    titleRu: '2. Сводка расхождений 1С ЗУП (Офиц.) и eBA (Реал)',
    descriptionTr:
      'Mevcut çalışanların kaçının 1C ZUP resmi bordroda çalıştığı, gerçek çıkışlı olup ZUP’ta aktif kalanlar, şantiye transferleri (izin bölgesi kontrolü) ve pasaport/İNN/statü farkları.',
    descriptionRu:
      'Сверка численности 1С ЗУП и eBA Real: уволенные на площадке, переводы между объектами и расхождения паспортов/ИНН/статусов.',
    enabled: true,
    frequency: 'daily',
    scheduleTime: '09:20',
    toEmails: ['ik@pondera.ru', 'bordro.zup@pondera.ru'],
    ccEmails: ['yonetim@pondera.ru', 'baris@pondera.ru'],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
  {
    id: 'vks_gosuslugi',
    titleTr: '3. VKS (Yüksek Nitelikli Uzman) Gosuslugi & MVD Bildirim Raporu',
    titleRu: '3. Отчет по уведомлениям ВКС (Госуслуги / МВД)',
    descriptionTr:
      'Yeni işe giren veya işten ayrılan VKS (BKC) uzmanlarının 3 iş günü yasal MVD / Gosuslugi bildirim sürelerinin takibi.',
    descriptionRu:
      'Контроль 3-дневного срока подачи уведомлений в МВД через Госуслуги по принятым и уволенным специалистам ВКС.',
    enabled: true,
    frequency: 'daily',
    scheduleTime: '09:30',
    toEmails: ['vks.operasyon@pondera.ru', 'ik@pondera.ru'],
    ccEmails: ['yonetim@pondera.ru'],
    attachSummaryTable: true,
    lastSentAt: null,
    lastStatus: null,
  },
  {
    id: 'turnover_summary',
    titleTr: '4. Yönetim & Turnover (Giriş / Çıkış & VKS Oranı) Raporu',
    titleRu: '4. Управленческий отчет по текучести кадров (Прием / Увольнение / ВКС)',
    descriptionTr:
      'Şirket içi şantiye transferleri hariç gerçek işten çıkışlar, yeni işe girişler, VKS uzman oranları ve şantiye kırılımlı yönetim özeti.',
    descriptionRu:
      'Отчет для руководства по динамике приема и увольнений (без учета внутренних переводов) и доле специалистов ВКС.',
    enabled: true,
    frequency: 'weekdays',
    scheduleTime: '10:00',
    toEmails: ['yonetim@pondera.ru'],
    ccEmails: ['ik@pondera.ru'],
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

export function saveSmtpConfig(config: Partial<SmtpConfig>, dbInstance?: any): SmtpConfig {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  const current = getSmtpConfig(db);
  const merged: SmtpConfig = {
    ...current,
    ...config,
    // Keep existing password if masked or empty string not explicitly clearing
    pass:
      config.pass !== undefined && config.pass !== '••••••••'
        ? config.pass
        : current.pass,
    port: Number(config.port ?? current.port) || 465,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO system_info (key, value) VALUES ('email_smtp_config', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(merged));

  return merged;
}

export function getEmailReportRules(dbInstance?: any): EmailReportRule[] {
  const db = dbInstance || getDb();
  ensureEmailTables(db);
  const row = db.prepare('SELECT value FROM system_info WHERE key = ?').get('email_report_rules') as
    | { value?: string }
    | undefined;
  if (!row?.value) {
    return DEFAULT_REPORT_RULES;
  }
  try {
    const saved = JSON.parse(row.value) as EmailReportRule[];
    if (!Array.isArray(saved)) return DEFAULT_REPORT_RULES;
    return DEFAULT_REPORT_RULES.map((def) => {
      const found = saved.find((s) => s.id === def.id);
      if (!found) return def;
      return {
        ...def,
        ...found,
        toEmails: Array.isArray(found.toEmails) ? found.toEmails : def.toEmails,
        ccEmails: Array.isArray(found.ccEmails) ? found.ccEmails : def.ccEmails,
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

export function getEmailLogs(limit = 20, dbInstance?: any): EmailLogEntry[] {
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
  const msk = getMoscowTimeParts();
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
 * Minimal zero-dependency SMTP client supporting SSL/TLS (port 465) and Direct/Plain SMTP
 */
async function sendRawSmtpMail(
  config: SmtpConfig,
  to: string[],
  cc: string[],
  subject: string,
  htmlBody: string
): Promise<{ ok: boolean; detail: string }> {
  const recipients = Array.from(new Set([...to, ...cc].map((e) => e.trim()).filter(Boolean)));
  if (recipients.length === 0) {
    return { ok: false, detail: 'Alıcı (To / CC) adresi tanımlanmamış.' };
  }
  if (!config.host || !config.user || !config.pass) {
    return {
      ok: false,
      detail: 'SMTP sunucu veya şifre bilgisi henüz girilmedi (IT Direktörü Barış Bey’den bilgi bekleniyor).',
    };
  }

  return new Promise((resolve) => {
    const timeoutMs = 10000;
    let settled = false;
    const finish = (ok: boolean, detail: string, socket?: net.Socket | tls.TLSSocket) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {}
      resolve({ ok, detail });
    };

    const onConnect = (socket: net.Socket | tls.TLSSocket) => {
      let step = 0;
      let buffer = '';

      const sendLine = (line: string) => {
        socket.write(line + '\r\n');
      };

      socket.setTimeout(timeoutMs, () => {
        finish(false, `SMTP bağlantı zaman aşımı (${config.host}:${config.port})`, socket);
      });

      socket.on('error', (err) => {
        finish(false, `SMTP bağlantı hatası: ${err.message}`, socket);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!buffer.endsWith('\r\n')) return;
        const lines = buffer.trim().split('\r\n');
        const lastLine = lines[lines.length - 1] || '';
        // Multi-line response still continuing if 4th char is '-'
        if (lastLine.length >= 4 && lastLine[3] === '-') return;
        const code = parseInt(lastLine.slice(0, 3), 10);
        buffer = '';

        if (code >= 400) {
          finish(false, `SMTP Sunucu Yanıtı (${code}): ${lastLine}`, socket);
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
          sendLine(Buffer.from(config.user, 'utf8').toString('base64'));
        } else if (step === 3 && code === 334) {
          step = 4;
          sendLine(Buffer.from(config.pass, 'utf8').toString('base64'));
        } else if (step === 4 && code === 235) {
          step = 5;
          sendLine(`MAIL FROM:<${config.fromEmail || config.user}>`);
        } else if (step === 5 && code === 250) {
          step = 6;
          for (const rcpt of recipients) {
            sendLine(`RCPT TO:<${rcpt}>`);
          }
        } else if (step === 6 && code === 250) {
          step = 7;
          sendLine(`DATA`);
        } else if (step === 7 && code === 354) {
          step = 8;
          const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
          const encodedFromName = `=?UTF-8?B?${Buffer.from(config.fromName || 'Pondera HR', 'utf8').toString('base64')}?=`;
          const headers = [
            `From: "${encodedFromName}" <${config.fromEmail || config.user}>`,
            `To: ${to.join(', ')}`,
            ...(cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
            `Subject: ${encodedSubject}`,
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
          finish(true, `E-posta başarıyla gönderildi (${recipients.length} alıcı).`, socket);
        }
      });
    };

    try {
      if (config.secure || config.port === 465) {
        const tlsSocket = tls.connect(
          {
            host: config.host,
            port: config.port,
            rejectUnauthorized: false,
          },
          () => onConnect(tlsSocket)
        );
        tlsSocket.on('error', (err) => finish(false, `TLS Bağlantı Hatası: ${err.message}`, tlsSocket));
      } else {
        const netSocket = net.createConnection({ host: config.host, port: config.port }, () =>
          onConnect(netSocket)
        );
        netSocket.on('error', (err) => finish(false, `TCP Bağlantı Hatası: ${err.message}`, netSocket));
      }
    } catch (err: any) {
      finish(false, err?.message || 'SMTP başlatılamadı.');
    }
  });
}

export function buildReportEmailHtml(
  reportId: EmailReportRule['id'] | 'test_connection',
  dbInstance?: any
): { subject: string; html: string } {
  const db = dbInstance || getDb();
  const msk = getMoscowTimeParts();

  if (reportId === 'test_connection') {
    return {
      subject: `✅ [Pondera HR TeamHub] Kurumsal E-Posta Bildirim Testi (${msk.dateDisplay})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
          <div style="background: #0f172a; color: #ffffff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 18px;">Pondera HR TeamHub — Kurumsal Mail Bildirim Sistemi</h2>
            <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">Tarih: ${msk.dateDisplay} ${msk.timeDisplay} (MSK) • Sunucu: hr.pondera.network</p>
          </div>
          <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
            <p>Merhaba,</p>
            <p>Bu e-posta <strong>Pondera HR TeamHub (hr.pondera.network)</strong> üzerindeki <strong>Kurumsal E-Posta Bildirim Motoru</strong> tarafından bağlantı doğrulaması amacıyla gönderilmiştir.</p>
            <p style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 10px; color: #166534;">
              ✅ <strong>SMTP Bağlantısı Aktif:</strong> Günlük Eksik Evrak Raporu, 1C ZUP vs eBA Real Karşılaştırma Raporu ve VKS Gosuslugi Bildirim Raporları belirlenen To / CC alıcılarına otomatik olarak iletilecektir.
            </p>
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

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 740px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(90deg, #1e1b4b, #312e81); color: #ffffff; padding: 20px 24px;">
          <h2 style="margin: 0; font-size: 18px;">⚖️ 1C ZUP (Resmi) ↔ eBA (Real) Çapraz Denetim Raporu</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #c7d2fe;">
            1C ZUP Liste Tarihi: <strong>${recon.metadata.zupDate}</strong> | eBA Real Tarihi: <strong>${recon.metadata.ebaDate}</strong>
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

          <h3 style="color: #0f172a; font-size: 15px;">2. Bölge Bazlı Resmi Çalışma Oranları</h3>
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

          <h3 style="color: #0f172a; font-size: 15px;">3. Sicil & Kimlik Veri Farkları</h3>
          <ul style="padding-left: 18px; margin: 6px 0 16px;">
            <li>Pasaport No Uyuşmazlığı: <strong>${dc.passportMismatch} kişi</strong></li>
            <li>Çalışma / Vergi Statüsü Farkı (VKS/Patent/RNR): <strong>${dc.permitStatusMismatch} kişi</strong></li>
            <li>İNN Numarası Farklı: <strong>${dc.innMismatch} kişi</strong> (eBA İNN Eksik: <strong>${dc.missingInnInEba} kişi</strong>)</li>
            <li>Sicil No Format Farkı (Nokta/Harf eki): <strong>${dc.sicilFormatDiff} kişi</strong></li>
          </ul>

          <p style="font-size: 12px; color: #64748b; margin-top: 16px;">
            Detaylı interaktif grafik ve Excel raporu için: <a href="https://hr.pondera.network" style="color: #4f46e5;">https://hr.pondera.network</a> (Resmi & Real Karşılaştırma Modülü)
          </p>
        </div>
      </div>
    `;
    return { subject, html };
  }

  if (reportId === 'daily_compliance') {
    const subject = `📋 [Pondera İK] Günlük Eksik Evrak & Süre Analitiği Raporu (${msk.dateDisplay})`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden;">
        <div style="background: #065f46; color: #ffffff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 18px;">📋 Günlük Evrak Geçerlilik & Süre Kontrol Raporu</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #a7f3d0;">Tarih: ${msk.dateDisplay} • Aktif Saha Kadrosu: ${s.realActiveTotal} Kişi</p>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.6;">
          <p>Sahadaki mevcut ve izinli personellerin Pasaport, Vize, Patent, Registrasyon, DMS ve Propusk evrak süreleri taranmıştır.</p>
          <p>Detaylı şantiye ve Kazan alt şantiye kırılımlarını incelemek için <a href="https://hr.pondera.network" style="color: #059669;">hr.pondera.network</a> Evrak & Süre Analitiği sayfasını ziyaret edebilirsiniz.</p>
        </div>
      </div>
    `;
    return { subject, html };
  }

  if (reportId === 'vks_gosuslugi') {
    const subject = `🛂 [Pondera İK] VKS (Yüksek Nitelikli Uzman) Gosuslugi & MVD Bildirim Raporu (${msk.dateDisplay})`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden;">
        <div style="background: #1e3a8a; color: #ffffff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 18px;">🛂 VKS (BKC) Gosuslugi & MVD Yasal Bildirim Raporu</h2>
          <p style="margin: 6px 0 0; font-size: 12px; color: #bfdbfe;">Tarih: ${msk.dateDisplay} • 3 İş Günü Yasal Bildirim Takibi</p>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.6;">
          <p>Yeni işe başlayan ve gerçek işten çıkışı yapılan (şantiye transferleri hariç) VKS uzmanlarının MVD / Gosuslugi bildirim durumları güncellenmiştir.</p>
          <p>Detaylar için: <a href="https://hr.pondera.network" style="color: #2563eb;">https://hr.pondera.network</a></p>
        </div>
      </div>
    `;
    return { subject, html };
  }

  const subject = `📊 [Pondera İK] Yönetim & Turnover (Giriş / Çıkış & VKS Oranı) Raporu (${msk.dateDisplay})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden;">
      <div style="background: #0f172a; color: #ffffff; padding: 18px 24px;">
        <h2 style="margin: 0; font-size: 18px;">📊 Yönetim & Turnover Analiz Özeti (Transferler Hariç)</h2>
        <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">Tarih: ${msk.dateDisplay} • Aktif Kadro: ${s.realActiveTotal} Kişi</p>
      </div>
      <div style="padding: 20px 24px; color: #1e293b; font-size: 13px; line-height: 1.6;">
        <p>Şirket içi şantiye transferleri çıkış sayılarından arındırılmış olup, güncel giriş/çıkış ve VKS uzman oranları Yönetim & Turnover panelinde yayındadır.</p>
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

  const toList =
    overrideRecipients?.to && overrideRecipients.to.length > 0
      ? overrideRecipients.to
      : rule?.toEmails || [smtp.user || 'info@pondera.ru'];
  const ccList =
    overrideRecipients?.cc !== undefined ? overrideRecipients.cc : rule?.ccEmails || [];

  const { subject, html } = buildReportEmailHtml(reportId, db);

  if (!smtp.enabled || !smtp.pass) {
    const detail = !smtp.pass
      ? 'SMTP şifresi henüz tanımlanmadığı için e-posta gönderim kuyruğuna (Outbox) kaydedildi. Ayarlar > Mail Bildirimleri sekmesinden SMTP bilgilerini girdiğinizde otomatik gönderilecektir.'
      : 'E-posta gönderimi pasif durumda olduğu için kuyruğa kaydedildi.';
    logEmailDelivery(db, reportId, subject, toList, ccList, 'QUEUED', detail);

    if (rule) {
      const msk = getMoscowTimeParts();
      const updated = rules.map((r) =>
        r.id === reportId
          ? { ...r, lastSentAt: `${msk.dateDisplay} ${msk.timeDisplay}`, lastStatus: 'Kuyruğa Alındı (SMTP Bekleniyor)' }
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
    const msk = getMoscowTimeParts();
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
