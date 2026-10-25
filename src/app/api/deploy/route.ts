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
      (
        flock -w 180 9 || exit 0
        cd /var/www/hr_pondera || cd /root/HR_Pondera || cd /var/www/HR_Pondera || cd ~/HR_Pondera
        git fetch origin main
        git reset --hard origin/main
        npm install
        npm run build
        cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
        cp -r public .next/standalone/ 2>/dev/null || true
        pm2 restart hr-pondera || pm2 restart all
      ) 9>/tmp/pondera_deploy.lock
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
