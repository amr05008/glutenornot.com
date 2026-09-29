# 008 — When the direct Claude call fails, the same model answers through OpenRouter

**Date**: 2026-09-29
**Status**: Accepted (Aaron, 2026-09-29, during the third direct-route outage: "proceed with opus through bedrock fallback PR"). Off until `OPENROUTER_API_KEY` is set in Vercel.
**Related**: decision 002 (picking the primary model also picks the fallback model); the pickup plan `claude-channels/plans/glutenornot-openrouter-fallback-2026-06.md` (revised 2026-07-19), which this implements with the changes below

## Context

Every verdict goes through one Claude call on one Anthropic org. Three times in
two weeks, that call failed on every scan while the app itself was up:

| When (UTC) | What Anthropic returned | Cause |
|---|---|---|
| 2026-09-16 19:52–21:36 | 400 "credit balance" | prepaid credits ran out |
| 2026-09-24 ~14:30, 41 min | 400 "specified API usage limits" | org spend limit |
| 2026-09-29 14:06–~14:38 | 503, empty body, on every model; `/v1/models` said "credential validation failed" | our org's API credentials (OpenRouter's own Anthropic route stayed up) |

A second Claude model on the same org wouldn't have survived any of the three,
because each one failed before a model was chosen. A non-Anthropic model would
survive them, but it needs the full zero-false-safe eval gate and would give
different verdicts.

## Decision

1. **Same model, different pipe.** `callClaude` (`api/_utils.js`) tries
   Anthropic directly, as before. If that fails, it makes one attempt at
   `anthropic/claude-opus-4.8` through OpenRouter's Anthropic-compatible
   `POST /api/v1/messages`, with the same messages and the same prompt-cache
   breakpoint. Same weights and same prompt, so the verdict rules (003–006) and
   their evals hold, and no eval gate applies to this hop. A test keeps
   `OPENROUTER_MODEL` paired with `CLAUDE_MODEL`.
2. **Bedrock and Vertex only** (`provider.only: ['amazon-bedrock',
   'google-vertex']`). Neither goes through Anthropic's keys, billing or front
   door. Also `data_collection: 'deny'` and `zdr: true`: only providers that
   don't keep prompts. The plan had left routing on OpenRouter's defaults;
   Aaron asked for Bedrock.
3. **What triggers it:** `overloaded` (after retries), `auth`, `credit`,
   `model_retired` (a new kind for 404) and `empty`. It doesn't trigger on
   `bad_request` or `error`, because our own malformed request fails on any
   pipe. A 400 "usage limits" now classifies as `credit`; it used to read as
   `bad_request`.
4. **Timing:** with a fallback key set, Anthropic retries stop at 20 s instead
   of 45 s. That way the fallback's one 25 s attempt fits inside the old worst
   case of 70 s.
5. **If both routes fail,** the caller gets Anthropic's error, so the client
   message and `scan_failed` reason are unchanged. The fallback's error is
   logged.
6. **Nothing is silent:**
   - every activation logs `Claude served via OpenRouter fallback`, naming the
     provider and the primary error;
   - `scan` events carry `claude_via` (`anthropic` | `openrouter`);
   - the deep health check pings the fallback on every run, but only the
     direct route decides `healthy`. So the uptime monitor still pages on a
     direct outage while the fallback serves.

## Trade-offs accepted

- **A new processor.** Ingredient text reaches OpenRouter, plus AWS or Google,
  when the fallback fires. The privacy policy names this (2026-09-29).
- **Cost:** Bedrock and Vertex list Opus 4.8 at Anthropic's price, plus
  OpenRouter's credit fee. Only failures pay it, plus the health ping (1 output
  token every 5 minutes).
- **Latency on fallback scans:** up to 20 s of failed direct attempts come
  first. A fast failure, like today's 503 in ~2 s ×3, adds ~7 s.
- **Not covered:** the model itself down on every provider, or OpenRouter
  dropping the slug. The deep-check ping shows either.

## Changing it

Changing `CLAUDE_MODEL` means changing `OPENROUTER_MODEL` too (the pairing
test fails otherwise). Check the new slug has Bedrock or Vertex endpoints:
`GET https://openrouter.ai/api/v1/models/<slug>/endpoints`.
