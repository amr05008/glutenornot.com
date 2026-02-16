---
date: 2026-02-16
summary: Increase slow scan threshold from 10s to 30s
tags: [mobile, ux]
---

## Summary
Increased the `LoadingSpinner` slow threshold from the default 10 seconds to 30 seconds. The "This is taking longer than usual" message was appearing too aggressively during normal scans (OCR + Claude analysis).

## Changes
- `mobile/app/index.tsx` — Added `slowThresholdMs={30000}` prop to `<LoadingSpinner>`

## Notes
- JS-only change; will be bundled with a future App Store release
- No native rebuild required (could also ship via OTA if configured)
