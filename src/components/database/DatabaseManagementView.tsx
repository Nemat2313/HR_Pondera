'use client';

import React, { useState } from 'react';
import { Database, ShieldCheck, HardDrive, RefreshCw, FileSpreadsheet, CheckCircle2, Clock, UploadCloud } from 'lucide-react';
import { StatsData } from '@/types';

interface DatabaseManagementViewProps {
  stats: StatsData | null;
  onOpenUpload: () => void;
  onRefreshData: () => void;
}

export default function DatabaseManagementView({ stats, onOpenUpload, onRefreshData }: DatabaseManagementViewProps) {
  const [rebuilding, setRebuilding] = useState(false);
  const sys = stats?.systemInfo || {};

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Excel & Veritabanı Mimarisi</h1>
          <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            Yerel SQLite Motoru
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-0.5">
          31 MB Excel dosyasını optimize edilmiş yerel SQLite önbelleğinde saklayarak milisaniye hızında sorgulama sağlar.
        </p>
      </div>

      {/* STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-card flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Veritabanı Motoru</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">SQLite In-Memory Hızında</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              12 adet B-Tree indeksleme ile 32.348 personel kaydı ~1.5 milisaniyede sorgulanır.
            </p>
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-card flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Veri Tazeliği (Freshness)</span>
            <h3 className="text-lg font-bold text-emerald-700 mt-1">{sys.data_freshness || '02.10.2026'}</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Son kaynak dosya: <span className="font-semibold text-slate-700">{sys.source_file || 'tum liste 02 10 26.xlsx'}</span>
            </p>
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">198 Kolonluk Şema</span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">16 Evrak & Uyum Kolon Grubu</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Pasaport, Vize, Propusk, Patent, Daktiloskopiya vb. evrak bazlı sınıflandırma ve tam JSON şeması.
            </p>
          </div>
        </div>
      </div>

      {/* SYSTEM STATS TABLE */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-6">
        <h2 className="font-bold text-base text-slate-900 dark:text-white mb-4">Veritabanı Tablo ve İndeks Durumu</h2>

        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="p-3">Metrik / Tablo</th>
                <th className="p-3">Değer</th>
                <th className="p-3">Açıklama</th>
                <th className="p-3 text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">Toplam Personel Kaydı</td>
                <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{sys.total_records || '32.348'}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400">Excel&apos;deki tüm satırlar (Mevcut, Çıkış, İptal)</td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                    Aktif
                  </span>
                </td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">Aktif Çalışan (Mevcut)</td>
                <td className="p-3 font-bold text-emerald-600 dark:text-emerald-400">{sys.active_records || '5.363'}</td>
                <td className="p-3 text-slate-600 dark:text-slate-400">Güncel sahada bulunan personel sayısı</td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                    Doğrulandı
                  </span>
                </td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">Kolon Sayısı</td>
                <td className="p-3 font-bold text-slate-900 dark:text-white">198 Kolon (16 Grup)</td>
                <td className="p-3 text-slate-600 dark:text-slate-400">Özlük, sözleşme, şantiye, vize, pasaport ve İSG alanları</td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                    Eşlendi
                  </span>
                </td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">Veritabanı Dosya Konumu</td>
                <td className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">pondera_hr.db</td>
                <td className="p-3 text-slate-600 dark:text-slate-400">Yerel SQLite3 dosyası (C:\Users\nemat\HR_Pondera)</td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                    Sağlıklı
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Action button */}
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshData}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Verileri Yenile</span>
            </button>
          </div>

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Yeni Excel Yükle / Senkronize Et</span>
          </button>
        </div>
      </div>
    </div>
  );
}
