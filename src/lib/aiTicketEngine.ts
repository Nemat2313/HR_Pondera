import https from 'https';
import tls from 'tls';
import crypto from 'crypto';
import { getDb } from '@/lib/db';

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
      fallback_provider TEXT NOT NULL DEFAULT 'yandex',
      hybrid_ocr_enabled INTEGER NOT NULL DEFAULT 1,
      deepseek_api_key TEXT NOT NULL DEFAULT '',
      deepseek_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
      deepseek_model TEXT NOT NULL DEFAULT 'deepseek-flash',
      deepseek_ocr_base_url TEXT NOT NULL DEFAULT 'https://api.siliconflow.com/v1',
      deepseek_ocr_api_key TEXT NOT NULL DEFAULT '',
      deepseek_ocr_model TEXT NOT NULL DEFAULT 'deepseek-ai/DeepSeek-OCR',
      yandex_folder_id TEXT NOT NULL DEFAULT '',
      yandex_api_key TEXT NOT NULL DEFAULT '',
      yandex_model TEXT NOT NULL DEFAULT 'yandexgpt/latest',
      gigachat_auth_key TEXT NOT NULL DEFAULT '',
      gigachat_scope TEXT NOT NULL DEFAULT 'GIGACHAT_API_PERS',
      gigachat_model TEXT NOT NULL DEFAULT 'GigaChat-Pro',
      gemini_api_key TEXT NOT NULL DEFAULT '',
      gemini_base_url TEXT NOT NULL DEFAULT 'https://generativelanguage.googleapis.com/v1beta/openai',
      gemini_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
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
      'yandex',
      1,
      'https://api.deepseek.com/v1',
      'deepseek-flash',
      'https://api.siliconflow.com/v1',
      'deepseek-ai/DeepSeek-OCR',
      'yandexgpt/latest',
      'GIGACHAT_API_PERS',
      'GigaChat-Pro',
      'https://generativelanguage.googleapis.com/v1beta/openai',
      'gemini-2.0-flash',
      'deepseek/deepseek-chat-v3-0324',
      datetime('now')
    );

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
      fallback_provider: 'yandex',
      hybrid_ocr_enabled: 1,
      deepseek_api_key: process.env.DEEPSEEK_API_KEY || '',
      deepseek_base_url: 'https://api.deepseek.com/v1',
      deepseek_model: 'deepseek-flash',
      deepseek_ocr_base_url: 'https://api.siliconflow.com/v1',
      deepseek_ocr_api_key: process.env.SILICONFLOW_API_KEY || '',
      deepseek_ocr_model: 'deepseek-ai/DeepSeek-OCR',
      yandex_folder_id: process.env.YANDEX_FOLDER_ID || '',
      yandex_api_key: process.env.YANDEX_API_KEY || '',
      yandex_model: 'yandexgpt/latest',
      gigachat_auth_key: process.env.GIGACHAT_AUTH_KEY || '',
      gigachat_scope: 'GIGACHAT_API_PERS',
      gigachat_model: 'GigaChat-Pro',
      gemini_api_key: process.env.GEMINI_API_KEY || '',
      gemini_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
      gemini_model: 'gemini-2.0-flash',
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
  return val.includes('••••');
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
  const prefixes = ['PSP', 'PASS', 'PASSPORT', 'DOC', 'NP', 'ZP', 'PN', 'RF'];
  for (const p of prefixes) {
    if (s.startsWith(p) && s.length >= p.length + 6) {
      s = s.slice(p.length);
      break;
    }
  }
  return s.replace(/[^A-Z0-9]/g, '');
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

