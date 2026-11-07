import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';
import {
  AiProviderId,
  AiProviderSettingsRow,
  ensureAiTicketTables,
  getAiProviderSettings,
  hasProviderCredentials,
  isMaskedPlaceholder,
  maskSecretKey,
  testAiProviderConnection,
} from '@/lib/aiTicketEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatSettingsResponse(s: AiProviderSettingsRow) {
  return {
    activeProvider: s.active_provider || 'deepseek',
    fallbackProvider: s.fallback_provider || '',
    hybridOcrEnabled: Boolean(s.hybrid_ocr_enabled),
    deepseekBaseUrl: s.deepseek_base_url || 'https://api.deepseek.com/v1',
    deepseekModel: s.deepseek_model || 'deepseek-flash',
    deepseekApiKey: maskSecretKey(s.deepseek_api_key),
    hasDeepseekKey: Boolean(s.deepseek_api_key && s.deepseek_api_key.trim().length > 0),

    deepseekOcrBaseUrl: s.deepseek_ocr_base_url || 'https://api.siliconflow.com/v1',
    deepseekOcrModel: s.deepseek_ocr_model || 'deepseek-ai/deepseek-vl2',
    deepseekOcrApiKey: maskSecretKey(s.deepseek_ocr_api_key),
    hasDeepseekOcrKey: Boolean(s.deepseek_ocr_api_key && s.deepseek_ocr_api_key.trim().length > 0),

    yandexFolderId: s.yandex_folder_id || '',
    yandexModel: s.yandex_model || 'yandexgpt/latest',
    yandexApiKey: maskSecretKey(s.yandex_api_key),
    hasYandexKey: Boolean(
      s.yandex_folder_id.trim().length > 0 && s.yandex_api_key.trim().length > 0
    ),

    gigachatScope: s.gigachat_scope || 'GIGACHAT_API_PERS',
    gigachatModel: s.gigachat_model || 'GigaChat-Pro',
    gigachatAuthKey: maskSecretKey(s.gigachat_auth_key),
    hasGigachatKey: Boolean(s.gigachat_auth_key && s.gigachat_auth_key.trim().length > 0),

    geminiBaseUrl:
      s.gemini_base_url || 'https://generativelanguage.googleapis.com/v1beta/openai',
    geminiModel: s.gemini_model || 'gemini-2.0-flash',
    geminiApiKey: maskSecretKey(s.gemini_api_key),
    hasGeminiKey: Boolean(s.gemini_api_key && s.gemini_api_key.trim().length > 0),

    openrouterModel: s.openrouter_model || 'deepseek/deepseek-chat-v3-0324',
    openrouterApiKey: maskSecretKey(s.openrouter_api_key),
    hasOpenrouterKey: Boolean(s.openrouter_api_key && s.openrouter_api_key.trim().length > 0),

    ruDocsOcrUrl: s.ru_docs_ocr_url || '',
    ruDocsOcrKey: maskSecretKey(s.ru_docs_ocr_key),
    hasRuDocsOcr: Boolean(s.ru_docs_ocr_url && s.ru_docs_ocr_url.trim().length > 0),

    updatedAt: s.updated_at || '',
    providerReadiness: {
      deepseek: hasProviderCredentials('deepseek', s),
      deepseek_ocr: hasProviderCredentials('deepseek_ocr', s),
      yandex: hasProviderCredentials('yandex', s),
      gigachat: hasProviderCredentials('gigachat', s),
      gemini: hasProviderCredentials('gemini', s),
      openrouter: hasProviderCredentials('openrouter', s),
      ru_docs_ocr: hasProviderCredentials('ru_docs_ocr', s),
    },
  };
}

