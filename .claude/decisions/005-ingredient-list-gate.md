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
2. **The end:** after every heading and before the next one, a full stop that
   ends a line or the read. A mid-line full stop like "U.S. grown" or "vit. C"
   doesn't count, and neither does the last of a "..." run. On a two-product frame,
   every list must pass. **An allergen statement ("Contains: milk") does not
   count as the end.** See T1.

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
  - Both side crops are caught. The pistachio crop is cut to "Pistachios,
    se", and IMG_6212 cut on its right edge keeps no line-ending full stop.
  - These reads are committed as `web/tests/fixtures/real-label-ocr.json` and
    asserted, so the evidence is re-checked on every change without Vision.

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
  - Its third check (`fe2489d`) found one red: the Data Retention sentence left
    out crash reports and the rate-the-app flag. Its yellows became the
    colon-form rule, more allergen words (soja, species names, dairy) and the
    nearby-bracket check. The real-read fixture caught this round's first
    bracket attempt blocking complete photos.
  - Its fourth check (`147e573`) found one red: the colon form let wrapped
    in-list "CONTAINS:" through in all seven languages, reversing its own
    advice. Four rounds had now found leaks in the allergen-statement end
    marker. The real reads settled it: all 8
    complete reads end in a line-ending full stop, and the only real read the
    marker ever passed was a side crop. So the marker was removed (T1), which
    also removed about 60 lines of regex.
  - Its fifth check (`3abfa58`) said SHIP with no red. It also measured the
    end rule on real layouts by cutting each complete real read after every
    line of its list: 34 cuts, of which 31 are caught. That sweep is now a
    test that names the 3 that pass: two in-list full stops in IMG_6207 (OCR
    read the commas as full stops) and one from IMG_6209's reading order.
- **Cost proxy:** a list-only "photo" built from Open Food Facts text blocks 35%
  of the lists Claude called `safe` (95 of 272). This overstates the real
  cost, because that text is flattened to one line: contributors paste
  whole-panel OCR that runs into the nutrition table and ends in noise. A real
  Vision read keeps its line breaks.

## Toggles (still flippable)

- **T1: the end rule.** The current setting is a line-ending full stop only.
  An allergen statement is off.
  - Turning the allergen statement on would pass complete lists that have no
    full stop anywhere after them. Across four review rounds, though, it kept
    letting cut lists through: in-list "contains" wording in seven languages,
    quantity phrasing ("CONTAINS: UNDER 2%"), and brackets OCR drops. On real
    photos it never passed a complete read that a full stop didn't already
    pass.
  - Counting any sentence-ending full stop, not just a line-ending one, would
    let abbreviations in a cut list ("U.S.", "vit. C") and a mid-line full stop
    in nearby text through.
  - Dropping the end rule entirely leaves end cuts to the prompt.
- **T2: menus are exempt.** A response with `mode: "menu"` and at least one
  dish is not gated. The prompt's partial-menu rule covers menus.
- **T3: the barcode path is exempt.** Its text is database text, not a photo,
  and 21% of those lists have no full stop.
- **T4: the barcode hint.** Both retake messages suggest the barcode on every
  client but web, which has no scanner. The barcode path isn't gated.

## Known leaks

- **A full stop that happens to end a line reads as the end.** This covers:
  - an abbreviation ("vit.\n");
  - an in-list full stop in a multi-part EU list ("…butter.\nCream (60%): …");
  - text beside the list that ends in one ("…Inc.\n", a Nutrition Facts
    footnote).
  A side crop that keeps such a line passes the same way.
- **Vision's reading order.** It can emit the list's closing line above its
  last line: IMG_6209 puts "…Baking Soda." above "Grain Oats, …". A cut right
  after it then passes.
- **A top cut that leaves a sub-heading starting its own line** still passes.
  Examples: "CHEESE SAUCE MIX\nINGREDIENTS:", or a meal kit's seasoning section
  after the tortilla section is cut. The same-line spellings are caught.
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
- **A complete list with no line-ending full stop anywhere after it is held at
  caution.** An example is a tight crop that ends on "CONTAINS: MILK". The
  retake copy asks for the line below. That line often has no full stop
  either: only 2 of the 5 real photos have one directly below. So phone users
  also get a barcode route ("Still seeing this? Try scanning the barcode.").
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
