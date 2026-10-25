'use client';

import React, { useState, useEffect } from 'react';
import {
  HardHat,
  LogIn,
  Lock,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  Users,
  Cpu,
  Globe2,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen) return null;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window === 'undefined') return;
    const x = (e.clientX / window.innerWidth - 0.5) * 18;
    const y = (e.clientY / window.innerHeight - 0.5) * 18;
    setMousePos({ x, y });
  };

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

  const isStandalonePage = !onClose;

  return (
    <div
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden select-none font-normal"
    >
      {/* Keyframes for custom 3D floating, ken-burns, and shimmer animations */}
      <style jsx global>{`
        @keyframes kenBurns3D {
          0% {
            transform: scale(1.04) translate3d(0px, 0px, 0px);
          }
          50% {
            transform: scale(1.09) translate3d(-10px, -5px, 0px);
          }
          100% {
            transform: scale(1.04) translate3d(0px, 0px, 0px);
          }
        }
        @keyframes floatSlow {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-8px) rotate(0.4deg);
          }
        }
        @keyframes floatDelayed {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-10px) rotate(-0.4deg);
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 0.35;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.06);
          }
        }
      `}</style>

      {/* Fullscreen Daylight Executive HR Office Background (Light Mode) */}
      <div className="absolute inset-0 overflow-hidden bg-[#F1F5F9]">
        <div
          className="absolute inset-[-4%] bg-cover bg-center bg-no-repeat transition-transform duration-300 ease-out"
          style={{
            backgroundImage: `url('/login-hr-office-light.jpg')`,
            transform: `scale(1.05) translate3d(${-mousePos.x * 0.6}px, ${-mousePos.y * 0.6}px, 0)`,
            animation: 'kenBurns3D 30s ease-in-out infinite',
          }}
        />

        {/* Multi-layered Soft Daylight Vignettes for High Contrast & Text Legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/50 to-white/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-white/40" />

        {/* Ambient Subtle Daylight Light Orbs */}
        <div
          className="absolute -top-20 -left-20 w-[30rem] h-[30rem] rounded-full bg-emerald-500/15 blur-[120px] pointer-events-none"
          style={{ animation: 'pulseGlow 8s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-[-6rem] right-[12%] w-[26rem] h-[26rem] rounded-full bg-indigo-500/15 blur-[120px] pointer-events-none"
          style={{ animation: 'pulseGlow 10s ease-in-out infinite 2s' }}
        />

        {/* Subtle Architectural Grid Overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(15,23,42,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.3) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-8 flex flex-col lg:flex-row items-center lg:items-stretch justify-between gap-8 lg:gap-12 min-h-[640px]">
        {/* LEFT SHOWCASE PANEL: Daylight HR Command Center Branding with Spacious Center & Transparent Bottom Cards */}
        {isStandalonePage && (
          <div
            className={`hidden lg:flex flex-col justify-between flex-1 max-w-xl text-slate-900 transition-all duration-700 ${
              mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
            style={{
              transform: `translate3d(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px, 0)`,
            }}
          >
            {/* Top Area: Live Badge & Headline */}
            <div className="space-y-4">
              {/* Top Live Badge */}
              <div className="inline-flex items-center gap-2.5 self-start px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-xs">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600" />
                </span>
                <span className="text-xs font-normal tracking-wide uppercase text-slate-800">
                  {lang === 'ru'
                    ? 'PONDERA HR • ЦЕНТР УПРАВЛЕНИЯ ПЕРСОНАЛОМ'
                    : 'PONDERA HR • İNSAN KAYNAKLARI KOMUTA MERKEZİ'}
                </span>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </div>

              {/* Hero Headline */}
              <div className="space-y-2.5">
                <h1 className="text-3xl xl:text-4xl font-normal tracking-tight leading-[1.18] text-slate-950">
                  {lang === 'ru' ? (
                    <>
                      Интеллектуальное управление{' '}
                      <span className="text-emerald-700">
                        персоналом
                      </span>
                    </>
                  ) : (
                    <>
                      Yeni Nesil Kurumsal{' '}
                      <span className="text-emerald-700">
                        Personel Yönetimi
                      </span>
                    </>
                  )}
                </h1>
                <p className="text-sm xl:text-base text-slate-700 leading-relaxed max-w-lg font-normal">
                  {lang === 'ru'
                    ? 'Единая платформа кадровой аналитики, миграционного контроля, автоматизации Госуслуг МВД и корпоративного доступа.'
                    : 'Şantiye, bölge ve proje bazlı izole yetkilendirme mimarisiyle uçtan uca personel analitiği, göçmenlik uyumluluğu ve Gosuslugi МВД otomasyonu.'}
                </p>
              </div>
            </div>

            {/* Middle Space: Kept intentionally open and unobstructed to showcase the bright modern office view */}
            <div className="flex-1 min-h-[40px]" />

            {/* Bottom Area: 3 Animated Transparent Lines & Footer Trust Strip */}
            <div className="space-y-4">
              {/* 3 Animated Feature Items - Fully Transparent Background */}
              <div className="space-y-2">
                {/* Card 1 */}
                <div
                  style={{ animation: 'floatSlow 6s ease-in-out infinite' }}
                  className="group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-transparent hover:bg-white/40 border border-slate-300/40 hover:border-slate-300/80 transition-all duration-300"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-600/15 text-emerald-800 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-normal text-slate-950">
                        {lang === 'ru' ? 'Кадровая Аналитика в Реальном Времени' : 'Canlı Personel & Puantaj Analitiği'}
                      </h3>
                      <span className="px-1.5 py-0.2 text-[9px] font-normal rounded bg-emerald-100/70 text-emerald-900 border border-emerald-300/50">
                        BI
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 truncate font-normal">
                      {lang === 'ru'
                        ? 'Мгновенная фильтрация по проектам, отделам, гражданству и табелям'
                        : 'Proje, departman, uyruk ve yaka bazlı anlık çapraz filtreleme ve raporlama'}
                    </p>
                  </div>
                </div>

                {/* Card 2 */}
                <div
                  style={{ animation: 'floatDelayed 7s ease-in-out infinite 1s' }}
                  className="group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-transparent hover:bg-white/40 border border-slate-300/40 hover:border-slate-300/80 transition-all duration-300"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-600/15 text-amber-800 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-normal text-slate-950">
                        {lang === 'ru' ? 'Роботизация Госуслуг и МВД (RPA)' : 'Gosuslugi & МВД VKS Robot Otomasyonu'}
                      </h3>
                      <span className="px-1.5 py-0.2 text-[9px] font-normal rounded bg-amber-100/70 text-amber-900 border border-amber-300/50">
                        AUTO-SYNC
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 truncate font-normal">
                      {lang === 'ru'
                        ? 'Автоматическая подача уведомлений ВКС, ЭЦП и контроль статусов МВД'
                        : 'Çoklu bilgisayar RPA ajanları, elektronik imza ve anlık МВД statü takibi'}
                    </p>
                  </div>
                </div>

                {/* Card 3 */}
                <div
                  style={{ animation: 'floatSlow 6.5s ease-in-out infinite 0.5s' }}
                  className="group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-transparent hover:bg-white/40 border border-slate-300/40 hover:border-slate-300/80 transition-all duration-300"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-600/15 text-indigo-800 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-normal text-slate-950">
                        {lang === 'ru' ? 'Корпоративная Защита и Изоляция Данных' : 'Kurumsal Veri & Yetki İzolasyonu'}
                      </h3>
                      <span className="px-1.5 py-0.2 text-[9px] font-normal rounded bg-indigo-100/70 text-indigo-900 border border-indigo-300/50">
                        256-BIT
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 truncate font-normal">
                      {lang === 'ru'
                        ? 'Строгое разграничение прав доступа по регионам и строительным объектам'
                        : 'Bölge ve şantiye yetkilerine göre izole edilmiş yüksek güvenlikli veri erişimi'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer Trust Strip */}
              <div className="flex items-center gap-6 pt-1 text-xs text-slate-700 font-normal">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{lang === 'ru' ? 'Защищенное соединение SSL' : 'SSL Şifreli Kurumsal Bağlantı'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-indigo-600" />
                  <span>hr.pondera.network</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT PANEL: Sleek Daylight Glassmorphic Login Card */}
        <div
          className={`w-full max-w-[420px] mx-auto lg:mx-0 transition-all duration-700 ${
            mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
          }`}
          style={{
            transform: `translate3d(${mousePos.x * 0.2}px, ${mousePos.y * 0.2}px, 0)`,
          }}
        >
          <div className="p-0.5 rounded-[24px] bg-gradient-to-b from-slate-200 to-slate-300 shadow-xl">
            <div className="relative rounded-[23px] bg-white/95 backdrop-blur-2xl overflow-hidden text-slate-900 border border-white">
              {/* Language Switcher Pill */}
              <div className="absolute top-5 right-5 z-20 flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 text-xs font-normal">
                <button
                  type="button"
                  onClick={() => setLang('tr')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer ${
                    lang === 'tr'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  TR
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ru')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-normal transition-all cursor-pointer ${
                    lang === 'ru'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  RU
                </button>
              </div>

              {/* Card Header */}
              <div className="relative px-8 pt-8 pb-5 text-center border-b border-slate-100">
                <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <HardHat className="w-7 h-7" />
                </div>

                <h2 className="text-xl sm:text-2xl font-normal tracking-tight text-slate-900">
                  {t('login_title')}
                </h2>
                <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed font-normal">
                  {t('login_sub')}
                </p>
              </div>

              {/* Login Form Body */}
              <div className="relative p-7 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4 select-text">
                  {/* Username / Email Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-normal text-slate-800">
                      {lang === 'ru' ? 'Логин или Эл. почта' : 'Kullanıcı Adı veya E-Posta'}
                    </label>
                    <div className="relative group">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin"
                        className="w-full pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-300 focus:border-emerald-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-emerald-500/15 font-normal transition-all"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-normal text-slate-800">
                      {t('login_password')}
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-300 focus:border-emerald-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-emerald-500/15 font-normal transition-all"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                        title={showPassword ? 'Gizle' : 'Göster'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-normal animate-in fade-in duration-150">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-normal text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>
                      {loading
                        ? lang === 'ru'
                          ? 'Выполняется вход...'
                          : 'Giriş Yapılıyor...'
                        : t('login_btn')}
                    </span>
                    <ArrowRight className="w-4 h-4 opacity-80 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </form>

                {/* Security Footer Inside Card */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-normal">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    {lang === 'ru' ? 'Защита RLS активна' : 'RLS Güvenlik Katmanı Aktif'}
                  </span>
                  <span className="text-slate-500 font-normal">Pondera v2.6</span>
                </div>
              </div>

              {/* Optional Close Button when opened as an in-app modal */}
              {onClose && (
                <div className="px-8 py-3.5 border-t border-slate-100 bg-slate-50 text-center">
                  <button
                    onClick={onClose}
                    className="text-xs text-slate-600 hover:text-slate-900 font-normal transition-colors cursor-pointer"
                  >
                    {lang === 'ru' ? 'Отмена и закрыть' : 'Vazgeç ve Kapat'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
