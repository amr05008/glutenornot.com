---
date: 2026-09-05
summary: Implemented plans/barcode-recovery-2026-09-05.md end to end — missing-context marker + content-free barcode_recovery funnel (api, live via Vercel), neutral dead-end states + photo-only capture (iOS); three grill rounds (mine, Aaron's own agent's race-hardening commit, then a fresh reviewer that caught two normal-path regressions from that commit); PR #25 merged; iOS 1.5.0 built, TestFlight-smoked with PostHog evidence for every funnel stage, submitted (build 2), tagged
tags: [barcode, recovery, analytics, mobile, grill, privacy, release]
---

## Summary
Built the initial recovery scope from the plan and its handoff-review
overrides, server first. A barcode dead end (404, or a 200 the server now
marks `result_reason: "missing_context"`) lands on a persistent neutral state
and one tap opens a photo-only camera; those states never touch history,
scan count, or the rating prompt. The flow is measured by a new content-free
`barcode_recovery` funnel. Enrichment (plan §8) stays deferred. Worked in the
main checkout on a feature branch because `plans/` and the design export are
gitignored. Merged as PR #25; api half verified live; iOS build not started.

## Changes
- `api/barcode.js` — `result_reason: 'missing_context'` on the `!ingredientContext` branch only; `parseClaudeResponse` strips any `result_reason` the model emits (grill #1).
- `api/recovery.js` (new), `api/_analytics.js` — `POST /api/recovery` → `barcode_recovery` (v4-UUID `flow_id`, reason, stage, stage-scoped bounded optionals); payload rebuilt from an allowlist, 1 KB body cap measured in UTF-8 bytes, own 200/day per-IP map; never emits `scan`/`scan_failed`.
- `api/ANALYTICS.md`, `web/privacy-policy.html` (effective 2026-09-05), `web/sw.js` (v8), `README.md`, `ROADMAP.md`, `CLAUDE.md`, `mobile/RELEASE.md`, `mobile/APP_STORE_SUBMISSION.md` (the privacy section said "No analytics tracking" — wrong since June).
- `mobile/constants/verdicts.ts` — `result_reason?`, `RECOVERY_API_URL`. `mobile/services/api.ts` — `clientHeaders` exported.
- `mobile/services/recovery.ts` (new) — `newRecoveryFlowId` (platform crypto or Math.random v4; Hermes ships no `crypto`), `sendRecoveryEvent` (key-by-key payload, once-per-flow dedupe for `shown`/`result_displayed`).
- `mobile/components/BarcodeRecoveryState.tsx` (new) — A/B states, scroll-centred, optional barcode chip + product name, neutral ink.
- `mobile/app/index.tsx` — `RecoveryFlow` state + ref mirror; handler guards on refs (recovery, focus via `useFocusEffect`, dismissed codes, recent-miss cache); photo-only overlay as a stacked column; exit/Recents beacon `exited`, suppress the code 60 s, re-arm 2 s; completed flow suppresses its code too; ownership model (one AbortController per scan, only the owner clears; pending shutter/picker photo discarded on exit/Recents/blur/unmount; a pending pick survives an app switch; a result whose commit began is "settled" and Cancel/background stand aside); picker-specific couldn't-read copy.
- `mobile/app/result.tsx` — `result_displayed` beacon on focus from transient route params.
- Tests: `web/tests/api/{barcode,analytics,recovery}.test.js`, `mobile/services/__tests__/recovery.test.ts`, `mobile/app/__tests__/{index,result}.test.tsx`. 325 web / 148 mobile, tsc clean.
- Commits: `1da1b87` (api), `1da0fac` (grill hardening), `625aab9` (client), `08cb7af` (Aaron's agent: race hardening), `11b39c2` (fix its two regressions), `b2ef696` (test hygiene), merge `a216417`, `410b7ee` (runbook + App Store notes).

## Decisions
- **Completed-flow barcode is suppressed for 60 s**, not only an explicitly dismissed one. The plan literally said "cached miss → same affordance"; the first grill showed that Back with the product still in frame would re-run a full lookup (and a server `scan` event) for `missing_context`, re-opening a question the photo just answered. The recent-miss cache is kept as a backstop but is normally outlasted by the suppression window.
- **State B shows the barcode chip** from the response — display-only, in memory; the plan allowed optional identity and the design had it.
- **The addendum's library-specific couldn't-read copy applies app-wide**, as the addendum itself specifies ("shutter-path body unchanged").
- **Race hardening from a second agent was kept, then corrected.** `08cb7af` closed real holes (barcode detected under an open picker → two concurrent requests; torch pre-applied after the prompt) but regressed two normal-path windows (a landed result aborted mid-commit with a false failure beacon; a picked photo discarded after an app switch). Probes proved both; fixed in `11b39c2` with the "settled" marker. Lesson: race fixes are where new races hide — a fresh reviewer with probes, not the author, found them.
- **The `-rc` app-version tag** makes smoke traffic excludable by rule; the live checks used `1.4.3-rc.smoke`.

## Release (same session)
- Version lockstep 1.4.3 → 1.5.0 (`a843927`), prebuild + MARKETING_VERSION/team patches, simulator Release build proved launch with `app.config` 1.5.0. Aaron archived/uploaded; smoke on TestFlight build 1; submitted build 2 (identical source). Tag `v1.5.0` at `a843927`, GitHub release.
- TestFlight evidence from PostHog (21:36–21:46 local): four `barcode_recovery` flows, one event per stage each — three completions (two `missing_context`, one `not_found`) and one `exited`; `result_displayed` landed 0.26 s after the server `scan`, so the modal focus effect fires; no lookups under the result. This closed the one gap the tests could not (focus semantics). Exclude that window from the day-14 read.
- Sentry properties: I overwrote prebuild's generated file with only the token → first simulator build failed ("A project ID or slug is required"); fixed by restoring `defaults.org/project`; runbook step 0 now says append (`d102893`).
- App Store Connect: description rewritten by Aaron (drops "photos never leave your device"; now mentions barcodes and anonymous usage stats), privacy labels already had Product Interaction + Coarse Location; Crash Data + Performance Data recommended.

## Notes
- The focus-semantics gap is now closed by the TestFlight evidence above; keep the device check in the runbook for future changes to `index.tsx`'s ownership model.
- Live verification 2026-09-05: `/api/recovery` 204/400/413 as designed; an evidence-backed barcode carries no marker; an unknown code returns 404. The `missing_context` branch could not be exercised live (Open Food Facts search was down); it is unit-tested and state B on the phone will prove it.
- Code comments cite `plans/barcode-recovery-2026-09-05.md`, which is gitignored (existing convention for this repo's plans).
