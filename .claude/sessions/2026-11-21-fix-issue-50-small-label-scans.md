---
date: 2026-11-21
summary: Closed issue #50 (a small hot sauce label blurred in the camera and came back "incomplete" on every photo). The list-end note (PR #53) went live on the server, replacing PR #51's copyright pattern after two reviews broke it. The close-focus camera zoom (PR #52) shipped as iOS 1.5.2, submitted 2026-11-23 ~01:55 UTC.
tags: [issue-50, list-gate, decision-005, decision-009, retake, camera, zoom, ios-release, grill]
---

## Summary

Issue #50 had two halves, each with an open PR from the agents fork.

**The "incomplete" caution (PR #51 → PR #53).** The label's list ends "Xanthan Gum. ©2024" mid-line, so the gate's end check could never pass and the retake looped.
- Vision's reads of the issue's two photos: the close one keeps "Gum. ©2024"; the far one reads "Xanthan Gum 2024", with no full stop and no ©.
- Pi (gpt-6.1-sol, diff only) said DON'T SHIP on #51: "Store in a cool, dry place. ©2024" beside a cut list passed. #51 also missed the far read. Closed unmerged.
- 30 days of label photos (220 scans): 61 delivered `safe`; the gate withheld 37 as `no_end` and 22 as `no_heading`.
- Aaron's steer: good, not perfect; inform the person rather than chase proof. PR #53 keeps the end rule and the caution, changes the copy to say what was read and what to check, and makes `no_end` never a retake.
- Pi's round 1 found the new copy could say "no gluten" beside a wheat row, and that a D4 query would count every `no_end`. Both fixed; round 2 SHIP. Merged as `0526db2`, live 2026-11-22 ~01:45 UTC, checked in production with both photos.

**The blurred preview (PR #52 → iOS 1.5.2).** A fixed zoom of 0.1 so a small label fills the reticle from a focusable distance.
- Pi's round 1 found the zoom gate was not native readiness: the 2 s fallback could apply it early and a late ready left the prop unchanged. Fixed with its own applied state, like the torch; round 2 SHIP.
- TestFlight smoke `1.5.2-rc.smoke` build 1 passed on Aaron's phone. Merged as `8654f94`; version bump PR #54 merged as `86e63c7`; build 2 submitted; tagged `v1.5.2`.

## Changes

- `api/analyze.js`: new `no_end` copy (and a neutral variant when the response carries rows); `retakeReasonFor` returns null for `no_end`.
- `web/tests/fixtures/real-label-ocr.json`: `issue-50-close` and `issue-50-far`.
- `mobile/app/index.tsx`: `CLOSE_FOCUS_ZOOM` and the zoom effect; three jest tests.
- Decisions 005 and 009 (amended 2026-11-21), `api/ANALYTICS.md`, `CLAUDE.md`, `README.md`, `mobile/RELEASE.md`.

## Decisions

- A second end pattern is rejected: text can't show which full stop belongs to the list (decision 005 amendment).
- `safe` with a note was not done: the end of a list is where "Contains: wheat" sits.

## Open

- 1.5.2's public release time, then the post-release watch in `mobile/RELEASE.md`.
- Reads of `retake_reason` / `retake_withheld` must split at 2026-11-22 ~01:45 UTC.
- Aaron deleted the M3's simulator runtimes mid-session to free almost 30 GB, so the release archive's iOS 27 launch check did not run (the smoke build's did, the day before). Re-download the newest iOS runtime before the next release's launch check.
