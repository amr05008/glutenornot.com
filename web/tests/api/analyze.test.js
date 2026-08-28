import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Replace the analytics senders with spies so handler tests can assert on what
// gets tracked without ever talking to PostHog. Everything else stays real.
vi.mock('../../../api/_analytics.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, trackScan: vi.fn(), trackScanFailure: vi.fn() };
});

import handler, {
  normalizeMode,
  applySafeVerdictFloor,
  MIN_OCR_CHARS_FOR_SAFE,
  parseClaudeResponse,
  detectGlutenFreeClaim,
  performOCR,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  CLAUDE_PROMPT,
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  _setRateLimitMap,
  _getRateLimitMap
} from '../../../api/analyze.js';
import { trackScan, trackScanFailure } from '../../../api/_analytics.js';
import fixtures from '../fixtures/claude-responses.json';

describe('parseClaudeResponse', () => {
  it('extracts correctly structured response from valid JSON', () => {
    const result = parseClaudeResponse(fixtures.valid_unsafe.input);
    expect(result).toEqual(fixtures.valid_unsafe.expected);
  });

  it('extracts JSON when surrounded by extra text', () => {
    const result = parseClaudeResponse(fixtures.valid_with_surrounding_text.input);
    expect(result).toEqual(fixtures.valid_with_surrounding_text.expected);
  });

  it('fills defaults for missing optional fields', () => {
    const result = parseClaudeResponse(fixtures.missing_optional_fields.input);
    expect(result).toEqual(fixtures.missing_optional_fields.expected);
  });

  // Pre-release review 2026-07-27 #5: a non-standard verdict normalizes to
  // caution but KEEPS the rest of the analysis (matching the barcode parser),
  // instead of discarding it for the generic "Unable to fully analyze" fallback.
  it('normalizes an invalid verdict to caution, keeping the analysis', () => {
    const result = parseClaudeResponse(fixtures.invalid_verdict_value.input);
    expect(result).toEqual(fixtures.invalid_verdict_value.expected);
  });

  it('normalizes a cased verdict instead of discarding a complete analysis', () => {
    const result = parseClaudeResponse(JSON.stringify({
      verdict: 'Safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'No gluten ingredients found.',
      confidence: 'high',
    }));
    expect(result.verdict).toBe('safe');
    expect(result.explanation).toBe('No gluten ingredients found.');
    expect(result.confidence).toBe('high');
  });

  it('maps a WARNING verdict to caution, keeping flagged ingredients', () => {
    const result = parseClaudeResponse(JSON.stringify({
      verdict: 'WARNING',
      flagged_ingredients: ['malt extract'],
      allergen_warnings: [],
      explanation: 'Contains malt extract.',
      confidence: 'medium',
    }));
    expect(result.verdict).toBe('caution');
    expect(result.flagged_ingredients).toEqual(['malt extract']);
    expect(result.explanation).toBe('Contains malt extract.');
  });

  it('falls back to caution when no JSON found', () => {
    const result = parseClaudeResponse(fixtures.no_json_found.input);
    expect(result).toEqual(fixtures.no_json_found.expected);
  });

  it('falls back to caution for malformed JSON', () => {
    const result = parseClaudeResponse(fixtures.malformed_json.input);
    expect(result).toEqual(fixtures.malformed_json.expected);
  });

  it('falls back to caution for empty response', () => {
    const result = parseClaudeResponse(fixtures.empty_response.input);
    expect(result).toEqual(fixtures.empty_response.expected);
  });

  it('parses structured menu response with menu_items array', () => {
    const result = parseClaudeResponse(fixtures.valid_menu_response.input);
    expect(result).toEqual(fixtures.valid_menu_response.expected);
    expect(result.mode).toBe('menu');
    expect(result.menu_items).toHaveLength(6);
  });

  it('normalizes invalid verdicts and filters items missing name', () => {
    const result = parseClaudeResponse(fixtures.menu_with_invalid_items.input);
    expect(result).toEqual(fixtures.menu_with_invalid_items.expected);
    expect(result.menu_items).toHaveLength(2);
    expect(result.menu_items[0].name).toBe('Good Item');
    expect(result.menu_items[1].name).toBe('Bad Item');
    expect(result.menu_items[1].verdict).toBe('caution');
  });

  it('defaults mode to label when not specified', () => {
    const result = parseClaudeResponse(fixtures.valid_unsafe.input);
    expect(result.mode).toBe('label');
  });

  it('normalizes capitalized mode to lowercase', () => {
    const result = parseClaudeResponse(fixtures.menu_with_capitalized_mode.input);
    expect(result).toEqual(fixtures.menu_with_capitalized_mode.expected);
    expect(result.mode).toBe('menu');
    expect(result.menu_items).toHaveLength(1);
  });

  it('preserves detected_language for Spanish label response', () => {
    const result = parseClaudeResponse(fixtures.spanish_label_unsafe.input);
    expect(result).toEqual(fixtures.spanish_label_unsafe.expected);
    expect(result.detected_language).toBe('es');
    expect(result.flagged_ingredients).toContain('harina de trigo (wheat flour)');
    expect(result.flagged_ingredients).toContain('cebada (barley)');
  });

  it('preserves detected_language for safe Spanish label', () => {
    const result = parseClaudeResponse(fixtures.spanish_label_safe.input);
    expect(result).toEqual(fixtures.spanish_label_safe.expected);
    expect(result.detected_language).toBe('es');
    expect(result.verdict).toBe('safe');
  });

  it('preserves detected_language for Spanish menu response', () => {
    const result = parseClaudeResponse(fixtures.spanish_menu_response.input);
    expect(result).toEqual(fixtures.spanish_menu_response.expected);
    expect(result.detected_language).toBe('es');
    expect(result.mode).toBe('menu');
    expect(result.menu_items).toHaveLength(4);
    expect(result.menu_items[0].name).toBe('Ensalada Mixta');
  });

  it('omits detected_language when not present in response', () => {
    const result = parseClaudeResponse(fixtures.english_label_no_language.input);
    expect(result).toEqual(fixtures.english_label_no_language.expected);
    expect(result.detected_language).toBeUndefined();
  });
});

