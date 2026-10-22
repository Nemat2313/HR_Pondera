import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  checkAndSendVks15MinReport,
  sendDailyCompliance915Report,
  sendTelegramMessage,
  getMoscowTimeParts,
  claimPendingOutboxMessages,
  markOutboxDelivered,
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
    const db = getDb();

    if (testMode === 'vks') {
      const vksRes = await checkAndSendVks15MinReport(true);
      return NextResponse.json({
        success: true,
        mode: 'test_vks',
        vksRes,
      });
    }
    if (testMode === 'compliance') {
      const compRes = await sendDailyCompliance915Report(true);
      return NextResponse.json({
        success: true,
        mode: 'test_compliance',
        compRes,
      });
    }
    if (testMode === 'both') {
      const vksRes = await checkAndSendVks15MinReport(true);
      const compRes = await sendDailyCompliance915Report(true);
      return NextResponse.json({
        success: true,
        mode: 'test_both',
        vksRes,
        compRes,
      });
    }

    const nowMs = Date.now();
    const msk = getMoscowTimeParts();

    // 1. Check 15-minute VKS Notification Report strictly at :00 (60), :15, :30, :45 of each hour
    let vksResult: any = { skipped: true };
    const quarterMin = Math.floor(msk.minute / 15) * 15; // 0, 15, 30, 45
    const currentQuarterSlot = `${msk.dateIso}_${String(msk.hour).padStart(2, '0')}:${String(quarterMin).padStart(2, '0')}`;
    const lastQuarterSlot = getSystemVal(db, 'telegram_vks_last_quarter_slot') || '';
    const isAtQuarterMark = msk.minute % 15 === 0 || msk.minute % 15 === 1;

    if (isAtQuarterMark && lastQuarterSlot !== currentQuarterSlot) {
      setSystemVal(db, 'telegram_vks_last_quarter_slot', currentQuarterSlot);
      setSystemVal(db, 'telegram_vks_last_check_ms', String(nowMs));
      vksResult = await checkAndSendVks15MinReport(false);
    }

    // 2. Check Daily 09:15 Moscow Time Document Expiry Report
    const complianceResult = await sendDailyCompliance915Report(false);

    // 3. Server-side outbox flush: try delivering any previously queued messages directly from the server
    const queuedOnServer = claimPendingOutboxMessages(db);
    if (queuedOnServer.length > 0) {
      const flushedIds: number[] = [];
      for (const item of queuedOnServer) {
        const sendRes = await sendTelegramMessage(item.text || item.html_text);
        if (sendRes.ok) {
          flushedIds.push(item.id);
        }
      }
      if (flushedIds.length > 0) {
        markOutboxDelivered(db, flushedIds);
      }
    }

    return NextResponse.json({
      success: true,
      moscowTime: `${msk.dateDisplay} ${msk.timeDisplay}`,
      vksResult,
      complianceResult,
      pendingOutbox: [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Telegram cron error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();

    // Optional secure configuration of Telegram Bot Token & Chat ID in SQLite system_info
    const incomingToken = String(body?.botToken || '').trim();
    const incomingChatId = String(body?.chatId || '').trim();
    let configUpdated = false;
    if (incomingToken && /^\d{8,12}:[A-Za-z0-9_-]{30,50}$/.test(incomingToken)) {
      setSystemVal(db, 'telegram_bot_token', incomingToken);
      configUpdated = true;
    }
    if (incomingChatId && /^-?\d{5,20}$/.test(incomingChatId)) {
      setSystemVal(db, 'telegram_chat_id', incomingChatId);
      configUpdated = true;
    }

    const deliveredIds: number[] = Array.isArray(body?.deliveredIds)
      ? body.deliveredIds.map((x: any) => Number(x)).filter((n: number) => !isNaN(n))
      : [];
    if (deliveredIds.length > 0) {
      markOutboxDelivered(db, deliveredIds);
    }
    return NextResponse.json({
      success: true,
      deliveredCount: deliveredIds.length,
      configUpdated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Telegram outbox update error' },
      { status: 500 }
    );
  }
}
