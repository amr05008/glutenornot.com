# OCR Capture Assist — instrument, fix the no-regrets gaps, then let data pick the blur fix

> # ✅ CLOSED 2026-08-13 — goal met, no client work warranted
>
> **The plan's own success metric was already satisfied by the time the fork
> query could be run, and the remaining failures are not reachable by a client
> fix. Nothing further ships from this plan.** The instrumentation (Phase 1) and
> the 1.4.0 capture work (Phase 2) stay; the deferred blur/framing fix does not.
>
> Three numbers, all from the 30-day window Jul 14 – Aug 13 with App Review
> traffic excluded (`reports/weekly-snapshot/README.md`):
>
> 1. **The goal is met.** Target was 25% → <15% OCR failures. Actual clean rate:
>    **7.4%** (11 failures / 149 attempts). The 25% baseline was computed on
>    uncleaned data that was substantially Apple reviewers failing 100% of the
>    time — the problem was smaller than it looked from the start.
> 2. **OCR is no longer the weak path.** 7.4% against barcode's 8.5%
>    `not_found`. The premise that photo capture is where scans are lost no
>    longer holds.
> 3. **The residual failures are unreachable by a client fix.** 9 of the 11 came
>    from `platform: unknown` — installs older than 1.2.0, which cannot receive
>    any 1.4.x capture work until they update, and demonstrably don't. Only
>    **2 failures in 30 days** came from current builds. Framing guidance would
>    have targeted those two.
>
> Phase 4's *technical* question was still answered, and the answer stands if
> this is ever reopened: **the failure mode is aiming, not blur** — ship framing
> guidance, never a size gate. See "Phase 4 DECIDED" below for the derivation.
> What changed is that it stopped being worth building, not what it concluded.
>
> **Not carried forward from the 1.4.3 bundle:** auto-retry-with-backoff was
> queued alongside this but is *connectivity* work, not capture — it keeps its
> own ROADMAP line and its own justification. `torch_used` only mattered as
> instrumentation for a capture fix that is no longer shipping.
>
> **If you reopen this**, the trigger is a rise in OCR failures *from current
> builds* — the 2-per-30-days figure is what to watch, not the headline rate.
>
> ---
>
> ## Historical status (kept for context)
>
> **2026-08-13**: Phase 4 decided — framing guidance, no blur detection, no size
> gate. 1.4.2 shipped as a deliberate one-change release carrying only the
> `X-Client-Version` header.
>
> **Status 2026-07-19**: Phases 1–3 done — instrumentation shipped 2026-07-18
> (PR #17), Phase 2 + release shipped as iOS 1.4.0 (PR #19, build 2, phased
> release). Phase 4 remains: run the `image_kb` fork query ~2026-08-01.
> **2026-07-27**: iOS **1.4.1** shipped as an unplanned bug-fix release
> (pre-release review findings — see `reports/2026-07-27-pre-release-review.md`),
> so the fork release below was renumbered; it also carries auto-retry
> (ROADMAP) and a proposed `torch_used` scan property. Every "1.4.1" in the
> body below predates that renumbering and means the fork release (now 1.4.3,
> per the 2026-08-13 status above).

Goal: cut the OCR failure rate (25% → <15%) and shrink low-confidence OCR verdicts.
Strategy: ship instrumentation + no-regrets fixes now; defer the blur pre-check until
the data says whether blur is even the dominant failure mode.

## Decisions & toggles (most likely to change — edit here first)

| Decision | Choice | Alternative(s) | Why |
|---|---|---|---|
| Blur detection approach | **Dropped 2026-08-13** — framing guidance instead | JPEG-size heuristic; skia Laplacian variance | Failures are 0-char reads at normal file sizes: aiming, not blur |
| Blur warning ship gate | **Resolved 2026-08-13: do not ship.** No size gate either | Ship in 1.4.0 with guessed ~40KB threshold | Clean data has 4 sub-200 KB failures total; a gate nags good photos to catch almost nothing |
| Client-side failure events | Beacon endpoint `POST /api/track` → server fires `scan_failed` via existing `_analytics.js` | posthog-react-native SDK in the app | Single pipeline, same hashed-IP distinct id, no App Store privacy-label change |
| Beacon delivery | Fire-and-forget; offline losses accepted (timeout events — the 7/11 signal — mostly arrive) | Queue + retry on next launch | Keep it simple; revisit if data shows big losses |
| Warning UX (when it ships) | Soft `Alert.alert`: Retake / Use anyway | Custom sheet in Clinic style | Never hard-block; Alert matches existing patterns |
| Torch UX | Manual toggle on camera overlay + torch glyph in `Icon.tsx`; error state pre-enables it on retry | Auto-detect (impossible: no iOS ambient-light API in Expo) | — |
| Blur check placement (when it ships) | `processAndAnalyze`, camera captures only (skip library picks) | Also check library picks | Library photos were deliberately chosen |
| Success metric | ocr_failed <15% + low-confidence OCR share down, ~4 weeks post-1.4.0, excluding failure-only tester/reviewer traffic (e.g. Cupertino cluster) | — | Decide "did it work" before shipping, not after |

**The 1.4.1 fork (decided by data, not now):**
NB: `ocr_chars` is 0 on every `ocr_failed` **by construction** (the event only fires
when Vision returns no text) — it carries no signal there. The discriminator is
`image_kb`, compared across events:
- `ocr_failed` `image_kb` distribution ≈ successful scans' → images look normal but
  Vision finds nothing → aiming/framing problem → build framing guidance, skip blur detection.
