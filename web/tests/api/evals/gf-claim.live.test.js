/**
 * LIVE eval for the gluten-free label-claim rule — hits the real Anthropic API
 * through the real CLAUDE_PROMPT + callClaude + parseClaudeResponse path.
 *
 * Gated on RUN_LIVE_EVALS=1 so `npm test` stays offline (vitest's root is
 * `web`, so this file sits inside the default test glob). Run it with:
 *
 *   RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals
 *
 * Temperature is not pinned in callClaude (API default 1.0), so every case is
 * sampled more than once: "safe" cases 2× and must be safe on both; every
 * adversarial case ("caution" / "unsafe" / "not-safe") 5× and must never be
 * safe on any — six clean samples can't tell 0% from ~5% false-safe, ten can
 * at least see it. A single false safe on an adversarial case is a blocker
 * (plans/gf-label-claim-2026-08-28.md, step 5).
 *
 * Direct Anthropic calls only: no PostHog event, no scan-quota consumption.
 * 22 cases → 8 × 2 + 14 × 5 ≈ 86 Opus calls ≈ $2 per invocation.
 */
import { describe, it, afterAll } from 'vitest';
import { analyzeWithClaude } from '../../../../api/analyze.js';
import { GF_CLAIM_CASES } from './gf-claim-cases.js';

const LIVE = process.env.RUN_LIVE_EVALS === '1';
const RUNS = { safe: 2, caution: 5, unsafe: 5, 'not-safe': 5 };
// parseClaudeResponse degrades any parse failure to a caution with no `mode`
// and this explanation. That fallback must never count as evidence for a
// caution / not-safe expectation — a prompt edit that broke JSON output would
// otherwise pass most of the adversarial cases.
const FALLBACK_EXPLANATION = /Unable to fully analyze/;
// Safe-with-claim cases: the explanation has to name the label as the reason
// (definition of done — "with the claim named"), not just happen to say safe.
const NAMES_CLAIM = /gluten[\s-]*free|label|certif|GFCO|sin gluten|glutenvrij/i;
const results = [];

function passes({ expect, verdicts }) {
  if (expect === 'safe') return verdicts.every((v) => v === 'safe');
  if (expect === 'caution') return verdicts.every((v) => v === 'caution');
  if (expect === 'unsafe') return verdicts.every((v) => v === 'unsafe');
  // not-safe: caution or unsafe both pass; a safe never does
  return !verdicts.includes('safe');
}

describe.skipIf(!LIVE).concurrent('gf-claim live eval (real prompt, live Claude)', () => {
  for (const c of GF_CLAIM_CASES) {
    // Runs at collection even when skipped: a typo'd expectation would
    // otherwise mean zero runs and a vacuous pass.
    if (!(c.expect in RUNS)) throw new Error(`gf-claim case #${c.id}: unknown expect "${c.expect}"`);

    it(`#${c.id} expects ${c.expect}: ${c.why}`, { timeout: 180_000 }, async ({ expect }) => {
      const runs = await Promise.all(
        Array.from({ length: RUNS[c.expect] }, () => analyzeWithClaude(c.ocrText))
      );
      const verdicts = runs.map((r) => r.verdict);
      results.push({
        id: c.id,
        expect: c.expect,
        verdicts,
        confidence: runs.map((r) => r.confidence),
        explanation: runs[0].explanation,
      });

      for (const r of runs) {
        expect(r.mode, 'a real label analysis, not the parse-failure fallback').toBe('label');
        expect(r.explanation).not.toMatch(FALLBACK_EXPLANATION);
      }
      expect(passes({ expect: c.expect, verdicts }), `verdicts: ${verdicts.join(', ')}`).toBe(true);
      if (c.namesClaim) {
        for (const r of runs) expect(r.explanation, 'explanation names the claim').toMatch(NAMES_CLAIM);
      }
    });
  }

  // Concurrent tests finish out of order — print one sorted table at the end
  // so the before/after can be pasted into the session log and PR as-is.
  afterAll(() => {
    results.sort((a, b) => a.id - b.id);
    const rows = results.map((r) => {
      const expl = String(r.explanation || '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 140);
      return `| ${r.id} | ${r.expect} | ${r.verdicts.join(', ')} | ${r.confidence.join(', ')} | ${passes(r) ? 'PASS' : 'FAIL'} | ${expl} |`;
    });
    console.log(
      ['', '| # | expect | verdicts | confidence | result | explanation (run 1, truncated) |', '|---|---|---|---|---|---|', ...rows, ''].join('\n')
    );
  });
});
