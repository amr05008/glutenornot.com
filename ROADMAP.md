# GlutenOrNot Improvement Roadmap

## Overview
A prioritized todo list for improving the PWA and setting the stage for potential mobile app development. Designed for collaboration.

---

## Phase 1: Polish & Trust (High Priority)

### 1.1 Persistent Lifetime Counter
**Current**: Counter resets daily (shows "X scans today")
**Goal**: Show total lifetime scans to build trust over time

- [ ] Add `LIFETIME_SCAN_COUNT_KEY` to localStorage
- [ ] Update `incrementScanCount()` to track lifetime count
- [ ] Update footer display: "X scans" (lifetime total)
- [ ] Consider showing milestone messages (e.g., "100 scans!")

**Files**: `js/app.js`, `js/ui.js`, `index.html`

### 1.2 Friendlier Output Messages
**Current**: Functional but clinical explanations
**Goal**: Warmer, more reassuring language

- [ ] Add emoji or icons to verdicts (already has checkmark/warning/x)
- [ ] Rewrite Claude prompt to generate friendlier explanations
- [ ] Add encouraging messages ("You're all set!" vs just "Safe")
- [ ] Consider adding quick tips based on verdict

**Files**: `api/analyze.js` (lines 23-57), `js/ui.js`

### 1.3 Real About Content
**Current**: Basic modal with generic descriptions
**Goal**: Authentic, personal content with your celiac story

- [ ] Write real "why we built this" story (you have one!)
- [ ] Add creator credits/names
- [ ] Explain the technology honestly (OCR + AI)
- [ ] Add accuracy disclaimer with specifics
- [ ] Consider adding a "Report an issue" link
- [ ] Draft the story together during implementation

**Files**: `index.html` (lines 177-203)

### 1.4 Enhanced Trust Signals
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
- [ ] Share with dad for testing
- [ ] Share with Richard for testing
- [ ] Document common edge cases and failures
- [ ] Iterate on prompt based on real-world accuracy issues

### 3.2 Accuracy Tracking
- [ ] Add optional "Was this accurate?" feedback after results
- [ ] Log feedback for prompt improvement
- [ ] Track false positives/negatives patterns

---

## Phase 4: PWA Enhancements (For Mobile App Decision)

### 4.1 PWA Improvements
Before deciding on native app, maximize PWA capabilities:

- [ ] Add "Add to Home Screen" prompt for first-time users
- [ ] Improve offline experience with cached UI
- [ ] Add haptic feedback where supported
- [ ] Test install experience on iOS and Android
- [ ] Add app shortcuts for quick scan (manifest)

**Files**: `sw.js`, `manifest.json`, `js/app.js`

### 4.2 Features That Might Require Native
**You want: Barcode scanning + App Store presence**

| Feature | PWA | Native Needed? |
|---------|-----|----------------|
| Camera access | Works | No |
| Offline use | Partial | Better with native |
| Push notifications | Works | No |
| **Barcode scanning** | Possible (libs like QuaggaJS) | Easier + faster native |
| Widget (home screen) | No | Yes |
| **App Store presence** | No | **Yes** |
| Faster cold start | No | Yes |

### 4.3 Mobile App Decision Framework
**Your goals point toward building a native app:**
- App Store presence = requires native (or PWA wrapper like Capacitor)
- Barcode scanning = better UX native, but possible in PWA

**Recommended path:**
1. **Now**: Finish polishing PWA (Phases 1-3)
2. **After testing**: Use **Capacitor** to wrap PWA for App Store
   - Reuses all existing HTML/CSS/JS
   - Adds native barcode scanning via plugins
   - Single codebase for web + iOS + Android
3. **Later**: Migrate to full native only if needed

**Capacitor advantages:**
- `@capacitor/barcode-scanner` plugin for native scanning
- Submit to App Store with minimal code changes
- PWA remains for desktop/web users
- Faster time-to-market than React Native rewrite

---

## Phase 5: Future Enhancements (Lower Priority)

### 5.1 Scan History
- [ ] Store recent scans in localStorage
- [ ] Show history in a simple list
- [ ] Allow "scan again" from history

### 5.2 Product Database (Pairs with Barcode Scanning)
- [ ] Build database of verified safe/unsafe products
- [ ] Store barcode -> verdict mappings for instant lookup
- [ ] Allow community contributions
- [ ] Skip OCR for known products (faster UX)

### 5.3 Sharing & Social
- [ ] Add "Share result" button
- [ ] Generate shareable image of verdict
- [ ] Consider social proof ("Join X celiacs using this")

---

## Recommended Priority Order

### Immediate (This Week)
1. **1.1 Persistent Counter** - Quick win, builds trust
2. **1.3 Real About Content** - Your story removes "AI slop" feeling

### Soon (Before Wider Testing)
3. **1.2 Friendlier Output** - Better user experience
4. **2.1 Logo & Branding** - Visual trust + needed for App Store
5. **1.4 Trust Signals** - Strengthen free/open message

### Testing Phase
6. **3.1 Celiac Beta Testing** - Dad + Richard + others
7. **3.2 Accuracy Tracking** - Learn from real usage

### App Store Prep
8. **4.1 PWA Improvements** - Polish before wrapping
9. **4.3 Capacitor Integration** - Wrap for iOS/Android
10. **Barcode feature** - Add via Capacitor plugin
11. **App Store submission** - iOS first, then Android

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
