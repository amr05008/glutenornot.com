---
date: 2026-10-24
summary: App Review rejected iOS 1.5.1 build 2 under 2.1(a) (crash on launch, iOS/iPadOS 27.0). Root cause was the UIScene life cycle that iOS 27 requires of apps built with its SDK. Fixed with a local Expo config plugin (PR #45, merged 143e521) after four Pi gpt-6-sol grill rounds, one of which caught a second trap on scene reconnect. Build 3 was resubmitted 2026-10-24 ~07:01 ET (11:01 UTC).
tags: [release, ios, mobile, app-review, rejection, xcode-27, ios-27, uiscene, expo-config-plugin, grill]
---

## Summary

**The rejection (2026-10-19).**
- **What Apple reported:** 1.5.1 (2) "crashed on launch" on an iPhone 17 Pro Max and an iPad Air 11-inch (M3), both on iOS/iPadOS 27.0 (24A435).
- **The crash logs:** both are identical main-thread `EXC_BREAKPOINT` traps in `UIKitCore ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`, under `-[UIApplication workspace:didCreateScene:…]`, about 150 ms after launch.
- **Why:** iOS 27 refuses to launch an app built with the iOS 27 SDK unless it adopts the UIScene life cycle. Expo SDK 54's template still creates its window in `didFinishLaunching` and writes no scene manifest.

**Why nothing caught it.**
- **Archive history:** every archive from 1.2.0 to 1.5.0 was built on Xcode 26.x (`iphoneos26.5`). Both 1.5.1 builds were the first on Xcode 27 (`iphoneos27.0`/`27.1`), so the toolchain change switched the enforcement on, and the live 1.5.0 still runs on iOS 27.
- **The test devices:** the 10-18 simulator smoke and Aaron's TestFlight phone were both on iOS 26, where the trap doesn't fire.
- **The local reproduction:** the old Release sim build on an iOS 27.0 simulator logged "Application failed to launch: UIScene life cycle is required for apps built with this SDK". That crash popped a macOS dialog on Aaron's screen; he pasted it and was told it was the deliberate reproduction.

**The fix: `mobile/plugins/withSceneLifecycle.js`, a local config plugin.**
- **What it generates:** the scene manifest, the window and `startReactNative` moved out of `didFinishLaunching`, and a `SceneDelegate` modeled on Expo SDK 57's `ExpoAppSceneDelegate`.
- **What the delegate does:** it owns the window and mirrors it onto `AppDelegate.window`, which expo-updates' `getWindow()` falls back to before it `fatalError`s. It rebuilds `launchOptions[.url]` for `Linking.getInitialURL()`. It forwards URLs, user activities and the scene life cycle to the AppDelegate, where Expo's subscribers (expo-linking, expo-router's Handoff, FileSystem) and `RCTLinkingManager` listen.
- **Fails loudly:** it throws during prebuild on an unrecognized or half-patched template.
- **Upstream:** Expo's official fix is `ios.enableSceneSupport` in SDK 57.0.23+, and SDK 58's template adopts scenes. There's no SDK 54 backport, so the plugin should be deleted at that upgrade.
- **Rejected alternative:** rebuilding on Xcode 26. One unofficial source says iOS 26 SDK builds are accepted until April 2027, but every future build would need the old Xcode.

**Verified on simulators (Release, iOS 27.1 SDK).**
- **Launches:**
  - an iOS 27.0 iPhone 18 Pro Max;
  - an iPad Air 11" (M3) on iOS 27.0, a simulator created for this as App Review's model, which runs the app in a windowed iPhone-compatibility mode;
  - an iPhone 17 Pro on iOS 26.5.
- **Background → foreground on the same PID:** all three survived it.
- **Status bar:** it matched the old build. On 26.5 it is invisible on the white camera-access gate in both builds; that's pre-existing, not touched.
- **Not exercisable headless:** inbound `glutenornot://` links (iOS asks for a tap, and no product path uses them) and the AppState handler (a `simctl privacy grant` kills the process).

**Grill: Pi on gpt-6-sol in a Herdr tab, report-only, four rounds, about $1.06.**
- **Round 1 (DON'T SHIP), the 🔴:** a scene reconnect in a live process re-ran `startReactNative`, which re-runs expo-updates' `AppController.start()`. That is `precondition(!isStarted)`, and `EXUpdatesEnabled` is true, so it trapped. Closing and reopening an iPadOS 27 window would trigger it. Verified in source before fixing. Now the running root view controller moves to the new window, which is all `startReactNative` does to a window.
- **Round 1, the 🟡s:** a half-patched AppDelegate now throws, and the smoke must prove a sustained launch.
- **Round 2 (SHIP):** the smoke snippet now prints OK/FAIL by itself, and a sheet presented at disconnect is documented as a known, untestable edge.
- **Round 3 (SHIP):** the smoke log check is scoped to the launch PID. A sanity grep briefly suggested the predicate matched nothing, but the grep was wrong, not the predicate.
- **Round 4 (SHIP):** no findings, and "ready to merge and archive as 1.5.1 build 3".

**Proving the reconnect branch.**
- **With the real config:** iOS refuses `requestSceneSessionDestruction` ("does not support multiple scenes").
- **With multiple scenes enabled (test-only build):** destroying the last scene ended the process cleanly, with no crash report.
- **What worked:** a test-only build that *activated a second scene* drove `willConnectTo` again in the same process with a running root (`runningRoot=present`). The process survived and the moved root rendered the live UI.
- **Cleanup:** none of the hooks were committed, and `ios/` was regenerated clean after each experiment.

**Release (2026-10-24).**
- **Merge:** PR #45 merged as `143e521` on Aaron's "proceed", pinned to the full head SHA. The branch was deleted after the merge was verified. The docs close-out is `e92def9`.
- **Step 2 smoke:** run verbatim from `main` on the iOS 27 iPhone and iPad, both OK/OK.
- **Build 3 staging:** prebuilt at 1.5.1 (3) with MARKETING_VERSION, team, both build-number spots, the Sentry token (`Method: Auth Token`) and the Podfile patch. 4d confirmed the plugin ran.
- **The archive (Aaron) and its check:** 1.5.1 (3), `iphoneos27.1`, the manifest with `GlutenOrNot.SceneDelegate`, `_TtC11GlutenOrNot13SceneDelegate` in the binary, `app.config` 1.5.1, updates runtime 1.5.1.
- **One archive:** the TestFlight binary is the submitted binary; its events predate the public release date.
- **Resubmission:** Aaron swapped build 2 for 3 on the version, replied in the rejection thread (root cause, the fix, iOS 27 iPhone/iPad sims, iOS 26, TestFlight), and pressed **Resubmit to App Review**. It went to *Waiting for Review* on 2026-10-24 ~07:01 ET (11:01 UTC), submission `2e8fc8d5-49ec-4e16-b443-ecffa80cdcb3`.

**After the resubmission (on Aaron's OK).**
- **The tag:** `v1.5.1` was force-moved from `35d9be2` to `e92def9`, the build-3 commit; the annotated tag object is `a7a8f0b`. The GitHub release's submission line now describes build 3.
- **The live-check routine:** `trig_01QLDUo2pVzNABgYGaALLDpq` had fired on 10-21 while 1.5.1 was rejected. It's re-armed for **2026-10-27 14:00 UTC**, with its NOT-LIVE context changed to build 3.

## Left

- **2026-10-27 14:00 UTC:** read the live-check routine's report.
- **When 1.5.1 goes public:** record `currentVersionReleaseDate` in the retake plan, then set the day-14 read date in `ROADMAP.md` (unchanged from the 10-18 log).
- **Watch:** Sentry `glutenornot-mobile` for anything in launch or scene code on 1.5.1 (3), especially iPad. The reconnect path can't be forced, so production is the only place it runs.
- **Seen but out of scope:** on launch, expo-updates' background update check fails with a 400 ("channel-name required") because the locally built app sends no EAS channel header, so OTA updates have likely never worked. It's harmless (the embedded bundle runs) but worth a look.
- **At the Expo SDK 57/58 upgrade:** delete the plugin (RELEASE.md 4d).
