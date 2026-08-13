---
date: 2026-08-13
summary: Verified a 30-day PostHog review's four findings, shipped the OCR safety floor + release attribution (PR #22), decided capture-assist Phase 4, and submitted iOS 1.4.2
tags: [analytics, safety, release, ios, posthog, privacy]
---

## Summary
Worked through four findings from a 30-day PostHog review (project 457245, window
2026-07-14 → 2026-08-13), re-running every query before acting because the source
analyses had disagreed with each other. Three reproduced, two with materially
different numbers than reported. Shipped a safety fix and release attribution as
PR #22 (two commits), resolved the parked `image_kb` fork, then cut iOS 1.4.2 as a
deliberate one-change release.

## Changes
- `api/analyze.js` — `applySafeVerdictFloor`: an OCR extraction under
  `MIN_OCR_CHARS_FOR_SAFE` (100) can never return `safe`. Only downgrades; also
  floors per-item `safe` badges on menus. Commit `348b227`, tested in isolation.
- `api/_analytics.js`, `analyze.js`, `barcode.js`, `track.js` — `app_version`
  (from a whitelisted `X-Client-Version` header) and `model` on scan events.
- `mobile/services/api.ts` — sends `X-Client-Version` from `Constants.expoConfig`
  on all three endpoints; `expo-constants` declared explicitly + lockfile synced.
- `web/privacy-policy.html` — enumeration + effective date; `web/sw.js` → v7.
- `reports/weekly-snapshot/README.md`, `api/ANALYTICS.md` — App Review exclusion
  rule; `plans/ocr-capture-assist-2026-07-18.md` — Phase 4 decision.
- Version lockstep → 1.4.2 (`2f8e1aa`), tag `v1.4.2`, GitHub release.
- `plans/ocr-capture-assist-2026-07-18.md` — **CLOSED** (`4518741`); ROADMAP,
  `mobile/RELEASE.md` and `CLAUDE.md` propagated (no active plans remain).
- Doc pass at wrap-up: ROADMAP gained the three items this session shipped,
  README documents the floor in the pipeline + test coverage, CLAUDE.md carries
  the floor as a don't-remove-this gotcha.

## Decisions
- **Safety floor at 100 chars**, derived from the distribution rather than picked:
  the 10th percentile of successful extractions (p10 97.6, median 725). The whole
  observed hazard is below it (1 bad `safe` in 14 reads under 100 chars, 0 in the
  15 between 100–331) and it is 3.3× below the smallest read that ever supported a
  legitimate `safe`, so it costs zero false cautions on all 139 recorded successes.
- **App Review excluded by rule, never by identity.** `distinct_id` is a hash of
  the client IP so a new one appears per submission. PostHog cohort 481139
  (behavioural, Cupertino) + an inline predicate. Explicitly did *not* extend the
  city rule to the dev-testing cluster: that city holds 8 identities, mostly real
  users, so a city rule there deletes real signal.
- **`platform: unknown` kept in.** Identified as iOS builds older than 1.2.0, not
  scripts and not stale web: those identities fire `barcode` events (web has no
  barcode path at all), their image sizes match iOS and are ~30× the web median,
  one identity transitioned `unknown` → `ios`, and the population decays 20.5% →
  3.0% → 1.4% of events across June/July/August. Real users, genuine signal.
- **Capture-assist Phase 4: framing guidance, no blur detection, no size gate.**
  See the plan for the full derivation.
- **1.4.2 is attribution-only.** Chosen over bundling the framing work so the
  build introducing `app_version` isn't also the build changing capture behaviour.
  Noted at the time that the volume (~150 OCR scans/month) can't power a real
  before/after on failure rate regardless — `app_version` earns its keep for spike
  detection and RC exclusion, not for a powered A/B.
