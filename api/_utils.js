/**
 * Shared utilities for API endpoints
 */

// Shared rate limiting state across all endpoints (analyze + barcode = 50 total)
let rateLimitMap = new Map();
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

const CLAUDE_MODEL = 'claude-opus-4-8';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Anthropic statuses worth retrying: 429 (rate limit), 529 (overloaded), and
// transient 5xx. Everything else (auth, credit, bad request) won't be fixed by
// an immediate retry, so we surface it right away.
const CLAUDE_TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

/**
 * A classified failure from the Claude call. `kind` is the actionable bucket:
 *   'overloaded'  — 429/529/5xx or a network error (transient, retried first)
 *   'auth'        — 401/403, or a missing API key (key invalid/expired/forbidden)
 *   'credit'      — 400 whose body mentions credit balance (billing exhausted)
 *   'bad_request' — any other 400 (malformed request, e.g. bad model/params)
 *   'empty'       — HTTP 200 but no text content came back
 *   'error'       — any other non-OK status
 */
class ClaudeError extends Error {
  constructor(kind, status = null, detail = null) {
    super(`CLAUDE_${String(kind).toUpperCase()}`);
    this.name = 'ClaudeError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _truncate(str, max = 300) {
  if (typeof str !== 'string') return null;
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

/**
 * Call the Anthropic Claude API with automatic retry on transient failures.
 *
 * Returns the assistant's text content on success. On failure throws a
 * {@link ClaudeError} whose `kind` distinguishes a transient overload (worth a
 * retry) from a persistent key/billing/request problem (not worth retrying) —
 * so callers and observability can tell "try again in a minute" apart from
 * "something is actually broken".
 *
 * Options (mainly for tests): `fetchImpl`, `maxRetries`, `baseDelayMs`, `sleepImpl`.
 */
async function callClaude(
  { maxTokens, content },
  { fetchImpl = fetch, maxRetries = 2, baseDelayMs = 400, sleepImpl = _sleep } = {}
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError('auth', null, 'ANTHROPIC_API_KEY not configured');
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with a little jitter: 400ms, 800ms, …
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 150);
      await sleepImpl(delay);
    }

    let response;
    try {
      response = await fetchImpl(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content }],
        }),
      });
    } catch (err) {
      // Network-level failure (DNS, connection reset, fetch abort) — transient.
      lastError = new ClaudeError('overloaded', null, err && err.message);
      continue;
    }

    if (response.ok) {
      const data = await response.json().catch(() => null);
      // Find the first text block rather than assuming content[0] — resilient
      // to any non-text blocks a future model/config might prepend.
      const blocks = (data && Array.isArray(data.content)) ? data.content : [];
      const textBlock = blocks.find((b) => b && b.type === 'text' && b.text);
      const text = textBlock && textBlock.text;
      if (!text) {
        throw new ClaudeError('empty', response.status, 'No text content in Claude response');
      }
      if (data.stop_reason === 'max_tokens') {
        // Truncated output usually fails JSON parsing downstream and degrades to
        // the generic caution fallback as a 200 — make that visible instead of silent.
        console.warn('Claude response truncated at max_tokens', {
          maxTokens,
          outputTokens: data.usage && data.usage.output_tokens,
        });
      }
      return text;
    }

    const status = response.status;
    const bodyText = await response.text().catch(() => '');

    if (CLAUDE_TRANSIENT_STATUSES.has(status)) {
      lastError = new ClaudeError('overloaded', status, _truncate(bodyText));
      continue;
    }
    if (status === 401 || status === 403) {
      throw new ClaudeError('auth', status, _truncate(bodyText));
    }
    if (status === 400) {
      const kind = /credit balance/i.test(bodyText) ? 'credit' : 'bad_request';
      throw new ClaudeError(kind, status, _truncate(bodyText));
    }
    throw new ClaudeError('error', status, _truncate(bodyText));
  }

  // Exhausted retries on a transient failure.
  throw lastError || new ClaudeError('error', null, 'Unknown Claude failure');
}

/**
 * Map a {@link ClaudeError} (or any thrown error) to an HTTP status + JSON body
 * for an API response. All Claude failures are 503s (the fault is service-side),
 * but the `code`/`retryable`/`message` fields let clients tell a transient busy
 * signal from a persistent outage.
 */
function claudeErrorResponse(error) {
  const kind = error && error.kind;
  if (kind === 'overloaded') {
    return {
      status: 503,
      body: {
        error: 'Analysis service busy',
        code: 'ANALYSIS_BUSY',
        retryable: true,
        message: 'Our analysis service is busy right now. Please try again in a few moments.',
      },
    };
  }
  // auth / credit / bad_request / empty / error / non-Claude errors: an
  // immediate retry won't help, so don't imply one will.
  return {
    status: 503,
    body: {
      error: 'Analysis service unavailable',
      code: 'ANALYSIS_UNAVAILABLE',
      retryable: false,
      message: 'Our analysis service is temporarily unavailable. Please try again later.',
    },
  };
}

/**
 * Compact, log-safe description of a Claude failure for console output.
 */
function describeClaudeError(error) {
  if (error && error.name === 'ClaudeError') {
    return { kind: error.kind, status: error.status, detail: error.detail };
  }
  return { kind: 'unknown', message: error && error.message };
}

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

/**
 * Coarse, IP-derived geography from Vercel's edge headers. Vercel populates
 * these on every request with no extra config, resolving them from the client
 * IP at the edge — so we get location without ever handling the raw IP here.
 * City is percent-encoded by Vercel (e.g. "San%20Francisco"); decode it.
 * Returns null for any field the edge didn't resolve.
 */
function getClientGeo(req) {
  const h = req.headers || {};
  let city = h['x-vercel-ip-city'] || null;
  if (city) {
    try {
      city = decodeURIComponent(city);
    } catch {
      // Not valid percent-encoding — keep the raw value rather than throw.
    }
  }
  return {
    country: h['x-vercel-ip-country'] || null,
    region: h['x-vercel-ip-country-region'] || null,
    city,
  };
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
  ClaudeError,
  callClaude,
  claudeErrorResponse,
  describeClaudeError,
  getClientIP,
  getClientGeo,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  normalizeVerdict,
  _setRateLimitMap,
  _getRateLimitMap,
};
