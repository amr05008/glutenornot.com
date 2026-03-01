import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// --- Mocks ---

const mockTakePictureAsync = jest.fn();
jest.mock('expo-camera', () => {
  const { forwardRef, useEffect, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  return {
    CameraView: forwardRef(({ onCameraReady, ...props }: any, ref: any) => {
      useEffect(() => { onCameraReady?.(); }, []);
      useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));
      return <View testID="camera-view" {...props} />;
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({
    base64: 'mock-base64-image-data',
    uri: 'file://mock-manipulated.jpg',
  }),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Keep APIError real, only mock the async functions
jest.mock('../../services/api', () => {
  const actual = jest.requireActual('../../services/api');
  return {
    ...actual,
    analyzeImage: jest.fn(),
    lookupBarcode: jest.fn(),
  };
});

jest.mock('../../services/errorReporting', () => ({
  reportError: jest.fn(),
}));
jest.mock('../../services/storage', () => ({
  incrementLifetimeScanCount: jest.fn().mockResolvedValue(1),
}));

import CameraScreen from '../index';
import { analyzeImage, APIError } from '../../services/api';

const mockAnalyzeImage = analyzeImage as jest.MockedFunction<typeof analyzeImage>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  mockTakePictureAsync.mockResolvedValue({ uri: 'file://test-photo.jpg' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CameraScreen error flow', () => {
  it('shows Toast with OCR error message after failed scan', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text. Try getting the ingredients or menu in focus.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read the text. Try getting the ingredients or menu in focus.")).toBeTruthy();
    });
  });

  it('keeps capture button visible and enabled while Toast is showing', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read the text.")).toBeTruthy();
    });

    const captureButton = getByLabelText('Capture photo of ingredients');
    expect(captureButton).toBeTruthy();
  });

  it('dismisses Toast when tapped, leaving camera controls intact', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByRole, queryByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read the text.")).toBeTruthy();
    });

    // Tap the Toast to dismiss
    await act(async () => {
      fireEvent.press(getByRole('alert'));
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    // Toast should be gone
    expect(queryByText("Couldn't read the text.")).toBeNull();

    // Capture button should still be there
    expect(getByLabelText('Capture photo of ingredients')).toBeTruthy();
  });

  it('clears previous Toast when user takes another photo', async () => {
    mockAnalyzeImage
      .mockRejectedValueOnce(
        new APIError("Couldn't read the text.", 'ocr_failed')
      )
      .mockResolvedValueOnce({
        mode: 'label' as const,
        verdict: 'safe' as const,
        flagged_ingredients: [],
        allergen_warnings: [],
        explanation: 'No gluten found',
        confidence: 'high' as const,
      });

    const { getByLabelText, getByText, queryByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read the text.")).toBeTruthy();
    });

    // Take another photo — Toast should clear
    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    expect(queryByText("Couldn't read the text.")).toBeNull();
  });

  it('uses Toast (not Alert) for OCR errors', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read the text.")).toBeTruthy();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
