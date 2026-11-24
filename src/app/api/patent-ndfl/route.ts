import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  ensurePatentNdflTables,
  getPatentODataConfig,
  importPatentNdflWorkbook,
  PATENT_RATES_2026,
  savePatentODataConfig,
  syncPatentNdflFromOData,
} from '@/lib/patentNdflManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = getDb();
    ensurePatentNdflTables(db);
    const { searchParams } = new URL(request.url);
    const taxYear = Number(searchParams.get('year')) || 2026;

    const records = db
      .prepare('SELECT * FROM patent_ndfl_records WHERE tax_year = ? ORDER BY additional_offset_potential DESC, ndfl_withheld DESC')
      .all(taxYear) as any[];

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

    for (const r of records) {
      totalAdvances += Number(r.patent_advances || 0);
      totalOffsetUsed += Number(r.patent_offset_used || 0);
      totalBalance += Number(r.patent_advance_balance || 0);
      totalPotential += Number(r.additional_offset_potential || 0);
      if (r.is_active && Number(r.additional_offset_potential || 0) > 0) {
        activePotential += Number(r.additional_offset_potential || 0);
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
      const file = fd.get('file') as File | null;
      const taxYear = Number(fd.get('taxYear')) || 2026;
      const orgName = String(fd.get('orgName') || '').trim();
      if (!file) {
        return NextResponse.json({ success: false, message: 'Lütfen bir Excel (.xlsx/.xls) dosyası seçin.' }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
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
