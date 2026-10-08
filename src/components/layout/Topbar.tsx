'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Bell,
  UploadCloud,
  Menu,
  ShieldCheck,
  MapPin,
  Briefcase,
  LogIn,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  X,
  UserCheck,
  ChevronDown,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

interface TopbarProps {
  collapsed: boolean;
  onOpenMobileSidebar: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSearchSubmit: (q: string) => void;
  includeExits: boolean;
  setIncludeExits: (val: boolean) => void;
  dataFreshness: string;
  onOpenUpload: () => void;
  onOpenLogin: () => void;
  activeFilterCount: number;
  onResetFilters: () => void;
}

export default function Topbar({
  collapsed,
  onOpenMobileSidebar,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  includeExits,
  setIncludeExits,
  dataFreshness,
  onOpenUpload,
  onOpenLogin,
  activeFilterCount,
  onResetFilters,
}: TopbarProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsCount, setAlertsCount] = useState(0);

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/notifications')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAlerts(data.alerts || []);
          setAlertsCount(data.count || 0);
        }
      })
      .catch(() => {});
  }, []);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearchSubmit(searchQuery);
    }
  };

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 bg-white/95 dark:bg-[#0F172A]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-all duration-300 flex items-center justify-between px-3 sm:px-6 left-0 ${
        collapsed ? 'lg:left-20' : 'lg:left-56'
      }`}
    >
      {/* Left: Hamburger (Mobile) + Global Search */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 max-w-xl">
        {/* Mobile Hamburger Button */}
        <button
          onClick={onOpenMobileSidebar}
          aria-label="Menüyü Aç"
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search Input */}
        <div className="relative w-full max-w-sm sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Personel ara... (Ad, Sicil, Pasaport)"
            className="w-full pl-9 pr-16 sm:pr-20 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                onSearchSubmit('');
              }}
              className="absolute right-12 sm:right-14 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onSearchSubmit(searchQuery)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-2xs"
          >
            Bul
          </button>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={onResetFilters}
            className="hidden md:flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
            <span>Filtre ({activeFilterCount})</span>
          </button>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Dark / Light Mode Switcher Toggle Button */}
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Açık Moda Geç' : 'Koyu Moda Geç'}
          title={theme === 'dark' ? 'Açık Mod (Light)' : 'Koyu Mod (Dark)'}
          className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all text-xs font-medium shrink-0 cursor-pointer shadow-2xs"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-90 duration-300" />
              <span className="hidden xl:inline text-amber-300 font-semibold">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-emerald-600 animate-in spin-in-90 duration-300" />
              <span className="hidden xl:inline text-slate-700 font-semibold">Dark</span>
            </>
          )}
        </button>

        {/* RLS Scope Indicator Pill */}
        {user && (
          <div
            onClick={onOpenLogin}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity"
            title="Kullanıcı / Şantiye RLS Değiştirmek İçin Tıklayın"
          >
            {user.scope_type === 'region' ? (
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <MapPin className="w-3 h-3" />
                RLS: {user.scope_value}
              </span>
            ) : user.scope_type === 'project' ? (
              <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                <Briefcase className="w-3 h-3" />
                RLS: {user.scope_value}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                Tüm Şantiyeler
              </span>
            )}
          </div>
        )}

        {/* Turn Over / Include Exits Toggle */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-xl text-xs">
          <span className={`font-medium ${!includeExits ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
            Mevcut
          </span>
          <button
            type="button"
            onClick={() => setIncludeExits(!includeExits)}
            className={`w-8 h-4 flex items-center rounded-full p-0.5 transition-colors ${
              includeExits ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <div
              className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${
                includeExits ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`font-medium ${includeExits ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
            Çıkışlılar
          </span>
        </div>

        {/* Data Freshness Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-emerald-900 dark:text-emerald-200">Veri:</span>
          <span>{dataFreshness || '02.10.2026'}</span>
        </div>

        {/* Excel Upload Button */}
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors shrink-0"
          title="Excel Yükle / Güncelle"
        >
          <UploadCloud className="w-4 h-4" />
          <span className="hidden md:inline">Excel Yükle</span>
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Bildirimler"
            className="relative p-1.5 sm:p-2 rounded-xl border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Bell className="w-4 h-4" />
            {alertsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {alertsCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 sm:w-96 bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50">
              <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200">Süresi Yaklaşan Evraklar</span>
                </div>
                <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-semibold border border-rose-200/50 dark:border-rose-800/50">
                  {alertsCount} Uyarı
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                {alerts.length > 0 ? (
                  alerts.map((alert, idx) => (
                    <div key={idx} className="p-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{alert.name}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            alert.badge === 'Acil'
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {alert.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{alert.detail}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-600 dark:text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    Tüm personellerin vize ve propusk belgeleri geçerli.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1 sm:p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
              {user ? user.name.slice(0, 1) : 'H'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight truncate max-w-[120px]">
                {user ? user.name : 'Giriş Yapılmadı'}
              </p>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                {user?.role === 'admin' ? '🛡️ Yönetici' : '📍 Şantiye Sorumlusu'}
              </p>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden lg:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 z-50 space-y-1">
              {user ? (
                <>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700">
                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{user.email}</p>
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-700 flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">Erişim:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {user.scope_type === 'all' ? 'Tümü (Sınırsız)' : `${user.scope_type}: ${user.scope_value}`}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenLogin();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors text-left"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Hesap / Şantiye Değiştir</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                      onOpenLogin();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Çıkış Yap</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenLogin();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors text-left"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Giriş Yap</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
