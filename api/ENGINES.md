# Who answers a scan

Three engines can produce a verdict. This page covers:

- the order they run in;
- what each one may answer;
- what happens when any of them fails;
- where to look when something breaks.

Decision 007 explains why Jev exists, and decision 008 why the fallback exists. This page is how the two combine.

**Keep it current.** Update this page in the same PR as any change to:

- what a `JEV_MODE` serves;
- `callClaude`'s retry or fallback rules;
- the model a route calls;
- a new engine or route.

## The engines

| | Jev (fast path) | Claude, direct | Claude via OpenRouter (fallback) |
|---|---|---|---|
| **What** | TypeSafe `jev-1.13.0`: yes/no questions about an ingredient list, turned into a verdict by a code rule | Opus 4.8 on Anthropic's API (`CLAUDE_MODEL`) | **The same Opus 4.8** (`OPENROUTER_MODEL`), on Amazon Bedrock or Google Vertex |
| **Answers** | Only a clear `unsafe`, or in `full` mode a clear `safe`. Never `caution` | Every scan that reaches it | Only when the direct call fails |
| **Scans** | Open Food Facts barcodes that pass the code gates | Photos and barcodes | Photos and barcodes |
| **Code** | `api/_jev.js`, plus `fastPathGate` / `decideFastPath` / `runFastPath` in `api/barcode.js` | `callClaude` → `_callAnthropic` in `api/_utils.js` | `callClaude` in `api/_utils.js` |
| **Config** | `TYPESAFE_API_KEY` + `JEV_MODE` | `ANTHROPIC_API_KEY` | `OPENROUTER_API_KEY` |
| **Off switch** | `JEV_MODE=off`, then redeploy | none: it's the judge of record | remove the key, then redeploy |
| **Budget** | 800 ms, no retries, in parallel with Claude | 25 s per attempt, retries on overload | one 25 s attempt |
| **Data sent** | ingredient text only | ingredient text; for a barcode, also the product name | same as direct |

The two newer engines work on different axes, and that's what keeps this manageable:

- **Jev changes who judges.** It can answer before Claude, only where it's sure. Claude still runs on every scan and audits it.
- **The fallback changes how Claude is reached.** Same weights, same prompt, same verdict rules. A verdict through OpenRouter is a Claude verdict.

## Order of operations

**Photo:** Vision reads the text → `callClaude` (direct first, then the fallback on failure) → the safe floor and the ingredient-list gate → the verdict. Jev never sees photos.

**Barcode:**

1. The lookup waterfall runs: Open Food Facts → USDA → Nutritionix → UPCitemdb.
2. If there's no product or no ingredient data, the code answers with no engine (`result_reason: missing_context`).
3. Claude starts, through `callClaude`.
4. At the same time, when `JEV_MODE` isn't `off` and the record passes the code gates, Jev is asked. The handler waits up to 800 ms for it.
5. If Jev settles a verdict the mode serves, the response goes out now (`engine: jev`), and Claude finishes afterwards as the audit (`engine_audit`).
6. Otherwise the handler waits for Claude (`engine: claude`). A settled verdict the mode doesn't serve is audited too.

What each `JEV_MODE` serves when Jev settles:

| `JEV_MODE` | Jev settles `unsafe` | Jev settles `safe` | Jev falls through, times out or errors |
|---|---|---|---|
| `off` (default) | Jev is never asked | Jev is never asked | Claude |
| `shadow` (live since 2026-09-25) | Claude serves; audited | Claude serves; audited | Claude |
| `unsafe` (Stage 1) | **Jev serves**; Claude audits | Claude serves; audited | Claude |
| `full` (Stage 2, gated) | **Jev serves**; Claude audits | **Jev serves**; Claude audits | Claude |

## What triggers the fallback

This all happens inside `callClaude`, one scan at a time. There's no memory between scans.

