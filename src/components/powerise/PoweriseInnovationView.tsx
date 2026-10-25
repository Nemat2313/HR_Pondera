'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function PoweriseInnovationView() {
  const { lang } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<'video' | 'nfc' | 'geofence' | 'puantaj'>('video');

  return (
    <div className="p-6 lg:p-8 space-y-8 font-normal max-w-7xl mx-auto">
      {/* Header Banner */}
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
                  {lang === 'ru' ? 'Готовые модули' : 'Hazır Modüller'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                {lang === 'ru'
                  ? 'NFC считывание паспортов, полигоны Geofencing и 3-уровневая сверка табелей (Powerise App)'
                  : 'NFC pasaport çipi okuma, saha poligon geofencing ve turnike-formen-puantör 3 katmanlı puantaj doğrulama vitrini'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
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

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('video')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'video'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? 'Видео-презентация' : '1. Tanıtım Videosu & Genel Bakış'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('nfc')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'nfc'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? 'NFC Паспорт' : '2. NFC Pasaport Okuma Mobil'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('geofence')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'geofence'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? 'Полигоны и Geofencing' : '3. Saha Poligon & Konum Takibi'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('puantaj')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'puantaj'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? '3-Уровневый Табель' : "4. 3'lü Puantaj Konsolidasyonu"}</span>
        </button>
      </div>

      {/* SUB-TAB 1: VIDEO SHOWCASE */}
      {activeSubTab === 'video' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Video Player Card */}
          <div className="rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl">
            <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 to-slate-950 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs text-white uppercase tracking-wider font-normal">
                  {lang === 'ru'
                    ? 'Официальный ролик Powerise: Мобильные технологии для строительных объектов'
                    : 'Resmi Powerise Tanıtım Videosu: Mobil Saha, NFC & 3 Katmanlı Puantaj'}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-normal">HD 1080p</span>
            </div>

            {/* Responsive 16:9 YouTube Embed */}
            <div className="relative w-full aspect-video bg-black">
              <iframe
                src="https://www.youtube.com/embed/UQWgBJtFEJU?rel=0&modestbranding=1"
                title="Powerise Mobile & Field Innovation"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>

            <div className="p-5 sm:p-6 bg-slate-900/90 text-slate-300 text-xs leading-relaxed border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 font-normal">
              <div>
                <strong className="text-white font-normal">Powerise Mimari Özeti:</strong> Bu video, sahada binlerce çalışanın NFC pasaport ile anında sisteme kaydedilmesini, Formen Mobil ile saatlerin toplanmasını, poligon bazlı konum kontrolünü ve turnike verileriyle çapraz puantaj onayını canlı olarak göstermektedir.
              </div>
              <div className="shrink-0 text-slate-400 text-[11px] font-normal">
                Kaynak: C:\Users\nemat\Powerise
              </div>
            </div>
          </div>

          {/* 3 Value Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div
              onClick={() => setActiveSubTab('nfc')}
              className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <ScanLine className="w-5 h-5" />
              </div>
              <h3 className="text-sm text-slate-900 dark:text-white font-normal mb-1">
                NFC & Biyometrik Pasaport Okuma
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Pasaport çipinden ICAO standardında biyometrik fotoğraf ve MRZ verisini saniyeler içinde çekme. Sıfır yazım hatası.
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-normal">
                <span>Detayları İncele</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div
              onClick={() => setActiveSubTab('geofence')}
              className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm hover:border-teal-500 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Compass className="w-5 h-5" />
              </div>
              <h3 className="text-sm text-slate-900 dark:text-white font-normal mb-1">
                Saha Poligon Haritası & Geofencing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Şantiye haritasına sektör poligonları çizerek çalışanların hangi sahada ve binada bulunduğunu anlık izleme.
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 font-normal">
                <span>Detayları İncele</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div
              onClick={() => setActiveSubTab('puantaj')}
              className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-500 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm text-slate-900 dark:text-white font-normal mb-1">
                Turnike + Formen + Puantör
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Turnike giriş-çıkışları, formen mobil girişleri ve bağımsız puantör gözlemleriyle 3 katmanlı kusursuz puantaj.
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-normal">
                <span>Detayları İncele</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: NFC & BIOMETRIC PASSPORT */}
      {activeSubTab === 'nfc' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-4">
              <span className="text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-normal">
                ICAO 9303 Temassız Çip Okuma
              </span>
              <h2 className="text-2xl text-slate-900 dark:text-white font-normal leading-snug">
                Akıllı Telefon ile Saniyeler İçinde Pasaport Doğrulama ve Kayıt
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                Özbekistan, Hindistan, Türkiye ve SNG ülkelerinin biyometrik pasaportlarındaki NFC çipleri telefon kamerası ve anteniyle okunur. Yüksek çözünürlüklü yüz fotoğrafı doğrudan çipten alınır, sahte pasaport ve tahrifat riski sıfıra indirilir.
              </p>

              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Kriptografik İmza Teyidi: Belgenin devlet otoritesi tarafından basıldığını anında teyit eder.</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Dijital Biyometrik Fotoğraf: Yüksek çözünürlüklü yüz görseli kart ve giriş kartlarına otomatik aktarılır.</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>EBA & Pondera HR Otomatik Entegrasyonu: Manuel veri girişine gerek kalmadan sicil kartı açılır.</span>
                </div>
              </div>
            </div>

            {/* Mobile NFC Reader Mockup Card */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 text-white border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400 font-normal">NFC Anteni Aktif • Pasaportu Yaklaştırın</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-normal">Powerise Mobile v3.2</span>
              </div>

              {/* Simulated Chip Data Readout */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 font-normal">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-xs font-normal">
                    <Users className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ICAO Çip Doğrulandı (100%)
                    </span>
                    <h4 className="text-sm text-white font-normal">RAKHMATOV SHAVKAT</h4>
                    <p className="text-xs text-slate-400 font-normal">Pasaport: FA 1982736 • UZB (Özbekistan)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800 text-slate-300 font-normal">
                  <div>Doğum Tarihi: <span className="text-white">14.06.1989</span></div>
                  <div>Geçerlilik: <span className="text-emerald-400">12.05.2031</span></div>
                  <div>Cinsiyet: <span className="text-white">Erkek</span></div>
                  <div>Çip Durumu: <span className="text-emerald-400">Orijinal İmza</span></div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-normal pt-1">
                <span>Powerise Pasaport Okuma Kütüphanesi</span>
                <span className="text-emerald-400">Aktarıma Hazır</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: GEOFENCING & POLYGON TRACKING */}
      {activeSubTab === 'geofence' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="space-y-4">
              <span className="text-xs uppercase tracking-wider text-teal-600 dark:text-teal-400 font-normal">
                Saha Alanı & Sektör Yönetimi
              </span>
              <h2 className="text-2xl text-slate-900 dark:text-white font-normal leading-snug">
                Şantiye Haritasında Poligon Çizerek Personelin Bulunduğu Yeri Görme
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                Büyük ölçekli şantiyelerde (Kazan, Svobodny AGHK, Ust-Luga) harita üzerinde poligon çizilerek çalışma bölgeleri tanımlanır. Çalışanların Formen mobil uygulaması ve saha Bluetooth/GPS antenleri aracılığıyla hangi poligonda kaç saat geçirdiği şeffaf olarak raporlanır.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-normal">Poligon 1: Reaktör Alanı</div>
                  <div className="text-lg text-emerald-600 dark:text-emerald-400 font-normal mt-0.5">842 Personel</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-normal">Poligon 2: Boru İskele Hattı</div>
                  <div className="text-lg text-teal-600 dark:text-teal-400 font-normal mt-0.5">1.215 Personel</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-normal">Poligon 3: Prefabrik İmalat</div>
                  <div className="text-lg text-indigo-600 dark:text-indigo-400 font-normal mt-0.5">380 Personel</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-normal">Yetkisiz Bölge Alarmı</div>
                  <div className="text-lg text-rose-600 dark:text-rose-400 font-normal mt-0.5">0 İhlal</div>
                </div>
              </div>
            </div>

            {/* Visual Polygon Map Representation */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-white">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs text-slate-300 font-normal">Şantiye Geofence Harita Katmanı (Simülasyon)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-normal">
                  GPS & BLE Doğruluk: ±1.5m
                </span>
              </div>

              {/* Polygon Map Canvas SVG */}
              <div className="relative aspect-[16/10] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 p-4 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 400 250">
                  {/* Grid Lines */}
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="400" height="250" fill="url(#grid)" />

                  {/* Polygon 1: Green Area */}
                  <polygon
                    points="30,40 160,30 180,120 50,130"
                    fill="rgba(16, 185, 129, 0.2)"
                    stroke="#10B981"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <text x="50" y="70" fill="#10B981" fontSize="10" fontFamily="Tahoma">SEKTÖR A (842 Kişi)</text>

                  {/* Polygon 2: Blue Area */}
                  <polygon
                    points="200,40 370,50 350,160 210,140"
                    fill="rgba(14, 165, 233, 0.2)"
                    stroke="#0EA5E9"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <text x="230" y="80" fill="#0EA5E9" fontSize="10" fontFamily="Tahoma">SEKTÖR B - BORU (1.215 Kişi)</text>

                  {/* Polygon 3: Purple Area */}
                  <polygon
                    points="80,150 260,160 240,230 70,220"
                    fill="rgba(139, 92, 246, 0.2)"
                    stroke="#8B5CF6"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <text x="100" y="190" fill="#8B5CF6" fontSize="10" fontFamily="Tahoma">ATÖLYE & İMALAT (380 Kişi)</text>

                  {/* Real-time Personnel Dots */}
                  <circle cx="90" cy="90" r="2.5" fill="#10B981" className="animate-ping" />
                  <circle cx="90" cy="90" r="2" fill="#10B981" />
                  <circle cx="280" cy="100" r="2.5" fill="#0EA5E9" className="animate-ping" />
                  <circle cx="280" cy="100" r="2" fill="#0EA5E9" />
                  <circle cx="160" cy="190" r="2.5" fill="#8B5CF6" className="animate-ping" />
                  <circle cx="160" cy="190" r="2" fill="#8B5CF6" />
                </svg>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 font-normal">
                <span>Otomatik Giriş/Çıkış Damgası</span>
                <span className="text-teal-400">Haritada Poligon Çizme Aktif</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: 3-TIER PUANTAJ CONSOLIDATION */}
      {activeSubTab === 'puantaj' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="space-y-3">
            <span className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-normal">
              Turnike (ACS) + Formen Mobil + Bağımsız Puantör
            </span>
            <h2 className="text-2xl text-slate-900 dark:text-white font-normal leading-snug">
              Günlük Puantajı Onaya Sunma: 3 Katmanlı Çapraz Doğrulama
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal max-w-3xl">
              Turnikeden geçen fiziksel saatler, formenin mobil uygulamadan ekibi için girdiği saatler ve bağımsız puantörün sahada bizzat tuttuğu gözlem verileri tek ekranda çapraz eşleştirilir. Tutarsızlıklar otomatik işaretlenir ve şeffaf puantaj yönetici onayına sunulur.
            </p>
          </div>

          {/* 3 Columns Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Column 1: Turnike */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">1. Katman</span>
                <span className="px-2 py-0.5 text-[10px] rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-normal">
                  Turnike (ACS)
                </span>
              </div>
              <h3 className="text-sm text-slate-900 dark:text-white font-normal">
                Fiziksel Kapı & Turnike Kaydı
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Şantiye giriş ve çıkış turnikelerindeki elektronik kart veya yüz okuma logları. Şantiyede geçirilen brüt süre.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1 font-normal">
                <div className="flex justify-between"><span>Giriş:</span><span className="text-slate-900 dark:text-white">07:46</span></div>
                <div className="flex justify-between"><span>Çıkış:</span><span className="text-slate-900 dark:text-white">18:14</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 text-blue-600 dark:text-blue-400"><span>Turnike Süresi:</span><span>10.5 Saat</span></div>
              </div>
            </div>

            {/* Column 2: Formen Mobil */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">2. Katman</span>
                <span className="px-2 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-normal">
                  Formen Mobil
                </span>
              </div>
              <h3 className="text-sm text-slate-900 dark:text-white font-normal">
                Formen Saha Çalışma Bildirimi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Ekipbaşının veya ustanın kendi ekibindeki işçiler için mobil uygulamadan onayladığı net çalışma saati ve mesai.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1 font-normal">
                <div className="flex justify-between"><span>Normal Mesai:</span><span className="text-slate-900 dark:text-white">8.0 Saat</span></div>
                <div className="flex justify-between"><span>Fazla Mesai:</span><span className="text-slate-900 dark:text-white">+2.0 Saat</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 text-amber-600 dark:text-amber-400"><span>Formen Bildirimi:</span><span>10.0 Saat</span></div>
              </div>
            </div>

            {/* Column 3: Puantör */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">3. Katman</span>
                <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-normal">
                  Puantör Saha
                </span>
              </div>
              <h3 className="text-sm text-slate-900 dark:text-white font-normal">
                Bağımsız Puantör Gözlemi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Şantiye İK puantörünün sahayı bizzat gezerek sektörde işçiyi fiziken gördüğü ve teyit ettiği bağımsız kontrol.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1 font-normal">
                <div className="flex justify-between"><span>Sabah Kontrolü:</span><span className="text-emerald-600">Mevcut (Sektör B)</span></div>
                <div className="flex justify-between"><span>Öğleden Sonra:</span><span className="text-emerald-600">Mevcut (Sektör B)</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 text-emerald-600 dark:text-emerald-400"><span>Puantör Onayı:</span><span>Tam Teyit (10 Saat)</span></div>
              </div>
            </div>
          </div>

          {/* Verification Decision Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row items-center justify-between gap-4 font-normal">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                  3 Katmanlı Konsolidasyon Motoru: %99.2 Uyum Oranı
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-normal">
                  Turnike, Formen ve Puantör saatleri eşleştiğinde otomatik yeşil onay verilir; sapmalı kayıtlar yöneticinin önüne ayrıştırılarak düşer.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-normal shadow-sm whitespace-nowrap cursor-pointer transition-all"
            >
              Günlük Puantajı Onaya Sun (Simüle Et)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
