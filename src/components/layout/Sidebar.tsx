'use client';

import React from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  PieChart,
  TrendingUp,
  Database,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  HardHat,
  UserCog,
  X,
  MapPin,
  Briefcase,
  FileCheck2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  totalActive: number;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  totalActive,
}: SidebarProps) {
  const { user } = useAuth();
  const { lang, t } = useLanguage();

  const menuItems = [
    {
      id: 'overview',
      label: t('nav_overview'),
      icon: LayoutDashboard,
      badge: 'KPI',
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50',
    },
    {
      id: 'compliance',
      label: t('nav_compliance'),
      icon: FileCheck2,
      badge: t('badge_new'),
      badgeColor: 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-700/50',
    },
    {
      id: 'personnel',
      label: t('nav_personnel'),
      icon: Users,
      badge: totalActive ? `${totalActive.toLocaleString('tr-TR')}` : undefined,
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50',
    },
    {
      id: 'sites',
      label: t('nav_sites'),
      icon: Building2,
      badge: user?.scope_type === 'region' ? (lang === 'ru' ? '1 Регион' : '1 Bölge') : (lang === 'ru' ? '6 Регионов' : '6 Bölge'),
      badgeColor: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60',
    },
    {
      id: 'demographics',
      label: t('nav_demographics'),
      icon: PieChart,
    },
    {
      id: 'turnover',
      label: t('nav_turnover'),
      icon: TrendingUp,
      badge: t('badge_report'),
      badgeColor: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/50',
    },
    {
      id: 'database',
      label: t('nav_database'),
      icon: Database,
    },
  ];

  // If user is admin, add User & RLS Management item
  if (user?.role === 'admin') {
    menuItems.push({
      id: 'admin',
      label: t('nav_admin'),
      icon: UserCog,
      badge: 'Admin',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300/50 dark:border-emerald-800/50',
    });
  }

  const handleSelectTab = (id: string) => {
    setActiveTab(id);
    if (mobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden animate-in fade-in duration-200"
        />
      )}

      <aside
        style={{ fontFamily: "'Tahoma', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif" }}
        className={`fixed top-0 left-0 z-50 h-screen transition-all duration-300 ease-in-out bg-white dark:bg-[#0F172A] border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between ${
          // Mobile state
          mobileOpen ? 'translate-x-0 w-56 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-56'}`}
      >
        {/* Top Header & Logo */}
        <div>
          <div className="h-14 px-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs shrink-0">
                <HardHat className="w-4 h-4" />
              </div>
              {(!collapsed || mobileOpen) && (
                <div>
                  <h1 className="font-semibold text-sm text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-1">
                    Pondera <span className="text-emerald-600 dark:text-emerald-400 font-bold">HR</span>
                  </h1>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5 font-normal tracking-tight">TeamHub SaaS v2.6</p>
                </div>
              )}
            </div>

            {/* Close button on mobile */}
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Desktop collapse toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:flex w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 items-center justify-center transition-colors"
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* User RLS Badge in Sidebar */}
          {user && (!collapsed || mobileOpen) && (
            <div className="mx-2 mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/70 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900 dark:text-white text-[11px] truncate">{user.name}</span>
                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                  {user.role === 'admin' ? (lang === 'ru' ? 'Админ' : 'Admin') : (lang === 'ru' ? 'Пользователь' : 'Kullanıcı')}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-normal truncate">
                {user.scope_type === 'region' ? (
                  <>
                    <MapPin className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>{lang === 'ru' ? 'Регион: ' : 'Bölge: '}{user.scope_value}</span>
                  </>
                ) : user.scope_type === 'project' ? (
                  <>
                    <Briefcase className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{lang === 'ru' ? 'Проект: ' : 'Proje: '}{user.scope_value}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t('rls_unlimited')}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <div className="p-2 space-y-0.5">
            <div
              className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${
                collapsed && !mobileOpen ? 'text-center' : ''
              }`}
            >
              {collapsed && !mobileOpen ? '•••' : t('nav_main_menu')}
            </div>

            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-2xs font-medium'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-normal'
                  } ${collapsed && !mobileOpen ? 'justify-center px-0' : ''}`}
                  title={collapsed && !mobileOpen ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-400'}`} />
                  {(!collapsed || mobileOpen) && (
                    <div className="flex-1 flex items-center justify-between text-left min-w-0">
                      <span className="whitespace-nowrap leading-tight tracking-tight">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`text-[9.5px] font-medium px-1.5 py-0.2 rounded shrink-0 ml-1 leading-normal ${
                            item.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Footer Info */}
        <div className="p-2 border-t border-slate-100 dark:border-slate-800">
          {!collapsed || mobileOpen ? (
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100/80 dark:border-slate-700/80 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[11px] font-medium text-slate-800 dark:text-slate-200 truncate leading-tight">{t('nav_db_secure')}</p>
                <p className="text-[9.5px] text-slate-400 dark:text-slate-400 truncate leading-tight font-normal">{t('nav_db_sub')}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title="SQLite Aktif">
              <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
