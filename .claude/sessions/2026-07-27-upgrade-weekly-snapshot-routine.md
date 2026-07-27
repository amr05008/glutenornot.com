---
date: 2026-07-27
summary: Upgraded the weekly health snapshot cloud routine — PostHog via personal API key + analyst layer
tags: [routine, posthog, analytics, cloud-agent]
---

## Summary
Upgraded the "GlutenOrNot weekly health snapshot" cloud routine (trig_01Lwf4a9hwaUSrWgu7VcqoWW, Mondays 11:00 UTC) per the plan agreed in #glutenornot. PostHog data now comes from direct query-API curl calls authenticated with a read/query-scoped personal API key (PostHog isn't an attachable MCP connector for cloud routines, so the old "find MCP tools or skip" path could silently produce Sentry-only weeks). Added an analyst layer: 14-day queries with a this_week/last_week split feed week-over-week deltas, pattern/anomaly flags, and 1–3 prioritized recommendations posted as a second Discord message.

## Changes
- No repo files changed — the routine prompt lives in cloud config (updated via RemoteTrigger). `reports/weekly-snapshot/README.md` still governs the artifact page, which is unchanged.
- Triggered a one-off test run (session cse_01453jAJbCLpBkV7kzPtBLKv) to validate end-to-end.

## Decisions
- Analyst read is Discord-only; the artifact template contract stays untouched.
- PostHog failure now aborts loudly (retry once → ⚠️ to Discord → stop); Sentry MCP failure degrades with a ⚠️ but does not abort.
- Prompt explicitly lists known non-anomalies the analyst must not flag: caution-heavy verdicts (by design) and the timeout/scan double-count overlap.

## Notes
- Key is embedded in the routine prompt as a secret (never printed in routine output), same treatment as the Discord webhook. Rotating it means updating the routine prompt.

## Follow-up (same day): cluster investigation + triage rule
The test run's analyst read flagged an OCR failure spike (19/65, 11 on Jul 20). Person-level drill-down from this Mac showed the Jul 20 cluster was entirely non-user traffic: Aaron's 1.4.0 RC testing (Brooklyn, 13 ok + 6 miss) plus an Apple reviewer (Cupertino, 5 failure-only scans, tiny 39–125 KB images). Real-user OCR failure rate ≈ 16% (8/50), not 29%. Ran the image_kb fork query early: successes never dip below ~200 KB; all real-user failures had healthy-sized images with ocr_chars 0 → aiming/framing, not blur → fork leans "framing guidance, skip blur detection" (confirm ~Aug 1 with post-1.4.0 data). Also confirmed via iTunes lookup that 1.4.0 went live 2026-07-20 15:15 UTC (phased).

Second routine update: added a CLUSTER TRIAGE step to the analyst read — before flagging a failure spike, drill down per person (count, success/failure mix, geo city) and exclude the two known non-user profiles (Cupertino failure-only = App Store review; Aaron's RC-testing bursts), quoting rates with and without them. Person ids stay out of Discord posts.
