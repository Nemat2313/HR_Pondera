'use client';

import React from 'react';

export interface WindowsTabItem {
  id: string;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
  accent?: 'emerald' | 'indigo' | 'amber' | 'sky';
  title?: string;
}

interface WindowsTabBarProps {
  tabs: WindowsTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

const ACCENT_TOP: Record<string, string> = {
  emerald: 'border-t-emerald-600 dark:border-t-emerald-400',
  indigo: 'border-t-indigo-600 dark:border-t-indigo-400',
  amber: 'border-t-amber-500 dark:border-t-amber-400',
  sky: 'border-t-sky-600 dark:border-t-sky-400',
};

const ACCENT_BADGE_ACTIVE: Record<string, string> = {
  emerald:
    'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/40',
  indigo:
    'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40',
  amber:
    'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40',
  sky:
    'bg-sky-50 dark:bg-sky-500/20 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-500/40',
};

export default function WindowsTabBar({
  tabs,
  activeId,
  onChange,
  className = '',
}: WindowsTabBarProps) {
  const colsClass =
    tabs.length === 2
      ? 'grid-cols-2'
      : tabs.length === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : 'grid-cols-2 lg:grid-cols-4';

  return (
    <div
      role="tablist"
      className={`grid ${colsClass} gap-1 px-1.5 pt-1.5 bg-slate-200/85 dark:bg-[#0B1528] rounded-t-2xl border border-b border-slate-300/90 dark:border-slate-600/80 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const accent = tab.accent || 'indigo';
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={tab.title || tab.label}
            onClick={() => onChange(tab.id)}
            className={`group relative h-10 px-3 sm:px-4 rounded-t-xl text-xs sm:text-[13px] flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
              isActive
                ? `bg-white dark:bg-[#172845] text-slate-950 dark:text-white border-t-2 border-x ${ACCENT_TOP[accent]} border-x-slate-300 dark:border-x-slate-500/80 shadow-xs -mb-px z-10`
                : 'bg-slate-100/80 dark:bg-[#0F1D34]/90 text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-[#142542] hover:text-slate-950 dark:hover:text-white border border-transparent border-b-0'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span className="truncate">{tab.label}</span>
            </span>
            {tab.badge !== undefined && tab.badge !== '' && (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-md shrink-0 ${
                  isActive
                    ? ACCENT_BADGE_ACTIVE[accent]
                    : 'bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
