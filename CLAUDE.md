# GlutenOrNot - Project Instructions

## Quick Reference

- **Tech Stack**: Vanilla HTML/CSS/JS (web), React Native/Expo (mobile), Vercel serverless functions, Sentry (crash reporting)
- **APIs**: Google Cloud Vision (OCR), Claude API (Opus), TypeSafe Jev (barcode fast path, decision 007; off until `JEV_MODE` says otherwise)
- **Roadmap**: `ROADMAP.md` - prioritized improvement plan
- **Active plans**: `plans/` — scoped work-in-progress. **Built 2026-09-24, PR #35 open:** `jev-fast-path-2026-09-24.md` — decision 007: TypeSafe's Jev answers first on Open Food Facts barcodes (`api/_jev.js` + `decideFastPath` in `api/barcode.js`), Claude still runs on every scan and audits (`engine_audit`); merges with `JEV_MODE=off`, and the rollout (shadow → `unsafe` → `full`, keys, PostHog tripwire) is Aaron's. **Shipped 2026-09-24:** `verdict-calibration-2026-09-23.md` — PR #32, decision 006: every caution names one `caution_reason`; natural flavors, maltodextrin, spices etc. stop being a reason. Server-only (Vercel, deployed 2026-09-24 14:35 UTC), no iOS build. Left: the day-28 read (~2026-10-22, plan Task 9) and Part B, the retake-screen plan, which bundles with the parked 1.5.1. `jev-findings-handoff-2026-09-18.md` (local-only) is the background to decision 007. **Shipped 2026-09-23:** PR #31, the cut-off ingredient-list gate (decision 005, `applyIngredientListGate`); only the `list_gate` read (~2026-10-06) is left. **One parked:** `review-prompt-visibility-2026-09-15.md` — api half (`POST /api/review` + `review_prompt` event + privacy policy) is LIVE since PR #27 (2026-09-15); the mobile half (result-footer write-review link + `requested` beacon) is merged on `main` and **version-bumped to 1.5.1 but deliberately unshipped** — Aaron parked the iOS release on 2026-09-15 to bundle it with more user-facing change ("a version bump just to ask for reviews is off-brand"). Next iOS release ships as 1.5.1 with whatever joins it; the runbook's smoke step now requires the `-rc.smoke` tag. Open follow-up: feedback routing (the in-app Google Form link is gone). Three shipped with only their data reads left: `barcode-recovery-2026-09-05.md` (PR #25 → iOS 1.5.0; build 2 rejected 2026-09-07 under 5.1.1(iv) for the camera pre-permission button, build 3 resubmitted 2026-09-06 via PR #26; barcode miss/no-data → neutral recovery state → photo-only capture, measured by the content-free `barcode_recovery` funnel — `POST /api/recovery`, contract + the day-14 read in `api/ANALYTICS.md`; read counts from the *public* release date and must exclude the 2026-09-05 21:30–21:50 ET smoke window; enrichment §8 is gated on that read; design export in `GlutenOrNot - V2 Designs/export090526/`, overrides in `plans/barcode-recovery-handoff-review-2026-09-05.md`), and two from 2026-08-28 with only their data reads left: `weak-signal-upload-2026-08-28.md` (PR #24 → iOS 1.4.3; D2 read ~2026-09-11, then close; next lever is toggle T2, multipart upload, as its own PR) and `gf-label-claim-2026-08-28.md` (PR #23, decision 003; step-9 read ~2026-09-25 — fold in decision 004's barcode read: `gf_label_present = true` caution share, flag exists since PR #29 merged 2026-09-16; end the window at PR #32's deploy, 2026-09-24 14:35 UTC, or split by `caution_reason IS NULL`; the 2026-09-23 baseline is in the verdict-calibration plan). `ocr-capture-assist-2026-07-18.md` is closed (2026-08-13) — read its CLOSED header before reopening the capture question
- **Session history**: `.claude/sessions/`
- **Diagrams**: `docs/` — the scan pipeline as `how-it-works-simple.svg` (video/README) and `how-it-works.svg` (engineering, lists the prompt rules). A change to the pipeline or a verdict rule changes the drawing too; edit both SVGs (light + `-dark`) and re-render the 2x PNGs
- **Decisions**: `.claude/decisions/`
- **Skills**: `.claude/skills/` — `glutenornot-release` drives the iOS release (points at `mobile/RELEASE.md`)

