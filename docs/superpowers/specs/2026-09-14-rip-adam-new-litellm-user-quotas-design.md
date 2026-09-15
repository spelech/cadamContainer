# Spec: Rip Out `adam.new` & LiteLLM User Quota Attribution

**Date:** 2026-09-14  
**Status:** Approved  
**Branch:** `feat/rip-adam-new-litellm-user-quotas`  
**Target Version:** `0.3.1`  

---

## 1. Goal
1. Remove all references, external links, marketing banners, and legacy route redirects for `adam.new` from the CADAM UI and backend.
2. Forward the authenticated PocketID user identity to the local LiteLLM gateway so administrators can track spend and enforce per-user rate limits and budgets in LiteLLM.

---

## 2. Requirements & Scope

### A. Removal of `adam.new` UI & Links
- **Prompt Composer Banner**: Delete `src/components/NewProductBanner.tsx` and unmount it from `src/views/PromptView.tsx`.
- **Sidebar Dropdown**: In `src/components/Sidebar.tsx`, point the user menu's "Subscriptions" item internally to `/settings` instead of the external `BILLING_URL` (`https://accounts.adam.new/billing`).
- **Legacy Route**: In `src/routes/_layout/subscription.tsx`, redirect to `/settings` instead of `BILLING_URL`.
- **Billing Config**: In `src/config/billing.ts`, update or deprecate `BILLING_URL` to point to `/settings` or relative route.
- **Backend Checkout**: In `src/routes/api/billing-checkout.ts`, remove fallback to `https://adam.new/app`.
- **Documentation**: Clean up `README.md`, `benchmarks/README.md`, and `CODE_OF_CONDUCT.md` to remove `adam.new` links.

### B. LiteLLM User Quota Attribution
- When CADAM's AI chat service (`src/server/aiChat.ts`) prepares chat or auxiliary model requests to LiteLLM via the `openrouter` SDK provider:
  - Add HTTP header: `'x-litellm-user-id': user.email` (or `user.id` if email is unavailable).
  - Add request body parameter: `user: user.email`.
- LiteLLM interprets these fields to attribute all prompt tokens, completion tokens, and dollar costs to the specific user account.
- When a user exceeds their LiteLLM budget or quota, LiteLLM responds with standard HTTP 429 errors which CADAM passes to the client as stream errors cleanly.

---

## 3. Global Constraints
- Strictly self-hosted: No external billing or proprietary SaaS account links.
- Backwards-compatible: Existing database messages, conversations, and OpenSCAD parametric code generation must remain 100% functional.
- Zero lint/typecheck regressions: Must pass `npm run typecheck`, `npm run lint`, and `npm test`.
- Semantic Versioning: Bump to `0.3.1` in `package.json` and `package-lock.json` per `AGENTS.md`.
