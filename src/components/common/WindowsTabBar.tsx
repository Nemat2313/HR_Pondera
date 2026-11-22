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
  rightSlot?: React.ReactNode;
}

export default function WindowsTabBar({
  tabs,
  activeId,
  onChange,
  className = '',
  rightSlot,
}: WindowsTabBarProps) {
  return (
    <div
      role="tablist"
      className={`pondera-ribbon-bar ${rightSlot ? 'justify-between' : ''} ${className}`}
    >
      <div className="flex flex-wrap items-end">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={tab.title || tab.label}
              onClick={() => onChange(tab.id)}
              style={{ zIndex: isActive ? 30 : 20 - idx }}
              className={`pondera-ribbon-tab ${
                isActive ? 'pondera-ribbon-tab--active' : 'pondera-ribbon-tab--inactive'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                {tab.icon && <span className="shrink-0 opacity-90">{tab.icon}</span>}
                <span className="truncate">{tab.label}</span>
              </span>
              {tab.badge !== undefined && tab.badge !== '' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    isActive
                      ? 'bg-emerald-100 dark:bg-teal-500/25 text-emerald-900 dark:text-teal-200 border border-emerald-300/80 dark:border-teal-400/40'
                      : 'bg-black/20 dark:bg-black/35 text-white/95 border border-white/15'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightSlot && <div className="ml-auto pb-1.5 pr-1 flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
