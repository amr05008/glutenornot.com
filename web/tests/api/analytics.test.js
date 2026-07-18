import { describe, it, expect, afterEach } from 'vitest';
import {
  buildScanProperties,
  buildScanFailureProperties,
  anonId,
  normalizeClient,
  trackScan,
  trackScanFailure,
  SCAN_EVENT,
  SCAN_FAILED_EVENT,
} from '../../../api/_analytics.js';

describe('SCAN_EVENT', () => {
  it('is the stable event name "scan"', () => {
    expect(SCAN_EVENT).toBe('scan');
  });
});

describe('buildScanProperties', () => {
  it('includes method and verdict', () => {
    const props = buildScanProperties({ method: 'barcode', verdict: 'safe' });
    expect(props.method).toBe('barcode');
    expect(props.verdict).toBe('safe');
  });

  it('includes mode when provided', () => {
    const props = buildScanProperties({ method: 'ocr', mode: 'menu', verdict: 'caution' });
    expect(props.mode).toBe('menu');
  });

  it('includes detected_language and data_source when provided', () => {
    const props = buildScanProperties({
      method: 'barcode',
      verdict: 'unsafe',
      detectedLanguage: 'es',
      dataSource: 'openfoodfacts',
    });
    expect(props.detected_language).toBe('es');
    expect(props.data_source).toBe('openfoodfacts');
  });

  it('omits optional fields that are not provided', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe' });
    expect(props).not.toHaveProperty('detected_language');
    expect(props).not.toHaveProperty('data_source');
    expect(props).not.toHaveProperty('mode');
  });

  it('includes platform when provided', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe', platform: 'web' });
    expect(props.platform).toBe('web');
  });

  it('maps geo fields to PostHog $geoip_* property names', () => {
    const props = buildScanProperties({
      method: 'ocr',
      verdict: 'safe',
      country: 'US',
      region: 'CA',
      city: 'San Francisco',
    });
    expect(props.$geoip_country_code).toBe('US');
    expect(props.$geoip_subdivision_1_code).toBe('CA');
    expect(props.$geoip_city_name).toBe('San Francisco');
  });

  it('omits geo properties when not provided', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe' });
    expect(props).not.toHaveProperty('$geoip_country_code');
    expect(props).not.toHaveProperty('$geoip_subdivision_1_code');
    expect(props).not.toHaveProperty('$geoip_city_name');
  });

  it('omits geo properties that are null', () => {
    const props = buildScanProperties({
      method: 'ocr',
      verdict: 'safe',
      country: 'US',
      region: null,
      city: null,
    });
    expect(props.$geoip_country_code).toBe('US');
    expect(props).not.toHaveProperty('$geoip_subdivision_1_code');
    expect(props).not.toHaveProperty('$geoip_city_name');
  });

  it('omits optional fields that are null or undefined', () => {
    const props = buildScanProperties({
      method: 'ocr',
      verdict: 'safe',
      mode: null,
      detectedLanguage: undefined,
      dataSource: null,
    });
    expect(props).not.toHaveProperty('mode');
    expect(props).not.toHaveProperty('detected_language');
    expect(props).not.toHaveProperty('data_source');
  });
});

describe('buildScanProperties (quality fields)', () => {
  it('includes confidence when provided', () => {
    const props = buildScanProperties({ method: 'barcode', verdict: 'caution', confidence: 'low' });
    expect(props.confidence).toBe('low');
  });

  it('records had_ingredient_data, including an explicit false', () => {
    const withData = buildScanProperties({ method: 'barcode', verdict: 'safe', hadIngredientData: true });
    expect(withData.had_ingredient_data).toBe(true);

    const withoutData = buildScanProperties({ method: 'barcode', verdict: 'caution', hadIngredientData: false });
    expect(withoutData.had_ingredient_data).toBe(false);
  });

  it('omits quality fields when not provided', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe' });
    expect(props).not.toHaveProperty('confidence');
    expect(props).not.toHaveProperty('had_ingredient_data');
  });
});

