/**
 * Shared utilities for API endpoints
 */

// Shared rate limiting state across all endpoints (analyze + barcode = 50 total)
let rateLimitMap = new Map();
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

function _setRateLimitMap(map) {
  rateLimitMap = map;
}

function _getRateLimitMap() {
  return rateLimitMap;
}

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    return { allowed: true };
  }

  // Check if window has expired
  if (now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.delete(ip);
    return { allowed: true };
  }

  // Check if under limit
  if (record.count < RATE_LIMIT) {
    return { allowed: true };
  }

  // Rate limited
  const resetIn = RATE_LIMIT_WINDOW - (now - record.windowStart);
  return { allowed: false, resetIn };
}

function incrementRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
  } else {
    record.count++;
  }
}

function formatTimeRemaining(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

/**
 * Normalize a verdict string to one of the valid values.
 * Claude sometimes returns non-standard verdicts like "warning" or "ask server".
 */
function normalizeVerdict(verdict) {
  if (typeof verdict !== 'string') return 'caution';
  const v = verdict.toLowerCase().trim();
  if (v === 'safe') return 'safe';
  if (v === 'unsafe' || v === 'not safe' || v === 'danger' || v === 'dangerous') return 'unsafe';
  // Anything else (caution, warning, ask, check, unknown, etc.) → caution
  return 'caution';
}

export {
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  CLAUDE_MODEL,
  getClientIP,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  normalizeVerdict,
  _setRateLimitMap,
  _getRateLimitMap,
};
