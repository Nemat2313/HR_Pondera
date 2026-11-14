'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  Crown,
  Download,
  Eye,
  Folder,
  FolderOpen,
  GitBranch,
  HardHat,
  Info,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Scan,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import PersonnelDetailDrawer from '@/components/personnel/PersonnelDetailDrawer';
import JobTitleLevelModal, {
  type JobLevelItemDto,
} from '@/components/org-chart/JobTitleLevelModal';
import type { OrgRawPerson } from '@/app/api/org-chart/route';
import {
  buildOrganizationHierarchy,
  type OrgHierarchyMode,
  type OrgNode,
  type OrgRoleLevel,
} from '@/lib/orgChartBuilder';
import type { PersonnelRecord } from '@/types';

interface RoleLevelVisualTheme {
  level: OrgRoleLevel;
  code: string;
  shortTr: string;
  shortRu: string;
  rowTitleTr: string;
  rowTitleRu: string;
  cardSurface: string;
  cardBorder: string;
  leftAccent: string;
  topRibbon: string;
  avatarBg: string;
  avatarText: string;
  badgeBg: string;
  badgeText: string;
  titleColor: string;
  subColor: string;
  swimlaneBg: string;
  swimlanePill: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ROLE_LEVEL_THEMES: Record<OrgRoleLevel, RoleLevelVisualTheme> = {
  1: {
    level: 1,
    code: 'L1',
    shortTr: 'Başkan',
    shortRu: 'Председатель',
    rowTitleTr: 'Yönetim Kurulu & Başkan',
    rowTitleRu: 'Председатель правления',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-amber-50/45 to-amber-100/80 dark:from-[#2c3a54] dark:via-[#263249] dark:to-[#3b301c]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-amber-500 dark:border-b-amber-400',
    leftAccent: '',
    topRibbon: 'from-amber-500 via-yellow-400 to-amber-600',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-xs',
    avatarText: 'text-white',
    badgeBg: 'bg-amber-100/90 dark:bg-amber-500/20 border border-amber-300/80 dark:border-amber-400/50',
    badgeText: 'text-amber-800 dark:text-amber-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-amber-700 dark:text-amber-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-500/70',
    icon: Crown,
  },
  2: {
    level: 2,
    code: 'L2',
    shortTr: 'CEO & Genel Müdür',
    shortRu: 'CEO и Ген. директор',
    rowTitleTr: 'CEO / COO & Genel Müdür',
    rowTitleRu: 'CEO / COO и Ген. директор',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-purple-50/45 to-purple-100/80 dark:from-[#2c3a54] dark:via-[#26314a] dark:to-[#33214a]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-purple-500 dark:border-b-purple-400',
    leftAccent: '',
    topRibbon: 'from-purple-600 via-fuchsia-500 to-indigo-500',
    avatarBg: 'bg-gradient-to-br from-purple-600 to-fuchsia-600 shadow-xs',
    avatarText: 'text-white',
    badgeBg: 'bg-purple-100/90 dark:bg-purple-500/20 border border-purple-300/80 dark:border-purple-400/50',
    badgeText: 'text-purple-800 dark:text-purple-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-purple-700 dark:text-purple-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-500/70',
    icon: Crown,
  },
  3: {
    level: 3,
    code: 'L3',
    shortTr: 'Direktör',
    shortRu: 'Директора',
    rowTitleTr: 'Direktör & Koordinatör',
    rowTitleRu: 'Директора и координаторы',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-indigo-50/45 to-indigo-100/80 dark:from-[#2c3a54] dark:via-[#25314b] dark:to-[#242852]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-indigo-500 dark:border-b-indigo-400',
    leftAccent: '',
    topRibbon: 'from-indigo-600 via-violet-500 to-indigo-600',
    avatarBg: 'bg-gradient-to-br from-indigo-600 to-violet-600',
    avatarText: 'text-white',
    badgeBg: 'bg-indigo-100/85 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/50',
    badgeText: 'text-indigo-700 dark:text-indigo-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-indigo-700 dark:text-indigo-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-indigo-700 dark:text-indigo-200 border-indigo-300 dark:border-indigo-500/70',
    icon: Building2,
  },
  4: {
    level: 4,
    code: 'L4',
    shortTr: 'Müdür & Şantiye Şefi',
    shortRu: 'Руководители',
    rowTitleTr: 'Müdür & Şantiye Lideri',
    rowTitleRu: 'Руководители проектов и отделов',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-blue-50/45 to-blue-100/80 dark:from-[#2c3a54] dark:via-[#23314c] dark:to-[#193252]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-blue-500 dark:border-b-sky-400',
    leftAccent: '',
    topRibbon: 'from-blue-600 via-sky-500 to-blue-600',
    avatarBg: 'bg-gradient-to-br from-blue-600 to-sky-600',
    avatarText: 'text-white',
    badgeBg: 'bg-blue-100/85 dark:bg-sky-500/20 border border-blue-200 dark:border-sky-400/50',
    badgeText: 'text-blue-700 dark:text-sky-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-blue-700 dark:text-sky-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-blue-700 dark:text-sky-200 border-blue-300 dark:border-sky-500/70',
    icon: Building2,
  },
  5: {
    level: 5,
    code: 'L5',
    shortTr: 'Grup & Kısım Şefi',
    shortRu: 'Начальники групп',
    rowTitleTr: 'Grup, Kısım & Birim Şefi',
    rowTitleRu: 'Начальники групп и участков',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-emerald-50/45 to-emerald-100/80 dark:from-[#2c3a54] dark:via-[#223349] dark:to-[#163832]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-emerald-500 dark:border-b-emerald-400',
    leftAccent: '',
    topRibbon: 'from-emerald-500 via-teal-500 to-cyan-500',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    avatarText: 'text-white',
    badgeBg: 'bg-emerald-100/85 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-400/50',
    badgeText: 'text-emerald-700 dark:text-emerald-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-emerald-700 dark:text-emerald-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-emerald-700 dark:text-emerald-200 border-emerald-300 dark:border-emerald-500/70',
    icon: Layers,
  },
  6: {
    level: 6,
    code: 'L6',
    shortTr: 'Mühendis & Uzman',
    shortRu: 'Инженеры и спец.',
    rowTitleTr: 'Mühendis, Uzman & Memur',
    rowTitleRu: 'Инженеры и специалисты',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-sky-50/45 to-sky-100/80 dark:from-[#2c3a54] dark:via-[#21324a] dark:to-[#16354a]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-sky-500 dark:border-b-cyan-400',
    leftAccent: '',
    topRibbon: 'from-sky-500 to-cyan-500',
    avatarBg: 'bg-gradient-to-br from-sky-500 to-cyan-600',
    avatarText: 'text-white',
    badgeBg: 'bg-sky-100/85 dark:bg-cyan-500/20 border border-sky-200 dark:border-cyan-400/50',
    badgeText: 'text-sky-700 dark:text-cyan-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-sky-700 dark:text-cyan-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-sky-700 dark:text-cyan-200 border-sky-300 dark:border-cyan-500/70',
    icon: Compass,
  },
  7: {
    level: 7,
    code: 'L7',
    shortTr: 'Formen & Sorumlu',
    shortRu: 'Формены',
    rowTitleTr: 'Formen & Saha Sorumlusu',
    rowTitleRu: 'Формены и ответственные',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-orange-50/45 to-orange-100/80 dark:from-[#2c3a54] dark:via-[#283148] dark:to-[#3d291b]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-orange-500 dark:border-b-orange-400',
    leftAccent: '',
    topRibbon: 'from-amber-500 to-orange-500',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    avatarText: 'text-white',
    badgeBg: 'bg-orange-100/85 dark:bg-orange-500/20 border border-orange-300 dark:border-orange-400/50',
    badgeText: 'text-orange-800 dark:text-orange-200',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-orange-700 dark:text-orange-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-500/70',
    icon: HardHat,
  },
  8: {
    level: 8,
    code: 'L8',
    shortTr: 'Saha İşçileri (Liste)',
    shortRu: 'Рабочие (Список)',
    rowTitleTr: 'Saha Ekip & İşçi Kadrosu',
    rowTitleRu: 'Рабочий персонал (Бригады)',
    cardSurface:
      'bg-gradient-to-b from-[#ffffff] via-slate-100/60 to-slate-200/85 dark:from-[#2a3750] dark:via-[#222d42] dark:to-[#283448]',
    cardBorder:
      'border-2 border-white dark:border-slate-500/80 border-b-[4px] border-b-slate-500 dark:border-b-slate-400',
    leftAccent: '',
    topRibbon: 'from-slate-500 to-teal-600',
    avatarBg: 'bg-slate-600',
    avatarText: 'text-white',
    badgeBg: 'bg-slate-200/85 dark:bg-slate-700/80 border border-slate-300 dark:border-slate-500/60',
    badgeText: 'text-slate-700 dark:text-slate-200',
    titleColor: 'text-slate-900 dark:text-slate-100',
    subColor: 'text-slate-600 dark:text-slate-300',
    swimlaneBg: 'bg-white/10 dark:bg-white/[0.015]',
    swimlanePill:
      'bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600',
    icon: Users,
  },
};

/** Readable d3-zoom bounds — scales down enough to inspect branches while staying crisp */
const DEFAULT_ZOOM = 0.94;
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 1.45;
const INITIAL_VISIBLE_SIBLINGS = 5;
const SIBLING_LOAD_STEP = 10;

const DETAIL_CARD_WIDTH = 200;
const COMPACT_CARD_WIDTH = 160;
const CREW_CARD_WIDTH = 240;
const MORE_CARD_WIDTH = 152;

const DETAIL_CARD_HEIGHT = 132;
const COMPACT_CARD_HEIGHT = 70;
const CREW_EXPANDED_HEIGHT = 326;
const H_GAP = 14;
const SWIMLANE_LABEL_WIDTH = 0;

type CardDensity = 'compact' | 'detailed';

const LEVEL_COMPACT_DIMS: Record<OrgRoleLevel, { w: number; h: number }> = {
  1: { w: 184, h: 78 },
  2: { w: 174, h: 74 },
  3: { w: 164, h: 72 },
  4: { w: 156, h: 68 },
  5: { w: 148, h: 66 },
  6: { w: 142, h: 64 },
  7: { w: 136, h: 62 },
  8: { w: 132, h: 60 },
};

const LEVEL_DETAIL_DIMS: Record<OrgRoleLevel, { w: number; h: number }> = {
  1: { w: 228, h: 140 },
  2: { w: 216, h: 136 },
  3: { w: 206, h: 132 },
  4: { w: 196, h: 128 },
  5: { w: 188, h: 124 },
  6: { w: 180, h: 120 },
  7: { w: 174, h: 118 },
  8: { w: 168, h: 114 },
};

const LEVEL_DOT_COLORS: Record<OrgRoleLevel, string> = {
  1: '#d97706',
  2: '#7c3aed',
  3: '#4f46e5',
  4: '#2563eb',
  5: '#059669',
  6: '#0284c7',
  7: '#ea580c',
  8: '#475569',
};

function getLevelCardSize(level: OrgRoleLevel, density: CardDensity): { w: number; h: number } {
  return density === 'compact' ? LEVEL_COMPACT_DIMS[level] : LEVEL_DETAIL_DIMS[level];
}

function getInitials(fullName: string): string {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function toMinimalPersonnelRecord(node: OrgNode): PersonnelRecord {
  return {
    id: node.personId || 0,
    sira_no: 0,
    sicil_no: node.sicil_no,
    rhi_id: '',
    saren_no: '',
    genel_durum: 'Mevcut',
    guncel_durum: 'Mevcut',
    region: node.region,
    proje_adi: node.proje_adi,
    calisma_lokasyon: node.effective_site,
    kategori: node.kategori,
    firma: node.firma,
    departman: node.departman,
    uyruk: node.uyruk,
    adi: '',
    soyadi: '',
    baba_adi: '',
    ad_soyad: node.ad_soyad,
    tam_adi_kiril: '',
    gorevi: node.gorevi,
    rhi_gorevi: node.ek_gorev,
    sorumlu_kisi: node.sorumlu_kisi,
    grup_sefi: node.grup_sefi,
    endirekt_direkt: node.endirekt_direkt,
    ise_giris_tarihi: node.ise_giris_tarihi,
    santiye_giris_tarihi: '',
    cikis_tarihi: '',
    cikis_sebebi: '',
    gunduz_gece: '',
    propusk_no: '',
    propusk_bitis_tarihi: '',
    cinsiyet: '',
    dogum_tarihi: '',
    pasaport_no: '',
    pasaport_gecerlilik: '',
    tc_kimlik_no: '',
    dogum_yeri: '',
    migrasyon_no: '',
    inn_no: '',
    vize_no: '',
    vize_bitis_tarihi: '',
    patent_alis_tarihi: '',
    patent_bitis_tarihi: '',
    telefon_no: '',
    email: '',
    kamp_no: '',
    oda_no: '',
  };
}

function getSpanBadgeColor(directCount: number): string {
  if (directCount >= 20) return 'bg-rose-500 text-white';
  if (directCount >= 10) return 'bg-amber-500 text-white';
  return 'bg-emerald-500 text-white';
}

interface ConsolidatedCrewCardProps {
  parentNode: OrgNode;
  members: OrgNode[];
  variant: 'worker' | 'specialist';
  isListOpen: boolean;
  onToggleList: () => void;
  onInspectPerson: (node: OrgNode) => void;
}

function ConsolidatedCrewCard({
  parentNode,
  members,
  variant,
  isListOpen,
  onToggleList,
  onInspectPerson,
}: ConsolidatedCrewCardProps) {
  const [crewQuery, setCrewQuery] = useState('');

  const tradeSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const g = m.gorevi || 'Diğer';
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = crewQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.ad_soyad.toLowerCase().includes(q) ||
        m.gorevi.toLowerCase().includes(q) ||
        m.sicil_no.toLowerCase().includes(q)
    );
  }, [members, crewQuery]);

  const isWorker = variant === 'worker';

  return (
    <div
      style={{ width: CREW_CARD_WIDTH }}
      className={`rounded-2xl border-2 border-white dark:border-slate-500/80 border-b-[4px] transition-all overflow-hidden text-left bg-gradient-to-b from-[#ffffff] via-[#f9fbfd] to-[#e7eef6] dark:from-[#293854] dark:via-[#1f2c44] dark:to-[#162033] shadow-[0_14px_24px_-6px_rgba(15,23,42,0.26),0_6px_12px_-4px_rgba(15,23,42,0.16),inset_0_2px_0_#ffffff] dark:shadow-[0_16px_28px_-6px_rgba(0,0,0,0.85),0_6px_12px_-3px_rgba(0,0,0,0.6),inset_0_1.5px_0_rgba(255,255,255,0.24)] ${
        isWorker
          ? 'border-b-slate-400 dark:border-b-slate-400'
          : 'border-b-cyan-400 dark:border-b-cyan-400'
      }`}
    >
      <div className="p-2.5">
        <div
          onClick={onToggleList}
          className="flex items-start justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-b from-[#eef2f7] to-[#dde5ef] dark:from-[#162033] dark:to-[#0f1726] border border-white dark:border-slate-600/70 shadow-[inset_0_1.5px_3px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.65)]">
              <Users
                className={`w-4 h-4 ${
                  isWorker
                    ? 'text-slate-600 dark:text-slate-200'
                    : 'text-sky-600 dark:text-cyan-300'
                }`}
              />
            </div>
            <div className="min-w-0">
              <div
                className={`text-[9.5px] font-bold uppercase tracking-wider ${
                  isWorker
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-sky-700 dark:text-cyan-300'
                }`}
              >
                {isWorker ? 'L8 • Saha İşçileri (Liste)' : 'L6 • Uzman & İdari Kadro'}
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {parentNode.ad_soyad} ({members.length})
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-medium shrink-0 flex items-center gap-1 ${
              isWorker
                ? 'bg-slate-800 text-white dark:bg-slate-700'
                : 'bg-sky-600 text-white'
            }`}
          >
            {isListOpen ? 'Gizle' : 'Aç'}
            {isListOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {tradeSummary.map(([trade, cnt]) => (
            <span
              key={trade}
              className="px-1.5 py-0.5 rounded-md text-[10px] bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-600/70 text-slate-700 dark:text-slate-200 truncate max-w-[120px]"
              title={`${trade}: ${cnt}`}
            >
              {trade}: {cnt}
            </span>
          ))}
        </div>

        {isListOpen && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2">
            {members.length > 5 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={crewQuery}
                  onChange={(e) => setCrewQuery(e.target.value)}
                  placeholder="İsim, görev veya sicil ara..."
                  className="w-full pl-7 pr-2 py-1 text-[11px] rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}

            <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
              {filteredMembers.map((m, idx) => (
                <button
                  key={m.nodeId}
                  type="button"
                  onClick={() => onInspectPerson(m)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white dark:bg-slate-800/90 hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-slate-200/70 dark:border-slate-700/70 text-left transition-colors cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-800 dark:text-slate-100 truncate group-hover:text-teal-700 dark:group-hover:text-teal-300">
                      {idx + 1}. {m.ad_soyad}
                    </div>
                    <div className="text-[9.5px] text-slate-500 dark:text-slate-400 truncate">
                      {m.gorevi} {m.sicil_no ? `• #${m.sicil_no}` : ''}
                    </div>
                  </div>
                  <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface OrgEnterpriseCardProps {
  node: OrgNode;
  density: CardDensity;
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isChainFocused: boolean;
  colorBySpan: boolean;
  onCardClick: (node: OrgNode) => void;
  onToggleExpand: (node: OrgNode) => void;
  onOpenKunye: (node: OrgNode) => void;
  onInspectDrawer: (node: OrgNode) => void;
  onFocusSubtree: (nodeId: string) => void;
}

function OrgEnterpriseCard({
  node,
  density,
  isExpanded,
  isSelected,
  isHighlighted,
  isChainFocused,
  colorBySpan,
  onCardClick,
  onToggleExpand,
  onOpenKunye,
  onInspectDrawer,
  onFocusSubtree,
}: OrgEnterpriseCardProps) {
  const theme = ROLE_LEVEL_THEMES[node.roleLevel];
  const IconComp = theme.icon;
  const hasChildren = node.directCount > 0;
  const isCompact = density === 'compact';
  const cardDims = getLevelCardSize(node.roleLevel, density);

  const whiteRatio =
    node.totalSubordinates > 0
      ? Math.round((node.subordinateEndirekt / node.totalSubordinates) * 100)
      : node.endirekt_direkt === 'Endirekt'
        ? 100
        : 0;

  const spanBorderOverride =
    colorBySpan && hasChildren
      ? node.directCount >= 20
        ? 'border-2 border-rose-400 border-b-[4px] border-b-rose-500 ring-1 ring-rose-400/30'
        : node.directCount >= 10
          ? 'border-2 border-amber-400 border-b-[4px] border-b-amber-500 ring-1 ring-amber-400/30'
          : 'border-2 border-emerald-400 border-b-[4px] border-b-emerald-500 ring-1 ring-emerald-400/30'
      : node.isVirtual
        ? 'border-2 border-dashed border-slate-300 dark:border-slate-500 border-b-[4px] border-b-slate-400'
        : theme.cardBorder;

  const badgeTitle = node.isVirtual
    ? node.virtualKind === 'subcon'
      ? 'Taşeron'
      : node.virtualKind === 'pending_pool'
        ? 'Havuz'
        : `${theme.code} • TBA`
    : `${theme.code} • ${theme.shortTr}`;

  return (
    <div
      id={`org-card-${node.nodeId}`}
      onClick={() => onCardClick(node)}
      style={{ width: cardDims.w, height: cardDims.h }}
      className={`relative rounded-2xl transition-all duration-200 select-none text-left overflow-visible cursor-pointer ${
        node.isVirtual
          ? 'bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] dark:from-[#26344d] dark:via-[#1e2a3f] dark:to-[#151e2e]'
          : theme.cardSurface
      } ${spanBorderOverride} ${
        isChainFocused
          ? 'ring-3 ring-teal-500 shadow-[0_18px_32px_-6px_rgba(20,184,166,0.42),0_6px_12px_-2px_rgba(15,23,42,0.2),inset_0_2px_0_#ffffff] dark:shadow-[0_18px_32px_-6px_rgba(20,184,166,0.45),inset_0_1.5px_0_rgba(255,255,255,0.3)] -translate-y-0.5'
          : isHighlighted
            ? 'ring-3 ring-rose-500 shadow-xl'
            : isSelected
              ? 'ring-2 ring-indigo-500 shadow-lg'
              : 'shadow-[0_14px_24px_-6px_rgba(15,23,42,0.26),0_6px_12px_-4px_rgba(15,23,42,0.16),inset_0_2px_0_#ffffff] dark:shadow-[0_16px_28px_-6px_rgba(0,0,0,0.85),0_6px_12px_-3px_rgba(0,0,0,0.6),inset_0_1.5px_0_rgba(255,255,255,0.26)] hover:shadow-[0_18px_30px_-6px_rgba(15,23,42,0.32),0_8px_14px_-4px_rgba(15,23,42,0.2),inset_0_2px_0_#ffffff] dark:hover:shadow-[0_20px_34px_-6px_rgba(0,0,0,0.92),inset_0_1.5px_0_rgba(255,255,255,0.34)] hover:-translate-y-0.5'
      }`}
    >
      <div className="h-full w-full overflow-hidden rounded-[13px] flex flex-col justify-between">
        {isCompact ? (
          <div className="h-full px-2.5 py-1 flex items-center justify-between gap-1.5 min-w-0">
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <span className={`text-[9px] font-bold uppercase tracking-wide truncate ${theme.subColor}`}>
                {badgeTitle}
              </span>
              <div
                className={`text-[11.5px] font-semibold leading-tight truncate mt-0.5 ${theme.titleColor}`}
                title={node.ad_soyad}
              >
                {node.ad_soyad}
              </div>
              <div
                className="text-[9.5px] font-medium leading-tight truncate text-slate-700 dark:text-slate-200 mt-0.5"
                title={node.gorevi}
              >
                {node.gorevi}
              </div>
            </div>

            {/* Vertically stacked action icons (Detay, Odak, Kart Aç) */}
            <div className="flex flex-col items-center justify-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenKunye(node);
                }}
                title="Sağda Raporlama Zinciri & Künyeyi Aç"
                className="p-0.5 rounded text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Info className="w-3 h-3" />
              </button>
              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusSubtree(node.nodeId);
                  }}
                  title="Sadece bu yöneticinin alt ağacına odaklan"
                  className="p-0.5 rounded text-slate-500 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Crosshair className="w-3 h-3" />
                </button>
              )}
              {!node.isVirtual && node.personId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectDrawer(node);
                  }}
                  title="198 Kolonlu Personel Kartını Aç"
                  className="p-0.5 rounded text-slate-500 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-2 flex-1 flex flex-col justify-between min-w-0">
            <div className="flex items-start justify-between gap-1.5 min-w-0">
              <div className="min-w-0 flex-1">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8.5px] font-bold tracking-wide uppercase max-w-full ${theme.badgeBg} ${theme.badgeText}`}
                >
                  <IconComp className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{badgeTitle}</span>
                </span>
                <div
                  className={`text-[11.5px] font-semibold leading-tight truncate mt-1 ${theme.titleColor}`}
                  title={node.ad_soyad}
                >
                  {node.ad_soyad}
                </div>
                <div className={`text-[10px] font-medium mt-0.5 truncate ${theme.subColor}`} title={node.gorevi}>
                  {node.gorevi}
                </div>
                <div className="text-[9px] mt-0.5 truncate text-slate-600 dark:text-slate-300">
                  {node.effective_site}
                  {node.sicil_no && !node.isVirtual ? ` • #${node.sicil_no}` : ''}
                </div>
              </div>

              {/* Vertically stacked action icons (Detay, Odak, Kart Aç) */}
              <div className="flex flex-col items-center justify-start gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenKunye(node);
                  }}
                  title="Sağda Raporlama Zinciri & Künyeyi Aç"
                  className="p-0.5 rounded text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Info className="w-3 h-3" />
                </button>
                {hasChildren && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusSubtree(node.nodeId);
                    }}
                    title="Sadece bu yöneticinin alt ağacına odaklan"
                    className="p-0.5 rounded text-slate-500 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Crosshair className="w-3 h-3" />
                  </button>
                )}
                {!node.isVirtual && node.personId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectDrawer(node);
                    }}
                    title="198 Kolonlu Personel Kartını Aç"
                    className="p-0.5 rounded text-slate-500 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {hasChildren && (
              <div className="pt-1 border-t border-slate-300/60 dark:border-white/15">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">
                    Doğrudan:{' '}
                    <span
                      className={
                        colorBySpan
                          ? `px-1 py-0.2 rounded ${getSpanBadgeColor(node.directCount)}`
                          : 'font-bold'
                      }
                    >
                      {node.directCount}
                    </span>
                  </span>
                  <span className="font-bold text-teal-800 dark:text-teal-300">
                    Alt: {node.totalSubordinates}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-slate-300/70 dark:bg-slate-700 overflow-hidden flex">
                  <div className="h-full bg-indigo-500" style={{ width: `${whiteRatio}%` }} />
                  <div className="h-full bg-teal-500" style={{ width: `${100 - whiteRatio}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-centered + / - Expand/Collapse button */}
      {hasChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node);
          }}
          title={isExpanded ? 'Alt ekibi kapat (−)' : `Alt ekibi aç (+${node.directCount})`}
          className={`absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center justify-center gap-0.5 h-5 min-w-[22px] px-1.5 rounded-full border text-[11px] font-bold shadow-md transition-transform hover:scale-110 cursor-pointer ${
            isExpanded
              ? 'bg-teal-600 text-white border-teal-400'
              : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white border-slate-300 dark:border-slate-500 hover:border-teal-500'
          }`}
        >
          <span>{isExpanded ? '−' : '+'}</span>
          {!isExpanded && (
            <span className="text-[9px] font-semibold opacity-85">{node.directCount}</span>
          )}
        </button>
      )}
    </div>
  );
}

/** Deterministic Level-Row Layout Structures */
type LayoutNodeKind = 'person' | 'crew_specialist' | 'crew_worker' | 'more_siblings';

interface LayoutTreeItem {
  id: string;
  kind: LayoutNodeKind;
  node: OrgNode;
  members?: OrgNode[];
  remainingCount?: number;
  levelNo: OrgRoleLevel;
  subTier: number;
  rowKey: string;
  width: number;
  height: number;
  subtreeWidth: number;
  x: number;
  y: number;
  centerX: number;
  children: LayoutTreeItem[];
}

interface SwimlaneBand {
  rowKey: string;
  levelNo: OrgRoleLevel;
  subTier: number;
  isEmptyPassThrough: boolean;
  topY: number;
  height: number;
  cardTopY: number;
}

export default function OrganizationChartView() {
  const { user, getAuthHeaders, showPermissionDenied } = useAuth();
  const { lang } = useLanguage();
  const canEditJobLevels = Boolean(user && user.role !== 'viewer');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawPeople, setRawPeople] = useState<OrgRawPerson[]>([]);
  const [jobLevelMap, setJobLevelMap] = useState<Record<string, number>>({});
  const [unconfirmedTitles, setUnconfirmedTitles] = useState<JobLevelItemDto[]>([]);

  // Modal state for Job Title Levels Management
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [levelModalInitialTab, setLevelModalInitialTab] = useState<'all' | 'unconfirmed' | 'active'>('active');

  // Filter & Display Mode Controls
  const [hierarchyMode, setHierarchyMode] = useState<OrgHierarchyMode>('combined');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [chainFocusNodeId, setChainFocusNodeId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'chart' | 'directory'>('chart');
  const [cardDensity, setCardDensity] = useState<CardDensity>('compact');
  const [dirExpandedIds, setDirExpandedIds] = useState<Set<string>>(new Set());
  const [colorBySpan, setColorBySpan] = useState<boolean>(false);

  // d3-zoom transform state (k = zoom scale, x/y = pan)
  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({
    x: 16,
    y: 12,
    k: DEFAULT_ZOOM,
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Expanded manager nodes + expanded consolidated crew lists + per-parent visible sibling limit
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedCrewKeys, setExpandedCrewKeys] = useState<Set<string>>(new Set());
  const [visibleCountByParent, setVisibleCountByParent] = useState<Record<string, number>>({});

  // Search, Künye Inspector & 198-Column Drawer
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerRecord, setDrawerRecord] = useState<PersonnelRecord | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const orgContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);

  const fetchOrgData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scopeParams = new URLSearchParams();
      if (user?.scope_type && user.scope_type !== 'all') {
        scopeParams.set('userScopeType', user.scope_type);
        scopeParams.set('userScopeValue', user.scope_value || 'all');
      }
      const res = await fetch(`/api/org-chart?${scopeParams.toString()}`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Organizasyon verisi alınamadı.');
      }
      setRawPeople(data.people || []);
      if (data.jobLevelMap) {
        setJobLevelMap(data.jobLevelMap);
      }
      if (Array.isArray(data.unconfirmedTitles)) {
        setUnconfirmedTitles(data.unconfirmedTitles);
      }
    } catch (err: any) {
      setError(err?.message || 'Veri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders]);

  useEffect(() => {
    fetchOrgData();
  }, [fetchOrgData]);

  const orgResult = useMemo(() => {
    return buildOrganizationHierarchy(rawPeople, {
      mode: hierarchyMode,
      siteFilter,
      departmentFilter: deptFilter,
      focusNodeId,
      jobLevelMap,
    });
  }, [rawPeople, hierarchyMode, siteFilter, deptFilter, focusNodeId, jobLevelMap]);

  // Initialize battle-tested GitHub d3-zoom behavior on the viewport container
  useEffect(() => {
    const vpEl = viewportRef.current;
    if (!vpEl || viewTab !== 'chart') return;

    const zb = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .filter((event: any) => {
        if (event.type === 'wheel') return true;
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, input, select, a, [data-no-pan="true"]')) {
          return false;
        }
        return !event.button;
      })
      .on('zoom', (event: { transform: ZoomTransform }) => {
        setTransform({
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        });
      });

    zoomBehaviorRef.current = zb;
    const sel = select(vpEl);
    sel.call(zb as any);
    sel.call(zb.transform as any, zoomIdentity.translate(16, 12).scale(DEFAULT_ZOOM));

    return () => {
      sel.on('.zoom', null);
    };
  }, [viewTab, loading]);

  const applyD3ZoomScale = useCallback((nextScale: number) => {
    const vpEl = viewportRef.current;
    const zb = zoomBehaviorRef.current;
    if (!vpEl || !zb) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
    select(vpEl)
      .transition()
      .duration(220)
      .call(zb.scaleTo as any, clamped, [0, 0]);
  }, []);

  const centerOnCoords = useCallback((worldX: number, worldY: number, targetScale?: number) => {
    const vpEl = viewportRef.current;
    const zb = zoomBehaviorRef.current;
    if (!vpEl || !zb) return;
    const rect = vpEl.getBoundingClientRect();
    const k = targetScale ?? transform.k;
    const tx = rect.width / 2 - worldX * k;
    const ty = Math.min(40, rect.height * 0.25 - worldY * k);
    select(vpEl)
      .transition()
      .duration(280)
      .call(zb.transform as any, zoomIdentity.translate(tx, ty).scale(k));
  }, [transform.k]);

  // Build Visible Layout Tree with True Level-Row (Swimlane) Alignment + Right-Side "+N Daha" Sibling Card
  const layoutData = useMemo(() => {
    if (orgResult.roots.length === 0) {
      return {
        rootItems: [] as LayoutTreeItem[],
        allItems: [] as LayoutTreeItem[],
        swimlanes: [] as SwimlaneBand[],
        canvasWidth: 960,
        canvasHeight: 420,
      };
    }

    const baseCardHeight = cardDensity === 'compact' ? COMPACT_CARD_HEIGHT : DETAIL_CARD_HEIGHT;

    // If a card is clicked for chain focus, keep ONLY its ancestor chain (above) + its own subtree (below)
    let chainAncestorSet: Set<string> | null = null;
    if (chainFocusNodeId && orgResult.nodeById.has(chainFocusNodeId)) {
      chainAncestorSet = new Set<string>();
      let cur: OrgNode | undefined = orgResult.nodeById.get(chainFocusNodeId);
      while (cur) {
        chainAncestorSet.add(cur.nodeId);
        cur = cur.parentId ? orgResult.nodeById.get(cur.parentId) : undefined;
      }
    }

    const buildVisibleItem = (
      node: OrgNode,
      parentLevelNo: number | null,
      parentSubTier: number
    ): LayoutTreeItem => {
      let levelNo: OrgRoleLevel = node.roleLevel;
      let subTier = 0;
      if (parentLevelNo !== null) {
        if (node.roleLevel > parentLevelNo) {
          levelNo = node.roleLevel;
          subTier = 0;
        } else {
          levelNo = parentLevelNo as OrgRoleLevel;
          subTier = parentSubTier + 1;
        }
      }
      const dims = getLevelCardSize(levelNo, cardDensity);
      const rowKey = `${levelNo}:${subTier}`;
      const isExp = expandedIds.has(node.nodeId);
      const isStrictAncestorAboveFocus =
        Boolean(chainAncestorSet) &&
        chainAncestorSet!.has(node.nodeId) &&
        node.nodeId !== chainFocusNodeId;

      const rawDescriptors: Array<
        | { kind: 'person'; childNode: OrgNode }
        | { kind: 'crew_specialist'; members: OrgNode[] }
        | { kind: 'crew_worker'; members: OrgNode[] }
      > = [];

      if (isExp && node.directCount > 0) {
        if (isStrictAncestorAboveFocus && chainAncestorSet) {
          for (const m of node.managerChildren) {
            if (chainAncestorSet.has(m.nodeId)) {
              rawDescriptors.push({ kind: 'person', childNode: m });
            }
          }
        } else {
          for (const m of node.managerChildren) {
            rawDescriptors.push({ kind: 'person', childNode: m });
          }
          if (node.specialistLeaves.length === 1) {
            rawDescriptors.push({ kind: 'person', childNode: node.specialistLeaves[0] });
          } else if (node.specialistLeaves.length > 1) {
            rawDescriptors.push({
              kind: 'crew_specialist',
              members: node.specialistLeaves,
            });
          }
          if (node.workerLeaves.length > 0) {
            rawDescriptors.push({
              kind: 'crew_worker',
              members: node.workerLeaves,
            });
          }
        }
      }

      // Strictly show first 5 children by default; remaining appear only when "+N Kişi Daha" is clicked
      const visibleLimit = visibleCountByParent[node.nodeId] ?? INITIAL_VISIBLE_SIBLINGS;
      const hasMore = rawDescriptors.length > visibleLimit;
      const visibleSlice = hasMore
        ? rawDescriptors.slice(0, visibleLimit)
        : rawDescriptors;
      const remainingCount = Math.max(0, rawDescriptors.length - visibleSlice.length);

      const childItems: LayoutTreeItem[] = visibleSlice.map((desc) => {
        if (desc.kind === 'person') {
          return buildVisibleItem(desc.childNode, levelNo, subTier);
        }
        const targetLvl: OrgRoleLevel = desc.kind === 'crew_specialist' ? 6 : 8;
        const cLevelNo: OrgRoleLevel =
          targetLvl > levelNo ? targetLvl : (levelNo as OrgRoleLevel);
        const cSubTier = targetLvl > levelNo ? 0 : subTier + 1;
        const cRowKey = `${cLevelNo}:${cSubTier}`;
        const crewKey = `${node.nodeId}:${desc.kind}`;
        const crewOpen = expandedCrewKeys.has(crewKey);
        return {
          id: crewKey,
          kind: desc.kind,
          node,
          members: desc.members,
          levelNo: cLevelNo,
          subTier: cSubTier,
          rowKey: cRowKey,
          width: CREW_CARD_WIDTH,
          height: crewOpen ? CREW_EXPANDED_HEIGHT : baseCardHeight,
          subtreeWidth: CREW_CARD_WIDTH,
          x: 0,
          y: 0,
          centerX: 0,
          children: [],
        };
      });

      // Right-side "+N Kişi Daha" expansion card appended cleanly at the right end of the row!
      if (hasMore && remainingCount > 0) {
        const lastChild = childItems[childItems.length - 1];
        const moreLvl = lastChild ? lastChild.levelNo : (Math.min(8, levelNo + 1) as OrgRoleLevel);
        const moreSubTier = lastChild ? lastChild.subTier : 0;
        const moreRowKey = `${moreLvl}:${moreSubTier}`;
        childItems.push({
          id: `more-${node.nodeId}`,
          kind: 'more_siblings',
          node,
          remainingCount,
          levelNo: moreLvl,
          subTier: moreSubTier,
          rowKey: moreRowKey,
          width: MORE_CARD_WIDTH,
          height: baseCardHeight,
          subtreeWidth: MORE_CARD_WIDTH,
          x: 0,
          y: 0,
          centerX: 0,
          children: [],
        });
      }

      let subtreeWidth = dims.w;
      if (childItems.length > 0) {
        const childrenSpan =
          childItems.reduce((acc, c) => acc + c.subtreeWidth, 0) +
          (childItems.length - 1) * H_GAP;
        subtreeWidth = Math.max(dims.w, childrenSpan);
      }

      return {
        id: node.nodeId,
        kind: 'person',
        node,
        levelNo,
        subTier,
        rowKey,
        width: dims.w,
        height: dims.h,
        subtreeWidth,
        x: 0,
        y: 0,
        centerX: 0,
        children: childItems,
      };
    };

    const activeRoots =
      chainAncestorSet !== null
        ? orgResult.roots.filter((r) => chainAncestorSet!.has(r.nodeId))
        : orgResult.roots;
    const rootItems = activeRoots.map((r) => buildVisibleItem(r, null, 0));

    const allItems: LayoutTreeItem[] = [];
    const rowMaxHeight = new Map<string, { levelNo: OrgRoleLevel; subTier: number; maxH: number }>();
    let minLvl = 8;
    let maxLvl = 1;

    const collectDfs = (it: LayoutTreeItem) => {
      allItems.push(it);
      if (it.levelNo < minLvl) minLvl = it.levelNo;
      if (it.levelNo > maxLvl) maxLvl = it.levelNo;

      const cur = rowMaxHeight.get(it.rowKey) || {
        levelNo: it.levelNo,
        subTier: it.subTier,
        maxH: baseCardHeight,
      };
      if (it.height > cur.maxH) cur.maxH = it.height;
      rowMaxHeight.set(it.rowKey, cur);

      for (const ch of it.children) {
        collectDfs(ch);
      }
    };

    for (const r of rootItems) {
      collectDfs(r);
    }

    const bandSpecs: Array<{
      rowKey: string;
      levelNo: OrgRoleLevel;
      subTier: number;
      isEmptyPassThrough: boolean;
      maxCardH: number;
    }> = [];

    for (let lvl = minLvl; lvl <= maxLvl; lvl++) {
      const matchingSubTiers = Array.from(rowMaxHeight.entries())
        .filter(([, v]) => v.levelNo === lvl)
        .sort((a, b) => a[1].subTier - b[1].subTier);

      if (matchingSubTiers.length === 0) {
        bandSpecs.push({
          rowKey: `${lvl}:0`,
          levelNo: lvl as OrgRoleLevel,
          subTier: 0,
          isEmptyPassThrough: true,
          maxCardH: 0,
        });
      } else {
        for (const [rk, v] of matchingSubTiers) {
          bandSpecs.push({
            rowKey: rk,
            levelNo: v.levelNo,
            subTier: v.subTier,
            isEmptyPassThrough: false,
            maxCardH: v.maxH,
          });
        }
      }
    }

    const swimlanes: SwimlaneBand[] = [];
    const rowCardTopMap = new Map<string, number>();
    let cursorY = 18;

    for (const b of bandSpecs) {
      if (b.isEmptyPassThrough) {
        const h = 34;
        swimlanes.push({
          rowKey: b.rowKey,
          levelNo: b.levelNo,
          subTier: b.subTier,
          isEmptyPassThrough: true,
          topY: cursorY,
          height: h,
          cardTopY: cursorY + 17,
        });
        rowCardTopMap.set(b.rowKey, cursorY + 17);
        cursorY += h;
      } else {
        const topPad = 26;
        const bottomPad = 44;
        const h = topPad + b.maxCardH + bottomPad;
        const cardTopY = cursorY + topPad;
        swimlanes.push({
          rowKey: b.rowKey,
          levelNo: b.levelNo,
          subTier: b.subTier,
          isEmptyPassThrough: false,
          topY: cursorY,
          height: h,
          cardTopY,
        });
        rowCardTopMap.set(b.rowKey, cardTopY);
        cursorY += h;
      }
    }

    const totalRootsSpan =
      rootItems.reduce((acc, r) => acc + r.subtreeWidth, 0) +
      Math.max(0, rootItems.length - 1) * (H_GAP * 2);

    const startLeftX = 52;

    const assignCoords = (it: LayoutTreeItem, leftX: number) => {
      it.centerX = leftX + it.subtreeWidth / 2;
      it.x = it.centerX - it.width / 2;
      it.y = rowCardTopMap.get(it.rowKey) ?? 20;

      if (it.children.length > 0) {
        const childrenSpan =
          it.children.reduce((acc, c) => acc + c.subtreeWidth, 0) +
          (it.children.length - 1) * H_GAP;
        let childCursorX = leftX + (it.subtreeWidth - childrenSpan) / 2;
        for (const ch of it.children) {
          assignCoords(ch, childCursorX);
          childCursorX += ch.subtreeWidth + H_GAP;
        }
      }
    };

    let rootCursorX = startLeftX;
    for (const r of rootItems) {
      assignCoords(r, rootCursorX);
      rootCursorX += r.subtreeWidth + H_GAP * 2;
    }

    const canvasWidth = Math.max(960, startLeftX + totalRootsSpan + 48);
    const canvasHeight = Math.max(420, cursorY + 28);

    return {
      rootItems,
      allItems,
      swimlanes,
      canvasWidth,
      canvasHeight,
    };
  }, [orgResult.roots, orgResult.nodeById, expandedIds, expandedCrewKeys, visibleCountByParent, cardDensity, chainFocusNodeId]);

  const itemById = useMemo(() => {
    const m = new Map<string, LayoutTreeItem>();
    for (const it of layoutData.allItems) {
      m.set(it.id, it);
    }
    return m;
  }, [layoutData.allItems]);

  // Fit visible tree smoothly inside viewport (keeping >= 45% readable scale)
  const fitTreeToViewport = useCallback(() => {
    const vpEl = viewportRef.current;
    const zb = zoomBehaviorRef.current;
    if (!vpEl || !zb) return;
    const rect = vpEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaleX = (rect.width - 24) / layoutData.canvasWidth;
    const scaleY = (rect.height - 24) / layoutData.canvasHeight;
    const fitScale = Math.min(1.0, Math.max(0.45, Math.min(scaleX, scaleY)));
    const tx = 12;
    const ty = 12;

    select(vpEl)
      .transition()
      .duration(280)
      .call(zb.transform as any, zoomIdentity.translate(tx, ty).scale(fitScale));
  }, [layoutData.canvasWidth, layoutData.canvasHeight]);

  const pendingCenterModeRef = useRef<'fit_top_left' | 'center' | null>(null);

  // Expands root(s) + 1st level below so 3 total tiers are visible (e.g. L1-L2-L3 on Tüm Şirket, or Proje Müdürü + 2 levels below on Şantiye)
  const buildScreenFittedExpandedIds = useCallback((roots: OrgNode[]): Set<string> => {
    const next = new Set<string>();
    const queue: Array<{ node: OrgNode; relDepth: number }> = roots
      .slice(0, 3)
      .map((r) => ({ node: r, relDepth: 0 }));
    let opened = 0;

    while (queue.length > 0 && opened < 24) {
      const { node: cur, relDepth } = queue.shift()!;
      if (relDepth >= 2 || cur.directCount <= 0) continue;
      next.add(cur.nodeId);
      opened += 1;

      if (relDepth + 1 < 2) {
        for (const ch of cur.managerChildren.slice(0, INITIAL_VISIBLE_SIBLINGS)) {
          if (ch.directCount > 0) {
            queue.push({ node: ch, relDepth: relDepth + 1 });
          }
        }
      }
    }
    return next;
  }, []);

  // Click a left L1..L8 level pill to toggle expand/collapse ALL managers at that level
  const toggleLevelExpand = useCallback(
    (targetLevel: OrgRoleLevel) => {
      const levelManagers = Array.from(orgResult.nodeById.values()).filter(
        (n) => n.roleLevel === targetLevel && n.directCount > 0
      );
      if (levelManagers.length === 0) return;

      const allOpen = levelManagers.every((n) => expandedIds.has(n.nodeId));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (allOpen) {
          // Collapse this level and any deeper levels
          for (const n of Array.from(orgResult.nodeById.values())) {
            if (n.roleLevel >= targetLevel) {
              next.delete(n.nodeId);
            }
          }
        } else {
          // Open all ancestors + all managers up to targetLevel so the entire level is visible
          for (const n of levelManagers) {
            next.add(n.nodeId);
            let curParentId = n.parentId;
            while (curParentId) {
              next.add(curParentId);
              curParentId = orgResult.nodeById.get(curParentId)?.parentId || null;
            }
          }
        }
        return next;
      });
    },
    [orgResult.nodeById, expandedIds]
  );

  // Reset to initial screen-fitted view (root + 2 levels below)
  const resetToInitialView = useCallback(() => {
    const initialOpen = buildScreenFittedExpandedIds(orgResult.roots);
    pendingCenterModeRef.current = 'fit_top_left';
    setExpandedIds(initialOpen);
    setExpandedCrewKeys(new Set());
    setVisibleCountByParent({});
    setHighlightedNodeId(null);
    setChainFocusNodeId(null);
  }, [orgResult.roots, buildScreenFittedExpandedIds]);

  useEffect(() => {
    const initialOpen = buildScreenFittedExpandedIds(orgResult.roots);
    pendingCenterModeRef.current = 'fit_top_left';
    setExpandedIds(initialOpen);
    setDirExpandedIds(new Set(initialOpen));
    setExpandedCrewKeys(new Set());
    setVisibleCountByParent({});
    setHighlightedNodeId(null);
    setChainFocusNodeId(null);
  }, [orgResult.roots, focusNodeId, buildScreenFittedExpandedIds]);

  useEffect(() => {
    const mode = pendingCenterModeRef.current;
    if (!mode) return;
    if (layoutData.rootItems.length === 0) return;
    const vpEl = viewportRef.current;
    const zb = zoomBehaviorRef.current;
    if (!vpEl || !zb) return;
    const rect = vpEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    pendingCenterModeRef.current = null;
    if (mode === 'center') {
      const firstRoot = layoutData.rootItems[0];
      const k = DEFAULT_ZOOM;
      const tx = Math.round(rect.width / 2 - firstRoot.centerX * k);
      const ty = 16;
      select(vpEl)
        .transition()
        .duration(280)
        .call(zb.transform as any, zoomIdentity.translate(tx, ty).scale(k));
    } else {
      const scaleX = (rect.width - 24) / layoutData.canvasWidth;
      const scaleY = (rect.height - 24) / layoutData.canvasHeight;
      const fitScale = Math.min(1.0, Math.max(0.45, Math.min(scaleX, scaleY)));
      select(vpEl)
        .transition()
        .duration(260)
        .call(zb.transform as any, zoomIdentity.translate(12, 12).scale(fitScale));
    }
  }, [layoutData.rootItems, layoutData.canvasWidth, layoutData.canvasHeight, viewTab, loading]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = orgContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Card body click toggles Ancestor + Subtree Chain Focus (click again to clear focus)
  const handleCardClick = useCallback(
    (node: OrgNode) => {
      pendingCenterModeRef.current = 'fit_top_left';
      setChainFocusNodeId((prevFocus) => {
        if (prevFocus === node.nodeId) {
          return null;
        }
        // Ensure all ancestors + the clicked node itself are expanded so its full chain & team show
        setExpandedIds((prevExp) => {
          const next = new Set(prevExp);
          let cur: OrgNode | undefined = node;
          while (cur) {
            if (cur.directCount > 0) next.add(cur.nodeId);
            cur = cur.parentId ? orgResult.nodeById.get(cur.parentId) : undefined;
          }
          return next;
        });
        return node.nodeId;
      });
    },
    [orgResult.nodeById]
  );

  // Card bottom + / - button toggles expand/collapse of direct children
  const handleToggleExpand = useCallback(
    (node: OrgNode) => {
      if (node.directCount === 0) return;

      setExpandedIds((prev) => {
        const next = new Set(prev);

        const collapseSubtree = (target: OrgNode) => {
          next.delete(target.nodeId);
          for (const ch of target.managerChildren) {
            collapseSubtree(ch);
          }
        };

        if (next.has(node.nodeId)) {
          collapseSubtree(node);
        } else {
          if (node.parentId) {
            const parent = orgResult.nodeById.get(node.parentId);
            if (parent) {
              for (const sib of parent.managerChildren) {
                if (sib.nodeId !== node.nodeId && next.has(sib.nodeId)) {
                  collapseSubtree(sib);
                }
              }
            }
          } else {
            for (const r of orgResult.roots) {
              if (r.nodeId !== node.nodeId && next.has(r.nodeId)) {
                collapseSubtree(r);
              }
            }
          }
          next.add(node.nodeId);
        }

        return next;
      });
    },
    [orgResult.nodeById, orgResult.roots]
  );

  const handleLoadMoreSiblings = useCallback((parentId: string) => {
    setVisibleCountByParent((prev) => ({
      ...prev,
      [parentId]: (prev[parentId] ?? INITIAL_VISIBLE_SIBLINGS) + SIBLING_LOAD_STEP,
    }));
  }, []);

  const handleToggleCrewList = useCallback((crewKey: string) => {
    setExpandedCrewKeys((prev) => {
      const next = new Set(prev);
      if (next.has(crewKey)) next.delete(crewKey);
      else next.add(crewKey);
      return next;
    });
  }, []);

  // Search Autocomplete Results
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: OrgNode[] = [];
    for (const node of Array.from(orgResult.nodeById.values())) {
      if (node.isVirtual) continue;
      if (
        node.ad_soyad.toLowerCase().includes(q) ||
        node.sicil_no.toLowerCase().includes(q) ||
        node.gorevi.toLowerCase().includes(q)
      ) {
        results.push(node);
        if (results.length >= 12) break;
      }
    }
    return results;
  }, [searchQuery, orgResult.nodeById]);

  const handleLocatePersonInChart = useCallback(
    (target: OrgNode) => {
      setViewTab('chart');
      setHighlightedNodeId(target.nodeId);
      setSearchQuery('');

      const nextExpanded = new Set<string>();
      const visibleUpdates: Record<string, number> = {};

      let childCursor: OrgNode | undefined = target;
      let parentCursor: OrgNode | undefined = target.parentId
        ? orgResult.nodeById.get(target.parentId)
        : undefined;

      while (parentCursor) {
        nextExpanded.add(parentCursor.nodeId);
        const childIdx = parentCursor.managerChildren.findIndex(
          (m) => m.nodeId === childCursor?.nodeId
        );
        if (childIdx >= INITIAL_VISIBLE_SIBLINGS) {
          visibleUpdates[parentCursor.nodeId] = childIdx + 2;
        } else if (childIdx < 0 && childCursor) {
          const needed =
            parentCursor.managerChildren.length +
            (parentCursor.specialistLeaves.length > 0 ? 1 : 0) +
            1;
          if (needed > INITIAL_VISIBLE_SIBLINGS) {
            visibleUpdates[parentCursor.nodeId] = needed;
          }
        }
        childCursor = parentCursor;
        parentCursor = parentCursor.parentId
          ? orgResult.nodeById.get(parentCursor.parentId)
          : undefined;
      }

      if (target.directCount > 0) {
        nextExpanded.add(target.nodeId);
      }

      setExpandedIds(nextExpanded);
      setVisibleCountByParent((prev) => ({ ...prev, ...visibleUpdates }));

      const scrollTargetId =
        target.directCount > 0 || target.roleLevel <= 5 || target.roleLevel === 7
          ? target.nodeId
          : target.parentId || target.nodeId;

      setTimeout(() => {
        const item = itemById.get(scrollTargetId);
        if (item) {
          centerOnCoords(item.centerX, item.y);
        }
      }, 120);
    },
    [orgResult.nodeById, itemById, centerOnCoords]
  );

  // Open 198-Column PersonnelDetailDrawer
  const handleInspectDrawer = useCallback(
    async (node: OrgNode) => {
      if (!node.personId || node.isVirtual) return;
      setDrawerLoading(true);
      try {
        const res = await fetch(
          `/api/personnel?search=${encodeURIComponent(node.sicil_no || node.ad_soyad)}&limit=10`,
          { headers: getAuthHeaders() }
        );
        const data = await res.json();
        const records: PersonnelRecord[] = data.records || data.data || [];
        const exact =
          records.find((r) => Number(r.id) === Number(node.personId)) ||
          records.find((r) => r.sicil_no === node.sicil_no) ||
          records[0];
        setDrawerRecord(exact || toMinimalPersonnelRecord(node));
      } catch {
        setDrawerRecord(toMinimalPersonnelRecord(node));
      } finally {
        setDrawerLoading(false);
      }
    },
    [getAuthHeaders]
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return orgResult.nodeById.get(selectedNodeId) || null;
  }, [selectedNodeId, orgResult.nodeById]);

  const selectedChain = useMemo(() => {
    if (!selectedNode) return [];
    const chain: OrgNode[] = [];
    let curr: OrgNode | undefined = selectedNode;
    const guard = new Set<string>();
    while (curr && !guard.has(curr.nodeId)) {
      guard.add(curr.nodeId);
      chain.unshift(curr);
      curr = curr.parentId ? orgResult.nodeById.get(curr.parentId) : undefined;
    }
    return chain;
  }, [selectedNode, orgResult.nodeById]);

  const focusBreadcrumb = useMemo(() => {
    if (!focusNodeId) return [];
    const list: OrgNode[] = [];
    let cur: OrgNode | undefined = orgResult.nodeById.get(focusNodeId);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.nodeId)) {
      guard.add(cur.nodeId);
      list.unshift(cur);
      cur = cur.parentId ? orgResult.nodeById.get(cur.parentId) : undefined;
    }
    return list;
  }, [focusNodeId, orgResult.nodeById]);

  // Excel Export (strictly zero salary data per corporate privacy rule)
  const handleExportHierarchyExcel = useCallback(() => {
    const rows: Array<Record<string, string | number>> = [];
    const walk = (node: OrgNode, chainNames: string[]) => {
      const currentChain = [...chainNames, node.ad_soyad];
      if (!node.isVirtual) {
        rows.push({
          'Kademe Seviyesi': `L${node.roleLevel} - ${ROLE_LEVEL_THEMES[node.roleLevel].rowTitleTr}`,
          'Sicil No': node.sicil_no,
          'Ad Soyad': node.ad_soyad,
          Görevi: node.gorevi,
          'Şantiye / Lokasyon': node.effective_site,
          Departman: node.departman,
          'Yaka Türü': node.endirekt_direkt,
          'Sorumlu Kişi (eBA)': node.sorumlu_kisi || '-',
          'Grup Şefi (eBA)': node.grup_sefi || '-',
          'Doğrudan Bağlı Sayısı': node.directCount,
          'Toplam Alt Ekip': node.totalSubordinates,
          'İşe Giriş Tarihi': node.ise_giris_tarihi,
          'Üst Yönetim Zinciri': currentChain.join(' -> '),
        });
      }
      for (const m of node.managerChildren) walk(m, currentChain);
      for (const s of node.specialistLeaves) walk(s, currentChain);
      for (const w of node.workerLeaves) walk(w, currentChain);
    };

    for (const r of orgResult.roots) {
      walk(r, []);
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Organizasyon Hiyerarsisi');
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    XLSX.writeFile(wb, `Pondera_Organizasyon_Semasi_${dd}.${mm}.${yyyy}.xlsx`);
  }, [orgResult.roots]);

  const openLevelModal = (tab: 'all' | 'unconfirmed' | 'active') => {
    setLevelModalInitialTab(tab);
    setIsLevelModalOpen(true);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-7 h-7 text-teal-600 animate-spin" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {lang === 'ru'
            ? 'Построение иерархии по уровням должностей (L1–L8)...'
            : 'Görev sınıf seviyelerine (L1–L8) göre organizasyon şeması hazırlanıyor...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 p-8 text-center space-y-3">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        <button
          type="button"
          onClick={fetchOrgData}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs cursor-pointer"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div
      ref={orgContainerRef}
      className={`space-y-2 ${
        isFullscreen ? 'bg-slate-50 dark:bg-slate-950 p-3 h-screen overflow-hidden flex flex-col' : ''
      }`}
    >
      {/* Warning Banner when newly arrived job titles have unconfirmed levels */}
      {unconfirmedTitles.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-amber-950 dark:text-amber-100">
                Yeni Görev Seviyesi Tanımlaması Gerekiyor ({unconfirmedTitles.length} Yeni Görev)
              </div>
              <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate max-w-3xl">
                Seviyesi onaylanmamış yeni görevler:{' '}
                {unconfirmedTitles
                  .slice(0, 4)
                  .map((t) => `${t.displayTitle} (${t.activeCount} kişi)`)
                  .join(', ')}
                {unconfirmedTitles.length > 4 ? ` +${unconfirmedTitles.length - 4} diğer` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!canEditJobLevels) {
                showPermissionDenied({
                  actionLabelTr: 'Yeni Görev Seviyesi Tanımlama',
                  titleTr: 'Düzenleme Yetkisi Gerekli (Viewer Rolü Kısıtlı)',
                  messageTr:
                    'Yeni gelen görevlerin sınıf seviyesini tanımlama yetkisi yalnızca Gözlemci (Viewer) olmayan kullanıcılara aittir.',
                });
                return;
              }
              openLevelModal('unconfirmed');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs shadow-xs cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Yeni Görev Seviyelerini Tanımla ({unconfirmedTitles.length})
          </button>
        </div>
      )}

      {/* Compact Header + Single-Line L1..L8 Role Legend + Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 px-3.5 py-2.5 shadow-xs space-y-2 shrink-0">
        {/* Row 1: Title + Card Density Toggle + Job Levels Button + Mode Switch + Excel */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <h1 className="text-sm sm:text-base text-slate-900 dark:text-white truncate">
              {lang === 'ru'
                ? 'Организационная структура по уровням (L1–L8)'
                : 'Organizasyon Şeması & Seviye Hiyerarşisi (L1–L8)'}
            </h1>
            <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <span>{orgResult.totalStaff.toLocaleString('tr-TR')} Aktif</span>
              <span>•</span>
              <span>{orgResult.totalManagers} Yönetici</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Job Title Levels Management Button */}
            <button
              type="button"
              onClick={() =>
                openLevelModal(unconfirmedTitles.length > 0 ? 'unconfirmed' : 'active')
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer ${
                unconfirmedTitles.length > 0
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
              }`}
              title="Görev unvanlarının L1–L8 sınıf seviyelerini görüntüle ve düzenle"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Görev Seviyeleri (L1–L8)</span>
              {unconfirmedTitles.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px]">
                  {unconfirmedTitles.length} Yeni
                </span>
              )}
            </button>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setHierarchyMode('combined')}
                className={`px-2 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                  hierarchyMode === 'combined'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Birleşik
              </button>
              <button
                type="button"
                onClick={() => setHierarchyMode('sorumlu')}
                className={`px-2 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                  hierarchyMode === 'sorumlu'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Sorumlu Kişi
              </button>
              <button
                type="button"
                onClick={() => setHierarchyMode('grup_sefi')}
                className={`px-2 py-1 rounded-md text-[11px] transition-all cursor-pointer ${
                  hierarchyMode === 'grup_sefi'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Grup Şefi
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportHierarchyExcel}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[11px] transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.xlsx</span>
            </button>
          </div>
        </div>

        {/* Row 2: Search + Site Quick Pills + Department + Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kişi, görev veya sicil ara → Dalı aç..."
              className="w-full pl-8 pr-7 py-1 text-[11.5px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchMatches.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-72 overflow-y-auto p-1">
                {searchMatches.map((m) => (
                  <button
                    key={m.nodeId}
                    type="button"
                    onClick={() => handleLocatePersonInChart(m)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/50 text-left transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-slate-900 dark:text-white truncate">
                        {m.ad_soyad}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {m.gorevi} • {m.effective_site}
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 shrink-0">
                      L{m.roleLevel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-[180px]">
            <button
              type="button"
              onClick={() => {
                setSiteFilter('all');
                setFocusNodeId(null);
              }}
              className={`px-2 py-1 rounded-lg text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                siteFilter === 'all'
                  ? 'bg-slate-900 dark:bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Tüm Şirket ({rawPeople.length.toLocaleString('tr-TR')})
            </button>
            {orgResult.sites.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setSiteFilter(s.name);
                  setFocusNodeId(null);
                }}
                className={`px-2 py-1 rounded-lg text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                  siteFilter === s.name
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {s.name} ({s.count.toLocaleString('tr-TR')})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={deptFilter}
              onChange={(e) => {
                setDeptFilter(e.target.value);
                setFocusNodeId(null);
              }}
              className="px-2 py-1 text-[11px] rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tüm Departmanlar</option>
              {orgResult.departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.count})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setColorBySpan((v) => !v)}
              title="Yönetici kontrol yükü (Span of Control) renk göstergesi"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border cursor-pointer ${
                colorBySpan
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 text-amber-800 dark:text-amber-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Palette className="w-3 h-3" />
              <span className="hidden md:inline">Yük Rengi</span>
            </button>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewTab('chart')}
                className={`px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer ${
                  viewTab === 'chart'
                    ? 'bg-slate-900 dark:bg-teal-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                <GitBranch className="w-3 h-3" />
                Şema
              </button>
              <button
                type="button"
                onClick={() => setViewTab('directory')}
                className={`px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer ${
                  viewTab === 'directory'
                    ? 'bg-slate-900 dark:bg-teal-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                <ListTree className="w-3 h-3" />
                Dizin
              </button>
            </div>
          </div>
        </div>

        {/* Subtree Focus Breadcrumb */}
        {focusNodeId && focusBreadcrumb.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-teal-50/90 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-[11px]">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <span className="text-teal-700 dark:text-teal-300 shrink-0">Odaklanan Dal:</span>
              <button
                type="button"
                onClick={() => setFocusNodeId(null)}
                className="px-1.5 py-0.5 rounded hover:bg-teal-100 dark:hover:bg-teal-900 text-teal-800 dark:text-teal-200 cursor-pointer shrink-0"
              >
                Tüm Şirket
              </button>
              {focusBreadcrumb.map((b) => (
                <React.Fragment key={b.nodeId}>
                  <ChevronRight className="w-3 h-3 text-teal-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setFocusNodeId(b.nodeId)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer shrink-0 ${
                      b.nodeId === focusNodeId
                        ? 'bg-teal-600 text-white'
                        : 'hover:bg-teal-100 dark:hover:bg-teal-900 text-teal-800 dark:text-teal-200'
                    }`}
                  >
                    {b.ad_soyad} (L{b.roleLevel})
                  </button>
                </React.Fragment>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFocusNodeId(null)}
              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer shrink-0"
            >
              Tüm Ağaca Dön
            </button>
          </div>
        )}
      </div>

      {/* Main Chart Canvas OR Directory Table */}
      {viewTab === 'chart' ? (
        <div
          className={`grid grid-cols-1 xl:grid-cols-12 gap-3 ${
            isFullscreen ? 'flex-1 min-h-0' : ''
          }`}
        >
          <div
            className={`${
              selectedNode ? 'xl:col-span-9' : 'xl:col-span-12'
            } relative bg-gradient-to-br from-[#d3dce7] via-[#e3e9f1] to-[#c9d3e1] dark:from-[#060b14] dark:via-[#0a1222] dark:to-[#050911] rounded-2xl border border-slate-300/80 dark:border-slate-700/80 shadow-inner overflow-hidden`}
          >
            {/* Top-Right d3-zoom & Display Controls */}
            <div className="absolute top-2.5 right-3 z-20 flex items-center gap-1 p-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-lg">
              <button
                type="button"
                onClick={() => applyD3ZoomScale(transform.k - 0.1)}
                disabled={transform.k <= MIN_ZOOM + 0.01}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 cursor-pointer"
                title="Uzaklaştır (%42 sınırına kadar)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyD3ZoomScale(1)}
                className="px-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-200 min-w-[44px] text-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                title="%100 Gerçek Boyut"
              >
                {Math.round(transform.k * 100)}%
              </button>
              <button
                type="button"
                onClick={() => applyD3ZoomScale(transform.k + 0.1)}
                disabled={transform.k >= MAX_ZOOM - 0.01}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 cursor-pointer"
                title="Yakınlaştır"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
              <button
                type="button"
                onClick={fitTreeToViewport}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] flex items-center gap-1 cursor-pointer"
                title="Açık şemayı ekrana sığdır"
              >
                <Scan className="w-3 h-3" />
                <span>Sığdır</span>
              </button>
              <button
                type="button"
                onClick={resetToInitialView}
                className="px-2 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] flex items-center gap-1 cursor-pointer"
                title="İlk görünüme sıfırla"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Sıfırla</span>
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
              <button
                type="button"
                onClick={() =>
                  setCardDensity((prev) => (prev === 'detailed' ? 'compact' : 'detailed'))
                }
                className={`px-2 py-1 rounded-lg text-[11px] flex items-center gap-1.5 border transition-all cursor-pointer ${
                  cardDensity === 'detailed'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title="Detaylı Kart görünümünü aç/kapat"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    cardDensity === 'detailed' ? 'bg-emerald-300' : 'bg-slate-400'
                  }`}
                />
                <span>Detay Kart</span>
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="Tam Ekran"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Bottom-right subtle hint + active chain focus indicator */}
            <div className="absolute bottom-2.5 right-3 z-20 flex items-center gap-2">
              {chainFocusNodeId && (
                <button
                  type="button"
                  onClick={() => setChainFocusNodeId(null)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-medium shadow-md cursor-pointer"
                >
                  <span>Zincir Odağı Aktif • Temizle</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/80 dark:border-slate-700 text-[10.5px] text-slate-600 dark:text-slate-300 shadow-xs pointer-events-none">
                <span>Karta tıkla: Zincire odaklan • + / −: Alt ekibi aç/kapat • (i): Künye</span>
              </div>
            </div>

            {/* d3-zoom Interactive Stage */}
            <div
              ref={viewportRef}
              className={`${
                isFullscreen ? 'h-[calc(100vh-155px)]' : 'h-[calc(100vh-195px)] min-h-[560px]'
              } relative overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none`}
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(100,116,139,0.18) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            >
              {layoutData.rootItems.length === 0 ? (
                <div className="py-20 text-center text-sm text-slate-500 dark:text-slate-400">
                  Seçili filtre kriterlerine uygun personel bulunamadı.
                </div>
              ) : (
                <div
                  style={{
                    width: layoutData.canvasWidth,
                    height: layoutData.canvasHeight,
                    transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.k})`,
                    transformOrigin: '0 0',
                  }}
                  className="relative will-change-transform"
                >
                  {/* 1. Horizontal Corporate Level Swimlane Lines (L1 .. L8) — Non-blocking background */}
                  {layoutData.swimlanes.map((band) => {
                    const theme = ROLE_LEVEL_THEMES[band.levelNo];
                    return (
                      <div
                        key={band.rowKey}
                        style={{ top: band.topY, height: band.height }}
                        className={`absolute left-0 right-0 z-[1] pointer-events-none border-b border-dashed border-slate-400/35 dark:border-slate-700/65 ${
                          band.isEmptyPassThrough ? 'opacity-50' : theme.swimlaneBg
                        }`}
                      />
                    );
                  })}

                  {/* 2. Crisp 3D Infographic Orthogonal Connectors (busY clearly below card bottom) */}
                  <svg
                    width={layoutData.canvasWidth}
                    height={layoutData.canvasHeight}
                    className="absolute inset-0 pointer-events-none z-[2]"
                  >
                    {layoutData.allItems.map((parentItem) => {
                      if (parentItem.children.length === 0) return null;
                      const pX = parentItem.centerX;
                      const pBottomY = parentItem.y + parentItem.height;
                      const busY = pBottomY + 28;

                      const firstChild = parentItem.children[0];
                      const lastChild = parentItem.children[parentItem.children.length - 1];
                      const parentDotColor = LEVEL_DOT_COLORS[parentItem.levelNo];

                      return (
                        <g key={`edges-${parentItem.id}`}>
                          <line
                            x1={pX}
                            y1={pBottomY}
                            x2={pX}
                            y2={busY}
                            className="stroke-[#2c6473] dark:stroke-[#5ec2eb]"
                            strokeOpacity={0.85}
                            strokeWidth={2.2}
                          />
                          <circle
                            cx={pX}
                            cy={pBottomY}
                            r={8.5}
                            fill={parentDotColor}
                            fillOpacity={0.26}
                          />
                          <circle
                            cx={pX}
                            cy={pBottomY}
                            r={4}
                            fill={parentDotColor}
                            stroke="#ffffff"
                            strokeWidth={1.3}
                          />
                          {parentItem.children.length > 1 && (
                            <line
                              x1={firstChild.centerX}
                              y1={busY}
                              x2={lastChild.centerX}
                              y2={busY}
                              className="stroke-[#2c6473] dark:stroke-[#5ec2eb]"
                              strokeOpacity={0.85}
                              strokeWidth={2.2}
                            />
                          )}
                          {parentItem.children.map((ch) => {
                            const isDeepDrop = ch.y - busY > 65;
                            const isMoreCard = ch.kind === 'more_siblings';
                            const childDotColor = isMoreCard
                              ? '#14b8a6'
                              : LEVEL_DOT_COLORS[ch.levelNo];
                            return (
                              <g key={`drop-${parentItem.id}-${ch.id}`}>
                                <line
                                  x1={ch.centerX}
                                  y1={busY}
                                  x2={ch.centerX}
                                  y2={ch.y}
                                  className={
                                    isMoreCard
                                      ? 'stroke-teal-600 dark:stroke-teal-400'
                                      : 'stroke-[#2c6473] dark:stroke-[#5ec2eb]'
                                  }
                                  strokeOpacity={0.85}
                                  strokeWidth={2}
                                  strokeDasharray={
                                    isMoreCard || isDeepDrop ? '4 3' : undefined
                                  }
                                />
                                <circle
                                  cx={ch.centerX}
                                  cy={ch.y}
                                  r={8.5}
                                  fill={childDotColor}
                                  fillOpacity={0.28}
                                />
                                <circle
                                  cx={ch.centerX}
                                  cy={ch.y}
                                  r={4}
                                  fill={childDotColor}
                                  stroke="#ffffff"
                                  strokeWidth={1.3}
                                />
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </svg>

                  {/* 3. Positioned Enterprise Cards, Crew Cards & Right-Side "+N Kişi Daha" Cards */}
                  {layoutData.allItems.map((it) => (
                    <div
                      key={it.id}
                      data-no-pan="true"
                      style={{ left: it.x, top: it.y }}
                      className="absolute z-[5]"
                    >
                      {it.kind === 'person' ? (
                        <OrgEnterpriseCard
                          node={it.node}
                          density={cardDensity}
                          isExpanded={expandedIds.has(it.node.nodeId)}
                          isSelected={selectedNodeId === it.node.nodeId}
                          isHighlighted={highlightedNodeId === it.node.nodeId}
                          isChainFocused={chainFocusNodeId === it.node.nodeId}
                          colorBySpan={colorBySpan}
                          onCardClick={handleCardClick}
                          onToggleExpand={handleToggleExpand}
                          onOpenKunye={(n) => setSelectedNodeId(n.nodeId)}
                          onInspectDrawer={handleInspectDrawer}
                          onFocusSubtree={(id) => setFocusNodeId(id)}
                        />
                      ) : it.kind === 'more_siblings' ? (
                        <button
                          type="button"
                          onClick={() => handleLoadMoreSiblings(it.node.nodeId)}
                          style={{ width: it.width, height: it.height }}
                          className="rounded-2xl border-2 border-dashed border-teal-500/80 dark:border-teal-400/80 border-b-[4px] border-b-teal-500 bg-gradient-to-b from-[#ffffff] via-[#f8fafc] to-[#e6eef6] dark:from-[#263854] dark:via-[#1e2d45] dark:to-[#162135] hover:from-teal-50 hover:to-white dark:hover:from-[#2c4466] dark:hover:to-[#1b2b44] shadow-[0_14px_24px_-6px_rgba(15,23,42,0.24),inset_0_2px_0_#ffffff] dark:shadow-[0_16px_28px_-6px_rgba(0,0,0,0.85),inset_0_1.5px_0_rgba(255,255,255,0.22)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 px-2.5 text-left cursor-pointer group"
                        >
                          <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-500/25 text-teal-700 dark:text-teal-300 border border-teal-300/70 dark:border-teal-400/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11.5px] font-bold text-slate-900 dark:text-white leading-tight">
                              +{it.remainingCount} Kişi Daha
                            </div>
                            <div className="text-[9.5px] font-medium text-teal-700 dark:text-teal-300 flex items-center gap-0.5 mt-0.5">
                              <span>Devamını Aç</span>
                              <ChevronRight className="w-3 h-3" />
                            </div>
                          </div>
                        </button>
                      ) : (
                        <ConsolidatedCrewCard
                          parentNode={it.node}
                          members={it.members || []}
                          variant={it.kind === 'crew_worker' ? 'worker' : 'specialist'}
                          isListOpen={expandedCrewKeys.has(it.id)}
                          onToggleList={() => handleToggleCrewList(it.id)}
                          onInspectPerson={handleInspectDrawer}
                        />
                      )}
                    </div>
                  ))}

                  {/* 4. Clickable Left L1..L8 Level Pills Overlay (never blocks card clicks) */}
                  <div className="absolute inset-0 pointer-events-none z-[25]">
                    {layoutData.swimlanes.map((band) => {
                      const theme = ROLE_LEVEL_THEMES[band.levelNo];
                      const BandIcon = theme.icon;
                      const levelCode = `${theme.code}${band.subTier > 0 ? `.${band.subTier + 1}` : ''}`;
                      const levelDesc = `${levelCode} • ${lang === 'ru' ? theme.shortRu : theme.shortTr}`;
                      const lvlMgrs = Array.from(orgResult.nodeById.values()).filter(
                        (n) => n.roleLevel === band.levelNo && n.directCount > 0
                      );
                      const isLvlOpen = lvlMgrs.length > 0 && lvlMgrs.every((n) => expandedIds.has(n.nodeId));
                      return (
                        <div
                          key={`pill-${band.rowKey}`}
                          style={{ top: band.topY + 6, left: 6 }}
                          data-no-pan="true"
                          className="absolute pointer-events-auto group/lvl"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLevelExpand(band.levelNo);
                            }}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold shadow-xs cursor-pointer transition-all hover:scale-105 ${theme.swimlanePill} ${
                              isLvlOpen ? 'ring-2 ring-teal-500/60' : ''
                            }`}
                          >
                            <BandIcon className="w-2.5 h-2.5 shrink-0" />
                            <span>{levelCode}</span>
                          </button>
                          <div className="pointer-events-none opacity-0 group-hover/lvl:opacity-100 transition-opacity duration-150 absolute left-0 top-full mt-1 whitespace-nowrap px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[11px] font-medium shadow-xl z-50 border border-slate-200 dark:border-slate-700">
                            {levelDesc} {lvlMgrs.length > 0 ? (isLvlOpen ? '• (Tıkla: Kapat)' : '• (Tıkla: Tümünü Aç)') : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Reporting Chain & Künye Panel (ONLY opens when clicking 'i' button on card) */}
          {selectedNode && (
            <div className="xl:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 h-fit sticky top-20 shadow-sm">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-teal-600 dark:text-teal-400">
                    Hiyerarşi & Seviye Künyesi (L{selectedNode.roleLevel})
                  </span>
                  <h3 className="text-sm text-slate-900 dark:text-white mt-0.5">
                    {selectedNode.ad_soyad}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedNode.gorevi}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400 uppercase">Görev Sınıf Seviyesi</div>
                  <div className="text-slate-800 dark:text-slate-100 mt-0.5 flex items-center justify-between">
                    <span>
                      L{selectedNode.roleLevel} • {ROLE_LEVEL_THEMES[selectedNode.roleLevel].rowTitleTr}
                    </span>
                    <button
                      type="button"
                      onClick={() => openLevelModal('active')}
                      className="text-[10.5px] text-teal-600 hover:underline cursor-pointer"
                    >
                      Seviye Düzenle
                    </button>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400 uppercase">Sorumlu Kişi (eBA)</div>
                  <div className="text-slate-800 dark:text-slate-100 mt-0.5">
                    {selectedNode.sorumlu_kisi || '-'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-400 uppercase">Grup Şefi (eBA)</div>
                  <div className="text-slate-800 dark:text-slate-100 mt-0.5">
                    {selectedNode.grup_sefi || '-'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/50">
                    <div className="text-[10px] text-indigo-600 dark:text-indigo-300">
                      Doğrudan Bağlı
                    </div>
                    <div className="text-base text-indigo-900 dark:text-indigo-100">
                      {selectedNode.directCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/50 dark:border-teal-800/50">
                    <div className="text-[10px] text-teal-600 dark:text-teal-300">
                      Toplam Alt Ekip
                    </div>
                    <div className="text-base text-teal-900 dark:text-teal-100">
                      {selectedNode.totalSubordinates.toLocaleString('tr-TR')}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                  Üst Yönetim Zinciri (Kime Bağlı)
                </div>
                <div className="space-y-1.5">
                  {selectedChain.map((step, idx) => (
                    <button
                      key={step.nodeId}
                      type="button"
                      onClick={() => handleLocatePersonInChart(step)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        step.nodeId === selectedNode.nodeId
                          ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-300 dark:border-teal-700'
                          : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-900 dark:text-white truncate">
                          {idx + 1}. {step.ad_soyad}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {step.gorevi}
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                        L{step.roleLevel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {selectedNode.directCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFocusNodeId(selectedNode.nodeId)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Sadece Bu Yöneticinin Ağacına Odaklan
                  </button>
                )}

                {!selectedNode.isVirtual && selectedNode.personId && (
                  <button
                    type="button"
                    disabled={drawerLoading}
                    onClick={() => handleInspectDrawer(selectedNode)}
                    className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    {drawerLoading ? 'Yükleniyor...' : '198 Kolonlu Personel Kartını Aç'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Interactive Folder Tree View (Dizin Modu) */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Organizasyon Klasör Dizini ({orgResult.totalManagers} Yönetici • {orgResult.totalStaff.toLocaleString('tr-TR')} Personel)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Klasörlere tıklayarak alt ekipleri kademeli açabilir, şemada odaklanabilir veya künyeyi inceleyebilirsiniz.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const allMgrs = new Set<string>();
                  orgResult.nodeById.forEach((n) => {
                    if (n.directCount > 0) allMgrs.add(n.nodeId);
                  });
                  setDirExpandedIds(allMgrs);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] cursor-pointer"
              >
                Tüm Klasörleri Aç
              </button>
              <button
                type="button"
                onClick={() => setDirExpandedIds(new Set())}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] cursor-pointer"
              >
                Tümünü Daralt
              </button>
            </div>
          </div>

          <div className="p-3 max-h-[660px] overflow-y-auto space-y-1">
            {(() => {
              const renderFolderNode = (node: OrgNode, depth: number): React.ReactNode => {
                const isFolder = node.directCount > 0;
                const isOpen = dirExpandedIds.has(node.nodeId);
                const t = ROLE_LEVEL_THEMES[node.roleLevel];
                const allChildren = [
                  ...node.managerChildren,
                  ...node.specialistLeaves,
                  ...node.workerLeaves,
                ];

                return (
                  <div key={`${depth}-${node.nodeId}`} className="select-none">
                    <div
                      style={{ paddingLeft: `${depth * 20 + 8}px` }}
                      onClick={() => {
                        if (!isFolder) {
                          setSelectedNodeId(node.nodeId);
                          return;
                        }
                        setDirExpandedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(node.nodeId)) next.delete(node.nodeId);
                          else next.add(node.nodeId);
                          return next;
                        });
                      }}
                      className="flex items-center justify-between gap-2 py-1.5 pr-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isFolder ? (
                          isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )
                        ) : (
                          <span className="w-3.5 shrink-0" />
                        )}

                        {isFolder ? (
                          isOpen ? (
                            <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                          ) : (
                            <Folder className="w-4 h-4 text-amber-500/85 shrink-0" />
                          )
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 mx-1 shrink-0" />
                        )}

                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold shrink-0 ${t.badgeBg} ${t.badgeText}`}>
                          {t.code}
                        </span>

                        <span className="text-xs font-medium text-slate-900 dark:text-white truncate">
                          {node.ad_soyad}
                        </span>
                        {node.sicil_no && (
                          <span className="text-[10.5px] text-slate-400 shrink-0">#{node.sicil_no}</span>
                        )}
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                          • {node.gorevi} ({node.effective_site})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isFolder && (
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {node.directCount} doğrudan • {node.totalSubordinates.toLocaleString('tr-TR')} alt
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNodeId(node.nodeId);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 transition-opacity cursor-pointer"
                          title="Künye"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        {isFolder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLocatePersonInChart(node);
                            }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 text-[10.5px] transition-opacity cursor-pointer"
                          >
                            Şemada Göster
                          </button>
                        )}
                      </div>
                    </div>

                    {isFolder && isOpen && allChildren.length > 0 && (
                      <div className="border-l border-slate-200 dark:border-slate-800 ml-3">
                        {allChildren.slice(0, 120).map((ch) => renderFolderNode(ch, depth + 1))}
                        {allChildren.length > 120 && (
                          <div
                            style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}
                            className="py-1 text-[11px] text-slate-400 italic"
                          >
                            +{allChildren.length - 120} kişi daha (tam liste için şemada odaklanın)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              };

              return orgResult.roots.map((root) => renderFolderNode(root, 0));
            })()}
          </div>
        </div>
      )}

      {/* Job Title Class Levels Management Modal (L1 - L8) */}
      <JobTitleLevelModal
        isOpen={isLevelModalOpen}
        initialTab={levelModalInitialTab}
        onClose={() => setIsLevelModalOpen(false)}
        onSaved={(updatedMap, updatedUnconfirmed) => {
          setJobLevelMap(updatedMap);
          setUnconfirmedTitles(updatedUnconfirmed);
        }}
      />

      {/* 198-Column Personnel Detail Drawer */}
      <PersonnelDetailDrawer
        personnel={drawerRecord}
        onClose={() => setDrawerRecord(null)}
      />
    </div>
  );
}
