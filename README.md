# GlutenOrNot

GlutenOrNot instantly checks if packaged foods are safe for people with celiac disease. Point your camera at an ingredient label and get a clear verdict in seconds—no account required, completely free. Uses google OCR + Claude to scan and produce results. 

We built this because we have celiac disease ourselves. Figuring out what we could and couldn't eat was confusing at first, and we didn't want to pay for an app just to scan ingredients. We hope this makes it a little easier for you too. If you want to run locally or make your own version, just add your own API credentials (or modify as you see fit). 

## Features

- **Photo scanning**: Take a photo of any ingredient label
- **Desktop support**: Drag-drop images or paste from clipboard
- **AI-powered analysis**: Uses OCR + Claude to identify gluten-containing ingredients
- **Clear verdicts**: Safe, Caution, or Unsafe with explanations
- **Offline support**: Works as a PWA with offline fallback
- **Privacy-focused**: No accounts required, no images stored
- **Mobile app**: iOS app via React Native/Expo

## Getting Started

### Web App

```bash
npm install
cp .env.example .env   # Add your API keys
npx vercel login       # One-time auth
npx vercel dev         # http://localhost:3000
```

Note: `vercel dev` runs the serverless functions locally. For static-only serving (no API), use `npm run dev:static`.

### Mobile App (iOS)

```bash
cd mobile
npm install
npx expo start
```

Then:
- **iOS Simulator**: Press `i` in the terminal
- **Physical device**: Install "Expo Go" from App Store, scan the QR code

Scanning requires:
- `GOOGLE_CLOUD_VISION_API_KEY`
- `ANTHROPIC_API_KEY`

## Project Structure

```
glutenornot.com/
├── web/                    # Web PWA
│   ├── index.html          # Single-page app (all UI states)
│   ├── css/styles.css      # Mobile-first styles
│   ├── js/
│   │   ├── app.js          # Main orchestration
│   │   ├── camera.js       # Photo capture, drag-drop, paste
│   │   ├── api.js          # API client
│   │   └── ui.js           # UI state transitions
│   └── tests/              # Vitest tests
├── mobile/                 # React Native (Expo) iOS app
│   ├── app/                # Expo Router screens
│   ├── components/         # Reusable components
│   ├── services/           # API client
│   └── constants/          # Shared constants
├── api/                    # Shared Vercel serverless functions
│   ├── analyze.js          # Serverless: OCR + Claude analysis
│   └── health.js           # Health check
└── package.json            # Monorepo root
```

## How It Works

1. User provides image (camera, upload, drag-drop, or paste)
2. Image is resized and sent to `/api/analyze`
3. Google Cloud Vision extracts text via OCR
4. Claude analyzes ingredients and returns verdict
5. UI displays result: Safe / Caution / Unsafe

## Deployment

### Web (Vercel)

1. Connect repo to Vercel
2. Add environment variables
3. Deploy

### Mobile (TestFlight)

```bash
cd mobile
npx eas-cli login
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios
```

## Testing

Run tests:

```bash
npm test              # Run all tests once
npm run test:watch    # Run in watch mode
npm run test:coverage # Run with coverage report
```

Tests cover:
- Claude response parsing and fallback behavior
- Rate limiting logic
- API error handling

## Known Limitations

- **Rate limiting**: In-memory storage won't persist across serverless instances. Migrate to Vercel KV for production.

## Contributing

See [`ROADMAP.md`](./ROADMAP.md) for the prioritized improvement plan.

Guidelines: Keep it simple, test on mobile, be conservative with verdicts (when uncertain, use "caution").

## License

MIT
