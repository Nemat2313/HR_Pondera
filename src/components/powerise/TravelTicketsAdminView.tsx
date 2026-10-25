'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  Plane,
  Train,
  Sparkles,
  UploadCloud,
  FileText,
  CheckCircle2,
  Calendar,
  MapPin,
  Users,
  Search,
  Download,
  Filter,
  ArrowRight,
  TrendingUp,
  CreditCard,
  Building2,
  Clock,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface TicketItem {
  id: string;
  passenger_name: string;
  passport_no: string;
  transport_type: 'flight' | 'train';
  carrier: string;
  carrierRu: string;
  route_from: string;
  route_fromRu: string;
  route_to: string;
  route_toRu: string;
  project: string;
  projectRu: string;
  travel_date: string;
  ticket_cost: string;
  ai_status: string;
  ticket_code: string;
}

const SAMPLE_TICKETS: TicketItem[] = [
  {
    id: 'TCK-2026-001',
    passenger_name: 'MAMASOAT KHURRAMOV',
    passport_no: 'FA 4210519',
    transport_type: 'flight',
    carrier: 'Uzbekistan Airways (HY-631)',
    carrierRu: 'Uzbekistan Airways (HY-631)',
    route_from: 'Taşkent (TAS)',
    route_fromRu: 'Ташкент (TAS)',
    route_to: 'St. Petersburg (LED)',
    route_toRu: 'Санкт-Петербург (LED)',
    project: 'Ust-Luga Kompleksi',
    projectRu: 'Усть-Луга Комплекс',
    travel_date: '28.10.2026 04:30',
    ticket_cost: '28.450 ₽',
    ai_status: '%99.8 OCR',
    ticket_code: 'AER-LED-9021',
  },
  {
    id: 'TCK-2026-002',
    passenger_name: 'RAJESH KUMAR',
    passport_no: 'Z 8492019',
    transport_type: 'flight',
    carrier: 'Air India / Aeroflot (AI-1945)',
    carrierRu: 'Air India / Аэрофлот (AI-1945)',
    route_from: 'Delhi (DEL)',
    route_fromRu: 'Дели (DEL)',
    route_to: 'Moskova Şeremetyevo (SVO)',
    route_toRu: 'Москва Шереметьево (SVO)',
    project: 'Kazan Gaz-Kimya',
    projectRu: 'Казань Газ-Химия',
    travel_date: '29.10.2026 12:15',
    ticket_cost: '44.800 ₽',
    ai_status: '%99.8 OCR',
    ticket_code: 'AER-SVO-1182',
  },
  {
    id: 'TCK-2026-003',
    passenger_name: 'SARDORBEK FOZILOV',
    passport_no: 'AA 1209384',
    transport_type: 'train',
    carrier: 'RZD Sapsan (758A)',
    carrierRu: 'РЖД Сапсан (758A)',
    route_from: 'Moskova (Leningradskiy)',
    route_fromRu: 'Москва (Ленинградский)',
    route_to: 'St. Petersburg (Moskovskiy)',
    route_toRu: 'Санкт-Петербург (Московский)',
    project: 'Ust-Luga Kompleksi',
    projectRu: 'Усть-Луга Комплекс',
    travel_date: '26.10.2026 07:00',
    ticket_cost: '4.850 ₽',
    ai_status: '%99.8 OCR',
    ticket_code: 'RZD-SAP-8831',
  },
  {
    id: 'TCK-2026-004',
    passenger_name: 'BAKYTBEK ASANOV',
    passport_no: 'AC 551920',
    transport_type: 'train',
    carrier: 'RZD Rossiya (002M)',
    carrierRu: 'РЖД Россия (002M)',
    route_from: 'Moskova (Yaroslavskiy)',
    route_fromRu: 'Москва (Ярославский)',
    route_to: 'Belogorsk / Svobodny',
    route_toRu: 'Белогорск / Свободный',
    project: 'Svobodny AGHK',
    projectRu: 'Свободный АГХК',
    travel_date: '30.10.2026 23:45',
    ticket_cost: '14.200 ₽',
    ai_status: '%99.8 OCR',
    ticket_code: 'RZD-RUS-4409',
  },
  {
    id: 'TCK-2026-005',
    passenger_name: 'SHAVKAT RAKHMATOV',
    passport_no: 'FA 1982736',
    transport_type: 'flight',
    carrier: 'Aeroflot (SU-1240)',
    carrierRu: 'Аэрофлот (SU-1240)',
    route_from: 'Samara (KUF)',
    route_fromRu: 'Самара (KUF)',
    route_to: 'Tyumen Roşçino (TJM)',
    route_toRu: 'Тюмень Рощино (TJM)',
    project: 'Tobolsk DGP-2',
    projectRu: 'Тобольск ДГП-2',
    travel_date: '27.10.2026 09:20',
    ticket_cost: '11.600 ₽',
    ai_status: '%99.8 OCR',
    ticket_code: 'AER-TJM-3301',
  },
];

