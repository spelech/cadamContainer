# Design Spec: PostgreSQL Blob Storage & Unified LiteLLM Gateway

**Date:** 2026-09-15  
**Status:** Approved  
**Branch:** `feat/postgres-storage-and-litellm-unification`  
**Target Version:** `0.5.0`

---

## 1. Problem Statement & Objectives

### 1.1 PostgreSQL Blob Storage (P0)
In self-hosted standalone mode without external cloud Supabase:
- `src/lib/supabase.ts` stubs storage upload/download methods as no-ops.
- The multi-view visual feedback loop (`ChatSession.tsx` -> `build_parametric_model` -> capture 7 inspection angles -> upload thumbnail/sheet -> `aiChat.ts` -> `downloadAsBase64`) is completely broken because images are dropped and `downloadAsBase64` returns `null`.
- The AI CAD agent operates "blind", degrading to text-only mode and missing the ability to iteratively fix geometric flaws.

**Objective:**
- Add a `storage_objects` table to CADAM's dedicated PostgreSQL database (`cadam-db`).
- Create `src/server/storage.ts` with direct binary read/write methods.
- Implement `/api/storage/$bucket/*` server route for authenticated uploads and downloads.
- Connect `src/lib/supabase.ts` storage methods to this route so client-side preview uploads save to PostgreSQL.
- Update `downloadAsBase64` in `src/server/aiChat.ts` to read directly from PostgreSQL, fully restoring the visual inspection feedback loop.

### 1.2 Unified LiteLLM Gateway (P1)
- `src/routes/api/prompt-generator.ts` and `src/routes/api/title-generator.ts` directly import `src/server/anthropic.ts` and make raw HTTPS requests to `https://api.anthropic.com/v1/messages`, failing when only LiteLLM is configured.
- `src/server/aiChat.ts` contains hardcoded model mappings (`normalizeGatewayModelId`), a static pricing table (`MODEL_PRICES`), and hardcodes `anthropic/claude-sonnet-4.5` for creative mode.
- `src/lib/utils.ts` (`parametricModelSupportsVision`) checks only a hardcoded list.

**Objective:**
- Replace `src/server/anthropic.ts` with `src/server/llmGateway.ts` using the LiteLLM gateway (`LITELLM_BASE_URL` / `OPENROUTER_BASE_URL`).
- Route all title generation, prompt generation, and auxiliary completions through LiteLLM with user attribution (`x-litellm-user-id`).
- Allow creative mode to use the requested model instead of forcing Anthropic Claude.
- Remove hardcoded model alias maps and hardcoded pricing tables, delegating cost tracking to LiteLLM.

---

## 2. Technical Architecture

### 2.1 Storage Schema (`cadam-db`)
```sql
CREATE TABLE IF NOT EXISTS storage_objects (
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket, path)
);

CREATE INDEX IF NOT EXISTS storage_objects_bucket_idx ON storage_objects(bucket);
CREATE INDEX IF NOT EXISTS storage_objects_created_at_idx ON storage_objects(created_at);
```

### 2.2 Storage APIs & Direct Access
- Server operations in `src/server/storage.ts`:
  - `putStorageObject(bucket: string, path: string, data: Buffer | Uint8Array, contentType: string): Promise<void>`
  - `getStorageObject(bucket: string, path: string): Promise<{ data: Buffer; contentType: string } | null>`
  - `deleteStorageObject(bucket: string, path: string): Promise<boolean>`
- Server Route `src/routes/api/storage/$.ts`:
  - `GET /api/storage/<bucket>/<path>`: Streams blob with proper `Content-Type` and `Cache-Control`.
  - `POST` / `PUT /api/storage/<bucket>/<path>`: Authenticates user, parses multipart/octet-stream body, and saves to PostgreSQL.
- Client Adapter `src/lib/supabase.ts`:
  - `supabase.storage.from(bucket).upload(path, file, options)`: Sends `fetch` POST/PUT to `${getBasePath()}/api/storage/${bucket}/${path}`.
  - `supabase.storage.from(bucket).download(path)`: Fetches `${getBasePath()}/api/storage/${bucket}/${path}` and returns `Blob`.
- Server Inspection Bridge `src/server/aiChat.ts`:
  - `downloadAsBase64` reads directly from `getStorageObject(bucket, path)` in PostgreSQL with fallback to Supabase if external URL configured.

### 2.3 LiteLLM Gateway (`src/server/llmGateway.ts`)
- Configured via `LITELLM_BASE_URL` or `OPENROUTER_BASE_URL` (defaulting to `http://litellm:4000/v1`).
- `generateGatewayText({ model, system, prompt, maxTokens, user })`: Calls LiteLLM `/v1/chat/completions` with user attribution header `x-litellm-user-id: user.email`.
- Updates `prompt-generator.ts` and `title-generator.ts` to use `generateGatewayText`.

---

## 3. Verification & Testing
- Unit tests for `storage.ts` verifying binary data persistence and retrieval.
- API tests for `/api/storage/$.ts` (upload, download, unauthorized access).
- Unit tests for `llmGateway.ts` with mock gateway server.
- End-to-end typecheck and test suite verification (`npm test`, `npm run typecheck`, `npm run lint`).
