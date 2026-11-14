'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  Layers,
  FolderKanban,
  CheckCircle2,
} from 'lucide-react';
import { PersonnelRecord } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { isOfficialSalaryColumn, stripOfficialSalaryFromRaw } from '@/lib/salaryPrivacy';
import { formatCellByColumn, isDateLikeColumnName } from '@/lib/dateFormatter';
import {
  ORDERED_COLUMN_GROUPS,
  classifyPonderaColumnGroupOrOther,
  isPlaceholderColumnName,
} from '@/lib/columnGroupsClassifier';

export interface DrawerColumnItem {
  key: string;
  name: string;
}

export interface DrawerColumnGroup {
  id: string;
  name: string;
  columns: DrawerColumnItem[];
}

interface PersonnelDetailDrawerProps {
  personnel: PersonnelRecord | null;
  columnGroups?: DrawerColumnGroup[];
  onClose: () => void;
}

interface ResolvedFieldEntry {
  key: string;
  label: string;
  groupName: string;
  value: string;
  isFilled: boolean;
  isDate: boolean;
}

const GROUP_LABELS_RU: Record<string, string> = {
  '1. Temel & Kimlik Bilgileri': '1. Основные и личные данные',
  '2. Pozisyon & Şantiye Görev': '2. Должность и объект',
  '3. Pasaport Evrakları': '3. Паспортные данные',
  '4. Vize & Davetiye Evrakları': '4. Виза и приглашение',
  '5. Propusk (Saha Giriş Kartı)': '5. Пропуск на объект',
  '6. Migrasyon & Registrasyon': '6. Миграция и регистрация',
  '7. Patent & Çalışma İzni': '7. Патент и разрешение',
  '8. Daktiloskopiya (Parmak İzi)': '8. Дактилоскопия',
  '9. Vergi & SNILS / INN': '9. ИНН и СНИЛС',
  '10. İş Sözleşmesi & Resmi Bordro': '10. Трудовой договор и 1С ЗУП',
  '11. İSG, HSE & Dil Sertifikaları': '11. ОТ, HSE и сертификаты',
  '12. Sağlık, Medikal & DMS': '12. Медицина и ДМС',
  '13. Karantina & Medikal Testler': '13. Карантин и тесты',
  '14. Konaklama, Kamp & Ulaşım': '14. Проживание и транспорт',
  '15. İletişim & Adres Bilgileri': '15. Контакты и адреса',
  '16. İşten Çıkış & Fesih': '16. Увольнение и расторжение',
  'Diğer Kolonlar': 'Прочие колонки',
  'Tüm Kolonlar': 'Все колонки',
};

