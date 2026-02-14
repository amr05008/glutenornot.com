import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseClaudeResponse,
  checkRateLimit,
  incrementRateLimit,
  formatTimeRemaining,
  RATE_LIMIT,
  RATE_LIMIT_WINDOW,
  _setRateLimitMap,
  _getRateLimitMap
} from '../../../api/analyze.js';
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

  it('falls back to caution for invalid verdict value', () => {
    const result = parseClaudeResponse(fixtures.invalid_verdict_value.input);
    expect(result).toEqual(fixtures.invalid_verdict_value.expected);
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

  it('filters invalid menu_items (bad verdict or missing name)', () => {
    const result = parseClaudeResponse(fixtures.menu_with_invalid_items.input);
    expect(result).toEqual(fixtures.menu_with_invalid_items.expected);
    expect(result.menu_items).toHaveLength(1);
    expect(result.menu_items[0].name).toBe('Good Item');
  });

  it('defaults mode to label when not specified', () => {
    const result = parseClaudeResponse(fixtures.valid_unsafe.input);
    expect(result.mode).toBe('label');
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
