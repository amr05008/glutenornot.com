---
date: 2026-02-16
summary: Fix menu items not displaying due to capitalized mode value from Claude
tags: [fix, menu, normalization, mobile]
---

## Summary

When scanning a restaurant menu, the app showed `ResultCard` (ingredient label view) instead of `MenuResultCard`. Root cause: Claude sometimes returns `"mode": "Menu"` (capitalized), but the client compared with `=== 'menu'` (lowercase). Two prior commits addressed related issues but missed normalizing the mode value itself.

## Changes

- `api/analyze.js` — Added `normalizeMode()` helper (mirrors `normalizeVerdict()` pattern), applied before mode inference in `parseClaudeResponse()`, exported for testing
- `mobile/app/result.tsx` — Added client-side fallback: checks `mode?.toLowerCase()` and also detects menu by presence of `menu_items` array
- `web/tests/fixtures/claude-responses.json` — Added `menu_with_capitalized_mode` fixture
- `web/tests/api/analyze.test.js` — Added test for capitalized mode normalization and `normalizeMode()` unit tests

## Decisions

- Defensive client-side detection (checking `menu_items` array) ensures correct display even with cached/old API responses
- `normalizeMode()` returns `null` for unknown values, letting inference logic handle fallback (consistent with existing patterns)

## Notes

- Test count increased from 31 to 39
- Prior related commits: `807f95f` (verdict normalization), `970834d` (mode inference when omitted)
