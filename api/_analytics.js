/**
 * Scan-event analytics (PostHog)
 *
 * Records one "scan" event per successful analysis so total scan volume —
 * across both OCR/photo and barcode paths — is queryable since launch.
 *
 * Design constraints:
 * - Never break or meaningfully slow a scan: env-guarded + try/catch, and the
 *   PostHog SDK is lazy-imported so this module loads without the dependency.
 * - No-op until POSTHOG_API_KEY is set, so dev/test/local runs send nothing.
 * - Privacy: the distinct ID is a one-way hash of the client IP, never the raw IP.
 */
import { createHash } from 'node:crypto';

const SCAN_EVENT = 'scan';
// Failures get their own event (not a property on `scan`) so every existing
// insight counting `scan` keeps meaning "successful scans".
const SCAN_FAILED_EVENT = 'scan_failed';

/**
 * Build the PostHog event properties for a scan, omitting absent optional fields.
 * Pure — no I/O.
 */
function buildScanProperties({ method, mode, verdict, detectedLanguage, dataSource, platform, country, region, city, confidence, hadIngredientData } = {}) {
  const props = { method, verdict };
  if (mode != null) props.mode = mode;
  if (detectedLanguage != null) props.detected_language = detectedLanguage;
  if (dataSource != null) props.data_source = dataSource;
  if (platform != null) props.platform = platform;
  if (confidence != null) props.confidence = confidence;
  // Barcode path only: splits caution verdicts into "the database had no
  // ingredient data" vs a real judgement call on actual ingredients.
  if (hadIngredientData != null) props.had_ingredient_data = hadIngredientData;
  // IP-derived geo from the Vercel edge (see getClientGeo). Use PostHog's
  // canonical $geoip_* names so the World Map insight and country/region
  // breakdowns work natively without any extra mapping.
  if (country != null) props.$geoip_country_code = country;
  if (region != null) props.$geoip_subdivision_1_code = region;
  if (city != null) props.$geoip_city_name = city;
  return props;
}

/**
 * Build the PostHog event properties for a failed scan attempt.
 * `reason` is one of: not_found | ocr_failed | rate_limited | claude_error | server_error.
 * Pure — no I/O.
 */
function buildScanFailureProperties({ method, reason, platform, country, region, city } = {}) {
  const props = { method, reason };
  if (platform != null) props.platform = platform;
  if (country != null) props.$geoip_country_code = country;
  if (region != null) props.$geoip_subdivision_1_code = region;
  if (city != null) props.$geoip_city_name = city;
  return props;
}

/**
 * Normalize the client-supplied `X-Client` header into a known platform.
 * Header values are untrusted, so whitelist to ios/web and bucket everything
 * else (missing header, old app versions, scripts) as "unknown".
 * Pure — no I/O.
 */
function normalizeClient(raw) {
  const v = String(raw || '').toLowerCase().trim();
  return v === 'ios' || v === 'web' ? v : 'unknown';
}

/**
 * Stable, privacy-preserving distinct ID derived from the client IP.
 * Lets PostHog approximate unique devices without ever storing a raw IP.
 * Pure — no I/O.
 */
function anonId(ip) {
  if (!ip) return 'anonymous';
  return createHash('sha256').update(String(ip)).digest('hex').slice(0, 16);
}

/**
 * Fire-and-forget: record a scan event. Safe to await — any failure is swallowed
 * (logged only) so analytics can never surface an error to the user.
 *
 * @param {object} input
 * @param {string} [input.ip]               client IP, hashed into the distinct ID
 * @param {'barcode'|'ocr'} input.method    how the scan was initiated
 * @param {'label'|'menu'} [input.mode]     what the content turned out to be
 * @param {'safe'|'caution'|'unsafe'} input.verdict
 * @param {string} [input.detectedLanguage] ISO 639-1, OCR path only
 * @param {string} [input.dataSource]       barcode source (openfoodfacts|usda|nutritionix)
 * @param {'ios'|'web'|'unknown'} [input.platform] originating client
 * @param {string} [input.country]          ISO 3166-1 alpha-2 country code (edge geo)
 * @param {string} [input.region]           subdivision/region code (edge geo)
 * @param {string} [input.city]             city name (edge geo)
 */
async function trackScan({ ip, ...fields } = {}) {
  return captureEvent(SCAN_EVENT, ip, buildScanProperties(fields));
}

/**
 * Fire-and-forget: record a failed scan attempt so scan success rate is
 * queryable (successes alone can't show how often users walk away empty-handed).
 * Same safety contract as {@link trackScan}.
 *
 * @param {object} input
 * @param {string} [input.ip]               client IP, hashed into the distinct ID
 * @param {'barcode'|'ocr'} input.method    how the scan was initiated
 * @param {'not_found'|'ocr_failed'|'rate_limited'|'claude_error'|'server_error'} input.reason
 * @param {'ios'|'web'|'unknown'} [input.platform] originating client
 * @param {string} [input.country]          ISO 3166-1 alpha-2 country code (edge geo)
 * @param {string} [input.region]           subdivision/region code (edge geo)
 * @param {string} [input.city]             city name (edge geo)
 */
async function trackScanFailure({ ip, ...fields } = {}) {
  return captureEvent(SCAN_FAILED_EVENT, ip, buildScanFailureProperties(fields));
}

async function captureEvent(event, ip, properties) {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return; // not configured — no-op

  try {
    const { PostHog } = await import('posthog-node');
    const client = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
    client.capture({
      distinctId: anonId(ip),
      event,
      properties,
    });
    // Serverless: flush the batched event before the function freezes, but cap the
    // wait — shutdown() defaults to a 30s timeout, and this runs on the user-facing
    // scan response path. 2s is plenty for a single event; a degraded PostHog must
    // never stall a scan.
    await client.shutdown(2000);
  } catch (err) {
    console.error(`${event} tracking failed:`, err);
  }
}

export {
  SCAN_EVENT,
  SCAN_FAILED_EVENT,
  buildScanProperties,
  buildScanFailureProperties,
  anonId,
  normalizeClient,
  trackScan,
  trackScanFailure,
};
