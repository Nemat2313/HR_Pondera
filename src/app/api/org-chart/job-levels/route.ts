import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  ORG_JOB_LEVEL_META,
  saveJobTitleLevels,
  syncAndGetJobTitleLevels,
} from '@/lib/orgJobLevelManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const synced = syncAndGetJobTitleLevels();
    return NextResponse.json({
      success: true,
      meta: ORG_JOB_LEVEL_META,
      revision: synced.revision,
      totalTitles: synced.items.length,
      unconfirmedCount: synced.unconfirmedTitles.length,
      unconfirmedTitles: synced.unconfirmedTitles,
      items: synced.items,
      levelMap: synced.levelMap,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Görev seviye tanımları alınamadı.' },
      { status: 500 }
    );
  }
}

async function handleSave(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        {
          success: false,
          message: 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.',
        },
        { status: 401 }
      );
    }

    if (sessionUser.role === 'viewer') {
      return NextResponse.json(
        {
          success: false,
          message:
            'Gözlemci (Viewer) rolündeki kullanıcıların görev seviyelerini tanımlama veya düzenleme yetkisi bulunmamaktadır.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawList: Array<Record<string, any>> = Array.isArray(body?.updates)
      ? body.updates
      : body?.title
        ? [body]
        : [];

    const validUpdates = rawList
      .map((u) => ({
        title: String(u.title || u.normTitle || u.displayTitle || '').trim(),
        displayTitle: String(u.displayTitle || u.title || '').trim(),
        levelNo: Number(u.levelNo),
      }))
      .filter((u) => u.title.length > 0 && u.levelNo >= 1 && u.levelNo <= 8);

    if (validUpdates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Geçerli en az 1 görev unvanı ve seviye (L1–L8) gönderilmelidir.',
        },
        { status: 400 }
      );
    }

    const actorName = sessionUser.name || sessionUser.email || 'Kullanıcı';
    const result = saveJobTitleLevels(validUpdates, actorName);
    const refreshed = syncAndGetJobTitleLevels();

    return NextResponse.json({
      success: true,
      savedCount: result.savedCount,
      revision: refreshed.revision,
      unconfirmedCount: refreshed.unconfirmedTitles.length,
      unconfirmedTitles: refreshed.unconfirmedTitles,
      items: refreshed.items,
      levelMap: refreshed.levelMap,
      message: `${result.savedCount} görev unvanının sınıf seviyesi güncellendi.`,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Görev seviyesi kaydedilirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  return handleSave(request);
}

export async function POST(request: Request) {
  return handleSave(request);
}