- `ocr_failed` `image_kb` shifted clearly low vs successes → blur/dark captures →
  ship the size-threshold warning, threshold read off the observed distributions.
- Also read `ocr_chars` + `image_kb` on **low-confidence successes** (partial reads are
  the blur signature that still "succeeds"), and `ocr_chars` on `claude_error` (OCR had worked).
- Neither separates → escalate to skia pixel analysis (or accept the rate).

## Phase 4 DECIDED (2026-08-13, window Jul 14 – Aug 13)

**Ship framing/aiming guidance. Skip blur detection. Do NOT ship a client-side
size gate.** The fork's first branch won: images look normal, Vision finds nothing.

Evidence, strongest first:

1. **`ocr_chars` is 0 on every OCR failure that reached Vision — 34 of 34**;
   median on successes is 725. (The 35th `ocr_failed` in the window carries no
   measurement at all: it fired 2026-07-18 22:26 UTC, ~36 min before the Phase 1
   instrumentation deployed.) Blur yields garbled *partial* text; zero characters
   means the label was never in frame. This holds with no filtering and no
   judgement calls.
2. **The `image_kb` slope is real but nearly all reviewer traffic.** Raw it looks
   decisive — sub-200 KB fails 58.1%, 400 KB+ fails 6.4%. Excluding App Review
   (see `reports/weekly-snapshot/README.md`) sub-200 KB drops to 23.5%, and
   excluding every zero-success cluster it drops to 13.3%, against an unchanged
   6.4%. Apple's reviewers submit 36–125 KB captures; real users' failures are
   173–357 KB.
3. **After cleaning there are 4 sub-200 KB failures in the entire window** (2 of
   them one user's single burst), against 13 sub-200 KB successes. A 150–200 KB
   gate would nag 13 good captures to catch 4 bad ones.
4. **There is no cliff to put a threshold at.** Post-cleaning the 300–399 KB
   bucket fails 18.6% — *higher* than 100–199 KB at 16.7%. Failures are spread
   across every size. The clearest single case: a 750 KB capture that yielded
   3 characters.

**Confound found — do not evaluate 1.4.0 across 2026-07-19.** The pinned model
went `claude-sonnet-4-6` → `claude-opus-4-8` (commit 0745bc6, deployed
2026-07-19 15:31 UTC) — the same day 1.4.0 shipped. On barcode scans *with*
ingredient data, a path with no capture involvement at all, caution went 46.7%
(n=45) → 68.2% (n=195), z≈2.7. It survives two controls: the 5 identities that
scanned in both eras moved 57.9% → 78.9%, and within Open Food Facts alone
46.7% → 67.5%. Uncontrolled: *which products* were scanned (deliberately not in
analytics). So some "quality got worse after 1.4.0" signal is the model getting
hedgier, not captures getting worse. `model` is now a `scan` property so the
next swap is attributable at the time instead of archaeologically.

## Execution steps (build order)

### Phase 1 — server instrumentation (this week, Vercel deploy, no build)
1. `api/analyze.js`: attach `image_kb` (payload size) to `scan` and OCR `scan_failed`
   events (except `rate_limited`, which fires before the body is parsed); on OCR
   completion attach `ocr_chars` (length of text Vision returned; omitted when the
   failure precedes OCR, e.g. a Vision API error).
   `api/_analytics.js`: accept/emit the new properties (omit-when-absent pattern).
2. TDD via `web/tests/api/analyze.test.js` + `analytics.test.js`.
3. Privacy check (per `privacy-claims-check` memory): byte counts and char counts are
   technical aggregates, not scan content — no policy conflict expected; verify wording anyway.

### Phase 2 — app changes for 1.4.0 (no data dependency)
4. Torch: add `torch` glyph to `components/Icon.tsx` (line-icon set, design tokens);
   toggle button on camera overlay wired to `CameraView` `enableTorch`; state persists
   across retakes within a session.
5. "Couldn't read that" `StateScreen`: primary becomes **"Turn on flashlight & retry"**
   (returns to camera with torch on); secondary stays "Choose a photo instead".
6. Client-side `scan_failed` for `timeout`/`network`: new `POST /api/track` beacon
   (validates reason against allowlist, reuses `getClientIP`/`normalizeClient`/geo,
   calls `trackScanFailure`); client fires it from the timeout/network error paths in
   `services/api.ts` error handling (fire-and-forget, never blocks UX).
7. Keep `scan` success-only — beacon must never emit `scan`.

### Phase 3 — release 1.4.0
8. Follow `mobile/RELEASE.md` via the `glutenornot-release` skill. Version bump
   mandatory (PR #15's `expo-network` native dep; never `eas update` at 1.3.0).
   PR #15 connectivity fix + Recents-era fixes ride along.

### Phase 4 — learn, then 1.4.1
9. ~2 weeks after Phase 1 deploy: query `image_kb`/`ocr_chars` distributions for
   scan vs scan_failed (ocr). Apply the fork above. Re-run the weekly data review
   ~4 weeks post-1.4.0 against the success metric; revisit barcode-first vs OCR-first
   capture hierarchy with fresh numbers.

## Explicitly out of scope
Auto-retry with backoff (own effort), skia/vision-camera (escalation only),
haptics, dark mode, favorites/share.
