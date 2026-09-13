import { createFileRoute } from '@tanstack/react-router';
import { json, preflight } from '@/server/api';
import { PARAMETRIC_MODELS } from '@/lib/utils';
import type { ModelConfig } from '@/types/misc';

export interface RawLiteLLMModel {
  id?: string;
  name?: string;
  description?: string;
  provider?: string;
  owned_by?: string;
  supportsTools?: boolean;
  supportsThinking?: boolean;
  supportsVision?: boolean;
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

export function transformLiteLLMModels(rawModels: unknown[]): ModelConfig[] {
  if (!Array.isArray(rawModels)) {
    return [];
  }

  const results: ModelConfig[] = [];

  for (const raw of rawModels) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as RawLiteLLMModel;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) continue;

    const known = PARAMETRIC_MODELS.find((m) => m.id === id);

    let provider = item.provider;
    if (!provider && known?.provider) {
      provider = known.provider;
    } else if (!provider && item.owned_by) {
      provider = normalizeProviderName(item.owned_by);
    } else if (!provider && id.includes('/')) {
      provider = normalizeProviderName(id.split('/')[0]);
    } else if (!provider) {
      provider = 'LiteLLM';
    }

    let name = item.name;
    if (!name && known?.name) {
      name = known.name;
    } else if (!name) {
      name = formatModelName(id);
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
        : (known?.supportsTools ?? true);

    const supportsThinking =
      typeof item.supportsThinking === 'boolean'
        ? item.supportsThinking
        : (known?.supportsThinking ?? true);

    const supportsVision =
      typeof item.supportsVision === 'boolean'
        ? item.supportsVision
        : (known?.supportsVision ?? true);

    results.push({
      id,
      name,
      description,
      provider,
      supportsTools,
      supportsThinking,
      supportsVision,
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
    process.env.OPENROUTER_BASE_URL ||
    'http://litellm:4000/v1';
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/models`;
  const apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY || 'sk-none';
  const fetcher = options?.fetchFn || fetch;

  try {
    const res = await fetcher(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

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
