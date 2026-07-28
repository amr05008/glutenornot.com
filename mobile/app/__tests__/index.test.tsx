import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// --- Mocks ---

const mockTakePictureAsync = jest.fn();
// Tests can suppress the automatic onCameraReady (cameraReadyControl.auto =
// false) and fire it by hand (cameraReadyControl.fire()) to probe the
// pre-ready frame of a freshly (re)mounted camera.
const cameraReadyControl: { auto: boolean; fire: () => void } = {
  auto: true,
  fire: () => {},
};
// Tests can flip this to render the screen with camera permission denied.
const permissionControl = { granted: true };
jest.mock('expo-camera', () => {
  const { forwardRef, useEffect, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  return {
    CameraView: forwardRef(({ onCameraReady, ...props }: any, ref: any) => {
      useEffect(() => {
        cameraReadyControl.fire = () => onCameraReady?.();
        if (cameraReadyControl.auto) onCameraReady?.();
      }, []);
      useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePictureAsync,
      }));
      return <View testID="camera-view" {...props} />;
    }),
    useCameraPermissions: () => [{ granted: permissionControl.granted }, jest.fn()],
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
  cameraReadyControl.auto = true;
  permissionControl.granted = true;
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
  it('never pre-sets enableTorch on a freshly remounted camera — waits for onCameraReady', async () => {
    // expo-camera has historically fumbled enableTorch applied at mount time
    // on iOS. The torch must reach the camera as a false→true transition on a
    // live camera (the manual-toggle path), never as a mount-time prop.
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );

    const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

    // The retry remounts the camera; this one never auto-reports ready
    cameraReadyControl.auto = false;
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });

    // Torch requested, but the camera hasn't called back yet → prop must be off
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    // Camera reports ready → still off: on-device testing (1.4.0 TestFlight)
    // showed a transition right at onCameraReady is silently dropped while the
    // native session settles — only a later transition lights the LED.
    await act(async () => {
      cameraReadyControl.fire();
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    // After the settle period the torch flips on — same timing profile as a
    // human reaching for the toggle, the path that provably works.
    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  // Pre-release review 2026-07-27 #8: the 2s camera-ready fallback stamps the
  // settle clock when the FALLBACK fires, not when the native session is
  // actually ready. If onCameraReady is merely slow (>2s), the torch was
  // applied against an unsettled session and silently dropped — the exact bug
  // the 1.4.0 settle fix targeted. The late real ready must re-apply the torch
  // as a fresh false→true transition after a full settle window.
  it('re-applies the torch when the real camera-ready arrives after the 2s fallback', async () => {
    mockAnalyzeImage.mockRejectedValueOnce(
      new APIError("Couldn't read the text.", 'ocr_failed')
    );
    const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Capture photo of ingredients'));
    });
    await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

    // Retry with flashlight; the remounted camera is slow — onCameraReady
    // does not fire before the 2s fallback forces readiness
    cameraReadyControl.auto = false;
    await act(async () => {
      fireEvent.press(getByLabelText('Turn on flashlight & retry'));
    });
    await act(async () => {
      jest.advanceTimersByTime(2000); // fallback forces cameraReady
    });
    await act(async () => {
      jest.advanceTimersByTime(750); // settle window measured from the fallback
    });

    // The real ready arrives now — everything applied so far may have been
    // dropped by the unsettled session, so the torch must go through a fresh
    // false→true transition timed from THIS instant
    await act(async () => {
      cameraReadyControl.fire();
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  it('starts with the torch off and toggles it from the overlay button', async () => {
    const { getByLabelText, getByTestId } = render(<CameraScreen />);

    expect(getByTestId('camera-view').props.enableTorch).toBe(false);

    // Let the camera session settle past the window — a manual toggle on a
    // long-running camera must apply immediately, with no settle lag.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

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

    // Couldn't-read screen gone, capture controls back
    expect(queryByText("Couldn't read that")).toBeNull();
    expect(getByLabelText('Capture photo of ingredients')).toBeTruthy();

    // Torch reaches the camera after the settle window (see settle test)
    await act(async () => {
      jest.advanceTimersByTime(750);
    });
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

    await act(async () => {
      jest.advanceTimersByTime(750);
    });
    expect(getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  // Pre-release review 2026-07-27 #7: the couldn't-read screen is shared by
  // camera captures and photo-library picks, but "Turn on flashlight & retry"
  // is a no-op for a blurry screenshot from the library — and it left the torch
  // on afterwards. Library-sourced failures get a plain "Try again" that never
  // touches the torch.
  describe('couldn\'t-read screen for photo-library picks', () => {
    beforeEach(() => {
      mockLaunchLibrary.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      mockAnalyzeImage.mockRejectedValue(
        new APIError("Couldn't read the text.", 'ocr_failed')
      );
    });

    it('offers a plain "Try again" instead of the flashlight retry', async () => {
      const { getByLabelText, getByText, queryByLabelText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

      expect(queryByLabelText('Turn on flashlight & retry')).toBeNull();
      expect(getByLabelText('Try again')).toBeTruthy();
    });

    it('"Try again" does not turn the torch on', async () => {
      const { getByLabelText, getByText, getByTestId } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());

      await act(async () => {
        fireEvent.press(getByLabelText('Try again'));
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(getByTestId('camera-view').props.enableTorch).toBe(false);
    });

    it('a later camera-capture failure still offers the flashlight retry', async () => {
      const { getByLabelText, getByText } = render(<CameraScreen />);

      // First: a failed library pick
      await act(async () => {
        fireEvent.press(getByLabelText('Upload photo from library'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
      await act(async () => {
        fireEvent.press(getByLabelText('Try again'));
      });

      // Then: a failed camera capture — dim light is plausible again
      await act(async () => {
        fireEvent.press(getByLabelText('Capture photo of ingredients'));
      });
      await waitFor(() => expect(getByText("Couldn't read that")).toBeTruthy());
      expect(getByLabelText('Turn on flashlight & retry')).toBeTruthy();
    });
  });

  // Pre-release review 2026-07-27 #3: the permission gate rendered before the
  // isAnalyzing/systemState branches, so a user who denied camera access and
  // scanned via the photo picker saw the frozen permission screen for the whole
  // analysis, and error states were set but never rendered.
  describe('with camera permission denied (photo-picker scans)', () => {
    beforeEach(() => {
      permissionControl.granted = false;
    });

    it('shows the analyzing spinner while a picked photo is processed', async () => {
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      let resolveAnalyze: (r: any) => void = () => {};
      mockAnalyzeImage.mockReturnValueOnce(new Promise((r) => { resolveAnalyze = r; }) as any);

      const { getByLabelText, getByText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });

      expect(getByText('Reading ingredients…')).toBeTruthy();

      await act(async () => {
        resolveAnalyze({
          mode: 'label',
          verdict: 'safe',
          flagged_ingredients: [],
          allergen_warnings: [],
          explanation: 'All clear.',
          confidence: 'high',
        });
      });
    });

    it("shows the couldn't-read screen when a picked photo fails OCR", async () => {
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      mockAnalyzeImage.mockRejectedValueOnce(
        new APIError("Couldn't read the text.", 'ocr_failed')
      );

      const { getByLabelText, getByText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });

      await waitFor(() => {
        expect(getByText("Couldn't read that")).toBeTruthy();
      });
    });

    it('shows the offline screen when a picked photo hits a network error', async () => {
      mockLaunchLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file://picked.jpg' }],
      } as any);
      mockAnalyzeImage.mockRejectedValueOnce(
        new APIError('Network error. Please check your connection.', 'network')
      );

      const { getByLabelText, getByText } = render(<CameraScreen />);

      await act(async () => {
        fireEvent.press(getByLabelText('Choose a photo instead'));
      });

      await waitFor(() => {
        expect(getByText("You're offline")).toBeTruthy();
      });
    });
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
