# Dynamic Reasoning & Stream Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide dynamic per-model reasoning effort controls in the UI, clamp runaway reasoning on OpenRouter/LiteLLM/Anthropic/Google, inject SSE heartbeats to prevent proxy timeouts, and acquire mobile screen wake lock during generation.

**Architecture:** Model metadata discovers reasoning capabilities; the chat input toolbar renders an effort selector (`off`/`low`/`medium`/`high`/`max`) when supported; the server translates effort to provider options with a 2k-token ceiling on `low`; the SSE stream writes keepalive frames every 15s; the client requests `navigator.wakeLock` during generation.

**Tech Stack:** TypeScript, React, Tailwind CSS, Vercel AI SDK, Nitro / H3, LiteLLM / OpenRouter, Node test runner (`tsx --test`).

## Global Constraints

- Strictly adhere to Semantic Versioning (`package.json` bump prior to merge).
- Ensure custom containerization files (`Dockerfile`, `entrypoint.sh`, `.github/workflows/`, and `AGENTS.md`) remain untouched.
- Preserve all existing tests and passing test suite (`npm test`).

---

### Task 1: Model Discovery & Reasoning Metadata

**Files:**

- Modify: `src/types/misc.ts`
- Modify: `src/routes/api/models.ts`
- Test: `src/server/models.test.ts`

**Interfaces:**

- `ModelConfig` produces:
  - `supportsThinking: boolean`
  - `defaultReasoningEffort?: 'off' | 'low' | 'medium' | 'high' | 'max'`
  - `reasoningEfforts?: Array<'off' | 'low' | 'medium' | 'high' | 'max'>`

- [ ] **Step 1: Write the failing test for reasoning metadata in models.test.ts**

```ts
test('extracts reasoning metadata and defaultReasoningEffort from model_info', async () => {
  const mockModelsResponse = {
    data: [
      {
        id: 'openrouter/z-ai/glm-5.3-flash',
        model_name: 'glm-5.3-flash',
        model_info: {
          supports_reasoning: true,
          reasoning: {
            mandatory: true,
            supported_efforts: ['low', 'high', 'max'],
          },
        },
      },
    ],
  };

  const models = await fetchAvailableModels({
    fetchFn: async () =>
      new Response(JSON.stringify(mockModelsResponse), { status: 200 }),
    forceRefresh: true,
  });

  const glm = models.find((m) => m.id === 'glm-5.3-flash');
  assert.ok(glm);
  assert.equal(glm.supportsThinking, true);
  assert.equal(glm.defaultReasoningEffort, 'low');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/models.test.ts`
Expected: FAIL due to missing property or undefined.

- [ ] **Step 3: Update ModelConfig and fetchAvailableModels**

In `src/types/misc.ts`:
Add `defaultReasoningEffort?: 'off' | 'low' | 'medium' | 'high' | 'max';` and `reasoningEfforts?: Array<'off' | 'low' | 'medium' | 'high' | 'max'>;` to `ModelConfig`.

In `src/routes/api/models.ts`:
Parse `model_info.supports_reasoning`, `model_info.reasoning`, or check known models like `glm-5` to assign `defaultReasoningEffort: 'low'` when reasoning is mandatory or enabled.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/server/models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/misc.ts src/routes/api/models.ts src/server/models.test.ts
git commit -m "feat(models): extract reasoning effort capabilities and defaults"
```

---

### Task 2: Server-Side Reasoning Translation & Visual Inspection Guardrail

**Files:**

- Create: `src/server/aiChatReasoning.test.ts`
- Modify: `src/server/aiChat.ts`

**Interfaces:**

- Consumes: `rawBody.reasoningEffort?: 'off' | 'low' | 'medium' | 'high' | 'max'`
- Produces: Normalized `reasoning` and `thinking` options for OpenRouter, Anthropic, and Google.

- [ ] **Step 1: Write tests for buildChatModel reasoning translation**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatModel } from './aiChat';

test('buildChatModel passes effort and capped tokens to openrouter when reasoningEffort is low', () => {
  let capturedOptions: Record<string, unknown> | undefined;
  const mockProviders = {
    openrouter: () => ({
      chat: (_id: string, opts: Record<string, unknown>) => {
        capturedOptions = opts;
        return {} as never;
      },
    }),
    anthropic: () => (() => ({}) as never) as never,
    google: () => (() => ({}) as never) as never,
  };

  buildChatModel('glm-5.3-flash', mockProviders, true, 2048, undefined, 'low');
  assert.ok(capturedOptions);
  assert.deepEqual(capturedOptions.reasoning, {
    effort: 'low',
    max_tokens: 2048,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/aiChatReasoning.test.ts`
Expected: FAIL due to missing parameter.

- [ ] **Step 3: Implement reasoningEffort parameter in buildChatModel & aiChat handler**

In `src/server/aiChat.ts`:

