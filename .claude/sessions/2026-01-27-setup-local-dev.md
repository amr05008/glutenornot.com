---
date: 2026-01-27
summary: Configured local development environment and tested end-to-end flow
tags: [setup, vercel, api]
---

## Summary

Set up local development with Vercel CLI and verified the full OCR → Claude analysis pipeline works.

## Changes

- `.env` - Created with API keys (from `.env.example`)
- `package.json` - Added vercel as dev dependency, renamed `dev` script to `dev:static`
- `vercel.json` - Simplified config (removed deprecated `builds`/`routes`, use `rewrites`/`headers`)
- `CLAUDE.md` - Updated dev instructions to use `npx vercel dev`

## Decisions

- **Vercel CLI for local dev**: Required for serverless functions. Static server (`serve`) doesn't run API routes.
- **Script naming**: Can't name npm script `dev` when it calls `vercel dev` (recursion detection). Renamed to `dev:static` for static-only serving.

## Notes

- First run of `vercel dev` requires `vercel login` (one-time)
- Vercel auto-created `.env.local` from project environment variables
- Oats correctly flagged as "caution" per project guidelines
