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

jest.mock('../../services/recovery', () => ({
  sendRecoveryEvent: jest.fn(() => true),
}));

import ResultScreen from '../result';
import { maybeRequestReview } from '../../services/review';
import { sendRecoveryEvent } from '../../services/recovery';

const mockMaybeRequestReview = maybeRequestReview as jest.Mock;
const mockSendRecoveryEvent = sendRecoveryEvent as jest.Mock;

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

describe('ResultScreen recovery funnel (plans/barcode-recovery-2026-09-05.md)', () => {
  const FLOW = '9f1c2c9e-3f0a-4d1b-8e6a-2b7f0c5d9e11';
  const LABEL = JSON.stringify({
    mode: 'label',
    verdict: 'caution',
    flagged_ingredients: ['oats'],
    allergen_warnings: [],
    explanation: 'SENTINEL_EXPLANATION oats without certification.',
    confidence: 'medium',
    product_name: 'SENTINEL_PRODUCT',
  });
  const MENU = JSON.stringify({
    mode: 'menu',
    verdict: 'caution',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: 'Menu.',
    confidence: 'low',
    menu_items: [{ name: 'SENTINEL_DISH', verdict: 'safe', notes: '' }],
  });

  it('beacons result_displayed on mount for a fresh, valid result that completes a flow — bounded fields only', () => {
    mockParams = { result: LABEL, scanCount: '4', recoveryFlowId: FLOW, recoveryReason: 'not_found' };
    render(<ResultScreen />);

    expect(mockSendRecoveryEvent).toHaveBeenCalledTimes(1);
    expect(mockSendRecoveryEvent).toHaveBeenCalledWith(FLOW, 'not_found', 'result_displayed', {
      resultMode: 'label',
      verdict: 'caution',
      confidence: 'medium',
    });
    expect(JSON.stringify(mockSendRecoveryEvent.mock.calls)).not.toContain('SENTINEL');
    // Normal result behavior is unchanged: the review prompt still runs
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockMaybeRequestReview).toHaveBeenCalledWith(4);
  });

  it('tracks a menu result as a menu — not a successful label recovery', () => {
    mockParams = { result: MENU, scanCount: '1', recoveryFlowId: FLOW, recoveryReason: 'missing_context' };
    render(<ResultScreen />);
    expect(mockSendRecoveryEvent).toHaveBeenCalledWith(FLOW, 'missing_context', 'result_displayed', {
      resultMode: 'menu',
      verdict: 'caution',
      confidence: 'low',
    });
  });

  it('omits an unknown confidence rather than shipping junk', () => {
    mockParams = {
      result: JSON.stringify({ ...JSON.parse(LABEL), confidence: 'very' }),
      scanCount: '1', recoveryFlowId: FLOW, recoveryReason: 'not_found',
    };
    render(<ResultScreen />);
    expect(mockSendRecoveryEvent.mock.calls[0][3]).toEqual({ resultMode: 'label', verdict: 'caution' });
  });

  it('does not beacon without recovery metadata (a normal result)', () => {
    mockParams = { result: LABEL, scanCount: '4' };
    render(<ResultScreen />);
    expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
  });

  it('does not beacon for a reopen from Recents, even if stale params somehow rode along', () => {
    mockParams = { result: LABEL, scanCount: '4', fromHistory: '1', recoveryFlowId: FLOW, recoveryReason: 'not_found' };
    render(<ResultScreen />);
    expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
  });

  it('does not beacon for an invalid payload or an unknown reason', () => {
    for (const params of [
      { result: 'not json', scanCount: '1', recoveryFlowId: FLOW, recoveryReason: 'not_found' },
      { result: LABEL, scanCount: '1', recoveryFlowId: FLOW, recoveryReason: 'timeout' },
    ]) {
      mockParams = params;
      render(<ResultScreen />);
    }
    expect(mockSendRecoveryEvent).not.toHaveBeenCalled();
  });
});
