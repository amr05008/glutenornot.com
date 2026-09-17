---
date: 2026-09-16
summary: After the afternoon's live-eval loop emptied the org's Anthropic credits (nine FULL runs in 50 minutes, ~$22, app down 4:53–5:38 PM), put brakes on the harness and cut the per-call cost — prompt caching on both Claude call sites (verified live), single-sample default + FULL=1 merge gate + one-hour cooldown in the runners, an `ask` permission rule on the key-loading commands, and the rule in CLAUDE.md; PR opened, not merged
tags: [cost, evals, prompt-caching, permissions, incident]
---

## Summary

The credit outage's root cause was found in the claude-channels session (`plans/anthropic-credit-outage-2026-09-16.md` there): the PR #29 session ran `RUN_LIVE_EVALS=1 … tests/api/evals` — 165 Opus 4.8 calls at ~6.2K uncached input tokens each — five times in full plus four subsets, and the Herdr grill agent in the same checkout could run it too. The balance had been draining since the May 11 top-up and the only alert was a monthly-spend one, so the "warning" arrived nine minutes before the shutoff. This session is the code half of the fix; the Console half (workspaces, limits, auto-reload) is Aaron's.

## Changes

- `api/_utils.js` — `buildCachedContent(staticText, dynamicText)`: the static prompt as its own text block with `cache_control: ephemeral`, the per-request text after it. `callClaude` already passed `content` through, so the client is untouched.
- `api/analyze.js`, `api/barcode.js` — `analyzeWithClaude` sends `CLAUDE_PROMPT` through it. Live check (one pair of calls, the only live calls this session): call 1 `input_tokens 45, cache_creation 6078`; call 2 `input_tokens 43, cache_read 6078`. `count_tokens` (free): OCR prompt 6,080, barcode prompt 2,339 — both above Opus 4.8's 1,024 minimum.
- `web/tests/api/evals/guard.js` (+ `guard.test.js`, 15 offline tests) — `sampleRuns` (1× default, 2×/5× under `FULL=1`), `countCalls`, `estimateUsd`, the one-hour FULL cooldown (`FORCE=1` overrides; one state file per runner in `web/.live-eval-state/`, gitignored, because vitest collects the two runners in separate workers at the same instant), and `guardLiveRun`, which prints the call count and estimate before the first call.
- `web/tests/api/evals/*.live.test.js` — runners take `RUNS` from the guard; headers carry the two commands and the real cost (FULL ≈ $1.50 cached / ≈ $6 uncached; the old header said "$2–3").
- `web/tests/api/{claude,analyze,barcode}.test.js` — request-shape tests: cache-marked first block byte-identical across scans, dynamic text second.
- `.claude/settings.json` (new, committed) — `permissions.ask` on `Bash(*--env-file*)` and `Bash(*RUN_LIVE_EVALS*)`, so any command that loads the production key or arms the live evals prompts a human, in compound commands and subshells too.
- `CLAUDE.md` — the rule: iterate single-sample / `-t`, one FULL run per PR before merge with a human approving, the review agent never runs live evals.
- `.gitignore` — `web/.live-eval-state/`.

## Decisions

- **Cache breakpoint on a user content block, not a `system` block.** Moving the prompt to `system` is the canonical shape but changes what the model sees, and proving it changes nothing costs a FULL eval run. Two adjacent text blocks render essentially as the old single string, so the merge gate's evidence carries over. A `system`-block move is a follow-up that needs one approved FULL run.
- **Guard at collection time, not per test.** `describe.concurrent` fires every case at once; a check inside `it` would already be too late. Throwing from module scope fails the file before any request.
- **Record the FULL run at start.** A run that dies half-way still counts against the hour (that is what `FORCE=1` is for); recording at the end would let a crash loop re-run for free.
- **Caching in production is a wash on lone scans and a win on sessions.** A single scan more than five minutes from the last pays the 1.25× write; a burst pays one write and then 0.1× reads. Real usage is bursts (today: 5–10 scans within minutes from one device), and the eval suite is dense by construction, so net positive; either way production is ~$3–5/month.

## Notes

- Permission rules load at session start; the `ask` rules apply to sessions started after this lands. Claude Code strips a leading `VAR=1` before matching, which is why the rule is on `--env-file` (the thing that actually loads the key) and on a wildcard `RUN_LIVE_EVALS`, not on the assignment form alone. Worth one manual check: ask Claude to run `echo RUN_LIVE_EVALS=1` and confirm it prompts.
- A Pi/Herdr agent does not read `.claude/settings.json`; for it the harness guard (cooldown + FULL gate) and the CLAUDE.md rule are the brakes.
- Grill (inline, no fresh-eyes subagent available in the fork): found the shared-state-file race between vitest workers, the unverified barcode-prompt cacheability, and the `-t` over-estimate — all fixed here.
