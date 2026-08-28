# Weak-signal OCR upload — shrink the payload, tell the truth while uploading, make cancels visible

**Status 2026-08-28 (night): Phases A, B and C done on branch `weak-signal-upload-2026-08-28`
(`b770a7f` api telemetry; `c0e1a2e` client progress/copy/cancel beacon; then the /grill
fixes + Phase B in one commit — per-phase slow clock, screen-owned `cancelled` /
`interrupted` beacons, XHR timeout + pre-resize cancel windows closed, JPEG 0.6 by
measurement on nine real labels in `test-cases/`). 291 web + 91 mobile tests green, tsc
clean, merged with `main` through the sibling's PR #23. **Shipped:** PR #24 merged
(`3adef89`, api half live on Vercel and verified with a production scan — `total_ms`
4217 ms); **iOS 1.4.3 submitted 2026-08-28** (build 1, tag `v1.4.3`). TestFlight scans:
`app_version 1.4.3`, `image_kb` 339/347 (vs 408 p50 at 0.7), `total_ms` 3.4–4.2 s. NOT
exercised on device: the `cancelled`/`interrupted` beacons and the 3G copy (C4's two
device-only questions remain open — watch them in the first post-release review).
Remaining: **D2 read ~2026-09-11**, then close this plan. T2 (multipart) is a separate PR.**
Sibling plan: `plans/gf-label-claim-2026-08-28.md` (server-only, different agent session — see "Coordination" below).

## Why (the incident, in numbers)

2026-08-28, a farm stand in rural Connecticut, 2-bar LTE, iOS 1.4.2. Aaron needed
three attempts to get a verdict. Server side (PostHog project 457245) saw **one** request
that day from that device: OCR, **image_kb 473**, 812 chars → success. The first two attempts never reached
the server, and they left **no trace anywhere**: user-cancel is an `AbortError`, which
`handleError` (`mobile/app/index.tsx:169`) returns on before Sentry or the failure beacon
fire. The 90-day totals show only 3 connectivity beacons ever (all barcode, one user) — not
because signal is fine, but because the "slow upload → user gives up" path is invisible.

Time budget on weak LTE (upload dominates):

