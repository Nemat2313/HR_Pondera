import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_USERS_LIST = [
  { id: 1, name: 'Sistem Yöneticisi (Admin)', email: 'admin@pondera.com', role: 'admin', scope_type: 'all', scope_value: 'all', created_at: '2026-10-08 19:00:00' },
  { id: 2, name: 'Kazan Şantiye Yönetimi', email: 'kazan@pondera.com', role: 'user', scope_type: 'region', scope_value: 'Kazan', created_at: '2026-10-08 19:00:00' },
  { id: 3, name: 'Svobodny Şantiye Yönetimi', email: 'svobodny@pondera.com', role: 'user', scope_type: 'region', scope_value: 'Svobodny-AGHK', created_at: '2026-10-08 19:00:00' },
  { id: 4, name: 'Ust Luga Şantiye Yönetimi', email: 'ustluga@pondera.com', role: 'user', scope_type: 'region', scope_value: 'Ust Luga', created_at: '2026-10-08 19:00:00' },
  { id: 5, name: 'DGP-02 Proje Yönetimi', email: 'dgp02@pondera.com', role: 'user', scope_type: 'project', scope_value: 'TOBOLSK DGP-2 PROJESİ', created_at: '2026-10-08 19:00:00' },
];

export async function GET() {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT id, name, email, role, scope_type, scope_value, created_at FROM users ORDER BY id ASC');
    const users = stmt.all();

    return NextResponse.json({
      success: true,
      users: Array.isArray(users) && users.length > 0 ? users : DEFAULT_USERS_LIST,
    });
  } catch {
    return NextResponse.json({
      success: true,
      users: DEFAULT_USERS_LIST,
    });
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

    const validRole = role === 'admin' ? 'admin' : role === 'viewer' ? 'viewer' : 'user';
    const validScopeType =
      scope_type === 'all' || scope_type === 'region' || scope_type === 'project'
        ? scope_type
        : 'all';
    const validScopeValue =
      validScopeType === 'all' ? 'all' : (scope_value && String(scope_value).trim()) || 'all';

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const insertStmt = db.prepare(`
      INSERT INTO users (name, email, password, role, scope_type, scope_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      name.trim(),
      cleanEmail,
      password,
      validRole,
      validScopeType,
      validScopeValue,
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

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, name, role, scope_type, scope_value, password } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Güncellenecek kullanıcı kimliği (ID) gereklidir.' },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) as any;
    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Kullanıcı bulunamadı.' },
        { status: 404 }
      );
    }

    const validRole =
      Number(id) === 1
        ? 'admin'
        : role === 'admin'
        ? 'admin'
        : role === 'viewer'
        ? 'viewer'
        : role === 'user'
        ? 'user'
        : existing.role;

    const validScopeType =
      Number(id) === 1
        ? 'all'
        : scope_type === 'all' || scope_type === 'region' || scope_type === 'project'
        ? scope_type
        : existing.scope_type;

    const validScopeValue =
      validScopeType === 'all'
        ? 'all'
        : (scope_value !== undefined ? String(scope_value).trim() : existing.scope_value) || 'all';

    const nextName =
      name !== undefined && String(name).trim() ? String(name).trim() : existing.name;
    const nextPassword =
      password !== undefined && String(password).trim()
        ? String(password).trim()
        : existing.password;

    db.prepare(`
      UPDATE users
      SET name = ?, role = ?, scope_type = ?, scope_value = ?, password = ?
      WHERE id = ?
    `).run(nextName, validRole, validScopeType, validScopeValue, nextPassword, Number(id));

    return NextResponse.json({
      success: true,
      message: 'Kullanıcı yetkileri ve kapsamı başarıyla güncellendi.',
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kullanıcı güncellenirken bir hata meydana geldi.' },
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
