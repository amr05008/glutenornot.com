import { describe, it, expect, afterEach, vi } from 'vitest';

// Controllable posthog-node stand-in for the flush-behavior tests below. The
// real SDK is only dynamically imported once POSTHOG_API_KEY is set, so the
// other suites in this file never touch it.
const posthogControl = vi.hoisted(() => ({
  shutdown: () => Promise.resolve(),
  captured: [],
}));
vi.mock('posthog-node', () => ({
  PostHog: class {
    capture(event) { posthogControl.captured.push(event); }
    shutdown() { return posthogControl.shutdown(); }
  },
}));

import {
  buildScanProperties,
  buildScanFailureProperties,
  anonId,
  normalizeClient,
  normalizeAppVersion,
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

describe('buildScanProperties capture instrumentation', () => {
  it('maps imageKb and ocrChars to snake_case properties when provided', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'caution', imageKb: 120, ocrChars: 250 });
    expect(props.image_kb).toBe(120);
    expect(props.ocr_chars).toBe(250);
  });

  it('omits image_kb and ocr_chars when not provided (barcode path)', () => {
    const props = buildScanProperties({ method: 'barcode', verdict: 'safe' });
    expect(props).not.toHaveProperty('image_kb');
    expect(props).not.toHaveProperty('ocr_chars');
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

  it('maps imageKb and ocrChars to snake_case properties when provided', () => {
    const props = buildScanFailureProperties({ method: 'ocr', reason: 'ocr_failed', imageKb: 42, ocrChars: 0 });
    expect(props.image_kb).toBe(42);
    expect(props.ocr_chars).toBe(0);
  });

  it('omits image_kb and ocr_chars when not provided', () => {
    const props = buildScanFailureProperties({ method: 'barcode', reason: 'not_found' });
    expect(props).not.toHaveProperty('image_kb');
    expect(props).not.toHaveProperty('ocr_chars');
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

// Release attribution (2026-08-13 analytics review): every event carries
// $lib_version = posthog-node, so without app_version a release cannot be
// measured — 1.4.1's capture work was unattributable for exactly this reason.
describe('normalizeAppVersion', () => {
  it('accepts a semver-shaped version', () => {
    expect(normalizeAppVersion('1.4.2')).toBe('1.4.2');
    expect(normalizeAppVersion('1.4')).toBe('1.4');
    expect(normalizeAppVersion('  1.4.2 ')).toBe('1.4.2');
  });

  // RC builds must stay taggable: a version-based rule is the only durable way
  // to exclude internal testing without hardcoding a hashed identity.
  it('accepts a bounded pre-release suffix', () => {
    expect(normalizeAppVersion('1.5.0-rc.1')).toBe('1.5.0-rc.1');
    expect(normalizeAppVersion('1.5.0-beta')).toBe('1.5.0-beta');
  });

  it('returns null when absent, so the property is omitted for older clients', () => {
    expect(normalizeAppVersion(undefined)).toBeNull();
    expect(normalizeAppVersion('')).toBeNull();
    expect(normalizeAppVersion(42)).toBeNull();
  });

  // The header is untrusted and lands in a PostHog property: arbitrary values
  // would let anyone blow up its cardinality and ruin version breakdowns.
  it('rejects anything that is not a short dotted-numeric version', () => {
    expect(normalizeAppVersion('9999.1')).toBeNull();
    expect(normalizeAppVersion('1')).toBeNull();
    expect(normalizeAppVersion('1.2.3.4')).toBeNull();
    expect(normalizeAppVersion('<script>')).toBeNull();
    expect(normalizeAppVersion('1.4.2-' + 'x'.repeat(50))).toBeNull();
    expect(normalizeAppVersion('1.4.2'.repeat(50))).toBeNull();
  });

  it('logs a rejected version instead of dropping it silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeAppVersion('not-a-version');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stays quiet when no version was sent at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeAppVersion(undefined);
    normalizeAppVersion('   ');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('buildScanProperties (release attribution)', () => {
  it('includes app_version and model when provided', () => {
    const props = buildScanProperties({
      method: 'ocr', verdict: 'safe', appVersion: '1.4.2', model: 'claude-opus-4-8',
    });
    expect(props.app_version).toBe('1.4.2');
    expect(props.model).toBe('claude-opus-4-8');
  });

  it('omits both when absent, so old clients stay distinguishable', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe' });
    expect('app_version' in props).toBe(false);
    expect('model' in props).toBe(false);
  });

  it('carries app_version onto failures too', () => {
    const props = buildScanFailureProperties({ method: 'ocr', reason: 'ocr_failed', appVersion: '1.4.2' });
    expect(props.app_version).toBe('1.4.2');
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

// Pre-release review 2026-07-27 #4: every scan response was serially blocked on
// a PostHog flush (up to the 2s shutdown cap when PostHog is degraded). On
// Vercel the flush must be handed to the request context's waitUntil so it
// completes after the response; without a context (local/dev) it is awaited as
// before so the event is still delivered.
describe('captureEvent flush scheduling', () => {
  const CTX_SYMBOL = Symbol.for('@vercel/request-context');
  const originalKey = process.env.POSTHOG_API_KEY;

  afterEach(() => {
    delete globalThis[CTX_SYMBOL];
    if (originalKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalKey;
    posthogControl.shutdown = () => Promise.resolve();
    posthogControl.captured = [];
  });

  it('hands the flush to waitUntil instead of blocking the response', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test';
    const waitUntil = vi.fn();
    globalThis[CTX_SYMBOL] = { get: () => ({ waitUntil }) };

    await trackScan({ ip: '203.0.113.7', method: 'ocr', verdict: 'safe' });

    expect(posthogControl.captured).toHaveLength(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('resolves without waiting for the flush when a request context exists', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test';
    // A flush that never settles: with waitUntil the scan response must not
    // depend on it.
    posthogControl.shutdown = () => new Promise(() => {});
    const waitUntil = vi.fn();
    globalThis[CTX_SYMBOL] = { get: () => ({ waitUntil }) };

    await expect(
      trackScan({ ip: '203.0.113.7', method: 'ocr', verdict: 'safe' })
    ).resolves.toBeUndefined();
  }, 1000);

  it('awaits the flush when no request context is available (local/dev)', async () => {
    process.env.POSTHOG_API_KEY = 'phc_test';
    let flushed = false;
    posthogControl.shutdown = async () => { flushed = true; };

    await trackScan({ ip: '203.0.113.7', method: 'ocr', verdict: 'safe' });

    expect(flushed).toBe(true);
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

describe('timing properties (plans/weak-signal-upload-2026-08-28.md)', () => {
  // Nothing recorded where a scan's time went before this: on weak signal the
  // upload dominates, but the server leg (Vision + Opus) was only ever an
  // estimate — decision 002 accepted Opus latency pending scan-duration data.
  it('maps ocrMs / claudeMs / totalMs to snake_case scan properties', () => {
    const props = buildScanProperties({ method: 'ocr', verdict: 'safe', ocrMs: 1210, claudeMs: 8400, totalMs: 9800 });
    expect(props).toMatchObject({ ocr_ms: 1210, claude_ms: 8400, total_ms: 9800 });
  });

  it('omits timing on a scan that has none (barcode path)', () => {
    const props = buildScanProperties({ method: 'barcode', verdict: 'safe' });
    expect(props).not.toHaveProperty('ocr_ms');
    expect(props).not.toHaveProperty('claude_ms');
    expect(props).not.toHaveProperty('total_ms');
  });

  it('records how long a cancelled attempt waited, and the OCR leg on server-side failures', () => {
    expect(buildScanFailureProperties({ method: 'ocr', reason: 'cancelled', elapsedMs: 31450 })).toMatchObject({
      elapsed_ms: 31450,
    });
    expect(buildScanFailureProperties({ method: 'ocr', reason: 'claude_error', ocrMs: 1300 })).toMatchObject({
      ocr_ms: 1300,
    });
  });

  it('omits elapsed_ms and ocr_ms from failures when unknown', () => {
    const props = buildScanFailureProperties({ method: 'barcode', reason: 'not_found' });
    expect(props).not.toHaveProperty('elapsed_ms');
    expect(props).not.toHaveProperty('ocr_ms');
  });
});
