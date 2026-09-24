# Jev fast path: launch it where it's trusted, watch it, then widen

**Build status (2026-09-24): BUILT on branch `jev-fast-path-2026-09-24`, PR
open, not merged.** Decision 007. It merges with `JEV_MODE=off`. Keys, Vercel
env, the PostHog tripwire alert and the rollout are Aaron's.

- **Deviations from the build list:**
  - `decideFastPath` lives in `api/barcode.js` next to the tag helpers it
    calls. In `_jev.js`, the two modules would import each other.
  - The fast path's tag check also blocks `safe` on an **oats** allergen or
    trace tag. Plain oats are a caution reason here, and none of the 996
    records has one without oats in the list.
  - The label gate also defers **any gluten or celiac label in any language**
    to Claude ("senza glutine", "sin glúten", "cœliaques", a stray
    `en:Gluten`).
  - `engine_audit.claude_verdict` can be `error`: Claude failed after Jev was
    served. That isn't a tripwire hit.
  - A fast-path exception is caught and logged as `jev_outcome: error`, and
    Claude answers.
- **Replay of the recorded v2 answers through the shipped rule** (no new
  calls):
  - 996 records: 51.8% settled and 100% agreement with Opus, with 0 safe and
    0 unsafe where Opus disagreed.
  - It differs from frozen v2 on three records: the tofu, the duck mousse
    and one stray label.
  - D1: 0 false-safe, identical to the bake-off.
  - Not a fresh grade: the tag fix and T3 answer misses seen on the test
    split.
- **Left:** the single-sample and FULL live evals (need the
  `glutenornot-evals` TypeSafe key in `.env`), the grill, and then rollout
  steps 1–4 below.

**Status:** proposal (2026-09-24). Replaces the bake-off's proposed v3 re-grade
(Aaron: "ive read nothing here that gives me pause about jev + opus"). The
evidence is in `plans/barcode-bakeoff-2026-09-24.md`.

**Why no more offline experiments.**
- Over 996 real Open Food Facts records and 30 frozen cases, Jev never missed
  a listed gluten ingredient.
- Every false-safe came from the code *around* Jev, and each has a fix:
  - a list-quality gap, which v2's questions fixed, confirmed on unseen data;
  - a tag parser that misses `en:Glutine`, a deterministic bug that unit
    tests prove fixed.
- What's left to learn is how Jev does on our users' real scans, and only
  production can show that.

The staging below is how production shows it without betting a celiac user's
`safe` on it first.

## Decisions (proposed)

- **F1: Barcode path only, Open Food Facts records only.** Photos, menus and
  the other barcode sources stay on Claude.
- **F2: Claude still runs on every scan.** It starts in parallel with Jev.
  - When Jev settles, the server responds at once and Claude finishes in the
    background (`waitUntil`, the pattern `api/_analytics.js` already uses) as
    an audit.
  - When Jev doesn't settle, Claude's answer is served as today, with no
    added delay, because it was already running.
  - Anthropic spend is unchanged. Every Jev verdict gets a Claude second
    opinion on the record.
- **F3: Trust grows in stages, set by one env var `JEV_MODE`**
  (`off | shadow | unsafe | full`; the code defaults to `off`).
  - **Stage 1, `unsafe`:** serve Jev's settled `unsafe` instantly. A wrong
    unsafe can't hurt anyone. Jev's settled `safe` is only shadowed, and
    Claude answers those.
  - **Stage 2, `full`:** serve settled `safe` too, once Stage 1's shadow
    data clears the gate in F4.
  - `shadow` (nothing served) exists for a first-day smoke test.
- **F4: The gate from Stage 1 to Stage 2 is ≥50 shadowed Jev-`safe` scans
  over ≥3 weeks, with zero cases of Jev `safe` and Claude not safe.**
  - At ~270 barcode scans a month, about 18% settle safe, so that's roughly
    4 weeks.
  - Every disagreement blocks the gate until it's explained by its logged
    `caution_reason`. We can't look at the product: the privacy invariant
    means we never log it.
- **F5: Stage 2 has a tripwire.** Any audit where Jev *served* `safe` and
  Claude said caution or unsafe triggers an alert. The response is to set
  `JEV_MODE=unsafe` and redeploy (about a minute), then read the
  disagreement's `caution_reason`. The user already saw that verdict, which
  is why Stage 1 comes first.
