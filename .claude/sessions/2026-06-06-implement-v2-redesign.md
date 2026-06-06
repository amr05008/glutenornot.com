---
date: 2026-06-06
summary: Implemented the "Direction A · Clinic" V2 redesign across both web and iOS, presentation-only
tags: [redesign, design-tokens, web, mobile, fonts, svg]
---

## Summary
Implemented the full V2 design refresh ("Direction A · Clinic") from the
`GlutenOrNot - V2 Designs/` handoff package across both surfaces. Stripped the
teal brand entirely — the only saturated color is now the verdict (green/amber/red)
— wired the design-token contract into both apps, added Hanken Grotesk + JetBrains
Mono, replaced emoji glyphs with custom SVG marks (scan reticle, 3-dot verdict
scale, line-icon set), and rebuilt every screen to the type-led, full-bleed-verdict
layout. All API/OCR/barcode/analysis logic was preserved unchanged.

## Changes
**Mobile (Expo / RN)**
- `constants/theme.ts` (new) — token contract copied verbatim from handoff/theme.ts.
- `constants/verdicts.ts` — dropped `BRAND_COLORS`/`VERDICT_CONFIG`; re-exports `Verdict`/`verdictColors` from theme; added `VERDICT_META` (word + glyph) and `CONFIDENCE_LEVEL`.
- `constants/fonts.ts` (new) — `fontMap` for `useFonts`, plus `sans()`/`mono()`/`typo()` helpers mapping token weights to @expo-google-fonts per-weight family names.
- `components/Icon.tsx` (new) — `Icon` (13 glyphs), `Reticle`, `VerdictDots` via react-native-svg.
- `components/StateScreen.tsx` (new) — centered system-state screen (permission/offline/couldn't-read).
- Rebuilt `_layout.tsx` (font gating, headerless), `index.tsx` (dark viewfinder + reticle corners + new controls; `ocr_failed`→Couldn't-read screen, `network`→Offline screen), `ResultCard.tsx` (verdict band + sheet + source chip + confidence meter + rows), `MenuResultCard.tsx` (tally + grouped dishes + server note), `LoadingSpinner.tsx` (dark reading state), `Toast.tsx`, `result.tsx` (thin router).
- Updated `app/__tests__/index.test.tsx` to assert the new Couldn't-read state flow (was Toast-based); added safe-area-context mock.
- Deps: `react-native-svg`, `expo-font`, `expo-asset`, `@expo-google-fonts/hanken-grotesk`, `@expo-google-fonts/jetbrains-mono` (app.json plugins for expo-font/expo-asset).

**Web (vanilla PWA)**
- `css/styles.css` — replaced `:root` with the full `--gon-*` token contract; rebuilt every component (topbar, upload, reading, contained verdict card, system states, footer, modal). Verdict color is scoped per `.result-card.{verdict}` via local custom props.
- `index.html` — new markup + Google Fonts link + inline SVG marks; preserved all element IDs the JS reads/writes.
- `js/ui.js` — `showResult` builds new band/rows/meter markup, sets verdict class, injects glyph SVG; dropped thumbnail. `js/config.js` — glyph names instead of emoji.
- `privacy-policy.html` — migrated shared inline styles + header to the new tokens (it shares styles.css).
- `manifest.json` — theme/background color → `#FCFBF9`.

## Decisions
- **Mobile icons**: added react-native-svg and ported the marks natively (vs. keeping emoji) — needed for the reticle/verdict-scale fidelity.
- **Error states**: `ocr_failed` and `network` now route to full-screen StateScreens (offline auto-recovers on web); transient barcode guidance (`not_found`/`invalid_input`) stays a Toast; `timeout`/`rate_limit`/`server_error` keep the Alert. Detection logic unchanged — only surfaces changed.
- **Fonts**: weighted family names (`HankenGrotesk_700Bold` etc.) require explicit fontFamily per weight in RN; `fonts.ts` helpers encapsulate that.

## Notes
- Verified: mobile `tsc` clean, mobile jest 11/11, web vitest 65/65; web upload/unsafe/caution/error states confirmed in-browser via Playwright (faithful to mockup, no teal).
- **Not yet done**: run the mobile app on a device/simulator to confirm fonts load + camera flow visually (code verified, runtime not). App Store link wired: web "Get the iOS app" pill + result-footer mention → live listing (id6758594582).

New **dark-reticle icon** wired in both surfaces (assets from `GlutenOrNot - V2 Designs/assets/appicon/`): web favicon/PWA (`icon-180`/`icon-1024.png`, old teal `icon.svg` deleted), mobile app/adaptive/splash (`mobile/assets/*.png`), and the teal splash/adaptive backgrounds → `#121211`. Bumped service-worker `CACHE_NAME` v2→v3 so returning PWA users get the redesigned shell instead of stale cache.

Still manual (HANDOFF §7): upload alpha-flattened `icon-1024` + the 4 App Store screenshots (`.../assets/appstore/`) to App Store Connect; a dedicated mark+wordmark splash asset (app icon stands in for now); Recents/history + dark mode undesigned. Mobile still needs an on-device `expo start --ios` smoke test before a build.
