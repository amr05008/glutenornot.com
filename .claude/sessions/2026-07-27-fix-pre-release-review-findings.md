---
date: 2026-07-27
summary: Fixed all 9 pre-release review findings TDD-style, grilled, and shipped iOS 1.4.1
tags: [pre-release, safety, timeouts, torch, analytics, regex, release]
---

## Summary
Worked through the fix-status checklist in `reports/2026-07-27-pre-release-review.md` in order, TDD-style (every fix landed after a watched-failing test). All 9 items fixed and checked off; #1 additionally verified against live Open Food Facts data (Prince biscuits 7622210449283 now returns no misleading note). A subagent grill returned **SHIP** with two 🟡 follow-ups, both landed pre-commit: a trailing-comma truncation guard on the UPCitemdb capture (the only failure mode that leaned toward "safe") and a 45s `callClaude` retry deadline (3 hung attempts previously ran ~76s past the 60s client budget). Then ran the full release: **iOS 1.4.1 (build 1) submitted to App Store review 2026-07-27 evening**, tagged `v1.4.1`; api/web halves deployed via Vercel on push. Final suites: 214 web + 62 mobile.

Commits: `3400ad0` (all 9 fixes + grill follow-ups), `3a8b0a2` (1.4.1 bump), `057e996` (release close-out + runbook fixes), plus the wrap-up doc pass.

Release notes-to-future-self: Xcode signing/version prep is now fully pre-scriptable (DEVELOPMENT_TEAM into pbxproj — recipe in RELEASE.md step 5); the App Store live-check cloud routine was re-armed for 1.4.1 (fires Thu 2026-07-30 9pm ET). TestFlight device pass was skipped this release — the torch fallback fix's on-device confirmation rides the production build (watch item in RELEASE.md).

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
