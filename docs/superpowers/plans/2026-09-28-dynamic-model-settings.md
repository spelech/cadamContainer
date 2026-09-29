# Dynamic Model Roles & Extensible System Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an extensible database-backed system settings architecture and a smart Settings UI to configure default AI models (Parametric, Creative, Visual Inspection, Auxiliary) and reasoning effort dynamically from live LiteLLM gateway capabilities.

**Architecture:** A new `system_settings` table in PostgreSQL stores extensible JSONB configurations by key (`'model_roles'`). A dedicated server DAO and API route (`/api/system-settings`) validate assignments against live LiteLLM models and auto-seed defaults. The frontend Settings view adds a "Default AI Models & Roles" card with capability-aware badges and warning indicators. The app consumers (`PromptView`, `EditorView`, `aiChat`) dynamically resolve models through the settings hierarchy.

**Tech Stack:** Node.js / TanStack Start, PostgreSQL (`pg`), React 18, React Query (`@tanstack/react-query`), Tailwind CSS, Lucide icons, Vitest.

## Global Constraints

- Strictly follow `AGENTS.md` versioning rules (bump version in `package.json`).
- Do not modify `entrypoint.sh` or `Dockerfile`.
- Preserve existing comments and docstrings.
- Ensure all database queries run parameterized through `src/server/db.ts`.
- Maintain backwards compatibility: if LiteLLM is momentarily offline or a model is unconfigured, fall back gracefully to the next capable model without crashing.

---

### Task 1: Database Schema & System Settings DAO

**Files:**

- Modify: `src/server/db.ts:190-205`
- Create: `src/server/systemSettings.ts`
- Create: `src/server/systemSettings.test.ts`
- Create: `src/types/settings.ts`

**Interfaces:**

- Consumes: `query` from `src/server/db.ts`, `fetchAvailableModels` from `src/routes/api/models.ts`
- Produces:

  ```typescript
  export interface ModelRolesConfig {
    parametricModel: string;
    creativeModel: string;
    inspectionModel: string;
    auxiliaryModel: string;
    defaultReasoningEffort: 'off' | 'low' | 'medium' | 'high' | 'max';
  }
  export async function getSystemSetting<T>(
    key: string,
    defaultValue?: T,
  ): Promise<T | null>;
  export async function setSystemSetting<T>(
    key: string,
    value: T,
    category?: string,
    userId?: string,
  ): Promise<T>;
  export async function getModelRoles(): Promise<ModelRolesConfig>;
  export async function setModelRoles(
    roles: Partial<ModelRolesConfig>,
    userId?: string,
  ): Promise<ModelRolesConfig>;
  ```

- [ ] **Step 1: Define shared types in `src/types/settings.ts`**

```typescript
import type { ReasoningEffort } from './misc';

export interface ModelRolesConfig {
  parametricModel: string;
  creativeModel: string;
  inspectionModel: string;
  auxiliaryModel: string;
  defaultReasoningEffort: ReasoningEffort;
}

export interface SystemSettingRecord<T = unknown> {
  key: string;
  category: string;
  value: T;
  description?: string;
  updated_at: string;
  updated_by?: string;
}
```

- [ ] **Step 2: Add `system_settings` table to `SCHEMA_SQL` in `src/server/db.ts`**

In `src/server/db.ts`, append before `COMMIT;`:

```sql
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general',
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS system_settings_category_idx ON system_settings(category);
```

- [ ] **Step 3: Write failing unit test `src/server/systemSettings.test.ts`**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSystemSetting,
  setSystemSetting,
  getModelRoles,
} from './systemSettings';
import { closePool } from './db';

