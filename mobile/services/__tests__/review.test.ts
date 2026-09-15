jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));
jest.mock('../storage', () => ({
  getHasPromptedReview: jest.fn(),
  setHasPromptedReview: jest.fn(),
}));
jest.mock('../api', () => ({
  sendReviewBeacon: jest.fn(),
}));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
}));

import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import { maybeRequestReview, openWriteReview, APP_STORE_WRITE_REVIEW_URL, REVIEW_SCAN_THRESHOLD } from '../review';
import { getHasPromptedReview, setHasPromptedReview } from '../storage';
import { sendReviewBeacon } from '../api';

const mockIsAvailable = StoreReview.isAvailableAsync as jest.Mock;
const mockRequestReview = StoreReview.requestReview as jest.Mock;
const mockGetPrompted = getHasPromptedReview as jest.Mock;
const mockSetPrompted = setHasPromptedReview as jest.Mock;
const mockBeacon = sendReviewBeacon as jest.Mock;
const mockOpenURL = Linking.openURL as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockBeacon.mockReset(); // clearAllMocks keeps implementations; a throwing beacon must not leak
  mockIsAvailable.mockResolvedValue(true);
  mockRequestReview.mockResolvedValue(undefined);
  mockGetPrompted.mockResolvedValue(false);
  mockSetPrompted.mockResolvedValue(undefined);
  mockOpenURL.mockResolvedValue(true);
});

describe('maybeRequestReview', () => {
  it('requests a review at the scan threshold and records that it asked', async () => {
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD)).resolves.toBe(true);
    expect(mockRequestReview).toHaveBeenCalled();
    expect(mockSetPrompted).toHaveBeenCalled();
  });

  it('beacons `requested` only after the native request RESOLVED — not merely after it was called', async () => {
    let resolveNative!: () => void;
    mockRequestReview.mockReturnValue(new Promise<void>((resolve) => { resolveNative = resolve; }));

    const pending = maybeRequestReview(REVIEW_SCAN_THRESHOLD);
    await new Promise((r) => setTimeout(r, 0)); // drain the storage/availability awaits up to the native call
    expect(mockRequestReview).toHaveBeenCalled();
    expect(mockBeacon).not.toHaveBeenCalled(); // native still pending → no beacon yet

    resolveNative();
    await expect(pending).resolves.toBe(true);
    expect(mockBeacon).toHaveBeenCalledTimes(1);
    expect(mockBeacon).toHaveBeenCalledWith('requested');
  });

  it('does not beacon below the threshold or when already asked', async () => {
    await maybeRequestReview(REVIEW_SCAN_THRESHOLD - 1);
    mockGetPrompted.mockResolvedValue(true);
    await maybeRequestReview(REVIEW_SCAN_THRESHOLD);
    expect(mockBeacon).not.toHaveBeenCalled();
  });

  it('does not beacon on TestFlight (native UI unavailable) — that ask never reached iOS', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await maybeRequestReview(REVIEW_SCAN_THRESHOLD);
    expect(mockBeacon).not.toHaveBeenCalled();
  });

  it('does not beacon when the native call throws — nothing was handed to iOS', async () => {
    mockRequestReview.mockRejectedValue(new Error('no window scene'));
    await maybeRequestReview(REVIEW_SCAN_THRESHOLD);
    expect(mockBeacon).not.toHaveBeenCalled();
  });

  it('still returns true when the beacon itself throws — telemetry never breaks the ask', async () => {
    mockBeacon.mockImplementationOnce(() => { throw new Error('boom'); });
    await expect(maybeRequestReview(REVIEW_SCAN_THRESHOLD)).resolves.toBe(true);
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

describe('openWriteReview', () => {
  it('opens the App Store compose sheet and beacons store_opened', async () => {
    await openWriteReview();
    expect(mockOpenURL).toHaveBeenCalledWith(APP_STORE_WRITE_REVIEW_URL);
    expect(mockBeacon).toHaveBeenCalledWith('store_opened');
  });

  it('deep-links to the write-review action for this app id', () => {
    expect(APP_STORE_WRITE_REVIEW_URL).toBe('https://apps.apple.com/app/id6758594582?action=write-review');
  });

  it('never throws when the App Store cannot be opened, and does not beacon a tap that went nowhere', async () => {
    mockOpenURL.mockRejectedValue(new Error('no handler'));
    await expect(openWriteReview()).resolves.toBeUndefined();
    expect(mockBeacon).not.toHaveBeenCalled();
  });
});
