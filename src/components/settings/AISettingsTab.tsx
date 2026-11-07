'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Globe,
  Cpu,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Zap,
  Server,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

export type ProviderKey =
  | 'deepseek'
  | 'deepseek_ocr'
  | 'yandex'
  | 'gigachat'
  | 'gemini'
  | 'openrouter'
  | 'ru_docs_ocr';

interface AiSettingsFormState {
  activeProvider: ProviderKey;
  fallbackProvider: string;
  hybridOcrEnabled: boolean;

  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekApiKey: string;
  hasDeepseekKey?: boolean;

  deepseekOcrBaseUrl: string;
  deepseekOcrModel: string;
  deepseekOcrApiKey: string;
  hasDeepseekOcrKey?: boolean;

  yandexFolderId: string;
  yandexModel: string;
  yandexApiKey: string;
  hasYandexKey?: boolean;

  gigachatScope: string;
  gigachatModel: string;
  gigachatAuthKey: string;
  hasGigachatKey?: boolean;

  geminiBaseUrl: string;
  geminiModel: string;
  geminiApiKey: string;
  hasGeminiKey?: boolean;

  openrouterModel: string;
  openrouterApiKey: string;
  hasOpenrouterKey?: boolean;

  ruDocsOcrUrl: string;
  ruDocsOcrKey: string;
  hasRuDocsOcr?: boolean;

  updatedAt?: string;
  providerReadiness?: Record<string, boolean>;
}

const DEFAULT_FORM: AiSettingsFormState = {
  activeProvider: 'deepseek',
  fallbackProvider: '',
  hybridOcrEnabled: false,
  deepseekBaseUrl: 'https://api.deepseek.com/v1',
  deepseekModel: 'deepseek-chat',
  deepseekApiKey: '',
  deepseekOcrBaseUrl: 'https://api.siliconflow.com/v1',
  deepseekOcrModel: 'deepseek-ai/deepseek-vl2',
  deepseekOcrApiKey: '',
  yandexFolderId: '',
  yandexModel: 'yandexgpt/latest',
  yandexApiKey: '',
  gigachatScope: 'GIGACHAT_API_PERS',
  gigachatModel: 'GigaChat-Pro',
  gigachatAuthKey: '',
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  geminiModel: 'gemini-flash-latest',
  geminiApiKey: '',
  openrouterModel: 'deepseek/deepseek-chat-v3-0324',
  openrouterApiKey: '',
  ruDocsOcrUrl: '',
  ruDocsOcrKey: '',
};

