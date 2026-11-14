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
  ChevronLeft,
  ChevronRight,
  Download,
  Crosshair,
  Eye,
  Info,
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
  ArrowRightLeft,
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

type ChartOrientation = 'vertical' | 'horizontal';

const SIBLING_PAGE_SIZE = 5;
const MIN_READABLE_ZOOM = 0.75;
const MAX_READABLE_ZOOM = 1.3;
const DEFAULT_READABLE_ZOOM = 0.96;

interface RoleTierMeta {
  level: OrgRoleLevel;
  badgeTr: string;
  badgeRu: string;
  shortTr: string;
  shortRu: string;
  icon: React.ComponentType<{ className?: string }>;
  cardClass: string;
  accentBarClass: string;
  avatarClass: string;
  pillClass: string;
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
      'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/90 dark:from-[#0F172A] dark:via-[#151F38] dark:to-amber-950/70 text-white border-2 border-amber-400/80 shadow-lg shadow-amber-500/10',
    accentBarClass: 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500',
    avatarClass:
      'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 ring-2 ring-amber-300/60 shadow-sm',
    pillClass: 'bg-amber-400/20 text-amber-200 border border-amber-400/40',
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
    accentBarClass: 'bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-500',
    avatarClass: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-xs',
    pillClass:
      'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700',
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
    accentBarClass: 'bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500',
    avatarClass: 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-xs',
    pillClass:
      'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700',
  },
  4: {
    level: 4,
    badgeTr: 'L4 • MÜHENDİS / UZMAN',
    badgeRu: 'У4 • ИНЖЕНЕР / СПЕЦИАЛИСТ',
    shortTr: 'Mühendis & Uzman',
    shortRu: 'Инженеры и ИТР',
    icon: Compass,
    cardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-sky-200 dark:border-sky-700/60 shadow-xs',
    accentBarClass: 'bg-gradient-to-r from-sky-500 to-cyan-500',
    avatarClass: 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white',
    pillClass:
      'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
  },
  5: {
    level: 5,
    badgeTr: 'L5 • FORMEN / SORUMLU',
    badgeRu: 'У5 • ФОРМЕН / МАСТЕР',
    shortTr: 'Formen & Sorumlu',
    shortRu: 'Формены и мастера',
    icon: HardHat,
    cardClass:
      'bg-gradient-to-br from-white to-amber-50/40 dark:from-[#131C31] dark:to-amber-950/20 text-slate-900 dark:text-white border border-amber-300 dark:border-amber-600/60 shadow-xs',
    accentBarClass: 'bg-gradient-to-r from-amber-500 to-orange-500',
    avatarClass: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    pillClass:
      'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  },
  6: {
    level: 6,
    badgeTr: 'L6 • SAHA EKİBİ',
    badgeRu: 'У6 • БРИГАДЫ',
    shortTr: 'Saha İşçileri (Tek Kutu)',
    shortRu: 'Рабочие (Список)',
    icon: Users,
    cardClass:
      'bg-slate-50 dark:bg-slate-900/90 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700',
    accentBarClass: 'bg-gradient-to-r from-slate-500 to-slate-600',
    avatarClass: 'bg-slate-600 text-white',
    pillClass:
      'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
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

function getHeatmapCardRing(directCount: number): string {
  if (directCount >= 21) {
    return 'border-2 border-rose-500 dark:border-rose-500 bg-rose-50/90 dark:bg-rose-950/45 text-slate-900 dark:text-white shadow-md';
  }
  if (directCount >= 9) {
    return 'border-2 border-amber-400 dark:border-amber-500 bg-amber-50/85 dark:bg-amber-950/40 text-slate-900 dark:text-white shadow-sm';
  }
  return 'border-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/35 text-slate-900 dark:text-white shadow-xs';
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
 * Consolidated Single Roster Card for Bottom-Level Workers (L6) or Large Specialist Teams (L4).
 * Always crisp and readable — shows trade summary pills, inline search, and clean person rows.
 */
function ConsolidatedCrewCard({
  title,
  subtitle,
  members,
  variant,
  highlightedNodeId,
  lang,
  translateVal,
  onSelectPerson,
  onOpenFullProfile,
}: {
  title: string;
  subtitle: string;
  members: OrgNode[];
  variant: 'workers' | 'specialists';
  highlightedNodeId: string | null;
  lang: string;
  translateVal: (v: string) => string;
  onSelectPerson: (node: OrgNode) => void;
  onOpenFullProfile: (node: OrgNode) => void;
}) {
  const [filterText, setFilterText] = useState('');
  const [selectedTrade, setSelectedTrade] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

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

  const visibleMembers = showAll ? filteredMembers : filteredMembers.slice(0, 10);
  const isWorkers = variant === 'workers';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`shrink-0 w-[268px] rounded-2xl border shadow-md overflow-hidden select-text ${
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
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {isWorkers ? (
              <HardHat className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            ) : (
              <Compass className="w-3.5 h-3.5 text-white shrink-0" />
            )}
            <span className="text-xs truncate">{title}</span>
          </div>
          <p className="text-[10px] text-white/75 truncate">{subtitle}</p>
        </div>
        <span className="px-2 py-0.5 rounded-lg bg-white/20 text-xs font-mono shrink-0">
          {members.length}
        </span>
      </div>

      {tradeBreakdown.length > 1 && (
        <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/70 dark:border-slate-800 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedTrade('all')}
            className={`px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap cursor-pointer ${
              selectedTrade === 'all'
                ? 'bg-slate-800 dark:bg-teal-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {lang === 'ru' ? 'Все' : 'Tümü'} ({members.length})
          </button>
          {tradeBreakdown.slice(0, 6).map((tb) => (
            <button
              key={tb.role}
              type="button"
              onClick={() => setSelectedTrade(selectedTrade === tb.role ? 'all' : tb.role)}
              className={`px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap cursor-pointer ${
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
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={lang === 'ru' ? 'Поиск ФИО / табеля...' : 'Listede ad / sicil ara...'}
              className="org-roster-scroll w-full pl-7 pr-6 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-teal-500"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="org-roster-scroll max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
        {visibleMembers.map((m) => {
          const isTarget = highlightedNodeId === m.nodeId;
          return (
            <div
              key={m.nodeId}
              id={`org-node-${m.nodeId}`}
              onClick={() => onSelectPerson(m)}
              className={`px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                isTarget
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 ring-2 ring-inset ring-emerald-500'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-900 dark:text-slate-100 truncate">
                  {m.ad_soyad}
                </div>
                <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                  {translateVal(m.gorevi)} • #{m.sicil_no}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFullProfile(m);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                title={lang === 'ru' ? 'Полная карточка' : 'Tam Personel Kartı'}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {filteredMembers.length > 10 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full py-1.5 px-3 text-[11px] text-teal-700 dark:text-teal-300 bg-slate-50 dark:bg-slate-900/80 hover:bg-teal-50 dark:hover:bg-slate-800 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-center gap-1 cursor-pointer"
        >
          <span>
            {showAll
              ? lang === 'ru'
                ? 'Свернуть список'
                : 'Listeyi Daralt'
              : lang === 'ru'
              ? `Показать всех (${filteredMembers.length})`
              : `Tümünü Göster (${filteredMembers.length})`}
          </span>
          {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

/**
 * Enterprise Org-Chart Card (d3-org-chart v3 / Workday style):
 * - Always full-sized and crisp to read (Name, Role Title, Site, Subordinate Badge).
 * - Touching/clicking ANYWHERE on a manager card toggles their subordinates open/closed
 *   and automatically closes sibling branches (strict accordion UX!).
 * - Quick icon actions on top-right let you inspect Reporting Chain (Info), Subtree Focus (Crosshair),
 *   or Full 198-Column Profile (Eye) without toggling the tree.
 */
function OrgEnterpriseCard({
  node,
  heatmapMode,
  isExpanded,
  hasExpandableChildren,
  isSelected,
  isInHighlightChain,
  isHighlightedTarget,
  dimmedByLevelFilter,
  lang,
  translateVal,
  onCardClick,
  onInspectChain,
  onFocusSubtree,
  onOpenFullProfile,
}: {
  node: OrgNode;
  heatmapMode: boolean;
  isExpanded: boolean;
  hasExpandableChildren: boolean;
  isSelected: boolean;
  isInHighlightChain: boolean;
  isHighlightedTarget: boolean;
  dimmedByLevelFilter: boolean;
  lang: string;
  translateVal: (v: string) => string;
  onCardClick: (node: OrgNode) => void;
  onInspectChain: (node: OrgNode) => void;
  onFocusSubtree: (node: OrgNode) => void;
  onOpenFullProfile: (node: OrgNode) => void;
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
  const endirektPct =
    node.totalSubordinates > 0
      ? Math.round((node.subordinateEndirekt / node.totalSubordinates) * 100)
      : 0;

  return (
    <div
      id={`org-node-${node.nodeId}`}
      onClick={(e) => {
        e.stopPropagation();
        onCardClick(node);
      }}
      className={`shrink-0 relative w-[228px] rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer select-none ${
        heatmapMode && node.directCount > 0 ? getHeatmapCardRing(node.directCount) : tier.cardClass
      } ${
        isHighlightedTarget
          ? 'ring-4 ring-emerald-500 shadow-xl scale-[1.02]'
          : isExpanded
          ? 'ring-2 ring-teal-500 shadow-lg'
          : isInHighlightChain
          ? 'ring-2 ring-teal-400 shadow-md'
          : isSelected
          ? 'ring-2 ring-indigo-500 shadow-md'
          : 'hover:-translate-y-0.5 hover:shadow-lg'
      } ${dimmedByLevelFilter ? 'opacity-30 grayscale' : ''}`}
    >
      {/* Top Role-Level Accent Ribbon */}
      <div className={`h-1.5 w-full ${tier.accentBarClass}`} />

      <div className="p-3">
        {/* Top Row: Role Badge + Quick Utility Icons */}
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className={`px-1.5 py-0.5 rounded text-[9px] tracking-wide truncate ${tier.pillClass}`}>
            {node.virtualKind === 'subcon'
              ? lang === 'ru'
                ? 'СУБПОДРЯД'
                : 'TAŞERON BİRİMİ'
              : node.virtualKind === 'pending_pool'
              ? lang === 'ru'
                ? 'РЕЗЕРВ'
                : 'ATAMA HAVUZU'
              : lang === 'ru'
              ? tier.badgeRu
              : tier.badgeTr}
          </span>

          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onInspectChain(node)}
              title={lang === 'ru' ? 'Цепочка подчинения' : 'Üst Yönetim Zinciri & Künye'}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isL1
                  ? 'text-slate-300 hover:text-white hover:bg-white/10'
                  : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {node.totalSubordinates > 0 && (
              <button
                type="button"
                onClick={() => onFocusSubtree(node)}
                title={lang === 'ru' ? 'Фокус ветки' : 'Sadece Bu Yöneticinin Alt Şemasını Odakla'}
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
                title={lang === 'ru' ? 'Полная карточка (198 полей)' : 'Tam Personel Kartını Aç'}
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

        {/* Identity Row: Role Crest + Full Name + Title + Site */}
        <div className="flex items-start gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 text-[10px] ${tier.avatarClass}`}
          >
            <TierIcon className="w-3 h-3 mb-0.5 opacity-95" />
            <span className="leading-none">{getInitials(node.ad_soyad)}</span>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              title={node.ad_soyad}
              className={`text-xs leading-snug truncate ${
                isL1 ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}
            >
              {node.ad_soyad}
            </h3>
            <p
              title={translateVal(node.gorevi)}
              className={`text-[11px] leading-tight mt-0.5 truncate ${
                isL1
                  ? 'text-amber-300'
                  : node.roleLevel === 2
                  ? 'text-indigo-700 dark:text-indigo-300'
                  : node.roleLevel === 3
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {translateVal(node.gorevi)}
            </p>
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] truncate ${
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

        {/* Subordinate Distribution Mini-Bar */}
        {node.totalSubordinates > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className={isL1 ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}>
                {lang === 'ru' ? 'Прямые:' : 'Doğrudan:'} {node.directCount}
              </span>
              <span className={isL1 ? 'text-amber-200' : 'text-slate-600 dark:text-slate-300'}>
                {lang === 'ru' ? 'ИТР' : 'Beyaz'}: {node.subordinateEndirekt} •{' '}
                {lang === 'ru' ? 'Раб.' : 'Saha'}: {node.subordinateDirekt}
              </span>
            </div>
            <div className="w-full h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex">
              <div className="bg-indigo-500 h-full" style={{ width: `${endirektPct}%` }} />
              <div className="bg-teal-500 h-full" style={{ width: `${100 - endirektPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* d3-org-chart Style Expand / Collapse Status Strip */}
      {hasExpandableChildren && (
        <div
          className={`w-full py-1.5 px-3 text-[11px] flex items-center justify-between transition-colors border-t ${
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
                ? 'Открыто • Нажмите, чтобы закрыть'
                : 'Açık • Kapatmak için dokunun'
              : lang === 'ru'
              ? `+${node.totalSubordinates.toLocaleString('tr-TR')} чел. • Нажмите`
              : `+${node.totalSubordinates.toLocaleString('tr-TR')} Kişi • Açmak için dokunun`}
          </span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
        </div>
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

  // Filters & Classic Org-Chart Modes
  const [hierarchyMode, setHierarchyMode] = useState<OrgHierarchyMode>('combined');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [viewStyle, setViewStyle] = useState<'canvas' | 'directory'>('canvas');
  const [orientation, setOrientation] = useState<ChartOrientation>('vertical');
  const [heatmapMode, setHeatmapMode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [levelHighlight, setLevelHighlight] = useState<OrgRoleLevel | null>(null);

  // Search, Selection & Sibling Pagination (d3-org-chart v3 paging pattern)
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerPerson, setDrawerPerson] = useState<PersonnelRecord | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [siblingPages, setSiblingPages] = useState<Record<string, number>>({});
  const [showAllSiblingsFor, setShowAllSiblingsFor] = useState<Set<string>>(new Set());

  // Always-Readable Zoom + Drag-to-Scroll Container
  const [zoom, setZoom] = useState<number>(DEFAULT_READABLE_ZOOM);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const dragScrollRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

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

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Build full tree in memory
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

  // Smoothly scroll a specific node card to the center of the scrollable canvas
  const centerNodeInViewport = useCallback((nodeId: string, delayMs = 70) => {
    setTimeout(() => {
      const container = scrollContainerRef.current;
      const cardEl = document.getElementById(`org-node-${nodeId}`);
      if (!container || !cardEl) return;

      const cRect = container.getBoundingClientRect();
      const eRect = cardEl.getBoundingClientRect();
      const deltaX = eRect.left + eRect.width / 2 - (cRect.left + cRect.width / 2);
      const deltaY = eRect.top - (cRect.top + 48);

      container.scrollBy({
        left: deltaX,
        top: Math.abs(deltaY) > 60 ? deltaY : 0,
        behavior: 'smooth',
      });
    }, delayMs);
  }, []);

  // Reset to clean, 100%-readable initial view: ONLY top root expanded (showing Level-2 direct leaders!)
  const resetToReadableInitialView = useCallback(
    (roots = orgResult.roots) => {
      const next = new Set<string>();
      if (roots.length === 1) {
        next.add(roots[0].nodeId);
      } else if (roots.length > 1 && roots.length <= 3) {
        next.add(roots[0].nodeId);
      }
      setExpandedIds(next);
      setSiblingPages({});
      setShowAllSiblingsFor(new Set());
      setHighlightedNodeId(null);
      setZoom(DEFAULT_READABLE_ZOOM);
      if (roots[0]) {
        centerNodeInViewport(roots[0].nodeId, 80);
      }
    },
    [orgResult.roots, centerNodeInViewport]
  );

  useEffect(() => {
    if (orgResult.roots.length > 0) {
      resetToReadableInitialView(orgResult.roots);
    }
  }, [orgResult.roots, resetToReadableInitialView]);

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

  /**
   * STRICT ENTERPRISE ACCORDION CARD CLICK:
   * - Touching/clicking a manager card opens their direct subordinates AND automatically closes
   *   any open sibling branch (and all of that sibling's open descendants)!
   * - Touching an already-open manager card closes their branch.
   * - Touching a leaf employee card opens their Reporting Chain Künye drawer.
   */
  const handleCardClick = useCallback(
    (node: OrgNode) => {
      const hasExpandable =
        node.managerChildren.length > 0 ||
        node.specialistLeaves.length > 0 ||
        node.workerLeaves.length > 0;

      if (!hasExpandable) {
        setSelectedNodeId(node.nodeId);
        return;
      }

      setExpandedIds((prev) => {
        const next = new Set(prev);
        const collapseSubtree = (n: OrgNode) => {
          next.delete(n.nodeId);
          for (const c of n.managerChildren) collapseSubtree(c);
        };

        if (next.has(node.nodeId)) {
          collapseSubtree(node);
        } else {
          // Collapse ALL sibling branches at this same parent level (or sibling roots)
          if (node.parentId) {
            const parent = orgResult.nodeById.get(node.parentId);
            if (parent) {
              for (const sib of parent.managerChildren) {
                if (sib.nodeId !== node.nodeId) {
                  collapseSubtree(sib);
                }
              }
            }
          } else {
            for (const rootSib of orgResult.roots) {
              if (rootSib.nodeId !== node.nodeId) {
                collapseSubtree(rootSib);
              }
            }
          }
          next.add(node.nodeId);
        }
        return next;
      });

      centerNodeInViewport(node.nodeId, 80);
    },
    [orgResult.nodeById, orgResult.roots, centerNodeInViewport]
  );

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

  // Locate a searched person -> open ONLY their exact upward chain, flip sibling pagers to the exact page, and center!
  const handleLocatePersonInChart = useCallback(
    (target: OrgNode) => {
      setFocusNodeId(null);
      const chain = getUpwardChain(target.nodeId);
      const nextExpanded = new Set<string>();
      const nextPages: Record<string, number> = {};

      for (let i = 0; i < chain.length; i++) {
        const step = chain[i];
        if (step.nodeId !== target.nodeId || target.totalSubordinates > 0) {
          nextExpanded.add(step.nodeId);
        }
        // Ensure parent's sibling page points to the page containing `step`
        if (step.parentId) {
          nextExpanded.add(step.parentId);
          const parent = orgResult.nodeById.get(step.parentId);
          if (parent) {
            const idxInManagers = parent.managerChildren.findIndex((m) => m.nodeId === step.nodeId);
            if (idxInManagers >= 0) {
              nextPages[parent.nodeId] = Math.floor(idxInManagers / SIBLING_PAGE_SIZE);
            } else {
              // Target is in specialistLeaves or workerLeaves (placed at the end of parent's child items)
              const totalItems =
                parent.managerChildren.length +
                (parent.specialistLeaves.length > 0
                  ? parent.specialistLeaves.length <= 2 && parent.managerChildren.length <= 2
                    ? parent.specialistLeaves.length
                    : 1
                  : 0) +
                (parent.workerLeaves.length > 0 ? 1 : 0);
              nextPages[parent.nodeId] = Math.max(0, Math.ceil(totalItems / SIBLING_PAGE_SIZE) - 1);
            }
          }
        }
      }

      setExpandedIds(nextExpanded);
      setSiblingPages((prev) => ({ ...prev, ...nextPages }));
      setHighlightedNodeId(target.nodeId);
      setSelectedNodeId(target.nodeId);
      setSearchQuery('');
      centerNodeInViewport(target.nodeId, 110);
    },
    [getUpwardChain, orgResult.nodeById, centerNodeInViewport]
  );

  // Export full hierarchy to .xlsx (Zero salary columns, dd.mm.yyyy dates)
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

  /**
   * Classic Enterprise Org-Chart Subtree Renderer:
   * - Pixel-perfect orthogonal tree connectors (`react-organizational-chart` pattern)
   * - `d3-org-chart v3` Sibling Pagination (`5` crisp cards per page, or `Tümü` toggle)
   * - Strict single-branch accordion drill-down so screen stays 100% readable at all times!
   */
  const renderOrgSubtree = (node: OrgNode): React.ReactNode => {
    const hasExpandable =
      node.managerChildren.length > 0 ||
      node.specialistLeaves.length > 0 ||
      node.workerLeaves.length > 0;
    const isExpanded = expandedIds.has(node.nodeId);

    const cardEl = (
      <OrgEnterpriseCard
        node={node}
        heatmapMode={heatmapMode}
        isExpanded={isExpanded}
        hasExpandableChildren={hasExpandable}
        isSelected={selectedNodeId === node.nodeId}
        isInHighlightChain={highlightChainIds.has(node.nodeId)}
        isHighlightedTarget={highlightedNodeId === node.nodeId}
        dimmedByLevelFilter={levelHighlight !== null && node.roleLevel !== levelHighlight}
        lang={lang}
        translateVal={translateVal}
        onCardClick={handleCardClick}
        onInspectChain={(n) => setSelectedNodeId(n.nodeId)}
        onFocusSubtree={(n) => {
          setFocusNodeId(n.nodeId);
          setExpandedIds(new Set([n.nodeId]));
          setSiblingPages({});
          centerNodeInViewport(n.nodeId, 80);
        }}
        onOpenFullProfile={(n) => setDrawerPerson(toMinimalPersonnelRecord(n))}
      />
    );

    if (!isExpanded || !hasExpandable) {
      return (
        <div key={node.nodeId} className="shrink-0 w-max flex flex-col items-center">
          {cardEl}
        </div>
      );
    }

    // Build ordered list of direct child elements under `node`
    interface ChildSlot {
      key: string;
      isActiveBranch: boolean;
      element: React.ReactNode;
    }

    const allChildSlots: ChildSlot[] = [];

    for (const mgrChild of node.managerChildren) {
      allChildSlots.push({
        key: mgrChild.nodeId,
        isActiveBranch: expandedIds.has(mgrChild.nodeId) || highlightChainIds.has(mgrChild.nodeId),
        element: renderOrgSubtree(mgrChild),
      });
    }

    if (node.specialistLeaves.length > 0) {
      if (node.specialistLeaves.length <= 2 && node.managerChildren.length <= 2) {
        for (const sp of node.specialistLeaves) {
          allChildSlots.push({
            key: sp.nodeId,
            isActiveBranch: highlightedNodeId === sp.nodeId,
            element: renderOrgSubtree(sp),
          });
        }
      } else {
        allChildSlots.push({
          key: `spc_box_${node.nodeId}`,
          isActiveBranch: Boolean(
            highlightedNodeId && node.specialistLeaves.some((s) => s.nodeId === highlightedNodeId)
          ),
          element: (
            <ConsolidatedCrewCard
              title={lang === 'ru' ? 'Инженеры и специалисты' : 'Uzman & Mühendisler'}
              subtitle={`${node.ad_soyad} • Beyaz Yaka`}
              members={node.specialistLeaves}
              variant="specialists"
              highlightedNodeId={highlightedNodeId}
              lang={lang}
              translateVal={translateVal}
              onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
              onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
            />
          ),
        });
      }
    }

    if (node.workerLeaves.length > 0) {
      allChildSlots.push({
        key: `wrk_box_${node.nodeId}`,
        isActiveBranch: Boolean(
          highlightedNodeId && node.workerLeaves.some((w) => w.nodeId === highlightedNodeId)
        ),
        element: (
          <ConsolidatedCrewCard
            title={lang === 'ru' ? 'Рабочая бригада (Список)' : 'Saha İşçileri Listesi'}
            subtitle={`${node.ad_soyad} • Doğrudan Ekip`}
            members={node.workerLeaves}
            variant="workers"
            highlightedNodeId={highlightedNodeId}
            lang={lang}
            translateVal={translateVal}
            onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
            onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
          />
        ),
      });
    }

    // Sibling Pagination (`d3-org-chart v3` style) when > SIBLING_PAGE_SIZE items
    const showAllUnpaged = showAllSiblingsFor.has(node.nodeId);
    const needsPaging = allChildSlots.length > SIBLING_PAGE_SIZE && !showAllUnpaged;
    const totalPages = Math.max(1, Math.ceil(allChildSlots.length / SIBLING_PAGE_SIZE));
    const currentPage = Math.min(totalPages - 1, siblingPages[node.nodeId] || 0);

    const visibleSlots = needsPaging
      ? allChildSlots.slice(
          currentPage * SIBLING_PAGE_SIZE,
          (currentPage + 1) * SIBLING_PAGE_SIZE
        )
      : allChildSlots;

    const handlePageChange = (nextPage: number) => {
      const clamped = (nextPage + totalPages) % totalPages;
      setSiblingPages((prev) => ({ ...prev, [node.nodeId]: clamped }));
      // Collapse open sibling branches when flipping pages so screen stays tidy
      setExpandedIds((prev) => {
        const next = new Set(prev);
        const collapseRec = (n: OrgNode) => {
          next.delete(n.nodeId);
          for (const c of n.managerChildren) collapseRec(c);
        };
        for (const c of node.managerChildren) collapseRec(c);
        return next;
      });
      centerNodeInViewport(node.nodeId, 60);
    };

    const pagerBarEl =
      allChildSlots.length > SIBLING_PAGE_SIZE ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200 shadow-2xs select-none"
        >
          {!showAllUnpaged && (
            <>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                className="p-0.5 rounded-full hover:bg-white dark:hover:bg-slate-700 cursor-pointer"
                title={lang === 'ru' ? 'Предыдущие' : 'Önceki Grup'}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[10.5px] px-1">
                {currentPage * SIBLING_PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * SIBLING_PAGE_SIZE, allChildSlots.length)} /{' '}
                {allChildSlots.length}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                className="p-0.5 rounded-full hover:bg-white dark:hover:bg-slate-700 cursor-pointer"
                title={lang === 'ru' ? 'Следующие' : 'Sonraki Grup'}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-slate-300 dark:text-slate-600">|</span>
            </>
          )}
          <button
            type="button"
            onClick={() =>
              setShowAllSiblingsFor((prev) => {
                const next = new Set(prev);
                if (next.has(node.nodeId)) next.delete(node.nodeId);
                else next.add(node.nodeId);
                return next;
              })
            }
            className="text-[10.5px] text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
          >
            {showAllUnpaged
              ? lang === 'ru'
                ? 'По 5 в ряд'
                : '5’li Sayfala'
              : lang === 'ru'
              ? `Все (${allChildSlots.length})`
              : `Tümünü Aç (${allChildSlots.length})`}
          </button>
        </div>
      ) : null;

    const anyChildActive = visibleSlots.some((s) => s.isActiveBranch);

    // HORIZONTAL ORIENTATION (Left ➔ Right Org Chart)
    if (orientation === 'horizontal') {
      return (
        <div key={node.nodeId} className="shrink-0 w-max flex items-center">
          {cardEl}
          <div
            className={`w-6 h-[2px] shrink-0 ${
              anyChildActive ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          <div className="flex flex-col items-start">
            {pagerBarEl && <div className="ml-4 mb-2">{pagerBarEl}</div>}
            <div className="flex flex-col">
              {visibleSlots.map((slot, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === visibleSlots.length - 1;
                const onlyOne = visibleSlots.length === 1;
                return (
                  <div key={slot.key} className="relative flex items-center pl-6 py-2">
                    {!onlyOne && (
                      <>
                        {!isFirst && (
                          <span className="absolute left-0 top-0 h-1/2 w-[2px] bg-slate-300 dark:bg-slate-600" />
                        )}
                        {!isLast && (
                          <span className="absolute left-0 bottom-0 h-1/2 w-[2px] bg-slate-300 dark:bg-slate-600" />
                        )}
                      </>
                    )}
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 w-6 h-[2px] ${
                        slot.isActiveBranch ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                    {slot.element}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // CLASSIC VERTICAL ORG CHART (Top ➔ Bottom with pixel-perfect orthogonal connectors)
    return (
      <div key={node.nodeId} className="shrink-0 w-max flex flex-col items-center">
        {cardEl}

        {/* Vertical Stem Down from Parent Card */}
        <div
          className={`w-[2px] h-5 ${
            anyChildActive ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        />

        {pagerBarEl && (
          <>
            {pagerBarEl}
            <div className="w-[2px] h-3 bg-slate-300 dark:bg-slate-600 -mt-1" />
          </>
        )}

        {/* Horizontal Orthogonal Connector Rail + Child Columns */}
        <div className="flex items-start justify-center w-max">
          {visibleSlots.map((slot, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === visibleSlots.length - 1;
            const onlyOne = visibleSlots.length === 1;

            return (
              <div
                key={slot.key}
                className="shrink-0 w-max flex flex-col items-center relative px-2 pt-5"
              >
                {!onlyOne && (
                  <>
                    {!isFirst && (
                      <span className="absolute top-0 left-0 w-1/2 h-[2px] bg-slate-300 dark:bg-slate-600" />
                    )}
                    {!isLast && (
                      <span className="absolute top-0 right-0 w-1/2 h-[2px] bg-slate-300 dark:bg-slate-600" />
                    )}
                  </>
                )}
                <span
                  className={`absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-5 ${
                    slot.isActiveBranch ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
                {slot.element}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Directory Outline View Renderer
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
          onClick={() => handleCardClick(node)}
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
                className="py-2.5 pr-4 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800"
              >
                <ConsolidatedCrewCard
                  title={lang === 'ru' ? 'Рабочая бригада' : 'Saha İşçileri Listesi'}
                  subtitle={node.ad_soyad}
                  members={node.workerLeaves}
                  variant="workers"
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

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[80] bg-[#F8FAFC] dark:bg-[#0B1120] p-3 flex flex-col gap-2.5 overflow-hidden'
          : 'px-3 sm:px-4 py-2.5 space-y-2.5'
      }
    >
      {/* 1. COMPACT HEADER (Top KPI boxes removed for maximum chart space!) */}
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
              <span className="text-teal-700 dark:text-teal-300">
                {lang === 'ru'
                  ? 'Нажмите на карточку, чтобы открыть ветку'
                  : 'Alt ekibi açmak için yönetici kartına dokunun'}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

      {/* 2. SINGLE-LINE ROLE FORMAT LEGEND + SEARCH & SITE FILTER BAR */}
      <div className="px-3 py-2 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2">
        {/* Single-line Görev Seviyesi Kart Formatları */}
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap no-scrollbar pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 mr-0.5">
            {lang === 'ru' ? 'Форматы карточек:' : 'Görev Seviyesi Kart Formatları:'}
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

        {/* Search + Site Pills + Orientation & View Switches */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ru'
                  ? 'Поиск сотрудника ➔ открыть цепочку...'
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

          {/* Site Quick Pills */}
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

          {/* Right Controls: Department + Dikey/Yatay + Yük Renklendirme + Şema/Dizin */}
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

            {viewStyle === 'canvas' && (
              <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setOrientation('vertical')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer ${
                    orientation === 'vertical'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <GitFork className="w-3 h-3" />
                  <span>{lang === 'ru' ? 'Сверху вниз' : 'Dikey'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('horizontal')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] cursor-pointer ${
                    orientation === 'horizontal'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  <span>{lang === 'ru' ? 'Слева направо' : 'Yatay'}</span>
                </button>
              </div>
            )}

            {viewStyle === 'canvas' && (
              <button
                type="button"
                onClick={() => setHeatmapMode((v) => !v)}
                title={
                  lang === 'ru'
                    ? 'Цветовая индикация нагрузки (1-8 зеленый, 9-20 желтый, 21+ красный)'
                    : 'Yönetim Yükü: Yeşil (1-8), Sarı (9-20), Kırmızı (21+ doğrudan bağlı)'
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] border cursor-pointer transition-all ${
                  heatmapMode
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Нагрузка' : 'Yük Rengi'}</span>
              </button>
            )}

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

      {/* Active Chain / Focus Breadcrumb Bar */}
      {(focusBreadcrumb.length > 0 || highlightChainIds.size > 0) && (
        <div className="px-3 py-1.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-indigo-800 dark:text-indigo-200">
              {focusNodeId
                ? lang === 'ru'
                  ? 'Фокус ветки:'
                  : 'Odaklanan Alt Şema:'
                : lang === 'ru'
                ? 'Открытая цепочка:'
                : 'Açık Raporlama Zinciri:'}
            </span>
            <button
              type="button"
              onClick={() => {
                setFocusNodeId(null);
                setHighlightedNodeId(null);
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
                  onClick={() => handleLocatePersonInChart(item)}
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
            }}
            className="px-2.5 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer text-[11px]"
          >
            {lang === 'ru' ? 'Вся схема' : 'Tam Şemaya Dön'}
          </button>
        </div>
      )}

      {/* 3. READABLE ENTERPRISE ORG CHART CANVAS */}
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
                : 'Organizasyon şeması hazırlanıyor...'}
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
            {/* Scrollable & Grab-to-Pan Readable Org-Chart Canvas */}
            <div
              ref={scrollContainerRef}
              onMouseDown={(e) => {
                if (e.button !== 0 && e.button !== 1) return;
                const target = e.target as HTMLElement | null;
                if (target?.closest('button, input, select, .org-roster-scroll')) return;
                const sc = scrollContainerRef.current;
                if (!sc) return;
                dragScrollRef.current = {
                  active: true,
                  moved: false,
                  startX: e.clientX,
                  startY: e.clientY,
                  scrollLeft: sc.scrollLeft,
                  scrollTop: sc.scrollTop,
                };
              }}
              onMouseMove={(e) => {
                if (!dragScrollRef.current.active) return;
                const sc = scrollContainerRef.current;
                if (!sc) return;
                const dx = e.clientX - dragScrollRef.current.startX;
                const dy = e.clientY - dragScrollRef.current.startY;
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                  dragScrollRef.current.moved = true;
                }
                sc.scrollLeft = dragScrollRef.current.scrollLeft - dx;
                sc.scrollTop = dragScrollRef.current.scrollTop - dy;
              }}
              onMouseUp={() => {
                dragScrollRef.current.active = false;
              }}
              onMouseLeave={() => {
                dragScrollRef.current.active = false;
              }}
              onClick={(e) => {
                if (dragScrollRef.current.moved) return;
                if (e.target === e.currentTarget) {
                  setSelectedNodeId(null);
                }
              }}
              className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]"
            >
              <div className="min-w-full min-h-full flex justify-center items-start p-6 pb-20">
                <div
                  style={{ zoom } as React.CSSProperties}
                  className="flex flex-wrap items-start justify-center gap-8"
                >
                  {orgResult.roots.map((rootNode) => renderOrgSubtree(rootNode))}
                </div>
              </div>
            </div>

            {/* BOTTOM-RIGHT CORNER READABLE ZOOM & RESET CONTROLS */}
            <div
              className={`absolute bottom-3 z-30 flex items-center gap-1 p-1.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-xl transition-all ${
                selectedNode ? 'right-3 lg:right-[314px]' : 'right-3'
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setZoom((z) =>
                    Math.max(MIN_READABLE_ZOOM, Math.round((z - 0.08) * 100) / 100)
                  )
                }
                disabled={zoom <= MIN_READABLE_ZOOM}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-35 cursor-pointer"
                title={lang === 'ru' ? 'Чуть уменьшить' : 'Küçült (Okunur Sınır %75)'}
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-2 py-1 rounded-lg font-mono text-xs text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 min-w-[46px] text-center cursor-pointer"
                title="%100 Tam Boyut"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button
                type="button"
                onClick={() =>
                  setZoom((z) =>
                    Math.min(MAX_READABLE_ZOOM, Math.round((z + 0.08) * 100) / 100)
                  )
                }
                disabled={zoom >= MAX_READABLE_ZOOM}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-35 cursor-pointer"
                title={lang === 'ru' ? 'Увеличить' : 'Büyüt (+)'}
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setFocusNodeId(null);
                  resetToReadableInitialView(orgResult.roots);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs"
                title={lang === 'ru' ? 'Сбросить к начальному виду' : 'İlk Görünüme Sıfırla & Ortala'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Сброс' : 'Sıfırla'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen((v) => !v)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                title={
                  isFullscreen
                    ? lang === 'ru'
                      ? 'Выйти из полного экрана'
                      : 'Tam Ekrandan Çık (Esc)'
                    : lang === 'ru'
                    ? 'На весь экран'
                    : 'Tam Ekran Modu'
                }
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}

        {/* FLOATING RIGHT REPORTING CHAIN INSPECTOR DRAWER */}
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
                    setExpandedIds(new Set([selectedNode.nodeId]));
                    setSiblingPages({});
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
