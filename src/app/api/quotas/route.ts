import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { createPreActionBackup } from '@/lib/backup';
import { searchPonderaPeople35k } from '@/lib/aiTicketEngine';
import {
  checkAndSendQuotaAlerts,
  ensureQuotaTables,
  getQuotaOverviewData,
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

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser || sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için düzenleme yetkisi gereklidir.' },
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
          { success: false, message: 'ИРС (РНП) sertifika numarası zorunludur (Örn: 2600030066).' },
          { status: 400 }
        );
      }

      const quotaYear = Number(cert.quota_year ?? cert.quotaYear ?? 2026) || 2026;
      const regionCode = String(cert.region_code ?? cert.regionCode ?? 'MURMANSK')
        .trim()
        .toUpperCase();
      const projectName = String(cert.project_name ?? cert.projectName ?? regionCode).trim();
      const trancheLabel = String(cert.tranche_label ?? cert.trancheLabel ?? 'ИРС(РНП)-1').trim();
      const issueDate = String(cert.issue_date ?? cert.issueDate ?? todayDate).trim();
      const validFrom = String(cert.valid_from ?? cert.validFrom ?? todayDate).trim();
      const validUntil = String(cert.valid_until ?? cert.validUntil ?? `${quotaYear + 1}-03-31`).trim();
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
            SET tranche_label = ?,
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
                certificate_no, tranche_label, quota_year, region_code, project_name,
                issue_date, valid_from, valid_until, state_duty_per_person, status,
                notes, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              certNo,
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
        message: `ИРС (РНП) № ${certNo} sertifikası ve görev kontenjanları kaydedildi.`,
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

      const defaultRegion = String(
        body?.regionCode ?? certRow?.region_code ?? ''
      )
        .trim()
        .toUpperCase();
      const defaultProject = String(
        body?.projectName ?? certRow?.project_name ?? ''
      ).trim();

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

      // Trigger non-blocking low-quota check (sends TG + Email ONLY if a threshold was newly crossed)
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

    // 3. Create or Update Quota Allocation Row (migrakvota.gov.ru / LOG)
    if (action === 'save_allocation') {
      const a = body?.allocation || {};
      const year = Number(a.year || 2026) || 2026;
      const regionCode = String(a.region_code ?? a.regionCode ?? 'TATARISTAN')
        .trim()
        .toUpperCase();
      const projectName = String(a.project_name ?? a.projectName ?? regionCode).trim();
      const appType = String(a.application_type ?? a.applicationType ?? 'ILK BASVURU').trim();
      const status = String(
        a.migrakvota_status ?? a.migrakvotaStatus ?? 'BASVURU YAPILACAK'
      ).trim();
      const targetDate = String(a.target_date ?? a.targetDate ?? `${year}-01-01`).trim();

      const cntryResolved = resolveCountryByCodeOrName(
        a.country_code ?? a.countryCode,
        a.country_tr ?? a.countryTr
      );
      const occResolved = resolveOccupationByCodeOrName(
        a.occupation_code ?? a.occupationCode,
        a.occupation_tr ?? a.occupationTr
      );

      const reqQty = Math.max(0, Number(a.requested_qty ?? a.requestedQty ?? 0) || 0);
      const appQty = Math.max(0, Number(a.approved_qty ?? a.approvedQty ?? 0) || 0);
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
          record_code, year, application_type, migrakvota_status, target_date,
          region_code, project_name, country_code, country_tr, country_ru,
          occupation_code, occupation_tr, occupation_ru,
          requested_qty, approved_qty, legacy_irs_qty, opening_new_use, extensions_use,
          irs_doc_no, notes, updated_by, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(record_code) DO UPDATE SET
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

    // 4. Bulk Excel Import (LOG sheet or Quota table)
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
          record_code, year, application_type, migrakvota_status, target_date,
          region_code, project_name, country_code, country_tr, country_ru,
          occupation_code, occupation_tr, occupation_ru,
          requested_qty, approved_qty, legacy_irs_qty, opening_new_use, extensions_use,
          irs_doc_no, notes, updated_by, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(record_code) DO UPDATE SET
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
          const regCode = String(r.region_code || '').trim().toUpperCase();
          if (!regCode) continue;

          const cntryResolved = resolveCountryByCodeOrName(r.country_code, r.country_tr);
          const occResolved = resolveOccupationByCodeOrName(r.occupation_code, r.occupation_tr);
          const recCode =
            String(r.record_code || '').trim() ||
            `KV-${year}-IMP-${String(i + 1).padStart(4, '0')}`;

          upsertStmt.run(
            recCode,
            year,
            String(r.application_type || 'ILK BASVURU').trim(),
            String(r.migrakvota_status || 'TAMAMLANDI').trim(),
            String(r.target_date || '').trim(),
            regCode,
            String(r.project_name || regCode).trim(),
            cntryResolved.code,
            cntryResolved.nameTr,
            cntryResolved.nameRu,
            occResolved.code,
            occResolved.nameTr,
            occResolved.nameRu,
            Number(r.requested_qty || 0) || 0,
            Number(r.approved_qty || 0) || 0,
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

