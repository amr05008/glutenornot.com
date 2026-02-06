---
date: 2026-02-01
summary: Resolved Xcode signing and build issues to upload app to TestFlight
tags: [ios, xcode, testflight, signing, deployment]
---

## Summary

Set up the Expo app for TestFlight distribution via Xcode. Resolved multiple issues: unavailable bundle ID, iOS deployment target mismatch, and provisioning profile errors.

## Changes

- `mobile/app.json` - Changed bundle ID and added deployment target
- `mobile/package.json` - Scripts updated by expo prebuild

## Issues Resolved

### 1. Bundle ID Unavailable
**Error:** "Bundle ID 'com.glutenornot.app' could not be automatically registered because it is not available."

**Solution:** Changed bundle ID to `com.glutenornot.scanner`

### 2. iOS Deployment Target Too Low
**Error:** "The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 9.0, but the range of supported deployment target versions is 12.0 to 26.2.99."

**Solution:** Added `"deploymentTarget": "15.1"` to the ios section of app.json

### 3. No Provisioning Profiles / No Devices
**Error:** "Your team has no devices from which to generate a provisioning profile."

**Solution:** Registered a physical device UDID in Apple Developer Portal:
1. Connect iPhone to Mac
2. Open Finder, click iPhone, click info text until UDID appears
3. Copy UDID and register at https://developer.apple.com/account/resources/devices/list
4. Return to Xcode and retry signing

## Process

1. **Generate native iOS project:** `npx expo prebuild --platform ios`
2. **Open in Xcode:** `open ios/GlutenOrNot.xcworkspace`
3. **Configure signing:** Select team in Signing & Capabilities
4. **Build archive:** Product → Archive
5. **Upload:** Distribute App → App Store Connect → Upload

## Notes

- The `ios/` folder is generated and can be gitignored (regenerate with prebuild)
- Must use `.xcworkspace` not `.xcodeproj` (CocoaPods requirement)
- EAS Build is an alternative that handles signing in the cloud automatically
- After upload, allow 10-30 min for Apple to process before build appears in TestFlight
