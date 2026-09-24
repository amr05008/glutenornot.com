/**
 * LIVE eval for the gluten-free label rule on the barcode path — hits the real
 * Anthropic API through the real barcode CLAUDE_PROMPT + buildIngredientContext
 * (including the assessGlutenSignal note) + callClaude + parseClaudeResponse.
 *
 * Gated on RUN_LIVE_EVALS=1 exactly like gf-claim.live.test.js; same runner
 * and the same two modes (default single sample; FULL=1 for the merge gate,
 * one per PR, FORCE=1 to repeat within an hour):
 *
 *   FULL=1 RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals
 *
 * FULL: 16 cases → 4 × 2 + 12 × 5 = 68 Opus 4.8 calls + 1 cache warm-up
 * (see gf-claim.live.test.js for the cost). Default single sample: 16 + 1. Direct Anthropic calls only: no PostHog event, no scan-quota
 * consumption, no database lookup.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { analyzeWithClaude, buildIngredientContext } from '../../../../api/barcode.js';
import { BARCODE_GF_CLAIM_CASES } from './barcode-gf-claim-cases.js';
import { hasOatsCaveat } from './assertions.js';
import { guardLiveRun, sampleRuns, LIVE_EVAL_STATE_DIR } from './guard.js';

const LIVE = process.env.RUN_LIVE_EVALS === '1';
const RUNS = LIVE
  ? guardLiveRun({ key: 'barcode-gf-claim', cases: BARCODE_GF_CLAIM_CASES, stateDir: LIVE_EVAL_STATE_DIR })
  : sampleRuns({ full: false });
const FALLBACK_EXPLANATION = /Unable to fully analyze/;
const NAMES_CLAIM = /gluten[\s-]*free|no[\s-]gluten|label|certif/i;
// Safe-with-oats cases (decision 004): the explanation must carry the avenin
// caveat — the one signal left for people who avoid oats entirely. The
// matcher lives in assertions.js and is unit-tested offline against positive
// and negative fixtures (Pi grill on PR #29).
const results = [];

function passes({ expect, verdicts }) {
  if (expect === 'safe') return verdicts.every((v) => v === 'safe');
  if (expect === 'caution') return verdicts.every((v) => v === 'caution');
  if (expect === 'unsafe') return verdicts.every((v) => v === 'unsafe');
  return !verdicts.includes('safe');
}

describe.skipIf(!LIVE).concurrent('barcode gf-claim live eval (real prompt, live Claude)', () => {
  // Write the prompt cache before the concurrent burst (guard.js WARMUP_CALLS);
  // the result is discarded.
  beforeAll(async () => {
    await analyzeWithClaude(buildIngredientContext(BARCODE_GF_CLAIM_CASES[0].product));
  }, 180_000);

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
      // Decision 006: a caution must carry the case's caution_reason on every sample.
      if (c.reason) {
        for (const r of runs) {
          if (r.verdict === 'caution') expect(r.caution_reason, `caution_reason: ${r.explanation}`).toBe(c.reason);
        }
      }
      if (c.namesClaim) {
        for (const r of runs) expect(r.explanation, 'explanation names the claim').toMatch(NAMES_CLAIM);
      }
      if (c.oatsCaveat) {
        for (const r of runs) {
          expect(hasOatsCaveat(r.explanation), `explanation carries the avenin caveat: ${r.explanation}`).toBe(true);
        }
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
