import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  cleanTicketPassportNumber,
  ensureAiTicketTables,
  generateNextGuestCode,
  getAiProviderSettings,
  hasProviderCredentials,
} from '@/lib/aiTicketEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = ensureAiTicketTables();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';

    // Lightweight combobox search for linking a ticket to any Pondera Employee OR Guest
    if (action === 'search_people') {
      const q = (searchParams.get('q') || '').trim();
      if (q.length < 2) {
        return NextResponse.json({ success: true, employees: [], guests: [] });
      }
      const like = `%${q}%`;
      const employees = db
        .prepare(
          `SELECT sicil_no, ad_soyad, tam_adi_kiril, pasaport_no, uyruk, region, proje_adi, departman, gorevi, genel_durum
           FROM personnel
           WHERE sicil_no LIKE ? OR ad_soyad LIKE ? OR tam_adi_kiril LIKE ? OR pasaport_no LIKE ?
           ORDER BY CASE WHEN genel_durum LIKE 'Mevcut%' THEN 0 ELSE 1 END, sira_no ASC
           LIMIT 20`
        )
        .all(like, like, like, like);

      const guests = db
        .prepare(
          `SELECT id, guest_code, full_name, full_name_ru, passport_no, citizenship, company_or_org, assigned_region, assigned_project, status, linked_sicil_no
           FROM travel_guests
           WHERE guest_code LIKE ? OR full_name LIKE ? OR full_name_ru LIKE ? OR passport_no LIKE ?
           ORDER BY id DESC
           LIMIT 12`
        )
        .all(like, like, like, like);

      return NextResponse.json({ success: true, employees, guests });
    }

    const tickets = db
      .prepare(
        `SELECT t.*,
                g.guest_code,
                g.company_or_org AS guest_org,
                p.ad_soyad AS emp_name,
                p.gorevi AS emp_role,
                p.departman AS emp_dept
         FROM travel_tickets t
         LEFT JOIN travel_guests g ON t.guest_id = g.id
         LEFT JOIN personnel p ON t.sicil_no != '' AND t.sicil_no = p.sicil_no
         ORDER BY t.id DESC
         LIMIT 500`
      )
      .all() as Array<Record<string, any>>;

    const guests = db
      .prepare(
        `SELECT g.*,
                (SELECT COUNT(*) FROM travel_tickets tt WHERE tt.guest_id = g.id) AS ticket_count
         FROM travel_guests g
         ORDER BY g.id DESC
         LIMIT 300`
      )
      .all() as Array<Record<string, any>>;

    const regionsRows = db
      .prepare(
        `SELECT DISTINCT region FROM personnel WHERE region IS NOT NULL AND region != '' ORDER BY region ASC`
      )
      .all() as Array<{ region: string }>;

    const projectsRows = db
      .prepare(
        `SELECT DISTINCT proje_adi FROM personnel WHERE proje_adi IS NOT NULL AND proje_adi != '' ORDER BY proje_adi ASC`
      )
      .all() as Array<{ proje_adi: string }>;

    const aiSettings = getAiProviderSettings();

    let totalRub = 0;
    let flightCount = 0;
    let trainCount = 0;
    let employeeTickets = 0;
    let guestTickets = 0;

    for (const t of tickets) {
      if (t.transport_type === 'train') trainCount++;
      else flightCount++;

      if (t.person_type === 'guest') guestTickets++;
      else employeeTickets++;

      const price = Number(t.ticket_price || 0);
      const curr = String(t.currency || 'RUB').toUpperCase();
      if (curr === 'RUB') totalRub += price;
      else if (curr === 'USD') totalRub += price * 92;
      else if (curr === 'EUR') totalRub += price * 100;
      else if (curr === 'TRY') totalRub += price * 2.7;
    }

    return NextResponse.json({
      success: true,
      tickets,
      guests,
      regions: regionsRows.map((r) => r.region),
      projects: projectsRows.map((p) => p.proje_adi),
      stats: {
        totalTickets: tickets.length,
        flightCount,
        trainCount,
        employeeTickets,
        guestTickets,
        activeGuestsCount: guests.filter((g) => !g.linked_sicil_no).length,
        estimatedTotalRub: Math.round(totalRub),
      },
      aiStatus: {
        activeProvider: aiSettings.active_provider,
        fallbackProvider: aiSettings.fallback_provider,
        deepseekModel: aiSettings.deepseek_model,
        isActiveProviderReady: hasProviderCredentials(aiSettings.active_provider, aiSettings),
        readiness: {
          deepseek: hasProviderCredentials('deepseek', aiSettings),
          deepseek_ocr: hasProviderCredentials('deepseek_ocr', aiSettings),
          yandex: hasProviderCredentials('yandex', aiSettings),
          gigachat: hasProviderCredentials('gigachat', aiSettings),
          gemini: hasProviderCredentials('gemini', aiSettings),
          openrouter: hasProviderCredentials('openrouter', aiSettings),
          ru_docs_ocr: hasProviderCredentials('ru_docs_ocr', aiSettings),
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Bilet kayıtları yüklenemedi.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Gözlemci (Viewer) rolü kayıt değiştiremez.' },
        { status: 403 }
      );
    }

    const db = ensureAiTicketTables();
    const body = await request.json();
    const action = body?.action;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (action === 'create_guest') {
      const g = body?.guest || {};
      const fullName = String(g.fullName || '').trim().toUpperCase();
      if (!fullName) {
        return NextResponse.json(
          { success: false, message: 'Misafir ad-soyad alanı zorunludur.' },
          { status: 400 }
        );
      }
      const cleanPasp = cleanTicketPassportNumber(g.passportNo || '');
      if (cleanPasp.length >= 6) {
        const existing = db
          .prepare('SELECT * FROM travel_guests WHERE passport_no = ? LIMIT 1')
          .get(cleanPasp) as Record<string, any> | undefined;
        if (existing) {
          return NextResponse.json({
            success: true,
            guest: existing,
            message: `Bu pasaport numarasıyla kayıtlı misafir bulundu (${existing.guest_code}).`,
          });
        }
      }

      const guestCode = generateNextGuestCode();
      const info = db
        .prepare(
          `INSERT INTO travel_guests (
            guest_code, full_name, full_name_ru, passport_no, citizenship,
            company_or_org, assigned_region, assigned_project, phone, notes, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
        )
        .run(
          guestCode,
          fullName,
          String(g.fullNameRu || '').trim(),
          cleanPasp || String(g.passportNo || '').trim(),
          String(g.citizenship || '').trim().toUpperCase(),
          String(g.companyOrOrg || 'Misafir / Dış Katılımcı').trim(),
          String(g.assignedRegion || '').trim(),
          String(g.assignedProject || '').trim(),
          String(g.phone || '').trim(),
          String(g.notes || '').trim(),
          nowStr
        );

      const created = db
        .prepare('SELECT * FROM travel_guests WHERE id = ?')
        .get(Number(info.lastInsertRowid));

      return NextResponse.json({
        success: true,
        guest: created,
        message: `Yeni misafir (Guest) kaydı oluşturuldu: ${guestCode}`,
      });
    }

    if (action === 'import_tickets') {
      const items: Array<Record<string, any>> = Array.isArray(body?.tickets) ? body.tickets : [];
      if (items.length === 0) {
        return NextResponse.json(
          { success: false, message: 'İçe aktarılacak bilet seçilmedi.' },
          { status: 400 }
        );
      }

      const insertTicketStmt = db.prepare(`
        INSERT INTO travel_tickets (
          ticket_code, transport_type, person_type, sicil_no, guest_id,
          passenger_name, passport_no, citizenship, carrier, flight_or_train_no,
          booking_ref, ticket_number, departure_city, arrival_city,
          departure_station_or_airport, arrival_station_or_airport,
          departure_date, arrival_or_return_date, seat_or_wagon, ticket_class,
          ticket_price, currency, region, project_name, ai_provider_used,
          match_confidence, source_filename, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'confirmed', ?
        )
      `);

      let importedCount = 0;
      let createdGuestCount = 0;

      for (const item of items) {
        const transportType = item.transportType === 'train' ? 'train' : 'flight';
        let personType: 'employee' | 'guest' =
          item.personType === 'employee' && item.sicilNo ? 'employee' : 'guest';
        const sicilNo = personType === 'employee' ? String(item.sicilNo || '').trim() : '';
        let guestId: number | null = item.guestId ? Number(item.guestId) : null;

        const cleanPasp = cleanTicketPassportNumber(item.passportNumber || '');
        const passengerName = String(item.passengerName || 'İSİMSİZ YOLCU')
          .trim()
          .toUpperCase();

        // If passenger is not matched to an employee, automatically link or create a Travel Guest (Powerise workflow)
        if (personType === 'guest' && !guestId) {
          let foundGuest: { id: number } | undefined;
          if (cleanPasp.length >= 6) {
            foundGuest = db
              .prepare('SELECT id FROM travel_guests WHERE passport_no = ? LIMIT 1')
              .get(cleanPasp) as { id: number } | undefined;
          }
          if (!foundGuest && passengerName) {
            foundGuest = db
              .prepare('SELECT id FROM travel_guests WHERE UPPER(full_name) = ? LIMIT 1')
              .get(passengerName) as { id: number } | undefined;
          }

          if (foundGuest) {
            guestId = foundGuest.id;
          } else {
            const gCode = generateNextGuestCode();
            const gRes = db
              .prepare(
                `INSERT INTO travel_guests (
                  guest_code, full_name, full_name_ru, passport_no, citizenship,
                  company_or_org, assigned_region, assigned_project, notes, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
              )
              .run(
                gCode,
                passengerName,
                String(item.passengerNameCyrillic || '').trim(),
                cleanPasp,
                String(item.citizenship || '').trim().toUpperCase(),
                String(item.guestOrg || 'Misafir / Aday Personel').trim(),
                String(item.region || '').trim(),
                String(item.projectName || '').trim(),
                `AI Bilet Okuma ile otomatik takibe alındı (${item.sourceFilename || 'Bilet'})`,
                nowStr
              );
            guestId = Number(gRes.lastInsertRowid);
            createdGuestCount++;
          }
        }

        const prefix = transportType === 'train' ? 'RZD' : 'AIR';
        const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
        const ticketCode = `${prefix}-${new Date().getFullYear()}-${randSuffix}`;

        insertTicketStmt.run(
          ticketCode,
          transportType,
          personType,
          sicilNo,
          guestId,
          passengerName,
          cleanPasp || String(item.passportNumber || '').trim(),
          String(item.citizenship || '').trim().toUpperCase(),
          String(item.carrier || '').trim(),
          String(item.flightOrTrainNumber || '').trim(),
          String(item.bookingReference || '').trim(),
          String(item.ticketNumber || '').trim(),
          String(item.departureCity || '').trim(),
          String(item.arrivalCity || '').trim(),
          String(item.departureAirportOrStation || '').trim(),
          String(item.arrivalAirportOrStation || '').trim(),
          String(item.departureDate || '').trim(),
          String(item.returnOrArrivalDate || '').trim(),
          String(item.seatOrWagon || '').trim(),
          String(item.ticketClass || 'economy').trim(),
          Number(item.ticketPrice || 0) || 0,
          String(item.currency || 'RUB').trim().toUpperCase(),
          String(item.region || '').trim(),
          String(item.projectName || '').trim(),
          String(item.providerUsed || 'DeepSeek AI').trim(),
          Number(item.confidence || 0) || 0,
          String(item.sourceFilename || '').trim(),
          nowStr
        );
        importedCount++;
      }

      return NextResponse.json({
        success: true,
        importedCount,
        createdGuestCount,
        message:
          createdGuestCount > 0
            ? `${importedCount} bilet kaydedildi (${createdGuestCount} çalışan dışı yolcu otomatik olarak Misafir/Guest takibine alındı).`
            : `${importedCount} bilet başarıyla sisteme kaydedildi.`,
      });
    }

    if (action === 'convert_guest_to_employee') {
      const guestId = Number(body?.guestId || 0);
      const sicilNo = String(body?.sicilNo || '').trim();
      if (!guestId || !sicilNo) {
        return NextResponse.json(
          { success: false, message: 'Misafir ID ve Personel Sicil No gereklidir.' },
          { status: 400 }
        );
      }

      const emp = db
        .prepare(
          'SELECT sicil_no, ad_soyad, region, proje_adi FROM personnel WHERE sicil_no = ? LIMIT 1'
        )
        .get(sicilNo) as
        | { sicil_no: string; ad_soyad: string; region: string; proje_adi: string }
        | undefined;

      if (!emp) {
        return NextResponse.json(
          { success: false, message: `Sicil No (${sicilNo}) personel listesinde bulunamadı.` },
          { status: 404 }
        );
      }

      db.prepare(
        `UPDATE travel_guests SET linked_sicil_no = ?, status = 'converted', assigned_region = COALESCE(NULLIF(assigned_region, ''), ?), assigned_project = COALESCE(NULLIF(assigned_project, ''), ?) WHERE id = ?`
      ).run(emp.sicil_no, emp.region || '', emp.proje_adi || '', guestId);

      db.prepare(
        `UPDATE travel_tickets SET person_type = 'employee', sicil_no = ?, region = CASE WHEN region = '' THEN ? ELSE region END, project_name = CASE WHEN project_name = '' THEN ? ELSE project_name END WHERE guest_id = ?`
      ).run(emp.sicil_no, emp.region || '', emp.proje_adi || '', guestId);

      return NextResponse.json({
        success: true,
        message: `Misafir kaydı ve tüm geçmiş biletleri ${emp.ad_soyad} (${emp.sicil_no}) siciline bağlandı.`,
      });
    }

    if (action === 'relink_ticket') {
      const ticketId = Number(body?.ticketId || 0);
      const personType = body?.personType === 'employee' ? 'employee' : 'guest';
      if (!ticketId) {
        return NextResponse.json({ success: false, message: 'Bilet ID eksik.' }, { status: 400 });
      }

      if (personType === 'employee') {
        const sicilNo = String(body?.sicilNo || '').trim();
        const emp = db
          .prepare('SELECT sicil_no, region, proje_adi FROM personnel WHERE sicil_no = ? LIMIT 1')
          .get(sicilNo) as { sicil_no: string; region: string; proje_adi: string } | undefined;
        if (!emp) {
          return NextResponse.json(
            { success: false, message: 'Seçilen personel bulunamadı.' },
            { status: 404 }
          );
        }
        db.prepare(
          `UPDATE travel_tickets SET person_type = 'employee', sicil_no = ?, guest_id = NULL, region = ?, project_name = ?, match_confidence = 100 WHERE id = ?`
        ).run(emp.sicil_no, emp.region || '', emp.proje_adi || '', ticketId);
      } else {
        const guestId = Number(body?.guestId || 0);
        if (!guestId) {
          return NextResponse.json(
            { success: false, message: 'Misafir seçilmedi.' },
            { status: 400 }
          );
        }
        db.prepare(
          `UPDATE travel_tickets SET person_type = 'guest', sicil_no = '', guest_id = ?, match_confidence = 100 WHERE id = ?`
        ).run(guestId, ticketId);
      }

      return NextResponse.json({
        success: true,
        message: 'Bilet yolcu bağlantısı güncellendi.',
      });
    }

    if (action === 'delete_ticket') {
      const ticketId = Number(body?.ticketId || 0);
      if (ticketId > 0) {
        db.prepare('DELETE FROM travel_tickets WHERE id = ?').run(ticketId);
      }
      return NextResponse.json({ success: true, message: 'Bilet kaydı silindi.' });
    }

    return NextResponse.json({ success: false, message: 'Geçersiz işlem.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'İşlem sırasında hata oluştu.' },
      { status: 500 }
    );
  }
}

