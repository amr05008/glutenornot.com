jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getLifetimeScanCount,
  incrementLifetimeScanCount,
  getHasPromptedReview,
  setHasPromptedReview,
} from '../storage';

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

describe('review prompt flag', () => {
  it('defaults to false', async () => {
    expect(await getHasPromptedReview()).toBe(false);
  });

  it('is true after being set', async () => {
    await setHasPromptedReview();
    expect(await getHasPromptedReview()).toBe(true);
  });
});
