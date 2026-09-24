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
color, and hydrolyzed vegetable protein of unstated source, outside a product
made with meat or poultry (sausage, deli meat, and soups, broths, chili or
frozen meals made with meat — T3). US, EU, UK, Canadian and Australian law
requires wheat to be named on the label wherever it's used, including inside
those ingredients: in the list, or (US) in a "Contains:" statement right after
it. EU, UK, Canadian and Australian law also covers barley and rye. EU law
exempts wheat-based glucose syrup and maltodextrin, which are processed to
remove gluten, so unnamed ones are covered too; one labeled with its wheat
source is still judged as wheat (the exemption call is out of scope).

## Toggles

T2–T9 are in `plans/verdict-calibration-2026-09-23.md`.

**T3 is global (Aaron, 2026-09-24).** Flavorings, spices and hydrolyzed protein in any product made with meat or poultry stay `undeclared_source`, whatever country it's from. The rationale is the US USDA gap, and EU law already makes wheat be named in EU meat products. Even so, one rule is simpler, and it errs toward caution.

## Costs

- **US labels with unnamed natural flavors now return `safe`.** The residual
  risk is barley malt inside a flavoring, which US law doesn't require to be
  declared. It's usually named, and the app flags named malt as `unsafe`.
- **A gluten-free claim now matters mainly for oats and `undeclared_source`
  ingredients.** Decision 003's lift of ambiguous ingredients is now the
  default without a claim.
- **The rule relies on the "Contains:" statement being part of what was
  read** (PR #32 grill). A US label may name wheat only there (FALCPA), not
  inside "modified food starch" or "natural flavor". Two ways it can be missing:
  - A photo cropped between the end of the list and the "Contains:" line
    passes the cut-off gate, and the starch or flavor now reads `safe`.
  - A database record whose text leaves the line out and carries no allergen
    tag. When the line is captured as an Open Food Facts `en:gluten` tag, the
    barcode path now holds the record at `caution` / `conflict`. USDA,
    Nutritionix and UPCitemdb records carry no allergen data at all, so an
    unstated-source ingredient there is held at `caution` / `incomplete`
    (T9). That was 5 of about 410 barcode scans with ingredient data in the
    60 days to 2026-09-23.
  Wheat-based modified starch or flavoring is uncommon in US products, but
  this is the same kind of residual risk as barley malt (T2). The grill
  proposed a decision-005-style gate that withholds `safe` when nothing after
  the list made it into the photo. Aaron declined it (2026-09-24): *"if an
  image is missing the gluten containing ingredients we cant guess they are
  there. garbage photo in, garbage result."*
