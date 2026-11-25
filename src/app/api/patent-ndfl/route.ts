import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  buildFnsKnd1110055Xml,
  classifyPatentRootCause,
  create1cPatentReceipt,
  delete1cPatentReceipt,
  discoverODataNdflEntities,
  ensurePatentNdflTables,
  getPatentODataConfig,
  importPatentNdflWorkbook,
  PATENT_RATES_2026,
  savePatentODataConfig,
  syncPatentNdflFromOData,
  upsertPatentNdflRecord,
} from '@/lib/patentNdflManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = getDb();
    ensurePatentNdflTables(db);
    const { searchParams } = new URL(request.url);
    if (searchParams.get('action') === 'discover_odata') {
      const disc = await discoverODataNdflEntities(db, {
        entity: searchParams.get('entity') || undefined,
        filter: searchParams.get('filter') || undefined,
        pattern: searchParams.get('pattern') || undefined,
      });
      return NextResponse.json(disc);
    }
    if (searchParams.get('action') === 'receipt_file') {
      const fileId = String(searchParams.get('id') || '').trim();
      if (!fileId) return NextResponse.json({ success: false, message: 'Missing id' }, { status: 400 });
      const row = db.prepare('SELECT file_name, mime_type, file_path FROM patent_receipt_files WHERE id = ?').get(fileId) as any;
      if (!row || !row.file_path || !fs.existsSync(row.file_path)) {
        return NextResponse.json({ success: false, message: 'Fiş dosyası bulunamadı.' }, { status: 404 });
      }
      const dataBuf = fs.readFileSync(row.file_path);
      return new NextResponse(new Uint8Array(dataBuf), {
        status: 200,
        headers: {
          'Content-Type': String(row.mime_type || 'application/pdf'),
          'Content-Disposition': `inline; filename="${encodeURIComponent(String(row.file_name || 'receipt.pdf'))}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
    const taxYear = Number(searchParams.get('year')) || 2026;

    const rawRecords = db
      .prepare('SELECT * FROM patent_ndfl_records WHERE tax_year = ? ORDER BY additional_offset_potential DESC, ndfl_withheld DESC')
      .all(taxYear) as any[];

    const rawMonthly = db
      .prepare('SELECT * FROM patent_ndfl_monthly WHERE tax_year = ? ORDER BY month_num ASC')
      .all(taxYear) as any[];

    const MONTH_SHORT_TR = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const MONTH_SHORT_RU = ['', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const fmtRubInline = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
    const nowDate = new Date();
    const currentYear = nowDate.getFullYear();
    const currentMonth = nowDate.getMonth() + 1;
    const remainingMonthsInYear = taxYear === currentYear ? Math.max(0, 12 - currentMonth) : taxYear < currentYear ? 0 : 12;
    const parseNotifMonth = (rawDate: string): number => {
      const s = String(rawDate || '').trim();
      const iso = /^\d{4}-(\d{2})/.exec(s);
      if (iso) {
        const m = parseInt(iso[1], 10);
        if (m >= 1 && m <= 12) return m;
      }
      const dot = /^\d{2}\.(\d{2})\.\d{4}/.exec(s);
      if (dot) {
        const m = parseInt(dot[1], 10);
        if (m >= 1 && m <= 12) return m;
      }
      return 0;
    };

    const rawMonthlyByNorm = new Map<string, Map<number, { patent_paid: number; ndfl_calc: number; offset_used: number; ndfl_withheld: number }>>();
    for (const m of rawMonthly) {
      const nn = String(m.norm_name || '');
      const mNum = Number(m.month_num || 0);
      if (!nn || mNum < 1 || mNum > 12) continue;
      let mp = rawMonthlyByNorm.get(nn);
      if (!mp) {
        mp = new Map();
        rawMonthlyByNorm.set(nn, mp);
      }
      mp.set(mNum, {
        patent_paid: Math.round(Number(m.patent_paid || 0)),
        ndfl_calc: Math.round(Number(m.ndfl_calc || 0)),
        offset_used: Math.round(Number(m.offset_used || 0)),
        ndfl_withheld: Math.round(Number(m.ndfl_withheld || 0)),
      });
    }

    const companyMonths = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: MONTH_SHORT_TR[i + 1],
      patent_paid: 0,
      ndfl_calc: 0,
      offset_used: 0,
      ndfl_withheld: 0,
      missing_employees: 0,
    }));

    // Enrich with Patent dates, payment day, and hire/exit dates from Pondera personnel DB if matched
    const patentInfoByNorm = new Map<
      string,
      { patent_no: string; patent_start: string; patent_end: string; payment_day: number; hire_date: string; exit_date: string; site_name: string }
    >();
    try {
      const pRows = db
        .prepare('SELECT sicil_no, ad_soyad, tam_adi_kiril, proje_adi, ise_giris_tarihi, isten_cikis_tarihi, patent_bitis_tarihi, all_data_json FROM personnel')
        .all() as any[];
      const extractDay = (dt: string): number => {
        const s = String(dt || '').trim();
        const iso = /^\d{4}-\d{2}-(\d{2})/.exec(s);
        if (iso) return parseInt(iso[1], 10);
        const dot = /^(\d{2})\.\d{2}\.\d{4}/.exec(s);
        if (dot) return parseInt(dot[1], 10);
        return 0;
      };
      for (const p of pRows) {
        let patentNo = '';
        let patentStart = '';
        let patentEnd = String(p.patent_bitis_tarihi || '').trim();
        const pHire = String(p.ise_giris_tarihi || '').trim();
        const pExit = String(p.isten_cikis_tarihi || '').trim();
        const pSite = String(p.proje_adi || '').trim();
        if (p.all_data_json) {
          try {
            const j = JSON.parse(p.all_data_json);
            patentNo = String(j['Patent No'] || j['Patent Form No'] || '').trim();
            patentStart = String(j['Patent Başlangıç Tarihi'] || j['Patent Veriliş Tarihi'] || j['Patent Düzenleme Tarihi'] || '').trim();
            if (!patentEnd) patentEnd = String(j['Patent Bitiş Tarihi'] || '').trim();
          } catch {}
        }
        if (!patentNo && !patentStart && !patentEnd && !pHire && !pExit && !pSite) continue;
        const payDay = extractDay(patentStart) || extractDay(patentEnd);
        const info = {
          patent_no: patentNo,
          patent_start: patentStart,
          patent_end: patentEnd,
          payment_day: payDay,
          hire_date: pHire,
          exit_date: pExit,
          site_name: pSite,
        };
        const normKey = (v: any) => String(v || '').trim().toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ');
        if (p.tam_adi_kiril) patentInfoByNorm.set(normKey(p.tam_adi_kiril), info);
        if (p.ad_soyad) patentInfoByNorm.set(normKey(p.ad_soyad), info);
      }
    } catch {}

    const records = rawRecords.map((r) => {
      const nn = String(r.norm_name || '');
      const mp = rawMonthlyByNorm.get(nn);
      const hasNotif = Boolean(r.has_notification);
      const notifMonth = hasNotif ? parseNotifMonth(r.notification_date) : 0;
      const totalAdvances = Math.round(Number(r.patent_advances || 0));

      let receipts: Array<{ number: string; date: string; opDate: string; amount: number; comment: string; months: number[] }> = [];
      try {
        if (r.receipts_json) receipts = JSON.parse(String(r.receipts_json));
      } catch {}

      // Group 1C receipts by their 1C entry month (Document Date column in 1C)
      const receiptsByEntryMonth = new Map<
        number,
        { total: number; items: Array<{ number: string; date: string; opDate: string; amount: number; comment: string }> }
      >();
      let firstLateEntryMonth = 0;
      for (const rc of receipts) {
        const em = parseNotifMonth(rc.date || rc.opDate);
        if (em >= 1 && em <= 12) {
          const cur = receiptsByEntryMonth.get(em) || { total: 0, items: [] };
          cur.total += Math.round(Number(rc.amount || 0));
          cur.items.push({
            number: rc.number,
            date: rc.date,
            opDate: rc.opDate,
            amount: Math.round(Number(rc.amount || 0)),
            comment: rc.comment,
          });
          receiptsByEntryMonth.set(em, cur);
        }
      }

      const months: Array<{
        month: number;
        label: string;
        label_ru: string;
        receipt_1c_entered: number;
        receipt_1c_items: Array<{ number: string; date: string; opDate: string; amount: number; comment: string }>;
        patent_paid: number;
        ndfl_calc: number;
        offset_used: number;
        ndfl_withheld: number;
        unoffset_gap: number;
        is_notif_month: boolean;
        is_after_notif: boolean;
        status_code: string;
        analysis_note: string;
        analysis_note_ru: string;
      }> = [];

      let hasLate1cEntry = false;

      if ((mp && mp.size > 0) || receiptsByEntryMonth.size > 0) {
        let cumOffsetUsed = 0;
        let cumEntered1c = 0;
        for (let mNum = 1; mNum <= 12; mNum++) {
          const row = mp?.get(mNum);
          const entryRec = receiptsByEntryMonth.get(mNum);
          const isNotifMonth = hasNotif && notifMonth > 0 && mNum === notifMonth;
          if (!row && !entryRec && !isNotifMonth) continue;

          const receipt1cEntered = entryRec?.total || 0;
          const receipt1cItems = entryRec?.items || [];
          cumEntered1c += receipt1cEntered;

          const patentPaid = row?.patent_paid || 0;
          const ndflCalc = row?.ndfl_calc || 0;
          const offsetUsed = row?.offset_used || 0;
          const ndflWithheld = row?.ndfl_withheld || 0;
          const isAfterNotif = hasNotif && (notifMonth === 0 || mNum >= notifMonth);
          const isBeforeNotif = hasNotif && notifMonth > 0 && mNum < notifMonth;

          const remainingAdvanceBefore = Math.max(0, totalAdvances - cumOffsetUsed);
          const enteredAvailBefore = Math.max(0, cumEntered1c - cumOffsetUsed);
          const maxOffsetable = Math.min(ndflCalc, remainingAdvanceBefore);
          const unoffsetGap = ndflCalc > 0 && offsetUsed < maxOffsetable ? Math.round(maxOffsetable - offsetUsed) : 0;

          if (firstLateEntryMonth === 0) {
            for (const em of Array.from(receiptsByEntryMonth.keys()).sort((a, b) => a - b)) {
              if (em > mNum) {
                firstLateEntryMonth = em;
                break;
              }
            }
          }
          const nextEntryMonth = Array.from(receiptsByEntryMonth.keys())
            .sort((a, b) => a - b)
            .find((em) => em > mNum);
          const isLate1cEntry = receipts.length > 0 && unoffsetGap > 0 && enteredAvailBefore < ndflCalc && Boolean(nextEntryMonth);
          if (isAfterNotif && isLate1cEntry) hasLate1cEntry = true;

          let statusCode = 'no_ndfl';
          let analysisNote = 'НДФЛ yok';
          let analysisNoteRu = 'Нет НДФЛ';

          if (!hasNotif) {
            if (ndflCalc > 0 && offsetUsed === 0) {
              statusCode = 'no_notif';
              analysisNote = `ФНС izni yok — ${fmtRubInline(ndflCalc)} НДФЛ kesildi, mahsup yapılamadı`;
              analysisNoteRu = `Нет уведомления ФНС — удержано ${fmtRubInline(ndflCalc)} НДФЛ, зачёт невозможен`;
            } else if (patentPaid > 0 && ndflCalc === 0) {
              statusCode = 'patent_only';
              analysisNote = `Patent ödendi (${fmtRubInline(patentPaid)}), НДФЛ yok · ФНС izni eksik`;
              analysisNoteRu = `Патент оплачен (${fmtRubInline(patentPaid)}), НДФЛ нет · нет уведомления ФНС`;
            } else {
              statusCode = 'no_ndfl';
              analysisNote = 'НДФЛ yok · ФНС izni eksik';
              analysisNoteRu = 'Нет НДФЛ · нет уведомления ФНС';
            }
          } else if (isBeforeNotif) {
            if (ndflCalc > 0 && offsetUsed === 0) {
              statusCode = 'pre_notif_missed';
              analysisNote = `İzin öncesi — ${fmtRubInline(ndflCalc)} НДФЛ kesildi (izin ${MONTH_SHORT_TR[notifMonth]}'da alındı → geriye dönük mahsup/iade)`;
              analysisNoteRu = `До уведомления — удержано ${fmtRubInline(ndflCalc)} НДФЛ (увед. получено в ${MONTH_SHORT_RU[notifMonth]} → перерасчёт/возврат)`;
            } else if (offsetUsed > 0 && offsetUsed >= ndflCalc) {
              statusCode = 'full_offset';
              analysisNote = `✓ Geriye dönük tam mahsup edildi (${fmtRubInline(offsetUsed)})`;
              analysisNoteRu = `✓ Полный ретро-зачёт (${fmtRubInline(offsetUsed)})`;
            } else if (offsetUsed > 0) {
              statusCode = 'partial_missed';
              analysisNote = `İzin öncesi kısmi mahsup (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — ${fmtRubInline(ndflCalc - offsetUsed)} kesildi`;
              analysisNoteRu = `Частичный зачёт до увед. (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — удержано ${fmtRubInline(ndflCalc - offsetUsed)}`;
            } else if (patentPaid > 0) {
              statusCode = 'patent_only';
              analysisNote = `İzin öncesi — Patent ödendi (${fmtRubInline(patentPaid)}), bu ay НДФЛ yok`;
              analysisNoteRu = `До уведомления — патент оплачен (${fmtRubInline(patentPaid)}), НДФЛ нет`;
            } else {
              statusCode = 'no_ndfl';
              analysisNote = 'İzin öncesi — НДФЛ yok';
              analysisNoteRu = 'До уведомления — нет НДФЛ';
            }
          } else {
            if (offsetUsed > 0 && ndflCalc === 0) {
              statusCode = 'retro_offset';
              analysisNote = `✓ Geçmiş ay mahsubu uygulandı (+${fmtRubInline(offsetUsed)})`;
              analysisNoteRu = `✓ Применён зачёт за прошлые месяцы (+${fmtRubInline(offsetUsed)})`;
            } else if (offsetUsed > 0 && offsetUsed > ndflCalc) {
              statusCode = 'retro_offset';
              analysisNote = `✓ НДФЛ kadar (${fmtRubInline(ndflCalc)}) + geçmiş ay mahsubu (+${fmtRubInline(offsetUsed - ndflCalc)})`;
              analysisNoteRu = `✓ Зачтён НДФЛ (${fmtRubInline(ndflCalc)}) + прошлые месяцы (+${fmtRubInline(offsetUsed - ndflCalc)})`;
            } else if (offsetUsed > 0 && offsetUsed >= ndflCalc) {
              statusCode = 'full_offset';
              analysisNote = `✓ НДФЛ kadar tam mahsup edildi (${fmtRubInline(offsetUsed)})`;
              analysisNoteRu = `✓ Полный зачёт в пределах НДФЛ (${fmtRubInline(offsetUsed)})`;
            } else if (offsetUsed > 0 && offsetUsed < ndflCalc) {
              if (unoffsetGap === 0) {
                statusCode = 'patent_cap';
                analysisNote = `Patent avansı kadar mahsup edildi (${fmtRubInline(offsetUsed)}), kalan ${fmtRubInline(ndflCalc - offsetUsed)} НДФЛ kesildi`;
                analysisNoteRu = `Зачтён остаток аванса (${fmtRubInline(offsetUsed)}), удержано ${fmtRubInline(ndflCalc - offsetUsed)} НДФЛ`;
              } else if (isLate1cEntry && nextEntryMonth) {
                statusCode = 'partial_missed';
                analysisNote = `⚠ Kısmi mahsup (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — fişler 1C'ye ${MONTH_SHORT_TR[nextEntryMonth]}'da geç girildi (${fmtRubInline(unoffsetGap)} eksik)`;
                analysisNoteRu = `⚠ Частичный зачёт (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — чеки внесены в 1С поздно (${MONTH_SHORT_RU[nextEntryMonth]}), недозачёт ${fmtRubInline(unoffsetGap)}`;
              } else {
                statusCode = 'partial_missed';
                analysisNote = `⚠ Kısmi mahsup (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — ${fmtRubInline(unoffsetGap)} eksik mahsup`;
                analysisNoteRu = `⚠ Частичный зачёт (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — недозачёт ${fmtRubInline(unoffsetGap)}`;
              }
            } else if (offsetUsed === 0 && ndflCalc > 0) {
              if (unoffsetGap > 0) {
                statusCode = 'post_notif_missed';
                analysisNote =
                  isLate1cEntry && nextEntryMonth
                    ? `⚠ Mahsup YAPILMADI (Fiş 1C'ye ${MONTH_SHORT_TR[nextEntryMonth]}'da geç girildi) — ${fmtRubInline(ndflCalc)} НДФЛ kesildi`
                    : `⚠ Mahsup YAPILMADI! İzin & 1C avansı varken ${fmtRubInline(ndflCalc)} НДФЛ kesildi`;
                analysisNoteRu =
                  isLate1cEntry && nextEntryMonth
                    ? `⚠ Зачёт НЕ выполнен (чек внесён в 1С поздно, в ${MONTH_SHORT_RU[nextEntryMonth]}) — удержано ${fmtRubInline(ndflCalc)} НДФЛ`
                    : `⚠ Зачёт НЕ выполнен при наличии уведомления и аванса — удержано ${fmtRubInline(ndflCalc)} НДФЛ`;
              } else {
                statusCode = 'advance_exhausted';
                analysisNote = `Patent avansı tükendi — ${fmtRubInline(ndflCalc)} НДФЛ kesildi`;
                analysisNoteRu = `Аванс по патенту исчерпан — удержано ${fmtRubInline(ndflCalc)} НДФЛ`;
              }
            } else if (patentPaid > 0) {
              statusCode = 'patent_only';
              analysisNote = isNotifMonth
                ? `Уведомление alındı · Patent ödendi (${fmtRubInline(patentPaid)}), bu ay НДФЛ yok`
                : `Patent ödendi (${fmtRubInline(patentPaid)}), bu ay НДФЛ yok`;
              analysisNoteRu = isNotifMonth
                ? `Уведомление получено · патент оплачен (${fmtRubInline(patentPaid)}), НДФЛ нет`
                : `Патент оплачен (${fmtRubInline(patentPaid)}), НДФЛ нет`;
            } else {
              statusCode = 'no_ndfl';
              analysisNote = isNotifMonth ? 'Уведомление bu ay alındı — bu ay НДФЛ yok' : 'НДФЛ yok';
              analysisNoteRu = isNotifMonth ? 'Уведомление получено в этом месяце — НДФЛ нет' : 'Нет НДФЛ';
            }
          }

          cumOffsetUsed += offsetUsed;

          months.push({
            month: mNum,
            label: MONTH_SHORT_TR[mNum],
            label_ru: MONTH_SHORT_RU[mNum],
            receipt_1c_entered: receipt1cEntered,
            receipt_1c_items: receipt1cItems,
            patent_paid: patentPaid,
            ndfl_calc: ndflCalc,
            offset_used: offsetUsed,
            ndfl_withheld: ndflWithheld,
            unoffset_gap: unoffsetGap,
            is_notif_month: isNotifMonth,
            is_after_notif: isAfterNotif,
            status_code: statusCode,
            analysis_note: analysisNote,
            analysis_note_ru: analysisNoteRu,
          });

          const cm = companyMonths[mNum - 1];
          cm.patent_paid += patentPaid;
          cm.ndfl_calc += ndflCalc;
          cm.offset_used += offsetUsed;
          cm.ndfl_withheld += ndflWithheld;
          if (unoffsetGap > 0) cm.missing_employees++;
        }
      }

      const missingMonths = months
        .filter((m) => m.unoffset_gap > 0)
        .map((m) => ({
          month: m.month,
          label: m.label,
          label_ru: m.label_ru,
          gap: m.unoffset_gap,
          phase: m.is_after_notif ? 'post_notif' : hasNotif ? 'pre_notif' : 'no_notif',
        }));

      const missingReceiptMonths = months
        .filter((m) => m.ndfl_calc > 0 && m.patent_paid === 0)
        .map((m) => ({ month: m.month, label: m.label, label_ru: m.label_ru }));

      const pInfo = patentInfoByNorm.get(nn) || null;
      const hireDate = String(r.hire_date || pInfo?.hire_date || '').trim();
      const exitDate = String(r.exit_date || pInfo?.exit_date || '').trim();
      const effectiveActive = exitDate ? 0 : Number(r.is_active ?? 1);

      // Year-End Vozvrat Forecast based on employee's monthly average NDFL
      const ndflActiveMonths = months.filter((m) => m.ndfl_calc > 0).length;
      const avgMonthlyNdfl = ndflActiveMonths > 0 ? Math.round(Number(r.ndfl_before_offset || 0) / ndflActiveMonths) : 0;
      const expectedRemainingNdfl = effectiveActive ? avgMonthlyNdfl * remainingMonthsInYear : 0;
      const potNum = Number(r.additional_offset_potential || 0);
      const payrollAbsorbable = effectiveActive && potNum > 0 ? Math.min(potNum, expectedRemainingNdfl) : 0;
      const guaranteedVozvrat = effectiveActive && potNum > 0 ? Math.max(0, potNum - expectedRemainingNdfl) : 0;

      const rootCause = classifyPatentRootCause({
        ...r,
        site_name: String(r.site_name || pInfo?.site_name || '').trim(),
        is_active: effectiveActive,
        has_late_1c_entry: hasLate1cEntry,
      });

      return {
        ...r,
        site_name: String(r.site_name || pInfo?.site_name || '').trim(),
        is_active: effectiveActive,
        hire_date: hireDate,
        exit_date: exitDate,
        notif_month: notifMonth,
        root_cause: rootCause,
        has_late_1c_entry: hasLate1cEntry,
        avg_monthly_ndfl: avgMonthlyNdfl,
        expected_remaining_ndfl: expectedRemainingNdfl,
        payroll_absorbable: Math.round(payrollAbsorbable),
        guaranteed_vozvrat: Math.round(guaranteedVozvrat),
        months,
        missing_months: missingMonths,
        missing_receipt_months: missingReceiptMonths,
        receipts,
        patent_info: pInfo,
      };
    });

    const discrepancies = db
      .prepare('SELECT * FROM patent_ndfl_discrepancies WHERE tax_year = ? ORDER BY unexplained_amount DESC')
      .all(taxYear) as any[];

    let totalAdvances = 0;
    let totalOffsetUsed = 0;
    let totalBalance = 0;
    let totalPotential = 0;
    let activePotential = 0;
    let activePotentialCount = 0;
    let noNotifTotal = 0;
    let noNotifActive = 0;
    let noNotifDismissed = 0;
    let noNotifNoApp = 0;
    let withNotifTotal = 0;
    let totalDiscrepancy = 0;

    // 7-category Two-Group Root-Cause breakdown
    const causeCounts = {
      NO_NOTIFICATION: 0,
      LATE_NOTIFICATION: 0,
      LATE_RECEIPT_ENTRY: 0,
      DISMISSED_UNRECOVERED: 0,
      REGION_CHANGED: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    };
    const causeRub = {
      NO_NOTIFICATION: 0,
      LATE_NOTIFICATION: 0,
      LATE_RECEIPT_ENTRY: 0,
      DISMISSED_UNRECOVERED: 0,
      REGION_CHANGED: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    };
    let vozvratActiveRub = 0;
    let vozvratActiveCount = 0;
    let vozvratDismissedRub = 0;
    let vozvratDismissedCount = 0;
    let payrollAbsorbableRub = 0;
    let guaranteedVozvratRub = 0;
    let guaranteedVozvratCount = 0;

    for (const r of records) {
      const adv = Number(r.patent_advances || 0);
      const used = Number(r.patent_offset_used || 0);
      const bal = Number(r.patent_advance_balance || 0);
      const pot = Number(r.additional_offset_potential || 0);
      const cause = r.root_cause as keyof typeof causeCounts;

      causeCounts[cause] = (causeCounts[cause] || 0) + 1;

      if (cause === 'REGION_CHANGED') {
        causeRub.REGION_CHANGED += bal;
        continue;
      }

      totalAdvances += adv;
      totalOffsetUsed += used;
      totalBalance += bal;
      totalPotential += pot;

      if (cause === 'NO_NOTIFICATION') {
        causeRub.NO_NOTIFICATION += Math.max(Number(r.ndfl_withheld || 0), pot);
      } else if (cause === 'LATE_NOTIFICATION') {
        causeRub.LATE_NOTIFICATION += pot;
      } else if (cause === 'LATE_RECEIPT_ENTRY') {
        causeRub.LATE_RECEIPT_ENTRY += pot;
      } else if (cause === 'DISMISSED_UNRECOVERED') {
        causeRub.DISMISSED_UNRECOVERED += pot;
        vozvratDismissedRub += pot;
        vozvratDismissedCount++;
      } else if (cause === 'LOW_NDFL') {
        causeRub.LOW_NDFL += bal;
      } else if (cause === 'FULL_OFFSET') {
        causeRub.FULL_OFFSET += used;
      }

      if (r.is_active && pot > 0) {
        activePotential += pot;
        activePotentialCount++;
        vozvratActiveRub += pot;
        vozvratActiveCount++;
        payrollAbsorbableRub += Number(r.payroll_absorbable || 0);
        const gv = Number(r.guaranteed_vozvrat || 0);
        if (gv > 0) {
          guaranteedVozvratRub += gv;
          guaranteedVozvratCount++;
        }
      }
      if (r.has_notification) {
        withNotifTotal++;
      } else {
        noNotifTotal++;
        if (r.is_active) noNotifActive++;
        else noNotifDismissed++;
        if (!r.application_date || /не найдено|yok/i.test(String(r.application_status || ''))) {
          noNotifNoApp++;
        }
      }
    }
    for (const d of discrepancies) {
      totalDiscrepancy += Number(d.unexplained_amount || 0);
    }

    const odata = getPatentODataConfig(db);

    const groupACount = causeCounts.REGION_CHANGED + causeCounts.LOW_NDFL;
    const groupARub = Math.round(causeRub.REGION_CHANGED + causeRub.LOW_NDFL);
    const groupBCount =
      causeCounts.NO_NOTIFICATION +
      causeCounts.LATE_NOTIFICATION +
      causeCounts.LATE_RECEIPT_ENTRY +
      causeCounts.DISMISSED_UNRECOVERED;
    const groupBRub = Math.round(
      causeRub.NO_NOTIFICATION +
        causeRub.LATE_NOTIFICATION +
        causeRub.LATE_RECEIPT_ENTRY +
        causeRub.DISMISSED_UNRECOVERED
    );

    return NextResponse.json({
      success: true,
      taxYear,
      records,
      monthlyTotals: companyMonths,
      discrepancies,
      patentRates2026: PATENT_RATES_2026,
      odataConfig: {
        ...odata,
        hasPassword: Boolean(odata.password),
        password: odata.password ? '••••••••' : '',
      },
      summary: {
        totalEmployees: records.length,
        withNotifTotal,
        noNotifTotal,
        noNotifActive,
        noNotifDismissed,
        noNotifNoApp,
        totalAdvances: Math.round(totalAdvances),
        totalOffsetUsed: Math.round(totalOffsetUsed),
        totalBalance: Math.round(totalBalance),
        totalPotential: Math.round(totalPotential),
        activePotential: Math.round(activePotential),
        activePotentialCount,
        offsetPct: totalAdvances > 0 ? Math.round((totalOffsetUsed / totalAdvances) * 1000) / 10 : 0,
        discrepancyCount: discrepancies.length,
        totalDiscrepancy: Math.round(totalDiscrepancy),
        causeCounts,
        causeRub: {
          NO_NOTIFICATION: Math.round(causeRub.NO_NOTIFICATION),
          LATE_NOTIFICATION: Math.round(causeRub.LATE_NOTIFICATION),
          LATE_RECEIPT_ENTRY: Math.round(causeRub.LATE_RECEIPT_ENTRY),
          DISMISSED_UNRECOVERED: Math.round(causeRub.DISMISSED_UNRECOVERED),
          REGION_CHANGED: Math.round(causeRub.REGION_CHANGED),
          LOW_NDFL: Math.round(causeRub.LOW_NDFL),
          FULL_OFFSET: Math.round(causeRub.FULL_OFFSET),
        },
        groupA: { count: groupACount, rub: groupARub },
        groupB: { count: groupBCount, rub: groupBRub },
        vozvratForecast: {
          remainingMonths: remainingMonthsInYear,
          activeEligibleCount: vozvratActiveCount,
          activeEligibleRub: Math.round(vozvratActiveRub),
          payrollAbsorbableRub: Math.round(payrollAbsorbableRub),
          guaranteedVozvratCount,
          guaranteedVozvratRub: Math.round(guaranteedVozvratRub),
          dismissedLostCount: vozvratDismissedCount,
          dismissedLostRub: Math.round(vozvratDismissedRub),
        },
        vozvratActiveRub: Math.round(vozvratActiveRub),
        vozvratActiveCount,
        vozvratDismissedRub: Math.round(vozvratDismissedRub),
        vozvratDismissedCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Patent & NDFL verileri okunamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Gözlemci (Viewer) rolünün bu işlem için yetkisi yoktur.' },
        { status: 403 }
      );
    }

    const db = getDb();
    ensurePatentNdflTables(db);
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      const uploadMode = String(fd.get('mode') || 'excel').trim();
      const file = fd.get('file') as File | null;
      const taxYear = Number(fd.get('taxYear')) || 2026;
      const orgName = String(fd.get('orgName') || '').trim();
      if (!file) {
        return NextResponse.json({ success: false, message: 'Lütfen bir dosya seçin.' }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());

      // Mode: Bulk AI OCR Scan of Patent Payment Receipts (.pdf / .zip / .jpg / .png) -> Ready to push to 1C
      if (uploadMode === 'scan_receipts') {
        const ext = path.extname(file.name || '').toLowerCase() || '.pdf';
        const batchId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const pagesOutDir = path.join(process.cwd(), 'uploads', 'patent_receipts', batchId);
        fs.mkdirSync(pagesOutDir, { recursive: true });

        const chunks: Array<{ name: string; mime: string; b64: string; pageStart: number; pageEnd: number }> = [];
        const savedPages: Array<{ page: number; fileName: string; mime: string; size: number; path: string }> = [];
        let pageOffset = 0;

        const processPdfBuffer = async (rawBuf: Buffer, srcName: string) => {
          try {
            const srcDoc = await PDFDocument.load(rawBuf, { ignoreEncryption: true });
            const total = srcDoc.getPageCount();
            for (let p = 0; p < total; p++) {
              const gPage = pageOffset + p + 1;
              const singleDoc = await PDFDocument.create();
              const [copied] = await singleDoc.copyPages(srcDoc, [p]);
              singleDoc.addPage(copied);
              const singleBytes = Buffer.from(await singleDoc.save());
              const outName = `receipt_p${String(gPage).padStart(3, '0')}.pdf`;
              const outPath = path.join(pagesOutDir, outName);
              fs.writeFileSync(outPath, singleBytes);
              savedPages.push({ page: gPage, fileName: outName, mime: 'application/pdf', size: singleBytes.length, path: outPath });
            }
            const chunkSize = 8;
            if (total <= chunkSize) {
              chunks.push({
                name: srcName,
                mime: 'application/pdf',
                b64: rawBuf.toString('base64'),
                pageStart: pageOffset + 1,
                pageEnd: pageOffset + total,
              });
            } else {
              for (let start = 0; start < total; start += chunkSize) {
                const end = Math.min(total, start + chunkSize);
                const chunkDoc = await PDFDocument.create();
                const indices = Array.from({ length: end - start }, (_, k) => start + k);
                const copiedPages = await chunkDoc.copyPages(srcDoc, indices);
                for (const cp of copiedPages) chunkDoc.addPage(cp);
                const chunkBytes = Buffer.from(await chunkDoc.save());
                chunks.push({
                  name: `${srcName} (s.${start + 1}-${end})`,
                  mime: 'application/pdf',
                  b64: chunkBytes.toString('base64'),
                  pageStart: pageOffset + start + 1,
                  pageEnd: pageOffset + end,
                });
              }
            }
            pageOffset += total;
          } catch {
            const gPage = pageOffset + 1;
            const outName = `receipt_p${String(gPage).padStart(3, '0')}.pdf`;
            const outPath = path.join(pagesOutDir, outName);
            fs.writeFileSync(outPath, rawBuf);
            savedPages.push({ page: gPage, fileName: outName, mime: 'application/pdf', size: rawBuf.length, path: outPath });
            chunks.push({ name: srcName, mime: 'application/pdf', b64: rawBuf.toString('base64'), pageStart: gPage, pageEnd: gPage });
            pageOffset += 1;
          }
        };

        const processImageBuffer = (rawBuf: Buffer, srcName: string, fext: string) => {
          const mime = fext === '.png' ? 'image/png' : fext === '.webp' ? 'image/webp' : 'image/jpeg';
          const cleanExt = fext === '.png' ? '.png' : fext === '.webp' ? '.webp' : '.jpg';
          const gPage = pageOffset + 1;
          const outName = `receipt_p${String(gPage).padStart(3, '0')}${cleanExt}`;
          const outPath = path.join(pagesOutDir, outName);
          fs.writeFileSync(outPath, rawBuf);
          savedPages.push({ page: gPage, fileName: outName, mime, size: rawBuf.length, path: outPath });
          chunks.push({ name: srcName, mime, b64: rawBuf.toString('base64'), pageStart: gPage, pageEnd: gPage });
          pageOffset += 1;
        };

        if (ext === '.zip') {
          const zip = await JSZip.loadAsync(buf);
          const entries = Object.values(zip.files).filter(
            (e) => !e.dir && !e.name.includes('__MACOSX') && !path.basename(e.name).startsWith('.')
          );
          for (const entry of entries) {
            const bn = path.basename(entry.name);
            const fext = path.extname(bn).toLowerCase();
            if (fext === '.pdf') {
              await processPdfBuffer(Buffer.from(await entry.async('uint8array')), bn);
            } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(fext)) {
              processImageBuffer(Buffer.from(await entry.async('uint8array')), bn, fext);
            }
          }
        } else if (ext === '.pdf') {
          await processPdfBuffer(buf, file.name);
        } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          processImageBuffer(buf, file.name, ext);
        }

        if (chunks.length === 0) {
          return NextResponse.json(
            { success: false, message: 'PDF/ZIP içinden okunabilir fiş bulunamadı.' },
            { status: 400 }
          );
        }

        // Register each individual split 1-page receipt file in SQLite so it can be viewed & attached to 1C
        const pageFileByNum = new Map<number, { id: string; url: string; fileName: string }>();
        const insFileStmt = db.prepare(`
          INSERT OR REPLACE INTO patent_receipt_files (id, tax_year, file_name, mime_type, file_path, file_size)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const sp of savedPages) {
          const pNum = Number(sp.page || 0);
          if (!pNum || !sp.path) continue;
          const fid = `rf_${batchId}_p${pNum}`;
          insFileStmt.run(fid, taxYear, sp.fileName, sp.mime, sp.path, sp.size);
          pageFileByNum.set(pNum, {
            id: fid,
            url: `/api/patent-ndfl?action=receipt_file&id=${encodeURIComponent(fid)}`,
            fileName: sp.fileName,
          });
        }

        // Read Gemini API key from ai_provider_settings or env
        let geminiKey = process.env.GEMINI_API_KEY || '';
        let geminiBase = 'https://generativelanguage.googleapis.com/v1beta';
        let geminiModel = 'gemini-2.5-flash';
        try {
          const aiRow = db
            .prepare('SELECT gemini_api_key, gemini_base_url, gemini_model FROM ai_provider_settings WHERE id = 1')
            .get() as any;
          if (aiRow?.gemini_api_key) geminiKey = String(aiRow.gemini_api_key).trim();
          if (aiRow?.gemini_base_url) {
            geminiBase = String(aiRow.gemini_base_url).trim().replace(/\/+$/, '').replace(/\/openai$/i, '');
          }
          if (aiRow?.gemini_model) geminiModel = String(aiRow.gemini_model).trim();
        } catch {}

        if (!geminiKey) {
          return NextResponse.json(
            { success: false, message: 'Gemini API anahtarı bulunamadı (Ayarlar → AI Ayarları bölümünden tanımlayın).' },
            { status: 400 }
          );
        }

        const promptText =
          'You are an expert Russian accounting OCR extractor. Extract EVERY patent NDFL payment receipt (чек по операции / оплата НДФЛ в виде авансового платежа по патенту) from ALL pages of this document.\n' +
          'Return ONLY a valid JSON array (no markdown fences) where each element has:\n' +
          '{"page": number, "full_name": "ФИО Плательщика in Cyrillic uppercase/titlecase", "inn": "12-digit INN or empty", "op_date": "YYYY-MM-DD", "amount": number, "kbk": "20-digit KBK or empty", "suip": "receipt/SUIP number or empty"}\n' +
          'Important: extract every single page that contains a receipt. Convert Russian dates like "23 ноября 2026" to "2026-11-23".';

        const modelCandidates = Array.from(new Set([geminiModel, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'].filter(Boolean)));
        let activeModel = modelCandidates[0];
        let firstGeminiErr = '';
        const extractedAll: any[] = [];
        for (let i = 0; i < chunks.length; i += 2) {
          const batch = chunks.slice(i, i + 2);
          const batchRes = await Promise.all(
            batch.map(async (ch) => {
              const tryModels = [activeModel, ...modelCandidates.filter((m) => m !== activeModel)];
              for (const mdl of tryModels) {
                try {
                  const url = `${geminiBase}/models/${encodeURIComponent(mdl)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
                  const gRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [
                        {
                          parts: [
                            { text: promptText },
                            { inline_data: { mime_type: ch.mime, data: ch.b64 } },
                          ],
                        },
                      ],
                      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
                    }),
                  });
                  if (!gRes.ok) {
                    const errTxt = await gRes.text().catch(() => '');
                    if (!firstGeminiErr) firstGeminiErr = `Gemini (${mdl}) HTTP ${gRes.status}: ${errTxt.slice(0, 180)}`;
                    if (gRes.status === 404 || gRes.status === 400) continue;
                    return [];
                  }
                  activeModel = mdl;
                  const gJson: any = await gRes.json().catch(() => null);
                  const rawText = gJson?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
                  const parsedArr = JSON.parse(cleaned);
                  if (!Array.isArray(parsedArr)) return [];
                  return parsedArr.map((item: any, idx: number) => ({
                    ...item,
                    source_chunk: ch.name,
                    page: (ch.pageStart || 1) + (Number(item.page) > 0 ? Number(item.page) - 1 : idx),
                  }));
                } catch (e: any) {
                  if (!firstGeminiErr) firstGeminiErr = `Gemini OCR hatası: ${e?.message || String(e)}`;
                }
              }
              return [];
            })
          );
          for (const arr of batchRes) extractedAll.push(...arr);
        }

        if (extractedAll.length === 0 && firstGeminiErr) {
          return NextResponse.json(
            { success: false, message: firstGeminiErr },
            { status: 502 }
          );
        }

        // Match against existing patent_ndfl_records in DB for smart suggestions & duplicate check
        const existingRecs = db
          .prepare('SELECT full_name, norm_name, tabel_no, ifns_code, is_active, receipts_json FROM patent_ndfl_records WHERE tax_year = ?')
          .all(taxYear) as any[];
        const recByNorm = new Map<string, any>();
        for (const er of existingRecs) recByNorm.set(String(er.norm_name || ''), er);

        const RU_MONTH_NAMES = ['', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
        const normKeyFn = (s: any) => String(s || '').trim().toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ');

        const enriched = extractedAll
          .filter((x) => x && (x.full_name || Number(x.amount) > 0))
          .map((x, idx) => {
            const rawName = String(x.full_name || '').trim();
            const nn = normKeyFn(rawName);
            let matched = recByNorm.get(nn);
            if (!matched && nn) {
              const firstTwo = nn.split(' ').slice(0, 2).join(' ');
              if (firstTwo.length >= 6) {
                for (const [k, v] of Array.from(recByNorm.entries())) {
                  if (k.startsWith(firstTwo)) {
                    matched = v;
                    break;
                  }
                }
              }
            }
            const amount = Math.round(Number(x.amount || 0));
            const opDate = String(x.op_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
            const kbk = String(x.kbk || '').replace(/\D/g, '');
            const kbkOk = !kbk || kbk === '18210102040011000110';
            let existingReceipts: any[] = [];
            try {
              if (matched?.receipts_json) existingReceipts = JSON.parse(String(matched.receipts_json));
            } catch {}
            const isDuplicate = existingReceipts.some(
              (rc) => String(rc.opDate || '').slice(0, 10) === opDate && Math.abs(Number(rc.amount || 0) - amount) <= 10
            );
            const rate = 8000;
            const estMonths = Math.max(1, Math.min(6, Math.round(amount / rate)));
            const coveredSoFar = existingReceipts.flatMap((rc) => (Array.isArray(rc.months) ? rc.months : []));
            const lastCovered = coveredSoFar.length > 0 ? Math.max(...coveredSoFar) : 0;
            const opMonth = parseInt(opDate.slice(5, 7), 10) || 1;
            const startM = lastCovered > 0 && lastCovered < 12 ? lastCovered + 1 : opMonth;
            const monthNames: string[] = [];
            for (let m = 0; m < estMonths && startM + m <= 12; m++) {
              monthNames.push(RU_MONTH_NAMES[startM + m]);
            }
            const suggestedComment = monthNames.join('-');

            const pageNum = Number(x.page || idx + 1);
            const pFile = pageFileByNum.get(pageNum);
            return {
              id: `rc_${Date.now()}_${idx}`,
              page: pageNum,
              source_chunk: x.source_chunk || file.name,
              full_name: matched?.full_name || rawName,
              raw_name: rawName,
              matched_in_1c: Boolean(matched),
              tabel_no: matched?.tabel_no || '',
              inn: String(x.inn || '').replace(/\D/g, ''),
              op_date: opDate,
              amount,
              kbk,
              kbk_ok: kbkOk,
              suip: String(x.suip || '').trim(),
              is_duplicate: isDuplicate,
              suggested_comment: suggestedComment,
              selected: !isDuplicate && amount > 0 && Boolean(matched || rawName),
              receipt_file_id: pFile?.id || '',
              receipt_file_url: pFile?.url || '',
            };
          });

        return NextResponse.json({
          success: true,
          count: enriched.length,
          chunksProcessed: chunks.length,
          receipts: enriched,
          message: `${file.name}: ${enriched.length} patent ödeme fişi AI OCR ile okundu (${chunks.length} parça).`,
        });
      }

      // Mode: Parse official FNS Notification PDF (КНД 1125023)
      if (uploadMode === 'notification_pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const tmpPath = path.join(os.tmpdir(), `fns_notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.pdf`);
        fs.writeFileSync(tmpPath, buf);
        const scriptPath = path.join(process.cwd(), 'scripts', 'parse_fns_notification_pdf.py');
        const bins = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
        let parsed: any = null;
        for (const bin of bins) {
          try {
            const res = spawnSync(bin, [scriptPath, tmpPath], { encoding: 'utf-8', timeout: 25000 });
            if (res.stdout && res.stdout.trim()) {
              parsed = JSON.parse(res.stdout.trim());
              break;
            }
          } catch {}
        }
        try {
          fs.unlinkSync(tmpPath);
        } catch {}

        if (!parsed || !parsed.success || !parsed.full_name) {
          return NextResponse.json(
            { success: false, message: parsed?.message || `${file.name}: Уведомление ИФНС metni okunamadı.` },
            { status: 400 }
          );
        }

        upsertPatentNdflRecord(db, {
          tax_year: taxYear,
          org_name: orgName || 'Уведомление ИФНС',
          tabel_no: '',
          full_name: parsed.full_name,
          citizenship: '',
          is_active: 1,
          site_name: '',
          region: '',
          hire_date: '',
          exit_date: '',
          has_notification: 1,
          notification_no: parsed.notification_no || '',
          notification_date: parsed.notification_date || '',
          ifns_code: parsed.ifns_name ? String(parsed.ifns_name).slice(0, 60) : '',
          application_date: '',
          application_status: 'Уведомление получено (PDF)',
          ndfl_before_offset: 0,
          patent_advances: 0,
          patent_offset_used: 0,
          patent_advance_balance: 0,
          additional_offset_potential: 0,
          ndfl_withheld: 0,
          discrepancy_amount: 0,
          priority_label: '',
          recommended_action: '',
          responsible_person: '',
          manual_status: '',
          notes: parsed.inn ? `ИНН: ${parsed.inn}` : '',
          source_file: file.name,
        });

        return NextResponse.json({
          success: true,
          parsed,
          message: `Уведомление № ${parsed.notification_no || '?'} (${parsed.notification_date || ''}) → ${parsed.full_name} işlendi!`,
        });
      }

      const res = importPatentNdflWorkbook(db, buf, file.name, taxYear, orgName);
      return NextResponse.json({
        success: true,
        ...res,
        message: `${file.name} içe aktarıldı (${res.importedRecords} çalışan${res.importedDiscrepancies ? `, ${res.importedDiscrepancies} uyuşmazlık` : ''}).`,
      });
    }

    const body = await request.json();
    const action = String(body?.action || '').trim();

    if (action === 'save_odata_config') {
      const saved = savePatentODataConfig(db, body?.config || {});
      return NextResponse.json({
        success: true,
        message: '1C ZUP OData ayarları kaydedildi.',
        odataConfig: {
          ...saved,
          hasPassword: Boolean(saved.password),
          password: saved.password ? '••••••••' : '',
        },
      });
    }

    if (action === 'sync_odata') {
      if (body?.config) savePatentODataConfig(db, body.config);
      const syncRes = await syncPatentNdflFromOData(db);
      return NextResponse.json(syncRes);
    }

    if (action === 'create_1c_receipt') {
      const receiptFileId = String(body?.receiptFileId || '').trim();
      let attachment: { fileName: string; mimeType: string; base64Data: string; sizeBytes: number } | undefined;
      if (receiptFileId) {
        const fRow = db.prepare('SELECT file_name, mime_type, file_path, file_size FROM patent_receipt_files WHERE id = ?').get(receiptFileId) as any;
        if (fRow?.file_path && fs.existsSync(fRow.file_path)) {
          const fBuf = fs.readFileSync(fRow.file_path);
          attachment = {
            fileName: String(fRow.file_name || 'receipt.pdf'),
            mimeType: String(fRow.mime_type || 'application/pdf'),
            base64Data: fBuf.toString('base64'),
            sizeBytes: fBuf.length,
          };
        }
      }
      const res = await create1cPatentReceipt(db, {
        fullName: String(body?.fullName || ''),
        taxYear: Number(body?.taxYear) || 2026,
        amount: Number(body?.amount) || 0,
        opDate: String(body?.opDate || ''),
        docDate: body?.docDate ? String(body.docDate) : undefined,
        comment: String(body?.comment || ''),
        postDoc: body?.postDoc !== false,
        attachment,
      });
      if (receiptFileId && res.success) {
        const nn = String(body?.fullName || '').trim().toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ');
        try {
          db.prepare(`
            UPDATE patent_receipt_files
            SET norm_name = ?, full_name = ?, op_date = ?, amount = ?, comment = ?, doc_number = ?, onec_ref_key = ?, attached_in_1c = ?, attach_1c_note = ?
            WHERE id = ?
          `).run(
            nn,
            String(body?.fullName || ''),
            String(body?.opDate || ''),
            Number(body?.amount) || 0,
            String(body?.comment || ''),
            String(res.number || ''),
            String(res.refKey || ''),
            res.attachedIn1C ? 1 : 0,
            String(res.attachMessage || ''),
            receiptFileId
          );
        } catch {}
      }
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (action === 'delete_1c_receipt') {
      const res = await delete1cPatentReceipt(db, String(body?.refKey || ''));
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    if (action === 'update_record') {
      const id = Number(body?.id);
      if (!id) return NextResponse.json({ success: false, message: 'Geçersiz kayıt ID.' }, { status: 400 });
      db.prepare(`
        UPDATE patent_ndfl_records
        SET responsible_person = ?, manual_status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        String(body?.responsible_person || '').trim(),
        String(body?.manual_status || '').trim(),
        String(body?.notes || '').trim(),
        id
      );
      return NextResponse.json({ success: true, message: 'Kayıt güncellendi.' });
    }

    if (action === 'toggle_region_excluded') {
      const id = Number(body?.id);
      const excluded = body?.excluded ? 1 : 0;
      if (!id) return NextResponse.json({ success: false, message: 'Geçersiz kayıt ID.' }, { status: 400 });
      db.prepare(`
        UPDATE patent_ndfl_records
        SET excluded_region_change = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(excluded, id);
      return NextResponse.json({
        success: true,
        message: excluded
          ? 'Kayıt "Bölge Değişikliği (Mahsup Planı Dışı)" olarak işaretlendi.'
          : 'Kayıt tekrar mahsup planına dahil edildi.',
      });
    }

    if (action === 'generate_fns_xml') {
      const xmlRes = buildFnsKnd1110055Xml(db, {
        taxYear: Number(body?.taxYear) || 2026,
        kodNO: String(body?.kodNO || '4707'),
        appNo: String(body?.appNo || '1'),
        orgName: String(body?.orgName || 'Общество с ограниченной ответственностью "МОНТАЖЭНЕРГОСТРОЙ"'),
        innUl: String(body?.innUl || '7702424557'),
        kpp: String(body?.kpp || '470745001'),
        signerInn: String(body?.signerInn || '526005515667'),
        signerFam: String(body?.signerFam || 'Акчам'),
        signerNam: String(body?.signerNam || 'Месут'),
        recordIds: Array.isArray(body?.recordIds) ? body.recordIds : undefined,
      });
      return new NextResponse(new Uint8Array(xmlRes.buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=windows-1251',
          'Content-Disposition': `attachment; filename="${xmlRes.fileName}"`,
          'X-Included-Count': String(xmlRes.includedCount),
          'X-Missing-Inn-Count': String(xmlRes.skippedMissingInn),
        },
      });
    }

    if (action === 'clear_year') {
      const taxYear = Number(body?.taxYear) || 2026;
      db.prepare('DELETE FROM patent_ndfl_records WHERE tax_year = ?').run(taxYear);
      db.prepare('DELETE FROM patent_ndfl_discrepancies WHERE tax_year = ?').run(taxYear);
      return NextResponse.json({ success: true, message: `${taxYear} yılı Patent/NDFL kayıtları temizlendi.` });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Patent & NDFL işlemi başarısız.' },
      { status: 500 }
    );
  }
}
