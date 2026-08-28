# Scan-Event Analytics (PostHog)

Server-side scan telemetry lives in `api/_analytics.js`. `trackScan()`/`trackScanFailure()` are no-ops until `POSTHOG_API_KEY` is set, so analytics is off in dev/test by default.

## Configuration

- `POSTHOG_API_KEY` — PostHog project API key (`phc_…`). Set in Vercel prod only.
- `POSTHOG_HOST` — defaults to `https://us.i.posthog.com`; set to the EU host if the project is in EU cloud.

## Events

**`scan`** — one per successful analysis, both OCR and barcode paths. **Keep `scan` success-only** — existing dashboard insights count it as successful scans. Properties:

- `confidence` (both paths)
- `had_ingredient_data` (barcode only)
- `image_kb`, `ocr_chars` (OCR only — capture metrics; counts only, never content)
- `gf_claim_present` (OCR only) — boolean: the OCR text carried a gluten-free
  claim phrase (`detectGlutenFreeClaim` in `api/analyze.js`, a server-side regex
  over the prompt's claim-phrase list — not Claude's judgement). Splits the
  caution share into labeled vs unlabeled products so the claim rule (decision
  003, `plans/gf-label-claim-2026-08-28.md`) is measurable. A flag, never the
  text — the privacy invariant below holds. Omitted on barcode scans.
- `ocr_ms`, `claude_ms`, `total_ms` (OCR only — the **server leg**: Vision
  round-trip, Claude round-trip incl. retries, and body-received → verdict.
  The upload leg is *not* in `total_ms` — the server clock starts once the body
  has arrived. On weak signal the upload dominates; its only view is
  `elapsed_ms` on client-beaconed failures. Added 2026-08-28,
  `plans/weak-signal-upload-2026-08-28.md`, so decision 002's "revisit Opus
  latency on scan-duration complaints" has data instead of an estimate.)
- `model` — the Claude model that produced the verdict. Omitted when no Claude
  call happened (barcode hit with no ingredient data). Makes a model swap
  attributable at the time it happens: `claude-opus-4-8` went out the same day
  as iOS 1.4.0 and confounded that release's evaluation.
- `app_version` — client build, from the `X-Client-Version` header.

**`app_version` (both events).** Analytics is server-side, so `$lib_version` is
always `posthog-node` — the SDK, not the app. Without this header a release is
unattributable. The value is whitelisted server-side to a short dotted-numeric
shape (`normalizeAppVersion`): the header is untrusted and would otherwise let
anyone blow up the property's cardinality. **Absent means an old client** —
omitted, never bucketed as "unknown". iOS sends it; web does not (it has no
version to send — a stale web build is already visible as `platform: unknown`).

**`scan_failed`** — one per failed attempt. `reason` taxonomy:

- Server-side: `not_found` | `ocr_failed` | `rate_limited` | `claude_error` | `server_error`
- Client-beacon-only: `timeout` | `network` | `cancelled` | `interrupted` — these never reach the server as a request, so the iOS client reports them via `POST /api/track` (web doesn't beacon). The first two die on the wire. `cancelled` is the user tapping Cancel on a slow attempt — before 2026-08-28 that left no trace anywhere (user-cancel is an `AbortError` the client dropped before Sentry or the beacon fired). `interrupted` is the app going to the background mid-scan (`mobile/app/index.tsx` drops the in-flight request on the transition to `background` — deterministic, and before iOS suspends the process and kills the socket) — kept separate so switching apps during a long wait can't masquerade as giving up. The beacon allowlist rejects every other reason so server-side reasons can't be spoofed.
- `elapsed_ms` (`timeout` / `network` / `cancelled` only) — how long the user waited before the attempt died or they cancelled. Untrusted input: whitelisted to a finite number and clamped to `[0, 120000]`, dropped otherwise. This is the only measurement of the upload leg. `interrupted` deliberately carries none — it fires on the transition to the background, and would otherwise include time asleep. For `cancelled` the clock starts with the spinner (before the photo resize and the connectivity probe), so it matches what the user experienced; for `timeout` / `network` it starts after the probe, ~1–2 s later.
- `ocr_ms` (server-side OCR-path failures, when known) — Vision round-trip before the failure.

## Privacy invariant

**Never add the scanned barcode or product to these events.** The privacy policy promises "no record of what you scanned" — and a UPC resolves to a product name, so even the raw code is a record. Missed barcodes are visible only in ephemeral Vercel runtime logs. If a durable coverage metric is ever wanted, that's a deliberate privacy-policy amendment first, code second.

## Excluding non-user traffic

Apple's App Store review scans once per submission and never succeeds, which
inflates OCR failure counts after every release (14 of 35 `ocr_failed` events in
the 30 days to 2026-08-13). Exclude it from any rate or capture-quality read —
the rule and both query forms are in `reports/weekly-snapshot/README.md`. It is
a rule, not a list: `distinct_id` is a hash of the client IP, so the identity
changes per submission.

## Metric caveats

On a client timeout the server may still complete and emit `scan` — one attempt can then appear in both `scan` and `scan_failed`. Don't compute failure rate as `scan_failed / (scan + scan_failed)` without noting the overlap (reconcile item on the ROADMAP). The same overlap applies to `cancelled` when the body had already arrived before the user gave up.

`cancelled` **lowers the success-rate tile by design.** A user who gave up after 30 s on a weak-signal upload had a failed attempt from their seat; a three-attempts-one-verdict session *was* a 33% experience, and the weekly review should see it. (If that ever proves the wrong call, the alternative was a separate `scan_cancelled` event — toggle T3 in the plan.)
