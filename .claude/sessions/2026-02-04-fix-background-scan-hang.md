---
date: 2026-02-04
summary: Fix mobile app hanging on scan after prolonged background inactivity
tags: [mobile, bug-fix, networking, appstate]
---

## Summary
Fixed a bug where the mobile app would hang on the "Scanning ingredients..." screen after being in the background for a prolonged period. iOS tears down network connections during background suspension, causing `fetch()` to enter a limbo state. Added AppState handling, external abort signal support, a cancel button with slow-scan warning, and Sentry context for post-resume failures.

## Changes
- `mobile/services/api.ts` — `analyzeImage()` now accepts an optional `externalSignal: AbortSignal` parameter. When the external signal fires, it aborts the internal fetch controller. Cleanup removes the listener in both success and error paths.
- `mobile/components/LoadingSpinner.tsx` — Added `slowMessage`, `slowThresholdMs` (default 10s), and `onCancel` props. After the threshold, the message swaps to the slow warning. Cancel button is always visible when `onCancel` is provided, becoming prominent (filled) after the slow threshold.
- `mobile/app/index.tsx` — Added `AppState` listener that detects background-to-active transitions and aborts any in-flight request, resetting `isAnalyzing`. Created `abortControllerRef` passed to `analyzeImage()` for cancellation. Added `handleCancel` callback wired to LoadingSpinner. Tracks `resumedFromBackground` ref for Sentry context. Suppresses alert on user-initiated abort.

## Decisions
- **10-second slow threshold**: Chosen as a balance — normal scans complete in 3-8s, so 10s reliably indicates a problem without false positives.
- **Cancel button always visible**: Subtle initially (gray text), prominent after slow threshold (filled button). Users can always bail out but aren't distracted during normal scans.
- **Abort on resume clears spinner immediately**: Rather than letting the aborted request flow through the error handler (which would show an alert), the AppState listener directly resets `isAnalyzing` so the user sees the camera and can retry instantly.
- **Removed unused `CameraType` import**: Was already unused before these changes.

## Notes
- The underlying 60s timeout in `api.ts` is unchanged — it still serves as the ultimate backstop. The external signal is an additional cancellation path.
- `resumedFromBackground` ref is reset after a successful scan, not after every capture attempt, so the Sentry context persists across retries in a resume session.
