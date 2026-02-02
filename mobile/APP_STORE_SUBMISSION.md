# App Store Submission Guide

Reference document for completing the GlutenOrNot App Store listing.

---

## Current Status

### Ready
- [x] App icon (1024x1024)
- [x] Splash screen
- [x] Bundle ID configured (`com.glutenornot.scanner`)
- [x] Privacy policy at `glutenornot.com/privacy-policy`
- [x] EAS Build configured
- [x] Camera permissions with clear descriptions

### Needed
- [ ] Screenshots (required)
- [ ] App Store metadata (descriptions, keywords, etc.)
- [ ] App Store Connect configuration

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
GlutenOrNot instantly checks if packaged foods are safe for people with celiac disease. Point your camera at an ingredient label and get a clear verdict in seconds—no account required, completely free.

We built this because we have celiac disease ourselves. Figuring out what we could and couldn't eat was confusing at first, and we didn't want to pay for an app just to scan ingredients. We hope this makes it a little easier for you too.

HOW IT WORKS

1. Point your camera at an ingredient label
2. Tap to scan
3. Get a clear verdict: Safe, Caution, or Unsafe

FEATURES

- Instant results in seconds
- AI-powered ingredient analysis
- No account required
- No ads, no subscriptions, no hidden costs
- Photos never leave your device

VERDICTS EXPLAINED
✓ SAFE – No gluten-containing ingredients detected
⚠ CAUTION – Contains oats or uncertain ingredients that may have cross-contamination risk
✗ UNSAFE – Contains wheat, barley, rye, or other gluten sources

PERFECT FOR

- People with celiac disease
- Gluten sensitivity or intolerance
- Anyone following a gluten-free diet
- Caregivers and family members shopping for loved ones

IMPORTANT
GlutenOrNot is a helpful tool but does not replace medical advice. Always check with manufacturers about cross-contamination and consult your healthcare provider about dietary restrictions. When in doubt, don't eat it.

PRIVACY
We don't collect personal data, require accounts, or store your photos. See our full privacy policy at glutenornot.com/privacy-policy

FEEDBACK
Run into an issue or have feedback for us? Let us know with this form: https://forms.gle/SdJmYM8yahsz973E8
```

### What's New (Release Notes)
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

Based on the privacy policy, select:
- **Data Not Collected** for most categories
- Under "Data Linked to You": None
- Under "Data Used to Track You": None

When completing Apple's privacy questionnaire:
- No analytics tracking
- No user accounts
- No advertising
- Photos processed but not stored

---

## 4. Optional Enhancements

### App Preview Video
- 15-30 second video showing the scan flow
- Can significantly improve conversion
- Same device sizes as screenshots

---

## 5. Pre-Submission Checklist

- [ ] Create 3-5 screenshots (6.7" size minimum)
- [ ] Write/finalize app description
- [ ] Choose subtitle and keywords
- [ ] Verify privacy policy URL works (`glutenornot.com/privacy-policy`)
- [ ] Set up support email
- [ ] Build via EAS: `npx eas build --platform ios --profile production`
- [ ] Complete App Store Connect privacy questionnaire
- [ ] Test production build on TestFlight
- [ ] Submit for review

---

## 6. Build Commands

### Preview Build (TestFlight)
```bash
cd mobile
npx eas build --platform ios --profile preview
npx eas submit --platform ios
```

### Production Build (App Store)
```bash
cd mobile
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

---

## Verification

1. Test the production build on TestFlight before submitting to App Store
2. Verify privacy policy loads at https://glutenornot.com/privacy-policy
3. Ensure all screenshots accurately represent the app
