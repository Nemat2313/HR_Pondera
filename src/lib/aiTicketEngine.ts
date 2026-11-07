import https from 'https';
import tls from 'tls';
import crypto from 'crypto';
import { getDb } from '@/lib/db';
import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';
import upcomingTicketsSeed from '@/data/upcomingTicketsSeed.json';

// Official Russian Ministry of Digital Development (Минцифры) Root & Sub CA
// Required for Sberbank GigaChat OAuth & API endpoints (ngw.devices.sberbank.ru / gigachat.devices.sberbank.ru)
const RUSSIAN_TRUSTED_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`;

const RUSSIAN_TRUSTED_SUB_CA = `-----BEGIN CERTIFICATE-----
MIIHQjCCBSqgAwIBAgICEAIwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAyMTEyNTE5WhcNMjcwMzA2MTEyNTE5WjBvMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMR8wHQYDVQQDDBZSdXNzaWFuIFRydXN0ZWQgU3Vi
IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA9YPqBKOk19NFymrE
wehzrhBEgT2atLezpduB24mQ7CiOa/HVpFCDRZzdxqlh8drku408/tTmWzlNH/br
HuQhZ/miWKOf35lpKzjyBd6TPM23uAfJvEOQ2/dnKGGJbsUo1/udKSvxQwVHpVv3
S80OlluKfhWPDEXQpgyFqIzPoxIQTLZ0deirZwMVHarZ5u8HqHetRuAtmO2ZDGQn
vVOJYAjls+Hiueq7Lj7Oce7CQsTwVZeP+XQx28PAaEZ3y6sQEt6rL06ddpSdoTMp
BnCqTbxW+eWMyjkIn6t9GBtUV45yB1EkHNnj2Ex4GwCiN9T84QQjKSr+8f0psGrZ
vPbCbQAwNFJjisLixnjlGPLKa5vOmNwIh/LAyUW5DjpkCx004LPDuqPpFsKXNKpa
L2Dm6uc0x4Jo5m+gUTVORB6hOSzWnWDj2GWfomLzzyjG81DRGFBpco/O93zecsIN
3SL2Ysjpq1zdoS01CMYxie//9zWvYwzI25/OZigtnpCIrcd2j1Y6dMUFQAzAtHE+
qsXflSL8HIS+IJEFIQobLlYhHkoE3avgNx5jlu+OLYe0dF0Ykx1PGNjbwqvTX37R
Cn32NMjlotW2QcGEZhDKj+3urZizp5xdTPZitA+aEjZM/Ni71VOdiOP0igbw6asZ
2fxdozZ1TnSSYNYvNATwthNmZysCAwEAAaOCAeUwggHhMBIGA1UdEwEB/wQIMAYB
Af8CAQAwDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBTR4XENCy2BTm6KSo9MI7NM
XqtpCzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzCBxwYIKwYBBQUH
AQEEgbowgbcwOwYIKwYBBQUHMAKGL2h0dHA6Ly9yb3N0ZWxlY29tLnJ1L2NkcC9y
b290Y2Ffc3NsX3JzYTIwMjIuY3J0MDsGCCsGAQUFBzAChi9odHRwOi8vY29tcGFu
eS5ydC5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNydDA7BggrBgEFBQcwAoYv
aHR0cDovL3JlZXN0ci1wa2kucnUvY2RwL3Jvb3RjYV9zc2xfcnNhMjAyMi5jcnQw
gbAGA1UdHwSBqDCBpTA1oDOgMYYvaHR0cDovL3Jvc3RlbGVjb20ucnUvY2RwL3Jv
b3RjYV9zc2xfcnNhMjAyMi5jcmwwNaAzoDGGL2h0dHA6Ly9jb21wYW55LnJ0LnJ1
L2NkcC9yb290Y2Ffc3NsX3JzYTIwMjIuY3JsMDWgM6Axhi9odHRwOi8vcmVlc3Ry
LXBraS5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNybDANBgkqhkiG9w0BAQsF
AAOCAgEARBVzZls79AdiSCpar15dA5Hr/rrT4WbrOfzlpI+xrLeRPrUG6eUWIW4v
Sui1yx3iqGLCjPcKb+HOTwoRMbI6ytP/ndp3TlYua2advYBEhSvjs+4vDZNwXr/D
anbwIWdurZmViQRBDFebpkvnIvru/RpWud/5r624Wp8voZMRtj/cm6aI9LtvBfT9
cfzhOaexI/99c14dyiuk1+6QhdwKaCRTc1mdfNQmnfWNRbfWhWBlK3h4GGE9JK33
Gk8ZS8DMrkdAh0xby4xAQ/mSWAfWrBmfzlOqGyoB1U47WTOeqNbWkkoAP2ys94+s
Jg4NTkiDVtXRF6nr6fYi0bSOvOFg0IQrMXO2Y8gyg9ARdPJwKtvWX8VPADCYMiWH
h4n8bZokIrImVKLDQKHY4jCsND2HHdJfnrdL2YJw1qFskNO4cSNmZydw0Wkgjv9k
F+KxqrDKlB8MZu2Hclph6v/CZ0fQ9YuE8/lsHZ0Qc2HyiSMnvjgK5fDc3TD4fa8F
E8gMNurM+kV8PT8LNIM+4Zs+LKEV8nqRWBaxkIVJGekkVKO8xDBOG/aN62AZKHOe
GcyIdu7yNMMRihGVZCYr8rYiJoKiOzDqOkPkLOPdhtVlgnhowzHDxMHND/E2WA5p
ZHuNM/m0TXt2wTTPL7JH2YC0gPz/BvvSzjksgzU5rLbRyUKQkgU=
-----END CERTIFICATE-----`;

export type AiProviderId =
  | 'deepseek'
  | 'deepseek_ocr'
  | 'yandex'
  | 'gigachat'
  | 'gemini'
  | 'openrouter'
  | 'ru_docs_ocr';

export interface AiProviderSettingsRow {
  id: number;
  active_provider: AiProviderId;
  fallback_provider: string;
  hybrid_ocr_enabled: number;
  deepseek_api_key: string;
  deepseek_base_url: string;
  deepseek_model: string;
  deepseek_ocr_base_url: string;
  deepseek_ocr_api_key: string;
  deepseek_ocr_model: string;
  yandex_folder_id: string;
  yandex_api_key: string;
  yandex_model: string;
  gigachat_auth_key: string;
  gigachat_scope: string;
  gigachat_model: string;
  gemini_api_key: string;
  gemini_base_url: string;
  gemini_model: string;
  openrouter_api_key: string;
  openrouter_model: string;
  ru_docs_ocr_url: string;
  ru_docs_ocr_key: string;
  updated_at: string;
}

let tablesEnsured = false;

export function ensureAiTicketTables() {
  const db = getDb();
  if (tablesEnsured) return db;

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_provider_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_provider TEXT NOT NULL DEFAULT 'deepseek',
      fallback_provider TEXT NOT NULL DEFAULT '',
      hybrid_ocr_enabled INTEGER NOT NULL DEFAULT 0,
      deepseek_api_key TEXT NOT NULL DEFAULT '',
      deepseek_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
      deepseek_model TEXT NOT NULL DEFAULT 'deepseek-chat',
      deepseek_ocr_base_url TEXT NOT NULL DEFAULT 'https://api.siliconflow.com/v1',
      deepseek_ocr_api_key TEXT NOT NULL DEFAULT '',
      deepseek_ocr_model TEXT NOT NULL DEFAULT 'deepseek-ai/deepseek-vl2',
      yandex_folder_id TEXT NOT NULL DEFAULT '',
      yandex_api_key TEXT NOT NULL DEFAULT '',
      yandex_model TEXT NOT NULL DEFAULT 'yandexgpt/latest',
      gigachat_auth_key TEXT NOT NULL DEFAULT '',
      gigachat_scope TEXT NOT NULL DEFAULT 'GIGACHAT_API_PERS',
      gigachat_model TEXT NOT NULL DEFAULT 'GigaChat-Pro',
      gemini_api_key TEXT NOT NULL DEFAULT '',
      gemini_base_url TEXT NOT NULL DEFAULT 'https://generativelanguage.googleapis.com/v1beta',
      gemini_model TEXT NOT NULL DEFAULT 'gemini-flash-latest',
      openrouter_api_key TEXT NOT NULL DEFAULT '',
      openrouter_model TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat-v3-0324',
      ru_docs_ocr_url TEXT NOT NULL DEFAULT '',
      ru_docs_ocr_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO ai_provider_settings (
      id,
      active_provider,
      fallback_provider,
      hybrid_ocr_enabled,
      deepseek_base_url,
      deepseek_model,
      deepseek_ocr_base_url,
      deepseek_ocr_model,
      yandex_model,
      gigachat_scope,
      gigachat_model,
      gemini_base_url,
      gemini_model,
      openrouter_model,
      updated_at
    ) VALUES (
      1,
      'deepseek',
      '',
      0,
      'https://api.deepseek.com/v1',
      'deepseek-chat',
      'https://api.siliconflow.com/v1',
      'deepseek-ai/deepseek-vl2',
      'yandexgpt/latest',
      'GIGACHAT_API_PERS',
      'GigaChat-Pro',
      'https://generativelanguage.googleapis.com/v1beta',
      'gemini-flash-latest',
      'deepseek/deepseek-chat-v3-0324',
      datetime('now')
    );

    UPDATE ai_provider_settings
    SET gemini_model = 'gemini-flash-latest'
    WHERE id = 1
      AND (gemini_model = 'gemini-2.0-flash' OR gemini_model = '');

    UPDATE ai_provider_settings
    SET deepseek_ocr_model = 'deepseek-ai/deepseek-vl2'
    WHERE id = 1
      AND deepseek_ocr_base_url LIKE '%siliconflow.com%'
      AND (
        deepseek_ocr_model = 'deepseek-ai/DeepSeek-OCR'
        OR deepseek_ocr_model LIKE '%DeepSeek-V4-Flash-Vision-Exp%'
      );

    UPDATE ai_provider_settings
    SET fallback_provider = ''
    WHERE id = 1 AND fallback_provider != '';

    UPDATE ai_provider_settings
    SET deepseek_api_key = 'sk-' || TRIM(deepseek_api_key)
    WHERE id = 1
      AND LENGTH(TRIM(deepseek_api_key)) = 32
      AND TRIM(deepseek_api_key) NOT LIKE 'sk-%'
      AND TRIM(deepseek_api_key) GLOB '[0-9a-fA-F]*';

    CREATE TABLE IF NOT EXISTS travel_guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      full_name_ru TEXT NOT NULL DEFAULT '',
      passport_no TEXT NOT NULL DEFAULT '',
      citizenship TEXT NOT NULL DEFAULT '',
      company_or_org TEXT NOT NULL DEFAULT 'Misafir / Dış Katılımcı',
      assigned_region TEXT NOT NULL DEFAULT '',
      assigned_project TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      linked_sicil_no TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS travel_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT NOT NULL,
      transport_type TEXT NOT NULL DEFAULT 'flight',
      person_type TEXT NOT NULL DEFAULT 'employee',
      sicil_no TEXT NOT NULL DEFAULT '',
      guest_id INTEGER,
      passenger_name TEXT NOT NULL,
      passport_no TEXT NOT NULL DEFAULT '',
      citizenship TEXT NOT NULL DEFAULT '',
      carrier TEXT NOT NULL DEFAULT '',
      flight_or_train_no TEXT NOT NULL DEFAULT '',
      booking_ref TEXT NOT NULL DEFAULT '',
      ticket_number TEXT NOT NULL DEFAULT '',
      departure_city TEXT NOT NULL DEFAULT '',
      arrival_city TEXT NOT NULL DEFAULT '',
      departure_station_or_airport TEXT NOT NULL DEFAULT '',
      arrival_station_or_airport TEXT NOT NULL DEFAULT '',
      departure_date TEXT NOT NULL DEFAULT '',
      arrival_or_return_date TEXT NOT NULL DEFAULT '',
      seat_or_wagon TEXT NOT NULL DEFAULT '',
      ticket_class TEXT NOT NULL DEFAULT 'economy',
      ticket_price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      region TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      ai_provider_used TEXT NOT NULL DEFAULT '',
      match_confidence INTEGER NOT NULL DEFAULT 0,
      source_filename TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_travel_guests_passport ON travel_guests(passport_no);
    CREATE INDEX IF NOT EXISTS idx_travel_guests_sicil ON travel_guests(linked_sicil_no);
    CREATE INDEX IF NOT EXISTS idx_travel_tickets_sicil ON travel_tickets(sicil_no);
    CREATE INDEX IF NOT EXISTS idx_travel_tickets_guest ON travel_tickets(guest_id);
    CREATE INDEX IF NOT EXISTS idx_travel_tickets_created ON travel_tickets(created_at);
  `);

  // Idempotent migration for Pondera 29-column eBA ticket archive + Airport TV reception board
  try {
    const existingCols = new Set(
      (db.prepare('PRAGMA table_info(travel_tickets)').all() as Array<{ name: string }>).map(
        (c) => c.name
      )
    );
    const addCols: Array<[string, string]> = [
      ['eba_doc_id', "TEXT NOT NULL DEFAULT ''"],
      ['passenger_name_ru', "TEXT NOT NULL DEFAULT ''"],
      ['flight_purpose', "TEXT NOT NULL DEFAULT 'Transfer'"],
      ['ticket_agent', "TEXT NOT NULL DEFAULT 'One Two Trip'"],
      ['payment_company', "TEXT NOT NULL DEFAULT 'PONDERA-INDUSTRY'"],
      ['departure_time', "TEXT NOT NULL DEFAULT ''"],
      ['arrival_date', "TEXT NOT NULL DEFAULT ''"],
      ['arrival_time', "TEXT NOT NULL DEFAULT ''"],
      ['doc_status', "TEXT NOT NULL DEFAULT 'Uploaded'"],
      ['contact_phone', "TEXT NOT NULL DEFAULT ''"],
      ['job_title', "TEXT NOT NULL DEFAULT ''"],
      ['ticket_status', "TEXT NOT NULL DEFAULT ''"],
      ['detail_reason', "TEXT NOT NULL DEFAULT '0'"],
      ['trip_type', "TEXT NOT NULL DEFAULT 'One Way'"],
      ['notes', "TEXT NOT NULL DEFAULT ''"],
      ['updated_by', "TEXT NOT NULL DEFAULT ''"],
      ['updated_at', "TEXT NOT NULL DEFAULT ''"],
      ['deduct_from_salary', "TEXT NOT NULL DEFAULT 'No'"],
      ['reception_status', "TEXT NOT NULL DEFAULT 'pending'"],
      ['reception_driver_note', "TEXT NOT NULL DEFAULT ''"],
    ];
    for (const [colName, colDef] of addCols) {
      if (!existingCols.has(colName)) {
        db.exec(`ALTER TABLE travel_tickets ADD COLUMN ${colName} ${colDef};`);
      }
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_travel_tickets_ebaid ON travel_tickets(eba_doc_id);`);

    // Ensure deduct_from_salary defaults to 'No' if blank, and split lumped 'Kazan' into site breakdown
    db.exec(`
      UPDATE travel_tickets
      SET deduct_from_salary = 'No'
      WHERE deduct_from_salary IS NULL OR TRIM(deduct_from_salary) = '';
    `);

    const kazanTickets = db
      .prepare(
        `SELECT id, region, project_name, sicil_no, departure_date, departure_time, arrival_or_return_date, arrival_date, arrival_time
         FROM travel_tickets`
      )
      .all() as Array<Record<string, any>>;
    const updTicketNorm = db.prepare(
      `UPDATE travel_tickets
       SET region = ?, departure_time = ?, arrival_date = ?, arrival_time = ?
       WHERE id = ?`
    );
    for (const kt of kazanTickets) {
      const effReg = kt.region
        ? resolveEffectiveRegion(kt.region, kt.project_name)
        : '';
      let depTime = String(kt.departure_time || '').trim();
      const depRaw = String(kt.departure_date || '').trim();
      if (!depTime && depRaw.includes(' ')) {
        const maybeTime = depRaw.split(/\s+/)[1] || '';
        if (/^\d{1,2}:\d{2}/.test(maybeTime)) depTime = maybeTime.slice(0, 5);
      }
      let arrDate = String(kt.arrival_date || '').trim();
      let arrTime = String(kt.arrival_time || '').trim();
      const arrRaw = String(kt.arrival_or_return_date || '').trim();
      if (!arrDate && arrRaw) {
        const parts = arrRaw.split(/\s+/);
        arrDate = parts[0] || '';
        if (!arrTime && parts[1] && /^\d{1,2}:\d{2}/.test(parts[1])) {
          arrTime = parts[1].slice(0, 5);
        }
      }
      if (
        effReg !== String(kt.region || '') ||
        depTime !== String(kt.departure_time || '') ||
        arrDate !== String(kt.arrival_date || '') ||
        arrTime !== String(kt.arrival_time || '')
      ) {
        updTicketNorm.run(effReg, depTime, arrDate, arrTime, kt.id);
      }
    }

    // One-time seed of Pondera's upcoming journeys from 'bilet alinan toplu liste.xlsx' (flight + train + bus)
    db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
    const seededFlag = db
      .prepare("SELECT value FROM system_info WHERE key = 'upcoming_tickets_v2826_multimodal_seeded'")
      .get() as { value?: string } | undefined;

    if (seededFlag?.value !== '1' && Array.isArray(upcomingTicketsSeed)) {
      const findExistingEba = db.prepare(
        'SELECT id FROM travel_tickets WHERE eba_doc_id = ? LIMIT 1'
      );
      const findEmp = db.prepare(
        `SELECT sicil_no, pasaport_no, gorevi, telefon_no, region, proje_adi, tam_adi_kiril
         FROM personnel
         WHERE sicil_no = ?
         ORDER BY CASE
           WHEN LOWER(COALESCE(genel_durum, '')) LIKE '%mevcut%' THEN 0
           WHEN LOWER(COALESCE(genel_durum, '')) LIKE '%bekleniyor%' OR LOWER(COALESCE(genel_durum, '')) LIKE '%sevke%' THEN 1
           ELSE 2
         END, id DESC
         LIMIT 1`
      );
      const insertSeedStmt = db.prepare(`
        INSERT INTO travel_tickets (
          ticket_code, eba_doc_id, transport_type, person_type, sicil_no, guest_id,
          passenger_name, passenger_name_ru, passport_no, citizenship,
          flight_purpose, ticket_agent, payment_company,
          carrier, flight_or_train_no, booking_ref, ticket_number,
          departure_city, arrival_city, departure_date, departure_time,
          arrival_or_return_date, arrival_date, arrival_time,
          ticket_price, currency, doc_status, contact_phone, job_title,
          region, project_name, ticket_status, detail_reason, trip_type,
          notes, updated_by, updated_at, deduct_from_salary,
          reception_status, reception_driver_note, ai_provider_used,
          match_confidence, source_filename, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, NULL,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, '', '', '',
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          'pending', '', 'eBA Arşiv (Excel)',
          100, 'bilet alinan toplu liste.xlsx', 'confirmed', ?
        )
      `);

      const nowSeed = new Date().toISOString().replace('T', ' ').slice(0, 19);
      for (const s of upcomingTicketsSeed as Array<Record<string, any>>) {
        const ebaId = String(s.eba_doc_id || '').trim();
        if (ebaId && findExistingEba.get(ebaId)) continue;

        const sicil = String(s.sicil_no || '').trim();
        const emp = sicil
          ? (findEmp.get(sicil) as Record<string, any> | undefined)
          : undefined;
        const pType = sicil ? 'employee' : 'guest';
        const rawReg = String(s.region || emp?.region || '').trim();
        const rawProj = String(s.project_name || emp?.proje_adi || '').trim();
        const effRegion = rawReg ? resolveEffectiveRegion(rawReg, rawProj) : '';
        const deduct = String(s.deduct_from_salary || '').trim() === 'Yes' ? 'Yes' : 'No';
        const tType =
          s.transport_type === 'bus'
            ? 'bus'
            : s.transport_type === 'train'
            ? 'train'
            : 'flight';
        const codePrefix = tType === 'bus' ? 'BUS' : tType === 'train' ? 'RZD' : 'EBA';
        const tCode = ebaId ? `${codePrefix}-${ebaId}` : `${codePrefix}-${Math.floor(10000 + Math.random() * 89999)}`;
        const arrCombined = [String(s.arrival_date || '').trim(), String(s.arrival_time || '').trim()]
          .filter(Boolean)
          .join(' ');

        insertSeedStmt.run(
          tCode,
          ebaId,
          tType,
          pType,
          sicil,
          String(s.passenger_name || '').trim().toUpperCase(),
          String(s.passenger_name_ru || emp?.tam_adi_kiril || '').trim(),
          String(emp?.pasaport_no || '').trim(),
          String(s.citizenship || '').trim().toUpperCase(),
          String(s.flight_purpose || 'Transfer').trim(),
          String(s.ticket_agent || 'One Two Trip').trim(),
          String(s.payment_company || 'PONDERA-INDUSTRY').trim(),
          String(s.ticket_agent || 'One Two Trip').trim(),
          String(s.departure_city || '').trim().toUpperCase(),
          String(s.arrival_city || '').trim().toUpperCase(),
          String(s.departure_date || '').trim(),
          String(s.departure_time || '').trim(),
          arrCombined,
          String(s.arrival_date || '').trim(),
          String(s.arrival_time || '').trim(),
          Number(s.ticket_price || 0) || 0,
          String(s.currency || 'RUB').trim().toUpperCase(),
          String(s.doc_status || 'Uploaded').trim(),
          String(s.contact_phone || emp?.telefon_no || '').trim(),
          String(s.job_title || emp?.gorevi || '').trim(),
          effRegion,
          rawProj,
          String(s.ticket_status || '').trim(),
          String(s.detail_reason || '0').trim(),
          String(s.trip_type || 'One Way').trim(),
          String(s.notes || '').trim(),
          String(s.updated_by || 'eBA').trim(),
          String(s.updated_at || nowSeed).trim(),
          deduct,
          nowSeed
        );
      }

      db.prepare(
        "INSERT OR REPLACE INTO system_info (key, value) VALUES ('upcoming_tickets_v2826_multimodal_seeded', '1')"
      ).run();
    }
  } catch {
    // Non-blocking if read-only fs
  }

  tablesEnsured = true;
  return db;
}

export function getAiProviderSettings(): AiProviderSettingsRow {
  const db = ensureAiTicketTables();
  const row = db.prepare('SELECT * FROM ai_provider_settings WHERE id = 1').get() as
    | AiProviderSettingsRow
    | undefined;
  return (
    row || {
      id: 1,
      active_provider: 'deepseek',
      fallback_provider: '',
      hybrid_ocr_enabled: 0,
      deepseek_api_key: process.env.DEEPSEEK_API_KEY || '',
      deepseek_base_url: 'https://api.deepseek.com/v1',
      deepseek_model: 'deepseek-chat',
      deepseek_ocr_base_url: 'https://api.siliconflow.com/v1',
      deepseek_ocr_api_key: process.env.SILICONFLOW_API_KEY || '',
      deepseek_ocr_model: 'deepseek-ai/deepseek-vl2',
      yandex_folder_id: process.env.YANDEX_FOLDER_ID || '',
      yandex_api_key: process.env.YANDEX_API_KEY || '',
      yandex_model: 'yandexgpt/latest',
      gigachat_auth_key: process.env.GIGACHAT_AUTH_KEY || '',
      gigachat_scope: 'GIGACHAT_API_PERS',
      gigachat_model: 'GigaChat-Pro',
      gemini_api_key: process.env.GEMINI_API_KEY || '',
      gemini_base_url: 'https://generativelanguage.googleapis.com/v1beta',
      gemini_model: 'gemini-flash-latest',
      openrouter_api_key: process.env.OPENROUTER_API_KEY || '',
      openrouter_model: 'deepseek/deepseek-chat-v3-0324',
      ru_docs_ocr_url: '',
      ru_docs_ocr_key: '',
      updated_at: '',
    }
  );
}

export function maskSecretKey(secret: string): string {
  const trimmed = (secret || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export function isMaskedPlaceholder(val: string | undefined | null): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return /^.{0,4}•{4,}.{0,4}$/.test(trimmed);
}

export function normalizeSecretKeyInput(
  incomingVal: string | undefined | null,
  existingVal: string,
  options?: { isOfficialDeepseek?: boolean }
): string {
  if (incomingVal === undefined || incomingVal === null) return existingVal;
  const raw = String(incomingVal).trim();
  if (isMaskedPlaceholder(raw)) return existingVal;

  let cleaned = raw;
  // If user pasted a new key into a masked input without clearing the existing masked placeholder first
  if (cleaned.includes('•')) {
    const existingMask = maskSecretKey(existingVal);
    if (existingMask && cleaned.includes(existingMask)) {
      cleaned = cleaned.replace(existingMask, '').trim();
    }
    if (cleaned.includes('•')) {
      const tokenMatch = cleaned.match(/(sk-[A-Za-z0-9_-]{16,}|AQ\.[A-Za-z0-9._-]{16,}|AIza[A-Za-z0-9_-]{16,})/);
      if (tokenMatch) {
        cleaned = tokenMatch[1];
      } else {
        const parts = cleaned
          .split(/•+/)
          .map((p) => p.trim())
          .filter(Boolean);
        cleaned = parts.sort((a, b) => b.length - a.length)[0] || '';
      }
    }
  }

  cleaned = cleaned
    .replace(/^["']+|["']+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (options?.isOfficialDeepseek && /^[0-9a-f]{32}$/i.test(cleaned)) {
    cleaned = `sk-${cleaned}`;
  }

  return cleaned;
}

export function normalizeDeepseekApiKey(rawKey: string, baseUrl?: string): string {
  const clean = (rawKey || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const isOfficial = !baseUrl || baseUrl.includes('api.deepseek.com');
  if (isOfficial && /^[0-9a-f]{32}$/i.test(clean)) {
    return `sk-${clean}`;
  }
  return clean;
}

// ---------------- CYRILLIC <-> LATIN TRANSLITERATION & PASSPORT NORMALIZATION ----------------

const CYR_TO_LAT: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E',
  Ж: 'ZH', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M',
  Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U',
  Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH',
  Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
  // CIS extra Cyrillic characters (Uzbek, Kazakh, Kyrgyz, Tajik)
  Ў: 'U', Қ: 'K', Ғ: 'G', Ҳ: 'KH', Ә: 'A', Ң: 'N', Ө: 'O',
  Ұ: 'U', Ү: 'U', Һ: 'KH', І: 'I', Ҷ: 'J', Ӣ: 'I', Ӯ: 'U',
};

const TR_CHAR_FOLD: Record<string, string> = {
  Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  ç: 'C', ğ: 'G', ı: 'I', i: 'I', ö: 'O', ş: 'S', ü: 'U',
};

export function containsCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text || '');
}

export function transliterateToLatinUpper(text: string): string {
  if (!text) return '';
  let out = '';
  const upper = text.toUpperCase();
  for (const ch of upper) {
    if (CYR_TO_LAT[ch] !== undefined) {
      out += CYR_TO_LAT[ch];
    } else if (TR_CHAR_FOLD[ch] !== undefined) {
      out += TR_CHAR_FOLD[ch];
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function normalizePhoneticName(text: string): string {
  if (!text) return '';
  let s = transliterateToLatinUpper(text);
  // Strip common Russian/CIS patronymic suffixes when comparing or normalize phonetic digraphs
  s = s
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/SHCH/g, 'S')
    .replace(/KH/g, 'H')
    .replace(/ZH/g, 'J')
    .replace(/CH/g, 'C')
    .replace(/SH/g, 'S')
    .replace(/TS/g, 'C')
    .replace(/YU/g, 'U')
    .replace(/YA/g, 'A')
    .replace(/YO/g, 'O')
    .replace(/IY\b/g, 'I')
    .replace(/YY\b/g, 'I')
    .replace(/DJ/g, 'J')
    .replace(/DZ/g, 'Z')
    .replace(/AA/g, 'A')
    .replace(/EE/g, 'E')
    .replace(/II/g, 'I')
    .replace(/OO/g, 'O')
    .replace(/UU/g, 'U')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export function cleanTicketPassportNumber(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = transliterateToLatinUpper(String(raw))
    .replace(/[\s\-№#/:.,]/g, '')
    .trim();
  // Strip airline GDS / RZD document type prefixes (ported from Powerise BulkTicketUpload)
  const prefixes = ['PSPRUS', 'PSPUZB', 'PSPTJK', 'PSPIND', 'PSPTUR', 'PSP', 'PASS', 'PASSPORT', 'DOC', 'NP', 'ZP', 'PN', 'RF'];
  for (const p of prefixes) {
    if (s.startsWith(p) && s.length >= p.length + 6) {
      s = s.slice(p.length);
      break;
    }
  }
  return s.replace(/[^A-Z0-9]/g, '');
}

export function trimAirlineLegalBoilerplate(rawText: string): string {
  if (!rawText) return '';
  // Cut repetitive multi-page Warsaw Convention / baggage rule tables that appear AFTER Total Amount
  const cutMarkers = [
    /\n\s*RECEIPT REMARKS\b/i,
    /\n\s*LEGAL AND PASSENGER NOTICES\b/i,
    /\n\s*YO['‘’]?LOVCHILARGA BILDIRISHNOMA\b/i,
    /\n\s*УВЕДОМЛЕНИЕ ПАССАЖИРАМ\b/i,
    /\n\s*CONDITIONS OF CONTRACT\b/i,
  ];
  let trimmed = rawText;
  for (const rx of cutMarkers) {
    const m = trimmed.match(rx);
    if (m && m.index !== undefined && m.index > 250) {
      trimmed = trimmed.slice(0, m.index).trim();
    }
  }
  return trimmed;
}

export function extractPassportFallbackFromText(rawText: string): string {
  if (!rawText) return '';
  const patterns: RegExp[] = [
    /\bSSR\s+DOCS\s+[A-Z0-9]{2}\s+[A-Z]{2}\d*[\/\-]+P[\/\-]+[A-Z]{2,3}[\/\-]+([A-Z0-9]{6,12})\b/i,
    /\bFOID[:\s\/-]*(?:PP|PSP|NP|PN)?[A-Z]{0,3}[\s\/-]*([A-Z]{0,2}\d{6,10})\b/i,
    /\b(?:PSPRUS|PSPUZB|PSPTJK|PSPIND|PSPTUR|PSP|NP)\s*([A-Z]{0,2}\d{6,10})\b/i,
    /(?:Passport|Pasport|Паспорт|Документ|Document\s*No|Belge\s*No|Hujjat)\s*(?:№|No|#|:|\/|-|\s){1,6}(?:ЗП|ПН|ПП|PSP|NP|RF)?[\s№:\/-]*([A-Z\u0400-\u04FF]{1,2}[\s-]?\d{6,9}|\d{2}[\s-]?\d{7,8})/i,
  ];
  for (const rx of patterns) {
    const m = rawText.match(rx);
    if (m && m[1]) {
      const cleaned = cleanTicketPassportNumber(m[1]);
      // Avoid matching 10-13 digit airline ticket numbers (e.g. 2502115507720) or phone numbers (+998...)
      if (cleaned.length >= 7 && cleaned.length <= 11 && !/^25021\d+/.test(cleaned) && !/^998\d+/.test(cleaned)) {
        return cleaned;
      }
    }
  }
  return '';
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length];
}

function tokenSimilarity(t1: string, t2: string): number {
  if (!t1 || !t2) return 0;
  if (t1 === t2) return 1;
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(t1, t2) / maxLen;
}

function computeNameMatchScore(ticketName: string, targetName: string): number {
  const n1 = normalizePhoneticName(ticketName);
  const n2 = normalizePhoneticName(targetName);
  if (!n1 || !n2) return 0;
  if (n1 === n2) return 99;

  // Strip titles like MR, MRS, MS, CHD, INF
  const cleanTokens = (str: string) =>
    str
      .split(' ')
      .filter((w) => w.length > 1 && !['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'OBA', 'OGLI', 'UGLI', 'KIZI', 'QIZI'].includes(w));

  const tok1 = cleanTokens(n1);
  const tok2 = cleanTokens(n2);
  if (tok1.length === 0 || tok2.length === 0) return 0;

  // Ticket usually has [SURNAME, GIVENNAME], while HR DB may have [GIVENNAME, SURNAME, PATRONYMIC]
  const shorter = tok1.length <= tok2.length ? tok1 : tok2;
  const longer = tok1.length <= tok2.length ? tok2 : tok1;

  const used = new Set<number>();
  let totalSim = 0;

  for (const st of shorter) {
    let bestSim = 0;
    let bestIdx = -1;
    for (let j = 0; j < longer.length; j++) {
      if (used.has(j)) continue;
      const sim = tokenSimilarity(st, longer[j]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) used.add(bestIdx);
    totalSim += bestSim;
  }

  const avgSim = totalSim / shorter.length;
  if (shorter.length === 1 && longer.length > 1) {
    return Math.round(avgSim * 74); // Single word match shouldn't auto-confirm as 90%+
  }

  // Slight penalty if extra unmatched non-patronymic words exist, but keep high if 2 core tokens match
  const score = Math.round(avgSim * 97);
  return Math.min(98, Math.max(0, score));
}

export interface MatchedPersonCandidate {
  personType: 'employee' | 'guest';
  sicilNo?: string;
  guestId?: number;
  guestCode?: string;
  fullName: string;
  fullNameRu?: string;
  passportNo: string;
  citizenship: string;
  region: string;
  projectName: string;
  department?: string;
  position?: string;
  contactPhone?: string;
  paymentCompany?: string;
  status: string;
  confidence: number;
  matchReason: string;
}

export interface PassengerMatchResult {
  matchType: 'employee' | 'existing_guest' | 'new_guest';
  confidence: number;
  matchReason: string;
  matchedPerson: MatchedPersonCandidate | null;
  candidates: MatchedPersonCandidate[];
}

type EmployeeStatusCategory = 'active' | 'incoming' | 'former' | 'other';

interface PreparedPonderaEmployee {
  id: number;
  sicil_no: string;
  rhi_id: string;
  fullLatin: string;
  tam_adi_kiril: string;
  pasaport_no: string;
  tc_kimlik_no: string;
  cleanPasp: string;
  cleanTc: string;
  uyruk: string;
  effectiveRegion: string;
  proje_adi: string;
  departman: string;
  gorevi: string;
  genel_durum: string;
  guncel_durum: string;
  telefon_no: string;
  firma: string;
  statusCategory: EmployeeStatusCategory;
  statusRank: number;
  searchHaystackUpper: string;
}

function classifyEmployeeStatus(genelDurumRaw: string): {
  category: EmployeeStatusCategory;
  rank: number;
} {
  const s = String(genelDurumRaw || '').toLowerCase();
  if (s.includes('mevcut') || s.includes('patentsiz')) {
    return { category: 'active', rank: 1 };
  }
  if (s.includes('bekleniyor') || s.includes('sevke')) {
    // Sevke Hazır = incoming expected hire; Sevki Iptal = cancelled dispatch
    if (s.includes('iptal')) {
      return { category: 'other', rank: 4 };
    }
    return { category: 'incoming', rank: 2 };
  }
  if (s.includes('cikis') || s.includes('çıkış')) {
    return { category: 'former', rank: 3 };
  }
  return { category: 'other', rank: 4 };
}

function getPreparedPonderaEmployeesIndex(): PreparedPonderaEmployee[] {
  const db = ensureAiTicketTables();
  const meta = db
    .prepare('SELECT COUNT(*) AS cnt, COALESCE(MAX(id), 0) AS maxId FROM personnel')
    .get() as { cnt: number; maxId: number } | undefined;
  const cacheKey = `${meta?.cnt || 0}:${meta?.maxId || 0}`;

  const g = globalThis as unknown as {
    __ponderaEmployeeMatchIndex?: {
      cacheKey: string;
      employees: PreparedPonderaEmployee[];
    };
  };

  if (g.__ponderaEmployeeMatchIndex && g.__ponderaEmployeeMatchIndex.cacheKey === cacheKey) {
    return g.__ponderaEmployeeMatchIndex.employees;
  }

  const rows = db
    .prepare(
      `SELECT id, sicil_no, rhi_id, ad_soyad, adi, soyadi, tam_adi_kiril, pasaport_no, tc_kimlik_no,
              uyruk, region, proje_adi, departman, gorevi, genel_durum, guncel_durum, telefon_no, firma
       FROM personnel`
    )
    .all() as Array<{
    id: number;
    sicil_no: string;
    rhi_id: string;
    ad_soyad: string;
    adi: string;
    soyadi: string;
    tam_adi_kiril: string;
    pasaport_no: string;
    tc_kimlik_no: string;
    uyruk: string;
    region: string;
    proje_adi: string;
    departman: string;
    gorevi: string;
    genel_durum: string;
    guncel_durum: string;
    telefon_no: string;
    firma: string;
  }>;

  const byKey = new Map<string, PreparedPonderaEmployee>();

  for (const r of rows) {
    const sicil = String(r.sicil_no || '').trim();
    const fullLatin = (r.ad_soyad || `${r.adi || ''} ${r.soyadi || ''}`).trim();
    const cleanPasp = cleanTicketPassportNumber(r.pasaport_no);
    const cleanTc = cleanTicketPassportNumber(r.tc_kimlik_no);
    const { category, rank } = classifyEmployeeStatus(r.genel_durum);
    const effectiveRegion = r.region ? resolveEffectiveRegion(r.region, r.proje_adi) : '';
    const rhiId = String(r.rhi_id || '').trim();
    const kiril = String(r.tam_adi_kiril || '').trim();

    const item: PreparedPonderaEmployee = {
      id: Number(r.id || 0),
      sicil_no: sicil,
      rhi_id: rhiId,
      fullLatin,
      tam_adi_kiril: kiril,
      pasaport_no: String(r.pasaport_no || '').trim(),
      tc_kimlik_no: String(r.tc_kimlik_no || '').trim(),
      cleanPasp,
      cleanTc,
      uyruk: String(r.uyruk || '').trim(),
      effectiveRegion,
      proje_adi: String(r.proje_adi || '').trim(),
      departman: String(r.departman || '').trim(),
      gorevi: String(r.gorevi || '').trim(),
      genel_durum: String(r.genel_durum || 'Mevcut').trim(),
      guncel_durum: String(r.guncel_durum || '').trim(),
      telefon_no: String(r.telefon_no || '').trim(),
      firma: String(r.firma || 'PONDERA-INDUSTRY').trim(),
      statusCategory: category,
      statusRank: rank,
      searchHaystackUpper: `${sicil} ${rhiId} ${fullLatin.toUpperCase()} ${transliterateToLatinUpper(
        kiril
      )} ${kiril.toUpperCase()} ${cleanPasp} ${cleanTc}`,
    };

    const dedupeKey = sicil || `ROW_${r.id}`;
    const existing = byKey.get(dedupeKey);
    if (!existing) {
      byKey.set(dedupeKey, item);
    } else {
      const preferNew =
        item.statusRank < existing.statusRank ||
        (item.statusRank === existing.statusRank && item.id > existing.id);
      if (preferNew) {
        if (!item.cleanPasp && existing.cleanPasp) {
          item.cleanPasp = existing.cleanPasp;
          item.pasaport_no = existing.pasaport_no;
        }
        if (!item.telefon_no && existing.telefon_no) item.telefon_no = existing.telefon_no;
        if (!item.tam_adi_kiril && existing.tam_adi_kiril) item.tam_adi_kiril = existing.tam_adi_kiril;
        byKey.set(dedupeKey, item);
      } else {
        if (!existing.cleanPasp && item.cleanPasp) {
          existing.cleanPasp = item.cleanPasp;
          existing.pasaport_no = item.pasaport_no;
        }
        if (!existing.telefon_no && item.telefon_no) existing.telefon_no = item.telefon_no;
        if (!existing.tam_adi_kiril && item.tam_adi_kiril) existing.tam_adi_kiril = item.tam_adi_kiril;
      }
    }
  }

  const employees = Array.from(byKey.values());
  g.__ponderaEmployeeMatchIndex = { cacheKey, employees };
  return employees;
}

export function searchPonderaPeople35k(query: string, limit = 30): Array<Record<string, any>> {
  const qTrim = String(query || '').trim();
  if (qTrim.length < 2) return [];

  const index = getPreparedPonderaEmployeesIndex();
  const qUpper = qTrim.toUpperCase();
  const qLat = transliterateToLatinUpper(qTrim);
  const qPasp = cleanTicketPassportNumber(qTrim);
  const tokens = qLat
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const hits: Array<{ emp: PreparedPonderaEmployee; score: number }> = [];

  for (const emp of index) {
    let score = 0;
    if (emp.sicil_no && emp.sicil_no.toUpperCase() === qUpper) {
      score = 120;
    } else if (qPasp.length >= 5 && (emp.cleanPasp === qPasp || emp.cleanTc === qPasp)) {
      score = 118;
    } else if (emp.sicil_no && emp.sicil_no.toUpperCase().includes(qUpper)) {
      score = 105;
    } else if (
      qPasp.length >= 4 &&
      ((emp.cleanPasp && emp.cleanPasp.includes(qPasp)) ||
        (emp.cleanTc && emp.cleanTc.includes(qPasp)))
    ) {
      score = 102;
    } else if (
      tokens.length > 0 &&
      tokens.every(
        (tok) =>
          emp.searchHaystackUpper.includes(tok) || emp.tam_adi_kiril.toUpperCase().includes(tok)
      )
    ) {
      score = 96;
    } else if (emp.tam_adi_kiril && emp.tam_adi_kiril.toUpperCase().includes(qUpper)) {
      score = 94;
    }

    if (score === 0 && qTrim.length >= 4) {
      const pScore = Math.max(
        computeNameMatchScore(qTrim, emp.fullLatin),
        emp.tam_adi_kiril ? computeNameMatchScore(qTrim, emp.tam_adi_kiril) : 0
      );
      if (pScore >= 72) {
        score = pScore;
      }
    }

    if (score > 0) {
      hits.push({ emp, score });
    }
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.emp.statusRank !== b.emp.statusRank) return a.emp.statusRank - b.emp.statusRank;
    return b.emp.id - a.emp.id;
  });

  return hits.slice(0, limit).map(({ emp }) => ({
    sicil_no: emp.sicil_no,
    rhi_id: emp.rhi_id,
    ad_soyad: emp.fullLatin || emp.tam_adi_kiril,
    tam_adi_kiril: emp.tam_adi_kiril,
    pasaport_no: emp.pasaport_no || emp.tc_kimlik_no,
    uyruk: emp.uyruk,
    region: emp.effectiveRegion,
    proje_adi: emp.proje_adi,
    departman: emp.departman,
    gorevi: emp.gorevi,
    genel_durum: emp.genel_durum,
    guncel_durum: emp.guncel_durum,
    telefon_no: emp.telefon_no,
    firma: emp.firma,
    status_category: emp.statusCategory,
  }));
}

export function matchPassengersAgainstPondera(
  passengers: Array<{ passengerName: string; passportNumber?: string }>
): PassengerMatchResult[] {
  const db = ensureAiTicketTables();
  const preparedEmployees = getPreparedPonderaEmployeesIndex();

  const guests = db
    .prepare(
      `SELECT id, guest_code, full_name, full_name_ru, passport_no, citizenship,
              company_or_org, assigned_region, assigned_project, phone, status, linked_sicil_no
       FROM travel_guests
       WHERE status != 'archived'`
    )
    .all() as Array<{
    id: number;
    guest_code: string;
    full_name: string;
    full_name_ru: string;
    passport_no: string;
    citizenship: string;
    company_or_org: string;
    assigned_region: string;
    assigned_project: string;
    phone: string;
    status: string;
    linked_sicil_no: string;
  }>;

  const preparedGuests = guests.map((g) => ({
    row: g,
    cleanPasp: cleanTicketPassportNumber(g.passport_no),
  }));

  return passengers.map((p) => {
    const ticketPasp = cleanTicketPassportNumber(p.passportNumber);
    const ticketName = (p.passengerName || '').trim();
    const scoredCandidates: Array<MatchedPersonCandidate & { _rank?: number }> = [];

    for (const emp of preparedEmployees) {
      let score = 0;
      let reason = '';

      const statusLabelSuffix =
        emp.statusCategory === 'incoming'
          ? ' — Beklenen Yeni Giriş'
          : emp.statusCategory === 'former'
          ? ' — Eski Sicil (Geri Dönüş)'
          : emp.statusCategory === 'other'
          ? ` — ${emp.genel_durum}`
          : '';

      if (
        ticketPasp &&
        ticketPasp.length >= 6 &&
        (emp.cleanPasp === ticketPasp || emp.cleanTc === ticketPasp)
      ) {
        score =
          emp.statusCategory === 'active' || emp.statusCategory === 'incoming'
            ? 100
            : emp.statusCategory === 'former'
            ? 99
            : 97;
        reason = `Tam Pasaport Eşleşmesi${statusLabelSuffix}`;
      } else if (
        ticketPasp &&
        ticketPasp.length >= 7 &&
        emp.cleanPasp.length >= 7 &&
        emp.cleanPasp.slice(-7) === ticketPasp.slice(-7)
      ) {
        const nameScore = Math.max(
          computeNameMatchScore(ticketName, emp.fullLatin),
          computeNameMatchScore(ticketName, emp.tam_adi_kiril)
        );
        if (nameScore >= 65) {
          score =
            emp.statusCategory === 'active' || emp.statusCategory === 'incoming'
              ? 96
              : emp.statusCategory === 'former'
              ? 95
              : 93;
          reason = `Pasaport Son 7 Hane + İsim${statusLabelSuffix}`;
        }
      }

      if (score === 0 && ticketName) {
        const latinScore = computeNameMatchScore(ticketName, emp.fullLatin);
        const cyrScore = emp.tam_adi_kiril
          ? computeNameMatchScore(ticketName, emp.tam_adi_kiril)
          : 0;
        const bestNameScore = Math.max(latinScore, cyrScore);
        if (bestNameScore >= 65) {
          // NEVER penalize incoming expected hires (Bekleniyor / Sevke Hazır) or returning former employees (Cikis) below 83%!
          if (emp.statusCategory === 'active' || emp.statusCategory === 'incoming') {
            score = bestNameScore;
          } else if (emp.statusCategory === 'former') {
            score = bestNameScore >= 84 ? bestNameScore : Math.max(65, bestNameScore - 1);
          } else {
            score = bestNameScore >= 86 ? bestNameScore - 1 : Math.max(65, bestNameScore - 2);
          }
          const baseReason =
            cyrScore > latinScore
              ? 'Kiril İsim Eşleşmesi (35K Havuz)'
              : 'İsim Eşleşmesi (35K Personel Havuzu)';
          reason = `${baseReason}${statusLabelSuffix}`;
        }
      }

      if (score >= 65) {
        scoredCandidates.push({
          personType: 'employee',
          sicilNo: emp.sicil_no,
          fullName: emp.fullLatin || emp.tam_adi_kiril,
          fullNameRu: emp.tam_adi_kiril || '',
          passportNo: emp.pasaport_no || emp.tc_kimlik_no || '',
          citizenship: emp.uyruk || '',
          region: emp.effectiveRegion,
          projectName: emp.proje_adi || '',
          department: emp.departman || '',
          position: emp.gorevi || '',
          contactPhone: emp.telefon_no || '',
          paymentCompany: emp.firma || 'PONDERA-INDUSTRY',
          status: emp.genel_durum || 'Mevcut',
          confidence: score,
          matchReason: reason,
          _rank: emp.statusRank,
        });
      }
    }

    for (const gst of preparedGuests) {
      let score = 0;
      let reason = '';
      if (ticketPasp && ticketPasp.length >= 6 && gst.cleanPasp === ticketPasp) {
        score = 95;
        reason = 'Kayıtlı Misafir Pasaport Eşleşmesi';
      } else if (ticketName) {
        const gLatin = computeNameMatchScore(ticketName, gst.row.full_name);
        const gCyr = gst.row.full_name_ru ? computeNameMatchScore(ticketName, gst.row.full_name_ru) : 0;
        const best = Math.max(gLatin, gCyr);
        if (best >= 70) {
          score = Math.max(70, best - 2);
          reason = 'Kayıtlı Misafir İsim Eşleşmesi';
        }
      }

      if (score >= 70) {
        scoredCandidates.push({
          personType: 'guest',
          guestId: gst.row.id,
          guestCode: gst.row.guest_code,
          sicilNo: gst.row.linked_sicil_no || undefined,
          fullName: gst.row.full_name,
          fullNameRu: gst.row.full_name_ru || '',
          passportNo: gst.row.passport_no || '',
          citizenship: gst.row.citizenship || '',
          region: gst.row.assigned_region
            ? resolveEffectiveRegion(gst.row.assigned_region, gst.row.assigned_project)
            : '',
          projectName: gst.row.assigned_project || '',
          department: gst.row.company_or_org || 'Misafir (Guest)',
          position: 'Misafir Yolcu',
          contactPhone: gst.row.phone || '',
          paymentCompany: 'PONDERA-INDUSTRY',
          status: 'Guest',
          confidence: score,
          matchReason: reason,
          _rank: 9,
        });
      }
    }

    scoredCandidates.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (a._rank || 9) - (b._rank || 9);
    });
    const topCandidates = scoredCandidates.slice(0, 8).map(({ _rank: _unused, ...rest }) => rest);
    const best = topCandidates[0] || null;

    if (best && best.confidence >= 83) {
      return {
        matchType: best.personType === 'employee' ? 'employee' : 'existing_guest',
        confidence: best.confidence,
        matchReason: best.matchReason,
        matchedPerson: best,
        candidates: topCandidates,
      };
    }

    return {
      matchType: 'new_guest',
      confidence: best ? best.confidence : 0,
      matchReason: best
        ? `Düşük benzerlik (%${best.confidence}) — Misafir (Guest) olarak işaretlendi`
        : '35K Personel listesinde bulunamadı — Yeni Misafir (Guest) kaydı açılacak',
      matchedPerson: null,
      candidates: topCandidates,
    };
  });
}

// ---------------- HUMAN-LIKE SEMANTIC TICKET & ITINERARY EXTRACTION PROMPT ----------------

export const HUMAN_TICKET_SYSTEM_PROMPT = `You are a senior multilingual travel document analyst fluent in Russian, Turkish, Uzbek, and English.
Read and understand the ticket document accurately and concisely:
- Distinguish actual PASSENGER NAMES and PASSPORT/DOCUMENT NUMBERS from agency headers, company names (ООО ПОНДЕРА / PONDERA / POWERISE), and baggage/fare rules.
- Recognize AIRLINE E-TICKETS ("flight": Uzbekistan Airways, Aeroflot, Turkish Airlines, S7, Utair, Pobeda, Air India, Ural Airlines, Azimuth, Pegasus, SomonAir, Charter manifests), RUSSIAN RAILWAYS ("train": РЖД / RZD / Сапсан / Ласточка / поезд electronic tickets), AND INTERCITY BUS TICKETS ("bus": автобусный билет, автовокзал, Яндекс Автобусы, Tutu Автобусы, Obilet, FlixBus, charter bus manifests).
- MULTI-SEGMENT / ROUND-TRIP RULE: If ONE passenger has multiple connecting or return segments on the same ticket (e.g. HY279 Urgench->Istanbul, HY274 Istanbul->Tashkent), output ONLY ONE entry for that person in "passengers"! Combine flight/train/bus numbers with " / " in "flightOrTrainNumber" (e.g. "HY279 / HY274"), put initial origin in "departureCity", primary destination in "arrivalCity", first segment departure in "departureDate", and final return/arrival date in "returnOrArrivalDate".
- MULTIPLE DISTINCT PEOPLE: Only add multiple objects in "passengers" when multiple DIFFERENT human passengers are listed on a group booking.
- PASSPORT NUMBER RULE: Extract passport/document number if printed (cleaning GDS prefixes like "PSPFA4210519" -> "FA4210519", "FOID PP..." -> "..."). If NO passport/ID number is printed on the ticket, set "passportNumber": "". Never put ticket numbers or PNR into "passportNumber".
- Keep passengerName in clean UPPERCASE Latin without titles (strip MR, MRS, MS, ADT, CHD, INF — e.g. "Ruzmetov Nematjon Mr (ADT)" -> "RUZMETOV NEMATJON"). If strictly Cyrillic, put Cyrillic in passengerNameCyrillic and GOST Latin in passengerName.
- Use Total Amount for "totalPrice" and "pricePerPassenger" (with its exact 3-letter currency code: RUB, UZS, USD, EUR, TRY).

Return ONLY a single valid JSON object (no markdown fences, no comments, no extra keys) matching this exact schema:
{
  "transportType": "flight" | "train" | "bus",
  "passengers": [
    {
      "passengerName": "SURNAME GIVENNAME",
      "passengerNameCyrillic": "",
      "passportNumber": "",
      "ticketNumber": "250 2115507720",
      "seatOrWagon": "",
      "citizenship": ""
    }
  ],
  "bookingReference": "XIGH54",
  "carrier": "Uzbekistan Airways",
  "flightOrTrainNumber": "HY279",
  "departureCity": "Urgench",
  "arrivalCity": "Istanbul",
  "departureAirportOrStation": "UGC",
  "arrivalAirportOrStation": "IST",
  "departureDate": "17.10.2025 09:25",
  "returnOrArrivalDate": "17.10.2025 11:45",
  "tripType": "One Way",
  "ticketClass": "economy",
  "totalPrice": 27408,
  "pricePerPassenger": 27408,
  "currency": "RUB"
}`;

// ---------------- CUSTOM HTTPS REQUEST WITH RUSSIAN TRUSTED CA (FOR GIGACHAT) ----------------

const gigaChatHttpsAgent = new https.Agent({
  ca: [...tls.rootCertificates, RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA],
  keepAlive: false,
});

function httpsRequestWithAgent(
  urlStr: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: Buffer | string;
    agent?: https.Agent;
    timeoutMs?: number;
  }
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const bodyBuf =
      options.body === undefined
        ? undefined
        : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body, 'utf-8');

    const headers: Record<string, string> = { ...options.headers };
    if (bodyBuf && !headers['Content-Length'] && !headers['content-length']) {
      headers['Content-Length'] = String(bodyBuf.length);
    }

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers,
        agent: options.agent,
        timeout: options.timeoutMs || 45000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            text: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('İstek zaman aşımına uğradı (Timeout)'));
    });
    req.on('error', (err) => reject(err));

    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ---------------- INDIVIDUAL PROVIDER CALLERS ----------------

async function runYandexVisionOcr(
  base64Data: string,
  mimeType: string,
  folderId: string,
  apiKey: string
): Promise<string> {
  let cleanMime = 'JPEG';
  if (mimeType.includes('png')) cleanMime = 'PNG';
  else if (mimeType.includes('pdf')) cleanMime = 'PDF';

  const resp = await fetch('https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText', {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey.trim()}`,
      'x-folder-id': folderId.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mimeType: cleanMime,
      languageCodes: ['ru', 'en'],
      model: cleanMime === 'PDF' ? 'page' : 'table',
      content: base64Data,
    }),
  });

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`Yandex Vision OCR hatası (${resp.status}): ${errTxt.slice(0, 220)}`);
  }

  const data = await resp.json();
  let ocrText = data?.result?.textAnnotation?.fullText || '';
  if (!ocrText) {
    for (const block of data?.result?.textAnnotation?.blocks || []) {
      for (const line of block?.lines || []) {
        const words = (line?.words || []).map((w: { text?: string }) => w.text || '').join(' ');
        if (words) ocrText += words + '\n';
      }
    }
  }
  return ocrText.trim();
}

