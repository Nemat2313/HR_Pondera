'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';

export type GuideProviderKey =
  | 'deepseek'
  | 'deepseek_ocr'
  | 'yandex'
  | 'gigachat'
  | 'gemini'
  | 'openrouter';

interface AiApiKeyGuideModalProps {
  isOpen: boolean;
  initialProvider?: GuideProviderKey;
  onClose: () => void;
}

interface ProviderGuideSpec {
  id: GuideProviderKey;
  shortTitle: string;
  fullTitle: string;
  badge: string;
  badgeTone: string;
  consoleUrl: string;
  consoleLabel: string;
  billingUrl?: string;
  billingLabel?: string;
  keyPrefix: string;
  recommendedModel: string;
  costNote: string;
  russiaNote: string;
  steps: string[];
  troubleshooting: string[];
}

const PROVIDER_GUIDES: ProviderGuideSpec[] = [
  {
    id: 'deepseek',
    shortTitle: '1. DeepSeek AI',
    fullTitle: '1. DeepSeek Resmi API (platform.deepseek.com)',
    badge: 'Önerilen Dijital PDF',
    badgeTone: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    consoleLabel: 'platform.deepseek.com/api_keys (API Keys Sayfası)',
    billingUrl: 'https://platform.deepseek.com/top_up',
    billingLabel: 'platform.deepseek.com/top_up (Bakiye Yükleme)',
    keyPrefix: 'sk-...',
    recommendedModel: 'deepseek-chat',
    costNote: '2 USD yükleme ile yaklaşık 800–1.000 adet dijital e-bilet PDF okunur.',
    russiaNote: 'Rusya sunucularından ve VPN olmadan doğrudan çalışır.',
    steps: [
      'Tarayıcıda https://platform.deepseek.com/api_keys adresine gidin ve Google veya e-posta hesabınızla giriş yapın.',
      'Sol menüden "API keys" sekmesini açın ve mavi "Create new API key" butonuna tıklayın.',
      'Açılan kutuda anahtara bir isim verin (ör. "Pondera Bilet") ve "Create API key" butonuna basın.',
      'Ekranda yalnızca bir kez gösterilen "sk-..." ile başlayan anahtarı kopyalama ikonuyla kopyalayın.',
      'Yeni hesaplarda bakiye 0 USD ise sol menüdeki "Top up" sayfasından en az 2 USD bakiye yükleyin.',
      'Uygulamamızda "DeepSeek API Key" kutusuna yapıştırıp "Kaydet & Test Et" butonuna basın.',
    ],
    troubleshooting: [
      'API 401 (invalid_request_error): Anahtar eksik kopyalanmış veya iptal edilmiştir; yeni bir "sk-..." anahtarı oluşturun.',
      'API 402 (Insufficient Balance): Hesap bakiyesi 0 USD olmuştur; Top up menüsünden bakiye ekleyin.',
    ],
  },
  {
    id: 'deepseek_ocr',
    shortTitle: '2. SiliconFlow OCR',
    fullTitle: '2. DeepSeek-OCR / Qwen-VL Görsel Okuma (cloud.siliconflow.com)',
    badge: 'Fotoğraf & WhatsApp Scan',
    badgeTone: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200',
    consoleUrl: 'https://cloud.siliconflow.com/account/ak',
    consoleLabel: 'cloud.siliconflow.com/account/ak (API Keys)',
    billingUrl: 'https://cloud.siliconflow.com/expensebill',
    billingLabel: 'SiliconFlow Billing / Top-up',
    keyPrefix: 'sk-...',
    recommendedModel: 'deepseek-ai/deepseek-vl2 veya Qwen/Qwen2.5-VL-72B-Instruct',
    costNote: 'WhatsApp ekran görüntüsü, kamera fotoğrafı ve taranmış biletler için idealdir.',
    russiaNote: 'Rusya IP adreslerinden VPN gerektirmeden doğrudan erişilebilir.',
    steps: [
      'https://cloud.siliconflow.com/account/ak adresine gidin ve giriş yapın (Google/GitHub/E-posta).',
      'Sol menüden "API Keys" bölümüne tıklayın ve sağ üstteki "Create new API key" butonuna basın.',
      'Açıklama alanına "Pondera OCR" yazıp onaylayın.',
      'Oluşan "sk-..." anahtarının yanındaki kopyala simgesine tıklayarak tam metni kopyalayın.',
      'Uygulamamızda "2. DeepSeek-OCR / VL2" kartındaki "SiliconFlow API Key" alanına yapıştırıp "Test Et" butonuna basın.',
    ],
    troubleshooting: [
      'API 402 / Code 30001: Ücretsiz deneme kredisi bitmiştir; Billing sekmesinden kredi ekleyin veya dijital PDF biletler için ücretsiz Qwen metin akışını kullanın.',
    ],
  },
  {
    id: 'yandex',
    shortTitle: '3. Yandex Cloud',
    fullTitle: '3. Yandex Vision OCR + YandexGPT (Rusya Yerel Kurumsal AI)',
    badge: 'VPN’siz Rusya • Ruble Fatura',
    badgeTone: 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200',
    consoleUrl: 'https://console.cloud.yandex.ru',
    consoleLabel: 'console.cloud.yandex.ru (Yandex Cloud Konsol)',
    billingUrl: 'https://console.cloud.yandex.ru/billing',
    billingLabel: 'Yandex Cloud Billing (Ruble / Kurumsal)',
    keyPrefix: 'Folder ID: b1g...  +  API Key: AQVN...',
    recommendedModel: 'yandexgpt/latest',
    costNote: 'Rus şirket kartı / kurumsal fatura (ООО ПОНДЕРА) ile Ruble cinsinden ödenir.',
    russiaNote: '%100 Rusya içi altyapı — RZD Rusça tren biletleri ve Kiril pasaportlarda çok yüksektir.',
    steps: [
      'https://console.cloud.yandex.ru adresine girin ve çalışma klasörünüzü (Folder, ör. "default") seçin.',
      'Üstteki adres çubuğundan veya klasör başlığından "b1g..." ile başlayan Folder ID kodunu kopyalayın.',
      'Sol menüden "Service accounts" (Сервисные аккаунты) sekmesine girip "Create service account" butonuna basın.',
      'Hesaba şu iki rolü ekleyin: "ai.vision.user" ve "ai.languageModels.user".',
      'Oluşturduğunuz servis hesabının içine girip üstteki "Create new key" -> "Create API key" seçeneğine tıklayın.',
      'Scope alanını boş bırakabilir veya "yc.ai.vision.execute" + "yc.ai.foundationModels.execute" seçebilirsiniz; oluşan "AQVN..." anahtarını hemen kopyalayın.',
      'Uygulamada hem Folder ID ("b1g...") hem API Key ("AQVN...") kutularını doldurup "Test Et" butonuna basın.',
    ],
    troubleshooting: [
      'Permission Denied (403): Servis hesabına "ai.vision.user" ve "ai.languageModels.user" rolleri atanmamış veya Billing hesabı aktif değildir.',
    ],
  },
  {
    id: 'gigachat',
    shortTitle: '4. Sber GigaChat',
    fullTitle: '4. Sber GigaChat API (developers.sber.ru/studio)',
    badge: 'VPN’siz Rusya • Sber ID',
    badgeTone: 'bg-teal-100 dark:bg-teal-950/80 text-teal-900 dark:text-teal-200',
    consoleUrl: 'https://developers.sber.ru/studio',
    consoleLabel: 'developers.sber.ru/studio (Sber Studio)',
    keyPrefix: 'Base64 Authorization Key (MDE5ZGEy...)',
    recommendedModel: 'GigaChat-Pro',
    costNote: 'Bireysel hesaplarda (GIGACHAT_API_PERS) ücretsiz başlangıç token paketi tanımlanır.',
    russiaNote: 'Uygulamamızda Rusya Минцифры kök sertifikaları gömülü olduğu için ekstra sertifika kurulumu gerekmez.',
    steps: [
      'https://developers.sber.ru/studio adresine Sber ID veya telefon numarasıyla giriş yapın.',
      '"Создать проект" (Proje Oluştur) -> "GigaChat API" seçeneğine tıklayın.',
      'Sol menüden "Настройки API" (API Ayarları) -> "Получить ключ" (Create / Get New Key) butonuna basın.',
      'Ekranda üretilen uzun Base64 "Authorization Key" değerini kopyalayın.',
      'Uygulamamızda OAuth Scope olarak bireysel hesap için "GIGACHAT_API_PERS" (kurumsal için B2B/CORP) seçip anahtarı yapıştırın ve "Test Et"e basın.',
    ],
    troubleshooting: [
      'Scope uyuşmazlığı (400/401): Bireysel Sber hesabıyla alınan anahtarlarda mutlaka GIGACHAT_API_PERS seçili olmalıdır.',
    ],
  },
  {
    id: 'gemini',
    shortTitle: '5. Google Gemini',
    fullTitle: '5. Google AI Studio — Gemini Flash (aistudio.google.com)',
    badge: 'Ücretsiz Kota (Rusya Dışı Sunucu)',
    badgeTone: 'bg-sky-100 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200',
    consoleUrl: 'https://aistudio.google.com/apikey',
    consoleLabel: 'aistudio.google.com/apikey (Google AI Studio)',
    keyPrefix: 'AIzaSy... veya AQ....',
    recommendedModel: 'gemini-flash-latest',
    costNote: 'Billing bağlanmamış yeni projelerde günlük ücretsiz okuma kotası sunar.',
    russiaNote: 'DİKKAT: Google, Rusya IP adreslerinden gelen istekleri "User location is not supported" ile engeller. Rusya sunucusunda Gemini kullanmak isterseniz aşağıdaki "6. OpenRouter" üzerinden Gemini seçmeniz önerilir!',
    steps: [
      'https://aistudio.google.com/apikey adresine Google hesabınızla giriş yapın.',
      'Sağ üstteki "Create API key" butonuna tıklayın.',
      'Ücretsiz katman için "Create API key in new project" (Yeni projede oluştur — Prepay/Billing bağlamadan) seçeneğini tıklayın.',
      'Üretilen "AIzaSy..." (veya "AQ....") anahtarını "Copy key" ile kopyalayın.',
      'Uygulamada "Google Gemini API Key" kutusuna yapıştırıp Kaydet’e basın.',
    ],
    troubleshooting: [
      '"User location is not supported for the API use": Sunucu Rusya IP’sinde olduğu için Google doğrudan erişimi engellemektedir; bunun yerine OpenRouter, DeepSeek veya Yandex kullanın.',
    ],
  },
  {
    id: 'openrouter',
    shortTitle: '6. OpenRouter',
    fullTitle: '6. OpenRouter Evrensel AI Geçidi (openrouter.ai/keys)',
    badge: 'Tek Anahtarla Gemini + Claude + GPT + Qwen',
    badgeTone: 'bg-purple-100 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200',
    consoleUrl: 'https://openrouter.ai/keys',
    consoleLabel: 'openrouter.ai/keys (Create Key)',
    billingUrl: 'https://openrouter.ai/settings/credits',
    billingLabel: 'openrouter.ai/settings/credits (Kredi Yükleme)',
    keyPrefix: 'sk-or-v1-...',
    recommendedModel: 'google/gemini-2.5-flash veya deepseek/deepseek-chat-v3-0324',
    costNote: 'Tek bir anahtarla hem Google Gemini 2.5 Flash hem DeepSeek hem Qwen-VL modellerini çalıştırır.',
    russiaNote: 'Rusya sunucusundan Google Gemini’ye takılmadan (bölge engeli olmadan!) erişmenin en pratik yoludur.',
    steps: [
      'https://openrouter.ai/keys adresine Google hesabınızla giriş yapın.',
      '"Create Key" butonuna tıklayın, Name kısmına "Pondera HR" yazın (Credit limit kısmını boş bırakabilirsiniz) ve "Create"e basın.',
      'Ekranda çıkan "sk-or-v1-..." anahtarını kopyalayın.',
      'Ücretsiz modeller dışında Gemini 2.5 Flash / Qwen-VL kullanmak için Credits menüsünden 5 USD bakiye ekleyebilirsiniz.',
      'Uygulamada "OpenRouter API Key" kutusuna yapıştırın, model alanına örneğin "google/gemini-2.5-flash" yazıp "OpenRouter Test"e basın.',
    ],
    troubleshooting: [
      '401 Unauthorized: Anahtarın "sk-or-v1-" önekiyle tam kopyalandığından emin olun.',
    ],
  },
];

