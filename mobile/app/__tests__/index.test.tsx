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

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: () => inset,
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
  addRecentScan: jest.fn().mockResolvedValue(undefined),
}));

import CameraScreen from '../index';
import { analyzeImage, APIError } from '../../services/api';
import { addRecentScan } from '../../services/storage';
import * as ImagePicker from 'expo-image-picker';

const mockAnalyzeImage = analyzeImage as jest.MockedFunction<typeof analyzeImage>;
const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;

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

describe('CameraScreen recents integration', () => {
  const SAFE_RESULT = {
    mode: 'label',
    verdict: 'safe',
    flagged_ingredients: [],
    allergen_warnings: [],
    explanation: 'All clear.',
    confidence: 'high',
  };

  it('saves a successful scan to recent history', async () => {
    mockAnalyzeImage.mockResolvedValueOnce(SAFE_RESULT as any);

    const { getByLabelText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    expect(addRecentScan).toHaveBeenCalledWith(SAFE_RESULT);
  });

  it('has a Recents button that opens the history screen', async () => {
    const { getByLabelText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('View recent scans'));
    });

    expect(mockPush).toHaveBeenCalledWith('/recents');
  });
});

describe('CameraScreen torch toggle', () => {
  it('starts with the torch off and toggles it from the overlay button', async () => {
    const { getByLabelText, getByTestId } = render(<CameraScreen />);

    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight'));
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);

    await act(async () => {
      fireEvent.press(getByLabelText('Turn off flashlight'));
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);
  });
});

describe('CameraScreen error flow', () => {
  it('shows the "Couldn\'t read" state screen after a failed OCR scan', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text. Try getting the ingredients or menu in focus.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });
  });

  it('uses the state screen (not Alert) for OCR errors', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('"Turn on flashlight & retry" returns to the camera with the torch on', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByTestId, queryByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    // Primary action pre-enables the torch for the retry (dim light is the
    // likeliest cause of an unreadable label)
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });

    // Couldn't-read screen gone, capture controls back, torch on
    expect(queryByText("Couldn't read that")).toBeNull();
    expect(getByLabelText('Capture photo of ingredients')).toBeTruthy();
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  it('falls back to "Try again" as primary when the torch is already on', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, queryByLabelText } = render(<CameraScreen />);

    // Torch on before scanning
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight'));
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    // Suggesting the flashlight would be nonsense — it's already on
    expect(queryByLabelText('Turn on flashlight & retry')).toBeNull();
    expect(getByLabelText('Try again')).toBeTruthy();
  });

  it('shows the Offline state screen on a network error', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError('Network error. Please check your connection.', 'network')
    );

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("You're offline")).toBeTruthy();
    });
  });

  it('keeps the torch state across retakes within a session', async () => {
    mockAnalyzeImage.mockRejectedValue(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });

    // Second failed capture — torch must still be on when the camera returns
    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByLabelText('Try again'));
    });

    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  it('"Choose a photo instead" opens the image picker', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );
    mockLaunchLibrary.mockResolvedValueOnce({ canceled: true } as any);

    const { getByLabelText, getByText } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });

    await waitFor(() => {
      expect(getByText("Couldn't read that")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByLabelText('Choose a photo instead'));
    });

    expect(mockLaunchLibrary).toHaveBeenCalled();
  });
});
