import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler, { checkModel, checkFallback } from '../../../api/health.js';
import { CLAUDE_MODEL, OPENROUTER_MODEL, OPENROUTER_PROVIDER } from '../../../api/_utils.js';

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('checkModel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns ok when the model responds 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const result = await checkModel('key');
    expect(result.status).toBe('ok');
    expect(result.model).toBe(CLAUDE_MODEL);
    expect(typeof result.latencyMs).toBe('number');
  });

  it('flags a retired model (404) with the upstream status and error type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { type: 'not_found_error', message: `model: ${CLAUDE_MODEL}` } }),
    }));
    const result = await checkModel('key');
    expect(result.status).toBe('error');
    expect(result.upstreamStatus).toBe(404);
    expect(result.error).toContain('not_found_error');
  });

  it('flags an invalid key (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    }));
    const result = await checkModel('key');
    expect(result.status).toBe('error');
    expect(result.upstreamStatus).toBe(401);
  });

  it('handles a network failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const result = await checkModel('key');
    expect(result.status).toBe('error');
    expect(result.error).toContain('ECONNRESET');
  });

  it('reports a timeout (AbortError) as a clear timeout message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    ));
    const result = await checkModel('key');
    expect(result.status).toBe('error');
    expect(result.error).toContain('timeout');
  });
});

describe('checkFallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  const MESSAGE = { ok: true, status: 200, json: async () => ({ type: 'message', content: [{ type: 'text', text: 'P' }] }) };

  it('pings the paired model through OpenRouter, routed as callClaude routes it', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(MESSAGE);
    vi.stubGlobal('fetch', fetchSpy);
    const result = await checkFallback('or-key');
    expect(result).toMatchObject({ status: 'ok', model: OPENROUTER_MODEL });
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/messages');
    expect(opts.headers.Authorization).toBe('Bearer or-key');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ model: OPENROUTER_MODEL, max_tokens: 1, provider: OPENROUTER_PROVIDER });
  });

  // Grill (PR #37): an aggregator can answer 200 with something that isn't a
  // Messages reply; callClaude would reject it, so the canary must too.
  it.each([
    ['no body', { ok: true, status: 200, json: async () => { throw new Error('not json'); } }],
    ['an error object', { ok: true, status: 200, json: async () => ({ error: { message: 'upstream failed' } }) }],
    ['no content array', { ok: true, status: 200, json: async () => ({ type: 'message' }) }],
    // Grill round 2: callClaude rejects a reply with no non-empty text block.
    ['no text block', { ok: true, status: 200, json: async () => ({ type: 'message', content: [] }) }],
    ['only an empty text block', { ok: true, status: 200, json: async () => ({ type: 'message', content: [{ type: 'text', text: '' }] }) }],
  ])('reports a 200 with %s as an error', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const result = await checkFallback('or-key');
    expect(result).toMatchObject({ status: 'error', upstreamStatus: 200, model: OPENROUTER_MODEL });
  });

  it('reports drained credits (402) with the upstream status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({ error: { message: 'Insufficient credits' } }),
    }));
    const result = await checkFallback('or-key');
    expect(result).toMatchObject({ status: 'error', upstreamStatus: 402, model: OPENROUTER_MODEL });
  });
});

