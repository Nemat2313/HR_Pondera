'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Smartphone,
  ScanLine,
  MapPin,
  Clock,
  ShieldCheck,
  Play,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Radio,
  FileCheck2,
  Users,
  Compass,
  Cpu,
  ExternalLink,
  Plane,
  Building,
  Bed,
  Check,
  Info,
  QrCode,
  FileSpreadsheet,
  CheckSquare,
  Flame,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function PoweriseInnovationView() {
  const { lang } = useLanguage();
  // Video priority as requested: default active tab is 'video'
  const [activeSubTab, setActiveSubTab] = useState<
    | 'video'
    | 'nfc_passport'
    | 'mobile_id'
    | 'foreman_report'
    | 'geofence'
    | 'puantaj'
    | 'tickets'
    | 'camp'
  >('video');

  const subTabs = [
    {
      id: 'video',
      title: lang === 'ru' ? '1. Видео-презентация' : '1. Tanıtım Videosu & Genel Bakış',
      tag: 'YouTube',
      tagColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      icon: Play,
      desc: lang === 'ru' ? 'Обзор полевых решений' : 'Saha teknolojileri genel bakış',
    },
    {
      id: 'nfc_passport',
      title: lang === 'ru' ? '2. NFC Паспорт & eBA Кадры' : '2. NFC Pasaport & eBA Sicil',
      tag: 'ICAO 9303',
      tagColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      icon: ScanLine,
      desc: lang === 'ru' ? 'Считывание чипа за 2.5 сек' : 'Pasaport çipinden anında kayıt',
    },
    {
      id: 'mobile_id',
      title: lang === 'ru' ? '3. Мобильный ID (NFC & Штрихкод)' : '3. Mobil ID Kartı (NFC & Barkod)',
      tag: 'Offline Sync',
      tagColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      icon: Smartphone,
      desc: lang === 'ru' ? 'Считывание бейджей и QR' : 'Yaka kartı & QR yoklama',
    },
    {
      id: 'foreman_report',
      title: lang === 'ru' ? '4. Отчет мастера и Коды затрат' : '4. Formen Raporu & Bütçe Kodları',
      tag: 'WBS / Puantaj',
      tagColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      icon: FileCheck2,
      desc: lang === 'ru' ? 'Локация, виды работ и статьи затрат' : 'İş türü, konum & bütçe aktarımı',
    },
    {
      id: 'geofence',
      title: lang === 'ru' ? '5. Полигоны и Карта персонала' : '5. Saha Poligon & Personel Haritası',
      tag: 'Kingisepp BI',
      tagColor: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
      icon: Compass,
      desc: lang === 'ru' ? 'Геозоны и точки на карте' : 'Şantiye sektörleri & çalışan pini',
    },
    {
      id: 'puantaj',
      title: lang === 'ru' ? '6. 3-Уровневая сверка табелей' : "6. 3'lü Puantaj Konsolidasyonu",
      tag: 'Turnike-Formen',
      tagColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      icon: Layers,
      desc: lang === 'ru' ? 'Турникеты, бригадиры и пуантеры' : 'Turnike + Formen + Puantör',
    },
    {
      id: 'tickets',
      title: lang === 'ru' ? '7. AI Билеты (РЖД и Авиа)' : '7. AI Uçak & Tren Biletleri',
      tag: 'AI OCR',
      tagColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      icon: Plane,
      desc: lang === 'ru' ? 'Автоматический учет билетов АХО' : 'İdari işler bilet lojistiği',
    },
    {
      id: 'camp',
      title: lang === 'ru' ? '8. Общежития и Городок' : '8. Şantiye Kamp & Lojman',
      tag: 'Obshchezhitiye',
      tagColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      icon: Building,
      desc: lang === 'ru' ? 'Коечный фонд и заселение по NFC' : 'Yatak kapasitesi & NFC oda tahsis',
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 font-normal max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl text-slate-900 dark:text-white tracking-tight font-normal">
                  {lang === 'ru'
                    ? 'Powerise • Мобильные и полевые инновации'
                    : 'Powerise • Saha İnovasyon & Mobil Ekosistem'}
                </h1>
                <span className="px-2.5 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300/50 font-normal">
                  {lang === 'ru' ? 'Готовые модули' : 'Hazır & Entegre Edilebilir'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                {lang === 'ru'
                  ? 'NFC считывание паспортов, мобильные отчеты мастеров, полигоны Geofencing, 3-уровневая сверка табелей'
                  : 'NFC pasaport okuma, formen mobil raporu, poligon geofencing ve 3 katmanlı puantaj doğrulama vitrini'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button: YouTube Video */}
        <div className="flex items-center gap-2.5">
          <a
            href="https://www.youtube.com/watch?v=UQWgBJtFEJU"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-normal shadow-sm transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{lang === 'ru' ? 'Смотреть на YouTube' : 'YouTube Tanıtım Videosu'}</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
        </div>
      </div>

      {/* Main Two-Column Layout: Left Vertical Tab Menu + Right Content */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Vertical Sub-Navigation Sidebar */}
        <div className="w-full lg:w-72 shrink-0 p-2.5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1 lg:sticky lg:top-20">
          <div className="px-3 py-2 text-[10.5px] uppercase tracking-wider text-slate-400 font-normal border-b border-slate-100 dark:border-slate-800/80 mb-1 flex items-center justify-between">
            <span>{lang === 'ru' ? 'Навигация по модулям' : 'Modül Menüsü'}</span>
            <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              8 {lang === 'ru' ? 'модулей' : 'modül'}
            </span>
          </div>

          <div className="space-y-1">
            {subTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 border border-emerald-500/30 shadow-2xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs truncate font-normal">{tab.title}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">{tab.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Tab Content */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* TAB 1: YOUTUBE VIDEO (PRIORITY) */}
          {activeSubTab === 'video' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg dark:shadow-2xl">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-slate-900 dark:text-white">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/20 text-rose-600 dark:text-rose-500 flex items-center justify-center border border-rose-200/60 dark:border-transparent">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                    <div>
                      <h3 className="text-sm font-normal text-slate-900 dark:text-white">
                        {lang === 'ru'
                          ? 'Презентационный ролик полевых и мобильных технологий Powerise'
                          : 'Powerise Saha ve Şantiye Uygulamaları Tanıtım Filmi'}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                        {lang === 'ru'
                          ? 'Интеграция мобильного приложения, считывания чипов, полигонов и автоматического табеля'
                          : 'Mobil uygulama, pasaport NFC, saha poligonları ve 3 katmanlı puantaj akışı'}
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://www.youtube.com/watch?v=UQWgBJtFEJU"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-normal flex items-center gap-1.5 transition-all"
                  >
                    <span>{lang === 'ru' ? 'В YouTube' : "YouTube'da Aç"}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="relative aspect-[16/9] w-full bg-black">
                  <iframe
                    src="https://www.youtube.com/embed/UQWgBJtFEJU?rel=0"
                    title="Powerise Saha ve Şantiye Uygulamaları Tanıtımı"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>

              {/* Video Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-normal">
                    <ScanLine className="w-4 h-4" />
                    <span>{lang === 'ru' ? '2.5 сек / паспорт' : '2.5 sn / Pasaport'}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                    {lang === 'ru'
                      ? 'Мгновенное сканирование чипа паспорта через NFC смартфона с открытием табельного номера в eBA.'
                      : 'Akıllı telefon NFC anteni ile pasaport çipini okuyup eBA İK sisteminde otomatik sicil kartı açar.'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 text-xs font-normal">
                    <Compass className="w-4 h-4" />
                    <span>{lang === 'ru' ? 'Геозоны и Полигоны' : 'Geofence Poligonları'}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                    {lang === 'ru'
                      ? 'Определение нахождения рабочих в секторах (реактор, эстакада) по GPS/BLE с точностью до 1.5м.'
                      : 'Şantiye sahasında poligonlar çizerek işçilerin hangi binada veya sektörde çalıştığını anlık izler.'}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-normal">
                    <Layers className="w-4 h-4" />
                    <span>{lang === 'ru' ? '3-Уровневый Табель' : "3'lü Konsolidasyon"}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                    {lang === 'ru'
                      ? 'Автоматическая сверка данных турникетов, мобильных отметок бригадиров и независимых пуантеров.'
                      : 'Turnike verisi, formen mobil girişi ve bağımsız puantör yoklamalarını çapraz teyit eder.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NFC & BIOMETRIC PASSPORT -> EBA SİCİL */}
          {activeSubTab === 'nfc_passport' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left: Generated NFC Showcase Image */}
                <div className="lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-xl relative group">
                  <div className="relative aspect-[16/10] w-full bg-slate-950">
                    <Image
                      src="/images/powerise/nfc_passport_eba_showcase.jpg"
                      alt="NFC Pasaport Okuma ve eBA Sicil Açma Vitrini"
                      fill
                      className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white text-[11px] font-normal flex items-center gap-1.5 shadow-sm">
                      <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ICAO 9303 {lang === 'ru' ? 'Считыватель чипа' : 'Çip Okuma Motoru'}</span>
                    </div>
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                      <div>
                        <p className="text-xs text-slate-200 font-normal">
                          {lang === 'ru'
                            ? 'Считывание биометрии и создание карточки сотрудника'
                            : 'Pasaport Çipinden Doğrudan Biyometri & Sicil Açma'}
                        </p>
                        <p className="text-[10.5px] text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'В кадровую систему eBA карточка формируется за 2.5 секунды'
                            : 'eBA İnsan Kaynakları sistemine 2.5 saniyede hatasız personel kartı oluşturulur'}
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-normal">
                        %100 {lang === 'ru' ? 'Оригинал' : 'Orijinal İmza'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Feature Highlights */}
                <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C31] shadow-lg flex flex-col justify-between p-6 space-y-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-normal">
                      {lang === 'ru' ? 'Технология ICAO 9303' : 'ICAO 9303 Temassız Çip Okuma'}
                    </span>
                    <h3 className="text-lg text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                      {lang === 'ru'
                        ? 'Мобильная верификация паспортов и моментальный наем'
                        : 'Akıllı Telefon ile Saniyeler İçinde Pasaport Doğrulama ve Kayıt'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Паспорта Узбекистана, Индии, Турции и других стран считываются штатным NFC-модулем телефона. Цифровое фото высокого разрешения извлекается прямо из чипа, что исключает подделки.'
                        : 'Özbekistan, Hindistan, Türkiye ve SNG ülkelerinin biyometrik pasaportlarındaki NFC çipleri telefon anteniyle okunur. Yüksek çözünürlüklü yüz fotoğrafı doğrudan çipten alınır, sahte pasaport riski sıfırlanır.'}
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {lang === 'ru'
                          ? 'Криптографическая подпись: Подлинность документа подтверждается государством.'
                          : 'Kriptografik İmza Teyidi: Belgenin devlet otoritesi tarafından basıldığını anında teyit eder.'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {lang === 'ru'
                          ? 'Цифровое фото: Высокое разрешение прямо из чипа для бейджей и пропусков.'
                          : 'Dijital Biyometrik Fotoğraf: Yüksek çözünürlüklü yüz görseli kart ve giriş kartlarına aktarılır.'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {lang === 'ru'
                          ? 'Интеграция с eBA и Pondera: Карточка открывается без ручного ввода клавиатурой.'
                          : 'EBA & Pondera HR Otomatik Entegrasyonu: Manuel veri girişine gerek kalmadan sicil açılır.'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/50 text-xs text-slate-700 dark:text-slate-300 font-normal">
                    <span className="text-emerald-700 dark:text-emerald-300 font-normal">
                      {lang === 'ru' ? 'Результат:' : 'Verimlilik Kazanımı:'}
                    </span>{' '}
                    {lang === 'ru'
                      ? 'Оформление 1 сотрудника сокращается с 20 минут до 3 секунд.'
                      : '1 personelin evrak ve sicil açılış süresi 20 dakikadan 3 saniyeye iner.'}
                  </div>
                </div>
              </div>

              {/* Step-by-Step Flow Explanation (Adım Adım Nasıl Çalışıyor?) */}
              <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-lg text-slate-900 dark:text-white font-normal">
                      {lang === 'ru'
                        ? 'Процесс автоматического открытия карточки в eBA по NFC (3 шага)'
                        : "NFC Pasaport ile eBA'da Otomatik Sicil Açma Süreci (3 Adım)"}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-normal">
                    {lang === 'ru'
                      ? 'Запатентованный процесс, исключающий человеческие ошибки и ускоряющий прием на работу'
                      : 'Manuel veri giriş hatasını sıfıra indiren ve işe giriş işlemlerini 20 dakikadan 3 saniyeye düşüren patentli iş akışı'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Step 1 */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm font-normal shadow-sm">
                      1
                    </div>
                    <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                      {lang === 'ru' ? 'Прикладывание паспорта к смартфону' : 'NFC Çipine Telefonu Yaklaştırma'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'К чипу биометрического паспорта сотрудника прикладывается задняя панель телефона. NFC-антенна мгновенно инициирует защищенный протокол ICAO 9303.'
                        : 'İşe yeni başlayan personelin biyometrik pasaportunun çipine mobil cihazın arkası yaklaştırılır. Kamera ve NFC anteni temassız protokolü (ICAO 9303) anında başlatır.'}
                    </p>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-normal pt-1">
                      {lang === 'ru' ? '• Бесконтактно и гигиенично' : '• Temassız & Hijyenik • Optik tarama gerekmez'}
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center text-sm font-normal shadow-sm">
                      2
                    </div>
                    <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                      {lang === 'ru' ? 'Криптографическая верификация и фото' : 'Kriptografik Doğrulama & Biyometrik Fotoğraf'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Проверяется цифровая подпись государственного органа. Из защищенной памяти извлекается оригинальное студийное фото лица, MRZ-строка, дата рождения и срок действия.'
                        : 'Devlet otoritelerinin elektronik imzası teyit edilir (sahte veya tahrif edilmiş pasaport imkansızdır). Çipin içindeki yüksek çözünürlüklü dijital vesikalık fotoğraf ve kimlik verileri çözülür.'}
                    </p>
                    <div className="text-[11px] text-teal-600 dark:text-teal-400 font-normal pt-1">
                      {lang === 'ru' ? '• Риск подделки: 0%' : '• Sahtecilik %0 • Orijinal Dijital Vesikalık'}
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-normal shadow-sm">
                      3
                    </div>
                    <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                      {lang === 'ru' ? 'Открытие карточки сотрудника в eBA' : 'eBA & Pondera HR Otomatik Sicil Açılışı'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Без ручного ввода создается карточка сотрудника в системе eBA с привязкой к проекту и участку. Фотография переносится в архив, запускается рабочий процесс согласования.'
                        : 'Tek bir harf dahi elle yazılmadan eBA İK sisteminde çalışan sicili açılır, şantiye lokasyonu ve departmanı atanır. Pasaport görseli e-arşive aktarılır ve onay akışı tetiklenir.'}
                    </p>
                    <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-normal pt-1">
                      {lang === 'ru' ? '• Нулевая ошибка клавиатуры' : '• Sıfır Klavye Girişi • eBA Onay Akışı Aktif'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MOBILE APP ID CARD (NFC & BARCODE) */}
          {activeSubTab === 'mobile_id' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Real Mobile Reader Screenshot - Full Phone View */}
                <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C31] shadow-xl p-5 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Интерфейс мобильного считывателя' : 'Mobil Okuyucu Arayüzü (Powerise App)'}
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                        v3.2 iOS & Android
                      </span>
                    </div>

                    <div className="mt-4 flex justify-center p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                      <div className="relative w-full max-w-[320px] aspect-[471/1024] rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 bg-white">
                        <Image
                          src="/images/powerise/powerise_mobile_nfc.png"
                          alt="Powerise Mobil NFC ve Barkod Ekranı"
                          fill
                          className="object-contain"
                          priority
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200/50 dark:border-cyan-800/50 text-xs text-slate-700 dark:text-slate-300 font-normal">
                    <span className="text-cyan-700 dark:text-cyan-300 font-normal">
                      {lang === 'ru' ? 'Автономная работа (Offline):' : 'İnternetsiz (Offline) Çalışma:'}
                    </span>{' '}
                    {lang === 'ru'
                      ? 'В удаленных секторах без интернета сканирования накапливаются в зашифрованной SQLite базе на телефоне и синхронизируются при появлении сети.'
                      : 'İnternet olmayan şantiye alanlarında okutulan kartlar yerel SQLite veritabanında şifrelenir; ağa bağlanınca merkeze tek tıkla eşitlenir.'}
                  </div>
                </div>

                {/* Right: Mobile Features Breakdown */}
                <div className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-cyan-600 dark:text-cyan-400 font-normal">
                      {lang === 'ru' ? 'Двойной режим считывания' : 'Çift Modlu Okuma Altyapısı'}
                    </span>
                    <h3 className="text-xl text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                      {lang === 'ru'
                        ? 'Считывание персональных ID-карт по NFC и штрихкоду/QR'
                        : 'Personel Yaka Kartlarını NFC ve Barkod / QR ile Saniyeler İçinde Okutma'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Мобильное приложение Powerise превращает любой смартфон в профессиональный терминал учета рабочего времени. Мастер или пуантер прикладывает бейдж работника или сканирует QR-код на каске.'
                        : 'Powerise mobil uygulaması her akıllı telefonu profesyonel bir şantiye PDKS terminaline dönüştürür. Formen veya puantör çalışanın Mifare NFC yaka kartını dokundurur veya kaskındaki QR/barkodu kamerayla okutur.'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'NFC Taramayı Başlat (Mifare & RFID)' : 'NFC Taramayı Başlat (Mifare & RFID Yaka Kartı)'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Считывание за 0.3 секунды без включения камеры, прямо через карман или чехол.'
                            : 'Kamerayı açmaya gerek kalmadan 0.3 saniyede temassız NFC yaka kartı doğrulaması.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Barkod Taramayı Başlat (1D/2D QR)' : 'Barkod Taramayı Başlat (Kamera ile 1D Barkod ve 2D QR)'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Считывание с касок, патентов или распечатанных талонов даже при слабом освещении.'
                            : 'Kask üzerindeki çıkartmalar, çalışma patentleri veya kağıt belgeler anında taranır.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center shrink-0">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Офлайн-режим и локальная SQLite' : 'İnternetsiz Mod ve Senkronizasyon'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Кнопка "Синхронизировать все" отправляет накопленные записи на сервер при подключении к сети.'
                            : '"Tümünü Senkronize Et" butonuyla internet olmayan bölgelerdeki yoklamalar tek tıkla merkeze aktarılır.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? '2 сек автоматическая фиксация (Явка / VAR)' : '2 sn Otomatik Yoklama Kaydı (VAR)'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Карта считывается, статус "ВАР (Я)" записывается, и экран готов для следующего сотрудника.'
                            : 'Kart okutulduğu an VAR (Я) damgası basılır ve beklemeden bir sonraki işçi taranır.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Роли Пуантера и Бригадира (1.K / 2.K)' : 'Puantör Modu (Yoklama) & Formen Ayrımı'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Разделение режимов 1-го утреннего контроля мастера и 2-го вечернего обхода независимого пуантера.'
                            : 'Formen kendi ekibini yoklarken bağımsız puantör 1. ve 2. kontrollerle tüm şantiyeyi teyit eder.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{lang === 'ru' ? 'База данных: SQLite + Cloud Sync' : 'Veritabanı: SQLite + Bulut Eşitleme'}</span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-normal">
                      {lang === 'ru' ? 'Готово к внедрению' : 'Kullanıma Hazır Modül'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FOREMAN DAILY REPORT & BUDGET COST CODES (WBS) */}
          {activeSubTab === 'foreman_report' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left: Generated Foreman Report Showcase Image */}
                <div className="lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-xl relative group">
                  <div className="relative aspect-[16/10] w-full bg-slate-950">
                    <Image
                      src="/images/powerise/powerise_foreman_report_showcase.jpg"
                      alt="Formen Günlük Saha Raporu ve Bütçe Kodları Vitrini"
                      fill
                      className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white text-[11px] font-normal flex items-center gap-1.5 shadow-sm">
                      <FileCheck2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>{lang === 'ru' ? 'Модуль отчетов прораба (DFR)' : 'Formen Saha Rapor Modülü (DFR)'}</span>
                    </div>
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                      <div>
                        <p className="text-xs text-slate-200 font-normal">
                          {lang === 'ru'
                            ? 'Связка видов работ, локации и статей затрат (WBS)'
                            : 'İş Türü, Konum ve Proje Bütçe Kodları Eşleşmesi'}
                        </p>
                        <p className="text-[10.5px] text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Прямой перенос в центральный табель учета с разбивкой по сметам'
                            : 'Merkez puantaj tablosuna hakediş ve bütçe kodlarıyla anlık aktarım'}
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-normal">
                        Cost Control
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: How It Works & Business Value */}
                <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-normal">
                      {lang === 'ru' ? 'Контроль себестоимости и прогресса' : 'Maliyet Kontrolü & İlerleme Takibi'}
                    </span>
                    <h3 className="text-xl text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                      {lang === 'ru'
                        ? 'Ежедневный отчет мастера: кто, где и какую работу выполнял'
                        : 'Formen Günlük Raporu: Kim, Nerede, Hangi İşi Yaptı?'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Бригадир в конце или начале смены в планшете отмечает каждого рабочего: вид выполняемых работ (монтаж труб, металлоконструкции), сектор стройки и код сметы проекта.'
                        : 'Formen vardiya başında veya sonunda tablet veya telefondan ekibini seçer: Yapılan imalat (Boru montajı, çelik iskele vb.), şantiye sektörü (Reaktör alanı) ve proje bütçe kodu girilir.'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/50 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Привязка к кодам затрат (WBS Cost Codes)' : 'Proje Bütçe Kodları (WBS) Entegrasyonu'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Часы рабочего автоматически разносятся по бюджетным статьям (например, WBS 04.12.01 Piping).'
                            : 'İşçinin çalıştığı 8 saat doğrudan bütçe kalemine (Örn: WBS 04.12.01 Boru İmalatı) bağlanır.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/50 dark:border-teal-800/50 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Точная локация и сектор объекта' : 'Sektör & Bina Bazlı İmalat Kaydı'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Сверка с полигонами Geofencing teyit eder: бригада действительно находилась в зоне реактора.'
                            : 'Geofence poligonlarıyla eşleşerek formenin bildirdiği konum saha GPS/BLE ile doğrulanır.'}
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/50 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                          {lang === 'ru' ? 'Автоматическая передача в табель' : 'Puantaj Tablosuna Otomatik Akış'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Отчет мастера сразу ложится как 1-я проверка в табеле для бухгалтерии и отдела Cost Control.'
                            : 'Formen raporu onaylandığı an puantaj konsolidasyonuna 1. Kontrol olarak düşer.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{lang === 'ru' ? 'Hakediş & İlerleme Raporu' : 'Hakediş & Cost Control Uyumlu'}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-normal">
                      {lang === 'ru' ? 'Готовый коммерческий модуль' : 'Satılık & Lisanslanabilir'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: GEOFENCING & POLYGONS (RESİM 3 BİREBİR ENTEGRASYON) */}
          {activeSubTab === 'geofence' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C31] shadow-xl">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                      <Compass className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm text-slate-900 dark:text-white font-normal">
                        {lang === 'ru'
                          ? 'Реальный экран: Полигоны объектов и аналитика пуантеров'
                          : 'Gerçek Saha Ekranı: Şantiye Poligonları & Fotoğraflı Personel Lokasyon Haritası'}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-normal">
                        {lang === 'ru'
                          ? 'Объект Кингисепп / Усть-Луга: сканирования по полигонам, цели пуантеров и карточки работников'
                          : 'Kingisepp / Ust-Luga şantiyesinde poligon bazlı tarama, puantör kotaları ve personelin harita üzerindeki anlık pinleri'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-normal">
                      {lang === 'ru' ? 'v2.5 Онлайн BI' : 'v2.5 Canlı BI'}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 text-[11px] font-normal">
                      {lang === 'ru' ? '1. Контроль (Утро) и 2. Контроль (Вечер)' : '1. Kontrol (Sabah) & 2. Kontrol (Akşam)'}
                    </span>
                  </div>
                </div>

                {/* The Actual Image: powerise_map_polygons.png */}
                <div className="relative aspect-[16/9] w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
                  <Image
                    src="/images/powerise/powerise_map_polygons.png"
                    alt="Şantiye Poligon Haritası ve Fotoğraflı Personel Takibi"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>

                {/* Bottom Insight Bar */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-normal">
                  <div>
                    <span className="text-slate-400 text-[11px]">{lang === 'ru' ? 'Всего сканирований:' : 'Toplam Okutma:'}</span>
                    <p className="text-slate-900 dark:text-white text-base">424 {lang === 'ru' ? 'чел.' : 'Personel'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">{lang === 'ru' ? 'Активных пуантеров:' : 'Aktif Puantör:'}</span>
                    <p className="text-teal-600 dark:text-teal-400 text-base">3 {lang === 'ru' ? 'пуантера' : 'Saha Puantörü'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">{lang === 'ru' ? 'Пример карточки:' : 'Örnek Personel Kartı:'}</span>
                    <p className="text-slate-900 dark:text-white truncate">Mamasoat Khurramov ({lang === 'ru' ? 'Монтаж труб' : 'Boru Montaj'})</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">{lang === 'ru' ? 'Вне площадки:' : 'Saha Dışı Tarama:'}</span>
                    <p className="text-emerald-600 dark:text-emerald-400 text-base">0 ({lang === 'ru' ? 'Без нарушений' : 'Tam İhlalsiz Güvenlik'})</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: 3-LEVEL TIMESHEET CONSOLIDATION (REAL WEB SCREENSHOT) */}
          {activeSubTab === 'puantaj' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C31] shadow-xl">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm text-slate-900 dark:text-white font-normal">
                        {lang === 'ru'
                          ? 'cabinet.powerise.ru • 3-уровневая консолидация табелей'
                          : 'Powerise Web Konsolu: Turnike + Formen + Puantör Puantaj Girişi'}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-normal">
                        {lang === 'ru'
                          ? 'Сверка 449 записей: часы NFC, время турникетов и подтверждения 1/2 контролей'
                          : '449 çalışanın NFC okuma saatleri, turnike girişleri ve 1./2. kontrollerinin çapraz doğrulanması'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-normal">
                      {lang === 'ru' ? 'Работал: 450 чел.' : 'Çalıştı: 450 Kişi'}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-normal">
                      {lang === 'ru' ? 'Расхождений: 0' : 'Saat Uyuşmazlığı: 0'}
                    </span>
                  </div>
                </div>

                {/* The Actual Image: powerise_web_timesheet.png */}
                <div className="relative aspect-[16/9] w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
                  <Image
                    src="/images/powerise/powerise_web_timesheet.png"
                    alt="Powerise Web Puantaj Giriş Konsolu"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
                  <strong className="text-slate-900 dark:text-white font-normal">
                    {lang === 'ru' ? 'Принцип 3-уровневой сверки:' : 'Konsolidasyon Mantığı:'}
                  </strong>{' '}
                  {lang === 'ru'
                    ? '1. Турникеты КПП фиксируют точное время входа на стройку. 2. Мастер (бригадир) отмечает факт работы бригады в приложении. 3. Пуантер подтверждает вечерний обход. При совпадении всех трех источников табель утверждается одной кнопкой.'
                    : 'Şantiye turnikesinden geçen personelin saati otomatik gelir. Formen sahada NFC kartını okutur (1. Kontrol). Bağımsız puantör akşam tekrar doğrular (2. Kontrol). Her 3 kaynak uyuştuğunda tek tıkla resmi bordro puantajı onaylanır.'}
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: AI TICKETS LOGISTICS */}
          {activeSubTab === 'tickets' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-xl relative group">
                  <div className="relative aspect-[16/10] w-full bg-slate-950">
                    <Image
                      src="/images/powerise/ai_ticket_admin_showcase.jpg"
                      alt="AI Bilet Ayrıştırma"
                      fill
                      className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                      <div>
                        <p className="text-xs font-normal">
                          {lang === 'ru'
                            ? 'Распознавание билетов РЖД и Авиа через Vision AI'
                            : 'RZD ve Havayolu Biletlerini AI ile Ayrıştırma'}
                        </p>
                        <p className="text-[10.5px] text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Пассажир, объект назначения, маршрут и стоимость извлекаются из PDF'
                            : 'Yolcu, şantiye, kalkış-varış ve bilet bedeli anında tabloda'}
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-normal">
                        AI OCR
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-normal">
                      {lang === 'ru' ? 'Модуль АХО и Логистики' : 'İdari İşler & Lojistik Modülü'}
                    </span>
                    <h3 className="text-lg text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                      {lang === 'ru'
                        ? 'Автоматизация учета билетов и переброски персонала'
                        : 'Şantiye Bilet ve Sevk Operasyonlarını Otomatikleştirin'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Вместо ручного ввода сотен PDF-билетов ИИ-модуль автоматически находит паспорт работника, привязывает билет к смете объекта и формирует реестр командировок.'
                        : 'Yüzlerce PDF bileti elle girmek yerine sisteme bırakın; AI motoru pasaport numarasıyla çalışanı bulsun, şantiyesine bağlasın ve bütçeyi raporlasın.'}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{lang === 'ru' ? 'Поддержка PDF-билетов РЖД и Авиакомпаний' : 'RZD Tren ve E-Bilet PDF desteği'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{lang === 'ru' ? 'Учет командировочного бюджета по объектам' : 'Şantiye bazlı seyahat bütçesi ve maliyet takibi'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{lang === 'ru' ? 'Отслеживание сотрудников в пути' : 'Yoldaki ve şantiyeye varan personel izleme'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/50 text-xs text-indigo-700 dark:text-indigo-300 font-normal">
                    {lang === 'ru'
                      ? 'Полная демо-версия доступна в меню слева: "АХО и AI Билеты".'
                      : 'Yan menüdeki "İdari İşler & Bilet Takibi" sayfasından canlı demoyu inceleyebilirsiniz.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: CAMP & DORMITORY */}
          {activeSubTab === 'camp' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-xl relative group">
                  <div className="relative aspect-[16/10] w-full bg-slate-950">
                    <Image
                      src="/images/powerise/camp_dormitory_showcase.jpg"
                      alt="Kamp ve Lojman Doluluk Haritası"
                      fill
                      className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                      <div>
                        <p className="text-xs font-normal">
                          {lang === 'ru'
                            ? '3D-карта блоков и заполняемости коечного фонда'
                            : 'Şantiye Kampı 3D Blok ve Yatak Doluluk Haritası'}
                        </p>
                        <p className="text-[10.5px] text-slate-400 font-normal">
                          {lang === 'ru'
                            ? 'Заселение и выдача комнат по NFC паспорту'
                            : 'NFC pasaport okutulunca anında oda ve yatak ataması'}
                        </p>
                      </div>
                      <span className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 font-normal">
                        Obshchezhitiye
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-teal-600 dark:text-teal-400 font-normal">
                      {lang === 'ru' ? 'Общежития и Вахтовые городки' : 'Kamp & Lojman (Obshchezhitiye)'}
                    </span>
                    <h3 className="text-lg text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                      {lang === 'ru'
                        ? 'Управление 4.800+ местами без путаницы и очередей'
                        : '4.800+ Yataklı Şantiye Kamplarında Sıfır Hata ile İkamet Yönetimi'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                      {lang === 'ru'
                        ? 'Прибывающие рабочие распределяются по комнатам с учетом сменности (день/ночь) и языковой совместимости для соблюдения техники безопасности.'
                        : 'Şantiyeye yeni gelen işçilerin kalacağı oda ve yataklar otomatik planlanır. Vardiya uyumu (gece/gündüz) gözetilerek iş kazaları önlenir.'}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                      <span>{lang === 'ru' ? 'Контроль занятости модульных блоков' : 'Konteyner ve prefabrik blok bazlı doluluk kontrolü'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                      <span>{lang === 'ru' ? 'Автоматическое выселение при увольнении' : 'İşten ayrılan personelin lojmandan otomatik tahliyesi'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                      <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                      <span>{lang === 'ru' ? 'График дезинфекции и уборки номеров' : 'Hijyen, temizlik ve bakım döngüsü takibi'}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/50 dark:border-teal-800/50 text-xs text-teal-700 dark:text-teal-300 font-normal">
                    {lang === 'ru'
                      ? 'Интерактивная матрица доступна в меню слева: "Общежития и Коечный фонд".'
                      : 'Yan menüdeki "Kamp & Lojman Takibi" sayfasından interaktif oda matrisini inceleyebilirsiniz.'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
