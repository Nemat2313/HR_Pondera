'use client';

import React, { useEffect, useState } from 'react';
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
  Bot,
  Activity,
  Smartphone,
  Scale,
  Mail,
  Plane,
  Building,
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
  const [versionInfo, setVersionInfo] = useState<{
    version: string;
    buildNumber: number;
    commitHash: string;
    updatedAt: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.success) {
          setVersionInfo(json);
        }
      })
      .catch(() => {});
  }, []);

  interface MenuItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    badgeColor?: string;
  }

  interface NavGroup {
    id: string;
    title: string;
    tag?: string;
    items: MenuItem[];
  }

  const navGroups: NavGroup[] = [
    {
      id: 'live',
      title: lang === 'ru' ? '1. ДЕЙСТВУЮЩИЕ МОДУЛИ' : '1. CANLI ÇALIŞAN SİSTEM',
      tag: lang === 'ru' ? 'В сети' : 'Canlı',
      items: [
        {
          id: 'overview',
          label: t('nav_overview'),
          icon: LayoutDashboard,
          badge: 'KPI',
          badgeColor: 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50',
        },
        {
          id: 'turnover',
          label: t('nav_turnover'),
          icon: TrendingUp,
          badge: t('badge_report'),
          badgeColor: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/50',
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
        ...(user?.role !== 'viewer'
          ? [
              {
                id: 'gosuslugi',
                label: t('nav_gosuslugi'),
                icon: Bot,
                badge: t('badge_rpa'),
                badgeColor:
                  'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border border-cyan-200/50 dark:border-cyan-700/50',
              },
            ]
          : []),
        {
          id: 'gosuslugi_analytics',
          label: lang === 'ru' ? 'ВКС Статистика' : 'VKS İstatistik & Analiz',
          icon: Activity,
          badge: lang === 'ru' ? 'Live' : 'Canlı',
          badgeColor: 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200/50 dark:border-rose-700/50',
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
        ...(user?.role !== 'viewer'
          ? [
              {
                id: 'database',
                label: t('nav_database'),
                icon: Database,
                badge: 'SQLite',
                badgeColor: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-700/50',
              },
            ]
          : []),
        ...(user?.role === 'admin'
          ? [
              {
                id: 'admin',
                label: t('nav_admin'),
                icon: UserCog,
                badge: 'Admin',
                badgeColor: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300/50 dark:border-emerald-800/50',
              },
            ]
          : []),
      ],
    },
    {
      id: 'planned',
      title: lang === 'ru' ? '2. ПЛАНИРУЕМЫЕ ЗАДАЧИ' : '2. PLANLANAN İŞLER (Zahid Bey)',
      tag: lang === 'ru' ? 'В плане' : 'Planlandı',
      items: [
        {
          id: 'official_real',
          label: t('nav_official_real'),
          icon: Scale,
          badge: lang === 'ru' ? 'Аудит' : 'Denetim',
          badgeColor: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-700/50',
        },
        {
          id: 'quotas',
          label: t('nav_quotas'),
          icon: Briefcase,
          badge: lang === 'ru' ? 'Квота' : 'Kota',
          badgeColor: 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-700/50',
        },
        {
          id: 'invitations',
          label: t('nav_invitations'),
          icon: Mail,
          badge: lang === 'ru' ? 'МВД / TG' : 'Telegram',
          badgeColor: 'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-700/50',
        },
      ],
    },
    {
      id: 'powerise',
      title: lang === 'ru' ? '3. МОДУЛИ POWERISE' : '3. POWERISE SATILIK MODÜLLER',
      tag: lang === 'ru' ? 'Витрина' : 'Vitrin',
      items: [
        {
          id: 'powerise_tech',
          label: t('nav_powerise_tech'),
          icon: Smartphone,
          badge: lang === 'ru' ? 'Видео' : 'Video',
          badgeColor: 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200/50 dark:border-rose-700/50',
        },
        {
          id: 'travel_tickets',
          label: t('nav_travel_tickets'),
          icon: Plane,
          badge: 'AI OCR',
          badgeColor: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-700/50',
        },
        {
          id: 'camp_management',
          label: t('nav_camp_management'),
          icon: Building,
          badge: lang === 'ru' ? 'Городок' : 'Lojman',
          badgeColor: 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-700/50',
        },
      ],
    },
  ];

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
        className={`fixed top-0 left-0 z-50 h-screen transition-all duration-300 ease-in-out bg-gradient-to-b from-white via-emerald-50/70 to-emerald-200/90 dark:from-[#0F172A] dark:via-[#0B1F24] dark:to-[#052e2b] border-r border-emerald-200/70 dark:border-teal-900/60 flex flex-col justify-between ${
          // Mobile state
          mobileOpen ? 'translate-x-0 w-60 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        } ${collapsed ? 'lg:w-20' : 'lg:w-60'}`}
      >
        {/* Top Header & Logo */}
        <div className="shrink-0">
          <div className="h-14 px-3 flex items-center justify-between border-b border-slate-100/80 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xs shrink-0">
                <HardHat className="w-4 h-4" />
              </div>
              {(!collapsed || mobileOpen) && (
                <div>
                  <h1 className="font-normal text-sm text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-1">
                    Pondera <span className="text-emerald-600 dark:text-emerald-400 font-normal">HR</span>
                  </h1>
                  <div
                    className="flex items-center gap-1 mt-0.5"
                    title={
                      versionInfo?.commitHash
                        ? `Build #${versionInfo.buildNumber} • Commit: ${versionInfo.commitHash} (${versionInfo.updatedAt})`
                        : 'TeamHub SaaS v2.6'
                    }
                  >
                    <span className="text-[9.5px] text-slate-400 dark:text-slate-400 font-normal tracking-tight">
                      TeamHub
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-mono font-normal text-[9.5px] leading-tight">
                      {versionInfo?.version || 'v2.8.1'}
                    </span>
                  </div>
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
                <span className="font-normal text-slate-900 dark:text-white text-[11px] truncate">{user.name}</span>
                <span
                  className={`text-[9px] font-normal px-1.5 py-0.2 rounded border ${
                    user.role === 'viewer'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300/60 dark:border-amber-800/60'
                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200/50 dark:border-indigo-800/50'
                  }`}
                >
                  {user.role === 'admin'
                    ? lang === 'ru'
                      ? 'Админ'
                      : 'Admin'
                    : user.role === 'viewer'
                    ? lang === 'ru'
                      ? '👁️ Наблюдатель'
                      : '👁️ Gözlemci'
                    : lang === 'ru'
                    ? 'Пользователь'
                    : 'Kullanıcı'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10.5px] text-slate-700 dark:text-slate-300 mt-1 font-normal truncate">
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
        </div>

        {/* Scrollable Navigation Groups Container */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 min-h-0">
          {navGroups.map((group) => (
            <div key={group.id} className="space-y-0.5">
              {/* Group Header */}
              {(!collapsed || mobileOpen) ? (
                <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400 font-normal">
                  <span className="truncate">{group.title}</span>
                  {group.tag && (
                    <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-normal">
                      {group.tag}
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-full flex justify-center py-1">
                  <div className="w-4 h-0.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
                </div>
              )}

              {/* Group Items */}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-100 border border-emerald-300/70 dark:border-emerald-700/60 shadow-2xs font-normal'
                        : 'text-slate-900 dark:text-slate-100 hover:text-black dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/60 font-normal'
                    } ${collapsed && !mobileOpen ? 'justify-center px-0' : ''}`}
                    title={collapsed && !mobileOpen ? item.label : undefined}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`} />
                    {(!collapsed || mobileOpen) && (
                      <div className="flex-1 flex items-center justify-between text-left min-w-0">
                        <span className="truncate leading-tight tracking-tight">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-normal px-1.5 py-0.2 rounded shrink-0 ml-1 leading-normal ${
                              item.badgeColor || 'bg-slate-200/90 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
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
          ))}
        </div>

        {/* Bottom Footer Info */}
        <div className="p-2 border-t border-emerald-300/60 dark:border-teal-800/60">
          {!collapsed || mobileOpen ? (
            <div className="p-2 rounded-lg bg-white/85 dark:bg-slate-900/80 backdrop-blur-xs border border-emerald-200/80 dark:border-teal-800/70 flex items-center gap-2 shadow-2xs">
              <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="overflow-hidden">
                <p className="text-[11px] font-normal text-slate-950 dark:text-white truncate leading-tight">{t('nav_db_secure')}</p>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 truncate leading-tight font-normal">{t('nav_db_sub')}</p>
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
