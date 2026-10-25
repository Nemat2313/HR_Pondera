'use client';

import React, { useState } from 'react';
import {
  Scale,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Users,
  Search,
  Filter,
  Download,
  Building2,
  Info,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface ComparisonRecord {
  sicil_no: string;
  name: string;
  uyruk: string;
  uyrukRu: string;
  santiye: string;
  santiyeRu: string;
  firma: string;
  gorev: string;
  gorevRu: string;
  official_status: 'Onaylı (Bildirildi)' | 'Süreçte' | 'Bildirim Yok';
  real_status: 'Sahada Aktif (Turnike)' | 'Sahada Yok';
  risk: 'Dusuk' | 'Orta' | 'Kritik';
  noteTr: string;
  noteRu: string;
}

const SAMPLE_COMPARISONS: ComparisonRecord[] = [
  {
    sicil_no: 'TR-10492',
    name: 'MURAT KAYA',
    uyruk: 'Türkiye',
    uyrukRu: 'Турция',
    santiye: 'Ust Luga Kompleksi',
    santiyeRu: 'Усть-Луга Комплекс',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Boru Montaj Şefi',
    gorevRu: 'Мастер монтажа трубопроводов',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Dusuk',
    noteTr: 'Gosuslugi bildirimi ve fiili turnike eşleşmesi %100 tam uyumlu.',
    noteRu: 'Уведомление в Госуслуги и проход через турникет 100% совпадают.',
  },
  {
    sicil_no: 'UZ-88412',
    name: 'SHAVKAT RAKHMATOV',
    uyruk: 'Özbekistan',
    uyrukRu: 'Узбекистан',
    santiye: 'Kazan Gaz Kimya',
    santiyeRu: 'Казань Газ-Химия',
    firma: 'SUBCON-1 (KAZAN TEKNO)',
    gorev: 'Kaynakçı Ustası (TIG/MIG)',
    gorevRu: 'Электрогазосварщик',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Dusuk',
    noteTr: 'Patent verisi ve çalışma izni MVD kayıtlarında aktif.',
    noteRu: 'Патент и разрешение на работу активны в базах МВД.',
  },
  {
    sicil_no: 'IN-90214',
    name: 'RAJESH KUMAR',
    uyruk: 'Hindistan',
    uyrukRu: 'Индия',
    santiye: 'Ust Luga Kompleksi',
    santiyeRu: 'Усть-Луга Комплекс',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Boru İzolasyon Ustası',
    gorevRu: 'Изолировщик на термоизоляции',
    official_status: 'Süreçte',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Orta',
    noteTr: 'Gosuslugi bildirim başvurusu yapıldı, onay belgesi 2 gün içinde bekleniyor.',
    noteRu: 'Уведомление подано в Госуслуги, получение квитанции ожидается в течение 2 дней.',
  },
  {
    sicil_no: 'TJ-33419',
    name: 'JASUR ALIMOV',
    uyruk: 'Tacikistan',
    uyrukRu: 'Таджикистан',
    santiye: 'Tobolsk DGP-2',
    santiyeRu: 'Тобольск ДГП-2',
    firma: 'SUBCON-4 (SIBERIA ELEKTRİK)',
    gorev: 'Elektrik Montajcısı',
    gorevRu: 'Электромонтажник',
    official_status: 'Bildirim Yok',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Kritik',
    noteTr: 'Taşeron firma bildirimi sisteme girmemiş, acil propusk durdurma gerektirir.',
    noteRu: 'Субподрядчик не подал уведомление о найме, требуется временная блокировка пропуска.',
  },
  {
    sicil_no: 'KG-55214',
    name: 'BAKYTBEK ASANOV',
    uyruk: 'Kırgızistan',
    uyrukRu: 'Кыргызстан',
    santiye: 'Svobodny AGHK',
    santiyeRu: 'Свободный АГХК',
    firma: 'PONDERA İNŞAAT A.Ş.',
    gorev: 'Kalıpçı Ustası',
    gorevRu: 'Опалубщик / Бетонщик',
    official_status: 'Onaylı (Bildirildi)',
    real_status: 'Sahada Aktif (Turnike)',
    risk: 'Dusuk',
    noteTr: 'Avrasya Birliği (EAEU) bildirimi ve saha propusk tam uyumlu.',
    noteRu: 'Трудовой договор гражданина ЕАЭС и пропуск полностью верифицированы.',
  },
];

export default function OfficialVsRealView() {
  const { lang } = useLanguage();
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const filtered = SAMPLE_COMPARISONS.filter((row) => {
    if (filterRisk !== 'all' && row.risk !== filterRisk) return false;
    if (
      search &&
      !row.name.toLowerCase().includes(search.toLowerCase()) &&
      !row.sicil_no.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 font-normal max-w-7xl mx-auto">
      {/* Header & Purpose Guide Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-50/90 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 border border-indigo-100 dark:border-slate-800 text-slate-900 dark:text-white shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-slate-900 dark:text-white">
                  {lang === 'ru'
                    ? 'Сверка официальных и фактических данных персонала'
                    : 'Resmi ve Real Personel Veri Karşılaştırma Merkezi'}
                </h1>
                <span className="px-2 py-0.5 text-[11px] rounded bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/30 font-normal">
                  {lang === 'ru' ? 'Перекрестный аудит' : 'Çapraz Denetim'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-2xl font-normal leading-relaxed">
                {lang === 'ru'
                  ? 'Сравнение официальных списков (Госуслуги МВД, трудовые договоры, EBA) с реальными данными строительной площадки (турникеты, табели). Выявление рисков нелегальной работы и расхождений.'
                  : 'Gosuslugi МВД resmi bildirimleri ve yasal bordro kayıtları ile şantiyedeki fiili turnike ve formen saha verilerini karşılaştırarak yasal uyumsuzluk ve denetim risklerini sıfıra indiren kontrol merkezi.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-indigo-50 dark:bg-white/10 dark:hover:bg-white/20 text-indigo-700 dark:text-white text-xs border border-indigo-200 dark:border-white/20 transition-all cursor-pointer font-normal shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Экспорт отчета сверки' : 'Karşılaştırma Raporu (Excel)'}</span>
            </button>
          </div>
        </div>

        {/* Explainability Pill: What is this page? */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-white/5 border border-indigo-100 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5 font-normal">
          <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-900 dark:text-white font-normal">
              {lang === 'ru' ? 'Для чего этот раздел?' : 'Bu sayfa ne işe yarar?'}
            </strong>{' '}
            {lang === 'ru'
              ? 'Моментально выявляет расхождения между официально заявленными в МВД работниками и фактическим персоналом на стройплощадке: незаявленные субподрядчики, риски нелегальной работы или числящиеся в штате, но отсутствующие на объекте ("мертвые души").'
              : 'Şantiyelerde resmi kurumlara (MVD / Gosuslugi) bildirilen işçiler ile sahada bilfiil çalışan işçiler arasındaki kaçak işçi, bildirilmemiş taşeron, izinsiz çalışma veya resmi kaydı olup sahada bulunmayan "hayalet personel" farklarını anlık tespit eder.'}
          </div>
        </div>
      </div>

      {/* KPI Cards: High-Level Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Официальный штат (МВД)' : 'Resmi Bildirilen Kadro'}</span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">
            5.013 <span className="text-xs text-slate-400">{lang === 'ru' ? 'чел.' : 'Kişi'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Госуслуги МВД и кадры eBA' : 'Gosuslugi МВД & EBA resmi sicilleri'}
          </p>
        </div>

        {/* KPI 2 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Фактически на объекте' : 'Sahada Fiili (Real) Kadro'}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">
            4.880 <span className="text-xs text-slate-400">{lang === 'ru' ? 'чел.' : 'Kişi'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Показания турникетов КПП' : 'Turnikeden geçen aktif işçiler'}
          </p>
        </div>

        {/* KPI 3 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Полное соответствие' : '%100 Tam Uyumlu'}</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400 font-normal">
            4.750 <span className="text-xs text-emerald-600 dark:text-emerald-400">(%97.3)</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'Совпадает в базе и на КПП' : 'Hem resmi hem sahada onaylı'}
          </p>
        </div>

        {/* KPI 4 */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-normal">
            <span>{lang === 'ru' ? 'Критичные расхождения' : 'Kritik Sapma & Risk'}</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl text-rose-600 dark:text-rose-400 font-normal">
            130 <span className="text-xs text-rose-600 dark:text-rose-400">{lang === 'ru' ? 'риск' : 'Riskli'}</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
            {lang === 'ru' ? 'На объекте есть, нет в МВД' : 'Sahada var / resmi bildirimi eksik'}
          </p>
        </div>
      </div>

      {/* Main Comparison Table Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Table Header Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm text-slate-900 dark:text-white font-normal">
              {lang === 'ru' ? 'Реестр перекрестной сверки персонала' : 'Çapraz Karşılaştırma Denetim Listesi'}
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal">
              {filtered.length} {lang === 'ru' ? 'записей' : 'Kayıt'}
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
                placeholder={lang === 'ru' ? 'Поиск по ФИО или табельному...' : 'Personel veya Sicil Ara...'}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-indigo-500 text-slate-800 dark:text-slate-200 font-normal"
              />
            </div>

            {/* Risk Filter Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-normal border border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={() => setFilterRisk('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'ru' ? 'Все' : 'Tümü'}
              </button>
              <button
                type="button"
                onClick={() => setFilterRisk('Kritik')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'Kritik'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-rose-600'
                }`}
              >
                {lang === 'ru' ? 'Критичные' : 'Kritik (Riskli)'}
              </button>
              <button
                type="button"
                onClick={() => setFilterRisk('Orta')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'Orta'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
                }`}
              >
                {lang === 'ru' ? 'Средние' : 'Orta Sapma'}
              </button>
              <button
                type="button"
                onClick={() => setFilterRisk('Dusuk')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterRisk === 'Dusuk'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
                }`}
              >
                {lang === 'ru' ? 'Соответствует' : 'Tam Uyumlu'}
              </button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300 font-normal">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-normal">
              <tr>
                <th className="py-3 px-4">{lang === 'ru' ? 'Табельный и ФИО' : 'Sicil & Personel'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Объект и Компания' : 'Şantiye & Firma'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Официальный статус (МВД)' : 'Resmi Durum (MVD / EBA)'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Фактический статус (Турникет)' : 'Real Durum (Turnike)'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Уровень риска' : 'Risk Seviyesi'}</th>
                <th className="py-3 px-4">{lang === 'ru' ? 'Примечание / Действие' : 'Açıklama / Aksiyon'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="text-slate-900 dark:text-white font-normal">{row.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      {row.sicil_no} • {lang === 'ru' ? row.uyrukRu : row.uyruk}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-800 dark:text-slate-200 font-normal">
                      {lang === 'ru' ? row.santiyeRu : row.santiye}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{row.firma}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-normal border ${
                        row.official_status === 'Onaylı (Bildirildi)'
                          ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200/50 dark:border-emerald-800/50'
                          : row.official_status === 'Süreçte'
                          ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200/50 dark:border-amber-800/50'
                          : 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-200/50 dark:border-rose-800/50'
                      }`}
                    >
                      {row.official_status === 'Onaylı (Bildirildi)'
                        ? lang === 'ru'
                          ? 'Уведомление подано'
                          : 'Onaylı (Bildirildi)'
                        : row.official_status === 'Süreçte'
                        ? lang === 'ru'
                          ? 'В процессе оформления'
                          : 'Süreçte'
                        : lang === 'ru'
                        ? 'Нет уведомления'
                        : 'Bildirim Yok'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-normal border ${
                        row.real_status === 'Sahada Aktif (Turnike)'
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-200/50 dark:border-blue-800/50'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {row.real_status === 'Sahada Aktif (Turnike)'
                        ? lang === 'ru'
                          ? 'На объекте (Турникет)'
                          : 'Sahada Aktif (Turnike)'
                        : lang === 'ru'
                        ? 'Вне площадки'
                        : 'Sahada Yok'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-normal border ${
                        row.risk === 'Dusuk'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                          : row.risk === 'Orta'
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                      }`}
                    >
                      {row.risk === 'Dusuk'
                        ? lang === 'ru'
                          ? 'В норме'
                          : 'Uyumlu'
                        : row.risk === 'Orta'
                        ? lang === 'ru'
                          ? 'Средний риск'
                          : 'Orta Risk'
                        : lang === 'ru'
                        ? 'Критический риск'
                        : 'Kritik Risk'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 font-normal">
                    {lang === 'ru' ? row.noteRu : row.noteTr}
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
