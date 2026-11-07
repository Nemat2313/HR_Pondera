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
    const isTrain =
      rawTransport === 'train' ||
      /ржд|rzd|сапсан|sapsan|поезд|ласточка|вагон/i.test(
        `${carrierStr} ${parsed.flightOrTrainNumber || ''}`
      );

    const enrichedRows = normalizedPassengers.map((np, idx) => {
      const m = matches[idx];
      const matched = m?.matchedPerson || null;
      return {
        passengerName: np.passengerName,
        passengerNameCyrillic: np.passengerNameCyrillic,
        passportNumber: np.passportNumber || matched?.passportNo || '',
        citizenship: np.citizenship || matched?.citizenship || '',
        ticketNumber: np.ticketNumber,
        seatOrWagon: np.seatOrWagon,
        transportType: isTrain ? 'train' : 'flight',
        bookingReference: String(parsed.bookingReference || '').trim(),
        carrier: carrierStr,
        flightOrTrainNumber: String(
          parsed.flightOrTrainNumber || parsed.flightNumber || ''
        ).trim(),
        departureCity: String(parsed.departureCity || '').trim(),
        arrivalCity: String(parsed.arrivalCity || '').trim(),
        departureAirportOrStation: String(
          parsed.departureAirportOrStation || parsed.departureAirport || ''
        ).trim(),
        arrivalAirportOrStation: String(
          parsed.arrivalAirportOrStation || parsed.arrivalAirport || ''
        ).trim(),
        departureDate: String(parsed.departureDate || '').trim(),
        returnOrArrivalDate: String(
          parsed.returnOrArrivalDate || parsed.returnDate || ''
        ).trim(),
        ticketClass: String(parsed.ticketClass || 'economy').trim(),
        ticketPrice: perPassengerPrice,
        currency: String(parsed.currency || 'RUB').trim().toUpperCase(),
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

