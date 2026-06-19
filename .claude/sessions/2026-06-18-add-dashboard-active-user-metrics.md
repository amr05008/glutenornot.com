---
date: 2026-06-18
summary: Built scan-based active-user + composition metrics on the PostHog "My App Dashboard"; audited it for gaps
tags: [analytics, posthog, dashboard]
---

## Summary
Stood up a weekly-active-users chart on the PostHog "My App Dashboard" (id 1678176), then audited the dashboard for missing data slices and built out the highest-signal batch. The recurring theme: the PostHog starter tiles measure `$pageview`/`$screen` (anyone who *loads* the app), but for this product the meaningful activity signal is the `scan` event — so several tiles were replaced/retargeted to `scan`. All work was in PostHog via MCP; **no repo code changed**.

## Changes
PostHog only (project 457245, dashboard 1678176):
- **Added** Weekly active users (scan) — `Nm4LYOzM` (unique scan users/week, 90d line)
- **Deleted** the generic pageview/screen "Weekly active users (WAUs)" starter tile
- **Added** Total scans per week — `HGrOofcp` (top-line volume line, 90d)
- **Added** Scans by method — `nCB8OEzJ` (barcode vs ocr, pie, all-time)
- **Added** Scans by mode — `z4ZwEjFd` (label vs menu, pie, all-time)
- **Retargeted** Retention — `pz0wfWGN` ($pageview → scan, weekly first-time)
- **Retargeted** Growth accounting — `o0TIlWPp` ($pageview → scan, lifecycle/week)

Repo:
- Wrote machine-local memory `posthog-insight-update-detaches-dashboards.md` (not git-tracked).

## Decisions
- **Scan-based over pageview-based metrics.** A pageview isn't engagement for this app; a `scan` is. Active-user, retention, and growth tiles should all key off `scan`. Left the generic DAU tile in place for now but it has the same flaw.
- **WAU = unique `scan` users bucketed by week** (interval=week + `dau` math), not PostHog's rolling-7-day `weekly_active` math — cleaner/unambiguous for a dashboard.
- Composition slices (method/mode) rendered as all-time pies to match the existing "Scans by verdict" pie.

## Notes
- **Gotcha hit:** `insight-update` without the `dashboards` field detaches the insight from all dashboards. Caught on verification, re-attached both retargeted tiles (original tile IDs restored). Saved to memory.
- **Single-value until volume arrives:** `method` is all `ocr`, `mode` all `label`, `data_source` only `openfoodfacts` — those pies look single-slice until barcode/menu/fallback usage shows up.
- **Open items from the audit (not yet built):**
  1. Scans-per-active-user (engagement intensity: total scans ÷ unique users)
  2. Non-English share via `detected_language` (only `fr` so far; validates the multilingual/traveler investment)
  3. **Confirm whether failed scans are captured at all** — only successful `scan` events + `$exception` (Sentry) are visible; no success/error-rate tile possible until failures emit something. This is the reliability blind spot that would've surfaced the retired-model outage.
