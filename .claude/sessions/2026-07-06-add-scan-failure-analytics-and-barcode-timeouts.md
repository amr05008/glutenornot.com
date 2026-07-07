---
date: 2026-07-06
summary: Backend-only observability batch — barcode lookup timeouts, scan_failed PostHog event, confidence properties, health-check fallback-key report
tags: [analytics, posthog, sentry, barcode, health-check, observability]
---

## Summary
Data review (Sentry + PostHog) found barcode scans are ~76% of usage, "caution" is ~60% of barcode verdicts, GLUTENORNOT-MOBILE-7 is a barcode-lookup client timeout, and PostHog only records successful scans (no failure visibility). Shipped the four backend-only fixes: per-source fetch timeouts, a `scan_failed` event, `confidence`/`had_ingredient_data` scan properties, and fallback-key presence in `/api/health`.

## Changes
- `api/barcode.js` — `AbortSignal.timeout(5000)` on OFF/USDA/Nutritionix fetches (`EXTERNAL_FETCH_TIMEOUT_MS`); `trackScanFailure` on rate-limit/not-found/Claude-error/server-error paths; `confidence` + `hadIngredientData` on `trackScan`; exported lookups for tests
- `api/analyze.js` — `trackScanFailure` on rate-limit/OCR-empty/Claude-error/server-error paths; `confidence` on `trackScan`
- `api/_analytics.js` — new `SCAN_FAILED_EVENT`/`buildScanFailureProperties`/`trackScanFailure`; `buildScanProperties` gains `confidence` + `had_ingredient_data`; shared `captureEvent` helper
- `api/health.js` — `services.barcode_fallbacks.{usda,nutritionix}` key-presence report (visibility-only, never flips `healthy`)
- `web/tests/api/*` — 28 new tests incl. handler-level analytics tests with `vi.mock`ed `_analytics` (148 total pass)
- `ROADMAP.md` — checked off the four items; env-var verification TODO now points at the health endpoint

## Decisions
- **Failures are a separate `scan_failed` event**, not a property on `scan` — every existing insight counting `scan` keeps meaning "successful scans" (see memory: prefer scan-based metrics).
- **Fallback keys never affect `healthy`** — they're optional, and UptimeRobot hits this endpoint every 5 min; a missing optional key must not page.
- **5s per external source** — client barcode budget is 30s and the chain is up to 3 OFF variants + USDA + Nutritionix + Claude; a slow source degrades to a waterfall miss.

## Notes
- Data snapshot (90d): peak week Jun 7 = 99 scans/20 users, declining since; retention cliff (Jun 7 cohort: 18 new → 4 wk1 → 0); `data_source` is 100% openfoodfacts; detected languages fr×3, ar×1; countries US 173 / CA 15 / EG 6.
- Sentry: MOBILE-2 quiet since Jun 18 (fix holding; reopened by one network-error event — re-resolve in dashboard). MOBILE-7 = 7 barcode timeouts since Mar, 1 user, addressed here.
- After the next deploy: hit `GET /api/health` to close the USDA/Nutritionix env-var verification TODO.
- Next-version candidates left on the table (app release): Recents/scan history, in-app rating prompt, barcode→verdict caching, French glossary (backend, can go anytime).
