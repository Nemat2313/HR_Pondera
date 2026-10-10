import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import zlib from 'zlib';
import { resetDb } from '@/lib/db';

const execPromise = util.promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
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

    // ALL CHUNKS RECEIVED! Assemble the file
    const ext = path.extname(rawFileName).toLowerCase() || '.xlsx';
    const assembledFilePath = path.join(uploadDir, `assembled_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
    const writeStream = fs.createWriteStream(assembledFilePath);

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(sessionDir, `part_${i}.chunk`);
      const partData = fs.readFileSync(partPath);
      writeStream.write(partData);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Clean up temporary chunk pieces
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch {}

    // Process assembled file using python build_db
    const escapedTempPath = assembledFilePath.replace(/\\/g, '\\\\');
    const safeFreshness = dataFreshness.replace(/['"\\]/g, '');
    const safeFileName = rawFileName.replace(/['"\\]/g, '');
    const primaryCmd = process.platform === 'win32' ? 'python' : 'python3';

    let buildError: string | null = null;
    try {
      const command = `${primaryCmd} -c "import build_db; build_db.EXCEL_PATH = r'${escapedTempPath}'; build_db.DATA_FRESHNESS = '${safeFreshness}'; build_db.SOURCE_FILE = '${safeFileName}'; build_db.build_database()"`;
      await execPromise(command, { cwd: process.cwd(), timeout: 300000, maxBuffer: 20 * 1024 * 1024 });
    } catch (err: any) {
      buildError = err?.stderr || err?.message || String(err);
      try {
        const fallbackCmd = primaryCmd === 'python3' ? 'python' : 'python3';
        const command = `${fallbackCmd} -c "import build_db; build_db.EXCEL_PATH = r'${escapedTempPath}'; build_db.DATA_FRESHNESS = '${safeFreshness}'; build_db.SOURCE_FILE = '${safeFileName}'; build_db.build_database()"`;
        await execPromise(command, { cwd: process.cwd(), timeout: 300000, maxBuffer: 20 * 1024 * 1024 });
        buildError = null;
      } catch (fallbackErr: any) {
        buildError = fallbackErr?.stderr || fallbackErr?.message || buildError;
        return NextResponse.json(
          {
            success: false,
            completed: false,
            message: `Dosya işlenirken hata oluştu: ${String(buildError || '').slice(0, 200)}`,
          },
          { status: 500 }
        );
      }
    } finally {
      if (fs.existsSync(assembledFilePath)) {
        try { fs.unlinkSync(assembledFilePath); } catch {}
      }
    }

    // Invalidate cached database connection
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
