'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  LogIn,
  Lock,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Bot,
  Mail,
  Send,
  Database,
  Smartphone,
  ScanText,
  Plane,
  BarChart3,
  FileCheck2,
  Cpu,
  RefreshCw,
  QrCode,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import PonderaLogo from '@/components/common/PonderaLogo';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

interface ShowcaseFeature {
  id: string;
  badge: string;
  imageUrl: string;
  titleTr: string;
  titleRu: string;
  shortTr: string;
  shortRu: string;
  icon: React.ComponentType<{ className?: string }>;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  pillClass: string;
  stepsTr: [string, string, string];
  stepsRu: [string, string, string];
  stepIcons: [
    React.ComponentType<{ className?: string }>,
    React.ComponentType<{ className?: string }>,
    React.ComponentType<{ className?: string }>
  ];
  metricLabelTr: string;
  metricLabelRu: string;
  metricValue: string;
}

const SHOWCASE_FEATURES: ShowcaseFeature[] = [
  {
    id: 'gosuslugi',
    badge: 'RPA ROBOT',
    imageUrl: '/showcase/gosuslugi-rpa.jpg',
    titleTr: 'Gosuslugi & МВД Otomasyonu',
    titleRu: 'Автоматизация Госуслуг и МВД',
    shortTr: 'Otonom E-İmza & VKS Bildirim Robotu',
    shortRu: 'Робот уведомлений ВКС и ЭЦП',
    icon: Bot,
    accentBg: 'bg-cyan-600',
    accentText: 'text-cyan-700',
    accentBorder: 'border-cyan-400',
    pillClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    stepsTr: ['Personel Verisi', 'E-İmza & RPA Robotu', 'МВД Resmi Onay'],
    stepsRu: ['Данные кадра', 'ЭЦП и RPA Робот', 'Статус Госуслуг'],
    stepIcons: [User, Cpu, FileCheck2],
    metricLabelTr: 'Çoklu PC Otonom Ajan',
    metricLabelRu: 'Автономные RPA-агенты',
    metricValue: '7/24 RPA',
  },
  {
    id: 'mail_bot',
    badge: 'MAIL ROBOT',
    imageUrl: '/showcase/mail-invitation-bot.jpg',
    titleTr: 'Mail Okuyan & Bildiren Robot',
    titleRu: 'Почтовый Робот Приглашений',
    shortTr: 'MVD Davetiye PDF Yakalama & Eşleştirme',
    shortRu: 'Чтение писем МВД и сверка PDF',
    icon: Mail,
    accentBg: 'bg-sky-600',
    accentText: 'text-sky-700',
    accentBorder: 'border-sky-400',
    pillClass: 'bg-sky-50 text-sky-800 border-sky-200',
    stepsTr: ['Gelen E-Posta (PDF)', 'Pasaport & Sicil Eşleştir', 'Otomatik Arşiv & Mail'],
    stepsRu: ['Входящая почта (PDF)', 'Поиск по паспорту', 'Архив и рассылка'],
    stepIcons: [Mail, ScanText, CheckCircle2],
    metricLabelTr: 'Canlı Posta Kutusu Takibi',
    metricLabelRu: 'Мониторинг почты МВД',
    metricValue: 'IMAP BOT',
  },
  {
    id: 'telegram',
    badge: 'TELEGRAM BOT',
    imageUrl: '/showcase/telegram-alerts.jpg',
    titleTr: 'Telegram & Sabah Raporları',
    titleRu: 'Telegram и Утренние Сводки',
    shortTr: 'Her Sabah Otomatik Özet & Kritik Uyarılar',
    shortRu: 'Авто-отчеты в Telegram и на почту',
    icon: Send,
    accentBg: 'bg-indigo-600',
    accentText: 'text-indigo-700',
    accentBorder: 'border-indigo-400',
    pillClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    stepsTr: ['Kota & Evrak Süreleri', 'Otonom Sabah Botu', 'Telegram & Mail Uyarı'],
    stepsRu: ['Квоты и сроки', 'Утренний бот 09:00', 'Telegram и Почта'],
    stepIcons: [FileCheck2, Bot, Send],
    metricLabelTr: 'Anlık Grup & Yönetici Bildirimi',
    metricLabelRu: 'Мгновенные оповещения',
    metricValue: 'CANLI BOT',
  },
  {
    id: 'zup_sync',
    badge: '1C ZUP AUTO',
    imageUrl: '/showcase/zup-sync.jpg',
    titleTr: '1C ZUP Veri Çekme Otomasyonu',
    titleRu: 'Авто-синхронизация с 1С ЗУП',
    shortTr: 'Resmi Bordro ↔ Saha Anlık Karşılaştırma',
    shortRu: 'Сверка 1С ЗУП и реального штата',
    icon: Database,
    accentBg: 'bg-amber-600',
    accentText: 'text-amber-700',
    accentBorder: 'border-amber-400',
    pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
    stepsTr: ['1C ZUP Sunucusu', 'Otomatik Veri Aktarımı', 'Resmi ↔ Real Analiz'],
    stepsRu: ['Сервер 1С ЗУП', 'Авто-выгрузка', 'Сверка 1С ↔ eBA'],
    stepIcons: [Database, RefreshCw, BarChart3],
    metricLabelTr: 'Tam Kadro Otomatik Senkron',
    metricLabelRu: 'Полная база 1С ЗУП',
    metricValue: '1C ↔ eBA',
  },
  {
    id: 'mobile_att',
    badge: 'MOBİL PUANTAJ',
    imageUrl: '/showcase/mobile-attendance.jpg',
    titleTr: 'Mobil Uygulama ile Puantaj',
    titleRu: 'Мобильный Табель и Учет',
    shortTr: 'Saha Yoklama, QR & Yüz Tanıma',
    shortRu: 'Мобильная отметка на объектах',
    icon: Smartphone,
    accentBg: 'bg-emerald-600',
    accentText: 'text-emerald-700',
    accentBorder: 'border-emerald-400',
    pillClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    stepsTr: ['Saha Mobil Uygulama', 'QR & Biyometrik Onay', 'Anlık Merkez Puantaj'],
    stepsRu: ['Мобильное приложение', 'QR / Биометрия', 'Табель в реальном времени'],
    stepIcons: [Smartphone, QrCode, CheckCircle2],
    metricLabelTr: 'Şantiye Saha Entegrasyonu',
    metricLabelRu: 'Контроль на стройплощадках',
    metricValue: 'iOS & ANDROID',
  },
  {
    id: 'ai_ocr',
    badge: 'AI EVRAK OCR',
    imageUrl: '/showcase/ai-document-ocr.jpg',
    titleTr: 'AI ile Evrak & Pasaport Okuma',
    titleRu: 'ИИ-распознавание Документов',
    shortTr: 'Yapay Zeka ile Pasaport, Vize & RNR Analizi',
    shortRu: 'AI OCR паспортов, виз и РНР',
    icon: ScanText,
    accentBg: 'bg-violet-600',
    accentText: 'text-violet-700',
    accentBorder: 'border-violet-400',
    pillClass: 'bg-violet-50 text-violet-800 border-violet-200',
    stepsTr: ['Evrak & Pasaport Görseli', 'Gemini Vision AI OCR', 'Sıfır Hata Veri Kaydı'],
    stepsRu: ['Скан документа / PDF', 'Gemini Vision AI', 'Авто-заполнение полей'],
    stepIcons: [FileCheck2, Sparkles, Database],
    metricLabelTr: 'Yapay Zeka Belge İşleme',
    metricLabelRu: 'Нейросетевой OCR движок',
    metricValue: 'GEMINI AI',
  },
  {
    id: 'tickets',
    badge: 'AI BİLET TAKİP',
    imageUrl: '/showcase/ai-flight-tickets.jpg',
    titleTr: 'Uçak Bileti Okuma & Takip',
    titleRu: 'AI Контроль Авиабилетов',
    shortTr: 'PDF Biletten Uçuş, PNR & Maliyet Çıkarma',
    shortRu: 'Чтение билетов, рейсов и тарифов',
    icon: Plane,
    accentBg: 'bg-rose-600',
    accentText: 'text-rose-700',
    accentBorder: 'border-rose-400',
    pillClass: 'bg-rose-50 text-rose-800 border-rose-200',
    stepsTr: ['PDF Uçak Bileti', 'AI Uçuş & PNR Okuma', 'Canlı Uçuş & TV Ekranı'],
    stepsRu: ['PDF маршрутная квитанция', 'ИИ парсинг рейса', 'Табло прилетов и вылетов'],
    stepIcons: [Plane, Sparkles, BarChart3],
    metricLabelTr: 'Otomatik Bilet & Sevk Kontrolü',
    metricLabelRu: 'Авто-разбор авиабилетов',
    metricValue: 'CANLI UÇUŞ',
  },
  {
    id: 'hr_bi',
    badge: 'CANLI İK BI',
    imageUrl: '/showcase/hr-bi-dashboard.jpg',
    titleTr: 'İK & Kota Analitik Dashboard',
    titleRu: 'HR Дашборды и Квоты ИРС',
    shortTr: '11 Şantiye Canlı Kadro, Demografi & Kota',
    shortRu: 'Аналитика штата, квот и объектов',
    icon: BarChart3,
    accentBg: 'bg-teal-600',
    accentText: 'text-teal-700',
    accentBorder: 'border-teal-400',
    pillClass: 'bg-teal-50 text-teal-800 border-teal-200',
    stepsTr: ['Tüm Personel & Şantiyeler', 'Çapraz Filtre & Kota', 'Canlı Yönetim Ekranı'],
    stepsRu: ['Все объекты и штат', 'Квоты ИРС и фильтры', 'Панель руководителя'],
    stepIcons: [User, BarChart3, ShieldCheck],
    metricLabelTr: '11 Şantiye Tek Merkezde',
    metricLabelRu: 'Все строительные объекты',
    metricValue: 'CANLI KPI',
  },
];

