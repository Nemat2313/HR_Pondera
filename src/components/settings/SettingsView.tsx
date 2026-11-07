'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  Database,
  Mail,
  Send,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Server,
  KeyRound,
  Copy,
  Check,
  Plus,
  X,
  FolderSync,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { StatsData } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import UserManagementView from '@/components/admin/UserManagementView';
import DatabaseManagementView from '@/components/database/DatabaseManagementView';
import AISettingsTab from '@/components/settings/AISettingsTab';

interface SettingsViewProps {
  stats: StatsData | null;
  onOpenUpload: () => void;
  onRefreshData: () => void;
  initialSubTab?: 'users_rls' | 'database_excel' | 'mail_notifications' | 'ai_settings';
}

interface SmtpSettingsState {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  zupApiToken: string;
  zupAutoFolder: string;
  hasPassword?: boolean;
}

interface EmailRuleItem {
  id: 'daily_compliance' | 'zup_vs_real' | 'vks_gosuslugi' | 'turnover_summary';
  titleTr: string;
  titleRu: string;
  descriptionTr: string;
  descriptionRu: string;
  enabled: boolean;
  frequency: 'daily' | 'weekdays' | 'weekly' | 'on_upload';
  scheduleTime: string;
  toEmails: string[];
  ccEmails: string[];
  attachSummaryTable: boolean;
  lastSentAt?: string | null;
  lastStatus?: string | null;
}

interface EmailLogItem {
  id: number;
  report_id: string;
  subject: string;
  to_list: string;
  cc_list: string;
  status: 'SENT' | 'QUEUED' | 'ERROR';
  detail: string;
  created_at: string;
}

interface ReleaseHighlightItem {
  title: string;
  description: string;
}

interface ReleaseDraftState {
  version: string;
  subjectPrefix: string;
  greeting: string;
  intro: string;
  toEmails: string[];
  ccEmails: string[];
  highlights: ReleaseHighlightItem[];
  closingNote: string;
  lastSentVersion?: string | null;
  lastSentAt?: string | null;
}

export const CORPORATE_IT_EMAIL_SUBJECT =
  'Pondera HR TeamHub (hr.pondera.network) — Kurumsal Bildirim Mail Hesabı (info@pondera.ru), Gosuslugi RPA Robotu, Güvenlik Özeti ve 1C ZUP Günlük Otomatik Veri Aktarımı Hk.';

