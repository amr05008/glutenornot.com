import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnalysisResult } from '../constants/verdicts';

const LIFETIME_SCAN_COUNT_KEY = 'glutenornot_lifetime_scan_count';
const REVIEW_PROMPTED_KEY = 'glutenornot_review_prompted';
const RECENT_SCANS_KEY = 'glutenornot_recent_scans';

// Everything here stays on-device only (no accounts, nothing transmitted) —
// mirrored in the privacy policy's "Information Stored Locally" section.
export const RECENT_SCANS_CAP = 50;

export interface RecentScan {
  savedAt: number;
  result: AnalysisResult;
}

/**
 * Get the lifetime scan count
 */
export async function getLifetimeScanCount(): Promise<number> {
  const count = await AsyncStorage.getItem(LIFETIME_SCAN_COUNT_KEY);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Increment the lifetime scan count and return the new value
 */
export async function incrementLifetimeScanCount(): Promise<number> {
  const current = await getLifetimeScanCount();
  const newCount = current + 1;
  await AsyncStorage.setItem(LIFETIME_SCAN_COUNT_KEY, String(newCount));
  return newCount;
}

/**
 * Shape guard for stored entries. The Recents rows dereference
 * `result.verdict` into color/word maps, so an entry from a corrupt write or
 * a different schema version must be dropped here — not crash the screen
 * (which is where the Clear button lives).
 */
function isValidRecentScan(entry: unknown): entry is RecentScan {
  const e = entry as RecentScan | null;
  return (
    !!e &&
    typeof e.savedAt === 'number' &&
    !!e.result &&
    (e.result.verdict === 'safe' || e.result.verdict === 'caution' || e.result.verdict === 'unsafe')
  );
}

/**
 * Recent scan history, newest first. Returns [] on missing or corrupt data
 * and silently drops malformed entries — a broken history must never take
 * the Recents screen down with it.
 */
export async function getRecentScans(): Promise<RecentScan[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SCANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidRecentScan) : [];
  } catch {
    return [];
  }
}

/**
 * Save a successful scan to history (newest first, capped). Never throws —
 * a failed history write must not break the scan that just succeeded.
 */
export async function addRecentScan(result: AnalysisResult): Promise<void> {
  try {
    const scans = await getRecentScans();
    scans.unshift({ savedAt: Date.now(), result });
    await AsyncStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(scans.slice(0, RECENT_SCANS_CAP)));
  } catch {
    // swallowed by design
  }
}

/**
 * Wipe scan history (the Recents screen's Clear action). Never throws, like
 * the rest of this module.
 */
export async function clearRecentScans(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_SCANS_KEY);
  } catch {
    // swallowed by design — the list re-reads on next mount either way
  }
}

/**
 * Whether we've already asked this install for an App Store rating
 */
export async function getHasPromptedReview(): Promise<boolean> {
  return (await AsyncStorage.getItem(REVIEW_PROMPTED_KEY)) === 'true';
}

/**
 * Record that we've asked for an App Store rating (once per install)
 */
export async function setHasPromptedReview(): Promise<void> {
  await AsyncStorage.setItem(REVIEW_PROMPTED_KEY, 'true');
}
