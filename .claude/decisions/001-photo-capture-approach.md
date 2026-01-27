# Decision: Photo Capture via File Input

## Date
2026-01-26

## Status
Accepted

## Context
The app needs to capture photos of ingredient labels on mobile devices. Two main approaches:
1. File input with `capture="environment"` attribute
2. getUserMedia API for live camera access

## Decision
Use `<input type="file" accept="image/*" capture="environment">` for photo capture.

## Rationale
- **Simpler implementation**: No need for camera permissions handling, video streams, or capture buttons
- **Native UX**: Triggers the device's native camera app, which users are already familiar with
- **Better compatibility**: Works across all browsers without polyfills
- **Desktop fallback**: Automatically becomes a file picker on desktop browsers
- **Focus on task**: Users take a single photo rather than hovering a live camera (which the plan explicitly ruled out)

## Consequences
- Users must tap "Scan Label" then take the photo (not a live camera hover)
- Slightly more steps than a live camera approach
- Cannot provide live camera feedback or guides

## Alternatives Considered
- **getUserMedia with live camera**: More complex, requires permission handling, would need a capture button overlay
- **Hybrid approach**: Could offer both, but adds complexity for MVP