export function matchPassengersAgainstPondera(
  passengers: Array<{ passengerName: string; passportNumber?: string }>
): PassengerMatchResult[] {
  const db = ensureAiTicketTables();

  const employees = db
    .prepare(
      `SELECT sicil_no, ad_soyad, adi, soyadi, tam_adi_kiril, pasaport_no, tc_kimlik_no,
              uyruk, region, proje_adi, departman, gorevi, genel_durum
       FROM personnel`
    )
    .all() as Array<{
    sicil_no: string;
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
  }>;

  const guests = db
    .prepare(
      `SELECT id, guest_code, full_name, full_name_ru, passport_no, citizenship,
              company_or_org, assigned_region, assigned_project, status, linked_sicil_no
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
    status: string;
    linked_sicil_no: string;
  }>;

  // Pre-normalize employee passports & names once for O(N) fast matching over ~5,400 rows
  const preparedEmployees = employees.map((e) => {
    const cleanPasp = cleanTicketPassportNumber(e.pasaport_no);
    const cleanTc = cleanTicketPassportNumber(e.tc_kimlik_no);
    const fullLatin = e.ad_soyad || `${e.adi || ''} ${e.soyadi || ''}`.trim();
    return {
      row: e,
      cleanPasp,
      cleanTc,
      fullLatin,
      isActive: String(e.genel_durum || '').toLowerCase().includes('mevcut'),
    };
  });

  const preparedGuests = guests.map((g) => ({
    row: g,
    cleanPasp: cleanTicketPassportNumber(g.passport_no),
  }));

  return passengers.map((p) => {
    const ticketPasp = cleanTicketPassportNumber(p.passportNumber);
    const ticketName = (p.passengerName || '').trim();
    const scoredCandidates: MatchedPersonCandidate[] = [];

    for (const emp of preparedEmployees) {
      let score = 0;
      let reason = '';

      if (
        ticketPasp &&
        ticketPasp.length >= 6 &&
        (emp.cleanPasp === ticketPasp || emp.cleanTc === ticketPasp)
      ) {
        score = emp.isActive ? 100 : 95;
        reason = 'Tam Pasaport Eşleşmesi';
      } else if (
        ticketPasp &&
        ticketPasp.length >= 7 &&
        emp.cleanPasp.length >= 7 &&
        emp.cleanPasp.slice(-7) === ticketPasp.slice(-7)
      ) {
        const nameScore = Math.max(
          computeNameMatchScore(ticketName, emp.fullLatin),
          computeNameMatchScore(ticketName, emp.row.tam_adi_kiril)
        );
        if (nameScore >= 65) {
          score = emp.isActive ? 96 : 91;
          reason = 'Pasaport Son 7 Hane + İsim Eşleşmesi';
        }
      }

      if (score === 0 && ticketName) {
        const latinScore = computeNameMatchScore(ticketName, emp.fullLatin);
        const cyrScore = emp.row.tam_adi_kiril
          ? computeNameMatchScore(ticketName, emp.row.tam_adi_kiril)
          : 0;
        const bestNameScore = Math.max(latinScore, cyrScore);
        if (bestNameScore >= 65) {
          score = emp.isActive ? bestNameScore : Math.max(60, bestNameScore - 4);
          reason =
            cyrScore > latinScore
              ? 'Kiril İsim Benzerliği (1C/eBA)'
              : 'İsim Benzerliği (eBA Personel)';
        }
      }

      if (score >= 65) {
        scoredCandidates.push({
          personType: 'employee',
          sicilNo: emp.row.sicil_no,
          fullName: emp.fullLatin || emp.row.tam_adi_kiril,
          fullNameRu: emp.row.tam_adi_kiril || '',
          passportNo: emp.row.pasaport_no || emp.row.tc_kimlik_no || '',
          citizenship: emp.row.uyruk || '',
          region: emp.row.region || '',
          projectName: emp.row.proje_adi || '',
          department: emp.row.departman || '',
          position: emp.row.gorevi || '',
          status: emp.row.genel_durum || 'Mevcut',
          confidence: score,
          matchReason: reason,
        });
      }
    }

    for (const gst of preparedGuests) {
      let score = 0;
      let reason = '';
      if (ticketPasp && ticketPasp.length >= 6 && gst.cleanPasp === ticketPasp) {
        score = 98;
        reason = 'Kayıtlı Misafir Pasaport Eşleşmesi';
      } else if (ticketName) {
        const gLatin = computeNameMatchScore(ticketName, gst.row.full_name);
        const gCyr = gst.row.full_name_ru ? computeNameMatchScore(ticketName, gst.row.full_name_ru) : 0;
        const best = Math.max(gLatin, gCyr);
        if (best >= 70) {
          score = best;
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
          region: gst.row.assigned_region || '',
          projectName: gst.row.assigned_project || '',
          department: gst.row.company_or_org || 'Misafir (Guest)',
          position: 'Misafir Yolcu',
          status: 'Guest',
          confidence: score,
          matchReason: reason,
        });
      }
    }

    scoredCandidates.sort((a, b) => b.confidence - a.confidence);
    const topCandidates = scoredCandidates.slice(0, 6);
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
        : 'Personel listesinde bulunamadı — Yeni Misafir (Guest) kaydı açılacak',
      matchedPerson: null,
      candidates: topCandidates,
    };
  });
}

// ---------------- HUMAN-LIKE SEMANTIC TICKET & ITINERARY EXTRACTION PROMPT ----------------

export const HUMAN_TICKET_SYSTEM_PROMPT = `You are a senior multilingual travel document analyst fluent in Russian, Turkish, and English.
Instead of doing blind line-by-line OCR, read and understand the whole document layout like an experienced human travel coordinator:
- Distinguish actual PASSENGER NAMES and PASSPORT/DOCUMENT NUMBERS from agency headers, cashier names, company legal names (e.g. ООО ПОНДЕРА / PONDERA / POWERISE), baggage rules, and fare endorsements.
- Recognize both AIRLINE E-TICKETS (Aeroflot, Uzbekistan Airways, Turkish Airlines, S7, Utair, Pobeda, Air India, Ural Airlines, Azimuth, Pegasus, Charter manifests) AND RUSSIAN RAILWAYS (РЖД / RZD) electronic tickets / control coupons (Контрольный купон, Поезд, Вагон, Место, Отправление, Прибытие).
- If MULTIPLE PASSENGERS appear on the same itinerary/booking, extract EVERY passenger into the "passengers" array with their respective passportNumber, ticketNumber, and seatOrWagon.
- Clean airline GDS prefixes from passport numbers (for example "PSPFA4210519" -> "FA4210519", "NP 75 1234567" -> "751234567").
- Keep passengerName in clean UPPERCASE Latin if Latin is shown; if the ticket is strictly in Cyrillic (common on RZD domestic tickets), keep Cyrillic in passengerNameCyrillic AND provide standard GOST Latin transliteration in passengerName.
- If a total invoice/booking amount covers N passengers and individual fares are not broken out, put the per-passenger share in "pricePerPassenger" and total in "totalPrice".

Return ONLY a valid JSON object (no markdown fences, no commentary) matching this exact schema:
{
  "transportType": "flight" | "train",
  "passengers": [
    {
      "passengerName": "SURNAME GIVENNAME",
      "passengerNameCyrillic": "ФАМИЛИЯ ИМЯ ОТЧЕСТВО or empty string",
      "passportNumber": "Cleaned passport/document number without PSP/NP prefix",
      "ticketNumber": "13-digit e-ticket or 14-digit RZD ticket number",
      "seatOrWagon": "e.g. Vagon 04 Seat 18 or 14A or empty string",
      "citizenship": "3-letter code if visible (UZB, RUS, TUR, IND, TJK, KAZ, KGZ, AZE, BLR) or empty string"
    }
  ],
  "bookingReference": "PNR / Booking code (6-char airline PNR or RZD order number)",
  "carrier": "Airline name or RZD train brand (e.g. Aeroflot, Uzbekistan Airways, RZD Sapsan)",
  "flightOrTrainNumber": "e.g. SU-1871, HY-631, TK-419, 002M, 758A",
  "departureCity": "Departure city name",
  "arrivalCity": "Arrival city name",
  "departureAirportOrStation": "IATA code (SVO, TAS, IST, LED, KZN) or Railway station name",
  "arrivalAirportOrStation": "IATA code or Railway station name",
  "departureDate": "DD.MM.YYYY HH:mm (or DD.MM.YYYY if time not shown)",
  "returnOrArrivalDate": "Arrival or return date DD.MM.YYYY HH:mm (or empty string)",
  "ticketClass": "economy" | "business" | "platzkart" | "kupe",
  "totalPrice": 0,
  "pricePerPassenger": 0,
  "currency": "RUB" | "USD" | "EUR" | "TRY" | "UZS"
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

async function callOpenAiCompatibleVisionOrText(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userInstruction: string;
  imagesDataUrls: string[];
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const endpoint = `${params.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey.trim()}`,
    'Content-Type': 'application/json',
    ...(params.extraHeaders || {}),
  };

  const userContent: Array<Record<string, unknown>> = [
    { type: 'text', text: params.userInstruction },
  ];
  for (const dataUrl of params.imagesDataUrls) {
    if (dataUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }
  }

  const bodyPayload = {
    model: params.model.trim(),
    messages: [
      { role: 'system', content: params.systemPrompt },
      {
        role: 'user',
        content: params.imagesDataUrls.length > 0 ? userContent : params.userInstruction,
      },
    ],
    temperature: 0.1,
    max_tokens: 2800,
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyPayload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API ${resp.status}: ${errText.slice(0, 280)}`);
  }

  const json = await resp.json();
  return String(json?.choices?.[0]?.message?.content || '');
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

export function extractJsonFromModelOutput(rawContent: string): Record<string, any> {
  const trimmed = (rawContent || '').trim();
  if (!trimmed) throw new Error('Yapay zeka boş yanıt döndürdü.');

  // Strip DeepSeek <think>...</think> reasoning block if present
  const withoutThink = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const fenceMatch =
    withoutThink.match(/```json\s*([\s\S]*?)```/i) ||
    withoutThink.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : withoutThink;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Yapay zeka yanıtı geçerli bir JSON formatına dönüştürülemedi.');
  }
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

  const pdfTextContext = (input.extractedPdfText || '').trim();
  const baseUserInstruction = pdfTextContext
    ? `Analyze this travel ticket/itinerary ("${input.fileName}") like a human travel specialist.\n\n[DIGITAL / LAYOUT TEXT FROM DOCUMENT]:\n${pdfTextContext.slice(0, 14000)}\n\nCross-check with the visual scan (if attached) and return ONLY valid JSON.`
    : `Analyze this travel ticket/itinerary scan ("${input.fileName}") like a human travel specialist and return ONLY valid JSON.`;

  if (provider === 'deepseek') {
    const apiKey = settings.deepseek_api_key.trim();
    if (!apiKey) {
      throw new Error(
        'DeepSeek API anahtarı henüz girilmemiş. Ayarlar > 4. Yapay Zeka (AI) & Evrak Okuma sekmesinden DeepSeek API Key ekleyin.'
      );
    }
    const model = settings.deepseek_model.trim() || 'deepseek-flash';
    const baseUrl = settings.deepseek_base_url.trim() || 'https://api.deepseek.com/v1';

    // Step 1: If we have visual scan images and model is multimodal (e.g. deepseek-flash / vl / ocr), try direct Vision first
    const looksTextOnlyModel = model === 'deepseek-chat' || model === 'deepseek-reasoner';
    if (images.length > 0 && !looksTextOnlyModel) {
      try {
        const raw = await callOpenAiCompatibleVisionOrText({
          baseUrl,
          apiKey,
          model,
          systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
          userInstruction: baseUserInstruction,
          imagesDataUrls: images,
        });
        return {
          parsed: extractJsonFromModelOutput(raw),
          providerLabel: `DeepSeek AI (${model})`,
        };
      } catch (visionErr: any) {
        // If account/endpoint doesn't support image_url on this model, fall through to Hybrid OCR/Text + DeepSeek-Chat semantic reasoning!
        const msg = String(visionErr?.message || '');
        const shouldTryHybrid =
          pdfTextContext.length > 30 ||
          (settings.hybrid_ocr_enabled === 1 &&
            Boolean(
              settings.deepseek_ocr_api_key.trim() ||
                (settings.yandex_folder_id.trim() && settings.yandex_api_key.trim()) ||
                settings.ru_docs_ocr_url.trim()
            ));
        if (!shouldTryHybrid) {
          throw new Error(
            `DeepSeek görsel okuma uyarısı (${msg.slice(0, 140)}). Taranmış resim/PDF için Ayarlar'dan "DeepSeek-OCR / VL2 (SiliconFlow)" veya hibrit Yandex Vision OCR anahtarını aktif edebilirsiniz.`
          );
        }
      }
    }

    // Step 2: Human-like semantic understanding with DeepSeek-V3 (deepseek-chat) over PDF text OR Hybrid Vision OCR!
    let richDocumentText = pdfTextContext;

    if (richDocumentText.length < 40) {
      const firstImg = images[0]
        ? splitDataUrl(images[0])
        : input.rawFileBase64
        ? { mimeType: input.mimeType || 'application/pdf', base64: input.rawFileBase64 }
        : null;

      if (firstImg && settings.deepseek_ocr_api_key.trim()) {
        // Use DeepSeek-OCR / VL2 to turn visual layout into structured markdown first
        const ocrMd = await callOpenAiCompatibleVisionOrText({
          baseUrl: settings.deepseek_ocr_base_url || 'https://api.siliconflow.com/v1',
          apiKey: settings.deepseek_ocr_api_key,
          model: settings.deepseek_ocr_model || 'deepseek-ai/DeepSeek-OCR',
          systemPrompt: 'Transcribe the entire document scan faithfully with tables and layout in Markdown.',
          userInstruction: 'Read all text, numbers, names, passport IDs, dates, and fares from this ticket.',
          imagesDataUrls: images.length > 0 ? images : [`data:${firstImg.mimeType};base64,${firstImg.base64}`],
        });
        richDocumentText = ocrMd;
      } else if (
        firstImg &&
        settings.yandex_folder_id.trim() &&
        settings.yandex_api_key.trim()
      ) {
        richDocumentText = await runYandexVisionOcr(
          firstImg.base64,
          firstImg.mimeType,
          settings.yandex_folder_id,
          settings.yandex_api_key
        );
      } else if (firstImg && settings.ru_docs_ocr_url.trim()) {
        richDocumentText = await runRussianDocsOcr(
          firstImg.base64,
          firstImg.mimeType,
          settings.ru_docs_ocr_url,
          settings.ru_docs_ocr_key
        );
      }
    }

    if (richDocumentText.length < 15) {
      throw new Error(
        'Bu dosya metin katmanı olmayan taranmış bir görüntü (Scan). DeepSeek-Chat metin modeli yerine Ayarlar > AI sekmesinden "DeepSeek-OCR / VL2" veya "Hibrit Yandex Vision + DeepSeek" seçeneğini etkinleştirin.'
      );
    }

    const semanticModel = looksTextOnlyModel ? model : 'deepseek-chat';
    const raw = await callOpenAiCompatibleVisionOrText({
      baseUrl,
      apiKey,
      model: semanticModel,
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userInstruction: `Read and understand this complete ticket content like a human specialist (fixing any OCR typos in dates, cities, or passport prefixes) and return ONLY valid JSON:\n\n${richDocumentText.slice(0, 15000)}`,
      imagesDataUrls: [],
    });

    return {
      parsed: extractJsonFromModelOutput(raw),
      providerLabel:
        pdfTextContext.length >= 40
          ? `DeepSeek AI (${semanticModel})`
          : `DeepSeek AI + Hibrit Görsel Akış (${semanticModel})`,
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
    const ocrModel = settings.deepseek_ocr_model.trim() || 'deepseek-ai/DeepSeek-OCR';

    // Pure DeepSeek-OCR models sometimes output structured Markdown rather than JSON directly;
    // if JSON parsing fails on direct output, we convert the Markdown via DeepSeek-V3 on the same endpoint!
    const raw = await callOpenAiCompatibleVisionOrText({
      baseUrl,
      apiKey,
      model: ocrModel,
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userInstruction: baseUserInstruction,
      imagesDataUrls: images,
    });

    try {
      return {
        parsed: extractJsonFromModelOutput(raw),
        providerLabel: `DeepSeek-OCR Vision (${ocrModel.split('/').pop()})`,
      };
    } catch {
      // Second pass: DeepSeek-OCR returned rich layout Markdown -> structure into JSON via DeepSeek-V3!
      const v3Model = settings.deepseek_api_key.trim()
        ? 'deepseek-chat'
        : 'deepseek-ai/DeepSeek-V3';
      const v3Base = settings.deepseek_api_key.trim()
        ? settings.deepseek_base_url || 'https://api.deepseek.com/v1'
        : baseUrl;
      const v3Key = settings.deepseek_api_key.trim() || apiKey;

      const structured = await callOpenAiCompatibleVisionOrText({
        baseUrl: v3Base,
        apiKey: v3Key,
        model: v3Model,
        systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
        userInstruction: `Extract structured JSON from this DeepSeek-OCR scan transcription:\n\n${raw.slice(0, 15000)}`,
        imagesDataUrls: [],
      });
      return {
        parsed: extractJsonFromModelOutput(structured),
        providerLabel: `DeepSeek-OCR + V3 Anlama`,
      };
    }
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
    const raw = await callOpenAiCompatibleVisionOrText({
      baseUrl:
        settings.gemini_base_url.trim() ||
        'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey,
      model: settings.gemini_model.trim() || 'gemini-2.0-flash',
      systemPrompt: HUMAN_TICKET_SYSTEM_PROMPT,
      userInstruction: baseUserInstruction,
      imagesDataUrls: images,
    });
    return {
      parsed: extractJsonFromModelOutput(raw),
      providerLabel: `Google Gemini (${settings.gemini_model || 'gemini-2.0-flash'})`,
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
  const primaryProvider: AiProviderId =
    input.providerOverride || settings.active_provider || 'deepseek';

  try {
    return await executeSingleProviderTicketParse(primaryProvider, input, settings);
  } catch (primaryErr: any) {
    const fb = settings.fallback_provider as AiProviderId | '';
    if (
      !input.providerOverride &&
      fb &&
      fb !== primaryProvider &&
      hasProviderCredentials(fb, settings)
    ) {
      try {
        const fallbackResult = await executeSingleProviderTicketParse(fb, input, settings);
        return {
          parsed: fallbackResult.parsed,
          providerLabel: `${fallbackResult.providerLabel} (Yedek Devrede)`,
        };
      } catch {
        // Throw original primary error for clarity
      }
    }
    throw primaryErr;
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
): Promise<{ ok: boolean; latencyMs: number; message: string; modelReply?: string }> {
  const saved = getAiProviderSettings();
  const s: AiProviderSettingsRow = { ...saved, ...(overrides || {}) };
  const start = Date.now();

  try {
    if (provider === 'deepseek') {
      if (!s.deepseek_api_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'DeepSeek API Key girilmedi.' };
      }
      // Test with deepseek-chat (guaranteed available on every DeepSeek account) or chosen model
      const testModel = s.deepseek_model.trim() || 'deepseek-chat';
      let usedModel = testModel;
      let reply = '';
      try {
        reply = await callOpenAiCompatibleVisionOrText({
          baseUrl: s.deepseek_base_url || 'https://api.deepseek.com/v1',
          apiKey: s.deepseek_api_key,
          model: testModel,
          systemPrompt: 'Reply concisely.',
          userInstruction: 'Reply with: DEEPSEEK_PONDERA_OK',
          imagesDataUrls: [],
        });
      } catch {
        usedModel = 'deepseek-chat';
        reply = await callOpenAiCompatibleVisionOrText({
          baseUrl: s.deepseek_base_url || 'https://api.deepseek.com/v1',
          apiKey: s.deepseek_api_key,
          model: 'deepseek-chat',
          systemPrompt: 'Reply concisely.',
          userInstruction: 'Reply with: DEEPSEEK_PONDERA_OK',
          imagesDataUrls: [],
        });
      }
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `DeepSeek AI bağlantısı başarılı (${usedModel}).`,
        modelReply: reply.slice(0, 80),
      };
    }

    if (provider === 'deepseek_ocr') {
      if (!s.deepseek_ocr_api_key.trim()) {
        return { ok: false, latencyMs: 0, message: 'DeepSeek-OCR / SiliconFlow API Key girilmedi.' };
      }
      const base = (s.deepseek_ocr_base_url || 'https://api.siliconflow.com/v1').replace(/\/+$/, '');
      const resp = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${s.deepseek_ocr_api_key.trim()}` },
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 160)}`);
      }
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `DeepSeek-OCR / VL2 uç noktası doğrulandı (${s.deepseek_ocr_model}).`,
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
      const reply = await callOpenAiCompatibleVisionOrText({
        baseUrl: s.gemini_base_url || 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: s.gemini_api_key,
        model: s.gemini_model || 'gemini-2.0-flash',
        systemPrompt: 'Reply concisely.',
        userInstruction: 'Reply with: GEMINI_OK',
        imagesDataUrls: [],
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `Google Gemini (${s.gemini_model}) bağlantısı başarılı!`,
        modelReply: reply.slice(0, 80),
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
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: String(err?.message || 'Bağlantı kurulamadı.'),
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

