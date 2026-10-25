'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Building,
  Bed,
  Users,
  Sparkles,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Search,
  Filter,
  ShieldCheck,
  DoorClosed,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface RoomData {
  id: string;
  block: string;
  blockRu: string;
  room_number: string;
  room_numberRu: string;
  site: string;
  siteRu: string;
  capacity: number;
  occupied: number;
  nationality_focus: string;
  nationality_focusRu: string;
  status: 'Dolu' | 'Müsait' | 'Bakım / Dezenfeksiyon';
  residents: string[];
}

const SAMPLE_ROOMS: RoomData[] = [
  {
    id: 'RM-101',
    block: 'A Blok (Ust-Luga Kampı)',
    blockRu: 'Блок А (Городок Усть-Луга)',
    room_number: 'Oda 104',
    room_numberRu: 'Комната 104',
    site: 'Ust-Luga Gaz Kimya',
    siteRu: 'Усть-Луга Комплекс',
    capacity: 4,
    occupied: 4,
    nationality_focus: 'Özbekistan (Boru Montaj Ekibi)',
    nationality_focusRu: 'Узбекистан (Бригада монтажа трубопроводов)',
    status: 'Dolu',
    residents: ['M. Khurramov', 'S. Rakhmatov', 'Z. Khujaniyozov', 'S. Sadikov'],
  },
  {
    id: 'RM-102',
    block: 'A Blok (Ust-Luga Kampı)',
    blockRu: 'Блок А (Городок Усть-Луга)',
    room_number: 'Oda 105',
    room_numberRu: 'Комната 105',
    site: 'Ust-Luga Gaz Kimya',
    siteRu: 'Усть-Луга Комплекс',
    capacity: 4,
    occupied: 3,
    nationality_focus: 'Özbekistan / Kırgızistan',
    nationality_focusRu: 'Узбекистан / Кыргызстан',
    status: 'Müsait',
    residents: ['B. Asanov', 'T. Karimov', 'J. Ubaydullaev'],
  },
  {
    id: 'RM-103',
    block: 'B Blok (Mühendis Lojmanı)',
    blockRu: 'Блок Б (Инженерный корпус)',
    room_number: 'Oda 201',
    room_numberRu: 'Комната 201',
    site: 'Ust-Luga Gaz Kimya',
    siteRu: 'Усть-Луга Комплекс',
    capacity: 2,
    occupied: 2,
    nationality_focus: 'Türkiye (Teknik Ofis / Saha Şefi)',
    nationality_focusRu: 'Турция (Технический офис / Начальник участка)',
    status: 'Dolu',
    residents: ['A. Yılmaz (Saha Şefi)', 'M. Demir (Mühendis)'],
  },
  {
    id: 'RM-104',
    block: 'C Blok (Kazan Modüler Kamp)',
    blockRu: 'Блок С (Модульный городок Казань)',
    room_number: 'Oda 308',
    room_numberRu: 'Комната 308',
    site: 'Kazan Gaz Kimya',
    siteRu: 'Казань Газ-Химия',
    capacity: 4,
    occupied: 4,
    nationality_focus: 'Hindistan (Elektrik Montaj)',
    nationality_focusRu: 'Индия (Электромонтаж)',
    status: 'Dolu',
    residents: ['R. Kumar', 'A. Patel', 'S. Sharma', 'D. Verma'],
  },
  {
    id: 'RM-105',
    block: 'C Blok (Kazan Modüler Kamp)',
    blockRu: 'Блок С (Модульный городок Казань)',
    room_number: 'Oda 309',
    room_numberRu: 'Комната 309',
    site: 'Kazan Gaz Kimya',
    siteRu: 'Казань Газ-Химия',
    capacity: 4,
    occupied: 0,
    nationality_focus: 'Yeni Gelen Kafile İçin Ayrıldı',
    nationality_focusRu: 'Зарезервировано для новой группы',
    status: 'Bakım / Dezenfeksiyon',
    residents: [],
  },
];

