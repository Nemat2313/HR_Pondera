import { resolveEffectiveRegion } from '@/lib/regionSiteHelper';
import { classifyWorkPermitFromRow } from '@/lib/workPermits';

export interface FormattedMskTimestamp {
  date: string;
  time: string;
  full: string;
}

export function getCurrentMskTimestamp(): FormattedMskTimestamp {
  const now = new Date();
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  return { date, time, full: `${date} ${time}` };
}

export function formatSystemTimestampToMsk(
  rawTimestamp?: string | null,
  fallbackDate?: string | null,
  explicitMskStr?: string | null
): FormattedMskTimestamp {
  const cleanDate = String(fallbackDate || '').trim();
  const explicit = String(explicitMskStr || '').trim();

  // If explicit DD.MM.YYYY HH:MM already stored in MSK
  const mExplicit = explicit.match(/^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
  if (mExplicit) {
    const useDate = cleanDate || mExplicit[1];
    return {
      date: useDate,
      time: mExplicit[2],
      full: `${useDate} ${mExplicit[2]}`,
    };
  }

  const raw = String(rawTimestamp || '').trim();
  if (raw) {
    // Handle 'YYYY-MM-DD HH:MM:SS' (UTC written by server build_db.py / saveZupRecordsToDb) or ISO 'YYYY-MM-DDTHH:MM:SSZ'
    let isoCandidate = raw;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)) {
      isoCandidate = `${raw.replace(' ', 'T')}Z`;
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[Z+-]\d*$/.test(raw)) {
      isoCandidate = `${raw}Z`;
    }

    const parsed = new Date(isoCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      const mskDate = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(parsed);
      const mskTime = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(parsed);
      const finalDate = cleanDate || mskDate;
      return {
        date: finalDate,
        time: mskTime,
        full: `${finalDate} ${mskTime}`,
      };
    }
  }

  return {
    date: cleanDate,
    time: '',
    full: cleanDate,
  };
}

function normalizeIsoDateFast(raw?: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const yr = s.slice(0, 4);
    if (yr === '2027' && s.slice(5, 7) >= '09') {
      return `2026${s.slice(4, 10)}`;
    }
    return s.slice(0, 10);
  }

  const mDot = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (mDot) {
    const yr = mDot[3] === '2027' && mDot[2] >= '09' ? '2026' : mDot[3];
    return `${yr}-${mDot[2]}-${mDot[1]}`;
  }

  if (/^\d{5}(\.0)?$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 20000 && serial < 65000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      const d = new Date(utcMs);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const fixedYr = yyyy === 2027 && mm >= '09' ? 2026 : yyyy;
      return `${fixedYr}-${mm}-${dd}`;
    }
  }

  return '';
}

