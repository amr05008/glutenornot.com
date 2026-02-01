---
date: 2026-01-31
summary: Improved Claude prompt tone and unified verdict icons across platforms
tags: [prompt-engineering, mobile, web]
---

## Summary

Improved the Claude prompt to generate warmer, more supportive explanations for celiac disease users. Unified verdict icons across web and mobile platforms. Also strengthened the oats rule to always flag oats as caution even if labeled "gluten-free".

## Changes

- `api/analyze.js` - Added tone guidance section to CLAUDE_PROMPT, strengthened oats rule
- `mobile/constants/verdicts.ts` - Unified icons (✓, ⚠, ✗)
- `web/js/config.js` - **NEW** - Centralized config for verdict icons/labels
- `web/js/ui.js` - Import icons/labels from config

## Decisions

- **Unified icons** - Both platforms now use ✓, ⚠, ✗ (mobile previously used `!` for caution, `✕` for unsafe)
- **Headlines removed** - Initially added headlines ("All clear!", "Double-check this one", etc.) but removed as redundant with the verdict badges
- **Stricter oats rule** - Oats now always flagged as caution, even if product is labeled "gluten-free" (requires third-party certification like GFCO)

## Notes

The Claude prompt now includes:
1. Tone guidance with example phrases for each verdict type
2. Instructions to avoid clinical language ("contraindicated", etc.)
3. Stricter oats handling that doesn't trust manufacturer GF labels