async function runRussianDocsOcr(
  base64Data: string,
  mimeType: string,
  serverUrl: string,
  apiKey: string
): Promise<string> {
  const base = serverUrl.trim().replace(/\/+$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

  const resp = await fetch(`${base}/ocr`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image_base64: base64Data, mime_type: mimeType }),
  });

  if (!resp.ok) {
    throw new Error(`RussianDocsOCR sunucu hatası (${resp.status})`);
  }
  const json = await resp.json();
  return String(json?.text || json?.full_text || json?.markdown || JSON.stringify(json));
}

// Valid 64x64 24-bit RGB white PNG used for real /chat/completions verification on Vision/OCR models
// (64x64 satisfies Qwen2-VL/Qwen2.5-VL patch factor>=28 and DeepSeek-VL2 / OCR image decoders)
const TEST_PNG_64X64_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR4nO3PMQ0AMAzAsPInvYLYYVWKESTzjhsd8KsBrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BbQHKU9LC7/CP1AAAAABJRU5ErkJggg==';

const endpointModelsCache = new Map<string, { expiresAt: number; models: string[] }>();

async function fetchOpenAiEndpointModels(
  baseUrl: string,
  apiKey: string
): Promise<{ models: string[]; httpError?: string }> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const cleanKey = apiKey.trim();
  const cacheKey = `${cleanBase}|${cleanKey.slice(-8)}`;
  const cached = endpointModelsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { models: cached.models };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`${cleanBase}/models`, {
      headers: { Authorization: `Bearer ${cleanKey}` },
      signal: controller.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { models: [], httpError: `HTTP ${resp.status}: ${txt.slice(0, 180)}` };
    }
    const json = await resp.json();
    const list: string[] = Array.isArray(json?.data)
      ? json.data
          .map((item: any) => String(item?.id || '').trim())
          .filter((id: string) => id.length > 0)
      : [];
    if (list.length > 0) {
      endpointModelsCache.set(cacheKey, {
        expiresAt: Date.now() + 5 * 60 * 1000,
        models: list,
      });
    }
    return { models: list };
  } catch (err: any) {
    return { models: [], httpError: String(err?.message || 'Model listesi alınamadı.') };
  } finally {
    clearTimeout(timer);
  }
}

