import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sampleRuns,
  countCalls,
  estimateUsd,
  checkFullRun,
  recordFullRun,
  guardLiveRun,
  FULL_RUN_COOLDOWN_MS,
  LIVE_EVAL_STATE_DIR,
} from './guard.js';

// Offline, always runs. The live runners consult this module before the
// first API call (2026-09-16: nine unguarded runs at ~$4–5 each emptied the
// org's credits in 50 minutes).
const CASES = [
  { expect: 'safe' }, { expect: 'safe' },
  { expect: 'caution' }, { expect: 'unsafe' }, { expect: 'not-safe' },
];

describe('sampleRuns', () => {
  it('defaults to a single sample per case', () => {
    expect(sampleRuns({ full: false })).toEqual({ safe: 1, caution: 1, unsafe: 1, 'not-safe': 1 });
  });
  it('samples 2× safe and 5× adversarial on a FULL run', () => {
    expect(sampleRuns({ full: true })).toEqual({ safe: 2, caution: 5, unsafe: 5, 'not-safe': 5 });
  });
});

describe('countCalls', () => {
  it('sums the samples over the cases', () => {
    expect(countCalls(CASES, sampleRuns({ full: false }))).toBe(5);
    expect(countCalls(CASES, sampleRuns({ full: true }))).toBe(2 * 2 + 3 * 5);
  });
});

describe('estimateUsd', () => {
  it('prices an uncached Opus 4.8 call at ~6.25K in / ~200 out', () => {
    // 6250 × $5/M + 200 × $25/M = $0.03125 + $0.005 = $0.03625
    expect(estimateUsd({ calls: 1, cached: false })).toBeCloseTo(0.03625, 4);
  });
  it('is roughly 4× cheaper per call with the static prompt cached', () => {
    // 6000 × $0.50/M + 250 × $5/M + 200 × $25/M = $0.00925 vs $0.03625 uncached
    const uncached = estimateUsd({ calls: 100, cached: false });
    const cached = estimateUsd({ calls: 100, cached: true });
    expect(cached).toBeCloseTo(0.925, 3);
    expect(cached).toBeLessThan(uncached / 3.5);
    expect(cached).toBeGreaterThan(uncached / 4.5);
  });
});

describe('FULL-run cooldown', () => {
  function tmpState() {
    // The directory itself does not exist yet: recordFullRun must create it.
    return join(mkdtempSync(join(tmpdir(), 'live-eval-')), 'state');
  }

  it('allows the first FULL run and records it', () => {
    const dir = tmpState();
    expect(checkFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 })).toEqual({ ok: true });
    recordFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 });
    expect(JSON.parse(readFileSync(join(dir, 'gf-claim.json'), 'utf8'))).toEqual({ last: 1000 });
  });

  it('refuses a second FULL run inside the cooldown', () => {
    const dir = tmpState();
    recordFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 });
    const res = checkFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 + FULL_RUN_COOLDOWN_MS - 1 });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/FORCE=1/);
  });

  it('allows a FULL run once the cooldown has passed', () => {
    const dir = tmpState();
    recordFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 });
    expect(checkFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 + FULL_RUN_COOLDOWN_MS }).ok).toBe(true);
  });

  it('tracks each runner in its own file so the two workers in one invocation neither block nor clobber each other', () => {
    const dir = tmpState();
    recordFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 });
    recordFullRun({ key: 'barcode-gf-claim', stateDir: dir, now: 1001 });
    expect(checkFullRun({ key: 'barcode-gf-claim', stateDir: dir, now: 1002 }).ok).toBe(false);
    expect(checkFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 + FULL_RUN_COOLDOWN_MS }).ok).toBe(true);
  });

  it('lets FORCE override the cooldown', () => {
    const dir = tmpState();
    recordFullRun({ key: 'gf-claim', stateDir: dir, now: 1000 });
    expect(checkFullRun({ key: 'gf-claim', stateDir: dir, now: 1001, force: true }).ok).toBe(true);
  });

  it('treats a missing or corrupt state file as no previous run', () => {
    const dir = tmpState();
    mkdirSync(dir);
    writeFileSync(join(dir, 'gf-claim.json'), 'not json');
    expect(checkFullRun({ key: 'gf-claim', stateDir: dir, now: 5 }).ok).toBe(true);
  });

  it('cooldown is one hour', () => {
    expect(FULL_RUN_COOLDOWN_MS).toBe(60 * 60 * 1000);
  });
});

describe('guardLiveRun (what the runners call at collection)', () => {
  function tmpState() {
    // The directory itself does not exist yet: recordFullRun must create it.
    return join(mkdtempSync(join(tmpdir(), 'live-eval-')), 'state');
  }

  it('returns single-sample runs by default and prints the count and estimate', () => {
    const lines = [];
    const runs = guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: tmpState(), env: {}, log: (l) => lines.push(l) });
    expect(runs).toEqual(sampleRuns({ full: false }));
    expect(lines).toHaveLength(1);
    // 5 sampled + 1 cache warm-up; cached = 5 × $0.00925 + 1 × $0.03625, uncached = 6 × $0.03625
    expect(lines[0]).toMatch(/6 Opus 4\.8 calls \(incl\. 1 cache warm-up\)/);
    expect(lines[0]).toMatch(/\$0\.08 with the prompt cached \(≈ \$0\.22 uncached; less under a -t filter\)/);
    expect(lines[0]).toMatch(/single sample/);
  });

  it('records a FULL run and refuses the next one inside the cooldown', () => {
    const dir = tmpState();
    const runs = guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: dir, env: { FULL: '1' }, log: () => {} });
    expect(runs).toEqual(sampleRuns({ full: true }));
    expect(() =>
      guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: dir, env: { FULL: '1' }, log: () => {} })
    ).toThrow(/FORCE=1/);
    expect(() =>
      guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: dir, env: { FULL: '1', FORCE: '1' }, log: () => {} })
    ).not.toThrow();
  });

  it('refuses to run under vitest watch mode, even without FULL', () => {
    expect(() =>
      guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: tmpState(), env: { VITEST_MODE: 'WATCH' }, log: () => {} })
    ).toThrow(/watch mode/);
    expect(() =>
      guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: tmpState(), env: { VITEST_MODE: 'RUN' }, log: () => {} })
    ).not.toThrow();
  });

  it('keeps cooldown state in the git common dir so every worktree shares it', () => {
    expect(LIVE_EVAL_STATE_DIR.endsWith(join('.git', 'live-eval-state'))).toBe(true);
    expect(LIVE_EVAL_STATE_DIR).not.toMatch(/[/\\]worktrees[/\\]/);
  });

  it('never touches the state file on a default (non-FULL) run', () => {
    const dir = tmpState();
    guardLiveRun({ key: 'gf-claim', cases: CASES, stateDir: dir, env: {}, log: () => {} });
    expect(() => readFileSync(join(dir, 'gf-claim.json'))).toThrow();
  });
});
