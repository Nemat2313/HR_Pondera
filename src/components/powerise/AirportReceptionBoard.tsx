'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PlaneLanding,
  PlaneTakeoff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Phone,
  Car,
  CheckCircle2,
  Clock,
  Train,
  Plane,
  Bus,
  Search,
  Edit3,
  Check,
  X,
  Users,
  MapPin,
  Route,
  Building2,
} from 'lucide-react';
import PonderaLogo from '@/components/common/PonderaLogo';
import { useAuth } from '@/context/AuthContext';

export interface ReceptionTicketRow {
  id: number;
  eba_doc_id?: string;
  ticket_code: string;
  transport_type: 'flight' | 'train' | 'bus' | string;
  person_type: 'employee' | 'guest' | string;
  sicil_no: string;
  guest_code?: string;
  passenger_name: string;
  passenger_name_ru?: string;
  citizenship?: string;
  flight_purpose?: string;
  ticket_agent?: string;
  payment_company?: string;
  carrier?: string;
  flight_or_train_no?: string;
  departure_city: string;
  arrival_city: string;
  departure_date: string;
  departure_time?: string;
  arrival_or_return_date?: string;
  arrival_date?: string;
  arrival_time?: string;
  contact_phone?: string;
  job_title?: string;
  region?: string;
  project_name?: string;
  ticket_status?: string;
  trip_type?: string;
  notes?: string;
  reception_status?: 'pending' | 'assigned' | 'welcomed' | string;
  reception_driver_note?: string;
}

interface AirportReceptionBoardProps {
  tickets: ReceptionTicketRow[];
  onRefresh: () => void;
  onUpdateTicketLocal: (
    ticketId: number,
    patch: Partial<ReceptionTicketRow>
  ) => void;
  canEdit?: boolean;
}

type HubId =
  | 'moscow'
  | 'kazan'
  | 'svobodny'
  | 'tobolsk'
  | 'spb'
  | 'irkutsk'
  | 'nizhniy'
  | 'all';

interface HubConfig {
  id: HubId;
  label: string;
  airportCode: string;
  titleRu: string;
  keywords: string[];
}

const HUBS: HubConfig[] = [
  {
    id: 'moscow',
    label: 'Moskova',
    airportCode: 'SVO • DME • VKO • РЖД / АВТОВОКЗАЛ',
    titleRu: 'МОСКВА',
    keywords: [
      'MOSCOW',
      'MOSKOVA',
      'MOSKVA',
      'МОСКВА',
      'SHEREMETYEVO',
      'ŞEREMETYEVO',
      'DOMODEDOVO',
      'VNUKOVO',
      'ZHUKOVSKY',
      'LENINGRADSKIY',
      'YAROSLAVSKIY',
      'KAZANSKIY',
      'PAZAVELETSKIY',
      'SVO',
      'DME',
      'VKO',
    ],
  },
  {
    id: 'kazan',
    label: 'Kazan / Nijnekamsk',
    airportCode: 'KZN • NBC • РЖД / АВТОБУС',
    titleRu: 'КАЗАНЬ / НИЖНЕКАМСК',
    keywords: [
      'KAZAN',
      'КАЗАНЬ',
      'KZN',
      'NIZHNEKAMSK',
      'NIJNEKAMSK',
      'НИЖНЕКАМСК',
      'BEGISHEVO',
      'NBC',
      'NABEREZHNYE',
      'CHELNY',
      'ALMETYEVSK',
    ],
  },
  {
    id: 'svobodny',
    label: 'Blagoveshchensk / Svobodny',
    airportCode: 'BQS • AGHK • РЖД / АВТОБУС',
    titleRu: 'БЛАГОВЕЩЕНСК / СВОБОДНЫЙ',
    keywords: [
      'BLAGOVESHCHENSK',
      'BLAGOVEŞÇENSK',
      'БЛАГОВЕЩЕНСК',
      'SVOBODNY',
      'СВОБОДНЫЙ',
      'BELOGORSK',
      'БЕЛОГОРСК',
      'SKOVORODINO',
      'KHABAROVSK',
      'BQS',
      'IGNATYEVO',
    ],
  },
  {
    id: 'tobolsk',
    label: 'Tobolsk / Tümen',
    airportCode: 'TJM • RMZ • РЖД / АВТОБУС',
    titleRu: 'ТОБОЛЬСК / ТЮМЕНЬ',
    keywords: [
      'TYUMEN',
      'TÜMEN',
      'TUMEN',
      'ТЮМЕНЬ',
      'TOBOLSK',
      'ТОБОЛЬСК',
      'ROSHCHINO',
      'REMEZOV',
      'YEKATERINBURG',
      'SURGUT',
      'TJM',
      'RMZ',
    ],
  },
  {
    id: 'spb',
    label: 'St. Petersburg / Ust-Luga',
    airportCode: 'LED • ULU • РЖД / АВТОБУС',
    titleRu: 'САНКТ-ПЕТЕРБУРГ / УСТЬ-ЛУГА',
    keywords: [
      'PETERSBURG',
      'ПЕТЕРБУРГ',
      'PULKOVO',
      'LED',
      'UST LUGA',
      'UST-LUGA',
      'УСТЬ-ЛУГА',
      'KINGISEPP',
    ],
  },
  {
    id: 'irkutsk',
    label: 'Irkutsk / Ust-Kut',
    airportCode: 'IKT • UKX • РЖД / АВТОБУС',
    titleRu: 'ИРКУТСК / УСТЬ-КУТ',
    keywords: ['IRKUTSK', 'ИРКУТСК', 'UST-KUT', 'UST KUT', 'УСТЬ-КУТ', 'BRATSK', 'IKT'],
  },
  {
    id: 'nizhniy',
    label: 'Nijniy Novgorod',
    airportCode: 'GOJ • KSTOVO • РЖД / АВТОБУС',
    titleRu: 'НИЖНИЙ НОВГОРОД',
    keywords: ['NIZHNIY', 'NIJNIY', 'NOVGOROD', 'НИЖНИЙ', 'STRIGINO', 'KSTOVO', 'GOJ'],
  },
  {
    id: 'all',
    label: 'Tüm Şehirler & Güzergahlar',
    airportCode: 'UÇAK • TREN • OTOBÜS',
    titleRu: 'ВСЕ МАРШРУТЫ (АВИА / ЖД / АВТОБУС)',
    keywords: [],
  },
];

