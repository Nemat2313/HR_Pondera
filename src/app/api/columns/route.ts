import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const query = db.prepare(`
      SELECT col_index, col_name, col_group 
      FROM columns_meta 
      ORDER BY col_index ASC
    `);
    const rows = query.all();

    // Group columns by col_group
    const groups: Record<string, any[]> = {};
    for (const r of rows as any[]) {
      const g = r.col_group || 'Diğer Detay Alanları';
      if (!groups[g]) groups[g] = [];

      let cleanName = r.col_name;
      if (cleanName === 'RHI ID') cleanName = 'Şirket ID';
      else if (cleanName === 'RHI Görevi') cleanName = 'Ek Görev';
      else if (cleanName.includes('RHI')) cleanName = cleanName.replace(/RHI/g, 'Şirket');

      groups[g].push({
        index: r.col_index,
        name: cleanName,
        key: r.col_name,
      });
    }

    return NextResponse.json({
      success: true,
      columns: rows,
      grouped: groups,
      totalCount: rows.length,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kolon bilgileri alınırken bir sorun oluştu.' },
      { status: 500 }
    );
  }
}
