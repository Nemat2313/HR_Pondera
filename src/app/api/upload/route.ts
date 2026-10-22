import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import zlib from 'zlib';
import { resetDb } from '@/lib/db';
import { getSessionUserFromRequest } from '@/lib/auth';

const execFilePromise = util.promisify(execFile);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const primaryCmd = process.platform === 'win32' ? 'python' : 'python3';
    const pyArgs = ['-c', PYTHON_BUILD_INLINE, tempFilePath, safeFreshness, safeFileName];

    let buildError: string | null = null;
    try {
      await execFilePromise(primaryCmd, pyArgs, {
        cwd: process.cwd(),
        timeout: 180000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err: any) {
      buildError = err?.stderr || err?.message || String(err);
      try {
        const fallbackCmd = primaryCmd === 'python3' ? 'python' : 'python3';
        await execFilePromise(fallbackCmd, pyArgs, {
          cwd: process.cwd(),
          timeout: 180000,
          maxBuffer: 10 * 1024 * 1024,
        });
        buildError = null;
      } catch (fallbackErr: any) {
        buildError = fallbackErr?.stderr || fallbackErr?.message || buildError;
        return NextResponse.json(
          {
            success: false,
            message: `Excel dosyası işlenirken hata oluştu: ${String(buildError || '').slice(0, 200)}`,
          },
          { status: 500 }
        );
      }
    } finally {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
    }

    // Invalidate cached database connection so next query immediately loads the updated database
    resetDb();

    // Ensure system_info is updated directly in SQLite
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('data_freshness', ?)").run(safeFreshness);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('source_file', ?)").run(safeFileName);
      try { db.close(); } catch {}
    } catch {}

    // Auto-update compressed archive pondera_hr.db.gz for Cloud deployments & backups
    try {
      if (fs.existsSync(dbPath)) {
        const rawDb = fs.readFileSync(dbPath);
        const gzipped = zlib.gzipSync(rawDb);
        fs.writeFileSync(path.join(process.cwd(), 'pondera_hr.db.gz'), gzipped);
      }
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Excel başarıyla yüklendi ve sistem güncellendi.',
      dataFreshness: safeFreshness,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Dosya yükleme işlemi başarısız oldu.' },
      { status: 500 }
    );
  }
}
