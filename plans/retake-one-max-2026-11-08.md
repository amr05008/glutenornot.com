# One retake per scan

**Status:** BUILT 2026-11-08 and up for review. It amends decision 009 (`.claude/decisions/009-retake-not-a-verdict.md`, "Amended 2026-11-08").
- **Server-only.** It goes live when Vercel deploys the merge, with no iOS build and no eval spend.
- **Why:** this is option B from the retake day-14 read (`plans/retake-state-2026-10-11.md`, "Day-14 read"), which Aaron chose on 2026-11-08.

## Decisions

- **D1. One retake per scan.**
  - A photo that carries a valid `retake_after` never gets `retake_reason` on its response. It gets the amber card.
  - The verdict, explanation, confidence and `caution_reason` are exactly what a first photo would get. A test checks that the two response bodies are equal apart from `retake_reason`.
- **D2. The server decides, as in decision 009 D2.** The app already shows the normal card whenever `retake_reason` is missing, so it needs no app change. Clients that never send `retake_after` (web, iOS 1.5.0 and older) see no change.
- **D3. No verdict change, as in decision 009 D4.** The char floor, the list gate, the prompt and `retakeReasonFor` are untouched. The handler only decides whether to *deliver* the reason. No live eval is needed.
- **D4. The held-back reason is recorded as `retake_withheld`.** It's the same four-value enum, never content. `retake_reason` keeps meaning "the response asked for a retake", so query 1 of the day-14 read still counts screens delivered.

## Toggles (still flippable)

- **T1. What gets capped.** Default: every reason.
  - Alternative: cap only a repeat of the *same* reason, such as `no_end` → `no_end`.
  - Rejected because 4 of the 6 repeats in the day-14 read switched reasons (`no_heading` ↔ `too_little_text`, `no_end` → `unclear`). A same-reason cap would have stopped only 2 of the 6.
- **T2. What "one scan" means.** Default: decision 009's T4 flag. That's the next photo within 5 minutes after a retake screen; any barcode lookup, "See what I could read" or opening Recents clears it.
  - A photo taken after the amber card, or after the flag expires, is a fresh attempt and can be asked for a retake again.
  - Rejected alternative: a server-side window per device. It would need server state keyed on an IP hash, and the policy promises nothing like that.
- **T3. How it's measured.** Default: a new `retake_withheld` property.
  - Rejected alternative: keep writing `retake_reason` on the event even when it isn't delivered. That breaks query 1, "retake responses delivered".

## The evidence (2026-11-08 early run, from the retake plan)

- **How many retakes:** 22 retake responses went to public 1.5.1 (37% of its 60 photo scans). `unclear` was 12 of them.
- **How retakes ended:** of 7 retake photos, 6 came back with another `retake_reason` and 1 reached a `safe` verdict.
  - The repeats were `no_end` → `no_end` ×2, `no_end` → `unclear`, `no_heading` → `too_little_text`, `too_little_text` → `no_heading` and `unclear` → `unclear`.
- **The worst loop:** one device got `no_end` three times in two minutes. The gate needs a full stop ending a line after the heading, so a package whose list doesn't end in one can never pass.

## Design

- **`api/analyze.js` handler, step 5:**
  - `wouldRetake = retakeReasonFor(analysis, …)`;
  - `retakeReason = retakeAfter ? null : wouldRetake`;
  - `retakeWithheld = retakeAfter ? wouldRetake : null`.
  - `retakeAfter` has already been through `normalizeRetakeAfter`, so a junk value is not a retake and still gets the screen.
- **`api/_analytics.js`:** `buildScanProperties` writes `retake_withheld` when it's non-null, and `trackScan`'s JSDoc names it.
- **`api/ANALYTICS.md`:** the new property, plus a note on the day-14 read's loop alarm. From this deploy on, "came back again" is `retake_withheld`, so group 2a by `coalesce(retake_reason, retake_withheld)` across the change.
- **Unchanged, and checked:**
  - **The app:** `mobile/app/index.tsx` branches only on `isRetakeReason(result.retake_reason)`. Otherwise it goes to `navigateToResult`, which counts and saves as usual.
  - **The privacy policy:** it already lists "whether the analysis recommended retaking the photo and why, and whether a scan was a retake after such a recommendation", and `retake_withheld` is that same fact. No policy change, so no `CACHE_NAME` bump. Reviewer: please confirm.
  - **The diagrams:** "iOS: asks for a retake instead" is still true.
  - **`ENGINES.md`:** this isn't an engine change.

## Testing

Written first, and failed before the change (9 failures, for the expected reasons):
- **`web/tests/api/analyze.test.js`, `one retake per scan`:**
  - each of the four reasons is withheld on a `retake_after` photo and recorded as `retakeWithheld`;
  - the second photo's body equals the first photo's body apart from `retake_reason`;
  - a first photo withholds nothing;
  - a retake photo that reaches a verdict withholds nothing;
  - a junk `retake_after` still gets the screen.
- **`web/tests/api/analytics.test.js`:** `retake_withheld` is written when given and left out when null or absent.

`npm test`: 985 passed, with 127 live evals skipped by design.

## Rollout

1. PR, then review by another agent, then Aaron's "proceed", then merge. Vercel deploys on merge.
2. **Production check, right after the deploy.** This makes 2 Vision + 2 Claude calls and isn't a live eval.
   - Send decision 009's Task 11 image (the 146-character list with no heading) twice, with `X-Client: ios` and `X-Client-Version: 1.5.1-rc.check`:
     - plain, which should come back with `retake_reason: no_heading`;
     - with `retake_after: "no_heading"`, which should come back with no `retake_reason`, the same verdict and explanation, and `retake_withheld: no_heading` on its `scan` event.
   - Query PostHog with `refresh: force_blocking`. The `-rc` tag keeps both scans out of every read.

## The follow-up read

**When:** day 14 after the deploy, or day 28 if there are fewer than 10 `retake_after` scans. Use public iOS 1.5.1 or later and the usual filters (no `-rc`, no Cupertino).

**The queries:**
- **Retake scans** (`retake_after IS NOT NULL`): how many have `retake_withheld` against how many reached a verdict without one.
- **Query 1** again: retake responses delivered, by reason.

**What to do:**
- **If `unclear` is still most of query 1:** consider decision 009's T1 flip next (send `unclear` to the amber card). It's server-only, as its own PR.
- **If `retake_withheld = no_end` is common:** it's evidence for the gate investigation, decision 005's "a full stop that happens to end a line" leak in reverse: a complete list with no full stop.

## Out of scope

- The gate itself, and the "Free from" allergen-warnings item on ROADMAP.
- App changes, including making "See what I could read" the main button.
