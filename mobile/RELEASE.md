# iOS Release Runbook

Step-by-step to build and ship a new iOS version. Mirrors the proven
**local Xcode archive** flow (same as v1.1.1). Web deploys automatically from
`main` via Vercel — this doc is iOS-only.

---

## ✅ Last shipped: v1.3.0 — Recents scan history (2026-07-07)

Submitted to App Store review on 2026-07-07 (build 1): Recents scan history
(local-only, cap 50), the in-app rating prompt (expo-store-review), and the June
full-bleed result-band fix. Version examples below still read `1.2.0` — substitute
your new version.

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

- **PR #15 (2026-07-11)**: pre-flight connectivity check + connectivity-framed error
  copy. Adds a **native dependency (`expo-network`)** — the first release after 1.3.0
  must be a full build (prebuild picks the module up automatically; no config plugin).
- **Next release should be 1.4.0 and also bundle Phase 2 of
  `plans/ocr-capture-assist-2026-07-18.md`** (torch toggle + glyph, "Turn on
  flashlight & retry" failure state, `/api/track` beacon for client-side
  timeout/network `scan_failed`) — built next session; don't cut a build with only
  PR #15 unless something urgent forces it (two review cycles for no gain).
- ⚠️ **Do NOT publish an `eas update` while the version is still 1.3.0.**
  `runtimeVersion.policy` is `appVersion`, so an update published at 1.3.0 would reach
  existing 1.3.0 binaries that *lack* the `expo-network` native module — the bundle
  imports it at load, and scans would break for every updated user. Bump the version
  (step 3) before any build **or** update publish.

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
  *after* prebuild. Without it the build still succeeds but ships without source maps
  (Sentry stack traces stay minified).
  **As of 1.3.0 the token also lives permanently in `~/.sentryclirc`** (`[auth]`
  `token=…`, perms 600) — sentry-cli reads that global file from Xcode build phases
  too, so source maps survive even if the sentry.properties step is forgotten. The
  properties-file step above is kept as belt-and-suspenders.

## 1. Sync + install

```bash
git checkout main && git pull
cd mobile
npm install          # pulls new deps: react-native-svg, expo-font, expo-asset,
                     # @expo-google-fonts/{hanken-grotesk,jetbrains-mono}
```

Sanity check the JS before building:

```bash
npx tsc --noEmit     # should be clean
npm test             # jest — all green (45 tests as of PR #15)
```

## 2. Smoke test (do this BEFORE the release build)

Native modules (`react-native-svg`, `expo-camera`, Sentry) mean **Expo Go won't
work** — you need a dev build:

```bash
npx expo run:ios            # builds + runs a dev build in the iOS simulator
# npx expo run:ios --device # use a physical device for the live camera + barcode
# npx expo run:ios --configuration Release   # self-contained JS bundle, no Metro —
#   closest to what ships, and the right variant when an agent drives the build
#   (the plain dev build needs Metro attached to load JS)
```

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
- [ ] Live camera feed + the **shutter** capture path.
- [ ] **Barcode** auto-detection.

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

## 5. Archive in Xcode

```bash
open ios/GlutenOrNot.xcworkspace
```

In Xcode:
1. Select the **GlutenOrNot** target → **Signing & Capabilities** → pick your Team.
2. **General** tab → confirm **Version = 1.2.0**, set **Build = 1**
   (build number is scoped per version string, so 1 is valid for a new version).
3. Toolbar device selector → **Any iOS Device (arm64)**.
4. **Product → Archive**.
5. In the Organizer: **Distribute App → App Store Connect → Upload**.

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

- Confirm the live web app shows the redesign (hard-refresh; the service worker
  updates on the next visit). Spot-check a real scan.
- Sentry `glutenornot-mobile`: watch for any new error-level issues after release.
- PostHog: after a real scan from an **updated** install, confirm the `scan` event
  now reports `platform: ios` (older installs keep showing `platform: unknown`
  until users update — that's expected).

---

## Notes / known quirks
- `mobile/ios/` is gitignored and regenerated by `prebuild` — never commit it.
- The `MARKETING_VERSION = 1.0` reset (step 4a) bites on **every** prebuild — don't skip it.
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
- **"Upload completed with warnings → Upload Symbols Failed" (step 5, benign).**
  Xcode can't find dSYMs for the prebuilt `React`, `ReactNativeDependencies`, and
  `hermes` frameworks. Expected for RN prebuilt — the upload still succeeds, click
  **Done**. It doesn't affect Sentry symbolication (Sentry gets its symbols from the
  step-0 token during the build, not from Apple).
