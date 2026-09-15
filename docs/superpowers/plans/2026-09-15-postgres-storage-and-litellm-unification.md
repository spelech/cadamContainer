# PostgreSQL Blob Storage & LiteLLM Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PostgreSQL-backed blob storage for CADAM to restore the multi-view visual feedback loop in standalone mode, replace fixed Anthropic/OpenRouter services with a unified LiteLLM gateway client, eliminate hardcoded model mappings/prices, and verify via comprehensive tests and CI.

**Architecture:** Add a `storage_objects` table to `cadam-db` with direct binary helpers (`src/server/storage.ts`) and a REST endpoint (`/api/storage/$`). Wire `src/lib/supabase.ts` and `aiChat.ts` to this storage. Replace `anthropic.ts` with `llmGateway.ts` wired to LiteLLM with user quota attribution.

**Tech Stack:** TypeScript, Node.js (Buffer/Streams), PostgreSQL (`pg`), TanStack Start / React Router, Vercel AI SDK, LiteLLM.

---

### Task 1: PostgreSQL Blob Storage Module & Schema Migration

**Files:**
- Modify: `src/server/db.ts:45-184`
- Create: `src/server/storage.ts`
- Create: `src/server/storage.test.ts`

- [ ] **Step 1: Write the failing tests for `storage.ts`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Update `SCHEMA_SQL` in `src/server/db.ts` to include `storage_objects` table**
- [ ] **Step 4: Implement `src/server/storage.ts` with `putStorageObject`, `getStorageObject`, `deleteStorageObject`, `listStorageObjects`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit**

---

### Task 2: Storage REST API Endpoint & Client Adapter

**Files:**
- Create: `src/routes/api/storage/$.ts`
- Modify: `src/lib/supabase.ts:836-858`
- Create: `src/server/storageApi.test.ts`

- [ ] **Step 1: Write the failing tests for `/api/storage/$`**
- [ ] **Step 2: Run tests to verify failure**
- [ ] **Step 3: Implement `/api/storage/$.ts` handling GET, POST, PUT, DELETE**
- [ ] **Step 4: Update `src/lib/supabase.ts` `storage` object to upload and download using `/api/storage/$`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit**

---

### Task 3: Bridge `aiChat.ts` to PostgreSQL Storage for Visual Inspection Loop

**Files:**
- Modify: `src/server/aiChat.ts:976-1046`
- Modify: `src/server/persistence.test.ts`

- [ ] **Step 1: Write test verifying `downloadAsBase64` reads from PostgreSQL storage**
- [ ] **Step 2: Run test to verify failure or need for integration**
- [ ] **Step 3: Update `downloadAsBase64` in `src/server/aiChat.ts` to check `getStorageObject` first**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: Unified LiteLLM Gateway Client (`src/server/llmGateway.ts`)

**Files:**
- Create: `src/server/llmGateway.ts`
- Create: `src/server/llmGateway.test.ts`
- Delete: `src/server/anthropic.ts`
- Modify: `src/routes/api/prompt-generator.ts`
- Modify: `src/routes/api/title-generator.ts`

- [ ] **Step 1: Write tests for `generateGatewayText` in `llmGateway.test.ts`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `src/server/llmGateway.ts` (pointing to `LITELLM_BASE_URL` or `OPENROUTER_BASE_URL` with user attribution)**
- [ ] **Step 4: Refactor `prompt-generator.ts` and `title-generator.ts` to use `generateGatewayText`**
- [ ] **Step 5: Remove `src/server/anthropic.ts`**
- [ ] **Step 6: Run tests to verify they pass**
- [ ] **Step 7: Commit**

---

### Task 5: Clean Up Hardcodes & Static Models in `src/server/aiChat.ts` and `src/lib/utils.ts`

**Files:**
- Modify: `src/server/aiChat.ts`
- Modify: `src/lib/utils.ts`
- Modify: `src/server/aiChatUserQuotas.test.ts`

- [ ] **Step 1: Remove `normalizeGatewayModelId` and generalize model naming for LiteLLM**
- [ ] **Step 2: Remove hardcoded `anthropic/claude-sonnet-4.5` in creative mode, honor requested model**
- [ ] **Step 3: Relax `MODEL_PRICES` fallback and simplify token billing for self-hosted LiteLLM**
- [ ] **Step 4: Support `LITELLM_BASE_URL` alongside `OPENROUTER_BASE_URL`**
- [ ] **Step 5: Update `parametricModelSupportsVision` to dynamically check model capabilities**
- [ ] **Step 6: Run full test suite and verify**
- [ ] **Step 7: Commit**

---

### Task 6: Bump Version, Documentation, Verification & PR Release

**Files:**
- Modify: `package.json` (bump to `0.5.0`)
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Bump version to `0.5.0` in `package.json` and `package-lock.json`**
- [ ] **Step 2: Update `README.md` to document PostgreSQL storage and LiteLLM environment variables**
- [ ] **Step 3: Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`**
- [ ] **Step 4: Commit and push branch `feat/postgres-storage-and-litellm-unification`**
- [ ] **Step 5: Create Pull Request via `gh pr create`**
- [ ] **Step 6: Monitor GitHub Actions CI build until passed**
- [ ] **Step 7: Merge PR into `main` and pull updated Docker image**
