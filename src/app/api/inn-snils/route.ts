import { NextResponse } from 'next/server';
import path from 'path';
import { spawnSync } from 'child_process';
import { getDb } from '@/lib/db';
import { getSmtpConfig } from '@/lib/emailNotifier';
import { resolveRequestRlsScope } from '@/lib/auth';
import {
  buildEffectiveRegionSqlCondition,
  buildProjectScopeSqlCondition,
  resolveEffectiveRegion,
} from '@/lib/regionSiteHelper';
import {
  ensureInnSnilsTable,
  saveInnSnilsScreenshotBase64,
  upsertInnSnilsVerification,
  InnSnilsVerificationRecord,
} from '@/lib/innSnilsManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDateRu(raw: any): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const mIso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (mIso) return `${mIso[3]}.${mIso[2]}.${mIso[1]}`;
  return s;
}

function formatFnsDocNo(series: string, number: string, doctype: string, withSpaceForForeign = false): string {
  const s = String(series || '').trim();
  const n = String(number || '').trim();
  if (doctype === '21') {
    const nDigits = n.replace(/\D/g, '');
    const digits = nDigits.length === 10 ? nDigits : `${s}${n}`.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
    }
    return n || s;
  }
  if (s && n && !n.toUpperCase().startsWith(s.toUpperCase())) {
    return withSpaceForForeign ? `${s} ${n}` : `${s}${n}`;
  }
  return n || s;
}

async function queryFnsNalogInnOnce(params: {
  fam: string;
  nam: string;
  otch?: string;
  bdate: string;
  doctype: string;
  docno: string;
  docdt?: string;
}): Promise<{ status: 'VERIFIED' | 'NOT_FOUND' | 'ERROR'; inn?: string; message?: string }> {
  const formBody = new URLSearchParams();
  formBody.set('c', 'find');
  formBody.set('captcha', '');
  formBody.set('captchaToken', '');
  formBody.set('fam', params.fam.trim());
  formBody.set('nam', params.nam.trim());
  if (params.otch && params.otch.trim()) {
    formBody.set('otch', params.otch.trim());
  } else {
    formBody.set('opt_otch', '1');
  }
  formBody.set('bdate', formatDateRu(params.bdate));
  formBody.set('bplace', '');
  formBody.set('doctype', params.doctype || '10');
  formBody.set('docno', params.docno.trim());
  if (params.docdt && formatDateRu(params.docdt)) {
    formBody.set('docdt', formatDateRu(params.docdt));
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Origin: 'https://service.nalog.ru',
    Referer: 'https://service.nalog.ru/inn.do',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
  };

  try {
    const res1 = await fetch('https://service.nalog.ru/inn-new-proc.json', {
      method: 'POST',
      headers,
      body: formBody.toString(),
    });
    const json1: any = await res1.json().catch(() => null);
    if (!res1.ok || !json1) {
      const rawErr = json1?.ERRORS ? JSON.stringify(json1.ERRORS) : '';
      const errDetail = /captcha/i.test(rawErr)
        ? 'FNS CAPTCHA istedi — Mor "nalog.ru Ekran Görüntüsü Al" butonunu kullanın'
        : rawErr
        ? rawErr.slice(0, 180)
        : `FNS HTTP ${res1.status}`;
      return { status: 'ERROR', message: errDetail };
    }
    if (json1.inn) {
      return { status: 'VERIFIED', inn: String(json1.inn).trim() };
    }
    if (json1.requestId) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 900));
        const pollBody = new URLSearchParams();
        pollBody.set('c', 'get');
        pollBody.set('requestId', String(json1.requestId));
        const res2 = await fetch('https://service.nalog.ru/inn-new-proc.json', {
          method: 'POST',
          headers,
          body: pollBody.toString(),
        });
        const json2: any = await res2.json().catch(() => null);
        if (!json2) continue;
        if (json2.state === 1 && json2.inn) {
          return { status: 'VERIFIED', inn: String(json2.inn).trim() };
        }
        if (json2.state === 0 || json2.code === 0) {
          return { status: 'NOT_FOUND', message: 'Информация об ИНН не найдена в ФНС' };
        }
        if (json2.ERROR) {
          return { status: 'ERROR', message: String(json2.ERROR) };
        }
      }
      return { status: 'ERROR', message: 'ФНС не успела вернуть ответ (таймаут)' };
    }
    if (json1.ERRORS) {
      const rawErr = JSON.stringify(json1.ERRORS);
      return {
        status: 'ERROR',
        message: /captcha/i.test(rawErr)
          ? 'FNS CAPTCHA istedi — Mor "nalog.ru Ekran Görüntüsü Al" butonunu kullanın'
          : rawErr.slice(0, 180),
      };
    }
    return { status: 'NOT_FOUND', message: 'Информация об ИНН не найдена в ФНС' };
  } catch (err: any) {
    return { status: 'ERROR', message: err?.message || 'FNS bağlantı hatası' };
  }
}

