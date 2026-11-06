'use client';

import React, { useEffect } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = String(error?.message || '');
    const isChunkOrNet =
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch') ||
      msg.includes('imported module');

    if (isChunkOrNet && typeof window !== 'undefined') {
      try {
        const lastReload = Number(sessionStorage.getItem('pondera_chunk_reload_at') || '0');
        if (Date.now() - lastReload > 15000) {
          sessionStorage.setItem('pondera_chunk_reload_at', String(Date.now()));
          window.location.reload();
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B1120] flex items-center justify-center p-6">
      <div className="max-w-md w-full p-6 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-lg text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto">
          <WifiOff className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Ağ Bağlantısı Değişti veya Yeni Sürüm Yüklendi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Sayfa modülü yüklenirken ağ/VPN geçişi algılandı veya sunucuda yeni bir güncelleme devreye alındı. Devam etmek için sayfayı yenileyin.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-100 hover:bg-emerald-200/80 dark:bg-emerald-500/25 text-emerald-950 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-500/40 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sayfayı Yenile ve Devam Et</span>
          </button>
        </div>
      </div>
    </div>
  );
}

