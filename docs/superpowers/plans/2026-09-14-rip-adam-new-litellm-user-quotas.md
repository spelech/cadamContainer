# Rip Out `adam.new` & LiteLLM User Quota Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all UI banners, external billing links, and legacy redirects for `adam.new`, and forward authenticated PocketID user identity to LiteLLM for per-user quota and budget tracking.

**Architecture:** 
1. Remove `NewProductBanner.tsx` and adjust `PromptView.tsx`, `Sidebar.tsx`, and `subscription.tsx` to link to internal `/settings`.
2. Update `aiChat.ts` to pass the authenticated user's email/id into OpenRouter/LiteLLM provider headers (`x-litellm-user-id`) and completion body parameters (`user`).
3. Bump version to `0.3.1` per `AGENTS.md` and rebuild/deploy container.

**Tech Stack:** React 19, Vite, TanStack Router, TanStack Start, Node 22, LiteLLM, Docker.

## Global Constraints

- Strictly self-hosted: No external billing or proprietary SaaS account links (`adam.new`).
- Backwards-compatible: Existing database messages, conversations, and OpenSCAD parametric code generation must remain 100% functional.
- Zero lint/typecheck regressions: Must pass `npm run typecheck`, `npm run lint`, and `npm test`.
- Semantic Versioning: Bump to `0.3.1` in `package.json` and `package-lock.json` per `AGENTS.md`.

---

### Task 1: Rip Out `adam.new` UI, Routes & Links

**Files:**
- Modify: `src/views/PromptView.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/routes/_layout/subscription.tsx`
- Modify: `src/config/billing.ts`
- Modify: `src/routes/api/billing-checkout.ts`
- Delete: `src/components/NewProductBanner.tsx`
- Modify: `README.md`
- Modify: `benchmarks/README.md`
- Modify: `CODE_OF_CONDUCT.md`

**Interfaces:**
- `src/components/Sidebar.tsx`: The "Subscriptions" dropdown menu item links to `/settings` via TanStack Router `<Link to="/settings">`.
- `src/routes/_layout/subscription.tsx`: Redirects directly to `/settings`.

- [ ] **Step 1: Remove `NewProductBanner` from `src/views/PromptView.tsx`**
Remove the import `import { NewProductBanner } from '@/components/NewProductBanner';` and the JSX block:
```tsx
<div className="pointer-events-none absolute inset-x-0 bottom-0 top-[55%] flex items-center justify-center px-4 md:px-8">
  <div className="pointer-events-auto w-full max-w-2xl">
    <NewProductBanner />
  </div>
</div>
```

- [ ] **Step 2: Delete `src/components/NewProductBanner.tsx`**
Remove `src/components/NewProductBanner.tsx`.

- [ ] **Step 3: Update `src/components/Sidebar.tsx` to link Subscriptions internally**
Replace `BILLING_URL` link with internal `<Link to="/settings">`:
```tsx
<DropdownMenuItem asChild>
  <Link to="/settings" className="flex items-center">
    <Crown className="mr-2 h-4 w-4" />
    <span>Subscriptions & Quota</span>
  </Link>
</DropdownMenuItem>
```
Remove `import { BILLING_URL } from '@/config/billing';` from `Sidebar.tsx`.

- [ ] **Step 4: Update `src/routes/_layout/subscription.tsx` and `src/config/billing.ts`**
In `src/routes/_layout/subscription.tsx`, redirect to `/settings`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_layout/subscription')({
  beforeLoad: () => {
    throw redirect({ to: '/settings' });
  },
});
```
In `src/config/billing.ts`, replace `BILLING_URL` with relative `/cadam/settings`.
In `src/routes/api/billing-checkout.ts`, change `appUrl` fallback from `https://adam.new/app` to `/cadam`.

- [ ] **Step 5: Clean documentation links**
Replace `adam.new` links in `README.md`, `benchmarks/README.md`, and `CODE_OF_CONDUCT.md`.

- [ ] **Step 6: Run verification**
`npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 7: Commit**
```bash
git commit -am "refactor: remove adam.new banners, billing links, and legacy redirects"
```

---

### Task 2: LiteLLM User Quota Attribution in `aiChat.ts`

**Files:**
- Modify: `src/server/aiChat.ts`
- Test: `src/server/aiChatUserQuotas.test.ts`

**Interfaces:**
- `createChatProviders(user?: AuthUser)`: Passes `headers: { 'x-litellm-user-id': user.email }` to `createOpenRouter`.
- `buildChatModel(modelId, providers, thinking, thinkingBudget, user)`: Passes `extraBody: { user: user.email }` to `providers.openrouter().chat(...)`.

- [ ] **Step 1: Write unit test in `src/server/aiChatUserQuotas.test.ts`**
Verify that when `createChatProviders` or `buildChatModel` is called with an authenticated user, the OpenRouter provider options and model extra body receive the user email/ID for LiteLLM.

- [ ] **Step 2: Run test to verify initial failure / behavior**
`npx tsx --test src/server/aiChatUserQuotas.test.ts`

- [ ] **Step 3: Implement user attribution in `src/server/aiChat.ts`**
Update `createChatProviders(user?: AuthUser)`:
```ts
openrouter: () => {
  openrouter ??= createOpenRouter({
    apiKey: env('OPENROUTER_API_KEY') || 'missing-openrouter-key',
    baseURL: env('OPENROUTER_BASE_URL') || undefined,
    headers: user?.email ? { 'x-litellm-user-id': user.email } : undefined,
  });
  return openrouter;
}
```
Update `buildChatModel(modelId, providers, thinking, thinkingBudget, user?: AuthUser)`:
```ts
if (providerFor(modelId) === 'openrouter') {
  const gatewayModel = normalizeGatewayModelId(modelId);
  return {
    model: providers.openrouter().chat(gatewayModel, {
      ...(thinking ? { reasoning: { max_tokens: thinkingBudget } } : {}),
      usage: { include: true },
      extraBody: user?.email ? { user: user.email } : undefined,
    }),
  };
}
```
Update auxiliary calls (`getAuxiliaryModel(providers, user)`) to also include user attribution.

- [ ] **Step 4: Run tests and typecheck**
`npx tsx --test src/server/aiChatUserQuotas.test.ts && npm test && npm run typecheck`

- [ ] **Step 5: Commit**
```bash
git commit -am "feat(ai): attribute litellm generation calls to authenticated user for quotas"
```

---

### Task 3: Bump Version to `0.3.1`, Rebuild & Deployment Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Deploy: Docker container rebuild & verification

- [ ] **Step 1: Bump version in `package.json` and `package-lock.json`**
`npm version 0.3.1 --no-git-tag-version`

- [ ] **Step 2: Run full verification suite**
`npm run typecheck && npm run lint && npm test && npm run build`

- [ ] **Step 3: Commit release bump**
```bash
git commit -am "chore(release): bump version to 0.3.1"
```

- [ ] **Step 4: Rebuild container & verify runtime**
Rebuild local Docker image:
`docker build -t ghcr.io/spelech/cadamcontainer:latest .`
Recreate container:
`docker compose -f /containers/ai/docker-compose.yaml up -d --force-recreate cadam`
Verify live home page has no `adam.new` banner.
Verify chat generation passes `x-litellm-user-id` and `user` to LiteLLM.

---
