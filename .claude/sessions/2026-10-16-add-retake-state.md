---
date: 2026-10-16
summary: Part B of verdict calibration shipped as decision 009 — a photo that can't be read fully is a retake, not a verdict. Wrote the implementation plan under the round-7 SHIP spec, had a builder agent execute it task by task (nine commits, failing tests first), grilled the PR with a fresh-eyes agent (SHIP, no 🔴, two 🟡 acted on), merged PR #43 on Aaron's "Proceed", and verified the API half on production, positively, with rc-tagged requests and their PostHog events. The app half waits for iOS 1.5.1.
tags: [retake, decision-009, verdict-calibration, list-gate, analytics, privacy, ios-1.5.1, grill, subagents]
---

## Summary

**The spec.** `plans/retake-state-2026-10-11.md` (on its own branch) had been grilled to SHIP over seven rounds. Aaron asked for the implementation plan. It went under the spec as thirteen ordered tasks: the API allowlist and analytics properties, `retakeReasonFor` + `retake_after` + `list_heading_word` on `/api/analyze`, `retake_after` on `/api/track`, the contract and privacy policy, the app's types and client, the retake screen, `commitResult` with its one-shot write lock, the beacons and the recovery flow, decision 009 and the docs, the PR, the production check, iOS 1.5.1, the day-14 read. Each task: failing tests, the code at named anchors, the commit.

**The build.** A builder agent executed Tasks 1–9 on `retake-state-2026-10-11`, one commit each, and recorded its deviations under the plan's Execution notes (the notable one: the cancel/background beacon passes `retake_after` only when set, because five existing tests count arguments). Root vitest 940 → 975, mobile jest 173 → 219, tsc clean. A mutation check removed five app guards one at a time; each broke a test. D4 held: no verdict code changed, the real-label fixtures pass unedited.

**The grill.** A fresh-eyes agent traced every R1–R6 concurrency path and opened every claimed test: SHIP, no 🔴, five 🟡. Acted on: the privacy policy's effective date was filled in (a placeholder would have gone live on merge with the v14 cache bump already spent), and `commitResult` takes the retake state only when that state's result is the one being committed. Noted: `handleCapture`'s `committing` guard isn't isolated by a test (the null camera ref returns first); a picker-sourced retake screen has no camera button (T7, revisit with T8); `plans/barcode-recovery-2026-09-05.md` is cited but local-only.

**Merge and verification.** PR #43 merged as `3326995` at 16:29 UTC. The production check (plan Task 11) hit the expected case on the first try: `retake_reason: no_heading` on a gated caution with nothing else on the card, so the response path is verified; the `scan` event carried `list_gate`, `retake_reason` and `list_heading_word: false`; the `retake_after` request and the `/api/track` beacon both landed with the flag. Requests were tagged `1.5.1-rc.check` so the day-14 read excludes them.

## Left

- **iOS 1.5.1** (plan Task 12): the `glutenornot-release` skill; smoke tag `1.5.1-rc.smoke`; TestFlight checks in `mobile/RELEASE.md` (top-cut label → retake screen; torch on → retake → light back; the retake's `scan` event carries `retake_after`). It also ships PR #27's write-review link.
- **The day-14 read** (plan Task 13), from the public release time; the four queries are in `api/ANALYTICS.md`.
- Decision 006's day-28 read (~2026-10-22) is unchanged by this.

## Files

- `plans/retake-state-2026-10-11.md` — spec + implementation plan + execution notes
- `.claude/decisions/009-retake-not-a-verdict.md`
- `api/analyze.js`, `api/_analytics.js`, `api/track.js`, `api/ANALYTICS.md`, `web/privacy-policy.html`, `web/sw.js` (v14)
- `mobile/app/index.tsx`, `mobile/services/api.ts`, `mobile/constants/verdicts.ts`, their tests
- `docs/how-it-works*.svg` + `.png`, `mobile/RELEASE.md`, `CLAUDE.md`, `ROADMAP.md`
