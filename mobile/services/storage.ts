import AsyncStorage from '@react-native-async-storage/async-storage';

const LIFETIME_SCAN_COUNT_KEY = 'glutenornot_lifetime_scan_count';

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
