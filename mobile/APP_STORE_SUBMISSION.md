# App Store Submission Guide

Reference document for completing the GlutenOrNot App Store listing.

---

## Current Status

**SUBMITTED FOR REVIEW** — 2026-09-05, iOS 1.5.0 (build 2; build 1 was the TestFlight smoke build).

Listing description rewritten at this submission (below) — the old copy claimed "photos never leave your device". App Privacy answers reviewed (see §3). History: 1.0.0 (build 2) first submitted Feb 2, 2026.

### Completed
- [x] App icon (1024x1024)
- [x] Splash screen
- [x] Bundle ID configured (`com.glutenornot.scanner`)
- [x] Privacy policy at `glutenornot.com/privacy-policy`
- [x] EAS Build configured
- [x] Camera permissions with clear descriptions
- [x] Screenshots (4 at 6.5" size)
- [x] App Store metadata (descriptions, keywords, etc.)
- [x] App Store Connect configuration
- [x] App Privacy published ("Data Not Collected")
- [x] Age Rating (4+)
- [x] Pricing (Free, 175 countries)
- [x] Build uploaded via Xcode
- [x] Submitted for review

---

## 1. Screenshots

Apple requires screenshots for each device size you support. Since `supportsTablet: false`, you only need iPhone sizes.

### Required Sizes (pick one from each group)

| Device Class | Size (pixels) | Example Devices |
|--------------|---------------|-----------------|
| 6.9" | 1320 x 2868 | iPhone 16 Pro Max |
| 6.7" | 1290 x 2796 | iPhone 15 Pro Max, 14 Pro Max |
| 6.5" | 1284 x 2778 | iPhone 14 Plus, 13 Pro Max |
| 5.5" | 1242 x 2208 | iPhone 8 Plus (older, optional) |

**Minimum: 2 screenshots, Maximum: 10**

### Recommended Screenshots (3-5)

1. **Camera/Capture Screen** - Show the main scanning interface
2. **Safe Verdict** - Green result showing a gluten-free product
3. **Caution Verdict** - Yellow result showing uncertain/oat product
4. **Unsafe Verdict** - Red result showing gluten-containing product
5. **Optional: Before/After** - Show the label → verdict flow

### How to Capture

```bash
# Run on simulator at specific size
cd mobile
npx expo start --ios

# In simulator: Cmd+S to save screenshot
# Screenshots save to Desktop by default
```

Or use a real device and take screenshots, then use Figma/Canva to add device frames and marketing text.

### Screenshot Tips
- Use real product labels (or mock realistic ones)
- Add marketing text overlays ("Scan any label", "Know in seconds")
- Consider using a tool like [Shotbot](https://shotbot.io) or Figma templates
- Consistent style across all screenshots

---

## 2. App Store Metadata

### App Name
```
GlutenOrNot
```

### Subtitle (30 characters max)
```
Scan Labels for Gluten
```
(22 characters)

### Keywords (100 characters total, comma-separated)
```
gluten,celiac,gluten-free,ingredient,label,scanner,food,allergy,wheat,barley,oats,diet,health
```
(94 characters)

### Promotional Text (170 characters max)
```
Instantly check if food is gluten-free. Just snap a photo of the ingredient label and get a clear verdict in seconds. Free, no account required.
```

### Full Description
```
GlutenOrNot instantly checks if menu items, packaged foods, and ingredient labels are safe for people with celiac disease. Point your camera at an ingredient label, barcode or restaurant menu and get a clear verdict in seconds. 

No account required, and it's completely free.

We built this because we have celiac disease ourselves. Figuring out what we could and couldn't eat was confusing at first, and we didn't want to pay for an app just to scan ingredients. We hope this makes it a little easier for you too.

HOW IT WORKS
1. Point your camera at an ingredient label
2. Tap to scan
3. Get a clear verdict: Safe, Caution, or Unsafe

FEATURES
- Instant results in seconds
- No account required
- No ads, no subscriptions, no hidden costs
- Ingredient analysis powered by Anthropic's Claude models

VERDICTS EXPLAINED
SAFE – No gluten-containing ingredients detected
CAUTION – Contains oats or uncertain ingredients that may have cross-contamination risk
UNSAFE – Contains wheat, barley, rye, or other gluten sources

PERFECT FOR
- People with celiac disease
- Gluten sensitivity or intolerance
- Anyone following a gluten-free diet
- Caregivers and family members shopping for loved ones

IMPORTANT
GlutenOrNot is a helpful tool but does not replace medical advice. Always check with manufacturers about cross-contamination and consult your healthcare provider about dietary restrictions. When in doubt, don't eat it.

PRIVACY
We don't collect personal data or require accounts. Photos are analyzed and immediately discarded, never stored. Only anonymous usage statistics are recorded. See our full privacy policy at glutenornot.com/privacy-policy

FEEDBACK
Run into an issue or have feedback for us? Let us know with this form: https://forms.gle/SdJmYM8yahsz973E8
```

### What's New (Release Notes)

1.5.0 (2026-09-05):
```
When a barcode isn't in our databases, or the database has no ingredient information, GlutenOrNot now says so plainly instead of guessing, and offers to scan the ingredient label instead. One tap opens a photo-only camera so the barcode can't take over. Same conservative gluten checks.
```

1.0.0:
```
Initial release! GlutenOrNot helps you quickly check ingredient labels for gluten.

• Scan any ingredient label with your camera
• Get instant verdicts: Safe, Caution, or Unsafe
• No account required, completely free
• Privacy-first: photos aren't stored

Made for the celiac community. Stay safe out there!
```

---

## 3. App Store Connect Configuration

| Field | Value |
|-------|-------|
| App Name | GlutenOrNot |
| Subtitle | Scan Labels for Gluten |
| Primary Language | English (U.S.) |
| Bundle ID | com.glutenornot.scanner |
| SKU | glutenornot-ios-001 |
| Privacy Policy URL | https://glutenornot.com/privacy-policy |
| Support URL | https://glutenornot.com |
| Category | Health & Fitness |
| Secondary Category | Food & Drink |
| Age Rating | 4+ |
| Copyright | © 2026 GlutenOrNot |

### App Privacy Section (Data Collection)

Must match `web/privacy-policy.html` (the "Anonymous Analytics" section) and
`api/ANALYTICS.md`. As of 2026-09-05 the app sends anonymous, server-side
analytics: one `scan` / `scan_failed` event per scan attempt (verdict, scan
type, outcome, confidence, platform, app version, model, detected language,
photo size / readable-character counts, and a city-level region derived from
the IP at the edge — the IP itself is only hashed), plus a few `barcode_recovery`
events when a barcode lookup comes up empty (step reached, reason, photo
source, result kind/verdict/confidence, and a temporary random flow ID that is
not derived from the device or the product). Nothing is linked to an identity
and nothing is used for tracking.

Suggested answers in App Store Connect (confirm against Apple's current
category definitions before saving):
- **Data Collected, not linked to you, used for Analytics:** "Product
  Interaction" (scan attempts/outcomes, recovery steps) and "Other Usage Data"
  / "Other Diagnostic Data" (photo size, character counts, timings, failure
  reasons).
- **Coarse Location:** the server derives a city-level region from the IP for
  analytics. Apple counts server-side derivation as collection — declare it
  (not linked, analytics) unless you first remove the `$geoip_*` properties.
- **Data Linked to You:** None. **Data Used to Track You:** None. No accounts,
  no advertising, no device/advertising identifiers.
- Photos are processed and discarded, never stored (the App Store listing's
  "photos never leave your device" line is inaccurate — the photo is uploaded
  for analysis — and should be reworded).
- Crash reports go to Sentry (Diagnostics → Crash Data, not linked).

Live state checked 2026-09-05: App Store Connect already declared Product
Interaction + Coarse Location (not linked, Analytics) — the "No analytics
tracking" note that used to sit here was wrong, not the questionnaire.
Recommended additions at the 1.5.0 submission: Diagnostics → Crash Data (Sentry,
not linked, App Functionality) and Performance Data (scan timings / failure
reasons, not linked, Analytics).

---

## 4. Optional Enhancements

### App Preview Video
- 15-30 second video showing the scan flow
- Can significantly improve conversion
- Same device sizes as screenshots

---

## 5. Pre-Submission Checklist

- [x] Create 3-5 screenshots (6.5" size: 1284 x 2778)
- [x] Write/finalize app description
- [x] Choose subtitle and keywords
- [x] Verify privacy policy URL works (`glutenornot.com/privacy-policy`)
- [x] Set up support URL (glutenornot.com)
- [x] Build via Xcode (Archive → Distribute → App Store Connect)
- [x] Complete App Store Connect privacy questionnaire
- [x] Test production build on TestFlight
- [x] Submit for review ✅ (Feb 2, 2026)

---

## 6. Build Commands

### Local Build (Xcode)
```bash
cd mobile
# 1. Bump version in app.json
# 2. Regenerate native project
npx expo prebuild --platform ios --clean
# 3. Open in Xcode
open ios/GlutenOrNot.xcworkspace
```

In Xcode:
1. GlutenOrNot target → Signing & Capabilities → Automatically manage signing → select Team
2. General tab → set Version and Build number (must be higher than last upload)
3. Set destination to "Any iOS Device (arm64)"
4. Product → Archive
5. Organizer → Distribute App → App Store Connect → Upload

---

## Verification

1. Test the production build on TestFlight before submitting to App Store
2. Verify privacy policy loads at https://glutenornot.com/privacy-policy
3. Ensure all screenshots accurately represent the app
