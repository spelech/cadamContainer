import { query } from './db';
import type { ModelRolesConfig, SystemSettingRecord } from '@/types/settings';
import { fetchAvailableModels } from '@/routes/api/models';

export const DEFAULT_MODEL_ROLES: ModelRolesConfig = {
  parametricModel: 'google/gemini-3.8-flash',
  creativeModel: 'z-ai/glm-5.3-flash',
  inspectionModel: 'google/gemini-3.8-flash',
  auxiliaryModel: 'z-ai/glm-5.3-flash',
  defaultReasoningEffort: 'low',
};

export async function getSystemSetting<T>(
  key: string,
  defaultValue: T | null = null,
): Promise<T | null> {
  try {
    const res = await query<SystemSettingRecord<T>>(
      'SELECT key, category, value, description, updated_at, updated_by FROM system_settings WHERE key = $1',
      [key],
    );
    if (res.rows.length === 0) return defaultValue;
    return res.rows[0].value as T;
  } catch (err) {
    console.error(`[systemSettings] Error fetching setting "${key}":`, err);
    return defaultValue;
  }
}

export async function setSystemSetting<T>(
  key: string,
  value: T,
  category = 'general',
  userId?: string,
  description?: string,
): Promise<T> {
  await query(
    `INSERT INTO system_settings (key, category, value, description, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (key) DO UPDATE SET
       category = EXCLUDED.category,
       value = EXCLUDED.value,
       description = COALESCE(EXCLUDED.description, system_settings.description),
       updated_at = NOW(),
       updated_by = EXCLUDED.updated_by`,
    [key, category, JSON.stringify(value), description ?? null, userId ?? null],
  );
  return value;
}

export async function autoDetectModelRoles(): Promise<ModelRolesConfig> {
  try {
    const models = await fetchAvailableModels();
    if (!models || models.length === 0) {
      return DEFAULT_MODEL_ROLES;
    }

    const toolModel =
      models.find((m) => m.supportsTools && !m.disabled)?.id || models[0].id;
    const visionModel =
      models.find((m) => m.supportsVision && !m.disabled)?.id || toolModel;
    const fastModel =
      models.find(
        (m) =>
          !m.disabled &&
          (m.id.toLowerCase().includes('flash') ||
            m.id.toLowerCase().includes('mini') ||
            m.id.toLowerCase().includes('glm')),
      )?.id || models[0].id;

    return {
      parametricModel: toolModel,
      creativeModel: fastModel,
      inspectionModel: visionModel,
      auxiliaryModel: fastModel,
      defaultReasoningEffort: 'low',
    };
  } catch (err) {
    console.warn(
      '[systemSettings] Auto-detection failed, using static defaults:',
      err,
    );
    return DEFAULT_MODEL_ROLES;
  }
}

export async function getModelRoles(): Promise<ModelRolesConfig> {
  const saved = await getSystemSetting<ModelRolesConfig>('model_roles');
  if (saved && saved.parametricModel && saved.creativeModel) {
    return {
      ...DEFAULT_MODEL_ROLES,
      ...saved,
    };
  }

  // Auto-seed from live LiteLLM models
  const autoSeeded = await autoDetectModelRoles();
  try {
    await setSystemSetting(
      'model_roles',
      autoSeeded,
      'ai',
      undefined,
      'Default AI models and reasoning effort',
    );
  } catch (err) {
    console.warn(
      '[systemSettings] Failed to persist auto-seeded model roles:',
      err,
    );
  }
  return autoSeeded;
}

export async function setModelRoles(
  roles: Partial<ModelRolesConfig>,
  userId?: string,
): Promise<ModelRolesConfig> {
  const current = await getModelRoles();
  const updated: ModelRolesConfig = {
    ...current,
    ...roles,
  };
  await setSystemSetting(
    'model_roles',
    updated,
    'ai',
    userId,
    'Default AI models and reasoning effort',
  );
  return updated;
}
