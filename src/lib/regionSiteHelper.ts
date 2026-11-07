/**
 * Kazan Şantiye Kırılımı Yardımcısı (Site-Level Region Breakdown Helper)
 *
 * Yönetim talebi doğrultusunda "Kazan" bölgesi tek bir toplam satır olarak gösterilmez;
 * uygulama genelindeki tüm grafiklerde, tablolarda ve Telegram / E-posta bildirimlerinde
 * doğrudan Kazan altındaki şantiyeler (proje_adi: NHNK mPE-300, Kazan Katalizor,
 * Nizhnekamsk Polisterol, NHNK SKLAD PROPILEN, SIBUR Nijnekamsk, Kazan (Merkez)) olarak gösterilir.
 */

export const KAZAN_MERKEZ_LABEL = 'Kazan (Merkez)';

export function buildEffectiveRegionCaseSql(
  regionCol = 'region',
  projectCol = 'proje_adi',
  fallbackLabel = 'Diğer'
): string {
  const safeFallback = fallbackLabel.replace(/'/g, "''");
  return `CASE
    WHEN LOWER(TRIM(COALESCE(${regionCol}, ''))) IN ('kazan', 'казань') THEN
      CASE
        WHEN TRIM(COALESCE(${projectCol}, '')) != '' AND LOWER(TRIM(COALESCE(${projectCol}, ''))) NOT IN ('kazan', 'казань')
          THEN TRIM(${projectCol})
        ELSE '${KAZAN_MERKEZ_LABEL}'
      END
    ELSE COALESCE(NULLIF(TRIM(${regionCol}), ''), '${safeFallback}')
  END`;
}

export const EFFECTIVE_REGION_SQL = buildEffectiveRegionCaseSql('region', 'proje_adi', 'Diğer');

export function resolveEffectiveRegion(
  rawRegion?: string | null,
  rawProject?: string | null,
  fallback = 'Diğer'
): string {
  const reg = String(rawRegion ?? '').trim();
  const prj = String(rawProject ?? '').trim();
  const regLower = reg.toLowerCase();

  if (regLower === 'kazan' || regLower === 'казань') {
    if (prj && prj.toLowerCase() !== 'kazan' && prj.toLowerCase() !== 'казань') {
      return prj;
    }
    return KAZAN_MERKEZ_LABEL;
  }

  return reg || fallback;
}

export function buildEffectiveRegionSqlCondition(
  filterValue: string,
  regionCol = 'region',
  projectCol = 'proje_adi'
): { sql: string; params: string[] } {
  const clean = String(filterValue || '').trim();
  const lower = clean.toLowerCase();

  if (lower === 'kazan' || lower === 'казань') {
    return {
      sql: `LOWER(TRIM(COALESCE(${regionCol}, ''))) IN ('kazan', 'казань')`,
      params: [],
    };
  }

  if (lower === KAZAN_MERKEZ_LABEL.toLowerCase() || lower === 'kazan (genel)') {
    return {
      sql: `(LOWER(TRIM(COALESCE(${regionCol}, ''))) IN ('kazan', 'казань') AND (${projectCol} IS NULL OR TRIM(${projectCol}) = '' OR LOWER(TRIM(${projectCol})) IN ('kazan', 'казань')))`,
      params: [],
    };
  }

  return {
    sql: `(${regionCol} = ? OR (LOWER(TRIM(COALESCE(${regionCol}, ''))) IN ('kazan', 'казань') AND TRIM(COALESCE(${projectCol}, '')) = ?))`,
    params: [clean, clean],
  };
}

export function matchesEffectiveRegion(
  rawRegion: string | null | undefined,
  rawProject: string | null | undefined,
  filterValue: string
): boolean {
  const f = String(filterValue || '').trim();
  if (!f || f.toLowerCase() === 'all') return true;
  const fLower = f.toLowerCase();
  const rTrim = String(rawRegion ?? '').trim();
  const rLower = rTrim.toLowerCase();

  if (fLower === 'kazan' || fLower === 'казань') {
    return rLower === 'kazan' || rLower === 'казань';
  }

  const eff = resolveEffectiveRegion(rawRegion, rawProject, '');
  return eff.toLowerCase() === fLower || rLower === fLower;
}

