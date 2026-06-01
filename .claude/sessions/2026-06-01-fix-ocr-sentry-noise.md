---
date: 2026-06-01
summary: Suppress ocr_failed Sentry noise and resolve MOBILE-2
tags: [sentry, mobile, observability, error-handling]
---

## Summary
Reviewed recent Sentry errors for glutenornot-mobile. All three unresolved issues
were expected, handled `APIError`s at `warning` level — not crashes. The dominant one
(GLUTENORNOT-MOBILE-2, 181 events / 7 users, ~95% of all volume) was `ocr_failed`:
a normal user flow (blurry/off-angle photos, already handled with a refocus prompt)
with no diagnostic value. Suppressed it at capture, matching the established
belt-and-suspenders pattern, and resolved the issue in the dashboard.

## Changes
- `mobile/services/errorReporting.ts` — `ocr_failed` now returns early (no capture),
  grouped with `not_found`; removed from the `isExpected` list.
- `mobile/app/_layout.tsx` — added `ocr_failed` to the `beforeSend` SDK-level filter
  alongside `not_found` (regression-proof against direct `captureException` calls).
- `ROADMAP.md` — checked off ocr_failed noise suppression under Error Monitoring.

## Commits
- `3ca106c` Stop reporting OCR-failure errors to Sentry (wrapper)
- (beforeSend + ROADMAP + this log shipped in a follow-up commit)

## Decisions
- An individual `ocr_failed` is noise as an exception (identical stack every time,
  Seer actionability super_low). The only value is the aggregate failure *rate*,
  which is better captured server-side in `api/analyze.js` if ever needed — not as a
  client exception. Not worth doing at current volume (7 users / 4 months).
- Left `network`/`timeout` warnings in place — low volume, some environmental signal.

## Notes
- Sentry MCP is read-only (no issue mutation) — MOBILE-2 was resolved manually in the
  dashboard.