// Safety floor (2026-08-13 analytics review): on 2026-07-19 a 3-character OCR
// read came back "safe". Every other sub-threshold read degraded to caution on
// its own, so this is a missing floor, not a calibration problem — and "safe"
// is the word a celiac acts on.
describe('applySafeVerdictFloor', () => {
  const safeLabel = () => ({
    mode: 'label',
    verdict: 'safe',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: 'Good news! This product contains no gluten ingredients.',
    confidence: 'low',
  });

  it('floors a "safe" verdict to caution when almost no text was extracted', () => {
    const result = applySafeVerdictFloor(safeLabel(), 3);
    expect(result.verdict).toBe('caution');
    expect(result.confidence).toBe('low');
    expect(result.explanation).not.toContain('Good news');
  });

  it('leaves a "safe" verdict alone at the threshold', () => {
    const result = applySafeVerdictFloor(safeLabel(), MIN_OCR_CHARS_FOR_SAFE);
    expect(result.verdict).toBe('safe');
    expect(result.explanation).toContain('Good news');
  });

  it('never upgrades: an unsafe verdict on a tiny read stays unsafe', () => {
    const result = applySafeVerdictFloor({ ...safeLabel(), verdict: 'unsafe' }, 3);
    expect(result.verdict).toBe('unsafe');
  });

  it('keeps a caution verdict and its explanation untouched', () => {
    const analysis = { ...safeLabel(), verdict: 'caution', explanation: 'Contains oats.' };
    const result = applySafeVerdictFloor(analysis, 3);
    expect(result.verdict).toBe('caution');
    expect(result.explanation).toBe('Contains oats.');
  });

  // A per-item "safe" badge on a menu is acted on exactly like the overall
  // verdict, so it gets the same floor.
  it('floors safe menu_items on a near-empty menu read', () => {
    const result = applySafeVerdictFloor({
      mode: 'menu',
      verdict: 'caution',
      menu_items: [
        { name: 'Ensalada', verdict: 'safe', notes: 'No gluten ingredients listed' },
        { name: 'Pan', verdict: 'unsafe', notes: 'Bread' },
      ],
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: '1 item looks safe.',
      confidence: 'medium',
    }, 20);
    expect(result.menu_items[0].verdict).toBe('caution');
    expect(result.menu_items[1].verdict).toBe('unsafe');
    expect(result.confidence).toBe('low');
  });

  it('is a no-op when ocr_chars is unknown', () => {
    expect(applySafeVerdictFloor(safeLabel(), undefined).verdict).toBe('safe');
  });

  // parseClaudeResponse only sanitises menu_items when mode === 'menu', so a
  // label response carrying that array arrives here unfiltered. A throw in the
  // safety path would turn the scan into a 500.
  it('survives a junk menu_items array on a label response', () => {
    const result = applySafeVerdictFloor(
      { ...safeLabel(), mode: 'label', menu_items: [null, undefined, { name: 'x', verdict: 'safe' }] },
      20,
    );
    expect(result.verdict).toBe('caution');
    expect(result.menu_items[2].verdict).toBe('caution');
  });

  it('tells a menu scan to reframe the menu, not an ingredient list', () => {
    const result = applySafeVerdictFloor(
      { mode: 'menu', verdict: 'safe', menu_items: [], explanation: 'All items look safe.', confidence: 'low' },
      20,
    );
    expect(result.explanation).toContain('menu');
  });
});

