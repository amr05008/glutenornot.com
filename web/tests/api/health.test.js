import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler, { checkModel } from '../../../api/health.js';
import { CLAUDE_MODEL } from '../../../api/_utils.js';

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

describe('health handler', () => {
  let saved;
  beforeEach(() => {
    saved = {
      vision: process.env.GOOGLE_CLOUD_VISION_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      token: process.env.HEALTH_CHECK_TOKEN,
    };
    process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    delete process.env.HEALTH_CHECK_TOKEN;
  });
  afterEach(() => {
    restore('GOOGLE_CLOUD_VISION_API_KEY', saved.vision);
    restore('ANTHROPIC_API_KEY', saved.anthropic);
    restore('HEALTH_CHECK_TOKEN', saved.token);
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
});
