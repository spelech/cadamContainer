# Dynamic Model Roles & Extensible System Settings Design

**Date**: 2026-09-28  
**Status**: Approved by User  
**Target Version**: v0.7.0

---

## 1. Overview & Motivation

AI model ecosystems evolve rapidly with frequent releases, deprecations, and pricing shifts. Previously, CADAM relied on hardcoded model IDs (such as `google/gemini-3.8-flash` in frontend state and static fallbacks in backend functions) or static container environment variables (`LITELLM_CREATIVE_MODEL`, `LITELLM_AUXILIARY_MODEL`).

This design establishes an **extensible, database-backed system settings architecture** with **dynamic model role configuration** and **smart capability matching** against any live LiteLLM gateway.

---

## 2. System Architecture & Extensible Schema

### 2.1 Database Schema (`system_settings` Table)

A versatile PostgreSQL key-value document store is added to CADAM's database:

```sql
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  category TEXT DEFAULT 'general',
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
```

### 2.2 Model Roles Schema (`key = 'model_roles'`)

The `value` column for key `'model_roles'` contains:

```typescript
export interface ModelRolesConfig {
  parametricModel: string; // Default for OpenSCAD text-to-CAD (requires tool calling)
  creativeModel: string; // Default for Mesh mode turns
  inspectionModel: string; // Default for STL critique & verification (requires vision)
  auxiliaryModel: string; // Default for background titling & prompt expansion
  defaultReasoningEffort: 'off' | 'low' | 'medium' | 'high' | 'max';
}
```

### 2.3 Auto-Seeding Heuristic

If no `'model_roles'` row exists in `system_settings` on startup or first query, the system dynamically generates defaults by inspecting models discovered from LiteLLM (`/model/info` or `/models`):

- `parametricModel`: First model advertising `supportsTools: true` (falls back to first discovered model).
- `inspectionModel`: First model advertising `supportsVision: true`.
- `creativeModel`: First model with generative mesh or high-capability flag.
- `auxiliaryModel`: First lightweight/fast flash model (e.g., `glm-5.3-flash` or `gemini-3.8-flash`).
- `defaultReasoningEffort`: `'low'`.

---

## 3. Server-Side Endpoints & Resolution Hierarchy

### 3.1 API Endpoints

- **`GET /api/system/settings`**:
  - Authenticated route.
  - Returns `{ settings: Record<string, any> }` or specific category.
  - Automatically merges system-wide settings with per-user profile overrides if present.
- **`PATCH /api/system/settings`**:
  - Authenticated route.
  - Accepts `{ key: string, value: Record<string, any> }`.
  - Validates model IDs against LiteLLM available models.
  - Updates `system_settings` and records `updated_by` and `updated_at`.

### 3.2 Model Resolution Hierarchy

When generating responses in [`aiChat.ts`](file:///containers/ai/cadam/src/server/aiChat.ts), [`visualInspection.ts`](file:///containers/ai/cadam/src/server/visualInspection.ts), and auxiliary services:

1. **Explicit Request Payload**: Model specified directly in the request (unless it matches legacy quality strings like `quality` or `fast`, which route to the creative role model).
2. **Per-User Override**: User-specific preference stored in profile/local storage.
3. **Database System Default**: Setting configured in `system_settings` (`key = 'model_roles'`).
4. **Auto-Discovered Capable Model**: First model in LiteLLM matching the required capability.
5. **Environment Variable Fallback**: `LITELLM_CREATIVE_MODEL`, `LITELLM_AUXILIARY_MODEL`, etc.

---

## 4. Frontend UI & Smart Capability Badging

### 4.1 Settings View (`src/views/SettingsView.tsx`)

A new card **"Default AI Models & Roles"** is added with:

- **Parametric (CAD) Model Selector**:
  - Displays all discovered LiteLLM models.
  - Prioritizes models with 🛠️ `supportsTools`.
  - Shows warning badge ⚠️ _Lacks Tool Calling support_ if an incompatible model is chosen.
- **Creative (Mesh) Model Selector**:
  - Dropdown for mesh generation role.
- **Visual Inspection Model Selector**:
  - Displays all discovered LiteLLM models.
  - Prioritizes models with 👁️ `supportsVision`.
  - Shows warning badge ⚠️ _Lacks Vision capability_ if an incompatible model is chosen.
- **Auxiliary Model Selector**:
  - Dropdown for background chat titling and prompt expansion.
- **Default Reasoning Effort Selector**:
  - Radio/pill selector: `Off`, `Low`, `Medium`, `High`, `Max`.
- **Action Controls**:
  - **"Save System Defaults"**: Persists configuration via `PATCH /api/system/settings`.
  - **"Auto-Detect Defaults"**: Evaluates current LiteLLM catalog and picks the best matching models per capability.

### 4.2 Seamless Consumer Integration

- **`PromptView.tsx`**: Initializes model selection from the dynamic `parametricModel` setting (instead of the previous hardcoded `google/gemini-3.8-flash`).
- **`EditorView.tsx`**: Initializes conversation model defaults from the dynamic setting.
- **`TextAreaChat.tsx`**: Reflects the user's default reasoning effort.

---

## 5. Error Handling & Resilience

- **LiteLLM Gateway Unavailable**: If LiteLLM is momentarily offline, cached settings in Postgres are served without crashing.
- **Model Deprecation / Renaming**: If a configured model is removed from LiteLLM, the backend falls back gracefully to the next discovered capable model and logs an actionable warning.
- **Self-Healing Table Creation**: `CREATE TABLE IF NOT EXISTS system_settings` is executed during database initialization so upgrades require zero manual DBA intervention.

---

## 6. Verification & Smoke Testing Plan

1. **Database Migration**: Verify `system_settings` table creates cleanly in Postgres.
2. **API Smoke Test**: Curl `GET /api/system/settings` and verify seed values.
3. **Settings UI Validation**:
   - Change Parametric Model to a newly discovered LiteLLM model.
   - Change Default Reasoning Effort to `medium`.
   - Click "Save System Defaults".
   - Reload page and confirm persistence.
4. **End-to-End Chat Test**:
   - Open root prompt bar at `https://cadam.wileyriley.com/`.
   - Verify prompt bar immediately defaults to the configured Parametric Model.
   - Run a prompt turn and verify the backend logs confirm execution using the selected model.
