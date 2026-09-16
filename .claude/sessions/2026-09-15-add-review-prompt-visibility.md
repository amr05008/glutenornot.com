---
date: 2026-09-15
summary: Triaged "the in-app review prompt produced no review" end to end (ASC via Chrome, PostHog, native expo-store-review source, devicectl on Aaron's phone) — no bug, the ask is structurally blind; scoped + shipped PR #27 (content-free `review_prompt` event via POST /api/review, live; result-footer Google-Form link → App Store write-review link, gated at 3 scans, on main); two grills (mine + Pi/astra in a Herdr pane); iOS bumped to 1.5.1, prebuilt and patched, then parked unshipped at Aaron's call
tags: [review-prompt, analytics, ios, app-store, privacy-policy, release-parked]
---

## Summary

Aaron tapped the in-app rating sheet and saw no review appear. Triage across every layer showed the code path, native module and App Store build are all correct; what is wrong is structural — the system sheet collects a star rating only, Apple gives the app no callback and suppresses the sheet silently, and the app recorded nothing about the ask. App Store Connect: 4 ratings, 2 written reviews (Feb 2026, v1.0), while ~100 IP-hashed devices had crossed the 3-scan threshold since 1.3.0. PR #27 makes the ask measurable and replaces the dead feedback-form link with a real write-review path. The API half is live and verified; the iOS half is on `main` as 1.5.1 but deliberately unshipped.

## Changes

- `api/review.js` (new), `api/_analytics.js`, `api/ANALYTICS.md` — `review_prompt` event, stages `requested` | `store_opened`; allowlist rebuild, 512-byte cap, 10/day per-IP map; read query + caveats
- `mobile/services/review.ts`, `mobile/services/api.ts`, `mobile/constants/verdicts.ts` — `requested` beacon only after `requestReview()` resolves; `openWriteReview()` → `apps.apple.com/app/id6758594582?action=write-review`, beacons `store_opened` once iOS accepted the URL
- `mobile/components/ResultFooter.tsx` (new), `ResultCard.tsx`, `MenuResultCard.tsx`, `app/result.tsx` — shared footer; "Run into an issue? Share your feedback" (Google Form) → "Your feedback matters! Write us a review", shown at ≥ 3 lifetime scans; `handleFeedback` deleted
- `web/privacy-policy.html` (effective 2026-09-15), `web/sw.js` (cache v9)
- `mobile/RELEASE.md` — smoke step tags dev builds `-rc.smoke` (they DO emit `requested`), write-review check, own-phone once-per-install caveat, real `posthog-query` path; test count 173
- `CLAUDE.md` (api/review.js line; Active plans → parked 1.5.1), `ROADMAP.md`
- Tests: `web/tests/api/review.test.js` (new), `analytics.test.js`; mobile `review.test.ts`, `api.test.ts`, `ResultFooter.test.tsx` (new), `result.test.tsx`
- Version lockstep → 1.5.1 (`app.json`, both `package.json`, both lockfiles)

Commits: `047f3df` feature · `09f25a0` Pi-grill fixes · `fcfd97c` merge PR #27 · `b0600ea` 1.5.1 bump · `2e048b5` parked-state docs · (this wrap-up)

## Decisions

- **Replace the feedback-form link outright, keep the 3-scan gate** (Aaron): the form got zero submissions Feb–Sep; a passive App Store link is not a "custom review prompt" under 5.6.4. Feedback routing becomes its own follow-up.
- **`requested` beacons after the native call resolves, not before** — TestFlight never gets there (`isAvailableAsync()` is false there, per `StoreReviewModule.swift`), so TF installs are excluded by construction. Simulator / Xcode dev builds are *not* excluded (StoreKit always shows in development) — handled by the `-rc.smoke` version tag + `NOT LIKE '%-rc%'` in every read, now a runbook step.
- **Park the iOS release** (Aaron, after prebuild + patches were done): a version whose only user-facing change is "ask for reviews" is off-brand. 1.5.1 stays bumped on `main`; ship it with the next real change. No tag, no archive.
- Privacy sentence rewritten after the first grill: the draft claimed Apple "never shares" the rating with us — false (ASC shows every review). Never re-date the policy with a false line.

## Notes

- **Triage evidence, for the record:** Aaron's phone (paired, `xcrun devicectl device info apps --include-hidden-apps --include-internal-apps --include-default-apps`) runs `com.glutenornot.scanner` 1.5.0 build 3 with `builtByDeveloper: false` → App Store build; the sheet appeared on the App Store build 2026-09-14, so his rating was real. Its fate: check whether the ASC count moved 4 → 5 (star-only ratings never show in the reviews list; Apple may discard developer-ID ratings — unverified). The devicectl query needs the phone unlocked (`kAMDMobileImageMounterDeviceLocked` otherwise).
- Xcode 27 (installed Sep 3) had an unaccepted license → `pod install` fails inside prebuild ("Failed to install CocoaPods with Homebrew" is the misleading symptom; `pod --version` shows the real cause). `sudo xcodebuild -license accept` fixed it. The earlier simulator smoke only worked because `expo run:ios` reused the previous release's Pods.
- Pi/astra grill ran in a Herdr pane (`herdr pane split --current --direction down`, `herdr agent start astra --kind pi`, `agent prompt --wait`); it hit a provider websocket timeout mid-report and recovered on its own. Verdict SHIP; its four 🟡s were real (Markdown fence, read-wording overclaim, invocation-vs-resolution test, leaking throwing mock).
- Production verification of `/api/review`: 404 for ~30 s after merge, then 204; bad stage → 400; the probe event (`1.5.1-rc.verify`) took ~40 s to appear in PostHog even with `force_blocking`.