export const CORPORATE_IT_EMAIL_BODY = `Sayın Barış Bey,

Temin etmiş olduğunuz sunucu ve altyapı yetkileri doğrultusunda geliştirdiğimiz Pondera İK & Saha Operasyon Yönetim Platformu (https://hr.pondera.network) canlı ortamda aktif olarak çalışmaya başlamıştır.

Şu anda sistemimizin ürettiği otomatik bildirimler ve günlük raporlar aktif olarak Telegram grubumuza gönderilmektedir. Dilerseniz aşağıdaki bağlantı üzerinden gruba katılarak canlı bildirim akışını inceleyebilirsiniz:
🔗 Telegram Bildirim Grubu: https://t.me/+kLoRhALjYC8zNDdi

Ancak Rusya genelinde Telegram servisleri VPN olmadan çalışmadığı için, bu bildirimleri ve günlük kritik İK / saha denetim raporlarını ilgili yöneticilerimize aynı zamanda doğrudan Kurumsal E-Posta (To / CC) üzerinden de otomatik paylaşacak altyapıyı uygulamamıza entegre ettik. Ayrıca Gosuslugi başvurularını RPA robotumuz ile otomatize ettik ve resmi 1C ZUP bordro sistemi ile sahadaki eBA Real verilerini çapraz karşılaştıran modülümüzü de devreye aldık.

Bu kapsamda iki konuda desteğinizi ve yönlendirmenizi rica ederiz:

====================================================================
1. KURUMSAL BİLDİRİM MAİL HESABI AÇILMASI (Örn: info@pondera.ru)
====================================================================
Rusya'da Telegram'ın VPN gerektirmesi nedeniyle, uygulamamızın "Ayarlar > Mail Bildirimleri" ekranından günlük raporların (Eksik Evrak Süre Raporu, 1C ZUP vs eBA Real Fark Özeti, VKS Gosuslugi Bildirim Takibi ve Turnover Raporu) mail üzerinden de otomatik gönderilebilmesi için "info@pondera.ru" (veya uygun göreceğiniz "ik-bildirim@pondera.ru" / "noreply@pondera.ru") adında bir mail hesabı açılmasını ve aşağıdaki bağlantı bilgilerinin tarafımızla paylaşılmasını rica ederiz:

• E-Posta Adresi (Kullanıcı Adı): info@pondera.ru
• Şifre / Uygulama Şifresi (App Password):
• SMTP Sunucu Adresi (Host): (Örn: mail.pondera.ru / smtp.yandex.ru / smtp.office365.com)
• SMTP Port ve Güvenlik Türü: (Örn: 465 SSL/TLS veya 587 STARTTLS)

(Not: Uygulama içerisindeki yeni "Ayarlar > Mail Bildirimleri" sekmesinden bu bilgiler girilebilmekte olup, ileride farklı bir mail adresine geçilmesi durumunda kod değişikliği gerekmeden panel üzerinden anında değiştirilebilmektedir.)

====================================================================
2. 1C ZUP "СПИСОК СОТРУДНИКОВ" LİSTESİNİN GÜNLÜK OTOMATİK AKTARIMI
====================================================================
Şu anda sahadaki eBA Real personel listesi ile resmi 1C ZUP personel listesini ("Список сотрудников на XX.XX.xlsx") karşılaştırarak;
- Mevcut çalışanların kaçının resmide (1C ZUP) çalıştığını,
- Sahadan çıkış yaptığı halde 1C ZUP'ta hala aktif görünenleri (şirket içi şantiye transferlerini otomatik ayıklayarak),
- Pasaport, İNN, çalışma izni statüsü (VKS / Patent / RNR) ve sicil farklarını
anlık tespit ediyoruz.

Ancak 1C ZUP Excel listesinin her gün manuel indirilip yüklenmesi yerine bu süreci tam otomasyona bağlamak istiyoruz. Bunun için uygun göreceğiniz aşağıdaki yöntemlerden biriyle ilerleyebiliriz:

• Seçenek A (1C ZUP Scheduled Task / Регламентное задание ile Doğrudan API veya Klasöre Aktarım):
  1C ZUP içerisinde günlük çalışacak bir zamanlanmış görev (Регламентное задание) tanımlanarak "Список сотрудников" raporunun her sabah (örn. 08:30'da);
  1) Doğrudan sunucumuzdaki "/var/www/hr_pondera/uploads/zup_auto/" klasörüne (veya ortak bir ağ/SFTP klasörüne) otomatik kaydedilmesi — uygulamamız bu klasöre düşen yeni Excel dosyasını otomatik algılayıp veritabanına işleyecek şekilde hazırlandı,
  VEYA
  2) Uygulamamızın hazır olan REST API uç noktasına (POST https://hr.pondera.network/api/zup) gönderilmesi.

• Seçenek B (Yetki Tanımlanması Durumunda Tarafımızca Kurulum):
  Eğer 1C ZUP tarafında zamanlanmış görev / dışa aktarım ayarı için tarafıma ilgili modülde düzenleme (edit) yetkisi tanımlanabilirse, 1C ZUP'tan API ile doğrudan sunucumuza aktarımını (veya en temel haliyle günlük belirlenen klasöre otomatik indirilip sunucumuza senkronize edilmesini) bizzat biz de yapılandırabiliriz.

====================================================================
3. UYGULAMANIN MEVCUT AŞAMASI VE ALINAN GÜVENLİK ÖNLEMLERİ ÖZETİ
====================================================================
Sunucu ve uygulama yetkileri halihazırda IT direktörlüğünüz kontrolünde olup, geliştirdiğimiz sistemde devreye alınan başlıca modüller ve güvenlik katmanları şunlardır:

A) Canlıya Alınan Modüller & Gosuslugi RPA Robot Otomasyonu:
1. Gosuslugi Başvuru Robotu (RPA Otomasyonu) & VKS İstatistikleri: VKS (Yüksek Nitelikli Uzman) personellerin Gosuslugi / MVD işe giriş ve işten çıkış yasal bildirim başvurularını geliştirdiğimiz robot ile otomatize ettik; 3 iş günü yasal bildirim sürelerini ve başvuru durumlarını canlı takip ediyoruz. İlerleyen aşamada diğer tüm personel kategorilerinin işe giriş/çıkış bildirimlerini ve personel registrasyon (Миграционный учет) işlemlerini de aynı robot altyapısı üzerinden tam otomatik hale getirecek şekilde geliştirmeye devam edeceğiz.
2. Genel Dashboard & Şantiye Analitiği: 5.221 aktif personel, Kazan (4 alt şantiye kırılımlı), Svobodny-AGHK, Tobolsk, Ust Luga ve Merkez Ofis canlı kadro dağılımları.
3. Yönetim & Turnover Analizi: Şirket içi şantiye transferleri çıkış sayılarından arındırılarak son 1 gün, 3 gün, 1 hafta ve 1 aylık gerçek giriş/çıkışlar ile VKS uzman oranları.
4. Evrak & Süre Analitiği: Pasaport, Vize, Patent, Registrasyon, DMS, Daktiloskopiya ve Propusk bitiş süreleri ile Standby (evrak bekleyen) personel takibi.
5. 1C ZUP (Resmi) & eBA (Real) Çapraz Karşılaştırma Merkezi: Resmi bordro ile fiili saha kadrosunun yan yana grafiksel ve tablosal mutabakatı, şantiye transferlerinde çalışma izni bölge kontrolü.

B) Uygulanan Güvenlik ve Veri Koruma Önlemleri:
1. İzole Kurumsal Veritabanı (On-Premise SQLite WAL): Tüm personel verileri dış bulut servislerine çıkmadan yalnızca kendi sunucumuzda (hr.pondera.network) izole olarak tutulmaktadır.
2. Rol Bazlı Yetkilendirme (RBAC) ve Satır Bazlı Güvenlik (RLS - Row Level Security): Kullanıcılar yalnızca yetkili oldukları bölge veya şantiyenin (örn. sadece Tobolsk veya sadece Kazan) verilerini görüntüleyebilmektedir; Viewer (Gözlemci) rolünün veri değiştirme yetkisi API seviyesinde kapatılmıştır.
3. Kriptografik Oturum Güvenliği: Kimlik doğrulama işlemleri HttpOnly, SameSite=Lax ve imzalı (HMAC-SHA256) oturum çerezleri ile korunmaktadır.
4. Otomatik İşlem Öncesi Yedekleme (Pre-Action Atomic Backup): Her Excel yüklemesi ve veritabanı güncellemesi öncesinde sistem otomatik olarak sıkıştırılmış (.db.gz) yedek almakta, veri kaybı riskine karşı tek tıkla geri yükleme (Rollback) imkanı sunmaktadır.
5. Hassas Bilgi Maskeleme: SMTP şifreleri ve API anahtarları arayüzde maskelenmiş olarak saklanmakta ve yalnızca Admin rolü tarafından yönetilebilmektedir.

Desteğiniz için şimdiden teşekkür eder, iyi çalışmalar dilerim.

Saygılarımla,`;

