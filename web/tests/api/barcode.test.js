import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseClaudeResponse,
  buildIngredientContext,
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
