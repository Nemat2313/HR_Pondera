import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  cleanTicketPassportNumber,
  ensureAiTicketTables,
  generateNextGuestCode,
  getAiProviderSettings,
  hasProviderCredentials,
  searchPonderaPeople35k,
} from '@/lib/aiTicketEngine';
import { EFFECTIVE_REGION_SQL, resolveEffectiveRegion } from '@/lib/regionSiteHelper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatNowRuStyle(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export async function GET(request: Request) {
  try {
    const db = ensureAiTicketTables();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';

    // Full 35k+ Pondera Employee (Mevcut + Bekleniyor + Sevke Hazır + Çıkışlı) & Guest search
    if (action === 'search_people') {
      const q = (searchParams.get('q') || '').trim();
      if (q.length < 2) {
        return NextResponse.json({ success: true, employees: [], guests: [] });
      }
      const employees = searchPonderaPeople35k(q, 30);
      const like = `%${q}%`;
      const guests = db
        .prepare(
          `SELECT id, guest_code, full_name, full_name_ru, passport_no, citizenship, company_or_org, assigned_region, assigned_project, phone, status, linked_sicil_no
           FROM travel_guests
           WHERE guest_code LIKE ? OR full_name LIKE ? OR full_name_ru LIKE ? OR passport_no LIKE ?
           ORDER BY id DESC
           LIMIT 12`
        )
        .all(like, like, like, like);

      return NextResponse.json({ success: true, employees, guests });
    }

    const rawTickets = db
      .prepare(
        `SELECT t.*,
                g.guest_code,
                g.company_or_org AS guest_org,
                g.phone AS guest_phone,
                p.ad_soyad AS emp_name,
                p.tam_adi_kiril AS emp_name_ru,
                p.gorevi AS emp_role,
                p.departman AS emp_dept,
                p.telefon_no AS emp_phone,
                p.firma AS emp_firma,
                p.region AS emp_region,
                p.proje_adi AS emp_project,
                p.genel_durum AS emp_status
         FROM travel_tickets t
         LEFT JOIN travel_guests g ON t.guest_id = g.id
         LEFT JOIN (
           SELECT sicil_no, MAX(id) AS max_id
           FROM personnel
           WHERE sicil_no IS NOT NULL AND sicil_no != ''
           GROUP BY sicil_no
         ) pm ON t.sicil_no != '' AND t.sicil_no = pm.sicil_no
         LEFT JOIN personnel p ON p.id = pm.max_id
         ORDER BY t.id DESC
         LIMIT 1500`
      )
      .all() as Array<Record<string, any>>;

    const tickets: Array<Record<string, any>> = rawTickets.map((t: any): Record<string, any> => {
      const rawReg = String(t.region || t.emp_region || '').trim();
      const rawProj = String(t.project_name || t.emp_project || '').trim();
      const effectiveReg = rawReg ? resolveEffectiveRegion(rawReg, rawProj) : '';
      const deductVal = String(t.deduct_from_salary || '').trim() === 'Yes' ? 'Yes' : 'No';
      return {
        ...t,
        passenger_name_ru: t.passenger_name_ru || t.emp_name_ru || '',
        contact_phone: t.contact_phone || t.emp_phone || t.guest_phone || '',
        job_title: t.job_title || t.emp_role || '',
        payment_company: t.payment_company || t.emp_firma || 'PONDERA-INDUSTRY',
        region: effectiveReg,
        project_name: rawProj,
        deduct_from_salary: deductVal,
        reception_status: t.reception_status || 'pending',
        reception_driver_note: t.reception_driver_note || '',
      };
    });

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
        `SELECT DISTINCT (${EFFECTIVE_REGION_SQL}) AS region
         FROM personnel
         WHERE region IS NOT NULL AND TRIM(region) != ''
         ORDER BY region ASC`
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
    let busCount = 0;
    let employeeTickets = 0;
    let guestTickets = 0;
    let deductYesCount = 0;

    for (const t of tickets) {
      if (t.transport_type === 'train') trainCount++;
      else if (t.transport_type === 'bus') busCount++;
      else flightCount++;

      if (t.person_type === 'guest') guestTickets++;
      else employeeTickets++;

      if (t.deduct_from_salary === 'Yes') deductYesCount++;

      const price = Number(t.ticket_price || 0);
      const curr = String(t.currency || 'RUB').toUpperCase();
      if (curr === 'RUB') totalRub += price;
      else if (curr === 'USD') totalRub += price * 92;
      else if (curr === 'EUR') totalRub += price * 100;
      else if (curr === 'TRY') totalRub += price * 2.7;
      else if (curr === 'UZS') totalRub += price * 0.0072;
    }

    return NextResponse.json({
      success: true,
      tickets,
      guests,
      regions: regionsRows.map((r) => r.region).filter(Boolean),
      projects: projectsRows.map((p) => p.proje_adi),
      stats: {
        totalTickets: tickets.length,
        flightCount,
        trainCount,
        busCount,
        employeeTickets,
        guestTickets,
        deductYesCount,
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
    const updatedAtDisplay = formatNowRuStyle();
    const actorName = sessionUser?.name || sessionUser?.email || 'Admin';

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
      const rawReg = String(g.assignedRegion || '').trim();
      const rawProj = String(g.assignedProject || '').trim();
      const effReg = rawReg ? resolveEffectiveRegion(rawReg, rawProj) : '';

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
          effReg,
          rawProj,
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

    if (action === 'import_tickets' || action === 'create_manual_ticket') {
      const items: Array<Record<string, any>> =
        action === 'create_manual_ticket'
          ? body?.ticket
            ? [body.ticket]
            : []
          : Array.isArray(body?.tickets)
          ? body.tickets
          : [];

      if (items.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Kaydedilecek bilet bilgisi bulunamadı.' },
          { status: 400 }
        );
      }

      const insertTicketStmt = db.prepare(`
        INSERT INTO travel_tickets (
          ticket_code, eba_doc_id, transport_type, person_type, sicil_no, guest_id,
          passenger_name, passenger_name_ru, passport_no, citizenship,
          flight_purpose, ticket_agent, payment_company,
          carrier, flight_or_train_no, booking_ref, ticket_number,
          departure_city, arrival_city,
          departure_station_or_airport, arrival_station_or_airport,
          departure_date, departure_time, arrival_or_return_date, arrival_date, arrival_time,
          seat_or_wagon, ticket_class, ticket_price, currency,
          doc_status, contact_phone, job_title, region, project_name,
          ticket_status, detail_reason, trip_type, notes,
          updated_by, updated_at, deduct_from_salary,
          reception_status, reception_driver_note,
          ai_provider_used, match_confidence, source_filename, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, 'confirmed', ?
        )
      `);

      let importedCount = 0;
      let createdGuestCount = 0;

      for (const item of items) {
        const transportType: 'flight' | 'train' | 'bus' =
          item.transportType === 'bus'
            ? 'bus'
            : item.transportType === 'train'
            ? 'train'
            : 'flight';
        const sicilNoRaw = String(item.sicilNo ?? item.sicil_no ?? '').trim();
        const personType: 'employee' | 'guest' =
          (item.personType === 'employee' || sicilNoRaw) && sicilNoRaw ? 'employee' : 'guest';
        const sicilNo = personType === 'employee' ? sicilNoRaw : '';
        let guestId: number | null = item.guestId ? Number(item.guestId) : null;

        const cleanPasp = cleanTicketPassportNumber(
          item.passportNumber ?? item.passport_no ?? ''
        );
        const passengerName = String(
          item.passengerName ?? item.passenger_name ?? 'İSİMSİZ YOLCU'
        )
          .trim()
          .toUpperCase();

        const rawReg = String(item.region || '').trim();
        const rawProj = String(item.projectName ?? item.project_name ?? '').trim();
        const effRegion = rawReg ? resolveEffectiveRegion(rawReg, rawProj) : '';

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
                  company_or_org, assigned_region, assigned_project, phone, notes, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
              )
              .run(
                gCode,
                passengerName,
                String(item.passengerNameCyrillic ?? item.passenger_name_ru ?? '').trim(),
                cleanPasp,
                String(item.citizenship || '').trim().toUpperCase(),
                String(item.guestOrg || 'Misafir / Aday Personel').trim(),
                effRegion,
                rawProj,
                String(item.contactPhone ?? item.contact_phone ?? '').trim(),
                action === 'create_manual_ticket'
                  ? 'Manuel bilet girişi ile takibe alındı'
                  : `AI Bilet Okuma ile otomatik takibe alındı (${item.sourceFilename || 'Bilet'})`,
                nowStr
              );
            guestId = Number(gRes.lastInsertRowid);
            createdGuestCount++;
          }
        }

        const prefix =
          transportType === 'bus' ? 'BUS' : transportType === 'train' ? 'RZD' : 'AIR';
        const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
        const ticketCode = `${prefix}-${new Date().getFullYear()}-${randSuffix}`;

        let depDateStr = String(item.departureDate ?? item.departure_date ?? '').trim();
        let depTimeStr = String(item.departureTime ?? item.departure_time ?? '').trim();
        if (!depTimeStr && depDateStr.includes(' ')) {
          const maybeT = depDateStr.split(/\s+/)[1] || '';
          if (/^\d{1,2}:\d{2}/.test(maybeT)) depTimeStr = maybeT.slice(0, 5);
        } else if (depDateStr && depTimeStr && !depDateStr.includes(' ')) {
          depDateStr = `${depDateStr} ${depTimeStr}`;
        }

        const arrDateStr = String(item.arrivalDate ?? item.arrival_date ?? '').trim();
        const arrTimeStr = String(item.arrivalTime ?? item.arrival_time ?? '').trim();
        const arrCombined =
          String(item.returnOrArrivalDate ?? item.arrival_or_return_date ?? '').trim() ||
          [arrDateStr, arrTimeStr].filter(Boolean).join(' ');

        // Personelden Mi Kesilcek? MUST strictly default to 'No' unless explicitly 'Yes'
        const rawDeduct = String(
          item.deductFromSalary ?? item.deduct_from_salary ?? 'No'
        ).trim();
        const deductFromSalary = rawDeduct === 'Yes' ? 'Yes' : 'No';

        insertTicketStmt.run(
          ticketCode,
          String(item.ebaDocId ?? item.eba_doc_id ?? '').trim(),
          transportType,
          personType,
          sicilNo,
          guestId,
          passengerName,
          String(item.passengerNameCyrillic ?? item.passenger_name_ru ?? '').trim(),
          cleanPasp || String(item.passportNumber ?? item.passport_no ?? '').trim(),
          String(item.citizenship || '').trim().toUpperCase(),
          String(item.flightPurpose ?? item.flight_purpose ?? 'Transfer').trim(),
          String(item.ticketAgent ?? item.ticket_agent ?? 'One Two Trip').trim(),
          String(item.paymentCompany ?? item.payment_company ?? 'PONDERA-INDUSTRY').trim(),
          String(item.carrier || item.ticketAgent || '').trim(),
          String(item.flightOrTrainNumber ?? item.flight_or_train_no ?? '').trim(),
          String(item.bookingReference ?? item.booking_ref ?? '').trim(),
          String(item.ticketNumber ?? item.ticket_number ?? '').trim(),
          String(item.departureCity ?? item.departure_city ?? '').trim().toUpperCase(),
          String(item.arrivalCity ?? item.arrival_city ?? '').trim().toUpperCase(),
          String(item.departureAirportOrStation ?? item.departure_station_or_airport ?? '').trim(),
          String(item.arrivalAirportOrStation ?? item.arrival_station_or_airport ?? '').trim(),
          depDateStr,
          depTimeStr,
          arrCombined,
          arrDateStr,
          arrTimeStr,
          String(item.seatOrWagon ?? item.seat_or_wagon ?? '').trim(),
          String(item.ticketClass ?? item.ticket_class ?? 'economy').trim(),
          Number(item.ticketPrice ?? item.ticket_price ?? 0) || 0,
          String(item.currency || 'RUB').trim().toUpperCase(),
          String(item.docStatus ?? item.doc_status ?? 'Uploaded').trim(),
          String(item.contactPhone ?? item.contact_phone ?? '').trim(),
          String(item.jobTitle ?? item.job_title ?? '').trim(),
          effRegion,
          rawProj,
          String(item.ticketStatus ?? item.ticket_status ?? '').trim(),
          String(item.detailReason ?? item.detail_reason ?? '0').trim(),
          String(item.tripType ?? item.trip_type ?? 'One Way').trim(),
          String(item.notes ?? '').trim(),
          actorName,
          updatedAtDisplay,
          deductFromSalary,
          String(item.receptionStatus ?? item.reception_status ?? 'pending').trim(),
          String(item.receptionDriverNote ?? item.reception_driver_note ?? '').trim(),
          String(
            item.providerUsed ??
              (action === 'create_manual_ticket' ? 'Manuel Kayıt' : 'DeepSeek AI')
          ).trim(),
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
            : `${importedCount} bilet başarıyla Pondera tablosuna kaydedildi.`,
      });
    }

    if (action === 'update_ticket') {
      const t = body?.ticket || {};
      const ticketId = Number(t.id || body?.ticketId || 0);
      if (!ticketId) {
        return NextResponse.json({ success: false, message: 'Bilet ID eksik.' }, { status: 400 });
      }

      const rawReg = String(t.region || '').trim();
      const rawProj = String(t.project_name ?? t.projectName ?? '').trim();
      const effRegion = rawReg ? resolveEffectiveRegion(rawReg, rawProj) : '';
      const deduct =
        String(t.deduct_from_salary ?? t.deductFromSalary ?? 'No').trim() === 'Yes'
          ? 'Yes'
          : 'No';
      const depDateOnly = String(t.departure_date ?? t.departureDate ?? '')
        .trim()
        .split(/\s+/)[0];
      const depTime = String(t.departure_time ?? t.departureTime ?? '').trim();
      const depCombined = [depDateOnly, depTime].filter(Boolean).join(' ');
      const arrDate = String(t.arrival_date ?? t.arrivalDate ?? '').trim();
      const arrTime = String(t.arrival_time ?? t.arrivalTime ?? '').trim();
      const arrCombined = [arrDate, arrTime].filter(Boolean).join(' ');

      db.prepare(`
        UPDATE travel_tickets SET
          eba_doc_id = ?,
          sicil_no = ?,
          person_type = ?,
          passenger_name = ?,
          passenger_name_ru = ?,
          passport_no = ?,
          citizenship = ?,
          flight_purpose = ?,
          ticket_agent = ?,
          payment_company = ?,
          transport_type = ?,
          carrier = ?,
          flight_or_train_no = ?,
          booking_ref = ?,
          ticket_number = ?,
          departure_date = ?,
          departure_time = ?,
          departure_city = ?,
          arrival_or_return_date = ?,
          arrival_date = ?,
          arrival_time = ?,
          arrival_city = ?,
          ticket_price = ?,
          currency = ?,
          doc_status = ?,
          contact_phone = ?,
          job_title = ?,
          region = ?,
          project_name = ?,
          ticket_status = ?,
          detail_reason = ?,
          trip_type = ?,
          notes = ?,
          updated_by = ?,
          updated_at = ?,
          deduct_from_salary = ?,
          reception_status = ?,
          reception_driver_note = ?
        WHERE id = ?
      `).run(
        String(t.eba_doc_id ?? '').trim(),
        String(t.sicil_no ?? '').trim(),
        String(t.sicil_no ?? '').trim() ? 'employee' : t.person_type === 'employee' ? 'employee' : 'guest',
        String(t.passenger_name ?? '').trim().toUpperCase(),
        String(t.passenger_name_ru ?? '').trim(),
        cleanTicketPassportNumber(t.passport_no || '') || String(t.passport_no || '').trim(),
        String(t.citizenship ?? '').trim().toUpperCase(),
        String(t.flight_purpose ?? 'Transfer').trim(),
        String(t.ticket_agent ?? 'One Two Trip').trim(),
        String(t.payment_company ?? 'PONDERA-INDUSTRY').trim(),
        t.transport_type === 'bus' ? 'bus' : t.transport_type === 'train' ? 'train' : 'flight',
        String(t.carrier ?? '').trim(),
        String(t.flight_or_train_no ?? '').trim(),
        String(t.booking_ref ?? '').trim(),
        String(t.ticket_number ?? '').trim(),
        depCombined,
        depTime,
        String(t.departure_city ?? '').trim().toUpperCase(),
        arrCombined,
        arrDate,
        arrTime,
        String(t.arrival_city ?? '').trim().toUpperCase(),
        Number(t.ticket_price || 0) || 0,
        String(t.currency || 'RUB').trim().toUpperCase(),
        String(t.doc_status ?? 'Uploaded').trim(),
        String(t.contact_phone ?? '').trim(),
        String(t.job_title ?? '').trim(),
        effRegion,
        rawProj,
        String(t.ticket_status ?? '').trim(),
        String(t.detail_reason ?? '0').trim(),
        String(t.trip_type ?? 'One Way').trim(),
        String(t.notes ?? '').trim(),
        actorName,
        updatedAtDisplay,
        deduct,
        String(t.reception_status || 'pending').trim(),
        String(t.reception_driver_note || '').trim(),
        ticketId
      );

      return NextResponse.json({
        success: true,
        message: 'Bilet kaydı başarıyla güncellendi.',
      });
    }

    if (action === 'update_reception') {
      const ticketId = Number(body?.ticketId || 0);
      if (!ticketId) {
        return NextResponse.json({ success: false, message: 'Bilet ID eksik.' }, { status: 400 });
      }
      const recStatus = ['pending', 'assigned', 'welcomed'].includes(body?.receptionStatus)
        ? body.receptionStatus
        : 'pending';
      const driverNote =
        body?.receptionDriverNote !== undefined
          ? String(body.receptionDriverNote).trim()
          : undefined;
      const contactPhone =
        body?.contactPhone !== undefined ? String(body.contactPhone).trim() : undefined;

      if (driverNote !== undefined && contactPhone !== undefined) {
        db.prepare(
          `UPDATE travel_tickets
           SET reception_status = ?, reception_driver_note = ?, contact_phone = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`
        ).run(recStatus, driverNote, contactPhone, actorName, updatedAtDisplay, ticketId);
      } else if (driverNote !== undefined) {
        db.prepare(
          `UPDATE travel_tickets
           SET reception_status = ?, reception_driver_note = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`
        ).run(recStatus, driverNote, actorName, updatedAtDisplay, ticketId);
      } else {
        db.prepare(
          `UPDATE travel_tickets
           SET reception_status = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`
        ).run(recStatus, actorName, updatedAtDisplay, ticketId);
      }

      return NextResponse.json({
        success: true,
        message: 'Karşılama panosu durumu güncellendi.',
      });
    }

    if (action === 'toggle_deduct') {
      const ticketId = Number(body?.ticketId || 0);
      const nextVal = String(body?.deductFromSalary || 'No').trim() === 'Yes' ? 'Yes' : 'No';
      if (!ticketId) {
        return NextResponse.json({ success: false, message: 'Bilet ID eksik.' }, { status: 400 });
      }
      db.prepare(
        `UPDATE travel_tickets SET deduct_from_salary = ?, updated_by = ?, updated_at = ? WHERE id = ?`
      ).run(nextVal, actorName, updatedAtDisplay, ticketId);
      return NextResponse.json({
        success: true,
        deduct_from_salary: nextVal,
        message: `Personelden kesinti durumu "${nextVal}" olarak güncellendi.`,
      });
    }

    if (action === 'import_excel_rows') {
      const rows: Array<Record<string, any>> = Array.isArray(body?.rows) ? body.rows : [];
      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Excel dosyasından aktarılacak satır bulunamadı.' },
          { status: 400 }
        );
      }

      const findByEba = db.prepare('SELECT id FROM travel_tickets WHERE eba_doc_id = ? LIMIT 1');
      const findEmp = db.prepare(
        `SELECT sicil_no, pasaport_no, gorevi, telefon_no, region, proje_adi, tam_adi_kiril
         FROM personnel WHERE sicil_no = ? LIMIT 1`
      );
      const insertStmt = db.prepare(`
        INSERT INTO travel_tickets (
          ticket_code, eba_doc_id, transport_type, person_type, sicil_no, guest_id,
          passenger_name, passenger_name_ru, passport_no, citizenship,
          flight_purpose, ticket_agent, payment_company,
          carrier, flight_or_train_no, booking_ref, ticket_number,
          departure_city, arrival_city, departure_date, departure_time,
          arrival_or_return_date, arrival_date, arrival_time,
          ticket_price, currency, doc_status, contact_phone, job_title,
          region, project_name, ticket_status, detail_reason, trip_type,
          notes, updated_by, updated_at, deduct_from_salary,
          reception_status, reception_driver_note, ai_provider_used,
          match_confidence, source_filename, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, NULL,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, '', '', '',
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          'pending', '', 'Excel Toplu Liste',
          100, ?, 'confirmed', ?
        )
      `);
      const updateExistingStmt = db.prepare(`
        UPDATE travel_tickets SET
          sicil_no = ?, passenger_name = ?, passenger_name_ru = ?, citizenship = ?,
          flight_purpose = ?, ticket_agent = ?, payment_company = ?, transport_type = ?,
          departure_city = ?, arrival_city = ?, departure_date = ?, departure_time = ?,
          arrival_or_return_date = ?, arrival_date = ?, arrival_time = ?,
          ticket_price = ?, currency = ?, doc_status = ?, contact_phone = ?, job_title = ?,
          region = ?, project_name = ?, ticket_status = ?, detail_reason = ?, trip_type = ?,
          notes = ?, updated_by = ?, updated_at = ?, deduct_from_salary = ?
        WHERE id = ?
      `);

      let inserted = 0;
      let updated = 0;
      const srcFile = String(body?.sourceFilename || 'bilet alinan toplu liste.xlsx').trim();

      for (const r of rows) {
        const pName = String(r.passenger_name || '').trim().toUpperCase();
        if (!pName) continue;

        const ebaId = String(r.eba_doc_id || '').trim();
        const sicil = String(r.sicil_no || '').trim();
        const emp = sicil
          ? (findEmp.get(sicil) as Record<string, any> | undefined)
          : undefined;
        const pType = sicil ? 'employee' : 'guest';
        const rawReg = String(r.region || emp?.region || '').trim();
        const rawProj = String(r.project_name || emp?.proje_adi || '').trim();
        const effRegion = rawReg ? resolveEffectiveRegion(rawReg, rawProj) : '';
        const deduct = String(r.deduct_from_salary || 'No').trim() === 'Yes' ? 'Yes' : 'No';
        const tType: 'flight' | 'train' | 'bus' =
          r.transport_type === 'bus'
            ? 'bus'
            : r.transport_type === 'train'
            ? 'train'
            : 'flight';
        const depDatePart = String(r.departure_date || '').trim();
        const depTimePart = String(r.departure_time || '').trim();
        const depCombined =
          depDatePart && depTimePart && !depDatePart.includes(' ')
            ? `${depDatePart} ${depTimePart}`
            : depDatePart;
        const arrDatePart = String(r.arrival_date || '').trim();
        const arrTimePart = String(r.arrival_time || '').trim();
        const arrCombined = [arrDatePart, arrTimePart].filter(Boolean).join(' ');

        const existingRow = ebaId
          ? (findByEba.get(ebaId) as { id: number } | undefined)
          : undefined;

        if (existingRow) {
          updateExistingStmt.run(
            sicil,
            pName,
            String(r.passenger_name_ru || emp?.tam_adi_kiril || '').trim(),
            String(r.citizenship || '').trim().toUpperCase(),
            String(r.flight_purpose || 'Transfer').trim(),
            String(r.ticket_agent || 'One Two Trip').trim(),
            String(r.payment_company || 'PONDERA-INDUSTRY').trim(),
            tType,
            String(r.departure_city || '').trim().toUpperCase(),
            String(r.arrival_city || '').trim().toUpperCase(),
            depCombined,
            depTimePart,
            arrCombined,
            arrDatePart,
            arrTimePart,
            Number(r.ticket_price || 0) || 0,
            String(r.currency || 'RUB').trim().toUpperCase(),
            String(r.doc_status || 'Uploaded').trim(),
            String(r.contact_phone || emp?.telefon_no || '').trim(),
            String(r.job_title || emp?.gorevi || '').trim(),
            effRegion,
            rawProj,
            String(r.ticket_status || '').trim(),
            String(r.detail_reason || '0').trim(),
            String(r.trip_type || 'One Way').trim(),
            String(r.notes || '').trim(),
            String(r.updated_by || actorName).trim(),
            String(r.updated_at || updatedAtDisplay).trim(),
            deduct,
            existingRow.id
          );
          updated++;
        } else {
          const codePrefix =
            tType === 'bus' ? 'BUS' : tType === 'train' ? 'RZD' : 'EBA';
          const tCode = ebaId
            ? `${codePrefix}-${ebaId}`
            : `${codePrefix}-${Math.floor(10000 + Math.random() * 89999)}`;
          insertStmt.run(
            tCode,
            ebaId,
            tType,
            pType,
            sicil,
            pName,
            String(r.passenger_name_ru || emp?.tam_adi_kiril || '').trim(),
            String(emp?.pasaport_no || '').trim(),
            String(r.citizenship || '').trim().toUpperCase(),
            String(r.flight_purpose || 'Transfer').trim(),
            String(r.ticket_agent || 'One Two Trip').trim(),
            String(r.payment_company || 'PONDERA-INDUSTRY').trim(),
            String(r.ticket_agent || 'One Two Trip').trim(),
            String(r.departure_city || '').trim().toUpperCase(),
            String(r.arrival_city || '').trim().toUpperCase(),
            depCombined,
            depTimePart,
            arrCombined,
            arrDatePart,
            arrTimePart,
            Number(r.ticket_price || 0) || 0,
            String(r.currency || 'RUB').trim().toUpperCase(),
            String(r.doc_status || 'Uploaded').trim(),
            String(r.contact_phone || emp?.telefon_no || '').trim(),
            String(r.job_title || emp?.gorevi || '').trim(),
            effRegion,
            rawProj,
            String(r.ticket_status || '').trim(),
            String(r.detail_reason || '0').trim(),
            String(r.trip_type || 'One Way').trim(),
            String(r.notes || '').trim(),
            String(r.updated_by || actorName).trim(),
            String(r.updated_at || updatedAtDisplay).trim(),
            deduct,
            srcFile,
            nowStr
          );
          inserted++;
        }
      }

      return NextResponse.json({
        success: true,
        inserted,
        updated,
        message: `Excel toplu bilet listesi aktarıldı: ${inserted} yeni kayıt eklendi, ${updated} kayıt güncellendi.`,
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
          `SELECT sicil_no, ad_soyad, tam_adi_kiril, gorevi, telefon_no, region, proje_adi
           FROM personnel
           WHERE sicil_no = ?
           ORDER BY CASE
             WHEN LOWER(COALESCE(genel_durum, '')) LIKE '%mevcut%' THEN 0
             WHEN LOWER(COALESCE(genel_durum, '')) LIKE '%bekleniyor%' OR LOWER(COALESCE(genel_durum, '')) LIKE '%sevke%' THEN 1
             ELSE 2
           END, id DESC
           LIMIT 1`
        )
        .get(sicilNo) as Record<string, any> | undefined;

      if (!emp) {
        return NextResponse.json(
          { success: false, message: `Sicil No (${sicilNo}) personel listesinde bulunamadı.` },
          { status: 404 }
        );
      }

      const effReg = emp.region ? resolveEffectiveRegion(emp.region, emp.proje_adi) : '';

      db.prepare(
        `UPDATE travel_guests SET linked_sicil_no = ?, status = 'converted', assigned_region = COALESCE(NULLIF(assigned_region, ''), ?), assigned_project = COALESCE(NULLIF(assigned_project, ''), ?) WHERE id = ?`
      ).run(emp.sicil_no, effReg, emp.proje_adi || '', guestId);

      db.prepare(
        `UPDATE travel_tickets
         SET person_type = 'employee',
             sicil_no = ?,
             passenger_name_ru = CASE WHEN passenger_name_ru = '' THEN ? ELSE passenger_name_ru END,
             job_title = CASE WHEN job_title = '' THEN ? ELSE job_title END,
             contact_phone = CASE WHEN contact_phone = '' THEN ? ELSE contact_phone END,
             region = CASE WHEN region = '' THEN ? ELSE region END,
             project_name = CASE WHEN project_name = '' THEN ? ELSE project_name END,
             updated_by = ?,
             updated_at = ?
         WHERE guest_id = ?`
      ).run(
        emp.sicil_no,
        emp.tam_adi_kiril || '',
        emp.gorevi || '',
        emp.telefon_no || '',
        effReg,
        emp.proje_adi || '',
        actorName,
        updatedAtDisplay,
        guestId
      );

      return NextResponse.json({
        success: true,
        message: `Misafir kaydı ve tüm biletleri ${emp.ad_soyad} (${emp.sicil_no}) siciline bağlandı.`,
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
          .prepare(
            `SELECT sicil_no, tam_adi_kiril, gorevi, telefon_no, region, proje_adi
             FROM personnel
             WHERE sicil_no = ?
             ORDER BY CASE
               WHEN LOWER(COALESCE(genel_durum, '')) LIKE '%mevcut%' THEN 0
               WHEN LOWER(COALESCE(genel_durum, '')) LIKE '%bekleniyor%' OR LOWER(COALESCE(genel_durum, '')) LIKE '%sevke%' THEN 1
               ELSE 2
             END, id DESC
             LIMIT 1`
          )
          .get(sicilNo) as Record<string, any> | undefined;
        if (!emp) {
          return NextResponse.json(
            { success: false, message: 'Seçilen personel bulunamadı.' },
            { status: 404 }
          );
        }
        const effReg = emp.region ? resolveEffectiveRegion(emp.region, emp.proje_adi) : '';
        db.prepare(
          `UPDATE travel_tickets
           SET person_type = 'employee',
               sicil_no = ?,
               guest_id = NULL,
               passenger_name_ru = COALESCE(NULLIF(passenger_name_ru, ''), ?),
               job_title = COALESCE(NULLIF(job_title, ''), ?),
               contact_phone = COALESCE(NULLIF(contact_phone, ''), ?),
               region = ?,
               project_name = ?,
               match_confidence = 100,
               updated_by = ?,
               updated_at = ?
           WHERE id = ?`
        ).run(
          emp.sicil_no,
          emp.tam_adi_kiril || '',
          emp.gorevi || '',
          emp.telefon_no || '',
          effReg,
          emp.proje_adi || '',
          actorName,
          updatedAtDisplay,
          ticketId
        );
      } else {
        const guestId = Number(body?.guestId || 0);
        if (!guestId) {
          return NextResponse.json(
            { success: false, message: 'Misafir seçilmedi.' },
            { status: 400 }
          );
        }
        db.prepare(
          `UPDATE travel_tickets SET person_type = 'guest', sicil_no = '', guest_id = ?, match_confidence = 100, updated_by = ?, updated_at = ? WHERE id = ?`
        ).run(guestId, actorName, updatedAtDisplay, ticketId);
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
