'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { OrgRoleLevel } from '@/lib/orgChartBuilder';

export interface JobLevelItemDto {
  normTitle: string;
  displayTitle: string;
  levelNo: OrgRoleLevel;
  isConfirmed: boolean;
  source: 'seed' | 'new_detected' | 'manual';
  updatedBy: string;
  updatedAt: string;
  activeCount: number;
  totalCount: number;
  sampleEmployees: string[];
}

export const LEVEL_BADGE_CONFIG: Record<
  OrgRoleLevel,
  {
    code: string;
    shortLabel: string;
    fullLabel: string;
    pillBg: string;
    pillText: string;
    pillBorder: string;
    activeBtn: string;
  }
> = {
  1: {
    code: 'L1',
    shortLabel: 'Başkan',
    fullLabel: 'L1 • Yönetim Kurulu & Başkan',
    pillBg: 'bg-amber-950 dark:bg-amber-900/60',
    pillText: 'text-amber-200',
    pillBorder: 'border-amber-500/60',
    activeBtn: 'bg-amber-600 text-white border-amber-600 shadow-xs',
  },
  2: {
    code: 'L2',
    shortLabel: 'CEO / GM',
    fullLabel: 'L2 • CEO / COO & Genel Müdür',
    pillBg: 'bg-purple-50 dark:bg-purple-950/50',
    pillText: 'text-purple-700 dark:text-purple-300',
    pillBorder: 'border-purple-300 dark:border-purple-700',
    activeBtn: 'bg-purple-600 text-white border-purple-600 shadow-xs',
  },
  3: {
    code: 'L3',
    shortLabel: 'Direktör',
    fullLabel: 'L3 • Direktör & Koordinatör',
    pillBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    pillText: 'text-indigo-700 dark:text-indigo-300',
    pillBorder: 'border-indigo-300 dark:border-indigo-700',
    activeBtn: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
  },
  4: {
    code: 'L4',
    shortLabel: 'Müdür',
    fullLabel: 'L4 • Müdür & Şantiye Lideri',
    pillBg: 'bg-blue-50 dark:bg-blue-950/50',
    pillText: 'text-blue-700 dark:text-blue-300',
    pillBorder: 'border-blue-300 dark:border-blue-700',
    activeBtn: 'bg-blue-600 text-white border-blue-600 shadow-xs',
  },
  5: {
    code: 'L5',
    shortLabel: 'Şef',
    fullLabel: 'L5 • Grup, Kısım & Birim Şefi',
    pillBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    pillText: 'text-emerald-700 dark:text-emerald-300',
    pillBorder: 'border-emerald-300 dark:border-emerald-700',
    activeBtn: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
  },
  6: {
    code: 'L6',
    shortLabel: 'Müh. & Uzman',
    fullLabel: 'L6 • Mühendis, Uzman & Memur',
    pillBg: 'bg-sky-50 dark:bg-sky-950/50',
    pillText: 'text-sky-700 dark:text-sky-300',
    pillBorder: 'border-sky-300 dark:border-sky-700',
    activeBtn: 'bg-sky-600 text-white border-sky-600 shadow-xs',
  },
  7: {
    code: 'L7',
    shortLabel: 'Formen',
    fullLabel: 'L7 • Formen & Saha Sorumlusu',
    pillBg: 'bg-orange-50 dark:bg-orange-950/50',
    pillText: 'text-orange-700 dark:text-orange-300',
    pillBorder: 'border-orange-300 dark:border-orange-700',
    activeBtn: 'bg-orange-600 text-white border-orange-600 shadow-xs',
  },
  8: {
    code: 'L8',
    shortLabel: 'İşçi (Liste)',
    fullLabel: 'L8 • Saha Ekip & İşçi Kadrosu',
    pillBg: 'bg-slate-100 dark:bg-slate-800',
    pillText: 'text-slate-700 dark:text-slate-300',
    pillBorder: 'border-slate-300 dark:border-slate-700',
    activeBtn: 'bg-slate-800 dark:bg-slate-600 text-white border-slate-800 shadow-xs',
  },
};

interface JobTitleLevelModalProps {
  isOpen: boolean;
  initialTab?: 'all' | 'unconfirmed' | 'active';
  onClose: () => void;
  onSaved: (
    updatedLevelMap: Record<string, number>,
    updatedUnconfirmed: JobLevelItemDto[]
  ) => void;
}

