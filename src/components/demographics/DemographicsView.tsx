'use client';

import React from 'react';
import { Globe2, Users, ShieldAlert, CheckCircle2, Award, HeartPulse } from 'lucide-react';
import { StatsData } from '@/types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface DemographicsViewProps {
  stats: StatsData | null;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

const COLORS = ['#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'];

export default function DemographicsView({ stats, onNavigateToPersonnel }: DemographicsViewProps) {
  const nationalities = stats?.nationalityDistribution || [];
  const genders = stats?.genderDistribution || [];
  const total = stats?.totalCount || 1;

  const maleCount = genders.find((g) => g.label === 'Erkek')?.count || 0;
  const femaleCount = genders.find((g) => g.label === 'Kadin')?.count || 0;
  const malePct = Math.round((maleCount / total) * 100);
  const femalePct = Math.round((femaleCount / total) * 100);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Demografi & Çalışan Profili</h1>
          <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
            Çok Uluslu Kadro
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-0.5">
          Personelin uyruk, cinsiyet, yaka türü ve çalışma kategorisi analitikleri.
        </p>
      </div>

      {/* Top Cards: Gender & Category Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Gender Breakdown */}
        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cinsiyet Dağılımı</span>
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="mt-4 flex items-center justify-around text-center">
              <div>
                <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">%{malePct}</span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">Erkek</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{maleCount.toLocaleString()} Çalışan</p>
              </div>
              <div className="h-12 w-px bg-slate-200 dark:bg-slate-700" />
              <div>
                <span className="text-3xl font-extrabold text-pink-600 dark:text-pink-400">%{femalePct}</span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">Kadın</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{femaleCount.toLocaleString()} Çalışan</p>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            Ağır sanayi & şantiye koşulları gereği kadronun büyük bölümü sahada çalışmaktadır.
          </div>
        </div>

        {/* Categories (Expat / SNG / Yerel) */}
        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Kategori Dağılımı</span>
              <Globe2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="mt-3 space-y-2">
              {(stats?.categoryDistribution || []).map((cat, idx) => {
                const cPct = Math.round((cat.count / total) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{cat.label}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {cat.count.toLocaleString()} (%{cPct})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full"
                        style={{ width: `${cPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            Ekspat ve SNG çalışanlar toplam mevcudun %93&apos;ünü oluşturmaktadır.
          </div>
        </div>

        {/* Health & HSE Status */}
        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">İSG & Sağlık Uyumu</span>
              <HeartPulse className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 text-emerald-900 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Sağlık Raporu (29n) Tam
                </span>
                <span className="font-bold">5.310 Kişi</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-indigo-50 text-indigo-900 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  HSE Eğitimi Tamamlanan
                </span>
                <span className="font-bold">5.280 Kişi</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50 text-blue-900 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  DMS Sağlık Sigortası Aktif
                </span>
                <span className="font-bold">5.195 Kişi</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
            Saha giriş onayları Propusk ve İSG kurallarına göre denetlenmektedir.
          </div>
        </div>
      </div>

        {/* DETAILED NATIONALITY LIST */}
      <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Ülkelere Göre Personel Sayıları</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Tüm uyrukların mevcuttaki dağılımı</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {nationalities.map((item, idx) => {
            const pct = ((item.count / total) * 100).toFixed(1);
            return (
              <div
                key={idx}
                onClick={() => onNavigateToPersonnel('nationality', item.label)}
                className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/40 dark:hover:bg-slate-800 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {item.label}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                    %{pct}
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
                  {item.count.toLocaleString('tr-TR')}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">Personel Listesinde Gör &rarr;</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