describe('CLAUDE_PROMPT multilingual support', () => {
  it('instructs Claude to detect the language of OCR text', () => {
    expect(CLAUDE_PROMPT).toContain('detected_language');
  });

  it('includes Spanish gluten-containing ingredient terms', () => {
    expect(CLAUDE_PROMPT).toContain('harina de trigo');
    expect(CLAUDE_PROMPT).toContain('cebada');
    expect(CLAUDE_PROMPT).toContain('centeno');
  });

  it('includes French gluten-containing ingredient terms', () => {
    expect(CLAUDE_PROMPT).toContain('farine de blé');
    expect(CLAUDE_PROMPT).toContain('orge');
    expect(CLAUDE_PROMPT).toContain('seigle');
    expect(CLAUDE_PROMPT).toContain('épeautre');
  });

  it('includes French allergen phrases', () => {
    expect(CLAUDE_PROMPT).toContain('Contient du gluten');
    expect(CLAUDE_PROMPT).toContain('Peut contenir des traces de blé');
    expect(CLAUDE_PROMPT).toContain('Sans gluten');
  });

  it('includes French restaurant dish watchlist', () => {
    expect(CLAUDE_PROMPT).toContain('croque-monsieur');
    expect(CLAUDE_PROMPT).toContain('pané');
  });

  it('instructs Claude to translate flagged ingredients', () => {
    expect(CLAUDE_PROMPT).toMatch(/translat/i);
  });

  it('instructs Claude to keep explanations in English', () => {
    expect(CLAUDE_PROMPT).toMatch(/english/i);
  });
});

