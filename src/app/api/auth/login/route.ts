import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_USERS = [
  {
    id: 1,
    name: 'Sistem Yöneticisi (Admin)',
    email: 'admin@pondera.com',
    password: 'admin123',
    role: 'admin',
    scope_type: 'all',
    scope_value: 'all',
  },
  {
    id: 2,
    name: 'Kazan Şantiye Yönetimi',
    email: 'kazan@pondera.com',
    password: 'kazan123',
    role: 'viewer',
    scope_type: 'region',
    scope_value: 'Kazan',
  },
  {
    id: 3,
    name: 'Svobodny Şantiye Yönetimi',
    email: 'svobodny@pondera.com',
    password: 'svobodny123',
    role: 'viewer',
    scope_type: 'region',
    scope_value: 'Svobodny-AGHK',
  },
  {
    id: 4,
    name: 'Ust Luga Şantiye Yönetimi',
    email: 'ustluga@pondera.com',
    password: 'ustluga123',
    role: 'viewer',
    scope_type: 'region',
    scope_value: 'Ust Luga',
  },
  {
    id: 5,
    name: 'DGP-02 Proje Yönetimi',
    email: 'dgp02@pondera.com',
    password: 'dgp123',
    role: 'viewer',
    scope_type: 'project',
    scope_value: 'TOBOLSK DGP-2 PROJESİ',
  },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Lütfen e-posta ve şifrenizi girin.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    let user: any = null;

    try {
      const db = getDb();
      const stmt = db.prepare('SELECT id, name, email, password, role, scope_type, scope_value FROM users WHERE email = ?');
      user = stmt.get(cleanEmail) as any;
    } catch {
      user = null;
    }

    if (!user) {
      user = FALLBACK_USERS.find((u) => u.email === cleanEmail) || null;
    }

    if (!user || user.password !== password) {
      return NextResponse.json(
        { success: false, message: 'E-posta veya şifre hatalı.' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        scope_type: user.scope_type,
        scope_value: user.scope_value,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Giriş yapılırken sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
