'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  switchUser: (targetUser: User) => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BUILTIN_DEMO_USERS: Array<User & { pass: string }> = [
  {
    id: 1,
    name: 'Sistem Yöneticisi (Admin)',
    email: 'admin@pondera.com',
    pass: 'admin123',
    role: 'admin',
    scope_type: 'all',
    scope_value: 'all',
    created_at: '2026-10-08 19:00:00',
  },
  {
    id: 2,
    name: 'Kazan Şantiye Yönetimi',
    email: 'kazan@pondera.com',
    pass: 'kazan123',
    role: 'user',
    scope_type: 'region',
    scope_value: 'Kazan',
    created_at: '2026-10-08 19:00:00',
  },
  {
    id: 3,
    name: 'Svobodny Şantiye Yönetimi',
    email: 'svobodny@pondera.com',
    pass: 'svobodny123',
    role: 'user',
    scope_type: 'region',
    scope_value: 'Svobodny-AGHK',
    created_at: '2026-10-08 19:00:00',
  },
  {
    id: 4,
    name: 'Ust Luga Şantiye Yönetimi',
    email: 'ustluga@pondera.com',
    pass: 'ustluga123',
    role: 'user',
    scope_type: 'region',
    scope_value: 'Ust Luga',
    created_at: '2026-10-08 19:00:00',
  },
  {
    id: 5,
    name: 'DGP-02 Proje Yönetimi',
    email: 'dgp02@pondera.com',
    pass: 'dgp123',
    role: 'user',
    scope_type: 'project',
    scope_value: 'TOBOLSK DGP-2 PROJESİ',
    created_at: '2026-10-08 19:00:00',
  },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('pondera_hr_user', JSON.stringify(data.user));
        return { success: true };
      }

      // Fallback for built-in accounts if server DB did not have users table initialized
      const fallback = BUILTIN_DEMO_USERS.find(
        (u) => u.email === cleanEmail && u.pass === password
      );
      if (fallback) {
        const { pass: _p, ...userObj } = fallback;
        setUser(userObj);
        localStorage.setItem('pondera_hr_user', JSON.stringify(userObj));
        return { success: true };
      }

      return { success: false, message: data.message || 'Giriş başarısız.' };
    } catch {
      const fallback = BUILTIN_DEMO_USERS.find(
        (u) => u.email === cleanEmail && u.pass === password
      );
      if (fallback) {
        const { pass: _p, ...userObj } = fallback;
        setUser(userObj);
        localStorage.setItem('pondera_hr_user', JSON.stringify(userObj));
        return { success: true };
      }
      return { success: false, message: 'Bağlantı hatası oluştu.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pondera_hr_user');
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchUser, getAuthHeaders }}>
      {children}
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
