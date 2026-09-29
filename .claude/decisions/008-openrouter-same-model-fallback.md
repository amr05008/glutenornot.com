# 008 — When the direct Claude call fails, the same model answers through OpenRouter

**Date**: 2026-09-29
**Status**: Accepted (Aaron, 2026-09-29, during the third direct-route outage: "proceed with opus through bedrock fallback PR"). PR #37 merged; `OPENROUTER_API_KEY` set in Vercel Production the same day and proven by disabling the Anthropic key (15:27–15:30 UTC). Watched by its own UptimeRobot monitor since PR #41, the same day.
**Related**: decision 002 (picking the primary model also picks the fallback model); the pickup plan `claude-channels/plans/glutenornot-openrouter-fallback-2026-06.md` (revised 2026-07-19), which this implements with the changes below; `api/ENGINES.md` (how the fallback combines with Jev, the failure matrix, known gaps)

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
   `bad_request`. A follow-up PR the same day made every 5xx `overloaded`, so
   Cloudflare's 520–527 in front of Anthropic retry and then fall back too;
   `error` is now any other non-OK status, which in practice means the other 4xx.
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
     direct outage while the fallback serves;
   - a second monitor watches the fallback alone on `?deep=1&check=fallback`
     (PR #41). A broken fallback pages too, and a direct outage doesn't read
     as a broken fallback. UptimeRobot marks a 503 as down even when the
     keyword is present, so the fallback couldn't share the `?deep=1` URL.

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

## Validation (2026-09-29, before the PR)

For each check the direct route was forced to fail with an invalid Anthropic
key, so every verdict came through the fallback:

- **Routing.** `zdr: true` with `data_collection: 'deny'` is accepted by
  both providers: a Bedrock-only ping returned 200 from Amazon Bedrock, a
  Vertex-only ping 200 from Google. With both allowed, OpenRouter picked
  Google every time.
- **Prompt cache.** It holds through the fallback: the first scan wrote 7,125
  tokens, each later scan read them. That's $0.048 for the first scan, then
  about $0.007 per scan.
- **Live evals.** The three Claude runners (`gf-claim`, `barcode-gf-claim`,
  `calibration`; non-FULL, 91 calls) passed 87 of 87 through the fallback,
  with no false-safe. All 91 were served by Google; none failed on both routes.
  A FULL run isn't this PR's gate, since no verdict rule changed.

## Changing it

Changing `CLAUDE_MODEL` means changing `OPENROUTER_MODEL` too (the pairing
test fails otherwise). Check the new slug has Bedrock or Vertex endpoints:
`GET https://openrouter.ai/api/v1/models/<slug>/endpoints`.
