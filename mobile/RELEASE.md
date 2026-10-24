# iOS Release Runbook

Step-by-step to build and ship a new iOS version. Mirrors the proven
**local Xcode archive** flow (same as v1.1.1). Web deploys automatically from
`main` via Vercel — this doc is iOS-only.

---

## ⚠️ v1.5.1 build 2 REJECTED (2026-10-19), build 3 pending

App Review (iPhone 17 Pro Max + iPad Air 11-inch (M3), iOS/iPadOS 27.0) rejected
build 2 under **2.1(a)**: it crashed on launch. It was the first archive on
Xcode 27, and iOS 27 traps any app built with its SDK that hasn't adopted the
UIScene life cycle (step 4d). Nothing in the smoke ran on iOS 27, so nothing
caught it (step 2 now says to). The fix is `mobile/plugins/withSceneLifecycle.js`
(branch `fix/ios27-scene-lifecycle`), proven on iOS 27.0 iPhone and iPad Air 11"
(M3) simulators. Build 3 = same 1.5.1 source + that plugin: archive it from `main`
after the merge (4c for the build number), smoke it on TestFlight, then resubmit.

## ✅ Last shipped: v1.5.1 — Retake screen + write-review link (submitted 2026-10-18)

**Submitted to App Store review 2026-10-18 ~07:01 ET (11:01 UTC) as build 2**,
from `main` at `35d9be2`; tag `v1.5.1` + GitHub release; the App Store
live-check routine fires 2026-10-21 14:00 UTC (step 8). Build 1 (uploaded 2026-10-16) was the
TestFlight smoke build: same source, but its bundled `app.config` said
`1.5.1-rc.smoke` so its events are excludable — **never submit an rc build**.
What changed on the phone: a label photo the server can't read fully
(`retake_reason`, decision 009, `plans/retake-state-2026-10-11.md`) shows a
neutral "Retake the photo" screen instead of an amber Caution card, with a "See
what I could read" way out; the next photo carries `retake_after`. Plus PR #27's
result-footer write-review link. The API half has been live since the PR #43
merge (2026-10-16 16:29 UTC). First archive on **Xcode 27** (see the lessons below).

**TestFlight evidence (2026-10-18, build 1, Aaron's phone, 06:17–06:37 ET,
`app_version 1.5.1-rc.smoke` — exclude it from every read):** five retake
responses (`retake_reason: no_heading`); "See what I could read" inside a
barcode-recovery flow (`result_displayed` 10.5 s after the scan, against ~0.3 s
for a plain card); Retake → full photo came back Safe carrying `retake_after:
no_heading` (06:35:46); the torch came back on after Retake (Aaron); three
`review_prompt store_opened` and the App Store compose sheet on screen; barcode
auto-detect and three barcode-recovery flows end to end. Not exercised:
couldn't-read → "Turn on flashlight & retry".

