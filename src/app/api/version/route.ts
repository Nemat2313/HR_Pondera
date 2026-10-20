import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cachedVersionPayload: {
  success: boolean;
  version: string;
  buildNumber: number;
  commitHash: string;
  updatedAt: string;
} | null = null;

export async function GET() {
  if (cachedVersionPayload) {
    return NextResponse.json(cachedVersionPayload);
  }
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

    cachedVersionPayload = {
      success: true,
      version: `v2.6.${commitCount}`,
      buildNumber: Number(commitCount) || 1,
      commitHash: shortHash,
      updatedAt: commitTime,
    };

    return NextResponse.json(cachedVersionPayload);
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
