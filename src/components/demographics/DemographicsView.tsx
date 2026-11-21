'use client';

import React, { useEffect, useState } from 'react';
import { Globe2, Users, HeartPulse, CheckCircle2 } from 'lucide-react';
import { StatsData } from '@/types';
import WorldDemographicsMap from './WorldDemographicsMap';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

interface DemographicsViewProps {
  stats: StatsData | null;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

interface LiveHealthMini {
  health29nDone: number;
  health29nPct: number;
  hseDone: number;
  hsePct: number;
  dmsActive: number;
  dmsPct: number;
}

export default function DemographicsView({ stats, onNavigateToPersonnel }: DemographicsViewProps) {
  const { lang, translateVal } = useLanguage();
  const { user, getAuthHeaders } = useAuth();
  const [liveHealth, setLiveHealth] = useState<LiveHealthMini | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/report-proposals', { cache: 'no-store', headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.success && json?.healthHse) {
          setLiveHealth({
            health29nDone: json.healthHse.health29nDone,
            health29nPct: json.healthHse.health29nPct,
            hseDone: json.healthHse.hseDone,
            hsePct: json.healthHse.hsePct,
            dmsActive: json.healthHse.dmsActive,
            dmsPct: json.healthHse.dmsPct,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.scope_type, user?.scope_value]);

  const nationalities = stats?.nationalityDistribution || [];
  const genders = stats?.genderDistribution || [];
  const categories = stats?.categoryDistribution || [];
  const total = stats?.totalCount || 1;

  const maleCount = genders.find((g) => g.label === 'Erkek')?.count || 0;
  const femaleCount = genders.find((g) => g.label === 'Kadin')?.count || 0;
  const malePct = Math.round((maleCount / total) * 100);
  const femalePct = Math.round((femaleCount / total) * 100);

  const expatSngCount = categories
    .filter((c) => /ekspat|expat|sng/i.test(c.label))
    .reduce((sum, c) => sum + c.count, 0);
  const expatSngPct = Math.round((expatSngCount / total) * 100);

  return (
    <div className="pt-3 px-4 lg:px-6 pb-6 space-y-4">
      {/* Unified Green-to-White Gradient Header */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border border-emerald-200/70 dark:border-slate-700/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
            {lang === 'ru' ? 'Демография и профиль сотрудников' : 'Demografi & Çalışan Profili'}
          </h1>
          <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-full border border-emerald-300/60 dark:border-emerald-800/60">
            {lang === 'ru' ? 'Многонациональный штат' : 'Çok Uluslu Kadro'}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {lang === 'ru'
            ? 'Интерактивная карта гражданств персонала, соотношение полов и статусы занятости.'
            : 'Personelin küresel uyruk haritası, cinsiyet oranları ve canlı İSG/Sağlık uyumu.'}
        </p>
      </div>

      {/* 1. Interactive Global World Map & Country Flag Cards */}
      <WorldDemographicsMap
        nationalities={nationalities}
        totalEmployees={total}
        onNavigateToPersonnel={onNavigateToPersonnel}
      />

      {/* 2. Summary Cards Below Map: Gender, Category & Live HSE Compliance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Gender Breakdown */}
        <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                {lang === 'ru' ? 'Распределение по полу' : 'Cinsiyet Dağılımı'}
              </span>
              <Users className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div className="p-5 flex items-center justify-around text-center">
              <div>
                <span className="text-3xl font-extrabold text-teal-600 dark:text-teal-400">%{malePct}</span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {lang === 'ru' ? 'Мужчины' : 'Erkek'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {maleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Çalışan'}
                </p>
              </div>
              <div className="h-12 w-px bg-slate-200 dark:bg-slate-700" />
              <div>
                <span className="text-3xl font-extrabold text-violet-600 dark:text-violet-400">%{femalePct}</span>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {lang === 'ru' ? 'Женщины' : 'Kadın'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {femaleCount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} {lang === 'ru' ? 'чел.' : 'Çalışan'}
                </p>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? 'Ввиду специфики тяжелого промышленного строительства основная часть персонала работает на стройплощадках.'
              : 'Ağır sanayi & şantiye koşulları gereği kadronun büyük bölümü sahada çalışmaktadır.'}
          </div>
        </div>

        {/* Categories (Expat / SNG / Yerel) */}
        <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                {lang === 'ru' ? 'Распределение по категориям' : 'Kategori Dağılımı'}
              </span>
              <Globe2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div className="p-4 space-y-2.5">
              {categories.map((cat, idx) => {
                const cPct = Math.round((cat.count / total) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {translateVal(cat.label)}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {cat.count.toLocaleString(lang === 'ru' ? 'ru-RU' : 'tr-TR')} (%{cPct})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full"
                        style={{ width: `${cPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? `Экспаты и граждане СНГ составляют ${expatSngPct}% всего персонала.`
              : `Ekspat ve SNG çalışanlar toplam mevcudun %${expatSngPct}'ini oluşturmaktadır.`}
          </div>
        </div>

        {/* Live Health & HSE Status (Real SQLite counts!) */}
        <div className="bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between overflow-hidden">
          <div>
            <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                {lang === 'ru' ? 'ОТ, ТБ и медосмотры (Live)' : 'İSG & Sağlık Uyumu (Canlı)'}
              </span>
              <HeartPulse className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {lang === 'ru' ? 'Медосмотр (Приказ 29н)' : 'Sağlık Raporu (29n) Kayıtlı'}
                </span>
                <span className="font-extrabold">
                  {liveHealth
                    ? `${liveHealth.health29nDone.toLocaleString('tr-TR')} (%${liveHealth.health29nPct})`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  {lang === 'ru' ? 'Полис ДМС активен' : 'DMS Sağlık Sigortası Kayıtlı'}
                </span>
                <span className="font-extrabold">
                  {liveHealth
                    ? `${liveHealth.dmsActive.toLocaleString('tr-TR')} (%${liveHealth.dmsPct})`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  {lang === 'ru' ? 'Обучение по ОТ и ТБ' : 'HSE Eğitimi Kayıtlı'}
                </span>
                <span className="font-extrabold">
                  {liveHealth
                    ? `${liveHealth.hseDone.toLocaleString('tr-TR')} (%${liveHealth.hsePct})`
                    : '—'}
                </span>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? 'Данные обновляются напрямую из 198 колонок eBA в реальном времени.'
              : 'Rakamlar canlı eBA 198 kolon veritabanından anlık olarak hesaplanır.'}
          </div>
        </div>
      </div>
    </div>
  );
}