function humanizeProviderApiError(err: any, providerTitle: string): Error {
  const msg = String(err?.message || 'Bilinmeyen AI hatası.');
  if (/prepayment credits are depleted|billing#prepay/i.test(msg)) {
    return new Error(
      'Google AI Studio Ön Ödeme (Prepay) Bakiyesi Sıfır (HTTP 402): Bu anahtarın bağlı olduğu proje daha önce ücretli Prepay katmanına alındığı için ücretsiz katmana düşmüyor. Ücretsiz kullanmak için https://aistudio.google.com/apikey sayfasında "Create API key" -> "Create API key in new project" (Yeni projede — Billing bağlamadan) seçerek yeni anahtar alın veya https://ai.studio/projects üzerinden mevcut projenin Billing bağlantısını kaldırıp Free katmana düşürün.'
    );
  }
  if (
    msg.includes('401') ||
    /Authentication Fails|authentication_error|invalid_api_key/i.test(msg)
  ) {
    if (/deepseek/i.test(providerTitle)) {
      return new Error(
        `DeepSeek API Anahtarı Geçersiz (HTTP 401): Girilen anahtar "sk-" ile başlamıyor, eksik kopyalanmış veya iptal edilmiş. Lütfen https://platform.deepseek.com/api_keys sayfasından "Create new API key" ile yeni bir "sk-..." anahtarı oluşturup kopyalama ikonuyla kopyalayın, kutuya yapıştırıp "Kaydet & Test Et" butonuna basın.`
      );
    }
    return new Error(
      `${providerTitle} API Anahtarı Geçersiz (HTTP 401): Lütfen anahtarın tam kopyalandığını kontrol edip kaydedin. (${msg.slice(0, 160)})`
    );
  }
  if (
    msg.includes('402') ||
    msg.includes('30001') ||
    /insufficient[_\s]balance/i.test(msg) ||
    /balance is insufficient/i.test(msg)
  ) {
    return new Error(
      `Bakiye Yetersiz (API 402): Seçtiğiniz ${providerTitle} hesabındaki başlangıç kredisi / bakiye bitti. Sağlayıcı panelinden bakiye yükleyebilir (1$ ≈ 400+ bilet) veya Oku butonunun yanından anahtarı hazır başka bir AI seçebilirsiniz.`
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

// Official Native Google Gemini REST caller (/v1beta/models/{model}:generateContent with X-goog-api-key)
// Supports both AQ.... auth keys and AIza... keys, plus native inline_data for images and PDFs
async function callGeminiNativeGenerateContent(params: {
  apiKey: string;
  preferredModel: string;
  systemPrompt?: string;
  userInstruction: string;
  imagesDataUrls: string[];
  rawPdfBase64?: string;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const requested = (params.preferredModel || 'gemini-flash-latest')
    .trim()
    .replace(/^models\//, '');
  const normalizedPrimary =
    requested === 'gemini-2.0-flash' || !requested ? 'gemini-flash-latest' : requested;

  const candidateModels: string[] = [];
  for (const m of [
    normalizedPrimary,
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ]) {
    if (m && !candidateModels.includes(m)) candidateModels.push(m);
  }

  const parts: Array<Record<string, unknown>> = [];
  if (params.imagesDataUrls.length > 0) {
    for (const dataUrl of params.imagesDataUrls.slice(0, 2)) {
      const { mimeType, base64 } = splitDataUrl(dataUrl);
      if (base64) {
        parts.push({
          inline_data: {
            mime_type: mimeType || 'image/jpeg',
            data: base64,
          },
        });
      }
    }
  } else if (params.rawPdfBase64) {
    parts.push({
      inline_data: {
        mime_type: 'application/pdf',
        data: params.rawPdfBase64,
      },
    });
  }

  const combinedText = params.systemPrompt
    ? `${params.systemPrompt}\n\n${params.userInstruction}`
    : params.userInstruction;
  parts.push({ text: combinedText });

  const payload: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.05,
      maxOutputTokens: params.maxTokens ?? 2800,
      ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let lastErr: any = null;
  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelName
    )}:generateContent`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': params.apiKey.trim(),
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      lastErr = new Error(`Gemini API ${resp.status} (${modelName}): ${errTxt.slice(0, 340)}`);
      // Retry next model ONLY if model ID was retired/not found (404); stop immediately on 401/402/403/429
      if (resp.status === 404) {
        continue;
      }
      throw lastErr;
    }

    const json = await resp.json();
    const outParts = json?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(outParts)
      ? outParts.map((p: any) => String(p?.text || '')).join('\n').trim()
      : '';
    return { text, modelUsed: modelName };
  }

  throw lastErr || new Error('Google Gemini yanıt döndürmedi.');
}

function resolveEndpointModels(configuredModel: string, availableModels: string[]): {
  exactConfiguredMatch: string | null;
  visionModels: string[];
  textModels: string[];
  freeTextModels: string[];
} {
  const trimmedCfg = (configuredModel || '').trim();
  if (availableModels.length === 0) {
    const fallbackV = trimmedCfg || 'deepseek-ai/deepseek-vl2';
    return {
      exactConfiguredMatch: trimmedCfg || null,
      visionModels: [fallbackV],
      textModels: ['Qwen/Qwen3-8B', 'Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V3', fallbackV],
      freeTextModels: ['Qwen/Qwen3-8B', 'Qwen/Qwen2.5-7B-Instruct', 'THUDM/GLM-4-9B-0414'],
    };
  }

  const exactConfiguredMatch =
    availableModels.find((m) => m === trimmedCfg) ||
    availableModels.find((m) => m.toLowerCase() === trimmedCfg.toLowerCase()) ||
    null;

  const isNonChatAsset = (id: string) =>
    /(embed|bge-|rerank|whisper|sensevoice|cosyvoice|fish-speech|flux|stable-diffusion|kolors|wan2|hunyuanvideo|cogvideo|speech|tts|asr)/i.test(
      id
    );

  // Order vision models from most economical / free-friendly (vl2, 8B, 9B, 7B) to larger paid models
  const visionPriorityRegexes: RegExp[] = [
    /deepseek.*ocr/i,
    /^deepseek-ai\/deepseek-vl2$/i,
    /^Qwen\/Qwen3-VL-8B-Instruct$/i,
    /^THUDM\/GLM-4\.1V-9B-Thinking$/i,
    /^Qwen\/Qwen2\.5-VL-7B-Instruct$/i,
    /^Pro\/Qwen\/Qwen2\.5-VL-7B-Instruct$/i,
    /qwen.*(vl).*(7b|8b)/i,
    /glm-4.*v.*9b/i,
    /^Qwen\/Qwen3-VL-30B-A3B-Instruct$/i,
    /^Qwen\/Qwen3-VL-32B-Instruct$/i,
    /^Qwen\/Qwen2\.5-VL-32B-Instruct$/i,
    /^Qwen\/Qwen2\.5-VL-72B-Instruct$/i,
    /deepseek.*(vl2|vl|vision)/i,
    /qwen.*(vl|vision|ocr).*instruct/i,
    /(got-ocr|olmocr|dots\.ocr|paddleocr|ocr)/i,
    /(glm-4.*v|pixtral|internvl|gemma-3.*it|llama.*vision)/i,
  ];

  const visionModels: string[] = [];
  const pushVision = (id: string | null | undefined) => {
    if (!id || isNonChatAsset(id)) return;
    if (!visionModels.includes(id)) visionModels.push(id);
  };

  if (exactConfiguredMatch) {
    pushVision(exactConfiguredMatch);
  }
  for (const rx of visionPriorityRegexes) {
    for (const m of availableModels) {
      if (rx.test(m)) pushVision(m);
    }
  }

  const isLikelyVisionOnly = (id: string) =>
    /(vl2|-vl-|_vl_|vision|ocr|pixtral|internvl)/i.test(id);

  // SiliconFlow $0.00 / M permanent FREE text models (7B/8B/9B)
  const freeTextRegexes: RegExp[] = [
    /^Qwen\/Qwen3-8B$/i,
    /^Qwen\/Qwen2\.5-7B-Instruct$/i,
    /^THUDM\/GLM-4-9B-0414$/i,
    /^THUDM\/glm-4-9b-chat$/i,
    /^deepseek-ai\/DeepSeek-R1-0528-Qwen3-8B$/i,
    /^deepseek-ai\/DeepSeek-R1-Distill-Qwen-7B$/i,
    /^Qwen\/Qwen2-7B-Instruct$/i,
    /^internlm\/internlm2_5-7b-chat$/i,
  ];

  const freeTextModels: string[] = [];
  for (const rx of freeTextRegexes) {
    for (const m of availableModels) {
      if (rx.test(m) && !isNonChatAsset(m) && !isLikelyVisionOnly(m) && !freeTextModels.includes(m)) {
        freeTextModels.push(m);
      }
    }
  }

  const textModels: string[] = [];
  const pushText = (id: string | null | undefined) => {
    if (!id || isNonChatAsset(id) || isLikelyVisionOnly(id)) return;
    if (!textModels.includes(id)) textModels.push(id);
  };

  // Put at most ONE paid DeepSeek-V3 variant first, followed IMMEDIATELY by all $0 FREE models!
  const v3Exact = availableModels.find((m) => /^deepseek-ai\/DeepSeek-V3$/i.test(m));
  if (v3Exact) pushText(v3Exact);
  for (const fm of freeTextModels) pushText(fm);

  const secondaryTextRegexes: RegExp[] = [
    /^Qwen\/Qwen2\.5-32B-Instruct$/i,
    /^Qwen\/Qwen2\.5-72B-Instruct$/i,
    /instruct$/i,
  ];
  for (const rx of secondaryTextRegexes) {
    for (const m of availableModels) {
      if (rx.test(m)) pushText(m);
    }
  }

  return {
    exactConfiguredMatch,
    visionModels,
    textModels,
    freeTextModels,
  };
}

async function callOpenAiCompatibleVisionOrText(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userInstruction: string;
  imagesDataUrls: string[];
  extraHeaders?: Record<string, string>;
  omitSystemMessage?: boolean;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const endpoint = `${params.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey.trim()}`,
    'Content-Type': 'application/json',
    ...(params.extraHeaders || {}),
  };

  // Place image_url blocks BEFORE text block (required by DeepSeek-OCR / vLLM templates and supported by all OpenAI vision APIs)
  const userContent: Array<Record<string, unknown>> = [];
  for (const dataUrl of params.imagesDataUrls) {
    if (dataUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }
  }
  userContent.push({ type: 'text', text: params.userInstruction });

  const messages: Array<Record<string, unknown>> = [];
  if (!params.omitSystemMessage && params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  messages.push({
    role: 'user',
    content: params.imagesDataUrls.length > 0 ? userContent : params.userInstruction,
  });

  const isShort4kContextModel = /deepseek-vl/i.test(params.model);
  const safeMaxTokens =
    params.maxTokens ?? (isShort4kContextModel ? 1100 : 2200);

  const isOfficialDeepseekNonReasoner =
    params.baseUrl.includes('api.deepseek.com') &&
    !/reasoner/i.test(params.model);

  const corePayload: Record<string, unknown> = {
    model: params.model.trim(),
    messages,
    temperature: 0.0,
    max_tokens: safeMaxTokens,
  };

  // Official DeepSeek V4 / V4.1 (deepseek-flash, deepseek-v4-pro) enables chain-of-thought thinking by default!
  // Disabling thinking cuts latency from ~16s down to ~1.5s and prevents reasoning_content from exhausting max_tokens.
  const payloadVariants: Array<Record<string, unknown>> = [];
  if (isOfficialDeepseekNonReasoner && params.jsonMode) {
    payloadVariants.push({
      ...corePayload,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
    });
  }
  if (isOfficialDeepseekNonReasoner) {
    payloadVariants.push({
      ...corePayload,
      thinking: { type: 'disabled' },
    });
  }
  if (params.jsonMode) {
    payloadVariants.push({
      ...corePayload,
      response_format: { type: 'json_object' },
    });
  }
  payloadVariants.push(corePayload);

  let lastHttpErr = '';
  for (let i = 0; i < payloadVariants.length; i++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payloadVariants[i]),
    });

    if (resp.ok) {
      const json = await resp.json();
      const msgObj = json?.choices?.[0]?.message;
      const contentStr = String(msgObj?.content || '').trim();
      if (contentStr) return contentStr;
      // Fallback if reasoning model placed output in reasoning_content
      const reasoningStr = String(msgObj?.reasoning_content || '').trim();
      return reasoningStr;
    }

    const errText = await resp.text();
    lastHttpErr = `API ${resp.status}: ${errText.slice(0, 280)}`;
    // Only fall back to next payload variant on HTTP 400 parameter incompatibility
    if (resp.status !== 400) {
      throw new Error(lastHttpErr);
    }
  }

  throw new Error(lastHttpErr || 'API isteği başarısız oldu.');
}

async function callGigaChatVisionOrText(params: {
  authKey: string;
  scope: string;
  model: string;
  fullPrompt: string;
  base64Data?: string;
  mimeType?: string;
}): Promise<string> {
  const tokenRes = await httpsRequestWithAgent(
    'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${params.authKey.trim()}`,
        RqUID: crypto.randomUUID(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: `scope=${encodeURIComponent(params.scope || 'GIGACHAT_API_PERS')}`,
      agent: gigaChatHttpsAgent,
    }
  );

  if (tokenRes.status < 200 || tokenRes.status >= 300) {
    throw new Error(`GigaChat OAuth (${tokenRes.status}): ${tokenRes.text.slice(0, 220)}`);
  }
  const tokenJson = JSON.parse(tokenRes.text);
  const accessToken = tokenJson?.access_token;
  if (!accessToken) {
    throw new Error('GigaChat OAuth yanıtında access_token bulunamadı.');
  }

  const attachments: string[] = [];
  if (params.base64Data && params.mimeType && !params.mimeType.includes('pdf')) {
    const boundary = `----PonderaGigaBoundary${crypto.randomBytes(8).toString('hex')}`;
    const ext = params.mimeType.includes('png') ? 'png' : 'jpg';
    const imgBuf = Buffer.from(params.base64Data, 'base64');

    const pre = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="ticket.${ext}"\r\n` +
        `Content-Type: ${params.mimeType}\r\n\r\n`,
      'utf-8'
    );
    const mid = Buffer.from(
      `\r\n--${boundary}\r\n` +
        `Content-Disposition: form-data; name="purpose"\r\n\r\n` +
        `general\r\n` +
        `--${boundary}--\r\n`,
      'utf-8'
    );
    const multipartBody = Buffer.concat([pre, imgBuf, mid]);

    const uploadRes = await httpsRequestWithAgent(
      'https://gigachat.devices.sberbank.ru/api/v1/files',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
        agent: gigaChatHttpsAgent,
      }
    );

    if (uploadRes.status >= 200 && uploadRes.status < 300) {
      const upJson = JSON.parse(uploadRes.text);
      if (upJson?.id) attachments.push(upJson.id);
    }
  }

  const chatRes = await httpsRequestWithAgent(
    'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model || 'GigaChat-Pro',
        messages: [
          {
            role: 'user',
            content: params.fullPrompt,
            ...(attachments.length > 0 ? { attachments } : {}),
          },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      }),
      agent: gigaChatHttpsAgent,
    }
  );

  if (chatRes.status < 200 || chatRes.status >= 300) {
    throw new Error(`GigaChat Chat (${chatRes.status}): ${chatRes.text.slice(0, 220)}`);
  }

  const chatJson = JSON.parse(chatRes.text);
  return String(chatJson?.choices?.[0]?.message?.content || '');
}

async function callYandexGptText(params: {
  folderId: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userText: string;
}): Promise<string> {
  const modelName = (params.model || 'yandexgpt/latest').replace(/^gpt:\/\/[^/]+\//, '');
  const resp = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${params.apiKey.trim()}`,
      'x-folder-id': params.folderId.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      modelUri: `gpt://${params.folderId.trim()}/${modelName}`,
      completionOptions: {
        stream: false,
        temperature: 0.1,
        maxTokens: 2800,
      },
      messages: [
        { role: 'system', text: params.systemPrompt },
        { role: 'user', text: params.userText },
      ],
    }),
  });

  if (!resp.ok) {
    const errTxt = await resp.text();
    throw new Error(`YandexGPT (${resp.status}): ${errTxt.slice(0, 240)}`);
  }

  const data = await resp.json();
  return String(data?.result?.alternatives?.[0]?.message?.text || '');
}