const DEFAULT_PONDERA_SITES = [
  'NHNK mPE-300',
  'Kazan Katalizor',
  'Nizhnekamsk Polisterol',
  'NHNK SKLAD PROPILEN',
  'SIBUR Nijnekamsk',
  'Svobodny-AGHK',
  'Tobolsk',
  'Ust Luga',
  'Irkutsk',
  'Nizhny Novgorod',
  'Merkez Ofis',
];

function detectDefaultHubFromScope(scopeValue?: string): HubId {
  const s = String(scopeValue || '').toUpperCase();
  if (!s || s === 'ALL') return 'moscow';
  if (
    s.includes('KAZAN') ||
    s.includes('NHNK') ||
    s.includes('NIZHNEKAMSK') ||
    s.includes('SIBUR')
  ) {
    return 'kazan';
  }
  if (s.includes('MOSK') || s.includes('MOSC') || s.includes('MERKEZ')) return 'moscow';
  if (s.includes('SVOBOD') || s.includes('AGHK') || s.includes('AMUR')) return 'svobodny';
  if (s.includes('TOBOLSK') || s.includes('DGP') || s.includes('TYUMEN')) return 'tobolsk';
  if (s.includes('LUGA') || s.includes('PETERS')) return 'spb';
  if (s.includes('IRKUTSK')) return 'irkutsk';
  if (s.includes('NOVGOROD') || s.includes('RUSVINIL')) return 'nizhniy';
  return 'moscow';
}

function cityMatchesHub(cityRaw: string | undefined, hub: HubConfig): boolean {
  if (hub.id === 'all') return true;
  const upper = String(cityRaw || '').trim().toUpperCase();
  if (!upper) return false;
  return hub.keywords.some((kw) => {
    if (kw.length <= 3) {
      const rx = new RegExp(`(^|[^A-Z])${kw}([^A-Z]|$)`);
      return rx.test(upper);
    }
    return upper.includes(kw);
  });
}

export function parseTicketDateTimeMs(
  dateStr?: string,
  timeStr?: string
): { ms: number | null; displayDate: string; displayTime: string } {
  const rawDate = String(dateStr || '').trim();
  const rawTime = String(timeStr || '').trim();
  if (!rawDate) {
    return { ms: null, displayDate: '-', displayTime: rawTime || '--:--' };
  }

  const parts = rawDate.split(/\s+/);
  const dToken = parts[0] || '';
  const embeddedTime = parts[1] && /^\d{1,2}:\d{2}/.test(parts[1]) ? parts[1].slice(0, 5) : '';
  const finalTime =
    (rawTime && /^\d{1,2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : '') || embeddedTime;

  let day = 0;
  let month = 0;
  let year = 0;

  const ruMatch = dToken.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const isoMatch = dToken.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (ruMatch) {
    day = Number(ruMatch[1]);
    month = Number(ruMatch[2]);
    year = Number(ruMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return {
      ms: null,
      displayDate: dToken,
      displayTime: finalTime || '--:--',
    };
  }

  let hour = 12;
  let minute = 0;
  if (finalTime) {
    const [hh, mm] = finalTime.split(':').map(Number);
    if (!Number.isNaN(hh)) hour = hh;
    if (!Number.isNaN(mm)) minute = mm;
  }

  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) {
    return { ms: null, displayDate: dToken, displayTime: finalTime || '--:--' };
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    ms: dt.getTime(),
    displayDate: `${pad(day)}.${pad(month)}.${year}`,
    displayTime: finalTime || '--:--',
  };
}

function getCountdownBadge(targetMs: number, nowMs: number): {
  text: string;
  tone: string;
} {
  const targetDate = new Date(targetMs);
  const nowDate = new Date(nowMs);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  ).getTime();
  const startOfTarget = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  ).getTime();
  const dayDiff = Math.round((startOfTarget - startOfToday) / 86400000);
  const diffMin = Math.round((targetMs - nowMs) / 60000);

  if (dayDiff === 0) {
    if (diffMin < -30) {
      return {
        text: 'VARMIŞ / GERÇEKLEŞTİ',
        tone: 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40',
      };
    }
    if (diffMin <= 180) {
      const h = Math.max(0, Math.floor(diffMin / 60));
      const m = Math.max(0, diffMin % 60);
      return {
        text: h > 0 ? `BUGÜN • ${h}s ${m}dk` : `YAKLAŞIYOR • ${m}dk`,
        tone: 'bg-amber-500/30 text-amber-200 border-amber-400/60 animate-pulse',
      };
    }
    return {
      text: 'BUGÜN',
      tone: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
    };
  }
  if (dayDiff === 1) {
    return {
      text: 'YARIN',
      tone: 'bg-sky-500/25 text-sky-200 border-sky-400/40',
    };
  }
  if (dayDiff <= 3) {
    return {
      text: `${dayDiff} GÜN KALDI`,
      tone: 'bg-indigo-500/25 text-indigo-200 border-indigo-400/40',
    };
  }
  return {
    text: `${dayDiff} GÜN`,
    tone: 'bg-slate-800 text-slate-300 border-slate-700',
  };
}

