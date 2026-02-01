---
date: 2026-01-31
summary: Converted daily scan counter to persistent lifetime counter on both web and mobile
tags: [feature, storage, web, mobile]
---

## Summary

Converted the web app's daily scan counter to a lifetime counter that persists forever, and added the same feature to the mobile app. Each platform tracks its own local count independently using localStorage (web) and AsyncStorage (mobile).

## Changes

- `web/js/app.js` - Simplified storage keys and logic:
  - Removed `SCAN_DATE_KEY` (no longer needed for daily reset)
  - Renamed `SCAN_COUNT_KEY` to `LIFETIME_SCAN_COUNT_KEY`
  - Removed `getTodayString()` function
  - Simplified `getScanCount()` and `incrementScanCount()` to just read/write without date logic

- `web/js/ui.js` - Updated display text:
  - Changed "X scans today" → "X scans" / "1 scan"
  - Removed unnecessary "0 scans today" special case

- `mobile/package.json` - Added `@react-native-async-storage/async-storage` dependency

- `mobile/services/storage.ts` - Created new file:
  - `getLifetimeScanCount()` - Read count from AsyncStorage
  - `incrementLifetimeScanCount()` - Increment and return new count

- `mobile/app/index.tsx` - Added increment call:
  - Import and call `incrementLifetimeScanCount()` after successful API response
  - Pass scan count to result screen via route params

- `mobile/app/result.tsx` - Display counter in footer:
  - Parse `scanCount` from route params
  - Show "X scans" text below the "Scan Another" button

## Decisions

- **Separate counters per platform**: Web and mobile track independently (no sync). This is simpler and works without user accounts.
- **No migration**: New key name means existing web users start at 0. Acceptable since this is a new feature.
- **Count passed via route params**: Mobile passes the new count to result screen to avoid async read on mount.

## Notes

- All 31 existing tests pass
- TypeScript compiles cleanly
- Milestone celebration feature (toast at 10, 50, 100 scans) was noted as optional and skipped for this implementation
