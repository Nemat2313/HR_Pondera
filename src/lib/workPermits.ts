// Shared RF Work Permit (Çalışma İzni / Çalışma Kartı) classification logic.
// Strictly uses the Work Permit ("Çalışma Kart *" / "Patent Form *") columns and nationality ("uyruk"),
// NEVER the Visa ("Vize *") columns.

const KT_EXPR = `UPPER(TRIM(COALESCE(json_extract(all_data_json, '$."Çalışma Kart Türü"'), '')))`;
const SN_EXPR = `TRIM(COALESCE(json_extract(all_data_json, '$."Çalışma Kart Seri No"'), ''))`;
const KN_EXPR = `TRIM(COALESCE(json_extract(all_data_json, '$."Çalışma Kart No"'), ''))`;
const PFS_EXPR = `UPPER(TRIM(COALESCE(json_extract(all_data_json, '$."Patent Form Seri No"'), '')))`;
const BG_EXPR = `COALESCE(json_extract(all_data_json, '$."Çalışma Kart Bölgesi"'), '')`;
const MK_EXPR = `UPPER(COALESCE(json_extract(all_data_json, '$."Çalışma Kartı Veren Makam"'), ''))`;

export const WORK_PERMIT_CASE_SQL = `CASE
  WHEN ${KT_EXPR} LIKE '%ВНЖ%'
    OR ${KT_EXPR} LIKE '%внж%'
    OR ${KT_EXPR} LIKE '%РВП%'
    OR ${KT_EXPR} LIKE '%рвп%'
    OR ${KT_EXPR} LIKE '%VNJ%'
    OR ${KT_EXPR} LIKE '%RVP%' THEN 'VNJ_RVP'
  WHEN uyruk = 'RUSYA'
    OR (
      ${KT_EXPR} IN ('MUAF', 'РФ', 'рф')
      AND COALESCE(uyruk, '') NOT IN ('KIRGIZISTAN', 'BELARUS', 'KAZAKISTAN', 'ERMENISTAN')
    ) THEN 'RF_CITIZEN'
  WHEN uyruk IN ('KIRGIZISTAN', 'BELARUS', 'KAZAKISTAN', 'ERMENISTAN')
    OR ${KT_EXPR} LIKE '%ЕАЭС%'
    OR ${KT_EXPR} LIKE '%еаэс%'
    OR ${KT_EXPR} LIKE '%EAES%' THEN 'EAES'
  WHEN ${KT_EXPR} LIKE '%ВКС%'
    OR ${KT_EXPR} LIKE '%вкс%'
    OR ${KT_EXPR} LIKE '%VKS%'
    OR ${SN_EXPR} = '77'
    OR (
      ${KT_EXPR} IN ('', 'РНР', 'рнр', 'RNR')
      AND (
        ${BG_EXPR} LIKE '%,%'
        OR ${MK_EXPR} LIKE '%МОСКВ%'
        OR ${MK_EXPR} LIKE '%москв%'
        OR ${MK_EXPR} LIKE '%MOSKV%'
      )
    ) THEN 'VKS'
  WHEN ${KT_EXPR} LIKE '%ПАТЕНТ%'
    OR ${KT_EXPR} LIKE '%патент%'
    OR ${KT_EXPR} LIKE '%PATENT%'
    OR ${PFS_EXPR} IN ('ПР', 'пр', 'ПP', 'пp', 'РР', 'рр', 'PP', 'РМ', 'рм')
    OR (
      ${KT_EXPR} = ''
      AND (${SN_EXPR} != '' OR ${KN_EXPR} != '')
      AND uyruk IN ('OZBEKISTAN', 'TACIKISTAN', 'AZERBAYCAN')
    ) THEN 'PATENT'
  WHEN ${KT_EXPR} LIKE '%КВОТА%'
    OR ${KT_EXPR} LIKE '%квота%'
    OR ${KT_EXPR} LIKE '%KOTA%'
    OR ${KT_EXPR} LIKE '%РНР%'
    OR ${KT_EXPR} LIKE '%рнр%'
    OR ${KT_EXPR} LIKE '%RNR%'
    OR (
      ${KT_EXPR} = ''
      AND (${SN_EXPR} != '' OR ${KN_EXPR} != '')
    ) THEN 'QUOTA_RNR'
  ELSE 'OTHER_PENDING'
END`;

