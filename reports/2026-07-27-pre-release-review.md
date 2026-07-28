# Pre-release review — 2026-07-27 (same prompt, two models)

I ran the [pre-release review prompt](../pre-release-review-prompt.md) through two models against this repo on the same day: **Claude Fable 5** (in Claude Code) and **Kimi K3** (in Zed, via OpenRouter). They agreed on exactly one finding and surfaced nine distinct issues between them. Both full outputs are below, verbatim; this header tracks fix status.

## Fix status (the union — 9 findings)

- [x] **1. Multilingual gluten-signal note asserts "no wheat present" for non-English products** — `api/barcode.js:503-538` *(Fable #1 — safety bug, live-reproduced with OFF product 7622210449283; fix first)*
- [x] **2. OCR path has no upstream timeouts — Vision/Claude fetches can hang** — `api/analyze.js:336-350`, `api/_utils.js:77-89` *(the one both models caught: Fable #3 ≡ K3 #1)*
- [x] **3. Camera-permission gate hides all analysis/error UI for photo-picker scans** — `mobile/app/index.tsx:327-339` *(Fable #2)*
- [x] **4. Every scan response serially blocked on a PostHog flush** — `api/_analytics.js:148-157` *(Fable #4)*
- [x] **5. analyze.js discards complete analyses over verdict casing; barcode.js normalizes** — `api/analyze.js:408-410` *(Fable #5 — one-liner)*
- [x] **6. Web client timeout (30s) shorter than realistic server time; web never beacons** — `web/js/api.js:7` *(K3 #2 — timeout raised to 60s + SW cache v6; the web failure beacon was not in K3's fix line and remains intentionally absent per CLAUDE.md)*
- [x] **7. "Turn on flashlight & retry" offered for gallery picks (and leaves torch on)** — `mobile/app/index.tsx:365-387` *(K3 #3)*
- [x] **8. Camera-ready 2s fallback races the 1.4.0 torch-settle fix** — `mobile/app/index.tsx:123-133` *(K3 #4 — fixed + unit-tested: late real onCameraReady now re-applies the torch as a fresh transition; still confirm on device before release)*
- [x] **9. UPCitemdb ingredient regex `/s` can swallow a whole retail description** — `api/barcode.js:488-491` *(K3 #5 — wrong-verdict risk, one regex change)*

**Unverified hunches to triage** (7 total, no overlap between the two lists): UPC-E resolution, iOS network-error message classification, TORCH_SETTLE_MS on older devices, capture-tap before cameraReady (Fable); track.js limiter cold-start reset, stale-schema recents, rate limiter counting only successes (K3).

---

## Output 1 — Claude Fable 5 (Claude Code)

Review done. I read the last ~20 commits (the risk sits in the capture-assist/torch work, the UPCitemdb fallback, OCR instrumentation, the Opus bump, and the new /api/track beacon), read every file those commits touched, ran both test suites (194 web + 55 mobile, all passing), and live-tested the one safety-critical suspicion against real Open Food Facts data. One finding is a confirmed safety bug with a live reproduction.

**Top 5**

**1. assessGlutenSignal tells Claude "no wheat present" for non-English products that are full of wheat** — api/barcode.js:503-538 (pattern at 503, false note at 534)
GLUTEN_GRAIN_PATTERN only matches English grain words, but Open Food Facts (a French-origin database) returns ingredients_text in the product's local language. For any European wheat product, the en:gluten tag looks "uncorroborated," and the code injects a note into the Claude prompt that literally asserts "no wheat, barley, or rye present … DO NOT mark this product unsafe" — pushing the verdict of a wheat product from unsafe toward caution. The barcode prompt has none of the multilingual vocabulary the analyze prompt has, so Claude gets active misdirection with no counterweight.
Verified: I fetched Prince biscuits (7622210449283 — "Farine de blé 34,8%", tagged en:gluten) live and ran it through the actual exported assessGlutenSignal: it returned the "NOT corroborated" note. Reproduction command is one node -e away.
Fix direction: don't assert absence — reword the note to "no English gluten-grain term matched; the list may be non-English; treat the tag as corroborated if the ingredients contain a gluten grain in any language," and/or extend the pattern with the terms already curated in the analyze prompt (trigo, cebada, centeno, malta, tarwe, gerst, rogge, mout, blé, orge, seigle, blat…). Note \b breaks on accented characters (é is non-\w in JS), so use the u flag with \p{L} lookarounds rather than \b.

**2. With camera permission denied, "Choose a photo instead" runs with zero UI feedback** — mobile/app/index.tsx:327-339 vs 341-387
The permission gate returns before the isAnalyzing, offline, and error branches. A user who denied camera access and scans via the photo picker sees the frozen permission screen for the whole 5–30s analysis (no spinner, no cancel), and if it fails with ocr_failed or offline, the state screens are set but never rendered — the app just silently does nothing. Verified by tracing the render order: the early-return at line 327 unconditionally precedes every other state branch, and handlePickImage is wired as that screen's secondary action (line 336). Fix is reordering the branches (spinner/system-states before the permission gate).

**3. The OCR path has no upstream timeouts — Vision and Claude fetches can hang the full 60s client budget** — api/analyze.js:336-350, api/_utils.js:77-89
The barcode waterfall got 5s per-fetch budgets for exactly this failure mode (the GLUTENORNOT-MOBILE-7 comment), but performOCR's Vision fetch and callClaude's fetch have no AbortSignal at all. A hung upstream means the user stares at the spinner until the client aborts at 60s (surfacing as a timeout beacon that looks like their connectivity), and the serverless function keeps burning until Vercel's 300s cap. Verified by reading both fetch call sites — no signal, no timeout option — and contrasting with AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS) at api/barcode.js:296. Fix: AbortSignal.timeout(~10s) on Vision, a per-attempt timeout inside callClaude (map aborts to the existing overloaded/retry path).

**4. Every scan response is serially blocked on a PostHog flush** — api/_analytics.js:148-157, awaited at api/analyze.js:284 and api/barcode.js:194 (and all failure paths)
captureEvent constructs a new PostHog client per event and await client.shutdown(2000) before the handler sends the response — so every scan (and every 429/error response) pays a PostHog HTTPS round-trip, up to the 2s cap when PostHog is degraded, on top of an already multi-second path. Verified by reading the call order: await trackScan(...) precedes res.status(200).json(analysis) in both handlers. Fix: waitUntil() from @vercel/functions so the flush happens after the response, keeping the existing guarantee that the event still gets delivered before the function freezes.

**5. parseClaudeResponse in analyze.js throws away a complete analysis over verdict casing — barcode.js normalizes instead** — api/analyze.js:408-410 vs api/barcode.js:651
If Claude ever returns "Safe" / "WARNING" as the top-level verdict, the strict includes check throws and the user's entire valid analysis (flagged ingredients, translations, explanation) is replaced by the generic "Unable to fully analyze" caution — while the barcode path runs the same field through normalizeVerdict and keeps the result. Fail-safe direction, but it silently degrades good scans and the two paths disagree. Verified by reading both parsers; normalizeVerdict (api/_utils.js:269) already handles this and is even imported by analyze.js. One-line fix + a test tweak.

Not listed: the barcode waterfall's missing overall deadline — real, but you've already parked it (TODO at api/barcode.js:35 + ROADMAP), so it'd waste a slot.

**Unverified hunches**

- UPC-E barcodes may never resolve anywhere. FOOD_BARCODE_TYPES includes upc_e (mobile/constants/verdicts.ts:54), but zero-padding (the only variant OFF gets) is not UPC-E→UPC-A expansion, and lookupUpcItemDb skips anything under 12 digits. If expo-camera reports the raw 8-digit UPC-E, those scans systematically 404. I couldn't verify what expo/AVFoundation actually emits (some stacks auto-expand to UPC-A) without a device and a UPC-E product.
- Network-error classification by message substring (api.ts:142,234 — includes('Network') || includes('fetch')) may miss some iOS failure messages, which would misroute a connectivity error to the generic server_error alert instead of the offline screen — and skip the failure beacon, under-counting exactly what Phase 2 set out to measure. RN usually says "Network request failed," but I can't enumerate all native messages without on-device testing.
- The 750ms TORCH_SETTLE_MS was calibrated on your 1.4.0 TestFlight device; an older/slower phone might need more, in which case the flashlight-retry silently produces a dark LED again. Only device testing can bound this.
- Capture button is tappable before cameraReady (index.tsx:452-461 — disabled is style-only); a tap in the 0–2s window throws inside takePictureAsync and is swallowed as a console.warn, reading as a dead tap. Verified the code path, but not how often real devices hit it.

If you start with #1, the reproduction is: fetch OFF product 7622210449283, pass it to assessGlutenSignal, watch it emit the "no wheat present" note — then make that a failing test case before touching the pattern.

---

## Output 2 — Kimi K3 (Zed, via OpenRouter)

I've read the last ~20 commits (most of the recent code churn is capture-assist Phase 2: torch, client beacon, waterfall timeouts, Opus 4.8 bump) and the current state of the changed files. Here's the ranked list.

### Top 5

**1. OCR analysis endpoint has no server-side deadline** — `api/analyze.js:336-350`, `api/_utils.js:77-89`
**Impact: high / Effort: low.** `performOCR` calls Google Vision with a bare `fetch` — no `AbortSignal.timeout` anywhere — and `callClaude` likewise. Meanwhile the mobile client aborts at 60s (`mobile/services/api.ts:58`) and fires a `timeout` beacon. A hung Vision or Claude call holds the serverless function until Vercel's maxDuration kill; the user sees a client timeout, your `scan`/`scan_failed` events double-count the attempt, and you burn function minutes. **Verified:** grepped both files — `AbortSignal.timeout` appears only in `api/barcode.js` (4 upstream lookups); `performOCR`/`callClaude` have none, confirmed by reading their full bodies. Fix: add `AbortSignal.timeout(~15s)` to the Vision fetch and a total budget (~45s) around `callClaude`.

**2. Web client timeout (30s) is shorter than realistic server time, and web never beacons** — `web/js/api.js:7` vs `mobile/services/api.ts:58`
**Impact: high for web users / Effort: low.** Web aborts OCR at 30s while the server can legitimately take longer (Vision + Opus with 2 retries at 400/800ms backoff); mobile already learned this and raised to 60s. So web users on slow connections get spurious "taking longer than usual" failures on scans that would have succeeded. CLAUDE.md also confirms web doesn't fire the failure beacon, so these failures are invisible in PostHog. **Verified:** read both files' timeout constants; mobile comment even says "OCR + Claude can take a while." Fix: raise web `API_TIMEOUT` to 60s to match mobile.

**3. "Couldn't read" error screen always offers "Turn on flashlight & retry" — even for gallery picks** — `mobile/app/index.tsx:365-387`, `308-320`
**Impact: medium (user confusion, wasted retry) / Effort: low.** `processAndAnalyze` is shared by camera capture and `handlePickImage`; on `ocr_failed` both land on the same `systemState: 'error'` screen whose primary action sets `torch: true` — a no-op for a blurry screenshot from the photo library, and it leaves the torch on afterwards. The retry affordance promises a fix that can't apply. **Verified:** traced both call sites (`handlePickImage` L319 → `processAndAnalyze` L197 → `handleError` L163) to the single error screen; the primary button (L373-379) unconditionally offers the flashlight. Fix: track whether the failed scan came from the camera; show plain "Try again" for library picks.

**4. Camera-ready 2s fallback + torch settle window can race on slow devices** — `mobile/app/index.tsx:123-133` vs `101-121`
**Impact: medium / Effort: medium (needs on-device repro).** The fallback force-sets `cameraReady` at 2s if `onCameraReady` never fires, and stamps `cameraReadyAtRef = Date.now()` at that moment. The torch effect then waits `TORCH_SETTLE_MS` (750ms) after that stamp — but the stamp marks when the *fallback fired*, not when the native session settled, which was the entire point of the 1.4.0 torch fix (commit 0a360a0: "mount-time gate wasn't enough"). On a device where `onCameraReady` is merely slow (>2s), the fallback fires first, the torch transition is then applied against an unsettled session, and you may re-introduce the silently-dropped torch the release was built to fix. **Verified:** read the two effects; the fallback writes the same `cameraReadyAtRef` the settle computation reads, with no flag distinguishing fallback-forced from real readiness. Fix: don't stamp `cameraReadyAtRef` in the fallback path (or add the full settle delay when readiness came from the fallback).

**5. UPCitemdb ingredient extraction regex can swallow a whole retail description as "ingredients"** — `api/barcode.js:488-491`
**Impact: medium (wrong-verdict risk, the bad kind) / Effort: low.** `/INGREDIENTS\s*:\s*\/?\s*(.+)/s` uses the `s` flag, so `.+` eats newlines — everything after "INGREDIENTS:" in the scraped description (directions, disclaimers, "Satisfaction guaranteed…") becomes `ingredients_text` and goes to Claude as the ingredient statement. The reliability note caps confidence at medium, but Claude can still produce a "safe" verdict grounded partly in non-ingredient prose, or an "unsafe" from a stray mention (e.g. "processed in a facility" text). **Verified:** read the regex and the surrounding guard (only checks uppercase label + a comma); the `/s` flag is right there and no length/sentence cut exists. Fix: capture to end-of-line only (drop `/s`) or cut at the first sentence terminator/known non-ingredient header.

### Unverified hunches

- **`api/track.js` in-memory beacon limiter resets per cold start** (same as the scan limiter in `_utils.js`). Known serverless tradeoff, but the 50/day beacon cap may be far looser in practice than intended. Not verified what Vercel's instance-reuse behavior actually is for this deployment.
- **Recents screen date display / `result.tsx`** — I didn't read `recents.tsx` or `result.tsx` closely; a stale-schema result from a pre-1.4.0 install might not match `isValidRecentScan`'s expectations. Low risk given the guard exists, but untested by me.
- **Rate limiter counts only successes** (`incrementRateLimit` called after analysis in both endpoints) — a retry-hammering user doesn't consume allowance on failures. Possibly intentional; flagging in case it's not.

**Suggested start:** #1 and #2 are each ~5 lines and close the biggest reliability gap; #5 is one regex change and it's the only item that can produce a wrong verdict rather than a failed scan.
