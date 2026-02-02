---
date: 2026-02-01
summary: Rebranded web and mobile apps from green to teal color scheme
tags: [branding, design, colors, css]
---

## Summary

Implemented full rebrand of GlutenOrNot from green (#2d7d46) to teal (#0D9488) color scheme across web and mobile apps. Updated logos to lowercase with mint accent, added tagline, created new leaf icon, and ensured verdict colors remain semantically distinct.

## Changes

### Web (5 files)
- `web/css/styles.css` - Updated CSS variables to new teal palette, changed header to teal background with white text, added `.tagline` styling
- `web/index.html` - Updated theme-color, logo to lowercase, added tagline
- `web/manifest.json` - Updated theme_color to #0D9488
- `web/privacy-policy.html` - Updated theme-color, logo to lowercase
- `web/assets/icons/icon.svg` - New leaf-based icon design in teal

### Mobile (6 files)
- `mobile/constants/verdicts.ts` - Added BRAND_COLORS export, updated safe verdict color to #16A34A
- `mobile/app/_layout.tsx` - Header background uses BRAND_COLORS.primary
- `mobile/app/index.tsx` - Permission button uses BRAND_COLORS.primary
- `mobile/app/result.tsx` - "Scan Another" button uses BRAND_COLORS.primary
- `mobile/components/LoadingSpinner.tsx` - Spinner uses BRAND_COLORS.primary
- `mobile/app.json` - Splash and adaptive icon backgrounds updated to #0D9488

### Assets
- `mobile/assets/icon.png` - Generated from new SVG
- `mobile/assets/adaptive-icon.png` - Generated from new SVG
- `mobile/assets/splash-icon.png` - Generated from new SVG
- `mobile/assets/favicon.png` - Generated from new SVG

## Decisions

### Color palette
| Purpose | Old | New |
|---------|-----|-----|
| Primary | #2d7d46 | #0D9488 (teal) |
| Primary Dark | #236339 | #0F766E |
| Accent | #2d7d46 | #5EEAD4 (mint) |
| Text | #1f2937 | #0F172A (navy) |

### Verdict colors (kept distinct from brand)
- **Safe**: #16A34A / bg #DCFCE7 (green, distinct from teal)
- **Caution**: #F59E0B / bg #FEF3C7 (amber, unchanged)
- **Unsafe**: #DC2626 / bg #FEE2E2 (red, unchanged)

### Mobile architecture
Added `BRAND_COLORS` constant to `verdicts.ts` for centralized theming. All components import this constant instead of hardcoding colors, making future color changes easier.

## Verification

Run to verify:
```bash
# Web
npx vercel dev

# Mobile
cd mobile && npx expo start
```

Check:
- Header is teal with white lowercase "glutenornot" logo
- "or" highlighted in mint (#5EEAD4)
- Tagline visible on web
- Safe verdict shows green (not teal)
- Buttons are teal