export default function AISettingsTab() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const isAdmin = !user || user.role === 'admin';

  const [form, setForm] = useState<AiSettingsFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<ProviderKey | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; latencyMs: number; message: string }>
  >({});
  const [discoveredVisionModels, setDiscoveredVisionModels] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/settings/ai')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.settings) {
          setForm((prev) => ({ ...prev, ...json.settings }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMakePrimary = async (provider: ProviderKey) => {
    const nextForm = { ...form, activeProvider: provider };
    setForm(nextForm);
    if (!isAdmin) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', settings: nextForm }),
      });
      const json = await res.json();
      if (json?.success) {
        if (json.settings) setForm((prev) => ({ ...prev, ...json.settings }));
        setFeedback({
          type: 'success',
          text: `Ana yapay zeka motoru "${provider}" olarak güncellendi ve kaydedildi.`,
        });
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', settings: form }),
      });
      const json = await res.json();
      if (json?.success) {
        if (json.settings) setForm((prev) => ({ ...prev, ...json.settings }));
        setFeedback({
          type: 'success',
          text: json.message || 'AI evrak ve bilet okuma ayarları kaydedildi.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: json?.message || 'Ayarlar kaydedilemedi.',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Sunucu ile iletişim kurulamadı.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (provider: ProviderKey) => {
    setTestingProvider(provider);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection',
          provider,
          settings: form,
        }),
      });
      const json = await res.json();
      if (Array.isArray(json?.availableVisionModels) && json.availableVisionModels.length > 0) {
        setDiscoveredVisionModels(json.availableVisionModels);
      }
      if (provider === 'deepseek_ocr' && json?.ok && json?.resolvedModel) {
        setForm((prev) => ({ ...prev, deepseekOcrModel: String(json.resolvedModel) }));
      }
      if (provider === 'gemini' && json?.ok && json?.resolvedModel) {
        setForm((prev) => ({ ...prev, geminiModel: String(json.resolvedModel) }));
      }
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok: Boolean(json?.ok),
          latencyMs: Number(json?.latencyMs || 0),
          message: String(json?.message || 'Test tamamlandı.'),
        },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok: false,
          latencyMs: 0,
          message: 'Test isteği gönderilirken bağlantı hatası oluştu.',
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const toggleKeyVis = (k: string) =>
    setShowKeys((prev) => ({ ...prev, [k]: !prev[k] }));

  if (loading) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2.5 text-xs text-slate-500">
        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
        <span>Yapay Zeka (AI) & Evrak Okuma bağlantı ayarları yükleniyor...</span>
      </div>
    );
  }

  const providerOptions: Array<{ id: ProviderKey; label: string; tag: string }> = [
    {
      id: 'deepseek',
      label: 'DeepSeek AI (Varsayılan — İnsan Gibi Evrak & Bilet Anlama)',
      tag: 'Varsayılan Önerilen',
    },
    {
      id: 'deepseek_ocr',
      label: 'DeepSeek-OCR / DeepSeek-VL2 (Görsel Scan Akışı — SiliconFlow / vLLM)',
      tag: 'Scan Uzmanı',
    },
    {
      id: 'yandex',
      label: 'Yandex Vision OCR + YandexGPT (Rusya İçi VPN’siz)',
      tag: 'Rusya Yerel',
    },
    {
      id: 'gigachat',
      label: 'Sber GigaChat-Pro Vision (Rusya İçi VPN’siz — Минцифры TLS)',
      tag: 'Rusya Yerel',
    },
    {
      id: 'gemini',
      label: 'Google Gemini Flash (Native Vision & PDF — AI Studio)',
      tag: 'Vision & PDF',
    },
    {
      id: 'openrouter',
      label: 'OpenRouter (Çoklu Model Geçidi)',
      tag: 'Alternatif',
    },
    {
      id: 'ru_docs_ocr',
      label: 'RussianDocsOCR (Kendi Sunucunuzdaki Yerel OCR + DeepSeek)',
      tag: 'On-Premise',
    },
  ];

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Kapat
          </button>
        </div>
      )}

      {/* TOP ENGINE SELECTOR & GLOBAL SAVE BAR */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'ru'
                    ? 'ИИ-чтение билетов и сканов документов (DeepSeek + Российские ИИ)'
                    : 'AI Evrak & Bilet Okuma Motoru (DeepSeek Varsayılan + Rusya AI Desteği)'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60">
                  Powerise AI Entegrasyonu
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Klasik kör OCR yerine evrakın tablo düzenini, yolcu/acente ayrımını ve Kiril-Latin pasaportlarını insan gibi anlayan çoklu AI mimarisi.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!isAdmin || saving}
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-500/40 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Tüm AI Ayarlarını Kaydet</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Varsayılan Seçili Yapay Zeka (Bilet Okutma Ekranı Açılış Seçimi)
            </label>
            <select
              value={form.activeProvider}
              onChange={(e) =>
                setForm((p) => ({ ...p, activeProvider: e.target.value as ProviderKey }))
              }
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
            >
              {providerOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <div className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Otomatik Sağlayıcı Geçişi Kapalıdır (Manuel Kontrol)
                </div>
                <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Bilet okuturken <strong>Oku</strong> butonunun hemen yanındaki kutudan hangi AI ile okutulacağını her seferinde seçebilirsiniz; sistem başka AI’a sessizce geçmez.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STEP-BY-STEP DEEPSEEK DOCUMENT SCAN SETUP GUIDE */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/80 dark:from-[#131C31] dark:via-[#11192C] dark:to-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 overflow-hidden">
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-100">
              DeepSeek AI ile “İnsan Gibi Evrak & Bilet Scan Okuma” Kurulum Rehberi (Nasıl Yol İzlemelisiniz?)
            </span>
          </div>
          {guideOpen ? (
            <ChevronUp className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0" />
          )}
        </button>

        {guideOpen && (
          <div className="px-5 pb-5 pt-1 border-t border-indigo-100 dark:border-indigo-900/50 space-y-3 text-xs text-slate-700 dark:text-slate-300">
            <p className="leading-relaxed">
              <strong>Kritik Teknik Bilgi:</strong> DeepSeek’in evrak taramalarını (scan) insan gibi anlayan iki katmanı vardır:
              <strong> (1) DeepSeek-OCR / DeepSeek-VL2</strong> (görseldeki eğri yazıları, mühürleri ve çok sütunlu tabloları insan gözü sırasıyla okuyan görsel model) ve
              <strong> (2) DeepSeek-V3 / Flash</strong> (okunan metinden kimin yolcu, kimin şirket, hangi numaranın pasaport veya PNR olduğunu çıkaran akıl yürütme modeli). İhtiyacınıza göre şu <strong>3 yoldan birini</strong> seçebilirsiniz:
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-indigo-200/70 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-900 dark:text-indigo-300">
                    1. Yol (En Pratik — Önerilen)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold">
                    5 Dakikada Hazır
                  </span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                  1) <strong>platform.deepseek.com</strong> adresinden API Key (<code>sk-...</code>) alıp aşağıdaki <strong>1. Karta</strong> girin.<br />
                  2) Dijital e-bilet PDF’lerini DeepSeek tek başına anında okur.<br />
                  3) WhatsApp/kamera ile çekilmiş <strong>fotoğraf ve scan evraklar</strong> için <strong>2. Karta</strong> SiliconFlow (<code>cloud.siliconflow.com</code>) API Key veya <strong>3. Karta</strong> Yandex Vision Key ekleyin; sistem görüntüyü otomatik okuyup DeepSeek’e yorumlatır!
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-indigo-200/70 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-900 dark:text-indigo-300">
                    2. Yol (Doğrudan DeepSeek-OCR)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 text-[10px] font-semibold">
                    Ağır Scan / Mühürlü Evrak
                  </span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Resmi <code>api.deepseek.com</code> üzerinde <code>DeepSeek-OCR</code> ayrı isimle açılmadığı için, açık kaynak <code>deepseek-ai/DeepSeek-OCR</code> ve <code>deepseek-vl2</code> modellerini barındıran <strong>SiliconFlow</strong> hesabından tek API anahtarı alıp <strong>2. Karta</strong> yapıştırın ve ana sağlayıcıyı <strong>DeepSeek-OCR</strong> seçin.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-indigo-200/70 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-900 dark:text-indigo-300">
                    3. Yol (Rusya İçi VPN’siz / Yerel)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                    Sıfır Dış Ağ Bağımlılığı
                  </span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                  Rusya’da dış API erişimi kısıtlanırsa tek tıkla <strong>Yandex Vision + YandexGPT</strong> veya <strong>Sber GigaChat-Pro</strong> (Rus Минцифры sertifikası gömülüdür) seçebilirsiniz. Veya kendi GPU sunucunuzda <code>vllm serve deepseek-ai/DeepSeek-OCR</code> kurup URL’sini 2. Karta yazabilirsiniz.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PROVIDER CARDS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* CARD 1: DEEPSEEK OFFICIAL CLOUD */}
        <div
          className={`p-4 rounded-2xl bg-white dark:bg-[#131C31] border transition-all space-y-3.5 ${
            form.activeProvider === 'deepseek'
              ? 'border-indigo-400 dark:border-indigo-500/70 ring-1 ring-indigo-400/30'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  1. DeepSeek AI (Resmi API)
                </span>
                {form.activeProvider === 'deepseek' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300">
                    Aktif Ana Motor
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMakePrimary('deepseek')}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Ana Motor Yap
                  </button>
                )}
                {form.hasDeepseekKey && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Anahtar Kayıtlı
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                platform.deepseek.com — Evrak içeriğini insan gibi yorumlayan ana semantik model
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTestProvider('deepseek')}
              disabled={testingProvider === 'deepseek'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingProvider === 'deepseek' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Test Et</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value={form.deepseekBaseUrl}
                onChange={(e) => setForm((p) => ({ ...p, deepseekBaseUrl: e.target.value }))}
                placeholder="https://api.deepseek.com/v1"
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Model Seçimi
              </label>
              <select
                value={form.deepseekModel}
                onChange={(e) => setForm((p) => ({ ...p, deepseekModel: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="deepseek-flash">deepseek-flash (Multimodal Görsel + Hızlı)</option>
                <option value="deepseek-chat">deepseek-chat (DeepSeek-V3 Derin Anlama)</option>
                <option value="deepseek-reasoner">deepseek-reasoner (R1 Muhakeme)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              DeepSeek API Key (<code>sk-...</code>)
            </label>
            <div className="relative">
              <input
                type={showKeys.deepseek ? 'text' : 'password'}
                value={form.deepseekApiKey}
                onChange={(e) => setForm((p) => ({ ...p, deepseekApiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full pl-3 pr-9 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => toggleKeyVis('deepseek')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showKeys.deepseek ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {testResults.deepseek && (
            <div
              className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between ${
                testResults.deepseek.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              }`}
            >
              <span>{testResults.deepseek.message}</span>
              {testResults.deepseek.latencyMs > 0 && (
                <span className="font-mono text-[10px] opacity-80">
                  {testResults.deepseek.latencyMs} ms
                </span>
              )}
            </div>
          )}
        </div>

        {/* CARD 2: DEEPSEEK-OCR / VL2 (SILICONFLOW OR SELF-HOSTED VLLM) */}
        <div
          className={`p-4 rounded-2xl bg-white dark:bg-[#131C31] border transition-all space-y-3.5 ${
            form.activeProvider === 'deepseek_ocr'
              ? 'border-indigo-400 dark:border-indigo-500/70 ring-1 ring-indigo-400/30'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  2. DeepSeek-OCR / VL2 (Görsel Scan Akışı)
                </span>
                {form.activeProvider === 'deepseek_ocr' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300">
                    Aktif Ana Motor
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMakePrimary('deepseek_ocr')}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 cursor-pointer"
                  >
                    Ana Motor Yap & Kaydet
                  </button>
                )}
                {form.hasDeepseekOcrKey && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Anahtar Kayıtlı
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                SiliconFlow bulut veya şirket içi vLLM üzerinde gerçek DeepSeek-OCR / DeepSeek-VL2 modeli
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTestProvider('deepseek_ocr')}
              disabled={testingProvider === 'deepseek_ocr'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingProvider === 'deepseek_ocr' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Test Et</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                OpenAI-Uyumlu Vision URL
              </label>
              <input
                type="text"
                value={form.deepseekOcrBaseUrl}
                onChange={(e) => setForm((p) => ({ ...p, deepseekOcrBaseUrl: e.target.value }))}
                placeholder="https://api.siliconflow.com/v1"
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Görsel Evrak Modeli
              </label>
              <input
                type="text"
                list="deepseek-ocr-models"
                value={form.deepseekOcrModel}
                onChange={(e) => setForm((p) => ({ ...p, deepseekOcrModel: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <datalist id="deepseek-ocr-models">
                {(discoveredVisionModels.length > 0
                  ? discoveredVisionModels
                  : [
                      'deepseek-ai/deepseek-vl2',
                      'Qwen/Qwen2.5-VL-72B-Instruct',
                      'Qwen/Qwen3-VL-32B-Instruct',
                      'Qwen/Qwen2.5-VL-7B-Instruct',
                      'deepseek-ai/DeepSeek-OCR',
                    ]
                ).map((mId) => (
                  <option key={mId} value={mId} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              SiliconFlow / vLLM API Key
            </label>
            <div className="relative">
              <input
                type={showKeys.deepseekOcr ? 'text' : 'password'}
                value={form.deepseekOcrApiKey}
                onChange={(e) => setForm((p) => ({ ...p, deepseekOcrApiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full pl-3 pr-9 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => toggleKeyVis('deepseekOcr')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showKeys.deepseekOcr ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {testResults.deepseek_ocr && (
            <div
              className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between ${
                testResults.deepseek_ocr.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              }`}
            >
              <span>{testResults.deepseek_ocr.message}</span>
              {testResults.deepseek_ocr.latencyMs > 0 && (
                <span className="font-mono text-[10px] opacity-80">
                  {testResults.deepseek_ocr.latencyMs} ms
                </span>
              )}
            </div>
          )}
        </div>

        {/* CARD 3: YANDEX VISION + YANDEXGPT (RUSSIA NATIVE) */}
        <div
          className={`p-4 rounded-2xl bg-white dark:bg-[#131C31] border transition-all space-y-3.5 ${
            form.activeProvider === 'yandex'
              ? 'border-indigo-400 dark:border-indigo-500/70 ring-1 ring-indigo-400/30'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  3. Yandex Vision OCR + YandexGPT (Rusya AI)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                  VPN’siz Rusya
                </span>
                {form.hasYandexKey && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Hazır
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Rusça RZD tren biletleri, pasaportlar ve tablo OCR okumada yüksek doğruluk (Powerise uyumlu)
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTestProvider('yandex')}
              disabled={testingProvider === 'yandex'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/40 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingProvider === 'yandex' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Test Et</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Yandex Cloud Folder ID
              </label>
              <input
                type="text"
                value={form.yandexFolderId}
                onChange={(e) => setForm((p) => ({ ...p, yandexFolderId: e.target.value }))}
                placeholder="b1g..."
                className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                YandexGPT Modeli
              </label>
              <select
                value={form.yandexModel}
                onChange={(e) => setForm((p) => ({ ...p, yandexModel: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="yandexgpt/latest">yandexgpt/latest (Pro)</option>
                <option value="yandexgpt/rc">yandexgpt/rc (Yeni Sürüm)</option>
                <option value="yandexgpt-lite/latest">yandexgpt-lite/latest (Hızlı)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Yandex Service Account API Key (<code>AQVN...</code>)
            </label>
            <div className="relative">
              <input
                type={showKeys.yandex ? 'text' : 'password'}
                value={form.yandexApiKey}
                onChange={(e) => setForm((p) => ({ ...p, yandexApiKey: e.target.value }))}
                placeholder="AQVN..."
                className="w-full pl-3 pr-9 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => toggleKeyVis('yandex')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showKeys.yandex ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {testResults.yandex && (
            <div
              className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between ${
                testResults.yandex.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              }`}
            >
              <span>{testResults.yandex.message}</span>
              {testResults.yandex.latencyMs > 0 && (
                <span className="font-mono text-[10px] opacity-80">
                  {testResults.yandex.latencyMs} ms
                </span>
              )}
            </div>
          )}
        </div>

        {/* CARD 4: SBER GIGACHAT-PRO (RUSSIA NATIVE) */}
        <div
          className={`p-4 rounded-2xl bg-white dark:bg-[#131C31] border transition-all space-y-3.5 ${
            form.activeProvider === 'gigachat'
              ? 'border-indigo-400 dark:border-indigo-500/70 ring-1 ring-indigo-400/30'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  4. Sber GigaChat Vision (Rusya AI)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                  Минцифры Sertifikalı
                </span>
                {form.hasGigachatKey && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    Hazır
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Sberbank kurumsal görsel evrak okuma servisi — Rusya içinde VPN olmadan doğrudan çalışır
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTestProvider('gigachat')}
              disabled={testingProvider === 'gigachat'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/40 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {testingProvider === 'gigachat' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Test Et</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                OAuth Scope
              </label>
              <select
                value={form.gigachatScope}
                onChange={(e) => setForm((p) => ({ ...p, gigachatScope: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="GIGACHAT_API_PERS">GIGACHAT_API_PERS (Bireysel)</option>
                <option value="GIGACHAT_API_B2B">GIGACHAT_API_B2B (Kurumsal Paket)</option>
                <option value="GIGACHAT_API_CORP">GIGACHAT_API_CORP (Kurumsal Pay-as-you-go)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                GigaChat Modeli
              </label>
              <select
                value={form.gigachatModel}
                onChange={(e) => setForm((p) => ({ ...p, gigachatModel: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="GigaChat-Pro">GigaChat-Pro (Vision Destekli)</option>
                <option value="GigaChat-Max">GigaChat-Max (En Yüksek Doğruluk)</option>
                <option value="GigaChat-2-Pro">GigaChat-2-Pro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Authorization Key (Base64 ClientID:Secret)
            </label>
            <div className="relative">
              <input
                type={showKeys.gigachat ? 'text' : 'password'}
                value={form.gigachatAuthKey}
                onChange={(e) => setForm((p) => ({ ...p, gigachatAuthKey: e.target.value }))}
                placeholder="MDE5ZGEy..."
                className="w-full pl-3 pr-9 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={() => toggleKeyVis('gigachat')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showKeys.gigachat ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {testResults.gigachat && (
            <div
              className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between ${
                testResults.gigachat.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              }`}
            >
              <span>{testResults.gigachat.message}</span>
              {testResults.gigachat.latencyMs > 0 && (
                <span className="font-mono text-[10px] opacity-80">
                  {testResults.gigachat.latencyMs} ms
                </span>
              )}
            </div>
          )}
        </div>

        {/* CARD 5: GOOGLE GEMINI & OPENROUTER */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-500" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  5. Google Gemini Flash (Native Vision & PDF) & OpenRouter
                </span>
                {form.hasGeminiKey && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Gemini Anahtar Kayıtlı
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Resmi <code className="font-mono">:generateContent</code> (`X-goog-api-key`) ile hem `AQ....` hem `AIza...` anahtarlarını ve doğrudan PDF/görsel okumayı destekler. Ücretsiz kota için{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-600 dark:text-sky-400 underline font-medium"
                >
                  aistudio.google.com/apikey
                </a>{' '}
                üzerinden <strong>Create API key in new project</strong> (Billing/Prepay bağlamadan) seçin ve <strong>Kaydet</strong>’e basın.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {form.activeProvider !== 'gemini' ? (
                <button
                  type="button"
                  disabled={!isAdmin || saving}
                  onClick={() => handleMakePrimary('gemini')}
                  className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-500/40 cursor-pointer"
                >
                  Gemini Ana Motor Yap & Kaydet
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-indigo-50 dark:bg-indigo-500/25 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-500/40">
                  Aktif Ana Motor: Gemini
                </span>
              )}
              <button
                type="button"
                onClick={() => handleTestProvider('gemini')}
                disabled={testingProvider === 'gemini'}
                className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/20 text-sky-900 dark:text-sky-200 border border-sky-200 dark:border-sky-500/40 cursor-pointer"
              >
                {testingProvider === 'gemini' ? 'Test Ediliyor...' : 'Gemini Test'}
              </button>
              <button
                type="button"
                onClick={() => handleTestProvider('openrouter')}
                disabled={testingProvider === 'openrouter'}
                className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                OpenRouter Test
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Google Gemini API Key (`AQ....` veya `AIzaSy...`)
              </label>
              <div className="relative">
                <input
                  type={showKeys.gemini ? 'text' : 'password'}
                  value={form.geminiApiKey}
                  onChange={(e) => setForm((p) => ({ ...p, geminiApiKey: e.target.value }))}
                  placeholder="AQ.... veya AIzaSy..."
                  className="w-full pl-3 pr-9 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => toggleKeyVis('gemini')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showKeys.gemini ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Gemini Modeli (Resmi AI Studio)
              </label>
              <select
                value={form.geminiModel || 'gemini-flash-latest'}
                onChange={(e) => setForm((p) => ({ ...p, geminiModel: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              >
                <option value="gemini-flash-latest">
                  gemini-flash-latest (Varsayılan — Güncel Flash Vision & PDF)
                </option>
                <option value="gemini-2.5-flash">
                  gemini-2.5-flash (Yüksek Doğruluk — Vision & PDF)
                </option>
                <option value="gemini-2.5-flash-lite">
                  gemini-2.5-flash-lite (En Yüksek Ücretsiz Kota & Hızlı)
                </option>
                <option value="gemini-3-flash-preview">
                  gemini-3-flash-preview (Yeni Nesil Flash Önizleme)
                </option>
                {![
                  'gemini-flash-latest',
                  'gemini-2.5-flash',
                  'gemini-2.5-flash-lite',
                  'gemini-3-flash-preview',
                ].includes(form.geminiModel) &&
                  form.geminiModel && (
                    <option value={form.geminiModel}>{form.geminiModel}</option>
                  )}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                OpenRouter API Key
              </label>
              <div className="relative">
                <input
                  type={showKeys.openrouter ? 'text' : 'password'}
                  value={form.openrouterApiKey}
                  onChange={(e) => setForm((p) => ({ ...p, openrouterApiKey: e.target.value }))}
                  placeholder="sk-or-v1-..."
                  className="w-full pl-3 pr-9 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => toggleKeyVis('openrouter')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showKeys.openrouter ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                OpenRouter Modeli
              </label>
              <input
                type="text"
                value={form.openrouterModel}
                onChange={(e) => setForm((p) => ({ ...p, openrouterModel: e.target.value }))}
                placeholder="deepseek/deepseek-chat-v3-0324"
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          {(testResults.gemini || testResults.openrouter) && (
            <div className="space-y-1.5">
              {testResults.gemini && (
                <div
                  className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between gap-2 ${
                    testResults.gemini.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/70 dark:border-emerald-800/60'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200/70 dark:border-rose-800/60'
                  }`}
                >
                  <span>Gemini: {testResults.gemini.message}</span>
                  {testResults.gemini.latencyMs > 0 && (
                    <span className="font-mono text-[10px] opacity-80 shrink-0">
                      {testResults.gemini.latencyMs} ms
                    </span>
                  )}
                </div>
              )}
              {testResults.openrouter && (
                <div
                  className={`p-2.5 rounded-lg text-[11px] flex items-center justify-between gap-2 ${
                    testResults.openrouter.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/70 dark:border-emerald-800/60'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200/70 dark:border-rose-800/60'
                  }`}
                >
                  <span>OpenRouter: {testResults.openrouter.message}</span>
                  {testResults.openrouter.latencyMs > 0 && (
                    <span className="font-mono text-[10px] opacity-80 shrink-0">
                      {testResults.openrouter.latencyMs} ms
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* CARD 6: SELF-HOSTED RUSSIANDOCSOCR (PORTED FROM POWERISE) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131C31] border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  6. RussianDocsOCR (Kendi Sunucunuz — Powerise Yerel OCR)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Powerise’daki yerel Rusça pasaport/patent/bilet OCR mikroservisi URL bağlantısı
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTestProvider('ru_docs_ocr')}
              disabled={testingProvider === 'ru_docs_ocr'}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/20 text-teal-900 dark:text-teal-200 border border-teal-200 dark:border-teal-500/40 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Ping Test</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sunucu Adresi (URL)
              </label>
              <input
                type="text"
                value={form.ruDocsOcrUrl}
                onChange={(e) => setForm((p) => ({ ...p, ruDocsOcrUrl: e.target.value }))}
                placeholder="https://ocr.pondera.network"
                className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Bearer API Key (Opsiyonel)
              </label>
              <input
                type="password"
                value={form.ruDocsOcrKey}
                onChange={(e) => setForm((p) => ({ ...p, ruDocsOcrKey: e.target.value }))}
                placeholder="Opsiyonel gizli anahtar"
                className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          {testResults.ru_docs_ocr && (
            <div
              className={`p-2.5 rounded-lg text-[11px] ${
                testResults.ru_docs_ocr.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              }`}
            >
              {testResults.ru_docs_ocr.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