describe('System Settings DAO', () => {
  after(async () => {
    await closePool();
  });

  it('can set and retrieve an arbitrary JSON setting', async () => {
    const testVal = { foo: 'bar', count: 42 };
    await setSystemSetting('test_key', testVal, 'test');
    const retrieved = await getSystemSetting('test_key');
    assert.deepEqual(retrieved, testVal);
  });

  it('retrieves default model roles with fallback', async () => {
    const roles = await getModelRoles();
    assert.ok(roles.parametricModel);
    assert.ok(roles.creativeModel);
    assert.ok(roles.defaultReasoningEffort);
  });
});
```

- [ ] **Step 4: Implement `src/server/systemSettings.ts`**

```typescript
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
  await setSystemSetting(
    'model_roles',
    autoSeeded,
    'ai',
    undefined,
    'Default AI models and reasoning effort',
  );
  return autoSeeded;
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
          m.id.toLowerCase().includes('flash') ||
          m.id.toLowerCase().includes('mini'),
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
```

- [ ] **Step 5: Run tests**

Run: `npm test src/server/systemSettings.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/settings.ts src/server/db.ts src/server/systemSettings.ts src/server/systemSettings.test.ts
git commit -m "feat(server): add system_settings table and model roles DAO"
```

---

### Task 2: Server API Route (`/api/system-settings`)

**Files:**

- Create: `src/routes/api/system-settings.ts`
- Create: `src/routes/api/system-settings.test.ts`

**Interfaces:**

- Consumes: `requireUser`, `json`, `preflight` from `src/server/api.ts`, `getModelRoles`, `setModelRoles` from `src/server/systemSettings.ts`
- Produces: API endpoint supporting `GET` and `PATCH`

- [ ] **Step 1: Write test `src/routes/api/system-settings.test.ts`**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleSystemSettingsRequest } from './system-settings';

describe('System Settings API Handler', () => {
  it('handles GET request returning model roles', async () => {
    const req = new Request('http://localhost/api/system-settings', {
      method: 'GET',
    });
    const res = await handleSystemSettingsRequest(req, { bypassAuth: true });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.settings?.model_roles);
  });
});
```

- [ ] **Step 2: Implement `src/routes/api/system-settings.ts`**

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { json, preflight, requireUser } from '@/server/api';
import {
  getModelRoles,
  setModelRoles,
  autoDetectModelRoles,
  getSystemSetting,
  setSystemSetting,
} from '@/server/systemSettings';

export async function handleSystemSettingsRequest(
  request: Request,
  options: { bypassAuth?: boolean } = {},
) {
  if (request.method === 'OPTIONS') {
    return preflight();
  }

  let user = null;
  if (!options.bypassAuth) {
    try {
      user = await requireUser(request);
    } catch {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const key = url.searchParams.get('key');
    if (key === 'model_roles' || !key) {
      const modelRoles = await getModelRoles();
      return json({
        settings: {
          model_roles: modelRoles,
        },
      });
    }

    const setting = await getSystemSetting(key);
    return json({ settings: { [key]: setting } });
  }

  if (request.method === 'PATCH' || request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'auto_detect_model_roles') {
      const detected = await autoDetectModelRoles();
      const updated = await setModelRoles(detected, user?.id);
      return json({ settings: { model_roles: updated } });
    }

    if (body.key === 'model_roles' && body.value) {
      const updated = await setModelRoles(body.value, user?.id);
      return json({ settings: { model_roles: updated } });
    }

    if (body.key && body.value !== undefined) {
      const updated = await setSystemSetting(
        body.key,
        body.value,
        body.category || 'general',
        user?.id,
        body.description,
      );
      return json({ settings: { [body.key]: updated } });
    }

    return json({ error: 'Invalid request body' }, 400);
  }

  return json({ error: 'Method not allowed' }, 405);
}

