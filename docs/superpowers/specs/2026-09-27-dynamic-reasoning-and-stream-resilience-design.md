# Dynamic Reasoning Controls & Stream Resilience Design

## Overview

Models with advanced or mandatory reasoning capabilities (e.g. `z-ai/glm-5.3-flash`, DeepSeek R1, QwQ, Claude 3.7/5 Thinking, o-series) can engage in massive internal reasoning chains (exceeding 10,000 tokens) if effort and token limits are not explicitly configured. This causes long wait times, connection timeouts across reverse proxies (Cloudflare, Caddy), and mobile browser connection drops.

This design introduces:

1. **Dynamic Per-Model Reasoning UI**: A selector in the chat action bar to switch reasoning effort (`off`, `low`, `medium`, `high`, `max`) for reasoning-capable models, defaulting sensibly (e.g. `low` for fast, lightweight CAD iterations).
2. **Universal Server Reasoning Controls**: Provider translation for OpenRouter, LiteLLM, Anthropic, and Google Generative AI to respect the chosen effort and budget tokens, with safe bounds on inspection turns.
3. **SSE Protocol Heartbeats**: Periodic keepalive frames (`: ping\n\n`) on the SSE stream to prevent idle timeouts from upstream reverse proxies and CDNs.
4. **Mobile Screen Wake Lock**: Acquires `navigator.wakeLock` on supported devices while generation is in flight to keep mobile screens active and prevent background connection drops.
5. **Live Verification**: Automated and live smoke tests verifying GLM-5.3-Flash, LiteLLM gateway integration, and SSE keepalives.

---

## Architecture & Data Flow

### 1. Model Discovery & Metadata

- `src/routes/api/models.ts`:
  - Returns `supportsThinking: boolean` and available `reasoningEfforts?: string[]`.
  - If the model metadata from LiteLLM / OpenRouter has `supports_reasoning: true` or `reasoning.mandatory === true`, `supportsThinking` is marked `true`.
  - Models with mandatory reasoning flag `defaultReasoningEffort: 'low'` to prevent unbounded `max` runs.

### 2. Client UI & State Management

- `src/components/TextAreaChat.tsx` & `src/components/chat/ReasoningEffortSelector.tsx`:
  - Next to `ModelSelector`, conditionally renders a compact reasoning pill/dropdown if `selectedModelConfig.supportsThinking` is true.
  - Tiers:
    - `off` (disabled where allowed, or minimal)
    - `low` (fastest iteration, default for fast CAD)
    - `medium`
    - `high`
    - `max` (exhaustive reasoning)
  - Stores user preference in `localStorage` keyed by `cadam_reasoning_effort_<modelId>`.
  - Passes `reasoningEffort` alongside `model` in the chat payload.

### 3. Server-Side Provider Integration

- `src/server/aiChat.ts`:
  - Extracts `reasoningEffort` from the incoming request body (`'off' | 'low' | 'medium' | 'high' | 'max'`).
  - Maps effort to token budgets and provider options:
    - **OpenRouter / LiteLLM**:
      ```ts
      reasoning: {
        effort: reasoningEffort === 'off' ? undefined : reasoningEffort,
        max_tokens: effortToTokens(reasoningEffort)
      }
      ```
      If `reasoningEffort === 'low'`, cap at 2,048 tokens; `medium` at 4,096; `high` at 8,192; `max` at 16,384. If `off`, omit or pass `{ effort: 'none' }` where accepted.
    - **Anthropic**:
      Maps to `thinking: { type: 'adaptive' }` with `effort: 'low' | 'medium' | 'high'`, or budget tokens.
    - **Google**:
      Configures `thinkingConfig: { thinkingBudget: effortToTokens(...) }`.
  - **Visual Multi-View Inspection Step (step 1+)**:
    On multi-view inspection, if the user effort is not explicitly set to `high` or `max`, enforce `low` effort so the model doesn't re-reason for 10k tokens when simply checking rendered screenshots.

### 4. Connection Resilience (SSE Heartbeats & Wake Lock)

- **SSE Heartbeats in `src/server/aiChat.ts`**:
  - An interval timer runs every 15 seconds during active stream generation.
  - Writes an SSE comment line `: keepalive\n\n` or a transient UI message chunk to the stream.
  - Prevents Cloudflare 100s HTTP 524 timeouts and Caddy connection drops.
- **Screen Wake Lock in `src/components/chat/ChatSession.tsx`**:
  - On `status === 'submitted' | 'streaming'`, requests `navigator.wakeLock.request('screen')`.
  - Catches and ignores `NotAllowedError` or unsupported browsers.
  - Releases lock cleanly in cleanup / `onFinish` / `onError`.

---

## Testing & Verification Plan

1. **Unit Tests**:
   - Test `fetchAvailableModels` parses reasoning metadata correctly.
   - Test `buildChatModel` translates `reasoningEffort` into correct provider payload parameters for OpenRouter, Anthropic, and Google.
   - Test SSE keepalive interval triggers and clean termination.
2. **Live Smoke Tests**:
   - Live curl test through LiteLLM with `reasoning: { effort: 'low' }` vs `max` confirming low-latency return.
   - End-to-end parametric chat invocation with `glm-5.3-flash` confirming complete parametric build and fast inspection completion without timing out.
