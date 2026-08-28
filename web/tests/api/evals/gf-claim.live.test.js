/**
 * LIVE eval for the gluten-free label-claim rule — hits the real Anthropic API
 * through the real CLAUDE_PROMPT + callClaude + parseClaudeResponse path.
 *
 * Gated on RUN_LIVE_EVALS so `npm test` stays offline (vitest's root is `web`,
 * so this file sits inside the default test glob). Run it with:
 *
 *   set -a; source .env; set +a
 *   RUN_LIVE_EVALS=1 npx vitest run --root web tests/api/evals
 *
 * Temperature is not pinned in callClaude (API default 1.0), so every case is
 * run more than once: "safe" cases 2× and must be safe on both; "caution" /
 * "not-safe" cases 3× and must never be safe on any. A single false safe on an
 * adversarial case is a blocker (plans/gf-label-claim-2026-08-28.md, step 5).
 *
 * Direct Anthropic calls only: no PostHog event, no scan-quota consumption.
 * ~16 cases × 2–3 runs of Opus ≈ 40 calls per invocation.
 */
import { describe, it, afterAll } from 'vitest';
import { analyzeWithClaude } from '../../../../api/analyze.js';
import { GF_CLAIM_CASES } from './gf-claim-cases.js';

const LIVE = Boolean(process.env.RUN_LIVE_EVALS);
const RUNS = { safe: 2, caution: 3, 'not-safe': 3 };
const results = [];

function passes({ expect, verdicts }) {
  if (expect === 'safe') return verdicts.every((v) => v === 'safe');
  if (expect === 'caution') return verdicts.every((v) => v === 'caution');
  // not-safe: caution or unsafe both pass; a safe never does
  return !verdicts.includes('safe');
}

describe.skipIf(!LIVE).concurrent('gf-claim live eval (real prompt, live Claude)', () => {
  for (const c of GF_CLAIM_CASES) {
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

      expect(passes({ expect: c.expect, verdicts }), `verdicts: ${verdicts.join(', ')}`).toBe(true);
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
