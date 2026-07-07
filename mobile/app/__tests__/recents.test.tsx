import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// --- Mocks ---

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: () => inset,
  };
});

jest.mock('../../services/storage', () => ({
  getRecentScans: jest.fn(),
  clearRecentScans: jest.fn(),
  getLifetimeScanCount: jest.fn().mockResolvedValue(12),
}));

import RecentsScreen from '../recents';
import { getRecentScans } from '../../services/storage';

const mockGetRecentScans = getRecentScans as jest.Mock;

const BARCODE_SCAN = {
  savedAt: new Date('2026-07-06T12:00:00Z').getTime(),
  result: {
    mode: 'label',
    verdict: 'safe',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: 'All clear.',
    confidence: 'high',
    product_name: 'KIND Peanut Butter Bar',
  },
};

const LABEL_SCAN = {
  savedAt: new Date('2026-07-05T12:00:00Z').getTime(),
  result: {
    mode: 'label',
    verdict: 'unsafe',
    flagged_ingredients: ['wheat flour'],
    allergen_warnings: [],
    explanation: 'Contains wheat flour.',
    confidence: 'high',
  },
};

const MENU_SCAN = {
  savedAt: new Date('2026-07-04T12:00:00Z').getTime(),
  result: {
    mode: 'menu',
    verdict: 'caution',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: '2 safe, 1 caution.',
    confidence: 'medium',
    menu_items: [
      { name: 'Salad', verdict: 'safe', notes: '' },
      { name: 'Pasta', verdict: 'unsafe', notes: '' },
      { name: 'Soup', verdict: 'caution', notes: '' },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecentScans.mockResolvedValue([BARCODE_SCAN, LABEL_SCAN, MENU_SCAN]);
});

describe('RecentsScreen', () => {
  it('renders a row per scan with the right titles', async () => {
    const { getByText } = render(<RecentsScreen />);
    await waitFor(() => {
      expect(getByText('KIND Peanut Butter Bar')).toBeTruthy(); // barcode → product name
      expect(getByText('Ingredient label')).toBeTruthy();       // OCR label → generic title
      expect(getByText('Menu · 3 items')).toBeTruthy();         // menu → item count
    });
  });

  it('re-opens the saved result when a row is tapped', async () => {
    const { getByText } = render(<RecentsScreen />);
    await waitFor(() => expect(getByText('KIND Peanut Butter Bar')).toBeTruthy());

    fireEvent.press(getByText('KIND Peanut Butter Bar'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/result',
      params: expect.objectContaining({
        result: JSON.stringify(BARCODE_SCAN.result),
        fromHistory: '1', // suppresses the rating prompt — this isn't a fresh scan
      }),
    });
  });

  it('shows the empty state when there is no history', async () => {
    mockGetRecentScans.mockResolvedValue([]);
    const { getByText } = render(<RecentsScreen />);
    await waitFor(() => {
      expect(getByText('No scans yet')).toBeTruthy();
    });
  });
});
