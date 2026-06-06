---
date: 2026-06-06
summary: Reviewed and merged PostHog scan-event analytics (PR #13); reconciled docs
tags: [analytics, posthog, review, merge, docs]
---

## Summary
Reviewed PR #13 (PostHog scan-event analytics across web + iOS), verified the
web/backend suite green (80/80) in a throwaway worktree, and squash-merged it to
`main` (96411ed). Added the iOS `X-Client: ios` analytics note to the release
runbook and reconciled the structure trees in CLAUDE.md + README.md, which the PR
had left without the new `api/_analytics.js`. Deleted the merged branch + its local
worktree.

## Changes
- `mobile/RELEASE.md` — noted this build is the first to send `X-Client: ios`
  (flips iOS scans from `platform: unknown` → `platform: ios` in PostHog); added a
  post-release attribution check (commit 1b60065).
- `CLAUDE.md`, `README.md` — added the missing `api/_analytics.js` line to both
  `api/` structure trees (post-`/wrap-up` doc reconciliation).
- Merged: PR #13 (96411ed) — adds `api/_analytics.js`, `posthog-node` dep,
  `X-Client` headers (web + iOS), `POSTHOG_API_KEY`/`POSTHOG_HOST` env vars.

## Decisions
- Squash-merge (single clean commit on the branch).
- Did not auto-commit the RELEASE.md edit until the user confirmed via `/ship`;
  rebased local `main` onto the #13 merge before pushing.

## Notes
- **Step 1 (set `POSTHOG_API_KEY` in Vercel prod) is done** — analytics is live.
  Until the next iOS App Store build ships, installed iOS apps report
  `platform: unknown`; `method: barcode` is a clean iOS tell in the interim.
- Mobile Jest suite was not run this session (the PR's two-line `api.ts` header
  change); it's covered by `npm test` in RELEASE.md step 1 before the next build.
