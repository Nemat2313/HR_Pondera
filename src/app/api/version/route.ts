import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const commitCount = execSync('git rev-list --count HEAD', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    const shortHash = execSync('git rev-parse --short HEAD', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    const commitTime = execSync('git log -1 --format=%cd --date=format:"%d.%m.%Y %H:%M"', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    return NextResponse.json({
      success: true,
      version: `v2.6.${commitCount}`,
      buildNumber: Number(commitCount) || 1,
      commitHash: shortHash,
      updatedAt: commitTime,
    });
  } catch {
    return NextResponse.json({
      success: true,
      version: 'v2.6',
      buildNumber: 0,
      commitHash: '',
      updatedAt: '',
    });
  }
}
