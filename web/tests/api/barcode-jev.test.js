import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Spy on the analytics senders; runAfterResponse and the builders stay real.
vi.mock('../../../api/_analytics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trackScan: vi.fn(), trackScanFailure: vi.fn(), trackEngineAudit: vi.fn() };
});

import handler from '../../../api/barcode.js';
import { trackScan, trackScanFailure, trackEngineAudit } from '../../../api/_analytics.js';
import { JEV_QUESTIONS, JEV_MODEL } from '../../../api/_jev.js';
import { CLAUDE_MODEL, _setRateLimitMap, _getRateLimitMap } from '../../../api/_utils.js';

const PRODUCT_NAME = 'Secret Crackers';
const BARCODE = '0012345678905';

const CLEAR = Object.fromEntries(Object.keys(JEV_QUESTIONS).map((k) => [k, 0.02]));
CLEAR.is_ingredient_list = 0.97;
CLEAR.looks_complete = 0.95;

const WHEAT_PRODUCT = {
  product_name: PRODUCT_NAME,
  ingredients_text: 'enriched wheat flour, sugar, palm oil, salt.',
  allergens_tags: ['en:gluten'],
  traces_tags: [],
  labels_tags: [],
};
const CLEAN_PRODUCT = {
  product_name: PRODUCT_NAME,
  ingredients_text: 'rice, sunflower oil, sea salt.',
  allergens_tags: [],
  traces_tags: [],
  labels_tags: [],
};

const CLAUDE_UNSAFE = { verdict: 'unsafe', flagged_ingredients: ['wheat flour'], allergen_warnings: [], explanation: 'Claude: contains wheat flour.', confidence: 'high' };
const CLAUDE_SAFE = { verdict: 'safe', flagged_ingredients: [], allergen_warnings: [], explanation: 'Claude: nothing to worry about.', confidence: 'high' };
const CLAUDE_MAY_CONTAIN = { verdict: 'caution', flagged_ingredients: [], allergen_warnings: [], explanation: 'Claude: shared facility.', confidence: 'medium', caution_reason: 'may_contain' };

