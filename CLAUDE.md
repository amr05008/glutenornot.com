# GlutenOrNot - Project Instructions

## Quick Reference

- **Tech Stack**: Vanilla HTML/CSS/JS (web), React Native/Expo (mobile), Vercel serverless functions, Sentry (crash reporting)
- **APIs**: Google Cloud Vision (OCR), Claude API (Sonnet)
- **Roadmap**: `ROADMAP.md` - prioritized improvement plan
- **Session history**: `.claude/sessions/`
- **Decisions**: `.claude/decisions/`

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
│   │   └── storage.ts      # AsyncStorage utilities (scan count, future: history)
│   ├── constants/
│   │   ├── theme.ts        # Design tokens (verdictColors + theme: color/type/space/radius)
│   │   ├── fonts.ts        # Font map for useFonts + sans()/mono() weight→family helpers
│   │   └── verdicts.ts     # Types (AnalysisResult, MenuItem), VERDICT_META, API URLs
│   ├── app.json            # Expo config (bundle ID, permissions)
│   └── eas.json            # EAS Build config
├── api/                    # Shared Vercel serverless functions
│   ├── _utils.js           # Shared rate limiting, verdict normalization, constants
│   ├── analyze.js          # OCR + Claude analysis
│   ├── barcode.js          # Barcode lookup (waterfall: Open Food Facts → USDA → Nutritionix)
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
- `NUTRITIONIX_APP_ID`
- `NUTRITIONIX_API_KEY`

## Guidelines

- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
- **Flag all oats as "caution"**: Cross-contamination risk unless certified GF
- **Multilingual analysis**: The Claude prompt detects non-English text and returns an optional `detected_language` field (ISO 639-1). Flagged ingredients are translated in-place as "original (english)" and explanations/notes are always in English. Dedicated vocabulary + allergen-phrase blocks exist for **Spanish, Dutch, and Catalan**; other languages are handled generically by Claude. For non-English menus the prompt injects a "Traveler Context" rule that leans caution on ambiguous items and adds a show-the-server phrase (e.g. *"Bevat dit gluten?"*) in every caution item's `notes`.
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
- **Follow-ups not yet done** (HANDOFF §7): upload the (alpha-flattened) `icon-1024` + the 4 App Store screenshots (`GlutenOrNot - V2 Designs/assets/appstore/`) to App Store Connect; a dedicated mark+wordmark splash asset (currently the app icon stands in); Recents/history and dark mode are undesigned.

## Mobile Roadmap

**Note**: `mobile/services/storage.ts` provides AsyncStorage utilities. Use this for any local persistence (history, favorites, etc.).

### High Priority
- [ ] **Recents screen**: Show scan history (extend `storage.ts`, no account needed)
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