// Pre-release review 2026-07-27 #2: the barcode waterfall got per-fetch abort
// budgets (GLUTENORNOT-MOBILE-7) but the OCR path's Vision fetch had none — a
// hung upstream burned the function until Vercel's 300s cap while the user
// stared at a spinner. The Vision call must be time-bounded, and a timeout is
// a Vision failure (OCR_ERROR), not an unclassified crash.
// plans/gf-label-claim-2026-08-28.md / decision 003: an explicit gluten-free
// claim is a regulated claim (FDA 21 CFR 101.91, EU 828/2014) and beats the
// ambiguous-ingredient heuristics — the incident label came back caution with
// an explanation that opened "Good news — this is labeled gluten-free".
describe('CLAUDE_PROMPT gluten-free label claims', () => {
  // The rule lives in its own block so these assertions can't be satisfied by
  // the glossary lines that merely translate "Sin gluten" etc.
  function claimsBlock() {
    const [, rest = ''] = CLAUDE_PROMPT.split('#### Gluten-free label claims');
    return rest.split('####')[0];
  }

  it('has a dedicated gluten-free label claims block', () => {
    expect(claimsBlock()).not.toBe('');
  });

  it('tells Claude a claim keeps ambiguous ingredients from lowering the verdict', () => {
    expect(claimsBlock()).toMatch(/do NOT lower the verdict/);
    expect(claimsBlock()).toMatch(/Return "safe"/);
  });

  it('keeps oats at caution unless the claim is a certification mark (T2)', () => {
    expect(claimsBlock()).toMatch(/Oats — still "caution", unless the claim is a third-party certification mark/);
    expect(claimsBlock()).toContain('GFCO');
  });

  it('keeps a listed gluten source and may-contain advisories at caution despite the claim (T1, T3)', () => {
    expect(claimsBlock()).toMatch(/A listed gluten source/);
    expect(claimsBlock()).toMatch(/label and the ingredient list\s+disagree/);
    expect(claimsBlock()).toMatch(/"may contain wheat\/gluten"/);
  });

  it('ignores negated or unrelated gluten-free phrasing (negation guard)', () => {
    expect(claimsBlock()).toContain('"not gluten-free"');
    expect(claimsBlock()).toContain('"gluten-free options available"');
    expect(claimsBlock()).toMatch(/"gluten-free facility"/);
  });

  // /grill 2026-08-28: "Ignore 'not gluten-free'" measurably talked the model
  // out of calling a self-declared non-GF product unsafe (baseline unsafe×3
  // → caution×3). A negated claim is a gluten statement, not a no-op.
  it('treats a negated claim as a statement that the product contains gluten', () => {
    expect(claimsBlock()).toMatch(/statement that the product contains gluten/);
    expect(claimsBlock()).toMatch(/Return "unsafe"/);
  });

  it('names the near-claims that are not gluten-free claims', () => {
    for (const phrase of ['"wheat-free"', '"gluten-friendly"', '"gluten-reduced"', '"very low gluten"']) {
      expect(claimsBlock()).toContain(phrase);
    }
  });

  it('scopes an ingredient-level claim to that ingredient, not the product', () => {
    expect(claimsBlock()).toContain('"gluten-free soy sauce"');
    expect(claimsBlock()).toMatch(/covers only that ingredient/);
  });

  it('treats a claim with no visible ingredient list as an incomplete read', () => {
    expect(claimsBlock()).toMatch(/no visible ingredient list/);
    expect(claimsBlock()).toMatch(/incomplete read/);
  });

  it('lists the claim phrases for every supported language (T7)', () => {
    for (const phrase of ['sin gluten', 'libre de gluten', 'glutenvrij', 'sense gluten', 'sans gluten', 'senza glutine', 'glutenfrei', 'sem glúten']) {
      expect(claimsBlock()).toContain(`"${phrase}"`);
    }
  });

  it('narrows the HVP caution to hydrolyzed protein of unstated source', () => {
    expect(CLAUDE_PROMPT).toContain('hydrolyzed vegetable/plant protein of unstated source');
    expect(CLAUDE_PROMPT).toContain('"hydrolyzed soy protein"');
    // The old unconditional entry is gone
    expect(CLAUDE_PROMPT).not.toContain('hydrolyzed vegetable protein, soy sauce');
  });

  it('gives a safe-tone example that names the label as what covers the ingredients', () => {
    expect(CLAUDE_PROMPT).toContain("Labeled gluten-free — that's a regulated claim");
  });

  it('still keeps the general be-conservative rule (guard — everything the block does not name)', () => {
    expect(CLAUDE_PROMPT).toContain('Be conservative—when uncertain, use "caution"');
  });
});

