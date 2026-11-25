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
  X,
  ArrowUpRight,
  Layers,
  Cpu,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { StatsData } from '@/types';

interface HomeCommandViewProps {
  stats: StatsData | null;
  onNavigate: (pageId: string, subTabId?: string) => void;
  onOpenCommandPalette?: () => void;
}

interface SubLink {
  id: string;
  pageId: string;
  subTabId?: string;
  labelTr: string;
  labelRu: string;
  tooltipTr: string;
  tooltipRu: string;
  keywords: string;
  badge?: string;
  badgeTone?: 'emerald' | 'amber' | 'rose';
}

interface SectionBlock {
  id: string;
  pageId: string;
  titleTr: string;
  titleRu: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  iconColorCls: string;
  logoSrc?: string;
  badgeTr?: string;
  badgeRu?: string;
  hideForViewer?: boolean;
  links: SubLink[];
}

interface GroupContainer {
  id: 'automations' | 'reports' | 'operations';
  titleTr: string;
  titleRu: string;
  subtitleTr: string;
  subtitleRu: string;
  accentIcon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
  accentBgCls: string;
  sections: SectionBlock[];
}

/* Crisp 1C:ZUP and AI OCR vector emblems (Gosuslugi, FNS, Zoho Mail, eBA use real high-res files from /logos/) */
function OneCLogoBadge({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="1C:ЗУП">
      <rect width="40" height="40" rx="10" fill="#FFD600" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" stroke="#E0B400" strokeWidth="1.5" />
      <text x="20" y="25.5" textAnchor="middle" fill="#D51D29" fontSize="16.5" fontWeight="900" fontFamily="sans-serif" letterSpacing="-0.5">1С</text>
      <rect x="7" y="29" width="26" height="2.4" rx="1.2" fill="#D51D29" />
    </svg>
  );
}

