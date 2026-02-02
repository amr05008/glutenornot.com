---
date: 2026-02-02
summary: Added VoiceOver accessibility labels for App Store compliance
tags: [accessibility, app-store, mobile]
---

## Summary

Pre-App Store submission polish. Identified that missing accessibility labels could cause App Store rejection for health-related apps. Added `accessibilityRole`, `accessibilityLabel`, and `accessibilityHint` to all interactive elements.

## Changes

- `mobile/app/index.tsx` - Added labels to permission button and capture button
- `mobile/app/result.tsx` - Added labels to "Scan Another" button and feedback link
- `mobile/components/ResultCard.tsx` - Added labels to verdict badge, section headers, confidence text
- `mobile/APP_STORE_SUBMISSION.md` - Corrected bundle ID reference

## Decisions

Focused only on accessibility (critical) vs. other polish items (error UX, haptics, dark mode) given tight submission timeline. Other polish can ship post-launch.

## Notes

To test VoiceOver: triple-click side button on iPhone (if shortcut enabled), or Settings → Accessibility → VoiceOver.
