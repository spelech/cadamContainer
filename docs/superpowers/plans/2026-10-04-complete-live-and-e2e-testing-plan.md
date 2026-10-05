# Complete Live Model Matrix, Complex Geometry & Browser UI E2E Testing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish end-to-end verification across the entire CADAM product lifecycle by implementing a multi-model live matrix test suite, complex mechanical assembly & multimodal image-to-CAD tests, a full browser UI Playwright test suite, and interactive visual screenshot validation.

**Architecture:**

1. Server-side live matrix tests execute against LiteLLM gateway (`/v1`) evaluating multiple frontier and open-weight models (`gemini-3.8-flash`, `claude-haiku-4-5`, `glm-5.3-flash`, `qwen3.7-flash`) with distinct reasoning budgets and role settings.
2. Complex CAD geometry and multimodal live tests assert mechanical fitments (threaded fasteners, snap-fit enclosures, spur gears) and image sketch grounding.
3. Playwright browser UI suite runs headless/headed against the deployed application, driving the real client DOM, OpenSCAD WASM worker compilation, Three.js WebGL canvas rendering, model selection, CAD reference ghost overlay, and mobile responsive views.

**Tech Stack:** TypeScript, Node.js Test Runner (`tsx --test`), `@playwright/test`, Three.js, OpenSCAD WASM, LiteLLM Gateway, PostgreSQL, Chrome DevTools MCP.

## Global Constraints

- Strictly adhere to `AGENTS.md` semantic versioning (target version: `0.10.0` for new feature release).
- All changes must go through a feature branch (`feat/complete-live-and-e2e-testing-suite`) and PR.
- Unit tests run with `npm test` and must pass with 0 errors.
- Live model matrix tests run with `npm run test:matrix`.
- Complex geometry live tests run with `npm run test:geometry`.
- Browser UI E2E tests run with `npm run test:e2e`.
- `npm run typecheck` and `npm run lint` must pass with 0 errors before PR and merge.

---

## File Structure

```
cadam/
├── package.json
├── playwright.config.ts                                 # Playwright configuration for browser E2E
├── e2e/
│   ├── helpers/
│   │   ├── auth.ts                                     # Session cookie / test user token injector
│   │   └── canvas.ts                                   # Three.js canvas & WebGL inspection helpers
│   ├── auth-and-chat.spec.ts                           # Login, chat session, streaming tokens & loading bubble
│   ├── wasm-and-3d-viewport.spec.ts                   # WASM OpenSCAD compilation & Three.js 3D rendering
│   ├── model-selector-and-roles.spec.ts               # Model dropdown, role settings & attribution badges
│   ├── cad-reference-overlay.spec.ts                  # STEP/STL attachment, feature pills, ghost overlay & collision HUD
│   └── mobile-viewport.spec.ts                         # Mobile safe-area, floating generation pill & View 3D button
├── src/
│   └── server/
│       ├── liveModelMatrix.test.ts                     # Multi-model matrix benchmark test suite
│       └── liveCadGeometryE2E.test.ts                  # Complex mechanical & multimodal Image-to-CAD tests
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-10-04-complete-live-and-e2e-testing-plan.md
```

---

## Tasks

### Task 1: Multi-Model Live Test Matrix & Benchmark Suite

**Files:**

- Create: `src/server/liveModelMatrix.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: LiteLLM `/v1/models`, `/v1/chat/completions`, `src/server/aiChat.ts`, `src/server/db.ts`
- Produces: `npm run test:matrix` script running parameterized live tests across `google/gemini-3.8-flash`, `anthropic/claude-haiku-4-5`, `z-ai/glm-5.3-flash`, and `qwen3.7-flash` (or available equivalents in LiteLLM).

- [ ] **Step 1: Write failing multi-model matrix test harness**
      Define `src/server/liveModelMatrix.test.ts` querying available models from LiteLLM and executing parameterized test suites for:
  1. `build_parametric_model` tool generation with valid OpenSCAD.
  2. `create_mesh` tool routing for creative prompts.
  3. Model reasoning token extraction and token budgeting.
  4. Conversation persistence in PostgreSQL.

- [ ] **Step 2: Add `test:matrix` script to `package.json`**

  ```json
  "test:matrix": "tsx --test --test-concurrency=1 'src/server/liveModelMatrix.test.ts'"
  ```

- [ ] **Step 3: Run `npm run test:matrix` and verify multi-model execution**
      Ensure test runs against live LiteLLM gateway and passes across active models.

- [ ] **Step 4: Commit Task 1**
  ```bash
  git add package.json src/server/liveModelMatrix.test.ts
  git commit -m "feat(test): add multi-model live matrix benchmark test suite"
  ```

---

### Task 2: Complex Mechanical Geometry & Multimodal Tests

**Files:**

- Create: `src/server/liveCadGeometryE2E.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `src/server/aiChat.ts`, OpenSCAD parameter verification
- Produces: `npm run test:geometry` script verifying generation of complex mechanical assemblies and image-grounded CAD.

