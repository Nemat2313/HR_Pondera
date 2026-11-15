'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  Building2,
  Plus,
  Layers,
  BedDouble,
  CheckCircle2,
  Trash2,
  UserPlus,
  Search,
  Sparkles,
  Loader2,
  Save,
  Minus,
} from 'lucide-react';
import {
  CampAnalyticsPayload,
  CampDefinitionDetail,
  CampType,
  RoomOperationalStatus,
  RoomType,
} from '@/lib/campManager';
import { useLanguage } from '@/context/LanguageContext';

export type AdminModalInitialTab = 'camp_form' | 'rooms_add' | 'rooms_inventory' | 'assign_person';

interface CampAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AdminModalInitialTab;
  initialCampId?: number | null;
  initialRoomNo?: string;
  payload: CampAnalyticsPayload;
  filterRegion: string;
  filterProject: string;
  onMutated: (nextPayload: CampAnalyticsPayload, message: string, createdCampId?: number) => void;
}

export default function CampAdminModal({
  isOpen,
  onClose,
  initialTab = 'camp_form',
  initialCampId = null,
  initialRoomNo = '',
  payload,
  filterRegion,
  filterProject,
  onMutated,
}: CampAdminModalProps) {
  const { lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<AdminModalInitialTab>(initialTab);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Camp Form State
  const [editingCampId, setEditingCampId] = useState<number>(0);
  const [formRegion, setFormRegion] = useState('');
  const [formProject, setFormProject] = useState('');
  const [formCampCode, setFormCampCode] = useState('');
  const [formCampName, setFormCampName] = useState('');
  const [formCampType, setFormCampType] = useState<CampType>('modular');
  const [formDefaultCap, setFormDefaultCap] = useState(4);
  const [formNotes, setFormNotes] = useState('');
  const [formInitStart, setFormInitStart] = useState('');
  const [formInitEnd, setFormInitEnd] = useState('');
  const [confirmDeleteCampId, setConfirmDeleteCampId] = useState<number | null>(null);

  // Room Add State
  const [targetCampId, setTargetCampId] = useState<number>(initialCampId || payload.camps[0]?.id || 0);
  const [roomAddMode, setRoomAddMode] = useState<'range' | 'single'>('range');
  const [rangeStart, setRangeStart] = useState('201');
  const [rangeEnd, setRangeEnd] = useState('216');
  const [rangePrefix, setRangePrefix] = useState('');
  const [singleRoomNo, setSingleRoomNo] = useState('');
  const [roomFloorAuto, setRoomFloorAuto] = useState(true);
  const [roomFloorFixed, setRoomFloorFixed] = useState(1);
  const [roomCap, setRoomCap] = useState(4);
  const [roomType, setRoomType] = useState<RoomType>('worker');
  const [roomStatus, setRoomStatus] = useState<RoomOperationalStatus>('active');

  // Person Assign State
  const [assignCampId, setAssignCampId] = useState<number>(initialCampId || payload.camps[0]?.id || 0);
  const [assignRoomNo, setAssignRoomNo] = useState(initialRoomNo || '');
  const [personSearch, setPersonSearch] = useState('');
  const [personPoolFilter, setPersonPoolFilter] = useState<'unassigned' | 'camp_no_room' | 'all'>('unassigned');

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setErrorMsg(null);
    setStatusMsg(null);
    setConfirmDeleteCampId(null);
    const defaultCamp =
      payload.camps.find((c) => c.id === initialCampId) || payload.camps[0] || null;
    if (defaultCamp) {
      setTargetCampId(defaultCamp.id);
      setAssignCampId(defaultCamp.id);
      setRoomCap(defaultCamp.defaultRoomCapacity || 4);
    }
    if (initialRoomNo) {
      setAssignRoomNo(initialRoomNo);
    }
    const defaultReg =
      filterRegion !== 'all'
        ? filterRegion
        : defaultCamp?.region || payload.filterOptions.regions[0]?.name || 'Svobodny-AGHK';
    const defaultPrj =
      filterProject !== 'all'
        ? filterProject
        : defaultCamp?.projectName ||
          payload.filterOptions.projects.find((p) => p.region === defaultReg)?.name ||
          defaultReg;
    setEditingCampId(0);
    setFormRegion(defaultReg);
    setFormProject(defaultPrj);
    setFormCampCode('');
    setFormCampName('');
    setFormCampType('modular');
    setFormDefaultCap(4);
    setFormNotes('');
    setFormInitStart('');
    setFormInitEnd('');
  }, [isOpen, initialTab, initialCampId, initialRoomNo, filterRegion, filterProject, payload]);

  const selectedTargetCamp: CampDefinitionDetail | undefined = useMemo(
    () => payload.camps.find((c) => c.id === targetCampId) || payload.camps[0],
    [payload.camps, targetCampId]
  );

  const selectedAssignCamp: CampDefinitionDetail | undefined = useMemo(
    () => payload.camps.find((c) => c.id === assignCampId) || payload.camps[0],
    [payload.camps, assignCampId]
  );

  const regionOptions = useMemo(() => {
    const names = payload.filterOptions.regions.map((r) => r.name);
    if (formRegion && !names.includes(formRegion)) names.unshift(formRegion);
    return names;
  }, [payload.filterOptions.regions, formRegion]);

  const projectOptions = useMemo(() => {
    const names = payload.filterOptions.projects
      .filter((p) => !formRegion || p.region === formRegion)
      .map((p) => p.name);
    if (formProject && !names.includes(formProject)) names.unshift(formProject);
    return names;
  }, [payload.filterOptions.projects, formRegion, formProject]);

  const callCampApi = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);
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
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'İşlem başarısız oldu.');
      }
      setStatusMsg(json.message || 'Kaydedildi.');
      onMutated(json as CampAnalyticsPayload, json.message, json.createdCampId);
      if (json.createdCampId) {
        setTargetCampId(json.createdCampId);
        setAssignCampId(json.createdCampId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadCampIntoForm = (camp: CampDefinitionDetail) => {
    setEditingCampId(camp.id);
    setFormRegion(camp.region);
    setFormProject(camp.projectName);
    setFormCampCode(camp.campCode);
    setFormCampName(camp.campName);
    setFormCampType(camp.campType);
    setFormDefaultCap(camp.defaultRoomCapacity);
    setFormNotes(camp.notes || '');
    setFormInitStart('');
    setFormInitEnd('');
    setConfirmDeleteCampId(null);
  };

  const resetCampFormForNew = () => {
    setEditingCampId(0);
    setFormCampCode('');
    setFormCampName('');
    setFormCampType('modular');
    setFormDefaultCap(4);
    setFormNotes('');
    setFormInitStart('101');
    setFormInitEnd('116');
    setConfirmDeleteCampId(null);
  };

  const personPool = useMemo(() => {
    const base =
      personPoolFilter === 'unassigned'
        ? payload.unassignedPersonnelSample
        : personPoolFilter === 'camp_no_room'
          ? payload.allCampResidents.filter((r) => !r.roomNo)
          : [...payload.allCampResidents, ...payload.unassignedPersonnelSample];
    const q = personSearch.trim().toLowerCase();
    if (!q) return base.slice(0, 60);
    return base
      .filter(
        (p) =>
          p.adSoyad.toLowerCase().includes(q) ||
          p.sicilNo.toLowerCase().includes(q) ||
          p.gorevi.toLowerCase().includes(q) ||
          p.uyruk.toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [payload, personPoolFilter, personSearch]);

  if (!isOpen) return null;

  const rangePreviewCount =
    roomAddMode === 'range' && rangeStart && rangeEnd
      ? Math.max(0, Math.abs(Number(rangeEnd) - Number(rangeStart)) + 1)
      : 1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-100/90 via-emerald-50/50 to-white dark:from-emerald-950/60 dark:via-[#14233E] dark:to-[#122A44] border-b border-emerald-200/70 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Панель АХО: Управление городками, комнатами и вместимостью'
                  : 'İdari İşler: Kamp, Oda No & Yatak Kapasitesi Yönetim Paneli'}
              </h2>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                {lang === 'ru'
                  ? 'Добавляйте городки по регионам/объектам, задавайте серии комнат, коек и распределяйте персонал'
                  : 'Bölge & şantiye bazlı kampları yönetin, toplu boş oda ve yatak kapasitesi tanımlayın'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          {(
            [
              {
                id: 'camp_form',
                icon: Building2,
                tr: '1. Kamp Tanımla / Düzenle',
                ru: '1. Создать / Изменить городок',
              },
              {
                id: 'rooms_add',
                icon: Plus,
                tr: '2. Toplu / Tekli Oda Ekle',
                ru: '2. Добавить комнаты (диапазон)',
              },
              {
                id: 'rooms_inventory',
                icon: Layers,
                tr: '3. Oda Kapasite Envanteri',
                ru: '3. Реестр и вместимость комнат',
              },
              {
                id: 'assign_person',
                icon: UserPlus,
                tr: '4. Personel Oda Atama',
                ru: '4. Заселение персонала',
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{lang === 'ru' ? tab.ru : tab.tr}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback Banner */}
        {(errorMsg || statusMsg) && (
          <div className="px-5 pt-3">
            {errorMsg && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-200">
                {errorMsg}
              </div>
            )}
            {statusMsg && (
              <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'camp_form' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Existing Camps Picker */}
              <div className="lg:col-span-5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase">
                    {lang === 'ru' ? 'Существующие городки' : 'Kayıtlı Kamplar'} ({payload.camps.length})
                  </h4>
                  <button
                    type="button"
                    onClick={resetCampFormForNew}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60 text-[11px] font-bold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    {lang === 'ru' ? 'Новый городок' : 'Yeni Kamp Formu'}
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                  {payload.camps.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => loadCampIntoForm(c)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                        editingCampId === c.id
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500'
                          : 'bg-slate-50/80 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {c.campCode}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          {c.totalOccupants}/{c.totalCapacity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {c.region} • {c.projectName}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Camp Editor Form */}
              <div className="lg:col-span-7 bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {editingCampId > 0
                      ? lang === 'ru'
                        ? 'Редактирование городка'
                        : 'Kamp Bilgilerini Düzenle'
                      : lang === 'ru'
                        ? 'Создать новый городок / общежитие'
                        : 'Yeni Kamp / Lojman Tanımla'}
                  </h4>
                  {editingCampId > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      ID #{editingCampId}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {lang === 'ru' ? 'Регион' : 'Bölge (Region)'} *
                    </label>
                    <input
                      list="camp-regions-list"
                      value={formRegion}
                      onChange={(e) => setFormRegion(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="Örn: Svobodny-AGHK, Kazan..."
                    />
                    <datalist id="camp-regions-list">
                      {regionOptions.map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {lang === 'ru' ? 'Объект / Проект' : 'Şantiye / Proje Adı'} *
                    </label>
                    <input
                      list="camp-projects-list"
                      value={formProject}
                      onChange={(e) => setFormProject(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="Örn: NHNK mPE-300, DGP-02..."
                    />
                    <datalist id="camp-projects-list">
                      {projectOptions.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {lang === 'ru' ? 'Номер / Код городка' : 'Kamp No / Kodu'} *
                    </label>
                    <input
                      type="text"
                      value={formCampCode}
                      onChange={(e) => setFormCampCode(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="Örn: 2.4-A-B2, 64B, B16"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {lang === 'ru' ? 'Название корпуса' : 'Kamp / Blok Adı'}
                    </label>
                    <input
                      type="text"
                      value={formCampName}
                      onChange={(e) => setFormCampName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      placeholder="Örn: Blok B2 Modüler Kamp"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {lang === 'ru' ? 'Тип общежития' : 'Kamp Tipi'}
                    </label>
                    <select
                      value={formCampType}
                      onChange={(e) => setFormCampType(e.target.value as CampType)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="modular">Modüler Konteyner Kamp</option>
                      <option value="dormitory">İşçi Yurdu / Koğuş Binası</option>
                      <option value="staff">Staff / Mühendis Lojmanı</option>
                      <option value="apartment">Apart / Kiralık Daire</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {lang === 'ru' ? 'Коек в комнате по умолч.' : 'Varsayılan Oda Kapasitesi (Yatak)'}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={formDefaultCap}
                      onChange={(e) => setFormDefaultCap(Math.max(1, Number(e.target.value) || 4))}
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {editingCampId === 0 && (
                  <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 space-y-2">
                    <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                      {lang === 'ru'
                        ? 'Автоматически создать диапазон пустых комнат (опционально):'
                        : 'Oluştururken Başlangıç Boş Oda Aralığı Ekle (Opsiyonel):'}
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        type="number"
                        value={formInitStart}
                        onChange={(e) => setFormInitStart(e.target.value)}
                        placeholder="Başlangıç Oda No (örn: 101)"
                        className="px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-emerald-200 dark:border-slate-700"
                      />
                      <input
                        type="number"
                        value={formInitEnd}
                        onChange={(e) => setFormInitEnd(e.target.value)}
                        placeholder="Bitiş Oda No (örn: 120)"
                        className="px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-emerald-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {lang === 'ru' ? 'Примечание' : 'Notlar'}
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    placeholder="Örn: Kaynakçılar ve montaj ekipleri için ayrıldı"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  {editingCampId > 0 ? (
                    confirmDeleteCampId === editingCampId ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() =>
                            callCampApi({ action: 'delete_camp', campId: editingCampId }).then(() =>
                              resetCampFormForNew()
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                        >
                          Evet, Kampı Kalıcı Sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCampId(null)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-semibold cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCampId(editingCampId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Kampı Sil</span>
                      </button>
                    )
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    disabled={submitting || !formRegion.trim() || !formCampCode.trim()}
                    onClick={() =>
                      callCampApi({
                        action: 'upsert_camp',
                        id: editingCampId || undefined,
                        region: formRegion,
                        projectName: formProject || formRegion,
                        campCode: formCampCode,
                        campName: formCampName || formCampCode,
                        campType: formCampType,
                        defaultRoomCapacity: formDefaultCap,
                        notes: formNotes,
                        initialRoomStart: formInitStart,
                        initialRoomEnd: formInitEnd,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{editingCampId > 0 ? 'Değişiklikleri Kaydet' : 'Kampı Oluştur'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rooms_add' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {lang === 'ru' ? 'Целевой городок' : 'Hedef Kamp Seçin'}
                  </label>
                  <select
                    value={selectedTargetCamp?.id || 0}
                    onChange={(e) => setTargetCampId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    {payload.camps.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.region} / {c.projectName} — {c.campCode} ({c.totalRooms} Oda)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full">
                    <button
                      type="button"
                      onClick={() => setRoomAddMode('range')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                        roomAddMode === 'range'
                          ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {lang === 'ru' ? 'Диапазон номеров (напр. 201–220)' : 'Toplu Sıralı Oda Aralığı'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomAddMode('single')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                        roomAddMode === 'single'
                          ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {lang === 'ru' ? 'Одна комната' : 'Tek Oda Ekle'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {roomAddMode === 'range' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Başlangıç Oda No *
                      </label>
                      <input
                        type="number"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Bitiş Oda No *
                      </label>
                      <input
                        type="number"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        Ön Ek (Opsiyonel)
                      </label>
                      <input
                        type="text"
                        value={rangePrefix}
                        onChange={(e) => setRangePrefix(e.target.value)}
                        placeholder="Örn: A- veya boş bırakın"
                        className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Oda Numarası *
                    </label>
                    <input
                      type="text"
                      value={singleRoomNo}
                      onChange={(e) => setSingleRoomNo(e.target.value)}
                      placeholder="Örn: 204, 305A, 1-12"
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Oda Başına Yatak Kapasitesi
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={roomCap}
                    onChange={(e) => setRoomCap(Math.max(1, Number(e.target.value) || 4))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Kat Numarası
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roomFloorAuto}
                        onChange={(e) => setRoomFloorAuto(e.target.checked)}
                      />
                      Otomatik
                    </label>
                    {!roomFloorAuto && (
                      <input
                        type="number"
                        min={1}
                        max={9}
                        value={roomFloorFixed}
                        onChange={(e) => setRoomFloorFixed(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Durum / Oda Tipi
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={roomType}
                      onChange={(e) => setRoomType(e.target.value as RoomType)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="worker">İşçi Odası</option>
                      <option value="staff">Staff / Müh.</option>
                      <option value="manager">Yönetici</option>
                    </select>
                    <select
                      value={roomStatus}
                      onChange={(e) => setRoomStatus(e.target.value as RoomOperationalStatus)}
                      className="px-2 py-1.5 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="active">Aktif</option>
                      <option value="reserved">Rezerve</option>
                      <option value="maintenance">Bakımda</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <BedDouble className="w-4 h-4 text-emerald-600" />
                  <span>
                    Eklenecek / Güncellenecek:{' '}
                    <strong className="text-emerald-700 dark:text-emerald-300">
                      {rangePreviewCount} oda × {roomCap} yatak = {rangePreviewCount * roomCap} yatak
                    </strong>
                  </span>
                </div>

                <button
                  type="button"
                  disabled={submitting || !selectedTargetCamp}
                  onClick={() =>
                    selectedTargetCamp &&
                    callCampApi({
                      action: 'add_rooms',
                      campId: selectedTargetCamp.id,
                      roomNo: roomAddMode === 'single' ? singleRoomNo : undefined,
                      startNo: roomAddMode === 'range' ? Number(rangeStart) : undefined,
                      endNo: roomAddMode === 'range' ? Number(rangeEnd) : undefined,
                      prefix: roomAddMode === 'range' ? rangePrefix : undefined,
                      floorNo: roomFloorAuto ? undefined : roomFloorFixed,
                      capacity: roomCap,
                      roomType,
                      status: roomStatus,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Odaları Kaydet</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'rooms_inventory' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  value={selectedTargetCamp?.id || 0}
                  onChange={(e) => setTargetCampId(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 min-w-[260px]"
                >
                  {payload.camps.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.region} / {c.projectName} — {c.campCode} ({c.totalRooms} Oda)
                    </option>
                  ))}
                </select>

                {selectedTargetCamp && selectedTargetCamp.inferredRooms > 0 && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      callCampApi({ action: 'confirm_inferred', campId: selectedTargetCamp.id })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      Tüm Tahmini Boş Odaları Onayla ({selectedTargetCamp.inferredRooms})
                    </span>
                  </button>
                )}
              </div>

              {selectedTargetCamp && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 font-bold">Oda No</th>
                          <th className="px-3 py-2 font-bold">Kat</th>
                          <th className="px-3 py-2 font-bold">Doluluk</th>
                          <th className="px-3 py-2 font-bold">Yatak Kapasitesi</th>
                          <th className="px-3 py-2 font-bold">Durum</th>
                          <th className="px-3 py-2 font-bold text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedTargetCamp.rooms.map((rm) => (
                          <tr key={rm.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="px-3 py-2 font-extrabold text-slate-900 dark:text-white">
                              {rm.roomNo}
                              {rm.isInferredEmpty && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
                                  Tahmin
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-500">Kat {rm.floorNo}</td>
                            <td className="px-3 py-2">
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                {rm.activeCount}M
                              </span>
                              {rm.standbyCount > 0 && (
                                <span className="ml-1 font-bold text-amber-600">
                                  +{rm.standbyCount}B
                                </span>
                              )}
                              <span className="ml-1 text-slate-400">/ {rm.capacity}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={submitting || rm.capacity <= 1}
                                  onClick={() =>
                                    callCampApi({
                                      action: 'update_room',
                                      roomId: rm.id,
                                      capacity: Math.max(1, rm.capacity - 1),
                                    })
                                  }
                                  className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center cursor-pointer disabled:opacity-40"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-6 text-center font-bold">{rm.capacity}</span>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() =>
                                    callCampApi({
                                      action: 'update_room',
                                      roomId: rm.id,
                                      capacity: rm.capacity + 1,
                                    })
                                  }
                                  className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={rm.status}
                                disabled={submitting}
                                onChange={(e) =>
                                  callCampApi({
                                    action: 'update_room',
                                    roomId: rm.id,
                                    status: e.target.value,
                                  })
                                }
                                className="px-2 py-1 text-[11px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                              >
                                <option value="active">Aktif</option>
                                <option value="reserved">Rezerve</option>
                                <option value="maintenance">Bakımda</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                disabled={submitting || rm.totalOccupants > 0}
                                title={
                                  rm.totalOccupants > 0
                                    ? 'İçinde personel varken oda silinemez'
                                    : 'Odayı sil'
                                }
                                onClick={() => callCampApi({ action: 'delete_room', roomId: rm.id })}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assign_person' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Hedef Kamp
                  </label>
                  <select
                    value={selectedAssignCamp?.id || 0}
                    onChange={(e) => setAssignCampId(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                  >
                    {payload.camps.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.projectName} — {c.campCode} (+{c.availableBeds} Boş)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Hedef Oda No
                  </label>
                  <select
                    value={assignRoomNo}
                    onChange={(e) => setAssignRoomNo(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="">-- Oda seçin (veya sadece kamp) --</option>
                    {(selectedAssignCamp?.rooms || []).map((rm) => (
                      <option key={rm.id} value={rm.roomNo}>
                        Oda {rm.roomNo} (Kat {rm.floorNo} • {rm.totalOccupants}/{rm.capacity} Dolu)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={personSearch}
                    onChange={(e) => setPersonSearch(e.target.value)}
                    placeholder="Personel ara (Ad, Sicil, Görev, Şantiye)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      { id: 'unassigned', label: 'Kamp Kaydı Olmayanlar' },
                      { id: 'camp_no_room', label: 'Kampta Oda Bekleyenler' },
                      { id: 'all', label: 'Tümü' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPersonPoolFilter(opt.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        personPoolFilter === opt.id
                          ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800">
                {personPool.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Kriterlere uygun personel bulunamadı.
                  </div>
                ) : (
                  personPool.map((p) => (
                    <div
                      key={p.sicilNo}
                      className="px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {p.adSoyad}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">{p.sicilNo}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              p.statusCategory === 'standby'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                            }`}
                          >
                            {p.statusCategory === 'standby' ? p.guncelDurum || p.genelDurum : 'Mevcut'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {p.gorevi} • {p.uyruk} • {p.projectName}
                          {p.campCode && (
                            <span className="ml-1 text-indigo-600 dark:text-indigo-400 font-semibold">
                              (Şu an: {p.campCode} / {p.roomNo || 'Oda Yok'})
                            </span>
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={submitting || !selectedAssignCamp}
                        onClick={() =>
                          selectedAssignCamp &&
                          callCampApi({
                            action: 'assign_personnel',
                            sicilNo: p.sicilNo,
                            campId: selectedAssignCamp.id,
                            roomNo: assignRoomNo,
                          })
                        }
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>{assignRoomNo ? `Oda ${assignRoomNo}` : 'Kampa Ata'}</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
