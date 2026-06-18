---
date: 2026-06-18
summary: Fixed a production analysis outage caused by a retired Claude model, then added proactive outage detection (deep health check + uptime monitor + Sentry alert)
tags: [incident, api, claude, monitoring, health-check, sentry, uptimerobot]
---

## Summary
The app's only Claude model, `claude-sonnet-4-20250514`, hit its scheduled Anthropic retirement on 2026-06-15 and began returning HTTP 404, which surfaced as `CLAUDE_ERROR` → 503 "analysis service temporarily unavailable" on both the OCR and barcode paths. It ran ~14h hitting 7–10 users before being noticed by chance (Sentry GLUTENORNOT-MOBILE-2). Fixed with a one-line model swap to `claude-sonnet-4-6`, then built a detection net so the next external-dependency break alerts us within minutes instead of going unnoticed.

## Changes
- `api/_utils.js` — `CLAUDE_MODEL`: `claude-sonnet-4-20250514` → `claude-sonnet-4-6` (the outage fix; shared by analyze + barcode). Commit `8a207ef`.
- `api/health.js` — added a secret-gated **deep mode** (`?deep=1` + `HEALTH_CHECK_TOKEN`, accepted via `x-health-token` header or `?token=`). It pings the live model (`max_tokens:1`) and returns 503 with the upstream status (e.g. `404 not_found_error`) when the model is retired/unreachable or the key is invalid. Shallow key-presence check unchanged. 20s ping timeout. Commits `783ef30`, `c342b67`, `bc6508a`.
- `web/tests/api/health.test.js` — new; 13 tests covering ok/404/401/network/timeout pings, gating (wrong/no token → 401, disabled until token set), shallow back-compat, and the Vision-missing branch. Suite 94 → 107.
- `.env.example`, `CLAUDE.md` — documented `HEALTH_CHECK_TOKEN`.

## Decisions
- **Stay on Sonnet, don't upgrade to Opus.** The app deliberately runs Sonnet (cost/latency); the correct fix for a retired model is its drop-in successor, `claude-sonnet-4-6`.
- **Detection = deep health endpoint + external uptime monitor, not Vercel Cron.** External (UptimeRobot free) also catches Vercel being down and sidesteps Hobby's no-sub-daily-cron limit. Monitor hits `?deep=1` and alerts on **absence of `"status":"ok"`** (this also catches a silently-disabled canary if the token drifts — HTTP-status-only alerting would miss that).
- **Minimal model ping, not full-path canary.** `max_tokens:1` ≈ $0.0000_4/ping (~$0.13–0.30/mo at 15/5-min); the full analysis path would be ~$117/mo for coverage of failure modes that weren't the problem.
- **20s ping timeout.** An initial 5s caused false-positive "timeout" 503s — real pings through Vercel cold-start at 2–6s. 20s clears normal latency; hard failures (404/401) return instantly.
- **Sentry alert is the secondary net.** Discord on Sentry is paid; the rule routes to email/in-app (recommend the Sentry mobile app for push). The UptimeRobot→Discord canary is the reliable primary. Key trigger: *resolved issue becomes unresolved* (catches the model breaking again).

## Notes
- **Track model retirement dates.** This was a *scheduled, knowable* event. When `CLAUDE_MODEL` changes, check platform.claude.com deprecations and calendar the retirement. Captured in auto-memory `claude-model-retirement-monitoring`.
- **Backend diagnosability gap (not yet fixed):** `analyze.js`/`barcode.js` still collapse upstream failures into a generic `CLAUDE_ERROR` and only `console.error` to Vercel logs — root cause needed a manual repro. The deep health check now surfaces the model's status, but reporting the real upstream status from the serverless functions to Sentry is a worthwhile follow-up.
- UptimeRobot free tier has no custom-header support, so the monitor passes the token via `?token=` in the URL (logged in UptimeRobot/Vercel/Discord; low-value token — can rotate via `openssl rand -hex 16` → update Vercel `HEALTH_CHECK_TOKEN` + redeploy + monitor URL).
- Verified end to end: 8/8 healthy deep pings, real DOWN/UP alerts delivered to Discord `#glutenornot`, GLUTENORNOT-MOBILE-2 resolved and quiet since the fix (Last Seen frozen at 01:06Z).
