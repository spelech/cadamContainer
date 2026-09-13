# Self-Hosted Features & Dynamic LiteLLM Model Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all residual upstream SaaS billing and token exhaustion gates (granting permanent Max tier), eliminate commercial account/Stripe UI, and dynamically discover and select models from the local LiteLLM instance.

**Architecture:**
- Backend: Refactor `requireUser` to authenticate through local PocketID session tokens, configure `billingClient` to return permanent Max tier with unlimited tokens and no-op consumption, and add `GET /api/models` to discover active LiteLLM models.
- Frontend: Add `useAvailableModels` hook to dynamically populate model pickers, suppress all token warning banners/modals, and streamline `/settings` to display self-hosted identity and LiteLLM gateway status.

**Tech Stack:** React 19, Vite, TanStack Router/Start, TanStack React Query, Node.js/Nitro, Tailwind CSS, PostgreSQL, LiteLLM OpenAI-compatible API.

## Global Constraints
- Strictly self-hosted: No external SaaS billing, Stripe checkout, or proprietary Adam account dependencies.
- Retain backwards-compatibility for existing conversations and OpenSCAD rendering.
- Strict Semantic Versioning: Bump `package.json` to `0.3.0` (MINOR feature enhancement per `AGENTS.md`).
- Pass all automated tests (`npm test`), typecheck (`npm run typecheck`), and lint (`npm run lint`).

---

### Task 1: Backend Local Auth & Permanent Max Tier Billing Bypass

**Files:**
- Modify: `src/server/api.ts`
- Modify: `src/server/billingClient.ts`
- Modify: `src/routes/api/billing-status.ts`
- Create: `src/server/billing.test.ts`

**Interfaces:**
- Consumes: `getSessionUser(request)` from `src/server/auth.ts`
- Produces: `requireUser(request): Promise<AuthUser>`, `billing.getStatus()`, `billing.consume()`

- [ ] **Step 1: Write unit tests in `src/server/billing.test.ts`**
Verify `requireUser` accepts valid session cookies, `billing.getStatus` returns `max` level and `999,999,999` tokens, and `billing.consume` resolves without error.

- [ ] **Step 2: Update `src/server/api.ts`**
Replace the Supabase auth call in `requireUser` with `getSessionUser(request)`. Throw `'Unauthorized'` only if unauthenticated.

- [ ] **Step 3: Update `src/server/billingClient.ts`**
In `getStatus`: return `{ subscription: { level: 'max', status: 'active', currentPeriodEnd: null }, tokens: { free: 999999999, subscription: 999999999, purchased: 999999999, total: 999999999 }, user: { hasTrialed: true } }`.
In `consume`: immediate no-op resolution.

- [ ] **Step 4: Run tests**
`npx tsx --test 'src/server/billing.test.ts'`

- [ ] **Step 5: Commit**
`git add src/server/api.ts src/server/billingClient.ts src/routes/api/billing-status.ts src/server/billing.test.ts`
`git commit -m "feat(billing): grant permanent max tier and bypass token consumption"`

---

### Task 2: Dynamic LiteLLM Model Discovery API Endpoint

**Files:**
- Create: `src/routes/api/models.ts`
- Create: `src/server/models.test.ts`
- Modify: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes: `${OPENROUTER_BASE_URL}/models` with `${OPENROUTER_API_KEY}`
- Produces: `GET /api/models` returning `ModelConfig[]`

- [ ] **Step 1: Write unit tests in `src/server/models.test.ts`**
Test model transformation from LiteLLM response structure into `ModelConfig[]` format, caching, and fallback list on network failure.

- [ ] **Step 2: Implement `src/routes/api/models.ts`**
Implement `GET` handler querying `${OPENROUTER_BASE_URL || 'http://litellm:4000/v1'}/models`.
Transform items to `{ id, name, provider, description, supportsTools: true, supportsThinking: true, supportsVision: true }`.
Cache in memory for 60 seconds. Include fallback array if LiteLLM is unreachable.

- [ ] **Step 3: Regenerate route tree**
Run `npm run build` to update `src/routeTree.gen.ts`.

- [ ] **Step 4: Run tests**
`npx tsx --test 'src/server/models.test.ts'`

- [ ] **Step 5: Commit**
`git add src/routes/api/models.ts src/server/models.test.ts src/routeTree.gen.ts`
`git commit -m "feat(api): add dynamic litellm model discovery endpoint"`

