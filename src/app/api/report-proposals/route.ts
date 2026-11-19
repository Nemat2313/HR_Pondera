import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getReportProposalsPayload } from '@/lib/reportProposalsEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, message: 'Oturum gerekli.' },
        { status: 401 }
      );
    }

    if (sessionUser.role === 'idari_isler') {
      return NextResponse.json(
        { success: false, message: 'Bu rapor modülüne erişim yetkiniz yok.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'all';

    const payload = getReportProposalsPayload({
      region,
      scopeType: sessionUser.scope_type,
      scopeValue: sessionUser.scope_value,
    });

    return NextResponse.json({
      success: true,
      ...payload,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Rapor verileri hesaplanamadı.';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