async function queryFnsNalogInn(params: {
  fam: string;
  nam: string;
  otch?: string;
  bdate: string;
  doctype: string;
  docSeries?: string;
  docno: string;
  docdt?: string;
}): Promise<{ status: 'VERIFIED' | 'NOT_FOUND' | 'ERROR'; inn?: string; message?: string }> {
  const primaryDoc = formatFnsDocNo(params.docSeries || '', params.docno, params.doctype, false);
  const res1 = await queryFnsNalogInnOnce({ ...params, docno: primaryDoc });
  if (res1.status === 'VERIFIED' || /captcha/i.test(res1.message || '')) return res1;

  // For foreign passports, FNS sometimes stores series+number WITH a space (e.g. 'FA 1243278' vs 'FA1243278')
  if (params.doctype === '10' && params.docSeries) {
    const spacedDoc = formatFnsDocNo(params.docSeries, params.docno, '10', true);
    if (spacedDoc !== primaryDoc) {
      await new Promise((r) => setTimeout(r, 700));
      const res2 = await queryFnsNalogInnOnce({ ...params, docno: spacedDoc });
      if (res2.status === 'VERIFIED') return res2;
    }
  }
  return res1;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    ensureInnSnilsTable(db);
    const { scopeType, scopeVal } = resolveRequestRlsScope(request);
    const { searchParams } = new URL(request.url);
    const includeExits = searchParams.get('includeExits') === 'true';
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const sicilsRaw = (searchParams.get('sicils') || '').trim();
    const limit = Math.min(25000, Math.max(50, Number(searchParams.get('limit')) || 25000));

    const conds: string[] = [];
    const params: any[] = [];

    if (!includeExits && !sicilsRaw) {
      conds.push("p.genel_durum = 'Mevcut'");
    }

    if (scopeType === 'region' && scopeVal && scopeVal !== 'all') {
      const rc = buildEffectiveRegionSqlCondition(scopeVal, 'p.region', 'p.proje_adi');
      conds.push(rc.sql);
      params.push(...rc.params);
    } else if (scopeType === 'project' && scopeVal && scopeVal !== 'all') {
      const pc = buildProjectScopeSqlCondition(scopeVal, 'p.proje_adi');
      conds.push(pc.sql);
      params.push(...pc.params);
    }

    if (sicilsRaw) {
      const sicilList = Array.from(
        new Set(
          sicilsRaw
            .split(/[\s,;|\n\r]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      );
      if (sicilList.length > 0) {
        const ph = sicilList.map(() => '?').join(', ');
        conds.push(`TRIM(p.sicil_no) IN (${ph})`);
        params.push(...sicilList);
      }
    }

    if (search) {
      conds.push(
        '(LOWER(p.sicil_no) LIKE ? OR LOWER(p.ad_soyad) LIKE ? OR LOWER(p.tam_adi_kiril) LIKE ? OR LOWER(p.inn_no) LIKE ? OR LOWER(p.pasaport_no) LIKE ? OR LOWER(p.proje_adi) LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }

    const whereSql = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT
          p.id, p.sicil_no, p.ad_soyad, p.tam_adi_kiril, p.uyruk, p.cinsiyet,
          p.dogum_tarihi, p.dogum_yeri, p.pasaport_no, p.inn_no,
          p.region, p.proje_adi, p.ise_giris_tarihi, p.cikis_tarihi, p.genel_durum, p.guncel_durum,
          p.telefon_no, p.email, p.all_data_json,
          v.inn_status, v.verified_inn, v.inn_verified_at, v.inn_screenshot,
          v.inn_application_no, v.inn_application_code, v.inn_error,
          v.snils_status, v.verified_snils, v.snils_verified_at, v.snils_screenshot, v.snils_error
        FROM personnel p
        LEFT JOIN inn_snils_verifications v ON TRIM(v.sicil_no) = TRIM(p.sicil_no)
        ${whereSql}
        ORDER BY p.id DESC
        LIMIT ?`
      )
      .all(...params, limit) as any[];

    // Also fetch SNILS & passport issue date from zup_official_personnel if available
    const zupBySicil = new Map<string, { snils: string; doc_issue_date: string; doc_issued_by: string; doc_series: string; doc_no: string }>();
    try {
      const zRows = db
        .prepare('SELECT tabel_no, norm_sicil, snils, doc_issue_date, doc_issued_by, doc_series, doc_no FROM zup_official_personnel')
        .all() as any[];
      for (const zr of zRows) {
        const item = {
          snils: String(zr.snils || '').trim(),
          doc_issue_date: String(zr.doc_issue_date || '').trim(),
          doc_issued_by: String(zr.doc_issued_by || '').trim(),
          doc_series: String(zr.doc_series || '').trim(),
          doc_no: String(zr.doc_no || '').trim(),
        };
        if (zr.tabel_no) zupBySicil.set(String(zr.tabel_no).trim(), item);
        if (zr.norm_sicil) zupBySicil.set(String(zr.norm_sicil).trim().replace(/^0+/, ''), item);
      }
    } catch {}

    const items = rows.map((r) => {
      let rawSnils = '';
      let rawPassSeries = '';
      let rawPassNo = '';
      let rawPassIssue = '';
      let rawPassIssuedBy = '';
      if (r.all_data_json) {
        try {
          const parsed = JSON.parse(r.all_data_json);
          rawSnils = String(parsed['SNILS'] || parsed['СНИЛС'] || parsed['Snils No'] || '').trim();
          rawPassSeries = String(parsed['Pasaport Seri No'] || parsed['Pasaport Serisi'] || '').trim();
          rawPassNo = String(parsed['Pasaport No'] || '').trim();
          rawPassIssue = String(
            parsed['Pasaport Düzenleme Tarihi'] ||
              parsed['Pasaport Veriliş Tarihi'] ||
              parsed['Pasaport Alış Tarihi'] ||
              ''
          ).trim();
          rawPassIssuedBy = String(parsed['Pasaport Veren Makam'] || '').trim();
        } catch {}
      }
      const sKey = String(r.sicil_no || '').trim();
      const zInfo = zupBySicil.get(sKey) || zupBySicil.get(sKey.replace(/^0+/, ''));
      const snilsVal = r.verified_snils || zInfo?.snils || rawSnils || '';
      const innVal = r.verified_inn || r.inn_no || '';
      const passSeries = rawPassSeries || zInfo?.doc_series || '';
      const passNum = String(r.pasaport_no || rawPassNo || zInfo?.doc_no || '').trim();
      const isRf = String(r.uyruk || '').toUpperCase().includes('RUSYA');
      const fullPassport = formatFnsDocNo(passSeries, passNum, isRf ? '21' : '10', false);

      return {
        id: r.id,
        sicil_no: sKey,
        ad_soyad: r.ad_soyad || '',
        tam_adi_kiril: r.tam_adi_kiril || '',
        uyruk: r.uyruk || '',
        cinsiyet: r.cinsiyet || '',
        dogum_tarihi: r.dogum_tarihi || '',
        dogum_yeri: r.dogum_yeri || '',
        pasaport_seri: passSeries,
        pasaport_no: fullPassport,
        pasaport_verilis: rawPassIssue || zInfo?.doc_issue_date || '',
        pasaport_veren: rawPassIssuedBy || zInfo?.doc_issued_by || '',
        inn_no: innVal,
        eba_inn: r.inn_no || '',
        snils_no: snilsVal,
        region: resolveEffectiveRegion(r.region, r.proje_adi, r.region || ''),
        proje_adi: r.proje_adi || '',
        ise_giris_tarihi: r.ise_giris_tarihi || '',
        cikis_tarihi: r.cikis_tarihi || '',
        genel_durum: r.genel_durum || '',
        guncel_durum: r.guncel_durum || '',
        telefon_no: r.telefon_no || '',
        email: r.email || '',
        inn_status: r.inn_status || (r.inn_no ? 'PENDING' : 'PENDING'),
        verified_inn: r.verified_inn || '',
        inn_verified_at: r.inn_verified_at || '',
        inn_screenshot: r.inn_screenshot || '',
        inn_application_no: r.inn_application_no || '',
        inn_application_code: r.inn_application_code || '',
        inn_error: r.inn_error || '',
        snils_status: r.snils_status || 'PENDING',
        verified_snils: r.verified_snils || '',
        snils_verified_at: r.snils_verified_at || '',
        snils_screenshot: r.snils_screenshot || '',
        snils_error: r.snils_error || '',
      };
    });

    const summaryRow = db
      .prepare(
        `SELECT
          SUM(CASE WHEN inn_status = 'VERIFIED' THEN 1 ELSE 0 END) as innVerified,
          SUM(CASE WHEN inn_status = 'NOT_FOUND' THEN 1 ELSE 0 END) as innNotFound,
          SUM(CASE WHEN inn_status IN ('APPLIED_STEP1', 'APPLIED_STEP2') THEN 1 ELSE 0 END) as innApplied,
          SUM(CASE WHEN snils_status = 'VERIFIED' THEN 1 ELSE 0 END) as snilsVerified
        FROM inn_snils_verifications`
      )
      .get() as any;

    return NextResponse.json({
      success: true,
      items,
      total: items.length,
      summary: {
        innVerified: Number(summaryRow?.innVerified || 0),
        innNotFound: Number(summaryRow?.innNotFound || 0),
        innApplied: Number(summaryRow?.innApplied || 0),
        snilsVerified: Number(summaryRow?.snilsVerified || 0),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'INN/SNILS verisi alınamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    ensureInnSnilsTable(db);
    const body = await request.json();
    const action = String(body?.action || '').trim();

    if (action === 'verify_inn_direct') {
      const workers = Array.isArray(body?.workers) ? body.workers : [];
      const results: any[] = [];
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

      let queriedCount = 0;
      let captchaStopped = false;
      for (const w of workers.slice(0, 50)) {
        if (queriedCount > 0) {
          // Pace requests gently to respect FNS server-IP rate limits
          const waitMs = queriedCount % 4 === 0 ? 7000 : 2200;
          await new Promise((r) => setTimeout(r, waitMs));
        }
        queriedCount++;
        const sicil = String(w.sicil_no || '').trim();
        const kirilParts = String(w.tam_adi_kiril || w.ad_soyad || '')
          .trim()
          .split(/\s+/);
        const fam = String(w.fam || kirilParts[0] || '').trim();
        const nam = String(w.nam || kirilParts[1] || '').trim();
        const otch = String(w.otch || kirilParts.slice(2).join(' ') || '').trim();
        const bdate = String(w.dogum_tarihi || '').trim();
        const docSeries = String(w.pasaport_seri || '').trim();
        const docno = String(w.pasaport_no || '').trim();
        const docdt = String(w.pasaport_verilis || '').trim();
        const isRf = String(w.uyruk || '').toUpperCase().includes('RUSYA');
        const doctype = isRf ? '21' : '10';

        if (!fam || !nam || !bdate || !docno) {
          const msg = 'Eksik bilgi (Ad/Soyad, Doğum Tarihi veya Pasaport No eksik)';
          upsertInnSnilsVerification(db, {
            sicil_no: sicil,
            ad_soyad: w.ad_soyad || '',
            tam_adi_kiril: w.tam_adi_kiril || '',
            inn_status: 'ERROR',
            inn_error: msg,
          });
          results.push({ sicil_no: sicil, status: 'ERROR', message: msg });
          continue;
        }

        const fnsRes = await queryFnsNalogInn({ fam, nam, otch, bdate, doctype, docSeries, docno, docdt });
        upsertInnSnilsVerification(db, {
          sicil_no: sicil,
          ad_soyad: w.ad_soyad || '',
          tam_adi_kiril: w.tam_adi_kiril || '',
          inn_status: fnsRes.status,
          verified_inn: fnsRes.inn || '',
          inn_verified_at: fnsRes.status === 'VERIFIED' ? nowStr : '',
          inn_error: fnsRes.status === 'VERIFIED' ? '' : fnsRes.message || '',
        });

        if (fnsRes.status === 'VERIFIED' && fnsRes.inn && sicil) {
          try {
            db.prepare(
              "UPDATE personnel SET inn_no = ? WHERE TRIM(sicil_no) = ? AND COALESCE(TRIM(inn_no), '') = ''"
            ).run(fnsRes.inn, sicil);
          } catch {}
        }

        results.push({
          sicil_no: sicil,
          status: fnsRes.status,
          inn: fnsRes.inn || '',
          message: fnsRes.message || '',
        });

        // Stop immediately on FNS CAPTCHA so we don't hammer the server IP or extend cooldown
        if (fnsRes.status === 'ERROR' && /captcha/i.test(fnsRes.message || '')) {
          captchaStopped = true;
          break;
        }
      }

      return NextResponse.json({ success: true, results, captchaStopped });
    }

    if (action === 'scan_zayavka2_mail') {
      const smtp = getSmtpConfig();
      if (!smtp.user || !smtp.pass) {
        return NextResponse.json(
          { success: false, message: 'Zoho e-posta (ikbildirim@pondera.ru) ayarları eksik.' },
          { status: 400 }
        );
      }
      const scriptPath = path.join(process.cwd(), 'scripts', 'gosuslugi_rpa', 'zoho_inn_links_sync.py');
      const payload = JSON.stringify({
        imap_host: smtp.imapHost || 'imappro.zoho.com',
        imap_port: smtp.imapPort || 993,
        email: smtp.user,
        password: smtp.pass,
        max_messages: 80,
      });
      const bins = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
      let parsed: any = null;
      let lastErr = '';
      for (const bin of bins) {
        try {
          const res = spawnSync(bin, [scriptPath], {
            input: payload,
            encoding: 'utf-8',
            timeout: 45000,
            maxBuffer: 10 * 1024 * 1024,
          });
          if (res.stdout && res.stdout.trim()) {
            parsed = JSON.parse(res.stdout.trim());
            break;
          }
          if (res.stderr) lastErr = res.stderr.trim();
        } catch (err: any) {
          lastErr = err?.message || String(err);
        }
      }
      if (!parsed) {
        return NextResponse.json(
          { success: false, message: lastErr || 'Zoho Mail taraması çalıştırılamadı.' },
          { status: 500 }
        );
      }
      return NextResponse.json(parsed);
    }

    if (action === 'save_result') {
      const sicil = String(body?.sicil_no || '').trim();
      if (!sicil) {
        return NextResponse.json({ success: false, message: 'sicil_no zorunludur.' }, { status: 400 });
      }
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      let innScreenshot = String(body?.inn_screenshot || '');
      let snilsScreenshot = String(body?.snils_screenshot || '');

      if (body?.inn_screenshot_base64) {
        const kind =
          body?.inn_status === 'APPLIED_STEP1'
            ? 'zayavka1'
            : body?.inn_status === 'APPLIED_STEP2'
            ? 'zayavka2'
            : 'inn';
        innScreenshot = saveInnSnilsScreenshotBase64(sicil, kind, body.inn_screenshot_base64);
      }
      if (body?.snils_screenshot_base64) {
        snilsScreenshot = saveInnSnilsScreenshotBase64(sicil, 'snils', body.snils_screenshot_base64);
      }

      const payload: Partial<InnSnilsVerificationRecord> & { sicil_no: string } = {
        sicil_no: sicil,
        ad_soyad: body?.ad_soyad || '',
        tam_adi_kiril: body?.tam_adi_kiril || '',
        inn_status: body?.inn_status || undefined,
        verified_inn: body?.verified_inn || '',
        inn_verified_at: body?.inn_status === 'VERIFIED' ? nowStr : body?.inn_verified_at || '',
        inn_screenshot: innScreenshot,
        inn_application_no: body?.inn_application_no || '',
        inn_application_code: body?.inn_application_code || '',
        inn_error: body?.inn_error,
        snils_status: body?.snils_status || undefined,
        verified_snils: body?.verified_snils || '',
        snils_verified_at: body?.snils_status === 'VERIFIED' ? nowStr : body?.snils_verified_at || '',
        snils_screenshot: snilsScreenshot,
        snils_error: body?.snils_error,
      };

      upsertInnSnilsVerification(db, payload);

      if (payload.verified_inn) {
        try {
          db.prepare(
            "UPDATE personnel SET inn_no = ? WHERE TRIM(sicil_no) = ? AND COALESCE(TRIM(inn_no), '') = ''"
          ).run(payload.verified_inn, sicil);
        } catch {}
      }

      return NextResponse.json({
        success: true,
        sicil_no: sicil,
        inn_screenshot: innScreenshot,
        snils_screenshot: snilsScreenshot,
      });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Kayıt işlemi başarısız.' },
      { status: 500 }
    );
  }
}
