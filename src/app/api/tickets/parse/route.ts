import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  AiProviderId,
  cleanTicketPassportNumber,
  containsCyrillic,
  extractPassportFallbackFromText,
  matchPassengersAgainstPondera,
  parseTicketDocument,
  transliterateToLatinUpper,
} from '@/lib/aiTicketEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role === 'viewer') {
      return NextResponse.json(
        { success: false, message: 'Gözlemci (Viewer) rolü bilet okuma işlemi başlatamaz.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const fileName = String(body?.fileName || 'ticket.pdf');
    const mimeType = String(body?.mimeType || 'image/jpeg');
    const primaryImageDataUrl = body?.primaryImageDataUrl
      ? String(body.primaryImageDataUrl)
      : undefined;
    const extraPageDataUrls = Array.isArray(body?.extraPageDataUrls)
      ? body.extraPageDataUrls.map(String)
      : [];
    const rawFileBase64 = body?.rawFileBase64 ? String(body.rawFileBase64) : undefined;
    const extractedPdfText = body?.extractedPdfText ? String(body.extractedPdfText) : '';
    const providerOverride = body?.providerOverride
      ? (String(body.providerOverride) as AiProviderId)
      : undefined;

    if (!primaryImageDataUrl && !rawFileBase64 && !extractedPdfText.trim()) {
      return NextResponse.json(
        { success: false, message: 'Bilet görseli veya PDF içeriği gönderilmedi.' },
        { status: 400 }
      );
    }

    const { parsed, providerLabel } = await parseTicketDocument({
      fileName,
      mimeType,
      primaryImageDataUrl,
      extraPageDataUrls,
      rawFileBase64,
      extractedPdfText,
      providerOverride,
    });

    // Normalize single vs multi-passenger structure (mirroring Powerise BulkTicketUpload)
    const rawPassengers: Array<Record<string, any>> =
      Array.isArray(parsed.passengers) && parsed.passengers.length > 0
        ? parsed.passengers
        : [
            {
              passengerName:
                parsed.passengerName ||
                parsed.passenger_name ||
                parsed.fullName ||
                'BİLİNMEYEN YOLCU',
              passengerNameCyrillic: parsed.passengerNameCyrillic || '',
              passportNumber:
                parsed.passportNumber || parsed.passport_number || parsed.documentNumber || '',
              ticketNumber: parsed.ticketNumber || parsed.ticket_number || '',
              seatOrWagon: parsed.seatOrWagon || '',
              citizenship: parsed.citizenship || '',
            },
          ];

    const normalizedPassengers = rawPassengers.map((rp) => {
      const rawName = String(rp.passengerName || rp.passenger_name || '').trim();
      const rawCyr = String(rp.passengerNameCyrillic || '').trim();
      let displayLatin = rawName;
      let displayCyr = rawCyr;

      if (containsCyrillic(rawName) && !rawCyr) {
        displayCyr = rawName;
        displayLatin = transliterateToLatinUpper(rawName);
      } else if (displayLatin) {
        displayLatin = transliterateToLatinUpper(displayLatin);
      }

      const fallbackPasp =
        rawPassengers.length === 1 ? extractPassportFallbackFromText(extractedPdfText) : '';
      const cleanedPasp =
        cleanTicketPassportNumber(
          rp.passportNumber || rp.passport_number || rp.documentNumber || ''
        ) || fallbackPasp;

      return {
        passengerName: displayLatin || displayCyr || 'İSİMSİZ YOLCU',
        passengerNameCyrillic: displayCyr,
        passportNumber: cleanedPasp,
        ticketNumber: String(rp.ticketNumber || rp.ticket_number || parsed.ticketNumber || '').trim(),
        seatOrWagon: String(rp.seatOrWagon || parsed.seatOrWagon || '').trim(),
        citizenship: String(rp.citizenship || '').trim().toUpperCase(),
      };
    });

    const matches = matchPassengersAgainstPondera(
      normalizedPassengers.map((np) => ({
        passengerName: np.passengerName || np.passengerNameCyrillic,
        passportNumber: np.passportNumber,
      }))
    );

    const paxCount = Math.max(1, normalizedPassengers.length);
    const totalPriceNum =
      Number(parsed.totalPrice ?? parsed.ticketPrice ?? 0) || 0;
    const explicitPerPax = Number(parsed.pricePerPassenger ?? 0) || 0;
    const perPassengerPrice =
      explicitPerPax > 0
        ? explicitPerPax
        : totalPriceNum > 0
        ? Math.round((totalPriceNum / paxCount) * 100) / 100
        : 0;

    const rawTransport = String(parsed.transportType || '').toLowerCase();
    const carrierStr = String(parsed.carrier || parsed.airline || '').trim();
    const combinedCarrier = `${carrierStr} ${parsed.flightOrTrainNumber || ''}`;
    const isBus =
      rawTransport === 'bus' ||
      /автобус|автовокзал|bus|obilet|flixbus|ecolines|рейс\s*автобус/i.test(combinedCarrier);
    const isTrain =
      !isBus &&
      (rawTransport === 'train' ||
        /ржд|rzd|сапсан|sapsan|поезд|ласточка|вагон/i.test(combinedCarrier));
    const resolvedTransport: 'flight' | 'train' | 'bus' = isBus
      ? 'bus'
      : isTrain
      ? 'train'
      : 'flight';

    const enrichedRows = normalizedPassengers.map((np, idx) => {
      const m = matches[idx];
      const matched = m?.matchedPerson || null;

      const splitDateTime = (rawVal: string) => {
        const clean = String(rawVal || '').trim();
        if (!clean) return { datePart: '', timePart: '', combined: '' };
        const parts = clean.split(/\s+/);
        let dPart = parts[0] || '';
        const tPart = parts[1] && /^\d{1,2}:\d{2}/.test(parts[1]) ? parts[1].slice(0, 5) : '';
        const isoMatch = dPart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
          dPart = `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
        }
        return {
          datePart: dPart,
          timePart: tPart,
          combined: [dPart, tPart].filter(Boolean).join(' '),
        };
      };

      const depInfo = splitDateTime(String(parsed.departureDate || ''));
      const arrInfo = splitDateTime(
        String(parsed.returnOrArrivalDate || parsed.returnDate || '')
      );
      const rawTrip = String(parsed.tripType || '').toLowerCase();
      const detectedTripType =
        rawTrip.includes('round') ||
        (String(parsed.flightOrTrainNumber || '').includes('/') &&
          arrInfo.datePart &&
          arrInfo.datePart !== depInfo.datePart)
          ? 'Round Trip'
          : 'One Way';

      return {
        passengerName: np.passengerName,
        passengerNameCyrillic: np.passengerNameCyrillic || matched?.fullNameRu || '',
        passportNumber: np.passportNumber || matched?.passportNo || '',
        citizenship: np.citizenship || matched?.citizenship || '',
        ticketNumber: np.ticketNumber,
        seatOrWagon: np.seatOrWagon,
        transportType: resolvedTransport,
        bookingReference: String(parsed.bookingReference || '').trim(),
        carrier: carrierStr,
        flightOrTrainNumber: String(
          parsed.flightOrTrainNumber || parsed.flightNumber || ''
        ).trim(),
        departureCity: String(parsed.departureCity || '').trim().toUpperCase(),
        arrivalCity: String(parsed.arrivalCity || '').trim().toUpperCase(),
        departureAirportOrStation: String(
          parsed.departureAirportOrStation || parsed.departureAirport || ''
        ).trim(),
        arrivalAirportOrStation: String(
          parsed.arrivalAirportOrStation || parsed.arrivalAirport || ''
        ).trim(),
        departureDate: depInfo.combined || String(parsed.departureDate || '').trim(),
        departureTime: depInfo.timePart,
        returnOrArrivalDate:
          arrInfo.combined || String(parsed.returnOrArrivalDate || parsed.returnDate || '').trim(),
        arrivalDate: arrInfo.datePart || depInfo.datePart,
        arrivalTime: arrInfo.timePart,
        ticketClass: String(parsed.ticketClass || 'economy').trim(),
        ticketPrice: perPassengerPrice,
        currency: String(parsed.currency || 'RUB').trim().toUpperCase(),
        flightPurpose: 'Transfer',
        ticketAgent: 'One Two Trip',
        paymentCompany: matched?.paymentCompany || 'PONDERA-INDUSTRY',
        docStatus: 'Uploaded',
        contactPhone: matched?.contactPhone || '',
        jobTitle: matched?.position || '',
        ticketStatus: '',
        detailReason: '0',
        tripType: detectedTripType,
        notes: '',
        deductFromSalary: 'No',
        matchType: m.matchType,
        confidence: m.confidence,
        matchReason: m.matchReason,
        matchedPerson: matched,
        candidates: m.candidates,
        region: matched?.region || '',
        projectName: matched?.projectName || '',
      };
    });

    return NextResponse.json({
      success: true,
      providerUsed: providerLabel,
      fileName,
      passengerCount: enrichedRows.length,
      passengers: enrichedRows,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: err?.message || 'Bilet okuma sırasında beklenmeyen bir sorun oluştu.',
      },
      { status: 200 }
    );
  }
}

