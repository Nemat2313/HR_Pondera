import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'Lütfen geçerli bir Excel dosyası (.xlsx) seçin.' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ success: false, message: 'Yalnızca .xlsx veya .xls uzantılı dosyalar desteklenir.' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const tempFilePath = path.join(uploadDir, `uploaded_${Date.now()}.xlsx`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);

    // Call python script to rebuild database from this new file
    const pythonScript = path.join(process.cwd(), 'build_db.py');
    const escapedTempPath = tempFilePath.replace(/\\/g, '\\\\');
    
    // Run update in background / promise
    try {
      const command = `python -c "import build_db; build_db.EXCEL_PATH = r'${escapedTempPath}'; build_db.build_database()"`;
      await execPromise(command, { cwd: process.cwd() });
    } catch {
      // If error occurs, keep existing DB
      return NextResponse.json({ success: false, message: 'Excel dosyası işlenirken hata oluştu. Veri yapısı kontrol edilmelidir.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Excel başarıyla yüklendi ve sistem güncellendi.',
      fileName: file.name,
      fileSize: file.size,
    });
  } catch {
    return NextResponse.json({ success: false, message: 'Dosya yükleme işlemi başarısız oldu.' }, { status: 500 });
  }
}
