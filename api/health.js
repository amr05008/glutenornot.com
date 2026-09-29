/**
 * Health Check Endpoint
 * Returns status of dependent services.
 *
 * Three modes:
 *  - Shallow (default): reports whether the required API keys are configured.
 *  - Deep (?deep=1, gated by HEALTH_CHECK_TOKEN): actually pings the Claude
 *    model so a retired/unreachable model or an invalid key is caught
 *    proactively — not just key presence. This is what an external uptime
 *    monitor should hit on an interval so an analysis outage pages us instead
 *    of going unnoticed. Only the direct route decides the status; the
 *    OpenRouter fallback is pinged and reported alongside.
 *  - Fallback-only (?deep=1&check=fallback, same token): pings the OpenRouter
 *    fallback alone, for its own monitor (decision 008).
 *
 * The uptime monitors are keyword monitors on the body, so the JSON shape is
 * a contract: `"analysis":{"status":"ok"` (deep) and
 * `"analysis_fallback":{"key":"configured","status":"ok"` (fallback-only).
 * web/tests/api/health.test.js pins both strings.
 */

import { CLAUDE_MODEL, OPENROUTER_MODEL, OPENROUTER_API_URL, OPENROUTER_PROVIDER } from './_utils.js';
import { jevMode } from './_jev.js';

/**
 * Minimal, cheap liveness ping against the configured Claude model.
 * max_tokens:1 keeps the cost to a few tokens per call. On failure it captures
 * the upstream HTTP status + error type so the cause (e.g. a retired model →
 * 404 not_found_error) is visible in the response, not just "unavailable".
 * Exported for testing.
 */
// Generous: a real ping cold-starting on Vercel (init + inference) can take
// several seconds — that's normal, not an outage. This only bounds a true hang;
// hard failures (retired model → 404, bad key → 401) come back instantly.
const PING_TIMEOUT_MS = 20000;

async function checkModel(apiKey) {
  return ping({
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    model: CLAUDE_MODEL,
  });
}

/**
 * The same ping through the OpenRouter fallback (decision 008), routed the
 * way callClaude routes it. A fallback that is never exercised fails exactly
 * when it's needed — an expired key, drained credits, a slug OpenRouter
 * dropped — so the deep check pings it every time, even while the direct
 * route is healthy. Exported for testing.
 */
async function checkFallback(apiKey) {
  return ping({
    url: OPENROUTER_API_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    model: OPENROUTER_MODEL,
    extraBody: { provider: OPENROUTER_PROVIDER },
    // An aggregator can answer 200 with something other than a Messages
    // reply, which callClaude would reject. The direct ping keeps its 2xx
    // rule: it decides `healthy`, so a new rule there could page.
    requireMessage: true,
  });
}

async function ping({ url, headers, model, extraBody = {}, requireMessage = false }) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
        ...extraBody,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        if (err?.error?.type) {
          detail = `${err.error.type}: ${err.error.message || ''}`.trim();
        }
      } catch {
        // Non-JSON error body — keep the HTTP status as the detail.
      }
      return {
        status: 'error',
        model,
        upstreamStatus: response.status,
        error: detail,
      };
    }

    if (requireMessage) {
      // The same acceptance rule as callClaude: a non-empty text block.
      const data = await response.json().catch(() => null);
      const blocks = Array.isArray(data?.content) ? data.content : [];
      if (data?.type !== 'message' || !blocks.some((b) => b && b.type === 'text' && b.text)) {
        return {
          status: 'error',
          model,
          upstreamStatus: response.status,
          error: data?.error?.message || 'response is not a Messages reply',
        };
      }
    }

    return { status: 'ok', model, latencyMs: Date.now() - started };
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? `timeout after ${PING_TIMEOUT_MS}ms`
      : (error.message || 'request failed');
    return { status: 'error', model, error: detail };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hasVisionKey = !!process.env.GOOGLE_CLOUD_VISION_API_KEY;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasUsdaKey = !!process.env.USDA_API_KEY;
  const hasNutritionixKeys = !!(process.env.NUTRITIONIX_APP_ID && process.env.NUTRITIONIX_API_KEY);
  const fallbackKey = process.env.OPENROUTER_API_KEY?.trim();

  const health = {
    healthy: true,
    timestamp: new Date().toISOString(),
    services: {
      ocr: { status: hasVisionKey ? 'configured' : 'missing_key' },
      analysis: { status: hasAnthropicKey ? 'configured' : 'missing_key' },
      // Optional barcode-lookup fallback sources (Open Food Facts needs no key).
      // Reported for visibility only — they never affect `healthy`, so a missing
      // fallback key can't page the uptime monitor.
      barcode_fallbacks: {
        usda: hasUsdaKey ? 'configured' : 'missing_key',
        nutritionix: hasNutritionixKeys ? 'configured' : 'missing_key',
        // UPCitemdb's trial tier is keyless — always available, nothing to configure.
        upcitemdb: 'available',
      },
      // Jev fast path (decision 007): key presence and the mode the barcode
      // path reads. Visibility only — with no key or JEV_MODE=off every scan
      // uses Claude, so it never affects `healthy`.
      fast_path: {
        key: process.env.TYPESAFE_API_KEY?.trim() ? 'configured' : 'missing_key',
        mode: jevMode(),
      },
      // Decision 008: the same model through OpenRouter when the direct call
      // fails. Visibility only — it never affects `healthy`, so a direct-route
      // outage still pages even while the fallback is serving.
      analysis_fallback: {
        key: fallbackKey ? 'configured' : 'missing_key',
      },
    },
  };

  const deepRequested = req.query?.deep === '1' || req.query?.deep === 'true';

  if (!deepRequested) {
    // Shallow check (unchanged): key presence only.
    health.healthy = hasVisionKey && hasAnthropicKey;
    return res.status(health.healthy ? 200 : 503).json(health);
  }

  // Deep check: gated by a secret so public callers can't burn our token budget.
  const expected = process.env.HEALTH_CHECK_TOKEN;
  const provided = req.headers?.['x-health-token'] || req.query?.token;

  if (!expected) {
    // Disabled by default until the secret is configured (mirrors analytics no-op).
    health.services.analysis.deep = 'disabled';
    health.healthy = hasVisionKey && hasAnthropicKey;
    return res.status(health.healthy ? 200 : 503).json(health);
  }

  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing health token' });
  }

  // Fallback-only deep check (?deep=1&check=fallback, decision 008): pings
  // OpenRouter alone and answers 200 or 503 on the fallback by itself. Its
  // uptime monitor then asks one question — can the fallback answer? — and
  // doesn't also go down when the direct route does (the full deep check is
  // 503 then, whatever the fallback's state).
  if (req.query?.check === 'fallback') {
    const fallback = fallbackKey
      ? { key: 'configured', ...(await checkFallback(fallbackKey)) }
      : { key: 'missing_key' };
    const healthy = fallback.status === 'ok';
    return res.status(healthy ? 200 : 503).json({
      healthy,
      timestamp: health.timestamp,
      services: { analysis_fallback: fallback },
    });
  }

  if (!hasAnthropicKey) {
    health.healthy = false;
    return res.status(503).json(health);
  }

  const [analysis, fallback] = await Promise.all([
    checkModel(process.env.ANTHROPIC_API_KEY),
    fallbackKey ? checkFallback(fallbackKey) : null,
  ]);
  health.services.analysis = analysis;
  if (fallback) health.services.analysis_fallback = { key: 'configured', ...fallback };
  health.healthy = health.services.analysis.status === 'ok' && hasVisionKey;

  return res.status(health.healthy ? 200 : 503).json(health);
}

export { checkModel, checkFallback };