export interface TicketParseInput {
  fileName: string;
  mimeType: string;
  primaryImageDataUrl?: string; // data:image/jpeg;base64,... (from image upload OR client PDF canvas render)
  extraPageDataUrls?: string[]; // optional page 2 image for multi-page itinerary
  rawFileBase64?: string; // bare base64 if PDF could not be rendered client-side
  extractedPdfText?: string; // layout-preserved PDF text extracted on client
  providerOverride?: AiProviderId;
}

function repairLlmJsonString(input: string): string {
  // 1) Normalize smart quotes outside or inside JSON delimiters & sanitize raw newlines inside string literals
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n' || ch === '\r' || ch === '\t') {
        out += ' ';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
        out += ch;
      } else {
        out += ch;
      }
    }
  }

  // 2) Remove trailing commas before closing } or ]
  out = out.replace(/,\s*([}\]])/g, '$1');

  // 3) Insert missing commas between adjacent objects/arrays/properties (fixes "Expected ',' or ']' after array element")
  out = out.replace(/\}\s*\{/g, '},{');
  out = out.replace(/\]\s*\[/g, '],[');
  out = out.replace(/(["\d]|true|false|null|\}|\])\s*\n\s*"/g, '$1,\n"');
  out = out.replace(/(["\d]|true|false|null)\s+\{/g, '$1,{');

  return out;
}

function extractBalancedJsonObject(str: string): string | null {
  const start = str.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
    } else {
      if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return str.slice(start, i + 1);
        }
      }
    }
  }
  const lastBrace = str.lastIndexOf('}');
  return lastBrace > start ? str.slice(start, lastBrace + 1) : null;
}

