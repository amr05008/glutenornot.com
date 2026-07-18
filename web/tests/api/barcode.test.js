import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Replace the analytics senders with spies so handler tests can assert on what
// gets tracked without ever talking to PostHog. Everything else stays real.
vi.mock('../../../api/_analytics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trackScan: vi.fn(), trackScanFailure: vi.fn() };
});

import handler, {
  parseClaudeResponse,
  buildIngredientContext,
  assessGlutenSignal,
  lookupOpenFoodFacts,
  lookupUSDA,
  lookupNutritionix,
  lookupUpcItemDb,
} from '../../../api/barcode.js';
import { trackScan, trackScanFailure } from '../../../api/_analytics.js';
import {
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  _setRateLimitMap,
  _getRateLimitMap,
} from '../../../api/_utils.js';

describe('parseClaudeResponse (barcode)', () => {
  it('parses valid safe response', () => {
    const input = JSON.stringify({
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'No gluten ingredients found.',
      confidence: 'high',
    });
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('safe');
    expect(result.mode).toBe('label');
    expect(result.confidence).toBe('high');
  });

  it('parses valid unsafe response', () => {
    const input = JSON.stringify({
      verdict: 'unsafe',
      flagged_ingredients: ['wheat flour'],
      allergen_warnings: ['Contains wheat'],
      explanation: 'Contains wheat flour.',
      confidence: 'high',
    });
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('unsafe');
    expect(result.flagged_ingredients).toEqual(['wheat flour']);
  });

  it('normalizes invalid verdict to caution', () => {
    const input = JSON.stringify({
      verdict: 'maybe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Not sure.',
      confidence: 'low',
    });
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('caution');
  });

  it('falls back to caution for empty input', () => {
    const result = parseClaudeResponse('');
    expect(result.verdict).toBe('caution');
    expect(result.confidence).toBe('low');
  });

  it('falls back to caution for malformed JSON', () => {
    const result = parseClaudeResponse('not json at all');
    expect(result.verdict).toBe('caution');
    expect(result.confidence).toBe('low');
  });

  it('extracts JSON surrounded by text', () => {
    const input = 'Here is my analysis:\n' + JSON.stringify({
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    }) + '\nHope that helps!';
    const result = parseClaudeResponse(input);
    expect(result.verdict).toBe('safe');
  });

  it('always sets mode to label', () => {
    const input = JSON.stringify({
      mode: 'menu',
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    });
    const result = parseClaudeResponse(input);
    expect(result.mode).toBe('label');
  });
});

describe('buildIngredientContext', () => {
  it('builds context with all fields', () => {
    const product = {
      product_name: 'Test Cookies',
      ingredients_text: 'Sugar, flour, butter',
      allergens_tags: ['en:gluten', 'en:milk'],
      traces_tags: ['en:nuts'],
      labels_tags: ['en:no-gluten'],
    };
    const context = buildIngredientContext(product);
    expect(context).toContain('Product: Test Cookies');
    expect(context).toContain('Ingredients: Sugar, flour, butter');
    expect(context).toContain('Allergens: gluten, milk');
    expect(context).toContain('Cross-contamination traces: nuts');
    expect(context).toContain('Certifications: no-gluten');
  });

  it('returns context with only ingredients', () => {
    const product = {
      product_name: 'Simple Product',
      ingredients_text: 'Water, sugar',
    };
    const context = buildIngredientContext(product);
    expect(context).toContain('Product: Simple Product');
    expect(context).toContain('Ingredients: Water, sugar');
  });

  it('returns context with only allergen tags', () => {
    const product = {
      product_name: 'Mystery Product',
      allergens_tags: ['en:wheat'],
    };
    const context = buildIngredientContext(product);
    expect(context).toContain('Allergens: wheat');
  });

  it('returns null when no ingredients or allergens', () => {
    const product = {
      product_name: 'Empty Product',
    };
    const context = buildIngredientContext(product);
    expect(context).toBeNull();
  });

  it('returns null when allergens array is empty and no ingredients', () => {
    const product = {
      product_name: 'Empty Product',
      allergens_tags: [],
    };
    const context = buildIngredientContext(product);
    expect(context).toBeNull();
  });

  it('skips non-gluten labels', () => {
    const product = {
      ingredients_text: 'Water',
      labels_tags: ['en:organic', 'en:vegan'],
    };
    const context = buildIngredientContext(product);
    expect(context).not.toContain('Certifications');
  });
});