## Project Structure (Monorepo)

Three deployables: `web/` (vanilla-JS PWA, vitest tests in `web/tests/`), `mobile/` (Expo Router / React Native iOS app, jest tests), and `api/` (shared Vercel serverless functions used by both clients). Browse the tree for the rest — only the non-obvious facts are listed here:

- `api/_utils.js` — shared rate limiting, verdict normalization, and the Claude client + error classification; both endpoints (`analyze.js`, `barcode.js`) go through it.
- `api/barcode.js` — waterfall lookup: Open Food Facts → USDA → Nutritionix → UPCitemdb. Also the Jev fast path's rule and wiring (decision 007): `fastPathGate` (a hit means no Jev call), `decideFastPath` (settles only a clear `unsafe`/`safe`), and the handler's `JEV_MODE` switch; Claude starts on every scan either way.
- `api/_jev.js` — the TypeSafe Jev client (plain `fetch`, hardcoded base URL, pinned `jev-1.13.0`, 800 ms, no retries, ingredient text only) and the bake-off's frozen v2 questions + thresholds. The request body is pinned byte-for-byte to SDK 0.6.0 by `web/tests/api/jev.test.js`; port questions verbatim or re-grade.
- `api/track.js` — client failure beacon for the failures the server never sees as a request: `timeout`/`network` (die on the wire), `cancelled` (user tapped Cancel; carries `elapsed_ms`) and `interrupted` (app backgrounded mid-scan). `cancelled` lowers the weekly success-rate tile by design. Contract in `api/ANALYTICS.md`.
- `api/recovery.js` — the `barcode_recovery` funnel beacon (flow_id + reason + stage + bounded enums; payload rebuilt from an allowlist, own 200/day cap). Never emits `scan`/`scan_failed`. The trigger is `result_reason: 'missing_context'` on the barcode no-data branch, or a 404 — the client branches only on those; never on explanation text.
- `api/review.js` — the `review_prompt` beacon (`stage`: `requested` = the client handed a rating request to iOS after `requestReview()` resolved, `store_opened` = write-review link tapped; nothing else, own 10/day cap). Never emits `scan`/`scan_failed`. TestFlight never sends `requested` (`isAvailableAsync()` is false there); simulator/Xcode builds do — read it with `app_version NOT LIKE '%-rc%'` and by distinct id. Contract + read in `api/ANALYTICS.md`.
- `mobile/app/result.tsx` — routes to `ResultCard` (ingredient labels/barcodes) vs `MenuResultCard` (restaurant menus) based on the response's `mode`. Beacons `result_displayed` once when it completes a recovery flow (transient route params, never persisted).
- `mobile/app/index.tsx` — owns the transient barcode-recovery flow (`RecoveryFlow`: prompt → photo-only capture). Barcode detection is off for the whole flow and whenever the screen is unfocused; the handler guards on refs, not just the prop. Explicit exit re-arms after 2 s and silently ignores the dismissed code for 60 s (in memory). A/B states never touch history/count/review. Ownership model: one AbortController per scan; only the owner clears the spinner/scanner; a shutter or picker photo still pending when the user exits, opens Recents, or the screen blurs is discarded (a pending pick survives an app switch); a result whose count/history write has begun is "settled" and Cancel/background no longer abort it.
- `mobile/app/recents.tsx` — local-only history; a tap reopens the *saved* result, no re-scan.
- `mobile/services/review.ts` — App Store rating prompt, at most once per install; failures are swallowed so it can never break a result.
- `reports/weekly-snapshot/` — refreshed by a Monday cloud routine; read its README before editing the template.

## Development

### Web
```bash
npm install
npx vercel dev  # Runs Vercel dev server with API functions
```

Note: Requires Vercel CLI login (`npx vercel login`). For static-only serving without APIs, use `npm run dev:static`.

### Mobile
```bash
cd mobile
npm install
npx expo start              # Local dev server + QR code
npx expo start --tunnel     # Remote access (public URL)
npx expo start --ios        # iOS simulator
```