function addDaysIso(isoDate: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normDigits(val?: string | null): string {
  if (!val) return '';
  return String(val).replace(/[^0-9]/g, '');
}

function parseDestinationFromTransferReason(reason?: string | null): string {
  const s = String(reason || '').trim();
  if (!s) return '';
  const cleaned = s.replace(/^transfer\s*[-:/]?\s*/i, '').trim();
  return cleaned || '';
}

export const NON_TRANSFER_ENTRY_SQL =
  "id NOT IN (SELECT personnel_id FROM inter_site_transfers WHERE transfer_direction IN ('ENTRY', 'BOTH'))";

export const NON_TRANSFER_EXIT_SQL =
  "(LOWER(COALESCE(cikis_sebebi, '')) NOT LIKE '%transfer%' AND id NOT IN (SELECT personnel_id FROM inter_site_transfers WHERE transfer_direction IN ('EXIT', 'BOTH')))";

const TRANSFER_SYNC_ALGO_VERSION = 'v2';

export function ensureInterSiteTransfersSynced(db: any): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS inter_site_transfers (
        personnel_id INTEGER PRIMARY KEY,
        sicil_no TEXT DEFAULT '',
        ad_soyad TEXT DEFAULT '',
        permit_type TEXT DEFAULT '',
        transfer_direction TEXT NOT NULL,
        transfer_type TEXT NOT NULL,
        from_site TEXT DEFAULT '',
        to_site TEXT DEFAULT '',
        transfer_date TEXT DEFAULT '',
        original_hire_date TEXT DEFAULT '',
        matched_old_sicil TEXT DEFAULT '',
        is_primary_record INTEGER DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_ist_dir_date ON inter_site_transfers(transfer_direction, transfer_date);
      CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);
    `);
    const istCols = new Set(
      (db.prepare('PRAGMA table_info(inter_site_transfers)').all() as { name: string }[]).map((c) => c.name)
    );
    if (!istCols.has('is_primary_record')) {
      db.exec('ALTER TABLE inter_site_transfers ADD COLUMN is_primary_record INTEGER DEFAULT 1;');
    }

    const pVer = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(MAX(id), 0) as maxId FROM personnel')
      .get() as { cnt: number; maxId: number } | undefined;

    if (!pVer || pVer.cnt === 0) return;

    let zCnt = 0;
    try {
      const zRow = db
        .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='zup_official_personnel'")
        .get() as { cnt: number } | undefined;
      if (zRow && zRow.cnt > 0) {
        const zc = db.prepare('SELECT COUNT(*) as cnt FROM zup_official_personnel').get() as { cnt: number };
        zCnt = zc?.cnt || 0;
      }
    } catch {}

    const sysRows = db
      .prepare(
        "SELECT key, value FROM system_info WHERE key IN ('data_freshness', 'last_updated', 'inter_site_transfers_sync_key')"
      )
      .all() as { key: string; value: string }[];
    const sysMap: Record<string, string> = {};
    for (const r of sysRows) {
      sysMap[r.key] = r.value;
    }

    const expectedKey = `${TRANSFER_SYNC_ALGO_VERSION}:${pVer.cnt}:${pVer.maxId}:${sysMap['data_freshness'] || ''}:${sysMap['last_updated'] || ''}:${zCnt}`;
    if (sysMap['inter_site_transfers_sync_key'] === expectedKey) {
      return;
    }

    // Build active ZUP hire date lookup by exact/normalized sicil
    const zupBySicil = new Map<string, { hireIso: string; dept: string }>();
    if (zCnt > 0) {
      try {
        const zRows = db
          .prepare(
            "SELECT tabel_no, norm_sicil, hire_date, zup_department, work_state FROM zup_official_personnel WHERE COALESCE(work_state, '') NOT LIKE '%Увол%' AND COALESCE(work_state, '') NOT LIKE '%увол%'"
          )
          .all() as {
          tabel_no: string;
          norm_sicil: string;
          hire_date: string;
          zup_department: string;
        }[];
        for (const zr of zRows) {
          const hIso = normalizeIsoDateFast(zr.hire_date);
          if (!hIso) continue;
          const exact = String(zr.tabel_no || '').trim();
          const norm = String(zr.norm_sicil || '').trim();
          if (exact && !zupBySicil.has(exact)) {
            zupBySicil.set(exact, { hireIso: hIso, dept: String(zr.zup_department || '') });
          }
          if (norm && !zupBySicil.has(norm)) {
            zupBySicil.set(norm, { hireIso: hIso, dept: String(zr.zup_department || '') });
          }
        }
      } catch {}
    }

    // Fetch personnel rows (extracting only the 4 needed JSON fields once in SQLite for speed)
    const rows = db
      .prepare(
        `SELECT
          id, sicil_no, ad_soyad, dogum_tarihi, genel_durum, uyruk, region, proje_adi,
          ise_giris_tarihi, cikis_tarihi, cikis_sebebi, pasaport_no, inn_no, tc_kimlik_no,
          json_extract(all_data_json, '$."İş Sözleşmesi Giriş Tarihi"') as raw_soz_giris,
          json_extract(all_data_json, '$."Resmi Çıkış Tarihi"') as raw_res_cikis,
          json_extract(all_data_json, '$."Resmi Şubesi"') as raw_res_sube,
          json_extract(all_data_json, '$."Çalışma Kart Türü"') as raw_kart_turu,
          json_extract(all_data_json, '$."Çalışma Kart Seri No"') as raw_kart_seri,
          json_extract(all_data_json, '$."Çalışma Kart No"') as raw_kart_no,
          json_extract(all_data_json, '$."Patent Form Seri No"') as raw_patent_seri,
          json_extract(all_data_json, '$."Çalışma Kart Bölgesi"') as raw_kart_bolge,
          json_extract(all_data_json, '$."Çalışma Kartı Veren Makam"') as raw_kart_makam
        FROM personnel`
      )
      .all() as any[];

    interface ExitTransferRef {
      id: number;
      sicilNo: string;
      site: string;
      inIso: string;
      outIso: string;
    }

    const exitByPass = new Map<string, ExitTransferRef[]>();
    const exitByInn = new Map<string, ExitTransferRef[]>();
    const exitByTc = new Map<string, ExitTransferRef[]>();
    const exitByNameDob = new Map<string, ExitTransferRef[]>();
    const activeRowByPass = new Map<string, { sicilNo: string; site: string; inIso: string }>();
    const activeRowByInn = new Map<string, { sicilNo: string; site: string; inIso: string }>();

    const pushRef = (map: Map<string, ExitTransferRef[]>, key: string, ref: ExitTransferRef) => {
      if (!key) return;
      const arr = map.get(key);
      if (arr) arr.push(ref);
      else map.set(key, [ref]);
    };

    // First pass: index transfer-reason exits & active rows (for pairing from_site <-> to_site)
    for (const r of rows) {
      const reasonLow = String(r.cikis_sebebi || '').trim().toLowerCase();
      const isTransferReason = reasonLow.includes('transfer');
      const site = resolveEffectiveRegion(r.region, r.proje_adi, r.region || '');
      const inIso = normalizeIsoDateFast(r.ise_giris_tarihi);
      const outIso = normalizeIsoDateFast(r.cikis_tarihi);
      const passKey = normDigits(r.pasaport_no);
      const innKey = normDigits(r.inn_no);
      const tcKey = normDigits(r.tc_kimlik_no);
      const nameClean = String(r.ad_soyad || '').trim().toUpperCase();
      const dobIso = normalizeIsoDateFast(r.dogum_tarihi);
      const nameDobKey = nameClean ? `${nameClean}|${dobIso}` : '';

      if (r.genel_durum === 'Mevcut') {
        if (passKey.length >= 5) activeRowByPass.set(passKey, { sicilNo: r.sicil_no || '', site, inIso });
        if (innKey.length >= 10) activeRowByInn.set(innKey, { sicilNo: r.sicil_no || '', site, inIso });
      }

      if (isTransferReason) {
        const ref: ExitTransferRef = {
          id: r.id,
          sicilNo: String(r.sicil_no || '').trim(),
          site,
          inIso,
          outIso,
        };
        if (passKey.length >= 5) pushRef(exitByPass, passKey, ref);
        if (innKey.length >= 10) pushRef(exitByInn, innKey, ref);
        if (tcKey.length >= 10) pushRef(exitByTc, tcKey, ref);
        if (nameDobKey) pushRef(exitByNameDob, nameDobKey, ref);
      }
    }

    const pairedOldExitIds = new Set<number>();
    const toInsert: Array<{
      personnelId: number;
      sicilNo: string;
      adSoyad: string;
      permitType: string;
      direction: 'ENTRY' | 'EXIT' | 'BOTH';
      transferType: string;
      fromSite: string;
      toSite: string;
      transferDate: string;
      originalHireDate: string;
      matchedOldSicil: string;
    }> = [];

    for (const r of rows) {
      const sicilNo = String(r.sicil_no || '').trim();
      const normSicil = sicilNo.replace(/^0+/, '') || sicilNo;
      const reasonRaw = String(r.cikis_sebebi || '').trim();
      const reasonLow = reasonRaw.toLowerCase();
      const hasTransferReason = reasonLow.includes('transfer');

      const inIso = normalizeIsoDateFast(r.ise_giris_tarihi);
      const outIso = normalizeIsoDateFast(r.cikis_tarihi);
      const sozIso = normalizeIsoDateFast(r.raw_soz_giris);
      const resOutIso = normalizeIsoDateFast(r.raw_res_cikis);
      const curSite = resolveEffectiveRegion(r.region, r.proje_adi, r.region || '');

      const passKey = normDigits(r.pasaport_no);
      const innKey = normDigits(r.inn_no);
      const tcKey = normDigits(r.tc_kimlik_no);
      const nameClean = String(r.ad_soyad || '').trim().toUpperCase();
      const dobIso = normalizeIsoDateFast(r.dogum_tarihi);
      const nameDobKey = nameClean ? `${nameClean}|${dobIso}` : '';

      let isExitTransfer = false;
      let isEntryTransfer = false;
      let transferType = '';
      let fromSite = '';
      let toSite = '';
      let originalHireDate = sozIso || '';
      let matchedOldSicil = '';

      // 1) Exit Transfer check
      if (hasTransferReason && (r.genel_durum === 'Cikis' || Boolean(outIso))) {
        isExitTransfer = true;
        transferType = 'EXIT_TRANSFER_REASON';
        fromSite = curSite;
        const parsedDest = parseDestinationFromTransferReason(reasonRaw);
        const matchedActive =
          (passKey.length >= 5 && activeRowByPass.get(passKey)) ||
          (innKey.length >= 10 && activeRowByInn.get(innKey)) ||
          null;
        toSite = matchedActive?.site || parsedDest || 'Diğer Şantiye';
        if (!originalHireDate && inIso) originalHireDate = inIso;
      }

      // 2) Entry Transfer checks (only when row has a hire/entry date)
      if (inIso) {
        if (hasTransferReason && r.genel_durum === 'Mevcut') {
          isEntryTransfer = true;
          transferType = 'SAME_ROW_TRANSFER';
          fromSite = String(r.raw_res_sube || '').trim() || 'Önceki Şantiye';
          toSite = curSite;
        } else {
          // Check paired prior transfer-exit row
          const candidateRefs = [
            ...(passKey.length >= 5 ? exitByPass.get(passKey) || [] : []),
            ...(innKey.length >= 10 ? exitByInn.get(innKey) || [] : []),
            ...(tcKey.length >= 10 ? exitByTc.get(tcKey) || [] : []),
            ...(nameDobKey ? exitByNameDob.get(nameDobKey) || [] : []),
          ];
          const maxPriorOut = addDaysIso(inIso, 30);
          const pairedOld = candidateRefs.find(
            (ref) => ref.id !== r.id && (!ref.outIso || ref.outIso <= maxPriorOut)
          );

          const hasPriorNonTransferExitOnRow =
            !hasTransferReason &&
            ((outIso !== '' && outIso < inIso) || (resOutIso !== '' && resOutIso < inIso));

          if (pairedOld && !hasPriorNonTransferExitOnRow) {
            isEntryTransfer = true;
            transferType = 'PAIRED_TRANSFER_ROW';
            fromSite = pairedOld.site || String(r.raw_res_sube || '').trim() || 'Önceki Şantiye';
            toSite = curSite;
            matchedOldSicil = pairedOld.sicilNo;
            pairedOldExitIds.add(pairedOld.id);
            if (!originalHireDate && pairedOld.inIso) originalHireDate = pairedOld.inIso;
          } else if (!hasPriorNonTransferExitOnRow) {
            // Check ongoing unterminated contract continuation (e.g. VKS/Patent moved between sites with same sicil)
            const cutoff21dBefore = addDaysIso(inIso, -21);
            const zupMatch = sicilNo ? zupBySicil.get(sicilNo) || zupBySicil.get(normSicil) : undefined;
            const effectiveContractStart =
              sozIso && sozIso < cutoff21dBefore
                ? sozIso
                : zupMatch && zupMatch.hireIso < cutoff21dBefore
                ? zupMatch.hireIso
                : '';

            if (effectiveContractStart) {
              isEntryTransfer = true;
              transferType = 'CONTRACT_CONTINUATION';
              const rawResSube = String(r.raw_res_sube || '').trim();
              fromSite = rawResSube || 'Önceki Şantiye';
              toSite = curSite;
              originalHireDate = effectiveContractStart;
            }
          }
        }
      }

      if (!isExitTransfer && !isEntryTransfer) continue;

      const permitType = classifyWorkPermitFromRow(r.uyruk, {
        'Çalışma Kart Türü': r.raw_kart_turu,
        'Çalışma Kart Seri No': r.raw_kart_seri,
        'Çalışma Kart No': r.raw_kart_no,
        'Patent Form Seri No': r.raw_patent_seri,
        'Çalışma Kart Bölgesi': r.raw_kart_bolge,
        'Çalışma Kartı Veren Makam': r.raw_kart_makam,
      });

      const direction: 'ENTRY' | 'EXIT' | 'BOTH' =
        isEntryTransfer && isExitTransfer ? 'BOTH' : isEntryTransfer ? 'ENTRY' : 'EXIT';

      const transferDate = isEntryTransfer ? inIso : outIso || inIso;

      toInsert.push({
        personnelId: r.id,
        sicilNo,
        adSoyad: String(r.ad_soyad || ''),
        permitType,
        direction,
        transferType,
        fromSite,
        toSite,
        transferDate,
        originalHireDate,
        matchedOldSicil,
      });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('DELETE FROM inter_site_transfers').run();
      const ins = db.prepare(`
        INSERT INTO inter_site_transfers (
          personnel_id, sicil_no, ad_soyad, permit_type, transfer_direction,
          transfer_type, from_site, to_site, transfer_date, original_hire_date, matched_old_sicil, is_primary_record
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of toInsert) {
        const isPrimary = item.direction === 'EXIT' && pairedOldExitIds.has(item.personnelId) ? 0 : 1;
        ins.run(
          item.personnelId,
          item.sicilNo,
          item.adSoyad,
          item.permitType,
          item.direction,
          item.transferType,
          item.fromSite,
          item.toSite,
          item.transferDate,
          item.originalHireDate,
          item.matchedOldSicil,
          isPrimary
        );
      }
      db.prepare('INSERT OR REPLACE INTO system_info (key, value) VALUES (?, ?)').run(
        'inter_site_transfers_sync_key',
        expectedKey
      );
      db.exec('COMMIT;');
    } catch (txErr) {
      try {
        db.exec('ROLLBACK;');
      } catch {}
      throw txErr;
    }
  } catch {}
}
