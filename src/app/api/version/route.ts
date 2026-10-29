import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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
  let pkgVersion = 'v2.8.1';
  try {
    const pkgRaw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg?.version) {
      pkgVersion = `v${String(pkg.version).replace(/^v/i, '')}`;
    }
  } catch {}

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
      version: pkgVersion || `v2.8.${commitCount}`,
      buildNumber: Number(commitCount) || 1,
      commitHash: shortHash,
      updatedAt: commitTime,
    };

    return NextResponse.json(cachedVersionPayload);
  } catch {
    return NextResponse.json({
      success: true,
      version: pkgVersion,
      buildNumber: 0,
      commitHash: '',
      updatedAt: '',
    });
  }
}