export type WorkPermitCategoryKey =
  | 'VKS'
  | 'PATENT'
  | 'QUOTA_RNR'
  | 'RF_CITIZEN'
  | 'EAES'
  | 'VNJ_RVP'
  | 'OTHER_PENDING';

export function normalizePermitFilterKey(permit: string): WorkPermitCategoryKey | null {
  const pUpper = (permit || '').trim().toUpperCase();
  if (!pUpper || pUpper === 'ALL') return null;
  if (pUpper === 'VKS' || pUpper === 'ВКС') return 'VKS';
  if (pUpper === 'PATENT' || pUpper === 'ПАТЕНТ') return 'PATENT';
  if (pUpper === 'VNJ_RVP' || pUpper === 'VNJ' || pUpper === 'RVP' || pUpper === 'ВНЖ' || pUpper === 'РВП') {
    return 'VNJ_RVP';
  }
  if (pUpper === 'RF_CITIZEN' || pUpper === 'RF' || pUpper === 'РФ') return 'RF_CITIZEN';
  if (pUpper === 'EAES' || pUpper === 'EAEU' || pUpper === 'ЕАЭС') return 'EAES';
  if (pUpper === 'QUOTA_RNR' || pUpper === 'QUOTA' || pUpper === 'RNR' || pUpper === 'КВОТА' || pUpper === 'РНР') {
    return 'QUOTA_RNR';
  }
  if (pUpper === 'OTHER_PENDING' || pUpper === 'OTHER') return 'OTHER_PENDING';
  return null;
}

export function classifyWorkPermitFromRow(
  uyrukRaw: string | null | undefined,
  rawJson: Record<string, any> | null | undefined
): WorkPermitCategoryKey {
  const u = String(uyrukRaw || '').trim().toUpperCase();
  const d = rawJson || {};
  const kt = String(d['Çalışma Kart Türü'] || '').trim().toUpperCase();
  const sn = String(d['Çalışma Kart Seri No'] || '').trim();
  const kn = String(d['Çalışma Kart No'] || '').trim();
  const pfs = String(d['Patent Form Seri No'] || '').trim().toUpperCase();
  const bg = String(d['Çalışma Kart Bölgesi'] || '').trim();
  const mk = String(d['Çalışma Kartı Veren Makam'] || '').trim().toUpperCase();

  if (['ВНЖ', 'РВП', 'VNJ', 'RVP'].some((x) => kt.includes(x))) {
    return 'VNJ_RVP';
  }
  if (
    u === 'RUSYA' ||
    ((kt === 'MUAF' || kt === 'РФ') && !['KIRGIZISTAN', 'BELARUS', 'KAZAKISTAN', 'ERMENISTAN'].includes(u))
  ) {
    return 'RF_CITIZEN';
  }
  if (
    ['KIRGIZISTAN', 'BELARUS', 'KAZAKISTAN', 'ERMENISTAN'].includes(u) ||
    kt.includes('ЕАЭС') ||
    kt.includes('EAES')
  ) {
    return 'EAES';
  }
  if (
    kt.includes('ВКС') ||
    kt.includes('VKS') ||
    sn === '77' ||
    (['', 'РНР', 'RNR'].includes(kt) && (bg.includes(',') || mk.includes('МОСКВ') || mk.includes('MOSKV')))
  ) {
    return 'VKS';
  }
  if (
    kt.includes('ПАТЕНТ') ||
    kt.includes('PATENT') ||
    ['ПР', 'ПP', 'РР', 'PP', 'РМ'].includes(pfs) ||
    (kt === '' && (sn !== '' || kn !== '') && ['OZBEKISTAN', 'TACIKISTAN', 'AZERBAYCAN'].includes(u))
  ) {
    return 'PATENT';
  }
  if (
    ['КВОТА', 'KOTA', 'РНР', 'RNR'].some((x) => kt.includes(x)) ||
    (kt === '' && (sn !== '' || kn !== ''))
  ) {
    return 'QUOTA_RNR';
  }
  return 'OTHER_PENDING';
}
