import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  checkAndSendVks15MinReport,
  sendDailyCompliance915Report,
  getMoscowTimeParts,
} from '@/lib/telegramNotifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSystemVal(db: any, key: string): string | null {
  db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
  const r = db.prepare('SELECT value FROM system_info WHERE key = ?').get(key) as { value?: string } | undefined;
  return r?.value ?? null;
}

function setSystemVal(db: any, key: string, value: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS system_info (key TEXT PRIMARY KEY, value TEXT);`);
  db.prepare(`
    INSERT INTO system_info (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const testMode = (searchParams.get('test') || '').toLowerCase();

    if (testMode === 'vks') {
      const vksRes = await checkAndSendVks15MinReport(true);
      return NextResponse.json({ success: true, mode: 'test_vks', vksRes });
    }
    if (testMode === 'compliance') {
      const compRes = await sendDailyCompliance915Report(true);
      return NextResponse.json({ success: true, mode: 'test_compliance', compRes });
    }
    if (testMode === 'both') {
      const vksRes = await checkAndSendVks15MinReport(true);
      const compRes = await sendDailyCompliance915Report(true);
      return NextResponse.json({ success: true, mode: 'test_both', vksRes, compRes });
    }

    const db = getDb();
    const nowMs = Date.now();
    const msk = getMoscowTimeParts();

    // 1. Check 15-minute VKS Notification Report
    let vksResult: any = { skipped: true };
    const lastVksCheckMs = Number(getSystemVal(db, 'telegram_vks_last_check_ms') || '0');
    const isQuarterHour = msk.minute % 15 === 0;
    const elapsedSinceCheck = nowMs - lastVksCheckMs;

    if ((isQuarterHour && elapsedSinceCheck >= 65 * 1000) || elapsedSinceCheck >= 15 * 60 * 1000) {
      setSystemVal(db, 'telegram_vks_last_check_ms', String(nowMs));
      vksResult = await checkAndSendVks15MinReport(false);
    }

    // 2. Check Daily 09:15 Moscow Time Document Expiry Report
    const complianceResult = await sendDailyCompliance915Report(false);

    return NextResponse.json({
      success: true,
      moscowTime: `${msk.dateDisplay} ${msk.timeDisplay}`,
      vksResult,
      complianceResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Telegram cron error' },
      { status: 500 }
    );
  }
}
