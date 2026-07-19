/**
 * Client failure beacon (plans/ocr-capture-assist-2026-07-18.md Phase 2).
 *
 * The server can only record failures for requests that reach it — a client
 * timeout or dropped connection dies on the wire and is invisible to the scan
 * success rate. The app fires this beacon (fire-and-forget) from those error
 * paths so `scan_failed` covers them too.
 *
 * Deliberately narrow: only the two reasons the server can never observe are
 * accepted, so server-emitted reasons (ocr_failed, not_found, …) can't be
 * spoofed into analytics through an open endpoint. This endpoint must never
 * emit `scan` — that event is success-only by contract and every existing
 * dashboard insight counts on it.
 */
import { getClientIP, getClientGeo } from './_utils.js';
import { trackScanFailure, normalizeClient } from './_analytics.js';

const CLIENT_REASONS = new Set(['timeout', 'network']);
const METHODS = new Set(['ocr', 'barcode']);

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

  const { method, reason } = req.body || {};
  if (!CLIENT_REASONS.has(reason) || !METHODS.has(method)) {
    return res.status(400).json({ error: 'Invalid beacon' });
  }

  if (!underBeaconLimit(getClientIP(req))) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  await trackScanFailure({
    ip: getClientIP(req),
    platform: normalizeClient(req.headers['x-client']),
    method,
    reason,
    ...getClientGeo(req),
  });

  return res.status(204).end();
}

export { BEACON_RATE_LIMIT, _setBeaconRateLimitMap };
