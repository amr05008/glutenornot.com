---
date: 2026-02-05
summary: Fix camera button permanently disabled in TestFlight 1.0.1
tags: [bugfix, camera, mobile, production]
---

## Summary

Fixed the "Take Photo" button being permanently disabled in the TestFlight 1.0.1 build. The `cameraReady` state guard introduced in commit 07b687a to prevent a crash was never being satisfied because `onCameraReady` doesn't reliably fire in production builds and never re-fires after background resume.

## Changes

- `mobile/app/index.tsx` — 5 targeted fixes:
  1. Removed `setCameraReady(false)` from background resume handler (caused permanent deadlock since `onCameraReady` never re-fires after resume)
  2. Added 2-second fallback timeout that force-enables `cameraReady` if `onCameraReady` never fires (production build race condition)
  3. Removed `disabled={!cameraReady}` prop from button (visual dimming retained as UX cue)
  4. Removed `!cameraReady` guard from `handleCapture` — existing try/catch handles `CameraOutputNotReadyException` gracefully with an alert
  5. Moved viewfinder overlay outside `<CameraView>` to avoid expo-camera children warning and potential event dispatch interference; used `StyleSheet.absoluteFillObject` + `pointerEvents="box-none"`

## Decisions

- **Button always tappable**: Better UX to let the user tap and show an error than to have a permanently dead button. The try/catch already handles the camera-not-ready case.
- **2-second fallback**: Conservative timeout well past AVCaptureSession's ~0.5-1s init time. If `onCameraReady` fires normally, the timeout is a no-op.
- **Overlay outside CameraView**: expo-camera docs warn against children; moving it out eliminates the warning and any native event interference.

## Notes

- This is a follow-up to 07b687a which fixed the crash but introduced the disabled button regression
- Needs a new TestFlight build to verify in production (dev builds may work fine since the JS bridge warms faster)
