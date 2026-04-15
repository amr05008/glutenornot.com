---
date: 2026-04-14
summary: Sentry audit of GLUTENORNOT-MOBILE-2 — root cause identified, belt-and-suspenders filter added, barcode miss logging, duplicate scan cache
tags: [sentry, error-monitoring, barcode, observability]
---

## Summary

Audited Sentry for glutenornot-mobile. One active issue (`GLUTENORNOT-MOBILE-2`): 144 events across 10 users since Feb 5. Root cause confirmed via git log: the `not_found` filter in `errorReporting.ts` was added after v1.1.0 shipped, so the filter exists in source but isn't deployed. Added a `beforeSend` guard at the Sentry SDK level as belt-and-suspenders, server-side barcode miss logging, and a client-side duplicate-scan cache to prevent the frustration retry loop.

## Changes

- `mobile/app/_layout.tsx` — Added `beforeSend` to Sentry.init to block `not_found` events at SDK level regardless of call site
- `api/barcode.js` — Added `console.log('barcode_not_found', barcode)` on 404 so Vercel logs capture missing barcodes for coverage analytics
- `mobile/app/index.tsx` — Added `recentNotFound` ref cache; skips API call for barcodes that failed in the last 60s, shows inline message instead
- `ROADMAP.md` — Added "Error Monitoring & Observability" section with completed items checked and manual steps tracked

## Decisions

- Used `beforeSend` instead of relying solely on the `reportError` wrapper — SDK-level filtering is regression-proof against future direct `captureException` calls
- Server-side logging preferred over Sentry client breadcrumbs for barcode misses (breadcrumbs only attach to captured events; since `not_found` returns early with no capture, a client breadcrumb would be lost)
- Deferred "not found" UX improvements (fallback button, Open Food Facts add link) to a future session

## Notes

- Still needs: SENTRY_AUTH_TOKEN EAS secret for source map uploads, Sentry alert rules (manual in dashboard), verify USDA/Nutritionix env vars in Vercel, new app build to ship mobile changes
- The `mechanism: generic` tag in Sentry events confirmed the errors were captured via explicit `captureException`, consistent with the pre-filter code path
- One user (F0EC4563) had 10 failures in 6 minutes on April 7 in Indianapolis — the `recentNotFound` cache directly addresses this pattern
