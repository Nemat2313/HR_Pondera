'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  LayoutDashboard,
  TrendingUp,
  PieChart,
  FileCheck2,
  Scale,
  Users,
  GitFork,
  Mail,
  Briefcase,
  Bot,
  Activity,
  Building2,
  Building,
  Plane,
  Settings,
  Sparkles,
  HeartPulse,
  Gauge,
  ShieldAlert,
  PlaneLanding,
  SunMoon,
  Grid3X3,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { ProposalTabId } from '@/components/reports/ReportProposalsView';

interface CommandItem {
  id: string;
  titleTr: string;
  titleRu: string;
  subtitleTr: string;
  subtitleRu: string;
  keywords: string;
  group: 'nav' | 'proposals';
  icon: React.ComponentType<{ className?: string }>;
  tabId: string;
  proposalTab?: ProposalTabId;
}

const COMMAND_ITEMS: CommandItem[] = [
  {
    id: 'nav-overview',
    titleTr: 'Genel Dashboard',
    titleRu: 'Главная панель',
    subtitleTr: 'Ana KPI özeti, piramit, Venn ve grafikler',
    subtitleRu: 'Основные KPI, пирамида и графики',
    keywords: 'ana sayfa overview dashboard kpi ozet',
    group: 'nav',
    icon: LayoutDashboard,
    tabId: 'overview',
  },
  {
    id: 'nav-proposals',
    titleTr: 'Yeni Rapor Teklifleri (7 Sekme)',
    titleRu: 'Предложения новых отчетов (7 вкладок)',
    subtitleTr: '198 eBA kolonu & 1C ZUP NDFL yeni analitik vitrini',
    subtitleRu: 'Новые отчеты по 198 колонкам eBA и 1С ЗУП',
    keywords: 'yeni rapor teklif proposal zahid ndfl vergi saglik sla',
    group: 'proposals',
    icon: Sparkles,
    tabId: 'report_proposals',
    proposalTab: 'health',
  },
  {
    id: 'prop-ndfl',
    titleTr: '1C ZUP Vergi (NDFL %13 vs %30) & 183 Gün Analizi',
    titleRu: 'Анализ НДФЛ (13% vs 30%) и правило 183 дней',
    subtitleTr: 'Zahid Bey: Vizeli / Patentli / EAES yıllık vergi avantajı',
    subtitleRu: 'Сравнение визовых, патентных и ЕАЭС по годам',
    keywords: 'ndfl vergi 183 gun rezident nerezident vizeli patent eaes zahid zup',
    group: 'proposals',
    icon: Scale,
    tabId: 'report_proposals',
    proposalTab: 'ndfl',
  },
  {
    id: 'prop-health',
    titleTr: 'Sağlık 29n, İSG (HSE) & DMS Sigorta Analitiği',
    titleRu: 'Здоровье 29н, ОТ/ТБ и полисы ДМС',
    subtitleTr: 'Şantiye sağlık uyumu, sigorta şirketleri ve bitiş takvimi',
    subtitleRu: 'Охват ДМС, медосмотры и сроки полисов',
    keywords: 'saglik 29n dms sigorta hse isg narkoloji asi',
    group: 'proposals',
    icon: HeartPulse,
    tabId: 'report_proposals',
    proposalTab: 'health',
  },
  {
    id: 'prop-sla',
    titleTr: 'Mobilizasyon & Evrak Süreç Hızı (SLA)',
    titleRu: 'Скорость оформления документов (SLA)',
    subtitleTr: 'Patent, Propusk, FSB, Registrasyon ortalama bekleme süreleri',
    subtitleRu: 'Средние сроки ожидания патента, пропуска и регистрации',
    keywords: 'sla surec hiz darboğaz patent propusk fsb tercume',
    group: 'proposals',
    icon: Gauge,
    tabId: 'report_proposals',
    proposalTab: 'sla',
  },
  {
    id: 'prop-legal',
    titleTr: 'Yasal Bölge & Sibur KPP Risk Radarı',
    titleRu: 'Радар рисков регионов патента и КПП Сибур',
    subtitleTr: 'Farklı bölge izniyle çalışan riskli personel & KPP dağılımı',
    subtitleRu: 'Несоответствие региона работы и пропуска КПП',
    keywords: 'yasal risk bolge kpp sibur uyusmazlik propusk',
    group: 'proposals',
    icon: ShieldAlert,
    tabId: 'report_proposals',
    proposalTab: 'legal',
  },
  {
    id: 'prop-mobility',
    titleTr: 'Sınır Kapısı, Migrasyon & Transfer Hareketliliği',
    titleRu: 'Границы, миграция и переводы между объектами',
    subtitleTr: 'Havalimanı giriş yoğunluğu, aylık trend ve şantiye transferleri',
    subtitleRu: 'Аэропорты въезда, тренды и переводы',
    keywords: 'sinir kapisi havalimani migrasyon transfer izin konum',
    group: 'proposals',
    icon: PlaneLanding,
    tabId: 'report_proposals',
    proposalTab: 'mobility',
  },
  {
    id: 'prop-shift',
    titleTr: 'Vardiya (Gündüz/Gece) & Yönetim Oranı',
    titleRu: 'Смены (День/Ночь) и норма управляемости',
    subtitleTr: 'Direkt/Endirekt oranı ve Grup Şefi ekip büyüklükleri',
    subtitleRu: 'Баланс смен и соотношение прямого/косвенного персонала',
    keywords: 'vardiya gunduz gece direkt endirekt grup sefi span',
    group: 'proposals',
    icon: SunMoon,
    tabId: 'report_proposals',
    proposalTab: 'shift',
  },
  {
    id: 'prop-quality',
    titleTr: 'eBA Veri Kalitesi & Eksik Kolon Isı Haritası',
    titleRu: 'Тепловая карта качества данных eBA',
    subtitleTr: 'Şantiyeler bazında 10 kritik kolon doluluk skoru',
    subtitleRu: 'Полнота заполнения ключевых полей по объектам',
    keywords: 'veri kalitesi heatmap isi haritasi eksik kolon eba',
    group: 'proposals',
    icon: Grid3X3,
    tabId: 'report_proposals',
    proposalTab: 'quality',
  },
  {
    id: 'nav-official',
    titleTr: 'Resmi & Real Karşılaştırma (1C ZUP)',
    titleRu: 'Сверка: Официал vs Факт (1С ЗУП)',
    subtitleTr: '1C ZUP bordro ile eBA saha kadrosu mutabakatı',
    subtitleRu: 'Сверка списков 1С ЗУП и eBA Real',
    keywords: '1c zup resmi real mutabakat karsilastirma',
    group: 'nav',
    icon: Scale,
    tabId: 'official_real',
  },
  {
    id: 'nav-personnel',
    titleTr: 'Personel Listesi (198 Kolon)',
    titleRu: 'Список персонала (198 колонок)',
    subtitleTr: 'Tüm çalışanlar, kart detayları ve Excel dışa aktarım',
    subtitleRu: 'Полная база сотрудников и экспорт Excel',
    keywords: 'personel liste calisan kart excel',
    group: 'nav',
    icon: Users,
    tabId: 'personnel',
  },
  {
    id: 'nav-camp',
    titleTr: 'Kamp & Lojman Takibi (3D)',
    titleRu: 'Общежития и Коечный фонд (3D)',
    subtitleTr: '3D kampüs maketi, kat planı, boş yatak ve İdari İşler paneli',
    subtitleRu: '3D макет городков, комнаты и свободные койки',
    keywords: 'kamp lojman 3d oda yatak idari isler',
    group: 'nav',
    icon: Building,
    tabId: 'camp_management',
  },
  {
    id: 'nav-org',
    titleTr: 'Organizasyon Şeması (L1–L8)',
    titleRu: 'Оргструктура (L1–L8)',
    subtitleTr: 'İnteraktif hiyerarşi ağacı, PDF/PNG ve Excel çıktı',
    subtitleRu: 'Интерактивное дерево иерархии и экспорт',
    keywords: 'organizasyon sema hiyerarsi org chart',
    group: 'nav',
    icon: GitFork,
    tabId: 'org_chart',
  },
  {
    id: 'nav-compliance',
    titleTr: 'Evrak & Süre Analitiği',
    titleRu: 'Аналитика документов и сроков',
    subtitleTr: 'Süresi yaklaşan belgeler, bekleyenler ve tarama kontrolü',
    subtitleRu: 'Сроки документов, ожидания и контроль сканов',
    keywords: 'evrak sure compliance pasaport vize patent tarama',
    group: 'nav',
    icon: FileCheck2,
    tabId: 'compliance',
  },
  {
    id: 'nav-turnover',
    titleTr: 'Yönetim & Turnover',
    titleRu: 'Текучесть и Управление',
    subtitleTr: 'Aylık devir hızı, işe giriş/çıkış ve yönetim raporları',
    subtitleRu: 'Текучесть кадров, прием и увольнение',
    keywords: 'turnover yonetim devir cikis rapor',
    group: 'nav',
    icon: TrendingUp,
    tabId: 'turnover',
  },
  {
    id: 'nav-demographics',
    titleTr: 'Demografi & İstatistik (Harita)',
    titleRu: 'Демография и Статистика (Карта)',
    subtitleTr: 'Dünya haritası, yaş/cinsiyet ve canlı İSG özeti',
    subtitleRu: 'Карта мира, демография и сводка ОТ/ТБ',
    keywords: 'demografi harita uyruk cinsiyet yas',
    group: 'nav',
    icon: PieChart,
    tabId: 'demographics',
  },
  {
    id: 'nav-invitations',
    titleTr: 'Davetiye Takip (MVD)',
    titleRu: 'Учет приглашений (МВД)',
    subtitleTr: 'MVD davetiye başvuruları ve PDF takip',
    subtitleRu: 'Заявки на приглашения и PDF',
    keywords: 'davetiye mvd invitation vize',
    group: 'nav',
    icon: Mail,
    tabId: 'invitations',
  },
  {
    id: 'nav-quotas',
    titleTr: 'Çalışma Kotaları Takip',
    titleRu: 'Квоты на работу (РНР)',
    subtitleTr: 'İRS kota dağılımı ve kullanım takibi',
    subtitleRu: 'Контроль и распределение квот',
    keywords: 'kota rnr irs quota',
    group: 'nav',
    icon: Briefcase,
    tabId: 'quotas',
  },
  {
    id: 'nav-gosuslugi',
    titleTr: 'Gosuslugi Robotu (RPA)',
    titleRu: 'Робот Госуслуги (RPA)',
    subtitleTr: 'VKS çeyrek bildirimleri ve işten çıkış otomasyonu',
    subtitleRu: 'Автоматизация уведомлений ВКС и увольнений',
    keywords: 'gosuslugi rpa robot vks bildirim',
    group: 'nav',
    icon: Bot,
    tabId: 'gosuslugi',
  },
  {
    id: 'nav-vks-stats',
    titleTr: 'VKS İstatistik & Analiz',
    titleRu: 'ВКС Статистика',
    subtitleTr: 'VKS çeyrek bazlı performans ve dağılım',
    subtitleRu: 'Аналитика и квартальные показатели ВКС',
    keywords: 'vks istatistik analiz',
    group: 'nav',
    icon: Activity,
    tabId: 'gosuslugi_analytics',
  },
  {
    id: 'nav-sites',
    titleTr: 'Şantiye & Projeler',
    titleRu: 'Участки и Проекты',
    subtitleTr: '11 aktif saha kadro özeti ve bölge detayları',
    subtitleRu: 'Сводка по 11 активным объектам',
    keywords: 'santiye proje bolge site',
    group: 'nav',
    icon: Building2,
    tabId: 'sites',
  },
  {
    id: 'nav-tickets',
    titleTr: 'İdari İşler & AI Bilet',
    titleRu: 'АХО и AI Билеты',
    subtitleTr: 'AI OCR uçak bileti tarama ve havalimanı karşılama panosu',
    subtitleRu: 'AI OCR авиабилетов и табло встречи',
    keywords: 'bilet ucak travel ticket idari isler ocr',
    group: 'nav',
    icon: Plane,
    tabId: 'travel_tickets',
  },
  {
    id: 'nav-settings',
    titleTr: 'Ayarlar & Yönetim (RLS / DB / AI)',
    titleRu: 'Настройки системы',
    subtitleTr: 'Kullanıcılar, Excel yedekleri, e-posta ve AI ayarları',
    subtitleRu: 'Пользователи, БД, почта и настройки AI',
    keywords: 'ayar settings rls kullanici veritabani ai',
    group: 'nav',
    icon: Settings,
    tabId: 'settings',
  },
];

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tabId: string, proposalTab?: ProposalTabId) => void;
  onSearchPersonnel: (query: string) => void;
  isIdariOnly?: boolean;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  onSelectTab,
  onSearchPersonnel,
  isIdariOnly = false,
}: CommandPaletteModalProps) {
  const { lang } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const base = isIdariOnly
      ? COMMAND_ITEMS.filter(
          (i) => i.tabId === 'travel_tickets' || i.tabId === 'camp_management'
        )
      : COMMAND_ITEMS;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.titleTr.toLowerCase().includes(q) ||
        item.titleRu.toLowerCase().includes(q) ||
        item.subtitleTr.toLowerCase().includes(q) ||
        item.keywords.includes(q)
    );
  }, [query, isIdariOnly]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(Math.max(0, filteredItems.length - 1), prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredItems[activeIndex];
      if (target) {
        onSelectTab(target.tabId, target.proposalTab);
        onClose();
      } else if (query.trim() && !isIdariOnly) {
        onSearchPersonnel(query.trim());
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-xs flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-gradient-to-r from-emerald-50/80 via-white to-white dark:from-emerald-950/40 dark:via-[#0F172A] dark:to-[#0F172A]">
          <Search className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === 'ru'
                ? 'Быстрый переход по модулям, отчетам или поиск сотрудника...'
                : 'Modül, yeni rapor sekmesi veya personel ara... (Örn: NDFL, 3D Kamp, SLA)'
            }
            className="flex-1 bg-transparent text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto p-2 space-y-1">
          {filteredItems.map((item, idx) => {
            const Icon = item.icon;
            const isSelected = idx === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => {
                  onSelectTab(item.tabId, item.proposalTab);
                  onClose();
                }}
                className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300/70 dark:border-emerald-700/60'
                    : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      item.group === 'proposals'
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {lang === 'ru' ? item.titleRu : item.titleTr}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {lang === 'ru' ? item.subtitleRu : item.subtitleTr}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            );
          })}

          {query.trim() && !isIdariOnly && (
            <button
              type="button"
              onClick={() => {
                onSearchPersonnel(query.trim());
                onClose();
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-emerald-400/70 flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer"
            >
              <span>
                &quot;{query.trim()}&quot; için Personel Listesinde Ara
              </span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-500">
          <span>↑↓ Gezin • Enter Aç • Esc Kapat</span>
          <span className="font-mono font-bold">Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
