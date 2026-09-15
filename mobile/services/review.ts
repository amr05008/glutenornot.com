import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import { getHasPromptedReview, setHasPromptedReview } from './storage';
import { sendReviewBeacon } from './api';

// Ask only once the app has proven useful (3 successful scans), and only once
// per install — iOS caps prompts at 3/year anyway and may silently drop them,
// so re-asking mostly burns quota.
export const REVIEW_SCAN_THRESHOLD = 3;
// Let the user read the verdict before the sheet appears.
export const REVIEW_PROMPT_DELAY_MS = 2000;
// The App Store compose sheet for this app. Unlike the system prompt it always
// opens, yields a *written* review, and is not subject to Apple's three-asks-
// per-year throttle. A plain link, no incentive, no gating on a rating —
// Apple 5.6.4 forbids custom review *prompts*, not links to the store.
export const APP_STORE_WRITE_REVIEW_URL = 'https://apps.apple.com/app/id6758594582?action=write-review';

/**
 * Ask for a native App Store rating if this scan earned it.
 * Returns whether the prompt was actually requested. Must never throw or
 * surface an error — a rating ask can't be allowed to break a result screen.
 */
export async function maybeRequestReview(lifetimeScanCount: number): Promise<boolean> {
  try {
    if (lifetimeScanCount < REVIEW_SCAN_THRESHOLD) return false;
    if (await getHasPromptedReview()) return false;
    if (!(await StoreReview.isAvailableAsync())) return false;

    // Flag before the native call: if it fails once we'd rather stay silent
    // forever than retry on every subsequent scan.
    await setHasPromptedReview();
    await StoreReview.requestReview();
    // Only after the native call resolved: that is the one fact the app can
    // know (the sheet's fate is Apple's alone). TestFlight never gets here
    // (`isAvailableAsync` is false there). Simulator and Xcode-installed dev
    // builds DO get here — the runbook gives smoke builds an `-rc` version so
    // the read can exclude them.
    try {
      sendReviewBeacon('requested');
    } catch {
      // Telemetry never breaks the ask.
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the App Store's write-a-review sheet for this app. Beacons only once
 * iOS accepted the URL — a tap that went nowhere is not intent we can
 * measure. (iOS accepts almost any https URL, so this is a floor on taps, not
 * proof the compose sheet opened.) Never throws.
 */
export async function openWriteReview(): Promise<void> {
  try {
    await Linking.openURL(APP_STORE_WRITE_REVIEW_URL);
    sendReviewBeacon('store_opened');
  } catch {
    // The App Store could not be opened (or the beacon failed) — nothing to do.
  }
}