- **The capture-assist plan was CLOSED rather than deferred**, and there is no
  1.4.3. Phase 4's technical answer (aiming, not blur) was correct but the work
  stopped being worth building: the plan's own 25% → <15% target was already met
  at a clean 7.4%, OCR now fails less than barcode `not_found` (8.5%), and 9 of
  the 11 residual failures came from installs older than 1.2.0 that can't receive
  a client fix — leaving 2 failures a month that framing guidance would address.
  The 25% baseline had been computed on uncleaned data that was largely reviewer
  traffic, so the problem was smaller than it looked from the start. Auto-retry
  was explicitly *not* carried forward with the closure: it is connectivity work
  that was bundled by scheduling accident, not by rationale.

## Corrections to the incoming review
- App Review is **14 of 35** `ocr_failed` events *on its own*; the fourth cluster
  is additional, taking it to 20 of 35. Reported as 14 including the fourth.
- `platform: unknown` is **10 failures + 2 successes** (12 events total), not
  "~12 failures against ~2 successes".
- `ocr_chars = 0` on **34 of 34** failures that reached Vision, not "34 of 35" —
  the 35th carries no measurement, having fired 36 min before instrumentation
  deployed. The window starts four days before Phase 1 shipped.
- The `image_kb` figures reproduced to the decimal (58.1% / 6.4% raw; 23.5%
  ex-Cupertino; 13.3% ex-all-clusters).

## /grill findings (all fixed pre-merge)
- **The service worker would have served a stale privacy policy.** It is
  cache-first and runtime-caches *every* same-origin page, not just
  `PRECACHE_FILES` — so a visited policy is pinned until `CACHE_NAME` changes.
  The existing auto-memory said "bump when a *precached* file changes", which
  would have let this recur; memory corrected.
- `applySafeVerdictFloor` threw a TypeError on a null menu item (proven):
  `parseClaudeResponse` only sanitises `menu_items` when `mode === 'menu'`.
- Menu scans were told to reframe their "ingredient list" (proven).
- The version validator rejected `1.5.0-rc.1` — contradicting this same PR's
  recommendation that RC tagging is the durable dev-traffic exclusion.
- A malformed version dropped silently, recreating the exact ambiguity
  `app_version` exists to remove. Now logged.

## Notes
Post-release watch:
- **`app_version: 1.4.2` on a real scan from an updated install.** The one check
  that matters — this release is a single header and its failure mode is silent
  in both directions. Pre-submission the generated `EXConstants.bundle/app.config`
  was verified to carry `1.4.2`; only a live scan proves the whole path.
- Sentry `glutenornot-mobile`: new error-level issues after rollout (and
  `level:warning` for client timeouts — an error-only query misses them).
- The model confound is **not** fully explained: on the 2026-07-19 boundary the
  barcode path got more cautious (46.7% → 68.2%, surviving within-subject and
  data-source controls) while the OCR label path moved the *opposite* way
  (69.6% → 64.1%). Consistent with 1.4.0's capture work offsetting a hedgier
  model, but "Opus is uniformly hedgier" is not established. `model` is now
  recorded, so the next swap is measurable rather than archaeological.
Two cloud routines armed (both one-shot):
- `trig_01MMyYwpjSn3QUdtUUxfbCPP` — "Check iOS 1.4.2 live on App Store",
  2026-08-16 9pm ET. Reused the 1.4.1 routine per the runbook rather than
  duplicating. Its prompt now teaches the interpretation that would otherwise
  cause a false alarm: at ~3 days almost nobody has updated, so zero 1.4.2
  events is expected — the failure signal is 1.4.2 events with `app_version`
  empty, not the absence of them.
- `trig_01EikYLcTGbfwPWAHa8Y8jxF` — "GlutenOrNot holistic review (post-1.4.2)",
  2026-08-27 9am ET. Decides what (if anything) the next release carries, with
  "ship nothing" named as a valid and expected answer so the agent doesn't
  manufacture work. It is handed the closed plan and the exclusion rule as
  required reading, and told the reopen trigger is failures **from current
  builds**, not the headline rate.
