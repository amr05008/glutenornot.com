# OCR Capture Assist — instrument, fix the no-regrets gaps, then let data pick the blur fix

> **Status 2026-07-19**: Phases 1–3 done — instrumentation shipped 2026-07-18
> (PR #17), Phase 2 + release shipped as iOS 1.4.0 (PR #19, build 2, phased
> release). Phase 4 remains: run the `image_kb` fork query ~2026-08-01; 1.4.1
> also carries auto-retry (ROADMAP) and a proposed `torch_used` scan property.

Goal: cut the OCR failure rate (25% → <15%) and shrink low-confidence OCR verdicts.
Strategy: ship instrumentation + no-regrets fixes now; defer the blur pre-check until
the data says whether blur is even the dominant failure mode.

## Decisions & toggles (most likely to change — edit here first)

| Decision | Choice | Alternative(s) | Why |
|---|---|---|---|
| Blur detection approach | JPEG-size heuristic (deferred to 1.4.1, see fork below) | skia Laplacian variance; vision-camera live feedback | Zero new deps; escalate only if data demands |
| Blur warning ship gate | **Deferred until `image_kb`/`ocr_chars` data (2+ weeks)** | Ship in 1.4.0 with guessed ~40KB threshold | A guessed threshold either nags good photos or catches nothing |
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
