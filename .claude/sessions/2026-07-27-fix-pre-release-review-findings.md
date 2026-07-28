---
date: 2026-07-27
summary: Fixed all 9 findings from the 2026-07-27 pre-release review (Fable 5 + Kimi K3), failing-test-first
tags: [pre-release, safety, timeouts, torch, analytics, regex]
---

## Summary
Worked through the fix-status checklist in `reports/2026-07-27-pre-release-review.md` in order, TDD-style (every fix landed after a watched-failing test). All 9 items fixed and checked off; #1 additionally verified against live Open Food Facts data (Prince biscuits 7622210449283 now returns no misleading note). Suites: 212 web + 62 mobile, all passing.

## Changes
- `api/barcode.js` — #1: `GLUTEN_GRAIN_PATTERN` extended with ES/NL/CA/FR (analyze-prompt vocab) + DE/IT terms, `\b` → `\p{L}` lookarounds with `u` flag (é broke `\b`); `tarwe/weizen/gerst/rogge` allow compound suffixes, `malt` stays exact (maltodextrin). Uncorroborated-tag note reworded to never assert grain absence. #9: dropped `/s` from the UPCitemdb `INGREDIENTS:` regex so multi-line retail prose stops at end of line.
- `api/analyze.js` — #2: Vision fetch gets `AbortSignal.timeout(10s)`; a timeout throws `OCR_ERROR` (classified, bounded). #5: `parseClaudeResponse` normalizes verdicts via `normalizeVerdict` instead of discarding complete analyses over casing (fixture updated to the new spec). `performOCR` exported for tests.
- `api/_utils.js` — #2: `callClaude` per-attempt `AbortSignal.timeout(25s)` (option `attemptTimeoutMs`); aborts take the existing overloaded/retry path. Worst case ~76s, under Vercel's 300s.
- `api/_analytics.js` — #4: PostHog flush handed to the Vercel request context's `waitUntil` (read via `Symbol.for('@vercel/request-context')` — the `@vercel/functions` subpath export isn't exposed, so no new dependency) instead of blocking the response; awaited fallback when no context (local/dev).
- `mobile/app/index.tsx` — #3: isAnalyzing/systemState branches render before the permission gate so photo-picker scans show spinner/error UI with camera denied. #7: `scanSource` state; picker-sourced couldn't-read failures get plain "Try again" and never touch the torch. #8: `readySignal` bumped on real `onCameraReady`; the torch effect re-runs and forces a fresh false→true transition when the real ready arrives after the 2s fallback.
- `web/js/api.js` + `web/sw.js` — #6: `API_TIMEOUT` 30s → 60s (matches mobile); SW cache bumped to v6 (api.js is precached).
- Tests: new suites/cases across `web/tests/api/{barcode,analyze,claude,analytics}.test.js`, `web/tests/js/api.test.js`, `mobile/app/__tests__/index.test.tsx`; permission + posthog-node mocks made controllable.

## Decisions
- #4 reads the request-context symbol directly rather than depending on `@vercel/functions`: the package's root `waitUntil` silently no-ops without a context (can't drive the awaited fallback), and its `getContext` subpath isn't in the exports map. Installed, inspected, uninstalled — lockfile clean.
- #1 pattern-widening is fail-safe by construction: a false positive only means the gluten tag stands (leans caution/unsafe), never a safer verdict.

## Notes
- #8 is fixed + unit-tested but the report's on-device caveat stands — confirm the torch behavior on a slow device before shipping 1.4.1.
- Mobile changes (`index.tsx`) need an iOS build to ship; api/web changes deploy via Vercel on push.
- The report's 7 unverified hunches remain untriaged (tracked in the report).
