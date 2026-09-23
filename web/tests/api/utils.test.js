import { describe, it, expect } from 'vitest';
import { getClientGeo, CAUTION_REASONS, normalizeCautionReason } from '../../../api/_utils.js';

describe('normalizeCautionReason (decision 006)', () => {
  it('keeps a known reason, case- and whitespace-insensitively', () => {
    expect(normalizeCautionReason('caution', 'may_contain')).toBe('may_contain');
    expect(normalizeCautionReason('caution', ' OATS ')).toBe('oats');
  });

  it('maps a missing or unknown reason on a caution to "other"', () => {
    expect(normalizeCautionReason('caution', undefined)).toBe('other');
    expect(normalizeCautionReason('caution', 'natural flavors')).toBe('other');
    expect(normalizeCautionReason('caution', 42)).toBe('other');
  });

  it('drops any reason on a verdict that is not caution', () => {
    expect(normalizeCautionReason('safe', 'oats')).toBeUndefined();
    expect(normalizeCautionReason('unsafe', 'conflict')).toBeUndefined();
  });

  it('lists exactly the decision-006 reasons', () => {
    expect(CAUTION_REASONS).toEqual(['oats', 'may_contain', 'conflict', 'undeclared_source', 'incomplete', 'other']);
  });
});

describe('getClientGeo', () => {
  it('reads country, region, and city from Vercel edge headers', () => {
    const geo = getClientGeo({
      headers: {
        'x-vercel-ip-country': 'US',
        'x-vercel-ip-country-region': 'CA',
        'x-vercel-ip-city': 'San Francisco',
      },
    });
    expect(geo).toEqual({ country: 'US', region: 'CA', city: 'San Francisco' });
  });

  it('URL-decodes the city header (Vercel percent-encodes it)', () => {
    const geo = getClientGeo({
      headers: { 'x-vercel-ip-city': 'San%20Francisco' },
    });
    expect(geo.city).toBe('San Francisco');
  });

  it('leaves a malformed city encoding as-is rather than throwing', () => {
    const geo = getClientGeo({
      headers: { 'x-vercel-ip-city': '%E0%A4%A' },
    });
    expect(geo.city).toBe('%E0%A4%A');
  });

  it('returns null for any field the edge did not resolve', () => {
    const geo = getClientGeo({ headers: {} });
    expect(geo).toEqual({ country: null, region: null, city: null });
  });
});
