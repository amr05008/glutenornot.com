---
date: 2026-06-07
summary: Make iOS verdict band full-bleed so titleless scans have no empty top void
tags: [mobile, ios, design, result-card]
---

## Summary
Fixed the visible empty space above the verdict on the iOS result screen when a
scan returns no product title. The card reserved a white top strip to host a
centered product name; photo/label scans rarely return a `product_name`, so that
strip collapsed to dead space stacked above the band's own top padding — a void
above the verdict (caught live-testing the v1.2.0 public build).

## Changes
- `mobile/components/ResultCard.tsx`:
  - Removed the white top strip. Verdict band now runs **full-bleed** to the top
    of the modal sheet (`paddingTop: insets.top + space[10]`).
  - Close **X** floats as an absolute overlay on the band; icon/border use the
    verdict `on`-color (`v.on` / existing `iconBorder`) so it stays legible on
    amber caution as well as green/red.
  - Product name (present mainly on the barcode path) moved out of the dead top
    bar into the sheet as a proper 22px title under the source chip; renders only
    when present, so photo/label scans show nothing there.

## Decisions
- Chose full-bleed band over "collapse the strip" — leans into the design's own
  "LOUD full-bleed verdict band" intent and kills the title/no-title reflow.
- `MenuResultCard` left untouched: no loud band, always falls back to a "Menu"
  title, so it never hits the void.
- No status-bar work needed: `result` is `presentation: 'modal'` (`_layout.tsx`),
  so the band sits under the sheet's rounded top, not the device notch — status
  bar stays owned by the camera screen behind it.

## Notes
- Committed `e98e227` (ResultCard only). Unrelated `api/barcode.js` work-in-progress
  left untouched (separate agent session).
- Presentation-only RN change: **requires a new iOS build** to reach users — no
  OTA path in this repo. Bundle into the next release changelog.
- Not yet eyeballed in sim/device; verify X contrast on an amber caution result
  and under-notch spacing on next build.
