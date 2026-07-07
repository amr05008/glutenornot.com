---
date: 2026-07-07
summary: Built and submitted iOS v1.3.0 (Recents, rating prompt, result-band fix) to App Store review
tags: [release, ios, mobile]
---

## Summary
Cut iOS 1.3.0 following mobile/RELEASE.md: preflight (tsc + 40 jest green), 4-file version lockstep bump, Release-config simulator smoke test (passed, incl. new Recents flow), clean prebuild + MARKETING_VERSION patch + Sentry token, Xcode archive/upload and App Store Connect submission by Aaron. Submitted 2026-07-07, build 1. Tagged v1.3.0 + GitHub release.

## Changes
- `mobile/app.json`, both `package.json`s + lockfiles — 1.2.0 → 1.3.0 (commit b2c31dd, the submitted build)
- `mobile/RELEASE.md` — Last-shipped header → v1.3.0; runbook fixes: jest count 12→40, Release-config smoke variant documented (agent-friendly, no Metro), Recents added to the smoke checklist, `~/.sentryclirc` token note
- Tag `v1.3.0` + GitHub release with the What's New copy

## Decisions
- Smoke test used `npx expo run:ios --configuration Release` (self-contained bundle) instead of the dev build — a dev build without Metro can't load JS, and Release is closer to what ships. Now in the runbook.
- Sentry org token (`org:ci`) stored permanently in `~/.sentryclirc` (600) so prebuild's wipe of `ios/sentry.properties` can't lose it again; properties file still written per-release as belt-and-suspenders.

## Notes
Post-release watch (next few days):
- Sentry `glutenornot-mobile`: new error-level issues after rollout
- PostHog: `scan` events from `app_version 1.3.0` installs; `scan_failed` reasons now that failure tracking is live; whether the caution split (`had_ingredient_data`) changes the picture
- App Store privacy label was to be changed at submission ("Data Not Collected" → "Data Not Linked to You") — confirm done and check the ROADMAP item
