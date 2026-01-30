# GlutenOrNot

A free app that helps people with celiac disease scan ingredient labels and get instant safety assessments. Available as a web PWA and iOS mobile app.

## Quick Start

### Web App

```bash
cd web
npm install
cp ../.env.example ../.env   # Add your API keys
npx vercel dev               # http://localhost:3000
```

### Mobile App (iOS)

```bash
cd mobile
npm install
npx expo start
```

Then:
- **iOS Simulator**: Press `i` in the terminal
- **Physical device**: Install "Expo Go" from App Store, scan the QR code

## Project Structure

```
glutenornot.com/
├── web/                    # Web PWA
│   ├── index.html          # Single-page app
│   ├── css/styles.css      # Mobile-first styles
│   ├── js/                 # Frontend modules
│   │   ├── app.js          # Main orchestration
│   │   ├── camera.js       # Photo capture
│   │   ├── api.js          # API client
│   │   └── ui.js           # UI state management
│   └── tests/              # Web tests
├── mobile/                 # React Native (Expo) iOS app
│   ├── app/                # Expo Router screens
│   │   ├── index.tsx       # Camera screen
│   │   └── result.tsx      # Result display
│   ├── components/         # Reusable components
│   ├── services/api.ts     # API client
│   └── constants/          # Shared constants
├── api/                    # Shared Vercel serverless functions
│   ├── analyze.js          # OCR + Claude analysis
│   └── health.js           # Health check
└── package.json            # Monorepo root
```

## Environment Variables

Create a `.env` file in the root with:

```
GOOGLE_CLOUD_VISION_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

Required for the `/api/analyze` endpoint to work.

## How It Works

1. User takes a photo of an ingredient label
2. Image is resized and sent to `/api/analyze`
3. Google Cloud Vision extracts text via OCR
4. Claude analyzes ingredients for gluten content
5. Returns verdict: **Safe** / **Caution** / **Unsafe**

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | Analyze ingredient label image |
| `/api/health` | GET | Health check |

### POST /api/analyze

```json
// Request
{ "image": "<base64-encoded-jpeg>" }

// Response
{
  "verdict": "safe" | "caution" | "unsafe",
  "flagged_ingredients": ["wheat flour"],
  "allergen_warnings": ["Contains wheat"],
  "explanation": "This product contains wheat...",
  "confidence": "high" | "medium" | "low"
}
```

## Development

### Run Web Locally
```bash
npx vercel dev
```

### Run Mobile Locally
```bash
cd mobile
npx expo start
```

### Run Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Mobile App - TestFlight Deployment

```bash
cd mobile
npx eas-cli login
npx eas-cli build --platform ios --profile preview
npx eas-cli submit --platform ios
```

## Deployment (Web)

1. Connect repo to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

## License

MIT
