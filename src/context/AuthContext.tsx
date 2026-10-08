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

// Default admin user for immediate demo access
const DEFAULT_ADMIN: User = {
  id: 1,
  name: 'Sistem Yöneticisi (Admin)',
  email: 'admin@pondera.com',
  role: 'admin',
  scope_type: 'all',
  scope_value: 'all',
  created_at: '2026-10-08 19:00:00',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pondera_hr_user');
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        // Default to Admin user so initial load works out of the box
        setUser(DEFAULT_ADMIN);
        localStorage.setItem('pondera_hr_user', JSON.stringify(DEFAULT_ADMIN));
      }
    } catch {
      setUser(DEFAULT_ADMIN);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('pondera_hr_user', JSON.stringify(data.user));
        return { success: true };
      } else {
        return { success: false, message: data.message || 'Giriş başarısız.' };
      }
    } catch {
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
