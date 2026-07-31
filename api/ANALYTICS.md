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

**`scan_failed`** — one per failed attempt. `reason` taxonomy:

- Server-side: `not_found` | `ocr_failed` | `rate_limited` | `claude_error` | `server_error`
- Client-beacon-only: `timeout` | `network` — these two die on the wire and never reach the server, so the iOS client reports them via `POST /api/track` (web doesn't beacon). The beacon allowlist rejects every other reason so server-side reasons can't be spoofed.

## Privacy invariant

**Never add the scanned barcode or product to these events.** The privacy policy promises "no record of what you scanned" — and a UPC resolves to a product name, so even the raw code is a record. Missed barcodes are visible only in ephemeral Vercel runtime logs. If a durable coverage metric is ever wanted, that's a deliberate privacy-policy amendment first, code second.

## Metric caveats

On a client timeout the server may still complete and emit `scan` — one attempt can then appear in both `scan` and `scan_failed`. Don't compute failure rate as `scan_failed / (scan + scan_failed)` without noting the overlap (reconcile item on the ROADMAP).
