'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Crosshair,
  Crown,
  Download,
  Eye,
  GitBranch,
  HardHat,
  Info,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  Palette,
  RefreshCw,
  RotateCcw,
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
  cardBg: string;
  cardBorder: string;
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
    cardBg: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    cardBorder: 'border-amber-400/80 ring-1 ring-amber-400/30',
    topRibbon: 'from-amber-400 via-yellow-300 to-amber-500',
    avatarBg: 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm',
    avatarText: 'text-slate-950',
    badgeBg: 'bg-amber-400/20 border border-amber-400/40',
    badgeText: 'text-amber-300',
    titleColor: 'text-white',
    subColor: 'text-amber-200/90',
    swimlaneBg: 'bg-amber-50/35 dark:bg-amber-950/10',
    swimlanePill:
      'bg-slate-900 text-amber-300 border-amber-500/50 dark:bg-slate-900 dark:text-amber-300',
    icon: Crown,
  },
  2: {
    level: 2,
    code: 'L2',
    shortTr: 'CEO & Genel Müdür',
    shortRu: 'CEO и Ген. директор',
    rowTitleTr: 'CEO / COO & Genel Müdür',
    rowTitleRu: 'CEO / COO и Ген. директор',
    cardBg: 'bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950',
    cardBorder: 'border-purple-400/80 ring-1 ring-purple-400/25',
    topRibbon: 'from-purple-400 via-fuchsia-400 to-indigo-400',
    avatarBg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-sm',
    avatarText: 'text-white',
    badgeBg: 'bg-purple-400/20 border border-purple-400/40',
    badgeText: 'text-purple-200',
    titleColor: 'text-white',
    subColor: 'text-purple-200/90',
    swimlaneBg: 'bg-purple-50/35 dark:bg-purple-950/15',
    swimlanePill:
      'bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700',
    icon: Crown,
  },
  3: {
    level: 3,
    code: 'L3',
    shortTr: 'Direktör',
    shortRu: 'Директора',
    rowTitleTr: 'Direktör & Koordinatör',
    rowTitleRu: 'Директора и координаторы',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-indigo-300 dark:border-indigo-700',
    topRibbon: 'from-indigo-600 via-violet-500 to-indigo-600',
    avatarBg: 'bg-gradient-to-br from-indigo-600 to-violet-600',
    avatarText: 'text-white',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-indigo-600 dark:text-indigo-300',
    swimlaneBg: 'bg-indigo-50/25 dark:bg-indigo-950/10',
    swimlanePill:
      'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    icon: Building2,
  },
  4: {
    level: 4,
    code: 'L4',
    shortTr: 'Müdür & Şantiye Şefi',
    shortRu: 'Руководители',
    rowTitleTr: 'Müdür & Şantiye Lideri',
    rowTitleRu: 'Руководители проектов и отделов',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-blue-300 dark:border-blue-700/80',
    topRibbon: 'from-blue-600 via-sky-500 to-blue-600',
    avatarBg: 'bg-gradient-to-br from-blue-600 to-sky-600',
    avatarText: 'text-white',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800',
    badgeText: 'text-blue-700 dark:text-blue-300',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-blue-600 dark:text-blue-300',
    swimlaneBg: 'bg-blue-50/25 dark:bg-blue-950/10',
    swimlanePill:
      'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    icon: Building2,
  },
  5: {
    level: 5,
    code: 'L5',
    shortTr: 'Grup & Kısım Şefi',
    shortRu: 'Начальники групп',
    rowTitleTr: 'Grup, Kısım & Birim Şefi',
    rowTitleRu: 'Начальники групп и участков',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-emerald-300 dark:border-emerald-800/80',
    topRibbon: 'from-emerald-500 via-teal-500 to-cyan-500',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    avatarText: 'text-white',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-emerald-700 dark:text-emerald-300',
    swimlaneBg: 'bg-emerald-50/25 dark:bg-emerald-950/10',
    swimlanePill:
      'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: Layers,
  },
  6: {
    level: 6,
    code: 'L6',
    shortTr: 'Mühendis & Uzman',
    shortRu: 'Инженеры и спец.',
    rowTitleTr: 'Mühendis, Uzman & Memur',
    rowTitleRu: 'Инженеры и специалисты',
    cardBg: 'bg-white dark:bg-slate-900',
    cardBorder: 'border-sky-200 dark:border-sky-800/70',
    topRibbon: 'from-sky-500 to-cyan-500',
    avatarBg: 'bg-gradient-to-br from-sky-500 to-cyan-600',
    avatarText: 'text-white',
    badgeBg: 'bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800',
    badgeText: 'text-sky-700 dark:text-sky-300',
    titleColor: 'text-slate-800 dark:text-slate-100',
    subColor: 'text-sky-700 dark:text-sky-300',
    swimlaneBg: 'bg-sky-50/25 dark:bg-sky-950/10',
    swimlanePill:
      'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    icon: Compass,
  },
  7: {
    level: 7,
    code: 'L7',
    shortTr: 'Formen & Sorumlu',
    shortRu: 'Формены',
    rowTitleTr: 'Formen & Saha Sorumlusu',
    rowTitleRu: 'Формены и ответственные',
    cardBg: 'bg-amber-50/40 dark:bg-slate-900',
    cardBorder: 'border-amber-300 dark:border-amber-800/70',
    topRibbon: 'from-amber-500 to-orange-500',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    avatarText: 'text-white',
    badgeBg: 'bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800',
    badgeText: 'text-amber-800 dark:text-amber-300',
    titleColor: 'text-slate-900 dark:text-white',
    subColor: 'text-amber-700 dark:text-amber-300',
    swimlaneBg: 'bg-orange-50/25 dark:bg-orange-950/10',
    swimlanePill:
      'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    icon: HardHat,
  },
  8: {
    level: 8,
    code: 'L8',
    shortTr: 'Saha İşçileri (Liste)',
    shortRu: 'Рабочие (Список)',
    rowTitleTr: 'Saha Ekip & İşçi Kadrosu',
    rowTitleRu: 'Рабочий персонал (Бригады)',
    cardBg: 'bg-slate-50 dark:bg-slate-900/80',
    cardBorder: 'border-slate-300 dark:border-slate-700',
    topRibbon: 'from-slate-500 to-slate-700',
    avatarBg: 'bg-slate-700',
    avatarText: 'text-white',
    badgeBg: 'bg-slate-200/70 dark:bg-slate-800 border border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-700 dark:text-slate-300',
    titleColor: 'text-slate-800 dark:text-slate-200',
    subColor: 'text-slate-500 dark:text-slate-400',
    swimlaneBg: 'bg-slate-100/45 dark:bg-slate-900/35',
    swimlanePill:
      'bg-slate-800 text-slate-100 border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    icon: Users,
  },
};

