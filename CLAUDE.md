# GlutenOrNot - Project Instructions

## Quick Reference

- **Tech Stack**: Vanilla HTML/CSS/JS (web), React Native/Expo (mobile), Vercel serverless functions, Sentry (crash reporting)
- **APIs**: Google Cloud Vision (OCR), Claude API (Sonnet)
- **Roadmap**: `ROADMAP.md` - prioritized improvement plan
- **Session history**: `.claude/sessions/`
- **Decisions**: `.claude/decisions/`
- **Skills**: `.claude/skills/` — `glutenornot-release` drives the iOS release (points at `mobile/RELEASE.md`)

## Project Structure (Monorepo)

```
/
├── web/                    # Web PWA
│   ├── index.html          # Single-page app
│   ├── manifest.json       # PWA configuration
│   ├── sw.js               # Service worker
│   ├── css/styles.css      # Design tokens (:root --gon-*) + V2 component styles
│   ├── js/
│   │   ├── app.js          # Main orchestration
│   │   ├── camera.js       # Photo capture
│   │   ├── api.js          # API client
│   │   ├── config.js       # Verdict labels + glyph names
│   │   └── ui.js           # UI state management (builds result markup + inline SVG marks)
│   └── tests/              # Vitest tests
├── mobile/                 # React Native (Expo) iOS app
│   ├── app/                # Expo Router screens
│   │   ├── _layout.tsx     # Root layout (loads fonts, headerless)
│   │   ├── index.tsx       # Camera capture screen
│   │   ├── recents.tsx     # Scan history list (local-only, taps reopen saved results)
│   │   └── result.tsx      # Result display screen (routes to Result/Menu card)
│   ├── components/
│   │   ├── ResultCard.tsx      # Verdict band + sheet (ingredient labels / barcodes)
│   │   ├── MenuResultCard.tsx  # Tally + grouped dishes (restaurant menus)
│   │   ├── StateScreen.tsx     # Full-screen system states (permission / offline / couldn't-read)
│   │   ├── Icon.tsx            # SVG marks: Icon glyph set, Reticle, VerdictDots (react-native-svg)
│   │   ├── Toast.tsx           # Auto-dismiss notification component
│   │   └── LoadingSpinner.tsx
│   ├── services/
│   │   ├── api.ts          # API client (calls production backend)
│   │   ├── errorReporting.ts # Sentry error reporting wrapper
│   │   ├── review.ts       # In-app App Store rating prompt (expo-store-review, once per install)
│   │   └── storage.ts      # AsyncStorage utilities (scan count, review-prompted flag, recent scans)
│   ├── constants/
│   │   ├── theme.ts        # Design tokens (verdictColors + theme: color/type/space/radius)
│   │   ├── fonts.ts        # Font map for useFonts + sans()/mono() weight→family helpers
│   │   └── verdicts.ts     # Types (AnalysisResult, MenuItem), VERDICT_META, API URLs
│   ├── app.json            # Expo config (bundle ID, permissions)
│   └── eas.json            # EAS Build config
├── api/                    # Shared Vercel serverless functions
│   ├── _utils.js           # Shared rate limiting, verdict normalization, Claude client + error classification, constants
│   ├── _analytics.js       # PostHog scan-event logging (no-op until POSTHOG_API_KEY set)
│   ├── analyze.js          # OCR + Claude analysis
│   ├── barcode.js          # Barcode lookup (waterfall: Open Food Facts → USDA → Nutritionix → UPCitemdb)
│   └── health.js           # Health check
└── package.json            # Monorepo root
```

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

Optional (for barcode lookup fallback sources):
- `USDA_API_KEY` (free at https://fdc.nal.usda.gov/api-key-signup/)
- `NUTRITIONIX_APP_ID` / `NUTRITIONIX_API_KEY` (paid only — Syndigo discontinued the free tier in favor of $499+/mo plans; the code keeps the hook but don't plan on it)

The final fallback, UPCitemdb, is keyless (free trial tier, 100 lookups/day) — nothing to configure. It returns name/brand (and, for many grocery items, an ingredient statement embedded in its description field, which the lookup extracts).

Optional (for scan-event analytics — `api/_analytics.js`):
- `POSTHOG_API_KEY` (PostHog project API key, `phc_…`). When unset, `trackScan()`/`trackScanFailure()` are no-ops, so analytics is off in dev/test by default. Set it in Vercel prod to record one `scan` event per successful analysis (both OCR and barcode paths, with `confidence` and — barcode only — `had_ingredient_data` properties) and one `scan_failed` event per failed attempt (`reason`: not_found | ocr_failed | rate_limited | claude_error | server_error). Never add the scanned barcode/product to these events — the privacy policy promises "no record of what you scanned"; missed barcodes are visible only in ephemeral Vercel runtime logs. Keep `scan` success-only — existing dashboard insights count it as successful scans.
- `POSTHOG_HOST` (defaults to `https://us.i.posthog.com`; set to the EU host if your project is in EU cloud)

Optional (for proactive outage detection — `api/health.js`):
- `HEALTH_CHECK_TOKEN` (any random secret). When unset, the deep health check is disabled and `/api/health` reports key presence only. When set, `GET /api/health?deep=1` with a matching `x-health-token` header (or `?token=`) pings the live Claude model (`max_tokens:1`) and returns 503 with the upstream status if the model is retired/unreachable or the key is invalid. An external uptime monitor hits this on an interval so an analysis outage alerts us instead of going unnoticed (this is how we'd have caught the `claude-sonnet-4-20250514` retirement). Generate with `openssl rand -hex 16`.

## Guidelines

- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
- **Flag all oats as "caution"**: Cross-contamination risk unless certified GF
- **Multilingual analysis**: The Claude prompt detects non-English text and returns an optional `detected_language` field (ISO 639-1). Flagged ingredients are translated in-place as "original (english)" and explanations/notes are always in English. Dedicated vocabulary + allergen-phrase blocks exist for **Spanish, Dutch, Catalan, and French**; other languages are handled generically by Claude. For non-English menus the prompt injects a "Traveler Context" rule that leans caution on ambiguous items and adds a show-the-server phrase (e.g. *"Bevat dit gluten?"*) in every caution item's `notes`.
- **Optimize for in-store use**: Speed, clarity, minimal taps
- **Keep code simple**: This is an MVP, avoid over-engineering
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

## Mobile Roadmap

**Note**: `mobile/services/storage.ts` provides AsyncStorage utilities. Use this for any local persistence (history, favorites, etc.).

### High Priority
- [x] **Recents screen**: Local scan history (`app/recents.tsx`, last 50 in AsyncStorage, tap reopens the saved result, Clear All; no account). Ships with the next iOS build.
- [x] **Barcode scanning**: Integrated barcode scanner alongside OCR (auto-detects barcodes via camera)
- [x] **Mode toggle**: Not needed — camera auto-detects barcodes and ingredient labels simultaneously

### Medium Priority
- [ ] **Favorites**: Save products you buy regularly
- [ ] **Share results**: Share verdict as image/text
- [ ] **Haptic feedback**: Vibrate on verdict (success/warning patterns)
- [ ] **Dark mode**: Match system preference

### Lower Priority
- [ ] **User accounts**: Sync history across devices
- [ ] **Android release**: Test and publish to Play Store

## Expo Project Info

- **Expo account**: peanutbutterbaddy
- **Project ID**: ddfbd94a-effe-4f50-b26c-e15e86e8caee
- **Bundle ID**: com.glutenornot.scanner

## Imports

@~/.claude/rules/session-management.md
