'use client';

import React, { useState } from 'react';
import {
  Users,
  Briefcase,
  Globe2,
  Building,
  TrendingUp,
  Filter,
  X,
  ChevronRight,
  ArrowUpRight,
  ShieldCheck,
  MapPin,
  Layers,
  Sparkles,
  LayoutGrid,
  BarChart3,
  FileSpreadsheet,
} from 'lucide-react';
import { StatsData } from '@/types';
import DrillDownModal from './DrillDownModal';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import PowerBIHeroBar from './PowerBIHeroBar';
import PowerBIDecompositionTree from './PowerBIDecompositionTree';
import PowerBIWorkPermits from './PowerBIWorkPermits';
import PowerBITitlePyramid from './PowerBITitlePyramid';
import PowerBIAgeDemographics from './PowerBIAgeDemographics';
import PowerBIDualDonuts from './PowerBIDualDonuts';
import PowerBIRankedRegionBars from './PowerBIRankedRegionBars';
import PowerBITenureAndFirms from './PowerBITenureAndFirms';

interface OverviewViewProps {
  stats: StatsData | null;
  loading: boolean;
  selectedRegion: string;
  setSelectedRegion: (region: string) => void;
  selectedProject: string;
  setSelectedProject: (project: string) => void;
  selectedDepartment: string;
  setSelectedDepartment: (dept: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  selectedNationality: string;
  setSelectedNationality: (nat: string) => void;
  selectedCollar: string;
  setSelectedCollar: (collar: string) => void;
  selectedTitle: string;
  setSelectedTitle: (title: string) => void;
  firmFilter: 'all' | 'main' | 'subcon';
  setFirmFilter: (filter: 'all' | 'main' | 'subcon') => void;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
  onResetFilters: () => void;
}

export default function OverviewView({
  stats,
  loading,
  selectedRegion,
  setSelectedRegion,
  selectedProject,
  setSelectedProject,
  selectedDepartment,
  setSelectedDepartment,
  selectedCategory,
  setSelectedCategory,
  selectedNationality,
  setSelectedNationality,
  selectedCollar,
  setSelectedCollar,
  selectedTitle,
  setSelectedTitle,
  firmFilter,
  setFirmFilter,
  onNavigateToPersonnel,
  onResetFilters,
}: OverviewViewProps) {
  const { user } = useAuth();
  const { lang, t, translateVal } = useLanguage();
  const [drillModal, setDrillModal] = useState<{
    isOpen: boolean;
    title: string;
    filterType: 'region' | 'project' | 'department' | 'category' | 'nationality' | 'collar' | 'permit';
    filterValue: string;
  }>({
    isOpen: false,
    title: '',
    filterType: 'region',
    filterValue: '',
  });

  if (loading && !stats) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {lang === 'ru' ? 'Загрузка аналитики Pondera HR Power BI...' : 'Pondera HR Power BI Analitikleri Yükleniyor...'}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          {lang === 'ru' ? 'Подготовка записей персонала и дерева декомпозиции' : '32.348 personel kaydı ve kırılım ağacı hazırlanıyor'}
        </p>
      </div>
    );
  }

  const total = stats?.totalCount || 0;
  const pbi = stats?.powerbi;

  // Gender counts
  const maleCount = stats?.genderDistribution.find((g) => g.label === 'Erkek')?.count ?? 0;
  const femaleCount = stats?.genderDistribution.find((g) => g.label === 'Kadin')?.count ?? 0;

  const hasActiveFilters =
    selectedRegion !== 'all' ||
    selectedProject !== 'all' ||
    selectedDepartment !== 'all' ||
    selectedCategory !== 'all' ||
    selectedNationality !== 'all' ||
    selectedCollar !== 'all' ||
    selectedTitle !== 'all' ||
    firmFilter !== 'all';

  const openActiveFiltersDetail = () => {
    let fType: 'region' | 'project' | 'department' | 'category' | 'nationality' | 'collar' = 'region';
    let fVal = 'all';

    if (selectedRegion !== 'all') {
      fType = 'region';
      fVal = selectedRegion;
    } else if (selectedProject !== 'all') {
      fType = 'project';
      fVal = selectedProject;
    } else if (selectedDepartment !== 'all') {
      fType = 'department';
      fVal = selectedDepartment;
    } else if (selectedCategory !== 'all') {
      fType = 'category';
      fVal = selectedCategory;
    } else if (selectedNationality !== 'all') {
      fType = 'nationality';
      fVal = selectedNationality;
    } else if (selectedCollar !== 'all') {
      fType = 'collar';
      fVal = selectedCollar;
    }

    setDrillModal({
      isOpen: true,
      title: 'Filtrelenmiş Personel Listesi',
      filterType: fType,
      filterValue: fVal,
    });
  };

  return (
    <div className="p-3 sm:p-5 lg:p-7 space-y-4 sm:space-y-6 max-w-full overflow-hidden relative">
      {/* Subtle Background Glow Texture - Only in dark mode */}
      <div
        className="fixed inset-0 pointer-events-none dark:opacity-30 opacity-0 bg-cover bg-center -z-10"
        style={{ backgroundImage: `url('/images/dashboard_bg.jpg')` }}
      />

      {/* RLS Active Notification Banner */}
      {user && user.scope_type !== 'all' && (
        <div className="p-3.5 bg-emerald-50 dark:bg-gradient-to-r dark:from-[#121E36] dark:to-[#122A42] border border-emerald-200 dark:border-teal-500/40 rounded-2xl flex items-center justify-between text-xs text-slate-800 dark:text-white shadow-sm dark:shadow-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500 text-slate-950 font-bold flex items-center justify-center shrink-0">
              {user.scope_type === 'region' ? <MapPin className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
            </div>
            <div>
              <span className="font-bold text-teal-700 dark:text-teal-300">
                {lang === 'ru' ? 'Row-Level Security (RLS) Активна: ' : 'Row-Level Security (RLS) Devrede: '}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {lang === 'ru'
                  ? `В этом отчете анализируются только авторизованные данные по ${user.scope_type === 'region' ? 'региону' : 'проекту'} ${user.scope_value}.`
                  : `Bu raporda yalnızca yetkili olduğunuz ${user.scope_value} (${user.scope_type === 'region' ? 'Bölgesi' : 'Projesi'}) verileri analiz edilmektedir.`}
              </span>
            </div>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-teal-500/20 text-emerald-800 dark:text-teal-300 font-bold text-[10px] border border-emerald-200 dark:border-teal-500/30">
            {lang === 'ru' ? 'Безопасный фильтр' : 'Güvenli Filtre'}
          </span>
        </div>
      )}

      {/* Active Cross-Filtering Bar */}
      {hasActiveFilters && (
        <div className="p-3.5 bg-white dark:bg-[#131F38]/95 border border-slate-200 dark:border-teal-500/40 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-slate-800 dark:text-white shadow-sm dark:shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-teal-600 dark:text-teal-300">
              <Filter className="w-4 h-4 text-teal-500" />
              <span>{lang === 'ru' ? 'Активные фильтры:' : 'Aktif Filtreler:'}</span>
            </div>

            {selectedRegion !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 dark:bg-teal-950/80 text-teal-800 dark:text-teal-200 font-semibold rounded-lg border border-teal-200 dark:border-teal-500/50 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Регион: ' : 'Bölge: '}
                {selectedRegion}
                <button onClick={() => setSelectedRegion('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {selectedProject !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-50 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-200 font-semibold rounded-lg border border-cyan-200 dark:border-cyan-500/50 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Проект: ' : 'Proje: '}
                {selectedProject}
                <button onClick={() => setSelectedProject('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {selectedDepartment !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 font-semibold rounded-lg border border-emerald-200 dark:border-emerald-500/50 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Отдел: ' : 'Departman: '}
                {selectedDepartment}
                <button onClick={() => setSelectedDepartment('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {selectedCategory !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-300 font-semibold rounded-lg border border-teal-200 dark:border-teal-500/40 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Статус: ' : 'Statü: '}
                {translateVal(selectedCategory)}
                <button onClick={() => setSelectedCategory('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {selectedNationality !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 font-semibold rounded-lg border border-cyan-200 dark:border-cyan-500/40 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Гражданство: ' : 'Uyruk: '}
                {translateVal(selectedNationality)}
                <button onClick={() => setSelectedNationality('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {selectedCollar !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-amber-300 font-semibold rounded-lg border border-amber-500/40 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Категория: ' : 'Yaka: '}
                {translateVal(selectedCollar)}
                <button onClick={() => setSelectedCollar('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {selectedTitle !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 text-teal-300 font-semibold rounded-lg border border-teal-500/40 text-[11px] shadow-sm">
                {lang === 'ru' ? 'Должность: ' : 'Ünvan: '}
                {selectedTitle}
                <button onClick={() => setSelectedTitle('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}

            {firmFilter !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 font-semibold rounded-lg border border-amber-200 dark:border-amber-500/50 text-[11px] shadow-sm">
                {lang === 'ru'
                  ? `Компания: ${firmFilter === 'main' ? 'Основной штат Pondera' : 'Субподрядчики'}`
                  : `Firma: ${firmFilter === 'main' ? 'Pondera Ana Kadro' : 'Taşeronlar'}`}
                <button onClick={() => setFirmFilter('all')} className="hover:text-rose-400 ml-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>

          {/* DEDICATED ACTION BUTTONS: VIEW DETAIL BUTTON & RESET */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={openActiveFiltersDetail}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg hover:shadow-teal-500/25 transition-all cursor-pointer"
              title={lang === 'ru' ? 'Открыть отфильтрованный список персонала' : 'Filtrelenmiş Personel Listesini Aç'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {lang === 'ru'
                  ? `Подробный список персонала (${total.toLocaleString('ru-RU')} чел.)`
                  : `Detay Personel Listesini Gör (${total.toLocaleString('tr-TR')} Kişi)`}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onResetFilters}
              className="font-bold text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Очистить' : 'Temizle'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. POWER BI INSPIRED HERO & CONTROL BAR */}
      <PowerBIHeroBar
        totalCount={total}
        avgAge={pbi?.avgAge || 34.9}
        avgTenure={pbi?.avgTenure || 1.8}
        maleCount={maleCount}
        femaleCount={femaleCount}
        mainFirmCount={pbi?.mainFirmCount || 4888}
        subconCount={pbi?.subconCount || 475}
        dataFreshness={stats?.systemInfo?.data_freshness || '03.10.2026'}
        monthlyEntries={stats?.monthlyEntries || []}
        monthlyExits={stats?.monthlyExits || []}
        turnoverRate={pbi?.turnoverRate || 3.8}
        annualExits={pbi?.annualExits || 205}
        firmFilter={firmFilter}
        setFirmFilter={setFirmFilter}
        onRefresh={() => onResetFilters()}
        onOpenDetailList={openActiveFiltersDetail}
      />

      {/* 2. THREE SUMMARY CHARTS ROW: BEYAZ/MAVI YAKA, EXPAT/SNG/YEREL, CİNSİYET WC STANDARDI */}
      <PowerBIDualDonuts
        collarData={stats?.collarDistribution || []}
        categoryData={stats?.categoryDistribution || []}
        totalCount={total}
        maleCount={maleCount}
        femaleCount={femaleCount}
        selectedCollar={selectedCollar}
        selectedCategory={selectedCategory}
        onSelectSlice={(type, value) => {
          if (type === 'collar') {
            const collarVal = value.includes('Endirekt') ? 'Beyaz Yaka' : 'Mavi Yaka';
            setSelectedCollar(selectedCollar === collarVal ? 'all' : collarVal);
          } else if (type === 'category') {
            setSelectedCategory(selectedCategory === value ? 'all' : value);
          }
        }}
        onOpenDetail={(type, value) => {
          setDrillModal({
            isOpen: true,
            title:
              type === 'collar'
                ? lang === 'ru'
                  ? 'Детализация по категориям персонала'
                  : 'Yaka Dağılımı Detayı'
                : type === 'category'
                ? lang === 'ru'
                  ? 'Детализация по статусам персонала'
                  : 'Statü Dağılımı Detayı'
                : lang === 'ru'
                ? 'Детализация по полу персонала'
                : 'Cinsiyet Dağılımı Detayı',
            filterType: type === 'collar' ? 'collar' : type === 'category' ? 'category' : 'region',
            filterValue: value === 'all' && selectedRegion !== 'all' ? selectedRegion : value,
          });
        }}
      />

      {/* 3. RANKED REGION & NATIONALITY BAR CHARTS (WITH LABELS & PERCENTAGES ON BARS) */}
      <PowerBIRankedRegionBars
        regionData={stats?.regionDistribution || []}
        nationalityData={stats?.nationalityDistribution || []}
        totalCount={total}
        selectedRegion={selectedRegion}
        selectedNationality={selectedNationality}
        onSelectRegion={(reg) => {
          setSelectedRegion(selectedRegion === reg ? 'all' : reg);
        }}
        onSelectNationality={(nat) => {
          setSelectedNationality(selectedNationality === nat ? 'all' : nat);
        }}
        onOpenRegionDetail={(reg) => {
          setDrillModal({
            isOpen: true,
            title: lang === 'ru' ? 'Список персонала по региону' : 'Bölge Personel Listesi',
            filterType: 'region',
            filterValue: reg,
          });
        }}
        onOpenNationalityDetail={(nat) => {
          setDrillModal({
            isOpen: true,
            title: lang === 'ru' ? 'Список персонала по гражданству' : 'Uyruk Personel Listesi',
            filterType: 'nationality',
            filterValue: nat,
          });
        }}
      />

      {/* 4. DECOMPOSITION TREE (2/3) & RUSSIAN WORK PERMITS DONUT (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <PowerBIDecompositionTree
            treeData={pbi?.decompositionTree || []}
            totalCount={total}
            onSelectNode={(type, value) => {
              if (type === 'region') setSelectedRegion(selectedRegion === value ? 'all' : value);
              else if (type === 'project') setSelectedProject(selectedProject === value ? 'all' : value);
              else if (type === 'department') setSelectedDepartment(selectedDepartment === value ? 'all' : value);
            }}
            onOpenDetail={(type, value) => {
              setDrillModal({
                isOpen: true,
                title:
                  type === 'region'
                    ? lang === 'ru'
                      ? 'Список персонала по региону'
                      : 'Bölge Detay Listesi'
                    : type === 'project'
                    ? lang === 'ru'
                      ? 'Список персонала по проекту'
                      : 'Proje Detay Listesi'
                    : lang === 'ru'
                    ? 'Список персонала по отделу'
                    : 'Departman Detay Listesi',
                filterType: type,
                filterValue: value,
              });
            }}
          />
        </div>
        <div className="lg:col-span-1 flex flex-col">
          <PowerBIWorkPermits
            permits={stats?.workPermits || pbi?.workPermits || []}
            totalCount={total}
            onOpenDetail={(permitKey) => {
              const permitObj = permitKey ? (stats?.workPermits || pbi?.workPermits || []).find((p) => p.key === permitKey) : null;
              const label = permitObj ? (lang === 'ru' ? permitObj.nameRu : permitObj.name) : (lang === 'ru' ? 'Все статусы' : 'Tüm Statüler');
              setDrillModal({
                isOpen: true,
                title: `${lang === 'ru' ? 'Список персонала по статусу' : 'Çalışma İzni Listesi'}: ${label}`,
                filterType: 'permit',
                filterValue: permitKey || 'all',
              });
            }}
          />
        </div>
      </div>

      {/* 5. TITLE PYRAMID & DEMOGRAPHIC AGE PYRAMID (SIDE-BY-SIDE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <PowerBITitlePyramid
          pyramidData={pbi?.titlePyramid || []}
          totalCount={total}
          selectedTitle={selectedTitle}
          onSelectTitle={(title) => {
            const cleanTitle = title.replace(/^\d+\.\s*/, '');
            setSelectedTitle(selectedTitle === cleanTitle ? 'all' : cleanTitle);
          }}
          onOpenDetail={(title) => {
            setDrillModal({
              isOpen: true,
              title: lang === 'ru' ? 'Список персонала по уровню должности' : 'Ünvan Kademesi Personel Listesi',
              filterType: 'region',
              filterValue: selectedRegion !== 'all' ? selectedRegion : 'all',
            });
          }}
        />

        <PowerBIAgeDemographics
          ageBrackets={pbi?.ageBrackets || []}
          avgAge={pbi?.avgAge || 34.9}
          totalCount={total}
          onSelectAgeBracket={(label) => {
            setDrillModal({
              isOpen: true,
              title: `${lang === 'ru' ? 'Возрастная группа' : 'Yaş Dağılımı'}: ${label}`,
              filterType: 'region',
              filterValue: selectedRegion !== 'all' ? selectedRegion : 'all',
            });
          }}
          onOpenDetail={() => {
            setDrillModal({
              isOpen: true,
              title: lang === 'ru' ? 'Список персонала по возрастным группам' : 'Yaş Dağılımı Personel Listesi',
              filterType: 'region',
              filterValue: selectedRegion !== 'all' ? selectedRegion : 'all',
            });
          }}
        />
      </div>

      {/* 6. FIRMA / TAŞERON RANKINGS & TENURE BRACKETS */}
      <PowerBITenureAndFirms
        topFirms={pbi?.topFirms || []}
        tenureBrackets={pbi?.tenureBrackets || []}
        totalCount={total}
        onSelectFirm={(firm) => {
          setDrillModal({
            isOpen: true,
            title: `${lang === 'ru' ? 'Персонал компании' : 'Firma Personeli'}: ${firm}`,
            filterType: 'region',
            filterValue: selectedRegion !== 'all' ? selectedRegion : 'all',
          });
        }}
        onOpenFirmDetail={() => {
          setDrillModal({
            isOpen: true,
            title: lang === 'ru' ? 'Персонал компаний / подрядчиков' : 'Firma / Taşeron Personeli',
            filterType: 'region',
            filterValue: selectedRegion !== 'all' ? selectedRegion : 'all',
          });
        }}
        onOpenTenureDetail={() => {
          setDrillModal({
            isOpen: true,
            title: lang === 'ru' ? 'Персонал по стажу работы' : 'Kıdem Dağılımı Personeli',
            filterType: 'region',
            filterValue: selectedRegion !== 'all' ? selectedRegion : 'all',
          });
        }}
      />

      {/* Drill Down Modal */}
      <DrillDownModal
        isOpen={drillModal.isOpen}
        onClose={() => setDrillModal({ ...drillModal, isOpen: false })}
        title={drillModal.title}
        filterType={drillModal.filterType}
        filterValue={drillModal.filterValue}
        onNavigateToPersonnel={(fType, fVal) => {
          onNavigateToPersonnel(fType, fVal);
        }}
      />
    </div>
  );
}
