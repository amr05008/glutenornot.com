/**
 * Health Check Endpoint
 * Returns status of dependent services.
 *
 * Two modes:
 *  - Shallow (default): reports whether the required API keys are configured.
 *  - Deep (?deep=1, gated by HEALTH_CHECK_TOKEN): actually pings the Claude
 *    model so a retired/unreachable model or an invalid key is caught
 *    proactively — not just key presence. This is what an external uptime
 *    monitor should hit on an interval so an analysis outage pages us instead
 *    of going unnoticed.
 */

import { CLAUDE_MODEL } from './_utils.js';

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
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
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
        model: CLAUDE_MODEL,
        upstreamStatus: response.status,
        error: detail,
      };
    }

    return { status: 'ok', model: CLAUDE_MODEL, latencyMs: Date.now() - started };
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? `timeout after ${PING_TIMEOUT_MS}ms`
      : (error.message || 'request failed');
    return { status: 'error', model: CLAUDE_MODEL, error: detail };
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

  if (!hasAnthropicKey) {
    health.healthy = false;
    return res.status(503).json(health);
  }

  health.services.analysis = await checkModel(process.env.ANTHROPIC_API_KEY);
  health.healthy = health.services.analysis.status === 'ok' && hasVisionKey;

  return res.status(health.healthy ? 200 : 503).json(health);
}

export { checkModel };
