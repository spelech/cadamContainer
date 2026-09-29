import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { PARAMETRIC_MODELS } from '@/lib/utils';
import type { ModelConfig, ReasoningEffort } from '@/types/misc';

export interface RawLiteLLMModel {
  id?: string;
  model_name?: string;
  name?: string;
  description?: string;
  provider?: string;
  owned_by?: string;
  supportsTools?: boolean;
  supportsThinking?: boolean;
  supportsVision?: boolean;
  defaultReasoningEffort?: ReasoningEffort;
  reasoningEfforts?: ReasoningEffort[];
  max_output_tokens?: number;
  max_tokens?: number;
  maxOutputTokens?: number;
  model_info?: {
    max_output_tokens?: number;
    max_tokens?: number;
    max_input_tokens?: number;
    supports_thinking?: boolean;
    supports_reasoning?: boolean;
    supports_vision?: boolean;
    supports_function_calling?: boolean;
    reasoning?: {
      mandatory?: boolean;
      default_effort?: string;
      supported_efforts?: string[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FetchAvailableModelsOptions {
  baseUrl?: string;
  apiKey?: string;
  forceRefresh?: boolean;
  ttlMs?: number;
  fetchFn?: typeof fetch;
}

export const DEFAULT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

let cachedModels: ModelConfig[] | null = null;
let cacheTimestamp = 0;

export function clearModelsCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}

export function getModelsCache(): {
  models: ModelConfig[] | null;
  timestamp: number;
} {
  return { models: cachedModels, timestamp: cacheTimestamp };
}

function normalizeProviderName(rawProvider: string): string {
  const lower = rawProvider.toLowerCase().trim();
  switch (lower) {
    case 'google':
      return 'Google';
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'deepseek':
      return 'DeepSeek';
    case 'x-ai':
    case 'xai':
      return 'xAI';
    case 'z-ai':
    case 'zai':
      return 'Z.AI';
    case 'moonshotai':
    case 'moonshot':
      return 'Moonshot AI';
    case 'meta':
    case 'meta-llama':
      return 'Meta';
    case 'mistral':
    case 'mistralai':
      return 'Mistral AI';
    case 'ollama':
      return 'Ollama';
    default:
      return rawProvider
        .split(/[-_ ]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function formatModelName(id: string): string {
  const modelPart = id.includes('/') ? id.split('/')[1] : id;
  return modelPart
    .split(/[-_]+/)
    .map((word) => {
      if (/^\d+(\.\d+)*[a-z]?$/i.test(word)) return word;
      const lower = word.toLowerCase();
      if (lower === 'gpt') return 'GPT';
      if (lower === 'glm') return 'GLM';
      if (lower === 'ai') return 'AI';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function inferProviderFromModel(
  id: string,
  name?: string,
  rawProvider?: string,
  ownedBy?: string,
): string {
  const combined =
    `${id} ${name ?? ''} ${rawProvider ?? ''} ${ownedBy ?? ''}`.toLowerCase();

  // 1. Google (Gemini, Gemma)
  if (
    combined.includes('gemini') ||
    combined.includes('gemma') ||
    combined.includes('google')
  ) {
    return 'Google';
  }
  // 2. Anthropic (Claude)
  if (combined.includes('claude') || combined.includes('anthropic')) {
    return 'Anthropic';
  }
  // 3. OpenAI (GPT, DALL-E, o1, o3, o4, ChatGPT)
  if (
    combined.includes('gpt') ||
    combined.includes('dall-e') ||
    combined.includes('dalle') ||
    combined.includes('chatgpt') ||
    /\bo[1-9](-[a-z0-9]+)?\b/.test(combined) ||
    combined.includes('openai')
  ) {
    return 'OpenAI';
  }
  // 4. DeepSeek
  if (combined.includes('deepseek')) {
    return 'DeepSeek';
  }
  // 5. Qwen / Alibaba
  if (combined.includes('qwen') || combined.includes('alibaba')) {
    return 'Qwen';
  }
  // 6. Meta (Llama)
  if (combined.includes('llama') || combined.includes('meta')) {
    return 'Meta';
  }
  // 7. Mistral (Mistral, Codestral, Pixtral)
  if (
    combined.includes('mistral') ||
    combined.includes('codestral') ||
    combined.includes('pixtral')
  ) {
    return 'Mistral AI';
  }
  // 8. Z.AI (GLM)
  if (
    combined.includes('glm') ||
    combined.includes('z-ai') ||
    combined.includes('zai')
  ) {
    return 'Z.AI';
  }
  // 9. xAI (Grok)
  if (
    combined.includes('grok') ||
    combined.includes('xai') ||
    combined.includes('x-ai')
  ) {
    return 'xAI';
  }
  // 10. Moonshot AI (Kimi)
  if (combined.includes('kimi') || combined.includes('moonshot')) {
    return 'Moonshot AI';
  }
  // 11. Tencent (Hunyuan, Hy3, Hy4)
  if (
    combined.includes('hunyuan') ||
    combined.includes('hy3') ||
    combined.includes('hy4') ||
    combined.includes('tencent')
  ) {
    return 'Tencent';
  }
  // 12. Stability AI
  if (combined.includes('stablediffusion') || combined.includes('stability')) {
    return 'Stability AI';
  }
  // 13. Ollama
  if (combined.includes('ollama')) {
    return 'Ollama';
  }

  // If not inferred from model family, use explicit provider/owned_by if valid and not a generic gateway
  const isGenericGateway = (str?: string) =>
    Boolean(
      str &&
        ['litellm', 'openrouter', 'vertex', 'openai'].includes(
          str.toLowerCase().trim(),
        ),
    );

  if (rawProvider && !isGenericGateway(rawProvider)) {
    return normalizeProviderName(rawProvider);
  }
  if (ownedBy && !isGenericGateway(ownedBy)) {
    return normalizeProviderName(ownedBy);
  }
  if (id.includes('/')) {
    const prefix = id.split('/')[0];
    if (!isGenericGateway(prefix)) {
      return normalizeProviderName(prefix);
    }
  }

  if (rawProvider) {
    return normalizeProviderName(rawProvider);
  }
  return 'LiteLLM';
}

export function transformLiteLLMModels(rawModels: unknown[]): ModelConfig[] {
  if (!Array.isArray(rawModels)) {
    return [];
  }

  const results: ModelConfig[] = [];

  for (const raw of rawModels) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as RawLiteLLMModel;
    const rawId =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : typeof item.model_name === 'string' && item.model_name.trim()
          ? item.model_name.trim()
          : '';
    if (!rawId) continue;
    const id = rawId;

    const known = PARAMETRIC_MODELS.find((m) => m.id === id);
    const info =
      item.model_info && typeof item.model_info === 'object'
        ? item.model_info
        : {};

    let name = item.name;
    if (!name && known?.name) {
      name = known.name;
    } else if (!name) {
      name = formatModelName(id);
    }

    let provider = item.provider;
    if (!provider && known?.provider) {
      provider = known.provider;
    } else {
      provider = inferProviderFromModel(id, name, item.provider, item.owned_by);
    }

    let description = item.description;
    if (!description && known?.description) {
      description = known.description;
    } else if (!description) {
      description = `${name} via LiteLLM gateway`;
    }

    const supportsTools =
      typeof item.supportsTools === 'boolean'
        ? item.supportsTools
        : typeof info.supports_function_calling === 'boolean'
          ? info.supports_function_calling
          : (known?.supportsTools ?? true);

    const supportsThinking =
      typeof item.supportsThinking === 'boolean'
        ? item.supportsThinking
        : typeof info.supports_thinking === 'boolean'
          ? info.supports_thinking
          : typeof info.supports_reasoning === 'boolean'
            ? info.supports_reasoning
            : (known?.supportsThinking ?? true);

    const supportsVision =
      typeof item.supportsVision === 'boolean'
        ? item.supportsVision
        : typeof info.supports_vision === 'boolean'
          ? info.supports_vision
          : (known?.supportsVision ?? true);

    const rawMaxOutput =
      info.max_output_tokens ??
      info.max_tokens ??
      item.max_output_tokens ??
      item.max_tokens ??
      item.maxOutputTokens;
    const maxOutputTokens =
      typeof rawMaxOutput === 'number' && rawMaxOutput > 0
        ? rawMaxOutput
        : known?.maxOutputTokens;

    const reasoningInfo =
      info.reasoning ?? (item.reasoning as Record<string, unknown> | undefined);
    const reasoningMandatory = Boolean(reasoningInfo?.mandatory);
    const supportedEffortsRaw = Array.isArray(reasoningInfo?.supported_efforts)
      ? (reasoningInfo.supported_efforts as string[])
      : undefined;
    const reasoningEfforts = supportedEffortsRaw
      ? (supportedEffortsRaw.filter((e) =>
          ['off', 'low', 'medium', 'high', 'max'].includes(e),
        ) as ReasoningEffort[])
      : undefined;

    let defaultReasoningEffort: ReasoningEffort | undefined;
    if (reasoningMandatory) {
      defaultReasoningEffort = 'low';
    } else if (supportsThinking) {
      defaultReasoningEffort = item.defaultReasoningEffort || 'low';
    }

    results.push({
      id,
      name,
      description,
      provider,
      supportsTools,
      supportsThinking,
      supportsVision,
      maxOutputTokens,
      defaultReasoningEffort,
      reasoningEfforts,
    });
  }

  return results;
}

export async function fetchAvailableModels(
  options?: FetchAvailableModelsOptions,
): Promise<ModelConfig[]> {
  const ttlMs = options?.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = Date.now();

  if (!options?.forceRefresh && cachedModels && now - cacheTimestamp < ttlMs) {
    return cachedModels;
  }

  const rawBaseUrl =
    options?.baseUrl ||
    process.env.LITELLM_BASE_URL ||
    process.env.OPENROUTER_BASE_URL ||
    'http://litellm:4000/v1';
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const apiKey =
    options?.apiKey ||
    process.env.LITELLM_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    'sk-none';
  const fetcher = options?.fetchFn || fetch;

  try {
    // Attempt /model/info first to get rich metadata including max_output_tokens
    let res: Response | null = await fetcher(`${baseUrl}/model/info`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => null);

    // Fallback to /models if /model/info is unavailable, rejected, or unsupported
    if (!res || !res.ok) {
      res = await fetcher(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    }

    if (!res.ok) {
      throw new Error(`LiteLLM gateway responded with status ${res.status}`);
    }

    const data = (await res.json()) as { data?: unknown[] } | unknown[];
    const rawList = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];

    if (rawList.length === 0) {
      return PARAMETRIC_MODELS;
    }

    const transformed = transformLiteLLMModels(rawList);
    if (transformed.length === 0) {
      return PARAMETRIC_MODELS;
    }

    cachedModels = transformed;
    cacheTimestamp = Date.now();
    return transformed;
  } catch (error) {
    console.warn(
      '[api/models] Failed to fetch LiteLLM models, falling back to PARAMETRIC_MODELS:',
      error,
    );
    return cachedModels ?? PARAMETRIC_MODELS;
  }
}

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async () => {
        const models = await fetchAvailableModels();
        return json(models);
      },
    },
  },
});
