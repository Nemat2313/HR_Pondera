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
  Sparkles,
  MapPin,
  Briefcase,
  ShieldAlert,
  Handshake,
  Clock,
  X,
  ArrowUpRight,
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

interface RoleTierMeta {
  level: OrgRoleLevel;
  badgeTr: string;
  badgeRu: string;
  titleTr: string;
  titleRu: string;
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
    titleTr: 'Başkan & Direktör',
    titleRu: 'Президент и Директора',
    icon: Crown,
    cardClass:
      'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/90 dark:from-[#0F172A] dark:via-[#151F38] dark:to-amber-950/70 text-white border-2 border-amber-400/70 shadow-lg shadow-amber-500/10',
    accentBarClass: 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500',
    avatarClass:
      'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 ring-2 ring-amber-300/60 shadow-md',
    pillClass: 'bg-amber-400/20 text-amber-200 border border-amber-400/40',
  },
  2: {
    level: 2,
    badgeTr: 'L2 • MÜDÜR / LİDER',
    badgeRu: 'У2 • ДИРЕКТОР ПРОЕКТА',
    titleTr: 'Proje Müdürü & Şantiye Şefi',
    titleRu: 'Руководители проектов и отделов',
    icon: Building2,
    cardClass:
      'bg-gradient-to-br from-white via-indigo-50/40 to-blue-50/50 dark:from-[#131C31] dark:via-indigo-950/35 dark:to-slate-900 text-slate-900 dark:text-white border-2 border-indigo-300 dark:border-indigo-500/60 shadow-md',
    accentBarClass: 'bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-500',
    avatarClass: 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-xs',
    pillClass:
      'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700',
  },
  3: {
    level: 3,
    badgeTr: 'L3 • GRUP / KISIM ŞEFİ',
    badgeRu: 'У3 • НАЧАЛЬНИК ГРУППЫ',
    titleTr: 'Grup & Kısım Şefi',
    titleRu: 'Начальники групп и участков',
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
    titleTr: 'Mühendis & Uzman (Beyaz Yaka)',
    titleRu: 'Инженеры и специалисты (ИТР)',
    icon: Compass,
    cardClass:
      'bg-white dark:bg-[#131C31] text-slate-900 dark:text-white border border-sky-200 dark:border-sky-700/60 shadow-2xs',
    accentBarClass: 'bg-gradient-to-r from-sky-500 to-cyan-500',
    avatarClass: 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white',
    pillClass:
      'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
  },
  5: {
    level: 5,
    badgeTr: 'L5 • FORMEN / SORUMLU',
    badgeRu: 'У5 • ФОРМЕН / МАСТЕР',
    titleTr: 'Formen & Ekip Sorumlusu',
    titleRu: 'Формены и ответственные мастера',
    icon: HardHat,
    cardClass:
      'bg-gradient-to-br from-white to-amber-50/40 dark:from-[#131C31] dark:to-amber-950/20 text-slate-900 dark:text-white border border-amber-300 dark:border-amber-600/60 shadow-2xs',
    accentBarClass: 'bg-gradient-to-r from-amber-500 to-orange-500',
    avatarClass: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
    pillClass:
      'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  },
  6: {
    level: 6,
    badgeTr: 'L6 • SAHA EKİBİ (LİSTE)',
    badgeRu: 'У6 • РАБОЧИЕ БРИГАДЫ',
    titleTr: 'Saha İşçileri (Tek Kutu Liste)',
    titleRu: 'Рабочие объекта (Единый список)',
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
 * Consolidated Single Box for Leaf Employees (Workers or Large Specialist Teams)
 * Renders all bottom-level workers in ONE clean, filterable roster card directly below their supervisor!
 */
function ConsolidatedCrewBox({
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
  subtitle?: string;
  members: OrgNode[];
  variant: 'workers' | 'specialists';
  highlightedNodeId: string | null;
  lang: string;
  translateVal: (v: string) => string;
  onSelectPerson: (n: OrgNode) => void;
  onOpenFullProfile: (n: OrgNode) => void;
}) {
  const [crewSearch, setCrewSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Role breakdown chips (top 4 trades)
  const roleBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      const g = m.gorevi || 'Diğer';
      map.set(g, (map.get(g) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [members]);

  const filteredMembers = useMemo(() => {
    if (!crewSearch.trim()) return members;
    const q = crewSearch.trim().toLowerCase();
    return members.filter(
      (m) =>
        m.ad_soyad.toLowerCase().includes(q) ||
        m.sicil_no.toLowerCase().includes(q) ||
        m.gorevi.toLowerCase().includes(q) ||
        m.uyruk.toLowerCase().includes(q)
    );
  }, [members, crewSearch]);

  // Ensure highlighted person is always visible even when collapsed to top 8
  const hasHighlightedInside = useMemo(
    () => Boolean(highlightedNodeId && members.some((m) => m.nodeId === highlightedNodeId)),
    [highlightedNodeId, members]
  );

  const visibleRows =
    showAll || hasHighlightedInside || crewSearch.trim()
      ? filteredMembers
      : filteredMembers.slice(0, 8);

  const isWorkerBox = variant === 'workers';

  return (
    <div
      className={`w-[320px] sm:w-[350px] rounded-2xl border overflow-hidden shadow-sm transition-all ${
        hasHighlightedInside
          ? 'ring-2 ring-emerald-500 border-emerald-500 bg-white dark:bg-[#131C31]'
          : isWorkerBox
          ? 'bg-slate-50/95 dark:bg-[#111A2E] border-slate-300/90 dark:border-slate-700'
          : 'bg-sky-50/40 dark:bg-[#111D33] border-sky-200 dark:border-sky-800/70'
      }`}
    >
      <div
        className={`h-1.5 w-full ${
          isWorkerBox
            ? 'bg-gradient-to-r from-slate-600 via-teal-600 to-slate-600'
            : 'bg-gradient-to-r from-sky-500 to-cyan-500'
        }`}
      />
      <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white ${
              isWorkerBox
                ? 'bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-700 dark:to-slate-600'
                : 'bg-gradient-to-br from-sky-500 to-cyan-600'
            }`}
          >
            {isWorkerBox ? <Users className="w-4 h-4" /> : <Compass className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${
            isWorkerBox
              ? 'bg-slate-800 dark:bg-slate-700 text-white'
              : 'bg-sky-600 text-white'
          }`}
        >
          {members.length} {lang === 'ru' ? 'чел.' : 'Kişi'}
        </span>
      </div>

      {/* Trade / Role Breakdown Chips */}
      <div className="px-3 py-2 bg-white/70 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-slate-800/80 flex flex-wrap gap-1">
        {roleBreakdown.map(([roleName, cnt]) => (
          <span
            key={roleName}
            className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700"
          >
            {translateVal(roleName)}: <strong>{cnt}</strong>
          </span>
        ))}
      </div>

      {/* Inline Quick Filter when > 6 members */}
      {members.length > 6 && (
        <div className="px-3 py-1.5 border-b border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900/30">
          <div className="relative">
            <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={crewSearch}
              onChange={(e) => setCrewSearch(e.target.value)}
              placeholder={lang === 'ru' ? 'Фильтр в бригаде...' : 'Bu kutuda personel ara...'}
              className="w-full pl-7 pr-2 py-1 text-[11px] rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
      )}

      {/* Compact Worker List */}
      <div className="max-h-60 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800/70 bg-white dark:bg-[#131C31]">
        {visibleRows.map((m) => {
          const isHighlighted = highlightedNodeId === m.nodeId;
          return (
            <div
              key={m.nodeId}
              id={`org-node-${m.nodeId}`}
              onClick={() => onSelectPerson(m)}
              className={`px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] cursor-pointer transition-colors ${
                isHighlighted
                  ? 'bg-emerald-100/90 dark:bg-emerald-900/50 text-emerald-950 dark:text-emerald-100 font-bold'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                    {m.sicil_no}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                    {m.ad_soyad}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {translateVal(m.gorevi)} {m.uyruk ? `• ${translateVal(m.uyruk)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFullProfile(m);
                }}
                title={lang === 'ru' ? 'Открыть карточку' : 'Personel Kartını Aç'}
                className="p-1 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {filteredMembers.length > 8 && !crewSearch.trim() && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="w-full py-1.5 px-3 text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 cursor-pointer transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Свернуть список' : 'Listeyi Daralt'}</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>
                {lang === 'ru'
                  ? `Показать всех (${filteredMembers.length})`
                  : `Tümünü Göster (+${filteredMembers.length - 8} kişi daha)`}
              </span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Role-Level Styled Person / Manager Card (6 Distinct Visual Tiers Without Photos)
 */
function OrgPersonCard({
  node,
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
}: {
  node: OrgNode;
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

  const isL1 = node.roleLevel === 1 && !node.isVirtual;
  const endirektPct =
    node.totalSubordinates > 0
      ? Math.round((node.subordinateEndirekt / node.totalSubordinates) * 100)
      : 0;

  return (
    <div
      id={`org-node-${node.nodeId}`}
      onClick={() => onSelectNode(node)}
      className={`relative w-[256px] sm:w-[268px] rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer select-none ${
        tier.cardClass
      } ${
        isHighlightedTarget
          ? 'ring-4 ring-emerald-500 scale-[1.02] shadow-xl'
          : isInHighlightChain
          ? 'ring-2 ring-teal-500 shadow-lg'
          : isSelected
          ? 'ring-2 ring-indigo-500 shadow-lg'
          : 'hover:-translate-y-0.5 hover:shadow-md'
      } ${dimmedByLevelFilter ? 'opacity-35 grayscale' : ''}`}
    >
      {/* Top Role-Level Accent Ribbon */}
      <div className={`h-1.5 w-full ${tier.accentBarClass}`} />

      <div className="p-3.5">
        {/* Top Row: Role Level Badge + Quick Actions */}
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <span className={`px-2 py-0.5 rounded-md text-[9.5px] font-extrabold tracking-wide ${tier.pillClass}`}>
            {node.virtualKind === 'subcon'
              ? lang === 'ru'
                ? 'СУБПОДРЯД'
                : 'TAŞERON BİRİMİ'
              : node.virtualKind === 'pending_pool'
              ? lang === 'ru'
                ? 'ОЖИДАНИЕ / ОТПУСК'
                : 'ATAMA / İZİN HAVUZU'
              : lang === 'ru'
              ? tier.badgeRu
              : tier.badgeTr}
          </span>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {node.totalSubordinates > 0 && (
              <button
                type="button"
                onClick={() => onFocusSubtree(node)}
                title={
                  lang === 'ru'
                    ? 'Сфокусировать поддерево'
                    : 'Bu Yöneticiden İtibaren Odakla (Alt Şema)'
                }
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

        {/* Identity Row: Role-Level Crest Avatar + Monogram + Name & Title */}
        <div className="flex items-start gap-2.5">
          <div
            className={`relative w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 font-extrabold text-xs ${tier.avatarClass}`}
          >
            <TierIcon className="w-3.5 h-3.5 mb-0.5 opacity-90" />
            <span className="text-[10px] leading-none tracking-tight">
              {getInitials(node.ad_soyad)}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h3
              title={node.ad_soyad}
              className={`text-xs font-extrabold leading-snug truncate ${
                isL1 ? 'text-white' : 'text-slate-900 dark:text-white'
              }`}
            >
              {node.ad_soyad}
            </h3>
            <p
              title={translateVal(node.gorevi)}
              className={`text-[11px] font-semibold leading-tight mt-0.5 truncate ${
                isL1
                  ? 'text-amber-300'
                  : node.roleLevel === 2
                  ? 'text-indigo-600 dark:text-indigo-300'
                  : node.roleLevel === 3
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {translateVal(node.gorevi)}
            </p>
            <div
              className={`flex items-center gap-1.5 mt-1 text-[10px] truncate ${
                isL1 ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <MapPin className="w-3 h-3 shrink-0 opacity-75" />
              <span className="truncate">{translateVal(node.effective_site || node.region)}</span>
              {!node.isVirtual && node.sicil_no && (
                <span className="font-mono opacity-80 shrink-0">• #{node.sicil_no}</span>
              )}
            </div>
          </div>
        </div>

        {/* Matrix / Dotted-Line Grup Şefi Indicator when Sorumlu Kişi !== Grup Şefi */}
        {node.dottedGrupSefiName && !node.isVirtual && (
          <div
            className={`mt-2 px-2 py-1 rounded-lg text-[10px] flex items-center justify-between gap-1 border border-dashed ${
              isL1
                ? 'bg-white/5 border-white/20 text-slate-200'
                : 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <span className="font-semibold shrink-0">Grup Şefi:</span>
            <span className="font-bold truncate">{node.dottedGrupSefiName}</span>
          </div>
        )}

        {/* Team Composition Mini-Bar for Managers */}
        {node.totalSubordinates > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className={isL1 ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}>
                {lang === 'ru' ? 'Прямые:' : 'Doğrudan:'}{' '}
                <strong className={isL1 ? 'text-white' : 'text-slate-800 dark:text-slate-200'}>
                  {node.directCount}
                </strong>
              </span>
              <span className={isL1 ? 'text-amber-200 font-bold' : 'text-slate-600 dark:text-slate-300 font-bold'}>
                {lang === 'ru' ? 'ИТР' : 'Beyaz'}: {node.subordinateEndirekt} •{' '}
                {lang === 'ru' ? 'Раб.' : 'Mavi'}: {node.subordinateDirekt}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex">
              <div
                className="bg-indigo-500 h-full"
                style={{ width: `${endirektPct}%` }}
                title={`Beyaz Yaka: %${endirektPct}`}
              />
              <div
                className="bg-teal-500 h-full"
                style={{ width: `${100 - endirektPct}%` }}
                title={`Mavi Yaka: %${100 - endirektPct}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Interactive Expand / Collapse Subordinates Footer Button */}
      {hasExpandableChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node);
          }}
          className={`w-full py-1.5 px-3 text-[11px] font-extrabold flex items-center justify-between transition-colors cursor-pointer border-t ${
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
                ? 'Свернуть команду'
                : 'Alt Ekibi Kapat'
              : lang === 'ru'
              ? `Открыть команду (+${node.totalSubordinates.toLocaleString('tr-TR')})`
              : `+${node.totalSubordinates.toLocaleString('tr-TR')} Kişi • Ekibi Aç`}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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

  // Filters & Hierarchy Mode
  const [hierarchyMode, setHierarchyMode] = useState<OrgHierarchyMode>('combined');
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [viewStyle, setViewStyle] = useState<'canvas' | 'directory'>('canvas');
  const [singleBranchMode, setSingleBranchMode] = useState<boolean>(true);
  const [levelHighlight, setLevelHighlight] = useState<OrgRoleLevel | null>(null);

  // Search & Chain Highlight
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerPerson, setDrawerPerson] = useState<PersonnelRecord | null>(null);

  // Expanded node IDs + Zoom
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<number>(1);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const canvasContentRef = useRef<HTMLDivElement | null>(null);

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

  // Default initial state: ONLY expand root node(s) at depth 0 so all top leaders fit cleanly on the first screen!
  const resetToFirstScreenDefault = useCallback(
    (rootsToExpand = orgResult.roots) => {
      const next = new Set<string>();
      if (rootsToExpand.length === 1) {
        next.add(rootsToExpand[0].nodeId);
      }
      setExpandedIds(next);
      setHighlightedNodeId(null);
      setZoom(1);
    },
    [orgResult.roots]
  );

  useEffect(() => {
    resetToFirstScreenDefault(orgResult.roots);
  }, [orgResult.roots, resetToFirstScreenDefault]);

  // Fit-to-screen helper
  const handleFitToScreen = useCallback(() => {
    const vp = canvasViewportRef.current;
    const ct = canvasContentRef.current;
    if (!vp || !ct) {
      setZoom(1);
      return;
    }
    const vpWidth = vp.clientWidth - 48;
    const contentWidth = ct.scrollWidth || vpWidth;
    if (contentWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0.55, Math.round((vpWidth / contentWidth) * 100) / 100));
    setZoom(ratio);
    vp.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }, []);

  // Upward chain computation for selected / highlighted / focused nodes
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
  const handleToggleExpand = useCallback(
    (node: OrgNode) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.nodeId)) {
          // Collapse this node and all its descendants
          const collapseRec = (n: OrgNode) => {
            next.delete(n.nodeId);
            for (const c of n.managerChildren) collapseRec(c);
          };
          collapseRec(node);
        } else {
          // In singleBranchMode, collapse sibling branches at the same parent level so screen stays tidy!
          if (singleBranchMode && node.parentId) {
            const parent = orgResult.nodeById.get(node.parentId);
            if (parent) {
              const collapseRec = (n: OrgNode) => {
                next.delete(n.nodeId);
                for (const c of n.managerChildren) collapseRec(c);
              };
              for (const sib of parent.managerChildren) {
                if (sib.nodeId !== node.nodeId) collapseRec(sib);
              }
            }
          }
          next.add(node.nodeId);
        }
        return next;
      });

      setTimeout(() => {
        const el = document.getElementById(`org-node-${node.nodeId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 90);
    },
    [orgResult.nodeById, singleBranchMode]
  );

  // Expand one additional level across currently visible nodes
  const handleExpandOneMoreLevel = () => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.size === 0) {
        for (const r of orgResult.roots) next.add(r.nodeId);
        return next;
      }
      const currentExpanded = Array.from(next);
      for (const id of currentExpanded) {
        const n = orgResult.nodeById.get(id);
        if (n) {
          for (const child of n.managerChildren) {
            next.add(child.nodeId);
          }
        }
      }
      return next;
    });
  };

  // Search autocomplete results across all nodes
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

  // Select a search result -> auto-expand its entire ancestor path and focus/highlight it!
  const handleLocatePersonInChart = (target: OrgNode) => {
    setFocusNodeId(null);
    const chain = getUpwardChain(target.nodeId);
    const nextExpanded = new Set<string>();
    // Expand every ancestor up to target's parent (and target itself if target is a manager)
    for (const anc of chain) {
      if (anc.nodeId !== target.nodeId || target.directCount > 0) {
        nextExpanded.add(anc.nodeId);
      }
    }
    setExpandedIds(nextExpanded);
    setHighlightedNodeId(target.nodeId);
    setSelectedNodeId(target.nodeId);
    setSearchQuery('');

    setTimeout(() => {
      const el = document.getElementById(`org-node-${target.nodeId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 150);
  };

  // Excel Hierarchy Export (Zero salary columns)
  const handleExportExcel = () => {
    const rowsOut: Record<string, any>[] = [];
    const walk = (n: OrgNode, chainNames: string[]) => {
      if (!n.isVirtual) {
        const parentNode = n.parentId ? orgResult.nodeById.get(n.parentId) : null;
        rowsOut.push({
          'Hiyerarşi Kademesi': `L${n.roleLevel}`,
          'Ağaç Derinliği': n.depth + 1,
          'Sicil No': n.sicil_no,
          'Ad Soyad': n.ad_soyad,
          Görevi: n.gorevi,
          'Yaka Türü': n.endirekt_direkt,
          'Bağlı Olduğu Yönetici (Şema)': parentNode ? parentNode.ad_soyad : 'ÜST KÖK',
          'Sorumlu Kişi (eBA)': n.sorumlu_kisi || '-',
          'Grup Şefi (eBA)': n.grup_sefi || '-',
          'Şantiye / Birim': n.effective_site,
          'Proje Adı': n.proje_adi,
          Departman: n.departman || '-',
          Uyruk: n.uyruk || '-',
          'Doğrudan Bağlı Kişi': n.directCount,
          'Toplam Alt Ekip': n.totalSubordinates,
          'Raporlama Zinciri': [...chainNames, n.ad_soyad].join(' ➔ '),
        });
      }
      const nextChain = n.isVirtual ? chainNames : [...chainNames, n.ad_soyad];
      for (const m of n.managerChildren) walk(m, nextChain);
      for (const s of n.specialistLeaves) walk(s, nextChain);
      for (const w of n.workerLeaves) walk(w, nextChain);
    };
    for (const r of orgResult.roots) walk(r, []);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rowsOut);
    XLSX.utils.book_append_sheet(wb, ws, 'Organizasyon_Semasi');
    XLSX.writeFile(
      wb,
      `Pondera_Organizasyon_Semasi_${selectedSite === 'all' ? 'Tum_Sirket' : selectedSite}_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
  };

  // Recursive visual subtree renderer
  const renderVisualSubtree = (node: OrgNode): React.ReactNode => {
    const hasExpandable =
      node.managerChildren.length > 0 ||
      node.specialistLeaves.length > 0 ||
      node.workerLeaves.length > 0;
    const isExpanded = expandedIds.has(node.nodeId);
    const anyChildManagerExpanded = node.managerChildren.some((c) => expandedIds.has(c.nodeId));

    // Smart layout rule so initial screen & collapsed tiers NEVER overflow 10,000px horizontally:
    // If none of this node's managerChildren are themselves expanded AND there are > 4 managerChildren,
    // arrange them in a crisp centered 4-column org grid! When a child IS expanded, switch to flex row!
    const useCompactMultiRowGrid = !anyChildManagerExpanded && node.managerChildren.length > 4;

    // For White-Collar Specialist Leaves: if <= 3, show individual L4 cards; if > 3, consolidate into a sleek Specialist Box!
    const consolidateSpecialists = node.specialistLeaves.length > 3;

    return (
      <div key={node.nodeId} className="flex flex-col items-center">
        <OrgPersonCard
          node={node}
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
            setExpandedIds(new Set([n.nodeId]));
          }}
          onOpenFullProfile={(n) => setDrawerPerson(toMinimalPersonnelRecord(n))}
        />

        {isExpanded && hasExpandable && (
          <div className="flex flex-col items-center w-full">
            {/* Vertical Connector Stem Down from Manager */}
            <div className="w-0.5 h-6 bg-slate-300 dark:bg-slate-600" />

            {/* 1. Sub-Managers & Supervisors Tier */}
            {node.managerChildren.length > 0 && (
              <div className="relative flex flex-col items-center">
                {useCompactMultiRowGrid ? (
                  <div className="p-3.5 rounded-2xl bg-slate-100/75 dark:bg-slate-900/55 border border-slate-200/90 dark:border-slate-800 shadow-inner">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center mb-2.5">
                      {lang === 'ru'
                        ? `Прямое подчинение — руководители (${node.managerChildren.length}) • нажмите для раскрытия`
                        : `${node.ad_soyad} — Bağlı Yöneticiler & Birim Liderleri (${node.managerChildren.length}) • Alt ekibi görmek için karta tıklayın`}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 justify-items-center">
                      {node.managerChildren.map((child) => renderVisualSubtree(child))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-center gap-4 pt-3 relative">
                    {node.managerChildren.length > 1 && (
                      <div className="absolute top-0 left-[134px] right-[134px] h-0.5 bg-slate-300 dark:bg-slate-600" />
                    )}
                    {node.managerChildren.map((child) => (
                      <div key={child.nodeId} className="flex flex-col items-center relative">
                        {node.managerChildren.length > 1 && (
                          <div className="w-0.5 h-3 bg-slate-300 dark:bg-slate-600 -mt-3" />
                        )}
                        {renderVisualSubtree(child)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Connector between Sub-Managers and Direct Leaf Teams if both exist */}
            {node.managerChildren.length > 0 &&
              (node.specialistLeaves.length > 0 || node.workerLeaves.length > 0) && (
                <div className="w-0.5 h-5 bg-slate-300 dark:bg-slate-600" />
              )}

            {/* 2. Leaf Specialists & Consolidated Single Worker List Box */}
            {(node.specialistLeaves.length > 0 || node.workerLeaves.length > 0) && (
              <div className="flex flex-wrap items-start justify-center gap-4">
                {/* Specialist Leaves: <=3 as individual L4 cards, >3 as consolidated Specialist Box */}
                {node.specialistLeaves.length > 0 &&
                  (consolidateSpecialists ? (
                    <ConsolidatedCrewBox
                      title={
                        lang === 'ru'
                          ? 'Инженеры и специалисты (ИТР)'
                          : 'Doğrudan Bağlı Uzman & Mühendisler'
                      }
                      subtitle={`${node.ad_soyad} • Beyaz Yaka`}
                      members={node.specialistLeaves}
                      variant="specialists"
                      highlightedNodeId={highlightedNodeId}
                      lang={lang}
                      translateVal={translateVal}
                      onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
                      onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start justify-center gap-3">
                      {node.specialistLeaves.map((sp) => (
                        <OrgPersonCard
                          key={sp.nodeId}
                          node={sp}
                          isExpanded={false}
                          hasExpandableChildren={false}
                          isSelected={selectedNodeId === sp.nodeId}
                          isInHighlightChain={highlightChainIds.has(sp.nodeId)}
                          isHighlightedTarget={highlightedNodeId === sp.nodeId}
                          dimmedByLevelFilter={
                            levelHighlight !== null && sp.roleLevel !== levelHighlight
                          }
                          lang={lang}
                          translateVal={translateVal}
                          onToggleExpand={() => {}}
                          onSelectNode={(n) => setSelectedNodeId(n.nodeId)}
                          onFocusSubtree={() => {}}
                          onOpenFullProfile={(n) => setDrawerPerson(toMinimalPersonnelRecord(n))}
                        />
                      ))}
                    </div>
                  ))}

                {/* Bottom Field Workers: ALWAYS in ONE single Consolidated Crew List Box! */}
                {node.workerLeaves.length > 0 && (
                  <ConsolidatedCrewBox
                    title={
                      lang === 'ru'
                        ? 'Рабочая бригада (Единый список)'
                        : 'Saha İşçileri Ekip Listesi (Tek Kutu)'
                    }
                    subtitle={`${node.ad_soyad} • ${
                      lang === 'ru' ? 'Прямое подчинение' : 'Doğrudan Bağlı Saha Ekibi'
                    }`}
                    members={node.workerLeaves}
                    variant="workers"
                    highlightedNodeId={highlightedNodeId}
                    lang={lang}
                    translateVal={translateVal}
                    onSelectPerson={(m) => setSelectedNodeId(m.nodeId)}
                    onOpenFullProfile={(m) => setDrawerPerson(toMinimalPersonnelRecord(m))}
                  />
                )}
              </div>
            )}
          </div>
        )}
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
            highlightedNodeId === node.nodeId
              ? 'bg-emerald-50 dark:bg-emerald-950/40'
              : ''
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
            <span className="font-extrabold text-slate-900 dark:text-white truncate">
              {node.ad_soyad}
            </span>
            <span className="text-slate-500 dark:text-slate-400 truncate">
              • {translateVal(node.gorevi)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
              {translateVal(node.effective_site)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {node.totalSubordinates > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[11px] font-bold">
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
                className="p-1 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-slate-800"
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
                <ConsolidatedCrewBox
                  title={
                    lang === 'ru'
                      ? 'Рабочая бригада (Единый список)'
                      : 'Saha İşçileri Ekip Listesi (Tek Kutu)'
                  }
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
    <div className="p-4 sm:p-6 space-y-4">
      {/* 1. HEADER & EXECUTIVE ACTIONS */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white flex items-center justify-center shadow-sm">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {lang === 'ru'
                  ? 'Организационная структура и иерархия'
                  : 'Organizasyon Şeması & Raporlama Hiyerarşisi'}
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {lang === 'ru'
                  ? 'Интерактивная схема подчинения на базе полей «Ответственный» и «Начальник группы» (6 ролевых уровней)'
                  : 'Sorumlu Kişi ve Grup Şefi verilerinden dinamik üretilen 6 kademeli kurumsal organizasyon ağacı'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hierarchy Source Selector */}
          <div className="inline-flex p-1 rounded-xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs">
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? 'Экспорт иерархии (.xlsx)' : 'Hiyerarşi İndir (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI STRIP + 6 ROLE-LEVEL VISUAL LEGEND */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {lang === 'ru' ? 'Активный персонал в схеме' : 'Şemadaki Aktif Kadro'}
          </span>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-0.5">
            {orgResult.totalStaff.toLocaleString('tr-TR')}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Beyaz Yaka:{' '}
            <strong>
              {(
                orgResult.levelCounts[1] +
                orgResult.levelCounts[2] +
                orgResult.levelCounts[3] +
                orgResult.levelCounts[4]
              ).toLocaleString('tr-TR')}
            </strong>{' '}
            • Saha:{' '}
            <strong>
              {(orgResult.levelCounts[5] + orgResult.levelCounts[6]).toLocaleString('tr-TR')}
            </strong>
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {lang === 'ru' ? 'Руководители и ответственные' : 'Yönetici & Ekip Sorumlusu'}
          </span>
          <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {orgResult.totalManagers.toLocaleString('tr-TR')}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {lang === 'ru' ? 'Имеют подчиненных в схеме' : 'Altında doğrudan ekip bulunan liderler'}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {lang === 'ru' ? 'Норма управляемости (Span)' : 'Ort. Yönetim Çapı (Span)'}
          </span>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
            1 : {orgResult.avgSpanOfControl}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {lang === 'ru' ? 'Среднее число подчиненных' : 'Yönetici başına ortalama bağlı personel'}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {lang === 'ru' ? 'Глубина иерархии' : 'Organizasyon Derinliği'}
          </span>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
            {orgResult.maxDepth + 1} {lang === 'ru' ? 'уровней' : 'Kademe'}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {orgResult.sites.length} {lang === 'ru' ? 'объектов / офисов' : 'aktif şantiye & merkez birimi'}
          </span>
        </div>
      </div>

      {/* 3. ROLE-LEVEL FORMAT LEGEND + SMART SEARCH & SITE QUICK PILLS */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
        {/* 6 Visual Role-Level Formats Legend (Clickable filter) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 mr-1">
              {lang === 'ru' ? 'Форматы карточек по уровням:' : 'Görev Seviyesi Kart Formatları:'}
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
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                    active
                      ? 'ring-2 ring-teal-500 bg-slate-900 text-white dark:bg-teal-600 border-transparent'
                      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center ${cfg.avatarClass}`}>
                    <Icon className="w-2.5 h-2.5" />
                  </span>
                  <span>{lang === 'ru' ? cfg.titleRu : cfg.titleTr}</span>
                  <span className="px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10 text-[10px] font-extrabold">
                    {orgResult.levelCounts[lvl].toLocaleString('tr-TR')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search + Site Scope Pills + Toolbar Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Smart Search with Auto-Chain Tracer */}
          <div className="relative w-full xl:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'ru'
                  ? 'Найти сотрудника и показать цепочку...'
                  : 'Kişi veya Sicil ara ➔ Bağlı olduğu zinciri aç...'
              }
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Instant Search Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {searchResults.map((res) => {
                  const cfg = ROLE_TIER_CONFIG[res.roleLevel];
                  return (
                    <button
                      key={res.nodeId}
                      type="button"
                      onClick={() => handleLocatePersonInChart(res)}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-teal-50/60 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {res.ad_soyad}{' '}
                          <span className="font-mono text-[10px] text-slate-400">
                            #{res.sicil_no}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {translateVal(res.gorevi)} • {translateVal(res.effective_site)}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${cfg.pillClass}`}>
                        L{res.roleLevel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Department Filter + View & Zoom Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setFocusNodeId(null);
              }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">{lang === 'ru' ? 'Все отделы' : 'Tüm Departmanlar'}</option>
              {orgResult.departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {translateVal(d.name)} ({d.count})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSingleBranchMode((v) => !v)}
              title={
                lang === 'ru'
                  ? 'Автоматически сворачивать соседние ветки для компактности'
                  : 'Açıkken bir yöneticiye tıkladığınızda yan dalları otomatik kapatarak şemayı ekranda derli toplu tutar'
              }
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                singleBranchMode
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 border-teal-300 dark:border-teal-700'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {lang === 'ru' ? 'Фокус одной ветки' : 'Tek Dal Odak Modu'}
            </button>

            <button
              type="button"
              onClick={handleExpandOneMoreLevel}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              {lang === 'ru' ? '+1 Уровень' : '+1 Kademe Aç'}
            </button>

            <button
              type="button"
              onClick={() => {
                setFocusNodeId(null);
                resetToFirstScreenDefault(orgResult.roots);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'ru' ? 'Сброс (1-й экран)' : 'İlk Ekrana Sıfırla'}</span>
            </button>

            {/* View Switcher: Visual Org Canvas vs Directory Tree */}
            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewStyle('canvas')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  viewStyle === 'canvas'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Схема' : 'Şema'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('directory')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                  viewStyle === 'directory'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <ListTree className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? 'Список' : 'Dizin'}</span>
              </button>
            </div>

            {viewStyle === 'canvas' && (
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.55, Math.round((z - 0.1) * 100) / 100))}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                  title="Küçült"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold w-11 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1.35, Math.round((z + 0.1) * 100) / 100))}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                  title="Büyüt"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleFitToScreen}
                  className="ml-1 px-2 py-0.5 rounded bg-teal-600 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer hover:bg-teal-700"
                  title={lang === 'ru' ? 'Вписать в экран' : 'Ekrana Sığdır'}
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>{lang === 'ru' ? 'Вписать' : 'Sığdır'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Site / Project Quick Scope Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          <button
            type="button"
            onClick={() => {
              setSelectedSite('all');
              setFocusNodeId(null);
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
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
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                selectedSite === s.name
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {translateVal(s.name)} ({s.count.toLocaleString('tr-TR')})
            </button>
          ))}
        </div>
      </div>

      {/* Breadcrumb Bar when Subtree Focus or Highlight Chain is active */}
      {(focusBreadcrumb.length > 0 || highlightChainIds.size > 0) && (
        <div className="px-4 py-2.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-extrabold text-indigo-800 dark:text-indigo-200">
              {focusNodeId
                ? lang === 'ru'
                  ? 'Фокус ветки:'
                  : 'Odaklanan Alt Şema:'
                : lang === 'ru'
                ? 'Цепочка подчинения:'
                : 'Raporlama Zinciri:'}
            </span>
            <button
              type="button"
              onClick={() => {
                setFocusNodeId(null);
                setHighlightedNodeId(null);
              }}
              className="font-bold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
            >
              Pondera Industry
            </button>
            {(focusNodeId ? focusBreadcrumb : getUpwardChain(highlightedNodeId)).map((item) => (
              <React.Fragment key={item.nodeId}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(item.nodeId);
                    if (focusNodeId) setFocusNodeId(item.nodeId);
                  }}
                  className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 font-bold text-slate-800 dark:text-slate-100 hover:border-teal-500 cursor-pointer"
                >
                  {item.ad_soyad}{' '}
                  <span className="text-[10px] text-slate-500">({translateVal(item.gorevi)})</span>
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
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            {lang === 'ru' ? 'Показать всю схему' : 'Tam Şemaya Dön'}
          </button>
        </div>
      )}

      {/* 4. MAIN INTERACTIVE ORG CHART CANVAS + SELECTED NODE CHAIN INSPECTOR */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div
          className={`${
            selectedNode ? 'xl:col-span-9' : 'xl:col-span-12'
          } bg-white dark:bg-[#131C31] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden`}
        >
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {lang === 'ru'
                  ? 'Построение организационной структуры...'
                  : 'Organizasyon hiyerarşisi oluşturuluyor...'}
              </p>
            </div>
          ) : orgResult.roots.length === 0 ? (
            <div className="py-20 text-center text-xs text-slate-500">
              {lang === 'ru'
                ? 'Сотрудники по выбранному фильтру не найдены.'
                : 'Seçilen filtreye uygun personel bulunamadı.'}
            </div>
          ) : viewStyle === 'directory' ? (
            <div className="max-h-[72vh] overflow-y-auto">
              {orgResult.roots.map((r) => renderDirectoryRow(r, 0))}
            </div>
          ) : (
            <div
              ref={canvasViewportRef}
              className="overflow-auto min-h-[560px] max-h-[76vh] p-6 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:18px_18px]"
            >
              <div
                ref={canvasContentRef}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                }}
                className="inline-flex min-w-full justify-center pb-12 transition-transform duration-150"
              >
                <div className="flex flex-wrap items-start justify-center gap-8">
                  {orgResult.roots.map((rootNode) => renderVisualSubtree(rootNode))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Selected Person Reporting Chain Inspector */}
        {selectedNode && (
          <div className="xl:col-span-3 p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200/80 dark:border-slate-800 shadow-card space-y-4 sticky top-18">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  {lang === 'ru' ? 'Карточка иерархии' : 'Hiyerarşi & Bağlılık Künyesi'}
                </span>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">
                  {selectedNode.ad_soyad}
                </h3>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {translateVal(selectedNode.gorevi)}
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

            {/* Reporting Fields from eBA */}
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Sorumlu Kişi (eBA)
                </span>
                <span className="font-extrabold text-slate-900 dark:text-white">
                  {selectedNode.sorumlu_kisi || '-'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Grup Şefi (eBA)
                </span>
                <span className="font-extrabold text-slate-900 dark:text-white">
                  {selectedNode.grup_sefi || '-'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300 block">
                    {lang === 'ru' ? 'Прямых' : 'Doğrudan Bağlı'}
                  </span>
                  <span className="text-base font-extrabold text-indigo-900 dark:text-indigo-100">
                    {selectedNode.directCount}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-300 block">
                    {lang === 'ru' ? 'Всего внизу' : 'Toplam Alt Ekip'}
                  </span>
                  <span className="text-base font-extrabold text-emerald-900 dark:text-emerald-100">
                    {selectedNode.totalSubordinates.toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Full Upward Reporting Chain */}
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                {lang === 'ru' ? 'Вертикаль подчинения (Сверху вниз)' : 'Üst Yönetim Zinciri (Kime Bağlı)'}
              </span>
              <div className="space-y-1.5">
                {selectedNodeChain.map((step, i) => {
                  const isSelf = step.nodeId === selectedNode.nodeId;
                  return (
                    <div
                      key={step.nodeId}
                      onClick={() => handleLocatePersonInChart(step)}
                      className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSelf
                          ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-400 font-bold'
                          : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-700 hover:border-teal-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {i + 1}. {step.ad_soyad}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {translateVal(step.gorevi)}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                        L{step.roleLevel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {selectedNode.totalSubordinates > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFocusNodeId(selectedNode.nodeId);
                    setExpandedIds(new Set([selectedNode.nodeId]));
                  }}
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'ru'
                      ? 'Сфокусировать схему на этом руководителе'
                      : 'Bu Yöneticinin Alt Şemasını Odakla'}
                  </span>
                </button>
              )}

              {!selectedNode.isVirtual && selectedNode.personId && (
                <button
                  type="button"
                  onClick={() => setDrawerPerson(toMinimalPersonnelRecord(selectedNode))}
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {lang === 'ru'
                      ? 'Открыть полную карточку (198 колонок)'
                      : 'Tam Personel Kartını Aç (198 Kolon)'}
                  </span>
                </button>
              )}

              {onNavigateToPersonnel && !selectedNode.isVirtual && (
                <button
                  type="button"
                  onClick={() => onNavigateToPersonnel('search', selectedNode.ad_soyad)}
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>{lang === 'ru' ? 'Показать в списке персонала' : 'Personel Listesinde Göster'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Full 198-Column Personnel Detail Drawer */}
      <PersonnelDetailDrawer
        personnel={drawerPerson}
        onClose={() => setDrawerPerson(null)}
      />
    </div>
  );
}