function jevOk(scores) {
  const answers = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, { type: 'noul', noul: v }]));
  return new Response(JSON.stringify({ model: JEV_MODEL, answers, usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function claudeOk(analysis) {
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
}

/**
 * Route fetch by host. `jev` is a scores object, a Response, or a function
 * (url, init) → promise; `claude` is an analysis object or a function.
 */
function stubFetch({ product, jev, claude }) {
  const fetchSpy = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('openfoodfacts')) return { ok: true, json: async () => ({ status: 1, product }) };
    if (u.includes('typesafe')) {
      if (typeof jev === 'function') return jev(url, init);
      if (jev instanceof Response) return jev;
      return jevOk(jev);
    }
    if (u.includes('anthropic')) return typeof claude === 'function' ? claude(url, init) : claudeOk(claude);
    return { ok: true, json: async () => ({ status: 0 }) };
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

const calls = (spy, host) => spy.mock.calls.filter(([url]) => String(url).includes(host));

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
  };
}

async function scan(headers = {}) {
  const res = mockRes();
  await handler({ method: 'POST', body: { barcode: BARCODE }, headers: { 'x-client': 'ios', 'x-forwarded-for': '203.0.113.9', ...headers } }, res);
  return res;
}

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY', 'JEV_MODE', 'USDA_API_KEY', 'NUTRITIONIX_APP_ID', 'NUTRITIONIX_API_KEY'];
let savedEnv;
beforeEach(() => {
  _setRateLimitMap(new Map());
  vi.clearAllMocks();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  process.env.TYPESAFE_API_KEY = 'test-typesafe';
  delete process.env.JEV_MODE;
  delete process.env.USDA_API_KEY;
  delete process.env.NUTRITIONIX_APP_ID;
  delete process.env.NUTRITIONIX_API_KEY;
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

describe('JEV_MODE=off (the default): today\'s verdict path, plus the engine and timing fields', () => {
  it('never calls Jev, serves Claude, and records the timings', async () => {
    const fetchSpy = stubFetch({ product: CLEAN_PRODUCT, jev: CLEAR, claude: CLAUDE_SAFE });
    const res = await scan();
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(0);
    expect(res.statusCode).toBe(200);
    expect(res.body.explanation).toBe('Claude: nothing to worry about.');
    expect(res.body.engine).toBe('claude');
    const props = trackScan.mock.calls[0][0];
    expect(props).toMatchObject({ method: 'barcode', engine: 'claude', model: CLAUDE_MODEL, verdict: 'safe' });
    expect(props.lookupMs).toEqual(expect.any(Number));
    expect(props.claudeMs).toEqual(expect.any(Number));
    expect(props.totalMs).toEqual(expect.any(Number));
    expect(props).not.toHaveProperty('jevOutcome');
    expect(props).not.toHaveProperty('jevVia');
    expect(props).not.toHaveProperty('jevMs');
    expect(trackEngineAudit).not.toHaveBeenCalled();
  });

  it('treats an unrecognized mode as off', async () => {
    process.env.JEV_MODE = 'ful';
    const fetchSpy = stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: CLAUDE_UNSAFE });
    const res = await scan();
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(0);
    expect(res.body.engine).toBe('claude');
  });

  it('keeps the engine field Claude\'s even if the model emits one', async () => {
    stubFetch({ product: CLEAN_PRODUCT, claude: { ...CLAUDE_SAFE, engine: 'jev' } });
    expect((await scan()).body.engine).toBe('claude');
  });

  it('still returns 503 claude_error when Claude fails', async () => {
    stubFetch({ product: CLEAN_PRODUCT, claude: async () => ({ ok: false, status: 401, text: async () => 'bad key' }) });
    const res = await scan();
    expect(res.statusCode).toBe(503);
    expect(trackScanFailure).toHaveBeenCalledWith(expect.objectContaining({ method: 'barcode', reason: 'claude_error' }));
  });

  it('records lookup and total time on the no-ingredient-data caution, with no engine', async () => {
    stubFetch({ product: { product_name: PRODUCT_NAME } });
    const res = await scan();
    expect(res.body.result_reason).toBe('missing_context');
    const props = trackScan.mock.calls[0][0];
    expect(props.lookupMs).toEqual(expect.any(Number));
    expect(props.totalMs).toEqual(expect.any(Number));
    expect(props).not.toHaveProperty('engine');
  });
});

describe('JEV_MODE=shadow: Jev is asked and audited, never served', () => {
  beforeEach(() => { process.env.JEV_MODE = 'shadow'; });

  it('serves Claude on a settled unsafe and audits the pair', async () => {
    const fetchSpy = stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: CLAUDE_UNSAFE });
    const res = await scan();
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(1);
    expect(calls(fetchSpy, 'anthropic')).toHaveLength(1);
    expect(res.body.explanation).toBe('Claude: contains wheat flour.');
    expect(res.body.engine).toBe('claude');
    expect(trackScan.mock.calls[0][0]).toMatchObject({
      engine: 'claude',
      model: CLAUDE_MODEL,
      jevOutcome: 'settled_unsafe',
      jevVia: 'unsafe',
      jevMs: expect.any(Number),
    });
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    expect(trackEngineAudit.mock.calls[0][0]).toMatchObject({
      mode: 'shadow',
      jevVerdict: 'unsafe',
      claudeVerdict: 'unsafe',
      served: 'claude',
      agree: true,
      platform: 'ios',
    });
  });

  it('audits a disagreement with Claude\'s caution reason', async () => {
    stubFetch({ product: CLEAN_PRODUCT, jev: CLEAR, claude: CLAUDE_MAY_CONTAIN });
    const res = await scan();
    expect(res.body.verdict).toBe('caution');
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    expect(trackEngineAudit.mock.calls[0][0]).toMatchObject({
      mode: 'shadow',
      jevVerdict: 'safe',
      claudeVerdict: 'caution',
      claudeCautionReason: 'may_contain',
      served: 'claude',
      agree: false,
    });
  });

  it('sends no audit when Jev falls through', async () => {
    stubFetch({ product: CLEAN_PRODUCT, jev: { ...CLEAR, looks_complete: 0.1 }, claude: CLAUDE_SAFE });
    await scan();
    expect(trackScan.mock.calls[0][0]).toMatchObject({ engine: 'claude', jevOutcome: 'fell_through', jevVia: 'list_quality' });
    await new Promise((r) => setTimeout(r, 10));
    expect(trackEngineAudit).not.toHaveBeenCalled();
  });

  it('keeps Claude\'s failure a 503 when Jev wasn\'t served', async () => {
    stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: async () => ({ ok: false, status: 401, text: async () => '' }) });
    const res = await scan();
    expect(res.statusCode).toBe(503);
    expect(trackScan).not.toHaveBeenCalled();
  });
});