describe('assessGlutenSignal', () => {
  // Regression: KIND Healthy Grains Peanut Butter (barcode 602652171826).
  // OFF tags `en:gluten` as an allergen (auto-derived from oats) AND `en:no-gluten`
  // as a label, while the ingredients contain no wheat/barley/rye. The barcode path
  // wrongly returned "Unsafe" by trusting the allergen tag.
  const KIND = {
    ingredients_text:
      'whole grain blend (oats, brown rice, buckwheat, millet, amaranth, quinoa), dried cane syrup, soy crisp (soy protein isolate, tapioca starch, calcium carbonate), peanut butter, peanut oil, tapioca syrup, peanuts, peanut flour, brown rice syrup, salt, vitamin e (to maintain freshness),',
    allergens_tags: ['en:gluten', 'en:peanuts', 'en:soybeans'],
    labels_tags: ['en:no-gluten', 'en:non-gmo-project'],
  };

  it('flags a gluten allergen tag not corroborated by the ingredient list', () => {
    const note = assessGlutenSignal(KIND);
    expect(note).toBeTruthy();
    expect(note).toMatch(/not corroborated/i);
    expect(note).toMatch(/do not mark .*unsafe/i);
  });

  it('flags the gluten-free label vs gluten allergen contradiction', () => {
    const note = assessGlutenSignal(KIND);
    expect(note).toMatch(/gluten-free label/i);
  });

  it('returns null when a gluten allergen tag IS corroborated by ingredients', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'Enriched wheat flour, sugar, butter',
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });

  it('returns null when there is no gluten allergen tag', () => {
    const note = assessGlutenSignal({
      ingredients_text: 'oats, brown rice, salt',
      allergens_tags: ['en:peanuts'],
    });
    expect(note).toBeNull();
  });

  it('does not flag when ingredient data is absent (tag cannot be disproven)', () => {
    const note = assessGlutenSignal({
      allergens_tags: ['en:gluten'],
    });
    expect(note).toBeNull();
  });
});

describe('buildIngredientContext data reliability (UPCitemdb)', () => {
  it('appends a retail-listing reliability caveat for upcitemdb-sourced ingredients', () => {
    const context = buildIngredientContext({
      source: 'upcitemdb',
      product_name: 'Honey Nut Cheerios',
      ingredients_text: 'WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.',
    });
    expect(context).toMatch(/DATA RELIABILITY/);
    expect(context).toMatch(/retail product listing/i);
  });

  it('does not add the retail-listing caveat for Open Food Facts data', () => {
    const context = buildIngredientContext({
      source: 'openfoodfacts',
      product_name: 'Rice Cakes',
      ingredients_text: 'rice, salt',
    });
    expect(context).not.toMatch(/retail product listing/i);
  });
});

describe('buildIngredientContext gluten reconciliation', () => {
  it('appends the reliability caveat for the KIND regression product', () => {
    const context = buildIngredientContext({
      product_name: 'healthy grains granola Peanut Butter',
      ingredients_text:
        'whole grain blend (oats, brown rice, buckwheat, millet, amaranth, quinoa), peanut butter, salt',
      allergens_tags: ['en:gluten', 'en:peanuts', 'en:soybeans'],
      labels_tags: ['en:no-gluten'],
    });
    expect(context).toMatch(/not corroborated/i);
  });

  it('does not append a caveat for a genuine wheat product', () => {
    const context = buildIngredientContext({
      product_name: 'Wheat Crackers',
      ingredients_text: 'Wheat flour, salt, yeast',
      allergens_tags: ['en:gluten'],
    });
    expect(context).not.toMatch(/not corroborated/i);
  });
});

// GLUTENORNOT-MOBILE-7: the mobile client aborts barcode lookups at 30s, but the
// server put no timeout on the external product-database fetches — one slow
// Open Food Facts response could blow the whole budget. Every external lookup
// must carry an abort signal and treat a timeout as a miss, not a crash.
describe('lookup timeouts', () => {
  function restore(key, value) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('lookupOpenFoodFacts passes an abort signal to fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'X', ingredients_text: 'water' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await lookupOpenFoodFacts('12345678');
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('lookupOpenFoodFacts returns null (a miss) when every variant times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ));
    await expect(lookupOpenFoodFacts('12345678')).resolves.toBeNull();
  });

  it('lookupUSDA passes an abort signal to fetch', async () => {
    const saved = process.env.USDA_API_KEY;
    process.env.USDA_API_KEY = 'test-key';
    try {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) });
      vi.stubGlobal('fetch', fetchSpy);
      await lookupUSDA('12345678');
      expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      restore('USDA_API_KEY', saved);
    }
  });

  it('lookupUpcItemDb passes an abort signal to fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'OK', total: 1, items: [{ title: 'Snack', brand: 'BrandCo' }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await lookupUpcItemDb('012345678905');
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('lookupUpcItemDb returns null (a miss) on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ));
    await expect(lookupUpcItemDb('012345678905')).resolves.toBeNull();
  });

  it('lookupNutritionix passes an abort signal to fetch', async () => {
    const savedId = process.env.NUTRITIONIX_APP_ID;
    const savedKey = process.env.NUTRITIONIX_API_KEY;
    process.env.NUTRITIONIX_APP_ID = 'test-id';
    process.env.NUTRITIONIX_API_KEY = 'test-key';
    try {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) });
      vi.stubGlobal('fetch', fetchSpy);
      await lookupNutritionix('12345678');
      expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      restore('NUTRITIONIX_APP_ID', savedId);
      restore('NUTRITIONIX_API_KEY', savedKey);
    }
  });
});

