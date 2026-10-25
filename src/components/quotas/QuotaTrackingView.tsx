'use client';

import React, { useState } from 'react';
import {
  PieChart,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  Download,
  Info,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface QuotaItem {
  id: string;
  profession: string;
  professionRu: string;
  allocated: number;
  used: number;
  in_progress: number;
  remaining: number;
  site: string;
  siteRu: string;
  expiry_date: string;
}

const SAMPLE_QUOTAS: QuotaItem[] = [
  {
    id: 'Q-01',
    profession: 'Boru ve Çelik Montaj Ustası',
    professionRu: 'Монтажник технологических трубопроводов',
    allocated: 450,
    used: 410,
    in_progress: 25,
    remaining: 15,
    site: 'Kazan Gaz Kimya',
    siteRu: 'Казань Газ-Химия',
    expiry_date: '31.12.2026',
  },
  {
    id: 'Q-02',
    profession: 'Kombine Kaynakçı (6G TIG/MIG)',
    professionRu: 'Электрогазосварщик 6-го разряда',
    allocated: 350,
    used: 320,
    in_progress: 18,
    remaining: 12,
    site: 'Svobodny AGHK',
    siteRu: 'Свободный АГХК',
    expiry_date: '31.12.2026',
  },
  {
    id: 'Q-03',
    profession: 'Saha İnşaat Mühendisi',
    professionRu: 'Инженер по строительному контролю',
    allocated: 120,
    used: 85,
    in_progress: 15,
    remaining: 20,
    site: 'Tüm Şantiyeler (Genel)',
    siteRu: 'Все объекты (Центральный)',
    expiry_date: '31.12.2026',
  },
  {
    id: 'Q-04',
    profession: 'Endüstriyel Elektrik Teknisyeni',
    professionRu: 'Электромонтажник по силовым сетям',
    allocated: 280,
    used: 195,
    in_progress: 40,
    remaining: 45,
    site: 'Ust Luga Kompleksi',
    siteRu: 'Усть-Луга Комплекс',
    expiry_date: '31.12.2026',
  },
  {
    id: 'Q-05',
    profession: 'Ağır İş Makinesi / Vinç Operatörü',
    professionRu: 'Машинист крана автомобильного',
    allocated: 160,
    used: 120,
    in_progress: 20,
    remaining: 20,
    site: 'Tobolsk DGP-2',
    siteRu: 'Тобольск ДГП-2',
    expiry_date: '31.12.2026',
  },
  {
    id: 'Q-06',
    profession: 'İskele Kurulum Ustası (Scaffolder)',
    professionRu: 'Монтажник строительных лесов',
    allocated: 490,
    used: 290,
    in_progress: 92,
    remaining: 108,
    site: 'Svobodny AGHK',
    siteRu: 'Свободный АГХК',
    expiry_date: '31.12.2026',
  },
];

export default function QuotaTrackingView() {
  const { lang } = useLanguage();
  const [selectedSite, setSelectedSite] = useState<string>('all');

  const totalAllocated = SAMPLE_QUOTAS.reduce((s, q) => s + q.allocated, 0);
  const totalUsed = SAMPLE_QUOTAS.reduce((s, q) => s + q.used, 0);
  const totalInProgress = SAMPLE_QUOTAS.reduce((s, q) => s + q.in_progress, 0);
  const totalRemaining = SAMPLE_QUOTAS.reduce((s, q) => s + q.remaining, 0);
  const overallRate = Math.round((totalUsed / totalAllocated) * 100);

  const filtered =
    selectedSite === 'all'
      ? SAMPLE_QUOTAS
      : SAMPLE_QUOTAS.filter((q) => q.site.includes(selectedSite) || q.siteRu.includes(selectedSite));

  return (
    <div className="p-6 lg:p-8 space-y-6 font-normal max-w-7xl mx-auto">
      {/* Header & Purpose Guide Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-50/90 via-white to-emerald-50/60 dark:from-slate-900 dark:via-teal-950 dark:to-slate-900 border border-teal-100 dark:border-slate-800 text-slate-900 dark:text-white shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-400/30 flex items-center justify-center">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-slate-900 dark:text-white">
                  {lang === 'ru'
                    ? 'Центр мониторинга и распределения квот на работу (РНР / ВКС)'
                    : 'Yasal Çalışma Kotaları Kullanım & Takip Merkezi'}
                </h1>
                <span className="px-2 py-0.5 text-[11px] rounded bg-teal-100 dark:bg-teal-500/30 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-400/30 font-normal">
                  {lang === 'ru' ? 'Квотный период 2026' : '2026 Kota Dönemi'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl font-normal leading-relaxed">
                {lang === 'ru'
                  ? 'Контроль использования квот Министерства труда РФ и региональных квот: остатки, занятые места, бронирование виз и сроки действия разрешений.'
                  : 'Rusya Federasyonu Çalışma Bakanlığı ve bölgesel makamlardan alınan yabancı işçi kotalarının meslek, şantiye ve kalan kontenjan bazında canlı tüketim analitiği.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-teal-50 dark:bg-white/10 dark:hover:bg-white/20 text-teal-700 dark:text-white text-xs border border-teal-200 dark:border-white/20 transition-all cursor-pointer font-normal shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Выгрузить отчет по квотам' : 'Kota Raporu İndir (Excel)'}</span>
            </button>
          </div>
        </div>

        {/* Explainability Pill: What is this page? */}
        <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-white/5 border border-teal-100 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5 font-normal">
          <Info className="w-4 h-4 text-teal-600 dark:text-teal-300 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-900 dark:text-white font-normal">
              {lang === 'ru' ? 'Для чего этот раздел?' : 'Bu sayfa ne işe yarar?'}
            </strong>{' '}
            {lang === 'ru'
              ? 'Отслеживает процент использования официальных квот на привлечение иностранной рабочей силы (РНР и ВКС). Показывает, по каким профессиям квота исчерпана, на какие должности можно оформлять новые визы и предотвращает риски "сгорания" квот в конце года.'
              : 'Şirketimizin inşaat projelerine tahsis edilen resmi yabancı işçi kotalarının doluluk oranını izler. Hangi meslekte kota bittiğini, hangi pozisyona yeni vize başvurusu yapılabileceğini ve yıl sonu kota yanma risklerini önceden bildirir.'}
          </div>
        </div>
      </div>

      {/* KPI Cards: High-Level Quota Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Всего выделено квот' : 'Toplam Tahsis Edilen Kota'}</span>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">
            {totalAllocated.toLocaleString('tr-TR')}{' '}
            <span className="text-xs text-slate-400">{lang === 'ru' ? 'мест' : 'Kontenjan'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Утверждено Минтруда РФ и МВД' : 'MVD & Çalışma Bakanlığı Onaylı'}
          </p>
        </div>

        {/* KPI 2 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Использовано / В штате' : 'Kullanılan / İşe Alınan'}</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-2xl text-teal-600 dark:text-teal-400 font-normal">
            {totalUsed.toLocaleString('tr-TR')}{' '}
            <span className="text-xs text-teal-600 dark:text-teal-400">({overallRate}%)</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Фактически работающие иностранцы' : 'Sahada çalışan aktif yabancı personel'}
          </p>
        </div>

        {/* KPI 3 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'В резерве / Оформление виз' : 'Rezerve / Vize Sürecinde'}</span>
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl text-amber-600 dark:text-amber-400 font-normal">
            {totalInProgress.toLocaleString('tr-TR')}{' '}
            <span className="text-xs text-amber-600 dark:text-amber-400">{lang === 'ru' ? 'заявок' : 'Başvuru'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Забронировано под въездные визы' : 'Giriş vizesi bekleyen rezerve kotalar'}
          </p>
        </div>

        {/* KPI 4 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Свободный остаток квот' : 'Kalan Boş Kontenjan'}</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400 font-normal">
            {totalRemaining.toLocaleString('tr-TR')}{' '}
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{lang === 'ru' ? 'мест' : 'Kapasite'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Доступно для нового найма' : 'Hemen kullanıma hazır açık kontenjan'}
          </p>
        </div>
      </div>

      {/* Quota Breakdown Table Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Table Header Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm text-slate-900 dark:text-white font-normal">
              {lang === 'ru'
                ? 'Таблица использования квот по должностям'
                : 'Meslek ve Pozisyon Bazlı Kota Doluluk Tablosu'}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal">
              {lang === 'ru' ? `${filtered.length} категорий профессий` : `${filtered.length} Meslek Kategorisi`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              {lang === 'ru' ? 'Объект:' : 'Şantiye:'}
            </span>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-teal-500 text-slate-800 dark:text-slate-200 font-normal cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Все объекты' : 'Tüm Şantiyeler'}
              </option>
              <option value="Kazan" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Казань Газ-Химия' : 'Kazan Gaz Kimya'}
              </option>
              <option value="Svobodny" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Свободный АГХК' : 'Svobodny AGHK'}
              </option>
              <option value="Ust Luga" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Усть-Луга Комплекс' : 'Ust Luga Kompleksi'}
              </option>
              <option value="Tobolsk" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {lang === 'ru' ? 'Тобольск ДГП-2' : 'Tobolsk DGP-2'}
              </option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 font-normal">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-normal">
              <tr>
                <th className="py-3 px-4">{lang === 'ru' ? 'Профессия / Должность' : 'Meslek / Pozisyon Adı'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Объект' : 'Şantiye'}</th>
                <th className="py-3 px-4 text-center">{lang === 'ru' ? 'Квота' : 'Tahsis'}</th>
                <th className="py-3 px-4 text-center">{lang === 'ru' ? 'Занято' : 'Kullanılan'}</th>
                <th className="py-3 px-4 text-center">{lang === 'ru' ? 'В процессе' : 'Rezerve'}</th>
                <th className="py-3 px-4 text-center">{lang === 'ru' ? 'Остаток' : 'Kalan Boş'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Заполняемость' : 'Doluluk Oranı'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Срок действия' : 'Son Geçerlilik'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((row) => {
                const fillPct = Math.round((row.used / row.allocated) * 100);
                const isCritical = row.remaining <= 15;

                return (
                  <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="text-slate-900 dark:text-white font-normal">
                        {lang === 'ru' ? row.professionRu : row.profession}
                      </div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        {lang === 'ru' ? row.profession : row.professionRu}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-normal">
                      {lang === 'ru' ? row.siteRu : row.site}
                    </td>
                    <td className="py-3 px-4 text-center font-normal text-slate-900 dark:text-white">
                      {row.allocated}
                    </td>
                    <td className="py-3 px-4 text-center font-normal text-teal-600 dark:text-teal-400">
                      {row.used}
                    </td>
                    <td className="py-3 px-4 text-center font-normal text-amber-600 dark:text-amber-400">
                      {row.in_progress}
                    </td>
                    <td className="py-3 px-4 text-center font-normal">
                      <span className={isCritical ? 'text-rose-600 dark:text-rose-400 font-normal' : 'text-emerald-600 dark:text-emerald-400 font-normal'}>
                        {row.remaining}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-32 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className={isCritical ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}>
                            %{fillPct}
                          </span>
                          {isCritical && (
                            <span className="text-rose-600 dark:text-rose-400 text-[9px]">
                              {lang === 'ru' ? 'Критично мало' : 'Kritik Azaldı'}
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isCritical ? 'bg-rose-500' : fillPct > 80 ? 'bg-amber-500' : 'bg-teal-500'
                            }`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      {row.expiry_date}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
