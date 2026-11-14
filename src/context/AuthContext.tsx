'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { ShieldAlert, Lock, X, CheckCircle2 } from 'lucide-react';
import { User } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const RPA_BRIDGE_HEALTH_URLS = [
  'http://127.0.0.1:8088/health',
  'http://localhost:8088/health',
];

async function isLocalRpaAgentActive(): Promise<boolean> {
  for (const url of RPA_BRIDGE_HEALTH_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        return true;
      }
    } catch {
      // Try next local RPA bridge URL
    }
  }
  return false;
}

export interface PermissionDeniedOptions {
  actionLabelTr?: string;
  actionLabelRu?: string;
  titleTr?: string;
  titleRu?: string;
  messageTr?: string;
  messageRu?: string;
  hintTr?: string;
  hintRu?: string;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  switchUser: (targetUser: User) => void;
  getAuthHeaders: () => Record<string, string>;
  showPermissionDenied: (opts?: PermissionDeniedOptions) => void;
  showSalaryPdfPermissionDenied: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [permModal, setPermModal] = useState<PermissionDeniedOptions | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const showPermissionDenied = useCallback((opts?: PermissionDeniedOptions) => {
    setPermModal(opts || {});
  }, []);

  const showSalaryPdfPermissionDenied = useCallback(() => {
    setPermModal({
      titleTr: 'Maaş Gizliliği Politikası — Admin Yetkisi Gerekli',
      titleRu: 'Политика конфиденциальности зарплат — Требуются права Администратора',
      messageTr:
        'Şirket maaş gizliliği politikası gereği, maaş bilgisi içeren Başvuru (Заявка) PDF belgelerini indirme ve görüntüleme yetkiniz bulunmamaktadır. Bu işlem yalnızca Sistem Yöneticisi (Admin) yetkisine sahip kullanıcılar tarafından yapılabilir.',
      messageRu:
        'В соответствии с корпоративной политикой конфиденциальности заработной платы у вас нет прав на просмотр и скачивание PDF заявок (содержащих данные о выплатах). Это действие доступно только пользователям с правами Администратора (Admin).',
      hintTr: 'Resmi bildirim teyidi için "Statü A4 PDF" (veya Statü A4 ZIP) belgesini görüntüleyebilir ve indirebilirsiniz.',
      hintRu: 'Для официального подтверждения вы можете открыть или скачать документ «Статус A4 PDF» (или архив статусов A4).',
    });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pondera_hr_user');
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('pondera-has-saved-session');
      }
      setLoading(false);
    }
  }, []);

  // Automatically sign out after 30 minutes of user inactivity,
  // EXCEPT on computers running the local Gosuslugi RPA Agent (port 8088) — robot PCs must NEVER sign out!
  useEffect(() => {
    if (!user) return;
    lastActivityRef.current = Date.now();

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    for (const ev of events) {
      window.addEventListener(ev, updateActivity, { passive: true });
    }

    const checkInterval = setInterval(async () => {
      if (Date.now() - lastActivityRef.current < INACTIVITY_TIMEOUT_MS) {
        return;
      }
      // Never sign out a computer where the Gosuslugi RPA Bridge (port 8088) is running
      const rpaActive = await isLocalRpaAgentActive();
      if (rpaActive) {
        lastActivityRef.current = Date.now();
        return;
      }
      setUser(null);
      localStorage.removeItem('pondera_hr_user');
      fetch('/api/auth/login', { method: 'DELETE' }).catch(() => { });
    }, 30000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, updateActivity);
      }
      clearInterval(checkInterval);
    };
  }, [user]);

  const login = async (email: string, password: string, rememberMe = true) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, rememberMe }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('pondera_hr_user', JSON.stringify(data.user));
        return { success: true };
      }

      return { success: false, message: data.message || 'Giriş başarısız.' };
    } catch {
      return { success: false, message: 'Bağlantı hatası oluştu.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pondera_hr_user');
    fetch('/api/auth/login', { method: 'DELETE' }).catch(() => { });
  };

  const switchUser = (targetUser: User) => {
    setUser(targetUser);
    localStorage.setItem('pondera_hr_user', JSON.stringify(targetUser));
  };

  const getAuthHeaders = (): Record<string, string> => {
    if (!user) return {};
    return {
      'x-user-role': user.role,
      'x-user-scope-type': user.scope_type,
      'x-user-scope-value': user.scope_value,
    };
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        login,
        logout,
        switchUser,
        getAuthHeaders,
        showPermissionDenied,
        showSalaryPdfPermissionDenied,
      }}
    >
      {children}

      {permModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPermModal(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-gradient-to-r from-rose-600 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-snug">
                    {lang === 'ru'
                      ? permModal.titleRu || 'Недостаточно прав — Требуются права Администратора'
                      : permModal.titleTr || 'Yetkisiz İşlem — Admin Yetkisi Gerekli'}
                  </h3>
                  <p className="text-[11px] text-white/85 font-medium mt-0.5 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" />
                    <span>
                      {lang === 'ru' ? 'Текущая роль:' : 'Mevcut Rolünüz:'}{' '}
                      <strong>
                        {user?.role === 'admin'
                          ? 'Admin'
                          : user?.role === 'user'
                            ? lang === 'ru'
                              ? 'Специалист HR (User)'
                              : 'İK Uzmanı (User)'
                            : lang === 'ru'
                              ? 'Наблюдатель (Viewer)'
                              : 'Gözlemci (Viewer)'}
                      </strong>
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermModal(null)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {(permModal.actionLabelTr || permModal.actionLabelRu) && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                  <span>{lang === 'ru' ? 'Действие:' : 'İstenen İşlem:'}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {lang === 'ru'
                      ? permModal.actionLabelRu || permModal.actionLabelTr
                      : permModal.actionLabelTr || permModal.actionLabelRu}
                  </span>
                </div>
              )}

              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                {lang === 'ru'
                  ? permModal.messageRu ||
                  'У вас нет полномочий для выполнения этого действия. Данная операция может выполняться только пользователями с правами Системного Администратора (Admin).'
                  : permModal.messageTr ||
                  'Bu işlemi gerçekleştirme yetkiniz bulunmamaktadır. Bu işlem yalnızca Sistem Yöneticisi (Admin) yetkisine sahip kullanıcılar tarafından yapılabilir.'}
              </p>

              {(permModal.hintTr || permModal.hintRu) && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed">
                    {lang === 'ru' ? permModal.hintRu || permModal.hintTr : permModal.hintTr || permModal.hintRu}
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPermModal(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  {lang === 'ru' ? 'Понятно' : 'Anladım'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
