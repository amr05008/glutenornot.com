import AsyncStorage from '@react-native-async-storage/async-storage';

const LIFETIME_SCAN_COUNT_KEY = 'glutenornot_lifetime_scan_count';
const REVIEW_PROMPTED_KEY = 'glutenornot_review_prompted';

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
