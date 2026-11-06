'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import OverviewView from '@/components/dashboard/OverviewView';
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

const PersonnelListView = dynamic(() => import('@/components/personnel/PersonnelListView'), {
  loading: () => <ModuleLoadingFallback label="Personel Listesi yükleniyor..." />,
});
const SitesView = dynamic(() => import('@/components/sites/SitesView'), {
  loading: () => <ModuleLoadingFallback label="Şantiye & Proje görünümü yükleniyor..." />,
});
const DemographicsView = dynamic(() => import('@/components/demographics/DemographicsView'), {
  loading: () => <ModuleLoadingFallback label="Demografi & İstatistik yükleniyor..." />,
});
const ManagementReportsView = dynamic(() => import('@/components/reports/ManagementReportsView'), {
  loading: () => <ModuleLoadingFallback label="Yönetim & Turnover raporu yükleniyor..." />,
});
const DatabaseManagementView = dynamic(() => import('@/components/database/DatabaseManagementView'), {
  loading: () => <ModuleLoadingFallback />,
});
const UserManagementView = dynamic(() => import('@/components/admin/UserManagementView'), {
  loading: () => <ModuleLoadingFallback />,
});
const ComplianceAnalyticsView = dynamic(() => import('@/components/compliance/ComplianceAnalyticsView'), {
  loading: () => <ModuleLoadingFallback label="Evrak & Süre Analitiği yükleniyor..." />,
});
const GosuslugiVksView = dynamic(() => import('@/components/gosuslugi/GosuslugiVksView'), {
  loading: () => <ModuleLoadingFallback label="Gosuslugi VKS Bildirim Listesi yükleniyor..." />,
});
const GosuslugiAnalyticsView = dynamic(() => import('@/components/gosuslugi/GosuslugiAnalyticsView'), {
  loading: () => <ModuleLoadingFallback label="VKS İstatistik & Analiz yükleniyor..." />,
});
const PoweriseInnovationView = dynamic(() => import('@/components/powerise/PoweriseInnovationView'), {
  loading: () => <ModuleLoadingFallback />,
});
const OfficialVsRealView = dynamic(() => import('@/components/workforce/OfficialVsRealView'), {
  loading: () => <ModuleLoadingFallback label="1C ZUP & eBA Karşılaştırma yükleniyor..." />,
});
const QuotaTrackingView = dynamic(() => import('@/components/quotas/QuotaTrackingView'), {
  loading: () => <ModuleLoadingFallback />,
});
const InvitationsTrackingView = dynamic(() => import('@/components/invitations/InvitationsTrackingView'), {
  loading: () => <ModuleLoadingFallback />,
});
const TravelTicketsAdminView = dynamic(() => import('@/components/powerise/TravelTicketsAdminView'), {
  loading: () => <ModuleLoadingFallback />,
});
const CampManagementView = dynamic(() => import('@/components/powerise/CampManagementView'), {
  loading: () => <ModuleLoadingFallback />,
});
const SettingsView = dynamic(() => import('@/components/settings/SettingsView'), {
  loading: () => <ModuleLoadingFallback label="Ayarlar & Yönetim yükleniyor..." />,
});
const ExcelUploadModal = dynamic(() => import('@/components/modals/ExcelUploadModal'));

export default function Home() {
  const { user, loading: authLoading } = useAuth();
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

  // Preload heavy VKS & Personnel bundles on idle so sidebar tab switches feel instantaneous
  useEffect(() => {
    const timer = setTimeout(() => {
      import('@/components/gosuslugi/GosuslugiVksView').catch(() => {});
      import('@/components/gosuslugi/GosuslugiAnalyticsView').catch(() => {});
      import('@/components/personnel/PersonnelListView').catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, []);

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

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar with Mobile Support */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (user?.role === 'viewer' && (tab === 'gosuslugi' || tab === 'database' || tab === 'admin')) {
            setActiveTab('overview');
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
        onOpenUpload={() => {
          if (user?.role !== 'viewer') setIsUploadModalOpen(true);
        }}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />

      {/* Main Content Area: pl-0 on mobile, responsive padding on desktop */}
      <main
        className={`pt-14 transition-all duration-300 min-h-screen pl-0 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-60'
        }`}
      >
        {(activeTab === 'overview' ||
          (user?.role === 'viewer' && (activeTab === 'gosuslugi' || activeTab === 'database'))) && (
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

        {activeTab === 'gosuslugi' && user?.role !== 'viewer' && <GosuslugiVksView />}

        {activeTab === 'gosuslugi_analytics' && <GosuslugiAnalyticsView />}

        {activeTab === 'powerise_tech' && <PoweriseInnovationView />}

        {activeTab === 'official_real' && <OfficialVsRealView />}

        {activeTab === 'quotas' && <QuotaTrackingView />}

        {activeTab === 'invitations' && <InvitationsTrackingView />}

        {activeTab === 'travel_tickets' && (
          <TravelTicketsAdminView
            onOpenAiSettings={() => {
              if (user?.role !== 'viewer') {
                setSettingsInitialSubTab('ai_settings');
                setActiveTab('settings');
              }
            }}
            onNavigateToPersonnel={handleNavigateToPersonnel}
          />
        )}

        {activeTab === 'camp_management' && <CampManagementView />}

        {activeTab === 'compliance' && (
          <ComplianceAnalyticsView
            onNavigateToPersonnel={handleNavigateToPersonnel}
            initialSubTab={complianceInitialSubTab}
          />
        )}

        {activeTab === 'personnel' && (
          <PersonnelListView
            initialFilter={initialFilterForPersonnel}
            onClearInitialFilter={() => setInitialFilterForPersonnel(null)}
          />
        )}

        {activeTab === 'sites' && (
          <SitesView stats={stats} onNavigateToPersonnel={handleNavigateToPersonnel} />
        )}

        {activeTab === 'demographics' && (
          <DemographicsView stats={stats} onNavigateToPersonnel={handleNavigateToPersonnel} />
        )}

        {activeTab === 'turnover' && (
          <ManagementReportsView stats={stats} onNavigateToPersonnel={handleNavigateToPersonnel} />
        )}

        {activeTab === 'settings' && user?.role !== 'viewer' && (
          <SettingsView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
            initialSubTab={settingsInitialSubTab}
          />
        )}

        {activeTab === 'database' && user?.role !== 'viewer' && (
          <SettingsView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
            initialSubTab="database_excel"
          />
        )}

        {activeTab === 'admin' && user?.role === 'admin' && (
          <SettingsView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
            initialSubTab="users_rls"
          />
        )}
      </main>

      {/* Excel Upload Modal (disabled for viewer role) */}
      {user?.role !== 'viewer' && (
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
