/**
 * Client failure beacon (plans/ocr-capture-assist-2026-07-18.md Phase 2).
 *
 * The server can only record failures for requests that reach it — a client
 * timeout or dropped connection dies on the wire and is invisible to the scan
 * success rate. The app fires this beacon (fire-and-forget) from those error
 * paths so `scan_failed` covers them too.
 *
 * Deliberately narrow: only the reasons the server can never observe are
 * accepted — `timeout`, `network`, and (since plans/weak-signal-upload-2026-08-28.md)
 * `cancelled` (the user gave up on a slow attempt, which used to leave no trace
 * anywhere) and `interrupted` (the app went to the background mid-scan and the
 * in-flight request was dropped — kept separate so it can't contaminate "the
 * user gave up") — so
 * server-emitted reasons (ocr_failed, not_found, …) can't be spoofed into
 * analytics through an open endpoint. This endpoint must never emit `scan` —
 * that event is success-only by contract and every existing dashboard insight
 * counts on it.
 */
import { getClientIP, getClientGeo } from './_utils.js';
import { trackScanFailure, normalizeClient, normalizeAppVersion } from './_analytics.js';

const CLIENT_REASONS = new Set(['timeout', 'network', 'cancelled', 'interrupted']);
const METHODS = new Set(['ocr', 'barcode']);

// Optional `elapsed_ms`: how long the client waited before the failure. It is
// untrusted input landing in a numeric PostHog property, so it is whitelisted
// to a finite number and clamped — a junk or hostile value is dropped, never
// bucketed. 120 s is twice the client's own 60 s timeout; nothing legitimate
// waits longer.
const MAX_ELAPSED_MS = 120000;
function normalizeElapsedMs(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.round(Math.min(Math.max(raw, 0), MAX_ELAPSED_MS));
}

// Per-IP cap on an open, unauthenticated endpoint so a flood can't poison the
// failure-rate metrics. Own map — deliberately NOT the shared scan limiter in
// _utils.js: a user's failed scans must never consume their 50-scan allowance.
// Same cap as scans: a legitimate client can't fail more attempts than it makes.
const BEACON_RATE_LIMIT = 50;
const BEACON_WINDOW_MS = 24 * 60 * 60 * 1000;
let beaconRateLimitMap = new Map();

function underBeaconLimit(ip) {
  const now = Date.now();
  const record = beaconRateLimitMap.get(ip);
  if (!record || now - record.windowStart > BEACON_WINDOW_MS) {
    beaconRateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= BEACON_RATE_LIMIT;
}

function _setBeaconRateLimitMap(map) {
  beaconRateLimitMap = map;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { method, reason, elapsed_ms } = req.body || {};
  if (!CLIENT_REASONS.has(reason) || !METHODS.has(method)) {
    return res.status(400).json({ error: 'Invalid beacon' });
  }

  if (!underBeaconLimit(getClientIP(req))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const elapsedMs = normalizeElapsedMs(elapsed_ms);

  await trackScanFailure({
    ip: getClientIP(req),
    platform: normalizeClient(req.headers['x-client']),
    appVersion: normalizeAppVersion(req.headers['x-client-version']),
    method,
    reason,
    ...(elapsedMs != null ? { elapsedMs } : {}),
    ...getClientGeo(req),
  });

  return res.status(204).end();
}

export { BEACON_RATE_LIMIT, _setBeaconRateLimitMap };