describe('health handler', () => {
  let saved;
  beforeEach(() => {
    saved = {
      vision: process.env.GOOGLE_CLOUD_VISION_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      token: process.env.HEALTH_CHECK_TOKEN,
      openrouter: process.env.OPENROUTER_API_KEY,
    };
    process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    delete process.env.HEALTH_CHECK_TOKEN;
    delete process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    restore('GOOGLE_CLOUD_VISION_API_KEY', saved.vision);
    restore('ANTHROPIC_API_KEY', saved.anthropic);
    restore('HEALTH_CHECK_TOKEN', saved.token);
    restore('OPENROUTER_API_KEY', saved.openrouter);
    vi.unstubAllGlobals();
  });

  it('rejects non-GET requests', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('shallow check returns 200 when both keys are present', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.services.analysis.status).toBe('configured');
  });

  it('shallow check returns 503 when a key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.healthy).toBe(false);
  });

  it('reports the Jev fast path (key presence and JEV_MODE) without affecting health', async () => {
    const saved = { key: process.env.TYPESAFE_API_KEY, mode: process.env.JEV_MODE };
    try {
      delete process.env.TYPESAFE_API_KEY;
      delete process.env.JEV_MODE;
      let res = mockRes();
      await handler({ method: 'GET', query: {}, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.healthy).toBe(true);
      expect(res.body.services.fast_path).toEqual({ key: 'missing_key', mode: 'off' });

      process.env.TYPESAFE_API_KEY = 'ts-secret-value';
      process.env.JEV_MODE = 'Unsafe';
      res = mockRes();
      await handler({ method: 'GET', query: {}, headers: {} }, res);
      expect(res.body.services.fast_path).toEqual({ key: 'configured', mode: 'unsafe' });
      // Presence only: the key never appears in the response.
      expect(JSON.stringify(res.body)).not.toContain('ts-secret-value');

      // A mode that isn't one of the four reads as off, as the barcode path treats it.
      process.env.JEV_MODE = 'on';
      res = mockRes();
      await handler({ method: 'GET', query: {}, headers: {} }, res);
      expect(res.body.services.fast_path.mode).toBe('off');
    } finally {
      restore('TYPESAFE_API_KEY', saved.key);
      restore('JEV_MODE', saved.mode);
    }
  });

  it('reports barcode fallback key presence without affecting health', async () => {
    const saved = {
      usda: process.env.USDA_API_KEY,
      nutritionixId: process.env.NUTRITIONIX_APP_ID,
      nutritionixKey: process.env.NUTRITIONIX_API_KEY,
    };
    delete process.env.USDA_API_KEY;
    delete process.env.NUTRITIONIX_APP_ID;
    delete process.env.NUTRITIONIX_API_KEY;
    try {
      const res = mockRes();
      await handler({ method: 'GET', query: {}, headers: {} }, res);
      // Fallback sources are optional: report them, but never page over them.
      expect(res.statusCode).toBe(200);
      expect(res.body.healthy).toBe(true);
      expect(res.body.services.barcode_fallbacks.usda).toBe('missing_key');
      expect(res.body.services.barcode_fallbacks.nutritionix).toBe('missing_key');
      // UPCitemdb's trial tier needs no key, so it is always available.
      expect(res.body.services.barcode_fallbacks.upcitemdb).toBe('available');
    } finally {
      restore('USDA_API_KEY', saved.usda);
      restore('NUTRITIONIX_APP_ID', saved.nutritionixId);
      restore('NUTRITIONIX_API_KEY', saved.nutritionixKey);
    }
  });

  it('reports barcode fallback keys as configured when present', async () => {
    const saved = {
      usda: process.env.USDA_API_KEY,
      nutritionixId: process.env.NUTRITIONIX_APP_ID,
      nutritionixKey: process.env.NUTRITIONIX_API_KEY,
    };
    process.env.USDA_API_KEY = 'usda-key';
    process.env.NUTRITIONIX_APP_ID = 'nx-id';
    process.env.NUTRITIONIX_API_KEY = 'nx-key';
    try {
      const res = mockRes();
      await handler({ method: 'GET', query: {}, headers: {} }, res);
      expect(res.body.services.barcode_fallbacks.usda).toBe('configured');
      expect(res.body.services.barcode_fallbacks.nutritionix).toBe('configured');
    } finally {
      restore('USDA_API_KEY', saved.usda);
      restore('NUTRITIONIX_APP_ID', saved.nutritionixId);
      restore('NUTRITIONIX_API_KEY', saved.nutritionixKey);
    }
  });

  it('reports nutritionix as missing_key when only one of its two keys is set', async () => {
    const saved = {
      nutritionixId: process.env.NUTRITIONIX_APP_ID,
      nutritionixKey: process.env.NUTRITIONIX_API_KEY,
    };
    process.env.NUTRITIONIX_APP_ID = 'nx-id';
    delete process.env.NUTRITIONIX_API_KEY;
    try {
      const res = mockRes();
      await handler({ method: 'GET', query: {}, headers: {} }, res);
      expect(res.body.services.barcode_fallbacks.nutritionix).toBe('missing_key');
    } finally {
      restore('NUTRITIONIX_APP_ID', saved.nutritionixId);
      restore('NUTRITIONIX_API_KEY', saved.nutritionixKey);
    }
  });

  it('deep check stays disabled until HEALTH_CHECK_TOKEN is set', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.services.analysis.deep).toBe('disabled');
    expect(fetchSpy).not.toHaveBeenCalled(); // no token = no token spend
  });

  it('deep check rejects a wrong token with 401', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1', token: 'wrong' }, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('deep check returns 200 when the model ping succeeds (token via query)', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1', token: 'secret' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.services.analysis.status).toBe('ok');
  });

  it('deep check returns 503 when the model pings ok but the Vision key is missing', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    delete process.env.GOOGLE_CLOUD_VISION_API_KEY;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1', token: 'secret' }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.healthy).toBe(false);
    expect(res.body.services.analysis.status).toBe('ok'); // model fine...
    expect(res.body.services.ocr.status).toBe('missing_key'); // ...Vision is the culprit
  });

  it('deep check returns 503 when the model is retired (token via header)', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { type: 'not_found_error', message: 'model: x' } }),
    }));
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1' }, headers: { 'x-health-token': 'secret' } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.healthy).toBe(false);
    expect(res.body.services.analysis.upstreamStatus).toBe(404);
  });
  it('reports the analysis fallback key without affecting health, and never leaks it', async () => {
    let res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.services.analysis_fallback).toEqual({ key: 'missing_key' });

    process.env.OPENROUTER_API_KEY = 'or-secret-value';
    res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.body.services.analysis_fallback).toEqual({ key: 'configured' });
    expect(JSON.stringify(res.body)).not.toContain('or-secret-value');
  });

  it('deep check pings the fallback too, but only the direct route decides health', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    process.env.OPENROUTER_API_KEY = 'or-key';
    const fetchSpy = vi.fn(async (url) => (String(url).includes('anthropic.com')
      ? { ok: false, status: 503, json: async () => { throw new Error('empty body'); } }
      : { ok: true, status: 200, json: async () => ({ type: 'message', content: [{ type: 'text', text: 'P' }] }) }));
    vi.stubGlobal('fetch', fetchSpy);
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1' }, headers: { 'x-health-token': 'secret' } }, res);
    // The direct route is down: still 503, so the uptime monitor pages...
    expect(res.statusCode).toBe(503);
    expect(res.body.services.analysis).toMatchObject({ status: 'error', upstreamStatus: 503 });
    // ...while the body shows the fallback is serving.
    expect(res.body.services.analysis_fallback).toMatchObject({ key: 'configured', status: 'ok', model: OPENROUTER_MODEL });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('deep check skips the fallback ping when no key is set', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const res = mockRes();
    await handler({ method: 'GET', query: { deep: '1', token: 'secret' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.body.services.analysis_fallback).toEqual({ key: 'missing_key' });
  });
  // The UptimeRobot monitors match these exact strings in the body (keyword
  // "does not exist" → incident). Changing the JSON shape breaks a monitor.
  const DIRECT_OK_KEYWORD = '"analysis":{"status":"ok"';
  const FALLBACK_OK_KEYWORD = '"analysis_fallback":{"key":"configured","status":"ok"';
  const OK_MESSAGE = { ok: true, status: 200, json: async () => ({ type: 'message', content: [{ type: 'text', text: 'P' }] }) };
  const routed = (direct, fallback) => vi.fn(async (url) => (String(url).includes('anthropic.com') ? direct() : fallback()));

  it('deep check: the direct monitor keyword appears only when the direct route answers', async () => {
    process.env.HEALTH_CHECK_TOKEN = 'secret';
    process.env.OPENROUTER_API_KEY = 'or-key';
    vi.stubGlobal('fetch', routed(() => ({ ok: true, status: 200 }), () => OK_MESSAGE));
    let res = mockRes();
    await handler({ method: 'GET', query: { deep: '1', token: 'secret' }, headers: {} }, res);
    expect(JSON.stringify(res.body)).toContain(DIRECT_OK_KEYWORD);

    // Direct down, fallback up: the fallback's "status":"ok" must not satisfy the direct monitor.
    vi.stubGlobal('fetch', routed(() => ({ ok: false, status: 503, json: async () => { throw new Error('empty'); } }), () => OK_MESSAGE));
    res = mockRes();
    await handler({ method: 'GET', query: { deep: '1', token: 'secret' }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain(DIRECT_OK_KEYWORD);
  });

  describe('fallback-only deep check (?deep=1&check=fallback)', () => {
    it('pings OpenRouter alone and answers 200 while the direct route is down', async () => {
      process.env.HEALTH_CHECK_TOKEN = 'secret';
      process.env.OPENROUTER_API_KEY = 'or-key';
      const fetchSpy = routed(() => ({ ok: false, status: 503, json: async () => ({}) }), () => OK_MESSAGE);
      vi.stubGlobal('fetch', fetchSpy);
      const res = mockRes();
      await handler({ method: 'GET', query: { deep: '1', check: 'fallback' }, headers: { 'x-health-token': 'secret' } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.healthy).toBe(true);
      expect(res.body.services.analysis_fallback).toMatchObject({ key: 'configured', status: 'ok', model: OPENROUTER_MODEL });
      expect(res.body.services.analysis).toBeUndefined();
      expect(JSON.stringify(res.body)).toContain(FALLBACK_OK_KEYWORD);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][0])).toContain('openrouter.ai');
    });

    it('answers 503 when the fallback can\'t answer', async () => {
      process.env.HEALTH_CHECK_TOKEN = 'secret';
      process.env.OPENROUTER_API_KEY = 'or-key';
      vi.stubGlobal('fetch', routed(() => ({ ok: true, status: 200 }), () => ({ ok: false, status: 402, json: async () => ({ error: { message: 'Insufficient credits' } }) })));
      const res = mockRes();
      await handler({ method: 'GET', query: { deep: '1', check: 'fallback', token: 'secret' }, headers: {} }, res);
      expect(res.statusCode).toBe(503);
      expect(res.body.healthy).toBe(false);
      expect(res.body.services.analysis_fallback).toMatchObject({ key: 'configured', status: 'error', upstreamStatus: 402 });
      expect(JSON.stringify(res.body)).not.toContain(FALLBACK_OK_KEYWORD);
    });

    it('answers 503 without a key, and makes no call', async () => {
      process.env.HEALTH_CHECK_TOKEN = 'secret';
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const res = mockRes();
      await handler({ method: 'GET', query: { deep: '1', check: 'fallback', token: 'secret' }, headers: {} }, res);
      expect(res.statusCode).toBe(503);
      expect(res.body.services.analysis_fallback).toEqual({ key: 'missing_key' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('still needs the health token', async () => {
      process.env.HEALTH_CHECK_TOKEN = 'secret';
      process.env.OPENROUTER_API_KEY = 'or-key';
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const res = mockRes();
      await handler({ method: 'GET', query: { deep: '1', check: 'fallback', token: 'wrong' }, headers: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not depend on the Anthropic key', async () => {
      process.env.HEALTH_CHECK_TOKEN = 'secret';
      process.env.OPENROUTER_API_KEY = 'or-key';
      delete process.env.ANTHROPIC_API_KEY;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OK_MESSAGE));
      const res = mockRes();
      await handler({ method: 'GET', query: { deep: '1', check: 'fallback', token: 'secret' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
    });
  });
});
