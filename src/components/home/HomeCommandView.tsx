'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
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
  ShieldCheck,
  Receipt,
  Building2,
  Sparkles,
  Settings,
  Smartphone,
  Plane,
  Building,
  Search,
  Star,
  ChevronRight,
  Cpu,
  X,
  CheckCircle2,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { StatsData } from '@/types';

interface HomeCommandViewProps {
  stats: StatsData | null;
  onNavigate: (pageId: string, subTabId?: string) => void;
  onOpenCommandPalette?: () => void;
}

interface SubTabShortcut {
  id: string;
  pageId: string;
  subTabId?: string;
  labelTr: string;
  labelRu: string;
  tooltipTr: string;
  tooltipRu: string;
  keywords: string;
  badge?: string;
  badgeTone?: 'emerald' | 'amber' | 'rose' | 'sky';
}

interface ModuleCardConfig {
  id: string;
  pageId: string;
  category: 'analytics' | 'people' | 'rpa_gov' | 'operations';
  titleTr: string;
  titleRu: string;
  descTr: string;
  descRu: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  brandLogo?: 'gosuslugi' | 'fns' | '1c' | 'eba' | 'zoho' | 'ai';
  badgeTr?: string;
  badgeRu?: string;
  adminOnly?: boolean;
  hideForViewer?: boolean;
  subTabs: SubTabShortcut[];
}

/* Official-inspired clean vector brand marks styled for our tactile UI */
function GosuslugiMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="Госуслуги">
      <rect width="40" height="40" rx="10" fill="#FFFFFF" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" stroke="#DDE3EC" strokeWidth="1.5" />
      <path d="M9 15.5C13.5 11 26.5 11 31 15.5" stroke="#0D4CD3" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M11 21.5C15 18 25 18 29 21.5" stroke="#0D4CD3" strokeWidth="2.8" strokeLinecap="round" opacity="0.88" />
      <path d="M13 27.5C16.5 24.5 23.5 24.5 27 27.5" stroke="#EE3F58" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="20" cy="11.2" r="2.1" fill="#0D4CD3" />
    </svg>
  );
}

function FnsRussiaMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="ФНС России">
      <rect width="40" height="40" rx="10" fill="#164E94" />
      <path d="M20 7L31 12.2V21.5C31 27.2 26.3 31.6 20 33.5C13.7 31.6 9 27.2 9 21.5V12.2L20 7Z" fill="#FFFFFF" fillOpacity="0.14" stroke="#E2ECFA" strokeWidth="1.5" />
      <path d="M13 20.5H27M20 12.5V28.5" stroke="#F5C451" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="20.5" r="4.2" fill="#164E94" stroke="#F5C451" strokeWidth="1.8" />
      <text x="20" y="22.4" textAnchor="middle" fill="#FFFFFF" fontSize="5.4" fontWeight="800" fontFamily="sans-serif">ФНС</text>
    </svg>
  );
}

function OneCZupMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="1C:ЗУП">
      <rect width="40" height="40" rx="10" fill="#FFD600" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" stroke="#E5B800" strokeWidth="1.5" />
      <text x="20" y="25.5" textAnchor="middle" fill="#D51D29" fontSize="16.5" fontWeight="900" fontFamily="sans-serif" letterSpacing="-0.5">1С</text>
      <rect x="7" y="29" width="26" height="2.4" rx="1.2" fill="#D51D29" />
    </svg>
  );
}

function EbaMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="eBA">
      <rect width="40" height="40" rx="10" fill="#059669" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" stroke="#047857" strokeWidth="1.5" />
      <text x="20" y="24.8" textAnchor="middle" fill="#FFFFFF" fontSize="13.5" fontWeight="800" fontFamily="sans-serif">eBA</text>
      <circle cx="31.5" cy="10" r="2.6" fill="#A7F3D0" />
    </svg>
  );
}

function ZohoMailMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="Zoho Mail">
      <rect width="40" height="40" rx="10" fill="#FFFFFF" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" stroke="#DDE3EC" strokeWidth="1.5" />
      <rect x="6" y="13" width="6.5" height="14" rx="2" fill="#E42527" />
      <rect x="13.2" y="10.5" width="6.5" height="16.5" rx="2" fill="#089949" />
      <rect x="20.4" y="13" width="6.5" height="14" rx="2" fill="#226DB4" />
      <rect x="27.6" y="11" width="6.5" height="16" rx="2" fill="#F9B21D" />
    </svg>
  );
}

function AiOcrMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="AI OCR & RPA">
      <rect width="40" height="40" rx="10" fill="#065F46" />
      <path d="M20 9L22.6 16.4L30 19L22.6 21.6L20 29L17.4 21.6L10 19L17.4 16.4L20 9Z" fill="#34D399" />
      <circle cx="29" cy="11.5" r="2" fill="#A7F3D0" />
    </svg>
  );
}

