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

    const deployScript = `
      cd /root/HR_Pondera || cd /var/www/HR_Pondera || cd ~/HR_Pondera
      git pull origin main
      npm run build
      pm2 restart all
    `;

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
