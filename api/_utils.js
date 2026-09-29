/**
 * Shared utilities for API endpoints
 */

// Shared rate limiting state across all endpoints (analyze + barcode = 50 total)
let rateLimitMap = new Map();
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

const CLAUDE_MODEL = 'claude-opus-4-8';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Fallback route (decision 008): when the direct call fails, the same model
// answers through OpenRouter's Anthropic-compatible Messages endpoint — "same
// brain, different pipe", so the verdict rules and their evals still hold.
// OpenRouter spells the version with a dot; a test keeps it paired with
// CLAUDE_MODEL. Off unless OPENROUTER_API_KEY is set.
const OPENROUTER_MODEL = 'anthropic/claude-opus-4.8';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/messages';
// Bedrock and Vertex only: neither goes through Anthropic's own keys, billing
// or front door, which is what failed on 2026-09-16, 09-24 and 09-29. No
// provider that keeps prompts, and zero data retention endpoints only.
const OPENROUTER_PROVIDER = {
  only: ['amazon-bedrock', 'google-vertex'],
  data_collection: 'deny',
  zdr: true,
};

// Anthropic statuses worth retrying: 429 (rate limit), 529 (overloaded), and
// transient 5xx. Everything else (auth, credit, bad request) won't be fixed by
// an immediate retry, so we surface it right away.
const CLAUDE_TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504, 529]);

// Failures the fallback answers. Not bad_request or error: our own malformed
// request fails the same way on any pipe, and masking it helps no one.
const FALLBACK_KINDS = new Set(['overloaded', 'model_retired', 'auth', 'credit', 'empty']);

/**
 * A classified failure from the Claude call. `kind` is the actionable bucket:
 *   'overloaded'    — 429/529/5xx or a network error (transient, retried first)
 *   'auth'          — 401/403, or a missing API key (key invalid/expired/forbidden)
 *   'credit'        — 400 whose body mentions credit balance or usage limits
 *                     (billing exhausted, or the Console spend limit reached)
 *   'model_retired' — 404 (the pinned model is gone, as on 2026-06-17)
 *   'bad_request'   — any other 400 (malformed request, e.g. bad params)
 *   'empty'         — HTTP 200 but no text content came back
 *   'error'         — any other non-OK status
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
 * Build the user-message content for a Claude call so the static prompt is
 * served from the prompt cache. Two text blocks: the static prompt with a
 * cache breakpoint, then the per-request text after it. Anything before the
 * breakpoint must be byte-identical across requests or the cache misses, so
 * never interpolate per-request data into `staticText`.
 *
 * Why (2026-09-16): each scan sent ~6.2K uncached input tokens of which
 * 6,078 was the OCR CLAUDE_PROMPT (verified live: call 1 cache_creation 6078,
 * call 2 cache_read 6078, 43 uncached). Cached reads bill at 0.1× (write
 * 1.25× once per 5 min), so a scan costs ~4× less — and the live evals with it.
 * Opus 4.8 caches prefixes of 1024+ tokens; both prompts clear that.
 */
function buildCachedContent(staticText, dynamicText) {
  return [
    { type: 'text', text: staticText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicText },
  ];
}

// Per-attempt cap on the Anthropic call. Opus legitimately takes tens of
// seconds on a long menu, so this only cuts off hung connections.
const CLAUDE_ATTEMPT_TIMEOUT_MS = 25000;
// Total cap on retrying: once this much time has been spent, no new attempt is
// launched. With the 25s per-attempt cap, a fully hung upstream resolves in
// ~50s of Claude time (two attempts) — at the edge of the OCR client's 60s
// budget instead of far past it (three hung attempts would be ~76s), and far
// below Vercel's 300s kill. The barcode client's 30s budget can still be
// exceeded by one hung attempt on top of the lookup waterfall; the overall
// per-request deadline remains a roadmap item.
const CLAUDE_RETRY_DEADLINE_MS = 45000;
// With a fallback configured, stop retrying Anthropic sooner so the fallback's
// one attempt fits inside the same worst case: 20s + a hung attempt (25s) +
// the fallback (25s) = the old 45s + 25s.
const CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS = 20000;

/**
 * One Messages API request. Resolves to the first text block's text; throws a
 * {@link ClaudeError} classified by status. Both routes speak the same
 * Messages shape, so both go through here.
 */
async function _requestText({ url, headers, body, fetchImpl, attemptTimeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(attemptTimeoutMs),
    });
  } catch (err) {
    // Network-level failure (DNS, connection reset, fetch abort/timeout) — transient.
    throw new ClaudeError('overloaded', null, err && err.message);
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
        maxTokens: body.max_tokens,
        outputTokens: data.usage && data.usage.output_tokens,
      });
    }
    return { text, provider: data.provider };
  }

  const status = response.status;
  const detail = _truncate(await response.text().catch(() => ''));

  if (CLAUDE_TRANSIENT_STATUSES.has(status)) throw new ClaudeError('overloaded', status, detail);
  if (status === 401 || status === 403) throw new ClaudeError('auth', status, detail);
  if (status === 404) throw new ClaudeError('model_retired', status, detail);
  if (status === 400) {
    const kind = /credit balance|usage limits/i.test(detail || '') ? 'credit' : 'bad_request';
    throw new ClaudeError(kind, status, detail);
  }
  throw new ClaudeError('error', status, detail);
}

