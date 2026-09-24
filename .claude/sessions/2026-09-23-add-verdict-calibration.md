---
date: 2026-09-23
summary: Executed plans/verdict-calibration-2026-09-23.md inline in its own worktree. Decision 006 makes every caution name one caution_reason, and natural flavors, maltodextrin, spices etc. are no longer a reason. Both prompts, both paths. Four fresh Opus 5.5 Herdr grill rounds (DON'T SHIP → SHIP ×3) and three false safes caught before the one FULL run (87/87, 0 of 280 adversarial samples safe). PR #32 merged 2026-09-24 and deployed; no iOS build needed
tags: [prompt-policy, evals, analytics, privacy-policy, herdr, safety]
---

## Summary

**Aaron's call:** a caution should mean "I found a specific reason to worry". It was 68% of readable photo labels and 65% of barcode scans with ingredient data.

**PR #32 does that on both paths:**
- Every label caution names one `caution_reason`: `oats`, `may_contain`, `conflict`, `undeclared_source`, `incomplete` or `other`.
- Ingredients that labeling law already makes the maker name are no longer a reason on their own.
- The parsers keep the field inside the enum, the code-side cautions set `incomplete`, and `scan` events record it.

**It merged as `75713bb` on 2026-09-24 and deployed at 14:35 UTC.** The deploy was checked on `www.glutenornot.com` using a field only the new code sets. It's server-only, so no iOS release.

## Changes

- `.claude/decisions/006-caution-means-a-specific-reason.md`: the rule, the reason list, and its costs. Those include the cropped "Contains:" line and records with no allergen data (T9).
- `api/_utils.js`: `CAUTION_REASONS` and `normalizeCautionReason`.
- `api/analyze.js` and `api/barcode.js`:
  - both prompts carry the reason list, the not-a-reason block and the per-item `undeclared_source` lines;
  - the parsers normalize the field, and the floor, gate and no-data branch set `incomplete`;
  - `assessGlutenSignal` gains never-safe `conflict` notes;
  - the no-allergen-data (T9) note.
- `api/_analytics.js`, `api/ANALYTICS.md`, `web/privacy-policy.html`, `web/sw.js` (v11), `web/index.html` (the verdict legend): the `caution_reason` event field and its disclosure.
- `web/tests/api/evals/`:
  - `calibration-cases.js` holds 44 cases.
  - `calibration.live.test.js` runs them.
  - The claim-rule cases were re-derived so each still tests its rule, with reasons asserted in all three runners.
- `web/tests/api/{utils,analyze,barcode,analytics}.test.js` and `web/tests/fixtures/claude-responses.json`: 541 → 635 tests.
- `CLAUDE.md`, `README.md`, `ROADMAP.md`, `docs/how-it-works*.{svg,png}` (both diagrams, both themes) and `plans/verdict-calibration-2026-09-23.md` (the baseline, execution notes, and the SHIPPED header).
- Wrap-up:
  - `.claude/decisions/005` is marked Accepted.
  - The step-9 and day-28 read windows are in CLAUDE.md and ROADMAP.

**Commits:** `68f7302`, `b5b9567`, `b694f07`, `d46ef95`, `b0b2b5d`, `20b1693`, `cd083c6`, `ae7c100`, then grill rounds `6a53ba9`, `03beb65`, `cb5a130`, `92599b0`, `2c6bb47`, `789f4a2`, `ec38125` and plan `4f33065`. Merged as `75713bb`.

## Decisions

- **The one FULL run happened after the grill settled, not before the PR.** Every round changed a prompt, and a FULL run before any of those changes would have forced a second one.
- **#25 and B9 put a plain oat ingredient beside an ingredient-level "gluten-free oats" claim.** The plan's "may contain wheat" would pass even if the claim were wrongly lifted.
- **The photo crop above the "Contains:" line isn't gated.** Aaron: *"garbage photo in, garbage result."*
- **T9 holds USDA, Nutritionix and UPCitemdb records at `incomplete`.** These sources carry no allergen data, and they were 5 of about 410 barcode scans.

## Notes

- **None of the three false safes came from decision 006's rule.** B9 was a latent ambiguity ("the oats") that a rewritten case exposed. C16 (yeast extract buried in a longer line) and B7 (the soft "lean caution" wording) appeared after prompt edits.
  - Relaxing a rule exposed gaps the old cautions had been masking, and each wording fix flipped another case (C25, B3).
  - A single-sample run after every prompt edit is what caught them.
- **Live commands in a worktree need the main checkout's vitest:** point `node` at `<main checkout>/node_modules/vitest/vitest.mjs`, since a worktree has none of its own. The API answers only on `www.glutenornot.com`; the apex 307-redirects a POST.
- **Open question for Aaron:** should T3 apply outside the US? EU law already makes wheat be named in EU meat products.
- **An optional celiac dietitian read of T2–T5** is still recommended.
- **Left after this session:**
  - the step-9 read (~09-25)
  - the day-28 read (~10-22)
  - Part B's plan
  - removing this worktree
