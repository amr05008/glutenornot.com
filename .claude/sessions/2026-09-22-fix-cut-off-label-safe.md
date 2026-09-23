---
date: 2026-09-22
summary: From Aaron's Jev write-up — fixed "a cut-off label comes back safe" with a code gate (PR #31, decision 005, merged 2026-09-23 after an in-session grill + six Opus 5.5 Herdr rounds), then measured that caution is 2 in 3 scans and turned Aaron's call "caution = a specific reason to worry" into plans/verdict-calibration-2026-09-23.md, now executing in its own worktree session
tags: [safety, ocr, prompt-policy, privacy-policy, evals, herdr]
---

## Summary

Aaron's write-up on testing TypeSafe's Jev found that both Jev and Claude call cut-off labels `safe` when the cut removed
the gluten word. **PR #31** fixes this for the photo path:
`applyIngredientListGate` requires an ingredients heading at the start of a
line, and then a line-ending full stop, before a label can return `safe`.

It was checked three ways:
- against the jev-sandbox truncation replay;
- against real Google Vision reads of `test-cases/` photos, complete and
  cropped, now committed as a fixture;
- by a bottom-cut sweep across those real lists.

It merged as `efe4f5e`, and production was verified.

A PostHog read then showed caution on 68% of readable photo labels and 65% of
barcode scans with ingredient data. Aaron decided caution must mean "I found a
specific reason to worry". The plan implementing that (decision 006) is being
executed by a separate Opus 5.5 session in
`.claude/worktrees/verdict-calibration-2026-09-23`.

Aaron made Jev its own workstream. The codebase fact sheet gathered for it is
appended to `plans/jev-findings-handoff-2026-09-18.md`, which is local-only.

## Changes

PR #31 (`974ac2e`..`35b530d`, merge `efe4f5e`), 20 files, +1000/−24:

- `api/analyze.js`:
  - `checkIngredientList` and `applyIngredientListGate`, run after the char
    floor. Labels only; menus that list dishes are exempt. It only ever
    downgrades.
  - Retake copy, with a barcode hint everywhere except web.
  - `list_gate` passed to analytics.
- `api/_analytics.js`, `api/ANALYTICS.md`: the `list_gate` property
  (`no_heading` | `no_end`).
- `api/barcode.js`: stopped logging recognized barcodes on Open Food Facts
  hits. Only a `barcode_not_found` line carries the number now.
- `web/privacy-policy.html` (re-dated 2026-09-22), `web/sw.js` (`v10`): see
  Decisions.
- `.claude/decisions/005-ingredient-list-gate.md`: rule, toggles T1–T4, known
  leaks, costs.
- `web/tests/fixtures/real-label-ocr.json`: 16 real Vision reads.
- `web/tests/api/analyze.test.js`:
  - about 100 new cases;
  - an eval-case regression test (every OCR eval label expected `safe` passes
    the gate);
  - the 34-cut real-layout sweep, with its 3 known leaks named.
- `CLAUDE.md`, `ROADMAP.md`, `README.md`, `plans/gf-label-claim-2026-08-28.md`,
  `reports/weekly-snapshot/README.md`: the gate, plus a note to group
  verdict-share reads spanning 2026-09-22 by `list_gate`.
- `docs/how-it-works{,-dark}.svg/.png`: step 4 now reads "too little text, or
  a cut-off list".

After merge:
- `plans/verdict-calibration-2026-09-23.md`: written, untracked; the executing
  session force-adds it.
- Wrap-up: this log, `CLAUDE.md` active plans, `docs/README.md`.

## Decisions

- **The fix is in code, not the prompt.** The failure is the model not
  noticing a cut (it mentioned the cut in 9–28% of replies). A code rule is
  deterministic, free to test, and needs no live-eval spend.
- **An allergen line doesn't end a list (T1).** Four review rounds each found
  a new way for a "Contains:" end marker to pass a cut list: in-list wording
  in seven languages, quantity phrasing, brackets OCR drops. All 8 complete
  real reads end in a line-ending full stop anyway. So the marker was removed,
  along with about 60 lines of vocabulary and bracket logic. It stays
  documented as a toggle.
- **The privacy policy was fixed in this PR** because `list_gate` had to be
  disclosed and the policy can't be re-dated while it has known-false lines:
  - the barcode flow and its databases are described;
  - "no record of what you scanned" names the log exception;
  - Vercel serves both apps;
  - Data Retention names logs and crash reports;
  - every event field is listed.
- **The real photo reads are committed as fixtures.** They're packaging text
  from Aaron's own photos, never user scans. The Opus reviewer asked for this
  so the photo evidence is re-checked on every change; a round later, it
  caught a bracket-counting fix that failed two complete real photos.
- **Caution means a specific reason to worry (decision 006, Aaron,
  2026-09-23).** Unnamed flavors, spices, maltodextrin and similar stop being
  a reason. Meat-product flavorings, soy sauce and yeast extract stay
  caution (`undeclared_source`). Part B, the neutral retake screen for
  unreadable scans, is a later plan that pairs with parked iOS 1.5.1.
- **Jev is its own workstream,** with its own plan and session (Aaron).

## Notes

- **Grill history.** An in-session agent said SHIP. The Opus 5.5 Herdr session
  said SHIP, then DON'T SHIP ×3, then SHIP. Every red was in the previous
  round's fix (two policy sentences, an allergen-marker regression, a
  bilingual-heading regression).
- **Known leaks, all in decision 005:**
  - a full stop that ends a line inside or beside a cut list
  - Vision's reading order (IMG_6209)
  - a sub-heading left on its own line by a top cut
  - a label the model calls a menu
- **Crop the `test-cases/` HEICs only after auto-orienting.** They convert
  with EXIF orientation 6 or 3. Vision rotates them itself, but
  `sharp.extract` doesn't, so apply `.rotate()` first. The first crops were
  wrong for this reason.
- **Upcoming reads:**
  - gf-claim step 9 (~09-25), grouped by `list_gate`;
  - `list_gate` (~10-06), split by `detected_language` and `ocr_chars`;
  - decision 006, 28 days after its deploy.
