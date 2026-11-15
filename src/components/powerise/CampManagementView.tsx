'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  BedDouble,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Download,
  SlidersHorizontal,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  UserMinus,
  Search,
  RefreshCw,
  Loader2,
  BarChart3,
  Table2,
  Box,
  Sparkles,
  Wrench,
  MapPin,
  ArrowUpRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/LanguageContext';
import {
  CampAnalyticsPayload,
  CampDefinitionDetail,
  CampRoomDetail,
  RoomOperationalStatus,
  SafeCampResident,
} from '@/lib/campManager';
import Camp3DVisualizer from './Camp3DVisualizer';
import CampAdminModal, { AdminModalInitialTab } from './CampAdminModal';

interface CampManagementViewProps {
  onNavigateToPersonnel?: (filter: { type: string; value: string }) => void;
}

type MainViewTab = 'explorer_3d' | 'analytics' | 'tables';
type ListSubTab = 'rooms' | 'residents' | 'unassigned';

interface CampsApiResponse extends CampAnalyticsPayload {
  success: boolean;
  canManage: boolean;
  message?: string;
}

export default function CampManagementView({ onNavigateToPersonnel }: CampManagementViewProps) {
  const { lang } = useLanguage();

  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [data, setData] = useState<CampsApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [mutating, setMutating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<MainViewTab>('explorer_3d');
  const [listSubTab, setListSubTab] = useState<ListSubTab>('rooms');
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState<'all' | 'active' | 'standby'>('all');

  const [selectedCampId, setSelectedCampId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  // Admin modal state
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminModalInitialTab>('camp_form');
  const [adminCampId, setAdminCampId] = useState<number | null>(null);
  const [adminRoomNo, setAdminRoomNo] = useState<string>('');

  const fetchCamps = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (filterRegion !== 'all') params.set('region', filterRegion);
      if (filterProject !== 'all') params.set('project', filterProject);
      const res = await fetch(`/api/camps?${params.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as CampsApiResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Kamp verileri alınamadı.');
      }
      setData(json);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Veri yükleme hatası.');
    } finally {
      setLoading(false);
    }
  }, [filterRegion, filterProject]);

  useEffect(() => {
    fetchCamps();
  }, [fetchCamps]);

  // Keep selectedCampId & selectedRoomId synchronized when data changes
  useEffect(() => {
    if (!data?.camps?.length) {
      setSelectedCampId(null);
      setSelectedRoomId(null);
      return;
    }
    const camp =
      data.camps.find((c) => c.id === selectedCampId) || data.camps[0];
    if (camp.id !== selectedCampId) {
      setSelectedCampId(camp.id);
    }
    const existingRoom = camp.rooms.find((r) => r.id === selectedRoomId);
    if (!existingRoom) {
      const firstOccupiedOrFirst =
        camp.rooms.find((r) => r.totalOccupants > 0) || camp.rooms[0] || null;
      setSelectedRoomId(firstOccupiedOrFirst ? firstOccupiedOrFirst.id : null);
    }
  }, [data, selectedCampId, selectedRoomId]);

  const selectedCamp: CampDefinitionDetail | null = useMemo(() => {
    if (!data?.camps?.length) return null;
    return data.camps.find((c) => c.id === selectedCampId) || data.camps[0];
  }, [data, selectedCampId]);

  const selectedRoom: CampRoomDetail | null = useMemo(() => {
    if (!selectedCamp) return null;
    return selectedCamp.rooms.find((r) => r.id === selectedRoomId) || selectedCamp.rooms[0] || null;
  }, [selectedCamp, selectedRoomId]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const runQuickMutation = async (body: Record<string, unknown>) => {
    setMutating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/camps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          filterRegion,
          filterProject,
        }),
      });
      const json = (await res.json()) as CampsApiResponse & { createdCampId?: number };
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'İşlem başarısız oldu.');
      }
      setData(json);
      if (json.message) showToast(json.message);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'İşlem hatası.');
    } finally {
      setMutating(false);
    }
  };

  const openManageModal = (
    tab: AdminModalInitialTab,
    campId?: number | null,
    roomNo?: string
  ) => {
    setAdminTab(tab);
    setAdminCampId(campId ?? selectedCamp?.id ?? null);
    setAdminRoomNo(roomNo ?? '');
    setAdminOpen(true);
  };

  const handleExportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const campSummaryRows = data.camps.map((c) => ({
      'Bölge': c.region,
      'Şantiye / Proje': c.projectName,
      'Kamp No': c.campCode,
      'Kamp Adı': c.campName,
      'Kamp Tipi': c.campType,
      'Oda Sayısı': c.totalRooms,
      'Tam Boş Oda': c.emptyRooms,
      'Toplam Yatak Kapasitesi': c.totalCapacity,
      'Mevcut Konaklayan': c.activeOccupants,
      'Evrak Bekleyen / Gelecek': c.standbyOccupants,
      'Oda No Bekleyen (Kampta)': c.campUnassignedRoomOccupants,
      'Toplam Konaklayan': c.totalOccupants,
      'Boş Yatak': c.availableBeds,
      'Doluluk %': c.occupancyRate,
    }));

    const roomRows = data.camps.flatMap((c) =>
      c.rooms.map((r) => ({
        'Bölge': c.region,
        'Şantiye': c.projectName,
        'Kamp No': c.campCode,
        'Kat': r.floorNo,
        'Oda No': r.roomNo,
        'Durum': r.status,
        'Oda Tipi': r.roomType,
        'Tahmini Boş': r.isInferredEmpty ? 'Evet' : 'Hayır',
        'Yatak Kapasitesi': r.capacity,
        'Mevcut Kişi': r.activeCount,
        'Evrak Bekleyen': r.standbyCount,
        'Boş Yatak': r.emptyBeds,
        'Konaklayanlar': r.residents.map((p) => `${p.adSoyad} (${p.sicilNo})`).join(', '),
      }))
    );

    const residentRows = data.allCampResidents.map((p) => ({
      'Sicil No': p.sicilNo,
      'Ad Soyad': p.adSoyad,
      'Uyruk': p.uyruk,
      'Durum Grubu': p.statusCategory === 'standby' ? 'Evrak Bekleyen / Gelecek' : 'Mevcut',
      'Genel Durum': p.genelDurum,
      'Güncel Durum': p.guncelDurum,
      'Bölge': p.region,
      'Şantiye': p.projectName,
      'Kamp No': p.campCode,
      'Oda No': p.roomNo || '-',
      'Görevi': p.gorevi,
      'Departman': p.departman,
      'Firma': p.firma,
      'Vardiya': p.shift,
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(campSummaryRows), '1_Kamp_Ozet');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(roomRows), '2_Oda_Kapasite');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(residentRows), '3_Konaklayanlar');
    XLSX.writeFile(wb, `Pondera_Kamp_Lojman_Rapor_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const visibleProjects = useMemo(() => {
    if (!data?.filterOptions?.projects) return [];
    if (filterRegion === 'all') return data.filterOptions.projects;
    return data.filterOptions.projects.filter((p) => p.region === filterRegion);
  }, [data, filterRegion]);

  const chartCampData = useMemo(() => {
    if (!data?.camps) return [];
    return data.camps.slice(0, 16).map((c) => ({
      name: `${c.campCode} (${c.projectName.slice(0, 10)})`,
      Mevcut: c.activeOccupants,
      EvrakBekleyen: c.standbyOccupants,
      BosYatak: c.availableBeds,
    }));
  }, [data]);

  const flatRoomList = useMemo(() => {
    if (!data?.camps) return [];
    const q = tableSearch.trim().toLowerCase();
    return data.camps
      .flatMap((c) => c.rooms.map((r) => ({ camp: c, room: r })))
      .filter(({ camp, room }) => {
        if (tableStatusFilter === 'active' && room.activeCount === 0) return false;
        if (tableStatusFilter === 'standby' && room.standbyCount === 0) return false;
        if (!q) return true;
        return (
          camp.campCode.toLowerCase().includes(q) ||
          camp.projectName.toLowerCase().includes(q) ||
          room.roomNo.toLowerCase().includes(q) ||
          room.residents.some(
            (res) =>
              res.adSoyad.toLowerCase().includes(q) || res.sicilNo.toLowerCase().includes(q)
          )
        );
      });
  }, [data, tableSearch, tableStatusFilter]);

  const filteredResidentsList = useMemo(() => {
    const source: SafeCampResident[] =
      listSubTab === 'unassigned'
        ? data?.unassignedPersonnelSample || []
        : data?.allCampResidents || [];
    const q = tableSearch.trim().toLowerCase();
    return source.filter((p) => {
      if (tableStatusFilter !== 'all' && p.statusCategory !== tableStatusFilter) return false;
      if (!q) return true;
      return (
        p.adSoyad.toLowerCase().includes(q) ||
        p.sicilNo.toLowerCase().includes(q) ||
        p.campCode.toLowerCase().includes(q) ||
        p.roomNo.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q) ||
        p.gorevi.toLowerCase().includes(q) ||
        p.uyruk.toLowerCase().includes(q)
      );
    });
  }, [data, listSubTab, tableSearch, tableStatusFilter]);

  const kpis = data?.kpis;
  const canManage = Boolean(data?.canManage);

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-200">
      {/* 1. HEADER & ACTION BAR */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3.5 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center text-slate-950 shadow-md shadow-teal-500/20 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {lang === 'ru'
                    ? '3D Учет общежитий, городков и коечного фонда'
                    : 'Kamp Takibi & 3D Lojman Analitik ve Yönetim Sistemi'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-700/60">
                  {lang === 'ru' ? 'В штате + Ожидающие' : 'Mevcut + Evrak Bekleyen Canlı Veri'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                {lang === 'ru'
                  ? 'Аналитика заселения по регионам и объектам, прогноз мест для прибывающего персонала и панель АХО'
                  : 'Bölge ve şantiye bazlı aktif ve gelecek personel kamp/oda doluluk analizi, boş yatak takibi ve İdari İşler kapasite yönetimi'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Main Tab Switcher */}
            <div className="inline-flex rounded-xl p-0.5 bg-slate-100/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              {(
                [
                  { id: 'explorer_3d', icon: Box, tr: '3D Kampüs & Katlar', ru: '3D Городок' },
                  { id: 'analytics', icon: BarChart3, tr: 'Analitik Raporlar', ru: 'Аналитика' },
                  { id: 'tables', icon: Table2, tr: 'Oda & Personel Listesi', ru: 'Таблицы' },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMainTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      mainTab === tab.id
                        ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{lang === 'ru' ? tab.ru : tab.tr}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={fetchCamps}
              disabled={loading}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() => openManageModal('camp_form')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm shadow-emerald-600/20 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>
                  {lang === 'ru' ? 'Управление АХО' : 'Kamp & Oda Yönetimi'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Region & Project Cascading Filter Strip */}
        {data && (
          <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {lang === 'ru' ? 'Регионы:' : 'Bölge:'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFilterRegion('all');
                  setFilterProject('all');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  filterRegion === 'all'
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {lang === 'ru' ? 'Все регионы' : 'Tüm Bölgeler'}
              </button>
              {data.filterOptions.regions.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => {
                    setFilterRegion(r.name);
                    setFilterProject('all');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    filterRegion === r.name
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  {r.name}{' '}
                  <span className="opacity-70 text-[10px]">
                    ({r.campCount} {lang === 'ru' ? 'камп' : 'Kamp'})
                  </span>
                </button>
              ))}
            </div>

            {visibleProjects.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">
                  {lang === 'ru' ? 'Объекты:' : 'Şantiye:'}
                </span>
                <button
                  type="button"
                  onClick={() => setFilterProject('all')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                    filterProject === 'all'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border border-emerald-400/70'
                      : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {lang === 'ru' ? 'Все объекты' : 'Tüm Şantiyeler'}
                </button>
                {visibleProjects.map((p) => (
                  <button
                    key={`${p.region}-${p.name}`}
                    type="button"
                    onClick={() => setFilterProject(p.name)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer ${
                      filterProject === p.name
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border border-emerald-400/70'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {p.name} ({p.campCount})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banners */}
      {toastMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-700 text-xs font-bold text-rose-800 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          <p className="text-xs font-semibold text-slate-500">
            {lang === 'ru'
              ? 'Загрузка 3D городков и анализа мест...'
              : 'Kamplar, odalar ve personel verileri analiz ediliyor...'}
          </p>
        </div>
      ) : data && kpis ? (
        <>
          {/* 2. 6 COMPACT EXECUTIVE KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                {lang === 'ru' ? 'Городки и комнаты' : 'Aktif Kamp & Oda'}
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                {kpis.totalCamps}{' '}
                <span className="text-xs font-bold text-slate-400">/ {kpis.totalRooms} Oda</span>
              </p>
              <p className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">
                {kpis.inferredEmptyRoomsCount} {lang === 'ru' ? 'авто-определено' : 'tahmini boş oda'}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                {lang === 'ru' ? 'Общий фонд коек' : 'Toplam Yatak Kapasitesi'}
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                {kpis.totalBedCapacity.toLocaleString('tr-TR')}{' '}
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  %{kpis.occupancyRate}
                </span>
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                {kpis.totalOccupiedBeds} {lang === 'ru' ? 'занято' : 'toplam dolu'}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-emerald-200/80 dark:border-emerald-900/50 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                {lang === 'ru' ? 'Проживает (В штате)' : 'Mevcut Konaklayan'}
              </p>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                {kpis.activeOccupiedBeds.toLocaleString('tr-TR')}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                {lang === 'ru' ? 'Из' : 'Saha toplam'}: {kpis.siteTotalActive.toLocaleString('tr-TR')}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-amber-200/80 dark:border-amber-900/50 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                {lang === 'ru' ? 'Ожид. документы' : 'Evrak Bekleyen / Gelecek'}
              </p>
              <p className="text-lg font-black text-amber-600 dark:text-amber-300 mt-0.5">
                {kpis.standbyOccupiedBeds.toLocaleString('tr-TR')}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                {lang === 'ru' ? 'Всего ожидает' : 'Saha bekleyen'}:{' '}
                {kpis.siteTotalStandby.toLocaleString('tr-TR')}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-300/80 dark:border-emerald-800/70 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                {lang === 'ru' ? 'Свободные места' : 'Müsait Boş Kapasite'}
              </p>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                +{kpis.availableEmptyBeds.toLocaleString('tr-TR')}{' '}
                <span className="text-xs font-bold">{lang === 'ru' ? 'коек' : 'Yatak'}</span>
              </p>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400 font-semibold mt-0.5">
                {kpis.emptyRoomsCount} {lang === 'ru' ? 'полностью пустых комнат' : 'tam boş oda'}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                {lang === 'ru' ? 'Без записи городка' : 'Kamp Kaydı Bekleyen'}
              </p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                {(kpis.unassignedCampActive + kpis.unassignedCampStandby).toLocaleString('tr-TR')}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                {kpis.unassignedCampActive}M + {kpis.unassignedCampStandby}B
              </p>
            </div>
          </div>

          {/* 3. TAB 1: 3D DIGITAL TWIN EXPLORER + ROOM INSPECTOR */}
          {mainTab === 'explorer_3d' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-8">
                <Camp3DVisualizer
                  camps={data.camps}
                  selectedCampId={selectedCamp?.id || null}
                  onSelectCamp={(id) => setSelectedCampId(id)}
                  selectedRoomId={selectedRoom?.id || null}
                  onSelectRoom={(id) => setSelectedRoomId(id)}
                  canManage={canManage}
                  onQuickAddRoom={(camp) => openManageModal('rooms_add', camp.id)}
                />
              </div>

              {/* Right Side: Live Room & Resident Inspector */}
              <div className="xl:col-span-4 space-y-4 xl:sticky xl:top-4">
                <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BedDouble className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                        {selectedRoom
                          ? `${selectedCamp?.campCode} • Oda ${selectedRoom.roomNo}`
                          : lang === 'ru'
                            ? 'Инспектор комнаты'
                            : 'Oda & Yatak Denetçisi'}
                      </h3>
                    </div>
                    {selectedRoom && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        Kat {selectedRoom.floorNo}
                      </span>
                    )}
                  </div>

                  {!selectedRoom ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      İncelemek için soldaki 3D kat kesitinden bir oda seçin.
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {/* Room Capacity & State Bar */}
                      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">
                            Doluluk / Kapasite
                          </p>
                          <p className="text-sm font-black text-slate-900 dark:text-white">
                            {selectedRoom.totalOccupants} / {selectedRoom.capacity} Yatak{' '}
                            {selectedRoom.emptyBeds > 0 && (
                              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                                ({selectedRoom.emptyBeds} Boş)
                              </span>
                            )}
                          </p>
                        </div>

                        {canManage && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={mutating || selectedRoom.capacity <= 1}
                              onClick={() =>
                                runQuickMutation({
                                  action: 'update_room',
                                  roomId: selectedRoom.id,
                                  capacity: Math.max(1, selectedRoom.capacity - 1),
                                })
                              }
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-40"
                              title="Yatak azalt"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={mutating}
                              onClick={() =>
                                runQuickMutation({
                                  action: 'update_room',
                                  roomId: selectedRoom.id,
                                  capacity: selectedRoom.capacity + 1,
                                })
                              }
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"
                              title="Yatak artır"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Admin Quick Controls */}
                      {canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={selectedRoom.status}
                            disabled={mutating}
                            onChange={(e) =>
                              runQuickMutation({
                                action: 'update_room',
                                roomId: selectedRoom.id,
                                status: e.target.value as RoomOperationalStatus,
                              })
                            }
                            className="flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                          >
                            <option value="active">Durum: Aktif Kullanımda</option>
                            <option value="reserved">Durum: Yeni Kafile Rezerveli</option>
                            <option value="maintenance">Durum: Bakım / Temizlikte</option>
                          </select>

                          {selectedRoom.isInferredEmpty && (
                            <button
                              type="button"
                              disabled={mutating}
                              onClick={() =>
                                runQuickMutation({
                                  action: 'update_room',
                                  roomId: selectedRoom.id,
                                  capacity: selectedRoom.capacity,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" />
                              Onayla
                            </button>
                          )}

                          {selectedRoom.totalOccupants === 0 && (
                            <button
                              type="button"
                              disabled={mutating}
                              onClick={() =>
                                runQuickMutation({ action: 'delete_room', roomId: selectedRoom.id })
                              }
                              className="p-1.5 rounded-xl text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 cursor-pointer"
                              title="Odayı Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Bed Slots List */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-extrabold uppercase text-slate-500">
                            Yatak & Konaklayan Detayı
                          </h4>
                          {canManage && selectedCamp && (
                            <button
                              type="button"
                              onClick={() =>
                                openManageModal('assign_person', selectedCamp.id, selectedRoom.roomNo)
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Personel Ekle
                            </button>
                          )}
                        </div>

                        {Array.from({
                          length: Math.max(selectedRoom.capacity, selectedRoom.residents.length),
                        }).map((_, idx) => {
                          const resident = selectedRoom.residents[idx];
                          if (!resident) {
                            return (
                              <div
                                key={`empty-${idx}`}
                                className="px-3 py-2 rounded-xl border border-dashed border-sky-300 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20 flex items-center justify-between gap-2"
                              >
                                <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                                  <BedDouble className="w-3.5 h-3.5" />
                                  Yatak #{idx + 1} — {selectedRoom.status === 'maintenance' ? 'Bakımda' : 'Müsait Boş Yatak'}
                                </span>
                                {canManage && selectedCamp && selectedRoom.status !== 'maintenance' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openManageModal(
                                        'assign_person',
                                        selectedCamp.id,
                                        selectedRoom.roomNo
                                      )
                                    }
                                    className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-[10px] font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 cursor-pointer"
                                  >
                                    + Yerleştir
                                  </button>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={resident.sicilNo}
                              className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 ${
                                resident.statusCategory === 'standby'
                                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300/80 dark:border-amber-800/70'
                                  : 'bg-emerald-50/60 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-800/60'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                    {resident.adSoyad}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500">
                                    #{resident.sicilNo}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      resident.statusCategory === 'standby'
                                        ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200'
                                        : 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/80 dark:text-emerald-200'
                                    }`}
                                  >
                                    {resident.statusCategory === 'standby'
                                      ? resident.guncelDurum || resident.genelDurum
                                      : 'Mevcut'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                  {resident.gorevi} • {resident.uyruk} • {resident.shift}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {onNavigateToPersonnel && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onNavigateToPersonnel({
                                        type: 'search',
                                        value: resident.sicilNo,
                                      })
                                    }
                                    className="p-1 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-white/80 cursor-pointer"
                                    title="Personel Listesinde Gör"
                                  >
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canManage && (
                                  <button
                                    type="button"
                                    disabled={mutating}
                                    onClick={() =>
                                      runQuickMutation({
                                        action: 'unassign_personnel',
                                        sicilNo: resident.sicilNo,
                                      })
                                    }
                                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/60 cursor-pointer"
                                    title="Odadan Çıkar"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Unassigned-Room Residents registered in Selected Camp */}
                {selectedCamp && selectedCamp.unassignedRoomResidents.length > 0 && (
                  <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-amber-300/80 dark:border-amber-800/70 shadow-xs overflow-hidden">
                    <div className="px-4 py-2.5 bg-amber-50/90 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/70 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Bu Kampta Kayıtlı • Oda No Eksik ({selectedCamp.unassignedRoomResidents.length})
                      </span>
                    </div>
                    <div className="p-3 max-h-56 overflow-y-auto space-y-2">
                      {selectedCamp.unassignedRoomResidents.map((res) => (
                        <div
                          key={res.sicilNo}
                          className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {res.adSoyad}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              #{res.sicilNo} • {res.gorevi} • {res.uyruk}
                            </p>
                          </div>
                          {canManage && selectedRoom && (
                            <button
                              type="button"
                              disabled={mutating}
                              onClick={() =>
                                runQuickMutation({
                                  action: 'assign_personnel',
                                  sicilNo: res.sicilNo,
                                  campId: selectedCamp.id,
                                  roomNo: selectedRoom.roomNo,
                                })
                              }
                              className="shrink-0 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Oda {selectedRoom.roomNo}&apos;e Al
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. TAB 2: ANALYTICAL REPORTS */}
          {mainTab === 'analytics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Stacked Camp Capacity Chart */}
                <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      {lang === 'ru'
                        ? 'Сравнение занятых и свободных коек по городкам'
                        : 'Kamp Bazlı Yatak Doluluk & Boş Kapasite Dağılımı'}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Mevcut Konaklayan • Evrak Bekleyen • Müsait Boş Yatak
                    </p>
                  </div>
                  <div className="p-4 h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartCampData} margin={{ top: 10, right: 16, left: -10, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          interval={0}
                          angle={-22}
                          textAnchor="end"
                          height={56}
                        />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="Mevcut" name="Mevcut Dolu" stackId="a" fill="#10b981" />
                        <Bar dataKey="EvrakBekleyen" name="Evrak Bekleyen" stackId="a" fill="#f59e0b" />
                        <Bar
                          dataKey="BosYatak"
                          name="Boş Yatak"
                          stackId="a"
                          fill="#38bdf8"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Nationality Breakdown inside Camps */}
                <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Kampta Kayıtlı Personel Uyruk Dağılımı
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Kültürel ve yemek/oda planlaması için aktif + gelecek uyruk kırılımı
                    </p>
                  </div>
                  <div className="p-4 space-y-2.5 max-h-72 overflow-y-auto">
                    {data.nationalityBreakdown.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">Veri bulunamadı.</p>
                    ) : (
                      data.nationalityBreakdown.map((item) => {
                        const maxTotal = Math.max(1, data.nationalityBreakdown[0]?.total || 1);
                        return (
                          <div key={item.nationality} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-slate-800 dark:text-slate-100">{item.nationality}</span>
                              <span className="text-slate-600 dark:text-slate-300">
                                {item.total} ({item.activeCount}M + {item.standbyCount}B)
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${(item.activeCount / maxTotal) * 100}%` }}
                              />
                              <div
                                className="h-full bg-amber-400"
                                style={{ width: `${(item.standbyCount / maxTotal) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Site-Level Accommodation Readiness & Standby Gap Matrix */}
              <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    Şantiye & Bölge Bazlı Lojman Kapasitesi ve Evrak Bekleyen Personel Hazırlık Analizi
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Sahadaki mevcut kadro + evrak bekleyen/sevke hazır personel karşısında kayıtlı kamp yatak kapasitesi
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Bölge / Şantiye</th>
                        <th className="px-3 py-2.5 font-bold text-right">Kamp / Oda</th>
                        <th className="px-3 py-2.5 font-bold text-right">Yatak Kapasitesi</th>
                        <th className="px-3 py-2.5 font-bold text-right text-emerald-700 dark:text-emerald-400">
                          Mevcut (Kampta / Toplam)
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right text-amber-700 dark:text-amber-400">
                          Evrak Bekleyen (Kampta / Toplam)
                        </th>
                        <th className="px-3 py-2.5 font-bold text-right">Boş Yatak</th>
                        <th className="px-3 py-2.5 font-bold text-right">Kayıtsız Personel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.siteSummaries.map((s) => (
                        <tr
                          key={`${s.region}-${s.projectName}`}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-extrabold text-slate-900 dark:text-white">
                              {s.projectName}
                            </span>
                            <span className="ml-1.5 text-[10px] text-slate-500">({s.region})</span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold">
                            {s.campCount} / {s.totalRooms}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold">{s.totalBedCapacity}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400">
                            {s.assignedActive} / {s.siteTotalActive.toLocaleString('tr-TR')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                            {s.assignedStandby} / {s.siteTotalStandby.toLocaleString('tr-TR')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-extrabold text-sky-700 dark:text-sky-400">
                            +{s.emptyBeds}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-600 dark:text-slate-300">
                            {(s.unassignedActive + s.unassignedStandby).toLocaleString('tr-TR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. TAB 3: SEARCHABLE ROOMS & PERSONNEL TABLES */}
          {mainTab === 'tables' && (
            <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5">
                <div className="inline-flex rounded-xl p-0.5 bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      { id: 'rooms', label: `Oda Doluluk Listesi (${flatRoomList.length})` },
                      {
                        id: 'residents',
                        label: `Kampta Kayıtlılar (${data.allCampResidents.length})`,
                      },
                      {
                        id: 'unassigned',
                        label: `Kamp Ataması Bekleyenler (${kpis.unassignedCampActive + kpis.unassignedCampStandby})`,
                      },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setListSubTab(st.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        listSubTab === st.id
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Ara (Ad, Sicil, Kamp, Oda)..."
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-56"
                    />
                  </div>
                  <select
                    value={tableStatusFilter}
                    onChange={(e) =>
                      setTableStatusFilter(e.target.value as 'all' | 'active' | 'standby')
                    }
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="all">Tümü (Mevcut + Bekleyen)</option>
                    <option value="active">Sadece Mevcut</option>
                    <option value="standby">Sadece Evrak Bekleyen</option>
                  </select>
                </div>
              </div>

              {listSubTab === 'rooms' ? (
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Bölge / Şantiye</th>
                        <th className="px-3 py-2.5 font-bold">Kamp No</th>
                        <th className="px-3 py-2.5 font-bold">Oda No</th>
                        <th className="px-3 py-2.5 font-bold">Durum</th>
                        <th className="px-3 py-2.5 font-bold text-right">Dolu / Kapasite</th>
                        <th className="px-3 py-2.5 font-bold text-right">Boş Yatak</th>
                        <th className="px-4 py-2.5 font-bold">Konaklayanlar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {flatRoomList.slice(0, 250).map(({ camp, room }) => (
                        <tr key={room.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                            <span className="font-bold">{camp.projectName}</span>
                            <span className="ml-1 text-[10px] text-slate-400">({camp.region})</span>
                          </td>
                          <td className="px-3 py-2 font-extrabold text-slate-900 dark:text-white">
                            {camp.campCode}
                          </td>
                          <td className="px-3 py-2 font-bold">
                            Oda {room.roomNo}{' '}
                            <span className="text-[10px] text-slate-400">(Kat {room.floorNo})</span>
                          </td>
                          <td className="px-3 py-2">
                            {room.status === 'maintenance' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 inline-flex items-center gap-1">
                                <Wrench className="w-3 h-3" /> Bakımda
                              </span>
                            ) : room.overCapacityBeds > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Kapasite Aşımı
                              </span>
                            ) : room.emptyBeds > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                {room.isInferredEmpty ? 'Tahmini Boş' : 'Müsait'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">
                                Tam Dolu
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">
                            {room.activeCount}M + {room.standbyCount}B / {room.capacity}
                          </td>
                          <td className="px-3 py-2 text-right font-extrabold text-emerald-700 dark:text-emerald-400">
                            +{room.emptyBeds}
                          </td>
                          <td className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300">
                            {room.residents.length > 0
                              ? room.residents.map((p) => `${p.adSoyad} (${p.uyruk})`).join(', ')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2.5 font-bold">Sicil</th>
                        <th className="px-3 py-2.5 font-bold">Ad Soyad</th>
                        <th className="px-3 py-2.5 font-bold">Statü</th>
                        <th className="px-3 py-2.5 font-bold">Bölge / Şantiye</th>
                        <th className="px-3 py-2.5 font-bold">Kamp / Oda</th>
                        <th className="px-3 py-2.5 font-bold">Görevi & Uyruk</th>
                        {canManage && <th className="px-4 py-2.5 font-bold text-right">İşlem</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredResidentsList.slice(0, 250).map((p) => (
                        <tr key={p.sicilNo} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-4 py-2 font-mono text-slate-500">{p.sicilNo}</td>
                          <td className="px-3 py-2 font-extrabold text-slate-900 dark:text-white">
                            {p.adSoyad}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.statusCategory === 'standby'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200'
                              }`}
                            >
                              {p.statusCategory === 'standby' ? p.guncelDurum || p.genelDurum : 'Mevcut'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {p.projectName} <span className="text-[10px] text-slate-400">({p.region})</span>
                          </td>
                          <td className="px-3 py-2 font-bold">
                            {p.campCode ? `${p.campCode} / ${p.roomNo || 'Oda Yok'}` : 'Atanmamış'}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                            {p.gorevi} • {p.uyruk}
                          </td>
                          {canManage && (
                            <td className="px-4 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => openManageModal('assign_person', selectedCamp?.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60 text-[10px] font-bold cursor-pointer"
                              >
                                Oda Ata / Değiştir
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      {/* 6. İDARİ İŞLER KAMP & ODA KAPASİTE YÖNETİM MODALI */}
      {data && canManage && (
        <CampAdminModal
          isOpen={adminOpen}
          onClose={() => setAdminOpen(false)}
          initialTab={adminTab}
          initialCampId={adminCampId}
          initialRoomNo={adminRoomNo}
          payload={data}
          filterRegion={filterRegion}
          filterProject={filterProject}
          onMutated={(nextPayload, message, createdCampId) => {
            setData((prev) =>
              prev
                ? { ...nextPayload, success: true, canManage: true }
                : (nextPayload as CampsApiResponse)
            );
            if (createdCampId) setSelectedCampId(createdCampId);
            if (message) showToast(message);
          }}
        />
      )}
    </div>
  );
}