// Nutritionix discontinued its free tier (Syndigo, $499/mo minimum), so UPCitemdb's
// keyless trial tier is the last waterfall source. It returns title/brand, plus —
// for many grocery items — a manufacturer ingredient statement embedded in its
// description field. With ingredients a hit gets a full (reliability-caveated)
// Claude analysis; without, it flows through the no-ingredient-data caution path.
describe('lookupUpcItemDb', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns product name, brand, and source on a hit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{ ean: '0012345678905', title: 'Corn Chips', brand: 'BrandCo' }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result).toEqual({
      source: 'upcitemdb',
      product_name: 'Corn Chips',
      brand: 'BrandCo',
    });
  });

  it('skips the lookup entirely for EAN-8 barcodes (different numbering space)', async () => {
    // Observed live: UPCitemdb zero-pads short codes into the UPC-A/EAN-13
    // space, so a valid EAN-8 resolves to an unrelated product (a query for
    // 96385074 returned "1000x Bucks Roblox").
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(lookupUpcItemDb('96385074')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a hit whose returned code does not match the queried barcode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{ ean: '0033149496577', title: 'Some Other Product', brand: 'WrongCo' }],
      }),
    }));
    await expect(lookupUpcItemDb('012345678905')).resolves.toBeNull();
  });

  it('accepts UPC-A ↔ EAN-13 leading-zero padding as the same product', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{ ean: '0016000275270', title: 'Honey Nut Cheerios', brand: 'General Mills' }],
      }),
    }));
    const result = await lookupUpcItemDb('016000275270');
    expect(result).not.toBeNull();
    expect(result.product_name).toBe('Honey Nut Cheerios');
  });

  it('returns null when the items array contains a null entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'OK', total: 1, items: [null] }),
    }));
    await expect(lookupUpcItemDb('012345678905')).resolves.toBeNull();
  });

  it('extracts ingredients_text when the description carries an explicit INGREDIENTS statement', async () => {
    // Observed live: grocery items often embed the full ingredient statement in
    // `description`, e.g. "INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, ...".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0016000275270',
          title: 'Honey Nut Cheerios',
          brand: 'General Mills',
          description: 'INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('016000275270');
    expect(result.ingredients_text).toBe('WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.');
  });

  it('does not treat a marketing description as ingredients', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Corn Chips',
          brand: 'BrandCo',
          description: 'A delicious crunchy snack the whole family will love.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  it('does not treat lowercase mid-sentence "ingredients:" marketing copy as ingredients', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Corn Chips',
          brand: 'BrandCo',
          description: 'Crafted with the finest ingredients: taste the difference. Perfect for parties.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  it('rejects an uppercase INGREDIENTS capture that does not look like an ingredient list', async () => {
    // Real statements are comma-separated lists; prose without a single comma
    // is noise even behind the right label.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'OK',
        total: 1,
        items: [{
          ean: '0012345678905',
          title: 'Corn Chips',
          brand: 'BrandCo',
          description: 'INGREDIENTS: taste the difference.',
        }],
      }),
    }));
    const result = await lookupUpcItemDb('012345678905');
    expect(result.ingredients_text).toBeUndefined();
  });

  it('returns null when the database has no match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'OK', total: 0, items: [] }),
    }));
    await expect(lookupUpcItemDb('12345678')).resolves.toBeNull();
  });

  it('returns null (a miss, not a crash) on a non-ok response like 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ code: 'EXCEED_LIMIT' }),
    }));
    await expect(lookupUpcItemDb('12345678')).resolves.toBeNull();
  });
});

describe('rate limiting (barcode)', () => {
  beforeEach(() => {
    _setRateLimitMap(new Map());
  });

  it('allows fresh IP', () => {
    expect(checkRateLimit('1.2.3.4')).toEqual({ allowed: true });
  });

  it('blocks IP at limit', () => {
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: 50, windowStart: Date.now() });
    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
  });

  it('increments count', () => {
    incrementRateLimit('1.2.3.4');
    const map = _getRateLimitMap();
    expect(map.get('1.2.3.4').count).toBe(1);
  });
});

