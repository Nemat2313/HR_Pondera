import { NextResponse } from 'next/server';
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
  rnr_step9: {
    id: 'rnr_step9',
    titleTr: 'Adım 9: VKS Çalışma İzni (РНР) Bilgisi Eksik veya Hatalı',
    titleRu: 'Шаг 9: Разрешение на работу ВКС (number / series)',
    stepLabel: 'Adım 9 (ВКС РНР)',
    hintTr: 'Personelin VKS çalışma izni (RNR) numarası, serisi veya veriliş/bitiş tarihi eksik ya da hatalı.',
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

function classifyGosuslugiError(statusText: string, detailText = ''): ErrorCategoryDef {
  const combined = `${statusText || ''} ${detailText || ''}`;
  if (/Шаг 12|Подразделение МВД|подразделение МВД/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.mvd_step12;
  }
  if (/lastNameRu|si13_lastNameRu|Шаг 6/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.personal_step6_timeout;
  }
  if (/Шаг 7|Паспортные данные/i.test(combined)) {
    return ERROR_CATEGORY_DEFINITIONS.passport_step7;
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

    // Ensure submissions table exists
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
    try {
      const masterRows = db
        .prepare('SELECT sicil_no, worker_json FROM gosuslugi_vks_master_list')
        .all() as Array<{ sicil_no: string; worker_json: string }>;
      if (masterRows.length > 0) {
        totalTargetVksPersonnel = masterRows.length;
        for (const mr of masterRows) {
          if (mr.sicil_no && mr.worker_json) {
            try {
              masterWorkerBySicil[String(mr.sicil_no).trim()] = JSON.parse(mr.worker_json);
            } catch {}
          }
        }
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

    // 2. Load all Gosuslugi submissions
    const rawSubs = db
      .prepare(
        `SELECT
          id, sicil_no, worker_name, citizenship, notification_type,
          period_code, application_no, gosuslugi_status, status_detail,
          pdf_filename, submitted_at, checked_at
        FROM gosuslugi_submissions
        WHERE LOWER(notification_type) = 'vks_salary'
        ORDER BY submitted_at DESC, id DESC`
      )
      .all() as any[];

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
      const subAt = String(r.submitted_at || '').trim();
      const chkAt = String(r.checked_at || '').trim();

      // Skip browser-closed pseudo errors
      if (
        !appNo &&
        /Target page, context or browser has been closed|Browser has been closed|Context or browser has been closed/i.test(
          rawStatus
        )
      ) {
        continue;
      }

      const pInfo = personnelBySicil[sicil];
      if (!matchesRls(pInfo)) {
        continue;
      }
      const mWorker = masterWorkerBySicil[sicil] || {};
      const region = pInfo?.region || 'Diğer / Eşleşmeyen';
      const citizenship =
        pInfo?.uyruk || String(r.citizenship || '').trim() || 'BELİRTİLMEMİŞ';

      const isError = /^ошибк/i.test(rawStatus);
      const isRefusedMvd = !isError && /отказан/i.test(rawStatus);
      const isServiceRendered = !isError && !isRefusedMvd && /оказан|исполнен/i.test(rawStatus);
      const isRegisteredOnly =
        !isError && !isRefusedMvd && !isServiceRendered && /зарегистрирован|принят|промежуточн/i.test(rawStatus);
      const hasPdf = Boolean(pdf);
      const isRegisteredMvd = isServiceRendered || isRegisteredOnly;
      const isSent =
        !isError &&
        (Boolean(appNo) ||
          hasPdf ||
          isRegisteredMvd ||
          isRefusedMvd ||
          /отправлен|промежуточн|обработк|PDF не скачан/i.test(rawStatus));
      const isSentPendingStatus = isSent && !isServiceRendered && !isRegisteredOnly && !isRefusedMvd;

      let gosuslugiStatusKey: 'service_rendered' | 'registered_mvd' | 'refused_mvd' | 'sent_pending' | 'error' = 'sent_pending';
      if (isError) gosuslugiStatusKey = 'error';
      else if (isRefusedMvd) gosuslugiStatusKey = 'refused_mvd';
      else if (isServiceRendered) gosuslugiStatusKey = 'service_rendered';
      else if (isRegisteredOnly) gosuslugiStatusKey = 'registered_mvd';

      // Diagnose probable MVD refusal reason when Услуга отказана
      let refusalHint = '';
      if (isRefusedMvd) {
        const reasons: string[] = [];
        const passNoCheck = String(mWorker.passportNumber || pInfo?.pasaport_no || '').trim();
        const blankNoCheck = String(mWorker.blankNumber || '').trim();
        const codeCheck = String(mWorker.code || '').trim();
        const cEndCheck = String(mWorker.contractEndDate || '').trim();
        const m1Check = String(mWorker.month1Salary || '').trim();
        const m2Check = String(mWorker.month2Salary || '').trim();
        const m3Check = String(mWorker.month3Salary || '').trim();

        if (/[А-Яа-яЁё]/.test(passNoCheck)) {
          reasons.push(`Pasaport No (${passNoCheck}) içinde Latin yerine Rusça Kiril harf kullanılmış`);
        }
        if (blankNoCheck && blankNoCheck.length !== 7) {
          reasons.push(`RNR Blank No (${blankNoCheck}) 7 hane yerine ${blankNoCheck.length} haneli girilmiş`);
        }
        if (m1Check && m3Check && !m2Check) {
          reasons.push(`2. Ay (Ağustos) maaşı boş bırakılmış (1.Ay=${m1Check}, 2.Ay=Boş, 3.Ay=${m3Check})`);
        }
        if (mWorker.lastName === 'Нет') {
          reasons.push(`Soyadı (Фамилия) 'Нет' olarak girilmiş, tam isim Имя alanına yazılmış`);
        }
        if (/[а-яa-z]$/i.test(codeCheck)) {
          reasons.push(`Mükerrer / Yeniden giriş kodu (${codeCheck}) — eski/yeni sözleşme veya RNR tarihi uyuşmazlığı`);
        }
        if (cEndCheck) {
          reasons.push(`3. Çeyrek içinde çıkış / sözleşme feshi (${cEndCheck}) — МВД veritabanında RNR/Sözleşme aktif görünmüyor olabilir`);
        }
        if (reasons.length === 0) {
          reasons.push(
            `МВД veritabanı kontrolü: RNR (${mWorker.rnrSeries || ''} ${mWorker.rnrNumber || pInfo?.rnr_no || ''}) / Sözleşme tarihi (${mWorker.contractDate || '-'}) / МВД birimi uyuşmazlığı`
          );
        }
        refusalHint = reasons.join(' • ');
      }

      let errorCat: ErrorCategoryDef | null = null;
      if (isError) {
        totalErrors++;
        errorCat = classifyGosuslugiError(rawStatus, detail);
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

      // Hourly slot (e.g. "19.10 22:00")
      if (subAt && subAt.length >= 13) {
        const datePart = subAt.slice(5, 10).split('-').reverse().join('.');
        const hourPart = `${subAt.slice(11, 13)}:00`;
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
        submitted_at: subAt,
        checked_at: chkAt,
        state: isError ? 'error' : isSent ? 'sent' : 'other',
        hasPdf,
        isRegisteredMvd,
        isServiceRendered,
        isRegisteredOnly,
        isRefusedMvd,
        errorCategoryId: errorCat?.id || null,
        errorCategoryTitle: errorCat?.titleTr || null,
        errorStepLabel: errorCat?.stepLabel || null,
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

      enrichedSubmissions.push(enrichedItem);
    }

    // Finalize error category percentages
    const errorCategories = Object.values(errorCategoriesMap)
      .map((cat) => ({
        ...cat,
        percentage: totalErrors > 0 ? Math.round((cat.count / totalErrors) * 100) : 0,
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
        remainingTarget,
        overallCompletionPct,
        successRatePct,
        last15mSent,
        last15mErrors,
        last60mSent,
        last60mErrors,
      },
      errorCategories,
      regionBreakdown,
      citizenshipBreakdown,
      hourlyTimeline,
      submissions: enrichedSubmissions,
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