export const Route = createFileRoute('/api/system-settings')({
  loader: ({ request }) => handleSystemSettingsRequest(request),
});
```

- [ ] **Step 3: Run test**

Run: `npm test src/routes/api/system-settings.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/system-settings.ts src/routes/api/system-settings.test.ts
git commit -m "feat(api): add /api/system-settings route for GET and PATCH"
```

---

### Task 3: Backend Model Resolution Integration

**Files:**

- Modify: `src/server/aiChat.ts:1145-1165`

**Interfaces:**

- Consumes: `getModelRoles` from `src/server/systemSettings.ts`
- Produces: Dynamic resolution of `chatModel` using database defaults instead of hardcodes.

- [ ] **Step 1: Update `chatModel` in `src/server/aiChat.ts`**

Replace:

```typescript
function chatModel(conversation: ConversationAccess, model: Model) {
  if (conversation.type === 'creative') {
    if (model === 'quality' || model === 'fast' || model === 'ultra') {
      return (
        env('LITELLM_CREATIVE_MODEL') ||
        env('LITELLM_AUXILIARY_MODEL') ||
        'glm-5.3-flash'
      );
    }
    return model
      ? normalizeModelId(model)
      : env('LITELLM_CREATIVE_MODEL') ||
          env('LITELLM_AUXILIARY_MODEL') ||
          'glm-5.3-flash';
  }
  return normalizeModelId(model);
}
```

With async-aware resolution or cached system default:

```typescript
let cachedModelRoles: ModelRolesConfig | null = null;
let lastRolesFetch = 0;

export async function resolveConfiguredModel(
  conversationType: 'parametric' | 'creative' | undefined,
  requestedModel?: string,
): Promise<string> {
  const now = Date.now();
  if (!cachedModelRoles || now - lastRolesFetch > 30000) {
    cachedModelRoles = await getModelRoles().catch(() => DEFAULT_MODEL_ROLES);
    lastRolesFetch = now;
  }

  const isCreativeMesh =
    conversationType === 'creative' ||
    requestedModel === 'quality' ||
    requestedModel === 'fast' ||
    requestedModel === 'ultra';

  if (isCreativeMesh) {
    return (
      env('LITELLM_CREATIVE_MODEL') ||
      cachedModelRoles?.creativeModel ||
      env('LITELLM_AUXILIARY_MODEL') ||
      'glm-5.3-flash'
    );
  }

  if (requestedModel && requestedModel !== 'default') {
    return normalizeModelId(requestedModel as Model);
  }

  return (
    cachedModelRoles?.parametricModel ||
    env('OPENROUTER_MODEL') ||
    'google/gemini-3.8-flash'
  );
}
```

- [ ] **Step 2: Update `handleAiChatRequest` to await `resolveConfiguredModel`**

In `src/server/aiChat.ts:1368`:

```typescript
const actualModelId = await resolveConfiguredModel(
  conversation.type,
  rawBody.model,
);
```

- [ ] **Step 3: Run existing aiChat tests**

Run: `npm test src/server/aiChatReasoning.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/aiChat.ts
git commit -m "feat(chat): resolve models dynamically against system settings"
```

---

### Task 4: Client Hook (`useSystemSettings`)

**Files:**

- Create: `src/hooks/useSystemSettings.ts`

**Interfaces:**

- Consumes: `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`, `apiUrl` from `@/lib/api`
- Produces: `useSystemSettings()`, `useUpdateModelRoles()`, `useAutoDetectModelRoles()`

- [ ] **Step 1: Implement `src/hooks/useSystemSettings.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import type { ModelRolesConfig } from '@/types/settings';

const SYSTEM_SETTINGS_QUERY_KEY = ['system_settings', 'model_roles'];

export function useSystemSettings() {
  const query = useQuery<{ model_roles: ModelRolesConfig }>({
    queryKey: SYSTEM_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(apiUrl('system-settings?key=model_roles'));
      if (!res.ok) throw new Error('Failed to load system settings');
      const data = await res.json();
      return data.settings;
    },
    staleTime: 60 * 1000,
  });

  return {
    modelRoles: query.data?.model_roles,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useUpdateModelRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roles: Partial<ModelRolesConfig>) => {
      const res = await fetch(apiUrl('system-settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'model_roles', value: roles }),
      });
      if (!res.ok) throw new Error('Failed to update model roles');
      const data = await res.json();
      return data.settings.model_roles;
    },
    onSuccess: (updatedRoles) => {
      queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, {
        model_roles: updatedRoles,
      });
      queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY });
    },
  });
}