export function extractJsonFromModelOutput(rawContent: string): Record<string, any> {
  const trimmed = (rawContent || '').trim();
  if (!trimmed) throw new Error('Yapay zeka boş yanıt döndürdü.');

  // Strip DeepSeek <think>...</think> reasoning block if present
  const withoutThink = trimmed
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^<think>[\s\S]*$/gi, '')
    .trim();

  const fenceMatch =
    withoutThink.match(/```json\s*([\s\S]*?)```/i) ||
    withoutThink.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : withoutThink;

  const attempts = [
    candidate,
    extractBalancedJsonObject(candidate) || '',
    repairLlmJsonString(extractBalancedJsonObject(candidate) || candidate),
  ].filter(Boolean);

  let lastParseErr: any = null;
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {
      lastParseErr = e;
    }
  }

  throw new Error(
    `Yapay zeka yanıtı JSON formatına dönüştürülemedi (${String(lastParseErr?.message || 'parse error')}).`
  );
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (m) return { mimeType: m[1], base64: m[2] };
  return { mimeType: 'image/jpeg', base64: dataUrl };
}

async function executeSingleProviderTicketParse(
  provider: AiProviderId,
  input: TicketParseInput,
  settings: AiProviderSettingsRow
): Promise<{ parsed: Record<string, any>; providerLabel: string }> {
  const images: string[] = [];
  if (input.primaryImageDataUrl) images.push(input.primaryImageDataUrl);
  if (input.extraPageDataUrls?.length) {
    for (const p of input.extraPageDataUrls.slice(0, 2)) {
      if (p) images.push(p);
    }
  }

  const pdfTextContext = trimAirlineLegalBoilerplate((input.extractedPdfText || '').trim());
  const nonWsTextLen = pdfTextContext.replace(/\s+/g, '').length;
  const hasRichDigitalPdfText = nonWsTextLen >= 100;

  const baseUserInstruction = pdfTextContext
    ? `Extract structured ticket JSON from "${input.fileName}":\n\n${pdfTextContext.slice(0, 7500)}`
    : `Extract structured ticket JSON from this scan ("${input.fileName}").`;

  if (provider === 'deepseek') {
    const baseUrl = settings.deepseek_base_url.trim() || 'https://api.deepseek.com/v1';
    const apiKey = normalizeDeepseekApiKey(settings.deepseek_api_key, baseUrl);
    if (!apiKey) {
      throw new Error(
        'DeepSeek API anahtarı henüz girilmemiş. Ayarlar > 4. Yapay Zeka (AI) & Evrak Okuma sekmesinden DeepSeek API Key ekleyin.'
      );
    }
    const configuredModel = settings.deepseek_model.trim() || 'deepseek-flash';
    const isOfficialDeepseek = baseUrl.includes('api.deepseek.com');

    // Check cached /models on DeepSeek endpoint (cached 5 mins — 0 ms overhead after first call)
    const { models: dsModels } = await fetchOpenAiEndpointModels(baseUrl, apiKey);
    const exactCatalogMatch = dsModels.find(
      (m) => m.toLowerCase() === configuredModel.toLowerCase()
    );
    const flashCatalogMatch = /flash/i.test(configuredModel)
      ? dsModels.find((m) => /flash/i.test(m))
      : undefined;
    const effectiveModel =
      exactCatalogMatch ||
      flashCatalogMatch ||
      dsModels[0] ||
      configuredModel;

    // FAST PATH (~2s): Digital PDFs already have crisp layout text — skip sending 1.5MB vision images!
    if (hasRichDigitalPdfText) {
      const textModel =
        effectiveModel === 'deepseek-reasoner'
          ? 'deepseek-reasoner'
          : dsModels.length === 0 || dsModels.includes(effectiveModel)
          ? effectiveModel
          : dsModels[0] || 'deepseek-chat';
      const rawFast = await callOpenAiCompatibleVisionOrText({
        baseUrl,
        apiKey,
        model: textModel,
        systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
        userInstruction: baseUserInstruction,
        imagesDataUrls: [],
        jsonMode: true,
        maxTokens: 2000,
      });
      return {
        parsed: extractJsonFromModelOutput(rawFast),
        providerLabel: `DeepSeek AI (${textModel})`,
      };
    }

    // VISUAL SCAN PATH: Camera photo, WhatsApp image, or scanned image-only PDF (<100 chars digital text)
    const looksMultimodalModel =
      /flash|vl|vision|ocr|v4/i.test(effectiveModel) ||
      (!isOfficialDeepseek &&
        effectiveModel !== 'deepseek-chat' &&
        effectiveModel !== 'deepseek-reasoner');

    if (images.length > 0 && (looksMultimodalModel || !hasRichDigitalPdfText)) {
      try {
        const rawVision = await callOpenAiCompatibleVisionOrText({
          baseUrl,
          apiKey,
          model: effectiveModel,
          systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
          userInstruction: baseUserInstruction,
          imagesDataUrls: images.slice(0, 2),
          jsonMode: true,
          maxTokens: 1200,
        });
        return {
          parsed: extractJsonFromModelOutput(rawVision),
          providerLabel: `DeepSeek AI Vision (${effectiveModel})`,
        };
      } catch (visionErr: any) {
        const vMsg = String(visionErr?.message || '');
        if (vMsg.includes('API 401') || vMsg.includes('API 402') || vMsg.includes('API 429')) {
          throw visionErr;
        }
        if (nonWsTextLen < 20) {
          throw visionErr;
        }
      }
    }

    if (nonWsTextLen < 20) {
      throw new Error(
        'Bu dosya metin katmanı olmayan taranmış bir görüntü (Scan). Seçili model görsel kabul etmedi.'
      );
    }

    const raw = await callOpenAiCompatibleVisionOrText({
      baseUrl,
      apiKey,
      model: effectiveModel,
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userInstruction: baseUserInstruction,
      imagesDataUrls: [],
      jsonMode: true,
      maxTokens: 1100,
    });

    return {
      parsed: extractJsonFromModelOutput(raw),
      providerLabel: `DeepSeek AI (${effectiveModel})`,
    };
  }

  if (provider === 'deepseek_ocr') {
    const apiKey = settings.deepseek_ocr_api_key.trim();
    if (!apiKey) {
      throw new Error(
        'DeepSeek-OCR / VL2 (SiliconFlow / vLLM) API anahtarı girilmemiş. Ayarlar > AI sekmesinden tanımlayın.'
      );
    }
    const baseUrl = settings.deepseek_ocr_base_url.trim() || 'https://api.siliconflow.com/v1';
    const configuredModel = settings.deepseek_ocr_model.trim() || 'deepseek-ai/deepseek-vl2';

    const { models: availableModels, httpError } = await fetchOpenAiEndpointModels(
      baseUrl,
      apiKey
    );
    if (
      availableModels.length === 0 &&
      httpError &&
      (httpError.includes('401') || httpError.includes('403'))
    ) {
      throw new Error(`SiliconFlow / Vision API yetkilendirme hatası (${httpError})`);
    }

    const { exactConfiguredMatch, visionModels, textModels, freeTextModels } =
      resolveEndpointModels(configuredModel, availableModels);

    const persistResolvedVisionModel = (resolvedId: string) => {
      if (
        resolvedId &&
        resolvedId !== settings.deepseek_ocr_model &&
        !/DeepSeek-V4-Flash-Vision-Exp/i.test(resolvedId)
      ) {
        try {
          const db = ensureAiTicketTables();
          db.prepare('UPDATE ai_provider_settings SET deepseek_ocr_model = ? WHERE id = 1').run(
            resolvedId
          );
        } catch {
          // ignore db write race
        }
      }
    };

    let combinedTranscription = '';
    let usedVisionModel = '';
    let lastVisionErr: any = null;
    let visionHitInsufficientBalance = false;

    // Step 1: Visual scan reading via verified Vision / OCR models on this SiliconFlow / vLLM endpoint
    if (images.length > 0 && visionModels.length > 0) {
      for (const candidateVision of visionModels.slice(0, 6)) {
        const isPureOcrModel = /ocr/i.test(candidateVision);
        const isShort4kVlModel = /deepseek-vl/i.test(candidateVision);

        try {
          if (isPureOcrModel) {
            const ocrMarkdown = await callOpenAiCompatibleVisionOrText({
              baseUrl,
              apiKey,
              model: candidateVision,
              omitSystemMessage: true,
              maxTokens: 2000,
              userInstruction:
                'Perform OCR and extract all text, tables, passenger names, passport numbers, dates, flight/train numbers, booking references, routes, and fares from this document in Markdown format.',
              imagesDataUrls: images.slice(0, 2),
            });
            usedVisionModel = candidateVision;
            if (!exactConfiguredMatch) persistResolvedVisionModel(candidateVision);

            try {
              const maybeJson = extractJsonFromModelOutput(ocrMarkdown);
              if (maybeJson && (Array.isArray(maybeJson.passengers) || maybeJson.passengerName)) {
                return {
                  parsed: maybeJson,
                  providerLabel: `DeepSeek-OCR (${candidateVision.split('/').pop()})`,
                };
              }
            } catch {
              // OCR model returned Markdown; proceed to Step 2 JSON structuring
            }
            combinedTranscription = ocrMarkdown;
            break;
          } else if (isShort4kVlModel) {
            // deepseek-ai/deepseek-vl2 has a strict 4,096 total context limit (input + max_tokens <= 4096)
            const compactPdfHint = pdfTextContext
              ? `\n[PDF TEXT SNIPPET]:\n${pdfTextContext.slice(0, 1400)}\n`
              : '';
            const compactPrompt =
              `Read this travel ticket scan carefully (distinguish passenger vs agency, Cyrillic/Latin names, passport/document number, PNR, flight/train number, cities, YYYY-MM-DD dates, fare).${compactPdfHint}\n` +
              `Return ONLY valid JSON matching:\n` +
              `{"transportType":"flight","bookingReference":"","carrier":"","flightOrTrainNumber":"","departureCity":"","arrivalCity":"","departureAirportOrStation":"","arrivalAirportOrStation":"","departureDate":"YYYY-MM-DD","returnOrArrivalDate":"","ticketClass":"economy","totalAmount":0,"currency":"RUB","passengers":[{"passengerName":"","passengerNameCyrillic":"","passportNumber":"","citizenship":"","ticketNumber":"","seatOrWagon":"","ticketPrice":0}]}`;

            const vlOut = await callOpenAiCompatibleVisionOrText({
              baseUrl,
              apiKey,
              model: candidateVision,
              omitSystemMessage: true,
              maxTokens: 1050,
              userInstruction: compactPrompt,
              imagesDataUrls: images.slice(0, 1),
            });
            usedVisionModel = candidateVision;
            if (!exactConfiguredMatch) persistResolvedVisionModel(candidateVision);

            if (pdfTextContext.length <= 1400 && images.length <= 1) {
              try {
                const parsedDirect = extractJsonFromModelOutput(vlOut);
                if (
                  parsedDirect &&
                  (Array.isArray(parsedDirect.passengers) || parsedDirect.passengerName)
                ) {
                  return {
                    parsed: parsedDirect,
                    providerLabel: `DeepSeek-VL2 (${candidateVision.split('/').pop()})`,
                  };
                }
              } catch {
                // Fall through to Step 2 text JSON structuring
              }
            }
            combinedTranscription = vlOut;
            break;
          } else {
            // Long-context Vision-Language model (e.g. Qwen3-VL-8B, GLM-4.1V-9B, Qwen2.5-VL, DeepSeek-V4-Flash)
            const vlOut = await callOpenAiCompatibleVisionOrText({
              baseUrl,
              apiKey,
              model: candidateVision,
              systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
              userInstruction: baseUserInstruction,
              imagesDataUrls: images.slice(0, 2),
              maxTokens: 2600,
            });
            usedVisionModel = candidateVision;
            if (!exactConfiguredMatch) persistResolvedVisionModel(candidateVision);

            try {
              const parsedDirect = extractJsonFromModelOutput(vlOut);
              if (
                parsedDirect &&
                (Array.isArray(parsedDirect.passengers) || parsedDirect.passengerName)
              ) {
                return {
                  parsed: parsedDirect,
                  providerLabel: `SiliconFlow Vision (${candidateVision.split('/').pop()})`,
                };
              }
            } catch {
              // Fall through to Step 2 text JSON structuring
            }
            combinedTranscription = vlOut;
            break;
          }
        } catch (vErr: any) {
          lastVisionErr = vErr;
          const errStr = String(vErr?.message || '');
          if (errStr.includes('API 401')) {
            throw vErr;
          }
          if (errStr.includes('402') || errStr.includes('30001')) {
            visionHitInsufficientBalance = true;
          }
        }
      }
    }

    if (pdfTextContext.length > 25) {
      combinedTranscription = combinedTranscription
        ? `${combinedTranscription}\n\n[DIGITAL PDF TEXT]:\n${pdfTextContext}`
        : pdfTextContext;
    }

    if (!combinedTranscription.trim()) {
      throw (
        lastVisionErr ||
        new Error(
          availableModels.length > 0 && visionModels.length === 0
            ? 'Bu SiliconFlow / vLLM uç noktasında aktif görsel (Vision/OCR) model bulunamadı.'
            : 'DeepSeek-OCR / VL2 belgeden görsel veya metin içeriği çıkaramadı.'
        )
      );
    }

    // Step 2: Structure transcription into strict Ticket JSON using verified text models on the SAME endpoint
    // If paid Vision models hit 402/30001 (account balance = $0), try SiliconFlow's $0.00 FREE models FIRST!
    const jsonModelsToTry =
      visionHitInsufficientBalance && freeTextModels.length > 0
        ? freeTextModels.slice(0, 5)
        : textModels.length > 0
        ? textModels.slice(0, 5)
        : ['Qwen/Qwen3-8B', 'Qwen/Qwen2.5-7B-Instruct', 'THUDM/GLM-4-9B-0414', 'deepseek-ai/DeepSeek-V3'];

    let lastStructErr: any = null;
    for (const candidateTextModel of jsonModelsToTry) {
      try {
        const structured = await callOpenAiCompatibleVisionOrText({
          baseUrl,
          apiKey,
          model: candidateTextModel,
          systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
          userInstruction: `Extract structured ticket JSON from this document content:\n\n${combinedTranscription.slice(0, 15000)}`,
          imagesDataUrls: [],
          maxTokens: 2400,
        });
        const visionTag = usedVisionModel ? `${usedVisionModel.split('/').pop()} + ` : '';
        return {
          parsed: extractJsonFromModelOutput(structured),
          providerLabel: `SiliconFlow (${visionTag}${candidateTextModel.split('/').pop()})`,
        };
      } catch (err: any) {
        lastStructErr = err;
      }
    }

    throw (
      lastStructErr ||
      lastVisionErr ||
      new Error('SiliconFlow / DeepSeek-OCR çıktısı JSON yapısına dönüştürülemedi.')
    );
  }

  if (provider === 'yandex') {
    const folderId = settings.yandex_folder_id.trim();
    const apiKey = settings.yandex_api_key.trim();
    if (!folderId || !apiKey) {
      throw new Error(
        'Yandex Cloud Folder ID veya API Key eksik. Ayarlar > AI sekmesinden Yandex bilgilerini girin.'
      );
    }

    let docText = pdfTextContext;
    if (images.length > 0) {
      const firstImg = splitDataUrl(images[0]);
      const ocrOut = await runYandexVisionOcr(firstImg.base64, firstImg.mimeType, folderId, apiKey);
      docText = docText ? `${ocrOut}\n\n${docText}` : ocrOut;
    } else if (input.rawFileBase64) {
      const ocrOut = await runYandexVisionOcr(
        input.rawFileBase64,
        input.mimeType || 'application/pdf',
        folderId,
        apiKey
      );
      docText = docText ? `${ocrOut}\n\n${docText}` : ocrOut;
    }

    if (!docText.trim()) {
      throw new Error('Yandex Vision OCR belgeden metin okuyamadı.');
    }

    const gptOut = await callYandexGptText({
      folderId,
      apiKey,
      model: settings.yandex_model || 'yandexgpt/latest',
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userText: `Document OCR / Layout Content:\n${docText.slice(0, 14000)}\n\nReturn ONLY valid JSON.`,
    });

    return {
      parsed: extractJsonFromModelOutput(gptOut),
      providerLabel: 'Yandex Vision + YandexGPT (RU)',
    };
  }

  if (provider === 'gigachat') {
    const authKey = settings.gigachat_auth_key.trim();
    if (!authKey) {
      throw new Error(
        'Sber GigaChat Authorization Key (Base64) eksik. Ayarlar > AI sekmesinden GigaChat anahtarını girin.'
      );
    }
    const firstImg = images[0] ? splitDataUrl(images[0]) : undefined;
    const promptWithContext = `${HUMAN_TICKET_SYSTEM_PROMPT}\n\n${baseUserInstruction}`;

    const gigaOut = await callGigaChatVisionOrText({
      authKey,
      scope: settings.gigachat_scope || 'GIGACHAT_API_PERS',
      model: settings.gigachat_model || 'GigaChat-Pro',
      fullPrompt: promptWithContext,
      base64Data: firstImg?.base64,
      mimeType: firstImg?.mimeType,
    });

    return {
      parsed: extractJsonFromModelOutput(gigaOut),
      providerLabel: `Sber ${settings.gigachat_model || 'GigaChat-Pro'} (RU)`,
    };
  }

  if (provider === 'gemini') {
    const apiKey = settings.gemini_api_key.trim();
    if (!apiKey) {
      throw new Error('Google Gemini API Key eksik. Ayarlar > AI sekmesinden tanımlayın.');
    }
    const { text, modelUsed } = await callGeminiNativeGenerateContent({
      apiKey,
      preferredModel: settings.gemini_model.trim() || 'gemini-flash-latest',
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userInstruction: baseUserInstruction,
      imagesDataUrls: images,
      rawPdfBase64: images.length === 0 ? input.rawFileBase64 : undefined,
      jsonMode: true,
      maxTokens: 2800,
    });
    return {
      parsed: extractJsonFromModelOutput(text),
      providerLabel: `Google Gemini (${modelUsed})`,
    };
  }

  if (provider === 'openrouter') {
    const apiKey = settings.openrouter_api_key.trim();
    if (!apiKey) {
      throw new Error('OpenRouter API Key eksik. Ayarlar > AI sekmesinden tanımlayın.');
    }
    const raw = await callOpenAiCompatibleVisionOrText({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey,
      model: settings.openrouter_model.trim() || 'deepseek/deepseek-chat-v3-0324',
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userInstruction: baseUserInstruction,
      imagesDataUrls: images,
      extraHeaders: {
        'HTTP-Referer': 'https://hr.pondera.network',
        'X-Title': 'Pondera HR Ticket AI',
      },
    });
    return {
      parsed: extractJsonFromModelOutput(raw),
      providerLabel: `OpenRouter (${settings.openrouter_model})`,
    };
  }

  if (provider === 'ru_docs_ocr') {
    if (!settings.ru_docs_ocr_url.trim()) {
      throw new Error('RussianDocsOCR sunucu adresi eksik.');
    }
    const firstImg = images[0]
      ? splitDataUrl(images[0])
      : input.rawFileBase64
      ? { mimeType: input.mimeType, base64: input.rawFileBase64 }
      : null;
    if (!firstImg) throw new Error('Görsel verisi bulunamadı.');

    const ocrText = await runRussianDocsOcr(
      firstImg.base64,
      firstImg.mimeType,
      settings.ru_docs_ocr_url,
      settings.ru_docs_ocr_key
    );

    if (settings.deepseek_api_key.trim()) {
      const raw = await callOpenAiCompatibleVisionOrText({
        baseUrl: settings.deepseek_base_url || 'https://api.deepseek.com/v1',
        apiKey: settings.deepseek_api_key,
        model: 'deepseek-chat',
        systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
        userInstruction: `Parse this RussianDocsOCR output into JSON:\n\n${ocrText}`,
        imagesDataUrls: [],
      });
      return {
        parsed: extractJsonFromModelOutput(raw),
        providerLabel: 'RussianDocsOCR + DeepSeek AI',
      };
    }
    return {
      parsed: extractJsonFromModelOutput(ocrText),
      providerLabel: 'RussianDocsOCR (On-Premise)',
    };
  }

  throw new Error(`Bilinmeyen AI sağlayıcısı: ${provider}`);
}

