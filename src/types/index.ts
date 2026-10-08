export interface PersonnelRecord {
  id: number;
  sira_no: number;
  sicil_no: string;
  rhi_id: string;
  saren_no: string;
  genel_durum: string;
  guncel_durum: string;
  region: string;
  proje_adi: string;
  calisma_lokasyon: string;
  kategori: string;
  firma: string;
  departman: string;
  uyruk: string;
  adi: string;
  soyadi: string;
  baba_adi: string;
  ad_soyad: string;
  tam_adi_kiril: string;
  gorevi: string;
  rhi_gorevi: string;
  sorumlu_kisi: string;
  grup_sefi: string;
  endirekt_direkt: string;
  ise_giris_tarihi: string;
  santiye_giris_tarihi: string;
  cikis_tarihi: string;
  cikis_sebebi: string;
  gunduz_gece: string;
  propusk_no: string;
  propusk_bitis_tarihi: string;
  cinsiyet: string;
  dogum_tarihi: string;
  pasaport_no: string;
  pasaport_gecerlilik: string;
  tc_kimlik_no: string;
  dogum_yeri: string;
  migrasyon_no: string;
  inn_no: string;
  vize_no: string;
  vize_bitis_tarihi: string;
  patent_alis_tarihi: string;
  patent_bitis_tarihi: string;
  telefon_no: string;
  email: string;
  kamp_no: string;
  oda_no: string;
  raw?: Record<string, any>;
}

export interface TreeDepartment {
  name: string;
  count: number;
}

export interface TreeProject {
  name: string;
  count: number;
  departments: TreeDepartment[];
}

export interface TreeRegion {
  name: string;
  count: number;
  projects: TreeProject[];
}

export interface PowerBIMetrics {
  avgAge: number;
  avgTenure: number;
  mainFirmCount: number;
  subconCount: number;
  topFirms: { name: string; count: number }[];
  tenureBrackets: { label: string; count: number }[];
  titlePyramid: { title: string; count: number }[];
  decompositionTree: TreeRegion[];
  turnoverRate?: number;
  annualExits?: number;
}

export interface StatsData {
  totalCount: number;
  collarDistribution: { label: string; count: number }[];
  categoryDistribution: { label: string; count: number }[];
  regionDistribution: { label: string; count: number }[];
  nationalityDistribution: { label: string; count: number }[];
  departmentDistribution: { label: string; count: number }[];
  projectDistribution: { label: string; count: number }[];
  genderDistribution: { label: string; count: number }[];
  monthlyEntries: { month: string; in_count: number }[];
  monthlyExits: { month: string; out_count: number }[];
  systemInfo: Record<string, string>;
  powerbi?: PowerBIMetrics;
}

export interface FilterOptions {
  regions: string[];
  projects: string[];
  departments: string[];
  categories: string[];
  nationalities: string[];
  statuses: string[];
}

export interface ColumnMeta {
  index: number;
  name: string;
  key: string;
  group: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  scope_type: 'all' | 'region' | 'project';
  scope_value: string;
  created_at: string;
}
