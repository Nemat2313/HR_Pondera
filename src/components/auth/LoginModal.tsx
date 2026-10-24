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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden select-none"
    >
      {/* Keyframes for custom 3D floating, ken-burns, and shimmer animations */}
      <style jsx global>{`
        @keyframes kenBurns3D {
          0% {
            transform: scale(1.04) translate3d(0px, 0px, 0px);
          }
          50% {
            transform: scale(1.1) translate3d(-12px, -6px, 0px);
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
            transform: translateY(-10px) rotate(0.6deg);
          }
        }
        @keyframes floatDelayed {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-12px) rotate(-0.6deg);
          }
        }
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 0.45;
            transform: scale(1);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.08);
          }
        }
        @keyframes borderBeam {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
      `}</style>

      {/* Fullscreen 3D MacBook & Executive HR Office Background */}
      <div className="absolute inset-0 overflow-hidden bg-[#070B19]">
        <div
          className="absolute inset-[-4%] bg-cover bg-center bg-no-repeat transition-transform duration-300 ease-out"
          style={{
            backgroundImage: `url('/login-hr-office-3d.jpg')`,
            transform: `scale(1.06) translate3d(${-mousePos.x * 0.7}px, ${-mousePos.y * 0.7}px, 0)`,
            animation: 'kenBurns3D 28s ease-in-out infinite',
          }}
        />

        {/* Multi-layered Cinematic Gradient Vignettes for Readability & Luxury Depth */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#060916]/85 via-[#090D24]/45 to-[#060916]/85" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050814]/90 via-transparent to-[#050814]/60" />

        {/* Ambient Glowing 3D Light Orbs */}
        <div
          className="absolute -top-24 -left-24 w-[32rem] h-[32rem] rounded-full bg-indigo-600/25 blur-[130px] pointer-events-none"
          style={{ animation: 'pulseGlow 8s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-[-8rem] right-[10%] w-[28rem] h-[28rem] rounded-full bg-violet-600/25 blur-[130px] pointer-events-none"
          style={{ animation: 'pulseGlow 10s ease-in-out infinite 2s' }}
        />
        <div
          className="absolute top-[35%] left-[38%] w-72 h-72 rounded-full bg-amber-500/15 blur-[110px] pointer-events-none"
          style={{ animation: 'pulseGlow 7s ease-in-out infinite 1s' }}
        />

        {/* Subtle Architectural Grid Overlay */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-6 flex flex-col lg:flex-row items-center justify-between gap-10">
        {/* LEFT SHOWCASE PANEL: 3D HR Command Center Branding & Floating Holographic Cards */}
        {isStandalonePage && (
          <div
            className={`hidden lg:flex flex-col justify-between max-w-xl text-white space-y-8 transition-all duration-700 ${
              mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
            style={{
              transform: `translate3d(${mousePos.x * 0.35}px, ${mousePos.y * 0.35}px, 0)`,
            }}
          >
            {/* Top Live Badge */}
            <div className="inline-flex items-center gap-2.5 self-start px-4 py-2 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/15 shadow-lg">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
              <span className="text-xs font-bold tracking-wider uppercase text-indigo-200">
                {lang === 'ru'
                  ? 'PONDERA HR • ЦЕНТР УПРАВЛЕНИЯ ПЕРСОНАЛОМ'
                  : 'PONDERA HR • İNSAN KAYNAKLARI KOMUTA MERKEZİ'}
              </span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            </div>

            {/* Hero Headline */}
            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.12] text-white drop-shadow-md">
                {lang === 'ru' ? (
                  <>
                    Интеллектуальное управление{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-violet-300 to-amber-200">
                      персоналом и ВКС
                    </span>
                  </>
                ) : (
                  <>
                    Yeni Nesil Kurumsal{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-violet-300 to-amber-200">
                      Personel & VKS Yönetimi
                    </span>
                  </>
                )}
              </h1>
              <p className="text-sm xl:text-base text-slate-300/90 leading-relaxed max-w-lg font-normal">
                {lang === 'ru'
                  ? 'Единая 3D-платформа кадровой аналитики, миграционного контроля, автоматизации Госуслуг МВД и защиты данных на уровне строк (RLS).'
                  : 'Şantiye, bölge ve proje bazlı Row-Level Security (RLS) mimarisiyle uçtan uca personel analitiği, göçmenlik uyumluluğu ve Gosuslugi МВД otomasyonu.'}
              </p>
            </div>

            {/* Floating 3D Glassmorphic Feature Cards */}
            <div className="grid grid-cols-1 gap-3.5 pt-2">
              {/* Card 1 */}
              <div
                style={{ animation: 'floatSlow 6s ease-in-out infinite' }}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-slate-900/55 hover:bg-slate-900/75 backdrop-blur-xl border border-white/15 hover:border-indigo-400/50 shadow-[0_20px_50px_rgba(0,0,0,0.45)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {lang === 'ru' ? 'Кадровая Аналитика в Реальном Времени' : 'Canlı Personel & Puantaj Analitiği'}
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      3D BI
                    </span>
                  </div>
                  <p className="text-xs text-slate-300/80 mt-0.5 truncate">
                    {lang === 'ru'
                      ? 'Мгновенная фильтрация по проектам, отделам, гражданству и табелям'
                      : 'Proje, departman, uyruk ve yaka bazlı anlık çapraz filtreleme ve raporlama'}
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div
                style={{ animation: 'floatDelayed 7s ease-in-out infinite 1s' }}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-slate-900/55 hover:bg-slate-900/75 backdrop-blur-xl border border-white/15 hover:border-amber-400/50 shadow-[0_20px_50px_rgba(0,0,0,0.45)] transition-all duration-300 ml-5"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/30 shrink-0 group-hover:scale-110 transition-transform">
                  <Cpu className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {lang === 'ru' ? 'Роботизация Госуслуг и МВД (RPA)' : 'Gosuslugi & МВД VKS Robot Otomasyonu'}
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      AUTO-SYNC
                    </span>
                  </div>
                  <p className="text-xs text-slate-300/80 mt-0.5 truncate">
                    {lang === 'ru'
                      ? 'Автоматическая подача уведомлений ВКС, ЭЦП и контроль статусов МВД'
                      : 'Çoklu bilgisayar RPA ajanları, elektronik imza ve anlık МВД statü takibi'}
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div
                style={{ animation: 'floatSlow 6.5s ease-in-out infinite 0.5s' }}
                className="group flex items-center gap-4 p-4 rounded-2xl bg-slate-900/55 hover:bg-slate-900/75 backdrop-blur-xl border border-white/15 hover:border-emerald-400/50 shadow-[0_20px_50px_rgba(0,0,0,0.45)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 shrink-0 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {lang === 'ru' ? 'Защита Row-Level Security (RLS)' : 'Kurumsal Row-Level Security (RLS)'}
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      256-BIT
                    </span>
                  </div>
                  <p className="text-xs text-slate-300/80 mt-0.5 truncate">
                    {lang === 'ru'
                      ? 'Строгое разграничение прав доступа по регионам и строительным объектам'
                      : 'Bölge ve şantiye yetkilerine göre izole edilmiş yüksek güvenlikli veri erişimi'}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Trust Strip */}
            <div className="flex items-center gap-6 pt-2 text-xs text-slate-300/80">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'ru' ? 'Защищенное соединение SSL' : 'SSL Şifreli Kurumsal Bağlantı'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-indigo-400" />
                <span>hr.pondera.network</span>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT PANEL: Ultra-Sleek Animated 3D Glassmorphic Login Card */}
        <div
          className={`w-full max-w-[430px] mx-auto lg:mx-0 transition-all duration-700 ${
            mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
          }`}
          style={{
            transform: `translate3d(${mousePos.x * 0.2}px, ${mousePos.y * 0.2}px, 0)`,
          }}
        >
          {/* Outer Glowing Gradient Frame */}
          <div
            className="p-[1.5px] rounded-[28px] shadow-[0_30px_90px_rgba(0,0,0,0.75)]"
            style={{
              background:
                'linear-gradient(135deg, rgba(99,102,241,0.75), rgba(168,85,247,0.45), rgba(251,191,36,0.5), rgba(99,102,241,0.75))',
              backgroundSize: '300% 300%',
              animation: 'borderBeam 8s ease infinite',
            }}
          >
            <div className="relative rounded-[27px] bg-slate-950/80 backdrop-blur-2xl overflow-hidden text-white">
              {/* Top Decorative Ambient Glow Inside Card */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-40 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 right-0 w-56 h-40 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

              {/* Language Switcher Pill */}
              <div className="absolute top-5 right-5 z-20 flex items-center bg-white/[0.08] backdrop-blur-md rounded-xl p-1 border border-white/15 shadow-inner">
                <button
                  type="button"
                  onClick={() => setLang('tr')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    lang === 'tr'
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  TR
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ru')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    lang === 'ru'
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  RU
                </button>
              </div>

              {/* Card Header */}
              <div className="relative px-8 pt-9 pb-6 text-center border-b border-white/10">
                {/* 3D Animated Emblem */}
                <div className="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-indigo-500 via-violet-500 to-amber-400 blur-md opacity-75 animate-pulse" />
                  <div className="relative w-15 h-15 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-xl border border-white/25">
                    <HardHat className="w-8 h-8 drop-shadow" />
                  </div>
                </div>

                <h2 className="text-2xl font-extrabold tracking-tight text-white">
                  {t('login_title')}
                </h2>
                <p className="text-xs text-slate-300/85 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  {t('login_sub')}
                </p>
              </div>

              {/* Login Form Body */}
              <div className="relative p-8 space-y-5">
                <form onSubmit={handleSubmit} className="space-y-4 select-text">
                  {/* Username / Email Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-200 tracking-wide">
                      {lang === 'ru' ? 'Логин или Эл. почта' : 'Kullanıcı Adı veya E-Posta'}
                    </label>
                    <div className="relative group">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin"
                        className="w-full pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-400 bg-white/[0.07] hover:bg-white/[0.10] focus:bg-white/[0.12] border border-white/15 focus:border-indigo-400 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-200 tracking-wide">
                      {t('login_password')}
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-400 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-11 py-3 text-sm text-white placeholder:text-slate-400 bg-white/[0.07] hover:bg-white/[0.10] focus:bg-white/[0.12] border border-white/15 focus:border-indigo-400 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title={showPassword ? 'Gizle' : 'Göster'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-400/35 text-rose-200 text-xs flex items-center gap-2.5 animate-in fade-in zoom-in-95 duration-200">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="font-medium">{error}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full py-3.5 px-5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:via-violet-500 hover:to-indigo-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/35 hover:shadow-indigo-500/50 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2.5 cursor-pointer overflow-hidden mt-2"
                  >
                    <LogIn className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span>
                      {loading
                        ? lang === 'ru'
                          ? 'Выполняется вход...'
                          : 'Giriş Yapılıyor...'
                        : t('login_btn')}
                    </span>
                    <ArrowRight className="w-4 h-4 opacity-80 transition-transform group-hover:translate-x-1" />
                  </button>
                </form>

                {/* Security Footer Inside Card */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    {lang === 'ru' ? 'Защита RLS активна' : 'RLS Güvenlik Katmanı Aktif'}
                  </span>
                  <span className="text-slate-400/80 font-mono">Pondera v2.4</span>
                </div>
              </div>

              {/* Optional Close Button when opened as an in-app modal */}
              {onClose && (
                <div className="px-8 py-4 border-t border-white/10 bg-white/[0.03] text-center">
                  <button
                    onClick={onClose}
                    className="text-xs text-slate-300 hover:text-white font-semibold transition-colors cursor-pointer"
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