export default function AirportReceptionBoard({
  tickets,
  onRefresh,
  onUpdateTicketLocal,
  canEdit = true,
}: AirportReceptionBoardProps) {
  const { user } = useAuth();
  const boardRef = useRef<HTMLDivElement>(null);

  const storageKey = useMemo(
    () => `pondera_tv_board_prefs_v2_${user?.email || 'default'}`,
    [user?.email]
  );

  const [selectedHub, setSelectedHub] = useState<HubId>(() =>
    detectDefaultHubFromScope(user?.scope_value)
  );
  const [selectedSite, setSelectedSite] = useState<string>('ALL');
  // customTarget: '' = use selectedHub | 'CITY:KAZAN' | 'ROUTE:MOSKOVA->KAZAN'
  const [customTarget, setCustomTarget] = useState<string>('');
  const [transportFilter, setTransportFilter] = useState<'all' | 'flight' | 'train' | 'bus'>('all');
  const [boardLayout, setBoardLayout] = useState<'split' | 'arrivals' | 'departures'>('split');
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [showCancelled, setShowCancelled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Restore saved TV preferences for this İdari İşler user / TV screen
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.selectedHub) setSelectedHub(parsed.selectedHub);
        if (parsed.selectedSite) setSelectedSite(parsed.selectedSite);
        if (typeof parsed.customTarget === 'string') setCustomTarget(parsed.customTarget);
        if (parsed.transportFilter) setTransportFilter(parsed.transportFilter);
        if (parsed.boardLayout) setBoardLayout(parsed.boardLayout);
        if (typeof parsed.horizonDays === 'number') setHorizonDays(parsed.horizonDays);
      } else if (user?.scope_value && user.scope_value !== 'ALL') {
        setSelectedHub(detectDefaultHubFromScope(user.scope_value));
        if (user.scope_type === 'project') {
          setSelectedSite(user.scope_value);
        }
      }
    } catch {
      // ignore storage errors
    } finally {
      setPrefsLoaded(true);
    }
  }, [storageKey, user?.scope_type, user?.scope_value]);

  // Persist TV settings whenever İdari İşler adjusts their şantiye or route
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          selectedHub,
          selectedSite,
          customTarget,
          transportFilter,
          boardLayout,
          horizonDays,
        })
      );
    } catch {
      // ignore
    }
  }, [
    prefsLoaded,
    storageKey,
    selectedHub,
    selectedSite,
    customTarget,
    transportFilter,
    boardLayout,
    horizonDays,
  ]);

  // Live 1-second digital clock + 60-second automatic data refresh for TV mode
  useEffect(() => {
    const clockTimer = setInterval(() => setNowMs(Date.now()), 1000);
    const refreshTimer = setInterval(() => onRefresh(), 60000);
    return () => {
      clearInterval(clockTimer);
      clearInterval(refreshTimer);
    };
  }, [onRefresh]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreenTv = async () => {
    try {
      if (!document.fullscreenElement && boardRef.current) {
        await boardRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

  // Dynamic options for Şantiye, Cities, and Custom Routes across all tickets
  const { siteOptions, cityOptions, routeOptions } = useMemo(() => {
    const siteSet = new Set<string>(DEFAULT_PONDERA_SITES);
    const cityCounts = new Map<string, number>();
    const routeCounts = new Map<string, number>();

    for (const t of tickets) {
      const sName = String(t.project_name || t.region || '').trim();
      if (sName && sName.toLowerCase() !== 'kazan') siteSet.add(sName);

      const dep = String(t.departure_city || '').trim().toUpperCase();
      const arr = String(t.arrival_city || '').trim().toUpperCase();
      if (dep) cityCounts.set(dep, (cityCounts.get(dep) || 0) + 1);
      if (arr) cityCounts.set(arr, (cityCounts.get(arr) || 0) + 1);
      if (dep && arr) {
        const rk = `${dep} ➔ ${arr}`;
        routeCounts.set(rk, (routeCounts.get(rk) || 0) + 1);
      }
    }

    const sortedCities = Array.from(cityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c, cnt]) => ({ city: c, count: cnt }));

    const sortedRoutes = Array.from(routeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([r, cnt]) => ({ route: r, count: cnt }));

    return {
      siteOptions: Array.from(siteSet).sort((a, b) => a.localeCompare(b, 'tr')),
      cityOptions: sortedCities,
      routeOptions: sortedRoutes,
    };
  }, [tickets]);

  const currentHubCfg = useMemo(
    () => HUBS.find((h) => h.id === selectedHub) || HUBS[0],
    [selectedHub]
  );

  const activeBoardTitle = useMemo(() => {
    const sitePrefix = selectedSite !== 'ALL' ? `${selectedSite} • ` : '';
    if (customTarget.startsWith('CITY:')) {
      return `${sitePrefix}${customTarget.slice(5)}`;
    }
    if (customTarget.startsWith('ROUTE:')) {
      return `${sitePrefix}${customTarget.slice(6)}`;
    }
    return `${sitePrefix}${currentHubCfg.label}`;
  }, [selectedSite, customTarget, currentHubCfg]);

  const { arrivals, departures, hubCounts, modeCounts } = useMemo(() => {
    const nowDate = new Date(nowMs);
    const startOfTodayMs = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate(),
      0,
      0,
      0
    ).getTime();
    const maxHorizonMs =
      horizonDays > 0 ? startOfTodayMs + horizonDays * 86400000 : Number.MAX_SAFE_INTEGER;

    const counts: Record<HubId, number> = {
      moscow: 0,
      kazan: 0,
      svobodny: 0,
      tobolsk: 0,
      spb: 0,
      irkutsk: 0,
      nizhniy: 0,
      all: 0,
    };

    const mCounts = { all: 0, flight: 0, train: 0, bus: 0 };
    const q = searchQuery.trim().toLowerCase();

    const arrList: Array<
      ReceptionTicketRow & {
        sortMs: number;
        dispDate: string;
        dispTime: string;
      }
    > = [];
    const depList: Array<
      ReceptionTicketRow & {
        sortMs: number;
        dispDate: string;
        dispTime: string;
      }
    > = [];

    for (const t of tickets) {
      const st = String(t.ticket_status || '').trim().toLowerCase();
      if (!showCancelled && (st === 'cancelled' || st === 'missed')) {
        continue;
      }

      // Filter by Şantiye if selected
      if (selectedSite !== 'ALL') {
        const tProj = String(t.project_name || '').trim().toLowerCase();
        const tReg = String(t.region || '').trim().toLowerCase();
        const targetS = selectedSite.toLowerCase();
        if (tProj !== targetS && tReg !== targetS && !tProj.includes(targetS) && !tReg.includes(targetS)) {
          continue;
        }
      }

      const depParsed = parseTicketDateTimeMs(t.departure_date, t.departure_time);
      const arrParsed = parseTicketDateTimeMs(
        t.arrival_date || t.arrival_or_return_date || t.departure_date,
        t.arrival_time || t.departure_time
      );

      const arrValid =
        arrParsed.ms !== null &&
        arrParsed.ms >= startOfTodayMs &&
        arrParsed.ms <= maxHorizonMs;
      const depValid =
        depParsed.ms !== null &&
        depParsed.ms >= startOfTodayMs &&
        depParsed.ms <= maxHorizonMs;

      if (!arrValid && !depValid) continue;

      const tMode: 'flight' | 'train' | 'bus' =
        t.transport_type === 'bus'
          ? 'bus'
          : t.transport_type === 'train'
          ? 'train'
          : 'flight';

      mCounts.all++;
      mCounts[tMode]++;

      if (transportFilter !== 'all' && tMode !== transportFilter) {
        continue;
      }

      // Count upcoming matches per hub for pill badges
      counts.all++;
      for (const h of HUBS) {
        if (h.id === 'all') continue;
        if (
          (arrValid && cityMatchesHub(t.arrival_city, h)) ||
          (depValid && cityMatchesHub(t.departure_city, h))
        ) {
          counts[h.id]++;
        }
      }

      if (q) {
        const hay = `${t.passenger_name} ${t.passenger_name_ru || ''} ${t.sicil_no} ${
          t.departure_city
        } ${t.arrival_city} ${t.project_name || ''} ${t.region || ''} ${
          t.reception_driver_note || ''
        }`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const depUpper = String(t.departure_city || '').trim().toUpperCase();
      const arrUpper = String(t.arrival_city || '').trim().toUpperCase();

      if (customTarget.startsWith('CITY:')) {
        const targetCity = customTarget.slice(5).trim().toUpperCase();
        if (arrValid && arrUpper === targetCity) {
          arrList.push({
            ...t,
            sortMs: arrParsed.ms!,
            dispDate: arrParsed.displayDate,
            dispTime: arrParsed.displayTime,
          });
        }
        if (depValid && depUpper === targetCity) {
          depList.push({
            ...t,
            sortMs: depParsed.ms!,
            dispDate: depParsed.displayDate,
            dispTime: depParsed.displayTime,
          });
        }
      } else if (customTarget.startsWith('ROUTE:')) {
        const routeSpec = customTarget.slice(6).trim().toUpperCase();
        const [rFrom, rTo] = routeSpec.split('➔').map((x) => x.trim());
        // Direct match -> Karşılama (Arrival at rTo); Reverse match -> Uğurlama (Departure from rTo back to rFrom)
        if (arrValid && depUpper === rFrom && arrUpper === rTo) {
          arrList.push({
            ...t,
            sortMs: arrParsed.ms!,
            dispDate: arrParsed.displayDate,
            dispTime: arrParsed.displayTime,
          });
        } else if (depValid && depUpper === rTo && arrUpper === rFrom) {
          depList.push({
            ...t,
            sortMs: depParsed.ms!,
            dispDate: depParsed.displayDate,
            dispTime: depParsed.displayTime,
          });
        } else if (depValid && depUpper === rFrom && arrUpper === rTo && !arrValid) {
          arrList.push({
            ...t,
            sortMs: depParsed.ms!,
            dispDate: depParsed.displayDate,
            dispTime: depParsed.displayTime,
          });
        }
      } else {
        if (arrValid && cityMatchesHub(t.arrival_city, currentHubCfg)) {
          arrList.push({
            ...t,
            sortMs: arrParsed.ms!,
            dispDate: arrParsed.displayDate,
            dispTime: arrParsed.displayTime,
          });
        }

        if (depValid && cityMatchesHub(t.departure_city, currentHubCfg)) {
          depList.push({
            ...t,
            sortMs: depParsed.ms!,
            dispDate: depParsed.displayDate,
            dispTime: depParsed.displayTime,
          });
        }
      }
    }

    arrList.sort((a, b) => a.sortMs - b.sortMs);
    depList.sort((a, b) => a.sortMs - b.sortMs);

    return {
      arrivals: arrList,
      departures: depList,
      hubCounts: counts,
      modeCounts: mCounts,
    };
  }, [
    tickets,
    nowMs,
    horizonDays,
    showCancelled,
    selectedSite,
    transportFilter,
    searchQuery,
    customTarget,
    currentHubCfg,
  ]);

  const handleCycleReceptionStatus = async (row: ReceptionTicketRow) => {
    if (!canEdit) return;
    const current = row.reception_status || 'pending';
    const nextStatus =
      current === 'pending'
        ? 'assigned'
        : current === 'assigned'
        ? 'welcomed'
        : 'pending';

    setSavingId(row.id);
    onUpdateTicketLocal(row.id, { reception_status: nextStatus });
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_reception',
          ticketId: row.id,
          receptionStatus: nextStatus,
        }),
      });
    } catch {
      // ignore
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveDriverNote = async (row: ReceptionTicketRow) => {
    setSavingId(row.id);
    const nextStatus =
      noteDraft.trim() && (!row.reception_status || row.reception_status === 'pending')
        ? 'assigned'
        : row.reception_status || 'pending';
    onUpdateTicketLocal(row.id, {
      reception_driver_note: noteDraft.trim(),
      reception_status: nextStatus,
    });
    setEditingNoteId(null);
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_reception',
          ticketId: row.id,
          receptionStatus: nextStatus,
          receptionDriverNote: noteDraft.trim(),
        }),
      });
    } catch {
      // ignore
    } finally {
      setSavingId(null);
    }
  };

  const liveClockStr = useMemo(() => {
    const d = new Date(nowMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} • ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [nowMs]);

  const renderTransportBadge = (tType?: string, flightOrTrainNo?: string, agent?: string) => {
    if (tType === 'bus') {
      return (
        <div className="flex items-center gap-1 text-[10.5px] text-emerald-300 mt-1 font-mono">
          <Bus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate max-w-[125px]">
            {flightOrTrainNo || agent || 'Otobüs Seferi'}
          </span>
        </div>
      );
    }
    if (tType === 'train') {
      return (
        <div className="flex items-center gap-1 text-[10.5px] text-amber-300 mt-1 font-mono">
          <Train className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate max-w-[125px]">
            {flightOrTrainNo || agent || 'RZD Tren'}
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-[10.5px] text-sky-300 mt-1 font-mono">
        <Plane className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span className="truncate max-w-[125px]">
          {flightOrTrainNo || agent || 'Uçak'}
        </span>
      </div>
    );
  };

  const renderFidsPanel = (
    direction: 'arrival' | 'departure',
    rows: Array<
      ReceptionTicketRow & {
        sortMs: number;
        dispDate: string;
        dispTime: string;
      }
    >
  ) => {
    const isArrival = direction === 'arrival';
    return (
      <div className="rounded-2xl bg-[#0B1324] border border-slate-800/90 overflow-hidden shadow-xl flex flex-col">
        {/* FIDS Board Banner */}
        <div
          className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${
            isArrival
              ? 'bg-gradient-to-r from-emerald-950/90 via-[#0E1E2E] to-[#0B1324] border-emerald-500/30'
              : 'bg-gradient-to-r from-amber-950/85 via-[#1F1A14] to-[#0B1324] border-amber-500/30'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                isArrival
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              }`}
            >
              {isArrival ? (
                <PlaneLanding className="w-5 h-5" />
              ) : (
                <PlaneTakeoff className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={`font-mono font-bold tracking-wider text-sm sm:text-base uppercase ${
                    isArrival ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {isArrival
                    ? `ПРИБЫТИЕ / GELİŞ — ${activeBoardTitle.toUpperCase()} KARŞILAMA`
                    : `ОТПРАВЛЕНИЕ / GİDİŞ — ${activeBoardTitle.toUpperCase()} UĞURLAMA`}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold ${
                    isArrival
                      ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/30'
                      : 'bg-amber-500/25 text-amber-200 border border-amber-400/30'
                  }`}
                >
                  {rows.length} YOLCU
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isArrival
                  ? 'Uçak, tren ve otobüs varış saatine göre sıralı karşılama & araç atama listesi'
                  : 'Uçak, tren ve otobüs kalkış saatine göre sıralı uğurlama & transfer listesi'}
              </p>
            </div>
          </div>
        </div>

        {/* FIDS Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#070D19] text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3">TARİH / SAAT</th>
                <th className="py-2.5 px-3">ULAŞIM & DURUM</th>
                <th className="py-2.5 px-3">GÜZERGAH</th>
                <th className="py-2.5 px-3">YOLCU & İLETİŞİM</th>
                <th className="py-2.5 px-3">ŞANTİYE / AMAÇ</th>
                <th className="py-2.5 px-3">KARŞILAMA & ŞOFÖR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-xs">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-mono text-xs">
                    Seçili filtrelerde ({activeBoardTitle}) beklenen{' '}
                    {isArrival ? 'geliş / karşılama' : 'gidiş / uğurlama'} kaydı bulunmuyor.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const cd = getCountdownBadge(r.sortMs, nowMs);
                  const recStatus = r.reception_status || 'pending';

                  return (
                    <tr
                      key={`${direction}-${r.id}`}
                      className="hover:bg-slate-800/45 transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div
                          className={`font-mono font-bold text-sm tracking-wider ${
                            isArrival ? 'text-emerald-300' : 'text-amber-300'
                          }`}
                        >
                          {r.dispTime !== '--:--' ? r.dispTime : 'GÜN İÇİ'}
                        </div>
                        <div className="font-mono text-[11px] text-slate-300">{r.dispDate}</div>
                      </td>

                      {/* Countdown + Transport */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${cd.tone}`}
                        >
                          {cd.text}
                        </span>
                        {renderTransportBadge(
                          r.transport_type,
                          r.flight_or_train_no,
                          r.ticket_agent
                        )}
                      </td>

                      {/* Route */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-white text-xs flex items-center gap-1.5">
                          <span className={!isArrival ? 'text-amber-300' : 'text-slate-300'}>
                            {r.departure_city || '-'}
                          </span>
                          <span className="text-slate-500">➔</span>
                          <span className={isArrival ? 'text-emerald-300' : 'text-slate-200'}>
                            {r.arrival_city || '-'}
                          </span>
                        </div>
                        {r.ticket_status && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9.5px] font-mono">
                            {r.ticket_status}
                          </span>
                        )}
                      </td>

                      {/* Passenger & Phone */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-white leading-snug">
                          {r.passenger_name}
                        </div>
                        {r.passenger_name_ru && (
                          <div className="text-[11px] text-slate-300 leading-tight">
                            {r.passenger_name_ru}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10.5px] text-slate-400 font-mono">
                          <span>{r.sicil_no ? `#${r.sicil_no}` : r.guest_code || 'MİSAFİR'}</span>
                          {r.contact_phone && (
                            <span className="inline-flex items-center gap-1 text-sky-300">
                              <Phone className="w-2.5 h-2.5" />
                              {r.contact_phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Site & Purpose */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-teal-300 text-xs leading-tight">
                          {r.project_name || r.region || '-'}
                        </div>
                        <div className="text-[10.5px] text-slate-400 mt-0.5">
                          {r.flight_purpose || 'Transfer'}
                          {r.job_title ? ` • ${r.job_title}` : ''}
                        </div>
                      </td>

                      {/* Reception Status & Driver Note */}
                      <td className="py-2.5 px-3 min-w-[190px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canEdit || savingId === r.id}
                            onClick={() => handleCycleReceptionStatus(r)}
                            title="Durumu değiştirmek için tıklayın (Bekleniyor -> Araç Atandı -> Karşılandı)"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer ${
                              recStatus === 'welcomed'
                                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                                : recStatus === 'assigned'
                                ? 'bg-sky-500/25 text-sky-200 border-sky-400/50'
                                : 'bg-slate-800/90 text-amber-200 border-amber-500/40 hover:bg-slate-700'
                            }`}
                          >
                            {recStatus === 'welcomed' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                                <span>{isArrival ? 'Karşılandı' : 'Uğurlandı'}</span>
                              </>
                            ) : recStatus === 'assigned' ? (
                              <>
                                <Car className="w-3 h-3 text-sky-300" />
                                <span>Araç Atandı</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-amber-300" />
                                <span>Bekleniyor</span>
                              </>
                            )}
                          </button>

                          {canEdit && editingNoteId !== r.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(r.id);
                                setNoteDraft(r.reception_driver_note || '');
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                              title="Şoför / Araç Plakası / Karşılama Notu Ekle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {editingNoteId === r.id ? (
                          <div className="flex items-center gap-1 mt-1.5">
                            <input
                              type="text"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Şoför / Plaka / Saat..."
                              className="w-36 px-2 py-1 rounded bg-slate-900 border border-sky-500/60 text-[11px] text-white focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveDriverNote(r);
                                if (e.key === 'Escape') setEditingNoteId(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveDriverNote(r)}
                              className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="p-1 rounded bg-slate-700 text-slate-200 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : r.reception_driver_note ? (
                          <div className="text-[10.5px] text-sky-300 font-mono mt-1 truncate max-w-[210px]">
                            🚐 {r.reception_driver_note}
                          </div>
                        ) : r.notes ? (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[210px]">
                            {r.notes}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={boardRef}
      className={`rounded-3xl bg-[#060B16] text-white border border-slate-800 shadow-2xl space-y-4 ${
        isFullscreen
          ? 'fixed inset-0 z-[80] rounded-none p-5 overflow-y-auto'
          : 'p-4 sm:p-5'
      }`}
    >
      {/* TOP MULTI-MODAL TV HEADER BAR */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3 border-b border-slate-800/90">
        <div className="flex flex-wrap items-center gap-4">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <PonderaLogo variant="full" tone="dark-bg" size="sm" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono font-bold text-base sm:text-lg tracking-wide text-white uppercase">
                İDARİ İŞLER KARŞILAMA & ULAŞIM TV PANOSU
              </h2>
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 font-mono text-xs font-bold">
                {customTarget
                  ? activeBoardTitle
                  : currentHubCfg.airportCode}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Uçak, RZD Tren ve Otobüs biletlerine göre tüm şantiye & güzergah karşılama panosu • Seçiminiz bu TV ekranı için otomatik hatırlanır
            </p>
          </div>
        </div>

        {/* Live Digital Clock + TV Fullscreen Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3.5 py-2 rounded-xl bg-[#0B1426] border border-slate-700/80 font-mono text-sm font-bold text-emerald-300 tracking-wider shadow-inner">
            🕒 {liveClockStr}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            title="Şimdi Yenile (Her 60 saniyede otomatik yenilenir)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreenTv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/25 cursor-pointer transition-all"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span>TV Modundan Çık</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4" />
                <span>📺 Tam Ekran TV Modu</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* PER-ŞANTİYE & CUSTOM ROUTE SELECTOR BAR */}
      <div className="p-3 rounded-2xl bg-[#0B1324] border border-slate-800/90 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Şantiye Selector */}
          <div className="flex items-center gap-1.5 bg-[#070D19] px-2.5 py-1.5 rounded-xl border border-slate-700">
            <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-400">Şantiye:</span>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="bg-transparent text-xs font-bold text-teal-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                Tüm Şantiyeler
              </option>
              {siteOptions.map((s) => (
                <option key={s} value={s} className="bg-slate-900 text-white">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Custom City or Route Selector */}
          <div className="flex items-center gap-1.5 bg-[#070D19] px-2.5 py-1.5 rounded-xl border border-slate-700">
            <Route className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold text-slate-400">Özel Güzergah / Şehir:</span>
            <select
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value)}
              className="bg-transparent text-xs font-bold text-amber-300 focus:outline-none cursor-pointer max-w-[250px]"
            >
              <option value="" className="bg-slate-900 text-white">
                📌 Merkez / Bölge Butonuna Göre ({currentHubCfg.label})
              </option>
              {cityOptions.length > 0 && (
                <optgroup label="🏙️ Özel Şehir Seç (Varış & Kalkış)" className="bg-slate-900 text-sky-300">
                  {cityOptions.map((c) => (
                    <option key={`CITY:${c.city}`} value={`CITY:${c.city}`} className="bg-slate-900 text-white">
                      {c.city} ({c.count} bilet)
                    </option>
                  ))}
                </optgroup>
              )}
              {routeOptions.length > 0 && (
                <optgroup label="🛣️ Özel Güzergah Seç (Kalkış ➔ Varış)" className="bg-slate-900 text-emerald-300">
                  {routeOptions.map((r) => (
                    <option key={`ROUTE:${r.route}`} value={`ROUTE:${r.route}`} className="bg-slate-900 text-white">
                      {r.route} ({r.count} bilet)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {customTarget && (
              <button
                type="button"
                onClick={() => setCustomTarget('')}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Özel güzergah filtresini sıfırla"
              >
                Sıfırla
              </button>
            )}
          </div>
        </div>

        {/* Multi-Modal Transport Mode Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTransportFilter('all')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
              transportFilter === 'all'
                ? 'bg-teal-500 text-slate-950 border-teal-400 font-bold'
                : 'bg-[#070D19] text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            Tüm Ulaşımlar ({modeCounts.all})
          </button>
          <button
            type="button"
            onClick={() => setTransportFilter('flight')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
              transportFilter === 'flight'
                ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                : 'bg-[#070D19] text-sky-300 border-slate-700 hover:text-white'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>Uçak ({modeCounts.flight})</span>
          </button>
          <button
            type="button"
            onClick={() => setTransportFilter('train')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
              transportFilter === 'train'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-[#070D19] text-amber-300 border-slate-700 hover:text-white'
            }`}
          >
            <Train className="w-3.5 h-3.5" />
            <span>Tren / RZD ({modeCounts.train})</span>
          </button>
          <button
            type="button"
            onClick={() => setTransportFilter('bus')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
              transportFilter === 'bus'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                : 'bg-[#070D19] text-emerald-300 border-slate-700 hover:text-white'
            }`}
          >
            <Bus className="w-3.5 h-3.5" />
            <span>Otobüs ({modeCounts.bus})</span>
          </button>
        </div>
      </div>

      {/* HUB CITY SELECTOR + BOARD CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* City Hub Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {HUBS.map((h) => {
            const active = !customTarget && selectedHub === h.id;
            const cnt = hubCounts[h.id] || 0;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setCustomTarget('');
                  setSelectedHub(h.id);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  active
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-[#0D172B] text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                }`}
              >
                <MapPin className="w-3 h-3 opacity-75" />
                <span>{h.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                    active ? 'bg-slate-950/25 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {cnt}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters: Search, Date Range, View Layout */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Yolcu, sicil, şantiye ara..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-[#0D172B] border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 w-48"
            />
          </div>

          <select
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-xl bg-[#0D172B] border border-slate-700 text-xs text-slate-200 font-semibold"
          >
            <option value={2}>Bugün & Yarın</option>
            <option value={7}>Önümüzdeki 7 Gün</option>
            <option value={30}>Önümüzdeki 30 Gün</option>
            <option value={0}>Tüm Gelecek Yolculuklar</option>
          </select>

          <div className="flex items-center rounded-xl bg-[#0D172B] p-0.5 border border-slate-700 text-[11px]">
            <button
              type="button"
              onClick={() => setBoardLayout('split')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                boardLayout === 'split' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Geliş + Gidiş
            </button>
            <button
              type="button"
              onClick={() => setBoardLayout('arrivals')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                boardLayout === 'arrivals'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sadece Karşılama ({arrivals.length})
            </button>
            <button
              type="button"
              onClick={() => setBoardLayout('departures')}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                boardLayout === 'departures'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sadece Gidiş ({departures.length})
            </button>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="rounded accent-amber-500"
            />
            <span>İptal/Kaçırılanlar</span>
          </label>
        </div>
      </div>

      {/* SUMMARY KPI STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-[#0B1324] border border-emerald-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-mono uppercase text-emerald-400 block">
              KARŞILANACAK (GELİŞ)
            </span>
            <span className="text-xl font-mono font-bold text-white">{arrivals.length}</span>
          </div>
          <PlaneLanding className="w-6 h-6 text-emerald-400/80" />
        </div>

        <div className="p-3 rounded-2xl bg-[#0B1324] border border-amber-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-mono uppercase text-amber-400 block">
              UĞURLANACAK (GİDİŞ)
            </span>
            <span className="text-xl font-mono font-bold text-white">{departures.length}</span>
          </div>
          <PlaneTakeoff className="w-6 h-6 text-amber-400/80" />
        </div>

        <div className="p-3 rounded-2xl bg-[#0B1324] border border-sky-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-mono uppercase text-sky-400 block">
              ARAÇ ATANAN
            </span>
            <span className="text-xl font-mono font-bold text-white">
              {
                [...arrivals, ...departures].filter((x) => x.reception_status === 'assigned')
                  .length
              }
            </span>
          </div>
          <Car className="w-6 h-6 text-sky-400/80" />
        </div>

        <div className="p-3 rounded-2xl bg-[#0B1324] border border-slate-700 flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-mono uppercase text-slate-400 block">
              BEKLEYEN ORGANİZASYON
            </span>
            <span className="text-xl font-mono font-bold text-amber-300">
              {
                [...arrivals, ...departures].filter(
                  (x) => !x.reception_status || x.reception_status === 'pending'
                ).length
              }
            </span>
          </div>
          <Users className="w-6 h-6 text-slate-400" />
        </div>
      </div>

      {/* MAIN FIDS BOARDS */}
      {boardLayout === 'split' ? (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          {renderFidsPanel('arrival', arrivals)}
          {renderFidsPanel('departure', departures)}
        </div>
      ) : boardLayout === 'arrivals' ? (
        renderFidsPanel('arrival', arrivals)
      ) : (
        renderFidsPanel('departure', departures)
      )}
    </div>
  );
}
