---
date: 2026-09-06
summary: iOS 1.5.0 build 2 rejected by App Review (5.1.1(iv)) — the camera pre-permission button "Enable camera" steers the user; changed to "Continue", added an "Open Settings" branch for canAskAgain=false; Aaron's agent added the Settings-return refresh; grilled, merged PR #26, built and resubmitted as build 3 the same night, tag moved
tags: [mobile, app-review, permissions, release]
---

## Summary
App Review rejected v1.5.0 (2) on 2026-09-07 under guideline 5.1.1(iv): the
in-app screen before the camera permission prompt had an "Enable camera"
button, which Apple reads as directing the user to grant. Their fix is
explicit — use "Continue" or "Next" — and their note also suggests pointing
already-denied users to Settings. Both done on `app-review-camera-button`.
Same version string; resubmit as build 3.

## Changes
- `mobile/app/index.tsx` — permission gate primary is "Continue"; when
  `permission.canAskAgain === false` the body explains the camera is off and
  the primary becomes "Open Settings" (`Linking.openSettings()`). Library
  route unchanged.
- `mobile/app/__tests__/index.test.tsx` — mock exposes `canAskAgain` and the
  request function; two new tests (neutral button requests permission;
  settings branch opens Settings and never re-requests). 150 mobile tests.
- `mobile/RELEASE.md` — rejection recorded in the 1.5.0 header, build-3 steps
  in "Pending on main", incl. moving the `v1.5.0` tag.
- `mobile/APP_STORE_SUBMISSION.md`, `GlutenOrNot - V2 Designs/handoff/HANDOFF.md`
  — the rule, so the wording never comes back via the design spec.

## Decisions
- **Added the Settings branch, not just the label.** With "Continue" as the
  only affordance, a user who had already denied would tap it and see nothing
  happen (iOS won't re-prompt). Apple's review note recommends the Settings
  link for exactly that case, so it is part of the fix rather than scope creep.
- **Version stays 1.5.0.** A rejection is a resubmission of the same version;
  only the build number moves (2 → 3). The git tag should follow the commit
  that actually ships — flagged for Aaron rather than force-moved unasked.

## Release (same session)
- Aaron's agent added the Settings-return fix (`6b7bd32`: Expo's hook caches
  permission status, so a warm return from Settings left the user on the
  gate; now re-read on foreground, never re-prompt; failed Settings launch
  reports + alerts; a new suite runs the *real* `createPermissionHook`).
  Grilled: the caching claim checks out against the hook source; SHIP.
- Merged PR #26 (`ba916ed`). `npm ci`, tsc clean, 155 tests. Prebuild, patches
  (MARKETING_VERSION 1.5.0, CURRENT_PROJECT_VERSION 3, team), Sentry token.
  Runbook lesson: prebuild's `sentry.properties` has no trailing newline, so
  `echo >>` glued the token onto the comment line — now `printf '\n…'` +
  `sentry-cli info` check. Simulator Release build launched with
  `app.config` 1.5.0.
- Aaron archived/uploaded build 3, swapped it in on the same 1.5.0 version and
  resubmitted at 22:37 ET. Resubmitting closed the rejection thread, so the
  drafted reply was never sent. **TestFlight permission round-trip skipped**
  (Aaron's call, low stakes) — recorded in the runbook header.
- Tag `v1.5.0` moved to `ba916ed`; live-check routine re-armed for 2026-09-09.

## Next
- Live-check 2026-09-09; day-14 funnel read counts from the public release.
- Any Sentry event with `context: camera_permission_refresh` /
  `camera_settings` → the unproven native Settings-return path.
