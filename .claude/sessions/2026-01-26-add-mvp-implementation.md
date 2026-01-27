---
date: 2026-01-26
summary: Initial MVP implementation of GlutenOrNot PWA
tags: [mvp, pwa, frontend, api, service-worker]
---

## Summary

Implemented the full MVP of GlutenOrNot, a PWA that helps people with celiac disease scan ingredient labels and get instant safety assessments. The implementation includes the frontend UI, serverless API endpoints for OCR and Claude analysis, service worker for offline support, and rate limiting.

## Changes

### Project Structure
- `package.json` - npm project configuration with dev server
- `.env.example` - Template for required API keys
- `.gitignore` - Git ignore patterns
- `vercel.json` - Vercel deployment configuration

### Frontend
- `index.html` - Single-page app shell with all UI states (ready, processing, result, error, offline)
- `css/styles.css` - Mobile-first responsive styles with CSS variables
- `js/app.js` - Main app orchestration, event handling, scan counting
- `js/ui.js` - UI state management and result rendering
- `js/camera.js` - Photo capture via file input, image resizing
- `js/api.js` - API client with error handling and types

### Backend (Serverless)
- `api/analyze.js` - Main endpoint: OCR via Google Cloud Vision + Claude analysis
- `api/health.js` - Health check endpoint for service status

### PWA
- `manifest.json` - PWA metadata and icons
- `sw.js` - Service worker with precaching and offline fallback
- `assets/icons/icon.svg` - App icon

## Decisions

### Photo Capture via File Input
Used `<input type="file" accept="image/*" capture="environment">` instead of getUserMedia for simplicity. This triggers native camera on mobile and works as file picker on desktop.

### In-Memory Rate Limiting
Rate limiting is implemented in-memory in the serverless function. For production with multiple instances, should migrate to Vercel KV.

### SVG Icons
Using SVG icons initially for simplicity. PNG versions should be generated for full browser compatibility.

### Claude Model
Using `claude-sonnet-4-20250514` for cost/quality balance. Can dial back to Haiku if costs require.

## Notes

### Next Steps
1. Generate PNG icons for better PWA compatibility
2. Deploy to Vercel and configure environment variables
3. Test with real products (10-15 manual tests)
4. Consider Vercel KV for production rate limiting
5. Post-MVP: Add Supabase analytics

### Test Checklist
- [ ] Camera works on iOS Safari
- [ ] Camera works on Android Chrome
- [ ] File upload fallback works
- [ ] Offline page displays correctly
- [ ] Rate limit message displays correctly
- [ ] PWA installs correctly on both platforms
