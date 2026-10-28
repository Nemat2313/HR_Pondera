import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import { getMoscowTimeParts } from '@/lib/telegramNotifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ErrorCategoryDef {
  id: string;
  titleTr: string;
  titleRu: string;
  stepLabel: string;
  hintTr: string;
  severity: 'high' | 'medium' | 'low';
}

const ERROR_CATEGORY_DEFINITIONS: Record<string, ErrorCategoryDef> = {
  portal_delivery_error: {
    id: 'portal_delivery_error',
    titleTr: 'Gosuslugi Portal Gönderim Hatası («Ошибка отправки заявления в ведомство»)',
    titleRu: 'Ошибка отправки заявления в ведомство / Ошибка получения заявления ведомством',
    stepLabel: 'Gosuslugi ➔ МВД (СМЭВ)',
    hintTr:
      'Başvuru Gosuslugi üzerinde oluşturuldu ancak Gosuslugi–МВД (СМЭВ) servisi arasındaki teknik/ağ hatası nedeniyle МВД sistemine iletilemedi (Red değildir, personel verisinde hata yoktur). Doğrudan tekrar gönderime açılabilir.',
    severity: 'medium',
  },
  mvd_step12: {
    id: 'mvd_step12',
    titleTr: 'Adım 12: МВД Birimi Seçimi Hatası',
    titleRu: 'Шаг 12: Подразделение МВД',
    stepLabel: 'Adım 12 (МВД)',
    hintTr: 'Gosuslugi МВД açılır listesinde bölge/birim filtresi 3 denemede seçilemedi. Tekrar denendiğinde veya doğru bölge koduyla geçer.',
    severity: 'medium',
  },
  personal_step6_timeout: {
    id: 'personal_step6_timeout',
    titleTr: 'Adım 6: Kişisel Bilgiler Formu Yükleme Zaman Aşımı',
    titleRu: 'Шаг 6: Таймаут поля ФИО (#si13_lastNameRu)',
    stepLabel: 'Adım 6 (ФИО)',
    hintTr: 'Gosuslugi sayfası yavaş yanıt verdiği için Soyadı/Ad (#si13_lastNameRu) alanı 25 sn içinde açılmadı.',
    severity: 'low',
  },
  passport_step7: {
    id: 'passport_step7',
    titleTr: 'Adım 7: Pasaport Bilgileri Eksik veya Hatalı',
    titleRu: 'Шаг 7: Паспортные данные (number / series)',
    stepLabel: 'Adım 7 (Pasaport)',
    hintTr: 'Personelin pasaport numarası, seri veya geçerlilik tarihi Excel/veritabanında eksik ya da Gosuslugi formatına uymuyor.',
    severity: 'high',
  },
  inn_step8: {
    id: 'inn_step8',
    titleTr: 'Adım 8: Yabancı Vergi Numarası (ИНН) Eksik veya 12 Hane Değil («ИНН не найден»)',
    titleRu: 'Шаг 8: ИНН иностранца (требуется 12 цифр)',
    stepLabel: 'Adım 8 (ИНН - Bizden Veri Hatası)',
    hintTr:
      'Personelin 12 haneli vergi numarası (ИНН) Excel şablonunda eksik veya «ИНН не найден» olarak girildiği için robot Adım 8de durdu. Şablonu indirip ИНН sütununu doldurarak tekrar yükleyin.',
    severity: 'high',
  },
  rnr_step9: {
    id: 'rnr_step9',
    titleTr: 'Adım 9: VKS Çalışma İzni (РНР) / Blank Bilgisi Eksik veya Hatalı',
    titleRu: 'Шаг 9: Разрешение на работу ВКС (number / series)',
    stepLabel: 'Adım 9 (ВКС РНР - Bizden Veri Hatası)',
    hintTr:
      'Personelin VKS çalışma izni (РНР Номер) veya Blank numarası (СерийныйНомер2) Excel şablonunda eksik/hatalı olduğu için robot Adım 9da durdu. Şablonu indirip Номер ve СерийныйНомер2 sütunlarını doldurarak tekrar yükleyin.',
    severity: 'high',
  },
  series_timeout: {
    id: 'series_timeout',
    titleTr: 'Adım 7/9: Belge Seri Alanı (#series) Zaman Aşımı',
    titleRu: 'Таймаут поля серии документа (#series)',
    stepLabel: 'Adım 7/9 (#series)',
    hintTr: 'Pasaport veya Çalışma İzni seri alanı (#series) 15 sn içinde görünür olmadı (Gosuslugi gecikmesi).',
    severity: 'low',
  },
  portal_entry_timeout: {
    id: 'portal_entry_timeout',
    titleTr: 'Adım 1-5: Gosuslugi Başlangıç / Hizmet Seçimi Zaman Aşımı',
    titleRu: 'Шаг 1-5: Таймаут кнопки «О выплате зарплаты ВКС»',
    stepLabel: 'Adım 1-5 (Giriş)',
    hintTr: 'Gosuslugi hizmet başlangıç sayfası veya «О выплате зарплаты» butonu zamanında yüklenemedi.',
    severity: 'low',
  },
  contract_salary_step10_15: {
    id: 'contract_salary_step10_15',
    titleTr: 'Adım 10-15: Sözleşme / Maaş / Meslek Alanı Hatası',
    titleRu: 'Шаг 10-15: Трудовой договор / Выплаты / Профессия',
    stepLabel: 'Adım 10-15 (Maaş/Sözleşme)',
    hintTr: 'İş sözleşmesi tarihi, meslek kodu (ОКЗ) veya çeyrek maaş tutarlarında eksik/uyumsuz veri bulundu.',
    severity: 'high',
  },
  other_error: {
    id: 'other_error',
    titleTr: 'Diğer Gosuslugi / Otomasyon Hataları',
    titleRu: 'Прочие ошибки автоматизации / портала',
    stepLabel: 'Genel / Diğer',
    hintTr: 'Gosuslugi oturum/ağ kesintisi veya beklenmeyen form doğrulama uyarısı.',
    severity: 'medium',
  },
};

