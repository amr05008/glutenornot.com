# GlutenOrNot

A free PWA that helps people with celiac disease scan ingredient labels and get instant safety assessments.

## Features

- **Photo scanning**: Take a photo of any ingredient label
- **AI-powered analysis**: Uses OCR + Claude to identify gluten-containing ingredients
- **Clear verdicts**: Safe, Caution, or Unsafe with explanations
- **Offline support**: Works as a PWA with offline fallback
- **Privacy-focused**: No accounts required, no images stored

## Getting Started

### Prerequisites

- Node.js 18+
- Google Cloud Vision API key
- Anthropic API key

### Development

1. Clone the repository
2. Copy `.env.example` to `.env` and add your API keys
3. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

4. Open http://localhost:3000

### Deployment

This app is designed for Vercel deployment:

1. Connect your repository to Vercel
2. Add environment variables:
   - `GOOGLE_CLOUD_VISION_API_KEY`
   - `ANTHROPIC_API_KEY`
3. Deploy

## How It Works

1. User takes a photo of an ingredient label
2. Image is sent to Google Cloud Vision for OCR
3. Extracted text is analyzed by Claude
4. User receives a verdict:
   - **Safe**: No gluten-containing ingredients detected
   - **Caution**: Contains ambiguous ingredients or warnings
   - **Unsafe**: Contains wheat, barley, rye, or derivatives

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Backend**: Vercel serverless functions
- **OCR**: Google Cloud Vision API
- **Analysis**: Claude API (Sonnet)
- **Hosting**: Vercel

## Known Limitations

- **Rate limiting**: Currently uses in-memory storage (50 scans/IP/day). This won't persist across serverless function instances in production. For production use, migrate to Vercel KV or similar persistent storage.
- **Icons**: Using SVG icons which may not be supported on all platforms for PWA installation. PNG versions (192x192, 512x512) recommended for full compatibility.

## License

MIT
