---
date: 2026-02-05
summary: Fix Cancel button incorrectly showing "Request timed out" error
tags: [bugfix, error-handling, cancel, sentry]
---

## Summary

Fixed a bug where tapping "Cancel" during a scan showed "Request timed out. Please check your connection and try again." instead of silently returning to the camera. The root cause was a type mismatch: `api.ts` wrapped user-initiated `AbortError` into an `APIError` with `name === 'APIError'`, so the `AbortError` check in `index.tsx` never matched.

## Changes

- `mobile/services/api.ts` — In the `AbortError` catch block, check if `externalSignal?.aborted` to distinguish user cancellation from timeout. If user cancelled, rethrow the raw `AbortError` instead of wrapping it as a timeout `APIError`.
- `mobile/app/index.tsx` — Moved the `AbortError` check before `reportError()` so user cancellations are neither reported to Sentry nor shown as an alert.

## Decisions

- Used `externalSignal?.aborted` as the discriminator between user cancel and internal timeout, since both produce the same `AbortError` from `fetch`. The external signal is only aborted when the user taps Cancel or the app resumes from background.

## Notes

- The bug also caused user cancellations to be reported to Sentry as `level: 'warning'` with `type: 'timeout'` — now they're completely skipped.