// Presence signal for the gf_claim_present analytics property — a boolean for
// measuring the rule's effect, never the verdict rule itself (Claude reads the
// text). Deterministic so it is testable and cannot drift with the model.
describe('detectGlutenFreeClaim', () => {
  it.each([
    ['English, spaced', 'INGREDIENTS: corn, salt.\nGluten Free\nNET WT 7 OZ'],
    ['English, hyphenated + upper-case', 'GLUTEN-FREE\nINGREDIENTS: rice'],
    ['English, no separator', 'Glutenfree snack'],
    ['certification mark, spelled out', 'Certified Gluten-Free (GFCO)'],
    ['certification mark, acronym only', 'Look for the GFCO seal'],
    ['Spanish: sin gluten', 'PATATAS FRITAS\nSin gluten\nINGREDIENTES: patatas'],
    ['Spanish: libre de gluten', 'Libre de gluten'],
    ['Dutch', 'Glutenvrij\nINGREDIËNTEN: aardappelen'],
    ['Catalan', 'Sense gluten'],
    ['French', 'Sans gluten'],
    ['Italian', 'Senza glutine'],
    ['German', 'glutenfrei'],
    ['Portuguese, accented', 'Sem glúten'],
    ['Portuguese, unaccented OCR', 'sem gluten'],
    // OCR emits typographic dashes; packaging uses the inflected forms
    ['English, en dash', 'Gluten–Free'],
    ['English, em dash', 'Gluten—Free'],
    ['English, unicode hyphen', 'Gluten‐Free'],
    ['Dutch, inflected', 'Glutenvrije koekjes'],
    ['German, inflected', 'Glutenfreie Kekse'],
  ])('detects a claim: %s', (_label, text) => {
    expect(detectGlutenFreeClaim(text)).toBe(true);
  });

  it.each([
    ['no claim at all', 'INGREDIENTS: wheat flour, sugar, salt.\nCONTAINS: WHEAT.'],
    ['the word gluten alone', 'Contains gluten'],
    ['negated English claim', 'This product is not gluten-free.'],
    ['negated, hyphen-less', 'NOT GLUTEN FREE'],
    ['a near-claim: wheat-free', 'Wheat-Free'],
    ['a near-claim: gluten-friendly', 'Gluten Friendly'],
    ['a near-claim: very low gluten', 'Very low gluten'],
    ['a near-claim: gluten-reduced', 'Gluten-Reduced'],
    ['empty string', ''],
    ['non-string', null],
  ])('returns false for %s', (_label, text) => {
    expect(detectGlutenFreeClaim(text)).toBe(false);
  });

  it('is only a presence signal: a negated claim next to an affirmative one still counts', () => {
    // Claude decides the verdict; this flag just says the phrase appeared.
    expect(detectGlutenFreeClaim('Not gluten-free? Try our Gluten Free line.')).toBe(true);
  });
});

