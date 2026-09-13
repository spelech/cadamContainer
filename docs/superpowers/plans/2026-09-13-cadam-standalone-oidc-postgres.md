# CADAM Standalone Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform CADAM into a fully self-contained Docker service by merging 99 upstream commits, introducing a dedicated PostgreSQL database (`cadam-db`), adding native PocketID OIDC authentication, and routing AI generation to the local LiteLLM gateway.

**Architecture:** A dedicated PostgreSQL container handles state persistence (`conversations`, `messages`, `profiles`). Nitro server routes handle OIDC Auth Code flow with PocketID, issuing secure session cookies. Client and server adapters preserve existing upstream interfaces so future upstream merges remain painless.

**Tech Stack:** Node.js 22, TanStack Start & Router, Nitro, PostgreSQL (postgres:16-alpine), PocketID OIDC (sso.wileyriley.com), LiteLLM gateway, Three.js & OpenSCAD WebAssembly.

## Global Constraints

- **Semantic Versioning:** Every pull request or merge to `main` must bump `package.json` (bump to `0.2.0` for this minor feature release).
- **Container Portability:** Never hardcode production secrets or tokens into Dockerfiles or git-tracked files. Use compose environment injection.
- **Dynamic Runtime Config:** Maintain `runtime-inject.mjs` and dynamic static asset Content-Length / ETag handling.
- **Upstream Sync Integrity:** Upstream tracking branch is `upstream/master`. Never delete upstream files; resolve conflicts preserving custom container and build files.

---