export default function AiApiKeyGuideModal({
  isOpen,
  initialProvider = 'deepseek',
  onClose,
}: AiApiKeyGuideModalProps) {
  const [selected, setSelected] = useState<GuideProviderKey>(initialProvider);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (isOpen && initialProvider) {
      setSelected(initialProvider);
    }
  }, [isOpen, initialProvider]);

  if (!isOpen) return null;

  const current =
    PROVIDER_GUIDES.find((g) => g.id === selected) || PROVIDER_GUIDES[0];

  const handleCopyLink = (url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#111A2E] rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-400/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Yeni AI API Anahtarı (Create New API Key) Nasıl Oluşturulur?
              </h2>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Her yapay zeka motoru için adım adım token alma, bakiye ve Rusya sunucu uyumluluk rehberi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Selector Pills */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#131C31] flex flex-wrap gap-1.5">
          {PROVIDER_GUIDES.map((g) => {
            const active = g.id === current.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelected(g.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                }`}
              >
                {g.shortTitle}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Title & Direct Action Buttons */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {current.fullTitle}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${current.badgeTone}`}>
                    {current.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Beklenen Anahtar Formatı:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-indigo-700 dark:text-indigo-300">
                    {current.keyPrefix}
                  </code>{' '}
                  • Önerilen Model:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-emerald-700 dark:text-emerald-300">
                    {current.recommendedModel}
                  </code>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={current.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>API Key Oluşturma Sayfasını Aç</span>
              </a>

              <button
                type="button"
                onClick={() => handleCopyLink(current.consoleUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-xs cursor-pointer"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Link Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Adresi Kopyala</span>
                  </>
                )}
              </button>

              {current.billingUrl && (
                <a
                  href={current.billingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/40 font-semibold text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{current.billingLabel}</span>
                </a>
              )}
            </div>
          </div>

          {/* Numbered Steps */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              Adım Adım Yeni API Key Oluşturma (Create New API Key)
            </h4>
            <div className="space-y-2">
              {current.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800"
                >
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/25 text-indigo-800 dark:text-indigo-200 font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed pt-0.5">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Cost & Russia Compatibility Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Maliyet & Kota Bilgisi</span>
              </div>
              <p className="text-[11px] text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed">
                {current.costNote}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/60 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-200">
                <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span>Rusya Ağı & VPN Durumu</span>
              </div>
              <p className="text-[11px] text-sky-900/90 dark:text-sky-200/90 leading-relaxed">
                {current.russiaNote}
              </p>
            </div>
          </div>

          {/* Troubleshooting */}
          {current.troubleshooting.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Sık Karşılaşılan Hatalar ve Çözümü</span>
              </div>
              {current.troubleshooting.map((tr, i) => (
                <p key={i} className="text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed">
                  • {tr}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Anahtarı aldıktan sonra ilgili kutuya yapıştırıp <strong>Kaydet & Test Et</strong> butonuna basın.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-xs cursor-pointer"
          >
            Anladım, Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

