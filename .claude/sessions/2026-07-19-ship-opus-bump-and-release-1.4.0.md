---
date: 2026-07-19
summary: Model bump to Opus 4.8 (PR #18), capture-assist Phase 2 (PR #19), iOS 1.4.0 released — TestFlight caught the torch settle quirk
tags: [release, ios, model-bump, torch, beacon, analytics, privacy]
---

## Summary

Executed the prioritized plan from the repo assessment review: bumped the
analysis model Sonnet 4.6 → Opus 4.8 (PR #18, Phase 0 of the OpenRouter
fallback plan), built capture-assist Phase 2 (PR #19: torch +
flashlight-retry, `/api/track` client failure beacon, `__DEV__` log gating),
and shipped iOS 1.4.0 (build 2, phased release). TestFlight build 1 caught a
real device quirk jest couldn't: `enableTorch` transitions are silently
dropped while the camera session settles — fixed with a 750ms settle window.

## Changes

- **PR #18** (0745bc6, 6ebb065): `CLAUDE_MODEL` → `claude-opus-4-8`;
  first-text-block extraction; maxTokens doubled (4096/2048, tokenizer
  ~1–1.35×); `stop_reason: max_tokens` truncation warning (was a silent
  caution-fallback 200); decision record 002. Validated on a 7-case frozen
  A/B — zero false-safe regressions; menus stricter (correct direction).
- **PR #19** (0eeb168): torch glyph/toggle/`enableTorch`; "Turn on flashlight
  & retry" primary on the couldn't-read screen (falls back to "Try again"
  when torch already on); `POST /api/track` beacon (timeout/network
  allowlist, own per-IP rate limit — never the scan quota, structurally
  cannot emit `scan`); fire-and-forget client calls; `__DEV__` gating on all
  scan-content logs (Sentry breadcrumbs carry console output in release).
- **Torch hardening** (369a5f5 then 0a360a0): first the cameraReady gate,
  then — after TestFlight disproved it — the settle window
  (`TORCH_SETTLE_MS = 750`): torch reaches CameraView only after the camera
  has been ready 750ms; manual toggles stay instant past the window.
- **Release**: version lockstep 1.4.0 (fead058), prebuild + MARKETING_VERSION
  patch + sentry.properties, build 2 submitted 2026-07-19, tag `v1.4.0` +
  GitHub release. RELEASE.md: quirk documented, pending block cleared.

## Decisions

- **Opus 4.8 as the analysis model** — supersedes 2026-06-18 "stay on
  Sonnet"; see `.claude/decisions/002-opus-4-8-analysis-model.md`.
- **Beacon fires only from fetch-level timeout/network paths** — not the
  pre-flight offline check (those requests were never sent; a hard-offline
  beacon can't deliver).
- **Auto-retry deferred to 1.4.1** (per plan scope), riding with the
  data-driven blur/framing fork decision and (proposed) `torch_used` scan
  property to measure flashlight effectiveness.
- **Torch quirk workaround over refactor** — settle-window emulation of
  human-toggle timing, not keeping the camera mounted under overlays; the
  constant (`TORCH_SETTLE_MS`) is the first knob if a device still drops it.

## Notes

- **Data hygiene**: 2026-07-19 scans include my A/B probes (14 label/menu
  calls direct to Anthropic — not in PostHog) and Aaron's TestFlight smoke
  scans (`platform: ios`) — exclude the day from the next weekly review.
- **Double-count caveat now live**: a client timeout can yield both a server
  `scan` and a beacon `scan_failed` for one attempt (documented in CLAUDE.md
  + ROADMAP reconcile item).
- **Watch items post-release**: Sentry `glutenornot-mobile` for new
  error-level issues; first beacon `scan_failed` events (reason
  timeout/network) arriving in PostHog; verdict mix may tilt toward caution
  on menus (Opus 4.8 is stricter — expected, not a regression); the 4-week
  `ocr_failed <15%` clock starts at 1.4.0 adoption, and the Phase 4 `image_kb`
  fork query is due ~2026-08-01.
- Two grill cycles (fresh-eyes subagents) ran this session: PR #18
  (DON'T SHIP → fixed: truncation visibility, decision record) and PR #19
  (SHIP + fixes: beacon rate limit, double-count docs). Both dispositions
  are in the PR comments/bodies.
