---
date: 2026-08-28
summary: Executed plans/gf-label-claim-2026-08-28.md — a regulated gluten-free claim now lifts ambiguous-ingredient cautions to safe (PR #23, merged), gated by a 22-case live eval checked into the repo; /grill turned the negation guard from "ignore" into "unsafe" and added the near-claim / incomplete-read cases
tags: [prompt, safety, eval, analytics, grill, worktree]
---

## Summary
Ran the server-only plan end to end in an isolated worktree, TDD-style: eval
first (baseline captured against the unchanged prompt), then the prompt rule,
then `gf_claim_present`, then docs. The first prompt cut passed 16/16 twice;
the /grill subagent then found one measured regression and three untested
false-safe paths, all fixed and re-verified at 22/22 with zero false-safe.
PR #23 merged to main at `3a4e418`; Vercel deploys it to both clients. The
sibling session (`weak-signal-upload`) was told to rebase.

## Changes
- `api/analyze.js` — `CLAUDE_PROMPT`: new "Gluten-free label claims" block
  (claim phrases en/es/nl/ca/fr/it/de/pt + GFCO/CSA marks; overrides for oats,
  listed gluten source, advisories; negated phrasing → `unsafe`; near-claims,
  ingredient-level claims and front-of-pack-only reads → not a claim); HVP
  narrowed to unstated source; oats guideline reworded to stop contradicting the
  certification carve-out; safe-tone example. `detectGlutenFreeClaim` (regex,
  presence signal) + `gfClaimPresent` on the `trackScan` call;
  `analyzeWithClaude` and `detectGlutenFreeClaim` exported.
- `api/_analytics.js` — `gf_claim_present` on `scan` (OCR only, boolean).
- `web/tests/api/evals/gf-claim-cases.js` + `gf-claim.live.test.js` (new) —
  22 synthetic cases, env-gated live runner (`RUN_LIVE_EVALS=1`), safe 2× /
  adversarial 5×, rejects the parse-failure fallback, asserts safe-with-claim
  explanations name the label.
- `web/tests/api/analyze.test.js`, `analytics.test.js` — prompt-text, regex,
  handler and property tests (+47 tests; suite 281 passed / 22 skipped).
- `CLAUDE.md`, `api/ANALYTICS.md`, `ROADMAP.md` ("Verdict calibration"),
  `.claude/decisions/003-honor-gf-label-claim.md`, plan status header.
- Commits: `587a6af` (prompt + analytics + eval), `fb9d620` (docs),
  `8adad1f` (grill fixes), merge `3a4e418`.

## Decisions
- **"Not gluten-free" → `unsafe`, deviating from the plan's `caution`.** The
  baseline returned `unsafe` 3/3 at high confidence; the first wording of the
  guard ("ignore negated phrasing") demoted it to `caution` 3/3 — the /grill
  subagent caught it in the after-run data. A manufacturer's explicit negation
  is a gluten statement; putting it in the noise band contradicts the plan's
  own thesis. More conservative than the plan, flagged in the PR for Aaron.
- **Adversarial cases must be discriminating.** Every near-claim / negation /
  ingredient-level case carries an ambiguous ingredient a real claim would
  clear, so a conflation shows up as a false `safe` instead of hiding behind
  the baseline `caution`. A "gluten-reduced" *beer* would have passed for the
  wrong reason (listed barley) — rewritten as a snack mix.
- **T3 = `caution` + "label and list disagree"** (plan default) moved cases 7/8
  from the baseline's `unsafe`. Either is never-safe; kept the plan's call and
  listed it as the reviewer-flippable default in the PR.
- **5 samples per adversarial case** (was 3): six clean samples can't tell 0%
  from ~5% false-safe. ≈86 Opus calls ≈ $2 per run — fine as a gate.
- **Regex omits the bare token "CSA"** (Community Supported Agriculture on a
  farm-stand label); a CSA-certified product also prints "Certified
  Gluten-Free", which matches. Documented at the pattern.

## Eval record
Baseline (unchanged prompt, original 16 cases): **8/16** — cases 1–4, 6, 15
`caution`; 16 flaked `safe, caution`; 9 `unsafe ×3` (the plan expected caution).
After the first prompt cut: **16/16, 16/16** on two runs. Final (22 cases,
adversarial 5×): **22/22**, case 9 `unsafe ×5` high, cases 17–22 all
`caution` (19/20 not-safe), zero false-safe. Full tables in PR #23; raw vitest
output was in the session scratchpad.

## Notes
- The worktree guard refuses `source .env`; `node --env-file=<main
  checkout>/.env node_modules/vitest/vitest.mjs run …` is the working way to
  run the live eval from a worktree (documented in the runner header).
- `api/barcode.js` still carries the old unconditional HVP wording and no claim
  rule (T5, deferred) — the two paths disagree on hydrolyzed soy protein for
  the same product scanned two ways. ROADMAP line.
- **Open: plan step 9** (~2026-09-25) — the `gf_claim_present × verdict` query
  in the plan; expect the labeled caution share to fall sharply. Then close
  the plan with a CLOSED header.
- Aaron's post-merge check: re-scan the kettle corn bag → expect `safe` with
  the claim named.
