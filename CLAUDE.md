# GlutenOrNot - Project Instructions

## Project Overview

GlutenOrNot is a gluten detection app for people with celiac disease. Users photograph ingredient labels and get instant AI-powered safety assessments (Safe/Caution/Unsafe).

**Live site**: https://www.glutenornot.com

## Tech Stack

- **Web**: Vanilla HTML/CSS/JS (PWA)
- **Mobile**: React Native with Expo (iOS)
- **Backend**: Vercel serverless functions
- **APIs**: Google Cloud Vision (OCR), Claude API (Sonnet)

## Project Structure (Monorepo)

```
glutenornot.com/
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
│   │   └── api.ts          # API client (calls production backend)
│   ├── constants/
│   │   └── verdicts.ts     # Verdict colors, types, API URL
│   ├── app.json            # Expo config (bundle ID, permissions)
│   └── eas.json            # EAS Build config
├── api/                    # Shared Vercel serverless functions
│   ├── analyze.js          # POST /api/analyze - OCR + Claude analysis
│   └── health.js           # GET /api/health - Health check
├── package.json            # Monorepo root (workspaces: web only)
└── vercel.json             # Vercel config (serves from /web)
```

## Current State (as of Jan 2026)

### Completed
- [x] Web PWA fully functional and deployed
- [x] Mobile app built with Expo/React Native
- [x] Camera capture with image compression
- [x] API integration (mobile calls production backend)
- [x] Result display with verdict badges
- [x] EAS configured for iOS builds
- [x] Published to Expo for testing via Expo Go

### In Progress / Blocked
- [ ] TestFlight deployment (Apple servers were having issues)
- [ ] Expo Go remote sharing (permissions issues with org members)

### Not Started
- [ ] Android support (React Native ready, just needs testing)
- [ ] User accounts / scan history
- [ ] Barcode scanning integration

## Development Commands

### Web
```bash
npm install
npx vercel dev              # http://localhost:3000
npm test                    # Run tests
```

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

Required in `.env` (root) and Vercel dashboard:
```
GOOGLE_CLOUD_VISION_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
```

## API Endpoints

### POST /api/analyze
```json
// Request
{ "image": "<base64-jpeg>" }

// Response
{
  "verdict": "safe" | "caution" | "unsafe",
  "flagged_ingredients": ["wheat"],
  "allergen_warnings": ["May contain wheat"],
  "explanation": "Brief explanation",
  "confidence": "high" | "medium" | "low"
}
```

### GET /api/health
Returns API key configuration status.

## Key Files to Know

| File | Purpose |
|------|---------|
| `api/analyze.js` | Main analysis logic, Claude prompt, rate limiting |
| `mobile/app/index.tsx` | Camera screen, image capture + compression |
| `mobile/services/api.ts` | Mobile API client (60s timeout) |
| `mobile/constants/verdicts.ts` | API URL, verdict colors |
| `mobile/app.json` | Expo config, iOS bundle ID, permissions |
| `mobile/eas.json` | EAS Build profiles |

## Guidelines

- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
- **Flag all oats as "caution"**: Cross-contamination risk unless certified GF
- **Optimize for in-store use**: Speed, clarity, minimal taps
- **Keep code simple**: MVP - avoid over-engineering
- **Run tests before committing**: `npm test` must pass

## Mobile Roadmap

### High Priority
- [ ] **Recents screen**: Show scan history (local storage, no account needed)
  - Store last 20-50 scans with thumbnail, verdict, timestamp
  - Tap to view full result again
  - Clear history option
- [ ] **Barcode scanning**: Integrate barcode scanner alongside OCR
  - Use `expo-barcode-scanner`
  - Look up product in Open Food Facts API (free)
  - Fall back to OCR if product not found
- [ ] **Mode toggle**: Switch between camera (OCR) and barcode modes
  - Bottom tab bar or toggle button on camera screen

### Medium Priority
- [ ] **Favorites**: Save products you buy regularly
- [ ] **Share results**: Share verdict as image/text
- [ ] **Haptic feedback**: Vibrate on verdict (success/warning patterns)
- [ ] **Dark mode**: Match system preference
- [ ] **Onboarding**: Quick tutorial on first launch

### Lower Priority
- [ ] **User accounts**: Sync history across devices
- [ ] **Meal logging**: Track what you ate (for symptom correlation)
- [ ] **Restaurant mode**: Scan menus, flag potential issues
- [ ] **Widget**: iOS home screen widget for quick scan access
- [ ] **Apple Watch**: Quick verdict view on watch

### Technical Improvements
- [ ] **Offline mode**: Cache recent API responses, show cached results when offline
- [ ] **Image cropping**: Let user crop to ingredient list before sending
- [ ] **Faster OCR**: Consider on-device OCR (ML Kit) to reduce latency
- [ ] **Android release**: Test and publish to Play Store
- [ ] **Push notifications**: Alert when a flagged product is recalled (future)

## Known Issues

1. **Rate limiting**: In-memory storage doesn't persist across serverless instances. Use Vercel KV for production.
2. **Image upload speed**: Large images can be slow on mobile. Currently resizing to 1024px width, 0.7 quality.
3. **Expo Go permissions**: Remote sharing via Expo org can have auth issues. Use `--tunnel` mode as fallback.

## Expo Project Info

- **Expo account**: peanutbutterbaddy
- **Project ID**: ddfbd94a-effe-4f50-b26c-e15e86e8caee
- **Bundle ID**: com.glutenornot.app