---

### Task 3: Frontend Dynamic Model Picker Integration

**Files:**
- Create: `src/hooks/useAvailableModels.ts`
- Modify: `src/components/TextAreaChat.tsx`
- Modify: `src/components/chat/MessageBubble.tsx`

**Interfaces:**
- Consumes: `GET /cadam/api/models`
- Produces: `useAvailableModels(): { models: ModelConfig[], isLoading: boolean }`

- [ ] **Step 1: Create `src/hooks/useAvailableModels.ts`**
React Query hook querying `/cadam/api/models` (or `${import.meta.env.BASE_URL}/api/models`) with initial fallback to `PARAMETRIC_MODELS`.

- [ ] **Step 2: Update `src/components/TextAreaChat.tsx`**
Replace static `PARAMETRIC_MODELS` with models from `useAvailableModels()`.

- [ ] **Step 3: Update `src/components/chat/MessageBubble.tsx`**
Ensure message branch model switcher uses dynamic models.

- [ ] **Step 4: Verify typecheck**
`npm run typecheck`

- [ ] **Step 5: Commit**
`git add src/hooks/useAvailableModels.ts src/components/TextAreaChat.tsx src/components/chat/MessageBubble.tsx`
`git commit -m "feat(ui): integrate dynamic litellm model picker in chat"`

---

### Task 4: Complete Removal of Token Exhaustion Warnings & SaaS Gating

**Files:**
- Modify: `src/components/LimitReachedMessage.tsx`
- Modify: `src/components/LowPromptsWarningMessage.tsx`
- Modify: `src/components/FreePlanTrialPill.tsx`
- Modify: `src/components/CreditsButton.tsx`

**Interfaces:**
- Suppresses all token-limiting modals, trial prompts, and warning banners.

- [ ] **Step 1: Update `src/components/LimitReachedMessage.tsx`**
Return `null`.

- [ ] **Step 2: Update `src/components/LowPromptsWarningMessage.tsx`**
Return `null`.

- [ ] **Step 3: Update `src/components/FreePlanTrialPill.tsx`**
Return `null`.

- [ ] **Step 4: Update `src/components/CreditsButton.tsx`**
Remove credit purchasing dialog and render a clean "Self-Hosted" or "Unlimited" pill without upgrade popups.

- [ ] **Step 5: Verify build & tests**
`npm test && npm run typecheck`

- [ ] **Step 6: Commit**
`git add src/components/LimitReachedMessage.tsx src/components/LowPromptsWarningMessage.tsx src/components/FreePlanTrialPill.tsx src/components/CreditsButton.tsx`
`git commit -m "refactor(ui): remove token exhaustion warnings and saas trial prompts"`

---

### Task 5: Streamlined Self-Hosted Settings View (`/settings`)

**Files:**
- Modify: `src/views/SettingsView.tsx`

**Interfaces:**
- Consumes: PocketID user profile, LiteLLM gateway status.
- Eliminates: Stripe billing links, token packs, and invoice management.

- [ ] **Step 1: Refactor `src/views/SettingsView.tsx`**
Remove external Stripe customer portal links, token pack purchase grids, and pricing tiers.
Display:
1. **User Profile Card**: Display Name, Email, Avatar URL, and SSO Source (PocketID).
2. **AI Gateway Card**: Connected LiteLLM instance, gateway status, and loaded models list.

- [ ] **Step 2: Verify typecheck & build**
`npm run typecheck && npm run build`

- [ ] **Step 3: Commit**
`git add src/views/SettingsView.tsx`
`git commit -m "feat(settings): streamline settings view for self-hosted pocketid and litellm"`

---

### Task 6: Semantic Version Bump to v0.3.0 & Deployment

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Deploy: Docker container rebuild & verification

- [ ] **Step 1: Bump version in `package.json`**
Bump `"version": "0.3.0"`.

- [ ] **Step 2: Run full verification suite**
`npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 3: Commit**
`git commit -am "chore(release): bump version to 0.3.0 for self-hosted feature unlock"`

- [ ] **Step 4: Rebuild container & verify runtime**
Rebuild local Docker image and restart container.
Verify `curl http://localhost:8408/cadam/api/models` returns active LiteLLM models.
Verify `curl http://localhost:8408/cadam/api/billing-status` returns `max` level.
