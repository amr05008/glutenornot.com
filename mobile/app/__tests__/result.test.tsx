import React from 'react';
import { render, act } from '@testing-library/react-native';

// --- Mocks ---

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: () => inset,
  };
});

jest.mock('../../services/review', () => ({
  maybeRequestReview: jest.fn().mockResolvedValue(false),
  REVIEW_PROMPT_DELAY_MS: 2000,
}));

jest.mock('../../services/errorReporting', () => ({
  reportError: jest.fn(),
}));

import ResultScreen from '../result';
import { maybeRequestReview } from '../../services/review';

const mockMaybeRequestReview = maybeRequestReview as jest.Mock;

const SAFE_RESULT = JSON.stringify({
  mode: 'label',
  verdict: 'safe',
  flagged_ingredients: [],
  allergen_warnings: [],
  explanation: 'No gluten ingredients found.',
  confidence: 'high',
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ResultScreen review prompt', () => {
  it('asks for a review (after the delay) when a successful result is shown', () => {
    mockParams = { result: SAFE_RESULT, scanCount: '3' };
    render(<ResultScreen />);

    expect(mockMaybeRequestReview).not.toHaveBeenCalled(); // not before the delay

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockMaybeRequestReview).toHaveBeenCalledWith(3);
  });

  it('does not ask when there is no result payload', () => {
    mockParams = {};
    render(<ResultScreen />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it('does not ask when the result payload is invalid', () => {
    mockParams = { result: 'not json', scanCount: '5' };
    render(<ResultScreen />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it('does not ask when the result was reopened from history (stale moment, not a fresh scan)', () => {
    mockParams = { result: SAFE_RESULT, scanCount: '10', fromHistory: '1' };
    render(<ResultScreen />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });

  it('does not ask if the screen closes before the delay elapses', () => {
    mockParams = { result: SAFE_RESULT, scanCount: '3' };
    const { unmount } = render(<ResultScreen />);

    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockMaybeRequestReview).not.toHaveBeenCalled();
  });
});
