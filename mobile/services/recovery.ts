/**
 * Barcode recovery funnel (plans/barcode-recovery-2026-09-05.md §7).
 *
 * When a barcode lookup comes up empty the camera screen shows a neutral
 * recovery state and offers a photo of the label. These beacons record the
 * stages of that flow — shown → photo_started → result_displayed, or exited —
 * so "does the offer actually get people to an answer?" is measurable.
 *
 * Content-free by construction: the payload is exactly flow_id / reason /
 * stage plus a few bounded enums. No barcode, product name, ingredient text,
 * or photo can be passed in — the extras type has no field for them and the
 * body is assembled key by key. The flow ID is random, minted when a recovery
 * state is first shown, lives only in memory and transient route params, and
 * is never written to Recents or derived from anything about the product.
 *
 * Fire-and-forget: never awaited on the user path, never throws, never
 * changes what the user sees. A lost beacon loses a measurement, nothing else.
 */
import { RECOVERY_API_URL } from '../constants/verdicts';
import type { Verdict, Confidence, AnalysisMode } from '../constants/verdicts';
import { clientHeaders } from './api';

export type RecoveryReason = 'not_found' | 'missing_context';
export type RecoveryStage = 'shown' | 'photo_started' | 'result_displayed' | 'exited';
export type RecoverySource = 'camera' | 'picker';

export interface RecoveryEventExtras {
  /** photo_started only */
  source?: RecoverySource;
  /** result_displayed only */
  resultMode?: AnalysisMode;
  verdict?: Verdict;
  confidence?: Confidence;
}

/**
 * Random v4 UUID for one recovery journey. Prefers the platform generator when
 * the runtime has one; otherwise a Math.random v4 — this is a flow label, not
 * a secret, and the server only checks the v4 shape.
 */
export function newRecoveryFlowId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') {
    try {
      return c.randomUUID().toLowerCase();
    } catch {
      // fall through to the manual generator
    }
  }
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

// `shown` and `result_displayed` are once-per-flow by contract. React can
// re-run an effect (StrictMode, a remount under the stack) and the result
// screen can mount twice for one push; dedupe here so the contract holds
// regardless of render behavior. Bounded: a session mints a handful of flows.
const ONCE_PER_FLOW: ReadonlySet<RecoveryStage> = new Set(['shown', 'result_displayed']);
const MAX_DEDUPE_KEYS = 500;
let sentOnce = new Set<string>();

/** Test hook. */
export function _resetRecoveryEventDedupe(): void {
  sentOnce = new Set();
}

/**
 * Beacon one stage of a recovery flow. Returns whether a request was issued
 * (false when the once-per-flow guard suppressed a duplicate).
 */
export function sendRecoveryEvent(
  flowId: string,
  reason: RecoveryReason,
  stage: RecoveryStage,
  extras: RecoveryEventExtras = {},
): boolean {
  try {
    if (ONCE_PER_FLOW.has(stage)) {
      const key = `${flowId}:${stage}`;
      if (sentOnce.has(key)) return false;
      if (sentOnce.size >= MAX_DEDUPE_KEYS) sentOnce = new Set();
      sentOnce.add(key);
    }

    // Assembled key by key from typed fields — never a spread of anything
    // the caller passed, so nothing outside the contract can ride along.
    const payload: Record<string, string> = { flow_id: flowId, reason, stage };
    if (stage === 'photo_started' && extras.source) payload.source = extras.source;
    if (stage === 'result_displayed') {
      if (extras.resultMode) payload.result_mode = extras.resultMode;
      if (extras.verdict) payload.verdict = extras.verdict;
      if (extras.confidence) payload.confidence = extras.confidence;
    }

    fetch(RECOVERY_API_URL, {
      method: 'POST',
      headers: clientHeaders(),
      body: JSON.stringify(payload),
    }).catch(() => {});
    return true;
  } catch {
    // Telemetry can never break the flow.
    return false;
  }
}
