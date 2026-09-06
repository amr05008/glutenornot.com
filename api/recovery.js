/**
 * Barcode recovery funnel beacon (plans/barcode-recovery-2026-09-05.md §7).
 *
 * When a barcode lookup comes up empty (404 `not_found`, or 200 with
 * `result_reason: "missing_context"`), the iOS client shows a neutral recovery
 * state that offers photographing the ingredient label. This endpoint records
 * the stages of that flow so "how often does recovery complete?" is
 * answerable — the one product question a CTA change alone would leave open.
 *
 * Contract (event `barcode_recovery`, see api/ANALYTICS.md):
 *   flow_id   random v4 UUID minted client-side when the state is first shown;
 *             lives only in the client's memory and transient route params
 *   reason    not_found | missing_context
 *   stage     shown | photo_started | result_displayed | exited
 *   source    camera | picker            (photo_started only)
 *   result_mode / verdict / confidence   (result_displayed only, bounded enums)
 *
 * Open, unauthenticated endpoint, so the payload is REBUILT from an allowlist
 * rather than forwarded: an unknown stage/reason/ID is rejected, an invalid
 * optional is dropped, and no other property — barcode, product name,
 * explanation, image, anything — can reach analytics through here. It must
 * never emit `scan` or `scan_failed`; those contracts are untouched.
 *
 * Limits share the serverless caveat of the other limiters: the map is
 * per-instance, so the cap is per IP per warm instance, not global.
 */
import { getClientIP, getClientGeo } from './_utils.js';
import { trackBarcodeRecovery, normalizeClient, normalizeAppVersion } from './_analytics.js';

const REASONS = new Set(['not_found', 'missing_context']);
const STAGES = new Set(['shown', 'photo_started', 'result_displayed', 'exited']);
const SOURCES = new Set(['camera', 'picker']);
const RESULT_MODES = new Set(['label', 'menu']);
const VERDICTS = new Set(['safe', 'caution', 'unsafe']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

// RFC 4122 v4 only: the client mints them with a v4 generator, so anything
// else is not one of ours. Case-insensitive, normalized to lowercase so one
// flow can't fork into two by capitalization.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A legitimate beacon is well under 300 bytes. Anything bigger is not one.
const MAX_BODY_BYTES = 1024;

// Per-IP cap on its own map — NOT the shared scan limiter (a recovery flow
// must never consume the 50-scan allowance) and NOT the failure beacon's map
// (that one is sized at one event per failed attempt). A flow emits up to
// four stages and retries can repeat photo_started, so this is sized at
// several events per scan of the daily allowance.
const RECOVERY_RATE_LIMIT = 200;
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
let recoveryRateLimitMap = new Map();

function underRecoveryLimit(ip) {
  const now = Date.now();
  const record = recoveryRateLimitMap.get(ip);
  if (!record || now - record.windowStart > RECOVERY_WINDOW_MS) {
    recoveryRateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= RECOVERY_RATE_LIMIT;
}

function _setRecoveryRateLimitMap(map) {
  recoveryRateLimitMap = map;
}

function pick(set, value) {
  return typeof value === 'string' && set.has(value) ? value : null;
}

function bodyTooLarge(req) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  // Vercel has already parsed the JSON; measure what it produced so a missing
  // or lying content-length can't sneak a large payload past the cap.
  try {
    return Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES;
  } catch {
    return true;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid beacon' });
  }
  if (bodyTooLarge(req)) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  const flowId = typeof body.flow_id === 'string' && UUID_V4.test(body.flow_id) ? body.flow_id.toLowerCase() : null;
  const reason = pick(REASONS, body.reason);
  const stage = pick(STAGES, body.stage);
  if (!flowId || !reason || !stage) {
    return res.status(400).json({ error: 'Invalid beacon' });
  }

  const ip = getClientIP(req);
  if (!underRecoveryLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // Stage-scoped optionals: present only where they mean something, dropped
  // (never rejected) when invalid — a beacon with a junk optional is still a
  // real funnel step.
  const optional = {};
  if (stage === 'photo_started') {
    const source = pick(SOURCES, body.source);
    if (source) optional.source = source;
  }
  if (stage === 'result_displayed') {
    const resultMode = pick(RESULT_MODES, body.result_mode);
    const verdict = pick(VERDICTS, body.verdict);
    const confidence = pick(CONFIDENCES, body.confidence);
    if (resultMode) optional.resultMode = resultMode;
    if (verdict) optional.verdict = verdict;
    if (confidence) optional.confidence = confidence;
  }

  try {
    await trackBarcodeRecovery({
      ip,
      platform: normalizeClient(req.headers['x-client']),
      appVersion: normalizeAppVersion(req.headers['x-client-version']),
      flowId,
      reason,
      stage,
      ...optional,
      ...getClientGeo(req),
    });
  } catch (err) {
    // captureEvent already swallows; belt-and-braces so telemetry can never
    // turn into a user-visible failure.
    console.error('barcode_recovery tracking failed:', err);
  }

  return res.status(204).end();
}

export { RECOVERY_RATE_LIMIT, MAX_BODY_BYTES, _setRecoveryRateLimitMap };