- [ ] **Step 1: Write failing complex CAD geometry tests**
      Implement test cases in `src/server/liveCadGeometryE2E.test.ts`:
  1. **Threaded M6 Fastener**: Asserts parametric cylinder, pitch, helical/thread approximations or BOSL2 include, and mating clearance.
  2. **Snap-Fit Electronics Enclosure**: Asserts box base with cantilever snap-fit tabs, lid cutouts, and 4x interior PCB mounting standoffs.
  3. **Parametric Involute Spur Gear**: Asserts pitch diameter, pressure angle, and tooth count variables.
  4. **Multimodal Image-to-CAD**: Ingests base64-encoded technical sketch image with labeled dimensions (`50mm x 30mm with 10mm hole`) and asserts generated OpenSCAD matches extracted dimensions.

- [ ] **Step 2: Add `test:geometry` script to `package.json`**

  ```json
  "test:geometry": "tsx --test --test-concurrency=1 'src/server/liveCadGeometryE2E.test.ts'"
  ```

- [ ] **Step 3: Run `npm run test:geometry` and verify passes**

- [ ] **Step 4: Commit Task 2**
  ```bash
  git add package.json src/server/liveCadGeometryE2E.test.ts
  git commit -m "feat(test): add complex mechanical geometry and multimodal CAD tests"
  ```

---

### Task 3: Automated Browser UI End-to-End Suite with Playwright

**Files:**

- Create: `playwright.config.ts`
- Create: `e2e/helpers/auth.ts`
- Create: `e2e/helpers/canvas.ts`
- Create: `e2e/auth-and-chat.spec.ts`
- Create: `e2e/wasm-and-3d-viewport.spec.ts`
- Create: `e2e/model-selector-and-roles.spec.ts`
- Create: `e2e/cad-reference-overlay.spec.ts`
- Create: `e2e/mobile-viewport.spec.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: Running CADAM web container (`http://localhost:8408/cadam/`), Playwright Chromium runner
- Produces: `npm run test:e2e` running full browser automation suite.

- [ ] **Step 1: Configure `playwright.config.ts`**
      Set `baseURL: 'http://localhost:8408/cadam'`, Chromium browser with `--no-sandbox` and `--disable-dev-shm-usage`.
- [ ] **Step 2: Implement test helpers in `e2e/helpers/auth.ts` and `canvas.ts`**
  - `auth.ts`: Signs mock JWT session token and injects session cookie so tests bypass external SSO providers.
  - `canvas.ts`: Inspects Three.js canvas in page context, verifying WebGL context is active and rendering frames.
- [ ] **Step 3: Implement `auth-and-chat.spec.ts`**
  - Verifies landing page, authenticated session, typing prompt in textarea, streaming tokens, and immediate presence of `AssistantLoadingBubble` (`Generating with Adam...`).
- [ ] **Step 4: Implement `wasm-and-3d-viewport.spec.ts`**
  - Verifies that upon message arrival, OpenSCAD code is compiled via WASM worker and rendered into Three.js canvas.
- [ ] **Step 5: Implement `model-selector-and-roles.spec.ts`**
  - Opens model picker dropdown, selects different models, confirms model badge in assistant bubble.
- [ ] **Step 6: Implement `cad-reference-overlay.spec.ts`**
  - Uploads synthetic reference STEP/STL file, verifies feature badges (bounds, holes), enables ghost overlay, and checks collision HUD.
- [ ] **Step 7: Implement `mobile-viewport.spec.ts`**
  - Emulates iPhone viewport, verifies floating generation pill, floating "View 3D" button with safe-area insets, and drawer open/close.
- [ ] **Step 8: Add `test:e2e` script to `package.json` and verify runs pass**

- [ ] **Step 9: Commit Task 3**
  ```bash
  git add playwright.config.ts e2e/ package.json
  git commit -m "feat(e2e): add automated browser UI end-to-end test suite with Playwright"
  ```

---

### Task 4: Interactive Live Validation & Visual Screenshots

**Files:**

- Capture screenshots of real running UI and save to artifact directory.

- [ ] **Step 1: Drive browser to `http://127.0.0.1:8408/cadam/` via `chrome-devtools`**
- [ ] **Step 2: Generate 3D parametric model and capture WebGL rendering screenshot**
- [ ] **Step 3: Capture mobile layout screenshot with floating generation indicators**
- [ ] **Step 4: Embed screenshots into artifact report**

---

### Task 5: Version Bump (`0.10.0`), PR, Code Review, Merge & Release

**Files:**

- Modify: `package.json` (`version: "0.10.0"`)

- [ ] **Step 1: Bump `package.json` version to `0.10.0`**
- [ ] **Step 2: Run full verification (`npm test`, `npm run test:live`, `npm run test:matrix`, `npm run test:geometry`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`)**
- [ ] **Step 3: Commit and push branch `feat/complete-live-and-e2e-testing-suite`**
- [ ] **Step 4: Create PR on GitHub**
- [ ] **Step 5: Conduct dual high-effort code & test-theatre reviews via subagents**
- [ ] **Step 6: Address review findings, commit, and push**
- [ ] **Step 7: Merge PR to `main`**
- [ ] **Step 8: Tag `v0.10.0` and push tag**
- [ ] **Step 9: Monitor GitHub Actions build, pull down images `0.10.0` and `latest`, restart container, and verify HTTP 200 OK**