function BrandBadge({ kind, size = 'sm' }: { kind: 'gosuslugi' | 'fns' | '1c' | 'eba' | 'zoho' | 'ai'; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-9 h-9 shrink-0' : 'w-6 h-6 shrink-0';
  if (kind === 'gosuslugi') return <GosuslugiMark className={cls} />;
  if (kind === 'fns') return <FnsRussiaMark className={cls} />;
  if (kind === '1c') return <OneCZupMark className={cls} />;
  if (kind === 'eba') return <EbaMark className={cls} />;
  if (kind === 'zoho') return <ZohoMailMark className={cls} />;
  return <AiOcrMark className={cls} />;
}

const PINS_STORAGE_KEY = 'pondera_home_pinned_shortcuts_v1';

export default function HomeCommandView({
  stats,
  onNavigate,
  onOpenCommandPalette,
}: HomeCommandViewProps) {
  const { user, getAuthHeaders } = useAuth();
  const { lang } = useLanguage();
  const isRu = lang === 'ru';
  const L = (tr: string, ru: string) => (isRu ? ru : tr);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'analytics' | 'people' | 'rpa_gov' | 'operations'>('all');
  const [pinnedIds, setPinnedIds] = useState<string[]>([
    'patent_ndfl:overview',
    'gosuslugi:vks',
    'overview:main',
    'personnel:list',
  ]);
  const [patentStats, setPatentStats] = useState<{
    totalEmployees: number;
    offsetRate: number;
    noNotifCount: number;
    vozvratCount: number;
  } | null>(null);
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PINS_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) setPinnedIds(arr);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/patent-ndfl?year=2026', { headers: { ...getAuthHeaders() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.success || !d?.summary) return;
        const adv = Number(d.summary.totalAdvances || 0);
        const used = Number(d.summary.totalOffsetUsed || 0);
        setPatentStats({
          totalEmployees: Number(d.summary.totalEmployees || 0),
          offsetRate: adv > 0 ? Math.round((used / adv) * 1000) / 10 : 0,
          noNotifCount: Number(d.summary.noNotificationCount || 0),
          vozvratCount: Number(d.summary.vozvratGuaranteedCount || d.summary.vozvratCount || 0),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [getAuthHeaders]);

  const togglePin = (shortcutId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = prev.includes(shortcutId)
        ? prev.filter((x) => x !== shortcutId)
        : [shortcutId, ...prev].slice(0, 8);
      try {
        localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isViewer = user?.role === 'viewer';
  const isIdariOnly = user?.role === 'idari_isler';

  const modules: ModuleCardConfig[] = useMemo(
    () => [
      /* 1. ANALYTICS & REPORTS */
      {
        id: 'overview',
        pageId: 'overview',
        category: 'analytics',
        titleTr: 'Genel Dashboard',
        titleRu: 'Главная панель KPI',
        descTr: 'Şirket geneli anlık personel KPI, şantiye dağılımı ve çapraz filtreleme',
        descRu: 'Ключевые KPI по персоналу, объектам и кросс-фильтрация',
        icon: LayoutDashboard,
        badgeTr: 'KPI',
        badgeRu: 'KPI',
        subTabs: [
          {
            id: 'overview:main',
            pageId: 'overview',
            labelTr: 'Anlık Yönetici Özeti & Çapraz Filtreler',
            labelRu: 'Сводка руководителя и фильтры',
            tooltipTr: 'Aktif çalışan, uyruk, yaka tipi, proje ve departman bazlı Power BI tarzı etkileşimli grafikler.',
            tooltipRu: 'Интерактивные графики по штату, гражданству, категориям и объектам.',
            keywords: 'dashboard özet kpi grafik genel ana panel',
          },
        ],
      },
      {
        id: 'turnover',
        pageId: 'turnover',
        category: 'analytics',
        titleTr: 'Yönetim & Turnover',
        titleRu: 'Текучесть и Управление',
        descTr: 'Aylık işe giriş-çıkış, devir hızı (turnover) ve kıdem analizleri',
        descRu: 'Приём, увольнения, коэффициент текучести и стаж',
        icon: TrendingUp,
        badgeTr: 'Rapor',
        badgeRu: 'Отчёт',
        subTabs: [
          {
            id: 'turnover:main',
            pageId: 'turnover',
            labelTr: 'Aylık Turnover & İşe Giriş/Çıkış Raporu',
            labelRu: 'Анализ текучести и движения кадров',
            tooltipTr: 'Dönemsel işten ayrılma oranları, proje bazlı devir hızı ve kıdem kırılımları.',
            tooltipRu: 'Динамика текучести кадров по месяцам, проектам и стажу.',
            keywords: 'turnover devir çıkış giriş yönetim rapor',
          },
        ],
      },
      {
        id: 'demographics',
        pageId: 'demographics',
        category: 'analytics',
        titleTr: 'Demografi & Harita',
        titleRu: 'Демография и Карта',
        descTr: 'Rusya şantiye haritası, yaş, cinsiyet ve uyruk dağılımları',
        descRu: 'Карта объектов РФ, возраст, пол и гражданство',
        icon: PieChart,
        badgeTr: 'Harita',
        badgeRu: 'Карта',
        subTabs: [
          {
            id: 'demographics:main',
            pageId: 'demographics',
            labelTr: 'Coğrafi Dağılım, Uyruk & Yaş Analizi',
            labelRu: 'География объектов и демография',
            tooltipTr: 'Tüm şantiyelerin Rusya haritası üzerindeki canlı dağılımı ve demografik istatistikler.',
            tooltipRu: 'Интерактивная карта объектов в РФ, распределение по гражданству и возрасту.',
            keywords: 'harita demografi uyruk yaş cinsiyet bölge',
          },
        ],
      },
      {
        id: 'compliance',
        pageId: 'compliance',
        category: 'analytics',
        titleTr: 'Evrak & Süre Analitiği',
        titleRu: 'Аналитика документов',
        descTr: 'Pasaport, vize, patent, çalışma izni bitiş tarihleri ve tarama kontrolü',
        descRu: 'Сроки паспортов, виз, патентов, РНР и контроль сканов',
        icon: FileCheck2,
        badgeTr: '3 Sekme',
        badgeRu: '3 вкладки',
        subTabs: [
          {
            id: 'compliance:expiry',
            pageId: 'compliance',
            subTabId: 'expiry',
            labelTr: 'Süresi Dolacak Evraklar (30/60/90 Gün)',
            labelRu: 'Истекающие документы (30/60/90 дн.)',
            tooltipTr: 'Pasaport, vize, patent, RVP/VNJ ve çalışma izni yaklaşan kritik bitiş alarmları.',
            tooltipRu: 'Контроль сроков действия паспортов, виз, патентов и РНР.',
            keywords: 'evrak süre pasaport vize patent bitiş alarm',
          },
          {
            id: 'compliance:standby',
            pageId: 'compliance',
            subTabId: 'standby',
            labelTr: 'İzinli / Beklemede (Standby) Analizi',
            labelRu: 'Анализ отпусков и ожидания (Standby)',
            tooltipTr: 'Şantiyede aktif olmayan, izinde veya rotasyon bekleyen personellerin takibi.',
            tooltipRu: 'Учёт сотрудников в отпуске, на межвахте и в режиме ожидания.',
            keywords: 'standby izin bekleme rotasyon',
          },
          {
            id: 'compliance:scans',
            pageId: 'compliance',
            subTabId: 'scans',
            labelTr: 'Eksik Evrak Taramaları Kontrolü',
            labelRu: 'Контроль отсутствующих сканов',
            tooltipTr: 'Dijital dosyasında eksik pasaport/patent/sözleşme taraması olan personelleri listeler.',
            tooltipRu: 'Список сотрудников с отсутствующими сканами обязательных документов.',
            keywords: 'tarama eksik dosya scan evrak',
          },
        ],
      },
      {
        id: 'official_real',
        pageId: 'official_real',
        category: 'analytics',
        titleTr: 'Resmi vs Reel (1C ↔ eBA)',
        titleRu: 'Сверка 1С:ЗУП ↔ eBA',
        descTr: '1C:ЗУП resmi bordro kadrosu ile eBA saha personelinin otomatik karşılaştırması',
        descRu: 'Автоматическая сверка штата 1С:ЗУП и фактического учёта eBA',
        icon: Scale,
        brandLogo: '1c',
        badgeTr: '1C • eBA',
        badgeRu: '1С • eBA',
        subTabs: [
          {
            id: 'official_real:main',
            pageId: 'official_real',
            labelTr: '1C ZUP & eBA Kadro Farkı Analizi',
            labelRu: 'Расхождения между 1С:ЗУП и eBA',
            tooltipTr: '1C\'de kayıtlı olup eBA\'da olmayan veya sahada çalışıp resmi girişi eksik personelleri tespit eder.',
            tooltipRu: 'Выявляет расхождения между официальным штатом 1С и фактическими данными eBA.',
            keywords: '1c zup eba resmi reel fark karşılaştırma',
          },
        ],
      },
      {
        id: 'report_proposals',
        pageId: 'report_proposals',
        category: 'analytics',
        titleTr: 'Yeni Rapor Teklifleri (7)',
        titleRu: 'Новые аналитические отчёты (7)',
        descTr: '7 gelişmiş stratejik İK, hukuk, SLA ve НДФЛ vergi avantajı raporu',
        descRu: '7 продвинутых отчётов: риски, SLA, мобильность и НДФЛ',
        icon: Sparkles,
        badgeTr: '7 Sekme',
        badgeRu: '7 вкладок',
        subTabs: [
          {
            id: 'report_proposals:health',
            pageId: 'report_proposals',
            subTabId: 'health',
            labelTr: 'İK Sağlık Skoru & Proje Risk Matrisi',
            labelRu: 'Индекс здоровья HR и матрица рисков',
            tooltipTr: 'Şantiyelerin evrak, uyumluluk ve kadro sağlık puanlarını tek matriste puanlar.',
            tooltipRu: 'Оценка проектов по показателям кадрового здоровья и рисков.',
            keywords: 'sağlık skor risk matris',
          },
          {
            id: 'report_proposals:sla',
            pageId: 'report_proposals',
            subTabId: 'sla',
            labelTr: 'Süreç SLA & Darboğaz Analizi',
            labelRu: 'SLA процессов и узкие места',
            tooltipTr: 'İşe alım, vize ve evrak onay sürelerindeki gecikmeleri ölçer.',
            tooltipRu: 'Контроль сроков согласования и выявление задержек.',
            keywords: 'sla gecikme darboğaz süre',
          },
          {
            id: 'report_proposals:legal',
            pageId: 'report_proposals',
            subTabId: 'legal',
            labelTr: 'Hukuki Ceza & Uyumluluk Riski',
            labelRu: 'Юридические риски и штрафы МВД',
            tooltipTr: 'Rusya göçmenlik mevzuatı ihlallerinden doğabilecek tahmini ceza riskini hesaplar.',
            tooltipRu: 'Оценка потенциальных штрафов и миграционных рисков.',
            keywords: 'hukuk ceza mvd risk uyumluluk',
          },
          {
            id: 'report_proposals:ndfl',
            pageId: 'report_proposals',
            subTabId: 'ndfl',
            labelTr: 'НДФЛ %13 / %30 Vergi Avantajı (183 Gün)',
            labelRu: 'Налоговая выгода НДФЛ 13% / 30% (183 дн.)',
            tooltipTr: 'Vergi mukimi (резидент) geçişlerini ve 183 gün takibini analiz eder.',
            tooltipRu: 'Контроль статуса налогового резидента РФ (183 дня) и ставки НДФЛ.',
            keywords: 'ndfl vergi 13 30 183 gün rezident',
          },
          {
            id: 'report_proposals:mobility',
            pageId: 'report_proposals',
            subTabId: 'mobility',
            labelTr: 'Mobilite, Vardiya & Veri Kalitesi',
            labelRu: 'Мобильность, вахта и качество данных',
            tooltipTr: 'Şantiyeler arası transferler, vardiya dengesi ve eksik veri kalitesi denetimi.',
            tooltipRu: 'Анализ перемещений между объектами, вахт и полноты данных.',
            keywords: 'mobilite vardiya kalite veri',
          },
        ],
      },

      /* 2. PEOPLE, ORG & SITES */
      {
        id: 'personnel',
        pageId: 'personnel',
        category: 'people',
        titleTr: 'Personel Listesi',
        titleRu: 'Список персонала',
        descTr: 'Tüm aktif ve çıkışlı çalışanların tam dijital özlük kartları ve Excel çıktısı',
        descRu: 'Полный реестр сотрудников, карточки и экспорт в Excel',
        icon: Users,
        brandLogo: 'eba',
        badgeTr: stats?.totalCount ? `${stats.totalCount.toLocaleString('tr-TR')}` : 'Aktif',
        badgeRu: stats?.totalCount ? `${stats.totalCount.toLocaleString('ru-RU')}` : 'Штат',
        subTabs: [
          {
            id: 'personnel:list',
            pageId: 'personnel',
            labelTr: 'Tüm Çalışanlar & Dijital Özlük Kartı',
            labelRu: 'Реестр сотрудников и личные карточки',
            tooltipTr: 'Sicil, pasaport, Kiril/Latin ad, şantiye, vize, patent ve tüm 1C/eBA kolonlarında anlık arama.',
            tooltipRu: 'Мгновенный поиск по ФИО, табельному номеру, паспорту, объекту и документам.',
            keywords: 'personel çalışan liste sicil pasaport kart',
          },
        ],
      },
      {
        id: 'org_chart',
        pageId: 'org_chart',
        category: 'people',
        titleTr: 'Organizasyon Şeması',
        titleRu: 'Организационная структура',
        descTr: 'İnteraktif şirket, proje ve departman hiyerarşi ağacı',
        descRu: 'Интерактивное дерево подразделений и подчинённости',
        icon: GitFork,
        badgeTr: 'Şema',
        badgeRu: 'Иерархия',
        subTabs: [
          {
            id: 'org_chart:main',
            pageId: 'org_chart',
            labelTr: 'İnteraktif Hiyerarşi Ağacı (Zoom & Pan)',
            labelRu: 'Интерактивная схема (Zoom & Pan)',
            tooltipTr: 'Yönetici, şantiye ve ekip kırılımlarında yakınlaştırılabilir tam ekran organizasyon şeması.',
            tooltipRu: 'Полноэкранная интерактивная оргструктура по проектам и отделам.',
            keywords: 'organizasyon şema hiyerarşi ağaç departman',
          },
        ],
      },
      {
        id: 'sites',
        pageId: 'sites',
        category: 'people',
        titleTr: 'Şantiye & Projeler',
        titleRu: 'Участки и Проекты',
        descTr: 'Tüm aktif Rusya şantiyelerinin kadro, uyruk ve mühendislik dağılımı',
        descRu: 'Штат, гражданство и структура по всем объектам РФ',
        icon: Building2,
        badgeTr: '11 Saha',
        badgeRu: '11 Объектов',
        subTabs: [
          {
            id: 'sites:main',
            pageId: 'sites',
            labelTr: 'Proje Bazlı Kadro & Saha Kartları',
            labelRu: 'Карточки строительных объектов',
            tooltipTr: 'Ust-Luga, Amur, Kazan, Tobolsk, Irkutsk ve diğer şantiyelerin detaylı personel özeti.',
            tooltipRu: 'Подробная сводка по численности и составу каждого строительного объекта.',
            keywords: 'şantiye proje saha ust-luga amur kazan tobolsk',
          },
        ],
      },

      /* 3. RPA, GOVERNMENT & MIGRATION AUTOMATIONS */
      {
        id: 'patent_ndfl',
        pageId: 'patent_ndfl',
        category: 'rpa_gov',
        titleTr: 'SNG Patent & НДФЛ Mahsup',
        titleRu: 'Патент и НДФЛ (1С • ФНС)',
        descTr: '1C OData canlı patent mahsubu, AI Fiş Yükleme, ФНС XML ve ст. 231 Возврат',
        descRu: 'Зачёт патентов 1С OData, AI-загрузка чеков, XML ФНС и возврат ст. 231',
        icon: Receipt,
        brandLogo: '1c',
        badgeTr: patentStats ? `%${patentStats.offsetRate}` : '5 Sekme',
        badgeRu: patentStats ? `%${patentStats.offsetRate}` : '5 вкладок',
        subTabs: [
          {
            id: 'patent_ndfl:overview',
            pageId: 'patent_ndfl',
            subTabId: 'overview',
            labelTr: '1. Patent İade Özeti & Proje/Bölge Analizi',
            labelRu: '1. Сводка зачёта, проекты и регионы ИФНС',
            tooltipTr: 'Speedometer mahsup göstergesi, kök neden analizi, şantiye ve İFNS bölge grafikleri, oran dağılımı.',
            tooltipRu: 'Индикатор доли зачёта, причины потерь, разбивка по объектам и кодам ИФНС.',
            keywords: 'patent ndfl özet speedometer proje bölge ifns mahsup',
            badge: patentStats ? `%${patentStats.offsetRate}` : undefined,
            badgeTone: 'emerald',
          },
          {
            id: 'patent_ndfl:reconciliation',
            pageId: 'patent_ndfl',
            subTabId: 'reconciliation',
            labelTr: '2. Kişi Bazlı 12 Aylık Detay & Fiş Girişi',
            labelRu: '2. Детализация по сотрудникам (12 мес.)',
            tooltipTr: '711 çalışan için ay-ay patent avansı, 1C fiş giriş tarihi, kesilen НДФЛ ve mahsup analizi.',
            tooltipRu: 'Помесячная сверка чеков, дат внесения в 1С, исчисленного и зачтённого НДФЛ.',
            keywords: 'kişi detay aylık fiş mahsup 1c',
          },
          {
            id: 'patent_ndfl:notifications',
            pageId: 'patent_ndfl',
            subTabId: 'notifications',
            labelTr: '3. ФНС Bildirim Takip & КНД 1110055 XML',
            labelRu: '3. Уведомления ФНС и XML КНД 1110055',
            tooltipTr: 'Уведомление ФНС izni eksik çalışanlar, toplu КНД 1110055 XML üretimi ve PDF izin okuma.',
            tooltipRu: 'Сотрудники без уведомления ФНС, генерация XML КНД 1110055 и разбор PDF.',
            keywords: 'fns bildirim уведомление xml knd 1110055',
            badge: patentStats && patentStats.noNotifCount > 0 ? `${patentStats.noNotifCount}` : undefined,
            badgeTone: 'rose',
          },
          {
            id: 'patent_ndfl:vozvrat',
            pageId: 'patent_ndfl',
            subTabId: 'vozvrat',
            labelTr: '4. Возврат НДФЛ (ст. 231 НК РФ) İade Dosyası',
            labelRu: '4. Возврат НДФЛ (ст. 231 НК РФ)',
            tooltipTr: 'Yıl sonu zorunlu iade hesaplaması, 4 adımlı ЕНС/6-НДФЛ rehberi, toplu çalışan dilekçesi yazdırma.',
            tooltipRu: 'Расчёт обязательного возврата, регламент ЕНС/6-НДФЛ и печать заявлений.',
            keywords: 'vozvrat возврат iade 231 dilekçe 6-ndfl ens',
            badge: patentStats && patentStats.vozvratCount > 0 ? `${patentStats.vozvratCount}` : undefined,
            badgeTone: 'amber',
          },
          {
            id: 'patent_ndfl:import_odata',
            pageId: 'patent_ndfl',
            subTabId: 'import_odata',
            labelTr: '5. 1C OData Bağlantı, AI Fiş Yükle & Mevzuat',
            labelRu: '5. 1С OData, AI-загрузка чеков и Регламент',
            tooltipTr: '1C:ЗУП canlı OData senkronizasyonu, ZIP/PDF fişleri AI ile okuyup 1C\'ye taslak/onaylı gönderme.',
            tooltipRu: 'Настройка 1С OData, массовая загрузка сканов чеков в 1С и регламент.',
            keywords: 'odata 1c fiş yükle zip pdf ai ocr mevzuat',
          },
        ],
      },
      {
        id: 'gosuslugi',
        pageId: 'gosuslugi',
        category: 'rpa_gov',
        titleTr: 'Gosuslugi RPA Robotu (МВД)',
        titleRu: 'Робот Госуслуги (МВД • RPA)',
        descTr: 'Госуслуги portalına tam otomatik VKS maaş, işe giriş, çıkış ve kayıt bildirimi',
        descRu: 'Автоматическая подача уведомлений на Госуслуги (ВКС, приём, увольнение)',
        icon: Bot,
        brandLogo: 'gosuslugi',
        badgeTr: 'RPA',
        badgeRu: 'RPA',
        subTabs: [
          {
            id: 'gosuslugi:vks',
            pageId: 'gosuslugi',
            subTabId: 'vks',
            labelTr: 'VKS Çeyreklik Maaş Bildirimi (RPA)',
            labelRu: 'Ежеквартальное уведомление ВКС (RPA)',
            tooltipTr: 'Госуслуги üzerinden çeyreklik VKS maaş bildirimlerini robotla otomatik gönderme ve PDF makbuz indirme.',
            tooltipRu: 'Роботизированная подача квартальных уведомлений ВКС и сбор квитанций МВД.',
            keywords: 'gosuslugi госуслуги vks вкс rpa robot çeyrek maaş',
          },
          {
            id: 'gosuslugi:hiring',
            pageId: 'gosuslugi',
            subTabId: 'hiring',
            labelTr: 'İşe Giriş Bildirimi (Приём · МВД)',
            labelRu: 'Уведомление о заключении договора (Приём)',
            tooltipTr: 'Yabancı personel işe alımında 3 iş günü içinde МВД / Госуслуги otomatik bildirimi.',
            tooltipRu: 'Подача уведомления о приёме иностранного гражданина в МВД.',
            keywords: 'gosuslugi işe giriş приём sözleşme mvd',
          },
          {
            id: 'gosuslugi:dismissal',
            pageId: 'gosuslugi',
            subTabId: 'dismissal',
            labelTr: 'İşten Çıkış Bildirimi (Увольнение · МВД)',
            labelRu: 'Уведомление о расторжении (Увольнение)',
            tooltipTr: 'İşten ayrılan yabancı personellerin МВД fesih bildirim takibi ve robot gönderimi.',
            tooltipRu: 'Подача уведомления об увольнении иностранного работника.',
            keywords: 'gosuslugi çıkış увольнение fesih mvd',
          },
          {
            id: 'gosuslugi:registration',
            pageId: 'gosuslugi',
            subTabId: 'registration',
            labelTr: 'Göçmenlik Kayıt (Миграционный учёт)',
            labelRu: 'Миграционный учёт (Регистрация)',
            tooltipTr: 'Lojman/kamp adresine göre Госуслуги üzerinden ikamet kayıt otomasyonu.',
            tooltipRu: 'Автоматизация постановки на миграционный учёт через Госуслуги.',
            keywords: 'gosuslugi kayıt регистрация ikamet göçmenlik',
          },
        ],
      },
      {
        id: 'inn_snils',
        pageId: 'inn_snils',
        category: 'rpa_gov',
        titleTr: 'INN & SNILS Kontrol (ФНС • СФР)',
        titleRu: 'Проверка ИНН и СНИЛС (ФНС • СФР)',
        descTr: 'ФНС России servisinden otomatik ИНН sorgulama, başvuru ve СНИЛС takibi',
        descRu: 'Автопроверка ИНН через ФНС России, заявки и контроль СНИЛС',
        icon: ShieldCheck,
        brandLogo: 'fns',
        badgeTr: 'ФНС • СФР',
        badgeRu: 'ФНС • СФР',
        subTabs: [
          {
            id: 'inn_snils:verify',
            pageId: 'inn_snils',
            subTabId: 'verify',
            labelTr: 'Toplu ФНС ИНН Doğrulama & Sorgu',
            labelRu: 'Массовая проверка ИНН в ФНС России',
            tooltipTr: 'Pasaport bilgilerinden ФНС России veritabanında 12 haneli ИНН numarasını otomatik doğrular.',
            tooltipRu: 'Автоматический запрос и проверка 12-значного ИНН через сервис ФНС.',
            keywords: 'inn инн fns фнс snils снилс doğrulama sorgu',
          },
          {
            id: 'inn_snils:apply',
            pageId: 'inn_snils',
            subTabId: 'apply',
            labelTr: 'Eksik ИНН / СНИЛС Başvuru Takibi',
            labelRu: 'Подача заявок на ИНН и СНИЛС',
            tooltipTr: 'ИНН veya СНИЛС kaydı bulunmayan çalışanlar için adım adım başvuru listesi.',
            tooltipRu: 'Очередь сотрудников на оформление недостающих ИНН и СНИЛС.',
            keywords: 'inn snils başvuru eksik sfr',
          },
          {
            id: 'inn_snils:analytics',
            pageId: 'inn_snils',
            subTabId: 'analytics',
            labelTr: 'Şantiye Bazlı ИНН/СНИЛС Kapsama Analitiği',
            labelRu: 'Аналитика обеспеченности ИНН / СНИЛС',
            tooltipTr: 'Hangi projede kaç çalışanın ИНН/СНИЛС belgesi tamamlanmış yüzde olarak gösterir.',
            tooltipRu: 'Процент наличия ИНН и СНИЛС в разрезе проектов.',
            keywords: 'inn snils analitik oran grafik',
          },
        ],
      },
      {
        id: 'gosuslugi_analytics',
        pageId: 'gosuslugi_analytics',
        category: 'rpa_gov',
        titleTr: 'VKS İstatistik & Analiz',
        titleRu: 'ВКС Статистика и Аналитика',
        descTr: 'Yıllık/çeyreklik VKS gönderim performansı, МВД onay oranları ve süre grafiği',
        descRu: 'Статистика подач ВКС по кварталам и подтверждения МВД',
        icon: Activity,
        brandLogo: 'gosuslugi',
        badgeTr: 'Canlı',
        badgeRu: 'Live',
        subTabs: [
          {
            id: 'gosuslugi_analytics:main',
            pageId: 'gosuslugi_analytics',
            labelTr: 'Çeyreklik VKS Raporu & МВД Makbuz İstatistikleri',
            labelRu: 'Квартальная статистика ВКС и квитанции МВД',
            tooltipTr: 'Gönderilen, onaylanan ve bekleyen VKS çeyreklik bildirimlerinin görsel analizi.',
            tooltipRu: 'Аналитика поданных, принятых и ожидающих уведомлений ВКС.',
            keywords: 'vks istatistik analiz çeyrek mvd gosuslugi',
          },
        ],
      },
      {
        id: 'invitations',
        pageId: 'invitations',
        category: 'rpa_gov',
        titleTr: 'Davetiye Takip (Zoho Mail • МВД)',
        titleRu: 'Учёт приглашений (Zoho Mail • МВД)',
        descTr: 'Zoho Mail gelen kutusundan МВД elektronik davetiye PDF\'lerini otomatik çeker',
        descRu: 'Автоматический сбор PDF-приглашений МВД из почты Zoho Mail',
        icon: Mail,
        brandLogo: 'zoho',
        badgeTr: 'Zoho • МВД',
        badgeRu: 'Zoho • МВД',
        subTabs: [
          {
            id: 'invitations:applications',
            pageId: 'invitations',
            subTabId: 'applications',
            labelTr: 'Davetiye Başvuruları & Personel Eşleştirme',
            labelRu: 'Заявки на приглашения и сверка ФИО',
            tooltipTr: 'Zoho Mail IMAP üzerinden gelen davetiyeleri mevcut personel listesiyle otomatik eşleştirir.',
            tooltipRu: 'Сопоставление электронных приглашений МВД из почты с базой персонала.',
            keywords: 'davetiye invitation zoho mail imap mvd vize',
          },
          {
            id: 'invitations:mvd_pdfs',
            pageId: 'invitations',
            subTabId: 'mvd_pdfs',
            labelTr: 'Arşivlenmiş МВД Elektronik Davetiye PDF\'leri',
            labelRu: 'Архив PDF-приглашений МВД',
            tooltipTr: 'Otomatik indirilip isimlendirilmiş tüm МВД davetiye PDF dosyaları ve toplu bildirim.',
            tooltipRu: 'Все сохранённые электронные приглашения МВД и рассылка.',
            keywords: 'davetiye pdf mvd arşiv zoho',
          },
        ],
      },
      {
        id: 'quotas',
        pageId: 'quotas',
        category: 'rpa_gov',
        titleTr: 'Çalışma Kotaları (ИРС)',
        titleRu: 'Квоты на работу (ИРС)',
        descTr: 'Bölge ve meslek bazlı yabancı işçi kotaları, ИРС sertifikaları ve çalışan dağılımı',
        descRu: 'Региональные квоты, разрешения ИРС, сертификаты и коды профессий',
        icon: Briefcase,
        badgeTr: '6 Sekme',
        badgeRu: '6 вкладок',
        subTabs: [
          {
            id: 'quotas:region_irs',
            pageId: 'quotas',
            subTabId: 'region_irs',
            labelTr: 'Bölge & ИРС Kota Kullanım Özeti',
            labelRu: 'Использование квот по регионам и ИРС',
            tooltipTr: 'Bölgelere göre toplam onaylı kota, kullanılan ve kalan boş kontenjanlar.',
            tooltipRu: 'Выделенные, использованные и свободные квоты по регионам РФ.',
            keywords: 'kota irs bölge kontenjan çalışma izni',
          },
          {
            id: 'quotas:ozet_pivot',
            pageId: 'quotas',
            subTabId: 'ozet_pivot',
            labelTr: 'Ülke / Bölge Pivot Tablosu',
            labelRu: 'Сводная таблица (Страна / Регион)',
            tooltipTr: 'Uyruk ve bölge kırılımında dinamik kota özet pivotu.',
            tooltipRu: 'Сводный пивот по гражданству и регионам.',
            keywords: 'kota pivot ülke bölge',
          },
          {
            id: 'quotas:certificates',
            pageId: 'quotas',
            subTabId: 'certificates',
            labelTr: 'ИРС Sertifikaları & Çalışan Atamaları',
            labelRu: 'Сертификаты ИРС и привязка работников',
            tooltipTr: 'Alınmış ИРС izin belgeleri ve bu belgelere bağlı yabancı çalışan listesi.',
            tooltipRu: 'Реестр разрешений ИРС и прикреплённых сотрудников.',
            keywords: 'kota sertifika irs belge çalışan',
          },
          {
            id: 'quotas:codes_guide',
            pageId: 'quotas',
            subTabId: 'codes_guide',
            labelTr: 'Dosya Verileri & Meslek Kodları Rehberi',
            labelRu: 'Файлы данных и справочник кодов ОКПДТР',
            tooltipTr: 'Resmi Rusça meslek kodları, ülke kodları ve Excel kota yükleme araçları.',
            tooltipRu: 'Справочник кодов профессий, стран и импорт файлов квот.',
            keywords: 'kota kod meslek okpdtr rehber',
          },
        ],
      },

      /* 4. OPERATIONS, POWERISE & SETTINGS */
      {
        id: 'travel_tickets',
        pageId: 'travel_tickets',
        category: 'operations',
        titleTr: 'İdari İşler & AI Bilet Tarama',
        titleRu: 'Адм. отдел и AI-сканер билетов',
        descTr: 'DeepSeek / Gemini AI OCR ile uçak & tren bileti otomatik okuma ve maliyet takibi',
        descRu: 'AI OCR распознавание авиа- и ж/д билетов (DeepSeek / Gemini)',
        icon: Plane,
        brandLogo: 'ai',
        badgeTr: 'AI OCR',
        badgeRu: 'AI OCR',
        subTabs: [
          {
            id: 'travel_tickets:live_scanner',
            pageId: 'travel_tickets',
            subTabId: 'live_scanner',
            labelTr: 'Canlı AI Bilet Tarayıcı & Seyahat Listesi',
            labelRu: 'Живой AI-сканер билетов и реестр поездок',
            tooltipTr: 'PDF/görsel uçak ve tren biletlerini AI OCR ile okuyup yolcu, PNR, rota ve tutarı kaydeder.',
            tooltipRu: 'Автоматическое извлечение ФИО, паспорта, рейса, маршрута и цены из билетов.',
            keywords: 'bilet uçak tren ai ocr deepseek seyahat idari',
          },
          {
            id: 'travel_tickets:showcase',
            pageId: 'travel_tickets',
            subTabId: 'showcase',
            labelTr: 'Seyahat & Maliyet Analitik Vitrini',
            labelRu: 'Аналитика и витрина расходов на билеты',
            tooltipTr: 'Proje bazlı seyahat harcamaları ve AI tarama performans özeti.',
            tooltipRu: 'Анализ затрат на билеты по проектам и точности OCR.',
            keywords: 'bilet maliyet vitrin analiz',
          },
        ],
      },
      {
        id: 'camp_management',
        pageId: 'camp_management',
        category: 'operations',
        titleTr: 'Kamp & Lojman Yönetimi (3D)',
        titleRu: 'Управление городками и общежитиями (3D)',
        descTr: '3D şantiye kamp yerleşimi, yatak doluluk oranı ve oda atama yönetimi',
        descRu: '3D-карта жилых городков, загруженность коек и заселение',
        icon: Building,
        badgeTr: '3D • Lojman',
        badgeRu: '3D • Городок',
        subTabs: [
          {
            id: 'camp_management:explorer_3d',
            pageId: 'camp_management',
            subTabId: 'explorer_3d',
            labelTr: '3D Kamp & Bina Yerleşim Görünümü',
            labelRu: '3D-обзор жилых корпусов',
            tooltipTr: 'Blok, kat ve oda bazında 3D görsel doluluk ve hızlı personel yerleştirme.',
            tooltipRu: 'Трёхмерная визуализация блоков, этажей и комнат общежития.',
            keywords: 'kamp lojman 3d oda yatak bina',
          },
          {
            id: 'camp_management:analytics',
            pageId: 'camp_management',
            subTabId: 'analytics',
            labelTr: 'Kapasite & Doluluk Analitiği',
            labelRu: 'Аналитика вместимости и заселения',
            tooltipTr: 'Şantiye bazlı boş yatak kapasitesi, doluluk yüzdeleri ve planlama.',
            tooltipRu: 'Процент загрузки и свободные места по объектам.',
            keywords: 'kamp doluluk kapasite analiz',
          },
          {
            id: 'camp_management:tables',
            pageId: 'camp_management',
            subTabId: 'tables',
            labelTr: 'Oda, Sakin & Atanmamış Personel Tablosu',
            labelRu: 'Таблицы комнат, жильцов и незаселённых',
            tooltipTr: 'Oda envanteri, kalan çalışanlar ve henüz lojmana atanmamış personeller.',
            tooltipRu: 'Списки комнат, проживающих и сотрудников без места.',
            keywords: 'kamp tablo sakin atanmamış oda',
          },
        ],
      },
      {
        id: 'powerise_tech',
        pageId: 'powerise_tech',
        category: 'operations',
        titleTr: 'Powerise Saha & İnovasyon',
        titleRu: 'Powerise Витрина и Инновации',
        descTr: 'Mobil NFC pasaport okuyucu, puantaj BI ve Powerise ürün tanıtım vitrini',
        descRu: 'Мобильный NFC-сканер паспортов, табели BI и видео-витрина',
        icon: Smartphone,
        badgeTr: 'Vitrin',
        badgeRu: 'Витрина',
        subTabs: [
          {
            id: 'powerise_tech:main',
            pageId: 'powerise_tech',
            labelTr: 'Powerise Mobil & Saha Otomasyon Vitrini',
            labelRu: 'Витрина решений Powerise',
            tooltipTr: 'Saha NFC pasaport tarama, GPS poligon ve mobil uygulama tanıtımı.',
            tooltipRu: 'Обзор мобильных технологий NFC, GPS-зон и автоматизации.',
            keywords: 'powerise mobil nfc vitrin video inovasyon',
          },
        ],
      },
      {
        id: 'settings',
        pageId: 'settings',
        category: 'operations',
        titleTr: 'Ayarlar, Zoho Mail & AI Yönetimi',
        titleRu: 'Настройки, Zoho Mail и AI',
        descTr: 'Kullanıcı rolleri (RLS), 1C/eBA veritabanı, Zoho Mail bildirim ve DeepSeek/Gemini AI',
        descRu: 'Роли (RLS), база 1С/eBA, почта Zoho Mail и модели DeepSeek/Gemini',
        icon: Settings,
        brandLogo: 'zoho',
        badgeTr: 'RLS • AI',
        badgeRu: 'RLS • AI',
        hideForViewer: true,
        subTabs: [
          {
            id: 'settings:users_rls',
            pageId: 'settings',
            subTabId: 'users_rls',
            labelTr: 'Kullanıcılar & Rol Yetkileri (RLS)',
            labelRu: 'Пользователи и права доступа (RLS)',
            tooltipTr: 'Admin, şantiye yöneticisi ve izleyici rollerini ve erişim kapsamlarını yönetin.',
            tooltipRu: 'Управление учётными записями и разграничением доступа по объектам.',
            keywords: 'ayarlar kullanıcı rol yetki rls admin',
          },
          {
            id: 'settings:database_excel',
            pageId: 'settings',
            subTabId: 'database_excel',
            labelTr: '1C / eBA Veritabanı & Excel Yükleme',
            labelRu: 'База 1С / eBA и загрузка Excel',
            tooltipTr: 'Canlı SQLite veritabanı yenileme, eBA ve 1C:ЗУП Excel senkronizasyonu.',
            tooltipRu: 'Обновление базы данных, импорт выгрузок eBA и 1С:ЗУП.',
            keywords: 'veritabanı database excel 1c eba yükle',
          },
          {
            id: 'settings:mail_notifications',
            pageId: 'settings',
            subTabId: 'mail_notifications',
            labelTr: 'Zoho Mail Otomasyon & Bildirim Kuralları',
            labelRu: 'Zoho Mail и автоматические рассылки',
            tooltipTr: 'Zoho SMTP/IMAP bağlantı ayarları, otomatik uyarı mailleri ve davetiye okuma.',
            tooltipRu: 'Настройка Zoho Mail SMTP/IMAP, автоуведомления и чтение писем.',
            keywords: 'zoho mail smtp imap bildirim e-posta otomasyon',
          },
          {
            id: 'settings:ai_settings',
            pageId: 'settings',
            subTabId: 'ai_settings',
            labelTr: 'Yapay Zeka (DeepSeek • Gemini • OCR) Ayarları',
            labelRu: 'Настройки AI (DeepSeek • Gemini • OCR)',
            tooltipTr: 'DeepSeek V4.1 Flash, SiliconFlow VL2, Gemini ve yerel OCR sağlayıcı anahtarları.',
            tooltipRu: 'API-ключи DeepSeek, Gemini, SiliconFlow и тестирование OCR-моделей.',
            keywords: 'ai yapay zeka deepseek gemini ocr api key',
          },
        ],
      },
    ],
    [stats, patentStats]
  );

  const visibleModules = useMemo(() => {
    return modules.filter((m) => {
      if (isIdariOnly) return m.id === 'travel_tickets' || m.id === 'camp_management';
      if (isViewer && m.hideForViewer) return false;
      return true;
    });
  }, [modules, isIdariOnly, isViewer]);

  const allShortcutsMap = useMemo(() => {
    const mp = new Map<string, { shortcut: SubTabShortcut; mod: ModuleCardConfig }>();
    for (const mod of visibleModules) {
      for (const st of mod.subTabs) mp.set(st.id, { shortcut: st, mod });
    }
    return mp;
  }, [visibleModules]);

  const pinnedShortcuts = useMemo(
    () => pinnedIds.map((id) => allShortcutsMap.get(id)).filter(Boolean) as Array<{ shortcut: SubTabShortcut; mod: ModuleCardConfig }>,
    [pinnedIds, allShortcutsMap]
  );

  const filteredModules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleModules
      .filter((m) => category === 'all' || m.category === category)
      .map((m) => {
        if (!q) return m;
        const modMatch = `${m.titleTr} ${m.titleRu} ${m.descTr} ${m.descRu}`.toLowerCase().includes(q);
        const matchingSubs = m.subTabs.filter((st) =>
          `${st.labelTr} ${st.labelRu} ${st.tooltipTr} ${st.tooltipRu} ${st.keywords}`.toLowerCase().includes(q)
        );
        if (modMatch) return m;
        if (matchingSubs.length > 0) return { ...m, subTabs: matchingSubs };
        return null;
      })
      .filter(Boolean) as ModuleCardConfig[];
  }, [visibleModules, category, query]);

  const integrations = [
    {
      id: 'int_1c',
      brand: '1c' as const,
      name: '1C:ЗУП 3.1',
      statusTr: stats?.systemInfo?.zup_data_freshness ? `Canlı · ${stats.systemInfo.zup_data_freshness}` : 'Canlı OData',
      statusRu: stats?.systemInfo?.zup_data_freshness ? `Онлайн · ${stats.systemInfo.zup_data_freshness}` : 'OData онлайн',
      subTr: 'Bordro, НДФЛ & Fiş Yazma',
      subRu: 'Зарплата, НДФЛ и чеки',
      pageId: 'patent_ndfl',
      subTabId: 'import_odata',
    },
    {
      id: 'int_eba',
      brand: 'eba' as const,
      name: 'eBA Workflow',
      statusTr: stats?.systemInfo?.data_freshness ? `Senkron · ${stats.systemInfo.data_freshness}` : 'Bağlı',
      statusRu: stats?.systemInfo?.data_freshness ? `Синхр. · ${stats.systemInfo.data_freshness}` : 'Подключено',
      subTr: 'Personel & Evrak Havuzu',
      subRu: 'Персонал и документы',
      pageId: 'official_real',
      subTabId: undefined,
    },
    {
      id: 'int_gosuslugi',
      brand: 'gosuslugi' as const,
      name: 'Госуслуги (МВД)',
      statusTr: 'RPA Robot Hazır',
      statusRu: 'RPA-робот готов',
      subTr: 'VKS, Giriş/Çıkış & Kayıt',
      subRu: 'ВКС, приём/увольнение',
      pageId: 'gosuslugi',
      subTabId: 'vks',
    },
    {
      id: 'int_fns',
      brand: 'fns' as const,
      name: 'ФНС России',
      statusTr: 'Otomatik Sorgu & XML',
      statusRu: 'Автопроверка и XML',
      subTr: 'ИНН Doğrulama & КНД XML',
      subRu: 'Проверка ИНН и КНД XML',
      pageId: 'inn_snils',
      subTabId: 'verify',
    },
    {
      id: 'int_zoho',
      brand: 'zoho' as const,
      name: 'Zoho Mail',
      statusTr: 'IMAP / SMTP Aktif',
      statusRu: 'IMAP / SMTP активен',
      subTr: 'Davetiye PDF & Uyarı Maili',
      subRu: 'Приглашения и рассылки',
      pageId: isViewer ? 'invitations' : 'settings',
      subTabId: isViewer ? 'applications' : 'mail_notifications',
    },
    {
      id: 'int_ai',
      brand: 'ai' as const,
      name: 'AI OCR & RPA',
      statusTr: 'DeepSeek • Gemini',
      statusRu: 'DeepSeek • Gemini',
      subTr: 'Patent Fişi & Bilet Okuma',
      subRu: 'Чеки патентов и билеты',
      pageId: 'travel_tickets',
      subTabId: 'live_scanner',
    },
  ];

  // Warm cream tactile surfaces (Image 2 design system) with Pondera Emerald Green accents + crisp Dark Mode
  const raisedCardCls =
    'bg-[#FAF7F1] dark:bg-[#11192B] border border-[#E7DFD2] dark:border-slate-700/70 ' +
    'shadow-[5px_5px_14px_rgba(160,147,125,0.20),-4px_-4px_12px_rgba(255,255,255,0.92)] ' +
    'dark:shadow-[0_6px_20px_rgba(0,0,0,0.38)]';

  const insetFieldCls =
    'bg-[#EFE9DD] dark:bg-[#0B1222] border border-[#DFD6C5] dark:border-slate-700/80 ' +
    'shadow-[inset_3px_3px_7px_rgba(155,142,120,0.24),inset_-3px_-3px_7px_rgba(255,255,255,0.88)] ' +
    'dark:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.5)]';

  const categories = [
    { id: 'all' as const, labelTr: 'Tümü', labelRu: 'Все разделы', count: visibleModules.length },
    {
      id: 'analytics' as const,
      labelTr: 'Analitik & Raporlar',
      labelRu: 'Аналитика и Отчёты',
      count: visibleModules.filter((m) => m.category === 'analytics').length,
    },
    {
      id: 'rpa_gov' as const,
      labelTr: 'RPA & Devlet (Госуслуги • ФНС • 1C)',
      labelRu: 'RPA и Госсервисы (Госуслуги • ФНС • 1С)',
      count: visibleModules.filter((m) => m.category === 'rpa_gov').length,
    },
    {
      id: 'people' as const,
      labelTr: 'Personel & Sahalar',
      labelRu: 'Персонал и Объекты',
      count: visibleModules.filter((m) => m.category === 'people').length,
    },
    {
      id: 'operations' as const,
      labelTr: 'Operasyon & Yönetim',
      labelRu: 'Операции и Настройки',
      count: visibleModules.filter((m) => m.category === 'operations').length,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#F3EEE4] dark:bg-[#0B1120] transition-colors duration-200">
      <div className="max-w-[1580px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">
        {/* TOP HERO HEADER + INSET SEARCH + LIVE MINI KPIs */}
        <div className={`${raisedCardCls} rounded-3xl p-5 sm:p-6`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/70 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {L(
                    'Pondera HR & Otomasyon Çalışma Masası · 1C Tarzı Hızlı Erişim',
                    'Рабочий стол Pondera HR и Автоматизации · Быстрая навигация'
                  )}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 dark:text-white">
                {L(
                  `Hoş geldiniz${user?.name ? `, ${user.name}` : ''}`,
                  `Добро пожаловать${user?.name ? `, ${user.name}` : ''}`
                )}
              </h1>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 max-w-2xl">
                {L(
                  'Tüm İK analizleri, 1C:ЗУП & eBA entegrasyonları, Госуслуги & ФНС robotları, Zoho Mail ve AI OCR otomasyonlarına alt sekmeleriyle birlikte tek ekrandan ulaşın.',
                  'Единый центр доступа ко всем отчётам HR, интеграциям 1С:ЗУП и eBA, RPA-роботам Госуслуги и ФНС, почте Zoho Mail и AI OCR.'
                )}
              </p>
            </div>

            {/* Live KPI Pills */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('personnel')}
                className="px-3.5 py-2 rounded-2xl bg-[#F4EFE6] dark:bg-slate-800/80 border border-[#E3DACB] dark:border-slate-700 shadow-[3px_3px_8px_rgba(160,147,125,0.18),-2px_-2px_6px_rgba(255,255,255,0.85)] dark:shadow-none hover:border-emerald-400 transition-all text-left cursor-pointer"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {L('Aktif Personel', 'Активный штат')}
                </div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                  {(stats?.totalCount || 0).toLocaleString(isRu ? 'ru-RU' : 'tr-TR')}
                </div>
              </button>

              {patentStats && (
                <button
                  type="button"
                  onClick={() => onNavigate('patent_ndfl', 'overview')}
                  className="px-3.5 py-2 rounded-2xl bg-[#F4EFE6] dark:bg-slate-800/80 border border-[#E3DACB] dark:border-slate-700 shadow-[3px_3px_8px_rgba(160,147,125,0.18),-2px_-2px_6px_rgba(255,255,255,0.85)] dark:shadow-none hover:border-emerald-400 transition-all text-left cursor-pointer"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {L('Patent Mahsup', 'Зачёт патентов')}
                  </div>
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                    %{patentStats.offsetRate}
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate('gosuslugi', 'vks')}
                className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-[0_6px_16px_rgba(5,150,105,0.28)] transition-all px-4 py-2.5 flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <div className="text-left">
                  <div className="text-[10px] opacity-85 leading-none">{L('Hızlı Başlat', 'Быстрый запуск')}</div>
                  <div className="text-xs font-bold leading-tight mt-0.5">{L('RPA & Otomasyon', 'RPA-автоматизация')}</div>
                </div>
              </button>
            </div>
          </div>

          {/* INSET SEARCH BAR (Image 2 Text Field style) */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className={`relative flex-1 rounded-2xl ${insetFieldCls} flex items-center px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:border-emerald-500 transition-all`}>
              <Search className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mr-2.5" strokeWidth={2} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={L(
                  'Modül, sekme veya otomasyon ara... (ör. vozvrat, knd, vks, gosuslugi, fns, zoho, kota, bilet, 1c)',
                  'Поиск раздела, вкладки или автоматизации... (напр. возврат, кнд, вкс, госуслуги, фнс, квоты, 1с)'
                )}
                className="w-full bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-500/80 dark:placeholder:text-slate-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-[#FAF7F1] dark:bg-slate-800 border border-[#DFD6C5] dark:border-slate-700 shadow-[3px_3px_8px_rgba(160,147,125,0.18),-2px_-2px_6px_rgba(255,255,255,0.9)] dark:shadow-none hover:border-emerald-500 transition-all whitespace-nowrap cursor-pointer"
              >
                Ctrl + K · {L('Genel Arama', 'Глобальный поиск')}
              </button>
            )}
          </div>
        </div>

        {/* LIVE ECOSYSTEM & AUTOMATION STRIP (Official Logos: 1C, eBA, Gosuslugi, FNS, Zoho Mail, AI OCR) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
              {L('Bağlı Sistemler & Canlı Otomasyon Motorları', 'Подключённые системы и живые автоматизации')}
            </span>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium hidden sm:inline">
              {L('Tıklayarak ilgili otomasyon ekranına geçin', 'Нажмите для перехода к нужному модулю')}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {integrations.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.pageId, item.subTabId)}
                className={`${raisedCardCls} group rounded-2xl p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400 dark:hover:border-emerald-500/70 hover:shadow-[7px_8px_18px_rgba(5,150,105,0.14),-4px_-4px_12px_rgba(255,255,255,0.95)] dark:hover:shadow-[0_10px_24px_rgba(16,185,129,0.15)] active:translate-y-0 cursor-pointer flex items-start gap-2.5`}
              >
                <BrandBadge kind={item.brand} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                      {item.name}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {isRu ? item.subRu : item.subTr}
                  </div>
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="truncate">{isRu ? item.statusRu : item.statusTr}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* PINNED SHORTCUTS BAR + CATEGORY FILTER PILLS */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Category Tabs (Image 2 Navigation Tabs style with Pondera Emerald active state) */}
          <div className={`inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl ${insetFieldCls}`}>
            {categories.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-emerald-600 text-white shadow-[0_3px_10px_rgba(5,150,105,0.32)]'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-white/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span>{isRu ? c.labelRu : c.labelTr}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[#E5DDD0] dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Pinned Favorites */}
          {pinnedShortcuts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1 mr-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                {L('Sabitlenenler:', 'Избранное:')}
              </span>
              {pinnedShortcuts.map(({ shortcut }) => (
                <button
                  key={shortcut.id}
                  type="button"
                  onClick={() => onNavigate(shortcut.pageId, shortcut.subTabId)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#FAF7F1] dark:bg-slate-800 border border-[#DFD6C5] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 shadow-2xs transition-all cursor-pointer truncate max-w-[200px]"
                >
                  {isRu ? shortcut.labelRu : shortcut.labelTr}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 1C-STYLE WORKSPACE DIRECTORY: MODULE CARDS + DIRECT SUB-TAB SHORTCUTS */}
        {filteredModules.length === 0 ? (
          <div className={`${raisedCardCls} rounded-3xl p-12 text-center space-y-3`}>
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EFE9DD] dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {L('Aramanızla eşleşen modül veya sekme bulunamadı.', 'Не найдено разделов по вашему запросу.')}
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('all');
              }}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              {L('Filtreyi Temizle', 'Сбросить фильтр')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredModules.map((mod) => {
              const ModIcon = mod.icon;
              return (
                <div
                  key={mod.id}
                  className={`${raisedCardCls} rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:border-emerald-400/80 dark:hover:border-emerald-500/50`}
                >
                  <div>
                    {/* Module Header (Click opens main module) */}
                    <button
                      type="button"
                      onClick={() => onNavigate(mod.pageId)}
                      className="w-full flex items-start justify-between gap-3 text-left group pb-3.5 border-b border-[#E7DFD2] dark:border-slate-700/70 cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-[#F2ECE1] dark:bg-slate-800/90 border border-[#E2D9C9] dark:border-slate-700 shadow-[3px_3px_7px_rgba(160,147,125,0.2),-2px_-2px_6px_rgba(255,255,255,0.9)] dark:shadow-none flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors">
                          <ModIcon className="w-5 h-5" strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h2 className="text-[14.5px] font-bold text-slate-800 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors truncate">
                              {isRu ? mod.titleRu : mod.titleTr}
                            </h2>
                            {mod.brandLogo && <BrandBadge kind={mod.brandLogo} size="sm" />}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                            {isRu ? mod.descRu : mod.descTr}
                          </p>
                        </div>
                      </div>

                      {(mod.badgeTr || mod.badgeRu) && (
                        <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/70">
                          {isRu ? mod.badgeRu : mod.badgeTr}
                        </span>
                      )}
                    </button>

                    {/* Sub-Tab Direct Shortcuts List (1C Desktop style + Hover elevation + Dark Tooltip) */}
                    <div className="mt-3 space-y-1.5">
                      {mod.subTabs.map((st) => {
                        const isPinned = pinnedIds.includes(st.id);
                        const showTip = hoveredTip === st.id;
                        const badgeCls =
                          st.badgeTone === 'rose'
                            ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : st.badgeTone === 'amber'
                            ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                        return (
                          <div
                            key={st.id}
                            className="relative"
                            onMouseEnter={() => setHoveredTip(st.id)}
                            onMouseLeave={() => setHoveredTip((cur) => (cur === st.id ? null : cur))}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => onNavigate(st.pageId, st.subTabId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onNavigate(st.pageId, st.subTabId);
                                }
                              }}
                              className="group/row w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F4EFE6]/85 dark:bg-slate-800/45 border border-transparent hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-400/80 dark:hover:border-emerald-500/60 hover:-translate-y-0.5 hover:shadow-[4px_6px_14px_rgba(5,150,105,0.12),-2px_-2px_8px_rgba(255,255,255,0.9)] dark:hover:shadow-[0_6px_16px_rgba(0,0,0,0.45)] active:translate-y-0 transition-all duration-150 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 group-hover/row:bg-emerald-600 group-hover/row:scale-125 transition-all shrink-0" />
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 group-hover/row:text-emerald-800 dark:group-hover/row:text-emerald-300 truncate">
                                  {isRu ? st.labelRu : st.labelTr}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {st.badge && (
                                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${badgeCls}`}>
                                    {st.badge}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => togglePin(st.id, e)}
                                  title={isPinned ? L('Sabitlemeyi kaldır', 'Убрать из избранного') : L('Üste sabitle', 'Закрепить в избранном')}
                                  className={`p-1 rounded-lg transition-opacity cursor-pointer ${
                                    isPinned
                                      ? 'opacity-100 text-amber-500'
                                      : 'opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-amber-500'
                                  }`}
                                >
                                  <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
                                </button>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover/row:text-emerald-600 group-hover/row:translate-x-0.5 transition-all" />
                              </div>
                            </div>

                            {/* Image 2 Dark Pill Tooltip */}
                            {showTip && (
                              <div className="pointer-events-none hidden sm:block absolute left-3 right-3 -top-2 -translate-y-full z-30">
                                <div className="inline-block max-w-full px-3 py-1.5 rounded-xl bg-[#1E2925] dark:bg-slate-950 text-[#F7F4ED] text-[11px] leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.28)] border border-emerald-500/30">
                                  {isRu ? st.tooltipRu : st.tooltipTr}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FOOTER CAPABILITY SUMMARY BANNER */}
        <div className={`${raisedCardCls} rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {L(
                'Sol menüyü (Sidebar) dilediğiniz zaman sol üstten genişletebilir veya bu Çalışma Masası\'na (Ana Sayfa) geri dönebilirsiniz.',
                'Боковое меню можно в любой момент раскрыть слева или вернуться на этот Рабочий стол (Главная).'
              )}
            </span>
          </div>
          <span className="font-mono text-[10.5px] text-emerald-700 dark:text-emerald-400 font-semibold">
            1C:ЗУП · eBA · Госуслуги · ФНС · Zoho Mail · AI OCR
          </span>
        </div>
      </div>
    </div>
  );
}
