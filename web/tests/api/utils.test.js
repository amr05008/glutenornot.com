import { describe, it, expect } from 'vitest';
import { getClientGeo } from '../../../api/_utils.js';

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
