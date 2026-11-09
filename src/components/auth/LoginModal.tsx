'use client';

import React, { useState, useEffect } from 'react';
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
    titleTr: 'Gosuslugi & МВД Otomasyonu',
    titleRu: 'Автоматизация Госуслуг и МВД',
    shortTr: 'Otonom E-İmza & VKS Bildirim Robotu',
    shortRu: 'Робот уведомлений ВКС и ЭЦП',
    icon: Bot,
    accentBg: 'bg-cyan-500',
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
    titleTr: 'Mail Okuyan & Bildiren Robot',
    titleRu: 'Почтовый Робот Приглашений',
    shortTr: 'MVD Davetiye PDF Yakalama & Eşleştirme',
    shortRu: 'Чтение писем МВД и сверка PDF',
    icon: Mail,
    accentBg: 'bg-sky-500',
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
    titleTr: 'Telegram & Sabah Raporları',
    titleRu: 'Telegram и Утренние Сводки',
    shortTr: 'Her Sabah Otomatik Özet & Kritik Uyarılar',
    shortRu: 'Авто-отчеты в Telegram и на почту',
    icon: Send,
    accentBg: 'bg-indigo-500',
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
    titleTr: '1C ZUP Veri Çekme Otomasyonu',
    titleRu: 'Авто-синхронизация с 1С ЗУП',
    shortTr: 'Resmi Bordro ↔ Saha Anlık Karşılaştırma',
    shortRu: 'Сверка 1С ЗУП и реального штата',
    icon: Database,
    accentBg: 'bg-violet-500',
    accentText: 'text-violet-700',
    accentBorder: 'border-violet-400',
    pillClass: 'bg-violet-50 text-violet-800 border-violet-200',
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
    titleTr: 'Mobil Uygulama ile Puantaj',
    titleRu: 'Мобильный Табель и Учет',
    shortTr: 'Saha Yoklama, QR & Yüz Tanıma',
    shortRu: 'Мобильная отметка на объектах',
    icon: Smartphone,
    accentBg: 'bg-emerald-500',
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
    titleTr: 'AI ile Evrak & Pasaport Okuma',
    titleRu: 'ИИ-распознавание Документов',
    shortTr: 'Yapay Zeka ile Pasaport, Vize & RNR Analizi',
    shortRu: 'AI OCR паспортов, виз и РНР',
    icon: ScanText,
    accentBg: 'bg-amber-500',
    accentText: 'text-amber-700',
    accentBorder: 'border-amber-400',
    pillClass: 'bg-amber-50 text-amber-800 border-amber-200',
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
    titleTr: 'Uçak Bileti Okuma & Takip',
    titleRu: 'AI Контроль Авиабилетов',
    shortTr: 'PDF Biletten Uçuş, PNR & Maliyet Çıkarma',
    shortRu: 'Чтение билетов, рейсов и тарифов',
    icon: Plane,
    accentBg: 'bg-rose-500',
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
    titleTr: 'İK & Kota Analitik Dashboard',
    titleRu: 'HR Дашборды и Квоты ИРС',
    shortTr: '11 Şantiye Canlı Kadro, Demografi & Kota',
    shortRu: 'Аналитика штата, квот и объектов',
    icon: BarChart3,
    accentBg: 'bg-teal-500',
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

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SHOWCASE_FEATURES.length);
    }, 3400);
    return () => clearInterval(timer);
  }, [paused]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await login(email, password);
    setLoading(false);

    if (res.success) {
      if (onClose) onClose();
    } else {
      setError(res.message || (lang === 'ru' ? 'Неверные учетные данные' : 'Giriş yapılamadı.'));
    }
  };

  const activeFeature = SHOWCASE_FEATURES[activeIdx] || SHOWCASE_FEATURES[0];
  const ActiveIcon = activeFeature.icon;
  const StepIcon0 = activeFeature.stepIcons[0];
  const StepIcon1 = activeFeature.stepIcons[1];
  const StepIcon2 = activeFeature.stepIcons[2];

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white overflow-y-auto lg:overflow-hidden select-none font-normal">
      <style jsx global>{`
        @keyframes pulseFlow {
          0% {
            transform: translateX(-100%);
            opacity: 0.2;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(220%);
            opacity: 0.2;
          }
        }
        @keyframes softFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }
      `}</style>

      {/* ===================================================================== */}
      {/* LEFT PANEL: PURE WHITE LOGIN WINDOW (Fixed width on Left)             */}
      {/* ===================================================================== */}
      <div className="w-full lg:w-[410px] xl:w-[440px] shrink-0 bg-white text-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 shadow-[12px_0_36px_-12px_rgba(15,23,42,0.12)] z-20 flex flex-col justify-between p-6 sm:p-8 lg:h-full">
        {/* Top Logo & Language Switcher */}
        <div className="flex items-center justify-between gap-3">
          <PonderaLogo variant="full" tone="light-bg" size="md" />

          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 text-xs">
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

        {/* Center Login Form (Pure White Surface) */}
        <div className="my-auto py-6 space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                {lang === 'ru' ? 'Корпоративный Портал Входа' : 'Kurumsal Sistem Girişi'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {t('login_title')}
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">{t('login_sub')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 select-text">
            {/* Username / Email Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                {lang === 'ru' ? 'Логин или Эл. почта' : 'Kullanıcı Adı veya E-Posta'}
              </label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-10 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 focus:border-emerald-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-emerald-500/15 transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                {t('login_password')}
              </label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-3 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 focus:border-emerald-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-emerald-500/15 transition-all"
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
              className="group w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
                className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                {lang === 'ru' ? 'Отмена и закрыть' : 'Vazgeç ve Kapat'}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Security Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            {lang === 'ru' ? 'Защита RLS • 256-Bit SSL' : 'RLS Güvenlik • 256-Bit SSL'}
          </span>
          <span className="font-mono text-[11px] text-slate-400">hr.pondera.network</span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* RIGHT PANEL: UNCROPPED RESIZED IMAGE + ANIMATED VISUAL SHOWCASE       */}
      {/* ===================================================================== */}
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative flex-1 min-h-[540px] lg:h-full overflow-hidden flex flex-col justify-between p-5 sm:p-7 xl:p-9"
      >
        {/* Uncropped Full Image Resized from Login Panel Border to Screen Edge */}
        <img
          src="/login-hr-office-light.jpg"
          alt="Pondera Office"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
        />

        {/* Soft Luminous Overlay for Contrast while keeping the office clearly visible */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/25 to-slate-950/65 pointer-events-none" />

        {/* TOP BAR: Visual Platform Title */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/90 backdrop-blur-md border border-white shadow-lg">
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

          <div className="hidden xl:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/75 backdrop-blur-md text-white text-xs border border-white/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              {lang === 'ru' ? '8 Активных Модулей в Одном Окне' : '8 Otonom Sistem Tek Merkezde'}
            </span>
          </div>
        </div>

        {/* CENTER ANIMATED VISUAL SPOTLIGHT: Shows How the Active Module Works Visually */}
        <div
          style={{ animation: 'softFloat 5s ease-in-out infinite' }}
          className="relative z-10 my-auto py-4"
        >
          <div className="max-w-4xl mx-auto rounded-3xl bg-white/92 backdrop-blur-xl border border-white shadow-2xl p-5 sm:p-6 transition-all duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-13 h-13 rounded-2xl ${activeFeature.accentBg} text-white flex items-center justify-center shadow-lg shrink-0`}
                >
                  <ActiveIcon className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${activeFeature.pillClass}`}
                    >
                      {activeFeature.badge}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {lang === 'ru' ? activeFeature.metricLabelRu : activeFeature.metricLabelTr}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-2xl font-bold text-slate-900 mt-0.5">
                    {lang === 'ru' ? activeFeature.titleRu : activeFeature.titleTr}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-center px-3.5 py-2 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{activeFeature.metricValue}</span>
              </div>
            </div>

            {/* Animated 3-Step Visual Pipeline Diagram */}
            <div className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2 sm:gap-3 pt-4">
              {/* Step 1 */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/90">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                  <StepIcon0 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {lang === 'ru' ? 'ШАГ 1' : 'ADIM 1'}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {lang === 'ru' ? activeFeature.stepsRu[0] : activeFeature.stepsTr[0]}
                  </div>
                </div>
              </div>

              {/* Animated Connector 1 */}
              <div className="hidden sm:flex flex-col items-center justify-center px-1">
                <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden relative">
                  <div
                    className={`w-1/2 h-full rounded-full ${activeFeature.accentBg}`}
                    style={{ animation: 'pulseFlow 1.8s linear infinite' }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 mt-1">OTOMATİK</span>
              </div>

              {/* Step 2 */}
              <div
                className={`flex items-center gap-3 p-3 rounded-2xl bg-white border-2 ${activeFeature.accentBorder} shadow-md`}
              >
                <div
                  className={`w-10 h-10 rounded-xl ${activeFeature.accentBg} text-white flex items-center justify-center shadow-xs shrink-0`}
                >
                  <StepIcon1 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${activeFeature.accentText}`}>
                    {lang === 'ru' ? 'ШАГ 2 • РОБОТ / ИИ' : 'ADIM 2 • ROBOT / AI'}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {lang === 'ru' ? activeFeature.stepsRu[1] : activeFeature.stepsTr[1]}
                  </div>
                </div>
              </div>

              {/* Animated Connector 2 */}
              <div className="hidden sm:flex flex-col items-center justify-center px-1">
                <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden relative">
                  <div
                    className={`w-1/2 h-full rounded-full ${activeFeature.accentBg}`}
                    style={{ animation: 'pulseFlow 1.8s linear infinite 0.5s' }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 mt-1">CANLI</span>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50/90 border border-emerald-200">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <StepIcon2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    {lang === 'ru' ? 'РЕЗУЛЬТАТ' : 'SONUÇ'}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                    {lang === 'ru' ? activeFeature.stepsRu[2] : activeFeature.stepsTr[2]}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM VISUAL MODULE CARDS: 8 Bold Visual Cards (Short, Punchy, Interactive) */}
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
          {SHOWCASE_FEATURES.map((item, idx) => {
            const IconComp = item.icon;
            const isSelected = idx === activeIdx;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIdx(idx)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`group text-left p-3 sm:p-3.5 rounded-2xl transition-all duration-300 cursor-pointer flex items-center gap-3 border ${
                  isSelected
                    ? 'bg-white text-slate-900 border-white shadow-xl scale-[1.02]'
                    : 'bg-white/82 hover:bg-white/95 text-slate-800 border-white/80 shadow-md'
                }`}
              >
                <div
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 ${
                    isSelected
                      ? `${item.accentBg} text-white shadow-md`
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <IconComp className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${item.pillClass}`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug mt-0.5 truncate">
                    {lang === 'ru' ? item.titleRu : item.titleTr}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">
                    {lang === 'ru' ? item.shortRu : item.shortTr}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