### Task 1: Upstream Synchronization & Clean Merge

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/*` (upstream updates)

**Interfaces:**
- Consumes: `upstream/master` (latest commits)
- Produces: Synced codebase with custom build configuration intact on `feat/standalone-oidc-postgres`

- [ ] **Step 1: Create feature branch**
```bash
git checkout -b feat/standalone-oidc-postgres
```

- [ ] **Step 2: Merge upstream/master with --no-commit**
```bash
git merge upstream/master --no-commit
```

- [ ] **Step 3: Resolve conflicts preserving containerization files**
Ensure `Dockerfile`, `entrypoint.sh`, `runtime-inject.mjs`, `.github/workflows/`, and `AGENTS.md` are preserved. In `vite.config.ts`, preserve `appBase = '/cadam'`.

- [ ] **Step 4: Verify typecheck or test build**
Run: `node -v` and test that files are syntactically valid.

- [ ] **Step 5: Commit merge**
```bash
git commit -m "merge: sync upstream updates from upstream/master"
```

---

### Task 2: Dedicated PostgreSQL Service & Server Database Module

**Files:**
- Modify: `/containers/ai/docker-compose.yaml`
- Modify: `/containers/ai/.env`
- Create: `src/server/db.ts`
- Modify: `package.json` (add `pg` and `@types/pg` or `postgres`)

**Interfaces:**
- Consumes: PostgreSQL connection string `DATABASE_URL` (e.g. `postgres://cadam:password@cadam-db:5432/cadam`)
- Produces: `query(sql, params)` and `getPool()` in `src/server/db.ts`, with auto-migration on boot.

- [ ] **Step 1: Add cadam-db service to docker-compose.yaml**
Add `cadam-db` with `postgres:16-alpine`, volume `./cadam/db:/var/lib/postgresql/data`, network `net_webservices`.

- [ ] **Step 2: Add pg dependency to package.json**
Add `pg` and `@types/pg`.

- [ ] **Step 3: Create src/server/db.ts**
Implement connection pool, query helper, and automatic table creation (`profiles`, `conversations`, `messages`).

- [ ] **Step 4: Test database connection and migration schema**
Verify schema SQL executes cleanly against PostgreSQL.

- [ ] **Step 5: Commit**
```bash
git add /containers/ai/docker-compose.yaml src/server/db.ts package.json
git commit -m "feat(db): add dedicated postgres service and schema migration module"
```

---

### Task 3: PocketID OIDC Authentication Routes

**Files:**
- Create: `src/routes/api/auth/login.ts`
- Create: `src/routes/api/auth/callback.ts`
- Create: `src/routes/api/auth/me.ts`
- Create: `src/routes/api/auth/logout.ts`
- Create: `src/server/auth.ts`

**Interfaces:**
- Consumes: `POCKETID_CLIENT_ID`, `POCKETID_CLIENT_SECRET`, `POCKETID_ISSUER` (default: `https://sso.wileyriley.com`)
- Produces: Session management via signed HTTP-only `cadam_session` cookie; user profile syncing in `profiles`.

- [ ] **Step 1: Implement src/server/auth.ts**
PKCE challenge generation, token exchange with PocketID (`/oauth/token`), userinfo fetching (`/oauth/userinfo`), session signing and verification.

- [ ] **Step 2: Implement /api/auth/login route**
Redirects browser to PocketID with PKCE challenge and state cookie.

- [ ] **Step 3: Implement /api/auth/callback route**
Exchanges code for tokens, upserts user into `profiles`, sets `cadam_session` cookie, redirects to `/cadam/`.

- [ ] **Step 4: Implement /api/auth/me and /api/auth/logout routes**
Returns current user info from session cookie or 401; logout clears session cookie.

- [ ] **Step 5: Commit**
```bash
git add src/routes/api/auth/ src/server/auth.ts
git commit -m "feat(auth): implement native pocketid oidc routes and session management"
```

---

### Task 4: Conversation & Message Persistence API

**Files:**
- Create: `src/routes/api/conversations.ts`
- Create: `src/routes/api/conversations/$id.ts`
- Create: `src/routes/api/messages.ts`
- Modify: `src/server/aiChat.ts`

**Interfaces:**
- Consumes: Session from `src/server/auth.ts`, DB from `src/server/db.ts`
- Produces: REST endpoints for listing, creating, fetching, and updating conversations and messages.

- [ ] **Step 1: Implement conversations route handlers**
List user conversations (`GET /api/conversations`), create new conversation (`POST /api/conversations`), get conversation by ID (`GET /api/conversations/:id`).

- [ ] **Step 2: Implement messages route handlers**
Fetch messages for conversation (`GET /api/messages?conversationId=...`), append message (`POST /api/messages`).

- [ ] **Step 3: Update aiChat.ts to use local PostgreSQL**
Replace Supabase client queries in `src/server/aiChat.ts` with direct calls to `src/server/db.ts` for loading conversation and persisting user/assistant messages.

- [ ] **Step 4: Commit**
```bash
git add src/routes/api/conversations* src/routes/api/messages* src/server/aiChat.ts
git commit -m "feat(api): add conversation and message persistence via postgres"
```

---

### Task 5: Client-Side Adapter Shim

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `src/server/supabaseClient.ts`

**Interfaces:**
- Consumes: Local `/api/auth/*`, `/api/conversations/*`, `/api/messages/*`
- Produces: Drop-in compatibility interface for `@supabase/supabase-js` so upstream components run without modification.

- [ ] **Step 1: Implement Supabase client adapter in src/lib/supabase.ts**
Map `auth.getUser()`, `auth.refreshSession()`, `auth.onAuthStateChange()`, `auth.signInWithOAuth()`, and `auth.signOut()` to our local endpoints.
Map query builder `.from('conversations')` and `.from('messages')` to local REST APIs.

- [ ] **Step 2: Update src/server/supabaseClient.ts**
Return a local authenticated client helper for any residual server-side callers.

- [ ] **Step 3: Commit**
```bash
git add src/lib/supabase.ts src/server/supabaseClient.ts
git commit -m "feat(adapter): provide local postgres and oidc adapter for supabase client"
```

---

### Task 6: LiteLLM Configuration & Local Billing Bypass

**Files:**
- Modify: `/containers/ai/docker-compose.yaml`
- Modify: `/containers/ai/.env`
- Modify: `package.json` (bump version to `0.2.0`)

**Interfaces:**
- Consumes: `OPENROUTER_BASE_URL=http://litellm:4000/v1`, `ENVIRONMENT=local`
- Produces: Unlimited local CAD generation tokens and direct LiteLLM inference.

- [ ] **Step 1: Update environment in docker-compose.yaml**
Set `ENVIRONMENT=local` for `cadam`, pass `DATABASE_URL=postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam`.
Configure `POCKETID_CLIENT_ID` and `POCKETID_CLIENT_SECRET`.

- [ ] **Step 2: Bump version to 0.2.0 in package.json**
Follow semantic versioning rules in `AGENTS.md`.

- [ ] **Step 3: Commit**
```bash
git add /containers/ai/docker-compose.yaml /containers/ai/.env package.json
git commit -m "chore(config): configure litellm, local billing bypass, and bump version to 0.2.0"
```

---

### Task 7: End-to-End Container Build & Runtime Verification

**Files:**
- Test & Deploy: Docker image build & container deployment

**Interfaces:**
- Consumes: Updated Dockerfile and code
- Produces: Running CADAM instance verified at `cadam.wileyriley.com`

- [ ] **Step 1: Build Docker image locally**
Run `docker build -t ghcr.io/spelech/cadamcontainer:latest .`

- [ ] **Step 2: Start cadam-db and recreate cadam container**
Run `docker compose -f /containers/ai/docker-compose.yaml up -d cadam-db cadam`

- [ ] **Step 3: Verify logs and health**
Check `docker logs cadam-db` and `docker logs cadam`.

- [ ] **Step 4: Verify with Chrome DevTools**
Navigate to `https://cadam.wileyriley.com/cadam/`, test PocketID login flow, enter a prompt, and verify 3D OpenSCAD rendering.
