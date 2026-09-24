# 007 — Jev answers first on Open Food Facts barcodes, in stages, with Claude auditing every verdict

**Date**: 2026-09-24
**Status**: Accepted (Aaron approved the plan, 2026-09-24: "ive read nothing here that gives me pause about jev + opus"). Built on branch `jev-fast-path-2026-09-24`; ships with `JEV_MODE=off`.
**Related**: `plans/jev-fast-path-2026-09-24.md` (F1–F7, T1–T5), `plans/barcode-bakeoff-2026-09-24.md` (the evidence), `plans/barcode-speed-2026-09-24.md` (why speed), decisions 004 and 006 (the policy Jev is held to)

## Context

A barcode scan takes about 3 s on the server, and ~90% of that is Opus writing
its reply. People scan in runs (the median gap between barcode scans is 16 s),
so the wait adds up. Fast mode isn't available to the org, and Haiku 4.5 failed
the bake-off on five false-safes: it ignored the prompt's rule for a
self-contradicting record.

TypeSafe's Jev answers narrow yes/no questions about a text in ~0.2 s. The
barcode bake-off asked it eleven questions about each ingredient list and let a
code rule settle only a clear `unsafe` or a clear `safe`, sending everything
else to Opus. The questions, version 2, were frozen before the graded run. On
796 real Open Food Facts records none of its versions had seen, it settled
51.3%, agreed with Opus on 99.7% of those, and ran at a p50 of 0.20 s against
Opus's 3.03 s. Across 996 records and the 30 frozen barcode eval cases, Jev
never missed a listed gluten ingredient. Its one false-safe came from the code
around it: the app's `isGlutenFamilyTag` is case-sensitive and English-only,
and missed a tofu's `en:Glutine` trace tag.

## Decision

On the barcode path, for Open Food Facts records only:

1. **Claude still runs on every scan.** It starts first. Jev runs alongside it
   with an 800 ms budget and no retries, and only the ingredient text is sent.
   Called with plain `fetch` (`api/_jev.js`). The base URL is hardcoded and
   the model is pinned to `jev-1.13.0`.
2. **Code gates run before Jev is asked.** No Jev call when:
   - the source isn't Open Food Facts, or there's no text;
   - there's a gluten-free label tag;
   - any other gluten or celiac label tag is present, in any language;
   - the barcode path's gluten-signal note fires.
3. **The rule** (`decideFastPath`, `api/barcode.js`) is the bake-off's v2:
   - `unsafe` needs Jev (a source question ≥ 0.5) **and** the grain pattern,
     with no may-contain warning;
   - `safe` needs every danger question < 0.2, both list-quality questions
     ≥ 0.8, no grain-pattern match and no blocking tag.
   - Changes from v2:
     - **its own tag check blocks `safe`**: case-insensitive, any language,
       gluten words, grains or oats;
     - **T3**: a wheat-derived glucose syrup or dextrose falls through.
4. **Templates**, in the prompt's "original (english)" style:
   - unsafe: "This product lists blé (wheat), which contains gluten.", high
     confidence;
   - safe: "No gluten ingredients are listed, and there's no may-contain
     warning.", medium confidence.
5. **`JEV_MODE` stages the trust** (`off | shadow | unsafe | full`, and
   anything else reads as `off`):
   - `shadow`: nothing served;
   - `unsafe` (Stage 1): only a settled `unsafe` is served, because a wrong
     unsafe can't hurt anyone;
   - `full` (Stage 2): a settled `safe` is served too.
6. **Every settled verdict is audited.** Claude's answer on the same record
   goes into an `engine_audit` event, sent after the response.
   - Stage 2 needs ≥ 50 shadowed Jev-`safe` audits over ≥ 3 weeks with zero
     where Claude isn't `safe` (F4).
   - In Stage 2, a served `safe` that Claude disputes trips an alert (F5).

## Why this shape

- **Serving Jev only when it's sure, and only in stages, is what makes the
  speed safe to take.**
  - A wrong `unsafe` costs a user a product they could have eaten.
  - A wrong `safe` can make them ill.
  - So Stage 1 serves only unsafe, and a Jev `safe` is served only after real
    traffic shows it agrees with Claude.
- **Claude keeps running**, so there's no added delay when Jev falls through,
  and every Jev verdict has a second opinion on record. Anthropic spend is
  unchanged.
- **Neither signal alone settles anything.**
  - Jev with no pattern match ("Hartweizengrieß") falls through.
  - A pattern match with a low Jev score ("semoule de riz") falls through,
    and the match also blocks `safe`.
- **The new tag check lives only in the fast path.** `isGlutenFamilyTag`
  shapes what Claude sees. Changing it needs its own live-eval run, so it's a
  separate PR. It's a known production gap (plans/barcode-bakeoff "Production
  finding").
- **The oats tag goes beyond the plan's list.** Plain oats are a caution reason
  in this app, so an oats allergen or trace tag blocks `safe`. None of the 996
  bake-off records has one without oats in its list, so it costs no coverage.
- **The multilingual label gate goes beyond the plan too.** "senza glutine" or
  "sin glúten" labels pass the English-only helpers. The fast path now defers
  them to Claude.

## Evidence

- **The bake-off** (plans/barcode-bakeoff-2026-09-24.md), frozen v2 on the
  graded items 201–996:
  - 51.3% settled, 99.7% agreement with Opus, 1 safe where Opus wasn't (the
    tofu).
  - Jev alone: p50 0.14 s, p95 0.19 s, 0 errors, 0 of 795 calls over 800 ms.
- **Replaying the recorded v2 answers through this PR's rule** (no new calls):
  - All 996 records: 51.8% settled (173 safe, 342 unsafe), and **100%
    agreement with Opus** on every settled record: 0 safe and 0 unsafe where
    Opus disagreed.
  - It differs from frozen v2 on exactly three records:
    - the tofu now falls through, on the tag;
    - the duck mousse's "dextrose de blé" falls through (T3);
    - one record with a contributor's `en:Gluten` in its labels falls through
      on the label gate instead of the tag.
  - The 30 D1 cases: 0 false-safe, 10 of 60 samples settled, identical to the
    bake-off.
  - This isn't a fresh grade: the tag fix and T3 answer misses seen on the
    test items. Unit tests pin those misses, using the real records and the
    scores Jev actually returned (`web/tests/fixtures/jev-bakeoff-records.js`).
- **Live eval**: `web/tests/api/evals/jev-fast-path.live.test.js`. The pass
  mark is zero settled false-safe on the 30 cases. Results are in the PR.

## Costs and risks

- **The first real test is production.** The bake-off's records are EU-heavy
  and public, while our traffic is mostly US and a user's own products. That's
  why Stage 1 exists.
- **Thinner explanations**: a template names one grain; Claude's reply
  explains.
  - Two known imprecisions: "farina" means any flour in Italian (a specific
    grain is named first when the list has one), and T3's split can name the
    wrong grain in "glucose syrup (maize, wheat)".
  - Neither can make a verdict wrong.
- **A second engine**: every future verdict rule is written in the prompt and
  checked against this rule. A rule that changes what `safe` means must also
  pass the fast-path live eval. For example, decision 006 made natural flavors
  not a reason, and the rule agrees because it never lists them.
- **TypeSafe receives ingredient text** from public product records, from our
  server. It never gets the name, the barcode or anything about the user.
  - Their retention period is unanswered (T5: decided to proceed; their
    policy says they don't train on API input).
  - The privacy policy names them.
- **Kill switches**:
  - `JEV_MODE=off` (or any value that isn't a mode) and redeploy;
  - removing `TYPESAFE_API_KEY` does the same. Preview deploys get no key.
