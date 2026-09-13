# CADAM Standalone Architecture: PocketID OIDC & Dedicated PostgreSQL

**Date:** 2026-09-13  
**Status:** Approved  
**Target Branch:** `feat/standalone-oidc-postgres`

---

## 1. Overview & Goals

CADAM was originally designed as a cloud SaaS application dependent on a managed Supabase project for auth, persistence, and proprietary billing. In our self-hosted environment, CADAM needs to run completely standalone inside Docker, without external Supabase dependencies.

### Key Goals
1. **Sync Upstream Updates:** Incorporate 99 upstream commits from `Adam-CAD/CADAM` (`upstream/master`), gaining color-rendered OpenSCAD previews, streaming markdown responses, 3D viewer memory fixes, and updated model configurations.
2. **Dedicated PostgreSQL Database (`cadam-db`):** Add a lightweight `postgres:16-alpine` container to `/containers/ai/docker-compose.yaml` with local volume persistence (`./cadam/db`). Initialize with CADAM's core schema (`conversations`, `messages`, `profiles`).
3. **PocketID OIDC Authentication:** Implement native OIDC Authorization Code Flow with PKCE in CADAM's backend against PocketID (`https://sso.wileyriley.com`), issuing secure HTTP-only session tokens and automatically provisioning user profiles in PostgreSQL.
4. **Clean Adapter Architecture:** Bridge client-side and server-side data calls to local PostgreSQL and OIDC sessions via [`src/lib/supabase.ts`](file:///containers/ai/cadam/src/lib/supabase.ts) and [`src/server/`](file:///containers/ai/cadam/src/server/), keeping React view components untouched to preserve seamless future upstream merging.
5. **LiteLLM & Local Billing:** Route AI generation to the local LiteLLM gateway (`http://litellm:4000/v1`) and set `ENVIRONMENT=local` to grant 3,000,000 tokens and bypass SaaS billing.

---

## 2. System Architecture

```
+-------------------------------------------------------------+
|                     Client Browser                          |
|  - React 19 UI with TanStack Start & Router                 |
|  - In-browser OpenSCAD WebAssembly Worker                   |
+------------------------------+------------------------------+
                               | HTTPS
                               v
+-------------------------------------------------------------+
|                     Caddy Reverse Proxy                     |
|  - cadam.wileyriley.com                                     |
+------------------------------+------------------------------+
                               | HTTP (Docker net_webservices)
                               v
+-------------------------------------------------------------+
|               CADAM Container (Nitro Node Server)           |
|  - OIDC Endpoints: /api/auth/login, /api/auth/callback,     |
|    /api/auth/me, /api/auth/logout                           |
|  - Local REST API: /api/conversations, /api/messages        |
|  - AI Gateway: /api/parametric-chat -> LiteLLM (:4000/v1)   |
|  - Server DB Client: src/server/db.ts                       |
+---------------+------------------------------+--------------+
                |                              |
                v                              v
+-------------------------------+  +--------------------------+
|      cadam-db (PostgreSQL)    |  |     PocketID (OIDC)      |
|  - postgres:16-alpine         |  |  - sso.wileyriley.com    |
|  - Local persistent volume    |  |  - Auth Code Flow + PKCE |
|  - Tables: profiles,          |  +--------------------------+
|    conversations, messages    |
+-------------------------------+
```

---

## 3. Database Specification (`cadam-db`)

### 3.1 Docker Compose Service
Added to `/containers/ai/docker-compose.yaml`:
```yaml
  cadam-db:
    image: postgres:16-alpine
    container_name: cadam-db
    restart: always
    environment:
      POSTGRES_DB: cadam
      POSTGRES_USER: cadam
      POSTGRES_PASSWORD: ${CADAM_DB_PASSWORD:-cadam_secret_pass}
    volumes:
      - ./cadam/db:/var/lib/postgresql/data
    networks:
      - net_webservices
```

### 3.2 Schema Definition
Adapted from `supabase/migrations/`:
- **`profiles`**: `id UUID PRIMARY KEY`, `email TEXT UNIQUE`, `display_name TEXT`, `avatar_url TEXT`, `created_at TIMESTAMPTZ DEFAULT NOW()`
- **`conversations`**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id UUID REFERENCES profiles(id) ON DELETE CASCADE`, `title TEXT`, `type TEXT DEFAULT 'parametric'`, `current_message_leaf_id UUID`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- **`messages`**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE`, `user_id UUID REFERENCES profiles(id) ON DELETE CASCADE`, `parent_id UUID`, `role TEXT NOT NULL`, `content JSONB NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`

A self-executing schema migration script runs on Nitro server boot via `src/server/db.ts` to ensure tables and indexes exist.

---

## 4. Authentication Specification (PocketID OIDC)

### 4.1 OIDC Configuration
- **Issuer / Provider URL:** `https://sso.wileyriley.com`
- **Well-known Discovery:** `https://sso.wileyriley.com/.well-known/openid-configuration`
- **Client ID:** Set via `POCKETID_CLIENT_ID` (or `CADAM_OIDC_CLIENT_ID`)
- **Client Secret:** Set via `POCKETID_CLIENT_SECRET` (or `CADAM_OIDC_CLIENT_SECRET`)
- **Redirect URI:** `https://cadam.wileyriley.com/cadam/api/auth/callback`
- **Scopes:** `openid profile email`

### 4.2 Endpoints in Nitro
1. **`GET /api/auth/login`**:
   - Generates PKCE code verifier, challenge, and CSRF state.
   - Saves verifier and state in temporary signed HTTP-only cookies (`cadam_oauth_state`, `cadam_code_verifier`).
   - Redirects to `${authorization_endpoint}?response_type=code&client_id=...&redirect_uri=...&scope=openid+profile+email&state=...&code_challenge=...&code_challenge_method=S256`.
2. **`GET /api/auth/callback`**:
   - Validates `state` against cookie.
   - Exchanges `code` and `code_verifier` with `${token_endpoint}` for `access_token` and `id_token`.
   - Fetches user info from `${userinfo_endpoint}` (sub, email, name, picture).
   - Upserts record in `profiles`.
   - Generates an encrypted/signed session JWT stored in an HTTP-only, SameSite=Lax cookie: `cadam_session`.
   - Redirects to `/cadam/`.
3. **`GET /api/auth/me`**:
   - Reads `cadam_session` cookie.
   - Returns `{ user: { id, email, user_metadata: { full_name, avatar_url } } }` or 401 if unauthenticated.
4. **`POST /api/auth/logout`**:
   - Clears `cadam_session` cookie.
   - Returns redirect to `/cadam/`.

---

## 5. Persistence & Client Adapter Specification

### 5.1 Client-Side Adapter ([`src/lib/supabase.ts`](file:///containers/ai/cadam/src/lib/supabase.ts))
Exposes a Supabase-compatible client interface so upstream React components continue working without edits:
- `supabase.auth.getUser()` and `refreshSession()` -> queries `/api/auth/me`.
- `supabase.auth.signInWithOAuth()` -> navigates to `/api/auth/login`.
- `supabase.auth.signOut()` -> calls `/api/auth/logout`.
- `supabase.from('conversations')` & `supabase.from('messages')` -> talks to local REST endpoints (`/api/conversations`, `/api/messages`).

### 5.2 Backend API Handlers
- **[`src/server/aiChat.ts`](file:///containers/ai/cadam/src/server/aiChat.ts):** Reads user identity from session cookie or Authorization header. Queries conversation state and saves user/assistant messages directly using `src/server/db.ts`.
- **LiteLLM Routing:** Uses OpenRouter AI SDK provider with:
  - `OPENROUTER_BASE_URL=http://litellm:4000/v1`
  - `ENVIRONMENT=local` (bypasses adam-billing and provides 3M dev tokens).

---

## 6. Verification & Quality Gates
1. `npm run typecheck` and `npm run build` pass cleanly.
2. Direct OIDC authorization code flow works against PocketID.
3. PostgreSQL initializes all tables on container start.
4. Starting a new prompt creates a conversation in PostgreSQL and streams generated OpenSCAD from LiteLLM.
5. In-browser OpenSCAD WebAssembly compiles and renders the 3D model in Three.js preview.
