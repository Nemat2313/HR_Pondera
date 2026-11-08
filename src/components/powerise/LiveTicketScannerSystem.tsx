'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Plane,
  Train,
  Bus,
  Sparkles,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Users,
  UserPlus,
  UserCheck,
  Search,
  Download,
  Upload,
  Settings,
  Trash2,
  Link2,
  X,
  Check,
  Plus,
  Edit3,
  KeyRound,
  Tv,
  BarChart3,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import AirportReceptionBoard from '@/components/powerise/AirportReceptionBoard';
import TicketAnalyticsView from '@/components/powerise/TicketAnalyticsView';
import PonderaTicketFormModal, {
  PonderaTicketFormData,
} from '@/components/powerise/PonderaTicketFormModal';
import AiApiKeyGuideModal, {
  GuideProviderKey,
} from '@/components/settings/AiApiKeyGuideModal';

type ActiveAiProviderId =
  | 'deepseek'
  | 'deepseek_ocr'
  | 'yandex'
  | 'gigachat'
  | 'gemini'
  | 'openrouter'
  | 'ru_docs_ocr';

interface CandidatePerson {
  personType: 'employee' | 'guest';
  sicilNo?: string;
  guestId?: number;
  guestCode?: string;
  fullName: string;
  fullNameRu?: string;
  passportNo: string;
  citizenship: string;
  region: string;
  projectName: string;
  department?: string;
  position?: string;
  status: string;
  confidence: number;
  matchReason: string;
}

interface ParsedPassengerItem {
  uid: string;
  fileId: string;
  sourceFilename: string;
  selected: boolean;
  passengerName: string;
  passengerNameCyrillic: string;
  passportNumber: string;
  citizenship: string;
  ticketNumber: string;
  seatOrWagon: string;
  transportType: 'flight' | 'train' | 'bus';
  bookingReference: string;
  carrier: string;
  flightOrTrainNumber: string;
  departureCity: string;
  arrivalCity: string;
  departureAirportOrStation: string;
  arrivalAirportOrStation: string;
  departureDate: string;
  departureTime: string;
  returnOrArrivalDate: string;
  arrivalDate: string;
  arrivalTime: string;
  ticketClass: string;
  ticketPrice: number;
  currency: string;
  flightPurpose: string;
  ticketAgent: string;
  paymentCompany: string;
  contactPhone: string;
  jobTitle: string;
  ticketStatus: string;
  detailReason: string;
  tripType: string;
  notes: string;
  deductFromSalary: 'No' | 'Yes';
  employeeStatus: string;
  personType: 'employee' | 'guest';
  sicilNo: string;
  guestId: number | null;
  guestCode: string;
  guestOrg: string;
  matchedDisplayName: string;
  confidence: number;
  matchReason: string;
  region: string;
  projectName: string;
  providerUsed: string;
  candidates: CandidatePerson[];
}

interface UploadedTicketFile {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  passengerCount: number;
  providerUsed?: string;
  errorMessage?: string;
}

interface LiveTicketScannerProps {
  onOpenAiSettings?: () => void;
  onNavigateToPersonnel?: (filterType?: string, filterValue?: string) => void;
}

// Lazy browser-side PDF.js loader so scanned PDFs render to JPEG canvas AND digital PDFs extract text
let pdfJsPromise: Promise<any> | null = null;
function loadPdfJsFromCdn(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  const win = window as any;
  if (win.pdfjsLib) return Promise.resolve(win.pdfjsLib);
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (win.pdfjsLib) {
        win.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(win.pdfjsLib);
      } else {
        reject(new Error('PDF.js yüklenemedi'));
      }
    };
    script.onerror = () => {
      pdfJsPromise = null;
      reject(new Error('PDF.js CDN erişilemedi'));
    };
    document.head.appendChild(script);
  });
  return pdfJsPromise;
}

async function prepareFileForAi(
  file: File,
  provider?: ActiveAiProviderId
): Promise<{
  mimeType: string;
  primaryImageDataUrl?: string;
  extraPageDataUrls: string[];
  rawFileBase64?: string;
  extractedPdfText: string;
}> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    // High-clarity image compression (1600px max dimension so small passport numbers remain crisp)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (ev) => {
        const img = new window.Image();
        img.src = String(ev.target?.result || '');
        img.onload = () => {
          const maxDim = 1650;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(ev.target?.result || ''));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(String(ev.target?.result || ''));
      };
      reader.onerror = (e) => reject(e);
    });

    return {
      mimeType: 'image/jpeg',
      primaryImageDataUrl: dataUrl,
      extraPageDataUrls: [],
      extractedPdfText: '',
    };
  }

  const readRawBase64 = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const str = String(reader.result || '');
        const idx = str.indexOf(',');
        resolve(idx >= 0 ? str.slice(idx + 1) : str);
      };
      reader.onerror = (e) => reject(e);
    });

  try {
    const pdfjsLib = await loadPdfJsFromCdn();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const maxPages = Math.min(pdf.numPages, 3);
    const pages: any[] = [];
    let fullText = '';

    // 1) Fast digital text pass (~20ms) before deciding whether heavy canvas JPEG rendering is needed
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      pages.push(page);

      const textContent = await page.getTextContent();
      const items = (textContent.items || []) as Array<{
        str?: string;
        transform?: number[];
      }>;
      items.sort((a, b) => {
        const yA = Math.round((a.transform?.[5] || 0) / 4) * 4;
        const yB = Math.round((b.transform?.[5] || 0) / 4) * 4;
        if (yB !== yA) return yB - yA;
        return (a.transform?.[4] || 0) - (b.transform?.[4] || 0);
      });

      let lastY: number | null = null;
      let pageStr = '';
      for (const it of items) {
        const txt = (it.str || '').trim();
        if (!txt) continue;
        const curY = Math.round((it.transform?.[5] || 0) / 4) * 4;
        if (lastY !== null && Math.abs(curY - lastY) > 4) {
          pageStr += '\n';
        } else if (pageStr.length > 0 && !pageStr.endsWith('\n')) {
          pageStr += '  ';
        }
        pageStr += txt;
        lastY = curY;
      }
      if (pageStr.trim()) {
        fullText += `--- Sayfa ${pageNum} ---\n${pageStr.trim()}\n\n`;
      }
    }

    const nonWsChars = fullText.replace(/\s+/g, '').length;
    const isPureVisualOcrProvider =
      provider === 'yandex' ||
      provider === 'gigachat' ||
      provider === 'ru_docs_ocr' ||
      provider === 'deepseek_ocr';

    // FAST PATH: Digital e-ticket PDF on DeepSeek / OpenRouter — skip 1.5MB JPEG canvas rendering & upload!
    if (nonWsChars >= 100 && !isPureVisualOcrProvider) {
      return {
        mimeType: 'application/pdf',
        extraPageDataUrls: [],
        extractedPdfText: fullText.trim(),
      };
    }

    // VISUAL SCAN PATH: Scanned image-only PDF (<100 chars digital text) or pure OCR provider
    const renderedPages: string[] = [];
    for (let i = 0; i < Math.min(pages.length, 2); i++) {
      const page = pages[i];
      const viewport = page.getViewport({ scale: 1.45 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        renderedPages.push(canvas.toDataURL('image/jpeg', 0.78));
      }
    }

    const rawBase64 = renderedPages.length === 0 ? await readRawBase64() : undefined;

    return {
      mimeType: renderedPages.length > 0 ? 'image/jpeg' : 'application/pdf',
      primaryImageDataUrl: renderedPages[0],
      extraPageDataUrls: renderedPages.slice(1),
      rawFileBase64: rawBase64,
      extractedPdfText: fullText.trim(),
    };
  } catch {
    const rawBase64 = await readRawBase64();
    return {
      mimeType: 'application/pdf',
      extraPageDataUrls: [],
      rawFileBase64: rawBase64,
      extractedPdfText: '',
    };
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek AI (İnsan Gibi Evrak Anlama)',
  deepseek_ocr: 'DeepSeek-OCR / VL2 (Görsel Scan Akışı)',
  yandex: 'Yandex Vision + YandexGPT (Rusya AI)',
  gigachat: 'Sber GigaChat-Pro Vision (Rusya AI)',
  gemini: 'Google Gemini Flash (Vision & PDF)',
  openrouter: 'OpenRouter',
  ru_docs_ocr: 'RussianDocsOCR + DeepSeek',
};

