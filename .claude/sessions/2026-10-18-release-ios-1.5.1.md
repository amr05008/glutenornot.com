---
date: 2026-10-18
summary: Shipped iOS 1.5.1 (retake screen + write-review link) to App Store review as build 2, after a TestFlight smoke build tagged 1.5.1-rc.smoke proved the app half on Aaron's phone. First archive on Xcode 27, which needed two new post-prebuild patches. Tagged v1.5.1 at 35d9be2.
tags: [release, ios, mobile, retake, decision-009, xcode-27, testflight]
---

## Summary

**Preflight (2026-10-16).** `main` at `35d9be2` (PR #44). `npm ci` left the tree clean, `tsc` was clean, and jest passed 219/219, matching the runbook. The four version files were already in lockstep at 1.5.1 (PR #27 bumped them), so step 3 was a check, not a bump.

**Build 1, the TestFlight smoke build.** `app.json` was set to `1.5.1-rc.smoke` (uncommitted), followed by a clean prebuild. Two problems the runbook didn't know about turned up, both from Xcode 27 (installed 2026-09-15, after 1.5.0):
- **Prebuild writes the version into `Info.plist` as a literal**, so the rc string would have reached App Store Connect, which rejects it. Fix: `PlistBuddy` sets the plist to `1.5.1`. The JS reads its version from the bundled `app.config`, which is generated from `app.json` at build time, so the rc string survives there.
- **Pod deployment targets below 15.0 are now a hard error.** Five resource-bundle targets (Sentry, SDWebImage, RNSVG, RNCAsyncStorage, ReachabilitySwift) failed the build. Fix: a `post_install` loop in `ios/Podfile` raises pod targets to the app's 15.1.
- **Xcode 27 has no Simulator.app**, so `expo run:ios` fails. The smoke build went through `xcodebuild -sdk iphonesimulator` + `simctl install/launch` + a headless screenshot. It launched, Hanken Grotesk rendered, and the camera gate showed "Continue". The built app had `Info.plist` 1.5.1 and `app.config` `1.5.1-rc.smoke`.

Aaron archived build 1 and uploaded it to TestFlight that evening. `app.json` was restored to `1.5.1` after the upload.

**TestFlight (2026-10-18, 06:17–06:37 ET).**
- **A blurry camera at close range turned out not to be a bug.** Our camera code and expo-camera 17.0.10 were unchanged since 1.5.0. expo-camera uses the physical wide-angle lens (`DeviceDiscovery.defaultBackCamera`), which can't focus much closer than ~20 cm and can't switch to macro. At 25–30 cm it read fine.
- **The first heading-cut photos stayed on the amber card.** The gate fired (`list_gate: no_heading`), but Claude had filed the package's "Free from 8 major allergens (includes wheat)" under `allergen_warnings`, and T8 keeps any card with a warning row amber. This is working as specified but leaks real retakes; recorded in the plan and ROADMAP.
- **With a product and framing that avoided that line, every check passed:**
  - five retake responses;
  - "See what I could read" committed once, inside a barcode-recovery flow (`result_displayed` came 10.5 s after the scan, against ~0.3 s for a plain card);
  - Retake → full photo came back Safe carrying `retake_after: no_heading`, and the flag was used once;
  - a barcode lookup cleared the flag;
  - Aaron confirmed the torch came back on after Retake;
  - the review link opened the App Store compose sheet (three `store_opened` events).
- **One open question, closed by reading the code.** One photo had no `retake_after` and Aaron wasn't sure what he'd tapped. The code shows only "See what I could read", Recents, or a barcode lookup can clear the flag (`handleRetake` never touches it), so this was a check-3 detour, not a bug.

**Build 2, the submitted build.** Clean prebuild at 1.5.1, then the patches again: MARKETING_VERSION, team, build number 2 in both the pbxproj and the literal `Info.plist` `CFBundleVersion`, the Sentry token append, and the Podfile fix with `pod install`. Before Distribute, I checked the archive itself: `Info.plist` 1.5.1 (2), `app.config` `1.5.1` with no rc, and the retake and review strings present in the Hermes bundle. Aaron uploaded it and **submitted to App Store review 2026-10-18 ~07:01 ET (11:01 UTC)**.

## Left

- **When 1.5.1 goes public:** record `currentVersionReleaseDate` from `https://itunes.apple.com/lookup?bundleId=com.glutenornot.scanner` in the plan's Execution notes, and add the day-14 date to `ROADMAP.md`. The day-14 read (plan Task 13) counts from it.
- **Post-release:** a production scan reports `app_version 1.5.1`; `review_prompt requested` from a fresh App Store install; Sentry for `index.tsx`'s retake state.
- **The "free from" → `allergen_warnings` leak** (ROADMAP): size it with the day-14 read's query 3. The fix is server-only but touches the prompt, so it needs the eval gate.
- **Making the Podfile patch permanent:** a config plugin would replace the manual step 4b.
- **Idea, not scoped:** the virtual multi-lens camera would give automatic macro switching at in-store distances.

## Files

- `mobile/RELEASE.md` — Last shipped → v1.5.1; Pending → nothing. Lessons: the two-archive rc flow and the `Info.plist` patch (step 2), the Xcode 27 sim build (step 2), the retake device check, the lockstep-check note (step 3), the Podfile patch (4b), build 2+ and the archive check (4c), close-up blur and the rejection playbook (Notes), and two Xcode 27 troubleshooting entries.
- `plans/retake-state-2026-10-11.md` — status header, Task 12 checked, the evidence and findings under Execution notes.
- `CLAUDE.md`, `ROADMAP.md`, `README.md` — 1.5.1 marked shipped (retake + write-review); the "free from" item; a README feature line.
- Tag `v1.5.1` at `35d9be2` (the submitted source).