| Direct response | Kind | Retried on Anthropic? | Falls back? |
|---|---|---|---|
| 429, any 5xx (including Cloudflare's 520–527 in front of `api.anthropic.com`), a network error, or a 25 s timeout | `overloaded` | yes | yes, once the retries are spent |
| 401 or 403, or no `ANTHROPIC_API_KEY` | `auth` | no | yes, at once |
| 400 whose body says "credit balance" or "usage limits" | `credit` | no | yes, at once |
| 404 | `model_retired` | no | yes, at once |
| 200 with no non-empty text block | `empty` | no | yes, at once |
| any other 400 | `bad_request` | no | **no**: our malformed request fails on any route |
| any other non-OK status: the other 4xx (402, 408, 409, 413, 422, …), or a 3xx fetch didn't follow | `error` | no | **no** |

- **Retries** apply to `overloaded` only:
  - at most 3 attempts;
  - backoff of 400 ms, then 800 ms, plus up to 150 ms of jitter.
- **The retry deadline** is 20 s with a fallback key set, 45 s without. It's checked before and after each backoff, so no attempt starts past it.
- **The fallback** makes one attempt, with no retry.
- **If the fallback also fails,** the caller gets the Anthropic error. The client message and the `scan_failed` reason (`claude_error`) are the same as without a fallback.

How long a scan waits before the fallback answers:

| How Anthropic fails | Wait |
|---|---|
| An instant 4xx (key, credits, spend limit, retired model) | about 0 s (proven in production on 2026-09-29) |
| Fast 503s, as on 2026-09-29 | about 7 s |
| Hung connections | up to about 45 s, then up to 25 s for the fallback: 70 s worst case |

## When something fails

| What's down | Photo scan | Barcode, Jev served (`unsafe` / `full`) | Barcode, Claude served | Signals |
|---|---|---|---|---|
| **Jev** (timeout, error, bad key, retired pin) | unaffected | Claude serves instead | unaffected | `jev_outcome` = `error` / `timeout`, or `skipped` with `jev_via = no_key`; alert `knnH9HjY` (daily) |
| **Anthropic direct** (fallback working) | served via OpenRouter | unaffected; the audit runs via OpenRouter, so the F5 tripwire stays armed | served via OpenRouter | direct monitor DOWN, fallback monitor UP; `claude_via = openrouter`; log `Claude served via OpenRouter fallback`; deep check `analysis_fallback.status: ok` |
| **Anthropic direct and OpenRouter** | error (`ANALYSIS_BUSY` / `UNAVAILABLE`) | **still served**; the audit records `claude_verdict = error`, which isn't a trip, so F5 is blind to these | error | both monitors DOWN; `scan_failed` with `reason = claude_error`; deep check `analysis_fallback.status: error` |
| **OpenRouter only** | unaffected | unaffected | unaffected | fallback monitor DOWN (`?deep=1&check=fallback`); deep check `analysis_fallback.status: error` |
| **Google Vision** | fails: OCR has no fallback | unaffected | unaffected | `scan_failed` on OCR |

## Rules that keep this from becoming a mess

1. **A Claude failure never widens what Jev serves.** Only `JEV_MODE` decides that. When Claude fails on both routes, a Jev verdict the mode doesn't serve is never promoted: the handler throws instead (`if (c.error) throw c.error`, `api/barcode.js`). Serving Jev during an outage would be a new decision, gated like decision 007's stages.
2. **The fallback is the same model as the direct route.** A test pairs `OPENROUTER_MODEL` with `CLAUDE_MODEL`. A different model there would be a new engine:
   - it needs the full zero-false-safe eval gate;
   - it gets its own `engine` value, never `claude`;
   - its verdicts should be marked lower confidence.
3. **`engine` says who judged; `claude_via` says how Claude was reached.**
   - Never encode a route in `engine`, or a judge in `claude_via`.
   - A new judge means a new `engine` value, plus updates to `ANALYTICS.md`, the privacy policy and this page.
   - A new route means a new `claude_via` value, and the same updates.
4. **Only the direct Claude route decides `healthy` in the deep check.** Jev and the fallback are reported there but never flip it. The fallback gets its own check, `?deep=1&check=fallback`, and its own monitor. So UptimeRobot pages on the one thing that makes every verdict slower or riskier.
5. **Every engine outside the judge of record can be switched off without a code change,** as in the off-switch row above. Changing `JEV_MODE` or either key takes effect only after a redeploy.
6. **Each engine's data exposure is in the privacy policy.** Jev gets ingredient text only. Claude, by either route, gets ingredient text, plus the product name for a barcode. Nothing else goes to any of them.
7. **Bumping a model moves both Claude routes.** Change `CLAUDE_MODEL`, then `OPENROUTER_MODEL`; the pairing test fails until both match. Then check that the new slug has Bedrock or Vertex endpoints: `GET https://openrouter.ai/api/v1/models/<slug>/endpoints`. A new Jev pin needs a re-grade (decision 007).

## Reading it

**Who answered scans:**

```sql
SELECT properties.method AS method,
       multiIf(properties.engine = 'jev', 'jev',
               properties.claude_via = 'openrouter', 'claude via openrouter',
               properties.claude_via = 'anthropic', 'claude direct',
               'no engine, or before 2026-09-29') AS answered_by,
       count() AS scans
FROM events
WHERE event = 'scan' AND timestamp > now() - INTERVAL 7 DAY
  AND coalesce(properties.app_version, '') NOT LIKE '%-rc%'
GROUP BY method, answered_by
ORDER BY scans DESC
```

- **No engine** means a barcode answered by code: no product, or no ingredient data.
- **Failures:** `scan_failed` with `reason = claude_error` means both Claude routes failed (or the direct route failed with a kind that doesn't fall back).
- **Jev's side:** `jev_outcome` / `jev_via` on `scan`, and the `engine_audit` events (`ANALYTICS.md`).
- **Health:**
  - Shallow `/api/health`: `services.fast_path` (`key`, `mode`) and `services.analysis_fallback` (`key`).
  - Deep `?deep=1` (needs the token): `analysis`, the direct ping, which decides `healthy`; and `analysis_fallback`, a real one-token reply through OpenRouter, for visibility only.
  - Fallback-only `?deep=1&check=fallback` (same token): pings OpenRouter alone, answering 200 or 503 on the fallback by itself. Anthropic isn't called.
  - **Uptime monitors** (UptimeRobot, keyword type, every 5 min; an incident starts when the keyword is missing):
    - direct: `"analysis":{"status":"ok"` on `?deep=1`;
    - fallback: `"analysis_fallback":{"key":"configured","status":"ok"` on `?deep=1&check=fallback`.

    `web/tests/api/health.test.js` pins both strings. Change the JSON shape and you must change the monitors. The direct keyword names `analysis`, so the fallback's `"status":"ok"` can't keep the direct monitor up during an outage.
  - The deep check doesn't ping Jev; its health is read from `jev_outcome`.
- **Proving the fallback in production:**
  1. Disable (don't archive) the production workspace's Anthropic key in the Console. It takes effect at once, and there's no redeploy or secret to restore.
  2. Run a scan tagged `x-client-version: 0.0.0-rc.smoke` on each path, and check for `claude_via = openrouter`.
  3. Re-enable the key.

  This was done on 2026-09-29, 15:27–15:30 UTC.

## Known gaps (2026-09-29)

1. **There's no circuit breaker.** Every scan tries Anthropic first. A hung-connection outage costs up to about 45 s before the fallback, which is past the barcode client's 30 s budget. Build a short "direct is down" flag only if `claude_ms` on `claude_via = openrouter` scans shows long waits.
2. **When both Claude routes are down, Jev-served verdicts go unaudited.** `claude_verdict = error` isn't an F5 trip. That only matters from Stage 1 on, and only for the outage window.
3. **`engine_audit` doesn't record `claude_via`.** Audits are the same model on either route, so agreement reads are unaffected. Add it if audits ever need route-level accounting.
4. **Vision has no fallback.** When OCR is down, photo scans fail, with no text to analyze.
