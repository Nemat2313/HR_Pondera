'use client';

import React from 'react';

interface PonderaLogoProps {
  /** 'full' renders symbol + PONDERA INDUSTRY wordmark; 'mark' renders only the orbital P symbol */
  variant?: 'full' | 'mark';
  /** 'auto' adapts to Tailwind dark mode; 'dark-bg' forces crisp white for dark/TV headers; 'light-bg' forces corporate petrol #1A363E */
  tone?: 'auto' | 'dark-bg' | 'light-bg';
  /** Visual size preset */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional subtitle pill/line under INDUSTRY or beside logo */
  subtitle?: string;
  className?: string;
}

export default function PonderaLogo({
  variant = 'full',
  tone = 'auto',
  size = 'md',
  subtitle,
  className = '',
}: PonderaLogoProps) {
  const markSizes = {
    sm: 'w-7 h-8',
    md: 'w-9 h-10',
    lg: 'w-11 h-12',
    xl: 'w-13 h-14',
  };

  const titleSizes = {
    sm: 'text-[15px]',
    md: 'text-[18px]',
    lg: 'text-[22px]',
    xl: 'text-[26px]',
  };

  const industrySizes = {
    sm: 'text-[9.5px]',
    md: 'text-[11px]',
    lg: 'text-[13px]',
    xl: 'text-[15px]',
  };

  const colorClasses =
    tone === 'dark-bg'
      ? 'text-white'
      : tone === 'light-bg'
      ? 'text-[#1A363E]'
      : 'text-[#1A363E] dark:text-white';

  const subtitleClasses =
    tone === 'dark-bg'
      ? 'text-emerald-300/90'
      : tone === 'light-bg'
      ? 'text-[#1A363E]/70'
      : 'text-slate-500 dark:text-emerald-300/90';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${colorClasses} ${className}`}>
      {/* Official Pondera Industry Orbital Spire 'P' Vector Mark */}
      <svg
        viewBox="0 0 42 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${markSizes[size]} shrink-0`}
        aria-hidden="true"
      >
        {/* Upper Spire Tip (above orbital ring with crisp separation gap) */}
        <path
          d="M28.6 1.2L22.3 11.4C24.2 11.1 25.9 11.1 27.4 11.3L28.6 1.2Z"
          fill="currentColor"
        />

        {/* Tilted Crescent Orbital Ring forming the 'P' bowl */}
        <path
          d="M2.2 26.8C1.2 21.1 8.8 14.5 20.1 12.6C30.8 10.8 39.4 13.7 40.2 19.0C41.0 24.2 33.4 30.3 22.4 32.3C21.1 32.5 19.8 32.7 18.6 32.8L19.6 30.2C20.6 30.1 21.7 30.0 22.8 29.8C31.2 28.2 36.9 23.6 36.2 19.8C35.5 15.9 28.4 14.3 20.0 15.8C11.3 17.4 5.3 22.1 6.0 26.0C6.4 28.2 8.6 29.6 11.9 30.2L10.8 32.6C5.8 31.8 2.7 29.7 2.2 26.8Z"
          fill="currentColor"
        />

        {/* Main Diagonal Spire Stem piercing downward to sharp point */}
        <path
          d="M17.8 19.6H23.8L7.2 48.8L17.8 19.6Z"
          fill="currentColor"
        />
      </svg>

      {variant === 'full' && (
        <div className="flex flex-col leading-none">
          <span
            className={`${titleSizes[size]} font-extrabold tracking-[0.045em] uppercase leading-none`}
            style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
          >
            PONDERA
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`${industrySizes[size]} font-bold tracking-[0.09em] uppercase leading-none opacity-95`}
              style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
            >
              INDUSTRY
            </span>
            {subtitle && (
              <span className={`text-[10px] font-semibold tracking-normal normal-case ${subtitleClasses}`}>
                • {subtitle}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

