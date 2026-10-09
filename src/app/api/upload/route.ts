import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import zlib from 'zlib';

const execPromise = util.promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dataFreshness = ((formData.get('dataFreshness') as string) || '').trim() || '03.10.2026';

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'Lütfen geçerli bir Excel dosyası (.xlsx) seçin.' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, message: 'Yalnızca .xlsx veya .xls uzantılı dosyalar desteklenir.' },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const tempFilePath = path.join(uploadDir, `uploaded_${Date.now()}.xlsx`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Call python script to rebuild database from this new file with selected date freshness
    const escapedTempPath = tempFilePath.replace(/\\/g, '\\\\');
    const safeFreshness = dataFreshness.replace(/['"\\]/g, '');
    const safeFileName = file.name.replace(/['"\\]/g, '');

    try {
      const command = `python -c "import build_db; build_db.EXCEL_PATH = r'${escapedTempPath}'; build_db.DATA_FRESHNESS = '${safeFreshness}'; build_db.SOURCE_FILE = '${safeFileName}'; build_db.build_database()"`;
      await execPromise(command, { cwd: process.cwd() });
    } catch {
      return NextResponse.json(
        { success: false, message: 'Excel dosyası işlenirken hata oluştu. Veri yapısı kontrol edilmelidir.' },
        { status: 500 }
      );
    }

    // Ensure system_info is updated directly in SQLite
    const dbPath = path.join(process.cwd(), 'pondera_hr.db');
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('data_freshness', ?)").run(safeFreshness);
      db.prepare("INSERT OR REPLACE INTO system_info (key, value) VALUES ('source_file', ?)").run(safeFileName);
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
