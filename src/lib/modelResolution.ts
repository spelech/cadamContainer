import type { ModelConfig } from '@/types/misc';
import type { Model } from '@shared/types';
import { normalizeModelId } from '@shared/models';

/**
 * Extracts a normalized family identifier from a model ID, name, or provider.
 */
export function detectModelFamily(identifier: string): string {
  const lower = identifier.toLowerCase();

  if (lower.includes('gemini') || lower.includes('google')) return 'gemini';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('claude') || lower.includes('anthropic')) return 'claude';
  if (
    lower.includes('gpt') ||
    lower.includes('openai') ||
    /\bo[1-9]\b/.test(lower)
  )
    return 'gpt';
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('grok') || lower.includes('xai') || lower.includes('x-ai'))
    return 'grok';
  if (lower.includes('glm') || lower.includes('z-ai') || lower.includes('zai'))
    return 'glm';
  if (lower.includes('qwen') || lower.includes('alibaba')) return 'qwen';
  if (lower.includes('llama') || lower.includes('meta')) return 'llama';
  if (
    lower.includes('mistral') ||
    lower.includes('codestral') ||
    lower.includes('pixtral')
  )
    return 'mistral';
  if (lower.includes('kimi') || lower.includes('moonshot')) return 'kimi';
  if (
    lower.includes('hy3') ||
    lower.includes('hy4') ||
    lower.includes('hunyuan')
  )
    return 'hunyuan';

  // Fallback to first segment if namespaced e.g. "myorg/model-a"
  if (lower.includes('/')) {
    return lower.split('/')[0];
  }

  // Fallback to leading word
  return lower.split(/[-_ ]/)[0] || lower;
}

/**
 * Strips namespace prefix (e.g. "google/gemini-3.8-flash" -> "gemini-3.8-flash").
 */
export function getBareModelSlug(id: string): string {
  if (!id) return '';
  return id.includes('/') ? id.split('/').pop()! : id;
}

/**
 * Resolves a model configuration from an available list following a strict hierarchy:
 * 1. Exact match by model ID (or normalized legacy ID).
 * 2. Bare model slug match (e.g. gateway prefix differences like "openrouter/gemini-3.8-flash" vs "google/gemini-3.8-flash").
 * 3. Configured default model (if provided and present in available models).
 * 4. Similar family match (same model family/provider, matching tier/capability like flash/pro/coder if possible).
 * 5. First available model in the list.
 */
export function resolveModelWithFallback(
  models: ModelConfig[],
  requestedModelId?: string,
  preferredDefaultId?: string,
): ModelConfig | undefined {
  if (!models || models.length === 0) {
    return undefined;
  }

  // 1. Exact match (original or normalized)
  if (requestedModelId) {
    const normalized = normalizeModelId(requestedModelId as Model);
    const exact = models.find(
      (m) => m.id === requestedModelId || m.id === normalized,
    );
    if (exact) return exact;

    // 2. Bare slug match (gateway prefix variations)
    const targetSlug = getBareModelSlug(requestedModelId).toLowerCase();
    const slugMatch = models.find(
      (m) => getBareModelSlug(m.id).toLowerCase() === targetSlug,
    );
    if (slugMatch) return slugMatch;
  }

  // 3. Preferred default model (e.g. system setting default role)
  if (preferredDefaultId) {
    const normalizedPref = normalizeModelId(preferredDefaultId as Model);
    const prefMatch = models.find(
      (m) => m.id === preferredDefaultId || m.id === normalizedPref,
    );
    if (prefMatch) return prefMatch;

    const prefSlug = getBareModelSlug(preferredDefaultId).toLowerCase();
    const prefSlugMatch = models.find(
      (m) => getBareModelSlug(m.id).toLowerCase() === prefSlug,
    );
    if (prefSlugMatch) return prefSlugMatch;
  }

  // 4. Similar family match
  if (requestedModelId) {
    const targetFamily = detectModelFamily(requestedModelId);
    const targetLower = requestedModelId.toLowerCase();

    const familyCandidates = models.filter((m) => {
      const mFamily = detectModelFamily(m.id);
      const mProviderFamily = m.provider ? detectModelFamily(m.provider) : '';
      const mNameFamily = detectModelFamily(m.name);
      return (
        mFamily === targetFamily ||
        mProviderFamily === targetFamily ||
        mNameFamily === targetFamily
      );
    });

    if (familyCandidates.length > 0) {
      // Prioritize tier sub-match (e.g. 'flash', 'pro', 'coder', 'reasoning')
      const targetHasFlash =
        targetLower.includes('flash') || targetLower.includes('fast');
      const targetHasPro =
        targetLower.includes('pro') ||
        targetLower.includes('opus') ||
        targetLower.includes('max');
      const targetHasCoder =
        targetLower.includes('coder') || targetLower.includes('code');

      const tierMatch = familyCandidates.find((m) => {
        const mLower = `${m.id} ${m.name}`.toLowerCase();
        if (
          targetHasCoder &&
          (mLower.includes('coder') || mLower.includes('code'))
        )
          return true;
        if (
          targetHasPro &&
          (mLower.includes('pro') ||
            mLower.includes('opus') ||
            mLower.includes('plus'))
        )
          return true;
        if (
          targetHasFlash &&
          (mLower.includes('flash') ||
            mLower.includes('lite') ||
            mLower.includes('fast'))
        )
          return true;
        return false;
      });

      if (tierMatch) return tierMatch;
      return familyCandidates[0];
    }
  }

  // 5. First available model
  return models[0];
}
