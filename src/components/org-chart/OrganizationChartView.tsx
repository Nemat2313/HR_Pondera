'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Crown,
  Building2,
  Layers,
  Compass,
  HardHat,
  Users,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Download,
  Crosshair,
  Eye,
  GitFork,
  ListTree,
  LayoutGrid,
  MapPin,
  ShieldAlert,
  Handshake,
  Clock,
  X,
  ArrowUpRight,
  Flame,
  Map as MapIcon,
  ArrowRightLeft,
  Network,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { OrgRawPerson } from '@/app/api/org-chart/route';
import {
  buildOrganizationHierarchy,
  OrgHierarchyMode,
  OrgNode,
  OrgRoleLevel,
} from '@/lib/orgChartBuilder';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import PersonnelDetailDrawer from '@/components/personnel/PersonnelDetailDrawer';
import type { PersonnelRecord } from '@/types';

interface OrganizationChartViewProps {
  onNavigateToPersonnel?: (filterType?: string, filterValue?: string) => void;
}

type SemanticLodMode = 'cluster' | 'name_only' | 'detailed';
type TreeLayoutStyle = 'hybrid' | 'vertical' | 'horizontal';

interface RoleTierMeta {
  level: OrgRoleLevel;
  badgeTr: string;
  badgeRu: string;
  shortTr: string;
  shortRu: string;
  icon: React.ComponentType<{ className?: string }>;
  cardClass: string;
  compactCardClass: string;
  accentBarClass: string;
  leftBorderClass: string;
  avatarClass: string;
  pillClass: string;
  dotClass: string;
}

const ROLE_TIER_CONFIG: Record<OrgRoleLevel, RoleTierMeta> = {
  1: {
    level: 1,
    badgeTr: 'L1 • ÜST YÖNETİM',
    badgeRu: 'У1 • РУКОВОДСТВО',
    shortTr: 'Başkan & Direktör',
    shortRu: 'Президент и Директора',
    icon: Crown,
    cardClass:
      'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/90 dark:from-[#0F172A] dark:via-[#151F38] dark:to-amber-950/70 text-white border-2 border-amber-400/80 shadow-lg shadow-amber-500/15',
    compactCardClass:
      'bg-slate-900 dark:bg-[#0F172A] text-white border border-amber-400/80 shadow-md',
    accentBarClass: 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500',
    leftBorderClass: 'border-l-4 border-l-amber-400',
    avatarClass:
      'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 ring-1 ring-amber-300/60',
    pillClass: 'bg-amber-400/20 text-amber-200 border border-amber-400/40',
    dotClass: 'bg-amber-400',
  },
  2: {
    level: 2,
    badgeTr: 'L2 • MÜDÜR / LİDER',
    badgeRu: 'У2 • ДИРЕКТОР ПРОЕКТА',
    shortTr: 'Müdür & Şantiye Şefi',
    shortRu: 'Директора и Нач. объектов',
    icon: Building2,
    cardClass:
      'bg-gradient-to-br from-white via-indigo-50/45 to-blue-50/50 dark:from-[#131C31] dark:via-indigo-950/35 dark:to-slate-900 text-slate-900 dark:text-white border-2 border-indigo-300 dark:border-indigo-500/70 shadow-md',
    compactCardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-indigo-300 dark:border-indigo-500/70 shadow-xs',
    accentBarClass: 'bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-500',
    leftBorderClass: 'border-l-4 border-l-indigo-500',
    avatarClass: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white',
    pillClass:
      'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700',
    dotClass: 'bg-indigo-500',
  },
  3: {
    level: 3,
    badgeTr: 'L3 • GRUP / KISIM ŞEFİ',
    badgeRu: 'У3 • НАЧАЛЬНИК ГРУППЫ',
    shortTr: 'Grup & Kısım Şefi',
    shortRu: 'Начальники групп',
    icon: Layers,
    cardClass:
      'bg-gradient-to-br from-white via-emerald-50/35 to-teal-50/40 dark:from-[#131C31] dark:via-emerald-950/30 dark:to-slate-900 text-slate-900 dark:text-white border border-emerald-300 dark:border-emerald-600/60 shadow-sm',
    compactCardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-emerald-300 dark:border-emerald-600/60 shadow-2xs',
    accentBarClass: 'bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500',
    leftBorderClass: 'border-l-4 border-l-emerald-500',
    avatarClass: 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white',
    pillClass:
      'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
    dotClass: 'bg-emerald-500',
  },
  4: {
    level: 4,
    badgeTr: 'L4 • MÜHENDİS / UZMAN',
    badgeRu: 'У4 • ИНЖЕНЕР / СПЕЦИАЛИСТ',
    shortTr: 'Mühendis & Uzman',
    shortRu: 'Инженеры и ИТР',
    icon: Compass,
    cardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-sky-200 dark:border-sky-700/60 shadow-2xs',
    compactCardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-sky-200 dark:border-sky-700/60',
    accentBarClass: 'bg-gradient-to-r from-sky-500 to-cyan-500',
    leftBorderClass: 'border-l-4 border-l-sky-500',
    avatarClass: 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white',
    pillClass:
      'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
    dotClass: 'bg-sky-500',
  },
  5: {
    level: 5,
    badgeTr: 'L5 • FORMEN / SORUMLU',
    badgeRu: 'У5 • ФОРМЕН / МАСТЕР',
    shortTr: 'Formen & Sorumlu',
    shortRu: 'Формены и мастера',
    icon: HardHat,
    cardClass:
      'bg-gradient-to-br from-white to-amber-50/40 dark:from-[#131C31] dark:to-amber-950/20 text-slate-900 dark:text-white border border-amber-300 dark:border-amber-600/60 shadow-2xs',
    compactCardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-amber-300 dark:border-amber-600/60',
    accentBarClass: 'bg-gradient-to-r from-amber-500 to-orange-500',
    leftBorderClass: 'border-l-4 border-l-amber-500',
    avatarClass: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    pillClass:
      'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    dotClass: 'bg-amber-500',
  },
  6: {
    level: 6,
    badgeTr: 'L6 • SAHA EKİBİ',
    badgeRu: 'У6 • БРИГАДЫ',
    shortTr: 'Saha İşçileri (Liste)',
    shortRu: 'Рабочие (Список)',
    icon: Users,
    cardClass:
      'bg-slate-50 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700',
    compactCardClass:
      'bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700',
    accentBarClass: 'bg-gradient-to-r from-slate-500 to-slate-600',
    leftBorderClass: 'border-l-4 border-l-slate-500',
    avatarClass: 'bg-slate-600 text-white',
    pillClass:
      'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
    dotClass: 'bg-slate-500',
  },
};

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getHeatmapBadgeClass(directCount: number): string {
  if (directCount >= 21) {
    return 'bg-rose-600 text-white border-rose-500 ring-2 ring-rose-400/50';
  }
  if (directCount >= 9) {
    return 'bg-amber-500 text-slate-950 border-amber-400 ring-1 ring-amber-300/60';
  }
  return 'bg-emerald-600 text-white border-emerald-500';
}

function getHeatmapCardRing(directCount: number): string {
  if (directCount >= 21) {
    return 'border-rose-500 dark:border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-slate-900 dark:text-white';
  }
  if (directCount >= 9) {
    return 'border-amber-400 dark:border-amber-500 bg-amber-50/75 dark:bg-amber-950/35 text-slate-900 dark:text-white';
  }
  return 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 text-slate-900 dark:text-white';
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
    uyruk: node.uyruk,
    adi: '',
    soyadi: '',
    baba_adi: '',
    ad_soyad: node.ad_soyad,
    tam_adi_kiril: '',
    cinsiyet: '',
    dogum_tarihi: '',
    dogum_yeri: '',
    tc_kimlik_no: '',
    pasaport_no: '',
    pasaport_gecerlilik: '',
    region: node.region,
    proje_adi: node.proje_adi,
    calisma_lokasyon: '',
    kategori: node.kategori,
    firma: node.firma,
    departman: node.departman,
    gorevi: node.gorevi,
    rhi_gorevi: node.ek_gorev,
    sorumlu_kisi: node.sorumlu_kisi,
    grup_sefi: node.grup_sefi,
    endirekt_direkt: node.endirekt_direkt,
    gunduz_gece: '',
    ise_giris_tarihi: node.ise_giris_tarihi,
    santiye_giris_tarihi: '',
    cikis_tarihi: '',
    cikis_sebebi: '',
    propusk_no: '',
    propusk_bitis_tarihi: '',
    vize_no: '',
    vize_bitis_tarihi: '',
    migrasyon_no: '',
    inn_no: '',
    patent_alis_tarihi: '',
    patent_bitis_tarihi: '',
    kamp_no: '',
    oda_no: '',
    telefon_no: '',
    email: '',
  };
}

/**
 * Consolidated Single Box for Bottom-Level Workers / Leaf Teams.
 * Adapts automatically to Semantic Zoom (LOD):
 * - In 'cluster' / 'name_only' zoom: renders as a sleek compact count pill (click or zoom in to inspect roster!)
 * - In 'detailed' zoom (or when explicitly opened): shows trade breakdown + inline search + scrollable name list.
 */
