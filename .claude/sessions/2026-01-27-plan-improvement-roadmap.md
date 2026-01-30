---
date: 2026-01-27
summary: Created comprehensive improvement roadmap for PWA polish and mobile app prep
tags: [planning, roadmap, pwa, mobile]
---

## Summary
Created a detailed improvement roadmap (`ROADMAP.md`) outlining Phase 1-5 improvements for the GlutenOrNot PWA. The plan prioritizes trust-building features first, followed by visual polish, user testing, and eventual mobile app preparation using Capacitor.

## Changes
- Created `ROADMAP.md` with prioritized improvement plan
- Updated `CLAUDE.md` to reference the roadmap in Quick Reference
- Updated `README.md` Contributing section to link to the roadmap

## Decisions
- **Incremental sessions**: Plan is designed to be tackled in separate sessions rather than all at once
- **Capacitor over React Native**: For mobile app, recommended wrapping existing PWA with Capacitor rather than rewriting in React Native
- **Trust-first approach**: Phase 1 focuses on trust signals (lifetime counter, authentic About content, friendlier messaging)

## Notes
To start working on any roadmap item, reference it by name:
```
Let's work on [item name] from ROADMAP.md
```

Key Phase 1 items (recommended first):
1. **1.1 Persistent Counter** - Quick win, builds trust
2. **1.3 Real About Content** - Authentic story removes "AI slop" feeling
3. **1.2 Friendlier Output** - Warmer user experience
