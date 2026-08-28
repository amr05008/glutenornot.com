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
function buildScanProperties({ method, mode, verdict, detectedLanguage, dataSource, platform, appVersion, model, country, region, city, confidence, hadIngredientData, imageKb, ocrChars, gfClaimPresent, ocrMs, claudeMs, totalMs } = {}) {
  const props = { method, verdict };
  if (mode != null) props.mode = mode;
  if (detectedLanguage != null) props.detected_language = detectedLanguage;
  if (dataSource != null) props.data_source = dataSource;
  if (platform != null) props.platform = platform;
  // Client build that produced the scan (absent on clients older than the
  // X-Client-Version header). Without it a release is unattributable: every
  // event carries $lib_version = posthog-node, which is the SDK, not the app.
  if (appVersion != null) props.app_version = appVersion;
  // Which Claude model produced the verdict, so a model swap is attributable
  // at the time it happens instead of archaeologically.
  if (model != null) props.model = model;
  if (confidence != null) props.confidence = confidence;
  // Barcode path only: splits caution verdicts into "the database had no
  // ingredient data" vs a real judgement call on actual ingredients.
  if (hadIngredientData != null) props.had_ingredient_data = hadIngredientData;
  // OCR path only (plans/ocr-capture-assist-2026-07-18.md): technical capture
  // metrics — decoded upload size and how much text Vision extracted. Byte and
  // char COUNTS only, never content (privacy: no record of what was scanned).
  if (imageKb != null) props.image_kb = imageKb;
  if (ocrChars != null) props.ocr_chars = ocrChars;
  // OCR path only (plans/gf-label-claim-2026-08-28.md): did the label carry a
  // gluten-free claim phrase? Splits the caution share into labeled vs
  // unlabeled products so the claim rule's effect is measurable. A boolean
  // from a server-side regex — never the claim text, never the product.
  if (gfClaimPresent != null) props.gf_claim_present = gfClaimPresent;
  // OCR path only (plans/weak-signal-upload-2026-08-28.md): where the server
  // leg's time went. Before this, "Vision + Opus ≈ 7–13 s" was an estimate and
  // decision 002 accepted Opus latency pending scan-duration data. Milliseconds
  // only. The upload leg is not visible here — the server clock starts when
  // the body has arrived; see elapsed_ms on client-beaconed failures for that.
  if (ocrMs != null) props.ocr_ms = ocrMs;
  if (claudeMs != null) props.claude_ms = claudeMs;
  if (totalMs != null) props.total_ms = totalMs;
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
 * `reason` is one of: not_found | ocr_failed | rate_limited | claude_error |
 * server_error (server-emitted), or timeout | network | cancelled (client
 * beacon via /api/track — failures that die on the wire, or that the user
 * abandoned, and so never reach the server as a request).
 * Pure — no I/O.
 */
function buildScanFailureProperties({ method, reason, platform, appVersion, country, region, city, imageKb, ocrChars, elapsedMs, ocrMs } = {}) {
  const props = { method, reason };
  if (platform != null) props.platform = platform;
  if (appVersion != null) props.app_version = appVersion;
  // OCR path only: capture metrics (counts, never content). NB: ocr_chars is 0
  // on every ocr_failed BY CONSTRUCTION (the event fires only when Vision found
  // no text) — the aiming-vs-blur discriminator is image_kb compared against
  // the successful-scan distribution, not ocr_chars on failures.
  if (imageKb != null) props.image_kb = imageKb;
  if (ocrChars != null) props.ocr_chars = ocrChars;
  // Client-beaconed failures: how long the user waited before the attempt
  // died or they gave up (the only view of the upload leg on weak signal).
  // Server-side failures: how long Vision took before the failure, when known.
  if (elapsedMs != null) props.elapsed_ms = elapsedMs;
  if (ocrMs != null) props.ocr_ms = ocrMs;
  // Deliberately NO barcode property: the privacy policy promises "no record
  // of what you scanned" and no product names in analytics, and a UPC resolves
  // to a product name. Missed barcodes are visible only in ephemeral Vercel
  // runtime logs (see the not_found console.log in barcode.js).
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
 * Normalize the client-supplied `X-Client-Version` header into an app version.
 *
 * Like `X-Client`, this value is untrusted and lands in a PostHog property, so
 * it is whitelisted to a short dotted-numeric shape rather than passed through:
 * an open endpoint that accepted arbitrary strings here would let anyone blow
 * up the property's cardinality and make version breakdowns useless.
 *
 * A bounded pre-release suffix is allowed (`1.5.0-rc.1`): tagging RC/TestFlight
 * builds is how internal testing stays excludable by rule rather than by a
 * hardcoded identity list — see reports/weekly-snapshot/README.md.
 *
 * Returns null for anything absent or malformed, so the property is omitted —
 * `app_version IS NULL` then means "a client too old to send it".
 * Pure — no I/O.
 */
function normalizeAppVersion(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (/^\d{1,3}(\.\d{1,3}){1,2}(-[a-z0-9.]{1,10})?$/i.test(v)) return v;
  // A version that arrived but didn't parse is indistinguishable downstream
  // from an old client that sent nothing — exactly the ambiguity app_version
  // exists to remove. Say so in the logs instead of dropping it silently.
  if (v) console.warn('Rejected X-Client-Version:', v.slice(0, 32));
  return null;
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
 * @param {string} [input.dataSource]       barcode source (openfoodfacts|usda|nutritionix|upcitemdb)
 * @param {'ios'|'web'|'unknown'} [input.platform] originating client
 * @param {string} [input.appVersion]       client app version (absent on older clients)
 * @param {string} [input.model]            Claude model that produced the verdict
 * @param {string} [input.country]          ISO 3166-1 alpha-2 country code (edge geo)
 * @param {string} [input.region]           subdivision/region code (edge geo)
 * @param {string} [input.city]             city name (edge geo)
 * @param {number} [input.imageKb]          OCR path only: decoded upload size in KB
 * @param {number} [input.ocrChars]         OCR path only: chars of text Vision extracted
 * @param {boolean} [input.gfClaimPresent]  OCR path only: the text carried a gluten-free claim phrase
 * @param {number} [input.ocrMs]            OCR path only: Vision round-trip in ms
 * @param {number} [input.claudeMs]         OCR path only: Claude round-trip in ms (incl. retries)
 * @param {number} [input.totalMs]          OCR path only: body-received → verdict, in ms
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
 * @param {'not_found'|'ocr_failed'|'rate_limited'|'claude_error'|'server_error'|'timeout'|'network'|'cancelled'} input.reason
 * @param {'ios'|'web'|'unknown'} [input.platform] originating client
 * @param {string} [input.appVersion]       client app version (absent on older clients)
 * @param {string} [input.country]          ISO 3166-1 alpha-2 country code (edge geo)
 * @param {string} [input.region]           subdivision/region code (edge geo)
 * @param {string} [input.city]             city name (edge geo)
 * @param {number} [input.imageKb]          OCR path only: decoded upload size in KB
 * @param {number} [input.ocrChars]         OCR path only: chars extracted (always 0 on ocr_failed by construction; omitted when failure precedes OCR)
 * @param {number} [input.elapsedMs]        client beacon only: ms the user waited before the attempt died or was cancelled
 * @param {number} [input.ocrMs]            server-side OCR failures only: Vision round-trip in ms, when known
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
    // Serverless: flush the batched event before the function freezes, but never
    // on the user-facing response path — trackScan/trackScanFailure are awaited
    // right before res.json() in both handlers, so an awaited flush made every
    // scan pay a PostHog round-trip (up to the 2s shutdown cap when PostHog is
    // degraded). On Vercel, hand the flush to the request context's waitUntil:
    // it runs after the response is sent and still completes before the
    // function freezes. Without a context (local/dev), await as before.
    const flush = client.shutdown(2000);
    const waitUntil = getWaitUntil();
    if (waitUntil) {
      waitUntil(flush.catch((err) => console.error(`${event} flush failed:`, err)));
    } else {
      await flush;
    }
  } catch (err) {
    console.error(`${event} tracking failed:`, err);
  }
}

/**
 * The Vercel request context's waitUntil, or null when not running on Vercel.
 * Reads the platform's stable Symbol.for('@vercel/request-context') contract —
 * the same thing @vercel/functions' waitUntil() does, but returning null (so we
 * can fall back to awaiting) instead of silently dropping the registration.
 */
function getWaitUntil() {
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.() ?? {};
  return typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : null;
}

export {
  SCAN_EVENT,
  SCAN_FAILED_EVENT,
  buildScanProperties,
  buildScanFailureProperties,
  anonId,
  normalizeClient,
  normalizeAppVersion,
  trackScan,
  trackScanFailure,
};
