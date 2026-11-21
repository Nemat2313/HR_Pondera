'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Award, ChevronRight, FileSpreadsheet, Crown, ChevronDown, Network, ArrowUpRight, Loader2, Users } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

interface PreviewPerson {
  id?: number;
  sicil_no?: string;
  full_name?: string;
  ad_soyad?: string;
  job_title?: string;
  pozisyon?: string;
  project_name?: string;
  proje?: string;
}

interface PowerBITitlePyramidProps {
  pyramidData: { title: string; count: number }[];
  totalCount: number;
  selectedTitle?: string;
  onSelectTitle?: (title: string) => void;
  onOpenDetail?: (title: string) => void;
  onNavigateToPersonnel?: (filterType?: string, filterValue?: string) => void;
  onNavigateToOrgChart?: () => void;
}

const RU_LEVEL_TITLES: Record<number, string> = {
  1: 'Председатель правления',
  2: 'CEO / COO и Ген. директор',
  3: 'Директора и координаторы',
  4: 'Директора проектов и отделов',
  5: 'Начальники групп и участков',
  6: 'Инженеры, специалисты и служащие',
  7: 'Формены и ответственные',
  8: 'Бригадиры, мастера и рабочие',
};

export default function PowerBITitlePyramid({
  pyramidData,
  totalCount,
  selectedTitle,
  onSelectTitle,
  onOpenDetail,
  onNavigateToPersonnel,
  onNavigateToOrgChart,
}: PowerBITitlePyramidProps) {
  // 8-tier progressive funnel geometry from Apex (L1) to Base (L8)
  const tierWidths = [
    'w-[92%] sm:w-[44%]', // L1 Başkan
    'w-[93%] sm:w-[52%]', // L2 CEO / Genel Müdür
    'w-[94%] sm:w-[60%]', // L3 Direktör
    'w-[95%] sm:w-[68%]', // L4 Müdür & Şantiye Şefi
    'w-[96%] sm:w-[76%]', // L5 Grup & Kısım Şefi
    'w-[98%] sm:w-[84%]', // L6 Mühendis & Uzman
    'w-[99%] sm:w-[92%]', // L7 Formen & Sorumlu
    'w-full',             // L8 Saha Ekip & İşçi
  ];

  const tierAccents = [
    {
      badge: 'L1',
      bg: 'from-amber-500/20 to-yellow-500/15',
      border: 'border-amber-400/60 dark:border-amber-400/40',
      text: 'text-amber-800 dark:text-amber-300',
    },
    {
      badge: 'L2',
      bg: 'from-purple-500/20 to-fuchsia-500/15',
      border: 'border-purple-400/60 dark:border-purple-400/40',
      text: 'text-purple-800 dark:text-purple-300',
    },
    {
      badge: 'L3',
      bg: 'from-indigo-500/20 to-violet-500/15',
      border: 'border-indigo-400/60 dark:border-indigo-400/40',
      text: 'text-indigo-800 dark:text-indigo-300',
    },
    {
      badge: 'L4',
      bg: 'from-blue-500/20 to-sky-500/15',
      border: 'border-blue-400/60 dark:border-blue-400/40',
      text: 'text-blue-800 dark:text-blue-300',
    },
    {
      badge: 'L5',
      bg: 'from-emerald-500/20 to-teal-500/15',
      border: 'border-emerald-400/60 dark:border-emerald-400/40',
      text: 'text-emerald-800 dark:text-emerald-300',
    },
    {
      badge: 'L6',
      bg: 'from-sky-500/20 to-cyan-500/15',
      border: 'border-sky-400/60 dark:border-sky-400/40',
      text: 'text-sky-800 dark:text-sky-300',
    },
    {
      badge: 'L7',
      bg: 'from-orange-500/20 to-amber-500/15',
      border: 'border-orange-400/60 dark:border-orange-400/40',
      text: 'text-orange-800 dark:text-orange-300',
    },
    {
      badge: 'L8',
      bg: 'from-teal-500/20 to-emerald-600/20',
      border: 'border-teal-500/50 dark:border-teal-500/35',
      text: 'text-teal-800 dark:text-teal-300',
    },
  ];

  const { lang, t } = useLanguage();
  const { user, getAuthHeaders } = useAuth();
  const [hoveredLevel, setHoveredLevel] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<
    Record<string, { loading: boolean; items: PreviewPerson[] }>
  >({});
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreviewCache({});
    setHoveredLevel(null);
  }, [user?.id, user?.scope_type, user?.scope_value]);

  const openLevelHover = (levelKey: string, tierCount?: number) => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setHoveredLevel(levelKey);
    if (tierCount === 0) {
      setPreviewCache((prev) => ({ ...prev, [levelKey]: { loading: false, items: [] } }));
      return;
    }
    if (!previewCache[levelKey]) {
      setPreviewCache((prev) => ({ ...prev, [levelKey]: { loading: true, items: [] } }));
      fetch(`/api/personnel?title=${encodeURIComponent(levelKey)}&limit=8&includeExits=false`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const rows: PreviewPerson[] = Array.isArray(json?.data)
            ? json.data.slice(0, 8)
            : Array.isArray(json?.personnel)
            ? json.personnel.slice(0, 8)
            : [];
          setPreviewCache((prev) => ({ ...prev, [levelKey]: { loading: false, items: rows } }));
        })
        .catch(() => {
          setPreviewCache((prev) => ({ ...prev, [levelKey]: { loading: false, items: [] } }));
        });
    }
  };

  const scheduleCloseHover = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => {
      setHoveredLevel(null);
    }, 180);
  };

  const formatDisplayTitle = (rawTitle: string, idx: number) => {
    const clean = rawTitle.replace(/^\d+\.\s*/, '');
    if (lang === 'ru') {
      const ruDesc = RU_LEVEL_TITLES[idx + 1];
      return ruDesc ? `L${idx + 1} • ${ruDesc}` : clean;
    }
    return clean;
  };

  return (
    <div className={`p-5 lg:p-6 bg-white dark:bg-[#131F38]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-teal-500/30 text-slate-900 dark:text-white shadow-sm dark:shadow-2xl relative flex flex-col justify-between transition-colors ${hoveredLevel ? 'z-50' : 'z-10'}`}>
      <div className="hidden dark:block absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-6 lg:-mt-6 px-5 py-3.5 lg:px-6 lg:py-4 mb-3 rounded-t-2xl bg-gradient-to-r from-emerald-100/85 via-emerald-50/45 to-white dark:from-emerald-950/55 dark:via-[#14233E] dark:to-[#131F38] flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 dark:border-slate-800 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-teal-500/20 text-emerald-600 dark:text-teal-400 border border-emerald-200 dark:border-teal-500/30">
              <Award className="w-4 h-4" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              {t('funnel_title')}
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t('funnel_sub')}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {onNavigateToOrgChart && (
            <button
              type="button"
              onClick={onNavigateToOrgChart}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-800 dark:text-indigo-200 text-[11px] font-bold border border-indigo-200 dark:border-indigo-500/35 transition-all cursor-pointer"
              title={lang === 'ru' ? 'Открыть организационную структуру' : 'Organizasyon Şeması Sayfasını Aç'}
            >
              <Network className="w-3 h-3 text-indigo-600 dark:text-indigo-300" />
              <span>{lang === 'ru' ? 'Орг. схема' : 'Org. Şeması Aç'}</span>
            </button>
          )}
          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail(selectedTitle || 'all')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 text-emerald-700 dark:text-teal-300 text-[11px] font-bold border border-emerald-200 dark:border-teal-500/30 transition-all cursor-pointer"
              title={lang === 'ru' ? 'Смотреть список должностей' : 'Ünvan Kademesi Personel Listesini Gör'}
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-teal-400" />
              <span>{t('btn_see_detail')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Apex Indicator Tag */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 font-extrabold uppercase tracking-wider mb-2">
        <Crown className="w-3.5 h-3.5" />
        <span>{t('funnel_peak')}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </div>

      {/* 8-Tiered Pyramid / Funnel Visual Representation */}
      <div className="space-y-1.5 relative z-10 my-1 flex flex-col items-center w-full">
        {pyramidData.map((item, idx) => {
          const pyramidTotal =
            pyramidData.reduce((sum, row) => sum + (row.count || 0), 0) || totalCount;
          const totalPct = pyramidTotal > 0 ? ((item.count / pyramidTotal) * 100).toFixed(1) : '0';
          const cleanTitle = item.title.replace(/^\d+\.\s*/, '');
          const isSelected =
            selectedTitle &&
            selectedTitle !== 'all' &&
            cleanTitle.toLowerCase() === selectedTitle.toLowerCase();
          const isDimmed = selectedTitle && selectedTitle !== 'all' && !isSelected;
          const tierStyle = tierAccents[idx % tierAccents.length];
          const tierWidth = tierWidths[idx] || 'w-full';
          const displayLabel = formatDisplayTitle(item.title, idx).replace(/^L\d+\s*•\s*/i, '');
          const levelKey = `L${idx + 1}`;
          const isHovered = hoveredLevel === levelKey;
          const hoverData = previewCache[levelKey];

          return (
            <div
              key={idx}
              onMouseEnter={() => openLevelHover(levelKey, item.count)}
              onMouseLeave={scheduleCloseHover}
              onClick={() => onSelectTitle && onSelectTitle(item.title)}
              className={`relative transition-all duration-300 cursor-pointer ${tierWidth} ${
                isDimmed ? 'opacity-35 hover:opacity-75' : 'opacity-100'
              } ${isHovered ? 'z-30' : 'z-10'}`}
            >
              <div
                className={`px-2.5 py-2 rounded-xl border bg-gradient-to-r ${tierStyle.bg} ${tierStyle.border} ${
                  isSelected
                    ? 'ring-2 ring-emerald-400 dark:ring-teal-400 shadow-md shadow-emerald-500/25'
                    : 'hover:border-emerald-400 dark:hover:border-teal-400'
                } flex items-center justify-between gap-2 transition-all backdrop-blur-xs`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 bg-white/85 dark:bg-slate-900/85 ${tierStyle.text} border border-current/20`}
                  >
                    {tierStyle.badge}
                  </span>
                  <span className="text-xs text-slate-800 dark:text-slate-100 truncate">
                    {displayLabel}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-slate-900 dark:text-white">
                    {item.count.toLocaleString('tr-TR')}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md bg-white/75 dark:bg-slate-900/65 ${tierStyle.text}`}
                  >
                    %{totalPct}
                  </span>
                </div>
              </div>

              {/* Hover Preview Popover: Opens to the right of the pyramid, compact, no '-' line */}
              {isHovered && (
                <div
                  onMouseEnter={() => openLevelHover(levelKey, item.count)}
                  onMouseLeave={scheduleCloseHover}
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute left-1/2 -translate-x-1/2 lg:left-full lg:translate-x-0 lg:ml-3 lg:top-1/2 lg:-translate-y-1/2 ${
                    idx >= 5 ? 'bottom-full mb-1 lg:bottom-auto lg:mb-0' : 'top-full mt-1 lg:mt-0'
                  } w-64 sm:w-72 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-teal-500/40 shadow-2xl p-2 z-50 text-left`}
                >
                  <div className="flex items-center justify-between gap-1.5 pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className={`px-1 py-0.2 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 ${tierStyle.text}`}>
                        {levelKey}
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-900 dark:text-white truncate">
                        {displayLabel}
                      </span>
                    </div>
                    <span className="text-[9.5px] font-mono font-bold text-emerald-700 dark:text-teal-300 shrink-0">
                      {item.count.toLocaleString('tr-TR')} {lang === 'ru' ? 'чел.' : 'kişi'}
                    </span>
                  </div>

                  {hoverData?.loading ? (
                    <div className="py-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                      <span>{lang === 'ru' ? 'Загрузка...' : 'Yükleniyor...'}</span>
                    </div>
                  ) : hoverData?.items && hoverData.items.length > 0 ? (
                    <div className="space-y-0.5">
                      {hoverData.items.map((p, pIdx) => {
                        const proj = p.project_name || p.proje;
                        return (
                          <div
                            key={p.id || p.sicil_no || pIdx}
                            className="flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded bg-slate-50/80 dark:bg-slate-800/60 text-[10px] leading-tight"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {pIdx + 1}. {p.full_name || p.ad_soyad || ''}
                            </span>
                            {proj && proj !== '-' && (
                              <span className="text-[8.5px] px-1 py-0.2 rounded bg-emerald-50 dark:bg-teal-950/60 text-emerald-700 dark:text-teal-300 border border-emerald-200/70 dark:border-teal-700/40 shrink-0 max-w-[90px] truncate">
                                {proj}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[10px] text-slate-500 dark:text-slate-400">
                      {lang === 'ru' ? 'Нет записей' : 'Kayıt bulunamadı'}
                    </div>
                  )}

                  <div className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Users className="w-2.5 h-2.5" />
                      {lang === 'ru' ? 'Первые 8' : 'İlk 8 kişi'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setHoveredLevel(null);
                        if (onNavigateToPersonnel) {
                          onNavigateToPersonnel('title', levelKey);
                        } else if (onOpenDetail) {
                          onOpenDetail(levelKey);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[9.5px] font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <span>{lang === 'ru' ? 'Детали (Все)' : 'Detay (Tümü)'}</span>
                      <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between relative z-10 mt-2">
        <span>{t('funnel_note')}</span>
        <span className="text-emerald-600 dark:text-teal-400 flex items-center gap-1">
          <span>{t('funnel_tag')}</span>
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </div>
  );
}
