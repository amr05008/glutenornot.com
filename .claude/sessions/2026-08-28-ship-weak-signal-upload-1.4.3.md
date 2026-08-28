---
date: 2026-08-28
summary: Scoped and executed plans/weak-signal-upload-2026-08-28.md end to end — server timing + cancelled/interrupted beacons (api), XHR upload progress with a per-phase slow clock, JPEG 0.6 by measurement on nine real labels (mobile) — two /grill passes (DON'T SHIP → fixed → SHIP), PR #24 merged, iOS 1.4.3 submitted; the gf-label-claim sibling shipped in parallel (PR #23)
tags: [connectivity, analytics, mobile, release, grill, worktree, measurement]
---

## Summary
Started from a field report (2-bar LTE at a farm stand: three attempts for one
verdict, then `caution` on a labeled-GF product). Diagnosed both from PostHog
before writing anything: the server saw exactly one request; the two failed
attempts left no telemetry because user-cancel skipped Sentry and the beacon;
the OCR upload is p50 408 KB raw (~545 KB on the wire) at 1024px/JPEG 0.7 —
10–45 s on a rural uplink — and the 30 s copy told the user to *restart* it.
Verdicts over 90 days: 69% caution, only 4 of 172 cautions high-confidence.
Two plans were written via `/scope` and handed to two sessions; this one ran
the connectivity plan in a worktree, TDD throughout, and shipped iOS 1.4.3.

## Changes
- `api/analyze.js`, `api/_analytics.js`, `api/track.js`, `api/ANALYTICS.md`,
  `reports/weekly-snapshot/README.md` — `scan` gains `ocr_ms`/`claude_ms`/
  `total_ms`; the beacon accepts `cancelled` (+ clamped `elapsed_ms`) and
  `interrupted`; server-side OCR failures carry `ocr_ms`. `cancelled` lowers
  the weekly success-rate tile by design (alternative recorded as toggle T3).
- `mobile/services/api.ts` — OCR request moved from `fetch` to XHR
  (`postJsonWithProgress`, fetch-shaped) for upload progress; `onProgress`
  reports `{uploading, pct}` then `{reading}` once; `readyState` guard is 2/3
  only (RN dispatches 4 before abort/error); `ontimeout` handled; an external
  abort during the pre-flight probe is honored; pct floored and capped at 99;
  `sendFailureBeacon` exported for the screen; external aborts are NOT beaconed
  here (the API layer can't tell a Cancel tap from an iOS resume).
- `mobile/app/index.tsx` — "Uploading photo… N%" → "Reading ingredients…";
  `LoadingSpinner` keyed on phase with per-phase thresholds (30 s uploading /
  20 s server-side) and copy that offers rather than instructs; `abandonScan`
  owns abort + beacon (`cancelled` with elapsed on Cancel; `interrupted`, no
  elapsed, on the transition *to* background — a transient `inactive` no longer
  kills a scan); the abort handle exists from the spinner's first frame (a
  Cancel during the resize used to let the request go out anyway); JPEG 0.6.
- `mobile/components/LoadingSpinner.tsx` — one clock per mount; the screen
  restarts it by remount, not prop change.
- Tests: `web/tests/api/{track,analytics}.test.js` (+10),
  `mobile/services/__tests__/api.test.ts` (rewritten around a scriptable XHR
  mock that follows RN 0.81's event order), new `LoadingSpinner.test.tsx`,
  `index.test.tsx` (+9: progress copy, the 35 s-upload walk-through, Cancel
  beacon, background → interrupted, inactive is harmless, cancel-during-resize,
  the 0.6/1024 encoding pin). 291 web + 91 mobile, tsc clean.
- `.gitignore` — `test-cases/` (Aaron's nine label photos, ~10 MB, local only).
- Release: `mobile/app.json` + both `package.json` → 1.4.3; `mobile/RELEASE.md`
  header, pending section, agent-driven notes; ROADMAP; plan; CLAUDE.md; README.
- Commits: `d736ca6` (plans), `b770a7f` (Phase A), `c0e1a2e` (Phase C),
  `cae270d` (grill fixes + Phase B), merges `5e1f100`/`09ebd62` (main via
  PR #23), PR #24 merge `3adef89`, `5da1976` (bump), `0f9e6aa` (close-out).
  Tag `v1.4.3`, GitHub release. Live-check routine re-armed for 2026-08-31.

## Decisions
- **JPEG 0.6, not the planned 0.5.** The plan pre-committed a rule (keep 0.5
  only if median Δchars ≥ −2% and no photo loses > 5%) precisely so the number
  wouldn't be argued after the fact. Nine real labels through Vision: OCR was
  quality-insensitive on eight (median Δ −0.2% at every quality); the densest
  small-print label lost 5.1% at 0.5 — over by 0.1 points, and that is the
  label where a missed line costs most. Saving is ~15%, not the 40% hoped;
  T2 (multipart, ~25% free) is the next lever as a separate PR.
- **Per-phase slow clock (the /grill finding).** The first cut kept one slow
  flag across phases, so after any upload > 30 s the instant the phase flipped
  the screen said "Cancel and try your scan again" at server-t=0 — the
  incident's nudge moved to the worst moment, locked in by two tests. Fixed by
  keying the spinner on phase; reading-phase copy is non-prescriptive.
- **Beacon ownership belongs to the screen.** One AbortSignal can't
  distinguish a Cancel tap from iOS dropping the request; `interrupted` fires on
  the transition to background (deterministic) rather than on resume (raced the
  dead socket's error and the 60 s timer).
- **Merge, not rebase**, to integrate the sibling's `main` — avoids a
  force-push the `/ship` rules forbid; same resulting code.
- **Ship order**: merge the PR (api live via Vercel) → build → TestFlight as
  the C4 smoke test → submit. Aaron's correction: the client can't be
  device-tested before there's a build.

## Notes
- **Not exercised on device before submission:** the `cancelled`/`interrupted`
  beacons and the 3G copy (Aaron ran plain scans on TestFlight). Unit-tested
  only. The re-armed live-check routine and the D2 read (~2026-09-11) look for
  the first real `cancelled` event as the verification.
- **Two device-only questions remain open** (plan C4): does the final upload
  progress event report `loaded == total` (if not, the phase never flips until
  the response); how far ahead of the server "Reading…" runs (iOS counts bytes
  handed to the socket; the kernel send buffer can hold ~100 KB+).
- **First server-leg data:** production `total_ms` 3.4–4.2 s (`claude_ms`
  ~2.8–3.6 s) — well under the 7–13 s estimate. Decision 002's Opus-latency
  concern is smaller than assumed; on good signal a scan is ~5 s end to end.
- **The local libjpeg proxy under-sizes iOS output ~2×** (152 KB vs ~340 KB on
  device for comparable labels) but is faithful for a JPEG it's handed (the
  production scan of IMG_6209 matched the B1 table to the kilobyte). Relative
  deltas held: TestFlight `image_kb` 339/347 vs the 0.7-era p50 of 408.
- **Shelf-shot contaminant for the sibling's metric:** the first production
  event with `gf_claim_present=true` was an `unsafe` fig bar photographed next
  to a certified-GF cracker box. Verdict right; the flag is a presence regex.
  Recorded next to the step-9 line in ROADMAP.
- **Operational:** PostHog's query API caches results — `"refresh":
  "force_blocking"` when checking for an event you just created. The Vercel
  MCP's deployment list was blocked by the permission classifier; a real scan
  (the plan's A5 script in the session scratchpad) proved the deploy instead.
  `npm ci`, not `npm install`, in a fresh worktree/release checkout.
- Worktree left on disk at `.claude/worktrees/weak-signal-upload-2026-08-28`
  (branch merged; safe to remove).