export default function TravelTicketsAdminView() {
  const { lang } = useLanguage();
  const [filterType, setFilterType] = useState<'all' | 'flight' | 'train'>('all');
  const [search, setSearch] = useState('');

  const filtered = SAMPLE_TICKETS.filter((t) => {
    if (filterType !== 'all' && t.transport_type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.passenger_name.toLowerCase().includes(q) ||
        t.passport_no.toLowerCase().includes(q) ||
        t.project.toLowerCase().includes(q) ||
        t.route_from.toLowerCase().includes(q) ||
        t.route_to.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 lg:p-8 space-y-8 font-normal max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-50/90 via-white to-slate-50 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 border border-indigo-100 dark:border-slate-800 text-slate-900 dark:text-white shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl text-slate-900 dark:text-white tracking-tight font-normal">
                  {lang === 'ru'
                    ? 'АХО • Умное распознавание билетов (AI OCR)'
                    : 'İdari İşler • AI ile Uçak & Tren Bilet Yönetimi'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-normal flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  {lang === 'ru' ? 'Powerise AI Модуль' : 'Powerise Satılık İnovasyon Modülü'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-normal">
                {lang === 'ru'
                  ? 'Автоматическое считывание PDF билетов (РЖД, Аэрофлот, S7), привязка к сотрудникам и учет расходов по объектам'
                  : 'RZD tren ve havayolu PDF biletlerini yapay zeka ile anında ayrıştırma, çalışana, şantiyeye ve bütçeye otomatik bağlama'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800/80 border border-indigo-100 dark:border-slate-700/80 text-right shadow-2xs">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                {lang === 'ru' ? 'Распознано ИИ' : 'AI ile Ayrıştırılan'}
              </div>
              <div className="text-base text-indigo-600 dark:text-indigo-400 font-normal">1.842 {lang === 'ru' ? 'билетов' : 'Bilet'}</div>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-right shadow-2xs">
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-normal">
                {lang === 'ru' ? 'Точность OCR' : 'OCR Başarısı'}
              </div>
              <div className="text-base text-emerald-600 dark:text-emerald-300 font-normal">%99.8</div>
            </div>
          </div>
        </div>
      </div>

      {/* Showcase Visual Card (Generated Image + Features) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: AI OCR Showcase Image */}
        <div className="lg:col-span-7 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-lg relative group">
          <div className="relative aspect-[16/10] w-full bg-slate-950">
            <Image
              src="/images/powerise/ai_ticket_admin_showcase.jpg"
              alt="AI Uçak ve Tren Bilet Tarama Vitrini"
              fill
              className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700 text-white text-[11px] font-normal flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{lang === 'ru' ? 'Модуль Vision AI OCR' : 'Yapay Zeka (AI Vision) OCR Motoru'}</span>
            </div>
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
              <div>
                <p className="text-xs text-slate-200 font-normal">
                  {lang === 'ru' ? 'Пакетный импорт PDF и электронных билетов' : 'Toplu PDF ve E-Bilet İçe Aktarma'}
                </p>
                <p className="text-[10.5px] text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'ФИО, паспорт, маршрут, вагон/место и сумма извлекаются за 1.5 секунды'
                    : 'İsim, Pasaport No, Kalkış-Varış, Koltuk, Tutar 1.5 saniyede çıkarılır'}
                </p>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-normal">
                {lang === 'ru' ? 'Проверено' : 'Doğrulandı'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: How It Works & Value Proposition */}
        <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-normal">
                {lang === 'ru' ? 'Автоматизация АХО Powerise' : 'Powerise İdari İşler Otomasyonu'}
              </span>
            </div>
            <h3 className="text-lg text-slate-900 dark:text-white font-normal leading-snug">
              {lang === 'ru'
                ? 'Конец многодневному ручному вводу билетов в отделе АХО'
                : 'İdari İşler Departmanında Günler Süren Manuel Bilet Girişine Son'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
              {lang === 'ru'
                ? 'На крупные стройки ежемесячно прибывают сотни специалистов. Специалист АХО просто перетаскивает пачку PDF-билетов в систему, а Vision AI мгновенно обрабатывает их:'
                : 'Büyük şantiyelere her ay yüzlerce usta ve mühendis taşınır. İdari işler yetkilisi gelen e-bilet PDF’lerini sisteme sürükleyip bıraktığında AI motoru:'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs shrink-0 font-normal">
                1
              </div>
              <div>
                <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                  {lang === 'ru' ? 'Загрузка 100+ билетов за раз' : 'Tek Seferde 100+ PDF Bilet Yükleme'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'Билеты РЖД, посадочные талоны и электронные квитанции любых авиакомпаний распознаются без шаблонов.'
                    : 'RZD tren biletleri ve uçak biniş kartları format fark etmeksizin saniyeler içinde ayrıştırılır.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-teal-50/60 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/50">
              <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center text-xs shrink-0 font-normal">
                2
              </div>
              <div>
                <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                  {lang === 'ru' ? 'Связка с табельным номером и проектом' : 'Personel Sicili & Proje Eşleşmesi'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'Паспортные данные из билета автоматически находят сотрудника в Pondera HR и закрепляют билет за его сметой.'
                    : 'Bilet üzerindeki pasaport no ve isim Pondera HR veri tabanı ile otomatik eşleşir, doğru şantiyeye zimmetlenir.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 font-normal">
                3
              </div>
              <div>
                <h4 className="text-xs text-slate-900 dark:text-white font-normal">
                  {lang === 'ru' ? 'Отчет по расходам и переброске' : 'Lojistik Maliyet & Sevk Raporu'}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  {lang === 'ru'
                    ? 'Расходы на логистику по объектам и списки сотрудников в пути выгружаются в Excel одним кликом.'
                    : 'Şantiye başına seyahat giderleri, harcanan bütçe ve yoldaki personel listesi anlık Excel olarak alınır.'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{lang === 'ru' ? 'Внедрение: 1-2 рабочих дня' : 'Entegrasyon: 1-2 İş Günü'}</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-normal">
              {lang === 'ru' ? 'Готово к лицензированию' : 'Satın Alma & Lisanslama İçin Hazır'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'Билетов за месяц' : 'Bu Ay Kesilen Bilet'}</span>
            <Plane className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl text-slate-900 dark:text-white font-normal">342 {lang === 'ru' ? 'шт.' : 'Adet'}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            189 {lang === 'ru' ? 'Авиа' : 'Uçak'} • 153 {lang === 'ru' ? 'Поезд (РЖД)' : 'Tren (RZD)'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'Командировочный бюджет' : 'Seyahat Bütçesi'}</span>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl text-emerald-600 dark:text-emerald-400 font-normal">4.680.200 ₽</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            {lang === 'ru' ? 'Исполнение бюджета: %94.2' : 'Bütçe Uyum: %94.2 (Optimum)'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'В пути / На переброске' : 'Yoldaki / Transferde'}</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl text-amber-600 dark:text-amber-400 font-normal">28 {lang === 'ru' ? 'чел.' : 'Personel'}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            {lang === 'ru' ? 'Прибытие ожидается сегодня' : 'Bugün şantiyeye varış bekleniyor'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-normal">{lang === 'ru' ? 'Основной пункт назначения' : 'En Çok Sevk Alan Saha'}</span>
            <Building2 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl text-teal-600 dark:text-teal-400 font-normal">
            {lang === 'ru' ? 'Усть-Луга' : 'Ust-Luga'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-normal">
            142 {lang === 'ru' ? 'билета (доля 41.5%)' : 'Bilet (%41.5 Pay)'}
          </div>
        </div>
      </div>

      {/* Interactive Table: AI Parsed Tickets */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base text-slate-900 dark:text-white font-normal">
              {lang === 'ru' ? 'Журнал электронных билетов' : 'Son Ayrıştırılan Biletler & Sevk Listesi'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
              {lang === 'ru'
                ? 'Маршруты, пассажиры и затраты, автоматически извлеченные ИИ из PDF-файлов'
                : 'Yapay zeka tarafından PDF’lerden otomatik çıkarılan güzergah, yolcu ve maliyet kayıtları'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Buttons */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-normal cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ru' ? 'Все (5)' : 'Tümü (5)'}
              </button>
              <button
                onClick={() => setFilterType('flight')}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-normal cursor-pointer flex items-center gap-1 ${
                  filterType === 'flight'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Plane className="w-3 h-3" />
                {lang === 'ru' ? 'Авиа (3)' : 'Uçak (3)'}
              </button>
              <button
                onClick={() => setFilterType('train')}
                className={`px-3 py-1 text-xs rounded-lg transition-all font-normal cursor-pointer flex items-center gap-1 ${
                  filterType === 'train'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Train className="w-3 h-3" />
                {lang === 'ru' ? 'РЖД (2)' : 'Tren / RZD (2)'}
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={lang === 'ru' ? 'Пассажир, паспорт, объект...' : 'Yolcu, pasaport, şantiye...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-white focus:outline-hidden font-normal"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-normal">
                <th className="py-2.5 px-3">{lang === 'ru' ? 'Пассажир / Работник' : 'Yolcu / Personel'}</th>
                <th className="py-2.5 px-3">{lang === 'ru' ? 'Рейс / Перевозчик' : 'Ulaşım / Sefer'}</th>
                <th className="py-2.5 px-3">{lang === 'ru' ? 'Маршрут поездки' : 'Kalkış & Varış Güzergahı'}</th>
                <th className="py-2.5 px-3">{lang === 'ru' ? 'Объект назначения' : 'Atanan Şantiye'}</th>
                <th className="py-2.5 px-3">{lang === 'ru' ? 'Дата поездки' : 'Seyahat Tarihi'}</th>
                <th className="py-2.5 px-3">{lang === 'ru' ? 'Стоимость' : 'Tutar'}</th>
                <th className="py-2.5 px-3 text-right">{lang === 'ru' ? 'Статус ИИ' : 'AI Durumu'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-normal">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="text-slate-900 dark:text-white font-normal">{item.passenger_name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">{item.passport_no}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-normal">
                      {item.transport_type === 'flight' ? (
                        <Plane className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      ) : (
                        <Train className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      )}
                      <span>{lang === 'ru' ? item.carrierRu : item.carrier}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono font-normal">{item.ticket_code}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-normal">
                      <span>{lang === 'ru' ? item.route_fromRu : item.route_from}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-slate-900 dark:text-white">
                        {lang === 'ru' ? item.route_toRu : item.route_to}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-normal">
                    {lang === 'ru' ? item.projectRu : item.project}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-normal">
                    {item.travel_date}
                  </td>
                  <td className="py-3 px-3 text-slate-900 dark:text-white font-normal">
                    {item.ticket_cost}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10.5px] font-normal">
                      <CheckCircle2 className="w-3 h-3" />
                      {item.ai_status}
                    </span>
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