describe('SCAN_FAILED_EVENT', () => {
  it('is the stable event name "scan_failed"', () => {
    expect(SCAN_FAILED_EVENT).toBe('scan_failed');
  });
});

describe('buildScanFailureProperties', () => {
  it('includes method and reason', () => {
    const props = buildScanFailureProperties({ method: 'barcode', reason: 'not_found' });
    expect(props.method).toBe('barcode');
    expect(props.reason).toBe('not_found');
  });

  it('includes platform and maps geo fields to $geoip_* names', () => {
    const props = buildScanFailureProperties({
      method: 'ocr',
      reason: 'ocr_failed',
      platform: 'ios',
      country: 'US',
      region: 'VA',
      city: 'Virginia Beach',
    });
    expect(props.platform).toBe('ios');
    expect(props.$geoip_country_code).toBe('US');
    expect(props.$geoip_subdivision_1_code).toBe('VA');
    expect(props.$geoip_city_name).toBe('Virginia Beach');
  });

  it('omits optional fields that are not provided', () => {
    const props = buildScanFailureProperties({ method: 'barcode', reason: 'rate_limited' });
    expect(props).not.toHaveProperty('platform');
    expect(props).not.toHaveProperty('$geoip_country_code');
    expect(props).not.toHaveProperty('$geoip_subdivision_1_code');
    expect(props).not.toHaveProperty('$geoip_city_name');
  });

  it('never records the barcode, even if a caller passes one (privacy: no record of what you scanned)', () => {
    // The privacy policy promises no record of what users scanned and no
    // product names in analytics; a UPC resolves to a product name, so it
    // must never reach PostHog.
    const props = buildScanFailureProperties({ method: 'barcode', reason: 'not_found', barcode: '012345678905' });
    expect(props).not.toHaveProperty('barcode');
  });
});

describe('trackScanFailure (unconfigured)', () => {
  const original = process.env.POSTHOG_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = original;
  });

  it('no-ops without throwing when POSTHOG_API_KEY is unset', async () => {
    delete process.env.POSTHOG_API_KEY;
    await expect(
      trackScanFailure({ ip: '203.0.113.7', method: 'barcode', reason: 'not_found' })
    ).resolves.toBeUndefined();
  });
});

describe('normalizeClient', () => {
  it('passes through known clients', () => {
    expect(normalizeClient('ios')).toBe('ios');
    expect(normalizeClient('web')).toBe('web');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeClient('IOS')).toBe('ios');
    expect(normalizeClient('  Web ')).toBe('web');
  });

  it('falls back to "unknown" for missing or unexpected values', () => {
    expect(normalizeClient(undefined)).toBe('unknown');
    expect(normalizeClient('')).toBe('unknown');
    expect(normalizeClient('android')).toBe('unknown');
  });
});

describe('anonId', () => {
  it('returns the same id for the same IP (stable)', () => {
    expect(anonId('203.0.113.7')).toBe(anonId('203.0.113.7'));
  });

  it('returns different ids for different IPs', () => {
    expect(anonId('203.0.113.7')).not.toBe(anonId('203.0.113.8'));
  });

  it('never returns the raw IP (privacy)', () => {
    expect(anonId('203.0.113.7')).not.toContain('203.0.113.7');
  });

  it('falls back to "anonymous" for a missing IP', () => {
    expect(anonId('')).toBe('anonymous');
    expect(anonId(null)).toBe('anonymous');
    expect(anonId(undefined)).toBe('anonymous');
  });
});

describe('trackScan (unconfigured)', () => {
  const original = process.env.POSTHOG_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = original;
  });

  it('no-ops without throwing when POSTHOG_API_KEY is unset', async () => {
    delete process.env.POSTHOG_API_KEY;
    await expect(
      trackScan({ ip: '203.0.113.7', method: 'ocr', verdict: 'safe' })
    ).resolves.toBeUndefined();
  });
});
