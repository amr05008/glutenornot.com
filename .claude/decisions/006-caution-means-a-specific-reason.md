# 006 — Caution means a specific reason to worry

**Date**: 2026-09-23
**Status**: Accepted (Aaron's call, 2026-09-23 — "'I found a specific reason to worry' is what this app should deliver — not 'I can't rule everything out'.")
**Amends**: 003 (the ambiguous-ingredient list that a gluten-free claim lifted)

## Context

In the 60 days to 2026-09-23, 68% of readable photo labels and 65% of barcode
scans with ingredient data came back `caution`. Only 7 of 152 photo cautions
were high confidence. Caution had stopped carrying information.

The jev-sandbox side-by-side (experiment 05) located the source. On 460 labels
with no gluten word that the database marks safe, Claude said caution 43% of
the time. 155 of those 204 cautions cited an unnamed flavor, aroma or spice.
That was the prompt working as written: it listed natural flavors,
maltodextrin, modified starch, dextrin, spices and hydrolyzed protein as
automatic cautions.

## Decision

Every caution names exactly one reason:

- `oats`: oats with no covering gluten-free claim
- `may_contain`: a may-contain, traces, shared-equipment or shared-facility
  warning for a gluten source
- `conflict`: a claim that disagrees with the list, a package statement that
  gluten is present, or a database record that contradicts itself
- `undeclared_source`: an ingredient whose gluten source the maker isn't
  required to declare. That covers flavorings, spices or hydrolyzed protein in
  meat and poultry products; soy sauce with no wheat declaration; and yeast
  extract of unstated source
- `incomplete`: garbled, cut off, or no ingredient list
- `other`: a specific concern none of the above covers, which must be named
  in the explanation

**Not a reason on its own:** unnamed natural flavors or aroma, spices or
seasoning, maltodextrin, dextrin, modified starch, glucose syrup, caramel
color, and hydrolyzed vegetable protein of unstated source, outside a meat or
poultry product. US, EU, UK, Canadian and Australian law requires wheat to be
named wherever it's used, including inside those ingredients. EU, UK, Canadian
and Australian law also covers barley and rye.

## Toggles

T2–T8 are in `plans/verdict-calibration-2026-09-23.md`.

## Costs

- **US labels with unnamed natural flavors now return `safe`.** The residual
  risk is barley malt inside a flavoring, which US law doesn't require to be
  declared. It's usually named, and the app flags named malt as `unsafe`.
- **A gluten-free claim now matters mainly for oats and `undeclared_source`
  ingredients.** Decision 003's lift of ambiguous ingredients is now the
  default without a claim.
