import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  buildFnsKnd1110055Xml,
  classifyPatentRootCause,
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
      const disc = await discoverODataNdflEntities(db);
      return NextResponse.json(disc);
    }
    const taxYear = Number(searchParams.get('year')) || 2026;

    const rawRecords = db
      .prepare('SELECT * FROM patent_ndfl_records WHERE tax_year = ? ORDER BY additional_offset_potential DESC, ndfl_withheld DESC')
      .all(taxYear) as any[];

    const rawMonthly = db
      .prepare('SELECT * FROM patent_ndfl_monthly WHERE tax_year = ? ORDER BY month_num ASC')
      .all(taxYear) as any[];

    const MONTH_SHORT_TR = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const fmtRubInline = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
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

    const records = rawRecords.map((r) => {
      const nn = String(r.norm_name || '');
      const mp = rawMonthlyByNorm.get(nn);
      const hasNotif = Boolean(r.has_notification);
      const notifMonth = hasNotif ? parseNotifMonth(r.notification_date) : 0;
      const totalAdvances = Math.round(Number(r.patent_advances || 0));

      const months: Array<{
        month: number;
        label: string;
        patent_paid: number;
        ndfl_calc: number;
        offset_used: number;
        ndfl_withheld: number;
        unoffset_gap: number;
        is_notif_month: boolean;
        is_after_notif: boolean;
        status_code: string;
        analysis_note: string;
      }> = [];

      if (mp && mp.size > 0) {
        let cumOffsetUsed = 0;
        for (let mNum = 1; mNum <= 12; mNum++) {
          const row = mp.get(mNum);
          const isNotifMonth = hasNotif && notifMonth > 0 && mNum === notifMonth;
          if (!row && !isNotifMonth) continue;

          const patentPaid = row?.patent_paid || 0;
          const ndflCalc = row?.ndfl_calc || 0;
          const offsetUsed = row?.offset_used || 0;
          const ndflWithheld = row?.ndfl_withheld || 0;
          const isAfterNotif = hasNotif && (notifMonth === 0 || mNum >= notifMonth);
          const isBeforeNotif = hasNotif && notifMonth > 0 && mNum < notifMonth;

          const remainingAdvanceBefore = Math.max(0, totalAdvances - cumOffsetUsed);
          const maxOffsetable = Math.min(ndflCalc, remainingAdvanceBefore);
          const unoffsetGap = ndflCalc > 0 && offsetUsed < maxOffsetable ? Math.round(maxOffsetable - offsetUsed) : 0;

          let statusCode = 'no_ndfl';
          let analysisNote = 'НДФЛ yok';

          if (!hasNotif) {
            if (ndflCalc > 0 && offsetUsed === 0) {
              statusCode = 'no_notif';
              analysisNote = `ФНС izni yok — ${fmtRubInline(ndflCalc)} НДФЛ kesildi, mahsup yapılamadı`;
            } else if (patentPaid > 0 && ndflCalc === 0) {
              statusCode = 'patent_only';
              analysisNote = `Patent ödendi (${fmtRubInline(patentPaid)}), НДФЛ yok · ФНС izni eksik`;
            } else {
              statusCode = 'no_ndfl';
              analysisNote = 'НДФЛ yok · ФНС izni eksik';
            }
          } else if (isBeforeNotif) {
            if (ndflCalc > 0 && offsetUsed === 0) {
              statusCode = 'pre_notif_missed';
              analysisNote = `İzin öncesi — ${fmtRubInline(ndflCalc)} НДФЛ kesildi (izin ${MONTH_SHORT_TR[notifMonth]}'da alındı → geriye dönük mahsup/iade)`;
            } else if (offsetUsed > 0 && offsetUsed >= ndflCalc) {
              statusCode = 'full_offset';
              analysisNote = `✓ Geriye dönük tam mahsup edildi (${fmtRubInline(offsetUsed)})`;
            } else if (offsetUsed > 0) {
              statusCode = 'partial_missed';
              analysisNote = `İzin öncesi kısmi mahsup (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — ${fmtRubInline(ndflCalc - offsetUsed)} kesildi`;
            } else if (patentPaid > 0) {
              statusCode = 'patent_only';
              analysisNote = `İzin öncesi — Patent ödendi (${fmtRubInline(patentPaid)}), bu ay НДФЛ yok`;
            } else {
              statusCode = 'no_ndfl';
              analysisNote = 'İzin öncesi — НДФЛ yok';
            }
          } else {
            // Notification month and after (mahsup eligible period)
            if (offsetUsed > 0 && ndflCalc === 0) {
              statusCode = 'retro_offset';
              analysisNote = `✓ Geçmiş ay mahsubu uygulandı (+${fmtRubInline(offsetUsed)})`;
            } else if (offsetUsed > 0 && offsetUsed > ndflCalc) {
              statusCode = 'retro_offset';
              analysisNote = `✓ НДФЛ kadar (${fmtRubInline(ndflCalc)}) + geçmiş ay mahsubu (+${fmtRubInline(offsetUsed - ndflCalc)})`;
            } else if (offsetUsed > 0 && offsetUsed >= ndflCalc) {
              statusCode = 'full_offset';
              analysisNote = `✓ НДФЛ kadar tam mahsup edildi (${fmtRubInline(offsetUsed)})`;
            } else if (offsetUsed > 0 && offsetUsed < ndflCalc) {
              if (unoffsetGap === 0) {
                statusCode = 'patent_cap';
                analysisNote = `Patent avansı kadar mahsup edildi (${fmtRubInline(offsetUsed)}), kalan ${fmtRubInline(ndflCalc - offsetUsed)} НДФЛ kesildi`;
              } else {
                statusCode = 'partial_missed';
                analysisNote = `⚠ Kısmi mahsup (${fmtRubInline(offsetUsed)} / ${fmtRubInline(ndflCalc)}) — ${fmtRubInline(unoffsetGap)} eksik mahsup`;
              }
            } else if (offsetUsed === 0 && ndflCalc > 0) {
              if (unoffsetGap > 0) {
                statusCode = 'post_notif_missed';
                analysisNote = `⚠ Mahsup YAPILMADI! İzin var & avans bakiyesi yeterli, ${fmtRubInline(ndflCalc)} НДФЛ kesildi`;
              } else {
                statusCode = 'advance_exhausted';
                analysisNote = `Patent avansı tükendi — ${fmtRubInline(ndflCalc)} НДФЛ kesildi`;
              }
            } else if (patentPaid > 0) {
              statusCode = 'patent_only';
              analysisNote = isNotifMonth
                ? `Уведомление alındı · Patent ödendi (${fmtRubInline(patentPaid)}), bu ay НДФЛ yok`
                : `Patent ödendi (${fmtRubInline(patentPaid)}), bu ay НДФЛ yok`;
            } else {
              statusCode = 'no_ndfl';
              analysisNote = isNotifMonth ? 'Уведомление bu ay alındı — bu ay НДФЛ yok' : 'НДФЛ yok';
            }
          }

          cumOffsetUsed += offsetUsed;

          months.push({
            month: mNum,
            label: MONTH_SHORT_TR[mNum],
            patent_paid: patentPaid,
            ndfl_calc: ndflCalc,
            offset_used: offsetUsed,
            ndfl_withheld: ndflWithheld,
            unoffset_gap: unoffsetGap,
            is_notif_month: isNotifMonth,
            is_after_notif: isAfterNotif,
            status_code: statusCode,
            analysis_note: analysisNote,
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
          gap: m.unoffset_gap,
          phase: m.is_after_notif ? 'post_notif' : hasNotif ? 'pre_notif' : 'no_notif',
        }));

      return {
        ...r,
        notif_month: notifMonth,
        root_cause: classifyPatentRootCause(r),
        months,
        missing_months: missingMonths,
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

    // Root-cause breakdown (excluding region-changed from actionable offset plan)
    const causeCounts = {
      NO_NOTIFICATION: 0,
      REGION_CHANGED: 0,
      LATE_NOTIFICATION_VOZVRAT: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    };
    const causeRub = {
      NO_NOTIFICATION: 0,
      REGION_CHANGED: 0,
      LATE_NOTIFICATION_VOZVRAT: 0,
      LOW_NDFL: 0,
      FULL_OFFSET: 0,
    };
    let vozvratActiveRub = 0;
    let vozvratActiveCount = 0;
    let vozvratDismissedRub = 0;
    let vozvratDismissedCount = 0;

    for (const r of records) {
      const adv = Number(r.patent_advances || 0);
      const used = Number(r.patent_offset_used || 0);
      const bal = Number(r.patent_advance_balance || 0);
      const pot = Number(r.additional_offset_potential || 0);
      const cause = r.root_cause as keyof typeof causeCounts;

      causeCounts[cause] = (causeCounts[cause] || 0) + 1;

      if (cause === 'REGION_CHANGED') {
        causeRub.REGION_CHANGED += bal;
        // Excluded from actionable offset plan
        continue;
      }

      totalAdvances += adv;
      totalOffsetUsed += used;
      totalBalance += bal;
      totalPotential += pot;

      if (cause === 'NO_NOTIFICATION') causeRub.NO_NOTIFICATION += Number(r.ndfl_withheld || 0);
      else if (cause === 'LATE_NOTIFICATION_VOZVRAT') {
        causeRub.LATE_NOTIFICATION_VOZVRAT += pot;
        if (r.is_active) {
          vozvratActiveRub += pot;
          vozvratActiveCount++;
        } else {
          vozvratDismissedRub += pot;
          vozvratDismissedCount++;
        }
      } else if (cause === 'LOW_NDFL') causeRub.LOW_NDFL += bal;
      else if (cause === 'FULL_OFFSET') causeRub.FULL_OFFSET += used;

      if (r.is_active && pot > 0) {
        activePotential += pot;
        activePotentialCount++;
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
          REGION_CHANGED: Math.round(causeRub.REGION_CHANGED),
          LATE_NOTIFICATION_VOZVRAT: Math.round(causeRub.LATE_NOTIFICATION_VOZVRAT),
          LOW_NDFL: Math.round(causeRub.LOW_NDFL),
          FULL_OFFSET: Math.round(causeRub.FULL_OFFSET),
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
