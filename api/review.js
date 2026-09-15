/**
 * App Store review-ask beacon (plans/review-prompt-visibility-2026-09-15.md).
 *
 * The native rating sheet (`AppStore.requestReview`) gives the app no callback:
 * not whether it was shown, not what was tapped. Apple also drops the sheet
 * silently on TestFlight installs, after three asks per device per year, and
 * for reasons it does not document. Until this beacon existed, "prompts out"
 * was unknown, so "ratings in" (App Store Connect) could not be judged.
 *
 * Contract (event `review_prompt`, see api/ANALYTICS.md):
 *   stage   requested     the iOS client handed a rating request to the system
 *                         (after `requestReview()` resolved on a non-TestFlight
 *                         install — at most once per install)
 *           store_opened  the user tapped the "Write us a review" link on a
 *                         result screen (opens the App Store compose sheet)
 *
 * Open, unauthenticated endpoint, so the payload is REBUILT from an allowlist:
 * an unknown stage is rejected and no other property — rating, review text,
 * scan count, product, anything — can reach analytics through here. It must
 * never emit `scan`, `scan_failed` or `barcode_recovery`; those contracts are
 * untouched.
 *
 * Limits share the serverless caveat of the other limiters: the map is
 * per-instance, so the cap is per IP per warm instance, not global.
 */
import { getClientIP, getClientGeo } from './_utils.js';
import { trackReviewPrompt, normalizeClient, normalizeAppVersion } from './_analytics.js';

const STAGES = new Set(['requested', 'store_opened']);

// A legitimate beacon is `{"stage":"store_opened"}` — well under 100 bytes.
const MAX_BODY_BYTES = 512;

// Per-IP cap on its own map — NOT the shared scan limiter (a review ask must
// never consume the 50-scan allowance) and NOT the failure or recovery maps.
// A device emits at most one `requested` per install and a handful of
// `store_opened` taps, so this is deliberately tiny.
const REVIEW_RATE_LIMIT = 10;
const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
let reviewRateLimitMap = new Map();

function underReviewLimit(ip) {
  const now = Date.now();
  const record = reviewRateLimitMap.get(ip);
  if (!record || now - record.windowStart > REVIEW_WINDOW_MS) {
    reviewRateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= REVIEW_RATE_LIMIT;
}

function _setReviewRateLimitMap(map) {
  reviewRateLimitMap = map;
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

  const stage = typeof body.stage === 'string' && STAGES.has(body.stage) ? body.stage : null;
  if (!stage) {
    return res.status(400).json({ error: 'Invalid beacon' });
  }

  const ip = getClientIP(req);
  if (!underReviewLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  try {
    await trackReviewPrompt({
      ip,
      platform: normalizeClient(req.headers['x-client']),
      appVersion: normalizeAppVersion(req.headers['x-client-version']),
      stage,
      ...getClientGeo(req),
    });
  } catch (err) {
    // captureEvent already swallows; belt-and-braces so telemetry can never
    // turn into a client-visible failure.
    console.error('review_prompt tracking failed:', err);
  }

  return res.status(204).end();
}

export { REVIEW_RATE_LIMIT, MAX_BODY_BYTES, _setReviewRateLimitMap };
