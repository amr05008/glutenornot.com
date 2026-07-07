jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));
jest.mock('../storage', () => ({
  getHasPromptedReview: jest.fn(),
  setHasPromptedReview: jest.fn(),
}));

import * as StoreReview from 'expo-store-review';
import { maybeRequestReview, REVIEW_SCAN_THRESHOLD } from '../review';
import { getHasPromptedReview, setHasPromptedReview } from '../storage';

const mockIsAvailable = StoreReview.isAvailableAsync as jest.Mock;
const mockRequestReview = StoreReview.requestReview as jest.Mock;
const mockGetPrompted = getHasPromptedReview as jest.Mock;
const mockSetPrompted = setHasPromptedReview as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  mockRequestReview.mockResolvedValue(undefined);
  mockGetPrompted.mockResolvedValue(false);
  mockSetPrompted.mockResolvedValue(undefined);
});

describe('maybeRequestReview', () => {
  it('requests a review at the scan threshold and records that it asked', async () => {
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD)).resolves.toBe(true);
    expect(mockRequestReview).toHaveBeenCalled();
    expect(mockSetPrompted).toHaveBeenCalled();
  });

  it('does nothing below the scan threshold', async () => {
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD - 1)).resolves.toBe(false);
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(mockSetPrompted).not.toHaveBeenCalled();
  });

  it('asks at most once per install', async () => {
    mockGetPrompted.mockResolvedValue(true);
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD + 10)).resolves.toBe(false);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('does nothing when the native review UI is unavailable, and does not burn the once-ever flag', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD)).resolves.toBe(false);
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(mockSetPrompted).not.toHaveBeenCalled();
  });

  it('records the attempt even if the native call fails, and never throws', async () => {
    mockRequestReview.mockRejectedValue(new Error('SKStoreReviewController unavailable'));
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD)).resolves.toBe(false);
    expect(mockSetPrompted).toHaveBeenCalled();
  });

  it('never throws when storage itself fails', async () => {
    mockGetPrompted.mockRejectedValue(new Error('disk full'));
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD)).resolves.toBe(false);
  });
});