**Post-release checks that matter for this one:** (1) once public, record
`currentVersionReleaseDate` from
`https://itunes.apple.com/lookup?bundleId=com.glutenornot.scanner` in the plan's
Execution notes — the day-14 read (plan Task 13, queries in `api/ANALYTICS.md`)
counts from it; (2) a production scan from an updated install reports
`app_version 1.5.1` (the build-2 archive's `app.config` was checked: `1.5.1`);
(3) `review_prompt requested` from a fresh App Store install (it never fires on
TestFlight); (4) Sentry `glutenornot-mobile` for anything from `index.tsx`'s
retake state (`commitResult`).

**Runbook lessons (1.5.1):** Xcode 27 ships no Simulator.app, so the agent smoke
build goes through `xcodebuild` + `simctl` (step 2); the rc tag lands in
`Info.plist` and must be patched before an archive (step 2); Xcode 27 makes pod
deployment targets below 15 a hard error (step 4b); a second archive of one
version needs its build number set in two places (step 4c); close-range blur is
the main lens's focus distance, not a bug (Notes).

Previous: v1.5.0 (2026-09-05; build 3 live 2026-09-07) — barcode recovery. Build
2 was rejected under guideline 5.1.1(iv) for an "Enable camera" pre-permission
button; build 3 ("Continue", plus "Open Settings" when iOS won't ask again)
passed. **Lesson for every future pre-permission screen: never put the verb of
the permission on the button.** Build 3's Settings-return path was never run on
TestFlight: a Sentry event with `context: camera_permission_refresh` or
`camera_settings` points there first. Its runbook lesson: `ios/sentry.properties`
is appended to, never overwritten (step 0). History in
`.claude/sessions/2026-09-05-add-barcode-recovery.md` and
`2026-09-06-fix-app-review-camera-button.md`.

Previous: v1.4.3 (2026-08-28, build 1) — weak-signal upload. Submitted to App Store review on 2026-08-28 (**build 1**), the day it was scoped
— `plans/weak-signal-upload-2026-08-28.md`, from a field incident on 2-bar LTE.
What changed on the phone: the OCR request goes over XHR so the reading screen
shows **"Uploading photo… N%"** and only says "Reading ingredients…" once iOS
reports the body sent; the slow copy is per phase with its own clock (30 s
uploading → "Slow connection — still uploading…", 20 s server-side → a
non-prescriptive "still working"); a Cancel tap beacons `scan_failed
reason=cancelled` + `elapsed_ms`, backgrounding mid-scan beacons `interrupted`;
photos are encoded at **JPEG 0.6** (was 0.7 — measured on nine real labels in
the gitignored `test-cases/`, table in the plan under B1). The api half (server
`ocr_ms`/`claude_ms`/`total_ms`, the new beacon reasons) went live via Vercel at
the PR #24 merge, before this build.

**TestFlight evidence (2026-08-28, this build):** two OCR scans arrived with
`app_version: 1.4.3`, `platform: ios`, timing populated (`total_ms` 3.4 s / 4.2 s),
and `image_kb` **339 / 347** vs the 0.7-era p50 of 408 — the projected ~15%. Not
exercised on device: the `cancelled` / `interrupted` beacons and the 3G copy
(unit-tested only) — the first weekly review after release should look for
`cancelled` events at all before reading the failure rows.

**Post-release checks that matter for this one:** (1) `cancelled` and
`interrupted` appear in PostHog from real installs, with `elapsed_ms` on the
former only; (2) `image_kb` p50 among `app_version ≥ 1.4.3` lands near 340 KB;
(3) no rise in `ocr_failed` from 1.4.3 builds (the 0.6 guard); (4) decision 002's
Opus-latency question: the server leg is now measured — first reads say ~3–4 s,
well under the 7–13 s estimate. The plan's D2 read is due ~2026-09-11.

Previous: v1.4.2 (2026-08-13, build 1): a deliberate one-change release — the
`X-Client-Version` header, so `scan` events carry `app_version`. The generated
`EXConstants.bundle/app.config` carried `1.4.2`; this time it was checked for
`1.4.3` in the smoke build's DerivedData before the archive.

Previous: v1.4.1 (2026-07-27, build 1): the mobile fixes from
`reports/2026-07-27-pre-release-review.md` — permission-gate render order
(photo-picker scans work with camera denied), picker-aware couldn't-read
screen (no flashlight offer for library picks), and the torch fallback-race
fix (late real `onCameraReady` re-applies the torch as a fresh transition).
The same commit shipped the api/web fixes via Vercel, including the
multilingual gluten-signal safety bug.

Previous: v1.4.0 (2026-07-19, build 3 — build 1 was the TestFlight round that
caught the torch settle quirk, see Notes): torch toggle + flashlight retry,
`/api/track` failure beacon, `__DEV__` log gating, pre-flight connectivity
check. Phased release.

Context still worth knowing:
- The app icon is committed (`mobile/assets/icon.png`) and ships automatically —
  no manual icon upload, Xcode flattens the alpha channel.
- The App Store screenshots live at **`mobile/store-assets/appstore/`** (committed,
  no file transfer needed). See the README there for captions.
- v1.2.0 was the first build to send the `X-Client: ios` analytics header (PostHog
  scan-event logging, #13). Installs from before 1.2.0 report `platform: unknown`;
  1.2.0+ scans attribute as `platform: ios`.
- v1.3.0's submission also changed the App Store **privacy label** ("Data Not
  Collected" → "Data Not Linked to You": Usage Data + Coarse Location) to match the
  rewritten privacy policy — keep the two in sync in future releases.


## ⏳ Pending on main (not yet shipped)

Nothing: `main` matches 1.5.1 (`35d9be2`). Candidates for the next build
(barcode-recovery enrichment, weak-signal multipart upload, auto-retry) are in
`ROADMAP.md`.

**Agent-driven release notes (learned 2026-08-28, 1.4.3):**
- Use `npm ci` (not `npm install`) in step 1 — `npm install` prunes ~22 stale
  optional entries from the lockfile and dirties the tree for no reason.
- `npx expo run:ios --configuration Release --no-bundler` was the agent's smoke
  build through Xcode 26; on Xcode 27 use step 2's `xcodebuild` + `simctl`
  path. `xcrun simctl io booted screenshot <png>` proves the launch. Check the generated version with
  `find ~/Library/Developer/Xcode/DerivedData/GlutenOrNot-*/Build/Products/Release-iphonesimulator -name app.config`.
- Verifying the Vercel deploy: the Vercel MCP's deployment list can be blocked
  by the permission classifier — a real scan against production (the plan's A5
  script) proves the api is live and is the check that matters anyway.
- PostHog's query API **caches results**; when checking for an event you just
  created, send `"refresh": "force_blocking"` in the query body or you will
  read a stale page and conclude the event never arrived.

> **First build on a new machine?** See **Troubleshooting** at the bottom — the M3
> hit several one-time setup issues the M1 never did.

---

## 0. Prerequisites (one-time per machine)

- Xcode installed + signed in with the Apple Developer team.
- Node + the repo cloned; `cd mobile`.
- **Sentry auth token for source-map upload.** ⚠️ For the **GUI Xcode archive** an
  exported shell variable does **not** reach Xcode (it's launched via LaunchServices,
  not your shell), so the reliable method is the properties file: add the token as
  `auth.token=sntrys_…` to **`mobile/ios/sentry.properties`**. Use an **organization
  auth token** with the **`org:ci`** scope (Sentry → Settings → Organization Tokens;
  it's the modern all-in-one scope for build uploads — supersedes the legacy
  `project:releases` + `org:read` personal-token combo). `sentry-cli` reads
  `auth.token` from this file in both upload phases regardless of how Xcode launched.
  Validate with `SENTRY_PROPERTIES=ios/sentry.properties npx sentry-cli info`.
  Note: `ios/` is gitignored and **wiped by `prebuild` (step 4)**, so add the token
  *after* prebuild. **Append — never overwrite.** Prebuild's Sentry plugin writes
  `defaults.url` / `defaults.org=aaron-roy` / `defaults.project=glutenornot-mobile`
  into that file; replacing it with only the token makes every build fail in the
  "Bundle React Native code" phase with `A project ID or slug is required`
  (1.5.0, 2026-09-05). Safe form:
  `printf '\nauth.token=%s\n' "$(grep ^token= ~/.sentryclirc | cut -d= -f2-)" >> ios/sentry.properties`
  — the leading newline matters: prebuild's file ends without one, so a plain
  `echo >>` glues the token onto the trailing `# Using SENTRY_AUTH_TOKEN…`
  comment line and it is silently ignored (1.5.0 build 3, 2026-09-06). Check
  with `SENTRY_PROPERTIES=ios/sentry.properties npx sentry-cli info` — it must
  print `Method: Auth Token`. Without it the build still succeeds but ships without source maps
  (Sentry stack traces stay minified).
  **As of 1.3.0 the token also lives permanently in `~/.sentryclirc`** (`[auth]`
  `token=…`, perms 600) — sentry-cli reads that global file from Xcode build phases
  too, so source maps survive even if the sentry.properties step is forgotten. The
  properties-file step above is kept as belt-and-suspenders.

## 1. Sync + install

```bash
git checkout main && git pull
cd mobile
npm ci               # not `npm install`: that prunes stale lockfile entries and dirties the tree
```

Sanity check the JS before building:

```bash
npx tsc --noEmit     # should be clean
npm test             # jest — all green (219 tests as of the 1.5.1 retake screen)
```

## 2. Smoke test (do this BEFORE the release build)

Native modules (`react-native-svg`, `expo-camera`, Sentry) mean **Expo Go won't
work** — you need a dev build. **Tag it first:** set `version` in `mobile/app.json`
to `<next>-rc.smoke` (e.g. `1.5.1-rc.smoke`) before building. The server
whitelists `-[a-z0-9.]{1,10}` suffixes, so every event the smoke build sends
(`scan`, `barcode_recovery`, `review_prompt` — dev builds *do* emit `requested`)
is excludable by `app_version NOT LIKE '%-rc%'`. Step 3 sets the real version.

**When the smoke runs on TestFlight, that's two archives (1.5.1).** Build 1 is
archived with the rc string and goes to TestFlight only. Build 2 is archived
after the plain version is restored (fresh prebuild + step 4's patches + step
4c), and is the one you submit. ⚠️ Prebuild writes `app.json`'s version into
`ios/GlutenOrNot/Info.plist` as a **literal** `CFBundleShortVersionString`, and
App Store Connect rejects `1.5.1-rc.smoke`. Before archiving an rc build, set
the plist to the numeric version:
`/usr/libexec/PlistBuddy -c 'Set :CFBundleShortVersionString 1.5.1' ios/GlutenOrNot/Info.plist`.
The JS reads its version from the bundled `app.config`, which is generated from
`app.json` at build time, so the rc string survives there and tags the events.

```bash
npx expo run:ios            # builds + runs a dev build in the iOS simulator
# npx expo run:ios --device # use a physical device for the live camera + barcode
# npx expo run:ios --configuration Release   # self-contained JS bundle, no Metro —
#   closest to what ships, and the right variant when an agent drives the build
#   (the plain dev build needs Metro attached to load JS)
```

**Xcode 27 ships no Simulator.app**, so `expo run:ios` fails with "Can't
determine id of Simulator app". After step 4 (prebuild + patches), build and
run the Release app headless instead:

**Boot a simulator on the newest iOS runtime Xcode has** (the highest
`xcrun simctl list runtimes` entry). iOS enforces new launch requirements only
on its own OS. 1.5.1 build 2 launched on an iOS 26 simulator and on Aaron's
iOS 26 phone, then crashed on launch on App Review's iOS 27 devices: an app
built with the iOS 27 SDK without the UIScene life cycle traps before its first
frame (2026-10-19, see 4d). A TestFlight phone on an older iOS proves the
hardware paths, not the launch.

```bash
xcrun simctl boot <udid>                     # newest runtime, from `xcrun simctl list devices available`
xcodebuild -workspace ios/GlutenOrNot.xcworkspace -scheme GlutenOrNot \
  -configuration Release -sdk iphonesimulator -destination 'id=<udid>' build
xcrun simctl install booted ~/Library/Developer/Xcode/DerivedData/GlutenOrNot-*/Build/Products/Release-iphonesimulator/GlutenOrNot.app
PID=$(xcrun simctl launch booted com.glutenornot.scanner | awk '{print $NF}')
sleep 10
xcrun simctl spawn booted launchctl list | awk -v p="$PID" '$1 == p && /glutenornot/ { ok = 1 } END { print (ok ? "OK: still running as " p : "FAIL: not running") }'
if LOG=$(xcrun simctl spawn booted log show --last 1m --predicate 'process == "GlutenOrNot"'); then
  echo "$LOG" | grep -qi "life cycle is required" && echo "FAIL: life-cycle trap logged" || echo "OK: no life-cycle trap"
else
  echo "FAIL: log show failed"
fi
xcrun simctl io booted screenshot launch.png # then open it: the app's UI, not the home screen
```

Both lines must say OK. A screenshot alone proves nothing, because a trap at
launch leaves the splash or the home screen showing. (A `getpwuid_r` line from
`log show` is harmless.)

Verify in the **simulator**:
- [ ] Type renders as **Hanken Grotesk** (geometric sans), not the system font.
- [ ] Launch shows the **dark splash** (#121211) with the reticle icon.
- [ ] **Capture** screen: dark viewfinder + corner brackets, shutter + library buttons.
      (Camera feed is black in the simulator — that's expected.)
- [ ] Pick a photo via the library button → **Reading** → **Result**: full-bleed
      verdict band + white sheet (source chip, flagged rows, confidence meter).
- [ ] A menu photo → **tally + grouped dishes**.
- [ ] **Recents** (1.3.0+): clock button right of the shutter → history list; tap a row
      reopens the saved result; **Clear** empties with a confirm.
- [ ] Airplane mode → **Offline** screen (post-1.3.0: appears **instantly** via the
      pre-flight check, not after a request hang); a blurry/unreadable photo →
      **Couldn't read** screen.

Verify on a **physical device** (camera doesn't exist in the simulator):
- [ ] **Build-3 permission fix:** fresh permission state → neutral **Continue**
      → system prompt. Deny → **Open Settings**; photo-library scans still work.
      Open Settings → grant → return: live camera appears without a manual
      restart (the app refreshes Expo's cached permission on foreground).
      Also return without granting: Settings and library actions remain usable.
      Jest covers the warm-return path with Expo's real hook; native navigation
      and the actual prompt still require this TestFlight check.
- [ ] Live camera feed + the **shutter** capture path.
- [ ] **Write-review link** (1.5.1+): after the 3rd lifetime scan the result footer
      reads "Your feedback matters! Write us a review"; the link must open the App
      Store compose sheet for GlutenOrNot. PostHog should show a `review_prompt`
      `store_opened` event within seconds:
      `~/.claude/skills/glutenornot-debug/scripts/posthog-query sql "SELECT timestamp, properties.stage, properties.app_version FROM events WHERE event='review_prompt' ORDER BY timestamp DESC LIMIT 5"`
      (the script lives in the debug skill, not on PATH). The `requested` stage
      will **not** fire on TestFlight — `isAvailableAsync()` is false there by
      design — and it will not fire on a phone that has already been asked (the
      once-per-install flag; delete + reinstall to reset). Simulator / Xcode
      smoke builds DO send it, which is why they carry an `-rc` app_version.
      Verify `requested` from a fresh App Store install after release
      (`api/ANALYTICS.md` → `review_prompt`).
- [ ] **Retake screen** (1.5.1+): a label shot with the "Ingredients" heading
      out of frame shows "Retake the photo"; with the torch on, Retake brings
      the LED back; the next photo's `scan` event carries `retake_after`; "See
      what I could read" opens the result once and saves it to Recents once.
      Use a product that reads **Safe** from a full photo and frame it so no
      "Contains:" or "Free from…" line is in shot: any allergen row keeps the
      amber card (decision 009, T8), and so does a product that cautions for a
      real reason.
- [ ] **Barcode** auto-detection.
- [ ] **Torch** (1.4.0+): overlay toggle actually lights the LED; torch stays on
      across a retake; and — the path jest can't prove — after the **Couldn't
      read** screen, "Turn on flashlight & retry" must re-light the torch when
      the camera remounts (expo-camera has historic iOS quirks applying
      `enableTorch` at mount). Also confirm barcode auto-detect still fires
      with the torch on.

## 3. Bump the version

Edit `mobile/app.json`:

```jsonc
"version": "1.2.0",   // was 1.1.1
```

In the **same commit**, bump the matching `"version"` in `package.json` and
`mobile/package.json` (and their lockfile root entries — easiest via
`npm version 1.2.0 --no-git-tag-version --allow-same-version` run in each dir)
so `app.json`, both `package.json`s, the lockfiles, and the step-7 git tag all
agree. They were a single source of truth as of 1.2.0 — keep them in lockstep.

Already bumped on `main` (1.5.1 was bumped by PR #27)? Then this step is a
lockstep check, not a bump:
`grep -n '"version"' mobile/app.json package.json mobile/package.json` plus the
root entries in both lockfiles must all show the same version.

## 4. Prebuild (regenerates the gitignored native project)

```bash
npx expo prebuild --platform ios --clean
```

### ⚠️ 4a. Patch MARKETING_VERSION (every prebuild resets it to 1.0)

`prebuild` writes `MARKETING_VERSION = 1.0;` into
`ios/GlutenOrNot.xcodeproj/project.pbxproj`. Fix **both** the Debug and Release
configs:

```bash
# from mobile/
sed -i '' 's/MARKETING_VERSION = 1.0;/MARKETING_VERSION = 1.2.0;/g' ios/GlutenOrNot.xcodeproj/project.pbxproj
grep -n "MARKETING_VERSION" ios/GlutenOrNot.xcodeproj/project.pbxproj   # confirm both now read 1.2.0
```

### ⚠️ 4b. Patch the Podfile (Xcode 27+, every prebuild)

Xcode 27 makes a pod target whose deployment target is below 15.0 a hard
**error** (Sentry, SDWebImage, RNSVG, RNCAsyncStorage and ReachabilitySwift
resource bundles; older Xcodes only warned). Lift them to the app's own 15.1.
In `ios/Podfile`, inside `post_install`, after the `react_native_post_install(…)`
call:

```ruby
    # Xcode 27: pod targets below 15.0 are a hard error; lift them to the app's 15.1.
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.1
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end
```

Then `cd ios && pod install`, and check:
`grep -o 'IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*' ios/Pods/Pods.xcodeproj/project.pbxproj | sort | uniq -c`
(all 15.1). A config plugin would make this permanent; until then it's a
post-prebuild patch like 4a.

### 4c. A second archive of the same version (build 2+)

`Info.plist` carries a **literal** `CFBundleVersion` of `1`, so set the build
number in both places:
`perl -pi -e 's/CURRENT_PROJECT_VERSION = 1;/CURRENT_PROJECT_VERSION = 2;/' ios/GlutenOrNot.xcodeproj/project.pbxproj`
and `/usr/libexec/PlistBuddy -c 'Set :CFBundleVersion 2' ios/GlutenOrNot/Info.plist`.

**Before Distribute, check the archive itself** (1.5.1): Info.plist's version
and build, and that the bundled `app.config` has no `-rc`:
`A=$(ls -dt ~/Library/Developer/Xcode/Archives/*/*.xcarchive | head -1); find "$A" -name app.config -exec grep -o '"version":"[^"]*"' {} \;`
(take the path from `ls`/`find`: the folder name has a narrow no-break space before "AM"/"PM").

### 4d. Check the scene life cycle (Xcode 27+, automatic)

iOS 27 refuses to launch an app built with the iOS 27 SDK unless it uses the
UIScene life cycle (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`,
"UIScene life cycle is required for apps built with this SDK"). Expo SDK 54's
template doesn't, so the local config plugin `mobile/plugins/withSceneLifecycle.js`
adds the scene manifest and a `SceneDelegate` on every prebuild. Nothing to patch
by hand, but confirm it ran:
`grep -c 'class SceneDelegate' ios/GlutenOrNot/AppDelegate.swift` (1) and
`plutil -extract UIApplicationSceneManifest json -o - ios/GlutenOrNot/Info.plist`.
The plugin throws during prebuild if the template changes shape. Its
`SceneDelegate` moves the running root view to a reconnected scene, for example
an iPad window closed and reopened. It must never call `startReactNative` twice,
because expo-updates' `AppController.start()` traps on a second call. Delete it at the
Expo upgrade: SDK 57 has `ios.enableSceneSupport` in expo-build-properties, and
SDK 58's template adopts scenes itself.

## 5. Archive in Xcode

```bash
open ios/GlutenOrNot.xcworkspace
```

> **Skip steps 1–2 by pre-scripting them** (proven on 1.4.1): prebuild leaves
> `CURRENT_PROJECT_VERSION = 1` (correct for a new version string) and no
> `DEVELOPMENT_TEAM`. Insert the team next to it in both configs —
> `perl -pi -e 's/CURRENT_PROJECT_VERSION = 1;/CURRENT_PROJECT_VERSION = 1;\n\t\t\t\tDEVELOPMENT_TEAM = 5AY7LN2ATY;/' ios/GlutenOrNot.xcodeproj/project.pbxproj`
> — then verify all three resolve before opening Xcode:
> `xcodebuild -workspace ios/GlutenOrNot.xcworkspace -scheme GlutenOrNot -configuration Release -showBuildSettings | grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION|DEVELOPMENT_TEAM"`
> (Team ID `5AY7LN2ATY` is recoverable from any past archive's Info.plist under
> `~/Library/Developer/Xcode/Archives/` if it ever changes.)

In Xcode:
1. Select the **GlutenOrNot** target → **Signing & Capabilities** → pick your Team
   (pre-filled if you ran the script above).
2. **General** tab → confirm **Version = 1.2.0**, set **Build = 1**
   (build number is scoped per version string, so 1 is valid for a new version).
3. Toolbar device selector → **Any iOS Device (arm64)**.
4. **Product → Archive**.
5. In the Organizer: **Distribute App → App Store Connect → Upload**.

> **Hardware-dependent features? TestFlight before submitting.** If the release
> touches camera, torch, haptics, or anything else jest and the simulator can't
> prove, install the uploaded build via **TestFlight internal** (available in
> minutes, no review) and smoke it on a real device *before* Submit for Review.
> This caught the 1.4.0 torch settle quirk that two rounds of code-level
> hardening and a green test suite could not.

## 6. App Store Connect (browser — appstoreconnect.apple.com)

1. App icon: nothing to do — it's baked into the uploaded build.
2. **Screenshots**: refresh the 6.7"/6.9" set with the 4 in
   `mobile/store-assets/appstore/` (captions in the README there). The old
   screenshots show the teal design.
3. Add **"What's New"** notes. Suggested draft:
   > A fresh new look. GlutenOrNot has been redesigned for speed and clarity — a
   > bigger, bolder verdict, cleaner ingredient and menu breakdowns, and a sharper
   > scanning experience. Same instant gluten checks, now easier to read at a glance.
4. Attach the build to the **1.2.0** version and **Submit for Review**.

## 7. Tag the release (git)

Every App Store submission gets a matching annotated git tag, so the exact
shipped commit is reproducible (`git checkout vX.Y.Z`). The tag version mirrors
`mobile/app.json`. Do this from `main` after the build you submitted is committed:

```bash
git checkout main && git pull
git tag -a v1.2.0 -m "iOS 1.2.0 — <one-line summary>"   # substitute your version
git push origin v1.2.0
```

Optional polish: turn the tag into a GitHub Release and paste the step-6
"What's New" copy as the notes (free, since you already wrote it):

```bash
gh release create v1.2.0 --title "v1.2.0 — <summary>" --notes "<What's New text>"
```

> History: tags `v1.0.0`–`v1.2.0` were backfilled at their `app.json` bump
> commits on 2026-06-11. Going forward, tag at submission time (this step).
> Only the iOS app is tagged — web/API deploy continuously from `main` and have
> no discrete versions.

## 8. Post-release sanity (browser, optional)

- **Re-arm the App Store live-check routine** (proven 1.4.0 + 1.4.1): a one-shot
  cloud routine ("Check iOS x.y.z live on App Store", visible at
  claude.ai/code/routines) curls the iTunes lookup API ~3 days after submission
  and reports LIVE/NOT-LIVE plus `currentVersionReleaseDate`. Reuse it via
  `/schedule`: update its prompt to the new version and a fresh `run_once_at`,
  and don't create a duplicate. Current ID: `trig_01QLDUo2pVzNABgYGaALLDpq`
  (1.5.1; curl only, no connectors). `get` it first: the 1.4.x–1.5.0 routine
  (`trig_01MMyYwpjSn3QUdtUUxfbCPP`) had disappeared by 1.5.1 (404), so if it's
  gone, create a new one-shot and record its ID here.

- Confirm the live web app shows the redesign (hard-refresh; the service worker
  updates on the next visit). Spot-check a real scan.
- Sentry `glutenornot-mobile`: watch for any new error-level issues after release.
- PostHog: after a real scan from an **updated** install, confirm the `scan` event
  now reports `platform: ios` (older installs keep showing `platform: unknown`
  until users update — that's expected).
- PostHog: confirm that same event carries **`app_version` = the version you just
  shipped**. This is the only check that catches the client half failing: if
  `Constants.expoConfig` ever comes back empty in a production build, the app
  sends no version header, the server logs nothing (it never saw one), and every
  event silently looks like it came from a pre-1.4.2 client. A missing
  `app_version` here means release attribution is broken — fix before relying on
  any before/after comparison.

---

## Notes / known quirks
- `mobile/ios/` is gitignored and regenerated by `prebuild` — never commit it.
- **`enableTorch` transitions are silently dropped while the camera session
  settles** (confirmed on-device, 1.4.0 TestFlight build 1: the retry path lit
  the button but not the LED; a manual toggle seconds later worked). The code
  compensates by applying the torch only after a 750ms post-`onCameraReady`
  settle window (`TORCH_SETTLE_MS` in `app/index.tsx`) — if a future device
  still drops it, raise that constant before reaching for bigger refactors.
- The `MARKETING_VERSION = 1.0` reset (step 4a) bites on **every** prebuild — don't skip it.
- **Close-up blur is the lens, not a regression** (1.5.1 TestFlight). With no
  `selectedLens`, expo-camera uses the physical wide-angle lens
  (`DeviceDiscovery.swift` → `defaultBackCamera`), which can't focus much closer
  than ~20 cm. The stock Camera app escapes this by switching to the ultra-wide
  for macro, but our app can't switch. Test at 25–30 cm. Choosing the virtual
  multi-lens camera would add automatic macro switching; that's a product
  change, not a release fix.
- **Rejection playbook (learned 1.5.0):** same version string, next build
  number (step 4c); in App Store Connect hover the Build row → red minus → Add
  Build → Save → Submit for Review on the *same* version. Resubmitting closes the
  rejection's message thread, so reply *before* submitting if you want the
  reviewer to read it. Move the git tag to the resubmitted commit.
- `eas.json` has build profiles, but the proven release path is the local Xcode
  archive above. (EAS production builds are an alternative, not required.)

---

## Troubleshooting (first build on a new machine)

The first build on the M3 (Expo SDK 54 / RN 0.81 / Xcode 26) hit several one-time
setup issues the M1 never did. All are environment, not code (`npm test` + `tsc` were
clean throughout):

- **CocoaPods not installed** — `expo run:ios` auto-installs it via Homebrew on first
  run. One-time; just let it finish.
- **`error: Internal inconsistency error: never received target ended message`** —
  Xcode build-system race under heavy parallel compilation; fails on a *different
  random Pod each run*. Fix once (persists in Xcode prefs):
  `defaults write com.apple.dt.Xcode IDEBuildOperationMaxNumberOfConcurrentCompileTasks 2`
- **Hermes script phase: `node: No such file or directory`** — `ios/.xcode.env.local`
  pinned an absolute path to a since-deleted Node version. A clean `prebuild`
  regenerates it with the current node; or edit it to
  `export NODE_BINARY=$(command -v node)`.
- **Link error: `Undefined symbols … facebook::react::Sealable / ShadowNode`** —
  RN 0.81 ships React Native core as prebuilt binaries; an interrupted build leaves
  them mismatched. Fix: `npx expo prebuild --platform ios --clean` +
  `rm -rf ~/Library/Developer/Xcode/DerivedData/GlutenOrNot-*`, then rebuild.
  (The `SwiftUICore.tbd` "not an allowed client" line above it is just a warning.)
- **`The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to
  9.0, but the range of supported deployment target versions is 15.0 to 27.0.x`**
  (Xcode 27, first seen 1.5.1) — five `error:` lines in the Pods project, then
  `BUILD FAILED`. Step 4b's Podfile patch fixes it; it is lost on every prebuild.
- **`Can't determine id of Simulator app`** from `expo run:ios` (Xcode 27) —
  there is no Simulator.app; use step 2's `xcodebuild` + `simctl` path.
- **"Upload completed with warnings → Upload Symbols Failed" (step 5, benign).**
  Xcode can't find dSYMs for the prebuilt `React`, `ReactNativeDependencies`, and
  `hermes` frameworks. Expected for RN prebuilt — the upload still succeeds, click
  **Done**. It doesn't affect Sentry symbolication (Sentry gets its symbols from the
  step-0 token during the build, not from Apple).
