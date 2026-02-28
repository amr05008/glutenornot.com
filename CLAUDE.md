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
│   ├── css/styles.css      # Mobile-first styles
│   ├── js/
│   │   ├── app.js          # Main orchestration
│   │   ├── camera.js       # Photo capture
│   │   ├── api.js          # API client
│   │   └── ui.js           # UI state management
│   └── tests/              # Vitest tests
├── mobile/                 # React Native (Expo) iOS app
│   ├── app/                # Expo Router screens
│   │   ├── _layout.tsx     # Root layout
│   │   ├── index.tsx       # Camera capture screen
│   │   └── result.tsx      # Result display screen
│   ├── components/
│   │   ├── ResultCard.tsx      # Verdict display (ingredient labels)
│   │   ├── MenuResultCard.tsx  # Verdict display (restaurant menus)
│   │   ├── Toast.tsx           # Auto-dismiss notification component
│   │   └── LoadingSpinner.tsx
│   ├── services/
│   │   ├── api.ts          # API client (calls production backend)
│   │   ├── errorReporting.ts # Sentry error reporting wrapper
│   │   └── storage.ts      # AsyncStorage utilities (scan count, future: history)
│   ├── constants/
│   │   └── verdicts.ts     # Verdict colors, types (AnalysisResult, MenuItem), API URL
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
- **Multilingual analysis**: The Claude prompt detects non-English text (especially Spanish), translates flagged ingredients as "original (english)", and always returns explanations in English. The API response includes an optional `detected_language` field (ISO 639-1 code) for non-English text.
- **Optimize for in-store use**: Speed, clarity, minimal taps
- **Keep code simple**: This is an MVP, avoid over-engineering
- **Run tests before committing**: `npm test` must pass before committing changes

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
