# 003 — Honor the gluten-free label claim

**Date**: 2026-08-28
**Status**: Accepted (Aaron's call, 2026-08-28 — `plans/gf-label-claim-2026-08-28.md`)

## Context

A bag of kettle corn **labeled gluten-free** came back `caution` at a farm stand
(2026-08-28). Claude's explanation opened "Good news — this kettle corn is
labeled gluten-free and lists no wheat, barley, or rye" and then flagged
natural flavor, natural smoke flavor, and hydrolyzed soy protein. The verdict
and the explanation disagreed: the rubric forced the verdict.

The rubric had no rule for a gluten-free claim. "Natural flavors", maltodextrin,
modified food starch, dextrin, "spices", and hydrolyzed vegetable protein were
`caution` unconditionally, and `safe` required *no* ambiguous ingredient — so a
labeled product with any of them could never be `safe`. PostHog (project
457245), 90 days to 2026-08-28: OCR verdicts **172 caution / 56 safe / 23
unsafe — 69% caution**, and only **4** of the 172 cautions at `confidence:
high`. The model was hedging, not warning. When 7 in 10 scans say caution,
caution carries no information — alert fatigue is the real safety cost.

Domain facts: in the US "gluten-free" on a package is a regulated claim (FDA
21 CFR 101.91: under 20 ppm, manufacturer liable) covering every ingredient
including flavors and starches; FALCPA separately forces wheat in a "natural
flavor" to be declared. The EU rule (Reg. 828/2014) is the same 20 ppm. Celiac
organizations treat the label as the green light, with oats as the one
community carve-out — which the app already had.

## Decision

Add a **"Gluten-free label claims"** block to `CLAUDE_PROMPT` (`api/analyze.js`):
an explicit, affirmative gluten-free claim about *this* product — in en/es/nl/
ca/fr/it/de/pt, or a certification mark (GFCO, CSA, "Certified Gluten-Free") —
is the strongest evidence on the label. With it present, the ambiguous
ingredients do **not** lower the verdict: return `safe` and name the label as
what covers them.

The claim does **not** override (the plan's toggles T1–T3, defaults kept):

- **Oats** — still `caution`, unless the claim is a third-party certification
  mark (T2). Matches CLAUDE.md "unless certified GF".
- **A listed gluten source** (wheat, barley, rye, malt, wheat starch, any
  language) — `caution`, explanation says the label and the list disagree (T3).
- **"May contain wheat/gluten" or a shared-equipment/facility advisory** —
  `caution` (T1 — the toggle most likely to flip; legally the product is still
  GF, the community is split).
- **Negated phrasing** — "not gluten-free", "contains gluten" — is a statement
  that the product contains gluten → `unsafe`. (The first wording, "ignore
  'not gluten-free'", measurably demoted a self-declared non-GF product from
  the baseline's `unsafe` to `caution`; the /grill review caught it.)
- **Unrelated phrasing** — "gluten-free options available", a "gluten-free
  facility" line on its own, a claim on a single ingredient ("gluten-free soy
  sauce" covers the soy sauce, not the product) — is not a claim.
- **Near-claims** — "wheat-free", "gluten-friendly", "low / very low gluten",
  "gluten-reduced" — are not claims; the last two mean gluten is present.
- **A claim with no visible ingredient list** (a front-of-pack-only capture)
  is an incomplete read → `caution`, ask for the ingredient panel.

Alongside: "hydrolyzed vegetable protein" narrowed to hydrolyzed protein *of
unstated source* — "hydrolyzed soy protein" names its source and is not a
gluten risk. `applySafeVerdictFloor` is untouched: a claim only counts if it is
in the OCR text, and the 100-char floor still gates everything.

Measurement: `gf_claim_present` (boolean) on OCR `scan` events, detected by a
server-side regex (`detectGlutenFreeClaim`), not by Claude — deterministic and
testable, and a flag rather than content so the privacy invariant holds.

## Trade-offs accepted

- **A mislabeled product gets `safe`.** The regulation puts that liability on
  the manufacturer, and the app previously hedged on *every* labeled product to
  guard against it — at the cost of making caution meaningless. Listed gluten
  sources and advisories still override, so the exposure is a label that is
  wrong *and* whose ingredient list shows nothing.
- **T3 softens `unsafe` to `caution`** for a labeled product that lists malt or
  wheat starch (the baseline returned `unsafe`). Either is never-safe; caution
  with "the label and list disagree" tells the user what to check.
- **Barcode path unchanged (T5)** — its 69% caution is mostly "no ingredient
  data", a different problem. `api/barcode.js` still carries the old
  unconditional HVP wording.

## Validation

22-case synthetic eval checked into the repo (`web/tests/api/evals/`), run
live against Opus 4.8 through the real prompt + `callClaude` +
`parseClaudeResponse` path, env-gated (`RUN_LIVE_EVALS=1`) so `npm test` stays
offline. Safe cases 2×, adversarial cases 5×, **zero false-safe required**;
the runner rejects the parse-failure fallback as evidence and asserts that
every safe-with-claim explanation names the label. Adversarial cases each
carry an ambiguous ingredient, so a mistaken claim shows up as a false safe
instead of hiding behind the baseline caution.

- **Before** (unchanged prompt, original 16 cases): 8/16 — every labeled-GF
  case came back `caution` (1–4, 6, 15), the HVP-narrowing case flaked (16),
  and the negation case returned `unsafe` 3/3 (9).
- **After**: 16/16 on two consecutive full runs of the original set; then the
  /grill-driven additions (negation → `unsafe`, near-claims, ingredient-level
  claim, front-of-pack-only capture) re-run at 22 cases — see the PR and the
  session log for the final table. Baseline cases 11–12 unchanged.

The eval is the gate for any future change to this rule or its overrides.

## Rollback

The rule is a prompt constant in a Vercel function: `git revert` the prompt
commit and push; Vercel redeploys in about a minute. No client involvement.

## Revisit

Plan step 9, 2–4 weeks after ship (~2026-09-25): caution share among
`gf_claim_present = true` OCR scans should fall sharply and `false` stay
roughly flat. If labeled cautions stay high, read a sample of explanation
*reasons* (never content) and revisit T1/T3.