describe('JEV_MODE=unsafe (Stage 1): serve a settled unsafe, shadow a settled safe', () => {
  beforeEach(() => { process.env.JEV_MODE = 'unsafe'; });

  it('serves Jev\'s unsafe without waiting for Claude, then audits it', async () => {
    let releaseClaude;
    const claudeGate = new Promise((r) => { releaseClaude = r; });
    const fetchSpy = stubFetch({
      product: WHEAT_PRODUCT,
      jev: { ...CLEAR, wheat: 0.99 },
      claude: async () => { await claudeGate; return claudeOk(CLAUDE_UNSAFE); },
    });
    const res = await scan();
    // Answered while Claude is still running.
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      mode: 'label',
      verdict: 'unsafe',
      flagged_ingredients: ['wheat'],
      allergen_warnings: [],
      explanation: 'This product lists wheat, which contains gluten.',
      confidence: 'high',
      engine: 'jev',
      product_name: PRODUCT_NAME,
      barcode: BARCODE,
      data_source: 'openfoodfacts',
    });
    expect(calls(fetchSpy, 'anthropic')).toHaveLength(1);
    const props = trackScan.mock.calls[0][0];
    expect(props).toMatchObject({
      method: 'barcode',
      engine: 'jev',
      model: JEV_MODEL,
      verdict: 'unsafe',
      confidence: 'high',
      hadIngredientData: true,
      dataSource: 'openfoodfacts',
      jevOutcome: 'settled_unsafe',
      jevVia: 'unsafe',
    });
    expect(props).not.toHaveProperty('claudeMs');
    expect(props).not.toHaveProperty('cautionReason');
    expect(trackEngineAudit).not.toHaveBeenCalled();

    releaseClaude();
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    expect(trackEngineAudit.mock.calls[0][0]).toMatchObject({
      mode: 'unsafe',
      jevVerdict: 'unsafe',
      claudeVerdict: 'unsafe',
      served: 'jev',
      agree: true,
    });
  });

  it('hands the audit to the request context\'s waitUntil before the response goes out', async () => {
    const CTX = Symbol.for('@vercel/request-context');
    const waitUntil = vi.fn();
    globalThis[CTX] = { get: () => ({ waitUntil }) };
    try {
      stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: CLAUDE_UNSAFE });
      const res = mockRes();
      let registeredAtResponse = null;
      const json = res.json.bind(res);
      res.json = (body) => { registeredAtResponse = waitUntil.mock.calls.length; return json(body); };
      await handler({ method: 'POST', body: { barcode: BARCODE }, headers: { 'x-forwarded-for': '203.0.113.9' } }, res);
      expect(res.body.engine).toBe('jev');
      expect(registeredAtResponse).toBe(1);
      await waitUntil.mock.calls[0][0];
      expect(trackEngineAudit).toHaveBeenCalledWith(expect.objectContaining({ served: 'jev', claudeVerdict: 'unsafe' }));
    } finally {
      delete globalThis[CTX];
    }
  });

  it('counts one scan against the rate limit', async () => {
    stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: CLAUDE_UNSAFE });
    await scan();
    expect(_getRateLimitMap().get('203.0.113.9').count).toBe(1);
  });

  it('never serves Jev\'s safe: Claude answers and the safe is audited', async () => {
    stubFetch({ product: CLEAN_PRODUCT, jev: CLEAR, claude: CLAUDE_SAFE });
    const res = await scan();
    expect(res.body.engine).toBe('claude');
    expect(res.body.explanation).toBe('Claude: nothing to worry about.');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ engine: 'claude', jevOutcome: 'settled_safe', jevVia: 'safe' });
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    expect(trackEngineAudit.mock.calls[0][0]).toMatchObject({ mode: 'unsafe', jevVerdict: 'safe', claudeVerdict: 'safe', served: 'claude', agree: true });
  });

  it('keeps a served verdict when Claude\'s audit call fails, and audits the failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: async () => ({ ok: false, status: 401, text: async () => '' }) });
    const res = await scan();
    expect(res.statusCode).toBe(200);
    expect(res.body.engine).toBe('jev');
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    const audit = trackEngineAudit.mock.calls[0][0];
    expect(audit).toMatchObject({ served: 'jev', jevVerdict: 'unsafe', claudeVerdict: 'error' });
    expect(audit).not.toHaveProperty('agree');
    expect(trackScanFailure).not.toHaveBeenCalled();
    console.warn.mockRestore();
  });
});

