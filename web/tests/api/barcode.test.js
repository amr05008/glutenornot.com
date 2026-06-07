import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseClaudeResponse,
  buildIngredientContext,
  assessGlutenSignal,
} from '../../../api/barcode.js';
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

describe('formatTimeRemaining (barcode)', () => {
  it('formats hours', () => {
    expect(formatTimeRemaining(2 * 60 * 60 * 1000)).toBe('2 hours');
  });

  it('formats minutes', () => {
    expect(formatTimeRemaining(30 * 60 * 1000)).toBe('30 minutes');
  });
});
