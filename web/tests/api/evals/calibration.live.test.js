/**
 * LIVE eval for decision 006 (caution means a specific reason) — both paths,
 * real prompts, live Claude. Same rules as the other runners: RUN_LIVE_EVALS=1
 * gates it, the default is one sample per case, FULL=1 is the once-per-PR
 * merge gate a human approves, guard.js prints the cost and refuses a second
 * FULL run within the hour. A caution must carry the case's caution_reason on
 * every sample; an adversarial case may never come back safe.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { analyzeWithClaude as analyzeOcr } from '../../../../api/analyze.js';
import { analyzeWithClaude as analyzeBarcode, buildIngredientContext } from '../../../../api/barcode.js';
import { CALIBRATION_CASES, BARCODE_CALIBRATION_CASES } from './calibration-cases.js';
import { guardLiveRun, sampleRuns, LIVE_EVAL_STATE_DIR } from './guard.js';

const LIVE = process.env.RUN_LIVE_EVALS === '1';
const FALLBACK_EXPLANATION = /Unable to fully analyze/;

function passes({ expect, verdicts }) {
  if (expect === 'safe') return verdicts.every((v) => v === 'safe');
  if (expect === 'caution') return verdicts.every((v) => v === 'caution');
  if (expect === 'unsafe') return verdicts.every((v) => v === 'unsafe');
  return !verdicts.includes('safe');
}

function runner({ key, label, cases, analyze }) {
  const RUNS = LIVE ? guardLiveRun({ key, cases, stateDir: LIVE_EVAL_STATE_DIR }) : sampleRuns({ full: false });
  const results = [];

  describe.skipIf(!LIVE).concurrent(`${label} (real prompt, live Claude)`, () => {
    beforeAll(async () => {
      await analyze(cases[0]);
    }, 180_000);

    for (const c of cases) {
      if (!(c.expect in RUNS)) throw new Error(`${key} case ${c.id}: unknown expect "${c.expect}"`);

      it(`${c.id} expects ${c.expect}${c.reason ? ` (${c.reason})` : ''}: ${c.why}`, { timeout: 180_000 }, async ({ expect }) => {
        const runs = await Promise.all(Array.from({ length: RUNS[c.expect] }, () => analyze(c)));
        const verdicts = runs.map((r) => r.verdict);
        results.push({ id: c.id, expect: c.expect, verdicts, reasons: runs.map((r) => r.caution_reason ?? '-'), explanation: runs[0].explanation });

        for (const r of runs) expect(r.explanation).not.toMatch(FALLBACK_EXPLANATION);
        expect(passes({ expect: c.expect, verdicts }), `verdicts: ${verdicts.join(', ')}`).toBe(true);
        if (c.reason) {
          for (const r of runs) {
            if (r.verdict === 'caution') expect(r.caution_reason, `caution_reason: ${r.explanation}`).toBe(c.reason);
          }
        }
      });
    }

    afterAll(() => {
      results.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const rows = results.map((r) => {
        const expl = String(r.explanation || '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 120);
        return `| ${r.id} | ${r.expect} | ${r.verdicts.join(', ')} | ${r.reasons.join(', ')} | ${passes(r) ? 'PASS' : 'FAIL'} | ${expl} |`;
      });
      console.log(['', `| ${label} | expect | verdicts | caution_reason | result | explanation (run 1) |`, '|---|---|---|---|---|---|', ...rows, ''].join('\n'));
    });
  });
}

runner({ key: 'calibration-ocr', label: 'calibration: photo path', cases: CALIBRATION_CASES, analyze: (c) => analyzeOcr(c.ocrText) });
runner({ key: 'calibration-barcode', label: 'calibration: barcode path', cases: BARCODE_CALIBRATION_CASES, analyze: (c) => analyzeBarcode(buildIngredientContext(c.product)) });
