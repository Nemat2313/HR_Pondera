import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

function getValidTableNames(db: any): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function sanitizeIdentifier(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'overview';
    const db = getDb();

    const validTables = getValidTableNames(db);

    if (action === 'overview') {
      const dbPath = path.join(process.cwd(), 'pondera_hr.db');
      let fileSizeBytes = 0;
      let modifiedAt = '';
      try {
        if (fs.existsSync(dbPath)) {
          const stat = fs.statSync(dbPath);
          fileSizeBytes = stat.size;
          modifiedAt = stat.mtime.toISOString();
        }
      } catch {}

      const sqliteVerRow = db.prepare('SELECT sqlite_version() AS ver').get() as { ver?: string } | undefined;
      const indexCountRow = db
        .prepare(`SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`)
        .get() as { cnt?: number } | undefined;

      const tablesMeta = validTables.map((tableName) => {
        let rowCount = 0;
        let columns: TableColumnInfo[] = [];
        try {
          const cntRow = db
            .prepare(`SELECT COUNT(*) AS cnt FROM ${sanitizeIdentifier(tableName)}`)
            .get() as { cnt?: number } | undefined;
          rowCount = Number(cntRow?.cnt || 0);
          columns = db
            .prepare(`PRAGMA table_info(${sanitizeIdentifier(tableName)})`)
            .all() as TableColumnInfo[];
        } catch {}
        return {
          name: tableName,
          rowCount,
          columnCount: columns.length,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type || 'TEXT',
            pk: c.pk === 1,
            notnull: c.notnull === 1,
          })),
        };
      });

      const priorityOrder: Record<string, number> = {
        gosuslugi_submissions: 1,
        gosuslugi_submission_history: 2,
        gosuslugi_refused_archive: 3,
        gosuslugi_vks_master_list: 4,
        gosuslugi_vks_master: 5,
        personnel: 6,
        users: 7,
        gosuslugi_mail_events: 8,
        gosuslugi_mail_config: 9,
        system_info: 10,
        system_meta: 11,
        columns_meta: 12,
      };
      tablesMeta.sort((a, b) => {
        const pa = priorityOrder[a.name] ?? 99;
        const pb = priorityOrder[b.name] ?? 99;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({
        success: true,
        serverInfo: {
          hostname: os.hostname(),
          platform: `${os.type()} ${os.release()} (${os.arch()})`,
          nodeVersion: process.version,
          sqliteVersion: sqliteVerRow?.ver || '3.x',
          dbPath,
          dbFileSizeMB: (fileSizeBytes / (1024 * 1024)).toFixed(2),
          dbModifiedAt: modifiedAt,
          totalTables: tablesMeta.length,
          totalIndexes: Number(indexCountRow?.cnt || 0),
        },
        tables: tablesMeta,
      });
    }

    if (action === 'row_detail') {
      const table = (searchParams.get('table') || '').trim();
      const rowid = Number(searchParams.get('rowid') || 0);
      if (!table || !validTables.includes(table) || !rowid) {
        return NextResponse.json({ success: false, message: 'Geçersiz parametre.' }, { status: 400 });
      }
      const row = db
        .prepare(`SELECT rowid AS _rowid_, * FROM ${sanitizeIdentifier(table)} WHERE rowid = ? LIMIT 1`)
        .get(rowid) as Record<string, any> | undefined;
      if (!row) {
        return NextResponse.json({ success: false, message: 'Kayıt bulunamadı.' }, { status: 404 });
      }
      if (table === 'users' && row.password) row.password = '•••••••• (scrypt hash)';
      if (table === 'gosuslugi_mail_config' && row.app_password) row.app_password = '••••••••';
      return NextResponse.json({ success: true, row });
    }

    if (action === 'rows') {
      const table = (searchParams.get('table') || '').trim();
      if (!table || !validTables.includes(table)) {
        return NextResponse.json({ success: false, message: 'Geçersiz tablo adı.' }, { status: 400 });
      }

      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
      const pageSize = Math.min(250, Math.max(10, parseInt(searchParams.get('pageSize') || '50', 10) || 50));
      const search = (searchParams.get('search') || '').trim();
      const sortBy = (searchParams.get('sortBy') || '').trim();
      const sortOrder = (searchParams.get('sortOrder') || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const columnFilterCol = (searchParams.get('filterCol') || '').trim();
      const columnFilterVal = (searchParams.get('filterVal') || '').trim();

      const columns = db
        .prepare(`PRAGMA table_info(${sanitizeIdentifier(table)})`)
        .all() as TableColumnInfo[];
      const validColNames = columns.map((c) => c.name);
      const pkCol = columns.find((c) => c.pk === 1)?.name || validColNames[0] || 'rowid';

      // Exclude bulky extra_json from list view & full-table LIKE scans to keep memory usage tiny
      const listCols = validColNames.filter((c) => c !== 'extra_json');
      const selectColsSql =
        listCols.length > 0
          ? ['rowid AS _rowid_', ...listCols.map(sanitizeIdentifier)].join(', ')
          : 'rowid AS _rowid_, *';

      const whereClauses: string[] = [];
      const params: Array<string | number> = [];

      if (search && listCols.length > 0) {
        const searchableCols = listCols
          .filter((c) => c !== 'password' && c !== 'app_password')
          .slice(0, 12);
        const subClauses = searchableCols.map(
          (c) => `CAST(${sanitizeIdentifier(c)} AS TEXT) LIKE ?`
        );
        if (subClauses.length > 0) {
          whereClauses.push(`(${subClauses.join(' OR ')})`);
          for (let i = 0; i < subClauses.length; i++) {
            params.push(`%${search}%`);
          }
        }
      }

      if (columnFilterCol && validColNames.includes(columnFilterCol) && columnFilterVal) {
        whereClauses.push(`CAST(${sanitizeIdentifier(columnFilterCol)} AS TEXT) = ?`);
        params.push(columnFilterVal);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const orderCol = listCols.includes(sortBy)
        ? sanitizeIdentifier(sortBy)
        : validColNames.includes(pkCol)
        ? sanitizeIdentifier(pkCol)
        : 'rowid';

      const countStmt = db.prepare(
        `SELECT COUNT(*) AS total FROM ${sanitizeIdentifier(table)} ${whereSql}`
      );
      const countRes = countStmt.get(...params) as { total?: number } | undefined;
      const total = Number(countRes?.total || 0);

      const offset = (page - 1) * pageSize;
      const dataStmt = db.prepare(
        `SELECT ${selectColsSql} FROM ${sanitizeIdentifier(table)} ${whereSql} ORDER BY ${orderCol} ${sortOrder} LIMIT ? OFFSET ?`
      );
      const rawRows = dataStmt.all(...params, pageSize, offset) as Array<Record<string, any>>;

      const rows = rawRows.map((r) => {
        if (table === 'users' && r.password) {
          return { ...r, password: '•••••••• (scrypt hash)' };
        }
        if (table === 'gosuslugi_mail_config' && r.app_password) {
          return { ...r, app_password: '••••••••' };
        }
        return r;
      });

      return NextResponse.json({
        success: true,
        table,
        pkCol,
        columns: columns.map((c) => ({
          name: c.name,
          type: c.type || 'TEXT',
          pk: c.pk === 1,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        rows,
      });
    }

    return NextResponse.json({ success: false, message: 'Bilinmeyen işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Veritabanı sorgusu başarısız oldu.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || '').trim();
    const db = getDb();
    const validTables = getValidTableNames(db);

    // 1. Execute Read-Only SQL Query (SELECT / PRAGMA / WITH) with automatic row cap to prevent OOM
    if (action === 'query') {
      const rawSql = String(body?.sql || '').trim();
      if (!rawSql) {
        return NextResponse.json({ success: false, message: 'SQL sorgusu boş olamaz.' }, { status: 400 });
      }

      const normalized = rawSql
        .replace(/^\/\*[\s\S]*?\*\/\s*/g, '')
        .replace(/^--.*$/gm, '')
        .trim()
        .replace(/;+\s*$/, '');

      if (!/^(SELECT|PRAGMA|WITH)\b/i.test(normalized)) {
        return NextResponse.json(
          {
            success: false,
            message: 'Güvenlik nedeniyle SQL konsolundan yalnızca SELECT / WITH / PRAGMA sorguları çalıştırılabilir.',
          },
          { status: 400 }
        );
      }

      const safeSql =
        /^SELECT\b/i.test(normalized) && !/\bLIMIT\s+\d+/i.test(normalized)
          ? `SELECT * FROM (${normalized}) LIMIT 500`
          : normalized;

      const t0 = performance.now();
      const stmt = db.prepare(safeSql);
      const rawRows = stmt.all() as Array<Record<string, any>>;
      const elapsedMs = (performance.now() - t0).toFixed(2);

      const limitedRows = rawRows.slice(0, 500).map((r) => {
        const clone = { ...r };
        if ('password' in clone) clone.password = '••••••••';
        if ('app_password' in clone) clone.app_password = '••••••••';
        if ('extra_json' in clone && typeof clone.extra_json === 'string' && clone.extra_json.length > 300) {
          clone.extra_json = clone.extra_json.slice(0, 300) + '...';
        }
        return clone;
      });

      const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];

      return NextResponse.json({
        success: true,
        columns,
        rows: limitedRows,
        totalReturned: rawRows.length,
        truncated: rawRows.length > 500,
        elapsedMs,
      });
    }

    // 2. Update a single row cell/fields by rowid
    if (action === 'update_row') {
      const table = String(body?.table || '').trim();
      const rowid = body?.rowid;
      const updates = body?.updates as Record<string, any> | undefined;

      if (!table || !validTables.includes(table) || rowid === undefined || !updates) {
        return NextResponse.json({ success: false, message: 'Geçersiz güncelleme parametreleri.' }, { status: 400 });
      }

      const columns = db
        .prepare(`PRAGMA table_info(${sanitizeIdentifier(table)})`)
        .all() as TableColumnInfo[];
      const validColNames = columns.map((c) => c.name).filter((c) => c !== 'password' && c !== 'app_password');

      const setClauses: string[] = [];
      const params: any[] = [];
      for (const [col, val] of Object.entries(updates)) {
        if (validColNames.includes(col)) {
          setClauses.push(`${sanitizeIdentifier(col)} = ?`);
          params.push(val === null ? null : String(val));
        }
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ success: false, message: 'Güncellenecek kolon bulunamadı.' }, { status: 400 });
      }

      params.push(rowid);
      const stmt = db.prepare(
        `UPDATE ${sanitizeIdentifier(table)} SET ${setClauses.join(', ')} WHERE rowid = ?`
      );
      const res = stmt.run(...params);

      return NextResponse.json({
        success: true,
        changes: res.changes,
      });
    }

    // 3. Delete a single row by rowid
    if (action === 'delete_row') {
      const table = String(body?.table || '').trim();
      const rowid = body?.rowid;
      if (!table || !validTables.includes(table) || rowid === undefined) {
        return NextResponse.json({ success: false, message: 'Geçersiz silme parametreleri.' }, { status: 400 });
      }

      const stmt = db.prepare(`DELETE FROM ${sanitizeIdentifier(table)} WHERE rowid = ?`);
      const res = stmt.run(rowid);

      return NextResponse.json({
        success: true,
        changes: res.changes,
      });
    }

    return NextResponse.json({ success: false, message: 'Bilinmeyen işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Veritabanı işlemi başarısız oldu.' },
      { status: 500 }
    );
  }
}
