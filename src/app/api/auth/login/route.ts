import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const db = getDb();
    const stmt = db.prepare('SELECT id, name, email, password, role, scope_type, scope_value FROM users WHERE email = ?');
    const user = stmt.get(email.trim().toLowerCase()) as any;

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
