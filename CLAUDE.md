# GlutenOrNot - Project Instructions

## Quick Reference

- **Tech Stack**: Vanilla HTML/CSS/JS, Vercel serverless functions
- **APIs**: Google Cloud Vision (OCR), Claude API (Sonnet)
- **Session history**: `.claude/sessions/`
- **Decisions**: `.claude/decisions/`

## Project Structure

```
/
├── index.html          # Single-page app
├── manifest.json       # PWA configuration
├── sw.js               # Service worker
├── css/styles.css      # Mobile-first styles
├── js/
│   ├── app.js          # Main orchestration
│   ├── camera.js       # Photo capture
│   ├── api.js          # API client
│   └── ui.js           # UI state management
├── api/
│   ├── analyze.js      # OCR + Claude analysis
│   └── health.js       # Health check
└── assets/icons/       # PWA icons
```

## Development

```bash
npm install
npx vercel dev  # Runs Vercel dev server with API functions
```

Note: Requires Vercel CLI login (`npx vercel login`). For static-only serving without APIs, use `npm run dev:static`.

## Environment Variables

Required for API functionality:
- `GOOGLE_CLOUD_VISION_API_KEY`
- `ANTHROPIC_API_KEY`

## Guidelines

- **Be conservative with verdicts**: When uncertain, use "caution" rather than "safe"
- **Flag all oats as "caution"**: Cross-contamination risk unless certified GF
- **Optimize for in-store use**: Speed, clarity, minimal taps
- **Keep code simple**: This is an MVP, avoid over-engineering
- **Run tests before committing**: `npm test` must pass before committing changes

## Imports

@~/.claude/rules/session-management.md