function AiOcrLogoBadge({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-label="AI OCR">
      <rect width="40" height="40" rx="10" fill="#059669" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" stroke="#047857" strokeWidth="1.5" />
      <path d="M20 8.5L22.8 16.2L30.5 19L22.8 21.8L20 29.5L17.2 21.8L9.5 19L17.2 16.2L20 8.5Z" fill="#ECFDF5" />
      <circle cx="29.5" cy="11" r="2.2" fill="#A7F3D0" />
    </svg>
  );
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
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([
    'patent_ndfl:overview',
    'gosuslugi:vks',
    'overview:main',
    'personnel:list',
  ]);
  const [patentStats, setPatentStats] = useState<{
    offsetRate: number;
    noNotifCount: number;
    vozvratCount: number;
  } | null>(null);

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

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 7);
      try {
        localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isViewer = user?.role === 'viewer';
  const isIdariOnly = user?.role === 'idari_isler';

  /* Top Folding / Expanding Connected Systems Logo Deck */
  const integrationCards = [
    {
      id: 'gosuslugi',
      name: 'Госуслуги (МВД)',
      subTr: 'VKS, Giriş/Çıkış & Kayıt RPA',
      subRu: 'ВКС, приём/увольнение RPA',
      statusTr: 'RPA Hazır',
      statusRu: 'RPA готов',
      imgSrc: '/logos/gosuslugi.svg',
      imgCls: 'h-7 w-auto max-w-[44px] object-contain',
      pageId: 'gosuslugi',
      subTabId: 'vks',
    },
    {
      id: 'fns',
      name: 'ФНС России',
      subTr: 'ИНН Sorgu & КНД 1110055 XML',
      subRu: 'Проверка ИНН и XML КНД',
      statusTr: 'Otomatik',
      statusRu: 'Автосверка',
      imgSrc: '/logos/fns.svg',
      imgCls: 'h-8 w-8 object-contain',
      pageId: 'inn_snils',
      subTabId: 'verify',
    },
    {
      id: '1c',
      name: '1C:ЗУП 3.1',
      subTr: 'Canlı OData · Bordro & Fişler',
      subRu: 'OData онлайн · Чеки и НДФЛ',
      statusTr: stats?.systemInfo?.zup_data_freshness || 'Canlı OData',
      statusRu: stats?.systemInfo?.zup_data_freshness || 'OData онлайн',
      customLogo: <OneCLogoBadge className="w-8 h-8" />,
      pageId: 'patent_ndfl',
      subTabId: 'import_odata',
    },
    {
      id: 'eba',
      name: 'eBA Workflow',
      subTr: 'Personel & Evrak Senkronu',
      subRu: 'Синхр. персонала и сканов',
      statusTr: stats?.systemInfo?.data_freshness || 'Senkron',
      statusRu: stats?.systemInfo?.data_freshness || 'Синхр.',
      imgSrc: '/logos/eba.svg',
      imgCls: 'h-8 w-auto max-w-[48px] object-contain rounded-lg',
      pageId: 'official_real',
      subTabId: undefined,
    },
    {
      id: 'zoho',
      name: 'Zoho Mail',
      subTr: 'Davetiye PDF & Uyarı Maili',
      subRu: 'Приглашения МВД и почта',
      statusTr: 'IMAP / SMTP',
      statusRu: 'IMAP / SMTP',
      imgSrc: '/logos/zoho-mail.png',
      imgCls: 'h-8 w-8 object-contain rounded-md',
      pageId: isViewer ? 'invitations' : 'settings',
      subTabId: isViewer ? 'applications' : 'mail_notifications',
    },
    {
      id: 'ai',
      name: 'AI OCR & RPA',
      subTr: 'DeepSeek · Gemini Fiş/Bilet',
      subRu: 'DeepSeek · Gemini OCR чеков',
      statusTr: 'Aktif Motor',
      statusRu: 'Активен',
      customLogo: <AiOcrLogoBadge className="w-8 h-8" />,
      pageId: 'travel_tickets',
      subTabId: 'live_scanner',
    },
  ];

  /* 3 Compact 1C-Style Containers: (1 Left) Raporlar + Davetiye + Kota, (2 Center) Otomasyonlar & RPA (Patent at bottom), (3 Right) Personel, Operasyon & Ayarlar */
  const groups: GroupContainer[] = useMemo(
    () => [
      {
        id: 'reports',
        titleTr: 'Raporlar & İK Analitik',
        titleRu: 'Отчёты и HR-аналитика',
        subtitleTr: 'KPI · Turnover · Harita · Evrak · Davetiye · Kotalar',
        subtitleRu: 'KPI · Текучесть · Карта · Сроки · Приглашения · Квоты',
        accentIcon: Layers,
        accentBgCls: 'bg-teal-600 text-white',
        sections: [
          {
            id: 'core_dashboards',
            pageId: 'overview',
            titleTr: 'Yönetici Dashboards & Harita',
            titleRu: 'Дашборды руководителя и Карта',
            icon: LayoutDashboard,
            iconColorCls: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60',
            links: [
              {
                id: 'overview:main',
                pageId: 'overview',
                labelTr: 'Genel Dashboard (Çapraz Filtreli KPI)',
                labelRu: 'Главная панель KPI (кросс-фильтры)',
                tooltipTr: 'Aktif kadro, uyruk, yaka tipi, proje ve departman etkileşimli özet.',
                tooltipRu: 'Интерактивные графики по штату, гражданству и объектам.',
                keywords: 'dashboard özet kpi grafik genel',
              },
              {
                id: 'turnover:main',
                pageId: 'turnover',
                labelTr: 'Yönetim & Turnover (İşe Giriş / Çıkış)',
                labelRu: 'Текучесть кадров и движение персонала',
                tooltipTr: 'Aylık devir hızı, ayrılma nedenleri, şantiye bazlı kıdem ve giriş-çıkış.',
                tooltipRu: 'Анализ приёма, увольнений, текучести и стажа.',
                keywords: 'turnover devir çıkış giriş yönetim rapor',
              },
              {
                id: 'demographics:main',
                pageId: 'demographics',
                labelTr: 'Demografi & Rusya Şantiye Haritası',
                labelRu: 'Демография и карта объектов РФ',
                tooltipTr: 'Rusya haritası üzerinde canlı proje dağılımı, yaş, cinsiyet ve uyruk.',
                tooltipRu: 'Карта объектов РФ, возраст, пол и гражданство.',
                keywords: 'harita demografi uyruk yaş bölge',
              },
            ],
          },
          {
            id: 'official_real',
            pageId: 'official_real',
            titleTr: 'Resmi vs Reel Karşılaştırma',
            titleRu: 'Сверка 1С:ЗУП ↔ eBA',
            icon: Scale,
            iconColorCls: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/60',
            logoSrc: '/logos/eba.svg',
            links: [
              {
                id: 'official_real:main',
                pageId: 'official_real',
                labelTr: '1C:ЗУП Resmi Kadro ↔ eBA Saha Farkı',
                labelRu: 'Расхождения штата 1С:ЗУП и eBA',
                tooltipTr: '1C resmi bordro kayıtları ile eBA saha personeli arasındaki farkları anında yakalar.',
                tooltipRu: 'Сравнение официального штата 1С с фактическим учётом eBA.',
                keywords: '1c zup eba resmi reel fark karşılaştırma',
              },
            ],
          },
          {
            id: 'compliance',
            pageId: 'compliance',
            titleTr: 'Evrak & Süre Analitiği',
            titleRu: 'Аналитика сроков документов',
            icon: FileCheck2,
            iconColorCls: 'bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 border-orange-200/80 dark:border-orange-800/60',
            links: [
              {
                id: 'compliance:expiry',
                pageId: 'compliance',
                subTabId: 'expiry',
                labelTr: 'Süresi Dolacak Evraklar (30/60/90 Gün)',
                labelRu: 'Истекающие документы (30/60/90 дн.)',
                tooltipTr: 'Pasaport, vize, patent, çalışma izni bitiş alarmları ve acil aksiyonlar.',
                tooltipRu: 'Контроль сроков действия паспортов, виз, патентов и РНР.',
                keywords: 'evrak süre pasaport vize patent bitiş',
              },
              {
                id: 'compliance:standby',
                pageId: 'compliance',
                subTabId: 'standby',
                labelTr: 'İzinli / Beklemede (Standby) Takibi',
                labelRu: 'Отпуска, межвахта и ожидание (Standby)',
                tooltipTr: 'İzinde veya şantiye rotasyonu bekleyen personellerin analizi.',
                tooltipRu: 'Учёт сотрудников в отпуске и на межвахте.',
                keywords: 'standby izin bekleme rotasyon',
              },
              {
                id: 'compliance:scans',
                pageId: 'compliance',
                subTabId: 'scans',
                labelTr: 'Eksik Evrak Taramaları Kontrolü',
                labelRu: 'Контроль отсутствующих сканов',
                tooltipTr: 'Dijital dosyasında taraması eksik pasaport/patent belgelerini listeler.',
                tooltipRu: 'Список сотрудников без загруженных сканов документов.',
                keywords: 'tarama eksik scan dosya',
              },
            ],
          },
          {
            id: 'report_proposals',
            pageId: 'report_proposals',
            titleTr: 'Stratejik Raporlar (7 Sekme)',
            titleRu: 'Стратегические отчёты (7 вкл.)',
            icon: Sparkles,
            iconColorCls: 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/60',
            links: [
              {
                id: 'report_proposals:health',
                pageId: 'report_proposals',
                subTabId: 'health',
                labelTr: 'İK Sağlık Skoru & Proje Risk Matrisi',
                labelRu: 'Индекс здоровья HR и матрица рисков',
                tooltipTr: 'Şantiyelerin evrak, uyumluluk ve kadro sağlık puanları.',
                tooltipRu: 'Оценка объектов по кадровому здоровью и рискам.',
                keywords: 'sağlık skor risk matris',
              },
              {
                id: 'report_proposals:sla',
                pageId: 'report_proposals',
                subTabId: 'sla',
                labelTr: 'Süreç SLA & Darboğaz Analizi',
                labelRu: 'SLA процессов и узкие места',
                tooltipTr: 'İşe alım ve vize süreçlerindeki bekleme/onay süreleri.',
                tooltipRu: 'Контроль сроков согласования и задержек.',
                keywords: 'sla gecikme darboğaz',
              },
              {
                id: 'report_proposals:legal',
                pageId: 'report_proposals',
                subTabId: 'legal',
                labelTr: 'Hukuki Ceza Riski (МВД Uyum)',
                labelRu: 'Юридические риски и штрафы МВД',
                tooltipTr: 'Göçmenlik mevzuatı kaynaklı olası ceza riski hesaplaması.',
                tooltipRu: 'Оценка потенциальных штрафов и миграционных рисков.',
                keywords: 'hukuk ceza mvd risk',
              },
              {
                id: 'report_proposals:ndfl',
                pageId: 'report_proposals',
                subTabId: 'ndfl',
                labelTr: 'НДФЛ %13 / %30 Vergi Avantajı (183 Gün)',
                labelRu: 'Налоговая выгода НДФЛ 13% / 30% (183 дн.)',
                tooltipTr: 'Vergi mukimi (резидент) geçişlerini ve 183 gün takibini gösterir.',
                tooltipRu: 'Контроль статуса налогового резидента РФ (183 дня).',
                keywords: 'ndfl vergi 13 30 183 rezident',
              },
              {
                id: 'report_proposals:mobility',
                pageId: 'report_proposals',
                subTabId: 'mobility',
                labelTr: 'Mobilite, Vardiya & Veri Kalitesi',
                labelRu: 'Мобильность, вахта и качество данных',
                tooltipTr: 'Şantiyeler arası transferler, vardiya dengesi ve veri kalitesi.',
                tooltipRu: 'Перемещения между объектами, вахты и полнота данных.',
                keywords: 'mobilite vardiya kalite',
              },
            ],
          },
          {
            id: 'invitations',
            pageId: 'invitations',
            titleTr: 'Davetiye Takip (Zoho Mail • МВД)',
            titleRu: 'Приглашения (Zoho Mail • МВД)',
            icon: Mail,
            iconColorCls: 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60',
            logoSrc: '/logos/zoho-mail.png',
            links: [
              {
                id: 'invitations:applications',
                pageId: 'invitations',
                subTabId: 'applications',
                labelTr: 'Zoho Mail Davetiye Eşleştirme',
                labelRu: 'Заявки из Zoho Mail и сверка ФИО',
                tooltipTr: 'Zoho Mail IMAP üzerinden gelen МВД davetiyelerini personelle eşleştirir.',
                tooltipRu: 'Автоматический сбор электронных приглашений МВД из Zoho Mail.',
                keywords: 'davetiye invitation zoho mail mvd vize',
              },
              {
                id: 'invitations:mvd_pdfs',
                pageId: 'invitations',
                subTabId: 'mvd_pdfs',
                labelTr: 'Arşivlenmiş МВД Davetiye PDF\'leri',
                labelRu: 'Архив электронных PDF-приглашений МВД',
                tooltipTr: 'İndirilmiş tüm МВД elektronik davetiye PDF\'leri ve toplu gönderim.',
                tooltipRu: 'Сохранённые PDF-приглашения МВД и рассылка.',
                keywords: 'davetiye pdf mvd arşiv',
              },
            ],
          },
          {
            id: 'quotas',
            pageId: 'quotas',
            titleTr: 'Çalışma Kotaları (ИРС)',
            titleRu: 'Квоты на работу (ИРС)',
            icon: Briefcase,
            iconColorCls: 'bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border-teal-200/80 dark:border-teal-800/60',
            links: [
              {
                id: 'quotas:region_irs',
                pageId: 'quotas',
                subTabId: 'region_irs',
                labelTr: 'Bölge & ИРС Kota Kullanım Özeti',
                labelRu: 'Использование квот по регионам и ИРС',
                tooltipTr: 'Bölge bazlı toplam onaylı, kullanılan ve kalan kontenjanlar.',
                tooltipRu: 'Выделенные, использованные и свободные квоты по регионам.',
                keywords: 'kota irs bölge kontenjan',
              },
              {
                id: 'quotas:ozet_pivot',
                pageId: 'quotas',
                subTabId: 'ozet_pivot',
                labelTr: 'Ülke / Bölge Pivot & ИРС Sertifikaları',
                labelRu: 'Сводный пивот и сертификаты ИРС',
                tooltipTr: 'Uyruk ve bölge kırılımında kota pivot tablosu ve ИРС belgeleri.',
                tooltipRu: 'Пивот по гражданству и реестр сертификатов ИРС.',
                keywords: 'kota pivot sertifika irs',
              },
              {
                id: 'quotas:codes_guide',
                pageId: 'quotas',
                subTabId: 'codes_guide',
                labelTr: 'Dosya Verileri & Meslek Kodları Rehberi',
                labelRu: 'Файлы квот и справочник кодов ОКПДТР',
                tooltipTr: 'Resmi Rusça meslek kodları, ülke kodları ve Excel kota içe aktarma.',
                tooltipRu: 'Коды профессий ОКПДТР, стран и импорт файлов.',
                keywords: 'kota kod meslek okpdtr rehber',
              },
            ],
          },
        ],
      },
      {
        id: 'automations',
        titleTr: 'Otomasyonlar, RPA & Devlet Servisleri',
        titleRu: 'Автоматизации, RPA и Госсервисы',
        subtitleTr: 'Госуслуги · ФНС · 1C:ЗУП Patent & НДФЛ',
        subtitleRu: 'Госуслуги · ФНС · 1С:ЗУП Патент и НДФЛ',
        accentIcon: Cpu,
        accentBgCls: 'bg-emerald-600 text-white',
        sections: [
          {
            id: 'gosuslugi',
            pageId: 'gosuslugi',
            titleTr: 'Gosuslugi RPA Robotu (МВД)',
            titleRu: 'Робот Госуслуги (МВД • RPA)',
            icon: Bot,
            iconColorCls: 'bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/60',
            logoSrc: '/logos/gosuslugi.svg',
            badgeTr: '5 Sekme',
            badgeRu: '5 вкл.',
            links: [
              {
                id: 'gosuslugi:vks',
                pageId: 'gosuslugi',
                subTabId: 'vks',
                labelTr: '1. VKS Çeyreklik Maaş Bildirimi (RPA)',
                labelRu: '1. ВКС Ежеквартальное уведомление (RPA)',
                tooltipTr: 'Госуслуги portalından çeyreklik VKS maaş bildirimlerini robotla gönderme.',
                tooltipRu: 'Роботизированная подача квартальных уведомлений ВКС и сбор PDF.',
                keywords: 'gosuslugi госуслуги vks вкс rpa robot maaş',
              },
              {
                id: 'gosuslugi:hiring',
                pageId: 'gosuslugi',
                subTabId: 'hiring',
                labelTr: '2. İşe Alım Bildirimi (Приём · 600585/1)',
                labelRu: '2. Приём на работу (600585/1)',
                tooltipTr: 'Yabancı personel işe alımında МВД/Госуслуги otomatik 3 gün bildirimi.',
                tooltipRu: 'Подача уведомления о заключении трудового договора в МВД.',
                keywords: 'gosuslugi işe alım giriş приём mvd',
              },
              {
                id: 'gosuslugi:dismissal',
                pageId: 'gosuslugi',
                subTabId: 'dismissal',
                labelTr: '3. İşten Çıkış Bildirimi (Увольнение)',
                labelRu: '3. Увольнение (Расторжение · 600585/1)',
                tooltipTr: 'İşten ayrılan yabancı personellerin МВД fesih bildirimi ve robot gönderimi.',
                tooltipRu: 'Подача уведомления о расторжении договора в МВД.',
                keywords: 'gosuslugi çıkış увольнение fesih mvd',
              },
              {
                id: 'gosuslugi:registration',
                pageId: 'gosuslugi',
                subTabId: 'registration',
                labelTr: '4. Göçmenlik Kaydı (Registre · 600380/1)',
                labelRu: '4. Регистрация (Миграционный учёт)',
                tooltipTr: 'Lojman/kamp adresine göre Госуслуги üzerinden ikamet kayıt otomasyonu.',
                tooltipRu: 'Постановка на миграционный учёт через Госуслуги.',
                keywords: 'gosuslugi registre kayıt регистрация ikamet',
              },
              {
                id: 'gosuslugi:analytics',
                pageId: 'gosuslugi',
                subTabId: 'analytics',
                labelTr: '5. VKS İstatistik & МВД Onay Analizi',
                labelRu: '5. ВКС Статистика и Аналитика МВД',
                tooltipTr: 'Çeyreklik VKS gönderim oranları, onaylanan/reddedilen bildirim grafikleri.',
                tooltipRu: 'Графики и статистика поданных, принятых и отклонённых уведомлений ВКС.',
                keywords: 'vks istatistik analiz grafik mvd gosuslugi',
              },
            ],
          },
          {
            id: 'inn_snils',
            pageId: 'inn_snils',
            titleTr: 'INN & SNILS Kontrol (ФНС • СФР)',
            titleRu: 'ИНН и СНИЛС (ФНС • СФР)',
            icon: ShieldCheck,
            iconColorCls: 'bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60',
            logoSrc: '/logos/fns.svg',
            links: [
              {
                id: 'inn_snils:verify',
                pageId: 'inn_snils',
                subTabId: 'verify',
                labelTr: 'Toplu ФНС ИНН Doğrulama & Sorgu',
                labelRu: 'Массовая проверка ИНН в ФНС России',
                tooltipTr: 'Pasaport bilgilerinden ФНС veritabanında 12 haneli ИНН otomatik doğrulama.',
                tooltipRu: 'Автоматический запрос ИНН через сервис ФНС России.',
                keywords: 'inn инн fns фнс snils doğrulama',
              },
              {
                id: 'inn_snils:apply',
                pageId: 'inn_snils',
                subTabId: 'apply',
                labelTr: 'Eksik ИНН / СНИЛС Başvuru Listesi',
                labelRu: 'Заявки на оформление ИНН и СНИЛС',
                tooltipTr: 'ИНН veya СНИЛС kaydı eksik çalışanların başvuru takibi.',
                tooltipRu: 'Очередь сотрудников на получение ИНН / СНИЛС.',
                keywords: 'inn snils başvuru eksik sfr',
              },
              {
                id: 'inn_snils:analytics',
                pageId: 'inn_snils',
                subTabId: 'analytics',
                labelTr: 'Şantiye Bazlı ИНН/СНИЛС Kapsama Analitiği',
                labelRu: 'Аналитика обеспеченности ИНН / СНИЛС',
                tooltipTr: 'Proje bazında ИНН ve СНИЛС tamamlanma yüzdeleri.',
                tooltipRu: 'Процент наличия ИНН и СНИЛС по объектам.',
                keywords: 'inn snils analitik grafik',
              },
            ],
          },
          {
            id: 'patent_ndfl',
            pageId: 'patent_ndfl',
            titleTr: 'SNG Patent & НДФЛ Mahsup',
            titleRu: 'Патент и НДФЛ (1С • ФНС)',
            icon: Receipt,
            iconColorCls: 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60',
            badgeTr: patentStats ? `%${patentStats.offsetRate}` : '1C',
            badgeRu: patentStats ? `%${patentStats.offsetRate}` : '1С',
            links: [
              {
                id: 'patent_ndfl:overview',
                pageId: 'patent_ndfl',
                subTabId: 'overview',
                labelTr: '1. Patent İade Özeti & Proje/Bölge Analizi',
                labelRu: '1. Сводка зачёта, объекты и ИФНС',
                tooltipTr: 'Speedometer mahsup göstergesi, kök neden, şantiye ve İFNS bölge dağılımı.',
                tooltipRu: 'Индикатор зачёта, причины потерь, разбивка по объектам и ИФНС.',
                keywords: 'patent ndfl özet speedometer proje ifns',
                badge: patentStats ? `%${patentStats.offsetRate}` : undefined,
                badgeTone: 'emerald',
              },
              {
                id: 'patent_ndfl:reconciliation',
                pageId: 'patent_ndfl',
                subTabId: 'reconciliation',
                labelTr: '2. Kişi Bazlı 12 Aylık Detay & Fişler',
                labelRu: '2. Детализация по сотрудникам (12 мес.)',
                tooltipTr: '711 çalışan için ay-ay patent avansı, 1C fiş giriş tarihi ve mahsup analizi.',
                tooltipRu: 'Помесячная сверка чеков, дат внесения в 1С и зачтённого НДФЛ.',
                keywords: 'kişi detay aylık fiş mahsup 1c',
              },
              {
                id: 'patent_ndfl:notifications',
                pageId: 'patent_ndfl',
                subTabId: 'notifications',
                labelTr: '3. ФНС Bildirim Takip & КНД 1110055 XML',
                labelRu: '3. Уведомления ФНС и XML КНД 1110055',
                tooltipTr: 'ФНС izni eksik kişiler, toplu КНД 1110055 XML üretimi ve PDF okuma.',
                tooltipRu: 'Сотрудники без уведомления, генерация XML КНД 1110055 и разбор PDF.',
                keywords: 'fns bildirim уведомление xml knd 1110055',
                badge: patentStats && patentStats.noNotifCount > 0 ? `${patentStats.noNotifCount}` : undefined,
                badgeTone: 'rose',
              },
              {
                id: 'patent_ndfl:vozvrat',
                pageId: 'patent_ndfl',
                subTabId: 'vozvrat',
                labelTr: '4. Возврат НДФЛ (ст. 231) İade Dosyası',
                labelRu: '4. Возврат НДФЛ (ст. 231 НК РФ)',
                tooltipTr: 'Yıl sonu iade tutarı, ЕНС/6-НДФЛ 4 adım rehberi ve toplu dilekçe yazdırma.',
                tooltipRu: 'Расчёт возврата, регламент ЕНС/6-НДФЛ и печать заявлений.',
                keywords: 'vozvrat возврат iade 231 dilekçe 6-ndfl',
                badge: patentStats && patentStats.vozvratCount > 0 ? `${patentStats.vozvratCount}` : undefined,
                badgeTone: 'amber',
              },
              {
                id: 'patent_ndfl:import_odata',
                pageId: 'patent_ndfl',
                subTabId: 'import_odata',
                labelTr: '5. 1C OData Bağlantı & Toplu AI Fiş Yükle',
                labelRu: '5. 1С OData и AI-загрузка чеков',
                tooltipTr: '1C:ЗУП canlı senkronizasyon, ZIP/PDF fişleri okuyup 1C\'ye taslak/onaylı aktarma.',
                tooltipRu: 'Настройка 1С OData и массовая загрузка сканов чеков в 1С.',
                keywords: 'odata 1c fiş yükle zip pdf ai ocr',
              },
            ],
          },
        ],
      },
      {
        id: 'operations',
        titleTr: 'Personel, Operasyon & Ayarlar',
        titleRu: 'Персонал, Операции и Настройки',
        subtitleTr: 'Özlük · Şema · Sahalar · AI Bilet · 3D Kamp · Zoho & AI Ayarları',
        subtitleRu: 'Реестр · Оргструктура · Объекты · Билеты · 3D Городок · Настройки',
        accentIcon: SlidersHorizontal,
        accentBgCls: 'bg-slate-700 text-white',
        sections: [
          {
            id: 'people_sites',
            pageId: 'personnel',
            titleTr: 'Personel, Organizasyon & Sahalar',
            titleRu: 'Персонал, Оргструктура и Объекты',
            icon: Users,
            iconColorCls: 'bg-cyan-100 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 border-cyan-200/80 dark:border-cyan-800/60',
            badgeTr: stats?.totalCount ? `${stats.totalCount.toLocaleString('tr-TR')}` : undefined,
            badgeRu: stats?.totalCount ? `${stats.totalCount.toLocaleString('ru-RU')}` : undefined,
            links: [
              {
                id: 'personnel:list',
                pageId: 'personnel',
                labelTr: 'Personel Listesi & Dijital Özlük Kartı',
                labelRu: 'Список персонала и личные карточки',
                tooltipTr: 'Tüm aktif ve çıkışlı çalışanların tam arama, filtre ve Excel çıktısı.',
                tooltipRu: 'Поиск по ФИО, табельному, паспорту, объекту и экспорт Excel.',
                keywords: 'personel çalışan liste sicil pasaport kart',
              },
              {
                id: 'org_chart:main',
                pageId: 'org_chart',
                labelTr: 'Organizasyon Şeması (İnteraktif Ağaç)',
                labelRu: 'Организационная структура (Дерево)',
                tooltipTr: 'Yakınlaştırılabilir şirket, şantiye ve ekip hiyerarşisi.',
                tooltipRu: 'Интерактивное дерево подразделений и подчинённости.',
                keywords: 'organizasyon şema hiyerarşi ağaç',
              },
              {
                id: 'sites:main',
                pageId: 'sites',
                labelTr: 'Şantiye & Projeler (11 Aktif Saha)',
                labelRu: 'Участки и Проекты (11 объектов)',
                tooltipTr: 'Ust-Luga, Amur, Kazan, Tobolsk, Irkutsk saha kadro özetleri.',
                tooltipRu: 'Численность и состав каждого строительного объекта.',
                keywords: 'şantiye proje saha ust-luga amur kazan',
              },
            ],
          },
          {
            id: 'powerise_ops',
            pageId: 'travel_tickets',
            titleTr: 'İdari İşler, Kamp & Powerise',
            titleRu: 'АХО: Билеты, 3D Городок и Powerise',
            icon: Plane,
            iconColorCls: 'bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border-violet-200/80 dark:border-violet-800/60',
            links: [
              {
                id: 'travel_tickets:live_scanner',
                pageId: 'travel_tickets',
                subTabId: 'live_scanner',
                labelTr: 'AI Bilet Tarayıcı (Uçak / Tren OCR)',
                labelRu: 'AI-сканер авиа- и ж/д билетов',
                tooltipTr: 'DeepSeek / Gemini OCR ile biletlerden yolcu, PNR, rota ve tutar okuma.',
                tooltipRu: 'Распознавание ФИО, паспорта, рейса, маршрута и цены билета.',
                keywords: 'bilet uçak tren ai ocr deepseek seyahat',
              },
              {
                id: 'camp_management:explorer_3d',
                pageId: 'camp_management',
                subTabId: 'explorer_3d',
                labelTr: 'Kamp & Lojman Yönetimi (3D Harita)',
                labelRu: 'Управление городками (3D-карта)',
                tooltipTr: '3D blok/kat/oda doluluk haritası, kapasite ve sakin atama.',
                tooltipRu: '3D-визуализация корпусов, комнат и заселения.',
                keywords: 'kamp lojman 3d oda yatak',
              },
              {
                id: 'camp_management:tables',
                pageId: 'camp_management',
                subTabId: 'tables',
                labelTr: 'Lojman Oda, Sakin & Atanmamış Listesi',
                labelRu: 'Таблицы комнат и жильцов городка',
                tooltipTr: 'Oda envanteri, kalan çalışanlar ve boş yatak listesi.',
                tooltipRu: 'Реестр комнат, проживающих и свободных мест.',
                keywords: 'kamp tablo sakin oda envanter',
              },
              {
                id: 'powerise_tech:main',
                pageId: 'powerise_tech',
                labelTr: 'Powerise Mobil NFC & Saha Vitrini',
                labelRu: 'Powerise Мобильная витрина (NFC)',
                tooltipTr: 'NFC pasaport okuyucu, GPS poligon ve Powerise modül tanıtımı.',
                tooltipRu: 'Обзор мобильных решений Powerise NFC и GPS.',
                keywords: 'powerise mobil nfc vitrin video',
              },
            ],
          },
          {
            id: 'settings',
            pageId: 'settings',
            titleTr: 'Ayarlar & Sistem Yönetimi',
            titleRu: 'Настройки и Администрирование',
            icon: Settings,
            iconColorCls: 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300/80 dark:border-slate-700',
            hideForViewer: true,
            links: [
              {
                id: 'settings:users_rls',
                pageId: 'settings',
                subTabId: 'users_rls',
                labelTr: 'Kullanıcılar & Rol Yetkileri (RLS)',
                labelRu: 'Пользователи и права доступа (RLS)',
                tooltipTr: 'Admin, uzman, şantiye yöneticisi ve izleyici erişim yetkileri.',
                tooltipRu: 'Управление ролями и правами доступа к объектам.',
                keywords: 'ayarlar kullanıcı rol yetki rls admin',
              },
              {
                id: 'settings:database_excel',
                pageId: 'settings',
                subTabId: 'database_excel',
                labelTr: '1C / eBA Veritabanı & Excel Yükleme',
                labelRu: 'База данных 1С / eBA и импорт Excel',
                tooltipTr: 'Canlı SQLite veritabanı yenileme ve Excel senkronizasyonu.',
                tooltipRu: 'Обновление базы данных и загрузка выгрузок Excel.',
                keywords: 'veritabanı database excel 1c eba',
              },
              {
                id: 'settings:mail_notifications',
                pageId: 'settings',
                subTabId: 'mail_notifications',
                labelTr: 'Zoho Mail Otomasyon & Bildirimler',
                labelRu: 'Zoho Mail и автоматические рассылки',
                tooltipTr: 'Zoho SMTP/IMAP bağlantı ayarları ve otomatik uyarı mailleri.',
                tooltipRu: 'Настройка Zoho Mail SMTP/IMAP и автоуведомлений.',
                keywords: 'zoho mail smtp imap bildirim',
              },
              {
                id: 'settings:ai_settings',
                pageId: 'settings',
                subTabId: 'ai_settings',
                labelTr: 'Yapay Zeka (DeepSeek · Gemini · OCR)',
                labelRu: 'Настройки AI (DeepSeek · Gemini · OCR)',
                tooltipTr: 'DeepSeek V4.1 Flash, SiliconFlow ve Gemini API anahtarları ve testi.',
                tooltipRu: 'API-ключи DeepSeek, Gemini и тест OCR-моделей.',
                keywords: 'ai deepseek gemini ocr api key',
              },
            ],
          },
        ],
      },
    ],
    [stats, patentStats]
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => {
        const secs = g.sections
          .filter((s) => {
            if (isIdariOnly) return s.id === 'powerise_ops';
            if (isViewer && s.hideForViewer) return false;
            return true;
          })
          .map((s) => {
            if (!q) return s;
            const secMatch = `${s.titleTr} ${s.titleRu}`.toLowerCase().includes(q);
            const matchedLinks = s.links.filter((lk) =>
              `${lk.labelTr} ${lk.labelRu} ${lk.tooltipTr} ${lk.tooltipRu} ${lk.keywords}`.toLowerCase().includes(q)
            );
            if (secMatch) return s;
            if (matchedLinks.length > 0) return { ...s, links: matchedLinks };
            return null;
          })
          .filter(Boolean) as SectionBlock[];
        if (secs.length === 0) return null;
        return { ...g, sections: secs };
      })
      .filter(Boolean) as GroupContainer[];
  }, [groups, isIdariOnly, isViewer, query]);

  const allLinksMap = useMemo(() => {
    const mp = new Map<string, SubLink>();
    for (const g of groups) {
      for (const s of g.sections) {
        if (isViewer && s.hideForViewer) continue;
        if (isIdariOnly && s.id !== 'powerise_ops') continue;
        for (const lk of s.links) mp.set(lk.id, lk);
      }
    }
    return mp;
  }, [groups, isViewer, isIdariOnly]);

  const pinnedLinks = useMemo(
    () => pinnedIds.map((id) => allLinksMap.get(id)).filter(Boolean) as SubLink[],
    [pinnedIds, allLinksMap]
  );

  /* Image 2 Warm-Cream Tactile Surfaces + Pondera Emerald Accents */
  const raisedCls =
    'bg-[#FAF7F1] dark:bg-[#11192B] border border-[#E6DDD0] dark:border-slate-700/75 ' +
    'shadow-[5px_5px_12px_rgba(162,149,128,0.20),-4px_-4px_10px_rgba(255,255,255,0.92)] ' +
    'dark:shadow-[0_6px_18px_rgba(0,0,0,0.40)]';

  const insetCls =
    'bg-[#EFE9DD] dark:bg-[#0B1222] border border-[#DFD6C5] dark:border-slate-700/80 ' +
    'shadow-[inset_3px_3px_6px_rgba(155,142,120,0.22),inset_-2px_-2px_6px_rgba(255,255,255,0.88)] ' +
    'dark:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.5)]';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#F3EEE4] dark:bg-[#0B1120] transition-colors duration-200">
      <div className="max-w-[1620px] mx-auto px-3 sm:px-5 lg:px-6 py-3.5 space-y-3.5">
        {/* TOP COMPACT BAR: FADE-IN HERO ARTWORK + FOLDING OFFICIAL LOGO DECK + INSET SEARCH + ACTIVE PILL */}
        <div className={`${raisedCls} relative rounded-2xl px-4 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 overflow-hidden`}>
          {/* Left: Softly Fading Custom Hero Illustration + Overlapping/Stacked Official Logo Cards */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="hidden md:flex items-center shrink-0 -ml-4 -my-2.5 h-[74px] w-[172px] overflow-hidden select-none pointer-events-none">
              <img
                src="/logos/home-hero-art.jpg"
                alt="Pondera HR Automation"
                style={{
                  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.38) 26%, rgba(0,0,0,0.96) 64%, rgba(0,0,0,0.92) 90%, transparent 100%)',
                  maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.38) 26%, rgba(0,0,0,0.96) 64%, rgba(0,0,0,0.92) 90%, transparent 100%)',
                }}
                className="w-full h-full object-cover object-right opacity-95 dark:opacity-80 dark:brightness-90"
              />
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mr-0.5 hidden sm:inline">
              {L('Canlı Otomasyonlar:', 'Интеграции:')}
            </span>
            <div className="flex items-center">
              {integrationCards.map((card, idx) => {
                const isOpen = hoveredBrand === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onMouseEnter={() => setHoveredBrand(card.id)}
                    onMouseLeave={() => setHoveredBrand((cur) => (cur === card.id ? null : cur))}
                    onClick={() => onNavigate(card.pageId, card.subTabId)}
                    style={{ zIndex: isOpen ? 30 : 10 + idx }}
                    className={`relative flex items-center rounded-2xl border transition-all duration-300 ease-out cursor-pointer overflow-hidden h-[54px] ${
                      idx > 0 && !isOpen ? '-ml-2.5 sm:-ml-2' : idx > 0 ? 'ml-1.5' : ''
                    } ${
                      isOpen
                        ? 'w-[242px] px-3 gap-2.5 mr-1.5 bg-white dark:bg-slate-800 border-emerald-500 shadow-[6px_8px_18px_rgba(5,150,105,0.22),-3px_-3px_10px_rgba(255,255,255,0.95)] dark:shadow-[0_10px_24px_rgba(16,185,129,0.24)] -translate-y-0.5'
                        : 'w-[60px] px-2 justify-center bg-[#FAF7F1] dark:bg-[#162035] border-[#E0D6C6] dark:border-slate-700 shadow-[4px_4px_10px_rgba(150,137,117,0.24),-3px_-3px_8px_rgba(255,255,255,0.92)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.45)] hover:border-emerald-400'
                    }`}
                    title={`${card.name} — ${isRu ? card.subRu : card.subTr}`}
                  >
                    {/* Logo tile + live green indicator dot */}
                    <div className="relative shrink-0 flex items-center justify-center">
                      {card.customLogo ? (
                        card.customLogo
                      ) : (
                        <img src={card.imgSrc} alt={card.name} className={card.imgCls} />
                      )}
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#FAF7F1] dark:ring-slate-800" />
                    </div>

                    {/* Expanding Content Panel (revealed smoothly on hover) */}
                    <div
                      className={`min-w-0 text-left transition-all duration-200 ${
                        isOpen ? 'opacity-100 max-w-[168px]' : 'opacity-0 max-w-0 pointer-events-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[12px] font-bold text-slate-800 dark:text-white truncate">
                          {card.name}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">
                        {isRu ? card.subRu : card.subTr}
                      </div>
                      <div className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                        ● {isRu ? card.statusRu : card.statusTr}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Compact Inset Search + Mini KPI Pills */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 xl:max-w-[540px] justify-end">
            <div className={`relative flex-1 min-w-[200px] rounded-xl ${insetCls} flex items-center px-3 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:border-emerald-500 transition-all`}>
              <Search className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0 mr-2" strokeWidth={2} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={L('Sekme veya otomasyon ara... (vks, vozvrat, knd, kota, zoho)', 'Поиск раздела... (вкс, возврат, кнд, квоты)')}
                className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500/80 dark:placeholder:text-slate-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-0.5 rounded-full hover:bg-black/5 text-slate-500 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('personnel')}
              className="px-2.5 py-1.5 rounded-xl bg-[#F4EFE6] dark:bg-slate-800 border border-[#E2D9C9] dark:border-slate-700 hover:border-emerald-400 transition-all text-left shrink-0 cursor-pointer"
            >
              <div className="text-[9px] font-bold uppercase text-slate-500 leading-none">{L('Aktif', 'Штат')}</div>
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono leading-tight mt-0.5">
                {(stats?.totalCount || 0).toLocaleString(isRu ? 'ru-RU' : 'tr-TR')}
              </div>
            </button>

            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="px-2.5 py-2 rounded-xl text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-[#FAF7F1] dark:bg-slate-800 border border-[#DFD6C5] dark:border-slate-700 hover:border-emerald-500 transition-all shrink-0 cursor-pointer"
                title="Ctrl + K"
              >
                Ctrl+K
              </button>
            )}
          </div>
        </div>

        {/* COMPACT PINNED FAVORITES STRIP */}
        {pinnedLinks.length > 0 && !query && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1 mr-0.5">
              <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
              {L('Hızlı Erişim:', 'Избранное:')}
            </span>
            {pinnedLinks.map((lk) => (
              <button
                key={lk.id}
                type="button"
                onClick={() => onNavigate(lk.pageId, lk.subTabId)}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FAF7F1] dark:bg-slate-800/90 border border-[#E2D9C9] dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 shadow-2xs transition-all cursor-pointer truncate max-w-[230px]"
              >
                {isRu ? lk.labelRu : lk.labelTr}
              </button>
            ))}
          </div>
        )}

        {/* 1C-STYLE COMPACT 3-CONTAINER DIRECTORY (Tight spacing, colorful icons, high density) */}
        {visibleGroups.length === 0 ? (
          <div className={`${raisedCls} rounded-2xl p-10 text-center space-y-2`}>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {L('Aramanızla eşleşen sekme bulunamadı.', 'Разделы не найдены.')}
            </div>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              {L('Temizle', 'Сбросить')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-start">
            {visibleGroups.map((group) => {
              const GroupIcon = group.accentIcon;
              return (
                <section key={group.id} className={`${raisedCls} rounded-2xl p-3.5 space-y-2.5`}>
                  {/* Container Header */}
                  <div className="flex items-center gap-2.5 pb-2 border-b border-[#E6DDD0] dark:border-slate-700/80">
                    <div className={`w-7 h-7 rounded-xl ${group.accentBgCls} flex items-center justify-center shadow-sm shrink-0`}>
                      <GroupIcon className="w-4 h-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[13px] font-bold text-slate-800 dark:text-white leading-tight truncate">
                        {isRu ? group.titleRu : group.titleTr}
                      </h2>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {isRu ? group.subtitleRu : group.subtitleTr}
                      </div>
                    </div>
                  </div>

                  {/* Sections Inside Container (Tight 1C-Style Spacing) */}
                  <div className="space-y-2.5">
                    {group.sections.map((sec) => {
                      const SecIcon = sec.icon;
                      return (
                        <div
                          key={sec.id}
                          className="rounded-xl bg-[#F4EFE6]/85 dark:bg-slate-800/35 border border-[#E7DFD2]/90 dark:border-slate-700/60 p-2"
                        >
                          {/* Section Heading */}
                          <button
                            type="button"
                            onClick={() => onNavigate(sec.pageId)}
                            className="w-full flex items-center justify-between gap-2 px-1 pb-1.5 mb-1 border-b border-[#E6DDD0]/80 dark:border-slate-700/60 text-left group cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${sec.iconColorCls}`}
                              >
                                <SecIcon className="w-3.5 h-3.5" strokeWidth={2.1} />
                              </span>
                              <span className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors truncate">
                                {isRu ? sec.titleRu : sec.titleTr}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {sec.logoSrc && (
                                <img
                                  src={sec.logoSrc}
                                  alt=""
                                  className="h-4 w-auto max-w-[32px] object-contain rounded-xs"
                                />
                              )}
                              {(sec.badgeTr || sec.badgeRu) && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800">
                                  {isRu ? sec.badgeRu : sec.badgeTr}
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Tight Sub-Tab Links (1C Рабочий стол density) */}
                          <div className="space-y-0.5">
                            {sec.links.map((lk) => {
                              const isPinned = pinnedIds.includes(lk.id);
                              const showTip = hoveredTip === lk.id;
                              const badgeCls =
                                lk.badgeTone === 'rose'
                                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                  : lk.badgeTone === 'amber'
                                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                  : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
                              return (
                                <div
                                  key={lk.id}
                                  className="relative"
                                  onMouseEnter={() => setHoveredTip(lk.id)}
                                  onMouseLeave={() => setHoveredTip((cur) => (cur === lk.id ? null : cur))}
                                >
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onNavigate(lk.pageId, lk.subTabId)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onNavigate(lk.pageId, lk.subTabId);
                                      }
                                    }}
                                    className="group/item flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg border border-transparent hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-400/80 dark:hover:border-emerald-500/60 hover:-translate-y-[1px] hover:shadow-[2px_4px_10px_rgba(5,150,105,0.12)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-all duration-150 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="w-1 h-1 rounded-full bg-emerald-500/80 group-hover/item:scale-150 group-hover/item:bg-emerald-600 transition-all shrink-0" />
                                      <span className="text-[11.5px] leading-snug font-medium text-slate-700 dark:text-slate-200 group-hover/item:text-emerald-800 dark:group-hover/item:text-emerald-300 truncate">
                                        {isRu ? lk.labelRu : lk.labelTr}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {lk.badge && (
                                        <span className={`px-1.5 py-0 rounded-full text-[9.5px] font-bold border leading-tight ${badgeCls}`}>
                                          {lk.badge}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => togglePin(lk.id, e)}
                                        title={isPinned ? L('Sabitlemeyi kaldır', 'Убрать') : L('Sabitle', 'Закрепить')}
                                        className={`p-0.5 rounded transition-opacity cursor-pointer ${
                                          isPinned
                                            ? 'opacity-100 text-amber-500'
                                            : 'opacity-0 group-hover/item:opacity-100 text-slate-400 hover:text-amber-500'
                                        }`}
                                      >
                                        <Star className={`w-3 h-3 ${isPinned ? 'fill-amber-400' : ''}`} />
                                      </button>
                                      <ChevronRight className="w-3 h-3 text-slate-400 group-hover/item:text-emerald-600 group-hover/item:translate-x-0.5 transition-all" />
                                    </div>
                                  </div>

                                  {showTip && (
                                    <div className="pointer-events-none hidden sm:flex justify-end absolute right-1 top-full mt-1 z-40 max-w-[92%]">
                                      <div className="px-2.5 py-1.5 rounded-xl bg-[#FFFDF9] dark:bg-slate-900 text-slate-700 dark:text-slate-100 text-[10.5px] leading-snug shadow-[0_8px_22px_rgba(90,78,60,0.18)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.45)] border border-emerald-400/75 dark:border-emerald-500/45 text-right">
                                        {isRu ? lk.tooltipRu : lk.tooltipTr}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
