---
date: 2026-07-06
summary: Next-version feature batch — Recents scan history, in-app rating prompt, French glossary; privacy policy made accurate under /grill
tags: [mobile, recents, storage, rating-prompt, i18n, privacy]
---

## Summary
Second chunk of the day (after the backend observability batch). Shipped the French prompt glossary (backend, live on push), the in-app App Store rating prompt, and the Recents scan-history screen (both mobile, ship with the next iOS build). A /grill pass before shipping caught a merge-blocking privacy defect: the diff re-dated the privacy policy while its analytics/location claims were inaccurate against the per-scan PostHog events — policy substantially rewritten.

## Changes
- `api/analyze.js` — French gluten vocabulary, allergen phrases, dish watchlist in CLAUDE_PROMPT (PostHog-prioritized: fr detections + Canada traffic)
- `mobile/services/review.ts` (new) — `maybeRequestReview`: expo-store-review, ≥3 lifetime scans, once per install, never throws; flag set before the native call so a failure goes silent rather than retrying forever
- `mobile/app/result.tsx` — rating ask 2s after a successful verdict; suppressed when `fromHistory: '1'`
- `mobile/services/storage.ts` — recent-scans trio (`addRecentScan`/`getRecentScans`/`clearRecentScans`, cap 50, never-throw writes, per-entry shape guard so malformed entries can't crash the screen) + review-prompted flag
- `mobile/app/recents.tsx` (new) — history list (verdict dot, title, verdict·kind·date), tap reopens saved result, Clear All with confirm, StateScreen empty state
- `mobile/app/index.tsx` — history button replaces the footer symmetry spacer; scans save from `navigateToResult`; offline copy no longer claims nothing is stored on device
- `mobile/components/Icon.tsx` — `history` clock glyph; `mobile/app/_layout.tsx` — recents route
- `web/privacy-policy.html` — new "Anonymous Analytics" section (per-scan events: verdict, type, language, city-level geo, hashed IP), PostHog + Sentry added to Third-Party Services, "No location data" → "no precise location", local-storage section covers recents + rating flag, effective date → 2026-07-06
- Tests: mobile 12→40 (review, storage, recents, result, camera integration), web 151

## Decisions
- History is local-only AsyncStorage (no accounts — hard constraint), single key, newest-first, cap 50; `{savedAt, result}` with no id (savedAt is the key)
- Simplifications chosen deliberately: static short date instead of relative-time util; no schema versioning (per-entry guard + result screen's existing parse guard cover drift); Clear All only, no swipe-to-delete
- Rating prompt suppressed on history reopens — the once-per-install ask is reserved for a fresh scan
- Privacy rule extracted from the /grill finding: never bump a policy's effective date while it contains a claim you know is false

## Notes
- Next iOS build carries: Recents, rating prompt, June result-band fix. App Store privacy label change ("Data Not Collected" → "Data Not Linked to You") is queued in ROADMAP for that release.
- Accepted-minor from /grill: history write adds two awaited AsyncStorage round-trips pre-navigation (ms-scale); brief white flash on Recents load; no double-tap debounce on the history button (consistent with existing pattern).
