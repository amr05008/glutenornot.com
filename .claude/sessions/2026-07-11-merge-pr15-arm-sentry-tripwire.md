---
date: 2026-07-11
summary: Grilled + merged PR #15 (connectivity handling); armed Sentry regression-email tripwire to watch connectivity failures until the next build ships
tags: [ios, connectivity, sentry, alerting, release]
---

## Summary
Adversarially reviewed PR #15 (pre-flight `expo-network` check + connectivity copy, authored by cos-m1) — verdict SHIP after re-running the suite locally (45 pass, tsc clean, `expo-network@8.0.8` matches SDK 54). Merged it (486565d) with a corrected PR body. Aaron deferred the iOS release (fix not worth a build alone; batch into next). Set up interim monitoring: connectivity failures from the shipped 1.3.0 build are visible in Sentry via the `error_type:timeout|network` tag, and resolving the two APIError issues arms the existing "Notify Aaron Roy" alert rule to email on the next event (regression).

## Changes
- `486565d` — merge of PR #15 (`mobile/services/api.ts` pre-flight check + copy, new `api.test.ts`, deleted stray `api 2.ts`, ROADMAP, expo-network dep)
- PR #15 body corrected via `gh api PATCH`: an OTA cannot ship the native module; added the do-not-`eas update`-at-1.3.0 warning
- `mobile/RELEASE.md` — "Pending on main" block (native dep + eas-update hazard), test count 40→45, offline smoke-test note (this wrap-up)
- Sentry (dashboard, by Aaron): GLUTENORNOT-MOBILE-7 and -2 resolved → unresolved queue now empty, so any future event triggers the first-seen/regression email rule (3602196)

## Decisions
- **Hold the release**: PR #15 rides the next build, whenever there's more to ship. Version stays 1.3.0 until then.
- **Monitor via Sentry resolve-to-arm, not a new alert rule**: baseline is only 3 connectivity events in 90d; the existing first-seen/reappeared/regression rule suffices once the issue backlog is resolved. Re-resolve after each regression email to re-arm. (Alert-rule creation isn't possible via MCP — read-only — and the CI-scoped org token 403s on the project API.)
- **Grill findings accepted as non-blocking**: `NETWORK_MESSAGE`/`OFFLINE_MESSAGE` in `api.ts` are never user-rendered ('network' errors route to the hardcoded Offline StateScreen) — Sentry-facing only; fine as-is.

## Notes
- Why the 2026-07-11 incident was silent: the timeout was the 2nd event in already-open MOBILE-7; the alert rule only fires on first-seen/reappeared/regression.
- Long-term visibility fix is the deferred client-side PostHog `scan_failed` (reason timeout/network) — on the ROADMAP, should ride the next build.
