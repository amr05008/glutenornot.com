---
date: 2026-11-07
summary: Built the product-name meat/poultry check that was Stage 2's last precondition (PR #47). Pi's review took 3 rounds and widened it into a per-language singular-and-plural vocabulary. Aaron's FULL fast-path eval passed, and Aaron switched Jev to Stage 2 (JEV_MODE=full) on 2026-11-08 ~20:05 UTC.
tags: [jev, fast-path, decision-007, stage-2, privacy, multilingual, grill, live-eval]
---

## Summary

`nameMarksMeat` (`api/barcode.js`) is the last check before `decideFastPath` settles a `safe`. A meat or poultry word in the Open Food Facts product name sends the scan to Claude, recorded as `jev_via = meat_name`.

- The name is read only on our server. It never goes to TypeSafe or into any event.
- Jev's settled `unsafe` path is unchanged.
- The check isn't a code gate, so Jev is still asked.

Pi's review (the herdr-core `reviewer` template, gpt-6.1-sol) found that core species names and non-English plurals were missing. Both were fixed test-first. Aaron ran the FULL fast-path eval, merged on "proceed", and set `JEV_MODE=full`.

## Changes

- `api/barcode.js`: `MEAT_NAME_WORDS` and `MEAT_NAME_STEMS`, and `nameMarksMeat` in `decideFastPath`'s safe branch.
- `web/tests/api/fast-path.test.js`: a 280-form singular-and-plural matrix per language, 157 blocking names, 56 look-alike controls, the via priority, and unsafe unchanged.
- `web/tests/api/barcode-jev.test.js`: in `full` mode, Claude serves a meat-named clean list and `meat_name` is recorded. The privacy test: the name is in neither the TypeSafe body nor any event.
- `web/tests/api/evals/jev-fast-path-cases.js`: F11 "Chicken Broth" and F12 "Hühnerbrühe".
- `api/ENGINES.md`, `api/ANALYTICS.md`, decision 007, `CLAUDE.md`: the check, the new `jev_via` value, the FULL run, and Stage 2 live.

**Commits:**
- PR #47: `3f1fbec`, `13207b8`, `743fae1`, merged as `6f64f1f`.
- Close-outs: `3afb44b` (preconditions met), `1e98b61` (Stage 2 live).

## Decisions

- **The check runs last in the safe branch,** so the `meat_name` count is exactly the fast safes it costs.
- **It covers all eight of `GLUTEN_GRAIN_PATTERN`'s languages.** An English-only check would let "Jambon" settle `safe` against Claude's `undeclared_source` and trip F5.
- **German and Dutch use guarded stems,** not whole words, because they compound the meat into the word (Hähnchenbrust, Entenfond, rookworst).
- **Broth and stock words block even for vegetable broth.** A false hit costs only speed.
- **Left out because they mostly name something else:**
  - chili, soup, pâté, goat, buffalo, lomo, ragù;
  - hen and gallina (egg boxes), quail (quail eggs);
  - vaca (La Vaca que ríe), peru (the country), wild (Wildreis);
  - Italian polli (the Polli brand).
- **Diagrams unchanged (Aaron).** The SVGs show data flow, not the fast path's internal checks. Pi accepted that on substance.

## Notes

- **Review:** Pi took 3 rounds.
  - Round 1: missing species (Entenfond, Roasted Chickens).
  - Round 2: plurals were English-only (Canards, Conejos, Conigli, Dutch "lam").
  - Round 3: SHIP.
  - Pi asked for morphology "as a matrix rather than only the literal repro names", which is what made round 3 pass.
- **Replay:** across all three rounds, the 996-record bake-off replay held 1 of 167 safes ("Bunte Pepperoni", German for peppers). Unsafe stayed at 342, with 0 Opus disputes.
- **FULL eval** (on `743fae1`): 42 of 42 passed, 0 settled false-safe. F11 and F12 fell through on `meat_name` in all 5 samples each, so live Jev clears those lists and the name check is what holds them.
- **Eval path gotcha:** the first run failed with `node: .env: not found`. A PR's eval must run from its worktree, with the main checkout's absolute `.env` path. `CLAUDE.md` says so now.
- **Open:** the dashboard has no `meat_name` tile yet.
