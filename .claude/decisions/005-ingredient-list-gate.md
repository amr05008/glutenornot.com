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

1. **The start:** an ingredients heading that starts its line, optionally after
   a two-letter language code, followed by a colon (or OCR's semicolon), or
   alone on its line above a comma-separated list. Roughly 25 languages.
2. **The end:** after that heading, a full stop that ends a sentence (not a
   decimal, not "No. 5", not "...", not inside a word), or an allergen/advisory
   statement opening a later line ("Contains:", "May contain", "Peut contenir",
   "Kan sporen van…"), but not the in-list "Contains 2% or less of".

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
- All 10 OCR eval labels written to be `safe` pass.

## Toggles (still flippable)

- **T1: the end rule.** The full stop OR allergen-line rule is the current
  setting.
  - Dropping the allergen line catches more side cuts but blocks complete lists
    that have no full stop of their own (about 23% of typed Open Food Facts
    lists).
  - Dropping the end rule entirely leaves end cuts to the prompt.
- **T2: menus are exempt.** A response with `mode: "menu"` and at least one
  dish is not gated. The prompt's partial-menu rule covers menus.
- **T3: the barcode path is exempt.** Its text is database text, not a photo,
  and 21% of those lists have no full stop.
- **T4: the barcode hint.** The `no_heading` copy suggests the barcode on
  every client but web, which has no scanner.

## Known leaks

- **A side cut.** It keeps the heading and can keep a full stop or the
  allergen line: IMG_6211 cut to "Pistachios, se" passes on the address line,
  and IMG_6212 cut on its right edge passes on "CONTAINS: WHEAT".
- **An abbreviation inside the surviving list** ("vit. B1") reads as an end.
- **A cut that removes only an advisory below a complete list.** The list is
  whole, so the gate has nothing to catch.

## Costs

- **CJK labels effectively can't reach `safe` by photo.** Their lists rarely
  end in 。 and are often laid out as tables without a colon. There were 0
  Japanese, Chinese or Korean photo scans in the 180 days to 2026-09-22.
- **Single-ingredient packs with no printed list can't pass.** The copy points
  phone users at the barcode.
- **Every OCR verdict-share read that spans 2026-09-22 must account for
  `list_gate`.** The delivered verdict now includes these downgrades. This
  applies above all to the gluten-free-claim step-9 read (~2026-09-25): group
  by `list_gate`, or count `list_gate IS NOT NULL` as Claude-`safe`.
- **The `list_gate` count mixes right calls with false blocks.** Analytics
  can't separate them, because the text is never recorded.

## Revisit

The `list_gate` read around 2026-10-06 (ROADMAP). If the gate withholds a
large share of would-be `safe` verdicts, suspect a heading format the pattern
misses. Reproduce it with tester photos, never by logging text.
