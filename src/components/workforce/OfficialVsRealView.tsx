'use client';

import React, { useState } from 'react';
import {
  Scale,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Users,
  Download,
  Filter,
  Search,
  ArrowRight,
  TrendingDown,
  Info,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface DiscrepancyRow {
  sicil_no: string;
  name: string;
  uyruk: string;
  santiye: string;
  firma: string;
  gorev: string;
  official_status: 'Onaylı (Bildirildi)' | 'Süreçte' | 'Bildirilmedi';
  real_status: 'Sahada Aktif (Turnike)' | 'Sahada Giriş Yok' | 'Turnike Kartı İhlali';
  risk: 'Dusuk' | 'Orta' | 'Kritik';
  note: string;
}

const SAMPLE_COMPARISONS: DiscrepancyRow[] = [
  {
    sicil_no: 'TR-10842',
    name: 'MEHMET YILMAZ',
    uyruk: 'Türkiye',
    santiye: 'Kazan Gaz Kimya',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Boru Montaj Ustası',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Dusuk',
    note: 'Resmi МВД ve fiili turnike kaydı %100 tam eşleşti.',
  },
  {
    sicil_no: 'UZ-84920',
    name: 'SHAVKAT RAKHMATOV',
    uyruk: 'Özbekistan',
    santiye: 'Svobodny AGHK',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'İskele Montajcısı',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Dusuk',
    note: 'Resmi Gosuslugi bildirimi tamam, sahada çalışıyor.',
  },
  {
    sicil_no: 'IN-73625',
    name: 'RAJESH KUMAR',
    uyruk: 'Hindistan',
    santiye: 'Ust Luga Kompleksi',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Kaynak Uzmanı (6G)',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Giriş Yok',
    risk: 'Orta',
    note: 'Resmi kaydı aktif ancak son 14 gündür şantiye turnikesinde giriş yok (İzin/Rapor sorgulanmalı).',
  },
  {
    sicil_no: 'AZ-48291',
    name: 'ELNUR MEMMEDOV',
    uyruk: 'Azerbaycan',
    santiye: 'Kazan Gaz Kimya',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Elektrik Formen',
    official_status: 'Süreçte',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Kritik',
    note: 'Yasal bildirim МВД sürecinde onay beklerken sahada turnike geçişi tespit edildi (Yasal risk).',
  },
  {
    sicil_no: 'RU-19402',
    name: 'ALEKSEY IVANOV',
    uyruk: 'Rusya',
    santiye: 'Tobolsk DGP-2',
    firma: 'ENKA TAŞERON',
    gorev: 'Vinç Operatörü',
    official_status: 'Bildirilmedi',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Kritik',
    note: 'Taşeron firma bildirimi sisteme girmemiş, acil propusk durdurma gerektirir.',
  },
  {
    sicil_no: 'KG-55214',
    name: 'BAKYTBEK ASANOV',
    uyruk: 'Kırgızistan',
    santiye: 'Svobodny AGHK',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Kalıpçı Ustası',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Dusuk',
    note: 'Avrasya Birliği (EAEU) bildirimi ve saha propusk tam uyumlu.',
  },
];

export default function OfficialVsRealView() {
  const { lang } = useLanguage();
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const filtered = SAMPLE_COMPARISONS.filter((row) => {
    if (filterRisk !== 'all' && row.risk !== filterRisk) return false;
    if (search && !row.name.toLowerCase().includes(search.toLowerCase()) && !row.sicil_no.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 font-normal max-w-7xl mx-auto">
      {/* Header & Purpose Guide Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-white">
                  {lang === 'ru'
                    ? 'Сверка официальных и фактических данных персонала'
                    : 'Resmi ve Real Personel Veri Karşılaştırma Merkezi'}
                </h1>
                <span className="px-2 py-0.5 text-[11px] rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-normal">
                  Çapraz Denetim
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl font-normal leading-relaxed">
                {lang === 'ru'
                  ? 'Сравнение официальных списков (Госуслуги МВД, трудовые договоры, EBA) с реальными данными строительной площадки (турникеты, табели). Выявление рисков нелегальной работы и расхождений.'
                  : 'Gosuslugi МВД resmi bildirimleri ve yasal bordro kayıtları ile şantiyedeki fiili turnike ve formen saha verilerini karşılaştırarak yasal uyumsuzluk ve denetim risklerini sıfıra indiren kontrol merkezi.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs border border-white/20 transition-all cursor-pointer font-normal"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Экспорт отчета сверки' : 'Karşılaştırma Raporu (Excel)'}</span>
            </button>
          </div>
        </div>

        {/* Explainability Pill: What is this page? */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 flex items-start gap-2.5 font-normal">
          <Info className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white font-normal">Bu sayfa ne işe yarar?</strong> Şantiyelerde resmi kurumlara (MVD / Gosuslugi) bildirilen işçiler ile sahada bilfiil çalışan işçiler arasındaki kaçak işçi, bildirilmemiş taşeron, izinsiz çalışma veya resmi kaydı olup sahada bulunmayan &quot;hayalet personel&quot; farklarını anlık tespit eder.
          </div>
        </div>
      </div>

      {/* KPI Cards: High-Level Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Resmi Bildirilen Kadro</span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">5.013 <span className="text-xs text-slate-400">Kişi</span></div>
          <p className="text-[11px] text-slate-500 font-normal">Gosuslugi МВД & EBA resmi sicilleri</p>
        </div>

        {/* KPI 2 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Sahada Fiili (Real) Kadro</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">4.880 <span className="text-xs text-slate-400">Kişi</span></div>
          <p className="text-[11px] text-slate-500 font-normal">Turnikeden geçen aktif işçiler</p>
        </div>

        {/* KPI 3 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>%100 Tam Uyumlu</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400 font-normal">4.750 <span className="text-xs text-emerald-600">(%97.3)</span></div>
          <p className="text-[11px] text-slate-500 font-normal">Hem resmi hem sahada onaylı</p>
        </div>

        {/* KPI 4 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>Kritik Sapma & Risk</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-2xl text-rose-600 dark:text-rose-400 font-normal">130 <span className="text-xs text-rose-600">Riskli</span></div>
          <p className="text-[11px] text-slate-500 font-normal">Sahada var / resmi bildirimi eksik</p>
        </div>
      </div>

      {/* Main Comparison Table Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
        {/* Table Header Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm text-slate-900 dark:text-white font-normal">
              Çapraz Karşılaştırma Denetim Listesi
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal">
              {filtered.length} Kayıt
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Personel veya Sicil Ara..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200 font-normal"
              />
            </div>

            {/* Risk Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-normal">
              <button
                type="button"
                onClick={() => setFilterRisk('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Tümü
              </button>
              <button
                type="button"
                onClick={() => setFilterRisk('Kritik')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'Kritik' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                }`}
              >
                Kritik (Riskli)
              </button>
              <button
                type="button"
                onClick={() => setFilterRisk('Orta')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'Orta' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
                }`}
              >
                Orta Sapma
              </button>
              <button
                type="button"
                onClick={() => setFilterRisk('Dusuk')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'Dusuk' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
                }`}
              >
                Tam Uyumlu
              </button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 font-normal">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-normal">
              <tr>
                <th className="py-3 px-4">Sicil & Personel</th>
                <th className="py-3 px-4">Şantiye & Firma</th>
                <th className="py-3 px-4">Resmi Durum (MVD / EBA)</th>
                <th className="py-3 px-4">Real Durum (Turnike)</th>
                <th className="py-3 px-4">Risk Seviyesi</th>
                <th className="py-3 px-4">Açıklama / Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="text-slate-900 dark:text-white font-normal">{row.name}</div>
                    <div className="text-[11px] text-slate-400 font-normal">{row.sicil_no} • {row.uyruk}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-800 dark:text-slate-200 font-normal">{row.santiye}</div>
                    <div className="text-[11px] text-slate-500 font-normal">{row.firma}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal ${
                        row.official_status === 'Onaylı (Bildirildi)'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : row.official_status === 'Süreçte'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {row.official_status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal ${
                        row.real_status === 'Sahada Aktif (Turnike)'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {row.real_status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-normal ${
                        row.risk === 'Dusuk'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : row.risk === 'Orta'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {row.risk === 'Dusuk' ? 'Uyumlu' : row.risk === 'Orta' ? 'Orta Risk' : 'Kritik Risk'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 font-normal">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
