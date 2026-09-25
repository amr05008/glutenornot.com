---
date: 2026-09-24
summary: Took Aaron's "use Jev to fix barcode speed" from question to production. Measured the problem (PostHog/Sentry), found fast mode unavailable and Haiku 4.5 unsafe, ran a 996-product bake-off (jev-sandbox exp 07) where Jev + code rules agreed with Opus 99.7% on unseen data at 0.20 s vs 3.03 s, then shipped decision 007 as a staged, audited fast path (PR #35). Shadow mode live 2026-09-25 with alerts, a dashboard and a weekly email
tags: [jev, latency, bake-off, evals, rollout, posthog, vercel, herdr, incident]
---

## Summary

Aaron asked whether TypeSafe's Jev could fix barcode scans taking 3–5 s.

**The data:**
- 70% of scans are barcode, and people scan in runs (median gap 16 s).
- Claude is ~90% of the server time.
- No failures come from slowness.

**Fast mode** is Opus 4.8 on the same model, and would have been the lowest-risk lever. It isn't enabled for the org.

**The bake-off.** Opus 4.8 against Haiku 4.5 against Jev + code rules, on the scanner's 30 frozen cases and 996 real Open Food Facts records:
- **Haiku is out.** It called a self-contradicting record safe 5/5 times.
- **Jev v1 had five false safes,** all on non-lists or truncated lists.
- **v2 added list-quality questions,** tuned on items 1–200 and graded on 201–996. It scored 99.7% agreement, 51% settled, and one false safe.
- **That false safe was the app's `isGlutenFamilyTag` missing `en:Glutine`.**

Aaron chose a staged launch over another offline round.

**PR #35 shipped the fast path with `JEV_MODE` off**, after:
- a build session in a Herdr tab;
- two grills and my review;
- a Pi `gpt-6-sol` grill;
- the one Jev-only FULL run: 0 settled false-safe on 40 cases.

Shadow mode then went live, and was verified end to end.

**A mid-session production outage (~14:30–15:13 UTC, 2026-09-24):**
- **Cause:** the org monthly spend limit ($60) was hit, which blocked every Claude call.
- **How it was found:** by my fast-mode probe. No user was affected.
- **Fix:** Aaron raised the limit to $100.

## Changes

- **PR #35** (`b2bb056`…`0e47574`, merged as `db196c8`):
  - `api/_jev.js` and the fast path in `api/barcode.js` (gates, `decideFastPath`, the `JEV_MODE` switch, the Claude audit via `waitUntil`);
  - `api/_analytics.js` (`engine`, `jev_*`, barcode `lookup_ms`/`claude_ms`/`total_ms`, `engine_audit`);
  - `api/health.js`, the privacy policy and SW v12, decision 007, both diagrams, and the docs;
  - 888 tests, plus a Jev live eval.
- **This wrap-up (docs PR):** CLAUDE.md, ROADMAP.md, `api/ANALYTICS.md` (the alerts as built, and the dashboard), and the plan's status.
- **Outside the repo:**
  - Vercel: `TYPESAFE_API_KEY` (Production), `JEV_MODE=shadow`, and a redeploy via the Vercel MCP.
  - PostHog: alerts `arpKoP2Y` and `knnH9HjY`, dashboard 2133661, and email subscription 153640.
- **jev-sandbox exp 07:** the harness, D1/D2 runs and the v2 questions.
- **Local plans** (gitignored): `barcode-speed-2026-09-24.md`, `barcode-bakeoff-2026-09-24.md` (the full evidence), `jev-fast-path-brief-2026-09-24.md` and `jev-remaining-2026-09-25.md` (the pick-up checklist).

## Decisions

- **Scope:** barcode path and Open Food Facts records only, with Claude on every scan. The Jev verdict is served at once and Claude finishes as the audit, so Anthropic spend is unchanged.
- **Trust is staged:** shadow, then `unsafe` only, then `full`.
  - **Stage 2 needs** the F4 gate (≥50 shadowed Jev safes over ≥3 weeks, 0 disputed) and a local product-name meat check.
  - **Jev doesn't read the name.** A "Chicken Broth" record whose list doesn't name the meat can get a fast safe. Pi confirmed this live.
- **No v3 offline re-grade:** the last miss was a deterministic tag parser, fixed by a fail-closed tag allowlist and unit tests.
- **Privacy (T5):** proceed without TypeSafe's retention answer. There are no accounts, and only public-database ingredient text is sent.

## Notes

- **Exclude these test scans from reads** (all from Aaron's own network):
  - 2026-09-24 15:11:02 (the `claude_error`) and 15:14:50;
  - 2026-09-25 01:51:38, 02:02:27–33, and 02:05–02:08 (Aaron's device, app 1.5.0).
- **The Pi grill's first DON'T SHIP came from my brief.** I paraphrased the privacy rule as "no barcode in any log", and the real rule covers analytics only. Quote rules verbatim in reviewer briefs.
- **Open Food Facts rate-limits bulk reads** (a 429 at 1 request/s), and `lookupOpenFoodFacts` reads a 429 as not-found. Tracked as a follow-up.