describe('performOCR timeouts', () => {
  const ORIGINAL_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_CLOUD_VISION_API_KEY = 'test-vision-key';
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GOOGLE_CLOUD_VISION_API_KEY;
    else process.env.GOOGLE_CLOUD_VISION_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('passes an abort signal to the Vision fetch', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [{ textAnnotations: [{ description: 'WHEAT FLOUR, SALT' }] }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await performOCR('base64data');
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('surfaces a Vision timeout as OCR_ERROR (a bounded, classified failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    ));
    await expect(performOCR('base64data')).rejects.toThrow('OCR_ERROR');
  });
});

describe('normalizeMode', () => {
  it('normalizes "Menu" to "menu"', () => {
    expect(normalizeMode('Menu')).toBe('menu');
  });

  it('normalizes "LABEL" to "label"', () => {
    expect(normalizeMode('LABEL')).toBe('label');
  });

  it('returns null for unknown mode', () => {
    expect(normalizeMode('unknown')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(normalizeMode(undefined)).toBeNull();
    expect(normalizeMode(null)).toBeNull();
    expect(normalizeMode(123)).toBeNull();
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    _setRateLimitMap(new Map());
  });

  it('allows fresh IP with no record', () => {
    const result = checkRateLimit('1.2.3.4');
    expect(result).toEqual({ allowed: true });
  });

  it('allows IP under the limit', () => {
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: 25, windowStart: Date.now() });

    const result = checkRateLimit('1.2.3.4');
    expect(result).toEqual({ allowed: true });
  });

  it('blocks IP at the limit', () => {
    const now = Date.now();
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: RATE_LIMIT, windowStart: now });

    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.resetIn).toBeGreaterThan(0);
  });

  it('blocks IP over the limit', () => {
    const now = Date.now();
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: RATE_LIMIT + 1, windowStart: now });

    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
  });

  it('allows IP after window expires', () => {
    const map = _getRateLimitMap();
    const expiredWindowStart = Date.now() - RATE_LIMIT_WINDOW - 1000; // 25 hours ago
    map.set('1.2.3.4', { count: RATE_LIMIT, windowStart: expiredWindowStart });

    const result = checkRateLimit('1.2.3.4');
    expect(result).toEqual({ allowed: true });
  });

  it('calculates correct resetIn time', () => {
    const windowStart = Date.now() - (23 * 60 * 60 * 1000); // 23 hours ago
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: RATE_LIMIT, windowStart });

    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    // Should be approximately 1 hour remaining
    expect(result.resetIn).toBeGreaterThan(50 * 60 * 1000);
    expect(result.resetIn).toBeLessThan(70 * 60 * 1000);
  });
});

describe('incrementRateLimit', () => {
  beforeEach(() => {
    _setRateLimitMap(new Map());
  });

  it('creates record for new IP', () => {
    const before = Date.now();
    incrementRateLimit('1.2.3.4');
    const after = Date.now();

    const map = _getRateLimitMap();
    const record = map.get('1.2.3.4');

    expect(record.count).toBe(1);
    expect(record.windowStart).toBeGreaterThanOrEqual(before);
    expect(record.windowStart).toBeLessThanOrEqual(after);
  });

  it('increments count for existing IP', () => {
    const now = Date.now();
    const map = _getRateLimitMap();
    map.set('1.2.3.4', { count: 5, windowStart: now });

    incrementRateLimit('1.2.3.4');

    const record = map.get('1.2.3.4');
    expect(record.count).toBe(6);
    expect(record.windowStart).toBe(now); // Window start unchanged
  });

  it('resets count when window expires', () => {
    const map = _getRateLimitMap();
    const expiredWindowStart = Date.now() - RATE_LIMIT_WINDOW - 1000;
    map.set('1.2.3.4', { count: 50, windowStart: expiredWindowStart });

    const before = Date.now();
    incrementRateLimit('1.2.3.4');
    const after = Date.now();

    const record = map.get('1.2.3.4');
    expect(record.count).toBe(1);
    expect(record.windowStart).toBeGreaterThanOrEqual(before);
    expect(record.windowStart).toBeLessThanOrEqual(after);
  });
});

