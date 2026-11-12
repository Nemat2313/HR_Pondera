'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import OverviewView from '@/components/dashboard/OverviewView';
import SettingsView from '@/components/settings/SettingsView';
import LoginModal from '@/components/auth/LoginModal';
import { StatsData } from '@/types';
import { useAuth } from '@/context/AuthContext';

function ModuleLoadingFallback({ label = 'Sayfa yükleniyor...' }: { label?: string }) {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[62vh] gap-3">
      <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/70 flex items-center justify-center shadow-2xs">
        <Loader2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-spin" />
      </div>
      <div className="text-center space-y-0.5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Veriler ve modül bileşenleri hazırlanıyor...</p>
      </div>
    </div>
  );
}

function ModuleChunkRetryFallback({ label }: { label: string }) {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[55vh] gap-3 text-center">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        {label} yüklenirken ağ geçişi algılandı
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
        VPN/ağ adaptörü değişimi veya yeni sunucu güncellemesi nedeniyle modül yeniden yüklenmeli.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-100 hover:bg-emerald-200/80 dark:bg-emerald-500/25 text-emerald-950 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-500/40 cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Sayfayı Yenile</span>
      </button>
    </div>
  );
}

// Resilient dynamic loader: retries 3 times on ERR_NETWORK_CHANGED / ChunkLoadError and never crashes React
function dynamicWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  label = 'Modül yükleniyor...'
) {
  return dynamic(
    async () => {
      const delays = [600, 1400, 2400];
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
          return await importer();
        } catch {
          if (attempt < delays.length) {
            await new Promise((r) => setTimeout(r, delays[attempt]));
          }
        }
      }
      if (typeof window !== 'undefined') {
        try {
          const last = Number(sessionStorage.getItem('pondera_chunk_reload_at') || '0');
          if (Date.now() - last > 15000) {
            sessionStorage.setItem('pondera_chunk_reload_at', String(Date.now()));
            window.location.reload();
          }
        } catch {
          // ignore
        }
      }
      const FallbackComp = (() => <ModuleChunkRetryFallback label={label} />) as unknown as T;
      return { default: FallbackComp };
    },
    { loading: () => <ModuleLoadingFallback label={label} /> }
  );
}

const PersonnelListView = dynamicWithRetry(
  () => import('@/components/personnel/PersonnelListView'),
  'Personel Listesi yükleniyor...'
);
const SitesView = dynamicWithRetry(
  () => import('@/components/sites/SitesView'),
  'Şantiye & Proje görünümü yükleniyor...'
);
const DemographicsView = dynamicWithRetry(
  () => import('@/components/demographics/DemographicsView'),
  'Demografi & İstatistik yükleniyor...'
);
const ManagementReportsView = dynamicWithRetry(
  () => import('@/components/reports/ManagementReportsView'),
  'Yönetim & Turnover raporu yükleniyor...'
);
const ComplianceAnalyticsView = dynamicWithRetry(
  () => import('@/components/compliance/ComplianceAnalyticsView'),
  'Evrak & Süre Analitiği yükleniyor...'
);
const GosuslugiVksView = dynamicWithRetry(
  () => import('@/components/gosuslugi/GosuslugiVksView'),
  'Gosuslugi VKS Bildirim Listesi yükleniyor...'
);
const GosuslugiAnalyticsView = dynamicWithRetry(
  () => import('@/components/gosuslugi/GosuslugiAnalyticsView'),
  'VKS İstatistik & Analiz yükleniyor...'
);
const PoweriseInnovationView = dynamicWithRetry(
  () => import('@/components/powerise/PoweriseInnovationView'),
  'Powerise İnovasyon yükleniyor...'
);
const OfficialVsRealView = dynamicWithRetry(
  () => import('@/components/workforce/OfficialVsRealView'),
  '1C ZUP & eBA Karşılaştırma yükleniyor...'
);
const QuotaTrackingView = dynamicWithRetry(
  () => import('@/components/quotas/QuotaTrackingView'),
  'Kota Takibi yükleniyor...'
);
const InvitationsTrackingView = dynamicWithRetry(
  () => import('@/components/invitations/InvitationsTrackingView'),
  'Davetiye Takibi yükleniyor...'
);
const TravelTicketsAdminView = dynamicWithRetry(
  () => import('@/components/powerise/TravelTicketsAdminView'),
  'İdari İşler & AI Bilet yükleniyor...'
);
const CampManagementView = dynamicWithRetry(
  () => import('@/components/powerise/CampManagementView'),
  'Kamp & Lojman Takibi yükleniyor...'
);
const ExcelUploadModal = dynamicWithRetry(
  () => import('@/components/modals/ExcelUploadModal'),
  'Excel yükleme penceresi hazırlanıyor...'
);