function ConsolidatedCrewBox({
  boxKey,
  title,
  members,
  variant,
  lodMode,
  forceRosterOpen,
  onToggleForceOpen,
  highlightedNodeId,
  lang,
  translateVal,
  onSelectPerson,
  onOpenFullProfile,
}: {
  boxKey: string;
  title: string;
  members: OrgNode[];
  variant: 'workers' | 'specialists';
  lodMode: SemanticLodMode;
  forceRosterOpen: boolean;
  onToggleForceOpen: (key: string) => void;
  highlightedNodeId: string | null;
  lang: string;
  translateVal: (v: string) => string;
  onSelectPerson: (node: OrgNode) => void;
  onOpenFullProfile: (node: OrgNode) => void;
}) {
  const [filterText, setFilterText] = useState('');
  const [selectedTrade, setSelectedTrade] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

  const hasHighlightedMember = useMemo(
    () => Boolean(highlightedNodeId && members.some((m) => m.nodeId === highlightedNodeId)),
    [highlightedNodeId, members]
  );

  const isOpen = lodMode === 'detailed' || forceRosterOpen || hasHighlightedMember;

  const tradeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      const role = m.gorevi || 'Personel';
      map.set(role, (map.get(role) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count);
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return members.filter((m) => {
      if (selectedTrade !== 'all' && m.gorevi !== selectedTrade) return false;
      if (!q) return true;
      return (
        m.ad_soyad.toLowerCase().includes(q) ||
        m.sicil_no.toLowerCase().includes(q) ||
        m.gorevi.toLowerCase().includes(q)
      );
    });
  }, [members, filterText, selectedTrade]);

  if (!isOpen) {
    // Map-style compact grouped pill when zoomed out / standard mode
    const isWorkers = variant === 'workers';
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleForceOpen(boxKey);
        }}
        className={`shrink-0 w-max max-w-[210px] px-2.5 py-1.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer hover:shadow-md ${
          isWorkers
            ? 'bg-slate-800/95 dark:bg-slate-800 text-white border-slate-600'
            : 'bg-sky-50 dark:bg-sky-950/70 text-sky-900 dark:text-sky-100 border-sky-300 dark:border-sky-700'
        }`}
      >
        {isWorkers ? (
          <HardHat className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        ) : (
          <Compass className="w-3.5 h-3.5 text-sky-500 shrink-0" />
        )}
        <span className="text-[11px] truncate">
          {isWorkers
            ? lang === 'ru'
              ? 'Рабочая бригада'
              : 'Saha İşçileri'
            : lang === 'ru'
            ? 'Специалисты'
            : 'Uzman Ekibi'}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono shrink-0 ${
            isWorkers
              ? 'bg-amber-400 text-slate-950'
              : 'bg-sky-600 text-white'
          }`}
        >
          +{members.length}
        </span>
      </button>
    );
  }

  const visibleMembers = showAll ? filteredMembers : filteredMembers.slice(0, 10);
  const isWorkers = variant === 'workers';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`shrink-0 w-[264px] rounded-2xl border shadow-md overflow-hidden transition-all ${
        isWorkers
          ? 'bg-white dark:bg-[#11192C] border-slate-300 dark:border-slate-700'
          : 'bg-white dark:bg-[#11192C] border-sky-300 dark:border-sky-700/70'
      }`}
    >
      <div
        className={`px-3 py-2 flex items-center justify-between gap-2 ${
          isWorkers
            ? 'bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 text-white'
            : 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isWorkers ? <Users className="w-3.5 h-3.5 shrink-0" /> : <Compass className="w-3.5 h-3.5 shrink-0" />}
          <span className="text-[11px] truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
            {members.length}
          </span>
          {forceRosterOpen && lodMode !== 'detailed' && (
            <button
              type="button"
              onClick={() => onToggleForceOpen(boxKey)}
              className="p-0.5 rounded hover:bg-white/20 cursor-pointer"
              title="Küçült"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {tradeBreakdown.length > 1 && (
        <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/70 dark:border-slate-800 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedTrade('all')}
            className={`px-1.5 py-0.5 rounded text-[9.5px] whitespace-nowrap cursor-pointer ${
              selectedTrade === 'all'
                ? 'bg-slate-800 dark:bg-teal-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {lang === 'ru' ? 'Все' : 'Tümü'} ({members.length})
          </button>
          {tradeBreakdown.slice(0, 5).map((tb) => (
            <button
              key={tb.role}
              type="button"
              onClick={() => setSelectedTrade(selectedTrade === tb.role ? 'all' : tb.role)}
              className={`px-1.5 py-0.5 rounded text-[9.5px] whitespace-nowrap cursor-pointer ${
                selectedTrade === tb.role
                  ? 'bg-teal-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {translateVal(tb.role)} ({tb.count})
            </button>
          ))}
        </div>
      )}

      {members.length > 5 && (
        <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="relative">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={lang === 'ru' ? 'Поиск в списке...' : 'Listede ad / sicil ara...'}
              className="w-full pl-6 pr-5 py-1 text-[11px] rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
      )}

      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
        {visibleMembers.map((m) => {
          const isTarget = highlightedNodeId === m.nodeId;
          return (
            <div
              key={m.nodeId}
              id={`org-node-${m.nodeId}`}
              onClick={() => onSelectPerson(m)}
              className={`px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                isTarget
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 ring-1 ring-inset ring-emerald-500'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-900 dark:text-slate-100 truncate">
                  {m.ad_soyad}
                </div>
                <div className="text-[9.5px] text-slate-500 dark:text-slate-400 truncate">
                  {translateVal(m.gorevi)} • #{m.sicil_no}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFullProfile(m);
                }}
                className="p-1 rounded text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 cursor-pointer shrink-0"
                title={lang === 'ru' ? 'Карточка' : 'Personel Kartı'}
              >
                <Eye className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {filteredMembers.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full py-1 px-3 text-[10px] text-teal-700 dark:text-teal-300 bg-slate-50 dark:bg-slate-900/80 hover:bg-teal-50 dark:hover:bg-slate-800 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-center gap-1 cursor-pointer"
        >
          <span>
            {showAll
              ? lang === 'ru'
                ? 'Свернуть'
                : 'Listeyi Daralt'
              : lang === 'ru'
              ? `Показать всех (${filteredMembers.length})`
              : `Tümünü Göster (${filteredMembers.length})`}
          </span>
          {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
}

/**
 * Semantic-Zoom (LOD) Adaptive Person Card:
 * - 'cluster' (< 62% zoom): Ultra-clean micro pill (Dot + Ad Soyad + +Count) — NEVER overlaps!
 * - 'name_only' (62% - 95% zoom): Crisp Name-Only card (Role icon + Ad Soyad + +Count expand badge)
 * - 'detailed' (>= 96% zoom): Full executive card (Title, Site, Sicil, Grup Şefi, White/Blue collar bar, Focus & Profile actions)
 */
function OrgSemanticNodeCard({
  node,
  lodMode,
  heatmapMode,
  isExpanded,
  hasExpandableChildren,
  isSelected,
  isInHighlightChain,
  isHighlightedTarget,
  dimmedByLevelFilter,
  lang,
  translateVal,
  onToggleExpand,
  onSelectNode,
  onFocusSubtree,
  onOpenFullProfile,
  onHoverNode,
}: {
  node: OrgNode;
  lodMode: SemanticLodMode;
  heatmapMode: boolean;
  isExpanded: boolean;
  hasExpandableChildren: boolean;
  isSelected: boolean;
  isInHighlightChain: boolean;
  isHighlightedTarget: boolean;
  dimmedByLevelFilter: boolean;
  lang: string;
  translateVal: (v: string) => string;
  onToggleExpand: (node: OrgNode) => void;
  onSelectNode: (node: OrgNode) => void;
  onFocusSubtree: (node: OrgNode) => void;
  onOpenFullProfile: (node: OrgNode) => void;
  onHoverNode: (node: OrgNode | null) => void;
}) {
  const tier = ROLE_TIER_CONFIG[node.roleLevel];
  const TierIcon =
    node.virtualKind === 'subcon'
      ? Handshake
      : node.virtualKind === 'pending_pool'
      ? Clock
      : node.virtualKind === 'external_supervisor'
      ? ShieldAlert
      : tier.icon;

  const isL1 = node.roleLevel === 1 && !node.isVirtual && !heatmapMode;
  const ringHighlight = isHighlightedTarget
    ? 'ring-4 ring-emerald-500 shadow-xl z-20'
    : isInHighlightChain
    ? 'ring-2 ring-teal-500 shadow-md z-10'
    : isSelected
    ? 'ring-2 ring-indigo-500 shadow-md z-10'
    : '';

  // LOD 1 & LOD 2: Clean "Ad Soyad + Grouped Count" Card (No title/location clutter, impossible to overlap!)
  if (lodMode === 'cluster' || lodMode === 'name_only') {
    const isMacro = lodMode === 'cluster';
    const heatStyle =
      heatmapMode && node.directCount > 0 ? getHeatmapCardRing(node.directCount) : tier.compactCardClass;

    return (
      <div
        id={`org-node-${node.nodeId}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectNode(node);
        }}
        onMouseEnter={() => onHoverNode(node)}
        onMouseLeave={() => onHoverNode(null)}
        className={`shrink-0 ${
          isMacro ? 'w-[162px] px-2 py-1.5 rounded-xl' : 'w-[188px] px-2.5 py-2 rounded-xl'
        } ${tier.leftBorderClass} ${heatStyle} ${ringHighlight} ${
          dimmedByLevelFilter ? 'opacity-30 grayscale' : 'hover:shadow-md'
        } flex items-center justify-between gap-1.5 cursor-pointer transition-all select-none`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isMacro ? (
            <span className={`w-2 h-2 rounded-full shrink-0 ${tier.dotClass}`} />
          ) : (
            <span
              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${tier.avatarClass}`}
            >
              <TierIcon className="w-3 h-3" />
            </span>
          )}
          <span
            className={`${
              isMacro ? 'text-[10.5px]' : 'text-[11.5px]'
            } leading-tight truncate ${
              isL1 ? 'text-white' : 'text-slate-900 dark:text-white'
            }`}
          >
            {node.ad_soyad}
          </span>
        </div>

        {hasExpandableChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node);
            }}
            className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9.5px] font-mono flex items-center gap-0.5 cursor-pointer transition-colors ${
              heatmapMode && node.directCount > 0
                ? getHeatmapBadgeClass(node.directCount)
                : isExpanded
                ? isL1
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-teal-600 text-white'
                : isL1
                ? 'bg-white/15 text-amber-200 hover:bg-white/25'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-teal-100 dark:hover:bg-slate-700'
            }`}
            title={
              isExpanded
                ? lang === 'ru'
                  ? 'Свернуть ветку'
                  : 'Alt Ekibi Kapat'
                : lang === 'ru'
                ? 'Раскрыть ветку'
                : 'Alt Ekibi Aç'
            }
          >
            <span>
              {heatmapMode
                ? `${node.directCount}`
                : node.totalSubordinates > 0
                ? `+${node.totalSubordinates}`
                : '+'}
            </span>
            {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>
    );
  }

  // LOD 3 ('detailed' — zoom >= 96%): Full Executive & Operational Card
  const endirektPct =
    node.totalSubordinates > 0
      ? Math.round((node.subordinateEndirekt / node.totalSubordinates) * 100)
      : 0;

  return (
    <div
      id={`org-node-${node.nodeId}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectNode(node);
      }}
      onMouseEnter={() => onHoverNode(node)}
      onMouseLeave={() => onHoverNode(null)}
      className={`shrink-0 relative w-[244px] rounded-2xl overflow-hidden transition-all duration-150 cursor-pointer select-none ${
        heatmapMode && node.directCount > 0 ? getHeatmapCardRing(node.directCount) : tier.cardClass
      } ${ringHighlight} ${dimmedByLevelFilter ? 'opacity-30 grayscale' : 'hover:shadow-lg'}`}
    >
      <div className={`h-1.5 w-full ${tier.accentBarClass}`} />

      <div className="p-3">
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <span className={`px-1.5 py-0.5 rounded text-[9px] tracking-wide ${tier.pillClass}`}>
            {node.virtualKind === 'subcon'
              ? lang === 'ru'
                ? 'СУБПОДРЯД'
                : 'TAŞERON'
              : node.virtualKind === 'pending_pool'
              ? lang === 'ru'
                ? 'РЕЗЕРВ'
                : 'HAVUZ'
              : lang === 'ru'
              ? tier.badgeRu
              : tier.badgeTr}
          </span>

          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {node.totalSubordinates > 0 && (
              <button
                type="button"
                onClick={() => onFocusSubtree(node)}
                title={lang === 'ru' ? 'Фокус ветки' : 'Alt Şemayı Odakla'}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isL1
                    ? 'text-slate-300 hover:text-amber-300 hover:bg-white/10'
                    : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            )}
            {!node.isVirtual && node.personId && (
              <button
                type="button"
                onClick={() => onOpenFullProfile(node)}
                title={lang === 'ru' ? 'Полная карточка' : 'Tam Personel Kartı'}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isL1
                    ? 'text-slate-300 hover:text-emerald-300 hover:bg-white/10'
                    : 'text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div
            className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 text-[10px] ${tier.avatarClass}`}
          >
            <TierIcon className="w-3 h-3 mb-0.5 opacity-90" />
            <span className="leading-none">{getInitials(node.ad_soyad)}</span>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              className={`text-xs leading-snug truncate ${
                isL1 ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}
            >
              {node.ad_soyad}
            </h3>
            <p
              className={`text-[10.5px] leading-tight mt-0.5 truncate ${
                isL1 ? 'text-amber-300' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {translateVal(node.gorevi)}
            </p>
            <div
              className={`flex items-center gap-1 mt-1 text-[9.5px] truncate ${
                isL1 ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <MapPin className="w-2.5 h-2.5 shrink-0 opacity-75" />
              <span className="truncate">{translateVal(node.effective_site || node.region)}</span>
              {!node.isVirtual && node.sicil_no && (
                <span className="font-mono opacity-80 shrink-0">• #{node.sicil_no}</span>
              )}
            </div>
          </div>
        </div>

        {node.totalSubordinates > 0 && (
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1">
            <div className="flex items-center justify-between text-[9.5px]">
              <span className={isL1 ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}>
                {lang === 'ru' ? 'Прямые:' : 'Doğrudan:'} {node.directCount}
              </span>
              <span className={isL1 ? 'text-amber-200' : 'text-slate-600 dark:text-slate-300'}>
                B: {node.subordinateEndirekt} • M: {node.subordinateDirekt}
              </span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex">
              <div className="bg-indigo-500 h-full" style={{ width: `${endirektPct}%` }} />
              <div className="bg-teal-500 h-full" style={{ width: `${100 - endirektPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {hasExpandableChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node);
          }}
          className={`w-full py-1 px-3 text-[10.5px] flex items-center justify-between transition-colors cursor-pointer border-t ${
            isExpanded
              ? isL1
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-teal-600 text-white border-teal-600'
              : isL1
              ? 'bg-white/10 hover:bg-white/15 text-amber-200 border-white/15'
              : 'bg-slate-100/90 hover:bg-teal-50 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/80'
          }`}
        >
          <span>
            {isExpanded
              ? lang === 'ru'
                ? 'Свернуть'
                : 'Alt Ekibi Kapat'
              : `+${node.totalSubordinates.toLocaleString('tr-TR')} ${
                  lang === 'ru' ? 'чел.' : 'Kişi • Aç'
                }`}
          </span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

export default function OrganizationChartView({
  onNavigateToPersonnel,
}: OrganizationChartViewProps) {
  const { user } = useAuth();
  const { lang, translateVal } = useLanguage();

  const [people, setPeople] = useState<OrgRawPerson[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters, Layout & Pro Modes
  const [hierarchyMode, setHierarchyMode] = useState<OrgHierarchyMode>('combined');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [viewStyle, setViewStyle] = useState<'canvas' | 'directory'>('canvas');
  const [layoutStyle, setLayoutStyle] = useState<TreeLayoutStyle>('hybrid');
  const [heatmapMode, setHeatmapMode] = useState<boolean>(false);
  const [showMiniMap, setShowMiniMap] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [levelHighlight, setLevelHighlight] = useState<OrgRoleLevel | null>(null);
  const [activeLevelPreset, setActiveLevelPreset] = useState<number>(5);

  // Search, Hover, Selection & Crew Unpack States
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<OrgNode | null>(null);
  const [drawerPerson, setDrawerPerson] = useState<PersonnelRecord | null>(null);
  const [unpackedClusterKeys, setUnpackedClusterKeys] = useState<Set<string>>(new Set());
  const [openRosterKeys, setOpenRosterKeys] = useState<Set<string>>(new Set());

  // Expanded IDs + True Map Pan/Zoom Viewport State
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<number>(0.72);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 24, y: 20 });
  const [worldSize, setWorldSize] = useState<{ w: number; h: number }>({ w: 1600, h: 900 });
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>({ w: 1400, h: 700 });

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasWorldRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const didDragMoveRef = useRef<boolean>(false);
  const dragOriginRef = useRef<{ startX: number; startY: number; panX: number; panY: number }>({
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });
  const autoFitPassesRef = useRef<number>(2);
  const triggerAutoFit = useCallback(() => {
    autoFitPassesRef.current = 2;
  }, []);

  // Semantic Zoom Level of Detail (Map-style automatic detail progression)
  const lodMode: SemanticLodMode = useMemo(() => {
    if (zoom < 0.62) return 'cluster';
    if (zoom < 0.96) return 'name_only';
    return 'detailed';
  }, [zoom]);

  // Fetch active personnel for Org Chart (RLS aware)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (user?.scope_type && user.scope_type !== 'all' && user.scope_value) {
      params.set('userScopeType', user.scope_type);
      params.set('userScopeValue', user.scope_value);
    }
    fetch(`/api/org-chart?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res?.success && Array.isArray(res.people)) {
          setPeople(res.people);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Esc exits Fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Build full tree instantaneously in memory
  const orgResult = useMemo(
    () =>
      buildOrganizationHierarchy(people, {
        mode: hierarchyMode,
        siteFilter: selectedSite,
        departmentFilter: selectedDept,
        focusNodeId,
      }),
    [people, hierarchyMode, selectedSite, selectedDept, focusNodeId]
  );

  // Expand tree so the first N levels (default N = 5 -> depths 0..4 visible!) are shown
  const expandToVisibleLevels = useCallback(
    (visibleLevels: number, roots = orgResult.roots) => {
      const next = new Set<string>();
      const maxExpandDepth = Math.max(0, visibleLevels - 2);
      const walk = (n: OrgNode, relDepth: number) => {
        if (relDepth <= maxExpandDepth) {
          next.add(n.nodeId);
          for (const c of n.managerChildren) {
            walk(c, relDepth + 1);
          }
        }
      };
      for (const r of roots) {
        walk(r, 0);
      }
      setExpandedIds(next);
      setActiveLevelPreset(visibleLevels);
      setUnpackedClusterKeys(new Set());
      setOpenRosterKeys(new Set());
      triggerAutoFit();
    },
    [orgResult.roots, triggerAutoFit]
  );

  // Initial load & filter changes: automatically show FIRST 5 LEVELS and Auto-Zoom to fit!
  useEffect(() => {
    if (orgResult.roots.length > 0) {
      expandToVisibleLevels(5, orgResult.roots);
    }
  }, [orgResult.roots, expandToVisibleLevels]);

  // Auto-Fit calculation: fits current unscaled world dimensions cleanly inside the canvas viewport
  const fitCanvasToViewport = useCallback(() => {
    const vp = canvasViewportRef.current;
    const wd = canvasWorldRef.current;
    if (!vp || !wd) return;

    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    const natW = wd.offsetWidth;
    const natH = wd.offsetHeight;
    if (vpW <= 0 || vpH <= 0 || natW <= 0 || natH <= 0) return;

    setViewportSize({ w: vpW, h: vpH });
    setWorldSize({ w: natW, h: natH });

    const padX = 44;
    const padY = 44;
    const scaleX = (vpW - padX * 2) / natW;
    const scaleY = (vpH - padY * 2) / natH;
    const targetZoom = Math.min(1.05, Math.max(0.24, Math.round(Math.min(scaleX, scaleY) * 100) / 100));

    const centeredX = Math.round((vpW - natW * targetZoom) / 2);
    const topY = Math.max(18, Math.min(40, Math.round((vpH - natH * targetZoom) / 2)));

    setZoom(targetZoom);
    setPan({ x: centeredX, y: topY });
  }, []);

  // Measure world & viewport via ResizeObserver, and run pending Auto-Fit smoothly
  useEffect(() => {
    const vp = canvasViewportRef.current;
    const wd = canvasWorldRef.current;
    if (!vp || !wd) return;

    const syncSizes = () => {
      setViewportSize({ w: vp.clientWidth, h: vp.clientHeight });
      setWorldSize({ w: wd.offsetWidth, h: wd.offsetHeight });
      if (autoFitPassesRef.current > 0) {
        autoFitPassesRef.current -= 1;
        fitCanvasToViewport();
      }
    };

    const rafId = requestAnimationFrame(syncSizes);
    const timerId = setTimeout(syncSizes, 110);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        setViewportSize({ w: vp.clientWidth, h: vp.clientHeight });
        setWorldSize({ w: wd.offsetWidth, h: wd.offsetHeight });
        if (autoFitPassesRef.current > 0) {
          autoFitPassesRef.current -= 1;
          fitCanvasToViewport();
        }
      });
      ro.observe(vp);
      ro.observe(wd);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      if (ro) ro.disconnect();
    };
  }, [expandedIds, layoutStyle, viewStyle, isFullscreen, loading, lodMode, fitCanvasToViewport]);

  // Smooth Cursor-Centered Mouse Wheel Zoom (Map-like wheel zoom!)
  useEffect(() => {
    const vp = canvasViewportRef.current;
    if (!vp || viewStyle !== 'canvas') return;

    const onWheel = (e: WheelEvent) => {
      // Allow normal scrolling inside an open worker list box
      const target = e.target as HTMLElement | null;
      if (target?.closest('.max-h-52')) return;

      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      setZoom((prevZoom) => {
        const nextZoom = Math.min(1.6, Math.max(0.22, Math.round(prevZoom * factor * 100) / 100));
        if (nextZoom === prevZoom) return prevZoom;
        setPan((prevPan) => ({
          x: Math.round(cursorX - (cursorX - prevPan.x) * (nextZoom / prevZoom)),
          y: Math.round(cursorY - (cursorY - prevPan.y) * (nextZoom / prevZoom)),
        }));
        return nextZoom;
      });
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [viewStyle, loading]);

  // Zoom around viewport center when clicking corner +/-/LOD buttons
  const zoomAroundCenter = useCallback((targetZoom: number) => {
    const vp = canvasViewportRef.current;
    const clamped = Math.min(1.6, Math.max(0.22, Math.round(targetZoom * 100) / 100));
    if (!vp) {
      setZoom(clamped);
      return;
    }
    const cx = vp.clientWidth / 2;
    const cy = vp.clientHeight / 2;
    setZoom((prevZoom) => {
      if (prevZoom === clamped) return prevZoom;
      setPan((prevPan) => ({
        x: Math.round(cx - (cx - prevPan.x) * (clamped / prevZoom)),
        y: Math.round(cy - (cy - prevPan.y) * (clamped / prevZoom)),
      }));
      return clamped;
    });
  }, []);

  // Upward chain computation
  const getUpwardChain = useCallback(
    (startId: string | null): OrgNode[] => {
      if (!startId) return [];
      const chain: OrgNode[] = [];
      const seen = new Set<string>();
      let curr = orgResult.nodeById.get(startId);
      while (curr && !seen.has(curr.nodeId)) {
        seen.add(curr.nodeId);
        chain.unshift(curr);
        curr = curr.parentId ? orgResult.nodeById.get(curr.parentId) : undefined;
      }
      return chain;
    },
    [orgResult.nodeById]
  );

  const highlightChainIds = useMemo(() => {
    const chain = getUpwardChain(highlightedNodeId);
    return new Set(chain.map((n) => n.nodeId));
  }, [getUpwardChain, highlightedNodeId]);

  const focusBreadcrumb = useMemo(
    () => getUpwardChain(focusNodeId),
    [getUpwardChain, focusNodeId]
  );

  const selectedNode = selectedNodeId ? orgResult.nodeById.get(selectedNodeId) || null : null;
  const selectedNodeChain = useMemo(
    () => getUpwardChain(selectedNodeId),
    [getUpwardChain, selectedNodeId]
  );

  // Toggle expand on a manager card
  const handleToggleExpand = useCallback((node: OrgNode) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.nodeId)) {
        const collapseRec = (n: OrgNode) => {
          next.delete(n.nodeId);
          for (const c of n.managerChildren) collapseRec(c);
        };
        collapseRec(node);
      } else {
        next.add(node.nodeId);
      }
      return next;
    });
  }, []);

  // Search autocomplete results across all real employees
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: OrgNode[] = [];
    for (const n of Array.from(orgResult.nodeById.values())) {
      if (n.isVirtual) continue;
      if (
        n.ad_soyad.toLowerCase().includes(q) ||
        n.sicil_no.toLowerCase().includes(q) ||
        n.gorevi.toLowerCase().includes(q)
      ) {
        matches.push(n);
      }
    }
    matches.sort((a, b) => {
      if (a.roleLevel !== b.roleLevel) return a.roleLevel - b.roleLevel;
      return b.totalSubordinates - a.totalSubordinates;
    });
    return matches.slice(0, 12);
  }, [searchQuery, orgResult.nodeById]);

  // Locate a searched person -> expand entire upward chain, zoom in to readable level & center on them!
  const handleLocatePersonInChart = useCallback(
    (target: OrgNode) => {
      setFocusNodeId(null);
      const chain = getUpwardChain(target.nodeId);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const anc of chain) {
          if (anc.nodeId !== target.nodeId || target.totalSubordinates > 0) {
            next.add(anc.nodeId);
          }
          if (anc.parentId) {
            next.add(anc.parentId);
          }
        }
        return next;
      });
      // Unpack any parent cluster & worker roster if target is a leaf
      if (target.parentId) {
        setUnpackedClusterKeys((prev) => new Set(prev).add(`cluster_${target.parentId}`));
        setOpenRosterKeys((prev) => {
          const next = new Set(prev);
          next.add(`wrk_${target.parentId}`);
          next.add(`spc_${target.parentId}`);
          return next;
        });
      }

      setHighlightedNodeId(target.nodeId);
      setSelectedNodeId(target.nodeId);
      setSearchQuery('');

      setTimeout(() => {
        const vp = canvasViewportRef.current;
        const wd = canvasWorldRef.current;
        const el = document.getElementById(`org-node-${target.nodeId}`);
        if (vp && wd && el) {
          const wdRect = wd.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const curZoom = zoom || 1;
          const localCenterX = (elRect.left - wdRect.left + elRect.width / 2) / curZoom;
          const localCenterY = (elRect.top - wdRect.top + elRect.height / 2) / curZoom;
          const targetZoom = Math.max(zoom, 0.98);
          setZoom(targetZoom);
          setPan({
            x: Math.round(vp.clientWidth / 2 - localCenterX * targetZoom),
            y: Math.round(vp.clientHeight / 2 - localCenterY * targetZoom),
          });
        }
      }, 80);
    },
    [getUpwardChain, zoom]
  );

  // Export full hierarchy to .xlsx (Strictly zero salary columns, dd.mm.yyyy dates)
  const handleExportExcel = () => {
    const rows: Record<string, string | number>[] = [];
    const walk = (n: OrgNode, chainNames: string[]) => {
      const nextChain = [...chainNames, n.ad_soyad];
      if (!n.isVirtual) {
        rows.push({
          Kademe: `L${n.roleLevel}`,
          Derinlik: n.depth + 1,
          'Sicil No': n.sicil_no,
          'Ad Soyad': n.ad_soyad,
          Görev: n.gorevi,
          'Yaka Türü': n.endirekt_direkt,
          Şantiye: n.effective_site,
          Departman: n.departman,
          'Sorumlu Kişi (eBA)': n.sorumlu_kisi || '-',
          'Grup Şefi (eBA)': n.grup_sefi || '-',
          'Doğrudan Bağlı': n.directCount,
          'Toplam Alt Kadro': n.totalSubordinates,
          'İşe Giriş Tarihi': n.ise_giris_tarihi || '-',
          'Raporlama Zinciri': nextChain.join(' ➔ '),
        });
      }
      for (const m of n.managerChildren) walk(m, nextChain);
      for (const s of n.specialistLeaves) walk(s, nextChain);
      for (const w of n.workerLeaves) walk(w, nextChain);
    };
    for (const r of orgResult.roots) walk(r, []);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Organizasyon_Hiyerarsisi');
    XLSX.writeFile(
      wb,
      `Pondera_Organizasyon_Semasi_${selectedSite === 'all' ? 'Tum_Sirket' : selectedSite}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
  };

  const handleToggleRosterBox = useCallback((key: string) => {
    setOpenRosterKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /**
   * Non-Overlapping Subtree Renderer supporting:
   * - 3 Layout Styles: 'hybrid' (Horizontal top tiers + Vertical indented branches for 5-level fit!), 'vertical', 'horizontal'
   * - Map-style Child Clustering when zoomed out (lodMode === 'cluster')
   */
  const renderSubtree = (node: OrgNode, relDepth = 0): React.ReactNode => {
    const hasExpandable =
      node.managerChildren.length > 0 ||
      node.specialistLeaves.length > 0 ||
      node.workerLeaves.length > 0;
    const isExpanded = expandedIds.has(node.nodeId);

    const cardEl = (
      <OrgSemanticNodeCard
        node={node}
        lodMode={lodMode}
        heatmapMode={heatmapMode}
        isExpanded={isExpanded}
        hasExpandableChildren={hasExpandable}
        isSelected={selectedNodeId === node.nodeId}
        isInHighlightChain={highlightChainIds.has(node.nodeId)}
        isHighlightedTarget={highlightedNodeId === node.nodeId}
        dimmedByLevelFilter={levelHighlight !== null && node.roleLevel !== levelHighlight}
        lang={lang}
        translateVal={translateVal}
        onToggleExpand={handleToggleExpand}
        onSelectNode={(n) => setSelectedNodeId(n.nodeId)}
        onFocusSubtree={(n) => {
          setFocusNodeId(n.nodeId);
          triggerAutoFit();
        }}
        onOpenFullProfile={(n) => setDrawerPerson(toMinimalPersonnelRecord(n))}
        onHoverNode={setHoveredNode}
      />
    );

    if (!isExpanded || !hasExpandable) {
      return (
        <div key={node.nodeId} className="shrink-0 w-max flex flex-col items-center">
          {cardEl}
        </div>
      );
    }

    // Map-Style Clustering when zoomed out (lodMode === 'cluster'):
    // At deeper levels (relDepth >= 1), if a manager has > 4 managerChildren, show top 3 + a "+N Grup/Sorumlu • +X Kişi" cluster pill
    const clusterKey = `cluster_${node.nodeId}`;
    const isClusterUnpacked = unpackedClusterKeys.has(clusterKey);
    const shouldClusterSiblings =
      lodMode === 'cluster' &&
      relDepth >= 1 &&
      node.managerChildren.length > 4 &&
      !isClusterUnpacked;

    const visibleManagerChildren = shouldClusterSiblings
      ? node.managerChildren.filter(
          (c, idx) => idx < 3 || highlightChainIds.has(c.nodeId) || c.nodeId === selectedNodeId
        )
      : node.managerChildren;

    const clusteredCount = node.managerChildren.length - visibleManagerChildren.length;
    const clusteredHeadcount = shouldClusterSiblings
      ? node.managerChildren
          .filter((c) => !visibleManagerChildren.includes(c))
          .reduce((acc, c) => acc + 1 + c.totalSubordinates, 0)
      : 0;

    const clusterPillEl =
      clusteredCount > 0 ? (
        <button
          key={`cluster-btn-${node.nodeId}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setUnpackedClusterKeys((prev) => new Set(prev).add(clusterKey));
          }}
          className="shrink-0 w-max px-2.5 py-1.5 rounded-xl bg-indigo-600/95 hover:bg-indigo-500 text-white border border-indigo-400 shadow-xs text-[10.5px] flex items-center gap-1.5 cursor-pointer transition-all"
          title={
            lang === 'ru'
              ? 'Нажмите или приблизьте колесом мыши для раскрытия группы'
              : 'Grubu açmak için tıklayın veya fare tekerleğiyle yakınlaşın'
          }
        >
          <Users className="w-3 h-3 text-amber-300 shrink-0" />
          <span>
            +{clusteredCount} {lang === 'ru' ? 'рук.' : 'Lider'}
          </span>
          <span className="px-1.5 py-0.2 rounded bg-white/20 font-mono text-[9.5px]">
            {clusteredHeadcount} {lang === 'ru' ? 'чел.' : 'Kişi'}
          </span>
        </button>
      ) : null;

    // Consolidated Leaf Elements (Specialists + Field Workers)
    const leafItems: React.ReactNode[] = [];
    if (node.specialistLeaves.length > 0) {
      if (node.specialistLeaves.length <= 2 && lodMode !== 'cluster') {
        for (const sp of node.specialistLeaves) {
          leafItems.push(renderSubtree(sp, relDepth + 1));
        }
      } else {
        const spKey = `spc_${node.nodeId}`;
        leafItems.push(
          <ConsolidatedCrewBox
            key={spKey}
            boxKey={spKey}
            title={lang === 'ru' ? 'Специалисты (ИТР)' : 'Uzman & Mühendisler'}
            members={node.specialistLeaves}
            variant="specialists"
            lodMode={lodMode}
            forceRosterOpen={openRosterKeys.has(spKey)}
            onToggleForceOpen={handleToggleRosterBox}
            highlightedNodeId={highlightedNodeId}
            lang={lang}
            translateVal={translateVal}
            onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
            onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
          />
        );
      }
    }

    if (node.workerLeaves.length > 0) {
      const wrkKey = `wrk_${node.nodeId}`;
      leafItems.push(
        <ConsolidatedCrewBox
          key={wrkKey}
          boxKey={wrkKey}
          title={lang === 'ru' ? 'Рабочая бригада' : 'Saha İşçileri Ekip Listesi'}
          members={node.workerLeaves}
          variant="workers"
          lodMode={lodMode}
          forceRosterOpen={openRosterKeys.has(wrkKey)}
          onToggleForceOpen={handleToggleRosterBox}
          highlightedNodeId={highlightedNodeId}
          lang={lang}
          translateVal={translateVal}
          onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
          onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
        />
      );
    }

    // 1. LEFT-TO-RIGHT HORIZONTAL TREE LAYOUT (GitHub d3-org-chart horizontal style)
    if (layoutStyle === 'horizontal') {
      return (
        <div key={node.nodeId} className="shrink-0 w-max flex items-center gap-5">
          {cardEl}
          <div className="w-5 h-0.5 bg-slate-300 dark:bg-slate-600 -mx-5 translate-x-2.5" />
          <div className="pl-4 border-l-2 border-slate-300 dark:border-slate-600 flex flex-col gap-2.5 py-1">
            {visibleManagerChildren.map((child) => (
              <div key={child.nodeId} className="relative flex items-center">
                <span className="w-4 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-4 mr-1 shrink-0" />
                {renderSubtree(child, relDepth + 1)}
              </div>
            ))}
            {clusterPillEl && (
              <div className="relative flex items-center">
                <span className="w-4 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-4 mr-1 shrink-0" />
                {clusterPillEl}
              </div>
            )}
            {leafItems.map((lf, idx) => (
              <div key={`lf-${node.nodeId}-${idx}`} className="relative flex items-center">
                <span className="w-4 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-4 mr-1 shrink-0" />
                {lf}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 2. HYBRID 5-LEVEL TREE LAYOUT (Default):
    // Root (relDepth 0) spreads Level-2 Leaders horizontally; from relDepth >= 1 downward,
    // sub-levels (Levels 3, 4, 5) stack as a crisp indented vertical tree column so all 5 levels fit on 1 screen with ZERO overlap!
    const useVerticalIndentedBranch = layoutStyle === 'hybrid' && relDepth >= 1;

    if (useVerticalIndentedBranch) {
      return (
        <div key={node.nodeId} className="shrink-0 w-max flex flex-col items-start">
          {cardEl}
          <div className="ml-5 pl-3.5 pt-2 border-l-2 border-slate-300 dark:border-slate-600 flex flex-col items-start gap-2">
            {visibleManagerChildren.map((child) => (
              <div key={child.nodeId} className="relative flex items-start">
                <span className="w-3.5 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-3.5 mt-3.5 shrink-0" />
                {renderSubtree(child, relDepth + 1)}
              </div>
            ))}
            {clusterPillEl && (
              <div className="relative flex items-center">
                <span className="w-3.5 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-3.5 shrink-0" />
                {clusterPillEl}
              </div>
            )}
            {leafItems.map((lf, idx) => (
              <div key={`hyb-lf-${node.nodeId}-${idx}`} className="relative flex items-start">
                <span className="w-3.5 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-3.5 mt-3.5 shrink-0" />
                {lf}
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 3. CLASSIC TOP-DOWN HORIZONTAL FAN-OUT (Used for Root in Hybrid, and all levels in 'vertical')
    const allTopDownChildren: React.ReactNode[] = [
      ...visibleManagerChildren.map((c) => renderSubtree(c, relDepth + 1)),
      ...(clusterPillEl ? [clusterPillEl] : []),
      ...leafItems,
    ];

    return (
      <div key={node.nodeId} className="shrink-0 w-max flex flex-col items-center">
        {cardEl}
        <div className="w-0.5 h-5 bg-slate-300 dark:bg-slate-600" />
        <div className="flex items-start justify-center gap-3.5 w-max relative">
          {allTopDownChildren.map((childEl, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === allTopDownChildren.length - 1;
            const onlyOne = allTopDownChildren.length === 1;
            return (
              <div key={`td-${node.nodeId}-${idx}`} className="shrink-0 w-max flex flex-col items-center relative pt-3.5">
                {!onlyOne && (
                  <>
                    {!isFirst && (
                      <div className="absolute top-0 left-0 right-1/2 h-0.5 bg-slate-300 dark:bg-slate-600 -ml-2" />
                    )}
                    {!isLast && (
                      <div className="absolute top-0 left-1/2 right-0 h-0.5 bg-slate-300 dark:bg-slate-600 -mr-2" />
                    )}
                  </>
                )}
                <div className="w-0.5 h-3.5 bg-slate-300 dark:bg-slate-600 -mt-3.5" />
                {childEl}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Compact Directory Outline Renderer (alternative view mode)
  const renderDirectoryRow = (node: OrgNode, indent = 0): React.ReactNode => {
    const hasKids =
      node.managerChildren.length > 0 ||
      node.specialistLeaves.length > 0 ||
      node.workerLeaves.length > 0;
    const isExp = expandedIds.has(node.nodeId);
    const tier = ROLE_TIER_CONFIG[node.roleLevel];
    const TierIcon = tier.icon;

    return (
      <div key={node.nodeId}>
        <div
          style={{ paddingLeft: `${Math.min(indent * 22, 160) + 12}px` }}
          onClick={() => (hasKids ? handleToggleExpand(node) : setSelectedNodeId(node.nodeId))}
          className={`py-2 pr-4 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-xs ${
            highlightedNodeId === node.nodeId ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {hasKids ? (
              <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                {isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </span>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${tier.avatarClass}`}>
              <TierIcon className="w-3.5 h-3.5" />
            </span>
            <span className="text-slate-900 dark:text-white truncate">{node.ad_soyad}</span>
            <span className="text-slate-500 dark:text-slate-400 truncate">
              • {translateVal(node.gorevi)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
              {translateVal(node.effective_site)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {node.totalSubordinates > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[11px]">
                +{node.totalSubordinates.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'Kişi'}
              </span>
            )}
            {!node.isVirtual && node.personId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerPerson(toMinimalPersonnelRecord(node));
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isExp && hasKids && (
          <div>
            {node.managerChildren.map((c) => renderDirectoryRow(c, indent + 1))}
            {node.specialistLeaves.map((s) => renderDirectoryRow(s, indent + 1))}
            {node.workerLeaves.length > 0 && (
              <div
                style={{ paddingLeft: `${Math.min((indent + 1) * 22, 180) + 16}px` }}
                className="py-2 pr-4 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800"
              >
                <ConsolidatedCrewBox
                  boxKey={`dir_wrk_${node.nodeId}`}
                  title={lang === 'ru' ? 'Рабочая бригада' : 'Saha İşçileri Ekip Listesi'}
                  members={node.workerLeaves}
                  variant="workers"
                  lodMode="detailed"
                  forceRosterOpen={true}
                  onToggleForceOpen={() => {}}
                  highlightedNodeId={highlightedNodeId}
                  lang={lang}
                  translateVal={translateVal}
                  onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
                  onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Mini-Map Radar Calculations (Proportional Viewport Indicator)
  const miniMapMetrics = useMemo(() => {
    const mapW = 156;
    const mapH = 94;
    const wW = Math.max(worldSize.w, 1);
    const wH = Math.max(worldSize.h, 1);
    const scale = Math.min(mapW / wW, mapH / wH);
    const drawnW = wW * scale;
    const drawnH = wH * scale;
    const offsetX = (mapW - drawnW) / 2;
    const offsetY = (mapH - drawnH) / 2;

    // Visible rectangle in world coordinates
    const visWorldX = -pan.x / zoom;
    const visWorldY = -pan.y / zoom;
    const visWorldW = viewportSize.w / zoom;
    const visWorldH = viewportSize.h / zoom;

    const rectLeft = Math.max(0, Math.min(mapW - 12, offsetX + visWorldX * scale));
    const rectTop = Math.max(0, Math.min(mapH - 10, offsetY + visWorldY * scale));
    const rectW = Math.max(14, Math.min(mapW, visWorldW * scale));
    const rectH = Math.max(10, Math.min(mapH, visWorldH * scale));

    return { mapW, mapH, scale, offsetX, offsetY, drawnW, drawnH, rectLeft, rectTop, rectW, rectH };
  }, [worldSize, viewportSize, pan, zoom]);

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[80] bg-[#F8FAFC] dark:bg-[#0B1120] p-3 flex flex-col gap-2.5 overflow-hidden'
          : 'px-3 sm:px-4 py-2.5 space-y-2.5'
      }
    >
      {/* 1. COMPACT SINGLE-ROW HEADER (No bulky top KPI boxes — maximum space for the chart!) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
            <GitFork className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
              {lang === 'ru'
                ? 'Организационная структура и иерархия'
                : 'Organizasyon Şeması & Raporlama Hiyerarşisi'}
            </h1>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <span>
                {orgResult.totalStaff.toLocaleString('tr-TR')}{' '}
                {lang === 'ru' ? 'сотр.' : 'Aktif'}
              </span>
              <span>•</span>
              <span>
                {orgResult.totalManagers} {lang === 'ru' ? 'рук.' : 'Yönetici'}
              </span>
              <span>•</span>
              <span>
                {orgResult.maxDepth + 1} {lang === 'ru' ? 'уров.' : 'Kademe'}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hierarchy Source Selector */}
          <div className="inline-flex p-0.5 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs">
            {(
              [
                {
                  id: 'combined',
                  tr: 'Birleşik (Grup Şefi ➔ Sorumlu)',
                  ru: 'Полная (Нач. гр. ➔ Отв.)',
                },
                { id: 'sorumlu', tr: 'Sorumlu Kişi', ru: 'По ответственному' },
                { id: 'grup_sefi', tr: 'Grup Şefi', ru: 'По нач. группы' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setHierarchyMode(m.id)}
                className={`px-2.5 py-1 rounded-lg text-[11.5px] transition-all cursor-pointer ${
                  hierarchyMode === m.id
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lang === 'ru' ? m.ru : m.tr}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11.5px] bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? 'Экспорт (.xlsx)' : 'Hiyerarşi İndir (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* 2. COMPACT CONTROL DECK: SINGLE-LINE ROLE FORMAT BAR + SEARCH & LAYOUT SWITCHERS */}
      <div className="px-3 py-2 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2">
        {/* SINGLE-LINE Görev Seviyesi Kart Formatları (Guaranteed 1 row!) */}
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap no-scrollbar pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 mr-0.5">
            {lang === 'ru' ? 'Форматы уровней:' : 'Görev Seviyesi Kart Formatları:'}
          </span>
          {([1, 2, 3, 4, 5, 6] as OrgRoleLevel[]).map((lvl) => {
            const cfg = ROLE_TIER_CONFIG[lvl];
            const Icon = cfg.icon;
            const active = levelHighlight === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelHighlight((cur) => (cur === lvl ? null : lvl))}
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] border transition-all cursor-pointer ${
                  active
                    ? 'ring-2 ring-teal-500 bg-slate-900 text-white dark:bg-teal-600 border-transparent'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${cfg.avatarClass}`}>
                  <Icon className="w-2.5 h-2.5" />
                </span>
                <span>{lang === 'ru' ? cfg.shortRu : cfg.shortTr}</span>
                <span className="px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 text-[9.5px] font-mono">
                  {orgResult.levelCounts[lvl].toLocaleString('tr-TR')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + Site Pills + Layout & Heatmap Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Smart Search */}
          <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ru'
                  ? 'Поиск ФИО / табеля ➔ цепочка...'
                  : 'Kişi veya Sicil ara ➔ Zinciri aç...'
              }
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
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

            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {searchResults.map((res) => {
                  const cfg = ROLE_TIER_CONFIG[res.roleLevel];
                  return (
                    <button
                      key={res.nodeId}
                      type="button"
                      onClick={() => handleLocatePersonInChart(res)}
                      className="w-full px-3 py-2 text-left hover:bg-teal-50/60 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-slate-900 dark:text-white truncate">
                          {res.ad_soyad}{' '}
                          <span className="font-mono text-[10px] text-slate-400">
                            #{res.sicil_no}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                          {translateVal(res.gorevi)} • {translateVal(res.effective_site)}
                        </div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[9.5px] shrink-0 ${cfg.pillClass}`}>
                        L{res.roleLevel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Site Quick Pills (scrollable single strip) */}
          <div className="flex-1 min-w-[200px] flex items-center gap-1 overflow-x-auto whitespace-nowrap no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setSelectedSite('all');
                setFocusNodeId(null);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer border transition-all ${
                selectedSite === 'all'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                  : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              {lang === 'ru' ? 'Вся компания' : 'Tüm Şirket'} ({people.length.toLocaleString('tr-TR')})
            </button>
            {orgResult.sites.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setSelectedSite(s.name);
                  setFocusNodeId(null);
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap cursor-pointer border transition-all ${
                  selectedSite === s.name
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {translateVal(s.name)} ({s.count.toLocaleString('tr-TR')})
              </button>
            ))}
          </div>

          {/* Right Pro Switches: Department + Layout Style + Span Heatmap + Şema/Dizin */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setFocusNodeId(null);
              }}
              className="px-2 py-1 rounded-xl text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none max-w-[155px]"
            >
              <option value="all">{lang === 'ru' ? 'Все отделы' : 'Tüm Departmanlar'}</option>
              {orgResult.departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {translateVal(d.name)} ({d.count})
                </option>
              ))}
            </select>

            {/* 3-Way Tree Layout Switcher (GitHub d3-org-chart inspired) */}
            {viewStyle === 'canvas' && (
              <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {(
                  [
                    { id: 'hybrid', tr: 'Hibrit 5K', ru: 'Гибрид 5У', icon: Network },
                    { id: 'vertical', tr: 'Dikey', ru: 'Вертик.', icon: GitFork },
                    { id: 'horizontal', tr: 'Sol➔Sağ', ru: 'Горизонт.', icon: ArrowRightLeft },
                  ] as const
                ).map((ly) => {
                  const LIcon = ly.icon;
                  return (
                    <button
                      key={ly.id}
                      type="button"
                      onClick={() => {
                        setLayoutStyle(ly.id);
                        triggerAutoFit();
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer transition-colors ${
                        layoutStyle === ly.id
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                      }`}
                    >
                      <LIcon className="w-3 h-3" />
                      <span>{lang === 'ru' ? ly.ru : ly.tr}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Span-of-Control Heatmap Toggle */}
            {viewStyle === 'canvas' && (
              <button
                type="button"
                onClick={() => setHeatmapMode((v) => !v)}
                title={
                  lang === 'ru'
                    ? 'Тепловая карта нагрузки руководителей (1-8 зеленый, 9-20 желтый, 21+ красный)'
                    : 'Yönetim Yükü Isı Haritası: Yeşil (1-8 Dengeli), Sarı (9-20 Yoğun), Kırmızı (21+ Aşırı Yük)'
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] border cursor-pointer transition-all ${
                  heatmapMode
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Нагрузка' : 'Yük Haritası'}</span>
              </button>
            )}

            {/* Canvas vs Directory */}
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewStyle('canvas')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer ${
                  viewStyle === 'canvas'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span>{lang === 'ru' ? 'Схема' : 'Şema'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('directory')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer ${
                  viewStyle === 'directory'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <ListTree className="w-3 h-3" />
                <span>{lang === 'ru' ? 'Список' : 'Dizin'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Breadcrumb Bar when Subtree Focus or Highlight Chain is active */}
      {(focusBreadcrumb.length > 0 || highlightChainIds.size > 0) && (
        <div className="px-3 py-1.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-indigo-800 dark:text-indigo-200">
              {focusNodeId
                ? lang === 'ru'
                  ? 'Фокус ветки:'
                  : 'Odaklanan Alt Şema:'
                : lang === 'ru'
                ? 'Цепочка:'
                : 'Zincir:'}
            </span>
            <button
              type="button"
              onClick={() => {
                setFocusNodeId(null);
                setHighlightedNodeId(null);
                triggerAutoFit();
              }}
              className="text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
            >
              Pondera Industry
            </button>
            {(focusNodeId ? focusBreadcrumb : getUpwardChain(highlightedNodeId)).map((item) => (
              <React.Fragment key={item.nodeId}>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(item.nodeId);
                    if (focusNodeId) setFocusNodeId(item.nodeId);
                  }}
                  className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-slate-800 dark:text-slate-100 hover:border-teal-500 cursor-pointer text-[11px]"
                >
                  {item.ad_soyad}
                </button>
              </React.Fragment>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setFocusNodeId(null);
              setHighlightedNodeId(null);
              triggerAutoFit();
            }}
            className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer text-[11px]"
          >
            {lang === 'ru' ? 'Вся схема' : 'Tam Şemaya Dön'}
          </button>
        </div>
      )}

      {/* 3. FULL-WIDTH MAP-STYLE INTERACTIVE ORG CHART CANVAS */}
      <div
        className={`relative bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden ${
          isFullscreen ? 'flex-1 min-h-0' : 'h-[calc(100vh-226px)] min-h-[540px]'
        }`}
      >
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {lang === 'ru'
                ? 'Построение организационной структуры...'
                : 'Organizasyon hiyerarşisi oluşturuluyor...'}
            </p>
          </div>
        ) : orgResult.roots.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            {lang === 'ru'
              ? 'Сотрудники по выбранному фильтру не найдены.'
              : 'Seçilen filtreye uygun personel bulunamadı.'}
          </div>
        ) : viewStyle === 'directory' ? (
          <div className="h-full overflow-y-auto">{orgResult.roots.map((r) => renderDirectoryRow(r, 0))}</div>
        ) : (
          <>
            {/* Interactive Pan + Wheel-Zoom Map Surface */}
            <div
              ref={canvasViewportRef}
              onMouseDown={(e) => {
                if (e.button !== 0 && e.button !== 1) return;
                const target = e.target as HTMLElement | null;
                if (target?.closest('button, input, select')) return;
                isDraggingRef.current = true;
                didDragMoveRef.current = false;
                dragOriginRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  panX: pan.x,
                  panY: pan.y,
                };
              }}
              onMouseMove={(e) => {
                if (!isDraggingRef.current) return;
                const dx = e.clientX - dragOriginRef.current.startX;
                const dy = e.clientY - dragOriginRef.current.startY;
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                  didDragMoveRef.current = true;
                }
                setPan({
                  x: dragOriginRef.current.panX + dx,
                  y: dragOriginRef.current.panY + dy,
                });
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
              }}
              onMouseLeave={() => {
                isDraggingRef.current = false;
                setHoveredNode(null);
              }}
              onClick={(e) => {
                if (didDragMoveRef.current) return;
                if (e.target === e.currentTarget) {
                  setSelectedNodeId(null);
                }
              }}
              style={{
                backgroundPosition: `${pan.x}px ${pan.y}px`,
                backgroundSize: `${Math.max(12, Math.round(20 * zoom))}px ${Math.max(
                  12,
                  Math.round(20 * zoom)
                )}px`,
              }}
              className="w-full h-full overflow-hidden relative cursor-grab active:cursor-grabbing select-none bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)]"
            >
              <div
                ref={canvasWorldRef}
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
                className="w-max p-6 flex items-start gap-8 will-change-transform"
              >
                {orgResult.roots.map((rootNode) => renderSubtree(rootNode, 0))}
              </div>
            </div>

            {/* TOP-LEFT FLOATING SEMANTIC ZOOM (LOD) INDICATOR PILL */}
            <div className="absolute top-3 left-3 z-30 inline-flex items-center gap-1 p-1 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-md text-[10.5px]">
              {(
                [
                  { id: 'cluster', tr: 'Küme (Gruplu)', ru: 'Кластеры', targetZoom: 0.5 },
                  { id: 'name_only', tr: 'Ad Soyad', ru: 'Только ФИО', targetZoom: 0.78 },
                  { id: 'detailed', tr: 'Tam Detay', ru: 'Детально', targetZoom: 1.05 },
                ] as const
              ).map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => zoomAroundCenter(step.targetZoom)}
                  className={`px-2 py-1 rounded-lg cursor-pointer transition-all ${
                    lodMode === step.id
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {lang === 'ru' ? step.ru : step.tr}
                </button>
              ))}
            </div>

            {/* FLOATING INSTANT HOVER QUICK-CARD (Top-Center when hovering any compact box!) */}
            {hoveredNode && lodMode !== 'detailed' && (
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white border border-emerald-500/40 shadow-xl backdrop-blur-md flex items-center gap-3 max-w-md animate-in fade-in duration-100">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ROLE_TIER_CONFIG[hoveredNode.roleLevel].dotClass}`} />
                <div className="min-w-0">
                  <div className="text-xs text-white truncate">
                    {hoveredNode.ad_soyad}{' '}
                    {hoveredNode.sicil_no && !hoveredNode.isVirtual && (
                      <span className="font-mono text-[10px] text-emerald-300">
                        #{hoveredNode.sicil_no}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] text-slate-300 truncate">
                    {translateVal(hoveredNode.gorevi)} • {translateVal(hoveredNode.effective_site)}
                  </div>
                </div>
                {hoveredNode.totalSubordinates > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10.5px] font-mono shrink-0">
                    +{hoveredNode.totalSubordinates}
                  </span>
                )}
              </div>
            )}

            {/* BOTTOM-LEFT INTERACTIVE MINI-MAP RADAR (GitHub React Flow inspired) */}
            {showMiniMap && (
              <div className="hidden sm:block absolute bottom-3 left-3 z-30 p-2 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-lg">
                <div className="flex items-center justify-between text-[9.5px] text-slate-500 dark:text-slate-400 mb-1 px-0.5">
                  <span>{lang === 'ru' ? 'Радар схемы' : 'Şema Haritası'}</span>
                  <span className="font-mono">{Math.round(zoom * 100)}%</span>
                </div>
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left - miniMapMetrics.offsetX;
                    const clickY = e.clientY - rect.top - miniMapMetrics.offsetY;
                    const worldClickX = clickX / miniMapMetrics.scale;
                    const worldClickY = clickY / miniMapMetrics.scale;
                    setPan({
                      x: Math.round(viewportSize.w / 2 - worldClickX * zoom),
                      y: Math.round(viewportSize.h / 2 - worldClickY * zoom),
                    });
                  }}
                  style={{ width: `${miniMapMetrics.mapW}px`, height: `${miniMapMetrics.mapH}px` }}
                  className="relative rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 overflow-hidden cursor-crosshair"
                >
                  {/* Tree footprint silhouette */}
                  <div
                    style={{
                      left: `${miniMapMetrics.offsetX}px`,
                      top: `${miniMapMetrics.offsetY}px`,
                      width: `${Math.max(8, miniMapMetrics.drawnW)}px`,
                      height: `${Math.max(8, miniMapMetrics.drawnH)}px`,
                    }}
                    className="absolute rounded bg-gradient-to-b from-amber-400/35 via-indigo-500/25 to-emerald-500/30 border border-teal-500/30"
                  />
                  {/* Live Viewport Window */}
                  <div
                    style={{
                      left: `${miniMapMetrics.rectLeft}px`,
                      top: `${miniMapMetrics.rectTop}px`,
                      width: `${miniMapMetrics.rectW}px`,
                      height: `${miniMapMetrics.rectH}px`,
                    }}
                    className="absolute rounded border-2 border-emerald-500 bg-emerald-500/15 pointer-events-none transition-all duration-75"
                  />
                </div>
              </div>
            )}

            {/* BOTTOM-RIGHT CORNER ZOOM & DEPTH DOCK (Anchored right inside the chart corner!) */}
            <div
              className={`absolute bottom-3 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-xl transition-all ${
                selectedNode ? 'right-3 lg:right-[316px]' : 'right-3'
              }`}
            >
              {/* Quick Level Presets (2K, 3K, 5K Default, Tümü) */}
              <div className="hidden md:flex items-center gap-0.5 pr-1.5 border-r border-slate-200 dark:border-slate-700">
                {(
                  [
                    { lvl: 2, label: '2K' },
                    { lvl: 3, label: '3K' },
                    { lvl: 5, label: '5K' },
                    { lvl: 9, label: lang === 'ru' ? 'Все' : 'Tümü' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.lvl}
                    type="button"
                    onClick={() => expandToVisibleLevels(preset.lvl)}
                    title={
                      preset.lvl === 9
                        ? lang === 'ru'
                          ? 'Открыть все уровни'
                          : 'Tüm Kademeleri Aç'
                        : `${preset.lvl} ${lang === 'ru' ? 'уровней' : 'Kademe Göster'}`
                    }
                    className={`px-2 py-1 rounded-lg text-[10.5px] cursor-pointer transition-colors ${
                      activeLevelPreset === preset.lvl
                        ? 'bg-slate-900 dark:bg-teal-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Zoom Out / % / Zoom In */}
              <button
                type="button"
                onClick={() => zoomAroundCenter(zoom - 0.12)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                title={lang === 'ru' ? 'Отдалить' : 'Uzaklaş (-)'}
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => zoomAroundCenter(1)}
                className="px-1.5 py-1 rounded-lg font-mono text-xs text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 min-w-[46px] text-center cursor-pointer"
                title="%100 Yakınlık"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() => zoomAroundCenter(zoom + 0.12)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                title={lang === 'ru' ? 'Приблизить' : 'Yakınlaş (+)'}
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              {/* Auto-Fit to Screen */}
              <button
                type="button"
                onClick={fitCanvasToViewport}
                className="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs"
                title={lang === 'ru' ? 'Авто-масштаб по экрану' : 'Otomatik Ekrana Sığdır (Auto-Zoom)'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Авто' : 'Sığdır'}</span>
              </button>

              {/* Toggle Mini-Map */}
              <button
                type="button"
                onClick={() => setShowMiniMap((v) => !v)}
                className={`hidden sm:flex p-1.5 rounded-xl cursor-pointer transition-colors ${
                  showMiniMap
                    ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={lang === 'ru' ? 'Мини-карта' : 'Şema Radar Haritası'}
              >
                <MapIcon className="w-4 h-4" />
              </button>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsFullscreen((v) => !v);
                  triggerAutoFit();
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                title={
                  isFullscreen
                    ? lang === 'ru'
                      ? 'Выйти из полного экрана'
                      : 'Tam Ekrandan Çık (Esc)'
                    : lang === 'ru'
                    ? 'На весь экран'
                    : 'Tam Ekran Sunum Modu'
                }
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}

        {/* FLOATING SLIDE-OVER INSPECTOR DRAWER (Does NOT shrink canvas width!) */}
        {selectedNode && (
          <div className="absolute top-3 right-3 bottom-3 w-[296px] z-40 p-3.5 rounded-2xl bg-white/95 dark:bg-[#131C31]/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right-4 duration-150">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-teal-600 dark:text-teal-400">
                    {lang === 'ru' ? 'Карточка иерархии' : 'Hiyerarşi & Bağlılık Künyesi'}
                  </span>
                  <h3 className="text-sm text-slate-900 dark:text-white mt-0.5 truncate">
                    {selectedNode.ad_soyad}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {translateVal(selectedNode.gorevi)}
                  </p>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {translateVal(selectedNode.effective_site)}
                    {selectedNode.sicil_no && !selectedNode.isVirtual ? ` • #${selectedNode.sicil_no}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
                  <span className="text-[9.5px] uppercase text-slate-400 block">Sorumlu Kişi (eBA)</span>
                  <span className="text-slate-900 dark:text-white">{selectedNode.sorumlu_kisi || '-'}</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
                  <span className="text-[9.5px] uppercase text-slate-400 block">Grup Şefi (eBA)</span>
                  <span className="text-slate-900 dark:text-white">{selectedNode.grup_sefi || '-'}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="p-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60">
                    <span className="text-[9.5px] text-indigo-600 dark:text-indigo-300 block">
                      {lang === 'ru' ? 'Прямых' : 'Doğrudan Bağlı'}
                    </span>
                    <span className="text-sm text-indigo-900 dark:text-indigo-100">
                      {selectedNode.directCount}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60">
                    <span className="text-[9.5px] text-emerald-600 dark:text-emerald-300 block">
                      {lang === 'ru' ? 'Всего внизу' : 'Toplam Alt Ekip'}
                    </span>
                    <span className="text-sm text-emerald-900 dark:text-emerald-100">
                      {selectedNode.totalSubordinates.toLocaleString('tr-TR')}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                  {lang === 'ru' ? 'Вертикаль подчинения' : 'Üst Yönetim Zinciri (Kime Bağlı)'}
                </span>
                <div className="space-y-1">
                  {selectedNodeChain.map((step, i) => {
                    const isSelf = step.nodeId === selectedNode.nodeId;
                    return (
                      <div
                        key={step.nodeId}
                        onClick={() => handleLocatePersonInChart(step)}
                        className={`p-1.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelf
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-400'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-700 hover:border-teal-400'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-slate-900 dark:text-white truncate text-[11.5px]">
                            {i + 1}. {step.ad_soyad}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {translateVal(step.gorevi)}
                          </div>
                        </div>
                        <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                          L{step.roleLevel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
              {selectedNode.totalSubordinates > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFocusNodeId(selectedNode.nodeId);
                    triggerAutoFit();
                  }}
                  className="w-full py-1.5 px-3 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'ru' ? 'Сфокусировать ветку' : 'Bu Yöneticinin Alt Şemasını Odakla'}
                  </span>
                </button>
              )}

              {!selectedNode.isVirtual && selectedNode.personId && (
                <button
                  type="button"
                  onClick={() => setDrawerPerson(toMinimalPersonnelRecord(selectedNode))}
                  className="w-full py-1.5 px-3 rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'ru' ? 'Полная карточка (198 полей)' : 'Tam Personel Kartını Aç (198 Kolon)'}
                  </span>
                </button>
              )}

              {onNavigateToPersonnel && !selectedNode.isVirtual && (
                <button
                  type="button"
                  onClick={() => onNavigateToPersonnel('search', selectedNode.ad_soyad)}
                  className="w-full py-1.5 px-3 rounded-xl text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>{lang === 'ru' ? 'В списке персонала' : 'Personel Listesinde Göster'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Full 198-Column Personnel Detail Drawer */}
      <PersonnelDetailDrawer personnel={drawerPerson} onClose={() => setDrawerPerson(null)} />
    </div>
  );
}
