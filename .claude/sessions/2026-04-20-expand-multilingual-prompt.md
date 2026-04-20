---
date: 2026-04-20
summary: Expanded Claude prompt with Dutch + Catalan vocabulary and traveler context rule for Amsterdam/Barcelona trip
tags: [prompt, multilingual, i18n, travel, menus]
---

## Summary
Ahead of trips to Amsterdam and Barcelona, audited the Claude prompt in `api/analyze.js` and found it was Spanish-biased — Dutch and Catalan had zero explicit coverage. Added parallel glossary blocks for both languages (grain terms, allergen phrases, restaurant-dish watchlists), rebalanced the language-detection framing, extended the unsafe-verdict criteria, and added a new "Traveler Context" rule that makes Claude lean caution on ambiguous non-English menu items and include a show-the-server translation phrase in each caution item's notes.

## Changes
- `api/analyze.js` — prompt-only edits:
  - Reworded multilingual framing to weight Spanish/Catalan/Dutch/French/Italian/Portuguese/German equally (was "especially Spanish")
  - Added Dutch vocabulary (*tarwe, gerst, rogge, mout, tarwegluten, tarwezetmeel*…), allergen phrases ("Bevat gluten", "Glutenvrij"), and café-dish watchlist (*bitterballen, kroketten, frikandel, stroopwafel, pannenkoeken*)
  - Added Catalan vocabulary (*blat, ordi, sègol, espelta*…), allergen phrases ("Conté gluten", "Sense gluten", "Apte per a celíacs"), and dish watchlist (*pa amb tomàquet, croquetes, canelons, fideuà*)
  - Extended the `unsafe` verdict criteria to enumerate Dutch + Catalan equivalents alongside Spanish
  - Added a "Traveler Context (non-English menus)" subsection requiring a show-the-server phrase (e.g. *"Bevat dit gluten? (Does this contain gluten?)"*) in the `notes` of every caution item
- `CLAUDE.md` — rewrote the Multilingual Analysis bullet to reflect expanded coverage
- `ROADMAP.md` — checked off Dutch/Catalan/traveler-context, added French/Italian/German as next candidates

## Decisions
- **Prompt-only, no client changes.** The existing `detected_language` field already flows through; no API contract or mobile build needed. Ships with next Vercel deploy, so coverage is live before travel without App Store review.
- **Did not surface `detected_language` in the UI.** Considered a "Detected: Dutch" badge on `MenuResultCard`, but deferred — it's scope-separable and would need a mobile rebuild. Left on roadmap as optional.
- **Chose restaurant-dish watchlists over pure vocabulary.** For menus specifically, naming the common unsafe café/tapas dishes gives Claude much better anchoring than grain terms alone, since menus rarely list ingredients.
- **Show-the-server phrase pattern.** Instead of a separate "useful phrases" UI surface, embedded the translated phrase directly in each caution item's `notes`. The user can show the phone to the server in context.

## Notes
- All 65 existing Vitest tests still pass — no fixtures needed updating since they're Spanish-based.
- Verification plan (from `/Users/aaronroy/.claude/plans/i-am-preparing-to-glittery-bee.md`): manual scans of Dutch café menu, Catalan menu, and Dutch/Catalan grocery labels once deployed.
- Next prompt expansions by priority: Portuguese → French → Italian → German.