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
  Settings,
  GitFork,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import PonderaLogo from '@/components/common/PonderaLogo';

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
  const [hoveredFlyout, setHoveredFlyout] = useState<{
    id: string;
    label: string;
    badge?: string;
    badgeColor?: string;
    isActive: boolean;
    centerY: number;
  } | null>(null);

  useEffect(() => {
    if (!collapsed || mobileOpen) {
      setHoveredFlyout(null);
    }
  }, [collapsed, mobileOpen, activeTab]);

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
          id: 'demographics',
          label: t('nav_demographics'),
          icon: PieChart,
          badge: lang === 'ru' ? 'Карта' : 'Harita',
          badgeColor: 'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border border-cyan-200/50 dark:border-cyan-700/50',
        },
        {
          id: 'compliance',
          label: t('nav_compliance'),
          icon: FileCheck2,
          badge: t('badge_new'),
          badgeColor: 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-700/50',
        },
        {
          id: 'official_real',
          label: t('nav_official_real'),
          icon: Scale,
          badge: '1C ZUP',
          badgeColor: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-700/50',
        },
        {
          id: 'personnel',
          label: t('nav_personnel'),
          icon: Users,
          badge: totalActive ? `${totalActive.toLocaleString('tr-TR')}` : undefined,
          badgeColor: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50',
        },
        {
          id: 'org_chart',
          label: t('nav_org_chart', lang === 'ru' ? 'Оргструктура' : 'Organizasyon Şeması'),
          icon: GitFork,
          badge: lang === 'ru' ? 'Иерархия' : 'Şema',
          badgeColor: 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50',
        },
        {
          id: 'invitations',
          label: t('nav_invitations'),
          icon: Mail,
          badge: lang === 'ru' ? 'МВД • Live' : 'MVD • Canlı',
          badgeColor: 'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-700/50',
        },
        {
          id: 'quotas',
          label: t('nav_quotas'),
          icon: Briefcase,
          badge: lang === 'ru' ? 'ИРС • Live' : 'ИРС • Canlı',
          badgeColor: 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-700/50',
        },
        {
          id: 'gosuslugi',
          label: t('nav_gosuslugi'),
          icon: Bot,
          badge: t('badge_rpa'),
          badgeColor:
            'bg-cyan-50 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border border-cyan-200/50 dark:border-cyan-700/50',
        },
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
          badge: user?.scope_type === 'region' ? (lang === 'ru' ? '1 Объект' : '1 Saha') : (lang === 'ru' ? '11 Объектов' : '11 Saha'),
          badgeColor: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60',
        },
        {
          id: 'settings',
          label: lang === 'ru' ? 'Настройки системы' : 'Ayarlar & Yönetim',
          icon: Settings,
          badge: 'RLS • DB • AI',
          badgeColor: 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-700/50',
        },
      ],
    },
    {
      id: 'powerise',
      title: lang === 'ru' ? '2. МОДУЛИ POWERISE' : '2. POWERISE SATILIK MODÜLLER',
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

  const visibleNavGroups: NavGroup[] =
    user?.role === 'idari_isler'
      ? [
          {
            id: 'idari_only',
            title: lang === 'ru' ? 'АХО И АВИАБИЛЕТЫ' : 'İDARİ İŞLER & UÇUŞ OPERASYON',
            tag: 'TV • AI',
            items: [
              {
                id: 'travel_tickets',
                label: t('nav_travel_tickets'),
                icon: Plane,
                badge: 'TV • OCR',
                badgeColor:
                  'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-700/50',
              },
            ],
          },
        ]
      : navGroups;

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
            <div className="flex items-center gap-2 min-w-0">
              {collapsed && !mobileOpen ? (
                <PonderaLogo variant="mark" size="sm" />
              ) : (
                <div className="flex flex-col min-w-0">
                  <PonderaLogo variant="full" size="sm" />
                  <div
                    className="flex items-center gap-1 mt-0.5 pl-0.5"
                    title={
                      versionInfo?.commitHash
                        ? `Build #${versionInfo.buildNumber} • Commit: ${versionInfo.commitHash} (${versionInfo.updatedAt})`
                        : 'Pondera HR TeamHub v2.8.26'
                    }
                  >
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-normal tracking-tight">
                      HR TeamHub
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-mono font-normal text-[9px] leading-tight">
                      {versionInfo?.version || 'v2.8.26'}
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
              onMouseEnter={(e) => {
                if (collapsed && !mobileOpen) {
                  const r = e.currentTarget.getBoundingClientRect();
                  setHoveredFlyout({
                    id: '__expand_sidebar__',
                    label: lang === 'ru' ? 'Развернуть меню' : 'Menüyü Genişlet',
                    isActive: false,
                    centerY: r.top + r.height / 2,
                  });
                }
              }}
              onMouseLeave={() =>
                setHoveredFlyout((prev) => (prev?.id === '__expand_sidebar__' ? null : prev))
              }
              className="hidden lg:flex w-6 h-6 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 items-center justify-center transition-colors cursor-pointer"
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
                      : user.role === 'idari_isler'
                      ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-300/60 dark:border-sky-800/60'
                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200/50 dark:border-indigo-800/50'
                  }`}
                >
                  {user.role === 'admin'
                    ? lang === 'ru'
                      ? 'Админ'
                      : 'Admin'
                    : user.role === 'idari_isler'
                    ? lang === 'ru'
                      ? '✈️ АХО'
                      : '✈️ İdari İşler'
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
        <div
          onScroll={() => {
            if (hoveredFlyout) setHoveredFlyout(null);
          }}
          className="flex-1 overflow-y-auto px-2 py-2 space-y-4 min-h-0"
        >
          {visibleNavGroups.map((group) => (
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
                    onMouseEnter={(e) => {
                      if (collapsed && !mobileOpen) {
                        const r = e.currentTarget.getBoundingClientRect();
                        setHoveredFlyout({
                          id: item.id,
                          label: item.label,
                          badge: item.badge,
                          badgeColor: item.badgeColor,
                          isActive,
                          centerY: r.top + r.height / 2,
                        });
                      }
                    }}
                    onMouseLeave={() =>
                      setHoveredFlyout((prev) => (prev?.id === item.id ? null : prev))
                    }
                    className={`group w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-100 border border-emerald-300/70 dark:border-emerald-700/60 shadow-2xs font-normal'
                        : 'text-slate-900 dark:text-slate-100 hover:text-black dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800/60 font-normal'
                    } ${collapsed && !mobileOpen ? 'justify-center px-0 py-2' : ''}`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    />
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
            <div
              className="flex justify-center cursor-pointer"
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHoveredFlyout({
                  id: '__db_secure__',
                  label: t('nav_db_secure'),
                  badge: 'SQLite',
                  badgeColor:
                    'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60',
                  isActive: false,
                  centerY: r.top + r.height / 2,
                });
              }}
              onMouseLeave={() =>
                setHoveredFlyout((prev) => (prev?.id === '__db_secure__' ? null : prev))
              }
            >
              <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-transform duration-200 hover:scale-110">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Animated Hover Flyout Label When Sidebar is Collapsed (Active on ALL Pages) */}
      {collapsed && !mobileOpen && hoveredFlyout && (
        <div
          key={hoveredFlyout.id}
          style={{ top: `${hoveredFlyout.centerY}px` }}
          className="sidebar-flyout-pill hidden lg:flex fixed left-[86px] z-[999] pointer-events-none items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-slate-800/95 text-white border border-emerald-500/40 shadow-[0_10px_28px_-6px_rgba(15,23,42,0.45)] backdrop-blur-md whitespace-nowrap"
        >
          {/* Left Pointer Arrow */}
          <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-slate-900/95 dark:bg-slate-800/95 border-l border-b border-emerald-500/40" />

          <span
            className={`relative z-10 w-2 h-2 rounded-full shrink-0 ${
              hoveredFlyout.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-teal-400/80'
            }`}
          />
          <span className="relative z-10 text-xs text-white tracking-tight">
            {hoveredFlyout.label}
          </span>
          {hoveredFlyout.badge && (
            <span className="relative z-10 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {hoveredFlyout.badge}
            </span>
          )}
        </div>
      )}
    </>
  );
}
