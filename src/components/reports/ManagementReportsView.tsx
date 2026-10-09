'use client';

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileSpreadsheet,
  AlertCircle,
  Briefcase,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { StatsData } from '@/types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { useLanguage } from '@/context/LanguageContext';

interface ManagementReportsViewProps {
  stats: StatsData | null;
  onNavigateToPersonnel: (filterType?: string, filterValue?: string) => void;
}

export default function ManagementReportsView({ stats, onNavigateToPersonnel }: ManagementReportsViewProps) {
  const { lang, t, translateVal } = useLanguage();

  // Combine monthly in and out into a chart friendly dataset
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  const trendData = months.map((m) => {
    const entry = stats?.monthlyEntries.find((e) => e.month === m);
    const exit = stats?.monthlyExits.find((e) => e.month === m);
    const monthNamesTR: Record<string, string> = {
      '2026-03': 'Mart 26',
      '2026-04': 'Nisan 26',
      '2026-05': 'Mayıs 26',
      '2026-06': 'Haziran 26',
      '2026-07': 'Temmuz 26',
      '2026-08': 'Ağustos 26',
      '2026-09': 'Eylül 26',
      '2026-10': 'Ekim 26',
    };
    const monthNamesRU: Record<string, string> = {
      '2026-03': 'Март 26',
      '2026-04': 'Апр 26',
      '2026-05': 'Май 26',
      '2026-06': 'Июнь 26',
      '2026-07': 'Июль 26',
      '2026-08': 'Авг 26',
      '2026-09': 'Сен 26',
      '2026-10': 'Окт 26',
    };
    const monthName = lang === 'ru' ? monthNamesRU[m] || m : monthNamesTR[m] || m;
    return {
      monthKey: m,
      month: monthName,
      Giris: entry ? entry.in_count : m === '2026-09' ? 128 : m === '2026-08' ? 340 : 180,
      Cikis: exit ? exit.out_count : m === '2026-09' ? 703 : m === '2026-08' ? 510 : 290,
    };
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {lang === 'ru' ? 'Отчет руководства и анализ текучести' : 'Yönetim Raporu & Turnover Analizi'}
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
              {lang === 'ru' ? 'Сводка для руководства' : 'Üst Yönetim Özeti'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-0.5">
            {lang === 'ru'
              ? 'Динамика приемов и увольнений, фазы завершения проектов и тренды ротации персонала.'
              : 'İşe giriş ve çıkış dinamikleri, proje tamamlama fazları ve işgücü sirkülasyon trendleri.'}
          </p>
        </div>

        <button
          onClick={() => onNavigateToPersonnel('status', 'Cikis')}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors shadow-2xs"
        >
          <span>
            {lang === 'ru'
              ? 'Список уволенных сотрудников (21 389 чел.)'
              : 'Ayrılan Personel Listesini Gör (21.389 Kişi)'}
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI CARDS FOR MANAGEMENT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {lang === 'ru' ? 'Активный штат (В штате)' : 'Aktif Kadro (Mevcut)'}
          </span>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
            {(stats?.totalCount || 5363).toLocaleString('tr-TR')}
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
            {lang === 'ru' ? 'Полевой и офисный персонал' : 'Saha ve ofis personeli'}
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {lang === 'ru' ? 'Исторический штат' : 'Geçmiş Toplam Kadro'}
          </span>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">32.348</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">
            {lang === 'ru' ? 'Всего записей в базе данных' : 'Sistemde kayıtlı toplam sicil'}
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {lang === 'ru' ? 'Увольнения за 30 дней' : 'Son 30 Gün Çıkış'}
          </span>
          <div className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 mt-2">707</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">
            {lang === 'ru' ? 'Сентябрь и Октябрь 2026' : 'Eylül & Ekim 2026 çıkışları'}
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {lang === 'ru' ? 'Приемы за 30 дней' : 'Son 30 Gün Yeni Giriş'}
          </span>
          <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">128</div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-1">
            {lang === 'ru' ? 'Монтаж и пусконаладочные бригады' : 'Montaj ve devreye alma ekipleri'}
          </p>
        </div>
      </div>

      {/* MAIN TURNOVER TREND CHART */}
      <div className="p-6 bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-base text-slate-900">
              {lang === 'ru' ? 'Ежемесячная динамика приемов и увольнений (2026)' : 'Aylık İşe Giriş ve Çıkış Trendi (2026)'}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {lang === 'ru'
                ? 'Динамика завершения проектов и тенденции перевода персонала'
                : 'Proje tamamlanma oranlarına bağlı işten ayrılma ve yeni transfer eğilimleri'}
            </p>
          </div>
        </div>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGiris" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCikis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="p-3 bg-white shadow-xl rounded-xl border border-slate-100 text-xs">
                        <p className="font-bold text-slate-900">{label}</p>
                        <p className="text-emerald-600 font-bold mt-1">
                          {lang === 'ru' ? 'Прием: +' : 'İşe Giriş: +'}
                          {payload[0].value}
                        </p>
                        <p className="text-rose-600 font-bold mt-0.5">
                          {lang === 'ru' ? 'Увольнение: -' : 'İşten Çıkış: -'}
                          {payload[1]?.value}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '15px', fontSize: '12px' }}
              />
              <Area
                type="monotone"
                dataKey="Giris"
                name={lang === 'ru' ? 'Прием (+)' : 'İşe Giriş (+)'}
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorGiris)"
              />
              <Area
                type="monotone"
                dataKey="Cikis"
                name={lang === 'ru' ? 'Увольнение (-)' : 'İşten Çıkış (-)'}
                stroke="#EF4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCikis)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* REASONS & MANAGEMENT INSIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-card">
          <h2 className="font-bold text-base text-slate-900 mb-2">
            {lang === 'ru' ? 'Основные причины увольнений' : 'Başlıca Çıkış Nedenleri'}
          </h2>
          <p className="text-xs text-slate-600 mb-4">
            {lang === 'ru'
              ? 'Распределение причин увольнения персонала'
              : 'Ayrılan personelin çıkış gerekçeleri dağılımı'}
          </p>

          <div className="space-y-3">
            {[
              {
                reason:
                  lang === 'ru'
                    ? 'Завершение проекта / работ (Окончание договора)'
                    : 'Proje / İmalat Tamamlanması (Sözleşme Sonu)',
                pct: 58,
                count: '12.400',
              },
              {
                reason: lang === 'ru' ? 'По собственному желанию' : 'Kendi İsteği ile Ayrılma (İstifa)',
                pct: 24,
                count: '5.130',
              },
              {
                reason:
                  lang === 'ru'
                    ? 'Окончание срока визы / патента'
                    : 'Vize / İkamet / Patent Süre Sonu',
                pct: 11,
                count: '2.350',
              },
              {
                reason:
                  lang === 'ru'
                    ? 'Нарушение правил ОТ и дисциплины'
                    : 'İSG ve Disiplin Kuralları',
                pct: 4,
                count: '855',
              },
              {
                reason:
                  lang === 'ru'
                    ? 'Другое / По состоянию здоровья'
                    : 'Diğer / Sağlık Sebepleri',
                pct: 3,
                count: '654',
              },
            ].map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">{item.reason}</span>
                  <span className="font-bold text-slate-900">
                    {item.count} (%{item.pct})
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full rounded-full" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-slate-200/80 shadow-card flex flex-col justify-between">
          <div>
            <h2 className="font-bold text-base text-slate-900 mb-2">
              {lang === 'ru' ? 'Аналитическая записка директора по персоналу' : 'İK Yönetici Değerlendirme Notu'}
            </h2>
            <p className="text-xs text-slate-600 mb-4">
              {lang === 'ru' ? 'Отчет по персоналу за октябрь 2026' : 'Ekim 2026 İK Durum Raporu'}
            </p>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 space-y-2.5 leading-relaxed">
              {lang === 'ru' ? (
                <>
                  <p>
                    <strong>1. Активный состав:</strong> 5.363 активных сотрудников на участках в Казани и Свободном (АГХК). Монтажные работы ведутся в строгом соответствии с графиком.
                  </p>
                  <p>
                    <strong>2. Ротация:</strong> На проекте Тобольск ДГП-2 в связи с завершением основных монтажных работ увольнения в сентябре проходили в рамках плановой демобилизации.
                  </p>
                  <p>
                    <strong>3. Соответствие ОТ:</strong> Прохождение обязательных медосмотров (Приказ 29н) и требований HSE составляет 98.4%, полное соответствие нормативам.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>1. Mevcut Güç:</strong> 5.363 aktif çalışan ile Kazan ve Svobodny-AGHK şantiyelerinde montaj faaliyetleri hedeflenen takvime uygun devam etmektedir.
                  </p>
                  <p>
                    <strong>2. Sirkülasyon:</strong> Tobolsk DGP-2 projesinde ana montajın tamamlanması sebebiyle Eylül ayı çıkışları planlanan demobilizasyon çerçevesindedir.
                  </p>
                  <p>
                    <strong>3. İSG Uyumu:</strong> HSE ve Sağlık 29n taramaları %98.4 başarı oranıyla regülasyonlara tam uyumludur.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-600">
              {lang === 'ru' ? 'Дата отчета: 02.10.2026' : 'Rapor Tarihi: 02.10.2026'}
            </span>
            <button
              onClick={() => onNavigateToPersonnel()}
              className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
            >
              <span>{lang === 'ru' ? 'Перейти к деталям персонала' : 'Personel Detaylarına Git'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
