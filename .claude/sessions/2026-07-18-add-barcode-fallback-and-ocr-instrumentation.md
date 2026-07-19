---
date: 2026-07-18
summary: Weekly data review → UPCitemdb barcode fallback (PR #16) + OCR capture instrumentation (PR #17), both grilled, merged, deployed, live-verified
tags: [analytics, barcode, ocr, privacy, posthog]
---

## Summary

Weekly data review (past 14 days: 81% scan success, zero backend errors, ~31 users)
identified barcode `not_found` (~15% of barcode scans) and OCR failures (25%) as the
top user-loss points. Shipped two server-side improvements the same day, both through
an adversarial-review cycle, and scoped the iOS 1.4.0 capture-assist work
(`plans/ocr-capture-assist-2026-07-18.md`).

## Changes

- **PR #16** (b00610a, ee17dc2): UPCitemdb keyless trial tier as the last barcode
  waterfall source (Nutritionix free tier discontinued by Syndigo — $499/mo minimum).
  Extracts retail-listing ingredient statements (uppercase `INGREDIENTS:` + comma
  guard) with a DATA RELIABILITY caveat capping confidence; skips sub-12-digit codes
  (UPCitemdb zero-pads EAN-8 into the wrong numbering space → wrong products);
  returned-code match guard mirroring USDA's.
- **PR #17** (13f9df5, 119fb8d): `image_kb` + `ocr_chars` on OCR `scan`/`scan_failed`
  events — Phase 1 of the capture-assist plan; decides the 1.4.1 fork (aiming vs
  blur). Privacy-policy analytics enumeration updated + re-dated to 2026-07-18.
- Both merged to main, Vercel-deployed, and verified live (smoke probes confirmed
  `data_source: upcitemdb` and `image_kb`/`ocr_chars` arriving in PostHog).
- Sentry GLUTENORNOT-MOBILE-2 re-resolved by Aaron (tripwire re-armed).

## Decisions

- **Scanned barcodes must never reach PostHog** — /grill caught that logging the
  missed barcode contradicts "no record of what you scanned" (a UPC resolves to a
  product name). Dropped in favor of the ephemeral Vercel `console.log`; regression-
  guarded in tests. Second /grill privacy catch on this repo.
- **Blur pre-check deferred to 1.4.1** — build it on observed `image_kb`
  distributions, not a guessed threshold. /grill also caught that the original fork
  criterion (`ocr_chars ≈ 0` on failures) was a tautology — `ocr_chars` is 0 on every
  `ocr_failed` by construction; the discriminator is `image_kb` failures-vs-successes.
- **Client-side failure events go through a beacon endpoint** (`/api/track`, Phase 2),
  not a PostHog SDK in the app — single pipeline, same hashed-IP anonymization, no
  App Store privacy-label change.
- **Keep barcode-first capture UX for now** — barcode outperforms OCR (85%/high-conf
  vs 75%/low-conf); revisit after 1.4.0 data.
- **1.4.0 = PR #15 + Phase 2 (torch toggle, flashlight-retry state, beacon)** in one
  build; release deliberately not cut this session to avoid two review cycles.

## Notes

- **Data hygiene:** 2026-07-18 evening `platform: web` events include my tests — one
  `scan` (`data_source: upcitemdb`, the DeWitt pond-liner probe) and two `ocr_failed`
  (blank-image probes, `image_kb: 0`). Exclude from the next weekly review.
- UPCitemdb trial: 100 req/day per calling IP (shared Vercel egress), burst-limits
  (`TOO_FAST` 429) after ~5 rapid requests; all failures degrade to a miss.
- Learning clock for the 1.4.1 fork started 2026-07-18 ~23:00 UTC; at ~3 OCR
  scans/day, expect "a few dozen data points" to take 2–4 weeks.