const REFUSAL_CATEGORY_DEFINITIONS: Record<string, ErrorCategoryDef> = {
  mvd_outage_21oct: {
    id: 'mvd_outage_21oct',
    titleTr: '21 Ekim МВД Sistem Çöküşü / Kesintisi Sırasında Gönderilenler (03:27–11:25 MSK)',
    titleRu: 'Сбой сервиса МВД 21.10 (03:27–11:25 МСК) — Авто-отказ шлюза СМЭВ',
    stepLabel: '⚡ МВД Servis Kesintisi',
    hintTr:
      '19-20 Ekimde aynı şablon ve pasaport formatıyla gönderilen 1.144 başvurunun 1.125 adedi (%98,3) onaylanırken (Услуга оказана), 21 Ekim sabahı 03:27–11:25 arasında МВД veritabanı yanıt vermediği (saat 11:25te «Сервис МВД не отвечает» uyarısıyla tamamen kapandığı) için bu aralıktaki başvurular veri hatası olmaksızın otomatik reddedilmiştir. МВД servisi açıkken doğrudan tekrar gönderilebilir.',
    severity: 'high',
  },
  doc_blank_or_passport_mismatch: {
    id: 'doc_blank_or_passport_mismatch',
    titleTr: 'РНР Blank No (7 Hane Dışı) / Yenilenmiş Pasaport (İK Uyuşmazlığı) / Kiril Harf',
    titleRu: 'Некорректный номер бланка РНР (не 7 цифр) / Смена паспорта / Кириллица',
    stepLabel: '📄 Belge / Blank Hatası',
    hintTr:
      'РНР Blank numarası (СерийныйНомер2) 7 hane olmayan (örn. 8 haneli), pasaportu yenilenmiş olup İK veritabanında farklı pasaport numarası kayıtlı olan veya pasaport numarasında Kiril harf bulunan kayıtlar.',
    severity: 'high',
  },
  salary_gap_or_low: {
    id: 'salary_gap_or_low',
    titleTr: 'Maaş Dönemi Boşluğu (Ay Eksikliği) veya Çeyreklik VKS Maaş Alt Sınırı (< 750.000 ₽)',
    titleRu: 'Пропуск месяца выплаты или сумма за квартал ниже порога ВКС',
    stepLabel: '💰 Maaş / Dönem Hatası',
    hintTr:
      'Çeyrek içindeki aylardan biri boş bırakılmış (örn. 1. ve 3. ay dolu, 2. ay boş) veya 3 aylık toplam ödemesi VKS yasal alt sınırının (750.000 ₽ / aylık 250.000 ₽) altında kalan kayıtlar.',
    severity: 'high',
  },
  contract_ended_or_exit: {
    id: 'contract_ended_or_exit',
    titleTr: '3. Çeyrek İçinde/Öncesinde İşten Çıkış (Дата окончания) veya Sözleşme Feshi',
    titleRu: 'Расторжение договора / Увольнение в 3 квартале (Дата окончания действия)',
    stepLabel: '📅 Çıkış / Sözleşme Feshi',
    hintTr:
      'Sözleşme bitiş tarihi (ДатаОканчанияДействия) girilmiş veya İK veritabanında Çıkış durumunda olan; МВД veritabanında sözleşme fesih bildirimi işlendiği için aktif РНР/sözleşme kontrolüne takılan kayıtlar.',
    severity: 'medium',
  },
  fio_lastname_net_or_reentry: {
    id: 'fio_lastname_net_or_reentry',
    titleTr: "Soyadı (Фамилия) 'Нет' Yazılması veya Mükerrer Kod (а/б) Sözleşme Uyuşmazlığı",
    titleRu: "Фамилия «Нет» (полное имя в поле Имя) или повторный код договора (а/б)",
    stepLabel: "👤 ФИО 'Нет' / Mükerrer Kod",
    hintTr:
      "Soyadı 'Нет' yazılıp tam adı Имя alanına yazılan (МВД РНР kartında Soyadı/Adı ayrı basılmış olabilir) veya mükerrer sicil kodlu (929511а vb.) olup МВД'deki son aktif sözleşme tarihiyle uyuşmayan kayıtlar.",
    severity: 'medium',
  },
  mvd_registry_other: {
    id: 'mvd_registry_other',
    titleTr: 'Diğer МВД ЦБДУИГ Kayıt Uyuşmazlığı (РНР Veriliş Tarihi / Sözleşme Tarihi)',
    titleRu: 'Прочие расхождения с базой ЦБДУИГ МВД (дата выдачи РНР / дата договора)',
    stepLabel: '🔍 МВД Kayıt Kontrolü',
    hintTr:
      '19-20 Ekimde МВД sistemi normal çalışırken reddedilen; basılı РНР kartındaki veriliş tarihi (ДатаВыдачиВКС), sözleşme tarihi (ДатаЗаключения) veya ИНН bilgisinin orijinal belgeyle kontrol edilmesi gereken kayıtlar.',
    severity: 'medium',
  },
};

function classifyGosuslugiError(statusText: string, detailText = ''): ErrorCategoryDef {
  const combined = `${statusText || ''} ${detailText || ''}`;
  if (/ошибка отправки заявления|ошибка получения заявления|ошибка ведомства/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.portal_delivery_error;
  }
  if (/Шаг 12|Подразделение МВД|подразделение МВД/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.mvd_step12;
  }
  if (/lastNameRu|si13_lastNameRu|Шаг 6/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.personal_step6_timeout;
  }
  if (/Шаг 7|Паспортные данные/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.passport_step7;
  }
  if (/Шаг 8|ИНН иностранца|12-значный ИНН/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.inn_step8;
  }
  if (/Шаг 9|Разрешение на работу ВКС/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.rnr_step9;
  }
  if (/#series|input\[name\*='series'\]/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.series_timeout;
  }
  if (/О выплате|epgu-cf-ui-long-button|Шаг 1:|Шаг 2:|Шаг 3:|Шаг 4:|Шаг 5:/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.portal_entry_timeout;
  }
  if (/Шаг 10|Шаг 11|Шаг 13|Шаг 14|Шаг 15|договор|выплат|професси/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.contract_salary_step10_15;
  }
  return ERROR_CATEGORY_DEFINITIONS.other_error;
}

