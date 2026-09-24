/**
 * LIVE eval for the Jev fast path (decision 007, plans/jev-fast-path-2026-09-24.md
 * build item 9): the production decision — the code gates (fastPathGate), live
 * Jev (askJev, jev-1.13.0) and the rule (decideFastPath) — on the 30 frozen
 * barcode cases (BARCODE_GF_CLAIM_CASES + BARCODE_CALIBRATION_CASES).
 *
 * Pass mark: zero settled false-safe. No sample of a case that isn't expected
 * safe may settle `safe`. Falling through is always a pass (Claude answers
 * those, and the Claude runners grade Claude); a settled `unsafe` on a case
 * expected safe or caution is a false alarm, reported in the table, not a
 * failure. Every sample must get a real answer: an eval that didn't reach Jev
 * proves nothing, so the budget here is 10 s, not production's 800 ms.
 *
 * Gated on RUN_LIVE_EVALS=1 like the other runners, with the same guard and
 * modes (default single sample; FULL=1 for the merge gate, one per PR, FORCE=1
 * to repeat within an hour). Needs TYPESAFE_API_KEY in .env — the
 * glutenornot-evals key, never the production one:
 *
 *   RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals/jev-fast-path.live.test.js
 *
 * Default: 30 Jev calls. FULL: 8 safe cases × 2 + 22 × 5 = 126 Jev calls
 * (≈ $0.006 of TypeSafe). No Anthropic call, no PostHog event, no lookup.
 */
import { describe, it, afterAll } from 'vitest';
import { fastPathGate, decideFastPath } from '../../../../api/barcode.js';
import { askJev } from '../../../../api/_jev.js';
import { BARCODE_GF_CLAIM_CASES } from './barcode-gf-claim-cases.js';
import { BARCODE_CALIBRATION_CASES } from './calibration-cases.js';
import { guardLiveRun, sampleRuns, LIVE_EVAL_STATE_DIR } from './guard.js';

const CASES = [...BARCODE_GF_CLAIM_CASES, ...BARCODE_CALIBRATION_CASES];
const LIVE = process.env.RUN_LIVE_EVALS === '1';
if (LIVE && !process.env.TYPESAFE_API_KEY?.trim()) {
  throw new Error('jev-fast-path live eval: TYPESAFE_API_KEY is not set — add the glutenornot-evals key to .env');
}
const RUNS = LIVE
  ? guardLiveRun({ key: 'jev-fast-path', engine: 'jev', cases: CASES, stateDir: LIVE_EVAL_STATE_DIR })
  : sampleRuns({ full: false });
const EVAL_TIMEOUT_MS = 10_000;
const results = [];

const isFalseSafe = (expect, outcome) => expect !== 'safe' && outcome === 'safe';
const isFalseUnsafe = (expect, outcome) => (expect === 'safe' || expect === 'caution') && outcome === 'unsafe';

describe.skipIf(!LIVE).concurrent('Jev fast path live eval (gates + live Jev + rule)', () => {
  for (const c of CASES) {
    if (!(c.expect in RUNS)) throw new Error(`fast-path case ${c.id}: unknown expect "${c.expect}"`);

    it(`${c.id} expects ${c.expect}: ${c.why}`, { timeout: 120_000 }, async ({ expect }) => {
      const gate = fastPathGate(c.product);
      if (gate) {
        results.push({ id: c.id, expect: c.expect, outcomes: [`gate: ${gate}`], ms: [] });
        return;
      }
      const samples = await Promise.all(
        Array.from({ length: RUNS[c.expect] }, () => askJev(c.product.ingredients_text, { timeoutMs: EVAL_TIMEOUT_MS }))
      );
      for (const s of samples) expect(s.outcome, 'Jev answered').toBe('ok');
      const outcomes = samples.map((s) => {
        const d = decideFastPath(c.product, s.scores);
        return d.settled ? d.result.verdict : `fell: ${d.via}`;
      });
      results.push({ id: c.id, expect: c.expect, outcomes, ms: samples.map((s) => s.ms) });
      expect(outcomes.filter((o) => isFalseSafe(c.expect, o)), `settled false-safe: ${outcomes.join(', ')}`).toEqual([]);
    });
  }

  afterAll(() => {
    results.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    const rows = results.map((r) => {
      const flags = [
        r.outcomes.some((o) => isFalseSafe(r.expect, o)) ? 'FALSE-SAFE' : '',
        r.outcomes.some((o) => isFalseUnsafe(r.expect, o)) ? 'false unsafe' : '',
      ].filter(Boolean).join(', ');
      return `| ${r.id} | ${r.expect} | ${r.outcomes.join(', ')} | ${flags || 'ok'} |`;
    });
    const samples = results.flatMap((r) => r.outcomes.filter((o) => !o.startsWith('gate')));
    const settled = samples.filter((o) => o === 'safe' || o === 'unsafe').length;
    const ms = results.flatMap((r) => r.ms).sort((a, b) => a - b);
    const pct = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : '-');
    console.log(
      [
        '',
        '| # | expect | fast-path outcome per sample | flags |',
        '|---|---|---|---|',
        ...rows,
        '',
        `Settled ${settled} of ${samples.length} Jev samples; Jev latency p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms (from this machine, not Vercel).`,
        '',
      ].join('\n')
    );
  });
});
