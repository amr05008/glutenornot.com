# GlutenOrNot

A free PWA that helps people with celiac disease scan ingredient labels and get instant safety assessments.

## Features

- **Photo scanning**: Take a photo of any ingredient label
- **Desktop support**: Drag-drop images or paste from clipboard
- **AI-powered analysis**: Uses OCR + Claude to identify gluten-containing ingredients
- **Clear verdicts**: Safe, Caution, or Unsafe with explanations
- **Offline support**: Works as a PWA with offline fallback
- **Privacy-focused**: No accounts required, no images stored

## Getting Started

```bash
npm install
cp .env.example .env   # Add your API keys
npx vercel login       # One-time auth
npx vercel dev         # http://localhost:3000
```

Note: `vercel dev` runs the serverless functions locally. For static-only serving (no API), use `npm run dev:static`.

Scanning requires:
- `GOOGLE_CLOUD_VISION_API_KEY`
- `ANTHROPIC_API_KEY`

## Project Structure

```
index.html              # Single-page app (all UI states)
css/styles.css          # Mobile-first styles
js/
  app.js                # Main orchestration
  camera.js             # Photo capture, drag-drop, paste
  api.js                # API client
  ui.js                 # UI state transitions
api/
  analyze.js            # Serverless: OCR + Claude analysis
  health.js             # Health check
```

## How It Works

1. User provides image (camera, upload, drag-drop, or paste)
2. Image is resized and sent to `/api/analyze`
3. Google Cloud Vision extracts text via OCR
4. Claude analyzes ingredients and returns verdict
5. UI displays result: Safe / Caution / Unsafe

## Deployment

Designed for Vercel:

1. Connect repo to Vercel
2. Add environment variables
3. Deploy

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
- **Icons**: SVG only. Add PNG versions (192x192, 512x512) for full PWA compatibility.

## Contributing

See [`ROADMAP.md`](./ROADMAP.md) for the prioritized improvement plan.

Guidelines: Keep it simple, test on mobile, be conservative with verdicts (when uncertain, use "caution").

## License

MIT
