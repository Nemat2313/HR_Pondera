import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT id, name, email, role, scope_type, scope_value, created_at FROM users ORDER BY id ASC');
    const users = stmt.all();

    return NextResponse.json({
      success: true,
      users,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kullanıcılar alınamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, role, scope_type, scope_value } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { success: false, message: 'Ad, e-posta, şifre ve rol alanları zorunludur.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = getDb();

    // Check if email already exists
    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existing = checkStmt.get(cleanEmail);
    if (existing) {
      return NextResponse.json(
        { success: false, message: 'Bu e-posta adresi ile kayıtlı bir kullanıcı zaten mevcut.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const insertStmt = db.prepare(`
      INSERT INTO users (name, email, password, role, scope_type, scope_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      name.trim(),
      cleanEmail,
      password,
      role,
      scope_type || 'all',
      scope_value || 'all',
      now
    );

    return NextResponse.json({
      success: true,
      message: 'Kullanıcı başarıyla oluşturuldu.',
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kullanıcı oluşturulurken bir hata meydana geldi.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Geçerli bir kullanıcı kimliği (ID) gereklidir.' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Prevent deleting the primary admin user (id = 1)
    if (Number(id) === 1) {
      return NextResponse.json(
        { success: false, message: 'Ana yönetici hesabı silinemez.' },
        { status: 403 }
      );
    }

    const deleteStmt = db.prepare('DELETE FROM users WHERE id = ?');
    deleteStmt.run(id);

    return NextResponse.json({
      success: true,
      message: 'Kullanıcı başarıyla silindi.',
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kullanıcı silinemedi.' },
      { status: 500 }
    );
  }
}
