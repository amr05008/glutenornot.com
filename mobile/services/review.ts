import * as StoreReview from 'expo-store-review';
import { getHasPromptedReview, setHasPromptedReview } from './storage';

// Ask only once the app has proven useful (3 successful scans), and only once
// per install — iOS caps prompts at 3/year anyway and may silently drop them,
// so re-asking mostly burns quota.
export const REVIEW_SCAN_THRESHOLD = 3;
// Let the user read the verdict before the sheet appears.
export const REVIEW_PROMPT_DELAY_MS = 2000;

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
    return true;
  } catch {
    return false;
  }
}