export default function Home() {
  const { user, loading: authLoading, showPermissionDenied } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [includeExits, setIncludeExits] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Cross-filtering state (Power BI style)
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedNationality, setSelectedNationality] = useState('all');
  const [selectedCollar, setSelectedCollar] = useState('all');
  const [selectedTitle, setSelectedTitle] = useState('all');
  const [selectedPermit, setSelectedPermit] = useState('all');
  const [selectedGender, setSelectedGender] = useState('all');
  const [firmFilter, setFirmFilter] = useState<'all' | 'main' | 'subcon'>('all');

  // Cross-page navigation state for Personnel List
  const [initialFilterForPersonnel, setInitialFilterForPersonnel] = useState<{
    type: string;
    value: string;
  } | null>(null);
  const [complianceInitialSubTab, setComplianceInitialSubTab] = useState<'expiry' | 'standby' | 'scans'>('expiry');
  const [settingsInitialSubTab, setSettingsInitialSubTab] = useState<
    'users_rls' | 'database_excel' | 'mail_notifications' | 'ai_settings'
  >('users_rls');

  // Stats data
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Fetch stats from backend with user RLS scope
  const fetchStats = useCallback(() => {
    if (user?.role === 'idari_isler') {
      setLoadingStats(false);
      return;
    }
    setLoadingStats(true);
    const params = new URLSearchParams();
    if (includeExits) params.set('includeExits', 'true');
    if (selectedRegion !== 'all') params.set('region', selectedRegion);
    if (selectedProject !== 'all') params.set('project', selectedProject);
    if (selectedDepartment !== 'all') params.set('department', selectedDepartment);
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedNationality !== 'all') params.set('nationality', selectedNationality);
    if (selectedCollar !== 'all') params.set('collar', selectedCollar);
    if (selectedTitle !== 'all') params.set('title', selectedTitle);
    if (selectedPermit !== 'all') params.set('permit', selectedPermit);
    if (selectedGender !== 'all') params.set('gender', selectedGender);
    if (firmFilter !== 'all') params.set('firmType', firmFilter);

    // Apply RLS scope from active user
    if (user) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }

    fetch(`/api/stats?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStats(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, [
    includeExits,
    selectedRegion,
    selectedProject,
    selectedDepartment,
    selectedCategory,
    selectedNationality,
    selectedCollar,
    selectedTitle,
    selectedPermit,
    selectedGender,
    firmFilter,
    user,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (user) {
      setIsLoginModalOpen(false);
    }
  }, [user]);

  // Preload heavy VKS, Personnel & Ticket AI bundles on idle so sidebar tab switches feel instantaneous
  useEffect(() => {
    try {
      const savedTab = sessionStorage.getItem('pondera_active_tab');
      const savedSub = sessionStorage.getItem('pondera_settings_subtab') as
        | 'users_rls'
        | 'database_excel'
        | 'mail_notifications'
        | 'ai_settings'
        | null;
      if (savedSub) setSettingsInitialSubTab(savedSub);
      if (savedTab) setActiveTab(savedTab);
    } catch {
      // ignore
    }

    const timer = setTimeout(() => {
      import('@/components/gosuslugi/GosuslugiVksView').catch(() => {});
      import('@/components/gosuslugi/GosuslugiAnalyticsView').catch(() => {});
      import('@/components/personnel/PersonnelListView').catch(() => {});
      import('@/components/powerise/TravelTicketsAdminView').catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('pondera_active_tab', activeTab);
      sessionStorage.setItem('pondera_settings_subtab', settingsInitialSubTab);
    } catch {
      // ignore
    }
  }, [activeTab, settingsInitialSubTab]);

  // Global search submit -> switches to Personnel List with search
  const handleSearchSubmit = (query: string) => {
    if (query.trim()) {
      setInitialFilterForPersonnel({ type: 'search', value: query.trim() });
      setActiveTab('personnel');
    }
  };

  // Navigate to personnel list with drill-down filter
  const handleNavigateToPersonnel = (filterType?: string, filterValue?: string) => {
    if (filterType && filterValue) {
      setInitialFilterForPersonnel({ type: filterType, value: filterValue });
    } else {
      setInitialFilterForPersonnel(null);
    }
    setActiveTab('personnel');
  };

  // Reset all cross-filters
  const handleResetFilters = () => {
    setSelectedRegion('all');
    setSelectedProject('all');
    setSelectedDepartment('all');
    setSelectedCategory('all');
    setSelectedNationality('all');
    setSelectedCollar('all');
    setSelectedTitle('all');
    setSelectedPermit('all');
    setSelectedGender('all');
    setFirmFilter('all');
    setSearchQuery('');
  };

  const activeFilterCount =
    (selectedRegion !== 'all' ? 1 : 0) +
    (selectedProject !== 'all' ? 1 : 0) +
    (selectedDepartment !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedNationality !== 'all' ? 1 : 0) +
    (selectedCollar !== 'all' ? 1 : 0) +
    (selectedTitle !== 'all' ? 1 : 0) +
    (selectedPermit !== 'all' ? 1 : 0) +
    (selectedGender !== 'all' ? 1 : 0) +
    (firmFilter !== 'all' ? 1 : 0);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pondera HR Yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-center p-4">
        <LoginModal isOpen={true} />
      </div>
    );
  }

  const isIdariOnly = user?.role === 'idari_isler';
  const effectiveTab = isIdariOnly ? 'travel_tickets' : activeTab;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar with Mobile Support */}
      <Sidebar
        activeTab={effectiveTab}
        setActiveTab={(tab) => {
          if (user?.role === 'idari_isler') {
            setActiveTab('travel_tickets');
            return;
          }
          if (user?.role === 'viewer' && (tab === 'settings' || tab === 'database' || tab === 'admin')) {
            showPermissionDenied({
              actionLabelTr: 'Ayarlar & Yönetim',
              actionLabelRu: 'Настройки системы',
            });
            return;
          }
          if (tab === 'personnel') {
            setInitialFilterForPersonnel(null);
          }
          if (tab === 'settings') {
            setSettingsInitialSubTab('users_rls');
          }
          setActiveTab(tab);
        }}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        totalActive={stats?.totalCount || 5364}
      />

      {/* Topbar with Mobile Hamburger & RLS info */}
      <Topbar
        collapsed={collapsed}
        onOpenMobileSidebar={() => setMobileOpen(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        includeExits={includeExits}
        setIncludeExits={setIncludeExits}
        dataFreshness={stats?.systemInfo?.data_freshness || '03.10.2026'}
        dataFreshnessTime={stats?.systemInfo?.eba_time_msk}
        zupFreshness={stats?.systemInfo?.zup_data_freshness}
        zupFreshnessTime={stats?.systemInfo?.zup_time_msk}
        onOpenUpload={() => {
          if (user?.role === 'idari_isler') return;
          if (user?.role === 'viewer') {
            showPermissionDenied({
              actionLabelTr: 'Personel Excel Yükleme',
              actionLabelRu: 'Загрузка Excel сотрудников',
            });
            return;
          }
          setIsUploadModalOpen(true);
        }}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        activeFilterCount={effectiveTab === 'overview' ? activeFilterCount : 0}
        onResetFilters={handleResetFilters}
      />

      {/* Main Content Area: pl-0 on mobile, responsive padding on desktop */}
      <main
        className={`pt-14 transition-all duration-300 min-h-screen pl-0 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-60'
        }`}
      >
        {(effectiveTab === 'overview' ||
          (user?.role === 'viewer' && effectiveTab === 'database')) && (
          <OverviewView
            stats={stats}
            loading={loadingStats}
            selectedRegion={selectedRegion}
            setSelectedRegion={setSelectedRegion}
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            selectedDepartment={selectedDepartment}
            setSelectedDepartment={setSelectedDepartment}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedNationality={selectedNationality}
            setSelectedNationality={setSelectedNationality}
            selectedCollar={selectedCollar}
            setSelectedCollar={setSelectedCollar}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedPermit={selectedPermit}
            setSelectedPermit={setSelectedPermit}
            selectedGender={selectedGender}
            setSelectedGender={setSelectedGender}
            firmFilter={firmFilter}
            setFirmFilter={setFirmFilter}
            onNavigateToPersonnel={handleNavigateToPersonnel}
            onNavigateToTurnover={() => setActiveTab('turnover')}
            onNavigateToCompliance={(sub) => {
              setComplianceInitialSubTab(sub);
              setActiveTab('compliance');
            }}
            onNavigateToOfficialReal={() => setActiveTab('official_real')}
            onResetFilters={handleResetFilters}
          />
        )}

        {effectiveTab === 'gosuslugi' && <GosuslugiVksView />}

        {effectiveTab === 'gosuslugi_analytics' && <GosuslugiAnalyticsView />}

        {effectiveTab === 'powerise_tech' && <PoweriseInnovationView />}

        {effectiveTab === 'official_real' && <OfficialVsRealView />}

        {effectiveTab === 'quotas' && <QuotaTrackingView />}

        {effectiveTab === 'invitations' && <InvitationsTrackingView />}

        {effectiveTab === 'travel_tickets' && (
          <TravelTicketsAdminView
            onOpenAiSettings={() => {
              if (user?.role === 'idari_isler') return;
              if (user?.role === 'viewer') {
                showPermissionDenied({
                  actionLabelTr: 'AI Ayarları',
                  actionLabelRu: 'Настройки AI',
                });
                return;
              }
              setSettingsInitialSubTab('ai_settings');
              setActiveTab('settings');
            }}
            onNavigateToPersonnel={isIdariOnly ? undefined : handleNavigateToPersonnel}
          />
        )}

        {effectiveTab === 'camp_management' && <CampManagementView />}

        {effectiveTab === 'compliance' && (
          <ComplianceAnalyticsView
            onNavigateToPersonnel={handleNavigateToPersonnel}
            initialSubTab={complianceInitialSubTab}
          />
        )}

        {effectiveTab === 'personnel' && (
          <PersonnelListView
            initialFilter={initialFilterForPersonnel}
            onClearInitialFilter={() => setInitialFilterForPersonnel(null)}
          />
        )}

        {effectiveTab === 'sites' && (
          <SitesView stats={stats} onNavigateToPersonnel={handleNavigateToPersonnel} />
        )}

        {effectiveTab === 'demographics' && (
          <DemographicsView stats={stats} onNavigateToPersonnel={handleNavigateToPersonnel} />
        )}

        {effectiveTab === 'turnover' && (
          <ManagementReportsView stats={stats} onNavigateToPersonnel={handleNavigateToPersonnel} />
        )}

        {effectiveTab === 'settings' && user?.role !== 'viewer' && !isIdariOnly && (
          <SettingsView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
            initialSubTab={settingsInitialSubTab}
          />
        )}

        {effectiveTab === 'database' && user?.role !== 'viewer' && !isIdariOnly && (
          <SettingsView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
            initialSubTab="database_excel"
          />
        )}

        {effectiveTab === 'admin' && user?.role === 'admin' && (
          <SettingsView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
            initialSubTab="users_rls"
          />
        )}
      </main>

      {/* Excel Upload Modal (disabled for viewer & idari_isler roles) */}
      {user?.role !== 'viewer' && !isIdariOnly && (
        <ExcelUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={fetchStats}
        />
      )}

      {/* Login & Demo Account Switcher Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
}