export async function parseTicketDocument(input: TicketParseInput) {
  const settings = getAiProviderSettings();
  const selectedProvider: AiProviderId =
    input.providerOverride || settings.active_provider || 'deepseek';

  const providerTitles: Record<AiProviderId, string> = {
    deepseek: 'DeepSeek Resmi API (platform.deepseek.com)',
    deepseek_ocr: 'SiliconFlow / DeepSeek-OCR (cloud.siliconflow.com)',
    yandex: 'Yandex Cloud AI',
    gigachat: 'Sber GigaChat',
    gemini: 'Google Gemini',
    openrouter: 'OpenRouter',
    ru_docs_ocr: 'RussianDocsOCR',
  };

  // Strict single-provider execution: NEVER auto-switch to another AI provider behind the user's back
  try {
    return await executeSingleProviderTicketParse(selectedProvider, input, settings);
  } catch (err: any) {
    throw humanizeProviderApiError(err, providerTitles[selectedProvider] || selectedProvider);
  }
}

export function hasProviderCredentials(
  provider: AiProviderId,
  s: AiProviderSettingsRow
): boolean {
  switch (provider) {
    case 'deepseek':
      return Boolean(s.deepseek_api_key.trim());
    case 'deepseek_ocr':
      return Boolean(s.deepseek_ocr_api_key.trim());
    case 'yandex':
      return Boolean(s.yandex_folder_id.trim() && s.yandex_api_key.trim());
    case 'gigachat':
      return Boolean(s.gigachat_auth_key.trim());
    case 'gemini':
      return Boolean(s.gemini_api_key.trim());
    case 'openrouter':
      return Boolean(s.openrouter_api_key.trim());
    case 'ru_docs_ocr':
      return Boolean(s.ru_docs_ocr_url.trim());
    default:
      return false;
  }
}

