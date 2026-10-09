'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Building,
  UserCheck,
  Shield,
  Layers,
  CheckSquare,
  Square,
  MinusSquare,
  ChevronDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PersonnelRecord, FilterOptions } from '@/types';
import PersonnelDetailDrawer from './PersonnelDetailDrawer';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface PersonnelListViewProps {
  initialFilter?: { type: string; value: string } | null;
  onClearInitialFilter?: () => void;
}

export interface ColumnItem {
  key: string;
  name: string;
  defaultVisible?: boolean;
}

export interface ColumnGroupDef {
  id: string;
  name: string;
  columns: ColumnItem[];
}

export const DEFAULT_VISIBLE_NAMES = new Set([
  'Sicil No',
  'Ad Soyad',
  'Uyruk',
  'Region',
  'Proje Adı',
  'Departman',
  'Görevi',
  'İşe Giriş Tarihi',
  'Şantiye Giriş Tarihi',
]);

export const toSnakeCase = (str: string) =>
  str
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

// 16 Document & Operational Categories covering all 198 columns
const INITIAL_COLUMN_GROUPS: ColumnGroupDef[] = [
  {
    id: 'grup1',
    name: '1. Temel & Kimlik Bilgileri',
    columns: [
      { key: 'sira_no', name: 'Sıra No', defaultVisible: false },
      { key: 'sicil_no', name: 'Sicil No', defaultVisible: true },
      { key: 'rhi_id', name: 'Şirket ID', defaultVisible: false },
      { key: 'saren_no', name: 'Saren No', defaultVisible: false },
      { key: 'genel_durum', name: 'Genel Durumu', defaultVisible: false },
      { key: 'guncel_durum', name: 'Güncel Durumu', defaultVisible: false },
      { key: 'uyruk', name: 'Uyruk', defaultVisible: true },
      { key: 'ad_soyad', name: 'Ad Soyad', defaultVisible: true },
      { key: 'adi', name: 'Adı', defaultVisible: false },
      { key: 'soyadi', name: 'Soyadı', defaultVisible: false },
      { key: 'baba_adi', name: 'Baba Adı', defaultVisible: false },
      { key: 'tam_adi_kiril', name: 'Tam Adı (Kiril)', defaultVisible: false },
      { key: 'cinsiyet', name: 'Cinsiyet', defaultVisible: false },
      { key: 'dogum_tarihi', name: 'Doğum Tarihi', defaultVisible: false },
      { key: 'dogum_yeri', name: 'Doğum Yeri', defaultVisible: false },
      { key: 'tc_kimlik_no', name: 'TC Kimlik No', defaultVisible: false },
      { key: 'ise_giris_tarihi', name: 'İşe Giriş Tarihi', defaultVisible: true },
      { key: 'santiye_giris_tarihi', name: 'Şantiye Giriş Tarihi', defaultVisible: true },
    ],
  },
  {
    id: 'grup2',
    name: '2. Pozisyon & Şantiye Görev',
    columns: [
      { key: 'region', name: 'Region', defaultVisible: true },
      { key: 'proje_adi', name: 'Proje Adı', defaultVisible: true },
      { key: 'calisma_lokasyon', name: 'Çalışma Lokasyon Durumu', defaultVisible: false },
      { key: 'kategori', name: 'Kategori', defaultVisible: false },
      { key: 'firma', name: 'Firma', defaultVisible: false },
      { key: 'departman', name: 'Departman', defaultVisible: true },
      { key: 'gorevi', name: 'Görevi', defaultVisible: true },
      { key: 'rhi_gorevi', name: 'Ek Görev', defaultVisible: false },
      { key: 'sorumlu_kisi', name: 'Sorumlu Kişi', defaultVisible: false },
      { key: 'grup_sefi', name: 'Grup Şefi', defaultVisible: false },
      { key: 'endirekt_direkt', name: 'Endirekt / Direkt', defaultVisible: false },
      { key: 'gunduz_gece', name: 'Gündüz / Gece Durumu', defaultVisible: false },
    ],
  },
  {
    id: 'grup3',
    name: '3. Pasaport Evrakları',
    columns: [
      { key: 'pasaport_no', name: 'Pasaport No', defaultVisible: false },
      { key: 'pasaport_gecerlilik', name: 'Pasaport Geçerlilik Tarihi', defaultVisible: false },
      { key: 'pasaport_duzenleme', name: 'Pasaport Düzenleme Tarihi', defaultVisible: false },
      { key: 'pasaport_yenileme_basvuru', name: 'Pasaport Yenileme Başvuru Tarihi', defaultVisible: false },
      { key: 'pasaport_yenileme_alis', name: 'Pasaport Yenileme Alis Tarihi', defaultVisible: false },
      { key: 'pasaport_tercume_gonderim', name: 'Pasaport Tercüme Gönderim Tarihi', defaultVisible: false },
      { key: 'pasaport_tercume_gelis', name: 'Pasaport Tercüme Geliş Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup4',
    name: '4. Vize & Davetiye Evrakları',
    columns: [
      { key: 'vize_no', name: 'Vize No', defaultVisible: false },
      { key: 'vize_bitis_tarihi', name: 'Vize Bitiş Tarihi', defaultVisible: false },
      { key: 'vize_baslangic_tarihi', name: 'Vize Başlangıç Tarihi', defaultVisible: false },
      { key: 'vize_alis_tarihi', name: 'Vize Alış Tarihi', defaultVisible: false },
      { key: 'uzatim_vize_basvuru_tarihi', name: 'Uzatım Vize Başvuru Tarihi', defaultVisible: false },
      { key: 'davetiye_teslim_tarihi', name: 'Davetiye Teslim Tarihi', defaultVisible: false },
      { key: 'davetiye_gelis_tarihi', name: 'Davetiye Geliş Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup5',
    name: '5. Propusk (Saha Giriş Kartı)',
    columns: [
      { key: 'propusk_no', name: 'Propusk No', defaultVisible: false },
      { key: 'propusk_bitis_tarihi', name: 'Propusk Bitiş Tarihi', defaultVisible: false },
      { key: 'propusk_basvuru_tarihi', name: 'Propusk Başvuru Tarihi', defaultVisible: false },
      { key: 'propusk_alinistarihi', name: 'Propusk AlınışTarihi', defaultVisible: false },
      { key: 'propusk_bitis_tarihi_fsb', name: 'Propusk Bitiş Tarihi FSB', defaultVisible: false },
      { key: 'propusk_basvuru_tarihi_fsb', name: 'Propusk Başvuru Tarihi FSB', defaultVisible: false },
      { key: 'propusk_alinistarihi_fsb', name: 'Propusk Alınış Tarihi FSB', defaultVisible: false },
    ],
  },
  {
    id: 'grup6',
    name: '6. Migrasyon & Registrasyon',
    columns: [
      { key: 'migrasyon_no', name: 'Migrasyon No', defaultVisible: false },
      { key: 'migrasyon_giris_tarihi', name: 'Migrasyon Giriş Tarihi', defaultVisible: false },
      { key: 'registrasyon_doldurma_tarihi', name: 'Registrasyon Doldurma Tarihi', defaultVisible: false },
      { key: 'registrasyon_dosyalama_tarihi', name: 'Registrasyon Dosyalama Tarihi', defaultVisible: false },
      { key: 'registrasyon_alis_tarihi', name: 'Registrasyon Alış Tarihi', defaultVisible: false },
      { key: 'registrasyon_bitis_tarihi', name: 'Registrasyon Bitiş Tarihi', defaultVisible: false },
      { key: 'registrasyon_cikis_tarihi', name: 'Registrasyon Çıkış Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup7',
    name: '7. Patent & Çalışma İzni',
    columns: [
      { key: 'patent_alis_tarihi', name: 'Patent Alış Tarihi', defaultVisible: false },
      { key: 'patent_bitis_tarihi', name: 'Patent Bitiş Tarihi', defaultVisible: false },
      { key: 'patent_basvuru_tarihi', name: 'Patent Başvuru Tarihi', defaultVisible: false },
      { key: 'patent_ceki_bitis_tarihi', name: 'Patent Çeki Bitiş Tarihi', defaultVisible: false },
      { key: 'patent_ceki_baslangic_tarihi', name: 'Patent Çeki Başlangıç Tarihi', defaultVisible: false },
      { key: 'calisma_kart_alis_tarihi', name: 'Çalışma Kart Alış Tarihi', defaultVisible: false },
      { key: 'calisma_kart_bitis_tarihi', name: 'Çalışma Kart Bitiş Tarihi', defaultVisible: false },
      { key: 'calisma_kart_baslangic_tarihi', name: 'Çalışma Kart Başlangıç Tarihi', defaultVisible: false },
      { key: 'patent_odeme_tarihi', name: 'Patent Ödeme Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup8',
    name: '8. Daktiloskopiya (Parmak İzi)',
    columns: [
      { key: 'daktilo_bitis', name: 'Daktiloskopiya Bitis Tarihi', defaultVisible: false },
      { key: 'daktilo_basvuru', name: 'Daktiloskopiya Başvuru Tarihi', defaultVisible: false },
      { key: 'daktilo_alis', name: 'Daktiloskopiya Alış Tarihi', defaultVisible: false },
      { key: 'daktilo_yenileme', name: 'Daktiloskopiya Yenileme Tarihi', defaultVisible: false },
      { key: 'daktilo_baslangic', name: 'Daktiloskopiya Başlangıç Tarihi', defaultVisible: false },
      { key: 'gosusluga_basvuru', name: 'Gosusluga Başvuru Tarihi', defaultVisible: false },
      { key: 'biometri_basvuru', name: 'Biometri Başvuru Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup9',
    name: '9. Vergi & SNILS / INN',
    columns: [
      { key: 'inn_no', name: 'INN No', defaultVisible: false },
      { key: 'inn_basvuru_tarihi', name: 'INN Başvuru Tarihi', defaultVisible: false },
      { key: 'inn_alis_tarihi', name: 'INN Alış Tarihi', defaultVisible: false },
      { key: 'snils_no', name: 'SNILS No', defaultVisible: false },
      { key: 'nfs_bildirim_alis', name: 'NFS den Bildirimin Alındığı Tarih', defaultVisible: false },
      { key: 'nfs_gonderim', name: 'Başvurunun NFS e Gönderilme Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup10',
    name: '10. İş Sözleşmesi & Resmi Bordro',
    columns: [
      { key: 'is_sozlesmesi_no', name: 'İş Sözleşmesi Numarası', defaultVisible: false },
      { key: 'is_sozlesmesi_imza', name: 'İş Sözleşmesi İmza Tarihi', defaultVisible: false },
      { key: 'is_sozlesmesi_giris', name: 'İş Sözleşmesi Giriş Tarihi', defaultVisible: false },
      { key: 'ek_is_sozlesmesi_tarihi', name: 'Ek İş Sözleşmesi Tarihi', defaultVisible: false },
      { key: 'resmi_maas', name: 'Resmi Maaş', defaultVisible: false },
      { key: 'resmi_firma', name: 'Resmi Firma', defaultVisible: false },
      { key: 'resmi_gorevi', name: 'Resmi Görevi', defaultVisible: false },
      { key: 'resmi_cikis_tarihi', name: 'Resmi Çıkış Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup11',
    name: '11. İSG, HSE & Dil Sertifikaları',
    columns: [
      { key: 'hse_egitim_tarihi', name: 'HSE Eğitim Tarihi', defaultVisible: false },
      { key: 'hse_egitime_giris', name: 'HSE Eğitime Giriş Tarihi', defaultVisible: false },
      { key: 'dil_sinavi_tarih', name: 'Dil Sınavı Geçtiği Tarih', defaultVisible: false },
      { key: 'dil_sertifikasi_gelis', name: 'Dil Sertifikası Geliş Tarihi', defaultVisible: false },
      { key: 'dil_sertifikasi_bitis', name: 'Dil Sertifikası Bitiş Tarihi', defaultVisible: false },
      { key: 'dil_sertifikasi_baslangic', name: 'Dil Sertifikası Başlangıç Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup12',
    name: '12. Sağlık, Medikal & DMS',
    columns: [
      { key: 'dms_bitis_tarihi', name: 'DMS Bitiş Tarihi', defaultVisible: false },
      { key: 'dms_baslangic_tarihi', name: 'DMS Başlangıç Tarihi', defaultVisible: false },
      { key: 'dms_verilis_tarihi', name: 'DMS Veriliş Tarihi', defaultVisible: false },
      { key: 'saglik_rapor_tarihi', name: 'Sağlık Rapor Tarihi', defaultVisible: false },
      { key: 'saglik_29n_rapor', name: 'Sağlık 29n Rapor Alış Tarihi', defaultVisible: false },
      { key: 'kan_test_tarihi', name: 'Kan Test Tarihi', defaultVisible: false },
      { key: 'rontgen_tarihi', name: 'Röntgen Tarihi', defaultVisible: false },
      { key: 'asi_rapor_tarihi', name: 'Aşı Rapor Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup13',
    name: '13. Karantina & Medikal Testler',
    columns: [
      { key: 'karantina_giris_tarihi', name: 'Karantina Giriş Tarihi', defaultVisible: false },
      { key: 'karantina_cikis_tarihi', name: 'Karantina Çıkış Tarihi', defaultVisible: false },
      { key: 'pcr_test1_tarih', name: 'PCR Test1 Tarih', defaultVisible: false },
      { key: 'antikor_test_tarihi', name: 'Antikor Test Tarihi', defaultVisible: false },
    ],
  },
  {
    id: 'grup14',
    name: '14. Konaklama, Kamp & Ulaşım',
    columns: [
      { key: 'kamp_no', name: 'Kamp No', defaultVisible: false },
      { key: 'oda_no', name: 'Oda No', defaultVisible: false },
      { key: 'blok_no', name: 'Blok No', defaultVisible: false },
      { key: 'yatak_no', name: 'Yatak No', defaultVisible: false },
    ],
  },
  {
    id: 'grup15',
    name: '15. İletişim & Adres Bilgileri',
    columns: [
      { key: 'telefon_no', name: 'Telefon No', defaultVisible: false },
      { key: 'email', name: 'Email', defaultVisible: false },
      { key: 'acil_durum_kisi', name: 'Acil Durum Kişi', defaultVisible: false },
      { key: 'acil_durum_tel', name: 'Acil Durum Telefon', defaultVisible: false },
    ],
  },
  {
    id: 'grup16',
    name: '16. İşten Çıkış & Fesih',
    columns: [
      { key: 'cikis_tarihi', name: 'Çıkış Tarihi', defaultVisible: false },
      { key: 'cikis_sebebi', name: 'Çıkış Sebebi', defaultVisible: false },
      { key: 'tahmini_cikis_tarihi', name: 'Tahmini Çıkış Tarihi', defaultVisible: false },
    ],
  },
];

export default function PersonnelListView({
  initialFilter,
  onClearInitialFilter,
}: PersonnelListViewProps) {
  const { user } = useAuth();
  const { lang, t, translateCol, translateVal, translateGroup } = useLanguage();

  // Column Groups state (preloaded with 16 groups, then synced with /api/columns)
  const [columnGroups, setColumnGroups] = useState<ColumnGroupDef[]>(INITIAL_COLUMN_GROUPS);

  // State
  const [data, setData] = useState<PersonnelRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters with RLS presets
  const [search, setSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState(
    user?.scope_type === 'region' ? user.scope_value : 'all'
  );
  const [filterProject, setFilterProject] = useState(
    user?.scope_type === 'project' ? user.scope_value : 'all'
  );
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterNationality, setFilterNationality] = useState('all');
  const [filterStatus, setFilterStatus] = useState('Mevcut');
  const [filterCollar, setFilterCollar] = useState('all');

  // Sorting - default to Sicil No
  const [sortBy, setSortBy] = useState('sicil_no');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Horizontal Scroll & Group Bar Expansion
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isGroupBarExpanded, setIsGroupBarExpanded] = useState(true);

  const handleTableScroll = () => {
    if (!tableContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
    const max = scrollWidth - clientWidth;
    if (max > 0) {
      setScrollPercent(Math.round((scrollLeft / max) * 100));
    } else {
      setScrollPercent(0);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setScrollPercent(pct);
    if (!tableContainerRef.current) return;
    const { scrollWidth, clientWidth } = tableContainerRef.current;
    const max = scrollWidth - clientWidth;
    tableContainerRef.current.scrollLeft = (pct / 100) * max;
  };

  const scrollStep = (pixels: number) => {
    if (!tableContainerRef.current) return;
    tableContainerRef.current.scrollBy({ left: pixels, behavior: 'smooth' });
  };

  // Filter options from API
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    regions: [],
    projects: [],
    departments: [],
    categories: [],
    nationalities: [],
    statuses: [],
  });

  // Selected Personnel for Detail Drawer
  const [selectedPersonnel, setSelectedPersonnel] = useState<PersonnelRecord | null>(null);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    DEFAULT_VISIBLE_NAMES.forEach((name) => {
      initial[name] = true;
      initial[toSnakeCase(name)] = true;
    });
    INITIAL_COLUMN_GROUPS.forEach((g) => {
      g.columns.forEach((c) => {
        if (c.defaultVisible || DEFAULT_VISIBLE_NAMES.has(c.name)) {
          initial[c.key] = true;
          initial[c.name] = true;
          initial[toSnakeCase(c.name)] = true;
        }
      });
    });
    return initial;
  });

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    grup1: true,
    grup2: true,
    grup3: true,
    grup4: true,
    grup5: true,
    grup6: true,
    grup7: true,
  });

  // Export loading state
  const [isExporting, setIsExporting] = useState(false);

  // Fetch full columns metadata from backend
  useEffect(() => {
    fetch('/api/columns')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success && resData.grouped) {
          const loadedGroups: ColumnGroupDef[] = Object.entries(resData.grouped).map(
            ([groupName, cols]: [string, any], idx) => ({
              id: `api_grup_${idx + 1}`,
              name: groupName,
              columns: cols.map((c: any) => {
                let cleanColName = c.name;
                if (cleanColName === 'RHI ID') cleanColName = 'Şirket ID';
                else if (cleanColName === 'RHI Görevi') cleanColName = 'Ek Görev';
                else if (cleanColName.includes('RHI')) cleanColName = cleanColName.replace(/RHI/g, 'Şirket');

                return {
                  key: c.key || c.name,
                  name: cleanColName,
                  defaultVisible: DEFAULT_VISIBLE_NAMES.has(cleanColName) || DEFAULT_VISIBLE_NAMES.has(c.name),
                };
              }),
            })
          );
          if (loadedGroups.length > 0) {
            setColumnGroups(loadedGroups);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Update filter presets if user RLS changes
  useEffect(() => {
    if (user?.scope_type === 'region') {
      setFilterRegion(user.scope_value);
    } else if (user?.scope_type === 'project') {
      setFilterProject(user.scope_value);
    } else {
      setFilterRegion('all');
      setFilterProject('all');
    }
  }, [user]);

  // Apply initial filter if passed from Overview Page (Cross-page filtering)
  useEffect(() => {
    if (initialFilter && initialFilter.value) {
      if (initialFilter.type === 'region' && user?.scope_type !== 'region') {
        setFilterRegion(initialFilter.value);
      } else if (initialFilter.type === 'project' && user?.scope_type !== 'project') {
        setFilterProject(initialFilter.value);
      } else if (initialFilter.type === 'department') {
        setFilterDepartment(initialFilter.value);
      } else if (initialFilter.type === 'category') {
        setFilterCategory(initialFilter.value);
      } else if (initialFilter.type === 'nationality') {
        const natMap: Record<string, string> = {
          OZBEKISTAN: 'Özbekistan',
          HINDISTAN: 'Hindistan',
          AZERBAYCAN: 'Azerbaycan',
          RUSYA: 'Rusya',
          TURKMENISTAN: 'Türkmenistan',
          TURKIYE: 'Türkiye',
          TACIKISTAN: 'Tacikistan',
          BANGLADES: 'Bangladeş',
          KIRGIZISTAN: 'Kırgızistan',
          KAZAKISTAN: 'Kazakistan',
          MOLDOVA: 'Moldova',
          BELARUS: 'Belarus',
        };
        const val = natMap[initialFilter.value.toUpperCase()] || initialFilter.value;
        setFilterNationality(val);
      } else if (initialFilter.type === 'status') {
        setFilterStatus(initialFilter.value);
      } else if (initialFilter.type === 'collar') {
        const val = initialFilter.value.includes('Endirekt') ? 'Endirekt' : 'Direkt';
        setFilterCollar(val);
      } else if (initialFilter.type === 'search') {
        setSearch(initialFilter.value);
      }
      setPage(1);
      if (onClearInitialFilter) {
        onClearInitialFilter();
      }
    }
  }, [initialFilter, user, onClearInitialFilter]);

  // Fetch filter dropdown options once
  useEffect(() => {
    fetch('/api/filters')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setFilterOptions({
            regions: resData.regions || [],
            projects: resData.projects || [],
            departments: resData.departments || [],
            categories: resData.categories || [],
            nationalities: resData.nationalities || [],
            statuses: resData.statuses || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch personnel data with RLS parameters
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(pageSize));
    params.set('status', filterStatus);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('includeDetails', 'true');

    // RLS Scope Params
    if (user) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }

    if (search.trim()) params.set('search', search.trim());
    if (filterRegion !== 'all') params.set('region', filterRegion);
    if (filterProject !== 'all') params.set('project', filterProject);
    if (filterDepartment !== 'all') params.set('department', filterDepartment);
    if (filterCategory !== 'all') params.set('category', filterCategory);
    if (filterNationality !== 'all') params.set('nationality', filterNationality);
    if (filterCollar !== 'all') params.set('collar', filterCollar);

    fetch(`/api/personnel?${params.toString()}`)
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          setData(resData.data || []);
          setTotalRows(resData.pagination?.totalRows || 0);
          setTotalPages(resData.pagination?.totalPages || 1);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [
    page,
    pageSize,
    search,
    filterRegion,
    filterProject,
    filterDepartment,
    filterCategory,
    filterNationality,
    filterStatus,
    filterCollar,
    sortBy,
    sortOrder,
    user,
  ]);

  // Toggle single column
  // Toggle single column
  const toggleColumn = (key: string, name?: string) => {
    const isCurrentlyVisible = !!visibleColumns[key] || (name ? !!visibleColumns[name] : false);
    setVisibleColumns((prev) => {
      const next = { ...prev };
      next[key] = !isCurrentlyVisible;
      if (name) next[name] = !isCurrentlyVisible;
      return next;
    });
  };

  // Toggle entire group
  const toggleGroup = (groupId: string) => {
    const group = columnGroups.find((g) => g.id === groupId);
    if (!group) return;

    // Check if all in group are currently selected
    const allSelected = group.columns.every((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]);

    setVisibleColumns((prev) => {
      const next = { ...prev };
      group.columns.forEach((c) => {
        next[c.key] = !allSelected;
        next[c.name] = !allSelected;
      });
      return next;
    });
  };

  // Select all columns in the entire system
  const handleSelectAllColumns = () => {
    const allTrue: Record<string, boolean> = {};
    columnGroups.forEach((g) => {
      g.columns.forEach((c) => {
        allTrue[c.key] = true;
        allTrue[c.name] = true;
      });
    });
    setVisibleColumns(allTrue);
  };

  // Reset to default 10 columns
  const handleResetDefaultColumns = () => {
    const defaults: Record<string, boolean> = {};
    DEFAULT_VISIBLE_NAMES.forEach((name) => {
      defaults[name] = true;
      defaults[toSnakeCase(name)] = true;
    });
    columnGroups.forEach((g) => {
      g.columns.forEach((c) => {
        const isDef = !!c.defaultVisible || DEFAULT_VISIBLE_NAMES.has(c.name);
        defaults[c.key] = isDef;
        defaults[c.name] = isDef;
      });
    });
    setVisibleColumns(defaults);
  };

  // Clear all columns
  const handleClearAllColumns = () => {
    setVisibleColumns({});
  };

  // Toggle group accordion in picker
  const toggleExpandGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Sorting handler
  const handleSort = (key: string, name?: string) => {
    const sortField = toSnakeCase(name || key);
    if (sortBy === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(sortField);
      setSortOrder('asc');
    }
  };

  // Flattened columns array
  const allColumnsFlat = useMemo(() => columnGroups.flatMap((g) => g.columns), [columnGroups]);

  // Filtered visible column objects
  const visibleColumnDefs = useMemo(() => {
    return allColumnsFlat.filter((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]);
  }, [allColumnsFlat, visibleColumns]);

  // Active column count
  const activeColumnCount = visibleColumnDefs.length;
  const totalColumnCount = allColumnsFlat.length;

  // Filtered groups according to search input inside column picker
  const filteredColumnGroups = useMemo(() => {
    if (!columnSearch.trim()) return columnGroups;
    const term = columnSearch.trim().toLowerCase();
    return columnGroups
      .map((g) => {
        const matchesGroup = g.name.toLowerCase().includes(term);
        const filteredCols = g.columns.filter(
          (c) => c.name.toLowerCase().includes(term) || c.key.toLowerCase().includes(term)
        );
        if (matchesGroup) return g;
        if (filteredCols.length > 0) return { ...g, columns: filteredCols };
        return null;
      })
      .filter(Boolean) as ColumnGroupDef[];
  }, [columnGroups, columnSearch]);

  // Cell value retriever checking typed keys + raw JSON 198 keys with date formatting
  const getCellValue = (item: any, col: ColumnItem): string => {
    const k = col.key;
    const n = col.name;
    const s = toSnakeCase(n);

    let rawVal: any = undefined;

    // 1. Direct item property
    if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') rawVal = item[k];
    else if (item[n] !== undefined && item[n] !== null && String(item[n]).trim() !== '') rawVal = item[n];
    else if (item[s] !== undefined && item[s] !== null && String(item[s]).trim() !== '') rawVal = item[s];
    // 2. Raw JSON match from SQLite all_data_json
    else if (item.raw) {
      if (item.raw[n] !== undefined && item.raw[n] !== null && String(item.raw[n]).trim() !== '') rawVal = item.raw[n];
      else if (item.raw[k] !== undefined && item.raw[k] !== null && String(item.raw[k]).trim() !== '') rawVal = item.raw[k];
      else if (item.raw[s] !== undefined && item.raw[s] !== null && String(item.raw[s]).trim() !== '') rawVal = item.raw[s];
    }

    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') return '-';

    // Format Excel serial dates (e.g. 46296 -> 01.10.2026, 46272 -> 07.09.2026)
    const num = Number(rawVal);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      return `${day}.${month}.${year}`;
    }

    const str = String(rawVal).trim();
    // Format ISO date string YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parts = str.slice(0, 10).split('-');
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    return str;
  };

  // Export complete filtered dataset to real Excel (.xlsx) file
  const handleExportExcel = () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const params = new URLSearchParams();
      params.set('status', filterStatus);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      if (user) {
        params.set('userScopeType', user.scope_type);
        params.set('userScopeValue', user.scope_value);
      }

      if (search.trim()) params.set('search', search.trim());
      if (filterRegion !== 'all') params.set('region', filterRegion);
      if (filterProject !== 'all') params.set('project', filterProject);
      if (filterDepartment !== 'all') params.set('department', filterDepartment);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterNationality !== 'all') params.set('nationality', filterNationality);
      if (filterCollar !== 'all') params.set('collar', filterCollar);

      // Pass currently visible column keys so the exported Excel matches the user's active table configuration
      const selectedColKeys = visibleColumnDefs.map((c) => c.name || c.key).filter(Boolean);
      if (selectedColKeys.length > 0) {
        params.set('columns', selectedColKeys.join(','));
      }

      const downloadUrl = `/api/export?${params.toString()}`;
      const fileName = `Pondera_Personel_Listesi_${new Date().toISOString().slice(0, 10)}.xlsx`;

      // Trigger native download immediately within user gesture token
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.setAttribute('download', fileName);
      document.body.appendChild(anchor);
      anchor.click();

      setTimeout(() => {
        if (document.body.contains(anchor)) {
          document.body.removeChild(anchor);
        }
        setIsExporting(false);
      }, 1500);
    } catch {
      // Fallback to client-side sheetjs with active data if server download fails
      try {
        if (data && data.length > 0) {
          const rows = data.map((item) => {
            const rowObj: Record<string, any> = {};
            visibleColumnDefs.forEach((c) => {
              rowObj[c.name] = getCellValue(item, c);
            });
            return rowObj;
          });
          const worksheet = XLSX.utils.json_to_sheet(rows);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Personel Listesi');
          XLSX.writeFile(workbook, `Pondera_Personel_Listesi_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }
      } catch {}
      setIsExporting(false);
    }
  };

  // Reset all filters
  const resetAllFilters = () => {
    setSearch('');
    if (user?.scope_type !== 'region') setFilterRegion('all');
    if (user?.scope_type !== 'project') setFilterProject('all');
    setFilterDepartment('all');
    setFilterCategory('all');
    setFilterNationality('all');
    setFilterStatus('Mevcut');
    setFilterCollar('all');
    setPage(1);
    if (onClearInitialFilter) onClearInitialFilter();
  };

  return (
    <div className="p-3 sm:p-5 lg:p-7 space-y-4 sm:space-y-5 max-w-full overflow-hidden">
      {/* TOP ACTION BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#131C31] p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t('table_title')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold">
              {totalRows.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {t('table_records_count')}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('table_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Column Picker Trigger Button */}
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
              showColumnPicker
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{t('table_column_picker_btn')} ({activeColumnCount}/{totalColumnCount})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showColumnPicker ? 'rotate-180' : ''}`} />
          </button>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-75 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('table_preparing_excel')}</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>{t('table_download_excel')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* QUICK DOCUMENT GROUPS PILL BAR - EXPANDABLE OR COMPACT */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-3 space-y-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {t('table_groups_title')}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              {t('table_groups_subtitle')}
            </span>
          </div>

          <button
            onClick={() => setIsGroupBarExpanded(!isGroupBarExpanded)}
            className="text-[11px] font-bold text-teal-700 dark:text-teal-300 hover:text-teal-800 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 cursor-pointer transition-colors"
            title={isGroupBarExpanded ? (lang === 'ru' ? 'Свернуть в строку' : 'Yatay tek satıra dönüştür') : (lang === 'ru' ? 'Развернуть все группы' : 'Tüm grupları ekrana aç')}
          >
            <span>{isGroupBarExpanded ? t('table_compact_groups') : t('table_expand_groups')}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isGroupBarExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className={isGroupBarExpanded ? 'flex flex-wrap gap-1.5' : 'flex items-center gap-1.5 overflow-x-auto pb-1'}>
          {columnGroups.map((group) => {
            const allSelected = group.columns.every((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]);
            const someSelected = group.columns.some((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]);

            return (
              <button
                key={group.id}
                onClick={() => toggleGroup(group.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  allSelected
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : someSelected
                    ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title={`${translateGroup(group.name)} (${group.columns.length} ${lang === 'ru' ? 'колонок' : 'Kolon'})`}
              >
                {allSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-white" />
                ) : someSelected ? (
                  <MinusSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{translateGroup(group.name)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* HIERARCHICAL COLUMN PICKER MODAL / DROPDOWN */}
      {showColumnPicker && (
        <div className="p-4 sm:p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-teal-200 dark:border-slate-700 shadow-2xl space-y-4 animate-in fade-in duration-200">
          {/* Picker Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t('table_picker_drawer_title')}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold text-xs">
                  {activeColumnCount} / {totalColumnCount} {lang === 'ru' ? 'активно' : 'Aktif'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                {lang === 'ru' ? 'Отметьте группу галочкой, чтобы добавить все колонки группы в таблицу' : 'Grup başlığındaki kutucuğu işaretleyerek gruptaki tüm evrakları tek seferde tabloya ekleyin'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleSelectAllColumns}
                className="px-2.5 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 rounded-lg transition-colors cursor-pointer"
              >
                {t('table_select_all')}
              </button>
              <button
                onClick={handleResetDefaultColumns}
                className="px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                {t('table_reset_default')} (10)
              </button>
              <button
                onClick={handleClearAllColumns}
                className="px-2.5 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors cursor-pointer"
              >
                {t('table_clear_all')}
              </button>
              <button
                onClick={() => setShowColumnPicker(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Column Search Filter */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              placeholder={t('table_picker_search_ph')}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Groups Checklist Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto p-1 divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800">
            {filteredColumnGroups.map((group) => {
              const allSelected = group.columns.every((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]);
              const someSelected = group.columns.some((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]);
              const selectedCount = group.columns.filter((c) => !!visibleColumns[c.key] || !!visibleColumns[c.name]).length;
              const isExpanded = expandedGroups[group.id] !== false;

              return (
                <div
                  key={group.id}
                  className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2 flex flex-col justify-between"
                >
                  {/* Group Header with Master Checkbox */}
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/80 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none font-bold text-xs text-slate-900 dark:text-white">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleGroup(group.id)}
                        className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="truncate max-w-[170px]" title={translateGroup(group.name)}>
                        {translateGroup(group.name)}
                      </span>
                    </label>

                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          selectedCount > 0
                            ? 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {selectedCount}/{group.columns.length}
                      </span>
                      <button
                        onClick={() => toggleExpandGroup(group.id)}
                        className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Columns List */}
                  {isExpanded && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {group.columns.map((col) => {
                        const isChecked = !!visibleColumns[col.key] || !!visibleColumns[col.name];
                        return (
                          <label
                            key={col.key}
                            className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                              isChecked
                                ? 'bg-teal-50 dark:bg-teal-950/60 text-slate-900 dark:text-white font-semibold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleColumn(col.key, col.name)}
                              className="rounded border-slate-300 dark:border-slate-600 text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                            />
                            <span className="truncate" title={translateCol(col.name)}>
                              {translateCol(col.name)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTER CONTROLS & SEARCH BAR */}
      <div className="p-3.5 sm:p-4 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {/* Search */}
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('search_placeholder')}
              className="w-full pl-9 pr-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Region Filter */}
          <div>
            <select
              value={filterRegion}
              disabled={user?.scope_type === 'region'}
              onChange={(e) => {
                setFilterRegion(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">{t('filter_all_regions')}</option>
              {filterOptions.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <select
              value={filterProject}
              disabled={user?.scope_type === 'project'}
              onChange={(e) => {
                setFilterProject(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">{t('filter_all_projects')}</option>
              {filterOptions.projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={filterDepartment}
              onChange={(e) => {
                setFilterDepartment(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">{t('filter_all_departments')}</option>
              {filterOptions.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Nationality Filter */}
          <div>
            <select
              value={filterNationality}
              onChange={(e) => {
                setFilterNationality(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">{t('filter_all_nationalities')}</option>
              {filterOptions.nationalities.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className={`w-full px-2.5 py-1.5 sm:py-2 border rounded-xl text-xs font-semibold focus:outline-none ${
                filterStatus === 'Mevcut'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <option value="all">{lang === 'ru' ? 'Все статусы' : 'Tüm Durumlar'}</option>
              <option value="Mevcut">{lang === 'ru' ? 'Только в штате (Активные)' : 'Yalnızca Mevcut (Aktif)'}</option>
              <option value="Cikis">{lang === 'ru' ? 'Только уволенные' : 'Yalnızca Çıkış'}</option>
              <option value="Sevki Iptal">{lang === 'ru' ? 'Отмена отправки' : 'Sevki İptal'}</option>
              <option value="Sevke Hazır">{lang === 'ru' ? 'Готов к отправке' : 'Sevke Hazır'}</option>
            </select>
          </div>
        </div>

        {/* Filter stats bar */}
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span>
            {t('table_total_prefix')}{' '}
            <span className="font-extrabold text-slate-900 dark:text-white">
              {totalRows.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')}
            </span>{' '}
            {t('table_total_listed')}
          </span>
          <button
            onClick={resetAllFilters}
            className="text-rose-600 dark:text-rose-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>{t('filter_clear_all')}</span>
          </button>
        </div>
      </div>

      {/* ADVANCED DATA GRID (TABLE) */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div ref={tableContainerRef} onScroll={handleTableScroll} className="overflow-x-auto relative min-h-[400px]">
          {loading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xs z-20 flex flex-col items-center justify-center">
              <div className="w-9 h-9 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t('table_loading')}</p>
            </div>
          )}

          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 text-[11px]">
              <tr>
                {visibleColumnDefs.map((col) => {
                  const sortField = toSnakeCase(col.name || col.key);
                  const isSorted = sortBy === sortField || sortBy === col.key;

                  const isDate =
                    col.name.toLowerCase().includes('tarih') ||
                    col.key.toLowerCase().includes('tarih') ||
                    col.name.toLowerCase().includes('gecerlilik');
                  const isAdSoyad = col.key === 'ad_soyad' || col.name === 'Ad Soyad';
                  const isDepartman = col.key === 'departman' || col.name === 'Departman';
                  const isGorev = col.key === 'gorevi' || col.name === 'Görevi';
                  const isProje = col.key === 'proje_adi' || col.name === 'Proje Adı';

                  const widthClass = isDate
                    ? 'min-w-[125px] whitespace-nowrap'
                    : isAdSoyad
                    ? 'min-w-[170px]'
                    : isDepartman
                    ? 'min-w-[160px]'
                    : isProje
                    ? 'min-w-[140px]'
                    : isGorev
                    ? 'min-w-[150px]'
                    : 'min-w-[100px]';

                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key, col.name)}
                      className={`py-1.5 px-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors select-none text-slate-800 dark:text-slate-100 font-bold uppercase tracking-wider ${widthClass}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{translateCol(col.name)}</span>
                        <ArrowUpDown
                          className={`w-3.5 h-3.5 ${
                            isSorted ? 'text-teal-600 dark:text-teal-400 stroke-[2.5]' : 'text-slate-400 dark:text-slate-600'
                          }`}
                        />
                      </div>
                    </th>
                  );
                })}
                <th className="py-1.5 px-2.5 text-center min-w-[60px]">{t('table_action_col')}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-800 dark:text-slate-200 text-xs">
              {data.length === 0 && !loading ? (
                <tr>
                  <td colSpan={visibleColumnDefs.length + 1} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    {t('table_no_data')}
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedPersonnel(item)}
                    className="hover:bg-teal-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group h-7.5 border-b border-slate-100 dark:border-slate-800/60"
                  >
                    {visibleColumnDefs.map((col) => {
                      const val = getCellValue(item, col);
                      const isStatusCol =
                        col.key === 'genel_durum' ||
                        col.key === 'guncel_durum' ||
                        col.name === 'Genel Durumu' ||
                        col.name === 'Güncel Durumu';
                      const isNameCol = col.key === 'ad_soyad' || col.name === 'Ad Soyad';
                      const isIdCol =
                        col.key === 'sicil_no' ||
                        col.key === 'rhi_id' ||
                        col.name === 'Sicil No' ||
                        col.name === 'Şirket ID';
                      const isDateCol =
                        col.name.toLowerCase().includes('tarih') ||
                        col.key.toLowerCase().includes('tarih') ||
                        col.name.toLowerCase().includes('gecerlilik');

                      if (isStatusCol) {
                        return (
                          <td key={col.key} className="py-1 px-2.5">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                val === 'Mevcut'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : val === 'Cikis'
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {translateVal(val) || '-'}
                            </span>
                          </td>
                        );
                      }

                      if (isNameCol) {
                        return (
                          <td key={col.key} className="py-1 px-2.5">
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {val || '-'}
                            </span>
                          </td>
                        );
                      }

                      if (isIdCol) {
                        return (
                          <td key={col.key} className="py-1 px-2.5 font-bold font-mono text-slate-900 dark:text-slate-100">
                            {val || '-'}
                          </td>
                        );
                      }

                      if (isDateCol) {
                        return (
                          <td key={col.key} className="py-1 px-2.5 font-mono font-semibold text-slate-800 dark:text-slate-100">
                            {val || '-'}
                          </td>
                        );
                      }

                      return (
                        <td key={col.key} className="py-1 px-2.5 text-slate-800 dark:text-slate-200 font-medium">
                          {val}
                        </td>
                      );
                    })}

                    <td className="py-1 px-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedPersonnel(item)}
                        className="p-1 rounded text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Personel Kartı Detayını Aç"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* HORIZONTAL TABLE SLIDER / NAVIGATOR */}
        <div className="p-3 bg-slate-50/80 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollStep(-350)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-2xs cursor-pointer"
              title={lang === 'ru' ? 'Прокрутить влево' : 'Tabloyu Sola Kaydır'}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Влево' : 'Sola Kaydır'}</span>
            </button>
            <button
              onClick={() => scrollStep(350)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors shadow-2xs cursor-pointer"
              title={lang === 'ru' ? 'Прокрутить вправо' : 'Tabloyu Sağa Kaydır'}
            >
              <span>{lang === 'ru' ? 'Вправо' : 'Sağa Kaydır'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 max-w-md w-full flex items-center gap-3">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
              {lang === 'ru' ? 'Прокрутка таблицы:' : 'Yatay Kaydırıcı:'}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={scrollPercent}
              onChange={handleSliderChange}
              className="w-full accent-teal-600 dark:accent-teal-400 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
              title={lang === 'ru' ? 'Навигация по колонкам' : 'Tablo Sütunları Arasında Gezinin'}
            />
            <span className="text-[11px] font-mono font-bold text-teal-600 dark:text-teal-400 w-10 text-right shrink-0">
              %{scrollPercent}
            </span>
          </div>

          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-slate-200">{visibleColumnDefs.length}</span> {lang === 'ru' ? 'колонок активно' : 'kolon aktif'}
          </div>
        </div>

        {/* PAGINATION */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>{lang === 'ru' ? 'На странице:' : 'Sayfa başı:'}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              {totalRows > 0 ? (page - 1) * pageSize + 1 : 0} -{' '}
              {Math.min(page * pageSize, totalRows)} / {totalRows.toLocaleString('tr-TR')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-bold text-slate-800 dark:text-white">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* PERSONNEL DETAIL DRAWER */}
      <PersonnelDetailDrawer
        personnel={selectedPersonnel}
        onClose={() => setSelectedPersonnel(null)}
      />
    </div>
  );
}
