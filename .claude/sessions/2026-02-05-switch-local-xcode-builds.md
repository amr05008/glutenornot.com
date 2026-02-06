---
date: 2026-02-05
summary: Switched from EAS cloud builds to local Xcode builds, bumped version to 1.0.2
tags: [build, xcode, version-bump]
---

## Summary

Replaced EAS cloud build workflow with local Xcode builds for faster iteration. Bumped app version to 1.0.2 and successfully archived + uploaded build to App Store Connect.

## Changes

- `mobile/app.json` — Version 1.0.1 → 1.0.2
- `CLAUDE.md` — Replaced "TestFlight Build" section (EAS commands) with local Xcode build flow
- `mobile/APP_STORE_SUBMISSION.md` — Replaced Section 6 "Build Commands" with local Xcode flow
- `mobile/ios/` (gitignored) — Regenerated via `expo prebuild --platform ios --clean`
- `mobile/ios/.xcode.env.local` — Added `SENTRY_DISABLE_AUTO_UPLOAD=true` for local builds
- `mobile/ios/GlutenOrNot.xcodeproj/project.pbxproj` — Fixed `MARKETING_VERSION` from 1.0 to 1.0.2

## Decisions

- **Local builds over EAS**: EAS free tier too slow for iteration. Local Xcode builds are near-instant.
- **Sentry auto-upload disabled**: No auth token available locally (was EAS secret). Sentry SDK still runs in production; only source map upload is skipped. Not worth setting up for a free app at this scale.

## Notes

- Expo prebuild quirk: sets `CFBundleShortVersionString` correctly in Info.plist but only major.minor in `MARKETING_VERSION` in project.pbxproj. Must patch pbxproj after every prebuild.
- Build uploaded as 1.0.2 (1) — build number reset to 1 since it's a new version.
- Node path in `.xcode.env.local` was still valid (v21.2.0).
