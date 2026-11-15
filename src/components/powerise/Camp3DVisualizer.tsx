'use client';

import React, { useMemo, useState } from 'react';
import {
  Building2,
  BedDouble,
  Layers,
  Sparkles,
  Wrench,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Box,
  LayoutGrid,
} from 'lucide-react';
import { CampDefinitionDetail, CampRoomDetail } from '@/lib/campManager';
import { useLanguage } from '@/context/LanguageContext';

interface Camp3DVisualizerProps {
  camps: CampDefinitionDetail[];
  selectedCampId: number | null;
  onSelectCamp: (campId: number) => void;
  selectedRoomId: number | null;
  onSelectRoom: (roomId: number) => void;
  canManage?: boolean;
  onQuickAddRoom?: (camp: CampDefinitionDetail) => void;
}

type CampusViewMode = 'isometric_3d' | 'compact_cards';
type FloorViewMode = 'cutaway_3d' | 'flat_2d';
type RoomFilterMode = 'all' | 'has_space' | 'empty_only' | 'occupied_or_full' | 'standby';

export default function Camp3DVisualizer({
  camps,
  selectedCampId,
  onSelectCamp,
  selectedRoomId,
  onSelectRoom,
  canManage = false,
  onQuickAddRoom,
}: Camp3DVisualizerProps) {
  const { lang } = useLanguage();
  const [campusViewMode, setCampusViewMode] = useState<CampusViewMode>('isometric_3d');
  const [floorViewMode, setFloorViewMode] = useState<FloorViewMode>('cutaway_3d');
  const [campusSearch, setCampusSearch] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [roomFilter, setRoomFilter] = useState<RoomFilterMode>('all');

  const filteredCampusList = useMemo(() => {
    const q = campusSearch.trim().toLowerCase();
    if (!q) return camps;
    return camps.filter(
      (c) =>
        c.campCode.toLowerCase().includes(q) ||
        c.campName.toLowerCase().includes(q) ||
        c.projectName.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q)
    );
  }, [camps, campusSearch]);

  const selectedCamp = useMemo(() => {
    if (!camps.length) return null;
    return camps.find((c) => c.id === selectedCampId) || camps[0];
  }, [camps, selectedCampId]);

  const floors = useMemo(() => {
    if (!selectedCamp) return [];
    const map = new Map<number, CampRoomDetail[]>();
    for (const r of selectedCamp.rooms) {
      const f = r.floorNo || 1;
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([floorNo, rooms]) => ({ floorNo, rooms }));
  }, [selectedCamp]);

  const filterRoomMatch = (r: CampRoomDetail): boolean => {
    if (roomFilter === 'has_space') return r.emptyBeds > 0 && r.status !== 'maintenance';
    if (roomFilter === 'empty_only') return r.totalOccupants === 0 && r.status !== 'maintenance';
    if (roomFilter === 'occupied_or_full') return r.totalOccupants > 0 || r.occupancyState === 'maintenance';
    if (roomFilter === 'standby') return r.standbyCount > 0;
    return true;
  };

  const visibleFloors = useMemo(() => {
    return floors
      .filter((fl) => selectedFloor === 'all' || fl.floorNo === selectedFloor)
      .map((fl) => ({
        floorNo: fl.floorNo,
        rooms: fl.rooms.filter(filterRoomMatch),
      }))
      .filter((fl) => fl.rooms.length > 0);
  }, [floors, selectedFloor, roomFilter]);

  const getCampTheme = (camp: CampDefinitionDetail) => {
    if (camp.overCapacityBeds > 0) {
      return {
        roof: '#f43f5e',
        leftWall: '#e11d48',
        rightWall: '#9f1239',
        border: 'border-rose-400/70 dark:border-rose-500/60',
        pill: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200',
      };
    }
    if (camp.standbyOccupants > 0 && camp.activeOccupants === 0) {
      return {
        roof: '#f59e0b',
        leftWall: '#d97706',
        rightWall: '#92400e',
        border: 'border-amber-400/70 dark:border-amber-500/60',
        pill: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200',
      };
    }
    if (camp.campType === 'staff') {
      return {
        roof: '#6366f1',
        leftWall: '#4f46e5',
        rightWall: '#312e81',
        border: 'border-indigo-400/60 dark:border-indigo-500/50',
        pill: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200',
      };
    }
    if (camp.occupancyRate >= 75) {
      return {
        roof: '#14b8a6',
        leftWall: '#0d9488',
        rightWall: '#115e59',
        border: 'border-teal-400/60 dark:border-teal-500/50',
        pill: 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-200',
      };
    }
    return {
      roof: '#10b981',
      leftWall: '#059669',
      rightWall: '#065f46',
      border: 'border-emerald-400/60 dark:border-emerald-500/50',
      pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200',
    };
  };

  return (
    <div className="space-y-4">
      {/* SECTION A: 3D ISOMETRIC CAMPUS MASTERPLAN */}
      <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-teal-500/20 shrink-0">
              <Box className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-tight">
                {lang === 'ru'
                  ? '3D Интерактивный макет городка и корпусов'
                  : '3D İnteraktif Kampüs Maketi & Blok Yerleşimi'}
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {lang === 'ru'
                  ? 'Нажмите на любой 3D корпус, чтобы открыть поэтажный план комнат и свободных коек'
                  : 'Kat planını ve boş yatakları incelemek için herhangi bir 3D kamp bloğuna tıklayın'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={campusSearch}
                onChange={(e) => setCampusSearch(e.target.value)}
                placeholder={lang === 'ru' ? 'Поиск блока...' : 'Kamp / blok ara...'}
                className="pl-7 pr-2.5 py-1 text-[11px] rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setCampusViewMode('isometric_3d')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  campusViewMode === 'isometric_3d'
                    ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                <Box className="w-3 h-3" />
                <span>3D Maket</span>
              </button>
              <button
                type="button"
                onClick={() => setCampusViewMode('compact_cards')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  campusViewMode === 'compact_cards'
                    ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>Liste Grid</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3D Architectural Grid Stage */}
        <div
          className="p-3 sm:p-4 max-h-[410px] overflow-y-auto relative bg-slate-50/70 dark:bg-[#080E1C]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.22) 1px, transparent 0)',
            backgroundSize: '20px 20px',
          }}
        >
          {filteredCampusList.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ru'
                ? 'В выбранном фильтре нет зарегистрированных городков.'
                : 'Seçilen bölgede / şantiyede kayıtlı kamp bulunamadı.'}
            </div>
          ) : campusViewMode === 'isometric_3d' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredCampusList.map((camp) => {
                const isSelected = selectedCamp?.id === camp.id;
                const theme = getCampTheme(camp);
                const stories = Math.min(4, Math.max(1, camp.floorsCount));
                const buildingHeight = 42 + stories * 14;
                const sampleWindows = camp.rooms.slice(0, 12);

                return (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => {
                      onSelectCamp(camp.id);
                      setSelectedFloor('all');
                    }}
                    className={`group text-left rounded-2xl p-3 transition-all cursor-pointer relative overflow-hidden border ${
                      isSelected
                        ? 'bg-white dark:bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/35 shadow-lg shadow-emerald-500/15 -translate-y-0.5'
                        : 'bg-white/95 dark:bg-slate-900/85 border-slate-200/90 dark:border-slate-800 hover:border-emerald-400/70 hover:-translate-y-0.5 hover:shadow-md'
                    }`}
                  >
                    {/* Top Floating Status Strip */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {camp.campCode}
                          </span>
                          {camp.isAutoSeeded && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
                              Auto
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                          {camp.projectName}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          camp.availableBeds > 0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {camp.availableBeds > 0
                          ? `+${camp.availableBeds} ${lang === 'ru' ? 'своб.' : 'Boş'}`
                          : lang === 'ru'
                            ? 'Полный'
                            : 'Dolu'}
                      </span>
                    </div>

                    {/* Isometric 3D Architectural SVG Model */}
                    <div className="flex items-center justify-center py-1 relative">
                      <svg
                        viewBox="0 0 180 112"
                        className="w-full h-24 drop-shadow-sm transition-transform duration-300 group-hover:scale-[1.03]"
                        aria-label={camp.campCode}
                      >
                        <defs>
                          <linearGradient id={`shadow-${camp.id}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="rgba(15,23,42,0.22)" />
                            <stop offset="100%" stopColor="rgba(15,23,42,0.03)" />
                          </linearGradient>
                        </defs>
                        {/* Ground Blueprint Pad */}
                        <polygon
                          points="14,90 90,108 168,86 92,68"
                          fill={`url(#shadow-${camp.id})`}
                        />

                        {/* Left Facade (Front Face with Room Windows) */}
                        <polygon
                          points={`26,${88 - buildingHeight} 92,${104 - buildingHeight} 92,104 26,88`}
                          fill={theme.leftWall}
                        />
                        {/* Right Side Extrusion Wall */}
                        <polygon
                          points={`92,${104 - buildingHeight} 154,${86 - buildingHeight} 154,86 92,104`}
                          fill={theme.rightWall}
                        />
                        {/* Isometric Roof Slab */}
                        <polygon
                          points={`24,${88 - buildingHeight} 88,${70 - buildingHeight} 156,${86 - buildingHeight} 92,${104 - buildingHeight}`}
                          fill={theme.roof}
                        />
                        {/* Rooftop HVAC / Structural Detail */}
                        <polygon
                          points={`68,${81 - buildingHeight} 92,${75 - buildingHeight} 112,${80 - buildingHeight} 88,${86 - buildingHeight}`}
                          fill="rgba(255,255,255,0.28)"
                        />

                        {/* Illuminated Room Windows on Front Facade */}
                        {Array.from({ length: Math.min(12, Math.max(4, sampleWindows.length)) }).map((_, idx) => {
                          const col = idx % 4;
                          const row = Math.floor(idx / 4);
                          if (row >= stories) return null;
                          const rm = sampleWindows[idx];
                          const x0 = 33 + col * 14;
                          const yOffset = col * 3.4;
                          const y0 = 91 - buildingHeight + row * 13 + yOffset;
                          let winColor = 'rgba(226,232,240,0.45)'; // empty room (translucent)
                          if (rm) {
                            if (rm.occupancyState === 'over_capacity') winColor = '#fda4af';
                            else if (rm.standbyCount > 0 && rm.activeCount === 0) winColor = '#fcd34d';
                            else if (rm.activeCount > 0 && rm.standbyCount > 0) winColor = '#6ee7b7';
                            else if (rm.totalOccupants > 0) winColor = '#ffffff';
                            else if (rm.occupancyState === 'maintenance') winColor = '#94a3b8';
                            else winColor = 'rgba(186,230,253,0.45)';
                          }
                          return (
                            <polygon
                              key={idx}
                              points={`${x0},${y0} ${x0 + 9},${y0 + 2.1} ${x0 + 9},${y0 + 9.1} ${x0},${y0 + 7}`}
                              fill={winColor}
                              stroke="rgba(15,23,42,0.18)"
                              strokeWidth="0.6"
                            />
                          );
                        })}

                        {/* Side Facade Vertical Lines */}
                        {Array.from({ length: 3 }).map((_, sIdx) => {
                          const x = 108 + sIdx * 15;
                          const yTop = 99 - buildingHeight - sIdx * 4.4;
                          return (
                            <line
                              key={sIdx}
                              x1={x}
                              y1={yTop}
                              x2={x}
                              y2={yTop + buildingHeight - 4}
                              stroke="rgba(255,255,255,0.2)"
                              strokeWidth="1"
                            />
                          );
                        })}
                      </svg>
                    </div>

                    {/* Occupancy Footer Bar */}
                    <div className="space-y-1.5 mt-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {camp.totalOccupants}/{camp.totalCapacity} {lang === 'ru' ? 'коек' : 'Yatak'}
                          {camp.standbyOccupants > 0 && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400 font-extrabold">
                              ({camp.standbyOccupants} {lang === 'ru' ? 'ожид.' : 'bekl.'})
                            </span>
                          )}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">
                          {camp.totalRooms} {lang === 'ru' ? 'комн.' : 'Oda'} • %{camp.occupancyRate}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{
                            width: `${camp.totalCapacity > 0 ? Math.min(100, (camp.activeOccupants / camp.totalCapacity) * 100) : 0}%`,
                          }}
                        />
                        <div
                          className="h-full bg-amber-400 transition-all"
                          style={{
                            width: `${camp.totalCapacity > 0 ? Math.min(100, (camp.standbyOccupants / camp.totalCapacity) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredCampusList.map((camp) => {
                const isSelected = selectedCamp?.id === camp.id;
                return (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => {
                      onSelectCamp(camp.id);
                      setSelectedFloor('all');
                    }}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {camp.campCode}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        +{camp.availableBeds} Boş
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {camp.region} • {camp.projectName}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span>
                        {camp.totalRooms} Oda ({camp.emptyRooms} Boş)
                      </span>
                      <span>
                        {camp.activeOccupants}M + {camp.standbyOccupants}B / {camp.totalCapacity}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION B: SELECTED CAMP 3D FLOOR CUTAWAY & INTERACTIVE BED MATRIX */}
      {selectedCamp && (
        <div className="rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                    {selectedCamp.campCode} — {selectedCamp.campName}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    {selectedCamp.region} / {selectedCamp.projectName}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  {selectedCamp.totalRooms} {lang === 'ru' ? 'комнат' : 'Oda'} •{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    {selectedCamp.availableBeds} {lang === 'ru' ? 'свободных коек' : 'Boş Yatak'}
                  </strong>{' '}
                  • {selectedCamp.activeOccupants} {lang === 'ru' ? 'в штате' : 'Mevcut'} +{' '}
                  {selectedCamp.standbyOccupants} {lang === 'ru' ? 'ожид. документы' : 'Evrak Bekleyen'}
                  {selectedCamp.campUnassignedRoomOccupants > 0 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400 font-bold">
                      • {selectedCamp.campUnassignedRoomOccupants}{' '}
                      {lang === 'ru' ? 'без номера комнаты' : 'Oda No Bekleyen'}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canManage && onQuickAddRoom && (
                <button
                  type="button"
                  onClick={() => onQuickAddRoom(selectedCamp)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'ru' ? 'Добавить комнаты' : 'Oda / Kapasite Ekle'}</span>
                </button>
              )}

              <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setFloorViewMode('cutaway_3d')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                    floorViewMode === 'cutaway_3d'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  3D Kat Kesiti
                </button>
                <button
                  type="button"
                  onClick={() => setFloorViewMode('flat_2d')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                    floorViewMode === 'flat_2d'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  2D Plan
                </button>
              </div>
            </div>
          </div>

          {/* Floor & Room Filter Bar + Legend */}
          <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedFloor('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  selectedFloor === 'all'
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {lang === 'ru' ? 'Все этажи' : 'Tüm Katlar'}
              </button>
              {floors.map((fl) => (
                <button
                  key={fl.floorNo}
                  type="button"
                  onClick={() => setSelectedFloor(fl.floorNo)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    selectedFloor === fl.floorNo
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {lang === 'ru' ? `Этаж ${fl.floorNo}` : `Kat ${fl.floorNo}`} ({fl.rooms.length})
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', labelTr: 'Tümü', labelRu: 'Все' },
                  { id: 'has_space', labelTr: 'Boş Yeri Var', labelRu: 'Есть места' },
                  { id: 'empty_only', labelTr: 'Tamamen Boş', labelRu: 'Пустые' },
                  { id: 'occupied_or_full', labelTr: 'Dolu / Kısmi', labelRu: 'Занятые' },
                  { id: 'standby', labelTr: 'Evrak Bekleyenli', labelRu: 'С ожиданием' },
                ] as { id: RoomFilterMode; labelTr: string; labelRu: string }[]
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setRoomFilter(pill.id)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                    roomFilter === pill.id
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200 border border-emerald-400/70'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {lang === 'ru' ? pill.labelRu : pill.labelTr}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Bed Legend */}
          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-4 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-emerald-500 inline-block" />
              {lang === 'ru' ? 'Занято (В штате)' : 'Dolu Yatak (Mevcut)'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-amber-400 inline-block" />
              {lang === 'ru' ? 'Занято (Ожид. документы)' : 'Evrak Bekleyen / Gelecek'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs border border-dashed border-sky-500 bg-sky-50 dark:bg-sky-950/40 inline-block" />
              {lang === 'ru' ? 'Свободная койка' : 'Müsait Boş Yatak'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-rose-500 inline-block" />
              {lang === 'ru' ? 'Перегруз' : 'Kapasite Aşımı'}
            </span>
            {selectedCamp.inferredRooms > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
                <Sparkles className="w-3 h-3" />
                {selectedCamp.inferredRooms}{' '}
                {lang === 'ru'
                  ? 'пустых комнат определены автоматически по нумерации'
                  : 'boş oda sıra no mantığıyla otomatik tahmin edildi'}
              </span>
            )}
          </div>

          {/* 3D Floor Cutaway Slabs */}
          <div className="p-3 sm:p-4 space-y-5 bg-gradient-to-b from-slate-50/70 to-white dark:from-[#080E1C] dark:to-[#0F172A]">
            {visibleFloors.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ru'
                  ? 'По выбранному фильтру комнат не найдено.'
                  : 'Seçilen filtreye uygun oda bulunamadı.'}
              </div>
            ) : (
              visibleFloors.map((floor) => {
                const floorOcc = floor.rooms.reduce((s, r) => s + r.totalOccupants, 0);
                const floorCap = floor.rooms.reduce((s, r) => s + r.capacity, 0);
                const floorEmpty = floor.rooms.reduce((s, r) => s + r.emptyBeds, 0);

                return (
                  <div
                    key={floor.floorNo}
                    className="relative"
                    style={
                      floorViewMode === 'cutaway_3d'
                        ? { perspective: '1200px' }
                        : undefined
                    }
                  >
                    {/* Floor Slab Header Strip */}
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-900 text-white dark:bg-emerald-950/90 dark:text-emerald-300 border border-slate-700 dark:border-emerald-700/60 shadow-2xs">
                          <Layers className="w-3 h-3" />
                          {lang === 'ru' ? `Этаж ${floor.floorNo}` : `Kat ${floor.floorNo}`}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {floor.rooms.length} {lang === 'ru' ? 'комн.' : 'Oda'} • {floorOcc}/{floorCap}{' '}
                          {lang === 'ru' ? 'занято' : 'Dolu'}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        +{floorEmpty} {lang === 'ru' ? 'свободных коек' : 'Boş Yatak'}
                      </span>
                    </div>

                    {/* 3D Slab Plate */}
                    <div
                      className={`rounded-2xl p-3 border transition-transform duration-300 ${
                        floorViewMode === 'cutaway_3d'
                          ? 'bg-gradient-to-br from-white via-slate-50 to-slate-100/90 dark:from-[#121D33] dark:via-[#0F172A] dark:to-[#0A1120] border-slate-300/80 dark:border-slate-700/90 shadow-[0_8px_0_0_rgba(148,163,184,0.28),0_14px_24px_-8px_rgba(15,23,42,0.16)] dark:shadow-[0_8px_0_0_rgba(15,23,42,0.9),0_16px_28px_-6px_rgba(0,0,0,0.65)]'
                          : 'bg-slate-50/90 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                      }`}
                      style={
                        floorViewMode === 'cutaway_3d'
                          ? { transform: 'rotateX(7deg)', transformStyle: 'preserve-3d' }
                          : undefined
                      }
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                        {floor.rooms.map((room) => {
                          const isRoomSelected = selectedRoomId === room.id;
                          const displayCap = Math.min(8, room.capacity);
                          const slots: Array<'active' | 'standby' | 'empty' | 'over'> = [];
                          const maxSlots = Math.min(10, Math.max(displayCap, room.totalOccupants));

                          for (let i = 0; i < maxSlots; i++) {
                            if (i < room.activeCount) {
                              slots.push(i >= room.capacity ? 'over' : 'active');
                            } else if (i < room.activeCount + room.standbyCount) {
                              slots.push(i >= room.capacity ? 'over' : 'standby');
                            } else {
                              slots.push('empty');
                            }
                          }

                          const stateStyle =
                            room.occupancyState === 'maintenance'
                              ? 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-600'
                              : room.occupancyState === 'over_capacity'
                                ? 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-400 dark:border-rose-600'
                                : room.occupancyState === 'full'
                                  ? 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                                  : room.occupancyState === 'partial'
                                    ? 'bg-amber-50/60 dark:bg-amber-950/25 border-amber-300 dark:border-amber-700/70'
                                    : room.occupancyState === 'reserved'
                                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700'
                                      : 'bg-white dark:bg-slate-900/90 border-dashed border-sky-300 dark:border-sky-700/70';

                          return (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => onSelectRoom(room.id)}
                              className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer relative ${stateStyle} ${
                                floorViewMode === 'cutaway_3d'
                                  ? 'shadow-[0_4px_0_0_rgba(148,163,184,0.3)] dark:shadow-[0_4px_0_0_rgba(2,6,23,0.85)] hover:-translate-y-0.5'
                                  : 'hover:shadow-sm'
                              } ${
                                isRoomSelected
                                  ? 'ring-2 ring-emerald-500 border-emerald-500 shadow-md -translate-y-0.5'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1">
                                  <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                                  {room.roomNo}
                                </span>
                                {room.occupancyState === 'maintenance' ? (
                                  <Wrench className="w-3 h-3 text-slate-500" />
                                ) : room.occupancyState === 'over_capacity' ? (
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                ) : room.isInferredEmpty ? (
                                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/70 dark:text-sky-300">
                                    Tahmin
                                  </span>
                                ) : room.standbyCount > 0 ? (
                                  <Clock className="w-3 h-3 text-amber-500" />
                                ) : room.totalOccupants > 0 ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : null}
                              </div>

                              {/* Visual Bed Pips Matrix */}
                              <div className="grid grid-cols-4 gap-1 my-1.5">
                                {slots.map((slot, idx) => (
                                  <div
                                    key={idx}
                                    title={
                                      slot === 'active'
                                        ? 'Mevcut'
                                        : slot === 'standby'
                                          ? 'Evrak Bekleyen'
                                          : slot === 'over'
                                            ? 'Kapasite Aşımı'
                                            : 'Boş Yatak'
                                    }
                                    className={`h-2.5 rounded-xs ${
                                      slot === 'active'
                                        ? 'bg-emerald-500'
                                        : slot === 'standby'
                                          ? 'bg-amber-400'
                                          : slot === 'over'
                                            ? 'bg-rose-500 animate-pulse'
                                            : 'border border-dashed border-sky-400/80 dark:border-sky-600 bg-sky-50/70 dark:bg-sky-950/30'
                                    }`}
                                  />
                                ))}
                              </div>

                              <div className="flex items-center justify-between text-[10px] font-bold mt-1">
                                <span className="text-slate-600 dark:text-slate-300">
                                  {room.totalOccupants}/{room.capacity}
                                </span>
                                <span
                                  className={
                                    room.occupancyState === 'maintenance'
                                      ? 'text-slate-500'
                                      : room.overCapacityBeds > 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : room.emptyBeds > 0
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-teal-700 dark:text-teal-300'
                                  }
                                >
                                  {room.occupancyState === 'maintenance'
                                    ? lang === 'ru'
                                      ? 'Ремонт'
                                      : 'Bakım'
                                    : room.overCapacityBeds > 0
                                      ? `+${room.overCapacityBeds} Aşım`
                                      : room.emptyBeds > 0
                                        ? `${room.emptyBeds} ${lang === 'ru' ? 'св.' : 'Boş'}`
                                        : lang === 'ru'
                                          ? 'Занят'
                                          : 'Tam'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