- **Upload**: 1024px @ JPEG 0.7 → OCR images are p50 **408 KB raw** / p90 588 KB
  (90 days, n=168), sent as base64 JSON → ~545 KB on the wire (Aaron's: ~630 KB). At the
  100–500 kbps uplink of a rural 2-bar cell that is **10–45 s before the server starts**.
- **Server**: Vision OCR + Opus 4.8 ≈ 7–13 s (estimate — nothing records server timing;
  Vercel runtime logs are behind a billing limit).
- ⇒ ~10 s on good signal, 30–55 s on bad — exactly the 30 s "taking longer" message and the
  60 s hard timeout in the screenshots.

Two things make it worse than it needs to be: the spinner says **"Reading ingredients…"**
from t=0 (nothing has been read during a 30 s upload), and the 30 s copy — *"Cancel and try
your scan again"* — is wrong advice on weak signal: the retry restarts the same 545 KB
upload with the same odds. It nudged the user into cancelling twice.

Goal: a scan on 2-bar LTE lands inside the 30 s slow threshold, the UI says what is actually
happening, and a cancelled attempt shows up in analytics.

---

## Decisions & toggles (read this first — everything below is derived from it)

Confirmed 2026-08-28:

| Decision | Choice | Why | Reversibility |
|---|---|---|---|
| Payload cut | JPEG quality 0.7 → **0.6** at 1024px — the plan said 0.5 "if the Vision check shows no OCR loss"; the check (B1 RESULT below) failed 0.5 on the densest label by 0.1 points, so the rule picked 0.6 | OCR tolerates artifacts, not resolution loss; measured ~15% fewer bytes (not the 40% hoped) | One constant |
| Transport | Keep base64 JSON | Quality knob is bigger and doesn't touch the API contract | Toggle T2 |
| Cancel telemetry | `scan_failed reason=cancelled` + `elapsed_ms`, via the existing `POST /api/track` beacon | A cancel is a failed attempt from the user's seat — today it's invisible everywhere | Allowlist edit; additive |
| Server timing | `ocr_ms`, `claude_ms`, `total_ms` on `scan` (and `ocr_ms` on server-side `scan_failed` where known) | No timing exists anywhere; settles decision 002's "revisit Opus latency on scan-duration complaints" with data | Additive properties |
| Progress copy | XHR upload progress → "Uploading photo… N%" then "Reading ingredients…"; 30 s message rewritten | Current copy tells users to restart the upload | Strings |
| Web client | Out of scope (`web/js/camera.js` has its own `JPEG_QUALITY = 0.85`) | Mobile is where the farm happens | Toggle T6 |
| Auto-retry / model swap | Neither | Slow-alive links crawl, they don't fail; Opus is the wrong leg | ROADMAP #104 stays parked; decision 002 stands |
| Ship | api telemetry on push (Vercel, no build); client as **iOS 1.4.3** via `/glutenornot-release` | Deploy split | — |

Toggles — flip by editing here, then the step that cites the toggle:

- **T1 quality value** — default `0.5`. Alternatives: `0.6` (if the Phase B check shows >2%
  median char loss at 0.5); `0.4` (if 0.5 loses nothing and you want more); resize `900px`
  instead of / in addition to quality (last resort — resolution is what OCR is sensitive to).
- **T2 transport** — default base64 JSON. Alternative: multipart/`image/jpeg` body, a free
  ~25% cut (no base64 overhead) but changes the `/api/analyze` contract (`{ image }` →
  binary), Vercel body parsing, and `imageKb` derivation (`api/analyze.js:323`). Do it only
  if T1 alone doesn't get weak-signal uploads under the 30 s threshold.
- **T3 cancel taxonomy** — default `scan_failed` with `reason: 'cancelled'`. Alternative: a
  separate `scan_cancelled` event, if the weekly review would rather keep the success-rate
  tile (`scans / (scans + scan_failed)`) unaffected by cancels. Default deliberately lowers
  that tile — a 3-attempt session *was* a 33% experience.
- **T4 progress fidelity** — default XHR `upload.onprogress` percent. Fallback: phase-only
  ("Uploading photo…" → "Reading ingredients…" at `loadend` of the upload) if RN's upload
  progress proves unreliable on device. Either needs XHR — `fetch` cannot see the upload.
- **T5 slow copy** — default *"Slow connection — still uploading. Hang tight or move to
  better signal."* while uploading; keep the existing text once the upload has completed
  (the wait is then server-side and a retry *is* reasonable). Cancel stays available.
- **T6 web parity** — default no. If yes: same quality cut in `web/js/camera.js`, and bump
  the SW cache (memory: `sw-cache-bump-on-asset-change`).
- **T7 slow threshold** — default keep `slowThresholdMs={30000}` (`mobile/app/index.tsx:349`).
  Alternative `20000` once uploads are smaller — only after Phase D data.
- **T8 client timeout** — default keep `TIMEOUT_MS = 60000` (`mobile/services/api.ts:73`).
  Alternative: don't time out while upload progress is still advancing. Not worth the
  complexity unless Phase D shows timeouts with progress > 0.

## Coordination with the sibling plan (two sessions in parallel)

Both plans touch the same three api spots: `api/_analytics.js` `buildScanProperties`
(new props), `api/analyze.js` handler (the `trackScan({...})` call around line 348 and the
hoisted metrics block around line 308), and `api/ANALYTICS.md` (the `scan` property list).
Plus `ROADMAP.md` and `CLAUDE.md`.

- Work in your own worktree/branch: **`weak-signal-upload-2026-08-28`**
  (`superpowers:using-git-worktrees`). Sibling branch is `gf-label-claim-2026-08-28`.
- **The sibling merges first** (server-only, smaller). Do Phases B–C (mobile) while it is in
  flight; rebase before opening the Phase A PR. Conflicts are confined to the spots above
  and are additive on both sides — keep both sets of properties.
- Never emit `scan` from the beacon (`api/track.js` invariant — the test
  `never emits a scan event, ever` enforces it).

## Skills / conventions the executing session must use

`superpowers:test-driven-development` for every code step; `npm test` (vitest, root `web`)
and `cd mobile && npm test` (jest) green before every commit; `/grill` before the PR;
`/ship` per phase; `/glutenornot-release` for Phase D (it drives `mobile/RELEASE.md`);
`/wrap-up` at the end (session log + this file's status line). Privacy invariant: nothing
scan-content-shaped in any event or log — counts and milliseconds only.

---

## Execution steps (build order)

### Phase A — api telemetry (ships on push; no app build)

**A1. Beacon accepts `cancelled` + `elapsed_ms`** — `api/track.js`.
- `CLIENT_REASONS` → `{'timeout','network','cancelled'}`.
- Accept optional `elapsed_ms`: integer, clamp to `[0, 120000]`, drop if not a finite
  number (untrusted input — same posture as `normalizeAppVersion`). Pass as `elapsedMs`.
- Tests (`web/tests/api/track.test.js`, mirror the existing cases): records a `cancelled`
  beacon with `elapsed_ms`; clamps/drops junk `elapsed_ms`; still rejects server-side
  reasons; still never emits `scan`.

**A2. Property builders** — `api/_analytics.js`.
- `buildScanFailureProperties`: `if (elapsedMs != null) props.elapsed_ms = elapsedMs;`
- `buildScanProperties`: `ocr_ms`, `claude_ms`, `total_ms` (omit when absent — barcode
  scans have none). Update the JSDoc reason list to include `cancelled`.
- Tests in `web/tests/api/analytics.test.js`: included when given, omitted when absent.

**A3. Handler timing** — `api/analyze.js` handler (lines ~296–365).
- `const t0 = Date.now()` before `performOCR`; `ocrMs` after it; `claudeMs` around
  `analyzeWithClaude`; `totalMs` at the `trackScan` call. Pass `ocrMs, claudeMs, totalMs`
  to `trackScan`; pass `ocrMs` to the `ocr_failed` and `claude_error` `trackScanFailure`
  calls (hoist the `let`s with `imageKb`/`ocrChars`).
- No handler-level unit test exists; cover the builders (A2) and verify live in A5.

**A4. Docs.** `api/ANALYTICS.md`: add the three timing props under `scan`, `elapsed_ms`
under `scan_failed`, and `cancelled` to the client-beacon reason list; add a "Metric
caveats" line that `cancelled` lowers the success-rate tile by design.
`reports/weekly-snapshot/README.md`: note `cancelled` in the "Why scans miss" rows and that
tile 2's denominator now includes it. `ROADMAP.md`: add this plan's line; reference
decision 002's revisit trigger now being measurable.

**A5. Ship + verify.** `/grill` → PR → merge → Vercel deploys. Then one real scan and:
```sql
SELECT toString(timestamp) ts, properties.ocr_ms, properties.claude_ms, properties.total_ms, properties.image_kb
FROM events WHERE event='scan' AND properties.method='ocr' ORDER BY timestamp DESC LIMIT 5
```
(PostHog HogQL via the `phx_` key in `.env` — memory: `weekly-snapshot-routine-posthog-key`.)
Expect all three populated. This is also the first real read of the server leg — record
the p50 in the session log; it decides whether decision 002 gets revisited.

### Phase B — payload check, then the constant (data before the change)

**B1. Measure before changing.** Both keys are in the repo `.env`
(`GOOGLE_CLOUD_VISION_API_KEY`, `ANTHROPIC_API_KEY`). Write a throwaway script in the
session scratchpad (not the repo) that, for ~10 real ingredient-label photos (ask Aaron for
an AirDrop batch, or use the photos from `GlutenOrNot - V2 Designs/` only if they are
real labels): resizes to 1024px wide and encodes at quality `0.7 / 0.6 / 0.5 / 0.4`
(`sharp`, installed in the scratchpad), posts each to Vision exactly as `performOCR`
does (`api/analyze.js` ~line 400 — same request body), and prints
`photo × quality → bytes, chars`. Decision rule: **keep T1=0.5 if median char delta vs 0.7
is ≥ −2% and no photo loses >5%**; otherwise try 0.6; if even 0.6 loses, stop and flip T2
instead. Paste the table into the session log.
- Fallback if no photos are available: scan the same 10 labels with a dev build at 0.7,
  then at 0.5, and compare `ocr_chars` per scan in PostHog (`platform='ios'`, your city,
  by timestamp). Mark the day for exclusion from the weekly review (data-hygiene
  precedent: `.claude/sessions/2026-07-19-*.md`).

**B1 RESULT (2026-08-28) — 9 photos in `test-cases/` (6 iPhone HEIC labels + 3 June
screenshots), 1024px wide, libjpeg via `sharp`, real Vision calls:**

| photo | q70 KB / chars | q60 KB / chars (Δ%) | q50 KB / chars (Δ%) | q40 KB / chars (Δ%) |
|---|---|---|---|---|
| IMG_6207 | 231 / 815 | 191 / 805 (−1.2%) | 165 / 809 (−0.7%) | 140 / 811 (−0.5%) |
| IMG_6208 | 204 / 1842 | 171 / 1778 (−3.5%) | 149 / 1748 (**−5.1%**) | 129 / 1735 (−5.8%) |
| IMG_6209 | 182 / 1094 | 152 / 1095 (0.1%) | 132 / 1107 (1.2%) | 114 / 1100 (0.5%) |
| IMG_6210 | 184 / 1686 | 154 / 1684 (−0.1%) | 133 / 1675 (−0.7%) | 113 / 1670 (−0.9%) |
| IMG_6211 | 156 / 1614 | 132 / 1609 (−0.3%) | 116 / 1605 (−0.6%) | 100 / 1610 (−0.2%) |
| IMG_6212 | 153 / 1588 | 128 / 1575 (−0.8%) | 112 / 1585 (−0.2%) | 97 / 1594 (0.4%) |
| screenshot 1 | 110 / 963 | 97 / 961 (−0.2%) | 88 / 961 (−0.2%) | 80 / 958 (−0.5%) |
| screenshot 2 | 69 / 572 | 61 / 572 (0%) | 56 / 572 (0%) | 50 / 572 (0%) |
| screenshot 3 | 90 / 763 | 79 / 763 (0%) | 72 / 763 (0%) | 65 / 763 (0%) |

Medians: q60 = 85% of q70 bytes, Δ −0.2%, worst −3.5% · q50 = 74%, Δ −0.2%, worst −5.1%
· q40 = 64%, Δ −0.2%, worst −5.8%. **Rule → T1 = 0.6** (0.5 fails the worst-photo line by
0.1 points on the densest label; the rule was pre-committed precisely so this wouldn't be
argued after the fact). Observations: OCR is essentially quality-insensitive on 8 of 9;
the one that moves is the densest small-print label, which is also where a wrong
verdict costs most. The byte saving from quality alone is **~15%**, not the 40% hoped —
which makes **T2 (multipart, a free ~25% by dropping base64)** the next lever; it is a
separate PR (API contract + Vercel body parsing). NB the local q70 median (156 KB) is far
below production's `image_kb` p50 (408 KB): iOS's encoder and real framing differ from
libjpeg on these nine — C4 should read `image_kb` from a 0.6 scan and compare.

**B2. Change the constant** — `mobile/app/index.tsx:223` `compress: 0.7` → T1. Check
`mobile/app/__tests__/index.test.tsx` for an assertion on `manipulateAsync` args and update
it. Add a one-line comment citing this plan and the B1 numbers.

### Phase C — client: honest progress, better slow copy, visible cancels

**C1. Upload progress needs XHR** — `mobile/services/api.ts`.
- Add `postJsonWithProgress(url, body, headers, signal, onUploadProgress)` built on
  `XMLHttpRequest` (RN implements `xhr.upload` progress events; `xhr.timeout` and
  `xhr.abort()` cover the existing timeout/cancel semantics). Returns the same shape the
  code expects (`ok`, `status`, `json()`), so the status-code branches in `analyzeImage`
  stay as they are.
- `analyzeImage(base64Image, externalSignal, onProgress?)` — `onProgress` receives
  `{ phase: 'uploading', pct }` then `{ phase: 'reading' }` at upload `loadend`. OCR path
  only; `lookupBarcode` stays on `fetch`.
- Tests (`mobile/services/__tests__/api.test.ts`): the file mocks `global.fetch`; add a
  minimal XHR mock for the OCR path (upload progress events → `onProgress` calls; abort →
  `AbortError`; timeout → `timeout` APIError + beacon). Keep every existing case green.

**C2. Messages** — `mobile/app/index.tsx` + `mobile/components/LoadingSpinner.tsx`.
- `processAndAnalyze`: `setLoadingMessage('Uploading photo…')` before the request;
  `onProgress` → `Uploading photo… ${pct}%` (T4) → `Reading ingredients…` on `reading`.
- Slow message becomes phase-aware (T5): pass the current phase to `LoadingSpinner` (or
  compute `slowMessage` in `index.tsx` from phase) so at 30 s it reads the uploading copy
  while uploading and the existing copy once the server has the image. Cancel stays.

**C3. Cancel beacon** — `mobile/services/api.ts`. In both `externalSignal?.aborted`
branches (lines ~144 and ~242): `sendFailureBeacon(method, 'cancelled', elapsedMs)` before
rethrowing the `AbortError` (`startTime` is already in scope for OCR; add it for barcode).
Extend `sendFailureBeacon` to send `elapsed_ms`. Never awaited; never changes the thrown
error. Tests: cancel fires the beacon with a numeric `elapsed_ms`; the beacon body never
contains the image; a failing beacon doesn't change the error.

**C4. On-device check.** iPhone → Settings → Developer → Network Link Conditioner, profile
"3G" or "Edge". Scan a label: expect "Uploading photo… N%" advancing, the uploading slow
copy at 30 s, no timeout on "3G" after B2. Cancel once → confirm a `cancelled` beacon in
PostHog; background the app mid-scan and resume → confirm an `interrupted` beacon (no
`elapsed_ms`). Record wall-clock times in the session log.
Two things only a device can answer (from the 2026-08-28 /grill):
- **Does the final upload progress event fire with `loaded == total`?** If the last
  `didSendBodyData` lands short, the phase never flips until the response and the
  "still uploading" copy stays up through the whole server leg (the `readyState 2/3`
  fallback only fires with the headers, which `/api/analyze` sends with the verdict).
  If so, flip toggle T4 to phase-only or treat ≥ 99% as done.
- **How far ahead of the server does "Reading ingredients…" run?** iOS counts bytes
  handed to the socket, not bytes received; the kernel send buffer (~100 KB+) is still
  draining on a slow uplink. Time from "100%" to the verdict vs `total_ms` in PostHog
  for the same scan gives the gap. The reading-phase copy is deliberately
  non-prescriptive and on a 20 s clock so this gap can't induce a retry.

### Phase D — release and read the data

**D1.** `/glutenornot-release` → iOS **1.4.3**. Release note: "Faster scans on weak
signal; the app now says when it's still uploading." Bump nothing web-side (T6 = no).

**D2. Two weeks after release, in the weekly review:** `cancelled` count and
`elapsed_ms` distribution; `image_kb` p50 (expect ~250 KB from 408); `total_ms` p50; any
change in `ocr_failed` rate *from 1.4.3 builds* (the guard against T1 having cost OCR
quality — compare against the 7.4% clean rate in `plans/ocr-capture-assist-2026-07-18.md`).
Decide T7/T8 and whether decision 002 needs revisiting **from these numbers**, then close
this plan with a CLOSED header in the style of the capture-assist plan.

## Definition of done

- `scan` events carry `ocr_ms/claude_ms/total_ms`; a cancel produces
  `scan_failed reason=cancelled` with `elapsed_ms`; docs updated.
- OCR upload p50 drops materially with no rise in `ocr_failed` from the new build (B1 table
  + D2 read).
- On "3G" the UI shows upload progress and the uploading slow copy; a scan lands without
  a timeout.
- 1.4.3 in the store; plan status updated; session log written.

## Out of scope (deliberately)

Auto-retry with backoff (ROADMAP #104); idempotency/result cache for "server completed but
client timed out" (ROADMAP #108); model swap (decision 002); web client changes (T6);
barcode path (already small-payload, 30 s timeout, per-source 5 s upstream timeouts).
