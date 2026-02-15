---
date: 2026-02-15
summary: Handle OCR failures with inline banner instead of alert popup
tags: [mobile, ux, sentry, error-handling]
---

## Summary
Replaced the jarring `Alert.alert()` popup for OCR failures (blurry photos, no text detected) with an inline error banner overlaid on the camera view, including a one-tap "Try Again" button. Also downgraded OCR failures from `error` to `warning` level in Sentry since they are expected user errors (GLUTENORNOT-MOBILE-3).

## Changes
- `mobile/services/errorReporting.ts` — Added `ocr_failed` to the `isExpected` condition so it reports as `warning` instead of `error`
- `mobile/app/index.tsx` — Added `ocrError` state, catch block branching for OCR errors, inline banner UI with retry button and styles

## Decisions
- Kept `Alert.alert()` for non-OCR errors (network, timeout, unexpected) since those are less common and more serious
- Positioned banner above capture button (`bottom: 140`) so both are visible simultaneously
- Used dark semi-transparent background (`rgba(0,0,0,0.8)`) for readability over camera feed

## Notes
- Sentry issue: GLUTENORNOT-MOBILE-3 — 7 occurrences across 3 users, not causing crashes
- This is the only mobile change since v1.0.2; ready for 1.0.3 release