export function useAutoDetectModelRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl('system-settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_detect_model_roles' }),
      });
      if (!res.ok) throw new Error('Failed to auto-detect model roles');
      const data = await res.json();
      return data.settings.model_roles;
    },
    onSuccess: (updatedRoles) => {
      queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, {
        model_roles: updatedRoles,
      });
      queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSystemSettings.ts
git commit -m "feat(client): add useSystemSettings hook for model roles"
```

---

### Task 5: Settings UI - "Default AI Models & Roles" Card

**Files:**

- Modify: `src/views/SettingsView.tsx`

**Interfaces:**

- Consumes: `useAvailableModels`, `useSystemSettings`, `useUpdateModelRoles`, `useAutoDetectModelRoles`
- Produces: Interactive settings card with model comboboxes, capability badges, warning pills, save/reset buttons.

- [ ] **Step 1: Add "Default AI Models & Roles" section in `src/views/SettingsView.tsx`**

Include:

- Dropdowns for:
  - Parametric (CAD) Model (with 🛠️ Tools priority and ⚠️ Warning if missing `supportsTools`)
  - Creative (Mesh) Model
  - Visual Inspection Model (with 👁️ Vision priority and ⚠️ Warning if missing `supportsVision`)
  - Auxiliary Model
  - Default Reasoning Effort (`Off`, `Low`, `Medium`, `High`, `Max`)
- Save and Auto-Detect buttons with loading spinners and toasts.

- [ ] **Step 2: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat(ui): add Default AI Models & Roles card to Settings view"
```

---

### Task 6: PromptView & EditorView Dynamic Defaults

**Files:**

- Modify: `src/views/PromptView.tsx:50-65`
- Modify: `src/views/EditorView.tsx:190-205`

**Interfaces:**

- Consumes: `useSystemSettings`
- Produces: Automatic initialization of selected model and reasoning effort from system defaults.

- [ ] **Step 1: Update `src/views/PromptView.tsx`**

When `modelRoles` is loaded:

- Initialize `model` state to `modelRoles.parametricModel`.
- Initialize reasoning effort state to `modelRoles.defaultReasoningEffort`.

- [ ] **Step 2: Update `src/views/EditorView.tsx`**

Use `modelRoles.parametricModel` as the fallback model for new or unspecified conversations.

- [ ] **Step 3: Bump version to `0.7.0` in `package.json` per `AGENTS.md`**

- [ ] **Step 4: Commit**

```bash
git add src/views/PromptView.tsx src/views/EditorView.tsx package.json
git commit -m "feat: consume dynamic model roles in PromptView and EditorView (v0.7.0)"
```

---

### Task 7: End-to-End Build & Live Verification

- [ ] **Step 1: Run all unit tests**
      Run: `npm test`
      Expected: PASS

- [ ] **Step 2: Rebuild Docker image & restart CADAM container**
      Run: `docker build -t ghcr.io/spelech/cadamcontainer:latest . && docker compose -f /containers/ai/docker-compose.yaml up -d --no-deps cadam`
      Expected: Build succeeds, container restarts cleanly.

- [ ] **Step 3: Verify Settings API**
      Run: `curl -s http://localhost:8408/api/system-settings | jq .`
      Expected: Returns JSON with auto-seeded `model_roles`.

- [ ] **Step 4: Live smoke test with user**
- Navigate to `https://cadam.wileyriley.com/settings`.
- Confirm the new card renders and models can be selected and saved.
- Check prompt bar on `https://cadam.wileyriley.com/` reflects the updated default.
