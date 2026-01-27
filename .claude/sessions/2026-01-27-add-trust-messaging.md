---
date: 2026-01-27
summary: Added "Free Forever" trust messaging to main screen
tags: [ui, messaging, trust]
---

## Summary
Added a second trust message below the existing privacy note to communicate that the tool is free with no sign-up required. Refactored the single privacy note into a trust-notes section with consistent styling.

## Changes
- `index.html` — Replaced single `<p class="privacy-note">` with `<div class="trust-notes">` containing two trust messages with SVG icons
- `css/styles.css` — Updated styles from `.privacy-note`/`.privacy-icon` to `.trust-notes`/`.trust-note`/`.trust-icon` with flexbox column layout

## Notes
- Privacy message retained with lock icon
- New "Free forever. No sign-up required." message with checkmark icon
- Both messages styled consistently at 0.8125rem with secondary text color