describe('barcode handler analytics', () => {
  function mockRes() {
    return {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
  }

  function restore(key, value) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const OFF_MISS = { ok: true, json: async () => ({ status: 0 }) };

  let savedEnv;
  beforeEach(() => {
    _setRateLimitMap(new Map());
    vi.clearAllMocks();
    savedEnv = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      usda: process.env.USDA_API_KEY,
      nutritionixId: process.env.NUTRITIONIX_APP_ID,
      nutritionixKey: process.env.NUTRITIONIX_API_KEY,
    };
    // Keep the waterfall to Open Food Facts only so one fetch stub covers a miss.
    delete process.env.USDA_API_KEY;
    delete process.env.NUTRITIONIX_APP_ID;
    delete process.env.NUTRITIONIX_API_KEY;
  });
  afterEach(() => {
    restore('ANTHROPIC_API_KEY', savedEnv.anthropic);
    restore('USDA_API_KEY', savedEnv.usda);
    restore('NUTRITIONIX_APP_ID', savedEnv.nutritionixId);
    restore('NUTRITIONIX_API_KEY', savedEnv.nutritionixKey);
    vi.unstubAllGlobals();
  });

  it('tracks a not_found failure without recording the barcode (privacy: no record of what you scanned)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OFF_MISS));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: { 'x-client': 'ios' } }, res);
    expect(res.statusCode).toBe(404);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'not_found', platform: 'ios' })
    );
    expect(trackScanFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ barcode: expect.anything() })
    );
    expect(trackScan).not.toHaveBeenCalled();
  });

  it('falls through to UPCitemdb when Open Food Facts misses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('upcitemdb')) {
        return {
          ok: true,
          json: async () => ({
            code: 'OK',
            total: 1,
            items: [{ ean: '0012345678905', title: 'Corn Chips', brand: 'BrandCo' }],
          }),
        };
      }
      return OFF_MISS;
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '012345678905' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    expect(res.body.data_source).toBe('upcitemdb');
    expect(res.body.product_name).toBe('BrandCo - Corn Chips');
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ dataSource: 'upcitemdb', hadIngredientData: false })
    );
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  it('runs a full Claude analysis when a UPCitemdb description carries ingredients', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      verdict: 'caution',
      flagged_ingredients: ['oats'],
      allergen_warnings: [],
      explanation: 'Oats without GF certification.',
      confidence: 'medium',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify(analysis) }] }) };
      }
      if (String(url).includes('upcitemdb')) {
        return {
          ok: true,
          json: async () => ({
            code: 'OK',
            total: 1,
            items: [{
              ean: '0016000275270',
              title: 'Honey Nut Cheerios',
              brand: 'General Mills',
              description: 'INGREDIENTS: / WHOLE GRAIN OATS, SUGAR, OAT BRAN, SALT.',
            }],
          }),
        };
      }
      return OFF_MISS;
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '016000275270' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    expect(res.body.data_source).toBe('upcitemdb');
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ dataSource: 'upcitemdb', hadIngredientData: true, confidence: 'medium' })
    );
  });

  it('tracks a rate_limited failure when the daily limit is hit', async () => {
    _getRateLimitMap().set('unknown', { count: 50, windowStart: Date.now() });
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(429);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'rate_limited' })
    );
  });

  it('tracks a claude_error failure when analysis fails', async () => {
    delete process.env.ANTHROPIC_API_KEY; // callClaude throws a persistent ClaudeError
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'Crackers', ingredients_text: 'wheat flour' } }),
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'barcode', reason: 'claude_error' })
    );
  });

  it('tracks the no-ingredient-data caution with confidence low and had_ingredient_data false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, product: { product_name: 'Mystery Snack' } }),
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 'low', hadIngredientData: false })
    );
  });

  it('tracks a successful analysis with Claude confidence and had_ingredient_data true', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify(analysis) }] }) };
      }
      return {
        ok: true,
        json: async () => ({ status: 1, product: { product_name: 'Rice Cakes', ingredients_text: 'rice, salt' } }),
      };
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { barcode: '12345678' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 'high', hadIngredientData: true })
    );
    expect(trackScanFailure).not.toHaveBeenCalled();
  });
});

describe('formatTimeRemaining (barcode)', () => {
  it('formats hours', () => {
    expect(formatTimeRemaining(2 * 60 * 60 * 1000)).toBe('2 hours');
  });

  it('formats minutes', () => {
    expect(formatTimeRemaining(30 * 60 * 1000)).toBe('30 minutes');
  });
});