/**
 * Call Claude, with automatic retry on transient failures and — when
 * OPENROUTER_API_KEY is set — one attempt at the same model through
 * OpenRouter if the direct call fails (decision 008).
 *
 * Returns `{ text, via }`: the assistant's text, and `'anthropic'` or
 * `'openrouter'` for the route that answered. On failure throws the direct
 * call's {@link ClaudeError} (the fallback's own failure is only logged), whose
 * `kind` distinguishes a transient overload (worth a retry) from a persistent
 * key/billing/request problem (not worth retrying) — so callers and
 * observability can tell "try again in a minute" apart from "something is
 * actually broken".
 *
 * `content` is the user message: a plain string, or the block array from
 * {@link buildCachedContent} when the static prompt should be cached.
 *
 * Options (mainly for tests): `fetchImpl`, `maxRetries`, `baseDelayMs`, `sleepImpl`.
 */
async function callClaude({ maxTokens, content }, options = {}) {
  const fallbackKey = process.env.OPENROUTER_API_KEY?.trim();
  const messages = [{ role: 'user', content }];

  let primaryError;
  try {
    const { text } = await _callAnthropic({ maxTokens, messages }, {
      retryDeadlineMs: fallbackKey ? CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS : CLAUDE_RETRY_DEADLINE_MS,
      ...options,
    });
    return { text, via: 'anthropic' };
  } catch (err) {
    if (!fallbackKey || !FALLBACK_KINDS.has(err.kind)) throw err;
    primaryError = err;
  }

  const { fetchImpl = fetch, attemptTimeoutMs = CLAUDE_ATTEMPT_TIMEOUT_MS } = options;
  try {
    const { text, provider } = await _requestText({
      url: OPENROUTER_API_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fallbackKey}`,
      },
      body: { model: OPENROUTER_MODEL, max_tokens: maxTokens, messages, provider: OPENROUTER_PROVIDER },
      fetchImpl,
      attemptTimeoutMs,
    });
    // Every activation is logged: a silent fallback is how you learn weeks
    // later that the primary died on Tuesday.
    console.warn('Claude served via OpenRouter fallback', {
      provider,
      primary: describeClaudeError(primaryError),
    });
    return { text, via: 'openrouter' };
  } catch (fallbackError) {
    console.error('OpenRouter fallback failed too', {
      primary: describeClaudeError(primaryError),
      fallback: describeClaudeError(fallbackError),
    });
    throw primaryError;
  }
}

async function _callAnthropic(
  { maxTokens, messages },
  {
    fetchImpl = fetch,
    maxRetries = 2,
    baseDelayMs = 400,
    sleepImpl = _sleep,
    attemptTimeoutMs = CLAUDE_ATTEMPT_TIMEOUT_MS,
    retryDeadlineMs = CLAUDE_RETRY_DEADLINE_MS,
  } = {}
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError('auth', null, 'ANTHROPIC_API_KEY not configured');
  }

  let lastError = null;
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Out of retry budget — surface the last transient failure rather than
      // launching another attempt the client has no time left to wait for.
      // Checked before the backoff (don't sleep when no retry can follow) and
      // after it (the sleep mustn't carry an attempt past the deadline).
      if (Date.now() - startedAt >= retryDeadlineMs) break;
      // Exponential backoff with a little jitter: 400ms, 800ms, …
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 150);
      await sleepImpl(delay);
      if (Date.now() - startedAt >= retryDeadlineMs) break;
    }

    try {
      return await _requestText({
        url: CLAUDE_API_URL,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: { model: CLAUDE_MODEL, max_tokens: maxTokens, messages },
        fetchImpl,
        attemptTimeoutMs,
      });
    } catch (err) {
      // Only a transient failure is worth another attempt.
      if (err.kind !== 'overloaded') throw err;
      lastError = err;
    }
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

/**
 * Decision 006: a caution must name one specific reason. The prompts ask for
 * `caution_reason`; this keeps whatever the model returns inside the enum —
 * unknown or missing on a caution becomes "other" (measured, T7), and a
 * reason on any other verdict is dropped.
 */
const CAUTION_REASONS = ['oats', 'may_contain', 'conflict', 'undeclared_source', 'incomplete', 'other'];

function normalizeCautionReason(verdict, reason) {
  if (verdict !== 'caution') return undefined;
  if (typeof reason !== 'string') return 'other';
  const r = reason.toLowerCase().trim();
  return CAUTION_REASONS.includes(r) ? r : 'other';
}

export {
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  CLAUDE_MODEL,
  OPENROUTER_MODEL,
  OPENROUTER_API_URL,
  OPENROUTER_PROVIDER,
  CLAUDE_ATTEMPT_TIMEOUT_MS,
  CLAUDE_RETRY_DEADLINE_MS,
  CLAUDE_RETRY_DEADLINE_WITH_FALLBACK_MS,
  ClaudeError,
  callClaude,
  buildCachedContent,
  claudeErrorResponse,
  describeClaudeError,
  getClientIP,
  getClientGeo,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  normalizeVerdict,
  CAUTION_REASONS,
  normalizeCautionReason,
  _setRateLimitMap,
  _getRateLimitMap,
};