export default function LiveTicketScannerSystem({
  onOpenAiSettings,
  onNavigateToPersonnel,
}: LiveTicketScannerProps) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const [subView, setSubView] = useState<
    'scanner' | 'ledger' | 'reception_board' | 'analytics' | 'guests'
  >('scanner');
  const [selectedProvider, setSelectedProvider] = useState<ActiveAiProviderId>('deepseek');
  const providerInitializedRef = useRef(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [ticketFormModal, setTicketFormModal] = useState<{
    open: boolean;
    initialData: PonderaTicketFormData | null;
  }>({ open: false, initialData: null });

  // Server ledger & AI readiness state
  const [savedTickets, setSavedTickets] = useState<Array<Record<string, any>>>([]);
  const [savedGuests, setSavedGuests] = useState<Array<Record<string, any>>>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [ledgerStats, setLedgerStats] = useState({
    totalTickets: 0,
    flightCount: 0,
    trainCount: 0,
    busCount: 0,
    employeeTickets: 0,
    guestTickets: 0,
    deductYesCount: 0,
    activeGuestsCount: 0,
    estimatedTotalRub: 0,
  });
  const [aiStatus, setAiStatus] = useState<{
    activeProvider: string;
    fallbackProvider: string;
    deepseekModel: string;
    isActiveProviderReady: boolean;
    readiness: Record<string, boolean>;
  } | null>(null);

  // Scanner workspace state
  const [files, setFiles] = useState<UploadedTicketFile[]>([]);
  const [parsedPassengers, setParsedPassengers] = useState<ParsedPassengerItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Ledger filters & pagination
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTransportFilter, setLedgerTransportFilter] = useState<
    'all' | 'flight' | 'train' | 'bus'
  >('all');
  const [ledgerPersonFilter, setLedgerPersonFilter] = useState<'all' | 'employee' | 'guest'>('all');
  const [ledgerDeductFilter, setLedgerDeductFilter] = useState<'all' | 'No' | 'Yes'>('all');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [importingExcel, setImportingExcel] = useState(false);

  // Person Linker / Guest Conversion Modal
  const [linkerModal, setLinkerModal] = useState<{
    mode: 'parsed_row' | 'convert_guest' | 'relink_saved_ticket';
    targetUid?: string;
    guestId?: number;
    ticketId?: number;
    title: string;
    candidates: CandidatePerson[];
  } | null>(null);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSearchRes, setPeopleSearchRes] = useState<{
    employees: Array<Record<string, any>>;
    guests: Array<Record<string, any>>;
  }>({ employees: [], guests: [] });
  const [searchingPeople, setSearchingPeople] = useState(false);

  // Quick Add Guest Modal (Ported from Powerise QuickAddTravelGuestDialog)
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [newGuestForm, setNewGuestForm] = useState({
    fullName: '',
    fullNameRu: '',
    passportNo: '',
    citizenship: '',
    companyOrOrg: 'Misafir / Aday Personel',
    assignedRegion: '',
    assignedProject: '',
    phone: '',
    notes: '',
  });
  const [savingGuest, setSavingGuest] = useState(false);

  const loadTicketsAndGuests = useCallback(() => {
    fetch('/api/tickets')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          setSavedTickets(json.tickets || []);
          setSavedGuests(json.guests || []);
          setRegions(json.regions || []);
          setProjects(json.projects || []);
          if (json.stats) setLedgerStats(json.stats);
          if (json.aiStatus) {
            setAiStatus(json.aiStatus);
            if (!providerInitializedRef.current) {
              providerInitializedRef.current = true;
              const configuredActive = (json.aiStatus.activeProvider || 'deepseek') as ActiveAiProviderId;
              const readinessMap = (json.aiStatus.readiness || {}) as Record<string, boolean>;
              if (readinessMap[configuredActive]) {
                setSelectedProvider(configuredActive);
              } else {
                const firstReady = (
                  ['deepseek_ocr', 'deepseek', 'yandex', 'gigachat', 'gemini', 'openrouter', 'ru_docs_ocr'] as ActiveAiProviderId[]
                ).find((k) => readinessMap[k]);
                setSelectedProvider(firstReady || configuredActive);
              }
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTicketsAndGuests();
  }, [loadTicketsAndGuests]);

  // Live search inside Person Linker Modal
  useEffect(() => {
    if (!linkerModal || peopleQuery.trim().length < 2) {
      setPeopleSearchRes({ employees: [], guests: [] });
      return;
    }
    const timer = setTimeout(() => {
      setSearchingPeople(true);
      fetch(`/api/tickets?action=search_people&q=${encodeURIComponent(peopleQuery.trim())}`)
        .then((r) => r.json())
        .then((json) => {
          if (json?.success) {
            setPeopleSearchRes({
              employees: json.employees || [],
              guests: json.guests || [],
            });
          }
        })
        .catch(() => {})
        .finally(() => setSearchingPeople(false));
    }, 240);
    return () => clearTimeout(timer);
  }, [peopleQuery, linkerModal]);

  const appendFiles = (incomingList: FileList | File[]) => {
    const arr = Array.from(incomingList).filter((f) => {
      const low = f.name.toLowerCase();
      return (
        low.endsWith('.pdf') ||
        low.endsWith('.png') ||
        low.endsWith('.jpg') ||
        low.endsWith('.jpeg') ||
        low.endsWith('.webp')
      );
    });
    if (arr.length === 0) return;

    const mapped: UploadedTicketFile[] = arr.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: 'pending',
      passengerCount: 0,
    }));
    setFiles((prev) => [...prev, ...mapped]);
  };

  const handleScanPendingFiles = async () => {
    const pendingOrError = files.filter((f) => f.status === 'pending' || f.status === 'error');
    const targets = pendingOrError.length > 0 ? pendingOrError : files;
    if (targets.length === 0) return;

    setIsScanning(true);
    setBannerMsg(null);

    const targetIds = new Set(targets.map((t) => t.id));
    setFiles((prev) =>
      prev.map((f) =>
        targetIds.has(f.id) ? { ...f, status: 'processing', errorMessage: undefined } : f
      )
    );

    const processSingleFile = async (item: UploadedTicketFile) => {
      try {
        const prepared = await prepareFileForAi(item.file, selectedProvider);
        const res = await fetch('/api/tickets/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: item.file.name,
            mimeType: prepared.mimeType,
            primaryImageDataUrl: prepared.primaryImageDataUrl,
            extraPageDataUrls: prepared.extraPageDataUrls,
            rawFileBase64: prepared.rawFileBase64,
            extractedPdfText: prepared.extractedPdfText,
            providerOverride: selectedProvider,
          }),
        });
        const json = await res.json();

        if (!json?.success) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? {
                    ...f,
                    status: 'error',
                    errorMessage: json?.message || 'Bilet okunamadı.',
                  }
                : f
            )
          );
          return;
        }

        const newRows: ParsedPassengerItem[] = (json.passengers || []).map(
          (p: Record<string, any>, idx: number) => {
            const mp = p.matchedPerson as CandidatePerson | null;
            const isEmp = p.matchType === 'employee' && mp?.sicilNo;
            const isExistingGuest = p.matchType === 'existing_guest' && mp?.guestId;

            return {
              uid: `${item.id}-pax-${idx}`,
              fileId: item.id,
              sourceFilename: item.file.name,
              selected: true,
              passengerName: p.passengerName || 'İSİMSİZ YOLCU',
              passengerNameCyrillic: p.passengerNameCyrillic || '',
              passportNumber: p.passportNumber || '',
              citizenship: p.citizenship || '',
              ticketNumber: p.ticketNumber || '',
              seatOrWagon: p.seatOrWagon || '',
              transportType:
                p.transportType === 'bus'
                  ? 'bus'
                  : p.transportType === 'train'
                  ? 'train'
                  : 'flight',
              bookingReference: p.bookingReference || '',
              carrier: p.carrier || '',
              flightOrTrainNumber: p.flightOrTrainNumber || '',
              departureCity: p.departureCity || '',
              arrivalCity: p.arrivalCity || '',
              departureAirportOrStation: p.departureAirportOrStation || '',
              arrivalAirportOrStation: p.arrivalAirportOrStation || '',
              departureDate: p.departureDate || '',
              departureTime: p.departureTime || '',
              returnOrArrivalDate: p.returnOrArrivalDate || '',
              arrivalDate: p.arrivalDate || '',
              arrivalTime: p.arrivalTime || '',
              ticketClass: p.ticketClass || 'economy',
              ticketPrice: Number(p.ticketPrice || 0),
              currency: p.currency || 'RUB',
              flightPurpose: p.flightPurpose || 'Transfer',
              ticketAgent: p.ticketAgent || 'One Two Trip',
              paymentCompany: p.paymentCompany || 'PONDERA-INDUSTRY',
              contactPhone: p.contactPhone || '',
              jobTitle: p.jobTitle || '',
              ticketStatus: p.ticketStatus || '',
              detailReason: p.detailReason || '0',
              tripType: p.tripType || 'One Way',
              notes: p.notes || '',
              deductFromSalary: p.deductFromSalary === 'Yes' ? 'Yes' : 'No',
              employeeStatus: String(mp?.status || ''),
              personType: isEmp ? 'employee' : 'guest',
              sicilNo: isEmp ? String(mp?.sicilNo || '') : '',
              guestId: isExistingGuest ? Number(mp?.guestId) : null,
              guestCode: isExistingGuest ? String(mp?.guestCode || '') : '',
              guestOrg: 'Misafir / Aday Personel',
              matchedDisplayName: mp ? mp.fullName : '',
              confidence: Number(p.confidence || 0),
              matchReason: String(p.matchReason || ''),
              region: String(p.region || ''),
              projectName: String(p.projectName || ''),
              providerUsed: String(json.providerUsed || 'DeepSeek AI'),
              candidates: Array.isArray(p.candidates) ? p.candidates : [],
            };
          }
        );

        setParsedPassengers((prev) => [
          ...prev.filter((r) => r.fileId !== item.id),
          ...newRows,
        ]);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'done',
                  passengerCount: newRows.length,
                  providerUsed: json.providerUsed,
                }
              : f
          )
        );
      } catch (err: any) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: 'error',
                  errorMessage: err?.message || 'Dosya işlenirken hata oluştu.',
                }
              : f
          )
        );
      }
    };

    // Process up to 3 tickets concurrently in parallel (~3x faster batch speed!)
    const CONCURRENCY = 3;
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, targets.length) },
      async () => {
        while (cursor < targets.length) {
          const currentIndex = cursor++;
          await processSingleFile(targets[currentIndex]);
        }
      }
    );
    await Promise.all(workers);

    setIsScanning(false);
  };

  const handleImportSelected = async () => {
    const selectedRows = parsedPassengers.filter((p) => p.selected);
    if (selectedRows.length === 0) return;

    setIsImporting(true);
    setBannerMsg(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_tickets',
          tickets: selectedRows,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setBannerMsg({
          type: 'success',
          text: json.message || 'Biletler başarıyla kaydedildi.',
        });
        const importedIds = new Set(selectedRows.map((r) => r.uid));
        setParsedPassengers((prev) => prev.filter((r) => !importedIds.has(r.uid)));
        loadTicketsAndGuests();
      } else {
        setBannerMsg({
          type: 'error',
          text: json?.message || 'Biletler kaydedilemedi.',
        });
      }
    } catch {
      setBannerMsg({
        type: 'error',
        text: 'Sunucu bağlantı hatası.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateManualGuest = async () => {
    if (!newGuestForm.fullName.trim()) return;
    setSavingGuest(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_guest',
          guest: newGuestForm,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setAddGuestOpen(false);
        setNewGuestForm({
          fullName: '',
          fullNameRu: '',
          passportNo: '',
          citizenship: '',
          companyOrOrg: 'Misafir / Aday Personel',
          assignedRegion: '',
          assignedProject: '',
          phone: '',
          notes: '',
        });
        setBannerMsg({ type: 'success', text: json.message });
        loadTicketsAndGuests();
      }
    } catch {
      // ignore
    } finally {
      setSavingGuest(false);
    }
  };

  const applyLinkerSelection = async (choice: {
    personType: 'employee' | 'guest' | 'new_guest';
    sicilNo?: string;
    guestId?: number;
    guestCode?: string;
    fullName?: string;
    region?: string;
    projectName?: string;
  }) => {
    if (!linkerModal) return;

    if (linkerModal.mode === 'parsed_row' && linkerModal.targetUid) {
      setParsedPassengers((prev) =>
        prev.map((row) => {
          if (row.uid !== linkerModal.targetUid) return row;
          if (choice.personType === 'employee' && choice.sicilNo) {
            return {
              ...row,
              personType: 'employee',
              sicilNo: choice.sicilNo,
              guestId: null,
              guestCode: '',
              matchedDisplayName: choice.fullName || '',
              region: choice.region || row.region,
              projectName: choice.projectName || row.projectName,
              confidence: 100,
              matchReason: 'Manuel Personel Eşleştirmesi',
            };
          }
          if (choice.personType === 'guest' && choice.guestId) {
            return {
              ...row,
              personType: 'guest',
              sicilNo: '',
              guestId: choice.guestId,
              guestCode: choice.guestCode || '',
              matchedDisplayName: choice.fullName || '',
              region: choice.region || row.region,
              projectName: choice.projectName || row.projectName,
              confidence: 100,
              matchReason: 'Kayıtlı Misafir Seçildi',
            };
          }
          return {
            ...row,
            personType: 'guest',
            sicilNo: '',
            guestId: null,
            guestCode: '',
            matchedDisplayName: '',
            matchReason: 'Yeni Misafir (Guest) Olarak Takibe Alınacak',
          };
        })
      );
      setLinkerModal(null);
      setPeopleQuery('');
      return;
    }

    if (linkerModal.mode === 'convert_guest' && linkerModal.guestId && choice.sicilNo) {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'convert_guest_to_employee',
          guestId: linkerModal.guestId,
          sicilNo: choice.sicilNo,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setBannerMsg({ type: 'success', text: json.message });
        loadTicketsAndGuests();
      }
      setLinkerModal(null);
      setPeopleQuery('');
      return;
    }

    if (linkerModal.mode === 'relink_saved_ticket' && linkerModal.ticketId) {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'relink_ticket',
          ticketId: linkerModal.ticketId,
          personType: choice.personType === 'employee' ? 'employee' : 'guest',
          sicilNo: choice.sicilNo,
          guestId: choice.guestId,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setBannerMsg({ type: 'success', text: json.message });
        loadTicketsAndGuests();
      }
      setLinkerModal(null);
      setPeopleQuery('');
    }
  };

  const handleDeleteSavedTicket = async (ticketId: number) => {
    await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_ticket', ticketId }),
    });
    loadTicketsAndGuests();
  };

  const handleToggleDeduct = async (ticketRow: Record<string, any>) => {
    if (user?.role === 'viewer') return;
    const nextVal = ticketRow.deduct_from_salary === 'Yes' ? 'No' : 'Yes';
    setSavedTickets((prev) =>
      prev.map((x) => (x.id === ticketRow.id ? { ...x, deduct_from_salary: nextVal } : x))
    );
    await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle_deduct',
        ticketId: ticketRow.id,
        deductFromSalary: nextVal,
      }),
    });
  };

  const handleUpdateTicketLocal = useCallback(
    (ticketId: number, patch: Record<string, any>) => {
      setSavedTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, ...patch } : t))
      );
    },
    []
  );

  const filteredSavedTickets = savedTickets.filter((t) => {
    if (ledgerTransportFilter !== 'all' && t.transport_type !== ledgerTransportFilter) {
      return false;
    }
    if (ledgerPersonFilter !== 'all' && t.person_type !== ledgerPersonFilter) {
      return false;
    }
    if (ledgerDeductFilter !== 'all') {
      const dv = t.deduct_from_salary === 'Yes' ? 'Yes' : 'No';
      if (dv !== ledgerDeductFilter) return false;
    }
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      const hay = `${t.passenger_name || ''} ${t.passenger_name_ru || ''} ${t.eba_doc_id || ''} ${
        t.passport_no || ''
      } ${t.sicil_no || ''} ${t.guest_code || ''} ${t.departure_city || ''} ${
        t.arrival_city || ''
      } ${t.carrier || ''} ${t.ticket_agent || ''} ${t.project_name || ''} ${
        t.region || ''
      } ${t.flight_purpose || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const LEDGER_PAGE_SIZE = 50;
  const totalLedgerPages = Math.max(1, Math.ceil(filteredSavedTickets.length / LEDGER_PAGE_SIZE));
  const safeLedgerPage = Math.min(ledgerPage, totalLedgerPages);
  const pagedSavedTickets = filteredSavedTickets.slice(
    (safeLedgerPage - 1) * LEDGER_PAGE_SIZE,
    safeLedgerPage * LEDGER_PAGE_SIZE
  );

  // Exact 29-column Pondera 'eBA Doküman Arşivi' positional export (matching bilet alinan toplu liste.xlsx)
  const handleExportExcel = () => {
    const headerRow = [
      'Doküman ID',
      'Personel No',
      'Ad Soyad',
      'Tam Adı (Kiril)',
      'Uyruğu',
      'Uçuş Tipi',
      'Ticket Agent',
      'Payment Company',
      '', // Col 8: Uçak / Tren / Otobüs
      'Uçuş Tarihi',
      '', // Col 10: Kalkış Saati
      'Kalkış Şehri',
      'Varış Tarihi',
      '', // Col 13: Varış Saati
      'Varış Şehri',
      'Fiyat',
      'Para Birimi',
      'Doküman Durumu',
      'İletişim Bilgisi(Ev)',
      'Resmi Görevi',
      'Proje Bölgesi',
      'Proje Adı',
      'Bilet Durumu',
      'Detail / Reason',
      'Gidiş Dönüş mü',
      'Aciklama',
      'Guncelleyen',
      'Guncelleme Tarihi',
      'Personelden Mi Kesilcek?',
    ];

    const dataRows = filteredSavedTickets.map((t) => {
      const depParts = String(t.departure_date || '').trim().split(/\s+/);
      const depDateOnly = depParts[0] || '';
      const depTimeOnly = t.departure_time || depParts[1] || '';
      const transportLabel =
        t.transport_type === 'bus'
          ? 'Otobüs'
          : t.transport_type === 'train'
          ? 'Tren'
          : 'Uçak';
      return [
        t.eba_doc_id || t.ticket_code || '',
        t.sicil_no || t.guest_code || '',
        t.passenger_name || '',
        t.passenger_name_ru || '',
        t.citizenship || '',
        t.flight_purpose || 'Transfer',
        t.ticket_agent || 'One Two Trip',
        t.payment_company || 'PONDERA-INDUSTRY',
        transportLabel,
        depDateOnly,
        depTimeOnly,
        t.departure_city || '',
        t.arrival_date || '',
        t.arrival_time || '',
        t.arrival_city || '',
        Number(t.ticket_price || 0) || 0,
        t.currency || 'RUB',
        t.doc_status || 'Uploaded',
        t.contact_phone || '',
        t.job_title || '',
        t.region || '',
        t.project_name || '',
        t.ticket_status || '',
        t.detail_reason || '0',
        t.trip_type || 'One Way',
        t.notes || '',
        t.updated_by || 'Pondera HR',
        t.updated_at || t.created_at || '',
        t.deduct_from_salary === 'Yes' ? 'Yes' : 'No',
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'eBA Doküman Arşivi');
    XLSX.writeFile(wb, `Pondera_Bilet_Alinan_Toplu_Liste.xlsx`);
  };

  // Import Pondera 29-column 'bilet alinan toplu liste.xlsx' (imports latest/upcoming rows fast)
  const handleImportPonderaExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportingExcel(true);
    setBannerMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as string[][];
      if (aoa.length <= 1) {
        setBannerMsg({ type: 'error', text: 'Excel dosyasında veri satırı bulunamadı.' });
        setImportingExcel(false);
        return;
      }

      // Take up to latest 600 rows (or all if <=600) so 42K archive files import cleanly without timeout
      const bodyRows = aoa.slice(1).filter((r) => String(r[2] || '').trim() !== '');
      const sliceRows = bodyRows.length > 600 ? bodyRows.slice(-600) : bodyRows;

      const mapped = sliceRows.map((r) => {
        const rawMode = String(r[8] || '').trim().toLowerCase();
        const tType = rawMode.includes('otob') || rawMode.includes('bus')
          ? 'bus'
          : rawMode.includes('tren') || rawMode.includes('rzd')
          ? 'train'
          : 'flight';
        return {
          eba_doc_id: String(r[0] || '').trim(),
          sicil_no: String(r[1] || '').trim(),
          passenger_name: String(r[2] || '').trim(),
          passenger_name_ru: String(r[3] || '').trim(),
          citizenship: String(r[4] || '').trim(),
          flight_purpose: String(r[5] || 'Transfer').trim(),
          ticket_agent: String(r[6] || 'One Two Trip').trim(),
          payment_company: String(r[7] || 'PONDERA-INDUSTRY').trim(),
          transport_type: tType,
          departure_date: String(r[9] || '').trim(),
          departure_time: String(r[10] || '').trim(),
          departure_city: String(r[11] || '').trim(),
          arrival_date: String(r[12] || '').trim(),
          arrival_time: String(r[13] || '').trim(),
          arrival_city: String(r[14] || '').trim(),
          ticket_price: Number(String(r[15] || '0').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0,
          currency: String(r[16] || 'RUB').trim() || 'RUB',
          doc_status: String(r[17] || 'Uploaded').trim(),
          contact_phone: String(r[18] || '').trim(),
          job_title: String(r[19] || '').trim(),
          region: String(r[20] || '').trim(),
          project_name: String(r[21] || '').trim(),
          ticket_status: String(r[22] || '').trim(),
          detail_reason: String(r[23] || '0').trim(),
          trip_type: String(r[24] || 'One Way').trim(),
          notes: String(r[25] || '').trim(),
          updated_by: String(r[26] || '').trim(),
          updated_at: String(r[27] || '').trim(),
          deduct_from_salary: String(r[28] || 'No').trim() === 'Yes' ? 'Yes' : 'No',
        };
      });

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_excel_rows',
          sourceFilename: file.name,
          rows: mapped,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        setBannerMsg({ type: 'success', text: json.message });
        loadTicketsAndGuests();
      } else {
        setBannerMsg({ type: 'error', text: json?.message || 'Excel aktarım hatası.' });
      }
    } catch {
      setBannerMsg({ type: 'error', text: 'Excel dosyası okunurken hata oluştu.' });
    } finally {
      setImportingExcel(false);
    }
  };

  const matchedEmpCount = parsedPassengers.filter((p) => p.personType === 'employee').length;
  const guestPaxCount = parsedPassengers.filter((p) => p.personType === 'guest').length;
  const pendingFilesCount = files.filter(
    (f) => f.status === 'pending' || f.status === 'error'
  ).length;
  const selectedEngineLabel = PROVIDER_LABELS[selectedProvider] || 'DeepSeek AI';
  const isSelectedEngineReady = Boolean(aiStatus?.readiness?.[selectedProvider]);

  return (
    <div className="space-y-4">
      {/* AI ENGINE BAR + SETTINGS SHORTCUT */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Живое ИИ-чтение билетов и учет сотрудников / гостей (Powerise)'
                  : 'Powerise Canlı AI Bilet Okuma & Çalışan / Misafir (Guest) Takip Merkezi'}
              </span>
              {isSelectedEngineReady ? (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60">
                  Seçili AI Hazır: {selectedEngineLabel}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60">
                  Seçili AI: {selectedEngineLabel} (API Anahtarı Yok)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Okutulan biletlerdeki yolcular Pondera kadrosunda aranır; kadroda olmayanlar otomatik olarak{' '}
              <strong className="text-slate-700 dark:text-slate-200">Misafir (GUEST-...)</strong> statüsünde takibe alınır. Otomatik sağlayıcı geçişi kapalıdır.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40 cursor-pointer transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Yeni API Key Nasıl Oluşturulur?</span>
          </button>

          {onOpenAiSettings && (
            <button
              type="button"
              onClick={onOpenAiSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 cursor-pointer transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>AI Bağlantı Ayarları</span>
            </button>
          )}
        </div>
      </div>

      {/* WARNING IF NO API KEY IS CONFIGURED YET */}
      {aiStatus &&
        !Object.values(aiStatus.readiness || {}).some(Boolean) && (
          <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                Henüz canlı AI API anahtarı tanımlanmamış. Bilet taramaya başlamak için{' '}
                <strong>Ayarlar &gt; 4. Yapay Zeka (AI) &amp; Evrak Okuma</strong> sekmesinden{' '}
                <strong>DeepSeek</strong> (veya Rusya içi <strong>Yandex / Sber GigaChat</strong>) anahtarınızı girin.
              </span>
            </div>
            {onOpenAiSettings && (
              <button
                type="button"
                onClick={onOpenAiSettings}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 hover:bg-amber-200/80 dark:bg-amber-500/25 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-600/50 cursor-pointer shrink-0"
              >
                AI Anahtarı Tanımla →
              </button>
            )}
          </div>
        )}

      {bannerMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            bannerMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{bannerMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMsg(null)}
            className="text-[11px] underline cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {/* 5 WORKSPACE SUB-TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setSubView('scanner')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              subView === 'scanner'
                ? 'bg-indigo-100/95 dark:bg-indigo-500/25 border border-indigo-300 dark:border-indigo-400/40 text-indigo-950 dark:text-indigo-100'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>1. AI Toplu Bilet Okutma</span>
            {parsedPassengers.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-600/15 text-indigo-900 dark:text-indigo-200">
                {parsedPassengers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView('ledger')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              subView === 'ledger'
                ? 'bg-emerald-100/95 dark:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-400/40 text-emerald-950 dark:text-emerald-100'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>2. Alınan Biletler Tablosu ({ledgerStats.totalTickets})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('reception_board')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              subView === 'reception_board'
                ? 'bg-sky-100/95 dark:bg-sky-500/25 border border-sky-300 dark:border-sky-400/40 text-sky-950 dark:text-sky-100'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>3. Karşılama & Ulaşım TV Panosu</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('analytics')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              subView === 'analytics'
                ? 'bg-teal-100/95 dark:bg-teal-500/25 border border-teal-300 dark:border-teal-400/40 text-teal-950 dark:text-teal-100'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>4. Bilet Fiyat & Güzergah Analitiği</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('guests')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              subView === 'guests'
                ? 'bg-amber-100/95 dark:bg-amber-500/25 border border-amber-300 dark:border-amber-400/40 text-amber-950 dark:text-amber-100'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>5. Misafir (Guest) Takip ({savedGuests.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTicketFormModal({ open: true, initialData: null })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Manuel Bilet Ekle</span>
          </button>

          <button
            type="button"
            onClick={() => setAddGuestOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Manuel Misafir Ekle</span>
          </button>
        </div>
      </div>

      {/* ==================== SUB-VIEW 1: AI BULK TICKET SCANNER ==================== */}
      {subView === 'scanner' && (
        <div className="space-y-4">
          {/* KPI STRIP */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Yüklenen Dosya</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {files.length}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Çıkarılan Yolcu</div>
              <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                {parsedPassengers.length}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Eşleşen Personel</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {matchedEmpCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                Misafir (Guest) Yolcu
              </div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {guestPaxCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Arşivdeki Bilet</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                {ledgerStats.totalTickets}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800">
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400">Takipteki Misafir</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {ledgerStats.activeGuestsCount}
              </div>
            </div>
          </div>

          {/* DRAG & DROP ZONE + SCAN TRIGGER */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) {
                appendFiles(e.dataTransfer.files);
              }
            }}
            className={`p-6 rounded-2xl border-2 border-dashed transition-all text-center ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C31]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files?.length) appendFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <div className="max-w-3xl mx-auto space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-300 mx-auto">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Uçak, RZD Tren veya Otobüs Biletlerini Buraya Sürükleyin (PDF, JPG, PNG)
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                Okutulan yolcular tüm personel listesinde (Mevcut, Beklenen Yeni Giriş ve Geri Dönen Eski Siciller dahil) otomatik eşleştirilir.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                >
                  Dosya Seç (.PDF / .JPG / .PNG)
                </button>

                {/* AI PROVIDER SELECTOR DIRECTLY BESIDE THE SCAN BUTTON */}
                <div className="inline-flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 p-1.5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-indigo-200/85 dark:border-indigo-500/40 shadow-2xs">
                  <div className="flex items-center gap-1.5 pl-2">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      Hangi AI:
                    </span>
                    <select
                      value={selectedProvider}
                      disabled={isScanning}
                      onChange={(e) => setSelectedProvider(e.target.value as ActiveAiProviderId)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="deepseek">
                        1. DeepSeek AI (Resmi API){' '}
                        {aiStatus?.readiness?.deepseek ? '— ✓ Anahtar Hazır' : '— Anahtar Yok'}
                      </option>
                      <option value="deepseek_ocr">
                        2. DeepSeek-OCR / VL2 (SiliconFlow){' '}
                        {aiStatus?.readiness?.deepseek_ocr ? '— ✓ Anahtar Hazır' : '— Anahtar Yok'}
                      </option>
                      <option value="yandex">
                        3. Yandex Vision + YandexGPT (Rusya){' '}
                        {aiStatus?.readiness?.yandex ? '— ✓ Anahtar Hazır' : '— Anahtar Yok'}
                      </option>
                      <option value="gigachat">
                        4. Sber GigaChat-Pro (Rusya){' '}
                        {aiStatus?.readiness?.gigachat ? '— ✓ Anahtar Hazır' : '— Anahtar Yok'}
                      </option>
                      <option value="gemini">
                        5. Google Gemini Flash (Vision & PDF){' '}
                        {aiStatus?.readiness?.gemini ? '— ✓ Anahtar Hazır' : '— Anahtar Yok'}
                      </option>
                      <option value="openrouter">
                        6. OpenRouter{' '}
                        {aiStatus?.readiness?.openrouter ? '— ✓ Anahtar Hazır' : '— Anahtar Yok'}
                      </option>
                      <option value="ru_docs_ocr">
                        7. RussianDocsOCR (Yerel){' '}
                        {aiStatus?.readiness?.ru_docs_ocr ? '— ✓ Hazır' : '— Kurulu Değil'}
                      </option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setGuideModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 border border-amber-300/80 dark:border-amber-500/40 cursor-pointer whitespace-nowrap"
                      title="Seçili AI sağlayıcısı için Yeni API Key nasıl oluşturulur?"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Yeni API Key?</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isScanning || files.length === 0}
                    onClick={handleScanPendingFiles}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-100 hover:bg-indigo-200/85 dark:bg-indigo-500/30 dark:hover:bg-indigo-500/45 text-indigo-950 dark:text-indigo-100 border border-indigo-300 dark:border-indigo-400/50 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-all"
                  >
                    {isScanning ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isScanning
                        ? 'Seçili AI Evrakları Okuyor...'
                        : pendingFilesCount > 0
                        ? `${pendingFilesCount} Bilet Dosyasını AI ile Oku`
                        : files.length > 0
                        ? `${files.length} Dosyayı Seçili AI ile Tekrar Oku`
                        : 'Bilet Dosyasını AI ile Oku'}
                    </span>
                  </button>
                </div>

                {files.length > 0 && !isScanning && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setParsedPassengers([]);
                    }}
                    className="px-3 py-2 rounded-xl text-xs text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Listeyi Temizle
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* UPLOADED FILES + PARSED PASSENGERS WORKSPACE */}
          {files.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* LEFT: FILE QUEUE */}
              <div className="lg:col-span-4 p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 space-y-2.5 self-start">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Yüklenen Dosyalar ({files.length})</span>
                </div>
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="font-medium truncate text-slate-800 dark:text-slate-200">
                            {f.file.name}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                            f.status === 'done'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : f.status === 'processing'
                              ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                              : f.status === 'error'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {f.status === 'done'
                            ? `${f.passengerCount} Yolcu`
                            : f.status === 'processing'
                            ? 'Okunuyor...'
                            : f.status === 'error'
                            ? 'Hata'
                            : 'Bekliyor'}
                        </span>
                      </div>
                      {f.providerUsed && (
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          Motor: {f.providerUsed}
                        </div>
                      )}
                      {f.errorMessage && (
                        <div className="text-[10.5px] text-rose-600 dark:text-rose-300 leading-snug">
                          {f.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT: PARSED PASSENGER REVIEW CARDS */}
              <div className="lg:col-span-8 p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      AI Tarafından Okunan Yolcular & Personel / Misafir Eşleşmeleri ({parsedPassengers.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Bilgileri kontrol edin, gerekirse çalışan/misafir bağlantısını değiştirip tek tıkla kaydedin.
                    </p>
                  </div>

                  {parsedPassengers.length > 0 && (
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={handleImportSelected}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-100 hover:bg-emerald-200/80 dark:bg-emerald-500/25 dark:hover:bg-emerald-500/35 text-emerald-950 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-500/40 cursor-pointer disabled:opacity-50"
                    >
                      {isImporting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>
                        Seçilenleri Kaydet & Misafirleri Takibe Al (
                        {parsedPassengers.filter((p) => p.selected).length})
                      </span>
                    </button>
                  )}
                </div>

                {parsedPassengers.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Dosyaları seçtikten sonra <strong>“Bilet Dosyasını AI ile Oku”</strong> butonuna basın.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {parsedPassengers.map((row) => (
                      <div
                        key={row.uid}
                        className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                          row.personType === 'employee'
                            ? 'bg-emerald-50/35 dark:bg-emerald-950/15 border-emerald-200/80 dark:border-emerald-800/50'
                            : 'bg-amber-50/40 dark:bg-amber-950/15 border-amber-200/80 dark:border-amber-800/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid ? { ...r, selected: e.target.checked } : r
                                  )
                                )
                              }
                              className="w-4 h-4 accent-indigo-600 rounded"
                            />
                            <select
                              value={row.transportType}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? {
                                          ...r,
                                          transportType: e.target.value as
                                            | 'flight'
                                            | 'train'
                                            | 'bus',
                                        }
                                      : r
                                  )
                                )
                              }
                              className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border cursor-pointer ${
                                row.transportType === 'bus'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300/60'
                                  : row.transportType === 'train'
                                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300/60'
                                  : 'bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border-sky-300/60'
                              }`}
                            >
                              <option value="flight">✈️ Uçak Bileti</option>
                              <option value="train">🚆 RZD Tren</option>
                              <option value="bus">🚌 Otobüs</option>
                            </select>

                            {row.personType === 'employee' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300/70 dark:border-emerald-700">
                                <UserCheck className="w-3 h-3" />
                                Pondera #{row.sicilNo} {row.matchedDisplayName} (%{row.confidence}
                                {row.employeeStatus ? ` • ${row.employeeStatus}` : ''})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300/70 dark:border-amber-700">
                                <UserPlus className="w-3 h-3" />
                                {row.guestCode
                                  ? `Kayıtlı Misafir: ${row.guestCode}`
                                  : 'Çalışan Listesinde Yok → Misafir (Guest) Takibine Alınacak'}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setLinkerModal({
                                mode: 'parsed_row',
                                targetUid: row.uid,
                                title: `${row.passengerName} — Çalışan veya Misafir Eşleştir`,
                                candidates: row.candidates,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-slate-700 hover:bg-indigo-50 cursor-pointer"
                          >
                            <Link2 className="w-3 h-3" />
                            <span>Kişiyi Değiştir / Bağla</span>
                          </button>
                        </div>

                        {/* EDITABLE FIELDS GRID */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Yolcu Adı (Latin)
                            </label>
                            <input
                              type="text"
                              value={row.passengerName}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? { ...r, passengerName: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Pasaport / Belge No
                            </label>
                            <input
                              type="text"
                              value={row.passportNumber}
                              placeholder="Bilette basılı değil (Manuel girin)"
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? { ...r, passportNumber: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono placeholder:font-sans placeholder:text-[10.5px] placeholder:text-slate-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Güzergah (Kalkış → Varış)
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={row.departureCity}
                                onChange={(e) =>
                                  setParsedPassengers((prev) =>
                                    prev.map((r) =>
                                      r.uid === row.uid
                                        ? { ...r, departureCity: e.target.value }
                                        : r
                                    )
                                  )
                                }
                                placeholder="Kalkış"
                                className="w-1/2 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                              />
                              <input
                                type="text"
                                value={row.arrivalCity}
                                onChange={(e) =>
                                  setParsedPassengers((prev) =>
                                    prev.map((r) =>
                                      r.uid === row.uid
                                        ? { ...r, arrivalCity: e.target.value }
                                        : r
                                    )
                                  )
                                }
                                placeholder="Varış"
                                className="w-1/2 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Tarih & Sefer No
                            </label>
                            <input
                              type="text"
                              value={`${row.departureDate} ${
                                row.flightOrTrainNumber ? `(${row.flightOrTrainNumber})` : ''
                              }`.trim()}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? { ...r, departureDate: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Havayolu / RZD & PNR
                            </label>
                            <input
                              type="text"
                              value={`${row.carrier}${
                                row.bookingReference ? ` • PNR: ${row.bookingReference}` : ''
                              }`}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid ? { ...r, carrier: e.target.value } : r
                                  )
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Tutar & Döviz
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={row.ticketPrice}
                                onChange={(e) =>
                                  setParsedPassengers((prev) =>
                                    prev.map((r) =>
                                      r.uid === row.uid
                                        ? { ...r, ticketPrice: Number(e.target.value || 0) }
                                        : r
                                    )
                                  )
                                }
                                className="w-2/3 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                              />
                              <input
                                type="text"
                                value={row.currency}
                                onChange={(e) =>
                                  setParsedPassengers((prev) =>
                                    prev.map((r) =>
                                      r.uid === row.uid
                                        ? { ...r, currency: e.target.value.toUpperCase() }
                                        : r
                                    )
                                  )
                                }
                                className="w-1/3 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Bölge
                            </label>
                            <input
                              type="text"
                              list="pondera-ticket-regions"
                              value={row.region}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid ? { ...r, region: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Örn: Amur-AGHK / Kazan"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Şantiye / Proje Zimmeti
                            </label>
                            <input
                              type="text"
                              list="pondera-ticket-projects"
                              value={row.projectName}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? { ...r, projectName: e.target.value }
                                      : r
                                  )
                                )
                              }
                              placeholder="Şantiye seçin / yazın"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Uçuş Tipi (Amaç)
                            </label>
                            <select
                              value={row.flightPurpose}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? { ...r, flightPurpose: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            >
                              <option value="Transfer">Transfer</option>
                              <option value="İşe Giriş">İşe Giriş</option>
                              <option value="İşten Çıkış">İşten Çıkış</option>
                              <option value="İzne Gidiş">İzne Gidiş</option>
                              <option value="İzinden Dönüş">İzinden Dönüş</option>
                              <option value="Is Gezisi">İş Gezisi</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Ticket Agent (Acente)
                            </label>
                            <input
                              type="text"
                              value={row.ticketAgent}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? { ...r, ticketAgent: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Personelden Mi Kesilcek? (Default: No)
                            </label>
                            <select
                              value={row.deductFromSalary}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid
                                      ? {
                                          ...r,
                                          deductFromSalary:
                                            e.target.value === 'Yes' ? 'Yes' : 'No',
                                        }
                                      : r
                                  )
                                )
                              }
                              className={`w-full px-2 py-1.5 rounded-lg border font-bold ${
                                row.deductFromSalary === 'Yes'
                                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                                  : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              }`}
                            >
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">
                              Açıklama / Karşılama Notu
                            </label>
                            <input
                              type="text"
                              value={row.notes}
                              onChange={(e) =>
                                setParsedPassengers((prev) =>
                                  prev.map((r) =>
                                    r.uid === row.uid ? { ...r, notes: e.target.value } : r
                                  )
                                )
                              }
                              placeholder="Opsiyonel not..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SUB-VIEW 2: PONDERA 29-COLUMN PURCHASED TICKETS TABLE ==================== */}
      {subView === 'ledger' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => {
                    setLedgerSearch(e.target.value);
                    setLedgerPage(1);
                  }}
                  placeholder="Doküman ID, sicil, ad soyad, şehir, şantiye..."
                  className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-64"
                />
              </div>

              <select
                value={ledgerPersonFilter}
                onChange={(e) => {
                  setLedgerPersonFilter(e.target.value as any);
                  setLedgerPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="all">Tüm Yolcular ({savedTickets.length})</option>
                <option value="employee">Pondera Çalışanları ({ledgerStats.employeeTickets})</option>
                <option value="guest">Misafir / Guest ({ledgerStats.guestTickets})</option>
              </select>

              <select
                value={ledgerTransportFilter}
                onChange={(e) => {
                  setLedgerTransportFilter(e.target.value as any);
                  setLedgerPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="all">Uçak + Tren + Otobüs</option>
                <option value="flight">✈️ Uçak ({ledgerStats.flightCount})</option>
                <option value="train">🚆 RZD Tren ({ledgerStats.trainCount})</option>
                <option value="bus">🚌 Otobüs ({ledgerStats.busCount || 0})</option>
              </select>

              <select
                value={ledgerDeductFilter}
                onChange={(e) => {
                  setLedgerDeductFilter(e.target.value as any);
                  setLedgerPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="all">Kesinti: Tümü (Default: No)</option>
                <option value="No">Personelden Kesilmeyecek (No)</option>
                <option value="Yes">Personelden Kesilecek (Yes: {ledgerStats.deductYesCount || 0})</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportPonderaExcel}
                className="hidden"
              />
              <button
                type="button"
                disabled={importingExcel}
                onClick={() => excelInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/20 text-sky-900 dark:text-sky-200 border border-sky-200 dark:border-sky-500/40 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{importingExcel ? 'Excel Yükleniyor...' : 'Toplu Liste Excel Yükle'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredSavedTickets.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/40 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Pondera Formatında Excel İndir (29 Kolon)</span>
              </button>
            </div>
          </div>

          {filteredSavedTickets.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Seçili kriterlere uygun bilet kaydı bulunmuyor.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left text-[11px] whitespace-nowrap border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900/90 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-2.5 sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-slate-200 dark:border-slate-800">
                        İşlem
                      </th>
                      <th className="py-2.5 px-2.5">Personelden Mi Kesilcek?</th>
                      <th className="py-2.5 px-2.5">Doküman ID</th>
                      <th className="py-2.5 px-2.5">Personel No</th>
                      <th className="py-2.5 px-2.5">Ad Soyad</th>
                      <th className="py-2.5 px-2.5">Tam Adı (Kiril)</th>
                      <th className="py-2.5 px-2.5">Uyruğu</th>
                      <th className="py-2.5 px-2.5">Uçuş Tipi</th>
                      <th className="py-2.5 px-2.5">Ticket Agent</th>
                      <th className="py-2.5 px-2.5">Payment Company</th>
                      <th className="py-2.5 px-2.5">Ulaşım</th>
                      <th className="py-2.5 px-2.5">Uçuş Tarihi</th>
                      <th className="py-2.5 px-2.5">Kalkış Saati</th>
                      <th className="py-2.5 px-2.5">Kalkış Şehri</th>
                      <th className="py-2.5 px-2.5">Varış Tarihi</th>
                      <th className="py-2.5 px-2.5">Varış Saati</th>
                      <th className="py-2.5 px-2.5">Varış Şehri</th>
                      <th className="py-2.5 px-2.5 text-right">Fiyat</th>
                      <th className="py-2.5 px-2.5">Para Birimi</th>
                      <th className="py-2.5 px-2.5">Doküman Durumu</th>
                      <th className="py-2.5 px-2.5">İletişim Bilgisi(Ev)</th>
                      <th className="py-2.5 px-2.5">Resmi Görevi</th>
                      <th className="py-2.5 px-2.5">Proje Bölgesi</th>
                      <th className="py-2.5 px-2.5">Proje Adı</th>
                      <th className="py-2.5 px-2.5">Bilet Durumu</th>
                      <th className="py-2.5 px-2.5">Detail / Reason</th>
                      <th className="py-2.5 px-2.5">Gidiş Dönüş mü</th>
                      <th className="py-2.5 px-2.5">Açıklama</th>
                      <th className="py-2.5 px-2.5">Güncelleyen</th>
                      <th className="py-2.5 px-2.5">Güncelleme Tarihi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {pagedSavedTickets.map((t) => {
                      const depParts = String(t.departure_date || '').trim().split(/\s+/);
                      const depDateOnly = depParts[0] || '-';
                      const depTimeOnly = t.departure_time || depParts[1] || '-';
                      const isDeductYes = t.deduct_from_salary === 'Yes';

                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2 px-2 sticky left-0 bg-white dark:bg-[#131C31] z-10 border-r border-slate-100 dark:border-slate-800">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setTicketFormModal({
                                    open: true,
                                    initialData: {
                                      id: t.id,
                                      eba_doc_id: t.eba_doc_id || '',
                                      sicil_no: t.sicil_no || '',
                                      person_type: t.person_type === 'guest' ? 'guest' : 'employee',
                                      passenger_name: t.passenger_name || '',
                                      passenger_name_ru: t.passenger_name_ru || '',
                                      passport_no: t.passport_no || '',
                                      citizenship: t.citizenship || '',
                                      flight_purpose: t.flight_purpose || 'Transfer',
                                      ticket_agent: t.ticket_agent || 'One Two Trip',
                                      payment_company: t.payment_company || 'PONDERA-INDUSTRY',
                                      transport_type:
                                        t.transport_type === 'bus'
                                          ? 'bus'
                                          : t.transport_type === 'train'
                                          ? 'train'
                                          : 'flight',
                                      flight_or_train_no: t.flight_or_train_no || '',
                                      booking_ref: t.booking_ref || '',
                                      ticket_number: t.ticket_number || '',
                                      departure_date: depDateOnly === '-' ? '' : depDateOnly,
                                      departure_time: depTimeOnly === '-' ? '' : depTimeOnly,
                                      departure_city: t.departure_city || '',
                                      arrival_date: t.arrival_date || '',
                                      arrival_time: t.arrival_time || '',
                                      arrival_city: t.arrival_city || '',
                                      ticket_price: Number(t.ticket_price || 0),
                                      currency: t.currency || 'RUB',
                                      doc_status: t.doc_status || 'Uploaded',
                                      contact_phone: t.contact_phone || '',
                                      job_title: t.job_title || '',
                                      region: t.region || '',
                                      project_name: t.project_name || '',
                                      ticket_status: t.ticket_status || '',
                                      detail_reason: t.detail_reason || '0',
                                      trip_type: t.trip_type || 'One Way',
                                      notes: t.notes || '',
                                      deduct_from_salary: isDeductYes ? 'Yes' : 'No',
                                    },
                                  })
                                }
                                className="p-1 rounded text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                                title="29 Sütun Bilgilerini Düzenle"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setLinkerModal({
                                    mode: 'relink_saved_ticket',
                                    ticketId: t.id,
                                    title: `${t.passenger_name} — Tüm Personel / Misafir Bağlantısı`,
                                    candidates: [],
                                  })
                                }
                                className="p-1 rounded text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer"
                                title="Çalışan veya Misafire Bağla"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedTicket(t.id)}
                                className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          <td className="py-2 px-2.5">
                            <button
                              type="button"
                              onClick={() => handleToggleDeduct(t)}
                              title="Tıklayarak No / Yes değiştirin"
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer ${
                                isDeductYes
                                  ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300'
                              }`}
                            >
                              {isDeductYes ? 'Yes' : 'No'}
                            </button>
                          </td>

                          <td className="py-2 px-2.5 font-mono text-slate-500">
                            {t.eba_doc_id || t.ticket_code}
                          </td>

                          <td className="py-2 px-2.5 font-mono">
                            {t.sicil_no ? (
                              <button
                                type="button"
                                onClick={() => onNavigateToPersonnel?.('search', String(t.sicil_no))}
                                className="font-bold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                              >
                                {t.sicil_no}
                              </button>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-300 font-semibold">
                                {t.guest_code || 'GUEST'}
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-2.5 font-bold text-slate-900 dark:text-white">
                            {t.passenger_name}
                          </td>
                          <td className="py-2 px-2.5 text-slate-600 dark:text-slate-300">
                            {t.passenger_name_ru || '-'}
                          </td>
                          <td className="py-2 px-2.5">{t.citizenship || '-'}</td>
                          <td className="py-2 px-2.5 font-medium text-teal-700 dark:text-teal-300">
                            {t.flight_purpose || 'Transfer'}
                          </td>
                          <td className="py-2 px-2.5">{t.ticket_agent || 'One Two Trip'}</td>
                          <td className="py-2 px-2.5">{t.payment_company || 'PONDERA-INDUSTRY'}</td>
                          <td className="py-2 px-2.5">
                            {t.transport_type === 'bus' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <Bus className="w-3 h-3" /> Otobüs
                              </span>
                            ) : t.transport_type === 'train' ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                <Train className="w-3 h-3" /> Tren
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold">
                                <Plane className="w-3 h-3" /> Uçak
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-mono">{depDateOnly}</td>
                          <td className="py-2 px-2.5 font-mono">{depTimeOnly}</td>
                          <td className="py-2 px-2.5 font-semibold">{t.departure_city || '-'}</td>
                          <td className="py-2 px-2.5 font-mono">{t.arrival_date || '-'}</td>
                          <td className="py-2 px-2.5 font-mono">{t.arrival_time || '-'}</td>
                          <td className="py-2 px-2.5 font-semibold">{t.arrival_city || '-'}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {Number(t.ticket_price || 0) > 0
                              ? Number(t.ticket_price).toLocaleString('tr-TR')
                              : '0'}
                          </td>
                          <td className="py-2 px-2.5 font-mono">{t.currency || 'RUB'}</td>
                          <td className="py-2 px-2.5">{t.doc_status || 'Uploaded'}</td>
                          <td className="py-2 px-2.5 font-mono">{t.contact_phone || '-'}</td>
                          <td className="py-2 px-2.5">{t.job_title || '-'}</td>
                          <td className="py-2 px-2.5 font-semibold text-teal-700 dark:text-teal-300">
                            {t.region || '-'}
                          </td>
                          <td className="py-2 px-2.5">{t.project_name || '-'}</td>
                          <td className="py-2 px-2.5">
                            {t.ticket_status ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                                {t.ticket_status}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-2 px-2.5">{t.detail_reason || '0'}</td>
                          <td className="py-2 px-2.5">{t.trip_type || 'One Way'}</td>
                          <td className="py-2 px-2.5 max-w-[200px] truncate">{t.notes || '-'}</td>
                          <td className="py-2 px-2.5 text-slate-500">{t.updated_by || '-'}</td>
                          <td className="py-2 px-2.5 font-mono text-slate-500">
                            {t.updated_at || t.created_at || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {totalLedgerPages > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>
                    Toplam <b>{filteredSavedTickets.length}</b> kayıttan{' '}
                    <b>{(safeLedgerPage - 1) * LEDGER_PAGE_SIZE + 1}</b>–
                    <b>{Math.min(safeLedgerPage * LEDGER_PAGE_SIZE, filteredSavedTickets.length)}</b>{' '}
                    arası gösteriliyor
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeLedgerPage <= 1}
                      onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      ← Önceki
                    </button>
                    <span className="px-2 font-semibold">
                      Sayfa {safeLedgerPage} / {totalLedgerPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeLedgerPage >= totalLedgerPages}
                      onClick={() => setLedgerPage((p) => Math.min(totalLedgerPages, p + 1))}
                      className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      Sonraki →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== SUB-VIEW 3: MULTI-MODAL RECEPTION & TRAVEL TV BOARD ==================== */}
      {subView === 'reception_board' && (
        <AirportReceptionBoard
          tickets={savedTickets as any}
          onRefresh={loadTicketsAndGuests}
          onUpdateTicketLocal={handleUpdateTicketLocal}
          canEdit={user?.role !== 'viewer'}
        />
      )}

      {/* ==================== SUB-VIEW 4: TICKET PRICE & ROUTE ANALYTICS ==================== */}
      {subView === 'analytics' && <TicketAnalyticsView tickets={savedTickets as any} />}

      {/* ==================== SUB-VIEW 3: GUEST (MİSAFİR) TRACKING SYSTEM ==================== */}
      {subView === 'guests' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Misafir & Henüz Kadroya Girmemiş Aday Yolcu Takip Listesi (Powerise Guest Modülü)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Personel listesinde bulunmayan dış misafirler ve işe giriş öncesi bileti alınan adaylar burada takip edilir; işe başladıklarında tek tıkla sicillerine bağlanır.
              </p>
            </div>
          </div>

          {savedGuests.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Henüz kayıtlı misafir (Guest) bulunmuyor. Kadro dışı bir yolcunun bileti okutulduğunda otomatik olarak buraya eklenir.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 pr-3">Guest Kodu</th>
                    <th className="py-2.5 px-2">Ad Soyad</th>
                    <th className="py-2.5 px-2">Pasaport & Uyruk</th>
                    <th className="py-2.5 px-2">Kurum / Açıklama</th>
                    <th className="py-2.5 px-2">Hedef Şantiye</th>
                    <th className="py-2.5 px-2">Bilet Sayısı</th>
                    <th className="py-2.5 px-2">Durum</th>
                    <th className="py-2.5 pl-2 text-right">Sicil Bağlantısı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {savedGuests.map((g) => (
                    <tr key={g.id}>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-amber-700 dark:text-amber-300">
                        {g.guest_code}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {g.full_name}
                        </div>
                        {g.full_name_ru && (
                          <div className="text-[10.5px] text-slate-500">{g.full_name_ru}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px]">
                        {g.passport_no || '-'} {g.citizenship ? `(${g.citizenship})` : ''}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300">
                        <div>{g.company_or_org}</div>
                        {g.notes && <div className="text-[10px] text-slate-400">{g.notes}</div>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300">
                        {g.assigned_region || g.assigned_project || '-'}
                      </td>
                      <td className="py-2.5 px-2 font-semibold">{g.ticket_count || 0} Bilet</td>
                      <td className="py-2.5 px-2">
                        {g.linked_sicil_no ? (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                            Çalışana Dönüştürüldü (#{g.linked_sicil_no})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold">
                            Aktif Misafir (Guest)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        {!g.linked_sicil_no && (
                          <button
                            type="button"
                            onClick={() =>
                              setLinkerModal({
                                mode: 'convert_guest',
                                guestId: g.id,
                                title: `${g.full_name} (${g.guest_code}) — Çalışan Siciline Bağla`,
                                candidates: [],
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/40 cursor-pointer"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Çalışan Siciline Bağla</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DATALISTS FOR REGION & PROJECT AUTOCOMPLETE */}
      <datalist id="pondera-ticket-regions">
        {regions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="pondera-ticket-projects">
        {projects.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {/* ==================== MODAL 1: EMPLOYEE / GUEST LINKER ==================== */}
      {linkerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {linkerModal.title}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setLinkerModal(null);
                  setPeopleQuery('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {linkerModal.mode === 'parsed_row' && (
              <button
                type="button"
                onClick={() => applyLinkerSelection({ personType: 'new_guest' })}
                className="w-full p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-left flex items-center justify-between text-xs text-amber-950 dark:text-amber-200 cursor-pointer"
              >
                <span className="font-semibold">
                  + Kadro Dışı Yolcu: Yeni Misafir (GUEST) Olarak Takibe Al
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {linkerModal.candidates.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500">
                  AI Yakın Eşleşme Önerileri:
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {linkerModal.candidates.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        applyLinkerSelection({
                          personType: c.personType,
                          sicilNo: c.sicilNo,
                          guestId: c.guestId,
                          guestCode: c.guestCode,
                          fullName: c.fullName,
                          region: c.region,
                          projectName: c.projectName,
                        })
                      }
                      className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-800 text-left flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {c.personType === 'employee'
                            ? `#${c.sicilNo} — ${c.fullName}`
                            : `${c.guestCode} — ${c.fullName}`}
                        </div>
                        <div className="text-[10.5px] text-slate-500">
                          Pasaport: {c.passportNo || '-'} • {c.region} / {c.projectName} ({c.matchReason})
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        %{c.confidence}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Pondera Personel veya Misafir Ara (Sicil, İsim, Kiril Ad, Pasaport):
              </label>
              <input
                type="text"
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="En az 2 harf veya rakam yazın..."
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {searchingPeople && (
                <div className="text-xs text-slate-400 py-3 text-center">Aranıyor...</div>
              )}
              {peopleSearchRes.employees.map((emp) => (
                <button
                  key={emp.sicil_no}
                  type="button"
                  onClick={() =>
                    applyLinkerSelection({
                      personType: 'employee',
                      sicilNo: emp.sicil_no,
                      fullName: emp.ad_soyad,
                      region: emp.region,
                      projectName: emp.proje_adi,
                    })
                  }
                  className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 dark:bg-slate-900 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-800 text-left flex items-center justify-between text-xs cursor-pointer"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      #{emp.sicil_no} — {emp.ad_soyad}
                    </div>
                    <div className="text-[10.5px] text-slate-500">
                      Pasaport: {emp.pasaport_no || '-'} • {emp.region} / {emp.proje_adi} ({emp.genel_durum})
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-semibold">
                    Çalışan Seç
                  </span>
                </button>
              ))}

              {linkerModal.mode !== 'convert_guest' &&
                peopleSearchRes.guests.map((gst) => (
                  <button
                    key={gst.id}
                    type="button"
                    onClick={() =>
                      applyLinkerSelection({
                        personType: 'guest',
                        guestId: gst.id,
                        guestCode: gst.guest_code,
                        fullName: gst.full_name,
                        region: gst.assigned_region,
                        projectName: gst.assigned_project,
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-100/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 text-left flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {gst.guest_code} — {gst.full_name}
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        Pasaport: {gst.passport_no || '-'} • {gst.company_or_org}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[10px] font-semibold">
                      Misafir Seç
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: QUICK ADD GUEST ==================== */}
      {addGuestOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Yeni Misafir / Dış Yolcu (Guest) Kaydı Ekle
              </h3>
              <button
                type="button"
                onClick={() => setAddGuestOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Ad Soyad (Latin — Zorunlu)
                </label>
                <input
                  type="text"
                  value={newGuestForm.fullName}
                  onChange={(e) =>
                    setNewGuestForm((p) => ({ ...p, fullName: e.target.value }))
                  }
                  placeholder="Örn: ALISHER MAMATOV"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Pasaport Numarası
                </label>
                <input
                  type="text"
                  value={newGuestForm.passportNo}
                  onChange={(e) =>
                    setNewGuestForm((p) => ({ ...p, passportNo: e.target.value }))
                  }
                  placeholder="FA1234567"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Uyruk
                </label>
                <input
                  type="text"
                  value={newGuestForm.citizenship}
                  onChange={(e) =>
                    setNewGuestForm((p) => ({ ...p, citizenship: e.target.value }))
                  }
                  placeholder="UZB / TUR / RUS / IND"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Kurum / Statü
                </label>
                <input
                  type="text"
                  value={newGuestForm.companyOrOrg}
                  onChange={(e) =>
                    setNewGuestForm((p) => ({ ...p, companyOrOrg: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Gideceği Bölge / Şantiye
                </label>
                <input
                  type="text"
                  list="pondera-ticket-regions"
                  value={newGuestForm.assignedRegion}
                  onChange={(e) =>
                    setNewGuestForm((p) => ({ ...p, assignedRegion: e.target.value }))
                  }
                  placeholder="Örn: Amur-AGHK"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddGuestOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs text-slate-600 cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={savingGuest || !newGuestForm.fullName.trim()}
                onClick={handleCreateManualGuest}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/25 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-500/40 cursor-pointer disabled:opacity-50"
              >
                Misafir (Guest) Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL 3: PONDERA 29-COLUMN MANUAL / EDIT TICKET ==================== */}
      <PonderaTicketFormModal
        isOpen={ticketFormModal.open}
        initialData={ticketFormModal.initialData}
        regions={regions}
        projects={projects}
        onClose={() => setTicketFormModal({ open: false, initialData: null })}
        onSaved={(msg) => {
          setBannerMsg({ type: 'success', text: msg });
          loadTicketsAndGuests();
        }}
      />

      {/* ==================== MODAL 4: CREATE NEW API KEY STEP-BY-STEP GUIDE ==================== */}
      <AiApiKeyGuideModal
        isOpen={guideModalOpen}
        initialProvider={
          selectedProvider === 'ru_docs_ocr'
            ? 'deepseek'
            : (selectedProvider as GuideProviderKey)
        }
        onClose={() => setGuideModalOpen(false)}
      />
    </div>
  );
}

