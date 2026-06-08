---
date: 2026-06-07
summary: Stop barcode scans returning false Unsafe on uncorroborated Open Food Facts gluten allergen tags
tags: [api, barcode, claude-prompt, data-quality, celiac]
---

## Summary
A barcode scan of KIND Healthy Grains Peanut Butter (602652171826) returned
**Unsafe** while the ingredient-photo scan of the same product correctly returned
**Caution**. Root cause was data quality, not a real conflict: Open Food Facts tags
`en:gluten` as an allergen (auto-derived from oats) *and* `en:no-gluten` as a label,
with no wheat/barley/rye in the ingredients. The barcode prompt trusted the allergen
tag as a manufacturer declaration. Fixed by teaching the pipeline that OFF allergen
tags are unreliable crowd metadata that may only corroborate a verdict, never be the
sole basis for Unsafe. Confirmed live: barcode now returns Caution (low confidence),
flagging oats + "Conflicting gluten information in database".

## Changes
- `api/barcode.js`:
  - Added `assessGlutenSignal(product)` — detects a `gluten` allergen tag that is
    uncorroborated by the ingredient list (no gluten grain present; oats excluded) or
    contradicted by a gluten-free label, and returns a `DATA RELIABILITY:` caveat.
    Returns null when the tag is genuine (wheat/etc. in ingredients) or unverifiable
    (no ingredient list). Wired into `buildIngredientContext`, exported for tests.
  - Upgraded `CLAUDE_PROMPT` with a "Data Source Reliability (READ FIRST)" section:
    ingredient list is the source of truth; allergen tags only corroborate/escalate;
    a gluten tag with no matching grain → judge by ingredients (oats → caution);
    self-contradictory data → caution + low confidence; don't claim a product is
    "labeled as containing gluten" without an actual gluten grain.
- `web/tests/api/barcode.test.js`: 7 new tests covering `assessGlutenSignal` and the
  context caveat, with the exact KIND barcode scenario as a locked regression.

## Decisions
- **Fix at the data layer, not just the prompt.** Put the reconciliation in a pure,
  unit-tested helper so the regression is deterministic; the prompt change supports it
  but isn't independently testable against the live model.
- **Reframed "which scan wins" as a non-issue.** The app has no cross-scan
  reconciliation — each scan is independent. The bad OFF metadata *created* the false
  conflict; removing it makes both paths agree. A true "scan both, reconcile" flow
  would be separate, larger work (not done).
- Oats deliberately excluded from the gluten-grain corroboration check — oats are a
  caution (cross-contamination) concern, and are the usual reason a false `en:gluten`
  tag appears in the first place.

## Notes
- **No new app build required** — barcode analysis is fully server-side
  (`api/barcode.js`); iOS/web call the production endpoint. Fix shipped to prod via
  Vercel on push to `main` (commit 55e2af9); confirmed live by rescanning.
- Same class of bug could affect any OFF product whose `en:gluten` tag is auto-derived
  from oats with no real gluten grain — now handled generically by the helper.