describe('analyze handler analytics', () => {
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

  const OCR_TEXT = { ok: true, json: async () => ({ responses: [{ textAnnotations: [{ description: 'rice, salt' }] }] }) };
  // Above MIN_OCR_CHARS_FOR_SAFE, for tests that need a verdict to survive the floor.
  const OCR_TEXT_FULL_LABEL = { ok: true, json: async () => ({ responses: [{ textAnnotations: [{ description: 'INGREDIENTS: '.concat('rice, salt, sunflower oil, sugar, citric acid, natural flavor, '.repeat(3)) }] }] }) };
  const OCR_EMPTY = { ok: true, json: async () => ({ responses: [{}] }) };

  let savedEnv;
  beforeEach(() => {
    _setRateLimitMap(new Map());
    vi.clearAllMocks();
    savedEnv = {
      vision: process.env.GOOGLE_CLOUD_VISION_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    };
    process.env.GOOGLE_CLOUD_VISION_API_KEY = 'vision-key';
  });
  afterEach(() => {
    restore('GOOGLE_CLOUD_VISION_API_KEY', savedEnv.vision);
    restore('ANTHROPIC_API_KEY', savedEnv.anthropic);
    vi.unstubAllGlobals();
  });

  it('tracks a rate_limited failure when the daily limit is hit', async () => {
    _getRateLimitMap().set('unknown', { count: 50, windowStart: Date.now() });
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'base64data' }, headers: {} }, res);
    expect(res.statusCode).toBe(429);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ocr', reason: 'rate_limited' })
    );
  });

  it('tracks an ocr_failed failure when the photo has no readable text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OCR_EMPTY));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'base64data' }, headers: { 'x-client': 'ios' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('OCR_FAILED');
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ocr', reason: 'ocr_failed', platform: 'ios' })
    );
    expect(trackScan).not.toHaveBeenCalled();
  });

  // OCR capture-assist instrumentation (plans/ocr-capture-assist-2026-07-18.md):
  // image_kb + ocr_chars on scan/scan_failed decide whether OCR failures are an
  // aiming problem (no text found) or a blur/light problem (small images), and
  // what size threshold a client-side pre-check should use.
  it('attaches image_kb and ocr_chars to ocr_failed failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OCR_EMPTY));
    const res = mockRes();
    // 4096 base64 chars ≈ 3072 bytes = 3 KB
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: {} }, res);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ocr_failed', imageKb: 3, ocrChars: 0 })
    );
  });

  it('attaches image_kb and ocr_chars to successful scans', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      mode: 'label',
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'All clear.',
      confidence: 'high',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      return OCR_TEXT;
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(trackScan).toHaveBeenCalledWith(
      // 'rice, salt' = 10 chars
      expect.objectContaining({ imageKb: 3, ocrChars: 10 })
    );
  });

  // End-to-end regression for the 2026-07-19 event: Vision returned 3 chars,
  // Claude answered "safe", and the app told a celiac the product was safe.
  it('never returns "safe" end-to-end when Vision extracted almost nothing', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      mode: 'label',
      verdict: 'safe',
      flagged_ingredients: [],
      allergen_warnings: [],
      explanation: 'Good news! No gluten ingredients here.',
      confidence: 'low',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      return { ok: true, json: async () => ({ responses: [{ textAnnotations: [{ description: 'GF!' }] }] }) };
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: { 'x-client': 'ios' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.verdict).toBe('caution');
    // The delivered verdict is what analytics must record, not Claude's raw one.
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: 'caution', ocrChars: 3 })
    );
  });

  it('records the app version and model from the request headers', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const analysis = {
      mode: 'label', verdict: 'unsafe', flagged_ingredients: ['wheat'],
      allergen_warnings: [], explanation: 'Contains wheat.', confidence: 'high',
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('anthropic')) {
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      return OCR_TEXT_FULL_LABEL;
    }));
    const res = mockRes();
    await handler(
      { method: 'POST', body: { image: 'A'.repeat(4096) }, headers: { 'x-client': 'ios', 'x-client-version': '1.4.2' } },
      res,
    );
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ appVersion: '1.4.2', model: 'claude-opus-4-8' })
    );
  });

  it('omits the app version when the client is too old to send it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OCR_EMPTY));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: { 'x-client': 'ios' } }, res);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ocr_failed', appVersion: null })
    );
  });

  it('rejects a non-string image with 400 instead of shipping junk to Vision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OCR_EMPTY));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 42 }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing image');
  });

  it('tracks ocr_failed via the return path when Vision finds only whitespace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ responses: [{ textAnnotations: [{ description: '   ' }] }] }),
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ocr_failed', imageKb: 3, ocrChars: 0 })
    );
  });

  it('attaches image_kb and ocr_chars to claude_error failures (OCR had succeeded)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OCR_TEXT));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: {} }, res);
    const args = trackScanFailure.mock.calls[0][0];
    expect(args.reason).toBe('claude_error');
    expect(args.imageKb).toBe(3);
    expect(args.ocrChars).toBe(10);
  });

  it('attaches image_kb but omits ocr_chars when the Vision call itself fails', async () => {
    // OCR_ERROR is thrown before ocrChars is ever assigned — the property must
    // be absent (omitted), not zero: zero means "Vision found no text".
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'A'.repeat(4096) }, headers: {} }, res);
    const args = trackScanFailure.mock.calls[0][0];
    expect(args.reason).toBe('server_error');
    expect(args.imageKb).toBe(3);
    expect(args.ocrChars).toBeUndefined();
  });

  it('tracks a claude_error failure when analysis fails', async () => {
    delete process.env.ANTHROPIC_API_KEY; // callClaude throws a persistent ClaudeError
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OCR_TEXT));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'base64data' }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ocr', reason: 'claude_error' })
    );
  });

  it('tracks a server_error failure when OCR itself errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'base64data' }, headers: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(trackScanFailure).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ocr', reason: 'server_error' })
    );
  });

  it('tracks a successful scan with Claude confidence', async () => {
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
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
      }
      // A full-label read: this asserts confidence passes through untouched,
      // which only holds above the safe-verdict floor.
      return OCR_TEXT_FULL_LABEL;
    }));
    const res = mockRes();
    await handler({ method: 'POST', body: { image: 'base64data' }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(trackScan).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ocr', confidence: 'high' })
    );
    expect(trackScanFailure).not.toHaveBeenCalled();
  });

  // gf_claim_present (plans/gf-label-claim-2026-08-28.md step 4): a boolean
  // detected server-side from the OCR text, so the rule's effect on the
  // caution share is measurable. A flag, never the claim text or the product.
  describe('gf_claim_present', () => {
    const analysis = { mode: 'label', verdict: 'safe', flagged_ingredients: [], allergen_warnings: [], explanation: 'Labeled gluten-free.', confidence: 'high' };
    const OCR_LABELED_GF = { ok: true, json: async () => ({ responses: [{ textAnnotations: [{ description: 'KETTLE CORN\nGluten Free\nINGREDIENTS: '.concat('popcorn, cane sugar, sunflower oil, sea salt, natural flavor, '.repeat(3)) }] }] }) };

    function stubScan(ocrResponse) {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('anthropic')) {
          return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(analysis) }] }) };
        }
        return ocrResponse;
      }));
    }

    it('tracks gfClaimPresent: true when the OCR text carries a gluten-free claim', async () => {
      stubScan(OCR_LABELED_GF);
      const res = mockRes();
      await handler({ method: 'POST', body: { image: 'base64data' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(trackScan).toHaveBeenCalledWith(expect.objectContaining({ method: 'ocr', gfClaimPresent: true }));
    });

    it('tracks gfClaimPresent: false when there is no claim', async () => {
      stubScan(OCR_TEXT_FULL_LABEL);
      const res = mockRes();
      await handler({ method: 'POST', body: { image: 'base64data' }, headers: {} }, res);
      expect(res.statusCode).toBe(200);
      expect(trackScan).toHaveBeenCalledWith(expect.objectContaining({ method: 'ocr', gfClaimPresent: false }));
    });
  });
});

describe('formatTimeRemaining', () => {
  it('formats hours plural correctly', () => {
    const ms = 2 * 60 * 60 * 1000; // 2 hours
    expect(formatTimeRemaining(ms)).toBe('2 hours');
  });

  it('formats hour singular correctly', () => {
    const ms = 1 * 60 * 60 * 1000; // 1 hour
    expect(formatTimeRemaining(ms)).toBe('1 hour');
  });

  it('formats minutes plural correctly', () => {
    const ms = 30 * 60 * 1000; // 30 minutes
    expect(formatTimeRemaining(ms)).toBe('30 minutes');
  });

  it('formats minute singular correctly', () => {
    const ms = 1 * 60 * 1000; // 1 minute
    expect(formatTimeRemaining(ms)).toBe('1 minute');
  });

  it('formats zero correctly', () => {
    // Note: 0 minutes uses singular form since 0 > 1 is false
    expect(formatTimeRemaining(0)).toBe('0 minute');
  });
});
