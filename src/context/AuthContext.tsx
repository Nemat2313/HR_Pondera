'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from '@/types';

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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  switchUser: (targetUser: User) => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());

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
      fetch('/api/auth/login', { method: 'DELETE' }).catch(() => {});
    }, 30000);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, updateActivity);
      }
      clearInterval(checkInterval);
    };
  }, [user]);

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

      return { success: false, message: data.message || 'Giriş başarısız.' };
    } catch {
      return { success: false, message: 'Bağlantı hatası oluştu.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pondera_hr_user');
    fetch('/api/auth/login', { method: 'DELETE' }).catch(() => {});
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