- Extend `buildChatModel` to accept `reasoningEffort?: 'off' | 'low' | 'medium' | 'high' | 'max'`.
- Map effort:
  - `low`: `max_tokens: 2048`, `effort: 'low'`
  - `medium`: `max_tokens: 4096`, `effort: 'medium'`
  - `high`: `max_tokens: 8192`, `effort: 'high'`
  - `max`: `max_tokens: 16384`, `effort: 'max'`
  - `off`: omit or pass `{ effort: 'none' }`
- For OpenRouter:
  ```ts
  const effort = reasoningEffort ?? (thinking ? 'high' : 'low');
  ```
  Pass `reasoning: { effort, max_tokens: budget }`.
- On inspection turns (step 1+): enforce `low` effort if `reasoningEffort` was not explicitly `high` or `max`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/server/aiChatReasoning.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/aiChat.ts src/server/aiChatReasoning.test.ts
git commit -m "feat(ai-chat): add reasoning effort translation and inspection guardrails"
```

---

### Task 3: SSE Protocol Heartbeats

**Files:**

- Modify: `src/server/aiChat.ts`
- Test: `src/server/aiChatHeartbeat.test.ts`

**Interfaces:**

- Emits periodic `: ping\n\n` comments or heartbeat transient packets every 15s to keep connections alive during long generations.

- [ ] **Step 1: Write unit test for heartbeat emission**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeartbeatManager } from './serverHeartbeat';

test('emits heartbeat every interval until stopped', async () => {
  const pings: string[] = [];
  const manager = createHeartbeatManager((msg) => pings.push(msg), 50);
  await new Promise((r) => setTimeout(r, 120));
  manager.stop();
  assert.ok(pings.length >= 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/aiChatHeartbeat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement heartbeat utility and integrate into stream execution in aiChat.ts**

Create `src/server/serverHeartbeat.ts` and integrate it into `createUIMessageStream({ execute })` in `src/server/aiChat.ts`, sending transient `: keepalive\n\n` or data ping chunks every 15s, stopping in `finally` / `onFinish` / `onError`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/server/aiChatHeartbeat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/serverHeartbeat.ts src/server/aiChatHeartbeat.test.ts src/server/aiChat.ts
git commit -m "feat(stream): add SSE keepalive heartbeats during generation"
```

---

### Task 4: Client Reasoning Effort UI & Mobile Screen Wake Lock

**Files:**

- Create: `src/components/chat/ReasoningEffortSelector.tsx`
- Modify: `src/components/TextAreaChat.tsx`
- Modify: `src/components/chat/ChatSession.tsx`

**Interfaces:**

- `ReasoningEffortSelector`: Renders dropdown (`off`, `low`, `medium`, `high`, `max`) when `model.supportsThinking` is true.
- `ChatSession.tsx`: Passes `reasoningEffort` in POST body and acquires `navigator.wakeLock` while `isLoading`.

- [ ] **Step 1: Build ReasoningEffortSelector component**

Create `src/components/chat/ReasoningEffortSelector.tsx` with icons and dropdown items for `Off`, `Low`, `Medium`, `High`, `Max`. Store selection in `localStorage` under `cadam_reasoning_effort_<modelId>`.

- [ ] **Step 2: Integrate into TextAreaChat.tsx**

Add `ReasoningEffortSelector` right beside `ModelSelector` on the bottom toolbar. Pass the selected effort back to `ChatSession`.

- [ ] **Step 3: Wire into ChatSession.tsx and add Wake Lock**

In `ChatSession.tsx`:

1. Include `reasoningEffort` in `handleSend` payload.
2. In `useEffect` on `isLoading`:
   ```ts
   if (isLoading && 'wakeLock' in navigator) {
     let lock: WakeLockSentinel | null = null;
     navigator.wakeLock
       .request('screen')
       .then((l) => {
         lock = l;
       })
       .catch(() => {});
     return () => {
       lock?.release().catch(() => {});
     };
   }
   ```

- [ ] **Step 4: Run typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: All passes with zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ReasoningEffortSelector.tsx src/components/TextAreaChat.tsx src/components/chat/ChatSession.tsx
git commit -m "feat(ui): add reasoning effort selector and screen wake lock"
```

---

### Task 5: Live Smoke Tests & Version Bump

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Run live LiteLLM reasoning test**

Execute `curl` to LiteLLM with `glm-5.3-flash` and `reasoning: { effort: 'low' }` to verify it completes under 3 seconds.

- [ ] **Step 2: Run live CADAM stream test**

Execute curl POST to `/cadam/api/parametric-chat` (or local container endpoint) to verify headers, keepalive presence, and valid response.

- [ ] **Step 3: Bump package.json version**

Increment version in `package.json` (e.g. `0.2.1` -> `0.2.2` or minor according to `AGENTS.md`).

- [ ] **Step 4: Full verification and Commit**

Run: `npm test && npm run build`
Commit:

```bash
git add package.json
git commit -m "chore: bump version for dynamic reasoning and stream resilience"
```
