import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import zlib from 'zlib';
import { resetDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';
import { createPreActionBackup } from '@/lib/backup';

const execFilePromise = util.promisify(execFile);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PYTHON_BUILD_INLINE = [
  'import sys, build_db',
  'build_db.EXCEL_PATH = sys.argv[1]',
  'build_db.DATA_FRESHNESS = sys.argv[2]',
  'build_db.SOURCE_FILE = sys.argv[3]',
  'build_db.build_database()',
].join('; ');

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Gözlemci (Viewer) rolünün dosya yükleme yetkisi yoktur.' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dataFreshness = ((formData.get('dataFreshness') as string) || '').trim() || '08.10.2026';

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'Lütfen geçerli bir dosya (.xlsx, .txt, .csv, .zip) seçin.' },
        { status: 400 }
      );
    }

    const lowerName = file.name.toLowerCase();
    const validExts = ['.xlsx', '.xls', '.csv', '.txt', '.tsv', '.zip'];
    if (!validExts.some(ext => lowerName.endsWith(ext))) {
      return NextResponse.json(
        { success: false, message: 'Yalnızca .xlsx, .xls, .csv, .txt veya .zip uzantılı dosyalar desteklenir.' },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.name).toLowerCase() || '.xlsx';
    const tempFilePath = path.join(uploadDir, `uploaded_${Date.now()}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    const safeFreshness = dataFreshness.replace(/['"\\]/g, '');
    const safeFileName = path.basename(file.name).replace(/['"\\]/g, '');

    // 1. Automatic Pre-Action Protection Backup (VACUUM INTO -> .db.gz) before modifying database
    const preBackup = createPreActionBackup(
      'excel_upload',
      `İK Excel Yükleme Öncesi (${safeFileName})`,
      `Перед загрузкой ИК Excel (${safeFileName})`
    );

    // 2. Checkpoint WAL and close active Node SQLite handle before Python build_db updates personnel
    resetDb();

    const pyArgs = ['-c', PYTHON_BUILD_INLINE, tempFilePath, safeFreshness, safeFileName];

    const isWin = process.platform === 'win32';
    const candidates = isWin
      ? ['python', 'python3']
      : [
          path.join(process.cwd(), 'venv', 'bin', 'python3'),
          path.join(process.cwd(), 'venv', 'bin', 'python'),
          path.join(process.cwd(), '.venv', 'bin', 'python3'),
          '/usr/bin/python3',
          'python3',
          'python',
        ].filter((c) => (c.startsWith('/') ? fs.existsSync(c) : true));

    let executed = false;
    let buildError: string | null = null;
    for (const cmd of candidates) {
      try {
        await execFilePromise(cmd, pyArgs, {
          cwd: process.cwd(),
          timeout: 300000,
          maxBuffer: 20 * 1024 * 1024,
        });
        executed = true;
        buildError = null;
        break;
      } catch (err: any) {
        const msg = err?.stderr || err?.stdout || err?.message || String(err);
        if (!buildError || !msg.includes('ENOENT')) {
          buildError = msg;
        }
      }
    }

    if (!executed) {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      return NextResponse.json(
        {
          success: false,
          message: `Excel dosyası işlenirken hata oluştu: ${String(buildError || '').slice(0, 300)}`,
        },
        { status: 500 }
      );
    }

    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }

    // Invalidate cached database connection so next query immediately loads the updated database
    resetDb();

    // Ensure system_info is updated directly in SQLite & read record counts
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    let totalRecords = '0';
    let activeRecords = '0';
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('data_freshness', ?)").run(safeFreshness);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('source_file', ?)").run(safeFileName);
      const rows = db.prepare("SELECT key, value FROM system_info WHERE key IN ('total_records', 'active_records')").all() as { key: string; value: string }[];
      for (const r of rows) {
        if (r.key === 'total_records') totalRecords = r.value;
        if (r.key === 'active_records') activeRecords = r.value;
      }
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch {}
      try { db.close(); } catch {}
    } catch {}

    resetDb();

    return NextResponse.json({
      success: true,
      message: 'Excel başarıyla yüklendi ve sistem güncellendi.',
      dataFreshness: safeFreshness,
      fileName: file.name,
      fileSize: file.size,
      totalRecords,
      activeRecords,
      preBackupId: preBackup?.id || null,
      preBackupCreatedAt: preBackup?.createdAt || null,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Dosya yükleme işlemi başarısız oldu.' },
      { status: 500 }
    );
  }
}
