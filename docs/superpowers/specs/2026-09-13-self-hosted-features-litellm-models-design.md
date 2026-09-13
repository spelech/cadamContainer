# Design Spec: Self-Hosted Feature Unlocks & Dynamic LiteLLM Model Discovery

**Date:** 2026-09-13  
**Status:** Approved  
**Target:** CADAM Standalone Self-Hosted Deployment  

---

## 1. Problem Statement & Objectives

CADAM contains residual upstream SaaS gating:
1. **Token Exhaustion Warning**: Free-tier gating produces messages such as *"You've used all your tokens. Start a free trial to experience all Pro features for 7 days, completely free."*
2. **Proprietary SaaS Account UI**: Modals and settings views push users toward Stripe checkouts, subscription upgrades, token packs, and external Adam SaaS account management.
3. **Static Model Catalog**: Model selection is restricted to a hardcoded list of cloud provider models rather than dynamically querying the user's local LiteLLM instance.

**Objectives:**
- Completely eliminate token limits and commercial subscription gating: grant permanent Max Tier with unlimited tokens.
- Strip away SaaS billing dialogs, upgrade prompts, and token pack stores.
- Provide dynamic LiteLLM model discovery (`GET /api/models`) so all models and aliases configured in LiteLLM appear automatically in CADAM's model dropdown.
- Streamline the `/settings` page to focus on PocketID profile data and local LiteLLM connection status.

---

## 2. Architecture & Components

### 2.1 Backend: Authentication & Unlimited Billing
- **`src/server/api.ts`**:
  - Refactor `requireUser(request)` to authenticate via `getSessionUser(request)` from `src/server/auth.ts`, ensuring all server routes recognize the PocketID session without Supabase dependencies.
- **`src/server/billingClient.ts`**:
  - When `ENVIRONMENT=local` (or always self-hosted):
    - `getStatus(email)` returns:
      - `subscription: { level: 'max', status: 'active', currentPeriodEnd: null }`
      - `tokens: { free: 999999999, subscription: 999999999, purchased: 999999999, total: 999999999 }`
      - `user: { hasTrialed: true }`
    - `consume(email, ...)` is an immediate no-op resolution.
- **`src/routes/api/billing-status.ts`**:
  - Serves the permanent Max tier status to authenticated users.

### 2.2 Backend: Dynamic LiteLLM Model Discovery (`GET /api/models`)
- **`src/routes/api/models.ts`**:
  - Server-side route handler implementing `GET`.
  - Connects to `${OPENROUTER_BASE_URL}/models` (defaulting to `http://litellm:4000/v1/models`) with `Authorization: Bearer ${OPENROUTER_API_KEY}`.
  - Transforms LiteLLM model descriptors into CADAM's `ModelConfig` format:
    - `id`: Model name or alias (e.g. `glm-5.3-flash`, `openrouter/gemini-3.8-flash`, `deepseek-v4-flash`).
    - `name`: Clean human-readable name extracted from model info or ID.
    - `description`: Model capabilities or pricing tier info from LiteLLM metadata.
    - `provider`: Provider brand (Google, Z-AI, DeepSeek, Anthropic, etc.).
    - `supportsTools`: Defaults to `true` (enabling OpenSCAD build tools).
    - `supportsThinking`: Inferred from model capabilities or defaults to `true` for reasoning models.
    - `supportsVision`: Inferred from model capabilities (`image_in`).
  - Cache results in-memory with a short TTL (e.g., 60 seconds) to ensure responsive UI without flooding LiteLLM.
  - Fallback: If LiteLLM is unreachable during startup, return a curated list of known working models so UI never fails.

### 2.3 Frontend: Dynamic Model Selection
- **`src/hooks/useAvailableModels.ts`**:
  - React Query hook calling `/cadam/api/models` with caching.
- **`src/components/TextAreaChat.tsx` & `src/components/chat/MessageBubble.tsx`**:
  - Replace static `PARAMETRIC_MODELS` with the list from `useAvailableModels()`.
  - Display available models grouped by provider or in a searchable dropdown.
  - When a model is selected, persist preference in `localStorage` and conversation settings.

### 2.4 Frontend: Gating & Account UI Elimination
- **`src/components/LimitReachedMessage.tsx`**:
  - Render `null`. No token limit warnings ever display.
- **`src/components/LowPromptsWarningMessage.tsx`**:
  - Render `null`. No low token warnings display.
- **`src/components/FreePlanTrialPill.tsx`**:
  - Render `null`. No trial prompts display.
- **`src/components/CreditsButton.tsx`**:
  - Remove token count decrement numbers and click-to-upgrade dialogs.
  - Replace with a subtle "Self-Hosted" or "LiteLLM Connected" badge (or hide if clean header preferred).
- **`src/views/SettingsView.tsx`**:
  - Remove tabs for Stripe billing, token packs, and invoice history.
  - Present:
    1. **PocketID Profile Card**: Shows Display Name, Email Address, and Avatar managed via SSO.
    2. **AI Gateway Info**: Displays LiteLLM endpoint, connection status, and list of loaded models.

---

## 3. Data Flow & Sequence

1. **User opens CADAM**:
   - Frontend calls `GET /cadam/api/billing-status` -> returns `level: 'max'`, `total: 999999999`.
   - Frontend calls `GET /cadam/api/models` -> backend queries LiteLLM `/v1/models` -> model picker renders active models.
2. **User sends 3D CAD Prompt**:
   - `handleAiChatRequest` executes via LiteLLM.
   - `billing.consume()` returns instantly without decrementing tokens.
   - Assistant streams OpenSCAD CAD model to preview.
3. **User inspects Settings**:
   - User navigates to `/settings`.
   - Renders PocketID profile and LiteLLM gateway status. No Stripe or token purchase UI exists.

---

## 4. Verification & Testing

1. **Unit & Integration Tests**:
   - Test `GET /api/models` with mock LiteLLM responses and fallback scenarios.
   - Verify `GET /api/billing-status` returns `max` level and unlimited tokens for authenticated session.
   - Verify `billing.consume` does not reject requests.
2. **UI Verification**:
   - Verify model picker reflects models from `http://litellm:4000/v1/models`.
   - Verify zero warning pills or modals appear regardless of usage.
   - Verify `/settings` renders without errors and contains no SaaS checkout buttons.
3. **Build & Quality Gates**:
   - `npm run typecheck`: 0 errors.
   - `npm test`: 100% passing tests.
   - `npm run build`: Production build passes.
