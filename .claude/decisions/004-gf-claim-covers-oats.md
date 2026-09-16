# 004 — A whole-product gluten-free claim covers oats (T2 flipped, both paths)

**Date**: 2026-09-16
**Status**: Accepted (Aaron's call, 2026-09-16 — "proceed with recommended fix")
**Amends**: 003 (toggle T2 and the barcode carve-out T5)

## Context

A GFCO-certified, front-labeled "GLUTEN FREE" fig bar came back `caution` twice
within a minute on 2026-09-16 (PostHog, Aaron's device, iOS 1.5.0):

- **Barcode, 17:50:46Z, caution/medium.** Open Food Facts had the full record:
  label `en:no-gluten`, ingredients "gluten free rolled oats", plus an
  auto-derived `en:gluten` allergen tag. The barcode prompt still carried the
  pre-003 rule ("Flag ALL oats caution unless explicitly certified" — T5 left
  the path unchanged) and `assessGlutenSignal` told Claude to "lean caution
  with low confidence" on the label-vs-tag conflict.
- **Photo, 17:51:28Z, caution/medium, 751 OCR chars, `gf_claim_present`
  true.** The frame was the back panel. The only "gluten free" text on the back
  is inside an ingredient name ("Gluten Free Five Grain Flour"), which 003
  correctly treats as ingredient-level. "Whole Grain Oats" with no
  certification mark in frame → the oats rule. The claim and the GFCO mark are
  on the front. Eval case 5 encoded this exact outcome as intended.

The structural problem 003 missed: on a small package the certification mark
lives on the front and the ingredient panel on the back, and they cannot share
a frame. Front-only → caution ("show me the ingredients"); back-only → caution
("no certification visible"). A certified-oats product could never reach
`safe` by photo, and T2 ("a certification mark clears oats") only ever fired
when a brand printed "certified gluten-free oats" inside the ingredient list.

Domain fact: FDA 21 CFR 101.91 applies the 20 ppm limit to every ingredient
of a product labeled "gluten-free", oats included — the claim is the
manufacturer's assurance that the oats meet it (the regulation does not
mandate a sourcing or testing method, so the prompt asserts none). The
certification mark adds third-party testing on top of the same standard; it
does not change the standard. The community carve-out that 003 preserved
is about avenin sensitivity (a small share of people with celiac disease react
to oats themselves), which no label resolves.

## Decision

1. **OCR path (`api/analyze.js`)**: T2 flipped. A whole-product gluten-free
   claim or a certification mark covers oats; return `safe`, name the label,
   and add one short clause that a small share of people with celiac disease
   react to oats themselves. Plain oats with no claim in frame stay `caution`.
   "Gluten-free oats" inside the list still covers the oats only (003's
   ingredient-level rule); the rest of the list is judged as usual.
2. **Barcode path (`api/barcode.js`)**: T5 reversed — the claim block is
   ported. The `Certifications:` line is the package's whole-product claim,
   transcribed into the database, and covers ambiguous ingredients and oats. Only an
   explicit allowlist of Open Food Facts claim tags (`GF_LABEL_TAGS`: the
   `en:no-gluten` / `en:suitable-for-celiacs` subtrees of the labels taxonomy)
   reaches that line; the package's own gluten-present statements
   (`en:contains-gluten` and free-text tags matching
   `ADVERSE_GLUTEN_TAG_PATTERN`: low / very low gluten, gluten-reduced, not
   gluten-free, may contain gluten) get their own "Package states:" line,
   which is never safe and beats a Certifications line on the same record;
   any other gluten-ish tag (`en:gluten-free-oats`) is dropped. A **generic**
   gluten allergen tag next to a gluten-free label **with oats in the list**
   and no gluten grain is the auto-derived-from-oats pattern and no longer
   lowers the verdict (`assessGlutenSignal` note rewritten, gated on
   `OATS_PATTERN` and on every gluten-family tag being `en:gluten`); with
   neither oats nor a grain, or with a grain-specific tag such as `en:wheat`
   that oats cannot explain, the record contradicts itself and the old
   "caution with low confidence" wording stays. A listed gluten source
   (caution, "label and list disagree"), a gluten trace tag (caution), and
   missing or sparse ingredients (caution, low) still win.
3. **Measurement**: `gf_label_present` (boolean from `hasGlutenFreeLabelTag`)
   on barcode `scan` events — the twin of `gf_claim_present`, so the barcode
   half of the rule is readable. Contract in `api/ANALYTICS.md`.
4. **Glossaries**: the Spanish / Dutch / Catalan / French "oats — treat as
   caution" parentheticals in the OCR prompt now read "caution unless the
   label claims gluten-free", so a traveler label gets one instruction, not
   two.
5. **Caution copy** for unlabeled oats now points at the fix the user can
   actually make: try the barcode, or a shot that includes the claim with the
   ingredients.

Unchanged: T1 (advisories beat the claim), T3 (listed gluten source beats the
claim), the negation guard, near-claims, the front-only rule (a claim with no
ingredient list is still an incomplete read), `applySafeVerdictFloor`, and
`gf_claim_present`.

## What this does and does not fix

- The **barcode** scan of the incident product now returns `safe` (eval B1 is
  that record's shape).
- The **back-panel photo** of the same product still returns `caution`: the
  back carries no whole-product claim, only an ingredient-level one. The only
  way to `safe` from that frame is letting Claude lean on brand knowledge,
  which is rejected (hallucination risk, reformulations). The honest path for
  a small certified package is the barcode; the caution copy now says so.

## Trade-offs accepted

- **A crowd-transcribed label tag now lifts oats to `safe` on the barcode
  path.** Open Food Facts label tags come from contributors reading the
  package. A wrong `en:no-gluten` tag on an oat product is the new exposure;
  a wrong tag on a wheat product is still caught by T3, and a wrong tag on a
  product with neither oats nor a grain still lands on caution/low (the
  /grill's controlling finding: the first cut explained the gluten tag away
  as "oats" without checking for oats). The data-reliability caveats for
  UPCitemdb-sourced ingredients are untouched (those sources carry no label
  tags, so they never produce a Certifications line).
- **Purity-protocol vs sorted oats is no longer distinguished.** Both satisfy
  the regulated claim; some celiac organizations prefer purity protocol. The
  explanation's avenin clause is the remaining signal for people who avoid
  oats entirely.

## Validation

Live eval (`RUN_LIVE_EVALS=1`, Opus 4.8 through the real prompts), 2026-09-16:

- OCR set grown 22 → 27: case 5 flipped to `safe` (labeled GF + rolled oats);
  new 23 (labeled GF fruit bar with "gluten free rolled oats" + natural
  flavors → `safe`), 24 (no claim + rolled oats → `caution`), 25
  (ingredient-level "gluten-free oats", no product claim, natural flavors →
  `caution`), 26 (Spanish "Sin gluten" + avena → `safe`), 27 (two-product
  frame, certification on the crackers, unlabeled oats on the granola →
  not-safe). Zero false-safe required; every safe-with-claim explanation
  names the label.
- New barcode set (`barcode-gf-claim-cases.js`, 10 database-shaped synthetic
  records through `buildIngredientContext` + the barcode prompt): B1 incident
  shape → `safe`; B2 label + plain oats + auto gluten tag → `safe`; B3 label +
  flavors/maltodextrin → `safe`; B4 no label + oats → `caution`; B5 label +
  wheat flour → not-safe ("label and list disagree"); B6 label + oats + wheat
  trace → `caution`; B7 label + gluten tag + no oats + ambiguous-only list →
  `caution` (the /grill case); B8 `en:contains-gluten` + oats → not-safe;
  B9 free-text `en:gluten-free-oats` tag + natural flavors → `caution`; B10
  no label + natural flavors → `caution` (barcode baseline); B11 `no-gluten`
  AND `contains-gluten` on an otherwise-safe list → not-safe; B12 wheat-specific
  tag + label + oats → `caution`; B13 free-text `very-low-gluten` on an
  otherwise-safe list → not-safe. Safe-with-oats cases (5, 6, 23, 26, B1, B2)
  additionally assert the avenin caveat in the explanation.
- **Final gate: 40/40, zero false-safe** (OCR 27 + barcode 13; tables in the
  PR body). Four seams
  were caught on the way — Pi's review of PR #29 found the allowlist dropped
  adverse free-text tags ("very low gluten") to the same context as "no
  label", and the label-wins note fired on a wheat-specific tag; both fixed
  deterministically with B11–B13 + unit tests. Earlier:
  the first cut of the barcode note explained a gluten tag away as "oats"
  without checking for oats (/grill, → B7 + the `OATS_PATTERN` gate), and
  case 25 / B9 (ingredient-level "gluten-free oats" + natural flavors) came
  back `safe` 3/5 and 5/5 on the first post-grill run until both prompts said
  an ingredient-level claim does NOT lift the verdict — after which 5/5
  `caution` on two runs.
- Result tables: in the PR body and the 2026-09-16 session log.

The two eval files are the gate for any future change to this rule.

## Rollback

Prompt constants in two Vercel functions: `git revert` the commit and push.
No client involvement.

## Revisit

Fold into 003's step-9 read (~2026-09-25): caution share among
`gf_claim_present = true` OCR scans, and barcode `caution` share among
`gf_label_present = true` scans with `had_ingredient_data = true` (the flag
exists from this deploy, so that read starts at zero history). If a labeled-GF oat product is ever reported
as a false safe, the first question is whether the label tag was wrong in the
database (fix the record) or the rule is (revert).
