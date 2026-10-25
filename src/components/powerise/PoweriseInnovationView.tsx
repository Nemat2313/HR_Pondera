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
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export default function PoweriseInnovationView() {
  const { lang } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<
    'video' | 'nfc' | 'geofence' | 'puantaj' | 'tickets' | 'camp'
  >('nfc');

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
                  {lang === 'ru' ? 'Готовые модули' : 'Hazır & Entegre Edilebilir'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
                {lang === 'ru'
                  ? 'NFC считывание паспортов, полигоны Geofencing, 3-уровневая сверка табелей, умные билеты и общежития'
                  : 'NFC pasaport okuma, eBA otomatik sicil açılışı, şantiye poligon geofencing ve turnike-formen-puantör 3 katmanlı puantaj'}
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

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('nfc')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'nfc'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? '1. NFC Паспорт & eBA' : '1. NFC Pasaport & eBA Sicil'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('geofence')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'geofence'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? '2. Полигоны на карте' : '2. Saha Poligon & Personel Haritası'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('puantaj')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'puantaj'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? '3. 3-Уровневый Табель' : "3. 3'lü Puantaj Konsolidasyonu"}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('tickets')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'tickets'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Plane className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? '4. AI Билеты (АХО)' : '4. AI Uçak & Tren Biletleri'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('camp')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'camp'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? '5. Общежития и Городок' : '5. Şantiye Kamp & Lojman'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('video')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer font-normal ${
            activeSubTab === 'video'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>{lang === 'ru' ? 'Видео-презентация' : 'YouTube Video Tanıtımı'}</span>
        </button>
      </div>

      {/* SUB-TAB 1: NFC & BIOMETRIC PASSPORT -> EBA SİCİL AÇILIŞI */}
      {activeSubTab === 'nfc' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Hero Showcase Card */}
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
                  <span>ICAO 9303 Çip Okuma Motoru</span>
                </div>
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                  <div>
                    <p className="text-xs text-slate-200 font-normal">Pasaport Çipinden Doğrudan Biyometri & Sicil Açma</p>
                    <p className="text-[10.5px] text-slate-400 font-normal">eBA İnsan Kaynakları sistemine 2.5 saniyede hatasız personel kartı oluşturulur</p>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-normal">
                    %100 Orijinal İmza
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Real Mobile NFC Reader UI */}
            <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C31] shadow-lg flex flex-col justify-between p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-xs text-slate-900 dark:text-white font-normal">Powerise Saha Mobil Uygulaması</span>
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-mono font-normal">iOS & Android</span>
                </div>
                <div className="mt-3 relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
                  <Image
                    src="/images/powerise/powerise_mobile_nfc.png"
                    alt="Powerise Mobil NFC Ekranı"
                    fill
                    className="object-cover object-top"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-800/50 text-xs text-slate-700 dark:text-slate-300 font-normal">
                <span className="text-emerald-700 dark:text-emerald-300 font-normal">İnternetsiz (Offline) Çalışma:</span> Şantiyede internet kesilse bile veriler yerel SQLite veritabanına şifrelenerek kaydedilir, internet geldiğinde eBA ve merkeze anında eşitlenir.
              </div>
            </div>
          </div>

          {/* Step-by-Step Flow Explanation (Adım Adım Nasıl Çalışıyor?) */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <h3 className="text-lg text-slate-900 dark:text-white font-normal">
                  NFC Pasaport ile eBA&apos;da Otomatik Sicil Açma Süreci (3 Adım)
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-normal">
                Manuel veri giriş hatasını sıfıra indiren ve işe giriş işlemlerini 20 dakikadan 3 saniyeye düşüren patentli iş akışı
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm font-normal shadow-sm">
                  1
                </div>
                <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                  NFC Çipine Telefonu Yaklaştırma
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                  İşe yeni başlayan yabancı personelin (Özbekistan, Hindistan, Türkiye vb.) biyometrik pasaportunun çipine mobil cihazın arkası yaklaştırılır. Kamera ve NFC anteni temassız protokolü (ICAO 9303) anında başlatır.
                </p>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-normal pt-1">
                  • Temassız & Hijyenik • Optik tarama gerekmez
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-3">
                <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center text-sm font-normal shadow-sm">
                  2
                </div>
                <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                  Kriptografik Doğrulama & Biyometrik Fotoğraf
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                  Devlet otoritelerinin elektronik imzası teyit edilir (sahte veya tahrif edilmiş pasaport imkansızdır). Çipin içindeki yüksek çözünürlüklü dijital vesikalık fotoğraf, MRZ, doğum tarihi ve pasaport bitiş süresi çözülür.
                </p>
                <div className="text-[11px] text-teal-600 dark:text-teal-400 font-normal pt-1">
                  • Sahtecilik %0 • Orijinal Dijital Vesikalık
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-normal shadow-sm">
                  3
                </div>
                <h4 className="text-sm text-slate-900 dark:text-white font-normal">
                  eBA & Pondera HR Otomatik Sicil Açılışı
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                  Tek bir harf dahi elle yazılmadan eBA İnsan Kaynakları sisteminde çalışan sicili açılır, şantiye lokasyonu ve departmanı atanır. Pasaport görseli e-arşive aktarılır ve onay akışı tetiklenir.
                </p>
                <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-normal pt-1">
                  • Sıfır Klavye Girişi • eBA Onay Akışı Aktif
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: POLİGONLAR VE GEOFENCING (RESİM 3 BİREBİR & ŞIK ENTEGRASYON) */}
      {activeSubTab === 'geofence' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Real Screenshot 3 Showcase */}
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
                    Kingisepp / Ust-Luga şantiyesinde poligon bazlı tarama, puantör kotaları ve personelin harita üzerindeki anlık pinleri
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-normal">
                  v2.5 Canlı BI
                </span>
                <span className="px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 text-[11px] font-normal">
                  1. Kontrol (Sabah) & 2. Kontrol (Akşam)
                </span>
              </div>
            </div>

            {/* The Actual Image: powerise_map_polygons.png */}
            <div className="relative aspect-[16/9] w-full bg-slate-950 overflow-hidden">
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
                <span className="text-slate-400 text-[11px]">Toplam Okutma:</span>
                <p className="text-slate-900 dark:text-white text-base">424 Personel</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Aktif Puantör:</span>
                <p className="text-teal-600 dark:text-teal-400 text-base">3 Saha Puantörü</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Örnek Personel Kartı:</span>
                <p className="text-slate-900 dark:text-white truncate">Mamasoat Khurramov (Boru Montaj)</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Saha Dışı Tarama:</span>
                <p className="text-emerald-600 dark:text-emerald-400 text-base">0 (Tam İhlalsiz Güvenlik)</p>
              </div>
            </div>
          </div>

          {/* Explanation Cards for Polygons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <h4 className="text-sm text-slate-900 dark:text-white font-normal flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-500" />
                <span>Harita Üzerinde Dinamik Poligon Çizimi</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Uydu haritası üzerinde parmakla veya fare ile reaktör binası, boru köprüsü, prefabrik atölyesi gibi çalışma alanları poligon olarak sınırlandırılır.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <h4 className="text-sm text-slate-900 dark:text-white font-normal flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <span>Puantör Hedef & Kota Analitiği</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Her puantöre atanan çalışan sayısı (örn. Sardorbek Fozilov: 162/167 %97 başarı) ve sabah/akşam kontrolleri gerçek zamanlı izlenir.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <h4 className="text-sm text-slate-900 dark:text-white font-normal flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-500" />
                <span>Kırmızı Kenarlık = Saha Dışı Alarmı</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                Şantiye sınırları dışından yapılan sahte okutmalar veya yanlış lokasyonlar sistem tarafından kırmızı kenarlıkla işaretlenir ve raporlanır.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: 3-SEVİYELİ PUANTAJ KONSOLİDASYONU (GERÇEK WEB RESMİ) */}
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
                    449 çalışanın NFC okuma saatleri, turnike girişleri ve 1./2. kontrollerinin çapraz doğrulanması
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-normal">
                  Çalıştı: 450 Kişi
                </span>
                <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-normal">
                  Saat Uyuşmazlığı: 0
                </span>
              </div>
            </div>

            {/* The Actual Image: powerise_web_timesheet.png */}
            <div className="relative aspect-[16/9] w-full bg-slate-950 overflow-hidden">
              <Image
                src="/images/powerise/powerise_web_timesheet.png"
                alt="Powerise Web Puantaj Giriş Konsolu"
                fill
                className="object-contain"
                priority
              />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-normal leading-relaxed">
              <strong className="text-slate-900 dark:text-white font-normal">Konsolidasyon Mantığı:</strong> Şantiye turnikesinden geçen personelin saati otomatik gelir. Formen sahada NFC kartını okutur (1. Kontrol). Bağımsız puantör akşam tekrar doğrular (2. Kontrol). Her 3 kaynak uyuştuğunda tek tıkla resmi bordro puantajı onaylanır.
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: AI UÇAK & TREN BİLETLERİ REKLAM SEKME */}
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
                    <p className="text-xs font-normal">RZD ve Havayolu Biletlerini AI ile Ayrıştırma</p>
                    <p className="text-[10.5px] text-slate-400 font-normal">Yolcu, şantiye, kalkış-varış ve bilet bedeli anında tabloda</p>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-normal">
                    Yapay Zeka Destekli
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-normal">
                  İdari İşler & Lojistik Modülü
                </span>
                <h3 className="text-lg text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                  Şantiye Bilet ve Sevk Operasyonlarını Otomatikleştirin
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                  Yüzlerce PDF bileti elle girmek yerine sisteme bırakın; AI motoru pasaport numarasıyla çalışanı bulsun, şantiyesine bağlasın ve bütçeyi raporlasın.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>RZD Tren ve E-Bilet PDF desteği</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Şantiye bazlı seyahat bütçesi ve maliyet takibi</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Yoldaki ve şantiyeye varan personel izleme</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/50 text-xs text-indigo-700 dark:text-indigo-300 font-normal">
                Yan menüdeki <strong className="font-normal">&quot;İdari İşler & Bilet Takibi&quot;</strong> sayfasından canlı demoyu inceleyebilirsiniz.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: ŞANTİYE KAMP VE LOJMAN REKLAM SEKME */}
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
                    <p className="text-xs font-normal">Şantiye Kampı 3D Blok ve Yatak Doluluk Haritası</p>
                    <p className="text-[10.5px] text-slate-400 font-normal">NFC pasaport okutulunca anında oda ve yatak ataması</p>
                  </div>
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 font-normal">
                    Obshchezhitiye Modülü
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-teal-600 dark:text-teal-400 font-normal">
                  Kamp & Lojman (Obshchezhitiye)
                </span>
                <h3 className="text-lg text-slate-900 dark:text-white font-normal mt-1 leading-snug">
                  4.800+ Yataklı Şantiye Kamplarında Sıfır Hata ile İkamet Yönetimi
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-normal">
                  Şantiyeye yeni gelen işçilerin kalacağı oda ve yataklar otomatik planlanır. Vardiya uyumu (gece/gündüz) gözetilerek iş kazaları önlenir.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                  <span>Konteyner ve prefabrik blok bazlı doluluk kontrolü</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                  <span>İşten ayrılan personelin lojmandan otomatik tahliyesi</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-normal">
                  <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
                  <span>Hijyen, temizlik ve bakım döngüsü takibi</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/50 dark:border-teal-800/50 text-xs text-teal-700 dark:text-teal-300 font-normal">
                Yan menüdeki <strong className="font-normal">&quot;Kamp & Lojman Takibi&quot;</strong> sayfasından interaktif oda matrisini inceleyebilirsiniz.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: YOUTUBE VIDEO TANITIMI */}
      {activeSubTab === 'video' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <Play className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="text-sm font-normal">Powerise Saha ve Şantiye Uygulamaları Tanıtım Filmi</h3>
                  <p className="text-[11px] text-slate-400 font-normal">YouTube üzerinden yüksek çözünürlüklü izleyebilirsiniz</p>
                </div>
              </div>
              <a
                href="https://www.youtube.com/watch?v=UQWgBJtFEJU"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-normal flex items-center gap-1.5 transition-all"
              >
                <span>YouTube&apos;da Aç</span>
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
        </div>
      )}
    </div>
  );
}
