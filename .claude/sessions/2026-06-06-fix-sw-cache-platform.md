---
date: 2026-06-06
summary: Verified PostHog scan analytics end-to-end; fixed stale SW cache so web scans report platform; added platform-breakdown dashboard insight
tags: [posthog, analytics, service-worker, pwa, web]
---

## Summary

Validated the newly-added PostHog scan-event analytics against live test events and
caught one bug: web scans were reporting `platform: unknown` instead of `web`. Root
cause was a stale service-worker cache — the PostHog commit added the `X-Client: web`
header to `web/js/api.js` but didn't bump `CACHE_NAME`, so returning PWA users kept
serving the cached pre-PostHog `api.js`. Fixed, verified live, and built a
"Scans by platform" insight on the PostHog dashboard.

## Changes

- `web/sw.js` — bumped `CACHE_NAME` `glutenornot-v3` → `v4` so returning PWA users
  evict the stale `api.js` and pick up the version that sends `X-Client: web`.
- PostHog (external, not in repo) — created "Scans by platform" insight
  (`short_id: L4gKuTnk`), daily `scan` count broken down by the `platform` event
  property, pinned to "My App Dashboard" (id `1678176`).

Commit: `7276b0c` (pushed to `origin/main`).

## Decisions

- Fixed via cache-version bump rather than changing the SW fetch strategy. The SW
  passes API requests straight through (`fetch(request)`), so headers were never the
  problem — only the cached *client code* that sets them. A version bump is the
  documented mechanism (`sw.js` header comment) and the minimal fix.

## Notes

- Verified live: the scan at 18:47 UTC reported `platform: web`; the 18:45 scan was
  still `unknown` (one-page-load delay while the new SW installed before serving fresh
  `api.js`). Expected PWA propagation behavior.
- iOS reports `platform: unknown` until the next App Store build propagates — the
  `X-Client: ios` header is already in `mobile/services/api.ts` (both OCR and barcode
  paths), so the pending iOS release closes that gap. No iOS code change needed.
- Two uncommitted doc edits (`CLAUDE.md`, `README.md` — adding the `_analytics.js`
  line to the file-tree) predate this session and were left untouched.
