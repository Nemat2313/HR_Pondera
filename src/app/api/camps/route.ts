import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  addOrUpdateRoomsRange,
  assignPersonnelCampRoom,
  CampType,
  confirmInferredRooms,
  deleteCampDefinition,
  deleteCampRoom,
  getCampAnalyticsPayload,
  getCampDefinitionById,
  getRoomWithCampById,
  matchesCampRlsScope,
  RoomOperationalStatus,
  RoomType,
  unassignPersonnelCampRoom,
  updateSingleRoom,
  upsertCampDefinition,
} from '@/lib/campManager';

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

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region') || 'all';
    const project = searchParams.get('project') || 'all';

    const payload = getCampAnalyticsPayload({
      region,
      project,
      scopeType: sessionUser.scope_type,
      scopeValue: sessionUser.scope_value,
    });

    return NextResponse.json({
      success: true,
      canManage: sessionUser.role === 'admin' || sessionUser.role === 'idari_isler',
      userRole: sessionUser.role,
      scopeType: sessionUser.scope_type,
      scopeValue: sessionUser.scope_value,
      ...payload,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Kamp verileri yüklenemedi.';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, message: 'Oturum gerekli.' },
        { status: 401 }
      );
    }

    if (sessionUser.role !== 'admin' && sessionUser.role !== 'idari_isler') {
      return NextResponse.json(
        {
          success: false,
          message: 'Bu işlem yalnızca İdari İşler veya Sistem Yöneticisi yetkisi ile yapılabilir.',
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as Record<string, any>;
    const action = String(body?.action || '').trim();
    const actorName = sessionUser.name || sessionUser.email || 'admin';
    const scopeType = sessionUser.scope_type;
    const scopeValue = sessionUser.scope_value;

    const assertScopeAllowed = (region: string, projectName: string) => {
      if (!matchesCampRlsScope(region, projectName, scopeType, scopeValue)) {
        throw new Error('Bu bölge veya şantiyedeki kampları düzenleme yetkiniz yok.');
      }
    };

    let resultMessage = 'İşlem tamamlandı.';
    let createdCampId: number | undefined;

    if (action === 'upsert_camp') {
      const targetId = Number(body.id) || 0;
      if (targetId > 0) {
        const existing = getCampDefinitionById(targetId);
        if (!existing) {
          return NextResponse.json({ success: false, message: 'Kamp bulunamadı.' }, { status: 404 });
        }
        assertScopeAllowed(existing.region, existing.project_name);
      }
      const targetRegion = String(body.region || '').trim();
      const targetProject = String(body.projectName || targetRegion).trim();
      assertScopeAllowed(targetRegion, targetProject);

      const res = upsertCampDefinition(
        {
          id: targetId || undefined,
          region: targetRegion,
          projectName: targetProject,
          campCode: String(body.campCode || ''),
          campName: String(body.campName || ''),
          campType: (body.campType || 'modular') as CampType,
          defaultRoomCapacity: Number(body.defaultRoomCapacity) || 4,
          notes: body.notes ? String(body.notes) : '',
          initialRoomStart:
            body.initialRoomStart !== undefined && body.initialRoomStart !== ''
              ? Number(body.initialRoomStart)
              : undefined,
          initialRoomEnd:
            body.initialRoomEnd !== undefined && body.initialRoomEnd !== ''
              ? Number(body.initialRoomEnd)
              : undefined,
          initialFloorNo:
            body.initialFloorNo !== undefined && body.initialFloorNo !== ''
              ? Number(body.initialFloorNo)
              : undefined,
        },
        actorName
      );
      createdCampId = res.campId;
      resultMessage = targetId > 0 ? 'Kamp bilgileri güncellendi.' : 'Yeni kamp kaydı oluşturuldu.';
    } else if (action === 'delete_camp') {
      const campId = Number(body.campId);
      const existing = getCampDefinitionById(campId);
      if (!existing) {
        return NextResponse.json({ success: false, message: 'Kamp bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(existing.region, existing.project_name);
      deleteCampDefinition(campId);
      resultMessage = 'Kamp ve bağlı oda tanımları silindi.';
    } else if (action === 'add_rooms') {
      const campId = Number(body.campId);
      const camp = getCampDefinitionById(campId);
      if (!camp) {
        return NextResponse.json({ success: false, message: 'Hedef kamp bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(camp.region, camp.project_name);

      const res = addOrUpdateRoomsRange({
        campId,
        roomNo: body.roomNo ? String(body.roomNo) : undefined,
        startNo: body.startNo !== undefined && body.startNo !== '' ? Number(body.startNo) : undefined,
        endNo: body.endNo !== undefined && body.endNo !== '' ? Number(body.endNo) : undefined,
        prefix: body.prefix ? String(body.prefix) : undefined,
        floorNo: body.floorNo !== undefined && body.floorNo !== '' ? Number(body.floorNo) : undefined,
        capacity: body.capacity !== undefined ? Number(body.capacity) : camp.default_room_capacity,
        roomType: (body.roomType || 'worker') as RoomType,
        status: (body.status || 'active') as RoomOperationalStatus,
        notes: body.notes ? String(body.notes) : '',
      });
      resultMessage = `${res.count} oda kaydedildi / güncellendi.`;
    } else if (action === 'update_room') {
      const roomId = Number(body.roomId);
      const info = getRoomWithCampById(roomId);
      if (!info) {
        return NextResponse.json({ success: false, message: 'Oda bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(info.camp.region, info.camp.project_name);

      updateSingleRoom(roomId, {
        capacity: body.capacity !== undefined ? Number(body.capacity) : undefined,
        roomType: body.roomType as RoomType | undefined,
        status: body.status as RoomOperationalStatus | undefined,
        floorNo: body.floorNo !== undefined ? Number(body.floorNo) : undefined,
        notes: body.notes !== undefined ? String(body.notes) : undefined,
      });
      resultMessage = `Oda ${info.room.room_no} güncellendi.`;
    } else if (action === 'confirm_inferred') {
      const campId = Number(body.campId);
      const camp = getCampDefinitionById(campId);
      if (!camp) {
        return NextResponse.json({ success: false, message: 'Kamp bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(camp.region, camp.project_name);
      const changed = confirmInferredRooms(campId);
      resultMessage = `${changed} tahmini oda İdari İşler envanteri olarak onaylandı.`;
    } else if (action === 'delete_room') {
      const roomId = Number(body.roomId);
      const info = getRoomWithCampById(roomId);
      if (!info) {
        return NextResponse.json({ success: false, message: 'Oda bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(info.camp.region, info.camp.project_name);
      deleteCampRoom(roomId);
      resultMessage = `Oda ${info.room.room_no} silindi.`;
    } else if (action === 'assign_personnel') {
      const campId = Number(body.campId);
      const sicilNo = String(body.sicilNo || '').trim();
      const roomNo = String(body.roomNo || '').trim();
      const camp = getCampDefinitionById(campId);
      if (!camp) {
        return NextResponse.json({ success: false, message: 'Hedef kamp bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(camp.region, camp.project_name);

      const db = getDb();
      const person = db
        .prepare('SELECT region, proje_adi FROM personnel WHERE sicil_no = ?')
        .get(sicilNo) as { region?: string; proje_adi?: string } | undefined;
      if (!person) {
        return NextResponse.json({ success: false, message: 'Personel kaydı bulunamadı.' }, { status: 404 });
      }
      assertScopeAllowed(person.region || camp.region, person.proje_adi || camp.project_name);

      assignPersonnelCampRoom({
        sicilNo,
        campId,
        roomNo,
        actorName,
      });
      resultMessage = `Personel ${camp.camp_code} / Oda ${roomNo || '-'} konumuna yerleştirildi.`;
    } else if (action === 'unassign_personnel') {
      const sicilNo = String(body.sicilNo || '').trim();
      const db = getDb();
      const person = db
        .prepare('SELECT region, proje_adi FROM personnel WHERE sicil_no = ?')
        .get(sicilNo) as { region?: string; proje_adi?: string } | undefined;
      if (person) {
        assertScopeAllowed(person.region || 'all', person.proje_adi || 'all');
      }
      unassignPersonnelCampRoom({ sicilNo, actorName });
      resultMessage = 'Personelin kamp/oda kaydı kaldırıldı.';
    } else {
      return NextResponse.json(
        { success: false, message: 'Geçersiz işlem komutu.' },
        { status: 400 }
      );
    }

    const filterRegion = String(body.filterRegion || 'all');
    const filterProject = String(body.filterProject || 'all');
    const payload = getCampAnalyticsPayload({
      region: filterRegion,
      project: filterProject,
      scopeType,
      scopeValue,
    });

    return NextResponse.json({
      success: true,
      message: resultMessage,
      createdCampId,
      canManage: true,
      ...payload,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'İşlem başarısız oldu.';
    const status = message.includes('yetkiniz') ? 403 : 400;
    return NextResponse.json(
      { success: false, message },
      { status }
    );
  }
}