export async function testAiProviderConnection(
  provider: AiProviderId,
  overrides?: Partial<AiProviderSettingsRow>
): Promise<{
  ok: boolean;
  latencyMs: number;
  message: string;
  modelReply?: string;
  resolvedModel?: string;
  availableVisionModels?: string[];
}> {
  const saved = getAiProviderSettings();
  const s: AiProviderSettingsRow = { ...saved, ...(overrides || {}) };
  const start = Date.now();

  try {
    if (provider === 'deepseek') {
      const base = s.deepseek_base_url || 'https://api.deepseek.com/v1';
      const cleanDsKey = normalizeDeepseekApiKey(s.deepseek_api_key, base);
      if (!cleanDsKey) {
        return { ok: false, latencyMs: 0, message: 'DeepSeek API Key girilmedi.' };
      }
      const { models: dsModels } = await fetchOpenAiEndpointModels(base, cleanDsKey);
      const requested = s.deepseek_model.trim() || 'deepseek-chat';
      const exactMatch = dsModels.find((m) => m.toLowerCase() === requested.toLowerCase());
      const flashMatch = /flash/i.test(requested)
        ? dsModels.find((m) => /flash/i.test(m))
        : undefined;
      const usedModel =
        exactMatch || flashMatch || (dsModels.length === 0 ? requested : 'deepseek-chat');

      const reply = await callOpenAiCompatibleVisionOrText({
        baseUrl: base,
        apiKey: cleanDsKey,
        model: usedModel,
        systemPrompt: 'Reply concisely.',
        userInstruction: 'Reply with: DEEPSEEK_PONDERA_OK',
        imagesDataUrls: [],
        maxTokens: 32,
      });

      if (cleanDsKey !== saved.deepseek_api_key && saved.deepseek_api_key) {
        try {
          const db = ensureAiTicketTables();
          db.prepare('UPDATE ai_provider_settings SET deepseek_api_key = ? WHERE id = 1').run(
            cleanDsKey
          );
        } catch {
          // ignore
        }
      }

      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `DeepSeek AI canlı bağlantısı başarılı! Aktif model: ${usedModel}${
          dsModels.length > 0 ? ` (Erişilebilir modeller: ${dsModels.join(', ')})` : ''
        }`,
        modelReply: reply.slice(0, 80),
        resolvedModel: usedModel,
      };
    }

    if (provider === 'deepseek_ocr') {
      if (!s.deepseek_ocr_api_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'DeepSeek-OCR / SiliconFlow API Key girilmedi.' };
      }
      const base = (s.deepseek_ocr_base_url || 'https://api.siliconflow.com/v1').replace(/\/+$/, '');
      const configuredModel = (s.deepseek_ocr_model || 'deepseek-ai/deepseek-vl2').trim();

      const { models: availableModels, httpError } = await fetchOpenAiEndpointModels(
        base,
        s.deepseek_ocr_api_key
      );
      if (availableModels.length === 0 && httpError) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          message: `SiliconFlow / Vision uç noktası hatası: ${httpError}`,
        };
      }

      const { exactConfiguredMatch, visionModels, freeTextModels } = resolveEndpointModels(
        configuredModel,
        availableModels
      );

      if (visionModels.length === 0) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          message:
            'Bu uç noktada aktif bir Görsel (Vision/OCR) modeli bulunamadı. URL ve hesap yetkilerinizi kontrol edin.',
        };
      }

      // Perform a REAL /chat/completions vision test with a valid 64x64 PNG so 20012 / 402 errors are caught immediately!
      let lastTestErr = '';
      for (const candidateModel of visionModels.slice(0, 6)) {
        try {
          const reply = await callOpenAiCompatibleVisionOrText({
            baseUrl: base,
            apiKey: s.deepseek_ocr_api_key,
            model: candidateModel,
            omitSystemMessage: true,
            userInstruction: 'Reply with one word: OK',
            imagesDataUrls: [TEST_PNG_64X64_DATA_URL],
            maxTokens: 24,
          });

          if (
            candidateModel !== saved.deepseek_ocr_model &&
            !/DeepSeek-V4-Flash-Vision-Exp/i.test(candidateModel)
          ) {
            try {
              const db = ensureAiTicketTables();
              db.prepare(
                'UPDATE ai_provider_settings SET deepseek_ocr_model = ? WHERE id = 1'
              ).run(candidateModel);
            } catch {
              // ignore
            }
          }

          const wasAutoResolved = !exactConfiguredMatch || exactConfiguredMatch !== candidateModel;
          return {
            ok: true,
            latencyMs: Date.now() - start,
            resolvedModel: candidateModel,
            availableVisionModels: visionModels.slice(0, 15),
            modelReply: reply.slice(0, 60),
            message: wasAutoResolved
              ? `"${configuredModel}" yerine aktif görsel model doğrulandı ve seçildi: ${candidateModel}`
              : `Görsel evrak modeli canlı /chat/completions testinden başarıyla geçti (${candidateModel}).`,
          };
        } catch (err: any) {
          lastTestErr = String(err?.message || 'Görsel model yanıt vermedi.');
          if (lastTestErr.includes('API 401')) break;
        }
      }

      // If paid Vision models hit 402/30001, check if $0 FREE text models still work for digital e-ticket PDFs!
      if (
        (lastTestErr.includes('402') || lastTestErr.includes('30001')) &&
        freeTextModels.length > 0
      ) {
        try {
          await callOpenAiCompatibleVisionOrText({
            baseUrl: base,
            apiKey: s.deepseek_ocr_api_key,
            model: freeTextModels[0],
            systemPrompt: 'Reply concisely.',
            userInstruction: 'Reply OK',
            imagesDataUrls: [],
            maxTokens: 16,
          });
          return {
            ok: true,
            latencyMs: Date.now() - start,
            availableVisionModels: visionModels.slice(0, 15),
            resolvedModel: visionModels[0],
            message: `Ücretsiz metin modeli (${freeTextModels[0]}) aktif (Dijital e-bilet PDF'lerini ücretsiz okur); ancak fotoğraf/scan görsel modelleri için SiliconFlow hesabınızda bakiye kalmadı (API 402).`,
          };
        } catch {
          // Even free models blocked by $0 balance
        }
      }

      return {
        ok: false,
        latencyMs: Date.now() - start,
        availableVisionModels: visionModels.slice(0, 15),
        resolvedModel: visionModels[0],
        message: humanizeProviderApiError(new Error(lastTestErr), 'SiliconFlow').message,
      };
    }

    if (provider === 'yandex') {
      if (!s.yandex_folder_id.trim() || !s.yandex_api_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'Yandex Folder ID ve API Key zorunludur.' };
      }
      const reply = await callYandexGptText({
        folderId: s.yandex_folder_id,
        apiKey: s.yandex_api_key,
        model: s.yandex_model || 'yandexgpt/latest',
        systemPrompt: 'Reply concisely.',
        userText: 'Reply with: YANDEX_OK',
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: 'Yandex Cloud (YandexGPT + Vision) bağlantısı başarılı!',
        modelReply: reply.slice(0, 80),
      };
    }

    if (provider === 'gigachat') {
      if (!s.gigachat_auth_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'GigaChat Authorization Key (Base64) girilmedi.' };
      }
      const reply = await callGigaChatVisionOrText({
        authKey: s.gigachat_auth_key,
        scope: s.gigachat_scope || 'GIGACHAT_API_PERS',
        model: s.gigachat_model || 'GigaChat-Pro',
        fullPrompt: 'Ответь одним словом: GIGACHAT_OK',
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: 'Sber GigaChat (Минцифры TLS sertifikalı) bağlantısı başarılı!',
        modelReply: reply.slice(0, 80),
      };
    }

    if (provider === 'gemini') {
      if (!s.gemini_api_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'Gemini API Key girilmedi.' };
      }
      const { text, modelUsed } = await callGeminiNativeGenerateContent({
        apiKey: s.gemini_api_key,
        preferredModel: s.gemini_model || 'gemini-flash-latest',
        systemPrompt: 'Reply concisely.',
        userInstruction: 'Reply with: GEMINI_OK',
        imagesDataUrls: [],
        jsonMode: false,
        maxTokens: 32,
      });
      if (modelUsed !== saved.gemini_model) {
        try {
          const db = ensureAiTicketTables();
          db.prepare('UPDATE ai_provider_settings SET gemini_model = ? WHERE id = 1').run(
            modelUsed
          );
        } catch {
          // ignore
        }
      }
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `Google Gemini (${modelUsed}) canlı bağlantısı başarılı!`,
        modelReply: text.slice(0, 80),
        resolvedModel: modelUsed,
      };
    }

    if (provider === 'openrouter') {
      if (!s.openrouter_api_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'OpenRouter API Key girilmedi.' };
      }
      const reply = await callOpenAiCompatibleVisionOrText({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: s.openrouter_api_key,
        model: s.openrouter_model || 'deepseek/deepseek-chat-v3-0324',
        systemPrompt: 'Reply concisely.',
        userInstruction: 'Reply with: OPENROUTER_OK',
        imagesDataUrls: [],
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `OpenRouter (${s.openrouter_model}) bağlantısı başarılı!`,
        modelReply: reply.slice(0, 80),
      };
    }

    if (provider === 'ru_docs_ocr') {
      if (!s.ru_docs_ocr_url.trim()) {
        return { ok: false, latencyMs: 0, message: 'RussianDocsOCR sunucu URL girilmedi.' };
      }
      const base = s.ru_docs_ocr_url.trim().replace(/\/+$/, '');
      const headers: Record<string, string> = {};
      if (s.ru_docs_ocr_key.trim()) headers['Authorization'] = `Bearer ${s.ru_docs_ocr_key.trim()}`;
      const res = await fetch(`${base}/health`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: 'RussianDocsOCR yerel sunucusu aktif ve yanıt veriyor!',
      };
    }

    return { ok: false, latencyMs: 0, message: 'Bilinmeyen sağlayıcı.' };
  } catch (err: any) {
    const providerLabels: Record<AiProviderId, string> = {
      deepseek: 'DeepSeek Resmi API',
      deepseek_ocr: 'SiliconFlow / DeepSeek-OCR',
      yandex: 'Yandex Cloud AI',
      gigachat: 'Sber GigaChat',
      gemini: 'Google Gemini',
      openrouter: 'OpenRouter',
      ru_docs_ocr: 'RussianDocsOCR',
    };
    const humanized = humanizeProviderApiError(err, providerLabels[provider] || provider);
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: String(humanized.message || 'Bağlantı kurulamadı.'),
    };
  }
}

export function generateNextGuestCode(): string {
  const db = ensureAiTicketTables();
  const year = new Date().getFullYear();
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM travel_guests')
    .get() as { cnt: number } | undefined;
  const nextNum = (row?.cnt || 0) + 1;
  return `GUEST-${year}-${String(nextNum).padStart(4, '0')}`;
}