/**
 * Isolated memoized Showcase Panel so slide timers & hover events NEVER re-render
 * the Login <form> or interrupt browser Password Manager popups/previews.
 */
const LoginShowcasePanel = memo(function LoginShowcasePanel({ lang }: { lang: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStartX = useRef<number | null>(null);

  const goNext = useCallback(() => {
    setActiveIdx((prev) => (prev + 1) % SHOWCASE_FEATURES.length);
  }, []);

  const goPrev = useCallback(() => {
    setActiveIdx((prev) => (prev - 1 + SHOWCASE_FEATURES.length) % SHOWCASE_FEATURES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      goNext();
    }, 4500);
    return () => clearInterval(timer);
  }, [paused, goNext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  const activeFeature = SHOWCASE_FEATURES[activeIdx] || SHOWCASE_FEATURES[0];
  const ActiveIcon = activeFeature.icon;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={(e) => {
        pointerStartX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (pointerStartX.current !== null) {
          const diff = e.clientX - pointerStartX.current;
          if (Math.abs(diff) > 45) {
            if (diff < 0) goNext();
            else goPrev();
          }
          pointerStartX.current = null;
        }
      }}
      className="relative flex-1 min-h-[560px] lg:h-full overflow-hidden flex flex-col justify-between p-5 sm:p-7 xl:p-9 bg-emerald-50/40 select-none cursor-grab active:cursor-grabbing"
    >
      {/* Soft Left-Edge Cloud Mist Blending Login Panel into the Showcase */}
      <div className="hidden lg:block absolute inset-y-0 left-0 w-24 z-20 bg-gradient-to-r from-emerald-100/80 via-emerald-50/35 to-transparent pointer-events-none" />

      {/* ALL 8 SLIDES STACKED FULL-SCREEN WITH CLOUD-BLURRED EDGES & CINEMATIC TRANSITIONS */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {SHOWCASE_FEATURES.map((item, idx) => {
          const isActive = idx === activeIdx;
          const imgLoading = idx === 0 ? 'eager' : 'lazy';
          return (
            <div
              key={item.id}
              className={`absolute inset-0 transition-all duration-1000 ease-out ${
                isActive
                  ? 'opacity-100 scale-100 translate-x-0 z-10'
                  : 'opacity-0 scale-105 translate-x-4 z-0'
              }`}
            >
              {/* Layer 1: Deep Cloud Ambient Backdrop (Full Bleed Heavy Blur) */}
              <img
                src={item.imageUrl}
                alt=""
                aria-hidden="true"
                loading={imgLoading}
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-90"
              />

              {/* Layer 2: Mid-Cloud Soft Halo Blur */}
              <img
                src={item.imageUrl}
                alt=""
                aria-hidden="true"
                loading={imgLoading}
                decoding="async"
                style={{
                  WebkitMaskImage:
                    'radial-gradient(ellipse 92% 88% at 52% 46%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.5) 78%, rgba(0,0,0,0) 100%)',
                  maskImage:
                    'radial-gradient(ellipse 92% 88% at 52% 46%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.5) 78%, rgba(0,0,0,0) 100%)',
                }}
                className="absolute inset-0 w-full h-full object-cover scale-105 blur-xl opacity-85"
              />

              {/* Layer 3: Frameless Full-Screen Crisp Visual Dissolving Like a Cloud into the Background */}
              <img
                src={item.imageUrl}
                alt={item.titleTr}
                loading={imgLoading}
                decoding="async"
                style={{
                  WebkitMaskImage:
                    'radial-gradient(ellipse 84% 78% at 52% 45%, rgba(0,0,0,1) 54%, rgba(0,0,0,0.78) 68%, rgba(0,0,0,0.28) 84%, rgba(0,0,0,0) 97%)',
                  maskImage:
                    'radial-gradient(ellipse 84% 78% at 52% 45%, rgba(0,0,0,1) 54%, rgba(0,0,0,0.78) 68%, rgba(0,0,0,0.28) 84%, rgba(0,0,0,0) 97%)',
                }}
                className="absolute inset-2 sm:inset-4 w-[calc(100%-16px)] sm:w-[calc(100%-32px)] h-[calc(100%-16px)] sm:h-[calc(100%-32px)] object-cover"
              />
            </div>
          );
        })}

        {/* Subtle Bottom Cloud Mist for Text Legibility */}
        <div className="absolute inset-x-0 bottom-0 h-52 z-20 bg-gradient-to-t from-slate-950/75 via-slate-950/30 to-transparent" />
      </div>

      {/* TOP BAR: Clean Floating Platform Badge & Slide Counter */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/85 backdrop-blur-xl border border-white/80 shadow-md">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600" />
          </span>
          <span className="text-xs sm:text-sm font-bold tracking-wide text-slate-900">
            {lang === 'ru'
              ? 'PONDERA • ЕДИНАЯ ПЛАТФОРМА HR, RPA, 1С И ИИ-АВТОМАТИЗАЦИИ'
              : 'PONDERA • İK, ROBOTİK (RPA), 1C ZUP, MOBİL & YAPAY ZEKA OTOMASYON MERKEZİ'}
          </span>
          <Sparkles className="w-4 h-4 text-amber-500" />
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-slate-900/70 backdrop-blur-xl text-white text-xs font-semibold border border-white/20 shadow-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{activeFeature.metricValue}</span>
          <span className="text-white/40">•</span>
          <span className="font-mono text-emerald-300">
            {String(activeIdx + 1).padStart(2, '0')} / {String(SHOWCASE_FEATURES.length).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* LEFT / RIGHT FLOATING ARROW CONTROLS */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goPrev();
        }}
        aria-label={lang === 'ru' ? 'Предыдущий модуль' : 'Önceki Modül'}
        title={lang === 'ru' ? 'Предыдущий модуль (←)' : 'Önceki Modül (←)'}
        className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/80 hover:bg-white text-slate-900 backdrop-blur-xl border border-white/90 shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          goNext();
        }}
        aria-label={lang === 'ru' ? 'Следующий модуль' : 'Sonraki Modül'}
        title={lang === 'ru' ? 'Следующий модуль (→)' : 'Sonraki Modül (→)'}
        className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/80 hover:bg-white text-slate-900 backdrop-blur-xl border border-white/90 shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* BOTTOM HERO CAPTION & SLIDE PROGRESS INDICATORS */}
      <div className="relative z-30 mt-auto pt-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div
            key={`caption-${activeFeature.id}`}
            className="flex items-center gap-4 min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <div
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${activeFeature.accentBg} text-white flex items-center justify-center shadow-xl border border-white/35 shrink-0`}
            >
              <ActiveIcon className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-white/95 text-slate-900 shadow-sm">
                  {activeFeature.badge}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-emerald-300 drop-shadow-xs">
                  {lang === 'ru' ? activeFeature.metricLabelRu : activeFeature.metricLabelTr}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl xl:text-3xl font-bold text-white tracking-tight mt-1 drop-shadow-md">
                {lang === 'ru' ? activeFeature.titleRu : activeFeature.titleTr}
              </h2>
              <p className="text-xs sm:text-sm text-slate-100/95 mt-0.5 drop-shadow-xs">
                {lang === 'ru' ? activeFeature.shortRu : activeFeature.shortTr}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-end shrink-0 bg-slate-900/60 backdrop-blur-xl px-3.5 py-2 rounded-2xl border border-white/20 shadow-lg">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="Önceki"
              className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {SHOWCASE_FEATURES.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIdx(i);
                  }}
                  title={lang === 'ru' ? f.titleRu : f.titleTr}
                  aria-label={f.titleTr}
                  className={`h-2 rounded-full transition-all duration-500 cursor-pointer ${
                    i === activeIdx
                      ? 'w-8 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'
                      : 'w-2 bg-white/40 hover:bg-white/75'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="Sonraki"
              className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  // Sync any browser / Password Manager autofilled DOM values directly into React state
  // without ever overwriting non-empty DOM values with empty React state.
  const syncFromDomInputs = useCallback(() => {
    const domUser = usernameInputRef.current?.value ?? '';
    const domPass = passwordInputRef.current?.value ?? '';
    if (domUser) {
      setEmail((prev) => (prev === domUser ? prev : domUser));
    }
    if (domPass) {
      setPassword((prev) => (prev === domPass ? prev : domPass));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    syncFromDomInputs();
    const delays = [60, 200, 500, 1000];
    const timers = delays.map((ms) => setTimeout(syncFromDomInputs, ms));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [isOpen, syncFromDomInputs]);

  const handleAutofillAnimation = useCallback(
    (e: React.AnimationEvent<HTMLInputElement>) => {
      if (e.animationName === 'ponderaAutofillStart') {
        syncFromDomInputs();
        requestAnimationFrame(syncFromDomInputs);
      }
    },
    [syncFromDomInputs]
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const resolvedUser =
      (usernameInputRef.current?.value || '').trim() ||
      String(formData.get('username') || '').trim() ||
      email.trim();
    const resolvedPass =
      passwordInputRef.current?.value ||
      String(formData.get('password') || '') ||
      password;

    if (resolvedUser && resolvedUser !== email) setEmail(resolvedUser);
    if (resolvedPass && resolvedPass !== password) setPassword(resolvedPass);

    if (!resolvedUser || !resolvedPass) {
      setError(
        lang === 'ru'
          ? 'Пожалуйста, введите логин и пароль.'
          : 'Lütfen kullanıcı adı ve şifrenizi girin.'
      );
      return;
    }

    setLoading(true);
    const res = await login(resolvedUser, resolvedPass);
    setLoading(false);

    if (res.success) {
      try {
        const win = window as unknown as {
          PasswordCredential?: new (data: { id: string; password: string }) => Credential;
        };
        if (win.PasswordCredential && navigator.credentials?.store) {
          const cred = new win.PasswordCredential({
            id: resolvedUser,
            password: resolvedPass,
          });
          navigator.credentials.store(cred).catch(() => {});
        }
      } catch {
        // Ignore if browser restricts Credential Management API
      }
      if (onClose) onClose();
    } else {
      setError(res.message || (lang === 'ru' ? 'Неверные учетные данные' : 'Giriş yapılamadı.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white overflow-y-auto lg:overflow-hidden font-normal">
      {/* ===================================================================== */}
      {/* LEFT PANEL: SIDEBAR-STYLE EMERALD GRADIENT LOGIN WINDOW               */}
      {/* ===================================================================== */}
      <div className="w-full lg:w-[410px] xl:w-[440px] shrink-0 bg-gradient-to-b from-white via-emerald-50/75 to-emerald-200/90 text-slate-900 border-b lg:border-b-0 lg:border-r border-emerald-200/80 shadow-[12px_0_36px_-12px_rgba(15,23,42,0.14)] z-20 flex flex-col justify-between p-6 sm:p-8 lg:h-full">
        {/* Top Logo & Language Switcher */}
        <div className="flex items-center justify-between gap-3">
          <PonderaLogo variant="full" tone="light-bg" size="md" />

          <div className="flex items-center bg-white/80 backdrop-blur-xs rounded-xl p-0.5 border border-emerald-200/80 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setLang('tr')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                lang === 'tr'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              TR
            </button>
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                lang === 'ru'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              RU
            </button>
          </div>
        </div>

        {/* Center Login Form */}
        <div className="my-auto py-6 space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/85 border border-emerald-200 text-emerald-800 text-[11px] font-medium shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {lang === 'ru' ? 'Корпоративный Портал Входа' : 'Kurumsal Sistem Girişi'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {t('login_title')}
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">{t('login_sub')}</p>
          </div>

          <form
            id="pondera-login-form"
            name="login"
            action="/api/auth/login"
            method="post"
            autoComplete="on"
            noValidate
            onSubmit={handleSubmit}
            className="space-y-4 select-text"
          >
            {/* Username / Email Input */}
            <div className="space-y-1.5">
              <label htmlFor="login-username" className="block text-xs font-medium text-slate-800">
                {lang === 'ru' ? 'Логин или Эл. почта' : 'Kullanıcı Adı veya E-Posta'}
              </label>
              <div className="relative group">
                <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
                <input
                  ref={usernameInputRef}
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    requestAnimationFrame(syncFromDomInputs);
                  }}
                  onInput={(e) => {
                    setEmail((e.target as HTMLInputElement).value);
                    requestAnimationFrame(syncFromDomInputs);
                  }}
                  onFocus={syncFromDomInputs}
                  onBlur={syncFromDomInputs}
                  onAnimationStart={handleAutofillAnimation}
                  placeholder="admin"
                  className="w-full pl-10 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 bg-white/95 border border-emerald-200/90 focus:border-emerald-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-emerald-500/15 shadow-2xs transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-800">
                {t('login_password')}
              </label>
              <div className="relative group">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    requestAnimationFrame(syncFromDomInputs);
                  }}
                  onInput={(e) => {
                    setPassword((e.target as HTMLInputElement).value);
                    requestAnimationFrame(syncFromDomInputs);
                  }}
                  onFocus={syncFromDomInputs}
                  onBlur={syncFromDomInputs}
                  onAnimationStart={handleAutofillAnimation}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 text-sm text-slate-900 placeholder:text-slate-400 bg-white/95 border border-emerald-200/90 focus:border-emerald-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-emerald-500/15 shadow-2xs transition-all"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  title={showPassword ? 'Gizle' : 'Göster'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="group w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/25 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {loading
                  ? lang === 'ru'
                    ? 'Выполняется вход...'
                    : 'Giriş Yapılıyor...'
                  : t('login_btn')}
              </span>
              <ArrowRight className="w-4 h-4 opacity-85 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>

          {onClose && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                {lang === 'ru' ? 'Отмена и закрыть' : 'Vazgeç ve Kapat'}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Security Footer */}
        <div className="pt-4 border-t border-emerald-300/60 flex items-center justify-between text-xs text-slate-700">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            {lang === 'ru' ? 'Защита RLS • 256-Bit SSL' : 'RLS Güvenlik • 256-Bit SSL'}
          </span>
          <span className="font-mono text-[11px] text-emerald-900/70">hr.pondera.network</span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* RIGHT PANEL: ISOLATED MEMOIZED MODULE CAROUSEL                        */}
      {/* ===================================================================== */}
      <LoginShowcasePanel lang={lang} />
    </div>
  );
}
