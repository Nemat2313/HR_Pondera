'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import OverviewView from '@/components/dashboard/OverviewView';
import PersonnelListView from '@/components/personnel/PersonnelListView';
import SitesView from '@/components/sites/SitesView';
import DemographicsView from '@/components/demographics/DemographicsView';
import ManagementReportsView from '@/components/reports/ManagementReportsView';
import DatabaseManagementView from '@/components/database/DatabaseManagementView';
import UserManagementView from '@/components/admin/UserManagementView';
import ComplianceAnalyticsView from '@/components/compliance/ComplianceAnalyticsView';
import ExcelUploadModal from '@/components/modals/ExcelUploadModal';
import LoginModal from '@/components/auth/LoginModal';
import { StatsData } from '@/types';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user } = useAuth();
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
  const [firmFilter, setFirmFilter] = useState<'all' | 'main' | 'subcon'>('all');

  // Cross-page navigation state for Personnel List
  const [initialFilterForPersonnel, setInitialFilterForPersonnel] = useState<{
    type: string;
    value: string;
  } | null>(null);

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
    firmFilter,
    user,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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
    (firmFilter !== 'all' ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar with Mobile Support */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        totalActive={stats?.totalCount || 5363}
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
        dataFreshness={stats?.systemInfo?.data_freshness || '02.10.2026'}
        onOpenUpload={() => setIsUploadModalOpen(true)}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
      />

      {/* Main Content Area: pl-0 on mobile, responsive padding on desktop */}
      <main
        className={`pt-16 transition-all duration-300 min-h-screen pl-0 ${
          collapsed ? 'lg:pl-20' : 'lg:pl-56'
        }`}
      >
        {activeTab === 'overview' && (
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
            firmFilter={firmFilter}
            setFirmFilter={setFirmFilter}
            onNavigateToPersonnel={handleNavigateToPersonnel}
            onResetFilters={handleResetFilters}
          />
        )}

        {activeTab === 'compliance' && (
          <ComplianceAnalyticsView onNavigateToPersonnel={handleNavigateToPersonnel} />
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

        {activeTab === 'database' && (
          <DatabaseManagementView
            stats={stats}
            onOpenUpload={() => setIsUploadModalOpen(true)}
            onRefreshData={fetchStats}
          />
        )}

        {activeTab === 'admin' && user?.role === 'admin' && <UserManagementView />}
      </main>

      {/* Excel Upload Modal */}
      <ExcelUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={fetchStats}
      />

      {/* Login & Demo Account Switcher Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
}
