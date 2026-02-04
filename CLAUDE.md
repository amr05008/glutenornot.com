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
│   │   ├── ResultCard.tsx  # Verdict display component
│   │   └── LoadingSpinner.tsx
│   ├── services/
│   │   ├── api.ts          # API client (calls production backend)
│   │   ├── errorReporting.ts # Sentry error reporting wrapper
│   │   └── storage.ts      # AsyncStorage utilities (scan count, future: history)
│   ├── constants/
│   │   └── verdicts.ts     # Verdict colors, types, API URL
│   ├── app.json            # Expo config (bundle ID, permissions)
│   └── eas.json            # EAS Build config
├── api/                    # Shared Vercel serverless functions
│   ├── analyze.js          # OCR + Claude analysis
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

### TestFlight Build
```bash
cd mobile
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios
```

## Environment Variables

Required for API functionality:
- `GOOGLE_CLOUD_VISION_API_KEY`
- `ANTHROPIC_API_KEY`
- `SENTRY_AUTH_TOKEN` (EAS secret — for source map uploads during builds)

## Guidelines

- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
- **Flag all oats as "caution"**: Cross-contamination risk unless certified GF
- **Optimize for in-store use**: Speed, clarity, minimal taps
- **Keep code simple**: This is an MVP, avoid over-engineering
- **Run tests before committing**: `npm test` must pass before committing changes

## Mobile Roadmap

**Note**: `mobile/services/storage.ts` provides AsyncStorage utilities. Use this for any local persistence (history, favorites, etc.).

### High Priority
- [ ] **Recents screen**: Show scan history (extend `storage.ts`, no account needed)
- [ ] **Barcode scanning**: Integrate barcode scanner alongside OCR
- [ ] **Mode toggle**: Switch between camera (OCR) and barcode modes

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
