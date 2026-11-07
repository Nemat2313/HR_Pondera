import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  ORDERED_COLUMN_GROUPS,
  classifyPonderaColumnGroup,
  isPlaceholderColumnName,
} from '@/lib/columnGroupsClassifier';

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
    const rawRows = query.all() as Array<{
      col_index: number;
      col_name: string;
      col_group: string | null;
    }>;

    // Self-heal legacy 'Genel' / empty col_group values in SQLite
    const updates: Array<{ col_index: number; col_group: string }> = [];
    const validRows: Array<{ col_index: number; col_name: string; col_group: string }> = [];

    for (const r of rawRows) {
      if (isPlaceholderColumnName(r.col_name)) {
        continue;
      }
      const currentGroup = String(r.col_group || '').trim();
      const resolvedGroup =
        !currentGroup ||
        currentGroup === 'Genel' ||
        currentGroup === 'Diğer Detay Alanları' ||
        !(ORDERED_COLUMN_GROUPS as readonly string[]).includes(currentGroup)
          ? classifyPonderaColumnGroup(r.col_name)
          : currentGroup;

      if (resolvedGroup !== currentGroup) {
        updates.push({ col_index: r.col_index, col_group: resolvedGroup });
      }
      validRows.push({
        col_index: r.col_index,
        col_name: r.col_name,
        col_group: resolvedGroup,
      });
    }

    if (updates.length > 0) {
      try {
        const updateStmt = db.prepare('UPDATE columns_meta SET col_group = ? WHERE col_index = ?');
        db.exec('BEGIN');
        try {
          for (const u of updates) {
            updateStmt.run(u.col_group, u.col_index);
          }
          db.exec('COMMIT');
        } catch {
          try {
            db.exec('ROLLBACK');
          } catch {}
        }
      } catch {}
    }

    // Build groups strictly in 1..16 operational order
    const buckets: Record<string, any[]> = {};
    for (const grpName of ORDERED_COLUMN_GROUPS) {
      buckets[grpName] = [];
    }

    for (const r of validRows) {
      const g = r.col_group || classifyPonderaColumnGroup(r.col_name);
      if (!buckets[g]) buckets[g] = [];

      let cleanName = r.col_name;
      if (cleanName === 'RHI ID' || cleanName === 'RHI Id') cleanName = 'Şirket ID';
      else if (cleanName === 'RHI Görevi') cleanName = 'Ek Görev';
      else if (cleanName.includes('RHI')) cleanName = cleanName.replace(/RHI/g, 'Şirket');

      buckets[g].push({
        index: r.col_index,
        name: cleanName,
        key: r.col_name,
      });
    }

    const groups: Record<string, any[]> = {};
    for (const [grpName, cols] of Object.entries(buckets)) {
      if (cols.length > 0) {
        groups[grpName] = cols;
      }
    }

    return NextResponse.json({
      success: true,
      columns: validRows,
      grouped: groups,
      totalCount: validRows.length,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Kolon bilgileri alınırken bir sorun oluştu.' },
      { status: 500 }
    );
  }
}