export default function JobTitleLevelModal({
  isOpen,
  initialTab = 'active',
  onClose,
  onSaved,
}: JobTitleLevelModalProps) {
  const { user, showPermissionDenied } = useAuth();
  const canEdit = Boolean(user && user.role !== 'viewer');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<JobLevelItemDto[]>([]);
  const [tab, setTab] = useState<'all' | 'unconfirmed' | 'active'>(initialTab);
  const [levelFilter, setLevelFilter] = useState<OrgRoleLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [draftLevels, setDraftLevels] = useState<Record<string, OrgRoleLevel>>({});
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Quick add new job title form
  const [showAddRow, setShowAddRow] = useState(false);
  const [newTitleInput, setNewTitleInput] = useState('');
  const [newTitleLevel, setNewTitleLevel] = useState<OrgRoleLevel>(6);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setStatusMsg(null);
      setDraftLevels({});
    }
  }, [isOpen, initialTab]);

  const loadJobLevels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/org-chart/job-levels', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
        if (initialTab === 'unconfirmed' && data.unconfirmedCount === 0) {
          setTab('active');
        }
      }
    } catch {
      setStatusMsg({ type: 'err', text: 'Görev seviye listesi yüklenemedi.' });
    } finally {
      setLoading(false);
    }
  }, [initialTab]);

  useEffect(() => {
    if (isOpen) {
      loadJobLevels();
    }
  }, [isOpen, loadJobLevels]);

  const unconfirmedList = useMemo(
    () => items.filter((i) => !i.isConfirmed),
    [items]
  );

  const activeTitlesCount = useMemo(
    () => items.filter((i) => i.activeCount > 0).length,
    [items]
  );

  const levelSummaryCounts = useMemo(() => {
    const counts: Record<OrgRoleLevel, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
      8: 0,
    };
    for (const it of items) {
      const eff = draftLevels[it.normTitle] ?? it.levelNo;
      if (tab === 'active' && it.activeCount === 0) continue;
      if (tab === 'unconfirmed' && it.isConfirmed) continue;
      counts[eff] += 1;
    }
    return counts;
  }, [items, draftLevels, tab]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (tab === 'unconfirmed' && it.isConfirmed) return false;
      if (tab === 'active' && it.activeCount === 0 && it.isConfirmed) return false;
      const effLvl = draftLevels[it.normTitle] ?? it.levelNo;
      if (levelFilter !== 'all' && effLvl !== levelFilter) return false;
      if (q) {
        const matchTitle =
          it.displayTitle.toLowerCase().includes(q) ||
          it.normTitle.toLowerCase().includes(q);
        const matchSample = it.sampleEmployees.some((s) =>
          s.toLowerCase().includes(q)
        );
        if (!matchTitle && !matchSample) return false;
      }
      return true;
    });
  }, [items, tab, levelFilter, searchQuery, draftLevels]);

  const dirtyEntries = useMemo(() => {
    const list: Array<{ title: string; displayTitle: string; levelNo: OrgRoleLevel }> = [];
    for (const it of items) {
      const d = draftLevels[it.normTitle];
      if (d !== undefined && (d !== it.levelNo || !it.isConfirmed)) {
        list.push({
          title: it.normTitle,
          displayTitle: it.displayTitle,
          levelNo: d,
        });
      }
    }
    return list;
  }, [items, draftLevels]);

  const requireEditAccess = useCallback(() => {
    if (canEdit) return true;
    showPermissionDenied({
      actionLabelTr: 'Görev Sınıf Seviyesi Tanımlama & Düzenleme',
      actionLabelRu: 'Настройка уровней должностей',
      titleTr: 'Düzenleme Yetkisi Gerekli (Viewer Rolü Kısıtlı)',
      titleRu: 'Требуются права на редактирование',
      messageTr:
        'Organizasyon şemasındaki görev sınıf seviyelerini (L1–L8) tanımlama ve düzenleme işlemi yalnızca Gözlemci (Viewer) olmayan yetkili kullanıcılar tarafından yapılabilir.',
      messageRu:
        'Изменение уровней должностей (L1–L8) доступно только пользователям с правами редактирования (не Наблюдатель / Viewer).',
    });
    return false;
  }, [canEdit, showPermissionDenied]);

  const handleSelectLevel = (item: JobLevelItemDto, nextLevel: OrgRoleLevel) => {
    if (!requireEditAccess()) return;
    setDraftLevels((prev) => {
      const next = { ...prev };
      if (nextLevel === item.levelNo && item.isConfirmed) {
        delete next[item.normTitle];
      } else {
        next[item.normTitle] = nextLevel;
      }
      return next;
    });
  };

  const submitUpdates = async (
    updatesPayload: Array<{ title: string; displayTitle: string; levelNo: number }>
  ) => {
    if (!requireEditAccess() || updatesPayload.length === 0) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/org-chart/job-levels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: updatesPayload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatusMsg({
          type: 'err',
          text: data.message || 'Görev seviyeleri kaydedilemedi.',
        });
        return;
      }
      setItems(data.items || []);
      setDraftLevels({});
      setStatusMsg({
        type: 'ok',
        text: data.message || `${updatesPayload.length} görev seviyesi kaydedildi.`,
      });
      onSaved(data.levelMap || {}, data.unconfirmedTitles || []);
    } catch {
      setStatusMsg({ type: 'err', text: 'Sunucu bağlantı hatası oluştu.' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAllUnconfirmed = () => {
    const payload = unconfirmedList.map((it) => ({
      title: it.normTitle,
      displayTitle: it.displayTitle,
      levelNo: draftLevels[it.normTitle] ?? it.levelNo,
    }));
    submitUpdates(payload);
  };

  const handleAddNewTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireEditAccess()) return;
    const clean = newTitleInput.trim();
    if (!clean) return;
    await submitUpdates([
      {
        title: clean,
        displayTitle: clean,
        levelNo: newTitleLevel,
      },
    ]);
    setNewTitleInput('');
    setShowAddRow(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center p-3 sm:p-5 bg-slate-900/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base text-slate-900 dark:text-white">
                  Görev Sınıf Seviyeleri Yönetimi (L1 – L8)
                </h2>
                {canEdit ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    Düzenleme Yetkisi Aktif
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Lock className="w-3 h-3" />
                    Salt Okunur (Viewer Düzenleyemez)
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                Her görevin organizasyon şemasında hangi yatay seviye satırında (L1–L8) yer alacağını belirleyin.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddRow((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Yeni Görev Ekle
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Kapat"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Optional Quick-Add Bar */}
        {showAddRow && canEdit && (
          <form
            onSubmit={handleAddNewTitle}
            className="px-5 py-2.5 bg-teal-50/60 dark:bg-teal-950/25 border-b border-teal-200/70 dark:border-teal-900/50 flex flex-wrap items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={newTitleInput}
              onChange={(e) => setNewTitleInput(e.target.value)}
              placeholder="Yeni görev unvanı yazın (örn: Kıdemli Planlama Direktörü)..."
              className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
            />
            <select
              value={newTitleLevel}
              onChange={(e) => setNewTitleLevel(Number(e.target.value) as OrgRoleLevel)}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200"
            >
              {([1, 2, 3, 4, 5, 6, 7, 8] as OrgRoleLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {LEVEL_BADGE_CONFIG[lvl].fullLabel}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || !newTitleInput.trim()}
              className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs cursor-pointer"
            >
              Kaydet & Ekle
            </button>
          </form>
        )}

        {/* Unconfirmed New Job Titles Banner inside Modal */}
        {unconfirmedList.length > 0 && (
          <div className="px-5 py-2.5 bg-amber-50 dark:bg-amber-950/35 border-b border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Veritabanında seviyesi henüz onaylanmamış{' '}
                <span className="underline">{unconfirmedList.length} yeni görev unvanı</span> var.
                Seviyelerini kontrol edip onaylayın.
              </span>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={handleConfirmAllUnconfirmed}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11.5px] cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Yeni Görevlerin Tümünü Onayla ({unconfirmedList.length})
              </button>
            )}
          </div>
        )}

        {/* Filter & Search Toolbar */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setTab('active')}
                className={`px-2.5 py-1 rounded-md text-[11.5px] transition-all cursor-pointer ${
                  tab === 'active'
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Aktif Kadrodaki Görevler ({activeTitlesCount})
              </button>
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`px-2.5 py-1 rounded-md text-[11.5px] transition-all cursor-pointer ${
                  tab === 'all'
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Tüm Görev Havuzu ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('unconfirmed')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] transition-all cursor-pointer ${
                  tab === 'unconfirmed'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : unconfirmedList.length > 0
                      ? 'text-amber-700 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/50'
                      : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Onay Bekleyen Yeni ({unconfirmedList.length})
              </button>
            </div>

            <div className="relative flex-1 min-w-[220px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Görev unvanı veya personel ara..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
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
            </div>
          </div>

          {/* 8-Level Quick Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setLevelFilter('all')}
              className={`px-2 py-0.5 rounded-md text-[11px] border shrink-0 cursor-pointer ${
                levelFilter === 'all'
                  ? 'bg-slate-900 dark:bg-teal-600 text-white border-slate-900 dark:border-teal-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              Tüm Seviyeler
            </button>
            {([1, 2, 3, 4, 5, 6, 7, 8] as OrgRoleLevel[]).map((lvl) => {
              const cfg = LEVEL_BADGE_CONFIG[lvl];
              const active = levelFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(active ? 'all' : lvl)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border shrink-0 transition-all cursor-pointer ${
                    active ? cfg.activeBtn : `${cfg.pillBg} ${cfg.pillText} ${cfg.pillBorder}`
                  }`}
                >
                  <span>{cfg.code}</span>
                  <span>•</span>
                  <span>{cfg.shortLabel}</span>
                  <span className="opacity-75">({levelSummaryCounts[lvl]})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
              <span className="text-xs">Görev sınıf seviyeleri yükleniyor...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-14 text-center text-xs text-slate-500 dark:text-slate-400">
              Seçili filtreye uygun görev unvanı bulunamadı.
            </div>
          ) : (
            filteredItems.map((it) => {
              const effectiveLevel = draftLevels[it.normTitle] ?? it.levelNo;
              const isDirty = draftLevels[it.normTitle] !== undefined;
              const cfg = LEVEL_BADGE_CONFIG[effectiveLevel];

              return (
                <div
                  key={it.normTitle}
                  className={`px-5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 transition-colors ${
                    !it.isConfirmed
                      ? 'bg-amber-50/50 dark:bg-amber-950/20'
                      : isDirty
                        ? 'bg-teal-50/40 dark:bg-teal-950/20'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] text-slate-900 dark:text-white">
                        {it.displayTitle}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${cfg.pillBg} ${cfg.pillText} ${cfg.pillBorder}`}
                      >
                        {cfg.code} • {cfg.shortLabel}
                      </span>
                      {!it.isConfirmed && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Yeni Görev • Onay Bekliyor
                        </span>
                      )}
                      {it.source === 'manual' && it.isConfirmed && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          Özel Düzenlendi
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" />
                        Aktif: {it.activeCount} • Toplam Kayıt: {it.totalCount}
                      </span>
                      {it.sampleEmployees.length > 0 && (
                        <span className="truncate max-w-md">
                          Örn: {it.sampleEmployees.join(', ')}
                        </span>
                      )}
                      {it.updatedBy && it.source === 'manual' && (
                        <span className="text-[10.5px] text-slate-400">
                          ({it.updatedBy} • {it.updatedAt})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Interactive L1..L8 Level Selector */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {([1, 2, 3, 4, 5, 6, 7, 8] as OrgRoleLevel[]).map((lvl) => {
                      const lCfg = LEVEL_BADGE_CONFIG[lvl];
                      const selected = effectiveLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          title={lCfg.fullLabel}
                          onClick={() => handleSelectLevel(it, lvl)}
                          className={`px-2 py-1 rounded-md text-[11px] border transition-all cursor-pointer ${
                            selected
                              ? lCfg.activeBtn
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                          }`}
                        >
                          {lCfg.code}
                        </button>
                      );
                    })}
                    {!it.isConfirmed && canEdit && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          submitUpdates([
                            {
                              title: it.normTitle,
                              displayTitle: it.displayTitle,
                              levelNo: effectiveLevel,
                            },
                          ])
                        }
                        className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        Onayla
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs">
            {statusMsg ? (
              <span
                className={
                  statusMsg.type === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }
              >
                {statusMsg.text}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                Gösterilen: {filteredItems.length} görev unvanı
                {dirtyEntries.length > 0 && ` • ${dirtyEntries.length} bekleyen değişiklik`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {dirtyEntries.length > 0 && canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setDraftLevels({})}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={() => submitUpdates(dirtyEntries)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving
                    ? 'Kaydediliyor...'
                    : `Değişiklikleri Kaydet (${dirtyEntries.length})`}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/70 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
