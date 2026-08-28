# GlutenOrNot - Project Instructions

## Quick Reference

- **Tech Stack**: Vanilla HTML/CSS/JS (web), React Native/Expo (mobile), Vercel serverless functions, Sentry (crash reporting)
- **APIs**: Google Cloud Vision (OCR), Claude API (Opus)
- **Roadmap**: `ROADMAP.md` - prioritized improvement plan
- **Active plans**: `plans/` — scoped work-in-progress. **One open:** `weak-signal-upload-2026-08-28.md` (mobile upload/progress/cancel telemetry → iOS 1.4.3). `gf-label-claim-2026-08-28.md` **shipped 2026-08-28** (PR #23, decision 003) — only its step-9 effect read (~2026-09-25) remains. `ocr-capture-assist-2026-07-18.md` is closed (2026-08-13) — read its CLOSED header before reopening the capture question
- **Session history**: `.claude/sessions/`
- **Decisions**: `.claude/decisions/`
- **Skills**: `.claude/skills/` — `glutenornot-release` drives the iOS release (points at `mobile/RELEASE.md`)

## Project Structure (Monorepo)

Three deployables: `web/` (vanilla-JS PWA, vitest tests in `web/tests/`), `mobile/` (Expo Router / React Native iOS app, jest tests), and `api/` (shared Vercel serverless functions used by both clients). Browse the tree for the rest — only the non-obvious facts are listed here:

- `api/_utils.js` — shared rate limiting, verdict normalization, and the Claude client + error classification; both endpoints (`analyze.js`, `barcode.js`) go through it.
- `api/barcode.js` — waterfall lookup: Open Food Facts → USDA → Nutritionix → UPCitemdb.
- `api/track.js` — client failure beacon for the two failures that die on the wire (`timeout`/`network`) and are invisible to the server; contract in `api/ANALYTICS.md`.
- `mobile/app/result.tsx` — routes to `ResultCard` (ingredient labels/barcodes) vs `MenuResultCard` (restaurant menus) based on the response's `mode`.
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
- **Outage detection**: `HEALTH_CHECK_TOKEN` enables the deep health check (`GET /api/health?deep=1` + `x-health-token` header) — pings the live Claude model so an external uptime monitor catches model retirements/bad keys instead of silent 503s. Details in `api/health.js`.

## Guidelines

- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
- **An explicit gluten-free label claim lifts ambiguous-ingredient cautions to `safe`** (decision 003, 2026-08-28): "gluten-free" / "sin gluten" / "glutenvrij" / … is a regulated claim (<20 ppm) that covers natural flavors, maltodextrin, modified starch, spices, and hydrolyzed protein of unstated source. Oats (unless certified GFCO/CSA), a listed gluten source, and may-contain / shared-equipment advisories still win; "not gluten-free" is a gluten statement (`unsafe`); near-claims ("wheat-free", "gluten-friendly", "very low gluten"), unrelated phrasing ("gluten-free options"), an ingredient-level claim, and a claim with no visible ingredient list don't count. Any change to this rule must pass the live eval (`RUN_LIVE_EVALS=1`, `web/tests/api/evals/`) with zero false-safe — see `plans/gf-label-claim-2026-08-28.md`
- **The safe-verdict floor is load-bearing**: `applySafeVerdictFloor` (`api/analyze.js`) exists because a 3-character OCR read once came back `safe` (2026-07-19). Below `MIN_OCR_CHARS_FOR_SAFE` (100 — the 10th percentile of successful extractions) a scan can never return `safe`. Don't remove it or raise the threshold without re-reading the distribution.
- **Flag all oats as "caution"**: Cross-contamination risk unless certified GF
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
