---
date: 2026-09-06
summary: iOS 1.5.0 build 2 rejected by App Review (5.1.1(iv)) — the camera pre-permission button "Enable camera" steers the user; changed to "Continue", added an "Open Settings" branch for canAskAgain=false, tests, docs; branch pushed for review ahead of a build-3 resubmission
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

## Next
- Aaron's agent reviews the PR → "proceed" → merge → runbook steps 1/4/4a/5
  with Build = 3 → reply to the rejection in App Store Connect and resubmit.
- Day-14 funnel read still counts from the *public* release date, which just
  moved later.
