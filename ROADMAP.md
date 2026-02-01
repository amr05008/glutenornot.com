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

### 1.3 Real About Content
**Current**: Basic modal with generic descriptions
**Goal**: Authentic, personal content with your celiac story

- [ ] Write real "why we built this" story (you have one!)
- [ ] Add creator credits/names
- [ ] Explain the technology honestly (OCR + AI)
- [ ] Add accuracy disclaimer with specifics
- [ ] Consider adding a "Report an issue" link
- [ ] Draft the story together during implementation
- [ ] add way to contact us (feedback, bugs, w.e)

**Files**: `index.html` (lines 177-203)

### 1.4 iOS App Store Release
**Status**: In Progress
**Goal**: Publish the React Native app to the iOS App Store

#### Pre-Submission
- [ ] Complete EAS build with production profile
- [ ] Configure app credentials (certificates, provisioning profiles)
- [ ] Test thoroughly via TestFlight with beta testers
- [ ] Fix any crash reports or critical bugs from TestFlight

#### App Store Connect Setup
- [ ] Write compelling app description (highlight celiac-friendly, free, private)
- [ ] Create App Store screenshots (6.7" and 5.5" sizes minimum)
- [ ] Design app preview video (optional but recommended)
- [ ] Write privacy policy and host it (required)
- [ ] Set up app metadata (category: Health & Fitness or Food & Drink)
- [ ] Add keywords for ASO (gluten-free, celiac, food scanner, etc.)

#### Submission
- [ ] Submit for App Review
- [ ] Respond to any review feedback
- [ ] Plan soft launch and marketing

**Files**: `mobile/app.json`, `mobile/eas.json`

### 1.5 Enhanced Trust Signals
**Current**: "Free forever" and "Privacy first" notes
**Goal**: Stronger trust indicators

- [ ] Add "Open source" badge with GitHub link
- [ ] Consider adding "Made by celiacs, for celiacs" if applicable
- [ ] Add testimonial/review prompt after X scans
- [ ] Consider a "How we're different" section vs paid apps

**Files**: `index.html`, `css/styles.css`

---

## Phase 2: Visual Design (Medium Priority)

### 2.1 Logo & Branding
**Current**: Text-only "GlutenOrNot" header with accent color
**Goal**: Memorable visual identity

- [ ] Design a simple, recognizable logo/icon
- [ ] Update `assets/icons/` with real app icons
- [ ] Update favicon
- [ ] Consider a subtle animation on load

**Files**: `assets/icons/`, `index.html`, `manifest.json`

### 2.2 Visual Polish
**Current**: Clean but basic styling
**Goal**: More polished, trustworthy appearance

- [ ] Refine color palette (current green/amber/red is good)
- [ ] Add subtle shadows/depth to cards
- [ ] Improve typography hierarchy
- [ ] Add micro-interactions (button feedback, transitions)
- [ ] Consider a light/dark mode toggle

**Files**: `css/styles.css`

---

## Phase 3: User Testing (Critical for Trust)

### 3.1 Celiac Beta Testing
- [ ] Create a feedback form (Google Forms or Typeform)
- [ ] Share with others for testing 
- [ ] Document common edge cases and failures
- [ ] Iterate on prompt based on real-world accuracy issues

### 3.2 Accuracy Tracking
- [ ] Add optional "Was this accurate?" feedback after results (eh dont love this, we just have to make sure its pretty bang on)
- [ ] Log feedback for prompt improvement
- [ ] Track false positives/negatives patterns

---

## Phase 4: Future Enhancements (Lower Priority)

### 4.1 Scan History
- [ ] Store recent scans in localStorage
- [ ] Show history in a simple list
- [ ] Allow "scan again" from history

### 4.2 Product Database (Pairs with Barcode Scanning)
- [ ] Build database of verified safe/unsafe products
- [ ] Store barcode -> verdict mappings for instant lookup
- [ ] Allow community contributions
- [ ] Skip OCR for known products (faster UX)

### 4.3 Sharing & Social
- [ ] Add "Share result" button
- [ ] Generate shareable image of verdict
- [ ] Consider social proof ("Join X celiacs using this")

### 4.4 Cost remediation 
- batch had some ideas here about how to bring down costs if need be. 

---

## Recommended Priority Order

### Immediate (This Week)
1. ~~**1.1 Persistent Counter**~~ ✅ Done
2. **1.3 Real About Content** - Your story removes "AI slop" feeling
3. **1.4 iOS App Store Release** - Get the native app live

### Soon (Before Wider Testing)
4. ~~**1.2 Friendlier Output**~~ ✅ Done
5. **2.1 Logo & Branding** - Visual trust + needed for App Store
6. **1.5 Trust Signals** - Strengthen free/open message

### Testing Phase
7. **3.1 Celiac Beta Testing** - Dad + Richard + others
8. **3.2 Accuracy Tracking** - Learn from real usage

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
