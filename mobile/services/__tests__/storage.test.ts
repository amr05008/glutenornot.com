jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getLifetimeScanCount,
  incrementLifetimeScanCount,
  getHasPromptedReview,
  setHasPromptedReview,
  addRecentScan,
  getRecentScans,
  clearRecentScans,
  RECENT_SCANS_CAP,
} from '../storage';
import type { AnalysisResult } from '../../constants/verdicts';

function makeResult(explanation: string): AnalysisResult {
  return {
    mode: 'label',
    verdict: 'safe',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation,
    confidence: 'high',
  };
}

beforeEach(() => {
  (AsyncStorage as any).clear();
});

describe('lifetime scan count', () => {
  it('defaults to 0', async () => {
    expect(await getLifetimeScanCount()).toBe(0);
  });

  it('increments and persists', async () => {
    expect(await incrementLifetimeScanCount()).toBe(1);
    expect(await incrementLifetimeScanCount()).toBe(2);
    expect(await getLifetimeScanCount()).toBe(2);
  });
});

describe('recent scans', () => {
  it('starts empty', async () => {
    expect(await getRecentScans()).toEqual([]);
  });

  it('stores newest first', async () => {
    await addRecentScan(makeResult('first'));
    await addRecentScan(makeResult('second'));
    const scans = await getRecentScans();
    expect(scans).toHaveLength(2);
    expect(scans[0].result.explanation).toBe('second');
    expect(scans[1].result.explanation).toBe('first');
    expect(typeof scans[0].savedAt).toBe('number');
  });

  it(`keeps only the newest ${RECENT_SCANS_CAP} scans`, async () => {
    for (let i = 0; i < RECENT_SCANS_CAP + 5; i++) {
      await addRecentScan(makeResult(`scan-${i}`));
    }
    const scans = await getRecentScans();
    expect(scans).toHaveLength(RECENT_SCANS_CAP);
    expect(scans[0].result.explanation).toBe(`scan-${RECENT_SCANS_CAP + 4}`); // newest kept
  });

  it('returns [] instead of throwing on corrupt stored data', async () => {
    await AsyncStorage.setItem('glutenornot_recent_scans', 'not json {');
    expect(await getRecentScans()).toEqual([]);

    await AsyncStorage.setItem('glutenornot_recent_scans', '{"not":"an array"}');
    expect(await getRecentScans()).toEqual([]);
  });

  it('never throws when the storage write fails (a history write must not break a scan)', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(addRecentScan(makeResult('x'))).resolves.toBeUndefined();
  });

  it('drops malformed entries instead of letting them reach the screen', async () => {
    const good = { savedAt: 123, result: makeResult('good') };
    const mixed = [
      null,
      {},
      { savedAt: 'not a number', result: makeResult('bad ts') },
      { savedAt: 456 }, // no result
      { savedAt: 789, result: { ...makeResult('bad verdict'), verdict: 'maybe' } },
      good,
    ];
    await AsyncStorage.setItem('glutenornot_recent_scans', JSON.stringify(mixed));
    const scans = await getRecentScans();
    expect(scans).toEqual([good]);
  });

  it('clearRecentScans never throws when storage fails', async () => {
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(clearRecentScans()).resolves.toBeUndefined();
  });

  it('clearRecentScans empties the list', async () => {
    await addRecentScan(makeResult('x'));
    await clearRecentScans();
    expect(await getRecentScans()).toEqual([]);
  });
});

describe('review prompt flag', () => {
  it('defaults to false', async () => {
    expect(await getHasPromptedReview()).toBe(false);
  });

  it('is true after being set', async () => {
    await setHasPromptedReview();
    expect(await getHasPromptedReview()).toBe(true);
  });
});