export async function GET() {
  try {
    const current = getAiProviderSettings();
    return NextResponse.json({
      success: true,
      settings: formatSettingsResponse(current),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'AI ayarları okunamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = getSessionUserFromRequest(request);
    if (sessionUser && sessionUser.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'Bu işlem için Sistem Yöneticisi (Admin) yetkisi gereklidir.' },
        { status: 403 }
      );
    }

    const db = ensureAiTicketTables();
    const current = getAiProviderSettings();
    const body = await request.json();
    const action = body?.action || 'save';
    const incoming = body?.settings || {};

    const resolveSecret = (incomingVal: string | undefined, existingVal: string) => {
      if (incomingVal === undefined || incomingVal === null) return existingVal;
      if (isMaskedPlaceholder(incomingVal)) return existingVal;
      return String(incomingVal).trim();
    };

    const merged: AiProviderSettingsRow = {
      id: 1,
      active_provider: (incoming.activeProvider || current.active_provider || 'deepseek') as AiProviderId,
      fallback_provider:
        incoming.fallbackProvider !== undefined
          ? String(incoming.fallbackProvider)
          : current.fallback_provider,
      hybrid_ocr_enabled:
        incoming.hybridOcrEnabled !== undefined
          ? incoming.hybridOcrEnabled
            ? 1
            : 0
          : current.hybrid_ocr_enabled,
      deepseek_api_key: resolveSecret(incoming.deepseekApiKey, current.deepseek_api_key),
      deepseek_base_url: String(
        incoming.deepseekBaseUrl ?? current.deepseek_base_url ?? 'https://api.deepseek.com/v1'
      ).trim(),
      deepseek_model: String(
        incoming.deepseekModel ?? current.deepseek_model ?? 'deepseek-flash'
      ).trim(),
      deepseek_ocr_base_url: String(
        incoming.deepseekOcrBaseUrl ??
          current.deepseek_ocr_base_url ??
          'https://api.siliconflow.com/v1'
      ).trim(),
      deepseek_ocr_api_key: resolveSecret(
        incoming.deepseekOcrApiKey,
        current.deepseek_ocr_api_key
      ),
      deepseek_ocr_model: String(
        incoming.deepseekOcrModel ?? current.deepseek_ocr_model ?? 'deepseek-ai/deepseek-vl2'
      ).trim(),
      yandex_folder_id: String(
        incoming.yandexFolderId ?? current.yandex_folder_id ?? ''
      ).trim(),
      yandex_api_key: resolveSecret(incoming.yandexApiKey, current.yandex_api_key),
      yandex_model: String(
        incoming.yandexModel ?? current.yandex_model ?? 'yandexgpt/latest'
      ).trim(),
      gigachat_auth_key: resolveSecret(incoming.gigachatAuthKey, current.gigachat_auth_key),
      gigachat_scope: String(
        incoming.gigachatScope ?? current.gigachat_scope ?? 'GIGACHAT_API_PERS'
      ).trim(),
      gigachat_model: String(
        incoming.gigachatModel ?? current.gigachat_model ?? 'GigaChat-Pro'
      ).trim(),
      gemini_api_key: resolveSecret(incoming.geminiApiKey, current.gemini_api_key),
      gemini_base_url: String(
        incoming.geminiBaseUrl ??
          current.gemini_base_url ??
          'https://generativelanguage.googleapis.com/v1beta/openai'
      ).trim(),
      gemini_model: String(
        incoming.geminiModel ?? current.gemini_model ?? 'gemini-2.0-flash'
      ).trim(),
      openrouter_api_key: resolveSecret(incoming.openrouterApiKey, current.openrouter_api_key),
      openrouter_model: String(
        incoming.openrouter_model ??
          incoming.openrouterModel ??
          current.openrouter_model ??
          'deepseek/deepseek-chat-v3-0324'
      ).trim(),
      ru_docs_ocr_url: String(incoming.ruDocsOcrUrl ?? current.ru_docs_ocr_url ?? '').trim(),
      ru_docs_ocr_key: resolveSecret(incoming.ruDocsOcrKey, current.ru_docs_ocr_key),
      updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    if (action === 'test_connection') {
      const targetProvider = (body?.provider || merged.active_provider || 'deepseek') as AiProviderId;
      const result = await testAiProviderConnection(targetProvider, merged);
      return NextResponse.json({
        success: result.ok,
        ok: result.ok,
        latencyMs: result.latencyMs,
        message: result.message,
        modelReply: result.modelReply || '',
        resolvedModel: result.resolvedModel || '',
        availableVisionModels: result.availableVisionModels || [],
      });
    }

    db.prepare(
      `UPDATE ai_provider_settings SET
        active_provider = ?,
        fallback_provider = ?,
        hybrid_ocr_enabled = ?,
        deepseek_api_key = ?,
        deepseek_base_url = ?,
        deepseek_model = ?,
        deepseek_ocr_base_url = ?,
        deepseek_ocr_api_key = ?,
        deepseek_ocr_model = ?,
        yandex_folder_id = ?,
        yandex_api_key = ?,
        yandex_model = ?,
        gigachat_auth_key = ?,
        gigachat_scope = ?,
        gigachat_model = ?,
        gemini_api_key = ?,
        gemini_base_url = ?,
        gemini_model = ?,
        openrouter_api_key = ?,
        openrouter_model = ?,
        ru_docs_ocr_url = ?,
        ru_docs_ocr_key = ?,
        updated_at = ?
       WHERE id = 1`
    ).run(
      merged.active_provider,
      merged.fallback_provider,
      merged.hybrid_ocr_enabled,
      merged.deepseek_api_key,
      merged.deepseek_base_url,
      merged.deepseek_model,
      merged.deepseek_ocr_base_url,
      merged.deepseek_ocr_api_key,
      merged.deepseek_ocr_model,
      merged.yandex_folder_id,
      merged.yandex_api_key,
      merged.yandex_model,
      merged.gigachat_auth_key,
      merged.gigachat_scope,
      merged.gigachat_model,
      merged.gemini_api_key,
      merged.gemini_base_url,
      merged.gemini_model,
      merged.openrouter_api_key,
      merged.openrouter_model,
      merged.ru_docs_ocr_url,
      merged.ru_docs_ocr_key,
      merged.updated_at
    );

    const updated = getAiProviderSettings();
    return NextResponse.json({
      success: true,
      message: 'Yapay Zeka (AI) ve Evrak Okuma bağlantı ayarları kaydedildi.',
      settings: formatSettingsResponse(updated),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'AI ayarları kaydedilemedi.' },
      { status: 500 }
    );
  }
}

