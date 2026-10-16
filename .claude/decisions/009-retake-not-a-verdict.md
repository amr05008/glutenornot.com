# 009 — A photo we can't read fully is a retake, not a verdict

**Date**: 2026-10-11 (spec), implemented 2026-10-16
**Status**: Accepted (Aaron, 2026-10-11, approach B). Spec grilled to SHIP in round 7. PR #43.
**Related**: decision 005 (the cut-off-list gate), decision 006 (`caution_reason`); `plans/retake-state-2026-10-11.md` (the spec and implementation plan); `plans/barcode-recovery-2026-09-05.md` (the model for a screen that isn't a verdict); Part B of `plans/verdict-calibration-2026-09-23.md`

## Context

The list-gate read (2026-10-11, decision 005's revisit), on photo scans since
2026-09-23 from real clients (no `-rc` builds, no Cupertino):

- **How often the gate fires:** it withheld `safe` on **15 of 80** label scans,
  8 for `no_heading` and 7 for `no_end`. That's **15 of the 33** times Claude
  said `safe` (45%). 13 had no detected language (English) and 2 were French
  (both `no_end`); no language stands out.
- **Likely false blocks:** **5 of the 8 `no_heading` reads had 845–1,078
  characters**, which decision 005 flags as "more likely a missed heading than
  a cut". Claude had called each of them `safe`. One cause that fits the code:
  the heading has to start its line or follow a sentence, and Vision often
  merges the Nutrition Facts column onto the same line ("…Iron 10%
  INGREDIENTS: …"). Analytics can't confirm it, because text is never
  recorded.
- **What users did next:** 2 retook the photo and got `safe` within 15 seconds
  (763 → 552 chars; French 1,275 → 1,356); 2 retried and got `incomplete`
  again; at least 2 stopped scanning. One user on 2026-09-29 made 6 photo
  attempts in 60 seconds, all 6 `incomplete` (12–316 chars, two of them from
  the gate), with 4 cancels in between.
- **How big the problem is** (since decision 006, 2026-09-24 14:35 UTC, iOS
  1.5.0): **32 of 70** photo label scans came back `caution`/`incomplete`,
  73% of photo cautions. The gate caused 15, a read under 300 characters 13
  more, and the rest were Claude's own judgement. Barcode-recovery photos end
  in caution 17 times out of 28.

An amber Caution card for "I couldn't read it" reads as a verdict about the
product. It is really a request for a better photo.

## Decision

- **D2. The server decides.** `retakeReasonFor` (`api/analyze.js`) sets
  `retake_reason` = `no_heading` | `no_end` | `too_little_text` | `unclear` on
  the response. The app shows the retake screen only on a known value
  (`isRetakeReason`), never from `caution_reason` or the explanation text; any
  other value gets the normal result card, the same rule as
  `result_reason: 'missing_context'`. The server can change which cases ask
  for a retake without an app release.
- **D3. The retake screen is not a verdict.** It doesn't add to the scan count,
  doesn't save to Recents and never triggers the rating prompt. Exception:
  "See what I could read" shows and saves the result exactly as today.
- **D4. No safety rule changes, and no warning is hidden.** The char floor, the
  list gate, the prompt and the verdicts are unchanged, so no live-eval run is
  needed. A response with anything else to show — a flagged ingredient, an
  allergen warning, or any `menu_items` entry — never gets `retake_reason` and
  stays on the amber card. The barcode path never sets it (barcode
  `incomplete` means no data, which recovery handles).
- **D5. One PR** for the API, the app and the docs: the API half goes live on
  merge, the app half ships in iOS 1.5.1 with the parked write-review link.

The next photo carries `retake_after` (the same four values) on its request
and on every `scan_failed` it observably produces; `list_heading_word` on
`no_heading` scans says whether a heading term appeared anywhere in the text.
Enums and a boolean only; validated server-side against one allowlist
(`RETAKE_REASONS`, `api/_analytics.js`).

## Toggles (defaults)

- **T1.** All three `incomplete` sources get the screen: the list gate, the
  char floor, and Claude's own judgement (`unclear`). Alternative: the first
  two only.
- **T2.** A "See what I could read" way out on every retake screen — the gate
  can block a complete label.
- **T3.** Web unchanged: it ignores `retake_reason` and keeps the amber card.
- **T4.** The flag rides on the next photo scan only; a barcode lookup, "See
  what I could read", opening Recents or 5 minutes clears it.
- **T5.** `list_heading_word` recorded only on `no_heading` scans.
- **T6.** Taps on the way-out link aren't measured.
- **T7.** Copy: title "Retake the photo"; the body is the server's explanation;
  a `camera` icon in ink on a muted surface, deliberately not amber.
- **T8.** Results that carry a warning stay on the amber card. Revisit if many
  `incomplete` responses are held back by this rule.
- **T9.** No client-side "screen shown" beacon; retake *responses* delivered to
  iOS 1.5.1+ stand in for screens shown.

## Consequences

- **Two halves, one PR.** Older apps (1.5.0) and web ignore the new field and
  show the amber card, which is safe. The API's response path is verified in
  production only by a positive `retake_reason`; otherwise the TestFlight
  top-cut check verifies it before submission.
- **Known gaps.** A retake that the app's offline pre-flight stops sends no
  beacon and still spends the flag, so the retry isn't tagged. Web never shows
  the screen. Every day-14 number is a server-event proxy: a timed-out or
  cancelled attempt can produce both a `scan` and a `scan_failed`, a response
  can land after the app discarded it, and at about 5 `incomplete` photo scans
  a week no ratio is statistically powered.
- **What would reopen it** (the day-14 read in `api/ANALYTICS.md`):
  - **the loop alarm** — among at least 10 retake `scan` events, those that
    come back with a `retake_reason` again outnumber those that don't: make
    "See what I could read" the primary button, or flip T1;
  - **T8's query 3** — many `incomplete` cautions held back without a
    `retake_reason`;
  - **the diagnostic** — `list_heading_word` true on half or more of
    `no_heading` blocks: open a gate investigation with tester photos
    (decision 005's method), as its own PR.