/** Readable zoom bounds — never shrinks to unreadable tiny dots */
const DEFAULT_READABLE_ZOOM = 0.96;
const MIN_READABLE_ZOOM = 0.75;
const MAX_READABLE_ZOOM = 1.3;
const SIBLING_PAGE_SIZE = 6;

const CARD_WIDTH = 226;
const CREW_CARD_WIDTH = 268;
const CARD_COLLAPSED_HEIGHT = 148;
const CREW_EXPANDED_HEIGHT = 330;
const H_GAP = 20;
const SWIMLANE_LABEL_WIDTH = 162;

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
      className={`rounded-2xl border shadow-sm transition-all overflow-hidden text-left ${
        isWorker
          ? 'bg-slate-50/95 dark:bg-slate-900/95 border-slate-300 dark:border-slate-700'
          : 'bg-sky-50/75 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80'
      }`}
    >
      <div
        className={`h-1.5 w-full bg-gradient-to-r ${
          isWorker ? 'from-slate-600 via-slate-500 to-teal-600' : 'from-sky-500 to-cyan-500'
        }`}
      />
      <div className="p-3">
        <div
          onClick={onToggleList}
          className="flex items-start justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isWorker ? 'bg-slate-800 text-white' : 'bg-sky-600 text-white'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isWorker ? 'L8 • Saha İşçileri (Tek Kutu)' : 'L6 • Uzman & İdari Kadro'}
              </div>
              <div className="text-xs text-slate-900 dark:text-white truncate">
                {parentNode.ad_soyad} Ekibi ({members.length})
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10.5px] shrink-0 flex items-center gap-1 ${
              isWorker
                ? 'bg-slate-800 text-white dark:bg-slate-700'
                : 'bg-sky-600 text-white'
            }`}
          >
            {isListOpen ? 'Gizle' : 'Listeyi Aç'}
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
              className="px-1.5 py-0.5 rounded-md text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 truncate max-w-[122px]"
              title={`${trade}: ${cnt}`}
            >
              {trade}: {cnt}
            </span>
          ))}
        </div>

        {isListOpen && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2">
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
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  colorBySpan: boolean;
  onCardClick: (node: OrgNode) => void;
  onOpenKunye: (node: OrgNode) => void;
  onInspectDrawer: (node: OrgNode) => void;
  onFocusSubtree: (nodeId: string) => void;
}

function OrgEnterpriseCard({
  node,
  isExpanded,
  isSelected,
  isHighlighted,
  colorBySpan,
  onCardClick,
  onOpenKunye,
  onInspectDrawer,
  onFocusSubtree,
}: OrgEnterpriseCardProps) {
  const theme = ROLE_LEVEL_THEMES[node.roleLevel];
  const IconComp = theme.icon;
  const hasChildren = node.directCount > 0;
  const isDarkExec = node.roleLevel <= 2 && !node.isVirtual;

  const whiteRatio =
    node.totalSubordinates > 0
      ? Math.round((node.subordinateEndirekt / node.totalSubordinates) * 100)
      : node.endirekt_direkt === 'Endirekt'
        ? 100
        : 0;

  const spanBorderOverride =
    colorBySpan && hasChildren
      ? node.directCount >= 20
        ? 'border-rose-400 ring-1 ring-rose-400/30'
        : node.directCount >= 10
          ? 'border-amber-400 ring-1 ring-amber-400/30'
          : 'border-emerald-400 ring-1 ring-emerald-400/30'
      : theme.cardBorder;

  return (
    <div
      id={`org-card-${node.nodeId}`}
      onClick={() => onCardClick(node)}
      style={{ width: CARD_WIDTH }}
      className={`relative rounded-2xl border transition-all duration-200 select-none text-left overflow-hidden cursor-pointer ${
        node.isVirtual ? 'bg-slate-50 dark:bg-slate-900/90 border-dashed' : theme.cardBg
      } ${spanBorderOverride} ${
        isHighlighted
          ? 'ring-3 ring-rose-500 shadow-xl'
          : isExpanded
            ? 'ring-2 ring-teal-500 shadow-lg'
            : isSelected
              ? 'ring-2 ring-indigo-500 shadow-md'
              : 'shadow-sm hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${theme.topRibbon}`} />

      <div className="p-3">
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] tracking-wide uppercase ${theme.badgeBg} ${theme.badgeText}`}
          >
            <IconComp className="w-2.5 h-2.5" />
            {node.isVirtual
              ? node.virtualKind === 'subcon'
                ? 'Taşeron'
                : node.virtualKind === 'pending_pool'
                  ? 'Havuz'
                  : 'Dış'
              : `${theme.code} • ${theme.shortTr}`}
          </span>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenKunye(node);
              }}
              title="Raporlama Zinciri & Künye"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                isDarkExec
                  ? 'text-slate-300 hover:text-white hover:bg-white/10'
                  : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusSubtree(node.nodeId);
                }}
                title="Sadece bu yöneticinin alt ağacına odaklan"
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  isDarkExec
                    ? 'text-slate-300 hover:text-white hover:bg-white/10'
                    : 'text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
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
                className={`p-1 rounded-md transition-colors cursor-pointer ${
                  isDarkExec
                    ? 'text-slate-300 hover:text-white hover:bg-white/10'
                    : 'text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 ${theme.avatarBg} ${theme.avatarText}`}
          >
            <span className="text-[11px] leading-none">{getInitials(node.ad_soyad)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[12px] leading-tight truncate ${theme.titleColor}`} title={node.ad_soyad}>
              {node.ad_soyad}
            </div>
            <div className={`text-[10.5px] mt-0.5 truncate ${theme.subColor}`} title={node.gorevi}>
              {node.gorevi}
            </div>
            <div
              className={`text-[9.5px] mt-0.5 truncate ${
                isDarkExec ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {node.effective_site}
              {node.sicil_no && !node.isVirtual ? ` • #${node.sicil_no}` : ''}
            </div>
          </div>
        </div>

        {hasChildren && (
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-[9.5px]">
              <span className={isDarkExec ? 'text-slate-300' : 'text-slate-600 dark:text-slate-300'}>
                Doğrudan:{' '}
                <span
                  className={
                    colorBySpan
                      ? `px-1 py-0.2 rounded ${getSpanBadgeColor(node.directCount)}`
                      : ''
                  }
                >
                  {node.directCount}
                </span>
              </span>
              <span className={isDarkExec ? 'text-amber-300' : 'text-teal-700 dark:text-teal-400'}>
                Toplam Alt: {node.totalSubordinates}
              </span>
            </div>
            <div className="mt-1 h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
              <div className="h-full bg-indigo-500" style={{ width: `${whiteRatio}%` }} />
              <div className="h-full bg-teal-500" style={{ width: `${100 - whiteRatio}%` }} />
            </div>
          </div>
        )}
      </div>

      {hasChildren && (
        <div
          className={`w-full px-3 py-1.5 text-[10.5px] flex items-center justify-between border-t transition-colors ${
            isExpanded
              ? isDarkExec
                ? 'bg-amber-400 text-slate-950 border-amber-400'
                : 'bg-teal-600 text-white border-teal-600'
              : isDarkExec
                ? 'bg-white/10 text-amber-200 border-white/10'
                : 'bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/80'
          }`}
        >
          <span>
            {isExpanded
              ? 'Açık • Kapatmak için dokun'
              : `+${node.totalSubordinates} Kişi • Açmak için dokun`}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}

/** Deterministic Level-Row Layout Structures */
type LayoutNodeKind = 'person' | 'crew_specialist' | 'crew_worker';

interface LayoutTreeItem {
  id: string;
  kind: LayoutNodeKind;
  node: OrgNode;
  members?: OrgNode[];
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
  totalChildSlots: number;
  currentPage: number;
  totalPages: number;
  showAllActive: boolean;
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

  // Filter & Mode Controls
  const [hierarchyMode, setHierarchyMode] = useState<OrgHierarchyMode>('combined');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'chart' | 'directory'>('chart');
  const [colorBySpan, setColorBySpan] = useState<boolean>(false);

  // Readable Zoom & Fullscreen
  const [zoom, setZoom] = useState<number>(DEFAULT_READABLE_ZOOM);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Expanded manager nodes + expanded consolidated crew lists + sibling pagination
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedCrewKeys, setExpandedCrewKeys] = useState<Set<string>>(new Set());
  const [siblingPageByParent, setSiblingPageByParent] = useState<Record<string, number>>({});
  const [showAllByParent, setShowAllByParent] = useState<Record<string, boolean>>({});

  // Search, Künye Inspector & 198-Column Drawer
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerRecord, setDrawerRecord] = useState<PersonnelRecord | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const orgContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const didDragMoveRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const clampZoom = useCallback((val: number) => {
    return Math.min(
      MAX_READABLE_ZOOM,
      Math.max(MIN_READABLE_ZOOM, Number(val.toFixed(2)))
    );
  }, []);

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

  const centerNodeInViewport = useCallback(
    (nodeId: string, zoomOverride?: number) => {
      const vp = canvasViewportRef.current;
      if (!vp) return;
      requestAnimationFrame(() => {
        const cardEl = document.getElementById(`org-card-${nodeId}`);
        if (!cardEl || !canvasViewportRef.current) return;
        const z = zoomOverride ?? zoom;
        const vpRect = vp.getBoundingClientRect();
        const cardRect = cardEl.getBoundingClientRect();
        const deltaX = cardRect.left + cardRect.width / 2 - (vpRect.left + vpRect.width / 2);
        const deltaY = cardRect.top - (vpRect.top + 48 * z);
        vp.scrollTo({
          left: Math.max(0, vp.scrollLeft + deltaX),
          top: Math.max(0, vp.scrollTop + deltaY),
          behavior: 'smooth',
        });
      });
    },
    [zoom]
  );

  // Initial Load: Expand ONLY top root(s) at readable 96% zoom so L1, L2 (CEO/GM), and L3 (Directors) appear immediately on their respective Level Rows!
  const resetToReadableInitialView = useCallback(() => {
    const next = new Set<string>();
    for (const r of orgResult.roots.slice(0, 2)) {
      next.add(r.nodeId);
    }
    setExpandedIds(next);
    setExpandedCrewKeys(new Set());
    setSiblingPageByParent({});
    setShowAllByParent({});
    setZoom(DEFAULT_READABLE_ZOOM);
    setHighlightedNodeId(null);

    if (orgResult.roots[0]) {
      setTimeout(() => {
        centerNodeInViewport(orgResult.roots[0].nodeId, DEFAULT_READABLE_ZOOM);
      }, 60);
    }
  }, [orgResult.roots, centerNodeInViewport]);

  useEffect(() => {
    resetToReadableInitialView();
  }, [orgResult.roots, resetToReadableInitialView]);

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

  // Build Visible Layout Tree with True Level-Row (Swimlane) Alignment!
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
      const rowKey = `${levelNo}:${subTier}`;
      const isExp = expandedIds.has(node.nodeId);

      // Assemble full child descriptors (individual manager/leader cards + L6 specialist group + L8 worker list)
      const rawDescriptors: Array<
        | { kind: 'person'; childNode: OrgNode }
        | { kind: 'crew_specialist'; members: OrgNode[] }
        | { kind: 'crew_worker'; members: OrgNode[] }
      > = [];

      if (isExp && node.directCount > 0) {
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

      const totalChildSlots = rawDescriptors.length;
      const showAllActive = Boolean(showAllByParent[node.nodeId]);
      const needsPaging = totalChildSlots > SIBLING_PAGE_SIZE && !showAllActive;
      const totalPages = Math.max(1, Math.ceil(totalChildSlots / SIBLING_PAGE_SIZE));
      const currentPage = Math.min(
        siblingPageByParent[node.nodeId] || 0,
        totalPages - 1
      );

      const visibleSlice = needsPaging
        ? rawDescriptors.slice(
            currentPage * SIBLING_PAGE_SIZE,
            (currentPage + 1) * SIBLING_PAGE_SIZE
          )
        : rawDescriptors;

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
          height: crewOpen ? CREW_EXPANDED_HEIGHT : CARD_COLLAPSED_HEIGHT,
          subtreeWidth: CREW_CARD_WIDTH,
          x: 0,
          y: 0,
          centerX: 0,
          children: [],
          totalChildSlots: 0,
          currentPage: 0,
          totalPages: 1,
          showAllActive: false,
        };
      });

      let subtreeWidth = CARD_WIDTH;
      if (childItems.length > 0) {
        const childrenSpan =
          childItems.reduce((acc, c) => acc + c.subtreeWidth, 0) +
          (childItems.length - 1) * H_GAP;
        subtreeWidth = Math.max(CARD_WIDTH, childrenSpan);
      }

      return {
        id: node.nodeId,
        kind: 'person',
        node,
        levelNo,
        subTier,
        rowKey,
        width: CARD_WIDTH,
        height: CARD_COLLAPSED_HEIGHT,
        subtreeWidth,
        x: 0,
        y: 0,
        centerX: 0,
        children: childItems,
        totalChildSlots,
        currentPage,
        totalPages,
        showAllActive,
      };
    };

    const rootItems = orgResult.roots.map((r) => buildVisibleItem(r, null, 0));

    // Collect all items & active row metadata
    const allItems: LayoutTreeItem[] = [];
    const rowMaxHeight = new Map<string, { levelNo: OrgRoleLevel; subTier: number; maxH: number; hasPagerAbove: boolean }>();
    let minLvl = 8;
    let maxLvl = 1;

    const collectDfs = (it: LayoutTreeItem, parentHadPager: boolean) => {
      allItems.push(it);
      if (it.levelNo < minLvl) minLvl = it.levelNo;
      if (it.levelNo > maxLvl) maxLvl = it.levelNo;

      const cur = rowMaxHeight.get(it.rowKey) || {
        levelNo: it.levelNo,
        subTier: it.subTier,
        maxH: CARD_COLLAPSED_HEIGHT,
        hasPagerAbove: false,
      };
      if (it.height > cur.maxH) cur.maxH = it.height;
      if (parentHadPager) cur.hasPagerAbove = true;
      rowMaxHeight.set(it.rowKey, cur);

      const thisHasPager = it.totalChildSlots > SIBLING_PAGE_SIZE;
      for (const ch of it.children) {
        collectDfs(ch, thisHasPager);
      }
    };

    for (const r of rootItems) {
      collectDfs(r, false);
    }

    // Ensure every corporate level between minLvl and maxLvl has a Swimlane Band (compact 36px if empty pass-through)
    const bandSpecs: Array<{
      rowKey: string;
      levelNo: OrgRoleLevel;
      subTier: number;
      isEmptyPassThrough: boolean;
      maxCardH: number;
      hasPagerAbove: boolean;
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
          hasPagerAbove: false,
        });
      } else {
        for (const [rk, v] of matchingSubTiers) {
          bandSpecs.push({
            rowKey: rk,
            levelNo: v.levelNo,
            subTier: v.subTier,
            isEmptyPassThrough: false,
            maxCardH: v.maxH,
            hasPagerAbove: v.hasPagerAbove,
          });
        }
      }
    }

    const swimlanes: SwimlaneBand[] = [];
    const rowCardTopMap = new Map<string, number>();
    let cursorY = 20;

    for (const b of bandSpecs) {
      if (b.isEmptyPassThrough) {
        const h = 36;
        swimlanes.push({
          rowKey: b.rowKey,
          levelNo: b.levelNo,
          subTier: b.subTier,
          isEmptyPassThrough: true,
          topY: cursorY,
          height: h,
          cardTopY: cursorY + 18,
        });
        rowCardTopMap.set(b.rowKey, cursorY + 18);
        cursorY += h;
      } else {
        const topPad = b.hasPagerAbove ? 44 : 26;
        const bottomPad = 24;
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

    // Assign X & Y coordinates top-down
    const totalRootsSpan =
      rootItems.reduce((acc, r) => acc + r.subtreeWidth, 0) +
      Math.max(0, rootItems.length - 1) * (H_GAP * 2);

    const startLeftX = SWIMLANE_LABEL_WIDTH + 32;

    const assignCoords = (it: LayoutTreeItem, leftX: number) => {
      it.centerX = leftX + it.subtreeWidth / 2;
      it.x = it.centerX - it.width / 2;
      it.y = rowCardTopMap.get(it.rowKey) ?? 24;

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

    const canvasWidth = Math.max(980, startLeftX + totalRootsSpan + 48);
    const canvasHeight = Math.max(420, cursorY + 32);

    return {
      rootItems,
      allItems,
      swimlanes,
      canvasWidth,
      canvasHeight,
    };
  }, [orgResult.roots, expandedIds, expandedCrewKeys, siblingPageByParent, showAllByParent]);

  // Strict Sibling Accordion on Card Click
  const handleCardClick = useCallback(
    (node: OrgNode) => {
      if (didDragMoveRef.current) return;
      setSelectedNodeId(node.nodeId);

      if (node.directCount === 0) {
        return;
      }

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
          // Strict Sibling Accordion: close sibling branches before opening this branch
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

      setTimeout(() => {
        centerNodeInViewport(node.nodeId);
      }, 60);
    },
    [orgResult.nodeById, orgResult.roots, centerNodeInViewport]
  );

  const handleSetSiblingPage = useCallback((parentId: string, page: number) => {
    setSiblingPageByParent((prev) => ({ ...prev, [parentId]: page }));
  }, []);

  const handleToggleShowAllSiblings = useCallback((parentId: string) => {
    setShowAllByParent((prev) => ({ ...prev, [parentId]: !prev[parentId] }));
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
      setSelectedNodeId(target.nodeId);
      setHighlightedNodeId(target.nodeId);
      setSearchQuery('');

      const nextExpanded = new Set<string>();
      const pageUpdates: Record<string, number> = {};

      let childCursor: OrgNode | undefined = target;
      let parentCursor: OrgNode | undefined = target.parentId
        ? orgResult.nodeById.get(target.parentId)
        : undefined;

      while (parentCursor) {
        nextExpanded.add(parentCursor.nodeId);
        const childIdx = parentCursor.managerChildren.findIndex(
          (m) => m.nodeId === childCursor?.nodeId
        );
        if (childIdx >= 0) {
          pageUpdates[parentCursor.nodeId] = Math.floor(childIdx / SIBLING_PAGE_SIZE);
        } else if (childCursor) {
          const totalMgr = parentCursor.managerChildren.length;
          const specSlots = parentCursor.specialistLeaves.length > 0 ? 1 : 0;
          const slotIdx =
            childCursor.roleLevel <= 6 ? totalMgr : totalMgr + specSlots;
          pageUpdates[parentCursor.nodeId] = Math.floor(slotIdx / SIBLING_PAGE_SIZE);
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
      setSiblingPageByParent((prev) => ({ ...prev, ...pageUpdates }));

      const scrollTargetId =
        target.directCount > 0 || target.roleLevel <= 5 || target.roleLevel === 7
          ? target.nodeId
          : target.parentId || target.nodeId;

      setTimeout(() => {
        centerNodeInViewport(scrollTargetId);
      }, 90);
    },
    [orgResult.nodeById, centerNodeInViewport]
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

  // Drag-to-pan on canvas background
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a, [id^="org-card-"]')) return;
    const vp = canvasViewportRef.current;
    if (!vp) return;
    isDraggingRef.current = true;
    didDragMoveRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !canvasViewportRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      didDragMoveRef.current = true;
    }
    canvasViewportRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    canvasViewportRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setTimeout(() => {
      didDragMoveRef.current = false;
    }, 30);
  };

  const handleWheelZoom = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.06 : -0.06;
      setZoom((z) => clampZoom(z + delta));
    },
    [clampZoom]
  );

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
        {/* Row 1: Title + Job Levels Button + Mode Switch + Excel */}
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
              <span>•</span>
              <span>8 Görev Seviyesi</span>
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
                Birleşik (Grup Şefi → Sorumlu)
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

        {/* Row 2: Single-Line L1..L8 Role Level Formats Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5 border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0">
            Görev Seviyesi Satırları:
          </span>
          {([1, 2, 3, 4, 5, 6, 7, 8] as OrgRoleLevel[]).map((lvl) => {
            const t = ROLE_LEVEL_THEMES[lvl];
            const LvlIcon = t.icon;
            return (
              <div
                key={lvl}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] shrink-0 ${t.badgeBg} ${t.badgeText}`}
              >
                <LvlIcon className="w-3 h-3 shrink-0" />
                <span>
                  {t.code} • {lang === 'ru' ? t.shortRu : t.shortTr}
                </span>
                <span className="px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[9.5px]">
                  {orgResult.levelCounts[lvl].toLocaleString('tr-TR')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Row 3: Search + Site Quick Pills + Department + Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
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
            } relative bg-slate-50/80 dark:bg-slate-950/80 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden`}
          >
            {/* Top-left subtle interaction tip */}
            <div className="absolute top-2.5 right-3 z-20 hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/80 dark:border-slate-700 text-[10.5px] text-slate-600 dark:text-slate-300 shadow-xs pointer-events-none">
              <span>Her görev kendi L1–L8 seviye satırında hizalanır • Karta dokunarak alt ekibi aç/kapat</span>
            </div>

            {/* Bottom-Right Corner Readable Zoom Controls */}
            <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 p-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-lg">
              <button
                type="button"
                onClick={() => setZoom((z) => clampZoom(z - 0.08))}
                disabled={zoom <= MIN_READABLE_ZOOM}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 cursor-pointer"
                title="Küçült (Okunabilir Sınır: %75)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-1.5 py-1 text-[11px] text-slate-700 dark:text-slate-200 min-w-[44px] text-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                title="%100 Tam Boyut"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => clampZoom(z + 0.08))}
                disabled={zoom >= MAX_READABLE_ZOOM}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 cursor-pointer"
                title="Büyüt"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
              <button
                type="button"
                onClick={resetToReadableInitialView}
                className="px-2 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] flex items-center gap-1 cursor-pointer"
                title="İlk Okunur Görünüme Sıfırla"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Sıfırla</span>
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

            {/* Scrollable & Drag-Pannable Level-Row Canvas */}
            <div
              ref={canvasViewportRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheelZoom}
              className={`${
                isFullscreen ? 'h-[calc(100vh-175px)]' : 'h-[calc(100vh-225px)] min-h-[540px]'
              } overflow-auto cursor-grab active:cursor-grabbing`}
            >
              {layoutData.rootItems.length === 0 ? (
                <div className="py-20 text-center text-sm text-slate-500">
                  Seçili filtre kriterlerine uygun personel bulunamadı.
                </div>
              ) : (
                <div
                  style={{
                    width: layoutData.canvasWidth * zoom,
                    height: layoutData.canvasHeight * zoom,
                  }}
                  className="relative"
                >
                  <div
                    style={{
                      width: layoutData.canvasWidth,
                      height: layoutData.canvasHeight,
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                    }}
                    className="relative"
                  >
                    {/* 1. Horizontal Corporate Level Swimlane Bands (L1 .. L8) */}
                    {layoutData.swimlanes.map((band) => {
                      const theme = ROLE_LEVEL_THEMES[band.levelNo];
                      const BandIcon = theme.icon;
                      return (
                        <div
                          key={band.rowKey}
                          style={{ top: band.topY, height: band.height }}
                          className={`absolute left-0 right-0 border-b border-dashed border-slate-200/80 dark:border-slate-800/80 ${
                            band.isEmptyPassThrough ? 'opacity-65' : theme.swimlaneBg
                          }`}
                        >
                          <div
                            style={{ width: SWIMLANE_LABEL_WIDTH - 12 }}
                            className="sticky left-2 z-10 pl-2 pt-2 pointer-events-none"
                          >
                            <div
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10.5px] shadow-2xs ${theme.swimlanePill}`}
                            >
                              <BandIcon className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {theme.code}
                                {band.subTier > 0 ? `.${band.subTier + 1}` : ''} •{' '}
                                {lang === 'ru' ? theme.shortRu : theme.shortTr}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* 2. Crisp SVG Orthogonal Level-Aligned Connectors */}
                    <svg
                      width={layoutData.canvasWidth}
                      height={layoutData.canvasHeight}
                      className="absolute inset-0 pointer-events-none z-[2]"
                    >
                      {layoutData.allItems.map((parentItem) => {
                        if (parentItem.children.length === 0) return null;
                        const pX = parentItem.centerX;
                        const pBottomY = parentItem.y + parentItem.height;
                        const hasPager = parentItem.totalChildSlots > SIBLING_PAGE_SIZE;
                        const busY = pBottomY + (hasPager ? 34 : 16);

                        const firstChild = parentItem.children[0];
                        const lastChild = parentItem.children[parentItem.children.length - 1];
                        const strokeColor = '#14b8a6';

                        return (
                          <g key={`edges-${parentItem.id}`}>
                            {/* Stem from parent bottom to distribution bus */}
                            <line
                              x1={pX}
                              y1={pBottomY}
                              x2={pX}
                              y2={busY}
                              stroke={strokeColor}
                              strokeWidth={2}
                            />
                            {/* Horizontal distribution bus across visible children */}
                            {parentItem.children.length > 1 && (
                              <line
                                x1={firstChild.centerX}
                                y1={busY}
                                x2={lastChild.centerX}
                                y2={busY}
                                stroke={strokeColor}
                                strokeWidth={2}
                              />
                            )}
                            {/* Vertical drop lines straight into each child's exact Level Row */}
                            {parentItem.children.map((ch) => {
                              const isDeepDrop = ch.y - busY > 55;
                              return (
                                <g key={`drop-${parentItem.id}-${ch.id}`}>
                                  <line
                                    x1={ch.centerX}
                                    y1={busY}
                                    x2={ch.centerX}
                                    y2={ch.y}
                                    stroke={strokeColor}
                                    strokeWidth={1.8}
                                    strokeDasharray={isDeepDrop ? '5 3' : undefined}
                                  />
                                  <circle
                                    cx={ch.centerX}
                                    cy={ch.y}
                                    r={3}
                                    fill={strokeColor}
                                  />
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                    </svg>

                    {/* 3. Interactive Sibling Pager Pills on Expanded Managers with > 6 Direct Slots */}
                    {layoutData.allItems.map((it) => {
                      if (it.totalChildSlots <= SIBLING_PAGE_SIZE) return null;
                      const pillTop = it.y + it.height + 5;
                      const startIdx = it.currentPage * SIBLING_PAGE_SIZE + 1;
                      const endIdx = Math.min(
                        (it.currentPage + 1) * SIBLING_PAGE_SIZE,
                        it.totalChildSlots
                      );

                      return (
                        <div
                          key={`pager-${it.id}`}
                          style={{
                            left: it.centerX,
                            top: pillTop,
                            transform: 'translateX(-50%)',
                          }}
                          className="absolute z-[6] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 shadow-sm text-[10px] whitespace-nowrap"
                        >
                          {!it.showAllActive && (
                            <>
                              <button
                                type="button"
                                disabled={it.currentPage === 0}
                                onClick={() =>
                                  handleSetSiblingPage(it.node.nodeId, it.currentPage - 1)
                                }
                                className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                              <span className="text-slate-700 dark:text-slate-200">
                                {startIdx}–{endIdx} / {it.totalChildSlots}
                              </span>
                              <button
                                type="button"
                                disabled={it.currentPage >= it.totalPages - 1}
                                onClick={() =>
                                  handleSetSiblingPage(it.node.nodeId, it.currentPage + 1)
                                }
                                className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                              <span className="text-slate-300 dark:text-slate-700">|</span>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleShowAllSiblings(it.node.nodeId)}
                            className="text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
                          >
                            {it.showAllActive
                              ? 'Sayfalı Göster'
                              : `Tümünü Aç (${it.totalChildSlots})`}
                          </button>
                        </div>
                      );
                    })}

                    {/* 4. Positioned Enterprise Cards & Consolidated Crew Cards on Their Exact Level Rows */}
                    {layoutData.allItems.map((it) => (
                      <div
                        key={it.id}
                        style={{ left: it.x, top: it.y }}
                        className="absolute z-[5]"
                      >
                        {it.kind === 'person' ? (
                          <OrgEnterpriseCard
                            node={it.node}
                            isExpanded={expandedIds.has(it.node.nodeId)}
                            isSelected={selectedNodeId === it.node.nodeId}
                            isHighlighted={highlightedNodeId === it.node.nodeId}
                            colorBySpan={colorBySpan}
                            onCardClick={handleCardClick}
                            onOpenKunye={(n) => setSelectedNodeId(n.nodeId)}
                            onInspectDrawer={handleInspectDrawer}
                            onFocusSubtree={(id) => setFocusNodeId(id)}
                          />
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
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Reporting Chain & Künye Panel */}
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
        /* Directory Table View */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm text-slate-900 dark:text-white">
                Yönetici & Ekip Sorumluları Dizini ({orgResult.totalManagers} Lider)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Herhangi bir yöneticiye tıklayarak şemada kendi L1–L8 seviye satırında açabilirsiniz.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[620px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4">Seviye</th>
                  <th className="py-2.5 px-4">Yönetici / Sorumlu</th>
                  <th className="py-2.5 px-4">Görevi</th>
                  <th className="py-2.5 px-4">Şantiye</th>
                  <th className="py-2.5 px-4">Üst Yöneticisi</th>
                  <th className="py-2.5 px-4 text-right">Doğrudan Bağlı</th>
                  <th className="py-2.5 px-4 text-right">Toplam Alt Ekip</th>
                  <th className="py-2.5 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {Array.from(orgResult.nodeById.values())
                  .filter((n) => !n.isVirtual && (n.directCount > 0 || n.roleLevel <= 3))
                  .sort(
                    (a, b) =>
                      a.roleLevel - b.roleLevel || b.totalSubordinates - a.totalSubordinates
                  )
                  .map((mgr) => {
                    const t = ROLE_LEVEL_THEMES[mgr.roleLevel];
                    return (
                      <tr
                        key={mgr.nodeId}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] ${t.badgeBg} ${t.badgeText}`}>
                            {t.code} • {t.shortTr}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-900 dark:text-white">
                          {mgr.ad_soyad}{' '}
                          {mgr.sicil_no ? (
                            <span className="text-slate-400">#{mgr.sicil_no}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          {mgr.gorevi}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          {mgr.effective_site}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">
                          {mgr.sorumlu_kisi || mgr.grup_sefi || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-800 dark:text-slate-200">
                          {mgr.directCount}
                        </td>
                        <td className="py-2.5 px-4 text-right text-teal-700 dark:text-teal-400">
                          {mgr.totalSubordinates.toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleLocatePersonInChart(mgr)}
                            className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer"
                          >
                            Şemada Göster
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
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
