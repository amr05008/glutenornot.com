# iOS Release Runbook

Step-by-step to build and ship a new iOS version. Mirrors the proven
**local Xcode archive** flow (same as v1.1.1). Web deploys automatically from
`main` via Vercel — this doc is iOS-only.

---

## ⚡ Current pickup: shipping the V2 "Clinic" redesign

The V2 redesign is merged to `main` (web is already live). The iOS app still
needs a build. **You're on the Xcode machine now — work through the steps below.**

- Suggested version bump: **1.1.1 → 1.2.0** (full visual redesign, no API changes).
- The new app icon is already committed (`mobile/assets/icon.png`) and ships in the
  build automatically — no manual icon upload, Xcode flattens the alpha channel.
- The 4 new App Store screenshots are committed at **`mobile/store-assets/appstore/`**
  (you have them after `git pull` — no file transfer needed). See the README there.
- Web is already live — the redesign auto-deployed from `main` and is confirmed
  serving at glutenornot.com.

---

## 0. Prerequisites (one-time per machine)

- Xcode installed + signed in with the Apple Developer team.
- Node + the repo cloned; `cd mobile`.
- **`SENTRY_AUTH_TOKEN` exported in your shell** — required so `prebuild` uploads
  source maps. Check with `echo $SENTRY_AUTH_TOKEN`. If empty, get a token from
  Sentry (Settings → Auth Tokens) and `export SENTRY_AUTH_TOKEN=...` (add to
  `~/.zshrc` to persist). Without it the build still succeeds but ships without
  source maps (Sentry stack traces stay minified).

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
npm test             # jest — should be 12/12
```

## 2. Smoke test (do this BEFORE the release build)

Native modules (`react-native-svg`, `expo-camera`, Sentry) mean **Expo Go won't
work** — you need a dev build:

```bash
npx expo run:ios            # builds + runs a dev build in the iOS simulator
# npx expo run:ios --device # use a physical device for the live camera + barcode
```

Verify in the **simulator**:
- [ ] Type renders as **Hanken Grotesk** (geometric sans), not the system font.
- [ ] Launch shows the **dark splash** (#121211) with the reticle icon.
- [ ] **Capture** screen: dark viewfinder + corner brackets, shutter + library buttons.
      (Camera feed is black in the simulator — that's expected.)
- [ ] Pick a photo via the library button → **Reading** → **Result**: full-bleed
      verdict band + white sheet (source chip, flagged rows, confidence meter).
- [ ] A menu photo → **tally + grouped dishes**.
- [ ] Airplane mode → **Offline** screen; a blurry/unreadable photo → **Couldn't read** screen.

Verify on a **physical device** (camera doesn't exist in the simulator):
- [ ] Live camera feed + the **shutter** capture path.
- [ ] **Barcode** auto-detection.

## 3. Bump the version

Edit `mobile/app.json`:

```jsonc
"version": "1.2.0",   // was 1.1.1
```

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

## 7. Post-release sanity (browser, optional)

- Confirm the live web app shows the redesign (hard-refresh; the service worker
  updates on the next visit). Spot-check a real scan.
- Sentry `glutenornot-mobile`: watch for any new error-level issues after release.

---

## Notes / known quirks
- `mobile/ios/` is gitignored and regenerated by `prebuild` — never commit it.
- The `MARKETING_VERSION = 1.0` reset (step 4a) bites on **every** prebuild — don't skip it.
- `eas.json` has build profiles, but the proven release path is the local Xcode
  archive above. (EAS production builds are an alternative, not required.)