- **F6: Server-only, same response shape.** No iOS release. `engine: "jev"`
  is added to the response, and the app ignores unknown fields (as with
  decision 006's `caution_reason`).
- **F7: Jev is called with plain `fetch`, like `callClaude`, not the SDK.**
  - The request: `POST https://api.typesafe.ai/v1/systemone` with a bearer
    key. The base URL is hardcoded.
  - The payload is copied once from the SDK's serialization and pinned by a
    test.
  - Model pinned to `jev-1.13.0`; 800 ms timeout; no retries.
  - Any error falls through to Claude, which is already running.
  - Only `ingredients_text` is sent: never the product name, barcode or
    client IP.

## Toggles (still flippable)

- **T1: Stage 1 starts in `unsafe`,** after a day of `shadow` for a smoke
  test. Alternative: start in `full`. Not recommended: that serves Jev `safe`
  before any real-traffic evidence.
- **T2: confidence on Jev-settled verdicts.** Default: `high` for unsafe
  (grain named, Jev ≥0.5, pattern match) and `medium` for safe (a thinner
  basis than Opus's reading).
- **T3: a wheat-derived glucose syrup or dextrose match falls through**
  rather than settling `unsafe`. The duck mousse case: the scanner's C27
  treats it as not-safe, and Opus says caution. Default: yes, fall through.
- **T4: the F4 gate numbers** (≥50 and ≥3 weeks).
- **T5: DECIDED by Aaron 2026-09-24. Proceed without waiting for TypeSafe's
  retention answer.** The app has no accounts, email or identity, so nothing
  ties a scan to a person, and TypeSafe receives only public-database
  ingredient text from our server. The privacy policy states exactly that.
  Asking TypeSafe for their retention period is still worth doing for the
  record, but nothing waits on it.

## What gets built (one PR, server-only)

1. **`api/_jev.js`:** the fetch client (F7) and E2 v2's questions, ported
   from `jev-sandbox/experiments/07-barcode-bakeoff/questions-v2.ts`. It also
   holds `decideFastPath(product, scores)`, which is v2's rule with two
   changes:
   - **A new multilingual gluten-tag check** replaces `isGlutenFamilyTag` in
     the fast path. It lowercases the tag, strips the language prefix, and
     matches gluten, glutine, glutén, glúten or glutenhaltig, or the grain
     pattern. Any hit blocks `safe`. This fixes the tofu `en:Glutine` miss
     and the dozen tag forms listed in the bake-off plan.
   - T3's glucose and dextrose fall-through.
2. **Templates in the app's "original (english)" style:**
   - unsafe: flagged `blé (wheat)`, explanation "This product lists blé
     (wheat), which contains gluten." (A small map covers the pattern's
     words in English.)
   - safe: "No gluten ingredients are listed, and there's no may-contain
     warning."
3. **`api/barcode.js`:**
   - The code gates run first, and a gate hit means no Jev call.
   - Jev and Claude then start together, and `JEV_MODE` decides what is
     served.
   - `waitUntil` finishes the audit, and `trackScan` gets the new fields.
4. **Analytics (`api/_analytics.js`, `api/ANALYTICS.md`), enums and numbers
   only, so the privacy invariant holds.**
   - On barcode `scan`:
     - `engine` (`claude|jev`);
     - `jev_outcome` (`settled_safe|settled_unsafe|fell_through|timeout|error|skipped`);
     - `jev_via` (the rule branch);
     - `jev_ms`;
     - the speed plan's `lookup_ms` / `claude_ms` / `total_ms`, bundled here.
   - A new `engine_audit` event, sent from `waitUntil`:
     - `mode`, `jev_verdict`, `claude_verdict`, `claude_caution_reason`;
     - `served` (which engine the user saw);
     - `agree`.
   - Decision 006's day-28 read uses `claude_verdict` from the audit, so
     it's unaffected even in Stage 2.
5. **Monitoring:**
   - a PostHog alert on `engine_audit` where `served = jev`,
     `jev_verdict = safe` and `claude_verdict != safe` (the F5 tripwire);
   - a weekly-snapshot tile: Jev share served, agreement, and p50 `total_ms`
     by engine;
   - shallow `/api/health` reports the Jev key as configured, plus the mode.
6. **Privacy (run the privacy-claims check):**
   - The policy adds TypeSafe under Third-Party Services, and the barcode flow
     says that ingredient text, only, goes to TypeSafe's Jev for a fast first
     check.
   - The analytics paragraph gains "which engine produced the verdict and
     whether the two agreed".
   - Re-date the policy and bump the service-worker cache. Check whether the
     App Store privacy label changes (likely not: no new data about the
     user).
7. **Docs:**
   - CLAUDE.md: the env vars (`TYPESAFE_API_KEY`, `JEV_MODE`) and a
     guideline line on the fast path;
   - both how-it-works SVGs (light and dark) with re-rendered PNGs, per the
     diagram rule.
8. **Tests:**
   - Unit tests: the rule table with mocked scores, including the tofu, the
     ~12 tag forms, the five list-quality texts, the rice semolina, the
     dextrose, and every gate.
   - The modes: `shadow` never serves Jev, and `unsafe` never serves Jev
     `safe`.
   - Timeout or error falls through.
   - The payload-shape test.
9. **Live eval (one FULL run, per the house rule):** the fast-path decision
   on the 30 frozen barcode cases with live Jev must have zero settled
   false-safe. It uses a separate `glutenornot-evals` TypeSafe key in the
   main checkout's `.env`.

**Not in this PR:** fixing the shared `isGlutenFamilyTag` for Claude's own
conflict note. It changes Claude's inputs, so it gets its own small PR with
its own eval run.

## Keys
- **Create `glutenornot-prod` in TypeSafe** and put it in Vercel as
  `TYPESAFE_API_KEY`, **Production scope only**. Preview deploys get no key
  and fall through to Claude.
- **Create a `glutenornot-evals` TypeSafe key** for the live eval.
- **Revoke both bake-off keys** (Anthropic in jev-sandbox, and TypeSafe)
  when the PR merges.

## Rollout
1. Merge the PR with `JEV_MODE=off`, then verify a production scan still
   carries `engine: claude`.
2. Set `JEV_MODE=shadow` for a day. Check `jev_ms` p95 from Vercel stays
   under 800 ms, and that `jev_outcome` looks like the bake-off (about half
   settle).
3. Set `JEV_MODE=unsafe` (Stage 1). Now about a third of barcode scans answer
   in about 0.2 s.
4. Once the F4 gate clears, set `JEV_MODE=full` (Stage 2). Now about half of
   barcode scans answer in about 0.2 s, with the tripwire armed.

The speed plan's fast-mode request stays open on the side; it would speed up
the half Jev doesn't settle.
