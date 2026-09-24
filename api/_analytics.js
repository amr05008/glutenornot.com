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
// Barcode-to-photo recovery funnel (plans/barcode-recovery-2026-09-05.md §7):
// a few interaction/outcome events per recovery flow, tied together by a
// random flow ID that lives only in the client's memory. Its own event so it
// can never inflate `scan` or `scan_failed`.
const BARCODE_RECOVERY_EVENT = 'barcode_recovery';
// App Store review ask (plans/review-prompt-visibility-2026-09-15.md): the
// system rating sheet gives the app no callback, so the only measurable facts
// are "we handed a request to iOS" and "the user tapped our write-review
// link". Two stages, no content. Its own event so it can never inflate `scan`.
const REVIEW_PROMPT_EVENT = 'review_prompt';
// Jev fast path (decision 007, plans/jev-fast-path-2026-09-24.md): one event
// per barcode scan where Jev settled a verdict, pairing it with Claude's
// verdict on the same record. Sent after the response. Its own event so it
// can never inflate `scan`, and so the Stage 2 gate and tripwire read one
// table. Enums only.
const ENGINE_AUDIT_EVENT = 'engine_audit';

/**
 * Build the PostHog event properties for a scan, omitting absent optional fields.
 * Pure — no I/O.
 */
function buildScanProperties({ method, mode, verdict, detectedLanguage, dataSource, platform, appVersion, model, country, region, city, confidence, hadIngredientData, gfLabelPresent, imageKb, ocrChars, gfClaimPresent, listGate, cautionReason, ocrMs, claudeMs, totalMs, engine, jevOutcome, jevVia, jevMs, lookupMs } = {}) {
  const props = { method, verdict };
  if (mode != null) props.mode = mode;
  if (detectedLanguage != null) props.detected_language = detectedLanguage;
  if (dataSource != null) props.data_source = dataSource;
  if (platform != null) props.platform = platform;
  // Client build that produced the scan (absent on clients older than the
  // X-Client-Version header). Without it a release is unattributable: every
  // event carries $lib_version = posthog-node, which is the SDK, not the app.
  if (appVersion != null) props.app_version = appVersion;
  // Which model produced the served verdict (a Claude model, or Jev's pinned
  // version when engine = jev), so a model swap is attributable at the time
  // it happens instead of archaeologically.
  if (model != null) props.model = model;
  // Barcode path only (decision 007): which engine's verdict the user saw —
  // `claude`, or `jev` when the fast path served it. Absent when no engine
  // ran (no ingredient data) and on OCR scans.
  if (engine != null) props.engine = engine;
  // Barcode path, JEV_MODE other than off: what the fast path did.
  // jev_outcome is settled_safe | settled_unsafe | fell_through | timeout |
  // error | skipped (never asked: a code gate hit, or no key); jev_via is the
  // rule branch or gate that decided (a fixed enum from decideFastPath), and
  // jev_ms Jev's round trip. Names of code branches, never content.
  if (jevOutcome != null) props.jev_outcome = jevOutcome;
  if (jevVia != null) props.jev_via = jevVia;
  if (jevMs != null) props.jev_ms = jevMs;
  if (confidence != null) props.confidence = confidence;
  // Barcode path only: splits caution verdicts into "the database had no
  // ingredient data" vs a real judgement call on actual ingredients.
  if (hadIngredientData != null) props.had_ingredient_data = hadIngredientData;
  // Barcode path only (decision 004): did the database record carry a
  // whole-product gluten-free label tag (`hasGlutenFreeLabelTag`)? The
  // barcode twin of `gf_claim_present` — splits barcode cautions into labeled
  // vs unlabeled so the claim rule's effect on this path is readable. A flag,
  // never the tag list or the product.
  if (gfLabelPresent != null) props.gf_label_present = gfLabelPresent;
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
  // OCR path only: why the ingredient-list gate withheld Claude's "safe"
  // ('no_heading' = start of the list out of frame, 'no_end' = cut before it
  // ends; applyIngredientListGate). Present only when the gate fired, so its
  // count over OCR label scans is the gate's cost. A reason, never the text.
  if (listGate != null) props.list_gate = listGate;
  // Decision 006: which of the fixed reasons a caution named (an enum, never
  // content). Its distribution is the day-28 read of plans/verdict-calibration.
  if (cautionReason != null) props.caution_reason = cautionReason;
  // OCR path only (plans/weak-signal-upload-2026-08-28.md): where the server
  // leg's time went. Before this, "Vision + Opus ≈ 7–13 s" was an estimate and
  // decision 002 accepted Opus latency pending scan-duration data. Milliseconds
  // only. The upload leg is not visible here — the server clock starts when
  // the body has arrived; see elapsed_ms on client-beaconed failures for that.
  // Barcode path (decision 007, the speed plan's timing): lookup_ms is the
  // database waterfall; claude_ms and total_ms mean the same as on OCR. A
  // Jev-served scan has no claude_ms — Claude is still running as its audit.
  if (ocrMs != null) props.ocr_ms = ocrMs;
  if (lookupMs != null) props.lookup_ms = lookupMs;
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
 * server_error (server-emitted), or timeout | network | cancelled | interrupted
 * (client beacon via /api/track — failures that die on the wire, or that the
 * user abandoned / iOS dropped on resume, and so never reach the server as a
 * request).
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
 * Build the PostHog event properties for one stage of a barcode recovery flow.
 * Bounded enums only — the endpoint (api/recovery.js) has already rebuilt the
 * payload from an allowlist, so nothing here can carry a barcode, product
 * name, ingredient text, or explanation. `flow_id` is a random UUID minted by
 * the client when a recovery state is first shown; it identifies the flow,
 * not a product, a person, or a device.
 * Pure — no I/O.
 */
function buildRecoveryProperties({ flowId, reason, stage, source, resultMode, verdict, confidence, platform, appVersion, country, region, city } = {}) {
  const props = { flow_id: flowId, reason, stage };
  // photo_started only: shutter vs library pick
  if (source != null) props.source = source;
  // result_displayed only: what the recovered photo turned into. A menu result
  // is tracked as a menu, not counted as a successful label recovery.
  if (resultMode != null) props.result_mode = resultMode;
  if (verdict != null) props.verdict = verdict;
  if (confidence != null) props.confidence = confidence;
  if (platform != null) props.platform = platform;
  if (appVersion != null) props.app_version = appVersion;
  if (country != null) props.$geoip_country_code = country;
  if (region != null) props.$geoip_subdivision_1_code = region;
  if (city != null) props.$geoip_city_name = city;
  return props;
}

/**
 * Build the PostHog event properties for a review-prompt stage. `stage` is
 * `requested` (the native rating request was made on a non-TestFlight
 * install) or `store_opened` (the user tapped the write-review link). The
 * endpoint rebuilds the payload from an allowlist, so nothing here can carry
 * a rating, review text, scan count, or product.
 * Pure — no I/O.
 */
function buildReviewPromptProperties({ stage, platform, appVersion, country, region, city } = {}) {
  const props = { stage };
  if (platform != null) props.platform = platform;
  if (appVersion != null) props.app_version = appVersion;
  if (country != null) props.$geoip_country_code = country;
  if (region != null) props.$geoip_subdivision_1_code = region;
  if (city != null) props.$geoip_city_name = city;
  return props;
}

/**
 * Build the PostHog event properties for one engine audit (decision 007):
 * Jev settled a verdict, and Claude read the same record. `mode` is JEV_MODE;
 * `served` is which verdict the user saw (`jev` | `claude`); `claude_verdict`
 * is `error` when the Claude call failed, and then `agree` is absent. Named
 * fields only — nothing else a caller passes can reach the event.
 * Pure — no I/O.
 */
function buildEngineAuditProperties({ mode, jevVerdict, claudeVerdict, claudeCautionReason, served, agree, platform, appVersion, country, region, city } = {}) {
  const props = { mode, jev_verdict: jevVerdict, claude_verdict: claudeVerdict };
  if (claudeCautionReason != null) props.claude_caution_reason = claudeCautionReason;
  props.served = served;
  if (agree != null) props.agree = agree;
  if (platform != null) props.platform = platform;
  if (appVersion != null) props.app_version = appVersion;
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
 * @param {'no_heading'|'no_end'} [input.listGate] OCR path only: why a "safe" was withheld as a cut-off list
 * @param {'oats'|'may_contain'|'conflict'|'undeclared_source'|'incomplete'|'other'} [input.cautionReason] label cautions only
 * @param {boolean} [input.gfLabelPresent]  Barcode path only: the record carried a gluten-free label tag
 * @param {number} [input.ocrMs]            OCR path only: Vision round-trip in ms
 * @param {number} [input.claudeMs]         Claude round-trip in ms (incl. retries); absent on a Jev-served scan
 * @param {number} [input.totalMs]          request → verdict in ms (OCR: from the body's arrival)
 * @param {number} [input.lookupMs]         Barcode path only: database waterfall in ms
 * @param {'claude'|'jev'} [input.engine]   Barcode path only: whose verdict was served
 * @param {'settled_safe'|'settled_unsafe'|'fell_through'|'timeout'|'error'|'skipped'} [input.jevOutcome] Barcode path, JEV_MODE ≠ off
 * @param {string} [input.jevVia]           Barcode path, JEV_MODE ≠ off: the fast-path rule branch or gate
 * @param {number} [input.jevMs]            Barcode path, JEV_MODE ≠ off: Jev round-trip in ms, when asked
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
 * @param {'not_found'|'ocr_failed'|'rate_limited'|'claude_error'|'server_error'|'timeout'|'network'|'cancelled'|'interrupted'} input.reason
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

/**
 * Fire-and-forget: record one stage of a barcode recovery flow. Same safety
 * contract as {@link trackScan} — a failure is logged and swallowed.
 *
 * @param {object} input
 * @param {string} [input.ip]               client IP, hashed into the distinct ID
 * @param {string} input.flowId             random v4 UUID for this recovery flow
 * @param {'not_found'|'missing_context'} input.reason  why the barcode came up empty
 * @param {'shown'|'photo_started'|'result_displayed'|'exited'} input.stage
 * @param {'camera'|'picker'} [input.source]           photo_started only
 * @param {'label'|'menu'} [input.resultMode]          result_displayed only
 * @param {'safe'|'caution'|'unsafe'} [input.verdict]  result_displayed only
 * @param {'high'|'medium'|'low'} [input.confidence]   result_displayed only
 * @param {'ios'|'web'|'unknown'} [input.platform]
 * @param {string} [input.appVersion]
 * @param {string} [input.country]
 * @param {string} [input.region]
 * @param {string} [input.city]
 */
async function trackBarcodeRecovery({ ip, ...fields } = {}) {
  return captureEvent(BARCODE_RECOVERY_EVENT, ip, buildRecoveryProperties(fields));
}

/**
 * Track one stage of the App Store review ask.
 * @param {object} input
 * @param {string} input.ip - Client IP (hashed before it leaves this module)
 * @param {'requested'|'store_opened'} input.stage
 * @param {'ios'|'web'|'unknown'} [input.platform]
 * @param {string} [input.appVersion]
 * @param {string} [input.country]
 * @param {string} [input.region]
 * @param {string} [input.city]
 */
async function trackReviewPrompt({ ip, ...fields } = {}) {
  return captureEvent(REVIEW_PROMPT_EVENT, ip, buildReviewPromptProperties(fields));
}

/**
 * Record one engine audit (decision 007). Always called off the response path
 * (inside runAfterResponse), so it awaits its own flush rather than
 * registering another waitUntil from inside one. Same safety contract as
 * {@link trackScan}.
 *
 * @param {object} input
 * @param {string} [input.ip]               client IP, hashed into the distinct ID
 * @param {'shadow'|'unsafe'|'full'} input.mode  JEV_MODE at the time
 * @param {'safe'|'unsafe'} input.jevVerdict      what the fast path settled
 * @param {'safe'|'caution'|'unsafe'|'error'} input.claudeVerdict
 * @param {string} [input.claudeCautionReason]    Claude's caution_reason, on a caution
 * @param {'jev'|'claude'} input.served           whose verdict the user saw
 * @param {boolean} [input.agree]                 jevVerdict === claudeVerdict (absent on error)
 * @param {'ios'|'web'|'unknown'} [input.platform]
 * @param {string} [input.appVersion]
 * @param {string} [input.country]
 * @param {string} [input.region]
 * @param {string} [input.city]
 */
async function trackEngineAudit({ ip, ...fields } = {}) {
  return captureEvent(ENGINE_AUDIT_EVENT, ip, buildEngineAuditProperties(fields), { awaitFlush: true });
}

/**
 * Let `promise` finish after the response is sent: on Vercel it is handed to
 * the request context's waitUntil (the function stays alive until it
 * settles); elsewhere it just runs. A rejection is logged, never thrown.
 */
function runAfterResponse(promise) {
  const guarded = Promise.resolve(promise).catch((err) => console.error('after-response work failed:', err));
  const waitUntil = getWaitUntil();
  if (waitUntil) waitUntil(guarded);
}

async function captureEvent(event, ip, properties, { awaitFlush = false } = {}) {
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
    const waitUntil = awaitFlush ? null : getWaitUntil();
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
  BARCODE_RECOVERY_EVENT,
  REVIEW_PROMPT_EVENT,
  ENGINE_AUDIT_EVENT,
  buildScanProperties,
  buildScanFailureProperties,
  buildRecoveryProperties,
  buildReviewPromptProperties,
  buildEngineAuditProperties,
  anonId,
  normalizeClient,
  normalizeAppVersion,
  trackScan,
  trackScanFailure,
  trackBarcodeRecovery,
  trackReviewPrompt,
  trackEngineAudit,
  runAfterResponse,
};
