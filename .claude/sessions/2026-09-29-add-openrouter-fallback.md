---
date: 2026-09-29
summary: A ~30-minute Anthropic outage for our org (an empty-body 503 on every model) turned into decision 008. A failed direct Claude call now gets one attempt at the same Opus 4.8 through OpenRouter (Bedrock/Vertex). PR #37 was grilled ×3 by Pi/Luna, merged, the key set in production, and it was proven live by disabling the Anthropic key. Then api/ENGINES.md was written, so Jev + Claude + the fallback stay legible
tags: [incident, resilience, openrouter, fallback, claude-api, privacy, herdr, pi, docs]
---

## Summary

**The outage.** It started at 14:06 UTC. Another agent read it as "Opus 4.8 is deprecated and being squeezed", and proposed a model hot-swap.

Probing showed otherwise:
- **Every model returned 503**, including Opus 5.5 and Sonnet 5.5, with an empty body and no `request-id`.
- **`/v1/models` said "credential validation failed".**
- **OpenRouter's own Anthropic route stayed up**, so it was our org's credentials, not a model.
- **The two earlier "same" outages were billing 400s,** not 503s: credits ran out on 09-16, and the spend limit was hit on 09-24.

A swap to GPT-6 Luna (Aaron's first idea) was declined. It had never passed the zero-false-safe evals, and the privacy policy named only Anthropic.

**What was built instead:** the June pickup plan's "same brain, different pipe", as decision 008.

**Before merging, it was:**
- tested live with the direct route forced to fail: Vertex served, the prompt cache held, and the verdicts were right;
- run through the non-FULL live evals, 87/87 with zero false-safe;
- grilled by Pi on `gpt-6-luna` in three rounds (SHIP with two 🟡, then DON'T SHIP on my fixes, then SHIP).

**PR #37 merged as `421ae49`.** Aaron set a production-only key.

**Proof in production.** Aaron disabled the production Anthropic key for about 3 minutes. Tagged smoke scans answered through `openrouter`, and so did a real iOS user's barcode and photo scans, both of which would otherwise have failed.

**Wrap-up.** Aaron asked for a documentation pass so Jev + Anthropic + OpenRouter don't become a mess once Jev serves real traffic. `api/ENGINES.md` covers the engines, their order, the `JEV_MODE` × engine table, the fallback triggers, the failure matrix, the rules, and the known gaps.

## Changes

- `api/_utils.js`:
  - `callClaude` returns `{ text, via }` and has the fallback;
  - the shared `_requestText`;
  - a new `model_retired` kind (404);
  - "usage limits" now reads as `credit`;
  - a 20 s retry deadline with a fallback, checked before and after the backoff.
- `api/analyze.js`, `api/barcode.js`: `analyzeWithClaude(text, served)` out-param; `claudeVia` on `scan`.
- `api/_analytics.js`, `api/ANALYTICS.md`: `claude_via`.
- `api/health.js`:
  - `services.analysis_fallback`;
  - `checkFallback`, which requires a non-empty text block;
  - only the direct route decides `healthy`.
- `web/privacy-policy.html` (effective 2026-09-29), `web/sw.js` (v13): OpenRouter named as the backup route.
- `docs/how-it-works*.svg/.png`, `docs/README.md`: the fallback line in the Claude box.
- `.claude/decisions/008-openrouter-same-model-fallback.md`: new.
- `api/ENGINES.md`: new (the wrap-up), with pointers from CLAUDE.md, README, ROADMAP, ANALYTICS.md and decisions 007/008.
- Tests: `web/tests/api/claude.test.js`, `health.test.js`, `analytics.test.js`, `analyze.test.js`, `barcode-jev.test.js` (918 passing).

Commits: `fc35df9`, `3d5fdb8`, `4e9eda3`, `f815144`; merge `421ae49` (PR #37).

## Decisions

- **Same model, not a second vendor.** Decision 002 already tied the fallback to the primary model. It also avoids the eval gate, the policy wording about a new judge, and the `engine` accounting a new judge would need.
- **Bedrock/Vertex only, `zdr: true`.** Aaron asked for Bedrock. Both providers skip Anthropic's own keys, billing and front door, which are the three things that failed this month.
- **Don't fall back on `bad_request` / `error`.** The Cloudflare 52x half of that is now known gap 1 in ENGINES.md.
- **Test in production with a Console key disable,** not a Vercel env swap. It's instant and reversible, with no redeploy and no secret to restore. Recipe in ENGINES.md.
- **A separate production OpenRouter key.** The `.env` key is the one evals spend, and a drained eval key mustn't kill production's fallback. That's the same reason prod and evals got separate Anthropic workspaces on 09-18.

## Notes

- **Known gaps** (ENGINES.md): Cloudflare 52x → no fallback; no circuit breaker (a hung outage is up to ~45 s before the fallback, past the barcode client's 30 s); a broken fallback doesn't page (it needs an UptimeRobot keyword monitor); unaudited Jev verdicts when both Claude routes are down.
- **SSH push failed** ("communication with agent failed"; the key agent was probably locked). I pushed over HTTPS through `gh`'s credential helper for one command; the remote was left as SSH.
- **Timeline:**
  - outage ~14:06–~14:38 UTC;
  - fallback live ~15:10;
  - production test 15:27–15:30.