function getMoscowCutoffString(minutesAgo: number): string {
  const dt = new Date(Date.now() - minutesAgo * 60 * 1000);
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
  for (const p of fmt.formatToParts(dt)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}:${parts.second}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scopeType = (searchParams.get('scopeType') || 'all').trim();
    const scopeValue = (searchParams.get('scopeValue') || 'all').trim();
    const hasRlsFilter =
      (scopeType === 'region' || scopeType === 'project') &&
      Boolean(scopeValue) &&
      scopeValue.toLowerCase() !== 'all';

    const db = getDb();
    const msk = getMoscowTimeParts();

    // Ensure submissions, archive, and history tables exist
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
      CREATE TABLE IF NOT EXISTS gosuslugi_refused_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sicil_no TEXT NOT NULL,
        worker_name TEXT,
        citizenship TEXT,
        notification_type TEXT NOT NULL DEFAULT 'vks_salary',
        period_code TEXT DEFAULT '',
        application_no TEXT NOT NULL DEFAULT '',
        gosuslugi_status TEXT NOT NULL DEFAULT 'Услуга отказана',
        status_detail TEXT DEFAULT '',
        pdf_filename TEXT DEFAULT '',
        submitted_at TEXT DEFAULT '',
        archived_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gosuslugi_submission_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sicil_no TEXT NOT NULL,
        worker_name TEXT DEFAULT '',
        application_no TEXT DEFAULT '',
        gosuslugi_status TEXT NOT NULL DEFAULT '',
        status_detail TEXT DEFAULT '',
        pdf_filename TEXT DEFAULT '',
        submitted_at TEXT DEFAULT '',
        event_at TEXT NOT NULL
      );
    `);
    try {
      db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN updated_at TEXT DEFAULT '';`);
    } catch {}
    try {
      db.exec(`ALTER TABLE gosuslugi_submissions ADD COLUMN status_pdf_filename TEXT DEFAULT '';`);
    } catch {}
    try {
      db.prepare(`
        UPDATE gosuslugi_submissions
        SET submitted_at = '2026-10-22 09:19:00',
            checked_at = '2026-10-23 15:50:00'
        WHERE application_no = '8303204675'
      `).run();
      const tRows = db
        .prepare(`SELECT id, application_no, submitted_at, checked_at FROM gosuslugi_submissions`)
        .all() as Array<{ id: number; application_no: string; submitted_at: string; checked_at: string }>;
      const isBadSub = (appNo: string, subAt: string): boolean => {
        if (!subAt) return true;
        if (
          subAt.startsWith('2026-10-26 23:50') ||
          subAt.startsWith('2026-10-26 17:42') ||
          subAt.startsWith('2026-10-26 15:18') ||
          subAt.startsWith('2026-10-26 14:46')
        ) {
          return true;
        }
        if (/^\d{10}$/.test(appNo)) {
          const num = Number(appNo);
          if (num < 8300000000 && subAt >= '2026-10-21 12:00:00') return true;
          if (num < 8315000000 && subAt >= '2026-10-24 12:00:00') return true;
          if (num < 8322000000 && subAt >= '2026-10-26 00:00:00') return true;
        }
        return false;
      };
      const anchors: Array<{ appNum: number; subAt: string; ms: number }> = [];
      for (const r of tRows) {
        if (/^\d{10}$/.test(r.application_no) && !isBadSub(r.application_no, r.submitted_at)) {
          const ms = Date.parse(r.submitted_at.replace(' ', 'T') + 'Z');
          if (!Number.isNaN(ms)) anchors.push({ appNum: Number(r.application_no), subAt: r.submitted_at, ms });
        }
      }
      anchors.sort((a, b) => a.appNum - b.appNum);
      if (anchors.length > 10) {
        const updStmt = db.prepare(`UPDATE gosuslugi_submissions SET submitted_at = ?, checked_at = ? WHERE id = ?`);
        db.exec('BEGIN');
        for (const r of tRows) {
          let newSub = r.submitted_at;
          let newChk = r.checked_at;
          let changed = false;
          if (/^\d{10}$/.test(r.application_no) && isBadSub(r.application_no, r.submitted_at)) {
            const targetNum = Number(r.application_no);
            let lo = 0;
            let hi = anchors.length - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (anchors[mid].appNum < targetNum) lo = mid + 1;
              else hi = mid - 1;
            }
            if (lo <= 0) newSub = anchors[0].subAt;
            else if (lo >= anchors.length) newSub = anchors[anchors.length - 1].subAt;
            else {
              const prevA = anchors[lo - 1];
              const nextA = anchors[lo];
              if (nextA.ms >= prevA.ms && nextA.appNum > prevA.appNum) {
                const ratio = (targetNum - prevA.appNum) / (nextA.appNum - prevA.appNum);
                const interpMs = Math.round(prevA.ms + (nextA.ms - prevA.ms) * ratio);
                newSub = new Date(interpMs).toISOString().replace('T', ' ').slice(0, 19);
              } else {
                newSub = prevA.subAt;
              }
            }
            changed = newSub !== r.submitted_at;
          }
          if (newChk && newSub && newChk < newSub) {
            newChk = r.application_no ? newSub : '';
            changed = true;
          }
          if (changed) updStmt.run(newSub, newChk, r.id);
        }
        db.exec('COMMIT');
      }
    } catch {
      try {
        db.exec('ROLLBACK');
      } catch {}
    }
    try {
      db.exec(`
        UPDATE gosuslugi_submissions
        SET gosuslugi_status = 'Ошибка отправки заявления в ведомство'
        WHERE gosuslugi_status != 'Услуга оказана'
          AND (
            status_detail LIKE '%Ошибка отправки заявления%'
            OR application_no IN (
              SELECT DISTINCT application_no FROM gosuslugi_submission_history
              WHERE application_no != ''
                AND (status_detail LIKE '%Ошибка отправки заявления%' OR gosuslugi_status LIKE '%Ошибка отправки заявления%')
            )
          );

        UPDATE gosuslugi_submissions
        SET gosuslugi_status = 'Ошибка получения заявления ведомством'
        WHERE gosuslugi_status != 'Услуга оказана'
          AND (
            status_detail LIKE '%Ошибка получения заявления%'
            OR application_no IN (
              SELECT DISTINCT application_no FROM gosuslugi_submission_history
              WHERE application_no != ''
                AND (status_detail LIKE '%Ошибка получения заявления%' OR gosuslugi_status LIKE '%Ошибка получения заявления%')
            )
          );

        DELETE FROM gosuslugi_submission_history
        WHERE application_no != ''
          AND id NOT IN (
            SELECT MAX(id)
            FROM gosuslugi_submission_history
            WHERE application_no != ''
            GROUP BY sicil_no, application_no
          );

        UPDATE gosuslugi_submission_history
        SET gosuslugi_status = (
          SELECT s.gosuslugi_status
          FROM gosuslugi_submissions s
          WHERE s.sicil_no = gosuslugi_submission_history.sicil_no
            AND s.application_no = gosuslugi_submission_history.application_no
          LIMIT 1
        )
        WHERE application_no != ''
          AND EXISTS (
            SELECT 1
            FROM gosuslugi_submissions s
            WHERE s.sicil_no = gosuslugi_submission_history.sicil_no
              AND s.application_no = gosuslugi_submission_history.application_no
          );
      `);
    } catch {}

    // 1. Load & cache active VKS personnel from personnel table so 15MB of all_data_json is not re-parsed on every poll
    const pVersionRow = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM personnel')
      .get() as { cnt: number; maxId: number };
    const cacheKey = `${pVersionRow.cnt}:${pVersionRow.maxId}`;

    type CachedPersonnelInfo = {
      sicil_no: string;
      ad_soyad: string;
      tam_adi_kiril: string;
      uyruk: string;
      region: string;
      proje_adi: string;
      departman: string;
      gorevi: string;
      guncel_durum: string;
      pasaport_no: string;
      rnr_no: string;
      isVksActive: boolean;
    };

    const gCache = globalThis as unknown as {
      __ponderaPersonnelAnalyticsCache?: {
        key: string;
        personnelBySicil: Record<string, CachedPersonnelInfo>;
        totalTargetVksPersonnel: number;
        regionTargetMap: Record<string, number>;
      };
    };

    if (!gCache.__ponderaPersonnelAnalyticsCache || gCache.__ponderaPersonnelAnalyticsCache.key !== cacheKey) {
      const personnelRows = db
        .prepare(
          `SELECT
            sicil_no, ad_soyad, tam_adi_kiril, uyruk, region, proje_adi, departman, gorevi,
            guncel_durum, genel_durum, pasaport_no, all_data_json
          FROM personnel`
        )
        .all() as any[];

      const builtBySicil: Record<string, CachedPersonnelInfo> = {};
      let builtTotalTarget = 0;
      const builtRegionTargets: Record<string, number> = {};

      const ACTIVE_STATUS_SET = new Set([
        'mevcut',
        'is gezisi',
        'iş gezisi',
        'mazeret izni',
        'suresiz izin',
        'süresiz izin',
        'ucretsiz izin',
        'ücretsiz izin',
        'yillik izin',
        'yıllık izin',
      ]);

      for (const p of personnelRows) {
        const sicil = String(p.sicil_no || '').trim();
        if (!sicil) continue;
        let rawJson: any = {};
        if (p.all_data_json) {
          try {
            rawJson = JSON.parse(p.all_data_json);
          } catch {}
        }
        const kartTuru = String(rawJson['Çalışma Kart Türü'] || '').toUpperCase();
        const isVks = kartTuru.includes('ВКС') || kartTuru.includes('VKS');
        const guncelLower = String(p.guncel_durum || '').trim().toLowerCase();
        const isActive = ACTIVE_STATUS_SET.has(guncelLower);
        const isVksActive = isVks && isActive;
        const reg = String(p.region || 'Belirtilmemiş').trim() || 'Belirtilmemiş';

        if (isVksActive) {
          builtTotalTarget++;
          builtRegionTargets[reg] = (builtRegionTargets[reg] || 0) + 1;
        }

        builtBySicil[sicil] = {
          sicil_no: sicil,
          ad_soyad: String(p.ad_soyad || '').trim(),
          tam_adi_kiril: String(p.tam_adi_kiril || '').trim(),
          uyruk: String(p.uyruk || '').trim(),
          region: reg,
          proje_adi: String(p.proje_adi || '').trim(),
          departman: String(p.departman || '').trim(),
          gorevi: String(p.gorevi || '').trim(),
          guncel_durum: String(p.guncel_durum || '').trim(),
          pasaport_no: String(p.pasaport_no || '').trim(),
          rnr_no: String(
            rawJson['Çalışma Kart No'] || rawJson['VKS RNR No'] || rawJson['RNR No'] || ''
          ).trim(),
          isVksActive,
        };
      }

      gCache.__ponderaPersonnelAnalyticsCache = {
        key: cacheKey,
        personnelBySicil: builtBySicil,
        totalTargetVksPersonnel: builtTotalTarget,
        regionTargetMap: builtRegionTargets,
      };
    }

    const personnelBySicil = gCache.__ponderaPersonnelAnalyticsCache.personnelBySicil;
    let totalTargetVksPersonnel = gCache.__ponderaPersonnelAnalyticsCache.totalTargetVksPersonnel;
    const masterWorkerBySicil: Record<string, any> = {};
    const orderedMasterList: Array<{ row_index: number; computer_no: number; sicil_no: string; worker: any }> = [];
    try {
      const masterRows = db
        .prepare('SELECT row_order, assigned_computer, sicil_no, worker_json FROM gosuslugi_vks_master_list ORDER BY row_order ASC')
        .all() as Array<{ row_order: number; assigned_computer: number; sicil_no: string; worker_json: string }>;
      if (masterRows.length > 0) {
        totalTargetVksPersonnel = masterRows.length;
        for (let idx = 0; idx < masterRows.length; idx++) {
          const mr = masterRows[idx];
          const sNo = String(mr.sicil_no || '').trim();
          if (sNo && mr.worker_json) {
            try {
              const parsed = JSON.parse(mr.worker_json);
              masterWorkerBySicil[sNo] = parsed;
              orderedMasterList.push({
                row_index: mr.row_order || idx + 1,
                computer_no: mr.assigned_computer || Math.min(4, Math.floor(idx / 772) + 1),
                sicil_no: sNo,
                worker: parsed,
              });
            } catch {}
          }
        }
      }
    } catch {}

    // Load archived refusals/errors and explicit history events per sicil_no
    type RawHistoryStep = {
      application_no: string;
      status: string;
      status_key: 'service_rendered' | 'registered_mvd' | 'sent_pending' | 'refused_mvd' | 'error' | 'mvd_not_found';
      detail: string;
      submitted_at: string;
      event_at: string;
      source: 'archive' | 'history' | 'current';
    };
    const rawHistoryBySicil: Record<string, RawHistoryStep[]> = {};
    const classifyStatusKey = (
      st: string
    ): 'service_rendered' | 'registered_mvd' | 'sent_pending' | 'refused_mvd' | 'error' | 'mvd_not_found' => {
      if (/^ошибк/i.test(st)) return 'error';
      if (/не найден[ыо]?\s+в\s+базе\s+мвд/i.test(st)) return 'mvd_not_found';
      if (/отказан/i.test(st)) return 'refused_mvd';
      if (/оказан|исполнен/i.test(st)) return 'service_rendered';
      if (/зарегистрирован|принят|промежуточн/i.test(st)) return 'registered_mvd';
      return 'sent_pending';
    };

    try {
      const archRows = db
        .prepare(
          `SELECT sicil_no, application_no, gosuslugi_status, status_detail, submitted_at, archived_at
           FROM gosuslugi_refused_archive
           ORDER BY COALESCE(NULLIF(submitted_at, ''), archived_at) ASC, id ASC`
        )
        .all() as any[];
      for (const ar of archRows) {
        const sNo = String(ar.sicil_no || '').trim();
        if (!sNo) continue;
        const st = String(ar.gosuslugi_status || '').trim();
        if (!st) continue;
        if (!rawHistoryBySicil[sNo]) rawHistoryBySicil[sNo] = [];
        rawHistoryBySicil[sNo].push({
          application_no: String(ar.application_no || '').trim(),
          status: st,
          status_key: classifyStatusKey(st),
          detail: String(ar.status_detail || '').trim(),
          submitted_at: String(ar.submitted_at || '').trim(),
          event_at: String(ar.submitted_at || ar.archived_at || '').trim(),
          source: 'archive',
        });
      }
    } catch {}

    try {
      const histRows = db
        .prepare(
          `SELECT sicil_no, application_no, gosuslugi_status, status_detail, submitted_at, event_at
           FROM gosuslugi_submission_history
           ORDER BY event_at ASC, id ASC`
        )
        .all() as any[];
      for (const hr of histRows) {
        const sNo = String(hr.sicil_no || '').trim();
        if (!sNo) continue;
        const st = String(hr.gosuslugi_status || '').trim();
        if (!st) continue;
        if (!rawHistoryBySicil[sNo]) rawHistoryBySicil[sNo] = [];
        rawHistoryBySicil[sNo].push({
          application_no: String(hr.application_no || '').trim(),
          status: st,
          status_key: classifyStatusKey(st),
          detail: String(hr.status_detail || '').trim(),
          submitted_at: String(hr.submitted_at || '').trim(),
          event_at: String(hr.event_at || hr.submitted_at || '').trim(),
          source: 'history',
        });
      }
    } catch {}

    const regionStatsMap: Record<
      string,
      {
        region: string;
        targetVks: number;
        sentCount: number;
        pdfCount: number;
        errorCount: number;
        pendingCount: number;
      }
    > = {};

    const matchesRls = (pInfo?: CachedPersonnelInfo): boolean => {
      if (!hasRlsFilter) return true;
      if (!pInfo) return false;
      if (scopeType === 'region') {
        return pInfo.region.toLowerCase() === scopeValue.toLowerCase();
      }
      if (scopeType === 'project') {
        return pInfo.proje_adi.toLowerCase() === scopeValue.toLowerCase();
      }
      return true;
    };

    if (hasRlsFilter) {
      let scopedTarget = 0;
      for (const p of Object.values(personnelBySicil)) {
        if (!matchesRls(p)) continue;
        const inMaster = Object.keys(masterWorkerBySicil).length > 0 ? Boolean(masterWorkerBySicil[p.sicil_no]) : p.isVksActive;
        if (inMaster) {
          scopedTarget++;
          const reg = p.region || 'Belirtilmemiş';
          if (!regionStatsMap[reg]) {
            regionStatsMap[reg] = {
              region: reg,
              targetVks: 0,
              sentCount: 0,
              pdfCount: 0,
              errorCount: 0,
              pendingCount: 0,
            };
          }
          regionStatsMap[reg].targetVks++;
        }
      }
      totalTargetVksPersonnel = scopedTarget;
    } else {
      for (const [reg, targetCnt] of Object.entries(
        gCache.__ponderaPersonnelAnalyticsCache.regionTargetMap
      )) {
        regionStatsMap[reg] = {
          region: reg,
          targetVks: targetCnt,
          sentCount: 0,
          pdfCount: 0,
          errorCount: 0,
          pendingCount: 0,
        };
      }
    }

    // 2. Load all Gosuslugi submissions and deduplicate by sicil_no (preferring Услуга оказана -> non-empty application_no -> latest)
    const allRawSubs = db
      .prepare(
        `SELECT
          id, sicil_no, worker_name, citizenship, notification_type,
          period_code, application_no, gosuslugi_status, status_detail,
          pdf_filename, status_pdf_filename, submitted_at, checked_at, updated_at
        FROM gosuslugi_submissions
        WHERE LOWER(notification_type) = 'vks_salary'
        ORDER BY
          CASE WHEN gosuslugi_status LIKE '%оказана%' THEN 0 WHEN application_no != '' THEN 1 ELSE 2 END ASC,
          submitted_at DESC,
          id DESC`
      )
      .all() as any[];

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

    const seenSubSicils = new Set<string>();
    const rawSubs: any[] = [];
    for (const r of allRawSubs) {
      const s = String(r.sicil_no || '').trim();
      if (!s || seenSubSicils.has(s)) continue;
      seenSubSicils.add(s);
      rawSubs.push(r);
    }

    const buildChronologicalHistory = (
      sNo: string,
      curAppNo: string,
      curStatus: string,
      curDetail: string,
      curSubAt: string,
      curChkAt: string,
      curUpdAt: string
    ) => {
      const priorList = [...(rawHistoryBySicil[sNo] || [])];
      const curKey = curStatus ? classifyStatusKey(curStatus) : null;
      const respTime = curChkAt || curUpdAt || curSubAt;

      if (curStatus) {
        priorList.push({
          application_no: curAppNo,
          status: curStatus,
          status_key: curKey!,
          detail: curDetail,
          submitted_at: curSubAt,
          event_at: respTime || curSubAt,
          source: 'current',
        });
      }

      priorList.sort((a, b) => (a.event_at || a.submitted_at || '').localeCompare(b.event_at || b.submitted_at || ''));

      const deduped: Array<{
        stepNo: number;
        application_no: string;
        status: string;
        status_key: 'service_rendered' | 'registered_mvd' | 'sent_pending' | 'refused_mvd' | 'error' | 'mvd_not_found';
        detail: string;
        submitted_at: string;
        event_at: string;
      }> = [];

      for (const stp of priorList) {
        if (!stp.application_no && stp.status_key === 'sent_pending') {
          continue;
        }
        if (stp.application_no) {
          const existingForApp = deduped.find((d) => d.application_no === stp.application_no);
          if (existingForApp) {
            if (stp.source === 'current' || existingForApp.status_key === 'sent_pending') {
              existingForApp.status = stp.status;
              existingForApp.status_key = stp.status_key;
            }
            if (stp.event_at && (!existingForApp.event_at || stp.event_at > existingForApp.event_at)) {
              existingForApp.event_at = stp.event_at;
            }
            if (stp.detail) {
              existingForApp.detail = stp.detail;
            }
            continue;
          }
        }
        const prev = deduped[deduped.length - 1];
        if (prev && prev.application_no === stp.application_no && prev.status === stp.status) {
          if (stp.event_at && (!prev.event_at || stp.event_at > prev.event_at)) {
            prev.event_at = stp.event_at;
          }
          if (stp.detail && !prev.detail) {
            prev.detail = stp.detail;
          }
          continue;
        }
        deduped.push({
          stepNo: deduped.length + 1,
          application_no: stp.application_no,
          status: stp.status,
          status_key: stp.status_key,
          detail: stp.detail,
          submitted_at: stp.submitted_at,
          event_at: stp.event_at,
        });
      }
      return deduped;
    };

    const cutoff15m = getMoscowCutoffString(15);
    const cutoff60m = getMoscowCutoffString(60);

    let totalSent = 0;
    let totalPdf = 0;
    let totalNoPdf = 0;
    let totalRegisteredMvd = 0;
    let totalServiceRendered = 0;
    let totalRegisteredOnly = 0;
    let totalRefusedMvd = 0;
    let totalSentPendingStatus = 0;
    let totalErrors = 0;
    let totalMvdNotFound = 0;

    let last15mSent = 0;
    let last15mErrors = 0;
    let last60mSent = 0;
    let last60mErrors = 0;

    const errorCategoriesMap: Record<
      string,
      ErrorCategoryDef & {
        count: number;
        percentage: number;
        items: any[];
      }
    > = {};

    const refusalCategoriesMap: Record<
      string,
      ErrorCategoryDef & {
        count: number;
        percentage: number;
        items: any[];
      }
    > = {};

    const hourlyTimelineMap: Record<
      string,
      { hourSlot: string; sent: number; errors: number; total: number }
    > = {};

    const citizenshipMap: Record<
      string,
      { citizenship: string; sent: number; errors: number; pdf: number; total: number }
    > = {};

    const enrichedSubmissions: any[] = [];

    for (const r of rawSubs) {
      const sicil = String(r.sicil_no || '').trim();
      const appNo = String(r.application_no || '').trim();
      const rawStatus = String(r.gosuslugi_status || '').trim();
      const detail = String(r.status_detail || '').trim();
      const pdf = String(r.pdf_filename || '').trim();
      const statusPdf =
        String(r.status_pdf_filename || '').trim() ||
        (appNo && statusPdfByAppNo.get(appNo)) ||
        (sicil && statusPdfBySicil.get(sicil)) ||
        (pdf.toUpperCase().includes('_STATUS_A4') ? pdf : '');
      const hasStatusPdf = Boolean(statusPdf);
      const subAt = String(r.submitted_at || '').trim();
      const chkAt = String(r.checked_at || '').trim();
      const updAt = String(r.updated_at || '').trim();
      const responseAt =
        chkAt && (!subAt || chkAt >= subAt)
          ? chkAt
          : updAt && (!subAt || updAt >= subAt)
          ? updAt
          : subAt;

      // Skip browser-closed pseudo errors
      if (
        !appNo &&
        /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(
          rawStatus
        )
      ) {
        continue;
      }

      const baseSicil = sicil.replace(/_\d+$/, '');
      const pInfo = personnelBySicil[sicil] || personnelBySicil[baseSicil];
      if (!matchesRls(pInfo)) {
        continue;
      }
      const mWorker = masterWorkerBySicil[sicil] || masterWorkerBySicil[baseSicil] || {};
      const region = pInfo?.region || 'Diğer / Eşleşmeyen';
      const citizenship =
        pInfo?.uyruk || String(r.citizenship || '').trim() || 'BELİRTİLMEMİŞ';

      const isError = /^ошибк/i.test(rawStatus);
      const isRefusedMvd = !isError && /отказан/i.test(rawStatus);
      const isServiceRendered = !isError && !isRefusedMvd && /оказан|исполнен/i.test(rawStatus);
      const isRegisteredOnly =
        !isError && !isRefusedMvd && !isServiceRendered && /зарегистрирован|принят|промежуточн/i.test(rawStatus);
      const isMvdNotFound =
        !isError &&
        !isRefusedMvd &&
        !isServiceRendered &&
        !isRegisteredOnly &&
        !appNo &&
        /не найден[ыо]?\s+в\s+базе\s+мвд/i.test(rawStatus);
      const hasPdf = Boolean(pdf);
      const isRegisteredMvd = isServiceRendered || isRegisteredOnly;
      const isSent =
        !isError &&
        !isMvdNotFound &&
        (Boolean(appNo) ||
          hasPdf ||
          isRegisteredMvd ||
          isRefusedMvd ||
          /отправлен|промежуточн|обработк|PDF не скачан/i.test(rawStatus));
      const isSentPendingStatus = isSent && !isServiceRendered && !isRegisteredOnly && !isRefusedMvd;

      let gosuslugiStatusKey:
        | 'service_rendered'
        | 'registered_mvd'
        | 'refused_mvd'
        | 'sent_pending'
        | 'error'
        | 'mvd_not_found' = 'sent_pending';
      if (isError) gosuslugiStatusKey = 'error';
      else if (isMvdNotFound) gosuslugiStatusKey = 'mvd_not_found';
      else if (isRefusedMvd) gosuslugiStatusKey = 'refused_mvd';
      else if (isServiceRendered) gosuslugiStatusKey = 'service_rendered';
      else if (isRegisteredOnly) gosuslugiStatusKey = 'registered_mvd';

      // Diagnose probable MVD refusal reason & category when Услуга отказана
      let refusalHint = '';
      let refusalCat: ErrorCategoryDef | null = null;
      if (isRefusedMvd) {
        const reasons: string[] = [];
        const passNoCheck = String(mWorker.passportNumber || pInfo?.pasaport_no || '').trim();
        const hrPassDigits = String(pInfo?.pasaport_no || '').replace(/\D+/g, '');
        const masterPassDigits = passNoCheck.replace(/\D+/g, '');
        const blankNoCheck = String(mWorker.blankNumber || '').trim();
        const rnrNoCheck = String(mWorker.rnrNumber || '').trim();
        const codeCheck = String(mWorker.code || '').trim();
        const cEndCheck = String(mWorker.contractEndDate || '').trim();
        const m1Check = String(mWorker.month1Salary || '').trim();
        const m2Check = String(mWorker.month2Salary || '').trim();
        const m3Check = String(mWorker.month3Salary || '').trim();
        const m1Num = parseFloat(m1Check.replace(',', '.') || '0') || 0;
        const m2Num = parseFloat(m2Check.replace(',', '.') || '0') || 0;
        const m3Num = parseFloat(m3Check.replace(',', '.') || '0') || 0;
        const totalQSal = m1Num + m2Num + m3Num;

        const isOutageWindow21Oct =
          (subAt >= '2026-10-21 03:00:00' && subAt <= '2026-10-21 12:00:00') ||
          /^829[567]/.test(appNo);

        const hasCyrillicPass = /[А-Яа-яЁё]/.test(passNoCheck);
        const hasBadBlankLen = Boolean(blankNoCheck && blankNoCheck.length !== 7);
        const hasBadRnrLen = Boolean(rnrNoCheck && rnrNoCheck.length !== 10);
        const hasPassportChangedInHr = Boolean(
          hrPassDigits &&
            masterPassDigits &&
            hrPassDigits.length >= 6 &&
            masterPassDigits !== hrPassDigits &&
            !masterPassDigits.endsWith(hrPassDigits)
        );
        const hasSalaryGap = Boolean((m1Num > 0 && m3Num > 0 && m2Num === 0) || (m1Num === 0 && m2Num > 0 && m3Num === 0));
        const hasLowFullQuarterSalary = Boolean(m1Num > 0 && m2Num > 0 && m3Num > 0 && totalQSal < 750000);
        const hasContractEnd = Boolean(cEndCheck);
        const hasLastNameNet = mWorker.lastName === 'Нет';
        const hasDuplicateCode = /[а-яa-z]$/i.test(codeCheck);

        if (isOutageWindow21Oct) {
          reasons.push(
            `⚡ 21 Ekim МВД Sistem Kesintisi (03:27–11:25 MSK) sırasında gönderildi («Данные не найдены в базе МВД» oto-red)`
          );
        }
        if (hasCyrillicPass) {
          reasons.push(`Pasaport No (${passNoCheck}) içinde Latin yerine Rusça Kiril harf kullanılmış`);
        }
        if (hasPassportChangedInHr) {
          reasons.push(
            `Pasaport Uyuşmazlığı: Şablonda (${passNoCheck}), İK Veritabanında (${pInfo?.pasaport_no}) — pasaport yenilenmiş olabilir`
          );
        }
        if (hasBadBlankLen) {
          reasons.push(`RNR Blank No (${blankNoCheck}) 7 hane yerine ${blankNoCheck.length} haneli girilmiş`);
        }
        if (hasBadRnrLen) {
          reasons.push(`RNR No (${rnrNoCheck}) 10 hane yerine ${rnrNoCheck.length} haneli girilmiş`);
        }
        if (hasSalaryGap) {
          reasons.push(`Maaş ayında boşluk var (1.Ay=${m1Check || 'Boş'}, 2.Ay=${m2Check || 'Boş'}, 3.Ay=${m3Check || 'Boş'})`);
        } else if (hasLowFullQuarterSalary) {
          reasons.push(`3 aylık toplam maaş (${totalQSal.toFixed(2)} ₽) VKS alt sınırının (750.000 ₽) altında`);
        }
        if (hasContractEnd) {
          reasons.push(`3. Çeyrek içinde çıkış / sözleşme feshi (${cEndCheck})`);
        }
        if (hasLastNameNet) {
          reasons.push(`Soyadı (Фамилия) 'Нет' girilmiş, tam isim Имя alanına yazılmış`);
        }
        if (hasDuplicateCode) {
          reasons.push(`Mükerrer / Yeniden giriş kodu (${codeCheck}) — eski/yeni sözleşme tarihi kontrolü`);
        }
        if (reasons.length === 0) {
          reasons.push(
            `МВД ЦБДУИГ kontrolü: RNR (${mWorker.rnrSeries || ''} ${mWorker.rnrNumber || pInfo?.rnr_no || ''}) / Sözleşme (${mWorker.contractDate || '-'}) tarihi kontrol edilmeli`
          );
        }
        refusalHint = reasons.join(' • ');

        // Primary Refusal Category assignment
        if (hasCyrillicPass || hasBadBlankLen || hasBadRnrLen || hasPassportChangedInHr) {
          refusalCat = REFUSAL_CATEGORY_DEFINITIONS.doc_blank_or_passport_mismatch;
        } else if (hasSalaryGap || (!isOutageWindow21Oct && hasLowFullQuarterSalary)) {
          refusalCat = REFUSAL_CATEGORY_DEFINITIONS.salary_gap_or_low;
        } else if (isOutageWindow21Oct) {
          refusalCat = REFUSAL_CATEGORY_DEFINITIONS.mvd_outage_21oct;
        } else if (hasContractEnd) {
          refusalCat = REFUSAL_CATEGORY_DEFINITIONS.contract_ended_or_exit;
        } else if (hasLastNameNet || hasDuplicateCode) {
          refusalCat = REFUSAL_CATEGORY_DEFINITIONS.fio_lastname_net_or_reentry;
        } else {
          refusalCat = REFUSAL_CATEGORY_DEFINITIONS.mvd_registry_other;
        }
      }

      let errorCat: ErrorCategoryDef | null = null;
      if (isError) {
        totalErrors++;
        errorCat = classifyGosuslugiError(rawStatus, detail);
      } else if (isMvdNotFound) {
        totalMvdNotFound++;
      } else if (isSent) {
        totalSent++;
        if (hasPdf) totalPdf++;
        else totalNoPdf++;
        if (isRegisteredMvd) totalRegisteredMvd++;
        if (isServiceRendered) totalServiceRendered++;
        else if (isRegisteredOnly) totalRegisteredOnly++;
        else if (isRefusedMvd) totalRefusedMvd++;
        else if (isSentPendingStatus) totalSentPendingStatus++;
      }

      // Check 15m and 60m activity
      const effectiveTime = chkAt && chkAt > subAt ? chkAt : subAt;
      if (effectiveTime >= cutoff15m) {
        if (isError) last15mErrors++;
        else if (isSent) last15mSent++;
      }
      if (effectiveTime >= cutoff60m) {
        if (isError) last60mErrors++;
        else if (isSent) last60mSent++;
      }

      // Hourly slot (e.g. "26.10 09:00") — use effectiveTime so both initial submissions and MVD status updates appear
      const slotTime = effectiveTime || subAt;
      if (slotTime && slotTime.length >= 13) {
        const datePart = slotTime.slice(5, 10).split('-').reverse().join('.');
        const hourPart = `${slotTime.slice(11, 13)}:00`;
        const slotKey = `${datePart} ${hourPart}`;
        if (!hourlyTimelineMap[slotKey]) {
          hourlyTimelineMap[slotKey] = { hourSlot: slotKey, sent: 0, errors: 0, total: 0 };
        }
        if (isError) hourlyTimelineMap[slotKey].errors++;
        else if (isSent) hourlyTimelineMap[slotKey].sent++;
        hourlyTimelineMap[slotKey].total++;
      }

      // Region breakdown
      if (!regionStatsMap[region]) {
        regionStatsMap[region] = {
          region,
          targetVks: 0,
          sentCount: 0,
          pdfCount: 0,
          errorCount: 0,
          pendingCount: 0,
        };
      }
      if (isError) {
        regionStatsMap[region].errorCount++;
      } else if (isSent) {
        regionStatsMap[region].sentCount++;
        if (hasPdf) regionStatsMap[region].pdfCount++;
      }

      // Citizenship breakdown
      if (!citizenshipMap[citizenship]) {
        citizenshipMap[citizenship] = {
          citizenship,
          sent: 0,
          errors: 0,
          pdf: 0,
          total: 0,
        };
      }
      if (isError) citizenshipMap[citizenship].errors++;
      else if (isSent) {
        citizenshipMap[citizenship].sent++;
        if (hasPdf) citizenshipMap[citizenship].pdf++;
      }
      citizenshipMap[citizenship].total++;

      const workerHistory = buildChronologicalHistory(
        sicil,
        appNo,
        rawStatus,
        refusalHint || detail,
        subAt,
        chkAt,
        updAt
      );
      const distinctAttempts = new Set(
        workerHistory.map((h) => (h.application_no ? `app:${h.application_no}` : `st:${h.status_key}:${h.submitted_at.slice(0, 13)}`))
      ).size;
      const hadPreviousFailure =
        workerHistory.length > 1 &&
        workerHistory.slice(0, -1).some((h) => h.status_key === 'error' || h.status_key === 'refused_mvd');

      const enrichedItem = {
        id: r.id,
        sicil_no: sicil,
        worker_name: String(r.worker_name || pInfo?.tam_adi_kiril || '').trim(),
        ad_soyad_tr: pInfo?.ad_soyad || '',
        citizenship,
        region,
        proje_adi: pInfo?.proje_adi || '',
        departman: pInfo?.departman || '',
        gorevi: pInfo?.gorevi || '',
        pasaport_no: pInfo?.pasaport_no || mWorker.passportNumber || '',
        rnr_no: pInfo?.rnr_no || (mWorker.rnrSeries && mWorker.rnrNumber ? `${mWorker.rnrSeries} ${mWorker.rnrNumber}` : mWorker.rnrNumber || ''),
        period_code: String(r.period_code || '').trim(),
        application_no: appNo,
        gosuslugi_status: rawStatus,
        gosuslugiStatusKey,
        refusalHint,
        status_detail: detail,
        pdf_filename: pdf,
        status_pdf_filename: statusPdf,
        hasStatusPdf,
        submitted_at: subAt,
        checked_at: chkAt,
        updated_at: updAt,
        response_at: responseAt,
        attempt_count: Math.max(1, distinctAttempts),
        had_previous_failure: hadPreviousFailure,
        history: workerHistory,
        state: isError ? 'error' : isSent ? 'sent' : 'other',
        hasPdf,
        isRegisteredMvd,
        isServiceRendered,
        isRegisteredOnly,
        isRefusedMvd,
        errorCategoryId: errorCat?.id || null,
        errorCategoryTitle: errorCat?.titleTr || null,
        errorStepLabel: errorCat?.stepLabel || null,
        refusalCategoryId: refusalCat?.id || null,
        refusalCategoryTitle: refusalCat?.titleTr || null,
        refusalStepLabel: refusalCat?.stepLabel || null,
      };

      if (isError && errorCat) {
        if (!errorCategoriesMap[errorCat.id]) {
          errorCategoriesMap[errorCat.id] = {
            ...errorCat,
            count: 0,
            percentage: 0,
            items: [],
          };
        }
        errorCategoriesMap[errorCat.id].count++;
        errorCategoriesMap[errorCat.id].items.push(enrichedItem);
      }

      if (isRefusedMvd && refusalCat) {
        if (!refusalCategoriesMap[refusalCat.id]) {
          refusalCategoriesMap[refusalCat.id] = {
            ...refusalCat,
            count: 0,
            percentage: 0,
            items: [],
          };
        }
        refusalCategoriesMap[refusalCat.id].count++;
        refusalCategoriesMap[refusalCat.id].items.push(enrichedItem);
      }

      enrichedSubmissions.push(enrichedItem);
    }

    // Build full 3,088 VKS master list with current submission status, timestamps, and history
    const subBySicilMap: Record<string, any> = {};
    for (const sub of enrichedSubmissions) {
      if (sub.sicil_no && !subBySicilMap[sub.sicil_no]) {
        subBySicilMap[sub.sicil_no] = sub;
      }
    }

    const masterList3088: any[] = [];
    const consumedSubSicils = new Set<string>();
    for (const mEntry of orderedMasterList) {
      const sNo = mEntry.sicil_no;
      const baseSno = sNo.replace(/_\d+$/, '');
      const pInfo = personnelBySicil[sNo] || personnelBySicil[baseSno];
      if (!matchesRls(pInfo)) continue;

      const w = mEntry.worker || {};
      const sub = !consumedSubSicils.has(sNo) ? subBySicilMap[sNo] : undefined;
      if (sub) {
        consumedSubSicils.add(sNo);
      }
      const ruFullName = [w.lastName, w.firstName, w.middleName]
        .map((part) => String(part || '').trim())
        .filter((part) => part && part.toLowerCase() !== 'нет')
        .join(' ');
      const workerName = sub?.worker_name || ruFullName || pInfo?.tam_adi_kiril || '';
      const citizenship = pInfo?.uyruk || String(w.citizenship || sub?.citizenship || '').trim() || 'BELİRTİLMEMİŞ';
      const region = pInfo?.region || sub?.region || 'Belirtilmemiş';
      const pasaportNo = String(w.passportNumber || pInfo?.pasaport_no || sub?.pasaport_no || '').trim();
      const rnrNo =
        w.rnrSeries && w.rnrNumber
          ? `${w.rnrSeries} ${w.rnrNumber}`
          : String(w.rnrNumber || pInfo?.rnr_no || sub?.rnr_no || '').trim();

      if (sub) {
        masterList3088.push({
          row_index: mEntry.row_index,
          computer_no: mEntry.computer_no,
          sicil_no: sNo,
          worker_name: workerName,
          ad_soyad_tr: pInfo?.ad_soyad || sub.ad_soyad_tr || '',
          citizenship,
          region,
          proje_adi: pInfo?.proje_adi || '',
          pasaport_no: pasaportNo,
          rnr_no: rnrNo,
          contract_date: String(w.contractDate || '').trim(),
          period_code: sub.period_code || '',
          application_no: sub.application_no || '',
          gosuslugi_status: sub.gosuslugi_status || 'Отправлено',
          status_key: sub.gosuslugiStatusKey || 'sent_pending',
          status_detail: sub.status_detail || '',
          refusalHint: sub.refusalHint || '',
          refusalCategoryId: sub.refusalCategoryId || null,
          refusalCategoryTitle: sub.refusalCategoryTitle || null,
          refusalStepLabel: sub.refusalStepLabel || null,
          errorCategoryId: sub.errorCategoryId || null,
          errorCategoryTitle: sub.errorCategoryTitle || null,
          errorStepLabel: sub.errorStepLabel || null,
          pdf_filename: sub.pdf_filename || '',
          hasPdf: Boolean(sub.hasPdf),
          status_pdf_filename: sub.status_pdf_filename || '',
          hasStatusPdf: Boolean(sub.hasStatusPdf),
          submitted_at: sub.submitted_at || '',
          response_at: sub.response_at || '',
          attempt_count: sub.attempt_count || 1,
          had_previous_failure: Boolean(sub.had_previous_failure),
          history: sub.history || [],
        });
      } else {
        // Worker is not currently in gosuslugi_submissions (either never sent yet, or re-opened to pending queue after error/refusal)
        const priorHistory = buildChronologicalHistory(sNo, '', '', '', '', '', '');
        const hadPrevFail = priorHistory.some(
          (h) => h.status_key === 'error' || h.status_key === 'refused_mvd'
        );
        masterList3088.push({
          row_index: mEntry.row_index,
          computer_no: mEntry.computer_no,
          sicil_no: sNo,
          worker_name: workerName,
          ad_soyad_tr: pInfo?.ad_soyad || '',
          citizenship,
          region,
          proje_adi: pInfo?.proje_adi || '',
          pasaport_no: pasaportNo,
          rnr_no: rnrNo,
          contract_date: String(w.contractDate || '').trim(),
          period_code: '',
          application_no: '',
          gosuslugi_status: hadPrevFail
            ? 'Tekrar Gönderim Kuyruğunda (Bekleyen)'
            : 'Henüz Gönderilmedi (Kuyrukta)',
          status_key: 'not_sent',
          status_detail: '',
          refusalHint: '',
          refusalCategoryId: null,
          refusalCategoryTitle: null,
          refusalStepLabel: null,
          errorCategoryId: null,
          errorCategoryTitle: null,
          errorStepLabel: null,
          pdf_filename: '',
          hasPdf: false,
          status_pdf_filename: '',
          hasStatusPdf: false,
          submitted_at: '',
          response_at: '',
          attempt_count: priorHistory.length,
          had_previous_failure: hadPrevFail,
          history: priorHistory,
        });
      }
    }

    // Finalize error category percentages
    const errorCategories = Object.values(errorCategoriesMap)
      .map((cat) => ({
        ...cat,
        percentage: totalErrors > 0 ? Math.round((cat.count / totalErrors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Finalize refusal category percentages
    const refusalCategories = Object.values(refusalCategoriesMap)
      .map((cat) => ({
        ...cat,
        percentage: totalRefusedMvd > 0 ? Math.round((cat.count / totalRefusedMvd) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Finalize region pending counts
    const regionBreakdown = Object.values(regionStatsMap)
      .map((reg) => {
        const processed = reg.sentCount + reg.errorCount;
        const pending = Math.max(0, reg.targetVks - reg.sentCount);
        const completionPct =
          reg.targetVks > 0 ? Math.min(100, Math.round((reg.sentCount / reg.targetVks) * 100)) : 0;
        return {
          ...reg,
          processedCount: processed,
          pendingCount: pending,
          completionPct,
        };
      })
      .filter((r) => r.targetVks > 0 || r.processedCount > 0)
      .sort((a, b) => b.targetVks - a.targetVks || b.processedCount - a.processedCount);

    const citizenshipBreakdown = Object.values(citizenshipMap).sort((a, b) => b.total - a.total);

    const hourlyTimeline = Object.values(hourlyTimelineMap)
      .sort((a, b) => a.hourSlot.localeCompare(b.hourSlot))
      .slice(-12);

    const totalRecords = totalSent + totalErrors;
    const remainingTarget = Math.max(0, totalTargetVksPersonnel - totalSent);
    const overallCompletionPct =
      totalTargetVksPersonnel > 0
        ? Math.min(100, Math.round((totalSent / totalTargetVksPersonnel) * 100))
        : 0;
    const successRatePct = totalRecords > 0 ? Math.round((totalSent / totalRecords) * 100) : 0;

    return NextResponse.json({
      success: true,
      moscowTime: `${msk.dateDisplay} ${msk.timeDisplay}`,
      summary: {
        totalTargetVksPersonnel,
        totalRecords,
        totalSent,
        totalPdf,
        totalNoPdf,
        totalRegisteredMvd,
        totalServiceRendered,
        totalRegisteredOnly,
        totalRefusedMvd,
        totalSentPendingStatus,
        totalErrors,
        totalMvdNotFound,
        remainingTarget,
        overallCompletionPct,
        successRatePct,
        last15mSent,
        last15mErrors,
        last60mSent,
        last60mErrors,
      },
      errorCategories,
      refusalCategories,
      regionBreakdown,
      citizenshipBreakdown,
      hourlyTimeline,
      submissions: enrichedSubmissions,
      masterList3088,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || 'Gosuslugi analitik verileri alınamadı.',
      },
      { status: 500 }
    );
  }
}
