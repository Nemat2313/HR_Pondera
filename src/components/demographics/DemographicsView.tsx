'use client';

import React from 'react';
import { Globe2, Users, HeartPulse, CheckCircle2, Award } from 'lucide-react';
import { StatsData } from '@/types';
import WorldDemographicsMap from './WorldDemographicsMap';
import { useLanguage } from '@/context/LanguageContext';

interface DemographicsViewProps {
  stats: StatsData | null;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

export default function DemographicsView({ stats, onNavigateToPersonnel }: DemographicsViewProps) {
  const { lang, translateVal } = useLanguage();
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {lang === 'ru' ? 'Демография и профиль сотрудников' : 'Demografi & Çalışan Profili'}
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-semibold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200/50 dark:border-teal-800/50">
            {lang === 'ru' ? 'Многонациональный штат' : 'Çok Uluslu Kadro'}
          </span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          {lang === 'ru'
            ? 'Интерактивная карта гражданств персонала, соотношение полов, категории воротничков и статусы занятости.'
            : 'Personelin küresel uyruk haritası, cinsiyet oranları, yaka türü ve çalışma kategorisi analitikleri.'}
        </p>
      </div>

      {/* Top Cards: Gender, Category & HSE Compliance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Gender Breakdown */}
        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {lang === 'ru' ? 'Распределение по полу' : 'Cinsiyet Dağılımı'}
              </span>
              <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="mt-4 flex items-center justify-around text-center">
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
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? 'Ввиду специфики тяжелого промышленного строительства основная часть персонала работает на стройплощадках.'
              : 'Ağır sanayi & şantiye koşulları gereği kadronun büyük bölümü sahada çalışmaktadır.'}
          </div>
        </div>

        {/* Categories (Expat / SNG / Yerel) */}
        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {lang === 'ru' ? 'Распределение по категориям' : 'Kategori Dağılımı'}
              </span>
              <Globe2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3 space-y-2">
              {(stats?.categoryDistribution || []).map((cat, idx) => {
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
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? 'Экспаты и граждане СНГ составляют 93% всего персонала.'
              : "Ekspat ve SNG çalışanlar toplam mevcudun %93'ünü oluşturmaktadır."}
          </div>
        </div>

        {/* Health & HSE Status */}
        <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {lang === 'ru' ? 'ОТ, ТБ и медосмотры' : 'İSG & Sağlık Uyumu'}
              </span>
              <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  {lang === 'ru' ? 'Медосмотр (Приказ 29н) пройден' : 'Sağlık Raporu (29n) Tam'}
                </span>
                <span className="font-bold">5.310 {lang === 'ru' ? 'чел.' : 'Kişi'}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-300 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  {lang === 'ru' ? 'Обучение по ОТ и ТБ пройдено' : 'HSE Eğitimi Tamamlanan'}
                </span>
                <span className="font-bold">5.280 {lang === 'ru' ? 'чел.' : 'Kişi'}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  {lang === 'ru' ? 'Полис ДМС активен' : 'DMS Sağlık Sigortası Aktif'}
                </span>
                <span className="font-bold">5.195 {lang === 'ru' ? 'чел.' : 'Kişi'}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ru'
              ? 'Допуски на объект контролируются по пропускам и нормам ОТ/ТБ.'
              : 'Saha giriş onayları Propusk ve İSG kurallarına göre denetlenmektedir.'}
          </div>
        </div>
      </div>

      {/* Interactive Global World Map & Enhanced Country Flag Cards */}
      <WorldDemographicsMap
        nationalities={nationalities}
        totalEmployees={total}
        onNavigateToPersonnel={onNavigateToPersonnel}
      />
    </div>
  );
}
