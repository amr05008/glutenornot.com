---
date: 2026-02-05
summary: Fix fatal NSInvalidArgumentException crash when capturing photo before camera session is ready
tags: [mobile, bugfix, camera, sentry]
---

## Summary

Fixed a fatal crash (`NSInvalidArgumentException: No active and enabled video connection`) reported in Sentry for the TestFlight build. The crash occurred when `takePictureAsync` was called before the AVCaptureSession had fully established its video connection, most likely after resuming from background.

## Changes

- `mobile/app/index.tsx` — Added `cameraReady` state gated by `onCameraReady` callback; block capture until camera session is live; reset ready state on background resume; dim capture button while camera initializes

## Decisions

- Used `onCameraReady` callback (built into `CameraView`) rather than a timer/delay — this is the correct native signal that the AVCaptureSession is active
- Added visual feedback (dimmed button + `disabled` prop) so users understand the button isn't responsive yet, rather than silently ignoring taps

## Notes

- This is related to but distinct from the previous fix (2026-02-04-fix-background-scan-hang) which addressed API request hangs. This fix addresses a native-level crash where the camera session itself isn't ready.
- The Sentry error was on iPhone 15 Pro, iOS 26.2, release 1.0.0 (1)
