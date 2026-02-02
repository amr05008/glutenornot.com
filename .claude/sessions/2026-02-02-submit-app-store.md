---
date: 2026-02-02
summary: Submitted GlutenOrNot iOS app to App Store for review
tags: [ios, app-store, release, mobile]
---

## Summary

Completed all App Store Connect configuration and submitted GlutenOrNot v1.0.0 for Apple review. The app is set to automatically release upon approval.

## Submission Details

- **Submitted**: Feb 2, 2026 at 1:00 PM
- **Version**: 1.0.0 (Build 2)
- **Bundle ID**: com.glutenornot.scanner
- **Submission ID**: 7a434204-07cb-4121-8d53-605b57f999d5
- **Release Mode**: Automatic upon approval

## App Store Connect Configuration

### Completed Items
- Screenshots: 4 images at 6.5" size (1284 x 2778)
  - Camera/capture screen
  - Safe verdict (green)
  - Caution verdict (yellow)
  - Unsafe verdict (red)
- App metadata: Name, subtitle, description, keywords, promotional text
- App Information: Health & Fitness / Food & Drink categories
- App Privacy: "Data Not Collected" published
- Age Rating: 4+ (completed questionnaire)
- Pricing: Free, available in 175 countries
- App Review Info: Contact info, no sign-in required

### Build Process
- Used Xcode to archive and upload (EAS CLI had issues with YubiKey 2FA)
- Product → Archive → Distribute App → App Store Connect → Upload

## Notes

- Description had to be modified to remove special Unicode characters (✓, ⚠, ✗) which App Store Connect rejected
- Screenshots from iPhone 15 (1179 x 2556) had to be resized to 6.5" display size (1284 x 2778)
- YubiKey hardware 2FA works natively with Xcode upload but not with EAS CLI

## Changes

- `ROADMAP.md` - Updated 1.4 iOS App Store Release to complete status
- `mobile/APP_STORE_SUBMISSION.md` - Updated all checklists to complete, added submission status

## Next Steps

1. Wait for Apple review (typically 24-48 hours)
2. Monitor for any rejection feedback
3. Once approved, app will auto-release to App Store
