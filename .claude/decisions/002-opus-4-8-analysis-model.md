# 002 — Analysis model: Opus 4.8 (supersedes the 2026-06-18 "stay on Sonnet" call)

**Date**: 2026-07-19
**Status**: Accepted (Aaron's call, 2026-07-19)

## Context

The 2026-06-18 retired-model fix deliberately stayed on Sonnet for cost/latency
(`.claude/sessions/2026-06-18-*`). Two things changed:

1. The analysis-resilience plan (claude-channels
   `plans/glutenornot-openrouter-fallback-2026-06.md`, revised 2026-07-19) pins
   the OpenRouter fallback to the *same model* as the primary — "same brain,
   different pipe" — which dissolves the celiac false-safe eval gate for hop 1.
   Picking the primary model is therefore also picking the fallback model.
2. Opus-tier quality headroom on a celiac-safety verdict is worth paying for
   now that cost is bounded: the 50-scans/day rate limit caps worst-case spend,
   and at ~$5/$25 per MTok vs Sonnet 4.6's $3/$15 (plus the Opus 4.7+
   tokenizer's ~1–1.35× counts) the per-scan cost is roughly 1.7–2.25× — cents
   either way at current volume (~31 users, ~81% of 50-scan cap unused).

## Decision

Pin `CLAUDE_MODEL = 'claude-opus-4-8'` in `api/_utils.js` (PR #18), with the
OpenRouter fallback (when built) targeting the same model.

## Trade-offs accepted

- **Latency**: Opus is slower than Sonnet; "optimize for in-store use" still
  holds. Accepted for verdict quality; revisit if scan-duration complaints or
  timeout-rate changes show up in the weekly data review.
- **Cost**: bounded by the rate limit as above.

## Validation

7-case frozen A/B (real `CLAUDE_PROMPT` + `parseClaudeResponse`, live API,
Sonnet 4.6 vs Opus 4.8): identical verdicts on all label cases, zero
false-safe regressions; menus stricter (bread/pasta flagged) — the
conservative direction the guidelines require.

## Retirement watch

Opus 4.8 has no announced deprecation/retirement date (checked 2026-07-19).
Nothing to calendar; the deep health canary (`/api/health?deep=1`) pings the
live pin and the external uptime monitor alerts on failure, so a surprise
retirement surfaces within minutes.
