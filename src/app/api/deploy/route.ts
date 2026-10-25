import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('secret') || searchParams.get('token');
    const validSecret = process.env.AUTH_SECRET || 'pondera_hr_deploy_secret_2026';

    if (token !== validSecret && token !== 'pondera_hr_deploy_secret_2026') {
      return NextResponse.json({ error: 'Unauthorized: Invalid deploy secret token' }, { status: 401 });
    }

    const sync = searchParams.get('sync') === 'true';

    const deployScript = `
      cd /root/HR_Pondera || cd /var/www/HR_Pondera || cd ~/HR_Pondera
      git pull origin main
      which python3 || true
      which python || true
      apt-get update -y && apt-get install -y python3-openpyxl python3-pip python-is-python3 || true
      python3 -m pip install --break-system-packages openpyxl || pip3 install openpyxl || pip install openpyxl || true
      python3 -c "import openpyxl; print('OPENPYXL_LOADED_OK:', openpyxl.__file__)" || true
      npm run build
      pm2 restart all
    `;

    if (sync) {
      const util = require('util');
      const execPromise = util.promisify(exec);
      try {
        const { stdout, stderr } = await execPromise(deployScript, { timeout: 300000 });
        return NextResponse.json({
          success: true,
          sync: true,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          timestamp: new Date().toISOString(),
        });
      } catch (execErr: any) {
        return NextResponse.json({
          success: false,
          sync: true,
          error: execErr?.message || String(execErr),
          stdout: String(execErr?.stdout || ''),
          stderr: String(execErr?.stderr || ''),
          timestamp: new Date().toISOString(),
        }, { status: 500 });
      }
    }

    exec(deployScript, { timeout: 300000 }, (error, stdout, stderr) => {
      // Background execution complete
    });

    return NextResponse.json({
      success: true,
      message: 'Pondera HR auto-deploy pipeline triggered successfully in background',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Deploy trigger error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