export default function CampManagementView() {
  const { lang } = useLanguage();
  const [selectedBlock, setSelectedBlock] = useState('all');
  const [search, setSearch] = useState('');

  const filteredRooms = SAMPLE_ROOMS.filter((r) => {
    if (selectedBlock !== 'all' && !r.block.includes(selectedBlock) && !r.blockRu.includes(selectedBlock)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.room_number.toLowerCase().includes(q) ||
        r.room_numberRu.toLowerCase().includes(q) ||
        r.block.toLowerCase().includes(q) ||
        r.blockRu.toLowerCase().includes(q) ||
        r.site.toLowerCase().includes(q) ||
        r.siteRu.toLowerCase().includes(q) ||
        r.nationality_focus.toLowerCase().includes(q) ||
        r.nationality_focusRu.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 lg:p-8 space-y-8 font-normal max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-50/90 via-white to-emerald-50/60 dark:from-slate-900 dark:via-teal-950 dark:to-slate-900 border border-teal-100 dark:border-slate-800 text-slate-900 dark:text-white shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-500/20 border border-teal-200 dark:border-teal-400/30 flex items-center justify-center text-teal-600 dark:text-teal-400 shadow-inner">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl text-slate-900 dark:text-white tracking-tight font-normal">
                  {lang === 'ru'
                    ? 'Городок • Управление общежитиями и местами'
                    : 'Şantiye Kamp & Lojman (Obshchezhitiye) Yönetimi'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-500/30 font-normal flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                  {lang === 'ru' ? 'Powerise Модуль' : 'Powerise Satılık İnovasyon Modülü'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-normal">
                {lang === 'ru'
                  ? 'Учет коечного фонда, заселение по NFC паспорту, распределение по комнатам и контроль чистоты'
                  : 'Şantiye yatak kapasitesi, NFC pasaportla anında oda yerleşimi, vardiya-uyruk uyumu ve lojman doluluk kontrolü'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800/80 border border-teal-100 dark:border-slate-700/80 text-right shadow-2xs">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                {lang === 'ru' ? 'Всего мест' : 'Toplam Yatak'}
              </div>
              <div className="text-base text-teal-600 dark:text-teal-400 font-normal">4.850 {lang === 'ru' ? 'мест' : 'Yatak'}</div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-right shadow-2xs">
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-normal">
                {lang === 'ru' ? 'Занятость' : 'Doluluk Oranı'}
              </div>
              <div className="text-base text-emerald-600 dark:text-emerald-300 font-normal">%87.4</div>
            </div>
          </div>
        </div>
      </div>

      {/* Showcase Visual Card (Generated Image + Features) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Camp Dormitory Showcase Image */}
        <div className="lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg relative group">
          <div className="relative aspect-[16/10] w-full bg-slate-950">
            <Image
              src="/images/powerise/camp_dormitory_showcase.jpg"
              alt="Şantiye Kamp ve Lojman Doluluk Haritası Vitrini"
              fill
              className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white text-[11px] font-normal flex items-center gap-1.5 shadow-sm">
              <Building className="w-3.5 h-3.5 text-teal-400" />
              <span>{lang === 'ru' ? '3D-тепловая карта блоков и комнат' : '3D Blok & Oda Doluluk Heatmap'}</span>
            </div>
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
              <div>
                <p className="text-xs text-slate-200 font-normal">
                  {lang === 'ru' ? 'Модульные и контейнерные городки' : 'Konteyner ve Prefabrik Kamp Yerleşimi'}
                </p>
                <p className="text-[10.5px] text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'Заселение и проверка свободных комнат на объектах Усть-Луга, Свободный и Казань'
                    : 'Ust-Luga, Svobodny ve Kazan kamplarında tek tıkla oda ve yatak sorgulama'}
                </p>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 font-normal">
                {lang === 'ru' ? 'Живая интеграция' : 'Canlı Entegrasyon'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: How It Works & Value Proposition */}
        <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-wider text-teal-600 dark:text-teal-400 font-normal">
                {lang === 'ru' ? 'Умная логистика городков' : 'Akıllı Kamp Lojistiği'}
              </span>
            </div>
            <h3 className="text-lg text-slate-900 dark:text-white font-normal leading-snug">
              {lang === 'ru'
                ? 'Безупречное управление проживанием тысяч строителей'
                : 'Binlerce Çalışanın Konaklama ve Hijyen Süreçlerini Kusursuz Yönetin'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
              {lang === 'ru'
                ? 'Регистрация прибывающих групп занимает считанные секунды. Автоматическая оптимизация свободных коек:'
                : 'Şantiyeye yeni gelen kafilelerin kamp kayıtları saniyeler içinde tamamlanır. Boş yataklar ve oda konforu otomatik optimize edilir:'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-teal-50/60 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/50">
              <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center text-xs shrink-0 font-normal">
                1
              </div>
              <div>
                <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                  {lang === 'ru' ? 'Заселение по NFC паспорту' : 'NFC Pasaportla Otomatik Check-in'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'Рабочий прикладывает паспорт к NFC телефону коменданта; система сверяет данные в eBA и выдает комнату.'
                    : 'İşçi kamp kapısına geldiğinde telefon NFC’sine pasaportunu dokundurur; eBA siciliyle eşleşip oda anahtarı tahsis edilir.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 font-normal">
                2
              </div>
              <div>
                <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                  {lang === 'ru' ? 'Алгоритм совместимости смен и бригад' : 'Vardiya & Ekip Uyum Algoritması'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'Сотрудники ночной и дневной смен не заселяются в одну комнату, что гарантирует полноценный отдых.'
                    : 'Gece vardiyasında çalışan işçilerle gündüz çalışanlar aynı odaya verilmez; dinlenme kalitesi ve iş güvenliği maksimize edilir.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 font-normal">
                3
              </div>
              <div>
                <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                  {lang === 'ru' ? 'Освобождение коек при увольнении' : 'Boş Yatak & Çıkış Tahliye Takibi'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'При оформлении увольнения место в городке сразу переходит в статус "Санобработка" и готовится для нового рабочего.'
                    : 'İşten ayrılan personelin lojmandaki yatağı anında düşer, dezenfeksiyon uyarısı verilir ve yeni gelen işçiye açılır.'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Библиотека Powerise Общежития' : 'Powerise Obshchezhitiye Kütüphanesi'}</span>
            <span className="text-teal-600 dark:text-teal-400 font-normal">
              {lang === 'ru' ? 'Коммерческий модуль' : 'Satın Alınabilir Modül'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'Коечный фонд' : 'Toplam Yatak Kapasitesi'}</span>
            <Bed className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">4.850 {lang === 'ru' ? 'мест' : 'Yatak'}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            {lang === 'ru' ? '3 основных городка' : '3 Ana Şantiye Kamp Alanı'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'Фактически проживает' : 'Fiilen Kalan İşçi'}</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400 font-normal">4.238 {lang === 'ru' ? 'чел.' : 'Kişi'}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            {lang === 'ru' ? 'Занятость: %87.4' : 'Aktif Konaklama (%87.4)'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'Свободных мест' : 'Anında Rezerve Edilebilir Boş'}</span>
            <DoorClosed className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl text-indigo-600 dark:text-indigo-400 font-normal">528 {lang === 'ru' ? 'мест' : 'Yatak'}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            {lang === 'ru' ? 'Готово к приему вахты' : 'Yeni kafileler için hazır'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'На санобработке / Ремонт' : 'Bakım / Temizlikte'}</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl text-amber-600 dark:text-amber-400 font-normal">84 {lang === 'ru' ? 'мест' : 'Yatak'}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            {lang === 'ru' ? 'Плановая дезинфекция' : 'Rutin hijyen ve tamirat'}
          </div>
        </div>
      </div>

      {/* Interactive Room & Block Matrix */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base text-slate-900 dark:text-white font-normal">
              {lang === 'ru' ? 'Реестр комнат и блоков' : 'Kamp Blokları & Örnek Oda Tahsis Listesi'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
              {lang === 'ru'
                ? 'Статус комнат, заполняемость и языковая совместимость бригад'
                : 'Blok, oda ve kişi bazlı doluluk durumu ve ekip eşleşmeleri'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setSelectedBlock('all')}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-normal cursor-pointer ${
                  selectedBlock === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ru' ? 'Все блоки' : 'Tüm Bloklar'}
              </button>
              <button
                onClick={() => setSelectedBlock('A Blok')}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-normal cursor-pointer ${
                  selectedBlock === 'A Blok'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ru' ? 'Городок Усть-Луга' : 'Ust-Luga Kampı'}
              </button>
              <button
                onClick={() => setSelectedBlock('C Blok')}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-normal cursor-pointer ${
                  selectedBlock === 'C Blok'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ru' ? 'Городок Казань' : 'Kazan Kampı'}
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={lang === 'ru' ? 'Комната, блок, объект...' : 'Oda no, blok, şantiye...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-white focus:outline-hidden font-normal"
              />
            </div>
          </div>
        </div>

        {/* Room Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room) => (
            <div
              key={room.id}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-teal-500/50 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm text-slate-900 dark:text-white font-normal flex items-center gap-1.5">
                    <DoorClosed className="w-4 h-4 text-teal-500" />
                    <span>{lang === 'ru' ? room.room_numberRu : room.room_number}</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                    {lang === 'ru' ? room.blockRu : room.block}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-normal ${
                    room.status === 'Dolu'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : room.status === 'Müsait'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {room.status === 'Dolu'
                    ? lang === 'ru'
                      ? 'Занята'
                      : 'Dolu'
                    : room.status === 'Müsait'
                    ? lang === 'ru'
                      ? 'Свободна'
                      : 'Müsait'
                    : lang === 'ru'
                    ? 'Санобработка'
                    : 'Bakım / Dezenfeksiyon'}
                </span>
              </div>

              {/* Progress & Capacity */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  <span>{lang === 'ru' ? 'Заполняемость' : 'Kapasite Doluluğu'}</span>
                  <span>
                    {room.occupied} / {room.capacity} {lang === 'ru' ? 'мест' : 'Yatak'}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      room.occupied === room.capacity
                        ? 'bg-rose-500'
                        : room.occupied === 0
                        ? 'bg-slate-400'
                        : 'bg-teal-500'
                    }`}
                    style={{ width: `${(room.occupied / room.capacity) * 100}%` }}
                  />
                </div>
              </div>

              {/* Resident tags */}
              <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                <div className="text-[10.5px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru' ? room.nationality_focusRu : room.nationality_focus}
                </div>
                {room.residents.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {room.residents.map((r, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-normal"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 italic font-normal">
                    {lang === 'ru' ? 'Нет жильцов (Свободная комната)' : 'Kayıtlı sakin yok (Boş oda)'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