// Zahid Bey sürüm özeti ve Barış Bey kurumsal IT mail şablonları korunur, ancak Ayarlar ekranında gizli tutulur.
const SHOW_EXECUTIVE_EMAIL_TEMPLATES: boolean = false;

export default function SettingsView({
  stats,
  onOpenUpload,
  onRefreshData,
  initialSubTab = 'users_rls',
}: SettingsViewProps) {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isAdmin = !user || user.role === 'admin';

  const [activeSubTab, setActiveSubTab] = useState<
    'users_rls' | 'database_excel' | 'mail_notifications' | 'ai_settings'
  >(initialSubTab);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    try {
      sessionStorage.setItem('pondera_settings_subtab', activeSubTab);
    } catch {
      // ignore
    }
  }, [activeSubTab]);

  // Mail & Automation state
  const [loadingMail, setLoadingMail] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);
  const [checkingFolder, setCheckingFolder] = useState(false);
  const [copiedMailText, setCopiedMailText] = useState(false);
  const [showBarisEmailCard, setShowBarisEmailCard] = useState(true);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [smtp, setSmtp] = useState<SmtpSettingsState>({
    enabled: false,
    host: 'smtppro.zoho.com',
    port: 465,
    secure: true,
    user: 'ikbildirim@pondera.ru',
    pass: '',
    fromName: 'Pondera İK Bildirim Sistemi',
    fromEmail: 'ikbildirim@pondera.ru',
    zupApiToken: 'PONDERA-ZUP-SYNC-2026-SECRET',
    zupAutoFolder: '/var/www/hr_pondera/uploads/zup_auto',
  });

  const [rules, setRules] = useState<EmailRuleItem[]>([]);
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [releaseDraft, setReleaseDraft] = useState<ReleaseDraftState>({
    version: 'v2.8.27',
    subjectPrefix: 'Pondera İK & Saha Yönetim Sistemi — Yeni Sürüm ve Güncelleme Özeti',
    greeting: 'Sayın Zahid Bey,',
    intro:
      'Pondera İK & Saha Yönetim Sistemi (hr.pondera.network) üzerinde son dönemde talep edilen geliştirmeler tamamlanarak canlı kullanıma alınmıştır. İK ve saha ekiplerimizin iş süreçlerini kolaylaştıran başlıca yenilikler aşağıda özetlenmiştir:',
    toEmails: ['zahid.rahimov@pondera.ru'],
    ccEmails: ['nemat2313@gmail.com', 'ikbildirim@pondera.ru'],
    highlights: [],
    closingNote:
      'Tüm yenilikleri https://hr.pondera.network adresinden inceleyebilirsiniz.',
    lastSentVersion: null,
    lastSentAt: null,
  });
  const [releaseToText, setReleaseToText] = useState('zahid.rahimov@pondera.ru');
  const [releaseCcText, setReleaseCcText] = useState('nemat2313@gmail.com, ikbildirim@pondera.ru');
  const [savingReleaseDraft, setSavingReleaseDraft] = useState(false);
  const [sendingReleaseMode, setSendingReleaseMode] = useState<'none' | 'preview' | 'official'>('none');
  const [showReleaseCard, setShowReleaseCard] = useState(true);

  // Temporary input state for adding To / CC emails per rule
  const [newToInput, setNewToInput] = useState<Record<string, string>>({});
  const [newCcInput, setNewCcInput] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const fetchEmailSettings = async () => {
    setLoadingMail(true);
    try {
      const res = await fetch('/api/settings/email', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success) {
        setSmtp(json.smtp);
        setRules(json.rules || []);
        setLogs(json.logs || []);
        if (json.releaseDraft) {
          setReleaseDraft(json.releaseDraft);
          setReleaseToText((json.releaseDraft.toEmails || ['zahid.rahimov@pondera.ru']).join(', '));
          setReleaseCcText((json.releaseDraft.ccEmails || []).join(', '));
        }
      }
    } catch {
      // handled silently
    } finally {
      setLoadingMail(false);
    }
  };

  useEffect(() => {
    fetchEmailSettings();
  }, []);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingSmtp(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_smtp', smtp }),
      });
      const json = await res.json();
      if (json?.success) {
        setSmtp(json.smtp);
        setFeedback({ type: 'success', text: json.message });
      } else {
        setFeedback({ type: 'error', text: json?.message || 'Ayarlar kaydedilemedi.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Sunucu bağlantı hatası.' });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSaveRules = async () => {
    if (!isAdmin) return;
    setSavingRules(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_rules', rules }),
      });
      const json = await res.json();
      if (json?.success) {
        setRules(json.rules);
        setFeedback({ type: 'success', text: json.message });
      } else {
        setFeedback({ type: 'error', text: json?.message || 'Rapor kuralları kaydedilemedi.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Kayıt sırasında hata oluştu.' });
    } finally {
      setSavingRules(false);
    }
  };

  const handleTriggerReportEmail = async (reportId: string) => {
    setSendingReportId(reportId);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_report', reportId }),
      });
      const json = await res.json();
      if (json?.rules) setRules(json.rules);
      if (json?.logs) setLogs(json.logs);
      setFeedback({
        type: json?.status === 'SENT' ? 'success' : json?.status === 'QUEUED' ? 'info' : 'error',
        text: json?.message || 'İşlem tamamlandı.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'E-posta tetiklenirken hata oluştu.' });
    } finally {
      setSendingReportId(null);
    }
  };

  const handleCheckZupFolder = async () => {
    setCheckingFolder(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_zup_folder' }),
      });
      const json = await res.json();
      setFeedback({
        type: json?.imported ? 'success' : 'info',
        text: json?.message || 'Klasör kontrol edildi.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Klasör kontrolü sırasında hata oluştu.' });
    } finally {
      setCheckingFolder(false);
    }
  };

  const addRecipient = (ruleId: string, field: 'toEmails' | 'ccEmails', rawVal: string) => {
    const parts = rawVal
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    if (parts.length === 0) return;

    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const existing = new Set(r[field]);
        parts.forEach((p) => existing.add(p));
        return { ...r, [field]: Array.from(existing) };
      })
    );

    if (field === 'toEmails') {
      setNewToInput((p) => ({ ...p, [ruleId]: '' }));
    } else {
      setNewCcInput((p) => ({ ...p, [ruleId]: '' }));
    }
  };

  const removeRecipient = (ruleId: string, field: 'toEmails' | 'ccEmails', emailToRemove: string) => {
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, [field]: r[field].filter((e) => e !== emailToRemove) } : r
      )
    );
  };

  const handleCopyCorporateEmail = () => {
    const fullText = `Konu: ${CORPORATE_IT_EMAIL_SUBJECT}\n\n${CORPORATE_IT_EMAIL_BODY}`;
    navigator.clipboard.writeText(fullText);
    setCopiedMailText(true);
    setTimeout(() => setCopiedMailText(false), 3000);
  };

  const buildNormalizedReleasePayload = (): ReleaseDraftState => {
    const toList = releaseToText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    const ccList = releaseCcText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    return {
      ...releaseDraft,
      toEmails: toList.length > 0 ? toList : ['zahid.rahimov@pondera.ru'],
      ccEmails: ccList,
    };
  };

  const handleSaveReleaseDraft = async () => {
    if (!isAdmin) return;
    setSavingReleaseDraft(true);
    setFeedback(null);
    try {
      const payload = buildNormalizedReleasePayload();
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_release_draft', releaseDraft: payload }),
      });
      const json = await res.json();
      if (json?.success && json.releaseDraft) {
        setReleaseDraft(json.releaseDraft);
        setReleaseToText((json.releaseDraft.toEmails || []).join(', '));
        setReleaseCcText((json.releaseDraft.ccEmails || []).join(', '));
        setFeedback({ type: 'success', text: json.message });
      } else {
        setFeedback({ type: 'error', text: json?.message || 'Sürüm özeti taslağı kaydedilemedi.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Taslak kaydedilirken hata oluştu.' });
    } finally {
      setSavingReleaseDraft(false);
    }
  };

  const handleSendReleaseSummary = async (isPreviewTest: boolean) => {
    if (!isAdmin) return;
    setSendingReleaseMode(isPreviewTest ? 'preview' : 'official');
    setFeedback(null);
    try {
      const payload = buildNormalizedReleasePayload();
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_release_summary',
          releaseDraft: payload,
          isPreviewTest,
          overrideTo: isPreviewTest ? ['nemat2313@gmail.com'] : undefined,
          overrideCc: isPreviewTest ? [] : undefined,
        }),
      });
      const json = await res.json();
      if (json?.releaseDraft) setReleaseDraft(json.releaseDraft);
      if (json?.logs) setLogs(json.logs);
      setFeedback({
        type: json?.status === 'SENT' ? 'success' : json?.status === 'QUEUED' ? 'info' : 'error',
        text: json?.message || 'Sürüm özeti gönderim işlemi tamamlandı.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Sürüm özeti gönderilirken hata oluştu.' });
    } finally {
      setSendingReleaseMode('none');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-5 max-w-[1440px] mx-auto">
      {/* TOP SETTINGS HEADER & MULTI-TAB SWITCHER */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {lang === 'ru'
                  ? 'Настройки системы, БД и Уведомлений'
                  : 'Sistem Ayarları, Veritabanı & Mail Bildirim Merkezi'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                Admin Kontrol Paneli
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ru'
                ? 'Управление пользователями (RLS), базой данных Excel/SQLite и корпоративной почтовой рассылкой отчетов'
                : 'Kullanıcı & RLS yetkileri, Excel/SQLite veritabanı yönetimi ve kurumsal e-posta (To/CC) rapor zamanlayıcısı'}
            </p>
          </div>
        </div>

        {/* 3 Main Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('users_rls')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'users_rls'
                ? 'bg-indigo-100/95 dark:bg-indigo-500/25 border border-indigo-300 dark:border-indigo-400/40 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 border border-transparent hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? '1. Пользователи и RLS' : '1. Kullanıcı & RLS'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('database_excel')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'database_excel'
                ? 'bg-indigo-100/95 dark:bg-indigo-500/25 border border-indigo-300 dark:border-indigo-400/40 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 border border-transparent hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? '2. Excel и База данных' : '2. Excel & Veritabanı'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('mail_notifications')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'mail_notifications'
                ? 'bg-indigo-100/95 dark:bg-indigo-500/25 border border-indigo-300 dark:border-indigo-400/40 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 border border-transparent hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? '3. Почта и Автоматизация' : '3. Mail Bildirimleri & Otomasyon'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ai_settings')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'ai_settings'
                ? 'bg-indigo-100/95 dark:bg-indigo-500/25 border border-indigo-300 dark:border-indigo-400/40 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                : 'text-slate-600 dark:text-slate-300 border border-transparent hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{lang === 'ru' ? '4. ИИ и Чтение Билетов/Сканов' : '4. Yapay Zeka (AI) & Evrak Okuma'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: KULLANICI & RLS */}
      {activeSubTab === 'users_rls' && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-7">
          <UserManagementView />
        </div>
      )}

      {/* TAB 2: EXCEL & VERİTABANI */}
      {activeSubTab === 'database_excel' && (
        <div className="-mx-4 sm:-mx-6 lg:-mx-7">
          <DatabaseManagementView
            stats={stats}
            onOpenUpload={onOpenUpload}
            onRefreshData={onRefreshData}
          />
        </div>
      )}

      {/* TAB 3: MAİL BİLDİRİMLERİ & 1C ZUP OTOMASYON AYARLARI */}
      {activeSubTab === 'mail_notifications' && (
        <div className="space-y-5">
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-[11px] underline ml-4 cursor-pointer"
              >
                Kapat
              </button>
            </div>
          )}

          {/* SECTION 0: EXECUTIVE HR DIRECTOR RELEASE SUMMARY EMAIL (ikbildirim@pondera.ru -> Zahid Bey) - HIDDEN IN UI, TEMPLATE PRESERVED */}
          {SHOW_EXECUTIVE_EMAIL_TEMPLATES && (
          <div className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-emerald-300/80 dark:border-teal-500/40 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-teal-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Yeni Sürüm & Biriken Güncellemeler Özeti Bildirimi (Personel Müdürü Formatı • ikbildirim@pondera.ru)
                  </h2>
                  {releaseDraft.lastSentVersion && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10.5px] bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Son Gönderilen: {releaseDraft.lastSentVersion} ({releaseDraft.lastSentAt})
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Her ufak düzeltmede otomatik mail atılmaz. Yapılan işler biriktiğinde, <strong>Personel Müdürü’nün (Zahid Bey)</strong> doğrudan saha ve İK işleyişi açısından okuyabileceği sade özet halinde <strong>ikbildirim@pondera.ru</strong> üzerinden tek tıkla gönderilir.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!isAdmin || savingReleaseDraft}
                  onClick={handleSaveReleaseDraft}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs cursor-pointer transition-all"
                >
                  {savingReleaseDraft ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                  )}
                  <span>Taslağı Kaydet</span>
                </button>

                <button
                  type="button"
                  disabled={!isAdmin || sendingReleaseMode !== 'none'}
                  onClick={() => handleSendReleaseSummary(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-400/40 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 text-xs cursor-pointer transition-all"
                >
                  {sendingReleaseMode === 'preview' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-700 dark:text-indigo-300" />
                  ) : (
                    <Mail className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />
                  )}
                  <span>Önizleme Test Gönder (nemat2313@gmail.com)</span>
                </button>

                <button
                  type="button"
                  disabled={!isAdmin || sendingReleaseMode !== 'none'}
                  onClick={() => handleSendReleaseSummary(false)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-400 dark:border-teal-400/50 bg-emerald-100 hover:bg-emerald-200/90 dark:bg-teal-500/25 dark:hover:bg-teal-500/35 text-emerald-950 dark:text-teal-100 text-xs cursor-pointer transition-all shadow-xs"
                >
                  {sendingReleaseMode === 'official' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-teal-300" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-emerald-700 dark:text-teal-300" />
                  )}
                  <span>Sürüm Özetini Zahid Bey’e Gönder</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowReleaseCard((p) => !p)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{showReleaseCard ? 'Daralt' : 'Düzenle / Gör'}</span>
                  {showReleaseCard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {showReleaseCard && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Sürüm Numarası
                    </label>
                    <input
                      type="text"
                      value={releaseDraft.version}
                      disabled={!isAdmin}
                      onChange={(e) => setReleaseDraft({ ...releaseDraft, version: e.target.value })}
                      placeholder="v2.8.27"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      TO (Birincil Alıcı — Zahid Bey)
                    </label>
                    <input
                      type="text"
                      value={releaseToText}
                      disabled={!isAdmin}
                      onChange={(e) => setReleaseToText(e.target.value)}
                      placeholder="zahid.rahimov@pondera.ru"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      CC (Bilgi Kopya Alıcıları)
                    </label>
                    <input
                      type="text"
                      value={releaseCcText}
                      disabled={!isAdmin}
                      onChange={(e) => setReleaseCcText(e.target.value)}
                      placeholder="nemat2313@gmail.com, ikbildirim@pondera.ru"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Hitap Başlığı
                    </label>
                    <input
                      type="text"
                      value={releaseDraft.greeting}
                      disabled={!isAdmin}
                      onChange={(e) => setReleaseDraft({ ...releaseDraft, greeting: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Üst Yönetici Giriş Özeti
                    </label>
                    <input
                      type="text"
                      value={releaseDraft.intro}
                      disabled={!isAdmin}
                      onChange={(e) => setReleaseDraft({ ...releaseDraft, intro: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      Biriken Sürüm Yenilikleri (Teknik Terim Olmadan, Personel Müdürü Anlatımıyla)
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() =>
                          setReleaseDraft({
                            ...releaseDraft,
                            highlights: [
                              ...releaseDraft.highlights,
                              {
                                title: `${releaseDraft.highlights.length + 1}. Yeni Güncelleme Başlığı`,
                                description: '',
                              },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-teal-950/60 text-emerald-800 dark:text-teal-300 border border-emerald-200 dark:border-teal-800 text-[11px] cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Yeni Madde Ekle
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                    {releaseDraft.highlights.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.title}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const next = [...releaseDraft.highlights];
                              next[idx] = { ...next[idx], title: e.target.value };
                              setReleaseDraft({ ...releaseDraft, highlights: next });
                            }}
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                          />
                          {isAdmin && releaseDraft.highlights.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setReleaseDraft({
                                  ...releaseDraft,
                                  highlights: releaseDraft.highlights.filter((_, i) => i !== idx),
                                })
                              }
                              className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                              title="Maddeyi Sil"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={3}
                          value={item.description}
                          disabled={!isAdmin}
                          onChange={(e) => {
                            const next = [...releaseDraft.highlights];
                            next[idx] = { ...next[idx], description: e.target.value };
                            setReleaseDraft({ ...releaseDraft, highlights: next });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11.5px] leading-relaxed resize-y"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* SECTION A: SMTP CONNECTION & 1C ZUP AUTO-SYNC SETTINGS */}
          <form
            onSubmit={handleSaveSmtp}
            className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {lang === 'ru'
                      ? '1. Подключение корпоративной почты Zoho Mail (SMTP) и Авто-синхронизация 1С ЗУП'
                      : '1. Kurumsal Mail (Zoho Mail SMTP) & Telegram Eşzamanlı Bildirim Ayarları'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tüm Telegram bildirimleri (15 dk Gosuslugi VKS, MVD uyarıları, günlük evrak süreleri, 1C ZUP fark özeti ve turnover) eşzamanlı olarak <strong>ikbildirim@pondera.ru</strong> (Zoho Mail SSL 465) üzerinden e-posta alıcılarına da iletilir.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setSmtp((prev) => ({
                        ...prev,
                        enabled: true,
                        host: 'smtppro.zoho.com',
                        port: 465,
                        secure: true,
                        user: prev.user || 'ikbildirim@pondera.ru',
                        fromEmail: prev.user || 'ikbildirim@pondera.ru',
                        fromName: prev.fromName || 'Pondera İK Bildirim Sistemi',
                      }))
                    }
                    className="px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 font-semibold text-[11px] cursor-pointer transition-all"
                  >
                    Zoho Mail (pondera.ru) Hazır Ayar
                  </button>
                )}

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={smtp.enabled}
                    disabled={!isAdmin}
                    onChange={(e) => setSmtp({ ...smtp, enabled: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>{smtp.enabled ? 'SMTP Mail Gönderimi Aktif' : 'SMTP Beklemede (Kuyruk Modu)'}</span>
                </label>

                <button
                  type="button"
                  disabled={sendingReportId === 'test_connection'}
                  onClick={() => handleTriggerReportEmail('test_connection')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
                >
                  {sendingReportId === 'test_connection' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700 dark:text-emerald-300" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
                  )}
                  <span>Test Maili Gönder</span>
                </button>

                <button
                  type="submit"
                  disabled={!isAdmin || savingSmtp}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 disabled:opacity-50 text-indigo-950 dark:text-indigo-100 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
                >
                  {savingSmtp ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-700 dark:text-indigo-300" /> : <Save className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />}
                  <span>Bağlantı Ayarlarını Kaydet</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Gönderici E-Posta Adresi (Kullanıcı Adı)
                </label>
                <input
                  type="text"
                  value={smtp.user}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    setSmtp({ ...smtp, user: e.target.value, fromEmail: e.target.value })
                  }
                  placeholder="ikbildirim@pondera.ru"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400">
                    E-Posta Şifresi / Uygulama Şifresi
                  </label>
                  {smtp.hasPassword && isAdmin && (
                    <button
                      type="button"
                      onClick={() => setSmtp({ ...smtp, pass: '' })}
                      className="text-[10.5px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Yeni Şifre Gir
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={smtp.pass}
                    disabled={!isAdmin}
                    onFocus={() => {
                      if (smtp.pass === '••••••••') {
                        setSmtp({ ...smtp, pass: '' });
                      }
                    }}
                    onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })}
                    placeholder={smtp.hasPassword ? 'Kayıtlı (Değiştirmek için yazın)' : '••••••••••••'}
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  SMTP Sunucu Adresi (Host)
                </label>
                <input
                  type="text"
                  value={smtp.host}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  placeholder="smtppro.zoho.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    SMTP Port
                  </label>
                  <input
                    type="number"
                    value={smtp.port}
                    disabled={!isAdmin}
                    onChange={(e) =>
                      setSmtp({
                        ...smtp,
                        port: Number(e.target.value) || 465,
                        secure: Number(e.target.value) === 465,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Şifreleme
                  </label>
                  <select
                    value={smtp.secure ? 'ssl' : 'starttls'}
                    disabled={!isAdmin}
                    onChange={(e) => setSmtp({ ...smtp, secure: e.target.value === 'ssl' })}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="ssl">SSL / TLS (465)</option>
                    <option value="starttls">STARTTLS (587)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Görünen Gönderici Adı (Sender Name)
                </label>
                <input
                  type="text"
                  value={smtp.fromName}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  1C ZUP Günlük Otomatik İndirme Klasörü (Sunucu Dizin Yolu)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={smtp.zupAutoFolder}
                    disabled={!isAdmin}
                    onChange={(e) => setSmtp({ ...smtp, zupAutoFolder: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    disabled={checkingFolder}
                    onClick={handleCheckZupFolder}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <FolderSync className={`w-3.5 h-3.5 ${checkingFolder ? 'animate-spin' : ''}`} />
                    <span>Şimdi Kontrol Et</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  1C ZUP REST API Anahtarı (POST /api/zup)
                </label>
                <input
                  type="text"
                  value={smtp.zupApiToken}
                  disabled={!isAdmin}
                  onChange={(e) => setSmtp({ ...smtp, zupApiToken: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-[11px]"
                />
              </div>
            </div>
          </form>

          {/* SECTION B: REPORT SCHEDULING & TO / CC RECIPIENT MATRIX */}
          <div className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {lang === 'ru'
                      ? '2. Расписание отчетов и получатели (Кому: To / Копия: CC)'
                      : '2. Rapor Bazlı Gönderim Planlama (Kimlere To, Kimlere CC, Ne Zaman, Hangi Rapor)'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Admin yetkisiyle her bir rapor için To (Birincil Alıcılar), CC (Bilgi Alıcıları), gönderim periyodu ve Moskova saatiyle gönderim zamanını yapılandırabilirsiniz.
                </p>
              </div>

              <button
                type="button"
                disabled={!isAdmin || savingRules}
                onClick={handleSaveRules}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 disabled:opacity-50 text-indigo-950 dark:text-indigo-100 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
              >
                {savingRules ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-700 dark:text-indigo-300" /> : <Save className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />}
                <span>Tüm Rapor Kurallarını Kaydet</span>
              </button>
            </div>

            {loadingMail ? (
              <div className="py-8 text-center text-xs text-slate-400">Yükleniyor...</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      rule.enabled
                        ? 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                        : 'bg-slate-100/50 dark:bg-slate-900/20 border-slate-200/50 dark:border-slate-800/50 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            disabled={!isAdmin}
                            onChange={(e) =>
                              setRules((prev) =>
                                prev.map((r) => (r.id === rule.id ? { ...r, enabled: e.target.checked } : r))
                              )
                            }
                            className="rounded text-indigo-600 cursor-pointer"
                          />
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                            {lang === 'ru' ? rule.titleRu : rule.titleTr}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {lang === 'ru' ? rule.descriptionRu : rule.descriptionTr}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={sendingReportId === rule.id}
                        onClick={() => handleTriggerReportEmail(rule.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-100/85 hover:bg-emerald-200/80 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-950 dark:text-emerald-100 font-semibold text-[11px] shrink-0 cursor-pointer transition-all shadow-2xs"
                      >
                        {sendingReportId === rule.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-700 dark:text-emerald-300" />
                        ) : (
                          <Send className="w-3 h-3 text-emerald-700 dark:text-emerald-300" />
                        )}
                        <span>Şimdi Gönder</span>
                      </button>
                    </div>

                    {/* Schedule Frequency & Time */}
                    <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
                      <div>
                        <label className="block text-[10.5px] text-slate-500 dark:text-slate-400 mb-1">
                          Gönderim Periyodu
                        </label>
                        <select
                          value={rule.frequency}
                          disabled={!isAdmin}
                          onChange={(e) =>
                            setRules((prev) =>
                              prev.map((r) =>
                                r.id === rule.id
                                  ? { ...r, frequency: e.target.value as EmailRuleItem['frequency'] }
                                  : r
                              )
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs"
                        >
                          <option value="daily">Her Gün (Günlük Otomatik)</option>
                          <option value="weekdays">Hafta İçi Her Gün (Pzt–Cum)</option>
                          <option value="weekly">Haftalık (Pazartesi)</option>
                          <option value="on_upload">Yeni Liste Yüklendiğinde Anında</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10.5px] text-slate-500 dark:text-slate-400 mb-1">
                          Gönderim Saati (Moskova MSK)
                        </label>
                        <input
                          type="time"
                          value={rule.scheduleTime}
                          disabled={!isAdmin}
                          onChange={(e) =>
                            setRules((prev) =>
                              prev.map((r) =>
                                r.id === rule.id ? { ...r, scheduleTime: e.target.value } : r
                              )
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs"
                        />
                      </div>
                    </div>

                    {/* TO Recipients */}
                    <div className="space-y-1.5">
                      <label className="block text-[10.5px] text-slate-600 dark:text-slate-300">
                        <strong>TO (Birincil Alıcılar):</strong>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {rule.toEmails.map((em) => (
                          <span
                            key={em}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px]"
                          >
                            <span>{em}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => removeRecipient(rule.id, 'toEmails', em)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="email"
                            value={newToInput[rule.id] || ''}
                            onChange={(e) => setNewToInput({ ...newToInput, [rule.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addRecipient(rule.id, 'toEmails', newToInput[rule.id] || '');
                              }
                            }}
                            placeholder="To alıcı e-posta ekle (örn: ad.soyad@pondera.ru)..."
                            className="flex-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-800 dark:text-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => addRecipient(rule.id, 'toEmails', newToInput[rule.id] || '')}
                            className="px-2.5 py-1 rounded-lg border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3 text-indigo-700 dark:text-indigo-300" /> Ekle
                          </button>
                        </div>
                      )}
                    </div>

                    {/* CC Recipients */}
                    <div className="space-y-1.5">
                      <label className="block text-[10.5px] text-slate-600 dark:text-slate-300">
                        <strong>CC (Bilgi / Kopya Alıcıları):</strong>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {rule.ccEmails.map((em) => (
                          <span
                            key={em}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[11px]"
                          >
                            <span>{em}</span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => removeRecipient(rule.id, 'ccEmails', em)}
                                className="hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="email"
                            value={newCcInput[rule.id] || ''}
                            onChange={(e) => setNewCcInput({ ...newCcInput, [rule.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addRecipient(rule.id, 'ccEmails', newCcInput[rule.id] || '');
                              }
                            }}
                            placeholder="CC alıcı e-posta ekle (örn: yonetim@pondera.ru)..."
                            className="flex-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-800 dark:text-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => addRecipient(rule.id, 'ccEmails', newCcInput[rule.id] || '')}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> CC Ekle
                          </button>
                        </div>
                      )}
                    </div>

                    {rule.lastSentAt && (
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                        <span>Son İşlem: {rule.lastSentAt}</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{rule.lastStatus}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION C: READY-TO-SEND CORPORATE EMAIL FOR IT DIRECTOR BARIŞ BEY - HIDDEN IN UI, TEMPLATE PRESERVED */}
          {SHOW_EXECUTIVE_EMAIL_TEMPLATES && (
          <div className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-indigo-200 dark:border-indigo-900/60 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  3. IT Direktörü Barış Bey’e Gönderilecek Kurumsal Mail Metni (info@pondera.ru, Güvenlik Özeti & 1C ZUP Otomasyonu)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCorporateEmail}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-400/40 bg-indigo-100/85 hover:bg-indigo-200/80 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-950 dark:text-indigo-100 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
                >
                  {copiedMailText ? <Check className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" /> : <Copy className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-300" />}
                  <span>{copiedMailText ? 'Panoya Kopyalandı!' : 'Mail Metnini Kopyala'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBarisEmailCard((p) => !p)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{showBarisEmailCard ? 'Gizle' : 'Göster'}</span>
                  {showBarisEmailCard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {showBarisEmailCard && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-800 dark:text-slate-200">
                <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
                  <strong>Konu:</strong> {CORPORATE_IT_EMAIL_SUBJECT}
                </div>
                <pre className="whitespace-pre-wrap font-sans leading-relaxed text-[11.5px] max-h-96 overflow-y-auto">
                  {CORPORATE_IT_EMAIL_BODY}
                </pre>
              </div>
            )}
          </div>
          )}

          {/* SECTION D: EMAIL DELIVERY LOGS / OUTBOX */}
          <div className="p-5 rounded-3xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {SHOW_EXECUTIVE_EMAIL_TEMPLATES ? '4.' : '3.'} E-Posta Gönderim Geçmişi & Kuyruk (Outbox) Kayıtları
            </h3>
            {logs.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center">
                Henüz gönderilmiş veya kuyruğa alınmış e-posta kaydı bulunmuyor.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">Tarih</th>
                      <th className="py-2 px-2">Rapor / Konu</th>
                      <th className="py-2 px-2">To / CC Alıcılar</th>
                      <th className="py-2 px-2">Durum</th>
                      <th className="py-2 pl-2">Detay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{l.created_at}</td>
                        <td className="py-2 px-2 text-slate-900 dark:text-white">{l.subject}</td>
                        <td className="py-2 px-2 text-[11px] text-slate-600 dark:text-slate-300">
                          <div>To: {l.to_list}</div>
                          {l.cc_list && <div className="text-slate-400">CC: {l.cc_list}</div>}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              l.status === 'SENT'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                : l.status === 'QUEUED'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                            }`}
                          >
                            {l.status === 'SENT' ? 'Gönderildi' : l.status === 'QUEUED' ? 'Kuyrukta' : 'Hata'}
                          </span>
                        </td>
                        <td className="py-2 pl-2 text-[11px] text-slate-500 dark:text-slate-400">{l.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: YAPAY ZEKA (AI) & EVRAK / BİLET OKUMA BAĞLANTILARI */}
      {activeSubTab === 'ai_settings' && <AISettingsTab />}
    </div>
  );
}
