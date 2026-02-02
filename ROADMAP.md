# GlutenOrNot Improvement Roadmap

## Overview
A prioritized todo list for improving the GlutenOrNot monorepo (web PWA + React Native mobile app). Designed for collaboration.

---

## Phase 1: Polish & Trust (High Priority)

### 1.1 Persistent Lifetime Counter ✅
**Status**: Complete (2026-01-31)

- [x] Add `LIFETIME_SCAN_COUNT_KEY` to localStorage
- [x] Update `incrementScanCount()` to track lifetime count
- [x] Update footer display: "X scans" (lifetime total)
- [x] Mobile app: Added same feature using AsyncStorage
- [ ] Consider showing milestone messages (e.g., "100 scans!") — deferred

**Files changed**: `web/js/app.js`, `web/js/ui.js`, `mobile/services/storage.ts`, `mobile/app/index.tsx`, `mobile/app/result.tsx`

**Notes**:
- Web and mobile track counts independently (no sync between platforms)
- New storage key means existing users start fresh at 0
- Session log: `.claude/sessions/2026-01-31-add-lifetime-counter.md`

### 1.2 Friendlier Output Messages ✅
**Status**: Complete (2026-01-31)

- [x] Unified icons across web and mobile (✓, ⚠, ✗)
- [x] Rewrite Claude prompt to generate friendlier explanations
- [x] Added tone guidance with examples for each verdict type
- [x] Strengthened oats rule (always caution, even if labeled GF)
- [ ] Consider adding quick tips based on verdict — deferred

**Files changed**: `api/analyze.js`, `mobile/constants/verdicts.ts`, `web/js/ui.js`, `web/js/config.js` (new)

**Notes**:
- Headlines ("All clear!", etc.) were tested but removed as redundant with verdict badges
- Oats now always flagged as caution - manufacturer "gluten-free" labels don't override this
- Session log: `.claude/sessions/2026-01-31-add-friendlier-output-messages.md`

### 1.3 Real About Content ✅
**Current**: Basic modal with generic descriptions
**Goal**: Authentic, personal content with your celiac story
**Status**: Complete (2026-02-01)

- [x] Write real "why we built this" story (you have one!)
- [x] Add creator credits/names
- [x] Add accuracy disclaimer with specifics
- [ ] Consider adding a "Report an issue" link
- [ ] add way to contact us (feedback, bugs, w.e)

**Files**: `index.html` (lines 177-203)

### 1.4 iOS App Store Release ✅
**Status**: Submitted for Review (2026-02-02)
**Goal**: Publish the React Native app to the iOS App Store

#### Pre-Submission
- [x] Complete EAS build with production profile
- [x] Configure app credentials (certificates, provisioning profiles)
- [x] Test thoroughly via TestFlight with beta testers
- [x] Fix any crash reports or critical bugs from TestFlight

#### App Store Connect Setup
- [x] Screenshots (4 screenshots at 6.5" size)
- [x] App metadata (description, keywords, promotional text)
- [x] App Information (categories, content rights)
- [x] App Privacy ("Data Not Collected")
- [x] Age Rating (4+)
- [x] Pricing (Free, 175 countries)
- [x] Build uploaded via Xcode
- [x] Submitted for review

**Submission Details**:
- Submitted: Feb 2, 2026 at 1:00 PM
- Bundle ID: `com.glutenornot.scanner`
- Version: 1.0.0 (Build 2)
- Release: Automatic upon approval

**Files**: `mobile/app.json`, `mobile/eas.json`, `mobile/APP_STORE_SUBMISSION.md`

---

## Phase 2: Visual Design (Medium Priority)

### 2.1 Logo & Branding ✅
**Status**: Complete (2026-02-01)

- [x] Design a simple, recognizable logo/icon (leaf icon)
- [x] Update `assets/icons/` with real app icons (SVG + PNGs)
- [x] Update favicon
- [x] Rebrand to teal color scheme (#0D9488)
- [x] Lowercase logo with mint accent ("glutenornot" with "or" in #5EEAD4)
- [x] Add tagline: "Scan any label. Know in seconds."
- [ ] Consider a subtle animation on load — deferred

**Files changed**: `web/assets/icons/icon.svg`, `web/css/styles.css`, `web/index.html`, `web/manifest.json`, `web/privacy-policy.html`, `mobile/assets/*.png`, `mobile/app.json`, `mobile/constants/verdicts.ts`, `mobile/app/*.tsx`, `mobile/components/LoadingSpinner.tsx`

**Notes**:
- New color palette: Primary teal (#0D9488), accent mint (#5EEAD4), text navy (#0F172A)
- Verdict colors kept semantically distinct: Safe green (#16A34A), Caution amber (#F59E0B), Unsafe red (#DC2626)
- Mobile uses centralized `BRAND_COLORS` constant for easy future updates
- Session log: `.claude/sessions/2026-02-01-rebrand-teal-theme.md`

### 2.2 Visual Polish
**Current**: Clean styling with new teal brand
**Goal**: More polished, trustworthy appearance

- [x] Refine color palette (teal/mint brand, distinct verdict colors)
- [ ] Add subtle shadows/depth to cards
- [ ] Improve typography hierarchy
- [ ] Add micro-interactions (button feedback, transitions)
- [ ] Consider a light/dark mode toggle

**Files**: `css/styles.css`

---

## Phase 3: Future Enhancements (Lower Priority)

### 3.1 Scan History
- [ ] Store recent scans in localStorage
- [ ] Show history in a simple list
- [ ] Allow "scan again" from history

### 3.2 Product Database (Pairs with Barcode Scanning)
- [ ] Build database of verified safe/unsafe products
- [ ] Store barcode -> verdict mappings for instant lookup
- [ ] Allow community contributions
- [ ] Skip OCR for known products (faster UX)

### 3.3 Sharing & Social
- [ ] Add "Share result" button
- [ ] Generate shareable image of verdict
- [ ] Consider social proof ("Join X celiacs using this")

### 3.4 Cost remediation 
- batch had some ideas here about how to bring down costs if need be. 

---

## Recommended Priority Order

### Immediate (This Week)
1. ~~**1.1 Persistent Counter**~~ ✅ Done
2. ~~**1.3 Real About Content**~~ ✅ Done
3. ~~**1.4 iOS App Store Release**~~ ✅ Submitted (Feb 2, 2026) - Awaiting Apple review

### Soon (Before Wider Testing)
4. ~~**1.2 Friendlier Output**~~ ✅ Done
5. ~~**2.1 Logo & Branding**~~ ✅ Done - Teal rebrand with leaf icon
6. **1.5 Trust Signals** - Strengthen free/open message

### Future
9. **4.1 Scan History** - Store and display recent scans
10. **4.2 Product Database** - Barcode scanning + instant lookups
11. **4.3 Sharing & Social** - Share verdicts with others

---

## Verification Plan

After each change:
1. Run `npm test` - all tests must pass
2. Test locally with `npx vercel dev`
3. Test on real phone (iOS Safari, Android Chrome)
4. Have a celiac tester verify changes

---

## Session Workflow

To work on a specific item, start a new session with:
```
Let's work on [item name] from ROADMAP.md
```

Each completed item should:
1. Have tests pass (`npm test`)
2. Be documented in `.claude/sessions/`
3. Have its checkbox marked complete in this file
