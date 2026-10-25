import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
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
    const chunk = formData.get('chunk') as File | null;
    const uploadId = ((formData.get('uploadId') as string) || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const chunkIndexStr = formData.get('chunkIndex') as string;
    const totalChunksStr = formData.get('totalChunks') as string;
    const rawFileName = (formData.get('fileName') as string) || 'uploaded_data.xlsx';
    const dataFreshness = ((formData.get('dataFreshness') as string) || '').trim() || '08.10.2026';

    if (!chunk || !uploadId || chunkIndexStr === null || !totalChunksStr) {
      return NextResponse.json(
        { success: false, message: 'Eksik veya geçersiz parça yükleme parametreleri.' },
        { status: 400 }
      );
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    const totalChunks = parseInt(totalChunksStr, 10);

    if (isNaN(chunkIndex) || isNaN(totalChunks) || totalChunks <= 0 || chunkIndex < 0 || chunkIndex >= totalChunks) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz parça dizini veya toplam parça sayısı.' },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    const chunksRootDir = path.join(uploadDir, 'chunks');
    const sessionDir = path.join(chunksRootDir, uploadId);

    // Periodic cleanup of orphaned chunk folders older than 1 hour
    try {
      if (fs.existsSync(chunksRootDir)) {
        const now = Date.now();
        const sessions = fs.readdirSync(chunksRootDir);
        for (const s of sessions) {
          const sPath = path.join(chunksRootDir, s);
          try {
            const stat = fs.statSync(sPath);
            if (now - stat.mtimeMs > 3600000) {
              fs.rmSync(sPath, { recursive: true, force: true });
            }
          } catch {}
        }
      }
    } catch {}

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save current chunk
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const chunkFilePath = path.join(sessionDir, `part_${chunkIndex}.chunk`);
    fs.writeFileSync(chunkFilePath, chunkBuffer);

    // Check if all chunks are received
    let allReceived = true;
    for (let i = 0; i < totalChunks; i++) {
      if (!fs.existsSync(path.join(sessionDir, `part_${i}.chunk`))) {
        allReceived = false;
        break;
      }
    }

    // If more chunks are still expected, respond immediately with success
    if (!allReceived) {
      return NextResponse.json({
        success: true,
        completed: false,
        chunkIndex,
        totalChunks,
        message: `Parça ${chunkIndex + 1}/${totalChunks} başarıyla alındı.`,
      });
    }

    // ALL CHUNKS RECEIVED! Assemble the file synchronously to prevent stream backpressure truncation
    const ext = path.extname(rawFileName).toLowerCase() || '.xlsx';
    const assembledFilePath = path.join(uploadDir, `assembled_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
    if (fs.existsSync(assembledFilePath)) {
      try { fs.unlinkSync(assembledFilePath); } catch {}
    }

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(sessionDir, `part_${i}.chunk`);
      const partData = fs.readFileSync(partPath);
      fs.appendFileSync(assembledFilePath, partData);
      try { fs.unlinkSync(partPath); } catch {}
    }

    // Clean up temporary chunk pieces
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {}

    // Close existing DB connection before rebuild; build_db.py will preserve users/submissions and atomically swap pondera_hr.db
    resetDb();
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');

    const safeFreshness = dataFreshness.replace(/['"\\]/g, '');
    const safeFileName = path.basename(rawFileName).replace(/['"\\]/g, '');
    const pyArgs = ['-c', PYTHON_BUILD_INLINE, assembledFilePath, safeFreshness, safeFileName];

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
      if (fs.existsSync(assembledFilePath)) {
        try { fs.unlinkSync(assembledFilePath); } catch {}
      }
      return NextResponse.json(
        {
          success: false,
          completed: false,
          message: `Dosya işlenirken hata oluştu: ${String(buildError || '').slice(0, 300)}`,
        },
        { status: 500 }
      );
    }

    if (fs.existsSync(assembledFilePath)) {
      try { fs.unlinkSync(assembledFilePath); } catch {}
    }

    // Invalidate cached database connection
    resetDb();

    // Ensure system_info is updated directly in SQLite
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('data_freshness', ?)").run(safeFreshness);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('source_file', ?)").run(safeFileName);
      try { db.close(); } catch {}
    } catch {}

    return NextResponse.json({
      success: true,
      completed: true,
      message: 'Dosya parçaları başarıyla birleştirildi ve veritabanı güncellendi.',
      dataFreshness: safeFreshness,
      fileName: safeFileName,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: `Parçalı yükleme sırasında hata oluştu: ${String(err?.message || '')}` },
      { status: 500 }
    );
  }
}