function normalizeLookupKey(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const TOP_LEVEL_PROP_BY_NORMALIZED_COL: Record<string, keyof PersonnelRecord> = {
  sira_no: 'sira_no',
  sicil_no: 'sicil_no',
  rhi_id: 'rhi_id',
  sirket_id: 'rhi_id',
  saren_no: 'saren_no',
  genel_durum: 'genel_durum',
  genel_durumu: 'genel_durum',
  guncel_durum: 'guncel_durum',
  guncel_durumu: 'guncel_durum',
  uyruk: 'uyruk',
  ad_soyad: 'ad_soyad',
  adi: 'adi',
  soyadi: 'soyadi',
  baba_adi: 'baba_adi',
  tam_adi_kiril: 'tam_adi_kiril',
  cinsiyet: 'cinsiyet',
  dogum_tarihi: 'dogum_tarihi',
  dogum_yeri: 'dogum_yeri',
  tc_kimlik_no: 'tc_kimlik_no',
  pasaport_no: 'pasaport_no',
  pasaport_gecerlilik: 'pasaport_gecerlilik',
  pasaport_gecerlilik_tarihi: 'pasaport_gecerlilik',
  region: 'region',
  proje_adi: 'proje_adi',
  calisma_lokasyon: 'calisma_lokasyon',
  calisma_lokasyon_durumu: 'calisma_lokasyon',
  kategori: 'kategori',
  firma: 'firma',
  departman: 'departman',
  gorevi: 'gorevi',
  rhi_gorevi: 'rhi_gorevi',
  ek_gorev: 'rhi_gorevi',
  sorumlu_kisi: 'sorumlu_kisi',
  grup_sefi: 'grup_sefi',
  endirekt_direkt: 'endirekt_direkt',
  yaka_turu: 'endirekt_direkt',
  gunduz_gece: 'gunduz_gece',
  gunduz_gece_durumu: 'gunduz_gece',
  ise_giris_tarihi: 'ise_giris_tarihi',
  santiye_giris_tarihi: 'santiye_giris_tarihi',
  cikis_tarihi: 'cikis_tarihi',
  cikis_sebebi: 'cikis_sebebi',
  propusk_no: 'propusk_no',
  propusk_bitis_tarihi: 'propusk_bitis_tarihi',
  vize_no: 'vize_no',
  vize_bitis_tarihi: 'vize_bitis_tarihi',
  migrasyon_no: 'migrasyon_no',
  inn_no: 'inn_no',
  patent_alis_tarihi: 'patent_alis_tarihi',
  patent_bitis_tarihi: 'patent_bitis_tarihi',
  kamp_no: 'kamp_no',
  oda_no: 'oda_no',
  telefon_no: 'telefon_no',
  e_mail: 'email',
  email: 'email',
  '1c_zup_giris_tarihi': 'zup_hire_date',
  zup_hire_date: 'zup_hire_date',
  '1c_zup_cikis_tarihi': 'zup_dismissal_date',
  zup_dismissal_date: 'zup_dismissal_date',
  '1c_zup_tabel_no': 'zup_tabel_no',
  zup_tabel_no: 'zup_tabel_no',
  '1c_zup_durumu': 'zup_status',
  zup_status: 'zup_status',
};

function cleanDisplayLabel(colName: string): string {
  if (colName === 'RHI ID' || colName === 'RHI Id') return 'Şirket ID';
  if (colName === 'RHI Görevi') return 'Ek Görev';
  if (colName.includes('RHI')) return colName.replace(/RHI/g, 'Şirket');
  return colName;
}

export default function PersonnelDetailDrawer({
  personnel,
  columnGroups,
  onClose,
}: PersonnelDetailDrawerProps) {
  const { lang, translateCol, translateVal } = useLanguage();
  const [activeTab, setActiveTab] = useState<string>(ORDERED_COLUMN_GROUPS[0]);
  const [searchField, setSearchField] = useState('');
  const [onlyFilledInAll, setOnlyFilledInAll] = useState(false);
  const [fetchedGroups, setFetchedGroups] = useState<DrawerColumnGroup[]>([]);
  const [detailedRecord, setDetailedRecord] = useState<PersonnelRecord | null>(null);

  const passedTotalCols = useMemo(
    () => (columnGroups || []).reduce((acc, g) => acc + (g.columns?.length || 0), 0),
    [columnGroups]
  );

  // Ensure full ~196 column schema is always loaded from /api/columns
  useEffect(() => {
    if (passedTotalCols >= 120 || fetchedGroups.length > 0) return;
    let cancelled = false;
    fetch('/api/columns')
      .then((r) => r.json())
      .then((resData) => {
        if (cancelled || !resData?.success || !resData?.grouped) return;
        const loaded: DrawerColumnGroup[] = Object.entries(resData.grouped)
          .map(([groupName, cols]: [string, any], idx) => ({
            id: `drawer_grp_${idx + 1}`,
            name: groupName,
            columns: (cols || [])
              .filter(
                (c: any) =>
                  !isPlaceholderColumnName(c.key || c.name) &&
                  !isOfficialSalaryColumn(c.key) &&
                  !isOfficialSalaryColumn(c.name)
              )
              .map((c: any) => ({
                key: c.key || c.name,
                name: cleanDisplayLabel(c.name || c.key),
              })),
          }))
          .filter((g) => g.columns.length > 0);
        if (loaded.length > 0) {
          setFetchedGroups(loaded);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [passedTotalCols, fetchedGroups.length]);

  // If personnel was opened from a table that did not include `raw`, fetch full details by ID
  useEffect(() => {
    if (!personnel?.id) {
      setDetailedRecord(null);
      return;
    }
    const hasRaw = personnel.raw && Object.keys(personnel.raw).length > 0;
    if (hasRaw) {
      setDetailedRecord(personnel);
      return;
    }
    let cancelled = false;
    setDetailedRecord(personnel);
    fetch(`/api/personnel?id=${encodeURIComponent(String(personnel.id))}&includeDetails=true`)
      .then((r) => r.json())
      .then((resData) => {
        if (!cancelled && resData?.success && Array.isArray(resData.data) && resData.data[0]) {
          setDetailedRecord(resData.data[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [personnel]);

  const activePersonnel = detailedRecord || personnel;

  // Build complete 16 groups + Diğer Kolonlar + Tüm Kolonlar resolved dataset
  const { groupMap, otherFields, allFields, filledTotalCount } = useMemo(() => {
    const emptyResult = {
      groupMap: {} as Record<string, ResolvedFieldEntry[]>,
      otherFields: [] as ResolvedFieldEntry[],
      allFields: [] as ResolvedFieldEntry[],
      filledTotalCount: 0,
    };
    if (!activePersonnel) return emptyResult;

    const rawObj = stripOfficialSalaryFromRaw(activePersonnel.raw || {});
    const normalizedRawLookup = new Map<string, unknown>();
    for (const [rk, rv] of Object.entries(rawObj)) {
      if (isOfficialSalaryColumn(rk) || isPlaceholderColumnName(rk)) continue;
      const nk = normalizeLookupKey(rk);
      if (nk && !normalizedRawLookup.has(nk)) {
        normalizedRawLookup.set(nk, rv);
      }
    }

    const resolveField = (colKey: string, colLabel: string): { formatted: string; filled: boolean } => {
      if (isOfficialSalaryColumn(colKey) || isOfficialSalaryColumn(colLabel)) {
        return { formatted: '-', filled: false };
      }

      let rawVal: unknown = undefined;
      const recAny = activePersonnel as unknown as Record<string, unknown>;
      const nkKey = normalizeLookupKey(colKey);
      const nkLabel = normalizeLookupKey(colLabel);

      // 1. Exact raw match first (preserves original Excel column values)
      if (rawObj[colKey] !== undefined && rawObj[colKey] !== null && String(rawObj[colKey]).trim() !== '') {
        rawVal = rawObj[colKey];
      } else if (
        rawObj[colLabel] !== undefined &&
        rawObj[colLabel] !== null &&
        String(rawObj[colLabel]).trim() !== ''
      ) {
        rawVal = rawObj[colLabel];
      }

      // 2. Top-level mapped PersonnelRecord property
      if (rawVal === undefined) {
        const propFromKey = TOP_LEVEL_PROP_BY_NORMALIZED_COL[nkKey] || TOP_LEVEL_PROP_BY_NORMALIZED_COL[nkLabel];
        if (propFromKey && recAny[propFromKey] !== undefined && recAny[propFromKey] !== null) {
          const candidate = String(recAny[propFromKey]).trim();
          if (candidate !== '') rawVal = recAny[propFromKey];
        }
      }

      // 3. Direct snake_case property on PersonnelRecord
      if (rawVal === undefined) {
        if (nkKey && recAny[nkKey] !== undefined && recAny[nkKey] !== null && String(recAny[nkKey]).trim() !== '') {
          rawVal = recAny[nkKey];
        } else if (
          nkLabel &&
          recAny[nkLabel] !== undefined &&
          recAny[nkLabel] !== null &&
          String(recAny[nkLabel]).trim() !== ''
        ) {
          rawVal = recAny[nkLabel];
        }
      }

      // 4. Normalized fallback lookup in raw JSON
      if (rawVal === undefined) {
        const fromNormKey = nkKey ? normalizedRawLookup.get(nkKey) : undefined;
        const fromNormLabel = nkLabel ? normalizedRawLookup.get(nkLabel) : undefined;
        if (fromNormKey !== undefined && fromNormKey !== null && String(fromNormKey).trim() !== '') {
          rawVal = fromNormKey;
        } else if (fromNormLabel !== undefined && fromNormLabel !== null && String(fromNormLabel).trim() !== '') {
          rawVal = fromNormLabel;
        }
      }

      const formatted = formatCellByColumn(rawVal, colLabel, colKey, '-');
      const filled = formatted !== '-' && formatted !== '—' && formatted.trim() !== '';
      return { formatted, filled };
    };

    const sourceGroups =
      passedTotalCols >= 120 ? columnGroups || [] : fetchedGroups.length > 0 ? fetchedGroups : columnGroups || [];

    const buckets: Record<string, ResolvedFieldEntry[]> = {};
    for (const grp of ORDERED_COLUMN_GROUPS) {
      buckets[grp] = [];
    }
    const others: ResolvedFieldEntry[] = [];
    const seenNormalized = new Set<string>();

    const addEntry = (targetList: ResolvedFieldEntry[], groupName: string, key: string, label: string) => {
      if (isOfficialSalaryColumn(key) || isOfficialSalaryColumn(label) || isPlaceholderColumnName(key)) return;
      const nk = normalizeLookupKey(key) || normalizeLookupKey(label);
      if (!nk || seenNormalized.has(nk)) return;
      seenNormalized.add(nk);
      seenNormalized.add(normalizeLookupKey(label));

      const { formatted, filled } = resolveField(key, label);
      targetList.push({
        key,
        label: cleanDisplayLabel(label),
        groupName,
        value: formatted,
        isFilled: filled,
        isDate: isDateLikeColumnName(label, key),
      });
    };

    // Populate from schema groups (routing auxiliary fields into 'Diğer Kolonlar')
    for (const grp of sourceGroups) {
      for (const col of grp.columns || []) {
        const rawKey = col.key || col.name;
        const cleanLabel = cleanDisplayLabel(col.name || col.key);
        const classified = classifyPonderaColumnGroupOrOther(rawKey);
        if (classified === 'Diğer Kolonlar') {
          addEntry(others, 'Diğer Kolonlar', rawKey, cleanLabel);
        } else {
          const targetGroup = (ORDERED_COLUMN_GROUPS as readonly string[]).includes(grp.name)
            ? grp.name
            : classified;
          if (!buckets[targetGroup]) buckets[targetGroup] = [];
          addEntry(buckets[targetGroup], targetGroup, rawKey, cleanLabel);
        }
      }
    }

    // Add 1C ZUP Giriş & Çıkış Tarihi into Group 10 (İş Sözleşmesi & Resmi Bordro)
    addEntry(
      buckets['10. İş Sözleşmesi & Resmi Bordro'],
      '10. İş Sözleşmesi & Resmi Bordro',
      'zup_hire_date',
      '1C ZUP Giriş Tarihi'
    );
    addEntry(
      buckets['10. İş Sözleşmesi & Resmi Bordro'],
      '10. İş Sözleşmesi & Resmi Bordro',
      'zup_dismissal_date',
      '1C ZUP Çıkış Tarihi'
    );

    // Add 1C ZUP Tabel No & Durumu + any remaining unmapped keys from rawObj into 'Diğer Kolonlar'
    addEntry(others, 'Diğer Kolonlar', 'zup_tabel_no', '1C ZUP Tabel No');
    addEntry(others, 'Diğer Kolonlar', 'zup_status', '1C ZUP Durumu');

    for (const rk of Object.keys(rawObj)) {
      if (isOfficialSalaryColumn(rk) || isPlaceholderColumnName(rk)) continue;
      const nk = normalizeLookupKey(rk);
      if (seenNormalized.has(nk)) continue;
      addEntry(others, 'Diğer Kolonlar', rk, rk);
    }

    const combinedAll: ResolvedFieldEntry[] = [];
    for (const grp of ORDERED_COLUMN_GROUPS) {
      combinedAll.push(...(buckets[grp] || []));
    }
    combinedAll.push(...others);

    const filledCount = combinedAll.filter((f) => f.isFilled).length;

    return {
      groupMap: buckets,
      otherFields: others,
      allFields: combinedAll,
      filledTotalCount: filledCount,
    };
  }, [activePersonnel, columnGroups, fetchedGroups, passedTotalCols]);

  if (!activePersonnel) return null;

  const getTabLabel = (tabId: string): string => {
    if (lang === 'ru') return GROUP_LABELS_RU[tabId] || tabId;
    return tabId;
  };

  const tabItems = [
    ...ORDERED_COLUMN_GROUPS.map((grpName) => {
      const items = groupMap[grpName] || [];
      const filled = items.filter((i) => i.isFilled).length;
      return {
        id: grpName,
        label: getTabLabel(grpName),
        total: items.length,
        filled,
        kind: 'group' as const,
      };
    }),
    {
      id: 'Diğer Kolonlar',
      label: getTabLabel('Diğer Kolonlar'),
      total: otherFields.length,
      filled: otherFields.filter((i) => i.isFilled).length,
      kind: 'other' as const,
    },
    {
      id: 'Tüm Kolonlar',
      label: getTabLabel('Tüm Kolonlar'),
      total: allFields.length,
      filled: filledTotalCount,
      kind: 'all' as const,
    },
  ];

  const activeGroupFields: ResolvedFieldEntry[] =
    activeTab === 'Tüm Kolonlar'
      ? allFields
      : activeTab === 'Diğer Kolonlar'
      ? otherFields
      : groupMap[activeTab] || [];

  const filteredFields = activeGroupFields.filter((entry) => {
    if (activeTab === 'Tüm Kolonlar' && onlyFilledInAll && !entry.isFilled) {
      return false;
    }
    if (!searchField.trim()) return true;
    const q = searchField.trim().toLowerCase();
    const translatedCol = translateCol(entry.label).toLowerCase();
    const translatedVal = entry.isFilled ? translateVal(entry.value).toLowerCase() : '';
    return (
      entry.label.toLowerCase().includes(q) ||
      translatedCol.includes(q) ||
      entry.value.toLowerCase().includes(q) ||
      translatedVal.includes(q) ||
      entry.groupName.toLowerCase().includes(q)
    );
  });

  const renderFieldCard = (entry: ResolvedFieldEntry) => {
    const displayVal = entry.isFilled ? translateVal(entry.value) : '-';
    return (
      <div
        key={`${entry.groupName}:${entry.key}`}
        className={`p-3 rounded-xl border transition-colors ${
          entry.isFilled
            ? 'bg-emerald-50/40 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-800/60'
            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            {translateCol(entry.label)}
          </span>
          {activeTab === 'Tüm Kolonlar' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300 shrink-0">
              {getTabLabel(entry.groupName).split('.')[0]}
            </span>
          )}
        </div>
        <span
          title={String(displayVal)}
          className={`text-sm mt-1 block break-words ${
            entry.isDate ? 'font-mono ' : ''
          }${
            entry.isFilled
              ? 'font-bold text-slate-900 dark:text-white'
              : 'font-medium text-slate-400 dark:text-slate-500'
          }`}
        >
          {displayVal}
        </span>
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl bg-white dark:bg-[#0F172A] border-l border-slate-200/80 dark:border-slate-800 h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300"
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-13 h-13 shrink-0 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-lg flex items-center justify-center shadow-md shadow-emerald-500/20">
              {activePersonnel.ad_soyad
                ? activePersonnel.ad_soyad
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                : 'P'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  {activePersonnel.ad_soyad}
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activePersonnel.genel_durum === 'Mevcut'
                      ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {translateVal(activePersonnel.genel_durum)}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  {allFields.length} {lang === 'ru' ? 'колонок' : 'Kolon'} ({filledTotalCount}{' '}
                  {lang === 'ru' ? 'заполн.' : 'Dolu'})
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                Sicil:{' '}
                <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                  {activePersonnel.sicil_no || '-'}
                </span>
                {activePersonnel.zup_hire_date && activePersonnel.zup_hire_date !== '-' && (
                  <span className="ml-3 text-indigo-600 dark:text-indigo-400 font-semibold">
                    • 1C ZUP Giriş: <span className="font-mono">{activePersonnel.zup_hire_date}</span>
                  </span>
                )}
                {activePersonnel.zup_dismissal_date && activePersonnel.zup_dismissal_date !== '-' && (
                  <span className="ml-3 text-rose-600 dark:text-rose-400 font-semibold">
                    • 1C ZUP Çıkış: <span className="font-mono">{activePersonnel.zup_dismissal_date}</span>
                  </span>
                )}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 truncate">
                {translateVal(activePersonnel.gorevi || 'Görevi Belirtilmemiş')} •{' '}
                {translateVal(activePersonnel.region)} / {translateVal(activePersonnel.proje_adi)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 16 Operational Group Tabs + Diğer Kolonlar + Tüm Kolonlar */}
        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0F172A] max-h-40 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.id;
              const isAll = tab.kind === 'all';
              const isOther = tab.kind === 'other';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border ${
                    isActive
                      ? isAll
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : isOther
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-teal-600 text-white border-teal-600 shadow-xs'
                      : isAll
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                      : isOther
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isAll && <Layers className="w-3.5 h-3.5 shrink-0" />}
                  {isOther && <FolderKanban className="w-3.5 h-3.5 shrink-0" />}
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      isActive
                        ? 'bg-black/20 text-white'
                        : tab.filled > 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-200/80 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tab.filled}/{tab.total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchField}
              onChange={(e) => setSearchField(e.target.value)}
              placeholder={
                lang === 'ru'
                  ? 'Поиск по названию колонки или значению...'
                  : 'Bu sekmede kolon adı veya değer ara... (örn: Pasaport, Tarih, Propusk, Vize)'
              }
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            {searchField && (
              <button
                type="button"
                onClick={() => setSearchField('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            {activeTab === 'Tüm Kolonlar' && (
              <button
                type="button"
                onClick={() => setOnlyFilledInAll((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border transition-colors cursor-pointer ${
                  onlyFilledInAll
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {onlyFilledInAll
                    ? lang === 'ru'
                      ? `Только заполненные (${filledTotalCount})`
                      : `Sadece Dolu Alanlar (${filledTotalCount})`
                    : lang === 'ru'
                    ? `Все колонки (${allFields.length})`
                    : `Tüm Kolonları Göster (${allFields.length})`}
                </span>
              </button>
            )}
            <span className="text-slate-500 dark:text-slate-400 font-semibold">
              {filteredFields.length}{' '}
              {lang === 'ru' ? 'полей отображается' : 'kolon listeleniyor'}
            </span>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {getTabLabel(activeTab)}
            </h3>
          </div>

          {filteredFields.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
              {lang === 'ru'
                ? 'По заданному фильтру поля не найдены.'
                : 'Arama kriterine uygun kolon bulunamadı.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredFields.map((entry) => renderFieldCard(entry))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Pondera HR ID: #{activePersonnel.id} • {allFields.length}{' '}
            {lang === 'ru' ? 'активных полей (без данных о зарплате)' : 'aktif kolon'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors shadow-2xs cursor-pointer"
          >
            {lang === 'ru' ? 'Закрыть' : 'Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}
