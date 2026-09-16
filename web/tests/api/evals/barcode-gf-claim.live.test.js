/**
 * LIVE eval for the gluten-free label rule on the barcode path — hits the real
 * Anthropic API through the real barcode CLAUDE_PROMPT + buildIngredientContext
 * (including the assessGlutenSignal note) + callClaude + parseClaudeResponse.
 *
 * Gated on RUN_LIVE_EVALS=1 exactly like gf-claim.live.test.js; same runner:
 *
 *   RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals
 *
 * 10 cases → 3 × 2 + 7 × 5 = 41 Opus calls. Direct Anthropic calls only: no
 * PostHog event, no scan-quota consumption, no database lookup.
 */
import { describe, it, afterAll } from 'vitest';
import { analyzeWithClaude, buildIngredientContext } from '../../../../api/barcode.js';
import { BARCODE_GF_CLAIM_CASES } from './barcode-gf-claim-cases.js';

const LIVE = process.env.RUN_LIVE_EVALS === '1';
const RUNS = { safe: 2, caution: 5, unsafe: 5, 'not-safe': 5 };
const FALLBACK_EXPLANATION = /Unable to fully analyze/;
const NAMES_CLAIM = /gluten[\s-]*free|no[\s-]gluten|label|certif/i;
const results = [];

function passes({ expect, verdicts }) {
  if (expect === 'safe') return verdicts.every((v) => v === 'safe');
  if (expect === 'caution') return verdicts.every((v) => v === 'caution');
  if (expect === 'unsafe') return verdicts.every((v) => v === 'unsafe');
  return !verdicts.includes('safe');
}

describe.skipIf(!LIVE).concurrent('barcode gf-claim live eval (real prompt, live Claude)', () => {
  for (const c of BARCODE_GF_CLAIM_CASES) {
    if (!(c.expect in RUNS)) throw new Error(`barcode gf-claim case ${c.id}: unknown expect "${c.expect}"`);
    const context = buildIngredientContext(c.product);
    if (!context) throw new Error(`barcode gf-claim case ${c.id}: product builds no context`);

    it(`${c.id} expects ${c.expect}: ${c.why}`, { timeout: 180_000 }, async ({ expect }) => {
      const runs = await Promise.all(
        Array.from({ length: RUNS[c.expect] }, () => analyzeWithClaude(context))
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
        expect(r.explanation).not.toMatch(FALLBACK_EXPLANATION);
      }
      expect(passes({ expect: c.expect, verdicts }), `verdicts: ${verdicts.join(', ')}`).toBe(true);
      if (c.namesClaim) {
        for (const r of runs) expect(r.explanation, 'explanation names the claim').toMatch(NAMES_CLAIM);
      }
    });
  }

  afterAll(() => {
    results.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const rows = results.map((r) => {
      const expl = String(r.explanation || '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 140);
      return `| ${r.id} | ${r.expect} | ${r.verdicts.join(', ')} | ${r.confidence.join(', ')} | ${passes(r) ? 'PASS' : 'FAIL'} | ${expl} |`;
    });
    console.log(
      ['', '| # | expect | verdicts | confidence | result | explanation (run 1, truncated) |', '|---|---|---|---|---|---|', ...rows, ''].join('\n')
    );
  });
});