describe('JEV_MODE=full (Stage 2): serve both settled verdicts', () => {
  beforeEach(() => { process.env.JEV_MODE = 'full'; });

  it('serves Jev\'s safe with medium confidence, then audits it', async () => {
    stubFetch({ product: CLEAN_PRODUCT, jev: CLEAR, claude: CLAUDE_MAY_CONTAIN });
    const res = await scan();
    expect(res.body).toMatchObject({
      verdict: 'safe',
      confidence: 'medium',
      engine: 'jev',
      explanation: "No gluten ingredients are listed, and there's no may-contain warning.",
    });
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    // The F5 tripwire's shape: Jev served safe, Claude said caution.
    expect(trackEngineAudit.mock.calls[0][0]).toMatchObject({
      mode: 'full',
      jevVerdict: 'safe',
      claudeVerdict: 'caution',
      claudeCautionReason: 'may_contain',
      served: 'jev',
      agree: false,
    });
  });

  it('serves Claude when Jev falls through', async () => {
    stubFetch({ product: CLEAN_PRODUCT, jev: { ...CLEAR, is_ingredient_list: 0.3 }, claude: CLAUDE_SAFE });
    const res = await scan();
    expect(res.body.engine).toBe('claude');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ jevOutcome: 'fell_through', jevVia: 'list_quality' });
  });

  it('serves Claude after an 800 ms Jev timeout', async () => {
    const fetchSpy = stubFetch({
      product: CLEAN_PRODUCT,
      jev: (url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))),
      claude: CLAUDE_SAFE,
    });
    const res = await scan();
    expect(res.body.engine).toBe('claude');
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(1);
    const props = trackScan.mock.calls[0][0];
    expect(props.jevOutcome).toBe('timeout');
    expect(props.jevMs).toBeGreaterThanOrEqual(790);
    expect(props).not.toHaveProperty('jevVia');
  });

  it('serves Claude after a Jev error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ product: CLEAN_PRODUCT, jev: new Response('overloaded', { status: 503 }), claude: CLAUDE_SAFE });
    const res = await scan();
    expect(res.body.engine).toBe('claude');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ jevOutcome: 'error' });
    console.warn.mockRestore();
  });

  it('never asks Jev when a code gate hits', async () => {
    const fetchSpy = stubFetch({ product: { ...CLEAN_PRODUCT, labels_tags: ['en:no-gluten'] }, jev: CLEAR, claude: CLAUDE_SAFE });
    const res = await scan();
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(0);
    expect(res.body.engine).toBe('claude');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ jevOutcome: 'skipped', jevVia: 'gf_label' });
    expect(trackScan.mock.calls[0][0]).not.toHaveProperty('jevMs');
  });

  it('falls back to Claude if the fast path itself throws on a malformed record', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A non-iterable traces field: Claude's context builder skips it, the rule can't spread it.
    stubFetch({ product: { ...CLEAN_PRODUCT, traces_tags: 5 }, jev: CLEAR, claude: CLAUDE_SAFE });
    const res = await scan();
    expect(res.statusCode).toBe(200);
    expect(res.body.engine).toBe('claude');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ jevOutcome: 'error' });
    error.mockRestore();
  });

  it('never asks Jev without a key (preview deploys get none)', async () => {
    delete process.env.TYPESAFE_API_KEY;
    const fetchSpy = stubFetch({ product: CLEAN_PRODUCT, jev: CLEAR, claude: CLAUDE_SAFE });
    const res = await scan();
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(0);
    expect(res.body.engine).toBe('claude');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ jevOutcome: 'skipped', jevVia: 'no_key' });
  });

  it('never asks Jev about a record from another database', async () => {
    const fetchSpy = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('upcitemdb')) {
        return { ok: true, json: async () => ({ code: 'OK', items: [{ ean: BARCODE, title: 'Rice Crackers', description: 'INGREDIENTS: RICE, SUNFLOWER OIL, SALT.' }] }) };
      }
      if (u.includes('anthropic')) return claudeOk(CLAUDE_SAFE);
      return { ok: true, json: async () => ({ status: 0 }) };
    });
    vi.stubGlobal('fetch', fetchSpy);
    const res = await scan();
    expect(calls(fetchSpy, 'typesafe')).toHaveLength(0);
    expect(res.body.data_source).toBe('upcitemdb');
    expect(trackScan.mock.calls[0][0]).toMatchObject({ jevOutcome: 'skipped', jevVia: 'source' });
  });
});

