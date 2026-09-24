/**
 * Cost guard for the live eval runners. Plain module so it is unit-tested
 * offline (guard.test.js); the runners call it once at collection, before
 * the first API call.
 *
 * Why (2026-09-16): the two live runners cost ≈ $6 per FULL invocation
 * (165 uncached Opus 4.8 calls; ≈ $1.60 now that the prompt is cached,
 * counting the two warm-up calls), and
 * an agent iterating on PR #29 ran them nine times in 50 minutes. That
 * emptied the org's prepaid credits and took the live app down for two
 * hours. So:
 *   - the default is ONE sample per case (cheap enough to iterate on);
 *   - FULL=1 restores the 2× safe / 5× adversarial sampling the merge gate needs;
 *   - a FULL run prints its call count and dollar estimate first;
 *   - a second FULL run of the same runner within an hour is refused unless
 *     FORCE=1 (state in <git common dir>/live-eval-state/<runner>.json,
 *     shared by every worktree — one file per runner because vitest
 *     collects the two runners in separate workers at the same moment).
 *     The hour counts from the START of a FULL run, so an aborted or
 *     crashed run still counts;
 *   - a warm-up call writes the prompt cache before the concurrent burst;
 *   - vitest watch mode is refused outright.
 *
 * Decision 006 (2026-09-23) added a third runner (calibration.live.test.js,
 * both paths): a FULL run of all three is now 284 calls ≈ $2.75 with the
 * prompt cached (≈ $10 uncached); the single-sample default is 78 calls.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// <runner>.json holds that runner's last FULL run. It lives in the git common
// dir (<main checkout>/.git/live-eval-state/), which every worktree shares —
// agents work in .claude/worktrees/<branch>/, and a per-checkout file would
// hand each new worktree a fresh cooldown. Outside a git checkout it falls
// back to web/.live-eval-state/ (gitignored).
function resolveStateDir() {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: HERE,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (common) return join(resolve(HERE, common), 'live-eval-state');
  } catch {
    // not a git checkout — fall through
  }
  return resolve(HERE, '../../../.live-eval-state');
}

export const LIVE_EVAL_STATE_DIR = resolveStateDir();

// The runners' beforeAll call that writes the prompt cache before the
// concurrent burst. vitest runs up to 5 concurrent tests at once, each firing
// up to 5 calls; requests that start before any cache entry exists all miss
// it and each pay the 1.25× write.
export const WARMUP_CALLS = 1;

export const FULL_RUN_COOLDOWN_MS = 60 * 60 * 1000;

// Opus 4.8 list prices (per million tokens) and the measured request shape
// (Console logs + a live cache check, 2026-09-16): ~6.2K input of which
// 6,080 tokens is the OCR CLAUDE_PROMPT (count_tokens; the barcode prompt is
// 2,339, so this over-estimates that runner), ~200 output.
const USD_PER_M = { input: 5, output: 25, cacheRead: 0.5 };
const TOKENS = { staticPrompt: 6000, dynamic: 250, output: 200 };

export function sampleRuns({ full }) {
  return full
    ? { safe: 2, caution: 5, unsafe: 5, 'not-safe': 5 }
    : { safe: 1, caution: 1, unsafe: 1, 'not-safe': 1 };
}

export function countCalls(cases, runs) {
  return cases.reduce((n, c) => n + (runs[c.expect] || 0), 0);
}

export function estimateUsd({ calls, cached }) {
  const inputUsd = cached
    ? (TOKENS.staticPrompt * USD_PER_M.cacheRead + TOKENS.dynamic * USD_PER_M.input) / 1e6
    : ((TOKENS.staticPrompt + TOKENS.dynamic) * USD_PER_M.input) / 1e6;
  const outputUsd = (TOKENS.output * USD_PER_M.output) / 1e6;
  return calls * (inputUsd + outputUsd);
}

function stateFile(stateDir, key) {
  return join(stateDir, `${key}.json`);
}

function readLast(stateDir, key) {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(stateDir, key), 'utf8'));
    return parsed && typeof parsed.last === 'number' ? parsed.last : null;
  } catch {
    return null;
  }
}

export function checkFullRun({ key, stateDir, now = Date.now(), force = false }) {
  if (force) return { ok: true };
  const last = readLast(stateDir, key);
  if (last === null) return { ok: true };
  const elapsed = now - last;
  if (elapsed >= FULL_RUN_COOLDOWN_MS) return { ok: true };
  const minutesLeft = Math.ceil((FULL_RUN_COOLDOWN_MS - elapsed) / 60000);
  return {
    ok: false,
    reason:
      `${key}: a FULL live run started ${Math.round(elapsed / 60000)} min ago; ` +
      `wait ${minutesLeft} min, iterate with the default single sample or -t, ` +
      `or set FORCE=1 to run it again now.`,
  };
}

export function recordFullRun({ key, stateDir, now = Date.now() }) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile(stateDir, key), JSON.stringify({ last: now }));
}

/**
 * One-stop call for a runner: returns the RUNS table and prints the cost
 * line; throws when a FULL run is inside the cooldown. `cases` is the case
 * list, `key` names the runner in the state file.
 */
export function guardLiveRun({ key, cases, stateDir, env = process.env, log = console.log }) {
  // Watch mode re-collects the runner on every save: a live bill per keystroke.
  if (String(env.VITEST_MODE).toUpperCase() === 'WATCH') {
    throw new Error(`${key}: live evals refuse to run under vitest watch mode; use \`vitest run\`.`);
  }
  const full = env.FULL === '1';
  const runs = sampleRuns({ full });
  const sampled = countCalls(cases, runs);
  const calls = sampled + WARMUP_CALLS;
  const uncached = estimateUsd({ calls, cached: false });
  // The warm-up is billed uncached (plus a 0.25× write premium, ignored here).
  const cached = estimateUsd({ calls: sampled, cached: true }) + estimateUsd({ calls: WARMUP_CALLS, cached: false });
  log(
    `[${key} live eval] ${cases.length} cases, ${full ? 'FULL (2× safe / 5× adversarial)' : 'single sample (FULL=1 for the merge gate)'}: ` +
      `${calls} Opus 4.8 calls (incl. ${WARMUP_CALLS} cache warm-up) ≈ $${cached.toFixed(2)} with the prompt cached (≈ $${uncached.toFixed(2)} uncached; less under a -t filter)`
  );
  if (full) {
    const check = checkFullRun({ key, stateDir, force: env.FORCE === '1' });
    if (!check.ok) throw new Error(check.reason);
    recordFullRun({ key, stateDir });
  }
  return runs;
}
