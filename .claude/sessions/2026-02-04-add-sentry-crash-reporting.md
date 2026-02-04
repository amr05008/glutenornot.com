---
date: 2026-02-04
summary: Integrated Sentry crash reporting into the React Native iOS app
tags: [sentry, crash-reporting, mobile, error-handling]
---

## Summary

Added Sentry crash reporting to the GlutenOrNot mobile app. Crashes and errors are automatically captured in production while staying silent during development. A thin `reportError()` wrapper centralizes error reporting with proper tagging for API errors.

## Changes

- `mobile/.npmrc` — Added `legacy-peer-deps=true` to fix pre-existing peer dependency conflict
- `mobile/package.json` — Added `@sentry/react-native` dependency
- `mobile/app.json` — Added Sentry Expo plugin with org/project config
- `mobile/app/_layout.tsx` — Added `Sentry.init()` at module scope and wrapped root component with `Sentry.wrap()`
- `mobile/services/errorReporting.ts` — **New file**: thin wrapper exposing `reportError()` that tags API errors by type and sets appropriate severity levels
- `mobile/app/index.tsx` — Added `reportError(error)` in camera capture catch block
- `mobile/app/result.tsx` — Added `reportError(error, { rawResult })` in JSON parse catch block
- `ROADMAP.md` — Added crash reporting as completed item (1.5)
- `CLAUDE.md` — Added Sentry to tech stack, `SENTRY_AUTH_TOKEN` to env vars, `errorReporting.ts` to project structure

## Decisions

- **Disabled in dev** (`enabled: !__DEV__`): No noise during local development
- **No performance tracing** (`tracesSampleRate: 0`): MVP — crash reporting only, can enable later
- **Screenshot on crash** (`attachScreenshot: true`): Helps debug UI-related crashes
- **Warning vs error level**: Network/timeout errors are tagged as `warning` (expected in-store conditions); other errors as `error`
- **Thin wrapper pattern**: Screens call `reportError()` instead of Sentry directly — centralizes error classification logic

## Notes

- Manual step remaining: User needs to create `SENTRY_AUTH_TOKEN` as an EAS secret for source map uploads
- Sentry org: `aaron-roy`, project: `glutenornot-mobile`
- `storage.ts` errors are caught automatically by `Sentry.wrap()` (unhandled promise rejections)
