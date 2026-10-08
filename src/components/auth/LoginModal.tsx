'use client';

import React, { useState } from 'react';
import { HardHat, LogIn, Lock, Mail, ShieldCheck, MapPin, Briefcase, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { login, switchUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setError(res.message || 'Giriş yapılamadı.');
    }
  };

  const demoAccounts = [
    {
      label: 'Admin (Tümü)',
      sub: 'Tüm Şantiyeler & Kullanıcı Yönetimi',
      email: 'admin@pondera.com',
      pass: 'admin123',
      icon: ShieldCheck,
      color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    },
    {
      label: 'Kazan Şantiyesi',
      sub: 'Yalnızca Kazan Bölgesi (2.258 Personel)',
      email: 'kazan@pondera.com',
      pass: 'kazan123',
      icon: MapPin,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    },
    {
      label: 'Svobodny Şantiyesi',
      sub: 'Yalnızca Svobodny-AGHK (1.215 Personel)',
      email: 'svobodny@pondera.com',
      pass: 'svobodny123',
      icon: MapPin,
      color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    },
    {
      label: 'Ust Luga Şantiyesi',
      sub: 'Yalnızca Ust Luga (720 Personel)',
      email: 'ustluga@pondera.com',
      pass: 'ustluga123',
      icon: MapPin,
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
    },
    {
      label: 'DGP-02 Projesi',
      sub: 'Yalnızca Tobolsk DGP-2 Projesi (1.125 Personel)',
      email: 'dgp02@pondera.com',
      pass: 'dgp123',
      icon: Briefcase,
      color: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 text-center border-b border-slate-100 bg-slate-50/50">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center mx-auto shadow-md shadow-indigo-100 mb-3">
            <HardHat className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Pondera HR Giriş & RLS Erişimi</h2>
          <p className="text-xs text-slate-600 mt-1">
            Bölge ve Proje bazlı Row-Level Security (RLS) ile güvenli giriş yapın
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick Demo Login Buttons */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-2">
              Hızlı Giriş (Demo Hesaplar):
            </span>
            <div className="space-y-1.5">
              {demoAccounts.map((acc, idx) => {
                const Icon = acc.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={async () => {
                      setEmail(acc.email);
                      setPassword(acc.pass);
                      await login(acc.email, acc.pass);
                      if (onClose) onClose();
                    }}
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${acc.color}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="font-bold text-xs block">{acc.label}</span>
                        <span className="text-[10px] opacity-80 block">{acc.sub}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] text-slate-600 font-semibold uppercase absolute">veya Manuel Giriş</span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">E-Posta Adresi</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pondera.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}</span>
            </button>
          </form>
        </div>

        {onClose && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-center">
            <button onClick={onClose} className="text-xs text-slate-600 hover:text-slate-900 font-medium">
              Vazgeç ve Kapat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
