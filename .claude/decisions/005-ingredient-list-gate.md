# 005 — A photographed label needs a visible start and end of its ingredient list before `safe`

**Date**: 2026-09-22
**Status**: Proposed (PR #31; Aaron's merge word pending)
**Related**: `plans/jev-findings-handoff-2026-09-18.md` finding 5; the char floor (`applySafeVerdictFloor`, 2026-08-13)

## Context

Aaron's Jev experiments (jev-sandbox, 2026-09-18) ran this app's production
request against 600 gluten-containing Open Food Facts labels with half the
ingredient list cut off. Claude called **39 `safe`** (13 end cuts, 26 start
cuts). Every one came from a variant where the cut removed the gluten word; on
the 401 where the word survived, Claude never said `safe`. Its reply mentioned
the cut in 9% of end cuts and 28% of start cuts. So the prompt's "OCR text is
unclear/incomplete → caution" rule can't catch it: the model judges the
fragment it was given. Flour is usually listed first, so a missing start is the
worst case. The char floor (under 100 chars) never fires on these: a
half list is hundreds of characters.

## Decision

On the photo path, `applyIngredientListGate` (`api/analyze.js`, after the char
floor) turns a `safe` into `caution`/low with retake copy unless the OCR text
shows:

1. **The start:** an ingredients heading that starts its line (or follows a
   sentence on it), optionally after a language code, followed by a colon (or
   OCR's semicolon), or alone on its line above a comma-separated list.
   - A bilingual heading counts ("INGREDIENTS / INGRÉDIENTS :").
   - Roughly 35 languages.
2. **The end:** after every heading, before the next one, one of:
   - a full stop that ends a line or the read (not one inside the surviving
     list like "U.S." or "vit. C", and not the last of a "..." run);
   - an allergen statement that opens a line or follows a full stop. An
     advisory phrase counts as it is ("May contain", "Peut contenir", "Kan
     sporen van…"). A bare "contains" counts only when an allergen word
     follows it ("CONTAINS: MILK", "Contient du lait", "Enthält Milch").
   - So in-list wording never ends a list, in any language: "Contiene menos de
     2%", "CONTAINS ONE OR MORE OF THE FOLLOWING:". Nor does a statement led by
     a bracket, or one that closes a bracket it didn't open ("enthält Soja),
     Kakao").
   On a two-product frame, every list must pass.

`list_gate` (`no_heading` | `no_end`) on the OCR `scan` event records when it
fired.

## Why code, not the prompt

- The failure is the model not noticing. A prompt rule asks the same model to
  notice harder, and a prompt change needs a live-eval run to prove it.
- A code rule applies the same way every time and is unit-testable for free.

## Evidence

- With a heading added to the replayed texts, **all 13 end cuts fail the end
  check.** Open Food Facts text has no headings, so the start-cut replay is not
  selective. The real-photo check covers that instead.
- **Real photos** (`test-cases/`, Google Vision, cropped with the EXIF
  orientation applied):
  - All 8 complete label reads pass (6 iPhone photos, 2 grocery screenshots).
  - Of the top-cropped reads, 4 of 4 with any text are caught.
  - Of the bottom-cropped reads that actually cut the list, 2 of 2 are caught.
  - One of the two side crops is caught (pistachios cut to "Pistachios, se").
  - These reads are committed as `web/tests/fixtures/real-label-ocr.json` and
    asserted, so the evidence is re-checked on every change without Vision.
    The IMG_6212 side-crop leak is pinned there as an expected pass, so a
    change to it is deliberate.
- **Every OCR eval label written to be `safe` passes.** A unit test keeps it
  that way, because the live evals never run the gate.
- **Three adversarial reviews on PR #31:**
  - An in-session agent reviewed `974ac2e` and said SHIP.
  - An Opus 5.5 session in Herdr reviewed `974ac2e` and said SHIP.
  - The same Opus session re-grilled the fixes (`3743ac3..7c6af71`) and said
    DON'T SHIP. Its two red findings were a policy line contradicted by a
    barcode log, and an allergen-marker regression. Both are fixed in
    `b80b85a`.
  - Its re-check of `b80b85a` found two more reds, both fixed in the next
    commit:
    - a Data Retention sentence contradicting the disclosed logs;
    - a mid-line heading swallowing the previous list's full stop, which
      blocked one-paragraph bilingual labels.
  - It also proposed the allergen-word rule for a bare "contains", which
    replaced a word-exclusion list that kept missing other languages.
- **Cost proxy:** a list-only "photo" built from Open Food Facts text blocks 35%
  of the lists Claude called `safe` (95 of 272). This overstates the real
  cost, because that text is flattened to one line: contributors paste
  whole-panel OCR that runs into the nutrition table and ends in noise. A real
  Vision read keeps its line breaks.

## Toggles (still flippable)

- **T1: the end rule.** A line-ending full stop OR an allergen line is the
  current setting.
  - Counting any sentence-ending full stop would pass more complete lists, but
    it also let abbreviations in a cut list ("U.S.", "vit. C") and a mid-line
    full stop in nearby text ("CA 93249. Product of") through.
  - Dropping the allergen line would catch more side cuts, but it would block
    complete lists that have no full stop of their own.
  - Dropping the end rule entirely leaves end cuts to the prompt.
- **T2: menus are exempt.** A response with `mode: "menu"` and at least one
  dish is not gated. The prompt's partial-menu rule covers menus.
- **T3: the barcode path is exempt.** Its text is database text, not a photo,
  and 21% of those lists have no full stop.
- **T4: the barcode hint.** The `no_heading` copy suggests the barcode on
  every client but web, which has no scanner.

## Known leaks

- **A side cut that keeps the allergen line or a line-ending full stop.**
  IMG_6212 cut on its right edge passes on "CONTAINS: WHEAT". Wheat itself
  would be flagged. The risk is barley, rye or malt at a line's right edge.
- **A full stop that happens to end a line reads as the end.** That covers an
  abbreviation ("vit.\n"), an in-list full stop in a multi-part EU list
  ("…butter.\nCream (60%): …"), and text beside the list that ends in one
  ("…Inc.\n", a Nutrition Facts footnote).
- **A top cut that leaves a sub-heading starting its own line** still passes
  ("CHEESE SAUCE MIX\nINGREDIENTS:", or a meal kit's seasoning section after
  the tortilla section is cut). Same-line spellings are caught.
- **A model-chosen `mode: "menu"` with dishes skips the gate.** A label
  misread as a menu is unlikely, but it would get through.
- **A cut that removes only an advisory below a complete list.** The list is
  whole, so the gate has nothing to catch.

## Costs

- **CJK labels effectively can't reach `safe` by photo.** Their lists rarely
  end in 。 and are often laid out as tables without a colon. There were 0
  Japanese, Chinese or Korean photo scans in the 180 days to 2026-09-22.
- **Thai labels can't reach `safe` by photo either:** Thai script has no full
  stop.
- **Single-ingredient packs with no printed list can't pass.** The copy points
  phone users at the barcode.
- **A few complete lists with no full stop of their own are blocked:**
  - an allergen statement in brackets ("(CONTAINS: MILK)");
  - "CONTAINS THE FOLLOWING ALLERGENS: MILK";
  - a "contains" that names no allergen ("CONTAINS: 100% JUICE");
  - an allergen word the list doesn't know.
- **US supplements and OTC drugs can't pass.** "Other ingredients:" and
  "Inactive ingredients:" deliberately don't count as headings, because their
  main ingredients sit in the Facts table above them, where a top cut could
  remove them. The copy asks for the word "Ingredients", which those labels
  never print on its own.
- **Every OCR verdict-share read that spans 2026-09-22 must account for
  `list_gate`.** The delivered verdict now includes these downgrades. This
  applies above all to the gluten-free-claim step-9 read (~2026-09-25): group
  by `list_gate`, or count `list_gate IS NOT NULL` as Claude-`safe`.
- **The `list_gate` count mixes right calls with false blocks.** Analytics
  can't separate them, because the text is never recorded.

## Revisit

The `list_gate` read around 2026-10-06 (ROADMAP). Split it three ways:
- By `detected_language`: a language with many `no_heading` results points to
  a heading the pattern misses.
- By `ocr_chars`: a `no_heading` on a read of 600+ characters is more likely a
  missed heading than a cut.
- By `no_heading` versus `no_end`.

Reproduce anything suspicious with tester photos, never by logging text.
