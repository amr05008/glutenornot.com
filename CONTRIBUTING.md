# Contributing to GlutenOrNot

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/amr05008/glutenornot.com.git
   cd glutenornot.com
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Add your API keys to .env
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

Note: The frontend works without API keys, but scanning won't function until you add:
- `GOOGLE_CLOUD_VISION_API_KEY` - for OCR
- `ANTHROPIC_API_KEY` - for ingredient analysis

## Project Structure

```
/
├── index.html          # Single-page app (all UI states)
├── css/styles.css      # Mobile-first styles
├── js/
│   ├── app.js          # Main orchestration, state management
│   ├── camera.js       # Photo capture, drag-drop, paste handling
│   ├── api.js          # API client with error handling
│   └── ui.js           # UI state transitions
├── api/
│   ├── analyze.js      # Vercel serverless: OCR + Claude analysis
│   └── health.js       # Health check endpoint
├── sw.js               # Service worker for PWA/offline
└── manifest.json       # PWA configuration
```

## How It Works

1. User provides an image (camera, upload, drag-drop, or paste)
2. `camera.js` processes and resizes the image to base64
3. `api.js` sends it to `/api/analyze`
4. Server runs OCR (Google Vision) → extracts ingredient text
5. Server sends text to Claude → gets safety verdict
6. `ui.js` displays the result (safe/caution/unsafe)

## Code Guidelines

- **Keep it simple** - This is an MVP. Avoid over-engineering.
- **Mobile-first** - Test on mobile. Most users are scanning labels in stores.
- **Be conservative with verdicts** - When uncertain, use "caution" not "safe"
- **No frameworks** - Vanilla HTML/CSS/JS intentionally. Keep it lightweight.

## Making Changes

1. Create a branch from `main`
   ```bash
   git checkout -b your-feature-name
   ```

2. Make your changes

3. Test locally:
   - Does it work on mobile?
   - Does drag-drop still work on desktop?
   - Does the offline state display correctly?

4. Submit a PR with:
   - What you changed and why
   - How to test it

## Areas for Contribution

- **Improve OCR accuracy** - Better image preprocessing
- **Expand ingredient detection** - More edge cases, regional ingredients
- **Accessibility** - Screen reader support, keyboard navigation
- **Testing** - Unit tests, integration tests
- **Internationalization** - Support for non-English labels

## Questions?

Open an issue if you're unsure about anything. We're happy to help!