describe('fast-path privacy (the analytics invariant, and what TypeSafe receives)', () => {
  beforeEach(() => { process.env.JEV_MODE = 'full'; });

  it('sends TypeSafe the ingredient text only: no product name, barcode or client detail', async () => {
    const fetchSpy = stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: CLAUDE_UNSAFE });
    await scan();
    const [url, init] = calls(fetchSpy, 'typesafe')[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init.body);
    expect(body.state).toEqual({ ingredients: WHEAT_PRODUCT.ingredients_text });
    const wire = JSON.stringify({ url, headers: init.headers, body: init.body });
    expect(wire).not.toContain(PRODUCT_NAME);
    expect(wire).not.toContain(BARCODE);
    expect(wire).not.toContain('203.0.113.9');
    expect(Object.keys(init.headers).map((h) => h.toLowerCase())).not.toContain('x-forwarded-for');
  });

  it('puts no product name, barcode or ingredient text in scan or audit events', async () => {
    stubFetch({ product: WHEAT_PRODUCT, jev: { ...CLEAR, wheat: 0.99 }, claude: CLAUDE_UNSAFE });
    await scan();
    await vi.waitFor(() => expect(trackEngineAudit).toHaveBeenCalled());
    const events = JSON.stringify([trackScan.mock.calls, trackEngineAudit.mock.calls]);
    expect(events).not.toContain(PRODUCT_NAME);
    expect(events).not.toContain(BARCODE);
    expect(events).not.toContain('wheat flour');
    expect(events).not.toContain('This product lists');
  });
});
