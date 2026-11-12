import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { createPreActionBackup } from '@/lib/backup';
import { searchPonderaPeople35k } from '@/lib/aiTicketEngine';
import {
  checkAndSendQuotaAlerts,
  classifyApplicationType,
  ensureQuotaTables,
  getQuotaOverviewData,
  isApprovedQuotaStatus,
  normalizeRegionCode,
  normalizeTrancheCode,
  resolveCountryByCodeOrName,
  resolveOccupationByCodeOrName,
  saveQuotaAlertSettings,
} from '@/lib/quotaManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = (searchParams.get('action') || '').trim();

    if (action === 'search_people') {
      const q = (searchParams.get('q') || '').trim();
      if (q.length < 2) {
        return NextResponse.json({ success: true, employees: [] });
      }
      const employees = searchPonderaPeople35k(q, 25);
      return NextResponse.json({ success: true, employees });
    }

    const rawYear = (searchParams.get('year') || 'all').trim();
    const yearParam: number | 'all' =
      rawYear === 'all' || !/^\d{4}$/.test(rawYear) ? 'all' : Number(rawYear);

    const data = getQuotaOverviewData(yearParam);
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Kota verileri alınamadı.' },
      { status: 500 }
    );
  }
}

function buildProportionalLinesForRegion(
  db: any,
  year: number,
  regionCode: string,
  targetQty: number
): Array<{
  occupationCode: string;
  occupationTr: string;
  occupationRu: string;
  countryCode: string;
  countryTr: string;
  allocatedQty: number;
}> {
  const rows = db
    .prepare(
      'SELECT occupation_code, occupation_tr, occupation_ru, SUM(approved_qty) AS tot FROM quota_allocations WHERE year = ? AND region_code = ? GROUP BY occupation_code'
    )
    .all(year, regionCode) as Array<{
    occupation_code: string;
    occupation_tr: string;
    occupation_ru: string;
    tot: number;
  }>;

  const pos = rows.filter((r) => Number(r.tot || 0) > 0).sort((a, b) => b.tot - a.tot);
  const sumPool = pos.reduce((s, r) => s + Number(r.tot || 0), 0);

  if (pos.length > 0 && sumPool > 0) {
    const out: Array<{
      occupationCode: string;
      occupationTr: string;
      occupationRu: string;
      countryCode: string;
      countryTr: string;
      allocatedQty: number;
    }> = [];
    let assigned = 0;
    for (let i = 0; i < pos.length; i++) {
      const it = pos[i];
      const q =
        i === pos.length - 1
          ? targetQty - assigned
          : Math.min(targetQty - assigned, Math.round(targetQty * (Number(it.tot) / sumPool)));
      if (q > 0) {
        out.push({
          occupationCode: it.occupation_code || '102660',
          occupationTr: it.occupation_tr || 'Proses borusu montajcısı',
          occupationRu: it.occupation_ru || 'Монтажник технологических трубопроводов',
          countryCode: '',
          countryTr: '',
          allocatedQty: q,
        });
        assigned += q;
      }
    }
    if (out.length > 0) return out;
  }

  return [
    {
      occupationCode: '102660',
      occupationTr: 'Proses borusu montajcısı',
      occupationRu: 'Монтажник технологических трубопроводов',
      countryCode: '',
      countryTr: '',
      allocatedQty: targetQty,
    },
  ];
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser || sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için Admin / düzenleme yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const actorName = sessionUser.name || sessionUser.email || 'Admin';
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const todayDate = nowIso.slice(0, 10);

    const db = ensureQuotaTables();
    const body = await request.json();
    const action = String(body?.action || '').trim();

    // 1. Create or Update ИРС (РНП) Certificate + Occupation Lines
    if (action === 'save_irs_certificate') {
      const cert = body?.certificate || {};
      const certNo = String(cert.certificate_no ?? cert.certificateNo ?? '').trim();
      if (!certNo) {
        return NextResponse.json(
          { success: false, message: 'ИРС (РНП) sertifika numarası zorunludur.' },
          { status: 400 }
        );
      }

      const quotaYear = Number(cert.quota_year ?? cert.quotaYear ?? 2026) || 2026;
      const normReg = normalizeRegionCode(cert.region_code ?? cert.regionCode ?? 'MURMANSK');
      const regionCode = normReg.regionCode;
      const projectName = String(cert.project_name ?? cert.projectName ?? normReg.projectName).trim();
      const trancheLabel = String(cert.tranche_label ?? cert.trancheLabel ?? 'IRS1').trim();
      const trancheCode = normalizeTrancheCode(cert.tranche_code ?? cert.trancheCode ?? trancheLabel);
      const issueDate = String(cert.issue_date ?? cert.issueDate ?? todayDate).trim();
      const validFrom = String(cert.valid_from ?? cert.validFrom ?? todayDate).trim();
      const validUntil = String(cert.valid_until ?? cert.validUntil ?? `${quotaYear + 1}-05-31`).trim();
      const stateDuty = Number(cert.state_duty_per_person ?? cert.stateDutyPerPerson ?? 15000) || 15000;
      const status =
        cert.status === 'planned' ? 'planned' : cert.status === 'expired' ? 'expired' : 'active';
      const notes = String(cert.notes ?? '').trim();

      const rawLines: Array<Record<string, any>> = Array.isArray(cert.lines) ? cert.lines : [];
      if (rawLines.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: 'Sertifika altında en az 1 görev (ОКПДТР kodu) ve kontenjan satırı tanımlanmalıdır.',
          },
          { status: 400 }
        );
      }

      db.exec('BEGIN');
      try {
        const existing = db
          .prepare('SELECT id FROM quota_irs_certificates WHERE certificate_no = ? LIMIT 1')
          .get(certNo) as { id: number } | undefined;

        let certId = existing?.id || 0;
        if (existing) {
          db.prepare(`
            UPDATE quota_irs_certificates
            SET tranche_code = ?,
                tranche_label = ?,
                quota_year = ?,
                region_code = ?,
                project_name = ?,
                issue_date = ?,
                valid_from = ?,
                valid_until = ?,
                state_duty_per_person = ?,
                status = ?,
                notes = ?,
                updated_at = ?
            WHERE id = ?
          `).run(
            trancheCode,
            trancheLabel,
            quotaYear,
            regionCode,
            projectName,
            issueDate,
            validFrom,
            validUntil,
            stateDuty,
            status,
            notes,
            nowIso,
            certId
          );
          db.prepare('DELETE FROM quota_irs_lines WHERE certificate_no = ?').run(certNo);
        } else {
          const ins = db
            .prepare(`
              INSERT INTO quota_irs_certificates (
                certificate_no, tranche_code, tranche_label, quota_year, region_code, project_name,
                issue_date, valid_from, valid_until, state_duty_per_person, status,
                notes, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              certNo,
              trancheCode,
              trancheLabel,
              quotaYear,
              regionCode,
              projectName,
              issueDate,
              validFrom,
              validUntil,
              stateDuty,
              status,
              notes,
              actorName,
              nowIso,
              nowIso
            );
          certId = Number(ins.lastInsertRowid);
        }

        const insLine = db.prepare(`
          INSERT INTO quota_irs_lines (
            certificate_id, certificate_no, quota_record_code,
            country_code, country_tr, occupation_code, occupation_tr, occupation_ru, allocated_qty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const ln of rawLines) {
          const qty = Math.max(0, Number(ln.allocated_qty ?? ln.allocatedQty ?? 0) || 0);
          if (qty <= 0) continue;
          const occResolved = resolveOccupationByCodeOrName(
            ln.occupation_code ?? ln.occupationCode,
            ln.occupation_tr ?? ln.occupationTr
          );
          const cntryResolved = resolveCountryByCodeOrName(
            ln.country_code ?? ln.countryCode,
            ln.country_tr ?? ln.countryTr
          );
          insLine.run(
            certId,
            certNo,
            String(ln.quota_record_code ?? ln.quotaRecordCode ?? '').trim(),
            cntryResolved.code,
            cntryResolved.nameTr,
            occResolved.code,
            occResolved.nameTr || String(ln.occupation_tr ?? '').trim(),
            occResolved.nameRu || String(ln.occupation_ru ?? '').trim(),
            qty
          );
        }

        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        message: `ИРС (РНП) № ${certNo} (${trancheCode}) sertifikası ve görev kontenjanları kaydedildi.`,
      });
    }

    // 1b. Save Regional Note (Açıklama)
    if (action === 'save_region_note') {
      const quotaYear = Number(body?.quotaYear || 2026) || 2026;
      const normReg = normalizeRegionCode(body?.regionCode || '');
      const noteText = String(body?.noteText ?? '').trim();
      db.prepare(`
        INSERT OR REPLACE INTO quota_region_notes (
          quota_year, region_code, note_text, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(quotaYear, normReg.regionCode, noteText, actorName, nowIso);

      return NextResponse.json({
        success: true,
        message: `${normReg.regionLabelTr} (${quotaYear}) açıklama notu güncellendi.`,
      });
    }

    // 1c. Quick Save Regional IRS Tranches (IRS1, IRS2, IRS3 + Açıklama — e.g. Ust-Luga!)
    if (action === 'quick_save_region_irs') {
      const quotaYear = Number(body?.quotaYear || 2026) || 2026;
      const normReg = normalizeRegionCode(body?.regionCode || '');
      const noteText = body?.noteText !== undefined ? String(body.noteText).trim() : undefined;
      const tranches: Array<{ trancheCode: string; qty: number; validUntil?: string }> = [
        { trancheCode: 'IRS1', qty: Math.max(0, Number(body?.irs1Qty || 0) || 0), validUntil: body?.validUntil },
        { trancheCode: 'IRS2', qty: Math.max(0, Number(body?.irs2Qty || 0) || 0), validUntil: body?.validUntil },
        { trancheCode: 'IRS3', qty: Math.max(0, Number(body?.irs3Qty || 0) || 0), validUntil: body?.validUntil },
      ];

      db.exec('BEGIN');
      try {
        if (noteText !== undefined) {
          db.prepare(`
            INSERT OR REPLACE INTO quota_region_notes (
              quota_year, region_code, note_text, updated_by, updated_at
            ) VALUES (?, ?, ?, ?, ?)
          `).run(quotaYear, normReg.regionCode, noteText, actorName, nowIso);
        }

        for (const t of tranches) {
          const existing = db
            .prepare(
              'SELECT * FROM quota_irs_certificates WHERE quota_year = ? AND region_code = ? AND tranche_code = ? ORDER BY id ASC LIMIT 1'
            )
            .get(quotaYear, normReg.regionCode, t.trancheCode) as Record<string, any> | undefined;

          if (t.qty <= 0) {
            if (existing && String(existing.certificate_no || '').startsWith(`${quotaYear}-`)) {
              const hasWorkers = db
                .prepare('SELECT COUNT(*) AS c FROM quota_worker_applications WHERE certificate_no = ?')
                .get(existing.certificate_no) as { c?: number } | undefined;
              if (!hasWorkers?.c) {
                db.prepare('DELETE FROM quota_irs_lines WHERE certificate_no = ?').run(
                  existing.certificate_no
                );
                db.prepare('DELETE FROM quota_irs_certificates WHERE id = ?').run(existing.id);
              }
            }
            continue;
          }

          const certNo =
            existing?.certificate_no ||
            `${quotaYear}-${normReg.regionCode.slice(0, 6)}-${t.trancheCode}`;
          const validUntil =
            String(t.validUntil || existing?.valid_until || `${quotaYear + 1}-05-31`).trim();

          let certId = existing?.id || 0;
          if (existing) {
            db.prepare(`
              UPDATE quota_irs_certificates
              SET valid_until = ?, notes = COALESCE(?, notes), updated_at = ?
              WHERE id = ?
            `).run(validUntil, noteText ?? null, nowIso, certId);
            db.prepare('DELETE FROM quota_irs_lines WHERE certificate_no = ?').run(certNo);
          } else {
            const ins = db
              .prepare(`
                INSERT INTO quota_irs_certificates (
                  certificate_no, tranche_code, tranche_label, quota_year, region_code, project_name,
                  issue_date, valid_from, valid_until, state_duty_per_person, status,
                  notes, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15000, 'active', ?, ?, ?, ?)
              `)
              .run(
                certNo,
                t.trancheCode,
                `${t.trancheCode} (${normReg.regionLabelTr.split(' ')[0]})`,
                quotaYear,
                normReg.regionCode,
                normReg.projectName,
                todayDate,
                todayDate,
                validUntil,
                noteText || '',
                actorName,
                nowIso,
                nowIso
              );
            certId = Number(ins.lastInsertRowid);
          }

          const propLines = buildProportionalLinesForRegion(
            db,
            quotaYear,
            normReg.regionCode,
            t.qty
          );
          const insLine = db.prepare(`
            INSERT INTO quota_irs_lines (
              certificate_id, certificate_no, quota_record_code,
              country_code, country_tr, occupation_code, occupation_tr, occupation_ru, allocated_qty
            ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)
          `);
          for (const ln of propLines) {
            insLine.run(
              certId,
              certNo,
              ln.countryCode,
              ln.countryTr,
              ln.occupationCode,
              ln.occupationTr,
              ln.occupationRu,
              ln.allocatedQty
            );
          }
        }

        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        message: `${normReg.regionLabelTr} (${quotaYear}) parçalı İRS dilimleri (IRS1/IRS2/IRS3) ve açıklaması güncellendi.`,
      });
    }

    if (action === 'delete_irs_certificate') {
      const certNo = String(body?.certificateNo || '').trim();
      if (!certNo) {
        return NextResponse.json(
          { success: false, message: 'Sertifika numarası eksik.' },
          { status: 400 }
        );
      }
      db.prepare('DELETE FROM quota_irs_lines WHERE certificate_no = ?').run(certNo);
      db.prepare('DELETE FROM quota_irs_certificates WHERE certificate_no = ?').run(certNo);
      return NextResponse.json({
        success: true,
        message: `ИРС (РНП) № ${certNo} sertifikası silindi.`,
      });
    }

    // 2. Add Individual or Batch Worker Applications under an ИРС (РНП) Certificate
    if (action === 'add_worker_applications') {
      const certNo = String(body?.certificateNo ?? body?.certificate_no ?? '').trim();
      if (!certNo) {
        return NextResponse.json(
          { success: false, message: 'Lütfen başvurunun yapılacağı ИРС (РНП) sertifika numarasını girin veya seçin.' },
          { status: 400 }
        );
      }

      const workersInput: Array<Record<string, any>> = Array.isArray(body?.workers)
        ? body.workers
        : body?.worker
        ? [body.worker]
        : [];

      const validWorkers = workersInput.filter(
        (w) => String(w.full_name ?? w.fullName ?? '').trim().length > 0
      );
      if (validWorkers.length === 0) {
        return NextResponse.json(
          { success: false, message: 'En az 1 çalışan/aday adı (FIO) girilmelidir.' },
          { status: 400 }
        );
      }

      const certRow = db
        .prepare('SELECT * FROM quota_irs_certificates WHERE certificate_no = ? LIMIT 1')
        .get(certNo) as Record<string, any> | undefined;

      const defaultRegion = String(body?.regionCode ?? certRow?.region_code ?? '')
        .trim()
        .toUpperCase();
      const defaultProject = String(body?.projectName ?? certRow?.project_name ?? '').trim();

      const insertStmt = db.prepare(`
        INSERT INTO quota_worker_applications (
          certificate_no, quota_record_code, sicil_no, full_name, passport_no,
          country_code, country_tr, occupation_code, occupation_tr, occupation_ru,
          region_code, project_name, usage_type, application_status,
          application_date, rnr_number, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let insertedCount = 0;
      db.exec('BEGIN');
      try {
        for (const w of validWorkers) {
          const fullName = String(w.full_name ?? w.fullName ?? '').trim();
          const sicilNo = String(w.sicil_no ?? w.sicilNo ?? '').trim();
          const passportNo = String(w.passport_no ?? w.passportNo ?? '')
            .trim()
            .toUpperCase();
          const occResolved = resolveOccupationByCodeOrName(
            w.occupation_code ?? w.occupationCode ?? body?.occupationCode,
            w.occupation_tr ?? w.occupationTr ?? body?.occupationTr
          );
          const cntryResolved = resolveCountryByCodeOrName(
            w.country_code ?? w.countryCode ?? body?.countryCode,
            w.country_tr ?? w.countryTr ?? body?.countryTr
          );
          const regCode = String(w.region_code ?? w.regionCode ?? defaultRegion)
            .trim()
            .toUpperCase();
          const projName = String(w.project_name ?? w.projectName ?? defaultProject).trim();
          const usageType =
            (w.usage_type ?? w.usageType ?? body?.usageType) === 'visa_extension'
              ? 'visa_extension'
              : 'new_rnr';
          const appStatus = ['applied', 'rnr_approved', 'visa_issued', 'arrived', 'cancelled'].includes(
            w.application_status ?? w.applicationStatus ?? body?.applicationStatus
          )
            ? (w.application_status ?? w.applicationStatus ?? body?.applicationStatus)
            : 'applied';
          const appDate = String(
            w.application_date ?? w.applicationDate ?? body?.applicationDate ?? todayDate
          ).trim();
          const rnrNumber = String(w.rnr_number ?? w.rnrNumber ?? '').trim();
          const notes = String(w.notes ?? body?.notes ?? '').trim();
          const quotaRecCode = String(
            w.quota_record_code ?? w.quotaRecordCode ?? body?.quotaRecordCode ?? ''
          ).trim();

          insertStmt.run(
            certNo,
            quotaRecCode,
            sicilNo,
            fullName,
            passportNo,
            cntryResolved.code,
            cntryResolved.nameTr,
            occResolved.code,
            occResolved.nameTr,
            occResolved.nameRu,
            regCode,
            projName,
            usageType,
            appStatus,
            appDate,
            rnrNumber,
            notes,
            actorName,
            nowIso,
            nowIso
          );
          insertedCount += 1;
        }
        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      checkAndSendQuotaAlerts(false).catch(() => {});

      return NextResponse.json({
        success: true,
        insertedCount,
        message: `${insertedCount} çalışan başvurusu ИРС № ${certNo} sertifikasından düşülerek kaydedildi.`,
      });
    }

    if (action === 'update_worker_application') {
      const id = Number(body?.id || 0);
      if (!id) {
        return NextResponse.json({ success: false, message: 'Kayıt ID eksik.' }, { status: 400 });
      }
      const nextStatus = ['applied', 'rnr_approved', 'visa_issued', 'arrived', 'cancelled'].includes(
        body?.applicationStatus
      )
        ? body.applicationStatus
        : 'applied';
      const sicilNo = body?.sicilNo !== undefined ? String(body.sicilNo).trim() : undefined;
      const rnrNumber = body?.rnrNumber !== undefined ? String(body.rnrNumber).trim() : undefined;

      if (sicilNo !== undefined || rnrNumber !== undefined) {
        db.prepare(`
          UPDATE quota_worker_applications
          SET application_status = ?,
              sicil_no = COALESCE(?, sicil_no),
              rnr_number = COALESCE(?, rnr_number),
              updated_at = ?
          WHERE id = ?
        `).run(nextStatus, sicilNo ?? null, rnrNumber ?? null, nowIso, id);
      } else {
        db.prepare(
          'UPDATE quota_worker_applications SET application_status = ?, updated_at = ? WHERE id = ?'
        ).run(nextStatus, nowIso, id);
      }

      return NextResponse.json({
        success: true,
        message: 'Çalışan kota başvuru durumu güncellendi.',
      });
    }

    if (action === 'delete_worker_application') {
      const id = Number(body?.id || 0);
      if (id > 0) {
        db.prepare('DELETE FROM quota_worker_applications WHERE id = ?').run(id);
      }
      return NextResponse.json({
        success: true,
        message: 'Çalışan kota başvurusu silindi ve kontenjan iade edildi.',
      });
    }

    // 3. Create or Update Quota Allocation Row (Preserving signed +/- Azaltma quantities!)
    if (action === 'save_allocation') {
      const a = body?.allocation || {};
      const year = Number(a.year || 2026) || 2026;
      const normReg = normalizeRegionCode(a.region_code ?? a.regionCode ?? 'TATARISTAN');
      const regionCode = normReg.regionCode;
      const projectName = String(a.project_name ?? a.projectName ?? normReg.projectName).trim();
      const appType = String(a.application_type ?? a.applicationType ?? 'Esas başvuru').trim();
      const status = String(
        a.migrakvota_status ?? a.migrakvotaStatus ?? 'Onaylı (emir taslağında)'
      ).trim();
      const targetDate = String(a.target_date ?? a.targetDate ?? `${year}-01-01`).trim();
      const fileCode = String(a.file_code ?? a.fileCode ?? '').trim();

      const cntryResolved = resolveCountryByCodeOrName(
        a.country_code ?? a.countryCode,
        a.country_tr ?? a.countryTr
      );
      const occResolved = resolveOccupationByCodeOrName(
        a.occupation_code ?? a.occupationCode,
        a.occupation_tr ?? a.occupationTr
      );

      let reqQty = Math.trunc(Number(a.requested_qty ?? a.requestedQty ?? 0) || 0);
      if (classifyApplicationType(appType, reqQty) === 'azaltma' && reqQty > 0) {
        reqQty = -reqQty;
      }

      let appQty =
        a.approved_qty !== undefined || a.approvedQty !== undefined
          ? Math.trunc(Number(a.approved_qty ?? a.approvedQty ?? 0) || 0)
          : isApprovedQuotaStatus(status)
          ? reqQty
          : 0;
      if (reqQty < 0 && appQty > 0) {
        appQty = -appQty;
      }

      const irsQty = Math.max(0, Number(a.legacy_irs_qty ?? a.legacyIrsQty ?? 0) || 0);
      const openUse = Math.max(0, Number(a.opening_new_use ?? a.openingNewUse ?? 0) || 0);
      const extUse = Math.max(0, Number(a.extensions_use ?? a.extensionsUse ?? 0) || 0);
      const irsDocNo = String(a.irs_doc_no ?? a.irsDocNo ?? '').trim();
      const notes = String(a.notes ?? '').trim();

      let recCode = String(a.record_code ?? a.recordCode ?? '').trim();
      if (!recCode) {
        const maxRow = db
          .prepare('SELECT COUNT(*) AS c FROM quota_allocations WHERE year = ?')
          .get(year) as { c?: number } | undefined;
        const seq = Number(maxRow?.c || 0) + 1;
        recCode = `KV-${year}-${String(seq).padStart(4, '0')}`;
      }

      db.prepare(`
        INSERT INTO quota_allocations (
          record_code, file_code, raw_qty, year, application_type, migrakvota_status, target_date,
          region_code, project_name, country_code, country_tr, country_ru,
          occupation_code, occupation_tr, occupation_ru,
          requested_qty, approved_qty, legacy_irs_qty, opening_new_use, extensions_use,
          irs_doc_no, notes, updated_by, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(record_code) DO UPDATE SET
          file_code = excluded.file_code,
          raw_qty = excluded.raw_qty,
          year = excluded.year,
          application_type = excluded.application_type,
          migrakvota_status = excluded.migrakvota_status,
          target_date = excluded.target_date,
          region_code = excluded.region_code,
          project_name = excluded.project_name,
          country_code = excluded.country_code,
          country_tr = excluded.country_tr,
          country_ru = excluded.country_ru,
          occupation_code = excluded.occupation_code,
          occupation_tr = excluded.occupation_tr,
          occupation_ru = excluded.occupation_ru,
          requested_qty = excluded.requested_qty,
          approved_qty = excluded.approved_qty,
          legacy_irs_qty = excluded.legacy_irs_qty,
          opening_new_use = excluded.opening_new_use,
          extensions_use = excluded.extensions_use,
          irs_doc_no = excluded.irs_doc_no,
          notes = excluded.notes,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `).run(
        recCode,
        fileCode,
        Math.abs(reqQty),
        year,
        appType,
        status,
        targetDate,
        regionCode,
        projectName,
        cntryResolved.code,
        cntryResolved.nameTr,
        cntryResolved.nameRu,
        occResolved.code,
        occResolved.nameTr,
        occResolved.nameRu,
        reqQty,
        appQty,
        irsQty,
        openUse,
        extUse,
        irsDocNo,
        notes,
        actorName,
        nowIso
      );

      checkAndSendQuotaAlerts(false).catch(() => {});

      return NextResponse.json({
        success: true,
        recordCode: recCode,
        message: `${recCode} kota kaydı başarıyla kaydedildi.`,
      });
    }

    if (action === 'delete_allocation') {
      const recCode = String(body?.recordCode || '').trim();
      if (recCode) {
        db.prepare('DELETE FROM quota_allocations WHERE record_code = ?').run(recCode);
      }
      return NextResponse.json({
        success: true,
        message: `${recCode} kota kaydı silindi.`,
      });
    }

    // 4. Multi-Sheet Kota_2026-2027.xlsx Workbook Sync (Dosyalar + Veri + IRS sheets!)
    if (action === 'import_kota_workbook') {
      const sourceFiles: Array<Record<string, any>> = Array.isArray(body?.sourceFiles)
        ? body.sourceFiles
        : [];
      const veriRows: Array<Record<string, any>> = Array.isArray(body?.veriRows)
        ? body.veriRows
        : [];
      const irsRows: Array<Record<string, any>> = Array.isArray(body?.irsRows)
        ? body.irsRows
        : [];
      const replaceExisting = body?.replaceExisting !== false;

      if (veriRows.length === 0 && irsRows.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Yüklenen Excel içinde Veri veya IRS sekmesi bulunamadı.' },
          { status: 400 }
        );
      }

      try {
        createPreActionBackup(
          'quota_excel_import',
          'Kota_2026-2027 Excel Senkronizasyonu Öncesi Yedek',
          'Авто-копия перед синхронизацией Kota_2026-2027'
        );
      } catch {}

      let importedVeri = 0;
      let importedFiles = 0;
      let importedIrs = 0;

      db.exec('BEGIN');
      try {
        if (replaceExisting && veriRows.length > 0) {
          db.prepare('DELETE FROM quota_allocations').run();
          if (sourceFiles.length > 0) {
            db.prepare('DELETE FROM quota_source_files').run();
          }
        }

        const fileMap = new Map<string, Record<string, any>>();
        const insFile = db.prepare(`
          INSERT OR REPLACE INTO quota_source_files (
            file_code, year, source_filename, region_code, region_label, project_name,
            application_type, status_text, fill_date, countries_summary,
            row_count, net_effect, raw_total, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const sf of sourceFiles) {
          const fc = String(sf.fileCode || '').trim();
          if (!fc) continue;
          const normR = normalizeRegionCode(sf.regionLabel || sf.regionCode || '');
          fileMap.set(fc, sf);
          insFile.run(
            fc,
            Number(sf.year || 2026),
            String(sf.sourceFilename || '').trim(),
            normR.regionCode,
            String(sf.regionLabel || normR.regionLabelTr).trim(),
            normR.projectName,
            String(sf.applicationType || '').trim(),
            String(sf.status || '').trim(),
            String(sf.fillDate || '').trim(),
            String(sf.countriesSummary || '').trim(),
            Number(sf.rowCount || 0),
            Math.trunc(Number(sf.netEffect || 0)),
            Math.trunc(Number(sf.rawTotal || 0)),
            nowIso
          );
          importedFiles += 1;
        }

        const seqByFile: Record<string, number> = {};
        const insAlloc = db.prepare(`
          INSERT OR REPLACE INTO quota_allocations (
            record_code, file_code, source_filename, source_row, raw_qty,
            year, application_type, migrakvota_status, target_date,
            region_code, project_name, country_code, country_tr, country_ru,
            occupation_code, occupation_tr, occupation_ru,
            requested_qty, approved_qty, legacy_irs_qty, opening_new_use, extensions_use,
            irs_doc_no, notes, updated_by, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, 0, 0, 0,
            '', ?, ?, ?
          )
        `);

        for (let i = 0; i < veriRows.length; i++) {
          const r = veriRows[i];
          const fc = String(r.fileCode || '').trim();
          const year = Number(r.year || 2026) || 2026;
          const normR = normalizeRegionCode(r.region || r.regionCode || '');
          const cntry = resolveCountryByCodeOrName(r.countryCode, r.countryTr || r.countryRu);
          const occ = resolveOccupationByCodeOrName(r.occupationCode, r.occupationTr || r.occupationRu);
          const status = String(r.status || 'Onaylı (emir taslağında)').trim();
          const appType = String(r.applicationType || 'Esas başvuru').trim();
          let netQty = Math.trunc(Number(r.netQty ?? r.requestedQty ?? 0) || 0);
          if (classifyApplicationType(appType, netQty) === 'azaltma' && netQty > 0) {
            netQty = -netQty;
          }
          const approvedQty = isApprovedQuotaStatus(status) ? netQty : 0;

          const fKey = fc || `Y${year}`;
          seqByFile[fKey] = (seqByFile[fKey] || 0) + 1;
          const recCode =
            String(r.recordCode || '').trim() ||
            `${fKey}-R${String(seqByFile[fKey]).padStart(2, '0')}`;

          const fMeta = fileMap.get(fc);
          const srcFname = String(r.sourceFilename || fMeta?.sourceFilename || '').trim();
          const fillDate = String(r.fillDate || fMeta?.fillDate || '').trim();

          insAlloc.run(
            recCode,
            fc,
            srcFname,
            Number(r.sourceRow || 0),
            Math.trunc(Number(r.rawQty ?? Math.abs(netQty))),
            year,
            appType,
            status,
            fillDate,
            normR.regionCode,
            normR.projectName,
            cntry.code,
            cntry.nameTr || String(r.countryTr || ''),
            cntry.nameRu || String(r.countryRu || ''),
            occ.code,
            occ.nameTr || String(r.occupationTr || ''),
            occ.nameRu || String(r.occupationRu || ''),
            netQty,
            approvedQty,
            fc && srcFname ? `${fc} • ${srcFname}` : fc,
            actorName,
            nowIso
          );
          importedVeri += 1;
        }

        // Sync IRS sheet rows (IRS1, IRS2, IRS3 & Aciklama)
        for (const ir of irsRows) {
          const normR = normalizeRegionCode(ir.region || ir.regionCode || '');
          const qYear = Number(ir.quotaYear || 2026) || 2026;
          const noteText = String(ir.noteText || '').trim();
          if (noteText) {
            db.prepare(`
              INSERT OR REPLACE INTO quota_region_notes (
                quota_year, region_code, note_text, updated_by, updated_at
              ) VALUES (?, ?, ?, ?, ?)
            `).run(qYear, normR.regionCode, noteText, actorName, nowIso);
          }

          const tranches = [
            { code: 'IRS1', qty: Math.max(0, Math.trunc(Number(ir.irs1 || 0) || 0)) },
            { code: 'IRS2', qty: Math.max(0, Math.trunc(Number(ir.irs2 || 0) || 0)) },
            { code: 'IRS3', qty: Math.max(0, Math.trunc(Number(ir.irs3 || 0) || 0)) },
          ];

          for (const t of tranches) {
            if (t.qty <= 0) continue;
            const existing = db
              .prepare(
                'SELECT * FROM quota_irs_certificates WHERE quota_year = ? AND region_code = ? AND tranche_code = ? ORDER BY id ASC LIMIT 1'
              )
              .get(qYear, normR.regionCode, t.code) as Record<string, any> | undefined;

            const certNo =
              existing?.certificate_no ||
              `${qYear}-${normR.regionCode.slice(0, 6)}-${t.code}`;

            let certId = existing?.id || 0;
            if (existing) {
              db.prepare(
                'UPDATE quota_irs_certificates SET notes = ?, updated_at = ? WHERE id = ?'
              ).run(noteText, nowIso, certId);
              db.prepare('DELETE FROM quota_irs_lines WHERE certificate_no = ?').run(certNo);
            } else {
              const ins = db
                .prepare(`
                  INSERT INTO quota_irs_certificates (
                    certificate_no, tranche_code, tranche_label, quota_year, region_code, project_name,
                    issue_date, valid_from, valid_until, state_duty_per_person, status,
                    notes, created_by, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 15000, 'active', ?, ?, ?, ?)
                `)
                .run(
                  certNo,
                  t.code,
                  `${t.code} (${String(ir.region || normR.regionCode)})`,
                  qYear,
                  normR.regionCode,
                  normR.projectName,
                  todayDate,
                  todayDate,
                  `${qYear + 1}-05-31`,
                  noteText,
                  actorName,
                  nowIso,
                  nowIso
                );
              certId = Number(ins.lastInsertRowid);
            }

            const propLines = buildProportionalLinesForRegion(
              db,
              qYear,
              normR.regionCode,
              t.qty
            );
            const insLine = db.prepare(`
              INSERT INTO quota_irs_lines (
                certificate_id, certificate_no, quota_record_code,
                country_code, country_tr, occupation_code, occupation_tr, occupation_ru, allocated_qty
              ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)
            `);
            for (const ln of propLines) {
              insLine.run(
                certId,
                certNo,
                ln.countryCode,
                ln.countryTr,
                ln.occupationCode,
                ln.occupationTr,
                ln.occupationRu,
                ln.allocatedQty
              );
            }
            importedIrs += 1;
          }
        }

        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        importedVeri,
        importedFiles,
        importedIrs,
        message: `Kota Excel başarıyla senkronize edildi (${importedFiles} kaynak dosya, ${importedVeri} kota satırı, ${importedIrs} İRS dilimi).`,
      });
    }

    // 4b. Legacy Single-Sheet Bulk Excel Import
    if (action === 'import_excel_rows') {
      const rows: Array<Record<string, any>> = Array.isArray(body?.rows) ? body.rows : [];
      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Excel dosyasından aktarılacak kota satırı bulunamadı.' },
          { status: 400 }
        );
      }

      try {
        createPreActionBackup(
          'quota_excel_import',
          'Kota Excel Aktarımı Öncesi Otomatik Koruma Yedeği',
          'Авто-копия перед импортом квот'
        );
      } catch {}

      const upsertStmt = db.prepare(`
        INSERT INTO quota_allocations (
          record_code, file_code, raw_qty, year, application_type, migrakvota_status, target_date,
          region_code, project_name, country_code, country_tr, country_ru,
          occupation_code, occupation_tr, occupation_ru,
          requested_qty, approved_qty, legacy_irs_qty, opening_new_use, extensions_use,
          irs_doc_no, notes, updated_by, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(record_code) DO UPDATE SET
          file_code = excluded.file_code,
          raw_qty = excluded.raw_qty,
          year = excluded.year,
          application_type = excluded.application_type,
          migrakvota_status = excluded.migrakvota_status,
          region_code = excluded.region_code,
          project_name = excluded.project_name,
          country_code = excluded.country_code,
          country_tr = excluded.country_tr,
          country_ru = excluded.country_ru,
          occupation_code = excluded.occupation_code,
          occupation_tr = excluded.occupation_tr,
          occupation_ru = excluded.occupation_ru,
          requested_qty = excluded.requested_qty,
          approved_qty = excluded.approved_qty,
          legacy_irs_qty = excluded.legacy_irs_qty,
          opening_new_use = excluded.opening_new_use,
          extensions_use = excluded.extensions_use,
          irs_doc_no = excluded.irs_doc_no,
          notes = excluded.notes,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `);

      let imported = 0;
      db.exec('BEGIN');
      try {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const year = Number(r.year || 2026) || 2026;
          const normR = normalizeRegionCode(r.region_code || r.region || '');
          if (!normR.regionCode || normR.regionCode === 'DIGER') continue;

          const cntryResolved = resolveCountryByCodeOrName(r.country_code, r.country_tr);
          const occResolved = resolveOccupationByCodeOrName(r.occupation_code, r.occupation_tr);
          const recCode =
            String(r.record_code || '').trim() ||
            `KV-${year}-IMP-${String(i + 1).padStart(4, '0')}`;
          const appType = String(r.application_type || 'Esas başvuru').trim();
          const status = String(r.migrakvota_status || 'Onaylı (emir taslağında)').trim();

          let reqQty = Math.trunc(Number(r.requested_qty || 0) || 0);
          if (classifyApplicationType(appType, reqQty) === 'azaltma' && reqQty > 0) {
            reqQty = -reqQty;
          }
          const appQty =
            r.approved_qty !== undefined
              ? Math.trunc(Number(r.approved_qty || 0) || 0)
              : isApprovedQuotaStatus(status)
              ? reqQty
              : 0;

          upsertStmt.run(
            recCode,
            String(r.file_code || '').trim(),
            Math.abs(reqQty),
            year,
            appType,
            status,
            String(r.target_date || '').trim(),
            normR.regionCode,
            String(r.project_name || normR.projectName).trim(),
            cntryResolved.code,
            cntryResolved.nameTr,
            cntryResolved.nameRu,
            occResolved.code,
            occResolved.nameTr,
            occResolved.nameRu,
            reqQty,
            appQty,
            Number(r.legacy_irs_qty || 0) || 0,
            Number(r.opening_new_use || 0) || 0,
            Number(r.extensions_use || 0) || 0,
            String(r.irs_doc_no || '').trim(),
            String(r.notes || '').trim(),
            actorName,
            nowIso
          );
          imported += 1;
        }
        db.exec('COMMIT');
      } catch (txErr) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw txErr;
      }

      return NextResponse.json({
        success: true,
        imported,
        message: `${imported} kota satırı Excel'den başarıyla senkronize edildi.`,
      });
    }

    // 5. Save Alert Settings or Trigger Test Alert
    if (action === 'save_alert_settings') {
      const saved = saveQuotaAlertSettings(body?.settings || {}, db);
      return NextResponse.json({
        success: true,
        alertSettings: saved,
        message: 'Kritik kota bildirim ayarları (Telegram & E-Posta) güncellendi.',
      });
    }

    if (action === 'send_test_alert') {
      const res = await checkAndSendQuotaAlerts(true);
      return NextResponse.json({
        success: res.ok,
        ...res,
        message: res.detail,
      });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Kota işlemi sırasında hata oluştu.' },
      { status: 500 }
    );
  }
}