### iOS Build (Local via Xcode)

> **Shipping a release?** Follow **`mobile/RELEASE.md`** — it is the complete runbook
> (version lockstep, post-prebuild patches, Sentry token, smoke test, tag, close-out).
> The commands below are only the bare build loop for local development.

```bash
cd mobile
npx expo prebuild --platform ios --clean   # Generate native project
open ios/GlutenOrNot.xcworkspace           # Open in Xcode
```

In Xcode:
1. Select GlutenOrNot target → Signing & Capabilities → select your Team
2. Set version/build number in General tab
3. Select "Any iOS Device (arm64)" → Product → Archive
4. Distribute App → App Store Connect → Upload

## Environment Variables

Required for API functionality:
- `GOOGLE_CLOUD_VISION_API_KEY`
- `ANTHROPIC_API_KEY`
- `SENTRY_AUTH_TOKEN` (EAS secret — for source map uploads during builds)

Optional:
- **Barcode fallbacks**: `USDA_API_KEY` (free), `NUTRITIONIX_APP_ID`/`NUTRITIONIX_API_KEY` (paid only — free tier discontinued; the code keeps the hook but don't plan on it). The final fallback, UPCitemdb, is keyless.
- **Scan analytics**: `POSTHOG_API_KEY` / `POSTHOG_HOST` — event contract, failure-reason taxonomy, and metric caveats are in **`api/ANALYTICS.md`**. **Privacy invariant: never put the scanned barcode/product in any analytics event** — the privacy policy promises "no record of what you scanned."
- **Jev fast path** (decision 007): `TYPESAFE_API_KEY` (Vercel **Production scope only** — preview deploys get none and fall through to Claude; the live eval uses a separate `glutenornot-evals` key in `.env`) and `JEV_MODE` = `off` (default; any unrecognized value reads as off) | `shadow` | `unsafe` | `full`. Shallow `/api/health` reports both under `services.fast_path`.
- **Outage detection**: `HEALTH_CHECK_TOKEN` enables the deep health check (`GET /api/health?deep=1` + `x-health-token` header) — pings the live Claude model so an external uptime monitor catches model retirements/bad keys instead of silent 503s. Details in `api/health.js`.

## Guidelines

- **Caution means a specific reason to worry** (decision 006, 2026-09-23): every caution names one `caution_reason` — `oats`, `may_contain`, `conflict`, `undeclared_source`, `incomplete`, or (measured) `other`. An ingredient whose source labeling law already covers (unnamed natural flavors, spices, maltodextrin, dextrin, modified starch, glucose syrup, caramel color, HVP of unstated source — outside products made with meat or poultry) is not a reason, because a US label must then name wheat in its list or its "Contains:" line; barcode records with no allergen data (USDA, Nutritionix, UPCitemdb) can't show that line, so they hold such an ingredient at `incomplete` (T9). Conservative still means: when a nameable reason exists, caution; never `safe` on a guess
- **An explicit gluten-free label claim lifts ambiguous-ingredient cautions to `safe`** (decision 003, 2026-08-28): "gluten-free" / "sin gluten" / "glutenvrij" / … is a regulated claim (<20 ppm) that covers oats and the `undeclared_source` ingredients (decision 006 made the other ambiguous ingredients safe without a claim). **The claim also covers oats** (decision 004, 2026-09-16 — the regulation holds a labeled product's oats to the same 20 ppm; the old "certified only" carve-out was unreachable by photo because the mark is on the front and the ingredients on the back). A listed gluten source and may-contain / shared-equipment advisories still win; "not gluten-free" is a gluten statement (`unsafe`); near-claims ("wheat-free", "gluten-friendly", "very low gluten"), unrelated phrasing ("gluten-free options"), an ingredient-level claim, and a claim with no visible ingredient list don't count. **The barcode path applies the same rule** (004 reversed 003's T5): an Open Food Facts gluten-free label tag is the whole-product claim, and a gluten allergen tag next to it with oats in the list and no gluten grain is auto-derived from oats, not a conflict (with neither oats nor a grain, with a grain-specific tag, or with unrecognized gluten-related label text, the record contradicts itself → caution/`conflict`, never safe — and since decision 006 an unexplained gluten tag on an unlabeled record is too, as it may be the package's "Contains: wheat"; a package statement that gluten is present — `en:contains-gluten`, free-text "very low gluten" / "gluten-reduced" / "not gluten-free" — reaches Claude as a "Package states:" line and is never safe; any other unrecognized gluten-related tag reaches it as unverified free text that never lifts the verdict). `gf_label_present` on barcode `scan` events measures it. Any change to this rule must pass both live evals (`RUN_LIVE_EVALS=1`, `web/tests/api/evals/`) with zero false-safe — see `plans/gf-label-claim-2026-08-28.md`
- **Live evals spend real credits — one FULL run per PR**: `RUN_LIVE_EVALS=1 node --env-file=.env node_modules/vitest/vitest.mjs run --root web tests/api/evals` runs three Claude runners — `gf-claim` and `barcode-gf-claim` (decisions 003/004) and `calibration.live.test.js` (decision 006, both paths) — and samples each case once (91 Opus calls incl. one cache warm-up per runner, under $1), plus `jev-fast-path.live.test.js` (decision 007: the fast-path decision with live Jev on the 30 barcode cases, zero settled false-safe; 30 Jev calls, 126 on FULL, no Anthropic spend; needs `TYPESAFE_API_KEY` — the evals key — and refuses to collect without it) — iterate with that and `-t`. `FULL=1` is the merge gate (2× safe / 5× adversarial, 346 calls ≈ $3.30 with the cached prompt, ≈ $12.50 uncached): run it once, before merge, and a human approves the command (`.claude/settings.json` asks on `RUN_LIVE_EVALS` and `--env-file`); a second FULL run within an hour (from any worktree; state in `.git/live-eval-state/`) is refused unless `FORCE=1`, and watch mode is refused. A review/grill agent never runs live evals — a review shouldn't spend. (2026-09-16: nine unguarded FULL runs in 50 minutes emptied the org's prepaid credits and took the live app down for two hours.)
- **The Jev fast path answers first only where it's sure** (decision 007): Open Food Facts barcodes past the code gates (no gluten-free or other gluten/celiac label, no gluten-signal note), Jev + `GLUTEN_GRAIN_PATTERN` agreeing on a listed grain → `unsafe`, every question clear + a complete list + only allowlisted allergen/trace tags (`FAST_PATH_SAFE_TAGS` — it fails closed; Jev never sees tags) + no grain, gluten, oats, cereal or teriyaki word → `safe`; everything else falls through to Claude, which runs on every scan and audits every settled verdict. `JEV_MODE` stages what's served (`unsafe` before `full`, gated on ≥ 50 shadowed Jev-`safe` audits with zero Claude disagreements, F4). Its tag check is its own — `isGlutenFamilyTag` (what Claude sees) is unchanged. A verdict-rule change that alters what `safe` means must pass the fast-path live eval too
- **The safe-verdict floor is load-bearing**: `applySafeVerdictFloor` (`api/analyze.js`) exists because a 3-character OCR read once came back `safe` (2026-07-19). Below `MIN_OCR_CHARS_FOR_SAFE` (100 — the 10th percentile of successful extractions) a scan can never return `safe`. Don't remove it or raise the threshold without re-reading the distribution.
- **So is the ingredient-list gate** (decision 005): `applyIngredientListGate` (`api/analyze.js`, 2026-09-22) withholds `safe` on a photographed label unless the OCR text has an ingredients heading starting its line (the list's start — flour is usually first) and, after every heading, a line-ending full stop (its end — an allergen line deliberately doesn't count, decision 005 T1). Both models called cut-off gluten labels `safe` in the jev-sandbox truncation test because the cut took the gluten word with it; the prompt's "incomplete → caution" rule doesn't catch what the model doesn't notice. Menus with dishes are exempt; never on the barcode path (21% of Open Food Facts lists have no full stop). Known leaks: a full stop that happens to end a line inside or beside a cut list (incl. a side crop that keeps one), a sub-heading that survives a top cut on its own line, a label the model calls a menu. Real Vision reads pinned in `web/tests/fixtures/real-label-ocr.json`. CJK labels effectively can't reach `safe` by photo. `list_gate` on `scan` events records each downgrade — group OCR verdict reads that span 2026-09-22 by it
- **Flag plain oats as "caution"**: cross-contamination risk when the label carries no gluten-free claim or certification. A whole-product claim covers them (decision 004); "gluten-free oats" inside the ingredient list covers only those oats — each oat ingredient is judged on its own ("gluten-free rolled oats, oat flour" still lists plain oat flour)
- **Multilingual analysis**: The Claude prompt detects non-English text and returns an optional `detected_language` field (ISO 639-1). Flagged ingredients are translated in-place as "original (english)" and explanations/notes are always in English. Dedicated vocabulary + allergen-phrase blocks exist for **Spanish, Dutch, Catalan, and French**; other languages are handled generically by Claude. The barcode path's `GLUTEN_GRAIN_PATTERN` (`assessGlutenSignal`, api/barcode.js) mirrors this vocabulary plus German/Italian so non-English ingredient lists corroborate Open Food Facts gluten tags — keep the two in sync when adding a language (2026-07-27 safety fix). For non-English menus the prompt injects a "Traveler Context" rule that leans caution on ambiguous items and adds a show-the-server phrase (e.g. *"Bevat dit gluten?"*) in every caution item's `notes`.
- **Optimize for in-store use**: Speed, clarity, minimal taps
- **Keep code simple**: This is an MVP, avoid over-engineering
- **Mobile local persistence**: Use `mobile/services/storage.ts` (AsyncStorage utilities) for any history/favorites/etc. — don't touch AsyncStorage directly
- **Run tests before committing**: `npm test` must pass before committing changes

## Design System ("Direction A · Clinic")

The V2 redesign is token-driven — **don't hardcode hex/spacing/type**; reference the tokens.

- **Source of truth**: `web/css/styles.css` `:root` (`--gon-*` custom properties) for web; `mobile/constants/theme.ts` (`theme` + `verdictColors`) for mobile. Both mirror the canonical `GlutenOrNot - V2 Designs/handoff/tokens.json`.
- **The only saturated color is the verdict** (safe green / caution amber / unsafe red). All other chrome is neutral (ink/sub/faint/line/surfaces). There is no brand hue — the old teal is gone. Caution deliberately uses near-black text on amber and a darker amber (`accent`) for marks on white.
- **Type**: Hanken Grotesk (UI) + JetBrains Mono (data/caps labels). Mobile loads them via `useFonts` in `_layout.tsx`; use `sans(weight)`/`mono(weight)` from `constants/fonts.ts` (RN needs explicit weighted family names). Web loads them via a Google Fonts `<link>`.
- **Marks**: scan reticle (logo motif), 3-dot verdict scale, and a line-icon glyph set — `components/Icon.tsx` (mobile, react-native-svg) / inline SVG in `index.html` + `js/ui.js` (web). No emoji.
- **Reference**: `GlutenOrNot - V2 Designs/handoff/HANDOFF.md` is the build spec; `.jsx` files there are the precise layout reference (reimplement natively, don't copy).
- **Icon**: dark-reticle mark (white scan frame + 3-dot verdict scale on `#121211`). Web favicon/PWA → `web/assets/icons/icon-180.png` + `icon-1024.png`; mobile app/adaptive/splash → `mobile/assets/*.png` (1024 master from `GlutenOrNot - V2 Designs/assets/appicon/`). Splash/adaptive backgrounds are `#121211`.
- **Follow-ups not yet done** (HANDOFF §7): upload the (alpha-flattened) `icon-1024` + the 4 App Store screenshots (`GlutenOrNot - V2 Designs/assets/appstore/`) to App Store Connect; a dedicated mark+wordmark splash asset (currently the app icon stands in); dark mode is undesigned (Recents was built 2026-07-06 in the Clinic style without a formal design).

## Expo Project Info

- **Expo account**: peanutbutterbaddy
- **Project ID**: ddfbd94a-effe-4f50-b26c-e15e86e8caee
- **Bundle ID**: com.glutenornot.scanner
